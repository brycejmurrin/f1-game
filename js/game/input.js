/* Input: keyboard / gamepad / tilt / touch for Apex 26. Steering sources, by priority (see steer()): keyboard (held or still returning to center) > gamepad (a con… */
"use strict";

const Input = (function () {
  // Tilt mechanics ported verbatim from the driving-game (Neon Drift) build.
  let MAX_TILT = 36;          // degrees of tilt for full steering lock (higher = less sensitive)
  let DEADZONE = 2.5;         // degrees ignored around neutral — fixed small; not a player knob
  const TILT_SLEW = 8;        // fixed safety cap (steer units/s): a last guard so a hand jolt
  let KEY_RAMP_IN = 6;        // steer units/s toward full lock
  let KEY_RAMP_OUT = 8;       // steer units/s back to centre (quicker: releasing
  let adaptiveMix = 0;
  let steerSpeedRef = 41.7;   // default SPEED STEER v5; pushed from steer-tuning
  let speedStdOverride = null;
  let speedProvider = null;
  const DEG = Math.PI / 180;

  let keyLeft = false;
  let keyRight = false;
  let keyBrake = false;
  let keyThrottle = false;
  let keySteerVal = 0;        // ramped -1..1
  let keySteerT = 0;          // last ramp timestamp, ms (0 = unset)

  let overtakePressed = false;
  let boostTogglePressed = false;
  let aeroTogglePressed = false;
  // edge-triggered gear shifts (manual mode)
  let shiftUpPressed = false;
  let shiftDownPressed = false;
  // edge-triggered camera cycle (C key / CAM tap)
  let cameraCyclePressed = false;

  // gamepad (W3C Gamepad API, "standard" mapping). Polled once per display
  // frame from poll(). Works on desktop browsers and iOS 14.5+ Safari with a
  // paired PS5 / Xbox / MFi controller — no secure-context or permission gate,
  // so it runs anywhere the game is served (GitHub Pages included).
  let padConnected = false;
  let _padReprobe = 0;      // frames since last disconnected-state re-probe
  let padPollWarned = false;
  let padMapWarned = false;
  let padSteer = 0;            // -1..1 from left stick / d-pad
  let padThrottle = false;
  let padBrake = false;
  let padThrottleVal = 0;
  let padBrakeVal = 0;
  let padPrevButtons = [];     // previous frame's pressed state, for rising edges
  const PAD_DEADZONE = 0.14;   // driving left-stick centre slop (ignored, then re-scaled)
  const PAD_NAV_DEADZONE = 0.22; // menu sticks only — larger so a resting stick does not creep

  let padNavDir = null;           // held direction while a menu is open, or null
  let padNavNextT = 0;            // nowMs() of the next synthesized repeat
  let padNavSeeded = false;       // one ArrowDown seed per open-menu session
  let padNavSeedLayer = null;     // UiLayers.top() we last seeded for (layer change re-arms)
  const PAD_NAV_DELAY_MS = 450;   // delay before the first repeat
  const PAD_NAV_REPEAT_MS = 130;  // interval between repeats while held
  const PAD_NAV_KEYS = { up: "ArrowUp", down: "ArrowDown", left: "ArrowLeft", right: "ArrowRight" };

  const touches = new Map();
  let touchSeq = 0;
  let touchSteer = 0;      // the winning touch's drag, -1..1
  let touchActive = false; // is any finger on the glass (vs. ramping back home)
  let touchSteerVal = 0;   // what steer() emits: touchSteer while held, ramped on release
  let touchSteerT = 0;     // last ramp timestamp, ms

  // on-screen buttons (multi-pointer safe via per-button pointer sets)
  let btnThrottle = false;
  let btnBrake = false;
  let btnThrottleVal = 0;
  let btnBrakeVal = 0;
  let btnSteerLeft = false;
  let btnSteerRight = false;
  let btnSteerLeftVal = 0; // 0..1 analog travel (adaptive buttons; tap = 1)
  let btnSteerRightVal = 0;
  let btnSteerVal = 0;     // ramped -1..1 (the arrows are a keyboard with fat keys)
  let btnSteerT = 0;       // last ramp timestamp, ms

  let tiltRaw = 0;            // latest remapped tilt, degrees (raw, like Neon Drift)
  let tiltZero = 0;           // calibrated neutral
  let tiltSeen = false;       // we have actually received sensor data
  let gyroAttached = false;
  let gyroDenied = false;
  // HARD refusal only: the sensor API is absent, or requestPermission()
  // RESOLVED to something other than "granted" (the player said no in the
  // iOS sheet). `gyroDenied` also latches on the TRANSIENT path — the promise
  // REJECTING because the call had no user activation, which is what a
  // gamepad A press synthesised as .click() on RACE! produces — and iOS gives
  // both the same shape from the outside. game.js enableTilt() used to read
  // `gyroDenied` there and persist steerMode="buttons" for a refusal that was
  // never the player's; it should auto-switch (and persist) only on THIS flag,
  // and leave the label's "(NO GYRO)" to `gyroDenied`, which keeps its
  // meaning for every existing reader.
  let gyroHardDenied = false;
  // single source of truth for how the player steers: "tilt" | "buttons" | "touch"
  let steerMode = "tilt";
  let tiltSmoothed = 0;       // One-Euro-filtered tilt angle (deg)
  let lastOrientMs = 0;
  let OE_MIN_CUTOFF = 1.2;    // Hz — THE smoothing knob (set by the SMOOTHING slider)
  let OE_BETA = 0.10;
  const OE_DCUTOFF = 1.0;     // Hz, cutoff for the derivative estimate
  let oePrev = 0, oeDPrev = 0, oeInit = false;
  let tiltSteerVal = 0;       // last steer command emitted (-1..1)
  let tiltSteerT = 0;         // timestamp of the last tiltSteering() call (ms)

  let onPauseCb = null;

  // SIM TIME vs WALL TIME. The steering RAMPS (keyboard, and the tilt slew) are
  // control-loop stages: they belong to the same clock the car is integrated on,
  // not to the wall. Normally those are the same clock and this is 1.
  //
  // HIT-STOP is where they come apart. After a hard crash js/game.js runs the
  // simulation at 0.15x for a few frames so the impact reads, but the ramps were
  // still advancing on `performance.now()` — so for the length of the effect the
  // wheel travelled ~6.7x further per simulated second than it does at any other
  // moment, and the car came out of a crash with a steering command the driver
  // never had time to give. The game loop reports its scale here each frame and
  // the ramps run on the same time base the physics does.
  //
  // Deliberately NOT applied to the One-Euro filter in onOrient(): that is a
  // SENSOR filter running at the deviceorientation rate, and it must keep
  // tracking the real hand at real speed however slowly the world is moving.
  let timeScale = 1;
  function setTimeScale(s) {
    timeScale = (typeof s === "number" && isFinite(s) && s > 0) ? Math.min(s, 1) : 1;
  }

  function nowMs() {
    return (typeof performance !== "undefined" && performance.now)
      ? performance.now() : Date.now();
  }

  const clamp = M4.clamp;                     // shared scalar helper (js/mat4.js)

  // One-Euro filter: smoothing factor for a given cutoff frequency and timestep.
  function oeAlpha(cutoff, dt) {
    const r = 2 * Math.PI * cutoff * dt;
    return r / (r + 1);
  }
  function oneEuro(x, dt) {
    if (!oeInit) { oePrev = x; oeDPrev = 0; oeInit = true; return x; }
    if (dt <= 0) return oePrev;
    const dx = (x - oePrev) / dt;                       // raw rate of change
    const dxHat = oeDPrev + oeAlpha(OE_DCUTOFF, dt) * (dx - oeDPrev);
    const cutoff = OE_MIN_CUTOFF + OE_BETA * Math.abs(dxHat);
    const xHat = oePrev + oeAlpha(cutoff, dt) * (x - oePrev);
    oePrev = xHat; oeDPrev = dxHat;
    return xHat;
  }

  function screenAngle() {
    if (typeof screen !== "undefined" && screen.orientation &&
        typeof screen.orientation.angle === "number") {
      return screen.orientation.angle;
    }
    if (typeof window.orientation === "number") return window.orientation;
    return 0;
  }

  function onOrient(e) {
    if (e.beta === null && e.gamma === null) return;
    const beta = (e.beta ?? 0) * DEG;     // front-back (X)
    const gamma = (e.gamma ?? 0) * DEG;  // left-right (Y)
    const cb = Math.cos(beta), sb = Math.sin(beta);
    const cg = Math.cos(gamma), sg = Math.sin(gamma);
    const gx = sg * cb;   // gravity along device right
    const gy = -sb;       // gravity along device top
    const gz = -cg * cb;  // gravity along device out-of-screen
    let h, v;             // gravity along screen-right (h) vs the rest (v)
    switch (((screenAngle() % 360) + 360) % 360) {
      case 90:  h = -gy; v = Math.hypot(gx, gz); break;
      case 180: h = -gx; v = Math.hypot(gy, gz); break;
      case 270: h =  gy; v = Math.hypot(gx, gz); break;
      default:  h =  gx; v = Math.hypot(gy, gz); break;
    }
    tiltRaw = Math.atan2(h, v) / DEG;   // signed roll in degrees
    const n = nowMs();
    const odt = lastOrientMs ? Math.min(0.1, (n - lastOrientMs) / 1000) : 0.016;
    lastOrientMs = n;
    tiltSmoothed = oneEuro(tiltRaw, odt);
    tiltSeen = true;
  }

  function attachGyro() {
    if (gyroAttached) return;
    gyroAttached = true;
    window.addEventListener("deviceorientation", onOrient);
  }
  // Leaving tilt used to leave the sensor streaming (and the One-Euro filter
  // running) for the whole session; attach is idempotent, so re-entering tilt
  // costs nothing.
  function detachGyro() {
    if (!gyroAttached) return;
    gyroAttached = false;
    window.removeEventListener("deviceorientation", onOrient);
    tiltSeen = false;
  }

  // Must be called from a user gesture (iOS permission prompt).
  // Resolves true if tilt data can be expected.
  function requestGyro() {
    if (typeof DeviceOrientationEvent === "undefined") {
      gyroDenied = gyroHardDenied = true;   // no sensor API at all: as final as a "denied"
      return Promise.resolve(false);
    }
    if (typeof DeviceOrientationEvent.requestPermission === "function") {
      try {
        return DeviceOrientationEvent.requestPermission()
          .then(res => {
            if (res === "granted") {
              // A grant clears an earlier refusal. The flag latched true on ANY
              // rejection — including the transient kind (a request outside a
              // user gesture, e.g. a gamepad A press synthesised as .click())
              // — and never came back, so a later prompt the player accepted
              // still labelled STEER "(NO GYRO)" while tilt was driving.
              gyroDenied = gyroHardDenied = false;
              attachGyro();
              return true;
            }
            gyroDenied = gyroHardDenied = true;   // resolved "denied": the player's answer
            return false;
          })
          .catch(() => {
            gyroDenied = true;   // rejected: no user activation, ask again from a real tap
            return false;
          });
      } catch (err) {
        gyroDenied = true;
        return Promise.resolve(false);
      }
    }
    attachGyro();
    return Promise.resolve(true);
  }

  function calibrate() {
    tiltZero = tiltRaw;
    oePrev = tiltRaw; oeDPrev = 0; oeInit = true;
    tiltSmoothed = tiltRaw;
    tiltSteerVal = 0;
    tiltSteerT = 0;
  }

  function tiltActive() {
    return steerMode === "tilt" && tiltSeen;
  }

  // Drive the FULL tilt pipeline with an explicit timestep instead of wall-clock:
  // feed a raw tilt angle (deg) and dt (s), get back the steer command (-1..1)
  // after the real One-Euro filter, dead zone, MAX_TILT map and slew limiter. Lets
  // a headless harness "play via tilt" and measure how tilt settings actually drive.
  // (The live game still uses the wall-clock onOrient/tiltSteering path untouched.)
  function simTilt(rawDeg, dt) {
    const step = dt > 0 ? dt : 0.016;
    tiltSeen = true;
    tiltRaw = rawDeg;
    tiltSmoothed = oneEuro(rawDeg, step);
    // Same map and same slew the live path uses — deliberately WITHOUT
    // timeScale, because the caller supplies dt and a reproducible run must not
    // depend on whether the game happens to be in hit-stop.
    return tiltSlew(tiltTarget(), step);
  }
  // Reset the tilt filter/slew/zero state so a fresh emulation run starts clean.
  function simTiltReset() {
    oeInit = false; oePrev = 0; oeDPrev = 0;
    tiltSmoothed = 0; tiltSteerVal = 0; tiltZero = 0; tiltRaw = 0;
  }
  function steerToTilt(cmd) {
    if (Math.abs(cmd) < 1e-4) return 0;
    return clamp(cmd, -1, 1) * (MAX_TILT - DEADZONE) + Math.sign(cmd) * DEADZONE;
  }

  // THE TILT MAP AND THE SLEW, factored out so the live path and the
  // deterministic harness cannot disagree about them.
  //
  // They used to be written twice — here and in simTilt — and the copies had
  // already drifted: the hit-stop `timeScale` fix landed in the live one only.
  // That omission is CORRECT for the harness (it is handed an explicit dt and
  // exists to be reproducible; hit-stop is a live-loop idea), which is the worst
  // kind of drift — right by accident, unstated, with autopilot's tilt lap
  // riding on it. Now the only difference between the two callers is the one
  // that is supposed to differ: where dt comes from.

  function tiltTarget() {
    let d = tiltSmoothed - tiltZero;
    if (Math.abs(d) < DEADZONE) return 0;
    d -= Math.sign(d) * DEADZONE;
    return clamp(d / (MAX_TILT - DEADZONE), -1, 1);
  }

  function tiltSlew(target, dt) {
    const releasing = Math.abs(target) < Math.abs(tiltSteerVal);
    tiltSteerVal = moveToward(tiltSteerVal, target, (releasing ? 1.6 : 1.0) * TILT_SLEW * dt);
    return tiltSteerVal;
  }

  function tiltSteering() {
    const t = nowMs();
    // timeScale belongs to the LIVE path only — see its declaration.
    const dt = (tiltSteerT ? Math.min(0.1, (t - tiltSteerT) / 1000) : 0) * timeScale;
    tiltSteerT = t;
    return tiltSlew(tiltTarget(), dt);
  }

  function moveToward(v, target, step) {
    return v + clamp(target - v, -step, step);
  }

  function currentSpeedStd() {
    if (speedStdOverride != null) return speedStdOverride;
    if (typeof speedProvider === "function") {
      const v = speedProvider();
      if (typeof v === "number" && isFinite(v)) return Math.max(0, v);
    }
    return 0;
  }
  function digitalRateIn() {
    if (adaptiveMix <= 0) return KEY_RAMP_IN;
    const ref = steerSpeedRef > 1 ? steerSpeedRef : 41.7;
    const full = KEY_RAMP_IN / (1 + currentSpeedStd() / ref);
    return KEY_RAMP_IN + (full - KEY_RAMP_IN) * adaptiveMix;
  }

  function keyboardSteer() {
    const t = nowMs();
    const dt = (keySteerT ? Math.min(0.1, (t - keySteerT) / 1000) : 0) * timeScale;
    keySteerT = t;
    const target = (keyRight ? 1 : 0) - (keyLeft ? 1 : 0);
    if (target !== 0) {
      keySteerVal = moveToward(keySteerVal, target, digitalRateIn() * dt);
    } else {
      keySteerVal = moveToward(keySteerVal, 0, KEY_RAMP_OUT * dt);
    }
    return keySteerVal;
  }

  // A menu overlay being open is what hands the arrow keys to js/game/menunav.js:
  // while the pause menu, the select screen or any sheet is up, Up/Down/Left/Right
  // move through the menu and must not also be steering and braking the car
  // underneath it. Asked per key event, never per tick — keys are rare and the
  // set of open overlays changes without notice.
  // THE LIST LIVES IN js/game/uilayers.js.
  function menuOverlayOpen() {
    return !!(window.UiLayers && window.UiLayers.anyOpen());
  }

  function onKey(e, down) {
    const active = document.activeElement;
    const tag = (active && active.tagName) || (e.target && e.target.tagName) || "";
    const interactive = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" ||
      tag === "BUTTON" || tag === "A" || (active && active.isContentEditable);
    const hudControl = active && active.matches &&
      active.matches("#btn-cam, #pausebtn, #hud-restore, #pc-restore, .touchbtn");
    // Guard key PRESSES only: typing in a field or activating a control must not
    // also drive the car. RELEASES are still processed — if a movement key went
    // down with the game focused and focus then moved to a button (e.g. a control
    // tapped during an off-track scramble), swallowing its keyup here would latch
    // that key ON with no way to clear it. A stuck-on throttle then keeps
    // re-tripping the auto-rescue (it fires when throttle is held but the car
    // isn't moving), so the car floors itself off the track and gets reset again
    // and again — the "throttle stuck on after a reset" bug. Clearing a key that
    // was never registered as down is a harmless no-op.
    // While an interactive element has focus, a release must ONLY clear the
    // held-key latches — never fall through to the main switch: its Space case
    // calls preventDefault unconditionally, and preventDefault on Space KEYUP
    // cancels the focused button's activation click (buttons activate on Space
    // keyup), which broke every Space/keyboard press of a menu button.
    // The menu check is deliberately OUTSIDE the hudControl escape hatch: #pausebtn
    // keeps focus after it opens the pause menu, and letting that focus fall
    // through to the switch below is exactly how an arrow key ended up steering a
    // paused car.
    const typing = interactive && !hudControl;
    /* PAUSE AND BACK ARE COMMANDS, NOT DRIVING CONTROLS, so they sit ABOVE the
       driving gate — but still below the typing check, because P in a text
       field is a letter.
       They used to sit inside the switch below, which only worked by accident:
       the gate's screen list happened not to mention the two tuner panels, so
       the pause key reached them. The moment that list was corrected (one list
       for everyone, js/game/uilayers.js) the key started being swallowed in the
       LIGHTING TUNER and free camera — the one place its documented
       all-the-way-out behaviour matters most. Reachability should not be a
       side effect of a list being incomplete. */
    if (down && !e.repeat && (e.code === "KeyP" || e.code === "Escape") && !typing) {
      if (e.code === "KeyP") {
        if (onPauseCb) onPauseCb();
        return;
      }
      /* ESCAPE IS "BACK", AND ONLY PAUSE WHEN THERE IS NOTHING TO GO BACK FROM.
         It was a bare alias for KeyP with no state check, which read wrong on a
         desktop keyboard everywhere the answer to Escape was obviously "close
         this" — and was actively wrong with a tuner open, where it resumed the
         race instead of stepping back to SETTINGS. An open layer belongs to the
         Escape handler in js/game/topmodal.js, which runs first (capture) and
         presses that screen's own back control; by the time one is open this
         key normally never even arrives. */
      if (onPauseCb && window.UiLayers && window.UiLayers.inRace() && !window.UiLayers.anyOpen()) {
        onPauseCb();
        /* AND THE KEY IS SPENT — without this, Escape could not pause at all.
           #pausemenu is a <dialog> (js/game/topmodal.js), so opening it here
           hands Chrome a fresh close-watcher MID-KEYPRESS, and the watcher
           takes the KEYUP of the very Escape that opened it: the menu appeared
           and vanished within one press, measured keydown→shown, keyup→hidden.
           preventDefault on the keydown suppresses the close request, and it is
           honest besides — we consumed the key. Only in this branch:
           preventDefault on an Escape we did NOT handle would stop every dialog
           on the screen from closing. */
        e.preventDefault();
      }
      return;
    }
    if (menuOverlayOpen() || typing) {
      if (down) return;
      switch (e.code) {
        case "ArrowLeft": case "KeyA": keyLeft = false; break;
        case "ArrowRight": case "KeyD": keyRight = false; break;
        case "ArrowUp": case "KeyW": keyThrottle = false; break;
        case "ArrowDown": case "KeyS": keyBrake = false; break;
      }
      return;
    }
    switch (e.code) {
      case "ArrowLeft": case "KeyA":
        keyLeft = down; if (down) e.preventDefault(); break;
      case "ArrowRight": case "KeyD":
        keyRight = down; if (down) e.preventDefault(); break;
      case "ArrowUp": case "KeyW":
        keyThrottle = down; if (down) e.preventDefault(); break;
      case "ArrowDown": case "KeyS":
        keyBrake = down; if (down) e.preventDefault(); break;
      case "Space":
        if (down && !e.repeat) boostTogglePressed = true; e.preventDefault(); break;
      case "KeyX":
        if (down && !e.repeat) overtakePressed = true;
        break;
      case "KeyZ":
        if (down && !e.repeat) aeroTogglePressed = true;
        break;
      case "KeyE":
        if (down && !e.repeat) shiftUpPressed = true; break;
      case "KeyQ": case "ShiftLeft": case "ShiftRight":
        if (down && !e.repeat) shiftDownPressed = true; break;
      case "KeyC":
        if (down && !e.repeat) cameraCyclePressed = true; break;
      // KeyP and Escape are handled ABOVE the driving gate — see the comment
      // there. They are commands, and a menu being open must not swallow them.
    }
  }

  const TOUCH_RANGE_FRAC = 0.12;   // LONG-edge fractions of drag for full lock
  const TOUCH_DEAD_PX = 5;         // slop around the anchor: a tap is not a steer
  let touchRangeFrac = TOUCH_RANGE_FRAC;

  function touchRangePx() {
    // The LONG edge, not innerWidth. Off the short edge a 393x852 phone gets
    // 47px of drag for full lock against 101px landscape — the identical
    // gesture, twice as twitchy, because the phone turned. Landscape is
    // unchanged (its long edge IS innerWidth). PERF-FINDINGS 5a.
    const win = typeof window !== "undefined" ? window : null;
    const long = Math.max((win && win.innerWidth) || 844, (win && win.innerHeight) || 390);
    return Math.max(40, long * touchRangeFrac);
  }

  function touchCmd(rec) {
    if (steerMode !== "touch") return 0;
    const dx = rec.x - rec.anchorX;
    const a = Math.abs(dx);
    if (a <= TOUCH_DEAD_PX) return 0;
    return clamp(Math.sign(dx) * (a - TOUCH_DEAD_PX) / touchRangePx(), -1, 1);
  }

  // "Most recent steering touch wins" is the rule, and it needs an explicit
  // sequence number to be true. The obvious reading — take the last entry of the
  // Map — is wrong: Map iterates in INSERTION order and `set()` on an existing
  // key keeps that key where it was. So a finger placed FIRST and then dragged
  // across the screen could never take the steering from a later finger that had
  // not moved since. Stamping every start and every move gives the rule its
  // literal meaning: whichever touch last SAID something is the one steering.
  //
  // A touch still resting inside its dead zone counts as steering-zero rather
  // than as absent, so a second thumb parked on the glass does not silently hand
  // control back to a finger the player stopped using.
  function recomputeTouchSteer() {
    let best = -1;
    touchActive = false;
    for (const rec of touches.values()) {
      if (rec.seq > best) { best = rec.seq; touchSteer = touchCmd(rec); touchActive = true; }
    }
    if (!touchActive) touchSteer = 0;
  }

  function canvasTouchIsDriving() { return !menuOverlayOpen(); }

  function onTouchStart(e) {
    if (!canvasTouchIsDriving()) return;
    e.preventDefault();
    for (const t of e.changedTouches) {
      touches.set(t.identifier, { anchorX: t.clientX, x: t.clientX, seq: ++touchSeq });
    }
    recomputeTouchSteer();
  }

  function onTouchMove(e) {
    if (!canvasTouchIsDriving()) return;
    e.preventDefault();
    for (const t of e.changedTouches) {
      const rec = touches.get(t.identifier);
      if (rec) { rec.x = t.clientX; rec.seq = ++touchSeq; }
    }
    recomputeTouchSteer();
  }

  function onTouchEnd(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      touches.delete(t.identifier);
    }
    recomputeTouchSteer();
  }

  function touchSteering() {
    const t = nowMs();
    const dt = (touchSteerT ? Math.min(0.1, (t - touchSteerT) / 1000) : 0) * timeScale;
    touchSteerT = t;
    if (touchActive) { touchSteerVal = touchSteer; return touchSteerVal; }
    touchSteerVal = moveToward(touchSteerVal, 0, KEY_RAMP_OUT * dt);
    return touchSteerVal;
  }

  function buttonSteering() {
    const t = nowMs();
    const dt = (btnSteerT ? Math.min(0.1, (t - btnSteerT) / 1000) : 0) * timeScale;
    btnSteerT = t;
    const left = btnSteerLeft ? (1 + (btnSteerLeftVal - 1) * adaptiveMix) : 0;
    const right = btnSteerRight ? (1 + (btnSteerRightVal - 1) * adaptiveMix) : 0;
    const target = right - left;
    btnSteerVal = moveToward(btnSteerVal, target, (target !== 0 ? digitalRateIn() : KEY_RAMP_OUT) * dt);
    return btnSteerVal;
  }

  // Every wireHold button registers here so its private pressed-pointer set can
  // be cleared from OUTSIDE the closure. Nets that hang off this list:
  //   1. window-level capture-phase pointerup/pointercancel (init) release that
  //      pointerId from EVERY hold button — a pointer that lifted anywhere is by
  //      definition no longer holding anything, even when the button itself never
  //      received the event (retargeted lift, missed lostpointercapture).
  //   2. lostpointercapture, but ONLY via lostCaptureShouldRelease — a
  //      capture steal from a second hold button is not a lift (GAS + a
  //      turn arrow). A button that was already hidden at pointerdown is
  //      not a teardown either.
  //   3. reset() (blur / tab-hidden) clears every set outright, covering OS
  //      interruptions where NO pointer event is delivered at all.
  // Without these, an interruption mid-hold left a ghost pointerId in the set:
  // reset() zeroed btnThrottle but couldn't reach the closure, so after the next
  // press+release the set never emptied again ("held until every pointer
  // releases" counted a pointer that no longer existed) and the throttle could
  // be switched ON but never OFF — intermittent because an OS that happens to
  // REUSE the same pointerId self-heals. The stuck throttle then endlessly
  // re-trips the off-track auto-rescue ("throttle held but not moving").
  const holdBtns = [];
  function holdReleasePointer(pointerId) {
    for (const h of holdBtns) {
      h.anchors && h.anchors.delete(pointerId);
      h.live && h.live.delete(pointerId);
      if (h.ids.delete(pointerId) && h.ids.size === 0) { h.apply(false); h.level && h.level(0); }
    }
  }
  function holdReleaseAll() {
    for (const h of holdBtns) {
      h.ids.clear();
      h.anchors && h.anchors.clear();
      h.live && h.live.clear();
      h.apply(false);
      h.level && h.level(0);
    }
  }

  // lostpointercapture is a TEARDOWN signal, not a lift. It fires when the
  // capture target is hidden/removed (the stuck-GAS case) AND when a second
  // hold button calls setPointerCapture — WebKit keeps one capture slot, so
  // tapping LEFT while GAS is down steals capture from GAS and used to drop
  // the throttle with the thumb still on it.
  //
  // Honour the event only when the button DISAPPEARED mid-hold (visible at
  // pointerdown, gone now). Buttons start `[hidden]` in the shell and tests
  // often press them that way; treating "currently hidden" as a teardown
  // would drop every capture-steal in the harness AND a real two-thumb
  // press if a parent group flickered hidden. Target === document is
  // PE3 §9.5 (capture target disconnected) — always a teardown.
  function holdTargetGone(el) {
    if (!el || el === document) return true;
    if (!el.isConnected) return true;
    if (el.hidden) return true;
    const parent = el.parentElement;
    if (parent && parent.hidden) return true;
    try {
      const s = getComputedStyle(el);
      if (s.display === "none" || s.visibility === "hidden") return true;
    } catch (_) { /* getComputedStyle can throw on a detached node */ }
    return false;
  }
  function lostCaptureShouldRelease(el, pointerId) {
    if (!el || el === document || !el.isConnected) return true;
    const h = holdBtns.find((x) => x.el === el);
    const wasVisible = !!(h && h.live.get(pointerId));
    if (!wasVisible) return false;
    return holdTargetGone(el);
  }

  // PEDAL TRAVEL ON A TOUCHSCREEN. The analog-trigger note above says the
  // physics rewards MODULATION and that thresholding a trigger to a boolean
  // throws all of it away — and then the on-screen pedals did exactly that, so
  // the one platform with no triggers at all was also the one that could only
  // stamp or lift. Trail-braking, the mechanic the friction ellipse exists to
  // reward, was unreachable on an iPad.
  //
  // The gesture is STAMP THEN EASE: touching the pedal is full travel, which is
  // precisely what it did before, so nothing is taken away from a player who
  // taps and never discovers this. Sliding the thumb UP the screen, away from
  // the pedal, lifts it — the direction a foot comes off a real one. Pointer
  // capture (below) is what makes it work past the edge of a 72 px button.
  const PEDAL_TRAVEL_PX = 90;   // finger travel from full press to the light end
  const PEDAL_DEAD_PX = 12;     // slop first, so a thumb tremor is not a lift
  const PEDAL_MIN = 0.12;       // never quite zero: sliding off is not releasing

  // Hold semantics, multi-pointer safe: the button stays "held" until
  // every pointer that pressed it has been released/cancelled/left.
  // `level`, when given, additionally reports 0..1 pedal travel.
  // `opts.axis` "x" + `opts.dir` (±1) is the steer-button analog-trigger path:
  // tap is full travel (same compatibility promise as the pedals); sliding
  // opposite the steer direction eases off. The default (no opts) is the
  // original vertical pedal gesture and must stay bit-identical.
  function wireHold(id, apply, level, opts) {
    const el = document.getElementById(id);
    if (!el) return;
    const axis = (opts && opts.axis) === "x" ? "x" : "y";
    const dir = (opts && opts.dir) || 1;
    const ids = new Set();
    const anchors = level ? new Map() : null;   // pointerId -> axis pos at touch-down
    const live = new Map();                     // pointerId -> visible at pointerdown
    holdBtns.push({ ids, apply, level, anchors, el, live });
    el.addEventListener("pointerdown", e => {
      try { el.setPointerCapture(e.pointerId); } catch (_) {}
      e.preventDefault();
      ids.add(e.pointerId);
      live.set(e.pointerId, !holdTargetGone(el));
      apply(true);
      if (level) { anchors.set(e.pointerId, axis === "x" ? e.clientX : e.clientY); level(1); }
    });
    if (level) el.addEventListener("pointermove", e => {
      const a = anchors.get(e.pointerId);
      if (a == null) return;
      if (axis === "x") {
        const ease = Math.max(0, (e.clientX - a) * (-dir) - PEDAL_DEAD_PX);
        level(clamp(1 - ease / PEDAL_TRAVEL_PX, PEDAL_MIN, 1));
        return;
      }
      const up = Math.max(0, a - e.clientY - PEDAL_DEAD_PX);
      level(clamp(1 - up / PEDAL_TRAVEL_PX, PEDAL_MIN, 1));
    });
    function release(e) {
      anchors && anchors.delete(e.pointerId);
      live.delete(e.pointerId);
      if (!ids.delete(e.pointerId)) return;
      if (ids.size === 0) { apply(false); if (level) level(0); }
    }
    el.addEventListener("pointerup", release);
    el.addEventListener("pointercancel", release);
    // NOT pointerleave. setPointerCapture fires a boundary pointerleave as it
    // retargets (holdSetupCtl in js/game.js documents the same trap). A second
    // finger on a turn arrow does the same to a held GAS. Window-level
    // pointerup already covers a lift that lands off the button; capture is
    // what keeps a slide-off from dropping the pedal.
    // lostpointercapture is only a release when the button was taken away —
    // see holdTargetGone. A capture steal from another hold button must not
    // drop a thumb that is still down.
    el.addEventListener("lostpointercapture", function (e) {
      if (!lostCaptureShouldRelease(el, e.pointerId)) return;
      release(e);
    });
  }

  function wireTap(id, fire) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("pointerdown", function () { fire(); });
  }

  // First connected pad, or null. (getGamepads() can return holes / stale slots.)
  function activePad() {
    if (typeof navigator === "undefined" || !navigator.getGamepads) return null;
    let pads;
    try { pads = navigator.getGamepads(); } catch (e) {
      if (!padPollWarned) {
        padPollWarned = true;
        Log.warn("input", "gamepad poll failed: " + ((e && e.message) || e));
      }
      return null;
    }
    if (!pads) return null;
    for (let i = 0; i < pads.length; i++) {
      if (pads[i] && pads[i].connected) return pads[i];
    }
    return null;
  }

  // Buttons may be GamepadButton objects or bare numbers depending on browser.
  function btnVal(pad, i) {
    const b = pad.buttons && pad.buttons[i];
    if (b == null) return 0;
    return typeof b === "object" ? b.value : b;
  }
  function btnDown(pad, i) {
    const b = pad.buttons && pad.buttons[i];
    if (b == null) return false;
    return typeof b === "object" ? b.pressed : b > 0.5;
  }
  function btnEdge(pad, i) {            // rising edge since last poll
    return btnDown(pad, i) && !padPrevButtons[i];
  }
  function padLogId(e) {
    const raw = (e && e.gamepad && e.gamepad.id) || "";
    return String(raw).replace(/[\x00-\x1f\x7f]/g, "").slice(0, 80);
  }

  // Poll the active gamepad once per frame. The Gamepad API has no events for
  // button/axis changes — you must read a fresh snapshot each frame — so this is
  // called at the top of the game loop, before the physics step, to keep input
  // latency to a single frame. Standard mapping WHILE DRIVING (UiLayers.navOpen()
  // false — note the TITLE overlay counts as a nav layer, so a freshly loaded
  // page routes pad buttons to menu-nav, not these latches):
  //   axis 0  left-stick X (steer)      btn 7 RT / btn 0 A  throttle
  //   btn 14/15 d-pad left/right        btn 6 LT / btn 1 B  brake
  //   btn 2 X  boost toggle             btn 3 Y  overtake
  //   btn 4 LB shift down               btn 5 RB shift up
  //   btn 12 d-pad up  active aero (X-mode) toggle
  //   btn 8 View/Back  camera           btn 9 Menu/Start  pause
  //
  // Standard mapping WHILE A MENU IS OPEN (UiLayers.navOpen() true) — the UWP
  // gamepad/keyboard-parity mapping settled in
  // docs/research/PLATFORM-INPUT-NOTES.md §8, now shipped:
  //   d-pad (12-15) AND left stick   arrow keys (with OS-style hold-repeat,
  //                                  see padNavDir below — the pad has none)
  //   btn 0 A                        Enter/Space: click the focused control
  //   btn 1 B                        Escape: back/close the top layer
  //   btn 6 LT / btn 7 RT            PageUp / PageDown
  //   btn 4 LB / btn 5 RB            page horizontally (ArrowLeft/ArrowRight) —
  //                                  no distinct horizontal-pane concept exists
  //   btn 9 Menu/Start               pause toggle, same as always (KeyP parity)
  // Everything above is a SYNTHETIC KeyboardEvent (or, for a real <dialog>, the
  // `cancel` Event TopModal already listens for) dispatched at `document` —
  // never a second focus-mover. See padDispatchKey/padActivate/padEscape below
  // and their header comment for why B needs its own branch.
  function pollGamepad() {
    if (!padConnected) {
      // Recovery re-probe, ~1 s throttle. gamepadconnected fires only on
      // connection / first input (MDN) — it never re-fires for a pad that is
      // still plugged in, so a transient getGamepads() hole (focus loss, a
      // SECOND pad's unplug, a stale slot) used to kill gamepad input for the
      // rest of the session. Polling is the only recovery path; the throttle
      // keeps getGamepads()'s per-call array allocation off the frame budget.
      if (++_padReprobe < 60) return;
      _padReprobe = 0;
      if (!activePad()) return;
      padConnected = true;   // fall through and read it this frame
    }
    const pad = activePad();
    if (!pad) {
      padConnected = false;
      padSteer = 0; padThrottle = false; padBrake = false;
      padThrottleVal = 0; padBrakeVal = 0;
      if (padPrevButtons.length) padPrevButtons.length = 0;
      padNavDir = null;
      padNavSeeded = false;
      padNavSeedLayer = null;
      return;
    }
    padConnected = true;
    // The indices below are the W3C "standard" layout and nothing here remaps.
    // A pad the browser could not map reports mapping "" and shuffles them —
    // log it once so a "throttle is on LB" report has its cause on record.
    if (!padMapWarned && pad.mapping !== "standard") {
      padMapWarned = true;
      Log.warn("input", "gamepad mapping \"" + pad.mapping + "\" is not \"standard\": button/axis indices may not match");
    }
    let ax = (pad.axes && pad.axes.length) ? pad.axes[0] : 0;
    if (Math.abs(ax) < PAD_DEADZONE) ax = 0;
    else ax = Math.sign(ax) * (Math.abs(ax) - PAD_DEADZONE) / (1 - PAD_DEADZONE);
    if (btnDown(pad, 15)) ax = 1;
    else if (btnDown(pad, 14)) ax = -1;
    padSteer = clamp(ax, -1, 1);
    // pedals: analog triggers or the A/B face buttons.
    padThrottleVal = btnDown(pad, 0) ? 1 : clamp(btnVal(pad, 7), 0, 1);
    padBrakeVal = btnDown(pad, 1) ? 1 : clamp(btnVal(pad, 6), 0, 1);
    padThrottle = padThrottleVal > 0.12;
    padBrake = padBrakeVal > 0.12;
    if (btnEdge(pad, 9) && onPauseCb) onPauseCb();
    // A MENU OPEN MEANS THE PAD DRIVES THE MENU, NOT THE CAR — mirroring
    // menuOverlayOpen() gating the keyboard's own driving keys elsewhere in
    // this file. Only ONE of the two branches below ever fires per poll, so a
    // held LB/RB/trigger can never also queue a gear shift or camera cycle
    // that fires the instant the menu closes (see docs/research note above
    // clearEdges() for the bug class this avoids).
    if (window.UiLayers && window.UiLayers.navOpen()) {
      // ...and the PEDALS go with it. They were latched above this branch, so a
      // pad kept throttling/braking the car through the pause menu (the
      // keyboard's driving keys are gated by menuOverlayOpen(); the pad's were
      // not) — full throttle while picking RESUME in a friend race, where the
      // sim keeps running under the menu. steer() still reads the stick: the
      // menu's own, larger deadzone is what keeps it out of the menu
      // (tests/unit/ui-improve-pass, "resting stick at 0.18").
      padThrottle = padBrake = false;
      padThrottleVal = padBrakeVal = 0;
      padNavPoll(pad);
    } else {
      padNavDir = null;   // fresh hold-timer the next time a menu opens
      padNavSeeded = false;
      padNavSeedLayer = null;
      // edge-triggered actions reuse the same latches the keyboard sets.
      if (btnEdge(pad, 2)) boostTogglePressed = true;
      if (btnEdge(pad, 3)) overtakePressed = true;
      if (btnEdge(pad, 12)) aeroTogglePressed = true;
      if (btnEdge(pad, 5)) shiftUpPressed = true;
      if (btnEdge(pad, 4)) shiftDownPressed = true;
      if (btnEdge(pad, 8)) cameraCyclePressed = true;
    }
    const n = pad.buttons ? pad.buttons.length : 0;
    padPrevButtons.length = n;
    for (let i = 0; i < n; i++) padPrevButtons[i] = btnDown(pad, i);
  }

  // Dispatch a synthetic keydown at `document` (not `window`) — measured: an
  // event dispatched at `window` only reaches WINDOW's own listeners, never
  // document's, because window has no descendants of its own in the event
  // path. MenuNav listens on `window` (capture); TopModal's Escape handler
  // listens on `document` (capture). Dispatching at `document` reaches both,
  // in the same order a real keypress would (window-capture, document-capture,
  // …, document-bubble, window-bubble).
  function padDispatchKey(key) {
    document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  }

  function padNavDirOf(pad) {
    if (btnDown(pad, 12)) return "up";
    if (btnDown(pad, 13)) return "down";
    if (btnDown(pad, 14)) return "left";
    if (btnDown(pad, 15)) return "right";
    const ax = pad.axes || [];
    const stick = (x, y) => {
      const mx = Math.abs(x) >= PAD_NAV_DEADZONE ? Math.abs(x) : 0;
      const my = Math.abs(y) >= PAD_NAV_DEADZONE ? Math.abs(y) : 0;
      if (!mx && !my) return null;
      return my >= mx ? (y < 0 ? "up" : "down") : (x < 0 ? "left" : "right");
    };
    return stick(ax[0] || 0, ax[1] || 0) || stick(ax[2] || 0, ax[3] || 0);
  }

  function padFocusableInLayer() {
    const layer = window.MenuNav && window.MenuNav.activeLayer();
    if (!layer) return null;
    const active = document.activeElement;
    const sel = window.MenuNav.FOCUSABLE;
    if (active && sel && layer.contains(active) && active.matches && active.matches(sel)) {
      return active;
    }
    return null;
  }

  // One ArrowDown into MenuNav — the same empty path padActivate used to inline.
  // MenuNav has no seed helper of its own (it exports activeLayer / FOCUSABLE
  // only), so this is the one mover; never .focus() a node from here.
  function padSeedFocus() {
    if (!window.MenuNav || !window.MenuNav.activeLayer()) return;
    if (padFocusableInLayer()) return;
    padDispatchKey("ArrowDown");
  }

  // A → activate. Synthetic events do NOT get a browser's native "Enter/Space
  // clicks the focused button" behaviour (isTrusted:false skips that default
  // action, same as the Escape case below) — so .click() the focused control
  // ourselves, mirroring MenuNav's own idea of "focusable" (MenuNav.FOCUSABLE).
  // If nothing is focused inside the active layer yet (pad used before any
  // direction press), there is nothing to click — seed focus instead, the same
  // way MenuNav's own first arrow press would, so the NEXT press has a target.
  // "One focus visual should always be visible" (research note §8) applies to
  // A as much as to a direction — and to the menu-open seed in padNavPoll.
  function padActivate() {
    const focused = padFocusableInLayer();
    if (focused) {
      // A click on a focused range/number jumps the thumb to the click
      // coordinate — not "confirm this control". Left/Right already own it.
      const ty = (focused.type || "").toLowerCase();
      if (focused.tagName === "INPUT" && (ty === "range" || ty === "number")) return;
      focused.click();
      return;
    }
    padSeedFocus();
  }

  // B → Escape/Back. Gated on UiLayers.top() (not MenuNav.activeLayer(), which
  // deliberately excludes the photo-mode free camera) because a real Escape
  // key reaches the free camera too — it steps out of the fly-cam before
  // closing the tuner panel behind it.
  //
  // A real <dialog>'s "Escape closes it" is UA DEFAULT-ACTION behaviour tied to
  // a TRUSTED key event — Chromium's CloseWatcher takes the key's release, and
  // WebKit's older path takes the keydown's default action (see
  // docs/research/PLATFORM-INPUT-NOTES.md §1) — and neither fires for a
  // synthetic, untrusted KeyboardEvent (verified empirically: a dispatched
  // Escape keydown left an open <dialog> open). TopModal already wires a real
  // `cancel` listener on every dialog.screen that does exactly what a real
  // Escape does (presses the screen's own data-esc-close button) — so for a
  // <dialog> layer, meet THAT seam directly. The handful of screens that never
  // became <dialog>s (TopModal's own comment names them) go through
  // TopModal.onEscape, an ordinary document keydown listener with no such
  // trust requirement, so a synthetic keydown reaches it exactly like a real
  // Escape would.
  function padEscape() {
    const layer = window.UiLayers && window.UiLayers.top();
    if (!layer) return;
    if (layer.tagName === "DIALOG") {
      layer.dispatchEvent(new Event("cancel", { cancelable: true }));
    } else {
      padDispatchKey("Escape");
    }
  }

  function padNavPoll(pad) {
    const top = window.UiLayers && window.UiLayers.top();
    if (top !== padNavSeedLayer) {
      padNavSeedLayer = top || null;
      padNavSeeded = false;
    }
    const dir = padNavDirOf(pad);
    if (!padNavSeeded) {
      padNavSeeded = true;
      if (!dir && !btnEdge(pad, 0)) padSeedFocus();
    }
    if (dir) {
      const now = nowMs();
      if (dir !== padNavDir) {
        padNavDir = dir;
        padDispatchKey(PAD_NAV_KEYS[dir]);
        padNavNextT = now + PAD_NAV_DELAY_MS;
      } else if (now >= padNavNextT) {
        padDispatchKey(PAD_NAV_KEYS[dir]);
        padNavNextT = now + PAD_NAV_REPEAT_MS;
      }
    } else {
      padNavDir = null;   // released the instant input returns to neutral
    }
    if (btnEdge(pad, 6)) padDispatchKey("PageUp");
    if (btnEdge(pad, 7)) padDispatchKey("PageDown");
    if (btnEdge(pad, 4)) padDispatchKey("ArrowLeft");
    if (btnEdge(pad, 5)) padDispatchKey("ArrowRight");
    if (btnEdge(pad, 0)) padActivate();
    if (btnEdge(pad, 1)) padEscape();
  }

  // A connected pad only "wins" steering when its stick is actually deflected,
  // so an idle controller never overrides tilt / touch / on-screen buttons.
  function padSteerActive() {
    return padConnected && Math.abs(padSteer) > 0.001;
  }

  // Best-effort rumble on the active pad (dual-rumble or generic actuator).
  // Silently no-ops where unsupported (e.g. most iOS controllers) — callers
  // already fire navigator.vibrate alongside, so haptics degrade gracefully.
  function rumble(intensity, ms) {
    if (!padConnected) return;
    const pad = activePad();
    if (!pad) return;
    const a = pad.vibrationActuator;
    if (!a || typeof a.playEffect !== "function") return;
    const mag = clamp(intensity, 0, 1);
    try {
      a.playEffect("dual-rumble", {
        duration: Math.max(0, ms | 0),
        strongMagnitude: mag,
        weakMagnitude: mag * 0.7,
      });
    } catch (e) { /* actuator busy or unsupported effect type */ }
  }

  function steer() {
    const k = keyboardSteer();
    if (keyLeft || keyRight || Math.abs(k) > 0.001) return k;
    if (padSteerActive()) return padSteer;
    if (steerMode === "buttons") return buttonSteering();
    if (tiltActive()) return tiltSteering();
    return touchSteering();
  }

  function throttle() {
    return keyThrottle || btnThrottle || padThrottle;
  }

  function braking() {
    return keyBrake || btnBrake || padBrake;
  }

  // 0..1 pedal travel. A KEY is digital and is therefore always full travel; an
  // analog trigger and an on-screen pedal both report how far they actually are.
  // Priority matches throttle()/braking(): whichever source is pressed wins, and
  // the keyboard wins over everything so a desktop player is never modulated by
  // a stray pad axis.
  function throttleLevel() {
    if (keyThrottle) return 1;
    if (btnThrottle) return btnThrottleVal;
    return padThrottleVal > 0.12 ? padThrottleVal : 0;
  }
  function brakeLevel() {
    if (keyBrake) return 1;
    if (btnBrake) return btnBrakeVal;
    return padBrakeVal > 0.12 ? padBrakeVal : 0;
  }

  function consumeBoostToggle() {
    const v = boostTogglePressed;
    boostTogglePressed = false;
    return v;
  }

  function consumeOvertake() {
    const v = overtakePressed;
    overtakePressed = false;
    return v;
  }

  function consumeAeroToggle() {
    const v = aeroTogglePressed;
    aeroTogglePressed = false;
    return v;
  }

  function consumeShiftUp() {
    const v = shiftUpPressed;
    shiftUpPressed = false;
    return v;
  }

  function consumeShiftDown() {
    const v = shiftDownPressed;
    shiftDownPressed = false;
    return v;
  }

  function consumeCameraCycle() {
    const v = cameraCyclePressed;
    cameraCyclePressed = false;
    return v;
  }

  function setSteerMode(m) {
    steerMode = (m === "buttons" || m === "touch") ? m : "tilt";
    try { Log.info("input", "steerMode " + steerMode); } catch (_) { /* Log absent in isolated VM */ }
    if (steerMode !== "buttons") {
      btnSteerLeft = btnSteerRight = false;   // drop held buttons
      btnSteerLeftVal = btnSteerRightVal = 0;
      btnSteerVal = 0; btnSteerT = 0;
    }
    if (steerMode !== "touch") {
      touches.clear();
      touchSteer = 0; touchActive = false; touchSteerVal = 0; touchSteerT = 0;
    }
    if (steerMode !== "tilt") detachGyro();
  }

  function setAdaptiveButtons(v) {
    if (typeof v === "boolean") { adaptiveMix = v ? 1 : 0; return; }
    if (typeof v === "number" && isFinite(v)) adaptiveMix = clamp(v, 0, 1);
  }
  function setSteerSpeedRef(ref) {
    if (typeof ref === "number" && isFinite(ref) && ref > 1) steerSpeedRef = ref;
  }
  function setSpeedStd(v) {
    if (v == null) { speedStdOverride = null; return; }
    if (typeof v === "number" && isFinite(v)) speedStdOverride = Math.max(0, v);
  }
  function setSpeedProvider(fn) { speedProvider = typeof fn === "function" ? fn : null; }

  // DEADZONE < MAX_TILT is an invariant of the steer formula d/(MAX_TILT-DEADZONE),
  // and setTiltDeadzone enforced it only at ITS call: setTiltSensitivity could
  // then lower MAX_TILT beneath a deadzone already set (deadzone 12, then
  // maxTilt 8 -> divisor -4) and every tilt past the deadzone steered the WRONG
  // WAY at full lock. Both setters go through one clamp.
  function clampDeadzone() { DEADZONE = Math.max(0, Math.min(Math.min(15, MAX_TILT - 1), DEADZONE)); }
  function setTiltSensitivity(deg) {
    if (typeof deg === "number" && isFinite(deg)) { MAX_TILT = Math.max(8, Math.min(60, deg)); clampDeadzone(); }
  }
  function setTiltSmoothing(cutoff) {
    if (typeof cutoff === "number" && isFinite(cutoff)) OE_MIN_CUTOFF = Math.max(0.3, Math.min(4, cutoff));
  }
  function setTiltDeadzone(deg) {
    // Clamp DEADZONE strictly below MAX_TILT so the steering formula d/(MAX_TILT-DEADZONE) never divides by zero or inverts.
    if (typeof deg === "number" && isFinite(deg)) { DEADZONE = deg; clampDeadzone(); }
  }

  let _coarseMql = null;
  const _coarseCbs = [];
  function touchControlsNeeded() {
    if (_coarseMql === null && typeof window !== "undefined" && window.matchMedia) {
      try { _coarseMql = window.matchMedia("(pointer: coarse)"); } catch (_) { _coarseMql = false; }
      if (_coarseMql && _coarseMql.addEventListener) {
        _coarseMql.addEventListener("change", () => {
          for (const cb of _coarseCbs) { try { cb(touchControlsNeeded()); } catch (_) {} }
        });
      }
    }
    return !!(_coarseMql && _coarseMql.matches);
  }
  /* THE ANSWER CHANGES WHILE THE GAME IS RUNNING, and until now only half the
     app heard about it. The query above stays live, so autoThrottle/manualGears
     were always right — but `body.desktop` was computed ONCE at boot
     (js/game.js), and every CSS rule that gives the driving dock its tap targets
     and its `pointer-events: auto` hangs off `body:not(.desktop)`. Undock an
     iPad from its Magic Keyboard mid-session and the pointer goes coarse: the
     GAS/BRAKE/BOOST buttons duly appear, inherit `pointer-events: none` from
     #hud-dock, and do nothing — with #pm-steer and #pm-calib still hidden by
     css/responsive.css, so there is no route back either. Subscribe instead. */
  function onPointerKindChange(cb) {
    touchControlsNeeded();            // make sure the MQL (and its listener) exists
    if (typeof cb === "function" && !_coarseCbs.includes(cb)) _coarseCbs.push(cb);
    return () => {
      const idx = _coarseCbs.indexOf(cb);
      if (idx >= 0) _coarseCbs.splice(idx, 1);
    };
  }

  function onScreenRotate() {
    setTimeout(calibrate, 300);
  }

  function init(canvas, opts) {
    Log.info("input", "Input.init");
    onPauseCb = (opts && opts.onPause) || null;

    window.addEventListener("keydown", function (e) { onKey(e, true); });
    window.addEventListener("keyup", function (e) { onKey(e, false); });
    window.addEventListener("blur", reset);
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) reset();
    });
    // Safety net for the hold buttons (see holdBtns): any pointer that lifts or
    // cancels ANYWHERE on the page stops holding every button, even when the
    // button element itself never receives the event. Capture phase, so an
    // overlay or stopPropagation between here and the button can't swallow it.
    window.addEventListener("pointerup", function (e) { holdReleasePointer(e.pointerId); }, true);
    window.addEventListener("pointercancel", function (e) { holdReleasePointer(e.pointerId); }, true);
    document.addEventListener("lostpointercapture", function (e) {
      if (e.target && e.target !== document && !lostCaptureShouldRelease(e.target, e.pointerId)) return;
      holdReleasePointer(e.pointerId);
    }, true);
    // Net #4, and the only one that is not built on pointer events: WebKit
    // under heavy multi-touch can leave a pointer with no pointerup and no
    // pointercancel (w3c/pointerevents#407 tracks that as a real, unfixed
    // cross-engine class) while still delivering the touch-event lift. A ghost
    // id then sits in a hold set indefinitely. The comment here used to assert
    // "iOS never reuses pointerIds, so the ghost is PERMANENT" — UNSOURCED, and
    // PE3 only requires uniqueness among ACTIVE pointers, so an id may well be
    // recycled later. The fix does not depend on it either way; only the
    // severity did, and an unsourced platform absolute in a comment is how the
    // next person gets misled. Worse,
    // a fresh press+release cannot clear it: the new id is added and removed
    // while the ghost keeps the set non-empty, so apply(false) never runs —
    // the exact "throttle stays on no matter what I press" shape a player
    // reported after an off-track rescue in buttons mode (a moment of frantic
    // multi-touch plus a camera snap). TouchEvent.touches is ground truth the
    // pointer stream cannot contradict: zero touches on the glass means
    // nothing is held, whatever the pointer bookkeeping believes. A finger
    // still down keeps touches.length > 0, so a legitimate hold survives.
    window.addEventListener("touchend", function (e) {
      if (e.touches.length === 0) holdReleaseAll();
    }, true);
    window.addEventListener("touchcancel", function (e) {
      if (e.touches.length === 0) holdReleaseAll();
    }, true);

    canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    canvas.addEventListener("touchend", onTouchEnd, { passive: false });
    canvas.addEventListener("touchcancel", onTouchEnd, { passive: false });

    wireHold("btn-throttle", function (v) { btnThrottle = v; }, function (l) { btnThrottleVal = l; });
    wireHold("btn-brake", function (v) { btnBrake = v; }, function (l) { btnBrakeVal = l; });
    wireTap("btn-boost", function () { boostTogglePressed = true; });
    wireTap("btn-ot", function () { overtakePressed = true; });
    wireTap("btn-aero", function () { aeroTogglePressed = true; });
    wireTap("shift-up", function () { shiftUpPressed = true; });
    wireTap("shift-down", function () { shiftDownPressed = true; });
    wireHold("btn-steer-left", function (v) { btnSteerLeft = v; if (!v) btnSteerLeftVal = 0; },
      function (l) { btnSteerLeftVal = l; }, { axis: "x", dir: -1 });
    wireHold("btn-steer-right", function (v) { btnSteerRight = v; if (!v) btnSteerRightVal = 0; },
      function (l) { btnSteerRightVal = l; }, { axis: "x", dir: 1 });

    // LIVE INPUT-SOURCE READOUT, for a bug that only reproduces on a real
    // phone: a player reported the throttle behaving always-on after an
    // off-track rescue in BUTTONS mode, and four instrumented emulation runs
    // could not reproduce it — every latch net held. debugState() names which
    // source (key/btn/pad) is asserting throttle at any moment, but a phone
    // has no console, so this puts that answer ON SCREEN. Opt-in only:
    // ?inputdebug=1 in the URL, or localStorage apex26.inputDebug = "1".
    try {
      const want = /[?&]inputdebug=1/.test(location.search) ||
        localStorage.getItem("apex26.inputDebug") === "1";
      if (want) {
        const d = document.createElement("div");
        d.id = "input-debug";
        d.style.cssText = "position:fixed;left:8px;bottom:8px;z-index:9998;" +
          "background:rgba(0,0,0,.65);color:#9f9;padding:4px 8px;border-radius:6px;" +
          "font:11px/1.4 ui-monospace,Menlo,Consolas,monospace;pointer-events:none;" +
          "white-space:pre";
        document.body.appendChild(d);
        setInterval(function () {
          const s = debugState();
          d.textContent =
            "THR " + (s.throttle ? "ON " : "off") +
            "  key:" + +s.key.throttle + " btn:" + +s.btn.throttle + " pad:" + +s.pad.throttle +
            "\nBRK " + (s.braking ? "ON " : "off") +
            "  key:" + +s.key.brake + " btn:" + +s.btn.brake + " pad:" + +s.pad.brake +
            "\nheld ptrs [" + s.holdPointers.join(",") + "]" +
            "\nmode:" + s.steerMode +
            "  auto:" + ((touchControlsNeeded() && s.steerMode === "touch") ? "ON" : "off");
        }, 250);
      }
    } catch (_) {}

    if (typeof screen !== "undefined" && screen.orientation &&
        typeof screen.orientation.addEventListener === "function") {
      screen.orientation.addEventListener("change", onScreenRotate);
    } else {
      window.addEventListener("orientationchange", onScreenRotate);
    }

    window.addEventListener("gamepadconnected", function (e) {
      padConnected = true;
      try { Log.info("input", "gamepad connected " + padLogId(e)); }
      catch (_) { /* Log absent */ }
    });
    window.addEventListener("gamepaddisconnected", function (e) {
      // Another pad (a wheel + a controller, a hub re-enumerating) may still be
      // there: read the live list instead of assuming the last one just left.
      let still = false;
      try { const gps = navigator.getGamepads ? navigator.getGamepads() : []; for (let i = 0; i < gps.length; i++) if (gps[i] && gps[i].index !== (e.gamepad && e.gamepad.index)) still = true; } catch (_) { /* no API */ }
      padConnected = still; padSteer = 0; padThrottle = padBrake = false;
      padThrottleVal = padBrakeVal = 0;
      padPrevButtons.length = 0;
      padNavDir = null;
      padNavSeeded = false;
      padNavSeedLayer = null;
      try { Log.info("input", "gamepad disconnected " + padLogId(e)); }
      catch (_) { /* Log absent */ }
    });
  }

  function reset() {
    touches.clear();
    touchSteer = 0; touchActive = false; touchSteerVal = 0; touchSteerT = 0;
    timeScale = 1;   // the loop re-reports it next frame; never leave it stalled slow
    // Clear the hold buttons THROUGH their closures (ghost-pointer purge), not
    // just the exported booleans — see holdBtns for why both must happen.
    holdReleaseAll();
    btnThrottle = btnBrake = false;
    btnThrottleVal = btnBrakeVal = 0;
    btnSteerLeft = btnSteerRight = false;
    btnSteerLeftVal = btnSteerRightVal = 0;
    btnSteerVal = 0; btnSteerT = 0;
    speedStdOverride = null;
    keyLeft = keyRight = keyBrake = keyThrottle = false;
    keySteerVal = 0;
    keySteerT = 0;
    tiltSteerVal = 0;
    tiltSteerT = 0;
    oeInit = false; oePrev = 0; oeDPrev = 0;
    overtakePressed = false;
    boostTogglePressed = false;
    aeroTogglePressed = false;
    shiftUpPressed = false;
    shiftDownPressed = false;
    cameraCyclePressed = false;
    padSteer = 0;
    padThrottle = false;
    padBrake = false;
    padThrottleVal = 0;
    padBrakeVal = 0;
    // padPrevButtons is deliberately KEPT: emptying it on a window blur made
    // every button merely held across the blur a rising edge on the next poll
    // (boost toggled, a gear grabbed, the camera cycled). The next poll
    // re-seeds it from the pad as it always has.
    padNavDir = null;
    padNavSeeded = false;
    padNavSeedLayer = null;
  }

  /* THE EDGE LATCHES NEED EMPTYING WHILE NOBODY IS READING THEM.
     poll() runs BEFORE the paused gate in the game loop, deliberately, so the
     pad's Start button can un-pause — but every other edge it records
     (boost/overtake/aero/shift/camera) is written with nothing on the other end
     to consume it. Mash a pad in the pause menu or the standings and the whole
     handful fires at once on the first frame after RESUME: boost spent, a gear
     grabbed, the camera somewhere else. Clearing is right rather than
     not-recording, because the pad is polled, not evented — skipping the read
     would also skip the edge bookkeeping and turn a button HELD across the
     pause into a fresh press on resume. */
  function clearEdges() {
    overtakePressed = false;
    boostTogglePressed = false;
    aeroTogglePressed = false;
    shiftUpPressed = false;
    shiftDownPressed = false;
    cameraCyclePressed = false;
  }

  function debugState() {
    return {
      steerMode,
      key: { left: keyLeft, right: keyRight, throttle: keyThrottle, brake: keyBrake },
      btn: { throttle: btnThrottle, brake: btnBrake, left: btnSteerLeft, right: btnSteerRight,
             throttleVal: btnThrottleVal, brakeVal: btnBrakeVal, steerVal: btnSteerVal,
             leftVal: btnSteerLeftVal, rightVal: btnSteerRightVal },
      adaptiveButtons: adaptiveMix,
      adaptiveMix,
      speedStd: currentSpeedStd(),
      steerSpeedRef,
      rateIn: digitalRateIn(),
      pad: { connected: padConnected, steer: padSteer, throttle: padThrottle, brake: padBrake },
      touchSteer,
      touchActive,
      touchRangePx: touchRangePx(),
      canvasTouches: touches.size,
      holdPointers: holdBtns.map((h) => h.ids.size),   // pressed-pointer count per hold button
      throttle: throttle(),
      braking: braking(),
      throttleLevel: throttleLevel(),
      brakeLevel: brakeLevel(),
    };
  }

  return {
    init,
    reset,
    debugState,
    poll: pollGamepad,
    rumble,
    requestGyro,
    calibrate,
    steer,
    throttle,
    braking,
    throttleLevel,
    brakeLevel,
    consumeBoostToggle,
    consumeOvertake,
    consumeAeroToggle,
    consumeShiftUp,
    consumeShiftDown,
    consumeCameraCycle,
    tiltActive,
    simTilt,
    simTiltReset,
    steerToTilt,
    setSteerMode,
    setAdaptiveButtons,
    setSteerSpeedRef,
    setSpeedStd,
    setSpeedProvider,
    setTimeScale,
    setTiltSensitivity,
    setTiltSmoothing,
    setTiltDeadzone,
    touchControlsNeeded,
    onPointerKindChange,
    clearEdges,
    get padConnected() { return padConnected; },
    get gyroSeen() { return tiltSeen; },
    get gyroDenied() { return gyroDenied; },
    get gyroHardDenied() { return gyroHardDenied; },
    // Exported for js/game/photomode.js, whose hold buttons capture the pointer
    // the same way and need the same "was the button taken away?" test.
    holdTargetGone,
    // Read-only tilt-tuning state (for tests / diagnostics).
    get maxTilt() { return MAX_TILT; },
    get deadzone() { return DEADZONE; },
    get tiltSlew() { return TILT_SLEW; },
    get minCutoff() { return OE_MIN_CUTOFF; },
  };
})();
