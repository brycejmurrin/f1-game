/* Apex 26 — InstCells: shared cell-set key cache for GLX + WGX cullInstances.
 * The pack uploaded for an instanced batch is a deterministic function of the
 * surviving cell set (docs/notes/PERF-FINDINGS 2c). When the set is unchanged
 * across frames, both backends skip the copy loop and the buffer upload.
 * Plane-equality fast paths and the per-backend pack/upload stay local.
 */
"use strict";

const InstCells = (function () {
  // ON by default; apex26.instCellCache=0 is the escape hatch (GLX parity).
  let _enabled = true;
  try { if (localStorage.getItem("apex26.instCellCache") === "0") _enabled = false; } catch (_) { /* no storage */ }

  function enabled() { return _enabled; }

  /** Fill ks[0..kN) with indices of cells whose AABB is in frustum. Returns kN. */
  function collectVisible(planes, cells, ks, aabbInFrustum) {
    let kN = 0;
    for (let ci = 0, cn = cells.length; ci < cn; ci++) {
      if (aabbInFrustum(planes, cells[ci].mn, cells[ci].mx)) ks[kN++] = ci;
    }
    return kN;
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

  return { enabled, collectVisible, scratchKeys, sameKey, recordKey, invalidate };
})();
Object.freeze(InstCells);
