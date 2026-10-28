// BrakeCue math: pulse RATE is the signal; the function never returns a brake
// command. urgencyOf is pure so this file does not boot the game.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { absSrc } from "../helpers/abs-src.mjs";

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

test("condition cues default ON (#2177), an explicit false turns them off, and slider OFF performs no curvature reads or haptics", () => {
  const ctx = { window: {}, M4: { clamp: (v, a, b) => Math.max(a, Math.min(b, v)) }, performance: { now: () => 100 }, Tracks: { curvature() { throw new Error("OFF sampled track"); } }, Input: { rumble() { throw new Error("OFF rumbled"); }, vibrate() { throw new Error("OFF vibrated"); } } };
  vm.runInNewContext(src, ctx);
  const cue = ctx.BrakeCue.create({ paused: false, state: "race", player: { speed: 40 }, track: { total: 1000 } });
  assert.equal(cue.debug().conditionAware, true, "an unset key is the calibrated default");
  const store = (v) => ({ get: (k, d) => (k === "conditionCues" && v !== undefined ? v : d) });
  assert.equal(ctx.BrakeCue.create({ store: store(false) }).debug().conditionAware, false, "the checkbox turns it off");
  assert.equal(ctx.BrakeCue.create({ store: store(undefined) }).debug().conditionAware, true);
  cue.setConditionAware(true); cue.setLevel(1); cue.tick();
  assert.equal(cue.debug().urgency, 0);
});

// ── #2177: the condition-aware estimate (default ON) against the AI brakeTarget reference ──
// Calibration (monza/silverstone/spa, dry and rain on slicks): docs/notes/BRAKE-CUE-CALIBRATION-2026-10-27.md.
const settle = (player) => BrakeCue.conditionCapacity(player, { LAT_MAX: 22, BRAKE: 22, DOWNFORCE: 0.65 }, {}, 10);
const RAIN_SLICK = { _cueConditionGrip: 0.72, _cueCornering: 1, _cueBraking: 1 }, DRY = { _cueConditionGrip: 1, _cueCornering: 1, _cueBraking: 1 };

test("#2177 row 1: same corner, same speed — rain on slicks is MORE urgent than the dry", () => {
  const dry = settle(DRY), rain = settle(RAIN_SLICK);
  assert.ok(rain.lat < dry.lat && rain.brake < dry.brake, "the estimate only ever lowers grip");
  for (const [v, R, d] of [[50, 40, 70], [60, 90, 120], [45, 25, 50]]) {
    const uDry = BrakeCue.urgencyOf(v, 1 / R, d, 0, dry.lat, dry.brake, dry.df, 60.5);
    const uRain = BrakeCue.urgencyOf(v, 1 / R, d, 0, rain.lat, rain.brake, rain.df, 60.5);
    assert.ok(uRain > uDry, `v ${v} R ${R} d ${d}: rain ${uRain.toFixed(3)} > dry ${uDry.toFixed(3)}`);
  }
});

test("#2177 row 2: at top speed a corner the car takes flat on its aero load stays under URGENCY_GATE, dry and rain", () => {
  const vTop = 60.5, R = 150, d = 50;
  // Without the aero term the bare sqrt(lat·R) = 57 m/s calls a brake the car never needs (the old flat call).
  assert.ok(BrakeCue.urgencyOf(vTop, 1 / R, d, 0, 22, 22) >= BrakeCue.URGENCY_GATE, "bare estimate: a false call");
  for (const c of [settle(DRY), settle(RAIN_SLICK)])
    assert.ok(BrakeCue.urgencyOf(vTop, 1 / R, d, 0, c.lat, c.brake, c.df, vTop) < BrakeCue.URGENCY_GATE, `lat ${c.lat.toFixed(1)}: flat stays quiet`);
  // ...while a genuine braking zone still calls with the aero term in.
  const rain = settle(RAIN_SLICK);
  assert.ok(BrakeCue.urgencyOf(vTop, 1 / 40, d, 0, rain.lat, rain.brake, rain.df, vTop) >= BrakeCue.URGENCY_GATE);
});

test("#2177: aero corner speed is the bare sqrt(lat·R) at df 0 and the AI envelope otherwise", () => {
  for (const R of [20, 80, 300, 5000]) {
    assert.equal(BrakeCue.urgencyOf(50, 1 / R, 60, 0, 22, 22, 0, 60), BrakeCue.urgencyOf(50, 1 / R, 60, 0, 22, 22), "df 0 is bit-identical");
    assert.ok(BrakeCue.urgencyOf(50, 1 / R, 60, 0, 22, 22, 0.65, 60) <= BrakeCue.urgencyOf(50, 1 / R, 60, 0, 22, 22), "aero never adds urgency");
  }
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
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, "js/audio/driving-cues.js"), "utf8"), cx, { filename: absSrc("js/audio/driving-cues.js") });
  const DC = vm.runInNewContext("DrivingCues", cx);
  let checked = 0;
  for (const v of [0, 7, 8, 20, 45, 70]) for (const k of [0, 1 / 2000, 1 / 200, 1 / 40, 1 / 12, -1 / 40])
    for (const d of [0, 10, 60, 150]) for (const ax of [0, -10, 5]) for (const [lat, br] of [[22, 22], [11, 9]]) for (const [df, vt] of [[undefined, undefined], [0.65, 60.5]]) {
      assert.equal(DC.urgencyOf(v, k, d, ax, lat, br, df, vt), BrakeCue.urgencyOf(v, k, d, ax, lat, br, df, vt), `v=${v} k=${k} d=${d} ax=${ax} lat=${lat} brake=${br} df=${df}`);
      checked++;
    }
  assert.ok(checked > 500);
});

test("#2177: condition-aware, the wet lookahead keeps its seconds of warning (BRAKE/brake longer)", () => {
  const run = (grip) => {
    const r = cueRig({ vt: 72, speed: 60, cornerAt: 110 });
    Object.assign(r.G.player, { _cueConditionGrip: grip, _cueCornering: 1, _cueBraking: 1 });
    for (let i = 0; i < 120; i++) { r.cue.tick(); r.advance(1000 / 60); }   // settle the 0.6 s smoothing; the car is held at s 0
    return r.cue.debug();
  };
  const dry = run(1), wet = run(0.72);
  assert.equal(dry.urgency, 0, "dry, notch 6 looks 90 m: the corner at 110 m is not yet a call");
  assert.ok(wet.urgency >= 0.12, `rain on slicks looks ~125 m and calls it (urgency ${wet.urgency})`);
});
