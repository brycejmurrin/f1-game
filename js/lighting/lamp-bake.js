/* Apex 26 — LampBake: every static track lamp's diffuse pool, baked once per
   track into a world-space ground light map.

   WHY. The lit shaders loop a fixed number of lamp slots per fragment (48 on
   desktop, 24 on a phone, 16 on a three.js phone), so each frame the game keeps
   only the lamps nearest the camera (frame-lights.js setFrameLights). On a
   circuit with ~250 lamps the rest are simply not drawn, and the ones ahead of
   the car switch on as they enter the nearest set. PER-CHUNK LAMPS fixes WHICH
   lamps a chunk uses; it does not remove the per-fragment loop or its cap.

   Street lamps and the ground do not move, so their diffuse light on an
   upward-facing surface can be computed once. This bakes it — every lamp, at
   its base colour — into a half-float RGBA texture over the lamps' XZ extent.
   The lit shaders read it with ONE texture fetch for fragments whose normal
   points up (road, kerbs, terrain, run-off) and scale each live lamp's diffuse
   term by (lampShadow - bakeWeight), so a lamp is counted exactly once and the
   one shadow-mapped floodlight keeps its shadow. Specular, the wet-road mirror,
   fog in-scatter and anything facing sideways (walls, cars, buildings) stay on
   the live lamp loop.

   The maths is the shader's diffuse pool verbatim (glsl-lit.js / tsl-lit.js /
   wgsl-chunks.js lampContrib): windowed inverse-square falloff with the LAMP
   NEAR CLAMP, the aimed cone smoothstep(cosOuter, cosInner, cd) mixed from the
   spill floor, and N·L for N = +Y. The per-frame colour transform (LAMP LEVEL,
   temperature, the twilight ramp) is ONE vec3 the renderer multiplies in
   (frame.lampBakeScale); per-lamp flicker and the staggered warm-up are not
   baked — the baked pools follow the shared scale only.

   Record layout (track-lights.js): [0..2] pos, [3..5] rgb, [6] radius,
   [7..9] aim dir, [10] cos inner, [11] cos outer, [12] spill floor, [13] vol,
   [14] glare. */
"use strict";
const LampBake = (function () {
  const MAX_TEXELS = 600000;   // per layer: ~4.8 MB at RGBA16F, x2 layers; the cell grows to stay under it
  const MIN_CELL = 1.0;        // metres per texel at best

  // float32 -> IEEE half, round-to-nearest (enough for irradiance).
  const _f32 = new Float32Array(1), _u32 = new Uint32Array(_f32.buffer);
  function toHalf(v) {
    _f32[0] = v;
    const x = _u32[0];
    const sign = (x >>> 16) & 0x8000;
    let exp = ((x >>> 23) & 0xff) - 127 + 15;
    let mant = x & 0x7fffff;
    if (exp <= 0) return sign;                       // underflow -> 0 (irradiance is >= 0)
    if (exp >= 31) return sign | 0x7bff;             // clamp to max finite half
    mant += 0x1000;                                  // round
    if (mant & 0x800000) { mant = 0; exp++; if (exp >= 31) return sign | 0x7bff; }
    return sign | (exp << 10) | (mant >>> 13);
  }

  function smoothstep(e0, e1, x) {
    const d = e1 - e0;
    const t = d !== 0 ? Math.min(1, Math.max(0, (x - e0) / d)) : (x >= e1 ? 1 : 0);
    return t * t * (3 - 2 * t);
  }

  const NO_GROUND = -60000;     // alpha sentinel: no surface known -> shaders skip the bake
  // Metres splatted past the road half-width: buildRoad's outer verge column sits
  // at hw + 2.2, and the shader's bilinear tap reaches one more cell, so the splat
  // covers hw + ROAD_EDGE + cell (a narrower one blended the NO_GROUND sentinel
  // into the verge and dropped the bake there).
  const ROAD_EDGE = 2.2;

  // Splat the ROAD surface height (centreline + banking lift) into `hgt`. The
  // terrain heightfield is not the road: on an elevated or banked stretch it
  // sits metres off, and a pool baked at the wrong height is the wrong size and
  // brightness. Where two road stretches share a texel (bridge / crossover) the
  // upper deck wins; the shaders' height fade hands the lower one to the live loop.
  function splatRoad(road, x0, z0, cell, w, h, hgt) {
    const n = road.n | 0;
    if (!n || !road.px || !road.hw) return;
    const L = road.total > 0 ? road.total : n;
    const step = Math.max(0.5, cell * 0.5);
    for (let k = 0; k < n; k++) {
      const j = (k + 1) % n;
      const ax = road.px[k], az = road.pz[k], bx = road.px[j], bz = road.pz[j];
      const seg = Math.hypot(bx - ax, bz - az);
      if (seg > 60) continue;                        // open (non-loop) end or a teleport seam
      const ns = Math.max(1, Math.ceil(seg / step));
      for (let q = 0; q < ns; q++) {
        const f = q / ns;
        const cx = ax + (bx - ax) * f, cz = az + (bz - az) * f;
        const cy = road.py[k] + (road.py[j] - road.py[k]) * f;
        const rx = road.rx[k] + (road.rx[j] - road.rx[k]) * f, rz = road.rz[k] + (road.rz[j] - road.rz[k]) * f;
        const rl = Math.hypot(rx, rz) || 1;
        const hw = road.hw[k] + (road.hw[j] - road.hw[k]) * f + ROAD_EDGE + cell;
        const s = (k + f) / n * L;
        const nl = Math.max(1, Math.ceil(2 * hw / step));
        for (let li = 0; li <= nl; li++) {           // both edges exactly: symmetric
          const lat = -hw + 2 * hw * li / nl;
          const px = cx + rx / rl * lat, pz = cz + rz / rl * lat;
          const ii = Math.floor((px - x0) / cell), jj = Math.floor((pz - z0) / cell);
          if (ii < 0 || jj < 0 || ii >= w || jj >= h) continue;
          const dy = road.lift ? road.lift(s, lat) : 0;
          const y = cy + (dy || 0);
          const kk = jj * w + ii;
          if (!(hgt[kk] >= y)) hgt[kk] = y;          // NaN or lower -> take this one
        }
      }
    }
  }

  /** Bake a light set. `lights` is the flat stride-15 track set (base colours);
   *  `groundY(x, z)` returns the ground height there or null; `nearClamp` is the
   *  LAMP NEAR CLAMP knob; optional `road` ({n,total,px,py,pz,rx,rz,hw,lift(s,lat)})
   *  supplies the road surface, which wins over `groundY`. A texel with no known
   *  surface gets no light and the NO_GROUND alpha. Returns null for an empty
   *  set, otherwise
   *    { w, h, x0, z0, cell, data: Uint16Array(w*2h*4) RGBA16F, lamps, ms }
   *  data is two w x h layers stacked: rows [0, h) the diffuse pool, rows [h, 2h)
   *  the bounce fill per unit BOUNCE; alpha = surface Y in both.
   *  where texel (i, j) covers world x0 + (i + 0.5) * cell, z0 + (j + 0.5) * cell. */
  function bake(lights, groundY, nearClamp, road) {
    const it = bakeSteps(lights, groundY, nearClamp, road);
    let r = it.next();
    while (!r.done) r = it.next();
    return r.value;
  }
  // The bake as resumable steps (one lamp, or one encode stripe, per yield) so
  // forTrack can spread a mid-race rebake over frames instead of freezing one.
  function* bakeSteps(lights, groundY, nearClamp, road) {
    const n = lights ? (lights.length / 15) | 0 : 0;
    if (!n) return null;
    const t0 = (typeof performance !== "undefined" ? performance.now() : Date.now());
    let mnx = Infinity, mnz = Infinity, mxx = -Infinity, mxz = -Infinity;
    for (let i = 0; i < n; i++) {
      const o = i * 15, r = lights[o + 6];
      if (!(r > 0)) continue;
      mnx = Math.min(mnx, lights[o] - r); mxx = Math.max(mxx, lights[o] + r);
      mnz = Math.min(mnz, lights[o + 2] - r); mxz = Math.max(mxz, lights[o + 2] + r);
    }
    if (!(mxx > mnx) || !(mxz > mnz)) return null;
    const area = (mxx - mnx) * (mxz - mnz);
    const cell = Math.max(MIN_CELL, Math.sqrt(area / MAX_TEXELS));
    const w = Math.max(1, Math.ceil((mxx - mnx) / cell)), h = Math.max(1, Math.ceil((mxz - mnz) / cell));
    const acc = new Float32Array(w * h * 3);
    const accB = new Float32Array(w * h * 3);        // LAMP BOUNCE: att * (0.55 + 0.45 N.L), no cone
    const hgt = new Float32Array(w * h).fill(NaN);   // surface height: road splat, then terrain lazily
    if (road) splatRoad(road, mnx, mnz, cell, w, h, hgt);
    const tried = new Uint8Array(w * h);             // terrain already queried for this texel
    const nc = nearClamp > 0 ? nearClamp : 4.0;
    yield;
    for (let i = 0; i < n; i++) {
      if (i) yield;
      const o = i * 15;
      const lx = lights[o], ly = lights[o + 1], lz = lights[o + 2];
      const cr = lights[o + 3], cg = lights[o + 4], cb = lights[o + 5];
      const rad = lights[o + 6];
      if (!(rad > 0) || !(cr + cg + cb > 0)) continue;
      const dx0 = lights[o + 7], dy0 = lights[o + 8], dz0 = lights[o + 9];
      const cIn = lights[o + 10], cOut = lights[o + 11], bleed = lights[o + 12];
      const i0 = Math.max(0, Math.floor((lx - rad - mnx) / cell)), i1 = Math.min(w - 1, Math.floor((lx + rad - mnx) / cell));
      const j0 = Math.max(0, Math.floor((lz - rad - mnz) / cell)), j1 = Math.min(h - 1, Math.floor((lz + rad - mnz) / cell));
      const rad2 = rad * rad;
      for (let j = j0; j <= j1; j++) {
        const pz = mnz + (j + 0.5) * cell;
        for (let ii = i0; ii <= i1; ii++) {
          const px = mnx + (ii + 0.5) * cell;
          const k = j * w + ii;
          let py = hgt[k];
          if (py !== py && !tried[k]) {   // NaN: no road here, ask the terrain once
            tried[k] = 1;
            const g = groundY ? groundY(px, pz) : null;
            if (g != null && isFinite(g)) py = hgt[k] = g;
          }
          if (py !== py) continue;        // no surface known: leave it to the live loop
          const LX = lx - px, LY = ly - py, LZ = lz - pz;
          const d2 = LX * LX + LY * LY + LZ * LZ;
          if (d2 >= rad2) continue;
          const dist = Math.sqrt(d2);
          const inv = 1 / Math.max(dist, 1e-3);
          const NoL = LY * inv;                    // N = +Y
          const dn = dist / rad, dn2 = dn * dn;
          const win = Math.min(1, Math.max(0, 1 - dn2 * dn2));
          const distC = Math.max(dist, nc);
          const att = (win * win) / (distC * distC + 1);
          if (att < 1e-6) continue;
          // Bounce fill lights every normal (soft N.L floor, no cone): the
          // shaders' bounce term per unit BOUNCE, which they scale by uBounceK.
          const eb = att * (0.55 + 0.45 * Math.max(0, NoL)), ab = k * 3;
          accB[ab] += cr * eb; accB[ab + 1] += cg * eb; accB[ab + 2] += cb * eb;
          if (!(NoL > 0)) continue;
          const cd = -(LX * dx0 + LY * dy0 + LZ * dz0) * inv;
          const beam = smoothstep(cOut, cIn, cd);
          const spotD = bleed + (1 - bleed) * beam;
          const e = att * spotD * NoL;
          const a = k * 3;
          acc[a] += cr * e; acc[a + 1] += cg * e; acc[a + 2] += cb * e;
        }
      }
    }
    // Two layers stacked in one texture (w x 2h): rows [0, h) the diffuse pool,
    // rows [h, 2h) the bounce fill; both carry the surface height in alpha.
    const data = new Uint16Array(w * h * 8);
    const none = toHalf(NO_GROUND), B = w * h * 4;
    for (let k = 0, a = 0, b = 0; k < w * h; k++, a += 3, b += 4) {
      if ((k & 32767) === 32767) yield;
      const y = hgt[k] === hgt[k] ? toHalf(hgt[k]) : none;
      data[b] = toHalf(acc[a]); data[b + 1] = toHalf(acc[a + 1]); data[b + 2] = toHalf(acc[a + 2]); data[b + 3] = y;
      data[B + b] = toHalf(accB[a]); data[B + b + 1] = toHalf(accB[a + 1]); data[B + b + 2] = toHalf(accB[a + 2]); data[B + b + 3] = y;
    }
    const ms = Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - t0);
    return { w, h, x0: mnx, z0: mnz, cell, data, lamps: n, ms };
  }

  // One cached bake per (light-set identity, near clamp). The track light set is
  // rebuilt as a NEW array whenever a rebuild:true lamp knob moves (profiles.js
  // nulls track._lights), so identity is the invalidation — same rule
  // LampChunks and frame-lights _fillAllLights use. A LAMP NEAR CLAMP change on
  // the same set is debounced: dragging the slider would otherwise rebake every
  // frame; the previous bake keeps drawing until the value holds still.
  const CLAMP_SETTLE_MS = 300;
  let _src = null, _clamp = NaN, _bake = null, _gen = 0, _pend = NaN, _pendT = 0;
  let _trk = null, _pendSrc = null;
  function roadOf(track) {
    if (!track || !track.px || !track.hw || !(track.n > 0)) return null;
    const bank = typeof Tracks !== "undefined" && Tracks.banking, o = {};
    return {
      n: track.n, total: track.total, px: track.px, py: track.py, pz: track.pz,
      rx: track.rx, rz: track.rz, hw: track.hw,
      lift: bank ? (s, lat) => { const b = bank(track, s, lat, o); return b ? b.dy : 0; } : null,
    };
  }
  // A REBAKE while a bake is already drawing (weather change mid-race, a lamp
  // knob) runs as a background job: SLICE_MS of steps per frame, the old bake
  // keeps drawing, and the new one swaps in whole. The first bake of a track
  // (race start, pre-baked by atmosphere.js) runs synchronously.
  const SLICE_MS = 3;
  let _job = null, _jobSrc = null, _jobClamp = NaN, _jobTrk = null;
  function _now() { return typeof performance !== "undefined" ? performance.now() : Date.now(); }
  function _install(b, track, lights, nearClamp) {
    _bake = b; _src = lights; _clamp = nearClamp; _trk = track; _pend = NaN; _pendSrc = null;
    _shK = -1;
    if (_bake) {
      _bake.gen = ++_gen;
      try { Log.info("gfx", "lamp bake " + _bake.lamps + " lamps -> " + _bake.w + "x" + _bake.h + " @" + _bake.cell.toFixed(2) + " m in " + _bake.ms + " ms"); } catch (_) { /* Log absent in a bare VM: the bake still returns */ }
    }
  }
  function _groundFn(track) {
    return (track && typeof Tracks !== "undefined" && Tracks.terrainY)
      ? (x, z) => Tracks.terrainY(track, x, z) : null;
  }
  function forTrack(track, lights, nearClamp, now, sync) {
    if (!lights || !lights.length) return null;
    const cur = _src === lights && _clamp === nearClamp;
    if (cur) { _job = null; return _bake; }
    // Same track, bake in hand: a new light set (a rebuild:true lamp knob) or a
    // new clamp keeps the old bake until the input has held still, then rebakes
    // in slices — a whole bake is 0.3-2 s of main thread.
    if (_trk === track && _bake && !sync) {
      const t = now != null ? now : _now();
      if (_pendSrc !== lights || _pend !== nearClamp) { _pendSrc = lights; _pend = nearClamp; _pendT = t; _job = null; return _bake; }
      if (t - _pendT < CLAMP_SETTLE_MS) return _bake;
      if (!_job || _jobSrc !== lights || _jobClamp !== nearClamp || _jobTrk !== track) {
        _job = bakeSteps(lights, _groundFn(track), nearClamp, roadOf(track));
        _jobSrc = lights; _jobClamp = nearClamp; _jobTrk = track;
      }
      const end = _now() + SLICE_MS;
      let r;
      do { r = _job.next(); } while (!r.done && _now() < end);
      if (!r.done) return _bake;
      _job = null;
      _install(r.value, track, lights, nearClamp);
      return _bake;
    }
    _job = null;
    _install(bake(lights, _groundFn(track), nearClamp, roadOf(track)), track, lights, nearClamp);
    return _bake;
  }

  // The shadow-mapped lamp's BAKED colour. On a baked fragment the live loop
  // carves that lamp's shadow out of the pool by subtracting its diffuse; the
  // pool holds the steady base colour x lampBakeScale, so the carve must use the
  // same colour — the live slot's colour carries flicker, warm-up tint and the
  // cull fade, which left a pulsing, bluish residue inside the shadow. Found by
  // position in the source set (fixtures are static and copied verbatim).
  let _shK = -1, _shX = NaN, _shY = NaN, _shZ = NaN;
  function shadowCol(frame, slot, out) {
    out[0] = out[1] = out[2] = 0;
    const L = frame && frame.lights, src = _src, sc = frame && frame.lampBakeScale;
    if (!L || !src || !sc || !(slot >= 0) || slot * 15 + 5 >= L.length) return out;
    const o = slot * 15, x = L[o], y = L[o + 1], z = L[o + 2];
    if (!(_shK >= 0 && x === _shX && y === _shY && z === _shZ && src[_shK] === x)) {
      _shK = -1;
      for (let i = 0; i + 2 < src.length; i += 15) {
        if (src[i] === x && src[i + 1] === y && src[i + 2] === z) { _shK = i; break; }
      }
      _shX = x; _shY = y; _shZ = z;
    }
    if (_shK < 0) return out;
    out[0] = src[_shK + 3] * sc[0]; out[1] = src[_shK + 4] * sc[1]; out[2] = src[_shK + 5] * sc[2];
    return out;
  }

  return { bake, forTrack, shadowCol, toHalf, MAX_TEXELS, NO_GROUND };
})();
Object.freeze(LampBake);
