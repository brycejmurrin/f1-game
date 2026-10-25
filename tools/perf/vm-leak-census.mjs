#!/usr/bin/env node
// @doc VM leak census: live GPU handles, event listeners and timers across race → QUIT TO MENU cycles (count-based, exact).
// tools/perf/vm-leak-census.mjs — the CLI and the library behind tests/unit/perf-vm-leak-cycles.test.mjs.
//
// What it counts, in the real js/game.js booted by tools/lib/game-vm.cjs (no browser, no GPU):
//   - GPU handles the game asked the backend for and has not freed: createMesh / createTexMesh /
//     createChunkedMesh against freeMesh / freeChunkedMesh, createTexture against freeTexture,
//     createInstancedBatch against freeInstancedBatch. The game talks to every backend (GLX, TLX, WGX)
//     through this one contract (js/render/gfx.js), so a handle the game forgets leaks on all three.
//   - event listeners live on window, document and every element the game created or looked up
//     (add minus remove, keyed by type + function, the DOM's own dedupe rule).
//   - live setInterval handles, and every pending timer.
// Each reading is a NUMBER, not a heap size: the same seed gives the same count on every run
// (measured 2026-10-24: monza 33 meshes / 23 textures / 31 batches, spa 33 / 23 / 32, 110 window +
// 48 document listeners, identical on cycles 1–4), so a leak gate needs no tolerance.
//
//   node tools/perf/vm-leak-census.mjs [--circuits monza,spa] [--cycles 3] [--steps 240] [--json artifacts/perf/vm-leak-census.json]
//
// A browser renders, so TLX/WGX can still leak BELOW this contract (three's caches): that is
// tests/specs/track-switch-memory.spec.js and race-cycle-memory.spec.js. This census is the layer above.
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

const CREATE_FREE = [
  // [create, free, bucket]
  ["createMesh", "freeMesh", "meshes"],
  ["createTexMesh", "freeMesh", "meshes"],
  ["createChunkedMesh", "freeChunkedMesh", "meshes"],
  ["createTexture", "freeTexture", "textures"],
  ["createInstancedBatch", "freeInstancedBatch", "batches"],
];

/** Wrap the sandbox's browser surface before any game script runs (createGame's onSandbox hook).
 *  Returns the live census; read it with snapshot(). */
export function instrumentSandbox(sb) {
  const C = { listeners: new Map(), intervals: new Set(), live: { meshes: new Set(), textures: new Set(), batches: new Set() }, created: 0, freed: 0 };
  const seen = new WeakSet();
  const wrapTarget = (obj, scope) => {
    if (!obj || seen.has(obj) || typeof obj.addEventListener !== "function") return obj;
    seen.add(obj);
    const add = obj.addEventListener, rm = obj.removeEventListener;
    obj.addEventListener = function (type, fn, o) {
      if (fn) { const k = scope + ":" + type; if (!C.listeners.has(k)) C.listeners.set(k, new Set()); C.listeners.get(k).add(fn); }
      return add.call(this, type, fn, o);
    };
    obj.removeEventListener = function (type, fn, o) {
      const s = C.listeners.get(scope + ":" + type); if (s) s.delete(fn);
      return rm.call(this, type, fn, o);
    };
    return obj;
  };
  wrapTarget(sb, "window");
  const doc = sb.document;
  wrapTarget(doc, "document");
  for (const k of ["createElement", "createElementNS", "getElementById"]) {
    const f = doc[k];
    doc[k] = function (...a) { return wrapTarget(f.apply(this, a), "element"); };
  }
  const si = sb.setInterval, ci = sb.clearInterval;
  sb.setInterval = function (...a) { const id = si.apply(this, a); C.intervals.add(id); return id; };
  sb.clearInterval = function (id) { C.intervals.delete(id); return ci.call(this, id); };
  // The VM's GLX is a Proxy that answers ANY unknown key with a no-op, so the wrapped-once guard
  // lives here, never as a flag property on the proxy (a flag would always read truthy).
  const gfx = sb.GLX, wrapped = new Set();
  for (const [mk, fr, bucket] of CREATE_FREE) {
    const make = gfx[mk];
    gfx[mk] = function (...a) { const h = make.apply(this, a); C.created++; if (h && typeof h === "object") C.live[bucket].add(h); return h; };
    if (wrapped.has(fr)) continue;
    wrapped.add(fr);
    const free = gfx[fr];
    gfx[fr] = function (h, ...a) { if (h) { C.freed++; for (const s of Object.values(C.live)) s.delete(h); } return free.call(this, h, ...a); };
  }
  return C;
}

export function snapshot(C, g) {
  const by = {};
  let listeners = 0;
  for (const [k, s] of C.listeners) { if (!s.size) continue; const scope = k.slice(0, k.indexOf(":")); by[scope] = (by[scope] || 0) + s.size; listeners += s.size; }
  return {
    meshes: C.live.meshes.size, textures: C.live.textures.size, batches: C.live.batches.size,
    listeners, listenersBy: by, intervals: C.intervals.size, timers: g._timers.pending(),
  };
}

/** Boot one game and race `circuits` in turn for `cycles` rounds; a reading at each race and at the
 *  menu after it. `sabotage(g)` runs after boot (the positive control breaks a free path with it). */
export async function runCycles({ circuits = ["monza", "spa"], cycles = 3, steps = 240, sabotage = null } = {}) {
  const { createGame } = require("../lib/game-vm.cjs");
  let C = null;
  const g = await createGame({ track: circuits[0], carMeshes: false, onSandbox(sb) { C = instrumentSandbox(sb); } });
  const readings = [];
  try {
    if (sabotage) sabotage(g);
    readings.push({ cycle: 0, id: null, at: "boot", ...snapshot(C, g) });
    for (let cycle = 1; cycle <= cycles; cycle++) {
      for (const id of circuits) {
        g.G.session = "race";
        await g.race(id);
        const A = g.apex;
        A.headless(true); A.setInput({ throttle: true, steer: 0.02 });
        g.step(steps);
        A.clearInput(); A.headless(false);
        readings.push({ cycle, id, at: "race", ...snapshot(C, g) });
        g.G.quitToMenu();
        g._timers.flush(true);   // the menu's own due timers run, as a browser would by now
        readings.push({ cycle, id, at: "menu", ...snapshot(C, g) });
      }
    }
  } finally { g.close(); }
  return readings;
}

const EXACT = ["meshes", "textures", "batches", "listeners", "intervals"];

/** The verdict. Cycle 1 may warm a cache; from cycle 2 on every count must repeat EXACTLY for the
 *  same circuit and phase, and the pending-timer count may not exceed what cycles 1–2 reached.
 *  Returns a list of human-readable failures (empty = clean). */
export function leakVerdict(readings) {
  const fails = [];
  const ref = new Map();
  for (const r of readings) if (r.cycle === 2) ref.set(r.id + "@" + r.at, r);
  if (!ref.size) return ["need at least 2 cycles"];
  const timerCap = Math.max(...readings.filter((r) => r.cycle >= 1 && r.cycle <= 2 && r.at === "menu").map((r) => r.timers));
  for (const r of readings) {
    if (r.cycle < 3) continue;
    const b = ref.get(r.id + "@" + r.at);
    for (const k of EXACT) if (r[k] !== b[k]) fails.push(`cycle ${r.cycle} ${r.id} ${r.at}: ${k} ${r[k]} vs ${b[k]} on cycle 2`);
    if (r.at === "menu" && r.timers > timerCap) fails.push(`cycle ${r.cycle} ${r.id} menu: ${r.timers} pending timers, cycles 1-2 peaked at ${timerCap}`);
  }
  return fails;
}

export function parseArgs(argv) {
  const o = { circuits: ["monza", "spa"], cycles: 3, steps: 240, json: "artifacts/perf/vm-leak-census.json" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i], v = argv[i + 1];
    if (a === "--circuits") { o.circuits = String(v).split(",").filter(Boolean); i++; }
    else if (a === "--cycles") { o.cycles = Math.max(2, Math.min(12, +v || 3)); i++; }
    else if (a === "--steps") { o.steps = Math.max(1, Math.min(6000, +v || 240)); i++; }
    else if (a === "--json") { o.json = String(v); i++; }
    else throw new Error("unknown flag: " + a);
  }
  return o;
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const readings = await runCycles(o);
  for (const r of readings) {
    console.log(`  c${r.cycle} ${String(r.id || "-").padEnd(12)} ${r.at.padEnd(5)} meshes=${r.meshes} textures=${r.textures} batches=${r.batches} ` +
      `listeners=${r.listeners} ${JSON.stringify(r.listenersBy)} intervals=${r.intervals} timers=${r.timers}`);
  }
  const fails = leakVerdict(readings);
  mkdirSync(path.dirname(o.json), { recursive: true });
  writeFileSync(o.json, JSON.stringify({ ...o, readings, fails }, null, 1));
  console.log(`= vm-leak-census ${fails.length ? "LEAK" : "clean"} circuits=${o.circuits.join(",")} cycles=${o.cycles}${fails.length ? "\n" + fails.map((f) => "  " + f).join("\n") : ""}`);
  console.log("json: " + o.json);
  if (fails.length) process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main().catch((e) => { console.error(e); process.exit(1); });
