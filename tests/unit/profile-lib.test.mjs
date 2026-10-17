/* profile-lib.test.mjs — tools/perf/lib.mjs: median/spread aggregation and the
 * "a delta inside the spread is noise" rule. Run: node --test tests/unit/profile-lib.test.mjs */
import { test } from "node:test";
import assert from "node:assert/strict";
import { aggregate, diff, verdict, formatDiff, formatTable, median, intervalStats } from "../../tools/perf/lib.mjs";

const run = (p50, p95 = p50 * 2) => ({ spans: { physics: { p50, p95, p99: p95, max: p95, n: 100 } } });

test("median and aggregate: median across repeats, spread = max-min", () => {
  assert.equal(median([3, 1, 2]), 2); assert.equal(median([1, 2, 3, 4]), 2.5);
  const a = aggregate([run(1.0), run(1.2), run(1.1)]).physics;
  assert.equal(a.p50, 1.1); assert.equal(a.spread50, 0.2); assert.equal(a.runs, 3); assert.equal(a.n, 300);
});

test("a delta inside the spread is noise, outside it is a WIN / REGRESS", () => {
  const base = aggregate([run(1.0), run(1.2), run(1.1)]);   // spread 0.2
  const same = aggregate([run(1.15), run(1.0), run(1.1)]);
  assert.equal(diff(base, same)[0].verdict, "noise");
  const faster = aggregate([run(0.5), run(0.55), run(0.52)]);
  assert.equal(diff(base, faster)[0].verdict, "WIN");
  const slower = aggregate([run(2.0), run(2.1), run(2.05)]);
  assert.equal(diff(base, slower)[0].verdict, "REGRESS");
});

test("fewer than 3 repeats prove nothing; raf is info; a span on one side only is n/a", () => {
  const one = aggregate([run(1), run(1.1)]), other = aggregate([run(0.1), run(0.1)]);
  assert.equal(diff(one, other)[0].verdict, "unproven");
  const raf = (x) => aggregate([1, 2, 3].map(() => ({ spans: { raf: { p50: x, p95: x, p99: x, max: x, n: 9 } } })));
  assert.equal(diff(raf(10), raf(1))[0].verdict, "info");
  assert.equal(verdict(null, one.physics), "n/a");
  const d = diff({}, one); assert.equal(d[0].dp50, null); assert.equal(d[0].verdict, "n/a");
});

test("tables render and sort by p50", () => {
  const agg = aggregate([{ spans: { a: { p50: 1, p95: 2, p99: 2, max: 3, n: 5 }, b: { p50: 4, p95: 5, p99: 5, max: 6, n: 5 } } }]);
  assert.match(formatTable(agg).split("\n")[1], /^b /);
  assert.match(formatDiff(diff(agg, agg), "x", "y"), /A\/B  base=x  head=y/);
});

test("intervalStats", () => {
  assert.equal(intervalStats([]), null);
  assert.equal(intervalStats([10, 20, 30, 40]).p50, 20);
});

import { summariseCpu } from "../../tools/perf/query.mjs";
test("summariseCpu: self vs total, fn filter", () => {
  const cf = (functionName, url = "game.js") => ({ functionName, url, lineNumber: 0 });
  const profile = { nodes: [{ id: 1, callFrame: cf("root"), children: [2] }, { id: 2, callFrame: cf("update"), children: [3] }, { id: 3, callFrame: cf("collide") }], samples: [2, 3, 3, 3] };
  const s = summariseCpu(profile);
  const upd = s.bySelf.find((r) => r.fn === "update"), col = s.bySelf.find((r) => r.fn === "collide");
  assert.equal(upd.selfPct, 25); assert.equal(upd.totalPct, 100); assert.equal(col.selfPct, 75);
  assert.equal(summariseCpu(profile, { fn: "^coll" }).bySelf.length, 1);
});
