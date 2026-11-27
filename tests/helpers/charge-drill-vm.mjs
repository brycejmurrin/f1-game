/* charge-drill-vm.mjs — LEARN's Charge-Sustaining Lap (js/learn-drills/charge.js, #6559 step 13, #6550 D2) in the real
 * game VM, launched through __apex.drillLaunch and game.js's own host, as tyre-heat-drill-vm.mjs does.
 *
 *   const run = await chargeDrill({ planBefore });   // boot (the player's plan), launch, begin
 *   const r = run.drive(["deploy", "save", "manual"]);   // set the plan, drive one lap; the host's result
 *   run.retry();                         // RETRY: back to the begin() checkpoint
 *
 * THE TEST DRIVER (test-side only, never game code): pure pursuit on the centreline (Tracks.sample) with a speed target
 * of PACE_K x vTop, eased by the heading change it sees ahead; BOOST is left to the plan.
 * Writer: `node tests/helpers/charge-drill-vm.mjs --write` re-runs every plan (PLANS, 27) into
 * tests/data/learn-drill-refs.json "charge" (tiers by deriveChargeTiers below). */
import { readFileSync, writeFileSync } from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = fileURLToPath(new URL("../../", import.meta.url));
export const REFS = ROOT + "tests/data/learn-drill-refs.json";
const POL = ["manual", "deploy", "save"];
/** Every per-sector plan, 3 x 3 x 3. */
export const PLANS = POL.flatMap((a) => POL.flatMap((b) => POL.map((c) => [a, b, c])));
export const PACE_K = 1.1;
/** #6550 D2's rule, on lap time over the charge-sustaining clean laps: gold within +0.15 s of the best, silver within
 *  +0.40 s, bronze any sustaining lap. As mean-speed tiers (the drill's value, higher is better), floored to 0.1 km/h:
 *  speed at a lap time t is best.kmh x best.lapS / t (the gate is one fixed distance). */
export function deriveChargeTiers(runs) {
  const ok = runs.filter((r) => r.clean);
  const best = ok.reduce((a, r) => (r.kmh > a.kmh ? r : a));
  const at = (dt) => Math.floor((best.kmh * best.lapS) / (best.lapS + dt) * 10 + 1e-9) / 10;
  return { bronze: Math.floor(Math.min(...ok.map((r) => r.kmh)) * 10 + 1e-9) / 10, silver: at(0.4), gold: at(0.15), goldClean: true, cleanRequired: true };
}

export async function chargeDrill(opts = {}) {
  const { createGame } = require(ROOT + "tools/lib/game-vm.cjs");
  const g = await createGame({ carMeshes: false, ...(opts.storage ? { storage: opts.storage } : {}) });
  const G = g.G;
  if (opts.planBefore) vm.runInContext("EnergyPlan", g.ctx).setPlan(opts.planBefore);   // the player's own plan, restored by end()
  const launched = await g.apex.drillLaunch("charge");
  if (!launched || !launched.ok) throw new Error("charge-drill-vm: launch refused " + JSON.stringify(launched));
  const up = await g.stepUntil(() => G.state === "race" && g.apex.drillState().staging === false, { maxSteps: 600 });
  if (!up.ok) throw new Error("charge-drill-vm: the drill race never started " + JSON.stringify(g.apex.drillState()));
  g.apex.headless(true);
  const host = G.drills(), Tracks = vm.runInContext("Tracks", g.ctx), EnergyPlan = vm.runInContext("EnergyPlan", g.ctx);
  const a = { p: [0, 0, 0], t: [0, 0, 1], r: [1, 0, 0], hw: 7 }, b = { p: [0, 0, 0], t: [0, 0, 1], r: [1, 0, 0], hw: 7 };
  const wrap = (e) => { while (e > Math.PI) e -= 2 * Math.PI; while (e < -Math.PI) e += 2 * Math.PI; return e; };
  function turnAhead(s) {
    const L = G.track.total;
    Tracks.sample(G.track, s % L, a);
    const h0 = Math.atan2(a.t[0], a.t[2]);
    let m = 0;
    for (let d = 20; d <= 160; d += 20) {
      Tracks.sample(G.track, (s + d) % L, b);
      m = Math.max(m, Math.abs(wrap(Math.atan2(b.t[0], b.t[2]) - h0)) / (1 + d / 80));
    }
    return m;
  }
  function input() {
    const p = G.player, look = Math.max(15, p.speed * 0.9);
    Tracks.sample(G.track, (p.s + look) % G.track.total, a);
    const err = wrap(Math.atan2(a.p[0] - p.px, a.p[2] - p.pz) - p.head);
    const vt = G.vTop() * PACE_K / (1 + turnAhead(p.s));
    return { steer: Math.max(-1, Math.min(1, -err * 2.5)), throttle: p.speed < vt, brake: p.speed > vt * 1.05 };
  }
  /** One lap on a plan (null keeps the current one). Returns the host's result, or null. */
  function drive(plan = null, maxS = 200) {
    if (plan && !EnergyPlan.setPlan(plan)) throw new Error("bad plan " + plan);
    const attempt = host.state().attempt;
    for (let i = 0; i < 60 * maxS; i++) {
      g.apex.act(input(), 1 / 60, 1);
      if (host.state() && host.state().attempt > attempt) return host.lastResult();   // game.js's tick() scored the run
    }
    return null;
  }
  return { g, G, host, EnergyPlan, drive, retry: () => host.retry(), close: () => g.close() };
}

/** Every plan, one boot: a warm-up lap, then RETRY before each run. */
export async function calibrate(plans = PLANS) {
  const run = await chargeDrill();
  const runs = [];
  try {
    if (!run.drive(null)) throw new Error("no finish on the warm-up lap");
    for (const plan of plans) {
      if (!run.retry()) throw new Error("retry refused before " + plan);
      const r = run.drive(plan);
      if (!r) throw new Error("no finish on " + plan);
      runs.push({ plan: plan.join("/"), kmh: r.value, lapS: r.lapS, netMJ: r.netMJ, clean: r.clean, reason: r.reason });
      if (process.env.CHARGE_VERBOSE) console.log(JSON.stringify(runs[runs.length - 1]));
    }
  } finally { run.close(); }
  return runs;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const runs = await calibrate();
  if (!process.argv.includes("--write")) { console.log(JSON.stringify(runs, null, 1)); process.exit(0); }
  const refs = JSON.parse(readFileSync(REFS, "utf8"));
  refs.charge = {
    how: "node tests/helpers/charge-drill-vm.mjs --write: the 27 per-sector plans (MANUAL/DEPLOY/SAVE each sector) of the Monza Charge-Sustaining Lap (20 m past the line at 0.8 vTop, 2.0 Apex MJ store, gate 30 m before the line), one boot, a warm-up lap, then RETRY before each run; test pursuit driver at 1.1 x vTop, BOOST left to the plan",
    metric: "mean speed to the gate, dash km/h (js/learn-drills/charge.js score); clean = a clean lap that ends with at least the start store",
    rule: "#6550 D2 on lap time over the clean (charge-sustaining) runs: gold within +0.15 s of the best, silver within +0.40 s, bronze the slowest sustaining lap; as mean-speed tiers floored to 0.1 km/h; cleanRequired",
    runs,
    tiers: deriveChargeTiers(runs),
  };
  writeFileSync(REFS, JSON.stringify(refs, null, 2) + "\n");
  console.log(JSON.stringify(refs.charge.tiers));
}
