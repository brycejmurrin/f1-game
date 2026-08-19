/* NetSdp — the invite code's payload, as bytes instead of prose. WHY. A gathered data-channel SDP is ~700 bytes of text; deflated and base64url'd it still lands a… */
"use strict";

const NetSdp = (function () {
  const VERSION = 1;

  const C_MDNS = 0, C_HOST4 = 1, C_SRFLX4 = 2, C_RELAY4 = 3, C_HOST6 = 4, C_SRFLX6 = 5;
  const ADDR_LEN = { 0: 16, 1: 4, 2: 4, 3: 4, 4: 16, 5: 16 };
  const TYPE_OF = { 0: "host", 1: "host", 2: "srflx", 3: "relay", 4: "host", 5: "srflx" };
  const IS_V6 = { 4: true, 5: true };

  const SETUPS = ["actpass", "active", "passive", "holdconn"];
  const MAX_CANDS = 8;              // more than this is stragglers, not reach
  const RETAIN = [3 /*C_RELAY4*/, 2 /*C_SRFLX4*/, 5 /*C_SRFLX6*/,
                  0 /*C_MDNS*/, 1 /*C_HOST4*/, 4 /*C_HOST6*/];

  const PRIORITY = { host: 2113937151, srflx: 1677729535, relay: 16777215 };

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

    // TAKE THE FIRST EIGHT OF EACH KIND, NOT THE FIRST EIGHT.
    //
    // SDP lists candidates in GATHERING order: host first, then srflx once
    // STUN answers, then relay once TURN allocates — relay is always last
    // because it is always slowest. Truncating the raw sequence therefore
    // drops exactly the candidates that matter most, and does it precisely on
    // the machines that need them: a laptop with Wi-Fi, Ethernet, a VPN and
    // IPv6 can fill eight slots with host and srflx before a single relay line
    // appears.
    //
    // That is what was happening. __apex.turnProbe() reported all four Metered
    // servers reachable with relay candidates, the connection gathered them,
    // and the invite code carried none — so the peer was offered a set of
    // addresses it could not reach and the relay never entered the race. The
    // wire dump said relay:0 and looked like a dead relay for hours.
    //
    // So group by kind and round-robin. Every kind present keeps at least one
    // slot, and the budget is still MAX_CANDS.
    const byKind = new Map();
    const re = /^a=candidate:(.+)$/gmi;
    let m;
    while ((m = re.exec(text))) {
      const c = parseCandidate(m[1]);
      // An unparseable candidate is skipped, not fatal: a stack may offer TCP
      // or a type we do not pack, and the UDP ones are what connect.
      if (!c || c.port < 0 || c.port > 65535) continue;
      if (!byKind.has(c.kind)) byKind.set(c.kind, []);
      byKind.get(c.kind).push(c);
    }
    const order = [...byKind.keys()].sort((a, b) => RETAIN.indexOf(a) - RETAIN.indexOf(b));
    const cands = [];
    for (let round = 0; cands.length < MAX_CANDS; round++) {
      let added = 0;
      for (const k of order) {
        const list = byKind.get(k);
        if (round < list.length && cands.length < MAX_CANDS) { cands.push(list[round]); added++; }
      }
      if (!added) break;
    }
    if (!cands.length) return null;                       // nothing to connect to

    let n = 3 + 32 + 1 + uf.length + 1 + pw.length;
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

  function unpack(bytes) {
    if (!bytes || bytes.length < 4) return null;
    let o = 0;
    if (bytes[o++] !== VERSION) return null;
    const setup = SETUPS[bytes[o++] & 0x03];
    const count = bytes[o++];
    if (bytes.length < o + 32) return null;
    const fp = bytesToHex(bytes.slice(o, o + 32), ":"); o += 32;
    if (o >= bytes.length) return null;
    const ufLen = bytes[o++];
    if (bytes.length < o + ufLen) return null;
    const ufrag = ascii(bytes, o, ufLen); o += ufLen;
    if (o >= bytes.length) return null;
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

  async function packChecked(sdp) {
    const bytes = pack(sdp);
    if (!bytes) return null;
    const rebuilt = unpack(bytes);
    if (!rebuilt) return null;
    return (await verify(rebuilt)) ? bytes : null;
  }

  return { VERSION, pack, unpack, packChecked, verify };
})();
