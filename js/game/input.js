/*
 * Input: keyboard / gamepad / tilt / touch for Apex 26.
 *
 * Steering sources, by priority: keyboard (held or still returning to
 * center) > gamepad (a connected pad with its stick deflected) > tilt
 * (enabled and delivering fresh data) > touch (on-screen steer buttons or
 * lower-screen halves).
 *
 * Gamepad uses the W3C Gamepad API ("standard" mapping). It has no change
 * events, so poll() must be called once per frame from the game loop; it
 * works on desktop and iOS 14.5+ Safari with a paired PS5/Xbox/MFi pad.
 *
 * Tilt comes from the DeviceOrientationEvent API. Which euler angle maps
 * to a physical left-right tilt depends on how the screen is rotated, so
 * we remap by screen.orientation.angle. iOS 13+ gates the sensor behind
 * DeviceOrientationEvent.requestPermission(), which may only be called
 * from a user gesture — requestGyro() must be invoked from the start tap.
 *
 * No DOM access at module load time: everything is wired inside init()
 * so the script can be loaded headless.
 */
"use strict";

const Input = (function () {
  // Tilt mechanics ported verbatim from the driving-game (Neon Drift) build.
  let MAX_TILT = 36;          // degrees of tilt for full steering lock (higher = less sensitive)
  let DEADZONE = 2.5;         // degrees ignored around neutral — fixed small; not a player knob
  const TILT_SLEW = 8;        // fixed safety cap (steer units/s): a last guard so a hand jolt
                              // can't snap the wheel. Smoothing itself is the One-Euro filter.
  // THE SHARED DIGITAL STEER RAMP. Any steer command that arrives as a SWITCH
  // rather than as a position — an arrow key, an on-screen arrow button, the
  // moment a finger leaves the glass — has to become an angle over time, or the
  // wheel goes to the stop in one tick. The keyboard has always had this; the
  // on-screen arrows and canvas touch did not, which is why those two modes
  // steered like a light switch. All three now share these rates.
  let KEY_RAMP_IN = 6;        // steer units/s toward full lock
  let KEY_RAMP_OUT = 8;       // steer units/s back to centre (quicker: releasing
                              // is a request to stop, and should be answered)
  const DEG = Math.PI / 180;

  // keyboard
  let keyLeft = false;
  let keyRight = false;
  let keyBrake = false;
  let keyThrottle = false;
  let keySteerVal = 0;        // ramped -1..1
  let keySteerT = 0;          // last ramp timestamp, ms (0 = unset)

  // edge-triggered: overtake (X / OT tap), boost toggle (Space / BOOST tap)
  let overtakePressed = false;
  let boostTogglePressed = false;
  // edge-triggered ACTIVE AERO toggle (Z key / d-pad up / AERO tap). Named for
  // the modes it swaps between: Z-mode (downforce) and X-mode (low drag).
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
  let padSteer = 0;            // -1..1 from left stick / d-pad
  let padThrottle = false;
  let padBrake = false;
  // Analog pedal travel, kept alongside the boolean. The triggers report 0..1 and
  // the physics rewards MODULATION — trail-braking is a documented core mechanic
  // (the friction ellipse hands grip back to the front tyres as you ease off) —
  // but thresholding the trigger to a boolean here threw all of that away, so a
  // pad driver could only stamp or lift. throttle()/braking() stay boolean for
  // every existing caller; throttleLevel()/brakeLevel() expose the travel.
  let padThrottleVal = 0;
  let padBrakeVal = 0;
  let padPrevButtons = [];     // previous frame's pressed state, for rising edges
  const PAD_DEADZONE = 0.14;   // left-stick centre slop (ignored, then re-scaled)

  // canvas touch steering: identifier -> { anchorX, x, seq }
  // `seq` is a monotonic stamp of when this touch last spoke — see
  // recomputeTouchSteer for why insertion order cannot answer that question.
  const touches = new Map();
  let touchSeq = 0;
  let touchSteer = 0;      // the winning touch's drag, -1..1
  let touchActive = false; // is any finger on the glass (vs. ramping back home)
  let touchSteerVal = 0;   // what steer() emits: touchSteer while held, ramped on release
  let touchSteerT = 0;     // last ramp timestamp, ms

  // on-screen buttons (multi-pointer safe via per-button pointer sets)
  let btnThrottle = false;
  let btnBrake = false;
  // Pedal travel for the on-screen pedals, the touchscreen's answer to an
  // analog trigger. 1 on a plain press (the old behaviour, unchanged for anyone
  // who just taps); see PEDAL_TRAVEL_PX for the ease-off gesture.
  let btnThrottleVal = 0;
  let btnBrakeVal = 0;
  let btnSteerLeft = false;
  let btnSteerRight = false;
  let btnSteerVal = 0;     // ramped -1..1 (the arrows are a keyboard with fat keys)
  let btnSteerT = 0;       // last ramp timestamp, ms

  // tilt
  let tiltRaw = 0;            // latest remapped tilt, degrees (raw, like Neon Drift)
  let tiltZero = 0;           // calibrated neutral
  let tiltSeen = false;       // we have actually received sensor data
  let gyroAttached = false;
  let gyroDenied = false;
  // single source of truth for how the player steers: "tilt" | "buttons" | "touch"
  let steerMode = "tilt";
  let tiltSmoothed = 0;       // One-Euro-filtered tilt angle (deg)
  let lastOrientMs = 0;
  // One-Euro adaptive low-pass filter (Casiez, Roussel & Vogel 2012) on the tilt
  // roll angle. The cutoff frequency RISES with how fast the angle is changing:
  // when the hand is still it filters hard (kills jitter on straights), when the
  // hand moves fast it barely filters (no lag mid-corner). This replaces the old
  // fixed EMA + slew-rate limiter, which had to trade one for the other.
  //   minCutoff : Hz at rest — lower = smoother/steadier (the SMOOTHING slider)
  //   beta      : how much the cutoff opens up with speed — higher = more responsive
  let OE_MIN_CUTOFF = 1.2;    // Hz — THE smoothing knob (set by the SMOOTHING slider)
  let OE_BETA = 0.10;
  const OE_DCUTOFF = 1.0;     // Hz, cutoff for the derivative estimate
  let oePrev = 0, oeDPrev = 0, oeInit = false;
  // Final output stage: a FIXED slew-rate cap (TILT_SLEW units/s) as a last guard
  // against a hand jolt; the One-Euro min-cutoff above is the player SMOOTHING knob.
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

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  // One-Euro filter: smoothing factor for a given cutoff frequency and timestep.
  function oeAlpha(cutoff, dt) {
    const r = 2 * Math.PI * cutoff * dt;
    return r / (r + 1);
  }
  // Filter a raw angle sample (deg) given the elapsed time (s). Adaptive: heavy
  // smoothing when slow, light when fast — the standard fix for "jittery vs laggy".
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

  /* ---------------- tilt ---------------- */

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
    // Build the gravity direction in device coordinates from the Euler angles
    // (independent of alpha/compass). Steering off a gravity-based ROLL — rather
    // than the raw beta/gamma angle — keeps the response smooth and consistent
    // however upright the phone is held: raw Euler angles jump and rescale near
    // gimbal lock (phone near vertical), which made tilt "act differently" when
    // held up vs laid flat. At flat the roll equals gamma/beta, so the familiar
    // feel is preserved.
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

  // Must be called from a user gesture (iOS permission prompt).
  // Resolves true if tilt data can be expected.
  function requestGyro() {
    if (typeof DeviceOrientationEvent === "undefined") {
      gyroDenied = true;
      return Promise.resolve(false);
    }
    if (typeof DeviceOrientationEvent.requestPermission === "function") {
      try {
        return DeviceOrientationEvent.requestPermission()
          .then(res => {
            if (res === "granted") {
              attachGyro();
              return true;
            }
            gyroDenied = true;
            return false;
          })
          .catch(() => {
            gyroDenied = true;
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
    // Capture the true neutral with no clamp — a landscape grip's neutral
    // angle is often well past ±35°, and clamping it leaves a residual offset
    // that pulls the car to one side. Recalibrated on orientation change too.
    tiltZero = tiltRaw;
    // Reset One-Euro state so the first post-calibration sample sees dx=0,
    // not a giant jump from the pre-calibration oePrev → avoids a derivative spike.
    oePrev = tiltRaw; oeDPrev = 0; oeInit = true;
    tiltSmoothed = tiltRaw;
    tiltSteerVal = 0;
    tiltSteerT = 0;
  }

  function tiltActive() {
    return steerMode === "tilt" && tiltSeen;
  }

  // ---- deterministic tilt emulation (test/autopilot harness) ----
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
  // Invert the dead-zone + MAX_TILT map: the raw tilt angle (deg) needed to command
  // a given steer target (-1..1). Used to convert an autopilot steer into a tilt.
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

  // Calibrated, filtered tilt angle -> steer target (-1..1), with a soft dead
  // zone subtracted rather than clamped, so there is no step at its edge.
  function tiltTarget() {
    let d = tiltSmoothed - tiltZero;
    if (Math.abs(d) < DEADZONE) return 0;
    d -= Math.sign(d) * DEADZONE;
    return clamp(d / (MAX_TILT - DEADZONE), -1, 1);
  }

  // Slew-rate limit toward the target so the command cannot jump even if the
  // hand does. Releasing is 1.6x faster than tightening: letting go is a request
  // to stop, and should be answered.
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

  /* ---------------- keyboard ---------------- */

  function moveToward(v, target, step) {
    return v + clamp(target - v, -step, step);
  }

  // Advances the ramp on every call. steer() is polled once per PHYSICS STEP
  // (js/game.js calls it from inside the fixed-step loop), so at 30 fps two
  // calls share one frame's elapsed time and at 120 fps a frame may make none —
  // wall-clock deltas keep the aggregate rate right through both. timeScale
  // folds in hit-stop; see its declaration.
  function keyboardSteer() {
    const t = nowMs();
    const dt = (keySteerT ? Math.min(0.1, (t - keySteerT) / 1000) : 0) * timeScale;
    keySteerT = t;
    const target = (keyRight ? 1 : 0) - (keyLeft ? 1 : 0);
    if (target !== 0) {
      keySteerVal = moveToward(keySteerVal, target, KEY_RAMP_IN * dt);
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
  function menuOverlayOpen() {
    // #overlay (the main menu) is deliberately NOT here. Nothing is driving while
    // it is up, so a latched key is harmless, and several input tests dispatch
    // keys straight at a freshly-loaded page — gating those on the title screen
    // being closed would make the guard the thing under test.
    const el = document.querySelector(
      "#pausemenu:not([hidden]),#pmsettings:not([hidden]),#select:not([hidden])," +
      "#teampicker:not([hidden]),#race-settings:not([hidden]),#standings:not([hidden])," +
      "#results:not([hidden]),#customize:not([hidden]),#carsetup:not([hidden])," +
      "#howtoplay:not([hidden]),#advanced:not([hidden]),#audioset:not([hidden]),#track-detail:not([hidden])," +
      "#datahub:not([hidden])");
    return !!(el && el.getClientRects().length);
  }

  function onKey(e, down) {
    const active = document.activeElement;
    const tag = (active && active.tagName) || (e.target && e.target.tagName) || "";
    const interactive = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" ||
      tag === "BUTTON" || tag === "A" || (active && active.isContentEditable);
    const hudControl = active && active.matches &&
      active.matches("#btn-cam, #pausebtn, #hud-restore, .touchbtn");
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
    if (menuOverlayOpen() || (interactive && !hudControl)) {
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
      case "KeyQ": case "ShiftLeft":
        if (down && !e.repeat) shiftDownPressed = true; break;
      case "KeyC":
        if (down && !e.repeat) cameraCyclePressed = true; break;
      case "KeyP": case "Escape":
        if (down && !e.repeat && onPauseCb) onPauseCb();
        break;
    }
  }

  /* ---------------- canvas touch steering ---------------- */

  // TOUCH STEERING IS AN ANCHORED DRAG, and it used to be a coin flip.
  //
  // The old rule was: whichever HALF of the screen you touched, steer fully that
  // way. Not "mostly" — `clientX < innerWidth/2 ? -1 : 1`, the same ±1 a held
  // arrow key produces, delivered instantly with no ramp. So the one steering
  // mode aimed squarely at an iPad had exactly two reachable steering angles,
  // full left and full right, and a drag across the centre of the screen flipped
  // between them with no hysteresis. Every other input had more resolution than
  // the touchscreen: the pad has an analog stick, the keyboard at least ramps.
  //
  // Now the finger's own displacement IS the wheel. Touch down anywhere in the
  // free centre of the screen to set an anchor, slide toward the corner you want,
  // lift to let it ramp back to centre. RELATIVE rather than absolute, so it does
  // not matter where on the glass the thumb happens to land or how big the device
  // is, and TOUCH_RANGE scales with the viewport so the same gesture spans an
  // iPhone SE and a 13-inch iPad.
  //
  // A tap therefore steers ZERO where it used to mean full lock. That is the
  // change, not a side effect of it.
  const TOUCH_RANGE_FRAC = 0.12;   // viewport widths of drag for full lock
  const TOUCH_DEAD_PX = 5;         // slop around the anchor: a tap is not a steer
  let touchRangeFrac = TOUCH_RANGE_FRAC;

  function touchRangePx() {
    const w = (typeof window !== "undefined" && window.innerWidth) || 844;
    // Floored so a very narrow window can't make the range so small that the
    // dead zone covers all of it (which would leave only ±1 again).
    return Math.max(40, w * touchRangeFrac);
  }

  // Displacement from this touch's anchor, as a steer command. Only touch mode
  // steers from the canvas at all — the control buttons are separate elements in
  // the corners, and tilt/button modes leave the centre free for other uses.
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

  function onTouchStart(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      // Anchor AT the touch-down point, so the command starts at exactly zero
      // however far from centre the thumb landed — there is no jump to absorb.
      touches.set(t.identifier, { anchorX: t.clientX, x: t.clientX, seq: ++touchSeq });
    }
    recomputeTouchSteer();
  }

  function onTouchMove(e) {
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

  // While a finger is down the drag IS the command and there is nothing to
  // smooth — the thumb's own position is already continuous, and filtering it
  // would only add lag to a gesture the player can see. The ramp exists for the
  // one discontinuity in the scheme: lifting off, which drops the input to
  // nothing in a single event.
  function touchSteering() {
    const t = nowMs();
    const dt = (touchSteerT ? Math.min(0.1, (t - touchSteerT) / 1000) : 0) * timeScale;
    touchSteerT = t;
    if (touchActive) { touchSteerVal = touchSteer; return touchSteerVal; }
    touchSteerVal = moveToward(touchSteerVal, 0, KEY_RAMP_OUT * dt);
    return touchSteerVal;
  }

  // The on-screen arrows are a keyboard with fatter keys, so they get the
  // keyboard's ramp. Previously they returned a bare ±1 — full lock the instant
  // a thumb touched down, which is unmanageable at speed and was the reason
  // BUTTONS mode felt so much cruder than tilt.
  function buttonSteering() {
    const t = nowMs();
    const dt = (btnSteerT ? Math.min(0.1, (t - btnSteerT) / 1000) : 0) * timeScale;
    btnSteerT = t;
    const target = (btnSteerRight ? 1 : 0) - (btnSteerLeft ? 1 : 0);
    btnSteerVal = moveToward(btnSteerVal, target, (target !== 0 ? KEY_RAMP_IN : KEY_RAMP_OUT) * dt);
    return btnSteerVal;
  }

  /* ---------------- on-screen buttons ---------------- */

  // Every wireHold button registers here so its private pressed-pointer set can
  // be cleared from OUTSIDE the closure. Two nets hang off this list:
  //   1. window-level capture-phase pointerup/pointercancel (init) release that
  //      pointerId from EVERY hold button — a pointer that lifted anywhere is by
  //      definition no longer holding anything, even when the button itself never
  //      received the event (retargeted lift, missed lostpointercapture).
  //   2. reset() (blur / tab-hidden) clears every set outright, covering OS
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
      if (h.ids.delete(pointerId) && h.ids.size === 0) { h.apply(false); h.level && h.level(0); }
    }
  }
  function holdReleaseAll() {
    for (const h of holdBtns) {
      h.ids.clear();
      h.anchors && h.anchors.clear();
      h.apply(false);
      h.level && h.level(0);
    }
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
  function wireHold(id, apply, level) {
    const el = document.getElementById(id);
    if (!el) return;
    const ids = new Set();
    const anchors = level ? new Map() : null;   // pointerId -> y at touch-down
    holdBtns.push({ ids, apply, level, anchors });
    el.addEventListener("pointerdown", e => {
      // Capture the pointer so the hold survives the finger/cursor drifting off
      // the button — without this a tiny move fires pointerleave and drops the
      // press the instant you start holding (gas "won't stay on" until settled).
      try { el.setPointerCapture(e.pointerId); } catch (_) {}
      e.preventDefault();
      ids.add(e.pointerId);
      apply(true);
      if (level) { anchors.set(e.pointerId, e.clientY); level(1); }
    });
    if (level) el.addEventListener("pointermove", e => {
      const a = anchors.get(e.pointerId);
      if (a == null) return;
      const up = Math.max(0, a - e.clientY - PEDAL_DEAD_PX);
      level(clamp(1 - up / PEDAL_TRAVEL_PX, PEDAL_MIN, 1));
    });
    function release(e) {
      anchors && anchors.delete(e.pointerId);
      if (!ids.delete(e.pointerId)) return;
      if (ids.size === 0) { apply(false); if (level) level(0); }
    }
    el.addEventListener("pointerup", release);
    el.addEventListener("pointercancel", release);
    // With pointer capture, pointerleave no longer fires mid-hold; it stays as a
    // fallback for the (rare) case where capture couldn't be acquired.
    el.addEventListener("pointerleave", release);
    // Catch-all release: lostpointercapture fires whenever the element's pointer
    // capture ends for ANY reason. Critically it fires when the button is HIDDEN
    // or removed mid-hold (a HUD/pause/tuner state change sets the pedal to
    // display:none) — an IMPLICIT capture release where pointerup/pointercancel
    // may never be dispatched to the element, so the finger's eventual lift lands
    // on some other element and this button would otherwise stay "held" forever.
    // That is the "throttle stuck on after an off-track recovery" bug: a latched
    // GAS button keeps satisfying the auto-rescue trigger (throttle held but the
    // car isn't moving), so the car floors itself off the track and is reset over
    // and over. Because capture is retained on a normal press-and-release, the
    // pointerup path already covers the non-hidden case; whenever capture is lost
    // instead, this fires and releases. Together they make a stuck-on hold
    // impossible. A duplicate release for an already-cleared id is a no-op.
    el.addEventListener("lostpointercapture", release);
  }

  function wireTap(id, fire) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("pointerdown", function () { fire(); });
  }

  /* ---------------- gamepad ---------------- */

  // First connected pad, or null. (getGamepads() can return holes / stale slots.)
  function activePad() {
    if (typeof navigator === "undefined" || !navigator.getGamepads) return null;
    let pads;
    try { pads = navigator.getGamepads(); } catch (e) { return null; }
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

  // Poll the active gamepad once per frame. The Gamepad API has no events for
  // button/axis changes — you must read a fresh snapshot each frame — so this is
  // called at the top of the game loop, before the physics step, to keep input
  // latency to a single frame. Standard mapping:
  //   axis 0  left-stick X (steer)      btn 7 RT / btn 0 A  throttle
  //   btn 14/15 d-pad left/right        btn 6 LT / btn 1 B  brake
  //   btn 2 X  boost toggle             btn 3 Y  overtake
  //   btn 4 LB shift down               btn 5 RB shift up
  //   btn 12 d-pad up  active aero (X-mode) toggle
  //   btn 8 View/Back  camera           btn 9 Menu/Start  pause
  function pollGamepad() {
    // Skip the whole poll when nothing is connected. navigator.getGamepads()
    // allocates a fresh GamepadList every call, so calling it each frame with no
    // pad present is pure garbage. gamepadconnected flips padConnected true and
    // resumes polling; gamepaddisconnected (and the null branch below) clears it.
    if (!padConnected) return;
    const pad = activePad();
    if (!pad) {
      padConnected = false;
      padSteer = 0; padThrottle = false; padBrake = false;
      padThrottleVal = 0; padBrakeVal = 0;
      if (padPrevButtons.length) padPrevButtons.length = 0;
      return;
    }
    padConnected = true;
    // steering: left-stick X with a centre dead zone, re-scaled so it still
    // reaches full lock; d-pad gives a digital override.
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
    // edge-triggered actions reuse the same latches the keyboard sets.
    if (btnEdge(pad, 2)) boostTogglePressed = true;
    if (btnEdge(pad, 3)) overtakePressed = true;
    if (btnEdge(pad, 12)) aeroTogglePressed = true;
    if (btnEdge(pad, 5)) shiftUpPressed = true;
    if (btnEdge(pad, 4)) shiftDownPressed = true;
    if (btnEdge(pad, 8)) cameraCyclePressed = true;
    if (btnEdge(pad, 9) && onPauseCb) onPauseCb();
    const n = pad.buttons ? pad.buttons.length : 0;
    padPrevButtons.length = n;
    for (let i = 0; i < n; i++) padPrevButtons[i] = btnDown(pad, i);
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

  /* ---------------- public ---------------- */

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
    if (steerMode !== "buttons") {
      btnSteerLeft = btnSteerRight = false;   // drop held buttons
      btnSteerVal = 0; btnSteerT = 0;
    }
    if (steerMode !== "touch") {
      // A drag in progress when the mode changed is not a command in the new
      // mode. Leaving its value latched would hold lock the player can no longer
      // release, because nothing in the new mode ever calls touchSteering().
      touches.clear();
      touchSteer = 0; touchActive = false; touchSteerVal = 0; touchSteerT = 0;
    }
  }

  function getSteerMode() {
    return steerMode;
  }

  // Tilt sensitivity, driven by the in-game TILT RANGE slider. deg = tilt for
  // full lock (higher = less sensitive).
  function setTiltSensitivity(deg) {
    if (typeof deg === "number" && isFinite(deg)) MAX_TILT = Math.max(8, Math.min(60, deg));
  }
  // SMOOTHING knob: sets the One-Euro min-cutoff (Hz) — the filter that actually
  // shapes tilt feel. Lower = steadier/smoother at rest (kills jitter, a touch of
  // lag); higher = more immediate. (The slew limiter above is a fixed safety cap.)
  function setTiltSmoothing(cutoff) {
    if (typeof cutoff === "number" && isFinite(cutoff)) OE_MIN_CUTOFF = Math.max(0.3, Math.min(4, cutoff));
  }
  function setTiltDeadzone(deg) {
    // Clamp DEADZONE strictly below MAX_TILT so the steering formula d/(MAX_TILT-DEADZONE) never divides by zero or inverts.
    if (typeof deg === "number" && isFinite(deg)) DEADZONE = Math.max(0, Math.min(Math.min(15, MAX_TILT - 1), deg));
  }

  // Cached MediaQueryList: this is called from the per-tick physics path
  // (autoThrottle/manualGears), and window.matchMedia() allocates a fresh
  // MediaQueryList every call. mql.matches stays LIVE on the cached object,
  // so convertible/hybrid devices still flip correctly.
  let _coarseMql = null;
  function touchControlsNeeded() {
    if (_coarseMql === null && typeof window !== "undefined" && window.matchMedia) {
      try { _coarseMql = window.matchMedia("(pointer: coarse)"); } catch (_) { _coarseMql = false; }
    }
    return !!(_coarseMql && _coarseMql.matches);
  }

  function onScreenRotate() {
    // New rotation remaps the tilt axis; let fresh readings arrive,
    // then re-capture neutral.
    setTimeout(calibrate, 300);
  }

  function init(canvas, opts) {
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
    wireHold("btn-steer-left", function (v) { btnSteerLeft = v; });
    wireHold("btn-steer-right", function (v) { btnSteerRight = v; });

    if (typeof screen !== "undefined" && screen.orientation &&
        typeof screen.orientation.addEventListener === "function") {
      screen.orientation.addEventListener("change", onScreenRotate);
    } else {
      window.addEventListener("orientationchange", onScreenRotate);
    }

    window.addEventListener("gamepadconnected", function () { padConnected = true; });
    window.addEventListener("gamepaddisconnected", function () {
      padConnected = false; padSteer = 0; padThrottle = padBrake = false;
      padThrottleVal = padBrakeVal = 0;
      padPrevButtons.length = 0;
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
    btnSteerVal = 0; btnSteerT = 0;
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
    padPrevButtons.length = 0;
  }

  // Live per-source input snapshot for diagnosis (surfaced as
  // __apex.inputState()): shows WHICH source is asserting throttle/brake and
  // whether any hold button still tracks pressed pointers. If a "stuck
  // throttle" report ever recurs, this pinpoints the culprit in one call.
  function debugState() {
    return {
      steerMode,
      key: { left: keyLeft, right: keyRight, throttle: keyThrottle, brake: keyBrake },
      btn: { throttle: btnThrottle, brake: btnBrake, left: btnSteerLeft, right: btnSteerRight,
             throttleVal: btnThrottleVal, brakeVal: btnBrakeVal, steerVal: btnSteerVal },
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
    getSteerMode,
    setTimeScale,
    setTiltSensitivity,
    setTiltSmoothing,
    setTiltDeadzone,
    touchControlsNeeded,
    get padConnected() { return padConnected; },
    get gyroSeen() { return tiltSeen; },
    get gyroDenied() { return gyroDenied; },
    // Read-only tilt-tuning state (for tests / diagnostics).
    get maxTilt() { return MAX_TILT; },
    get deadzone() { return DEADZONE; },
    get tiltSlew() { return TILT_SLEW; },
    get minCutoff() { return OE_MIN_CUTOFF; },
  };
})();
