#!/usr/bin/env node
/**
 * @doc Each AI car alone on the circuit, fixed seed: best solo lap, field spread, and order vs tier x skill.
 * @skill ai-racecraft
 * ai-solo.mjs — what each AI car is worth with nobody else on the road.
 *
 * ai-pace.mjs times the FIELD racing itself, so a car's lap carries the
 * traffic it met on a random grid: a quick car stuck behind a slow one reads
 * slow, and the field's best-lap spread mixes pace with luck. This instrument
 * takes traffic out. For each car it re-runs the race from the same seed
 * (`__apex.seed`), hands the player's car to the AI and benches it (game-vm
 * aiOnly()), retires every OTHER car, then times the survivor: one out lap
 * from the grid, then `--laps` flying laps, best kept. Sim time at a fixed
 * step, so a run is deterministic for a seed and blind to box load.
 *
 * The player sits in MY TEAM (the custom entry) so all 22 real cars are AI
 * cars with their factory setups; the custom car is the one aiOnly() benches.
 *
 *   node tools/check/ai-solo.mjs                         redbull, normal
 *   node tools/check/ai-solo.mjs --track monza,spa --diff normal,hard
 *   node tools/check/ai-solo.mjs --all --laps 1 --json   every circuit
 *   every run: --seed 1  --wear off|light|real (default off)
 *
 * Reading it: `spread` is slowest best over fastest best, minus one. `rho` is
 * the Spearman rank correlation between solo pace and the scripted pace
 * (tierV x skill — the order the teams and drivers are MEANT to run in);
 * 1.0 means the stopwatch order is the scripted order. `tierOrder` is true
 * when every tier's mean lap is slower than the tier above it.
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { wearArg } from "../lib/cli-args.mjs";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { createGame } = require(path.join(ROOT, "tools/lib/game-vm.cjs"));

const DT = 1 / 60;

/** Spearman rank correlation of two equal-length arrays (average ranks on ties). */
export function spearman(a, b) {
  const rank = (v) => {
    const idx = v.map((x, i) => [x, i]).sort((p, q) => p[0] - q[0]);
    const r = new Array(v.length);
    for (let i = 0; i < idx.length;) {
      let j = i;
      while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
      for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2;
      i = j + 1;
    }
    return r;
  };
  const ra = rank(a), rb = rank(b), n = a.length;
  if (n < 2) return null;
  const ma = ra.reduce((s, x) => s + x, 0) / n, mb = rb.reduce((s, x) => s + x, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) { num += (ra[i] - ma) * (rb[i] - mb); da += (ra[i] - ma) ** 2; db += (rb[i] - mb) ** 2; }
  return da && db ? num / Math.sqrt(da * db) : null;
}

/** The summary numbers for one circuit's solo rows (rows with a finite best). */
export function summarize(rows) {
  const ok = rows.filter((r) => Number.isFinite(r.best));
  if (!ok.length) return { timed: 0 };
  const bests = ok.map((r) => r.best);
  const fastest = Math.min(...bests), slowest = Math.max(...bests);
  // Lower lap time should go with HIGHER scripted pace: correlate against -best.
  const rho = spearman(ok.map((r) => -r.best), ok.map((r) => r.script));
  const tiers = [...new Set(ok.map((r) => r.tier))].sort((x, y) => x - y);
  const tierMean = tiers.map((t) => { const l = ok.filter((r) => r.tier === t); return l.reduce((s, r) => s + r.best, 0) / l.length; });
  const tierOrder = tierMean.every((m, i) => i === 0 || m > tierMean[i - 1]);
  return { timed: ok.length, fastest, slowest, spread: slowest / fastest - 1, rho, tierOrder,
    tierMean: Object.fromEntries(tiers.map((t, i) => [t, +tierMean[i].toFixed(3)])) };
}

/**
 * Solo laps for every AI car on one circuit at one difficulty.
 * opts: { track, difficulty, laps, seed, wear, mutate(car, G) } — `mutate` (optional)
 * edits the lone car after the grid is built and before the first step: the
 * experiment hook for sensitivity sweeps (a scratch script, never the game).
 */
export async function soloField(opts) {
  const { track, difficulty = "normal", laps = 2, seed = 1, wear = "off", mutate = null, only = null } = opts;
  // The custom team's index: seated there, every real car is an AI car.
  const g = await createGame({ track, storage: { difficulty, tyreWear: wear } });
  const custom = g.sandbox.Teams.LIST.findIndex((t) => t.custom);
  g.close();
  const h = await createGame({ track, storage: { difficulty, tyreWear: wear, team: custom, driver: 0 } });
  const rows = [];
  try {
    const n = h.G.cars.length;
    for (let i = 0; i < n; i++) {
      h.apex.seed(seed);
      await h.race(track);
      h.aiOnly();
      const cars = h.G.cars, c = cars[i];
      if (!c || c.retired || c.isPlayer || c.team.custom) continue;
      if (only && !only(c)) continue;
      for (let j = 0; j < cars.length; j++) if (j !== i && !cars[j].retired) h.apex.retire(j, "bench");
      if (mutate) mutate(c, h.G);
      // Out lap + `laps` flying laps; ~4 min of sim a lap is far past the slowest circuit.
      const maxSteps = Math.round((240 * (laps + 1)) / DT);
      let seen = c.lap || 0, last = null, t = 0;
      const times = [];
      for (let f = 0; f < maxSteps && times.length < laps; f++) {
        h.step(1, DT);
        t += DT;
        if (c.retired) break;
        const lap = c.lap || 0;
        if (lap > seen) { if (last != null) times.push(t - last); last = t; seen = lap; }
      }
      rows.push({
        team: c.team.id, tier: c.tier, code: c.code,
        tierV: +c.tierV.toFixed(5), skill: +c.skill.toFixed(5), script: c.tierV * c.skill,
        aeroLoad: +(c.aeroLoad != null ? c.aeroLoad : 0.5).toFixed(3), ersDeploy: +(c.ersDeploy != null ? c.ersDeploy : 0.5).toFixed(3),
        trim: c.paceTrim != null ? +c.paceTrim.toFixed(5) : null,
        laps: times.map((x) => +x.toFixed(3)), best: times.length ? Math.min(...times) : NaN,
      });
    }
  } finally { h.close(); }
  return { track, difficulty, laps, seed, wear, rows, summary: summarize(rows) };
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(`ai-solo — every AI car alone on the circuit, fixed seed (VM, no browser)

  node tools/check/ai-solo.mjs [--track redbull[,spa,...] | --all] [--diff normal[,hard]]
                               [--laps 2] [--seed 1] [--json]
  every run: --wear off|light|real  (default off)

Prints per-car best solo lap, spread (slowest/fastest - 1), Spearman rho vs the
scripted tierV x skill order, and whether tier means are in order.
Owned by ai-racecraft.`);
    return 0;
  }
  const flag = (name, def) => {
    const i = argv.indexOf("--" + name);
    return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : def;
  };
  const WEAR = wearArg(argv);
  const LAPS = Math.max(1, +flag("laps", 2));
  const SEED = +flag("seed", 1) || 1;
  const DIFFS = String(flag("diff", "normal")).split(",");
  let tracks = String(flag("track", "redbull")).split(",");
  if (argv.includes("--all")) {
    const g = await createGame({ storage: { tyreWear: WEAR } });
    tracks = g.sandbox.Tracks.LIST.map((d) => d.id);
    g.close();
  }
  const out = [];
  for (const track of tracks) for (const difficulty of DIFFS) {
    const r = await soloField({ track, difficulty, laps: LAPS, seed: SEED, wear: WEAR });
    out.push(r);
    if (!argv.includes("--json")) {
      const s = r.summary;
      console.log(`\n${track} · ${difficulty} — solo best of ${LAPS} flying lap(s), seed ${SEED}, wear ${WEAR}`);
      const rows = r.rows.slice().sort((a, b) => a.best - b.best);
      for (const x of rows) {
        const d = Number.isFinite(x.best) ? `+${((x.best / s.fastest - 1) * 100).toFixed(2)} %` : "no lap";
        console.log(`  ${x.code.padEnd(4)} ${x.team.padEnd(12)} t${x.tier}  script ${x.script.toFixed(4)}  aero ${x.aeroLoad.toFixed(2)}  ers ${x.ersDeploy.toFixed(2)}  ` +
          `${Number.isFinite(x.best) ? x.best.toFixed(3).padStart(8) : "       —"}  ${d}`);
      }
      if (s.timed) console.log(`  spread ${(s.spread * 100).toFixed(2)} %  rho ${s.rho == null ? "—" : s.rho.toFixed(2)}  tierOrder ${s.tierOrder}  timed ${s.timed}/${r.rows.length}`);
    }
  }
  if (argv.includes("--json")) console.log(JSON.stringify(out.map((r) => ({ ...r, rows: r.rows.map((x) => ({ ...x, best: Number.isFinite(x.best) ? +x.best.toFixed(3) : null, script: +x.script.toFixed(6) })) })), null, 2));
  return out.every((r) => r.summary.timed > 0) ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => process.exit(code), (e) => { console.error(e && e.stack || e); process.exit(1); });
}
