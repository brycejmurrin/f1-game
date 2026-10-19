// BrakeCue math: pulse RATE is the signal; the function never returns a brake
// command. urgencyOf is pure so this file does not boot the game.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const src = fs.readFileSync(path.join(ROOT, "js/physics/brake-cue.js"), "utf8")
  .replace(/^const\b/gm, "var");
const ctx = {
  window: {},
  performance: { now: () => 0 },
  M4: { clamp: (v, a, b) => (v < a ? a : v > b ? b : v) },
};
vm.runInNewContext(src, ctx);
const { BrakeCue } = ctx;
assert.ok(BrakeCue && BrakeCue.urgencyOf, "BrakeCue IIFE must assign the global");

const LAT = 22, BRAKE = 22;

test("slider 1 is OFF; 6 is CUE with mid lookahead", () => {
  assert.equal(BrakeCue.fromSlider(1).on, false);
  assert.equal(BrakeCue.fromSlider(6).on, true);
  assert.ok(BrakeCue.fromSlider(6).lookSec > 1 && BrakeCue.fromSlider(6).lookSec < 2);
  assert.equal(BrakeCue.labelOf(1), "OFF");
  assert.match(BrakeCue.labelOf(6), /^CUE 6$/);
});

test("a corner you can already take is silent", () => {
  // 30 m/s into a 200 m radius (~66 m/s apex) — no brake needed.
  const u = BrakeCue.urgencyOf(30, 1 / 200, 80, 0, LAT, BRAKE);
  assert.equal(u, 0);
});

test("too fast for the apex raises urgency, and braking already done cuts it", () => {
  const k = 1 / 40;                 // 40 m radius, vCorner ≈ 29.7
  const coast = BrakeCue.urgencyOf(50, k, 60, 0, LAT, BRAKE);
  const braking = BrakeCue.urgencyOf(50, k, 60, -18, LAT, BRAKE);
  assert.ok(coast > 0.3, "flat-out into a slow corner must tick");
  assert.ok(braking < coast, "being on the anchors must quiet the cue");
});

test("urgency is never a brake command — output is 0..1 only", () => {
  const u = BrakeCue.urgencyOf(70, 0.04, 40, 0, LAT, BRAKE);
  assert.ok(u >= 0 && u <= 1);
});


test("condition estimate is conservative, smoothly monotone, and sensory-only", () => {
  const pc = { LAT_MAX: 22, BRAKE: 22 }, state = {}, player = { _cueConditionGrip: .5, _cueCornering: .9, _cueBraking: .8 };
  const before = JSON.stringify(player); let previous = { lat: 22, brake: 22 }, urgency = 0;
  for (let i = 0; i < 60; i++) {
    const c = BrakeCue.conditionCapacity(player, pc, state, 1 / 60);
    assert.ok(c.lat <= previous.lat && c.brake <= previous.brake);
    assert.ok(previous.lat - c.lat < .6 && previous.brake - c.brake < .6, "bounded smoothing per fixed tick");
    const u = BrakeCue.urgencyOf(40, .02, 75, 0, c.lat, c.brake);
    assert.ok(u >= urgency); urgency = u; previous = c;
  }
  assert.equal(JSON.stringify(player), before, "estimate never writes player state");
  const dry = BrakeCue.conditionCapacity({ _cueConditionGrip: 2, _cueCornering: 2, _cueBraking: 2 }, pc, {}, 1);
  assert.equal(dry.lat, 22); assert.equal(dry.brake, 22, "never promise extra grip");
});

test("condition cues default off and OFF performs no curvature reads or haptics", () => {
  const ctx = { window: {}, M4: { clamp: (v, a, b) => Math.max(a, Math.min(b, v)) }, performance: { now: () => 100 }, Tracks: { curvature() { throw new Error("OFF sampled track"); } }, Input: { rumble() { throw new Error("OFF rumbled"); }, vibrate() { throw new Error("OFF vibrated"); } } };
  vm.runInNewContext(src, ctx);
  const cue = ctx.BrakeCue.create({ paused: false, state: "race", player: { speed: 40 }, track: { total: 1000 } });
  assert.equal(cue.debug().conditionAware, false);
  cue.setConditionAware(true); cue.setLevel(1); cue.tick();
  assert.equal(cue.debug().urgency, 0);
});

// ── tick(): the ON path, with a stub track (P1-18) ──────────────────────────────────────────────
// A hairpin (k = 1/20) starts `cornerAt` metres ahead of s = 0; the straight before it is flat.
function cueRig({ vt, speed, cornerAt, level = 6 }) {
  let nowMs = 1000;
  const pulses = [], haptics = [];
  const cx = {
    window: { PhysicsConsts: { VMAX: 72, LAT_MAX: 22, BRAKE: 22 } },
    M4: { clamp: (v, a, b) => Math.max(a, Math.min(b, v)) },
    performance: { now: () => nowMs },
    Tracks: { curvature: (track, s) => (s >= cornerAt ? 1 / 20 : 0) },
    GameAudio: { brakeCue: (u) => pulses.push({ t: nowMs, u }) },
    Input: { vibrate: (ms) => haptics.push(["vibrate", ms]), rumble: (m, d) => haptics.push(["rumble", m, d]) },
  };
  vm.runInNewContext(src, cx);
  const G = { paused: false, state: "race", soundOn: true, store: null, track: { total: 5000 }, vTop: () => vt,
    player: { speed, s: 0, axEstSm: 0 } };
  const cue = cx.BrakeCue.create(G);
  cue.setLevel(level);
  return { cue, G, pulses, haptics, advance: (ms) => { nowMs += ms; } };
}

test("tick ON: the look-ahead is bounded by the stopping distance, which rides the pace scale", () => {
  // 100 m/s * 1.5 s = 150 m wants to look, but at pace 1 the ceiling is vTop²/2·brake = 117.8 m: a hairpin at 130 m is not yet seen.
  const slow = cueRig({ vt: 72, speed: 100, cornerAt: 130 });
  slow.cue.tick();
  assert.equal(slow.cue.debug().urgency, 0, "pace 1: the corner is beyond the capped look-ahead");
  assert.equal(slow.pulses.length, 0);
  // At pace 2 the same corner is inside the (4x) ceiling.
  const fast = cueRig({ vt: 144, speed: 100, cornerAt: 130 });
  fast.cue.tick();
  assert.ok(fast.cue.debug().urgency > 0.5, "pace 2: the corner is seen, urgency " + fast.cue.debug().urgency);
  assert.equal(fast.pulses.length, 1, "and the first pulse fires on the first tick");
});

test("tick ON: pulse period shrinks as urgency rises, and each pulse drives sound and both haptics", () => {
  const run = (cornerAt) => {
    const r = cueRig({ vt: 72, speed: 60, cornerAt });
    for (let i = 0; i < 120; i++) { r.cue.tick(); r.advance(1000 / 60); }   // two seconds
    return r;
  };
  const near = run(60), far = run(85);
  assert.ok(near.pulses.length >= 2 && far.pulses.length >= 2, `near ${near.pulses.length}, far ${far.pulses.length}`);
  const gap = (r) => (r.pulses.at(-1).t - r.pulses[0].t) / (r.pulses.length - 1) / 1000;
  assert.ok(gap(near) < gap(far), `the nearer corner pulses faster (${gap(near).toFixed(3)} s vs ${gap(far).toFixed(3)} s)`);
  assert.ok(gap(near) >= 0.09 - 0.02 && gap(far) <= 0.55 + 0.02, "periods stay inside PERIOD_HI..PERIOD_LO");
  const kinds = new Set(near.haptics.map((h) => h[0]));
  assert.ok(kinds.has("vibrate") && kinds.has("rumble"), "both haptic channels pulse with the sound");
  assert.equal(near.haptics.filter((h) => h[0] === "rumble").length, near.pulses.length, "one rumble per pulse");
});

test("tick ON: paused, off-race and finished cars are silent", () => {
  for (const mutate of [(G) => { G.paused = true; }, (G) => { G.state = "menu"; }, (G) => { G.player.finished = true; }]) {
    const r = cueRig({ vt: 72, speed: 60, cornerAt: 60 });
    mutate(r.G);
    r.cue.tick();
    assert.equal(r.pulses.length, 0);
  }
});

test("BrakeCue.urgencyOf and DrivingCues.urgencyOf are the same function of their inputs", () => {
  const cx = { window: {}, M4: { clamp: (v, a, b) => Math.max(a, Math.min(b, v)) }, performance: { now: () => 0 } };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, "js/audio/driving-cues.js"), "utf8"), cx);
  const DC = vm.runInNewContext("DrivingCues", cx);
  let checked = 0;
  for (const v of [0, 7, 8, 20, 45, 70]) for (const k of [0, 1 / 2000, 1 / 200, 1 / 40, 1 / 12, -1 / 40])
    for (const d of [0, 10, 60, 150]) for (const ax of [0, -10, 5]) for (const [lat, br] of [[22, 22], [11, 9]]) {
      assert.equal(DC.urgencyOf(v, k, d, ax, lat, br), BrakeCue.urgencyOf(v, k, d, ax, lat, br), `v=${v} k=${k} d=${d} ax=${ax} lat=${lat} brake=${br}`);
      checked++;
    }
  assert.ok(checked > 500);
});
