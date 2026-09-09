#!/usr/bin/env node
/**
 * @doc Why do AI passes reverse? Splits order flips into with-pace and against-pace, and how long a pass stands.
 * @skill ai-racecraft
 * ai-reversals.mjs — the diagnosis `ai-field.mjs` cannot give.
 *
 * `ai-field` counts order flips and splits them into SETTLED (a pair swaps once)
 * and OSCILLATION (three or more). It measured 62-68 % oscillation and stopped
 * there, which is a symptom, not a cause. Worse, the obvious cause was wrong:
 * on 2026-09-09 I predicted a tighter pace spread would increase the churn and
 * the measurement said it did not, so the mechanism I was about to build on did
 * not exist. This tool exists so the next hypothesis is testable before code.
 *
 * The question it answers: **is a pass justified by pace?**
 *
 *   withPace      the passer's own pace ceiling (tierV * skill, the number the
 *                 AI drives to) is HIGHER than the car it passed. This is
 *                 racing: a quicker car gets by.
 *   againstPace   the passer is SLOWER over a lap and passed anyway. One or two
 *                 is a slipstream or a mistake by the car ahead. A field where
 *                 half the passes are against pace is not racing, it is
 *                 shuffling — and no threshold on AiDrive.otWant will fix it,
 *                 because the passes are not decisions, they are noise.
 *   hold          seconds a pass stands before that pair flips back. A short
 *                 median with a long tail is the signature of a tow trading
 *                 places; a long median means passes stick and the oscillation
 *                 is a few stubborn pairs.
 *   inWake        share of flips where the passer sat inside the dirty-air /
 *                 tow range (< 34 m, game.js wakeOf) on the tick before. High
 *                 here WITH high againstPace is the slipstream handing places
 *                 back and forth.
 *
 * Reversals (a pair's 2nd flip onward) are reported separately from first
 * passes, because that is the split that says whether a re-pass is a comeback
 * by a genuinely quicker car or the same two cars trading a tow.
 *
 * `--runs N` seeds and rebuilds the field per run (see ai-field.mjs for why
 * seeding alone measures nothing) and reports median [min-max].
 *
 *   node tools/check/ai-reversals.mjs
 *   node tools/check/ai-reversals.mjs --track monaco --runs 5
 *   node tools/check/ai-reversals.mjs --json
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
const SECONDS = Math.max(60, +flag("seconds", 240));
const RUNS = Math.max(1, Math.min(25, +flag("runs", 1) || 1));
const SEED0 = +flag("seed", 1) || 1;
const DT = 1 / 60, SETTLE = 10;
const WAKE = 34;            // js/game.js wakeOf() — the tow / dirty-air range

async function measure(seed) {
  const g = await createGame({ track: TRACK, storage: { difficulty: DIFF } });
  if (g.apex && typeof g.apex.seed === "function") { g.apex.seed(seed); await g.race(TRACK); }
  const cars = g.G.cars.filter((c) => !c.isPlayer && !c.human);
  if (cars.length < 2) { g.close(); return { error: "fewer than two AI cars" }; }
  const pace = new Map(cars.map((c) => [c.code, c.tierV * c.skill]));
  for (let f = 0; f < Math.round(SETTLE / DT); f++) g.step(1, DT);

  const ahead = new Map(), lastFlipT = new Map(), nFlips = new Map(), prevGap = new Map();
  for (const a of cars) for (const b of cars) if (a !== b) ahead.set(a.code + ">" + b.code, a.prog > b.prog);
  const ev = [];

  for (let f = 0, t = 0; f < Math.round(SECONDS / DT); f++, t += DT) {
    g.step(1, DT);
    if (f % 15) continue;
    for (let i = 0; i < cars.length; i++) {
      for (let j = i + 1; j < cars.length; j++) {
        const a = cars[i], b = cars[j], k = a.code + ">" + b.code, now = a.prog > b.prog;
        const pk = [a.code, b.code].sort().join("|");
        const gap = Math.abs(a.prog - b.prog);
        if (ahead.get(k) !== now) {
          ahead.set(k, now);
          const n = (nFlips.get(pk) || 0) + 1;
          nFlips.set(pk, n);
          const passer = now ? a : b, passed = now ? b : a;
          ev.push({
            n,                                       // 1 = first pass, 2+ = a reversal
            withPace: pace.get(passer.code) > pace.get(passed.code),
            hold: lastFlipT.has(pk) ? t - lastFlipT.get(pk) : null,
            // the gap on the PREVIOUS sample: at the flip itself it is ~0 by
            // construction, so the tick before is what says whether the passer
            // had been sitting in the wake.
            inWake: (prevGap.get(pk) ?? 1e9) < WAKE,
          });
          lastFlipT.set(pk, t);
        }
        prevGap.set(pk, gap);
      }
    }
  }
  g.close();
  const first = ev.filter((e) => e.n === 1), rev = ev.filter((e) => e.n > 1);
  const pct = (a, f) => (a.length ? +(100 * a.filter(f).length / a.length).toFixed(1) : 0);
  const holds = rev.map((e) => e.hold).filter((h) => h != null).sort((a, b) => a - b);
  return {
    flips: ev.length, firstPasses: first.length, reversals: rev.length,
    withPaceAll: pct(ev, (e) => e.withPace),
    withPaceFirst: pct(first, (e) => e.withPace),
    withPaceRev: pct(rev, (e) => e.withPace),
    inWakeAll: pct(ev, (e) => e.inWake),
    holdMedianS: holds.length ? +holds[Math.floor(holds.length / 2)].toFixed(1) : 0,
    holdP90S: holds.length ? +holds[Math.floor(holds.length * 0.9)].toFixed(1) : 0,
  };
}

const med = (a) => { const q = a.slice().sort((x, y) => x - y); return q.length % 2 ? q[(q.length - 1) / 2] : (q[q.length / 2 - 1] + q[q.length / 2]) / 2; };
const runs = [];
for (let i = 0; i < RUNS; i++) runs.push(await measure(SEED0 + i));
const bad = runs.find((r) => r.error);
if (bad) { console.error(`ai-reversals: ${bad.error}`); process.exit(1); }

const KEYS = ["flips", "firstPasses", "reversals", "withPaceAll", "withPaceFirst", "withPaceRev", "inWakeAll", "holdMedianS", "holdP90S"];
const stat = {};
for (const k of KEYS) { const v = runs.map((r) => r[k]); stat[k] = { median: +med(v).toFixed(1), min: Math.min(...v), max: Math.max(...v) }; }
const one = RUNS === 1;
const show = (k) => one ? runs[0][k] : `${stat[k].median} [${stat[k].min}–${stat[k].max}]`;

if (argv.includes("--json")) { console.log(JSON.stringify(one ? runs[0] : { runs: RUNS, stat }, null, 2)); }
else {
  console.log(`${TRACK} / ${DIFF} / ${SECONDS} s` + (one ? "" : ` / ${RUNS} runs, seeds ${SEED0}–${SEED0 + RUNS - 1} (median [min–max])`));
  console.log(`  flips            ${show("flips")}   first passes ${show("firstPasses")}   reversals ${show("reversals")}`);
  console.log(`  WITH pace        all ${show("withPaceAll")}%   first ${show("withPaceFirst")}%   reversals ${show("withPaceRev")}%`);
  console.log(`  passer in wake   ${show("inWakeAll")}% of flips   (< ${WAKE} m on the tick before)`);
  console.log(`  a pass stands    median ${show("holdMedianS")} s, p90 ${show("holdP90S")} s before that pair flips back`);
  console.log(`  READ: ~50 % with-pace means the order is being decided by noise, not pace —`);
  console.log(`        no AiDrive.otWant threshold fixes that. High with-pace + short holds`);
  console.log(`        means real passes that will not stick, which IS a racecraft lever.`);
}
