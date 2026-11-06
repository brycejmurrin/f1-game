// coplanar-audit must not drop dense buckets (>500 faces) or miss a pair whose
// normals round into different 0.01 bins (#4677, parent #2501).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const CA = createRequire(import.meta.url)("../../tools/track/coplanar-audit.cjs");
const OPT = { gap: 0.02, area: 2, fight: 1e9, maxDim: 1e9, horizontal: false, flat: false, overhead: false };
// Road nodes every 100 m along z so the whole 600-wall row is within NEAR_TRACK.
const TRACK = { n: 40, px: Array(40).fill(0), pz: Array.from({ length: 40 }, (_, i) => i * 100 - 2000),
                hw: Array(40).fill(10), py: Array(40).fill(0) };

// One primitive = one quad in the plane through x0 with normal n, spanning
// z in [z0, z0+4], y in [0, 4] (a 4x4 wall, 16 m2).
function wall(x0, z0, n = [1, 0, 0]) {
  const pos = [], nrm = [];
  for (const [y, z] of [[0, 0], [4, 0], [4, 4], [0, 4]]) {
    pos.push(x0 - n[1] / n[0] * y, y, z0 + z);   // vertices lie IN the (tilted) plane
    nrm.push(...n);
  }
  return { buf: { pos, nrm }, s: 0, e: 12, minX: x0, maxX: x0, minY: 0, maxY: 4, minZ: z0, maxZ: z0 + 4 };
}
const run = (prims, o = {}) => CA.analyse(TRACK, prims, { ...OPT, ...o });

test("501 identical primitives are all compared, not skipped", () => {
  const prims = Array.from({ length: 501 }, () => wall(0, 0));
  const r = run(prims);
  assert.ok(r.pairs > 0, "dense bucket reported zero pairs");
  assert.equal(r.pairs, 501 * 500 / 2);
});

test("2 identical primitives give 1 pair (control)", () => {
  assert.equal(run([wall(0, 0), wall(0, 0)]).pairs, 1);
});

test("a dense bucket still finds a real overlap among far-apart walls", () => {
  const prims = Array.from({ length: 600 }, (_, i) => wall(0, i * 5 - 1500));
  prims.push(wall(0, -1500));   // overlaps prim 0 only
  assert.equal(run(prims).pairs, 1);
});

test("normals straddling a 0.01 bin edge still pair", () => {
  const mk = (nx) => { const l = Math.hypot(nx, 1); return [1 / l, nx / l, 0]; };
  // ny = 0.0049/0.0051 rad-ish: rounds to 0.00 vs 0.01 yet dot ~ 1
  const a = wall(0, 0, mk(0.0049)), b = wall(0, 0, mk(0.0051));
  assert.equal(run([a, b]).pairs, 0, "default gate: bins stay as before");
  assert.equal(run([a, b], { adjacentBins: true }).pairs, 1);
});
