/* PhonePadCodec — the PHONE AS CONTROLLER wire format, one home.
   Samples, dash packets, edges and the pairing URL. phone-pad.js (the desktop
   session) and phone-pad-page.js (the phone DOM) both call this; neither
   copies a field. Bytes on the wire stay the arrays and objects this file
   builds. */
"use strict";

const PhonePadCodec = (function () {
  const PROTO = 1;
  const CAMERA_SAMPLE = 4;

  // The edges the phone may send; each is a name Input.remoteEvent knows.
  const EVENTS = Object.freeze(["shiftUp", "shiftDown", "overtake", "boost", "aero",
    "camera", "recover", "radio", "calib", "pause",
    // The menu pad (desktop: input.js REMOTE_EDGES → the gamepad's nav seam).
    "navUp", "navDown", "navLeft", "navRight", "navSelect", "navBack"]);
  // A held direction repeats like a keyboard's (OS-style delay, then rate) so a
  // long list is walked with a thumb held down, not tapped twenty times.
  const NAV_REPEAT = Object.freeze({ navUp: 1, navDown: 1, navLeft: 1, navRight: 1 });

  const round2 = (v) => Math.round((+v || 0) * 100) / 100;
  const num = (v, lo, hi) => (typeof v === "number" && isFinite(v)) ? Math.min(hi, Math.max(lo, v)) : 0;
  const CAMERA_AXES = ["moveX", "moveY", "lookX", "lookY", "lift"];
  const SURFACES = ["drive", "menu", "camera"];

  // ── wire ──────────────────────────────────────────────────────────────────
  // STATE channel, phone → desktop: one JSON array per sample,
  // [1, seq, roll|null, thr, brk, held]. After the respective capability
  // handshake, touch steering uses [2, seq, null, thr, brk, held, steer].
  // Version 3 carries already-shaped pedals with either kind of steering.
  // Version 4 carries camera input: [4, seq, moveX, moveY, lookX, lookY, lift].
  function encodeSample(s) {
    if (s.camera) return JSON.stringify([CAMERA_SAMPLE, s.seq | 0, ...CAMERA_AXES.map(key => round2(num(s.camera[key], -1, 1)))]);
    const roll = (typeof s.roll === "number" && isFinite(s.roll)) ? round2(s.roll) : null;
    const touch = typeof s.steer === "number" && isFinite(s.steer);
    const version = s.calibratedPedals === true ? 3 : touch ? 2 : PROTO;
    const fields = [version, s.seq | 0, touch ? null : roll, round2(s.thr), round2(s.brk), s.held | 0];
    if (version !== PROTO) fields.push(touch ? num(s.steer, -1, 1) : null);
    return JSON.stringify(fields);
  }
  function decodeSample(text) {
    let a;
    try { a = JSON.parse(typeof text === "string" ? text : ""); } catch (e) { return null; }
    if (!Array.isArray(a)) return null;
    if (a[0] === CAMERA_SAMPLE) {
      if (a.length !== 7 || !a.slice(2).every(Number.isFinite)) return null;
      const camera = Object.fromEntries(CAMERA_AXES.map((key, i) => [key, num(a[i + 2], -1, 1)]));
      return { seq: a[1] | 0, roll: null, thr: 0, brk: 0, held: 0, camera };
    }
    const touch = Number.isFinite(a[6]), calibrated = a[0] === 3;
    const validSteering = touch ? a[2] === null : a[6] === null;
    if (!((a.length === 6 && a[0] === PROTO) || (a.length === 7 &&
        ((a[0] === 2 && touch) || (calibrated && validSteering))))) return null;
    return {
      ...(calibrated ? { calibratedPedals: true } : {}),
      ...(touch ? { steer: num(a[6], -1, 1) } : {}),
      seq: a[1] | 0,
      roll: (typeof a[2] === "number" && isFinite(a[2])) ? num(a[2], -180, 180) : null,
      thr: num(a[3], 0, 1), brk: num(a[4], 0, 1), held: a[5] | 0,
    };
  }
  // STATE channel, desktop → phone: the dash, ["H", gear, kmh, rpmFrac, lap,
  // laps, pos, cars, ers, flags, caution, lastLapMs, state, teamHex].
  // Negotiated extensions append grip, surface and the host's HUD sequence.
  function encodeHud(h, gripFeedback, surfaces, hudSeq) {
    if (!h) return null;
    const fields = ["H", h.gear | 0, Math.round(+h.kmh || 0), round2(h.rpm), h.lap | 0, h.laps | 0,
      h.pos | 0, h.cars | 0, round2(h.ers), h.flags | 0, h.caution | 0, Math.round(+h.lastLapMs || 0),
      String(h.state || "").slice(0, 8), /^#[0-9a-f]{6}$/i.test(h.team || "") ? h.team : ""];
    const grip = gripFeedback ? h.grip : "";
    const surface = surfaces && SURFACES.includes(h.surface) ? h.surface : "";
    if (hudSeq !== undefined) fields.push(grip || "", surface, hudSeq);
    else if (surface) fields.push(grip || "", surface);
    else if (grip) fields.push(grip);
    return JSON.stringify(fields);
  }
  function decodeHud(text) {
    let a;
    try { a = JSON.parse(typeof text === "string" ? text : ""); } catch (e) { return null; }
    return hudOf(a);
  }
  // The parsed half, so the session's STATE handler parses each packet once (audit4 UB5).
  function hudOf(a) {
    if (!Array.isArray(a) || a.length < 14 || a.length > 17 || a[0] !== "H") return null;
    if (a.length === 17 && (!Number.isSafeInteger(a[16]) || a[16] < 0)) return null;
    return {
      gear: num(a[1], -1, 9) | 0, kmh: num(a[2], 0, 999) | 0, rpm: num(a[3], 0, 1),
      lap: num(a[4], 0, 999) | 0, laps: num(a[5], 0, 999) | 0, pos: num(a[6], 0, 99) | 0, cars: num(a[7], 0, 99) | 0,
      ers: num(a[8], 0, 1), flags: num(a[9], 0, 65535) | 0, caution: num(a[10], 0, 4) | 0,
      lastLapMs: num(a[11], 0, 3.6e6) | 0, state: String(a[12] || "").slice(0, 8),
      team: /^#[0-9a-f]{6}$/i.test(a[13] || "") ? a[13] : "",
      ...(["spin", "slip", "lock"].includes(a[14]) ? { grip: a[14] } : {}),
      ...(SURFACES.includes(a[15]) ? { surface: a[15] } : {}),
      ...(a.length === 17 ? { hudSeq: a[16] } : {}),
    };
  }
  // EVENT channel: {t:"ev", k} phone→desktop; {t:"hap", ms} desktop→phone;
  // {t:"hi", side, haptics, steer?, ack?, id?} advertises additive capabilities.
  // `id` is the phone page's random PEER ID (hex): it rides only inside the
  // DTLS channel, so a host that saw it from the phone the player ALLOWed can
  // tell that phone's re-link from a stranger's answer to the same code.
  // Accepted sample acknowledgements use STATE ["A", seq]; older peers ignore them.
  const PEER_ID_RE = /^[0-9a-f]{16,64}$/;
  function encodeEvent(k) { return JSON.stringify({ t: "ev", k }); }
  // SUSPEND: the phone page is going away (pagehide: navigate, switch-away, Safari
  // unloading it), not unpairing. The next close is a wire loss the game re-hosts for.
  function encodeSuspend() { return JSON.stringify({ t: "sus" }); }
  function encodeHaptic(ms) { return JSON.stringify({ t: "hap", ms: Math.max(0, Math.min(1000, ms | 0)) }); }
  function encodeHello(side, haptics, extended, id, camera, hudOrder) {
    return JSON.stringify({ t: "hi", side, p: PROTO, haptics: haptics === true, ...(extended ? { steer: true, ack: true } : {}),
      ...(camera ? { camera: CAMERA_SAMPLE } : {}),
      ...(hudOrder ? { hudOrder: true } : {}),
      ...(extended && side === "pad" ? { grip: true } : {}),
      ...(extended && side === "host" ? { calibratedPedals: true } : {}),
      ...(typeof id === "string" && PEER_ID_RE.test(id) ? { id } : {}) });
  }
  // A fresh peer id: 128 random bits as hex (crypto where the page has it).
  function makePeerId() {
    const b = new Uint8Array(16);
    let filled = false;
    try { if (typeof crypto !== "undefined" && crypto.getRandomValues) { crypto.getRandomValues(b); filled = true; } } catch (_) { /* no CSPRNG */ }
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
      ...(o.camera === CAMERA_SAMPLE ? { camera: true } : {}),
      ...(o.hudOrder === true ? { hudOrder: true } : {}),
      ...(o.grip === true ? { grip: true } : {}),
      ...(o.calibratedPedals === true ? { calibratedPedals: true } : {}),
      ...(typeof o.id === "string" && PEER_ID_RE.test(o.id) ? { id: o.id } : {}) };
    return null;
  }
  // A TeamDef colour (three 0..1 floats) as the CSS hex the phone's LCD tints with.
  function teamHex(c) {
    if (!Array.isArray(c) || c.length < 3) return "";
    const h = (v) => Math.round(num(v, 0, 1) * 255).toString(16).padStart(2, "0");
    return "#" + h(c[0]) + h(c[1]) + h(c[2]);
  }
  // mm:ss.mmm for the LAST lap readout; "" for no lap yet.
  function fmtLap(ms) {
    if (!(ms > 0)) return "";
    const m = Math.floor(ms / 60000), s = (ms - m * 60000) / 1000;
    return m + ":" + (s < 10 ? "0" : "") + s.toFixed(3);
  }

  // The URL the QR carries. The code is a FRAGMENT: it never reaches a server log.
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
    root = String(root).replace(/[^/]*$/, "");      // …/index.html → …/
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
    PROTO, EVENTS, NAV_REPEAT, num, round2, hudOf,
    encodeSample, decodeSample, encodeHud, decodeHud, encodeEvent, encodeHaptic, encodeHello, encodeSuspend, decodeEvent, makePeerId,
    teamHex, fmtLap, padUrl, codeFromUrl, pairingFromUrl,
  };
})();
Object.freeze(PhonePadCodec);
