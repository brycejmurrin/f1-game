#!/usr/bin/env node
/**
 * @doc Where the AI actually puts the car in a corner: approach offset and apex depth per baked corner, with run-to-run range.
 * @skill ai-racecraft
 * ai-line.mjs — does the AI drive a racing LINE, or just a fast lap?
 *
 * The instrument this repo was missing, and the gap is not hypothetical. On
 * 2026-09-09 an AI change made every lap time FASTER and was measured with
 * `ai-pace.mjs` (time), `ai-field.mjs` (passes, stringing) and nothing else —
 * both green, both irrelevant. What it had actually done was give the corner
 * PLANNER an aerodynamic grip term the AI's lateral ACTUATOR does not have, so
 * the car planned entry speeds it could not turn at and washed 0.60 m out of a
 * short corner's apex at monza. Only `tests/unit/ai-racecraft-vm.test.mjs`
 * caught it, at a deploy gate, as a pass/fail 3 cm past a threshold — with no
 * way to ask "how far did it move, and is that more than a re-race moves it?"
 * This asks exactly that.
 *
 * Same measurement the racecraft spec makes, lifted out so it can be pointed at
 * any circuit and run N times:
 *
 *   approach   mean lateral offset over the 30 m window ending 30 m before the
 *              turn-in, signed so + is toward the INSIDE. A racing line is
 *              NEGATIVE here (outside). A 30 m mean, not one sample: a single
 *              sample at this threshold flips on changes that leave the baked
 *              line identical to two decimal places.
 *   apex       lateral offset at the corner's apex, + toward the inside. Deep
 *              is good. This is the number that moved when the planner and the
 *              actuator disagreed.
 *
 * Corners are the track's own baked `lineCorners`, filtered to those longer
 * than 40 m with no neighbour inside 120 m — a chicane's second half has no
 * approach of its own, so it is not scored.
 *
 * `--runs N` seeds and REBUILDS the field per run (see ai-field.mjs for why
 * seeding alone measures nothing) and reports median [min-max]. Use it before
 * believing any single-run difference: this measurement moves on its own.
 *
 *   node tools/check/ai-line.mjs                    monza, normal, 1 run
 *   node tools/check/ai-line.mjs --track spa --runs 5
 *   node tools/check/ai-line.mjs --json
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { createGame } = require(path.join(ROOT, "tools/lib/game-vm.cjs"));

const argv = process.argv.slice(2);
const flag = (n, d) => { const i = argv.indexOf("--" + n); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : d; };
const TRACK = flag("track", "monza"), DIFF = flag("diff", "normal");
const RUNS = Math.max(1, Math.min(25, +flag("runs", 1) || 1));
const SEED0 = +flag("seed", 1) || 1;
const DT = 1 / 60;

async function measure(seed) {
  const g = await createGame({ track: TRACK, storage: { difficulty: DIFF } });
  const A = g.apex;
  if (A && typeof A.seed === "function") { A.seed(seed); await g.race(TRACK); }
  const cars = g.G.cars, pIdx = cars.findIndex((c) => c.isPlayer);
  // The player car is driven by the AI, alone: rivals 800 m back so nothing
  // this measures is traffic. Same setup as the racecraft spec.
  A.carRole(pIdx, { human: false });
  A.rivals([]);
  A.go();
  A.headless(true);
  const c = cars[pIdx], trk = g.G.track, T = g.sandbox.Tracks;
  const rows = [], lap0 = c.lap;
  for (let f = 0; f < 60 * 400; f++) {
    A.step(DT, 1);
    if (c.lap > lap0 + 1) break;
    if (c.lap === lap0 + 1) rows.push({ s: c.s, x: c.x });
  }
  A.headless(false);
  g.close();
  if (rows.length < 1000) return { error: `no full lap recorded (${rows.length} samples)`, corners: [] };
  const near = (s) => rows.reduce((b, r) => (Math.abs(r.s - s) < Math.abs(b.s - s) ? r : b), rows[0]);
  const win = (s0, s1, inside) => {
    const q = rows.filter((r) => r.s >= s0 && r.s <= s1);
    return q.length ? q.reduce((a, r) => a + r.x * inside, 0) / q.length : NaN;
  };
  const all = trk.lineCorners || [];
  const big = all.filter((k) => k.len > 40 && !all.some((o) => o !== k && Math.abs(o.sApex - k.sApex) < 120));
  return {
    corners: big.map((k) => ({
      s0: Math.round(k.s0), sApex: Math.round(k.sApex), len: Math.round(k.len),
      approach: +win(k.s0 - 60, k.s0 - 30, k.inside).toFixed(3),
      apex: +(near(k.sApex).x * k.inside).toFixed(3),
    })),
    samples: rows.length,
  };
}

const med = (a) => { const q = a.slice().sort((x, y) => x - y); return q.length % 2 ? q[(q.length - 1) / 2] : (q[q.length / 2 - 1] + q[q.length / 2]) / 2; };
const runs = [];
for (let i = 0; i < RUNS; i++) runs.push(await measure(SEED0 + i));
const bad = runs.find((r) => r.error);
if (bad) { console.error(`ai-line: ${bad.error}`); process.exit(1); }

// Corners are keyed by s0: a rebuilt field does not move the BAKED line, so the
// same corners appear in every run and can be compared across them.
const keys = runs[0].corners.map((k) => k.s0);
const rowsOut = keys.map((s0) => {
  const per = runs.map((r) => r.corners.find((k) => k.s0 === s0)).filter(Boolean);
  const ap = per.map((k) => k.approach), px = per.map((k) => k.apex);
  return { s0, sApex: per[0].sApex, len: per[0].len,
           approach: { median: +med(ap).toFixed(2), min: Math.min(...ap), max: Math.max(...ap) },
           apex: { median: +med(px).toFixed(2), min: Math.min(...px), max: Math.max(...px) } };
});
const out = { track: TRACK, difficulty: DIFF, runs: RUNS, corners: rowsOut };

if (argv.includes("--json")) { console.log(JSON.stringify(out, null, 2)); }
else {
  const one = RUNS === 1;
  console.log(`${TRACK} / ${DIFF} / ${rowsOut.length} scored corner(s)` + (one ? "" : ` / ${RUNS} runs, seeds ${SEED0}–${SEED0 + RUNS - 1} (median [min–max])`));
  console.log(`  + is toward the INSIDE — a racing line is NEGATIVE on the approach and deep POSITIVE at the apex`);
  for (const r of rowsOut) {
    const a = one ? r.approach.median.toFixed(2) : `${r.approach.median.toFixed(2)} [${r.approach.min}–${r.approach.max}]`;
    const x = one ? r.apex.median.toFixed(2) : `${r.apex.median.toFixed(2)} [${r.apex.min}–${r.apex.max}]`;
    console.log(`  s=${String(r.s0).padStart(5)} len ${String(r.len).padStart(3)} m   approach ${a} m   apex ${x} m`);
  }
  if (RUNS > 1) console.log(`  NOTE  a difference inside [min–max] is unproven — re-racing moves this measurement on its own.`);
}
