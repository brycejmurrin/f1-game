// control-judge.test.mjs — the pure verdict of tests/helpers/control-judge.mjs (#5242): each way a named control
// stops being tappable is its own fault code, and a healthy control passes. The browser half is
// tests/specs/named-controls.spec.js.
import { test } from "node:test";
import assert from "node:assert/strict";
import { judgeControl } from "../helpers/control-judge.mjs";

const INS = { top: 0, left: 59, bottom: 21, right: 59 };
const ok = { id: "pm-resume", exists: true, rendered: true, w: 242, h: 65, left: 82, top: 152, right: 324, bottom: 217, vw: 852, vh: 393, insets: INS, hit: true, hitBy: "#pm-resume" };
const at = (o) => ({ ...ok, ...o });
const codes = (p, rule) => judgeControl(p, rule).map((f) => f.code);

test("a rendered, sized, on-screen control that owns its centre passes", () => {
  assert.deepEqual(judgeControl(ok, { min: 44, safe: true }), []);
});

test("missing and hidden controls fail alone, before any geometry is read", () => {
  assert.deepEqual(codes(at({ exists: false })), ["missing"]);
  assert.deepEqual(codes(at({ rendered: false, w: 0, h: 0, hit: false })), ["hidden"]);
});

test("the short side is held to `min` (default 44); `max` pins a fixed-size control", () => {
  assert.deepEqual(codes(at({ h: 8 }), { min: 24 }), ["small"]);
  assert.deepEqual(codes(at({ h: 40 })), ["small"]);
  assert.deepEqual(codes(at({ h: 40 }), { min: 24 }), []);
  assert.deepEqual(codes(at({ w: 44, h: 44 }), { min: 44, max: 48 }), []);
  assert.deepEqual(codes(at({ w: 130, h: 130 }), { min: 44, max: 48 }), ["oversize"]);
});

test("a rect off the window fails; inside the window but under the notch fails only when `safe`", () => {
  assert.deepEqual(codes(at({ top: 740, bottom: 825 })), ["offscreen"]);
  const notch = at({ left: 10, right: 252 });
  assert.deepEqual(codes(notch), []);
  assert.deepEqual(codes(notch, { safe: true }), ["unsafe"]);
});

test("a covered control fails, and its message names the element that took the tap", () => {
  const bad = judgeControl(at({ hit: false, hitBy: "#pm-quit" }));
  assert.deepEqual(bad.map((f) => [f.id, f.code]), [["pm-resume", "covered"]]);
  assert.equal(bad[0].msg, "pm-resume: a tap at its centre lands on #pm-quit, not on the control");
});
