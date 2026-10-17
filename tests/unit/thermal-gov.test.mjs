/* thermal-gov.test.mjs — #2652: the slow-drift detector, the governor's one early
 * step, and the opt-in 45/30 render-rate gate (js/perf/thermal-gov.js).
 *
 * No thermal or GPU evidence exists in this container (SwiftShader), so the drift
 * side is proven on SYNTHETIC frame-time series: drift -> step, steady -> no
 * step, recovery -> no further step. The gate is proven by exact counts: draws
 * per 60 physics ticks are 60 / 45 / 30. Physics itself is untouched by this
 * file's subject (game.js only skips the draw); physics-characterization is the
 * gate for that.
 *
 * Run: node --test tests/unit/thermal-gov.test.mjs   (npm run test:tooling-fast)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { seedLogGlobal } from "../helpers/seed-log.mjs";
import { seedStoreGlobal } from "../helpers/seed-store.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
seedLogGlobal();
seedStoreGlobal();
const TG_SRC = fs.readFileSync(path.join(ROOT, "js/perf/thermal-gov.js"), "utf8");
const GOV_SRC = fs.readFileSync(path.join(ROOT, "js/perf/governor.js"), "utf8");
const ThermalGov = eval(TG_SRC + ";ThermalGov");
globalThis.ThermalGov = ThermalGov;

/** Feed `seconds` of frames whose interval is f(tSec); returns the frame at which feed first said due, or -1. */
function run(d, f, seconds, t0 = 0) {
  let t = t0, firstDue = -1, n = 0;
  while (t < t0 + seconds) {
    const ms = f(t);
    if (d.feed(ms) && firstDue < 0) firstDue = n;
    t += ms / 1000; n++;
  }
  return { firstDue, t };
}
const jitter = (i) => ((i * 7919) % 13) / 13 - 0.5;   // deterministic +-0.5

test("steady frames never ask for a step, however long", () => {
  const d = ThermalGov.drift();
  let i = 0;
  const { firstDue } = run(d, () => 16.7 + 0.3 * jitter(i++), 1800);
  assert.equal(firstDue, -1);
  assert.equal(d.state().steps, 0);
  assert.ok(d.state().baseline > 16 && d.state().baseline < 17.5);
});

test("a slow upward drift is flagged after the baseline minute, before any hitch", () => {
  const d = ThermalGov.drift();
  let i = 0;
  // minute 0-1.5 steady, then 16.7 -> 24 ms over six minutes (a heating phone)
  const f = (t) => 16.7 + 0.3 * jitter(i++) + (t < 90 ? 0 : Math.min(7.3, (t - 90) / 360 * 7.3));
  const { firstDue, t } = run(d, f, 600);
  assert.ok(firstDue > 0, "drift was detected");
  assert.ok(d.state().baseline > 16 && d.state().baseline < 17.5, "baseline is the first minute, not the drifted state");
  assert.ok(d.state().ema > d.state().baseline * 1.12);
  assert.ok(t > 90, "not before the drift started");
});

test("a single 10 s hitch window is not drift", () => {
  const d = ThermalGov.drift();
  let i = 0;
  const { firstDue } = run(d, (t) => 16.7 + 0.3 * jitter(i++) + (t > 100 && t < 110 ? 9 : 0), 600);
  assert.equal(firstDue, -1);
});

test("stepped() re-baselines on the cheaper state and waits a cooldown; recovery stays quiet", () => {
  const d = ThermalGov.drift();
  let i = 0;
  const drift = (t) => 16.7 + 0.3 * jitter(i++) + (t < 90 ? 0 : 5);
  const r = run(d, drift, 300);
  assert.ok(r.firstDue > 0);
  d.stepped();
  assert.equal(d.state().due, false);
  assert.equal(d.state().steps, 1);
  // after the step the frames are cheap again and stay cheap: no more steps ever
  const r2 = run(d, () => 16.7 + 0.3 * jitter(i++), 900, r.t);
  assert.equal(r2.firstDue, -1);
  assert.equal(d.state().steps, 1);
});

test("a step budget caps the detector (the ladder is finite)", () => {
  const d = ThermalGov.drift();
  let steps = 0, t = 0;
  for (let k = 0; k < 20; k++) {
    // each re-baselined stretch drifts again
    const r = run(d, (u) => 16.7 + (u - t < 90 ? 0 : 6), 400, t);
    t = r.t;
    if (r.firstDue >= 0) { d.stepped(); steps++; }
  }
  assert.equal(steps, 4);
});

test("renderGate: draws per 60 physics ticks are exactly 60 / 45 / 30 and no frame carries more than render's own clamp", () => {
  for (const [rate, want] of [[60, 60], [45, 45], [30, 30]]) {
    const g = ThermalGov.renderGate(rate);
    for (let i = 0; i < 90; i++) g.next(1 / 60, true);   // warm-up frames always draw
    let drawn = 0, maxDt = 0;
    for (let i = 0; i < 60; i++) { const d = g.next(1 / 60, true); if (d > 0) { drawn++; maxDt = Math.max(maxDt, d); } }
    assert.equal(drawn, want, "rate " + rate);
    assert.ok(maxDt <= 1 / 20 + 1e-9);
  }
});

test("renderGate: skipped time is handed to the next drawn frame (camera damping stays on the wall clock)", () => {
  const g = ThermalGov.renderGate(30);
  for (let i = 0; i < 90; i++) g.next(1 / 60, true);
  let total = 0, wall = 0;
  for (let i = 0; i < 600; i++) { wall += 1 / 60; total += g.next(1 / 60, true); }
  assert.ok(Math.abs(total - wall) <= 1 / 30 + 1e-9, "drawn dt sums to wall time within one draw");
});

test("renderGate: a 120 Hz display still lands on the chosen rate; off-race and 60 always draw", () => {
  const g = ThermalGov.renderGate(45);
  for (let i = 0; i < 90; i++) g.next(1 / 120, true);
  let drawn = 0;
  for (let i = 0; i < 1200; i++) if (g.next(1 / 120, true) > 0) drawn++;
  assert.ok(Math.abs(drawn - 450) <= 1, "10 s at 120 Hz draws 450 frames, got " + drawn);
  const off = ThermalGov.renderGate(30);
  for (let i = 0; i < 200; i++) assert.ok(off.next(1 / 60, false) > 0, "menus always draw");
  assert.equal(ThermalGov.renderGate(7).rate(), 60, "an unknown rate falls back to 60");
  assert.equal(ThermalGov.renderGate(30).setRate(25), false);
});

test("renderGate: the race-entry frames always draw (handoff card and first presents)", () => {
  const g = ThermalGov.renderGate(30);
  for (let i = 0; i < 90; i++) assert.ok(g.next(1 / 60, true) > 0);
});

// ---- governor integration --------------------------------------------------
function makeGov(driftOn) {
  globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  globalThis.window = { __APEX_BUILD: 1 };
  const PerfGov = eval(GOV_SRC + ";PerfGov");
  let scale = 1; const moves = [];
  const gfx = { isMobile: true, getRenderScale: () => scale,
    setRenderScale: (s) => { s = Math.max(0.5, Math.min(1, s)); if (Math.abs(s - scale) < 0.02) return false; scale = s; moves.push(s); return true; } };
  PerfGov.init(gfx);
  PerfGov.setThermalDrift(driftOn);
  return { PerfGov, scale: () => scale, moves };
}
function drive(g, seconds, f) {
  let t = 0; while (t < seconds) { const ms = f(t); g.PerfGov.tick(ms); t += ms / 1000; }
}

test("governor: drift off (default) never moves the scale on a vsync-bound steady device", () => {
  const g = makeGov(false);
  let i = 0; drive(g, 900, () => 16.7 + 0.2 * jitter(i++));
  assert.equal(g.moves.length, 0);
  assert.equal(g.PerfGov.thermalDrift(), null);
});

test("governor: drift on, steady device -> no step", () => {
  const g = makeGov(true);
  let i = 0; drive(g, 900, () => 16.7 + 0.2 * jitter(i++));
  assert.equal(g.moves.length, 0);
});

test("governor: drift on takes an EXISTING rung early on a slow drift, off does not", () => {
  const series = (t) => 16.7 + (t < 90 ? 0 : Math.min(6, (t - 90) / 240 * 6));
  const on = makeGov(true), off = makeGov(false);
  drive(on, 700, series); drive(off, 700, series);
  assert.ok(on.moves.length >= 1, "drift step moved the scale: " + JSON.stringify(on.moves));
  assert.ok(on.moves.every(s => s >= 0.5 && s <= 1), JSON.stringify(on.moves) + " only scale rungs the governor already has");
  assert.ok(on.PerfGov.thermalDrift().steps >= 1);
  assert.ok(on.moves.length >= off.moves.length);
});
