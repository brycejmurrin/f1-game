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
