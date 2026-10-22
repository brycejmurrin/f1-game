// BenchRun (js/perf/bench-run.js): the BENCHMARK plan and its pure summary. The run itself reloads a real page
// across renderer paths; what a test can pin is the leg order, the path prefs and the arithmetic the file is read by.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = readFileSync(join(ROOT, "js/perf/bench-run.js"), "utf8");
const load = () => vm.runInNewContext(SRC + "\n;BenchRun", { performance: { now: () => 0 } }, { filename: absSrc("js/perf/bench-run.js") });
const J = (x) => JSON.parse(JSON.stringify(x));   // the VM's arrays and objects carry its realm's prototypes

const leg = (api, p50s, extra) => Object.assign({ path: api, api, state: "done",
  entry: { cold: { goMs: 4000 }, warm: { goMs: 900 } },
  gpuTest: { reason: "complete", gpuTimer: { supported: false }, fill: { msPerFullFrame: 6 }, mirrorMs: 2,
    phases: [{ id: "default", p50: p50s[0], p95: p50s[0] + 4, fps: 60, links: 0, pipes: 0 }, { id: "s100", p50: p50s[1], p95: p50s[1] + 4, fps: 40, links: 1, pipes: 0 }] } }, extra);

test("bench-run: the path test alternates WebGPU, WebGL2, WebGL2, WebGPU and seeds 42; nothing runs at load", () => {
  const B = load();
  const paths = B.TESTS.find((t) => t.id === "paths");
  assert.deepEqual(J(paths.legs.map((l) => l.path)), ["webgpu", "webgl2", "webgl2", "webgpu"]);
  assert.ok(paths.legs.every((l) => l.kind === "gpu"));
  assert.equal(B.SEED, 42);
  const plan = B.newPlan("paths", { backend: null, threePath: null });
  assert.equal(plan.state, "running");
  assert.equal(plan.i, 0);
  assert.deepEqual(J(plan.legs.map((l) => l.state)), ["pending", "pending", "pending", "pending"]);
  assert.deepEqual(J(plan.prefs), { backend: null, threePath: null });
  assert.equal(B.newPlan("nope", {}).test, "paths");
});

test("bench-run: WEATHER & TRACKS and GARAGE run on the player's own renderer (no path switch)", () => {
  const B = load();
  const races = B.TESTS.find((t) => t.id === "races"), garage = B.TESTS.find((t) => t.id === "garage");
  assert.ok(races.legs.length >= 4 && races.legs.every((l) => l.kind === "race" && l.path === null && l.track && l.weather && l.tod));
  assert.ok(races.legs.some((l) => l.weather === "rain") && races.legs.some((l) => l.tod === "night"));
  assert.deepEqual(J(garage.legs.map((l) => [l.kind, l.path])), [["garage", null]]);
  const plan = B.newPlan("races", {});
  assert.equal(plan.legs[0].track, races.legs[0].track);
  assert.notEqual(plan.legs[0], races.legs[0]);   // a copy: running a plan never edits the test table
});

test("bench-run scenes: one row per race and per garage step; an unfinished leg keeps a row with its state", () => {
  const B = load();
  const st = (id, p50) => ({ id, p50, p95: p50 + 5, p99: p50 + 9, fps: 50, links: 0, pipes: 1 });
  const rows = J(B.scenes([
    { kind: "gpu", state: "done", gpuTest: { phases: [] } },
    { kind: "race", label: "Monza rain", state: "done", entry: { cold: { goMs: 5000 } }, steps: [st("race", 22)] },
    { kind: "race", label: "Spa rain", state: "failed", reason: "race ended early: hidden" },
    { kind: "garage", label: "Garage", state: "done", entry: { cold: { goMs: 1200 } }, steps: [st("idle", 16.7), st("livery 1", 18)] },
  ]));
  assert.deepEqual(rows.map((r) => r.label), ["Monza rain", "Spa rain", "Garage · idle", "Garage · livery 1"]);
  assert.equal(rows[0].p99, 31);
  assert.equal(rows[0].coldMs, 5000);
  assert.deepEqual([rows[1].state, rows[1].reason], ["failed", "race ended early: hidden"]);
  assert.equal(rows[3].coldMs, 1200);
});

test("bench-run pathPrefs: three.js plus THREE PATH (tlxForceGL 0 = WebGPU, 1 = WebGL2); null keeps the player's", () => {
  const B = load();
  assert.deepEqual(J(B.pathPrefs("webgpu", null)), { backend: "three", threePath: "0" });
  assert.deepEqual(J(B.pathPrefs("webgl2", null)), { backend: "three", threePath: "1" });
  const mine = { backend: "webgl2", threePath: null };
  assert.equal(B.pathPrefs(null, mine), mine);
});

test("bench-run median: odd, even, empty, and nulls skipped", () => {
  const B = load();
  assert.equal(B.median([3, 1, 2]), 2);
  assert.equal(B.median([4, 1, 2, 3]), 2.5);
  assert.equal(B.median([]), null);
  assert.equal(B.median([null, 5, undefined]), 5);
});

test("bench-run summarize: per bound api, medians over finished legs only; failed and reloaded legs do not count", () => {
  const B = load();
  const s = J(B.summarize([
    leg("webgpu", [17, 30]), leg("webgl2", [20, 40]), leg("webgl2", [22, 44]), leg("webgpu", [19, 34]),
    { path: "webgpu", state: "reloaded", reason: "the page reloaded during this leg" },
    leg("webgpu", [99, 99], { state: "failed" }),
  ]));
  assert.deepEqual(Object.keys(s).sort(), ["webgl2", "webgpu"]);
  assert.equal(s.webgpu.legs, 2);
  assert.equal(s.webgpu.phases.default.p50, 18);
  assert.equal(s.webgpu.phases.s100.p50, 32);
  assert.equal(s.webgl2.phases.default.p95, 25);
  assert.equal(s.webgl2.fill, 6);
  assert.equal(s.webgl2.coldMs, 4000);
  assert.equal(s.webgl2.warmMs, 900);
  assert.equal(s.webgl2.links, 2);
  assert.equal(s.webgpu.gpuTimer, false);
});

test("bench-run summarize: a leg that fell back is filed under the api that actually drew", () => {
  const B = load();
  const s = J(B.summarize([leg("webgl2", [20, 40], { path: "webgpu" })]));
  assert.deepEqual(Object.keys(s), ["webgl2"]);
});
