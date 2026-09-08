// key-binds.test.mjs — the rebindable driving keys in js/input/input.js.
//
// Every driving key used to be a literal in one switch; it is a TABLE now
// (KEY_ACTIONS / keyMap), which the CONTROLS page edits and HOW TO PLAY reads.
// The real input.js runs in a VM with just enough window for init(); keys are
// pressed by calling the listeners it registered.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

function boot() {
  const listeners = {};
  // Keydowns the pad synthesises land here when they go to the document (the
  // fallback target); one that reaches a focused control is recorded by that
  // control's own fake dispatchEvent instead — which is the point of the test.
  const dispatched = [];
  const navOpen = { on: false };
  const el = () => ({
    addEventListener() {}, removeEventListener() {}, style: {}, dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    setAttribute() {}, getAttribute: () => null, children: [],
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 300, height: 300 }),
    setPointerCapture() {}, releasePointerCapture() {}, hasPointerCapture: () => false,
  });
  const sb = {
    Math, Object, Array, Number, isFinite, JSON, Map, Set, Date, String, RegExp,
    performance: { now: () => 0 },
    Log: { info() {}, warn() {}, debug() {}, error() {}, enabled: () => false },
    addEventListener: (t, f) => { (listeners[t] ||= []).push(f); },
    removeEventListener() {}, setTimeout: () => 0, clearTimeout() {},
    navigator: {}, screen: {}, matchMedia: () => ({ matches: false, addEventListener() {} }),
    document: {
      addEventListener: (t, f) => { (listeners[t] ||= []).push(f); }, removeEventListener() {},
      getElementById: el, querySelector: el, querySelectorAll: () => [], hidden: false,
      activeElement: null,
      dispatchEvent: (e) => { dispatched.push(e); return true; },
      body: { classList: { add() {}, remove() {}, toggle() {} } },
    },
    UiLayers: { navOpen: () => navOpen.on, anyOpen: () => navOpen.on, top: () => (navOpen.on ? { id: "pmsettings", contains: () => true } : null) },
  };
  sb.Event = class { constructor(type, init) { this.type = type; Object.assign(this, init || {}); } };
  sb.KeyboardEvent = class extends sb.Event {};
  sb.window = sb;
  const ctx = vm.createContext(sb);
  vm.runInContext(read("js/core/mat4.js"), ctx, { filename: "js/core/mat4.js" });
  vm.runInContext(read("js/input/input.js"), ctx, { filename: "js/input/input.js" });
  const Input = vm.runInContext("Input", ctx);
  Input.init(el());
  const key = (code, down) => (listeners[down ? "keydown" : "keyup"] || [])
    .forEach((f) => f({ key: code, code, repeat: false, preventDefault() {}, target: { tagName: "BODY" } }));
  const fire = (t, e) => (listeners[t] || []).forEach((f) => f(e || {}));
  return { Input, key, sb, fire, dispatched, navOpen };
}
// A standard-mapping pad the sandbox's navigator reports as the only one.
// press(i, v) sets button i (a trigger takes a value); gamepadconnected must be
// fired once so pollGamepad reads it every frame instead of re-probing.
function fakePad(sb, fire, id = "Xbox Wireless Controller") {
  const pad = { connected: true, mapping: "standard", id, axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
  sb.navigator.getGamepads = () => [pad];
  fire("gamepadconnected", { gamepad: pad });
  return { pad, press: (i, v = 1) => { pad.buttons[i] = { pressed: v >= 0.5, value: v }; }, release: (i) => { pad.buttons[i] = { pressed: false, value: 0 }; } };
}
// Values come back from the vm realm with that realm's Array/Object
// prototypes; strict deepEqual compares prototypes, so round-trip to plain.
const plain = (v) => JSON.parse(JSON.stringify(v));

test("the defaults are the keys the game always had", () => {
  const { Input } = boot();
  const map = Object.fromEntries(Input.keyBindings().map((a) => [a.id, a.codes]));
  assert.deepEqual(plain(map), {
    left: ["ArrowLeft", "KeyA"], right: ["ArrowRight", "KeyD"], throttle: ["ArrowUp", "KeyW"], brake: ["ArrowDown", "KeyS"],
    boost: ["Space", null], overtake: ["KeyX", null], aero: ["KeyZ", null], shiftUp: ["KeyE", null],
    shiftDown: ["KeyQ", "ShiftLeft"], camera: ["KeyC", null],
  });
  assert.equal(Input.keysAreDefault(), true);
});

test("a rebind moves the action to the new key and the old key stops answering", () => {
  const { Input, key } = boot();
  key("Space", true); assert.equal(Input.consumeBoostToggle(), true, "Space boosts by default");
  const r = Input.setKeyBinding("boost", 0, "KeyB");
  assert.deepEqual(plain(r), { ok: true, conflict: null });
  key("Space", true); assert.equal(Input.consumeBoostToggle(), false, "Space is unbound now");
  key("KeyB", true); assert.equal(Input.consumeBoostToggle(), true, "B boosts");
  assert.equal(Input.keysAreDefault(), false);
  Input.resetKeys();
  key("Space", true); assert.equal(Input.consumeBoostToggle(), true, "reset restores Space");
});

test("a key another action held is taken from it, and the caller is told", () => {
  const { Input, key } = boot();
  const r = Input.setKeyBinding("boost", 0, "KeyX");
  assert.deepEqual(plain(r), { ok: true, conflict: "overtake" });
  const overtake = Input.keyBindings().find((a) => a.id === "overtake");
  assert.deepEqual(plain(overtake.codes), [null, null], "OVERTAKE lost X");
  key("KeyX", true);
  assert.equal(Input.consumeOvertake(), false);
  assert.equal(Input.consumeBoostToggle(), true);
});

test("reserved and malformed keys are refused; either Shift is one key", () => {
  const { Input, key } = boot();
  for (const c of ["Escape", "Enter", "Tab", "KeyP", "F9", "Backquote"]) {
    assert.deepEqual(plain(Input.setKeyBinding("boost", 1, c)), { ok: false, reason: "reserved" }, c);
  }
  assert.equal(Input.setKeyBinding("nope", 0, "KeyB").ok, false);
  assert.equal(Input.setKeyBinding("boost", 2, "KeyB").ok, false);
  key("ShiftRight", true);
  assert.equal(Input.consumeShiftDown(), true, "right Shift is the SHIFT DOWN default too");
  assert.equal(Input.keyLabel("ShiftRight"), "SHIFT");
});

test("a saved map round-trips; garbage in it falls back per action", () => {
  const { Input, key } = boot();
  Input.setKeyBinding("camera", 0, "KeyV");
  Input.setKeyBinding("throttle", 1, "Numpad8");
  const saved = JSON.parse(JSON.stringify(Input.getKeyMap()));
  const fresh = boot();
  fresh.Input.setKeyMap(saved);
  assert.deepEqual(plain(fresh.Input.getKeyMap()), plain(saved));
  fresh.key("KeyV", true); assert.equal(fresh.Input.consumeCameraCycle(), true);
  const junk = boot();
  junk.Input.setKeyMap({ camera: ["Escape", "<img>"], boost: "KeyB", left: ["KeyA", "KeyA"], brake: 7 });
  const m = junk.Input.getKeyMap();
  assert.deepEqual(plain(m.camera), [null, null], "reserved + malformed → empty slots");
  assert.deepEqual(plain(m.boost), ["Space", null], "a non-array entry keeps the default");
  assert.deepEqual(plain(m.left), ["KeyA", null], "a duplicate within one action collapses");
  assert.deepEqual(plain(m.brake), ["ArrowDown", "KeyS"]);
});

test("a held pedal is released when its key changes meaning", () => {
  const { Input, key } = boot();
  key("KeyW", true);
  assert.equal(Input.throttle(), true);
  Input.setKeyBinding("brake", 1, "KeyW");
  assert.equal(Input.throttle(), false, "the rebind cleared the latch");
});

test("key names read like key caps", () => {
  const { Input } = boot();
  assert.equal(Input.keyLabel("KeyX"), "X");
  assert.equal(Input.keyLabel("Digit3"), "3");
  assert.equal(Input.keyLabel("ArrowUp"), "↑");
  assert.equal(Input.keyLabel("Space"), "SPACE");
  assert.equal(Input.keyLabel("NumpadAdd"), "NUM +");
  assert.equal(Input.keyLabel("ControlRight"), "CTRL");
  assert.equal(Input.keyLabel(null), "");
});

// ---- controller ----------------------------------------------------------

test("controller defaults are the standard layout the game always had", () => {
  const { Input } = boot();
  assert.deepEqual(plain(Input.getPadMap()), {
    throttle: [7, 0], brake: [6, 1], boost: [2, null], overtake: [3, null],
    aero: [12, null], shiftUp: [5, null], shiftDown: [4, null], camera: [8, null],
  });
  assert.equal(Input.padsAreDefault(), true);
  assert.deepEqual(plain(Input.padBindings()).map((a) => a.id), ["throttle", "brake", "boost", "overtake", "aero", "shiftUp", "shiftDown", "camera"]);
});

test("a rebound button drives and the old one stops answering", () => {
  const { Input, sb, fire } = boot();
  const { press, release } = fakePad(sb, fire);
  press(7, 0.8); Input.poll();
  assert.equal(Input.debugState().pad.throttle, true, "RT is gas by default");
  assert.ok(Math.abs(Input.throttleLevel() - 0.8) < 1e-9, "a trigger is analog");
  release(7);
  assert.deepEqual(plain(Input.setPadBinding("throttle", 0, 10)), { ok: true, conflict: null });
  press(7, 0.8); Input.poll();
  assert.equal(Input.debugState().pad.throttle, false, "RT no longer means gas");
  release(7); press(10); Input.poll();
  assert.equal(Input.debugState().pad.throttle, true, "LS does now");
  // an edge action
  release(10);
  assert.deepEqual(plain(Input.setPadBinding("boost", 0, 11)), { ok: true, conflict: null });
  press(2); Input.poll();
  assert.equal(Input.consumeBoostToggle(), false, "X was unbound from BOOST");
  release(2); press(11); Input.poll();
  assert.equal(Input.consumeBoostToggle(), true, "RS boosts");
  Input.poll();
  assert.equal(Input.consumeBoostToggle(), false, "held, not re-pressed");
});

test("a button another action held is taken from it, and the caller is told", () => {
  const { Input } = boot();
  const r = Input.setPadBinding("overtake", 1, 2);
  assert.deepEqual(plain(r), { ok: true, conflict: "boost" });
  const m = Input.getPadMap();
  assert.deepEqual(plain(m.boost), [null, null], "BOOST lost X");
  assert.deepEqual(plain(m.overtake), [3, 2]);
  assert.equal(Input.padsAreDefault(), false);
  Input.resetPad();
  assert.equal(Input.padsAreDefault(), true);
});

test("pause, the d-pad steer buttons and nonsense are refused", () => {
  const { Input } = boot();
  for (const b of [9, 14, 15]) assert.deepEqual(plain(Input.setPadBinding("boost", 1, b)), { ok: false, reason: "reserved" }, "button " + b);
  for (const b of [-1, 40, "x", 1.5, null]) assert.equal(Input.setPadBinding("boost", 1, b).ok, false, "button " + b);
  assert.equal(Input.setPadBinding("nope", 0, 2).ok, false);
  assert.deepEqual(plain(Input.getPadMap().boost), [2, null], "nothing changed");
});

test("an armed capture takes the first press and the frame does nothing else", () => {
  const { Input, sb, fire } = boot();
  const { press, release } = fakePad(sb, fire);
  const got = [];
  Input.padCapture((i) => got.push(i));
  press(3); press(7); Input.poll();
  assert.deepEqual(got, [3], "the rising edge went to the capture");
  assert.equal(Input.consumeOvertake(), false, "Y did not also overtake");
  assert.equal(Input.debugState().pad.throttle, false, "the held trigger did not drive");
  Input.poll();
  assert.deepEqual(got, [3], "a held button is not a second press");
  Input.padCapture(null);
  release(3); release(7); Input.poll();
  press(3); Input.poll();
  assert.equal(Input.consumeOvertake(), true, "disarmed, Y overtakes again");
});

test("a saved controller map round-trips; garbage in it falls back per action", () => {
  const { Input } = boot();
  Input.setPadBinding("camera", 0, 10);
  const saved = Input.getPadMap();
  const fresh = boot();
  fresh.Input.setPadMap(saved);
  assert.deepEqual(plain(fresh.Input.getPadMap()), plain(saved));
  const m = boot().Input.setPadMap({ throttle: [9, "7"], brake: "x", boost: [2, 2], camera: [99, null], aero: [13, 13] });
  assert.deepEqual(plain(m.throttle), [null, 7], "reserved slot cleared, a numeric string accepted");
  assert.deepEqual(plain(m.brake), [6, 1], "a non-array entry keeps the default");
  assert.deepEqual(plain(m.boost), [2, null], "a duplicate within one action collapses");
  assert.deepEqual(plain(m.camera), [null, null], "out of range");
  assert.deepEqual(plain(m.aero), [13, null]);
});

test("button names follow the connected pad's family", () => {
  const { Input, sb, fire } = boot();
  assert.equal(Input.padLabel(0), "A");
  assert.equal(Input.padLabel(7), "RT");
  assert.equal(Input.padLabel(12), "D\u2011PAD \u2191");
  assert.equal(Input.padLabel(20), "BTN 20");
  assert.equal(Input.padLabel(null), "");
  fakePad(sb, fire, "Sony DualSense Wireless Controller (054c:0ce6)");
  assert.equal(Input.padLabel(0), "CROSS");
  assert.equal(Input.padLabel(6), "L2");
  assert.equal(Input.padLabel(9), "OPTIONS");
});

// ---- the tables on a touch device ------------------------------------------
// pointer: coarse says nothing about whether a keyboard exists. The KEYBOARD
// table used to be hidden by CSS on every touch device; now the module shows it
// once a physical key is seen (Input.keyboardSeen), the way the CONTROLLER
// table already waited for a pad — and one hint line says what to press.

test("Input.keyboardSeen latches on a key outside a field, never on typing", () => {
  const { Input, key, sb } = boot();
  assert.equal(Input.keyboardSeen(), false);
  sb.document.activeElement = { tagName: "INPUT" };
  key("KeyA", true); key("KeyA", false);
  assert.equal(Input.keyboardSeen(), false, "an on-screen keyboard only fires into a focused field");
  sb.document.activeElement = { tagName: "BUTTON" };
  key("KeyA", true); key("KeyA", false);
  assert.equal(Input.keyboardSeen(), true, "a key on a focused menu button is a keyboard");
});

// A DOM just deep enough for KeyBinds.create: elements by id with hidden,
// textContent and children; createElement for the rows.
function bootUi(desktop) {
  const { Input, key, sb, fire } = boot();
  const nodes = {};
  const mk = () => {
    const n = { hidden: false, textContent: "", dataset: {}, disabled: false, style: {}, kids: [],
      setAttribute() {}, append(...a) { this.kids.push(...a); }, appendChild(a) { this.kids.push(a); },
      addEventListener() {}, removeEventListener() {} };
    return n;
  };
  sb.document.getElementById = (id) => (nodes[id] ||= mk());
  sb.document.createElement = () => mk();
  sb.document.body.classList.contains = (c) => c === "desktop" && desktop;
  sb.document.readyState = "complete";
  const winListeners = {};
  sb.addEventListener = (t, f) => { (winListeners[t] ||= []).push(f); };
  sb.removeEventListener = (t, f) => { const l = winListeners[t] || []; const i = l.indexOf(f); if (i >= 0) l.splice(i, 1); };
  sb.GameAudio = null;
  sb.setTimeout = (f) => { f(); return 0; };   // the reveal defers past the dispatch; here it just runs
  vm.runInContext(read("js/ui/key-binds.js"), sb.__ctx || (sb.__ctx = vm.createContext(sb)), { filename: "js/ui/key-binds.js" });
  const KeyBinds = vm.runInContext("KeyBinds", sb.__ctx);
  const store = { get: () => null, set() {} };
  const G = { $: sb.document.getElementById, store, soundOn: false };
  const kb = KeyBinds.create(G);
  // A physical key: Input's window listener sets the latch, then the module's.
  const press = (code) => { key(code, true); (winListeners.keydown || []).forEach((f) => f({ code, isTrusted: true })); key(code, false); };
  // Input's listeners were registered before the swap above, the module's after.
  const fireAll = (t, e) => { fire(t, e); (winListeners[t] || []).forEach((f) => f(e || {})); };
  return { Input, kb, press, fire: fireAll, sb, $: sb.document.getElementById };
}
// The UI module reads Input from the same realm; boot() runs input.js in a
// context whose globals are `sb`, so createContext(sb) is that same realm.

test("a phone hides both tables behind one hint until a key or a pad is seen", () => {
  const { $, press, fire, sb } = bootUi(false);
  assert.equal($("pm-keys-section").hidden, true, "no keyboard seen yet");
  assert.equal($("pm-pad-section").hidden, true, "no pad seen yet");
  assert.equal($("pm-ctl-hint").hidden, false, "the hint says what to press");
  press("KeyW");
  assert.equal($("pm-keys-section").hidden, false, "the first physical key reveals the KEYBOARD table");
  assert.equal($("pm-ctl-hint").hidden, true, "and the hint goes");
  assert.equal($("pm-pad-section").hidden, true, "the pad table still waits for a pad");
  fakePad(sb, fire);
  assert.equal($("pm-pad-section").hidden, false, "gamepadconnected reveals CONTROLLER");
});

test("a desktop shows both tables and never the hint", () => {
  const { $ } = bootUi(true);
  assert.equal($("pm-keys-section").hidden, false);
  assert.equal($("pm-pad-section").hidden, false);
  assert.equal($("pm-ctl-hint").hidden, true);
});

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

test("D-pad Left/Right on a focused <select> steps its value and fires change; Up/Down are the ordinary row move", () => {
  const { Input, sb, fire, dispatched, navOpen } = boot();
  const { press, release } = fakePad(sb, fire);
  navOpen.on = true;
  const events = [], keys = [];
  const sel = { tagName: "SELECT", disabled: false, options: { length: 3 }, selectedIndex: 0, dispatchEvent: (e) => { events.push(e.type); if (e.type === "keydown") keys.push(e); return true; } };
  sb.document.activeElement = sel;
  press(15); Input.poll(); release(15); Input.poll();         // D-pad right
  assert.equal(sel.selectedIndex, 1, "the pad stepped the select itself — a synthetic ArrowRight has no UA default");
  assert.deepEqual(events, ["input", "change"], "the row's change listener hears it");
  press(15); Input.poll(); release(15); Input.poll();
  press(15); Input.poll(); release(15); Input.poll();
  assert.equal(sel.selectedIndex, 2, "clamped at the last option, no wrap");
  press(14); Input.poll(); release(14); Input.poll();         // D-pad left
  assert.equal(sel.selectedIndex, 1);
  assert.equal(events.filter((t) => t === "keydown").length, 0, "no keydown was dispatched for the owned axis");
  press(13); Input.poll(); release(13); Input.poll();         // D-pad down
  assert.equal(events.filter((t) => t === "keydown").length, 1, "the cross axis is a key, dispatched at the focused select");
  assert.equal(dispatched.length, 0, "…at the CONTROL, not at the document (an element's own handler must see it)");
  assert.equal(keys.pop().key, "ArrowDown", "the cross-axis arrow is the plain synthetic keydown MenuNav walks on");
});

test("D-pad Left/Right on a focused slider steps by its step within min/max; a button gets the plain arrow", () => {
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
  assert.equal(rng.value, "199.75");
  assert.equal(dispatched.length, 0);
  sb.document.activeElement = { tagName: "BUTTON", disabled: false };
  press(15); Input.poll(); release(15); Input.poll();
  assert.equal(dispatched.length, 1);
  assert.equal(dispatched[0].key, "ArrowRight");
  assert.equal(dispatched[0].type, "keydown", "a button's arrow is an ordinary move");
});
