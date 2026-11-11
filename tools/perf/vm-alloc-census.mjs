#!/usr/bin/env node
// @doc VM alloc census: object vs boxed-double bytes per race frame in the real game loop vs a baseline (--update).
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
// again. A window with a GC inside it is discarded and reported. Measured 2026-10-24 at a 600 warm (Node 22, this
// container): six windows 117–252 KB/frame, the window MEAN 186.9–189.2 KB/frame over five runs, two of
// them beside three busy-loop processes on a 4-core box (loadavg 3.2): the mean moved 1 %, single windows 8 %.
//
// Objects vs boxed doubles (#5056): on V8 a double stored where the optimiser left a tagged slot is a
// 16 B HeapNumber, and in a loop still tiering up those boxes were ~80-93 % of the heap delta. They do
// not exist on JavaScriptCore (Bryce's phone stores doubles inline), so a heap delta alone over-reports
// and ranks the wrong functions. Each window therefore also runs the sampling heap profiler and splits
// its samples by size: a sample of the calibrated size of one HeapNumber (measured in the child on a
// boxed-only loop) is `boxed`, everything else `objects`. The interval is 8 B, not the default 128:
// a sample's reported size is about raw size + interval, so at 128 B a HeapNumber (16 B), a short
// string and a 3-field object literal all read 144 and cannot be told apart; at 8 B they read 16, 24
// and 48 (measured 2026-11-11, Node 22). The gate reads `objects`; `boxed` and the heap delta are
// reported. The warm is 3,000 frames: at 600 the loop is still deoptimising (render,
// updateCarLateral) and boxing more. 2026-11-11 (Node 22, this container, 4 cores, five runs at 8 B): objects 9.4-9.5,
// boxed 60.4-61.1, heap delta 77-78 KB/frame (at 128 B: objects 8.9-9.1, boxed 74-75).
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
export const SCENARIO = Object.freeze({ track: "monza", warm: 3000, windows: 6, frames: 60 });
export const SAMPLE_INTERVAL = 8;     // HeapProfiler sampling interval, bytes: fine enough that a sample reads its raw size (see the header)
// The bound is a RATIO of the baseline MEAN (single windows follow the race: who is near whom). The
// mean's measured spread is 1 % idle or loaded; JIT tier-up timing is what moves it (optimised code
// escape-analyses allocations away), so 1.15× is many spreads wide and still fails a new ~1.4 KB-per-frame
// object habit on the ~9 KB/frame objects mean.
export const MAX_RATIO = 1.15;

/** Promise wrapper over an inspector Session's post(). */
export function poster(session) {
  return (m, p) => new Promise((res, rej) => session.post(m, p || {}, (e, v) => (e ? rej(e) : res(v))));
}

/** Sample `fn()` with the sampling heap profiler. Returns the profile's samples ([{size, nodeId, ordinal}]). */
export async function sampleAllocations(post, fn, interval = SAMPLE_INTERVAL) {
  await post("HeapProfiler.startSampling", { samplingInterval: interval, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
  let threw = null;
  try { fn(); } catch (e) { threw = e; }
  const { profile } = await post("HeapProfiler.stopSampling");
  if (threw) throw threw;
  return profile.samples;
}

/** The sample size one 16 B HeapNumber reports at this interval: the modal size of a boxed-only loop. */
export async function calibrateBoxedSize(post, interval = SAMPLE_INTERVAL) {
  const slots = new Array(1024).fill(null);   // tagged elements: every double stored is a fresh HeapNumber
  const samples = await sampleAllocations(post, () => { for (let i = 0; i < 2e5; i++) slots[i & 1023] = i * 0.1 + 0.3; }, interval);
  const h = new Map();
  for (const x of samples) h.set(x.size, (h.get(x.size) || 0) + 1);
  let best = null, n = 0;
  for (const [size, c] of h) if (c > n) { best = size; n = c; }
  return best;
}

/** Split samples into { objects, boxed } bytes: a sample of exactly `boxedSize` is a HeapNumber. */
export function splitSamples(samples, boxedSize) {
  let objects = 0, boxed = 0;
  for (const x of samples) { if (x.size === boxedSize) boxed += x.size; else objects += x.size; }
  return { objects, boxed };
}

/** Child body: runs in its own process with the GC flags. Prints one JSON line. */
async function childMain(sc) {
  const require = createRequire(import.meta.url);
  const v8 = require("node:v8");
  const { Session } = require("node:inspector");
  const { PerformanceObserver } = require("node:perf_hooks");
  const { createGame } = require("../lib/game-vm.cjs");
  const session = new Session(); session.connect();
  const post = poster(session);
  const boxedSize = await calibrateBoxedSize(post);
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
  const kb = (b) => +(b / sc.frames / 1024).toFixed(1);
  for (let w = 0; w < sc.windows; w++) {
    global.gc(); global.gc(); await turn();
    const n0 = gcs.length;
    let t0 = 0, t1 = 0, b0 = 0, b1 = 0;
    const samples = await sampleAllocations(post, () => {
      t0 = performance.now(); b0 = used();
      g.step(sc.frames);
      b1 = used(); t1 = performance.now();
    });
    await turn();
    const gcInside = gcs.slice(n0).some((t) => t >= t0 && t <= t1);
    const { objects, boxed } = splitSamples(samples, boxedSize);
    windows.push({ kbPerFrame: kb(b1 - b0), objectsKb: kb(objects), boxedKb: kb(boxed), gcInside });
  }
  A.clearInput(); A.headless(false);
  g.close();
  obs.disconnect();
  session.disconnect();
  process.stdout.write("\n" + JSON.stringify({ boxedSize, windows }) + "\n");
}

/** Mean of one window field over the GC-free windows (null when none). */
function meanOf(valid, k) {
  return valid.length ? +(valid.reduce((s, w) => s + w[k], 0) / valid.length).toFixed(1) : null;
}

/** Run one census in a child process. Returns { boxedSize, windows, valid, objectsKbPerFrame, boxedKbPerFrame, meanKbPerFrame }. */
export function measure(sc = SCENARIO) {
  const r = spawnSync(process.execPath, ["--expose-gc", "--max-semi-space-size=128", fileURLToPath(import.meta.url), "--child", JSON.stringify(sc)],
    { encoding: "utf8", maxBuffer: 64 << 20, timeout: 600000 });
  const line = String(r.stdout || "").trim().split("\n").reverse().find((l) => l.startsWith("{\"boxedSize\""));
  if (r.status !== 0 || !line) throw new Error(`vm-alloc-census child failed (status ${r.status}):\n${String(r.stderr || "").slice(-2000)}`);
  const { boxedSize, windows } = JSON.parse(line);
  const valid = windows.filter((w) => !w.gcInside);
  return {
    boxedSize, windows, valid: valid.length,
    objectsKbPerFrame: meanOf(valid, "objectsKb"),   // the gated number: real objects
    boxedKbPerFrame: meanOf(valid, "boxedKb"),       // V8 HeapNumber boxes (absent on JSC)
    meanKbPerFrame: meanOf(valid, "kbPerFrame"),     // the used_heap_size delta, both together
  };
}

export function loadBaseline(p = BASELINE_PATH) {
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf8"));
}

/** Verdict against a baseline, on objects KB/frame: { ok, ratio, limit, note }. */
export function compare(m, base, maxRatio = MAX_RATIO) {
  if (!base) return { ok: false, note: "no baseline: run with --update once" };
  if (!(base.objectsKbPerFrame > 0)) return { ok: false, note: "baseline has no objectsKbPerFrame: run with --update" };
  if (m.objectsKbPerFrame == null) return { ok: false, note: "every window had a GC inside it: raise --max-semi-space-size" };
  const ratio = +(m.objectsKbPerFrame / base.objectsKbPerFrame).toFixed(3);
  const limit = +(base.objectsKbPerFrame * maxRatio).toFixed(1);
  const ok = m.objectsKbPerFrame <= limit;
  const note = ok
    ? (ratio < 0.75 ? `well under the baseline (×${ratio}): lower it with --update and say what freed it` : `within ×${maxRatio}`)
    : `${m.objectsKbPerFrame} KB/frame of objects is over ${limit} (baseline ${base.objectsKbPerFrame} × ${maxRatio})`;
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
    const base = {
      ...SCENARIO, sampleInterval: SAMPLE_INTERVAL, boxedSize: m.boxedSize,
      objectsKbPerFrame: m.objectsKbPerFrame, boxedKbPerFrame: m.boxedKbPerFrame, meanKbPerFrame: m.meanKbPerFrame,
      windowKb: m.windows.map(({ objectsKb, boxedKb, kbPerFrame }) => ({ objectsKb, boxedKb, kbPerFrame })),
      node: process.version, measured: new Date().toISOString().slice(0, 10),
    };
    mkdirSync(path.dirname(BASELINE_PATH), { recursive: true });
    writeFileSync(BASELINE_PATH, JSON.stringify(base, null, 1) + "\n");
    console.log(`= vm-alloc-census baseline written objects=${m.objectsKbPerFrame} boxed=${m.boxedKbPerFrame} heap=${m.meanKbPerFrame} KB/frame -> ${path.relative(process.cwd(), BASELINE_PATH)}`);
    return;
  }
  const v = compare(m, loadBaseline());
  if (json) { mkdirSync(path.dirname(json), { recursive: true }); writeFileSync(json, JSON.stringify({ scenario: SCENARIO, ...m, verdict: v }, null, 1)); }
  console.log(`= vm-alloc-census ${v.ok ? "ok" : "OVER"} objects=${m.objectsKbPerFrame} boxed=${m.boxedKbPerFrame} heap=${m.meanKbPerFrame} KB/frame windows=${m.windows.map((w) => w.objectsKb + "/" + w.boxedKb + (w.gcInside ? "(gc)" : "")).join(",")} ${v.note}`);
  if (!v.ok) process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main(process.argv.slice(2)).catch((e) => { console.error(e); process.exit(1); });
