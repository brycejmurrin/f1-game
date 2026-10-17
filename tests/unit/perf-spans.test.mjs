/* perf-spans.test.mjs — js/perf/spans.js: the span ring, percentiles, the off
 * switch, and __apex.perf() on the real game booted in the Node VM.
 * Run: node --test tests/unit/perf-spans.test.mjs */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const src = fs.readFileSync(new URL("../../js/perf/spans.js", import.meta.url), "utf8");
const PerfSpans = vm.runInNewContext(src + ";PerfSpans", { performance: { now: () => 0 } });

function fake() { let t = 0; const ps = PerfSpans.create(() => t); return { ps, tick: (d) => { t += d; } }; }

test("off by default: begin/end record nothing", () => {
  const { ps, tick } = fake();
  ps.begin("a"); tick(5); ps.end("a");
  assert.equal(ps.isOn(), false);
  assert.equal(Object.keys(ps.stats()).length, 0);
});

test("on: durations land in p50/p95/p99/max", () => {
  const { ps, tick } = fake();
  ps.on(true);
  for (let i = 1; i <= 100; i++) { ps.begin("physics"); tick(i); ps.end("physics"); }
  const s = ps.stats().physics;
  assert.equal(s.n, 100);
  assert.equal(s.p50, 50); assert.equal(s.p95, 95); assert.equal(s.p99, 99); assert.equal(s.max, 100);
  assert.equal(s.mean, 50.5);
});

test("nested spans are independent; end without begin is ignored", () => {
  const { ps, tick } = fake();
  ps.on(true);
  ps.end("ghost");
  ps.begin("outer"); tick(2); ps.begin("inner"); tick(3); ps.end("inner"); tick(1); ps.end("outer");
  const s = ps.stats();
  assert.equal(s.inner.p50, 3); assert.equal(s.outer.p50, 6); assert.equal(s.ghost, undefined);
});

test("ring wraps: window caps at 512 while n keeps counting", () => {
  const { ps, tick } = fake();
  ps.on(true);
  for (let i = 0; i < 600; i++) { ps.begin("x"); tick(1); ps.end("x"); }
  const s = ps.stats().x;
  assert.equal(s.n, 600); assert.equal(s.window, 512);
});

test("reset clears spans; report is JSON-serialisable", () => {
  const { ps, tick } = fake();
  ps.on(true); ps.begin("x"); tick(1); ps.end("x");
  assert.doesNotThrow(() => JSON.stringify(ps.report()));
  ps.reset();
  assert.equal(Object.keys(ps.stats()).length, 0);
});

test("LoAF is feature-detected: unsupported env reports supported:false, no throw", () => {
  const { ps } = fake();
  ps.on(true);
  assert.equal(ps.loaf().supported, false);
  assert.equal(ps.loaf().entries.length, 0);
});

test("__apex.perf() on the booted game: ai/collide spans fill from step()", async () => {
  const { createGame } = require("../../tools/lib/game-vm.cjs");
  const g = await createGame({ track: "monza" });
  try {
    const off = g.apex.perf();
    assert.ok("frameTimes" in off, "the renderScale() shape must survive"); assert.equal(off.spans, undefined);
    g.apex.perf({ on: true, reset: true });
    g.apex.setInput({ throttle: true });
    g.step(30);
    const r = g.apex.perf();
    assert.equal(r.on, true); assert.ok("frameTimes" in r);
    assert.ok(r.spans.ai && r.spans.ai.n >= 30, "ai span n=" + (r.spans.ai && r.spans.ai.n));
    assert.ok(r.spans.ai.max > 0, "ai span is zero");
    assert.ok(r.spans.collide && r.spans.collide.n >= 30);
    assert.ok("gpu" in r);
    g.apex.perf({ on: false });
  } finally { g.close(); }
});
