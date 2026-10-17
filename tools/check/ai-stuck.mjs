#!/usr/bin/env node
/**
 * @doc AI stuck / rescue census: per-car stuckT episodes and rescue teleports over N seeds (VM, AI-only).
 * @skill ai-racecraft
 * ai-stuck.mjs — how often does the AI field get wedged, and how often does it
 * need the rescue teleport? `ai-field.mjs` reports dwell (nose-to-tail time),
 * which is a weak proxy; this reads the two timers game.js actually runs:
 * `stuckT` (boxed in and crawling; past AiDrive.stuckThreshold the car digs
 * out) and `rescueT` (past AiDrive.aiRescueDelay the car is teleported).
 * Counting rules: tools/lib/stuck-census.mjs.
 *
 *   node tools/check/ai-stuck.mjs [--track monza] [--seconds 240] [--runs 3] [--diff normal] [--wear off|light|real] [--json]
 *
 * AI-only (game-vm aiOnly()), like ai-field. Seeds are set then the field
 * rebuilt, so each run is a different set of per-car jitters. One run is not a
 * measurement; read the totals over --runs and treat a zero as "none seen".
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { wearArg } from "../lib/cli-args.mjs";
import { createStuckTracker } from "../lib/stuck-census.mjs";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { createGame } = require(path.join(ROOT, "tools/lib/game-vm.cjs"));

const argv = process.argv.slice(2);
if (argv.includes("--help") || argv.includes("-h")) {
  console.log(`ai-stuck — AI stuck / rescue census (per-car stuckT episodes and rescue teleports)

  node tools/check/ai-stuck.mjs [--track monza] [--seconds 240] [--runs 3] [--diff normal] [--json]
  every run: --wear off|light|real  (default off); --seconds floor 60

Owned by ai-racecraft.`);
  process.exit(0);
}
const flag = (n, d) => { const i = argv.indexOf("--" + n); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : d; };
const TRACK = flag("track", "monza"), DIFF = flag("diff", "normal");
const WEAR = wearArg(argv);
const SECONDS = Math.max(60, +flag("seconds", 240));
const RUNS = Math.max(1, Math.min(25, +flag("runs", 3) || 1));
const DT = 1 / 60;

async function measure(seed) {
  const g = await createGame({ track: TRACK, storage: { difficulty: DIFF, tyreWear: WEAR } });
  if (g.apex && typeof g.apex.seed === "function") { g.apex.seed(seed); await g.race(TRACK); }
  g.aiOnly();
  const cars = g.G.cars.filter((c) => !c.isPlayer && !c.human);
  const AiDrive = g.sandbox.AiDrive;
  const tr = createStuckTracker();
  for (let f = 0; f < Math.round(SECONDS / DT); f++) {
    g.step(1, DT);
    for (const c of cars) {
      tr.sample(c.code, {
        stuckT: c.stuckT, rescueT: c.rescueT, pitBox: c.pitState === "box",
        threshold: AiDrive.stuckThreshold({ awareness: c.awareness != null ? c.awareness : 0.75 }),
      }, DT);
    }
  }
  g.close();
  return tr.report();
}

const perRun = [];
for (let i = 0; i < RUNS; i++) perRun.push(await measure(i + 1));

const byCar = new Map();
for (const rep of perRun) for (const r of rep) {
  const t = byCar.get(r.id) || { id: r.id, stuckEpisodes: 0, rescues: 0, stuckS: 0, maxStuckT: 0 };
  t.stuckEpisodes += r.stuckEpisodes; t.rescues += r.rescues; t.stuckS += r.stuckS; t.maxStuckT = Math.max(t.maxStuckT, r.maxStuckT);
  byCar.set(r.id, t);
}
const cars = [...byCar.values()].sort((a, b) => b.rescues - a.rescues || b.stuckEpisodes - a.stuckEpisodes);
const total = { stuckEpisodes: 0, rescues: 0, stuckS: 0 };
for (const c of cars) { total.stuckEpisodes += c.stuckEpisodes; total.rescues += c.rescues; total.stuckS += c.stuckS; }
const out = { track: TRACK, difficulty: DIFF, seconds: SECONDS, wear: WEAR, runs: RUNS, seeds: perRun.map((_, i) => i + 1), total, cars };

if (argv.includes("--json")) console.log(JSON.stringify(out, null, 2));
else {
  console.log(`${TRACK} / ${DIFF} / ${cars.length} AI cars / ${SECONDS} s / wear ${WEAR} / ${RUNS} run(s), seeds 1-${RUNS}`);
  console.log(`  total  ${total.stuckEpisodes} stuck episode(s), ${total.rescues} rescue(s), ${total.stuckS.toFixed(1)} car-s past the dig-out threshold`);
  for (const c of cars.filter((x) => x.stuckEpisodes || x.rescues)) {
    console.log(`  ${c.id.padEnd(4)} episodes ${String(c.stuckEpisodes).padStart(2)}  rescues ${String(c.rescues).padStart(2)}  stuck ${c.stuckS.toFixed(1)} s  max stuckT ${c.maxStuckT.toFixed(2)}`);
  }
  if (!total.stuckEpisodes && !total.rescues) console.log("  no car crossed the dig-out threshold in this window (none seen, not proof of none)");
}
