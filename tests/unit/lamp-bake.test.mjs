/* lamp-bake.test.mjs — LampBake must bake the SHADER's diffuse pool.
 *
 * The baked ground light map replaces the live lamp loop's diffuse term on
 * upward-facing fragments (glsl-lit.js / tsl-lit.js scale each live lamp's
 * diffuse by (lampSh - bakeW)), so a bake that drifted from the shader maths
 * would change the picture the moment the bake switches on. This pins the bake
 * to an independent evaluation of that term — windowed inverse-square with the
 * LAMP NEAR CLAMP, the aimed cone smoothstep(cosOuter, cosInner, cd) mixed from
 * the spill floor, and N·L for N = +Y — plus the identity-keyed cache and the
 * half-float encoding, and the sparse tile atlas the shaders read (indirection
 * -> (T+2)^2 slot with a gutter), sampled here the way the shaders do.
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

// ── Reading the sparse tile atlas (LampBake.bake's documented shape) ──────────
// Storage index (RGBA base) of global texel (i, j)'s INTERIOR copy in `layer`
// (0 diffuse, 1 bounce), or -1 when its tile is empty / off the grid.
function texelIdx(b, i, j, layer = 0) {
  const tx = Math.floor(i / b.T), tz = Math.floor(j / b.T);
  if (tx < 0 || tz < 0 || tx >= b.tilesX || tz >= b.tilesY) return -1;
  const ax = halfToFloat(b.indir[(tz * b.tilesX + tx) * 4]), ay = halfToFloat(b.indir[(tz * b.tilesX + tx) * 4 + 1]);
  if (ax < 0) return -1;
  const x = ax + i - tx * b.T + 1, y = ay + j - tz * b.T + 1 + (layer ? b.atlasH : 0);
  return (y * b.atlasW + x) * 4;
}
const worldIdx = (b, x, z, layer = 0) =>
  texelIdx(b, Math.floor((x - b.x0) / b.cell), Math.floor((z - b.z0) / b.cell), layer);
// The shaders' lookup, verbatim: g = bUv * tiles; the indirection (NEAREST) at
// floor(g) names the slot; atlasUV = (slot + fract(g) * T + 1) / (atlasW, 2 atlasH),
// bilinear with clamp-to-edge; the bounce tap is the same uv + 0.5 v. null = empty.
function sampleAtlas(b, x, z, c, layer = 0) {
  const W = b.atlasW, H = b.atlasH * 2;
  const gu = (x - b.x0) / (b.tilesX * b.T * b.cell) * b.tilesX, gv = (z - b.z0) / (b.tilesY * b.T * b.cell) * b.tilesY;
  const tx = Math.min(b.tilesX - 1, Math.max(0, Math.floor(gu))), tz = Math.min(b.tilesY - 1, Math.max(0, Math.floor(gv)));
  const ax = halfToFloat(b.indir[(tz * b.tilesX + tx) * 4]), ay = halfToFloat(b.indir[(tz * b.tilesX + tx) * 4 + 1]);
  if (ax < 0) return null;
  const u = (ax + (gu - tx) * b.T + 1) / W, v = (ay + (gv - tz) * b.T + 1) / H + (layer ? 0.5 : 0);
  const px = u * W - 0.5, py = v * H - 0.5;
  const i = Math.floor(px), j = Math.floor(py), fu = px - i, fv = py - j;
  const t = (ii, jj) => halfToFloat(b.data[(Math.min(H - 1, Math.max(0, jj)) * W + Math.min(W - 1, Math.max(0, ii))) * 4 + c]);
  return t(i, j) * (1 - fu) * (1 - fv) + t(i + 1, j) * fu * (1 - fv) + t(i, j + 1) * (1 - fu) * fv + t(i + 1, j + 1) * fu * fv;
}
// Sum of rgb over every stored INTERIOR texel (gutters are copies).
function interiorSum(b) {
  let s = 0;
  for (let j = 0; j < b.h; j++) for (let i = 0; i < b.w; i++) {
    const k = texelIdx(b, i, j);
    if (k >= 0) for (let c = 0; c < 3; c++) s += halfToFloat(b.data[k + c]);
  }
  return s;
}

// One aimed street lamp 9 m up, beam straight down, plus a second one 30 m away.
const LAMP_A = [0, 9, 0, 40, 32, 20, 24, 0, -1, 0, 0.85, 0.55, 0.12, 0.5, 1];
const LAMP_B = [30, 9, 0, 10, 20, 40, 24, 0.3, -0.95, 0, 0.8, 0.5, 0.2, 0.5, 1];

test("the bake reproduces the shader's diffuse pool at texel centres (sampled through the atlas)", () => {
  const LB = load();
  const lights = [...LAMP_A, ...LAMP_B];
  const b = LB.bake(lights, () => 0, 4.0);
  assert.ok(b && b.tiles > 0 && b.atlasW > 0 && b.atlasH > 0, "a bake");
  assert.equal(b.w, b.tilesX * b.T); assert.equal(b.h, b.tilesY * b.T);
  let checked = 0, maxRel = 0;
  for (let j = 0; j < b.h; j += 3) {
    for (let i = 0; i < b.w; i += 3) {
      const px = b.x0 + (i + 0.5) * b.cell, pz = b.z0 + (j + 0.5) * b.cell;
      const ra = shaderPool(LAMP_A, px, 0, pz, 4.0), rb = shaderPool(LAMP_B, px, 0, pz, 4.0);
      for (let c = 0; c < 3; c++) {
        const want = ra[c] + rb[c], got = sampleAtlas(b, px, pz, c);
        if (got === null) { assert.ok(want < 2e-3, `empty tile under a lit texel ${i},${j}`); continue; }
        if (want > 1e-3) { maxRel = Math.max(maxRel, Math.abs(got - want) / want); checked++; }
        else assert.ok(Math.abs(got - want) < 2e-3, `near-zero texel ${i},${j}`);
      }
    }
  }
  assert.ok(checked > 50, "enough lit texels were compared");
  assert.ok(maxRel < 2e-3, `half-float bake within 0.2% of the shader term (worst ${maxRel})`);
});

test("tiles no lamp reaches are empty in the indirection and not stored", () => {
  const LB = load();
  // Two lamps 600 m apart: the bounding box between them is dark.
  const far = LAMP_B.map((v, k) => k === 0 ? 600 : v);
  const b = LB.bake([...LAMP_A, ...far], () => 0, 4.0);
  let empty = 0;
  for (let tz = 0; tz < b.tilesY; tz++) {
    for (let tx = 0; tx < b.tilesX; tx++) {
      const ax = halfToFloat(b.indir[(tz * b.tilesX + tx) * 4]), ay = halfToFloat(b.indir[(tz * b.tilesX + tx) * 4 + 1]);
      const cx = b.x0 + (tx + 0.5) * b.T * b.cell, cz = b.z0 + (tz + 0.5) * b.T * b.cell;
      const lit = shaderPool(LAMP_A, cx, 0, cz, 4)[0] + shaderPool(far, cx, 0, cz, 4)[0];
      if (ax < 0) {
        empty++;
        assert.equal(ay, -1, "empty = (-1, -1)");
        assert.equal(lit, 0, `empty tile ${tx},${tz} is unlit`);
        assert.equal(sampleAtlas(b, cx, cz, 0), null, "the lookup reports empty");
      } else {
        assert.equal(ax % (b.T + 2), 0, "slot origins sit on the (T+2) slot grid");
        assert.equal(ay % (b.T + 2), 0, "slot origins sit on the (T+2) slot grid");
      }
    }
  }
  assert.ok(empty > b.tilesX * b.tilesY / 2, `most of the box is empty (${empty} of ${b.tilesX * b.tilesY})`);
  assert.ok(b.tiles < b.tilesX * b.tilesY - empty + 1, "only kept tiles take slots");
  assert.ok(b.atlasW * b.atlasH < b.w * b.h / 2, "the atlas is much smaller than the full grid");
  assert.equal(b.data.length, b.atlasW * b.atlasH * 8, "two stacked atlas halves");
  assert.equal(b.indir.length, b.tilesX * b.tilesY * 4, "one RGBA indirection texel per tile");
});

test("slot gutters hold the neighbouring texels, so bilinear never bleeds across tiles", () => {
  const LB = load();
  // A lamp row across several tile seams, and a road so alpha varies too.
  const lights = [];
  for (let i = 0; i < 6; i++) lights.push(...LAMP_A.map((v, k) => k === 0 ? i * 20 : k === 2 ? (i % 2) * 15 : v));
  const n = 40, px = new Float32Array(n), py = new Float32Array(n).fill(1.5), pz = new Float32Array(n);
  for (let k = 0; k < n; k++) px[k] = -20 + k * 4;
  const road = { n, total: 160, px, py, pz, rx: new Float32Array(n), rz: new Float32Array(n).fill(1), hw: new Float32Array(n).fill(5), lift: null };
  const b = LB.bake(lights, () => 0, 4.0, road);
  const S = b.T + 2, cols = b.atlasW / S;
  let compared = 0;
  for (let tz = 0; tz < b.tilesY; tz++) {
    for (let tx = 0; tx < b.tilesX; tx++) {
      const ax = halfToFloat(b.indir[(tz * b.tilesX + tx) * 4]), ay = halfToFloat(b.indir[(tz * b.tilesX + tx) * 4 + 1]);
      if (ax < 0) continue;
      assert.ok(ax / S < cols, "slot inside the atlas");
      for (let bb = 0; bb < S; bb++) {
        for (let aa = 0; aa < S; aa++) {
          if (aa > 0 && aa < S - 1 && bb > 0 && bb < S - 1) continue;      // interior
          const gi = tx * b.T + aa - 1, gj = tz * b.T + bb - 1;           // the global texel it copies
          for (const layer of [0, 1]) {
            const src = texelIdx(b, gi, gj, layer);
            if (src < 0) continue;                                        // neighbour empty / off grid
            const dst = ((ay + bb + (layer ? b.atlasH : 0)) * b.atlasW + ax + aa) * 4;
            for (let c = 0; c < 4; c++) assert.equal(b.data[dst + c], b.data[src + c], `gutter ${tx},${tz} (${aa},${bb}) ch ${c}`);
            compared++;
          }
        }
      }
    }
  }
  assert.ok(compared > 200, `gutters were compared (${compared})`);
  // Continuity across a seam: just either side of a tile edge reads the same.
  const seamX = b.x0 + b.T * b.cell, z = 0.3;
  for (const c of [0, 3]) {
    const l = sampleAtlas(b, seamX - 1e-4, z, c), r = sampleAtlas(b, seamX + 1e-4, z, c);
    assert.ok(l !== null && r !== null && Math.abs(l - r) <= 1e-3 * Math.max(1, Math.abs(l)), `seam ch ${c}: ${l} vs ${r}`);
  }
});

test("ground height feeds the bake; no known ground bakes nothing", () => {
  const LB = load();
  const flat = LB.bake([...LAMP_A], () => 0, 4.0);
  const raised = LB.bake([...LAMP_A], () => 3, 4.0);
  const none = LB.bake([...LAMP_A], () => null, 4.0);
  const at = (b, c) => halfToFloat(b.data[worldIdx(b, 0.2, 0.2) + c]);
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
  const onRoad = worldIdx(b, 0.5, 0.5), offRoad = worldIdx(b, 15.5, 0.5);
  assert.equal(halfToFloat(b.data[onRoad + 3]), 4, "on the road: road height");
  assert.equal(halfToFloat(b.data[offRoad + 3]), 0, "beyond the road edge: terrain height");
  const want = shaderPool(LAMP_A, b.x0 + (Math.floor((0.5 - b.x0) / b.cell) + 0.5) * b.cell, 4, b.z0 + (Math.floor((0.5 - b.z0) / b.cell) + 0.5) * b.cell, 4.0)[0];
  assert.ok(Math.abs(halfToFloat(b.data[onRoad]) - want) / want < 2e-3, "road texel lit at the ROAD height");
  const lifted = LB.bake([...LAMP_A], () => 0, 4.0, Object.assign({}, road, { lift: (s, lat) => lat * 0.1 }));
  const edge = worldIdx(lifted, 5.5, 0.5);
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

test("a sliced rebake yields at least once per tile, so one frame never queries more than a tile of terrain", () => {
  // A slow terrain (~20 us/query) makes a whole-lamp or whole-splat step blow the
  // 3 ms slice; the bound is structural: one step touches at most one slot.
  let calls = 0;
  const slowY = () => { calls++; const t = performance.now(); while (performance.now() - t < 0.02); return 0; };
  const LB = load({ Tracks: { terrainY: slowY }, performance });
  const trk = {};
  const lights = [];
  for (let i = 0; i < 12; i++) lights.push(...LAMP_A.map((v, k) => k === 0 ? i * 30 : k === 6 ? 60 : v));
  LB.forTrack(trk, lights, 4.0);
  const moved = lights.slice();
  LB.forTrack(trk, moved, 6.0, 0);
  let worst = 0, b = null, n = 0;
  while (n++ < 20000) {
    calls = 0;
    b = LB.forTrack(trk, moved, 6.0, 1000);
    worst = Math.max(worst, calls);
    if (b && b.gen > 1) break;
  }
  assert.ok(b && b.gen > 1, "the sliced rebake lands");
  assert.ok(worst <= 34 * 34 + 64, `one forTrack call queried ${worst} terrain texels (> one slot)`);
});

test("the atlas stays near-square: no side over WebGL2's guaranteed 2048, slot origins exact in half", () => {
  const LB = load({ Tracks: { terrainY: () => 0 } });
  for (const nLamps of [7, 37, 113, 241, 401]) {
    const lights = [];
    for (let i = 0; i < nLamps; i++) lights.push(...LAMP_A.map((v, k) => k === 0 ? (i % 23) * 97 : k === 2 ? Math.floor(i / 23) * 131 : v));
    for (const bud of [LB.MAX_TEXELS, LB.DESKTOP_TEXELS]) {
      const b = LB.bake(lights, () => 0, 4.0, null, bud);
      assert.ok(b.atlasW <= 2048 && 2 * b.atlasH <= 2048, `${nLamps} lamps @${bud}: atlas ${b.atlasW}x${2 * b.atlasH}`);
      assert.ok(b.atlasW * b.atlasH <= bud, "within the texel budget");
    }
  }
  assert.equal((LB.TILE + 2) % 2, 0, "SLOT even: slot origins are even integers < 4096, exact in half float");
});

test("reset drops the cached bake and track, so the next forTrack bakes afresh", () => {
  const LB = load({ Tracks: { terrainY: () => 0 } });
  const trk = {}, set = [...LAMP_A];
  const a = LB.forTrack(trk, set, 4.0);
  LB.reset();
  assert.equal(LB.liveOnlyAt([0, 0, 0], 0), 0, "no bake -> nothing flagged");
  const b = LB.forTrack(trk, set, 4.0, 0);
  assert.notEqual(b, a, "same set after reset bakes again, synchronously");
  assert.ok(b.gen > a.gen);
});

test("the road splat leaves no hole on the outside of a tight turn", () => {
  const LB = load();
  // A hairpin: 40 nodes on a 6 m-radius arc, 12 m half-width — the outer verge
  // sweeps ~3x the centreline step.
  const n = 40, R = 6, px = new Float32Array(n), py = new Float32Array(n).fill(2), pz = new Float32Array(n);
  const rx = new Float32Array(n), rz = new Float32Array(n);
  for (let k = 0; k < n; k++) { const a = Math.PI * k / (n - 1); px[k] = R * Math.cos(a); pz[k] = R * Math.sin(a); rx[k] = Math.cos(a); rz[k] = Math.sin(a); }
  const road = { n, total: Math.PI * R, px, py, pz, rx, rz, hw: new Float32Array(n).fill(12), lift: null };
  const lamp = LAMP_A.slice(); lamp[0] = 0; lamp[2] = 10; lamp[6] = 40;
  const b = LB.bake(lamp, () => null, 4.0, road);
  let holes = 0;
  for (let k = 3; k < n - 3; k++) for (const lat of [10, 12, 14]) {
    const a = Math.PI * k / (n - 1), x = (R + lat) * Math.cos(a), z = (R + lat) * Math.sin(a);
    if (halfToFloat(b.data[worldIdx(b, x, z) + 3]) !== 2) holes++;
  }
  assert.equal(holes, 0, `${holes} outer-verge texels missed by the splat`);
});

test("the road splat covers both edges out to the verge", () => {
  const LB = load();
  const n = 50, px = new Float32Array(n), py = new Float32Array(n).fill(4), pz = new Float32Array(n);
  for (let k = 0; k < n; k++) pz[k] = -100 + k * 4;
  const road = { n, total: 200, px, py, pz, rx: new Float32Array(n).fill(1), rz: new Float32Array(n), hw: new Float32Array(n).fill(6), lift: null };
  const b = LB.bake([...LAMP_A], () => null, 4.0, road);
  const alpha = (x, z) => halfToFloat(b.data[worldIdx(b, x, z) + 3]);
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

test("the atlas stays under its texel budget on a circuit-sized extent", () => {
  const LB = load();
  const lights = [];
  for (let i = 0; i < 300; i++) lights.push(...LAMP_A.map((v, k) => k === 0 ? i * 7 : k === 2 ? (i % 20) * 60 : v));
  const b = LB.bake(lights, () => 0, 4.0);
  const S2 = (b.T + 2) * (b.T + 2);
  assert.ok(b.atlasW * b.atlasH <= LB.MAX_TEXELS, `${b.atlasW}x${b.atlasH} within budget`);
  assert.ok(b.tiles * S2 <= b.atlasW * b.atlasH, "every kept tile has a (T+2)^2 slot");
  assert.ok(b.atlasW <= 4096 && b.atlasH * 2 <= 4096, "the stacked atlas fits a 4096 texture");
  assert.ok(b.cell >= 1, "never finer than 1 m");
  assert.ok(b.atlasW * b.atlasH > LB.MAX_TEXELS * 0.85, "the budget is spent on resolution, not wasted");
  const small = LB.bake(lights, () => 0, 4.0, null, 150000);
  assert.ok(small.atlasW * small.atlasH <= 150000, `${small.atlasW}x${small.atlasH} within a 150 k budget`);
  assert.ok(small.atlasW * small.atlasH > 150000 * 0.85, "a smaller budget is spent, not wasted");
  assert.ok(small.cell > b.cell, "a smaller budget grows the cell");
});

test("forTrack keys its cache on the texel budget", () => {
  const LB = load({ Tracks: { terrainY: () => 0 } });
  const trk = {}, set = [];
  for (let i = 0; i < 60; i++) set.push(...LAMP_A.map((v, k) => k === 0 ? i * 9 : k === 2 ? (i % 6) * 40 : v));
  const full = LB.forTrack(trk, set, 4.0, 0, true);
  assert.equal(LB.forTrack(trk, set, 4.0, 0, true, LB.MAX_TEXELS), full, "an explicit default budget is the same bake");
  const lite = LB.forTrack(trk, set, 4.0, 0, true, 2000);
  assert.notEqual(lite, full, "a different budget rebakes");
  assert.ok(lite.atlasW * lite.atlasH <= 2000 && lite.cell > full.cell, `${lite.atlasW}x${lite.atlasH} under the 2000-texel budget`);
  assert.equal(LB.forTrack(trk, set, 4.0, 0, true, 2000), lite, "same budget -> cached");
  assert.notEqual(LB.forTrack(trk, set, 4.0, 0, true), lite, "back to the default budget rebakes");
});

test("the second layer bakes the bounce fill (no cone, soft N.L floor)", () => {
  const LB = load();
  const L = LAMP_A;
  const b = LB.bake([...L], () => 0, 4.0);
  const i = Math.floor((0 - b.x0) / b.cell) + 3, j = Math.floor((0 - b.z0) / b.cell);
  const px = b.x0 + (i + 0.5) * b.cell, pz = b.z0 + (j + 0.5) * b.cell;
  const LX = L[0] - px, LY = L[1], LZ = L[2] - pz, dist = Math.hypot(LX, LY, LZ);
  const win = Math.min(1, Math.max(0, 1 - (dist / L[6]) ** 4));
  const att = (win * win) / (Math.max(dist, 4) ** 2 + 1);
  const want = L[3] * att * (0.55 + 0.45 * Math.max(0, LY / dist));
  const k = texelIdx(b, i, j, 1);                        // layer 2 = atlas rows [atlasH, 2 atlasH)
  assert.equal(b.data.length, b.atlasW * b.atlasH * 8, "two stacked layers");
  assert.ok(Math.abs(sampleAtlas(b, px, pz, 0, 1) - want) / want < 2e-3, "the shader's +0.5 v tap reads it");
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

test("TLX setLampBake frees its light map on the off path (GLX _bakeOffN parity)", () => {
  const src = readFileSync(path.join(ROOT, "js/render/three/tsl-lit.js"), "utf8");
  const off = /function setLampBake\(b, scale\) \{\s*if \(!b \|\| !scale\) \{([\s\S]*?)return false;/.exec(src);
  assert.ok(off, "setLampBake's off branch moved");
  assert.match(off[1], /\+\+_bakeOffN > 120/, "debounced like GLX");
  assert.match(off[1], /BAKE_NODE\.value = _bakeBlank/, "the placeholder goes back on the node");
  assert.match(off[1], /_bakeSrc = null/, "the source resets so a return re-uploads");
  assert.match(off[1], /\.dispose\(\)/, "the DataTexture is disposed");
});

test("live-only lamps (lens < 3 m over its surface, or cosOuter > 0.9) stay out of the bake", () => {
  const LB = load({ Tracks: { terrainY: () => 0 } });
  const LOW = LAMP_A.map((v, k) => k === 0 ? 60 : k === 1 ? 2 : v);                 // lens 2 m up
  const TIGHT = LAMP_A.map((v, k) => k === 0 ? -60 : k === 10 ? 0.98 : k === 11 ? 0.95 : v);
  const sum = interiorSum;
  const base = LB.bake([...LAMP_A], () => 0, 4.0);
  const mixed = LB.bake([...LAMP_A, ...LOW, ...TIGHT], () => 0, 4.0);
  assert.deepEqual(Array.from(mixed.liveOnly), [0, 1, 1], "the low and the tight lamp are live-only");
  // Same light over the normal lamp's texels: the extent grows, so compare sums.
  assert.ok(Math.abs(sum(mixed) - sum(base)) / sum(base) < 5e-3, `live-only lamps add nothing (${sum(mixed)} vs ${sum(base)})`);
  const alone = LB.bake([...LOW, ...TIGHT], () => 0, 4.0);
  assert.equal(sum(alone), 0, "a bake of live-only lamps is dark");
  // A lamp 2 m over a 4 m road is low even though it sits 6 m over the terrain.
  const n = 50, px = new Float32Array(n), py = new Float32Array(n).fill(4), pz = new Float32Array(n);
  for (let k = 0; k < n; k++) pz[k] = -100 + k * 4;
  const road = { n, total: 200, px, py, pz, rx: new Float32Array(n).fill(1), rz: new Float32Array(n), hw: new Float32Array(n).fill(6), lift: null };
  const onRoad = LAMP_A.map((v, k) => k === 1 ? 6 : v);
  assert.deepEqual(Array.from(LB.bake([...onRoad], () => 0, 4.0, road).liveOnly), [1], "height is over the ROAD surface");
  assert.deepEqual(Array.from(LB.bake([...onRoad], () => 0, 4.0).liveOnly), [0], "6 m over bare terrain is baked");
  // liveOnlyAt: by position in any verbatim copy; tail lights never match.
  LB.forTrack({}, [...LAMP_A, ...LOW, ...TIGHT], 4.0);
  const frame = [...TIGHT, ...LAMP_A, ...LOW, 1, 2, 3, 1, 0, 0, 5, 0, -1, 0, 0.9, 0.5, 0, 0, 0];
  assert.deepEqual([0, 1, 2, 3].map((s) => LB.liveOnlyAt(frame, s * 15)), [1, 0, 1, 0]);
  assert.ok(LB.gen() > 0, "gen names the drawing bake");
});

test("budget: phones keep the half-memory atlas, desktop spends it on resolution", () => {
  const LB = load();
  assert.equal(LB.budget({ mobileTier: true }), LB.MAX_TEXELS);
  assert.equal(LB.budget({ isMobile: true }), LB.MAX_TEXELS);
  assert.equal(LB.budget({ mobileTier: false }), LB.DESKTOP_TEXELS);
  assert.equal(LB.budget(null), LB.DESKTOP_TEXELS);
  assert.ok(LB.DESKTOP_TEXELS > LB.MAX_TEXELS);
});
