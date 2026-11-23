#!/usr/bin/env node
/**
 * @doc Qualifying calibration (VM): measures solo flying laps and writes `tests/data/quali-calibration.json`.
 * @skill race-weekend
 *
 *   node tools/check/quali-calibrate.mjs --update [--jobs 3] [--track monza,spa]   # drive + model, rewrite the file
 *   node tools/check/quali-calibrate.mjs --model-only [--jobs 3]                   # keep the driven laps, refresh the model column
 *   node tools/check/quali-calibrate.mjs --verify monza                            # re-measure one circuit, compare to the file
 *
 * THE MEASUREMENT behind the per-circuit factor of js/race/quali-model.js (CALIB). Per circuit and level
 * (easy, normal, hard) it boots the real game in the Node VM (tools/lib/game-vm.cjs; no browser) at the shipped
 * PACE, reads the works cars in grid slots i % 4 == 1 or 3, and gives each one a solo run from the
 * production qualifying rolling start. Every measured lap begins with the first line crossing and
 * ends at the second. Beside it records the uncalibrated lap for the same car and starting grip
 * (Quali.carLap(c, track, grip, true)).
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
export const METHOD = Object.freeze({ pace: 0.8396, seed: 1, slots: [1, 3], laps: 1, start: "qualifying-rolling", hz: 60, levels: ["easy", "normal", "hard"] });
const CAP_S = 240;

export function circuits(root = ROOT) {
  return fs.readdirSync(path.join(root, "js/circuits")).filter((f) => f.endsWith(".js")).map((f) => f.slice(0, -3)).sort();
}

/** Drive one works car through a real qualifying session with the AI keeping control. */
export async function flyingLap(g, track, ai) {
  const { apex, G } = g;
  G.teamIdx = g.sandbox.Teams.LIST.indexOf(ai.team);
  G.driverIdx = ai.seat;
  G.session = "quali";
  apex.seed(METHOD.seed);
  await G.startRace();
  const car = G.player;
  if (G.state !== "count" || G.cars.length !== 1 || car?.driverId !== ai.driverId) {
    throw new Error(`${track}: qualifying did not stage ${ai.driverId} alone`);
  }
  // The local seat loads player setup channels. Use its works-car AI values,
  // including the tuned AI ERS deployment and regeneration, through the lap.
  for (const key of ["tierV", "skill", "aeroLoad", "ersDeploy", "ersRegen", "tread", "lane", "lanePref"]) {
    car[key] = ai[key];
  }
  const setCarRole = G.setCarRole;
  G.setCarRole = (c, human, local) => setCarRole(c, c === car ? false : human, local);
  try {
    g.step(1, 1 / METHOD.hz);
    if (G.state !== "race" || !G.flyingStart.owns(car) || !(car.prog < 0 && car.speed > 0) || car.lap !== 0) {
      throw new Error(`${track} ${ai.code}: qualifying rolling start did not arm`);
    }
    for (let f = 1; f <= CAP_S * METHOD.hz; f++) {
      g.step(1, 1 / METHOD.hz);
      if (car.lap === 2 && Number.isFinite(car.best) && !car.qualiCut) return Math.round(car.best * METHOD.hz);
      if (car.retired || car.finished || G.state !== "race") break;
    }
    throw new Error(`${track} ${ai.code}: no valid qualifying lap (lap ${car.lap}, cut ${car.qualiCut}, state ${G.state})`);
  } finally {
    G.setCarRole = setCarRole;
  }
}

/** One circuit and every difficulty, sorted by grid slot. The model-only mode preserves driven frames. */
async function measure(track, driven) {
  const { createGame } = require("../lib/game-vm.cjs");
  const out = {};
  for (const difficulty of METHOD.levels) {
    const g = await createGame({ track, carMeshes: false, storage: { difficulty }, search: "?seed=" + METHOD.seed });
    try {
      const { apex, G } = g;
      apex.headless(true);
      await g.race(track, "day", "dry", { laps: 3 });
      if (G.difficulty !== difficulty) throw new Error(`${track}: level ${difficulty} did not take`);
      if (Math.abs(G.PACE - METHOD.pace) > 0.001) throw new Error(`${track}: PACE ${G.PACE}, want the shipped ${METHOD.pace}`);
      const quali = g.sandbox.Quali.create(G);
      const sample = Array.from(G.cars.entries()).filter(([i, c]) => !c.isPlayer && METHOD.slots.includes(i % 4));
      const rows = sample.map(([i, c]) => [i, c.code, null, Math.round(quali.carLap(c, G.track, G.gripMult(c), true) * 1000)]);
      const previous = driven && new Map(driven[difficulty].map((row) => [row[0], row]));
      for (const [j, [i, c]] of sample.entries()) {
        if (previous) {
          const was = previous.get(i);
          if (was?.[1] !== c.code) throw new Error(`${track} ${difficulty}: slot ${i} changed drivers; run --update`);
          rows[j][2] = was[2];
        } else rows[j][2] = await flyingLap(g, track, c);
      }
      out[difficulty] = rows;
    } finally { g.close(); }
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
    `  "_about": "MEASURED by node tools/check/quali-calibrate.mjs --update (never by hand, never in CI). Rows: [grid slot, driver, qualifying flying lap in 1/60 s frames, the model's uncalibrated lap in ms]. tools/gen/gen-quali-calib.mjs turns it into CALIB in js/race/quali-model.js.",\n` +
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
  if (new Set(ids).size !== ids.length) throw new Error("A circuit may appear only once in --track");
  for (const id of ids) if (!all.includes(id)) throw new Error("unknown circuit " + id);
  const file = path.join(ROOT, DATA);
  const existing = fs.existsSync(file) ? read() : null;
  const sameMethod = JSON.stringify(existing?.method) === JSON.stringify(METHOD);
  if (!sameMethod && (modelOnly || ids.length !== all.length)) {
    throw new Error("The measurement method has changed; run a full calendar --update first");
  }
  const cells = sameMethod ? existing.cells : {};
  if (modelOnly) for (const id of ids) if (!cells[id]) throw new Error(`${id}: no driven laps in ${DATA}; run --update`);
  Object.assign(cells, await pool(ids, jobs, modelOnly ? "model" : "drive"));
  fs.writeFileSync(file, render(cells));
  console.log(`quali-calibrate: ${ids.length} circuit(s) ${modelOnly ? "re-modelled" : "measured"} → ${DATA}; now run npm run gen`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === SELF) main().catch((e) => { console.error(String(e && e.stack || e)); process.exitCode = 1; });
