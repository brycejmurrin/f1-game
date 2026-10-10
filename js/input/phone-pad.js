/* PhonePad — PHONE AS CONTROLLER: a phone on the sofa steers the game on the
   screen by tilting, over the multiplayer wire, and shows a steering-wheel
   dash fed live from the race.

   WHY NOT BLUETOOTH. A web page can only ever be the CENTRAL end of Web
   Bluetooth (Chrome, desktop): it connects to a peripheral that advertises.
   No phone browser can advertise, act as a GATT peripheral or present itself
   as an HID gamepad — that needs a native app on the phone. So the pairing
   that IS available to a static site is the one VS FRIEND already ships: a
   WebRTC DataChannel, signalled through a six-letter room code on the public
   Nostr relays (js/net/rendezvous.js → js/net/nostr.js). On one Wi-Fi the
   channel goes phone→router→laptop with a few ms of latency; across networks
   it still connects (STUN/TURN, js/net/transport.js). Both ends need internet
   for the ten seconds the handshake takes; the game itself never sees a server.

   THE TWO HALVES share this file so the wire format has one home:
     host(ui)      — the DESKTOP side (js/game.js, behind PHONE AS CONTROLLER in
                     Settings › CONTROLS): mints a room, paints the QR for
                     controller.html#pad=CODE, accepts the phone's answer and
                     feeds every sample to Input.remoteSample() — the SAME tilt
                     pipeline the local sensor uses, so RECALIBRATE and the TILT
                     sliders act on the phone. It streams the dash back: gear,
                     speed, revs, lap, position, ERS, overtake/aero state, flag.
     pad(dom, opts) — the PHONE side (controller.html): joins the room, streams
                     TiltRoll.rollDeg() plus the pedals at the sensor rate on
                     the unreliable channel, sends button EDGES on the reliable
                     one, paints the wheel's LCD from the dash packets, and
                     vibrates when the desktop forwards a haptic.
   link()/padSession() are the transport-level halves, with the signalling
   left out, so tests/unit/phone-pad.test.mjs drives both over
   NetTransport.loopback() and asserts what reaches Input and the LCD. */
"use strict";

const PhonePad = (function () {
  const PROTO = 1;
  const HEARTBEAT_MS = 100;        // a sample at least this often, moving or not
  const MIN_SAMPLE_GAP_MS = 15;    // and at most ~66 Hz — the sensor's own rate
  const HUD_MS = 66;               // the dash refreshes ~15 Hz, like the game's own HUD tick
  const HELD = Object.freeze({ lookBack: 1 });
  // The edges the phone may send; each is a name Input.remoteEvent knows.
  const EVENTS = Object.freeze(["shiftUp", "shiftDown", "overtake", "boost", "aero",
    "camera", "recover", "radio", "calib", "pause",
    // The menu pad (desktop: input.js REMOTE_EDGES → the gamepad's nav seam).
    "navUp", "navDown", "navLeft", "navRight", "navSelect", "navBack"]);
  // A held direction repeats like a keyboard's (OS-style delay, then rate) so a
  // long list is walked with a thumb held down, not tapped twenty times.
  const NAV_REPEAT = Object.freeze({ navUp: 1, navDown: 1, navLeft: 1, navRight: 1 });
  const REPEAT_DELAY_MS = 380, REPEAT_RATE_MS = 110;
  // Pedal ease, px of thumb slide: js/input/hold-buttons.js's PEDAL_* numbers.
  const PEDAL_DEAD_PX = 12, PEDAL_TRAVEL_PX = 90, PEDAL_MIN = 0.12;
  // Dash flag bits (desktop → phone).
  const DASH = Object.freeze({ boost: 1, otArmed: 2, otActive: 4, xArmed: 8, xOpen: 16,
    retired: 32, timeTrial: 64, paused: 128, redline: 256,
    // The desktop's CONTROL MODES: what the wheel should not offer. Gears on
    // AUTO have no paddles, throttle on AUTO has no GAS zone, aero on AUTO (or
    // a circuit with no zones) has no AERO button. Sent with every dash so a
    // setting changed mid-session reaches the phone within a frame.
    gearsAuto: 512, throttleAuto: 1024, aeroAuto: 2048, aeroNone: 4096,
    // The SESSION, so the LCD does not paint a race position where there is none: qualifying's
    // field is the player alone ("P1/1") and practice's rank is road order (hud.js: Q / PRAC).
    quali: 8192, practice: 16384 });
  const round2 = (v) => Math.round((+v || 0) * 100) / 100;
  const num = (v, lo, hi) => (typeof v === "number" && isFinite(v)) ? Math.min(hi, Math.max(lo, v)) : 0;

  // ── wire ──────────────────────────────────────────────────────────────────
  // STATE channel, phone → desktop: one JSON array per sample,
  // [proto, seq, roll|null, thr, brk, held].
  function encodeSample(s) {
    const roll = (typeof s.roll === "number" && isFinite(s.roll)) ? round2(s.roll) : null;
    return JSON.stringify([PROTO, s.seq | 0, roll, round2(s.thr), round2(s.brk), s.held | 0]);
  }
  function decodeSample(text) {
    let a;
    try { a = JSON.parse(typeof text === "string" ? text : ""); } catch (e) { return null; }
    if (!Array.isArray(a) || a.length !== 6 || a[0] !== PROTO) return null;
    return {
      seq: a[1] | 0,
      roll: (typeof a[2] === "number" && isFinite(a[2])) ? num(a[2], -180, 180) : null,
      thr: num(a[3], 0, 1), brk: num(a[4], 0, 1), held: a[5] | 0,
    };
  }
  // STATE channel, desktop → phone: the dash, ["H", gear, kmh, rpmFrac, lap,
  // laps, pos, cars, ers, flags, caution, lastLapMs, state, teamHex]. Tagged
  // "H" so decodeSample's `a[0] !== PROTO` refuses it and vice versa.
  function encodeHud(h) {
    if (!h) return null;
    return JSON.stringify(["H", h.gear | 0, Math.round(+h.kmh || 0), round2(h.rpm), h.lap | 0, h.laps | 0,
      h.pos | 0, h.cars | 0, round2(h.ers), h.flags | 0, h.caution | 0, Math.round(+h.lastLapMs || 0),
      String(h.state || "").slice(0, 8), /^#[0-9a-f]{6}$/i.test(h.team || "") ? h.team : ""]);
  }
  function decodeHud(text) {
    let a;
    try { a = JSON.parse(typeof text === "string" ? text : ""); } catch (e) { return null; }
    if (!Array.isArray(a) || a.length !== 14 || a[0] !== "H") return null;
    return {
      gear: num(a[1], -1, 9) | 0, kmh: num(a[2], 0, 999) | 0, rpm: num(a[3], 0, 1),
      lap: num(a[4], 0, 999) | 0, laps: num(a[5], 0, 999) | 0, pos: num(a[6], 0, 99) | 0, cars: num(a[7], 0, 99) | 0,
      ers: num(a[8], 0, 1), flags: num(a[9], 0, 65535) | 0, caution: num(a[10], 0, 4) | 0,
      lastLapMs: num(a[11], 0, 3.6e6) | 0, state: String(a[12] || "").slice(0, 8),
      team: /^#[0-9a-f]{6}$/i.test(a[13] || "") ? a[13] : "",
    };
  }
  // EVENT channel: {t:"ev", k} phone→desktop; {t:"hap", ms} desktop→phone;
  // {t:"hi", side, haptics} once on open; only a capable phone enables rumble.
  function encodeEvent(k) { return JSON.stringify({ t: "ev", k }); }
  function encodeHaptic(ms) { return JSON.stringify({ t: "hap", ms: Math.max(0, Math.min(1000, ms | 0)) }); }
  function encodeHello(side, haptics) { return JSON.stringify({ t: "hi", side, p: PROTO, haptics: haptics === true }); }
  function decodeEvent(text) {
    let o;
    try { o = JSON.parse(typeof text === "string" ? text : ""); } catch (e) { return null; }
    if (!o || typeof o !== "object") return null;
    if (o.t === "ev") return EVENTS.includes(o.k) ? { t: "ev", k: o.k } : null;
    if (o.t === "hap") return { t: "hap", ms: Math.max(0, Math.min(1000, o.ms | 0)) };
    if (o.t === "hi") return { t: "hi", side: String(o.side || ""), p: o.p | 0, haptics: o.haptics === true };
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

  // ── desktop: the focus ring the phone moves ──────────────────────────────
  // The D-pad reaches MenuNav as SYNTHETIC arrow keys, and whether the browser
  // DRAWS the focus it moves is its own heuristic: Safari shows no
  // :focus-visible for a scripted focus after a touch or a click, and no
  // browser paints :focus while its window is not the focused one — which is
  // exactly the sofa case, the player's hands on the phone and not on the
  // game's screen. Focus moved, SELECT clicked the right thing, and nothing on
  // screen said where it was. So the phone's focus wears a class of its own
  // (.pad-ring, css/responsive.css) from the first phone nav until a real
  // pointer or key on the desktop takes over. A focusout that leaves focus
  // where it was is the WINDOW blurring, not focus moving, and keeps the ring.
  function ringer(doc) {
    if (!doc || typeof doc.addEventListener !== "function") return null;
    let el = null, phone = false;
    const set = (n) => {
      if (el === n) return;
      if (el && el.classList) el.classList.remove("pad-ring");
      el = n && n !== doc.body && n !== doc.documentElement && n.classList ? n : null;
      if (el) el.classList.add("pad-ring");
    };
    const onIn = (e) => { if (phone) set(e.target); };
    const onOut = (e) => {
      if (e.target !== el) return;
      setTimeout(() => { if (el && doc.activeElement !== el) set(null); }, 0);
    };
    const local = (e) => { if (e.isTrusted === false) return; phone = false; set(null); };
    doc.addEventListener("focusin", onIn, true);
    doc.addEventListener("focusout", onOut, true);
    doc.addEventListener("pointerdown", local, true);
    doc.addEventListener("keydown", local, true);
    return {
      arm() { phone = true; },
      sync() { if (phone) set(doc.activeElement); },
      stop() {
        set(null);
        doc.removeEventListener("focusin", onIn, true);
        doc.removeEventListener("focusout", onOut, true);
        doc.removeEventListener("pointerdown", local, true);
        doc.removeEventListener("keydown", local, true);
      },
    };
  }

  // ── desktop: the transport-level half ────────────────────────────────────
  // Wires an OPEN (or opening) transport to Input and streams the dash back.
  // `opts.input`, `opts.now` and `opts.pump: false` are the test seams;
  // `opts.hud` is a sampler returning the dash fields (null = nothing to show).
  function link(transport, opts) {
    opts = opts || {};
    const input = opts.input || (typeof Input !== "undefined" ? Input : null);
    if (!transport || !input) return null;
    const T = NetTransport;
    // A clock on every pump: the rtc transport ignores it, loopback (the test
    // wire) schedules by it, and an undefined `now` there delivers nothing.
    const now = opts.now || (() => (typeof performance !== "undefined" ? performance.now() : Date.now()));
    let lastSeq = -1;
    let samples = 0, events = 0, stale = 0, junk = 0, huds = 0;
    let closed = false;
    let raf = 0;
    let hudAt = -1e9;
    const ring = ringer(opts.doc !== undefined ? opts.doc : (typeof document !== "undefined" ? document : null));
    input.setRemoteHaptics(null);  // clear the previous peer before any hello can arrive

    transport.onMessage((channel, data) => {
      if (closed) return;
      if (channel === T.STATE) {
        const s = decodeSample(data);
        if (!s) { junk++; return; }
        // Unordered channel: an older sample after a newer one is thrown away,
        // never applied — it would steer the car back where the phone was.
        if (s.seq <= lastSeq && lastSeq - s.seq < 30000) { stale++; return; }
        lastSeq = s.seq;
        samples++;
        input.remoteSample(s);
        return;
      }
      const ev = decodeEvent(data);
      if (!ev) { junk++; return; }
      if (ev.t === "hi" && ev.side === "pad" && ev.p === PROTO) {
        input.setRemoteHaptics(ev.haptics ? (ms) => transport.send(T.EVENT, encodeHaptic(ms)) : null);
      }
      if (ev.t === "ev") {
        events++;
        const nav = ev.k.startsWith("nav") && ring;
        if (nav) ring.arm();
        input.remoteEvent(ev.k);
        if (nav) ring.sync();
      }
    });
    const onClose = (why) => {
      if (closed) return;
      closed = true;
      if (ring) ring.stop();
      if (raf) { try { cancelAnimationFrame(raf); } catch (e) { /* no rAF here */ } raf = 0; }
      input.remoteLost();
      input.setRemoteHaptics(null);
      if (opts.onClose) { try { opts.onClose(why); } catch (e) { /* caller's problem */ } }
    };
    transport.onClose(onClose);

    const armed = () => {
      if (closed) return;
      transport.send(T.EVENT, encodeHello("host"));
      if (opts.onOpen) { try { opts.onOpen(); } catch (e) { /* caller's problem */ } }
    };
    if (transport.status === "open") armed(); else transport.onOpen(armed);

    // The dash: sampled and sent from the same pump, ~15 Hz, unreliable — a
    // dropped frame is replaced 66 ms later, so nothing is worth a retransmit.
    function sendHud(t) {
      if (!opts.hud || transport.status !== "open" || t - hudAt < HUD_MS) return;
      hudAt = t;
      let h = null;
      try { h = opts.hud(); } catch (e) { h = null; }
      const text = encodeHud(h);
      if (text && transport.send(T.STATE, text)) huds++;
    }
    // Samples land in the transport's inbox and reach Input only on pump(): once
    // a frame, ahead of the game loop's own Input.poll(). The frame loop is not
    // this module's to edit (js/game.js is ratcheted), so an rAF of its own
    // does the pumping; a test pumps by hand with pump: false.
    const pump = () => { const t = now(); const n = transport.pump(t); sendHud(t); return n; };
    if (opts.pump !== false && typeof requestAnimationFrame === "function") {
      const tick = () => { if (closed) return; pump(); raf = requestAnimationFrame(tick); };
      raf = requestAnimationFrame(tick);
    }
    return {
      pump,
      close() { try { transport.close(); } catch (e) { /* already closed */ } onClose(); },
      stats: () => ({ samples, events, stale, junk, huds, lastSeq, open: !closed && transport.status === "open" }),
    };
  }

  // ── desktop: the whole pairing flow, with signalling ─────────────────────
  // ui: { say(text, isError), qr(url, code) — null hides it, linked(), lost(),
  //       relinking() — a linked phone dropped and the room is open again for it,
  //       hud() — the dash sampler handed to link() }.
  // Returns the controller: cancel(), state().
  function host(ui, deps) {
    ui = ui || {};
    deps = Object.assign({
      rtc: (o) => NetTransport.rtc(o),
      prefetchIce: () => NetTransport.prefetchIce(),
      createInvite: (t, p) => NetHandshake.createInvite(t, p),
      acceptAnswer: (t, c) => NetHandshake.acceptAnswer(t, c),
      hostRoom: (o) => NetRendezvous.hostRoom(o),
      usingPrivateRelay: () => typeof NetRendezvous !== "undefined" && NetRendezvous.usingPrivateRelay(),
      relayUrl: () => NetRendezvous.baseUrl(),
      swap: (o) => NetRendezvous.swap(o),
      makeCode: () => NetRendezvous.makeCode(),
    }, deps || {});
    const say = (t, bad) => { if (ui.say) { try { ui.say(t, !!bad); } catch (e) { /* ui's problem */ } } };
    const qr = (url, code) => { if (ui.qr) { try { ui.qr(url, code); } catch (e) { /* ui's problem */ } } };
    let phase = "idle";          // idle | preparing | waiting | connecting | linked | lost | cancelled | failed
    let transport = null, room = null, active = null;
    let token = { cancelled: false };
    let code = null;
    // RE-LINK (R3-PHONE-3): a linked phone whose WIRE died (a lock, a call, a dead
    // signal — any close but the phone's own "peer" goodbye) gets the SAME code
    // hosted again for the room's own lifetime (nostr HOST_TIMEOUT_MS), and the
    // phone dials it again by itself. A private relay's one mailbox is not reusable.
    let relink = false;
    function failed(msg) {
      phase = "failed"; say(msg, true);
      if (relink) { relink = false; Log.info("input", "phone pad re-link gave up"); if (ui.lost) { try { ui.lost(); } catch (e) { /* ui's problem */ } } }
    }

    function dropRoom() {
      token.cancelled = true;
      if (room && room.stop) { try { room.stop(); } catch (e) { /* already stopped */ } }
      room = null;
    }
    function cancel() {
      if (phase === "cancelled") return;
      phase = "cancelled";
      dropRoom();
      if (active) { active.close(); active = null; }
      else if (transport) { try { transport.close(); } catch (e) { /* already closed */ } }
      transport = null;
      qr(null, null);
      Log.info("input", "phone pad cancelled");
    }

    const open = async () => {
      try {
        phase = "preparing";
        token = { cancelled: false };
        say(relink ? "Phone link lost — waiting for it to reconnect…" : "Preparing… (this can take a few seconds)");
        await deps.prefetchIce();
        if (phase !== "preparing") return;
        transport = deps.rtc({ role: "host", name: "pad" });
        if (!transport) { failed("WebRTC is unavailable in this browser."); return; }
        const invite = await deps.createInvite(transport, { pad: PROTO });
        if (phase !== "preparing") return;
        if (!invite.ok) { failed(invite.message || "Could not prepare the pairing."); return; }
        if (!relink) code = deps.makeCode();
        const url = padUrl(code, null, deps.usingPrivateRelay() ? deps.relayUrl() : null);
        phase = "waiting";
        qr(url, code);
        say("Scan the code with your phone's camera, or open the link and type the room code.");
        let accepted = false;
        const roomOptions = {
          code, mine: invite.code, token,
          onTick: () => { if (phase === "waiting") say("Waiting for your phone… (room code " + code + ")"); },
          onFail: (r) => {
            if (!r || r.error === "cancelled" || r.error === "stopped" || !["waiting", "connecting"].includes(phase)) return;
            if (r.advisory) { say(r.message, true); return; }
            failed(r.message || "The room service went away — try again.");
          },
          mintOffer: async () => null,     // one phone; a second scan gets nothing
          onJoiner: async (_who, answer) => {
            if (accepted || phase !== "waiting") return;
            accepted = true;
            phase = "connecting";
            say("Phone found — connecting…");
            const acc = await deps.acceptAnswer(transport, answer);
            if (phase !== "connecting") return;
            if (!acc.ok) { accepted = false; phase = "waiting"; say(acc.message || "That answer could not be read.", true); return; }
            active = link(transport, {
              hud: ui.hud || null,
              onOpen: () => {
                phase = "linked"; relink = false;
                dropRoom();
                qr(null, null);
                say("Phone connected — tilt to steer. RECALIBRATE TILT levels it.");
                Log.info("input", "phone pad linked");
                if (ui.linked) { try { ui.linked(); } catch (e) { /* ui's problem */ } }
              },
              onClose: (why) => {
                if (phase === "cancelled") return;
                const wasLinked = phase === "linked";
                // A link that died before it opened (ICE failed) still holds
                // the room's relay sockets; nothing will use them now.
                dropRoom();
                if (wasLinked && why !== "peer" && !deps.usingPrivateRelay()) {
                  relink = true; active = null; transport = null;
                  Log.info("input", "phone pad dropped (" + why + ") — hosting " + code + " again");
                  if (ui.relinking) { try { ui.relinking(); } catch (e) { /* ui's problem */ } }
                  open();
                  return;
                }
                phase = "lost";
                say("Phone disconnected — press STEER THIS GAME WITH A PHONE for a new code.", true);
                Log.info("input", "phone pad lost");
                if (ui.lost) { try { ui.lost(); } catch (e) { /* ui's problem */ } }
              },
            });
          },
        };
        // A private relay has one offer/answer mailbox, exactly what one phone
        // needs. hostRoom is the public relay's multi-guest subscription only.
        if (deps.usingPrivateRelay()) {
          const got = await deps.swap({ code, mine: invite.code, slot: "offer", want: "answer", token, onTick: roomOptions.onTick });
          if (phase !== "waiting") return;
          if (got.ok) await roomOptions.onJoiner(null, got.payload);
          if (phase === "waiting") {
            phase = "failed";
            if (!got.ok) say(got.message || "Could not open a room — check the connection.", true);
            dropRoom(); transport.close(); transport = null;
          }
          return;
        }
        const sub = await deps.hostRoom(roomOptions);
        if (!["waiting", "connecting"].includes(phase)) {
          if (sub && sub.stop) { try { sub.stop(); } catch (e) { /* already stopped */ } }
          return;
        }
        if (!sub || !sub.ok) {
          if (phase === "waiting") failed((sub && sub.message) || "Could not open a room — check the connection.");
          return;
        }
        room = sub;
      } catch (e) {
        Log.warn("input", "phone pad host failed: " + ((e && e.message) || e));
        if (phase !== "cancelled") {
          dropRoom();
          if (transport) { try { transport.close(); } catch (_) { /* failed startup */ } transport = null; }
          failed("Pairing failed — try again.");
        }
      }
    };
    open();

    return { cancel, state: () => ({ phase, code, stats: active ? active.stats() : null }) };
  }

  // ── phone: the transport-level half ──────────────────────────────────────
  // Streams samples and edges over an open transport. `src` is the sensor and
  // button state the page keeps: { roll(), thr(), brk(), held() }. Returns
  // { sample(), event(k), pump(), close(), stats() }; the page calls sample()
  // from deviceorientation and on every pedal change, and pump() each frame.
  // `opts.onHud(h)` receives every dash packet.
  function padSession(transport, src, opts) {
    opts = opts || {};
    const T = NetTransport;
    const now = opts.now || (() => (typeof performance !== "undefined" ? performance.now() : Date.now()));
    let seq = 0, lastSent = -1e9, sent = 0, haptics = 0, huds = 0, closed = false;
    let beat = 0;
    const vibrate = opts.vibrate || ((ms) => {
      try { if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* advisory */ }
    });

    function send(force) {
      if (closed || transport.status !== "open") return false;
      const t = now();
      if (!force && t - lastSent < MIN_SAMPLE_GAP_MS) return false;
      lastSent = t;
      const ok = transport.send(T.STATE, encodeSample({
        seq: seq++, roll: src.roll(), thr: src.thr(), brk: src.brk(), held: src.held(),
      }));
      if (ok) sent++;
      return ok;
    }
    function event(k) {
      if (closed || !EVENTS.includes(k) || transport.status !== "open") return false;
      return transport.send(T.EVENT, encodeEvent(k));
    }
    transport.onMessage((channel, data) => {
      if (closed) return;
      if (channel === T.STATE) {
        const h = decodeHud(data);
        if (h && opts.onHud) { huds++; try { opts.onHud(h); } catch (e) { /* page's problem */ } }
        return;
      }
      const ev = decodeEvent(data);
      if (ev && ev.t === "hap" && ev.ms > 0) { haptics++; vibrate(ev.ms); }
    });
    const close = (why) => {
      if (closed) return;
      closed = true;
      if (beat) { clearInterval(beat); beat = 0; }
      if (opts.onClose) { try { opts.onClose(why); } catch (e) { /* page's problem */ } }
    };
    transport.onClose(close);
    const armed = () => {
      if (closed) return;
      const canVibrate = typeof opts.vibrate === "function" || (typeof navigator !== "undefined" && typeof navigator.vibrate === "function" && navigator.maxTouchPoints > 0);
      transport.send(T.EVENT, encodeHello("pad", canVibrate));
      if (opts.heartbeat !== false) {
        beat = setInterval(() => send(true), HEARTBEAT_MS);
        if (beat && typeof beat.unref === "function") beat.unref();   // node harness: never the thing keeping the process alive
      }
      if (opts.onOpen) { try { opts.onOpen(); } catch (e) { /* page's problem */ } }
    };
    if (transport.status === "open") armed(); else transport.onOpen(armed);
    return {
      // A pedal or button CHANGE is sent at once (force); the sensor stream
      // keeps the 15 ms gap, since the next reading is a frame away anyway.
      sample: (force) => send(!!force),
      event,
      pump: () => transport.pump(now()),
      close() { try { transport.close(); } catch (e) { /* already closed */ } close("local"); },
      stats: () => ({ sent, haptics, huds, seq, open: !closed && transport.status === "open" }),
    };
  }

  // ── phone: the wheel's LCD ────────────────────────────────────────────────
  // Paints one dash packet into the elements controller.html hands over:
  //   { gear, speed, lap, pos, ers, flag, ot, aero, last, leds, screen, team, body }.
  // `body` takes the LAYOUT classes (gears-auto / throttle-auto / aero-auto /
  // aero-none) that hide or disable the controls the game is driving itself.
  // Pure DOM writes on a mini-DOM-friendly surface (textContent, style,
  // classList), so tests/unit/phone-pad.test.mjs can drive it too.
  const CAUTION = ["", "YELLOW", "VSC", "SAFETY CAR", "RED FLAG"];
  function paintHud(el, h) {
    if (!el || !h) return;
    const text = (n, v) => { if (el[n] && el[n].textContent !== v) el[n].textContent = v; };
    const inRace = h.state === "race" || h.state === "count";
    text("gear", h.gear === 0 ? "N" : h.gear < 0 ? "R" : String(h.gear));
    text("speed", inRace ? String(h.kmh) : "---");
    text("lap", h.flags & DASH.timeTrial ? "TT" : h.laps ? "LAP " + Math.min(Math.max(h.lap, 1), h.laps) + "/" + h.laps : "");
    text("pos", h.flags & DASH.retired ? "DNF" : h.flags & DASH.timeTrial ? "" : h.flags & DASH.quali ? "Q" : h.flags & DASH.practice ? "PRAC" : h.pos ? "P" + h.pos + "/" + h.cars : "");
    text("last", h.lastLapMs ? "LAST " + fmtLap(h.lastLapMs) : "");
    text("ot", h.flags & DASH.otActive ? "OVERTAKE" : h.flags & DASH.otArmed ? "OT READY" : "OT");
    text("aero", h.flags & DASH.aeroNone ? "NO ZONES" : h.flags & DASH.aeroAuto ? (h.flags & DASH.xOpen ? "AUTO STRAIGHT" : "AERO AUTO")
      : h.flags & DASH.xOpen ? "STRAIGHT MODE" : h.flags & DASH.xArmed ? "AERO ARMED" : "AERO");
    text("flag", h.state === "count" ? "LIGHTS" : h.flags & DASH.paused ? "PAUSED" : !inRace ? "MENU" : CAUTION[h.caution] || "");
    text("mtitle", h.flags & DASH.paused ? "PAUSED" : "MENU");   // the pad screen's title (controller.html #mp-title)
    if (el.ers && el.ers.style) el.ers.style.width = (h.ers * 100).toFixed(0) + "%";
    if (el.leds && el.leds.children) {
      const n = el.leds.children.length, lit = Math.round(h.rpm * n);
      for (let i = 0; i < n; i++) el.leds.children[i].classList.toggle("on", inRace && i < lit);
    }
    if (el.screen && el.screen.classList) {
      el.screen.classList.toggle("redline", !!(h.flags & DASH.redline));
      el.screen.classList.toggle("boost", !!(h.flags & DASH.boost));
      el.screen.classList.toggle("ot-on", !!(h.flags & DASH.otActive));
      el.screen.classList.toggle("ot-ready", !!(h.flags & DASH.otArmed) && !(h.flags & DASH.otActive));
      el.screen.classList.toggle("x-open", !!(h.flags & DASH.xOpen));
      el.screen.classList.toggle("caution", inRace && h.caution > 0);
      el.screen.classList.toggle("idle", !inRace);
    }
    if (el.team && el.team.style && h.team) el.team.style.setProperty("--team", h.team);
    if (el.body && el.body.classList) {
      el.body.classList.toggle("gears-auto", !!(h.flags & DASH.gearsAuto));
      el.body.classList.toggle("throttle-auto", !!(h.flags & DASH.throttleAuto));
      el.body.classList.toggle("aero-auto", !!(h.flags & DASH.aeroAuto));
      el.body.classList.toggle("aero-none", !!(h.flags & DASH.aeroNone));
      // THE MENU PAD: out of a race, or paused inside one, the page swaps the
      // wheel for a D-pad, SELECT and BACK (controller.html #menupad).
      el.body.classList.toggle("menu", !inRace || !!(h.flags & DASH.paused));
    }
  }

  // ── phone: the whole page ─────────────────────────────────────────────────
  // dom: { body, status, codeIn, connect, gas, brake, lookBack, center, rim,
  //        buttons: {shiftUp, shiftDown, …}, hud: {gear, speed, …},
  //        stick, nub, arrows: {navUp, …} — the menu stick,
  //        scan, scanBox, video — the in-page QR reader }.
  // Every element is passed in by controller.html (this module never looks an
  // id up), so the shell-id contract stays index.html's alone.
  function pad(dom, opts) {
    opts = opts || {};
    const deps = Object.assign({
      rtc: (o) => NetTransport.rtc(o),
      prefetchIce: () => NetTransport.prefetchIce(),
      acceptInvite: (t, c, p, o) => NetHandshake.acceptInvite(t, c, p, o),
      swap: (o) => NetRendezvous.swap(o),
      normalise: (c) => NetRendezvous.normalise(c),
      valid: (c) => NetRendezvous.valid(c),
      privateRelay: () => typeof NetRendezvous !== "undefined" && NetRendezvous.usingPrivateRelay && NetRendezvous.usingPrivateRelay(),
      setSessionUrl: (url) => typeof NetRendezvous !== "undefined" && NetRendezvous.setSessionUrl ? NetRendezvous.setSessionUrl(url) : url === null,
    }, opts.deps || {});
    let pairing = pairingFromUrl(opts.href);
    function paintCodeInput() {
      if (!dom.codeIn) return;
      const privateCode = pairing ? !!pairing.relay : deps.privateRelay();
      dom.codeIn.maxLength = privateCode ? 32 : 8;
      dom.codeIn.placeholder = privateCode ? "PRIVATE ROOM TOKEN" : "ABC123";
    }
    paintCodeInput();
    const say = (t, bad) => {
      if (!dom.status) return;
      dom.status.textContent = t;
      dom.status.classList.toggle("bad", !!bad);
    };
    // Sensor state — what padSession reads on every send.
    let roll = null, thr = 0, brk = 0, held = 0;
    let session = null;
    let sensorOn = false;
    let lastHud = null;
    const src = { roll: () => roll, thr: () => thr, brk: () => brk, held: () => held };

    // The rim turns with the phone: the wheel the player sees is the wheel
    // they are holding. Geared down and clamped — the controls on top stay
    // put, so a rim turned as far as the phone reads as the face bending
    // rather than the wheel moving; 0.6 of the roll, ±25°, is a lean.
    function paintRoll() {
      if (!dom.rim || !dom.rim.style) return;
      const r = roll == null ? 0 : Math.max(-25, Math.min(25, roll * 0.6));
      dom.rim.style.transform = "rotate(" + r.toFixed(1) + "deg)";
    }
    function onOrient(e) {
      const r = TiltRoll.rollDeg(e.beta, e.gamma, TiltRoll.screenAngle());
      if (r === null) return;
      roll = r;
      sensorOn = true;
      paintRoll();
      if (session) session.sample();
    }
    // iOS needs the permission prompt INSIDE the tap; everywhere else the
    // listener alone is enough. Resolves whether data can be expected.
    async function requestSensor() {
      if (typeof DeviceOrientationEvent === "undefined") return false;
      try {
        if (typeof DeviceOrientationEvent.requestPermission === "function") {
          const r = await DeviceOrientationEvent.requestPermission();
          if (r !== "granted") return false;
        }
      } catch (e) { return false; }
      window.addEventListener("deviceorientation", onOrient);
      return true;
    }
    // A held control: pointer down = on, up/cancel/leave = off. Pedals carry a
    // travel (0..1) so a gentle brake is possible: STAMP THEN EASE, the game's
    // own touch pedals' gesture (js/input/hold-buttons.js wireHold) — a touch
    // anywhere on the pedal is full travel, and sliding the thumb UP from where
    // it landed eases it off. An absolute "height on the pedal" mapping gave a
    // thumb aimed at the label of a ~150 px pedal half a brake (R3-PHONE-2).
    const releases = [];
    const releaseAll = () => { for (const r of releases) r(); };
    function hold(el, on, off, travel) {
      if (!el) return;
      const ids = new Set();
      const anchors = new Map();   // pointerId -> clientY at touch-down
      const level = (v) => { if (el.style && el.style.setProperty) el.style.setProperty("--travel", v.toFixed(2)); on(v); };
      releases.push(() => { if (!ids.size) return; ids.clear(); anchors.clear(); el.classList.remove("on"); off(); });
      const down = (e) => {
        ids.add(e.pointerId);
        try { el.setPointerCapture(e.pointerId); } catch (err) { /* not a pointer target */ }
        el.classList.add("on");
        if (travel) { anchors.set(e.pointerId, e.clientY); level(1); } else on(1);
        e.preventDefault();
      };
      const move = (e) => { if (travel && anchors.has(e.pointerId)) level(travelOf(anchors.get(e.pointerId), e.clientY)); };
      const up = (e) => {
        anchors.delete(e.pointerId);
        if (!ids.delete(e.pointerId)) return;
        if (!ids.size) { el.classList.remove("on"); off(); }
      };
      el.addEventListener("pointerdown", down);
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerup", up);
      el.addEventListener("pointercancel", up);
      // WebKit keeps ONE capture slot: pressing LOOK while GAS is held steals
      // GAS's capture, and treating that as a lift dropped the throttle under a
      // thumb still on it. Only a control that is gone counts as released
      // (js/input/hold-buttons.js holdTargetGone); a stray lift is caught below.
      el.addEventListener("lostpointercapture", (e) => { if (!el.isConnected || !el.getClientRects().length) up(e); });
      el.addEventListener("contextmenu", (e) => e.preventDefault());
    }
    if (typeof document !== "undefined") {
      // Every finger up (a pointerup that landed elsewhere), or the page hidden
      // by a call / app switch: nothing is held, so nothing stays pinned.
      const allUp = (e) => { if (!e.touches || !e.touches.length) releaseAll(); };
      document.addEventListener("touchend", allUp, true);
      document.addEventListener("touchcancel", allUp, true);
      document.addEventListener("visibilitychange", () => { if (document.hidden) releaseAll(); });
    }
    // hold-buttons.js's numbers: 12 px of slop (a thumb tremor is not a lift),
    // then 90 px of travel to the light end, never quite zero (sliding off is
    // not releasing). Moving DOWN past the landing point stays full.
    function travelOf(anchorY, y) {
      const up = Math.max(0, anchorY - y - PEDAL_DEAD_PX);
      return Math.max(PEDAL_MIN, Math.min(1, 1 - up / PEDAL_TRAVEL_PX));
    }
    const push = () => { if (session) session.sample(true); };
    hold(dom.gas, (v) => { thr = v; push(); }, () => { thr = 0; push(); }, true);
    hold(dom.brake, (v) => { brk = v; push(); }, () => { brk = 0; push(); }, true);
    hold(dom.lookBack, () => { held |= HELD.lookBack; push(); }, () => { held &= ~HELD.lookBack; push(); });
    // Edges fire on the DOWN, not the click: a paddle on a wheel answers the
    // finger, and a click waits for the release (and can be lost to a drag).
    // A menu direction held down repeats (`timers` is the test seam).
    // Wrapped, not the bare functions: `timers.setTimeout(...)` calls it as a
    // method of this object, and a browser's timers throw "Illegal invocation"
    // unless `this` is the window — which is how a held D-pad arrow died on a
    // real phone after its first press.
    const timers = opts.timers || {
      setTimeout: (f, ms) => setTimeout(f, ms), clearTimeout: (t) => clearTimeout(t),
      setInterval: (f, ms) => setInterval(f, ms), clearInterval: (t) => clearInterval(t),
    };
    // A tick under the thumb on every press, where the phone can (Android;
    // iOS Safari has no vibrate and this is silent there).
    const buzz = () => {
      try { if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(8); } catch (e) { /* advisory */ }
    };
    // Fire k now, then keep firing at a keyboard's cadence until stop().
    function repeater(k) {
      let rep = null;
      const stop = () => { if (rep) { timers.clearTimeout(rep); timers.clearInterval(rep); rep = null; } };
      const start = () => {
        stop();
        rep = timers.setTimeout(() => {
          rep = timers.setInterval(() => { if (session) session.event(k); else stop(); }, REPEAT_RATE_MS);
          if (rep && rep.unref) rep.unref();
        }, REPEAT_DELAY_MS);
        if (rep && rep.unref) rep.unref();
      };
      return { start, stop };
    }
    function edge(el, k, repeat) {
      if (!el) return;
      const r = repeater(k), stop = r.stop;
      el.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        el.classList.add("on");
        buzz();
        if (session) session.event(k);
        if (repeat) r.start();
      });
      const up = () => { el.classList.remove("on"); stop(); };
      el.addEventListener("pointerup", up);
      el.addEventListener("pointercancel", up);
      el.addEventListener("pointerleave", up);
      el.addEventListener("contextmenu", (e) => e.preventDefault());
    }
    // An action may have more than one button (OT on the grip AND on the face).
    for (const k of EVENTS) {
      const b = dom.buttons && dom.buttons[k];
      for (const el of (Array.isArray(b) ? b : [b])) edge(el, k, !!NAV_REPEAT[k]);
    }
    edge(dom.center, "calib");

    // THE MENU STICK: one disc that is both the D-pad and a thumbstick. A tap
    // on an edge fires that arrow at once; a thumb dragged from anywhere on it
    // fires the direction it points and repeats while held, and turning the
    // thumb to another direction fires that one. The nub follows the thumb
    // (to 55 % of the radius) and springs back on release; the arrow under
    // the live direction lights. The dead zone is the middle 28 %, and a
    // direction must beat the other axis by a fifth to take over from it, so
    // a thumb on the diagonal does not flicker between two arrows.
    function menuStick(base, nub, arrows) {
      if (!base) return;
      let id = null, dir = null, cx = 0, cy = 0, rad = 1;
      const reps = {};
      const lit = (k, on) => { const a = arrows && arrows[k]; if (a && a.classList) a.classList.toggle("on", on); };
      const aim = (k) => {
        if (k === dir) return;
        if (dir) { lit(dir, false); reps[dir].stop(); }
        dir = k;
        if (!k) return;
        lit(k, true);
        buzz();
        if (session) session.event(k);
        (reps[k] ||= repeater(k)).start();
      };
      const place = (e) => {
        const dx = e.clientX - cx, dy = e.clientY - cy, d = Math.hypot(dx, dy);
        const m = d ? Math.min(d, rad * 0.55) / d : 0;
        if (nub && nub.style) nub.style.transform = "translate(" + (dx * m).toFixed(1) + "px," + (dy * m).toFixed(1) + "px)";
        if (d < rad * 0.28) { aim(null); return; }
        const ax = Math.abs(dx), ay = Math.abs(dy);
        const horiz = dir === "navLeft" || dir === "navRight" ? ax * 1.2 >= ay : ax > ay * 1.2;
        aim(horiz ? (dx < 0 ? "navLeft" : "navRight") : (dy < 0 ? "navUp" : "navDown"));
      };
      base.addEventListener("pointerdown", (e) => {
        if (id !== null) return;
        id = e.pointerId;
        try { base.setPointerCapture(e.pointerId); } catch (err) { /* not a pointer target */ }
        const b = base.getBoundingClientRect();
        cx = b.left + b.width / 2; cy = b.top + b.height / 2; rad = Math.max(1, b.width / 2);
        base.classList.add("on");
        place(e);
        e.preventDefault();
      });
      base.addEventListener("pointermove", (e) => { if (e.pointerId === id) place(e); });
      const up = (e) => {
        if (e.pointerId !== id) return;
        id = null;
        aim(null);
        base.classList.remove("on");
        if (nub && nub.style) nub.style.transform = "";
      };
      base.addEventListener("pointerup", up);
      base.addEventListener("pointercancel", up);
      base.addEventListener("lostpointercapture", up);
      base.addEventListener("contextmenu", (e) => e.preventDefault());
    }
    menuStick(dom.stick, dom.nub, dom.arrows);

    let wake = null, wakeRequest = null, wakeGeneration = 0;
    function releaseWake(lock) {
      if (!lock) return;
      try { const p = lock.release(); if (p && p.catch) p.catch(() => {}); } catch (_) { /* already released */ }
    }
    function dropWake() {
      wakeGeneration++; wakeRequest = null;
      const lock = wake; wake = null;
      releaseWake(lock);
    }
    async function keepAwake() {
      if ((!connecting && !session) || wake || wakeRequest) return;
      const generation = wakeGeneration, request = {};
      wakeRequest = request;
      try {
        if (typeof navigator !== "undefined" && navigator.wakeLock) {
          const lock = await navigator.wakeLock.request("screen");
          if (generation !== wakeGeneration || (!connecting && !session)) { releaseWake(lock); return; }
          wake = lock;
          lock.addEventListener("release", () => { if (wake === lock) wake = null; });
        }
      } catch (e) { /* not granted: the page dims like any other */ }
      finally { if (wakeRequest === request) wakeRequest = null; }
    }
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && session) keepAwake(); });
    }

    let connecting = false, attempt = null;
    // RE-DIAL (R3-PHONE-3): a link whose wire died (this phone slept, took a
    // call, lost signal — anything but the game's own "peer" goodbye) dials
    // the same code once more as soon as the page is in front of the player;
    // the game hosts that code again for two minutes (host() re-link).
    let redial = null;
    function redialNow() {
      if (!redial || connecting || session || (typeof document !== "undefined" && document.visibilityState === "hidden")) return;
      const c = redial; redial = null;
      connect(c);
    }
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", redialNow);
    function cancel() {
      redial = null;
      const old = attempt; attempt = null;
      if (old) old.cancelled = true;
      connecting = false;
      const active = session; session = null;
      if (active) active.close();
      else if (old && old.transport) { try { old.transport.close(); } catch (_) { /* already closed */ } }
      dropWake(); releaseAll();
      if (dom.body) dom.body.classList.remove("linked");
      if (dom.connect) dom.connect.disabled = false;
    }
    if (typeof window !== "undefined" && window.addEventListener) window.addEventListener("pagehide", cancel);
    async function connect(codeIn) {
      if (connecting || session) return { ok: false, error: "busy" };
      const incoming = pairingFromUrl(codeIn);
      if (incoming) { pairing = incoming; codeIn = incoming.code; if (dom.codeIn) dom.codeIn.value = codeIn; paintCodeInput(); }
      if (pairing && (pairing.invalid || !deps.setSessionUrl(pairing.relay))) {
        say("That pairing link has an invalid relay address. Scan a new code from the game.", true);
        return { ok: false, error: "bad_relay" };
      }
      const code = deps.normalise(codeIn);
      if (!deps.valid(code)) { say(deps.privateRelay() ? "That is not a private room token — copy the full 32-character token." : "That is not a room code — six letters and numbers.", true); return { ok: false, error: "bad_code" }; }
      connecting = true;
      const owner = attempt = { cancelled: false, transport: null };
      if (dom.connect) dom.connect.disabled = true;
      // The sensor prompt rides the CONNECT tap: iOS shows it only inside a gesture
      // (a re-dial is outside one, and its listener is still on from the first link).
      const sensor = sensorOn || await requestSensor();
      if (attempt !== owner) return { ok: false, error: "cancelled" };
      if (!sensor) say("No motion sensor here — the pedals and buttons still work.", true);
      else say("Looking for the game…");
      keepAwake();
      try {
        await deps.prefetchIce();
        if (attempt !== owner) return { ok: false, error: "cancelled" };
        const transport = owner.transport = deps.rtc({ role: "guest", name: "pad" });
        if (!transport) { say("WebRTC is unavailable in this browser.", true); return { ok: false, error: "no_transport" }; }
        let answered = null;
        const done = await deps.swap({
          code, slot: "answer", want: "offer", token: owner,
          onTick: () => { if (attempt === owner && !session) say("Looking for the game… (room code " + code + ")"); },
          reply: async (invite) => {
            if (attempt !== owner) return null;
            say("Found it — connecting…");
            const res = await deps.acceptInvite(transport, invite, { pad: PROTO });
            if (attempt !== owner) return null;
            answered = res;
            return res.ok ? res.code : null;
          },
        });
        if (attempt !== owner) return { ok: false, error: "cancelled" };
        if (!done.ok) {
          const why = (done.error === "reply_failed" && answered && !answered.ok) ? answered : done;
          // The handshake's own words are for two friends racing; here the
          // other end is the game on the big screen.
          say(why.error === "build_mismatch" ? "The game and this page are on different versions — reload both and try again."
            : why.error === "expired" ? "The game is not offering that code any more — press STEER THIS GAME WITH A PHONE there for a new one."
            : why.message || "Could not reach the game. Make a new code there and try again.", true);
          try { transport.close(); } catch (e) { /* never opened */ }
          return why;
        }
        say("Connecting…");
        const active = padSession(transport, src, {
          now: opts.now || null,   // test seam: the harness's stepped clock, so both wire ends agree
          onHud: (h) => { lastHud = h; paintHud(dom.hud, h); },
          onOpen: () => {
            say(sensorOn || sensor ? "Connected — tilt to steer." : "Connected — pedals and buttons only.");
            if (dom.body) dom.body.classList.add("linked");
            if (opts.onOpen) opts.onOpen();
          },
          onClose: (why) => {
            if (attempt !== owner) return;
            attempt = null; owner.cancelled = true; connecting = false;
            session = null;
            dropWake(); releaseAll();
            if (dom.body) dom.body.classList.remove("linked");
            if (dom.connect) dom.connect.disabled = false;
            // WHICH END DIED: "peer" is the game's own goodbye (UNPAIR, its tab
            // closed); any other reason is this end's wire (rtc failed/disconnected).
            // A private relay's one mailbox is not hosted again, so no re-dial there.
            const wire = !!why && why !== "peer", again = wire && !deps.privateRelay();
            say(!wire ? "Disconnected — the game closed the link. Pair again from its Settings."
              : "Link lost — this phone slept, took a call or lost signal. " + (again ? "Reconnecting…" : "Pair again from the game's Settings."), true);
            if (opts.onClose) opts.onClose();
            if (again) { redial = code; redialNow(); }
          },
        });
        if (attempt !== owner) { active.close(); return { ok: false, error: "cancelled" }; }
        session = active;
        const tick = () => { if (session !== active) return; active.pump(); requestAnimationFrame(tick); };
        if (typeof requestAnimationFrame === "function") requestAnimationFrame(tick);
        return { ok: true };
      } finally {
        if (attempt === owner) {
          connecting = false;
          if (!session) { attempt = null; owner.cancelled = true; dropWake(); }
          if (dom.connect && !session) dom.connect.disabled = false;
        }
      }
    }
    if (dom.connect) dom.connect.addEventListener("click", () => connect(dom.codeIn ? dom.codeIn.value : ""));

    // SCAN THE GAME'S QR, IN THE PAGE. A phone that opened this page from the
    // game's title (or from a typed URL) has no code in its fragment; the
    // camera app would open a NEW tab, so the page reads the QR itself with
    // the lobby's reader (js/net/scan.js: BarcodeDetector, else jsQR). The
    // motion-sensor prompt rides the SCAN tap, because the code arrives later,
    // outside any gesture, and iOS asks only inside one.
    const Scan = deps.scan ? deps.scan() : (typeof NetScan !== "undefined" ? NetScan : null);
    let scanner = null;
    const showScan = (on) => {
      if (dom.scanBox) dom.scanBox.hidden = !on;
      if (dom.scan) dom.scan.textContent = on ? "CANCEL SCAN" : "SCAN QR CODE";
    };
    function stopScan() { if (scanner) scanner.stop(); showScan(false); }
    async function scan() {
      if (scanner && scanner.active()) { stopScan(); say("Type the room code the game shows, then CONNECT."); return { ok: false, error: "cancelled" }; }
      if (connecting || session) return { ok: false, error: "busy" };
      await requestSensor();
      scanner = scanner || Scan.create();
      showScan(true);
      say("Point the camera at the QR code on the game's screen.");
      const r = await scanner.start(dom.video, (text) => {
        showScan(false);
        pairing = pairingFromUrl(text);
        paintCodeInput();
        const code = pairing ? pairing.code : String(text || "").trim();
        if (dom.codeIn) dom.codeIn.value = code;
        connect(code);
      });
      if (!r.ok) {
        showScan(false);
        if (r.error !== "cancelled") say(String(r.message || "The camera did not start.").replace(/paste/g, "type"), true);
      }
      return r;
    }
    if (dom.scan) {
      if (!Scan || !Scan.supported()) dom.scan.hidden = true;
      else dom.scan.addEventListener("click", () => { scan(); });
    }
    if (typeof document !== "undefined" && document.addEventListener) {
      document.addEventListener("visibilitychange", () => { if (document.hidden) stopScan(); });
    }
    const fromUrl = pairing && pairing.code;
    if (fromUrl && dom.codeIn) dom.codeIn.value = fromUrl;
    say(fromUrl ? "Tap CONNECT to pair with the game." : Scan && Scan.supported() ? "Scan the game's QR code, or type its room code and CONNECT." : "Type the room code the game shows, then CONNECT.");

    return {
      connect,
      cancel,
      scan,
      // The test/console handle: what the page holds, and a way to paint a
      // dash without a link (controller.html?demo drives the LCD from it).
      paintHud: (h) => { lastHud = h; paintHud(dom.hud, h); },
      armSensor: requestSensor,   // the demo turns the rim with a real phone's tilt, unlinked
      setRoll: (r) => { roll = r; paintRoll(); if (session) session.sample(); },   // stands in for the sensor
      pump: () => (session ? session.pump() : 0),   // the frame tick, for a harness with no rAF
      state: () => ({ linked: !!session, roll, thr, brk, held, sensorOn, hud: lastHud, stats: session ? session.stats() : null }),
    };
  }

  return {
    PROTO, HELD, EVENTS, DASH, HEARTBEAT_MS, HUD_MS,
    encodeSample, decodeSample, encodeHud, decodeHud, encodeEvent, encodeHaptic, encodeHello, decodeEvent,
    teamHex, fmtLap, paintHud,
    padUrl, codeFromUrl,
    link, host, padSession, pad,
  };
})();
Object.freeze(PhonePad);
