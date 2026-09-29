/* Apex 26 — XR controller → Input.remoteSample / remoteEvent.
 *
 * Quest Touch (xr-standard mapping): buttons[0] trigger, [1] squeeze,
 * [3] thumbstick press, [4] A/X, [5] B/Y; axes[2]/[3] thumbstick.
 * Right trigger = throttle, left trigger = brake, thumbstick X = steer,
 * A/X = recenter (caller), B/Y = pause. Pure mapping + edge latch so unit
 * tests need no WebXR runtime; js/xr/xr-session.js feeds live gamepads.
 */
"use strict";

const XrInput = (function () {
  const BTN_TRIGGER = 0;
  const BTN_SQUEEZE = 1;
  const BTN_STICK = 3;
  const BTN_PRIMARY = 4;    // A (right) / X (left)
  const BTN_SECONDARY = 5;  // B (right) / Y (left)
  const AXIS_STICK_X = 2;
  const AXIS_STICK_Y = 3;

  function btn(gp, i) {
    const b = gp && gp.buttons && gp.buttons[i];
    if (!b) return 0;
    if (typeof b.value === "number") return b.value;
    return b.pressed ? 1 : 0;
  }
  function axis(gp, i) {
    const a = gp && gp.axes;
    return a && a.length > i ? (+a[i] || 0) : 0;
  }

  /**
   * Map one XRFrame's input sources into a remote sample + edge events.
   * `prev` is the previous latch { primary: bool, secondary: bool } (mutated).
   * Returns { sample: {roll, thr, brk, held}, events: string[], recenter: bool }.
   * `roll` is a steer command in −1..1; the session maps it through
   * Input.steerToTilt before remoteSample.
   */
  function mapFrame(sources, prev) {
    let thr = 0, brk = 0, stickX = 0, held = 0;
    let primaryDown = false, secondaryDown = false;
    const list = sources || [];
    for (let i = 0; i < list.length; i++) {
      const src = list[i];
      if (!src || src.targetRayMode === "gaze") continue;
      const gp = src.gamepad;
      if (!gp) continue;
      const hand = src.handedness;   // "left" | "right" | "none"
      const t = btn(gp, BTN_TRIGGER);
      if (hand === "right") thr = Math.max(thr, t);
      else if (hand === "left") brk = Math.max(brk, t);
      else {
        // Ambiguous / none: treat first stick as steer, average pedals later.
        thr = Math.max(thr, t);
      }
      const sx = axis(gp, AXIS_STICK_X);
      // Prefer left stick for steer when both present; else any.
      if (hand === "left" || (hand !== "right" && !stickX)) stickX = sx;
      else if (hand === "right" && !list.some((s) => s && s.handedness === "left")) stickX = sx;
      if (btn(gp, BTN_PRIMARY) > 0.5) primaryDown = true;
      if (btn(gp, BTN_SECONDARY) > 0.5) secondaryDown = true;
      // Squeeze on either hand = look-back hold bit (Input.remoteSample.held).
      if (btn(gp, BTN_SQUEEZE) > 0.5) held = 1;
      void BTN_STICK; void AXIS_STICK_Y;
    }
    const latch = prev || { primary: false, secondary: false };
    const events = [];
    let recenter = false;
    if (primaryDown && !latch.primary) recenter = true;
    if (secondaryDown && !latch.secondary) events.push("pause");
    latch.primary = primaryDown;
    latch.secondary = secondaryDown;

    const steer = XrRig.stickToSteer(stickX);
    return {
      sample: { roll: steer, thr: thr, brk: brk, held: held },
      events,
      recenter,
      latch,
    };
  }

  /** Apply a mapFrame result to Input (remoteSample / remoteEvent). */
  function inject(input, mapped) {
    if (!input || !mapped) return false;
    const s = mapped.sample;
    let roll = s.roll;
    if (typeof input.steerToTilt === "function" && typeof roll === "number") {
      roll = input.steerToTilt(roll);
    }
    input.remoteSample({ roll: roll, thr: s.thr, brk: s.brk, held: s.held | 0 });
    const ev = mapped.events || [];
    for (let i = 0; i < ev.length; i++) input.remoteEvent(ev[i]);
    return true;
  }

  return {
    mapFrame, inject,
    BTN_TRIGGER, BTN_SQUEEZE, BTN_STICK, BTN_PRIMARY, BTN_SECONDARY,
    AXIS_STICK_X, AXIS_STICK_Y,
  };
})();
Object.freeze(XrInput);
