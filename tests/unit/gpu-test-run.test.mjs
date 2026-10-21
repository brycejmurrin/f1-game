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

test("gpu-test-run: the plan is default, the 0.5/0.75/1.0 sweep, mirror off, default again, under 3 min", () => {
  const G = load();
  assert.deepEqual(J(G.PHASES.map((p) => p.id)), ["default", "s50", "s75", "s100", "mirrorOff", "again"]);
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

test("gpu-test-run fillSlope: frame p50 against scale squared; flat when the frame is not fill-bound", () => {
  const G = load();
  // 10 ms of fixed cost + 20 ms per full-resolution frame of pixels.
  const rows = [0.5, 0.75, 1].map((scale) => ({ scale, p50: 10 + 20 * scale * scale }));
  assert.deepEqual(J(G.fillSlope(rows)), { msPerFullFrame: 20, interceptMs: 10, points: 3 });
  const flat = G.fillSlope([0.5, 0.75, 1].map((scale) => ({ scale, p50: 33.3 })));
  assert.equal(flat.msPerFullFrame, 0);
  assert.equal(G.fillSlope([{ scale: 1, p50: 30 }]), null);
});
