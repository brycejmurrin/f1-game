/* soak-run.test.mjs — SoakRun (AUTO SOAK), in a VM with a fake G and a straight/curved road.
 *
 * Contract: idle until start(); the driver only ever writes G._testInput (never
 * physics state) and clears it when it ends; it brakes for a corner it has not
 * reached, steers toward the road, completes on time and starts/stops the recorder.
 *
 * Run: node --test tests/unit/soak-run.test.mjs   (npm run test:tooling-fast)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = readFileSync(join(ROOT, "js/perf/soak-run.js"), "utf8");

function rig({ curveAt = null, k = 0.02 } = {}) {
  const calls = { raf: [], cancel: 0, recStart: 0, recStop: 0, pauseClicks: 0, startRace: 0 };
  let now = 0;
  const G = {
    state: "menu", paused: false, seasonMode: true, timeTrial: true, duel: true,
    player: { s: 100, x: 0, head: 0, speed: 40 },
    track: { total: 5000 }, smp: { t: [0, 0, 1], hw: 7 },
    camMode: 0, raceLaps: 3, _testInput: null,
    wrapS: (s) => s % 5000,
    closeSettings() {},
    setCamMode(i) { G.camMode = i; },
    startRace() { calls.startRace++; G.state = "count"; return Promise.resolve(); },
    endWeatherSession() {},
  };
  const Tracks = {
    LIST: [{ id: "spa" }, { id: "monza" }],
    sample() {},
    curvature: (t, s) => (curveAt != null && s >= curveAt && s < curveAt + 80 ? k : 0),
  };
  const ctx = {
    Math, Promise, Object, Array, Number, performance: { now: () => now },
    requestAnimationFrame: (f) => { calls.raf.push(f); return calls.raf.length; },
    cancelAnimationFrame: () => { calls.cancel++; },
    document: { hidden: false, addEventListener(t, f) { calls.vis = f; }, removeEventListener() { calls.vis = null; }, getElementById: (id) => (id === "pausebtn" ? { click() { calls.pauseClicks++; } } : null) },
    Tracks, CamModes: { CAM_MODES: [{ id: "tv" }, { id: "chase" }] },
    Log: { info() {} },
    PhoneRecorder: { start() { calls.recStart++; ctx.PhoneRecorder._on = true; }, stop() { calls.recStop++; ctx.PhoneRecorder._on = false; }, isOn: () => !!ctx.PhoneRecorder._on },
  };
  calls.hide = () => { ctx.document.hidden = true; calls.vis(); };
  const SoakRun = vm.runInNewContext(SRC + "\n;SoakRun", ctx);
  SoakRun.create(G);
  const frame = (ms) => { now += ms; const f = calls.raf.pop(); if (f) f(now); };
  return { SoakRun, G, calls, frame, advance: (ms) => { now += ms; } };
}

test("idle until start(): no rAF, no input", () => {
  const { SoakRun, G, calls } = rig();
  assert.equal(SoakRun.active(), false);
  assert.equal(calls.raf.length, 0);
  assert.equal(G._testInput, null);
});

test("start sets a wet fixed-circuit race, picks the chase camera, then drives and records", async () => {
  const { SoakRun, G, calls, frame } = rig();
  assert.equal(await SoakRun.start({ minutes: 1 }), true);
  assert.equal(G.trackIdx, 1);
  assert.equal(G.raceWeather, "wet");
  assert.equal(G.seasonMode, false);
  assert.equal(G.timeTrial, false);
  assert.equal(G.duel, false);
  assert.equal(G.camMode, 1);
  assert.equal(calls.startRace, 1);
  frame(16);                                  // still counting down: no input, no recorder
  assert.equal(G._testInput, null);
  assert.equal(calls.recStart, 0);
  G.state = "race";
  frame(16);
  assert.equal(calls.recStart, 1);
  assert.ok(G._testInput && typeof G._testInput.steer === "number");
  assert.equal(SoakRun.status().state, "racing");
});

test("it finishes on time: clears _testInput, pauses, stops the recorder, and cancels its rAF", async () => {
  const { SoakRun, G, calls, frame, advance } = rig();
  await SoakRun.start({ minutes: 1 });
  G.state = "race"; frame(16);
  advance(61000); frame(16);
  assert.equal(SoakRun.active(), false);
  assert.equal(G._testInput, null);
  assert.equal(calls.recStop, 1);
  assert.equal(calls.pauseClicks, 1, "the game's own pause button parks the car under the menu");
  assert.equal(SoakRun.status().state, "done");
});

test("the player quitting ends the soak and hands the input back", async () => {
  const { SoakRun, G, frame } = rig();
  await SoakRun.start({ minutes: 5 });
  G.state = "race"; frame(16);
  G.state = "menu"; frame(16);
  assert.equal(SoakRun.active(), false);
  assert.equal(G._testInput, null);
  assert.equal(SoakRun.status().reason, "left-race");
});

test("a second start while active is refused", async () => {
  const { SoakRun } = rig();
  assert.equal(await SoakRun.start(), true);
  assert.equal(await SoakRun.start(), false);
});

test("the law brakes for a corner it has not reached and flat-outs a straight", () => {
  const straight = rig();
  straight.G.player.speed = 30;
  const a = straight.SoakRun.control(straight.G, { hold: 94, stalled: 0, lastS: null }, 1 / 60);
  assert.equal(a.throttle, true);
  assert.equal(a.brake, false);
  const corner = rig({ curveAt: 160, k: 0.05 });
  corner.G.player.speed = 80;
  const b = corner.SoakRun.control(corner.G, { hold: 94, stalled: 0, lastS: null }, 1 / 60);
  assert.equal(b.brake, true, "80 m/s into a 50 m radius corner 60 m ahead");
  assert.equal(b.throttle, false);
});

test("it steers back toward the road: right of centre steers one way, left the other", () => {
  const r = rig();
  r.G.player.x = 3;
  const right = r.SoakRun.control(r.G, { hold: 94, stalled: 0, lastS: null }, 1 / 60).steer;
  r.G.player.x = -3;
  const left = r.SoakRun.control(r.G, { hold: 94, stalled: 0, lastS: null }, 1 / 60).steer;
  assert.ok(right * left < 0, "opposite signs");
  assert.ok(Math.abs(right) <= 1 && Math.abs(left) <= 1);
});

test("a hidden page ends the soak and hands the input back; the listener is removed on finish", async () => {
  const { SoakRun, G, calls, frame } = rig();
  await SoakRun.start({ minutes: 5 });
  G.state = "race"; frame(16);
  assert.equal(typeof calls.vis, "function", "listening only while a soak is active");
  rigDocHidden(calls);
  assert.equal(SoakRun.active(), false);
  assert.equal(G._testInput, null);
  assert.equal(SoakRun.status().reason, "hidden");
  assert.equal(calls.vis, null);
});
function rigDocHidden(calls) { calls.hide(); }
