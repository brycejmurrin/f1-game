#!/usr/bin/env node
// tools/perf/trace-census.mjs — COUNTS from a Chrome trace (DevTools "Save profile", chrome-devtools MCP
// performance_stop_trace, or tools/perf/profile.mjs --mode trace): main-thread layouts / style recalcs / paints per
// second, WHO invalidated layout (the top stack frame of InvalidateLayout / ScheduleStyleRecalculation), GC
// scavenges and major GCs per second, long tasks (> 50 ms) and the longest task, the sampled self time by
// function and by file, and the trace's own cost (CpuProfiler::StartProfiling, UserTiming measures).
// Counts repeat on SwiftShader and llvmpipe where milliseconds do not (PERFTEST-HUNT-2026-10-24 "count, don't
// time"), so the layout, invalidation and GC rows are gate material; the ms columns are a report.
// Research lane B, 2026-11-04 (docs/notes/RESEARCH-B-PERF-TESTING-2026-11-04.md).
// @doc Count census of a Chrome trace: layouts/s, invalidation call sites, GC/s, long tasks, self time by function; --json.
//
//   node tools/perf/trace-census.mjs <trace.json[.gz]> [--top N] [--json [file]]
import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

const LAYOUT_EVENTS = ["UpdateLayoutTree", "Layout", "Paint", "PrePaint", "Commit", "Layerize"];
const INVALIDATORS = ["InvalidateLayout", "ScheduleStyleRecalculation"];

/** Strip the local server origin and the cache stamp from a script URL. */
export const shortUrl = (u) => String(u || "").replace(/^https?:\/\/[^/]+\//, "").replace(/\?v=[^:]*/, "");

/** Parse a trace file (JSON array, {traceEvents}, or gzip of either) into its event list. */
export function readTrace(file) {
  let buf = readFileSync(file);
  if (buf[0] === 0x1f && buf[1] === 0x8b) buf = gunzipSync(buf);
  const j = JSON.parse(buf.toString("utf8"));
  return Array.isArray(j) ? j : j.traceEvents || [];
}

const pct = (sorted, p) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] : null);

/** The census over a list of trace events. Every count is exact; every ms is informational. */
export function census(events, { top = 20 } = {}) {
  const mains = new Set();
  for (const e of events) if (e.name === "thread_name" && e.args && e.args.name === "CrRendererMain") mains.add(`${e.pid}:${e.tid}`);
  const isMain = (e) => mains.size === 0 || mains.has(`${e.pid}:${e.tid}`);
  let tmin = Infinity, tmax = -Infinity;
  const tasks = []; let longTasks = 0;
  const counts = {}; for (const n of LAYOUT_EVENTS) counts[n] = { n: 0, ms: 0, max: 0 };
  const gc = { scavenges: 0, scavengeMs: 0, majors: 0, majorMs: 0, maxPauseMs: 0 };
  const invalidators = {};
  let layoutDirty = 0, layoutTotal = 0, styleElements = 0, styleWithCount = 0;
  const overhead = { profilerStartMs: 0, userTimingMeasures: 0, userTimingMs: 0 };
  for (const e of events) {
    if (!isMain(e)) continue;
    const d = (e.dur || 0) / 1000;
    if (e.ph === "X") {
      // Bounds from the main thread's complete events only: metadata rows carry a process-start ts.
      if (typeof e.ts === "number") { if (e.ts < tmin) tmin = e.ts; if (e.ts + (e.dur || 0) > tmax) tmax = e.ts + (e.dur || 0); }
      if (e.name === "RunTask") { tasks.push(d); if (d > 50) longTasks++; }
      else if (counts[e.name]) { const c = counts[e.name]; c.n++; c.ms += d; if (d > c.max) c.max = d; }
      else if (e.name === "MinorGC") { gc.scavenges++; gc.scavengeMs += d; if (d > gc.maxPauseMs) gc.maxPauseMs = d; }
      else if (e.name === "MajorGC") { gc.majors++; gc.majorMs += d; if (d > gc.maxPauseMs) gc.maxPauseMs = d; }
      else if (e.name === "CpuProfiler::StartProfiling") overhead.profilerStartMs += d;
      else if (e.name === "UserTiming::Measure") { overhead.userTimingMeasures++; overhead.userTimingMs += d; }
      if (e.name === "Layout" && e.args && e.args.beginData) { layoutDirty += e.args.beginData.dirtyObjects || 0; layoutTotal += e.args.beginData.totalObjects || 0; }
      if (e.name === "UpdateLayoutTree" && e.args && typeof e.args.elementCount === "number") { styleElements += e.args.elementCount; styleWithCount++; }
    }
    if (INVALIDATORS.includes(e.name)) {
      const st = e.args && e.args.data && e.args.data.stackTrace;
      const topF = st && st[0];
      const key = topF ? `${e.name} ${topF.functionName || "(anon)"} ${shortUrl(topF.url)}:${topF.lineNumber}` : `${e.name} (no stack)`;
      invalidators[key] = (invalidators[key] || 0) + 1;
    }
  }
  const seconds = Number.isFinite(tmin) && tmax > tmin ? (tmax - tmin) / 1e6 : 0;
  const perS = (n) => (seconds ? +(n / seconds).toFixed(2) : null);
  tasks.sort((a, b) => a - b);
  // Sampled CPU profile: self samples per function and per file (any thread; ProfileChunk nodes carry callFrames).
  const nodes = new Map(); const self = new Map(); let samples = 0;
  for (const c of events) {
    if (c.name !== "ProfileChunk") continue;
    const cp = c.args && c.args.data && c.args.data.cpuProfile; if (!cp) continue;
    for (const n of cp.nodes || []) nodes.set(n.id, n);
    for (const s of cp.samples || []) { samples++; self.set(s, (self.get(s) || 0) + 1); }
  }
  const fnRows = [...self.entries()].map(([id, n]) => { const cf = (nodes.get(id) || {}).callFrame || {}; return { fn: cf.functionName || "(anon)", url: shortUrl(cf.url), line: cf.lineNumber, samples: n, pct: samples ? +(100 * n / samples).toFixed(2) : null }; })
    .sort((a, b) => b.samples - a.samples);
  const byFile = {}; for (const r of fnRows) byFile[r.url || "(native/idle)"] = (byFile[r.url || "(native/idle)"] || 0) + r.samples;
  const fileRows = Object.entries(byFile).map(([url, n]) => ({ url, samples: n, pct: samples ? +(100 * n / samples).toFixed(2) : null })).sort((a, b) => b.samples - a.samples);
  const layout = {}; for (const n of LAYOUT_EVENTS) layout[n] = { n: counts[n].n, perS: perS(counts[n].n), ms: +counts[n].ms.toFixed(1), maxMs: +counts[n].max.toFixed(2) };
  return {
    seconds: +seconds.toFixed(2), mainThreads: mains.size,
    tasks: { n: tasks.length, longOver50ms: longTasks, p50Ms: pct(tasks, 0.5), p99Ms: pct(tasks, 0.99), maxMs: tasks.length ? tasks[tasks.length - 1] : null },
    layout,
    layoutDirtyAvg: counts.Layout.n ? +(layoutDirty / counts.Layout.n).toFixed(1) : null,
    layoutTotalAvg: counts.Layout.n ? +(layoutTotal / counts.Layout.n).toFixed(0) : null,
    styleElementsAvg: styleWithCount ? +(styleElements / styleWithCount).toFixed(1) : null,
    invalidators: Object.entries(invalidators).sort((a, b) => b[1] - a[1]).slice(0, top).map(([site, n]) => ({ site, n, perS: perS(n) })),
    gc: { ...gc, scavengesPerS: perS(gc.scavenges), scavengeMs: +gc.scavengeMs.toFixed(1), majorMs: +gc.majorMs.toFixed(1), maxPauseMs: +gc.maxPauseMs.toFixed(2) },
    overhead: { ...overhead, profilerStartMs: +overhead.profilerStartMs.toFixed(1), userTimingMs: +overhead.userTimingMs.toFixed(1) },
    profile: { samples, topSelf: fnRows.slice(0, top), byFile: fileRows.slice(0, top) },
  };
}

export function format(c) {
  const L = [];
  L.push(`trace ${c.seconds}s  main tasks ${c.tasks.n}  long(>50ms) ${c.tasks.longOver50ms}  task p50 ${c.tasks.p50Ms?.toFixed(2)} p99 ${c.tasks.p99Ms?.toFixed(2)} max ${c.tasks.maxMs?.toFixed(1)} ms`);
  for (const [n, v] of Object.entries(c.layout)) L.push(`  ${n.padEnd(16)} n ${String(v.n).padStart(6)}  /s ${String(v.perS).padStart(7)}  ms ${String(v.ms).padStart(8)}  max ${v.maxMs}`);
  L.push(`  Layout dirty avg ${c.layoutDirtyAvg} of ${c.layoutTotalAvg} objects; style recalc avg ${c.styleElementsAvg} elements`);
  L.push(`gc scavenges ${c.gc.scavenges} (${c.gc.scavengesPerS}/s, ${c.gc.scavengeMs} ms)  majors ${c.gc.majors} (${c.gc.majorMs} ms)  max pause ${c.gc.maxPauseMs} ms`);
  L.push(`overhead profiler start ${c.overhead.profilerStartMs} ms; User Timing measures ${c.overhead.userTimingMeasures} (${c.overhead.userTimingMs} ms)`);
  L.push("invalidation sites:"); for (const r of c.invalidators) L.push(`  ${String(r.n).padStart(6)}  ${r.perS}/s  ${r.site}`);
  L.push(`profile samples ${c.profile.samples}; top self:`); for (const r of c.profile.topSelf) L.push(`  ${String(r.pct).padStart(6)}%  ${r.fn.padEnd(30)} ${r.url ? `${r.url}:${r.line}` : "(native)"}`);
  L.push("by file:"); for (const r of c.profile.byFile) L.push(`  ${String(r.pct).padStart(6)}%  ${r.url}`);
  return L.join("\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2);
  const file = argv.find((a) => !a.startsWith("--"));
  if (!file || argv.includes("--help")) { console.error("usage: node tools/perf/trace-census.mjs <trace.json[.gz]> [--top N] [--json [file]]"); process.exit(file ? 0 : 2); }
  const ti = argv.indexOf("--top"); const top = ti >= 0 ? +argv[ti + 1] || 20 : 20;
  const c = census(readTrace(file), { top });
  const ji = argv.indexOf("--json");
  if (ji >= 0) { const out = argv[ji + 1] && !argv[ji + 1].startsWith("--") ? argv[ji + 1] : null; const s = JSON.stringify(c, null, 2); if (out) { writeFileSync(out, s); console.log(`wrote ${out}`); } else console.log(s); }
  else console.log(format(c));
}
