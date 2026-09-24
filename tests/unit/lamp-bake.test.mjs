/* lamp-bake.test.mjs — LampBake must bake the SHADER's diffuse pool.
 *
 * The baked ground light map replaces the live lamp loop's diffuse term on
 * upward-facing fragments (glsl-lit.js / tsl-lit.js scale each live lamp's
 * diffuse by (lampSh - bakeW)), so a bake that drifted from the shader maths
 * would change the picture the moment the bake switches on. This pins the bake
 * to an independent evaluation of that term — windowed inverse-square with the
 * LAMP NEAR CLAMP, the aimed cone smoothstep(cosOuter, cosInner, cd) mixed from
 * the spill floor, and N·L for N = +Y — plus the identity-keyed cache and the
 * half-float encoding.
 *
 * Run: node --test tests/unit/lamp-bake.test.mjs  (npm run test:tooling-fast)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function load(extra) {
  const ctx = vm.createContext(Object.assign({ Log: { info() {}, warn() {} } }, extra || {}));
  vm.runInContext(readFileSync(path.join(ROOT, "js/lighting/lamp-bake.js"), "utf8"), ctx);
  return vm.runInContext("LampBake", ctx);
}

function halfToFloat(h) {
  const s = (h & 0x8000) ? -1 : 1, e = (h >> 10) & 0x1f, m = h & 0x3ff;
  if (e === 0) return s * m * 2 ** -24;
  if (e === 31) return m ? NaN : s * Infinity;
  return s * (1 + m / 1024) * 2 ** (e - 15);
}

// Independent reference: the lit shaders' per-lamp diffuse factor for N = +Y.
function shaderPool(L, px, py, pz, nearClamp) {
  const LX = L[0] - px, LY = L[1] - py, LZ = L[2] - pz;
  const dist = Math.hypot(LX, LY, LZ), rad = L[6];
  if (dist >= rad) return [0, 0, 0];
  const Ld = [LX / dist, LY / dist, LZ / dist];
  const dn = dist / rad;
  const win = Math.min(1, Math.max(0, 1 - dn ** 4));
  const distC = Math.max(dist, nearClamp);
  const att = (win * win) / (distC * distC + 1);
  const cd = -(Ld[0] * L[7] + Ld[1] * L[8] + Ld[2] * L[9]);
  const t = Math.min(1, Math.max(0, (cd - L[11]) / (L[10] - L[11])));
  const beam = t * t * (3 - 2 * t);
  const spotD = L[12] + (1 - L[12]) * beam;
  const NoL = Math.max(0, Ld[1]);
  const e = att * spotD * NoL;
  return [L[3] * e, L[4] * e, L[5] * e];
}

// One aimed street lamp 9 m up, beam straight down, plus a second one 30 m away.
const LAMP_A = [0, 9, 0, 40, 32, 20, 24, 0, -1, 0, 0.85, 0.55, 0.12, 0.5, 1];
const LAMP_B = [30, 9, 0, 10, 20, 40, 24, 0.3, -0.95, 0, 0.8, 0.5, 0.2, 0.5, 1];

test("the bake reproduces the shader's diffuse pool at texel centres", () => {
  const LB = load();
  const lights = [...LAMP_A, ...LAMP_B];
  const b = LB.bake(lights, () => 0, 4.0);
  assert.ok(b && b.w > 0 && b.h > 0, "a bake");
  let checked = 0, maxRel = 0;
  for (let j = 0; j < b.h; j += 3) {
    for (let i = 0; i < b.w; i += 3) {
      const px = b.x0 + (i + 0.5) * b.cell, pz = b.z0 + (j + 0.5) * b.cell;
      const ra = shaderPool(LAMP_A, px, 0, pz, 4.0), rb = shaderPool(LAMP_B, px, 0, pz, 4.0);
      const k = (j * b.w + i) * 4;
      for (let c = 0; c < 3; c++) {
        const want = ra[c] + rb[c], got = halfToFloat(b.data[k + c]);
        if (want > 1e-3) { maxRel = Math.max(maxRel, Math.abs(got - want) / want); checked++; }
        else assert.ok(Math.abs(got - want) < 2e-3, `near-zero texel ${i},${j}`);
      }
    }
  }
  assert.ok(checked > 50, "enough lit texels were compared");
  assert.ok(maxRel < 2e-3, `half-float bake within 0.2% of the shader term (worst ${maxRel})`);
});

test("ground height feeds the bake; a missing height falls back below the lamp", () => {
  const LB = load();
  const flat = LB.bake([...LAMP_A], () => 0, 4.0);
  const raised = LB.bake([...LAMP_A], () => 3, 4.0);
  const none = LB.bake([...LAMP_A], () => null, 4.0);
  const mid = (b) => { const i = Math.floor(b.w / 2), j = Math.floor(b.h / 2); return halfToFloat(b.data[(j * b.w + i) * 4]); };
  assert.ok(mid(raised) > mid(flat), "ground closer to the lamp is brighter under it");
  assert.ok(mid(none) > 0, "no height -> lamp base (y - 8), still lit");
});

test("forTrack caches by light-set identity and near clamp", () => {
  const LB = load({ Tracks: { terrainY: () => 0 } });
  const set = [...LAMP_A];
  const a = LB.forTrack({}, set, 4.0);
  assert.equal(LB.forTrack({}, set, 4.0), a, "same set, same clamp -> same bake");
  const b = LB.forTrack({}, set, 6.0);
  assert.notEqual(b, a, "a new LAMP NEAR CLAMP rebakes");
  const c = LB.forTrack({}, [...LAMP_A], 6.0);
  assert.notEqual(c, b, "a rebuilt light set (new array) rebakes");
  assert.ok(c.gen > b.gen && b.gen > a.gen, "gen increases per bake");
  assert.equal(LB.forTrack({}, [], 4.0), null, "no lamps -> no bake");
});

test("the map stays under its texel budget on a circuit-sized extent", () => {
  const LB = load();
  const lights = [];
  for (let i = 0; i < 300; i++) lights.push(...LAMP_A.map((v, k) => k === 0 ? i * 7 : k === 2 ? (i % 20) * 60 : v));
  const b = LB.bake(lights, () => 0, 4.0);
  assert.ok(b.w * b.h <= LB.MAX_TEXELS * 1.02, `${b.w}x${b.h} within budget`);
  assert.ok(b.cell >= 1, "never finer than 1 m");
});

test("toHalf round-trips irradiance-range values", () => {
  const LB = load();
  for (const v of [0, 1e-3, 0.25, 1, 3.7, 150, 60000]) {
    const back = halfToFloat(LB.toHalf(v));
    assert.ok(Math.abs(back - v) <= Math.max(1e-6, v * 1e-3), `${v} -> ${back}`);
  }
  assert.equal(halfToFloat(LB.toHalf(1e9)), 65504, "clamps to the largest finite half");
});
