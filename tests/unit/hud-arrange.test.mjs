/* hud-arrange.test.mjs — ARRANGE HUD (js/ui/hud-arrange.js), the on-screen
 * editor for MOVE & SIZE. Pure maths only: a drag becomes a share-of-screen
 * offset, a pinch a stepped size, overlapping rects a clash list.
 * Fail-before: without the module the pause card has no editor and the slider
 * fold is the only way to place a piece. Run: node --test tests/unit/hud-arrange.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = fs.readFileSync(path.join(ROOT, "js/ui/hud-arrange.js"), "utf8");

function load() {
  const ctx = { Log: { info() {}, warn() {}, debug() {}, enabled() { return false; } },
    M4: { clamp: (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v) } };   // the shared clamp the module aliases
  vm.createContext(ctx);
  vm.runInContext(SRC.replace(/^const\b/gm, "var"), ctx);
  return ctx.HudArrange;
}
// vm-realm objects fail deepStrictEqual on prototype identity: compare plain copies.
const plain = (v) => JSON.parse(JSON.stringify(v));

test("dragTo: screen px become a share of the screen, rounded to 0.1 and clamped at HudLayout's ±50", () => {
  const A = load();
  assert.deepEqual(plain(A.dragTo({ x: 0, y: 0 }, 84.4, -39, 844, 390)), { x: 10, y: -10 });
  assert.deepEqual(plain(A.dragTo({ x: 12, y: 3 }, 0, 0, 844, 390)), { x: 12, y: 3 }, "no movement keeps the offset");
  assert.deepEqual(plain(A.dragTo({ x: 45, y: -45 }, 844, -390, 844, 390)), { x: 50, y: -50 }, "clamped at the slider's range");
  assert.deepEqual(plain(A.dragTo(null, 8.44, 3.9, 844, 390)), { x: 1, y: 1 }, "a missing origin is the shipped 0 / 0");
  assert.deepEqual(plain(A.dragTo({ x: 0, y: 0 }, 10, 10, 0, 0)), { x: 50, y: 50 }, "a zero-size screen cannot divide by zero");
});

test("pinchTo: a pinch scales the size on 5 % steps between 50 and 200; a zero distance is ignored", () => {
  const A = load();
  assert.equal(A.pinchTo(100, 100, 150), 150);
  assert.equal(A.pinchTo(100, 100, 123), 125, "rounded to the slider's 5 % step");
  assert.equal(A.pinchTo(100, 100, 10), 50, "floored at 50");
  assert.equal(A.pinchTo(150, 100, 400), 200, "capped at 200");
  assert.equal(A.pinchTo(100, 0, 150), 100, "no first distance: unchanged");
  assert.equal(A.pinchTo(100, 100, 0), 100, "no second distance: unchanged");
});

test("stepSize: the toolbar's − / + move by STEP inside the range", () => {
  const A = load();
  assert.equal(A.stepSize(100, 1), 100 + A.STEP);
  assert.equal(A.stepSize(55, -1), 50);
  assert.equal(A.stepSize(200, 1), 200);
});

test("clashes: only pairs overlapping by more than the margin on BOTH axes; touching and empty rects are not clashes", () => {
  const A = load();
  const r = (id, l, t, w, h) => ({ id, l, t, r: l + w, b: t + h });
  const pairs = A.clashes([
    r("tower", 200, 8, 400, 50),
    r("map", 10, 8, 128, 128),
    r("gaps", 138, 8, 60, 20),         // touches the map's right edge exactly: not a clash
    r("damage", 560, 60, 100, 40),
    r("inputs", 570, 70, 100, 40),     // 90 x 30 over DAMAGE
    r("#btn-boost", 580, 90, 72, 72),  // 90 x 10 over DAMAGE (10 > 3), 90 x 20 over INPUTS
    r("flag", 300, 100, 0, 0),         // empty: skipped
    r("limits", 150, 140, 60, 20),     // 1 px into the map on y only (map bottom 136): not a clash
  ]);
  assert.deepEqual(plain(pairs), [["damage", "inputs"], ["damage", "#btn-boost"], ["inputs", "#btn-boost"]]);
  assert.deepEqual(plain(A.clashes([r("a", 0, 0, 10, 10), r("b", 8, 8, 10, 10)], 3)), [], "2 px of overlap is under the margin");
  assert.deepEqual(plain(A.clashes([r("a", 0, 0, 10, 10), r("b", 6, 6, 10, 10)], 3)), [["a", "b"]]);
  assert.equal(A.MIN_CLASH, 3);
});

test("create: inert without a document or HudLayout; the pure API is frozen", () => {
  const A = load();
  assert.equal(A.create({}), null, "no document, no editor");
  assert.ok(Object.isFrozen(A));
  assert.deepEqual(plain(A.LIM), { x: [-50, 50], y: [-50, 50], s: [50, 200] }, "the same range HudLayout.LIM clamps to");
});
