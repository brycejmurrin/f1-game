const DebrisDraw = (function () {
  "use strict";

  const _mat = new Float32Array(16);
  _mat[15] = 1;

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

  const _batch = { shard: null, marble: null, cone: null, panel: null };
  const _bMat = { shard: null, marble: null, cone: null, panel: null };
  const _bCap = { shard: 0, marble: 0, cone: 0, panel: 0 };
  const _bIds = { shard: [], marble: [], cone: [], panel: [] };
  const _bVersions = { shard: [], marble: [], cone: [], panel: [] };
  const _bCount = { shard: 0, marble: 0, cone: 0, panel: 0 };
  const _poses = new WeakMap();
  let _poseId = 0;

  function slotPose(slot, scale, generation) {
    const body = slot.body;
    let p = _poses.get(slot);
    if (!p) {
      p = { id: ++_poseId, version: 0, body: null, scale: 0, generation: -1, asleep: false, mat: new Float32Array(16) };
      _poses.set(slot, p);
    }
    const asleep = generation !== undefined && body.isSleeping && body.isSleeping();
    if (!asleep || !p.asleep || p.generation !== generation || p.body !== body || p.scale !== scale) {
      packBody(p.mat, 0, body, scale);
      p.version++;
      p.body = body; p.scale = scale; p.generation = generation;
    }
    p.asleep = !!asleep;
    return p;
  }

  function poolBatch(gfx, key, geom, cap) {
    if (_batch[key] && _bCap[key] < cap) {
      if (gfx.freeInstancedBatch) gfx.freeInstancedBatch(_batch[key]);
      _batch[key] = null; _bMat[key] = null;
      _bIds[key].length = _bVersions[key].length = 0; _bCount[key] = 0;
    }
    if (_batch[key] !== null) return _batch[key];
    if (!gfx || !gfx.createInstancedBatch || !gfx.updateInstances || !gfx.drawInstanced)
      return (_batch[key] = false);
    const mats = _bMat[key] = new Float32Array(Math.max(1, cap) * 16);
    _bCap[key] = cap;
    _batch[key] = gfx.createInstancedBatch(geom(), mats, null, null) || false;
    return _batch[key];
  }

  const _mesh = { shard: null, marble: null, cone: null, panel: null };
  function poolMesh(gfx, key, geom) {
    return _mesh[key] || (_mesh[key] = gfx.createMesh(geom()));
  }

  function drawPool(gfx, key, geom, cap, opts, list, liveOnly, unitScale, generation) {
    const b = poolBatch(gfx, key, geom, cap);
    if (!b) {
      const mesh = poolMesh(gfx, key, geom);
      for (const s of list) if (!liveOnly || s.live) drawBody(s.body, unitScale ? 1 : s.scale, mesh, opts, gfx);
      return;
    }
    const m = _bMat[key], room = b.instances | 0;
    const ids = _bIds[key], versions = _bVersions[key];
    let dirty = false;
    let n = 0;
    for (const s of list) {
      if (liveOnly && !s.live) continue;
      if (n >= room) break;
      const p = slotPose(s, unitScale ? 1 : s.scale, generation);
      if (ids[n] !== p.id || versions[n] !== p.version) {
        m.set(p.mat, n * 16); ids[n] = p.id; versions[n] = p.version; dirty = true;
      }
      n++;
    }
    if (_bCount[key] !== n) dirty = true;
    _bCount[key] = n;
    if (!n) return;
    if (dirty) gfx.updateInstances(b, m, n);
    gfx.drawInstanced(b, opts);
  }

  return { drawPool };
})();
Object.freeze(DebrisDraw);
