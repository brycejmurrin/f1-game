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
import { seedLog } from "../helpers/seed-log.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC = readFileSync(join(ROOT, "js/game/incidentsim.js"), "utf8");

function load(over = {}) {
  const promoted = [];
  const pose = over.pose || null;
  const DebrisWorld = {
    active: () => true,
    rapierReady: () => true,
    worldGen: () => 1,
    promoteCarDynamic: (i) => { promoted.push(i); return true; },
    demoteCarKinematic: () => {},
    carBodyPose: () => pose,
  };
  const wall = over.wallAt != null ? over.wallAt : 8;
  const ctx = vm.createContext({
    Math, JSON, Object, Array, String, Number, Map, Set, Uint8Array,
    isNaN, isFinite, console, DebrisWorld,
    Tracks: {
      sample: () => {},
      wallAt: () => wall,
    },
  });
  seedLog(ctx);
  // js/mat4.js first — the shared scalar helpers (M4.clamp) incidentsim.js binds at eval.
  vm.runInContext(readFileSync(join(ROOT, "js/mat4.js"), "utf8"), ctx, { filename: "js/mat4.js" });
  vm.runInContext(SRC, ctx, { filename: "js/game/incidentsim.js" });
  const IncidentSim = vm.runInContext("IncidentSim", ctx);
  const mkCar = (s) => ({ px: 0, pz: 0, head: 0, speed: 40, s, x: 0, vLat: 0,
                          yawRateCur: 0, prog: s, finished: false, retired: false, human: false });
  const cars = [mkCar(100), mkCar(103)];
  const G = { cars, player: cars[0], track: { total: 5000 },
              // Promotion thresholds and the rescue floor are pace-scaled now,
              // so the façade stub carries the speed scale like the real G.
              PACE: 1, vTop: () => 72,
              trackFrom: over.trackFrom || (() => ({ s: 100, x: 0 })),
              worldFromTrack: over.worldFromTrack || (() => ({ x: 0, z: 0 })),
              rescuePlayer: () => {}, smp: {} };
  const sim = IncidentSim.create(G);
  return { sim, cars, promoted, G };
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

test("incident window scales with time, not car count", () => {
  // elapsed used to increment inside the per-car loop, so a 2-car shunt
  // hit WINDOW_MAX_S (3 s) at 1.5 s. Increment once per incident.
  const pose = { x: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1, vx: 10, vz: 0 };
  const { sim, cars } = load({ pose });
  sim.notifyCar(cars[0], cars[1], 30);
  sim.preStep(1 / 60);
  assert.equal(sim.status().owned, 2);
  for (let i = 0; i < 120; i++) sim.postStep(1 / 60);
  assert.equal(sim.status().owned, 2, "two-car window still open at 2 s");
});

test("postStep clamps lateral x to wallAt during takeover", () => {
  // Rapier pose is 20 m off the centreline; the barrier is at 5 m. The
  // write-back must keep the bicycle-model x inside the wall — updateCar
  // skips its own clamp while owns() is set.
  const pose = { x: 20, z: 0, qx: 0, qy: 0, qz: 0, qw: 1, vx: 4, vz: 0 };
  const { sim, cars } = load({
    pose,
    wallAt: 5,
    trackFrom: () => ({ s: 100, x: 12 }),
    worldFromTrack: (s, x) => ({ x, z: 0 }),
  });
  // Last-good snap is taken at promote. A 20 m Rapier jump from px=0 trips
  // the teleport bound and hands back before the wall clamp runs.
  cars[0].px = 18; cars[1].px = 18;
  sim.notifyCar(cars[0], cars[1], 30);
  sim.preStep(1 / 60);
  assert.equal(sim.status().owned, 2);
  sim.postStep(1 / 60);
  assert.equal(cars[0].x, 5, "owned car cannot write back past wallAt");
  assert.equal(cars[0].px, 5, "world pose follows the clamped (s,x)");
});

test("postStep hands a finished car back instead of tracking it", () => {
  const pose = { x: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1, vx: 0, vz: 0 };
  const { sim, cars } = load({ pose });
  sim.notifyCar(cars[0], cars[1], 30);
  sim.preStep(1 / 60);
  assert.equal(sim.status().owned, 2);
  cars[0].finished = true;
  sim.postStep(1 / 60);
  assert.equal(sim.status().owned, 1, "the finished car is released");
});
