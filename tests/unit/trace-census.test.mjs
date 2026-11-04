// tools/perf/trace-census.mjs on a synthetic trace: counts, rates, invalidator sites, GC, long tasks, and the judge. No browser.
import test from "node:test";
import assert from "node:assert/strict";
import { census, judge, siteKey } from "../../tools/perf/trace-census.mjs";

const frame = (fn, url = "http://x/js/ui/hud.js?v=1") => ({ functionName: fn, url, lineNumber: 79 });
const X = (name, ts, dur, args = {}) => ({ name, ph: "X", ts, dur, args });
const I = (name, fn) => ({ name, ph: "I", ts: 1, args: { data: { stackTrace: [frame(fn)] } } });
function trace() {
  const ev = [X("RunTask", 0, 700000), X("RunTask", 1e6, 4000), X("RunTask", 2e6, 60000), X("RunTask", 10e6, 1000)];
  for (let i = 0; i < 20; i++) ev.push(X("Layout", i * 5e5, 100, { beginData: { dirtyObjects: 10 } }), X("UpdateLayoutTree", i * 5e5, 50), X("Paint", i * 5e5, 50));
  for (let i = 0; i < 5; i++) ev.push(I("InvalidateLayout", "hText"));
  ev.push(I("ScheduleStyleRecalculation", "hStyle"), X("MinorGC", 3e6, 2000), X("MinorGC", 4e6, 6200), X("MajorGC", 5e6, 9000));
  return ev;
}

test("census counts layouts, rates, invalidator sites, GC and long tasks", () => {
  const c = census({ traceEvents: trace() }, { windowS: 10, frames: 600, skipFirstMs: 1000 });
  assert.equal(c.layout.Layout.count, 20);
  assert.equal(c.layout.Layout.perS, 2);
  assert.equal(c.layout.Layout.meanDirty, 10);
  assert.equal(c.invalidators["InvalidateLayout ← hud.js:hText"], 5);
  assert.equal(c.invalidators["ScheduleStyleRecalculation ← hud.js:hStyle"], 1);
  assert.deepEqual([c.gc.scavenges, c.gc.majors, c.gc.maxScavengeMs, c.gc.scavengesPer1000Frames], [2, 1, 6.2, 3.33]);
  assert.equal(c.tasks.longOver50ms, 1, "the 700 ms attach task is inside skipFirstMs; the 60 ms task is not");
  assert.equal(census(trace()).tasks.longOver50ms, 2, "no skip: both count");
});

test("judge: pass, rate regress, new site, long task", () => {
  const base = { headroom: 1.25, layout: { perS: 2 }, gcPer1000Frames: 3.4, invalidatorSites: ["hud.js:hText", "hud.js:hStyle"], longTasks: 0 };
  const c = census(trace(), { windowS: 10, frames: 600, skipFirstMs: 5000 });
  assert.deepEqual(judge(c, base), []);
  assert.match(judge(census(trace(), { windowS: 5, frames: 600, skipFirstMs: 5000 }), base)[0], /Layout\/s 4 > baseline 2/);
  assert.match(judge(c, { ...base, invalidatorSites: ["hud.js:hText"] })[0], /new invalidator site hud\.js:hStyle/);
  assert.match(judge(census(trace(), { windowS: 10, frames: 600 }), base).join(), /tasks over 50 ms/);
});

test("siteKey ignores query and line", () => {
  assert.equal(siteKey(frame("f", "http://h/a/b.js?v=3")), "b.js:f");
  assert.equal(siteKey(null), "(no stack)");
});
