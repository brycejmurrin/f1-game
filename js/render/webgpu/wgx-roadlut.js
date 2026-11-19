const WGXRoadLut = (function () {
  "use strict";

  function toF32(a) { return a instanceof Float32Array ? a : new Float32Array(a); }
  function _roadLutTable(pos, trk, matArr) {
    const posA = toF32(pos), trkA = toF32(trk);
    const vCount = (posA.length / 3) | 0;
    if (!vCount || trkA.length < vCount * 3) {
      return null;
    }
    const mat = matArr && matArr.length === vCount ? toF32(matArr) : null;
    let raw = [];
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    let skipHw = 0, skipLat = 0, skipMat = 0;
    for (let i = 0; i < vCount; i++) {
      const hw = trkA[i * 3 + 2], lat = trkA[i * 3 + 1];
      if (hw <= 0.5) { skipHw++; continue; }
      if (Math.abs(lat) > 0.85) { skipLat++; continue; }
      if (mat && mat[i] !== 16) { skipMat++; continue; }
      const px = posA[i * 3], pz = posA[i * 3 + 2];
      raw.push({ px, pz, s: trkA[i * 3], hw, lat });
      if (px < minX) minX = px; if (px > maxX) maxX = px;
      if (pz < minZ) minZ = pz; if (pz > maxZ) maxZ = pz;
    }
    if (!raw.length) {
      return null;
    }
    const byStation = new Map();
    for (let i = 0; i < raw.length; i++) {
      const r = raw[i], key = Math.round(r.s * 100);
      let st = byStation.get(key);
      if (!st) { st = { neg: null, pos: null }; byStation.set(key, st); }
      const side = r.lat < 0 ? "neg" : "pos";
      if (!st[side] || Math.abs(r.lat) < Math.abs(st[side].lat)) st[side] = r;
    }
    raw = [];
    for (const { neg, pos } of byStation.values()) {
      if (neg && pos && pos.lat > 0) {
        const t = -neg.lat / (pos.lat - neg.lat);
        raw.push({ px: neg.px + (pos.px - neg.px) * t, pz: neg.pz + (pos.pz - neg.pz) * t,
                   s: neg.s, hw: neg.hw, lat: 0 });
      } else raw.push(neg && (!pos || Math.abs(neg.lat) < Math.abs(pos.lat)) ? neg : pos);
    }
    raw.sort((a, b) => a.s - b.s);
    const MAX_S = 2000;
    const step = Math.max(1, Math.ceil(raw.length / MAX_S));
    const samples = [];
    for (let i = 0; i < raw.length; i += step) samples.push(raw[i]);
    const pad = 24;
    minX -= pad; maxX += pad; minZ -= pad; maxZ += pad;
    const extX = Math.max(maxX - minX, 1), extZ = Math.max(maxZ - minZ, 1);
    const GW = 32, GH = 32, SLOT = 16;
    const cells = new Array(GW * GH);
    for (let i = 0; i < cells.length; i++) cells[i] = [];
    const cellCx = (gx) => minX + (gx + 0.5) * extX / GW;
    const cellCz = (gz) => minZ + (gz + 0.5) * extZ / GH;
    const bin = (s, gx, gz) => {
      if (gx < 0 || gz < 0 || gx >= GW || gz >= GH) return;
      const list = cells[gx + gz * GW];
      for (let j = 0; j < list.length; j++) {
        if (list[j].px === s.px && list[j].pz === s.pz) return;
      }
      if (list.length < SLOT) { list.push(s); return; }
      const cx = cellCx(gx), cz = cellCz(gz);
      const dNew = (s.px - cx) * (s.px - cx) + (s.pz - cz) * (s.pz - cz);
      let worst = -1, worstD = dNew;
      for (let j = 0; j < list.length; j++) {
        const d = (list[j].px - cx) * (list[j].px - cx) + (list[j].pz - cz) * (list[j].pz - cz);
        if (d > worstD) { worstD = d; worst = j; }
      }
      if (worst >= 0) list[worst] = s;
    };
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      const gx = Math.max(0, Math.min(GW - 1, (s.px - minX) / extX * GW | 0));
      const gz = Math.max(0, Math.min(GH - 1, (s.pz - minZ) / extZ * GH | 0));
      bin(s, gx, gz);
      bin(s, gx - 1, gz); bin(s, gx + 1, gz);
      bin(s, gx, gz - 1); bin(s, gx, gz + 1);
    }
    for (let gz = 0; gz < GH; gz++) {
      for (let gx = 0; gx < GW; gx++) {
        const list = cells[gx + gz * GW];
        const cx = minX + (gx + 0.5) * extX / GW;
        const cz = minZ + (gz + 0.5) * extZ / GH;
        while (list.length < 2) {
          let best = null, bestD = Infinity, avoid = list[0] || null;
          for (let i = 0; i < samples.length; i++) {
            const s = samples[i];
            if (avoid && (s.px - avoid.px) * (s.px - avoid.px) + (s.pz - avoid.pz) * (s.pz - avoid.pz) < 0.25) continue;
            const d = (s.px - cx) * (s.px - cx) + (s.pz - cz) * (s.pz - cz);
            if (d < bestD) { bestD = d; best = s; }
          }
          if (!best) break;
          list.push(best);
        }
      }
    }
    const out = new Float32Array(8 + GW * GH * SLOT * 4);
    let spacing = 0;
    if (samples.length > 8) {
      const gaps = [];
      for (let i = 1; i < samples.length; i++) {
        const g = samples[i].s - samples[i - 1].s;
        if (g > 0) gaps.push(g);
      }
      gaps.sort((a, b) => a - b);
      spacing = gaps.length ? gaps[gaps.length >> 1] : 0;
    }
    out[0] = 12345; out[1] = minX; out[2] = minZ; out[3] = spacing;
    out[4] = extX; out[5] = extZ; out[6] = GW; out[7] = GH;
    const FAR = { px: 1e6, pz: 1e6, s: 0, hw: 0 };
    let o = 8;
    for (let i = 0; i < GW * GH; i++) {
      const list = cells[i];
      for (let k = 0; k < SLOT; k++) {
        const s = list[k] || FAR;
        out[o] = s.px; out[o + 1] = s.pz; out[o + 2] = s.s; out[o + 3] = s.hw;
        o += 4;
      }
    }
    return out;
  }

  return { toF32, table: _roadLutTable };
})();
Object.freeze(WGXRoadLut);
