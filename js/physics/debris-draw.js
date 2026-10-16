/* Apex 26 — DebrisDraw: instanced drawing of the DebrisWorld pools (shard / marble / cone / panel).
   Pure move out of debris-world.js (#1661). drawPool(gfx, ...) packs one
   pool's bodies to mat4s and draws them in one call, or per body on a backend without updateInstances. */
const DebrisDraw = (function () {
  "use strict";

  const _mat = new Float32Array(16);   // reused draw matrix
  _mat[15] = 1;

  // A body's pose as a column-major mat4, written into slot `n` of `out`. The
  // per-body and instanced paths share this, so the two can never disagree about
  // where a shard is. Per-body SCALE is baked into the matrix, which is why a
  // shard's random size costs the instanced path nothing extra.
  function packBody(out, n, body, sc) {
    const t = body.translation(), q = body.rotation();
    const x = q.x, y = q.y, z = q.z, w = q.w;
    const xx = x * x, yy = y * y, zz = z * z;
    const xy = x * y, xz = x * z, yz = y * z, wx = w * x, wy = w * y, wz = w * z;
    const o = n * 16;
    out[o] = (1 - 2 * (yy + zz)) * sc; out[o + 1] = 2 * (xy + wz) * sc; out[o + 2] = 2 * (xz - wy) * sc; out[o + 3] = 0;
    out[o + 4] = 2 * (xy - wz) * sc; out[o + 5] = (1 - 2 * (xx + zz)) * sc; out[o + 6] = 2 * (yz + wx) * sc; out[o + 7] = 0;
    out[o + 8] = 2 * (xz + wy) * sc; out[o + 9] = 2 * (yz - wx) * sc; out[o + 10] = (1 - 2 * (xx + yy)) * sc; out[o + 11] = 0;
    out[o + 12] = t.x; out[o + 13] = t.y; out[o + 14] = t.z; out[o + 15] = 1;
  }

  function drawBody(body, sc, mesh, opts, gfx) {
    packBody(_mat, 0, body, sc);
    gfx.draw(mesh, _mat, opts);
  }

  // INSTANCED POOLS. One shared mesh, one constant opaque material and N per-body
  // mat4s is exactly the shape drawInstanced exists for, and this side-world was
  // four per-body loops: at desktop caps a pileup reaches 48+16+24+10 = 98 draws.
  //
  // MEASURED on vegas night with NO incident debris at all (docs/PERF-FINDINGS.md
  // 2h): 17 draws a frame, every one a CONE. registerFurniture places a cone at
  // every corner of every circuit and the cone loop has no liveness test, so this
  // is a cost on every frame of every lap, not a pileup-only one — which is
  // exactly why the steady-state census never attributed it. Instanced, the whole
  // side-world is four draws whatever happens.
  //
  // Capability read, not a hard dependency: all three backends ship
  // updateInstances (glx.js, wgx.js, tlx.js), so the per-body fallback below is
  // dead on the shipped backends and stays only for a
  // backend that honestly lacks the name. Same shape as gfx.hasPerChunkLights
  // (docs/RENDERERS.md), which is still GLX + WGX only.
  // null = not tried yet, false = unavailable on this backend.
  const _batch = { shard: null, marble: null, cone: null, panel: null };
  const _bMat = { shard: null, marble: null, cone: null, panel: null };
  const _bCap = { shard: 0, marble: 0, cone: 0, panel: 0 };

  function poolBatch(gfx, key, geom, cap) {
    // capFor() honours an apex26.debrisCap override of up to 256, so the cap can
    // exceed what the batch was built for. Rebuild rather than clamp: silently
    // dropping bodies would make the override look broken.
    if (_batch[key] && _bCap[key] < cap) {
      if (gfx.freeInstancedBatch) gfx.freeInstancedBatch(_batch[key]);
      _batch[key] = null; _bMat[key] = null;
    }
    if (_batch[key] !== null) return _batch[key];
    if (!gfx || !gfx.createInstancedBatch || !gfx.updateInstances || !gfx.drawInstanced)
      return (_batch[key] = false);
    // createInstancedBatch sizes batch.instances from the array it is handed, so
    // this reserves the pool's whole cap once; updateInstances narrows `visible`.
    const mats = _bMat[key] = new Float32Array(Math.max(1, cap) * 16);
    _bCap[key] = cap;
    _batch[key] = gfx.createInstancedBatch(geom(), mats, null, null) || false;
    return _batch[key];
  }

  // Per-body fallback mesh, built once per pool from the same geometry.
  const _mesh = { shard: null, marble: null, cone: null, panel: null };
  function poolMesh(gfx, key, geom) {
    return _mesh[key] || (_mesh[key] = gfx.createMesh(geom()));
  }

  // Pack one pool's live bodies to the front and draw them in one call. Packing
  // is not optional: WebGL2 has no baseInstance, so an instanced draw always
  // starts at instance 0 and a visible subset can only be expressed by position.
  function drawPool(gfx, key, geom, cap, opts, list, liveOnly, unitScale) {
    const b = poolBatch(gfx, key, geom, cap);
    if (!b) {
      const mesh = poolMesh(gfx, key, geom);
      for (const s of list) if (!liveOnly || s.live) drawBody(s.body, unitScale ? 1 : s.scale, mesh, opts, gfx);
      return;
    }
    const m = _bMat[key], room = b.instances | 0;
    let n = 0;
    for (const s of list) {
      if (liveOnly && !s.live) continue;
      if (n >= room) break;
      packBody(m, n++, s.body, unitScale ? 1 : s.scale);
    }
    if (!n) return;
    gfx.updateInstances(b, m, n);
    gfx.drawInstanced(b, opts);
  }

  return { drawPool };
})();
Object.freeze(DebrisDraw);
