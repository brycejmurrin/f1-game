"use strict";

const PhonePadCodec = (function () {
  const PROTO = 1;

  const EVENTS = Object.freeze(["shiftUp", "shiftDown", "overtake", "boost", "aero",
    "camera", "recover", "radio", "calib", "pause",
    "navUp", "navDown", "navLeft", "navRight", "navSelect", "navBack"]);
  const NAV_REPEAT = Object.freeze({ navUp: 1, navDown: 1, navLeft: 1, navRight: 1 });

  const round2 = (v) => Math.round((+v || 0) * 100) / 100;
  const num = (v, lo, hi) => (typeof v === "number" && isFinite(v)) ? Math.min(hi, Math.max(lo, v)) : 0;

  function encodeSample(s) {
    const roll = (typeof s.roll === "number" && isFinite(s.roll)) ? round2(s.roll) : null;
    const touch = typeof s.steer === "number" && isFinite(s.steer);
    return JSON.stringify(touch ? [2, s.seq | 0, null, round2(s.thr), round2(s.brk), s.held | 0, num(s.steer, -1, 1)] : [PROTO, s.seq | 0, roll, round2(s.thr), round2(s.brk), s.held | 0]);
  }
  function decodeSample(text) {
    let a;
    try { a = JSON.parse(typeof text === "string" ? text : ""); } catch (e) { return null; }
    if (!Array.isArray(a) || !((a.length === 6 && a[0] === PROTO) || (a.length === 7 && a[0] === 2 && typeof a[6] === "number" && isFinite(a[6])))) return null;
    return {
      ...(a[0] === 2 ? { steer: num(a[6], -1, 1) } : {}),
      seq: a[1] | 0,
      roll: (typeof a[2] === "number" && isFinite(a[2])) ? num(a[2], -180, 180) : null,
      thr: num(a[3], 0, 1), brk: num(a[4], 0, 1), held: a[5] | 0,
    };
  }
  function encodeHud(h) {
    if (!h) return null;
    return JSON.stringify(["H", h.gear | 0, Math.round(+h.kmh || 0), round2(h.rpm), h.lap | 0, h.laps | 0,
      h.pos | 0, h.cars | 0, round2(h.ers), h.flags | 0, h.caution | 0, Math.round(+h.lastLapMs || 0),
      String(h.state || "").slice(0, 8), /^#[0-9a-f]{6}$/i.test(h.team || "") ? h.team : ""]);
  }
  function decodeHud(text) {
    let a;
    try { a = JSON.parse(typeof text === "string" ? text : ""); } catch (e) { return null; }
    return hudOf(a);
  }
  function hudOf(a) {
    if (!Array.isArray(a) || a.length !== 14 || a[0] !== "H") return null;
    return {
      gear: num(a[1], -1, 9) | 0, kmh: num(a[2], 0, 999) | 0, rpm: num(a[3], 0, 1),
      lap: num(a[4], 0, 999) | 0, laps: num(a[5], 0, 999) | 0, pos: num(a[6], 0, 99) | 0, cars: num(a[7], 0, 99) | 0,
      ers: num(a[8], 0, 1), flags: num(a[9], 0, 65535) | 0, caution: num(a[10], 0, 4) | 0,
      lastLapMs: num(a[11], 0, 3.6e6) | 0, state: String(a[12] || "").slice(0, 8),
      team: /^#[0-9a-f]{6}$/i.test(a[13] || "") ? a[13] : "",
    };
  }
  const PEER_ID_RE = /^[0-9a-f]{16,64}$/;
  function encodeEvent(k) { return JSON.stringify({ t: "ev", k }); }
  function encodeSuspend() { return JSON.stringify({ t: "sus" }); }
  function encodeHaptic(ms) { return JSON.stringify({ t: "hap", ms: Math.max(0, Math.min(1000, ms | 0)) }); }
  function encodeHello(side, haptics, extended, id) {
    return JSON.stringify({ t: "hi", side, p: PROTO, haptics: haptics === true, ...(extended ? { steer: true, ack: true } : {}),
      ...(typeof id === "string" && PEER_ID_RE.test(id) ? { id } : {}) });
  }
  function makePeerId() {
    const b = new Uint8Array(16);
    let filled = false;
    try { if (typeof crypto !== "undefined" && crypto.getRandomValues) { crypto.getRandomValues(b); filled = true; } } catch (_) {  }
    if (!filled) for (let i = 0; i < b.length; i++) b[i] = Math.floor(Math.random() * 256);
    return Array.from(b, (v) => v.toString(16).padStart(2, "0")).join("");
  }
  function decodeEvent(text) {
    let o;
    try { o = JSON.parse(typeof text === "string" ? text : ""); } catch (e) { return null; }
    if (!o || typeof o !== "object") return null;
    if (o.t === "ev") return EVENTS.includes(o.k) ? { t: "ev", k: o.k } : null;
    if (o.t === "sus") return { t: "sus" };
    if (o.t === "hap") return { t: "hap", ms: Math.max(0, Math.min(1000, o.ms | 0)) };
    if (o.t === "hi") return { t: "hi", side: String(o.side || ""), p: o.p | 0, haptics: o.haptics === true, ...(o.steer === true ? { steer: true } : {}), ...(o.ack === true ? { ack: true } : {}),
      ...(typeof o.id === "string" && PEER_ID_RE.test(o.id) ? { id: o.id } : {}) };
    return null;
  }
  function teamHex(c) {
    if (!Array.isArray(c) || c.length < 3) return "";
    const h = (v) => Math.round(num(v, 0, 1) * 255).toString(16).padStart(2, "0");
    return "#" + h(c[0]) + h(c[1]) + h(c[2]);
  }
  function fmtLap(ms) {
    if (!(ms > 0)) return "";
    const m = Math.floor(ms / 60000), s = (ms - m * 60000) / 1000;
    return m + ":" + (s < 10 ? "0" : "") + s.toFixed(3);
  }

  function relayUrl(value) {
    try {
      const u = new URL(value), local = ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
      if (u.username || u.password || u.search || u.hash || !(u.protocol === "https:" || (u.protocol === "http:" && local))) return null;
      return u.href.replace(/\/+$/, "");
    } catch (_) { return null; }
  }
  function padUrl(code, base, relay) {
    let root = base;
    if (!root) {
      try { root = location.origin + location.pathname; } catch (e) { root = ""; }
    }
    root = String(root).replace(/[^/]*$/, "");
    const endpoint = relay ? relayUrl(relay) : null;
    if (relay && !endpoint) throw new Error("Invalid private pairing relay URL");
    return root + "controller.html#pad=" + encodeURIComponent(code) + (endpoint ? "&relay=" + encodeURIComponent(endpoint) : "");
  }
  function codeFromUrl(href) {
    try {
      const h = (href != null ? String(href) : location.hash) || "";
      const m = h.match(/[#&]pad=([^&\s]+)/);
      return m ? decodeURIComponent(m[1]) : null;
    } catch (e) { return null; }
  }
  function pairingFromUrl(href) {
    const code = codeFromUrl(href);
    if (!code) return null;
    try {
      const text = href != null ? String(href) : location.hash;
      const m = text.slice(text.indexOf("#")).match(/(?:^#|&)relay=([^&]*)/);
      const relay = m ? relayUrl(decodeURIComponent(m[1])) : null;
      return { code, relay, invalid: !!m && !relay };
    } catch (_) { return { code, relay: null, invalid: true }; }
  }

  return {
    PROTO, EVENTS, NAV_REPEAT, num, hudOf,
    encodeSample, decodeSample, encodeHud, decodeHud, encodeEvent, encodeHaptic, encodeHello, encodeSuspend, decodeEvent, makePeerId,
    teamHex, fmtLap, padUrl, codeFromUrl, pairingFromUrl,
  };
})();
Object.freeze(PhonePadCodec);
