/* spline-project-height.test.mjs — Tracks.project() must be able to tell apart
 * the two legs of a track that crosses ITSELF.
 *
 * WHY THIS EXISTS. project() searches in XZ only: evalSeg reads px/pz and never
 * py. On a crossing circuit the two legs are metres apart horizontally and
 * metres apart VERTICALLY, so a flat search cannot distinguish them even in
 * principle — it is not a tuning problem, the information was absent.
 *
 * Suzuka is the case in this repo: its legs pass ~2.6 m apart in XZ and ~8.3 m
 * apart in Y. It surfaced through the debris hazard sweep, which projected
 * settled bodies onto the wrong deck and drifted the road height by 8+ m. The
 * hinted path was fixed there by trusting the hint only when the height agrees;
 * this guards the UNHINTED path, which is what runs when the hint is rejected —
 * and what the agent view uses everywhere.
 *
 * The fix is an optional 5th argument (wy) that adds a height term to the cost.
 * Omitting it preserves the old behaviour exactly, so this test also pins that
 * the ambiguity is REAL: the no-wy arm must still get it wrong, or the test has
 * stopped measuring anything.
 *
 * The second half pins the segment grid behind the hint-less search (below).
 *
 * Run: node --test tests/unit/spline-project-height.test.mjs   (test:sweeps)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { buildContext } = require("../../tools/track/verify-track.cjs");

const T = buildContext();
const track = T.build(T.LIST.find((t) => t.id === "suzuka"), { night: false });
const L = track.total, ds = L / track.n;
const near = (a, b) => Math.min(Math.abs(a - b), L - Math.abs(a - b));

/** The two nodes that pass closest in XZ while furthest apart in Y. */
function crossover() {
  let best = null;
  for (let i = 0; i < track.n; i++) {
    for (let j = i + 40; j < track.n; j++) {
      const dx = track.px[i] - track.px[j], dz = track.pz[i] - track.pz[j];
      const d2 = dx * dx + dz * dz;
      if (d2 > 9) continue;
      const dy = Math.abs(track.py[i] - track.py[j]);
      if (!best || dy > best.dy) best = { i, j, dxz: Math.sqrt(d2), dy };
    }
  }
  return best;
}

test("suzuka crosses itself: legs are close in XZ and far in Y", () => {
  const x = crossover();
  assert.ok(x, "suzuka must still have a self-crossing — if this fails the fixture changed, not the code");
  assert.ok(x.dxz < 4, `legs should be within a few metres in XZ, got ${x.dxz.toFixed(2)} m`);
  assert.ok(x.dy > 5, `legs should be well separated in Y, got ${x.dy.toFixed(2)} m`);
});

test("a height-carrying query picks the leg it is actually on; a flat one cannot", () => {
  const x = crossover();
  const hi = track.py[x.i] > track.py[x.j] ? x.i : x.j;
  const lo = hi === x.i ? x.j : x.i;
  const sHi = hi * ds, sLo = lo * ds;

  let flatWrong = 0, heightWrong = 0;
  // Bias the query toward the OTHER leg in XZ while keeping the upper leg's
  // height — a body sitting on the deck, displaced toward the road beneath.
  for (const f of [0.55, 0.65, 0.75, 0.85, 0.95]) {
    const qx = track.px[hi] + (track.px[lo] - track.px[hi]) * f;
    const qz = track.pz[hi] + (track.pz[lo] - track.pz[hi]) * f;
    const qy = track.py[hi];
    const flat = T.project(track, qx, qz);
    const tall = T.project(track, qx, qz, null, qy);
    if (near(flat.s, sHi) > near(flat.s, sLo)) flatWrong++;
    if (near(tall.s, sHi) > near(tall.s, sLo)) heightWrong++;
  }
  assert.equal(heightWrong, 0, "with a height, every offset must resolve to the leg the point is on");
  // ANTI-VACUITY: if the flat search stops being wrong here, this test is no
  // longer exercising the ambiguity and must be re-pointed, not deleted.
  assert.ok(flatWrong > 0,
    "the flat search must still be wrong somewhere, or this test proves nothing");
});

test("omitting the height changes nothing for callers that never passed one", () => {
  // The 5th argument is a capability, not a policy change: away from a
  // crossover the two forms agree, so every existing call site is unaffected.
  // Node coordinates are used directly rather than sample(), which writes into
  // a caller-owned scratch with several pre-allocated arrays.
  const x = crossover();
  let checked = 0;
  for (let i = 0; i < track.n; i += 37) {
    // Skip the crossover neighbourhood — that is the one place they SHOULD
    // differ, and test 2 already pins it.
    if (Math.abs(i - x.i) < 60 || Math.abs(i - x.j) < 60) continue;
    const a = T.project(track, track.px[i], track.pz[i]);
    const b = T.project(track, track.px[i], track.pz[i], null, track.py[i]);
    assert.ok(near(a.s, b.s) < 1e-6,
      `node ${i}: the two forms diverged away from the crossover (${a.s} vs ${b.s})`);
    checked++;
  }
  assert.ok(checked > 20, `expected to check many nodes, only did ${checked}`);
});

/* THE SEGMENT GRID (2026-10-18). The hint-less search walks a segment grid
 * instead of every centreline segment and must return exactly what the full
 * ascending scan returned. Without a hint project() was O(n): the flyby planner
 * (js/camera/flyby-sight.js offRoad, 25 probes per prop box) spent ~295 ms of
 * main-thread JS per monza track switch in it (docs/notes/PERF-P1-2026-10-18.md).
 * The grid walks rings of cells outward and stops when no unvisited segment can
 * tie the best cost; ties go to the lowest segment index, as the scan's strict
 * `<` did. `reference()` below is that scan, copied from the pre-grid source, so
 * any drift (a missed segment, a different tie, a lost height term) is a
 * deepEqual failure here rather than a camera or debris verdict elsewhere.
 * Probes: 400 random points over the circuit's box plus a 600 m margin (half
 * with a height), every node, alternately each segment midpoint (where two
 * segments tie on a clamped endpoint) or a point 12 m right of the node, and
 * far / non-finite queries that must take the linear fallback. */
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
const trackOf = (id) => id === "suzuka" ? track : built.get(id) || built.set(id, T.build(T.LIST.find((d) => d.id === id), { night: false })).get(id);

// suzuka crosses itself (the height term decides the leg), monaco is a dense
// street circuit, spa is the longest lap with the widest sweeps.
for (const id of ["suzuka", "monaco", "spa"]) {
  test(`${id}: hint-less project() equals the full ascending scan at every probe`, () => {
    const tr = trackOf(id);
    let checked = 0;
    for (const [x, z, y] of probes(tr)) {
      // spread: the VM realm's object has its own Object.prototype, which strict deepEqual compares
      assert.deepEqual({ ...T.project(tr, x, z, null, y) }, reference(tr, x, z, y), `${id} at (${x}, ${z}, ${y})`);
      checked++;
    }
    assert.ok(tr._segGrid && tr._segGrid.list.length >= tr.n, "the grid path actually ran");
    assert.ok(checked > 2 * tr.n, "probe set covers every node");
  });
}

test("a hinted query is the windowed search, untouched by the grid", () => {
  const tr = trackOf("spa");
  const ds = tr.total / tr.n;
  const r = T.project(tr, tr.px[100] + 3, tr.pz[100], 100 * ds);
  assert.ok(Math.abs(r.k - 100) <= 1, `hinted projection stays at node ~100, got ${r.k}`);
});
