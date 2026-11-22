/* throttle-latch.test.mjs — THROTTLE = LATCH, measured through the real pedal
 * listeners rather than read off the source.
 *
 * XAG 107 (Duration) names our exact case: holding accelerate for a whole race
 * is a fatigue barrier, and a toggle is the fix that sits between HOLD and the
 * full AUTO assist. The three things that can go wrong are all here:
 *
 *   1. the UP edge must not undo the DOWN edge (a tap would be a no-op),
 *   2. a latched throttle must be FULL travel, not the pedal's last modulation,
 *   3. it must drop on the everything-off path — a latch that survives a window
 *      blur accelerates the car while the player is not looking at it.
 *
 * Run: node --test tests/unit/throttle-latch.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { absSrc } from "../helpers/abs-src.mjs";
import { symbolSource } from "../helpers/game-source.mjs";
import { cssRules, decl } from "../helpers/css-rules.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8").replace(/^const\b/gm, "var");

// Like digital-steer.test.mjs's boot, but the element stubs are KEPT BY ID and
// record their listeners, because this test has to fire the pedal's own
// pointerdown/pointerup rather than a window key event.
function boot(initOpts) {
  const listeners = {};
  const els = new Map();
  const clock = { t: 0 };
  function el(id) {
    if (id && els.has(id)) return els.get(id);
    const on = {};
    const e = {
      id, cls: new Set(), attrs: {},
      addEventListener: (t, f) => { (on[t] ||= []).push(f); }, removeEventListener() {},
      fire(t, ev) {
        const event = { pointerId: 1, clientX: 0, clientY: 0, preventDefault() { this.defaultPrevented = true; },
          stopPropagation() { this.cancelBubble = true; }, ...ev };
        (on[t] || []).forEach((f) => f(event));
        return event;
      },
      style: {}, dataset: {}, children: [],
      classList: {
        add(c) { e.cls.add(c); }, remove(c) { e.cls.delete(c); },
        toggle(c, on2) { if (on2) e.cls.add(c); else e.cls.delete(c); },
        contains: (c) => e.cls.has(c),
      },
      setAttribute(k, v) { e.attrs[k] = v; }, getAttribute: (k) => (k in e.attrs ? e.attrs[k] : null),
      removeAttribute(k) { delete e.attrs[k]; },
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 300, height: 300 }),
      setPointerCapture() {}, releasePointerCapture() {}, hasPointerCapture: () => false,
    };
    if (id) els.set(id, e);
    return e;
  }
  const sb = {
    Math, Object, Array, Number, isFinite, JSON, Map, Set, Date,
    performance: { now: () => clock.t },
    Log: { info() {}, warn() {}, debug() {}, error() {}, enabled: () => false },
    addEventListener: (t, f) => { (listeners[t] ||= []).push(f); },
    removeEventListener() {}, setTimeout: () => 0, clearTimeout() {},
    navigator: {}, screen: {}, matchMedia: () => ({ matches: false, addEventListener() {} }),
    document: {
      addEventListener: (t, f) => { (listeners[t] ||= []).push(f); }, removeEventListener() {},
      getElementById: el, querySelector: () => el(), querySelectorAll: () => [], hidden: false,
      body: { classList: { add() {}, remove() {}, toggle() {} } },
    },
  };
  sb.window = sb;
  const ctx = vm.createContext(sb);
  vm.runInContext(read("js/core/mat4.js"), ctx, { filename: absSrc("js/core/mat4.js") });
  for (const f of ["js/input/bindings.js", "js/input/pad-menu.js", "js/input/haptics.js", "js/input/pedal-travel.js", "js/input/hold-buttons.js", "js/input/input.js"])
    vm.runInContext(read(f), ctx, { filename: absSrc(f) });
  const Input = vm.runInContext("Input", ctx);
  Input.init(el(), initOpts);
  const pedal = el("btn-throttle");
  const tap = () => { pedal.fire("pointerdown"); pedal.fire("pointerup"); };
  const blur = () => (listeners.blur || []).forEach((f) => f({}));
  return { Input, pedal, tap, blur, listeners, sb, clock };
}

// Real Input + InputPadMenu; only the browser's pad snapshots and pause layer
// are fake. RESUME closes that layer inside the same poll that activates it.
function bootPad() {
  const h = boot(), { Input, sb, listeners, clock } = h;
  const menu = { open: false };
  const resume = { id: "pm-resume", tagName: "BUTTON", matches: () => true,
    click() { menu.open = false; sb.document.activeElement = null; } };
  const layer = { id: "pausemenu", contains: (e) => e === resume };
  sb.UiLayers = { anyOpen: () => menu.open, navOpen: () => menu.open,
    inRace: () => true, top: () => menu.open ? layer : null };
  sb.MenuNav = { activeLayer: () => menu.open ? layer : null, FOCUSABLE: "button" };
  const pad = { index: 0, id: "Xbox Wireless Controller", mapping: "standard", connected: true,
    axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
  sb.navigator.getGamepads = () => [pad];
  (listeners.gamepadconnected || []).forEach((f) => f({ gamepad: pad }));
  const poll = () => { clock.t += 16; Input.poll(); };
  const button = (i, down) => { pad.buttons[i] = { pressed: down, value: down ? 1 : 0 }; };
  poll();
  return { ...h, pad, menu, poll, button,
    pause() { menu.open = true; sb.document.activeElement = resume; poll(); } };
}

test("gamepad A on RESUME cannot arm GAS TOGGLE, including a confirm held into the resumed frame", () => {
  for (const held of [false, true]) {
    const { Input, menu, pause, poll, button } = bootPad();
    Input.setHoldMode({ throttle: "toggle", lookBack: "toggle" });
    pause(); button(0, true); poll();
    assert.equal(menu.open, false, "the real pad menu activated RESUME");
    assert.equal(Input.throttleLevel(), 0, "the menu owns the activation frame");
    if (held) {
      poll();
      assert.equal(Input.throttleLevel(), 0, "held confirm has no fresh driving edge");
    }
    button(0, false); poll(); poll();
    assert.equal(Input.throttle(), false, "released confirm cannot leave gas latched");
    assert.equal(Input.throttleLevel(), 0, "later frames stay off");
    button(0, true); poll();
    assert.equal(Input.throttleLevel(), 1, "a fresh driving press still toggles gas on");
  }
});

test("button and axis capture consume driving toggle edges even when their callback ends capture", () => {
  for (const capture of ["button", "axis"]) {
    const { Input, pad, poll, button } = bootPad();
    Input.setHoldMode({ throttle: "toggle", lookBack: "toggle" });
    let captured = false;
    if (capture === "button") Input.padCapture(() => { captured = true; Input.padCapture(null); });
    else Input.beginAxisCapture(() => { captured = true; });
    button(7, true); button(11, true);
    if (capture === "axis") pad.axes[0] = 0.6;
    poll();
    assert.equal(captured, true, capture + " capture received the input");
    poll();
    assert.equal(Input.throttleLevel(), 0, "a held captured press cannot become a gas toggle");
    assert.equal(Input.lookingBack(), false, "capture also owns LOOK BACK");
    button(7, false); button(11, false); poll();
    assert.equal(Input.throttle(), false, "gas stays off after release");
  }
});

test("gamepad driving toggles still latch on fresh presses and release on the second press", () => {
  const { Input, poll, button } = bootPad();
  Input.setHoldMode({ throttle: "toggle", lookBack: "toggle" });
  for (const expected of [true, false]) {
    button(7, true); button(11, true); poll(); poll();
    button(7, false); button(11, false); poll();
    assert.equal(Input.throttle(), expected);
    assert.equal(Input.throttleLevel(), expected ? 1 : 0);
    assert.equal(Input.lookingBack(), expected);
  }
});

test("the on-screen pedal's menu gate is read once per poll(), not once per pedal read (PERF-HUNT-2 S5)", () => {
  const { Input, pedal, sb } = boot();
  let open = true, asks = 0;
  sb.UiLayers = { anyOpen: () => { asks++; return open; }, navOpen: () => open };
  pedal.fire("pointerdown");
  assert.equal(Input.throttle(), false, "before any poll the gate is asked live: an open layer gates the pedal");
  Input.poll();
  assert.equal(Input.throttle(), false, "polled with the layer open: gated");
  open = false;
  asks = 0;
  for (let i = 0; i < 5; i++) { Input.throttle(); Input.throttleLevel(); Input.braking(); Input.brakeLevel(); }
  assert.equal(asks, 0, "the step loop's pedal reads must not walk the layers again");
  assert.equal(Input.throttle(), false, "…so the frame keeps the answer its poll() latched");
  assert.equal(Input.debugState().throttle, true, "debugState() is a live readout, never the latch");
  Input.poll();
  assert.equal(Input.throttle(), true, "the next poll() sees the layer closed");
  assert.equal(Input.throttleLevel(), 1);
  pedal.fire("pointerup");
});

test("HOLD is unchanged: the pedal follows the thumb", () => {
  const { Input, pedal } = boot();
  pedal.fire("pointerdown");
  assert.equal(Input.throttle(), true);
  pedal.fire("pointerup");
  assert.equal(Input.throttle(), false, "releasing the pedal must lift the throttle in HOLD");
  assert.equal(Input.throttleLatched(), false);
});

test("LATCH: a tap sticks, a second tap lifts", () => {
  const { Input, tap } = boot();
  Input.setThrottleLatch(true);
  tap();
  assert.equal(Input.throttle(), true, "the UP edge must not undo the DOWN edge");
  assert.equal(Input.throttleLatched(), true);
  tap();
  assert.equal(Input.throttle(), false, "a second tap lifts it");
  assert.equal(Input.throttleLatched(), false);
});

test("LATCH is FULL travel, not the pedal's last modulation", () => {
  const { Input, pedal } = boot();
  Input.setThrottleLatch(true);
  pedal.fire("pointerdown");
  pedal.fire("pointermove", { clientY: 400 });   // slide DOWN = ease off
  pedal.fire("pointerup");
  assert.equal(Input.throttleLatched(), true);
  assert.equal(Input.throttleLevel(), 1, "a latched pedal is held at 1, not at wherever the thumb slid to");
});

test("a latch drops on blur and on reset — it never outlives the window", () => {
  for (const how of ["blur", "reset"]) {
    const h = boot();
    h.Input.setThrottleLatch(true);
    h.tap();
    assert.equal(h.Input.throttleLatched(), true);
    if (how === "blur") h.blur(); else h.Input.reset();
    assert.equal(h.Input.throttleLatched(), false, `a latch must not survive ${how}`);
    assert.equal(h.Input.throttleLevel(), 0);
  }
});

test("leaving LATCH mode clears a live latch", () => {
  const { Input, tap } = boot();
  Input.setThrottleLatch(true);
  tap();
  Input.setThrottleLatch(false);
  assert.equal(Input.throttle(), false, "switching back to HOLD must not leave the throttle pinned on");
  assert.equal(Input.throttleLatched(), false);
});

test("the pedal SHOWS the latch: :active follows the thumb, .on outlives it", () => {
  const { Input, pedal, tap } = boot();
  Input.setThrottleLatch(true);
  assert.equal(pedal.getAttribute("aria-pressed"), "false", "in LATCH the pedal is a toggle button");
  tap();
  assert.equal(pedal.classList.contains("on"), true);
  assert.equal(pedal.getAttribute("aria-pressed"), "true");
  tap();
  assert.equal(pedal.classList.contains("on"), false);
  Input.setThrottleLatch(false);
  assert.equal(pedal.getAttribute("aria-pressed"), null, "in HOLD it is a plain button again");
});

test("the LAST FINGER LIFTING keeps the latch (touchend has touches.length 0 on every lift)", () => {
  const h = boot();
  h.Input.setThrottleLatch(true);
  h.tap();
  assert.equal(h.Input.throttleLatched(), true);
  (h.listeners.touchend || []).forEach((f) => f({ touches: { length: 0 } }));
  assert.equal(h.Input.throttleLatched(), true, "lifting the thumb off GAS is what LATCH is for");
  assert.ok(h.Input.throttle() > 0.99, "still full throttle");
  (h.listeners.touchcancel || []).forEach((f) => f({ touches: { length: 0 } }));
  assert.equal(h.Input.throttleLatched(), true, "a touchcancel net releases the held buttons, not the latch");
  h.blur();
  assert.equal(h.Input.throttleLatched(), false, "…but a blur still drops it");
});

test("LATCH: a second finger landing on GAS does not cancel the latch while the first is down", () => {
  const { Input, pedal } = boot();
  Input.setThrottleLatch(true);
  pedal.fire("pointerdown", { pointerId: 1 });
  assert.equal(Input.throttleLatched(), true);
  pedal.fire("pointerdown", { pointerId: 2 });
  assert.equal(Input.throttleLatched(), true, "only the first contact is a press edge");
  pedal.fire("pointerup", { pointerId: 1 });
  pedal.fire("pointerup", { pointerId: 2 });
  assert.equal(Input.throttleLatched(), true, "releasing both fingers keeps the latch");
  assert.ok(Input.throttle() > 0.99);
  pedal.fire("pointerdown", { pointerId: 3 });
  pedal.fire("pointerup", { pointerId: 3 });
  assert.equal(Input.throttleLatched(), false, "a fresh tap still lifts it");
});

test("input hunt fixes: pad steer gated under a menu, rotation keeps the tilt zero, Ctrl/Alt reserved, lobby asks for tilt", () => {
  const input = fs.readFileSync(path.join(ROOT, "js/input/input.js"), "utf8");
  // The d-pad walking a friend race's pause menu no longer steers the car: the
  // PAUSED car reads PAUSED_NET_INPUT (game.js inputOf), so input.js keeps
  // reading the stick under menus (ui-improve-pass pins that on purpose).
  assert.match(fs.readFileSync(path.join(ROOT, "js/game.js"), "utf8"), /if \(c\.local && paused && netPlay\.active\(\)\) return PAUSED_NET_INPUT;/);
  const rotMatch = input.match(/function onScreenRotate\(\) \{[\s\S]*?\n  \}/);
  assert.ok(rotMatch, "onScreenRotate() not found in input.js");
  const rot = rotMatch[0];
  assert.doesNotMatch(rot, /calibrate/, "a rotation must not re-sample the neutral mid-corner");
  const bindings = fs.readFileSync(path.join(ROOT, "js/input/bindings.js"), "utf8");
  for (const k of ["AltLeft", "AltRight", "ControlLeft", "ControlRight"])
    assert.match(bindings, new RegExp(`KEY_RESERVED = \\{[^}]*${k}: 1`), `${k} cannot be bound`);
  const lobby = fs.readFileSync(path.join(ROOT, "js/net/lobby.js"), "utf8");
  for (const id of ["vs-host", "vs-join", "vs-ready", "vs-start", "vs-code-host", "vs-code-go"])
    assert.match(lobby, new RegExp(`on\\("${id}", tiltToo\\(`), `${id} asks for tilt inside its click`);
});

test("a MIRROR press on the grid does not survive clearDriveEdges (it would toggle the mirror at lights-out)", () => {
  const { Input, listeners } = boot();
  const down = (code) => (listeners.keydown || []).forEach((f) => f({ key: code, code, repeat: false, isTrusted: true, preventDefault() {}, target: { tagName: "BODY" } }));
  down("KeyM");
  Input.clearDriveEdges();
  assert.equal(Input.consumeMirror(), false, "the grid press is spent at lights-out");
  down("KeyM");
  assert.equal(Input.consumeMirror(), true, "a press in the running race is still consumed once");
  assert.equal(Input.consumeMirror(), false);
});


const tapActions = [
  ["btn-boost", "consumeBoostToggle"], ["btn-ot", "consumeOvertake"],
  ["btn-aero", "consumeAeroToggle"], ["shift-up", "consumeShiftUp"], ["shift-down", "consumeShiftDown"],
];

test("HUD tap actions accept semantic clicks and keep pointer presses immediate without firing twice", () => {
  for (const [id, consume] of tapActions) {
    const { Input, sb } = boot(), button = sb.document.getElementById(id);
    button.fire("click", { detail: 0 });
    assert.equal(Input[consume](), true, id + " activates through keyboard/assistive click");
    for (const pointerType of ["touch", "mouse", "pen"]) {
      button.fire("pointerdown", { pointerType, button: 0 });
      assert.equal(Input[consume](), true, id + " answers on pointerdown");
      button.fire("pointerup", { pointerType });
      button.fire("click", { detail: 1, pointerType, button: 0 });
      assert.equal(Input[consume](), false, id + " does not repeat on the pointer's click");
    }
    for (const pointerId of [11, 12]) {
      button.fire("pointerdown", { pointerId, pointerType: "touch" });
      assert.equal(Input[consume](), true, "each finger gets one immediate press");
    }
    for (const pointerId of [11, 12]) {
      button.fire("click", { pointerId, detail: 1 });
      assert.equal(Input[consume](), false, "neither finger's follow-up click repeats its press");
    }
    button.fire("pointerdown", { pointerType: "touch" });
    assert.equal(Input[consume](), true);
    // A drag may produce no click; it must not swallow the next AT activation.
    button.fire("pointercancel", { pointerType: "touch" });
    button.fire("click", { detail: 0 });
    assert.equal(Input[consume](), true, "a pointerless activation survives a lost pointer click");
  }
});

test("HUD tap actions honor native and announced disabled states for both activation paths", () => {
  for (const [id, consume] of tapActions) {
    const { Input, sb } = boot(), button = sb.document.getElementById(id);
    for (const disabled of ["native", "aria"]) {
      button.disabled = disabled === "native";
      button.setAttribute("aria-disabled", disabled === "aria" ? "true" : "false");
      button.fire("pointerdown", { pointerType: "touch" });
      button.fire("click", { detail: 0 });
      assert.equal(Input[consume](), false, id + " ignores " + disabled + " disabled activation");
    }
    button.removeAttribute("aria-disabled"); button.disabled = false;
    button.fire("click", { detail: 0 });
    assert.equal(Input[consume](), true, "reenabling restores semantic activation");
  }
});

test("Enter and Space on a HUD tap button activate its click without also reaching BOOST", () => {
  for (const code of ["Enter", "NumpadEnter", "Space"]) {
    const { Input, sb, listeners } = boot(), button = sb.document.getElementById("shift-up");
    Object.assign(button, { tagName: "BUTTON", matches: () => true, click: () => button.fire("click", { detail: 0 }) });
    sb.document.activeElement = button;
    const send = (type, extra) => {
      const event = button.fire(type, { code, key: code === "Space" ? " " : "Enter", target: button, ...extra });
      if (!event.cancelBubble) (listeners[type] || []).forEach((f) => f(event));
      return event;
    };
    const down = send("keydown");
    assert.equal(down.cancelBubble, true, code + " must not initiate a window driving binding");
    assert.equal(down.defaultPrevented, true, "the explicit click replaces the UA default without duplication");
    assert.equal(Input.consumeShiftUp(), true);
    send("keydown", { repeat: true });
    assert.equal(Input.consumeShiftUp(), false, "holding the key cannot repeat the tap action");
    assert.ok(!send("keyup").cancelBubble, "releases still reach the window input bookkeeping");
    assert.equal(Input.consumeBoostToggle(), false, "Space on SHIFT UP cannot toggle BOOST");
  }
});

test("a driving key released after focus moves into a HUD tap button clears its held latch", () => {
  const { Input, sb, listeners } = boot(), button = sb.document.getElementById("shift-up");
  Input.setKeyBinding("throttle", 0, "Space");
  const key = { code: "Space", key: " ", preventDefault() {}, target: { tagName: "BODY" } };
  (listeners.keydown || []).forEach((f) => f(key));
  assert.equal(Input.throttle(), true, "Space was held while the canvas owned keyboard input");
  Object.assign(button, { tagName: "BUTTON", matches: () => true }); sb.document.activeElement = button;
  const up = button.fire("keyup", { code: "Space", key: " ", target: button });
  if (!up.cancelBubble) (listeners.keyup || []).forEach((f) => f(up));
  assert.equal(Input.throttle(), false, "moving focus cannot strand a rebound driving key");
});

for (const id of ["pausebtn", "btn-cam", "hud-restore", "pc-restore"]) {
  test(`${id} leaves native activation keys to the button and preserves movement releases`, () => {
    const { Input, sb, listeners } = boot(), button = sb.document.getElementById(id);
    let clicks = 0;
    Object.assign(button, { tagName: "BUTTON", matches: (selector) => selector.split(", ").includes("#" + id),
      click: () => { clicks++; } });
    sb.document.activeElement = button;
    const send = (code, down) => {
      const event = button.fire(down ? "keydown" : "keyup", {
        code, key: code === "Space" ? " " : code, repeat: false,
        target: sb.document.activeElement || { tagName: "BODY" }
      });
      (listeners[down ? "keydown" : "keyup"] || []).forEach((f) => f(event));
      return event;
    };
    for (const code of ["Space", "Enter", "NumpadEnter"]) {
      assert.ok(!send(code, true).defaultPrevented, code + " keydown retains its native default");
      assert.ok(!send(code, false).defaultPrevented, code + " keyup retains its native default");
      assert.equal(Input.consumeBoostToggle(), false, "activation cannot also queue BOOST");
    }
    assert.equal(clicks, 0, "Input does not synthesize a duplicate click alongside the native default");
    send("KeyW", true);
    assert.equal(Input.throttle(), true, "movement still works while a HUD button has focus");
    send("KeyW", false);
    assert.equal(Input.throttle(), false);
    Input.setKeyBinding("throttle", 0, "Space");
    sb.document.activeElement = null;
    send("Space", true);
    assert.equal(Input.throttle(), true, "Space can hold a rebound driving action before focus moves");
    sb.document.activeElement = button;
    assert.ok(!send("Space", false).defaultPrevented);
    assert.equal(Input.throttle(), false, "activation-key release clears the earlier driving latch");
  });
}


test("a silent gyro falls back after 1.5s only while its permission attempt still owns tilt", async () => {
  for (const change of ["none", "new-request", "different-mode", "motion-seen"]) {
    let generation = 1;
    const timers = [], changed = [], messages = [];
    const input = { requestGyro: () => Promise.resolve(true), gyroRequestId: () => generation,
      calibrate() {}, gyroSeen: false, gyroHardDenied: false, gyroDenied: false, tiltActive: () => true };
    const ctx = vm.createContext({ Input: input, steerMode: "tilt", headlessMode: false,
      els: { audiostate: {} }, paintSteer() {}, tiltSay: text => messages.push(text),
      setTimeout: (fn, ms) => { timers.push({ fn, ms }); },
      setSteerMode: mode => { changed.push(mode); ctx.steerMode = mode; } });
    vm.runInContext(symbolSource("function enableTilt()") + "\nenableTilt();", ctx, { filename: "vm-snippet:enable-tilt-silent-sensor" });
    await Promise.resolve();
    assert.equal(timers.length, 1, "successful permission arms the real fallback timer");
    assert.equal(timers[0].ms, 1500);
    if (change === "new-request") generation++;
    if (change === "different-mode") ctx.steerMode = "touch";
    if (change === "motion-seen") input.gyroSeen = true;
    timers[0].fn();
    assert.deepEqual(changed, change === "none" ? ["buttons"] : []);
    assert.equal(messages.includes("no motion sensor — switched to buttons"), change === "none");
  }
});

// ---- SLIDE HAND-OFF between sibling hold controls (#5575 findings 2 and 3) ----
// A captured pointer stayed with the control it landed on: a thumb slid from GAS
// up onto BRAKE never braked and left 12 % throttle, and one slid from the left
// arrow onto the right kept steering left. Driven through the real listeners, on
// the dock geometry of the 844x390 phone at BUTTON SIZE 143: BRAKE directly
// above GAS, the arrows side by side 8 px apart.
const BOX = {
  "btn-brake":       { left: 700, top: 180, width: 90, height: 90 },
  "btn-throttle":    { left: 700, top: 278, width: 90, height: 90 },
  "btn-steer-left":  { left: 20,  top: 265, width: 103, height: 103 },
  "btn-steer-right": { left: 131, top: 265, width: 103, height: 103 },
};
function bootDock() {
  const h = boot();
  const b = {};
  for (const id of Object.keys(BOX)) {
    b[id] = h.sb.document.getElementById(id);
    b[id].getBoundingClientRect = () => BOX[id];
    b[id].captured = new Set();
    b[id].setPointerCapture = (p) => b[id].captured.add(p);
    b[id].releasePointerCapture = (p) => b[id].captured.delete(p);
  }
  const mid = (id) => ({ clientX: BOX[id].left + BOX[id].width / 2, clientY: BOX[id].top + BOX[id].height / 2 });
  const win = (t, ev) => (h.listeners[t] || []).forEach((f) => f({ pointerId: 1, touches: [], ...ev }));
  // A real lift reaches the window capture net as well as the capturing element.
  const lift = (id, pointerId = 1) => { win("pointerup", { pointerId }); b[id].fire("pointerup", { pointerId }); };
  const btn = () => h.Input.debugState().btn;
  return { ...h, gas: b["btn-throttle"], brake: b["btn-brake"], left: b["btn-steer-left"], right: b["btn-steer-right"], mid, win, lift, btn };
}

test("sliding one thumb from GAS up onto BRAKE brakes and drops the throttle; sliding back restores it (#5575)", () => {
  const { gas, brake, mid, lift, btn } = bootDock();
  gas.fire("pointerdown", mid("btn-throttle"));
  assert.deepEqual([btn().throttle, btn().throttleVal, btn().brake], [true, 1, false]);
  // Still on GAS, 40 px up: the documented single-pedal ease, untouched.
  gas.fire("pointermove", { clientX: 745, clientY: 283 });
  assert.equal(btn().throttle, true);
  assert.equal(btn().brake, false);
  assert.ok(btn().throttleVal < 1 && btn().throttleVal > 0.12, "stamp-then-ease still eases inside the pedal");
  // In the 8 px gap between the pedals nothing changes hands.
  gas.fire("pointermove", { clientX: 745, clientY: 274 });
  assert.deepEqual([btn().throttle, btn().brake], [true, false]);
  // Onto BRAKE (capture still delivers the move to GAS).
  gas.fire("pointermove", mid("btn-brake"));
  assert.deepEqual([btn().throttle, btn().throttleVal], [false, 0], "GAS is released, not left at the 0.12 floor");
  assert.deepEqual([btn().brake, btn().brakeVal], [true, 1], "BRAKE is pressed at full travel");
  assert.equal(brake.captured.has(1), true, "the pointer is now captured by BRAKE");
  assert.equal(gas.captured.has(1), false);
  assert.deepEqual([brake.attrs["data-slid"], gas.attrs["data-slid"]], ["on", "off"], "the pressed look follows the thumb");
  // Further up the same slide must not read as easing the brake off.
  brake.fire("pointermove", { clientX: 745, clientY: 185 });
  assert.equal(btn().brakeVal, 1);
  // …and it hands back the same way.
  brake.fire("pointermove", mid("btn-throttle"));
  assert.deepEqual([btn().throttle, btn().throttleVal, btn().brake, btn().brakeVal], [true, 1, false, 0]);
  // A browser that keeps a touch's moves on the control it LANDED on, whatever
  // setPointerCapture said: GAS -> BRAKE -> GAS has to work when every move of
  // the contact arrives on GAS.
  gas.fire("pointermove", mid("btn-brake"));
  assert.deepEqual([btn().throttle, btn().brake], [false, true]);
  gas.fire("pointermove", mid("btn-throttle"));
  assert.deepEqual([btn().throttle, btn().throttleVal, btn().brake, btn().brakeVal], [true, 1, false, 0]);
  lift("btn-throttle");
  assert.deepEqual([btn().throttle, btn().brake, btn().throttleVal, btn().brakeVal], [false, false, 0, 0]);
  for (const el of [gas, brake]) assert.equal("data-slid" in el.attrs, false);
});

test("sliding one thumb from the left arrow onto the right steers right (#5575)", () => {
  const { Input, left, right, mid, lift, btn, clock } = bootDock();
  Input.setSteerMode("buttons");
  left.fire("pointerdown", mid("btn-steer-left"));
  for (let i = 0; i < 40; i++) { clock.t += 16; Input.steer(); }
  assert.ok(Input.steer() < 0, "holding the left arrow steers left");
  left.fire("pointermove", mid("btn-steer-right"));
  assert.deepEqual([btn().left, btn().leftVal, btn().right, btn().rightVal], [false, 0, true, 1]);
  for (let i = 0; i < 80; i++) { clock.t += 16; Input.steer(); }
  assert.ok(Input.steer() > 0, "the wheel follows the arrow under the thumb");
  right.fire("pointermove", mid("btn-steer-left"));
  assert.deepEqual([btn().left, btn().right], [true, false]);
  lift("btn-steer-left");
  assert.deepEqual([btn().left, btn().right], [false, false]);
});

test("a hand-off moves only the finger that slid: a second finger keeps its control (#5575)", () => {
  const { gas, brake, left, mid, lift, btn } = bootDock();
  // Left thumb steers, right thumb slides GAS -> BRAKE: the arrow is untouched.
  left.fire("pointerdown", { pointerId: 2, ...mid("btn-steer-left") });
  gas.fire("pointerdown", { pointerId: 1, ...mid("btn-throttle") });
  gas.fire("pointermove", { pointerId: 1, ...mid("btn-brake") });
  assert.deepEqual([btn().left, btn().throttle, btn().brake], [true, false, true]);
  lift("btn-brake", 1);
  assert.deepEqual([btn().left, btn().brake], [true, false]);
  lift("btn-steer-left", 2);
  // Two fingers on GAS, one slides to BRAKE: GAS stays held by the other.
  gas.fire("pointerdown", { pointerId: 1, ...mid("btn-throttle") });
  gas.fire("pointerdown", { pointerId: 3, ...mid("btn-throttle") });
  gas.fire("pointermove", { pointerId: 3, ...mid("btn-brake") });
  assert.deepEqual([btn().throttle, btn().throttleVal, btn().brake], [true, 1, true]);
  lift("btn-brake", 3);
  assert.deepEqual([btn().throttle, btn().brake], [true, false]);
  lift("btn-throttle", 1);
  assert.equal(btn().throttle, false);
});

test("a hidden sibling takes no hand-off: BRAKE cannot slide onto the GAS that AUTO throttle hid (#5575)", () => {
  const { gas, brake, mid, btn } = bootDock();
  gas.hidden = true;
  brake.fire("pointerdown", mid("btn-brake"));
  brake.fire("pointermove", mid("btn-throttle"));
  assert.deepEqual([btn().brake, btn().throttle], [true, false]);
});

test("pointercancel, a hidden page and a rotation release a handed-off hold (#5575)", () => {
  const cases = {
    pointercancel: (h) => { h.win("pointercancel"); h.brake.fire("pointercancel"); },
    visibilitychange: (h) => { h.sb.document.hidden = true; h.win("visibilitychange"); },
    blur: (h) => h.blur(),
    orientationchange: (h) => h.win("orientationchange"),
  };
  for (const [name, act] of Object.entries(cases)) {
    const h = bootDock();
    h.gas.fire("pointerdown", h.mid("btn-throttle"));
    h.gas.fire("pointermove", h.mid("btn-brake"));
    assert.equal(h.btn().brake, true, name);
    act(h);
    assert.deepEqual([h.btn().throttle, h.btn().brake, h.btn().throttleVal, h.btn().brakeVal], [false, false, 0, 0], name);
    assert.deepEqual([...h.Input.debugState().holdPointers].filter(Boolean), [], name + ": no ghost pointer is left in any hold set");
    assert.deepEqual(["data-slid" in h.brake.attrs, "data-slid" in h.gas.attrs], [false, false], name);
    // The next press starts clean.
    h.gas.fire("pointerdown", h.mid("btn-throttle"));
    assert.deepEqual([h.btn().throttle, h.btn().brake], [true, false], name);
  }
});

test("THROTTLE = LATCH: sliding off a latched GAS keeps the latch, and BRAKE still works (#5575)", () => {
  const { Input, gas, mid, lift, btn } = bootDock();
  Input.setThrottleLatch(true);
  gas.fire("pointerdown", mid("btn-throttle"));
  gas.fire("pointermove", mid("btn-brake"));
  assert.deepEqual([btn().throttle, btn().brake], [true, true], "the latch outlives the thumb, as it does on a lift");
  lift("btn-brake");
  assert.deepEqual([btn().throttle, btn().brake], [true, false]);
});

test("changing a device's bindings releases only that device's toggled throttle", () => {
  const { Input, listeners, poll, button } = bootPad();
  Input.setHoldMode({ throttle: "toggle" });
  const key = { code: "KeyW", key: "w", preventDefault() {}, target: {} };
  for (const listener of listeners.keydown) listener(key);
  for (const listener of listeners.keyup) listener(key);
  assert.equal(Input.throttleLevel(), 1);
  Input.setPadMap(null);
  assert.equal(Input.throttleLevel(), 1, "loading a controller profile preserves keyboard gas");
  Input.setKeyMap(null);
  assert.equal(Input.throttleLevel(), 0);
  button(7, true); poll(); button(7, false); poll();
  assert.equal(Input.throttleLevel(), 1);
  Input.setKeyMap(null); poll();
  assert.equal(Input.throttleLevel(), 1, "keyboard changes preserve controller gas");
  Input.setPadMap(null); poll();
  assert.equal(Input.throttleLevel(), 0);
});

test("clean-room 14: a controller that vanishes without a disconnect event drops the GAS / LOOK BACK latch", () => {
  const { Input, sb, pad, poll, button } = bootPad();
  Input.setHoldMode({ throttle: "toggle", lookBack: "toggle" });
  button(7, true); button(11, true); poll(); poll();
  button(7, false); button(11, false); poll();
  assert.equal(Input.throttleLevel(), 1, "latched on");
  sb.navigator.getGamepads = () => [];                    // silent drop: no gamepaddisconnected
  poll();
  sb.navigator.getGamepads = () => [pad];                 // back, idle
  poll(); poll();
  assert.equal(Input.throttle(), false, "no GAS with nothing pressed");
  assert.equal(Input.throttleLevel(), 0);
  assert.equal(Input.lookingBack(), false);
});


test("separate Gas and Brake profiles apply at contact and hand-off; the face fill clears on cancel", () => {
  const { sb, gas, brake, mid, btn, win } = bootDock();
  for (const el of [gas, brake]) el.style = {
    setProperty(key, value) { this[key] = value; }, removeProperty(key) { delete this[key]; },
  };
  sb.PedalTravel.setButtonProfile("gas", { press: "progressive", travel: 80 });
  sb.PedalTravel.setButtonProfile("brake", { slide: "ease", feedback: false });
  const point = mid("btn-throttle");
  gas.fire("pointerdown", point);
  assert.equal(btn().throttleVal, 0.12);
  assert.equal(gas.attrs["data-touch-feedback"], "on");
  // A setting edited mid-gesture applies to the next press.
  sb.PedalTravel.setButtonProfile("gas", { travel: 160 });
  gas.fire("pointermove", { clientX: point.clientX - 24, clientY: point.clientY - 32 });
  assert.equal(btn().throttleVal, 0.56);
  assert.equal(gas.style["--touch-level"], "0.56");
  gas.fire("pointermove", point);
  assert.equal(btn().throttleVal, 0.12);
  gas.setAttribute("data-grip-cue", "spin");
  gas.fire("pointermove", mid("btn-brake"));
  assert.deepEqual([btn().throttleVal, btn().brakeVal], [0, 0.12]);
  assert.equal(gas.attrs["data-grip-cue"], undefined);
  assert.equal(gas.style["--touch-level"], undefined);
  assert.equal(brake.attrs["data-touch-feedback"], undefined);
  win("pointercancel");
  assert.equal(btn().brakeVal, 0);
  brake.fire("pointerdown", mid("btn-brake"));
  assert.equal(btn().brakeVal, 1);
});

test("race and paired-phone button feedback illuminates the entire face without fading its label", () => {
  const race = cssRules(read("css/touch-controls.css"));
  const phone = cssRules(read("controller.html").split("<style>")[1].split("</style>")[0]);
  for (const [rules, selector, opacity] of [
    [race, '.touchbtn[data-touch-feedback="on"]::after', "var(--touch-level)"],
    [phone, ".pedal.on:not(.feedback-off)::after", "var(--travel, 1)"],
  ]) {
    assert.equal(decl(rules, selector, "inset"), "0");
    assert.equal(decl(rules, selector, "opacity"), opacity);
    assert.equal(decl(rules, selector, "z-index"), "-1");
    assert.equal(decl(rules, selector, "pointer-events"), "none");
    assert.doesNotMatch(decl(rules, selector, "background"), /gradient/);
  }
  assert.equal(decl(race, "#btn-throttle[aria-pressed][data-touch-feedback]::after", "display"), "none");
  const hud = cssRules(read("css/hud.css"));
  assert.equal(decl(hud, ':root[data-motion="reduce"] #hud .touchbtn[data-touch-feedback="on"]::after', "--hud-feedback-transition"), "0s");
});

test("Gas shows its live level without a resting mark, while progressive steering keeps its mark", () => {
  const { sb, left, gas, mid, win } = bootDock();
  gas.style = { setProperty(k, v) { this[k] = v; }, removeProperty(k) { delete this[k]; } };
  sb.PedalTravel.setButtonProfile("gas", { press: "progressive", travel: 40 });
  sb.PedalTravel.setButtonProfile("left", { press: "progressive" });
  assert.equal(gas.attrs["data-touch-response"], undefined);
  assert.equal(left.attrs["data-touch-response"], "progressive");
  gas.fire("pointerdown", mid("btn-throttle"));
  assert.equal(gas.attrs["data-touch-feedback"], "on");
  win("pointercancel");
  assert.equal(gas.attrs["data-touch-response"], undefined);
  sb.PedalTravel.setButtonProfile("left", { feedback: false });
  assert.equal(left.attrs["data-touch-response"], undefined);
  sb.PedalTravel.resetButtonProfile("left");
  assert.equal(left.attrs["data-touch-response"], undefined);
});

test("customized left and right travel reaches the wheel with adaptive steering disabled", () => {
  const { sb, Input, left, right, mid, lift, clock } = bootDock();
  Input.setSteerMode("buttons"); Input.setAdaptiveButtons(0); Input.setSteerExpo(1);
  const wheel = () => {
    let value;
    for (let i = 0; i < 100; i++) { clock.t += 16; value = Input.steer(); }
    return value;
  };
  sb.PedalTravel.setButtonProfile("left", { press: "progressive", travel: 80 });
  sb.PedalTravel.setButtonProfile("right", { travel: 40 });
  left.style = { setProperty(k, v) { this[k] = v; }, removeProperty(k) { delete this[k]; } };
  const point = mid("btn-steer-left");
  left.fire("pointerdown", point);
  assert.equal(Number(left.style["--touch-level"]), 0.12);
  assert.ok(Math.abs(wheel() + 0.12) < 0.0001);
  left.fire("pointermove", { ...point, clientY: point.clientY + 40 });
  assert.ok(Math.abs(wheel() + 0.56) < 0.0001);
  lift("btn-steer-left");
  const other = mid("btn-steer-right");
  right.fire("pointerdown", other);
  right.fire("pointermove", { ...other, clientX: other.clientX - 32 });
  assert.ok(Math.abs(wheel() - 0.5) < 0.0001);
  right.fire("pointermove", point);
  assert.ok(Math.abs(wheel() + 0.12) < 0.0001, "progressive arrow starts light at crossover");
  left.fire("pointermove", { ...point, clientY: point.clientY - 80 });
  assert.equal(wheel(), -1);
  left.fire("pointermove", other);
  assert.equal(wheel(), 1, "instant arrow takes full travel at crossover");
  Input.reset();
  assert.equal(wheel(), 0);
});

test("the shipped steering meter tracks the effective arrow command as Adaptive Buttons changes", () => {
  const { Input, left, mid, btn, clock } = bootDock();
  left.style = { setProperty(k, v) { this[k] = v; }, removeProperty(k) { delete this[k]; } };
  Input.setSteerMode("buttons"); Input.setSteerExpo(1);
  const point = mid("btn-steer-left");
  left.fire("pointerdown", point);
  left.fire("pointermove", { ...point, clientX: point.clientX + 48 });
  assert.ok(Math.abs(btn().leftVal - 0.6) < 0.0001, "raw finger travel is independent of assist");
  for (const [mix, expected] of [[0, 1], [0.5, 0.8], [1, 0.6]]) {
    Input.setAdaptiveButtons(mix);
    const displayed = Number(left.style["--touch-level"]);
    assert.ok(Math.abs(displayed - expected) < 0.0001);
    for (let i = 0; i < 100; i++) { clock.t += 16; Input.steer(); }
    assert.ok(Math.abs(Input.steer() + displayed) < 0.0001);
  }
});

test("each touch arrow uses its own speed sensitivity for building lock, with independent global fallback", () => {
  const { sb, Input, left, right, mid, lift } = bootDock();
  Input.setSteerMode("buttons"); Input.setSteerExpo(1); Input.setKeyRampIn(6);
  Input.setSteerSpeedRef(40); Input.setSpeedStd(40); Input.setAdaptiveButtons(0.5);
  const check = (actual, expected) => assert.ok(Math.abs(actual - expected) < 0.00001, actual + " should be " + expected);
  const px = mid("btn-steer-left"), rx = mid("btn-steer-right");
  sb.PedalTravel.setButtonProfile("left", { adaptive: 10 });
  sb.PedalTravel.setButtonProfile("right", { adaptive: 1 });
  left.fire("pointerdown", px);
  check(Input.steer(0.05), -0.15);  // 6/s halved at the reference speed
  check(Input.steer(0.05), -0.30);
  right.fire("pointerdown", { ...rx, pointerId: 2 });
  check(Input.steer(0.0125), -0.15); // direction change first unwinds at 12/s
  check(Input.steer(0.0625), 0.30);  // remaining 0.05 s builds right at full 6/s
  lift("btn-steer-right", 2); lift("btn-steer-left");
  check(Input.steer(0.05), 0);
  sb.PedalTravel.resetButtonProfile("right");
  right.fire("pointerdown", rx);
  check(Input.steer(0.05), 0.225);  // unpinned right follows the global 4.5/s
  Input.reset();
  Input.setSpeedStd(40);
  sb.PedalTravel.setButtonProfile("left", { press: "progressive", travel: 40 });
  left.fire("pointerdown", px);
  left.fire("pointermove", { ...px, clientY: px.clientY + 40 });
  for (let i = 0; i < 10; i++) Input.steer(0.05);
  left.fire("pointermove", px);
  check(Input.steer(0.05), -0.775); // easing a held arrow preserves the global return rate
  Input.reset(); sb.PedalTravel.setButtonProfile("left", { press: "instant" });
  Input.setSpeedStd(0);
  left.fire("pointerdown", px);
  check(Input.steer(0.05), -0.30); // no reduction at rest, even at strength 10
});
