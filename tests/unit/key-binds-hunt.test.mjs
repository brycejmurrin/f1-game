// key-binds-hunt.test.mjs — round 2 input hunt (I-01..I-09), nintendo A/B, hold buttons, calibration status.
// Split from key-binds.test.mjs (T3-16); the VM rig is tests/helpers/key-binds-rig.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { read, boot, plain, bootUi, rawPad, setBtn, menuRig } from "../helpers/key-binds-rig.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

// ---- round 2 input hunt: I-01 / I-02 / I-05 / I-06 / I-08 / I-09 + nintendo A/B ---------------


test("a held D-pad direction re-arms immediately when a child menu layer opens", () => {
  const r = menuRig();
  const { Input, sb, dispatched, tick } = r;
  const pad = rawPad();
  let layer = { id: "parent", contains: () => true };
  sb.MenuNav.activeLayer = () => layer;
  sb.UiLayers.top = () => layer;
  sb.navigator.getGamepads = () => [pad];
  r.fire("gamepadconnected", { gamepad: pad });

  setBtn(pad, 13, true);
  tick();
  assert.deepEqual(dispatched.map((e) => e.key), ["ArrowDown"], "the initial hold moves the parent layer");
  dispatched.length = 0;

  // Keep the D-pad held while A opens a nested sheet. The child must receive
  // the held direction on its first poll instead of waiting for the parent's
  // 450 ms repeat deadline.
  layer = { id: "child", contains: () => true };
  tick();
  assert.deepEqual(dispatched.map((e) => e.key), ["ArrowDown"], "the child layer gets an immediate direction step");
});

test("I-01: a mapping-\"\" pad (wheel) resting at -1 on axes 1-3 does not walk the menu", () => {
  const { Input, sb, fire, dispatched, tick } = menuRig();
  const pad = rawPad({ mapping: "", id: "Logitech G29 Driving Force Racing Wheel", axes: [0, -1, -1, -1] });
  sb.navigator.getGamepads = () => [pad];
  fire("gamepadconnected", { gamepad: pad });
  tick(); dispatched.length = 0;
  for (let f = 0; f < 120; f++) tick();
  assert.deepEqual(dispatched.map((e) => e.key), [], "pedals at rest are not sticks");
  // Its d-pad numbering is the maker's: buttons 12-15 navigate nothing.
  setBtn(pad, 13, true); tick(); setBtn(pad, 13, false); tick();
  assert.deepEqual(dispatched.map((e) => e.key), [], "button 13 on a wheel is not D-pad down");
  // The steering axis the wheel reports does navigate left/right.
  pad.axes[0] = 0.9; tick();
  assert.deepEqual(dispatched.map((e) => e.key), ["ArrowRight"], "the steer axis moves along a row");
});

test("I-01: a mapping-\"\" pad's buttons 14/15 do not steer; a standard pad's still do", () => {
  const { Input, sb, fire } = boot();
  let t = 0; sb.performance.now = () => t;
  const pad = rawPad({ mapping: "" , id: "Generic HID wheel" });
  sb.navigator.getGamepads = () => [pad];
  fire("gamepadconnected", { gamepad: pad });
  setBtn(pad, 14, true);
  for (let i = 0; i < 30; i++) { t += 16; Input.poll(); Input.steer(1 / 60); }
  assert.equal(Input.debugState().pad.steer, 0, "an unknown button 14 does not slam full lock");
  const std = rawPad({ id: "Pad Std" });
  sb.navigator.getGamepads = () => [std];
  fire("gamepadconnected", { gamepad: std });
  setBtn(std, 14, true);
  for (let i = 0; i < 30; i++) { t += 16; Input.poll(); Input.steer(1 / 60); }
  assert.ok(Input.debugState().pad.steer < 0, "control: the standard d-pad left steers");
});

test("missing gamepad snapshot recovers on elapsed time, not display-frame count", () => {
  const { Input, sb, fire } = boot();
  let t = 0; sb.performance.now = () => t;
  const pad = rawPad({ id: "Recover pad" });
  sb.navigator.getGamepads = () => [pad];
  fire("gamepadconnected", { gamepad: pad });
  Input.poll();
  assert.equal(Input.debugState().pad.connected, true);
  // One empty snapshot (focus hole / stale slot) — no gamepaddisconnected.
  sb.navigator.getGamepads = () => [];
  Input.poll();
  assert.equal(Input.debugState().pad.connected, false);
  // Pad returns without a connection event. At 120 Hz the old 60-frame gate
  // needed ~500 ms; elapsed-time recovery must see it inside the fast window.
  sb.navigator.getGamepads = () => [pad];
  t += 99;
  Input.poll();
  assert.equal(Input.debugState().pad.connected, true, "recovers within ~100 ms independent of poll rate");
  // Long absence: after the fast window a failed re-probe arms the ~1 s gap.
  sb.navigator.getGamepads = () => [];
  Input.poll();
  t += 300;
  Input.poll();   // age > fast window, still missing → schedule slow probe
  assert.equal(Input.debugState().pad.connected, false);
  sb.navigator.getGamepads = () => [pad];
  Input.poll();
  assert.equal(Input.debugState().pad.connected, false, "still in the slow-probe gap after the fast window");
  t += 1000;
  Input.poll();
  assert.equal(Input.debugState().pad.connected, true, "recovers on the next ~1 s probe");
});

test("wheel menu directions honor steering inversion and the signed calibrated centre", () => {
  for (const mapping of ["", "standard"]) for (const invert of [1, -1]) for (const rest of [-0.1, 0, 0.2]) {
    const { Input, sb, fire, dispatched, tick } = menuRig();
    const pad = rawPad({ mapping, id: mapping ? "Standard pad" : "Wheel", axes: [rest * invert, 0, -1, -1] });
    Input.setPadAxisMap({ steer: 0, steerInvert: invert, throttle: 2, brake: 3 });
    Input.setPadRest(rest);
    sb.navigator.getGamepads = () => [pad];
    fire("gamepadconnected", { gamepad: pad });
    tick();
    assert.deepEqual(dispatched.map((e) => e.key), [], `centre: mapping ${mapping}, invert ${invert}, rest ${rest}`);
    for (const [offset, key] of [[-0.7, "ArrowLeft"], [0.5, "ArrowRight"]]) {
      pad.axes[0] = +((rest + offset) * invert).toFixed(2); tick();
      assert.deepEqual(dispatched.map((e) => e.key), [key], `mapping ${mapping}, invert ${invert}, rest ${rest}, raw ${pad.axes[0]}`);
      dispatched.length = 0;
      pad.axes[0] = rest * invert; tick();
      assert.deepEqual(dispatched.map((e) => e.key), [], "returning to calibrated centre stops menu movement");
    }
  }
});

test("I-01: a wheel's bound paddles navigate up/down in a menu", () => {
  const { Input, sb, fire, dispatched, tick } = menuRig();
  const pad = rawPad({ mapping: "", id: "Wheel", axes: [0, -1, -1, -1] });
  sb.navigator.getGamepads = () => [pad];
  fire("gamepadconnected", { gamepad: pad });
  tick(); dispatched.length = 0;
  const [down] = plain(Input.getPadMap().shiftUp).filter((b) => b != null);
  setBtn(pad, down, true); tick();
  assert.deepEqual(dispatched.map((e) => e.key), ["ArrowDown"], "the shift-up paddle is DOWN");
});

test("I-02: CALIBRATE STICK is kept per pad; another centred pad steers 0", () => {
  const { Input, sb, fire } = boot();
  const A = rawPad({ id: "Pad A", index: 0, axes: [0.2, 0, 0, 0] });
  const B = rawPad({ id: "Pad B", index: 1 });
  sb.navigator.getGamepads = () => [A];
  fire("gamepadconnected", { gamepad: A });
  Input.poll();
  assert.equal(Input.calibratePad(), true);
  Input.poll();
  assert.equal(Input.debugState().pad.steer, 0, "pad A is calibrated");
  assert.deepEqual(plain(Input.padRestStore()), { "Pad A": 0.2 });
  sb.navigator.getGamepads = () => [B];
  fire("gamepadconnected", { gamepad: B });
  Input.poll();
  assert.equal(Input.debugState().pad.steer, 0, "a different centred pad does not inherit A's pull");
  assert.equal(Input.padRest(), 0);
  sb.navigator.getGamepads = () => [A];
  Input.poll();
  assert.equal(Input.debugState().pad.steer, 0, "…and A keeps its own offset");
  assert.ok(Math.abs(Input.padRest() - 0.2) < 1e-9);
});

test("I-02: a stored per-pad map loads; the old scalar goes to the first pad that drives", () => {
  const { Input, sb, fire } = boot();
  Input.setPadRest({ "Pad A": 0.2, "Pad C": 9, "Pad D": "x" });
  assert.deepEqual(plain(Input.padRestStore()), { "Pad A": 0.2 }, "junk entries are dropped");
  const B = rawPad({ id: "Pad B" });
  sb.navigator.getGamepads = () => [B];
  fire("gamepadconnected", { gamepad: B });
  Input.poll();
  assert.equal(Input.padRest(), 0, "an unlisted pad has no offset");
  // Legacy scalar (apex26.padRest saved before per-pad offsets).
  Input.setPadRest(0.2);
  assert.equal(Input.padRestStore(), 0.2, "kept as a number until a pad claims it");
  const A = rawPad({ id: "Pad A", index: 1, axes: [0.2, 0, 0, 0] });
  sb.navigator.getGamepads = () => [A];
  fire("gamepadconnected", { gamepad: A });
  Input.poll();
  assert.equal(Input.debugState().pad.steer, 0, "the pad driving at boot owns the old offset");
  assert.deepEqual(plain(Input.padRestStore()), { "Pad A": 0.2 });
  sb.navigator.getGamepads = () => [B];
  Input.poll();
  assert.equal(Input.debugState().pad.steer, 0);
  assert.equal(Input.padRest(), 0, "and the second pad does not inherit it");
});

test("I-05: a set-up wheel is linear with no dead zone by default; the DEAD ZONE row still overrides", () => {
  const { Input, sb, fire } = boot();
  Input.setSteerExpo(2.4);
  const pad = rawPad({ mapping: "", id: "Wheel", axes: [0, -1, -1, -1] });
  sb.navigator.getGamepads = () => [pad];
  fire("gamepadconnected", { gamepad: pad });
  Input.setPadAxisMap({ steer: 0, throttle: 2, brake: 3 });
  const road = () => { Input.poll(); return Math.pow(Math.abs(Input.steer()), 2.4); };   // game.js raises the command to STEER_EXPO
  pad.axes[0] = 0.03;
  assert.ok(Math.abs(road() - 0.03) < 1e-6, "3 % of rotation is 3 % of lock, not swallowed by a 5 % dead zone");
  pad.axes[0] = 0.1;
  assert.ok(Math.abs(road() - 0.1) < 1e-6, "linear: 10 % of rotation is 10 % of lock");
  Input.setPadDeadzone(0.1);
  pad.axes[0] = 0.08;
  assert.equal(road(), 0, "a DEAD ZONE the player chose still applies");
  // Control: a standard pad keeps the thumbstick shaping.
  const std = rawPad({ id: "Pad Std", axes: [0.03, 0, 0, 0] });
  sb.navigator.getGamepads = () => [std];
  fire("gamepadconnected", { gamepad: std });
  Input.setPadDeadzone(0.05);
  assert.equal(road(), 0, "a stick's 5 % dead zone is unchanged");
});

test("I-06: a pedal with a measured rest/far reads (raw - rest)/(far - rest); a brake on the throttle's axis is refused", () => {
  const { Input, sb, fire } = boot();
  const pad = rawPad({ mapping: "", id: "Wheel", axes: [0, 0, 0, 0] });
  sb.navigator.getGamepads = () => [pad];
  fire("gamepadconnected", { gamepad: pad });
  Input.setPadAxisMap({ steer: 0, throttle: 1, brake: 2, throttleRest: 0, throttleFar: 1, brakeRest: -1, brakeFar: 1 });
  pad.axes[1] = 0.3; Input.poll();
  pad.axes[1] = 0; Input.poll();
  assert.equal(Input.throttleLevel(), 0, "a pedal resting at 0 reads 0, not 50 %");
  pad.axes[1] = 1; Input.poll();
  assert.equal(Input.throttleLevel(), 1);
  pad.axes[1] = 0.56; Input.poll();
  assert.ok(Math.abs(Input.throttleLevel() - (0.56 - 0.12) / 0.88) < 1e-9);
  const m = Input.getPadAxisMap();
  assert.deepEqual([m.throttleRest, m.throttleFar, m.brakeRest, m.brakeFar], [0, 1, -1, 1], "the travel ends round-trip");
  const same = Input.setPadAxisMap({ steer: 0, throttle: 2, brake: 2, brakeRest: 0, brakeFar: 1 });
  assert.equal(same.throttle, 2);
  assert.equal(same.brake, null, "one axis cannot be both pedals");
  assert.equal(same.brakeFar, null);
});

test("I-06: the wheel wizard persists each pedal's rest and far; a brake press on the throttle's axis is refused with a message", () => {
  const disk = {};
  const { Input, $, fire, sb } = bootUi(true, {}, disk);
  const pad = rawPad({ mapping: "", id: "Wheel", axes: [0, 0, 0, -1] });
  sb.navigator.getGamepads = () => [pad];
  fire("gamepadconnected", { gamepad: pad });
  Input.poll();
  $("pm-pad-wheel").onclick();
  pad.axes[0] = -1; Input.poll();        // steer
  pad.axes[0] = 0; Input.poll();
  pad.axes[1] = 0.5; Input.poll();       // throttle captured at 50 % travel on an axis resting at 0
  pad.axes[1] = 1; Input.poll();         // …and pressed on to its far end (tracked after the capture)
  pad.axes[1] = 0; Input.poll();         // released: this is NOT a brake
  assert.match($("pm-pad-calib-note").textContent || "", /THROTTLE's axis/, "the same-axis press is refused with a message");
  assert.equal($("pm-pad-wheel").textContent, "CANCEL", "the wizard is still waiting for the brake");
  pad.axes[3] = 1; Input.poll();         // brake on its own axis
  assert.equal($("pm-pad-wheel").textContent, "SET UP A WHEEL", "finished");
  assert.equal(disk.padAxes.throttle, 1);
  assert.equal(disk.padAxes.brake, 3);
  assert.equal(disk.padAxes.throttleRest, 0);
  assert.equal(disk.padAxes.throttleFar, 1);
  assert.equal(disk.padAxes.brakeRest, -1);
  assert.equal(disk.padAxes.brakeFar, 1);
});

test("I-08: a spare pad unplugging does not turn the driving pad's held buttons into fresh presses", () => {
  const { Input, sb, fire } = boot();
  const A = rawPad({ id: "Pad A", index: 0 });
  const B = rawPad({ id: "Pad B", index: 1 });
  sb.navigator.getGamepads = () => [A, B];
  fire("gamepadconnected", { gamepad: A });
  Input.poll();
  setBtn(A, 2, true);                    // boost toggle, held
  Input.poll();
  assert.equal(Input.consumeBoostToggle(), true, "the press toggled once");
  Input.poll();
  assert.equal(Input.consumeBoostToggle(), false, "held, not re-pressed");
  B.connected = false;
  sb.navigator.getGamepads = () => [A, B];
  fire("gamepaddisconnected", { gamepad: B });
  Input.poll();
  assert.equal(Input.consumeBoostToggle(), false, "the held button is not a new press after B left");
  // `still` honours .connected: with only a dead slot left, the pad is gone.
  A.connected = false;
  fire("gamepaddisconnected", { gamepad: A });
  assert.equal(Input.padPresent(), false);
});

test("nintendo label mode confirms on the physical A (standard index 1) and backs on B (index 0)", () => {
  const { Input, sb, fire, dispatched, tick, clicks } = (() => { const r = menuRig(); return r; })();
  Input.setPadLabelMode("nintendo");
  const pad = rawPad({ id: "Pro Controller" });
  sb.navigator.getGamepads = () => [pad];
  fire("gamepadconnected", { gamepad: pad });
  tick(); dispatched.length = 0;
  let r = { clicks: 0 };
  sb.document.activeElement.click = () => { r.clicks++; };
  setBtn(pad, 0, true); tick(); setBtn(pad, 0, false); tick();
  assert.equal(r.clicks, 0, "bottom button is BACK on a Nintendo pad");
  assert.deepEqual(dispatched.map((e) => e.key), ["Escape"]);
  dispatched.length = 0;
  setBtn(pad, 1, true); tick(); setBtn(pad, 1, false); tick();
  assert.equal(r.clicks, 1, "the right button (physical A) confirms");
  assert.deepEqual(dispatched.map((e) => e.key), []);
  Input.setPadLabelMode("xbox");
  setBtn(pad, 0, true); tick(); setBtn(pad, 0, false); tick();
  assert.equal(r.clicks, 2, "control: Xbox labels keep A = index 0");
});

test("I-09: a right/middle mouse button neither presses a hold button nor fires a tap; touch and left mouse do", () => {
  const ctx = vm.createContext({ Math, Set, Map, Object, Array, document: null });
  vm.runInContext(read("js/input/pedal-travel.js"), ctx, { filename: absSrc("js/input/pedal-travel.js") });
  vm.runInContext(read("js/input/hold-buttons.js"), ctx, { filename: absSrc("js/input/hold-buttons.js") });
  const InputHoldButtons = vm.runInContext("InputHoldButtons", ctx);
  const els = {};
  ctx.document = { getElementById: (id) => (els[id] ||= { l: {}, addEventListener(t, f) { this.l[t] = f; }, setPointerCapture() {} }) };
  const hb = InputHoldButtons.create({ clamp: (v, a, b) => Math.min(b, Math.max(a, v)), beforeReleaseAll() {} });
  let held = false, taps = 0;
  hb.wireHold("gas", (v) => { held = v; });
  hb.wireTap("boost", () => { taps++; });
  const down = (id, e) => els[id].l.pointerdown(Object.assign({ pointerId: 1, preventDefault() {} }, e));
  down("gas", { pointerType: "mouse", button: 2 });
  assert.equal(held, false, "right-click does not hold");
  down("boost", { pointerType: "mouse", button: 2 });
  down("boost", { pointerType: "mouse", button: 1 });
  assert.equal(taps, 0);
  down("gas", { pointerType: "mouse", button: 0 });
  assert.equal(held, true, "left mouse holds");
  els.gas.l.pointerup({ pointerId: 1 });
  assert.equal(held, false);
  down("gas", { pointerType: "touch", button: 0 });
  assert.equal(held, true, "touch holds");
  down("boost", { pointerType: "touch", button: 0 });
  assert.equal(taps, 1);
});

test("hold teardown detects hidden ancestors while visible capture steals keep their hold", () => {
  for (const teardown of ["hidden", "display"]) {
    const ancestor = { hidden: false, display: "block", visibility: "visible" };
    const button = { l: {}, isConnected: true, parentElement: { parentElement: ancestor },
      addEventListener(t, fn) { this.l[t] = fn; }, setPointerCapture() {} };
    const ctx = vm.createContext({ document: { getElementById: () => button },
      getComputedStyle: (el) => ({ display: el.display || "block", visibility: el.visibility || "visible" }) });
    vm.runInContext(read("js/input/pedal-travel.js"), ctx, { filename: absSrc("js/input/pedal-travel.js") });
    vm.runInContext(read("js/input/hold-buttons.js"), ctx, { filename: absSrc("js/input/hold-buttons.js") });
    const hb = vm.runInContext("InputHoldButtons", ctx).create({
      clamp: (v, a, b) => Math.min(b, Math.max(a, v)), beforeReleaseAll() {} });
    let held = false;
    hb.wireHold("gas", (v) => { held = v; });
    const event = { pointerId: 7, pointerType: "touch", preventDefault() {} };
    button.l.pointerdown(event);
    ancestor.visibility = "hidden"; // descendants can explicitly override inherited visibility
    button.l.lostpointercapture(event);
    assert.equal(held, true, "a visible descendant survives a capture steal");
    if (teardown === "hidden") ancestor.hidden = true;
    else ancestor.display = "none";
    button.l.lostpointercapture(event);
    assert.equal(held, false, teardown + " ancestor releases the held button");
    assert.deepEqual(Array.from(hb.pointerCounts()), [0]);
    const dispatched = { ...event, isTrusted: false };   // only a synthetic event can press a hidden button
    button.l.pointerdown(dispatched);
    button.l.lostpointercapture(dispatched);
    assert.equal(held, true, "an already-hidden press is not a new teardown");
    hb.holdReleaseAll();
  }
});

test("a trusted hold press skips the computed-style walk; dead-band moves report the level once", () => {
  let styleReads = 0;
  const grand = { hidden: false }, parent = { hidden: false, parentElement: grand };
  const button = { l: {}, isConnected: true, hidden: false, parentElement: parent,
    addEventListener(t, fn) { this.l[t] = fn; }, setPointerCapture() {} };
  const ctx = vm.createContext({ document: { getElementById: () => button },
    getComputedStyle: () => { styleReads++; return { display: "block", visibility: "visible" }; } });
  vm.runInContext(read("js/input/pedal-travel.js"), ctx, { filename: absSrc("js/input/pedal-travel.js") });
  vm.runInContext(read("js/input/hold-buttons.js"), ctx, { filename: absSrc("js/input/hold-buttons.js") });
  const hb = vm.runInContext("InputHoldButtons", ctx).create({ clamp: (v, a, b) => Math.min(b, Math.max(a, v)), beforeReleaseAll() {} });
  const levels = [];
  let held = false;
  hb.wireHold("gas", (v) => { held = v; }, (v) => levels.push(v));
  const ev = (extra) => ({ pointerId: 3, pointerType: "touch", clientX: 100, clientY: 200, preventDefault() {}, ...extra });
  button.l.pointerdown(ev({ isTrusted: true }));
  assert.equal(held, true);
  assert.equal(styleReads, 0, "a trusted press read getComputedStyle");
  for (let i = 0; i < 20; i++) button.l.pointermove(ev({ clientY: 200 - (i % 5) }));   // inside the dead band
  assert.deepEqual(levels, [1], "20 dead-band moves re-reported an unchanged level");
  button.l.pointermove(ev({ clientY: 100 }));
  assert.equal(levels.length, 2, "a real ease still reports");
  assert.ok(levels[1] < 1);
  button.l.pointerup(ev({}));
  assert.deepEqual([held, levels.at(-1)], [false, 0], "lift releases and reports 0");
  hb.holdReleaseAll();
  button.l.pointerdown(ev({ isTrusted: true }));
  assert.equal(levels.at(-1), 1, "after a release-all the next press reports full travel again");
  styleReads = 0;
  hb.holdReleaseAll();
  button.l.pointerdown(ev({ isTrusted: false }));
  assert.ok(styleReads > 0, "a synthetic press still checks visibility");
  // lostpointercapture looks the button up by element (Map), and a visible one keeps its hold.
  button.l.lostpointercapture(ev({}));
  assert.equal(held, true);
});

test("analog hold buttons preserve the strongest remaining touch across release paths", () => {
  for (const axis of ["y", "x"]) for (const releasePath of ["pointerup", "pointercancel", "global", "lostpointercapture"]) {
    const button = { l: {}, isConnected: true, hidden: false,
      addEventListener(t, fn) { this.l[t] = fn; }, setPointerCapture() {} };
    const ctx = vm.createContext({ document: { getElementById: () => button },
      getComputedStyle: () => ({ display: "block", visibility: "visible" }) });
    vm.runInContext(read("js/input/pedal-travel.js"), ctx, { filename: absSrc("js/input/pedal-travel.js") });
  vm.runInContext(read("js/input/hold-buttons.js"), ctx, { filename: absSrc("js/input/hold-buttons.js") });
    const api = vm.runInContext("InputHoldButtons", ctx);
    const resetArgs = [], edges = [], values = [];
    const hb = api.create({ clamp: (v, a, b) => Math.min(b, Math.max(a, v)), beforeReleaseAll: (v) => resetArgs.push(v) });
    hb.wireHold("pedal", (v) => edges.push(v), (v) => values.push(v), { axis, dir: 1 });
    const event = (pointerId, distance = 0) => ({ pointerId, pointerType: "touch",
      clientX: 200 - distance, clientY: 200 - distance, preventDefault() {} });
    const current = () => values.at(-1);
    button.l.pointerdown(event(1));
    button.l.pointermove(event(1, 57));
    assert.equal(current(), 0.5, "single-contact easing is unchanged");
    button.l.pointerdown(event(2));
    button.l.pointermove(event(2, 102));
    assert.equal(current(), 0.5, "a weaker second contact cannot reduce the first");
    button.l.pointermove(event(2));
    assert.equal(current(), 1, "the strongest contact wins regardless of event order");
    const release = (id) => {
      if (releasePath === "global") hb.holdReleasePointer(id);
      else {
        if (releasePath === "lostpointercapture") button.hidden = true;
        button.l[releasePath](event(id));
      }
    };
    release(2);
    assert.equal(current(), 0.5, axis + "/" + releasePath + " restores the survivor's travel");
    assert.deepEqual(edges, [true], "second contact and its release never retrigger a latch");
    button.l.pointerup(event(2));
    assert.equal(current(), 0.5, "a duplicate local release after global capture is harmless");
    release(1);
    assert.equal(current(), 0);
    assert.deepEqual(edges, [true, false]);
    button.hidden = false;
    button.l.pointerdown(event(3));
    button.l.pointermove(event(3, 102));
    hb.holdReleaseAll(true);
    assert.equal(current(), 0);
    assert.deepEqual(resetArgs, [true], "release-all preserves the caller's latch policy");
    button.l.pointermove(event(3));
    assert.equal(current(), 0, "reset clears both anchors and analog levels");
    button.l.pointerdown(event(4));
    assert.equal(current(), 1);
    button.l.pointerup(event(4));
    assert.equal(current(), 0, "a new gesture inherits no stale contacts");
  }
});

test("deferred stick calibration belongs to the visible Controls request", () => {
  let leave;
  const disk = {};
  const r = bootUi(true, {}, disk, (g) => { g.SettingsNav = { onLeave: (fn) => { leave = fn; } }; });
  const { Input, $, kb, sb, fire } = r;
  const timers = new Map(); let timerId = 0;
  sb.setTimeout = (fn) => { timers.set(++timerId, fn); return timerId; };
  sb.clearTimeout = (id) => timers.delete(id);
  const flush = () => { const work = [...timers.values()]; timers.clear(); work.forEach((fn) => fn()); };
  const pad = rawPad({ id: "Calibration pad", axes: [0.2, 0, 0, 0] });
  sb.navigator.getGamepads = () => [pad];
  fire("gamepadconnected", { gamepad: pad }); Input.poll();
  $("pm-pad-calib").onclick(); leave("controls"); flush();
  assert.equal(disk.padRest, undefined, "BACK must not persist the delayed centre");
  $("pm-pad-calib").onclick(); kb.disarmAll(); flush();
  assert.equal(disk.padRest, undefined, "CLOSE/RESUME must not persist the delayed centre");
  $("pm-pad-calib").onclick(); $("pm-pad-calib").onclick();
  assert.equal(timers.size, 1, "a newer request replaces the older timer");
  flush();
  assert.deepEqual(plain(disk.padRest), { "Calibration pad": 0.2 }, "completed request remains persistent");
  delete disk.padRest;
  $("pm-pad-calib").onclick();
  const other = rawPad({ id: "Other pad", index: 1, axes: [0.3, 0, 0, 0] });
  sb.navigator.getGamepads = () => [other]; flush();
  assert.equal(disk.padRest, undefined, "another pad cannot own an outstanding request");
  sb.navigator.getGamepads = () => [pad];
  $("pm-pad-calib").onclick(); $("pm-pad-calib").closest = () => ({}); flush();
  assert.equal(disk.padRest, undefined, "a hidden owner cannot save even without a leave notification");
});

test("calibration status announces wizard progress without moving focus", () => {
  const { Input, $, sb, fire } = bootUi(true, {}, {});
  const note = $("pm-pad-calib-note");
  assert.equal(note.attrs.role, "status");
  assert.equal(note.attrs["aria-live"], "polite");
  assert.equal(note.attrs["aria-atomic"], "true");
  $("pm-pad-calib").onclick(); assert.match(note.textContent, /No controller/);
  const pad = rawPad({ mapping: "", id: "Accessible wheel", axes: [0, -1, -1, -1] });
  sb.navigator.getGamepads = () => [pad]; fire("gamepadconnected", { gamepad: pad }); Input.poll();
  $("pm-pad-wheel").focus(); const focus = sb.document.activeElement;
  $("pm-pad-wheel").onclick(); assert.match(note.textContent, /Turn the wheel LEFT/);
  pad.axes[0] = -1; Input.poll(); assert.match(note.textContent, /THROTTLE/);
  assert.equal(sb.document.activeElement, focus);
  $("pm-pad-wheel").onclick(); assert.match(note.textContent, /cancelled/);
  assert.equal(sb.document.activeElement, focus);
});

test("phone ownership, parked diagnostics and controls refresher preserve driving state", () => {
  const disk = { onboarded: 7, onboardRaces: 9, coachStats: { corners: 12 } };
  const r = bootUi(true, {}, disk, (g) => {
    g.__ctx = vm.createContext(g);
    vm.runInContext(read("js/ui/onboard.js"), g.__ctx, { filename: absSrc("js/ui/onboard.js") });
  });
  const { Input, $, sb, kb, fire } = r;
  let now = 100; sb.performance.now = () => now;
  Input.remoteSample({ thr: 0, brk: 0, roll: 0 });
  assert.equal(Input.activeInputSource(), "keyboard", "idle phone does not steal labels");
  Input.remoteSample({ thr: 0.8, brk: 0, roll: 10 });
  assert.equal(Input.activeInputSource(), "phone");
  assert.equal(Input.throttleLevel(), 0.8);
  r.sb.UiLayers.navOpen = () => true;
  assert.equal(Input.throttleLevel(), 0);
  assert.equal(Input.steer(), 0);
  assert.equal(Input.remoteEvent("overtake"), false);
  assert.equal(Input.consumeOvertake(), false);
  assert.equal(Input.remoteEvent("navDown"), true, "menu navigation remains available");
  r.sb.UiLayers.navOpen = () => false;
  assert.equal(Input.remoteEvent("overtake"), true);
  assert.equal(Input.consumeOvertake(), true);
  Input.remoteLost();
  const pad = rawPad({ id: "Preview pad", axes: [0.2, 0, 0, 0] });
  sb.navigator.getGamepads = () => [pad]; fire("gamepadconnected", { gamepad: pad }); Input.poll();
  Input.calibratePad(); Input.setPadAxisMap({ steer: 0, throttle: 1, brake: 2, throttleRest: 0, throttleFar: 1, brakeRest: 0, brakeFar: 1 });
  pad.axes[1] = 1; pad.axes[2] = 0.5;
  r.sb.UiLayers.navOpen = () => true; Input.poll();
  const before = plain(Input.debugState());
  const values = Input.parkedPadPreview();
  assert.equal(values.steer, 0); assert.equal(values.throttle, 1);
  assert.ok(values.brake > 0 && values.brake < 1);
  assert.deepEqual(plain(Input.debugState()), before, "preview must not change input latches or settings");
  const timers = new Map(); let id = 0;
  sb.setTimeout = (fn) => { timers.set(++id, fn); return id; }; sb.clearTimeout = (i) => timers.delete(i);
  const preview = $("pm-pad-section").kids.find((n) => n.id === "pm-pad-preview");
  preview.onclick(); assert.equal(preview.attrs["aria-expanded"], "true");
  assert.equal(timers.size, 1); kb.disarmAll(); assert.equal(timers.size, 0);
  assert.equal(preview.attrs["aria-expanded"], "false");
  const Onboard = vm.runInContext("Onboard", sb.__ctx);
  const lines = [];
  const g = { store: { get: (k, d) => disk[k] ?? d, set: (k, v) => { disk[k] = v; } }, state: "race", paused: false,
    player: { otArmed: true, xArmed: true, aeroX: 0 }, raceAeroMode: "auto", announce: (line) => { lines.push(line); return true; } };
  const coach = Onboard.create(g);
  const refresher = $("htp-controls").kids.find((n) => n.id === "htp-controls-refresher");
  assert.ok(refresher, "reminders belong inside the scrolling Controls section");
  assert.ok(!$("howtoplay").kids.some((n) => n.id === "htp-controls-refresher"), "no controls outside the help sheet");
  refresher.onclick(); assert.equal(coach.state().shown, 0); assert.equal(coach.state().races, 0);
  assert.deepEqual(disk.coachStats, { corners: 12 });
  r.sb.UiLayers.navOpen = () => false; now++;
  Input.remoteSample({ thr: 1, roll: 0 }); coach.tick(1);
  assert.match(lines[0], /TAP OVERTAKE/);
  g.player.otArmed = false; coach.tick(9);
  assert.equal(lines.length, 1, "auto aero keeps its existing suppression");
  Input.setKeyBinding("aero", 0, "KeyG"); r.press("KeyG");
  g.raceAeroMode = "manual"; coach.tick(1);
  assert.match(lines[1], /ACTIVE AERO — G/, "physical keyboard switches subsequent hints");
});
