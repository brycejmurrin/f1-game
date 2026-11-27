/* drill-rain-vm.test.mjs — the Wet Weather Lines drill (#6559 step 15, #6551 §5) in the real game VM.
 * 1. THE HELD-WETNESS HOOK (#6551 left it unproven). A drill holds the road at one wetness with the EXISTING
 *    G.weatherArc setter: a lap-wide arc whose w0 is the hold and whose dur is a billion seconds, so its lag never
 *    moves the road by more than ~1e-8 a minute. No WeatherArc code changes for the hold; the arc is an ordinary live
 *    arc, so its dry groove (the surface channel, docs/PHYSICS.md) acts on every car, and quitToMenu's endSession()
 *    clears it. Pinned here: the hold holds over 120 s of driving, the groove changes the player's grip, quit clears it.
 *
 * Run: node --test tests/unit/drill-rain-vm.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const { createGame } = createRequire(import.meta.url)("../../tools/lib/game-vm.cjs");

const plain = (v) => JSON.parse(JSON.stringify(v));   // VM-realm objects compare by value
const HOLD = 0.18;   // below bestTread's slick→inter crossover (0.20, WET_GRIP): the field stays on slicks, on a drying road
const held = () => ({ from: "wet", to: "wet", w0: HOLD, i0: 0.5, seq: ["wet"], wetIn: null, t: 0, dur: 1e9 });

test("held-wetness hook: G.weatherArc holds the road, its groove reaches grip, quit clears it", { timeout: 240000 }, async () => {
  const g = await createGame({ carMeshes: false });
  try {
    const G = g.G;
    await g.apex.race("monza", "default", "dry", { laps: 1 });
    assert.ok((await g.stepUntil(() => G.state === "race", { maxSteps: 2000 })).ok, "the race never started");
    assert.equal(G.trackWetness(), 0, "a dry race: no arc, a dry road");
    G.weatherArc = held();
    g.apex.headless(true);
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < 120 * 60; i++) {
      g.apex.act({ throttle: true, brake: false, steer: 0 }, 1 / 60, 1);
      const w = G.trackWetness();
      lo = Math.min(lo, w); hi = Math.max(hi, w);
    }
    assert.ok(Math.abs(lo - HOLD) < 1e-6 && Math.abs(hi - HOLD) < 1e-6, `the hold drifted: ${lo}..${hi}`);
    assert.ok(G.weatherArc, "a held arc never settles");
    // The groove is lateral surface state: the same car, two offsets, two grips (read-only through G.gripMult).
    const p = G.player, x0 = p.x, grips = [];
    for (let x = -6; x <= 6; x += 0.5) { p.x = x; grips.push(G.gripMult(p)); }
    p.x = x0;
    const spread = Math.max(...grips) - Math.min(...grips);
    assert.ok(spread > 0.02, "the dry groove changes the player's grip across the road: spread " + spread);
    G.quitToMenu();
    assert.equal(G.weatherArc, null, "quitToMenu's endSession() clears the held arc");
    assert.equal(G.trackWetness(), 0, "the player's dry weather is back");
  } finally { g.close(); }
});

/* 2. THE DRILL, through game.js's own host (__apex.drillLaunch): a solo Monza sector 3 on a held 0.18 road. A
 *    test-side pure-pursuit driver aims at the centreline a speed-scaled distance ahead, plus a lateral term toward
 *    a target offset (the groove, or the centreline). RETRY between runs, one boot, one seed.
 *    Writer: WRITE_REFS=1 node --test tests/unit/drill-rain-vm.test.mjs re-runs the calibration into
 *    tests/data/learn-drill-refs.json ("rain"); without it the test pins the refs and the drill's MEDALS. */
const REFS = fileURLToPath(new URL("../data/learn-drill-refs.json", import.meta.url));
const DRIVERS = [["groove", 0], ["centre", 0], ["groove", 1], ["groove", -1], ["groove", 2], ["groove", -2],
  ["groove", 3], ["groove", -3], ["groove", 4], ["groove", -4]];

async function rainDrill() {
  const g = await createGame({ carMeshes: false });
  const G = g.G;
  const launched = await g.apex.drillLaunch("rain");
  assert.equal(launched.ok, true, JSON.stringify(launched));
  assert.ok((await g.stepUntil(() => G.state === "race" && g.apex.drillState().staging === false, { maxSteps: 2000 })).ok,
    "the drill race never started: " + JSON.stringify(g.apex.drillState()));
  g.apex.headless(true);
  const Tracks = vm.runInContext("Tracks", g.ctx), WA = vm.runInContext("WeatherArc", g.ctx);
  const smp = { p: [0, 0, 0], t: [0, 0, 1], r: [1, 0, 0], hw: 7 };
  /** Test-side driver only. Positive steer is a right turn; the lateral term pulls toward the target offset. */
  const pursue = (mode, off) => {
    const p = G.player, L = G.track.total, look = Math.max(15, p.speed * 0.9), at = (p.s + look) % L;
    Tracks.sample(G.track, at, smp);
    let err = Math.atan2(smp.p[0] - p.px, smp.p[2] - p.pz) - p.head;
    while (err > Math.PI) err -= 2 * Math.PI;
    while (err < -Math.PI) err += 2 * Math.PI;
    const tx = (mode === "groove" ? WA.grooveX(at / L) : 0) + off;
    return { steer: Math.max(-1, Math.min(1, -err * 2.5 + 0.08 * (tx - p.x))), throttle: p.speed < 34, brake: p.speed > 37 };
  };
  const host = G.drills();
  function drive(mode, off) {
    const before = host.lastResult();
    for (let i = 0; i < 60 * 120; i++) {
      g.apex.act(pursue(mode, off), 1 / 60, 1);
      const r = host.lastResult();
      if (r && r !== before) return r;
    }
    return null;
  }
  return { g, G, host, drive, retry: () => assert.equal(host.retry(), true, "RETRY refused") };
}

const round2 = (v) => Math.round(v * 100) / 100;
/** The documented rule: bronze = the centreline driver's share (just driving the middle of the road), gold = the
 *  on-groove driver's share less 5 points (a thumb cannot track a hashed wander as a script does), silver = halfway.
 *  Whole percent, floored. */
function deriveRainTiers(runs) {
  const at = (mode, off) => runs.find((r) => r.mode === mode && r.off === off).share;
  const bronze = Math.floor(at("centre", 0)), gold = Math.floor(at("groove", 0) - 5);
  return { bronze, silver: Math.floor((bronze + gold) / 2), gold, goldClean: true };
}

test("Wet Weather Lines: deterministic score and medal over two runs on one seed, tiers from the VM rollouts", { timeout: 600000 }, async () => {
  const run = await rainDrill();
  try {
    const { G } = run;
    assert.equal(G.cars.length, 2, "a solo run: the rival is half a lap away");
    assert.ok(Math.abs(G.trackWetness() - 0.18) < 1e-6, "begin() held the road at 0.18: " + G.trackWetness());
    assert.equal(G.coach.practiceGoal(), "groove");
    const runs = [];
    const drivers = process.env.WRITE_REFS ? DRIVERS : DRIVERS.slice(0, 2);
    for (const [k, [mode, off]] of drivers.entries()) {
      if (k) run.retry();
      const r = run.drive(mode, off);
      assert.ok(r, `no finish for ${mode} ${off}`);
      runs.push({ mode, off, share: round2(r.value), seconds: +r.metrics[1][1], clean: r.clean, medal: r.medal });
    }
    // Two runs on one seed: RETRY to the begin() checkpoint and drive the groove again, the same score and medal.
    run.retry();
    const again = run.drive("groove", 0);
    assert.equal(round2(again.value), runs[0].share, "the same driver on the same seed scores the same share");
    assert.equal(again.medal, runs[0].medal);
    assert.ok(runs[0].clean && runs[0].share > runs[1].share, "the groove driver beats the centreline driver: " + JSON.stringify(runs));
    const medals = plain(vm.runInContext("RainDrill.MEDALS", run.g.ctx));
    if (process.env.WRITE_REFS) {
      const refs = JSON.parse(readFileSync(REFS, "utf8"));
      refs.rain = {
        how: "WRITE_REFS=1 node --test tests/unit/drill-rain-vm.test.mjs: 10 runs of the Monza sector-3 Wet Weather Lines drill (road held at 0.18, slicks), one boot, RETRY between runs, a pure-pursuit driver at 34-37 m/s aimed at the groove offset by 0, ±1..±4 m, and one at the centreline",
        metric: "% of the sector's frames with WeatherArc.dryLine >= 0.5 under the car (js/learn-drills/rain-groove.js score)",
        rule: "bronze = the centreline driver's share; gold = the on-groove driver's share - 5; silver = halfway; whole %, floored; gold needs a clean run",
        runs,
        tiers: deriveRainTiers(runs),
      };
      writeFileSync(REFS, JSON.stringify(refs, null, 2) + "\n");
      return;
    }
    const ref = JSON.parse(readFileSync(REFS, "utf8")).rain;
    for (const r of runs) {
      const want = ref.runs.find((x) => x.mode === r.mode && x.off === r.off);
      assert.equal(r.share, want.share, `${r.mode} ${r.off}: the calibration run reproduces its ref`);
    }
    assert.deepEqual(deriveRainTiers(ref.runs), ref.tiers, "the ref tiers follow the documented rule");
    assert.deepEqual(medals, ref.tiers, "RainDrill.MEDALS are the ref tiers");
  } finally { run.g.close(); }
});
