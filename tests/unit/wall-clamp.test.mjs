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
 *   - isPlayer FX GATE. Street shake/vibrate/rumble fire only for the local
 *     player; barrier SFX on every circuit with throttled grind re-arm.
 *     A VS FRIEND is c.human too (setCarRole) — gating on human alone shakes
 *     the wrong screen (ship fix ad915f8ea).
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
const WALL_SFX_REARM = 0.35;

/** Mirrors game.js collideT decay after WallClamp.apply each tick. */
function decayCollideT(c, dt) {
  c.collideT = Math.max(0, c.collideT - dt);
}

/** Nose into +x wall (rel < 0 → noseIn at incidence > 0.12). */
function noseInCar(over = {}) {
  return {
    s: 10, x: 8, human: true, isPlayer: true, speed: 40,
    vLat: 0, head: -0.4, wasOnWall: false, wallT: 0, wallHits: 0, collideT: 0,
    px: 0, pz: 0,
    ...over,
  };
}

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
    onRumble: (...args) => rumbles.push(args),
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
  assert.equal(rumbles[0][2], "handles", "pad-haptics v2 channels wall rumble to handles");
  assert.ok(audioHits >= 1, "local player street scrape plays collision");
});

test("permanent circuit: local player nose-in plays barrier SFX (not street-gated)", () => {
  let audioHits = 0;
  const { WallClamp } = load({ onCollision: () => { audioHits++; } });
  const c = noseInCar();
  WallClamp.apply(c, baseCtx({ soundOn: true }));
  assert.equal(c.wasOnWall, true);
  assert.ok(audioHits >= 1, "street:false must still call GameAudio.collision");
});

test("wall grind: throttled scrape re-arm while moving (not one per frame)", () => {
  const REARM = WALL_SFX_REARM;
  const frames = 60;
  const dt = DT;
  let audioHits = 0;
  const { WallClamp } = load({ onCollision: () => { audioHits++; } });
  const ctx = baseCtx({ soundOn: true });
  const c = noseInCar({ speed: 25 });
  for (let i = 0; i < frames; i++) {
    c.x = 8;
    WallClamp.apply(c, { ...ctx, dt });
    decayCollideT(c, dt);
  }
  const maxCalls = Math.ceil((frames * dt) / REARM) + 1;
  assert.ok(audioHits > 1, "grind must re-arm scrape, not one-shot");
  assert.ok(audioHits <= maxCalls, `throttled: ${audioHits} calls, cap ${maxCalls}`);
  assert.ok(audioHits < frames, "must not fire every frame");
});

test("wall grind: call count stable across frame rate (same wall time)", () => {
  const REARM = WALL_SFX_REARM;
  const duration = 1;
  function grindCount(frames, dt) {
    let hits = 0;
    const { WallClamp } = load({ onCollision: () => { hits++; } });
    const ctx = baseCtx({ soundOn: true, dt });
    const c = noseInCar({ speed: 30 });
    for (let i = 0; i < frames; i++) {
      c.x = 8;
      WallClamp.apply(c, { ...ctx, dt });
      decayCollideT(c, dt);
    }
    return hits;
  }
  const at60 = grindCount(60, 1 / 60);
  const at30 = grindCount(30, 1 / 30);
  assert.ok(at60 > 1 && at30 > 1);
  assert.ok(Math.abs(at60 - at30) <= 1, `60fps=${at60} vs 30fps=${at30} should match re-arm, not dt`);
  const maxCalls = Math.ceil(duration / REARM) + 1;
  assert.ok(at60 <= maxCalls && at30 <= maxCalls);
});

test("barrier SFX: non-player and low incidence stay silent", () => {
  let audioHits = 0;
  const { WallClamp } = load({ onCollision: () => { audioHits++; } });
  const onStreet = { soundOn: true, track: { ...baseCtx().track, street: true } };
  const ai = noseInCar({ isPlayer: false, human: true });
  WallClamp.apply(ai, baseCtx(onStreet));
  assert.equal(audioHits, 0, "non-player");
  const graze = noseInCar({ head: -0.02 });
  WallClamp.apply(graze, baseCtx({ soundOn: true }));
  assert.equal(audioHits, 0, "incidence <= 0.12");
  WallClamp.apply(noseInCar(), baseCtx(onStreet));
  assert.equal(audioHits, 1, "street player still one hit");
});

test("stationary pinned to wall: no scrape re-arm", () => {
  let audioHits = 0;
  const { WallClamp } = load({ onCollision: () => { audioHits++; } });
  const ctx = baseCtx({ soundOn: true });
  const c = noseInCar({ speed: 0.5 });
  WallClamp.apply(c, ctx);
  const afterFirst = audioHits;
  assert.ok(afterFirst >= 1, "first pin may still scrape");
  for (let i = 0; i < 59; i++) {
    c.x = 8;
    WallClamp.apply(c, ctx);
    decayCollideT(c, ctx.dt);
  }
  assert.equal(audioHits, afterFirst, "stopped car must not re-arm");
});

// verify-physics #16: game.js called WallClamp.apply(c, { …, addShake(d){…} })
// once per car per tick — an object and a closure each time (~1,300/s at 22
// cars). The ctx is pooled like _aiBr; apply() reads it into locals on entry
// and keeps nothing, so one object serves every car.
test("game.js hands WallClamp.apply a pooled ctx, not a per-call literal", () => {
  const game = fs.readFileSync(path.join(ROOT, "js/game.js"), "utf8");
  assert.match(game, /WallClamp\.apply\(c, _wallCtx\);/);
  assert.doesNotMatch(game, /WallClamp\.apply\(c, \{/);
  assert.match(game, /const _wallCtx = \{[^\n]*addShake\(d\)/);
});
