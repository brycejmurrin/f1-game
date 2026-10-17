/* Apex 26 — WGXRoadLut: the pure, device-free half of WGX's road LUT (the packed (s, lateral x, half-width) table) and the
   toF32 coercion it shares with the mesh packer. Pure move out of wgx.js (#1662); wgx.js aliases both back, so
   `__roadLutTable` and tools/gfx/road-lut-census.mjs see the same function. */
const WGXRoadLut = (function () {
  "use strict";

  function toF32(a) { return a instanceof Float32Array ? a : new Float32Array(a); }
  // THE PURE HALF OF THE ROAD LUT, deliberately at module scope and free of the
  // device. WGX reconstructs (s, lateral x, half-width) per fragment from world
  // XZ against this table because it cannot read the per-vertex `trk` the way
  // GLX does (a location-3 interpolator shards dashes on Dawn; drawIndexed
  // leaves vertex_index at 0 on that adapter). Every road marking the player
  // sees on WebGPU is computed from what this returns, which makes it worth
  // being able to audit WITHOUT a GPU — tools/gfx/road-lut-census.mjs calls it
  // directly through the static surface. Returns the packed Float32Array, or
  // null when the geometry carries no usable road surface.
  function _roadLutTable(pos, trk, matArr) {
    const posA = toF32(pos), trkA = toF32(trk);
    const vCount = (posA.length / 3) | 0;
    if (!vCount || trkA.length < vCount * 3) {
      return null;   // caller makes the dummy bind group
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
      return null;   // caller makes the dummy bind group
    }
    // ONE SAMPLE PER STATION — this table must be a CENTRELINE, not a band.
    // The |lat| <= 0.85 filter above admits every vertex within 85% of the
    // half-width, so one cross-section can contribute two points metres apart
    // ACROSS the ribbon. trkFromWorld builds the track frame from the two
    // NEAREST samples, so whenever it picked such a pair the "tangent" ran
    // across the road and the whole frame rotated 90 degrees: lateral x began
    // measuring distance along the lap, and the markings were painted down the
    // LENGTH of the road.
    //
    // Measured before this existed (tools/gfx/road-lut-census.mjs): monza had a
    // lateral pair at 31.4% of stations and a rotated frame at 33.9% of ribbon
    // points — on a circuit with no folded geometry whatsoever, which is what
    // ruled out every "the track runs back near itself" explanation. Collapsing
    // to the centre-most vertex per station makes neighbouring samples
    // along-track BY CONSTRUCTION, rather than by a distance test that cannot
    // tell the two apart.
    // ...AT lat 0, not at a vertex: buildRoad has no lat-0 column (the centre
    // line's sit at +-0.30), so "the centre-most vertex" was the -0.30 one and
    // every sample sat 0.30 m off centre — all WGX paint (edge lines, dashes,
    // pit lane), the asphalt test and the bury hole shifted 0.30 m sideways vs
    // GLX. Interpolate the nearest vertex either side to lat 0; a station with
    // one side only keeps its centre-most vertex, as before.
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
    // Decimating STATIONS, not vertices: with one point per station this stride
    // is a true along-track one.
    const step = Math.max(1, Math.ceil(raw.length / MAX_S));
    const samples = [];
    for (let i = 0; i < raw.length; i += step) samples.push(raw[i]);
    const pad = 24;
    minX -= pad; maxX += pad; minZ -= pad; maxZ += pad;
    const extX = Math.max(maxX - minX, 1), extZ = Math.max(maxZ - minZ, 1);
    const GW = 32, GH = 32, SLOT = 16;
    const cells = new Array(GW * GH);
    for (let i = 0; i < cells.length; i++) cells[i] = [];
    // A FULL CELL KEEPS THE NEAREST, NOT THE FIRST TO ARRIVE. This used to
    // `return` once a cell held SLOT entries — and since `raw` is walked in `s`
    // order that kept the EARLIEST 16 by lap distance and silently dropped every
    // later pass over the same ground. A cell could therefore end up holding
    // only a section tens of metres away, and then trkFromWorld's search misses:
    // on a road draw a miss ZEROES trk, so lateral x reads 0 across the whole
    // surface and the marking shader paints its centre line down the length of
    // the road. Measured before this (tools/gfx/road-lut-census.mjs): on baku the
    // chosen nearest sample sat a median 47.6 m from the query point — on a
    // polyline whose samples are 4 m apart.
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
        // Ensure every cell has ≥2 spatially distinct samples so the shader
        // can form a track tangent (a lone sample left best2 at the origin).
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
    // out[3] (h0.w in WGSL) carries the SAMPLE SPACING in metres. The shader
    // needs it to tell an along-track neighbour from a sample on another part
    // of the lap that happens to lie nearby — measured here rather than
    // hardcoded in WGSL, because it moves with MAX_S and with circuit length.
    // Median, not mean: the start/finish wrap contributes one huge gap.
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
