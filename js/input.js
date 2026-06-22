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
  const KEY_RAMP_IN = 6;      // keyboard steer units/s toward full lock
  const KEY_RAMP_OUT = 8;     // keyboard steer units/s back to center
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
  let padPrevButtons = [];     // previous frame's pressed state, for rising edges
  const PAD_DEADZONE = 0.14;   // left-stick centre slop (ignored, then re-scaled)

  // canvas touch halves: id -> -1 | 0 | 1
  const touches = new Map();
  let touchSteer = 0;

  // on-screen buttons (multi-pointer safe via per-button pointer sets)
  let btnThrottle = false;
  let btnBrake = false;
  let btnSteerLeft = false;
  let btnSteerRight = false;

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
          .then(function (res) {
            if (res === "granted") {
              attachGyro();
              return true;
            }
            gyroDenied = true;
            return false;
          })
          .catch(function () {
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
    let target = 0, d = tiltSmoothed - tiltZero;
    if (Math.abs(d) >= DEADZONE) {
      d -= Math.sign(d) * DEADZONE;
      target = clamp(d / (MAX_TILT - DEADZONE), -1, 1);
    }
    const releasing = Math.abs(target) < Math.abs(tiltSteerVal);
    tiltSteerVal = moveToward(tiltSteerVal, target, (releasing ? 1.6 : 1.0) * TILT_SLEW * step);
    return tiltSteerVal;
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

  function tiltSteering() {
    // Map the calibrated, filtered tilt to a target steer (-1..1) with a soft
    // dead zone, then slew-rate limit the change toward that target so the
    // command can't jump even if the hand does.
    let target = 0;
    let d = tiltSmoothed - tiltZero;
    if (Math.abs(d) >= DEADZONE) {
      d -= Math.sign(d) * DEADZONE;
      target = Math.max(-1, Math.min(1, d / (MAX_TILT - DEADZONE)));
    }
    const t = nowMs();
    const dt = tiltSteerT ? Math.min(0.1, (t - tiltSteerT) / 1000) : 0;
    tiltSteerT = t;
    const releasing = Math.abs(target) < Math.abs(tiltSteerVal);
    tiltSteerVal = moveToward(tiltSteerVal, target, (releasing ? 1.6 : 1.0) * TILT_SLEW * dt);
    return tiltSteerVal;
  }

  /* ---------------- keyboard ---------------- */

  function moveToward(v, target, step) {
    return v + clamp(target - v, -step, step);
  }

  // Advances the ramp on every call (steer() is polled once per frame).
  function keyboardSteer() {
    const t = nowMs();
    const dt = keySteerT ? Math.min(0.1, (t - keySteerT) / 1000) : 0;
    keySteerT = t;
    const target = (keyRight ? 1 : 0) - (keyLeft ? 1 : 0);
    if (target !== 0) {
      keySteerVal = moveToward(keySteerVal, target, KEY_RAMP_IN * dt);
    } else {
      keySteerVal = moveToward(keySteerVal, 0, KEY_RAMP_OUT * dt);
    }
    return keySteerVal;
  }

  function onKey(e, down) {
    const active = document.activeElement;
    const tag = (active && active.tagName) || (e.target && e.target.tagName) || "";
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
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

  /* ---------------- canvas touch halves ---------------- */

  function touchDir(t) {
    // Only in touch mode does a tap on the canvas steer by screen half (the
    // control buttons are separate elements in the corners, leaving the large
    // centre free). Tilt and button modes ignore canvas taps.
    if (steerMode !== "touch") return 0;
    return t.clientX < window.innerWidth / 2 ? -1 : 1;
  }

  function recomputeTouchSteer() {
    touchSteer = 0;
    for (const dir of touches.values()) {
      if (dir !== 0) touchSteer = dir;   // most recent steering touch wins
    }
  }

  function onTouchStart(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      touches.set(t.identifier, touchDir(t));
    }
    recomputeTouchSteer();
  }

  function onTouchMove(e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (touches.has(t.identifier)) {
        touches.set(t.identifier, touchDir(t));
      }
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

  /* ---------------- on-screen buttons ---------------- */

  // Hold semantics, multi-pointer safe: the button stays "held" until
  // every pointer that pressed it has been released/cancelled/left.
  function wireHold(id, apply) {
    const el = document.getElementById(id);
    if (!el) return;
    const ids = new Set();
    el.addEventListener("pointerdown", function (e) {
      ids.add(e.pointerId);
      apply(true);
    });
    function release(e) {
      if (!ids.delete(e.pointerId)) return;
      if (ids.size === 0) apply(false);
    }
    el.addEventListener("pointerup", release);
    el.addEventListener("pointercancel", release);
    el.addEventListener("pointerleave", release);
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
  //   btn 8 View/Back  camera           btn 9 Menu/Start  pause
  function pollGamepad() {
    const pad = activePad();
    if (!pad) {
      padConnected = false;
      padSteer = 0; padThrottle = false; padBrake = false;
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
    padThrottle = btnVal(pad, 7) > 0.12 || btnDown(pad, 0);
    padBrake = btnVal(pad, 6) > 0.12 || btnDown(pad, 1);
    // edge-triggered actions reuse the same latches the keyboard sets.
    if (btnEdge(pad, 2)) boostTogglePressed = true;
    if (btnEdge(pad, 3)) overtakePressed = true;
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
    if (steerMode === "buttons") return (btnSteerRight ? 1 : 0) - (btnSteerLeft ? 1 : 0);
    if (tiltActive()) return tiltSteering();
    return touchSteer;
  }

  function throttle() {
    return keyThrottle || btnThrottle || padThrottle;
  }

  function braking() {
    return keyBrake || btnBrake || padBrake;
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
    if (steerMode !== "buttons") btnSteerLeft = btnSteerRight = false;  // drop held buttons
  }

  function getSteerMode() {
    return steerMode;
  }

  // Tilt tuning, driven by the in-game sliders. deg = tilt for full lock
  // (higher = less sensitive); slew = max steer-units/s of change (lower = smoother).
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

  function touchControlsNeeded() {
    return !!(typeof window !== "undefined" && window.matchMedia &&
              window.matchMedia("(pointer: coarse)").matches);
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

    canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    canvas.addEventListener("touchend", onTouchEnd, { passive: false });
    canvas.addEventListener("touchcancel", onTouchEnd, { passive: false });

    wireHold("btn-throttle", function (v) { btnThrottle = v; });
    wireHold("btn-brake", function (v) { btnBrake = v; });
    wireTap("btn-boost", function () { boostTogglePressed = true; });
    wireTap("btn-ot", function () { overtakePressed = true; });
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
      padPrevButtons.length = 0;
    });
  }

  function reset() {
    touches.clear();
    touchSteer = 0;
    btnThrottle = btnBrake = false;
    btnSteerLeft = btnSteerRight = false;
    keyLeft = keyRight = keyBrake = keyThrottle = false;
    keySteerVal = 0;
    keySteerT = 0;
    tiltSteerVal = 0;
    tiltSteerT = 0;
    oeInit = false; oePrev = 0; oeDPrev = 0;
    overtakePressed = false;
    boostTogglePressed = false;
    shiftUpPressed = false;
    shiftDownPressed = false;
    cameraCyclePressed = false;
    padSteer = 0;
    padThrottle = false;
    padBrake = false;
    padPrevButtons.length = 0;
  }

  return {
    init,
    reset,
    poll: pollGamepad,
    rumble,
    requestGyro,
    calibrate,
    steer,
    throttle,
    braking,
    consumeBoostToggle,
    consumeOvertake,
    consumeShiftUp,
    consumeShiftDown,
    consumeCameraCycle,
    tiltActive,
    simTilt,
    simTiltReset,
    steerToTilt,
    setSteerMode,
    getSteerMode,
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
