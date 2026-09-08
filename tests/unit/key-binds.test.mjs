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
      body: { classList: { add() {}, remove() {}, toggle() {} } },
    },
  };
  sb.window = sb;
  const ctx = vm.createContext(sb);
  vm.runInContext(read("js/core/mat4.js"), ctx, { filename: "js/core/mat4.js" });
  vm.runInContext(read("js/input/input.js"), ctx, { filename: "js/input/input.js" });
  const Input = vm.runInContext("Input", ctx);
  Input.init(el());
  const key = (code, down) => (listeners[down ? "keydown" : "keyup"] || [])
    .forEach((f) => f({ key: code, code, repeat: false, preventDefault() {}, target: { tagName: "BODY" } }));
  return { Input, key };
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
