// pace-math — pins the pre-refactor outputs of vTop/vStd/aStd, X-mode gains,
// ERS regen/otTime, aeroDfMult, gearHi, rpmFor and paceRef identity
// (js/race/pace-math.js). Golden captured from the inline game.js formulas
// before the extract (tests/data/pace-math-golden.json); a pure move must match.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const GOLDEN = JSON.parse(read("tests/data/pace-math-golden.json"));

const CAR_A = { aeroLoad: 0, aeroX: 0, ersDeploy: 0, ersRegen: 0, deploying: false };
const CAR_B = { aeroLoad: 1, aeroX: 1, ersDeploy: 1, ersRegen: 1, deploying: true };
const CAR_C = { aeroLoad: 0.5, aeroX: 0.5, ersDeploy: 0.5, ersRegen: 0.5, deploying: true };

function load() {
  let PACE = 1.0;
  let raceCtl = null;
  let cars = [];
  let track = { n: 8 };
  const ctx = { Math, Object, Float32Array, console };
  ctx.globalThis = ctx;
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(read("js/core/mat4.js") + "\nthis.M4 = M4;", ctx);
  vm.runInContext(read("js/physics/consts.js"), ctx);
  vm.runInContext(read("js/race/pace-math.js") + "\nthis.PaceMath = PaceMath;", ctx);
  const api = ctx.PaceMath.create({
    getPACE: () => PACE,
    getVMAX: () => ctx.PhysicsConsts.VMAX,
    getCars: () => cars,
    getTrack: () => track,
    getRaceCtl: () => raceCtl,
  });
  return {
    PaceMath: ctx.PaceMath,
    api,
    PC: ctx.PhysicsConsts,
    setPACE: (v) => { PACE = v; },
    setRaceCtl: (v) => { raceCtl = v; },
    setCars: (v) => { cars = v; },
    setTrack: (v) => { track = v; },
  };
}

function snapCars(api) {
  const one = (c) => ({
    xVmaxGain: api.xVmaxGain(c),
    xCoastCut: api.xCoastCut(c),
    xDfLoss: api.xDfLoss(c),
    isErs: api.isErsDeploying(c),
    regenFor: api.regenFor(c),
    otTimeFor: api.otTimeFor(c),
    aeroDfMult: api.aeroDfMult(c),
  });
  return {
    A: one(CAR_A), B: one(CAR_B), C: one(CAR_C),
    null: one(null), empty: one({}),
  };
}

test("PaceMath global is frozen; create returns the named surface", () => {
  const env = load();
  assert.ok(Object.isFrozen(env.PaceMath));
  for (const k of [
    "vTop", "vStd", "aStd", "xVmaxGain", "paceRef", "xCoastCut", "isErsDeploying",
    "regenFor", "otTimeFor", "aeroDfMult", "gearHi", "rpmFor", "xDfLoss", "drainFor",
  ]) {
    assert.equal(typeof env.api[k], "function", k);
  }
});

test("pins vTop/vStd/aStd/gearHi/rpmFor across PACE values (pre-refactor)", () => {
  const env = load();
  assert.equal(env.PC.VMAX, GOLDEN.VMAX);
  for (const g of GOLDEN.cases) {
    env.setPACE(g.pace);
    assert.equal(env.api.vTop(), g.vTop, "vTop@" + g.pace);
    assert.equal(env.api.vStd(0), g.vStd_0);
    assert.equal(env.api.vStd(40), g.vStd_40);
    assert.equal(env.api.vStd(env.api.vTop()), g.vStd_vTop);
    assert.equal(env.api.aStd(3.5), g.aStd_3_5);
    assert.equal(env.api.aStd(0), g.aStd_0);
    assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8].map((n) => env.api.gearHi(n)), g.gearHi);
    for (const row of g.rpmFor) {
      assert.equal(env.api.rpmFor(row.g, row.s), row.rpm,
        "rpm g=" + row.g + " s=" + row.s + " pace=" + g.pace);
    }
  }
});

test("pins X-mode / ERS / aeroDfMult car snaps (pace-invariant; pre-refactor)", () => {
  const env = load();
  env.setPACE(1);
  assert.deepEqual(snapCars(env.api), GOLDEN.cars);
  env.setPACE(2);
  assert.deepEqual(snapCars(env.api), GOLDEN.cars);
});

test("pins wet (lowGrip) half-trade on X-mode gains (pre-refactor)", () => {
  const env = load();
  env.setPACE(1);
  env.setRaceCtl({ lowGrip: () => true });
  assert.equal(env.api.xVmaxGain(CAR_C), GOLDEN.wet.xVmaxGain_C);
  assert.equal(env.api.xCoastCut(CAR_C), GOLDEN.wet.xCoastCut_C);
  assert.equal(env.api.aeroDfMult(CAR_B), GOLDEN.wet.aeroDfMult_B);
});

test("paceRef caches per cars identity and track.n", () => {
  const env = load();
  env.setTrack({ n: 8 });
  const cars1 = [];
  env.setCars(cars1);
  const r1 = env.api.paceRef();
  const r2 = env.api.paceRef();
  assert.equal(r1, r2);
  assert.equal(r1.length, 8);
  assert.equal(r1.cars, cars1);
  const cars2 = [];
  env.setCars(cars2);
  const r3 = env.api.paceRef();
  assert.notEqual(r1, r3);
  assert.equal(r3.cars, cars2);
  env.setTrack({ n: 12 });
  env.setCars(cars2);
  // cars identity unchanged → still returns cached (original length 8)
  assert.equal(env.api.paceRef(), r3);
  assert.equal(env.api.paceRef().length, 8);
  env.setCars([]);
  assert.equal(env.api.paceRef().length, 12);
});
