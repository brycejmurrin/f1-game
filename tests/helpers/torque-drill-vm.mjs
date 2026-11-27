/* torque-drill-vm.mjs — LEARN's Torque Fill Exit (js/learn-drills/torque.js) in the real game VM, through DrillRegistry's own
 * host, as tests/helpers/taper-drill-vm.mjs drives the Taper Hunt (#6559 step 12, #6550 D3b).
 *
 *   const run = await torqueDrill();   // boot, launch, begin
 *   const r = run.drive(pressAt);     // flat out, BOOST pressed once pressAt s after the start (null: never)
 *   run.retry();                      // RETRY: back to the begin() checkpoint
 *
 * Writer: `node tests/helpers/torque-drill-vm.mjs --write` re-runs the PRESS_AT calibration runs into
 * tests/data/learn-drill-refs.json "torque" (tiers by deriveTorqueTiers below). */
import { readFileSync, writeFileSync } from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = fileURLToPath(new URL("../../", import.meta.url));
export const REFS = ROOT + "tests/data/learn-drill-refs.json";
/** BOOST press times, seconds after the start: early to late after the exit. */
export const PRESS_AT = [0, 0.5, 1, 1.5, 2, 2.5];

const floor2 = (v) => Math.floor(v * 100 + 1e-9) / 100;
/** The documented rule: base = the unboosted run's exit time; gain = base - seconds; gold / silver / bronze = 90 / 70 / 40 %
 *  of the best gain over the clean runs, floored to 0.01 s. */
export function deriveTorqueTiers(runs, base) {
  const best = Math.max(...runs.filter((r) => r.clean).map((r) => base - r.seconds));
  return { bronze: floor2(0.4 * best), silver: floor2(0.7 * best), gold: floor2(0.9 * best), goldClean: true };
}

export async function torqueDrill() {
  const { createGame } = require(ROOT + "tools/lib/game-vm.cjs");
  const g = await createGame({});
  for (const rel of ["js/learn-drills/registry.js", "js/learn-drills/drill-card.js", "js/learn-drills/torque.js"]) {
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
  if (!host.launch("torque")) throw new Error("torque-drill-vm: launch refused");
  if (!(await g.settle(() => G.state === "count", 6000))) throw new Error("torque-drill-vm: no countdown");
  if (!G.practice && !G.coach.armPractice()) throw new Error("torque-drill-vm: practice refused");   // a Time Trial is practice already
  if (!host.begin()) throw new Error("torque-drill-vm: begin() could not place the car");
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

/** The calibration runs, one boot, RETRY between them; the unboosted run first (a warm-up, then again for the base). */
export async function calibrate() {
  const run = await torqueDrill();
  const runs = [];
  try {
    if (!run.drive(null)) throw new Error("no finish on the warm-up run");
    if (!run.retry()) throw new Error("retry refused");
    const none = run.drive(null);
    if (!none) throw new Error("no finish without BOOST");
    for (const pressAt of PRESS_AT) {
      if (!run.retry()) throw new Error("retry refused before the run pressing at " + pressAt);
      const r = run.drive(pressAt);
      if (!r) throw new Error("no finish pressing at " + pressAt + " s");
      runs.push({ pressAt, seconds: r.straightS, clean: r.clean, reason: r.reason });
    }
    return { base: none.straightS, runs };
  } finally { run.close(); }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { base, runs } = await calibrate();
  if (!process.argv.includes("--write")) { console.log(JSON.stringify({ base, runs }, null, 1)); process.exit(0); }
  const refs = JSON.parse(readFileSync(REFS, "utf8"));
  refs.torque = {
    how: "node tests/helpers/torque-drill-vm.mjs --write: the Monza Torque Fill Exit (20 m past the line at 18 m/s standard pace, 2 Apex MJ store), one boot, a warm-up run, then RETRY before each run, full throttle, no steering; one run without BOOST, then BOOST pressed once at 0.0 to 2.5 s",
    metric: "seconds gained = base - the exit time to vStd 41 (RaceInsights' torque goal), base = the run without BOOST",
    rule: "gold / silver / bronze = 90 / 70 / 40 % of the best gain over the clean runs, floored to 0.01 s",
    base,
    runs,
    tiers: deriveTorqueTiers(runs, base),
  };
  writeFileSync(REFS, JSON.stringify(refs, null, 2) + "\n");
  console.log(JSON.stringify(refs.torque.tiers), "base", base);
}
