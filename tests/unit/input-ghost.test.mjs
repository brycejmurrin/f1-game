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
  const store = opts.store || new Map(Object.entries(opts.disk || {}));
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

// A lap left open (parked, stuck, AFK) grew two arrays per physics step with no
// bound, and with no best yet an hour-long lap became the ghost: past MAX_LAP_S
// the lap is dropped, as an invalid one is.
test("InputGhost drops a lap left open past MAX_LAP_S; a lap under it still records", () => {
  const { InputGhost: IG } = createHarness();
  IG.setTrack("monza");
  const cap = IG.MAX_LAP_S * 60;
  assert.equal(IG.MAX_LAP_S, 600);
  assert.equal(driveLap(IG, cap + 1, IG.MAX_LAP_S + 1 / 60), false, "one step past the cap: no ghost");
  assert.equal(IG.hasGhost(), false);
  assert.equal(driveLap(IG, cap, IG.MAX_LAP_S), true, "exactly at the cap still records");
  assert.equal(IG.steps(), cap);
  assert.equal(driveLap(IG, 60, 12.3), true, "the next lap records as usual");
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

// A recording from before a physics/build bump is refused for replay, and used to
// stay `best` for the record test too: every later lap that was not faster than a
// lap set on the OLD physics returned false, so the circuit never got a usable
// input ghost again.
test("an incompatible stored ghost does not block the record test (REVISION flip)", () => {
  const { InputGhost: IG, sandbox } = createHarness();
  IG.setTrack("monza");
  assert.equal(driveLap(IG, 40, 9.0), true);
  IG.flush();
  sandbox.PhysicsConsts.REVISION = "rev-2";
  IG.setTrack("monza");
  assert.equal(IG.hasGhost(), true, "the stale entry is still there");
  assert.equal(IG.compatible(IG.envelope()), false);
  assert.equal(IG.beginReplay(), false);
  IG.startLap({ seed: 7, physRev: "rev-2", build: 42, dt: 1 / 60 });
  for (let i = 0; i < 40; i++) IG.record({ steer: 0.1, throttle: true });
  assert.equal(IG.finishLap(10.0), true, "a slower lap on the new revision is the record");
  assert.equal(IG.bestTime(), 10);
  assert.equal(IG.compatible(IG.envelope()), true);
  assert.equal(IG.beginReplay(), true);
  // The compatible record still guards itself.
  assert.equal(driveLap(IG, 40, 11), false);
});

// Unlike pose Ghost, InputGhost cached the whole store object forever and wrote
// all of it back, so a second tab's input ghost was overwritten.
test("a foreign tab's input ghost survives this tab's save (two harnesses, one disk)", () => {
  const disk = new Map();
  const A = createHarness({ store: disk }), B = createHarness({ store: disk });
  B.InputGhost.setTrack("spa");                       // B loads the (empty) store
  A.InputGhost.setTrack("monza");
  assert.equal(driveLap(A.InputGhost, 40, 20), true);
  A.InputGhost.flush();
  assert.deepEqual(Object.keys(JSON.parse(disk.get("apex26.inputGhost.v1"))), ["monza"]);
  B.GameStore.store.onForeignWrite({ key: "apex26.inputGhost.v1" });   // the storage event
  assert.equal(driveLap(B.InputGhost, 40, 21), true);
  B.InputGhost.flush();
  const saved = JSON.parse(disk.get("apex26.inputGhost.v1"));
  assert.deepEqual(Object.keys(saved).sort(), ["monza", "spa"], "B's save keeps A's monza ghost");
  assert.equal(saved.monza.time, 20);
  // A foreign write to this tab's own circuit re-picks `best`; a pending lap rebases onto it.
  A.InputGhost.setTrack("spa");
  B.InputGhost.setTrack("monza");
  assert.equal(B.InputGhost.bestTime(), 20);
  assert.equal(driveLap(A.InputGhost, 40, 15), true);
  A.InputGhost.flush();
  B.GameStore.store.onForeignWrite({ key: "apex26.inputGhost.v1" });
  assert.equal(B.InputGhost.bestTime(), 20, "B is on monza; A's spa PB is not its best");
  B.InputGhost.setTrack("spa");
  assert.equal(B.InputGhost.bestTime(), 15, "the other tab's spa PB is read, not B's stale cache");
  B.GameStore.store.onForeignWrite({ key: null });
  assert.equal(B.InputGhost.hasGhost(), false, "a foreign storage.clear() drops the cached ghost");
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
  assert.match(game, /records\.sample\(c, inp, true\)/);
  assert.match(rec, /InputGhost\.setTrack/);
  assert.match(rec, /InputGhost\.record\(inp\)/);
  assert.match(rec, /InputGhost\.finishLap/);
  const man = readFileSync(join(ROOT, "tools", "manifest.cjs"), "utf8");
  assert.match(man, /js\/car\/input-ghost\.js/);
});

 test("v2 pedal travel survives serialization and legacy v1 remains binary", () => {
  const { InputGhost: IG } = createHarness();
  IG.setTrack("analog"); IG.startLap({ seed: 7 });
  for (let i = 0; i < 40; i++) IG.record({ steer: 0, throttle: true, brake: true, throttleLevel: .25, brakeLevel: .2 });
  IG.finishLap(8);
  const env = IG.envelope();
  assert.equal(env.v, 2);
  assert.equal(IG.atStep(0).throttleLevel, 64 / 255);
  assert.equal(IG.atStep(0).brakeLevel, 51 / 255);
  assert.equal(IG.valid(JSON.parse(JSON.stringify(IG.snapshot()))), true);
  env.v = 1;
  env.throttle = { 0: NaN }; env.brake = ["invalid"];
  assert.equal(IG.compatible(env), true);
  assert.equal(IG.atStep(0).throttleLevel, 1);
  assert.equal(IG.atStep(0).brakeLevel, 1);
  assert.equal(IG.snapshot().throttle, undefined, "legacy extra fields are ignored on export");
  assert.equal(IG.snapshot().brake, undefined);
});


function nativeTape(IG, n, seconds, varyingPedals = false) {
  IG.startLap({ seed: 7, physRev: "test-rev-1", build: 42, dt: 1 / 60 });
  for (let i = 0; i < n; i++) IG.record({ native: true, steer: Math.sin(i / 17) * 0.017321,
    throttle: true, brake: false,
    throttleLevel: varyingPedals ? (Math.sin(i / 13) + 1) / 2 : 0.37123456,
    brakeLevel: varyingPedals ? (Math.cos(i / 11) + 1) / 2 : 0,
    ...(i === 0 ? { initialState: { car: { s: 10, x: 0, speed: 55 }, seed: 7, rngState: 7, raceT: 0 } } : {}) });
  return IG.finishLap(seconds);
}

test("150-second native v3 tape persists losslessly inside unchanged 256KiB budget", (t) => {
  const { InputGhost: IG, disk } = createHarness(); IG.setTrack("monza", "native-persistence");
  assert.equal(nativeTape(IG, 9000, 150), true);
  assert.equal(IG.persistence().durable, true);
  const saved = disk.get("apex26.inputGhost.v1");
  t.diagnostic(`native9000 snapshot=${Buffer.byteLength(JSON.stringify(IG.snapshot()))} bytes; durableStore=${Buffer.byteLength(saved)} bytes; budget=${256 * 1024}`);
  assert.ok(Buffer.byteLength(saved) < 256 * 1024, `compact storage bytes ${Buffer.byteLength(saved)}`);
  const loaded = createHarness({ store: disk }).InputGhost; loaded.setTrack("monza", "native-persistence");
  assert.equal(loaded.hasGhost(), true); assert.equal(loaded.steps(), 9000);
  const roundTrip = loaded.snapshot();
  assert.deepEqual(Array.from(roundTrip.rawSteer), Array.from(IG.snapshot().rawSteer));
  assert.deepEqual(Array.from(roundTrip.rawThrottle), Array.from(IG.snapshot().rawThrottle));
  assert.deepEqual(Array.from(roundTrip.rawBrake), Array.from(IG.snapshot().rawBrake));
  for (const i of [0, 4512, 8999]) {
    assert.equal(loaded.atStep(i).steer, Math.sin(i / 17) * 0.017321);
    assert.equal(loaded.atStep(i).throttleLevel, 0.37123456); assert.equal(loaded.atStep(i).brakeLevel, 0);
  }
  const corrupt = JSON.parse(saved); Object.values(corrupt)[0].packedV3.steer = "AAAA";
  const brokenDisk = new Map([["apex26.inputGhost.v1", JSON.stringify(corrupt)]]);
  const bad = createHarness({ store: brokenDisk }).InputGhost; bad.setTrack("monza", "native-persistence");
  assert.equal(bad.hasGhost(), false, "malformed packed channel rejected");
});

test("oversize native tape is refused before evicting a persisted best; quota is explicitly session-only", () => {
  const { InputGhost: IG, disk } = createHarness(); IG.setTrack("monza", "bounded-native");
  assert.equal(nativeTape(IG, 60, 2), true); const previous = disk.get("apex26.inputGhost.v1");
  assert.equal(nativeTape(IG, 18000, 1, true), false, "encoded single entry exceeds supported disk budget");
  assert.equal(IG.bestTime(), 2); assert.equal(disk.get("apex26.inputGhost.v1"), previous);
  assert.equal(IG.persistence().reason, "recording exceeds storage budget");
  const quotaDisk = new Map();
  const set = quotaDisk.set.bind(quotaDisk);
  quotaDisk.set = (key, value) => { if (key === "apex26.inputGhost.v1") throw new Error("quota"); return set(key, value); };
  const q = createHarness({ store: quotaDisk }).InputGhost; q.setTrack("monza", "quota-native");
  assert.equal(nativeTape(q, 60, 1), true); assert.equal(q.hasGhost(), true);
  assert.equal(q.persistence().durable, false); assert.match(q.persistence().reason, /quota|unavailable/);
  const reload = createHarness({ store: quotaDisk }).InputGhost; reload.setTrack("monza", "quota-native");
  assert.equal(reload.hasGhost(), false);
});


test("150-second mixed analog lap keeps all channels exact with sparse braking/coast storage", (t) => {
  const { InputGhost: IG, disk } = createHarness(); IG.setTrack("monza", "mixed-native");
  IG.startLap({ seed: 7, physRev: "test-rev-1", build: 42, dt: 1 / 60 });
  const expected = { steer: [], throttle: [], brake: [] };
  for (let i = 0; i < 9000; i++) {
    const phase = i % 600;
    const steer = Math.sin(i / 17) * 0.017321;
    const throttle = phase < 360 ? 0.5 + 0.5 * Math.sin(i / 17) : 0;
    const brake = phase >= 420 && phase < 540 ? 0.3 + 0.2 * Math.sin(i / 11) : 0;
    expected.steer.push(steer); expected.throttle.push(throttle); expected.brake.push(brake);
    IG.record({ native: true, steer, throttle: throttle > 0, brake: brake > 0, throttleLevel: throttle, brakeLevel: brake,
      ...(i === 0 ? { initialState: { car: { s: 10, x: 0, speed: 55 }, seed: 7, rngState: 7, raceT: 0 } } : {}) });
  }
  assert.equal(IG.finishLap(150), true); assert.equal(IG.persistence().durable, true);
  const saved = disk.get("apex26.inputGhost.v1"), bytes = Buffer.byteLength(saved);
  t.diagnostic(`mixedNative9000 durableStore=${bytes} bytes; budget=${256 * 1024}`);
  assert.ok(bytes < 256 * 1024);
  const loaded = createHarness({ store: disk }).InputGhost; loaded.setTrack("monza", "mixed-native");
  assert.equal(loaded.hasGhost(), true); const tape = loaded.snapshot();
  assert.deepEqual(Array.from(tape.rawSteer), expected.steer);
  assert.deepEqual(Array.from(tape.rawThrottle), expected.throttle);
  assert.deepEqual(Array.from(tape.rawBrake), expected.brake);
  // Signed zero stays in a binary literal, including adjacent positive zeros.
  IG.setTrack("monza", "signed-zero");
  IG.startLap({ seed: 7, physRev: "test-rev-1", build: 42, dt: 1 / 60 });
  for (let i = 0; i < 60; i++) IG.record({ native: true, steer: i < 30 ? -0 : 0, throttle: false, brake: false, throttleLevel: -0, brakeLevel: 0,
    ...(i === 0 ? { initialState: { car: { s: 10, x: 0, speed: 55 }, seed: 7, rngState: 7, raceT: 0 } } : {}) });
  assert.equal(IG.finishLap(1), true);
  const signed = createHarness({ store: disk }).InputGhost; signed.setTrack("monza", "signed-zero");
  assert.ok(Object.is(signed.atStep(0).steer, -0)); assert.ok(Object.is(signed.atStep(30).steer, 0));
  assert.ok(Object.is(signed.atStep(0).throttleLevel, -0));
});
