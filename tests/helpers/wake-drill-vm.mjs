/* wake-drill-vm.mjs — LEARN's Wake Footprint drill (js/learn-drills/wake.js, #6559 step 7) in the real game VM, through
 * game.js's own host (__apex.drillLaunch). A scripted driver follows the rival at a fixed lateral offset: a test
 * harness, so it may steer from the road's curvature (the contract binds game code, not the test's robot).
 *
 *   const run = await wakeDrill();   // boot, launch, rolling start
 *   const r = run.drive(offset);     // one run, `offset` m to the rival's left (+x); returns the host's result
 *   run.retry();                     // RETRY: back to the begin() checkpoint
 *
 * Writer: `node tests/helpers/wake-drill-vm.mjs --write` re-runs the OFFSETS ladder into tests/data/learn-drill-refs.json
 * "wake" (tiers by deriveWakeTiers). */
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = fileURLToPath(new URL("../../", import.meta.url));
export const REFS = ROOT + "tests/data/learn-drill-refs.json";
export const OFFSETS = [0, 0.5, 1, 1.5, 2, 2.5, 3];

const floor1 = (v) => Math.floor(v * 10 + 1e-9) / 10;
/** The documented rule: bronze = the centred follow, gold = the 2 m offset line (about one car-width aside, #6555 §1),
 *  silver = halfway between; grip retained in %, floored to 0.1. */
export function deriveWakeTiers(runs) {
  const at = (o) => runs.find((r) => r.offset === o).value;
  return { bronze: floor1(at(0)), silver: floor1((at(0) + at(2)) / 2), gold: floor1(at(2)), goldClean: true };
}

export async function wakeDrill() {
  const { createGame } = require(ROOT + "tools/lib/game-vm.cjs");
  const g = await createGame({ carMeshes: false });
  const G = g.G;
  const before = { dirtyAir: G.raceDirtyAir, goal: G.coach.practiceGoal() };
  const launched = await g.apex.drillLaunch("wake");
  if (!launched.ok) throw new Error("wake-drill-vm: launch refused " + JSON.stringify(launched));
  const up = await g.stepUntil(() => G.state === "race" && g.apex.drillState().staging === false, { maxSteps: 600 });
  if (!up.ok) throw new Error("wake-drill-vm: the drill race never started");
  g.apex.headless(true);
  /** One run: P on the lateral error, D on its rate, curvature feed-forward. Returns the host's result (null: none). */
  function drive(offset, maxS = 30) {
    const before = G.drills().lastResult();
    let px = null;
    for (let i = 0; i < 60 * maxS; i++) {
      const p = G.player, r = G.cars.find((c) => c !== p);
      const vx = px == null ? 0 : (p.x - px) * 60;
      px = p.x;
      const k = g.apex.scan(Math.max(20, p.speed * 0.5)).k;
      const steer = Math.max(-1, Math.min(1, -60 * k + 0.3 * (r.x + offset - p.x) - 0.6 * vx));
      g.apex.act({ throttle: true, brake: false, steer }, 1 / 60, 1);
      const res = G.drills().lastResult();
      if (res && res !== before) return res;
    }
    return null;
  }
  return { g, G, before, drive, retry: () => g.apex.drillRetry().ok, close: () => g.close() };
}

if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv.includes("--write")) {
  const run = await wakeDrill();
  const runs = [];
  try {
    for (const [k, offset] of OFFSETS.entries()) {
      if (k && !run.retry()) throw new Error("retry refused before run " + k);
      const r = run.drive(offset);
      if (!r) throw new Error("no finish at offset " + offset);
      runs.push({ offset, value: r.value, clean: r.clean, reason: r.reason });
    }
  } finally { run.close(); }
  const refs = JSON.parse(readFileSync(REFS, "utf8"));
  refs.wake = {
    how: "node tests/helpers/wake-drill-vm.mjs --write: 7 runs of the Monza Wake Footprint drill (18 m behind, Classic dirty air), one boot, RETRY between runs, flat out, a scripted follow at 0 to 3 m to the rival's side",
    metric: "grip retained = time-weighted mean of c._dirtyAirMul over the Curva Grande window, % (js/learn-drills/wake.js score)",
    rule: "bronze = the centred follow; gold = the 2 m offset (one car-width aside); silver = halfway; floored to 0.1 %",
    runs,
    tiers: deriveWakeTiers(runs),
  };
  writeFileSync(REFS, JSON.stringify(refs, null, 2) + "\n");
  console.log(JSON.stringify(refs.wake.tiers), JSON.stringify(runs));
}
