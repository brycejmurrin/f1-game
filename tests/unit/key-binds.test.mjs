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

function boot(initOpts) {
  const listeners = {};
  // Keydowns the pad synthesises land here when they go to the document (the
  // fallback target); one that reaches a focused control is recorded by that
  // control's own fake dispatchEvent instead — which is the point of the test.
  const dispatched = [];
  // anyOpen = real menus (pause/settings). navOpen also covers title #overlay.
  // Keep them independent so the touch-pause gate can pin anyOpen ≠ navOpen.
  const anyOpen = { on: false };
  const navOpen = { on: false };
  const el = () => ({
    addEventListener() {}, removeEventListener() {}, style: {}, dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    setAttribute() {}, getAttribute: () => null, removeAttribute() {}, children: [],
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
    UiLayers: {
      anyOpen: () => anyOpen.on,
      navOpen: () => anyOpen.on || navOpen.on,
      top: () => (anyOpen.on ? { id: "pmsettings", contains: () => true }
        : (navOpen.on ? { id: "overlay", contains: () => true } : null)),
    },
  };
  sb.Event = class { constructor(type, init) { this.type = type; Object.assign(this, init || {}); } };
  sb.KeyboardEvent = class extends sb.Event {};
  sb.window = sb;
  const ctx = vm.createContext(sb);
  vm.runInContext(read("js/core/mat4.js"), ctx, { filename: "js/core/mat4.js" });
  for (const f of ["js/input/bindings.js", "js/input/pad-menu.js", "js/input/haptics.js", "js/input/hold-buttons.js", "js/input/input.js"])
    vm.runInContext(read(f), ctx, { filename: f });
  const Input = vm.runInContext("Input", ctx);
  Input.init(el(), initOpts);
  const key = (code, down) => (listeners[down ? "keydown" : "keyup"] || [])
    .forEach((f) => f({ key: code, code, repeat: false, preventDefault() {}, target: { tagName: "BODY" } }));
  const fire = (t, e) => (listeners[t] || []).forEach((f) => f(e || {}));
  return { Input, key, sb, fire, dispatched, navOpen, anyOpen };
}

test("inputState gate distinguishes title navigation, menus, typing and HUD focus without modifying held keys", () => {
  const { Input, sb, navOpen, anyOpen, key } = boot();
  key("KeyW", true);
  navOpen.on = true;
  let s = Input.debugState();
  assert.equal(sb.UiLayers.navOpen(), true);
  assert.equal(s.gate.anyOpen, false, "title navigation alone is not the driving menu gate");
  assert.equal(s.gate.typing, false);
  assert.equal(s.key.throttle, true);
  assert.equal(Input.throttle(), true, "title navigation retains driving input");

  anyOpen.on = true;
  sb.document.activeElement = { id: "query", tagName: "INPUT", matches: () => false };
  s = Input.debugState();
  assert.equal(s.key.throttle, true);
  assert.equal(s.gate.typing, true);
  assert.equal(s.gate.anyOpen, true);
  assert.equal(s.gate.focus.id, "query");
  assert.equal(s.gate.focus.tag, "INPUT");
  assert.equal(Input.throttle(), true, "reading the gate preserves the key held before the menu opened");
  sb.document.activeElement = { id: "pausebtn", tagName: "BUTTON", matches: () => true };
  s = Input.debugState();
  assert.equal(s.gate.anyOpen, true);
  assert.equal(s.gate.typing, false);
  assert.equal(s.gate.hudControl, true);
  assert.equal(s.gate.focus.id, "pausebtn");
  assert.equal(s.key.throttle, true);
});
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
    // LOOK BACK and RECOVER are standard racing binds we lacked; PAUSE stopped
    // being a reserved literal so it can be moved (XAG 107 asks that every
    // control be remappable, the Esc/pause key included).
    // PIT is deliberately absent: a stop is called by steering into the pit
    // entry now, not by a key (js/race/pit-lane.js COMMIT_*).
    // RADIO CHECK asks the engineer for the gaps (js/race/race-radio.js request).
    // MIRROR toggles the HUD rear-view mirror (js/render/shared/mirror-pass.js).
    lookBack: ["KeyB", null], recover: ["KeyR", null], radio: ["KeyT", null], mirror: ["KeyM", null], pause: ["KeyP", null],
  });
  assert.equal(Input.keysAreDefault(), true);
});

test("a rebind moves the action to the new key and the old key stops answering", () => {
  const { Input, key } = boot();
  key("Space", true); assert.equal(Input.consumeBoostToggle(), true, "Space boosts by default");
  /* DERIVE a key no action holds, rather than naming one. This test wants any
     unbound key; it has now been broken twice by a new action claiming the
     literal it picked (B went to LOOK BACK, V to PIT IN). Asking the live table
     which letters are free cannot go stale. */
  const taken = new Set(Input.keyBindings().flatMap((a) => a.codes).filter(Boolean));
  const free = "GHJKLMNTUYIO".split("").map((c) => "Key" + c).find((c) => !taken.has(c));
  assert.ok(free, "the alphabet has run out of unbound keys — pick a different probe");
  const r = Input.setKeyBinding("boost", 0, free);
  assert.deepEqual(plain(r), { ok: true, conflict: null });
  key("Space", true); assert.equal(Input.consumeBoostToggle(), false, "Space is unbound now");
  key(free, true); assert.equal(Input.consumeBoostToggle(), true, `${free} boosts`);
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
  for (const c of ["Escape", "Enter", "Tab", "F9", "Backquote"]) {
    assert.deepEqual(plain(Input.setKeyBinding("boost", 1, c)), { ok: false, reason: "reserved" }, c);
  }
  // P LEFT THE RESERVED SET. It is PAUSE's default binding now, so asking for
  // it is an ordinary conflict — the action that had it gives it up — and not
  // a refusal. Escape stays reserved: that one is the platform's gesture.
  assert.deepEqual(plain(Input.setKeyBinding("boost", 1, "KeyP")), { ok: true, conflict: "pause" });
  Input.resetKeys();
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
    lookBack: [11, null], recover: [10, null], radio: [13, null], mirror: [null, null], pause: [9, null],
  });
  assert.equal(Input.padsAreDefault(), true);
  assert.deepEqual(plain(Input.padBindings()).map((a) => a.id), ["throttle", "brake", "boost", "overtake", "aero", "shiftUp", "shiftDown", "camera", "lookBack", "recover", "radio", "mirror", "pause"]);
});

test("a rebound button drives and the old one stops answering", () => {
  const { Input, sb, fire } = boot();
  const { press, release } = fakePad(sb, fire);
  press(7, 0.8); Input.poll();
  assert.equal(Input.debugState().pad.throttle, true, "RT is gas by default");
  assert.ok(Math.abs(Input.throttleLevel() - (0.8 - 0.12) / 0.88) < 1e-9, "a trigger is analog (past a rescaled 0.12 dead zone)");
  release(7);
  assert.deepEqual(plain(Input.setPadBinding("throttle", 0, 10)), { ok: true, conflict: "recover" });
  press(7, 0.8); Input.poll();
  assert.equal(Input.debugState().pad.throttle, false, "RT no longer means gas");
  release(7); press(10); Input.poll();
  assert.equal(Input.debugState().pad.throttle, true, "LS does now");
  // an edge action
  release(10);
  assert.deepEqual(plain(Input.setPadBinding("boost", 0, 11)), { ok: true, conflict: "lookBack" });
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
  // 9 (Menu/Start) is PAUSE's binding now, so only the d-pad's steering axis
  // stays reserved — it is an axis, like the stick, not a bindable button.
  for (const b of [14, 15]) assert.deepEqual(plain(Input.setPadBinding("boost", 1, b)), { ok: false, reason: "reserved" }, "button " + b);
  assert.deepEqual(plain(Input.setPadBinding("boost", 1, 9)), { ok: true, conflict: "pause" });
  Input.resetPad();
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
  // 9 is PAUSE's default now rather than a reserved index, so it is ACCEPTED
  // here — and PAUSE loses it, which the seen-set below enforces. 14 is the
  // d-pad's steering axis and is still refused.
  const m = boot().Input.setPadMap({ throttle: [14, "7"], brake: "x", boost: [2, 2], camera: [99, null], aero: [13, 13] });
  assert.deepEqual(plain(m.throttle), [null, 7], "reserved slot cleared, a numeric string accepted");
  assert.deepEqual(plain(m.brake), [6, 1], "a non-array entry keeps the default");
  assert.deepEqual(plain(m.boost), [2, null], "a duplicate within one action collapses");
  assert.deepEqual(plain(m.camera), [null, null], "out of range");
  assert.deepEqual(plain(m.aero), [13, null]);
});

test("an action the save predates keeps its default only where the player has not used that key", () => {
  // RADIO (d-pad down / T) arrived after these maps were saved: its default
  // must not double up on a key the player had put on another action.
  const pad = boot().Input.setPadMap({ shiftDown: [13, 4] });
  assert.deepEqual(plain(pad.shiftDown), [13, 4]);
  assert.deepEqual(plain(pad.radio), [null, null], "d-pad down stays shift-down alone");
  assert.deepEqual(plain(pad.pause), [9, null], "an untouched default survives");
  const keys = boot().Input.setKeyMap({ shiftUp: ["KeyT", null] });
  assert.deepEqual(plain(keys.shiftUp), ["KeyT", null]);
  assert.deepEqual(plain(keys.radio), [null, null], "T stays shift-up alone");
  assert.deepEqual(plain(keys.pause), ["KeyP", null]);
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

test("Input.activeInputSource follows real activity, not connected-device presence", () => {
  const { Input, key, sb, fire } = boot();
  assert.equal(Input.activeInputSource(), "keyboard", "desktop defaults to keyboard");
  key("KeyA", true); key("KeyA", false);
  assert.equal(Input.activeInputSource(), "keyboard");
  const pad = fakePad(sb, fire);
  Input.poll();
  assert.equal(Input.activeInputSource(), "keyboard", "an idle pad does not take over");
  pad.press(3); Input.poll();
  assert.equal(Input.activeInputSource(), "controller", "a pressed pad button becomes active");
  pad.release(3); Input.poll();
  key("KeyD", true); key("KeyD", false);
  assert.equal(Input.activeInputSource(), "keyboard", "the next keyboard press takes priority again");
});

// A DOM just deep enough for KeyBinds.create: elements by id with hidden,
// textContent and children; createElement for the rows.
// `disk`, when given, backs the store (reads and writes land in it).
function bootUi(desktop, helpSlots = {}, disk = null) {
  const { Input, key, sb, fire } = boot();
  const nodes = {};
  const mk = (tag = "div") => {
    let text = "";
    const n = { tagName: tag.toUpperCase(), hidden: false, dataset: {}, disabled: false, style: {}, kids: [], clears: 0, attrs: {},
      setAttribute(k, v) { this.attrs[k] = String(v); }, append(...a) { this.kids.push(...a); }, appendChild(a) { this.kids.push(a); },
      addEventListener() {}, removeEventListener() {},
      focus() { sb.document.activeElement = this; } };
    Object.defineProperty(n, "textContent", { get: () => text, set(v) {
      text = String(v);
      if (v === "") { n.kids = []; n.clears++; }
    } });
    return n;
  };
  sb.document.getElementById = (id) => (nodes[id] ||= mk());
  sb.document.querySelectorAll = (sel) => helpSlots[sel] || [];
  sb.document.createElement = (tag) => mk(tag);
  sb.document.body.classList.contains = (c) => c === "desktop" && desktop;
  sb.document.readyState = "complete";
  const winListeners = {};
  sb.addEventListener = (t, f) => { (winListeners[t] ||= []).push(f); };
  sb.removeEventListener = (t, f) => { const l = winListeners[t] || []; const i = l.indexOf(f); if (i >= 0) l.splice(i, 1); };
  sb.GameAudio = null;
  sb.setTimeout = (f) => { f(); return 0; };   // the reveal defers past the dispatch; here it just runs
  vm.runInContext(read("js/ui/key-binds.js"), sb.__ctx || (sb.__ctx = vm.createContext(sb)), { filename: "js/ui/key-binds.js" });
  const KeyBinds = vm.runInContext("KeyBinds", sb.__ctx);
  const store = disk
    ? {
      get: (k, d) => (Object.prototype.hasOwnProperty.call(disk, k) ? disk[k] : d),
      set: (k, v) => { disk[k] = v; },
      rawDel: (k) => { delete disk[k]; },
    }
    : { get: () => null, set() {}, rawDel() {} };
  const G = { $: sb.document.getElementById, store, soundOn: false };
  const kb = KeyBinds.create(G);
  // A physical key: Input's window listener sets the latch, then the module's.
  const press = (code) => {
    key(code, true);
    [...(winListeners.keydown || [])].forEach((f) => f({ code, isTrusted: true, repeat: false,
      preventDefault() {}, stopPropagation() {} }));
    key(code, false);
  };
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

test("an armed slot left behind (BACK / CLOSE / RESUME) never captures the next key in the race", () => {
  // Bug hunt 2026-09-22: nothing disarmed a slot when the page hid, so the
  // first key pressed in the race was swallowed and rebound.
  const { Input, kb, press, $ } = bootUi(true);
  const host = $("pm-keys");
  let hiddenPage = false;
  host.closest = (sel) => (sel === "[hidden]" && hiddenPage ? {} : null);
  const chip = (id, slot) => host.kids.flatMap((row) => row.kids || []).flatMap((c) => c.kids || [])
    .find((b) => b.dataset && b.dataset.action === id && b.dataset.slot === String(slot));
  chip("throttle", 0).onclick();                 // armed: waiting for a key
  hiddenPage = true;                              // the player left the page without pressing one
  press("ArrowLeft");
  const map = Object.fromEntries(Input.keyBindings().map((a) => [a.id, a.codes]));
  assert.equal(map.left[0], "ArrowLeft", "steer-left keeps its key");
  assert.equal(map.throttle[0], "ArrowUp", "throttle was not rebound");
  hiddenPage = false;
  chip("throttle", 0).onclick();
  kb.disarmAll();                                 // closeSettings()
  press("KeyQ");
  assert.equal(Object.fromEntries(Input.keyBindings().map((a) => [a.id, a.codes])).throttle[0], "ArrowUp",
    "disarmAll leaves nothing listening");
});

test("disarmAll aborts the wheel wizard so the pad drives again", () => {
  // Bug hunt 2026-09-24: disarmAll cleared key/pad button slots but not
  // beginAxisCapture, so SET UP A WHEEL + leave settings left the pad zeroed.
  const { Input, kb, $, fire, sb } = bootUi(true);
  const { press } = fakePad(sb, fire);
  $("pm-pad-wheel").onclick();
  assert.equal($("pm-pad-wheel").textContent, "CANCEL", "wizard armed");
  press(7, 1);
  Input.poll();
  assert.equal(Input.debugState().pad.throttle, false, "axis capture owns the frame");
  kb.disarmAll();
  assert.equal($("pm-pad-wheel").textContent, "SET UP A WHEEL", "button label restored");
  Input.poll();
  assert.equal(Input.debugState().pad.throttle, true, "disarmAll cleared axis capture");
});

// The slot chip for (action, slot) anywhere under a rendered table.
function slotOf(node, action, slot) {
  if (node.dataset && node.dataset.action === action && node.dataset.slot === String(slot)) return node;
  for (const child of node.kids || []) { const hit = slotOf(child, action, slot); if (hit) return hit; }
  return null;
}

test("Backspace on an armed KEY slot unbinds it, and the chip says so", () => {
  // Bug hunt 2026-09-30: Input.clearKeyBinding had no caller — a slot could be
  // moved but never emptied.
  const disk = {};
  const { Input, press, $ } = bootUi(true, {}, disk);
  slotOf($("pm-keys"), "boost", 0).onclick();
  press("Backspace");
  assert.deepEqual(plain(Input.getKeyMap().boost), [null, null], "BOOST has no key now");
  const chip = slotOf($("pm-keys"), "boost", 0);
  assert.equal(chip.textContent, "—");
  assert.match(chip.attrs["aria-label"], /unset/);
  assert.deepEqual(plain(disk.keys.boost), [null, null], "the cleared map was saved");
  assert.match($("pm-keys-note").textContent, /BOOST key cleared/);
  press("Space");
  assert.equal(Input.consumeBoostToggle(), false, "Space no longer boosts");
  // Delete clears the SECOND slot alone.
  slotOf($("pm-keys"), "left", 1).onclick();
  press("Delete");
  assert.deepEqual(plain(Input.getKeyMap().left), ["ArrowLeft", null]);
  // Nothing is left armed: the next key is not captured.
  press("KeyG");
  assert.deepEqual(plain(Input.getKeyMap().left), ["ArrowLeft", null]);
});

test("Backspace from the keyboard unbinds an armed CONTROLLER slot and disarms the capture", () => {
  const disk = {};
  const { Input, $, press, fire, sb } = bootUi(true, {}, disk);
  const pad = fakePad(sb, fire);
  slotOf($("pm-pad"), "throttle", 1).onclick();
  press("Backspace");
  assert.deepEqual(plain(Input.getPadMap().throttle), [7, null], "A no longer means gas");
  assert.deepEqual(plain(disk.pad.throttle), [7, null]);
  assert.equal(slotOf($("pm-pad"), "throttle", 1).textContent, "—");
  pad.press(0); Input.poll();
  assert.deepEqual(plain(Input.getPadMap().throttle), [7, null], "the capture was disarmed, A was not bound");
  assert.equal(Input.debugState().pad.throttle, false, "and A does not drive");
});

test("CALIBRATE STICK is stored and applied on the next boot; a garbage value is ignored", () => {
  // Bug hunt 2026-09-30: the hint promised the offset applies "from then on",
  // and it was lost on reload.
  const disk = {};
  const a = bootUi(true, {}, disk);
  const pa = fakePad(a.sb, a.fire);
  pa.pad.axes[0] = 0.08;
  a.$("pm-pad-calib").onclick();
  assert.ok(Math.abs(disk.padRest["Xbox Wireless Controller"] - 0.08) < 1e-9, "the offset was stored per pad id: " + JSON.stringify(disk.padRest));
  const b = bootUi(true, {}, { padRest: disk.padRest });
  const pb = fakePad(b.sb, b.fire);
  assert.ok(Math.abs(b.Input.padRest() - 0.08) < 1e-9, "a fresh boot loads it for that pad");
  pb.pad.axes[0] = 0.08; b.Input.poll();
  assert.equal(b.Input.debugState().pad.steer, 0, "a stick resting at 0.08 steers nothing");
  const c = bootUi(true, {}, {});
  const pc = fakePad(c.sb, c.fire);
  pc.pad.axes[0] = 0.08; c.Input.poll();
  assert.ok(c.Input.debugState().pad.steer > 0, "control: uncalibrated, the same rest steers");
  for (const junk of ["x", 0.9, -3, [0.1], { v: 0.1 }, Infinity, true]) {
    assert.equal(bootUi(true, {}, { padRest: junk }).Input.padRest(), 0, "ignored: " + JSON.stringify(junk));
  }
});

test("the wheel wizard drops a stored rest offset when the steering axis moves", () => {
  const disk = { padRest: 0.08 };
  const { Input, $, fire, sb } = bootUi(true, {}, disk);
  const { pad } = fakePad(sb, fire);
  pad.axes = [0.08, 0, 0, 0];
  $("pm-pad-wheel").onclick();
  pad.axes[1] = -0.9; Input.poll();     // steer -> axis 1
  pad.axes[2] = 0.9; Input.poll();      // throttle -> axis 2
  pad.axes[3] = 0.9; Input.poll();      // brake -> axis 3, finish
  assert.equal(disk.padAxes.steer, 1, "the wizard finished");
  assert.equal(Input.padRest(), 0, "the old axis's offset is not carried over");
  assert.equal(disk.padRest, 0, "…and not stored");
});

test("CONTROLLER RESET clears wheel axes and stick rest, not only the button map", () => {
  // Bug hunt 2026-10-06: RESET called Input.resetPad() alone. SET UP A WHEEL /
  // CALIBRATE STICK kept driving after "Controller reset to the defaults", and
  // with default buttons the RESET chip stayed disabled.
  const disk = {};
  const { Input, $, fire, sb } = bootUi(true, {}, disk);
  const { pad } = fakePad(sb, fire);
  pad.axes = [0, 0, 0, 0];
  $("pm-pad-wheel").onclick();
  pad.axes[1] = -0.9; Input.poll();
  pad.axes[2] = 0.9; Input.poll();
  pad.axes[3] = 0.9; Input.poll();
  assert.equal(Input.padAxesAreDefault(), false, "wizard left a custom axis map");
  assert.equal(Input.padsAreDefault(), true, "buttons stayed at shipped defaults");
  assert.equal($("pm-pad-reset").disabled, false, "RESET is live when only axes differ");

  // Calibrate on the wizard's steer axis (1), not axis 0.
  pad.axes = [0, 0.08, 0, 0];
  $("pm-pad-calib").onclick();
  assert.ok(Math.abs(disk.padRest["Xbox Wireless Controller"] - 0.08) < 1e-9, "rest offset stored: " + JSON.stringify(disk.padRest));
  assert.equal($("pm-pad-reset").disabled, false, "RESET stays live with a rest offset");

  Input.setPadBinding("boost", 0, 11);
  assert.equal(Input.padsAreDefault(), false);
  $("pm-pad-reset").onclick();
  assert.equal(Input.padsAreDefault(), true, "buttons reset");
  assert.equal(Input.padAxesAreDefault(), true, "wheel axes reset");
  assert.equal(Input.padRest(), 0, "stick rest cleared");
  assert.equal(Object.prototype.hasOwnProperty.call(disk, "padAxes"), false, "padAxes removed from store");
  assert.equal(Object.prototype.hasOwnProperty.call(disk, "padRest"), false, "padRest removed from store");
  assert.equal($("pm-pad-reset").disabled, true, "RESET disables once everything is shipped");
  assert.match($("pm-pad-note").textContent, /Controller reset/);
});

test("How to Play input disclosures stay on the article the player opened", () => {
  // Bug hunt 2026-10-06: after helpInputReady, every render forced the active
  // device <details> open and insertBefore'd it to the front.
  const mkDetails = (kind, open) => ({
    open: !!open,
    tagName: "DETAILS",
    getAttribute: (name) => (name === "data-input" ? kind : null),
  });
  const keyboard = mkDetails("keyboard", true);
  const pad = mkDetails("pad", false);
  const touch = mkDetails("touch", false);
  const kids = [keyboard, pad, touch];
  const { kb, $ } = bootUi(true, {}, {});
  const htp = $("htp-inputs");
  htp.dataset = { helpInputReady: "1" };
  htp.querySelectorAll = (sel) => (sel === "details[data-input]" ? kids.slice() : []);
  htp.insertBefore = (node) => {
    const i = kids.indexOf(node);
    if (i >= 0) kids.splice(i, 1);
    kids.unshift(node);
    htp.firstElementChild = kids[0];
    return node;
  };
  htp.firstElementChild = kids[0];
  $("howtoplay").hidden = false;
  kb.render();
  assert.equal(keyboard.open, true, "player-opened Keyboard stays open");
  assert.equal(pad.open, false, "pad was not forced open");
  assert.equal(kids[0], keyboard, "order was not rewritten to the active device");
  assert.equal(touch.open, false);
});

test("a desktop shows both tables and never the hint", () => {
  const { $ } = bootUi(true);
  assert.equal($("pm-keys-section").hidden, false);
  assert.equal($("pm-pad-section").hidden, false);
  assert.equal($("pm-ctl-hint").hidden, true);
});

test("How to Play binding slots are painted from the live key and pad tables", () => {
  const slot = (attr, action) => ({
    textContent: "stale",
    kids: [],
    getAttribute: (name) => name === attr ? action : null,
    append(...children) { this.kids.push(...children); },
  });
  const keySlot = slot("data-help-keys", "aero");
  const padSlot = slot("data-help-pad", "overtake");
  const { $, kb } = bootUi(true, {
    "[data-help-keys]": [keySlot],
    "[data-help-pad]": [padSlot],
  });
  kb.render();
  assert.equal(keySlot.textContent, "", "the stale key hint is replaced");
  assert.equal(keySlot.kids[0].textContent, "Z", "keyboard slot uses the live key label");
  assert.equal(padSlot.kids[0].textContent, "Y", "controller slot uses the live pad label");
  assert.equal($("htp-inputs").dataset.activeInput, "keyboard", "help records the current input kind");
});

test("a successful key capture rebuilds once, restores the changed slot's focus, and reports through a status", () => {
  const { $, press, sb } = bootUi(true);
  const host = $("pm-keys");
  const find = (node, action, slot) => {
    if (node.dataset && node.dataset.action === action && node.dataset.slot === String(slot)) return node;
    for (const child of node.kids || []) { const hit = find(child, action, slot); if (hit) return hit; }
    return null;
  };
  const before = find(host, "recover", 0);
  assert.ok(before, "the RECOVER primary slot is rendered");
  before.focus(); before.onclick();
  const clears = host.clears;
  press("KeyF");
  const after = find(host, "recover", 0);
  assert.notEqual(after, before, "capture replaces the rendered button");
  assert.equal(host.clears, clears + 1, "successful capture performs one render, not disarm + render");
  assert.equal(sb.document.activeElement, after, "focus follows the same logical slot onto its replacement");
  assert.equal(after.textContent, "F");
  assert.match($("pm-keys-note").textContent, /Tap a key slot/);
  assert.match(read("index.html"), /id="pm-keys-note"[^>]*role="status"/,
    "the capture result is exposed as a polite status update");
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
  assert.match(src, /function navBlocksTouch\(\) \{ return !!\(window\.UiLayers && window\.UiLayers\.anyOpen\(\)\); \}/);
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

// ---- round 2 input hunt: I-01 / I-02 / I-05 / I-06 / I-08 / I-09 + nintendo A/B ---------------

const rawPad = (extra) => Object.assign({ connected: true, mapping: "standard", id: "Xbox Wireless Controller", index: 0, axes: [0, 0, 0, 0],
  buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) }, extra);
const setBtn = (pad, i, down) => { pad.buttons[i] = { pressed: down, value: down ? 1 : 0 }; };
// A stable menu layer + a focused control, so the pad's menu walk is observable.
function menuRig() {
  const r = boot();
  let t = 0; r.sb.performance.now = () => t;
  r.tick = () => { t += 16; r.Input.poll(); };
  const layer = { id: "overlay", contains: () => true };
  r.sb.MenuNav = { activeLayer: () => layer, FOCUSABLE: "button" };
  r.sb.UiLayers.top = () => layer;
  r.navOpen.on = true;
  r.clicks = 0;
  r.sb.document.activeElement = { tagName: "BUTTON", disabled: false, matches: () => true, click() { r.clicks++; } };
  return r;
}

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
  for (let i = 0; i < 30; i++) { t += 16; Input.poll(); }
  assert.equal(Input.debugState().pad.steer, 0, "an unknown button 14 does not slam full lock");
  const std = rawPad({ id: "Pad Std" });
  sb.navigator.getGamepads = () => [std];
  fire("gamepadconnected", { gamepad: std });
  setBtn(std, 14, true);
  for (let i = 0; i < 30; i++) { t += 16; Input.poll(); }
  assert.ok(Input.debugState().pad.steer < 0, "control: the standard d-pad left steers");
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
  vm.runInContext(read("js/input/hold-buttons.js"), ctx, { filename: "js/input/hold-buttons.js" });
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
