/* ai-pass-defend-vm.test.mjs — a car with a LATCHED pass (c.passOf) does not
 * also cover against its chaser (#1670, H31 "pass latch vs defendPull").
 *
 * game.js sums the lateral biases (`biasWant = overtake + defend + yieldPull +
 * sep`), so a defend move computed while the pass offset was live could cancel
 * the pass. Scenario: S has latched a pass on B (14 m ahead) while a faster C
 * sits 5 m behind S one metre to the side — the textbook cover trigger. Before
 * the gate S.defendSide went non-zero on the first frame; with it, it stays 0
 * for as long as the pass is latched.
 *
 * Run: node --test tests/unit/ai-pass-defend-vm.test.mjs   (~10 s, one boot)
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

let g = null;
before(async () => { g = await createGame({ track: "monza" }); });
after(() => { if (g) g.close(); });

async function run(latch) {
  const A = g.apex;
  await g.race("monza");
  A.jump(0.1, 40, 0);
  A.headless(true);
  A.reset(0.3, 0, 0);
  const sp = 60;
  A.rivals([{ dProg: -400, dx: 0, speed: sp }, { dProg: -386, dx: 0, speed: sp }, { dProg: -405, dx: 1, speed: sp + 8 }]);
  const ai = g.G.cars.filter((c) => !c.isPlayer);
  const [S, B] = ai;
  let covered = 0, latched = 0, anyCover = 0;
  for (let i = 0; i < 20; i++) {
    S.defendSide = 0;   // judge each frame on its own: defendSide is sticky by design
    if (latch) { S.passOf = B; S.passSide = 1; S.passT = 3; }
    A.act({ steer: 0, throttle: false, brake: true }, 1 / 60, 1);
    if (S.passOf) latched++;
    if (S.defendSide) anyCover++;
    if (S.passOf === B && S.defendSide) covered++;
    S.speed = sp; B.speed = sp;
  }
  A.headless(false);
  return { covered, latched, anyCover };
}

test("a latched pass is not covered against", async () => {
  const r = await run(true);
  assert.ok(r.latched > 0, "the pass latch held for the probe");
  assert.equal(r.covered, 0, `defend fired ${r.covered} frames while the pass was latched`);
});

test("control: with no latch the same chaser IS covered against (the probe can see a cover)", async () => {
  const r = await run(false);
  assert.ok(r.anyCover > 0, "defend never fired without a latch: the scenario does not exercise defendPull");
});

// ── #5557 finding 5: a blue-flagged AI steps AWAY from the car lapping it ────
// game.js picked the yield side from room alone. A lapper 6 m back is outside
// the lapped car's room scan, so with equal room the tie went right — into a
// lapper sitting 2.5 m to the right. L mid-road, the lapper C 6 m behind and a
// lap ahead in progress; the mirror case pins that the lapper's side decides.
async function yieldBias(dx) {
  const A = g.apex;
  await g.race("monza");
  A.jump(0.1, 40, 0);
  A.headless(true);
  A.reset(0.3, 0, 0);
  const sp = 60;
  A.rivals([{ dProg: -400, dx: 0, speed: sp }, { dProg: -406, dx, speed: sp }]);   // matched speed: the gap HOLDS at 6 m, outside L's room scan
  const [L, C] = g.G.cars.filter((c) => !c.isPlayer);
  C.prog += g.G.track.total;   // a lap ahead in progress: the blue-flag case
  let yielding = 0;
  for (let i = 0; i < 12; i++) {
    L.letPassT = 10;   // past any driver's letPassDelay: the yield is live
    A.act({ steer: 0, throttle: false, brake: true }, 1 / 60, 1);
    if (L.letPassT > 5) yielding++;
    L.speed = sp; C.speed = sp;
  }
  A.headless(false);
  return { bias: L.aiBias, yielding, gap: L.s - C.s };
}

test("a lapped car yields left when the lapper is on its right", async () => {
  const r = await yieldBias(2.5);
  assert.ok(r.yielding > 0, "the let-pass case held for the probe");
  assert.ok(r.gap > 5.5, `gap ${r.gap}: the lapper drifted inside the room scan, which hides the bug`);
  assert.ok(r.bias < 0, `bias ${r.bias}: stepped toward the lapper`);
});

test("and right when the lapper is on its left", async () => {
  const r = await yieldBias(-2.5);
  assert.ok(r.bias > 0, `bias ${r.bias}: stepped toward the lapper`);
});
