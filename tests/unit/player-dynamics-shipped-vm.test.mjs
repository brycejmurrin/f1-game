/* player-dynamics-shipped-vm.test.mjs — the shipped-seat twin of
 * player-dynamics-vm.test.mjs: the same pinned bench (tools/check/player-dyn.mjs)
 * on the car a fresh browser boots, createGame({ seat: "shipped" }) — no garage
 * seed, so team / parts. / setup. come from GameStore's miss path into
 * js/data/garage-defaults.js (Mercedes and its signature kit, 2026-10-14).
 *
 * The pin twin locks the driving model's SHAPES on an empty-sheet McLaren; this
 * one locks what the player actually drives. Measured on this tree (monza,
 * FRAC 0, `node tools/check/player-dyn.mjs --json --seat shipped`) after the
 * capacity-scaled brake ellipse fix (trail-brake-turnin):
 *   brake from vTop 60.5 m/s   3.39 g, 1.82 s, 54.3 m
 *   accel                      t100 4.02 s, t200 14.37 s
 *   step steer 50 m/s / 0.5    final yaw 0.447 rad/s
 *   turn-in 55 m/s / 0.75      yaw 1.037 coasting vs 0.965 braking (≥0.6×)
 *   skidpad 60 m/s / 0.8       5.35 g
 *   full lock 45 m/s           yawMax 1.60 rad/s, rear slip max 12.5°
 * The bands below sit ~8-15 % around those, so a deliberate retune or a new
 * GarageDefaults export moves them on purpose, not by noise. One pin shape
 * still does NOT hold here: at 45 m/s full lock the front never reaches its
 * force peak (recorded, not asserted away). Trail-brake turn-in now meets the
 * ≥0.6× coasting target on this seat (was −0.224 vs 1.037 before the fix).
 *
 * Run: node --test tests/unit/player-dynamics-shipped-vm.test.mjs
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { measure } from "../../tools/check/player-dyn.mjs";
const require = createRequire(import.meta.url);
const { createGame, SEATS } = require("../../tools/lib/game-vm.cjs");

let g = null, m = null;
before(async () => {
  g = await createGame({ track: "monza", seat: "shipped", storage: { difficulty: "normal", autoThrottle: false } });
  await g.race("monza", "day", "dry");
  m = measure(g, 0);
});
after(() => { if (g) g.close(); });

const within = (v, lo, hi, what) => assert.ok(v >= lo && v <= hi, `${what}: ${v} outside [${lo}, ${hi}]`);

test("the shipped seat is the GarageDefaults team and parts sheet, read through the game's own store", () => {
  const { GarageDefaults, Teams } = g.sandbox;
  const team = Teams.LIST[GarageDefaults.get("team")].id;
  assert.equal(g.seat.name, "shipped");
  assert.equal(g.seat.team, team, `booted ${g.seat.team}, GarageDefaults ships ${team}`);
  assert.equal(g.G.player.team.id, team, "the player car is the seated team");
  assert.deepEqual(g.seat.parts, JSON.parse(JSON.stringify(GarageDefaults.get("parts." + team))));
  assert.ok(Object.keys(g.seat.parts).length >= 10, `anti-vacuity: a full signature kit (${JSON.stringify(g.seat.parts)})`);
  assert.equal(g.sandbox.localStorage.getItem("apex26.team"), null, "no garage key was seeded");
});

test("the pin seat is still McLaren on an empty sheet", () => {
  assert.deepEqual(JSON.parse(JSON.stringify(SEATS.pin)), { team: 2, "parts.mclaren": {} });
  assert.deepEqual(JSON.parse(JSON.stringify(SEATS.shipped)), {});
});

test("every measurement is finite", () => { assert.ok(m.finite, JSON.stringify(m)); });

test("braking and acceleration sit in the shipped car's measured bands", () => {
  const top = Object.keys(m).find((k) => k.startsWith("brake_") && k !== "brake_27.8" && k !== "brake_55.6");
  const b = m[top];
  within(b.g_avg, 3.1, 3.7, `${top} g_avg`);
  within(b.t_s, 1.6, 2.05, `${top} t_s`);
  within(m["brake_55.6"].g_avg, 3.1, 3.7, "brake_55.6 g_avg");
  within(m.accel.t100, 3.6, 4.5, "accel t100");
  within(m.accel.t200, 12.5, 16.5, "accel t200");
});

test("cornering sits in the shipped car's measured bands", () => {
  within(m.stepSteer.final, 0.40, 0.50, "step-steer final yaw");
  within(m.turnIn_coast.yaw, 0.93, 1.15, "turn-in coasting yaw");
  within(m.turnIn_brake.yaw, 0.80, 1.10, "turn-in braking yaw");
  const sk = m.skidpad.find((r) => r.v === 60 && r.steer === 0.8);
  within(sk.ay_g, 4.8, 5.9, "skidpad 60 m/s / 0.8 ay_g");
  within(m.fullLock.yawMax, 1.4, 1.8, "full-lock yawMax");
});

test("trail braking at 55 m/s keeps at least 0.6× coasting yaw (capacity-scaled ellipse)", () => {
  assert.ok(m.turnIn_brake.yaw >= m.turnIn_coast.yaw * 0.6,
    `brake ${m.turnIn_brake.yaw} vs coast ${m.turnIn_coast.yaw}`);
  assert.ok(m.turnIn_brake.axFracF > 0.3 && m.turnIn_brake.axFracF < 0.9,
    `full pedal must not empty the front circle (axFracF=${m.turnIn_brake.axFracF})`);
  assert.ok(m.turnIn_brake.axFracR > 0.1, "the pedal still charges the rear");
  assert.equal(m.turnIn_coast.axFracF, 0, "coasting (engine braking) charges only the rear");
});

test("the throttle charges the driven rear axle, never the undriven front", () => {
  for (const r of m.throttleCharge) {
    assert.equal(r.axFracF, 0, `front spends nothing on the pedal at ${r.v} m/s`);
    assert.ok(r.axFracR > 0.3, `rear spends the circle at ${r.v} m/s (axFracR=${r.axFracR})`);
  }
  assert.ok(m.throttleCharge[0].axFracR > m.throttleCharge[m.throttleCharge.length - 1].axFracR, "traction-limited low, power-limited high");
});

test("a stamp on the brakes mid-corner does not spin the shipped car toward the apex", () => {
  const co = m.midCorner_coast, br = m.midCorner_brake;
  assert.ok(br.aRmax <= 8, `rear slip ${br.aRmax}° (want ≤8°)`);
  assert.ok(br.yawMean <= co.yawMean * 1.15, `yaw rise ${br.yawMean} vs coast ${co.yawMean} (want ≤15%)`);
});

test("full lock at 45 m/s stays bounded and never spins", () => {
  assert.ok(m.fullLock.yawMax < 2.0, `yaw rate stays bounded (${m.fullLock.yawMax} rad/s)`);
  assert.ok(m.fullLock.aRmax < 20, `the rear never lets go outright (${m.fullLock.aRmax}°)`);
  assert.ok(Math.abs(m.fullLock.aF) > 8, `full lock still slips the front (${m.fullLock.aF}°)`);
});

test("more lock is more lateral g up to the front's limit, then no more", () => {
  for (const v of [30, 45, 60]) {
    const rows = m.skidpad.filter((r) => r.v === v);
    for (let i = 1; i < rows.length - 1; i++) assert.ok(rows[i].ay_g >= rows[i - 1].ay_g - 0.02, `v=${v}: ay falls between lock ${rows[i - 1].steer} and ${rows[i].steer}`);
    assert.ok(rows[rows.length - 1].uF >= rows[rows.length - 1].uR, `v=${v}: the front saturates first at full lock`);
  }
});
