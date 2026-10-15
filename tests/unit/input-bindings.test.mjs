// input-bindings.test.mjs — InputBindings (js/input/bindings.js) alone.
//
// key-binds.test.mjs covers the same API through Input + the CONTROLS UI. This
// file boots the factory with no input.js so rebind/conflict/persistence/labels
// stay proven when the façade moves. Callbacks are stubs we can count.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const plain = (v) => JSON.parse(JSON.stringify(v));

function boot(activePad = () => null) {
  const counts = { keys: 0, pad: 0 };
  const sb = {
    Math, Object, Array, Number, isFinite, JSON, Map, Set, String, RegExp, Promise,
    navigator: {},
    Log: { info() {}, warn() {}, debug() {}, error() {}, enabled: () => false },
  };
  sb.window = sb;
  const ctx = vm.createContext(sb);
  vm.runInContext(read("js/input/bindings.js"), ctx, { filename: "js/input/bindings.js" });
  const InputBindings = vm.runInContext("InputBindings", ctx);
  const B = InputBindings.create({
    onKeysChanged() { counts.keys++; },
    onPadBindingChanged() { counts.pad++; },
    activePad,
  });
  return { B, counts };
}

// ---- key conflict / claim --------------------------------------------------

test("claiming a key another action held clears the displaced slot and reports it", () => {
  const { B, counts } = boot();
  const before = counts.keys;
  const r = B.setKeyBinding("boost", 0, "KeyX");
  assert.deepEqual(plain(r), { ok: true, conflict: "overtake" });
  assert.deepEqual(plain(B.getKeyMap().overtake), [null, null], "OVERTAKE lost both? only X — second was null");
  assert.deepEqual(plain(B.getKeyMap().boost), ["KeyX", null]);
  assert.equal(B.keyAction("KeyX"), "boost");
  assert.equal(B.keyAction("Space"), null, "old boost key unbound");
  assert.ok(counts.keys > before, "rebind notifies so held keys are not latched under a new meaning");
});

test("claiming a pad button another action held clears it and reports the conflict", () => {
  const { B, counts } = boot();
  const before = counts.pad;
  const r = B.setPadBinding("overtake", 1, 2);
  assert.deepEqual(plain(r), { ok: true, conflict: "boost" });
  assert.deepEqual(plain(B.getPadMap().boost), [null, null]);
  assert.deepEqual(plain(B.getPadMap().overtake), [3, 2]);
  assert.ok(counts.pad > before);
});

test("reserved keys and pad steer buttons are refused; same-slot rebind is a no-op conflict-wise", () => {
  const { B } = boot();
  assert.deepEqual(plain(B.setKeyBinding("boost", 1, "Escape")), { ok: false, reason: "reserved" });
  assert.deepEqual(plain(B.setPadBinding("boost", 1, 14)), { ok: false, reason: "reserved" });
  assert.deepEqual(plain(B.setPadBinding("boost", 1, 15)), { ok: false, reason: "reserved" });
  const snap = plain(B.getKeyMap().boost);
  assert.deepEqual(plain(B.setKeyBinding("boost", 0, "Space")), { ok: true, conflict: null });
  assert.deepEqual(plain(B.getKeyMap().boost), snap);
});

test("moving a key onto the same action's other slot clears the duplicate without a foreign conflict", () => {
  const { B } = boot();
  // SHIFT DOWN defaults to KeyQ + ShiftLeft; put ShiftLeft in slot 0.
  const r = B.setKeyBinding("shiftDown", 0, "ShiftLeft");
  assert.deepEqual(plain(r), { ok: true, conflict: null });
  assert.deepEqual(plain(B.getKeyMap().shiftDown), ["ShiftLeft", null]);
  assert.equal(B.keyAction("ShiftRight"), "shiftDown", "either Shift is one key");
});

// ---- defaults / reset ------------------------------------------------------

test("resetKeys and resetPad restore shipped maps; isDefault tracks drift", () => {
  const { B, counts } = boot();
  assert.equal(B.keysAreDefault(), true);
  assert.equal(B.padsAreDefault(), true);
  B.setKeyBinding("camera", 0, "KeyV");
  B.setPadBinding("camera", 0, 10);
  assert.equal(B.keysAreDefault(), false);
  assert.equal(B.padsAreDefault(), false);
  const padBefore = counts.pad;
  B.resetKeys();
  B.resetPad();
  assert.equal(B.keysAreDefault(), true);
  assert.equal(B.padsAreDefault(), true);
  assert.equal(B.getKeyMap().camera[0], "KeyC");
  assert.equal(B.getPadMap().camera[0], 8);
  assert.ok(counts.pad > padBefore, "resetPad must notify — a held pedal's button may have changed meaning");
});

test("clearPadBinding notifies onPadBindingChanged (parity with clearKeyBinding → onKeysChanged)", () => {
  // Held pedals latch in input.js; setPadBinding already clears them. Clearing
  // a slot (Backspace on CONTROLS) must do the same, or RT stays "gas" after
  // the chip is empty.
  const { B, counts } = boot();
  const before = counts.pad;
  assert.equal(B.clearPadBinding("throttle", 0), true);
  assert.deepEqual(plain(B.getPadMap().throttle), [null, 0]);
  assert.equal(counts.pad, before + 1, "clearPadBinding fires onPadBindingChanged");
  const keyBefore = counts.keys;
  assert.equal(B.clearKeyBinding("throttle", 1), true);
  assert.ok(counts.keys > keyBefore, "clearKeyBinding still rebuilds the reverse index");
});

// ---- persistence -----------------------------------------------------------

test("key and pad maps round-trip; malformed / old-shape entries degrade safely", () => {
  const { B } = boot();
  B.setKeyBinding("camera", 0, "KeyV");
  B.setKeyBinding("throttle", 1, "Numpad8");
  B.setPadBinding("camera", 0, 10);
  const keySaved = plain(B.getKeyMap());
  const padSaved = plain(B.getPadMap());

  const fresh = boot().B;
  assert.deepEqual(plain(fresh.setKeyMap(keySaved)), keySaved);
  assert.deepEqual(plain(fresh.setPadMap(padSaved)), padSaved);
  assert.equal(fresh.keysAreDefault(), false);
  assert.equal(fresh.padsAreDefault(), false);

  // Non-array / null / junk shape → keep defaults (reset + no adopt).
  const junk = boot().B;
  assert.deepEqual(plain(junk.setKeyMap(null).boost), ["Space", null]);
  assert.deepEqual(plain(junk.setKeyMap("nope").boost), ["Space", null]);
  assert.deepEqual(plain(junk.setKeyMap([]).boost), ["Space", null]);
  assert.deepEqual(plain(junk.setPadMap(undefined).throttle), [7, 0]);

  // Present-but-corrupt array: reserved / garbage slots become null (pinned).
  const bad = junk.setKeyMap({
    camera: ["Escape", "<img>"],
    boost: "KeyB",
    left: ["KeyA", "KeyA"],
    brake: 7,
  });
  assert.deepEqual(plain(bad.camera), [null, null]);
  assert.deepEqual(plain(bad.boost), ["Space", null], "non-array keeps default");
  assert.deepEqual(plain(bad.left), ["KeyA", null], "in-action duplicate collapses");
  assert.deepEqual(plain(bad.brake), ["ArrowDown", "KeyS"]);

  // An action the save predates keeps its default only where free.
  const partial = boot().B.setKeyMap({ shiftUp: ["KeyT", null] });
  assert.deepEqual(plain(partial.shiftUp), ["KeyT", null]);
  assert.deepEqual(plain(partial.radio), [null, null], "T already taken — RADIO stays empty");
  assert.deepEqual(plain(partial.pause), ["KeyP", null]);

  const padBad = boot().B.setPadMap({
    throttle: [14, "7"],
    brake: "x",
    boost: [2, 2],
    camera: [99, null],
  });
  assert.deepEqual(plain(padBad.throttle), [null, 7]);
  assert.deepEqual(plain(padBad.brake), [6, 1]);
  assert.deepEqual(plain(padBad.boost), [2, null]);
  assert.deepEqual(plain(padBad.camera), [null, null]);
});

test("setPadMap notifies so a loaded custom map cannot leave a held pedal latched", () => {
  const { B, counts } = boot();
  const before = counts.pad;
  B.setPadMap({ throttle: [10, null], brake: [6, 1] });
  assert.ok(counts.pad > before, "adopting a saved pad map fires onPadBindingChanged");
});

// ---- device-aware labels ---------------------------------------------------

test("keyLabel reads like a keycap; Shift/Ctrl sides collapse", () => {
  const { B } = boot();
  assert.equal(B.keyLabel("KeyX"), "X");
  assert.equal(B.keyLabel("Digit3"), "3");
  assert.equal(B.keyLabel("ArrowUp"), "\u2191");
  assert.equal(B.keyLabel("Space"), "SPACE");
  assert.equal(B.keyLabel("ShiftRight"), "SHIFT");
  assert.equal(B.keyLabel("ControlRight"), "CTRL");
  assert.equal(B.keyLabel(null), "");
});

test("padLabel follows auto-sniffed brand, and setPadLabelMode overrides it", () => {
  const xbox = boot(() => ({ id: "Xbox Wireless Controller" })).B;
  assert.equal(xbox.padBrand(), "xbox");
  assert.equal(xbox.padLabel(0), "A");
  assert.equal(xbox.padLabel(7), "RT");

  const ps = boot(() => ({ id: "Sony DualSense Wireless Controller (054c:0ce6)" })).B;
  assert.equal(ps.padBrand(), "ps");
  assert.equal(ps.padLabel(0), "CROSS");
  assert.equal(ps.padLabel(6), "L2");

  const nin = boot(() => ({ id: "Nintendo Switch Pro Controller (057e:2009)" })).B;
  assert.equal(nin.padBrand(), "nintendo");
  assert.equal(nin.padLabel(0), "B");
  assert.equal(nin.padLabel(1), "A");

  // Override wins over the live pad id; invalid mode falls back to auto.
  nin.setPadLabelMode("xbox");
  assert.equal(nin.padLabelMode(), "xbox");
  assert.equal(nin.padBrand(), "xbox");
  assert.equal(nin.padLabel(0), "A");
  nin.setPadLabelMode("nope");
  assert.equal(nin.padLabelMode(), "auto");
  assert.equal(nin.padBrand(), "nintendo");
  // Callers that already hold a Gamepad can pass it (skips activePad scan).
  assert.equal(nin.padBrand({ id: "DualShock 4" }), "ps");
});

// ---- hold / toggle mode (apex26.holdMode) ----------------------------------

test("InputBindings.parseHoldMode round-trips and rejects junk", () => {
  const sb = {
    Math, Object, Array, Number, JSON, Map, Set, String, RegExp, Promise,
    navigator: {}, Log: { info() {}, warn() {}, debug() {}, error() {}, enabled: () => false },
  };
  const ctx = vm.createContext(sb);
  vm.runInContext(read("js/input/bindings.js"), ctx, { filename: "js/input/bindings.js" });
  const parse = vm.runInContext("InputBindings.parseHoldMode", ctx);
  const defs = vm.runInContext("InputBindings.holdModeDefaults", ctx);
  assert.deepEqual(plain(defs()), { throttle: "hold", lookBack: "hold" });
  assert.deepEqual(plain(parse(null)), { throttle: "hold", lookBack: "hold" });
  assert.deepEqual(plain(parse({ throttle: "toggle", lookBack: "nope", extra: "toggle" })),
    { throttle: "toggle", lookBack: "hold" });
  assert.deepEqual(plain(parse({ lookBack: "toggle" })), { throttle: "hold", lookBack: "toggle" });
});

function bootInput(holdMode) {
  const readJs = (p) => read(p).replace(/^const\b/gm, "var");
  const listeners = {};
  const els = new Map();
  function el(id) {
    if (id && els.has(id)) return els.get(id);
    const on = {};
    const e = {
      id, cls: new Set(), attrs: {},
      addEventListener: (t, f) => { (on[t] ||= []).push(f); }, removeEventListener() {},
      fire(t, ev) { (on[t] || []).forEach((f) => f({ pointerId: 1, clientX: 0, clientY: 0, preventDefault() {}, ...ev })); },
      style: {}, dataset: {}, children: [],
      classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
      setAttribute() {}, getAttribute: () => null, removeAttribute() {},
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 300, height: 300 }),
      setPointerCapture() {}, releasePointerCapture() {}, hasPointerCapture: () => false,
    };
    if (id) els.set(id, e);
    return e;
  }
  const sb = {
    Math, Object, Array, Number, isFinite, JSON, Map, Set, Date, String, RegExp, Promise,
    performance: { now: () => 0 },
    Log: { info() {}, warn() {}, debug() {}, error() {}, enabled: () => false },
    addEventListener: (t, f) => { (listeners[t] ||= []).push(f); },
    removeEventListener() {}, setTimeout: () => 0, clearTimeout() {},
    navigator: {}, screen: {}, matchMedia: () => ({ matches: false, addEventListener() {} }),
    UiLayers: { inRace: () => true, anyOpen: () => false, navOpen: () => false },
    document: {
      addEventListener: (t, f) => { (listeners[t] ||= []).push(f); }, removeEventListener() {},
      getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], hidden: false,
      body: { classList: { add() {}, remove() {}, toggle() {} } }, activeElement: { tagName: "BODY" },
    },
  };
  sb.window = sb;
  const ctx = vm.createContext(sb);
  vm.runInContext(readJs("js/core/mat4.js"), ctx, { filename: "js/core/mat4.js" });
  for (const f of ["js/input/bindings.js", "js/input/pad-menu.js", "js/input/haptics.js", "js/input/hold-buttons.js", "js/input/input.js"])
    vm.runInContext(readJs(f), ctx, { filename: f });
  const Input = vm.runInContext("Input", ctx);
  Input.init(el("canvas"));
  if (holdMode) Input.setHoldMode(holdMode);
  const fire = (type, code) => (listeners[type] || []).forEach((f) => f({ key: code, code, repeat: false, isTrusted: true, preventDefault() {}, target: { tagName: "BODY" }, metaKey: false, ctrlKey: false }));
  return { Input, fire, listeners };
}

test("keyboard GAS toggle: tap on, tap off; rebind clears", () => {
  const { Input, fire } = bootInput({ throttle: "toggle" });
  fire("keydown", "KeyW");
  assert.equal(Input.throttle(), true);
  fire("keyup", "KeyW");
  assert.equal(Input.throttle(), true, "toggle survives key up");
  fire("keydown", "KeyW");
  assert.equal(Input.throttle(), false);
  fire("keydown", "KeyW");
  assert.equal(Input.throttle(), true);
  Input.setKeyBinding("throttle", 0, "KeyN");
  assert.equal(Input.throttle(), false, "rebind clears a latched toggle");
});

test("keyboard LOOK BACK toggle mirrors GAS semantics", () => {
  const { Input, fire } = bootInput({ lookBack: "toggle" });
  fire("keydown", "KeyB");
  assert.equal(Input.lookingBack(), true);
  fire("keyup", "KeyB");
  assert.equal(Input.lookingBack(), true);
  fire("keydown", "KeyB");
  assert.equal(Input.lookingBack(), false);
});

test("setHoldMode clears a live keyboard toggle", () => {
  const { Input, fire } = bootInput({ throttle: "toggle" });
  fire("keydown", "KeyW");
  assert.equal(Input.throttle(), true);
  Input.setHoldMode({ throttle: "hold" });
  assert.equal(Input.throttle(), false);
  assert.deepEqual(plain(Input.getHoldMode()), { throttle: "hold", lookBack: "hold" });
});
