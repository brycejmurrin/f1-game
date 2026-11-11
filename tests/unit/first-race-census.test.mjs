// #3673: the first-race census's pure half — flag parsing and the post-lights grouping a pre-mint reads.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseArgs, latePipelines, hookFrames } from "../../tools/perf/first-race-census.mjs";

test("parseArgs: defaults to a Lavapipe monza lap and refuses unknown flags", () => {
  const o = parseArgs([]);
  assert.equal(o.track, "monza"); assert.equal(o.lavapipe, true); assert.equal(o.lap, 100);
  assert.deepEqual(parseArgs(["--ls", "apex26.a=1 apex26.b=x", "--no-lavapipe"]).ls, [["apex26.a", "1"], ["apex26.b", "x"]]);
  assert.throws(() => parseArgs(["--bogus"]), /unknown flag/);
  assert.equal(o.go, false, "the device's entry: the lights run out (--go skipped them and misread the warm as post-lights)");
  assert.equal(parseArgs(["--go"]).go, true);
});

test("latePipelines: only post-lights builds, grouped by key, object, winding, layout and target", () => {
  const p = (at, state, extra) => ({ at, state, key: "t,0.9|na", mat: "MeshStandardNodeMaterial:", obj: "Mesh:", sx: 1, attrs: "normal,position", rt: "canvas", ...extra });
  const pipes = [p(10, "count"), p(20, "race"), p(30, "race"), p(40, "race", { sx: -1 }), p(50, "race", { obj: "InstancedMesh::inst" }), p(60, null)];
  const { late, groups } = latePipelines(pipes, 15);
  assert.equal(late.length, 5);   // the count-state build is pre-lights; the null-state one after lightsAt counts
  assert.deepEqual(groups.map((g) => g.n), [3, 1, 1]);
  assert.equal(latePipelines([p(5, "count")], null).late.length, 0);
});

test("hookFrames: per-stage ms per game frame, summed over repeated stages, last count frames and first race frames", () => {
  let now = 0, state = "count";
  const PerfSpans = { begin() {}, end() {} };
  globalThis.window = { __apex: { info: () => ({ state }) } }; globalThis.PerfSpans = PerfSpans;
  const perf = globalThis.performance; globalThis.performance = { now: () => now };
  try {
    assert.equal(hookFrames(), "ok");
    const frame = (stages) => { PerfSpans.begin("frame"); for (const [n, ms] of stages) { PerfSpans.begin(n); now += ms; PerfSpans.end(n); } PerfSpans.end("frame"); };
    for (let i = 0; i < 12; i++) frame([["physics", 1]]);
    state = "race"; frame([["ai", 20], ["ai", 5], ["render", 3]]);
    const F = window.__frcFrames;
    assert.equal(F.count.length, 10);
    assert.deepEqual(F.race[0], ["race", 28, { ai: 25, render: 3, frame: 28 }]);
  } finally { delete globalThis.window; delete globalThis.PerfSpans; globalThis.performance = perf; }
});
