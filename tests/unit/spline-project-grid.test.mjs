/* spline-project-grid.test.mjs — the hint-less Tracks.project() searches a
 * segment grid instead of every centreline segment, and must return exactly
 * what the full ascending scan returned.
 *
 * WHY THIS EXISTS. Without a hint project() was O(n): the flyby planner
 * (js/camera/flyby-sight.js offRoad, 25 probes per prop box) spent ~295 ms of
 * main-thread JS per monza track switch in it (docs/notes/PERF-P1-2026-10-18.md).
 * The grid walks rings of cells outward and stops when no unvisited segment can
 * tie the best cost; ties go to the lowest segment index, as the scan's strict
 * `<` did. `reference()` below is that scan, copied from the pre-grid source, so
 * any drift — a missed segment, a different tie, a lost height term — is a
 * deepEqual failure here rather than a camera or debris verdict elsewhere.
 *
 * Probes: 400 random points over the circuit's box plus a 600 m margin (half
 * with a height), every node, alternately each segment midpoint (where two
 * segments tie on a clamped endpoint) or a point 12 m right of the node, and far / non-finite
 * queries that must take the linear fallback.
 *
 * Run: node --test tests/unit/spline-project-grid.test.mjs   (toolingFast)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { buildContext } = require("../../tools/track/verify-track.cjs");

const T = buildContext(null, { quiet: true });

/** The pre-grid full search: every segment, ascending, strict `<`. */
function reference(track, wx, wz, wy) {
  const n = track.n, L = track.total, ds = L / n;
  const px = track.px, pz = track.pz, rx = track.rx, rz = track.rz, tx = track.tx, tz = track.tz, py = track.py;
  const useY = (wy != null && isFinite(wy) && py && py.length === n);
  let bestD2 = Infinity, bestCost = Infinity, bestK = 0, bestT = 0, bestCx = 0, bestCz = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ax = px[i], az = pz[i];
    const dx = px[j] - ax, dz = pz[j] - az;
    const len2 = dx * dx + dz * dz || 1e-6;
    let t = ((wx - ax) * dx + (wz - az) * dz) / len2;
    if (t < 0) t = 0; else if (t > 1) t = 1;
    const cx = ax + t * dx, cz = az + t * dz;
    const ex = wx - cx, ez = wz - cz;
    const d2 = ex * ex + ez * ez;
    let cost = d2;
    if (useY) { const ey = wy - (py[i] + (py[j] - py[i]) * t); cost += ey * ey; }
    if (cost < bestCost) { bestCost = cost; bestD2 = d2; bestK = i; bestT = t; bestCx = cx; bestCz = cz; }
  }
  const j = (bestK + 1) % n;
  const s = ((bestK + bestT) * ds) % L;
  let r0 = rx[bestK] + (rx[j] - rx[bestK]) * bestT;
  let r2 = rz[bestK] + (rz[j] - rz[bestK]) * bestT;
  const rl = Math.hypot(r0, r2) || 1; r0 /= rl; r2 /= rl;
  const lat = (wx - bestCx) * r0 + (wz - bestCz) * r2;
  const h0 = tx[bestK] + (tx[j] - tx[bestK]) * bestT;
  const h2 = tz[bestK] + (tz[j] - tz[bestK]) * bestT;
  return { s, lat, k: bestK, heading: Math.atan2(h0, h2), dist: Math.sqrt(bestD2) };
}

function probes(track) {
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const n = track.n;
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let i = 0; i < n; i++) {
    x0 = Math.min(x0, track.px[i]); x1 = Math.max(x1, track.px[i]);
    z0 = Math.min(z0, track.pz[i]); z1 = Math.max(z1, track.pz[i]);
  }
  const out = [], M = 600;
  for (let k = 0; k < 400; k++) {
    out.push([x0 - M + rnd() * (x1 - x0 + 2 * M), z0 - M + rnd() * (z1 - z0 + 2 * M),
      rnd() < 0.5 ? null : track.py[k % n] + (rnd() - 0.5) * 30]);
  }
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    out.push([track.px[i], track.pz[i], null]);
    if (i & 1) out.push([(track.px[i] + track.px[j]) / 2, (track.pz[i] + track.pz[j]) / 2, track.py[i]]);
    else out.push([track.px[i] + track.rx[i] * 12, track.pz[i] + track.rz[i] * 12, null]);
  }
  out.push([x0 - 50000, z0, null], [x1 + 3e6, z1, 2], [NaN, 0, null], [Infinity, 0, null]);
  return out;
}

const built = new Map();
const trackOf = (id) => built.get(id) || built.set(id, T.build(T.LIST.find((d) => d.id === id), { night: false })).get(id);

// suzuka crosses itself (the height term decides the leg), monaco is a dense
// street circuit, spa is the longest lap with the widest sweeps.
for (const id of ["suzuka", "monaco", "spa"]) {
  test(`${id}: hint-less project() equals the full ascending scan at every probe`, () => {
    const track = trackOf(id);
    let checked = 0;
    for (const [x, z, y] of probes(track)) {
      // spread: the VM realm's object has its own Object.prototype, which strict deepEqual compares
      assert.deepEqual({ ...T.project(track, x, z, null, y) }, reference(track, x, z, y), `${id} at (${x}, ${z}, ${y})`);
      checked++;
    }
    assert.ok(track._segGrid && track._segGrid.list.length >= track.n, "the grid path actually ran");
    assert.ok(checked > 2 * track.n, "probe set covers every node");
  });
}

test("a hinted query is the windowed search, untouched by the grid", () => {
  const track = trackOf("spa");
  const ds = track.total / track.n;
  const r = T.project(track, track.px[100] + 3, track.pz[100], 100 * ds);
  assert.ok(Math.abs(r.k - 100) <= 1, `hinted projection stays at node ~100, got ${r.k}`);
});
