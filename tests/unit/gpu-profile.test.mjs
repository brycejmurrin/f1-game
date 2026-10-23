/* gpu-profile.test.mjs — js/perf/gpu-profile.js: compile counter, pass
 * timing, buffer fail ring, mirrorPrepare elapsed, off-by-default.
 * Run: node --test tests/unit/gpu-profile.test.mjs */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { absSrc } from "../helpers/abs-src.mjs";

const src = fs.readFileSync(new URL("../../js/perf/gpu-profile.js", import.meta.url), "utf8");

function load(opts) {
  let t = 0;
  const performance = { now: () => t };
  const location = { search: (opts && opts.search) || "" };
  const logs = [];
  const Log = { warn: (...a) => logs.push(a) };
  const ctx = { performance, location, Log, window: {} };
  // VF6: pass filename so vm-filename-lint does not count this as a free load.
  vm.runInNewContext(src + ";this.GpuProfile = GpuProfile;", ctx, { filename: absSrc("js/perf/gpu-profile.js") });
  return {
    GP: ctx.GpuProfile,
    tick: (d) => { t += d; },
    logs,
    setSearch: (q) => { location.search = q; },
  };
}

test("off without ?apex: noteCompile / pass / buffer are no-ops", () => {
  const { GP } = load({ search: "" });
  assert.equal(GP.enabled(), false);
  GP.noteCompile("renderPipeline", 1.5);
  GP.passBegin("scene"); GP.passEnd("scene");
  GP.noteBufferCreate(1024);
  GP.noteBufferFail({ size: 64 });
  GP.noteMirrorPrepare({ elapsedMs: 55000, timedOut: true });
  const s = GP.snapshot();
  assert.equal(s.on, false);
  assert.equal(s.compiles.missedWarm, 0);
  assert.equal(s.passes.scene.n, 0);
  assert.equal(s.buffers.liveCount, 0);
  assert.equal(s.buffers.failCount, 0);
  assert.equal(s.mirrorPrepare.samples, 0);
});

test("?apex on: compile counter tags phase and flags race as missedWarm", () => {
  const { GP } = load({ search: "?apex=1" });
  assert.equal(GP.enabled(), true);
  GP.setPhase("menu-warm");
  GP.noteCompile("renderPipeline", 2);
  GP.noteCompile("shaderModule", 0.5);
  GP.setPhase("race");
  GP.noteCompile("computePipeline", 3);
  const s = GP.snapshot();
  assert.equal(s.compiles.byKind.renderPipeline, 1);
  assert.equal(s.compiles.byKind.shaderModule, 1);
  assert.equal(s.compiles.byKind.computePipeline, 1);
  assert.equal(s.compiles.byPhase["menu-warm"], 2);
  assert.equal(s.compiles.byPhase.race, 1);
  assert.equal(s.compiles.missedWarm, 1);
  assert.equal(s.compiles.recent.length, 3);
  assert.equal(s.compiles.recent[2].missedWarm, true);
  assert.equal(s.compiles.recent[0].missedWarm, false);
});

test("?apex on: per-pass scene/shadow/post/mirror wall times", () => {
  const { GP, tick } = load({ search: "?apex" });
  GP.setEnabled(true);
  for (const name of ["scene", "shadow", "post", "mirror"]) {
    GP.passBegin(name); tick(name === "scene" ? 4 : 1); GP.passEnd(name);
  }
  const p = GP.snapshot().passes;
  assert.equal(p.scene.n, 1);
  assert.equal(p.scene.lastMs, 4);
  assert.equal(p.shadow.n, 1);
  assert.equal(p.post.n, 1);
  assert.equal(p.mirror.n, 1);
  assert.ok(p.scene.meanMs === 4);
});

test("?apex on: buffer create + fail ring keeps size and live totals", () => {
  const { GP, logs } = load({ search: "?debug=1" });
  assert.equal(GP.enabled(), true);
  GP.noteBufferCreate(1024);
  GP.noteBufferCreate(2048);
  GP.noteBufferFail({ size: 4096, label: "big" });
  const b = GP.snapshot().buffers;
  assert.equal(b.liveCount, 2);
  assert.equal(b.liveBytes, 3072);
  assert.equal(b.failCount, 1);
  assert.equal(b.failRing.length, 1);
  assert.equal(b.failRing[0].size, 4096);
  assert.equal(b.failRing[0].liveBytes, 3072);
  assert.ok(logs.length >= 1);
});

test("?apex on: mirrorPrepare records real elapsed and timeout hits", () => {
  const { GP } = load({ search: "?apex=1" });
  GP.noteMirrorPrepare({ elapsedMs: 55234.5, timedOut: true });
  GP.noteMirrorPrepare({ elapsedMs: 1200, timedOut: false });
  const m = GP.snapshot().mirrorPrepare;
  assert.equal(m.samples, 2);
  assert.equal(m.timeoutHits, 1);
  assert.equal(m.lastTimedOut, false);
  assert.equal(m.lastElapsedMs, 1200);
});

test("wrapDevice / wrapGl count creates when enabled", () => {
  const { GP, tick } = load({ search: "?apex=1" });
  const device = {
    createRenderPipeline(desc) { tick(2); return { desc }; },
    createComputePipeline(desc) { tick(1); return { desc }; },
    createShaderModule(desc) { tick(0.5); return { desc }; },
  };
  assert.equal(GP.wrapDevice(device), true);
  device.createRenderPipeline({ label: "a" });
  device.createShaderModule({ code: "fn main(){}" });
  const gl = { createProgram() { tick(1); return {}; } };
  assert.equal(GP.wrapGl(gl), true);
  gl.createProgram();
  const s = GP.snapshot();
  assert.equal(s.compiles.byKind.renderPipeline, 1);
  assert.equal(s.compiles.byKind.shaderModule, 1);
  assert.equal(s.compiles.byKind.program, 1);
  // Second wrap is a no-op (already installed).
  assert.equal(GP.wrapDevice(device), false);
});

test("reset clears counters; setEnabled(false) stops recording", () => {
  const { GP, tick } = load({ search: "?apex=1" });
  GP.noteCompile("program", 1);
  GP.passBegin("scene"); tick(3); GP.passEnd("scene");
  GP.reset();
  assert.equal(GP.snapshot().compiles.byKind.program, 0);
  assert.equal(GP.snapshot().passes.scene.n, 0);
  GP.setEnabled(false);
  GP.noteCompile("program", 9);
  assert.equal(GP.snapshot().compiles.byKind.program, 0);
  assert.equal(GP.snapshot().on, false);
});
