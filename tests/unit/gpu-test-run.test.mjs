// GpuTestRun (js/perf/gpu-test-run.js): the GPU TEST phase plan and its pure readers. The phone run itself
// needs a real GPU; what a test can pin is the arithmetic the shared JSON is read by.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = readFileSync(join(ROOT, "js/perf/gpu-test-run.js"), "utf8");
const load = () => vm.runInNewContext(SRC + "\n;GpuTestRun", { performance: { now: () => 0 } }, { filename: absSrc("js/perf/gpu-test-run.js") });
const J = (x) => JSON.parse(JSON.stringify(x));   // the VM's arrays and objects carry its realm's prototypes

test("gpu-test-run: the plan is default, the first boost, the 0.5/0.75/1.0 sweep, mirror off, default again, under 3 min", () => {
  const G = load();
  assert.deepEqual(J(G.PHASES.map((p) => p.id)), ["default", "boost", "s50", "s75", "s100", "mirrorOff", "again"]);
  assert.deepEqual(J(G.PHASES.filter((p) => p.scale).map((p) => p.scale)), [0.5, 0.75, 1.0]);
  assert.ok(G.PHASES.length * (G.SETTLE_MS + G.MEASURE_MS) <= 180000);
  assert.equal(G.active(), false);
});

test("gpu-test-run phaseStats: nearest-rank percentiles, fps, share over 50 ms, GPU ms only when >= 0", () => {
  const G = load();
  const s = G.phaseStats([16, 17, 18, 60, 16], [-1, 4, 6], { links: 2, pipes: 0 });
  assert.equal(s.frames, 5);
  assert.equal(s.p50, 17);
  assert.equal(s.p99, 60);
  assert.equal(s.over50, 20);
  assert.equal(s.fps, Math.round(1000 * 5 / 127 * 100) / 100);
  assert.deepEqual(J(s.gpu), { n: 2, p50: 4, p95: 6 });
  assert.equal(s.links, 2);
  assert.equal(G.phaseStats([], [], { links: 0, pipes: 0 }).gpu, null);
});

test("hookCounts tallies createRenderPipelineAsync on the same pipes count as the sync call", () => {
  class GPUDevice {
    createRenderPipeline() { return { sync: true }; }
    createRenderPipelineAsync() { return Promise.resolve({ async: true }); }
  }
  const ctx = vm.createContext({ performance: { now: () => 0 }, GPUDevice, Promise });
  vm.runInContext(SRC, ctx, { filename: absSrc("js/perf/gpu-test-run.js") });
  const out = vm.runInContext(`
    const c = { links: 0, pipes: 0 };
    const undo = GpuTestRun.hookCounts(c);
    const dev = new GPUDevice();
    dev.createRenderPipeline();
    const pending = dev.createRenderPipelineAsync();
    const during = c.pipes;
    const stillPromise = pending && typeof pending.then === "function";
    undo();
    dev.createRenderPipeline();
    dev.createRenderPipelineAsync();
    ({ during, after: c.pipes, stillPromise });
  `, ctx);
  assert.equal(out.during, 2, "three compileAsync and WGX warm both use the async create");
  assert.equal(out.stillPromise, true, "the wrap returns the pipeline promise");
  assert.equal(out.after, 2, "unhook restores both prototype methods");
});

test("gpu-test-run fillSlope: frame p50 against scale squared; flat when the frame is not fill-bound", () => {
  const G = load();
  // 10 ms of fixed cost + 20 ms per full-resolution frame of pixels.
  const rows = [0.5, 0.75, 1].map((scale) => ({ scale, p50: 10 + 20 * scale * scale }));
  assert.deepEqual(J(G.fillSlope(rows)), { msPerFullFrame: 20, interceptMs: 10, points: 3 });
  const flat = G.fillSlope([0.5, 0.75, 1].map((scale) => ({ scale, p50: 33.3 })));
  assert.equal(flat.msPerFullFrame, 0);
  assert.equal(G.fillSlope([{ scale: 1, p50: 30 }]), null);
});

const CAPTURE_SRC = readFileSync(join(ROOT, "js/perf/bench-capture.js"), "utf8");
function lifecycle({ supported = true, initiallyOn = false, queryThrows = false, start = () => true, boost = null, gpuDevice = null } = {}) {
  let now = 1000, next = 0, live = false, timerOn = initiallyOn;
  const callbacks = new Map(), writes = [], store = new Map();
  let samples = 0, sampleAt = -1, gpuMs = 4;
  const gfx = {
    gpuTimer(on) {
      if (on === undefined && queryThrows) throw new Error("query unavailable");
      if (on !== undefined) { writes.push(on); timerOn = supported && !!on; }
      return { supported, on: timerOn, samples, sampleAt };
    },
    getRenderScale: () => 1, setRenderScale() {}, gpuMs: () => timerOn ? gpuMs : -1,
  };
  const ctx = vm.createContext({
    performance: { now: () => now }, GLX: gfx,
    PerfGov: { autoRes: () => true, setAutoRes() {}, tier: () => 0 },
    SoakRun: {
      active: () => live, status: () => ({ state: live ? "racing" : "done" }),
      start: () => { live = true; return start(); }, stop: () => { live = false; },
      ...(boost ? { boost } : {}),
    },
    ...(gpuDevice ? { GPUDevice: gpuDevice } : {}),
    requestAnimationFrame: (fn) => { callbacks.set(++next, fn); return next; },
    cancelAnimationFrame: (id) => callbacks.delete(id),
    setInterval: () => ++next, clearInterval() {},
    localStorage: { getItem: (k) => store.get(k) || null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) },
  });
  vm.runInContext(CAPTURE_SRC + "\n" + SRC, ctx, { filename: "vm-composite:bench-capture+gpu-test-run" });
  const { G, B } = vm.runInContext("({ G: GpuTestRun, B: BenchCapture })", ctx);
  function frame(ms = 0) {
    now += ms;
    const pending = [...callbacks.values()]; callbacks.clear();
    for (const fn of pending) fn(now);
  }
  function complete() {
    frame();
    for (let i = 0; i < G.PHASES.length; i++) { frame(G.SETTLE_MS + 1); frame(G.MEASURE_MS + 1); }
  }
  return { G, B, gfx, frame, complete, writes, timerOn: () => timerOn,
    sample(n, age = 0, ms = 4) { samples = n; sampleAt = now - age; gpuMs = ms; } };
}

for (const initiallyOn of [false, true]) {
  test(`GPU TEST completion restores an enclosing BenchCapture timer (initially on=${initiallyOn})`, async () => {
    const h = lifecycle({ initiallyOn });
    h.B.legStart({ label: "WEBGPU" }, { gfx: h.gfx, state: "race" });
    assert.equal(h.timerOn(), true);
    assert.equal(await h.G.start(), true);
    h.complete();
    assert.equal(h.G.status().reason, "complete");
    assert.equal(h.G.status().phases, h.G.PHASES.length);
    assert.equal(h.timerOn(), true, "outer capture still owns the timer for its warm race");
    h.B.step();
    h.B.legEnd();
    assert.equal(h.timerOn(), initiallyOn, "capture restores its own prior state");
  });
}

for (const outcome of ["stopped", "refused", "rejected", "threw"]) {
  test(`GPU TEST restores a prior enabled timer when ${outcome}`, async () => {
    const h = lifecycle({ initiallyOn: true, start: () => {
      if (outcome === "refused") return false;
      if (outcome === "rejected") return Promise.reject(new Error("start failed"));
      if (outcome === "threw") throw new Error("start failed synchronously");
      return true;
    } });
    assert.equal(await h.G.start(), outcome === "stopped");
    if (outcome === "stopped") h.G.stop();
    assert.equal(h.G.active(), false);
    assert.equal(h.timerOn(), true);
  });
}

for (const config of [{}, { supported: false }, { queryThrows: true }]) {
  test(`GPU TEST safely restores standalone timer state (${JSON.stringify(config)})`, async () => {
    const h = lifecycle(config);
    assert.equal(await h.G.start(), true);
    h.complete();
    assert.equal(h.G.active(), false);
    assert.equal(h.timerOn(), false);
  });
}

for (const settle of ["refused", "accepted", "rejected"]) {
  test(`cancelled GPU TEST's late ${settle} start cannot finish a newer run`, async () => {
    let resolve, reject, starts = 0;
    const pending = new Promise((res, rej) => { resolve = res; reject = rej; });
    const h = lifecycle({ initiallyOn: true, start: () => ++starts === 1 ? pending : true });
    const first = h.G.start();
    assert.equal(h.G.stop(), true);
    assert.equal(h.timerOn(), true);
    assert.equal(await h.G.start(), true);
    if (settle === "rejected") reject(new Error("late failure"));
    else resolve(settle === "accepted");
    assert.equal(await first, false);
    assert.equal(h.G.active(), true, "the newer run retains lifecycle ownership");
    assert.equal(h.timerOn(), true);
    h.G.stop();
    assert.equal(h.timerOn(), true);
  });
}


test("GPU TEST counts new resolutions once, including equal-duration results, and excludes prior phases", async () => {
  const h = lifecycle(); let result;
  await h.G.start({ onDone: (value) => { result = value; } });
  h.sample(1); h.frame(); h.frame(h.G.SETTLE_MS + 1); // retained pre-window result
  h.sample(2); h.frame(1); // new resolved observation
  h.frame(100); // same serial cannot inflate n
  h.sample(3); h.frame(1); // an identical 4ms duration is independently fresh
  h.sample(4, 10000); h.frame(1); // delayed pre-window source result is excluded
  h.frame(h.G.MEASURE_MS); // finish first phase
  for (let i = 1; i < h.G.PHASES.length; i++) {
    h.frame(h.G.SETTLE_MS + 1); h.frame(h.G.MEASURE_MS + 1);
  }
  assert.equal(result.reason, "complete");
  assert.equal(result.phases[0].gpu.n, 2);
  assert.equal(result.phases[0].gpu.p50, 4);
  assert.equal(result.phases[0].gpuSampling.state, "fresh");
  assert.equal(result.phases[0].gpuSampling.basis, "resolved-during-window");
  for (const phase of result.phases.slice(1)) {
    assert.equal(phase.gpu, null);
    assert.equal(phase.gpuSampling.state, "no fresh sample");
  }
});

for (const mode of ["unsupported", "inactive", "missing-serial"]) {
  test(`GPU TEST labels ${mode} timing without counting cached readouts`, async () => {
    const h = lifecycle({ supported: mode !== "unsupported" }); let result;
    const timer = h.gfx.gpuTimer;
    h.gfx.gpuTimer = (on) => {
      const state = timer(on);
      if (mode === "inactive") state.on = false;
      if (mode === "missing-serial") delete state.samples;
      return state;
    };
    await h.G.start({ onDone: (value) => { result = value; } });
    h.complete();
    assert.equal(result.phases[0].gpu, null);
    assert.equal(result.phases[0].gpuSampling.state, mode === "unsupported" ? "unsupported"
      : mode === "inactive" ? "timer inactive" : "freshness unavailable");
  });
}

test("GPU TEST boost phase: the session's first deploy, its worst frame and the pipelines built in its window", async () => {
  // Bryce, 2026-10-30: "anytime I hit the boost the first time the game stalls for a second" (TLX WebGPU, iPhone).
  // No container can run that path, so the phone's own GPU TEST reads it. The base tree has no boost phase.
  const calls = [];
  let deploying = false;
  class FakeDevice { createRenderPipeline() { return {}; } createRenderPipelineAsync() { return Promise.resolve({}); } }
  const h = lifecycle({ gpuDevice: FakeDevice, boost: (on) => { if (typeof on === "boolean") { calls.push(on); deploying = on; } return deploying; } });
  let result = null;
  assert.equal(await h.G.start({ onDone: (r) => { result = r; } }), true);
  h.frame();
  h.frame(h.G.SETTLE_MS + 1); h.frame(h.G.MEASURE_MS + 1);    // default
  assert.deepEqual(calls, [], "the default phase never boosts");
  h.frame(h.G.SETTLE_MS + 1); h.frame(16);                      // boost: settled, the measure window opens, BOOST goes on
  assert.deepEqual(calls, [true]);
  new FakeDevice().createRenderPipeline();                        // the first deploy builds one pipeline...
  h.frame(16); h.frame(940); h.frame(16);                         // ...and stalls one frame
  h.frame(h.G.BOOST_WINDOW_MS);                                   // past the window: its counts are fixed
  new FakeDevice().createRenderPipeline();                        // a later build is the phase's, not the first deploy's
  h.frame(h.G.MEASURE_MS);
  assert.deepEqual(calls, [true, false], "BOOST goes off when the phase ends");
  for (let i = 2; i < h.G.PHASES.length; i++) { h.frame(h.G.SETTLE_MS + 1); h.frame(h.G.MEASURE_MS + 1); }
  assert.equal(result.reason, "complete");
  const row = result.phases.find((p) => p.id === "boost");
  assert.deepEqual(J(row.boost), { deployed: true, firstMaxMs: 940, windowMs: h.G.BOOST_WINDOW_MS, links: 0, pipes: 1 });
  assert.equal(row.pipes, 2, "the whole phase still counts every build");
  assert.deepEqual(J(result.firstBoost), J(row.boost));
  assert.deepEqual(calls, [true, false], "no other phase touches BOOST");
});

