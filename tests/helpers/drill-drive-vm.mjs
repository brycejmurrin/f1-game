/* drill-drive-vm.mjs — drive any LEARN drill in the real game VM with scripted pedals (#7040, #6559 steps 4+).
 * The shared driver for every drill VM test: it launches through the game's OWN host (G.drills(), the one the LEARN
 * door and __apex.drillLaunch use), so game.js stages, begins, arms practice and ticks the host each frame as in a
 * real race. STEERING is SoakRun's closed loop (js/perf/soak-run.js control(): curvature look-ahead plus pure
 * pursuit); a test scripts only the PEDALS. That law reads Tracks.curvature(), which is fine here: it is the test's
 * hands on the wheel, never the drill's code (js/learn-drills/ may not read curvature, drill-registry.test.mjs).
 *
 *   const run = await drillDrive("grip");          // boot, launch, wait for the rolling start
 *   const r = run.drive(GRIP_SCRIPTS.trail());     // one run; the host's scored result, or null (no finish)
 *   run.retry();                                   // the coach's checkpoint, as the card's RETRY
 *
 * A pedal script is (ctx) => {throttle, brake, brakeLevel?} per 60 Hz frame, ctx = {toApex (m to the drill's
 * apexProg, RaceInsights), speed, base (SoakRun's own input this frame), G}. Return a `steer` to override the law.
 * Writer: `node tests/helpers/drill-drive-vm.mjs --write-grip` re-runs GRIP_RUNS into tests/data/learn-drill-refs.json. */
import { readFileSync, writeFileSync } from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = fileURLToPath(new URL("../../", import.meta.url));
export const REFS = ROOT + "tests/data/learn-drill-refs.json";

export async function drillDrive(id, opts = {}) {
  const { createGame } = require(ROOT + "tools/lib/game-vm.cjs");
  const g = await createGame({ carMeshes: false, ...(opts.game || {}) });
  const ev = (src) => vm.runInContext(src, g.ctx, { filename: "drill-drive-vm:ev" });
  try {
    const launched = await g.apex.drillLaunch(id);
    if (!launched || !launched.ok) throw new Error("drill-drive-vm: launch refused " + JSON.stringify(launched));
    const up = await g.stepUntil(() => g.G.state === "race" && g.apex.drillState().staging === false, { maxSteps: 900 });
    if (!up.ok) throw new Error("drill-drive-vm: the rolling start never came up " + JSON.stringify(g.apex.drillState()));
    // SoakRun is LAZY (the PHONE TEST bundle): evaluate it into the realm for its control() law only; start() never runs.
    if (ev("typeof SoakRun") === "undefined") {
      vm.runInContext(readFileSync(ROOT + "js/perf/soak-run.js", "utf8"), g.ctx, { filename: ROOT + "js/perf/soak-run.js" });
    }
  } catch (e) { g.close(); throw e; }
  const G = g.G, host = G.drills(), SoakRun = ev("SoakRun");

  /** One run: frames until the host scores a finish (returns host.lastResult()) or maxS of race time (null).
   *  onTick(ctx) runs after each frame, for a test's own per-tick reading. */
  function drive(pedals, { maxS = 40, onTick } = {}) {
    if (host.state()?.result) throw new Error("drill-drive-vm: a result card is up; retry() first");
    const st = { hold: 99, stalled: 0 };   // a rolling start: no ease-up from a standstill
    for (let i = 0; i < 60 * maxS; i++) {
      const base = SoakRun.control(G, st, 1 / 60);
      if (!base) return null;
      const d = G.coach.insights.summary().drill;
      const ctx = { toApex: d && Number.isFinite(d.apexProg) ? d.apexProg - G.player.prog : NaN, speed: G.player.speed, base, G };
      g.apex.act({ steer: base.steer, ...pedals(ctx) }, 1 / 60, 1);
      if (onTick) onTick(ctx);
      if (host.state()?.result) return host.lastResult();
    }
    return null;
  }
  return { g, G, ev, host, drive, retry: () => host.retry(), rerun: (v) => host.rerun(v), close: () => g.close() };
}

/** The Grip drill's pedal scripts. Each call returns a fresh closure (a script may latch a release). The distances
 *  are to RaceInsights' apexProg, the curated Parabolica turn, which sits ~100 m past the corner's tightest point. */
export const GRIP_SCRIPTS = {
  /** V-LINE: flat to 150 m, then the whole pedal in a straight line down to vMin, then off it and turn. */
  vline: (vMin = 29) => {
    let done = false;
    return ({ toApex, speed, base }) => {
      if (toApex > 150) return { throttle: true, brake: false };
      if (!done && speed > vMin && toApex > 0) return { throttle: false, brake: true, brakeLevel: 1 };
      done = true;
      return { throttle: base.throttle, brake: false };
    };
  },
  /** TRAIL: flat to `at` m, the whole pedal to 110 m (the turn-in), then bled off with the speed still to lose
   *  ((v - vMin) / slope) while the wheel turns, released once under 5 %. */
  trail: (vMin = 31, slope = 16, at = 128) => {
    let done = false;
    return ({ toApex, speed, base }) => {
      if (toApex > at) return { throttle: true, brake: false };
      if (toApex > 110) return { throttle: false, brake: true, brakeLevel: 1 };
      const level = Math.min(1, (speed - vMin) / slope);
      if (done || level <= 0.05 || toApex <= 0) { done = true; return { throttle: base.throttle, brake: false }; }
      return { throttle: false, brake: true, brakeLevel: level };
    };
  },
  /** FREE: SoakRun's own pedals (a braking envelope over look-ahead curvature). */
  free: () => ({ base }) => ({ throttle: base.throttle, brake: base.brake }),
  /** LOCK: flat to the turn-in (110 m), then stamp on the whole pedal and hold it while the wheel turns: the fronts
   *  lock at ~44 m/s (measured). Held from 150 m in a straight line, the same pedal stops the car with no lock. */
  lock: () => ({ toApex }) => (toApex > 110 ? { throttle: true, brake: false } : { throttle: false, brake: true, brakeLevel: 1 }),
};

/** The reference rollouts: the three variant scripts, then a sweep of trail and V-line release points. */
export const GRIP_RUNS = [
  { variant: "vline", script: "vline", args: [] },
  { variant: "trail", script: "trail", args: [] },
  { variant: "free", script: "free", args: [] },
  ...[27, 31, 33].map((v) => ({ variant: "vline", script: "vline", args: [v] })),
  ...[29, 33].flatMap((v) => [8, 16].map((sl) => ({ variant: "trail", script: "trail", args: [v, sl, 128] }))),
];

const floor1 = (v) => Math.floor(v + 1e-9);
/** The documented rule (#6559 §1e rule 4): silver = the median rim use of the clean reference runs, gold = the best
 *  clean run's; whole %, floored. Bronze stays "any clean run" (grip.js medals()). */
export function deriveGripTiers(runs) {
  const clean = runs.filter((r) => r.clean).map((r) => r.value).sort((a, b) => a - b);
  const mid = clean.length / 2;
  const median = clean.length % 2 ? clean[Math.floor(mid)] : (clean[mid - 1] + clean[mid]) / 2;
  return { silver: floor1(median), gold: floor1(clean[clean.length - 1]) };
}

/** Runs GRIP_RUNS in one boot (RETRY between them, rerun() to set each run's variant). */
export async function gripRollouts() {
  const run = await drillDrive("grip");
  const out = [];
  try {
    for (const [k, spec] of GRIP_RUNS.entries()) {
      if (k && !run.rerun(spec.variant)) throw new Error("rerun refused before run " + k);
      if (!k && spec.variant !== "vline") throw new Error("the first run is the default variant");
      const r = run.drive(GRIP_SCRIPTS[spec.script](...spec.args));
      if (!r) throw new Error("no finish: " + JSON.stringify(spec));
      out.push({ ...spec, value: r.value, clean: r.clean, reason: r.reason, gateS: r.gateS });
    }
  } finally { run.close(); }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv.includes("--write-grip")) {
  const runs = await gripRollouts();
  const refs = JSON.parse(readFileSync(REFS, "utf8"));
  refs.grip = {
    how: "node tests/helpers/drill-drive-vm.mjs --write-grip: GRIP_RUNS in one boot of the Monza Grip drill (solo TT, 650 m before the Parabolica), rerun(variant) between runs; steering is SoakRun's control() law, the pedals are GRIP_SCRIPTS",
    metric: "rim use % = time-weighted mean of the friction-circle radius from the first firm brake to the apex (js/learn-drills/grip.js sample/score)",
    rule: "bronze = any clean run; silver = median rim use of the clean runs; gold = the best clean run (and a gate time within 0.15 s of your best TRAIL run); whole %, floored",
    runs,
    tiers: deriveGripTiers(runs),
  };
  writeFileSync(REFS, JSON.stringify(refs, null, 2) + "\n");
  console.log(JSON.stringify(refs.grip.tiers), JSON.stringify(runs.map((r) => [r.script, r.args.join("/"), r.value, r.clean, r.reason, r.gateS])));
}
