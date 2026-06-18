/*
 * Input: keyboard / tilt / touch for Apex 26.
 *
 * Steering sources, by priority: keyboard (held or still returning to
 * center) > tilt (enabled and delivering fresh data) > touch (on-screen
 * steer buttons or lower-screen halves).
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
  const MAX_TILT = 22;        // degrees of tilt for full steering lock
  const DEADZONE = 2.5;       // degrees ignored around the calibrated zero
  const EXPO = 1.4;           // response curve past the deadzone
  const TILT_TAU = 0.06;      // s, low-pass time constant (frame-rate independent)
  const KEY_RAMP_IN = 6;      // keyboard steer units/s toward full lock
  const KEY_RAMP_OUT = 8;     // keyboard steer units/s back to center

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

  // canvas touch halves: id -> -1 | 0 | 1
  const touches = new Map();
  let touchSteer = 0;

  // on-screen buttons (multi-pointer safe via per-button pointer sets)
  let btnThrottle = false;
  let btnBrake = false;

  // tilt
  let tiltFilt = 0;           // low-passed remapped tilt, degrees
  let tiltZero = 0;           // calibrated neutral
  let tiltSeen = false;
  let calibPending = false;   // calibrate() requested before first sensor event
  let lastTiltEventT = -1e9;  // performance.now() ms of last sensor event
  let lastTiltFilterT = 0;
  let gyroAttached = false;
  let gyroDenied = false;
  let useTiltPref = true;

  let onPauseCb = null;

  function nowMs() {
    return (typeof performance !== "undefined" && performance.now)
      ? performance.now() : Date.now();
  }

  function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  /* ---------------- tilt ---------------- */

  function screenAngle() {
    if (typeof screen !== "undefined" && screen.orientation &&
        typeof screen.orientation.angle === "number") {
      return screen.orientation.angle;
    }
    return typeof window.orientation === "number" ? window.orientation : 0;
  }

  function onOrient(e) {
    if (e.beta === null && e.gamma === null) return;
    const beta = e.beta || 0;
    const gamma = e.gamma || 0;
    let raw;
    switch (((screenAngle() % 360) + 360) % 360) {
      case 90:  raw = beta;   break;
      case 180: raw = -gamma; break;
      case 270: raw = -beta;  break;
      default:  raw = gamma;  break;
    }
    const t = nowMs();
    if (!tiltSeen) {
      tiltFilt = raw;
      tiltSeen = true;
    } else {
      // frame-rate-independent low-pass: alpha from the real inter-event dt
      const dt = Math.max(0, (t - lastTiltFilterT) / 1000);
      const alpha = 1 - Math.exp(-dt / TILT_TAU);
      tiltFilt += (raw - tiltFilt) * alpha;
    }
    // a calibrate() requested before sensor data arrived takes effect now
    if (calibPending) { tiltZero = tiltFilt; calibPending = false; }
    lastTiltFilterT = t;
    lastTiltEventT = t;
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

  // Capture the current hold as neutral. No clamp: the neutral attitude can be
  // any angle (a landscape grip is often well past ±35°); clamping it would
  // leave a residual offset that pulls the car constantly to one side. If no
  // sensor reading has arrived yet, defer until the first event.
  function calibrate() {
    if (tiltSeen) tiltZero = tiltFilt;
    else calibPending = true;
  }

  // Latched, like the proven driving-game build: once any orientation event
  // has arrived (tiltSeen), tilt stays active for the rest of the session —
  // a momentary gap in events never reverts steering to the buttons.
  function tiltActive() {
    return useTiltPref && tiltSeen;
  }

  function tiltSteering() {
    const d = tiltFilt - tiltZero;
    const mag = Math.abs(d);
    if (mag < DEADZONE) return 0;
    const n = clamp((mag - DEADZONE) / (MAX_TILT - DEADZONE), 0, 1);
    return Math.sign(d) * Math.pow(n, EXPO);
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
      case "KeyP": case "Escape":
        if (down && !e.repeat && onPauseCb) onPauseCb();
        break;
    }
  }

  /* ---------------- canvas touch halves ---------------- */

  function touchDir(t) {
    // When tilt isn't steering, a touch anywhere on the canvas (the on-screen
    // buttons are separate elements) steers by screen half. The control
    // buttons sit in the corners, leaving the large centre free to steer.
    if (tiltActive()) return 0;
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

  /* ---------------- public ---------------- */

  function steer() {
    const k = keyboardSteer();
    if (keyLeft || keyRight || Math.abs(k) > 0.001) return k;
    if (tiltActive()) return tiltSteering();
    return touchSteer;
  }

  function throttle() {
    return keyThrottle || btnThrottle;
  }

  function braking() {
    return keyBrake || btnBrake;
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

  function setUseTilt(b) {
    useTiltPref = !!b;
  }

  function useTilt() {
    return useTiltPref;
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

    if (typeof screen !== "undefined" && screen.orientation &&
        typeof screen.orientation.addEventListener === "function") {
      screen.orientation.addEventListener("change", onScreenRotate);
    } else {
      window.addEventListener("orientationchange", onScreenRotate);
    }
  }

  function reset() {
    touches.clear();
    touchSteer = 0;
    btnThrottle = btnBrake = false;
    keyLeft = keyRight = keyBrake = keyThrottle = false;
    keySteerVal = 0;
    keySteerT = 0;
    overtakePressed = false;
    boostTogglePressed = false;
    shiftUpPressed = false;
    shiftDownPressed = false;
  }

  return {
    init,
    reset,
    requestGyro,
    calibrate,
    steer,
    throttle,
    braking,
    consumeBoostToggle,
    consumeOvertake,
    consumeShiftUp,
    consumeShiftDown,
    tiltActive,
    setUseTilt,
    useTilt,
    touchControlsNeeded,
    get gyroSeen() { return tiltSeen; },
    get gyroDenied() { return gyroDenied; },
  };
})();
