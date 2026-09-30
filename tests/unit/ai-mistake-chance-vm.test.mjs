/* ai-mistake-chance-vm.test.mjs — mistakeChance is monotone in inconsistency
 * and pressure, and DIFF.err keeps easy > normal > hard. Pure AiDrive VM load
 * (same harness as ai-drive.test.mjs); no browser, no simRnd.
 *
 * Gate for the 2026-09-30 mistake visibility raise (base 0.004 → 0.010) plus
 * the Optimism style reshape. Field rate is asserted by tools/check/ai-field.mjs.
 *
 * Run: node --test tests/unit/ai-mistake-chance-vm.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { seedLog } from "../helpers/seed-log.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function load() {
  const ctx = vm.createContext({ Math, console, Object, Array, Number, isFinite });
  seedLog(ctx);
  vm.runInContext(readFileSync(join(ROOT, "js/core/mat4.js"), "utf8"), ctx, { filename: "js/core/mat4.js" });
  vm.runInContext(readFileSync(join(ROOT, "js/physics/ai-drive.js"), "utf8"), ctx,
    { filename: "js/physics/ai-drive.js" });
  return vm.runInContext("AiDrive", ctx);
}

const A = load();

test("mistakeChance is monotone in (1 − consistency)", () => {
  const pressures = [0, 0.25, 0.5, 0.75, 1];
  const cons = [0.4, 0.55, 0.7, 0.85, 1.0];
  for (const p of pressures) {
    let prev = Infinity;
    for (const c of cons) {
      // Higher consistency → lower chance (monotone in (1−consistency)).
      const ch = A.mistakeChance({ consistency: c }, p, 1);
      assert.ok(ch < prev + 1e-12, `cons=${c} p=${p}: ${ch} should be < previous ${prev}`);
      assert.ok(ch > 0, `chance must stay positive at cons=${c}`);
      prev = ch;
    }
  }
});

test("mistakeChance is monotone in pressure (saturates at 1)", () => {
  const pressures = [0, 0.2, 0.4, 0.6, 0.8, 1.0, 1.5, 2.0];
  for (const cons of [0.5, 0.75, 1.0]) {
    let prev = -1;
    for (const p of pressures) {
      const ch = A.mistakeChance({ consistency: cons }, p, 1);
      assert.ok(ch + 1e-12 >= prev, `cons=${cons} p=${p}: ${ch} should be ≥ previous ${prev}`);
      prev = ch;
    }
    assert.equal(
      A.mistakeChance({ consistency: cons }, 1, 1),
      A.mistakeChance({ consistency: cons }, 3, 1),
      "pressure above 1 must not raise the rate further"
    );
  }
});

test("mistakeChance is monotone in DIFF.err (easy > normal > hard)", () => {
  // Shipped ladder (js/physics/consts.js DIFF.*.err) — do not edit those
  // literals; this pin is the behaviour contract for the rate scale.
  const easy = 3.5, normal = 1.8, hard = 1.0;
  const t = { consistency: 0.75 };
  for (const p of [0, 0.5, 1]) {
    const e = A.mistakeChance(t, p, easy);
    const n = A.mistakeChance(t, p, normal);
    const h = A.mistakeChance(t, p, hard);
    assert.ok(e > n && n > h, `p=${p}: easy ${e} > normal ${n} > hard ${h}`);
    assert.ok(Math.abs(e / h - easy / hard) < 1e-9, "errMul scales the rate exactly");
  }
});

test("mistakeChance optimism reshape is signed and leaves neutral at the base", () => {
  const t0 = { consistency: 0.75, optimism: 0 };
  const base = A.mistakeChance(t0, 0.4, 1.8);
  const hi = A.mistakeChance({ consistency: 0.75, optimism: 1 }, 0.4, 1.8);
  const lo = A.mistakeChance({ consistency: 0.75, optimism: -1 }, 0.4, 1.8);
  assert.ok(hi > base && base > lo);
  assert.ok(Math.abs(hi / base - 1.35) < 1e-9, "optimism +1 → ×1.35");
  assert.ok(Math.abs(lo / base - 0.65) < 1e-9, "optimism −1 → ×0.65");
});
