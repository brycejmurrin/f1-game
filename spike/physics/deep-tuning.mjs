#!/usr/bin/env node
// deep-tuning.mjs — Rapier DynamicRayCastVehicleController tuning deep-dive.
//
// Question 1 of the deep-dive (see DEEP-DIVE.md): is the ~2x understeer the
// baseline eval measured (35.1 m vs 16.3 m kinematic at 57 km/h) fixable by
// tuning, and is the missing friction ellipse structural?
//
//   a. grid-search setWheelFrictionSlip x setWheelSideFrictionStiffness
//      (x suspension stiffness / CoM height for the finalists) on a FLAT
//      plane collider — isolates tyres from road banking/camber — measuring
//      steady-state turn radius at ~57 km/h with 0.2 rad lock, plus solver
//      artifacts (yaw-rate std, rollover, non-finite).
//   b. trail-braking probe: steady 0.2 rad corner @ ~60 km/h, then brake
//      mid-corner for 1 s at several levels. The bespoke model's friction
//      ellipse makes moderate braking RAISE yaw rate (car rotates into the
//      corner) and hard braking widen the line. Measures Rapier's response.
//   c. load-sensitivity: same corner with stiff vs soft suspension and with
//      doubled chassis mass; also reads wheelSideImpulse / suspensionForce
//      per wheel to see whether the side-impulse clamp scales with load.
//
// Usage: node spike/physics/deep-tuning.mjs      (pure Node, no browser)

import RAPIER from "../../vendor/rapier-0.19.3/rapier.mjs";

await RAPIER.init({});

const DT = 1 / 60;
const WHEELBASE = 3.3;                       // frontZ 1.7 + rearZ 1.6
const STEER = 0.2;                           // rad, front lock used throughout
const KIN_R = WHEELBASE / Math.tan(STEER);   // 16.28 m kinematic reference

console.log(`Rapier ${RAPIER.version()} | flat-plane tuning sweep`);
console.log(`kinematic reference radius: wheelbase/tan(0.2) = ${KIN_R.toFixed(1)} m\n`);

// ── car description (same footprint as rapier-eval.mjs) ─────────────────────

const CAR = {
  mass: 798,
  half: { x: 0.75, y: 0.25, z: 2.0 },
  wheels: [
    { x:  0.75, y: -0.10, z:  1.7 },   // FL
    { x: -0.75, y: -0.10, z:  1.7 },   // FR
    { x:  0.75, y: -0.10, z: -1.6 },   // RL
    { x: -0.75, y: -0.10, z: -1.6 },   // RR
  ],
  suspRest: 0.15,
  wheelR: 0.34,
};

function makeWorld() {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = DT;
  // Flat plane: 4 km x 4 km cuboid, top surface at y = 0.
  const ground = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -1, 0));
  world.createCollider(RAPIER.ColliderDesc.cuboid(2000, 1, 2000).setFriction(1.0), ground);
  return world;
}

// o: { frictionSlip, sideStiff, suspK, mass, comY }
// comY: optional CoM offset (chassis-local y) — used to test whether the best
// tyre tune is rollover-limited by the default CoM height.
function makeCar(world, o) {
  const mass = o.mass ?? CAR.mass;
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 0.8, 0).setCanSleep(false));
  let desc = RAPIER.ColliderDesc.cuboid(CAR.half.x, CAR.half.y, CAR.half.z).setFriction(0.6);
  if (o.comY !== undefined) {
    // Cuboid principal inertia about its own CoM, full extents (1.5, 0.5, 4.0).
    const ex = 1.5, ey = 0.5, ez = 4.0;
    desc = desc.setMassProperties(mass,
      { x: 0, y: o.comY, z: 0 },
      { x: mass / 12 * (ey * ey + ez * ez),
        y: mass / 12 * (ex * ex + ez * ez),
        z: mass / 12 * (ex * ex + ey * ey) },
      { x: 0, y: 0, z: 0, w: 1 });
  } else {
    desc = desc.setMass(mass);
  }
  const collider = world.createCollider(desc, body);
  const veh = world.createVehicleController(body);
  const down = { x: 0, y: -1, z: 0 }, axle = { x: -1, y: 0, z: 0 };
  const suspK = o.suspK ?? 50;
  for (const w of CAR.wheels) {
    const i = veh.numWheels();
    veh.addWheel(w, down, axle, CAR.suspRest, CAR.wheelR);
    veh.setWheelSuspensionStiffness(i, suspK);
    veh.setWheelSuspensionCompression(i, 0.5 * 2 * Math.sqrt(suspK));
    veh.setWheelSuspensionRelaxation(i, 0.6 * 2 * Math.sqrt(suspK));
    veh.setWheelMaxSuspensionForce(i, 1e5);
    veh.setWheelFrictionSlip(i, o.frictionSlip);
    veh.setWheelSideFrictionStiffness(i, o.sideStiff);
  }
  const notChassis = (c) => c.handle !== collider.handle;
  const step = () => { veh.updateVehicle(DT, undefined, undefined, notChassis); world.step(); };
  return { body, veh, step };
}

// ── shared telemetry helpers ─────────────────────────────────────────────────

function yawOf(r) {
  return Math.atan2(2 * (r.w * r.y + r.x * r.z), 1 - 2 * (r.y * r.y + r.x * r.x));
}
function upY(r) {  // world-y component of the body's local up axis
  return 1 - 2 * (r.x * r.x + r.z * r.z);
}
function fwdOf(r) { // body local +Z in world
  return { x: 2 * (r.x * r.z + r.w * r.y), y: 2 * (r.y * r.z - r.w * r.x),
           z: 1 - 2 * (r.x * r.x + r.y * r.y) };
}
function fwdSpeed(body) {
  const v = body.linvel(), f = fwdOf(body.rotation());
  return v.x * f.x + v.y * f.y + v.z * f.z;
}

// Rear-axle P-controller holding a target forward speed (isolates the radius
// measurement from drive-force choice; clamped so it can't dominate the tyres).
function holdSpeed(veh, body, vTarget, maxN = 4000) {
  const f = Math.max(-maxN, Math.min(maxN, 800 * (vTarget - fwdSpeed(body))));
  veh.setWheelEngineForce(2, f);
  veh.setWheelEngineForce(3, f);
}

// ── a. steady-state cornering run ────────────────────────────────────────────
// settle 1 s -> straight-line speed hold 5 s -> steer 0.2 rad 8 s (speed held).
// Measured over the final 2 s: mean speed, mean |yaw rate|, radius = v/w,
// yaw-rate std (oscillation), min up.y (rollover), non-finite count.

function cornerRun(o, vTarget = 16) {
  const world = makeWorld();
  const car = makeCar(world, o);
  const SETTLE = 60, STRAIGHT = 300, TURN = 480, MEASURE = 120;
  const wSamples = [], vSamples = [];
  let minUp = Infinity, bad = 0;
  for (let i = 0; i < SETTLE + STRAIGHT + TURN; i++) {
    if (i < SETTLE) { car.veh.setWheelEngineForce(2, 0); car.veh.setWheelEngineForce(3, 0); }
    else holdSpeed(car.veh, car.body, vTarget);
    const steer = i >= SETTLE + STRAIGHT ? STEER : 0;
    car.veh.setWheelSteering(0, steer);
    car.veh.setWheelSteering(1, steer);
    car.step();
    const p = car.body.translation(), r = car.body.rotation();
    if (!Number.isFinite(p.x + p.y + p.z)) { bad++; continue; }
    if (i >= SETTLE) minUp = Math.min(minUp, upY(r));
    if (i >= SETTLE + STRAIGHT + TURN - MEASURE) {
      const lv = car.body.linvel();
      wSamples.push(Math.abs(car.body.angvel().y));
      vSamples.push(Math.hypot(lv.x, lv.z));
    }
  }
  world.free();
  const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  const vM = mean(vSamples), wM = mean(wSamples);
  const wStd = Math.sqrt(mean(wSamples.map((x) => (x - wM) ** 2)));
  return {
    v: vM, w: wM, radius: wM > 1e-4 ? vM / wM : Infinity,
    wStdPct: wM > 1e-4 ? 100 * wStd / wM : 0,
    minUp, rolled: minUp < 0.5, bad,
  };
}

console.log("[a] grid sweep: frictionSlip x sideFrictionStiffness, flat plane,");
console.log(`    0.2 rad lock, speed held at 16 m/s (57.6 km/h). radius vs kinematic ${KIN_R.toFixed(1)} m.`);
console.log("    fSlip  sideK |  v km/h  yawRate  radius m  w-std%  minUp  flags");

const FS = [10.5, 21, 42, 84];
const SS = [0.5, 1, 2, 4];
const grid = [];
for (const fs of FS) {
  for (const ss of SS) {
    const r = cornerRun({ frictionSlip: fs, sideStiff: ss });
    grid.push({ fs, ss, ...r });
    const flags = [r.rolled ? "ROLLOVER" : "", r.wStdPct > 5 ? "OSC" : "", r.bad ? "NaN" : ""]
      .filter(Boolean).join(",") || "-";
    console.log(`    ${String(fs).padStart(5)}  ${String(ss).padStart(5)} |` +
      `  ${(r.v * 3.6).toFixed(1).padStart(6)}  ${r.w.toFixed(3).padStart(7)}` +
      `  ${r.radius === Infinity ? "     inf" : r.radius.toFixed(1).padStart(8)}` +
      `  ${r.wStdPct.toFixed(1).padStart(6)}  ${r.minUp.toFixed(2).padStart(5)}  ${flags}`);
  }
}

// Best clean tune = smallest radius without rollover/oscillation/NaN.
const clean = grid.filter((g) => !g.rolled && g.wStdPct <= 5 && !g.bad);
const best = (clean.length ? clean : grid).reduce((a, b) => (b.radius < a.radius ? b : a));
console.log(`\n    best clean tune: frictionSlip=${best.fs} sideStiff=${best.ss}` +
  ` -> radius ${best.radius.toFixed(1)} m (${(best.radius / KIN_R).toFixed(2)}x kinematic)`);

console.log("\n[a2] finalists with suspension stiffness / CoM variations:");
console.log("    variant                                  |  radius m  w-std%  minUp  flags");
const variants = [
  { label: "best tune, suspK 100 (stiff)", o: { frictionSlip: best.fs, sideStiff: best.ss, suspK: 100 } },
  { label: "best tune, suspK 200 (very stiff)", o: { frictionSlip: best.fs, sideStiff: best.ss, suspK: 200 } },
  { label: "best tune, CoM lowered 0.30 m", o: { frictionSlip: best.fs, sideStiff: best.ss, comY: -0.30 } },
  { label: "fSlip 84 sideK 4, CoM lowered 0.30 m", o: { frictionSlip: 84, sideStiff: 4, comY: -0.30 } },
  { label: "fSlip 42 sideK 2, CoM lowered 0.30 m", o: { frictionSlip: 42, sideStiff: 2, comY: -0.30 } },
];
let bestOverall = { radius: best.radius, o: { frictionSlip: best.fs, sideStiff: best.ss }, label: "grid best" };
for (const v of variants) {
  const r = cornerRun(v.o);
  const flags = [r.rolled ? "ROLLOVER" : "", r.wStdPct > 5 ? "OSC" : "", r.bad ? "NaN" : ""]
    .filter(Boolean).join(",") || "-";
  console.log(`    ${v.label.padEnd(40)} |  ${r.radius === Infinity ? "     inf" : r.radius.toFixed(1).padStart(8)}` +
    `  ${r.wStdPct.toFixed(1).padStart(6)}  ${r.minUp.toFixed(2).padStart(5)}  ${flags}`);
  if (!r.rolled && r.wStdPct <= 5 && !r.bad && r.radius < bestOverall.radius) {
    bestOverall = { radius: r.radius, o: v.o, label: v.label };
  }
}
console.log(`\n    best overall: ${bestOverall.label} -> ${bestOverall.radius.toFixed(1)} m` +
  ` (${(bestOverall.radius / KIN_R).toFixed(2)}x kinematic ${KIN_R.toFixed(1)} m)`);

// ── a3. reconciling the baseline's 35.1 m: transient response + speed sweep ─
// The baseline eval measured radius 1 s into the steer on the ROAD and got
// 35.1 m. Probe 1: same 1 s-in measurement on the flat plane — how slow is the
// yaw-rate rise? Probe 2: steady-state radius vs speed — below what lateral
// acceleration is the model exactly kinematic (rigid tyres, clamp not hit)?

console.log("\n[a3] transient: yaw-rate rise after steer step (best tune, 16 m/s):");
{
  const world = makeWorld();
  const car = makeCar(world, bestOverall.o);
  const SETTLE = 60, STRAIGHT = 300;
  const marks = [0.25, 0.5, 1.0, 1.5, 2.0, 3.0, 4.0];
  for (let i = 0; i < SETTLE + STRAIGHT + 300; i++) {
    if (i < SETTLE) { car.veh.setWheelEngineForce(2, 0); car.veh.setWheelEngineForce(3, 0); }
    else holdSpeed(car.veh, car.body, 16);
    const steer = i >= SETTLE + STRAIGHT ? STEER : 0;
    car.veh.setWheelSteering(0, steer); car.veh.setWheelSteering(1, steer);
    car.step();
    const tIn = (i - (SETTLE + STRAIGHT) + 1) * DT;
    const m = marks.find((t) => Math.abs(tIn - t) < DT / 2);
    if (m !== undefined) {
      const lv = car.body.linvel(), v = Math.hypot(lv.x, lv.z);
      const w = Math.abs(car.body.angvel().y);
      console.log(`    t+${m.toFixed(2)}s  v=${(v * 3.6).toFixed(1)} km/h  ` +
        `yawRate=${w.toFixed(3)}  radius=${w > 1e-4 ? (v / w).toFixed(1) : "inf"} m`);
    }
  }
  world.free();
}

console.log("\n[a3] steady radius vs speed (best tune) — where do the tyres saturate?");
console.log("    target m/s |  v km/h  radius m  latAcc  w-std%  flags");
for (const vt of [12, 16, 20, 24, 28]) {
  const r = cornerRun(bestOverall.o, vt);
  const acc = r.radius === Infinity ? 0 : (r.v * r.v) / r.radius;
  const flags = [r.rolled ? "ROLLOVER" : "", r.wStdPct > 5 ? "OSC" : ""].filter(Boolean).join(",") || "-";
  console.log(`    ${String(vt).padStart(10)} |  ${(r.v * 3.6).toFixed(1).padStart(6)}` +
    `  ${r.radius === Infinity ? "     inf" : r.radius.toFixed(1).padStart(8)}` +
    `  ${acc.toFixed(1).padStart(6)}  ${r.wStdPct.toFixed(1).padStart(6)}  ${flags}`);
}

// ── a4. where IS the grip limit? low-frictionSlip sweep ─────────────────────
// frictionSlip acts as a friction coefficient on the load-scaled side-impulse
// clamp (~ frictionSlip * suspForce * dt). At the Bullet default 10.5 that is
// mu ~= 10.5 — never reached on flat ground, so the car is kinematic ("on
// rails") at any sane speed. Realistic grip limits need frictionSlip ~1-3.

console.log("\n[a4] low-frictionSlip sweep (sideStiff 1.0, default CoM) — grip limit:");
console.log("    fSlip | @16 m/s: radius latAcc  | @24 m/s: radius latAcc  flags");
const lowFs = [];
for (const fs of [1.0, 1.5, 2.0, 3.0, 5.0]) {
  const o = { frictionSlip: fs, sideStiff: 1.0 };
  const r16 = cornerRun(o, 16), r24 = cornerRun(o, 24);
  lowFs.push({ fs, r16, r24 });
  const acc = (r) => (r.radius === Infinity ? 0 : (r.v * r.v) / r.radius);
  const fl = (r) => [r.rolled ? "ROLL" : "", r.wStdPct > 5 ? "OSC" : ""].filter(Boolean).join(",");
  console.log(`    ${String(fs).padStart(5)} |  ${r16.radius.toFixed(1).padStart(6)}` +
    `  ${acc(r16).toFixed(1).padStart(5)} ${fl(r16).padEnd(6)}` +
    ` |  ${r24.radius === Infinity ? "   inf" : r24.radius.toFixed(1).padStart(6)}` +
    `  ${acc(r24).toFixed(1).padStart(5)}  ${fl(r24) || "-"}`);
}

// ── a5. reconcile the baseline's 35.1 m — replicate the eval ON THE ROAD ────
// Same config as rapier-eval.mjs (frictionSlip 10.5, sideStiff 1.0, default
// CoM, fixed 1800 N rear force, steer 0.2 at t=4 s) on the real Singapore
// trimesh, logging wheel ground contact at the eval's measurement instant
// (1 s into the steer). If wheels are already leaving the road edge there,
// the baseline's "2x understeer" was a measurement artifact, not tyre grip.

console.log("\n[a5] baseline replication on the Singapore road trimesh:");
try {
  const fs = await import("node:fs");
  const geo = JSON.parse(fs.readFileSync(
    new URL("./geometry-singapore.json", import.meta.url), "utf8"));
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = DT;
  const roadBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  world.createCollider(RAPIER.ColliderDesc.trimesh(
    new Float32Array(geo.road.pos), new Uint32Array(geo.road.idx),
    RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES).setFriction(1.0), roadBody);
  const Cn = geo.centre, Nn = geo.n;
  const yaw0 = Math.atan2(Cn.tx[0], Cn.tz[0]);
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(Cn.px[0], Cn.py[0] + 0.8, Cn.pz[0])
    .setRotation({ x: 0, y: Math.sin(yaw0 / 2), z: 0, w: Math.cos(yaw0 / 2) })
    .setCanSleep(false));
  const col = world.createCollider(
    RAPIER.ColliderDesc.cuboid(CAR.half.x, CAR.half.y, CAR.half.z)
      .setMass(CAR.mass).setFriction(0.6), body);
  const veh = world.createVehicleController(body);
  const down = { x: 0, y: -1, z: 0 }, axle = { x: -1, y: 0, z: 0 };
  for (const w of CAR.wheels) {
    const i = veh.numWheels();
    veh.addWheel(w, down, axle, CAR.suspRest, CAR.wheelR);
    veh.setWheelSuspensionStiffness(i, 50);
    veh.setWheelSuspensionCompression(i, 7.0);
    veh.setWheelSuspensionRelaxation(i, 8.5);
    veh.setWheelMaxSuspensionForce(i, 1e5);
    veh.setWheelFrictionSlip(i, 10.5);
  }
  const notChassis = (c) => c.handle !== col.handle;
  const nearest = (x, z) => {
    let b = 0, bd = Infinity;
    for (let i = 0; i < Nn; i++) {
      const dx = Cn.px[i] - x, dz = Cn.pz[i] - z, d = dx * dx + dz * dz;
      if (d < bd) { bd = d; b = i; }
    }
    return b;
  };
  for (let i = 0; i < 60 + 180 + 61; i++) {          // eval's schedule to t=5.02 s
    const driving = i >= 60;
    veh.setWheelEngineForce(2, driving ? 1800 : 0);
    veh.setWheelEngineForce(3, driving ? 1800 : 0);
    const steer = i >= 240 ? 0.2 : 0;
    veh.setWheelSteering(0, steer); veh.setWheelSteering(1, steer);
    veh.updateVehicle(DT, undefined, undefined, notChassis);
    world.step();
    if (i === 240 + 60) {                             // the eval's measurement instant
      const p = body.translation(), lv = body.linvel();
      const v = Math.hypot(lv.x, lv.y, lv.z), w = Math.abs(body.angvel().y);
      const ni = nearest(p.x, p.z);
      const lat = Math.hypot(Cn.px[ni] - p.x, Cn.pz[ni] - p.z);
      const contacts = [0, 1, 2, 3].map((k) => (veh.wheelIsInContact(k) ? "Y" : "n")).join("");
      console.log(`    at eval's instant (1 s into steer): v=${(v * 3.6).toFixed(1)} km/h` +
        `  yawRate=${w.toFixed(3)}  radius=${(v / w).toFixed(1)} m`);
      console.log(`    lateral offset ${lat.toFixed(1)} m vs half-width ${Cn.hw[ni].toFixed(1)} m` +
        ` | wheel contact FL FR RL RR = ${contacts}`);
    }
  }
  world.free();
} catch (e) {
  console.log(`    (skipped: ${e.message} — run build-geometry.cjs singapore first)`);
}

// ── b0. brake calibration (straight line) ───────────────────────────────────
// setWheelBrake units are Bullet-style opaque; calibrate value -> decel at the
// best tune so "50% brake" means something physical.

function brakeDecel(tune, brakeVal) {
  const world = makeWorld();
  const car = makeCar(world, tune);
  const V0 = 16.7;
  for (let i = 0; i < 60 + 360; i++) {           // settle + get to speed
    if (i < 60) { car.veh.setWheelEngineForce(2, 0); car.veh.setWheelEngineForce(3, 0); }
    else holdSpeed(car.veh, car.body, V0, 8000);
    car.step();
  }
  const v0 = fwdSpeed(car.body);
  const BRAKE_STEPS = 45;                        // 0.75 s
  for (let i = 0; i < BRAKE_STEPS; i++) {
    car.veh.setWheelEngineForce(2, 0); car.veh.setWheelEngineForce(3, 0);
    for (let wI = 0; wI < 4; wI++) car.veh.setWheelBrake(wI, brakeVal);
    car.step();
  }
  const v1 = fwdSpeed(car.body);
  world.free();
  return (v0 - v1) / (BRAKE_STEPS * DT);
}

console.log("\n[b0] brake calibration (straight line, best tune, 16.7 m/s):");
const brakeSweep = [2, 5, 10, 20, 40, 80];
const decels = {};
for (const b of brakeSweep) {
  decels[b] = brakeDecel(bestOverall.o, b);
  console.log(`    setWheelBrake ${String(b).padStart(3)} -> decel ${decels[b].toFixed(1)} m/s^2`);
}
// "hard brake" reference: bespoke BRAKE = 22 m/s^2, LONG_GRIP = 34 m/s^2.
// Pick the smallest sweep value achieving >= 15 m/s^2 as "100%", else the max.
let B100 = brakeSweep[brakeSweep.length - 1];
for (const b of brakeSweep) if (decels[b] >= 15) { B100 = b; break; }
console.log(`    chosen "100%" brake value: ${B100} (${decels[B100].toFixed(1)} m/s^2)`);

// ── b. trail-braking probe ───────────────────────────────────────────────────
// Steady 0.2 rad corner at ~60 km/h, then 1 s of braking mid-corner.
// Bespoke friction-ellipse behaviour: moderate brake -> yaw rate RISES
// (rotation into the corner, radius tightens); hard brake -> line widens.

function trailBrake(tune, brakeVal, label) {
  const world = makeWorld();
  const car = makeCar(world, tune);
  const V0 = 16.7;                                // 60 km/h
  const SETTLE = 60, STRAIGHT = 300, CORNER = 300; // 5 s corner -> steady
  const BRAKE_STEPS = 60;                          // 1 s brake window
  const base = { w: [], v: [] }, brk = [];
  for (let i = 0; i < SETTLE + STRAIGHT + CORNER + BRAKE_STEPS; i++) {
    const braking = i >= SETTLE + STRAIGHT + CORNER;
    if (i < SETTLE || braking) {
      car.veh.setWheelEngineForce(2, 0); car.veh.setWheelEngineForce(3, 0);
    } else {
      holdSpeed(car.veh, car.body, V0);
    }
    for (let wI = 0; wI < 4; wI++) car.veh.setWheelBrake(wI, braking ? brakeVal : 0);
    car.veh.setWheelSteering(0, STEER); car.veh.setWheelSteering(1, STEER);
    if (i < SETTLE + STRAIGHT) { car.veh.setWheelSteering(0, 0); car.veh.setWheelSteering(1, 0); }
    car.step();
    const lv = car.body.linvel(), w = Math.abs(car.body.angvel().y);
    const v = Math.hypot(lv.x, lv.z);
    // drift angle = |velocity direction - heading| (deg), spin detector
    const f = fwdOf(car.body.rotation());
    let drift = 0;
    if (v > 0.5) {
      const dot = (lv.x * f.x + lv.z * f.z) / (v * Math.hypot(f.x, f.z));
      drift = Math.acos(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI;
    }
    if (i >= SETTLE + STRAIGHT + CORNER - 60 && !braking) { base.w.push(w); base.v.push(v); }
    if (braking) brk.push({ t: (i - (SETTLE + STRAIGHT + CORNER) + 1) * DT, w, v, drift });
  }
  world.free();
  const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  const w0 = mean(base.w), v0 = mean(base.v), r0 = v0 / w0;
  // Report the mid-window (0.25-0.75 s) so entry/exit transients don't mask
  // the steady response.
  const mid = brk.filter((s) => s.t >= 0.25 && s.t <= 0.75);
  const wB = mean(mid.map((s) => s.w)), vB = mean(mid.map((s) => s.v));
  const rB = wB > 1e-4 ? vB / wB : Infinity;
  const wPeak = Math.max(...brk.map((s) => s.w));
  const driftEnd = brk[brk.length - 1].drift;
  const yawTotal = brk.reduce((s, x) => s + x.w * DT, 0) * 180 / Math.PI;
  const wAt = (t) => brk.reduce((a, s) => (Math.abs(s.t - t) < Math.abs(a.t - t) ? s : a)).w;
  console.log(`    ${label.padEnd(26)} baseline w=${w0.toFixed(3)} r=${r0.toFixed(1)} m |` +
    ` during brake: w=${wB.toFixed(3)} (${(100 * wB / w0 - 100).toFixed(0)}%)` +
    ` peak w=${wPeak.toFixed(3)} v=${(vB * 3.6).toFixed(1)} km/h r=${rB === Infinity ? "inf" : rB.toFixed(1)} m`);
  console.log(`    ${"".padEnd(26)} w(t)=[${[0.25, 0.5, 0.75, 1.0].map((t) => wAt(t).toFixed(2)).join(", ")}]` +
    `  yaw swept ${yawTotal.toFixed(0)} deg  drift@end ${driftEnd.toFixed(0)} deg${
      driftEnd > 45 ? "  << SPIN" : ""}`);
  return { w0, r0, wB, rB, wPeak, driftEnd, yawTotal,
           decel: (v0 - brk[brk.length - 1].v) / (BRAKE_STEPS * DT) };
}

console.log("\n[b] trail-braking probe (best tune, steady 0.2 rad corner @ 60 km/h,");
console.log("    1 s brake mid-corner; friction ellipse would RAISE yaw rate at 50%):");
const tb = {
  coast: trailBrake(bestOverall.o, 0, "coast (engine cut)"),
  b25:   trailBrake(bestOverall.o, B100 * 0.25, `25% brake (${(B100 * 0.25).toFixed(1)})`),
  b50:   trailBrake(bestOverall.o, B100 * 0.5, `50% brake (${(B100 * 0.5).toFixed(1)})`),
  b100:  trailBrake(bestOverall.o, B100, `100% brake (${B100})`),
};
const anyRise = [tb.b25, tb.b50].some((r) => r.wB > r.w0 * 1.05 || r.wPeak > r.w0 * 1.10);
console.log(`    friction-ellipse signature (yaw rate rises >5% under partial brake): ${
  anyRise ? "PRESENT" : "ABSENT"}`);

// Repeat at a NEAR-LIMIT tune (tyres close to saturation in this corner), the
// regime where a friction ellipse would matter most: lat ~15.3 m/s^2 needs
// mu ~1.6, so frictionSlip 1.8 puts the tyres at ~90% of their clamp.
console.log("\n[b2] trail-braking at a near-limit tune (frictionSlip 1.8, sideStiff 1):");
const nearLimit = { frictionSlip: 1.8, sideStiff: 1.0 };
const tb2 = {
  coast: trailBrake(nearLimit, 0, "coast (engine cut)"),
  b25:   trailBrake(nearLimit, B100 * 0.25, `25% brake (${(B100 * 0.25).toFixed(1)})`),
  b50:   trailBrake(nearLimit, B100 * 0.5, `50% brake (${(B100 * 0.5).toFixed(1)})`),
  b100:  trailBrake(nearLimit, B100, `100% brake (${B100})`),
};
const anyRise2 = [tb2.b25, tb2.b50].some((r) => r.wB > r.w0 * 1.05 || r.wPeak > r.w0 * 1.10);
console.log(`    friction-ellipse signature at the limit: ${anyRise2 ? "PRESENT" : "ABSENT"}`);

// ── c. load-sensitivity probe ────────────────────────────────────────────────

console.log("\n[c] load sensitivity — same corner, best tyre tune:");
console.log("    variant                        |  radius m   latAcc m/s^2");
const loadRuns = [
  { label: "mass 798, suspK 50 (baseline)", o: { ...bestOverall.o } },
  { label: "mass 798, suspK 200 (stiff)", o: { ...bestOverall.o, suspK: 200 } },
  { label: "mass 1596 (2x), suspK 50", o: { ...bestOverall.o, mass: 1596 } },
  { label: "mass 1596 (2x), suspK 100", o: { ...bestOverall.o, mass: 1596, suspK: 100 } },
];
for (const v of loadRuns) {
  const r = cornerRun(v.o);
  const acc = r.radius === Infinity ? 0 : (r.v * r.v) / r.radius;
  const flags = [r.rolled ? " ROLLOVER" : "", r.wStdPct > 5 ? " OSC" : ""].join("");
  console.log(`    ${v.label.padEnd(30)} |  ${r.radius === Infinity ? "     inf" : r.radius.toFixed(1).padStart(8)}` +
    `   ${acc.toFixed(1).padStart(6)}${flags}`);
}

// Per-wheel clamp inspection: steady corner, read side impulse vs suspension
// force per wheel — does the lateral clamp scale with instantaneous load?
console.log("\n    per-wheel side impulse vs suspension force in the steady corner");
console.log("    (does the clamp scale with load?):");
{
  const world = makeWorld();
  const car = makeCar(world, bestOverall.o);
  const SETTLE = 60, STRAIGHT = 300, TURN = 480, MEASURE = 120;
  const susp = [0, 0, 0, 0], side = [0, 0, 0, 0];
  let n = 0;
  for (let i = 0; i < SETTLE + STRAIGHT + TURN; i++) {
    if (i < SETTLE) { car.veh.setWheelEngineForce(2, 0); car.veh.setWheelEngineForce(3, 0); }
    else holdSpeed(car.veh, car.body, 16);
    const steer = i >= SETTLE + STRAIGHT ? STEER : 0;
    car.veh.setWheelSteering(0, steer); car.veh.setWheelSteering(1, steer);
    car.step();
    if (i >= SETTLE + STRAIGHT + TURN - MEASURE) {
      n++;
      for (let wI = 0; wI < 4; wI++) {
        susp[wI] += car.veh.wheelSuspensionForce(wI) ?? 0;
        side[wI] += Math.abs(car.veh.wheelSideImpulse(wI) ?? 0);
      }
    }
  }
  const names = ["FL", "FR", "RL", "RR"];
  for (let wI = 0; wI < 4; wI++) {
    const s = susp[wI] / n, si = side[wI] / n;
    console.log(`      ${names[wI]}: suspForce ${s.toFixed(0).padStart(6)}  sideImpulse ${si.toFixed(1).padStart(7)}` +
      `  sideImpulse/(suspForce*dt) = ${(s > 1 ? si / (s * DT) : 0).toFixed(2)}`);
  }
  world.free();
}

console.log("\ndone.");
