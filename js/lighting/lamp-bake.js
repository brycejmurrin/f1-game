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
  const MAX_TEXELS = 600000;   // ~4.8 MB at RGBA16F; the cell grows to stay under it
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

  /** Bake a light set. `lights` is the flat stride-15 track set (base colours);
   *  `groundY(x, z)` returns the ground height there or null; `nearClamp` is the
   *  LAMP NEAR CLAMP knob. Returns null for an empty set, otherwise
   *    { w, h, x0, z0, cell, data: Uint16Array(w*h*4) RGBA16F, lamps, ms }
   *  where texel (i, j) covers world x0 + (i + 0.5) * cell, z0 + (j + 0.5) * cell. */
  function bake(lights, groundY, nearClamp) {
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
    const hgt = new Float32Array(w * h).fill(NaN);   // ground height, sampled lazily
    const nc = nearClamp > 0 ? nearClamp : 4.0;
    for (let i = 0; i < n; i++) {
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
          if (py !== py) {   // NaN: not sampled yet
            const g = groundY ? groundY(px, pz) : null;
            py = hgt[k] = (g != null && isFinite(g)) ? g : ly - 8;
          }
          const LX = lx - px, LY = ly - py, LZ = lz - pz;
          const d2 = LX * LX + LY * LY + LZ * LZ;
          if (d2 >= rad2) continue;
          const dist = Math.sqrt(d2);
          const inv = 1 / Math.max(dist, 1e-3);
          const NoL = LY * inv;                    // N = +Y
          if (!(NoL > 0)) continue;
          const dn = dist / rad, dn2 = dn * dn;
          const win = Math.min(1, Math.max(0, 1 - dn2 * dn2));
          const distC = Math.max(dist, nc);
          const att = (win * win) / (distC * distC + 1);
          if (att < 1e-6) continue;
          const cd = -(LX * dx0 + LY * dy0 + LZ * dz0) * inv;
          const beam = smoothstep(cOut, cIn, cd);
          const spotD = bleed + (1 - bleed) * beam;
          const e = att * spotD * NoL;
          const a = k * 3;
          acc[a] += cr * e; acc[a + 1] += cg * e; acc[a + 2] += cb * e;
        }
      }
    }
    const data = new Uint16Array(w * h * 4);
    const one = toHalf(1);
    for (let k = 0, a = 0, b = 0; k < w * h; k++, a += 3, b += 4) {
      data[b] = toHalf(acc[a]); data[b + 1] = toHalf(acc[a + 1]); data[b + 2] = toHalf(acc[a + 2]); data[b + 3] = one;
    }
    const ms = Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - t0);
    return { w, h, x0: mnx, z0: mnz, cell, data, lamps: n, ms };
  }

  // One cached bake per (light-set identity, near clamp). The track light set is
  // rebuilt as a NEW array whenever a rebuild:true lamp knob moves (profiles.js
  // nulls track._lights), so identity is the invalidation — same rule
  // LampChunks and frame-lights _fillAllLights use.
  let _src = null, _clamp = NaN, _bake = null, _gen = 0;
  function forTrack(track, lights, nearClamp) {
    if (!lights || !lights.length) return null;
    if (_src === lights && _clamp === nearClamp && _bake) return _bake;
    const gy = (track && typeof Tracks !== "undefined" && Tracks.terrainY)
      ? (x, z) => Tracks.terrainY(track, x, z) : null;
    _bake = bake(lights, gy, nearClamp);
    _src = lights; _clamp = nearClamp;
    if (_bake) {
      _bake.gen = ++_gen;
      try { Log.info("gfx", "lamp bake " + _bake.lamps + " lamps -> " + _bake.w + "x" + _bake.h + " @" + _bake.cell.toFixed(2) + " m in " + _bake.ms + " ms"); } catch (_) { /* Log absent in a bare VM: the bake still returns */ }
    }
    return _bake;
  }

  return { bake, forTrack, toHalf, MAX_TEXELS };
})();
