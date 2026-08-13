/* incident-gate.test.mjs — IncidentSim's notifyCar gate vs preStep authority.
 *
 * The rule under test: the notifyCar entry gate must let an R2-qualifying
 * car-car hit through when `r2Airborne` is the ONLY enabled flag, while
 * preStep's per-kind gates still refuse r3/c1 work in that config — enabling
 * one incident kind must never widen the authority of the others.
 *
 * Like race-control.test.mjs this runs the module whole in a VM: DebrisWorld is
 * a stub that records promotions, G is a minimal two-car world, and each case
 * drives one notifyCar + one preStep and reads status(). The thresholds named
 * below are the module's own (R2_CAR_V = 24, R3_CAR_V ~ the r3 contact band
 * floor); the cases pin the GATING between them, not the numbers.
 *
 * Run: node --test tests/unit/incident-gate.test.mjs   (npm run test:tooling-fast)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = readFileSync(join(ROOT, "js/game/incidentsim.js"), "utf8");

function load() {
  const promoted = [];
  const DebrisWorld = {
    active: () => true,
    rapierReady: () => true,
    worldGen: () => 1,
    promoteCarDynamic: (i) => { promoted.push(i); return true; },
    demoteCarKinematic: () => {},
    carBodyPose: () => null,
  };
  const ctx = vm.createContext({
    Math, JSON, Object, Array, String, Number, Map, Set, Uint8Array,
    isNaN, isFinite, console, DebrisWorld,
  });
  vm.runInContext(SRC, ctx, { filename: "js/game/incidentsim.js" });
  const IncidentSim = vm.runInContext("IncidentSim", ctx);
  const mkCar = (s) => ({ px: 0, pz: 0, head: 0, speed: 40, s, x: 0, vLat: 0,
                          yawRateCur: 0, prog: s, finished: false, retired: false, human: false });
  const cars = [mkCar(100), mkCar(103)];
  const G = { cars, player: cars[0], track: { total: 5000 },
              trackFrom: () => ({ s: 100, x: 0 }),
              worldFromTrack: () => ({ x: 0, z: 0 }),
              rescuePlayer: () => {}, smp: {} };
  const sim = IncidentSim.create(G);
  return { sim, cars, promoted };
}

test("r2-only config: a car-car launch at relV >= R2_CAR_V queues AND promotes as r2", () => {
  const { sim, cars, promoted } = load();
  sim.setFlags({ r2Airborne: true, r3Contact: false, c1Pileup: false });
  sim.notifyCar(cars[0], cars[1], 30);
  sim.preStep(1 / 60);
  const st = sim.status();
  assert.equal(st.count, 1, "one incident promoted");
  assert.equal(st.lastKind, "r2");
  assert.equal(st.owned, 2, "both cars owned by the incident window");
  assert.equal(promoted.length, 2, "both cars promoted to dynamic bodies");
});

test("r2-only config: an r3-band contact promotes NOTHING — no widened authority", () => {
  // relV = 20 sits in the r3 band (>= R3_CAR_V, < R2_CAR_V = 24). With only
  // r2Airborne on, the entry gate may not smuggle it through as r3 work.
  const { sim, cars } = load();
  sim.setFlags({ r2Airborne: true, r3Contact: false, c1Pileup: false });
  sim.notifyCar(cars[0], cars[1], 20);
  sim.preStep(1 / 60);
  const st = sim.status();
  assert.equal(st.count, 0);
  assert.equal(st.owned, 0);
});

test("sub-threshold relV never queues, even with every flag on", () => {
  const { sim, cars } = load();
  sim.setFlags({ r2Airborne: true, r3Contact: true, c1Pileup: true });
  sim.notifyCar(cars[0], cars[1], 10);
  sim.preStep(1 / 60);
  assert.equal(sim.status().count, 0, "a draft bump (relV=10) promotes nothing");
});

test("all flags off: fully inert", () => {
  const { sim, cars } = load();
  sim.setFlags({ r2Airborne: false, r3Contact: false, c1Pileup: false });
  sim.notifyCar(cars[0], cars[1], 30);
  sim.preStep(1 / 60);
  assert.equal(sim.status().count, 0);
});

test("default config unchanged: a relV=30 pair still resolves as r2", () => {
  // The gate fix must not alter what the shipped defaults already reached.
  const { sim, cars } = load();
  sim.notifyCar(cars[0], cars[1], 30);
  sim.preStep(1 / 60);
  assert.equal(sim.status().lastKind, "r2");
});
