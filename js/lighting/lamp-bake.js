"use strict";
const LampBake = (function () {
  const MAX_TEXELS = 300000;
  const DESKTOP_TEXELS = 600000;
  function budget(gfx) { return gfx && (gfx.mobileTier || gfx.isMobile) ? MAX_TEXELS : DESKTOP_TEXELS; }
  const MIN_CELL = 1.0;
  const TILE = 16, SLOT = TILE + 2;
  const SLOT_COLS = Math.floor(4096 / SLOT), SLOT_ROWS = Math.floor(4096 / (2 * SLOT));

  const _f32 = new Float32Array(1), _u32 = new Uint32Array(_f32.buffer);
  function toHalf(v) {
    _f32[0] = v;
    const x = _u32[0];
    const sign = (x >>> 16) & 0x8000;
    let exp = ((x >>> 23) & 0xff) - 127 + 15;
    let mant = x & 0x7fffff;
    if (exp <= 0) return sign;
    if (exp >= 31) return sign | 0x7bff;
    mant += 0x1000;
    if (mant & 0x800000) { mant = 0; exp++; if (exp >= 31) return sign | 0x7bff; }
    return sign | (exp << 10) | (mant >>> 13);
  }

  function smoothstep(e0, e1, x) {
    const d = e1 - e0;
    const t = d !== 0 ? Math.min(1, Math.max(0, (x - e0) / d)) : (x >= e1 ? 1 : 0);
    return t * t * (3 - 2 * t);
  }

  const LO_HEIGHT = 3.0;
  const LO_COS = 0.9;
  const NO_GROUND = -60000;
  const ROAD_EDGE = 2.2;

  function* splatRoad(road, x0, z0, cell, put) {
    const n = road.n | 0;
    if (!n || !road.px || !road.hw) return;
    const L = road.total > 0 ? road.total : n;
    const step = Math.max(0.5, cell * 0.5);
    for (let k = 0; k < n; k++) {
      const j = (k + 1) % n;
      const ax = road.px[k], az = road.pz[k], bx = road.px[j], bz = road.pz[j];
      const seg = Math.hypot(bx - ax, bz - az);
      if ((k & 7) === 7) yield;
      if (seg > 60) continue;
      const hwMax = Math.max(road.hw[k], road.hw[j]) + ROAD_EDGE + cell;
      const r0 = Math.hypot(road.rx[k], road.rz[k]) || 1, r1 = Math.hypot(road.rx[j], road.rz[j]) || 1;
      const turn = Math.hypot(road.rx[j] / r1 - road.rx[k] / r0, road.rz[j] / r1 - road.rz[k] / r0);
      const ns = Math.max(1, Math.ceil((seg + turn * hwMax) / step));
      for (let q = 0; q < ns; q++) {
        const f = q / ns;
        const cx = ax + (bx - ax) * f, cz = az + (bz - az) * f;
        const cy = road.py[k] + (road.py[j] - road.py[k]) * f;
        const rx = road.rx[k] + (road.rx[j] - road.rx[k]) * f, rz = road.rz[k] + (road.rz[j] - road.rz[k]) * f;
        const rl = Math.hypot(rx, rz) || 1;
        const hw = road.hw[k] + (road.hw[j] - road.hw[k]) * f + ROAD_EDGE + cell;
        const s = (k + f) / n * L;
        const nl = Math.max(1, Math.ceil(2 * hw / step));
        for (let li = 0; li <= nl; li++) {
          const lat = -hw + 2 * hw * li / nl;
          const px = cx + rx / rl * lat, pz = cz + rz / rl * lat;
          const dy = road.lift ? road.lift(s, lat) : 0;
          put(Math.floor((px - x0) / cell), Math.floor((pz - z0) / cell), cy + (dy || 0));
        }
      }
    }
  }

  function tileMask(lights, n, mnx, mnz, cell, tilesX, tilesY, mask) {
    const ts = TILE * cell;
    let cnt = 0;
    mask.fill(0);
    for (let i = 0; i < n; i++) {
      const o = i * 15, rad = lights[o + 6];
      if (!(rad > 0) || !(lights[o + 3] + lights[o + 4] + lights[o + 5] > 0)) continue;
      const lx = lights[o] - mnx, lz = lights[o + 2] - mnz, rad2 = rad * rad;
      const tx0 = Math.max(0, Math.floor((lx - rad) / ts)), tx1 = Math.min(tilesX - 1, Math.floor((lx + rad) / ts));
      const tz0 = Math.max(0, Math.floor((lz - rad) / ts)), tz1 = Math.min(tilesY - 1, Math.floor((lz + rad) / ts));
      for (let tz = tz0; tz <= tz1; tz++) {
        const dz = Math.max(0, tz * ts - lz, lz - (tz + 1) * ts);
        for (let tx = tx0; tx <= tx1; tx++) {
          const k = tz * tilesX + tx;
          if (mask[k]) continue;
          const dx = Math.max(0, tx * ts - lx, lx - (tx + 1) * ts);
          if (dx * dx + dz * dz < rad2) { mask[k] = 1; cnt++; }
        }
      }
    }
    return cnt;
  }

  function atlasGrid(nt) {
    let best = null;
    for (let cols = 1; cols <= SLOT_COLS; cols++) {
      const rows = Math.max(1, Math.ceil(nt / cols));
      if (rows > SLOT_ROWS) continue;
      const area = cols * rows, side = Math.max(cols, 2 * rows);
      if (!best || side < best.side || (side === best.side && area < best.area)) best = { cols, rows, area, side };
    }
    return best;
  }

  function copies(g, nTiles, out) {
    const t = Math.floor(g / TILE), a = g - t * TILE + 1;
    let m = 0;
    if (t >= 0 && t < nTiles) { out[m++] = t; out[m++] = a; }
    if (a === 1 && t >= 1 && t - 1 < nTiles) { out[m++] = t - 1; out[m++] = TILE + 1; }
    if (a === TILE && t + 1 >= 0 && t + 1 < nTiles) { out[m++] = t + 1; out[m++] = 0; }
    return m;
  }

  function bake(lights, groundY, nearClamp, road, maxTexels) {
    const it = bakeSteps(lights, groundY, nearClamp, road, maxTexels);
    let r = it.next();
    while (!r.done) r = it.next();
    return r.value;
  }
  function* bakeSteps(lights, groundY, nearClamp, road, maxTexels) {
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
    const SS = SLOT * SLOT;
    const budget = Math.min(maxTexels > 0 ? maxTexels : MAX_TEXELS, SLOT_COLS * SLOT_ROWS * SS);
    let cell = MIN_CELL, tilesX, tilesY, mask, nt, grid;
    for (;;) {
      tilesX = Math.max(1, Math.ceil((mxx - mnx) / (TILE * cell)));
      tilesY = Math.max(1, Math.ceil((mxz - mnz) / (TILE * cell)));
      mask = new Uint8Array(tilesX * tilesY);
      nt = tileMask(lights, n, mnx, mnz, cell, tilesX, tilesY, mask);
      grid = atlasGrid(Math.max(1, nt));
      if ((grid && grid.area * SS <= budget) || nt <= 1) break;
      cell *= 1.02;
      yield;
    }
    const w = tilesX * TILE, h = tilesY * TILE;
    const cols = grid.cols, atlasW = cols * SLOT, atlasH = grid.rows * SLOT;
    const slotOf = new Int32Array(tilesX * tilesY).fill(-1);
    for (let k = 0, s = 0; k < mask.length; k++) if (mask[k]) slotOf[k] = s++;
    const N = Math.max(1, nt) * SS;
    const acc = new Float32Array(N * 3);
    const accB = new Float32Array(N * 3);
    const hgt = new Float32Array(N).fill(NaN);
    const cx = [0, 0, 0, 0], cz = [0, 0, 0, 0];
    if (road) yield* splatRoad(road, mnx, mnz, cell, (i, j, y) => {
      if (i < -1 || j < -1 || i > w || j > h) return;
      const mx = copies(i, tilesX, cx), mz = copies(j, tilesY, cz);
      for (let q = 0; q < mz; q += 2) {
        for (let p = 0; p < mx; p += 2) {
          const s = slotOf[cz[q] * tilesX + cx[p]];
          if (s < 0) continue;
          const kk = s * SS + cz[q + 1] * SLOT + cx[p + 1];
          if (!(hgt[kk] >= y)) hgt[kk] = y;
        }
      }
    });
    const tried = new Uint8Array(N);
    const nc = nearClamp > 0 ? nearClamp : 4.0;
    const liveOnly = new Uint8Array(n), loPos = [];
    for (let i = 0; i < n; i++) {
      if ((i & 31) === 31) yield;
      const o = i * 15, lx = lights[o], lz = lights[o + 2];
      let lo = lights[o + 11] > LO_COS;
      const ii = Math.floor((lx - mnx) / cell), jj = Math.floor((lz - mnz) / cell);
      const s = ii >= 0 && jj >= 0 && ii < w && jj < h ? slotOf[Math.floor(jj / TILE) * tilesX + Math.floor(ii / TILE)] : -1;
      if (!lo && s >= 0) {
        const k = s * SS + (jj % TILE + 1) * SLOT + (ii % TILE + 1);
        if (hgt[k] !== hgt[k] && !tried[k]) {
          tried[k] = 1;
          const g = groundY ? groundY(mnx + (ii + 0.5) * cell, mnz + (jj + 0.5) * cell) : null;
          if (g != null && isFinite(g)) hgt[k] = g;
        }
        lo = lights[o + 1] - hgt[k] < LO_HEIGHT;
      }
      if (lo) { liveOnly[i] = 1; loPos.push(lx, lights[o + 1], lz); }
    }
    yield;
    for (let i = 0; i < n; i++) {
      if (i) yield;
      if (liveOnly[i]) continue;
      const o = i * 15;
      const lx = lights[o], ly = lights[o + 1], lz = lights[o + 2];
      const cr = lights[o + 3], cg = lights[o + 4], cb = lights[o + 5];
      const rad = lights[o + 6];
      if (!(rad > 0) || !(cr + cg + cb > 0)) continue;
      const dx0 = lights[o + 7], dy0 = lights[o + 8], dz0 = lights[o + 9];
      const cIn = lights[o + 10], cOut = lights[o + 11], bleed = lights[o + 12];
      const i0 = Math.max(-1, Math.floor((lx - rad - mnx) / cell)), i1 = Math.min(w, Math.floor((lx + rad - mnx) / cell));
      const j0 = Math.max(-1, Math.floor((lz - rad - mnz) / cell)), j1 = Math.min(h, Math.floor((lz + rad - mnz) / cell));
      const tx0 = Math.max(0, Math.ceil((i0 - TILE) / TILE)), tx1 = Math.min(tilesX - 1, Math.floor((i1 + 1) / TILE));
      const tz0 = Math.max(0, Math.ceil((j0 - TILE) / TILE)), tz1 = Math.min(tilesY - 1, Math.floor((j1 + 1) / TILE));
      const rad2 = rad * rad;
      for (let tz = tz0; tz <= tz1; tz++) {
        for (let tx = tx0; tx <= tx1; tx++) {
          const s = slotOf[tz * tilesX + tx];
          if (s < 0) continue;
          if (tx !== tx0 || tz !== tz0) yield;
          const a0 = Math.max(0, i0 - tx * TILE + 1), a1 = Math.min(SLOT - 1, i1 - tx * TILE + 1);
          const b0 = Math.max(0, j0 - tz * TILE + 1), b1 = Math.min(SLOT - 1, j1 - tz * TILE + 1);
          for (let bb = b0; bb <= b1; bb++) {
            const pz = mnz + (tz * TILE + bb - 0.5) * cell;
            for (let aa = a0; aa <= a1; aa++) {
              const px = mnx + (tx * TILE + aa - 0.5) * cell;
              const k = s * SS + bb * SLOT + aa;
              let py = hgt[k];
              if (py !== py && !tried[k]) {
                tried[k] = 1;
                const g = groundY ? groundY(px, pz) : null;
                if (g != null && isFinite(g)) py = hgt[k] = g;
              }
              if (py !== py) continue;
              const LX = lx - px, LY = ly - py, LZ = lz - pz;
              const d2 = LX * LX + LY * LY + LZ * LZ;
              if (d2 >= rad2) continue;
              const dist = Math.sqrt(d2);
              const inv = 1 / Math.max(dist, 1e-3);
              const NoL = LY * inv;
              const dn = dist / rad, dn2 = dn * dn;
              const win = Math.min(1, Math.max(0, 1 - dn2 * dn2));
              const distC = Math.max(dist, nc);
              const att = (win * win) / (distC * distC + 1);
              if (att < 1e-6) continue;
              const eb = att * (0.55 + 0.45 * Math.max(0, NoL)), ab = k * 3;
              accB[ab] += cr * eb; accB[ab + 1] += cg * eb; accB[ab + 2] += cb * eb;
              if (!(NoL > 0)) continue;
              const cd = -(LX * dx0 + LY * dy0 + LZ * dz0) * inv;
              const beam = smoothstep(cOut, cIn, cd);
              const spotD = bleed + (1 - bleed) * beam;
              const e = att * spotD * NoL;
              acc[ab] += cr * e; acc[ab + 1] += cg * e; acc[ab + 2] += cb * e;
            }
          }
        }
      }
    }
    const data = new Uint16Array(atlasW * atlasH * 8);
    const indir = new Uint16Array(tilesX * tilesY * 4);
    const none = toHalf(NO_GROUND), neg = toHalf(-1), B = atlasW * atlasH * 4;
    for (let t = 0; t < slotOf.length; t++) {
      const s = slotOf[t];
      if (s < 0) { indir[t * 4] = indir[t * 4 + 1] = neg; continue; }
      const ax = (s % cols) * SLOT, ay = Math.floor(s / cols) * SLOT;
      indir[t * 4] = toHalf(ax); indir[t * 4 + 1] = toHalf(ay);
      for (let bb = 0; bb < SLOT; bb++) {
        let d = ((ay + bb) * atlasW + ax) * 4, k = s * SS + bb * SLOT;
        for (let aa = 0; aa < SLOT; aa++, k++, d += 4) {
          const a = k * 3, y = hgt[k] === hgt[k] ? toHalf(hgt[k]) : none;
          data[d] = toHalf(acc[a]); data[d + 1] = toHalf(acc[a + 1]); data[d + 2] = toHalf(acc[a + 2]); data[d + 3] = y;
          data[B + d] = toHalf(accB[a]); data[B + d + 1] = toHalf(accB[a + 1]); data[B + d + 2] = toHalf(accB[a + 2]); data[B + d + 3] = y;
        }
      }
      if ((s & 31) === 31) yield;
    }
    const ms = Math.round((typeof performance !== "undefined" ? performance.now() : Date.now()) - t0);
    return { x0: mnx, z0: mnz, cell, T: TILE, tilesX, tilesY, w, h, tiles: nt, atlasW, atlasH,
      data, indir, lamps: n, ms, liveOnly, loPos };
  }

  const CLAMP_SETTLE_MS = 300;
  let _src = null, _clamp = NaN, _bake = null, _gen = 0, _pend = NaN, _pendT = 0;
  let _trk = null, _pendSrc = null, _budget = 0, _pendBudget = 0;
  function roadOf(track) {
    if (!track || !track.px || !track.hw || !(track.n > 0)) return null;
    const bank = typeof Tracks !== "undefined" && Tracks.banking, o = {};
    return {
      n: track.n, total: track.total, px: track.px, py: track.py, pz: track.pz,
      rx: track.rx, rz: track.rz, hw: track.hw,
      lift: bank ? (s, lat) => { const b = bank(track, s, lat, o); return b ? b.dy : 0; } : null,
    };
  }
  const SLICE_MS = 3;
  let _job = null, _jobSrc = null, _jobClamp = NaN, _jobTrk = null, _jobBudget = 0;
  function _now() { return typeof performance !== "undefined" ? performance.now() : Date.now(); }
  function _install(b, track, lights, nearClamp, budget) {
    _bake = b; _src = lights; _clamp = nearClamp; _trk = track; _budget = budget; _pend = NaN; _pendSrc = null;
    _shK = -1;
    if (_bake) {
      _bake.gen = ++_gen;
      try { Log.info("gfx", "lamp bake " + _bake.lamps + " lamps -> " + _bake.tiles + " tiles, atlas " + _bake.atlasW + "x" + (2 * _bake.atlasH) + " @" + _bake.cell.toFixed(2) + " m in " + _bake.ms + " ms"); } catch (_) {  }
    }
  }
  function _groundFn(track) {
    return (track && typeof Tracks !== "undefined" && Tracks.terrainY)
      ? (x, z) => Tracks.terrainY(track, x, z) : null;
  }
  function reset() {
    _pre = null; _job = null; _jobSrc = null; _jobTrk = null; _src = null; _bake = null; _trk = null;
    _pendSrc = null; _pend = NaN; _clamp = NaN; _budget = 0; _shK = -1;
  }
  function forTrack(track, lights, nearClamp, now, sync, maxTexels) {
    if (!lights || !lights.length) return null;
    const budget = maxTexels > 0 ? maxTexels : MAX_TEXELS;
    const cur = _src === lights && _clamp === nearClamp && _budget === budget;
    if (cur) { _job = null; return _bake; }
    if (!(_trk === track && _bake) && sync !== true && (sync === false || (_job && _jobTrk === track))) {
      if (!_job || _jobSrc !== lights || _jobClamp !== nearClamp || _jobTrk !== track || _jobBudget !== budget) {
        _job = bakeSteps(lights, _groundFn(track), nearClamp, roadOf(track), budget);
        _jobSrc = lights; _jobClamp = nearClamp; _jobTrk = track; _jobBudget = budget;
      }
      const end = _now() + SLICE_MS;
      let r;
      do { r = _job.next(); } while (!r.done && _now() < end);
      if (!r.done) return null;
      _job = null;
      _pre = null;
      _install(r.value, track, lights, nearClamp, budget);
      return _bake;
    }
    if (_trk === track && _bake && !sync) {
      const t = now != null ? now : _now();
      if (_pendSrc !== lights || _pend !== nearClamp || _pendBudget !== budget) { _pendSrc = lights; _pend = nearClamp; _pendBudget = budget; _pendT = t; _job = null; return _bake; }
      if (t - _pendT < CLAMP_SETTLE_MS) return _bake;
      if (!_job || _jobSrc !== lights || _jobClamp !== nearClamp || _jobTrk !== track || _jobBudget !== budget) {
        _job = bakeSteps(lights, _groundFn(track), nearClamp, roadOf(track), budget);
        _jobSrc = lights; _jobClamp = nearClamp; _jobTrk = track; _jobBudget = budget;
      }
      const end = _now() + SLICE_MS;
      let r;
      do { r = _job.next(); } while (!r.done && _now() < end);
      if (!r.done) return _bake;
      _job = null;
      _pre = null;
      _install(r.value, track, lights, nearClamp, budget);
      return _bake;
    }
    _job = null;
    let it = _preMatch(track, lights, nearClamp, budget) ? _pre.it : null, r;
    _pre = null;
    if (it) { do r = it.next(); while (!r.done); }
    _install(it ? r.value : bake(lights, _groundFn(track), nearClamp, roadOf(track), budget), track, lights, nearClamp, budget);
    return _bake;
  }

  let _pre = null;
  function _preMatch(track, lights, nearClamp, budget) {
    return !!_pre && _pre.track === track && _pre.lights === lights && _pre.clamp === nearClamp && _pre.budget === budget;
  }
  function prebake(track, lights, nearClamp, maxTexels) {
    if (!lights || !lights.length) return null;
    const budget = maxTexels > 0 ? maxTexels : MAX_TEXELS;
    if (_src === lights && _clamp === nearClamp && _budget === budget) return () => true;
    if (!_preMatch(track, lights, nearClamp, budget))
      _pre = { it: bakeSteps(lights, _groundFn(track), nearClamp, roadOf(track), budget), track, lights, clamp: nearClamp, budget };
    const job = _pre;
    return function step(ms) {
      if (_pre !== job) return true;
      const end = _now() + (ms > 0 ? ms : SLICE_MS);
      let r;
      do { r = job.it.next(); } while (!r.done && _now() < end);
      if (!r.done) return false;
      _pre = null;
      _install(r.value, track, lights, nearClamp, budget);
      return true;
    };
  }

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

  function liveOnlyAt(L, o) {
    const p = _bake && _bake.loPos;
    if (!p || !p.length || !L) return 0;
    const x = L[o];
    for (let i = 0; i < p.length; i += 3) {
      if (p[i] === x && p[i + 1] === L[o + 1] && p[i + 2] === L[o + 2]) return 1;
    }
    return 0;
  }

  function gen() { return _bake ? _bake.gen | 0 : 0; }

  return { bake, forTrack, prebake, reset, shadowCol, liveOnlyAt, gen, budget, toHalf, MAX_TEXELS, DESKTOP_TEXELS, TILE };
})();
Object.freeze(LampBake);
