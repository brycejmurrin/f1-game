// over-road-scan.test.mjs — the over-road triangle scan (tools/lib/over-road-scan.cjs) that
// tests/specs/terrain-over-road.spec.js runs in the page.
//
// #1942: the alias guard compared a triangle's height with i±3 reference heights without
//   requiring those neighbours to lie under the triangle, so on a grade a neighbour 12 m
//   away erased a real 0.5 m intrusion.
// #1944: the spec's verdict exempted every crossover-circuit road intrusion >= 1.5 m, so
//   the same same-deck defect failed at 1 m and passed at 1.6 m and 3 m.
//
// Run: node --test tests/unit/over-road-scan.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const { scanOverRoad, roadFails } = createRequire(import.meta.url)("../../tools/lib/over-road-scan.cjs");
const TOL = 0.18;

// A horizontal 2 m square at height y centred on the origin (two triangles).
const slab = (y) => ({
  pos: [-1, y, -1, 1, y, -1, 1, y, 1, -1, y, 1],
  idx: [0, 1, 2, 0, 2, 3],
});

// A straight reference line along +x: M samples `step` m apart, rising by `grade` per m,
// the sample at index M/2 sitting at the origin.
function line({ M = 60, step = 4, grade = 0, frac = (i) => i / M } = {}) {
  const px = new Float64Array(M), pz = new Float64Array(M), tps = [];
  for (let i = 0; i < M; i++) {
    const x = (i - M / 2) * step;
    px[i] = x; pz[i] = 0;
    tps.push({ x, z: 0, y: grade * x, frac: frac(i), i, si: 0 });
  }
  return { px, pz, tps, M };
}
const scan = (cap, l, extra = {}) => scanOverRoad(cap, { name: "terrain", tps: l.tps, px: l.px, pz: l.pz, M: l.M,
  ladder: 1, trackNodeCount: 100, knownCrossover: false, ...extra });

test("a 0.5 m intrusion reads the same over a flat road and a 5 % grade (#1942)", () => {
  assert.equal(scan(slab(0.5), line()).max, 0.5);
  const grade = scan(slab(0.5), line({ grade: 0.05 }));
  assert.equal(grade.max, 0.5, "the neighbour at 12 m is outside the triangle, so it cannot clear it");
});

test("a smooth climb aliased into a triangle's footprint is still cleared (#1942)", () => {
  // One wide triangle over the line; 0.5 m spacing, 0.02 m rise per sample. The triangle sits
  // ~0.05 m above the reference line's mean but 0.13 m above its lowest covered sample, and every
  // neighbour under it within ±3 samples is higher: the helix-alias shape.
  const wide = (y) => ({ pos: [-3, y, -1, 3, y, -1, 0, y, 3], idx: [0, 1, 2] });
  const l = line({ step: 0.5, grade: 0.04 });
  assert.equal(scan(wide(0.05), l).max, 0);
  // Lifted well clear of every neighbour it is a real intrusion.
  assert.ok(scan(wide(0.6), l).max > 0.4);
});

test("a neighbour must lie under the triangle to count, whatever its height (#1942)", () => {
  // High neighbours everywhere except under the slab: nothing under it can clear it.
  const l = line();
  l.tps.forEach((t) => { if (Math.abs(t.x) > 1.5) t.y = 5; });
  assert.equal(scan(slab(0.5), l).max, 0.5);
});

test("crossover verdict is monotonic: the same same-deck intrusion fails at 1, 1.6 and 3 m (#1944)", () => {
  const l = line({ frac: () => 0 }); // every sample on the mesh's own deck
  for (const lift of [1, 1.6, 3]) {
    const r = scan(slab(lift), l, { name: "road", knownCrossover: true });
    assert.equal(r.max, lift, `lift ${lift}`);
    assert.equal(roadFails(r.max, TOL), true, `a ${lift} m same-deck intrusion must fail`);
  }
  assert.equal(roadFails(0.1, TOL), false);
});

test("another deck of a crossover is skipped by provenance, not by magnitude (#1944)", () => {
  // Reference samples at frac 0.5 under a triangle whose mesh source frac is 0 (the other deck).
  const l = line({ frac: () => 0.5 });
  assert.equal(scan(slab(3), l, { name: "road", knownCrossover: true }).max, 0);
  // On a circuit with no crossover the same geometry is a real defect.
  assert.equal(scan(slab(3), l, { name: "road", knownCrossover: false }).max, 3);
});
