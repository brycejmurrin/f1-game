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
    "camera", "recover", "radio", "calib", "pause"]);
  // Dash flag bits (desktop → phone).
  const DASH = Object.freeze({ boost: 1, otArmed: 2, otActive: 4, xArmed: 8, xOpen: 16,
    retired: 32, timeTrial: 64, paused: 128, redline: 256,
    // The desktop's CONTROL MODES: what the wheel should not offer. Gears on
    // AUTO have no paddles, throttle on AUTO has no GAS zone, aero on AUTO (or
    // a circuit with no zones) has no AERO button. Sent with every dash so a
    // setting changed mid-session reaches the phone within a frame.
    gearsAuto: 512, throttleAuto: 1024, aeroAuto: 2048, aeroNone: 4096 });
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
  // {t:"hi", side} once on open from each end.
  function encodeEvent(k) { return JSON.stringify({ t: "ev", k }); }
  function encodeHaptic(ms) { return JSON.stringify({ t: "hap", ms: Math.max(0, Math.min(1000, ms | 0)) }); }
  function encodeHello(side) { return JSON.stringify({ t: "hi", side, p: PROTO }); }
  function decodeEvent(text) {
    let o;
    try { o = JSON.parse(typeof text === "string" ? text : ""); } catch (e) { return null; }
    if (!o || typeof o !== "object") return null;
    if (o.t === "ev") return EVENTS.includes(o.k) ? { t: "ev", k: o.k } : null;
    if (o.t === "hap") return { t: "hap", ms: Math.max(0, Math.min(1000, o.ms | 0)) };
    if (o.t === "hi") return { t: "hi", side: String(o.side || ""), p: o.p | 0 };
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
  function padUrl(code, base) {
    let root = base;
    if (!root) {
      try { root = location.origin + location.pathname; } catch (e) { root = ""; }
    }
    root = String(root).replace(/[^/]*$/, "");      // …/index.html → …/
    return root + "controller.html#pad=" + code;
  }
  function codeFromUrl(href) {
    try {
      const h = (href != null ? String(href) : location.hash) || "";
      const m = h.match(/[#&]pad=([^&\s]+)/);
      return m ? decodeURIComponent(m[1]) : null;
    } catch (e) { return null; }
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
      if (ev.t === "ev") { events++; input.remoteEvent(ev.k); }
    });
    const onClose = () => {
      if (closed) return;
      closed = true;
      if (raf) { try { cancelAnimationFrame(raf); } catch (e) { /* no rAF here */ } raf = 0; }
      input.remoteLost();
      input.setRemoteHaptics(null);
      if (opts.onClose) { try { opts.onClose(); } catch (e) { /* caller's problem */ } }
    };
    transport.onClose(onClose);

    const armed = () => {
      input.setRemoteHaptics((ms) => { transport.send(T.EVENT, encodeHaptic(ms)); });
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
      makeCode: () => NetRendezvous.makeCode(),
    }, deps || {});
    const say = (t, bad) => { if (ui.say) { try { ui.say(t, !!bad); } catch (e) { /* ui's problem */ } } };
    const qr = (url, code) => { if (ui.qr) { try { ui.qr(url, code); } catch (e) { /* ui's problem */ } } };
    let phase = "idle";          // idle | preparing | waiting | connecting | linked | lost | cancelled | failed
    let transport = null, room = null, active = null;
    const token = { cancelled: false };
    let code = null;

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

    (async () => {
      try {
        phase = "preparing";
        say("Preparing… (this can take a few seconds)");
        await deps.prefetchIce();
        if (phase !== "preparing") return;
        transport = deps.rtc({ role: "host", name: "pad" });
        if (!transport) { phase = "failed"; say("WebRTC is unavailable in this browser.", true); return; }
        const invite = await deps.createInvite(transport, { pad: PROTO });
        if (phase !== "preparing") return;
        if (!invite.ok) { phase = "failed"; say(invite.message || "Could not prepare the pairing.", true); return; }
        code = deps.makeCode();
        const url = padUrl(code);
        phase = "waiting";
        qr(url, code);
        say("Scan the code with your phone's camera, or open the link and type the room code.");
        let accepted = false;
        const sub = await deps.hostRoom({
          code, mine: invite.code, token,
          onTick: () => { if (phase === "waiting") say("Waiting for your phone… (room code " + code + ")"); },
          onFail: (r) => {
            if (!r || r.error === "cancelled" || r.error === "stopped" || phase === "linked") return;
            if (r.advisory) { say(r.message, true); return; }
            phase = "failed"; say(r.message || "The room service went away — try again.", true);
          },
          mintOffer: async () => null,     // one phone; a second scan gets nothing
          onJoiner: async (_who, answer) => {
            if (accepted || phase !== "waiting") return;
            accepted = true;
            phase = "connecting";
            say("Phone found — connecting…");
            const acc = await deps.acceptAnswer(transport, answer);
            if (!acc.ok) { accepted = false; phase = "waiting"; say(acc.message || "That answer could not be read.", true); return; }
            active = link(transport, {
              hud: ui.hud || null,
              onOpen: () => {
                phase = "linked";
                dropRoom();
                qr(null, null);
                say("Phone connected — tilt to steer. RECALIBRATE TILT levels it.");
                Log.info("input", "phone pad linked");
                if (ui.linked) { try { ui.linked(); } catch (e) { /* ui's problem */ } }
              },
              onClose: () => {
                if (phase === "cancelled") return;
                phase = "lost";
                say("Phone disconnected.", true);
                Log.info("input", "phone pad lost");
                if (ui.lost) { try { ui.lost(); } catch (e) { /* ui's problem */ } }
              },
            });
          },
        });
        if (!sub || !sub.ok) {
          if (phase === "waiting") { phase = "failed"; say((sub && sub.message) || "Could not open a room — check the connection.", true); }
          return;
        }
        room = sub;
      } catch (e) {
        Log.warn("input", "phone pad host failed: " + ((e && e.message) || e));
        if (phase !== "cancelled") { phase = "failed"; say("Pairing failed — try again.", true); }
      }
    })();

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
      transport.send(T.EVENT, encodeHello("pad"));
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
    text("pos", h.flags & DASH.retired ? "DNF" : h.flags & DASH.timeTrial ? "" : h.pos ? "P" + h.pos + "/" + h.cars : "");
    text("last", h.lastLapMs ? "LAST " + fmtLap(h.lastLapMs) : "");
    text("ot", h.flags & DASH.otActive ? "OVERTAKE" : h.flags & DASH.otArmed ? "OT READY" : "OT");
    text("aero", h.flags & DASH.aeroNone ? "NO ZONES" : h.flags & DASH.aeroAuto ? (h.flags & DASH.xOpen ? "AUTO X-MODE" : "AERO AUTO")
      : h.flags & DASH.xOpen ? "X-MODE" : h.flags & DASH.xArmed ? "AERO ARMED" : "AERO");
    text("flag", h.state === "count" ? "LIGHTS" : h.flags & DASH.paused ? "PAUSED" : !inRace ? "PIT LANE" : CAUTION[h.caution] || "");
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
    }
  }

  // ── phone: the whole page ─────────────────────────────────────────────────
  // dom: { body, status, codeIn, connect, gas, brake, lookBack, center, rim,
  //        buttons: {shiftUp, shiftDown, …}, hud: {gear, speed, …} }.
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
    }, opts.deps || {});
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
    // travel (0..1 along the pedal's height) so a gentle brake is possible.
    function hold(el, on, off, travel) {
      if (!el) return;
      const ids = new Set();
      const down = (e) => {
        ids.add(e.pointerId);
        try { el.setPointerCapture(e.pointerId); } catch (err) { /* not a pointer target */ }
        el.classList.add("on");
        on(travel ? travelOf(el, e) : 1);
        e.preventDefault();
      };
      const move = (e) => { if (travel && ids.has(e.pointerId)) on(travelOf(el, e)); };
      const up = (e) => {
        if (!ids.delete(e.pointerId)) return;
        if (!ids.size) { el.classList.remove("on"); off(); }
      };
      el.addEventListener("pointerdown", down);
      el.addEventListener("pointermove", move);
      el.addEventListener("pointerup", up);
      el.addEventListener("pointercancel", up);
      el.addEventListener("lostpointercapture", up);
      el.addEventListener("contextmenu", (e) => e.preventDefault());
    }
    function travelOf(el, e) {
      const r = el.getBoundingClientRect();
      if (!r.height) return 1;
      // Bottom of the pedal is 1, the top edge ~0.3: a thumb never rests at zero.
      return Math.max(0.3, Math.min(1, (e.clientY - r.top) / r.height));
    }
    const push = () => { if (session) session.sample(true); };
    hold(dom.gas, (v) => { thr = v; push(); }, () => { thr = 0; push(); }, true);
    hold(dom.brake, (v) => { brk = v; push(); }, () => { brk = 0; push(); }, true);
    hold(dom.lookBack, () => { held |= HELD.lookBack; push(); }, () => { held &= ~HELD.lookBack; push(); });
    // Edges fire on the DOWN, not the click: a paddle on a wheel answers the
    // finger, and a click waits for the release (and can be lost to a drag).
    function edge(el, k) {
      if (!el) return;
      el.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        el.classList.add("on");
        if (session) session.event(k);
      });
      const up = () => el.classList.remove("on");
      el.addEventListener("pointerup", up);
      el.addEventListener("pointercancel", up);
      el.addEventListener("contextmenu", (e) => e.preventDefault());
    }
    for (const k of EVENTS) edge(dom.buttons && dom.buttons[k], k);
    edge(dom.center, "calib");

    let wake = null;
    async function keepAwake() {
      try {
        if (typeof navigator !== "undefined" && navigator.wakeLock && !wake) {
          wake = await navigator.wakeLock.request("screen");
          wake.addEventListener("release", () => { wake = null; });
        }
      } catch (e) { /* not granted: the page dims like any other */ }
    }
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && session) keepAwake(); });
    }

    let connecting = false;
    async function connect(codeIn) {
      if (connecting || session) return { ok: false, error: "busy" };
      const code = deps.normalise(codeIn);
      if (!deps.valid(code)) { say("That is not a room code — six letters and numbers.", true); return { ok: false, error: "bad_code" }; }
      connecting = true;
      if (dom.connect) dom.connect.disabled = true;
      // The sensor prompt rides the CONNECT tap: iOS shows it only inside a gesture.
      const sensor = await requestSensor();
      if (!sensor) say("No motion sensor here — the pedals and buttons still work.", true);
      else say("Looking for the game…");
      keepAwake();
      try {
        await deps.prefetchIce();
        const transport = deps.rtc({ role: "guest", name: "pad" });
        if (!transport) { say("WebRTC is unavailable in this browser.", true); return { ok: false, error: "no_transport" }; }
        let answered = null;
        const done = await deps.swap({
          code, slot: "answer", want: "offer", token: { cancelled: false },
          onTick: () => { if (!session) say("Looking for the game… (room code " + code + ")"); },
          reply: async (invite) => {
            say("Found it — connecting…");
            const res = await deps.acceptInvite(transport, invite, { pad: PROTO }, { gatherTimeoutMs: 2500 });
            answered = res;
            return res.ok ? res.code : null;
          },
        });
        if (!done.ok) {
          const why = (done.error === "reply_failed" && answered && !answered.ok) ? answered : done;
          say(why.message || "Could not reach the game. Make a new code there and try again.", true);
          try { transport.close(); } catch (e) { /* never opened */ }
          return why;
        }
        say("Connecting…");
        session = padSession(transport, src, {
          now: opts.now || null,   // test seam: the harness's stepped clock, so both wire ends agree
          onHud: (h) => { lastHud = h; paintHud(dom.hud, h); },
          onOpen: () => {
            say(sensorOn || sensor ? "Connected — tilt to steer." : "Connected — pedals and buttons only.");
            if (dom.body) dom.body.classList.add("linked");
            if (opts.onOpen) opts.onOpen();
          },
          onClose: () => {
            session = null;
            if (dom.body) dom.body.classList.remove("linked");
            if (dom.connect) dom.connect.disabled = false;
            say("Disconnected — the game closed the link. Pair again from its Settings.", true);
            if (opts.onClose) opts.onClose();
          },
        });
        const tick = () => { if (!session) return; session.pump(); requestAnimationFrame(tick); };
        if (typeof requestAnimationFrame === "function") requestAnimationFrame(tick);
        return { ok: true };
      } finally {
        connecting = false;
        if (dom.connect && !session) dom.connect.disabled = false;
      }
    }
    if (dom.connect) dom.connect.addEventListener("click", () => connect(dom.codeIn ? dom.codeIn.value : ""));
    const fromUrl = codeFromUrl();
    if (fromUrl && dom.codeIn) dom.codeIn.value = fromUrl;
    say(fromUrl ? "Tap CONNECT to pair with the game." : "Type the room code the game shows, then CONNECT.");

    return {
      connect,
      // The test/console handle: what the page holds, and a way to paint a
      // dash without a link (controller.html?demo drives the LCD from it).
      paintHud: (h) => { lastHud = h; paintHud(dom.hud, h); },
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
