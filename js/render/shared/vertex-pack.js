/* Apex 26 — packed world vertex channels. The ONE definition of how a lit world mesh's normal/colour/material are quantised, shared by all three render backends; GLX's own interleaved layout lives here too. */
"use strict";

// The ONE quantiser for a lit world mesh's normal/colour/material, shared by all backends (what must agree);
// GLX's interleaved layout lives here too. Layouts differ: GLX one interleaved VBO (material id in colour alpha,
// pack()/bindAttribs()); WGX three attributes + material id in the group-2 storage buffer (Dawn zeroes a 4th
// attribute, wgx.js); TLX named BufferAttributes (tlx-chunked.js). LIT_VS (glsl-lit.js) is the only reader of this
// layout: keep COL_SCALE / MAT_SCALE in step (tests/unit/vertex-pack.test.mjs).
//   off  0 FLOAT32 x3 position (m) | off 12 SHORT x4 normal (w pad) | off 20 USHORT x4 rgb = col / COL_SCALE,
//   a = material id / MAT_SCALE | off 28 FLOAT32 x3 track coords (ROAD ONLY)
// 28 B a vertex (40 with track coords) vs 36-40 / 52 all-float: 29.5 % off every world VBO. Position stays
// float32: coordinates run to ~7 km and quantising cracks the road ribbon.
// 4369 and 771 are EXACT divisors of 65535, so a whole id round-trips bit for bit (FLAG cloth-wave keys on id 15
// and its fraction; an ASPHALT 16 decoding as 15.99998 would ripple). 4.0 or 16.0 would NOT. Headroom measured
// over all circuits and cars: colours reach 3.4 (ceiling 15.0), material ids reach 33 (ceiling 85.0; 0-16
// procedural track materials, 20-33 car surfaces). Both clamp rather than wrap, so overflow saturates visibly.
const VertexPack = (function () {
  const COL_SCALE = 15.0, COL_Q = 4369;     // 65535 / 15
  const MAT_SCALE = 85.0, MAT_Q = 771;      // 65535 / 85
  const STRIDE = 28, STRIDE_TRK = 40;

  function qs(v) { const q = Math.round(v * 32767); return q < -32767 ? -32767 : q > 32767 ? 32767 : q; }
  function qc(v) { const q = Math.round(v * COL_Q); return q < 0 ? 0 : q > 65535 ? 65535 : q; }
  function qm(v) { const q = Math.round(v * MAT_Q); return q < 0 ? 0 : q > 65535 ? 65535 : q; }

  // Interleave pos/nrm/col/mat(/trk) into one packed ArrayBuffer, ready for
  // bufferData. `mat` and `trk` may be null. A missing material column encodes
  // 0 = MAT.FLAT, and the column rides in the colour attribute's alpha, so it
  // costs no extra byte when present.
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
  const halfFloat = new Float64Array(1), halfWords = new Uint32Array(halfFloat.buffer);
  halfFloat[0] = 1;
  const halfHigh = halfWords[0] === 0 ? 1 : 0;
  function toHalf(v) {
    if (!(v === v)) return 0x7e00;                       // NaN -> quiet NaN
    const sign = v < 0 || Object.is(v, -0) ? 0x8000 : 0;
    const a = Math.abs(v);
    if (a === Infinity) return sign | 0x7c00;
    if (a >= 65520) return sign | 0x7c00;                // rounds to Infinity
    if (a < 6.103515625e-5) {                            // sub-normal
      return sign | Math.round(a / 5.960464477539063e-8);
    }
    // Read the double directly: narrowing to f32 first double-rounds values
    // beside a half midpoint. Preserve Math.round's existing ties-up-in-
    // magnitude rule, rather than changing it to IEEE ties-even. The high
    // word holds the exponent, all ten retained bits and the rounding bit;
    // adding the rounded mantissa also carries into the exponent.
    halfFloat[0] = a;
    const hi = halfWords[halfHigh];
    return sign | ((((hi >>> 20) - 1008) << 10) + (((hi & 0xfffff) + 0x200) >>> 10));
  }

  // qc / qm stay local (pack() only). unorm16col / unorm16mat had no reader;
  // snorm16 + toHalf stay — WGX packs normals / half-float colours through them.
  return { COL_SCALE, MAT_SCALE, COL_Q, MAT_Q, STRIDE, STRIDE_TRK,
           pack, bindAttribs, snorm16: qs, toHalf };
})();

if (typeof window !== "undefined") window.VertexPack = VertexPack;
