#!/usr/bin/env node
// @doc VM allocation-per-frame census: JS bytes per race frame in the real game loop vs a checked-in baseline (--update).
// tools/perf/vm-alloc-census.mjs — the CLI and library behind tests/unit/perf-vm-alloc-budget.test.mjs.
//
// Garbage per frame is what makes a phone stutter: every ~16 MB of young-generation garbage is a
// scavenge on the frame that crosses it. docs/notes/PERF-ALLOC-HUNT-2026-10-17.md measured 130–260
// KB/frame in Chromium, but only comparably on an idle box. This census measures the same quantity
// where it is repeatable: the real js/game.js in the Node VM harness (tools/lib/game-vm.cjs, the
// renderer stubbed, so it is the SIMULATION's garbage: physics, AI, race control, HUD model), stepped
// through __apex.step with a seeded field.
//
// Method: a child `node --expose-gc --max-semi-space-size=128` (no scavenge can land inside a window,
// and the child's own flags cannot leak into a test runner), race monza, warm WARM frames so the JIT
// has tiered up, then WINDOWS windows of FRAMES frames: gc() twice, read used_heap_size, step, read
// again. A window with a GC inside it is discarded and reported. Measured 2026-10-24 (Node 22, this
// container): six windows 117–252 KB/frame, the window MEAN 186.9–189.2 KB/frame over five runs, two of
// them beside three busy-loop processes on a 4-core box (loadavg 3.2): the mean moved 1 %, single windows 8 %.
//
//   node tools/perf/vm-alloc-census.mjs              # measure, compare with the baseline, exit 1 over budget
//   node tools/perf/vm-alloc-census.mjs --update     # rewrite the baseline (say why in the commit)
//   node tools/perf/vm-alloc-census.mjs --json artifacts/perf/vm-alloc-census.json
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const BASELINE_PATH = path.join(HERE, "baselines", "vm-alloc.json");
export const SCENARIO = Object.freeze({ track: "monza", warm: 600, windows: 6, frames: 60 });
// The bound is a RATIO of the baseline MEAN (single windows follow the race: who is near whom). The
// mean's measured spread is 1 % idle or loaded; JIT tier-up timing is what moves it (optimised code
// escape-analyses allocations away), so 1.15× is many spreads wide and still fails a new ~28 KB-per-frame
// habit on a ~188 KB/frame loop.
export const MAX_RATIO = 1.15;

/** Child body: runs in its own process with the GC flags. Prints one JSON line. */
async function childMain(sc) {
  const require = createRequire(import.meta.url);
  const v8 = require("node:v8");
  const { PerformanceObserver } = require("node:perf_hooks");
  const { createGame } = require("../lib/game-vm.cjs");
  const gcs = [];
  const obs = new PerformanceObserver((l) => { for (const e of l.getEntries()) gcs.push(e.startTime); });
  obs.observe({ entryTypes: ["gc"] });
  const used = () => v8.getHeapStatistics().used_heap_size;
  const turn = () => new Promise((r) => setImmediate(r));
  const g = await createGame({ track: sc.track, carMeshes: false });
  await g.race(sc.track);
  const A = g.apex;
  A.headless(true); A.setInput({ throttle: true, steer: 0.02 });
  g.step(sc.warm);
  const windows = [];
  for (let w = 0; w < sc.windows; w++) {
    global.gc(); global.gc(); await turn();
    const n0 = gcs.length, t0 = performance.now(), b0 = used();
    g.step(sc.frames);
    const b1 = used(), t1 = performance.now();
    await turn();
    const gcInside = gcs.slice(n0).some((t) => t >= t0 && t <= t1);
    windows.push({ kbPerFrame: +((b1 - b0) / sc.frames / 1024).toFixed(1), gcInside });
  }
  A.clearInput(); A.headless(false);
  g.close();
  obs.disconnect();
  process.stdout.write("\n" + JSON.stringify({ windows }) + "\n");
}

/** Run one census in a child process. Returns { windows, valid, meanKbPerFrame }. */
export function measure(sc = SCENARIO) {
  const r = spawnSync(process.execPath, ["--expose-gc", "--max-semi-space-size=128", fileURLToPath(import.meta.url), "--child", JSON.stringify(sc)],
    { encoding: "utf8", maxBuffer: 64 << 20, timeout: 300000 });
  const line = String(r.stdout || "").trim().split("\n").reverse().find((l) => l.startsWith("{\"windows\""));
  if (r.status !== 0 || !line) throw new Error(`vm-alloc-census child failed (status ${r.status}):\n${String(r.stderr || "").slice(-2000)}`);
  const { windows } = JSON.parse(line);
  const valid = windows.filter((w) => !w.gcInside);
  const meanKbPerFrame = valid.length ? +(valid.reduce((s, w) => s + w.kbPerFrame, 0) / valid.length).toFixed(1) : null;
  return { windows, valid: valid.length, meanKbPerFrame };
}

export function loadBaseline(p = BASELINE_PATH) {
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf8"));
}

/** Verdict against a baseline: { ok, ratio, limit, note }. */
export function compare(m, base, maxRatio = MAX_RATIO) {
  if (!base) return { ok: false, note: "no baseline: run with --update once" };
  if (m.meanKbPerFrame == null) return { ok: false, note: "every window had a GC inside it: raise --max-semi-space-size" };
  const ratio = +(m.meanKbPerFrame / base.meanKbPerFrame).toFixed(3);
  const limit = +(base.meanKbPerFrame * maxRatio).toFixed(1);
  const ok = m.meanKbPerFrame <= limit;
  const note = ok
    ? (ratio < 0.75 ? `well under the baseline (×${ratio}): lower it with --update and say what freed it` : `within ×${maxRatio}`)
    : `${m.meanKbPerFrame} KB/frame is over ${limit} (baseline ${base.meanKbPerFrame} × ${maxRatio})`;
  return { ok, ratio, limit, note };
}

async function main(argv) {
  const ci = argv.indexOf("--child");
  if (ci >= 0) return childMain(JSON.parse(argv[ci + 1]));
  let json = null; const update = argv.includes("--update");
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--json") json = argv[++i];
    else if (argv[i] !== "--update") throw new Error("unknown flag: " + argv[i]);
  }
  const m = measure();
  if (update) {
    const base = { ...SCENARIO, meanKbPerFrame: m.meanKbPerFrame, windowKb: m.windows.map((w) => w.kbPerFrame), node: process.version, measured: new Date().toISOString().slice(0, 10) };
    mkdirSync(path.dirname(BASELINE_PATH), { recursive: true });
    writeFileSync(BASELINE_PATH, JSON.stringify(base, null, 1) + "\n");
    console.log(`= vm-alloc-census baseline written ${m.meanKbPerFrame} KB/frame -> ${path.relative(process.cwd(), BASELINE_PATH)}`);
    return;
  }
  const v = compare(m, loadBaseline());
  if (json) { mkdirSync(path.dirname(json), { recursive: true }); writeFileSync(json, JSON.stringify({ scenario: SCENARIO, ...m, verdict: v }, null, 1)); }
  console.log(`= vm-alloc-census ${v.ok ? "ok" : "OVER"} mean=${m.meanKbPerFrame} KB/frame windows=${m.windows.map((w) => w.kbPerFrame + (w.gcInside ? "(gc)" : "")).join(",")} ${v.note}`);
  if (!v.ok) process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main(process.argv.slice(2)).catch((e) => { console.error(e); process.exit(1); });
