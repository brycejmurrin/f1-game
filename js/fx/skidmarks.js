/* Apex 26 — SkidMarks: the tyre-mark ring buffer and its batched draw. SkidMarks.create(G) — needs nothing from G; it is called with it only to match the module c… */
const SkidMarks = (function () {
  "use strict";

  const MAX_SKID = 120;
  const _SKID_W = 0.6, _SKID_L = 2.2;
  // 6 verts (two tris) — matches the shadowVAO quad winding [0,1,2, 0,2,3].
  const _SKID_CORNERS = [-0.5, -0.5, -0.5, 0.5, 0.5, 0.5, -0.5, -0.5, 0.5, 0.5, 0.5, -0.5];
  const SKID_CULL = 170 * 170;
  // Seconds between stamps. This was 5 FRAMES: at the same speed a 144 Hz
  // display packed marks 2.4x denser than 60 fps and a 30 fps device left
  // dashes, while the particle emitters beside it in render() were already
  // rate·dt gated. The physics step is the natural unit — 5 steps at 60 Hz.
  const STAMP_EVERY_S = 5 / 60;

  function create(_G) {
    Log.info("game", "SkidMarks.create");
    const marks = Array.from({ length: MAX_SKID }, () => new Float32Array(16));
    let active = 0;               // how many marks are live (grows to MAX_SKID then stays)
    let idx = 0;
    let stampT = 0;               // seconds until the next stamp may be laid

    const verts = new Float32Array(MAX_SKID * 6 * 5);
    let vertCount = 0;
    let dirty = false;

    function rebuild() {
      const full = active >= MAX_SKID, cnt = full ? MAX_SKID : active;
      let o = 0;
      for (let i = 0; i < cnt; i++) {
        const M = full ? marks[(idx + i) % MAX_SKID] : marks[i];
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
      vertCount = cnt * 6;
      dirty = false;
    }

    // Clear the trail. Called from startRace() — marks are per-session, and a
    // second race on the same circuit must not inherit the first one's rubber.
    function reset() {
      active = 0; idx = 0; stampT = 0; dirty = true;
    }

    function stamp(mat, laying, dt) {
      if (!laying) { stampT = 0; return; }
      stampT -= dt > 0 ? dt : 1 / 60;   // no dt (an old caller) charges one nominal frame
      if (stampT > 0) return;
      // Carry the remainder, so a 30 Hz frame (33 ms) does not round the 83 ms
      // period up to 100 ms — but never more than one period of debt, so a
      // long frame after a stall does not lay a burst of catch-up marks.
      stampT = Math.max(-STAMP_EVERY_S, stampT) + STAMP_EVERY_S;
      marks[idx].set(mat);
      idx = (idx + 1) % MAX_SKID;
      if (active < MAX_SKID) active++;
      dirty = true;               // rebuild the batched trail next render
    }

    function draw(gfx, camEye) {
      let rebuilt = false;
      if (dirty) { rebuild(); rebuilt = true; }
      if (gfx.drawSkidBatch(verts, vertCount, rebuilt)) return;
      const ex = (camEye && camEye[0]) || 0, ez = (camEye && camEye[2]) || 0;
      const full = active >= MAX_SKID, cnt = full ? MAX_SKID : active;
      for (let i = 0; i < cnt; i++) {
        const m = full ? marks[(idx + i) % MAX_SKID] : marks[i];
        const dx = m[12] - ex, dz = m[14] - ez;
        if (dx * dx + dz * dz > SKID_CULL) continue;
        gfx.drawMark(m, _SKID_W, _SKID_L);
      }
    }

    return { reset, stamp, draw, get count() { return active; } };
  }

  return { create, MAX_SKID };
})();
Object.freeze(SkidMarks);
