// scenery-ground-at.test.mjs — groundAt(), the scenery api's foot query (#7333).
//
// groundAt(x, z, { size, basis, pick, fallback }) samples the rendered ribbon
// once (default) or on foundation's 3x3 footprint, reduces by lo / hi / mid and
// returns `fallback` when every sample is off the ribbon, counting the miss on
// modelDiagnostics.groundFallback. The probe replaces Tracks.terrainY for the
// span of one scenery callback, so the query reads a known sloped plane.
//
// Run: node --test tests/unit/scenery-ground-at.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { buildContext } = require("../../tools/track/verify-track.cjs");

// Build one plain circuit with a probe scenery callback; `fn(api)` runs with
// Tracks.terrainY swapped for `terrain(x, z)`.
function probe(terrain, fn) {
  const Tracks = buildContext();
  const def = Tracks.LIST.find((d) => !d.reverse && d.sceneryCoordinates !== "source");
  let result, diag;
  def.scenery = (api) => {
    const real = Tracks.terrainY;
    Tracks.terrainY = (_track, x, z) => terrain(x, z);
    try { result = fn(api); } finally { Tracks.terrainY = real; }
    diag = api.modelDiagnostics;
  };
  Tracks.build(def);
  assert.ok(diag, "scenery probe was not invoked");
  return { result, diag };
}

const CX = 100, CZ = -40;
const slope = (x) => 0.1 * (x - CX) + 5;   // +0.1 m per metre along +x, 5 m at the centre

test("one sample by default: the height at (x, z)", () => {
  const { result, diag } = probe(slope, (api) => api.groundAt(CX + 3, CZ));
  assert.equal(result, slope(CX + 3));
  assert.equal(diag.groundFallback, 0);
});

test("footprint lo / hi / mid on a slope", () => {
  const { result } = probe(slope, (api) => {
    const fp = { size: [10, 4], basis: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] };
    return {
      lo: api.groundAt(CX, CZ, { ...fp, pick: "lo" }),
      hi: api.groundAt(CX, CZ, { ...fp, pick: "hi" }),
      mid: api.groundAt(CX, CZ, fp),
    };
  });
  assert.equal(result.lo, slope(CX - 5));
  assert.equal(result.hi, slope(CX + 5));
  assert.equal(result.mid, slope(CX));
});

test("the basis turns the footprint: a 90° basis samples along z, not x", () => {
  const { result } = probe(slope, (api) =>
    api.groundAt(CX, CZ, { size: [10, 4], basis: [[0, 0, 1], [0, 1, 0], [-1, 0, 0]], pick: "hi" }));
  assert.equal(result, slope(CX + 2));   // depth 4 now runs along x
});

test("mid falls back to the mean of finite samples when the centre is off the ribbon", () => {
  const holed = (x, z) => (x === CX && z === CZ ? null : slope(x));
  const { result, diag } = probe(holed, (api) => api.groundAt(CX, CZ, { size: [10, 4] }));
  assert.ok(Math.abs(result - slope(CX)) < 1e-9, `mean of a symmetric ring is the centre, got ${result}`);
  assert.equal(diag.groundFallback, 0);
});

test("all samples off the ribbon: fallback returned, one miss counted per call", () => {
  const { result, diag } = probe(() => null, (api) => [
    api.groundAt(CX, CZ, { fallback: 7.5 }),
    api.groundAt(CX, CZ, { size: [10, 4], pick: "lo", fallback: -2 }),
    api.groundAt(CX, CZ),
  ]);
  assert.deepEqual(result, [7.5, -2, null]);
  assert.equal(diag.groundFallback, 3);
});

test("non-finite samples count as off the ribbon", () => {
  const { result, diag } = probe(() => NaN, (api) => api.groundAt(CX, CZ, { fallback: 1 }));
  assert.equal(result, 1);
  assert.equal(diag.groundFallback, 1);
});

test("foundation shares the sampler: off the ribbon it refuses without counting", () => {
  // Byte-identical foundation output on real circuits is graph-parity's job
  // (imola, #7333); here: all-null ground and no spec.ground = no box, no miss.
  const { result, diag } = probe(() => null, (api) =>
    api.foundation([], { center: [CX, 0, CZ], size: [10, 4], top: 9 }));
  assert.equal(result, false);
  assert.equal(diag.groundFallback, 0);
});
