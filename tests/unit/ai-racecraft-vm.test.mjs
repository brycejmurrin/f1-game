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
import vm from "node:vm";
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

// Steering reversals per km and lateral-acceleration RMS from a (s, x) trace
// sampled every DT. Lateral velocity is Δx/Δt across consecutive frames; a
// reversal is a sign flip of that velocity once it has exceeded ±0.25 m/s in
// the new direction (hysteresis, so noise around zero does not count).
function laneJitter(rows, dt, lapM) {
  let prevV = 0, sign = 0, rev = 0, sumA2 = 0, nA = 0;
  for (let i = 1; i < rows.length; i++) {
    const v = (rows[i].x - rows[i - 1].x) / dt;
    if (i > 1) { const a = (v - prevV) / dt; sumA2 += a * a; nA++; }
    if (v > 0.25 && sign <= 0) { if (sign < 0) rev++; sign = 1; }
    else if (v < -0.25 && sign >= 0) { if (sign > 0) rev++; sign = -1; }
    prevV = v;
  }
  return { revPerKm: rev / (lapM / 1000), jerkRms: nA ? Math.sqrt(sumA2 / nA) : 0 };
}

// The player car becomes an AI driver on a reduced pace ceiling (tierV is the
// per-car top-speed scale the AI drives to) — a stand-in for a human mid-pack
// that never parks, never leaves the road, and always keeps the racing line.
// The player car's pace as the field was built, captured once. race() does not
// rebuild the cars, so `pc.tierV *= tierMul` below COMPOUNDS across the tests
// in this file: by the fourth test the car had been detuned three times and
// drove a visibly different line (the racing-line test's approach measured
// -2.00 m in the suite against -2.27 m in isolation, straddling its own
// threshold). Every test that changes the player's pace now starts from these.
let pristinePace = null;
function restorePace(pIdx) {
  const pc = g.G.cars[pIdx];
  if (!pristinePace) { pristinePace = { tierV: pc.tierV, skill: pc.skill }; return pIdx; }
  pc.tierV = pristinePace.tierV; pc.skill = pristinePace.skill;
  return pIdx;
}

async function slowAiPlayer(frac, speed, tierMul) {
  const A = g.apex;
  await g.race("monza");
  A.headless(true);
  A.reset(frac, speed, 0);
  const cars = A.cars();
  const pIdx = cars.findIndex((c) => c.p);
  A.carRole(pIdx, { human: false });
  restorePace(pIdx);
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

test("a standing start is a launch, not a procession — the grid pitch breaks in the first seconds", async () => {
  const A = g.apex;
  await g.race("monza");
  A.headless(true);
  const cars = g.G.cars;
  A.carRole(cars.findIndex((c) => c.isPlayer), { human: false });
  A.go();
  g.G.raceT = 0;   // go() jumps the clock to 0.5 s; the reactions live inside that
  const byProg = () => cars.slice().sort((a, b) => b.prog - a.prog);
  let last = byProg().map((c) => c.id ?? cars.indexOf(c)), changes = 0, spreadAt4 = 0;
  for (let i = 0; i < 10 * 60; i++) {
    A.step(DT, 1);
    const ord = byProg();
    const ids = ord.map((c) => c.id ?? cars.indexOf(c));
    if (ids.some((id, k) => id !== last[k])) changes++;
    last = ids;
    if (i === 4 * 60 - 1) { const v = ord.map((c) => c.speed); spreadAt4 = Math.max(...v) - Math.min(...v); }
  }
  A.headless(false);
  // Anti-vacuity: everyone left the line.
  assert.ok(cars.every((c) => c.speed > 10), "a car never launched");
  // Measured before the launch plan: speeds within 4 m/s of each other at t=4
  // and 3 order changes in ten seconds. After: 8 m/s and 17 changes. (The count
  // of sub-12 m gaps at t=5 was 18 before and 14-17 after — too noisy to gate.)
  const seen = `speed spread ${spreadAt4.toFixed(1)} m/s at t=4, ${changes} order changes in 10 s`;
  assert.ok(spreadAt4 >= 6, `the field still accelerates as one: ${seen}`);
  assert.ok(changes >= 6, `a procession: ${seen}`);
});

test("the AI drives a racing line: outside on the approach, inside at the apex, on monza's big corners", async () => {
  const A = g.apex;
  await g.race("monza");
  A.headless(true);
  const cars = g.G.cars, pIdx = cars.findIndex((c) => c.isPlayer);
  A.carRole(pIdx, { human: false });
  restorePace(pIdx);                // undo the detuning the pass tests above leave behind
  A.rivals([]);                     // everyone else 800 m back: this car drives alone
  A.go();
  const c = cars[pIdx], trk = g.G.track, T = g.sandbox.Tracks;
  const rows = []; const lap0 = c.lap;
  for (let f = 0; f < 60 * 200; f++) { A.step(DT, 1); if (c.lap > lap0 + 1) break; if (c.lap === lap0 + 1) rows.push({ s: c.s, x: c.x, k: T.curvature(trk, c.s) }); }
  A.headless(false);
  assert.ok(rows.length > 1000, `no full lap recorded (${rows.length} samples)`);
  const near = (s) => rows.reduce((b, r) => (Math.abs(r.s - s) < Math.abs(b.s - s) ? r : b), rows[0]);
  // The baked corners are the reference: for each corner longer than 40 m
  // check the approach (45 m before the turn-in) is on the OUTSIDE by 2 m and
  // the apex on the INSIDE by 3.5 m of a ~7 m half-width. Measured before the
  // line: approach +1..+3.6 m INSIDE, apex only +1.2 m inside.
  // A chicane's second half has no approach of its own (its turn-in is the
  // first half's exit, shared through the middle), so corners whose approach
  // point sits inside another corner's window are skipped.
  // JITTER (2026-09-08): the same lap trace scores how calm the driving is.
  // Reversals: sign changes of the lateral velocity with a 0.25 m/s hysteresis
  // (a wobble is a reversal, a sweep through a chicane is one). Jerk: RMS of
  // the lateral acceleration per frame. Baseline before the heading-state
  // controller is recorded in docs/notes/RACING-LINE-RESEARCH.md §7; the caps
  // hold the improved values so a regression to twitching reads here.
  const jit = laneJitter(rows, DT, trk.total);
  console.log(`[racecraft] monza solo lap: reversals/km=${jit.revPerKm.toFixed(1)} latJerkRms=${jit.jerkRms.toFixed(2)} m/s² samples=${rows.length}`);
  // Measured 2026-09-08: position P-loop 5.4 /km and 10.0 m/s²; heading-state
  // controller 4.7 /km and 5.9 m/s² (the reversals left are the chicanes and
  // sub-degree heading crossings at the lane/line hand-overs on the straights).
  assert.ok(jit.revPerKm <= 6.0, `steering reversals ${jit.revPerKm.toFixed(1)}/km — the AI is twitching again`);
  assert.ok(jit.jerkRms <= 7.5, `lateral acceleration RMS ${jit.jerkRms.toFixed(2)} m/s² — the AI is twitching again`);
  const all = trk.lineCorners;
  const big = all.filter((k) => k.len > 40 && !all.some((o) => o !== k && Math.abs(o.sApex - k.sApex) < 120));
  assert.ok(big.length >= 3, `monza should bake several long corners with a clear approach, got ${big.length}`);
  // The approach is a 30 m AVERAGE, not one sample. A lap of this simulation is
  // chaotic — the shared RNG stream advances through the tests above, so a
  // millimetre of line moves the car centimetres here — and a single sample at
  // s0-45 sat exactly on this threshold (-2.00 against < -2), flipping on
  // changes that leave the baked line identical to two decimal places
  // (track-line-circuits pins the LINE at this corner at -6.75 m). Averaging
  // the same quantity over the approach measures the same property with a
  // usable estimator; the threshold is unchanged.
  const win = (s0, s1, inside) => {
    const q = rows.filter((r) => r.s >= s0 && r.s <= s1);
    return q.length ? q.reduce((a, r) => a + r.x * inside, 0) / q.length : NaN;
  };
  for (const k of big) {
    const ap = win(k.s0 - 60, k.s0 - 30, k.inside), apex = near(k.sApex).x * k.inside;   // + = toward the inside
    assert.ok(ap < -2, `corner at s=${k.s0.toFixed(0)}: approach not outside (${ap.toFixed(2)} m toward the inside)`);
    assert.ok(apex > 3.5, `corner at s=${k.s0.toFixed(0)}: apex not inside (${apex.toFixed(2)} m)`);
  }
});

// THE RUBBER BAND IS OFF BY DEFAULT (scripted AI pace) AND, WHEN CATCH-UP IS
// ON, STILL OFF THE START LINE AND OFF A LAPPED CAR. Scripted mode (the ship
// default, Pure / Black Rock) keeps each AI on tierV × skill × DIFF.ai with
// no gap-to-player boost. Catch-up restores the legacy reverse-only vmax band
// against the leading human. `prog` is cumulative and the grid is laid out at
// -(14 + i*8), so P22 begins 182 m back — banding that into T1 is what Game AI
// Pro ch.42 names as exactly the wrong place. At the other end the gap clamps
// the band to full, so an easy car a lap down took HARD's corner authority.
// Both guards only ever REMOVE a boost. AI-only benches have no human, so the
// band never fires there either way.
test("scripted AI pace never rubber-bands; catch-up keeps start and lapping guards", async () => {
  const a = g.apex;
  await g.race("monza", "day", "dry");
  a.go();
  const ai = () => g.G.cars.filter((c) => !c.human);
  const banded = () => ai().filter((c) => (c._bandNow || 0) > 0).length;

  // Default is scripted: even past the old 8 s guard with a huge chase gap,
  // nothing bands.
  g.G.aiPace = "scripted";
  for (let i = 0; i < 60 * 12; i++) a.step(1 / 60, 1);
  assert.ok(g.G.raceT > 8, "past the catch-up start guard");
  const victim = ai()[0];
  victim.prog = g.G.player.prog - 600;
  a.step(1 / 60, 1);
  assert.equal(victim._bandNow || 0, 0, "scripted mode must not boost from the player's gap");
  assert.equal(banded(), 0, "no AI car may band under scripted pace");

  // Catch-up: start guard and lapping quiet; a real chase still bands.
  g.G.aiPace = "catchup";
  await g.race("monza", "day", "dry");
  a.go();
  for (let i = 0; i < 60; i++) a.step(1 / 60, 1);
  assert.equal(banded(), 0, `a car was banded ${g.G.raceT.toFixed(1)}s after green, off the grid`);
  for (let i = 0; i < 60 * 6; i++) a.step(1 / 60, 1);
  assert.ok(g.G.raceT < 8, "this leg must still be inside the 8 s start guard");
  assert.equal(banded(), 0, `a car was banded ${g.G.raceT.toFixed(1)}s after green`);

  for (let i = 0; i < 60 * 4; i++) a.step(1 / 60, 1);   // past the guard
  const v2 = ai()[0], L = g.G.track.total;
  v2.prog = g.G.player.prog - (L + 200);            // a full lap down
  a.step(1 / 60, 1);
  assert.equal(v2._bandNow || 0, 0, "a lapped car must not be handed the band's full clamp");

  v2.prog = g.G.player.prog - 600;                  // a real chase, well inside half a lap
  a.step(1 / 60, 1);
  assert.ok((v2._bandNow || 0) > 0, "catch-up must still work for a car the player is actually racing");
});

// NO OVERTAKING UNDER VSC OR SAFETY CAR (FIA 2026 Sporting Regs). 16217f3c1: the
// pass latch kept firing under a caution (17-24 places gained per minute of SC,
// measured then) — it now drops and cannot engage at level >= 2, and queue
// pressure (queueT) does not build there. 64610bfee added a second guard on the
// same latch (moveOn / the end-of-step drop), so reverting 16217f3c1 alone keeps
// the latch shut and this test fails on queueT instead (38 s); revert the latch
// guards of both and it fails on the latch (7333 car-steps).
// AND THE RUNNING ORDER HOLDS (RaceControl.holdCap, 2026-09-29). With only the
// latch fixes, clean passes in one minute of VSC were 5-30 and of SC 0-12 —
// cars on different lines drove past each other, no latch involved. Counted
// here: a car moving ahead of one that is running normally (not near-stopped,
// off the road, pitting or being rescued — the cars the regs let you pass),
// after 2 s for any move already alongside when the flag came out to finish.
test("under VSC and safety car no pass latch engages and no queue pressure builds", async () => {
  const A = g.apex;
  const GREEN_S = 25, FLAG_S = 60;
  for (const level of [2, 3]) {
    await g.race("monza", "day", "dry");
    A.headless(true);
    const cars = g.G.cars;
    A.carRole(cars.findIndex((c) => c.isPlayer), { human: false });
    restorePace(cars.findIndex((c) => c.isPlayer));
    A.go();
    let greenLatched = 0, greenQ = 0;
    for (let i = 0; i < Math.round(GREEN_S / DT); i++) {
      A.step(DT, 1);
      for (const c of cars) { if (c.passOf) greenLatched++; greenQ = Math.max(greenQ, c.queueT || 0); }
    }
    g.G.holdCaution(level, "test");
    A.step(DT, 1);
    try {
      assert.equal(A.caution().level, level, "the held flag is flying");
      let latched = 0, maxQ = 0;
      const passes = [];
      const healthy = (o) => !(o.retired || o.finished || o.offroad || (o.speed || 0) < 5 || (o.rescueT || 0) > 0.25
        || (o.pitState && o.pitState !== "none"));
      let order = cars.slice().sort((a, b) => b.prog - a.prog);
      for (let i = 0; i < Math.round(FLAG_S / DT); i++) {
        A.step(DT, 1);
        for (const c of cars) {
          if (c.passOf) latched++;
          if (i * DT > 10) maxQ = Math.max(maxQ, c.queueT || 0);   // green-phase queueT has bled out by then (2 s per s)
        }
        const now = cars.slice().sort((a, b) => b.prog - a.prog);
        if (i * DT > 2) now.forEach((c, k) => {
          const was = order.indexOf(c);
          if (was > k && healthy(order[k])) passes.push(`${(i * DT).toFixed(1)}s ${c.code}>${order[k].code}`);
        });
        order = now;
      }
      assert.equal(A.caution().level, level, "the flag flew the whole window");
      // Anti-vacuity: the same field DOES latch passes and queue under green.
      assert.ok(greenLatched > 0, "no pass latch engaged in the green phase either — the check below proves nothing");
      assert.ok(greenQ > 0, "no queue pressure built in the green phase either — the check below proves nothing");
      assert.equal(latched, 0, `level ${level}: a pass latch was held for ${latched} car-steps under the caution`);
      assert.equal(maxQ, 0, `level ${level}: queue pressure built to ${maxQ.toFixed(2)} s under the caution`);
      assert.deepEqual(passes, [], `level ${level}: cars overtook under the caution`);
    } finally {
      g.G.holdCaution(0);
      A.headless(false);
    }
  }
});

// ONE YIELDER ALONGSIDE THE PLAYER (2026-10-01). The rule elects the car behind
// to concede — here the PLAYER, a few metres back, who runs no yield protocol
// and holds a lane inside the AI's clear gap. The AI merely HOLDING its line
// was never armed to concede (only an AI steering INTO the player was), so the
// pair sat inside the gap with nobody yielding: ai-tactics --mode human
// measured contact in 11-22 % of alongside frames. A held line now arms the
// grace at a quarter rate (AiDrive.humanYieldT), so the AI opens the gap.
test("an AI alongside a player who will not yield opens the gap itself", async () => {
  const A = g.apex;
  await g.race("monza");
  A.reset(0, 45, -1.2);
  A.headless(true);
  A.go();
  const r = A.rivals([{ dProg: 3.2, dx: 2.2, speed: 45 }])[0];
  const c = g.G.cars[r], p = g.G.player;
  const lane0 = { lane: c.lane, lanePref: c.lanePref };
  c.lane = c.lanePref = c.x / (g.G.track.hw[0] - 1.2);   // its own lane is inside the gap
  A.act({ steer: 0, throttle: true, brake: false }, DT, 1);
  const tierV0 = c.tierV;
  c.tierV *= 45.5 / c._vmaxNow;                            // the player's pace, so the pair stays alongside
  const steer = () => { const q = A.probe(); return Math.max(-1, Math.min(1, 2.2 * (Math.atan2(-1.2 - q.x, 20) - q.angle))); };
  let insideT = 0, alongT = 0, lateMin = Infinity;
  try {
    for (let i = 0; i < 4 / DT; i++) {
      const dp = c.prog - p.prog;   // the player holds x = -1.2 and keeps station 3 m behind
      A.act({ steer: steer(), throttle: dp > 3.2, brake: dp < 1.5 }, DT, 1);
      const dx = Math.abs(c.x - p.x);
      if (Math.abs(c.prog - p.prog) < 5.5) {
        alongT += DT;
        if (dx < CLEAR - 0.3) insideT += DT;
        if (i * DT > 1.5) lateMin = Math.min(lateMin, dx);
      }
    }
  } finally { c.tierV = tierV0; c.lane = lane0.lane; c.lanePref = lane0.lanePref; A.headless(false); }
  assert.ok(alongT > 3.5, `the pair was not kept alongside (${alongT.toFixed(1)} s) — wrong scenario`);
  // Measured before: 2.5 s inside the gap with nobody yielding, then a concession
  // that was dropped at the gap and re-armed. After: conceded inside ~0.6 s, held.
  assert.ok(insideT < 1.2, `nobody yielded for ${insideT.toFixed(2)} s inside the clear gap`);
  assert.ok(lateMin >= CLEAR - 0.3, `the concession was not held: dx fell to ${lateMin.toFixed(2)} m`);
});

// A PASS STICKS (2026-10-01). Two AI cars 5 % apart on pace (the faster the
// same car as the slower, 5 % up), the faster 12 m behind on the run to the
// Curva Grande. It completes the pass (a car length and a half clear), and the
// passed car does not take the place straight back: the re-pass lockout
// (AiDrive.repassLock) on any order flip, with the passer as its blocker across
// the lane until it ends. 42-61 % of the field's flips were the same pair
// swapping back before (ai-tactics swapBackPct).
test("a faster AI completes a pass and the pair does not swap back", async () => {
  // Its own boot: a pass is chaotic in the shared stream and the field state
  // the tests above leave behind (measured: the same scenario passes alone and
  // never completes after the racing-line lap).
  const g2 = await createGame({ track: "monza" });
  try {
    const A = g2.apex;
    await g2.race("monza");
    A.headless(true);
    A.reset(0.62, 60, 0);
    const pIdx = A.cars().findIndex((x) => x.p);
    A.carRole(pIdx, { human: false });
    const pc = g2.G.cars[pIdx];
    const idx = A.rival(-12, 0).rival;
    A.go();
    const c = g2.G.cars[idx];
    c.tierV = pc.tierV; c.skill = pc.skill;   // the same car...
    pc.tierV *= 0.95;                         // ...5 % up on the one ahead
    let doneAt = null, regained = null;
    for (let i = 0; i < 50 / DT; i++) {
      A.step(DT, 1);
      const dp = c.prog - pc.prog, t = i * DT;
      if (doneAt == null && dp > LCAR + 1.5) doneAt = t;
      if (doneAt != null && regained == null && t < doneAt + 15 && dp < 0) regained = t;
    }
    assert.ok(doneAt != null && doneAt < 35, `the faster car never completed the pass (${doneAt})`);
    assert.equal(regained, null, `passed at ${doneAt && doneAt.toFixed(1)} s and swapped back at ${regained && regained.toFixed(1)} s`);
  } finally { g2.close(); }
});

// 02-F1 (hunt2): a NETWORK-OWNED human returns from updateCar before the _vmaxNow stamp (and paceF / axEstSm), so
// paceVmax(remote) was 0 and every AI judged him as having no pace. Model "never stamped" on a second game's player
// (a human whose _vmaxNow is a no-op property), park it, and read the blockerVmax the AIs behind it are handed.
test("a human whose pace is never stamped (a net-owned rival) still has a pace: paceVmax > 0", async () => {
  const g2 = await createGame({ track: "monza" });
  try {
    await g2.race("monza"); g2.apex.go(); g2.apex.headless(true);
    const p = g2.G.player;
    Object.defineProperty(p, "_vmaxNow", { get() { return undefined; }, set() {}, configurable: true });
    const AD = vm.runInContext("AiDrive", g2.ctx), seen = [], orig = AD.otWant;
    AD.otWant = function (o) { if (o.other === p) seen.push(o.blockerVmax); return orig.apply(this, arguments); };
    g2.step(900);
    assert.ok(seen.length > 20, "AIs came up behind the parked human and judged him as a blocker: " + seen.length);
    assert.ok(seen.every((v) => v > 0), "blockerVmax = paceVmax(remote human) is never 0: min " + Math.min(...seen));
  } finally { g2.close(); }
});
