/* harvest-drill-vm.mjs — LEARN's Harvest Stop (js/learn-drills/harvest.js) in the real game VM, through DrillRegistry's
 * own host, as tests/helpers/taper-drill-vm.mjs drives the Taper Hunt (#6559 step 11, #6550 D3a).
 *
 *   const run = await harvestDrill();   // boot, launch, begin
 *   const r = run.drive(brakeAt);       // flat out, then the brake held from brakeAt s after the start (null: never)
 *   run.retry();                        // RETRY: back to the begin() checkpoint
 *
 * Writer: `node tests/helpers/harvest-drill-vm.mjs --write` sweeps the brake point frame by frame, finds the run that
 * stops nearest the marker, and writes the runs braking 0, ±SLIP frames off it into tests/data/learn-drill-refs.json
 * "harvest" (tiers by deriveHarvestTiers below). */
import { readFileSync, writeFileSync } from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = fileURLToPath(new URL("../../", import.meta.url));
export const REFS = ROOT + "tests/data/learn-drill-refs.json";
/** Timing slips (frames at 60 Hz) the tiers are measured at: gold a tenth of a second, silver a quarter, bronze half. */
export const SLIP = Object.freeze({ gold: 6, silver: 15, bronze: 30 });

const floor1 = (v) => Math.floor(v * 10 + 1e-9) / 10;
/** The documented rule: each tier is the WORSE accuracy of the two runs that brake that many frames early and late
 *  of the best brake point (the run nearest the marker), floored to 0.1 %. */
export function deriveHarvestTiers(runs) {
  const tier = (n) => floor1(Math.min(...runs.filter((r) => Math.abs(r.slip) === n).map((r) => r.value)));
  return { bronze: tier(SLIP.bronze), silver: tier(SLIP.silver), gold: tier(SLIP.gold), goldClean: true };
}

export async function harvestDrill() {
  const { createGame } = require(ROOT + "tools/lib/game-vm.cjs");
  const g = await createGame({});
  for (const rel of ["js/learn-drills/registry.js", "js/learn-drills/drill-card.js", "js/learn-drills/harvest.js"]) {
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
  if (!host.launch("harvest")) throw new Error("harvest-drill-vm: launch refused");
  if (!(await g.settle(() => G.state === "count", 6000))) throw new Error("harvest-drill-vm: no countdown");
  if (!G.practice && !G.coach.armPractice()) throw new Error("harvest-drill-vm: practice refused");   // a Time Trial is practice already
  if (!host.begin()) throw new Error("harvest-drill-vm: begin() could not place the car");
  g.apex.headless(true);
  /** One run: full throttle, no steering, then the brake held from frame brakeAt (null: never). The host's result. */
  function drive(brakeAt, maxS = 30) {
    for (let i = 0; i < 60 * maxS; i++) {
      const braking = brakeAt != null && i >= brakeAt;
      g.apex.act({ throttle: !braking, brake: braking, steer: 0 }, 1 / 60, 1);
      const r = host.tick();
      if (r) return r;
    }
    return null;
  }
  return { g, G, host, reopened, drive, retry: () => host.retry(), close: () => g.close() };
}

/** The calibration: one boot, a warm-up run, then RETRY before every run. A coarse sweep of brake frames finds the
 *  stop nearest the marker; the refs keep that run and the runs ±SLIP frames off it. */
export async function calibrate() {
  const run = await harvestDrill();
  const at = (frame) => {
    if (!run.retry()) throw new Error("retry refused before the run braking at frame " + frame);
    const r = run.drive(frame);
    if (!r) throw new Error("no finish braking at frame " + frame);
    return { frame, value: r.value, offM: r.offM, clean: r.clean, reason: r.reason, clipS: +r.metrics[3][1] };
  };
  try {
    if (!run.drive(null)) throw new Error("no finish on the warm-up run");
    let best = null;
    for (let f = 60; f <= 360; f++) {
      const r = at(f);
      if (r.clean && (!best || Math.abs(r.offM) < Math.abs(best.offM))) best = r;
      if (r.clean && r.offM > 30) break;   // long and getting longer: the sweep has passed the marker
    }
    if (!best) throw new Error("no clean stop in the sweep");
    const runs = [];
    for (const n of [-SLIP.bronze, -SLIP.silver, -SLIP.gold, 0, SLIP.gold, SLIP.silver, SLIP.bronze]) {
      runs.push({ slip: n, ...(n === 0 ? best : at(best.frame + n)) });
    }
    return runs;
  } finally { run.close(); }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const runs = await calibrate();
  if (!process.argv.includes("--write")) { console.log(JSON.stringify(runs, null, 1)); process.exit(0); }
  const refs = JSON.parse(readFileSync(REFS, "utf8"));
  refs.harvest = {
    how: "node tests/helpers/harvest-drill-vm.mjs --write: the Monza Harvest Stop (20 m past the line at 0.8 vTop, store 0.85, marker 330 m on), one boot, a warm-up run, then RETRY before each run, full throttle, no steering, then the brake held to the stop from one frame; a frame-by-frame sweep finds the stop nearest the marker",
    metric: "stop accuracy = 100 x (1 - |metres off the marker| / 50), floored at 0 (js/learn-drills/harvest.js score); harvest shown, not scored",
    rule: "each tier is the worse accuracy of the two runs braking SLIP frames early and late of the best brake point: gold 6 (0.1 s), silver 15 (0.25 s), bronze 30 (0.5 s); floored to 0.1 %",
    runs,
    tiers: deriveHarvestTiers(runs),
  };
  writeFileSync(REFS, JSON.stringify(refs, null, 2) + "\n");
  console.log(JSON.stringify(refs.harvest.tiers));
}
