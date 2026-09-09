#!/usr/bin/env node
/**
 * @doc Field behaviour of the AI race: pace spread, how fast it strings out, settled passes vs oscillation, nose-to-tail dwell.
 * @skill tune-physics
 * ai-field.mjs — does the AI field RACE, or does it shuffle?
 *
 * `ai-pace.mjs` answers "how fast is the field"; this answers "what does the
 * field DO", which is a different question and the one a player actually sees.
 * Four numbers, none of which existed before 2026-09-08:
 *
 *   spread      per-car pace multiplier (tierV * skill) across the field, and
 *               how far the field strings out over the run. CALIBRATION: the
 *               2025 F1 field was covered by 1.52 s/lap of race pace — about
 *               1.7 % of a 90 s lap — and the widest recent seasons reach ~4 %.
 *               A spread several times that cannot help but string out.
 *   passes      order flips split into SETTLED (a pair swaps once and stays
 *               swapped) and OSCILLATION (a pair swaps three or more times).
 *               The split is the point: the first cut of this measurement
 *               counted every flip and reported 118 "overtakes" in 240 s, when
 *               57 % of them were two cars trading places over and over. Real
 *               F1 runs ~31 overtakes PER RACE.
 *   dwell       how long close-following (<10 m) episodes last. A median of a
 *               couple of seconds is racing; minutes is a train.
 *   clumps      share of adjacent gaps under 10 m and under 25 m — what the
 *               field looks like from inside it.
 *
 * Deliberately AI-ONLY: no player, so the rubber band (game.js, AI behind the
 * leading human) never fires and this measures the field's own behaviour. Add
 * a player and you are measuring the band as well, which is a separate test.
 *
 *   node tools/check/ai-field.mjs                 monza, normal, 240 s
 *   node tools/check/ai-field.mjs --track monaco --diff hard --seconds 300
 *   node tools/check/ai-field.mjs --runs 5        median + range over 5 seeds
 *   node tools/check/ai-field.mjs --json
 *
 * ONE RUN IS NOT A MEASUREMENT (2026-09-09). The sim is deterministic, so a
 * repeat of one seed reproduces to the digit — and that is REPRODUCIBILITY, not
 * precision. A 240 s race is chaotic: one behavioural change reshuffles the
 * whole field, and single-run tables were read here as if a 27 -> 19 swing in
 * settled passes were signal when nothing established it was not the reshuffle.
 * `--runs N` re-races N times, reporting the MEDIAN and the min-max RANGE of
 * every metric. Compare medians, and treat a difference inside the ranges as
 * unproven.
 *
 * What --runs varies, precisely: the seed is set and the field REBUILT, so each
 * run draws a different set of per-car skill jitters and races them out. It is
 * a sample over plausible FIELDS at one difficulty, which is the right question
 * for "does this change help the racing" — a change that only helps the one
 * canonical field has not been shown to help. `paceSpreadPct` therefore varies
 * run to run, and that is the flag working, not noise in the metric.
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
const DT = 1 / 60, SETTLE = 10;            // seconds of settling before measuring
const CLOSE = 10;                          // metres that count as nose-to-tail

async function measure(seed) {
  const g = await createGame({ track: TRACK, storage: { difficulty: DIFF } });
  // SEED, THEN REBUILD THE FIELD — in that order, and the order is the whole
  // point. Setting the seed alone changes NOTHING here: the AI's in-race
  // decisions are deterministic given the field, and the randomness enters at
  // CAR CREATION (each car's skill jitter is drawn there). Seeding after boot
  // rewinds the stream but the cars have already drawn, so all three of seeds
  // 1/2/3 measured byte-identical when this was first written — a range of
  // zero, which would have read as "the metric is rock solid" when it actually
  // meant "the knob is not connected". apex.js says the idiom out loud:
  // "setting the seed also rewinds the stream, so seeding then rebuilding".
  // Seed 1 + rebuild reproduces the boot field exactly, so --runs 1 is
  // unchanged from before this flag existed and older recorded numbers stay
  // comparable.
  if (g.apex && typeof g.apex.seed === "function") { g.apex.seed(seed); await g.race(TRACK); }
  const cars = g.G.cars.filter((c) => !c.isPlayer && !c.human);
  if (cars.length < 2) { console.error("ai-field: fewer than two AI cars"); process.exit(1); }

  const pace = new Map(cars.map((c) => [c.code, c.tierV * c.skill]));
  for (let f = 0; f < Math.round(SETTLE / DT); f++) g.step(1, DT);

  const ahead = new Map();
  for (const a of cars) for (const b of cars) if (a !== b) ahead.set(a.code + ">" + b.code, a.prog > b.prog);
  const swaps = new Map(), run = new Map(), dwell = [], snaps = [];
  let closeSeconds = 0;

  for (let f = 0, t = 0; f < Math.round(SECONDS / DT); f++, t += DT) {
    g.step(1, DT);
    if (f % 15) continue;                    // 4 Hz is plenty for order and gaps
    // ORDER FLIPS, pairwise — a field-order string cannot tell one pass from a
    // whole reshuffle, and cannot see a pair oscillating inside a static order.
    for (let i = 0; i < cars.length; i++) {
      for (let j = i + 1; j < cars.length; j++) {
        const a = cars[i], b = cars[j], k = a.code + ">" + b.code, now = a.prog > b.prog;
        if (ahead.get(k) !== now) {
          ahead.set(k, now);
          const pk = [a.code, b.code].sort().join("|");
          swaps.set(pk, (swaps.get(pk) || 0) + 1);
        }
      }
    }
    const s = cars.slice().sort((x, y) => y.prog - x.prog);
    const live = new Set();
    for (let i = 1; i < s.length; i++) {
      if (s[i - 1].prog - s[i].prog < CLOSE) {
        const key = s[i].code + "<" + s[i - 1].code;
        live.add(key); run.set(key, (run.get(key) || 0) + 0.25); closeSeconds += 0.25;
      }
    }
    for (const [k, v] of [...run]) if (!live.has(k)) { dwell.push(v); run.delete(k); }
    if (f % Math.round(20 / DT) === 0) {
      const gaps = [];
      for (let i = 1; i < s.length; i++) gaps.push(s[i - 1].prog - s[i].prog);
      snaps.push({ t: Math.round(t), spread: gaps.reduce((a, b) => a + b, 0),
                   near: gaps.filter((x) => x < CLOSE).length, mid: gaps.filter((x) => x < 25).length, n: gaps.length });
    }
  }
  for (const v of run.values()) dwell.push(v);
  dwell.sort((a, b) => a - b);

  const p = [...pace.values()];
  const spreadPct = (Math.max(...p) / Math.min(...p) - 1) * 100;
  const counts = [...swaps.values()];
  const settled = counts.filter((c) => c === 1).length;
  const oscFlips = counts.filter((c) => c >= 3).reduce((a, b) => a + b, 0);
  const flips = counts.reduce((a, b) => a + b, 0);
  const first = snaps[0] || { spread: 0 }, last = snaps[snaps.length - 1] || { spread: 0 };
  const out = {
    track: TRACK, difficulty: DIFF, seconds: SECONDS, cars: cars.length,
    paceSpreadPct: +spreadPct.toFixed(2),
    spreadStartM: Math.round(first.spread), spreadEndM: Math.round(last.spread),
    flips, settledPasses: settled, oscillationFlips: oscFlips,
    oscillationShare: flips ? +(oscFlips / flips).toFixed(3) : 0,
    dwellMedianS: dwell.length ? +dwell[Math.floor(dwell.length / 2)].toFixed(1) : 0,
    dwellMaxS: dwell.length ? +dwell[dwell.length - 1].toFixed(1) : 0,
    noseToTailPct: +(100 * closeSeconds / (cars.length * SECONDS)).toFixed(1),
  };
  g.close();
  return out;
}

// ── drive the runs and report ───────────────────────────────────────────────
// Median, not mean: one race that strings out early drags a mean and leaves the
// typical run unrepresented, and with N as small as 5 that is the common case.
const med = (a) => { const q = a.slice().sort((x, y) => x - y); return q.length % 2 ? q[(q.length - 1) / 2] : (q[q.length / 2 - 1] + q[q.length / 2]) / 2; };
const runs = [];
for (let i = 0; i < RUNS; i++) runs.push(await measure(SEED0 + i));

const KEYS = ["paceSpreadPct", "spreadStartM", "spreadEndM", "flips", "settledPasses",
              "oscillationFlips", "oscillationShare", "dwellMedianS", "dwellMaxS", "noseToTailPct"];
const stat = {};
for (const k of KEYS) {
  const v = runs.map((r) => r[k]);
  stat[k] = { median: +med(v).toFixed(3), min: Math.min(...v), max: Math.max(...v) };
}
const out = Object.assign({}, runs[0], { runs: RUNS, seeds: runs.map((_, i) => SEED0 + i), stat });
const one = RUNS === 1;
const show = (k, dp = 0) => one ? runs[0][k] : `${stat[k].median.toFixed(dp)} [${stat[k].min}–${stat[k].max}]`;

if (argv.includes("--json")) { console.log(JSON.stringify(one ? runs[0] : out, null, 2)); }
else {
  console.log(`${TRACK} / ${DIFF} / ${out.cars} AI cars / ${SECONDS} s` + (one ? "" : ` / ${RUNS} runs, seeds ${SEED0}–${SEED0 + RUNS - 1} (median [min–max])`));
  console.log(`  pace spread      ${show("paceSpreadPct", 2)}%   (real F1 2025: ~1.7%, widest recent ~4%)`);
  console.log(`  field strings    ${show("spreadStartM")} m -> ${show("spreadEndM")} m`);
  console.log(`  order flips      ${show("flips")}   settled passes ${show("settledPasses")}   oscillation ${show("oscillationFlips")} (${(100 * stat.oscillationShare.median).toFixed(0)}%)`);
  console.log(`  nose-to-tail     median ${show("dwellMedianS", 1)} s, longest ${show("dwellMaxS", 1)} s, ${show("noseToTailPct", 1)}% of car-time`);
  if (stat.oscillationShare.median > 0.3) console.log(`  ! over a third of order changes are the SAME pairs swapping back and forth`);
  // The range is the point of --runs: a comparison inside it is not a result.
  if (!one) console.log(`  NOTE  compare MEDIANS across trees; a difference inside [min–max] is unproven.`);
}
