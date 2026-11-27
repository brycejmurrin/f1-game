/* taper-drill-vm.mjs — LEARN's Taper Hunt (js/learn-drills/taper.js) in the real game VM, through DrillRegistry's own
 * host, as tests/helpers/learn-drill-vm.mjs drives the Aero drill (#6559 step 6, #6550 D1).
 *
 *   const run = await taperDrill();   // boot, launch, begin
 *   const r = run.drive(pressAt);     // flat out, BOOST pressed once pressAt s after the start (null: never)
 *   run.retry();                      // RETRY: back to the begin() checkpoint
 *
 * Writer: `node tests/helpers/taper-drill-vm.mjs --write` re-runs the PRESS_AT calibration runs into
 * tests/data/learn-drill-refs.json "taper" (tiers by deriveTaperTiers below). */
import { readFileSync, writeFileSync } from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = fileURLToPath(new URL("../../", import.meta.url));
export const REFS = ROOT + "tests/data/learn-drill-refs.json";
/** BOOST press times, seconds after the start: early to late down the 400 m straight. */
export const PRESS_AT = Array.from({ length: 10 }, (_, k) => +(k * 0.5).toFixed(1));

const floor1 = (v) => Math.floor(v * 10 + 1e-9) / 10;
/** The documented rule, over the CLEAN runs (store spent, flat to the gate): gold = the least speed bought among the
 *  runs with the best straight time, silver = their median, bronze = their lowest. Floored to 0.1 km/h. */
export function deriveTaperTiers(runs) {
  const clean = runs.filter((r) => r.clean);
  const fastest = Math.min(...clean.map((r) => r.seconds));
  const v = clean.map((r) => r.bought).sort((a, b) => a - b), mid = v.length / 2;
  const median = v.length % 2 ? v[Math.floor(mid)] : (v[mid - 1] + v[mid]) / 2;
  const gold = Math.min(...clean.filter((r) => r.seconds === fastest).map((r) => r.bought));
  return { bronze: floor1(v[0]), silver: floor1(median), gold: floor1(gold), goldClean: true };
}

export async function taperDrill() {
  const { createGame } = require(ROOT + "tools/lib/game-vm.cjs");
  const g = await createGame({});
  for (const rel of ["js/learn-drills/registry.js", "js/learn-drills/drill-card.js", "js/learn-drills/taper.js"]) {
    vm.runInContext(readFileSync(ROOT + rel, "utf8"), g.ctx, { filename: ROOT + rel });
  }
  const G = g.G;
  const reopened = [];
  const host = vm.runInContext("DrillRegistry", g.ctx).create(G, {
    retry: () => G.coach.retry(),
    setDirtyAir: () => {},
    insights: () => G.coach.insights,
    reopenLesson: (lesson, payload) => reopened.push({ lesson, payload }),
  });
  if (!host.launch("taper")) throw new Error("taper-drill-vm: launch refused");
  if (!(await g.settle(() => G.state === "count", 6000))) throw new Error("taper-drill-vm: no countdown");
  if (!G.practice && !G.coach.armPractice()) throw new Error("taper-drill-vm: practice refused");   // a Time Trial is practice already
  if (!host.begin()) throw new Error("taper-drill-vm: begin() could not place the car");
  g.apex.headless(true);
  /** One run: full throttle, no steering, BOOST pressed once at pressAt s (null: never). The host's result, or null. */
  function drive(pressAt, maxS = 30) {
    const frame = pressAt == null ? -1 : Math.round(pressAt * 60);
    for (let i = 0; i < 60 * maxS; i++) {
      if (i === frame) g.apex.setBoost(true);
      g.apex.act({ throttle: true, brake: false, steer: 0 }, 1 / 60, 1);
      const r = host.tick();
      if (r) return r;
    }
    return null;
  }
  return { g, G, host, reopened, drive, retry: () => host.retry(), close: () => g.close() };
}

/** The calibration runs, one boot, RETRY between them. */
export async function calibrate() {
  const run = await taperDrill();
  const runs = [];
  try {
    // A warm-up run first: the boot's first run ends one frame later than every RETRY run from the same visible state
    // (hidden state begin() does not set, the #6559 B1 reset-leak class), so every calibration run starts from RETRY.
    if (!run.drive(null) ) throw new Error("no finish on the warm-up run");
    for (const pressAt of PRESS_AT) {
      if (!run.retry()) throw new Error("retry refused before the run pressing at " + pressAt);
      const r = run.drive(pressAt);
      if (!r) throw new Error("no finish pressing at " + pressAt + " s");
      runs.push({ pressAt, bought: r.value, seconds: r.straightS, clean: r.clean, reason: r.reason });
    }
  } finally { run.close(); }
  return runs;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const runs = await calibrate();
  if (!process.argv.includes("--write")) { console.log(JSON.stringify(runs, null, 1)); process.exit(0); }
  const refs = JSON.parse(readFileSync(REFS, "utf8"));
  refs.taper = {
    how: "node tests/helpers/taper-drill-vm.mjs --write: 10 runs of the Monza Taper Hunt (20 m past the line at 0.42 vTop, 1.0 Apex MJ store, 400 m to the gate), one boot, a warm-up run, then RETRY before each run, full throttle, no steering, BOOST pressed once at 0.0 to 4.5 s",
    metric: "speed bought = 3.6 x the integral of DEPLOY_A x taper while deploying, dash km/h (js/learn-drills/taper.js score); straight time from RaceInsights' taper goal",
    rule: "over the clean runs: gold = the least speed bought among the fastest runs; silver = their median; bronze = their lowest; floored to 0.1 km/h",
    runs,
    tiers: deriveTaperTiers(runs),
  };
  writeFileSync(REFS, JSON.stringify(refs, null, 2) + "\n");
  console.log(JSON.stringify(refs.taper.tiers));
}
