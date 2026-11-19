const SkidMarks = (function () {
  "use strict";

  const MAX_SKID = 120;
  const _SKID_W = 0.6, _SKID_L = 2.2;
  const _SKID_CORNERS = [-0.5, -0.5, -0.5, 0.5, 0.5, 0.5, -0.5, -0.5, 0.5, 0.5, 0.5, -0.5];
  const SKID_CULL = 170 * 170;
  const STAMP_EVERY_S = 5 / 60;
  const AI_CAP = 40;

  function create() {
    Log.info("game", "SkidMarks.create");
    const marks = Array.from({ length: MAX_SKID }, () => new Float32Array(16));
    let active = 0;
    let idx = 0;
    const own = { t: 0 };
    const other = new Uint8Array(MAX_SKID);
    let otherLive = 0, age = 0;
    const ages = new Float64Array(MAX_SKID);

    const verts = new Float32Array(MAX_SKID * 6 * 5);
    let vertCount = 0;
    let dirty = false;

    const REBUILD_MOVE = 16, BATCH_CULL = (170 + REBUILD_MOVE) * (170 + REBUILD_MOVE);
    let rbX = 0, rbZ = 0;
    function rebuild(ex, ez) {
      rbX = ex; rbZ = ez;
      const full = active >= MAX_SKID, cnt = full ? MAX_SKID : active;
      let o = 0;
      for (let i = 0; i < cnt; i++) {
        const M = full ? marks[(idx + i) % MAX_SKID] : marks[i];
        { const dx = M[12] - ex, dz = M[14] - ez; if (dx * dx + dz * dz > BATCH_CULL) continue; }
        const m0 = M[0], m1 = M[1], m2 = M[2], m4 = M[4], m5 = M[5], m6 = M[6],
              m8 = M[8], m9 = M[9], m10 = M[10], m12 = M[12], m13 = M[13], m14 = M[14];
        for (let v = 0; v < 6; v++) {
          const ax = _SKID_CORNERS[v * 2], ay = _SKID_CORNERS[v * 2 + 1];
          const lx = ax * _SKID_W, lz = ay * _SKID_L;
          verts[o++] = m0 * lx + m4 * 0.02 + m8 * lz + m12;
          verts[o++] = m1 * lx + m5 * 0.02 + m9 * lz + m13;
          verts[o++] = m2 * lx + m6 * 0.02 + m10 * lz + m14;
          verts[o++] = ax * 2;
          verts[o++] = ay * 2;
        }
      }
      vertCount = o / 5;
      dirty = false;
    }

    function reset() {
      active = 0; idx = 0; own.t = 0; other.fill(0); otherLive = 0; age = 0; ages.fill(0); dirty = true;
    }

    function due(timer, laying, dt) {
      if (!laying) { timer.t = 0; return false; }
      timer.t -= dt === undefined ? 1 / 60 : Math.max(0, +dt || 0);
      if (timer.t > 0) return false;
      timer.t = Math.max(-STAMP_EVERY_S, timer.t) + STAMP_EVERY_S;
      return true;
    }
    function lay(mat, isOther) {
      if (active >= MAX_SKID && other[idx]) otherLive--;
      other[idx] = isOther ? 1 : 0;
      if (isOther) otherLive++;
      marks[idx].set(mat);
      ages[idx] = ++age;
      idx = (idx + 1) % MAX_SKID;
      if (active < MAX_SKID) active++;
      dirty = true;
    }

    function stamp(mat, laying, dt) {
      if (due(own, laying, dt)) lay(mat, false);
    }
    function stampFor(timer, mat, laying, dt) {
      if (!timer || !due(timer, laying, dt)) return false;
      if (otherLive >= AI_CAP) {
        let oldest = -1;
        for (let i = 0; i < active; i++) {
          if (other[i] && (oldest < 0 || ages[i] < ages[oldest])) oldest = i;
        }
        if (oldest < 0) return false;
        marks[oldest].set(mat); ages[oldest] = ++age; dirty = true;
        return true;
      }
      lay(mat, true);
      return true;
    }

    function draw(gfx, camEye) {
      let rebuilt = false;
      const ex = (camEye && camEye[0]) || 0, ez = (camEye && camEye[2]) || 0;
      if (dirty || Math.abs(ex - rbX) + Math.abs(ez - rbZ) > REBUILD_MOVE) { rebuild(ex, ez); rebuilt = true; }
      if (gfx.drawSkidBatch(verts, vertCount, rebuilt)) return;
      const full = active >= MAX_SKID, cnt = full ? MAX_SKID : active;
      for (let i = 0; i < cnt; i++) {
        const m = full ? marks[(idx + i) % MAX_SKID] : marks[i];
        const dx = m[12] - ex, dz = m[14] - ez;
        if (dx * dx + dz * dz > SKID_CULL) continue;
        gfx.drawMark(m, _SKID_W, _SKID_L);
      }
    }

    return { reset, stamp, stampFor, draw, get count() { return active; }, get otherCount() { return otherLive; } };
  }

  return { create, MAX_SKID, AI_CAP };
})();
Object.freeze(SkidMarks);
