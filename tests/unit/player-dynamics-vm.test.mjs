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
import { measure } from "../../tools/check/player-dyn.mjs";
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

test("planting the throttle at the limit steps the rear out (power-on oversteer)", () => {
  assert.ok(Math.abs(m.powerOn.aR_power) > Math.abs(m.powerOn.aR_coast) + 1,
    `rear slip must grow on the throttle (${m.powerOn.aR_coast}° → ${m.powerOn.aR_power}°)`);
});

test("lifting off near the limit rotates the car (lift-off oversteer)", () => {
  assert.ok(m.liftOff.yaw_off > m.liftOff.yaw_on * 1.05, `yaw must rise on lift (${m.liftOff.yaw_on} → ${m.liftOff.yaw_off})`);
});

test("trail braking into a corner rotates the car more than coasting in", () => {
  assert.ok(m.turnIn_brake.yaw > m.turnIn_coast.yaw * 1.05, `brake ${m.turnIn_brake.yaw} vs coast ${m.turnIn_coast.yaw}`);
  assert.ok(m.turnIn_brake.axFracF > 0.3 && m.turnIn_brake.axFracR > 0.3, "braking charges both axles");
  assert.equal(m.turnIn_coast.axFracF, 0, "coasting (engine braking) charges only the rear");
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
