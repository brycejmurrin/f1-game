/* Input: keyboard / gamepad / tilt / touch for Apex 26. Steering sources, by priority (see steer()): keyboard (held or still returning to center) > gamepad (a con… */
"use strict";

const Input = (function () {
  // Tilt mechanics ported verbatim from the driving-game (Neon Drift) build.
  let MAX_TILT = 36;          // degrees of tilt for full steering lock (higher = less sensitive)
  let DEADZONE = 2.5;         // degrees ignored around neutral — fixed small; not a player knob
  const TILT_SLEW = 8;        // fixed safety cap (steer units/s): a last guard so a hand jolt
  // 4, not 6, and the 6 was not wrong when it was written — it became wrong when
  // the ramp moved into SHAPED space (see digitalStep). At 6 raw-units/s the old
  // curve crossed 50 % of road-wheel angle at 125 ms; a LINEAR ramp at 6 crosses
  // it at 83 ms, so simply removing the lurch would have handed the player a
  // QUICKER car than before, which is the opposite of the report ("too snappy
  // and lightweight on the on-screen buttons"). 4.01/s reproduces that 125 ms
  // midpoint exactly, so the mid-corner timing a player already has in their
  // hands is preserved and only the lurch goes. Full lock now takes 250 ms
  // rather than 167 — a thumb cannot feather a hold, so the weight has to come
  // from the rate.
  let KEY_RAMP_IN = 4;        // steer units/s toward full lock (ROAD-WHEEL units)
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
  let recoverPressed = false;   // edge-triggered manual recover / put-me-back
  let keyLookBack = false;      // HELD: look-back mirror while the key/button is down
  let padLookBack = false;

  // gamepad (W3C Gamepad API, "standard" mapping). Polled once per display
  // frame from poll(). Works on desktop browsers and iOS 14.5+ Safari with a
  // paired PS5 / Xbox / MFi controller — no secure-context or permission gate,
  // so it runs anywhere the game is served (GitHub Pages included).
  let padConnected = false;
  let _padReprobe = 0;      // frames since last disconnected-state re-probe
  let padPollWarned = false;
  let padMapWarned = false;
  let padSteer = 0;            // -1..1 from left stick / d-pad
  let padSteerAnalog = false;  // is padSteer a stick DEFLECTION (curve/speed-scale it) or the ramped d-pad?
  // THROTTLE LATCH (tap on, tap off). XAG 107's Duration guidance names our exact
  // case — holding accelerate for a whole race is a fatigue barrier — and lists
  // toggles as the fix, between HOLD and full AUTO. `throttleLatch` is the mode,
  // `throttleLatched` the state it keeps.
  let throttleLatch = false, throttleLatched = false;
  let padThrottle = false;
  let padBrake = false;
  let padThrottleVal = 0;
  let padBrakeVal = 0;
  let padPrevButtons = [];     // previous frame's pressed state, for rising edges
  let padDpadVal = 0;          // ramped d-pad steer, -1..1 (see padDpadSteer)
  let padDpadT = 0;            // last d-pad ramp timestamp, ms
  /* THE DRIVING DEAD ZONE IS A PLAYER KNOB WITH A SMALL DEFAULT, and the two
     halves of that sentence are both corrections.
     It was a fixed 0.14, which is between 3x and 7x what racing games ship:
     F1's own calibration defaults every axis to 0, ACC recommends 2-4 %, Forza
     5, and Rocket League's 0.30 default is the one its own players call a bad
     default. XInput's suggested 0.2395 is the outlier nobody uses for driving.
     Fourteen per cent of stick travel is exactly the small-correction band an
     F1 car lives in, and we were discarding it before the physics ever saw it.
     The other half: a fixed dead zone is the WRONG SHAPE of answer to stick
     drift. Nearly every pad shipped in the last decade uses a resistive
     potentiometer whose wiper grooves its track (Nintendo confirmed Switch 2
     Joy-Cons are still not Hall effect), so drift is wear, not a defect class
     — and one large constant punishes good hardware to accommodate worn
     hardware. The shape that works is a SMALL dead zone, a rest-offset
     captured per pad (calibratePad), and a SATURATION so a stick that can no
     longer reach 1.0 can still reach full lock. */
  let padDeadzone = 0.05;      // inner: centre slop, ignored then re-scaled
  let padSaturation = 0;       // outer: deflection treated as full lock
  let padRestOffset = 0;       // captured resting position (drift compensation)
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
  // BUTTONS, not tilt, so this module's pre-boot value matches the shipped
  // default (js/game.js reads store "steerMode" defaulting to "buttons" and
  // pushes it here at boot). They disagreed, harmlessly — game.js always wins
  // before a player sees anything — but the disagreement made the file read as
  // though we default to a motion control, which WCAG 2.2 SC 2.5.4 would fail:
  // motion-operated functionality must also be operable by UI components. We
  // pass, and now the code says so without needing game.js to prove it.
  let steerMode = "buttons";
  let tiltSmoothed = 0;       // One-Euro-filtered tilt angle (deg)
  let lastOrientMs = 0;
  let OE_MIN_CUTOFF = 1.2;    // Hz — THE smoothing knob (set by the SMOOTHING slider)
  let OE_BETA = 0.10;
  const OE_DCUTOFF = 1.0;     // Hz, cutoff for the derivative estimate
  let oePrev = 0, oeDPrev = 0, oeInit = false;
  let tiltSteerVal = 0;       // last steer command emitted (-1..1)
  let tiltSteerT = 0;         // timestamp of the last tiltSteering() call (ms)

  let onPauseCb = null;
  let onPadLostCb = null;      // fired when the LAST pad disconnects (game.js pauses)

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

  const clamp = M4.clamp;                     // shared scalar helper (js/core/mat4.js)

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
  /* One ramp step for a DIGITAL source (arrows, on-screen buttons).
   *
   * UNWINDING IS NOT THE SAME ACT AS BUILDING LOCK, and the old step did not
   * know that: `moveToward(val, target, (target !== 0 ? rateIn : RAMP_OUT))`
   * used the BUILD rate for any non-zero target, so pressing the OPPOSITE arrow
   * crossed back through centre at the build rate rather than the release rate.
   * Measured at 41.7 m/s with ADAPTIVE BUTTONS on (rateIn 3/s vs RAMP_OUT 8/s):
   * full lock to centre took 0.33 s by pressing the other way and 0.125 s by
   * simply letting go — so the fastest way through a chicane was release, wait,
   * press, which is not a technique anyone should have to find. It is worse
   * exactly where it matters most, because the assist slows the build rate with
   * speed and never touched the release rate.
   *
   * Unwind at the release rate, build at the build rate, switch at centre. A
   * frame at 60 Hz can contain both halves, so the leftover time is spent at
   * the build rate rather than thrown away — otherwise the step quietly caps a
   * direction change at one rate per frame.
   */
  function digitalStep(val, target, dt) {
    // Work in shaped (road-wheel) space, return raw so game.js's expo undoes it.
    const v = toShaped(val), t = target;   // target is -1 / 0 / +1; shaping is identity there
    if (t === 0) return fromShaped(moveToward(v, 0, KEY_RAMP_OUT * dt));
    if (v * t < 0) {
      const toCentre = Math.abs(v);
      const unwind = KEY_RAMP_OUT * dt;
      if (unwind < toCentre) return fromShaped(moveToward(v, 0, unwind));
      const spare = (unwind - toCentre) / KEY_RAMP_OUT;   // seconds still unspent
      return fromShaped(moveToward(0, t, digitalRateIn() * spare));
    }
    return fromShaped(moveToward(v, t, digitalRateIn() * dt));
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
    keySteerVal = digitalStep(keySteerVal, target, dt);
    return keySteerVal;
  }

  // A menu overlay being open is what hands the arrow keys to js/ui/menu-nav.js:
  // while the pause menu, the select screen or any sheet is up, Up/Down/Left/Right
  // move through the menu and must not also be steering and braking the car
  // underneath it. Asked per key event, never per tick — keys are rare and the
  // set of open overlays changes without notice.
  // THE LIST LIVES IN js/ui/layers.js.
  function menuOverlayOpen() {
    return !!(window.UiLayers && window.UiLayers.anyOpen());
  }

  // ---- key bindings ------------------------------------------------------
  // Every driving key is a BINDING, not a literal: KEY_ACTIONS is the list the
  // CONTROLS page (js/ui/key-binds.js) renders and HOW TO PLAY reads, keyMap is
  // the live table (two physical-key slots per action, e.code values so WASD
  // sits under the same fingers on an AZERTY board), and codeToAction is the
  // reverse index onKey() consults. Defaults are what the game always had.
  const KEY_ACTIONS = [
    { id: "left",      label: "STEER LEFT",  def: ["ArrowLeft", "KeyA"] },
    { id: "right",     label: "STEER RIGHT", def: ["ArrowRight", "KeyD"] },
    { id: "throttle",  label: "GAS",         def: ["ArrowUp", "KeyW"] },
    { id: "brake",     label: "BRAKE",       def: ["ArrowDown", "KeyS"] },
    { id: "boost",     label: "BOOST",       def: ["Space", null] },
    { id: "overtake",  label: "OVERTAKE",    def: ["KeyX", null] },
    { id: "aero",      label: "ACTIVE AERO", def: ["KeyZ", null] },
    { id: "shiftUp",   label: "SHIFT UP",    def: ["KeyE", null] },
    { id: "shiftDown", label: "SHIFT DOWN",  def: ["KeyQ", "ShiftLeft"] },
    { id: "camera",    label: "CAMERA",      def: ["KeyC", null] },
    // LOOK BACK is a HELD control (the mirror is only useful while you hold
    // it); RECOVER is an edge. Both are standard racing binds we simply did
    // not have: Forza Horizon puts look-back on the arrow cluster, F1 on End,
    // iRacing on Z/X, and R is the near-universal recover/reset key across
    // Forza, PolyTrack and Slow Roads alike. In a game about defending a
    // position, not being able to look back is functional, not cosmetic.
    { id: "lookBack",  label: "LOOK BACK",   def: ["KeyB", null] },
    { id: "recover",   label: "RECOVER",     def: ["KeyR", null] },
    /* PAUSE IS A BINDING NOW, not a literal. XAG 107 asks that a player be
       able to remap ALL of a game's controls "including the Esc key on PC
       games", and P being permanently off-limits meant a player who wanted
       pause under a different finger had no path at all — which bites hardest
       in fullscreen on Firefox and Safari, where Escape is spent exiting
       fullscreen before it can ever reach us (see lockEscape). Escape itself
       stays hardwired as BACK: it is the platform's gesture, not ours to
       hand out. */
    { id: "pause",     label: "PAUSE",       def: ["KeyP", null] },
  ];
  // Keys the game already answers to elsewhere: back, the menu walker's
  // confirm, the perf overlay, the OS. Refused by setKeyBinding.
  const KEY_RESERVED = { Escape: 1, Enter: 1, NumpadEnter: 1, Tab: 1, Backquote: 1, F9: 1, MetaLeft: 1, MetaRight: 1, ContextMenu: 1 };
  const keyMap = {};
  let codeToAction = {};
  // Either Shift / Ctrl / Alt counts as the one key: the default SHIFT DOWN was
  // "Q or either Shift" and a rebind should not have to choose a side.
  const normCode = (c) => c === "ShiftRight" ? "ShiftLeft" : c === "ControlRight" ? "ControlLeft" : c === "AltRight" ? "AltLeft" : c;
  function rebuildKeyIndex() {
    codeToAction = {};
    for (const a of KEY_ACTIONS) for (const c of keyMap[a.id]) if (c && !codeToAction[c]) codeToAction[c] = a.id;
    keyLeft = keyRight = keyThrottle = keyBrake = false;   // never latch a key that just changed meaning
  }
  function resetKeys() { for (const a of KEY_ACTIONS) keyMap[a.id] = a.def.slice(); rebuildKeyIndex(); }
  resetKeys();
  // Adopt a saved map ({action: [code, code]}); anything malformed, reserved or
  // duplicated falls back to the default for that action.
  function setKeyMap(saved) {
    resetKeys();
    if (saved && typeof saved === "object") {
      const seen = {};
      for (const a of KEY_ACTIONS) {
        const v = Array.isArray(saved[a.id]) ? saved[a.id] : null;
        if (!v) continue;
        const slots = [0, 1].map((i) => {
          const c = v[i] == null ? null : normCode(String(v[i]));
          if (!c || !/^[A-Za-z0-9]{1,24}$/.test(c) || KEY_RESERVED[c] || seen[c]) return null;
          seen[c] = 1;
          return c;
        });
        keyMap[a.id] = slots;
      }
      rebuildKeyIndex();
    }
    return getKeyMap();
  }
  function getKeyMap() { const o = {}; for (const a of KEY_ACTIONS) o[a.id] = keyMap[a.id].slice(); return o; }
  function keyBindings() { return KEY_ACTIONS.map((a) => ({ id: a.id, label: a.label, codes: keyMap[a.id].slice(), def: a.def.slice() })); }
  function keysAreDefault() { return KEY_ACTIONS.every((a) => a.def[0] === keyMap[a.id][0] && a.def[1] === keyMap[a.id][1]); }
  // Bind `code` into slot 0/1 of an action. A key another action held is taken
  // from it (the caller shows the move); a reserved key is refused.
  function setKeyBinding(id, slot, code) {
    if (!keyMap[id] || !(slot === 0 || slot === 1) || !code) return { ok: false, reason: "invalid" };
    code = normCode(String(code));
    if (KEY_RESERVED[code]) return { ok: false, reason: "reserved" };
    let conflict = null;
    for (const a of KEY_ACTIONS) for (let i = 0; i < 2; i++) {
      if (keyMap[a.id][i] === code && !(a.id === id && i === slot)) { keyMap[a.id][i] = null; if (a.id !== id) conflict = a.id; }
    }
    keyMap[id][slot] = code;
    rebuildKeyIndex();
    return { ok: true, conflict };
  }
  function clearKeyBinding(id, slot) {
    if (!keyMap[id] || !(slot === 0 || slot === 1)) return false;
    keyMap[id][slot] = null; rebuildKeyIndex(); return true;
  }
  const KEY_NAMES = { ArrowUp: "\u2191", ArrowDown: "\u2193", ArrowLeft: "\u2190", ArrowRight: "\u2192", Space: "SPACE",
    ShiftLeft: "SHIFT", ControlLeft: "CTRL", AltLeft: "ALT", Comma: ",", Period: ".", Slash: "/", Semicolon: ";",
    Quote: "'", BracketLeft: "[", BracketRight: "]", Backslash: "\\", Minus: "-", Equal: "=", Backspace: "BKSP",
    CapsLock: "CAPS", Insert: "INS", Delete: "DEL", Home: "HOME", End: "END", PageUp: "PGUP", PageDown: "PGDN", IntlBackslash: "\\" };
  /* WHAT IS PRINTED ON THE PLAYER'S KEY, not what the code is called.
     Binding on e.code is right and stays — it is what keeps WASD under the
     same three fingers on AZERTY, and MDN recommends exactly that for games.
     But it made the LABEL a lie: "KeyW" is the physical slot a French keyboard
     prints Z on, and the rebinding screen confidently showed "W". A player
     rebinding was reading a key that is not on their keyboard.
     navigator.keyboard.getLayoutMap() is the API for the other direction.
     Chromium-only and experimental, so it is a progressive enhancement:
     resolved once at init, consulted only for the alphanumeric codes whose
     label actually moves between layouts, and absent everywhere else — where
     the old behaviour is exactly what remains. */
  let kbLayout = null;
  function loadLayoutMap() {
    const kb = typeof navigator !== "undefined" && navigator.keyboard;
    if (!kb || typeof kb.getLayoutMap !== "function") return;
    try {
      Promise.resolve(kb.getLayoutMap()).then((m) => {
        kbLayout = m || null;
        if (kbLayout) { try { Log.info("input", "keyboard layout map available"); } catch (_) { /* Log absent */ } }
      }).catch(() => { /* SecurityError under Permissions Policy, or unsupported */ });
    } catch (_) { /* older Chromium shapes */ }
  }
  function layoutLabel(code) {
    if (!kbLayout || typeof kbLayout.get !== "function") return null;
    let v;
    try { v = kbLayout.get(code); } catch (_) { return null; }
    if (typeof v !== "string" || !v) return null;
    return v.toUpperCase();
  }
  // The name on a key chip: "X", "3", "SHIFT", an arrow — in the player's own
  // layout where the platform will tell us what that is.
  function keyLabel(code) {
    if (!code) return "";
    code = normCode(String(code));
    let m;
    if (/^(Key[A-Z]|Digit\d|Bracket|Semicolon|Quote|Comma|Period|Slash|Backslash|Minus|Equal|IntlBackslash)/.test(code)) {
      const l = layoutLabel(code);
      if (l) return l;
    }
    if ((m = /^Key([A-Z])$/.exec(code))) return m[1];
    if ((m = /^Digit(\d)$/.exec(code))) return m[1];
    if ((m = /^Numpad(.+)$/.exec(code))) return "NUM " + ({ Add: "+", Subtract: "-", Multiply: "*", Divide: "/", Decimal: "." }[m[1]] || m[1].toUpperCase());
    return KEY_NAMES[code] || code.toUpperCase();
  }

  // ---- controller bindings -----------------------------------------------
  // The same shape for the pad: PAD_ACTIONS is the list the CONTROLS page
  // renders, padMap the live table (two button-index slots per action, W3C
  // "standard" mapping), the defaults the layout the game always had. Steering
  // (left stick, d-pad left/right) and pause (Menu/Start) are not bindings:
  // the stick is an axis and the d-pad/Start pair is what the menus answer to.
  const PAD_ACTIONS = [
    { id: "throttle",  label: "GAS",         def: [7, 0] },
    { id: "brake",     label: "BRAKE",       def: [6, 1] },
    { id: "boost",     label: "BOOST",       def: [2, null] },
    { id: "overtake",  label: "OVERTAKE",    def: [3, null] },
    { id: "aero",      label: "ACTIVE AERO", def: [12, null] },
    { id: "shiftUp",   label: "SHIFT UP",    def: [5, null] },
    { id: "shiftDown", label: "SHIFT DOWN",  def: [4, null] },
    { id: "camera",    label: "CAMERA",      def: [8, null] },
    { id: "lookBack",  label: "LOOK BACK",   def: [11, null] },
    { id: "recover",   label: "RECOVER",     def: [10, null] },
    { id: "pause",     label: "PAUSE",       def: [9, null] },
  ];
  // The d-pad's left/right are the digital STEER axis, not bindings — the same
  // reason the stick is not one. Pause left this set when it became a binding.
  const PAD_RESERVED = { 14: 1, 15: 1 };
  const padMap = {};
  let padCaptureCb = null;   // set while a CONTROLS slot waits for a button
  const padIndexOk = (v) => Number.isInteger(v) && v >= 0 && v < 32;
  function resetPad() { for (const a of PAD_ACTIONS) padMap[a.id] = a.def.slice(); }
  resetPad();
  function setPadMap(saved) {
    resetPad();
    if (saved && typeof saved === "object") {
      const seen = {};
      for (const a of PAD_ACTIONS) {
        const v = Array.isArray(saved[a.id]) ? saved[a.id] : null;
        if (!v) continue;
        padMap[a.id] = [0, 1].map((i) => {
          const b = v[i] == null ? null : Number(v[i]);
          if (b == null || !padIndexOk(b) || PAD_RESERVED[b] || seen[b]) return null;
          seen[b] = 1;
          return b;
        });
      }
    }
    return getPadMap();
  }
  function getPadMap() { const o = {}; for (const a of PAD_ACTIONS) o[a.id] = padMap[a.id].slice(); return o; }
  function padBindings() { return PAD_ACTIONS.map((a) => ({ id: a.id, label: a.label, codes: padMap[a.id].slice(), def: a.def.slice() })); }
  function padsAreDefault() { return PAD_ACTIONS.every((a) => a.def[0] === padMap[a.id][0] && a.def[1] === padMap[a.id][1]); }
  function setPadBinding(id, slot, index) {
    index = index == null ? NaN : Number(index);
    if (!padMap[id] || !(slot === 0 || slot === 1) || !padIndexOk(index)) return { ok: false, reason: "invalid" };
    if (PAD_RESERVED[index]) return { ok: false, reason: "reserved" };
    let conflict = null;
    for (const a of PAD_ACTIONS) for (let i = 0; i < 2; i++) {
      if (padMap[a.id][i] === index && !(a.id === id && i === slot)) { padMap[a.id][i] = null; if (a.id !== id) conflict = a.id; }
    }
    padMap[id][slot] = index;
    padThrottle = padBrake = false; padThrottleVal = padBrakeVal = 0;   // a held pedal whose button changed meaning
    return { ok: true, conflict };
  }
  function clearPadBinding(id, slot) {
    if (!padMap[id] || !(slot === 0 || slot === 1)) return false;
    padMap[id][slot] = null; return true;
  }
  // While a callback is armed the next rising edge on ANY button goes to it
  // and nothing else that frame — no menu walk, no pause, no driving — so the
  // press that binds B cannot also back out of the sheet. `null` disarms.
  function padCapture(cb) { padCaptureCb = typeof cb === "function" ? cb : null; }
  function padPresent() { return padConnected || !!activePad(); }
  // A physical keyboard has been seen: any trusted key press outside a text
  // field. A phone's on-screen keyboard only fires while a field is focused, so
  // this never latches on one; a Bluetooth keyboard on a tablet does. The
  // CONTROLS page uses it to reveal the KEYBOARD table where pointer: coarse
  // hid it (Input.keyboardSeen), the twin of padPresent for the pad table.
  let kbSeen = false;
  function keyboardSeen() { return kbSeen; }
  // The Help sheet and first-run coach need the source the player is actually
  // using, rather than whichever devices happen to be connected. This is a
  // report of input activity only; it never participates in control priority.
  let inputSource = null; // "keyboard" | "controller" | "touch"
  let defaultInputSource = null;
  function noteInputSource(source) {
    if (source === "keyboard" || source === "controller" || source === "touch") inputSource = source;
  }
  function activeInputSource() {
    if (inputSource) return inputSource;
    if (!defaultInputSource) defaultInputSource = touchControlsNeeded() ? "touch" : "keyboard";
    return defaultInputSource;
  }
  const PAD_NAMES_XBOX = ["A", "B", "X", "Y", "LB", "RB", "LT", "RT", "VIEW", "MENU", "LS", "RS", "D‑PAD ↑", "D‑PAD ↓", "D‑PAD ←", "D‑PAD →", "HOME"];
  const PAD_NAMES_PS = ["CROSS", "CIRCLE", "SQUARE", "TRIANGLE", "L1", "R1", "L2", "R2", "SHARE", "OPTIONS", "L3", "R3", "D‑PAD ↑", "D‑PAD ↓", "D‑PAD ←", "D‑PAD →", "PS"];
  // Nintendo's physical A/B and X/Y sit OPPOSITE the Xbox positions, so index 0
  // — the button the standard mapping calls "bottom of the right cluster" — is
  // physically labelled B on a Switch Pro. Sniffing cannot always tell, which
  // is why the override below exists.
  const PAD_NAMES_NIN = ["B", "A", "Y", "X", "L", "R", "ZL", "ZR", "MINUS", "PLUS", "LS", "RS", "D‑PAD ↑", "D‑PAD ↓", "D‑PAD ←", "D‑PAD →", "HOME"];
  const PAD_NAME_SETS = { xbox: PAD_NAMES_XBOX, ps: PAD_NAMES_PS, nintendo: PAD_NAMES_NIN };
  /* SNIFFING THE id STRING IS THE STATE OF THE ART, AND IT IS NOT GOOD ENOUGH
     ALONE. The Gamepad spec says outright that the id format is "left
     unspecified"; Chrome writes "Name (STANDARD GAMEPAD Vendor: 054c Product:
     05c4)" but an XInput pad becomes "Xbox 360 Controller (XInput STANDARD
     GAMEPAD)" with no vendor at all, Firefox writes "054c-05c4-Name", and
     Safari rewrites the name at the OS layer. Standardising vendorId/productId
     is still an open W3C issue. So: sniff by default, and let the player say
     when we get it wrong. */
  let padLabelMode = "auto";     // "auto" | "xbox" | "ps" | "nintendo"
  function setPadLabelMode(m) {
    padLabelMode = PAD_NAME_SETS[m] ? m : "auto";
  }
  function padLabelModeOf() { return padLabelMode; }
  function padBrandAuto() {
    const pad = activePad();
    const id = String((pad && pad.id) || "");
    if (/playstation|dualshock|dualsense|\b054c\b|sony/i.test(id)) return "ps";
    if (/nintendo|switch\s*pro|joy-?con|\b057e\b/i.test(id)) return "nintendo";
    return "xbox";
  }
  // The name on a chip: the player's override, else what the pad id suggests.
  function padLabel(index) {
    if (index == null) return "";
    const brand = padLabelMode === "auto" ? padBrandAuto() : padLabelMode;
    const names = PAD_NAME_SETS[brand] || PAD_NAMES_XBOX;
    return names[index] || `BTN ${index}`;
  }

  /* THE WHEEL WIZARD'S ONE PRIMITIVE. Arm it, ask the player to move the
     control we want, and the first axis that travels far enough from where it
     was resting when we armed is the answer. Comparing against a REST snapshot
     rather than against zero is what makes it work on a wheel at all: a pedal
     axis rests at -1, not 0, so "largest absolute value" would pick an
     untouched pedal every time. */
  const AXIS_CAPTURE_MOVE = 0.45;
  function beginAxisCapture(cb) {
    axisCaptureCb = typeof cb === "function" ? cb : null;
    axisCaptureRest = null;
    if (!axisCaptureCb) return;
    const pad = activePad();
    if (pad && pad.axes) axisCaptureRest = Array.prototype.slice.call(pad.axes);
  }
  function pollAxisCapture(pad) {
    if (!axisCaptureCb) return;
    const axes = pad.axes || [];
    if (!axisCaptureRest) { axisCaptureRest = Array.prototype.slice.call(axes); return; }
    let best = -1, bestI = -1;
    for (let i = 0; i < axes.length; i++) {
      const rest = typeof axisCaptureRest[i] === "number" ? axisCaptureRest[i] : 0;
      const d = Math.abs((axes[i] || 0) - rest);
      if (d > best) { best = d; bestI = i; }
    }
    if (bestI < 0 || best < AXIS_CAPTURE_MOVE) return;
    const cb = axisCaptureCb;
    const rest = typeof axisCaptureRest[bestI] === "number" ? axisCaptureRest[bestI] : 0;
    axisCaptureCb = null; axisCaptureRest = null;
    cb(bestI, Math.sign((axes[bestI] || 0) - rest) || 1);
  }
  function setPadAxisMap(saved) {
    padAxisMap = Object.assign({}, PAD_AXIS_DEF);
    if (saved && typeof saved === "object") {
      for (const k of ["steer", "throttle", "brake"]) {
        const v = saved[k];
        if (v === null || (Number.isInteger(v) && v >= 0 && v < 32)) padAxisMap[k] = v;
      }
      for (const k of ["steerInvert", "pedalInvert"]) {
        if (saved[k] === -1 || saved[k] === 1) padAxisMap[k] = saved[k];
      }
    }
    return getPadAxisMap();
  }
  function getPadAxisMap() { return Object.assign({}, padAxisMap); }
  function padAxesAreDefault() {
    return Object.keys(PAD_AXIS_DEF).every((k) => padAxisMap[k] === PAD_AXIS_DEF[k]);
  }
  /* Capture where the steering axis RESTS and subtract it forever after. This
     is the honest answer to stick drift: a worn potentiometer's wiper no longer
     reads zero at centre, and the alternative — one big dead zone for everyone
     — makes every good pad worse to spare one bad one. */
  function calibratePad() {
    const pad = activePad();
    if (!pad || !pad.axes) return false;
    const v = readPadAxis(pad.axes, padAxisMap.steer) * padAxisMap.steerInvert;
    // A stick genuinely held over cannot be a rest position; refuse rather than
    // bake a permanent offset that steers the car on its own.
    if (Math.abs(v) > 0.5) return false;
    padRestOffset = v;
    try { Log.info("input", `pad calibrated, rest offset ${v.toFixed(3)}`); } catch (_) { /* Log absent */ }
    return true;
  }
  function padRest() { return padRestOffset; }
  /* AXIS MAP — the wheel story. A G29/G923/T300/Fanatec enumerates as a
     Gamepad with `mapping: ""`, because the only standard layout the spec
     defines is the Xbox-style pad. Its steering axis IS usually axis 0, which
     is why steering "worked" here by accident; its pedals are NOT buttons 6/7,
     so throttle and brake did not. Nothing in the Gamepad API says which axis
     is which, so the only honest answer is to let the player show us —
     `beginAxisCapture` below is the wizard's one primitive.
     `steerInvert` exists because half the wheels on the market report the
     opposite sign, and a game that cannot be told so is unusable on them. */
  const PAD_AXIS_DEF = { steer: 0, steerInvert: 1, throttle: null, brake: null, pedalInvert: 1 };
  let padAxisMap = Object.assign({}, PAD_AXIS_DEF);
  let axisCaptureCb = null;      // armed while the wizard waits for a moved axis
  let axisCaptureRest = null;    // resting snapshot taken when the wizard armed
  function readPadAxis(axes, i) {
    if (i == null) return 0;
    const v = axes[i];
    return (typeof v === "number" && isFinite(v)) ? v : 0;
  }
  /* Scaled-radial shaping, which on a single axis degenerates to scaled-axial
     — but the RESCALE is the part that matters and the part we lacked. A bare
     `if (|x| < dz) x = 0` leaves a step at the boundary: output jumps from 0
     to dz. Subtracting the dead zone and dividing by the surviving range gives
     a continuous ramp from 0 at the boundary to 1 at full deflection, and
     folding saturation into the same divisor means a worn stick that tops out
     at 0.85 still reaches full lock. */
  function padAxisShape(raw) {
    const v = clamp(raw - padRestOffset, -1, 1);
    const a = Math.abs(v);
    if (a <= padDeadzone) return 0;
    const span = Math.max(0.05, 1 - padDeadzone - padSaturation);
    return clamp(Math.sign(v) * (a - padDeadzone) / span, -1, 1);
  }
  // A wheel's pedal axis rests at -1 and travels to +1 (the common convention),
  // so map it to 0..1. Unmapped pedals return 0 and the trigger path wins.
  function padPedalAxis(axes, which) {
    const i = padAxisMap[which];
    if (i == null) return 0;
    const v = readPadAxis(axes, i) * padAxisMap.pedalInvert;
    return clamp((v + 1) / 2, 0, 1);
  }
  function padDpadSteer(pad) {
    const t = nowMs();
    const dt = (padDpadT ? Math.min(0.1, (t - padDpadT) / 1000) : 0) * timeScale;
    padDpadT = t;
    const target = (btnDown(pad, 15) ? 1 : 0) - (btnDown(pad, 14) ? 1 : 0);
    padDpadVal = digitalStep(padDpadVal, target, dt);
    return padDpadVal;
  }
  // The largest value across an action's bound buttons (a trigger is analog,
  // a face button reads 0/1) and any rising edge across them.
  function padActVal(pad, id) {
    let v = 0;
    for (const b of padMap[id]) if (b != null) v = Math.max(v, clamp(btnVal(pad, b), 0, 1));
    return v;
  }
  function padActEdge(pad, id) {
    for (const b of padMap[id]) if (b != null && btnEdge(pad, b)) return true;
    return false;
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
    // The keyboard latch: any trusted press that is not text entry. A focused
    // BUTTON still counts (the menus keep one focused, and a key on it is a
    // keyboard); a field does not, because a phone's on-screen keyboard fires
    // there too.
    if (down && e.isTrusted !== false && !(tag === "INPUT" || tag === "TEXTAREA" || (active && active.isContentEditable))) {
      kbSeen = true;
      noteInputSource("keyboard");
    }
    /* COMMAND EATS THE KEY-UP, so Command going down is a release-all.
       On macOS the OS does not deliver key-up to an application while Command
       is held: press W, tap Cmd, let go of W, and NO keyup ever arrives. The
       key is then latched on with nothing to clear it — reproduced in Chrome,
       Firefox and Safari alike, so it is the platform, not an engine bug we
       can wait out. A stuck throttle is the worst version of this: game.js
       re-trips the off-track auto-rescue whenever throttle is held and the car
       is not moving, so the car floors itself off the track and is reset, over
       and over (the same failure shape the hold-button ghost-pointer nets
       exist to stop).
       Meta is in KEY_RESERVED so it can never be a binding, which makes
       treating it as "let go of everything" free of side effects. Alt gets the
       same treatment for Alt+Tab on Windows, for the same reason. */
    if (down && (e.code === "MetaLeft" || e.code === "MetaRight" || e.code === "AltLeft" || e.code === "AltRight")) {
      keyLeft = keyRight = keyThrottle = keyBrake = false;
    }
    /* PAUSE AND BACK ARE COMMANDS, NOT DRIVING CONTROLS, so they sit ABOVE the
       driving gate — but still below the typing check, because P in a text
       field is a letter.
       They used to sit inside the switch below, which only worked by accident:
       the gate's screen list happened not to mention the two tuner panels, so
       the pause key reached them. The moment that list was corrected (one list
       for everyone, js/ui/layers.js) the key started being swallowed in the
       LIGHTING TUNER and free camera — the one place its documented
       all-the-way-out behaviour matters most. Reachability should not be a
       side effect of a list being incomplete. */
    const act = codeToAction[normCode(e.code)] || null;
    if (down && !e.repeat && (act === "pause" || e.code === "Escape") && !typing) {
      if (act === "pause") {
        if (onPauseCb) onPauseCb();
        return;
      }
      /* ESCAPE IS "BACK", AND ONLY PAUSE WHEN THERE IS NOTHING TO GO BACK FROM.
         It was a bare alias for KeyP with no state check, which read wrong on a
         desktop keyboard everywhere the answer to Escape was obviously "close
         this" — and was actively wrong with a tuner open, where it resumed the
         race instead of stepping back to SETTINGS. An open layer belongs to the
         Escape handler in js/ui/modal.js, which runs first (capture) and
         presses that screen's own back control; by the time one is open this
         key normally never even arrives. */
      if (onPauseCb && window.UiLayers && window.UiLayers.inRace() && !window.UiLayers.anyOpen()) {
        onPauseCb();
        /* AND THE KEY IS SPENT — without this, Escape could not pause at all.
           #pausemenu is a <dialog> (js/ui/modal.js), so opening it here
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
      if (act === "left") keyLeft = false;
      else if (act === "right") keyRight = false;
      else if (act === "throttle") keyThrottle = false;
      else if (act === "brake") keyBrake = false;
      else if (act === "lookBack") keyLookBack = false;
      return;
    }
    const edge = down && !e.repeat;
    switch (act) {
      case "left": keyLeft = down; if (down) e.preventDefault(); break;
      case "right": keyRight = down; if (down) e.preventDefault(); break;
      case "throttle": keyThrottle = down; if (down) e.preventDefault(); break;
      case "brake": keyBrake = down; if (down) e.preventDefault(); break;
      // preventDefault on both edges: the default BOOST key is Space, which
      // otherwise scrolls the page (and activates a focused button on keyup).
      case "boost": if (edge) boostTogglePressed = true; e.preventDefault(); break;
      case "overtake": if (edge) overtakePressed = true; break;
      case "aero": if (edge) aeroTogglePressed = true; break;
      case "shiftUp": if (edge) shiftUpPressed = true; break;
      case "shiftDown": if (edge) shiftDownPressed = true; break;
      case "camera": if (edge) cameraCyclePressed = true; break;
      case "lookBack": keyLookBack = down; if (down) e.preventDefault(); break;
      case "recover": if (edge) recoverPressed = true; break;
      // PAUSE and Escape are handled ABOVE the driving gate — see the comment
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

  /* SUB-FRAME TOUCH SAMPLES. Since Chrome 60 the browser holds continuous
     input events and dispatches them immediately before the rAF callback, so
     a page sees roughly ONE move event per frame however fast the digitizer
     actually is — 120 Hz ProMotion included. getCoalescedEvents() hands back
     the samples that were merged into the one we got.
     Used narrowly and on purpose: only the freshest position, and only while
     exactly one finger is down, because a Touch identifier and a pointerId are
     not the same namespace and correlating them under multi-touch would be
     guesswork. Two fingers on the glass simply falls back to the touch path,
     which has always worked. Chromium-only; `in` is the feature test MDN
     recommends and Safari takes the else branch. */
  function onCanvasPointerMove(e) {
    if (steerMode !== "touch" || touches.size !== 1) return;
    if (!canvasTouchIsDriving()) return;
    if (typeof e.getCoalescedEvents !== "function") return;
    let list;
    try { list = e.getCoalescedEvents(); } catch (_) { return; }
    if (!list || list.length < 2) return;   // nothing the touch path did not already have
    const last = list[list.length - 1];
    if (!last || typeof last.clientX !== "number") return;
    for (const rec of touches.values()) { rec.x = last.clientX; rec.seq = ++touchSeq; }
    recomputeTouchSteer();
  }

  /* A FINGER ON GLASS HAS TREMOR, and the drag mode handed it straight to the
     steering. Tilt has run through a One-Euro filter since it shipped for
     exactly this reason; the drag axis never did, so on a straight the car
     wandered with the thumb. Same filter, its own state, and a gentler beta:
     a drag is a deliberate gesture and must not feel laggy, so the cutoff sits
     high enough to pass a flick untouched and only removes the micro-wobble.
     Zero smoothing (level 0) bypasses it entirely and is bit-identical to what
     shipped, which is what keeps the default honest. */
  const DRAG_OE_DCUTOFF = 1.0;
  let dragMinCutoff = 0;          // 0 = filter OFF (shipped behaviour)
  let dragOePrev = 0, dragOeDPrev = 0, dragOeInit = false;
  function setDragSmoothing(hz) {
    if (typeof hz !== "number" || !isFinite(hz)) return;
    dragMinCutoff = clamp(hz, 0, 8);
    if (dragMinCutoff <= 0) dragOeInit = false;
  }
  function dragFilter(x, dt) {
    if (dragMinCutoff <= 0) return x;
    if (!dragOeInit) { dragOePrev = x; dragOeDPrev = 0; dragOeInit = true; return x; }
    if (dt <= 0) return dragOePrev;
    const dx = (x - dragOePrev) / dt;
    const dxHat = dragOeDPrev + oeAlpha(DRAG_OE_DCUTOFF, dt) * (dx - dragOeDPrev);
    const cutoff = dragMinCutoff + OE_BETA * Math.abs(dxHat);
    const xHat = dragOePrev + oeAlpha(cutoff, dt) * (x - dragOePrev);
    dragOePrev = xHat; dragOeDPrev = dxHat;
    return xHat;
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

  /* Show where the anchor is, briefly. Looked up lazily and cached: the element
     is optional (a test harness page may not have it) and this runs on the
     touch path, so it must never throw and never query per event. */
  let dragMark = undefined;
  function showDragAnchor(x) {
    if (steerMode !== "touch") return;
    if (dragMark === undefined) dragMark = document.getElementById("drag-anchor") || null;
    if (!dragMark) return;
    dragMark.style.left = x + "px";
    dragMark.classList.add("on");
  }
  function hideDragAnchor() {
    if (dragMark) dragMark.classList.remove("on");
  }

  function onTouchStart(e) {
    if (!canvasTouchIsDriving()) return;
    noteInputSource("touch");
    e.preventDefault();
    for (const t of e.changedTouches) {
      touches.set(t.identifier, { anchorX: t.clientX, x: t.clientX, seq: ++touchSeq });
      showDragAnchor(t.clientX);
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
    if (!touches.size) hideDragAnchor();
    recomputeTouchSteer();
  }

  function touchSteering() {
    const t = nowMs();
    const dt = (touchSteerT ? Math.min(0.1, (t - touchSteerT) / 1000) : 0) * timeScale;
    touchSteerT = t;
    if (touchActive) { touchSteerVal = dragFilter(touchSteer, dt > 0 ? dt : 0.016); return touchSteerVal; }
    dragOeInit = false;   // a fresh press starts from where the finger lands, not from the last lap
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
    btnSteerVal = digitalStep(btnSteerVal, target, dt);
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
  // The pedal's pressed look is `#btn-throttle:active`, which follows the THUMB.
  // A latch outlives the thumb, so the class carries it instead; aria-pressed
  // exists only in latch mode, where the pedal really is a toggle button.
  function paintLatch() {
    const el = typeof document !== "undefined" && document.getElementById("btn-throttle");
    if (!el) return;
    el.classList.toggle("on", throttleLatch && throttleLatched);
    if (throttleLatch) el.setAttribute("aria-pressed", throttleLatched ? "true" : "false");
    else el.removeAttribute("aria-pressed");
  }
  function holdReleaseAll() {
    // A LATCH DROPS HERE. This is the everything-off path (window blur, page
    // hidden, last touch up, Input.reset), and a latched throttle surviving a
    // blur means the car accelerates while the player is not looking at it.
    throttleLatched = false;
    paintLatch();
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
      try { el.setPointerCapture(e.pointerId); } catch (_) { /* pointer already gone (cancelled between down and here); the button still works uncaptured */ }
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
        Log.warn("input", `gamepad poll failed: ${(e && e.message) || e}`);
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
  // page routes pad buttons to menu-nav, not these latches). The buttons are
  // the DEFAULTS of PAD_ACTIONS above — SETTINGS › CONTROLS › CONTROLLER
  // rebinds them; the stick, d-pad steer and Start are fixed:
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
      padSteerAnalog = false; padLookBack = false;
      padDpadVal = 0; padDpadT = 0;
      if (padPrevButtons.length) padPrevButtons.length = 0;
      padNavDir = null;
      padNavSeeded = false;
      padNavSeedLayer = null;
      if (inputSource === "controller") inputSource = null;
      return;
    }
    padConnected = true;
    // The indices below are the W3C "standard" layout and nothing here remaps.
    // A pad the browser could not map reports mapping "" and shuffles them —
    // log it once so a "throttle is on LB" report has its cause on record.
    if (!padMapWarned && pad.mapping !== "standard") {
      padMapWarned = true;
      Log.warn("input", `gamepad mapping "${pad.mapping}" is not "standard": button/axis indices may not match`);
    }
    const axes = pad.axes || [];
    const stick = padAxisShape(readPadAxis(axes, padAxisMap.steer) * padAxisMap.steerInvert);
    // THE D-PAD IS A DIGITAL SOURCE AND MUST RAMP LIKE ONE. It used to assign
    // `ax = ±1` outright — a teleport to full lock, bypassing digitalStep while
    // every other digital source in this file (arrows, on-screen buttons) went
    // through it. At 300 km/h a d-pad tap was an instant full-lock input, which
    // is not a control anyone can drive with; XAG 107 requires the digital path
    // to WORK, not merely to exist. It now shares the arrows' ramp exactly, so
    // ADAPTIVE BUTTONS reaches it too.
    const dpad = padDpadSteer(pad);
    padSteerAnalog = Math.abs(stick) > 0.001;
    padSteer = padSteerAnalog ? stick : dpad;
    // pedals: analog triggers, a wheel's pedal AXES, or the A/B face buttons.
    padThrottleVal = Math.max(padActVal(pad, "throttle"), padPedalAxis(axes, "throttle"));
    padBrakeVal = Math.max(padActVal(pad, "brake"), padPedalAxis(axes, "brake"));
    padThrottle = padThrottleVal > 0.12;
    padBrake = padBrakeVal > 0.12;
    // A connected pad is not active input. Record only a real deflection or a
    // newly pressed button, so an idle Bluetooth pad cannot steal Help/coach
    // wording from the keyboard or touch player.
    let padActive = Math.abs(stick) > 0.05 || Math.abs(dpad) > 0.05 ||
      padThrottleVal > 0.12 || padBrakeVal > 0.12;
    if (!padActive && pad.buttons) {
      for (let i = 0; i < pad.buttons.length; i++) {
        if (btnDown(pad, i) && !padPrevButtons[i]) { padActive = true; break; }
      }
    }
    if (padActive) noteInputSource("controller");
    if (axisCaptureCb) {
      // The wheel wizard owns the frame: turning the wheel to answer "which
      // axis steers?" must not also steer the car sitting behind the sheet.
      padThrottle = padBrake = false; padThrottleVal = padBrakeVal = 0; padSteer = 0;
      padSteerAnalog = false; padLookBack = false; padNavDir = null;
      pollAxisCapture(pad);
    } else if (padCaptureCb) {
      // A CONTROLS slot is waiting for a button: the first rising edge is its
      // answer and the frame ends here — the press must not also walk the
      // menu, pause, or drive. Pedals and steer were latched above; unlatch.
      padThrottle = padBrake = false; padThrottleVal = padBrakeVal = 0; padSteer = 0;
      padSteerAnalog = false; padLookBack = false;
      padNavDir = null;
      const nb = pad.buttons ? pad.buttons.length : 0;
      for (let i = 0; i < nb; i++) if (btnEdge(pad, i)) { padCaptureCb(i); break; }
    } else {
      if (padActEdge(pad, "pause") && onPauseCb) onPauseCb();
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
        padLookBack = false;
        padNavPoll(pad);
      } else {
        padNavDir = null;   // fresh hold-timer the next time a menu opens
        padNavSeeded = false;
        padNavSeedLayer = null;
        // edge-triggered actions reuse the same latches the keyboard sets.
        if (padActEdge(pad, "boost")) boostTogglePressed = true;
        if (padActEdge(pad, "overtake")) overtakePressed = true;
        if (padActEdge(pad, "aero")) aeroTogglePressed = true;
        if (padActEdge(pad, "shiftUp")) shiftUpPressed = true;
        if (padActEdge(pad, "shiftDown")) shiftDownPressed = true;
        if (padActEdge(pad, "camera")) cameraCyclePressed = true;
        if (padActEdge(pad, "recover")) recoverPressed = true;
        padLookBack = padActVal(pad, "lookBack") > 0.5;
      }
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
    // TARGET THE FOCUSED ELEMENT, the way a real key press does. An element's
    // OWN onkeydown is not in the path of an event dispatched at `document` —
    // the event's target IS document, so it never descends to the control —
    // and both tab rails are written that way (the garage's category rail,
    // js/garage/setup-sheet.js csTabKey, and the circuit filter chips). Those
    // rails own their axis, so MenuNav steps aside for them by design; with
    // the key dispatched at document their handlers never ran either, and a
    // pad could not move along either rail at all: measured 2026-09-08, the
    // D-pad sat on the garage's TEAM tab forever while a real ArrowDown
    // walked all fifteen. Bubbling from the control still reaches document
    // (TopModal's Escape) and window (MenuNav's capture listener), which is
    // what the dispatch-at-document note below the fallback was protecting.
    const el = document.activeElement;
    const target = el && el !== document.body && el.dispatchEvent ? el : document;
    target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  }

  // A D-PAD DIRECTION ON A VALUE CONTROL. A synthetic ArrowRight does nothing
  // to a focused <select> or range slider — there is no UA default action for
  // an untrusted key — and MenuNav steps aside for the keys those controls
  // own, so a pad that landed on ACTIVE AERO's select or the UI SIZE slider
  // was stuck: Left/Right changed nothing, A did nothing (measured
  // 2026-09-08). Along the control's axis the pad steps the VALUE itself and
  // fires input/change the way a real key would; Up/Down go to MenuNav as
  // the ordinary row move they are for the keyboard too.
  function padNavKey(dir) {
    const el = document.activeElement;
    const key = PAD_NAV_KEYS[dir];
    const horizontal = dir === "left" || dir === "right";
    if (el && !el.disabled) {
      const t = el.tagName;
      const ty = t === "INPUT" ? String(el.type || "text").toLowerCase() : "";
      if (t === "SELECT" && horizontal) {
        const n = el.options ? el.options.length : 0;
        const j = Math.max(0, Math.min(n - 1, el.selectedIndex + (dir === "right" ? 1 : -1)));
        if (n && j !== el.selectedIndex) {
          el.selectedIndex = j;
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        }
        return;
      }
      if (t === "INPUT" && (ty === "range" || ty === "number") && horizontal) {
        const step = parseFloat(el.step) || 1;
        const min = el.min === "" ? -Infinity : parseFloat(el.min), max = el.max === "" ? Infinity : parseFloat(el.max);
        const v = Math.max(min, Math.min(max, (parseFloat(el.value) || 0) + (dir === "right" ? step : -step)));
        if (String(v) !== String(el.value)) {
          el.value = String(v);
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
        }
        return;
      }
    }
    padDispatchKey(key);
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
        padNavKey(dir);
        padNavNextT = now + PAD_NAV_DELAY_MS;
      } else if (now >= padNavNextT) {
        padNavKey(dir);
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

  /* ONE VOLUME KNOB FOR EVERY HAPTIC. The Game Accessibility Guidelines list
     "include toggle/slider for any haptics" as a BASIC item, not an advanced
     one, and we shipped four rumble sites and four navigator.vibrate calls
     with no way to turn any of them down. Both channels route through here so
     the slider cannot drift out of sync with one of them.
     0 is a true off: callers do not have to check. */
  let hapticScale = 1;
  function setHaptics(v) {
    if (typeof v === "number" && isFinite(v)) hapticScale = clamp(v, 0, 1);
  }
  // Device vibration, scaled. The try/catch is not optional: Chrome throws if
  // the page has never been interacted with, and iOS Safari has no vibrate at
  // all (WebKit has never shipped it and formally opposes it), so every caller
  // must already survive this doing nothing.
  // Can this device produce ANY haptic? navigator.vibrate is absent from every
  // WebKit (so every iOS browser), and Gamepad.vibrationActuator is false there
  // too — an iPhone can do neither from a web page. The HAPTICS slider says so
  // in its help text, but a control that cannot do anything is better hidden
  // than explained, so steer-tuning.js gates the row on this. Re-read on
  // gamepadconnected: a pad arriving later can make it true.
  function hapticsSupported() {
    const nav = typeof navigator !== "undefined" ? navigator : null;
    if (nav && typeof nav.vibrate === "function") return true;
    const pad = activePad();
    return !!(pad && pad.vibrationActuator);
  }

  // PRIME the vibrator from a real click. Chromium requires user activation for
  // navigator.vibrate and no longer counts `touchstart` as one — so the first
  // in-race buzz of a session is dropped with a console intervention and every
  // later one works, which reads as "haptics are flaky" rather than "haptics
  // were never armed". One zero-length call from the GO/START click arms it for
  // the frame's lifetime. Safe everywhere: a no-op where vibrate is absent.
  let hapticPrimed = false;
  function primeHaptics() {
    if (hapticPrimed) return;
    hapticPrimed = true;
    if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
    try { navigator.vibrate(1); } catch (_) { /* advisory only */ }
  }

  function vibrate(ms) {
    if (hapticScale <= 0) return;
    if (typeof navigator === "undefined" || !navigator.vibrate) return;
    const d = Math.round(ms * hapticScale);
    if (d <= 0) return;
    try { navigator.vibrate(d); } catch (_) { /* advisory only */ }
  }
  // Best-effort rumble on the active pad (dual-rumble or generic actuator).
  // Silently no-ops where unsupported — note this is EVERY iOS browser:
  // Gamepad.vibrationActuator is false on Safari iOS, so a paired DualSense
  // cannot rumble from a web page and never will. Callers fire vibrate()
  // alongside, so haptics degrade to nothing rather than to an error.
  function rumble(intensity, ms) {
    if (hapticScale <= 0) return;
    if (!padConnected) return;
    const pad = activePad();
    if (!pad) return;
    const a = pad.vibrationActuator;
    const mag = clamp(intensity, 0, 1) * hapticScale;
    if (a && typeof a.playEffect === "function") {
      try {
        a.playEffect("dual-rumble", {
          duration: Math.max(0, ms | 0),
          strongMagnitude: mag,
          weakMagnitude: mag * 0.7,
        });
      } catch (e) { /* actuator busy or unsupported effect type */ }
      return;
    }
    // Firefox never shipped playEffect and exposes the older, non-standard
    // hapticActuators[].pulse() instead — so without this branch every Firefox
    // player had silent controllers while the code looked like it supported them.
    const legacy = pad.hapticActuators && pad.hapticActuators[0];
    if (legacy && typeof legacy.pulse === "function") {
      try { legacy.pulse(mag, Math.max(0, ms | 0)); } catch (e) { /* same */ }
    }
  }

  /* ONE CURVE FOR EVERY DEVICE WAS THE DEFECT, and it is worth being exact
     about what was wrong, because the curve itself was not.
     js/game.js raises the unified steer command to STEER_EXPO (the LINEARITY
     slider, shipped at ~2.4) — which sits at the top of the gamma band ACC
     recommends for a pad, so the VALUE was defensible. What was not is that
     tilt, a drag on the glass and a thumbstick all received it, so a player
     who tuned LINEARITY for their phone had, by the same act, re-tuned their
     gamepad. digitalStep already had to invert the whole thing every frame
     just to keep a held button linear in the space that matters.
     A TRIM, not a second curve: game.js computes |s|^STEER_EXPO, so a source
     that returns |raw|^t lands at |raw|^(t·STEER_EXPO). t = 1 is the identity
     and is the default for all three, so nothing moves for anyone who never
     opens the row. The DIGITAL sources deliberately get no trim — their ramp
     is linear in road-wheel space by construction, which is the point of
     digitalStep, and a trim there would mean ramping crookedly on purpose. */
  const analogTrim = { tilt: 1, touch: 1, pad: 1 };
  /* Speed-sensitive steering for the ANALOG sources — the half ADAPTIVE
     BUTTONS never covered. That assist scales the digital RATE, so keys and
     on-screen arrows got it and a thumb drag at 320 km/h did not, which is
     where it matters most: the same flick that places the car in a hairpin is
     a spin at the end of a straight. Pad sim-racers describe this as what
     makes a thumbstick viable at all, ~20 mm of travel standing in for 900° of
     rotation, and ACC's own recommended range is 70-80 %.
     The floor is the guard the same sources warn about: taken too far, speed
     sensitivity develops a large on-centre dead zone and almost no lock at
     speed. At full mix this keeps 40 % of static lock, never less.
     Ships OFF (mix 0). It changes how the car answers, so it is the player's
     to turn on — a new default that silently re-steers an existing save is the
     act this file's migration ladder exists to prevent. */
  const ANALOG_SPEED_FLOOR = 0.40;
  let analogSpeedMix = 0;
  function analogSpeedGain() {
    if (analogSpeedMix <= 0) return 1;
    const ref = steerSpeedRef > 1 ? steerSpeedRef : 41.7;
    const v = currentSpeedStd();
    return 1 - analogSpeedMix * (1 - ANALOG_SPEED_FLOOR) * (v / (v + ref));
  }
  function analogShape(v, src) {
    const t = analogTrim[src] || 1;
    const shaped = t === 1 ? v : Math.sign(v) * Math.pow(Math.abs(v), t);
    return clamp(shaped * analogSpeedGain(), -1, 1);
  }

  function steer() {
    const k = keyboardSteer();
    if (keyLeft || keyRight || Math.abs(k) > 0.001) return k;
    // The d-pad half of padSteer is digital and already ramped — it must not
    // also be curved and speed-scaled as if it were a deflection.
    if (padSteerActive()) return padSteerAnalog ? analogShape(padSteer, "pad") : padSteer;
    if (steerMode === "buttons") return buttonSteering();
    if (tiltActive()) return analogShape(tiltSteering(), "tilt");
    return analogShape(touchSteering(), "touch");
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
    if (btnThrottle) return throttleLatch && throttleLatched ? 1 : btnThrottleVal;
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

  function consumeRecover() {
    const v = recoverPressed;
    recoverPressed = false;
    return v;
  }
  /* HELD, not edged: the mirror is only up while the control is down.
     KEY AND PAD ONLY. There was an on-screen LOOK button in the tap column too;
     it was removed on request — the dock had grown to five buttons in one thumb
     column once PIT landed beside it, and a glance over the shoulder is the
     control that least deserves a permanent seat there. */
  function lookingBack() { return keyLookBack || padLookBack; }

  /* ESCAPE IS SPENT ON LEAVING FULLSCREEN unless we ask for it. In fullscreen
     the UA takes Escape to exit, so our pause handler never sees the key —
     which is why PAUSE became a binding (a player can move it), but the key
     they actually reach for should still work. navigator.keyboard.lock() is
     the sanctioned way to claim it; the escape hatch is a 2-second Escape
     hold, so a page cannot trap anyone.
     Chrome 80+ / Chromium only. Firefox and Safari ship no Keyboard Lock at
     all, so there Escape keeps exiting fullscreen and the bound PAUSE key is
     the only way out — exactly the reason it stopped being reserved.
     (The permission prompt Chrome announced for 131 was cancelled, so this
     needs no gesture beyond the fullscreen request that precedes it.) */
  function lockEscape() {
    const kb = typeof navigator !== "undefined" && navigator.keyboard;
    if (!kb || typeof kb.lock !== "function") return Promise.resolve(false);
    return Promise.resolve(kb.lock(["Escape"])).then(() => true).catch(() => false);
  }
  function unlockEscape() {
    const kb = typeof navigator !== "undefined" && navigator.keyboard;
    if (kb && typeof kb.unlock === "function") { try { kb.unlock(); } catch (_) { /* not locked */ } }
  }

  function setSteerMode(m) {
    steerMode = (m === "buttons" || m === "touch") ? m : "tilt";
    try { Log.info("input", `steerMode ${steerMode}`); } catch (_) { /* Log absent in isolated VM */ }
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

  // TOUCH SENSITIVITY, at last. touchRangeFrac has existed since the drag mode
  // shipped — declared, read by touchRangePx(), and never assigned by anything,
  // so the one steer mode with no settings at all had a knob sitting unused in
  // its own source. docs/research/DRIVING-CONTROLS-RESEARCH.md called for the
  // slider in 2026-08 ("it should be exposed as a slider regardless") and the
  // wiring was simply never done. Bounds: 6 % of the long edge is a flick,
  // 24 % is a deliberate sweep; 12 % is what shipped and stays the default.
  function setTouchRange(frac) {
    if (typeof frac === "number" && isFinite(frac)) touchRangeFrac = clamp(frac, 0.06, 0.24);
  }
  function setAnalogTrim(src, t) {
    if (!(src in analogTrim)) return;
    if (typeof t === "number" && isFinite(t)) analogTrim[src] = clamp(t, 0.4, 2.2);
  }
  function setAnalogSpeedMix(v) {
    if (typeof v === "number" && isFinite(v)) analogSpeedMix = clamp(v, 0, 1);
  }
  function setPadDeadzone(v) {
    if (typeof v === "number" && isFinite(v)) padDeadzone = clamp(v, 0, 0.30);
  }
  function setPadSaturation(v) {
    if (typeof v === "number" && isFinite(v)) padSaturation = clamp(v, 0, 0.30);
  }
  // The digital ramp rate — the knob every comparable racer exposes and we did
  // not. Unity's legacy default is 333 ms to full lock; ours is 250 ms, and the
  // AC Advanced Gamepad Assist author's note is that a KEYBOARD wants a lower
  // rate than a controller for stability. The release rate rides with it at the
  // same 2:1 ratio the file has always used, because unwinding must stay
  // quicker than building (see digitalStep).
  function setKeyRampIn(rate) {
    if (typeof rate !== "number" || !isFinite(rate)) return;
    KEY_RAMP_IN = clamp(rate, 1.5, 10);
    KEY_RAMP_OUT = KEY_RAMP_IN * 2;
  }
  function setAdaptiveButtons(v) {
    if (typeof v === "boolean") { adaptiveMix = v ? 1 : 0; return; }
    if (typeof v === "number" && isFinite(v)) adaptiveMix = clamp(v, 0, 1);
  }
  /* RAMP IN SHAPED SPACE — the road-wheel angle, not the raw stick value.
   *
   * js/game.js applies `shaped = sign(s)*|s|^STEER_EXPO` to whatever this
   * returns, and digitalStep was ramping `s` LINEARLY in time. So the angle the
   * car actually gets rose as t^2.389 at the shipped LINEARITY: a hold of 25 ms
   * bought 1.1 % of final lock, 100 ms bought 29.5 %, 150 ms bought 77.7 %.
   * Nothing, then everything — which is exactly the "too snappy on buttons"
   * report, and it is worst on the on-screen arrows because a thumb cannot
   * feather a hold the way a stick feathers a deflection.
   *
   * The ramp exists to make a digital source feel analog. The expo undid it.
   *
   * So ramp the SHAPED value linearly and hand back its exact inverse: game.js
   * raises it to STEER_EXPO and gets the linear ramp we intended. Analog sources
   * are untouched — they never enter digitalStep — and no physics constant
   * moves, so the characterization baseline is unaffected (it drives through
   * __apex.setInput, which bypasses this file entirely).
   */
  let steerExpo = 2.3889;     // pushed from steer-tuning; the shipped LINEARITY 5
  function setSteerExpo(e) {
    if (typeof e === "number" && isFinite(e) && e > 0.05) steerExpo = e;
  }
  const toShaped = (v) => (v < 0 ? -1 : 1) * Math.pow(Math.abs(v), steerExpo);
  const fromShaped = (v) => (v < 0 ? -1 : 1) * Math.pow(Math.abs(v), 1 / steerExpo);

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
          for (const cb of _coarseCbs) { try { cb(touchControlsNeeded()); } catch (_) { /* one bad subscriber must not stop the rest */ } }
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
    onPadLostCb = (opts && opts.onPadLost) || null;

    loadLayoutMap();
    window.addEventListener("keydown", function (e) { onKey(e, true); });
    window.addEventListener("keyup", function (e) { onKey(e, false); });
    window.addEventListener("pointerdown", function (e) {
      if (e.isTrusted !== false && (e.pointerType === "touch" || e.pointerType === "pen")) noteInputSource("touch");
    }, true);
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
    // Passive: these only READ touches.length and never preventDefault, so
    // declaring so lets the compositor skip waiting on them for every touch
    // release on the page (a non-passive window touch listener is a scroll
    // and tap-latency cost on Android Chrome). Capture stays.
    window.addEventListener("touchend", function (e) {
      if (e.touches.length === 0) holdReleaseAll();
    }, { capture: true, passive: true });
    window.addEventListener("touchcancel", function (e) {
      if (e.touches.length === 0) holdReleaseAll();
    }, { capture: true, passive: true });

    // Passive: it only READS positions and never calls preventDefault (the
    // touch listeners below own that), so the compositor need not wait on it.
    canvas.addEventListener("pointermove", onCanvasPointerMove, { passive: true });
    canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    canvas.addEventListener("touchend", onTouchEnd, { passive: false });
    canvas.addEventListener("touchcancel", onTouchEnd, { passive: false });

    wireHold("btn-throttle", function (v) {
      // Toggle on the DOWN edge only: the matching up-edge must not undo it, and
      // holdReleaseAll()'s apply(false) must not either — that path CLEARS the
      // latch outright rather than toggling it (see holdReleaseAll).
      if (throttleLatch) { if (v) { throttleLatched = !throttleLatched; paintLatch(); } btnThrottle = throttleLatched; }
      else btnThrottle = v;
    }, function (l) { btnThrottleVal = l; });
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
            `THR ${s.throttle ? "ON " : "off"}` +
            `  key:${+s.key.throttle} btn:${+s.btn.throttle} pad:${+s.pad.throttle}` +
            `\nBRK ${s.braking ? "ON " : "off"}` +
            `  key:${+s.key.brake} btn:${+s.btn.brake} pad:${+s.pad.brake}` +
            `\nheld ptrs [${s.holdPointers.join(",")}]` +
            `\nmode:${s.steerMode}` +
            `  auto:${(touchControlsNeeded() && s.steerMode === "touch") ? "ON" : "off"}`;
        }, 250);
      }
    } catch (_) { /* opt-in dev overlay only; blocked localStorage or a detached document must not break input init */ }

    if (typeof screen !== "undefined" && screen.orientation &&
        typeof screen.orientation.addEventListener === "function") {
      screen.orientation.addEventListener("change", onScreenRotate);
    } else {
      window.addEventListener("orientationchange", onScreenRotate);
    }

    window.addEventListener("gamepadconnected", function (e) {
      padConnected = true;
      try { Log.info("input", `gamepad connected ${padLogId(e)}`); }
      catch (_) { /* Log absent */ }
    });
    window.addEventListener("gamepaddisconnected", function (e) {
      // Another pad (a wheel + a controller, a hub re-enumerating) may still be
      // there: read the live list instead of assuming the last one just left.
      let still = false;
      try { const gps = navigator.getGamepads ? navigator.getGamepads() : []; for (let i = 0; i < gps.length; i++) if (gps[i] && gps[i].index !== (e.gamepad && e.gamepad.index)) still = true; } catch (_) { /* no API */ }
      padConnected = still; padSteer = 0; padThrottle = padBrake = false;
      padThrottleVal = padBrakeVal = 0;
      padSteerAnalog = false; padLookBack = false;
      padDpadVal = 0; padDpadT = 0;
      padPrevButtons.length = 0;
      padNavDir = null;
      padNavSeeded = false;
      padNavSeedLayer = null;
      try { Log.info("input", `gamepad disconnected ${padLogId(e)}`); }
      catch (_) { /* Log absent */ }
      /* A PAD LEAVING MID-RACE IS AN EVENT, not just a state change. Zeroing
         the inputs (above) stops a stale axis snapshot pinning the throttle,
         which was already right — but the race carried on regardless, so a
         flat battery at 300 km/h meant watching the car coast into a wall with
         no way to intervene. Console certification treats disconnect recovery
         as a tested failure mode for exactly this reason. Only when NO pad is
         left: swapping one of two pads is not an interruption. */
      if (!still && onPadLostCb) { try { onPadLostCb(); } catch (_) { /* the game's own handler must not break input teardown */ } }
    });
  }

  function reset() {
    touches.clear();
    hideDragAnchor();
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
    padSteerAnalog = false;
    padThrottle = false;
    padBrake = false;
    padThrottleVal = 0;
    padBrakeVal = 0;
    padLookBack = false;
    padDpadVal = 0;
    padDpadT = 0;
    keyLookBack = false;
    recoverPressed = false;
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
    recoverPressed = false;
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
      touchRangeFrac,
      dragMinCutoff,
      analogTrim: Object.assign({}, analogTrim),
      analogSpeedMix,
      analogSpeedGain: analogSpeedGain(),
      padDeadzone,
      padSaturation,
      padRestOffset,
      padSteerAnalog,
      padAxisMap: getPadAxisMap(),
      hapticScale,
      lookingBack: lookingBack(),
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
    keyBindings, setKeyBinding, clearKeyBinding, setKeyMap, getKeyMap, resetKeys, keysAreDefault, keyLabel, keyboardSeen, activeInputSource,
    padBindings, setPadBinding, clearPadBinding, setPadMap, getPadMap, resetPad, padsAreDefault, padLabel, padCapture, padPresent,
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
    consumeRecover,
    lookingBack,
    lockEscape, unlockEscape,
    tiltActive,
    simTilt,
    simTiltReset,
    steerToTilt,
    setSteerMode,
    setAdaptiveButtons,
    setSteerSpeedRef,
    setSteerExpo,
    setSpeedStd,
    setSpeedProvider,
    setTimeScale,
    setTiltSensitivity,
    setTiltSmoothing,
    setTiltDeadzone,
    setTouchRange,
    setDragSmoothing,
    setAnalogTrim,
    setAnalogSpeedMix,
    setPadDeadzone,
    setPadSaturation,
    setKeyRampIn,
    setHaptics,
    vibrate,
    hapticsSupported,
    setThrottleLatch(on) { throttleLatch = !!on; throttleLatched = false; btnThrottle = false; paintLatch(); },
    throttleLatched: () => throttleLatch && throttleLatched,
    primeHaptics,
    setPadLabelMode, padLabelMode: padLabelModeOf,
    setPadAxisMap, getPadAxisMap, padAxesAreDefault, beginAxisCapture, calibratePad, padRest,
    touchControlsNeeded,
    onPointerKindChange,
    clearEdges,
    get padConnected() { return padConnected; },
    get gyroSeen() { return tiltSeen; },
    get gyroDenied() { return gyroDenied; },
    get gyroHardDenied() { return gyroHardDenied; },
    // Exported for js/camera/photo-cam.js, whose hold buttons capture the pointer
    // the same way and need the same "was the button taken away?" test.
    holdTargetGone,
    // Read-only tilt-tuning state (for tests / diagnostics).
    get maxTilt() { return MAX_TILT; },
    get deadzone() { return DEADZONE; },
    get tiltSlew() { return TILT_SLEW; },
    get minCutoff() { return OE_MIN_CUTOFF; },
  };
})();
