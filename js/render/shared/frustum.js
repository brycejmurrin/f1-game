"use strict";

const Frustum = (function () {

  function setPlane(p, a, b, c, d) {
    const inv = 1 / (Math.hypot(a, b, c) || 1);
    p[0] = a * inv; p[1] = b * inv; p[2] = c * inv; p[3] = d * inv;
  }

  function extractPlanes(m, planes) {
    const m0=m[0],m4=m[4],m8=m[8],m12=m[12], m1=m[1],m5=m[5],m9=m[9],m13=m[13],
          m2=m[2],m6=m[6],m10=m[10],m14=m[14], m3=m[3],m7=m[7],m11=m[11],m15=m[15];
    setPlane(planes[0], m3+m0, m7+m4, m11+m8,  m15+m12);
    setPlane(planes[1], m3-m0, m7-m4, m11-m8,  m15-m12);
    setPlane(planes[2], m3+m1, m7+m5, m11+m9,  m15+m13);
    setPlane(planes[3], m3-m1, m7-m5, m11-m9,  m15-m13);
    setPlane(planes[4], m3+m2, m7+m6, m11+m10, m15+m14);
    setPlane(planes[5], m3-m2, m7-m6, m11-m10, m15-m14);
  }

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

  function aabbDist2(mn, mx, ex, ey, ez) {
    const dx = ex < mn[0] ? mn[0] - ex : ex > mx[0] ? ex - mx[0] : 0;
    const dy = ey < mn[1] ? mn[1] - ey : ey > mx[1] ? ey - mx[1] : 0;
    const dz = ez < mn[2] ? mn[2] - ez : ez > mx[2] ? ez - mx[2] : 0;
    return dx * dx + dy * dy + dz * dz;
  }

  const FOG_CULL_FD = 3;
  function radialCulled(mn, mx, ex, ey, ez, cd, fog) {
    const d2 = aabbDist2(mn, mx, ex, ey, ez);
    if (cd > 0 && d2 > cd * cd) return true;
    const dens = fog ? fog[0] : 0;
    if (!(dens > 0)) return false;
    const r = FOG_CULL_FD / dens;
    if (d2 <= r * r) return false;
    const lift = mx[1] - ey, h = fog[1];
    return !(lift > 0 && h > 0) || Math.sqrt(d2) * Math.exp(-lift * h) > r;
  }

  function makeFrustumPlanes(viewProj, out) {
    const p = out || [new Float32Array(4), new Float32Array(4), new Float32Array(4),
                      new Float32Array(4), new Float32Array(4), new Float32Array(4)];
    extractPlanes(viewProj, p);
    return p;
  }

  const MOTION_PAD = 2;

  function bucketInstances(matrices, n, pos, cell, radius) {
    let reach = radius || 0;
    let cx = 0, cy = 0, cz = 0, hx = 0, hy = 0, hz = 0, tight = false;
    if (!reach) {
      let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
      for (let i = 0; i + 2 < pos.length; i += 3) {
        const x = pos[i], y = pos[i + 1], z = pos[i + 2];
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
        if (z < z0) z0 = z; if (z > z1) z1 = z;
        const d = Math.hypot(x, y, z);
        if (d > reach) reach = d;
      }
      if (x1 >= x0) {
        tight = true;
        cx = (x0 + x1) * 0.5; cy = (y0 + y1) * 0.5; cz = (z0 + z1) * 0.5;
        hx = (x1 - x0) * 0.5; hy = (y1 - y0) * 0.5; hz = (z1 - z0) * 0.5;
      }
    }
    const buckets = new Map();
    for (let i = 0; i < n; i++) {
      const b = i * 16, x = matrices[b + 12], y = matrices[b + 13], z = matrices[b + 14];
      const m0 = matrices[b], m1 = matrices[b + 1], m2 = matrices[b + 2];
      const m4 = matrices[b + 4], m5 = matrices[b + 5], m6 = matrices[b + 6];
      const m8 = matrices[b + 8], m9 = matrices[b + 9], m10 = matrices[b + 10];
      const axis = m1 === 0 && m2 === 0 && m4 === 0 && m6 === 0 && m8 === 0 && m9 === 0;
      const rx = reach * (axis ? Math.abs(m0) : Math.hypot(m0, m4, m8));
      const ry = reach * (axis ? Math.abs(m5) : Math.hypot(m1, m5, m9));
      const rz = reach * (axis ? Math.abs(m10) : Math.hypot(m2, m6, m10));
      let x0 = x - rx, x1 = x + rx, y0 = y - ry, y1 = y + ry, z0 = z - rz, z1 = z + rz;
      if (tight) {
        const wx = m0 * cx + m4 * cy + m8 * cz + x;
        const wy = m1 * cx + m5 * cy + m9 * cz + y;
        const wz = m2 * cx + m6 * cy + m10 * cz + z;
        const ex = Math.abs(m0) * hx + Math.abs(m4) * hy + Math.abs(m8) * hz + MOTION_PAD;
        const ey = Math.abs(m1) * hx + Math.abs(m5) * hy + Math.abs(m9) * hz + MOTION_PAD;
        const ez = Math.abs(m2) * hx + Math.abs(m6) * hy + Math.abs(m10) * hz + MOTION_PAD;
        if (wx - ex > x0) x0 = wx - ex; if (wx + ex < x1) x1 = wx + ex;
        if (wy - ey > y0) y0 = wy - ey; if (wy + ey < y1) y1 = wy + ey;
        if (wz - ez > z0) z0 = wz - ez; if (wz + ez < z1) z1 = wz + ez;
      }
      const key = (Math.floor(x / cell) + 1024) * 4096 + (Math.floor(z / cell) + 1024);
      let bk = buckets.get(key);
      if (!bk) buckets.set(key, (bk = { idx: [], mn: [Infinity, Infinity, Infinity], mx: [-Infinity, -Infinity, -Infinity] }));
      bk.idx.push(i);
      const mn = bk.mn, mx = bk.mx;
      if (x0 < mn[0]) mn[0] = x0; if (x1 > mx[0]) mx[0] = x1;
      if (y0 < mn[1]) mn[1] = y0; if (y1 > mx[1]) mx[1] = y1;
      if (z0 < mn[2]) mn[2] = z0; if (z1 > mx[2]) mx[2] = z1;
    }
    return [...buckets.values()];
  }

  return { extractPlanes, makeFrustumPlanes, aabbInFrustum, aabbDist2, radialCulled, bucketInstances };
})();
Object.freeze(Frustum);
