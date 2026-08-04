// deep-sideworld.js — browser-side measurement of the R1 side-world tax.
// Loaded as an ES-module island by side-world.html (the game itself stays
// no-build IIFE; R0's plan is exactly this kind of module island).
//
// What it measures, per 60 Hz-style tick, with performance.now():
//   sync-in   — compute 22 lap-like car poses from the centreline and write
//               them to 22 KINEMATIC position-based bodies
//               (setNextKinematicTranslation/Rotation) — the JS→WASM mirror
//   step      — world.step()
//   read-back — 100 debris translation()+rotation() into a preallocated
//               Float32Array — the WASM→JS render-transform path
// Plus: rapier.mjs module import time, RAPIER.init() time, world+trimesh
// build time, and performance.memory heap deltas (JS heap only — WASM linear
// memory is NOT included; see DEEP-DIVE.md caveats).
//
// Geometry: fetched at runtime from ./geometry-singapore.json (the gitignored
// output of build-geometry.cjs) — chosen over embedding so the page needs no
// build step and the JSON stays regenerable.

const out = document.getElementById("out");
const log = (s) => { out.textContent += "\n" + s; };
out.textContent = "";

window.__sideworld = { ready: false, done: false, error: null, result: null };

const mem = () => (performance.memory ? performance.memory.usedJSHeapSize : NaN);
const memTotal = () => (performance.memory ? performance.memory.totalJSHeapSize : NaN);

function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function stats(arr) {
  const s = Float64Array.from(arr).sort();
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  return { mean, p95: s[Math.floor(arr.length * 0.95)], max: s[arr.length - 1] };
}

try {
  // ── load + init ─────────────────────────────────────────────────────────
  const heap0 = mem();
  const tImp0 = performance.now();
  const { default: RAPIER } = await import("../../vendor/rapier-0.19.3/rapier.mjs");
  const tImp1 = performance.now();
  await RAPIER.init({});
  const tInit = performance.now();
  const heapInit = mem();
  log(`rapier import ${(tImp1 - tImp0).toFixed(0)} ms, init ${(tInit - tImp1).toFixed(0)} ms`);

  const tGeo0 = performance.now();
  const geo = await (await fetch("./geometry-singapore.json")).json();
  const tGeo1 = performance.now();
  log(`geometry fetch+parse ${(tGeo1 - tGeo0).toFixed(0)} ms ` +
    `(${geo.road.pos.length / 3} verts, ${geo.road.idx.length / 3} tris)`);

  // ── world + trimesh + bodies ────────────────────────────────────────────
  const DT = 1 / 60;
  const tW0 = performance.now();
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = DT;
  const roadBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  world.createCollider(
    RAPIER.ColliderDesc.trimesh(
      new Float32Array(geo.road.pos), new Uint32Array(geo.road.idx),
      RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES).setFriction(1.0),
    roadBody);
  const tW1 = performance.now();

  const C = geo.centre, N = geo.n;
  // Cumulative arc length so cars can be advanced by s (metres).
  const cum = new Float64Array(N + 1);
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    cum[i + 1] = cum[i] + Math.hypot(C.px[j] - C.px[i], C.py[j] - C.py[i], C.pz[j] - C.pz[i]);
  }
  const TOTAL = cum[N];

  // 22 kinematic car mirrors on a scripted lap-like path: spread over the
  // first ~1.3 km (so several plough through the debris zone and keep it
  // awake), 45–55 m/s, alternating ±2 m lateral offset.
  const NCARS = 22;
  const cars = [];
  for (let i = 0; i < NCARS; i++) {
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(0.75, 0.5, 2.0).setFriction(0.8), body);
    cars.push({
      body,
      s: i * 60,                          // start spacing 60 m
      v: 45 + (i % 5) * 2.5,              // 45–55 m/s
      lat: (i % 2 ? 1 : -1) * 2.0,
      node: 0,                            // advancing pointer into cum[]
    });
  }

  // 100 dynamic debris over the first ~300 m (same seed family as the eval).
  const NDEBRIS = 100;
  const rng = mulberry32(0xA9EC26);
  const debris = [];
  for (let i = 0; i < NDEBRIS; i++) {
    const ni = Math.floor(rng() * 75);
    const lat = (rng() * 2 - 1) * C.hw[ni] * 0.8;
    const lx = C.tz[ni], lz = -C.tx[ni];  // left = up x tangent
    const h = () => 0.05 + rng() * 0.2;
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(C.px[ni] + lx * lat, C.py[ni] + 2 + rng() * 3, C.pz[ni] + lz * lat));
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(h(), h(), h()).setMass(2 + rng() * 8).setFriction(0.7),
      body);
    debris.push(body);
  }
  const tW2 = performance.now();
  const heapWorld = mem();
  log(`world+trimesh build ${(tW1 - tW0).toFixed(0)} ms, +122 bodies ${(tW2 - tW1).toFixed(0)} ms`);

  // Pose a car at arc position s (+lat m left of centre): advance its node
  // pointer, lerp position/tangent between nodes.
  function carPose(car, dst) {
    let s = car.s % TOTAL;
    if (s < cum[car.node]) car.node = 0;          // wrapped
    while (cum[car.node + 1] < s) car.node++;
    const i = car.node, j = (i + 1) % N;
    const f = (s - cum[i]) / (cum[i + 1] - cum[i]);
    const tx = C.tx[i] + (C.tx[j] - C.tx[i]) * f;
    const tz = C.tz[i] + (C.tz[j] - C.tz[i]) * f;
    dst.x = C.px[i] + (C.px[j] - C.px[i]) * f + tz * car.lat;
    dst.y = C.py[i] + (C.py[j] - C.py[i]) * f + 0.55;
    dst.z = C.pz[i] + (C.pz[j] - C.pz[i]) * f + (-tx) * car.lat;
    const yaw = Math.atan2(tx, tz);
    dst.qy = Math.sin(yaw / 2); dst.qw = Math.cos(yaw / 2);
  }

  const pose = { x: 0, y: 0, z: 0, qy: 0, qw: 1 };
  const readBuf = new Float32Array(NDEBRIS * 7);  // preallocated read-back target

  function tick() {
    const t0 = performance.now();
    // sync-in: 22 mirror pose writes (path math stands in for reading game state)
    for (const car of cars) {
      car.s += car.v * DT;
      carPose(car, pose);
      car.body.setNextKinematicTranslation({ x: pose.x, y: pose.y, z: pose.z });
      car.body.setNextKinematicRotation({ x: 0, y: pose.qy, z: 0, w: pose.qw });
    }
    const t1 = performance.now();
    world.step();
    const t2 = performance.now();
    // read-back: 100 debris poses into the preallocated buffer
    for (let i = 0; i < NDEBRIS; i++) {
      const p = debris[i].translation(), r = debris[i].rotation();
      const o = i * 7;
      readBuf[o] = p.x; readBuf[o + 1] = p.y; readBuf[o + 2] = p.z;
      readBuf[o + 3] = r.x; readBuf[o + 4] = r.y; readBuf[o + 5] = r.z; readBuf[o + 6] = r.w;
    }
    const t3 = performance.now();
    return [t1 - t0, t2 - t1, t3 - t2];
  }

  window.__sideworld.ready = true;

  // ── measured run: 60 warm-up + 600 measured ticks ───────────────────────
  // Paced by setTimeout rather than rAF: headless/SwiftShader rAF throttling
  // must not gate a CPU-side physics measurement; kinematic velocity
  // inference uses world.timestep, not wall time, so pacing is cosmetic.
  const WARM = 60, TICKS = 600;
  const syncMs = new Float64Array(TICKS), stepMs = new Float64Array(TICKS),
        readMs = new Float64Array(TICKS);
  let n = -WARM;
  await new Promise((resolve, reject) => {
    function loop() {
      try {
        for (let k = 0; k < 5; k++) {              // 5 ticks per timeout slot
          const [a, b, c] = tick();
          if (n >= 0 && n < TICKS) { syncMs[n] = a; stepMs[n] = b; readMs[n] = c; }
          n++;
          if (n >= TICKS) return resolve();
        }
        setTimeout(loop, 0);
      } catch (e) { reject(e); }
    }
    setTimeout(loop, 0);
  });

  const heapEnd = mem();
  const half = TICKS / 2;
  const result = {
    ua: navigator.userAgent,
    importMs: tImp1 - tImp0,
    initMs: tInit - tImp1,
    geoFetchMs: tGeo1 - tGeo0,
    trimeshBuildMs: tW1 - tW0,
    bodiesBuildMs: tW2 - tW1,
    sync: stats(syncMs), step: stats(stepMs), read: stats(readMs),
    // early (debris mostly awake/impacted) vs late (sleeping kicks in)
    stepEarly: stats(stepMs.slice(0, half)), stepLate: stats(stepMs.slice(half)),
    heap: {
      beforeImport: heap0, afterInit: heapInit, afterWorld: heapWorld,
      afterRun: heapEnd, total: memTotal(),
      addedByRapierJs: heapInit - heap0,
      addedByWorld: heapWorld - heapInit,
    },
    nonFinite: [...readBuf].some((v) => !Number.isFinite(v)),
  };
  window.__sideworld.result = result;
  window.__sideworld.done = true;
  const f = (o) => `mean ${o.mean.toFixed(3)}  p95 ${o.p95.toFixed(3)}  max ${o.max.toFixed(3)} ms`;
  log(`sync-in   ${f(result.sync)}`);
  log(`step      ${f(result.step)}   (early ${f(result.stepEarly)} | late ${f(result.stepLate)})`);
  log(`read-back ${f(result.read)}`);
  log(`heap +rapier ${(result.heap.addedByRapierJs / 1e6).toFixed(1)} MB, ` +
      `+world ${(result.heap.addedByWorld / 1e6).toFixed(1)} MB`);
  log("done.");
} catch (e) {
  window.__sideworld.error = String(e && e.stack || e);
  window.__sideworld.done = true;
  log("ERROR: " + window.__sideworld.error);
}
