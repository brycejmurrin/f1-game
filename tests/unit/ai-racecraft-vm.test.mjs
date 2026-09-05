/* ai-racecraft-vm.test.mjs — the two racecraft complaints that survived the
 * stopped-player weld fix (ai-stuck-vm.test.mjs), in the Node VM harness:
 *
 *   1. an AI at racing pace sat behind a SLOWER MOVING car for tens of seconds
 *      (measured: 36.5 s on monza, 43 s on monaco) because the overtake pull
 *      compared speeds THIS INSTANT — a blocker slow for a corner looked like a
 *      blocker with no pace — and because the queue cap re-caught the passer
 *      the moment it dropped back into the blocker box;
 *   2. two AI cars alongside each other MIRRORED each other: both were scrubbed
 *      and both softened, so neither had priority and both sank to the
 *      throttle-vs-scrub balance for as long as the corner kept them touching
 *      (standoff pairs measured: 6 on monza, 3 on monaco, per 4 minutes).
 *
 * The fixes are pace-based overtake want (AiDrive.otWant), a pass LATCH with a
 * position target beside the passed car (passTarget / passHold / passCooldown)
 * that the queue cap releases once the passer is beside it, and ONE yielder in
 * every alongside pair (AiDrive.sideYieldsA) — the same rule in the collision
 * resolver and in the lateral planner. Both scenarios below are deterministic
 * (seeded stream, headless, fixed dt); the numbers in the assertions are the
 * mechanism's promise, not a fit to a run: a pass is "beside or past", a
 * resolved pair is "clear laterally or one car ahead".
 *
 * Run: node --test tests/unit/ai-racecraft-vm.test.mjs   (~15 s, one boot)
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

let g = null;
before(async () => { g = await createGame({ track: "monza" }); });
after(() => { if (g) g.close(); });

const LCAR = 4.8;          // js/game.js — car length in the (prog, x) collision plane
const WCAR = 2.0;          // js/game.js — car width in the same plane
const CLEAR = 2.8;         // AiDrive.minLatGap(hw, false) on a permanent circuit
const DT = 1 / 60;

// The player car becomes an AI driver on a reduced pace ceiling (tierV is the
// per-car top-speed scale the AI drives to) — a stand-in for a human mid-pack
// that never parks, never leaves the road, and always keeps the racing line.
async function slowAiPlayer(frac, speed, tierMul) {
  const A = g.apex;
  await g.race("monza");
  A.headless(true);
  A.reset(frac, speed, 0);
  const cars = A.cars();
  const pIdx = cars.findIndex((c) => c.p);
  A.carRole(pIdx, { human: false });
  const pc = g.G.cars[pIdx];
  pc.tierV *= tierMul;
  pc.skill = Math.min(pc.skill || 0.97, 0.95);
  return pIdx;
}

test("an AI with more pace gets past a slower moving car instead of following it", async () => {
  const A = g.apex;
  const pIdx = await slowAiPlayer(0.1, 40, 0.86);
  const idx = A.rival(-12, 0).rival;      // 12 m behind, same speed, same lane
  A.go();
  const trace = [];
  let passedAt = null;
  for (let i = 0; i < 20 / DT; i++) {
    A.step(DT, 1);
    if (i % 30 === 0) {
      const cars = A.cars();
      const p = cars[pIdx], ai = cars[idx];
      const r = { t: i * DT, dProg: ai.prog - p.prog, dx: ai.x - p.x, aiSpd: ai.speed, pSpd: p.speed };
      trace.push(r);
      if (passedAt == null && r.dProg > LCAR + 1.2 + 4) passedAt = r.t;
    }
  }
  A.headless(false);
  // Anti-vacuity: the setup really put the AI behind, on the same line.
  assert.ok(trace[0].dProg < -8 && Math.abs(trace[0].dx) < 0.5,
    `setup drifted: dProg ${trace[0].dProg.toFixed(1)} dx ${trace[0].dx.toFixed(1)}`);
  // The blocker is genuinely slower but genuinely moving — this is not the weld case.
  const slowest = Math.min(...trace.map((r) => r.pSpd));
  assert.ok(slowest > 15, `the blocker stalled (${slowest.toFixed(1)} m/s) — wrong scenario`);
  // Measured before the fix: the nearest AI dwelt within 12 m behind for 36.5 s.
  assert.ok(passedAt != null && passedAt <= 20,
    `AI never got past the slower car in 20 s: final dProg ${trace[trace.length - 1].dProg.toFixed(1)} m`);
  // And it STAYS past — no re-catch by the queue cap once alongside.
  const end = trace[trace.length - 1];
  assert.ok(end.dProg > LCAR, `AI fell back behind after passing: dProg ${end.dProg.toFixed(1)} m`);
});

test("two AI cars dropped side by side sort themselves out — one yields, neither stalls", async () => {
  const A = g.apex;
  const pIdx = await slowAiPlayer(0.1, 40, 1);
  // Two rivals 60 m ahead of the (AI) player, overlapping laterally: 2.4 m apart
  // is inside the 2.8 m clearance the planner wants, so this is a live conflict.
  const [ia, ib] = A.rivals([{ dProg: 60, dx: -1.2 }, { dProg: 60, dx: 1.2 }]);
  A.go();
  let resolvedAt = null, minSpd = Infinity;
  const trace = [];
  for (let i = 0; i < 10 / DT; i++) {
    A.step(DT, 1);
    if (i % 15 === 0) {
      const cars = A.cars();
      const a = cars[ia], b = cars[ib];
      const dp = Math.abs(a.prog - b.prog), dx = Math.abs(a.x - b.x);
      trace.push({ t: i * DT, dp, dx, sa: a.speed, sb: b.speed, cta: a.ct, ctb: b.ct });
      if (i * DT > 1) minSpd = Math.min(minSpd, a.speed, b.speed);
      // Resolved: clear of each other laterally, or one car length ahead.
      if (resolvedAt == null && (dx >= CLEAR - 0.05 || dp > LCAR + 1.2)) resolvedAt = i * DT;
    }
  }
  A.headless(false);
  assert.ok(trace[0].dx < CLEAR && trace[0].dp < 1, `setup drifted: dp ${trace[0].dp.toFixed(1)} dx ${trace[0].dx.toFixed(1)}`);
  assert.ok(resolvedAt != null && resolvedAt <= 10,
    `pair still overlapping after 10 s: dp ${trace[trace.length - 1].dp.toFixed(1)} dx ${trace[trace.length - 1].dx.toFixed(1)}`);
  // Measured before the fix: mirrored pairs sank to ~17 m/s at a 70 m/s ceiling.
  assert.ok(minSpd > 25, `an alongside car stalled to ${minSpd.toFixed(1)} m/s`);
  // Once resolved the pair stays resolved: the faster car pulls a length clear
  // and the yielder tucks in BEHIND it (dx closes again — that is the racing
  // line, not a relapse), so the relapse test is the contact box itself, plus
  // the resolver's own contact flag.
  const after = trace.filter((r) => r.t > resolvedAt + 2);
  // A single sample grazing the box edge is racing (the leader takes the line
  // into the corner, the yielder tucks in a hair early); two in a row (0.5 s) is
  // an entanglement.
  const relapsed = after.filter((r, i) => i > 0 && r.dx < WCAR && r.dp < LCAR && after[i - 1].dx < WCAR && after[i - 1].dp < LCAR);
  const fmt = (r) => `t=${r.t.toFixed(2)} dp=${r.dp.toFixed(2)} dx=${r.dx.toFixed(2)} v=${r.sa.toFixed(1)}/${r.sb.toFixed(1)} ct=${r.cta}/${r.ctb}`;
  assert.ok(relapsed.length === 0,
    `pair re-entered the contact box after resolving at ${resolvedAt.toFixed(2)} s: ${relapsed.map(fmt).join("; ")}\n${trace.map(fmt).join("\n")}`);
  const touched = after.filter((r) => r.cta > 0 || r.ctb > 0).length;
  assert.ok(touched === 0, `pair made contact ${touched} times after resolving`);
});
