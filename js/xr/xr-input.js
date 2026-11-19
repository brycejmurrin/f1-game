"use strict";

const XrInput = (function () {
  const BTN_TRIGGER = 0;
  const BTN_PRIMARY = 4;
  const BTN_SECONDARY = 5;
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

  function usableStick(src) {
    return !!(src && src.targetRayMode !== "gaze" && src.gamepad &&
      src.gamepad.axes && src.gamepad.axes.length > AXIS_STICK_X &&
      Number.isFinite(src.gamepad.axes[AXIS_STICK_X]));
  }

  function mapFrame(sources, prev, options) {
    const menuOpen = !!(options && options.menuOpen);
    const menuNav = menuOpen && !!options.overlay;
    let thr = 0, brk = 0, stickX = 0, stickY = 0;
    let primaryDown = false, secondaryDown = false;
    const list = sources || [];
    let hasLeft = false, hasStick = false, hasGamepad = false, stickChosen = false;
    for (let i = 0; i < list.length; i++)
      if (usableStick(list[i]) && list[i].handedness === "left") hasLeft = true;
    for (let i = 0; i < list.length; i++) {
      const src = list[i];
      if (!src || src.targetRayMode === "gaze") continue;
      const gp = src.gamepad;
      if (!gp) continue;
      hasGamepad = true;
      const hand = src.handedness;
      const t = btn(gp, BTN_TRIGGER);
      if (hand === "right") thr = Math.max(thr, t);
      else if (hand === "left") brk = Math.max(brk, t);
      else {
        thr = Math.max(thr, t);
      }
      const sx = axis(gp, AXIS_STICK_X);
      if (usableStick(src)) {
        hasStick = true;
        if (hand === "left" || (!hasLeft && hand !== "right" && !stickChosen) || (hand === "right" && !hasLeft)) {
          stickX = sx; stickY = axis(gp, AXIS_STICK_Y);
          stickChosen = true;
        }
      }
      if (btn(gp, BTN_PRIMARY) > 0.5) primaryDown = true;
      if (btn(gp, BTN_SECONDARY) > 0.5) secondaryDown = true;
    }
    const latch = prev || { primary: false, secondary: false };
    const events = [];
    let recenter = false;
    if (primaryDown && !latch.primary) {
      if (menuNav) events.push("navSelect"); else recenter = true;
    }
    if (secondaryDown && !latch.secondary) events.push(menuNav ? "navBack" : "pause");
    const direction = menuNav && Math.max(Math.abs(stickX), Math.abs(stickY)) > 0.55
      ? (Math.abs(stickY) >= Math.abs(stickX) ? (stickY < 0 ? "navUp" : "navDown") : (stickX < 0 ? "navLeft" : "navRight")) : null;
    if (direction && direction !== latch.direction) events.push(direction);
    latch.direction = direction;
    if (menuOpen) { thr = 0; brk = 0; stickX = 0; }

    latch.primary = primaryDown;
    latch.secondary = secondaryDown;

    const steer = XrRig.stickToSteer(stickX);
    return {
      sample: { roll: hasStick ? steer : null, thr: thr, brk: brk, held: 0 },
      driving: hasGamepad && !(options && options.driving === false),
      events,
      recenter,
      latch,
    };
  }

  function inject(input, mapped) {
    if (!input || !mapped) return false;
    const s = mapped.sample;
    if (mapped.driving === false) {
      if (input.remoteLost) input.remoteLost("xr");
    } else {
      const sample = { source: "xr", thr: s.thr, brk: s.brk, held: s.held | 0 };
      if (typeof s.roll === "number") sample.steer = s.roll;
      input.remoteSample(sample);
    }
    const ev = mapped.events || [];
    for (let i = 0; i < ev.length; i++) input.remoteEvent(ev[i]);
    return true;
  }

  return { mapFrame, inject };
})();
Object.freeze(XrInput);
