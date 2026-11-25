// pad-menu-takeover-gap.test.mjs — controller menu navigation across a snapshot gap (#6269), a second pad's
// takeover press (#6255) and a same-origin lesson frame such as Learn › Chassis X-Ray (#6275).
// The production Input + InputPadMenu modules run in the key-binds VM rig (tests/helpers/key-binds-rig.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { menuRig, rawPad, setBtn, read } from "../helpers/key-binds-rig.mjs";

function ringRig() {
  const h = menuRig();
  const root = h.sb.document.documentElement = { dataset: {} };
  let now = 0;
  h.sb.performance.now = () => now;
  h.tick = (ms = 16) => { now += ms; h.Input.poll(); };
  return { h, root };
}

test("#6269 a 16 ms empty Gamepad snapshot keeps the focus ring; grace expiry still clears it", () => {
  const { h, root } = ringRig();
  const pad = rawPad();
  let present = true;
  h.sb.navigator.getGamepads = () => (present ? [pad] : []);
  h.fire("gamepadconnected", { gamepad: pad });
  h.tick();
  setBtn(pad, 13, true); h.tick();
  setBtn(pad, 13, false); h.tick();
  assert.equal(root.dataset.gamepadNav, "on", "D-pad input shows the ring");
  present = false; h.tick();
  assert.equal(root.dataset.gamepadNav, "on", "one missing snapshot is not a lost controller");
  present = true; h.tick(); h.tick();
  assert.equal(root.dataset.gamepadNav, "on", "the idle controller recovers with the ring still on");
  const arrows = h.dispatched.filter((e) => e.key === "ArrowDown").length;
  setBtn(pad, 13, true); h.tick();
  assert.equal(h.dispatched.filter((e) => e.key === "ArrowDown").length, arrows + 1, "a fresh direction after the gap moves at once");
  setBtn(pad, 13, false); h.tick();
  present = false;
  for (let i = 0; i < 20; i++) h.tick();
  assert.equal(root.dataset.gamepadNav, undefined, "past the 250 ms grace the controller is gone and so is its ring");
});

test("#6269 a direction held across the gap is released, not repeated", () => {
  const { h } = ringRig();
  const pad = rawPad();
  let present = true;
  h.sb.navigator.getGamepads = () => (present ? [pad] : []);
  h.fire("gamepadconnected", { gamepad: pad });
  h.tick();
  setBtn(pad, 13, true); h.tick();
  const n = () => h.dispatched.filter((e) => e.key === "ArrowDown").length;
  assert.equal(n(), 1);
  present = false; h.tick();
  present = true; h.tick(100);
  assert.equal(n(), 2, "the held direction restarts as a fresh one after the gap, never on the old repeat clock");
});

test("#6255 a second controller's first Cross press activates the focused control", () => {
  const { h } = ringRig();
  const a = rawPad(), b = rawPad({ id: "DualSense Wireless Controller", index: 1 });
  h.sb.navigator.getGamepads = () => [a, b];
  h.fire("gamepadconnected", { gamepad: a });
  h.fire("gamepadconnected", { gamepad: b });
  h.tick();
  setBtn(a, 13, true); h.tick();
  setBtn(a, 13, false); h.tick();
  assert.equal(h.clicks, 0);
  setBtn(b, 0, true); h.tick();
  assert.equal(h.clicks, 1, "the takeover press is the fresh press it looks like");
  h.tick();
  assert.equal(h.clicks, 1, "held, it clicks once");
  setBtn(b, 0, false); h.tick();
  setBtn(b, 0, true); h.tick();
  assert.equal(h.clicks, 2);
});

test("#6255 a button already held on the other pad still needs a release after takeover", () => {
  const { h } = ringRig();
  const a = rawPad(), b = rawPad({ id: "DualSense Wireless Controller", index: 1 });
  h.sb.navigator.getGamepads = () => [a, b];
  h.fire("gamepadconnected", { gamepad: a });
  h.fire("gamepadconnected", { gamepad: b });
  h.tick();
  setBtn(a, 13, true); h.tick();
  setBtn(a, 13, false); h.tick();
  setBtn(b, 0, true); h.tick();   // takeover with Cross
  const clicks = h.clicks;
  setBtn(a, 0, true); h.tick();   // A takes back while B still holds Cross
  assert.equal(h.clicks, clicks + 1, "A's own fresh press clicks");
  setBtn(a, 0, false); h.tick();
  setBtn(b, 13, true); h.tick();  // B takes over with the D-pad while Cross is STILL held
  assert.equal(h.clicks, clicks + 1, "a held Cross on the new pad is not a fresh press");
  setBtn(b, 0, true); h.tick();  // still held, never released
  assert.equal(h.clicks, clicks + 1);
});

test("#6255 a pad first seen with Cross held never clicks until released", () => {
  const { h } = ringRig();
  const a = rawPad(), b = rawPad({ id: "DualSense Wireless Controller", index: 1 });
  let both = false;
  h.sb.navigator.getGamepads = () => (both ? [a, b] : [a]);
  h.fire("gamepadconnected", { gamepad: a });
  h.tick();
  setBtn(a, 13, true); h.tick();
  setBtn(a, 13, false); h.tick();
  setBtn(b, 0, true); both = true;
  h.fire("gamepadconnected", { gamepad: b });
  h.tick(); h.tick();
  assert.equal(h.clicks, 0, "a pad that arrives held is not a press");
});

// A same-origin lesson frame inside the active layer: the Learn dialog's iframe#learn-lab.
function frameRig() {
  const { h, root } = ringRig();
  const inner = { activeElement: null, documentElement: { dataset: {} }, listeners: {} };
  inner.addEventListener = (t, f) => { (inner.listeners[t] ||= []).push(f); };
  inner.removeEventListener = (t, f) => { inner.listeners[t] = (inner.listeners[t] || []).filter((g) => g !== f); };
  inner.defaultView = h.sb;
  const ctl = (tagName, extra = {}) => Object.assign({
    tagName, disabled: false, clicks: 0, events: [], ownerDocument: inner,
    getClientRects: () => [1], closest: () => null, getAttribute: () => null,
    focus() { inner.activeElement = this; }, scrollIntoView() {},
    click() { this.clicks++; },
    dispatchEvent(e) { this.events.push(e.type); return true; },
  }, extra);
  const opts = [{ disabled: false }, { disabled: false }, { disabled: false }];
  const controls = [
    ctl("BUTTON", { id: "expand" }),
    ctl("SELECT", { id: "input-layer", options: opts, selectedIndex: 0 }),
    ctl("INPUT", { id: "input-floor", type: "range", min: "0", max: "40", step: "1", value: "10" }),
    ctl("BUTTON", { id: "check" }),
    ctl("BUTTON", { id: "collapsed", getClientRects: () => [] }),
  ];
  inner.querySelectorAll = () => controls;
  inner.body = {};
  const frame = { tagName: "IFRAME", contentDocument: inner, focus() { h.sb.document.activeElement = frame; } };
  const back = { tagName: "BUTTON", id: "learn-close", disabled: false, matches: () => true, click() { h.clicks++; } };
  const layer = { id: "learn", tagName: "DIV", contains: () => true,
    querySelector: (sel) => (/iframe\[data-pad-scope\]/.test(sel) ? frame : null) };
  h.sb.MenuNav.activeLayer = () => layer;
  h.sb.UiLayers.top = () => layer;
  h.sb.document.activeElement = back;   // the outer Back button, where the seed/arrow used to land
  const pad = rawPad();
  h.sb.navigator.getGamepads = () => [pad];
  h.fire("gamepadconnected", { gamepad: pad });
  h.tick();
  const press = (i) => { setBtn(pad, i, true); h.tick(); setBtn(pad, i, false); h.tick(); };
  return { h, root, inner, controls, frame, back, press, pad };
}

test("#6275 D-pad and Cross walk the lesson frame's own controls, not the parent's Back", () => {
  const { h, root, inner, controls, press } = frameRig();
  const outer = h.dispatched.length;
  press(13);
  assert.equal(inner.activeElement, controls[0], "D-pad Down enters the lesson");
  assert.equal(inner.documentElement.dataset.gamepadNav, "on", "the ring shows inside the lesson");
  assert.equal(root.dataset.gamepadNav, "on");
  press(13);
  assert.equal(inner.activeElement, controls[1]);
  press(15);
  assert.equal(controls[1].selectedIndex, 1, "Right steps the focused select's value");
  assert.deepEqual(controls[1].events, ["input", "change"]);
  press(13);
  assert.equal(inner.activeElement, controls[2]);
  press(15);
  assert.equal(controls[2].value, "11", "Right steps the focused slider");
  press(13); press(13);
  assert.equal(inner.activeElement, controls[3], "the last visible control; a collapsed one is skipped");
  press(0);
  assert.equal(controls[3].clicks, 1, "Cross clicks the lesson's focused control");
  assert.equal(h.clicks, 0, "and never the parent's Back");
  press(12);
  assert.equal(inner.activeElement, controls[2], "Up walks back");
  assert.equal(h.dispatched.length, outer, "no arrow reached the parent page");
});

test("#6275 a control touched inside the lesson takes the next D-pad press", () => {
  const { h, inner, controls, press } = frameRig();
  inner.activeElement = controls[1];   // the Drawing layer select, touched
  press(15);
  assert.equal(controls[1].selectedIndex, 1);
  assert.equal(h.clicks, 0);
});

test("#6275 a touch inside the lesson clears the ring there and in the parent", () => {
  const { root, inner, press } = frameRig();
  press(13);
  (inner.listeners.pointerdown || []).forEach((f) => f({ isTrusted: true }));
  assert.equal(inner.documentElement.dataset.gamepadNav, undefined);
  assert.equal(root.dataset.gamepadNav, undefined);
});

test("#6275 the paired phone's arrows and SELECT use the lesson route too", () => {
  const { h, inner, controls } = frameRig();
  const r = vm.runInContext("InputPadMenu", h.sb).create({ btnDown: () => false, btnEdge: () => false, nowMs: () => 0, getPadAxisMap: () => ({}) });
  r.remoteNav("down");
  assert.equal(inner.activeElement, controls[0]);
  r.remoteNav("down");
  r.activate((el) => el.id === "never");
  assert.equal(controls[1].clicks, 1);
  assert.equal(h.clicks, 0);
});

test("#6275 Learn marks its lesson frame as a pad scope", () => {
  assert.match(read("js/ui/learn-door.js"), /frame\.dataset\.padScope = /);
  assert.match(read("learn/sandbox.css"), /:root\[data-gamepad-nav="on"\] :focus/);
});
