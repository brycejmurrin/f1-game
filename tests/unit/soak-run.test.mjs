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
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = readFileSync(join(ROOT, "js/perf/soak-run.js"), "utf8");

function rig({ curveAt = null, k = 0.02, realRecorder = false, rafId } = {}) {
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
    requestAnimationFrame: (f) => { calls.raf.push(f); return rafId ?? calls.raf.length; },
    cancelAnimationFrame: () => { calls.cancel++; },
    document: { hidden: false, addEventListener(t, f) { calls.vis = f; }, removeEventListener() { calls.vis = null; }, getElementById: (id) => (id === "pausebtn" ? { click() { calls.pauseClicks++; } } : null) },
    window: { addEventListener(t, f) { (calls.win ||= {})[t] = f; }, removeEventListener(t) { if (calls.win) delete calls.win[t]; } },
    Tracks, CamModes: { CAM_MODES: [{ id: "tv" }, { id: "chase" }] },
    Log: { info() {} }, M4: { clamp: (v, lo, hi) => Math.max(lo, Math.min(hi, v)) },   // the shared clamp soak-run.js calls
    PhoneRecorder: { start() { calls.recStart++; ctx.PhoneRecorder._on = true; return true; }, stop() { calls.recStop++; ctx.PhoneRecorder._on = false; }, isOn: () => !!ctx.PhoneRecorder._on },
  };
  if (realRecorder) {
    const src = readFileSync(join(ROOT, "js/perf/phone-recorder.js"), "utf8");
    ctx.PhoneRecorder = vm.runInNewContext(src + "\n;PhoneRecorder", { performance: ctx.performance }, { filename: absSrc("js/perf/phone-recorder.js") });
  }
  calls.hide = () => { ctx.document.hidden = true; calls.vis(); };
  const SoakRun = vm.runInNewContext(SRC + "\n;SoakRun", ctx);
  SoakRun.create(G);
  const frame = (ms) => { now += ms; const f = calls.raf.pop(); if (f) f(now); };
  return { SoakRun, G, calls, frame, recorder: ctx.PhoneRecorder, advance: (ms) => { now += ms; } };
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

for (const late of ["resolve", "reject"]) {
  test(`a stopped soak's late ${late} leaves the replacement driving loop alone`, async () => {
    const { SoakRun, G, calls, frame } = rig();
    const first = Promise.withResolvers();
    G.startRace = () => first.promise;
    const oldStart = SoakRun.start();
    SoakRun.stop();
    G.startRace = () => Promise.resolve();
    await SoakRun.start({ cam: "tv" });
    first[late]();
    assert.equal(await oldStart, false);
    assert.equal(SoakRun.active(), true);
    assert.equal(G.camMode, 0, "the replacement's camera stays selected");
    assert.equal(calls.raf.length, 1, "one driver loop");
    G.state = "race";
    frame(16);
    assert.equal(calls.recStart, 1);
    assert.ok(G._testInput);
  });
}

test("an unsuccessful race entry releases the pending soak without touching the game", async () => {
  for (const startRace of [
    () => { throw new Error("race setup failed"); },
    () => Promise.reject(new Error("race load failed")),
    () => Object.assign(Promise.resolve(), { outcome: Promise.resolve({ kind: "canceled" }) }),
    () => Object.assign(Promise.resolve(false), { outcome: Promise.resolve({ kind: "failed" }) }),
  ]) {
    const { SoakRun, G, calls } = rig();
    G.startRace = startRace;
    assert.equal(await SoakRun.start(), false);
    assert.equal(SoakRun.active(), false);
    assert.equal(calls.vis, null);
    assert.equal(calls.raf.length, 0);
    assert.equal(G.camMode, 0);
    assert.equal(calls.pauseClicks, 0);
  }
});

test("finishing an auto soak preserves an earlier or replacement manual recording", async () => {
  for (const preexisting of [true, false]) {
    const { SoakRun, G, frame, recorder } = rig({ realRecorder: true });
    if (preexisting) assert.equal(recorder.start(), true);
    await SoakRun.start();
    G.state = "race";
    frame(16);
    assert.equal(recorder.isOn(), true);
    if (!preexisting) {
      assert.equal(recorder.stop(), true, "SHARE ends the soak recording");
      assert.equal(recorder.start(), true, "a fresh recording begins during the drive");
    }
    SoakRun.stop();
    assert.equal(recorder.isOn(), true, "the manual recording stays live");
    assert.equal(recorder.stop(), true);
  }
});

test("a zero animation-frame ID still releases input and cancels the scheduled frame", async () => {
  const { SoakRun, G, calls, frame } = rig({ rafId: 0 });
  await SoakRun.start();
  G.state = "race";
  frame(16);
  assert.ok(G._testInput);
  SoakRun.stop();
  assert.equal(G._testInput, null);
  assert.equal(calls.cancel, 1);
});

test("the law brakes for a corner it has not reached and flat-outs a straight", () => {
  const straight = rig();
  straight.G.raceWeather = "wet";
  straight.G.player.speed = 30;
  const a = straight.SoakRun.control(straight.G, { hold: 94, stalled: 0, lastS: null }, 1 / 60);
  assert.equal(a.throttle, true);
  assert.equal(a.brake, false);
  const corner = rig({ curveAt: 160, k: 0.05 });
  corner.G.raceWeather = "wet";
  corner.G.player.speed = 80;
  const b = corner.SoakRun.control(corner.G, { hold: 94, stalled: 0, lastS: null }, 1 / 60);
  assert.equal(b.brake, true, "80 m/s into a 50 m radius corner 60 m ahead");
  assert.equal(b.throttle, false);
});

test("dry weather uses the dry envelope: same corner allows a higher target than wet", () => {
  // k=0.02 → wet vCorner=√(9/0.02)≈21.2, dry √(13/0.02)≈25.5; hold starts at 20 so both climb toward vT.
  const wet = rig({ curveAt: 100, k: 0.02 });
  wet.G.raceWeather = "wet";
  wet.G.player.speed = 20;
  const wetIn = wet.SoakRun.control(wet.G, { hold: 20, stalled: 0, lastS: null }, 1 / 60);
  const dry = rig({ curveAt: 100, k: 0.02 });
  dry.G.raceWeather = "dry";
  dry.G.player.speed = 20;
  const dryIn = dry.SoakRun.control(dry.G, { hold: 20, stalled: 0, lastS: null }, 1 / 60);
  // At 20 m/s both still throttle; raise speed into the wet gap between envelopes.
  wet.G.player.speed = 23;
  const wetFast = wet.SoakRun.control(wet.G, { hold: 23, stalled: 0, lastS: null }, 1 / 60);
  dry.G.player.speed = 23;
  const dryFast = dry.SoakRun.control(dry.G, { hold: 23, stalled: 0, lastS: null }, 1 / 60);
  assert.equal(wetFast.brake, true, "23 m/s is over the wet corner target");
  assert.equal(dryFast.brake, false, "23 m/s is still under the dry corner target");
  assert.equal(wetIn.throttle, true);
  assert.equal(dryIn.throttle, true);
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

// DRIVE (the phone bridge's `drive`, #6397): agent control through the same seam, released by every way out.
async function driving(opts = { seconds: 60 }) {
  const r = rig();
  r.G.state = "race";
  const p = r.SoakRun.drive(opts);
  r.frame(16);
  assert.equal(r.SoakRun.driving(), true);
  assert.ok(r.G._testInput && typeof r.G._testInput.steer === "number", "the driver writes the input seam");
  return { ...r, p };
}

test("drive: idle until asked — no listener, no rAF, no input; refused in a menu or while a soak runs", async () => {
  const r = rig();
  assert.equal(r.SoakRun.driving(), false);
  assert.equal(r.calls.win, undefined, "no input listener while idle");
  await assert.rejects(r.SoakRun.drive({ seconds: 5 }), /running session/);
  await r.SoakRun.start({ minutes: 5 });
  r.G.state = "race";
  await assert.rejects(r.SoakRun.drive({ seconds: 5 }), /soak is running/);
  assert.equal(r.SoakRun.POLICY_NAMES.join(","), "autopilot,box");
  assert.equal(r.SoakRun.policy("nope"), null, "an unknown name is no policy");
});

test("drive: a REAL touch or key takes the car back; the bridge's own synthetic taps do not", async () => {
  const { SoakRun, G, calls, p } = await driving();
  calls.win.pointerdown({ isTrusted: false });
  assert.equal(SoakRun.driving(), true, "a synthetic (bridge) tap leaves the drive running");
  calls.win.pointerdown({ isTrusted: true });
  assert.equal(SoakRun.driving(), false);
  assert.equal(G._testInput, null, "the real Input owns the car again");
  assert.equal((await p).reason, "touch");
  assert.deepEqual(Object.keys(calls.win), [], "the listeners are removed");
});

test("drive: stop, a pause, a quit and a hidden page each release the input", async () => {
  let r = await driving();
  assert.equal(r.SoakRun.driveStop("bridge").reason, "bridge");
  assert.equal(r.G._testInput, null);
  r = await driving(); r.G.paused = true; r.frame(16);
  assert.equal((await r.p).reason, "paused"); assert.equal(r.G._testInput, null);
  r = await driving(); r.G.state = "menu"; r.frame(16);
  assert.equal((await r.p).reason, "state:menu"); assert.equal(r.G._testInput, null);
  r = await driving(); r.calls.hide();
  assert.equal((await r.p).reason, "hidden"); assert.equal(r.G._testInput, null);
  assert.equal(r.SoakRun.driveStatus().active, false);
  assert.equal(r.SoakRun.driveStatus().last.reason, "hidden");
});

test("drive: `seconds` ends as its own success and `laps` on the lap count", async () => {
  let r = await driving({ seconds: 1 });
  r.frame(1200);
  assert.equal((await r.p).reason, "seconds");
  r = await driving({ laps: 1 });
  r.G.player.lap = 1; r.frame(16);
  assert.equal((await r.p).reason, "laps");
  assert.equal(r.G._testInput, null);
});

test("drive: a policy that throws ends the drive at once and hands the input back (no steering on after a fault)", async () => {
  const r = await driving();
  r.G.player = { get s() { throw new Error("car gone"); }, x: 0, head: 0, speed: 40 };
  r.frame(16);
  assert.equal(r.SoakRun.driving(), false);
  assert.equal(r.G._testInput, null);
  assert.equal((await r.p).reason, "error: car gone");
});
