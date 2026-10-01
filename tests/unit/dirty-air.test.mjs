/* dirty-air.test.mjs — wake exposure shapes and the race-setting levels.
 *
 * CLASSIC must stay bit-compatible with the linear fade every AI-field /
 * characterization measurement was taken on. CFD is the exponential SAE-
 * shaped model (starters to tune). OFF zeroes the grip mul.
 *
 * Run: node --test tests/unit/dirty-air.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function load() {
  const ctx = vm.createContext({ Math, console, Object, Array, Number, JSON, isFinite });
  ctx.window = ctx;
  for (const f of ["js/core/mat4.js", "js/physics/consts.js"]) {
    vm.runInContext(readFileSync(join(ROOT, f), "utf8"), ctx, { filename: f });
  }
  return vm.runInContext("PhysicsConsts.DirtyAir", ctx);
}
const D = load();
const TOW = { range: 34, fade: 28, halfW: 4 };
const DF = 0.65; // PhysicsConsts.DOWNFORCE

test("levels: classic is the default; off/classic/cfd are all valid", () => {
  assert.equal(D.defaultLevel, "classic");
  assert.ok(D.isLevel("off") && D.isLevel("classic") && D.isLevel("cfd"));
  assert.equal(D.isLevel("real"), false);
  assert.equal(D.LOSS.classic, 0.35);
  assert.equal(D.LOSS.cfd, 0.67);
  assert.equal(D.LOSS.off, 0);
});

test("CLASSIC wake matches the linear fade (TOW_RANGE/FADE/HALF_W)", () => {
  const at = (gap, dx) => D.wakeOf(gap, dx, "classic", TOW);
  assert.ok(Math.abs(at(10, 0) - (34 - 10) / 28) < 1e-12, "10 m on centreline");
  assert.ok(Math.abs(at(20, 0) - (34 - 20) / 28) < 1e-12, "20 m on centreline");
  assert.equal(at(34, 0), 0, "at range edge");
  assert.equal(at(40, 0), 0, "beyond range");
  assert.ok(at(10, 2) < at(10, 0), "lateral offset cuts exposure");
  assert.equal(at(10, 4), 0, "at half-width edge");
});

test("CFD wake is exponential in gap and Gaussian in lateral offset", () => {
  const at = (gap, dx) => D.wakeOf(gap, dx, "cfd", TOW);
  const close = at(5, 0), mid = at(12, 0), far = at(24, 0);
  assert.ok(close > mid && mid > far, `exp falloff: ${close} > ${mid} > ${far}`);
  assert.ok(Math.abs(close - Math.exp(-5 / D.CFD_LAMBDA)) < 1e-12);
  assert.ok(at(10, 0) > at(10, 3), "lateral Gaussian cuts exposure");
  assert.ok(at(10, 8) < 0.05, "far off-line is almost clear air");
});

test("mul: OFF is identity; classic/cfd scale by LOSS; fades at crawl speed", () => {
  assert.equal(D.mul(1, 70, "off", DF, 72), 1);
  assert.equal(D.mul(0, 70, "classic", DF, 72), 1);
  const aeroShare = DF / (1 + DF);
  const q = 1; // at vTop
  const classic = D.mul(1, 72, "classic", DF, 72);
  assert.ok(Math.abs(classic - (1 - 0.35 * aeroShare * q)) < 1e-12);
  const cfd = D.mul(1, 72, "cfd", DF, 72);
  assert.ok(Math.abs(cfd - (1 - 0.67 * aeroShare * q)) < 1e-12);
  assert.ok(cfd < classic, "CFD loses more downforce at full exposure");
  // Crawl: q → 0, so mul → 1 even at wake 1.
  assert.ok(D.mul(1, 0, "cfd", DF, 72) > 0.99);
});

test("CFD close spacing approaches the SAE ~67 % aero-share loss", () => {
  // At gap≈0.5 m, centreline, full speed: wake ≈ exp(-0.5/12) ≈ 0.96, so the
  // aero-share loss is near LOSS.cfd × aeroShare — the SAE close-spacing ceiling.
  const wake = D.wakeOf(0.5, 0, "cfd", TOW);
  const mul = D.mul(wake, 72, "cfd", DF, 72);
  const aeroShare = DF / (1 + DF);
  const lost = 1 - mul;
  assert.ok(lost > 0.35 * aeroShare, "stronger than classic at close range");
  assert.ok(lost < 0.67 * aeroShare + 0.01, "does not exceed the SAE-scaled ceiling");
  assert.ok(wake > 0.9, `near-bumper exposure: ${wake}`);
});
