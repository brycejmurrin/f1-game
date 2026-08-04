#!/usr/bin/env node
// deep-handover.mjs — R2 airborne-handover probe.
//
// Simulates the ADOPTION-PLAN R2 protocol end to end, 20 seeded variants:
//   (a) bespoke-like pre-state: car at 80 km/h on the Singapore road,
//       known (s, x, head);
//   (b) launch: hand to a Rapier 6-DoF dynamic body with matching
//       pose+velocity, plus a kerb-strike vertical impulse and a small roll
//       torque impulse;
//   (c) fly until touchdown + settle (velocity/attitude thresholds), 6 s cap;
//   (d) hand back: extract pose+velocity -> px/pz/head/speed and the (s, x)
//       readback via a trackFrom-like LOCAL nearest-node projection
//       (window around the predicted s), cross-checked against a global
//       brute-force projection.
//
// Reports: continuity deltas at both handover points, settle-time
// distribution, worst-case flight state (NaN/explosion checks), and bitwise
// determinism of the whole suite across two fresh runs.
//
// The road trimesh has NO terrain, so each variant also gets a large flat
// "pseudo-terrain" pad 0.3 m below the lowest road point near the launch —
// off-road landings settle on that instead of falling forever (approximation;
// the real game has sculpted terrain). Usage: node spike/physics/deep-handover.mjs

import fs from "node:fs";
import RAPIER from "../../vendor/rapier-0.19.3/rapier.mjs";

await RAPIER.init({});

const geo = JSON.parse(fs.readFileSync(
  new URL("./geometry-singapore.json", import.meta.url), "utf8"));
const C = geo.centre, N = geo.n;
const DT = 1 / 60;

// Cumulative arc length (nodes are ~4 m apart but not exactly uniform).
const cum = new Float64Array(N + 1);
for (let i = 0; i < N; i++) {
  const j = (i + 1) % N;
  cum[i + 1] = cum[i] + Math.hypot(C.px[j] - C.px[i], C.py[j] - C.py[i], C.pz[j] - C.pz[i]);
}
const TOTAL = cum[N];

console.log(`Rapier ${RAPIER.version()} | handover probe on ${geo.id} ` +
  `(${TOTAL.toFixed(0)} m lap, ${N} nodes)`);

const roadVerts = new Float32Array(geo.road.pos);
const roadIdx = new Uint32Array(geo.road.idx);

const CAR = { mass: 798, half: { x: 0.75, y: 0.35, z: 2.0 }, ride: 0.6 };

function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
function yawOf(r) {
  return Math.atan2(2 * (r.w * r.y + r.x * r.z), 1 - 2 * (r.y * r.y + r.x * r.x));
}
function upY(r) { return 1 - 2 * (r.x * r.x + r.z * r.z); }

// node index whose cum[] straddles arc position s
function nodeAtS(s) {
  s = ((s % TOTAL) + TOTAL) % TOTAL;
  let lo = 0, hi = N;
  while (lo + 1 < hi) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; }
  return lo;
}

// trackFrom-like LOCAL projection: nearest node within +-W of a predicted
// node, then signed lateral via the left vector. Returns {s, x, node, clamped}.
function projectLocal(px, pz, sGuess, W = 40) {
  const c0 = nodeAtS(sGuess);
  let best = c0, bd = Infinity;
  for (let k = -W; k <= W; k++) {
    const i = ((c0 + k) % N + N) % N;
    const dx = C.px[i] - px, dz = C.pz[i] - pz, d = dx * dx + dz * dz;
    if (d < bd) { bd = d; best = i; }
  }
  const i = best, lx = C.tz[i], lz = -C.tx[i];      // left = up x tangent
  const x = (px - C.px[i]) * lx + (pz - C.pz[i]) * lz;
  return { s: cum[i], x, node: i, hitWindowEdge: Math.abs(bd) === W };
}

function projectGlobal(px, pz) {
  let best = 0, bd = Infinity;
  for (let i = 0; i < N; i++) {
    const dx = C.px[i] - px, dz = C.pz[i] - pz, d = dx * dx + dz * dz;
    if (d < bd) { bd = d; best = i; }
  }
  const i = best, lx = C.tz[i], lz = -C.tx[i];
  return { s: cum[i], x: (px - C.px[i]) * lx + (pz - C.pz[i]) * lz, node: i };
}

// ── one handover episode ─────────────────────────────────────────────────────

function runEpisode(rng, rollScale) {
  // seeded pre-state + launch parameters
  const n0 = Math.floor(rng() * N);
  const x0 = (rng() * 2 - 1) * Math.max(0, C.hw[n0] - 2);   // stay on tarmac
  const yawOff = (rng() * 2 - 1) * 0.05;
  const dvy = 2 + rng() * 3;                                // kerb strike: +2..5 m/s vertical
  const rollT = (rng() * 2 - 1) * rollScale;                // roll impulse, N*m*s
  const V0 = 80 / 3.6;

  const lx = C.tz[n0], lz = -C.tx[n0];
  const head = Math.atan2(C.tx[n0], C.tz[n0]) + yawOff;
  const pre = {
    px: C.px[n0] + lx * x0, pz: C.pz[n0] + lz * x0,
    py: C.py[n0] + CAR.ride, head, speed: V0, s: cum[n0], x: x0,
  };

  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = DT;
  const roadBody = world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  world.createCollider(RAPIER.ColliderDesc.trimesh(
    roadVerts, roadIdx, RAPIER.TriMeshFlags.FIX_INTERNAL_EDGES).setFriction(1.0), roadBody);

  // pseudo-terrain pad: 0.3 m below the lowest road point within ~250 m
  let minY = Infinity;
  for (let k = -64; k <= 64; k++) minY = Math.min(minY, C.py[((n0 + k) % N + N) % N]);
  const pad = world.createRigidBody(RAPIER.RigidBodyDesc.fixed()
    .setTranslation(pre.px, minY - 0.3 - 1, pre.pz));
  world.createCollider(RAPIER.ColliderDesc.cuboid(250, 1, 250).setFriction(0.9), pad);

  // (b) hand TO Rapier: matching pose + velocity, then the launch impulses
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(pre.px, pre.py, pre.pz)
    .setRotation({ x: 0, y: Math.sin(head / 2), z: 0, w: Math.cos(head / 2) })
    .setLinvel(Math.sin(head) * V0, 0, Math.cos(head) * V0)
    .setCanSleep(false));
  world.createCollider(
    RAPIER.ColliderDesc.cuboid(CAR.half.x, CAR.half.y, CAR.half.z)
      .setMass(CAR.mass).setFriction(0.6), body);
  body.applyImpulse({ x: 0, y: CAR.mass * dvy, z: 0 }, true);
  const f = { x: Math.sin(head), z: Math.cos(head) };
  body.applyTorqueImpulse({ x: f.x * rollT, y: 0, z: f.z * rollT }, true);

  // hand-to continuity: project the body back after ONE step and compare with
  // the bespoke prediction (s0 + v*dt, x0) — the round-trip error the game
  // would see on the first mirrored frame.
  world.step();
  let p = body.translation();
  const proj1 = projectLocal(p.x, p.z, pre.s + V0 * DT);
  const handTo = {
    dS: wrapS(proj1.s - (pre.s + V0 * DT)),
    dX: proj1.x - pre.x,
    dHead: wrap(yawOf(body.rotation()) - pre.head),
  };

  // (c) fly until touchdown + settle
  const MAXSTEPS = 360;                            // 6 s cap
  let touchdownStep = -1, settleStep = -1, stable = 0;
  let apexH = -Infinity, maxAng = 0, nonFinite = 0, flipped = false;
  for (let i = 1; i <= MAXSTEPS; i++) {
    if (i > 1) world.step();
    p = body.translation();
    const r = body.rotation(), lv = body.linvel(), av = body.angvel();
    if (!Number.isFinite(p.x + p.y + p.z + lv.x + lv.y + lv.z)) { nonFinite++; break; }
    const g = projectGlobal(p.x, p.z);
    const hAbove = p.y - C.py[g.node];             // height above local road level
    apexH = Math.max(apexH, hAbove);
    maxAng = Math.max(maxAng, Math.hypot(av.x, av.y, av.z));
    if (upY(r) < 0) flipped = true;
    if (touchdownStep < 0 && apexH > CAR.ride + 0.15 && hAbove < CAR.ride + 0.25 &&
        lv.y < -0.5)                               // descending — not the launch frames
      touchdownStep = i;
    const settled = Math.abs(lv.y) < 0.4 &&
      Math.hypot(av.x, av.y, av.z) < 0.8 && upY(r) > 0.85 && hAbove < 1.2;
    stable = settled ? stable + 1 : 0;
    if (touchdownStep > 0 && stable >= 30) { settleStep = i; break; }
  }

  // (d) hand back
  p = body.translation();
  const r = body.rotation(), lv = body.linvel();
  const speed = Math.hypot(lv.x, lv.z);
  const headBack = yawOf(r);
  const velDir = Math.atan2(lv.x, lv.z);
  const sPred = pre.s + V0 * ((settleStep > 0 ? settleStep : MAXSTEPS) * DT); // naive predictor
  const loc = projectLocal(p.x, p.z, sPred, 80);
  const glob = projectGlobal(p.x, p.z);
  const hw = C.hw[glob.node];
  world.free();

  // End-state classification: "settled" = upright + stable (clean handback);
  // "rest-inverted" = came to rest upside-down (needs the rescue path, not a
  // handback); "timeout-moving" = still in motion at the 6 s cap.
  const endUp = upY(r), endSpeed = Math.hypot(lv.x, lv.z);
  return {
    seedParams: { n0, x0, dvy, rollT },
    handTo,
    outcome: nonFinite ? "NON-FINITE"
           : settleStep > 0 ? (flipped ? "settled(rolled)" : "settled")
           : endSpeed < 1 && endUp < 0 ? "rest-inverted"
           : "timeout-moving",
    touchdownT: touchdownStep > 0 ? touchdownStep * DT : NaN,
    settleT: settleStep > 0 ? settleStep * DT : NaN,
    apexH, maxAng, flipped, nonFinite,
    handBack: {
      speed, speedRatio: speed / V0,
      driftDeg: speed > 1 ? Math.abs(wrap(headBack - velDir)) * 180 / Math.PI : 0,
      upY: upY(r),
      hAboveRoad: p.y - C.py[glob.node],
      x: glob.x, hw, onRoad: Math.abs(glob.x) <= hw + 0.5,
      localGlobalAgree: loc.node === glob.node,
      dSFlight: wrapS(glob.s - pre.s),
    },
    finalBits: [p.x, p.y, p.z, r.x, r.y, r.z, r.w, lv.x, lv.y, lv.z,
                settleStep, touchdownStep],
  };
}

function wrapS(ds) {
  ds = ((ds % TOTAL) + TOTAL) % TOTAL;
  return ds > TOTAL / 2 ? ds - TOTAL : ds;
}

// ── run the suites (determinism measured across the whole handover) ─────────

function runSuite(rollScale) {
  const rng = mulberry32(0xF1CA9E);
  const out = [];
  for (let v = 0; v < 20; v++) out.push(runEpisode(rng, rollScale));
  return out;
}

function report(label, A) {
  console.log(`\n[${label}] 20 seeded variants (80 km/h, kerb-strike dvy 2-5 m/s):`);
  console.log("   #  dvy  rollT | outcome          touchdn settle | apexH  maxAng | " +
    "spdRatio drift  hAbove  |x|/hw  agree");
  for (let i = 0; i < A.length; i++) {
    const e = A[i], hb = e.handBack, sp = e.seedParams;
    console.log(`  ${String(i).padStart(2)}  ${sp.dvy.toFixed(1)}  ${String(Math.round(sp.rollT)).padStart(5)} |` +
      ` ${e.outcome.padEnd(16)} ${Number.isFinite(e.touchdownT) ? e.touchdownT.toFixed(2) : "  - "}s` +
      `  ${Number.isFinite(e.settleT) ? e.settleT.toFixed(2) : "  - "}s |` +
      ` ${e.apexH.toFixed(2).padStart(5)}  ${e.maxAng.toFixed(1).padStart(5)} |` +
      `   ${hb.speedRatio.toFixed(2)}  ${hb.driftDeg.toFixed(0).padStart(4)}°` +
      `  ${hb.hAboveRoad.toFixed(2).padStart(6)}` +
      `  ${(Math.abs(hb.x) / Math.max(1, hb.hw)).toFixed(2).padStart(5)}` +
      `  ${hb.localGlobalAgree ? "Y" : "N"}${hb.onRoad ? "" : "  OFF-ROAD"}`);
  }

  console.log("  [hand-to continuity] bespoke -> Rapier, after 1 step (predicted vs projected):");
  const maxAbs = (f) => Math.max(...A.map(f).map(Math.abs));
  console.log(`    max |dS| ${maxAbs((e) => e.handTo.dS).toFixed(3)} m` +
    ` (node quantisation ~${(TOTAL / N).toFixed(1)} m)` +
    `  max |dX| ${maxAbs((e) => e.handTo.dX).toFixed(3)} m` +
    `  max |dHead| ${(maxAbs((e) => e.handTo.dHead) * 180 / Math.PI).toFixed(2)} deg`);

  const settled = A.filter((e) => Number.isFinite(e.settleT));
  const settleTs = settled.map((e) => e.settleT).sort((a, b) => a - b);
  console.log(`  [settle] ${settled.length}/20 settled within 6 s` +
    (settleTs.length ? `: min ${settleTs[0].toFixed(2)} s, median ${
      settleTs[Math.floor(settleTs.length / 2)].toFixed(2)} s, max ${
      settleTs[settleTs.length - 1].toFixed(2)} s` : ""));
  console.log(`    rolled mid-air/over: ${A.filter((e) => e.flipped).length}` +
    ` | rest-inverted: ${A.filter((e) => e.outcome === "rest-inverted").length}` +
    ` | timeout-moving: ${A.filter((e) => e.outcome === "timeout-moving").length}` +
    ` | non-finite: ${A.filter((e) => e.nonFinite > 0).length}` +
    ` | local/global disagree: ${A.filter((e) => !e.handBack.localGlobalAgree).length}`);
  console.log(`    worst flight state: apexH ${Math.max(...A.map((e) => e.apexH)).toFixed(2)} m,` +
    ` max |angvel| ${Math.max(...A.map((e) => e.maxAng)).toFixed(1)} rad/s`);
  if (settled.length) {
    const sMax = (f) => Math.max(...settled.map(f));
    console.log(`    settled handbacks: speed retained ${
      Math.min(...settled.map((e) => e.handBack.speedRatio)).toFixed(2)}-${
      sMax((e) => e.handBack.speedRatio).toFixed(2)}x, worst drift ${
      sMax((e) => e.handBack.driftDeg).toFixed(0)} deg, worst height error ${
      sMax((e) => Math.abs(e.handBack.hAboveRoad - CAR.ride)).toFixed(2)} m vs ride 0.6`);
  }
}

const A = runSuite(500);            // moderate kerb strike (roll rate <= ~2.7 rad/s)
report("moderate roll +-500 N*m*s", A);
const AG = runSuite(1600);          // aggressive stress case
report("aggressive roll +-1600 N*m*s", AG);

// determinism across the whole suite (moderate)
const B = runSuite(500);
let identical = true, firstDiff = -1;
for (let v = 0; v < 20 && identical; v++) {
  const a = Float64Array.from(A[v].finalBits), b = Float64Array.from(B[v].finalBits);
  const da = new DataView(a.buffer), db = new DataView(b.buffer);
  for (let k = 0; k < a.length; k++) {
    if (da.getBigUint64(k * 8, true) !== db.getBigUint64(k * 8, true)) {
      identical = false; firstDiff = v; break;
    }
  }
}
console.log(`\n[determinism] two fresh 20-episode suites bitwise identical` +
  ` (pose+vel+settle step per episode): ${identical}` +
  (identical ? "" : ` (first differing episode: ${firstDiff})`));

console.log("\ndone.");
