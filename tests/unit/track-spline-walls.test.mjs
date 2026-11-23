/* track-spline-walls.test.mjs — TrackSpline.wallAt + postLimits (track-core hunt).
 * wallAt/postLimits are hot driving-boundary helpers with no exclusive unit pin;
 * collide / wall-clamp harnesses mock Tracks.*. Synthetic polyline, no browser.
 * Run: node --test tests/unit/track-spline-walls.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { absSrc } from "../helpers/abs-src.mjs";

function loadSpline() {
  const ctx = vm.createContext({
    Math,
    M4: { lerp: (a, b, t) => a + (b - a) * t },
    Log: { info() {}, warn() {}, error() {}, enabled: () => false },
  });
  const src = absSrc("js/track/core/spline.js");
  vm.runInContext(fs.readFileSync(src, "utf8") + "\nglobalThis.TrackSpline = TrackSpline;", ctx, {
    filename: absSrc("js/track/core/spline.js"),
  });
  return ctx.TrackSpline;
}

function baseTrack(over = {}) {
  return {
    n: 4,
    total: 400,
    hw: [5, 5, 5, 5],
    def: { street: false },
    ...over,
  };
}

test("wallAt falls back to hw (+ runoff) when bar arrays are absent", () => {
  const S = loadSpline();
  const t = baseTrack();
  assert.equal(S.wallAt(t, 0, 1), 14, "non-street: hw + 9");
  t.def.street = true;
  assert.equal(S.wallAt(t, 0, -1), 4.2, "street: hw - 0.8");
});

test("wallAt returns the tighter of the two bracketing nodes", () => {
  const S = loadSpline();
  const t = baseTrack({
    barR: new Float32Array([10, 8, 12, 9]),
    barL: new Float32Array([10, 8, 12, 9]),
  });
  assert.equal(S.wallAt(t, 50, 1), 8, "mid-seg 0→1 uses min(10, 8)");
  assert.equal(S.wallAt(t, 200, 1), 9, "node 2 uses min(12, 9)");
  assert.equal(S.wallAt(t, -50, 1), 9, "negative s wraps");
  assert.equal(S.wallAt(t, 400, 1), 8, "s === total wraps to node 0");
});

test("postLimits pulls the road-side wall in and keeps an outside car out", () => {
  const S = loadSpline();
  const t = baseTrack({
    posts: [{ s: 100, halfS: 5, side: 1, lat: 6, halfX: 0.3 }],
  });
  const out = { r: 0, l: 0, minOut: 0, side: 0 };
  S.postLimits(t, 100, 3, out);
  assert.ok(out.r < 6, "inside the post: right wall brought in to inner face − clear");
  assert.equal(out.minOut, 0, "inside: no outer keep");
  S.postLimits(t, 100, 8, out);
  assert.equal(out.side, 1, "outside: side of the post");
  assert.ok(out.minOut > 6, "outside: min |x| past the outer face + clear");
  S.postLimits(t, 200, 3, out);
  assert.equal(out.minOut, 0, "far from the post: no limit");
  assert.equal(out.r, Infinity);
});
