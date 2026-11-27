/* tyre-heat-drill-vm.mjs — LEARN's Tyre Thermal Lab in the real game VM, through DrillRegistry's own host (#6559
 * step 8). Like learn-drill-vm.mjs (the Aero drill), it builds a second host over the same G with game.js's hooks and
 * ticks it after each frame, where game.js would.
 *
 *   const run = await thermalDrill();       // boot, launch, begin
 *   const r = run.drive(pace);              // one run with the test driver at a pace; returns the host's result
 *   run.retry();                            // RETRY: back to the begin() checkpoint
 *
 * THE TEST DRIVER (test-side only, never game code): pure pursuit on the centreline (Tracks.sample) with a speed target
 * of pace x vTop, eased by the heading change it sees ahead. Faster laps put more load x speed into the tyre.
 * Writer: `node tests/helpers/tyre-heat-drill-vm.mjs --write` re-runs the calibration paces into
 * tests/data/learn-drill-refs.json "tyre-heat" (tiers derived by deriveThermalTiers below). */
import { readFileSync, writeFileSync } from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = fileURLToPath(new URL("../../", import.meta.url));
export const REFS = ROOT + "tests/data/learn-drill-refs.json";
export const PACES = Array.from({ length: 12 }, (_, k) => +(1.15 - k * 0.05).toFixed(2));

const floor1 = (v) => Math.floor(v * 10 + 1e-9) / 10;
const quantile = (xs, q) => { const s = xs.slice().sort((a, b) => a - b), i = (s.length - 1) * q, lo = Math.floor(i);
  return s[lo] + (s[Math.min(s.length - 1, lo + 1)] - s[lo]) * (i - lo); };
/** The documented rule: bronze = median % in the window of the runs, silver = their upper quartile, gold = the best
 *  clean run (clean required). Floored to 0.1 %. */
export function deriveThermalTiers(runs) {
  const v = runs.map((r) => r.inWindow), clean = runs.filter((r) => r.clean).map((r) => r.inWindow);
  return { bronze: floor1(quantile(v, 0.5)), silver: floor1(quantile(v, 0.75)), gold: floor1(Math.max(...clean)), goldClean: true };
}

export async function thermalDrill(opts = {}) {
  const { createGame } = require(ROOT + "tools/lib/game-vm.cjs");
  const g = await createGame({ carMeshes: false, storage: { tyreWear: "light", ...(opts.storage || {}) } });
  const G = g.G;
  const wearBefore = G.raceTyreWear;
  // The production path: __apex.drillLaunch loads LAZY_LEARN and launches through game.js's own host (G.drills()),
  // so the field is trimmed and begin() runs where game.js runs it.
  const launched = await g.apex.drillLaunch("tyre-heat");
  if (!launched || !launched.ok) throw new Error("tyre-heat-drill-vm: launch refused " + JSON.stringify(launched));
  const up = await g.stepUntil(() => G.state === "race" && g.apex.drillState().staging === false, { maxSteps: 600 });
  if (!up.ok) throw new Error("tyre-heat-drill-vm: the drill race never started " + JSON.stringify(g.apex.drillState()));
  g.apex.headless(true);
  const host = G.drills(), Tracks = vm.runInContext("Tracks", g.ctx);
  const reopened = [];
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
  function input(pace, weave, t) {
    const p = G.player, look = Math.max(15, p.speed * 0.9);
    Tracks.sample(G.track, (p.s + look) % G.track.total, a);
    const err = wrap(Math.atan2(a.p[0] - p.px, a.p[2] - p.pz) - p.head);
    const vt = G.vTop() * pace / (1 + turnAhead(p.s));
    const steer = -err * 2.5 + (weave && t < weave.s ? weave.amp * Math.sin(t * 2 * Math.PI * weave.hz) : 0);
    return { steer: Math.max(-1, Math.min(1, steer)), throttle: p.speed < vt, brake: p.speed > vt * 1.05 };
  }
  /** One run at a pace; weave {amp, hz, s} adds a steering weave for its first s seconds. Returns the result. */
  function drive(pace, weave = null, maxS = 240) {
    const attempt = host.state().attempt;
    for (let i = 0; i < 60 * maxS; i++) {
      g.apex.act(input(pace, weave, i / 60), 1 / 60, 1);
      if (host.state() && host.state().attempt > attempt) return host.lastResult();   // game.js's tick() scored the run
    }
    return null;
  }
  return { g, G, host, reopened, wearBefore, drive, retry: () => host.retry(), close: () => g.close() };
}

if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv.includes("--write")) {
  const run = await thermalDrill();
  const runs = [];
  try {
    for (const [k, pace] of PACES.entries()) {
      if (k && !run.retry()) throw new Error("retry refused before run " + k);
      const r = run.drive(pace);
      if (!r) throw new Error("no finish at pace " + pace);
      runs.push({ pace, inWindow: +r.value.toFixed(2), clean: r.clean, reason: r.reason });
      console.log(pace, r.value, r.clean, r.reason, r.metrics.map((m) => m[1]).join(" | "));
    }
  } finally { run.close(); }
  const refs = JSON.parse(readFileSync(REFS, "utf8"));
  refs["tyre-heat"] = {
    how: "node tests/helpers/tyre-heat-drill-vm.mjs --write: 12 runs of the Monza Tyre Thermal Lab (fresh medium, real wear), one boot, RETRY between runs, test pursuit driver at pace 1.15 down to 0.60 x vTop",
    metric: "% of the run with the surface in optTemp +- T_WINDOW (js/learn-drills/tyre-heat.js score)",
    rule: "bronze = median of the runs; silver = upper quartile; gold = best clean run (clean required); floored to 0.1 %",
    runs,
    tiers: deriveThermalTiers(runs),
  };
  writeFileSync(REFS, JSON.stringify(refs, null, 2) + "\n");
  console.log(JSON.stringify(refs["tyre-heat"].tiers));
}
