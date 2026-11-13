// alloc-per-call.mjs — JS heap bytes one call of a hot function allocates, measured, for a pinned per-step test.
//
// The census (tools/perf/vm-alloc-census.mjs) measures a whole race frame; this measures ONE function in
// isolation, so a fix gets a test that fails before it and passes after. A child
// `node --expose-gc --max-semi-space-size=64` (no scavenge inside the window; the flags cannot leak into the
// runner) evaluates `setup` (a JS source whose completion value is the function to call), warms it WARM
// times so the JIT has tiered, gc()s twice, then reads used_heap_size around N calls. A window with a GC
// inside it is reported (gcInside), never retried silently.
//
//   const r = allocPerCall(`(() => { const w = make(); return () => w.tick(); })()`, { prelude: [file] });
//   r.bytesPerCall   // floor(heap delta / N)
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const CHILD = String.raw`
const v8 = require("node:v8"), vm = require("node:vm"), fs = require("node:fs");
const { PerformanceObserver } = require("node:perf_hooks");
const a = JSON.parse(process.argv[1]);
const gcs = []; const obs = new PerformanceObserver((l) => { for (const e of l.getEntries()) gcs.push(e); }); obs.observe({ entryTypes: ["gc"] });
const ctx = vm.createContext({ Log: { info() {}, warn() {}, error() {}, debug() {} }, console });
for (const f of a.prelude) vm.runInContext(fs.readFileSync(f, "utf8"), ctx, { filename: f });
const fn = vm.runInContext(a.setup, ctx);
for (let i = 0; i < a.warm; i++) fn(i);
global.gc(); global.gc();
const n0 = gcs.length; const used = () => v8.getHeapStatistics().used_heap_size;
const b0 = used();
for (let i = 0; i < a.n; i++) fn(i);
const b1 = used();
setImmediate(() => { obs.disconnect(); process.stdout.write("\n" + JSON.stringify({ delta: b1 - b0, gcInside: gcs.length > n0 }) + "\n"); });
`;

/** Measure bytes per call of the function `setup` evaluates to. `prelude`: absolute paths of IIFE files to load first. */
export function allocPerCall(setup, { prelude = [], warm = 20000, n = 20000 } = {}) {
  for (const f of prelude) readFileSync(f);   // fail here, not in the child, on a bad path
  const r = spawnSync(process.execPath, ["--expose-gc", "--max-semi-space-size=64", "-e", CHILD, JSON.stringify({ setup, prelude, warm, n })],
    { encoding: "utf8", timeout: 120000 });
  const line = String(r.stdout || "").trim().split("\n").pop();
  if (r.status !== 0 || !line || !line.startsWith("{")) throw new Error(`alloc-per-call child failed (${r.status}):\n${String(r.stderr || "").slice(-2000)}`);
  const { delta, gcInside } = JSON.parse(line);
  return { bytes: delta, bytesPerCall: Math.floor(Math.max(0, delta) / n), gcInside };
}
