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
