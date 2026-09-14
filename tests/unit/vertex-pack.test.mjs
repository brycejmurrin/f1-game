/* vertex-pack.test.mjs — the packed world vertex format is a CONTRACT
 * between two files that cannot see each other: js/render/shared/vertex-pack.js
 * writes the bytes, and LIT_VS in js/render/glx/shaders/glsl-lit.js decodes
 * them in GLSL. Nothing at runtime checks that the two agree — a mismatched
 * scale draws a world that is merely the wrong brightness, or picks the wrong
 * procedural material, and no test that renders under SwiftShader would call
 * either of those a failure.
 *
 * So this suite asserts the pair directly:
 *   1. the encode scales in the JS equal the decode scales in the GLSL;
 *   2. the scales are exact divisors of 65535, which is WHY a whole material
 *      id survives the round trip — LIT_VS keys the FLAG cloth-wave on id 15
 *      and reads the fraction as a wave weight, so an ASPHALT 16 that came
 *      back as 15.99998 would ripple;
 *   3. every material id in the table, and every colour up to the fleet-wide
 *      maximum, round-trips inside the tolerance claimed in the comments;
 *   4. the byte layout the packer writes is the one bindAttribs() points at.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const PACK_SRC = new URL("../../js/render/shared/vertex-pack.js", import.meta.url);
const LIT_SRC = new URL("../../js/render/glx/shaders/glsl-lit.js", import.meta.url);

function loadPack() {
  const ctx = { console };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(PACK_SRC, "utf8") +
                  "\n;globalThis.__P = VertexPack;", ctx);
  return ctx.__P;
}

const P = loadPack();
const LIT = fs.readFileSync(LIT_SRC, "utf8");

function glslDefine(name) {
  const m = LIT.match(new RegExp(`#define\\s+${name}\\s+([0-9.]+)`));
  assert.ok(m, `LIT_VS must #define ${name}`);
  return Number(m[1]);
}

test("the GLSL decode scales equal the JS encode scales", () => {
  assert.equal(glslDefine("COL_SCALE"), P.COL_SCALE,
    "colour scale drifted between vertex-pack.js and glsl-lit.js");
  assert.equal(glslDefine("MAT_SCALE"), P.MAT_SCALE,
    "material scale drifted between vertex-pack.js and glsl-lit.js");
  // The shader must read the packed attributes, not the old float3 ones.
  assert.match(LIT, /layout\(location=1\) in vec4 aNrmP;/);
  assert.match(LIT, /layout\(location=2\) in vec4 aColMat;/);
  assert.doesNotMatch(LIT, /layout\(location=3\) in float aMat;/,
    "attrib 3 is gone — the material id rides in the alpha of attrib 2");
});

test("the scales are exact divisors of 65535, so whole ids decode to themselves", () => {
  assert.equal(P.COL_Q, 65535 / P.COL_SCALE);
  assert.equal(P.MAT_Q, 65535 / P.MAT_SCALE);
  assert.ok(Number.isInteger(P.COL_Q), `65535 / ${P.COL_SCALE} must be a whole number`);
  assert.ok(Number.isInteger(P.MAT_Q), `65535 / ${P.MAT_SCALE} must be a whole number`);
});

// One vertex through pack(), read back the way vertexAttribPointer would.
function roundTrip(pos, nrm, col, mat, trk) {
  const buf = P.pack(1, Float32Array.from(pos), Float32Array.from(nrm),
                     Float32Array.from(col), mat == null ? null : Float32Array.of(mat),
                     trk ? Float32Array.from(trk) : null);
  const f32 = new Float32Array(buf), i16 = new Int16Array(buf), u16 = new Uint16Array(buf);
  return {
    bytes: buf.byteLength,
    pos: [f32[0], f32[1], f32[2]],
    nrm: [i16[6] / 32767, i16[7] / 32767, i16[8] / 32767],
    // What the GPU hands the shader: the normalized integer / 65535, then
    // scaled by the #define. That is exactly k / Q.
    col: [u16[10] / P.COL_Q, u16[11] / P.COL_Q, u16[12] / P.COL_Q],
    mat: u16[13] / P.MAT_Q,
    trk: trk ? [f32[7], f32[8], f32[9]] : null,
  };
}

test("every material id in use decodes bit-exactly", () => {
  // 0-16 are the procedural track materials (Assets.MAT_LAYERS = 17) and 20-32
  // the car surfaces LIT_FS classifies. Both halves are compared with `==` in
  // the shader, so "close enough" is not enough here.
  for (let id = 0; id <= 32; id++) {
    const r = roundTrip([0, 0, 0], [0, 1, 0], [1, 1, 1], id);
    assert.equal(r.mat, id, `material ${id} did not decode to itself`);
    // int(aMat + 0.5) in the shader must land on the same integer, which is the
    // property the FLAG gate and every car-surface branch depend on.
    assert.equal(Math.trunc(r.mat + 0.5), id);
  }
});

test("the FLAG wave weight in the fractional part survives", () => {
  // LIT_VS: id 15 with a fraction of 0 … 0.4 = hoist-pinned … free edge.
  for (const w of [0, 0.1, 0.25, 0.4]) {
    const r = roundTrip([0, 0, 0], [0, 1, 0], [1, 1, 1], 15 + w);
    assert.equal(Math.trunc(r.mat + 0.5), 15, "the id must still read as FLAG");
    assert.ok(Math.abs((r.mat - 15) - w) < 1 / P.MAT_Q,
      `wave weight ${w} drifted to ${r.mat - 15}`);
  }
});

test("colours keep emissive headroom and quantise far finer than 8 bits", () => {
  // 3.4 is the brightest value measured anywhere — the nose running lights in
  // js/car/car3d.js; track emissive neon reaches 3.2. An unsigned-byte colour
  // attribute would have clamped both to 1.0.
  for (const c of [0, 0.0126, 0.5, 1, 2.5, 3.2, 3.4]) {
    const r = roundTrip([0, 0, 0], [0, 1, 0], [c, c, c], 0);
    assert.ok(Math.abs(r.col[0] - c) <= P.COL_SCALE / 65535 / 2 + 1e-9,
      `colour ${c} came back ${r.col[0]}`);
  }
  assert.ok(P.COL_SCALE / 65535 < 1 / 255,
    "the packed colour must be finer than the 8-bit alternative it replaces");
});

test("values past the ceiling saturate rather than wrap", () => {
  // A wrap would alias a bright neon onto near-black, or a new material onto an
  // unrelated one — silent in both cases. Saturation is visible and debuggable.
  const hot = roundTrip([0, 0, 0], [0, 1, 0], [999, -5, 0], 999);
  assert.equal(hot.col[0], P.COL_SCALE, "over-bright clamps to the ceiling");
  assert.equal(hot.col[1], 0, "negative clamps to zero");
  assert.equal(hot.mat, P.MAT_SCALE, "an out-of-table material clamps to the ceiling");
  const n = roundTrip([0, 0, 0], [5, -5, 0], [1, 1, 1], 0);
  assert.ok(Math.abs(n.nrm[0] - 1) < 1e-4 && Math.abs(n.nrm[1] + 1) < 1e-4,
    "a denormalised normal clamps to ±1 instead of wrapping the signed short");
});

test("normals quantise to well under a tenth of a degree", () => {
  let worst = 0;
  for (let i = 0; i < 2000; i++) {
    const a = (i * 0.7919) % (Math.PI * 2), b = ((i * 0.3313) % Math.PI) - Math.PI / 2;
    const v = [Math.cos(b) * Math.cos(a), Math.sin(b), Math.cos(b) * Math.sin(a)];
    const r = roundTrip([0, 0, 0], v, [1, 1, 1], 0).nrm;
    const L = Math.hypot(...r);
    const dot = (v[0] * r[0] + v[1] * r[1] + v[2] * r[2]) / L;
    worst = Math.max(worst, Math.acos(Math.min(1, dot)) * 180 / Math.PI);
  }
  // The reason normals are SHORT and not BYTE: a byte normal is ~0.45° off,
  // which bands a sunlit road. Sixteen bits is two orders of magnitude finer.
  assert.ok(worst < 0.01, `worst normal error ${worst.toFixed(4)}° is too coarse`);
});

test("the stride and the field offsets are the ones bindAttribs points at", () => {
  assert.equal(P.STRIDE, 28);
  assert.equal(P.STRIDE_TRK, 40);
  assert.equal(roundTrip([1, 2, 3], [0, 1, 0], [1, 1, 1], 0).bytes, 28);
  const withTrk = roundTrip([1, 2, 3], [0, 1, 0], [1, 1, 1], 0, [1234.5, -2.25, 6]);
  assert.equal(withTrk.bytes, 40);
  assert.deepEqual(withTrk.pos, [1, 2, 3], "position stays exact float32");
  assert.deepEqual(withTrk.trk, [1234.5, -2.25, 6],
    "track coords stay exact float32 — arc length runs to ~7 km");

  // Every offset bindAttribs() hands to the GPU must be a whole multiple of its
  // component size, or WebGL rejects the pointer outright.
  const calls = [];
  const gl = {
    FLOAT: 0x1406, SHORT: 0x1402, UNSIGNED_SHORT: 0x1403,
    enableVertexAttribArray: () => {},
    vertexAttribPointer: (idx, size, type, norm, stride, offset) =>
      calls.push({ idx, size, type, norm, stride, offset }),
  };
  P.bindAttribs(gl, false);
  assert.deepEqual(calls.map((c) => c.idx), [0, 1, 2], "attrib 3 must never be enabled");
  const width = { [gl.FLOAT]: 4, [gl.SHORT]: 2, [gl.UNSIGNED_SHORT]: 2 };
  for (const c of calls) {
    assert.equal(c.offset % width[c.type], 0, `attrib ${c.idx} offset is misaligned`);
    assert.equal(c.stride, P.STRIDE);
  }
  calls.length = 0;
  P.bindAttribs(gl, true);
  assert.deepEqual(calls.map((c) => c.idx), [0, 1, 2, 4]);
  assert.equal(calls[3].offset, 28);
  for (const c of calls) assert.equal(c.stride, P.STRIDE_TRK);
});

// ── the half-float encoder, which WGX and TLX both depend on ───────────────
// Node has no Math.f16round on this runtime and three exports no converter, so
// this is ours and has to be tested as arithmetic, not assumed.
function decodeHalf(h) {
  const s = (h & 0x8000) ? -1 : 1, e = (h >> 10) & 0x1f, m = h & 0x3ff;
  if (e === 0) return s * m * 5.960464477539063e-8;      // sub-normal
  if (e === 31) return m ? NaN : s * Infinity;
  return s * Math.pow(2, e - 15) * (1 + m / 1024);
}

test("toHalf round-trips every whole number a material id can be", () => {
  // Half float holds integers exactly to 2048; the id space tops out at 32.
  for (let i = 0; i <= 2048; i++) {
    assert.equal(decodeHalf(P.toHalf(i)), i, `integer ${i} did not survive`);
  }
});

test("toHalf is unbiased, which a truncating encoder is not", () => {
  // This is the whole reason it rounds rather than truncates. A truncating
  // mantissa is always-toward-zero, so a whole frame of colours comes back
  // systematically DARK — measured at -6.5e-4 mean signed bias on the variant
  // in js/render/three/tlx-chunked.js, against ~0 here.
  let bias = 0, worst = 0, n = 0;
  for (let k = 1; k <= 40000; k++) {
    const v = k / 10000, d = decodeHalf(P.toHalf(v));
    bias += d - v;
    worst = Math.max(worst, Math.abs(d - v) / v);
    n++;
  }
  assert.ok(Math.abs(bias / n) < 1e-7, `mean signed bias ${bias / n} — is this truncating?`);
  // 2^-11 is half float's mantissa; anything worse means a broken exponent.
  assert.ok(worst <= 1 / 2048 + 1e-9, `worst relative error ${worst} exceeds the format`);
});

test("toHalf handles the edges rather than wrapping them", () => {
  assert.equal(decodeHalf(P.toHalf(0)), 0);
  assert.equal(decodeHalf(P.toHalf(-1)), -1);
  assert.equal(decodeHalf(P.toHalf(65504)), 65504, "the largest finite half");
  assert.equal(decodeHalf(P.toHalf(1e9)), Infinity, "overflow saturates, never wraps small");
  assert.equal(decodeHalf(P.toHalf(-1e9)), -Infinity);
  assert.ok(Number.isNaN(decodeHalf(P.toHalf(NaN))));
  // Emissive colour is the reason WGX uses this instead of a unorm byte.
  assert.ok(Math.abs(decodeHalf(P.toHalf(3.4)) - 3.4) < 1 / 2048 * 3.4);
  // Sub-normals must not become zero — a tiny colour is still not black.
  assert.ok(decodeHalf(P.toHalf(1e-6)) > 0);
});

test("the packed format is materially smaller than the float32 layout it replaced", () => {
  // The whole point. 9 floats (36 B), or 10 with a material column (40 B), or
  // 13 with track coords (52 B) — against 28 and 40 now.
  assert.ok(P.STRIDE <= 28, "a regression here silently gives the bytes back");
  assert.ok(P.STRIDE_TRK <= 40);
  assert.ok(P.STRIDE / 40 <= 0.7, "the world VBO saving must stay at 30 % or better");
});
