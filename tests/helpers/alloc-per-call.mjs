// alloc-per-call.mjs — JS heap bytes one call of a hot function allocates, measured, for a pinned per-step test.
//
// The census (tools/perf/vm-alloc-census.mjs) measures a whole race frame; this measures ONE function in
// isolation, so a fix gets a test that fails before it and passes after. A child
// `node --expose-gc --max-semi-space-size=64` (room for small allocations; the flags cannot leak into the
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
const { performance, PerformanceObserver } = require("node:perf_hooks");
const a = JSON.parse(process.argv[1]);
const gcs = []; const obs = new PerformanceObserver((l) => { for (const e of l.getEntries()) gcs.push(e); }); obs.observe({ entryTypes: ["gc"] });
const ctx = vm.createContext({ Log: { info() {}, warn() {}, error() {}, debug() {} }, console });
for (const f of a.prelude) vm.runInContext(fs.readFileSync(f, "utf8"), ctx, { filename: f });
const fn = vm.runInContext(a.setup, ctx);
// Warm the same call and loop sites that the measurement will exercise.
function run(n) { for (let i = 0; i < n; i++) fn(i); }
run(a.warm);
const used = () => v8.getHeapStatistics().used_heap_size;
global.gc(); global.gc();
used();  // Prime heap-statistics bookkeeping after collection, outside the baseline.
const start = performance.now();
const b0 = used();
run(a.n);
const b1 = used();
const end = performance.now();
// Node queues native GC entries after this synchronous turn. Drain entries
// still pending delivery as well as those the observer already received.
setImmediate(() => {
  gcs.push(...obs.takeRecords());
  obs.disconnect();
  const gcInside = gcs.some(e => e.startTime < end && e.startTime + e.duration > start);
  process.stdout.write("\n" + JSON.stringify({ delta: b1 - b0, gcInside }) + "\n");
});
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
