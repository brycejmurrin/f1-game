"use strict";

const VertexPack = (function () {
  const COL_SCALE = 15.0, COL_Q = 4369;
  const MAT_SCALE = 85.0, MAT_Q = 771;
  const STRIDE = 28, STRIDE_TRK = 40;

  function qs(v) { const q = Math.round(v * 32767); return q < -32767 ? -32767 : q > 32767 ? 32767 : q; }
  function qc(v) { const q = Math.round(v * COL_Q); return q < 0 ? 0 : q > 65535 ? 65535 : q; }
  function qm(v) { const q = Math.round(v * MAT_Q); return q < 0 ? 0 : q > 65535 ? 65535 : q; }

  function pack(vCount, pos, nrm, col, mat, trk) {
    const stride = trk ? STRIDE_TRK : STRIDE;
    const buf = new ArrayBuffer(vCount * stride);
    const f32 = new Float32Array(buf);
    const i16 = new Int16Array(buf);
    const u16 = new Uint16Array(buf);
    const fS = stride >> 2, sS = stride >> 1;
    for (let i = 0; i < vCount; i++) {
      const fo = i * fS, so = i * sS, p = i * 3;
      f32[fo] = pos[p]; f32[fo + 1] = pos[p + 1]; f32[fo + 2] = pos[p + 2];
      i16[so + 6] = qs(nrm[p]); i16[so + 7] = qs(nrm[p + 1]); i16[so + 8] = qs(nrm[p + 2]);
      i16[so + 9] = 0;
      u16[so + 10] = qc(col[p]); u16[so + 11] = qc(col[p + 1]); u16[so + 12] = qc(col[p + 2]);
      u16[so + 13] = mat ? qm(mat[i]) : 0;
      if (trk) { f32[fo + 7] = trk[p]; f32[fo + 8] = trk[p + 1]; f32[fo + 9] = trk[p + 2]; }
    }
    return buf;
  }

  function bindAttribs(gl, hasTrk) {
    const stride = hasTrk ? STRIDE_TRK : STRIDE;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT,          false, stride,  0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.SHORT,          true,  stride, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.UNSIGNED_SHORT, true,  stride, 20);
    if (hasTrk) { gl.enableVertexAttribArray(4); gl.vertexAttribPointer(4, 3, gl.FLOAT, false, stride, 28); }
  }

  const halfFloat = new Float64Array(1), halfWords = new Uint32Array(halfFloat.buffer);
  halfFloat[0] = 1;
  const halfHigh = halfWords[0] === 0 ? 1 : 0;
  function toHalf(v) {
    if (!(v === v)) return 0x7e00;
    const sign = v < 0 || Object.is(v, -0) ? 0x8000 : 0;
    const a = Math.abs(v);
    if (a === Infinity) return sign | 0x7c00;
    if (a >= 65520) return sign | 0x7c00;
    if (a < 6.103515625e-5) {
      return sign | Math.round(a / 5.960464477539063e-8);
    }
    halfFloat[0] = a;
    const hi = halfWords[halfHigh];
    return sign | ((((hi >>> 20) - 1008) << 10) + (((hi & 0xfffff) + 0x200) >>> 10));
  }

  return { COL_SCALE, MAT_SCALE, COL_Q, MAT_Q, STRIDE, STRIDE_TRK,
           pack, bindAttribs, snorm16: qs, toHalf };
})();

if (typeof window !== "undefined") window.VertexPack = VertexPack;
