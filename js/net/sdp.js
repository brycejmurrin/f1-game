/*
 * NetSdp — the invite code's payload, as bytes instead of prose.
 *
 * WHY. A gathered data-channel SDP is ~700 bytes of text; deflated and
 * base64url'd it still lands around 650 characters. That is a miserable thing
 * to paste, it gets line-wrapped and mangled by chat clients, and — the reason
 * this file exists — it is far too much data for a QR code that a phone camera
 * can actually read. A code you can scan is a completely different product
 * from a code you have to copy, and the only thing standing in the way is size.
 *
 * WHAT IS ACTUALLY IN THERE. Almost none of that SDP is information. We only
 * ever negotiate one thing — a single data-channel m-line — so every line is
 * either a constant we can rebuild from a template, or one of five facts:
 *
 *   the DTLS fingerprint      32 bytes
 *   the ICE ufrag             ~4 bytes
 *   the ICE pwd               ~24 bytes
 *   the DTLS setup role       2 bits
 *   the candidates            ~7-19 bytes each
 *
 * That is ~90 bytes for a typical host+srflx pair, or about 120 base64url
 * characters — roughly a fifth of the deflated text, and comfortably inside a
 * QR code that scans on the first try.
 *
 * WHY THIS IS SAFE TO DO, given the last attempt at shortening the SDP shipped
 * a bug that broke every real connection: this does not EDIT the SDP. It
 * extracts the five facts and rebuilds a complete, well-formed description from
 * a fixed template, and — see verify() — the result is handed to a throwaway
 * RTCPeerConnection BEFORE it is ever handed to a human. If this browser will
 * not accept our own reconstruction, pack() is abandoned and the caller falls
 * back to the deflated full text. The format flag in the code says which was
 * used, so the two paths interoperate.
 *
 * WHAT IS DELIBERATELY DROPPED. TCP candidates (`tcptype`): for a data channel
 * across a NAT they are near-useless, and dropping them is most of the
 * remaining size. Same-host TCP fallback is the cost, and on a link where UDP
 * is entirely blocked no amount of signalling was going to help anyway.
 */
"use strict";

const NetSdp = (function () {
  const VERSION = 1;

  // Candidate encodings. The mDNS form is the interesting one: Chrome hides
  // your LAN address behind a random `<uuid>.local` hostname, and a UUID is 16
  // bytes of hex — so it packs smaller than the text that names it, and the
  // same-Wi-Fi case (two phones on a sofa) keeps working.
  const C_MDNS = 0, C_HOST4 = 1, C_SRFLX4 = 2, C_RELAY4 = 3, C_HOST6 = 4, C_SRFLX6 = 5;
  const ADDR_LEN = { 0: 16, 1: 4, 2: 4, 3: 4, 4: 16, 5: 16 };
  const TYPE_OF = { 0: "host", 1: "host", 2: "srflx", 3: "relay", 4: "host", 5: "srflx" };
  const IS_V6 = { 4: true, 5: true };

  const SETUPS = ["actpass", "active", "passive", "holdconn"];
  const MAX_CANDS = 8;              // more than this is stragglers, not reach

  // RFC 5245 priority for component 1 at full local preference. Recomputed
  // rather than carried: it is a pure function of the candidate type, so
  // sending it would be sending four bytes of arithmetic.
  const PRIORITY = { host: 2113937151, srflx: 1677729535, relay: 16777215 };

  // ---- small parsers --------------------------------------------------------
  const line = (sdp, re) => { const m = sdp.match(re); return m ? m[1] : null; };

  function hexToBytes(hex) {
    const clean = hex.replace(/[^0-9a-fA-F]/g, "");
    if (clean.length % 2) return null;
    const out = new Uint8Array(clean.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16);
    return out;
  }
  const bytesToHex = (b, sep) =>
    Array.from(b, (v) => v.toString(16).toUpperCase().padStart(2, "0")).join(sep || "");

  function v4ToBytes(addr) {
    const p = addr.split(".");
    if (p.length !== 4) return null;
    const out = new Uint8Array(4);
    for (let i = 0; i < 4; i++) {
      const n = Number(p[i]);
      if (!(n >= 0 && n <= 255)) return null;
      out[i] = n;
    }
    return out;
  }
  const bytesToV4 = (b) => Array.from(b).join(".");

  // IPv6 with :: expansion. Written out rather than pulled from a helper
  // because the game has no other reason to know what an IPv6 address is.
  function v6ToBytes(addr) {
    const zone = addr.indexOf("%");
    if (zone >= 0) addr = addr.slice(0, zone);
    const halves = addr.split("::");
    if (halves.length > 2) return null;
    const grp = (s) => (s ? s.split(":").filter((x) => x.length) : []);
    const head = grp(halves[0]), tail = halves.length === 2 ? grp(halves[1]) : [];
    if (halves.length === 1 && head.length !== 8) return null;
    const fill = 8 - head.length - tail.length;
    if (fill < 0) return null;
    const words = head.concat(new Array(fill).fill("0"), tail);
    const out = new Uint8Array(16);
    for (let i = 0; i < 8; i++) {
      const n = parseInt(words[i], 16);
      if (!(n >= 0 && n <= 0xffff)) return null;
      out[i * 2] = n >> 8; out[i * 2 + 1] = n & 0xff;
    }
    return out;
  }
  function bytesToV6(b) {
    const words = [];
    for (let i = 0; i < 8; i++) words.push(((b[i * 2] << 8) | b[i * 2 + 1]).toString(16));
    // Collapse the longest run of zero words, as every implementation prints it.
    let bestAt = -1, bestLen = 0, at = -1, len = 0;
    for (let i = 0; i < 9; i++) {
      if (i < 8 && words[i] === "0") { if (at < 0) at = i; len++; }
      else { if (len > bestLen) { bestLen = len; bestAt = at; } at = -1; len = 0; }
    }
    if (bestLen < 2) return words.join(":");
    return words.slice(0, bestAt).join(":") + "::" + words.slice(bestAt + bestLen).join(":");
  }

  // ---- candidates -----------------------------------------------------------
  // a=candidate:<foundation> <component> <transport> <priority> <addr> <port>
  //   typ <type> [raddr <a> rport <p>] ...
  function parseCandidate(text) {
    const t = text.trim().split(/\s+/);
    if (t.length < 8 || t[6] !== "typ") return null;
    const transport = t[2].toLowerCase();
    if (transport !== "udp") return null;             // see the header: TCP is dropped
    if (t[1] !== "1") return null;                    // component 2 is RTCP; not for data
    const addr = t[4], port = Number(t[5]), type = t[7];

    if (/\.local$/i.test(addr)) {
      const uuid = hexToBytes(addr.replace(/\.local$/i, "").replace(/-/g, ""));
      if (!uuid || uuid.length !== 16) return null;
      return { kind: C_MDNS, addr: uuid, port };
    }
    if (addr.indexOf(":") >= 0) {
      const b = v6ToBytes(addr);
      if (!b) return null;
      if (type === "host") return { kind: C_HOST6, addr: b, port };
      if (type === "srflx") return { kind: C_SRFLX6, addr: b, port };
      return null;
    }
    const b = v4ToBytes(addr);
    if (!b) return null;
    if (type === "host") return { kind: C_HOST4, addr: b, port };
    if (type === "srflx") return { kind: C_SRFLX4, addr: b, port };
    if (type === "relay") return { kind: C_RELAY4, addr: b, port };
    return null;
  }

  function candidateLine(c, i) {
    const type = TYPE_OF[c.kind];
    const addr = c.kind === C_MDNS
      ? mdnsName(c.addr)
      : (IS_V6[c.kind] ? bytesToV6(c.addr) : bytesToV4(c.addr));
    // rel-addr is masked rather than carried. It is diagnostic only — ICE never
    // connects through it — and every stack accepts the masked form, which is
    // what a privacy-conscious implementation sends anyway.
    const rel = (type === "srflx" || type === "relay")
      ? (IS_V6[c.kind] ? " raddr :: rport 0" : " raddr 0.0.0.0 rport 0") : "";
    return "a=candidate:" + (i + 1) + " 1 udp " + PRIORITY[type] + " " + addr + " "
      + c.port + " typ " + type + rel + " generation 0";
  }
  function mdnsName(b) {
    const h = bytesToHex(b, "").toLowerCase();
    return h.slice(0, 8) + "-" + h.slice(8, 12) + "-" + h.slice(12, 16) + "-"
      + h.slice(16, 20) + "-" + h.slice(20) + ".local";
  }

  // ---- pack -----------------------------------------------------------------
  // Returns null for ANYTHING it does not fully understand. A partial pack is
  // the one outcome worse than a long code: it would produce an invite that
  // looks fine and cannot connect.
  function pack(sdp) {
    const text = String(sdp || "");
    const fpHex = line(text, /^a=fingerprint:sha-256 (\S+)/mi);
    const ufrag = line(text, /^a=ice-ufrag:(\S+)/mi);
    const pwd = line(text, /^a=ice-pwd:(\S+)/mi);
    const setup = line(text, /^a=setup:(\S+)/mi) || "actpass";
    if (!fpHex || !ufrag || !pwd) return null;
    const fp = hexToBytes(fpHex);
    if (!fp || fp.length !== 32) return null;              // only sha-256 is packed
    const setupIdx = SETUPS.indexOf(setup);
    if (setupIdx < 0) return null;
    const uf = strBytes(ufrag), pw = strBytes(pwd);
    if (!uf || !pw) return null;

    const cands = [];
    const re = /^a=candidate:(.+)$/gmi;
    let m;
    while ((m = re.exec(text)) && cands.length < MAX_CANDS) {
      const c = parseCandidate(m[1]);
      // An unparseable candidate is skipped, not fatal: a stack may offer TCP
      // or a type we do not pack, and the UDP ones are what connect.
      if (c && c.port >= 0 && c.port <= 65535) cands.push(c);
    }
    if (!cands.length) return null;                       // nothing to connect to

    let n = 3 + 32 + 1 + uf.length + 1 + pw.length + 1;
    for (const c of cands) n += 1 + ADDR_LEN[c.kind] + 2;
    const out = new Uint8Array(n);
    let o = 0;
    out[o++] = VERSION;
    out[o++] = setupIdx & 0x03;
    out[o++] = cands.length;
    out.set(fp, o); o += 32;
    out[o++] = uf.length; out.set(uf, o); o += uf.length;
    out[o++] = pw.length; out.set(pw, o); o += pw.length;
    for (const c of cands) {
      out[o++] = c.kind;
      out.set(c.addr, o); o += c.addr.length;
      out[o++] = c.port >> 8; out[o++] = c.port & 0xff;
    }
    return out;
  }

  // ufrag/pwd are ASCII by spec (ice-char). Anything else means we are looking
  // at something we do not understand, so refuse rather than mangle it.
  function strBytes(s) {
    const out = new Uint8Array(s.length);
    if (s.length > 255) return null;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      if (c < 0x20 || c > 0x7e) return null;
      out[i] = c;
    }
    return out;
  }

  // ---- unpack ---------------------------------------------------------------
  function unpack(bytes) {
    if (!bytes || bytes.length < 4) return null;
    let o = 0;
    if (bytes[o++] !== VERSION) return null;
    const setup = SETUPS[bytes[o++] & 0x03];
    const count = bytes[o++];
    if (bytes.length < o + 32) return null;
    const fp = bytesToHex(bytes.slice(o, o + 32), ":"); o += 32;
    const ufLen = bytes[o++];
    if (bytes.length < o + ufLen) return null;
    const ufrag = ascii(bytes, o, ufLen); o += ufLen;
    const pwLen = bytes[o++];
    if (bytes.length < o + pwLen) return null;
    const pwd = ascii(bytes, o, pwLen); o += pwLen;

    const cands = [];
    for (let i = 0; i < count; i++) {
      if (o >= bytes.length) return null;
      const kind = bytes[o++];
      const len = ADDR_LEN[kind];
      if (len == null || bytes.length < o + len + 2) return null;
      const addr = bytes.slice(o, o + len); o += len;
      const port = (bytes[o] << 8) | bytes[o + 1]; o += 2;
      cands.push({ kind, addr, port });
    }
    if (!cands.length) return null;

    // The template. Every line here is either mandated by the SDP grammar or
    // identical in every data-channel offer this game will ever make — which is
    // exactly why none of it needs to travel.
    return [
      "v=0",
      "o=- 1 2 IN IP4 127.0.0.1",
      "s=-",
      "t=0 0",
      "a=group:BUNDLE 0",
      "a=extmap-allow-mixed",
      "a=msid-semantic: WMS",
      "m=application 9 UDP/DTLS/SCTP webrtc-datachannel",
      "c=IN IP4 0.0.0.0",
    ].concat(cands.map(candidateLine)).concat([
      "a=ice-ufrag:" + ufrag,
      "a=ice-pwd:" + pwd,
      "a=fingerprint:sha-256 " + fp,
      "a=setup:" + setup,
      "a=mid:0",
      "a=sctp-port:5000",
      "a=max-message-size:262144",
      "",
    ]).join("\r\n");
  }

  function ascii(bytes, off, len) {
    let s = "";
    for (let i = 0; i < len; i++) s += String.fromCharCode(bytes[off + i]);
    return s;
  }

  // ---- the safety net -------------------------------------------------------
  // Hand our own reconstruction to a throwaway RTCPeerConnection before any
  // human ever sees it. This is the difference between "shortening the SDP is
  // risky" and "shortening the SDP is checked": if this browser will not accept
  // what we rebuilt, we simply do not use the short form.
  //
  // Validated as an OFFER in both directions on purpose — a fresh peer
  // connection accepts a remote offer with no prior state, while validating an
  // answer would need a matching local offer first. The two rebuilds differ
  // only in the a=setup: value, which is not what could break parsing.
  async function verify(rebuilt) {
    if (typeof RTCPeerConnection === "undefined") return false;
    let probe = null;
    try {
      probe = new RTCPeerConnection();
      await probe.setRemoteDescription({
        type: "offer",
        sdp: rebuilt.replace(/^a=setup:.*$/mi, "a=setup:actpass"),
      });
      return true;
    } catch (e) {
      return false;
    } finally {
      if (probe) { try { probe.close(); } catch (e) {} }
    }
  }

  // pack + prove it survives the round trip, in one call. Returns the bytes, or
  // null meaning "use the full text".
  async function packChecked(sdp) {
    const bytes = pack(sdp);
    if (!bytes) return null;
    const rebuilt = unpack(bytes);
    if (!rebuilt) return null;
    return (await verify(rebuilt)) ? bytes : null;
  }

  return { VERSION, pack, unpack, packChecked, verify };
})();
