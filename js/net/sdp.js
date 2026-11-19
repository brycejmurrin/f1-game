"use strict";

const NetSdp = (function () {
  const VERSION = 1;

  const C_MDNS = 0, C_HOST4 = 1, C_SRFLX4 = 2, C_RELAY4 = 3, C_HOST6 = 4, C_SRFLX6 = 5, C_RELAY6 = 6;
  const ADDR_LEN = { 0: 16, 1: 4, 2: 4, 3: 4, 4: 16, 5: 16, 6: 16 };
  const TYPE_OF = { 0: "host", 1: "host", 2: "srflx", 3: "relay", 4: "host", 5: "srflx", 6: "relay" };
  const IS_V6 = { 4: true, 5: true, 6: true };

  const SETUPS = ["actpass", "active", "passive", "holdconn"];
  const MAX_CANDS = 8;
  const RETAIN = [3 , 6 , 2 , 5 ,
                  0 , 1 , 4 ];

  const PRIORITY = { host: 2113937151, srflx: 1677729535, relay: 16777215 };

  const line = (sdp, re) => { const m = sdp.match(re); return m ? m[1] : null; };

  function v4ToBytes(addr) {
    const p = String(addr || "").split(".");
    if (p.length !== 4) return null;
    const out = new Uint8Array(4);
    for (let i = 0; i < 4; i++) {
      if (!/^\d{1,3}$/.test(p[i])) return null;
      const n = Number(p[i]);
      if (!(n >= 0 && n <= 255) || String(n) !== p[i]) return null;
      out[i] = n;
    }
    return out;
  }
  const bytesToV4 = (b) => Array.from(b).join(".");

  function v6ToBytes(addr) {
    const zone = addr.indexOf("%");
    if (zone >= 0) addr = addr.slice(0, zone);
    if (addr.indexOf(".") >= 0) {
      const lastColon = addr.lastIndexOf(":");
      if (lastColon < 0) return null;
      const v4 = v4ToBytes(addr.slice(lastColon + 1));
      if (!v4) return null;
      const hi = ((v4[0] << 8) | v4[1]).toString(16);
      const lo = ((v4[2] << 8) | v4[3]).toString(16);
      addr = addr.slice(0, lastColon + 1) + hi + ":" + lo;
    }
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
      if (!/^[0-9a-fA-F]{1,4}$/.test(words[i])) return null;
      const n = parseInt(words[i], 16);
      if (!(n >= 0 && n <= 0xffff)) return null;
      out[i * 2] = n >> 8; out[i * 2 + 1] = n & 0xff;
    }
    return out;
  }
  function bytesToV6(b) {
    const words = [];
    for (let i = 0; i < 8; i++) words.push(((b[i * 2] << 8) | b[i * 2 + 1]).toString(16));
    let bestAt = -1, bestLen = 0, at = -1, len = 0;
    for (let i = 0; i < 9; i++) {
      if (i < 8 && words[i] === "0") { if (at < 0) at = i; len++; }
      else { if (len > bestLen) { bestLen = len; bestAt = at; } at = -1; len = 0; }
    }
    if (bestLen < 2) return words.join(":");
    return words.slice(0, bestAt).join(":") + "::" + words.slice(bestAt + bestLen).join(":");
  }

  function unreachableV6(b) {
    if (b[0] === 0xfe && (b[1] & 0xc0) === 0x80) return true;
    for (let i = 0; i < 15; i++) if (b[i]) return false;
    return b[15] === 1;
  }

  function parseCandidate(text) {
    const t = text.trim().split(/\s+/);
    if (t.length < 8 || t[6] !== "typ") return null;
    const transport = t[2].toLowerCase();
    if (transport !== "udp") return null;
    if (t[1] !== "1") return null;
    let addr = t[4];
    const port = Number(t[5]), type = t[7];
    const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(addr);
    if (mapped) addr = mapped[1];

    if (/\.local$/i.test(addr)) {
      const uuid = NetBytes.hexToBytes(addr.replace(/\.local$/i, "").replace(/-/g, ""));
      if (!uuid || uuid.length !== 16) return null;
      return { kind: C_MDNS, addr: uuid, port };
    }
    if (addr.indexOf(":") >= 0) {
      const b = v6ToBytes(addr);
      if (!b) return null;
      if (unreachableV6(b)) return null;
      if (type === "host") return { kind: C_HOST6, addr: b, port };
      if (type === "srflx") return { kind: C_SRFLX6, addr: b, port };
      if (type === "relay") return { kind: C_RELAY6, addr: b, port };
      return null;
    }
    const b = v4ToBytes(addr);
    if (!b) return null;
    if (b[0] === 127) return null;
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
    const rel = (type === "srflx" || type === "relay")
      ? (IS_V6[c.kind] ? " raddr :: rport 0" : " raddr 0.0.0.0 rport 0") : "";
    return "a=candidate:" + (i + 1) + " 1 udp " + PRIORITY[type] + " " + addr + " "
      + c.port + " typ " + type + rel + " generation 0";
  }
  function mdnsName(b) {
    const h = NetBytes.bytesToHex(b, "").toLowerCase();
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
    const fp = NetBytes.hexToBytes(fpHex);
    if (!fp || fp.length !== 32) return null;
    const setupIdx = SETUPS.indexOf(setup);
    if (setupIdx < 0) return null;
    const uf = strBytes(ufrag), pw = strBytes(pwd);
    if (!uf || !pw) return null;

    const byKind = new Map();
    const re = /^a=candidate:(.+)$/gmi;
    let m;
    while ((m = re.exec(text))) {
      const c = parseCandidate(m[1]);
      if (!c || !Number.isInteger(c.port) || c.port < 1 || c.port > 65535) continue;
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
    if (!cands.length) return null;

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
    const fp = NetBytes.bytesToHex(bytes.slice(o, o + 32), ":"); o += 32;
    if (o >= bytes.length) return null;
    const ufLen = bytes[o++];
    if (bytes.length < o + ufLen) return null;
    const ufrag = NetBytes.ascii(bytes, o, ufLen); o += ufLen;
    if (o >= bytes.length) return null;
    const pwLen = bytes[o++];
    if (bytes.length < o + pwLen) return null;
    const pwd = NetBytes.ascii(bytes, o, pwLen); o += pwLen;

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
      Log.debug("net", "short SDP refused by this browser, using the full form:", e && e.name);
      return false;
    } finally {
      if (probe) { try { probe.close(); } catch (e) {  } }
    }
  }

  async function packChecked(sdp) {
    const bytes = pack(sdp);
    if (!bytes) { Log.debug("net", "SDP not packable (no sha-256/ufrag/pwd or no UDP candidate), using the full form"); return null; }
    const rebuilt = unpack(bytes);
    if (!rebuilt) { Log.warn("net", "packed SDP failed to unpack, using the full form"); return null; }
    return (await verify(rebuilt)) ? bytes : null;
  }

  function fingerprint(sdp) {
    const text = String(sdp || "");
    const fp = line(text, /^a=fingerprint:sha-256 (\S+)/mi) || line(text, /^a=fingerprint:\S+ (\S+)/mi);
    const hex = fp ? fp.replace(/[^0-9a-f]/gi, "").toLowerCase() : "";
    return hex || null;
  }
  function identity(sdp) {
    const fp = fingerprint(sdp);
    const ufrag = line(String(sdp || ""), /^a=ice-ufrag:(\S+)/mi);
    return fp && ufrag ? { fp, ufrag } : null;
  }

  return { pack, unpack, packChecked, fingerprint, identity };
})();
Object.freeze(NetSdp);
