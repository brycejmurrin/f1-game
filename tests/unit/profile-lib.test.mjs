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

test("incomparable: arms with different capture modes never read as noise/WIN/REGRESS", async () => {
  const { supportsCaptureKey } = await import("../../tools/perf/lib.mjs");
  assert.equal(supportsCaptureKey(["x", 'sessionStorage.getItem("apex26.wgxCapture")']), true);
  assert.equal(supportsCaptureKey(["x", ""]), false);
  const base = aggregate([run(1300), run(1200), run(1400)]), head = aggregate([run(54), run(50), run(60)]);
  assert.equal(diff(base, head)[0].verdict, "WIN");
  const r = diff(base, head, { incomparable: true })[0];
  assert.equal(r.verdict, "incomparable"); assert.equal(r.verdict95, "incomparable");
});


import { profileScenario, profileScenarioSignature, profileComparability } from "../../tools/perf/lib.mjs";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scenario = () => profileScenario({ track: "monaco", frames: 40,
  viewport: { width: 320, height: 180, deviceScaleFactor: 1 }, capture: "disabled",
  environment: { backend: "three", api: "webgl2", device: "ANGLE SwiftShader", browser: "Chromium 140" } });

test("saved profiles require complete matching workload, capture and observed renderer", () => {
  const base = { scenario: scenario() }, head = { scenario: scenario() };
  assert.equal(profileComparability(base, head).comparable, true);
  assert.equal(profileScenarioSignature(base.scenario), profileScenarioSignature({ ...head.scenario, environment: { ...head.scenario.environment } }));
  for (const [key, value] of [["track", "monza"], ["frames", 600], ["capture", "enabled"], ["warmupFrames", 10], ["workload", "different-v2"], ["version", 2]]) {
    assert.equal(profileComparability(base, { scenario: { ...scenario(), [key]: value } }).comparable, false, key);
  }
  for (const key of ["backend", "api", "device", "browser"]) {
    const changed = scenario(); changed.environment[key] += " changed";
    assert.equal(profileComparability(base, { scenario: changed }).comparable, false, key);
    delete changed.environment[key];
    assert.equal(profileScenarioSignature(changed), null, key + " unknown");
  }
  for (const key of ["width", "height", "deviceScaleFactor"]) {
    const changed = scenario(); changed.viewport[key] *= 2;
    assert.equal(profileComparability(base, { scenario: changed }).comparable, false, key);
  }
  assert.equal(profileComparability({ track: "monaco", frames: 40 }, head).comparable, false, "legacy reports cannot establish capture/renderer");
  assert.equal(profileScenarioSignature({ ...scenario(), frames: NaN }), null);
});

test("query CLI never awards a win to incompatible or unknown saved profiles; matching captures retain noise rule", () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
  const parent = join(root, "artifacts/profiles"); mkdirSync(parent, { recursive: true });
  const dir = mkdtempSync(join(parent, "compare-unit-"));
  const baseline = { scenario: scenario(), head: aggregate([run(10), run(10), run(10)]) };
  const candidate = { scenario: scenario(), head: aggregate([run(1), run(1), run(1)]) };
  const query = (a, b) => {
    writeFileSync(join(dir, "base.json"), JSON.stringify(a)); writeFileSync(join(dir, "head.json"), JSON.stringify(b));
    const p = spawnSync(process.execPath, [join(root, "tools/perf/query.mjs"), join(dir, "base.json"), join(dir, "head.json"), "--json"], { encoding: "utf8", timeout: 5000 });
    assert.equal(p.status, 0, p.stderr);
    return { rows: JSON.parse(p.stdout), warning: p.stderr };
  };
  try {
    assert.equal(query(baseline, candidate).rows[0].verdict, "WIN");
    const incompatible = { ...candidate, scenario: { ...scenario(), track: "monza", frames: 600 } };
    let r = query(baseline, incompatible);
    assert.equal(r.rows[0].verdict, "incomparable"); assert.equal(r.rows[0].verdict95, "incomparable");
    assert.match(r.warning, /incompatible/); assert.equal(r.rows[0].pct50, -90, "observations stay available without a win");
    r = query({ track: "monaco", frames: 40, head: baseline.head }, { track: "monza", frames: 600, head: candidate.head });
    assert.equal(r.rows[0].verdict, "incomparable"); assert.match(r.warning, /unknown scenario/);
    const slower = { ...candidate, head: aggregate([run(20), run(20), run(20)]) };
    assert.equal(query(baseline, slower).rows[0].verdict, "REGRESS");
    assert.equal(query(baseline, { ...slower, scenario: null }).rows[0].verdict, "incomparable");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
