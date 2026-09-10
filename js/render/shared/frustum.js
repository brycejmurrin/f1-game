/* Apex 26 — shared frustum cull math (Frustum). Gribb–Hartmann plane extraction
   from a column-major view-proj (m[col*4+row]) plus conservative AABB tests.
   One backend-neutral home so GLX chunked, TLX chunked, and WGX never drift on
   near-plane convention (GL clip w+z >= 0 on a raw GL matrix — WebGPU Z01 is
   applied only on GPU upload). bucketInstances is the shared instance-cell
   binning the three createInstancedBatch paths feed to cullInstances. */
"use strict";

const Frustum = (function () {

  function setPlane(p, a, b, c, d) {
    const inv = 1 / (Math.hypot(a, b, c) || 1);
    p[0] = a * inv; p[1] = b * inv; p[2] = c * inv; p[3] = d * inv;
  }

  // Fill `planes` (six Float32Array(4)) from column-major view-proj.
  function extractPlanes(m, planes) {
    const m0=m[0],m4=m[4],m8=m[8],m12=m[12], m1=m[1],m5=m[5],m9=m[9],m13=m[13],
          m2=m[2],m6=m[6],m10=m[10],m14=m[14], m3=m[3],m7=m[7],m11=m[11],m15=m[15];
    setPlane(planes[0], m3+m0, m7+m4, m11+m8,  m15+m12); // left   (w + x >= 0)
    setPlane(planes[1], m3-m0, m7-m4, m11-m8,  m15-m12); // right  (w - x >= 0)
    setPlane(planes[2], m3+m1, m7+m5, m11+m9,  m15+m13); // bottom (w + y >= 0)
    setPlane(planes[3], m3-m1, m7-m5, m11-m9,  m15-m13); // top    (w - y >= 0)
    setPlane(planes[4], m3+m2, m7+m6, m11+m10, m15+m14); // near  (GL clip w+z >= 0)
    setPlane(planes[5], m3-m2, m7-m6, m11-m10, m15-m14); // far   (GL clip w-z >= 0)
  }

  // AABB vs frustum via the box's most-positive vertex per plane (conservative).
  function aabbInFrustum(planes, mn, mx) {
    for (let i = 0; i < 6; i++) {
      const p = planes[i];
      const px = p[0] >= 0 ? mx[0] : mn[0];
      const py = p[1] >= 0 ? mx[1] : mn[1];
      const pz = p[2] >= 0 ? mx[2] : mn[2];
      if (p[0]*px + p[1]*py + p[2]*pz + p[3] < 0) return false;
    }
    return true;
  }

  // Squared distance from point (ex,ey,ez) to the nearest point on an AABB.
  function aabbDist2(mn, mx, ex, ey, ez) {
    const dx = ex < mn[0] ? mn[0] - ex : ex > mx[0] ? ex - mx[0] : 0;
    const dy = ey < mn[1] ? mn[1] - ey : ey > mx[1] ? ey - mx[1] : 0;
    const dz = ez < mn[2] ? mn[2] - ez : ez > mx[2] ? ez - mx[2] : 0;
    return dx * dx + dy * dy + dz * dz;
  }

  // Six planes per call. Pass `out` (6×Float32Array(4)) to reuse a caller pool —
  // the race prop-batch path must not allocate every frame. Without `out`, allocate
  // fresh so a held agentview result cannot be rewritten.
  function makeFrustumPlanes(viewProj, out) {
    const p = out || [new Float32Array(4), new Float32Array(4), new Float32Array(4),
                      new Float32Array(4), new Float32Array(4), new Float32Array(4)];
    extractPlanes(viewProj, p);
    return p;
  }

  // Bucket instanced-batch instances into cellSize XZ cells with a conservative
  // AABB per cell (instance reach = model extent x largest per-instance scale).
  // Same grid the chunked meshes use, so "nearby" means the same thing to both.
  // Byte-identical to the three builders it replaced (GLX createInstancedBatch,
  // WGX, TLX): same key, same insertion order, same bounds.
  function bucketInstances(matrices, n, pos, cell, radius) {
    let reach = radius || 0;
    if (!reach) {
      for (let i = 0; i < pos.length; i++) { const a = Math.abs(pos[i]); if (a > reach) reach = a; }
    }
    const buckets = new Map();
    for (let i = 0; i < n; i++) {
      const b = i * 16, x = matrices[b + 12], y = matrices[b + 13], z = matrices[b + 14];
      // Column lengths ARE the per-instance scale (orthonormal basis * scale).
      const sx = Math.hypot(matrices[b], matrices[b + 1], matrices[b + 2]);
      const sy = Math.hypot(matrices[b + 4], matrices[b + 5], matrices[b + 6]);
      const sz = Math.hypot(matrices[b + 8], matrices[b + 9], matrices[b + 10]);
      const r = reach * Math.max(sx, sy, sz);
      const key = (Math.floor(x / cell) + 1024) * 4096 + (Math.floor(z / cell) + 1024);
      let bk = buckets.get(key);
      if (!bk) buckets.set(key, (bk = { idx: [], mn: [Infinity, Infinity, Infinity], mx: [-Infinity, -Infinity, -Infinity] }));
      bk.idx.push(i);
      const mn = bk.mn, mx = bk.mx;
      if (x - r < mn[0]) mn[0] = x - r; if (x + r > mx[0]) mx[0] = x + r;
      if (y - r < mn[1]) mn[1] = y - r; if (y + r > mx[1]) mx[1] = y + r;
      if (z - r < mn[2]) mn[2] = z - r; if (z + r > mx[2]) mx[2] = z + r;
    }
    return [...buckets.values()];
  }

  return { extractPlanes, makeFrustumPlanes, aabbInFrustum, aabbDist2, bucketInstances };
})();
Object.freeze(Frustum);
