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
 *   node tools/check/ai-field.mjs --json
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
const DT = 1 / 60, SETTLE = 10;            // seconds of settling before measuring
const CLOSE = 10;                          // metres that count as nose-to-tail

const g = await createGame({ track: TRACK, storage: { difficulty: DIFF } });
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

if (argv.includes("--json")) { console.log(JSON.stringify(out, null, 2)); }
else {
  console.log(`${TRACK} / ${DIFF} / ${cars.length} AI cars / ${SECONDS} s`);
  console.log(`  pace spread      ${out.paceSpreadPct}%   (real F1 2025: ~1.7%, widest recent ~4%)`);
  console.log(`  field strings    ${out.spreadStartM} m -> ${out.spreadEndM} m`);
  console.log(`  order flips      ${out.flips}   settled passes ${out.settledPasses}   oscillation ${out.oscillationFlips} (${(100 * out.oscillationShare).toFixed(0)}%)`);
  console.log(`  nose-to-tail     median ${out.dwellMedianS} s, longest ${out.dwellMaxS} s, ${out.noseToTailPct}% of car-time`);
  if (out.oscillationShare > 0.3) console.log(`  ! over a third of order changes are the SAME pairs swapping back and forth`);
}
