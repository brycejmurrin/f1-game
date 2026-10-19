// terrain-y.test.mjs — Tracks.terrainY keeps real gaps and covers whole grid edges.
//
// Two defects (#1940): _triY accepted a barycentric slack of 1 %, which scales with
// the triangle (two 100 m rects 1 m apart read as one surface across the gap), and
// terrainGrid's ceil(width/24) cell count floored an exact maximum edge one cell
// past the grid (a covered [0,24]x[0,24] quad answered null at x=24 or z=24).
// Synthetic meshes drive the real sampler, so no circuit build is needed.
//
// Run: node --test tests/unit/terrain-y.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { buildContext } = require("../../tools/lib/track-build-vm.cjs");
const T = buildContext().Tracks;

const quad = (x0, x1, z0, z1, y = 0) => ({ pos: [x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1], idx: [0, 1, 2, 0, 2, 3] });
const merge = (a, b) => ({ pos: [...a.pos, ...b.pos], idx: [...a.idx, ...b.idx.map((i) => i + a.pos.length / 3)] });
const at = (geo, x, z) => T.terrainY({ terrainGeo: geo }, x, z);

test("a 1 m gap between two 100 m rectangles is not terrain", () => {
  const geo = merge(quad(0, 100, 0, 100), quad(101, 201, 0, 100));
  for (const x of [100.25, 100.5, 100.75]) assert.equal(at(geo, x, 50), null, `x=${x}`);
  assert.equal(at(geo, 99.5, 50), 0);
  assert.equal(at(geo, 101.5, 50), 0);
});

test("the gap stays a gap at other scales", () => {
  for (const k of [0.1, 1, 10, 1000]) {
    const geo = merge(quad(0, 10 * k, 0, 10 * k), quad(10 * k + 1, 20 * k + 1, 0, 10 * k));
    assert.equal(at(geo, 10 * k + 0.5, 5 * k), null, `scale ${k}`);
  }
});

test("a shared edge stays covered", () => {
  const geo = merge(quad(0, 100, 0, 100, 3), quad(100, 200, 0, 100, 3));
  for (const x of [99.996, 100, 100.004, 50]) assert.equal(at(geo, x, 50), 3, `x=${x}`);
});

// TRI_EPS (tracks.js) decides these: the quads do NOT touch, so a probe in the
// sliver between them is covered only by the 1 cm slack. TRI_EPS = 0 answers null
// on the first loop; an over-wide slack answers 3 on the second.
test("a float-sized crack (5 mm) is covered, a 5 cm gap is not", () => {
  const crack = merge(quad(0, 100, 0, 100, 3), quad(100.005, 200, 0, 100, 3));
  for (const x of [100.001, 100.0025, 100.004]) assert.equal(at(crack, x, 50), 3, `crack x=${x}`);
  const gap = merge(quad(0, 100, 0, 100, 3), quad(100.05, 200, 0, 100, 3));
  assert.equal(at(gap, 100.025, 50), null, "5 cm gap is real");
});

test("exact maximum grid edges are covered; just beyond is not", () => {
  const geo = quad(0, 24, 0, 24, 7);
  for (const [x, z] of [[23.999, 12], [0, 12], [24, 12], [12, 24], [24, 24], [0, 0]]) assert.equal(at(geo, x, z), 7, `${x},${z}`);
  for (const [x, z] of [[24.5, 12], [12, 24.5], [-0.5, 12], [12, -0.5]]) assert.equal(at(geo, x, z), null, `${x},${z}`);
});

test("negative coordinates and non-cell-aligned extents", () => {
  const geo = quad(-50, 13.7, -30.2, 41, 2);
  for (const [x, z] of [[-50, -30.2], [13.7, 41], [13.7, 0], [-20, 41], [0, 0]]) assert.equal(at(geo, x, z), 2, `${x},${z}`);
  for (const [x, z] of [[13.8, 0], [0, 41.1], [-50.1, 0]]) assert.equal(at(geo, x, z), null, `${x},${z}`);
  const cells = quad(0, 48, 0, 48, 1);
  assert.equal(at(cells, 48, 48), 1);
  assert.equal(at(cells, 24, 24), 1);
});

test("a point inside a sloped triangle interpolates height", () => {
  const geo = { pos: [0, 0, 0, 10, 10, 0, 0, 0, 10], idx: [0, 1, 2] };
  assert.ok(Math.abs(at(geo, 5, 0) - 5) < 1e-9);
  assert.equal(at(geo, 9, 9), null);
});

// propTop/instTop (tracks.js) skip terrainY wherever y - lo[cell] cannot beat the
// best so far, so lo must sit under EVERY height terrainY returns in that cell —
// including the up-to-TRI_EPS extrapolation past a steep triangle's edge.
test("terrainGrid's per-cell floor lies under every terrainY answer", () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const N = 12, S = 9, pos = [], idx = [];
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) pos.push(i * S + (rnd() - 0.5) * 6, (rnd() - 0.5) * 80, j * S + (rnd() - 0.5) * 6);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const a = j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1;
    idx.push(a, b, d, a, d, c);
  }
  const track = { terrainGeo: { pos, idx } };
  let probes = 0;
  for (let n = 0; n < 20000; n++) {
    // Half the probes on a triangle edge pushed 0-1.2 cm outward, where the slack extrapolates.
    let x = rnd() * N * S, z = rnd() * N * S;
    if (n & 1) {
      const t = 3 * Math.floor(rnd() * idx.length / 3), p = idx[t] * 3, q = idx[t + 1] * 3, f = rnd();
      const ex = pos[q] - pos[p], ez = pos[q + 2] - pos[p + 2], L = Math.hypot(ex, ez), o = (rnd() - 0.5) * 0.024;
      x = pos[p] + ex * f + (ez / L) * o; z = pos[p + 2] + ez * f - (ex / L) * o;
    }
    const y = T.terrainY(track, x, z);
    if (y == null) continue;
    const G = track._terrGrid;
    const i = Math.min(G.nx - 1, Math.max(0, Math.floor((x - G.mnx) / G.cell)));
    const k = Math.min(G.nz - 1, Math.max(0, Math.floor((z - G.mnz) / G.cell))) * G.nx + i;
    assert.ok(y >= G.lo[k], `terrainY ${y} at ${x},${z} under the cell floor ${G.lo[k]}`);
    probes++;
  }
  assert.ok(probes > 15000, "most probes hit terrain");
});

// The case the TRI_EPS term in the floor exists for: no neighbour covers the
// probe, so terrainY is the steep triangle's own extrapolation below its lowest
// vertex (y = 10x + 10z, probed 5 mm outside both edges at the origin: -0.1 m).
test("the floor covers a lone steep triangle's extrapolation past its lowest corner", () => {
  const track = { terrainGeo: { pos: [0, 0, 0, 5, 50, 0, 0, 50, 5], idx: [0, 1, 2] } };
  const y = T.terrainY(track, -0.005, -0.005);
  assert.ok(Math.abs(y + 0.1) < 1e-9, `extrapolated ${y}`);
  assert.ok(y >= track._terrGrid.lo[0], `floor ${track._terrGrid.lo[0]} over ${y}`);
});
