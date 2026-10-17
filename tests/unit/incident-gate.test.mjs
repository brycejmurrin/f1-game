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
const SRC = readFileSync(join(ROOT, "js/physics/incident-sim.js"), "utf8");
const RACE_SRC = readFileSync(join(ROOT, "js/race/race-control.js"), "utf8");

function load(over = {}) {
  const promoted = [], launched = {};
  const pose = over.pose || null;
  const DebrisWorld = {
    active: () => true,
    rapierReady: () => true,
    worldGen: over.worldGen || (() => 1),
    promoteCarDynamic: (i, lin) => {
      if (over.failPromotion || (over.promote && !over.promote(i))) return false;
      promoted.push(i); launched[i] = lin; return true;
    },
    demoteCarKinematic: () => {},
    carBodyPose: () => pose,
  };
  const wall = over.wallAt != null ? over.wallAt : 8;
  const ctx = vm.createContext({
    Math, JSON, Object, Array, String, Number, Map, Set, Uint8Array,
    isNaN, isFinite, console, DebrisWorld,
    TrackPit: { EXIT_WALL_W: 0.35 },
    Tracks: {
      sample: over.sample || (() => {}),
      wallAt: () => wall,
      postLimits: over.postLimits || (() => {}),
    },
  });
  seedLog(ctx);
  // js/core/mat4.js first — the shared scalar helpers (M4.clamp) incidentsim.js binds at eval.
  vm.runInContext(readFileSync(join(ROOT, "js/core/mat4.js"), "utf8"), ctx, { filename: "js/core/mat4.js" });
  vm.runInContext(RACE_SRC, ctx, { filename: "js/race/race-control.js" });
  vm.runInContext(readFileSync(join(ROOT, "js/physics/contact-geometry.js"), "utf8"), ctx);
  vm.runInContext(SRC, ctx, { filename: "js/physics/incident-sim.js" });
  const IncidentSim = vm.runInContext("IncidentSim", ctx);
  const mkCar = (s) => ({ px: 0, pz: 0, head: 0, speed: 40, s, x: 0, vLat: 0,
                          yawRateCur: 0, prog: s, finished: false, retired: false, human: false });
  const cars = Array.from({ length: over.count || 2 }, (_, i) => mkCar(100 + 3 * i));
  const G = { cars, player: cars[0], track: { total: 5000 },
              // Promotion thresholds and the rescue floor are pace-scaled now,
              // so the façade stub carries the speed scale like the real G.
              PACE: 1, vTop: () => 72,
              trackFrom: over.trackFrom || (() => ({ s: 100, x: 0 })),
              worldFromTrack: over.worldFromTrack || (() => ({ x: 0, z: 0 })),
              rescuePlayer: () => {}, smp: {} };
  const sim = IncidentSim.create(G);
  return { sim, cars, promoted, launched, G };
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

test("an incident-owned lapped car takes the existing chequered flag at the line", () => {
  const pose = { x: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1, vx: 10, vz: 0 };
  const { sim, cars, G } = load({ pose, trackFrom: () => ({ s: 5, x: 0 }) });
  cars[0].s = 4995; cars[0].prog = 4995; cars[0].lap = 4; cars[0].lapTime = 78;
  cars[1].s = 100; cars[1].prog = 100; cars[1].lap = 4;
  G.lapsTarget = 5; G.raceT = 420;
  G.cars.push({ finished: true, retired: false, lap: 6 });
  sim.notifyCar(cars[0], cars[1], 30);
  sim.preStep(1 / 60);
  sim.postStep(1 / 60);
  assert.equal(cars[0].lap, 5);
  assert.equal(cars[0].finished, true, "the incident path must honor the flag already out");
  assert.equal(cars[0].finishT, 420);
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

test("a car flying outward past wallAt does not trip the teleport guard (bug-hunt 7.1)", () => {
  // The Rapier world has no barriers, so the raw body keeps going while the
  // written-back c.px/pz is clamped at the wall. The guard must compare raw
  // with raw: 1.5 m/tick is well under stepBound, however far past the wall.
  const pose = { x: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1, vx: 90, vz: 0 };
  const { sim, cars } = load({
    pose,
    wallAt: 8,
    trackFrom: () => ({ s: 100, x: pose.x }),
    worldFromTrack: (s, x) => ({ x, z: 0 }),
  });
  sim.notifyCar(cars[0], cars[1], 30);
  sim.preStep(1 / 60);
  assert.equal(sim.status().owned, 2);
  for (let i = 0; i < 20; i++) { pose.x += 1.5; sim.postStep(1 / 60); }
  assert.equal(sim.status().fallbacks, 0, "no anomaly handback from a wall-clamped write-back");
  assert.equal(sim.status().owned, 2, "both cars still owned by the window");
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

/* ── the handback must INVERT the promote, not approximate it ──────────────
 *
 * startIncident maps the bespoke (speed, vLat) into Rapier's world with
 *   vWx = spd*fx - vLat*fz ;  vWz = spd*fz + vLat*fx      (fx=sin h, fz=cos h)
 * i.e. forward (fx, fz) plus +vLat along the car's RIGHT vector (-fz, fx) —
 * the rotation [[fx,-fz],[fz,fx]], whose inverse is its transpose, so
 * projecting back onto forward and RIGHT against the body's new heading
 * returns the originals exactly. (Until 2026-10-04 both halves used the LEFT
 * vector (fz, -fx): self-inverse, so these round trips passed while every
 * slide was launched mirrored — the basis tests below pin the direction.)
 *
 * The old handback used `Math.hypot(vx, vz)` and `vLat = 0`. hypot is
 * unsigned, so a car that spun 180 deg during a takeover was handed back
 * FACING the way it ended up and DRIVING at the speed it had been going
 * backwards — the wrong way down the road — and its lateral velocity was
 * discarded. These assert the algebra directly, so they fail if either half
 * of the pair is edited without the other.
 */
const fwd = (spd, vLat, head) => {
  const fx = Math.sin(head), fz = Math.cos(head);
  return { vWx: spd * fx - vLat * fz, vWz: spd * fz + vLat * fx };
};
const inv = (vWx, vWz, head) => {
  const fx = Math.sin(head), fz = Math.cos(head);
  return { speed: vWx * fx + vWz * fz, vLat: vWz * fx - vWx * fz };
};

test("promote -> handback round-trips speed and vLat, at any heading", () => {
  for (const head of [0, 0.7, Math.PI / 2, 2.4, Math.PI, -1.3, 5.9]) {
    for (const [spd, vLat] of [[62, 0], [62, 4.5], [-18, -3], [0, 7], [-40, 0]]) {
      const w = fwd(spd, vLat, head);
      const back = inv(w.vWx, w.vWz, head);
      assert.ok(Math.abs(back.speed - spd) < 1e-9,
        `speed ${spd} at head ${head} came back ${back.speed}`);
      assert.ok(Math.abs(back.vLat - vLat) < 1e-9,
        `vLat ${vLat} at head ${head} came back ${back.vLat}`);
    }
  }
});

test("the old hypot handback loses the sign — the defect this replaced", () => {
  const head = 1.1, spd = -30, vLat = 0;      // spun: travelling backwards
  const w = fwd(spd, vLat, head);
  const hypot = Math.hypot(w.vWx, w.vWz);
  assert.ok(hypot > 0, "hypot is unsigned by construction");
  assert.ok(Math.abs(hypot - Math.abs(spd)) < 1e-9, "and equal to the magnitude");
  // The sign is the whole defect: +30 handed back where -30 went in.
  assert.ok(Math.sign(hypot) !== Math.sign(spd),
    "the old path handed a backwards car forward down the road");
  assert.ok(Math.abs(inv(w.vWx, w.vWz, head).speed - spd) < 1e-9,
    "the inverse keeps it");
});

test("a lateral-only promote survives the round trip instead of being zeroed", () => {
  const head = 0.4, spd = 0, vLat = 6;
  const w = fwd(spd, vLat, head);
  assert.ok(Math.abs(Math.hypot(w.vWx, w.vWz) - 6) < 1e-9,
    "the old path would read this pure slide as 6 m/s of FORWARD speed");
  const back = inv(w.vWx, w.vWz, head);
  assert.ok(Math.abs(back.speed) < 1e-9, "forward stays zero");
  assert.ok(Math.abs(back.vLat - 6) < 1e-9, "and the slide is kept");
});

test("the shipped handback uses the inverse, not hypot, for speed and vLat", () => {
  assert.match(SRC, /const vFwd = vWx \* fxh \+ vWz \* fzh/);
  assert.match(SRC, /const vSide = vWz \* fxh - vWx \* fzh/);
  assert.match(SRC, /c\.vLat = fin\(vSide\)/);
  assert.doesNotMatch(SRC, /const speed = fin\(vHoriz\)/,
    "speed must come from the signed forward component, not the magnitude");
});

/* ── the handback never returns a car reversing (verify-physics #5) ────────
 * A settled wreck (|v| < SETTLE_V for SETTLE_HOLD_S) is relaunched FORWARD in
 * the RETAIN band whatever the sign of its last drift; only a car still
 * genuinely rolling backwards when the 3 s window closes keeps its sign, and
 * then at the reverse crawl (REVERSE_MAX, -5 m/s) at most. Before: the sign of
 * a near-zero settled roll picked the direction, so a slight backward drift
 * came back at -0.43 x entry speed (-17.2 m/s for these 40 m/s cars).
 */
function runToHandback(sim, cars, maxSteps = 400) {
  sim.notifyCar(cars[0], cars[1], 30);
  sim.preStep(1 / 60);
  assert.equal(sim.status().owned, 2, "promoted");
  let n = 0;
  while (sim.status().owned > 0 && n < maxSteps) { sim.postStep(1 / 60); n++; }
  assert.equal(sim.status().owned, 0, `handed back within ${maxSteps} steps`);
  return n;
}

test("a settled wreck drifting slightly backwards is handed back FORWARD in the retain band", () => {
  const pose = { x: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1, vx: 0, vz: -1, sleeping: true };
  const { sim, cars } = load({ pose });
  const n = runToHandback(sim, cars);
  assert.ok(n < 60, `settled, not timed out (${n} steps)`);
  assert.ok(Math.abs(cars[0].speed - 40 * 0.43) < 1e-9, `relaunched forward at the floor (got ${cars[0].speed})`);
});

test("a car still rolling backwards when the window closes keeps its sign at the reverse crawl", () => {
  const pose = { x: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1, vx: 0, vz: -20 };
  const { sim, cars } = load({ pose });
  const n = runToHandback(sim, cars);
  assert.ok(n >= 170, `the window, not the settle band, ended it (${n} steps)`);
  assert.equal(cars[0].speed, -5, "capped at REVERSE_MAX, not -0.43..-0.71 x entry speed");
});

test("an AI spun to face back up the road but travelling forward is handed back forward", () => {
  // Road tangent +Z; the body is yawed pi (qy = 1) and moving +Z at 12 m/s, so
  // its BODY-forward speed is -12 — an AI integrates s += speed*dt along the
  // road, so that sign would drive it backwards into the field.
  const pose = { x: 0, z: 0, qx: 0, qy: 1, qz: 0, qw: 0, vx: 0, vz: 12 };
  const sample = (track, s, out) => { out.t = [0, 0, 1]; out.p = [0, 0, s]; out.hw = 7; };
  const { sim, cars } = load({ pose, sample });
  runToHandback(sim, cars);
  assert.ok(cars[0].speed > 0, `AI handed back reversing (${cars[0].speed})`);
  assert.ok(Math.abs(cars[0].speed - 40 * 0.43) < 1e-9, `in the retain band (got ${cars[0].speed})`);
});

test("a settled human facing back up the road is turned to face it", () => {
  const pose = { x: 0, z: 0, qx: 0, qy: 1, qz: 0, qw: 0, vx: 0, vz: 0, sleeping: true };
  const sample = (track, s, out) => { out.t = [0, 0, 1]; out.p = [0, 0, s]; out.hw = 7; };
  const { sim, cars } = load({ pose, sample });
  cars[0].human = true;
  runToHandback(sim, cars);
  assert.ok(Math.abs(cars[0].head) < 1e-9, `faces the road (+Z, head 0), got ${cars[0].head}`);
  assert.ok(cars[0].speed > 0, "and goes forward");
});

/* ── +vLat is RIGHT in the world, both ways ─────────────────────────────────
 * PlayerForces integrates +vLat as the car's RIGHT (axle slip vLat ± a·r,
 * +yawRate = nose right) and tracks.js builds the road's right as t × up,
 * which for a car heading +Z (head 0) is world -X. So a car sliding right at
 * head 0 must launch with a NEGATIVE world x velocity, and a body drifting
 * toward -X must come back as +vLat. The round-trip tests above cannot see
 * this: a mirrored pair round-trips just as exactly.
 */
test("promote launches a right slide along the car's right vector (-fz, fx)", () => {
  const { sim, cars, launched } = load();
  cars[0].human = true; cars[0].head = 0; cars[0].speed = 40; cars[0].vLat = 5;
  sim.notifyCar(cars[0], cars[1], 30);
  sim.preStep(1 / 60);
  const lin = launched[0];
  assert.ok(lin, "the car was promoted");
  assert.ok(Math.abs(lin.z - 40) < 1e-9, `forward speed along +Z (got ${lin.z})`);
  assert.ok(Math.abs(lin.x - -5) < 1e-9, `a +vLat (right) slide launches toward world -X (got ${lin.x})`);
});

test("handback reads a world drift toward the car's right as +vLat", () => {
  // Identity quaternion: head 0, forward +Z, RIGHT -X. 10 m/s forward, 3 m/s right.
  const pose = { x: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1, vx: -3, vz: 10 };
  const { sim, cars } = load({ pose });
  sim.notifyCar(cars[0], cars[1], 30);
  sim.preStep(1 / 60);
  sim.postStep(1 / 60);
  assert.ok(Math.abs(cars[0].speed - 10) < 1e-9, `forward speed (got ${cars[0].speed})`);
  assert.ok(Math.abs(cars[0].vLat - 3) < 1e-9, `drift toward -X at head 0 is +vLat, sliding right (got ${cars[0].vLat})`);
});

// HANDBACK SIGN, AI. An AI car moves along the road (c.s += c.speed*dt), so a
// rival Rapier spun 180 deg while it was still sliding FORWARD along the road
// must come back with positive speed. Read against the body's heading it came
// back at -20 m/s and reversed down the track into the pack.
test("an AI car spun round but still sliding forwards is handed back driving forwards", () => {
  let pose = null;
  const ctx = { console, Math, Number, Map, Set, Array, Object, JSON };
  ctx.globalThis = ctx;
  ctx.Log = { info() {}, debug() {}, warn() {} };
  ctx.localStorage = { getItem() { return null; } };
  ctx.M4 = { clamp: (v, a, b) => Math.min(b, Math.max(a, v)) };
  ctx.Tracks = { sample(track, s, o) { o.t = [0, 0, 1]; o.p = [0, 0, s]; o.hw = 7; return o; }, wallAt() { return 20; } };
  ctx.RaceControl = { lineTransition() { return null; } };
  ctx.DebrisWorld = { active: () => true, rapierReady: () => true, worldGen: () => 1,
    promoteCarDynamic() { return true; }, demoteCarKinematic() {}, carBodyPose() { return pose; } };
  vm.createContext(ctx);
  vm.runInContext(readFileSync(join(ROOT, "js/physics/contact-geometry.js"), "utf8"), ctx);
  vm.runInContext(SRC + "\nglobalThis.IncidentSim = IncidentSim;", ctx);
  const car = { human: false, s: 500, x: 0, speed: 40, vLat: 0, yawRateCur: 0, head: 0, px: 0, pz: 500, prog: 500 };
  const G = { cars: [car], track: { total: 5000 }, smp: {}, PACE: 1, vTop: () => 72, lapsTarget: 5, raceT: 10,
    trackFrom(px, pz) { return { s: pz, x: -px }; }, worldFromTrack(s, x) { return { x: -x, z: s }; } };
  const IS = ctx.IncidentSim.create(G);
  IS.notifyWall(car, 1, 999);
  IS.preStep(1 / 60);
  assert.equal(IS.owns(car), true, "the wall strike hands the car to Rapier");
  // Body yawed PI (quaternion about Y), travelling +Z (forwards along the road) at 20 m/s.
  for (let k = 0; k < 400 && IS.owns(car); k++) {
    pose = { x: 0, z: car.pz + 20 / 60, qx: 0, qy: 1, qz: 0, qw: 1e-9, vx: 0, vz: 20, wx: 0, wy: 0, wz: 0, sleeping: false };
    IS.postStep(1 / 60);
  }
  assert.equal(IS.owns(car), false, "handed back");
  assert.ok(car.speed > 0, `handed back at ${car.speed} m/s — an AI car rolling forwards must not reverse`);
});

test('rejection reasons explain threshold, selected kind and ownership without widening gates', () => {
  const { sim, cars } = load();
  sim.notifyCar(cars[0], cars[1], 10);
  sim.setFlags({ r2Airborne: true, r3Contact: false, c1Pileup: false });
  sim.notifyCar(cars[0], cars[1], 20); sim.preStep(1 / 60);
  assert.equal(sim.status().rejected.belowThreshold, 1);
  assert.equal(sim.status().rejected.disabledKind, 1);
  assert.equal(sim.status().promoted, 0);
  sim.notifyCar(cars[0], cars[1], 30); sim.preStep(1 / 60);
  sim.notifyCar(cars[0], cars[1], 30); sim.preStep(1 / 60);
  assert.equal(sim.status().rejected.ownershipFilter, 2);
  const copy = sim.status().rejected; copy.disabledKind = 99;
  assert.equal(sim.status().rejected.disabledKind, 1);
  sim.reset(); assert.ok(Object.values(sim.status().rejected).every(n => n === 0));
  sim.setFlags({ r2Airborne: false, r3Contact: false, c1Pileup: false });
  sim.notifyCar(cars[0], cars[1], 30);
  assert.equal(sim.status().rejected.inactive, 1);
});

test('failed dynamic promotion is counted per car', () => {
  const { sim, cars } = load({ failPromotion: true });
  sim.notifyCar(cars[0], cars[1], 30); sim.preStep(1 / 60);
  assert.equal(sim.status().rejected.failedPromotion, 2);
  assert.equal(sim.status().promoted, 0);
});

test('takeover and incident caps report the rejected work', () => {
  const { sim, cars } = load();
  while (cars.length < 10) cars.push({ ...cars[0], s: 100 + cars.length });
  for (let i = 1; i < cars.length; i++) sim.notifyCar(cars[i - 1], cars[i], 30);
  sim.preStep(1 / 60);
  assert.equal(sim.status().promoted, 8);
  assert.equal(sim.status().rejected.takeoverCap, 2);
  sim.reset();
  for (let i = 0; i < 5; i++) sim.notifyWall(cars[i], 1, 100);
  sim.preStep(1 / 60);
  assert.equal(sim.status().count, 3);
  assert.equal(sim.status().rejected.incidentCap, 2);
});

// The Rapier pose is intentionally beyond a solid feature but inside wallAt.
// Validate takeover itself, including world writeback, on both lateral sides.
for (const side of [-1, 1]) {
  for (const kind of ["pit-road", "pit-lane", "exit-road", "exit-lane", "post-road", "post-outside"]) {
    test(`takeover uses complete ${kind} boundary (side ${side})`, () => {
      const isExit = kind.startsWith("exit"), isPost = kind.startsWith("post");
      const lane = kind.endsWith("lane") || kind.endsWith("outside");
      const wallLat = isExit ? 11 : 12;
      const input = lane ? wallLat + 0.2 : wallLat - 0.2;
      const expected = isPost ? (lane ? 14 : 10) : lane ? (isExit ? 12.3 : 14) : wallLat - (isExit ? 1.15 : 1.1);
      const pose = { x: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1, vx: 10, vz: 0 };
      const { sim, cars, G } = load({ pose, wallAt: 30,
        trackFrom: () => ({ s: 100, x: side * input }),
        worldFromTrack: (s, x) => ({ x, z: s }),
        postLimits: (_tr, _s, _x, out) => Object.assign(out, {
          r: side > 0 && !lane ? 10 : 30, l: side < 0 && !lane ? 10 : 30,
          minOut: lane ? 14 : 0, side,
        }),
      });
      Object.assign(G.track, { n: 1, hw: [10], posts: isPost ? [{}] : [],
        pit: isPost ? null : { side, painted: false, v: [isExit ? 0.5 : 1], w: [1],
          bands: { verge: 2 }, off: { fastIn: 3 }, sOut: 90, exitRoadM: 30 },
      });
      cars[0].x = side * input;
      sim.notifyWall(cars[0], side, 60);
      sim.preStep(1 / 60);
      assert.equal(sim.owns(cars[0]), true);
      sim.postStep(1 / 60);
      assert.equal(cars[0].x, side * expected);
      assert.equal(cars[0].px, side * expected);
      assert.equal(cars[0].pz, 100);
      assert.equal(sim.owns(cars[0]), true, "boundary correction retains takeover");
      assert.equal(sim.status().fallbacks, 0, "boundary correction is not an anomalous teleport");
    });
  }
}

for (const side of [-1, 1]) for (const lane of [false, true]) {
  test(`takeover retains validated barrier side across raw crossings and moving faces (${side}, lane ${lane})`, () => {
    const pose = { x: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1, vx: 18, vz: 0 };
    let s = 100, rawX = lane ? 14 : 11.9;
    const { sim, cars, G } = load({ pose, wallAt: 30,
      trackFrom: () => ({ s, x: side * rawX }), worldFromTrack: (s, x) => ({ x, z: s }),
    });
    const p = { side, painted: false, v: [1, 1, 0, 0], w: [1, 1, 0, 0],
      bands: { verge: 2 }, off: { fastIn: 3 }, sOut: 0, exitRoadM: 200 };
    Object.assign(G.track, { total: 400, n: 4, hw: [10, 10, 10, 10], pit: p, posts: [] });
    Object.assign(cars[0], { s, x: side * (lane ? 14 : 10.5) });
    sim.notifyWall(cars[0], side, 60); sim.preStep(1 / 60);
    for (rawX of lane ? [12.2, 11.9, 10, 15] : [11.9, 12.2, 15, 13]) {
      sim.postStep(1 / 60);
      assert.equal(cars[0].x, side * (lane ? Math.max(rawX, 14) : 10.9));
      assert.equal(sim.owns(cars[0]), true);
    }
    // The exit face recedes beneath the old road-side x: using that x against
    // the NEW face would wrongly turn the road-side car into a lane-side car.
    p.v[0] = 0.1; s = 0;
    rawX = lane ? 9 : 13;
    sim.postStep(1 / 60);
    assert.equal(cars[0].x, side * (lane ? 11.5 : 10.2 - 1.15), "moving exit uses previous face for side and current face for clearance");
    rawX = lane ? 9 : 13;
    sim.postStep(1 / 60);
    assert.equal(cars[0].x, side * (lane ? 11.5 : 10.2 - 1.15));
    s = 200; rawX = lane ? 9 : 13;
    sim.postStep(1 / 60);
    assert.equal(cars[0].x, side * rawX, "legal opening permits lateral movement");
    assert.equal(sim.status().fallbacks, 0);
  });
}

for (const side of [-1, 1]) for (const outside of [false, true]) {
  test(`takeover cannot swap sides through a gantry footprint (${side}, outside ${outside})`, () => {
    const pose = { x: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1, vx: 18, vz: 0 };
    let rawX = outside ? 11 : 13;
    const { sim, cars, G } = load({ pose, wallAt: 30,
      trackFrom: () => ({ s: 100, x: side * rawX }), worldFromTrack: (s, x) => ({ x, z: s }),
      postLimits: (_t, _s, x, out) => Object.assign(out, {
        r: side > 0 && x * side < 12 ? 10 : 30,
        l: side < 0 && x * side < 12 ? 10 : 30,
        minOut: x * side >= 12 ? 14 : 0, side,
      }),
    });
    G.track.posts = [{}];
    cars[0].x = side * (outside ? 14 : 10);
    sim.notifyWall(cars[0], side, 60); sim.preStep(1 / 60);
    for (let tick = 0; tick < 5; tick++) {
      rawX = outside ? 11 - tick * 0.2 : 13 + tick * 0.2;
      sim.postStep(1 / 60);
      assert.equal(cars[0].x, side * (outside ? 14 : 10));
      assert.equal(sim.owns(cars[0]), true);
    }
    assert.equal(sim.status().fallbacks, 0);
  });
}

/* ── the ANOMALY handback shares the settled one's speed floor (#2167) ──────
 * The degrade path restores the last validated snapshot, whose speed is
 * Rapier's signed forward velocity — negative for a car shunted backwards. It
 * restored it raw, so an anomaly (worldGen change, teleport guard, finish,
 * reset()) could hand a car back reversing at full roll speed. Same floor as
 * the settled path: REVERSE_MAX for a human, 0 for an AI (it moves on s).
 */
for (const [label, trip] of [
  ["reset()", (sim) => sim.reset()],
  ["finished mid-takeover", (sim, cars) => { cars[0].finished = cars[1].finished = true; sim.postStep(1 / 60); }],
]) {
  for (const human of [false, true]) {
    test(`anomaly handback via ${label} never returns a ${human ? "human" : "AI"} reversing at speed`, () => {
      const pose = { x: 0, z: 0, qx: 0, qy: 0, qz: 0, qw: 1, vx: 0, vz: -20 };
      const { sim, cars } = load({ pose });
      cars[0].human = human;
      sim.notifyCar(cars[0], cars[1], 30);
      sim.preStep(1 / 60);
      sim.postStep(1 / 60);                       // one validated pose at -20 m/s
      assert.equal(sim.status().owned, 2, "still owned after a valid tick");
      assert.ok(cars[0].speed < -19, `validated pose carried the backward roll (${cars[0].speed})`);
      trip(sim, cars);
      assert.equal(sim.status().owned, 0, "handed back");
      assert.ok(cars[0].speed >= -5, `>= REVERSE_MAX (got ${cars[0].speed})`);
      if (!human) assert.ok(cars[0].speed >= 0, `an AI never reverses (got ${cars[0].speed})`);
    });
  }
}


function queueCluster(sim, cars, first, end) {
  for (let i = first; i + 1 < end; i++) sim.notifyCar(cars[i], cars[i + 1], 20);
}

test("the takeover budget is global across three disjoint clusters of a 22-car field", () => {
  const { sim, cars, promoted } = load({ count: 22 });
  const deniedBefore = cars.slice(8).map(c => ({ ...c }));
  queueCluster(sim, cars, 0, 8);
  queueCluster(sim, cars, 8, 16);
  queueCluster(sim, cars, 16, 22);
  sim.preStep(1 / 60);
  assert.equal(sim.status().owned, 8);
  assert.equal(sim.status().rejected.takeoverCap, 14, "all remaining eligible cars are denied by the shared budget");
  assert.deepEqual(promoted, [0, 1, 2, 3, 4, 5, 6, 7], "queue order deterministically receives the budget");
  assert.deepEqual(cars.slice(8), deniedBefore, "denied cars retain their normal driving state");
  assert.ok(cars.slice(8).every(c => !sim.owns(c)));
});

test("existing cluster takeovers share the budget with wall strikes and release returns a slot", () => {
  const { sim, cars, promoted } = load({ count: 10 });
  queueCluster(sim, cars, 0, 4);
  sim.preStep(1 / 60);
  queueCluster(sim, cars, 4, 8);
  sim.notifyWall(cars[8], 1, 100);
  sim.preStep(1 / 60);
  assert.equal(sim.status().owned, 8);
  assert.equal(sim.owns(cars[8]), false, "the wall path cannot exceed the cluster budget");
  assert.equal(sim.status().rejected.takeoverCap, 1, "the full shared budget rejects the wall attempt");
  assert.equal(sim.release(cars[0]), true);
  assert.equal(sim.status().owned, 7);
  sim.notifyWall(cars[8], 1, 100);
  sim.notifyWall(cars[9], 1, 100);
  sim.preStep(1 / 60);
  assert.equal(sim.status().owned, 8);
  assert.equal(sim.owns(cars[8]), true, "a released slot is reusable in the same world");
  assert.equal(sim.owns(cars[9]), false);
  assert.equal(sim.status().rejected.incidentCap, 1, "incident-count rejection retains its existing precedence");
  assert.deepEqual(promoted, [0, 1, 2, 3, 4, 5, 6, 7, 8]);
});

test("failed promotions do not consume slots or hide later cars behind a per-cluster slice", () => {
  const attempts = [];
  const { sim, cars, promoted } = load({ count: 12, promote: i => { attempts.push(i); if (i === 1) throw new Error("body unavailable"); return i !== 0; } });
  queueCluster(sim, cars, 0, 12);
  sim.preStep(1 / 60);
  assert.equal(sim.status().owned, 8);
  assert.equal(sim.status().rejected.failedPromotion, 2, "false and throwing body creation retain failure diagnostics");
  assert.equal(sim.status().rejected.takeoverCap, 2, "only the two remaining eligible candidates are budget rejections");
  assert.deepEqual(promoted, [2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(attempts, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.ok([0, 1, 10, 11].every(i => !sim.owns(cars[i]) && !cars[i].incidentInvalidLap));
});

test("a world-generation handback frees the full budget for the replacement world", () => {
  let generation = 1;
  const { sim, cars, promoted } = load({ count: 16, worldGen: () => generation });
  queueCluster(sim, cars, 0, 8);
  sim.preStep(1 / 60);
  assert.equal(sim.status().owned, 8);
  generation++;
  sim.postStep(1 / 60);
  assert.equal(sim.status().owned, 0);
  assert.equal(sim.status().fallbacks, 8, "old-world cars complete their anomaly handback");
  queueCluster(sim, cars, 8, 16);
  sim.preStep(1 / 60);
  assert.equal(sim.status().owned, 8);
  assert.deepEqual(promoted, Array.from({ length: 16 }, (_, i) => i));
});
