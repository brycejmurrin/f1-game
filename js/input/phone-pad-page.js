/* PhonePadPage — the phone wheel. LCD paint and the controller.html page.
   Elements arrive from the shell; this file never looks an id up. The wire
   format is PhonePadCodec. The desktop session (PhonePad.padSession) stays in
   phone-pad.js and is called once that file has evaluated. */
"use strict";

const PhonePadPage = (function () {
  const HELD = Object.freeze({ lookBack: 1 });
  const REPEAT_DELAY_MS = 380, REPEAT_RATE_MS = 110;

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
    text("last", h.lastLapMs ? "LAST " + PhonePadCodec.fmtLap(h.lastLapMs) : "");
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
    let pairing = PhonePadCodec.pairingFromUrl(opts.href);
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
    let roll = null, thr = 0, brk = 0, held = 0, steer = 0, steeringMode = "tilt";
    let session = null;
    let sensorOn = false;
    let lastHud = null;
    const src = { roll: () => roll, thr: () => thr, brk: () => brk, held: () => held, steer: () => steeringMode === "touch" ? steer : null };

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
      if (steeringMode !== "tilt") return;
      const r = TiltRoll.rollDeg(e.beta, e.gamma, TiltRoll.screenAngle());
      if (r === null) return;
      roll = r;
      sensorOn = true;
      paintRoll();
      if (session) session.sample();
    }
    // iOS needs the permission prompt INSIDE the tap; everywhere else the
    // listener alone is enough. Resolves whether data can be expected.
    // Attach once: SCAN arms the sensor inside its gesture, then CONNECT (or a
    // second armSensor / demo tap) would otherwise stack another
    // deviceorientation listener — each event then sample()s and paints N times
    // until the tab is closed. sensorOn only flips on the first reading, so it
    // cannot gate the attach; a dedicated flag matches input.js attachGyro.
    let sensorAttached = false;
    async function requestSensor() {
      if (typeof DeviceOrientationEvent === "undefined") return false;
      try {
        if (typeof DeviceOrientationEvent.requestPermission === "function") {
          const r = await DeviceOrientationEvent.requestPermission();
          if (r !== "granted") return false;
        }
      } catch (e) { return false; }
      if (!sensorAttached) {
        sensorAttached = true;
        window.addEventListener("deviceorientation", onOrient);
      }
      return true;
    }
    // A held control: pointer down = on, up/cancel/leave = off. Pedals carry a
    // travel (0..1) so a gentle brake is possible: STAMP THEN EASE, the game's
    // own touch pedals' gesture (js/input/hold-buttons.js wireHold) — a touch
    // anywhere on the pedal is full travel, and sliding the thumb UP from where
    // it landed eases it off. An absolute "height on the pedal" mapping gave a
    // thumb aimed at the label of a ~150 px pedal half a brake (R3-PHONE-2).
    const releases = [], pointerReleases = [];
    const releaseAll = (pointersOnly) => { for (const r of releases) r(pointersOnly === true); };
    function hold(el, on, off, travel) {
      if (!el) return;
      const ids = new Set();
      const anchors = new Map();   // pointerId -> clientY at touch-down
      const levels = new Map();    // each contact keeps its own pedal travel
      // `edge` false = a slide (rate-capped, coalesced); a press or lift is sent at once.
      const level = (v, edge) => { if (el.style && el.style.setProperty) el.style.setProperty("--travel", v.toFixed(2)); on(v, edge); };
      const paintLevel = (edge = true) => { let strongest = 0; for (const v of levels.values()) strongest = Math.max(strongest, v); level(strongest, edge); };
      releases.push((pointersOnly) => {
        // A last-finger-up fallback says nothing about keys still held.
        // Blur, backgrounding and disconnect still clear every input source.
        if (pointersOnly) { for (const id of Array.from(ids)) if (typeof id !== "string") up({ pointerId: id }); return; }
        if (!ids.size) return;
        ids.clear(); anchors.clear(); levels.clear(); el.classList.remove("on"); if (travel) paintLevel(); else off();
      });
      const down = (e) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        ids.add(e.pointerId);
        try { el.setPointerCapture(e.pointerId); } catch (err) { /* not a pointer target */ }
        el.classList.add("on");
        if (travel) { anchors.set(e.pointerId, e.clientY); levels.set(e.pointerId, 1); paintLevel(); } else on(1);
        e.preventDefault();
      };
      const move = (e) => { if (travel && anchors.has(e.pointerId)) { levels.set(e.pointerId, travelOf(anchors.get(e.pointerId), e.clientY)); paintLevel(false); } };
      const up = (e) => {
        anchors.delete(e.pointerId);
        levels.delete(e.pointerId);
        if (!ids.delete(e.pointerId)) return;
        if (!ids.size) el.classList.remove("on");
        if (travel) paintLevel(); else if (!ids.size) off();
      };
      // Keyboard holds share the contact set, so releasing a key cannot
      // cancel a thumb that is still down (or vice versa).
      const keyId = (key) => key === " " || key === "Enter" ? "key:" + key : null;
      el.addEventListener("keydown", (e) => {
        const id = keyId(e.key);
        if (!id || (el === dom.gas && dom.body && dom.body.classList.contains("throttle-auto"))) return;
        e.preventDefault();
        if (ids.has(id)) return;
        ids.add(id); el.classList.add("on");
        if (travel) { levels.set(id, 1); paintLevel(); } else on(1);
      });
      el.addEventListener("keyup", (e) => {
        const id = keyId(e.key);
        if (!id) return;
        e.preventDefault(); up({ pointerId: id });
      });
      el.addEventListener("blur", () => {
        for (const id of Array.from(ids)) if (typeof id === "string") up({ pointerId: id });
      });
      el.addEventListener("pointerdown", down);
      el.addEventListener("pointermove", move);
      pointerReleases.push(up);
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
      // The last finger up clears pointer holds, including a lost lift.
      // Backgrounding or a window blur clears keyboard holds as well.
      const allUp = (e) => { if (!e.touches || !e.touches.length) releaseAll(true); };
      const releasePointer = (e) => { for (const up of pointerReleases) up(e); };
      document.addEventListener("pointerup", releasePointer, true);
      document.addEventListener("pointercancel", releasePointer, true);
      if (typeof window !== "undefined" && window.addEventListener) { window.addEventListener("pointerup", releasePointer, true); window.addEventListener("pointercancel", releasePointer, true); window.addEventListener("blur", releaseAll); }
      document.addEventListener("touchend", allUp, true);
      document.addEventListener("touchcancel", allUp, true);
      document.addEventListener("visibilitychange", () => { if (document.hidden) releaseAll(); });
    }
    // PedalTravel: 12 px of slop, then 90 px to the 0.12 floor. Moving down
    // past the landing point stays full.
    function travelOf(anchorY, y) { return PedalTravel.ease(anchorY, y); }
    // aria-valuenow is an integer percent (controller.html: min -100, max 100), written
    // only when it changes; a drag/slide (edge false) keeps the session's 15 ms cap.
    let steerAria = "0";
    const push = (edge = true) => {
      const pct = String(Math.round(steer * 100));
      if (pct !== steerAria && dom.steer && dom.steer.setAttribute) { steerAria = pct; dom.steer.setAttribute("aria-valuenow", pct); }
      if (session) session.sample(edge !== false);
    };
    function setSteeringMode(mode) {
      if (mode !== "tilt" && mode !== "touch") return false;
      if (mode === "touch" && (!session || !session.health().touchSupported)) { say("Touch steering needs an updated game. Reload the game and reconnect.", true); return false; }
      steeringMode = mode; steer = 0; push();
      if (dom.steeringMode) dom.steeringMode.value = mode;
      if (dom.steer) dom.steer.hidden = mode !== "touch";
      return true;
    }
    if (dom.steeringMode) dom.steeringMode.addEventListener("change", () => { if (!setSteeringMode(dom.steeringMode.value)) dom.steeringMode.value = steeringMode; });
    if (dom.steer) {
      let steeringPointer = null, anchorX = 0, stripW = 40;   // strip width read once per gesture, not per move (audit4 UB4)
      const steeringKeys = new Set();
      const release = (e) => { if (e && e.pointerId !== steeringPointer) return; steeringPointer = null; if (!e) steeringKeys.clear(); steer = steeringKeys.size ? (Array.from(steeringKeys).pop() === "ArrowLeft" ? -1 : 1) : 0; push(); };
      releases.push((pointersOnly) => release(pointersOnly ? { pointerId: steeringPointer } : undefined)); pointerReleases.push(release);
      dom.steer.addEventListener("pointerdown", (e) => { if ((e.pointerType === "mouse" && e.button !== 0) || steeringMode !== "touch" || steeringPointer !== null) return; steeringPointer = e.pointerId; anchorX = e.clientX; stripW = Math.max(40, dom.steer.getBoundingClientRect().width * 0.4); steer = 0; try { dom.steer.setPointerCapture(e.pointerId); } catch (_) { /* document release fanout still centers steering when capture is refused */ } e.preventDefault(); push(); });
      dom.steer.addEventListener("pointermove", (e) => { if (steeringPointer !== e.pointerId) return; steer = PhonePadCodec.num((e.clientX - anchorX) / stripW, -1, 1); push(false); });
      dom.steer.addEventListener("pointerup", release); dom.steer.addEventListener("pointercancel", release);
      dom.steer.addEventListener("keydown", (e) => { if (steeringMode !== "touch" || !["ArrowLeft", "ArrowRight"].includes(e.key)) return; e.preventDefault(); if (steeringKeys.has(e.key)) return; steeringKeys.add(e.key); steer = e.key === "ArrowLeft" ? -1 : 1; push(); });
      dom.steer.addEventListener("keyup", (e) => {
        if (!steeringKeys.delete(e.key)) return;
        e.preventDefault();
        const last = Array.from(steeringKeys).pop();
        steer = last ? (last === "ArrowLeft" ? -1 : 1) : 0; push();
      });
      dom.steer.addEventListener("blur", () => release());
    }
    hold(dom.gas, (v, edge) => { thr = v; push(edge); }, () => { thr = 0; push(); }, true);
    hold(dom.brake, (v, edge) => { brk = v; push(edge); }, () => { brk = 0; push(); }, true);
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
      const fire = () => { buzz(); if (session) session.event(k); };
      el.addEventListener("click", (e) => { if (!e.detail) { e.preventDefault(); fire(); } });
      el.addEventListener("pointerdown", (e) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        e.preventDefault();
        el.classList.add("on");
        fire();
        if (repeat) r.start();
      });
      const up = () => { el.classList.remove("on"); stop(); };
      releases.push(up);   // a lost lift must not repeat a menu step forever (the nets above)
      el.addEventListener("pointerup", up);
      el.addEventListener("pointercancel", up);
      el.addEventListener("pointerleave", up);
      el.addEventListener("contextmenu", (e) => e.preventDefault());
    }
    // An action may have more than one button (OT on the grip AND on the face).
    for (const k of PhonePadCodec.EVENTS) {
      const b = dom.buttons && dom.buttons[k];
      for (const el of (Array.isArray(b) ? b : [b])) edge(el, k, !!PhonePadCodec.NAV_REPEAT[k]);
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
        if ((e.pointerType === "mouse" && e.button !== 0) || id !== null) return;
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
      // In the release nets too: a lost lift otherwise repeats forever and
      // `id` stays set, so the stick refuses every later press.
      releases.push(() => { if (id !== null) up({ pointerId: id }); });
      pointerReleases.push(up);   // an outside lift must work even when capture was refused
      base.addEventListener("pointerup", up);
      base.addEventListener("pointercancel", up);
      // WebKit can move its single capture slot to a second held control.
      // Keep navigating while this stick is still visible; document/window
      // pointerup and pointercancel catch the actual lift even without capture.
      base.addEventListener("lostpointercapture", (e) => { if (!base.isConnected || !base.getClientRects().length) up(e); });
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
    // A re-dial can land before the game has re-hosted the code (it waits out
    // its own disconnect grace first): retry a failed one on this backoff,
    // inside the game's 120 s re-host window, then give up (#2198).
    const REDIAL_BACKOFF_MS = [5000, 15000, 30000];
    let redialTries = 0, redialTimer = null, redialing = false;
    function stopRedial() { redial = null; redialTries = 0; if (redialTimer) { clearTimeout(redialTimer); redialTimer = null; } }
    function redialNow() {
      if (!redial || connecting || session || (typeof document !== "undefined" && document.visibilityState === "hidden")) return;
      const c = redial; redial = null;
      redialing = true;
      connect(c);
    }
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", redialNow);
    function cancel() {
      stopScan();
      stopRedial();
      const old = attempt; attempt = null;
      if (old) old.cancelled = true;
      connecting = false;
      const active = session;
      steeringMode = "tilt"; if (dom.steeringMode) dom.steeringMode.value = "tilt"; if (dom.steer) dom.steer.hidden = true;
      if (active) { steer = 0; thr = brk = held = 0; active.sample(true); }
      session = null;
      if (active) active.close();
      else if (old && old.transport) { try { old.transport.close(); } catch (_) { /* already closed */ } }
      dropWake(); releaseAll();
      if (dom.body) dom.body.classList.remove("linked");
      if (dom.connect) dom.connect.disabled = false;
    }
    if (typeof window !== "undefined" && window.addEventListener) window.addEventListener("pagehide", cancel);
    async function connect(codeIn) {
      const isRedial = redialing; redialing = false;
      if (connecting || session) return { ok: false, error: "busy" };
      stopScan();
      if (!isRedial) stopRedial();   // a CONNECT tap replaces any pending retry
      const incoming = PhonePadCodec.pairingFromUrl(codeIn);
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
      if (!sensor) say("No motion sensor — choose TOUCH STRIP under STEERING after connecting to an updated game.", true);
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
            const res = await deps.acceptInvite(transport, invite, { pad: PhonePadCodec.PROTO });
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
            : why.error === "expired" ? "The game is not offering that code any more — choose MAKE NEW CODE in its phone-controller settings."
            : why.message || "Could not reach the game. Make a new code there and try again.", true);
          try { transport.close(); } catch (e) { /* never opened */ }
          if (isRedial && why.error !== "build_mismatch") {
            if (redialTries < REDIAL_BACKOFF_MS.length) {
              const wait = REDIAL_BACKOFF_MS[redialTries++];
              say("Link lost — reconnecting… (try " + redialTries + " of " + REDIAL_BACKOFF_MS.length + ")", true);
              redialTimer = setTimeout(() => { redialTimer = null; redial = code; redialNow(); }, wait);
            } else {
              redialTries = 0;
              say("Could not reconnect to the game — press STEER THIS GAME WITH A PHONE there, then CONNECT.", true);
            }
          }
          return why;
        }
        say("Connecting…");
        const active = PhonePad.padSession(transport, src, {
          now: opts.now || null,   // test seam: the harness's stepped clock, so both wire ends agree
          onHud: (h) => { lastHud = h; paintHud(dom.hud, h); },
          onOpen: () => {
            say(sensorOn || sensor ? "Connected — tilt to steer." : "Connected — pedals and buttons only.");
            if (dom.body) dom.body.classList.add("linked");
            if (opts.onOpen) opts.onOpen();
          },
          onHealth: (h) => {
            const text = h.state === "unavailable" ? "INPUT AGE UNAVAILABLE · UPDATE GAME" : h.state === "waiting" ? "WAITING FOR INPUT ACK" : h.state === "reconnecting" ? "INPUT NOT ACKNOWLEDGED" : "INPUT " + h.state.toUpperCase();
            if (dom.health && dom.health.textContent !== text) dom.health.textContent = text;
            if (dom.healthAge) { const age = h.ageMs == null ? "" : Math.round(h.ageMs / 100) * 100 + " ms since acknowledged sample"; if (dom.healthAge.textContent !== age) dom.healthAge.textContent = age; }
          },
          onClose: (why) => {
            if (attempt !== owner) return;
            steer = 0; steeringMode = "tilt"; if (dom.steeringMode) dom.steeringMode.value = "tilt"; if (dom.health) dom.health.textContent = "INPUT DISCONNECTED"; if (dom.steer) dom.steer.hidden = true;
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
        redialTries = 0;   // a link is up: a later drop gets the full backoff again
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
    let scanner = null, scanGeneration = 0, scanPending = false;
    const showScan = (on) => {
      if (dom.scanBox) dom.scanBox.hidden = !on;
      if (dom.scan) dom.scan.textContent = on ? "CANCEL SCAN" : "SCAN QR CODE";
    };
    function stopScan() { scanGeneration++; scanPending = false; if (scanner) scanner.stop(); showScan(false); }
    async function scan() {
      if (scanPending || (scanner && scanner.active())) { stopScan(); say("Type the room code the game shows, then CONNECT."); return { ok: false, error: "cancelled" }; }
      if (connecting || session) return { ok: false, error: "busy" };
      const generation = ++scanGeneration;
      scanPending = true;
      const current = () => generation === scanGeneration && !connecting && !session &&
        !(typeof document !== "undefined" && document.hidden);
      await requestSensor();
      if (!current()) { if (generation === scanGeneration) scanPending = false; return { ok: false, error: "cancelled" }; }
      scanner = scanner || Scan.create();
      showScan(true);
      say("Point the camera at the QR code on the game's screen.");
      const r = await scanner.start(dom.video, (text) => {
        if (!current()) return;
        showScan(false);
        pairing = PhonePadCodec.pairingFromUrl(text);
        paintCodeInput();
        const code = pairing ? pairing.code : String(text || "").trim();
        if (dom.codeIn) dom.codeIn.value = code;
        connect(code);
      });
      if (generation !== scanGeneration) return { ok: false, error: "cancelled" };
      scanPending = false;
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
      setSteeringMode,
      // The test/console handle: what the page holds, and a way to paint a
      // dash without a link (controller.html?demo drives the LCD from it).
      paintHud: (h) => { lastHud = h; paintHud(dom.hud, h); },
      armSensor: requestSensor,   // the demo turns the rim with a real phone's tilt, unlinked
      setRoll: (r) => { roll = r; paintRoll(); if (session) session.sample(); },   // stands in for the sensor
      pump: () => (session ? session.pump() : 0),   // the frame tick, for a harness with no rAF
      state: () => ({ linked: !!session, roll, thr, brk, held, steer, steeringMode, sensorOn, hud: lastHud, stats: session ? session.stats() : null }),
    };
  }

  return { HELD, DASH, paintHud, pad };
})();
Object.freeze(PhonePadPage);
