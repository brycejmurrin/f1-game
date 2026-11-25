#!/usr/bin/env node
/**
 * @doc Per-corner apex and minimum speeds from a headless VM lap, against cited real 2025 pole-lap minimums.
 * @skill tune-physics
 * corner-speeds.mjs — how fast the car really goes through each corner (#6563 R1a).
 *
 * An INSTRUMENT: it changes no physics. One AI car (default: the fastest
 * scripted car, tierV x skill) runs alone on the circuit from a fixed seed,
 * the player benched (game-vm aiOnly()), every other car retired, exactly as
 * tools/check/ai-solo.mjs does. Each fixed 1/60 s step records the car's arc
 * position and speed. On the fastest of `--laps` flying laps, every corner of
 * __apex.trackInfo({what:"corners"}) gets:
 *   minKph   the lowest speed between the corner's entryS and exitS
 *   apexKph  the speed at the sample nearest the corner's apex s
 * Both are on the PACE-1 scale (vStd: v * VMAX / vTop(), docs/PHYSICS.md §PACE)
 * so a run at any OVERALL SPEED compares with the same reference; `rawMinKph`
 * is the ground speed as driven.
 *
 * tests/data/corner-speed-refs.json holds the real minimums (OpenF1 2025 pole
 * laps, each row cited). A ref row matches one game corner, or a span `turn`..`to`
 * (the minimum over the span); `ratio` is ours / real.
 *
 *   node tools/check/corner-speeds.mjs                     monza, hard, 1 flying lap
 *   node tools/check/corner-speeds.mjs --track silverstone,suzuka --laps 2
 *   node tools/check/corner-speeds.mjs --refs --json       every circuit that has refs
 *   every run: --diff hard  --seed 1  --car RUS  --pace 1   (pace: OVERALL SPEED, default 1)
 *
 * Why PACE 1 by default: PACE scales VMAX and ACCEL, but lateral grip and
 * braking are absolute (#6563), so a corner's GROUND speed barely moves with
 * PACE while vStd divides by it. At PACE 1 vStd is the identity, the reading
 * the audit's "PACE 1" columns use; `--pace 0.8396` (shipped) shows how far
 * the PACE-1 equivalent drifts from the ground speed (`rawMinKph`).
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const REFS_PATH = path.join(ROOT, "tests/data/corner-speed-refs.json");

const DT = 1 / 60;
const TURN_RE = /^T\d+$/;

/** True when arc position s lies in [a, b] on a lap of length L (the window may wrap the line). */
export function inWindow(s, a, b) {
  return a <= b ? s >= a && s <= b : s >= a || s <= b;
}

/** The turn numbers a game label covers: "T7" → [7], "T12-T13" → [12, 13], "T7-T9" → [7, 8, 9]. */
export function turnNumbers(label) {
  const m = String(label).match(/^T(\d+)(?:-T(\d+))?$/);
  if (!m) return [];
  const a = +m[1], b = m[2] ? +m[2] : a;
  const out = [];
  for (let n = a; n <= b; n++) out.push(n);
  return out;
}

/**
 * Per-corner speeds from one lap's samples.
 * samples: [{ s, v }] (v in m/s, ground speed); corners: trackInfo corners;
 * std: m/s → PACE-1 m/s (vStd). Returns one row per corner.
 */
export function cornerSpeeds(samples, corners, std = (v) => v) {
  return corners.map((c) => {
    let min = Infinity, apex = null, best = Infinity;
    for (const p of samples) {
      if (inWindow(p.s, c.entryS, c.exitS) && p.v < min) min = p.v;
      const d = Math.abs(p.s - c.s);
      if (d < best) { best = d; apex = p.v; }
    }
    const kph = (v) => (v == null || !Number.isFinite(v) ? null : +(std(v) * 3.6).toFixed(1));
    return {
      turn: c.turn, s: c.s, entryS: c.entryS, exitS: c.exitS, radiusM: c.radiusM, severity: c.severity,
      minKph: kph(min), apexKph: kph(apex), rawMinKph: Number.isFinite(min) ? +(min * 3.6).toFixed(1) : null,
    };
  });
}

/** The game rows a ref covers: its `turn`, or every row from `turn` through `to` (by turn number). */
export function rowsForRef(ref, rows) {
  const lo = turnNumbers(ref.turn)[0], hi = ref.to ? turnNumbers(ref.to)[0] : lo;
  return rows.filter((r) => turnNumbers(r.turn).some((n) => n >= lo && n <= hi));
}

/** Join refs to measured rows: ours = min over the matched rows' minKph; ratio = ours / real. */
export function compareRefs(refs, rows) {
  return refs.map((ref) => {
    const hit = rowsForRef(ref, rows).filter((r) => r.minKph != null);
    const ours = hit.length ? Math.min(...hit.map((r) => r.minKph)) : null;
    return {
      name: ref.name, turn: ref.to ? `${ref.turn}..${ref.to}` : ref.turn, realKph: ref.minKph, approx: !!ref.approx,
      oursKph: ours, ratio: ours == null ? null : +(ours / ref.minKph).toFixed(3), matched: hit.map((r) => r.turn),
    };
  });
}

/** Every problem with a refs document (an empty array is a valid file). */
export function validateRefs(doc) {
  const errs = [];
  if (!doc || typeof doc !== "object") return ["refs: not an object"];
  const sources = doc.sources || {};
  for (const [k, v] of Object.entries(sources)) if (typeof v !== "string" || !/https:\/\//.test(v)) errs.push(`sources.${k}: no https URL`);
  const circuits = doc.circuits || {};
  if (!Object.keys(circuits).length) errs.push("circuits: empty");
  for (const [id, c] of Object.entries(circuits)) {
    if (!Number.isInteger(c.session)) errs.push(`${id}: session not an integer`);
    if (!Number.isInteger(c.driver)) errs.push(`${id}: driver not an integer`);
    if (!Array.isArray(c.corners) || !c.corners.length) { errs.push(`${id}: no corners`); continue; }
    c.corners.forEach((r, i) => {
      const at = `${id}.corners[${i}]`;
      if (typeof r.name !== "string" || !r.name) errs.push(`${at}: no name`);
      if (!TURN_RE.test(r.turn || "")) errs.push(`${at}: turn "${r.turn}" is not Tn`);
      if (r.to != null && (!TURN_RE.test(r.to) || turnNumbers(r.to)[0] <= turnNumbers(r.turn)[0])) errs.push(`${at}: to "${r.to}" does not follow turn`);
      if (!(Number.isFinite(r.minKph) && r.minKph > 20 && r.minKph < 360)) errs.push(`${at}: minKph ${r.minKph} out of range`);
      if (!sources[r.source]) errs.push(`${at}: source "${r.source}" not in sources`);
    });
  }
  return errs;
}

export function loadRefs(file = REFS_PATH) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

/**
 * One headless lap set on one circuit. opts: { track, difficulty, laps, seed, car, pace, refs }.
 * Returns { track, car, pace, lapS, corners, refs }.
 */
export async function measure(opts) {
  const { createGame } = require(path.join(ROOT, "tools/lib/game-vm.cjs"));
  const { track, difficulty = "hard", laps = 1, seed = 1, car = null, pace = null, refs = null } = opts;
  const g = await createGame({ track, storage: { difficulty, tyreWear: "off" } });
  const custom = g.sandbox.Teams.LIST.findIndex((t) => t.custom);
  g.close();
  const h = await createGame({ track, storage: { difficulty, tyreWear: "off", team: custom, driver: 0 } });
  try {
    if (pace != null) h.apex.setPhysics({ pace });
    h.apex.seed(seed);
    await h.race(track);
    h.aiOnly();
    const cars = h.G.cars;
    const pool = cars.filter((c) => !c.retired && !c.isPlayer && !(c.team && c.team.custom));
    const c = car ? pool.find((x) => x.code === car) : pool.slice().sort((a, b) => b.tierV * b.skill - a.tierV * a.skill)[0];
    if (!c) throw new Error(`car ${car} not on the grid`);
    cars.forEach((x, j) => { if (x !== c && !x.retired) h.apex.retire(j, "bench"); });
    const VMAX = h.sandbox.PhysicsConsts.VMAX;
    // vStd (js/race/pace-math.js): the PACE-1 equivalent of a ground speed.
    const std = (v) => v * VMAX / h.G.vTop();
    const info = h.apex.trackInfo({ what: "corners" });
    const maxSteps = Math.round((240 * (laps + 1)) / DT);
    let seen = c.lap || 0, t = 0, last = null, cur = null;
    const done = [];
    for (let f = 0; f < maxSteps && done.length < laps; f++) {
      h.step(1, DT);
      t += DT;
      if (c.retired) break;
      const lap = c.lap || 0;
      if (lap > seen) {
        if (cur) done.push({ time: t - last, samples: cur });
        cur = []; last = t; seen = lap;
      }
      if (cur) cur.push({ s: c.s, v: c.speed });
    }
    if (!done.length) throw new Error(`${track}: no flying lap completed`);
    const bestLap = done.reduce((a, b) => (b.time < a.time ? b : a));
    const rows = cornerSpeeds(bestLap.samples, info.corners, std);
    const refRows = refs && refs.circuits[track] ? compareRefs(refs.circuits[track].corners, rows) : [];
    return {
      track, difficulty, seed, car: c.code, pace: +h.G.PACE.toFixed(4), vTopKph: +(h.G.vTop() * 3.6).toFixed(1),
      lapS: +bestLap.time.toFixed(3), laps: done.map((l) => +l.time.toFixed(3)), corners: rows, refs: refRows,
    };
  } finally { h.close(); }
}

const HELP = `corner-speeds — per-corner apex/min speeds from a headless VM lap (no browser)

  node tools/check/corner-speeds.mjs [--track monza[,spa] | --refs] [--laps 1]
       [--diff hard] [--seed 1] [--car RUS] [--pace 1] [--json]

Speeds are on the PACE-1 scale (vStd); --pace defaults to 1, where vStd is the
identity (grip is absolute, so corner ground speed barely moves with PACE). --refs runs every circuit in
tests/data/corner-speed-refs.json and prints ours / real per cited corner.
Changes nothing. Owned by tune-physics (#6563 R1a).`;

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) { console.log(HELP); return 0; }
  const flag = (name, def) => {
    const i = argv.indexOf("--" + name);
    return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : def;
  };
  const refs = loadRefs();
  const errs = validateRefs(refs);
  if (errs.length) { console.error(errs.join("\n")); return 2; }
  const tracks = argv.includes("--refs") ? Object.keys(refs.circuits) : String(flag("track", "monza")).split(",");
  const pace = flag("pace", "1");
  const out = [];
  for (const track of tracks) {
    const r = await measure({ track, refs, difficulty: flag("diff", "hard"), laps: Math.max(1, +flag("laps", 1)),
      seed: +flag("seed", 1) || 1, car: flag("car", null), pace: pace == null ? null : +pace });
    out.push(r);
    if (argv.includes("--json")) continue;
    console.log(`\n${track} · ${r.difficulty} · ${r.car} · PACE ${r.pace} (vTop ${r.vTopKph} km/h) · best lap ${r.lapS} s`);
    console.log("  turn      sev     r m   min  apex   raw  (km/h; min/apex on the PACE-1 scale, raw = ground)");
    for (const x of r.corners) console.log(`  ${String(x.turn).padEnd(9)} ${String(x.severity).padEnd(6)} ${String(Math.round(x.radiusM)).padStart(5)} ${String(x.minKph).padStart(5)} ${String(x.apexKph).padStart(5)} ${String(x.rawMinKph).padStart(5)}`);
    for (const x of r.refs) console.log(`  ref ${x.name.padEnd(20)} ${x.turn.padEnd(8)} real ${x.realKph}${x.approx ? "~" : ""}  ours ${x.oursKph}  ratio ${x.ratio}`);
  }
  if (argv.includes("--json")) console.log(JSON.stringify(out, null, 2));
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => process.exit(code), (e) => { console.error(e && e.stack || e); process.exit(1); });
}
