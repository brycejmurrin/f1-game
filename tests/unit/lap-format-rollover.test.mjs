/* lap-format-rollover.test.mjs — a clock or delta that rounds AFTER it splits prints "1:60.00" / "-0.000".
 *
 * Round 2 hunt (R2-05, R2-06): six copy-pasted m:ss formatters split seconds first, so toFixed carried a
 * 59.996 into "60.00"; two signed-delta readouts took their sign from the unrounded value ("-0.00s").
 * Dom.fmtLap / fmtRaceClock already round first; these are the copies that now do too.
 *
 * Run: node --test tests/unit/lap-format-rollover.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { fnSource } from "../helpers/fn-source.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");

function model() {
  const ctx = vm.createContext({ Math, Number, String, Array, Object, isFinite });
  vm.runInContext(read("js/core/mat4.js"), ctx, { filename: "mat4.js" });
  vm.runInContext(read("js/data/telemetry-model.js"), ctx, { filename: "telemetry-model.js" });
  return vm.runInContext("DataTelemetryModel", ctx);
}
const evalFn = (src) => vm.runInContext("(" + src + "\n)", vm.createContext({ Math, isFinite }));

test("telemetry summaryTime rounds before it splits", () => {
  const { summaryTime } = model();
  assert.equal(summaryTime(119.996), "2:00.00");
  assert.equal(summaryTime(59.999), "1:00.00");
  assert.equal(summaryTime(75.5), "1:15.50");
  assert.equal(summaryTime(9.044), "0:09.04");
  assert.equal(summaryTime(-1), "—");
});

test("telemetry signed() takes the sign from the rounded value", () => {
  const { signed } = model();
  assert.equal(signed(-0.0003, 2), "+0.00");
  assert.equal(signed(0.004, 2), "+0.00");
  assert.equal(signed(-0.006, 2), "-0.01");
  assert.equal(signed(0.12, 2), "+0.12");
  assert.equal(signed(-1.234, 2), "-1.23");
});

test("the metrics overlay clock rounds before it splits", () => {
  const fmtTime = evalFn(fnSource(read("js/perf/metrics-overlay.js"), "function fmtTime(t)"));
  assert.equal(fmtTime(119.9996), "2:00.000");
  assert.equal(fmtTime(59.9996), "1:00.000");
  assert.equal(fmtTime(83.456), "1:23.456");
  assert.equal(fmtTime(null), "—");
});

test("the replay's lap clock rounds before it splits", () => {
  const line = read("js/race/real-replay.js").match(/^ *(function fmtLap\(t\) \{.*?\})(?: *\/\/.*)?$/m);   // a one-liner: fnSource would run past it
  assert.ok(line, "real-replay.js still declares fmtLap on one line");
  const fmtLap = evalFn(line[1]);
  assert.equal(fmtLap(119.9996), "2:00.000");
  assert.equal(fmtLap(112.263), "1:52.263");
  assert.equal(fmtLap(0), "—");
});

test("the track designer's estimate rounds before it splits", () => {
  const line = read("js/editor/designer.js").match(/^ *const fmtLap = (.*);.*$/m);
  assert.ok(line, "designer.js still declares fmtLap on one line");
  const fmtLap = evalFn(line[1]);
  assert.equal(fmtLap(119.96), "2:00.0");
  assert.equal(fmtLap(81.23), "1:21.2");
  assert.equal(fmtLap(0), "—");
});

test("the results sheet's PB delta takes its sign from the rounded value", () => {
  const src = read("js/ui/results-sheet.js");
  assert.match(src, /const shown = \+delta\.toFixed\(3\);/, "round first");
  assert.match(src, /\$\{shown >= 0 \? "\+" : ""\}\$\{shown\.toFixed\(3\)\}s/, "then sign and print the rounded value");
});
