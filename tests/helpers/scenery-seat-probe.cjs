"use strict";
// @doc Scenery seat probe: `seatProbe(env, id)` lists shipped props that float over or sink under the ground near the road.
// Ported from the lane-G hunt's eng-seat sweep (#5088, #5084). A prim FLOATS when the
// lowest gap from its footprint (corners + centre) to the highest ground there (terrain,
// road, floor, water, gate meshes) is 0.5-4 m and no other prim touches it from below;
// it is SUNK when its top is under the terrain at all four footprint corners. Only prims
// whose footprint centre is within NEAR m of the road edge are listed (floats / sunks).
const { shipped, primKey } = require("../../tools/lib/track-build-vm.cjs");
const ck = (a, b) => a * 4000003 + b;

function groundIndex(meshes) {
  const TC = 8, grid = new Map(), TRI = [];
  for (const m of meshes) {
    if (!m || !m.__cap || !m.__cap.idx) continue;
    const pos = m.__cap.pos, idx = m.__cap.idx;
    for (let t = 0; t + 2 < idx.length; t += 3) {
      const ia = idx[t] * 3, ib = idx[t + 1] * 3, ic = idx[t + 2] * 3, base = TRI.length;
      TRI.push(pos[ia], pos[ia + 1], pos[ia + 2], pos[ib], pos[ib + 1], pos[ib + 2], pos[ic], pos[ic + 1], pos[ic + 2]);
      const x0 = Math.min(pos[ia], pos[ib], pos[ic]), x1 = Math.max(pos[ia], pos[ib], pos[ic]);
      const z0 = Math.min(pos[ia + 2], pos[ib + 2], pos[ic + 2]), z1 = Math.max(pos[ia + 2], pos[ib + 2], pos[ic + 2]);
      if (x1 - x0 > 400 || z1 - z0 > 400) continue;
      for (let gx = Math.floor(x0 / TC); gx <= Math.floor(x1 / TC); gx++)
        for (let gz = Math.floor(z0 / TC); gz <= Math.floor(z1 / TC); gz++) {
          const k = ck(gx, gz); let a = grid.get(k); if (!a) grid.set(k, a = []); a.push(base);
        }
    }
  }
  return (x, z) => {
    const arr = grid.get(ck(Math.floor(x / TC), Math.floor(z / TC))); if (!arr) return null;
    let best = null;
    for (const b of arr) {
      const ax = TRI[b], ay = TRI[b + 1], az = TRI[b + 2], bx = TRI[b + 3], by = TRI[b + 4], bz = TRI[b + 5], cx = TRI[b + 6], cy = TRI[b + 7], cz = TRI[b + 8];
      const v0x = cx - ax, v0z = cz - az, v1x = bx - ax, v1z = bz - az, v2x = x - ax, v2z = z - az;
      const d00 = v0x * v0x + v0z * v0z, d01 = v0x * v1x + v0z * v1z, d11 = v1x * v1x + v1z * v1z, d20 = v2x * v0x + v2z * v0z, d21 = v2x * v1x + v2z * v1z;
      const den = d00 * d11 - d01 * d01; if (Math.abs(den) < 1e-9) continue;
      const u = (d11 * d20 - d01 * d21) / den, v = (d00 * d21 - d01 * d20) / den;
      if (u < -0.01 || v < -0.01 || u + v > 1.01) continue;
      const y = ay + u * (cy - ay) + v * (by - ay);
      if (best === null || y > best) best = y;
    }
    return best;
  };
}

function seatProbe(env, id, NEAR = 40) {
  const from = env.mark();
  const def = env.Tracks.LIST.find((d) => d.id === id);
  const track = env.Tracks.build(def);
  const all = shipped(env.prims.slice(from), env.liveBufs);
  const M = track.meshes;
  const propPos = new Set(["props", "glass"].map((k) => M[k] && M[k].__cap && M[k].__cap.pos).filter(Boolean));
  const prims = all.filter((p) => p.buf && propPos.has(p.buf.pos));
  const T = (x, z) => env.Tracks.terrainY(track, x, z);
  const other = groundIndex(["road", "floor", "water", "gate"].map((k) => M[k]));
  const n = track.n, px = track.px, pz = track.pz, hw = track.hw;
  const NG = 40, ng = new Map();
  for (let k = 0; k < n; k++) { const kk = ck(Math.floor(px[k] / NG), Math.floor(pz[k] / NG)); let a = ng.get(kk); if (!a) ng.set(kk, a = []); a.push(k); }
  const nearest = (x, z) => {
    let best = -1, bd = Infinity; const gx = Math.floor(x / NG), gz = Math.floor(z / NG);
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) { const a = ng.get(ck(gx + dx, gz + dz)); if (!a) continue; for (const k of a) { const d = (x - px[k]) ** 2 + (z - pz[k]) ** 2; if (d < bd) { bd = d; best = k; } } }
    if (best < 0) return null;
    return { k: best, edge: Math.sqrt(bd) - hw[best] };
  };
  // support grid: prim tops
  const SC = 4, sg = new Map();
  prims.forEach((p, i) => { for (let gx = Math.floor(p.minX / SC); gx <= Math.floor(p.maxX / SC); gx++) for (let gz = Math.floor(p.minZ / SC); gz <= Math.floor(p.maxZ / SC); gz++) { if ((p.maxX - p.minX) > 200 || (p.maxZ - p.minZ) > 200) continue; const k = ck(gx, gz); let a = sg.get(k); if (!a) sg.set(k, a = []); a.push(i); } });
  const supported = (p, i) => {
    const a = new Set();
    for (let gx = Math.floor(p.minX / SC); gx <= Math.floor(p.maxX / SC); gx++) for (let gz = Math.floor(p.minZ / SC); gz <= Math.floor(p.maxZ / SC); gz++) for (const j of (sg.get(ck(gx, gz)) || [])) a.add(j);
    for (const j of a) { if (j === i) continue; const o = prims[j];
      if (o.minX - 0.05 > p.maxX || o.maxX + 0.05 < p.minX || o.minZ - 0.05 > p.maxZ || o.maxZ + 0.05 < p.minZ) continue;
      if (o.maxY >= p.minY - 0.15 && o.minY <= p.maxY + 0.15 && (o.minY < p.minY - 0.05 || o.maxY > p.maxY + 0.05)) return true; }
    return false;
  };
  const res = { id, prims: prims.length, float: 0, floatNear: 0, sunk: 0, sunkNear: 0, worst: [], worstSunk: [] };
  const fl = [], sk = [];
  prims.forEach((p, i) => {
    const pts = [[p.minX, p.minZ], [p.maxX, p.minZ], [p.minX, p.maxZ], [p.maxX, p.maxZ], [(p.minX + p.maxX) / 2, (p.minZ + p.maxZ) / 2]];
    if ((p.maxX - p.minX) > 150 || (p.maxZ - p.minZ) > 150) return;  // slabs/backdrops
    const gs = pts.map(([x, z]) => { const t = T(x, z), o = other(x, z); return t == null ? o : o == null ? t : Math.max(t, o); });
    if (gs.some((g) => g == null)) return;
    const tops = pts.slice(0, 4).map(([x, z]) => T(x, z));
    const gaps = gs.map((g) => p.minY - g);
    const gmin = Math.min(...gaps);
    const nr = nearest(pts[4][0], pts[4][1]);
    const rec = { name: p.name, mat: p.mat, q: p.q, x: +pts[4][0].toFixed(1), z: +pts[4][1].toFixed(1), minY: +p.minY.toFixed(2), h: +(p.maxY - p.minY).toFixed(2), w: +Math.max(p.maxX - p.minX, p.maxZ - p.minZ).toFixed(1), gap: +gmin.toFixed(2), gc: +gaps[4].toFixed(2), frac: nr ? +(nr.k / n).toFixed(3) : null, edge: nr ? +nr.edge.toFixed(1) : null, key: primKey(p) };
    // (a) floating: lowest-gap point still > 0.5 m, sitting low (< 6 m), not resting on another prim
    if (gmin > 0.5 && gmin < 4 && !(rec.edge != null && rec.edge < 0.5) && !supported(p, i)) { res.float++; if (rec.edge != null && rec.edge < NEAR) { res.floatNear++; fl.push(rec); } }
    // (b) sunk: top below terrain at all four corners
    if (tops.every((t) => t != null && p.maxY < t - 0.02)) { res.sunk++; rec.depth = +(Math.min(...tops) - p.maxY).toFixed(2); if (rec.edge != null && rec.edge < NEAR) { res.sunkNear++; sk.push(rec); } }
  });
  fl.sort((a, b) => b.gap - a.gap); sk.sort((a, b) => b.h * b.w - a.h * a.w);
  res.floats = fl; res.sunks = sk;
  env.trim(from);
  env.release(track);
  return res;
}


module.exports = { seatProbe };
