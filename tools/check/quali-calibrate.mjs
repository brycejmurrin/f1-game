#!/usr/bin/env node
/**
 * @doc Qualifying calibration (VM): drives the clear-air AI field per circuit, writes `tests/data/quali-calibration.json`.
 * @skill race-weekend
 *
 *   node tools/check/quali-calibrate.mjs --update [--jobs 3] [--track monza,spa]   # drive + model, rewrite the file
 *   node tools/check/quali-calibrate.mjs --model-only [--jobs 3]                   # keep the driven laps, refresh the model column
 *   node tools/check/quali-calibrate.mjs --verify monza                            # re-measure one circuit, compare to the file
 *
 * THE MEASUREMENT behind the per-circuit factor of js/race/quali-model.js (CALIB). Per circuit and level
 * (easy, normal, hard) it boots the real game in the Node VM (tools/lib/game-vm.cjs; no browser) at the shipped
 * PACE and drives two thinned AI-only fields in clear air (grid slots i % 4 == 1 and i % 4 == 3, the rest
 * retired and lifted off the road), each car's best of LAPS timed laps. Beside every driven lap it records the
 * model's UNCALIBRATED lap for the same car (Quali.carLap(c, track, grip, true)).
 *
 * The file is a measurement, not a build product: about 30 CPU-minutes for the calendar, so it is NEVER part of
 * `npm run gen` or CI. `tools/gen/gen-quali-calib.mjs` (which IS in gen and gen:check) turns the file into the
 * CALIB block by arithmetic alone.
 *
 * DETERMINISTIC, byte for byte: every cell runs in its own process on the VM's fixed seed (?seed=1), fixed grid
 * slots, a fixed 1/60 s step; a driven lap is an integer FRAME count and a model lap integer milliseconds; no
 * clock, host or order reaches the file, and keys are written sorted. `--verify <id>` proves it for one circuit.
 *
 * WHEN TO RE-RUN: tests/unit/quali-absolute-parity-vm.test.mjs fails after a change to how the AI drives
 * (`--update`), or to the model's integrated lap (`--model-only`). Then `npm run gen` and commit both files.
 * The test drives a DIFFERENT sample (slots i % 4 == 0), so it is a check of this file, not a copy of it.
 */
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const SELF = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SELF), "../..");
export const DATA = "tests/data/quali-calibration.json";
export const METHOD = Object.freeze({ pace: 0.8396, seed: 1, slots: [1, 3], laps: 3, hz: 60, levels: ["easy", "normal", "hard"] });
const CAP_S = 900;

export function circuits(root = ROOT) {
  return fs.readdirSync(path.join(root, "js/circuits")).filter((f) => f.endsWith(".js")).map((f) => f.slice(0, -3)).sort();
}

/** One circuit, every level: { level: [[gridIndex, code, bestFrames|null, modelMs], …] } sorted by grid index.
 *  `driven` (the file's rows for this circuit) skips the driving and keeps its frame counts. */
async function measure(track, driven) {
  const { createGame } = require("../lib/game-vm.cjs");
  const out = {};
  for (const difficulty of METHOD.levels) {
    const rows = new Map();
    for (const keep of METHOD.slots) {
      const g = await createGame({ track, carMeshes: false, storage: { difficulty }, search: "?seed=" + METHOD.seed });
      try {
        const a = g.apex, G = g.G;
        a.headless(true);
        await g.race(track, "day", "dry", { laps: METHOD.laps + 2 });
        if (G.difficulty !== difficulty) throw new Error(`${track}: level ${difficulty} did not take`);
        if (Math.abs(G.PACE - METHOD.pace) > 0.001) throw new Error(`${track}: PACE ${G.PACE}, want the shipped ${METHOD.pace}`);
        const quali = g.sandbox.Quali.create(G);
        const idx = [];
        G.cars.forEach((c, i) => { if (!c.isPlayer && i % 4 === keep) idx.push(i); });
        // The model column first, on the staged grid: nothing below may move it.
        for (const i of idx) { const c = G.cars[i]; rows.set(i, [i, c.code, null, Math.round(quali.carLap(c, G.track, G.gripMult(c), true) * 1000)]); }
        if (driven) continue;
        g.aiOnly();
        G.cars.forEach((c, i) => { if (!c.retired && i % 4 !== keep) a.retire(i, "bench"); });
        // Off the road, not parked on it (tests/unit/quali-pace-parity-vm.test.mjs, #5510).
        G.cars.forEach((c) => { if (c.retired) { c.x = (c.x >= 0 ? 1 : -1) * 500; c.xVis = c.x; c.parkedOnRoad = false; } });
        const live = []; G.cars.forEach((c, i) => { if (!c.retired) live.push(i); });
        const cars = live.map((i) => G.cars[i]);
        const seen = cars.map((c) => c.lap || 0), last = cars.map(() => null), laps = cars.map(() => []);
        for (let f = 1; f <= CAP_S * METHOD.hz && laps.some((l) => l.length < METHOD.laps); f++) {
          g.step(1, 1 / METHOD.hz);
          cars.forEach((c, i) => { if ((c.lap || 0) > seen[i]) { if (last[i] != null) laps[i].push(f - last[i]); last[i] = f; seen[i] = c.lap; } });
        }
        live.forEach((i, j) => {
          const c = G.cars[i];
          const row = rows.get(i) || [i, c.code, null, Math.round(quali.carLap(c, G.track, G.gripMult(c), true) * 1000)];
          row[2] = laps[j].length ? Math.min(...laps[j]) : null;
          rows.set(i, row);
        });
      } finally { g.close(); }
    }
    const list = [...rows.values()].sort((x, y) => x[0] - y[0]);
    if (driven) {
      const was = new Map((driven[difficulty] || []).map((r) => [r[0], r]));
      for (const r of list) {
        const w = was.get(r[0]);
        if (!w || w[1] !== r[1]) throw new Error(`${track} ${difficulty}: grid slot ${r[0]} is ${r[1]}, the file has ${w ? w[1] : "no row"} — the grid changed, run --update`);
        r[2] = w[2];
      }
    }
    out[difficulty] = list;
  }
  return out;
}

export function read(root = ROOT) { return JSON.parse(fs.readFileSync(path.join(root, DATA), "utf8")); }

/** The file's bytes: one row per line, circuits sorted. */
export function render(cells) {
  const ids = Object.keys(cells).sort();
  const body = ids.map((id) => `    ${JSON.stringify(id)}: {\n` + METHOD.levels.map((lv) =>
    `      ${JSON.stringify(lv)}: [\n` + cells[id][lv].map((r) => "        " + JSON.stringify(r)).join(",\n") + "\n      ]").join(",\n") + "\n    }").join(",\n");
  return "{\n" +
    `  "_about": "MEASURED by node tools/check/quali-calibrate.mjs --update (never by hand, never in CI). Rows: [grid slot, driver, best driven lap in 1/60 s frames, the model's uncalibrated lap in ms]. tools/gen/gen-quali-calib.mjs turns it into CALIB in js/race/quali-model.js.",\n` +
    `  "method": ${JSON.stringify(METHOD)},\n` +
    `  "cells": {\n${body}\n  }\n}\n`;
}

function child(args) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [SELF, ...args], { cwd: ROOT, stdio: ["ignore", "pipe", "inherit"] });
    let s = "";
    p.stdout.on("data", (d) => { s += d; });
    p.on("close", (code) => {
      if (code !== 0) return reject(new Error(`${args.join(" ")}: exit ${code}`));
      try { resolve(JSON.parse(s.slice(s.lastIndexOf("\n@@") + 3))); } catch (e) { reject(new Error(`${args.join(" ")}: unreadable result`)); }
    });
  });
}

async function pool(ids, jobs, mode) {
  const out = {}, queue = ids.slice();
  await Promise.all(Array.from({ length: Math.max(1, jobs) }, async () => {
    for (let id; (id = queue.shift());) {
      out[id] = await child(["--cell", id, ...(mode === "model" ? ["--keep-driven"] : [])]);
      process.stderr.write(`${id} ok (${Object.keys(out).length}/${ids.length})\n`);
    }
  }));
  return out;
}

async function main() {
  const argv = process.argv.slice(2);
  const val = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
  if (argv.includes("--cell")) {            // internal: one circuit in its own process
    const id = val("--cell");
    const cells = await measure(id, argv.includes("--keep-driven") ? read().cells[id] : null);
    process.stdout.write("\n@@" + JSON.stringify(cells));
    return;
  }
  const jobs = +(val("--jobs") || 1);
  if (argv.includes("--verify")) {
    const id = val("--verify");
    const want = read().cells[id], got = await child(["--cell", id]);
    const same = JSON.stringify(want) === JSON.stringify(got);
    console.log(same ? `quali-calibrate: ${id} reproduces the file exactly` : `DRIFT  ${id}: a fresh measurement differs from ${DATA} (the AI's driving or the model changed: --update)`);
    process.exitCode = same ? 0 : 1;
    return;
  }
  const update = argv.includes("--update"), modelOnly = argv.includes("--model-only");
  if (!update && !modelOnly) {
    console.log("usage: quali-calibrate.mjs --update [--jobs n] [--track a,b] | --model-only [--jobs n] | --verify <id>");
    process.exitCode = 2;
    return;
  }
  const all = circuits();
  const ids = val("--track") ? val("--track").split(",") : all;
  for (const id of ids) if (!all.includes(id)) throw new Error("unknown circuit " + id);
  const file = path.join(ROOT, DATA);
  const cells = fs.existsSync(file) ? read().cells : {};
  if (modelOnly) for (const id of ids) if (!cells[id]) throw new Error(`${id}: no driven laps in ${DATA}; run --update`);
  Object.assign(cells, await pool(ids, jobs, modelOnly ? "model" : "drive"));
  fs.writeFileSync(file, render(cells));
  console.log(`quali-calibrate: ${ids.length} circuit(s) ${modelOnly ? "re-modelled" : "measured"} → ${DATA}; now run npm run gen`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === SELF) main().catch((e) => { console.error(String(e && e.stack || e)); process.exitCode = 1; });
