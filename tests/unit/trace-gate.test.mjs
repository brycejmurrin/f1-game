// tools/perf/trace-gate.mjs on a synthetic trace: the mark window, site keys, judge. No browser.
import test from "node:test";
import assert from "node:assert/strict";
import { windowCensus, judge, siteKey } from "../../tools/perf/trace-gate.mjs";

const T = 7;
const X = (name, ts, dur, args) => ({ name, ph: "X", pid: 1, tid: T, ts, dur, args });
const inv = (name, fn) => ({ name, ph: "I", pid: 1, tid: T, ts: 6e6, args: { data: { stackTrace: [{ functionName: fn, url: "http://h/js/ui/hud.js?v=1", lineNumber: 79 }] } } });
function trace() {
  const ev = [{ name: "thread_name", ph: "M", pid: 1, tid: T, args: { name: "CrRendererMain" } },
    X("Layout", 0, 10), X("RunTask", 0, 900000),
    { name: "m:s", ph: "R", pid: 1, tid: T, ts: 5e6 }];
  for (let i = 0; i < 8; i++) ev.push(X("Layout", 5e6 + i * 5e5, 10, { beginData: { dirtyObjects: 9 } }));
  ev.push(inv("InvalidateLayout", "hText"), inv("ScheduleStyleRecalculation", "hStyle"), X("MinorGC", 6e6, 2000), X("RunTask", 5.2e6, 70000), X("RunTask", 8e6, 60000),
    { name: "m:e", ph: "R", pid: 1, tid: T, ts: 9e6 }, X("Layout", 20e6, 10));
  return ev;
}
const base = { headroom: 1.25, layoutPerS: 2, gcPer1000Frames: 8.4, invalidatorSites: ["hud.js:hText", "hud.js:hStyle"], longTasks: 1 };

test("window: events outside the marks are dropped, the rate uses the mark span", () => {
  const w = windowCensus(trace(), { markStart: "m:s", markEnd: "m:e", frames: 240, skipFirstMs: 500 });
  assert.equal(w.windowS, 4);
  assert.equal(w.layoutPerS, 2);
  assert.deepEqual(Object.keys(w.invalidatorSites).sort(), ["hud.js:hStyle", "hud.js:hText"]);
  assert.equal(w.scavengesPer1000Frames, 4.17);
  assert.equal(w.longTasksAfterSkip, 1, "the 70 ms task starts inside the skip; the 60 ms one counts; the 900 ms build task is outside");
});

test("judge: pass, rate regress, new site, long tasks", () => {
  const w = windowCensus(trace(), { markStart: "m:s", markEnd: "m:e", frames: 240, skipFirstMs: 500 });
  assert.deepEqual(judge(w, base), []);
  assert.match(judge(w, { ...base, layoutPerS: 1 })[0], /Layout\/s 2 > baseline 1/);
  assert.match(judge(w, { ...base, invalidatorSites: ["hud.js:hText"] })[0], /new invalidator site hud\.js:hStyle/);
  assert.match(judge(w, { ...base, longTasks: 0 })[0], /1 tasks over 50 ms/);
  assert.match(judge(w, { ...base, gcPer1000Frames: 2 })[0], /scavenges per 1000 frames 4.17/);
});

test("siteKey drops line and query; no-stack passes through; missing marks throw", () => {
  assert.equal(siteKey("InvalidateLayout hText js/ui/hud.js:79"), "hud.js:hText");
  assert.equal(siteKey("ScheduleStyleRecalculation (no stack)"), "(no stack)");
  assert.throws(() => windowCensus([], { markStart: "a", markEnd: "b" }), /not both in the trace/);
});
