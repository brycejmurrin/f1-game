/* input-ghost.test.mjs — unit tests for the deterministic input ghost recorder.
 *
 * Pose Ghost (ghost.test.mjs) stays the visual/PB path. This module records
 * steer/throttle/brake at FIXED_DT with seed + physRev + build, and refuses a
 * replay when the physics/build stamp no longer matches.
 *
 * Run: node --test tests/unit/input-ghost.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { seedLog } from "../helpers/seed-log.mjs";
import { seedSaveMigrate } from "../helpers/seed-save-migrate.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function createHarness(opts = {}) {
  const store = new Map(Object.entries(opts.disk || {}));
  const mockLocalStorage = {
    getItem(k) { return store.has(k) ? store.get(k) : null; },
    setItem(k, v) { store.set(k, String(v)); },
    removeItem(k) { store.delete(k); },
    clear() { store.clear(); },
  };
  const sandbox = {
    localStorage: mockLocalStorage,
    module: { exports: {} },
    TextEncoder,
    console,
    window: { __APEX_BUILD: opts.build != null ? opts.build : 42 },
    PhysicsConsts: { REVISION: opts.physRev || "test-rev-1", FIXED_DT: 1 / 60 },
  };
  const ctx = vm.createContext(sandbox);
  seedLog(ctx);
  seedSaveMigrate(ctx);
  vm.runInContext(readFileSync(join(ROOT, "js", "core", "mat4.js"), "utf8"), ctx);
  vm.runInContext(readFileSync(join(ROOT, "js", "core", "store.js"), "utf8"), ctx);
  vm.runInContext(readFileSync(join(ROOT, "js", "car", "input-ghost.js"), "utf8"), ctx);
  return {
    InputGhost: sandbox.module.exports || vm.runInContext("InputGhost", ctx),
    GameStore: vm.runInContext("GameStore", ctx),
    disk: store,
    sandbox,
  };
}

function driveLap(IG, n, lapTime) {
  IG.startLap({ seed: 7, physRev: "test-rev-1", build: 42, dt: 1 / 60 });
  for (let i = 0; i < n; i++) {
    IG.record({
      steer: Math.sin(i / 10) * 0.5,
      throttle: i % 5 !== 0,
      brake: i % 17 === 0,
    });
  }
  return IG.finishLap(lapTime);
}

test("InputGhost records fixed-timestep inputs with seed and version", () => {
  const { InputGhost: IG } = createHarness();
  IG.setTrack("monza");
  assert.equal(IG.hasGhost(), false);
  assert.equal(driveLap(IG, 60, 12.345), true);
  assert.equal(IG.hasGhost(), true);
  assert.equal(IG.bestTime(), 12.345);
  assert.equal(IG.steps(), 60);
  const env = IG.envelope();
  assert.equal(env.kind, "input-ghost");
  assert.equal(env.seed, 7);
  assert.equal(env.physRev, "test-rev-1");
  assert.equal(env.build, 42);
  assert.equal(env.dt, 1 / 60);
  assert.equal(IG.compatible(env), true);
});

test("InputGhost atStep / next replay the quantized open-loop inputs", () => {
  const { InputGhost: IG } = createHarness();
  IG.setTrack("monza");
  driveLap(IG, 40, 8);
  assert.equal(IG.beginReplay(), true);
  const a = IG.next();
  const b = IG.atStep(0);
  assert.ok(a);
  assert.equal(a.steer, b.steer);
  assert.equal(a.throttle, b.throttle);
  assert.equal(a.brake, b.brake);
  // Quantization stays inside [-1, 1] and round-trips within 1/127.
  for (let i = 0; i < 40; i++) {
    const inp = IG.atStep(i);
    assert.ok(Math.abs(inp.steer) <= 1 + 1e-9);
    assert.equal(typeof inp.throttle, "boolean");
    assert.equal(typeof inp.brake, "boolean");
  }
});

test("InputGhost refuses a replay when physRev or build drifts", () => {
  const { InputGhost: IG, sandbox } = createHarness();
  IG.setTrack("spa");
  driveLap(IG, 36, 9.1);
  assert.equal(IG.compatible(IG.envelope()), true);
  sandbox.PhysicsConsts.REVISION = "other-rev";
  assert.equal(IG.compatible(IG.envelope()), false);
  assert.equal(IG.beginReplay(), false);
  sandbox.PhysicsConsts.REVISION = "test-rev-1";
  sandbox.window.__APEX_BUILD = 99;
  assert.equal(IG.compatible(IG.envelope()), false);
});

test("InputGhost keeps the faster lap and persists under GameStore", () => {
  const { InputGhost: IG, GameStore } = createHarness();
  IG.setTrack("monza", '{"physics":"test-rev-1"}');
  assert.equal(driveLap(IG, 40, 20), true);
  assert.equal(driveLap(IG, 40, 25), false);   // slower — rejected
  assert.equal(IG.bestTime(), 20);
  assert.equal(driveLap(IG, 40, 18), true);
  assert.equal(IG.bestTime(), 18);
  IG.flush();
  const raw = GameStore.store.get("inputGhost.v1", null);
  assert.ok(raw && typeof raw === "object");
  const keys = Object.keys(raw);
  assert.ok(keys.length >= 1, "expected a stored input ghost");
  assert.equal(raw[keys[0]].time, 18);
  assert.equal(raw[keys[0]].seed, 7);
});

test("quantizeSteer / packFlags are stable helpers", () => {
  const { InputGhost: IG } = createHarness();
  assert.equal(IG.quantizeSteer(1), 127);
  assert.equal(IG.quantizeSteer(-1), -127);
  assert.equal(IG.quantizeSteer(0), 0);
  assert.equal(IG.packFlags({ throttle: true, brake: false }), 1);
  assert.equal(IG.packFlags({ throttle: false, brake: true }), 2);
  assert.equal(IG.packFlags({ throttle: true, brake: true }), 3);
  const d = IG.decodeStep(64, 3);
  assert.ok(Math.abs(d.steer - 64 / 127) < 1e-12);
  assert.equal(d.throttle, true);
  assert.equal(d.brake, true);
});

test("game.js and session-records wire InputGhost beside pose Ghost", () => {
  const game = readFileSync(join(ROOT, "js", "game.js"), "utf8");
  const rec = readFileSync(join(ROOT, "js", "race", "session-records.js"), "utf8");
  assert.match(game, /restartTTRecorders/);
  assert.match(game, /records\.sample\(c, inp\)/);
  assert.match(rec, /InputGhost\.setTrack/);
  assert.match(rec, /InputGhost\.record\(inp\)/);
  assert.match(rec, /InputGhost\.finishLap/);
  const man = readFileSync(join(ROOT, "tools", "manifest.cjs"), "utf8");
  assert.match(man, /js\/car\/input-ghost\.js/);
});
