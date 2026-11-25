#!/usr/bin/env node
/**
 * @doc AI-only race field spread: gaps to the leader at P2/P5/P10/last per lap, lapped cars, lap-time consistency.
 * @skill ai-racecraft
 * ai-spread.mjs — is the field spread like a real Grand Prix, or bunched?
 *
 * ai-tactics reads intervals and trains (racecraft); this one reads the
 * CLASSIFICATION: at every leader lap crossing, each car's time behind the
 * leader at that point (10 m checkpoint history, F1 timing style), so the
 * per-lap gap rate P1→P5/P10/P20 compares directly with real race-pace gaps
 * (s/lap and % of a lap). It also reports each car's green lap-time spread
 * (consistency: the median car's lap-time CV, laps 2..N) and the lapped count
 * at the flag. Deterministic per seed (sim time, fixed step), AI-only (the
 * player is handed to the AI and retired, game-vm aiOnly()).
 *
 *   node tools/check/ai-spread.mjs --track bahrain --laps 10 --runs 3 [--diff hard] [--wear off] [--json]
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { wearArg } from "../lib/cli-args.mjs";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { createGame } = require(path.join(ROOT, "tools/lib/game-vm.cjs"));
const DT = 1 / 60, CPM = 10;
const med = (a) => { if (!a.length) return null; const q = a.slice().sort((x, y) => x - y); return q.length % 2 ? q[(q.length - 1) / 2] : (q[q.length / 2 - 1] + q[q.length / 2]) / 2; };
const r2 = (v, d = 2) => v == null || !Number.isFinite(v) ? null : +v.toFixed(d);

/** One AI-only race: per-lap gaps to the leader by position, lap times per car. */
export async function raceSpread({ track = "bahrain", laps = 10, seed = 1, diff = "normal", wear = "off", storage = {} } = {}) {
  const g = await createGame({ track, storage: { difficulty: diff, tyreWear: wear, ...storage } });
  g.apex.seed(seed); await g.race(track, null, null, { laps });
  const player = g.G.cars.find((c) => c.isPlayer || c.human);
  g.aiOnly();
  const ai = g.G.cars.filter((c) => c !== player && !c.human);
  // One base for every car (the rearmost grid slot): a checkpoint a car started past reads t = 0.
  const base0 = Math.floor(Math.min(...ai.map((c) => c.prog)) / CPM);
  const hist = new Map(ai.map((c) => [c, { base: base0, t: [] }]));
  const seen = new Map(ai.map((c) => [c, c.lap || 0])), lapAt = new Map(ai.map((c) => [c, []]));
  const L = g.G.track.total;
  const gapsByLap = [];   // [{lap, gaps:[s behind leader, by position]}]
  let leaderLap = 0, t = 0;
  const behind = (f, l) => {   // seconds since leader l passed follower f's position (prog minus whole laps behind)
    const h = hist.get(l), i = Math.floor(f.prog / CPM) - h.base;
    if (i < 0 || i >= h.t.length) return null;
    return t - h.t[i];
  };
  const maxF = Math.round((laps * L / 35 + 180) / DT);
  for (let fr = 0; fr < maxF; fr++, t += DT) {
    g.step(1, DT);
    for (const c of ai) {
      if (c.retired) continue;
      const h = hist.get(c);
      while ((h.base + h.t.length) * CPM <= c.prog) h.t.push(t);
      const lp = c.lap || 0;
      if (lp > seen.get(c)) { lapAt.get(c).push(t); seen.set(c, lp); }
    }
    const live = ai.filter((c) => !c.retired);
    const lead = live.reduce((a, c) => (c.prog > a.prog ? c : a), live[0]);
    const ll = lead.lap || 0;
    if (ll > leaderLap && ll >= 1) {
      leaderLap = ll;
      // Classify at the moment the leader crosses: each car's gap = time since the leader was at its prog.
      const order = live.slice().sort((a, b) => b.prog - a.prog);
      // The grid sits behind the line, so the first tick is the start, not a lap: skip it.
      if (t > 20) gapsByLap.push({ lap: gapsByLap.length + 1, gaps: order.map((c) => r2(behind(c, lead), 2)), lapsDown: order.map((c) => Math.floor((lead.prog - c.prog) / L)) });
      if (lead.finished || gapsByLap.length >= laps) break;
    }
  }
  // Green lap times (lap 2 onward: the first counted lap is the standing start).
  const cv = [], perCar = [];
  for (const c of ai) {
    const at = lapAt.get(c); const lt = [];
    for (let i = 2; i < at.length; i++) lt.push(at[i] - at[i - 1]);
    if (lt.length >= 3) { const m = lt.reduce((a, b) => a + b, 0) / lt.length; const sd = Math.sqrt(lt.reduce((a, b) => a + (b - m) ** 2, 0) / lt.length); cv.push(sd / m); }
    if (lt.length >= 2) perCar.push({ code: c.code, team: c.team && c.team.id, medLap: med(lt) });
  }
  const leadAt = lapAt.get(ai.reduce((a, c) => (c.prog > a.prog ? c : a), ai[0]));
  const leadLap = leadAt.length > 2 ? med(leadAt.slice(2).map((x, i) => x - leadAt[i + 1])) : null;
  // Not processional: cars whose finishing place differs from their grid place (AI-only ranks).
  const byGrid = ai.slice().sort((a, b) => a.gridPos - b.gridPos), byEnd = ai.filter((c) => !c.retired).sort((a, b) => b.prog - a.prog);
  const moved = byEnd.filter((c, i) => byGrid.indexOf(c) !== i).length;
  return { track, laps, seed, diff, wear, leadLapS: r2(leadLap, 2), lapCvMedPct: r2(100 * med(cv), 3), moved, perCar, gapsByLap };
}

/** Race pace by pace rank: each car's median green lap vs the fastest car's, in % (real-F1 shape: P2/P5/P10/P20). */
function racePace(perCar) {
  const q = (perCar || []).map((p) => p.medLap).filter((v) => v > 0).sort((a, b) => a - b);
  if (q.length < 2) return null;
  const at = (p) => r2(100 * (q[Math.min(p, q.length) - 1] / q[0] - 1), 2);
  return { p2: at(2), p5: at(5), p10: at(10), p20: at(20) };
}
/** Teammate race-pace gap (median green laps), mean and worst pair, in %. */
function mateGap(perCar) {
  const by = new Map();
  for (const p of perCar || []) if (p.team && p.medLap > 0) by.set(p.team, (by.get(p.team) || []).concat(p.medLap));
  const g = [...by.values()].filter((a) => a.length === 2).map(([a, b]) => 100 * Math.abs(a / b - 1));
  return g.length ? { mean: r2(g.reduce((a, b) => a + b, 0) / g.length, 2), max: r2(Math.max(...g), 2) } : null;
}

/** Summary of one race: gaps to P2/P5/P10/last at the flag, per-lap rates past lap 1, lapped count. */
export function summarize(r) {
  const last = r.gapsByLap[r.gapsByLap.length - 1], l1 = r.gapsByLap[0];
  if (!last) return null;
  const at = (row, p) => row.gaps[Math.min(p, row.gaps.length) - 1];
  const n = last.gaps.length, span = Math.max(1, last.lap - l1.lap);
  const rate = (p) => (at(last, p) - at(l1, p)) / span;
  const pct = (s) => r.leadLapS ? r2(100 * s / r.leadLapS, 2) : null;
  return {
    track: r.track, seed: r.seed, diff: r.diff, laps: last.lap, cars: n, leadLapS: r.leadLapS,
    flag: { p2: at(last, 2), p5: at(last, 5), p10: at(last, 10), last: at(last, n) },
    lap1: { p2: at(l1, 2), p5: at(l1, 5), p10: at(l1, 10), last: at(l1, n) },
    ratePct: { p2: pct(rate(2)), p5: pct(rate(5)), p10: pct(rate(10)), last: pct(rate(n)) },
    lapped: last.lapsDown.filter((d) => d >= 1).length,
    racePacePct: racePace(r.perCar),
    mateGapPct: mateGap(r.perCar),
    lapCvMedPct: r.lapCvMedPct,
    moved: r.moved,
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const argv = process.argv.slice(2);
  const flag = (k, d) => { const i = argv.indexOf("--" + k); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : d; };
  if (argv.includes("--help")) { console.log("ai-spread [--track bahrain[,monza]] [--laps 10] [--runs 3] [--seed 1] [--diff normal] [--wear off] [--set dirtyAir=off] [--json]"); process.exit(0); }
  const tracks = flag("track", "bahrain").split(","), laps = +flag("laps", 10), runs = +flag("runs", 3), seed0 = +flag("seed", 1);
  const diff = flag("diff", "normal"), wear = wearArg(argv), out = [];
  // --set key=value[,key=value]: extra settings for an A/B (e.g. --set dirtyAir=off; raceGrid=null boots the shipped default).
  const storage = Object.fromEntries((flag("set", "") || "").split(",").filter(Boolean).map((kv) => { const [k, v] = kv.split("="); return [k, v === "null" ? null : v]; }));
  for (const tr of tracks) for (let k = 0; k < runs; k++) {
    const s = summarize(await raceSpread({ track: tr, laps, seed: seed0 + k, diff, wear, storage }));
    out.push(s);
    if (!argv.includes("--json")) console.log(JSON.stringify(s));
  }
  if (argv.includes("--json")) console.log(JSON.stringify(out, null, 1));
  process.exit(0);
}
