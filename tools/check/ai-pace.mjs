#!/usr/bin/env node
/**
 * @doc How fast is the AI field, per circuit and per difficulty? Simulated laps in the VM, no browser, no renderer.
 * @skill ai-racecraft
 * ai-pace.mjs — the AI's lap time, measured rather than guessed.
 *
 * `js/physics/consts.js`'s DIFF table scales the field's pace, and every
 * change to the AI's STEERING moves lap time too — a controller that carries
 * more speed through a corner is a difficulty change nobody asked for. There
 * was no instrument for that: `physics-characterization` gates the PLAYER's
 * physics, `ai-racecraft-vm` gates the SHAPE of the AI's driving (jitter,
 * approach, line), and neither prints a lap time. This does.
 *
 * It boots the real game in `tools/lib/game-vm.cjs` (no renderer, no browser),
 * races the AI field with the player parked out of the way, and times each
 * car's laps off its own lap counter at a fixed step. The number that matters
 * is the FIELD MEDIAN — one car can have a scruffy lap, the median cannot.
 *
 * Sim time, not wall time: `step()` advances a fixed dt, so the result is
 * deterministic for a seed and independent of how loaded this box is.
 *
 *   node tools/check/ai-pace.mjs                      monza, all three notches
 *   node tools/check/ai-pace.mjs --track spa --laps 3
 *   node tools/check/ai-pace.mjs --diff normal --json
 *
 * Reading it: compare a tree against its base, not against absolutes. A shift
 * over ~0.5 % on one circuit and not the others is the controller favouring
 * that layout (measured: the heading-state controller took 1.4 % off Monaco
 * and nothing off Monza or Spa — docs/notes/RACING-LINE-RESEARCH.md §8).
 */
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { createGame } = require(path.join(ROOT, "tools/lib/game-vm.cjs"));

const argv = process.argv.slice(2);
const flag = (name, def) => {
  const i = argv.indexOf("--" + name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : def;
};
const has = (name) => argv.includes("--" + name);

const TRACK = flag("track", "monza");
const LAPS = Math.max(1, +flag("laps", 2));
const DIFFS = flag("diff", null) ? [flag("diff")] : ["easy", "normal", "hard"];
const DT = 1 / 60;
// A lap of Monaco is ~65 s of sim; give every circuit generous headroom plus a
// rolling start, then stop the moment the field has the laps we asked for.
const MAX_STEPS = Math.round((90 * (LAPS + 1) + 60) / DT);

const median = (a) => {
  const s = a.slice().sort((x, y) => x - y);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const mmss = (t) => `${Math.floor(t / 60)}:${(t % 60).toFixed(3).padStart(6, "0")}`;

/** Times every AI car's laps by watching its own lap counter tick. */
async function paceOf(difficulty) {
  const g = await createGame({ track: TRACK, storage: { difficulty } });
  const cars = g.G.cars.filter((c) => !c.isPlayer && !c.human);
  if (!cars.length) throw new Error("ai-pace: no AI cars in the field");
  const seen = cars.map((c) => c.lap || 0), laps = cars.map(() => []);
  let t = 0;
  for (let f = 0; f < MAX_STEPS; f++) {
    g.step(1, DT);
    t += DT;
    for (let i = 0; i < cars.length; i++) {
      const lap = cars[i].lap || 0;
      if (lap > seen[i]) {
        // The first tick is the OUT lap (a standing start is not a lap time).
        if (laps[i].length || seen[i] > 0) laps[i].push(t - (laps[i]._last || 0));
        laps[i]._last = t;
        seen[i] = lap;
      }
    }
    if (laps.every((l) => l.length >= LAPS)) break;
  }
  const best = laps.filter((l) => l.length).map((l) => Math.min(...l));
  return { difficulty, cars: cars.length, timed: best.length, best, median: best.length ? median(best) : null };
}

const out = [];
for (const d of DIFFS) out.push(await paceOf(d));

if (has("json")) {
  console.log(JSON.stringify({ track: TRACK, laps: LAPS, results: out }, null, 2));
} else {
  console.log(`${TRACK} — best of ${LAPS} timed lap(s) per AI car, sim time`);
  console.log("difficulty   cars  timed   median best      fastest    slowest");
  for (const r of out) {
    if (!r.timed) { console.log(`${r.difficulty.padEnd(12)} ${String(r.cars).padStart(4)}      0   — no car completed a lap`); continue; }
    console.log(`${r.difficulty.padEnd(12)} ${String(r.cars).padStart(4)} ${String(r.timed).padStart(6)}` +
      `   ${mmss(r.median).padStart(9)}  ${mmss(Math.min(...r.best)).padStart(9)}  ${mmss(Math.max(...r.best)).padStart(9)}`);
  }
  const norm = out.find((r) => r.difficulty === "normal" && r.median);
  for (const r of out) {
    if (norm && r !== norm && r.median) console.log(`  ${r.difficulty} is ${((r.median / norm.median - 1) * 100).toFixed(2)} % vs normal`);
  }
}
