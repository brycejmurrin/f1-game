/* trace-census.test.mjs — tools/perf/trace-census.mjs turns a Chrome trace into COUNTS (layouts/s, who
 * invalidated layout, GC scavenges, long tasks, sampled self time). The fixture is a synthetic trace built here,
 * so the test pins the parser's contract without a browser (research lane B, 2026-11-04). */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { census, readTrace, shortUrl, format } from "../../tools/perf/trace-census.mjs";

const URL = "http://127.0.0.1:3456/js/ui/hud.js?v=dev";
function synthetic() {
  const ev = [{ name: "thread_name", ph: "M", pid: 1, tid: 7, args: { name: "CrRendererMain" } }];
  const X = (name, ts, dur, extra = {}) => ev.push({ name, ph: "X", pid: 1, tid: 7, ts, dur, ...extra });
  // 10 s of trace: 20 layouts, 40 style recalcs, 2 scavenges, 1 major, one 80 ms task, one off-thread Layout.
  for (let i = 0; i < 20; i++) X("Layout", i * 500_000, 1000, { args: { beginData: { dirtyObjects: 9, totalObjects: 135 } } });
  for (let i = 0; i < 40; i++) X("UpdateLayoutTree", i * 250_000, 500, { args: { elementCount: 6 } });
  X("MinorGC", 1_000_000, 2000); X("MinorGC", 6_000_000, 3000); X("MajorGC", 8_000_000, 13_000);
  X("RunTask", 2_000_000, 80_000); for (let i = 0; i < 9; i++) X("RunTask", 3_000_000 + i * 1000, 100);
  X("CpuProfiler::StartProfiling", 0, 600_000); X("UserTiming::Measure", 100, 10); X("UserTiming::Measure", 200, 10);
  ev.push({ name: "Layout", ph: "X", pid: 1, tid: 9, ts: 5, dur: 99_000 });   // another thread: not counted
  const stack = (fn, line) => ({ args: { data: { stackTrace: [{ functionName: fn, url: URL, lineNumber: line }] } } });
  for (let i = 0; i < 7; i++) ev.push({ name: "InvalidateLayout", ph: "I", pid: 1, tid: 7, ts: i, ...stack("hText", 79) });
  for (let i = 0; i < 3; i++) ev.push({ name: "ScheduleStyleRecalculation", ph: "I", pid: 1, tid: 7, ts: i, ...stack("hStyle", 81) });
  ev.push({ name: "ScheduleStyleRecalculation", ph: "I", pid: 1, tid: 7, ts: 1, args: { data: {} } });
  ev.push({ name: "ProfileChunk", ph: "P", pid: 1, tid: 11, ts: 0, args: { data: { cpuProfile: {
    nodes: [{ id: 1, callFrame: { functionName: "(root)", url: "" } }, { id: 2, callFrame: { functionName: "updateCar", url: "http://127.0.0.1:3456/js/game.js?v=dev", lineNumber: 4830 } }, { id: 3, callFrame: { functionName: "(idle)", url: "" } }],
    samples: [2, 2, 2, 3, 1] } } } });
  ev.push({ name: "x", ph: "X", pid: 1, tid: 7, ts: 10_000_000, dur: 0 });
  return ev;
}

test("shortUrl drops the origin and the cache stamp", () => {
  assert.equal(shortUrl(URL), "js/ui/hud.js");
  assert.equal(shortUrl(""), "");
});

test("census counts only the renderer main thread and reports rates per second", () => {
  const c = census(synthetic(), { top: 5 });
  assert.equal(c.seconds, 10);
  assert.equal(c.layout.Layout.n, 20, "the off-thread Layout must not count");
  assert.equal(c.layout.Layout.perS, 2);
  assert.equal(c.layout.UpdateLayoutTree.n, 40);
  assert.equal(c.layoutDirtyAvg, 9); assert.equal(c.layoutTotalAvg, 135); assert.equal(c.styleElementsAvg, 6);
  assert.equal(c.gc.scavenges, 2); assert.equal(c.gc.majors, 1); assert.equal(c.gc.maxPauseMs, 13);
  assert.equal(c.tasks.n, 10); assert.equal(c.tasks.longOver50ms, 1); assert.equal(c.tasks.maxMs, 80);
  assert.equal(c.overhead.profilerStartMs, 600); assert.equal(c.overhead.userTimingMeasures, 2);
});

test("invalidation sites are keyed by event, top frame and short url; a missing stack is named", () => {
  const c = census(synthetic());
  assert.deepEqual(c.invalidators.map((r) => [r.site, r.n]), [
    ["InvalidateLayout hText js/ui/hud.js:79", 7],
    ["ScheduleStyleRecalculation hStyle js/ui/hud.js:81", 3],
    ["ScheduleStyleRecalculation (no stack)", 1],
  ]);
});

test("sampled self time rolls up by function and by file", () => {
  const c = census(synthetic(), { top: 3 });
  assert.equal(c.profile.samples, 5);
  assert.deepEqual(c.profile.topSelf[0], { fn: "updateCar", url: "js/game.js", line: 4830, samples: 3, pct: 60 });
  assert.equal(c.profile.byFile[0].url, "js/game.js");
  assert.equal(c.profile.byFile.find((r) => r.url === "(native/idle)").samples, 2);
});

test("readTrace accepts a bare array, {traceEvents} and gzip; format() prints every section", () => {
  const dir = mkdtempSync(join(tmpdir(), "trace-census-"));
  const ev = synthetic();
  writeFileSync(join(dir, "a.json"), JSON.stringify(ev));
  writeFileSync(join(dir, "b.json"), JSON.stringify({ traceEvents: ev }));
  writeFileSync(join(dir, "c.json.gz"), gzipSync(JSON.stringify({ traceEvents: ev })));
  for (const f of ["a.json", "b.json", "c.json.gz"]) assert.equal(readTrace(join(dir, f)).length, ev.length, f);
  const text = format(census(ev));
  for (const s of ["trace 10s", "Layout", "gc scavenges 2", "invalidation sites:", "hText js/ui/hud.js:79", "updateCar"]) assert.ok(text.includes(s), `format() lacks "${s}"`);
});

test("an empty trace gives zeros and nulls, never NaN or a throw", () => {
  const c = census([]);
  assert.equal(c.seconds, 0); assert.equal(c.tasks.p50Ms, null); assert.equal(c.layout.Layout.perS, null);
  assert.equal(c.profile.samples, 0); assert.deepEqual(c.invalidators, []);
});
