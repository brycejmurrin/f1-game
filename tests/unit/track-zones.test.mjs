// TrackZones (js/editor/zones.js): arc-fraction zones and per-node heights
// follow an edit of the control polygon. The screen calls this module; the
// functions moved out of designer.js unchanged. Pure VM, no DOM.
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { absSrc } from "../helpers/abs-src.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
function load() {
  const ctx = { console, Math, Object, Array, Map, Number };
  vm.createContext(ctx);
  for (const f of ["js/editor/shape.js", "js/editor/zones.js"]) {
    vm.runInContext(readFileSync(join(root, f), "utf8").replace(/^const\b/gm, "var"), ctx, { filename: absSrc(f) });
  }
  return { Z: ctx.TrackZones, S: ctx.TrackShape };
}

function square() {
  return [[0, 0], [100, 0], [100, 100], [0, 100]];
}

test("wrap01 and cumArc: closed polygon length, fraction folded into [0, 1)", () => {
  const { Z } = load();
  assert.equal(Z.wrap01(1.25), 0.25);
  assert.equal(Z.wrap01(-0.25), 0.75);
  assert.equal(Z.wrap01(1), 0);
  const c = Z.cumArc(square());
  assert.equal(c.join(","), "0,100,200,300,400");
});

test("withZones: REVERSE flips prop side and swaps a range; a full-lap width stays", () => {
  const { Z } = load();
  const d = {
    hwZones: [{ s0: 0.1, s1: 0.2, hw: 5 }, { s0: 0, s1: 1, hw: 6 }],
    bankZones: [{ frac: 0.25, angleDeg: 5, widthM: 40 }],
    props: [{ s: 0.25, side: 1, kind: "tree" }],
  };
  const next = Z.withZones(d, null, (f) => 1 - f, true);
  assert.equal(next.bankZones[0].frac, 0.75);
  assert.equal(next.bankZones[0].angleDeg, 5);
  assert.equal(next.hwZones[0].hw, 5);
  assert.ok(Math.abs(next.hwZones[0].s0 - 0.8) < 1e-12);
  assert.ok(Math.abs(next.hwZones[0].s1 - 0.9) < 1e-12);
  assert.equal(next.hwZones[1].s0, 0);
  assert.equal(next.hwZones[1].s1, 1);
  assert.equal(next.hwZones[1].hw, 6);
  assert.equal(next.props[0].s, 0.75);
  assert.equal(next.props[0].side, -1);
});

test("withZones: a dropped prop list is absent, the same way a default look is", () => {
  const { Z } = load();
  const next = Z.withZones({ props: [{ s: 0.2, side: 1 }] }, null, () => null, false);
  assert.equal(Object.hasOwn(next, "props"), false);
});

test("remapZones: an unchanged loop is the same design; a rotated start shifts fractions", () => {
  const { Z, S } = load();
  const pts = square();
  const d = { pts, bankZones: [{ frac: 0.25, angleDeg: 4, widthM: 30 }], heights: [0, 10, 0, 0] };
  assert.equal(Z.remapZones(d, pts, pts.slice()), d);
  const turned = S.rotate(pts, 1);
  const next = Z.remapZones(d, pts, turned, false);
  assert.equal(next.bankZones[0].frac, 0);
  assert.deepEqual(next.heights, [10, 0, 0, 0]);
});

test("remapHeights: a new point blends the heights either side; a brand-new start keeps zone fractions", () => {
  const { Z } = load();
  const oldPts = [[0, 0], [100, 0], [100, 100]];
  const d = { heights: [0, 10, 0], bankZones: [{ frac: 0.2, angleDeg: 3, widthM: 20 }] };
  const inserted = [[0, 0], [50, 0], [100, 0], [100, 100]];
  const moved = Z.remapZones(d, oldPts, inserted, false);
  assert.equal(moved.heights[1], 5);
  assert.equal(moved.heights[0], 0);
  assert.equal(moved.heights[2], 10);
  const fresh = [[5, 5], [100, 0], [100, 100]];
  const held = Z.remapZones(d, oldPts, fresh, false);
  assert.equal(held.bankZones, d.bankZones);
  assert.ok(Array.isArray(held.heights) && held.heights.length === 3);
});
