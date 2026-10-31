/* input-clock-rotate.test.mjs — the hit-stop steering clock (Input.setTimeScale) and the
   rotation reset (onScreenRotate), neither entered by a unit test before (B·H11 coverage, 2026-10-21). */
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { boot } from "../helpers/key-binds-rig.mjs";

// Live-path keyboard steer after `ms` of a held RIGHT arrow, on a clock the test owns.
function rampAfter(ms, scale) {
  const { Input, key, sb } = boot();
  let t = 1000;
  sb.performance = { now: () => t };
  if (scale !== undefined) Input.setTimeScale(scale);
  key("ArrowRight", true);
  Input.steer();                     // first sample: dt 0
  t += ms;
  return Input.steer();
}

test("hit-stop slows the live steering ramp with the sim clock; bad scales fall back to 1", () => {
  const full = rampAfter(50), slow = rampAfter(50, 0.15);
  assert.ok(full > 0.05, "a held arrow moves the wheel in 50 ms: " + full);
  assert.ok(slow > 0 && slow < full * 0.5, `at 0.15x the wheel travels far less: ${slow} vs ${full}`);
  for (const bad of [0, -1, NaN, Infinity, "0.5"]) assert.equal(rampAfter(50, bad), full, "ignored: " + String(bad));
  assert.equal(rampAfter(50, 5), full, "capped at 1: hit-stop never speeds the wheel up");
});

test("the fixed-step ramp (Input.steer(stepDt)) is the sim's own clock and ignores the time scale", () => {
  const step = (scale) => {
    const { Input, key } = boot();
    if (scale !== undefined) Input.setTimeScale(scale);
    key("ArrowRight", true);
    let v = 0;
    for (let i = 0; i < 3; i++) v = Input.steer(1 / 60);
    return v;
  };
  assert.equal(step(0.15), step(), "game.js already scales the step it passes");
});

test("a screen rotation restarts the tilt filter but keeps the calibrated zero", () => {
  const { Input, sb, fire } = boot();
  let t = 1000;
  sb.performance = { now: () => t };
  const roll = (deg, n = 20) => { let v = 0; for (let i = 0; i < n; i++) { t += 16; Input.remoteSample({ source: "phone", roll: deg, thr: 0, brk: 0 }); v = Input.steer(); } return v; };
  roll(10, 5);
  Input.calibrate();                 // neutral = 10°
  const leaning = roll(30);
  assert.ok(leaning > 0.2, "a 20° lean past neutral steers: " + leaning);
  fire("orientationchange");
  t += 16; Input.remoteSample({ source: "phone", roll: 10, thr: 0, brk: 0 });
  const after = Input.steer();
  assert.ok(Math.abs(after) < 0.02, `the filter restarts on the new axis instead of easing in from the old lean (${leaning}): ` + after);
  assert.ok(Math.abs(roll(10)) < 0.02, "the calibrated neutral survived the rotation");
});

test("a window blur is not a phone-controller loss: no onPadLost edge for a link that is still alive (B·H20)", () => {
  let lost = 0;
  const { Input, sb, fire } = boot({ onPadLost: () => { lost++; } });
  let t = 1000;
  sb.performance = { now: () => t };
  for (let i = 0; i < 5; i++) { t += 16; Input.remoteSample({ source: "phone", roll: 0, thr: 0, brk: 0 }); Input.poll(); }
  assert.equal(lost, 0, "a live phone is no loss");
  fire("blur");
  t += 16; Input.poll();
  assert.equal(lost, 0, "reset() on blur must not read as the phone going quiet");
  t += 5000; Input.poll();
  assert.equal(lost, 0, "and a phone that never spoke again was already cleared by the blur");
});

test("a re-paired phone's tilt starts from its own reading, not the lean the last link held (B·H20)", () => {
  const { Input, sb } = boot();
  let t = 1000;
  sb.performance = { now: () => t };
  const roll = (deg, n) => { let v = 0; for (let i = 0; i < n; i++) { t += 16; Input.remoteSample({ source: "phone", roll: deg, thr: 0, brk: 0 }); v = Input.steer(); } return v; };
  roll(0, 5);
  Input.calibrate();
  assert.ok(roll(30, 60) > 0.3, "the lean steers");
  Input.remoteLost("phone");
  t += 5000;
  assert.ok(Math.abs(roll(0, 1)) < 0.02, "the first level sample after a re-pair reads level, not the old lean");
});


function secondaryRig() {
  const { sb, fire } = boot(), events = new Map();
  let actions = 0, cancelled = 0, allowed = true, before = null;
  const el = { hidden: false, disabled: false, isConnected: true,
    getAttribute: () => null, setPointerCapture() {},
    getBoundingClientRect: () => ({ left: 0, top: 0, right: 44, bottom: 44 }),
    addEventListener(type, fn) { const list = events.get(type) || []; list.push(fn); events.set(type, list); },
  };
  const helper = vm.runInContext("InputHoldButtons", sb);
  helper.secondaryTap(el, { activate: () => actions++, cancel: () => cancelled++, beforeActivate: e => { before = e; return allowed; } });
  const event = extra => ({ pointerType: "touch", pointerId: 2, isPrimary: false, isTrusted: true,
    clientX: 20, clientY: 20, timeStamp: 100, target: el, ...extra });
  const emit = (type, extra) => { const e = event(extra); if (type === "pointerdown" || type === "pointerup") fire(type, e); for (const fn of events.get(type) || []) fn(e); return e; };
  return { sb, fire, el, emit, event, actions: () => actions, cancelled: () => cancelled, before: () => before, block: () => { allowed = false; } };
}

test("secondary touch activates once and deduplicates a native click retargeted into a modal", () => {
  const h = secondaryRig();
  for (const extra of [{ isPrimary: true }, { pointerType: "mouse" }]) { h.emit("pointerdown", extra); h.emit("pointerup", extra); }
  assert.equal(h.actions(), 0, "primary touch and mouse remain native");
  h.emit("pointerdown"); const up = h.emit("pointerup", { timeStamp: 150 });
  assert.equal(h.actions(), 1); assert.equal(h.before(), up, "the original trusted gesture reaches the owner");
  let stopped = 0;
  const click = extra => h.fire("click", h.event({ timeStamp: 160, detail: 1, target: { id: "new-modal-button" }, preventDefault() { stopped++; }, stopImmediatePropagation() {}, ...extra }));
  click({ detail: 0 }); assert.equal(stopped, 0, "keyboard and AT clicks pass");
  click({ pointerId: 99 }); assert.equal(stopped, 0, "an unrelated pointer passes");
  click({}); assert.equal(stopped, 1, "same contact cannot click through the opened layer");
  h.emit("pointerdown"); h.emit("pointerup", { timeStamp: 250 });
  h.fire("pointerdown", h.event({ isPrimary: true, pointerId: 3 }));
  click({}); assert.equal(stopped, 1, "a genuinely new contact releases stale dedup state");
});

test("secondary touch cancellation, movement, hidden controls and interruptions never activate", () => {
  for (const ending of ["pointercancel", "lostpointercapture", "move", "outside", "blur", "resize", "orientationchange", "hidden", "disabled", "visibility", "blocked"]) {
    const h = secondaryRig(); h.emit("pointerdown");
    if (ending === "move") h.emit("pointermove", { clientX: 40 });
    else if (["blur", "resize", "orientationchange"].includes(ending)) h.fire(ending);
    else if (ending === "visibility") { h.sb.document.hidden = true; h.fire("visibilitychange"); }
    else if (ending === "hidden") h.el.hidden = true;
    else if (ending === "disabled") h.el.disabled = true;
    else if (ending === "blocked") h.block();
    else if (ending !== "outside") h.emit(ending);
    h.emit("pointerup", ending === "outside" ? { clientX: 100 } : {});
    assert.equal(h.actions(), 0, ending);
  }
});


test("secondary actions preserve an independent held pedal and its matching release", () => {
  const h = secondaryRig(), handlers = new Map(); let held = false;
  const pedal = { ...h.el, addEventListener: (type, fn) => handlers.set(type, fn) };
  h.sb.document.getElementById = () => pedal;
  const helper = vm.runInContext("InputHoldButtons", h.sb);
  const holds = helper.create({ clamp: (v, lo, hi) => Math.max(lo, Math.min(hi, v)), beforeReleaseAll() {} });
  holds.wireHold("gas", value => { held = value; });
  handlers.get("pointerdown")({ pointerId: 1, pointerType: "touch", preventDefault() {} });
  assert.equal(held, true);
  h.emit("pointerdown"); h.emit("pointerup", { timeStamp: 150 }); holds.holdReleasePointer(2);
  assert.equal(h.actions(), 1); assert.equal(held, true, "secondary activation and release leave the primary pedal held");
  holds.holdReleasePointer(1);
  assert.equal(held, false, "the primary's own lift still releases reliably");
});


test("cancelled secondary contacts suppress their eventual native click even after retargeting", () => {
  for (const ending of ["move", "resize", "hidden", "lostpointercapture"]) {
    const h = secondaryRig(); h.emit("pointerdown");
    if (ending === "move") h.emit("pointermove", { clientX: 33 });
    else if (ending === "resize") h.fire("resize");
    else if (ending === "hidden") h.el.hidden = true;
    else h.emit("lostpointercapture");
    const target = ending === "move" ? h.el : { id: "retargeted-layer" };
    if (ending === "hidden") h.emit("pointerup", { clientX: 33, timeStamp: 200, target });
    else h.fire("pointerup", h.event({ clientX: 33, timeStamp: 200, target }));
    assert.equal(h.actions(), 0, ending + " never activates the bridge");
    let stopped = 0;
    const click = extra => h.fire("click", h.event({ clientX: 33, timeStamp: 220, target, detail: 1,
      preventDefault() { stopped++; }, stopImmediatePropagation() {}, ...extra }));
    click({ detail: 0 }); assert.equal(stopped, 0, "keyboard/AT still pass after " + ending);
    click({}); assert.equal(stopped, 1, "cancelled native compatibility click is blocked after " + ending);
    h.fire("pointerdown", h.event({ isPrimary: true, pointerId: 3 }));
    click({}); assert.equal(stopped, 1, "a new intentional contact still passes after " + ending);
  }
});


test("a reused canceled pointer ID does not swallow a new contact elsewhere", () => {
  const h = secondaryRig(); h.emit("pointerdown"); h.emit("pointercancel");
  const target = { id: "another-control" };
  h.fire("pointerdown", h.event({ target }));
  h.fire("pointerup", h.event({ target, timeStamp: 5000 }));
  let stopped = 0;
  h.fire("click", h.event({ target, timeStamp: 5020, detail: 1,
    preventDefault() { stopped++; }, stopImmediatePropagation() {} }));
  assert.equal(stopped, 0, "fresh contact remains native after pointer ID reuse");
});
