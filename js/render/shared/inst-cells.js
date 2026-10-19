/* Apex 26 — InstCells: shared cell-set key cache for GLX + WGX + TLX cullInstances.
 * The pack uploaded for an instanced batch is a deterministic function of the
 * surviving cell set (docs/notes/PERF-FINDINGS 2c). When the set is unchanged
 * across frames, every backend skips the copy loop and the buffer upload.
 * Plane-equality fast paths and the per-backend pack/upload stay local.
 */
"use strict";

const InstCells = (function () {
  // ON by default; apex26.instCellCache=0 is the escape hatch (GLX parity).
  let _enabled = true;
  try { if (localStorage.getItem("apex26.instCellCache") === "0") _enabled = false; } catch (_) { /* no storage */ }

  function enabled() { return _enabled; }

  /** Fill ks[0..kN) with indices of cells whose AABB survives the frustum and optional radial/fog budget. Returns kN. */
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

  // These scalars describe the SAME physical pack as _cullPlanes. Never update
  // either snapshot on a cell-key hit: a newer eye with older planes could
  // otherwise claim a combination that never produced the resident bytes.
  function sameRadial(batch, eye, cd, fog) {
    const s = batch._cullRadial;
    if (!s) return false;
    const active = !!eye && (cd > 0 || !!(fog && fog[0] > 0));
    if (!active) return s[6] === 0;   // moving an eye cannot alter an inactive budget
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

  /** Scratch Int32Array on the batch, grown to at least cn. */
  function scratchKeys(batch, cn) {
    let ks = batch._cellKeyScratch;
    if (!ks || ks.length < cn) ks = batch._cellKeyScratch = new Int32Array(cn);
    return ks;
  }

  /** True when batch._cellKey matches ks[0..kN). */
  function sameKey(batch, ks, kN) {
    const res = batch._cellKey;
    if (!res || batch._cellKeyN !== kN) return false;
    for (let i = 0; i < kN; i++) if (res[i] !== ks[i]) return false;
    return true;
  }

  /** Record the cell set that produced the bytes now resident. */
  function recordKey(batch, ks, kN) {
    const cn = batch.cells.length;
    let res = batch._cellKey;
    if (!res || res.length < kN) res = batch._cellKey = new Int32Array(cn);
    for (let i = 0; i < kN; i++) res[i] = ks[i];
    batch._cellKeyN = kN;
  }

  /** Clear after a non-frustum rewrite (updateInstances). */
  function invalidate(batch) {
    if (batch) batch._cellKeyN = -1;
  }

  return { enabled, collectVisible, sameRadial, recordRadial, scratchKeys, sameKey, recordKey, invalidate };
})();
Object.freeze(InstCells);
