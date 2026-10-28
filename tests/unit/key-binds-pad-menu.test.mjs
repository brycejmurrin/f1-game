// key-binds-pad-menu.test.mjs — the pad in a menu: D-pad into focused controls, calibrated stick, pedal axes, held keys.
// Split from key-binds.test.mjs (T3-16); the VM rig is tests/helpers/key-binds-rig.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { read, boot, fakePad, plain, bootUi } from "../helpers/key-binds-rig.mjs";

// ---- the pad in a menu: value controls --------------------------------------

test("a D-pad direction is dispatched at the FOCUSED control, so an element's own key handler runs", () => {
  // Both tab rails (the garage categories, the circuit filter chips) own
  // their axis — MenuNav steps aside and the rail's own `onkeydown` cycles
  // it. That handler is on the ELEMENT, and an event dispatched at
  // `document` never descends to it: the pad sat on the garage's TEAM tab
  // forever while a real ArrowDown walked all fifteen (2026-09-08).
  const { Input, sb, fire, dispatched, navOpen } = boot();
  const { press, release } = fakePad(sb, fire);
  navOpen.on = true;
  const tab = { tagName: "BUTTON", id: "cs-tab-team", dispatchEvent: (e) => { dispatched.push(e); e.target = "tab"; return true; } };
  sb.document.activeElement = tab;
  press(13); Input.poll(); release(13); Input.poll();   // the neutral poll releases the direction (no auto-repeat)
  assert.equal(dispatched.length, 1, "one key for one press");
  assert.equal(dispatched[0].key, "ArrowDown");
  assert.equal(dispatched[0].target, "tab", "the focused control received it, not the document");
  assert.equal(dispatched[0].bubbles, true, "…and it still bubbles to document and window (TopModal, MenuNav)");
  // Nothing focused: the document is the fallback, so a first press can still seed focus.
  dispatched.length = 0;
  sb.document.activeElement = null;
  press(13); Input.poll(); release(13); Input.poll();
  assert.equal(dispatched.length, 1);
  assert.equal(dispatched[0].target, undefined, "dispatched at the document");
});

test("D-pad Left/Right on a focused <select> wraps past disabled options and fires change; Up/Down move rows", () => {
  const { Input, sb, fire, dispatched, navOpen } = boot();
  const { press, release } = fakePad(sb, fire);
  navOpen.on = true;
  const events = [], keys = [];
  const sel = { tagName: "SELECT", disabled: false,
    options: [{ disabled: false }, { disabled: false }, { disabled: true }], selectedIndex: 0,
    dispatchEvent: (e) => { events.push(e.type); if (e.type === "keydown") keys.push(e); return true; } };
  sb.document.activeElement = sel;
  press(15); Input.poll(); release(15); Input.poll();         // D-pad right
  assert.equal(sel.selectedIndex, 1, "the pad stepped the select itself — a synthetic ArrowRight has no UA default");
  assert.deepEqual(events, ["input", "change"], "the row's change listener hears it");
  press(15); Input.poll(); release(15); Input.poll();
  assert.equal(sel.selectedIndex, 0, "disabled last option is skipped and the row wraps");
  press(14); Input.poll(); release(14); Input.poll();         // D-pad left
  assert.equal(sel.selectedIndex, 1);
  assert.equal(events.filter((t) => t === "keydown").length, 0, "no keydown was dispatched for the owned axis");
  press(13); Input.poll(); release(13); Input.poll();         // D-pad down
  assert.equal(events.filter((t) => t === "keydown").length, 1, "the cross axis is a key, dispatched at the focused select");
  assert.equal(dispatched.length, 0, "…at the CONTROL, not at the document (an element's own handler must see it)");
  assert.equal(keys.pop().key, "ArrowDown", "the cross-axis arrow is the plain synthetic keydown MenuNav walks on");
});

test("D-pad Left/Right on a wrap:false <select> (LAPS) stops at its ends like the row chevrons", () => {
  const { Input, sb, fire, navOpen } = boot();
  const { press, release } = fakePad(sb, fire);
  navOpen.on = true;
  const events = [];
  const sel = { tagName: "SELECT", disabled: false, _srLive: { wrap: false },
    options: [{ disabled: false }, { disabled: false }, { disabled: false }], selectedIndex: 0,
    dispatchEvent: (e) => { events.push(e.type); return true; } };
  sb.document.activeElement = sel;
  press(14); Input.poll(); release(14); Input.poll();         // D-pad left at the first option
  assert.equal(sel.selectedIndex, 0, "no wrap from 3 LAPS to FULL");
  assert.deepEqual(events, [], "…and no change fires for the no-op");
  sel.selectedIndex = 2;
  press(15); Input.poll(); release(15); Input.poll();         // right at the last
  assert.equal(sel.selectedIndex, 2, "no wrap from FULL back to 3 LAPS");
  press(14); Input.poll(); release(14); Input.poll();
  assert.equal(sel.selectedIndex, 1, "inside the list it still steps");
  sel._srLive = { wrap: true }; sel.selectedIndex = 0;
  press(14); Input.poll(); release(14); Input.poll();
  assert.equal(sel.selectedIndex, 2, "an ordinary row still wraps");
});

test("D-pad on UI SIZE (40–200, step 0.25) moves a visible amount per press, on the step grid", () => {
  const { Input, sb, fire, navOpen } = boot();
  const { press, release } = fakePad(sb, fire);
  navOpen.on = true;
  const rng = { tagName: "INPUT", type: "range", disabled: false, min: "40", max: "200", step: "0.25", value: "100", dispatchEvent: () => true };
  sb.document.activeElement = rng;
  press(15); Input.poll(); release(15); Input.poll();
  assert.ok(+rng.value - 100 >= 4, `one press moved ${+rng.value - 100}, not 0.25 (640 presses end to end)`);
  assert.equal((+rng.value * 4) % 1, 0, "the value stays on the 0.25 grid");
  rng.value = "100"; rng.dataset = { padStep: "10" };
  press(14); Input.poll(); release(14); Input.poll();
  assert.equal(rng.value, "90", "data-pad-step overrides the 1/40 default");
  const fine = { tagName: "INPUT", type: "range", disabled: false, min: "0", max: "10", step: "1", value: "5", dispatchEvent: () => true };
  sb.document.activeElement = fine;
  press(15); Input.poll(); release(15); Input.poll();
  assert.equal(fine.value, "6", "a coarse slider never moves less than its own step");
});

test("D-pad Left/Right on a focused slider steps within min/max; a button gets the plain arrow", () => {
  const { Input, sb, fire, dispatched, navOpen } = boot();
  const { press, release } = fakePad(sb, fire);
  navOpen.on = true;
  const events = [];
  const rng = { tagName: "INPUT", type: "range", disabled: false, min: "40", max: "200", step: "0.25", value: "199.9", dispatchEvent: (e) => { events.push(e.type); return true; } };
  sb.document.activeElement = rng;
  press(15); Input.poll(); release(15); Input.poll();
  assert.equal(rng.value, "200", "stepped and clamped to max");
  press(15); Input.poll(); release(15); Input.poll();
  assert.equal(rng.value, "200", "at the end nothing changes");
  assert.deepEqual(events, ["input", "change"], "…and no event fires for a no-op");
  press(14); Input.poll(); release(14); Input.poll();
  assert.equal(rng.value, "196", "a pad press covers 1/40 of the 160-wide span");
  assert.equal(dispatched.length, 0);
  sb.document.activeElement = { tagName: "BUTTON", disabled: false };
  press(15); Input.poll(); release(15); Input.poll();
  assert.equal(dispatched.length, 1);
  assert.equal(dispatched[0].key, "ArrowRight");
  assert.equal(dispatched[0].type, "keydown", "a button's arrow is an ordinary move");
});

test("an open menu still takes a key that was already down, and the on-screen pedals are gated", () => {
  const { Input, key, anyOpen, navOpen, sb } = boot();
  // Title #overlay alone: navOpen true, anyOpen false — pad walks doors, but
  // on-screen GAS must still read (boot-page latch / travel specs). The gate
  // is anyOpen(), not navOpen().
  navOpen.on = true;
  assert.equal(sb.UiLayers.navOpen(), true);
  assert.equal(sb.UiLayers.anyOpen(), false);
  key("KeyW", true);
  assert.equal(Input.throttle(), true, "title navOpen must not mute a driving key");
  key("KeyW", false);

  // Real pause/settings: hold the key FIRST, then open — a pre-held key still
  // drives; a fresh keydown is refused (menuOverlayOpen). Touch pedals gate on
  // anyOpen(), matching the keyboard's menu gate, not title-only navOpen().
  key("KeyW", true);
  anyOpen.on = true;
  assert.equal(Input.throttle(), true, "a key held before the menu is not the touch path");
  assert.equal(Input.throttleLevel(), 1);
  // A keydown WHILE the menu is open was already refused (menuOverlayOpen).
  key("KeyS", true);
  assert.equal(Input.braking(), false, "keyboard keydowns stay gated; this change is the touch path");
  const src = read("js/input/input.js");
  // The gate is anyOpen(), asked live or latched once per poll() (PERF-HUNT-2 S5; throttle-latch.test.mjs).
  assert.match(src, /function navBlocksTouchLive\(\) \{ return !!\(window\.UiLayers && window\.UiLayers\.anyOpen\(\)\); \}/);
  assert.match(src, /function navBlocksTouch\(\) \{ return _navLatch < 0 \? navBlocksTouchLive\(\) : _navLatch === 1; \}/);
  assert.match(src, /navBlocksTouch\(\) \? 0 : buttonSteering\(\)/);
  assert.match(src, /navBlocksTouch\(\) \? 0 : analogShape\(touchSteering\(\), "touch"\)/);
  assert.match(src, /keyThrottle \|\| \(!navBlocksTouch\(\) && btnThrottle\)/);
  assert.match(src, /if \(btnThrottle && !navBlocksTouch\(\)\)/);
  assert.match(src, /if \(btnBrake && !navBlocksTouch\(\)\)/);
});

test("a calibrated stick still reaches full lock on BOTH sides, and a pedal on axis 2 is not free-look", () => {
  const { Input, sb, fire } = boot();
  const { pad } = fakePad(sb, fire);
  Input.setPadRest(0.1);
  const steerAt = (v) => { pad.axes[0] = v; Input.poll(); return Input.debugState().pad.steer; };
  assert.equal(steerAt(0.1), 0, "the calibrated rest is centre");
  assert.ok(Math.abs(steerAt(1) - 1) < 1e-9, "the short side used to top out at ~89%: " + steerAt(1));
  assert.ok(Math.abs(steerAt(-1) + 1) < 1e-9, "the long side still reaches full lock");
  pad.axes[0] = 0;
  pad.axes[2] = -1;   // a wheel's throttle pedal at rest
  Input.poll();
  assert.ok(Math.abs(Input.lookStick().x) > 0.5, "unmapped axis 2 is the right stick");
  Input.setPadAxisMap({ steer: 0, throttle: 2, brake: null });
  Input.poll();
  assert.equal(Input.lookStick().x, 0, "a pedal mapped to axis 2 does not pan free-look");
});

test("axis capture skips axes already chosen: releasing the wheel cannot become the throttle", () => {
  const { Input, sb, fire } = boot();
  const pad = { connected: true, mapping: "", id: "G29", axes: [0, -1, -1, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
  sb.navigator.getGamepads = () => [pad];
  fire("gamepadconnected", { gamepad: pad });
  Input.poll();
  let steer = null;
  Input.beginAxisCapture((axis) => { steer = axis; });
  pad.axes[0] = -1; Input.poll();
  assert.equal(steer, 0, "the wheel turned left on axis 0");
  // Step 2 arms while the wheel is still held at full lock: that is the snapshot.
  let got = null;
  Input.beginAxisCapture((axis) => { got = axis; }, { exclude: [steer] });
  pad.axes[0] = 0; Input.poll();   // the wheel springs back: |0 - -1| >= 0.45
  assert.equal(got, null, "the steering axis moving back is not the throttle");
  pad.axes[1] = 1; Input.poll();
  assert.equal(got, 1, "the pedal still wins");
  // Without the exclusion the old behaviour stands (the primitive is unchanged).
  pad.axes[0] = -1; pad.axes[1] = -1; Input.poll();
  let plain = null;
  Input.beginAxisCapture((axis) => { plain = axis; });
  pad.axes[0] = 0; Input.poll();
  assert.equal(plain, 0);
});

test("the wheel wizard passes the axes it already mapped, so steering and throttle release never leak forward", () => {
  const { Input, $, fire, sb } = bootUi(true);
  const pad = { connected: true, mapping: "", id: "G29", axes: [0, -1, -1, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
  sb.navigator.getGamepads = () => [pad];
  fire("gamepadconnected", { gamepad: pad });
  Input.poll();
  $("pm-pad-wheel").onclick();
  pad.axes[0] = -1; Input.poll();            // STEP 1: steer left and hold; step 2 arms at once (test timers are synchronous)
  pad.axes[0] = 0; Input.poll();             // the wheel is let go before the pedal is touched
  pad.axes[1] = 1; Input.poll();             // STEP 2: throttle
  pad.axes[1] = -1; Input.poll();            // the pedal comes back up while step 3 listens
  pad.axes[0] = -1; Input.poll();            // …and the wheel is turned again
  assert.equal($("pm-pad-wheel").textContent, "CANCEL", "neither released axis finished a step");
  pad.axes[2] = 1; Input.poll();             // STEP 3: brake
  const map = Input.getPadAxisMap();
  assert.equal(map.steer, 0);
  assert.equal(map.throttle, 1, "throttle is the pedal, not the wheel springing back");
  assert.equal(map.brake, 2);
  assert.equal($("pm-pad-wheel").textContent, "SET UP A WHEEL", "the wizard finished");
});

test("a wheel (mapping \"\") does not page menus from vendor buttons 6/7", () => {
  // PageUp/PageDown used to fire for every mapping; LB/RB (4/5) were already
  // gated to standard. A wheel's paddles (shift bindings 4/5) still navigate
  // rows via the dedicated path above — only the page keys must stay quiet.
  const { Input, sb, fire, dispatched, navOpen } = boot();
  const pad = { connected: true, mapping: "", id: "G29", axes: [0, -1, -1, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
  sb.navigator.getGamepads = () => [pad];
  fire("gamepadconnected", { gamepad: pad });
  navOpen.on = true;
  Input.poll();
  dispatched.length = 0;
  pad.buttons[6] = { pressed: true, value: 1 }; Input.poll();
  pad.buttons[7] = { pressed: true, value: 1 }; Input.poll();
  assert.deepEqual(dispatched.map((e) => e.key), [], "no PageUp/PageDown from a wheel's 6/7");
  // Control: a standard pad still pages on the triggers.
  const xbox = { connected: true, mapping: "standard", id: "Xbox", axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
  sb.navigator.getGamepads = () => [xbox];
  fire("gamepadconnected", { gamepad: xbox });
  Input.poll();
  dispatched.length = 0;
  xbox.buttons[6] = { pressed: true, value: 1 }; Input.poll();
  xbox.buttons[7] = { pressed: true, value: 1 }; Input.poll();
  assert.deepEqual(dispatched.map((e) => e.key), ["PageUp", "PageDown"]);
});

test("menu navigation subtracts the CALIBRATE STICK rest offset from the steer axis", () => {
  const { Input, sb, fire, dispatched, navOpen } = boot();
  let t = 0; sb.performance.now = () => t;
  const { pad } = fakePad(sb, fire);
  sb.MenuNav = { activeLayer: () => ({}), FOCUSABLE: "button" };
  // A stable layer object: the boot stub returns a fresh one per call, which
  // re-seeds focus (an ArrowDown) every poll and would drown the signal here.
  const layer = { id: "overlay", contains: () => true };
  sb.UiLayers.top = () => layer;
  navOpen.on = true;
  Input.poll();
  dispatched.length = 0;   // the one-off focus seed on menu open
  Input.setPadRest(0.3);
  pad.axes[0] = 0.3;   // a worn stick resting at its calibrated centre
  for (let f = 0; f < 120; f++) { t += 16; Input.poll(); }
  assert.deepEqual(dispatched.map((e) => e.key), [], "a calibrated rest is neutral to the menu, not a held direction");
  pad.axes[0] = 0.9;
  t += 16; Input.poll();
  assert.deepEqual(dispatched.map((e) => e.key), ["ArrowRight"], "a real push still navigates, once");
  pad.axes[0] = 0.3; t += 16; Input.poll();
  dispatched.length = 0;
  pad.axes[0] = -0.9;   // the long side: -0.9 - 0.3 is well past the dead zone
  t += 16; Input.poll();
  assert.deepEqual(dispatched.map((e) => e.key), ["ArrowLeft"]);
});

test("a printable PAUSE key typed into a focused <select> is type-ahead, not pause; Escape still pauses", () => {
  let paused = 0;
  const h = boot({ onPause: () => { paused++; } });
  const press = (code, key) => h.fire("keydown", { key, code, repeat: false, isTrusted: true, preventDefault() {}, target: { tagName: "SELECT" } });
  h.sb.document.activeElement = { tagName: "SELECT", id: "set-pad-type", matches: () => false };
  press("KeyP", "p");
  assert.equal(paused, 0, "P in a <select> selects PLAYSTATION/PRO/PULL");
  h.sb.UiLayers.inRace = () => true;
  press("Escape", "Escape");
  assert.equal(paused, 1, "Escape is unaffected by a focused <select>");
  h.sb.document.activeElement = null;
  h.fire("keydown", { key: "p", code: "KeyP", repeat: false, isTrusted: true, preventDefault() {}, target: { tagName: "BODY" } });
  assert.equal(paused, 2, "P with nothing focused still pauses");
});

test("a Cmd/Ctrl chord never latches a driving key (macOS sends no key-up for it); a plain press and Escape still work", () => {
  let paused = 0;
  const h = boot({ onPause: () => { paused++; } });
  const press = (code, mods) => h.fire("keydown", { key: code, code, repeat: false, isTrusted: true, preventDefault() {}, target: { tagName: "BODY" }, ...mods });
  const s = () => h.Input.debugState().key;
  press("KeyD", { metaKey: true });
  press("KeyS", { ctrlKey: true });
  press("ArrowLeft", { metaKey: true });
  press("KeyW", { ctrlKey: true });
  assert.deepEqual(plain({ l: s().left, r: s().right, t: s().throttle, b: s().brake }), { l: false, r: false, t: false, b: false },
    "chorded keydowns must not set any latch");
  press("KeyD", {});
  assert.equal(s().right, true, "the same key without a modifier still drives");
  h.fire("keyup", { key: "KeyD", code: "KeyD", repeat: false, isTrusted: true, preventDefault() {}, target: { tagName: "BODY" } });
  assert.equal(s().right, false);
  press("KeyP", { metaKey: false });
  assert.equal(paused, 1, "pause is handled above the chord gate");
});
