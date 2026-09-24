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

test("ground height feeds the bake; no known ground bakes nothing", () => {
  const LB = load();
  const flat = LB.bake([...LAMP_A], () => 0, 4.0);
  const raised = LB.bake([...LAMP_A], () => 3, 4.0);
  const none = LB.bake([...LAMP_A], () => null, 4.0);
  const at = (b, c) => { const i = Math.floor(b.w / 2), j = Math.floor(b.h / 2); return halfToFloat(b.data[(j * b.w + i) * 4 + c]); };
  assert.ok(at(raised, 0) > at(flat, 0), "ground closer to the lamp is brighter under it");
  assert.equal(at(flat, 3), 0, "alpha carries the baked surface height");
  assert.equal(at(raised, 3), 3, "alpha carries the baked surface height");
  assert.equal(at(none, 0), 0, "no surface -> no baked light (the live loop keeps it)");
  assert.ok(at(none, 3) < -50000, "no surface -> the NO_GROUND sentinel the shaders fade out");
});

test("the road surface wins over the terrain under it", () => {
  const LB = load();
  // A straight 200 m road along +Z at x = 0, 4 m ABOVE a terrain at 0 (an
  // embankment), 6 m half-width, lamps over it.
  const n = 50, px = new Float32Array(n), py = new Float32Array(n).fill(4), pz = new Float32Array(n);
  for (let k = 0; k < n; k++) pz[k] = -100 + k * 4;
  const road = { n, total: 200, px, py, pz, rx: new Float32Array(n).fill(1), rz: new Float32Array(n), hw: new Float32Array(n).fill(6), lift: null };
  const b = LB.bake([...LAMP_A], () => 0, 4.0, road);
  const texel = (x, z) => { const i = Math.floor((x - b.x0) / b.cell), j = Math.floor((z - b.z0) / b.cell); return (j * b.w + i) * 4; };
  const onRoad = texel(0.5, 0.5), offRoad = texel(15.5, 0.5);
  assert.equal(halfToFloat(b.data[onRoad + 3]), 4, "on the road: road height");
  assert.equal(halfToFloat(b.data[offRoad + 3]), 0, "beyond the road edge: terrain height");
  const want = shaderPool(LAMP_A, b.x0 + (Math.floor((0.5 - b.x0) / b.cell) + 0.5) * b.cell, 4, b.z0 + (Math.floor((0.5 - b.z0) / b.cell) + 0.5) * b.cell, 4.0)[0];
  assert.ok(Math.abs(halfToFloat(b.data[onRoad]) - want) / want < 2e-3, "road texel lit at the ROAD height");
  const lifted = LB.bake([...LAMP_A], () => 0, 4.0, Object.assign({}, road, { lift: (s, lat) => lat * 0.1 }));
  const edge = texel(5.5, 0.5);
  assert.ok(Math.abs(halfToFloat(lifted.data[edge + 3]) - (4 + 5.5 * 0.1)) < 0.3, "banking lift applied across the road");
});

test("forTrack caches by light-set identity and near clamp", () => {
  const LB = load({ Tracks: { terrainY: () => 0 } });
  const set = [...LAMP_A];
  const a = LB.forTrack({}, set, 4.0);
  assert.equal(LB.forTrack({}, set, 4.0), a, "same set, same clamp -> same bake");
  const c = LB.forTrack({}, [...LAMP_A], 6.0);
  assert.notEqual(c, a, "another track's set bakes at once");
  assert.ok(c.gen > a.gen, "gen increases per bake");
  assert.equal(LB.forTrack({}, [], 4.0), null, "no lamps -> no bake");
});

test("a rebake on the same track waits for the input to settle, then runs in slices", () => {
  const LB = load({ Tracks: { terrainY: () => 0 } });
  const trk = {};
  const lights = [];
  for (let i = 0; i < 120; i++) lights.push(...LAMP_A.map((v, k) => k === 0 ? i * 9 : k === 2 ? (i % 12) * 40 : v));
  const a = LB.forTrack(trk, lights, 4.0);
  assert.equal(LB.forTrack(trk, lights, 6.0, 1000), a, "a moving LAMP NEAR CLAMP keeps the old bake...");
  assert.equal(LB.forTrack(trk, lights, 6.0, 1200), a, "...until it has held still");
  const moved = lights.slice();
  assert.equal(LB.forTrack(trk, moved, 6.0, 1250), a, "a rebuilt set restarts the settle window");
  let b = a, calls = 0;
  while (b === a && calls < 5000) { b = LB.forTrack(trk, moved, 6.0, 2000); calls++; }
  assert.notEqual(b, a, "the sliced rebake lands");
  assert.deepEqual(Array.from(b.data), Array.from(LB.bake(moved, () => 0, 6.0).data), "sliced == synchronous bake");
  assert.equal(LB.forTrack(trk, moved, 6.0, 3000), b, "then it is cached");
});

test("the road splat covers both edges out to the verge", () => {
  const LB = load();
  const n = 50, px = new Float32Array(n), py = new Float32Array(n).fill(4), pz = new Float32Array(n);
  for (let k = 0; k < n; k++) pz[k] = -100 + k * 4;
  const road = { n, total: 200, px, py, pz, rx: new Float32Array(n).fill(1), rz: new Float32Array(n), hw: new Float32Array(n).fill(6), lift: null };
  const b = LB.bake([...LAMP_A], () => null, 4.0, road);
  const alpha = (x, z) => { const i = Math.floor((x - b.x0) / b.cell), j = Math.floor((z - b.z0) / b.cell); return halfToFloat(b.data[(j * b.w + i) * 4 + 3]); };
  for (const x of [-6 - 2.2, -6, 0, 6, 6 + 2.2]) assert.equal(alpha(x, 0.5), 4, `road height at lateral ${x} m`);
});

test("shadowCol returns the shadow lamp's steady baked colour, not its live one", () => {
  const LB = load({ Tracks: { terrainY: () => 0 } });
  const set = [...LAMP_A, ...LAMP_B];
  LB.forTrack({}, set, 4.0);
  const live = set.slice(15);                        // slot 0 = lamp B, flickered to half
  live[3] *= 0.5; live[4] *= 0.5; live[5] *= 0.5;
  const out = LB.shadowCol({ lights: live, lampBakeScale: [2, 1, 0.5] }, 0, [0, 0, 0]);
  assert.deepEqual(Array.from(out), [LAMP_B[3] * 2, LAMP_B[4] * 1, LAMP_B[5] * 0.5]);
  assert.deepEqual(Array.from(LB.shadowCol({ lights: live, lampBakeScale: [1, 1, 1] }, 5, [9, 9, 9])), [0, 0, 0], "bad slot -> no carve");
});

test("the map stays under its texel budget on a circuit-sized extent", () => {
  const LB = load();
  const lights = [];
  for (let i = 0; i < 300; i++) lights.push(...LAMP_A.map((v, k) => k === 0 ? i * 7 : k === 2 ? (i % 20) * 60 : v));
  const b = LB.bake(lights, () => 0, 4.0);
  assert.ok(b.w * b.h <= LB.MAX_TEXELS * 1.02, `${b.w}x${b.h} within budget`);
  assert.ok(b.cell >= 1, "never finer than 1 m");
});

test("the second layer bakes the bounce fill (no cone, soft N.L floor)", () => {
  const LB = load();
  const L = LAMP_A;
  const b = LB.bake([...L], () => 0, 4.0);
  const i = Math.floor(b.w / 2) + 3, j = Math.floor(b.h / 2);
  const px = b.x0 + (i + 0.5) * b.cell, pz = b.z0 + (j + 0.5) * b.cell;
  const LX = L[0] - px, LY = L[1], LZ = L[2] - pz, dist = Math.hypot(LX, LY, LZ);
  const win = Math.min(1, Math.max(0, 1 - (dist / L[6]) ** 4));
  const att = (win * win) / (Math.max(dist, 4) ** 2 + 1);
  const want = L[3] * att * (0.55 + 0.45 * Math.max(0, LY / dist));
  const k = (b.h * b.w + j * b.w + i) * 4;              // layer 2 = rows [h, 2h)
  assert.equal(b.data.length, b.w * b.h * 8, "two stacked layers");
  assert.ok(Math.abs(halfToFloat(b.data[k]) - want) / want < 2e-3, `bounce ${halfToFloat(b.data[k])} vs ${want}`);
  assert.equal(halfToFloat(b.data[k + 3]), 0, "bounce layer carries the height too");
});

test("toHalf round-trips irradiance-range values", () => {
  const LB = load();
  for (const v of [0, 1e-3, 0.25, 1, 3.7, 150, 60000]) {
    const back = halfToFloat(LB.toHalf(v));
    assert.ok(Math.abs(back - v) <= Math.max(1e-6, v * 1e-3), `${v} -> ${back}`);
  }
  assert.equal(halfToFloat(LB.toHalf(1e9)), 65504, "clamps to the largest finite half");
});
