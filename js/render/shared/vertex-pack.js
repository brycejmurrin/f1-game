/* Apex 26 — packed world vertex channels. The ONE definition of how a lit world mesh's normal/colour/material are quantised, shared by all three render backends; GLX's own interleaved layout lives here too. */
"use strict";

// World geometry is the same {pos,nrm,col,mat,idx} in every backend, and in
// every backend the same three channels do not need 32 bits. What DIFFERS is
// the layout, because each API allows different things:
//
//   GLX   one interleaved VBO; the material id rides in the alpha of the
//         colour attribute. pack() / bindAttribs() below.
//   WGX   three vertex attributes; the material id is not one of them — it
//         lives in the group-2 storage buffer, because Dawn zeroes a fourth
//         attribute on this adapter (js/render/webgpu/wgx.js).
//   TLX   separate named three.js BufferAttributes, and three picks the GL /
//         WebGPU format from the array type (js/render/three/tlx-chunked.js).
//
// So this module owns the QUANTISERS, which are the part that must agree, and
// GLX's layout as well since it has nowhere better to live. A backend that
// quantises a channel its own way is how two backends end up disagreeing about
// what colour 2.0 means.
//
// Every lit world mesh — road, terrain, props, glass, water, the instanced
// scenery batches, the garage/car meshes — uploads through pack() below and
// binds through bindAttribs(). LIT_VS (js/render/glx/shaders/glsl-lit.js) is
// the only reader of THAT layout; keep its COL_SCALE / MAT_SCALE in step with
// the constants here (tests/unit/vertex-pack.test.mjs asserts they agree).
//
//   off  0   FLOAT32 x3   position (metres)
//   off 12   SHORT   x4   normal, normalized; w is padding
//   off 20   USHORT  x4   normalized: rgb = colour / COL_SCALE,
//                                     a   = material id / MAT_SCALE
//   off 28   FLOAT32 x3   track coords (ROAD ONLY; absent otherwise)
//
// 28 bytes a vertex, or 40 with track coords, where an all-float32 layout cost
// 36-40 and 52. That is 29.5 % off every world VBO and the same off the
// vertex-fetch bandwidth in BOTH the camera pass and the shadow pass. Counted
// over all 40 circuits (20.2 M world vertices, 1.13 M of them carrying track
// coords): 784.8 MB of attribute bytes becomes 553.3 MB — a mean circuit 19.6
// to 13.8 MB, and mexico, the heaviest, 39.8 to 27.9. Position deliberately
// stays float32: world coordinates run to ~7 km and quantising them cracks the
// road ribbon.
//
// WHY THESE TWO SCALES. 4369 and 771 are EXACT divisors of 65535, the
// normalized-unsigned-short denominator, so a whole number encodes and decodes
// to ITSELF, bit for bit. The material id depends on that: LIT_VS keys the FLAG
// cloth-wave on id 15 and reads the fractional part as the per-vertex wave
// weight, so an ASPHALT 16 that decoded as 15.99998 would ripple like cloth,
// and every car-surface branch in LIT_FS is an `== id` test on the same value.
// A scale of 4.0 or 16.0 would NOT have this property.
//
// HEADROOM, measured rather than assumed — over all 40 circuits (20.2 M
// vertices) and all 11 team cars (983 k):
//
//   colours reach 3.4 (the nose running lights in js/car/car3d.js; track
//     emissive neon reaches 3.2) against a ceiling of 15.0. Colour is NOT the
//     usual unsigned byte precisely because these run past 1.0, and even at
//     this scale a step is 2.3e-4 — seventeen times finer than 8-bit.
//   material ids reach 32 against a ceiling of 85.0. The id space is not
//     contiguous: 0-16 are the procedural track materials (Assets.MAT_LAYERS
//     is 17) and 20-32 the car surfaces LIT_FS classifies (paint, carbon,
//     rubber, metal, glass, emissive, panel, mirror, matte, satin, iridescent,
//     carbon-finish, visor).
//
// Both quantisers clamp rather than wrap, so a value past the ceiling saturates
// — visible and debuggable — instead of aliasing a bright neon onto near-black
// or one material onto an unrelated one.
const VertexPack = (function () {
  const COL_SCALE = 15.0, COL_Q = 4369;     // 65535 / 15
  const MAT_SCALE = 85.0, MAT_Q = 771;      // 65535 / 85
  const STRIDE = 28, STRIDE_TRK = 40;

  function qs(v) { const q = Math.round(v * 32767); return q < -32767 ? -32767 : q > 32767 ? 32767 : q; }
  function qc(v) { const q = Math.round(v * COL_Q); return q < 0 ? 0 : q > 65535 ? 65535 : q; }
  function qm(v) { const q = Math.round(v * MAT_Q); return q < 0 ? 0 : q > 65535 ? 65535 : q; }

  // Interleave pos/nrm/col/mat(/trk) into one packed ArrayBuffer, ready for
  // bufferData. `mat` and `trk` may be null. A missing material column encodes
  // 0 = MAT.FLAT, which is exactly what the old layout's disabled attribute 3
  // read from its generic default — so a mesh that never had a material column
  // behaves identically, and now costs no extra byte when it does have one.
  function pack(vCount, pos, nrm, col, mat, trk) {
    const stride = trk ? STRIDE_TRK : STRIDE;
    const buf = new ArrayBuffer(vCount * stride);
    const f32 = new Float32Array(buf);
    const i16 = new Int16Array(buf);
    const u16 = new Uint16Array(buf);
    const fS = stride >> 2, sS = stride >> 1;   // stride in float / short units
    for (let i = 0; i < vCount; i++) {
      const fo = i * fS, so = i * sS, p = i * 3;
      f32[fo] = pos[p]; f32[fo + 1] = pos[p + 1]; f32[fo + 2] = pos[p + 2];
      i16[so + 6] = qs(nrm[p]); i16[so + 7] = qs(nrm[p + 1]); i16[so + 8] = qs(nrm[p + 2]);
      i16[so + 9] = 0;                                     // pad — keeps att. 2 four-byte aligned
      u16[so + 10] = qc(col[p]); u16[so + 11] = qc(col[p + 1]); u16[so + 12] = qc(col[p + 2]);
      u16[so + 13] = mat ? qm(mat[i]) : 0;
      if (trk) { f32[fo + 7] = trk[p]; f32[fo + 8] = trk[p + 1]; f32[fo + 9] = trk[p + 2]; }
    }
    return buf;
  }

  // Point attributes 0/1/2 (and 4 on the road) at a packed buffer already bound
  // to ARRAY_BUFFER. Attribute 3 is deliberately never enabled any more: the
  // material id rides in the alpha of attribute 2 and LIT_VS no longer declares
  // a location 3. Locations 5-9 stay free for the per-instance columns.
  function bindAttribs(gl, hasTrk) {
    const stride = hasTrk ? STRIDE_TRK : STRIDE;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT,          false, stride,  0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.SHORT,          true,  stride, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.UNSIGNED_SHORT, true,  stride, 20);
    if (hasTrk) { gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 3, gl.FLOAT, false, stride, 28); }
  }

  // IEEE-754 binary16. WGX writes `float16x4` vertex buffers and TLX builds
  // Float16BufferAttributes; both need colours past 1.0 (emissive reaches 3.4),
  // which a unorm byte or short cannot hold without a scale the shader would
  // have to know about. Half-float costs two bytes, reads as a plain float in
  // WGSL and TSL alike, and holds every material id exactly (integers to 2048).
  // Sub-normals and the exponent clamp are handled: a value past 65504
  // saturates to Infinity rather than wrapping to a small number.
  function toHalf(v) {
    if (!(v === v)) return 0x7e00;                       // NaN -> quiet NaN
    const sign = v < 0 || Object.is(v, -0) ? 0x8000 : 0;
    const a = Math.abs(v);
    if (a === Infinity) return sign | 0x7c00;
    if (a >= 65520) return sign | 0x7c00;                // rounds to Infinity
    if (a < 6.103515625e-5) {                            // sub-normal
      return sign | Math.round(a / 5.960464477539063e-8);
    }
    let e = Math.floor(Math.log2(a));
    let m = a / Math.pow(2, e) - 1;
    if (m >= 1) { m -= 1; e += 1; }                      // log2 rounding guard
    let mant = Math.round(m * 1024);
    if (mant === 1024) { mant = 0; e += 1; }
    if (e > 15) return sign | 0x7c00;
    if (e < -14) return sign | Math.round(a / 5.960464477539063e-8);
    return sign | ((e + 15) << 10) | mant;
  }

  return { COL_SCALE, MAT_SCALE, COL_Q, MAT_Q, STRIDE, STRIDE_TRK,
           pack, bindAttribs, snorm16: qs, unorm16col: qc, unorm16mat: qm, toHalf };
})();

if (typeof window !== "undefined") window.VertexPack = VertexPack;
