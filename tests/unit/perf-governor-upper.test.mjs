/* perf-governor-upper.test.mjs — the governor's UPPER ladder (docs/GOVERNOR-RATIONALE.md §gov-42).
 *
 * Desktop ULTRA / EXTREME on TLX sheds the GfxQuality extras (SHED_ORDER, last first) before any of
 * today's levers, restores them last, and reads the TLX GPU timer to tell "GPU-bound" from "capped".
 * At detail 0 (HIGH and below, every phone), and on a backend without `__tlx`, the governor must take
 * exactly today's decisions: the first tests replay traces with and without GfxQuality and compare.
 *
 * Run: node --test tests/unit/perf-governor-upper.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { absSrc } from "../helpers/abs-src.mjs";
import { symbolSource } from "../helpers/game-source.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const GOV = fs.readFileSync(path.join(ROOT, "js/perf/governor.js"), "utf8");
const QP = fs.readFileSync(path.join(ROOT, "js/perf/quality-preset.js"), "utf8");
const SCALE_EPS = 0.02;   // GLX/TLX setRenderScale dead zone (see perf-governor.test.mjs)

// preset: null = no GfxQuality global at all; else the stored gfxPreset id. opts.tlx adds `__tlx`;
// opts.gpu(frame) is the GPU ms the fake timer reports (no opts.gpu: the backend has no timer).
function rig(preset, opts = {}) {
  const raw = new Map(), kv = new Map();
  if (preset) kv.set("gfxPreset", preset);
  const store = {
    raw: (k) => (raw.has(k) ? raw.get(k) : null), rawSet: (k, v) => raw.set(k, String(v)), rawDel: (k) => raw.delete(k),
    get: (k, d) => (kv.has(k) ? kv.get(k) : d), set: (k, v) => kv.set(k, v),
  };
  const ctx = vm.createContext({ Log: { info() {}, warn() {}, debug() {} }, GameStore: { store }, window: { __APEX_BUILD: 1 } });
  const GQ = preset ? vm.runInContext(QP + ";GfxQuality", ctx, { filename: absSrc("js/perf/quality-preset.js") }) : null;
  const PerfGov = vm.runInContext(GOV + ";PerfGov", ctx, { filename: absSrc("js/perf/governor.js") });
  let scale = 1, timerOn = false, frame = 0;
  const gfx = {
    isMobile: !!opts.mobile,
    getRenderScale: () => scale,
    setRenderScale: (s) => {
      s = Math.max(0.5, Math.min(opts.maxScale || 1, s));
      if (Math.abs(s - scale) < SCALE_EPS) return false;
      scale = s; return true;
    },
  };
  if (opts.tlx) gfx.__tlx = {};
  if (opts.maxScale) { gfx.maxRenderScale = () => opts.maxScale; scale = opts.startScale || 1; }
  if (opts.gpu) {
    gfx.gpuTimer = (on) => {
      if (on !== undefined) timerOn = !!on;
      return { supported: true, on: timerOn, samples: frame, sampleAt: 1, sampleAgeMs: 16 };
    };
    gfx.gpuMs = () => (timerOn ? opts.gpu(frame) : -1);
  }
  PerfGov.init(gfx);
  PerfGov.sentinelArm(true);
  const on = () => (GQ ? GQ.SHED_ORDER.filter((n) => GQ.feature(n)).length : 0);
  function run(dtFn, n, log) {
    for (let i = 0; i < n; i++, frame++) {
      PerfGov.tick(dtFn(i, { scale, on: on(), tier: PerfGov.tier() }));
      if (log) log.push(`${scale.toFixed(3)}|${PerfGov.tier()}|${PerfGov.extrasShed()}`);
    }
  }
  return { PerfGov, GQ, run, scale: () => scale, on, timerOn: () => timerOn };
}

// Today's shapes from perf-governor.test.mjs: capped clock, fill-bound, feature-bound, recovery, healthy jitter.
const TRACES = {
  capped30: () => 33.3,
  fillBound: (i, s) => (i % 20 === 0 ? 10 : 30 * s.scale),
  featureBound: (i, s) => (i % 20 === 0 ? 12 : 30 - s.tier * 4),
  recover: (i, s) => (i < 1500 ? (i % 20 === 0 ? 10 : 30 * s.scale) : 14),
  jitter: (i) => 15 + (i % 3),
};

for (const [name, fn] of Object.entries(TRACES)) {
  test(`detail 0 takes today's decisions, frame for frame: ${name}`, () => {
    const base = []; rig(null, { tlx: true }).run(fn, 3000, base);
    for (const preset of ["low", "medium", "high"]) {
      const got = []; const r = rig(preset, { tlx: true, gpu: () => 5 });
      assert.equal(r.GQ.detail(), 0);
      r.run(fn, 3000, got);
      assert.deepEqual(got, base, `GRAPHICS ${preset} must govern exactly as without GfxQuality`);
      assert.equal(r.timerOn(), false, "detail 0 never switches the GPU timer on");
    }
  });
}

test("a backend without __tlx (GLX / WGX) on a stored EXTREME governs as today", () => {
  const base = []; rig(null).run(TRACES.fillBound, 3000, base);
  const glx = []; const r = rig("extreme", { gpu: () => 25 });
  assert.equal(r.GQ.detail(), 2);
  r.run(TRACES.fillBound, 3000, glx);
  assert.deepEqual(glx, base, "no __tlx: the upper ladder is inert");
  assert.equal(r.PerfGov.extrasShed(), 0);
  assert.equal(r.timerOn(), false);
});

// Every extra costs 2.5 ms of GPU; resolution scales the rest.
const extrasCost = (i, s) => (i % 20 === 0 ? 10 : 12 * s.scale + 2.5 * s.on);

test("EXTREME sheds extras before it touches the resolution", () => {
  const r = rig("extreme", { tlx: true });
  assert.equal(r.on(), 7, "every SHED_ORDER extra is on at EXTREME");
  let shedAtFirstCut = -1;
  r.run((i, s) => {
    if (shedAtFirstCut < 0 && s.scale < 1) shedAtFirstCut = r.PerfGov.extrasShed();
    return extrasCost(i, s);
  }, 4000);
  assert.ok(r.PerfGov.extrasShed() >= 3, `extras should be shed, got ${r.PerfGov.extrasShed()}`);
  assert.equal(r.GQ.shed(), r.PerfGov.extrasShed(), "the governor's count is the one GfxQuality applies");
  assert.ok(shedAtFirstCut !== 0, "no scale cut before the first extra was shed");
  assert.equal(r.GQ.feature("ssgi"), false, "SSGI (last in SHED_ORDER) goes first");
  assert.equal(r.PerfGov.tier(), 0, "today's tier ladder is untouched while extras pay for the deficit");
});

test("ULTRA skips the rungs its level never enabled", () => {
  const r = rig("ultra", { tlx: true });
  assert.equal(r.on(), 3, "raysHi / ssaoHi / superSample are the ULTRA extras");
  r.run(extrasCost, 600);
  assert.ok(r.PerfGov.extrasShed() >= 2, `the first shed lands on superSample (count 2), got ${r.PerfGov.extrasShed()}`);
  assert.equal(r.GQ.feature("superSample"), false);
});

test("extras that buy nothing roll back and the ladder falls through to today's levers", () => {
  const r = rig("extreme", { tlx: true });
  r.run(TRACES.fillBound, 4000);   // cost independent of extras: only the scale helps
  assert.equal(r.PerfGov.extrasShed(), 0, "a futile extras trial is rolled back whole");
  assert.ok(r.scale() < 1, "the resolution lever still runs");
});

test("extras come back, last, once the load is gone", () => {
  const r = rig("extreme", { tlx: true });
  r.run(extrasCost, 3000);
  assert.ok(r.PerfGov.extrasShed() > 0);
  r.run(() => 10, 8000);
  assert.equal(r.PerfGov.extrasShed(), 0, "every extra restored");
  assert.equal(r.scale(), 1);
  assert.equal(r.on(), 7);
});

test("GPU timer: a CPU-bound frame (GPU well under the frame) sheds no GPU extra", () => {
  const r = rig("extreme", { tlx: true, gpu: () => 6 });
  assert.equal(r.timerOn(), true, "ULTRA / EXTREME on TLX switches the timer on");
  r.run(extrasCost, 1500);
  assert.equal(r.PerfGov.extrasShed(), 0);
  assert.equal(r.PerfGov.gpuMs(), 6);
});

test("GPU timer: a capped display with a busy GPU does not get its extras back", () => {
  let gpu = 30;
  const r = rig("extreme", { tlx: true, gpu: () => gpu });
  r.run(extrasCost, 3000);
  const shed = r.PerfGov.extrasShed();
  assert.ok(shed > 0);
  r.run(() => 16.7, 8000);   // frame EMA calm at the vsync cap, yet the GPU reports 30 ms against a 16.7 ms floor
  assert.equal(r.PerfGov.extrasShed(), shed, "no GPU headroom: the extras stay shed");
  gpu = 8;
  r.run(() => 16.7, 8000);
  assert.equal(r.PerfGov.extrasShed(), 0, "GPU headroom: they come back");
});

test("CINEMA follows the garage, photo mode and the replay scrub every frame, and lifts only on EXTREME", () => {
  const body = symbolSource("function tickBody(");
  assert.match(body, /typeof GfxQuality !== "undefined"\) GfxQuality\.setCinema\(setupPreviewOn \|\| photoMode \|\| replayBuf\.isScrubbing\(\)\)/,
    "one derivation per frame: every exit path (DONE, Escape, race end, scrub end) turns it off on the next frame");
  for (const [preset, want] of [["high", false], ["ultra", false], ["extreme", true]]) {
    const { GQ } = rig(preset, { tlx: true });
    GQ.setCinema(true);
    assert.equal(GQ.feature("dof"), want, `${preset}: dof in CINEMA`);
    GQ.setCinema(false);
    assert.equal(GQ.feature("dof"), false, `${preset}: dof off outside CINEMA`);
  }
});

test("maxRenderScale() of 1 governs exactly as a backend without the member", () => {
  for (const fn of Object.values(TRACES)) {
    const base = []; rig(null, { tlx: true }).run(fn, 3000, base);
    const got = []; rig(null, { tlx: true, maxScale: 1 }).run(fn, 3000, got);
    assert.deepEqual(got, base);
    const b2 = [], r2 = rig(null, { tlx: true }); r2.PerfGov.setResCeil(0.75); r2.run(fn, 3000, b2);
    const g2 = [], q2 = rig(null, { tlx: true, maxScale: 1 }); q2.PerfGov.setResCeil(0.75); q2.run(fn, 3000, g2);
    assert.deepEqual(g2, b2, "a configured ceiling under 1 (phone AUTO) is kept when the backend reports 1");
  }
});

test("a supersampling ceiling (maxRenderScale 1.5) is where the restore climb returns to", () => {
  const r = rig(null, { tlx: true, maxScale: 1.5, startScale: 1.5 });
  r.run((i, s) => (i % 20 === 0 ? 10 : 20 * s.scale), 2500);   // 30 ms at 1.5: the scale is cut
  assert.ok(r.scale() < 1.5, `a slow supersampled frame is cut, got ${r.scale()}`);
  r.run(() => 10, 12000);
  assert.ok(Math.abs(r.scale() - 1.5) < 1e-9, `headroom climbs back above 1.0 to the ceiling, got ${r.scale()}`);
  const plain = rig(null, { tlx: true, maxScale: 1 });
  plain.run(() => 10, 3000);
  assert.equal(plain.scale(), 1, "a ceiling of 1 never climbs past 1");
});

test("setTierHold pins the upper ladder too (measurement pin)", () => {
  const r = rig("extreme", { tlx: true });
  r.PerfGov.setTierHold(true);
  r.run(extrasCost, 3000);
  assert.equal(r.PerfGov.extrasShed(), 0);
});
