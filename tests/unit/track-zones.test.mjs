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

// Hunt #5743 D1: tapping the road to INSERT a point used to map every point
// zone on the split segment to null — bridges, elevations, banks and props gone.
test("remapZones: an insert mid-segment keeps every point zone on that segment, in place", () => {
  const { Z } = load();
  const old = [[0, 0], [400, 0], [400, 400], [0, 400]];            // 1600 m square
  const neu = [[0, 0], [200, 0], [400, 0], [400, 400], [0, 400]];  // insert at (200, 0)
  const d = {
    bridges: [{ s: 0.0625 }], elevations: [{ s: 0.1, h: 4 }],
    props: [{ s: 0.05, side: 1, kind: "tree" }], bankZones: [{ frac: 0.11, angleDeg: 5, widthM: 40 }],
    hwZones: [{ s0: 0.02, s1: 0.2, hw: 6 }],
  };
  const r = Z.remapZones(d, old, neu);
  // The new point is ON the old segment, so the arc is unchanged: s stays exact.
  assert.equal(r.bridges.length, 1); assert.ok(Math.abs(r.bridges[0].s - 0.0625) < 1e-12);
  assert.equal(r.elevations.length, 1); assert.ok(Math.abs(r.elevations[0].s - 0.1) < 1e-12);
  assert.equal(r.elevations[0].h, 4);
  assert.equal(r.props.length, 1); assert.ok(Math.abs(r.props[0].s - 0.05) < 1e-12);
  assert.equal(r.bankZones.length, 1); assert.ok(Math.abs(r.bankZones[0].frac - 0.11) < 1e-12);
  assert.ok(Math.abs(r.hwZones[0].s0 - 0.02) < 1e-12 && Math.abs(r.hwZones[0].s1 - 0.2) < 1e-12);
});

test("remapZones: an off-line insert splits by the point's foot; the closing segment too", () => {
  const { Z } = load();
  const old = [[0, 0], [400, 0], [400, 400], [0, 400]];
  // (100, 300): foot at t = 0.25 of 0→1. New lap: 316.23 + 360.56 + 400 + 400 + 400.
  const neu = [[0, 0], [100, 300], [400, 0], [400, 400], [0, 400]];
  const r = Z.remapZones({ bridges: [{ s: 0.03125 }, { s: 0.125 }] }, old, neu);   // t = 0.125 and 0.5
  const a = Math.hypot(100, 300), b = Math.hypot(300, 300), L = a + b + 1200;
  assert.ok(Math.abs(r.bridges[0].s - (0.5 * a) / L) < 1e-9, String(r.bridges[0].s));
  assert.ok(Math.abs(r.bridges[1].s - (a + b / 3) / L) < 1e-9, String(r.bridges[1].s));
  // Closing segment (0,400)→(0,0): an insert appended at the end of the list.
  const c = Z.remapZones({ props: [{ s: 0.9, side: 1 }] }, old, old.concat([[0, 200]]));
  assert.equal(c.props.length, 1);
  assert.ok(Math.abs(c.props[0].s - 0.9) < 1e-12);
  // A delete still drops what sat on the removed stretch.
  const del = Z.remapZones({ bridges: [{ s: 0.3 }] }, old, [[0, 0], [400, 0], [0, 400]]);
  assert.equal(del.bridges.length, 0);
});
