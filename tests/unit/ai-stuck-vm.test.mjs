/* ai-stuck-vm.test.mjs — the AI-behind-a-stopped-player weld, in the Node VM
 * (tools/lib/game-vm.cjs). Not a twin of any browser spec: this is a NEW
 * behavioural gate, so twinned-specs does not count it.
 *
 * THE DEFECT, measured on monza before the fix: park the player on the racing
 * line, drop an AI three metres behind it, and fifteen seconds later the pair
 * are exactly where they started — dProg pinned at -4.75 m (the collision
 * slop), AI speed 0.00, contactT re-armed at 0.22 on BOTH cars every frame.
 *
 * Three mechanisms locked together, and each is asserted below:
 *   - the queue cap `blocker.speed + clamp(gap - follow, -6, 8)` goes NEGATIVE
 *     behind a stopped car inside the follow distance, so the AI was commanded
 *     to a dead stop;
 *   - latFac scales with speed, so a stopped car has ZERO lateral authority and
 *     the dig-out pull it computed could never move it;
 *   - contactT gated the AI rescue outright, so the one state most in need of
 *     a rescue was the one state that could never get one.
 *
 * Measured while writing these: a pair held at the slop distance is in genuine,
 * repeating micro-contact — the resolver corrects a real penetration every
 * frame and _colSepPair puts them back — so contactT staying armed there is
 * CORRECT, not the latch it looks like. The `corr > CORR_EPS` guard in
 * _colResolvePair is for the other case, a correction of numerical dust, and it
 * is asserted structurally below rather than through a scenario that does not
 * reach it.
 *
 * Run: node --test tests/unit/ai-stuck-vm.test.mjs   (~10 s, one boot)
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

let g = null;
before(async () => { g = await createGame({ track: "monza" }); });
after(() => { if (g) g.close(); });

// Park the player mid-track and drop one AI `behind` metres back, then hold the
// player still while the AI is left to deal with it. Returns a per-second trace.
async function stalemate(behind, seconds) {
  const A = g.apex;
  await g.race("monza");
  A.jump(0.1, 40, 0);
  A.headless(true);
  A.reset(0.3, 0, 0);
  const idx = A.rival(behind, 0).rival;
  const trace = [];
  for (let i = 0; i < seconds * 60; i++) {
    A.act({ steer: 0, throttle: false, brake: true }, 1 / 60, 1);
    if (i % 30 === 0) {
      const cars = A.cars();
      const p = cars.find((c) => c.p);
      const ai = cars[idx];
      trace.push({ t: i / 60, dProg: ai.prog - p.prog, dx: ai.x - p.x, aiSpd: ai.speed, aiCt: ai.ct, pCt: p.ct });
    }
  }
  A.headless(false);
  return trace;
}

test("an AI that catches a stopped player gets past it", async () => {
  const trace = await stalemate(-3, 15);
  const end = trace[trace.length - 1];
  // Measured before the fix: dProg never left -4.75 in fifteen seconds.
  assert.ok(end.dProg > 20,
    `AI still welded to the player: dProg ${end.dProg.toFixed(2)} m after 15 s`);
  assert.ok(end.aiSpd > 15,
    `AI never got going: ${end.aiSpd.toFixed(2)} m/s after 15 s`);
});

test("the AI is moving, and moving sideways, well before it is clear", async () => {
  const trace = await stalemate(-3, 15);
  // The queue floor: within five seconds it is no longer stopped. Absolute
  // speeds here are the harness's own PACE 1 — the floor itself is pace-scaled.
  const atFive = trace.find((r) => r.t >= 5);
  assert.ok(atFive.aiSpd > 1,
    `queue cap still commands a standstill at t=5: ${atFive.aiSpd.toFixed(2)} m/s`);
  // The lateral floor: it has shuffled off the player's line, which a car with
  // latFac = 0 could not do however hard the dig-out pulled.
  assert.ok(Math.abs(atFive.dx) > 1,
    `no lateral escape at t=5: dx ${atFive.dx.toFixed(2)} m`);
});

test("contactT is armed while welded and clears once the cars are apart", async () => {
  const trace = await stalemate(-3, 15);
  // Anti-vacuity first: the scenario really does make contact.
  assert.ok(trace.some((r) => r.pCt > 0), "the setup never made contact at all");
  const end = trace[trace.length - 1];
  assert.equal(end.aiCt, 0, `AI contactT still armed with the cars apart: ${end.aiCt}`);
  assert.equal(end.pCt, 0, `player contactT still armed with the cars apart: ${end.pCt}`);
});

test("a correction of numerical dust does not count as contact", async () => {
  // `corr > 0` reads like "did this frame separate them" and is not: at the
  // slop distance the penetration is `LCAR - |dProg|`, so corr lands at ~3e-16
  // — positive, so the guard passes, while nothing moves. The pre-existing
  // speed scrub used that gate, and its own comment says it exists to stop
  // "perpetual zero-corr side contact draining speed without separating the
  // cars" — which the dust defeated. Both scrub and flag now compare against a
  // real distance. Structural because the scenario above cannot reach it: a
  // pair held at the slop distance is in genuine repeating micro-contact.
  const src = readFileSync(new URL("../../js/game.js", import.meta.url), "utf8");
  const eps = src.match(/^const CORR_EPS = ([\d.e-]+);/m);
  assert.ok(eps, "CORR_EPS is gone from js/game.js");
  assert.ok(Number(eps[1]) > 0, `CORR_EPS must be a real distance, got ${eps[1]}`);
  assert.ok(Number(eps[1]) < 0.01, `CORR_EPS must stay under a centimetre, got ${eps[1]}`);
  // Every arm of contactT in the resolver sits behind that comparison.
  const arms = src.match(/^.*\bcontactT = b\.contactT = 0\.22.*$/gm) || [];
  assert.equal(arms.length, 2, `expected the two resolver arms, found ${arms.length}`);
  const body = src.slice(src.indexOf("function _colResolvePair"), src.indexOf("function _colSepPair"));
  for (const guard of ["if (corr > CORR_EPS) {", "if (corr > CORR_EPS) a.contactT"])
    assert.ok(body.includes(guard), `_colResolvePair lost its guard: ${guard}`);
});
