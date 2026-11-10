import test from "node:test";
import assert from "node:assert/strict";
import { parseArgs, pct, dist, analyseTrace, analyseProfile, sweepSteps, analyseAlloc } from "../../tools/gfx/live-frame-census.mjs";

test("live-frame-census parseArgs: defaults are the phone census rows", () => {
  const o = parseArgs([]);
  assert.deepEqual(o.tracks, ["monaco", "spa", "singapore"]);
  assert.deepEqual(o.backends, ["tlx-gl", "tlx-gpu"]);
  assert.equal(o.cam, "helmet");
  assert.deepEqual(o.ls, []);
});

test("live-frame-census parseArgs: overrides, unknown backend dropped, window holds trace + profile, ls pairs", () => {
  const o = parseArgs(["--tracks", "spa, monaco", "--backends", "tlx-gl,wgx", "--win", "10", "--trace", "6", "--prof", "12", "--ls", "apex26.a=1 apex26.b=x=y bad"]);
  assert.deepEqual(o.tracks, ["spa", "monaco"]);
  assert.deepEqual(o.backends, ["tlx-gl"]);
  assert.equal(o.win, 22);
  assert.deepEqual(o.ls, [["apex26.a", "1"], ["apex26.b", "x=y"]]);
  assert.throws(() => parseArgs(["--nope"]), /unknown flag/);
});

test("live-frame-census pct/dist: nearest-rank percentiles", () => {
  const a = [5, 1, 4, 2, 3];
  assert.equal(pct(a, 0.5), 3);
  assert.equal(pct(a, 0.99), 5);
  assert.equal(pct([], 0.5), null);
  assert.deepEqual(dist([10, 20]), { n: 2, p50: 10, p95: 20, p99: 20, max: 20, mean: 15 });
});

test("live-frame-census analyseTrace: merged toplevel busy per thread, GC split", () => {
  const ev = [
    { ph: "M", name: "thread_name", pid: 1, tid: 2, args: { name: "CrRendererMain" } },
    { ph: "M", name: "process_name", pid: 1, args: { name: "Renderer" } },
    { ph: "X", cat: "toplevel", pid: 1, tid: 2, ts: 0, dur: 10000, name: "RunTask" },
    { ph: "X", cat: "toplevel", pid: 1, tid: 2, ts: 5000, dur: 10000, name: "RunTask" },   // overlaps: 15 ms merged
    { ph: "X", cat: "v8", pid: 1, tid: 2, ts: 1000, dur: 3000, name: "MinorGC" },
    { ph: "X", cat: "v8", pid: 1, tid: 2, ts: 20000, dur: 8000, name: "MajorGC" },
  ];
  const r = analyseTrace(ev, 3);
  assert.equal(r.threads[0].thread, "CrRendererMain");
  assert.equal(r.threads[0].busyMs, 15);
  assert.equal(r.threads[0].perFrame, 5);
  assert.deepEqual([r.gc.minorN, r.gc.minorMs, r.gc.majorN, r.gc.majorMax], [1, 3, 1, 8]);
});

test("live-frame-census analyseProfile: self time by function and file", () => {
  const p = { startTime: 0, endTime: 4000, samples: [1, 2, 2, 3],
    nodes: [
      { id: 1, callFrame: { functionName: "(idle)", url: "", lineNumber: -1 } },
      { id: 2, callFrame: { functionName: "render", url: "http://x/js/game.js?v=dev", lineNumber: 9 } },
      { id: 3, callFrame: { functionName: "draw", url: "http://x/vendor/three.webgpu.min.js", lineNumber: 5 } },
    ] };
  const r = analyseProfile(p);
  assert.equal(r.ms, 4);
  assert.equal(r.idleMs, 1);
  assert.deepEqual(r.fns[0], ["render game.js:10", 2]);
  assert.deepEqual(r.files.find((f) => f[0] === "three.webgpu.min.js"), ["three.webgpu.min.js", 1]);
});

test("live-frame-census parseArgs: phone-cost options, as flags and as lf.* pseudo-keys that never reach the page", () => {
  const d = parseArgs([]);
  assert.deepEqual([d.dsf, d.cpuThrottle, d.sweep, d.lab], [1.5, 1, [], ""], "defaults leave the census rows as they were");
  const f = parseArgs(["--dsf", "3", "--cpu-throttle", "4", "--lab", "dpr3", "--sweep", "1.5,3,2,9", "--step", "4"]);
  assert.deepEqual([f.dsf, f.cpuThrottle, f.lab, f.step], [3, 4, "dpr3", 4]);
  assert.deepEqual(f.sweep, [3, 2, 1.5], "caps sorted descending (capDpr only lowers); an out-of-range cap is dropped");
  const r = parseArgs(["--ls", "apex26.a=1 lf.dsf=3 lf.sweep=2,3 lf.cpuThrottle=6 lf.lab=dpr3 lf.win=30"]);
  assert.deepEqual(r.ls, [["apex26.a", "1"]]);
  assert.deepEqual([r.dsf, r.cpuThrottle, r.lab, r.win, r.sweep], [3, 6, "dpr3", 30, [3, 2]]);
  assert.equal(parseArgs(["--lab", "dpr3,<script>"]).lab, "dpr3", "a lab name is alphanumeric: it goes into the URL");
});

test("live-frame-census sweepSteps: every cap at scale 1 / 0.75 / 0.5, caps in the given order", () => {
  assert.deepEqual(sweepSteps([3, 1.5]).map((s) => s.cap + "@" + s.scale), ["3@1", "3@0.75", "3@0.5", "1.5@1", "1.5@0.75", "1.5@0.5"]);
  assert.deepEqual(sweepSteps([]), []);
});

test("live-frame-census analyseAlloc: bytes by allocating function per frame, native frames named", () => {
  const profile = { head: { callFrame: { functionName: "(root)", url: "" }, selfSize: 0, children: [
    { callFrame: { functionName: "tick", url: "http://h/js/game.js?v=1", lineNumber: 9 }, selfSize: 2048, children: [
      { callFrame: { functionName: "", url: "", lineNumber: 0 }, selfSize: 1024, children: [] }] },
    { callFrame: { functionName: "tick", url: "http://h/js/game.js?v=1", lineNumber: 9 }, selfSize: 2048, children: [] }] } };
  const a = analyseAlloc(profile, 2);
  assert.deepEqual([a.frames, a.totalKB, a.kbPerFrame], [2, 5, 2.5]);
  assert.deepEqual(a.top, [["tick game.js:10", 2], ["(anon) (native):1", 0.5]]);
  assert.equal(analyseAlloc({}, 0).kbPerFrame, 0);
  assert.equal(parseArgs(["--alloc", "8", "--win", "10"]).win, 30, "the window holds trace + profile + alloc");
});
