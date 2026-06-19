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
  // Tilt mechanics ported verbatim from the driving-game (Neon Drift) build.
  const MAX_TILT = 36;        // degrees of tilt for full steering lock (higher = less sensitive)
  const DEADZONE = 2.5;       // degrees ignored around the calibrated zero
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
  let tiltSmoothed = 0;       // EMA-filtered tilt (eliminates jitter spikes)
  let lastOrientMs = 0;
  // Slew-rate limit on the tilt steering OUTPUT: caps how fast the steering
  // command can change, so a quick or jittery hand movement can't snap the car.
  // (Recommended technique for tilt controls: a hard limit on turn rate.)
  const TILT_SLEW = 2.2;      // max steer-units/s of change from tilt
  let tiltSteerVal = 0;       // current rate-limited tilt steer (-1..1)
  let tiltSteerT = 0;         // last slew timestamp, ms (0 = unset)

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
    // Build the gravity direction in device coordinates from the Euler angles
    // (independent of alpha/compass). Steering off a gravity-based ROLL — rather
    // than the raw beta/gamma angle — keeps the response smooth and consistent
    // however upright the phone is held: raw Euler angles jump and rescale near
    // gimbal lock (phone near vertical), which made tilt "act differently" when
    // held up vs laid flat. At flat the roll equals gamma/beta, so the familiar
    // feel is preserved.
    const beta = (e.beta || 0) * DEG;     // front-back (X)
    const gamma = (e.gamma || 0) * DEG;   // left-right (Y)
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
    tiltSmoothed += (tiltRaw - tiltSmoothed) * (1 - Math.exp(-8 * odt));
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
    tiltSmoothed = tiltRaw;   // reset smoother so there's no startup transient
    tiltSteerVal = 0;         // and the slew limiter, so neutral means neutral
  }

  function tiltActive() {
    return steerMode === "tilt" && tiltSeen;
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
    tiltSteerVal = moveToward(tiltSteerVal, target, TILT_SLEW * dt);
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

  /* ---------------- public ---------------- */

  function steer() {
    const k = keyboardSteer();
    if (keyLeft || keyRight || Math.abs(k) > 0.001) return k;
    if (steerMode === "buttons") return (btnSteerRight ? 1 : 0) - (btnSteerLeft ? 1 : 0);
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

  function setSteerMode(m) {
    steerMode = (m === "buttons" || m === "touch") ? m : "tilt";
    if (steerMode !== "buttons") btnSteerLeft = btnSteerRight = false;  // drop held buttons
  }

  function getSteerMode() {
    return steerMode;
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
    setSteerMode,
    getSteerMode,
    touchControlsNeeded,
    get gyroSeen() { return tiltSeen; },
    get gyroDenied() { return gyroDenied; },
  };
})();
