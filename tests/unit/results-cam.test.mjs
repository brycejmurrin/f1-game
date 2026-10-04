/* results-cam.test.mjs — chequered / orbit / highlights (js/camera/results-cam.js).
 * Run: node --test tests/unit/results-cam.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const src = (p) => fs.readFileSync(path.join(ROOT, p), "utf8").replace(/^const\b/gm, "var");

function boot() {
  const sb = {
    Math, console, Object, Array, Number, String, JSON, Float32Array, Float64Array, Uint8Array,
    isFinite, parseFloat, parseInt,
    Log: { info() {}, debug() {}, warn() {}, enabled() { return false; } },
    PerfGov: { tier: () => 0 },
  };
  sb.window = sb;
  const ctx = vm.createContext(sb);
  vm.runInContext(src("js/camera/results-cam.js"), ctx, { filename: "results-cam.js" });
  vm.runInContext(src("js/camera/replay-buf.js"), ctx);
  vm.runInContext(src("js/core/mat4.js"), ctx);
  const R = vm.runInContext("ResultsCam", ctx);
  return { ...R, ReplayBuf: vm.runInContext("ReplayBuf", ctx), M4: vm.runInContext("M4", ctx) };
}

test("orbitPose is finite and highlightsReel respects budget + order", () => {
  const R = boot();
  const pose = R.orbitPose(10, 1, -5, Math.PI / 4);
  assert.ok(pose.eye.every(Number.isFinite));
  assert.ok(pose.target.every(Number.isFinite));

  const tags = [
    { kind: "contact", t: 1, car: 0 },
    { kind: "retirement", t: 8, car: 2 },
    { kind: "chequered", t: 19, car: 0 },
  ];
  const reel = R.highlightsReel(tags, 0, 20, 12);
  assert.ok(reel.length >= 2);
  let span = 0;
  for (const c of reel) {
    assert.ok(c.t1 > c.t0);
    span += c.t1 - c.t0;
  }
  assert.ok(span <= 12 + 1e-6);
  assert.ok(reel[0].t0 <= reel[reel.length - 1].t0);
});

test("create: chequered → orbit; disabled on mobile / high PerfGov tier", () => {
  const R = boot();
  const player = { s: 0, x: 0, px: 1, py: 1, pz: 2, head: 0, speed: 40, finPos: 1 };
  const G = {
    player, cars: [player], dbgCam: null, netPlay: { active: () => false },
    gfx: { isMobile: false },
    camVantage: () => ({ eye: [0, 4, -10], target: [0, 1, 0], fov: 58 }),
  };
  const api = R.create(G);
  assert.equal(api.onFlag(), true);
  assert.equal(api.live(), true);
  assert.equal(api.status().phase, "chequered");
  assert.ok(G.dbgCam && G.dbgCam._resultsCam);

  // Advance past CHEQ_S
  for (let i = 0; i < 80; i++) api.tick(1 / 30);
  assert.equal(api.status().phase, "orbit");
  assert.ok(api.live());

  // Mobile off
  G.gfx.isMobile = true;
  api.reset();
  assert.equal(api.onFlag(), false);
  assert.equal(api.live(), false);
});

test("game.js gates results early-return on ResultsCam.live()", () => {
  const game = fs.readFileSync(path.join(ROOT, "js/game.js"), "utf8");
  assert.match(game, /ResultsCam\.create\(G[,)]/);
  assert.match(game, /state === "results" && !resultsCam\.live\(\)/);
  assert.match(game, /resultsCam\.onFlag\(/);
});

function recordedFinish() {
  const R = boot();
  const car = { s: 1, x: 2, head: .3, speed: 20, px: 10, py: 1, pz: 30, steer: .2, yawVis: .4, finPos: 1 };
  const G = { player: car, cars: [car], raceT: 0, gfx: {}, netPlay: { active: () => false },
    camVantage: () => ({ eye: [0, 4, -10], target: [0, 1, 0], fov: 58 }) };
  const replay = R.ReplayBuf.create(G);
  for (let i = 0; i < 4; i++) { G.raceT = i; car.px = 10 + i; replay.sample(i, G.cars); }
  Object.assign(car, { s: 100, px: 200, pz: 300, head: 1, yawVis: 2,
    rPrevS: 99, rPrevX: 0, rPrevPx: 190, rPrevPz: 290, rPrevHead: .9, rPrevYawVis: undefined });
  const finish = { ...car };
  const camera = R.create(G); camera.attachReplay(replay); camera.onFlag();
  return { R, G, car, finish, replay, camera };
}

test("chequered and orbit cameras produce finite renderer projection matrices", () => {
  const { R, G, camera } = recordedFinish();
  for (const orbit of [false, true]) {
    if (orbit) camera.startOrbit();
    const m = new Float32Array(16);
    R.M4.perspectiveTo(m, G.dbgCam.fov * Math.PI / 180, 1.6, .1, G.dbgCam.far);
    assert.ok(m.every(Number.isFinite), "results camera must produce a usable projection");
  }
});

test("montage poses render consistently at every interpolation fraction and restore the finish", () => {
  const { car, finish, replay, camera } = recordedFinish();
  assert.equal(camera.startHighlights(), true);
  const pose = replay.at(replay.window().t0).cars[0];
  for (const alpha of [0, .5, 1]) {
    for (const [current, previous] of [["s", "rPrevS"], ["px", "rPrevPx"], ["pz", "rPrevPz"], ["yawVis", "rPrevYawVis"]]) {
      assert.equal(car[previous] + (car[current] - car[previous]) * alpha, pose[current], `${current} at alpha=${alpha}`);
    }
  }
  for (let i = 0; i < 150; i++) camera.tick(1 / 30);
  assert.equal(camera.status().phase, "orbit");
  assert.deepEqual(car, finish, "montage completion restores exact finish pose and property presence");
  assert.equal(replay.isScrubbing(), false);
  assert.equal(camera.startHighlights(), true);
  camera.reset();
  assert.deepEqual(car, finish, "cancel/restart restores exact finish pose");
  assert.equal(replay.isScrubbing(), false);
  assert.equal(camera.startHighlights(), false, "idle results cannot acquire the next session's replay");
});

test("a retained highlights control cannot acquire an online session", () => {
  const { G, car, finish, replay, camera } = recordedFinish();
  G.netPlay.active = () => true;
  assert.equal(camera.startHighlights(), false);
  assert.equal(camera.startOrbit(), false);
  assert.deepEqual(car, finish);
  assert.equal(replay.isScrubbing(), false);
});


test("losing results eligibility during a montage restores the finish and releases replay", () => {
  const { R, G, car, finish, replay } = recordedFinish();
  let allowed = true;
  const camera = R.create(G, () => allowed); camera.attachReplay(replay); camera.onFlag();
  assert.equal(camera.startHighlights(), true);
  assert.equal(replay.isScrubbing(), true);
  allowed = false;
  assert.equal(camera.tick(1 / 30), false);
  assert.equal(camera.live(), false);
  assert.equal(replay.isScrubbing(), false);
  assert.deepEqual(car, finish);
});
