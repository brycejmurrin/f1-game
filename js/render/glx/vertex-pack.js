/* Apex 26 — GLX packed world vertex format. The ONE definition of how a lit world mesh's attributes are laid out in its VBO; glx.js and chunked.js both up… */
"use strict";

// Every lit world mesh — road, terrain, props, glass, water, the instanced
// scenery batches, the garage/car meshes — uploads through pack() below and
// binds through bindAttribs(). LIT_VS (js/render/glx/shaders/glsl-lit.js) is
// the only reader; keep its COL_SCALE / MAT_SCALE in step with the constants
// here (tests/unit/glx-vertex-pack.test.mjs asserts the two files agree).
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
const GLXVertexPack = (function () {
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

  return { COL_SCALE, MAT_SCALE, COL_Q, MAT_Q, STRIDE, STRIDE_TRK, pack, bindAttribs };
})();

if (typeof window !== "undefined") window.GLXVertexPack = GLXVertexPack;
