/* trail-brake-turnin.test.mjs — capacity-scaled brake ellipse + yaw damp.
 *
 * Kits with mods.braking > 1 (the shipped Mercedes) used to bill absolute
 * deceleration against fixed LONG_GRIP / BRAKE in player-forces.js, so a full
 * pedal stamped ~0.98 of the front circle and saturated brakeYawDamp at 2.4×.
 * Measured: turn-in at 55 m/s / lock 0.75 gave yaw 1.037 coasting vs −0.224
 * braking on shipped (#1474). The fix scales the PEDAL bill and (when the
 * pedal is in) the yaw-damp denominator by max(1, mods.braking); pin /
 * coast / lift-off stay bit-identical.
 *
 * Targets (both seats, player-dyn bench):
 *   - braked turn-in yaw ≥ 0.6 × coasting
 *   - mid-corner brake stamp: rear slip ≤ 8° and yaw mean rise ≤ 15%
 *     (pin mid-corner aRmax is still the #1266 front-peak 14.6° — the
 *     capacity scale is a no-op when mods.braking ≤ 1; do not reopen that
 *     snap by pretending this fix tightened it)
 *
 * Run: node --test tests/unit/trail-brake-turnin.test.mjs
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { measure } from "../../tools/check/player-dyn.mjs";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

let gPin = null, gShip = null, mPin = null, mShip = null;
before(async () => {
  gPin = await createGame({ track: "monza", seat: "pin", storage: { difficulty: "normal", autoThrottle: false } });
  await gPin.race("monza", "day", "dry");
  mPin = measure(gPin, 0);
  gShip = await createGame({ track: "monza", seat: "shipped", storage: { difficulty: "normal", autoThrottle: false } });
  await gShip.race("monza", "day", "dry");
  mShip = measure(gShip, 0);
});
after(() => {
  if (gPin) gPin.close();
  if (gShip) gShip.close();
});

test("source: pedal and yaw damp key off brakeScale / yawBrakeCap, not bare BRAKE", () => {
  const forces = fs.readFileSync(path.join(ROOT, "js/physics/player-forces.js"), "utf8");
  assert.ok(/brakeScale\s*=\s*Math\.max\(\s*1\s*,/.test(forces), "brakeScale = max(1, mods.braking)");
  assert.ok(/longBudget\s*\*\s*brakeScale/.test(forces), "pedal divides by longBudget * brakeScale");
  assert.ok(/yawBrakeCap\s*=\s*BRAKE\s*\*\s*\(1\s*\+\s*\(brakeScale\s*-\s*1\)\s*\*\s*brakeMix\)/.test(forces),
    "yawBrakeCap blends to BRAKE*brakeScale only while the pedal is in");
  assert.ok(/clamp\(\s*decel\s*\/\s*yawBrakeCap/.test(forces), "brakeYawDamp uses yawBrakeCap");
  assert.ok(!/clamp\(\s*-\(c\.axEstSm\s*\?\?\s*0\)\s*\/\s*BRAKE/.test(forces),
    "no bare axEstSm / BRAKE yaw-damp (the saturating form)");
  // #1497 low-speed substep must stay intact.
  assert.ok(/LOW_YAW_V\s*=\s*8/.test(forces), "LOW_YAW_V = 8 intact");
  assert.ok(/LOW_YAW_SUBS\s*=\s*4/.test(forces), "LOW_YAW_SUBS = 4 intact");
});

function assertTurnIn(m, seat) {
  const co = m.turnIn_coast.yaw, br = m.turnIn_brake.yaw;
  assert.ok(co > 0, `${seat} coasting turn-in yaw must be positive (${co})`);
  assert.ok(br >= co * 0.6, `${seat} braked turn-in yaw ${br} < 0.6× coasting ${co}`);
  assert.ok(m.turnIn_brake.axFracF > 0.3 && m.turnIn_brake.axFracF < 0.9,
    `${seat} full pedal must not empty the front circle (axFracF=${m.turnIn_brake.axFracF})`);
}

function assertMidCorner(m, seat, { absRear = true } = {}) {
  const co = m.midCorner_coast, br = m.midCorner_brake;
  const rise = br.yawMean / Math.max(co.yawMean, 1e-9) - 1;
  assert.ok(rise <= 0.15, `${seat} mid-corner yaw rise ${(rise * 100).toFixed(1)}% > 15% (${br.yawMean} vs ${co.yawMean})`);
  if (absRear) {
    assert.ok(br.aRmax <= 8, `${seat} mid-corner rear slip ${br.aRmax}° > 8°`);
  }
}

test("pin seat: braked turn-in ≥ 0.6× coast; still rotates more than coasting", () => {
  assertTurnIn(mPin, "pin");
  assert.ok(mPin.turnIn_brake.yaw > mPin.turnIn_coast.yaw * 1.02,
    `pin trail-brake must still out-rotate coast (${mPin.turnIn_brake.yaw} vs ${mPin.turnIn_coast.yaw})`);
});

test("shipped seat: braked turn-in ≥ 0.6× coast (was −0.224 vs 1.037)", () => {
  assertTurnIn(mShip, "shipped");
  assert.ok(mShip.turnIn_brake.yaw > 0.5, `shipped braked yaw must be clearly positive (${mShip.turnIn_brake.yaw})`);
});

test("shipped mid-corner brake stamp: rear ≤ 8°, yaw rise ≤ 15%", () => {
  assertMidCorner(mShip, "shipped", { absRear: true });
});

test("pin mid-corner: yaw rise ≤ 25% relative pin (#1266 aRmax stays ~14.6° when mods.braking ≤ 1)", () => {
  // Capacity scale is a no-op on the empty-sheet pin (mods.braking ≤ 1), so
  // the #1266 front-peak rear-slip jump is unchanged. Keep the relative
  // snap gate; do not claim an absolute ≤8° this fix does not deliver.
  const co = mPin.midCorner_coast, br = mPin.midCorner_brake;
  assert.ok(br.aRmax < co.aRmax * 2.6, `pin rear holds: ${br.aRmax}° vs ${co.aRmax}°`);
  assert.ok(br.yawMean < co.yawMean * 1.25, `pin no snap: yaw ${br.yawMean} vs ${co.yawMean}`);
});

test("step-steer and skidpad magnitudes barely move on either seat", () => {
  // Anchors from the pre-fix tip (player-dyn --json, monza FRAC 0).
  assert.ok(Math.abs(mPin.stepSteer.final - 0.435) < 0.02, `pin stepSteer ${mPin.stepSteer.final}`);
  assert.ok(Math.abs(mShip.stepSteer.final - 0.447) < 0.02, `shipped stepSteer ${mShip.stepSteer.final}`);
  const skPin = mPin.skidpad.find((r) => r.v === 60 && r.steer === 0.8);
  const skShip = mShip.skidpad.find((r) => r.v === 60 && r.steer === 0.8);
  assert.ok(Math.abs(skPin.ay_g - 3.46) < 0.08, `pin skidpad ${skPin.ay_g}`);
  assert.ok(Math.abs(skShip.ay_g - 5.35) < 0.08, `shipped skidpad ${skShip.ay_g}`);
});
