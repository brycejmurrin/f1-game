"use strict";

const InstCells = (function () {
  let _enabled = true;
  try { if (localStorage.getItem("apex26.instCellCache") === "0") _enabled = false; } catch (_) {  }

  function enabled() { return _enabled; }

  function collectVisible(planes, cells, ks, aabbInFrustum, eye, cd, fog) {
    const radial = !!eye && (cd > 0 || !!(fog && fog[0] > 0));
    let kN = 0;
    for (let ci = 0, cn = cells.length; ci < cn; ci++) {
      const c = cells[ci];
      if (!aabbInFrustum(planes, c.mn, c.mx)) continue;
      if (radial && Frustum.radialCulled(c.mn, c.mx, eye[0], eye[1], eye[2], cd, fog)) continue;
      ks[kN++] = ci;
    }
    return kN;
  }

  function sameRadial(batch, eye, cd, fog) {
    const s = batch._cullRadial;
    if (!s) return false;
    const active = !!eye && (cd > 0 || !!(fog && fog[0] > 0));
    if (!active) return s[6] === 0;
    return s[6] === 1 && s[0] === eye[0] && s[1] === eye[1] && s[2] === eye[2]
      && s[3] === (cd || 0) && s[4] === (fog ? fog[0] : 0) && s[5] === (fog ? fog[1] : 0);
  }
  function recordRadial(batch, eye, cd, fog) {
    const s = batch._cullRadial || (batch._cullRadial = new Float64Array(7));
    const active = !!eye && (cd > 0 || !!(fog && fog[0] > 0));
    s[6] = active ? 1 : 0;
    if (!active) return;
    s[0] = eye[0]; s[1] = eye[1]; s[2] = eye[2];
    s[3] = cd || 0; s[4] = fog ? fog[0] : 0; s[5] = fog ? fog[1] : 0;
  }

  function scratchKeys(batch, cn) {
    let ks = batch._cellKeyScratch;
    if (!ks || ks.length < cn) ks = batch._cellKeyScratch = new Int32Array(cn);
    return ks;
  }

  function sameKey(batch, ks, kN) {
    const res = batch._cellKey;
    if (!res || batch._cellKeyN !== kN) return false;
    for (let i = 0; i < kN; i++) if (res[i] !== ks[i]) return false;
    return true;
  }

  function recordKey(batch, ks, kN) {
    const cn = batch.cells.length;
    let res = batch._cellKey;
    if (!res || res.length < kN) res = batch._cellKey = new Int32Array(cn);
    for (let i = 0; i < kN; i++) res[i] = ks[i];
    batch._cellKeyN = kN;
  }

  function invalidate(batch) {
    if (batch) batch._cellKeyN = -1;
  }

  return { enabled, collectVisible, sameRadial, recordRadial, scratchKeys, sameKey, recordKey, invalidate };
})();
Object.freeze(InstCells);
