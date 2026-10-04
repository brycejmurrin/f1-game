/* driving-cues.test.mjs — assist-gated audio driving cues (plan slice 3).
 * Fail-before: OFF path must not read curvature; left k → L; no announce.
 * Run: node --test tests/unit/driving-cues.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = fs.readFileSync(path.join(ROOT, "js/audio/driving-cues.js"), "utf8");

function load() {
  const curvatureCalls = [];
  const ctx = {
    Log: { info() {}, warn() {}, debug() {}, enabled() { return false; } },
    M4: { clamp: (v, a, b) => (v < a ? a : v > b ? b : v) },
    PhysicsConsts: { FIXED_DT: 1 / 60, LAT_MAX: 22, BRAKE: 22, VMAX: 72 },
    Tracks: {
      curvature(track, s) {
        curvatureCalls.push(s);
        // +k = LEFT. A left-hander peaks near s=40 on a 200 m lap.
        const L = track.total || 200;
        const u = ((s % L) + L) % L;
        if (u > 30 && u < 55) return 0.04;
        if (u > 120 && u < 145) return -0.035;
        return 0.001;
      },
    },
    BrakeCue: { on: () => false, debug: () => ({ urgency: 0 }) },
    GameAudio: {
      driveBrakeTone() { ctx._brakeN = (ctx._brakeN || 0) + 1; },
      cornerCall(side) { ctx._calls = (ctx._calls || []).concat([side]); },
    },
    performance: { now: () => ctx._t },
    document: undefined,
    window: {},
    _t: 0,
    _brakeN: 0,
    _calls: [],
    curvatureCalls,
  };
  vm.runInNewContext(SRC.replace(/^const\b/gm, "var"), ctx);
  return ctx;
}

test("slider 1 is OFF; mid notches are on", () => {
  const { DrivingCues } = load();
  assert.equal(DrivingCues.fromSlider(1).on, false);
  assert.equal(DrivingCues.fromSlider(7).on, true);
  assert.equal(DrivingCues.labelOf(1), "OFF");
  assert.match(DrivingCues.labelOf(7), /^CUES 7$/);
});

test("OFF path performs zero curvature reads over N ticks", () => {
  const ctx = load();
  const G = {
    paused: false, state: "race", soundOn: true,
    player: { s: 10, speed: 50, axEstSm: 0, finished: false, retired: false },
    track: { total: 200 },
    vTop: () => 72,
  };
  ctx.DrivingCues.create(G);
  ctx.DrivingCues.setLevel(1);
  for (let i = 0; i < 30; i++) { ctx._t = i * 16; ctx.DrivingCues.tick(); }
  assert.equal(ctx.curvatureCalls.length, 0, "OFF must not touch Tracks.curvature");
  assert.equal(ctx._brakeN, 0);
  assert.equal(ctx._calls.length, 0);
});

test("left-hand curvature ahead yields L corner call; urgency rises into a corner", () => {
  const ctx = load();
  const G = {
    paused: false, state: "race", soundOn: true,
    player: { s: 5, speed: 55, axEstSm: 0, finished: false, retired: false },
    track: { total: 200 },
    vTop: () => 72,
  };
  ctx.DrivingCues.create(G);
  ctx.DrivingCues.setLevel(7);
  for (let i = 0; i < 20; i++) { ctx._t = i * 50; ctx.DrivingCues.tick(); }
  assert.ok(ctx.curvatureCalls.length > 0, "ON must sample curvature");
  assert.ok(ctx._calls.indexOf("L") >= 0, "left peak ahead must call L, got " + JSON.stringify(ctx._calls));
  const dbg = ctx.DrivingCues.debug();
  assert.ok(dbg.urgency > 0.1, "flat-out into a slow left must raise urgency, got " + dbg.urgency);
});

test("source never calls announce or raceRadio", () => {
  // Ban call sites and identifiers — comments may name the forbidden APIs.
  assert.equal(/\bannounce\s*\(/.test(SRC), false);
  assert.equal(/\braceRadio\s*\./.test(SRC), false);
  assert.equal(/\bG\.announce\s*\(/.test(SRC), false);
});

test("urgency is 0..1 only — never a brake command", () => {
  const { DrivingCues } = load();
  const u = DrivingCues.urgencyOf(70, 0.04, 40, 0, 22, 22);
  assert.ok(u >= 0 && u <= 1);
});

test("cornerSide maps +k to LEFT and -k to RIGHT", () => {
  const ctx = load();
  const track = { total: 200 };
  // From s=5, look covers the +k peak at 30..55.
  assert.equal(ctx.DrivingCues.cornerSide(track, 5, 60, 8), 1);
  // From s=100, look covers the -k peak at 120..145.
  assert.equal(ctx.DrivingCues.cornerSide(track, 100, 60, 8), -1);
});

test("one call per turn: a long sweeper is called ONCE, and the next turn on the same side is called again", () => {
  // Was: lastCallS = the car's position, so any turn still inside the lookahead
  // re-fired every CALL_COOLDOWN_M — a 400 m sweeper said "L" six times. A
  // same-side call now needs straight road since the last one.
  const ctx = load();
  ctx.Tracks.curvature = (track, s) => {
    const u = ((s % track.total) + track.total) % track.total;
    if (u > 500 && u < 900) return 0.02;    // a 400 m left sweeper
    if (u > 1400 && u < 1500) return 0.03;  // straight between, then another left
    return 0;
  };
  const G = {
    paused: false, state: "race", soundOn: true,
    player: { s: 300, speed: 60, axEstSm: 0, finished: false, retired: false },
    track: { total: 2000 },
    vTop: () => 72,
  };
  ctx.DrivingCues.create(G);
  ctx.DrivingCues.setLevel(7);
  for (let i = 0; i < 1300; i++) { ctx._t = i * 1000 / 60; G.player.s = 300 + i; ctx.DrivingCues.tick(); }
  assert.deepEqual(ctx._calls, ["L", "L"], "the sweeper once, the later left once");
});

test("the call memory resets when the cues stand down (a new race starts clean)", () => {
  const ctx = load();
  ctx.Tracks.curvature = (track, s) => (s > 500 && s < 900 ? 0.02 : 0);
  const G = {
    paused: false, state: "race", soundOn: true,
    player: { s: 300, speed: 60, axEstSm: 0, finished: false, retired: false },
    track: { total: 2000 },
    vTop: () => 72,
  };
  ctx.DrivingCues.create(G);
  ctx.DrivingCues.setLevel(7);
  for (let i = 0; i < 400; i++) { ctx._t = i * 1000 / 60; G.player.s = 300 + i; ctx.DrivingCues.tick(); }
  assert.equal(ctx._calls.length, 1);
  G.state = "results"; ctx.DrivingCues.tick();          // the race ends
  G.state = "race"; G.player.s = 300;                    // the next one, same corner ahead
  for (let i = 0; i < 400; i++) { ctx._t = 10000 + i * 1000 / 60; G.player.s = 300 + i; ctx.DrivingCues.tick(); }
  assert.equal(ctx._calls.length, 2, "the first call of the next race is not suppressed");
});
