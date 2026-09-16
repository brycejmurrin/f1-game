#!/usr/bin/env node
/**
 * @doc Player vehicle-dynamics bench (VM): braking, accel, skidpad, step steer, trail-brake, lift-off, power-on, flick.
 * @skill tune-physics
 *
 * Headless and deterministic (tools/lib/game-vm.cjs, no browser). The trick
 * that makes a skidpad possible on a race track: the car is re-pinned to one
 * straight's centreline after every step — POSITION only; heading, yaw rate,
 * lateral velocity and speed persist — so steady-state cornering, step-steer
 * and technique tests run without a wall or the grass ending them. Everything
 * is read off the player's own per-axle state (slipFront/slipRear, gripFront/
 * gripRear, forceFront/forceRear, lateralAccel, yawRateCur), never the road.
 *
 *   node tools/check/player-dyn.mjs                # table
 *   node tools/check/player-dyn.mjs --json         # raw JSON (diffable)
 *   TRACK=monza FRAC=0.0                            # which straight to pin to
 *
 * `measure(g)` is exported for tests/unit/player-dynamics-vm.test.mjs, which
 * locks the SHAPES (force falls past its peak, throttle costs the rear, lift-
 * off and trail braking rotate) as relative assertions — never magnitudes.
 * Evidence and the baseline table: docs/notes/PLAYER-PHYSICS-RESEARCH-2026-09.md.
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const { createGame } = require("../lib/game-vm.cjs");

const DT = 1 / 60, G_ = 9.81, DEG = 180 / Math.PI;
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const r2 = (v) => +v.toFixed(2), r3 = (v) => +v.toFixed(3), r1 = (v) => +v.toFixed(1);

/** Build the pinned bench on an existing game handle. */
export function bench(g, frac = 0) {
  const P = g.G.player, S = g.sandbox, track = g.G.track;
  const smp = { p: [0, 0, 0], t: [0, 0, 0], r: [0, 0, 0], hw: 0 };
  const s0 = frac * track.total;
  S.Tracks.sample(track, s0, smp);
  const head0 = Math.atan2(smp.t[0], smp.t[2]);
  // Park the AI field out of the way: a live field laps past the pinned car
  // and would hit or shadow it (dirty air) at run-dependent moments. Retired
  // cars take no motion; 80 m off the road they are outside every contact
  // bucket and every wake cone.
  for (const c of g.G.cars) if (c !== P) { c.retired = true; c.x = 80; }
  const pin = () => { P.px = smp.p[0]; P.pz = smp.p[2]; P.s = s0; P.x = 0; };
  const reset = (speed) => {
    g.apex.jump(frac, speed, 0); P.axEstSm = 0; P.vertLoad = 0;
    P.px = smp.p[0]; P.pz = smp.p[2]; P.head = head0;
  };
  const step = (input, tread = true) => { g.apex.setInput(input); g.step(1, DT); if (tread) pin(); };
  const state = () => ({
    yaw: P.yawRateCur || 0, ay: P.lateralAccel || 0, speed: P.speed,
    aF: (P.slipFront || 0) * DEG, aR: (P.slipRear || 0) * DEG,
    FyF: Math.abs(P.forceFront || 0), FyR: Math.abs(P.forceRear || 0),
    muF: P.gripFront || 1, muR: P.gripRear || 1,
    uF: P.frontUtil || 0, uR: P.rearUtil || 0,
    axFracF: P.axFracF ?? P.axFrac ?? 0, axFracR: P.axFracR ?? P.axFrac ?? 0,
    delta: (P.steerAngle || 0) * DEG,
  });
  const vTop = () => g.G.vTop ? g.G.vTop() : 72 * g.apex.tuning().pace;
  return { P, reset, step, state, vTop, clear: () => g.apex.clearInput() };
}

/** Every measurement, as one JSON object. */
export function measure(g, frac = 0) {
  const b = bench(g, frac);
  const { P, reset, step, state } = b;
  const out = {};
  // 1. braking distance from 100 km/h, 200 km/h and vTop
  for (const v0 of [27.78, 55.56, b.vTop()]) {
    reset(v0); let d = 0, t = 0;
    while (P.speed > 0.3 && t < 15) { step({ steer: 0, brake: true }); d += P.speed * DT; t += DT; }
    out[`brake_${v0.toFixed(1)}`] = { d_m: r1(d), t_s: r2(t), g_avg: r2(v0 / t / G_) };
  }
  // 2. acceleration
  {
    reset(0.5); let t = 0, t100 = null, t200 = null;
    while (t < 40 && t200 == null) { step({ steer: 0, throttle: true }); t += DT; if (t100 == null && P.speed >= 27.78) t100 = t; if (t200 == null && P.speed >= 55.56) t200 = t; }
    out.accel = { t100: t100 && r2(t100), t200: t200 && r2(t200) };
  }
  // 3. skidpad: hold speed, hold lock, sample the last 0.5 s of 2 s
  out.skidpad = [];
  for (const v of [20, 30, 45, 60, 72]) for (const st of [0.2, 0.4, 0.6, 0.8, 1.0]) {
    reset(v); const acc = [];
    for (let i = 0; i < 120; i++) {
      step({ steer: st, throttle: P.speed < v - 0.2, brake: P.speed > v + 1.5 });
      if (i >= 90) acc.push(state());
    }
    const m = (k) => mean(acc.map((s) => s[k]));
    out.skidpad.push({ v, steer: st, ay_g: r2(m("ay") / G_), yaw: r3(m("yaw")), aF: r1(m("aF")), aR: r1(m("aR")), uF: r2(m("uF")), uR: r2(m("uR")), delta: r1(m("delta")) });
  }
  // 4. step steer at 50 m/s, lock 0.5
  {
    reset(50); const yr = [];
    for (let i = 0; i < 90; i++) { step({ steer: 0.5, throttle: P.speed < 49.8 }); yr.push(P.yawRateCur); }
    const fin = mean(yr.slice(-15)), pk = Math.max(...yr.map(Math.abs));
    const t10 = yr.findIndex((y) => Math.abs(y) >= 0.1 * Math.abs(fin)), t90 = yr.findIndex((y) => Math.abs(y) >= 0.9 * Math.abs(fin));
    out.stepSteer = { final: r3(fin), overshoot_pct: r1((pk / Math.abs(fin) - 1) * 100), rise_ms: Math.round((t90 - t10) * DT * 1000), t90_ms: Math.round(t90 * DT * 1000) };
  }
  // 5. turn-in at 55 m/s, lock 0.75, 0.5 s: coasting vs trail-braking
  for (const br of [false, true]) {
    reset(55); for (let i = 0; i < 30; i++) step({ steer: 0.75, brake: br });
    const s = state(); out[br ? "turnIn_brake" : "turnIn_coast"] = { yaw: r3(s.yaw), ay_g: r2(s.ay / G_), aF: r1(s.aF), aR: r1(s.aR), axFracF: r2(s.axFracF), axFracR: r2(s.axFracR) };
  }
  // 6. lift-off near the limit: 45 m/s, lock 0.8 on the throttle for 1.5 s, then off for 0.5 s
  {
    reset(45); for (let i = 0; i < 90; i++) step({ steer: 0.8, throttle: true });
    const a = state(); for (let i = 0; i < 30; i++) step({ steer: 0.8 });
    const z = state(); out.liftOff = { yaw_on: r3(a.yaw), yaw_off: r3(z.yaw), aR_on: r1(a.aR), aR_off: r1(z.aR) };
  }
  // 7. power-on at a CORNER EXIT: 28 m/s, the most lock that keeps the front
  // in its linear range after 1 s of coasting (utilisation ≤ 0.7, where its
  // force is stiffness × slip and does not care what the throttle does to its
  // load), then plant the throttle for 0.5 s. At full lock the front is near
  // its peak and the throttle's rearward weight transfer makes it wash — power
  // UNDERSTEER, in this model and the old one alike — so that is not where a
  // rear step-out is measured. Reports the lock used.
  {
    let use = 0.5, uF = 0;
    for (const st of [0.5, 0.6, 0.7, 0.8, 0.9, 1.0]) { reset(28); for (let i = 0; i < 60; i++) step({ steer: st }); const s = state(); if (s.uF <= 0.7) { use = st; uF = s.uF; } else break; }
    reset(28); for (let i = 0; i < 60; i++) step({ steer: use });
    const a = state(); for (let i = 0; i < 30; i++) step({ steer: use, throttle: true });
    const z = state(); out.powerOn = { lock: use, uF_coast: r2(uF), aR_coast: r1(a.aR), aR_power: r1(z.aR), uR_coast: r2(a.uR), uR_power: r2(z.uR), axFracF: r2(z.axFracF), axFracR: r2(z.axFracR) };
  }
  // 8. throttle charge by speed (straight, planted)
  out.throttleCharge = [];
  for (const v of [20, 30, 45, 60, 72]) { reset(v); for (let i = 0; i < 40; i++) step({ steer: 0, throttle: true }); const s = state(); out.throttleCharge.push({ v, axFracF: r2(s.axFracF), axFracR: r2(s.axFracR) }); }
  // 9. slip sweep at 45 m/s: lock ramps 0 → 1 over 3 s; the front force must PEAK
  {
    reset(45); const rows = [];
    for (let i = 0; i < 180; i++) { step({ steer: i / 179, throttle: P.speed < 44.8 }); if (i % 20 === 19) { const s = state(); rows.push({ aF: r1(s.aF), FyF_g: r2(s.FyF / G_), fF: r3(s.FyF / s.muF), aR: r1(s.aR), fR: r3(s.FyR / s.muR), ay_g: r2(s.ay / G_) }); } }
    out.slipSweep = rows;
  }
  // 10. flick vs smooth at 45 m/s, 0.6 s: heading gained
  const heading = (seq) => { reset(45); const h0 = P.head; for (const [n, inp] of seq) for (let i = 0; i < n; i++) step(inp); return r1((h0 - P.head) * DEG); };
  out.flick = { smooth_deg: heading([[36, { steer: 0.55, throttle: true }]]), fullLock_deg: heading([[36, { steer: 1.0, throttle: true }]]) };
  // 11. full lock at 45 m/s for 2 s: washes wide, never spins (the drift spec's premise)
  {
    reset(45); let yMax = 0, aRmax = 0;
    for (let i = 0; i < 120; i++) { step({ steer: 1.0, throttle: true }); yMax = Math.max(yMax, Math.abs(P.yawRateCur)); aRmax = Math.max(aRmax, Math.abs(P.slipRear) * DEG); }
    out.fullLock = { yawMax: r2(yMax), aRmax: r1(aRmax), aF: r1(P.slipFront * DEG) };
  }
  // 12. finite everywhere
  out.finite = Object.values(out).flat().every((row) => Object.values(row).every((v) => typeof v !== "number" || Number.isFinite(v)));
  b.clear();
  return out;
}

async function main() {
  const track = process.env.TRACK || "monza", frac = +(process.env.FRAC || 0);
  const g = await createGame({ track, storage: { difficulty: "normal", autoThrottle: false } });
  await g.race(track);
  const out = measure(g, frac);
  g.close();
  if (process.argv.includes("--json")) { console.log(JSON.stringify(out, null, 1)); return; }
  const row = (k) => console.log(k.padEnd(16), JSON.stringify(out[k]));
  for (const k of Object.keys(out)) if (k !== "skidpad" && k !== "slipSweep" && k !== "throttleCharge") row(k);
  console.log("throttleCharge   " + out.throttleCharge.map((r) => `${r.v}:${r.axFracF}/${r.axFracR}`).join("  "));
  console.log("skidpad  v steer  ay_g   yaw    aF     aR    uF    uR  delta");
  for (const r of out.skidpad) console.log(`  ${String(r.v).padStart(3)} ${r.steer.toFixed(1)}  ${r.ay_g.toFixed(2)}  ${r.yaw.toFixed(3)} ${String(r.aF).padStart(6)} ${String(r.aR).padStart(6)}  ${r.uF.toFixed(2)}  ${r.uR.toFixed(2)}  ${r.delta}`);
  console.log("slipSweep  aF   FyF_g  fF     aR   fR     ay_g");
  for (const r of out.slipSweep) console.log(`  ${String(r.aF).padStart(6)} ${r.FyF_g.toFixed(2)}  ${r.fF.toFixed(3)} ${String(r.aR).padStart(6)} ${r.fR.toFixed(3)}  ${r.ay_g.toFixed(2)}`);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main().catch((e) => { console.error(e); process.exit(1); });
