/* PhonePadPage — the phone wheel. LCD paint and the controller.html page.
   Elements arrive from the shell; this file never looks an id up. The wire
   format is PhonePadCodec. The transport session (PhonePad.padSession) stays in
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
    quali: 8192, practice: 16384,
    // OT switched on (#6365). otActive is only "deploying now" and drops under braking; a host
    // without this bit leaves the phone on otActive.
    otOn: 32768 });

  // PRESS MODE (#6365): one latch per toggle action (BOOST / OT / AERO), shared by its buttons. Its state is the
  // HOST's dash bit; after an edge the asked-for state stands until the host shows it or CONFIRM_MS passes
  // (refused: flat battery, OT not armed). Before any dash, the local latch. `send(k)` → false when unlinked.
  const LATCH_BITS = Object.freeze({ boost: DASH.boost, overtake: DASH.otOn | DASH.otActive, aero: DASH.xOpen });
  const CONFIRM_MS = 600, latchButtons = Object.freeze(Object.keys(LATCH_BITS));
  function pressLatch(k, send, clock = () => Date.now()) {
    let host = null, local = false, expect = null, sentAt = -Infinity;
    const on = () => host === null ? local : expect !== null && clock() - sentAt < CONFIRM_MS ? expect : host;
    const fire = () => {
      const want = !on();
      if (send(k) === false) return;
      local = want; expect = host === null ? null : want; sentAt = clock();
    };
    return {
      // TOGGLE: every press flips the effect. HOLD: the press switches it on, the lift switches it off.
      down(hold) { if (!hold || !on()) fire(); },
      up(hold) { if (hold && on()) fire(); },
      tap: fire,
      hud(flags) {
        host = !!(flags & LATCH_BITS[k]);
        if (expect !== null && (host === expect || clock() - sentAt >= CONFIRM_MS)) expect = null;
      },
      active: on,
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
  function controllerSurface(h) {
    if (h.surface) return h.surface;
    return (h.state === "race" || h.state === "count") && !(h.flags & DASH.paused) ? "drive" : "menu";
  }
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
    if (el.gas) el.gas.classList.toggle("grip-cue", inRace && !(h.flags & DASH.paused) && (h.grip === "spin" || h.grip === "slip"));
    if (el.brake) el.brake.classList.toggle("grip-cue", inRace && !(h.flags & DASH.paused) && h.grip === "lock");
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
      const surface = controllerSurface(h);
      el.body.classList.toggle("menu", surface !== "drive");
      el.body.classList.toggle("camera-pad", surface === "camera");
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
      dom.codeIn.maxLength = privateCode ? 32 : 12;
      dom.codeIn.placeholder = privateCode ? "PRIVATE ROOM TOKEN" : "ABCD2345";
    }
    paintCodeInput();
    const say = (t, bad) => {
      if (!dom.status) return;
      dom.status.textContent = t;
      dom.status.classList.toggle("bad", !!bad);
    };
    // Sensor state — what padSession reads on every send.
    let roll = null, thr = 0, brk = 0, held = 0, steer = 0, steeringMode = "tilt";
    let reconnectSteering = null, surface = null;
    const camera = { moveX: 0, moveY: 0, lookX: 0, lookY: 0, lift: 0 };
    let session = null, glanceTimer = null;
    // This page's peer id, sent in every hello: the game lets a re-dial from the
    // phone it ALLOWed straight back in, and asks again for any other.
    const peerId = opts.peerId || PhonePadCodec.makePeerId();
    let sensorOn = false;
    let lastHud = null;
    const src = { roll: () => roll, thr: () => thr, brk: () => brk, held: () => held | (glanceTimer !== null ? HELD.lookBack : 0),
      steer: () => steeringMode === "touch" ? steer : null, camera: () => surface === "camera" ? camera : null };

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
      if (steeringMode !== "tilt" || surface === "camera" || (typeof document !== "undefined" && document.hidden)) return;
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
    const releases = [], pointerReleases = [], touchPointers = new Set();
    const rememberPointer = e => {
      if (e.pointerType === "touch") touchPointers.add(e.pointerId);
      else touchPointers.delete(e.pointerId);
    };
    const releasePointer = e => {
      touchPointers.delete(e.pointerId);
      for (const up of pointerReleases) up(e);
    };
    const releaseControls = () => {
      touchPointers.clear();
      for (const r of releases) r();
    };
    const releaseAll = (touchOnly) => {
      // No fingers on the glass says nothing about mouse, pen, keyboard or motion input.
      if (touchOnly === true) {
        for (const pointerId of touchPointers) releasePointer({ pointerId });
        return;
      }
      const clearRoll = roll !== null;
      if (clearRoll) { roll = null; paintRoll(); }
      releaseControls();
      if (clearRoll && session) session.sample(true);
    };
    const pedalTargets = new Map(), pedalOwners = new Map();
    function hold(el, on, off, travel) {
      if (!el) return;
      const ids = new Set();
      const anchors = new Map();   // Freeze the response and landing point for each contact.
      const levels = new Map();    // each contact keeps its own pedal travel
      if (travel) PedalTravel.watchButtonProfile(travel, profile => {
        if (profile.brightness) el.style?.setProperty?.("--touch-brightness", profile.brightness + "%");
        else el.style?.removeProperty?.("--touch-brightness");
        el.classList.toggle("feedback-off", !profile.feedback);
        if (travel !== "gas" && profile.feedback && profile.press === "progressive") el.setAttribute("data-touch-response", "progressive");
        else el.removeAttribute?.("data-touch-response");
      });
      // `edge` false = a slide (rate-capped, coalesced); a press or lift is sent at once.
      const level = (v, edge) => { if (el.style && el.style.setProperty) el.style.setProperty("--travel", PhonePadCodec.round2(v).toFixed(2)); on(v, edge); };
      const paintLevel = (edge = true) => { let strongest = 0; for (const v of levels.values()) strongest = Math.max(strongest, v); level(strongest, edge); };
      releases.push(() => {
        if (!ids.size) return;
        for (const id of anchors.keys()) pedalOwners.delete(id);
        ids.clear(); anchors.clear(); levels.clear(); el.classList.remove("on"); if (travel) paintLevel(); else off();
      });
      function buildFromAnchor(pointer, contact) {
        if (contact.profile.sliderEdge || !contact.profile.buildMs) return;
        PedalTravel.buildOnHold(contact, () => anchors.get(pointer) === contact, value => {
          levels.set(pointer, value);
          paintLevel(false);
        });
      }
      const start = (e, transfer) => {
        rememberPointer(e);
        ids.add(e.pointerId);
        el.classList.add("on");
        if (!travel) { on(1); return; }
        const profile = PedalTravel.contactProfile(travel, undefined, e, el, transfer);
        const cross = transfer && !profile.sliderEdge && profile.slide === "ease";
        const peerId = travel === "gas" ? "brake" : "gas";
        // Standalone phones keep the first pedal held unless the destination opts in.
        const peerResponse = PedalTravel.buttonOverrides(peerId);
        const entersPeer = peerResponse.sliderEdge ? PedalTravel.sliderEntry(peerResponse) === "enter" : !!peerResponse.slide;
        const bounds = entersPeer && dom[peerId]?.getBoundingClientRect?.();
        const contact = { x: e.clientX, y: e.clientY, profile, cross, transfer, bounds };
        anchors.set(e.pointerId, contact);
        pedalOwners.set(e.pointerId, target);
        const initial = profile.sliderEdge ? PedalTravel.sliderLevel(profile, e) :
          cross ? PedalTravel.arrive(0) : PedalTravel.level(profile, 0);
        levels.set(e.pointerId, initial);
        paintLevel();
        if (!cross) buildFromAnchor(e.pointerId, contact);
      };
      const down = (e) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        try { el.setPointerCapture(e.pointerId); } catch (err) { /* not a pointer target */ }
        start(e, false); e.preventDefault();
      };
      function slide(e) {
        const c = anchors.get(e.pointerId);
        if (!c) return;
        const peer = travel === "gas" ? dom.brake : dom.gas;
        const r = c.bounds;
        if (r && e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom &&
            typeof document !== "undefined" && document.elementFromPoint) {
          const hit = document.elementFromPoint(e.clientX, e.clientY);
          if (peer && (hit === peer || peer.contains?.(hit))) {
            up(e); pedalTargets.get(peer).start(e, true); return;
          }
        }
        const dx = e.clientX - c.x || 0, dy = e.clientY - c.y || 0;
        let value;
        if (c.profile.sliderEdge) value = PedalTravel.sliderLevel(c.profile, e);
        else if (c.cross) {
          value = Math.max(levels.get(e.pointerId), PedalTravel.arrive(Math.hypot(dx, dy)));
          if (value === 1) {
            c.cross = false;
            c.x = e.clientX; c.y = e.clientY;
            buildFromAnchor(e.pointerId, c);
          }
        } else if (c.transfer && !c.profile.trackCrossover && c.profile.slide !== "response") {
          value = PedalTravel.ease(c.y, e.clientY, c.profile.travel);
        } else {
          c.advance = PedalTravel.advance(c.profile, dx, dy, -dy);
          value = PedalTravel.level(c.profile, c.advance, c.holdFraction);
        }
        levels.set(e.pointerId, value); paintLevel(false);
      }
      const move = (e) => { if (travel) pedalOwners.get(e.pointerId)?.slide(e); };
      const up = (e) => {
        if (anchors.delete(e.pointerId)) pedalOwners.delete(e.pointerId);
        levels.delete(e.pointerId);
        if (!ids.delete(e.pointerId)) return;
        if (!ids.size) el.classList.remove("on");
        if (travel) paintLevel(); else if (!ids.size) off();
      };
      const target = { start, slide };
      if (travel) pedalTargets.set(el, target);
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
      document.addEventListener("pointerup", releasePointer, true);
      document.addEventListener("pointercancel", releasePointer, true);
      if (typeof window !== "undefined" && window.addEventListener) { window.addEventListener("pointerup", releasePointer, true); window.addEventListener("pointercancel", releasePointer, true); window.addEventListener("blur", releaseAll); }
      // Passive: these only READ touches.length and never preventDefault, so the
      // compositor need not wait on them for every lift (same net as input.js).
      document.addEventListener("touchend", allUp, { capture: true, passive: true });
      document.addEventListener("touchcancel", allUp, { capture: true, passive: true });
      document.addEventListener("visibilitychange", () => { if (document.hidden) releaseAll(); });
    }
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
      if (mode !== steeringMode) { roll = null; paintRoll(); }
      applySteeringMode(mode);
      push();
      return true;
    }
    function applySteeringMode(mode) {
      steeringMode = mode; steer = 0;
      if (dom.steeringMode) dom.steeringMode.value = mode;
      if (dom.steer) dom.steer.hidden = mode !== "touch";
    }
    if (dom.steeringMode) dom.steeringMode.addEventListener("change", () => { if (!setSteeringMode(dom.steeringMode.value)) dom.steeringMode.value = steeringMode; });
    if (dom.steer) {
      let steeringPointer = null, anchorX = 0, stripW = 40;   // strip width read once per gesture, not per move (audit4 UB4)
      const steeringKeys = new Set();
      const release = (e) => { if (e && (steeringPointer === null || e.pointerId !== steeringPointer)) return; steeringPointer = null; if (!e) steeringKeys.clear(); steer = steeringKeys.size ? (Array.from(steeringKeys).pop() === "ArrowLeft" ? -1 : 1) : 0; push(); };
      releases.push(() => release()); pointerReleases.push(release);
      dom.steer.addEventListener("pointerdown", (e) => { if ((e.pointerType === "mouse" && e.button !== 0) || steeringMode !== "touch" || steeringPointer !== null) return; rememberPointer(e); steeringPointer = e.pointerId; anchorX = e.clientX; stripW = Math.max(40, dom.steer.getBoundingClientRect().width * 0.4); steer = 0; try { dom.steer.setPointerCapture(e.pointerId); } catch (_) { /* document release fanout still centers steering when capture is refused */ } e.preventDefault(); push(); });
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
    for (const id of PedalTravel.phoneButtons) {
      const target = id === "look" ? dom.lookBack : id === "calib" ? dom.center : dom.buttons?.[id] || dom[id];
      for (const el of (Array.isArray(target) ? target : [target])) TouchButtonActions.bindControl(el, id);
    }
    hold(dom.gas, (v, edge) => { thr = v; push(edge); }, () => { thr = 0; push(); }, "gas");
    hold(dom.brake, (v, edge) => { brk = v; push(edge); }, () => { brk = 0; push(); }, "brake");
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
    // TOGGLE paints `on` while the latch is on (aria-pressed says so); HOLD only under the finger.
    const latches = new Map();
    function paintLatch(k) {
      const l = latches.get(k);
      for (const el of l.els) {
        const on = l.fingers.get(el).size > 0 || (!l.hold && l.latch.active());
        el.classList.toggle("on", on);
        if (l.hold) el.removeAttribute?.("aria-pressed"); else el.setAttribute?.("aria-pressed", String(l.latch.active()));
      }
    }
    function edge(el, k, repeat) {
      if (!el) return;
      const r = repeater(k), stop = r.stop;
      const held = new Set();
      const l = latches.get(k);
      if (l) { l.els.push(el); l.fingers.set(el, held); }
      const fire = () => { buzz(); if (session) session.event(k); };
      el.addEventListener("click", (e) => { if (!e.detail) { e.preventDefault(); if (l) { buzz(); l.latch.tap(); paintLatch(k); } else fire(); } });
      el.addEventListener("pointerdown", (e) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        e.preventDefault();
        // Track every contact: a second finger's up/leave used to clear `on` and
        // stop the repeater while the first thumb was still down (multi-touch).
        const first = !held.size;
        rememberPointer(e);
        held.add(e.pointerId);
        try { el.setPointerCapture(e.pointerId); } catch (err) { /* document release fanout still stops the repeat */ }
        el.classList.add("on");
        if (!first) return;
        if (l) { buzz(); if (![...l.fingers.values()].some(f => f !== held && f.size)) l.latch.down(l.hold); paintLatch(k); return; }
        fire();
        if (repeat) r.start();
      });
      const up = (e) => {
        const lifted = held.size > 0;
        if (e && typeof e === "object" && "pointerId" in e) {
          if (!held.delete(e.pointerId)) return;
          if (held.size) return;
        } else {
          held.clear();
        }
        el.classList.remove("on");
        stop();
        if (l && lifted) { if (![...l.fingers.values()].some(f => f.size)) l.latch.up(l.hold); paintLatch(k); }
      };
      // Lost lift / blur / last-finger-up: same nets as hold() and the menu stick.
      releases.push(() => up());
      pointerReleases.push(up);
      el.addEventListener("pointerup", up);
      el.addEventListener("pointercancel", up);
      // No pointerleave: with capture it fires when the thumb slides a few px
      // and killed a held D-pad repeat; document/window pointerup catches the lift.
      el.addEventListener("lostpointercapture", (e) => { if (!el.isConnected || !el.getClientRects().length) up(e); });
      el.addEventListener("contextmenu", (e) => e.preventDefault());
    }
    for (const k of latchButtons) {
      latches.set(k, { latch: pressLatch(k, key => !!session && (session.event(key), true), opts.now), els: [], fingers: new Map(), hold: false });
      PedalTravel.watchButtonProfile(k, p => { const l = latches.get(k); l.hold = p.latch === "hold"; if (l.els.length) paintLatch(k); });
    }
    // An action may have more than one button (OT on the grip AND on the face).
    for (const k of PhonePadCodec.EVENTS) {
      const b = dom.buttons && dom.buttons[k];
      for (const el of (Array.isArray(b) ? b : [b])) edge(el, k, !!PhonePadCodec.NAV_REPEAT[k]);
    }
    edge(dom.center, "calib");

    if (dom.shiftFlick) {
      const strip = dom.shiftFlick;
      let contact = null;
      const available = () => dom.body?.dataset?.shifts === "flick" && !dom.body.classList.contains("gears-auto") &&
        !dom.body.classList.contains("arranging") && !dom.body.classList.contains("menu");
      const shift = key => { if (available() && session) { buzz(); session.event(key); } };
      const clear = () => { contact = null; strip.classList.remove("on"); };
      strip.addEventListener("pointerdown", e => {
        if (contact || !available() || (e.pointerType === "mouse" && e.button !== 0)) return;
        e.preventDefault();
        rememberPointer(e);
        contact = { id: e.pointerId, x: e.clientX, y: e.clientY, shifted: false };
        strip.classList.add("on");
        try { strip.setPointerCapture(e.pointerId); } catch (_) { /* document release still clears the strip */ }
      });
      const move = e => {
        if (!contact || e.pointerId !== contact.id || contact.shifted) return;
        const dy = e.clientY - contact.y;
        if (!Number.isFinite(dy) || Math.abs(dy) < 24 || Math.abs(dy) < Math.abs(e.clientX - contact.x)) return;
        contact.shifted = true;
        shift(dy < 0 ? "shiftUp" : "shiftDown");
      };
      const end = e => {
        if (!contact || e.pointerId !== contact.id) return;
        if (e.type === "pointerup") move(e);
        clear();
      };
      strip.addEventListener("pointermove", move);
      for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) strip.addEventListener(type, end);
      pointerReleases.push(end); releases.push(clear);
      // Both ends are native buttons: keyboard and assistive activation can
      // choose a direction without dragging. A native pointer click follows
      // the gesture and must never emit another shift.
      for (const key of ["shiftUp", "shiftDown"]) dom.flickKeys?.[key]?.addEventListener("click", e => {
        if (e.detail === 0) shift(key);
      });
    }

    // The same actions can share a single slot. Dragging shows the available
    // targets; only a lift over one commits. A tap opens their native buttons.
    const utility = dom.utility;
    let utilityPointer = null, downX = 0, downY = 0, dragged = false, aimed = null;
    function aimUtility(key) {
      if (key === aimed) return;
      if (aimed) utility.choices[aimed].removeAttribute("data-aimed");
      aimed = key;
      if (key) utility.choices[key].setAttribute("data-aimed", "");
    }
    function hideUtilities() {
      if (!utility) return;
      utilityPointer = null; aimUtility(null);
      utility.panel.hidden = true;
      utility.trigger.setAttribute("aria-expanded", "false");
    }
    function closeUtilities() {
      hideUtilities();
      if (glanceTimer !== null) { timers.clearTimeout(glanceTimer); glanceTimer = null; push(); }
    }
    if (utility) {
      const { trigger, panel, choices } = utility;
      const options = Object.entries(choices);
      let targets = [];
      const open = () => {
        panel.hidden = false; trigger.setAttribute("aria-expanded", "true");
        const anchor = trigger.getBoundingClientRect(), box = panel.getBoundingClientRect();
        panel.style.left = Math.max(0, Math.min(window.innerWidth - box.width, anchor.left + (anchor.width - box.width) / 2)) + "px";
        panel.style.top = (anchor.top >= box.height + 4 ? anchor.top - box.height - 4 :
          Math.min(window.innerHeight - box.height, anchor.bottom + 4)) + "px";
        targets = options.map(([key, button]) => [key, button.getBoundingClientRect()]);
      };
      const activate = key => {
        hideUtilities(); buzz();
        if (key === "look") {
          if (glanceTimer !== null) timers.clearTimeout(glanceTimer);
          glanceTimer = timers.setTimeout(() => { glanceTimer = null; push(); }, 1000);
          push();
        } else session?.event(key);
      };
      const hit = e => targets.find(([, r]) =>
        e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom)?.[0];
      trigger.addEventListener("pointerdown", e => {
        if (e.button !== 0 || utilityPointer !== null) return;
        e.preventDefault();
        if (!panel.hidden) { hideUtilities(); return; }
        rememberPointer(e);
        utilityPointer = e.pointerId; downX = e.clientX; downY = e.clientY; dragged = false;
        open();
        try { trigger.setPointerCapture(e.pointerId); } catch (_) { /* document release still finishes this gesture */ }
      });
      trigger.addEventListener("pointermove", e => {
        if (utilityPointer !== e.pointerId) return;
        if (Math.hypot(e.clientX - downX, e.clientY - downY) > 8) dragged = true;
        aimUtility(hit(e));
      });
      const end = e => {
        if (e.pointerId !== utilityPointer) return;
        utilityPointer = null;
        if (e.type !== "pointerup") { hideUtilities(); return; }
        const key = hit(e);
        if (key) activate(key);
        else if (dragged || Math.hypot(e.clientX - downX, e.clientY - downY) > 8) hideUtilities();
      };
      for (const event of ["pointerup", "pointercancel", "lostpointercapture"]) trigger.addEventListener(event, end);
      pointerReleases.push(end);
      releases.push(closeUtilities);
      trigger.addEventListener("click", e => {
        if (e.detail !== 0) return;
        if (panel.hidden) { open(); choices.camera.focus(); } else hideUtilities();
      });
      window.addEventListener("resize", hideUtilities);
      trigger.addEventListener("contextmenu", e => e.preventDefault());
      for (const [key, button] of options) button.addEventListener("click", () => {
        if (panel.hidden) return;
        activate(key); trigger.focus();
      });
      document.addEventListener("keydown", e => {
        if (e.key === "Escape" && !panel.hidden) { e.preventDefault(); hideUtilities(); trigger.focus(); }
      });
      document.addEventListener("pointerdown", e => {
        if (utilityPointer === null && !panel.hidden && !trigger.contains(e.target) && !panel.contains(e.target)) hideUtilities();
      }, true);
    }
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
      let id = null, dir = null, cx = 0, cy = 0, rad = 1, localPerViewport = 1;
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
        const m = d ? Math.min(d, rad * 0.55) / d * localPerViewport : 0;
        if (nub && nub.style) nub.style.transform = "translate(" + (dx * m).toFixed(1) + "px," + (dy * m).toFixed(1) + "px)";
        if (d < rad * 0.28) { aim(null); return; }
        const ax = Math.abs(dx), ay = Math.abs(dy);
        const horiz = dir === "navLeft" || dir === "navRight" ? ax * 1.2 >= ay : ax > ay * 1.2;
        aim(horiz ? (dx < 0 ? "navLeft" : "navRight") : (dy < 0 ? "navUp" : "navDown"));
      };
      base.addEventListener("pointerdown", (e) => {
        if ((e.pointerType === "mouse" && e.button !== 0) || id !== null) return;
        rememberPointer(e);
        id = e.pointerId;
        try { base.setPointerCapture(e.pointerId); } catch (err) { /* not a pointer target */ }
        const b = base.getBoundingClientRect();
        // The nub's translate is local to the painted D-pad. An arranged
        // scale changes viewport travel without changing its local diameter.
        localPerViewport = b.width && base.offsetWidth ? base.offsetWidth / b.width : 1;
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
      const release = () => { if (id !== null) up({ pointerId: id }); };
      releases.push(release);
      if (typeof window !== "undefined") window.addEventListener?.("resize", release);
      if (typeof document !== "undefined") document.addEventListener("focusin", e => {
        if (e.target?.closest?.("#screen-arranger")) release();
      });
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

    function cameraStick(base, nub, x, y) {
      if (!base) return;
      let pointer = null, bounds = null;
      const keys = new Set();
      function set(dx, dy, immediate) {
        const scale = Math.max(1, Math.hypot(dx, dy));
        camera[x] = dx / scale; camera[y] = dy / scale;
        if (nub?.style) nub.style.translate = (camera[x] * 60) + "% " + (camera[y] * 60) + "%";
        push(immediate);
      }
      function aim(e, immediate) {
        set((e.clientX - bounds.left) * 2 / bounds.width - 1, (e.clientY - bounds.top) * 2 / bounds.height - 1, immediate);
      }
      function release(e) {
        if (e && e.pointerId !== pointer) return;
        pointer = bounds = null;
        keys.clear();
        if (camera[x] || camera[y]) set(0, 0, true);
      }
      base.addEventListener("pointerdown", e => {
        if (pointer !== null || (e.pointerType === "mouse" && e.button !== 0)) return;
        bounds = base.getBoundingClientRect();
        if (!bounds.width || !bounds.height) return;
        pointer = e.pointerId; rememberPointer(e);
        try { base.setPointerCapture(pointer); } catch (_) { /* document release also handles the lift */ }
        aim(e, true);
        e.preventDefault();
      });
      // WebKit may retarget the first touch after a second control takes capture.
      // Track the pointer in one place, including moves still targeted at the stick.
      const moveTarget = typeof document !== "undefined" ? document : base;
      moveTarget.addEventListener("pointermove", e => { if (e.pointerId === pointer) aim(e, false); }, true);
      base.addEventListener("lostpointercapture", e => { if (!base.getClientRects().length) release(e); });
      releases.push(release);
      pointerReleases.push(release);
      for (const type of ["keydown", "keyup"]) base.addEventListener(type, e => {
        if (pointer !== null || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
        e.preventDefault();
        if (keys.has(e.key) === (type === "keydown")) return;
        if (type === "keydown") keys.add(e.key); else keys.delete(e.key);
        set(Number(keys.has("ArrowRight")) - Number(keys.has("ArrowLeft")),
          Number(keys.has("ArrowDown")) - Number(keys.has("ArrowUp")), true);
      });
      base.addEventListener("blur", () => release());
      if (typeof window !== "undefined") window.addEventListener("resize", () => release());
    }
    const cameraPad = dom.cameraPad;
    if (cameraPad) {
      cameraStick(cameraPad.move, cameraPad.moveNub, "moveX", "moveY");
      cameraStick(cameraPad.look, cameraPad.lookNub, "lookX", "lookY");
      let up = 0, down = 0;
      function lift() { camera.lift = up - down; push(); }
      hold(cameraPad.up, () => { up = 1; lift(); }, () => { up = 0; lift(); });
      hold(cameraPad.down, () => { down = 1; lift(); }, () => { down = 0; lift(); });
      edge(cameraPad.back, "navBack", false);
      function showPanel(show, e) {
        releaseAll();
        dom.body?.classList.toggle("camera-panel", show);
        if (!e.detail) (show ? cameraPad.return : cameraPad.panel).focus?.();
      }
      cameraPad.panel.addEventListener("click", e => showPanel(true, e));
      cameraPad.return.addEventListener("click", e => showPanel(false, e));
    }
    function paintController(h) {
      for (const [k, l] of latches) { l.latch.hud(h.flags); if (l.els.length) paintLatch(k); }
      const next = controllerSurface(h);
      if (next !== surface) {
        const active = typeof document !== "undefined" ? document.activeElement : null;
        const wasInPad = active && (dom.surfaces?.[surface]?.contains(active) ||
          (surface === "camera" && dom.surfaces?.menu?.contains(active)));
        const changedFrom = surface;
        surface = next;
        closeUtilities();
        if (changedFrom) releaseAll();
        dom.body?.classList.remove("camera-panel");
        push();
        paintHud(dom.hud, h);
        if (wasInPad) dom.surfaceFocus?.[next]?.focus?.();
      } else {
        paintHud(dom.hud, h);
      }
      lastHud = h;
    }

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
    // CONNECT DEADLINE: an answer published to an offer nobody is behind any more
    // (a relay replaying a consumed room, nostr OFFER_CREATED_SLACK_S) never opens;
    // past this the attempt ends, says so and frees CONNECT (#5739 row 5).
    const CONNECT_DEADLINE_MS = 15000;
    let connectDeadline = null, liveCode = null;
    function clearConnectDeadline() { if (connectDeadline) { clearTimeout(connectDeadline); connectDeadline = null; } }
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
      clearConnectDeadline();
      const old = attempt; attempt = null;
      if (old) old.cancelled = true;
      connecting = false;
      const active = session;
      reconnectSteering = null;
      applySteeringMode("tilt");
      surface = null;
      session = null;
      releaseAll();
      if (active) { steer = 0; thr = brk = held = 0; active.sample(true); active.close(); }
      else if (old && old.transport) { try { old.transport.close(); } catch (_) { /* already closed */ } }
      dropWake();
      if (dom.body) { dom.body.classList.remove("linked"); dom.body.classList.remove("awaiting"); }
      if (dom.connect) dom.connect.disabled = false;
    }
    // PAGEHIDE IS NOT AN UNPAIR (#5739 row 4): a linked page that goes away (navigate,
    // switch-away, Safari unloading it) tells the game it is suspending, so the game
    // hosts the same code again; a bfcache return (pageshow) or the page in front
    // again re-dials it. A pairing still in progress is simply cancelled.
    function pageHide() {
      // A suspended linked phone can already be waiting, backing off, or negotiating
      // its automatic reconnect when pagehide follows the wire close.
      const code = redial || (attempt?.opened || redialTimer || attempt?.isRedial ? liveCode : null);
      const mode = reconnectSteering || steeringMode;
      if (session && session.sendSuspend) session.sendSuspend();
      cancel();
      if (code && !deps.privateRelay()) { reconnectSteering = mode; redial = code; say("Link paused — reconnecting when this page is back…", true); }
    }
    if (typeof window !== "undefined" && window.addEventListener) {
      window.addEventListener("pagehide", pageHide);
      window.addEventListener("pageshow", () => redialNow());
    }
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
      if (!deps.valid(code)) { say(deps.privateRelay() ? "That is not a private room token — copy the full 32-character token." : "That is not a room code — eight letters and numbers (six from an older version).", true); return { ok: false, error: "bad_code" }; }
      connecting = true;
      const owner = attempt = { cancelled: false, transport: null, isRedial, opened: false };
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
        let transport = owner.transport = deps.rtc({ role: "guest", name: "pad" });
        if (!transport) { say("WebRTC is unavailable in this browser.", true); return { ok: false, error: "no_transport" }; }
        let answered = null;
        const armDeadline = () => {
          clearConnectDeadline();
          connectDeadline = setTimeout(() => {
            connectDeadline = null;
            if (attempt !== owner || owner.opened) return;
            cancel();
            say("The game is not offering that code any more — choose MAKE NEW CODE in its phone-controller settings, then CONNECT.", true);
          }, CONNECT_DEADLINE_MS);
        };
        // `listen` is the swap's own token: with `reanswer` the rendezvous keeps
        // listening after it resolves, and a link that is up (or a cancel) stops it.
        const listen = { stopped: false, get cancelled() { return owner.cancelled || this.stopped; } };
        // The padSession wired to `transport` once the swap resolved, and its
        // generation: a callback from a superseded session (or one that fires
        // while padSession() is still building it) checks `gen`, not the object.
        let bound = null, bindGen = 0;
        // A newer offer was answered on a FRESH transport: the session (if any)
        // moves onto it; the superseded one closes without reading as a drop.
        const rebind = (old) => {
          const prev = bound;
          if (prev) { bound = null; session = null; bindGen++; prev.close(); bind(); }
          else { try { old.close(); } catch (_) { /* never opened */ } }
        };
        const done = await deps.swap({
          code, slot: "answer", want: "offer", token: listen,
          // A STALE OFFER LATCH. A re-dial can hear the offer the game posted for
          // the link that just died (a relay replays it, or the game re-hosts a
          // moment later); answered, the game drops that answer and the phone sat
          // on it until the connect timeout. With reanswer the rendezvous hands
          // a NEWER offer to reply() again (js/net nostr; ignored where absent).
          reanswer: true,
          onTick: () => { if (attempt === owner && !session) say("Looking for the game… (room code " + code + ")"); },
          reply: async (invite) => {
            if (attempt !== owner) return null;
            if (answered && answered.ok) {
              // A newer offer while the first answer is still unconnected. Up (or
              // connecting on DTLS) means the first was the live one: keep it.
              const st = transport.stats ? transport.stats() : null;
              if (transport.status === "open" || (st && st.connection === "connected")) return null;
              // An answered RTCPeerConnection cannot take a second offer: a fresh one answers it.
              const fresh = deps.rtc({ role: "guest", name: "pad" });
              if (!fresh) return null;
              const res = await deps.acceptInvite(fresh, invite, { pad: PhonePadCodec.PROTO });
              if (attempt !== owner || !res.ok) { try { fresh.close(); } catch (_) { /* never opened */ } return null; }
              const old = transport;
              transport = owner.transport = fresh; answered = res;
              rebind(old);
              armDeadline();   // the newer offer gets its own window
              return res.code;
            }
            say("Found it — connecting…");
            const res = await deps.acceptInvite(transport, invite, { pad: PhonePadCodec.PROTO });
            if (attempt !== owner) return null;
            answered = res;
            if (res.ok) armDeadline();
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
        function bind() {
        const gen = ++bindGen;
        let surfaced = false;   // this session's first dash has painted the wheel / menu pad
        const active = PhonePad.padSession(transport, src, {
          now: opts.now || null,   // test seam: the harness's stepped clock, so both wire ends agree
          peerId,
          // NO DEAD SURFACE: the game sends its dash only once it has admitted this phone
          // (ALLOW, or a re-link of the phone it allowed), and the dash says which surface
          // its screen wants (paintHud: body.menu). So the wheel / menu pad appear on the
          // FIRST dash, already in the right mode; until then the page stays "awaiting".
          onHud: (h) => {
            if (gen !== bindGen) return;
            paintController(h);
            if (gen !== bindGen || surfaced) return;
            surfaced = true;
            if (dom.body) { dom.body.classList.remove("awaiting"); dom.body.classList.add("linked"); }
            say(sensorOn || sensor ? "Connected — tilt to steer." : "Connected — pedals and buttons only.");
          },
          onOpen: () => {
            if (gen !== bindGen) return;
            listen.stopped = true;   // the link is up: no later offer is answered
            owner.opened = true; liveCode = code; redialTries = 0; clearConnectDeadline();
            say("Connected — waiting for the game… If it asks, tap ALLOW on its screen.");
            if (dom.body && !surfaced) dom.body.classList.add("awaiting");
            if (opts.onOpen) opts.onOpen();
          },
          onCapabilities: ({ touchSupported }) => {
            if (gen !== bindGen || !reconnectSteering) return;
            const mode = reconnectSteering;
            reconnectSteering = null;
            if (mode === "touch" && touchSupported) setSteeringMode("touch");
          },
          onHealth: (h) => {
            const text = h.state === "unavailable" ? "INPUT AGE UNAVAILABLE · UPDATE GAME" : h.state === "waiting" ? "WAITING FOR INPUT ACK" : h.state === "reconnecting" ? "INPUT NOT ACKNOWLEDGED" : "INPUT " + h.state.toUpperCase();
            if (dom.health && dom.health.textContent !== text) dom.health.textContent = text;
            if (dom.health && dom.health.dataset && dom.health.dataset.state !== h.state) dom.health.dataset.state = h.state;   // the pad bar's dot (controller.html)
            if (dom.healthAge) { const age = h.ageMs == null ? "" : Math.round(h.ageMs / 100) * 100 + " ms since acknowledged sample"; if (dom.healthAge.textContent !== age) dom.healthAge.textContent = age; }
          },
          onClose: (why) => {
            if (attempt !== owner || gen !== bindGen) return;   // a cancel, or a session rebind() replaced
            bound = null; listen.stopped = true; clearConnectDeadline();
            const wire = !!why && why !== "peer", again = wire && !deps.privateRelay();
            reconnectSteering = again ? reconnectSteering || steeringMode : null;
            surface = null;
            applySteeringMode("tilt");
            if (dom.health) { dom.health.textContent = "INPUT DISCONNECTED"; if (dom.health.dataset) dom.health.dataset.state = "disconnected"; }
            attempt = null; owner.cancelled = true; connecting = false;
            session = null;
            dropWake(); releaseAll();
            if (dom.body) { dom.body.classList.remove("linked"); dom.body.classList.remove("awaiting"); }
            if (dom.connect) dom.connect.disabled = false;
            // WHICH END DIED: "peer" is the game's own goodbye (UNPAIR, its tab
            // closed); any other reason is this end's wire (rtc failed/disconnected).
            // A private relay's one mailbox is not hosted again, so no re-dial there.
            say(!wire ? "Disconnected — the game closed the link. Pair again from its Settings."
              : "Link lost — this phone slept, took a call or lost signal. " + (again ? "Reconnecting…" : "Pair again from the game's Settings."), true);
            if (opts.onClose) opts.onClose();
            if (again) { redial = code; redialNow(); }
          },
        });
        if (attempt !== owner || gen !== bindGen) { active.close(); return null; }   // closed while it was being built
        bound = session = active;
        const tick = () => { if (session !== active) return; active.pump(); requestAnimationFrame(tick); };
        if (typeof requestAnimationFrame === "function") requestAnimationFrame(tick);
        return active;
        }
        if (attempt !== owner || !bind()) return { ok: false, error: "cancelled" };
        return { ok: true };
      } finally {
        if (attempt === owner) {
          connecting = false;
          if (!session) { attempt = null; owner.cancelled = true; dropWake(); clearConnectDeadline(); }
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
    // A NEW #pad= LINK INTO AN OPEN TAB (#5739 row 6): a hash-only navigation keeps
    // this page, so re-read the pairing; a dial still on the OLD code is stopped.
    if (typeof window !== "undefined" && window.addEventListener) window.addEventListener("hashchange", () => {
      const next = PhonePadCodec.pairingFromUrl(typeof location !== "undefined" ? location.href : "");
      if (!next || (pairing && next.code === pairing.code && next.relay === pairing.relay)) return;
      const linked = !!session;   // a live link stays up; the new code is what the next CONNECT dials
      if (!linked) cancel();
      pairing = next;
      if (dom.codeIn) dom.codeIn.value = next.code;
      paintCodeInput();
      say(linked ? "A new pairing link arrived — the current link stays; CONNECT uses the new code after it ends." : "Tap CONNECT to pair with the game.");
    });
    const fromUrl = pairing && pairing.code;
    if (fromUrl && dom.codeIn) dom.codeIn.value = fromUrl;
    say(fromUrl ? "Tap CONNECT to pair with the game." : Scan && Scan.supported() ? "Scan the game's QR code, or type its room code and CONNECT." : "Type the room code the game shows, then CONNECT.");

    return {
      connect,
      cancel,
      scan,
      setSteeringMode, closeUtilities, releaseControls,
      // The test/console handle: what the page holds, and a way to paint a
      // dash without a link (controller.html?demo drives the LCD from it).
      paintHud: paintController,
      armSensor: requestSensor,   // the demo turns the rim with a real phone's tilt, unlinked
      setRoll: (r) => { roll = r; paintRoll(); if (session) session.sample(); },   // stands in for the sensor
      pump: () => (session ? session.pump() : 0),   // the frame tick, for a harness with no rAF
      state: () => ({ linked: !!session, roll, thr, brk, held: src.held(), steer, steeringMode, sensorOn, hud: lastHud, stats: session ? session.stats() : null }),
    };
  }

  // ── phone: WHEEL LAYOUT (#5801) ───────────────────────────────────────────
  // Which thumb each wheel-face key sits under: L (the grip on the left of the
  // screen), C (the face, under the dash) or R. `swap` mirrors the grips, so
  // paddles go right and pedals left. `pedals` "side" stands BRAKE and GAS up
  // as two tall bars side by side (a phone racer's dock) instead of stacked;
  // `strip` "column" stacks the keys moved to a grip in a column beside it
  // instead of a row above it. Saved on the phone as apex26.padLayout;
  // everything else about the wheel is unchanged, and a moved button is the
  // same element (its listeners move with it).
  const LAYOUT_KEYS = Object.freeze(["overtake", "boost", "aero", "camera", "radio", "look", "recover", "pause"]);
  const LAYOUT_LABEL = Object.freeze({ overtake: "OT", boost: "BOOST", aero: "AERO", camera: "CAM", radio: "RADIO", look: "LOOK", recover: "RESET", pause: "PAUSE" });
  const UTILITY_KEYS = ["camera", "look", "radio"];
  const LAYOUT_KEY = "apex26.padLayout";
  const zonesWith = (side, keys) => Object.fromEntries(LAYOUT_KEYS.map((k) => [k, keys.includes(k) ? side : "C"]));
  const TRIO = ["overtake", "boost", "aero"];
  const preset = (zone, more) => Object.assign({ zone, swap: false, pedals: "stack", strip: "row", shifts: "paddles", place: {} }, more);
  // ARRANGE (MOVE & SIZE, like the game's ARRANGE HUD): any control can be dragged
  // off its slot and sized. place[id] = { x, y } offset in % of the screen's
  // width / height, and s, the size in %. The grid stays the base, so a preset
  // or RESET puts every control back.
  const BUTTON_SHAPES = ["square", "rounded", "capsule", "arch", "shield", "paddle-left", "paddle-right", "leaf"];
  const ARRANGE_MIN_PX = 44;   // the touch floor: no control sizes below it
  const clampN = (v, lo, hi, d) => (typeof v === "number" && isFinite(v)) ? Math.min(hi, Math.max(lo, v)) : d;
  const PLACE_IDS = new Set([...LAYOUT_KEYS, "screen", "utility", "shiftFlick", "shiftUp", "shiftDown", "otBig", "boostBig", "brake", "gas", "steering"]);
  function normalisePlace(raw) {
    const out = {};
    if (!raw || typeof raw !== "object") return out;
    for (const id of Object.keys(raw).slice(0, 40)) {
      const p = raw[id];
      if (!PLACE_IDS.has(id) || !p || typeof p !== "object") continue;
      const r1 = (v) => Math.round(v * 10) / 10;
      const q = { x: r1(clampN(p.x, -90, 90, 0)), y: r1(clampN(p.y, -90, 90, 0)), s: Math.round(clampN(p.s, 40, 250, 100)) };
      for (const axis of ["w", "h"]) {
        if (Number.isFinite(p[axis])) q[axis] = r1(clampN(p[axis], 1, 90, 1));
      }
      // Earlier wheel files used "pill" for the same capsule silhouette.
      const shape = p.shape === "pill" ? "capsule" : p.shape;
      if (BUTTON_SHAPES.includes(shape) && id !== "screen" && id !== "steering") q.shape = shape;
      if (q.x || q.y || q.s !== 100 || q.w || q.h || q.shape) out[id] = q;
    }
    return out;
  }
  const LAYOUT_PRESETS = Object.freeze({
    classic: preset(zonesWith("C", [])),
    right: preset(zonesWith("R", TRIO)),   // OT/BOOST/AERO above the pedals
    left: preset(zonesWith("L", TRIO)),    // ... above the paddles
    split: preset({ ...zonesWith("L", ["overtake", "aero"]), boost: "R" }, { pedals: "side" }),
    views: preset({ ...zonesWith("L", ["look", "camera"]), radio: "R" }),
    mirror: preset(zonesWith("C", []), { swap: true }),
    phone: preset(zonesWith("R", TRIO), { pedals: "side", strip: "column" }),   // tall BRAKE | GAS, OT/BOOST/AERO in a column beside them
  });
  function normaliseLayout(raw) {
    const r = raw && typeof raw === "object" ? raw : {}, z = r.zone && typeof r.zone === "object" ? r.zone : {};
    return { zone: Object.fromEntries(LAYOUT_KEYS.map((k) => [k, z[k] === "L" || z[k] === "R" ? z[k] : "C"])), swap: r.swap === true,
      pedals: r.pedals === "side" ? "side" : "stack", strip: r.strip === "column" ? "column" : "row", shifts: r.shifts === "flick" ? "flick" : "paddles", place: normalisePlace(r.place), ...(r.utility === "wheel" ? { utility: "wheel" } : {}) };
  }
  function readWheelBackup(file) {
    const layout = file?.layout;
    if (file?.format !== "apex26-wheel" || file.v !== 1 || !layout || typeof layout !== "object" ||
        !layout.zone || typeof layout.zone !== "object" || Array.isArray(layout.zone) ||
        !layout.place || typeof layout.place !== "object" || Array.isArray(layout.place)) throw new Error("Invalid wheel layout");
    return normaliseLayout(layout);
  }
  /** The preset a layout equals, or "custom". */
  function layoutPreset(lay) {
    const n = normaliseLayout(lay);
    return Object.keys(LAYOUT_PRESETS).find((id) => JSON.stringify(LAYOUT_PRESETS[id]) === JSON.stringify(n)) || "custom";
  }
  /** Moves the keys into their zones. dom: { body, keys: {name: el}, home (#keys), grips: { L, R } (the
   *  key strips of the paddle grip and the pedal grip, in that order) }. */
  function applyLayout(dom, lay) {
    const n = normaliseLayout(lay), g = dom.grips || {};
    const box = { C: dom.home, L: n.swap ? g.R : g.L, R: n.swap ? g.L : g.R };
    for (const k of LAYOUT_KEYS) {
      const el = dom.keys && dom.keys[k];
      const to = n.utility && UTILITY_KEYS.includes(k) && dom.utilityStore ? dom.utilityStore : box[n.zone[k]];
      if (el && to && to.appendChild) to.appendChild(el);   // canonical order: appended in LAYOUT_KEYS order
    }
    if (dom.utilityTrigger) dom.utilityTrigger.hidden = !n.utility;
    dom.closeUtilities?.();
    const b = dom.body && dom.body.dataset;
    if (b) { if (n.swap) b.swap = "1"; else delete b.swap; b.pedals = n.pedals; b.strip = n.strip; b.shifts = n.shifts; }
    for (const [id, el] of Object.entries(dom.arrange || {})) placeEl(el, n.place[id]);   // gears AUTO keeps its big OT/BOOST tiles on the paddle grip wherever the small keys went
    return n;
  }
  function placeEl(el, p) {
    if (!el || !el.style) return;
    el.style.translate = p && (p.x || p.y) ? p.x + "vw " + p.y + "vh" : "";
    el.style.scale = p && p.s !== 100 ? String(p.s / 100) : "";
    // Equal bounds also resize controls that normally stretch in a flex or grid slot.
    const floor = ARRANGE_MIN_PX / ((p?.s || 100) / 100);
    for (const [key, axis, unit] of [["w", "Width", "vw"], ["h", "Height", "vh"]]) {
      const size = p?.[key] ? "max(" + floor + "px," + p[key] + unit + ")" : "";
      el.style["min" + axis] = size;
      el.style["max" + axis] = size;
    }
    if (p?.shape) el.setAttribute("data-wheel-shape", p.shape);
    else el.removeAttribute?.("data-wheel-shape");
    if (el.classList) el.classList.toggle("placed", !!p && !!(p.x || p.y || p.s !== 100));
  }
  /** The smallest size (%) that keeps an element's shorter side at the touch floor. */
  function minScale(w, h, s) {
    const base = Math.min(w, h) / ((s || 100) / 100);
    return base > 0 ? Math.max(40, Math.ceil(ARRANGE_MIN_PX / base * 100)) : 40;
  }
  /** The editor sheet. dom adds: sheet, open, done, rows (container), presets ([el with data-preset]),
   *  swapBtn, pedalsBtn, stripBtn (toggles), doc (document, to build the per-key rows), store (localStorage-like). */
  function layout(dom, opts) {
    const store = (opts && opts.store) || null;
    let cur;
    try { cur = normaliseLayout(store && JSON.parse(store.getItem(LAYOUT_KEY) || "null")); } catch (e) { cur = normaliseLayout(null); }
    const picks = {};
    if (dom.rows && dom.doc) {
      for (const k of LAYOUT_KEYS) {
        const row = dom.doc.createElement("div"); row.className = "lay-row";
        const name = dom.doc.createElement("span"); name.textContent = LAYOUT_LABEL[k]; row.appendChild(name);
        picks[k] = {};
        for (const [z, txt] of [["L", "LEFT"], ["C", "MID"], ["R", "RIGHT"]]) {
          const b = dom.doc.createElement("button"); b.type = "button"; b.textContent = txt;
          b.setAttribute("aria-label", LAYOUT_LABEL[k] + " " + (z === "C" ? "under the dash" : txt.toLowerCase() + " grip"));
          b.addEventListener("click", () => set(Object.assign({}, cur, { zone: Object.assign({}, cur.zone, { [k]: z }) })));
          picks[k][z] = b; row.appendChild(b);
        }
        dom.rows.appendChild(row);
      }
    }
    function paint() {
      const p = layoutPreset(cur);
      for (const el of dom.presets || []) el.setAttribute("aria-pressed", String(el.dataset.preset === p));
      for (const k of LAYOUT_KEYS) for (const z of ["L", "C", "R"]) if (picks[k]) picks[k][z].setAttribute("aria-pressed", String(cur.zone[k] === z));
      if (dom.flickBtn) dom.flickBtn.setAttribute("aria-pressed", String(cur.shifts === "flick"));
      dom.utilityBtn?.setAttribute("aria-pressed", String(!!cur.utility));
      if (dom.swapBtn) dom.swapBtn.setAttribute("aria-pressed", String(cur.swap));
      if (dom.pedalsBtn) dom.pedalsBtn.setAttribute("aria-pressed", String(cur.pedals === "side"));
      if (dom.stripBtn) dom.stripBtn.setAttribute("aria-pressed", String(cur.strip === "column"));
    }
    function set(lay) {
      cur = applyLayout(dom, lay);
      let durable = false;
      try { if (store) { store.setItem(LAYOUT_KEY, JSON.stringify(cur)); durable = true; } } catch (e) { /* session fallback */ }
      paint();
      return durable;
    }
    dom.exportLayout?.addEventListener("click", () => {
      const data = JSON.stringify({ format: "apex26-wheel", v: 1, layout: cur }, null, 2);
      const url = URL.createObjectURL(new Blob([data], { type: "application/json" }));
      const link = dom.doc.createElement("a");
      link.href = url; link.download = "apex26-phone-wheel.json";
      dom.doc.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    let importSerial = 0;
    dom.importLayout?.addEventListener("change", async () => {
      const serial = ++importSerial;
      const file = dom.importLayout.files[0];
      dom.importLayout.value = "";
      if (!file) return;
      try {
        if (file.size > 32768) throw new Error();
        const next = readWheelBackup(JSON.parse(await file.text()));
        if (serial !== importSerial) return;
        const durable = set(next);
        dom.fileStatus.textContent = durable ? "Wheel layout imported." : "Wheel layout imported for this session.";
      } catch { if (serial === importSerial) dom.fileStatus.textContent = "Choose an Apex 26 wheel layout file."; }
    });
    for (const el of dom.presets || []) el.addEventListener("click", () => set(LAYOUT_PRESETS[el.dataset.preset] || LAYOUT_PRESETS.classic));
    dom.flickBtn?.addEventListener("click", () => set({ ...cur, shifts: cur.shifts === "flick" ? "paddles" : "flick" }));
    dom.utilityBtn?.addEventListener("click", () => set({ ...cur, utility: cur.utility ? null : "wheel" }));
    if (dom.swapBtn) dom.swapBtn.addEventListener("click", () => set(Object.assign({}, cur, { swap: !cur.swap })));
    if (dom.pedalsBtn) dom.pedalsBtn.addEventListener("click", () => set(Object.assign({}, cur, { pedals: cur.pedals === "side" ? "stack" : "side" })));
    if (dom.stripBtn) dom.stripBtn.addEventListener("click", () => set(Object.assign({}, cur, { strip: cur.strip === "column" ? "row" : "column" })));
    dom.sheet?.addEventListener("cancel", e => { e.preventDefault(); show(false); });
    function show(on) {
      if (on) dom.releaseControls?.();
      if (dom.sheet) {
        if (!on && dom.sheet.open) dom.sheet.close();
        dom.sheet.hidden = !on;
        if (on && !dom.sheet.open) dom.sheet.showModal();
      }
      if (on && dom.responses && typeof TouchButtonSettings !== "undefined") {
        TouchButtonSettings.mount(dom.responses, PedalTravel.phoneButtons, { standalone: true });
      }
      (on ? dom.done : dom.open)?.focus?.();
    }
    // ARRANGE: capture-phase pointers on the stage, so a drag on GAS moves GAS and never presses it.
    const A = dom.arrange || {}, idOf = new Map(Object.entries(A).map(([id, el]) => [el, id]));
    let picked = null, drag = null, baseline, opener, frame = 0, coarse = false;
    const history = [];
    const remember = () => { if (history.length >= 50) history.shift(); history.push(cur); };
    const pts = new Map();
    const W = () => (typeof innerWidth === "number" ? innerWidth : 800), H = () => (typeof innerHeight === "number" ? innerHeight : 400);
    const placeOf = (id) => cur.place[id] || { x: 0, y: 0, s: 100 };
    const label = (id) => { const el = A[id]; return el ? (el.getAttribute && el.getAttribute("aria-label")) || el.textContent.trim().split(/\s+/)[0] || id : id; };
    // Two controls that overlap (more than a 3px touch on both axes) both turn red, as in ARRANGE HUD.
    function markClashes() {
      const els = Object.values(A).filter((el) => el && el.getBoundingClientRect && el.classList), rs = els.map((el) => el.getBoundingClientRect());
      const hitBy = els.map(() => false);
      for (let i = 0; i < els.length; i++) for (let j = i + 1; j < els.length; j++) {
        const a = rs[i], b = rs[j];
        if (!a.width || !b.width) continue;
        if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 3 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 3) hitBy[i] = hitBy[j] = true;
      }
      els.forEach((el, i) => el.classList.toggle("clash", arranging() && hitBy[i]));
    }
    function pick(id) {
      if (picked && A[picked] && A[picked].classList) A[picked].classList.remove("picked");
      picked = id; if (id && A[id] && A[id].classList) A[id].classList.add("picked");
      if (dom.picker && id) dom.picker.value = id;
      if (dom.undo) dom.undo.disabled = !history.length;
      const p = placeOf(id);
      if (dom.barName) dom.barName.textContent = id ? "X " + p.x + "% · Y " + p.y + "% · Scale " + p.s + "% · Width " +
        (p.w ? p.w + "vw" : "auto") + " · Height " + (p.h ? p.h + "vh" : "auto") : "Select a control";
      if (dom.shape) {
        dom.shape.disabled = !id || id === "screen" || id === "steering";
        dom.shape.value = p.shape || "default";
      }
      markClashes();
    }
    function put(id, p, save) {
      const place = Object.assign({}, cur.place, { [id]: p });
      if (save) set(Object.assign({}, cur, { place })); else { cur = Object.assign({}, cur, { place: normalisePlace(place) }); placeEl(A[id], cur.place[id]); }
      if (!drag) pick(id);
    }
    function sizeBy(id, factor, save) {
      const el = A[id], p = placeOf(id), r = el && el.getBoundingClientRect ? el.getBoundingClientRect() : { width: 100, height: 100 };
      put(id, { ...p, s: Math.max(minScale(r.width, r.height, p.s), Math.min(250, Math.round(p.s * factor))) }, save);
    }
    const arranging = () => !!(dom.body && dom.body.classList && dom.body.classList.contains("arranging"));
    function restore(snapshot) { cur = applyLayout(dom, snapshot); paint(); pick(picked); }
    function arrange(on, accept = true) {
      if (on === arranging()) return;
      if (on) {
        dom.releaseControls?.();
        baseline = cur; opener = dom.doc?.activeElement;
      }
      else { stopDrag(true); if (accept && cur !== baseline) set(cur); else restore(baseline); }
      dom.body.classList.toggle("arranging", on);
      if (dom.bar) dom.bar.hidden = !on;
      history.length = 0;
      if (on) {
        show(false);
        if (dom.tools) { dom.tools.hidden = true; dom.adjust.setAttribute("aria-expanded", "false"); }
        dom.bar?.removeAttribute("data-bottom");
        const ids = Object.keys(A).filter(id => A[id]?.getClientRects().length);
        if (dom.picker) {
          dom.picker.replaceChildren();
          for (const id of ids) {
            const option = dom.doc.createElement("option");
            option.value = id; option.textContent = id === "screen" ? "Dashboard" : label(id);
            dom.picker.appendChild(option);
          }
          dom.picker.focus();
        }
        pick(ids[0] || null);
      } else {
        pick(null);
        if (dom.sheet?.contains?.(opener)) show(true);
        (opener?.getClientRects?.().length ? opener : dom.open)?.focus?.();
      }
    }
    function paintDrag() {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      if (!drag || !drag.next) return;
      put(drag.id, drag.next, false);
      drag.next = null;
    }
    function stopDrag(keep) {
      if (!drag) return;
      if (keep) paintDrag();
      else {
        if (frame) cancelAnimationFrame(frame);
        frame = 0; restore(drag.before);
      }
      const before = drag.before;
      drag = null; pts.clear();
      if (keep && cur !== before) {
        if (history.length >= 50) history.shift();
        history.push(before);
      }
      pick(picked);
    }
    if (dom.stage) {
      const stop = (e) => { e.stopPropagation(); if (e.cancelable) e.preventDefault(); };
      const hit = (t) => { for (let n = t; n && n !== dom.stage; n = n.parentNode) if (idOf.has(n)) return idOf.get(n); return null; };
      dom.stage.addEventListener("pointerdown", (e) => {
        if (!arranging()) return;
        stop(e);
        const id = hit(e.target); if (!id || (drag && (id !== drag.id || pts.size >= 2))) return;
        if (dom.tools && !dom.tools.hidden) {
          dom.tools.hidden = true;
          dom.adjust.setAttribute("aria-expanded", "false");
        }
        pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pts.size === 1) { const p = placeOf(id); drag = { id, before: cur, x0: e.clientX, y0: e.clientY, p }; pick(id); }
        else if (pts.size === 2 && drag) { const [a, b] = [...pts.values()]; paintDrag();
          const box = A[id].getBoundingClientRect(), floor = minScale(box.width, box.height, placeOf(id).s);
          drag.pinch = { floor, d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, s0: placeOf(drag.id).s }; }
        try { dom.stage.setPointerCapture && dom.stage.setPointerCapture(e.pointerId); } catch (_) { /* a drag without capture still tracks while over the stage */ }
      }, true);
      dom.stage.addEventListener("pointermove", (e) => {
        if (!arranging() || !drag || !pts.has(e.pointerId)) return;
        stop(e); pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (drag.pinch && pts.size >= 2) {
          const [a, b] = [...pts.values()], f = Math.hypot(a.x - b.x, a.y - b.y) / drag.pinch.d0;
          drag.next = { ...placeOf(drag.id), s: Math.max(drag.pinch.floor, drag.pinch.s0 * f) };
        } else if (!drag.pinch) {
          drag.next = { ...drag.p, x: drag.p.x + (e.clientX - drag.x0) / W() * 100, y: drag.p.y + (e.clientY - drag.y0) / H() * 100, s: drag.p.s };
        }
        if (!frame && typeof requestAnimationFrame === "function") frame = requestAnimationFrame(paintDrag);
        else if (!frame) paintDrag();
      }, true);
      const end = (e) => {
        if (!arranging()) return;
        if (!pts.has(e.pointerId)) return;
        stop(e); pts.delete(e.pointerId);
        if (!pts.size || e.type !== "pointerup") stopDrag(e.type === "pointerup");
        else if (drag) {
          paintDrag();
          const [point] = pts.values();
          Object.assign(drag, {pinch:null, p:placeOf(drag.id), x0:point.x, y0:point.y});
        }
      };
      dom.stage.addEventListener("pointerup", end, true); dom.stage.addEventListener("pointercancel", end, true);
      dom.stage.addEventListener("lostpointercapture", end, true);
      for (const t of ["click", "contextmenu", "keydown", "keyup"]) dom.stage.addEventListener(t, (e) => { if (arranging()) stop(e); }, true);
    }
    if (dom.arrangeBtn) dom.arrangeBtn.addEventListener("click", () => arrange(true));
    if (dom.arrangeDone) dom.arrangeDone.addEventListener("click", () => arrange(false));
    dom.cancel?.addEventListener("click", () => arrange(false, false));
    dom.picker?.addEventListener("change", () => pick(dom.picker.value));
    dom.adjust?.addEventListener("click", () => {
      dom.tools.hidden = !dom.tools.hidden; dom.adjust.setAttribute("aria-expanded", String(!dom.tools.hidden));
    });
    dom.edge?.addEventListener("click", () => dom.bar.toggleAttribute("data-bottom"));
    dom.step?.addEventListener("click", () => {
      coarse = !coarse; dom.step.textContent = coarse ? "Coarse" : "Fine"; dom.step.setAttribute("aria-pressed", String(coarse));
    });
    const edit = fn => { stopDrag(true); remember(); fn(); };
    dom.shape?.addEventListener("change", () => {
      if (picked && !dom.shape.disabled) edit(() => put(picked, { ...placeOf(picked), shape: dom.shape.value }, false));
    });
    const dirs = {left:[-1,0], right:[1,0], up:[0,-1], down:[0,1]};
    for (const button of dom.nudges || []) button.addEventListener("click", () => {
      if (!picked) return;
      const [x,y] = dirs[button.dataset.nudge], n = coarse ? 5 : 1;
      edit(() => { const p = placeOf(picked); put(picked, { ...p, x:p.x + x*n, y:p.y + y*n }, false); });
    });
    for (const [button, factor] of [[dom.minus, 0.9], [dom.plus, 1.1]]) button?.addEventListener("click", () => {
      if (picked) edit(() => sizeBy(picked, factor, false));
    });
    for (const button of dom.dimensions || []) button.addEventListener("click", () => {
      if (!picked) return;
      const axis = button.dataset.dimension, width = axis === "w";
      edit(() => {
        const p = placeOf(picked), rect = A[picked].getBoundingClientRect();
        const size = p[axis] ?? (width ? rect.width / W() : rect.height / H()) * 10000 / p.s;
        put(picked, { ...p, [axis]: size + Number(button.dataset.step) * (coarse ? 5 : 1) }, false);
      });
    });
    dom.undo?.addEventListener("click", () => { stopDrag(true); if (history.length) restore(history.pop()); });
    dom.resetOne?.addEventListener("click", () => { if (picked) edit(() => put(picked, {x:0,y:0,s:100}, false)); });
    dom.resetAll?.addEventListener("click", () => edit(() => restore(LAYOUT_PRESETS.classic)));
    function wrapTab(e) {
      if (e.key !== "Tab") return;
      const controls = Array.from(e.currentTarget.querySelectorAll("button,select,input,summary")).filter(el => !el.disabled && el.tabIndex >= 0 && el.getClientRects().length);
      const first = controls[0], last = controls[controls.length - 1];
      if (e.shiftKey ? e.target === first : e.target === last) {
        e.preventDefault(); (e.shiftKey ? last : first).focus();
      }
    }
    dom.sheet?.addEventListener?.("keydown", wrapTab);
    dom.bar?.addEventListener("keydown", wrapTab);
    dom.doc?.addEventListener?.("keydown", e => {
      if (e.key !== "Escape" || (!arranging() && (!dom.sheet || dom.sheet.hidden))) return;
      e.preventDefault(); e.stopPropagation();
      if (arranging()) arrange(false, false);
      else show(false);
    }, true);
    if (typeof window !== "undefined") {
      for (const name of ["blur", "resize"]) window.addEventListener(name, () => stopDrag(false));
    }
    if (dom.open) dom.open.addEventListener("click", () => show(true));
    if (dom.done) dom.done.addEventListener("click", () => show(false));
    cur = applyLayout(dom, cur); paint();
    return { get: () => normaliseLayout(cur), set, show, arrange, sizeBy: (id, f) => sizeBy(id, f, true) };
  }

  return { HELD, DASH, paintHud, pad, pressLatch, latchButtons, LAYOUT_KEYS, LAYOUT_PRESETS, ARRANGE_MIN_PX, minScale, normaliseLayout, readWheelBackup, layoutPreset, applyLayout, layout };
})();
Object.freeze(PhonePadPage);
