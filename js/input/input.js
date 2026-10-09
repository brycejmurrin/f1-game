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

  let keyLeft = false;
  let keyRight = false;
  let keyBrake = false;
  let keyThrottle = false;
  let keySteerVal = 0;        // ramped -1..1
  let keySteerT = 0;          // last ramp timestamp, ms (0 = unset)
  let keySeq = 0, keyLeftSeq = 0, keyRightSeq = 0;   // press order, for last-key-wins

  let overtakePressed = false;
  let boostTogglePressed = false;
  let aeroTogglePressed = false;
  // edge-triggered gear shifts (manual mode)
  let shiftUpPressed = false;
  let shiftDownPressed = false;
  // edge-triggered camera cycle (C key / CAM tap)
  let cameraCyclePressed = false;
  let recoverPressed = false;   // edge-triggered manual recover / put-me-back
  let radioPressed = false;     // edge-triggered RADIO CHECK — ask the engineer for the gaps (js/race/race-radio.js)
  let mirrorPressed = false;    // edge-triggered REAR-VIEW MIRROR on/off (js/render/shared/mirror-pass.js)
  let keyLookBack = false;      // HELD: look-back mirror while the key/button is down
  let padLookBack = false;
  // FREE-LOOK axes (js/camera/feel.js): right stick + RMB-drag mouse deltas.
  // Stick is latched each poll; mouse deltas accumulate until consumeLookMouse().
  let lookStickX = 0, lookStickY = 0;
  let lookMouseDx = 0, lookMouseDy = 0;
  let lookMouseDown = false;
  const LOOK_STICK_DEAD = 0.18;

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
  let padPrevButtons = [];     // previous frame's pressed state, for rising edges — the ACTIVE pad's
  // One array PER PAD: pickPad can hand a different pad each frame (newest
  // timestamp), and a single shared array let pad B's frame overwrite pad A's
  // held Start, so one press fired twice (pause, unpause).
  const padPrevByIndex = new Map();
  let padPrevKey = null;       // padKey of the pad padPrevButtons belongs to
  let padDpadVal = 0;          // ramped d-pad steer, -1..1 (see padDpadSteer)
  let padDpadT = 0;            // last d-pad ramp timestamp, ms
  let padDpadSeq = 0, padDpadLeftSeq = 0, padDpadRightSeq = 0;
  let padDpadLeftHeld = false, padDpadRightHeld = false;
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
  // Press order for on-screen arrows — same last-press-wins contract as
  // keyboardSteer (a left→right thumb roll-over must not cancel to centre).
  let btnSteerSeq = 0, btnSteerLeftSeq = 0, btnSteerRightSeq = 0;

  let tiltRaw = 0;            // latest remapped tilt, degrees (raw, like Neon Drift)
  let tiltZero = 0;           // calibrated neutral
  let tiltSeen = false, tiltRemote = false; // seen data and ownership of the shared tilt sample
  let gyroAttached = false;
  let gyroDenied = false;
  // HARD refusal only: the sensor API is absent, or requestPermission()
  // RESOLVED to something other than "granted" (the player said no in the
  // iOS sheet). `gyroDenied` also latches on the TRANSIENT path — the promise
  // REJECTING because the call had no user activation, which is what a
  // gamepad A press synthesised as .click() on RACE! produces — and iOS gives
  // both the same shape from the outside. game.js enableTilt() auto-switches
  // (and persists steerMode="buttons") only on THIS flag, so a refusal that was
  // never the player's persists nothing; the label's "(NO GYRO)" stays on
  // `gyroDenied`, which keeps its meaning for every existing reader.
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
  /* PHONE AS CONTROLLER (js/input/phone-pad.js). A paired phone streams its
     roll in degrees plus its pedals; the roll enters the SAME One-Euro filter,
     dead zone, MAX_TILT map and slew as the local sensor (remoteSample writes
     tiltRaw/tiltSmoothed exactly as onOrient does), so every TILT slider and
     RECALIBRATE act on the phone too. Freshness, not a mode: the source is
     live while samples keep arriving and simply falls out of steer() when
     they stop, so the keyboard or a pad still work with a phone paired. Edges
     (shift, overtake, …) come on the RELIABLE channel via remoteEvent; the
     held look-back bit rides the sample. */
  const REMOTE_STALE_MS = 700;   // the phone heartbeats every 100 ms; six misses = gone
  const REMOTE_HELD = Object.freeze({ lookBack: 1 });
  let remoteMs = 0;              // nowMs() of the last sample; 0 = never
  let remThr = 0, remBrk = 0;    // 0..1 pedal travel from the phone
  let remHeld = 0;               // REMOTE_HELD bits
  let remRoll = false;           // the last sample carried a roll: a phone with no sensor sends null
  let remStick = false, remSteer = 0;   // the last sample carried a STICK command (XR): -1..1, no tilt pipeline
  let remSeq = null;             // the last roll sample's seq (burst dt, below)
  // PhonePad sends at most every MIN_SAMPLE_GAP_MS (15 ms, js/input/phone-pad.js):
  // the least sender time a seq step can stand for.
  const REMOTE_SAMPLE_GAP_S = 0.015;
  let remoteHaptics = null;      // (ms) => void, forwards vibrate() to the phone

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

  function onOrient(e) {
    // The roll math is TiltRoll.rollDeg (js/input/tilt-roll.js): the same
    // function the PHONE AS CONTROLLER page runs on the phone, so a remote
    // sample and a local reading agree by construction.
    const roll = TiltRoll.rollDeg(e.beta, e.gamma, TiltRoll.screenAngle());
    if (roll === null || remoteSteers()) return; // a live phone owns the shared tilt pipeline
    tiltRaw = roll;
    const n = nowMs();
    const odt = lastOrientMs ? Math.min(0.1, (n - lastOrientMs) / 1000) : 0.016;
    lastOrientMs = n;
    tiltSmoothed = oneEuro(tiltRaw, odt);
    tiltSeen = true; tiltRemote = false;
    if (calibPending) calibrate();
  }

  function attachGyro() {
    if (gyroAttached) return;
    gyroAttached = true;
    window.addEventListener("deviceorientation", onOrient);
  }
  // Leaving tilt stops the sensor stream (and the One-Euro filter) rather than
  // running it all session; attach is idempotent, so re-entering tilt costs nothing.
  function detachGyro() {
    if (!gyroAttached) return;
    gyroAttached = false;
    window.removeEventListener("deviceorientation", onOrient);
    tiltSeen = false;
    if (!tiltRemote) { oeInit = false; lastOrientMs = 0; }   // the next stint filters from its own first reading
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

  /* A ZERO NEEDS A FRESH READING. detachGyro keeps tiltRaw, so switching back
     to TILT mid-session (enableTilt calibrates the moment requestGyro
     resolves, before any new deviceorientation) zeroed on the lean the player
     held when they LEFT tilt, and the car steered off-centre until RECALIBRATE
     or the next lamp 1. While the local sensor is attached but has not read
     yet, the calibration is taken on the first reading that arrives instead.
     (A phone controller's roll and a detached sensor keep the immediate zero.) */
  let calibPending = false;
  function calibrate() {
    if (gyroAttached && !tiltSeen && !remoteSteers()) { calibPending = true; return; }
    calibPending = false;
    tiltZero = tiltRaw;
    oePrev = tiltRaw; oeDPrev = 0; oeInit = true;
    tiltSmoothed = tiltRaw;
    tiltSteerVal = 0;
    tiltSteerT = 0;
  }

  function tiltActive() {
    return steerMode === "tilt" && tiltSeen && (!tiltRemote || remoteSteers());
  }

  function remoteActive() {
    return remoteMs > 0 && (nowMs() - remoteMs) < REMOTE_STALE_MS;
  }
  // STEERS, not merely active: a phone with no motion sensor (a tablet with
  // none, a permission refused) is pedals and buttons only, and must not sit
  // in steer() ahead of the on-screen arrows or a drag on the glass.
  function remoteSteers() { return remoteActive() && (remRoll || remStick); }
  // One sample from the phone: {roll (deg, may be null), thr, brk, held}.
  function remoteSample(s) {
    if (!s) return false;
    const n = nowMs();
    // A STICK (an XR thumbstick, js/xr/xr-input.js) is an analog steer
    // command, not a lean: it used to be dressed up as a roll (steerToTilt) and
    // ride the phone's One-Euro filter, tilt dead zone and 8/s slew, and lamp 1's
    // calibrate() captured whatever deflection was held as the race's zero.
    remStick = typeof s.steer === "number" && isFinite(s.steer);
    remSteer = remStick ? clamp(s.steer, -1, 1) : 0;
    remRoll = !remStick && typeof s.roll === "number" && isFinite(s.roll);
    if (remRoll) {
      tiltRaw = s.roll;
      let odt = lastOrientMs ? Math.min(0.1, (n - lastOrientMs) / 1000) : 0.016;
      // A BURST IS NOT A DUPLICATE. odt is HOST arrival time, so two samples
      // the network delivered in the same millisecond (Wi-Fi power save does
      // this routinely) gave odt 0 and oneEuro() dropped the newer roll. The
      // seq gap says how much SENDER time at least passed between them.
      const seqOk = Number.isInteger(s.seq);
      if (seqOk && remSeq != null) {
        const gap = s.seq - remSeq;
        if (gap >= 1 && gap < 30) odt = Math.max(odt, Math.min(0.1, gap * REMOTE_SAMPLE_GAP_S));
      }
      remSeq = seqOk ? s.seq : null;
      lastOrientMs = n;
      tiltSmoothed = oneEuro(tiltRaw, odt);
      tiltSeen = tiltRemote = true;
    }
    remThr = clamp(+s.thr || 0, 0, 1);
    remBrk = clamp(+s.brk || 0, 0, 1);
    remHeld = s.held | 0;
    remoteMs = n;
    return true;
  }
  // A button EDGE from the phone; the names are the pad's own action names.
  const REMOTE_EDGES = {
    shiftUp: () => { shiftUpPressed = true; },
    shiftDown: () => { shiftDownPressed = true; },
    overtake: () => { overtakePressed = true; },
    boost: () => { boostTogglePressed = true; },
    aero: () => { aeroTogglePressed = true; },
    camera: () => { cameraCyclePressed = true; },
    recover: () => { recoverPressed = true; },
    radio: () => { radioPressed = true; },
    mirror: () => { mirrorPressed = true; },
    calib: () => { calibrate(); },
    pause: () => { if (onPauseCb) onPauseCb(); },
    // THE PHONE AS A MENU PAD. Its wheel shows arrows, SELECT and BACK while
    // the game is not racing (or is paused), and each press lands on the SAME
    // seam the gamepad's d-pad, A and B use while a menu is open: padNavKey /
    // padActivate / padEscape — synthetic keys at the focused control, one
    // mover, never a second focus model. A direction with nothing focused
    // yet seeds focus, exactly as the pad's first press does.
    navUp: () => padMenu.remoteNav("up"), navDown: () => padMenu.remoteNav("down"),
    navLeft: () => padMenu.remoteNav("left"), navRight: () => padMenu.remoteNav("right"),
    navSelect: () => { padMenu.activate(); },
    navBack: () => { padMenu.escape(); },
  };
  function remoteEvent(kind) {
    const fn = REMOTE_EDGES[kind];
    if (!fn) return false;
    fn();
    return true;
  }
  // The link dropped: pedals off at once, and a phone-fed tilt reading must not
  // keep steering a device whose own sensor is not attached.
  function remoteLost() {
    remoteMs = 0; remThr = remBrk = 0; remHeld = 0; remRoll = false; remStick = false; remSteer = 0; remSeq = null;
    if (tiltRemote || !gyroAttached) tiltSeen = false;
  }
  function setRemoteHaptics(fn) {
    const had = !!remoteHaptics;
    remoteHaptics = typeof fn === "function" ? fn : null;
    if (had !== !!remoteHaptics && typeof window.dispatchEvent === "function") window.dispatchEvent(new Event("apexhapticschange"));
  }

  // Drive the FULL tilt pipeline with an explicit timestep instead of wall-clock:
  // feed a raw tilt angle (deg) and dt (s), get back the steer command (-1..1)
  // after the real One-Euro filter, dead zone, MAX_TILT map and slew limiter. Lets
  // a headless harness "play via tilt" and measure how tilt settings actually drive.
  // (The live game still uses the wall-clock onOrient/tiltSteering path untouched.)
  function simTilt(rawDeg, dt) {
    const step = dt > 0 ? dt : 0.016;
    tiltSeen = true; tiltRemote = false;
    tiltRaw = rawDeg;
    tiltSmoothed = oneEuro(rawDeg, step);
    // Same map and same slew the live path uses — deliberately WITHOUT
    // timeScale, because the caller supplies dt and a reproducible run must not
    // depend on whether the game happens to be in hit-stop.
    return tiltSlew(tiltTarget(), step);
  }
  // Reset the tilt filter/slew/zero state so a fresh emulation run starts clean.
  function simTiltReset() {
    oeInit = false; oePrev = 0; oeDPrev = 0; calibPending = false;
    tiltSmoothed = 0; tiltSteerVal = 0; tiltZero = 0; tiltRaw = 0;
  }
  function steerToTilt(cmd) {
    if (Math.abs(cmd) < 1e-4) return 0;
    return clamp(cmd, -1, 1) * (MAX_TILT - DEADZONE) + Math.sign(cmd) * DEADZONE;
  }

  // THE TILT MAP AND THE SLEW, factored out so the live path and the
  // deterministic harness cannot disagree about them.
  //
  // The only difference between the two callers is the one that is supposed
  // to differ: where dt comes from. The harness (simTilt) is handed an explicit
  // dt and takes no hit-stop `timeScale` — hit-stop is a live-loop idea, and
  // autopilot's tilt lap relies on the harness being reproducible.

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

  /* RAMPS ADVANCE PER PHYSICS STEP. game.js calls steer(stepDt) once per
     fixed substep; every ramp below took its dt from the wall clock at call
     time instead, so in a frame with two substeps the first got the whole
     frame's ramp and the second ~0 ms, and a 0-substep frame deferred it —
     the input timeline was quantised to RENDER frames, and "handling
     identical at 30 / 120 fps" did not hold for keys, on-screen arrows, tilt
     or a drag. With a step dt the ramp spends exactly the sim time that step
     covers; hit-stop is already in it (fewer steps), so no timeScale. A call
     without one (a probe, a test) keeps the wall-clock behaviour. */
  let rampDt = null;
  function rampDtSince(lastT, t) {
    if (rampDt != null) return rampDt;
    // timeScale belongs to the LIVE path only — see its declaration.
    return (lastT ? Math.min(0.1, (t - lastT) / 1000) : 0) * timeScale;
  }
  function tiltSteering() {
    const t = nowMs();
    const dt = rampDtSince(tiltSteerT, t);
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
   * UNWINDING IS NOT THE SAME ACT AS BUILDING LOCK. A single
   * `moveToward(val, target, (target !== 0 ? rateIn : RAMP_OUT))` uses the
   * BUILD rate for any non-zero target, so pressing the OPPOSITE arrow crosses
   * centre at the build rate. Measured at 41.7 m/s with ADAPTIVE BUTTONS on
   * (rateIn 3/s vs RAMP_OUT 8/s): full lock to centre took 0.33 s pressing the
   * other way and 0.125 s simply letting go — release, wait, press should never
   * be the fastest way through a chicane.
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
    const dt = rampDtSince(keySteerT, t);
    keySteerT = t;
    // LAST KEY WINS. right − left centred the wheel whenever both were down,
    // which is every left→right roll-over in a chicane (RIGHT pressed before
    // LEFT is released): the car went straight until LEFT came up. Opposite
    // directions held together resolve to the one pressed most recently.
    const target = keyLeft && keyRight ? (keyRightSeq > keyLeftSeq ? 1 : -1)
      : (keyRight ? 1 : 0) - (keyLeft ? 1 : 0);
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

  const bindings = InputBindings.create({
    onKeysChanged() { keyLeft = keyRight = keyThrottle = keyBrake = keyLookBack = false; },
    onPadBindingChanged() { padThrottle = padBrake = false; padThrottleVal = padBrakeVal = 0; },
    activePad,
  });
  const {
    keyBindings, setKeyBinding, clearKeyBinding, setKeyMap, getKeyMap, resetKeys, keysAreDefault, keyLabel, loadLayoutMap,
    padBindings, setPadBinding, clearPadBinding, setPadMap, getPadMap, resetPad, padsAreDefault, padLabel,
    setPadLabelMode, padLabelMode: padLabelModeOf,
  } = bindings;
  let padCaptureCb = null;   // set while a CONTROLS slot waits for a button
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
  /* THE WHEEL WIZARD'S ONE PRIMITIVE. Arm it, ask the player to move the
     control we want, and the first axis that travels far enough from where it
     was resting when we armed is the answer. Comparing against a REST snapshot
     rather than against zero is what makes it work on a wheel at all: a pedal
     axis rests at -1, not 0, so "largest absolute value" would pick an
     untouched pedal every time. */
  /* EVERY connected device is watched, not just the driving one: the
     wizard used to snapshot activePad(), so with an idle standard pad also
     connected it listened to the pad and never saw the wheel being turned.
     Rests are per device (padKey); a device that appears mid-wizard is
     snapshotted on first sight. The answer comes from whichever device moved,
     and that movement is also USE (notePadUse), so the wheel drives after. */
  const AXIS_CAPTURE_MOVE = 0.45;
  function snapshotRests(pads, into) {
    for (let i = 0; pads && i < pads.length; i++) {
      const p = pads[i];
      if (p && p.connected && p.axes && !into.has(padKey(p, i))) into.set(padKey(p, i), Array.prototype.slice.call(p.axes));
    }
    return into;
  }
  function beginAxisCapture(cb) {
    axisCaptureCb = typeof cb === "function" ? cb : null;
    axisCaptureRest = null;
    if (!axisCaptureCb) return;
    axisCaptureRest = snapshotRests(readPads(), new Map());
  }
  function pollAxisCapture(pads) {
    if (!axisCaptureCb || !pads) return;
    if (!axisCaptureRest) { axisCaptureRest = snapshotRests(pads, new Map()); return; }
    let best = -1, bestI = -1, bestRest = 0, bestV = 0;
    for (let j = 0; j < pads.length; j++) {
      const p = pads[j];
      if (!p || !p.connected) continue;
      const rests = axisCaptureRest.get(padKey(p, j));
      if (!rests) { snapshotRests([p], axisCaptureRest); continue; }
      const axes = p.axes || [];
      for (let i = 0; i < axes.length; i++) {
        const rest = typeof rests[i] === "number" ? rests[i] : 0;
        const d = Math.abs((axes[i] || 0) - rest);
        if (d > best) { best = d; bestI = i; bestRest = rest; bestV = axes[i] || 0; }
      }
    }
    if (bestI < 0 || best < AXIS_CAPTURE_MOVE) return;
    const cb = axisCaptureCb;
    axisCaptureCb = null; axisCaptureRest = null;
    cb(bestI, Math.sign(bestV - bestRest) || 1);
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
  // The persisted half: KeyBinds stores the offset as apex26.padRest and hands
  // it back here at boot. Anything but a finite number inside calibratePad's own
  // ±0.5 refusal bound is not a rest position, so it is ignored (0).
  function setPadRest(v) {
    padRestOffset = (typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= 0.5) ? v : 0;
    return padRestOffset;
  }
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
  // A wheel can assign either right-stick slot to a pedal or steering. Those
  // axes belong to driving, including a pedal's -1 rest position.
  function readLookAxis(axes, i) {
    return i === padAxisMap.steer || i === padAxisMap.throttle || i === padAxisMap.brake ? 0 : readPadAxis(axes, i);
  }
  /* Scaled-radial shaping, which on a single axis degenerates to scaled-axial
     — but the RESCALE is the part that matters and the part we lacked. A bare
     `if (|x| < dz) x = 0` leaves a step at the boundary: output jumps from 0
     to dz. Subtracting the dead zone and dividing by the surviving range gives
     a continuous ramp from 0 at the boundary to 1 at full deflection, and
     folding saturation into the same divisor means a worn stick that tops out
     at 0.85 still reaches full lock. */
  /* The rest offset is rescaled PER SIDE before any of that: subtracting it
     and clamping left a stick calibrated at rest 0.15 topping out at 0.85
     toward the drift side (66 % road-wheel lock after STEER_EXPO), while the
     other side still reached 1. Dividing each half by the travel it actually
     has puts both full deflections at exactly ±1. |rest| <= 0.5
     (calibratePad / setPadRest refuse more), so neither divisor is below 0.5. */
  function padAxisShape(raw) {
    const d = raw - padRestOffset;
    const v = clamp(d >= 0 ? d / (1 - padRestOffset) : d / (1 + padRestOffset), -1, 1);
    const a = Math.abs(v);
    if (a <= padDeadzone) return 0;
    const span = Math.max(0.05, 1 - padDeadzone - padSaturation);
    return clamp(Math.sign(v) * (a - padDeadzone) / span, -1, 1);
  }
  // A wheel's pedal axis rests at -1 and travels to +1 (the common convention),
  // so map it to 0..1. Unmapped pedals return 0 and the trigger path wins.
  // Chromium reports an axis as exactly 0 until it has once been seen near
  // rest, so a pedal resting at -1 read 0 -> half throttle AND half brake on a
  // fresh page. Until a pedal reports anything but exactly 0, it is at rest.
  const padPedalSeen = { throttle: false, brake: false };
  function padPedalAxis(axes, which) {
    const i = padAxisMap[which];
    if (i == null) return 0;
    const raw = readPadAxis(axes, i);
    if (raw !== 0) padPedalSeen[which] = true;
    if (!padPedalSeen[which]) return 0;
    const v = raw * padAxisMap.pedalInvert;
    return clamp((v + 1) / 2, 0, 1);
  }
  /* TRIGGER / PEDAL TRAVEL IS A RESCALED DEAD ZONE, NOT A GATE. `v > 0.12 ? v : 0`
     jumped from 0 to 12 % throttle at the threshold (and game.js floored any
     brake at 15 %), removing exactly the light-pressure band trail braking and
     a throttle pick-up live in. The 0.12 still swallows a trigger's resting
     slop; above it travel ramps continuously from 0 to 1. A face button (1)
     and a full pedal stay exactly 1. */
  const PAD_PEDAL_DZ = 0.12;
  function padPedalLevel(v) { return v > PAD_PEDAL_DZ ? clamp((v - PAD_PEDAL_DZ) / (1 - PAD_PEDAL_DZ), 0, 1) : 0; }
  function padDpadSteer(pad) {
    const t = nowMs();
    const dt = (padDpadT ? Math.min(0.1, (t - padDpadT) / 1000) : 0) * timeScale;
    padDpadT = t;
    // LAST PRESS WINS — same contract as keyboardSteer / buttonSteering.
    // Worn pads and some maps briefly report both left+right; right−left
    // cancelled to centre and the ramp unwound mid-corner.
    const left = btnDown(pad, 14), right = btnDown(pad, 15);
    if (left && !padDpadLeftHeld) padDpadLeftSeq = ++padDpadSeq;
    if (right && !padDpadRightHeld) padDpadRightSeq = ++padDpadSeq;
    padDpadLeftHeld = left; padDpadRightHeld = right;
    const target = left && right ? (padDpadRightSeq > padDpadLeftSeq ? 1 : -1)
      : (right ? 1 : 0) - (left ? 1 : 0);
    padDpadVal = digitalStep(padDpadVal, target, dt);
    return padDpadVal;
  }
  // The largest value across an action's bound buttons (a trigger is analog,
  // a face button reads 0/1) and any rising edge across them.
  function padActVal(pad, id) {
    let v = 0;
    for (const b of bindings.padButtons(id)) if (b != null) v = Math.max(v, clamp(btnVal(pad, b), 0, 1));
    return v;
  }
  function padActEdge(pad, id) {
    for (const b of bindings.padButtons(id)) if (b != null && btnEdge(pad, b)) return true;
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
      keyLeft = keyRight = keyThrottle = keyBrake = keyLookBack = false;   // look-back is held too
    }
    /* PAUSE AND BACK ARE COMMANDS, NOT DRIVING CONTROLS, so they sit ABOVE the
        driving gate — but still below a TEXT-FIELD check, because P in a field
        is a letter. BUTTON / SELECT / A focus must NOT block them: after
        SETTINGS → BACK → RESUME (or Escape through that stack), focus often
        stays on a door inside the now-hidden dialog, and the wider `typing`
        flag then refused Escape so the race could not be paused again
        (menu-traversal "DISPLAY page under" pause, 2026-10-01). Driving still
        uses `typing` below so a focused button does not steer. Inside the
        switch below these would be swallowed by the gate's screen list
        (js/ui/layers.js) in the LIGHTING TUNER and free camera — the one place
        their documented all-the-way-out behaviour matters most. */
      const act = bindings.keyAction(e.code);
      const inTextField = tag === "INPUT" || tag === "TEXTAREA" || !!(active && active.isContentEditable);
      if (down && !e.repeat && (act === "pause" || e.code === "Escape") && !inTextField) {
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
    /* A MODIFIER CHORD IS A BROWSER/OS SHORTCUT, NEVER A DRIVING PRESS. Cmd+D,
       Cmd+S, Cmd+Left: on macOS the key-up of a key pressed under Command is
       never delivered, so the latch below would stay on until the key was
       pressed again (the release-all above only clears latches set BEFORE
       Meta went down). Releases still fall through to the clear path. */
    if (down && (e.metaKey || e.ctrlKey)) return;
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
      case "left": if (down && !keyLeft) keyLeftSeq = ++keySeq; keyLeft = down; if (down) e.preventDefault(); break;
      case "right": if (down && !keyRight) keyRightSeq = ++keySeq; keyRight = down; if (down) e.preventDefault(); break;
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
      case "radio": if (edge) radioPressed = true; break;
      case "mirror": if (edge) mirrorPressed = true; break;
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
    // A mouse or pen moving on a touch laptop is not the finger: its coalesced
    // samples overwrote the one touch's x and jumped the drag steering.
    if (e.pointerType !== "touch" || e.isPrimary === false) return;
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
    const dt = rampDtSince(touchSteerT, t);
    touchSteerT = t;
    if (touchActive) { touchSteerVal = dragFilter(touchSteer, dt > 0 ? dt : 0.016); return touchSteerVal; }
    dragOeInit = false;   // a fresh press starts from where the finger lands, not from the last lap
    touchSteerVal = moveToward(touchSteerVal, 0, KEY_RAMP_OUT * dt);
    return touchSteerVal;
  }

  function buttonSteering() {
    const t = nowMs();
    const dt = rampDtSince(btnSteerT, t);
    btnSteerT = t;
    const left = btnSteerLeft ? (1 + (btnSteerLeftVal - 1) * adaptiveMix) : 0;
    const right = btnSteerRight ? (1 + (btnSteerRightVal - 1) * adaptiveMix) : 0;
    // LAST PRESS WINS — mirrors keyboardSteer. right − left centred the wheel
    // whenever both arrows were down, which is every capacitive left→right
    // roll-over in a chicane (RIGHT down before LEFT comes up).
    const target = btnSteerLeft && btnSteerRight
      ? (btnSteerRightSeq > btnSteerLeftSeq ? right : -left)
      : right - left;
    btnSteerVal = digitalStep(btnSteerVal, target, dt);
    return btnSteerVal;
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
  const holdButtons = InputHoldButtons.create({
    clamp,
    beforeReleaseAll(keepLatch) { if (!keepLatch) throttleLatched = false; paintLatch(); },
  });
  const { wireHold, wireTap, holdReleasePointer, holdReleaseAll, holdTargetGone, lostCaptureShouldRelease } = holdButtons;

  // getGamepads(), or null when the API is absent or throws (warned once).
  function readPads() {
    if (typeof navigator === "undefined" || !navigator.getGamepads) return null;
    try { return navigator.getGamepads(); } catch (e) {
      if (!padPollWarned) {
        padPollWarned = true;
        Log.warn("input", `gamepad poll failed: ${(e && e.message) || e}`);
      }
      return null;
    }
  }
  // The pad that drives, or null. (getGamepads() can return holes / stale slots.)
  function activePad() { return pickPad(readPads(), null, wheelFirst()); }
  // A set-up wheel (a saved non-default axis map) or its wizard capturing:
  // between never-used pads the non-standard one ranks first (below).
  function wheelFirst() { return !!axisCaptureCb || !padAxesAreDefault(); }
  /* WHICH PAD DRIVES: THE ONE BEING USED. getGamepads() lists pads in
     connection-slot order, so first-connected-wins let a wheel base, a flight
     stick or an idle second controller in slot 0 ignore the pad in the
     player's hands. The fix that shipped next ranked a "standard" mapping
     first, and that was wrong the other way: a wheel enumerates with mapping
     "" (see AXIS MAP), so an Xbox pad left on its dongle or a DualSense
     charging over USB silently took the car — and the wheel wizard, which
     snapshots the driving pad — away from the wheel being turned.
     So USE ranks first: notePadUse() stamps a pad when a button goes down or
     an axis travels PAD_WAKE from where it last rested, and the most recently
     used pad drives. That is the hysteresis: the driving pad keeps the car
     until another pad is actually USED, so a wheel's pot jitter or a pad
     being picked up off the desk does not flip it. Gamepad.timestamp is not
     the signal — it advances on every noisy reading. Only when no pad has
     been used yet (a fresh page) does the old order decide: standard first,
     then the newest timestamp, then slot order so an idle pair stays stable —
     EXCEPT once a WHEEL is set up (a saved non-default axis map) or its wizard
     is capturing, when the non-standard device ranks first in that tie-break.
     https://developer.mozilla.org/en-US/docs/Web/API/Gamepad/mapping
     https://developer.mozilla.org/en-US/docs/Web/API/Gamepad/timestamp */
  const PAD_WAKE = 0.3;
  const padUse = new Map();    // padKey -> { axes, btn, usedAt }
  function padKey(p, slot) { return (Number.isInteger(p.index) ? p.index : slot) + ":" + p.id; }
  function notePadUse(pads, t) {
    if (!pads) return;
    const live = new Set();
    for (let i = 0; i < pads.length; i++) {
      const p = pads[i];
      if (!p || !p.connected) continue;
      const k = padKey(p, i), axes = p.axes || [], nb = p.buttons ? p.buttons.length : 0;
      live.add(k);
      let rec = padUse.get(k), used = false;
      if (!rec) { rec = { axes: [], btn: [], usedAt: 0 }; padUse.set(k, rec); }
      else {
        for (let a = 0; a < axes.length; a++) {
          if (typeof rec.axes[a] === "number" && Math.abs(readPadAxis(axes, a) - rec.axes[a]) >= PAD_WAKE) used = true;
        }
        for (let b = 0; b < nb; b++) if (btnDown(p, b) && !rec.btn[b]) used = true;
      }
      // The rest reference moves only on use (or first sight), so a slow drift
      // cannot creep past PAD_WAKE a frame at a time without ever counting.
      if (used || !rec.axes.length) for (let a = 0; a < axes.length; a++) rec.axes[a] = readPadAxis(axes, a);
      for (let b = 0; b < nb; b++) rec.btn[b] = btnDown(p, b);
      if (used) rec.usedAt = t > 0 ? t : 1;
    }
    for (const k of padUse.keys()) if (!live.has(k)) padUse.delete(k);
  }
  // `lastUse(pad, slot)` -> ms of its last use, 0 = never. Defaults to the
  // module's own record; the unit test passes its own. `pickPad(pads, true)`
  // still means "prefer the wheel" with the module's own use record.
  function pickPad(pads, lastUse, preferWheel) {
    if (typeof lastUse === "boolean") { preferWheel = lastUse; lastUse = null; }
    if (!pads) return null;
    const useOf = typeof lastUse === "function" ? lastUse
      : (p, i) => { const r = padUse.get(padKey(p, i)); return r ? r.usedAt : 0; };
    let best = null, bestU = 0, bestStd = false, bestT = -Infinity;
    for (let i = 0; i < pads.length; i++) {
      const p = pads[i];
      if (!p || !p.connected) continue;
      const u = +useOf(p, i) || 0;
      const std = (p.mapping === "standard") !== !!preferWheel;   // "ranks first", flipped for a wheel
      const t = Number.isFinite(p.timestamp) ? p.timestamp : 0;
      const better = !best || u > bestU ||
        (u === bestU && ((std && !bestStd) || (std === bestStd && t > bestT)));
      if (better) { best = p; bestU = u; bestStd = std; bestT = t; }
    }
    return best;
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
  // the DEFAULTS in InputBindings — SETTINGS › CONTROLS › CONTROLLER
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
  //                                  see InputPadMenu — the pad has none)
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
  let remoteWas = false;        // the phone was live on the previous poll
  function pollGamepad() {
    haptics.flush();   // opens the frame for the rumble mixer: one effect per frame (js/input/haptics.js)
    // A PHONE CONTROLLER GOING QUIET is the same interruption as an unplugged
    // pad (a call, an app switch, a flat battery): its pedals already zero at
    // REMOTE_STALE_MS, but the race ran on with the car coasting into a wall.
    const rAct = remoteActive();
    if (remoteWas && !rAct && onPadLostCb) { try { onPadLostCb(); } catch (_) { /* the game's handler must not break polling */ } }
    remoteWas = rAct;
    if (!padConnected) {
      // Recovery re-probe, ~1 s throttle. gamepadconnected fires only on
      // connection / first input (MDN) — it never re-fires for a pad that is
      // still plugged in, so a transient getGamepads() hole (focus loss, a
      // SECOND pad's unplug, a stale slot) would kill gamepad input for the
      // rest of the session. Polling is the only recovery path; the throttle
      // keeps getGamepads()'s per-call array allocation off the frame budget.
      if (++_padReprobe < 60) return;
      _padReprobe = 0;
      if (!activePad()) return;
      padConnected = true;   // fall through and read it this frame
    }
    const pads = readPads();
    notePadUse(pads, nowMs());
    const pad = pickPad(pads, null, wheelFirst());
    if (pad) {
      if (!padPrevByIndex.has(pad.index)) padPrevByIndex.set(pad.index, []);
      padPrevButtons = padPrevByIndex.get(pad.index);
    }
    if (!pad) {
      padConnected = false;
      padSteer = 0; padThrottle = false; padBrake = false;
      padThrottleVal = 0; padBrakeVal = 0;
      padSteerAnalog = false; padLookBack = false;
      lookStickX = 0; lookStickY = 0;
      padDpadVal = 0; padDpadT = 0;
      padDpadLeftHeld = padDpadRightHeld = false;
      padDpadSeq = padDpadLeftSeq = padDpadRightSeq = 0;
      if (padPrevButtons.length) padPrevButtons.length = 0;
      padPrevKey = null;
      padPrevByIndex.clear();
      padMenu.reset();
      if (inputSource === "controller") inputSource = null;
      return;
    }
    padConnected = true;
    // EDGES ARE PER DEVICE. padPrevButtons holds the LAST pad's buttons, so
    // when another pad takes over, a button already held on it would read as
    // a fresh press (a boost, a shift, a camera cut). Reseed from the new
    // pad. Not on first connection: the press that woke a pad is a real one.
    const key = padKey(pad, Array.prototype.indexOf.call(pads, pad));
    if (padPrevKey !== null && key !== padPrevKey) {
      const nb = pad.buttons ? pad.buttons.length : 0;
      padPrevButtons.length = nb;
      for (let i = 0; i < nb; i++) padPrevButtons[i] = btnDown(pad, i);
    }
    padPrevKey = key;
    // The indices below are the W3C "standard" layout and nothing here remaps.
    // A pad the browser could not map reports mapping "" and shuffles them —
    // log it once so a "throttle is on LB" report has its cause on record.
    if (!padMapWarned && pad.mapping !== "standard") {
      padMapWarned = true;
      Log.warn("input", `gamepad mapping "${pad.mapping}" is not "standard": button/axis indices may not match`);
    }
    const axes = pad.axes || [];
    const stick = padAxisShape(readPadAxis(axes, padAxisMap.steer) * padAxisMap.steerInvert);
    // Right stick (standard mapping axes 2/3) → free-look. Menu nav still uses
    // both sticks via padNavDir; free-look is only consumed in-race by CamFeel.
    // ONLY ON A STANDARD PAD, and never an axis the wheel wizard took: a wheel
    // (mapping "") puts whatever its maker chose on 2/3 — usually a pedal that
    // RESTS at -1, which held the cockpit camera at full yaw — and a mapped
    // throttle/brake/steer axis is a control, not a stick (pad-menu's
    // padNavDirOf skips the mapped pedals for the same reason).
    {
      const lookAxis = (i) => pad.mapping === "standard" ? readLookAxis(axes, i) : 0;
      const rx = lookAxis(2), ry = lookAxis(3);
      const mag = Math.hypot(rx, ry);
      if (mag < LOOK_STICK_DEAD) { lookStickX = 0; lookStickY = 0; }
      else {
        const t = (mag - LOOK_STICK_DEAD) / (1 - LOOK_STICK_DEAD);
        lookStickX = (rx / mag) * t;
        lookStickY = (ry / mag) * t;
      }
    }
    // THE D-PAD IS A DIGITAL SOURCE AND MUST RAMP LIKE ONE: `ax = ±1` outright
    // is a teleport to full lock (at 300 km/h, undriveable), and XAG 107
    // requires the digital path to WORK. It shares the arrows' digitalStep ramp
    // exactly, so ADAPTIVE BUTTONS reaches it too.
    const dpad = padDpadSteer(pad);
    padSteerAnalog = Math.abs(stick) > 0.001;
    padSteer = padSteerAnalog ? stick : dpad;
    // pedals: analog triggers, a wheel's pedal AXES, or the A/B face buttons.
    padThrottleVal = padPedalLevel(Math.max(padActVal(pad, "throttle"), padPedalAxis(axes, "throttle")));
    padBrakeVal = padPedalLevel(Math.max(padActVal(pad, "brake"), padPedalAxis(axes, "brake")));
    padThrottle = padThrottleVal > 0;
    padBrake = padBrakeVal > 0;
    // A connected pad is not active input. Record only a real deflection or a
    // newly pressed button, so an idle Bluetooth pad cannot steal Help/coach
    // wording from the keyboard or touch player.
    let padActive = Math.abs(stick) > 0.05 || Math.abs(dpad) > 0.05 ||
      padThrottleVal > 0 || padBrakeVal > 0;
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
      padSteerAnalog = false; padLookBack = false; padMenu.releaseDirection();
      pollAxisCapture(pads);
    } else if (padCaptureCb) {
      // A CONTROLS slot is waiting for a button: the first rising edge is its
      // answer and the frame ends here — the press must not also walk the
      // menu, pause, or drive. Pedals and steer were latched above; unlatch.
      padThrottle = padBrake = false; padThrottleVal = padBrakeVal = 0; padSteer = 0;
      padSteerAnalog = false; padLookBack = false;
      padMenu.releaseDirection();
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
        // …and the STEERING: a friend race keeps simulating under the pause menu, and the stick or d-pad
        // that moves through it was also steering the car at up to full lock.
        padSteer = 0; padSteerAnalog = false; padDpadVal = 0;
        padMenu.poll(pad);
      } else {
        padMenu.reset();   // fresh hold-timer the next time a menu opens
        // edge-triggered actions reuse the same latches the keyboard sets.
        if (padActEdge(pad, "boost")) boostTogglePressed = true;
        if (padActEdge(pad, "overtake")) overtakePressed = true;
        if (padActEdge(pad, "aero")) aeroTogglePressed = true;
        if (padActEdge(pad, "shiftUp")) shiftUpPressed = true;
        if (padActEdge(pad, "shiftDown")) shiftDownPressed = true;
        if (padActEdge(pad, "camera")) cameraCyclePressed = true;
        if (padActEdge(pad, "recover")) recoverPressed = true;
        if (padActEdge(pad, "radio")) radioPressed = true;
        if (padActEdge(pad, "mirror")) mirrorPressed = true;
        padLookBack = padActVal(pad, "lookBack") > 0.5;
      }
    }
    const n = pad.buttons ? pad.buttons.length : 0;
    padPrevButtons.length = n;
    for (let i = 0; i < n; i++) padPrevButtons[i] = btnDown(pad, i);
  }

  const padMenu = InputPadMenu.create({ btnDown, btnEdge, nowMs, getPadAxisMap: () => padAxisMap });

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
  const haptics = InputHaptics.create({
    clamp, activePad, padConnected: () => padConnected, remoteActive,
    remoteHaptics: () => remoteHaptics, now: nowMs,
  });
  const { setHaptics, setTriggerHaptics, triggerHapticsEnabled, hapticsSupported,
    triggerRumbleSupported, primeHaptics, vibrate, rumble } = haptics;

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

  function steer(stepDt) {
    rampDt = (typeof stepDt === "number" && stepDt > 0 && isFinite(stepDt)) ? Math.min(0.1, stepDt) : null;
    try { return steerNow(); } finally { rampDt = null; }
  }
  function steerNow() {
    const k = keyboardSteer();
    if (keyLeft || keyRight || Math.abs(k) > 0.001) return k;
    // The d-pad half of padSteer is digital and already ramped — it must not
    // also be curved and speed-scaled as if it were a deflection.
    if (padSteerActive()) return padSteerAnalog ? analogShape(padSteer, "pad") : padSteer;
    // A paired phone WITH a sensor: the tilt pipeline fed by remoteSample,
    // whatever the local mode. Pedals-only phones fall through to it.
    if (remoteSteers()) return remStick ? analogShape(remSteer, "pad") : analogShape(tiltSteering(), "tilt");
    // On-screen buttons and the drag wheel. A friend race keeps simulating
    // under the pause menu; the pad already zeroes itself while a menu is open.
    // Gate on anyOpen(), NOT navOpen(): navOpen() is also true on the title
    // #overlay (gate:false) so the pad can walk the doors — that must not
    // mute the on-screen GAS / drag wheel on a freshly loaded page (steering
    // latch + touch-pedals specs). Do not clear the finger — the hold should
    // still be there when the menu closes. Keyboard, tilt and the pad are
    // unchanged.
    if (steerMode === "buttons") return navBlocksTouch() ? 0 : buttonSteering();
    if (tiltActive()) return analogShape(tiltSteering(), "tilt");
    return navBlocksTouch() ? 0 : analogShape(touchSteering(), "touch");
  }

  const REMOTE_PEDAL_ON = 0.1;   // travel below this is a resting thumb, not a press
  function remoteThrottle() { return remoteActive() && remThr > REMOTE_PEDAL_ON; }
  function remoteBrake() { return remoteActive() && remBrk > REMOTE_PEDAL_ON; }
  // anyOpen() = pause/settings/sheets. navOpen() also covers title #overlay.
  function navBlocksTouch() { return !!(window.UiLayers && window.UiLayers.anyOpen()); }

  function throttle() {
    return keyThrottle || (!navBlocksTouch() && btnThrottle) || padThrottle || remoteThrottle();
  }

  function braking() {
    return keyBrake || (!navBlocksTouch() && btnBrake) || padBrake || remoteBrake();
  }

  // 0..1 pedal travel. A KEY is digital and is therefore always full travel; an
  // analog trigger and an on-screen pedal both report how far they actually are.
  // Priority matches throttle()/braking(): whichever source is pressed wins, and
  // the keyboard wins over everything so a desktop player is never modulated by
  // a stray pad axis.
  function throttleLevel() {
    if (keyThrottle) return 1;
    if (btnThrottle && !navBlocksTouch()) return throttleLatch && throttleLatched ? 1 : btnThrottleVal;
    if (remoteThrottle()) return remThr;
    return padThrottleVal;
  }
  function brakeLevel() {
    if (keyBrake) return 1;
    if (btnBrake && !navBlocksTouch()) return btnBrakeVal;
    if (remoteBrake()) return remBrk;
    return padBrakeVal;
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

  function consumeRadio() {
    const v = radioPressed;
    radioPressed = false;
    return v;
  }
  function consumeMirror() {
    const v = mirrorPressed;
    mirrorPressed = false;
    return v;
  }

  /* HELD, not edged: the mirror is only up while the control is down.
     KEY AND PAD ONLY. There was an on-screen LOOK button in the tap column too;
     it was removed on request — the dock had grown to five buttons in one thumb
     column once PIT landed beside it, and a glance over the shoulder is the
     control that least deserves a permanent seat there. */
  function lookingBack() { return keyLookBack || padLookBack || (remoteActive() && !!(remHeld & REMOTE_HELD.lookBack)); }

  /* FREE-LOOK inputs for CamFeel. lookStick() is the latest right-stick sample
     (−1..1); consumeLookMouse() returns and clears RMB-drag pixel deltas. */
  function lookStick() { return { x: lookStickX, y: lookStickY }; }
  // RMB is DOWN: a glance held still is still a glance (CamFeel holds the
  // angle instead of recentring on a frame with no mouse delta).
  function lookMouseHeld() { return lookMouseDown; }
  function consumeLookMouse() {
    const o = { dx: lookMouseDx, dy: lookMouseDy };
    lookMouseDx = 0; lookMouseDy = 0;
    return o;
  }

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
  /* LANDSCAPE LOCK, the touch half of the same fullscreen request. Android
     Chrome honours screen.orientation.lock() only while the document is in
     fullscreen (or an installed fullscreen PWA), so a race entered through the
     pause menu's FULLSCREEN row stops rotating into portrait when the phone
     tilts — tilt steering tips the device exactly that way. Touch-only: a
     desktop has no orientation to lock. iPhone Safari has neither element
     fullscreen nor lock() and keeps its rotate prompt; the rejection there (and
     anywhere unsupported) is swallowed.
     https://developer.mozilla.org/en-US/docs/Web/API/ScreenOrientation/lock */
  let _landscapeLocked = false;
  function lockLandscape() {
    const o = typeof screen !== "undefined" && screen.orientation;
    if (!o || typeof o.lock !== "function" || !touchControlsNeeded()) return Promise.resolve(false);
    return Promise.resolve(o.lock("landscape")).then(() => (_landscapeLocked = true)).catch(() => false);
  }
  function unlockLandscape() {
    if (!_landscapeLocked) return;
    _landscapeLocked = false;
    const o = typeof screen !== "undefined" && screen.orientation;
    if (o && typeof o.unlock === "function") { try { o.unlock(); } catch (_) { /* not locked */ } }
  }

  function setSteerMode(m) {
    steerMode = (m === "buttons" || m === "touch") ? m : "tilt";
    try { Log.info("input", `steerMode ${steerMode}`); } catch (_) { /* Log absent in isolated VM */ }
    if (steerMode !== "buttons") {
      btnSteerLeft = btnSteerRight = false;   // drop held buttons
      btnSteerLeftVal = btnSteerRightVal = 0;
      btnSteerVal = 0; btnSteerT = 0;
      btnSteerSeq = btnSteerLeftSeq = btnSteerRightSeq = 0;
    }
    if (steerMode !== "touch") {
      touches.clear();
      touchSteer = 0; touchActive = false; touchSteerVal = 0; touchSteerT = 0;
    }
    if (steerMode !== "tilt") detachGyro();
  }

  // TOUCH SENSITIVITY: the drag mode's touchRangeFrac (read by touchRangePx()),
  // exposed as a slider per docs/research/DRIVING-CONTROLS-RESEARCH.md. Bounds:
  // 6 % of the long edge is a flick, 24 % is a deliberate sweep; 12 % is the
  // default.
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

  // A ROTATION KEEPS THE ZERO. onOrient already remaps into screen space by
  // angle, so the stored neutral is still right; re-sampling it 300 ms later
  // made whatever lean the player held mid-hairpin the new "straight". Only the
  // filter restarts, so the new axis does not ease in from the old one's value.
  function onScreenRotate() {
    oeInit = false; tiltSteerVal = 0;
  }

  // Specs must wait for ready() — NOT for Input.steer / Input.simTilt existing.
  // Those are on the IIFE return value the moment input.js evaluates, which is
  // BEFORE game.js reaches Input.init() (and the boot Input.setSteerMode that
  // follows it in the same sync stretch). Waiting only for the API object is
  // how tilt-pipeline's live path and touch-buttons' pointerdown presses read
  // as 0 on a loaded CI runner: the test set tilt / pressed a hold button, then
  // boot finished and stomped the mode / wired the listeners after the fact.
  // CI run 36638762096 (#6199) failed three assertions with exactly that shape
  // (live-vs-sim diff = the default map at 12°, button pumps at 0). ready flips
  // at the END of init; by the time a Playwright poll can observe it, the sync
  // boot setSteerMode after init has also run. Exported as ready() (a function,
  // not a getter) so a bare `Input.ready` truthiness check cannot pass on the
  // unbound method before init — same contract as the concurrent touch-pedals fix.
  let ready = false;

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
    // FREE-LOOK mouse: hold right button over the game canvas and drag.
    // Button 2 only — left click is UI / no look; avoids fighting menus.
    if (canvas && canvas.addEventListener) {
      canvas.addEventListener("contextmenu", function (e) { e.preventDefault(); });
      canvas.addEventListener("pointerdown", function (e) {
        if (e.button === 2) {
          lookMouseDown = true;
          try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* already gone */ }
          e.preventDefault();
        }
      });
      canvas.addEventListener("pointermove", function (e) {
        if (!lookMouseDown) return;
        lookMouseDx += e.movementX || 0;
        lookMouseDy += e.movementY || 0;
      });
      const lookUp = function (e) {
        if (e.button === 2 || e.type !== "pointerup") {
          lookMouseDown = false;
          lookMouseDx = 0; lookMouseDy = 0;
        }
      };
      canvas.addEventListener("pointerup", lookUp);
      canvas.addEventListener("pointercancel", function () {
        lookMouseDown = false; lookMouseDx = 0; lookMouseDy = 0;
      });
      canvas.addEventListener("lostpointercapture", function () {
        lookMouseDown = false;
      });
    }
    window.addEventListener("blur", reset);
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) reset();
    });
    // Safety net for the hold buttons (see InputHoldButtons): any pointer that lifts or
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
    // id then sits in a hold set indefinitely (PE3 only requires uniqueness
    // among ACTIVE pointers, so the id may or may not be recycled later; the
    // fix does not depend on it). Worse,
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
      if (e.touches.length === 0) holdReleaseAll(true);
    }, { capture: true, passive: true });
    window.addEventListener("touchcancel", function (e) {
      if (e.touches.length === 0) holdReleaseAll(true);
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
    wireHold("btn-steer-left", function (v) {
      if (v && !btnSteerLeft) btnSteerLeftSeq = ++btnSteerSeq;
      btnSteerLeft = v; if (!v) btnSteerLeftVal = 0;
    }, function (l) { btnSteerLeftVal = l; }, { axis: "x", dir: -1 });
    wireHold("btn-steer-right", function (v) {
      if (v && !btnSteerRight) btnSteerRightSeq = ++btnSteerSeq;
      btnSteerRight = v; if (!v) btnSteerRightVal = 0;
    }, function (l) { btnSteerRightVal = l; }, { axis: "x", dir: 1 });

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
      padPedalSeen.throttle = padPedalSeen.brake = false;   // a new connection re-reads its pedals from rest
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
      padDpadLeftHeld = padDpadRightHeld = false;
      padDpadSeq = padDpadLeftSeq = padDpadRightSeq = 0;
      padPrevButtons.length = 0;
      if (e.gamepad) padPrevByIndex.delete(e.gamepad.index);
      padMenu.reset();
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
    ready = true;
  }

  function reset() {
    touches.clear();
    hideDragAnchor();
    touchSteer = 0; touchActive = false; touchSteerVal = 0; touchSteerT = 0;
    timeScale = 1;   // the loop re-reports it next frame; never leave it stalled slow
    // Clear the hold buttons THROUGH their closures (ghost-pointer purge), not
    // just the exported booleans — see InputHoldButtons for why both must happen.
    holdReleaseAll();
    btnThrottle = btnBrake = false;
    btnThrottleVal = btnBrakeVal = 0;
    btnSteerLeft = btnSteerRight = false;
    btnSteerLeftVal = btnSteerRightVal = 0;
    btnSteerVal = 0; btnSteerT = 0;
    btnSteerSeq = btnSteerLeftSeq = btnSteerRightSeq = 0;
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
    padDpadLeftHeld = padDpadRightHeld = false;
    padDpadSeq = padDpadLeftSeq = padDpadRightSeq = 0;
    keyLookBack = false;
    lookStickX = 0; lookStickY = 0;
    lookMouseDx = 0; lookMouseDy = 0; lookMouseDown = false;
    remThr = remBrk = 0; remHeld = 0;   // the phone re-sends within 100 ms if still held
    recoverPressed = false;
    radioPressed = false;
    mirrorPressed = false;
    // padPrevButtons is deliberately KEPT: emptying it on a window blur made
    // every button merely held across the blur a rising edge on the next poll
    // (boost toggled, a gear grabbed, the camera cycled). The next poll
    // re-seeds it from the pad as it always has.
    padMenu.reset();
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
  /* THE DRIVE EDGES ALONE, at lights-out (game.js). Every consumer of these
     runs only once the car steps, so a press during the countdown stayed latched
     and fired on the first green frame: RECOVER re-placed the car at rescue
     speed, a shift-up started it in 2nd. Camera and radio are left alone —
     those work on the grid and are consumed there. The MIRROR is not: it is
     neither drawn nor consumed during the countdown, so a grid tap toggled it
     a few seconds into the race. */
  function clearDriveEdges() {
    overtakePressed = false;
    boostTogglePressed = false;
    aeroTogglePressed = false;
    shiftUpPressed = false;
    shiftDownPressed = false;
    recoverPressed = false;
    mirrorPressed = false;
  }
  function clearEdges() {
    clearDriveEdges();
    cameraCyclePressed = false;
    radioPressed = false;
  }

  function debugState() {
    const active = document.activeElement;
    const tag = active && active.tagName || "";
    const interactive = ["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A"].includes(tag) || !!(active && active.isContentEditable);
    const hudControl = !!(active && active.matches && active.matches("#btn-cam, #pausebtn, #hud-restore, #pc-restore, .touchbtn"));
    return {
      steerMode,
      gate: { anyOpen: !!menuOverlayOpen(), typing: interactive && !hudControl, hudControl,
              focus: { id: active && active.id || null, tag, editable: !!(active && active.isContentEditable) } },
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
      hapticScale: haptics.scale(),
      lookingBack: lookingBack(),
      remote: { active: remoteActive(), steers: remoteSteers(), roll: tiltRaw, stick: remStick ? remSteer : null,
                thr: remThr, brk: remBrk, held: remHeld,
                ageMs: remoteMs ? Math.round(nowMs() - remoteMs) : null },
      canvasTouches: touches.size,
      holdPointers: holdButtons.pointerCounts(),   // pressed-pointer count per hold button
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
    consumeRadio,
    consumeMirror,
    lookingBack,
    lookStick,
    lookMouseHeld,
    consumeLookMouse,
    lockEscape, unlockEscape, lockLandscape, unlockLandscape,
    tiltActive,
    remoteSample, remoteEvent, remoteLost, remoteActive, remoteSteers, setRemoteHaptics,
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
    setTriggerHaptics,
    triggerHapticsEnabled,
    triggerRumbleSupported,
    vibrate,
    hapticsSupported,
    setThrottleLatch(on) { throttleLatch = !!on; throttleLatched = false; btnThrottle = false; paintLatch(); },
    // Every race starts OFF: a latched GAS from the last race (finish, QUIT, RESTART) launched the car at lights-out untouched.
    dropLatch() { if (throttleLatched) { throttleLatched = false; btnThrottle = false; paintLatch(); } },
    throttleLatched: () => throttleLatch && throttleLatched,
    primeHaptics,
    setPadLabelMode, padLabelMode: padLabelModeOf,
    setPadAxisMap, getPadAxisMap, padAxesAreDefault, beginAxisCapture, calibratePad, padRest, setPadRest,
    touchControlsNeeded,
    pickPad,
    onPointerKindChange,
    clearEdges, clearDriveEdges,
    get padConnected() { return padConnected; },
    get gyroSeen() { return tiltSeen; },
    get gyroDenied() { return gyroDenied; },
    get gyroHardDenied() { return gyroHardDenied; },
    // True once init() has finished wiring listeners. Specs wait on ready() —
    // see the ready declaration. Not cleared by reset(); a page load is one init.
    ready: () => ready,
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
