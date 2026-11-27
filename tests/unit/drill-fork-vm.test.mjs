/* drill-fork-vm.test.mjs — DrillFork (js/race/drill-fork.js, #6559 step B2) on the REAL game in the Node VM.
 *
 * The strategy drills (epic #6559 steps 16-18) answer "what if I had boxed?" by running that race, so the three
 * promises the epic's B2 row names are pinned here:
 *   1. a branch re-run is BYTE-IDENTICAL at +3 laps (the card's numbers are reproducible, not one roll of the dice);
 *   2. a CULLED field differs from the full field by less than twice the spread of 6 draws (the base stream and 5
 *      neighbouring seeds; Bryce's `decision: A`, #7169 comment 7210172460): the phone-speed shortcut changes nothing
 *      the drill can measure beyond the race's own randomness;
 *   3. the LIVE world is restored after a branch: every primitive of all 22 cars, the clock and the seeded stream
 *      position, so the race that continues is the one that would have continued with no branch at all.
 * Plus: the time slice decides only how many ticks run per call (a step(job, 0) loop equals one run()), and a
 * decision goes through the production pit API (the boxed car makes its stop, the one told to stay does not).
 *
 * The player sits on SoakRun's autopilot law (decision 3: the car runs on an AI-style driver while you make the
 * calls); SoakRun is LAZY_PERF, loaded here the way drive-to-box-vm.test.mjs loads it.
 *
 * Run: node --test tests/unit/drill-fork-vm.test.mjs   (~90 s, one boot)
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { absSrc } from "../helpers/abs-src.mjs";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");
const src = (p) => readFileSync(new URL("../../" + p, import.meta.url), "utf8");

const TRACK = "redbull";   // the shortest lap on the calendar: a 3-lap horizon at the least CI time
let g = null, DF = null, SR = null;
before(async () => {
  g = await createGame({ track: TRACK });
  await g.race(TRACK, "day", "dry", { laps: 10 });
  for (const p of ["js/perf/soak-run.js", "js/race/drill-fork.js"]) vm.runInContext(src(p), g.ctx, { filename: absSrc(p) });
  SR = vm.runInContext("SoakRun", g.ctx);
  SR.create(g.G);
  DF = vm.runInContext("DrillFork", g.ctx).create(g.G);
});
after(() => { if (g) g.close(); });

const autopilot = () => SR.policy("autopilot", {});
const opts = (cull) => ({ cull, drive: autopilot });
const TIGHT = { pitLossS: 0, marginS: 4 };   // a cull that really removes cars at a 40 s fork

/** The race 40 s in: the field has spread, so a cull has cars to remove. */
function forkAt40() {
  const A = g.apex;
  A.headless(true);
  try { A.tyres({ level: "real" }); A.reset(0.02, 55, 0, 42); } finally { A.headless(false); }   // wear on: the lane opens
  const r = A.rollout({ seconds: 40, policy: "autopilot" });
  assert.ok(r && r.ran && r.ran.seconds > 39, "the lead-in drove: " + JSON.stringify(r).slice(0, 200));
  return DF.fork();
}
/** Every primitive field of every car, unrounded (the determinism-replay-vm digest), plus clock and stream.
 *  `anchors: false` drops the render-interpolation anchors (rPrev*, _prevS), which SimState's restore re-seats
 *  to the restored pose ON PURPOSE (no streak across the jump); the continued race below compares them too. */
const ANCHOR = /^(rPrev|_prevS$)/;
function fullSnap(anchors = true) {
  const cars = g.G.cars.map((c, id) => {
    const o = { id };
    for (const k of Object.keys(c)) {
      const v = c[k];
      if ((typeof v === "number" || typeof v === "boolean" || typeof v === "string") && (anchors || !ANCHOR.test(k))) o[k] = v;
    }
    return o;
  });
  return { raceT: g.G.raceT, rng: g.G.simSeed(undefined, true), seed: g.G.simSeed(), cars };
}
function firstDiff(a, b) {
  if (!Object.is(a.raceT, b.raceT)) return "raceT " + a.raceT + " vs " + b.raceT;
  if (!Object.is(a.rng, b.rng)) return "rng " + a.rng + " vs " + b.rng;
  for (let c = 0; c < a.cars.length; c++) for (const k of new Set([...Object.keys(a.cars[c]), ...Object.keys(b.cars[c])])) {
    if (!Object.is(a.cars[c][k], b.cars[c][k])) return `car ${a.cars[c].code || c} .${k}: ${a.cars[c][k]} vs ${b.cars[c][k]}`;
  }
  return null;
}

test("the coach exposes the rewind's own snapshot, and DrillFork reads through it", () => {
  assert.equal(typeof g.G.coach.captureWorld, "function");
  assert.equal(typeof g.G.coach.restoreWorld, "function");
  const F = forkAt40();
  assert.ok(F.world && F.world.parts && F.world.parts.cars && F.world.parts.rng, "a fork holds the SimState world, rng part included");
  assert.equal(F.cars, 22);
  assert.ok(Number.isFinite(F.rng) && Number.isFinite(F.seed), "the stream position is recorded");
  assert.throws(() => DF.branch(F, [{ car: 1, action: "fly", lap: 0 }], { laps: 1 }), /decisions/);
  assert.throws(() => DF.branch(F, [], {}), /until/);
});

test("the live world is restored after a branch: the race goes on exactly as if no branch had run", () => {
  const A = g.apex;
  forkAt40();
  const before = fullSnap(false);
  A.rollout({ seconds: 10, policy: "autopilot" });
  const plain = fullSnap();

  forkAt40();
  const again = fullSnap(false);
  assert.equal(firstDiff(before, again), null, "the 40 s lead-in itself must replay");
  const F = DF.fork();
  const job = DF.run(DF.branch(F, [{ car: 3, lap: 0, action: "box" }], { seconds: 20 }, opts(TIGHT)));
  assert.equal(job.state, "done", "the branch ran: " + job.error);
  assert.ok(job.result.culled.length > 0, "the cull removed cars inside the branch");
  assert.equal(firstDiff(before, fullSnap(false)), null, "after the branch the live world differs from the fork");
  assert.equal(g.G._testInput, null, "the branch hands the input seam back");
  A.rollout({ seconds: 10, policy: "autopilot" });
  assert.equal(firstDiff(plain, fullSnap()), null, "the live race after a branch diverged from the race with none");
});

test("a branch re-run is byte-identical at +3 laps, and a box decision goes through the pit API", () => {
  const F = forkAt40();
  const ai = g.G.cars.findIndex((c) => !c.isPlayer && !c.retired);
  const boxA = [{ car: ai, lap: 0, action: "box" }];
  const a = DF.run(DF.branch(F, boxA, { laps: 3 }, opts(TIGHT)));
  const b = DF.run(DF.branch(F, boxA, { laps: 3 }, opts(TIGHT)));
  assert.equal(a.state, "done", "branch A ran: " + a.error);
  assert.equal(a.result.reason, "laps");
  const p = a.result.cars.find((c) => c.isPlayer);
  assert.equal(p.lapTimes.length, 3, "the player completed the 3-lap horizon");
  assert.equal(JSON.stringify(b.result), JSON.stringify(a.result), "the re-run of branch A differs");
  const stay = DF.run(DF.branch(F, [{ car: ai, lap: 0, action: "stay" }], { laps: 3 }, opts(TIGHT)));
  const boxed = a.result.cars[ai], stayed = stay.result.cars[ai];
  assert.ok(!a.result.culled.includes(ai), "the decided car is never culled");
  assert.equal(boxed.stops, 1, "the boxed car made its stop");
  assert.equal(stayed.stops, 0, "the car told to stay did not stop");
  assert.notEqual(JSON.stringify(boxed.lapTimes), JSON.stringify(stayed.lapTimes), "boxing changed its laps");
});

test("time slicing changes only the ticks per call: step(job, 0) one tick at a time equals one run()", () => {
  const F = forkAt40();
  const whole = DF.run(DF.branch(F, [], { seconds: 3 }, opts(null)));
  const sliced = DF.branch(F, [], { seconds: 3 }, opts(null));
  let calls = 0;
  while (!DF.step(sliced, 0)) calls++;
  assert.ok(calls > 100, "a zero budget runs one tick per call (" + calls + " calls)");
  assert.equal(sliced.state, "done", sliced.error);
  assert.equal(JSON.stringify(sliced.result), JSON.stringify(whole.result), "slicing changed the branch");
});

test("a culled field differs from the full field by less than noise()", () => {
  const F = forkAt40();
  const until = { laps: 1 };
  const full = DF.run(DF.branch(F, [], until, opts(null)));
  const culled = DF.run(DF.branch(F, [], until, opts(TIGHT)));
  assert.equal(full.state, "done", full.error);
  assert.equal(culled.state, "done", culled.error);
  assert.ok(culled.result.culled.length >= 5, "the cull removed cars (" + culled.result.culled.length + ")");
  assert.equal(full.result.culled.length, 0);
  const n = DF.noise(F, [], until, opts(null), 3);
  assert.ok(n >= 1 / 60, "noise() is floored at one tick");
  // Bryce's `decision: A` (#7169, comment 7210172460). A culled field consumes the random stream
  // differently, so the culled run is one more draw, and culled-vs-full is a DIFFERENCE OF TWO draws. The yardstick is
  // therefore the spread of the base stream plus 5 neighbouring seeds (the same seeds noise() steps through), doubled
  // for the difference of two draws. After #6575 (the AI chaser lane) one seed moves the player by ~0.15-0.2 s on
  // redbull, which a 3-seed range alone underestimates (culled 0.200 s vs noise 0.150 s on e8d7088b).
  const draws = [full.result.player.timeS];
  for (let j = 1; j <= 5; j++) {
    const nb = DF.run(DF.branch(F, [], until, Object.assign({}, opts(null), { seed: ((F.seed + j * 7919) >>> 0) || 1 })));
    assert.equal(nb.state, "done", nb.error);
    draws.push(nb.result.player.timeS);
  }
  const spread = Math.max(...draws) - Math.min(...draws);
  const d = Math.abs(culled.result.player.timeS - full.result.player.timeS);
  assert.ok(d < 2 * Math.max(n, spread), `culled vs full: ${d.toFixed(3)} s, 2 x spread of 6 draws ${(2 * Math.max(n, spread)).toFixed(3)} s`);
});

test("a branch that throws, at its start or mid-run, and a cancelled one, all hand the live world back", () => {
  const F = forkAt40();
  const before = fullSnap(false), input = g.G._testInput, headless = g.G.headlessMode;
  const back = (label) => {
    assert.equal(firstDiff(before, fullSnap(false)), null, label + ": the live world was not restored");
    assert.equal(g.G._testInput, input, label + ": the input seam");
    assert.equal(g.G.headlessMode, headless, label + ": headless mode");
  };
  const atStart = DF.branch(F, [], { seconds: 2 }, { drive: () => { throw new Error("factory"); } });
  assert.equal(DF.step(atStart, 5), true);
  assert.equal(atStart.state, "failed");
  assert.equal(atStart.error, "factory", "the factory's own error is reported");
  back("a throw before the first tick");
  let n = 0;
  const midRun = DF.branch(F, [], { seconds: 2 }, { drive: () => ({ step: () => { if (++n > 30) throw new Error("policy"); return null; } }) });
  DF.run(midRun);
  assert.equal(midRun.state, "failed");
  assert.ok(midRun.ticks >= 30, "it ran before it threw");
  back("a throw mid-run");
  const cut = DF.branch(F, [], { seconds: 5 }, { cull: { keep: [99], pitLossS: 0, marginS: 4 } });   // 99: not a car, ignored
  for (let i = 0; i < 20; i++) DF.step(cut, 0);
  assert.equal(cut.state, "running");
  assert.ok(DF.cancel(cut));
  assert.equal(cut.state, "cancelled");
  back("cancel()");
});

test("a culled car is marked culled, not retired, and the decision outcome is reported", () => {
  const F = forkAt40();
  const ai = g.G.cars.findIndex((c) => !c.isPlayer && !c.retired);
  const job = DF.run(DF.branch(F, [{ car: ai, lap: 0, action: "box" }], { seconds: 5 }, opts(TIGHT)));
  assert.equal(job.state, "done", job.error);
  const culled = job.result.cars.filter((c) => c.culled);
  assert.ok(culled.length > 0, "the cull removed cars");
  assert.ok(culled.every((c) => !c.retired), "a culled car is not reported as a retirement");
  assert.deepEqual(job.result.decisions.map((d) => d && d.armed), [true], "the pit API armed the stop");
});
