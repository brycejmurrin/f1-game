/* player-dynamics-vm.test.mjs — the SHAPE of the player's driving model, in
 * the Node VM (tools/lib/game-vm.cjs — the real js/game.js, no browser), via
 * tools/check/player-dyn.mjs's pinned bench.
 *
 * physics-characterization locks the NUMBERS; this locks what the numbers
 * must be shaped like, as relative assertions, so a retune can move every
 * magnitude and still have to keep: a tyre that falls past its peak (2026-09-
 * 16: tanh never fell, so a flick at full lock cost nothing), a throttle that
 * charges the driven axle and not the undriven one, lift-off and trail
 * braking that rotate the car at the limit, and a full-lock car that washes
 * wide instead of spinning. Evidence: docs/notes/PLAYER-PHYSICS-RESEARCH-2026-09.md.
 *
 * Run: node --test tests/unit/player-dynamics-vm.test.mjs   (npm run test:game-vm)
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { measure, bench } from "../../tools/check/player-dyn.mjs";
const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");
let g = null, m = null;
before(async () => {
  g = await createGame({ track: "monza", storage: { difficulty: "normal", autoThrottle: false } });
  await g.race("monza", "day", "dry");
  m = measure(g, 0);
});
after(() => { if (g) g.close(); });

test("every measurement is finite", () => { assert.ok(m.finite, JSON.stringify(m)); });

test("the lateral force peaks and falls: past the peak a tyre gives LESS, not the same", () => {
  const f = m.slipSweep.map((r) => r.fF);
  const peakI = f.indexOf(Math.max(...f));
  assert.ok(peakI < f.length - 1, `front force must peak before full lock (peak at row ${peakI} of ${f.length})`);
  assert.ok(f[f.length - 1] < f[peakI] - 0.01, `force at full lock (${f[f.length - 1]}) must sit below the peak (${f[peakI]})`);
  const last = m.slipSweep[m.slipSweep.length - 1];
  assert.ok(last.aF < -8, `full lock at 45 m/s must be past the front's peak slip (aF=${last.aF}°)`);
});

test("a flick at full lock gains heading, but pays for it in front slip past the peak", () => {
  assert.ok(m.flick.fullLock_deg > m.flick.smooth_deg, "more lock still turns more");
  assert.ok(m.flick.fullLock_deg < m.flick.smooth_deg * 3, `full lock must not out-turn a moderate input 3× (${m.flick.fullLock_deg} vs ${m.flick.smooth_deg})`);
});

test("the throttle charges the driven rear axle, never the undriven front", () => {
  for (const r of m.throttleCharge) {
    assert.equal(r.axFracF, 0, `front spends nothing on the pedal at ${r.v} m/s (axFracF=${r.axFracF})`);
    assert.ok(r.axFracR > 0.3, `rear spends the circle at ${r.v} m/s (axFracR=${r.axFracR})`);
  }
  const lo = m.throttleCharge[0].axFracR, hi = m.throttleCharge[m.throttleCharge.length - 1].axFracR;
  assert.ok(lo > hi, `traction-limited at low speed, power-limited at high (${lo} vs ${hi})`);
});

test("on the throttle the rear pays the ellipse and the front pays for the weight it loses — no power-on oversteer without a slip ratio", () => {
  // The honest tier-1 shape (measured with the field parked, 2026-09-16): at
  // a 28 m/s exit the rear's charge is at THR_FLOOR..THR_CAP, the front's is
  // zero, and the throttle's rearward weight transfer costs the front MORE
  // grip than the ellipse costs the rear — so the balance moves to understeer
  // and the rear's slip does not grow. A rear that steps out on the pedal
  // needs a slip ratio (tier 2 in docs/notes/PLAYER-PHYSICS-PLAN-TIER2-2026-09.md).
  assert.equal(m.powerOn.axFracF, 0, "the front spends nothing on the throttle");
  assert.ok(m.powerOn.axFracR >= 0.3, `the rear pays the ellipse on the throttle (axFracR=${m.powerOn.axFracR})`);
  assert.ok(Math.abs(m.powerOn.aR_power - m.powerOn.aR_coast) < 3, `the rear must not snap either way at a corner exit (${m.powerOn.aR_coast}° → ${m.powerOn.aR_power}°)`);
});

test("braking wins over a held throttle: the rear is not charged for thrust that braking does not make", () => {
  // Auto-throttle (touch / tilt) and W-under-brake keep onThrottle true while the
  // speed integrator and axEstTarget already let `braking` win. The grip model
  // used to charge the driven rear clamp(THR_VK/vStd, THR_FLOOR, THR_CAP) of
  // LONG_GRIP anyway (measured 30 m/s, 0.75 lock: axFracR 0.39 -> 0.62, rear grip
  // 8.9 -> 7.6), defeating the rear brake-by-wire (BRAKE_STAB).
  const b = bench(g, 0);
  const run = (v0, thr) => {
    b.reset(v0);
    for (let i = 0; i < 30; i++) b.step({ steer: 0.75, brake: true, throttle: thr });
    return b.state();
  };
  for (const v0 of [30, 55]) {
    const brakeOnly = run(v0, false), both = run(v0, true);
    assert.ok(brakeOnly.axFracR > 0.1, `the rear carries its pedal share at ${v0} m/s (axFracR=${brakeOnly.axFracR})`);
    for (const k of ["axFracR", "axFracF", "yaw", "muR", "uR"])
      assert.ok(Math.abs(both[k] - brakeOnly[k]) <= 0.01 * Math.abs(brakeOnly[k]) + 1e-9,
        `${v0} m/s ${k}: brake+throttle ${both[k]} vs brake ${brakeOnly[k]}`);
  }
});

test("frontUtil is 1.0 where the front's lateral force peaks (the front curve peaks at CURVE_PEAK_X_F, not pi/2)", () => {
  const { TyreModel } = g.sandbox;
  assert.ok(TyreModel.CURVE_PEAK_X_F < TyreModel.CURVE_PEAK_X, "the front peaks earlier than the nominal curve");
  // The front force is muF·sin(k·x) up to its peak, k = (pi/2)/CURVE_PEAK_X_F, so
  // |Fy|/muF reaches 1 exactly where x = CURVE_PEAK_X_F. frontUtil is x / peak:
  // read off the live car across a steer sweep, the force ratio must follow
  // sin(frontUtil·pi/2) below util 1 and sit at ~1 (the maximum) at util 1.
  const b = bench(g, 0);
  const rows = [];
  // steer is shaped (nonlinear), so the approach to the peak is dense in 0.40-0.60
  for (const st of [0.3, 0.4, 0.42, 0.44, 0.46, 0.48, 0.5, 0.52, 0.54, 0.56, 0.58, 0.6, 0.8, 1.0]) {
    b.reset(40);
    for (let i = 0; i < 20; i++) b.step({ steer: st, throttle: b.P.speed < 39.8 });
    const s = b.state();
    rows.push({ u: s.uF, f: s.FyF / s.muF });
  }
  const near = rows.filter((r) => r.u > 0.3 && r.u <= 1.05);
  assert.ok(near.length >= 2, `the sweep samples the approach to the peak (${JSON.stringify(rows)})`);
  for (const r of near) assert.ok(Math.abs(r.f - Math.sin(Math.min(r.u, 1) * Math.PI / 2)) <= 0.02, `|Fy|/muF ${r.f.toFixed(3)} at frontUtil ${r.u.toFixed(3)} is off the curve`);
  const peak = rows.reduce((a, r) => (r.f > a.f ? r : a));
  assert.ok(peak.f > 0.99, `the sweep reaches the force peak (${peak.f.toFixed(3)})`);
  assert.ok(peak.u >= 0.98 - 1e-9, `the force peak (${peak.f.toFixed(4)} of muF) sits at frontUtil ~1 (u=${peak.u.toFixed(3)}; pre-fix it read 0.78 there)`);
  assert.ok(rows.every((r) => r.f < 0.99 || r.u >= 0.98), `no row hits the force peak while frontUtil still reads below 0.98: ${JSON.stringify(rows)}`);
});

test("lifting off near the limit rotates the car (lift-off oversteer)", () => {
  assert.ok(m.liftOff.yaw_off > m.liftOff.yaw_on * 1.05, `yaw must rise on lift (${m.liftOff.yaw_on} → ${m.liftOff.yaw_off})`);
});

test("trail braking into a corner rotates the car more than coasting in", () => {
  assert.ok(m.turnIn_brake.yaw > m.turnIn_coast.yaw * 1.02, `brake ${m.turnIn_brake.yaw} vs coast ${m.turnIn_coast.yaw}`);
  // A straight-line stop charges both axles the same (BRAKE_STAB is idle with
  // the rear unloaded); turning in on the brakes the rear's pedal share eases
  // as it nears its limit and the front carries more of the circle.
  const stop = m["brake_55.6"];
  assert.ok(stop.axFracF > 0.3 && stop.axFracR > 0.3 && Math.abs(stop.axFracF - stop.axFracR) < 0.02, `a straight stop charges both axles alike (${stop.axFracF}/${stop.axFracR})`);
  assert.ok(m.turnIn_brake.axFracF > 0.3, "braking charges the front");
  assert.ok(m.turnIn_brake.axFracR < m.turnIn_brake.axFracF, `the loaded rear pays less of the pedal (${m.turnIn_brake.axFracR} < ${m.turnIn_brake.axFracF})`);
  assert.equal(m.turnIn_coast.axFracF, 0, "coasting (engine braking) charges only the rear");
});

test("a stamp on the brakes mid-corner at the limit does not spin the car toward the apex", () => {
  // Owner report 2026-09-29. Before BRAKE_STAB (js/physics/consts.js) the same
  // stamp took the rear to 22 deg and yawed the car 1.7x faster than a coast.
  const co = m.midCorner_coast, br = m.midCorner_brake;
  assert.ok(co.uR0 > 0.45, `the skidpad is near the rear's limit (uR ${co.uR0})`);
  assert.ok(br.aRmax < co.aRmax * 2.6, `the rear holds: ${br.aRmax} deg braking vs ${co.aRmax} deg coasting`);
  assert.ok(br.yawMean < co.yawMean * 1.25, `no snap to the inside: yaw ${br.yawMean} braking vs ${co.yawMean} coasting`);
});

test("full lock at 45 m/s washes wide and never spins", () => {
  assert.ok(m.fullLock.yawMax < 2.0, `yaw rate stays bounded (${m.fullLock.yawMax} rad/s)`);
  assert.ok(m.fullLock.aRmax < 20, `the rear never lets go outright (${m.fullLock.aRmax}°)`);
  assert.ok(Math.abs(m.fullLock.aF) > m.fullLock.aRmax, "the front, not the rear, is the axle past its limit");
});

test("more lock is more lateral g up to the front's limit, then no more (understeer-limited)", () => {
  for (const v of [30, 45, 60]) {
    const rows = m.skidpad.filter((r) => r.v === v);
    for (let i = 1; i < rows.length - 1; i++) assert.ok(rows[i].ay_g >= rows[i - 1].ay_g - 0.02, `v=${v}: ay must not fall between lock ${rows[i - 1].steer} and ${rows[i].steer}`);
    assert.ok(rows[rows.length - 1].uF >= rows[rows.length - 1].uR, `v=${v}: the front saturates first at full lock`);
  }
});

// Hold position on a straight, preserving speed, so barriers/corners cannot
// turn a surface-force comparison into a collision or rescue measurement.
test("grass never becomes a braking shortcut across pace, worn tyres and weak brakes", async () => {
  const physicsBefore = { ...g.apex.tuning() };
  await g.race("monza", "day", "dry");
  const P = g.G.player;
  for (const c of g.G.cars) if (c !== P) { c.retired = true; c.x = 80; }
  const originalMods = P.mods;
  g.G.tyres.setLevel("real");
  const distance = (pace, lateral, wear) => {
    g.apex.jump(0, 50 * pace, lateral);
    const pin = { px:P.px, pz:P.pz, s:P.s, x:P.x, head:P.head };
    let d = 0, ticks = 0;
    g.apex.setInput({ brake:true, throttle:false, steer:0 });
    while (P.speed > 20 * pace && ticks++ < 2000) {
      Object.assign(P, pin, { vLat:0, yawRateCur:0, offT:0, rescueT:0, wallT:0,
        tyreWear:wear, tyreWearF:wear, tyreWearR:wear });
      g.step(1, 1/60);
      assert.equal(P.offroad, lateral !== 0, "fixture must stay on its intended surface");
      d += Math.max(0, P.speed) / 60;
    }
    assert.ok(ticks < 2000, "braking must reach target speed");
    g.apex.clearInput(); return d;
  };
  try {
    for (let notch = 1; notch <= 19; notch++) {
      const pace = 1.06 ** (notch - 14); g.apex.setPhysics({ pace });
      for (const braking of [.5, 1]) for (const wear of [0, .9]) {
        P.mods = { ...originalMods, braking };
        const road = distance(pace, 0, wear);
        for (const lat of [-10, -14]) {
          const grass = distance(pace, lat, wear);
          assert.ok(grass > road, JSON.stringify({notch,braking,wear,lat,road,grass}));
        }
      }
    }
  } finally { P.mods = originalMods; g.apex.clearInput(); g.apex.setPhysics(physicsBefore); }
});

test("grass braking stays monotonic and can stop below the drag floor with worn weak brakes", async () => {
  await g.race("monza", "day", "dry");
  const P = g.G.player, originalMods = P.mods;
  const physicsBefore = { ...g.apex.tuning() };
  g.apex.setPhysics({ pace: 1 });
  P.mods = { ...originalMods, braking: .5 };
  for (const c of g.G.cars) if (c !== P) { c.retired = true; c.x = 80; }
  g.G.tyres.setLevel("real");
  const pinWear = () => Object.assign(P, { tyreWear: .9, tyreWearF: .9, tyreWearR: .9,
    offT: 0, rescueT: 0, wallT: 0, vLat: 0, yawRateCur: 0 });
  try {
    let previous = Infinity;
    for (const brakeLevel of [0, .15, .5, 1]) {
      g.apex.jump(0, 40, -14); pinWear();
      g.apex.setInput({ brake: true, brakeLevel, throttle: false, steer: 0 });
      g.step(1, 1 / 60);
      assert.ok(P.offroad, "fixture must be grass");
      assert.ok(P.speed <= previous, "more pedal must never reduce deceleration");
      previous = P.speed;
    }
    g.apex.jump(0, 5, -14);
    const pin = { px: P.px, pz: P.pz, s: P.s, x: P.x, head: P.head };
    g.apex.setInput({ brake: true, brakeLevel: 1, throttle: false, steer: 0 });
    let ticks = 0;
    while (P.speed > 0 && ticks++ < 2000) {
      Object.assign(P, pin); pinWear(); g.step(1, 1 / 60);
    }
    assert.equal(P.speed, 0, "pedal force must remain below the passive-drag floor");
  } finally { P.mods = originalMods; g.apex.clearInput(); g.apex.setPhysics(physicsBefore); }
});

// ── stopped-car regressions (16217f3c1) — not the bench: the live model on a real
// circuit. Kept out of offtrack-vm, which must declare exactly its spec's tests.

// Coulomb bleed: the slip model fades both tyre forces to zero near a
// standstill, so a spun or shunted car that stopped with lateral velocity
// skated sideways at constant speed (2.000 -> 1.998 m/s and 8 m over 4 s,
// measured with the bleed reverted). A sliding tyre still has friction there.
test("a stopped car with residual lateral velocity comes to rest laterally (Coulomb bleed)", async () => {
  await g.race("monza", "day", "dry");
  const a = g.apex, P = g.G.player, physicsBefore = { ...a.tuning() };
  a.setPhysics({ pace: 1, drift: 0 });
  try {
    for (const v0 of [2, -2]) {
      a.jump(0.3, 0, 0);
      const x0 = a.physState().x;
      P.vLat = v0;                                  // the shunt's leftover sideways slide
      for (let i = 0; i < 240; i++) { a.setInput({ steer: 0, throttle: false }); a.step(1 / 60, 1); }
      a.clearInput();
      const ps = a.physState();
      assert.ok(Math.abs(ps.speed) < 0.5, `vLat ${v0}: anti-vacuity — the car must still be stopped (speed ${ps.speed})`);
      assert.ok(Math.abs(P.vLat || 0) < 0.05, `vLat ${v0}: still sliding sideways at ${P.vLat} m/s after 4 s`);
      assert.ok(Math.abs(ps.x - x0) < 0.5, `vLat ${v0}: skated ${(ps.x - x0).toFixed(2)} m sideways while stopped`);
    }
  } finally { a.clearInput(); a.setPhysics(physicsBefore); }
});

// Brake-to-reverse on a DESCENT: offtrack-vm's reverse test is flat. On a
// descent, slope gravity's a·dt re-took the `speed > 0` braking branch every
// step and fought the reverse crawl. A car the BRAKES hold takes no gravity
// feed, so the crawl builds at REVERSE_ACCEL exactly as on the flat. Measured on
// spa's steepest descent (-16.8 %): -5.00 m/s after 1 s with the fix, -3.63
// without (on this tree the crawl still engages without the fix, only slower).
test("brake at a standstill on a spa DESCENT reverses at the flat-ground rate", async () => {
  await g.race("spa", "day", "dry");
  const a = g.apex, physicsBefore = { ...a.tuning() }, L = g.G.track.total, N = 400;
  a.setPhysics({ pace: 1, drift: 0 });
  try {
    // The steepest downhill on the lap, from the road's own elevation.
    const ys = Array.from({ length: N }, (_, i) => a.groundY(i / N, 0).roadY);
    let f = 0, grade = 0;
    for (let i = 0; i < N; i++) {
      const gr = (ys[(i + 1) % N] - ys[i]) / (L / N);
      if (gr < grade) { grade = gr; f = i / N; }
    }
    assert.ok(grade < -0.1, `anti-vacuity: spa's steepest descent is only ${(grade * 100).toFixed(1)} %`);
    const { REVERSE_ACCEL, REVERSE_MAX } = g.sandbox.PhysicsConsts;
    a.jump(f, 0, 0);
    let atHalf = 0;
    for (let i = 0; i < 60; i++) {
      a.setInput({ steer: 0, brake: true });
      a.step(1 / 60, 1);
      if (i === 29) atHalf = a.physState().speed;
    }
    const rev = a.physState().speed;
    assert.ok(rev < -2 && rev > -9, `offtrack-vm's flat band: ${rev.toFixed(2)} m/s`);
    // ...and gravity does not slow the crawl: 0.5 s builds at least 90 % of the
    // flat-ground REVERSE_ACCEL, and 1 s reaches the REVERSE_MAX cap.
    assert.ok(atHalf < -0.9 * REVERSE_ACCEL * 0.5,
      `at f=${f} (${(grade * 100).toFixed(1)} %): ${atHalf.toFixed(2)} m/s after 0.5 s — gravity is fighting the crawl`);
    assert.ok(rev < 0.9 * REVERSE_MAX, `at f=${f}: ${rev.toFixed(2)} m/s after 1 s; the flat crawl reaches ${REVERSE_MAX}`);
  } finally { a.clearInput(); a.setPhysics(physicsBefore); }
});

// LATERAL BASIS (2026-10-04). PlayerForces integrates +vLat as the car's
// RIGHT (axle slip vLat ± a·r, transport −u·r, +yawRate = nose right), and the
// road's right is t × up = (−fz, fx) for a heading (fx, fz). game.js wrote the
// slip back along (fz, −fx) — the LEFT vector — so the world travel direction
// carried the body-slip angle MIRRORED: β_world = −β_dyn exactly (VM, monza,
// 40 m/s steer 0.6: +2.00° vs −2.00°), and a slide swung the car toward the
// inside of the corner instead of carrying it wide. Every yaw/vLat/force value
// is identical either way (the writeback is one-way); only the world path moved.
// Low speed is the kinematic check: at 15 m/s the travel direction sits INSIDE
// the nose (vLat > 0 in a right-hand turn), which the mirror put outside. The
// identity is exact (measured residual < 3e-13 rad), so the bound is 1e-9.
test("the world path carries the body slip the dynamics integrate (travel − heading == atan2(vLat, u))", () => {
  const a = g.apex, P = g.G.player;
  try {
    for (const [v0, inp, label] of [[40, { throttle: true, steer: 0.6 }, "40 m/s at the limit"],
                                    [15, { steer: 0.8 }, "15 m/s kinematic"]]) {
      a.jump(0, v0, 0);
      let px = P.px, pz = P.pz, n = 0, worst = 0;
      for (let i = 0; i < 40; i++) {
        a.setInput(inp); a.step(1 / 60, 1);
        const dx = P.px - px, dz = P.pz - pz; px = P.px; pz = P.pz;
        const fx = Math.sin(P.head), fz = Math.cos(P.head);
        const bWorld = Math.atan2(-dx * fz + dz * fx, dx * fx + dz * fz);   // travel vs nose, + = right
        const bDyn = Math.atan2(P.vLat || 0, Math.max(1, Math.abs(P.speed)));
        if (Math.abs(bDyn) < 0.004) continue;   // under ~0.25°: the sign is not the question yet
        n++; worst = Math.max(worst, Math.abs(bWorld - bDyn));
        assert.ok(Math.sign(bWorld) === Math.sign(bDyn),
          `${label}, tick ${i}: travel is ${(bWorld * 57.3).toFixed(2)}° off the nose, the dynamics slide ${(bDyn * 57.3).toFixed(2)}° — mirrored`);
      }
      assert.ok(n >= 20, `${label}: anti-vacuity — only ${n} ticks carried a slip`);
      assert.ok(worst < 1e-9, `${label}: world slip differs from the dynamics by up to ${(worst * 57.3).toFixed(3)}°`);
    }
  } finally { a.clearInput(); }
});

// Brake held from a standstill is REVERSE (REVERSE_ACCEL), not a 30+ m/s^2
// stop. axEstTarget charged the full brake to the friction circle, so the
// fronts "locked" (wheelLock 0.48, skid squeal) and a flat spot saturated
// in 12 s of backing off a wall.
test("reversing on the brake does not lock the wheels or grow a flat spot", async () => {
  await g.race("monza", "day", "dry");
  const a = g.apex, P = g.G.player;
  for (const c of g.G.cars) if (c !== P) { c.x = 80; c.speed = 0; }
  try {
    a.jump(0.1, 0, 0);
    P.flatSpot = 0;
    a.setInput({ brake: true, throttle: false, steer: 0 });
    a.step(1 / 60, 240);
    assert.ok(P.speed < -2, `anti-vacuity: the car is reversing (${P.speed.toFixed(2)} m/s)`);
    assert.equal(P.wheelLock, 0, "no lock-up while reversing");
    assert.ok(P.axFracF < 0.2, `the pedal is not charged to the front axle (${P.axFracF.toFixed(3)})`);
    assert.ok((P.flatSpot || 0) < 0.05, `no flat spot from reversing (${(P.flatSpot || 0).toFixed(3)})`);
  } finally { a.clearInput(); }
});

// A human already reversing keeps its sign through a contact: every response
// floored c.speed at 0, so backing out of a side-by-side wedge lost the whole
// -5 m/s on the first touch.
test("a player reversing past a parked car alongside keeps its reverse speed", async () => {
  await g.race("monza", "day", "dry");
  const a = g.apex, P = g.G.player, others = g.G.cars.filter((c) => c !== P);
  for (const c of others) { c.x = 60; c.speed = 0; }
  try {
    a.jump(0.3, 0, 0);
    a.setInput({ brake: true, throttle: false, steer: 0 });
    a.step(1 / 60, 90);
    const before = P.speed;
    assert.ok(before < -3, `anti-vacuity: reversing (${before.toFixed(2)})`);
    const A = others[0];
    A.s = P.s + 3.5; A.prog = P.prog + 3.5; A.x = P.x + 1.7; A.speed = 0; A._snapProg = A.prog; A._snapX = A.x;
    let touched = false;
    for (let i = 0; i < 6; i++) { a.step(1 / 60, 1); if ((P.contactT || 0) > 0) touched = true; }
    assert.ok(touched, "anti-vacuity: the cars touched");
    assert.ok(P.speed < 0.8 * before, `reverse survives the contact: ${before.toFixed(2)} -> ${P.speed.toFixed(2)}`);
    A.x = 60;
  } finally { a.clearInput(); }
});

// Slope gravity ran along the road tangent whatever way the car faced: a car
// spun round on a climb (really facing DOWNhill) was slowed as if climbing.
test("a car facing backwards on a climb is fed by gravity, not slowed by it", async () => {
  await g.race("suzuka", "day", "dry");
  const a = g.apex, P = g.G.player, T = g.G.track;
  for (const c of g.G.cars) if (c !== P) { c.x = 60; c.speed = 0; }
  const Tr = g.sandbox.Tracks, smp = { p: [0, 0, 0], t: [0, 0, 0], r: [0, 0, 0], n: [0, 0, 0] };
  let best = 0, bs = 0;
  for (let s = 0; s < T.total; s += 4) { Tr.sample(T, s, smp); if (smp.t[1] > best) { best = smp.t[1]; bs = s; } }
  assert.ok(best > 0.05, `anti-vacuity: suzuka's steepest climb is ${(best * 100).toFixed(1)} %`);
  const run = (flip) => {
    a.jump(bs / T.total, 20, 0);
    if (flip) P.head += Math.PI;
    a.setInput({ throttle: false, brake: false, steer: 0 });
    const v0 = P.speed;
    a.step(1 / 60, 30);
    return P.speed - v0;
  };
  try {
    const up = run(false), down = run(true);
    // Same coast drag both ways; gravity flips sign, so facing downhill loses
    // clearly less than facing uphill (it lost slightly MORE before the fix).
    assert.ok(down > up + 0.5, `facing downhill dv ${down.toFixed(3)} vs uphill ${up.toFixed(3)}`);
  } finally { a.clearInput(); }
});

// Manual gearbox bog: (speed - lo)/(hi - lo) with reverse speed drives gearMult
// to 0, so throttle cannot leave REVERSE_MAX until rescue (~1 s). Own boot —
// the shared g is auto gears (gearMult stays 1). Before fix: mid05 stayed at
// -5 (d=0); after: d≈+2.4 within 0.5 s, rescueT < 0.9.
test("manual gearbox: throttle leaves reverse within 0.5 s (no rescue)", async () => {
  const gm = await createGame({
    track: "monza",
    storage: { difficulty: "normal", autoThrottle: false, manual: true },
  });
  try {
    await gm.race("monza", "day", "dry");
    const a = gm.apex;
    a.setPhysics({ pace: 1, drift: 0 });
    a.jump(0.0, 0, 0);
    gm.G.player.energy = 0;
    for (let i = 0; i < 90; i++) { a.setInput({ steer: 0, brake: true }); a.step(1 / 60, 1); }
    const rev = a.physState().speed;
    assert.ok(rev < -2 && rev > -9, `reverse crawl: ${rev.toFixed(2)} m/s`);
    for (let i = 0; i < 30; i++) { a.setInput({ steer: 0, throttle: true }); a.step(1 / 60, 1); }
    const mid = a.physState().speed;
    a.clearInput();
    assert.ok(mid > rev + 1.5,
      `manual reverse throttle must accelerate within 0.5s (before rescue); rev=${rev.toFixed(2)} mid=${mid.toFixed(2)}`);
    assert.ok((gm.G.player.rescueT || 0) < 0.9,
      `must not rely on rescue to leave reverse; rescueT=${gm.G.player.rescueT}`);
  } finally { gm.close(); }
});

test("a light LIVE analog brake: the weight-transfer estimate tracks the decel actually applied", () => {
  // #888 floored a live pedal's decel at COAST_DRAG (it skips the coast drag) but
  // left axEstTarget on BRAKE·level, so a 0.1 DualSense trigger slowed at ~6 m/s²
  // while loadF/loadR were sized for ~2.2 — light trail-braking under-loaded the
  // front. ONE value (brakeDecel) now feeds both. The pedal goes through Input
  // (no setInput: a scripted pedal is exact and never takes the floor).
  const a = g.apex, I = g.sandbox.Input;
  const saved = { braking: I.braking, brakeLevel: I.brakeLevel, throttle: I.throttle };
  try {
    a.setPhysics({ pace: 1 });
    a.clearInput();
    a.jump(0.0, 60, 0);
    I.braking = () => true; I.brakeLevel = () => 0.1; I.throttle = () => false;
    const v0 = a.probe().speed;
    for (let i = 0; i < 30; i++) a.step(1 / 60, 1);
    const decel = (v0 - a.probe().speed) / 0.5;
    const axEst = a.physState().axEstSm;
    assert.ok(decel > 5, `a live 0.1 pedal never slows less than lifting (${decel.toFixed(2)} m/s²)`);
    assert.ok(Math.abs(-axEst - decel) < 0.5,
      `axEstSm (${axEst}) must track the applied decel (${decel.toFixed(2)} m/s²), not BRAKE·level`);
  } finally { Object.assign(I, saved); a.clearInput(); }
});
