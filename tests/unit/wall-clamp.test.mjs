/* wall-clamp.test.mjs — js/physics/wall-clamp.js, the barrier / pit / gantry
 * hard clamp carve (carve-headroom Slice B, 2026-09-30).
 * Pins what characterization cannot see alone:
 *
 *   - MODULE SURFACE. apply(c, ctx) exists; missing the extract leaves game.js
 *     calling an undefined WallClamp (this test fails first).
 *   - RIGHT-WALL CLAMP. A car past wallR is pinned to wallR and wasOnWall set.
 *   - HUMAN WRITEBACK. When xPinned, px/pz are rebuilt from (s, x) via
 *     worldFromTrack — the sacred conditional inverse of trackFrom.
 *   - OFF-WALL DECAY. Inside the limits, human wallT decays by dt.
 *   - isPlayer FX GATE. Street shake/SFX/vibrate/rumble fire only for the
 *     local player — a VS FRIEND is c.human too (setCarRole), so gating on
 *     human alone shakes the wrong screen (ship fix ad915f8ea).
 *
 * Run: node --test tests/unit/wall-clamp.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { seedLog } from "../helpers/seed-log.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DT = 1 / 60;

function load(hooks = {}) {
  const ctx = vm.createContext({
    Math, JSON, Object, Array, Number, isNaN, isFinite, console,
  });
  ctx.window = ctx;
  seedLog(ctx);
  ctx.DebrisWorld = {
    active: () => false,
    wallImpact: () => {},
    promoteBarrier: () => {},
  };
  ctx.AiDrive = {
    wallHitLoss: () => 0.14,
    wallSteerScrub: () => 8,
    wallAiScrub: () => 4,
  };
  ctx.TrackPit = { EXIT_WALL_W: 0.35 };
  ctx.GameAudio = { collision: hooks.onCollision || (() => {}) };
  ctx.Input = {
    vibrate: hooks.onVibrate || (() => {}),
    rumble: hooks.onRumble || (() => {}),
  };
  // Minimal Tracks: constant walls at ±5 m, sample fills a tangent/right frame.
  ctx.Tracks = {
    wallAt(_track, _s, side) { return 5; },
    sample(_track, _s, smp) {
      smp.t[0] = 0; smp.t[1] = 0; smp.t[2] = 1;
      smp.r[0] = 1; smp.r[1] = 0; smp.r[2] = 0;
    },
    postLimits() {},
  };
  for (const f of ["js/core/mat4.js", "js/physics/wall-clamp.js"]) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx, { filename: f });
  }
  return {
    ctx,
    WallClamp: vm.runInContext("WallClamp", ctx),
  };
}

function baseCtx(over = {}) {
  const smp = { t: [0, 0, 1], r: [1, 0, 0] };
  const postLim = { r: 99, l: 99, minOut: 0, side: 0 };
  return {
    track: { total: 1000, n: 100, hw: new Float64Array(100).fill(5), pit: null, posts: null, street: false },
    dt: DT,
    steer: 0,
    postLim,
    smp,
    wrapS: (s) => ((s % 1000) + 1000) % 1000,
    worldFromTrack: (s, x) => ({ x: s * 0.01 + x, z: s }),
    soundOn: false,
    incidentSim: { notifyWall: () => {} },
    addShake: () => {},
    ...over,
  };
}

test("WallClamp.apply is the exported surface", () => {
  const { WallClamp } = load();
  assert.equal(typeof WallClamp, "object");
  assert.equal(typeof WallClamp.apply, "function");
  assert.ok(Object.isFrozen(WallClamp), "frozen");
});

test("car past wallR is pinned and wasOnWall set", () => {
  const { WallClamp } = load();
  const c = {
    s: 10, x: 7.5, human: false, isPlayer: false, speed: 40,
    vLat: 0, head: 0, wasOnWall: false, wallT: 0, wallHits: 0, collideT: 0,
  };
  WallClamp.apply(c, baseCtx());
  assert.equal(c.x, 5, "clamped to wallR");
  assert.equal(c.wasOnWall, true);
  assert.ok(c.speed < 40, "AI scrub bleeds speed");
});

test("human xPinned rebuilds px/pz via worldFromTrack", () => {
  const { WallClamp } = load();
  const c = {
    s: 100, x: 8, human: true, isPlayer: true, speed: 30,
    vLat: 1.2, head: 0.1, wasOnWall: false, wallT: 0, wallHits: 0, collideT: 0,
    px: 0, pz: 0,
  };
  WallClamp.apply(c, baseCtx());
  assert.equal(c.x, 5);
  assert.equal(c.vLat, 0, "slip killed against barrier");
  assert.equal(c.wasOnWall, true);
  // worldFromTrack(s, x) = { x: s*0.01 + x, z: s }
  assert.ok(Math.abs(c.px - (100 * 0.01 + 5)) < 1e-9, `px=${c.px}`);
  assert.equal(c.pz, 100);
});

test("inside limits: human wallT decays, wasOnWall clears", () => {
  const { WallClamp } = load();
  const c = {
    s: 10, x: 0, human: true, isPlayer: true, speed: 40,
    vLat: 0, head: 0, wasOnWall: true, wallT: 0.2, wallHits: 0, collideT: 0,
    px: 1, pz: 10,
  };
  const ctx = baseCtx();
  WallClamp.apply(c, ctx);
  assert.equal(c.wasOnWall, false);
  assert.ok(Math.abs(c.wallT - (0.2 - DT)) < 1e-9, `wallT=${c.wallT}`);
  // Not pinned: sample fills smp for yawVis; px/pz left alone.
  assert.equal(c.px, 1);
  assert.equal(c.pz, 10);
  assert.equal(ctx.smp.t[2], 1);
});

test("street wall FX gates on isPlayer (VS FRIEND is human, not local)", () => {
  // Ship fix ad915f8ea: a remote friend's scrape must not shake/vibrate THIS screen.
  const shakes = [];
  const vibes = [];
  const rumbles = [];
  let audioHits = 0;
  const { WallClamp } = load({
    onCollision: () => { audioHits++; },
    onVibrate: (n) => vibes.push(n),
    onRumble: (a, b) => rumbles.push([a, b]),
  });
  const street = {
    track: { total: 1000, n: 100, hw: new Float64Array(100).fill(5), pit: null, posts: null, street: true },
    soundOn: true,
    addShake: (d) => shakes.push(d),
  };
  // Nose into the +x wall: head negative relative to tangent (rel < 0 → noseIn).
  const friend = {
    s: 10, x: 8, human: true, isPlayer: false, speed: 40,
    vLat: 0, head: -0.4, wasOnWall: false, wallT: 0, wallHits: 0, collideT: 0,
    px: 0, pz: 0,
  };
  WallClamp.apply(friend, baseCtx(street));
  assert.equal(friend.wasOnWall, true);
  assert.equal(shakes.length, 0, "remote friend must not shake local camera");
  assert.equal(vibes.length, 0, "remote friend must not vibrate local device");
  assert.equal(rumbles.length, 0, "remote friend must not rumble local pad");
  assert.equal(audioHits, 0, "remote friend must not play local collision SFX");

  const local = {
    s: 10, x: 8, human: true, isPlayer: true, speed: 40,
    vLat: 0, head: -0.4, wasOnWall: false, wallT: 0, wallHits: 0, collideT: 0,
    px: 0, pz: 0,
  };
  WallClamp.apply(local, baseCtx(street));
  assert.equal(local.wasOnWall, true);
  assert.ok(shakes.length >= 1, "local player street scrape shakes");
  assert.ok(vibes.length >= 1, "local player street scrape vibrates");
  assert.ok(rumbles.length >= 1, "local player street scrape rumbles");
  assert.ok(audioHits >= 1, "local player street scrape plays collision");
});
