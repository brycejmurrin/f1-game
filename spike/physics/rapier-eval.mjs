#!/usr/bin/env node
// rapier-eval.mjs — Rapier 0.19.3 evaluation spike for Apex 26.
//
// Loads the REAL Singapore road mesh (extracted browser-free by
// build-geometry.cjs), builds it as a Rapier trimesh, and runs:
//   b. vehicle test    — DynamicRayCastVehicleController driven on the road
//   c. determinism     — identical 10 s sim in two fresh worlds, bitwise compare
//   d. perf            — world.step() cost: vehicle / +22 cars / +100 debris
//
// Usage: node spike/physics/rapier-eval.mjs [trackId]   (default: singapore)
// Pure Node 22, no browser, no deps beyond the vendored rapier.mjs.

import fs from "node:fs";
import { performance } from "node:perf_hooks";
import RAPIER from "./vendor/rapier.mjs";

await RAPIER.init({});

const trackId = process.argv[2] || "singapore";
const geo = JSON.parse(
  fs.readFileSync(new URL(`./geometry-${trackId}.json`, import.meta.url), "utf8"));

const DT = 1 / 60;
const C = geo.centre;
const N = geo.n;

console.log(`Rapier ${RAPIER.version()} | track ${geo.id}: ` +
  `${geo.road.pos.length / 3} verts, ${geo.road.idx.length / 3} tris, ` +
  `${geo.total.toFixed(0)} m lap, ${N} centreline nodes`);

// Shared typed arrays for the trimesh collider (reused across worlds).
const roadVerts = new Float32Array(geo.road.pos);
const roadIdx   = new Uint32Array(geo.road.idx);

// ── helpers ─────────────────────────────────────────────────────────────────

function makeWorld() {
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = DT;
  return world;
}

function addRoad(world) {
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  const desc = RAPIER.ColliderDesc
    .trimesh(roadVerts, roadIdx, RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES)
    .setFriction(1.0);
  world.createCollider(desc, body);
  return body;
}

// Centreline frame at node i: point, tangent, left vector (up x tangent).
function nodeFrame(i) {
  i = ((i % N) + N) % N;
  const p = { x: C.px[i], y: C.py[i], z: C.pz[i] };
  const t = { x: C.tx[i], y: C.ty[i], z: C.tz[i] };
  const l = { x: t.z, y: 0, z: -t.x };                 // up x tangent
  return { p, t, l, hw: C.hw[i] };
}

function yawQuat(yaw) {
  return { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) };
}

// Nearest centreline node to a world position (brute force, xz plane).
function nearestNode(x, z) {
  let best = 0, bd = Infinity;
  for (let i = 0; i < N; i++) {
    const dx = C.px[i] - x, dz = C.pz[i] - z, d = dx * dx + dz * dz;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

// The game's car footprint (js/game.js / CLAUDE.md): frontZ 1.7, rearZ -1.6,
// wheelY 0.34 (= wheel radius), halfTrack 0.75. Chassis: 798 kg minimum-weight
// F1 car, cuboid half-extents 0.75 x 0.25 x 2.0 (w x h x l; forward = local +Z).
const CAR = {
  mass: 798,
  half: { x: 0.75, y: 0.25, z: 2.0 },
  wheels: [                                  // FL, FR, RL, RR (chassis-local)
    { x:  0.75, y: -0.10, z:  1.7 },
    { x: -0.75, y: -0.10, z:  1.7 },
    { x:  0.75, y: -0.10, z: -1.6 },
    { x: -0.75, y: -0.10, z: -1.6 },
  ],
  suspRest: 0.15,
  wheelR: 0.34,
  suspStiffness: 50,     // Bullet-style (force scaled by chassis mass):
                         //   equil. compression = g/(k) = 9.81/50 ~ 0.05 m of 0.15
  suspCompression: 7.0,  // ~0.5 * 2*sqrt(k)
  suspRelaxation: 8.5,   // ~0.6 * 2*sqrt(k)
};

function makeVehicle(world, nodeIdx = 0) {
  const f = nodeFrame(nodeIdx);
  const yaw = Math.atan2(f.t.x, f.t.z);          // local +Z -> tangent
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(f.p.x, f.p.y + 0.8, f.p.z)
      .setRotation(yawQuat(yaw))
      .setCanSleep(false));
  const collider = world.createCollider(
    RAPIER.ColliderDesc.cuboid(CAR.half.x, CAR.half.y, CAR.half.z)
      .setMass(CAR.mass).setFriction(0.6),
    body);
  const veh = world.createVehicleController(body);
  const down = { x: 0, y: -1, z: 0 }, axle = { x: -1, y: 0, z: 0 };
  for (const w of CAR.wheels) {
    const i = veh.numWheels();
    veh.addWheel(w, down, axle, CAR.suspRest, CAR.wheelR);
    veh.setWheelSuspensionStiffness(i, CAR.suspStiffness);
    veh.setWheelSuspensionCompression(i, CAR.suspCompression);
    veh.setWheelSuspensionRelaxation(i, CAR.suspRelaxation);
    veh.setWheelMaxSuspensionForce(i, 1e5);
    veh.setWheelFrictionSlip(i, 10.5);           // Bullet default tyre grip
  }
  const notChassis = (c) => c.handle !== collider.handle;
  const step = () => { veh.updateVehicle(DT, undefined, undefined, notChassis); world.step(); };
  return { body, collider, veh, step, yaw0: yaw };
}

// Scripted input schedule shared by the vehicle, determinism and perf runs:
// 1 s settle, then engine force on the rear axle, then +0.2 rad front steering.
function applyInputs(veh, stepIdx, engineForce, settleSteps, steerAtStep) {
  const driving = stepIdx >= settleSteps;
  veh.setWheelEngineForce(2, driving ? engineForce : 0);
  veh.setWheelEngineForce(3, driving ? engineForce : 0);
  const steer = stepIdx >= steerAtStep ? 0.2 : 0;
  veh.setWheelSteering(0, steer);
  veh.setWheelSteering(1, steer);
}

// ── b0. engine-force calibration ────────────────────────────────────────────
// Find a per-rear-wheel force that reaches ~40-60 km/h after 3 s of drive.

const SETTLE = 60;                                // 1 s
function speedAfter3s(force) {
  const world = makeWorld();
  addRoad(world);
  const v = makeVehicle(world);
  for (let i = 0; i < SETTLE + 180; i++) { applyInputs(v.veh, i, force, SETTLE, 1e9); v.step(); }
  const lv = v.body.linvel();
  const kmh = Math.hypot(lv.x, lv.y, lv.z) * 3.6;
  world.free();
  return kmh;
}

console.log("\n[calibration] per-rear-wheel engine force -> speed after 3 s:");
const candidates = [1200, 1800, 2400, 3000];
let engineForce = null, engineKmh = 0;
for (const f of candidates) {
  const kmh = speedAfter3s(f);
  console.log(`  ${String(f).padStart(5)} N  ->  ${kmh.toFixed(1)} km/h`);
  if (engineForce === null && kmh >= 40 && kmh <= 60) { engineForce = f; engineKmh = kmh; }
}
if (engineForce === null) { engineForce = candidates[1]; engineKmh = speedAfter3s(engineForce); }
console.log(`  chosen: ${engineForce} N/wheel (${engineKmh.toFixed(1)} km/h @ 3 s)`);

// ── b. vehicle test: settle 1 s, drive 3 s, then steer 0.2 rad for 3 s ──────

console.log("\n[vehicle] 7 s on the real road (60 Hz), log every 0.5 s:");
{
  const world = makeWorld();
  addRoad(world);
  const v = makeVehicle(world);
  const STEER_AT = SETTLE + 180;                  // 4 s
  const TOTAL = SETTLE + 180 + 180;               // 7 s
  const log = [];
  let minRide = Infinity, maxRide = -Infinity, bad = 0, offRoadAt = -1;
  let yawRateMid = 0, speedMid = 0;
  for (let i = 0; i < TOTAL; i++) {
    applyInputs(v.veh, i, engineForce, SETTLE, STEER_AT);
    v.step();
    const p = v.body.translation(), lv = v.body.linvel();
    const speed = Math.hypot(lv.x, lv.y, lv.z);
    const ni = nearestNode(p.x, p.z);
    const lat = Math.hypot(C.px[ni] - p.x, C.pz[ni] - p.z); // ~|lateral offset|
    const onRoad = lat <= C.hw[ni];
    if (!onRoad && offRoadAt < 0) offRoadAt = i;
    const ride = p.y - C.py[ni];
    // The collider is ROAD-ONLY (no terrain) — judge ride height only while the
    // car is actually over the tarmac; past the edge it correctly falls off.
    if (i >= 10 && onRoad) { minRide = Math.min(minRide, ride); maxRide = Math.max(maxRide, ride); }
    if (!Number.isFinite(p.x + p.y + p.z + speed)) bad++;
    const r = v.body.rotation();
    const yaw = Math.atan2(2 * (r.w * r.y + r.x * r.z), 1 - 2 * (r.y * r.y + r.x * r.x));
    if (i === STEER_AT + 60) {                    // 1 s into the steer phase
      yawRateMid = Math.abs(v.body.angvel().y); speedMid = speed;
    }
    log.push({ t: (i + 1) * DT, p, speed, yaw, ride, lat, onRoad });
    if ((i + 1) % 30 === 0) {
      console.log(`  t=${((i + 1) * DT).toFixed(1).padStart(4)}s  ` +
        `pos=(${p.x.toFixed(1)}, ${p.y.toFixed(2)}, ${p.z.toFixed(1)})  ` +
        `v=${(speed * 3.6).toFixed(1).padStart(5)} km/h  ` +
        `yaw=${yaw.toFixed(3)}  lat=${lat.toFixed(1)} m  ride=${ride.toFixed(3)} m` +
        (onRoad ? "" : "  [off road mesh]"));
    }
  }
  const at = (t) => log[Math.round(t / DT) - 1];
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const dYawSteer = wrap(at(7).yaw - at(4).yaw);
  const accelOk = at(4).speed > at(1).speed + 8;
  const turnOk  = Math.abs(dYawSteer) > 0.15;
  const rideOk  = minRide > 0.1 && maxRide < 1.5;
  console.log(`  speed @1s=${(at(1).speed * 3.6).toFixed(1)} @4s=${(at(4).speed * 3.6).toFixed(1)} ` +
    `@7s=${(at(7).speed * 3.6).toFixed(1)} km/h | yaw delta over steer phase=${dYawSteer.toFixed(3)} rad`);
  if (yawRateMid > 1e-3) {
    console.log(`  measured turn radius @1s into steer: v/yawRate = ` +
      `${(speedMid / yawRateMid).toFixed(1)} m (kinematic wheelbase/tan(0.2) = ` +
      `${(3.3 / Math.tan(0.2)).toFixed(1)} m)`);
  }
  console.log(`  ride height while ON tarmac (chassis y - road y): ` +
    `min=${minRide.toFixed(3)} max=${maxRide.toFixed(3)} m | non-finite samples: ${bad}`);
  if (offRoadAt >= 0) {
    console.log(`  note: car steered off the road edge at t=${(offRoadAt * DT).toFixed(2)} s ` +
      `(expected — 0.2 rad lock held 3 s; collider has NO terrain, only road)`);
  }
  console.log(`  SANITY  accelerates:${accelOk ? "PASS" : "FAIL"}  turns:${turnOk ? "PASS" : "FAIL"}` +
    `  tracks-road-while-on-it(no fall-through/launch):${rideOk && bad === 0 ? "PASS" : "FAIL"}`);
  world.free();
}

// ── c. determinism: identical 10 s sim in two fresh worlds ──────────────────

// Contact-rich scene: road + driven vehicle + 22 grid cars + 100 debris cubes
// raining onto the tarmac (lots of impacts and stacking — the hard case for
// determinism). Records the vehicle pose per step AND every body's final pose.
function run10s() {
  const world = makeWorld();
  addRoad(world);
  const v = makeVehicle(world);
  addGridCars(world, 22);
  addDebris(world, 100, mulberry32(0xA9EC26));
  const STEPS = 600;                              // 10 s
  const perStep = new Float64Array(STEPS * 7);    // vehicle x y z qx qy qz qw
  for (let i = 0; i < STEPS; i++) {
    applyInputs(v.veh, i, engineForce, SETTLE, 330);
    v.step();
    const p = v.body.translation(), r = v.body.rotation();
    perStep.set([p.x, p.y, p.z, r.x, r.y, r.z, r.w], i * 7);
  }
  const finals = [];                              // every body, insertion order
  world.bodies.forEach((b) => {
    const p = b.translation(), r = b.rotation();
    finals.push(p.x, p.y, p.z, r.x, r.y, r.z, r.w);
  });
  world.free();
  return { perStep, finals: Float64Array.from(finals) };
}

console.log("\n[determinism] two fresh worlds, identical 10 s / 600-step sim" +
  " (vehicle + 22 cars + 100 debris, contact-rich):");
{
  const A = run10s(), B = run10s();
  const bits = (arr) => new DataView(arr.buffer);
  const va = bits(A.perStep), vb = bits(B.perStep);
  let firstDiff = -1, maxDiv = 0, maxDivStep = -1;
  for (let i = 0; i < A.perStep.length; i++) {
    if (va.getBigUint64(i * 8, true) !== vb.getBigUint64(i * 8, true) && firstDiff < 0)
      firstDiff = Math.floor(i / 7);
    const d = Math.abs(A.perStep[i] - B.perStep[i]);
    if (d > maxDiv) { maxDiv = d; maxDivStep = Math.floor(i / 7); }
  }
  const fa = bits(A.finals), fb = bits(B.finals);
  let allBodiesBitwise = A.finals.length === B.finals.length;
  for (let i = 0; allBodiesBitwise && i < A.finals.length; i++)
    if (fa.getBigUint64(i * 8, true) !== fb.getBigUint64(i * 8, true)) allBodiesBitwise = false;
  const f = A.perStep.length - 7;
  console.log(`  vehicle final translation A: (${A.perStep[f]}, ${A.perStep[f + 1]}, ${A.perStep[f + 2]})`);
  console.log(`  vehicle final translation B: (${B.perStep[f]}, ${B.perStep[f + 1]}, ${B.perStep[f + 2]})`);
  console.log(`  vehicle final rotation    A: (${A.perStep[f + 3]}, ${A.perStep[f + 4]}, ` +
    `${A.perStep[f + 5]}, ${A.perStep[f + 6]})`);
  console.log(`  vehicle pose bitwise identical across all 600 steps: ${firstDiff < 0}`);
  console.log(`  ALL ${A.finals.length / 7} bodies' final pose bitwise identical: ${allBodiesBitwise}`);
  console.log(`  first divergent step: ${firstDiff < 0 ? "none" : firstDiff}` +
    ` | max per-step divergence: ${maxDiv}${maxDiv ? ` (step ${maxDivStep})` : ""}`);
  console.log(`  VERDICT: ${firstDiff < 0 && allBodiesBitwise
    ? "DETERMINISTIC (bitwise)" : "NON-DETERMINISTIC"}`);
}

// ── d. perf: mean/max ms per step over 600 steps, three scenes ──────────────

// Deterministic PRNG for debris sizes/placement.
function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function addGridCars(world, count) {
  // Two staggered columns behind the start line, +-2 m off centre, 8 m gaps.
  for (let i = 0; i < count; i++) {
    const f = nodeFrame(-(4 + i * 2));            // node spacing ~4 m
    const side = (i % 2 ? 1 : -1) * 2.0;
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(f.p.x + f.l.x * side, f.p.y + 0.8, f.p.z + f.l.z * side)
      .setRotation(yawQuat(Math.atan2(f.t.x, f.t.z))));
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(CAR.half.x, 0.5, CAR.half.z)
        .setMass(CAR.mass).setFriction(0.8),
      body);
  }
}

function addDebris(world, count, rng) {
  for (let i = 0; i < count; i++) {
    const f = nodeFrame(Math.floor(rng() * 75));  // first ~300 m of track
    const lat = (rng() * 2 - 1) * f.hw * 0.8;
    const h = () => 0.05 + rng() * 0.2;           // half-extents 0.05-0.25 (0.1-0.5 m)
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(f.p.x + f.l.x * lat, f.p.y + 2 + rng() * 3, f.p.z + f.l.z * lat));
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(h(), h(), h()).setMass(2 + rng() * 8).setFriction(0.7),
      body);
  }
}

function perfScenario(label, setup) {
  const world = makeWorld();
  addRoad(world);
  const v = makeVehicle(world);
  setup(world);
  const WARM = 60, STEPS = 600;
  for (let i = 0; i < WARM; i++) { applyInputs(v.veh, i + SETTLE, engineForce, SETTLE, 1e9); v.step(); }
  const times = new Float64Array(STEPS);
  for (let i = 0; i < STEPS; i++) {
    applyInputs(v.veh, i + SETTLE, engineForce, SETTLE, 330);
    const t0 = performance.now();
    v.step();
    times[i] = performance.now() - t0;
  }
  world.free();
  const sorted = Float64Array.from(times).sort();
  const mean = times.reduce((a, b) => a + b, 0) / STEPS;
  const p95 = sorted[Math.floor(STEPS * 0.95)];
  const max = sorted[STEPS - 1];
  console.log(`  ${label.padEnd(34)} mean ${mean.toFixed(3)} ms   ` +
    `p95 ${p95.toFixed(3)} ms   max ${max.toFixed(3)} ms`);
  return { label, mean, p95, max };
}

console.log("\n[perf] updateVehicle+world.step cost, 600 steps (after 60 warm-up):");
perfScenario("road + vehicle", () => {});
perfScenario("road + vehicle + 22 grid cars", (w) => addGridCars(w, 22));
perfScenario("road + vehicle + 22 cars + 100 debris", (w) => {
  addGridCars(w, 22);
  addDebris(w, 100, mulberry32(0xA9EC26));
});

console.log("\ndone.");
