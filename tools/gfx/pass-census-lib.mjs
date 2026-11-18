#!/usr/bin/env node
// pass-census-lib.mjs — the parked-camera cell of pass-census, its key, and the exact baseline compare.
// @doc Pure helpers for pass-census --park: the exact cell, its key, the baseline compare and --collect.
// @skill renderer-debug
//
// #4783 row 1. A driven census is not exact between runs (docs/notes/PERF-CENSUS-WEBGPU-2026-11-04.md: main-pass calls
// move by 0.1 to 0.2 a frame and the shadow target fires on a different number of frames), so the gate is on a PARKED
// frame: frozen sim, camera snapped to a fixed fraction of the lap, tier and render scale pinned. A parked pass draws
// the same thing every time it runs, so what is compared is the count PER RENDER of each pass (its minimum and its
// maximum over the window), never a per-frame mean, which carries the pass's cadence.
//
// The compare is exact: no tolerance exists here, and adding one is Bryce's call (#4783).
//
//   node tools/gfx/pass-census-lib.mjs --collect DIR --run RUN_ID --sha SHA   # print a baseline from DIR/*.json
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** The memory counter a parked cell GATES on (three's renderer.info.memory through tlx.js memState().resources).
 *  Only `renderTargets`, the one that was the same in every cell of every run (16 of 16). The others are lifetime
 *  totals that are not the same on two boots of one tree, with every pass count identical: `geometries` 193 vs 194 and
 *  `uniformBuffers` 352 vs 362 (monza, SwiftShader WebGL2), and `textures` 40 vs 39 on the phone tier (monza helmet,
 *  perf-census-webgpu runs 42979924558 and 42983871455; #5451). They are printed and kept out of the exact compare. */
export const PARK_MEMORY_KEYS = Object.freeze(["renderTargets"]);
/** Printed with the cell, never compared. */
export const PARK_MEMORY_REPORTED = Object.freeze(["textures", "geometries", "uniformBuffers", "uniformBuffersSize"]);

/** One cell's identity: circuit, camera, tier, backend and where on the lap the camera is parked. */
export function parkKey({ track, camera, mobile, backend, at }) {
  return [track, camera || "default", mobile ? "mobile" : "desktop", backend, "at" + (at == null ? 0.1 : +at)].join("|");
}

/** rows: [passKey, drawCalls, triangles] per top-level render() → { passKey: { renders, calls: [min, max], tris: [min, max] } }. */
export function parkPasses(rows) {
  const out = {};
  for (const [key, calls, tris] of rows || []) {
    const e = out[key] || (out[key] = { renders: 0, calls: [calls, calls], tris: [tris, tris] });
    e.renders++;
    e.calls = [Math.min(e.calls[0], calls), Math.max(e.calls[1], calls)];
    e.tris = [Math.min(e.tris[0], tris), Math.max(e.tris[1], tris)];
  }
  return out;
}

/** What goes in the baseline for one cell: the counts, not the cadence (`renders` depends on the window). */
export function baselineCell(passes, memory) {
  const p = {};
  for (const k of Object.keys(passes || {}).sort()) p[k] = { calls: passes[k].calls, tris: passes[k].tris };
  const m = {};
  for (const k of PARK_MEMORY_KEYS) if (memory && typeof memory[k] === "number") m[k] = memory[k];
  return { passes: p, memory: m };
}

/** `rUboKB` flat once warm (#4783 row 4): three's uniform-buffer count and bytes at both ends of a parked window. */
export function uboFlat(start, end) {
  const fails = [];
  for (const k of ["uniformBuffers", "uniformBuffersSize"]) {
    const a = start && start[k], b = end && end[k];
    if (typeof a !== "number" || typeof b !== "number") fails.push(`${k} not reported (${a} -> ${b})`);
    else if (a !== b) fails.push(`${k} ${a} -> ${b} over the parked window`);
  }
  return fails;
}

/** Exact compare of one measured cell against the baseline file's content (null: no file).
 *  status: "no-baseline" (no file), "no-cell" (file without this key), "ok", "diff". */
export function compareParkBaseline(baseline, key, cell) {
  if (!baseline || !baseline.cells) return { status: "no-baseline", diffs: [] };
  const want = baseline.cells[key];
  if (!want) return { status: "no-cell", diffs: [`no baseline cell "${key}" (the file has ${Object.keys(baseline.cells).length})`] };
  const diffs = [], same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  for (const k of [...new Set([...Object.keys(want.passes || {}), ...Object.keys(cell.passes)])].sort()) {
    const w = (want.passes || {})[k], g = cell.passes[k];
    if (!w) diffs.push(`pass "${k}" is not in the baseline (calls ${g.calls} tris ${g.tris})`);
    else if (!g) diffs.push(`pass "${k}" did not run (baseline calls ${w.calls} tris ${w.tris})`);
    else {
      if (!same(w.calls, g.calls)) diffs.push(`pass "${k}" calls ${JSON.stringify(g.calls)} != baseline ${JSON.stringify(w.calls)}`);
      if (!same(w.tris, g.tris)) diffs.push(`pass "${k}" tris ${JSON.stringify(g.tris)} != baseline ${JSON.stringify(w.tris)}`);
    }
  }
  for (const k of PARK_MEMORY_KEYS) {
    const w = (want.memory || {})[k], g = cell.memory[k];
    if (w !== g) diffs.push(`memory.${k} ${g} != baseline ${w}`);
  }
  return { status: diffs.length ? "diff" : "ok", diffs };
}

/** Build a baseline from pass-census --park JSONs ({ summary: { park: { key, cell } } }). Two files with one key must agree. */
export function collectBaseline(files, source) {
  const cells = {}, conflicts = [];
  for (const { name, json } of files) {
    const park = json && json.summary && json.summary.park;
    if (!park || !park.key || !park.cell) continue;
    // Re-derived with the CURRENT key list, so a run recorded before a counter left the compare still collects.
    const cell = baselineCell(park.cell.passes, park.memoryEnd || park.cell.memory);
    if (cells[park.key] && JSON.stringify(cells[park.key]) !== JSON.stringify(cell)) conflicts.push(`${park.key} (${name})`);
    cells[park.key] = cell;
  }
  const sorted = {};
  for (const k of Object.keys(cells).sort()) sorted[k] = cells[k];
  return { baseline: { _doc: "pass-census --park exact baselines (#4783 row 1): per pass the [min, max] draw calls and triangles per render on a parked, frozen frame, and three's memory counters. Built by `node tools/gfx/pass-census-lib.mjs --collect`; never hand-edited. No tolerance: a diff is a change in what the frame draws.", source, cells: sorted }, conflicts };
}

function main(argv) {
  const arg = (n) => { const i = argv.indexOf(n); return i < 0 ? null : argv[i + 1]; };
  const dir = arg("--collect");
  if (!dir || argv.includes("--help") || argv.includes("-h")) {
    console.log("usage: node tools/gfx/pass-census-lib.mjs --collect DIR --run RUN_ID --sha SHA\n  prints the baseline JSON built from every pass-census --park --json file in DIR; exit 1 when two files disagree on one cell");
    return dir ? 0 : 2;
  }
  const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort().map((name) => {
    try { return { name, json: JSON.parse(readFileSync(join(dir, name), "utf8")) }; } catch (_) { return { name, json: null }; }
  });
  const { baseline, conflicts } = collectBaseline(files, { run: arg("--run"), sha: arg("--sha"), adapter: arg("--adapter") || "Mesa lavapipe (software WebGPU)" });
  console.log(JSON.stringify(baseline, null, 1));
  for (const c of conflicts) console.error("pass-census-lib: two files disagree on cell " + c);
  return conflicts.length ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
