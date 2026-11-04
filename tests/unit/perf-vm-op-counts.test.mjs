/* perf-vm-op-counts.test.mjs — operation counts, not wall-clock (deterministic on CI, no browser).
 *
 * 1. Broadphase ladder: G.netPlay.owns calls per physics step must not fall as the field grows. The
 *    all-pairs path (<= 12 ranked cars) used to call owns() before the prog reject, so a 12-car field
 *    cost 4x a 13-car one (collide.js pairContact). Nothing else measured cost against car count.
 * 2. Exact per-circuit AI lookup counts per step (seeded AI-only field, 300 steps after a 60-step
 *    warm). A new look-ahead read is ~+21 calls/step and invisible to the ms/KB gates. A deliberate
 *    change updates EXPECT below and says why in the commit; do not loosen it.
 *
 * Run: node --test tests/unit/perf-vm-op-counts.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const { createGame } = createRequire(import.meta.url)("../../tools/lib/game-vm.cjs");

const WARM = 60, STEPS = 300;

async function count(id, nCars, wrap) {
  const g = await createGame({ track: id, carMeshes: false });
  try {
    await g.race(id);
    g.aiOnly(); g.apex.headless(true);
    for (let i = nCars; i < g.G.cars.length; i++) g.apex.retire(i, "bench");
    g.step(WARM);
    const c = {};
    const undo = wrap(g, c);
    g.step(STEPS);
    undo();
    return c;
  } finally { g.close(); }
}

test("broadphase: netPlay.owns calls per step are monotone in field size (no 12-car all-pairs cliff)", async () => {
  const per = {};
  for (const n of [6, 12, 13, 22]) {
    const c = await count("monza", n, (g, c) => {
      const np = g.G.netPlay, o = np.owns; c.owns = 0;
      np.owns = function (x) { c.owns++; return o.apply(this, arguments); };
      return () => { np.owns = o; };
    });
    per[n] = c.owns / STEPS;
  }
  assert.ok(per[6] <= per[12] && per[12] <= per[13] && per[13] <= per[22], `owns/step by car count: ${JSON.stringify(per)}`);
});

const EXPECT = {
  monza: { curvature: 22561, bankAngle: 3805, sample: 12600, wallAt: 25200 },
  monaco: { curvature: 40649, bankAngle: 2960, sample: 12612, wallAt: 25200 },
  spa: { curvature: 41562, bankAngle: 3942, sample: 12600, wallAt: 25200 },
};

for (const id of Object.keys(EXPECT)) {
  test(`${id}: exact Tracks lookup counts over ${STEPS} AI steps`, async () => {
    const names = Object.keys(EXPECT[id]);
    const got = await count(id, 22, (g, c) => {
      const T = g.sandbox.Tracks, o = {};
      for (const k of names) { c[k] = 0; o[k] = T[k]; T[k] = function () { c[k]++; return o[k].apply(this, arguments); }; }
      return () => { for (const k of names) T[k] = o[k]; };
    });
    assert.deepEqual(got, EXPECT[id], `${id} counts changed (update EXPECT only for a deliberate change): ${JSON.stringify(got)}`);
  });
}
