/* player-dynamics-shipped-vm.test.mjs — the shipped-seat twin of
 * player-dynamics-vm.test.mjs: the same pinned bench (tools/check/player-dyn.mjs)
 * on the car a fresh browser boots, createGame({ seat: "shipped" }) — no garage
 * seed, so team / parts. / setup. come from GameStore's miss path into
 * js/data/garage-defaults.js (uploaded Red Bull signature kit, 2026-10-16).
 *
 * The pin twin locks the driving model's SHAPES on an empty-sheet McLaren; this
 * one locks what the player actually drives. Measured on this tree (monza,
 * FRAC 0, `node tools/check/player-dyn.mjs --json --seat shipped`) after the
 * capacity-scaled brake ellipse fix (trail-brake-turnin) and x1.0 parts parity
 * (#6565: the player's parts read over the team's works build, Parts.playerMods;
 * Bryce chose A, x1.0 parity, on #6572 at about 10:43Z 2026-11-25, after the
 * raw-kit vs x1.0 table posted there). The shipped Red Bull signature kit reads
 * accel 0.92 / cornering 0.97 / braking 0.92 over the works car:
 *   brake from vTop 60.5 m/s   2.07 g, 2.98 s, 89.9 m   (raw kit: 3.39 g, 54.2 m)
 *   accel                      t100 6.68 s, t200 23.43 s (raw kit: 3.32, 13.73)
 *   step steer 50 m/s / 0.5    final yaw 0.433 rad/s
 *   turn-in 55 m/s / 0.75      yaw 0.894 coasting vs 1.135 braking (≥0.6×)
 *   skidpad 60 m/s / 0.8       3.35 g                   (raw kit: 5.42 g)
 *   full lock 45 m/s           yawMax 1.17 rad/s, rear slip max 8.7°
 * Each band keeps the relative width it had around the raw-kit value (lo/c and
 * hi/c unchanged; none widened), so a deliberate retune or a new GarageDefaults
 * export moves them on purpose, not by noise. One pin shape
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

let g = null, m = null, mKit = null;
before(async () => {
  g = await createGame({ track: "monza", seat: "shipped", storage: { difficulty: "normal", autoThrottle: false } });
  await g.race("monza", "day", "dry");
  m = measure(g, 0);
  const S = g.sandbox, custom = S.Teams.LIST.findIndex((t) => t.id === "custom");
  const kit = await createGame({ track: "monza", seat: "pin", storage: { difficulty: "normal", autoThrottle: false,
    team: custom, driver: 0, "parts.custom": { ...S.Parts.FACTORY_PRESETS.mercedes } } });
  try {
    await kit.race("monza", "day", "dry");
    assert.equal(kit.G.player.team.id, "custom");
    assert.ok(kit.G.player.mods.braking > 1.3, `big-brake kit braking ${kit.G.player.mods.braking}`);
    mKit = measure(kit, 0);
  } finally { kit.close(); }
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
  within(b.g_avg, 1.90, 2.25, `${top} g_avg`);
  within(b.t_s, 2.62, 3.35, `${top} t_s`);
  within(m["brake_55.6"].g_avg, 1.89, 2.24, "brake_55.6 g_avg");
  // The uploaded default changes the actual boot car from Mercedes to Red
  // Bull; x1.0 parity (#6565, decision A on #6572) re-centres it on 6.68 s with
  // the same relative width. Driving-model and handling assertions stay independent.
  within(m.accel.t100, 6.04, 7.44, "accel t100");
  within(m.accel.t200, 21.4, 28.1, "accel t200");
});

test("cornering sits in the shipped car's measured bands", () => {
  within(m.stepSteer.final, 0.39, 0.48, "step-steer final yaw");
  within(m.turnIn_coast.yaw, 0.81, 0.99, "turn-in coasting yaw");
  within(m.turnIn_brake.yaw, 0.95, 1.29, "turn-in braking yaw");
  const sk = m.skidpad.find((r) => r.v === 60 && r.steer === 0.8);
  within(sk.ay_g, 2.97, 3.64, "skidpad 60 m/s / 0.8 ay_g");
  within(m.fullLock.yawMax, 1.01, 1.29, "full-lock yawMax");
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

// The mid-corner gate (≤8° rear, ≤15 % yaw rise) runs on the explicit big-brake kit
// (MY TEAM on the Mercedes works sheet, braking ~1.49), as in trail-brake-turnin:
// Bryce's decision A on #6572. At x1.0 grip the shipped car reads 18.2° and the
// neutral AI-equivalent car ~15°: that snap is #6573's to fix, not this file's.
test("a stamp on the brakes mid-corner does not spin the big-brake kit toward the apex", () => {
  const co = mKit.midCorner_coast, br = mKit.midCorner_brake;
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
