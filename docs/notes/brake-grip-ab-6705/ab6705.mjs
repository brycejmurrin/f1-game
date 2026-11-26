// #6705 A/B: braking and grip on Bryce's 11-25 profile. Usage: node scratch/ab6705.mjs <repoRoot> <label> [--reserve]
// --reserve: Parts.playerMods := Parts.getMods (the pre-#6572 works reserve) on this tree.
import { createRequire } from "node:module";
import path from "node:path";
const [root, label, ...rest] = process.argv.slice(2);
const reserve = rest.includes("--reserve");
const require = createRequire(path.join(path.resolve(root), "tools/lib/x.cjs"));
const { createGame } = require("./game-vm.cjs");
const { bench } = await import(path.join(path.resolve(root), "tools/check/player-dyn.mjs"));

const TRACK = process.env.TRACK || "monza";
const DT = 1 / 60, DEG = 180 / Math.PI, G_ = 9.81;
const r1 = (v) => +v.toFixed(1), r2 = (v) => +v.toFixed(2), r3 = (v) => +v.toFixed(3);
// Bryce's steering/driving store, tests/data/settings-live-export-2026-11-25.json (carWeight per-device: phone = 10).
const storage = { pace: 17, steerRate: 6, steerExpo: 7, steerSmooth: 3, steerLock: 7, steerSpeed: 4, carWeight: 10,
  brakeCue: 1, gripSteer: 1, drivingHelp: 1, raceLine: 0, steerSchema: 5, difficulty: "hard", autoThrottle: false,
  steerMode: "buttons", wheelAssist: "off", analogSpeedSteer: 1, tyreWear: "off" };

async function fresh() {
  const g = await createGame({ seat: "shipped", storage });
  if (reserve) g.sandbox.Parts.playerMods = g.sandbox.Parts.getMods;
  await g.race(TRACK);
  return g;
}

const out = { label, reserve, track: TRACK };
{
  const g = await fresh();
  const P = g.G.player, t = g.apex.tuning();
  out.seat = g.seat.team; out.mods = P.mods; out.pace = t.pace;
  out.tuning = Object.fromEntries(Object.entries(t).filter(([, v]) => typeof v === "number").map(([k, v]) => [k, r3(v)]));
  const pace = t.pace, gnd = (vs) => vs * pace;   // vStd = v / pace (pace-math.js)
  const b = bench(g, 0);
  // 1. braking 300 -> 100 km/h (standard scale), straight and with 0.3 steer held
  for (const st of [0, 0.3]) {
    b.reset(gnd(83.33)); let d = 0, tt = 0;
    while (P.speed / pace > 27.78 && tt < 15) { b.step({ steer: st, brake: true }); d += P.speed * DT; tt += DT; }
    out[`brake300_100_steer${st}`] = { dStd_m: r1(d / pace), t_s: r2(tt), aStd_g: r2((83.33 - 27.78) / tt / G_) };
  }
  // 2. skidpad grip: steady ay (aStd) at vStd 30/45/60, full lock and 0.6
  out.skid = [];
  for (const vs of [30, 45, 60]) for (const st of [0.6, 1.0]) {
    b.reset(gnd(vs)); const ay = [], yw = [];
    for (let i = 0; i < 120; i++) { b.step({ steer: st, throttle: P.speed < gnd(vs) }); if (i >= 60) { ay.push(Math.abs(P.lateralAccel || 0)); yw.push(Math.abs(P.yawRateCur || 0)); } }
    const m = (a) => a.reduce((x, y) => x + y, 0) / a.length;
    out.skid.push({ vStd: vs, steer: st, ayStd_g: r2(m(ay) / pace / G_), yaw: r3(m(yw)), aF: r1((P.slipFront || 0) * DEG), aR: r1((P.slipRear || 0) * DEG) });
  }
  // 3. yaw traces. (i) braked turn-in from vStd 60, steer 0.6; (ii) mid-corner brake at vStd 45 after 1.5 s on steer 0.7
  const trace = (v0, pre, preN, during, n) => {
    b.reset(gnd(v0)); for (let i = 0; i < preN; i++) b.step(pre);
    const rows = []; let aRmax = 0, yawMax = 0;
    for (let i = 0; i < n; i++) {
      b.step(during);
      aRmax = Math.max(aRmax, Math.abs(P.slipRear) * DEG); yawMax = Math.max(yawMax, Math.abs(P.yawRateCur));
      if (i % 6 === 5) rows.push([r3(P.yawRateCur), r1(P.slipFront * DEG), r1(P.slipRear * DEG), r1(P.speed / pace * 3.6)]);
    }
    return { yawMax: r3(yawMax), aRmax: r1(aRmax), trace_yaw_aF_aR_kphStd: rows };
  };
  out.trailTurnIn = trace(60, { steer: 0 }, 1, { steer: 0.6, brake: true }, 60);
  out.trailTurnInCoast = trace(60, { steer: 0 }, 1, { steer: 0.6 }, 60);
  out.midCornerBrake = trace(45, { steer: 0.7, throttle: true }, 90, { steer: 0.7, brake: true }, 36);
  g.close();
}

// 4. closed-loop laps: a fixed pursuit/speed-envelope driver (the SoakRun law, envelope in aStd so it scales
// with PACE). Measures what the CAR does with identical driver demands; curvature feeds the DRIVER only.
const TURNS = { T1_Rettifilo: 0.0962, T6_Lesmo1: 0.3692, T11_Parabolica: 0.8387 };
async function lap(aLatStd, aBrkStd) {
  const g = await fresh();
  const G = g.G, P = G.player, T = G.track, S = g.sandbox, pace = g.apex.tuning().pace;
  for (const c of G.cars) if (c !== P) { c.retired = true; c.x = 80; }
  const aLat = aLatStd * G_ * pace, aBrake = aBrkStd * G_ * pace, VMAX = 400;
  const DISTS = []; for (let d = 5; d <= 400; d += 5) DISTS.push(d);
  const smp = { p: [0, 0, 0], t: [0, 0, 0], r: [0, 0, 0], hw: 0 };
  const per = {}; for (const k in TURNS) per[k] = { minV: 1e9, r: 0, xMax: 0, aRmax: 0 };
  let off = 0, t = 0, tFly = null; const lap0 = P.lap || 0, startT = G.raceT;
  while (t < 200) {
    S.Tracks.sample(T, P.s, smp);
    const ang = Math.atan2(smp.t[0], smp.t[2]) - P.head; const angle = Math.atan2(Math.sin(ang), Math.cos(ang));
    const k0 = S.Tracks.curvature(T, P.s); let kSteer = k0; const look = Math.max(9, P.speed * 0.4);
    let vT = Math.abs(k0) > 1e-4 ? Math.sqrt(aLat / Math.abs(k0)) : VMAX;
    for (const d of DISTS) { const k = S.Tracks.curvature(T, G.wrapS(P.s + d)); if (d <= look) kSteer = k;
      const vc = Math.abs(k) > 1e-4 ? Math.sqrt(aLat / Math.abs(k)) : VMAX; const va = Math.sqrt(vc * vc + 2 * aBrake * d); if (va < vT) vT = va; }
    const L = Math.max(8, Math.min(38, P.speed * 0.6));
    const steer = Math.max(-1, Math.min(1, 2.4 * (Math.atan2(kSteer * L * L * 0.5 - P.x, L) - angle)));
    g.apex.setInput({ steer, throttle: P.speed < vT, brake: P.speed > vT * 1.04 });
    g.step(1, DT); t += DT;
    const fly = (P.lap || 0) === lap0 + 1;
    if (fly && tFly == null) tFly = t;
    if (fly && Math.abs(P.x) - smp.hw > 0.5) off += DT;
    const fr = P.s / T.total;
    for (const k in TURNS) { let df = Math.abs(fr - TURNS[k]); df = Math.min(df, 1 - df);
      if (fly && df * T.total < 100) { const q = per[k]; const v = P.speed / pace;
        if (v < q.minV) { q.minV = v; q.r = (P.speed * P.speed) / Math.max(0.1, Math.abs(P.lateralAccel || 0)); }
        q.xMax = Math.max(q.xMax, Math.abs(P.x) - smp.hw); q.aRmax = Math.max(q.aRmax, Math.abs(P.slipRear) * DEG); } }
    if ((P.lap || 0) > lap0 + 1) break;   // out-lap from the grid, then one flying lap
  }
  const res = { aLatStd, lapT: r2(t - tFly), offS: r2(off), corners: {} };
  for (const k in per) { const q = per[k]; res.corners[k] = { minKphStd: r1(q.minV * 3.6), radiusM: r1(q.r), overHwM: r2(q.xMax), aRmax: r1(q.aRmax) }; }
  g.close();
  return res;
}

const LATS = (process.env.LATS || "1.8,2.2,2.6").split(",").map(Number);
out.laps = [];
for (const a of LATS) out.laps.push(await lap(a, 3.5));
console.log(JSON.stringify(out));
