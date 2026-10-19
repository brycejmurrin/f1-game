// key-binds.test.mjs — the rebindable driving keys in js/input/input.js.
//
// Every driving key used to be a literal in one switch; it is a TABLE now
// (KEY_ACTIONS / keyMap), which the CONTROLS page edits and HOW TO PLAY reads.
// The real input.js runs in a VM with just enough window for init(); keys are
// pressed by calling the listeners it registered.
import { test } from "node:test";
import assert from "node:assert/strict";
import { read, boot, fakePad, plain } from "../helpers/key-binds-rig.mjs";

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

test("the pause card's RECOVER CAR raises the same edge R raises (hunt3 7-F3)", () => {
  // Touch had no path to recoverPressed: only R, the pad and the paired phone.
  const { Input, key } = boot();
  key("KeyR", true); key("KeyR", false);
  assert.equal(Input.consumeRecover(), true, "R: the baseline edge");
  assert.equal(typeof Input.requestRecover, "function", "Input exposes the touch path");
  Input.requestRecover();
  assert.equal(Input.consumeRecover(), true, "RECOVER CAR raises it");
  assert.equal(Input.consumeRecover(), false, "an edge: consumed once");
  Input.requestRecover();
  Input.clearEdges();
  assert.equal(Input.consumeRecover(), false, "clearEdges drops it like R's (paused frames, lights-out)");
  // The pause card's RACE TOOLS tray gets the tile (built in game.js, as
  // replay-buf.js builds REPLAY, so the shell's node count holds).
  const shell = read("index.html");
  assert.match(shell, /<nav id="pm-quick-doors"[\s\S]*?<details id="pm-checkpoint">/, "the tray and its REWIND tile exist");
  const game = read("js/game.js");
  assert.match(game, /\$\("pm-quick-doors"\)\.insertBefore\(Object\.assign\(document\.createElement\("button"\), \{ id: "pm-recover", type: "button", textContent: "RECOVER CAR", onclick: \(\) => \{ setPaused\(false\); Input\.requestRecover\(\); \} \}\), \$\("pm-checkpoint"\)\)/,
    "RECOVER CAR resumes, then raises the edge game.js's consumeRecover gate reads");
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
