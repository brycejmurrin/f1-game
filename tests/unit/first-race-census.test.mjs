// #3673: the first-race census's pure half — flag parsing and the post-lights grouping a pre-mint reads.
// #5283: a lost hook fails the census (hookLost, exit 1), and the init-script hook survives a reload.
import { test } from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { parseArgs, latePipelines, hookFrames, summarize, installScript } from "../../tools/perf/first-race-census.mjs";

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

const O = { track: "monza", tod: null, lavapipe: true, json: "artifacts/perf/first-race-census.json" };

test("summarize: a final read without pipes is hookLost and exits 1, never post=0", () => {
  const lost = summarize({ hook: "ok webgpu", post: { pipes: null, dist: 4900 }, navigations: [{ atMs: 1, url: "a" }, { atMs: 9, url: "a" }] }, O);
  assert.equal(lost.hookLost, true);
  assert.equal(lost.exitCode, 1);
  assert.match(lost.lines[0], /FAILED hookLost/);
  assert.match(lost.lines[0], /navigations=2/);
  assert.equal(summarize({ hook: "ok", post: undefined }, O).exitCode, 1, "no post at all (a throw before the read) is also a failure");
});

test("summarize: a clean read counts late pipes across documents and exits 0", () => {
  const p = (at, state) => ({ at, state, key: "k", mat: "M:", obj: "Mesh:", sx: 1, attrs: "position", rt: "canvas", ms: 1 });
  const r = summarize({ hook: "ok webgpu", post: { pipes: [p(10, "count"), p(20, "race")], lightsAt: 15, prev: [{ pipes: [p(5, "race")], lightsAt: 1 }], dist: 5000 } }, O);
  assert.equal(r.hookLost, false);
  assert.equal(r.exitCode, 0);
  assert.match(r.lines[0], /pre=1 post=2 .* docs=2/);
});

test("installScript: hooks once the backend exists, and a reload carries the earlier document's pipes", async () => {
  const store = new Map();
  const doc = () => {
    const ls = {}; let backend = null;
    const w = {
      sessionStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) },
      addEventListener: (t, f) => { (ls[t] = ls[t] || []).push(f); },
      location: { href: "http://x/" }, performance: { now: () => 100 },
      requestAnimationFrame: () => 0, setTimeout: (f) => setTimeout(f, 1).unref(),
      __apex: { info: () => ({ state: "race" }) },
    };
    w.window = w;
    const ctx = vm.createContext(w);
    vm.runInContext(installScript(false), ctx, { filename: "first-race-census:install-script" });
    return {
      w, fire: (t) => (ls[t] || []).forEach((f) => f()),
      boot: () => { backend = { createRenderPipeline() { return 1; } }; w.GLX = { __tlx: { renderer: { backend }, backendState: () => ({ api: "webgpu" }) } }; },
      build: () => backend.createRenderPipeline({ material: {}, object: {}, geometry: {}, context: {} }),
    };
  };
  const tick = () => new Promise((r) => setTimeout(r, 20));
  const a = doc();
  await tick();
  assert.equal(a.w.__frcHook, undefined, "no backend yet: not hooked");
  a.boot(); await tick();
  assert.match(a.w.__frcHook, /^ok webgpu/);
  a.build(); a.build();
  assert.equal(a.w.__frc.pipes.length, 2);
  a.fire("pagehide");                       // the reload
  const b = doc(); b.boot(); await tick();
  assert.equal(b.w.__frcPrev.length, 1, "the earlier document is carried over");
  assert.equal(b.w.__frcPrev[0].pipes.length, 2);
  b.build();
  assert.equal(b.w.__frc.pipes.length, 1, "the new document re-hooked");
});
