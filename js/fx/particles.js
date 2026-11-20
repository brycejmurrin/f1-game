const Particles = (function () {
  "use strict";

  let _gfx = null;
  let MAX = 0;

  let _px, _py, _pz;
  let _vx, _vy, _vz;
  let _age, _life;
  let _sz, _grw;
  let _cr, _cg, _cb;
  let _a0;
  let _drg, _grv;
  let _add;
  let _n = 0;
  let _mobile = false;

  const LAMP_RESERVE = 24;
  let FLARE_MAX = 0, _flN = 0;
  let _fl = null;

  const FLOATS_PER = 6 * 10;
  let _vertA = null;
  let _vertB = null;
  const _CORNERS = [-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1];
  let _flareDirty = false, _lastRainLive = false;
  let _dirty = true, _lastPa = 0, _lastPb = 0;
  let _rainAcc = 0;
  let _rainCellX = 0x7fffffff, _rainCellY = 0x7fffffff, _rainCellZ = 0x7fffffff;
  let _kTone = -1, _kShown = -1, _kSpdQ = -1, _kSpdS = NaN, _kLenS = NaN;
  let _kWind = NaN, _kRainSpd = NaN, _kOp = NaN, _kShW = NaN, _kShL = NaN, _kDir = NaN;
  const RAIN_CELL_M = 2;
  let _statUpload = 0, _statExpand = 0, _statSkip = 0, _statAlphaExpand = 0, _statAddExpand = 0;
  let _prime = false;

  function init(gfx) {
    Log.info("game", "Particles.init");
    _gfx = gfx;
    _mobile = !!(gfx && gfx.mobileTier);
    MAX = _mobile ? 96 : 256;
    FLARE_MAX = (_mobile ? 24 : 48) + LAMP_RESERVE;
    _fl = new Float32Array(FLARE_MAX * 8);
    _flN = 0;
    _px = new Float32Array(MAX); _py = new Float32Array(MAX); _pz = new Float32Array(MAX);
    _vx = new Float32Array(MAX); _vy = new Float32Array(MAX); _vz = new Float32Array(MAX);
    _age = new Float32Array(MAX); _life = new Float32Array(MAX);
    _sz = new Float32Array(MAX); _grw = new Float32Array(MAX);
    _cr = new Float32Array(MAX); _cg = new Float32Array(MAX); _cb = new Float32Array(MAX);
    _a0 = new Float32Array(MAX);
    _drg = new Float32Array(MAX); _grv = new Float32Array(MAX);
    _add = new Uint8Array(MAX);
    _rainN = 0; _rainOn = false; _rainLastShown = 0; _rainFed = false;
    _lastRainLive = false; _rainEyeOk = false; _rainAcc = 0;
    _rox = _roy = _roz = null; _rspd = _rlen = _ralpha = null;
    _rainCellX = _rainCellY = _rainCellZ = 0x7fffffff;
    _kTone = -1; _kShown = -1; _kSpdQ = -1;
    _kSpdS = _kLenS = _kWind = _kRainSpd = _kOp = _kShW = _kShL = _kDir = NaN;
    _vertA = new Float32Array(MAX * FLOATS_PER);
    _vertB = new Float32Array((MAX + FLARE_MAX) * FLOATS_PER);
    _n = 0;
    _dirty = true; _flareDirty = false; _lastPa = _lastPb = 0;
    _prime = false;
  }

  function clear() {
    _sprK = 0; _sprThr = Infinity; _n = 0; _flN = 0;
    _dirty = true; _flareDirty = false; _lastPa = _lastPb = 0;
    _rainFed = false; _lastRainLive = false; _rainAcc = 0;
    _prime = false;
  }
  function count() { return _n; }
  function capacity() { return MAX; }
  function stats() { return { uploadFloats: _statUpload, expands: _statExpand, alphaExpands: _statAlphaExpand, additiveExpands: _statAddExpand, skips: _statSkip }; }
  function resetStats() { _statUpload = 0; _statExpand = 0; _statSkip = 0; _statAlphaExpand = _statAddExpand = 0; }

  function mul() {
    if (typeof LightTune !== "undefined" && LightTune.LT && LightTune.LT.particleMul !== undefined)
      return LightTune.LT.particleMul;
    return 1;
  }

  function shedDiv() {
    const shed = (typeof PerfGov !== "undefined" && PerfGov.autoShed) ? (PerfGov.autoShed() | 0) : 0;
    return 1 + shed;
  }

  function rnd(k) { return (Math.random() * 2 - 1) * k; }

  const BURST_MAX = 24;
  function nOf(count) {
    if (!(count > 0)) return 0;
    if (count > BURST_MAX) count = BURST_MAX;
    let n = Math.floor(count);
    if (Math.random() < count - n) n++;
    return n;
  }

  function oldest() {
    let best = 0, bestK = -1;
    for (let i = 0; i < _n; i++) {
      const k = _age[i] / _life[i];
      if (k > bestK) { bestK = k; best = i; }
    }
    return best;
  }

  function spawn(x, y, z, vx, vy, vz, life, size, grow, r, g, b, alpha, drag, grav, additive) {
    if (!MAX) return;
    const i = _n < MAX ? _n++ : oldest();
    _px[i] = x; _py[i] = y; _pz[i] = z;
    _vx[i] = vx; _vy[i] = vy; _vz[i] = vz;
    _age[i] = 0; _life[i] = life;
    _sz[i] = size; _grw[i] = grow;
    _cr[i] = r; _cg[i] = g; _cb[i] = b;
    _a0[i] = alpha;
    _drg[i] = drag; _grv[i] = grav;
    _add[i] = additive ? 1 : 0;
    _dirty = true;
  }

  function tyreSmoke(x, y, z, bvx, bvz, inten, count) {
    const m = mul(); if (m <= 0) return;
    for (let n = nOf((count === undefined ? 1 : count) * Math.min(m, 2) / shedDiv()); n > 0; n--) {
      const s = 0.7 + Math.random() * 0.6;
      const w = 0.52 + 0.3 * inten;
      spawn(x + rnd(0.18), y + 0.06, z + rnd(0.18),
        bvx + rnd(0.9), 1.0 + Math.random() * 1.1, bvz + rnd(0.9),
        0.55 + Math.random() * 0.45,
        0.34 * s, 1.9 * s,
        w, w, w + 0.02,
        0.15 + 0.25 * inten,
        1.7, -1.1,
        0);
    }
  }

  function sparks(x, y, z, dirx, dirz, speed, count) {
    const m = mul(); if (m <= 0) return;
    const baseA = Math.atan2(dirx, dirz);
    for (let n = nOf(count * Math.min(m, 2) / shedDiv()); n > 0; n--) {
      const a = baseA + rnd(1.15);
      const v = speed * (0.25 + Math.random() * 0.6);
      spawn(x + rnd(0.3), y + rnd(0.12), z + rnd(0.3),
        Math.sin(a) * v + rnd(2.0), 1.4 + Math.random() * 3.4, Math.cos(a) * v + rnd(2.0),
        0.25 + Math.random() * 0.30,
        0.07 + Math.random() * 0.09, 0.12,
        2.5, 1.2, 0.3,
        0.95, 0.5, 9.8, 1);
    }
  }

  function scrape(x, y, z, vx, vz, count) {
    const m = mul(); if (m <= 0) return;
    for (let n = nOf(count * Math.min(m, 2) / shedDiv()); n > 0 && _n < MAX * 0.6; n--) {
      const k = 0.45 + Math.random() * 0.35;
      spawn(x + rnd(0.3), y + rnd(0.02), z + rnd(0.3),
        vx * k + rnd(1.8), 0.5 + Math.random() * 2.4, vz * k + rnd(1.8),
        0.16 + Math.random() * 0.22,
        0.05 + Math.random() * 0.06, 0.06,
        2.9, 1.7, 0.55,
        0.95, 0.6, 9.8, 1);
    }
  }

  function kickup(x, y, z, bvx, bvz, r, g, b, count) {
    const m = mul(); if (m <= 0) return;
    for (let n = nOf((count === undefined ? 1 : count) * Math.min(m, 2) / shedDiv()); n > 0; n--) {
      spawn(x + rnd(0.2), y + 0.05, z + rnd(0.2),
        bvx * (0.5 + Math.random() * 0.4) + rnd(1.6),
        1.6 + Math.random() * 2.6,
        bvz * (0.5 + Math.random() * 0.4) + rnd(1.6),
        0.35 + Math.random() * 0.25,
        0.13 + Math.random() * 0.10, 0.55,
        r, g, b,
        0.55,
        0.8, 12.0, 0);
      if (Math.random() < 0.5) {
        spawn(x + rnd(0.25), y + 0.12, z + rnd(0.25),
          bvx * 0.30 + rnd(0.8), 1.1 + Math.random() * 0.9, bvz * 0.30 + rnd(0.8),
          0.55 + Math.random() * 0.3,
          0.35, 2.6,
          r * 1.25 + 0.10, g * 1.25 + 0.10, b * 1.25 + 0.10,
          0.38,
          1.6, 0.6, 0);
      }
    }
  }

  function flare(x, y, z, size, r, g, b, alpha, lamp) {
    if (_flN >= (lamp ? FLARE_MAX : FLARE_MAX - LAMP_RESERVE) || !(alpha > 0.004)) return false;
    const o = _flN++ * 8;
    _fl[o] = x; _fl[o + 1] = y; _fl[o + 2] = z; _fl[o + 3] = size;
    _fl[o + 4] = r; _fl[o + 5] = g; _fl[o + 6] = b; _fl[o + 7] = alpha;
    _flareDirty = true;
    return true;
  }
  function flareCount() { return _flN; }

  function spray(x, y, z, bvx, bvz, strength, count) {
    const m = mul(); if (m <= 0) return;
    const lifeK = _mobile ? 0.7 : 1, sizeK = _mobile ? 0.8 : 1, s1 = Math.min(strength, 1.35), s0 = Math.min(strength, 1);
    for (let n = nOf((count === undefined ? 1 : count) * Math.min(m, 2) / shedDiv()); n > 0 && _n < MAX * 0.75; n--) {
      const roll = Math.random();
      if (roll < 0.35) {
        spawn(x + rnd(0.25), y + 0.1, z + rnd(0.25),
          bvx * 1.15 + rnd(0.8), 2.2 + s1 * 2.8 + Math.random() * 1.2, bvz * 1.15 + rnd(0.8),
          (0.8 + 0.6 * s1 + Math.random() * 0.4) * lifeK,
          0.32 * sizeK, 1.5 * sizeK, 0.80, 0.83, 0.88,
          0.12 + 0.20 * strength, 1.1, 0.6, 0);
      } else if (roll < 0.35 + 0.12 * s0) {
        spawn(x + rnd(1.0), y + 0.4 + Math.random() * 0.6, z + rnd(1.0),
          bvx * 0.15 + rnd(0.4), 0.25 + Math.random() * 0.3, bvz * 0.15 + rnd(0.4),
          (3.0 + Math.random() * 1.5) * lifeK,
          1.2 * sizeK, 1.3 * sizeK, 0.72, 0.75, 0.80,
          0.05 + 0.08 * s0, 0.8, -0.05, 0);
      } else {
        spawn(x + rnd(0.4), y + rnd(0.12), z + rnd(0.4),
          bvx + rnd(1.4), 1.2 + Math.random() * 1.8, bvz + rnd(1.4),
          (1.1 + Math.random() * 0.8) * lifeK,
          (0.5 + Math.random() * 0.25) * sizeK, 1.9 * sizeK,
          0.74, 0.77, 0.82,
          0.10 + 0.22 * strength,
          1.5, -0.9, 0);
      }
    }
  }

  function sprayStr(vs, k, wetness) {
    const sp = Math.max(0, Math.min(1, (vs - 15) / 45));
    const wk = Math.max(0, Math.min(1, ((wetness || 0) - 0.25) / 0.55));
    return sp * k * (0.55 + 0.45 * wk);
  }
  function sprayRate(str) { return 10 + 26 * str; }

  const _sprD = new Float32Array(32);
  let _sprK = 0, _sprThr = Infinity;
  function sprayCars() { return _mobile ? 3 : 6; }
  function sprayAdmit(d2) {
    if (_sprK < _sprD.length) _sprD[_sprK++] = d2;
    return d2 <= _sprThr;
  }
  function _sprayRoll() {
    const N = sprayCars();
    if (_sprK <= N) { _sprThr = Infinity; _sprK = 0; return; }
    for (let i = 1; i < _sprK; i++) {
      const d = _sprD[i];
      let j = Math.min(i, N - 1);
      if (i >= N && !(d < _sprD[j])) continue;
      while (j > 0 && _sprD[j - 1] > d) { _sprD[j] = _sprD[j - 1]; j--; }
      _sprD[j] = d;
    }
    _sprThr = _sprD[N - 1] * 1.05;
    _sprK = 0;
  }

  function update(dt) {
    if (dt > 0) _sprayRoll();
    if (!_n || !(dt > 0)) return;
    if (dt > 0.1) dt = 0.1;
    _dirty = true;
    for (let i = 0; i < _n; ) {
      _age[i] += dt;
      if (_age[i] >= _life[i]) {
        const l = --_n;
        if (i !== l) {
          _px[i] = _px[l]; _py[i] = _py[l]; _pz[i] = _pz[l];
          _vx[i] = _vx[l]; _vy[i] = _vy[l]; _vz[i] = _vz[l];
          _age[i] = _age[l]; _life[i] = _life[l];
          _sz[i] = _sz[l]; _grw[i] = _grw[l];
          _cr[i] = _cr[l]; _cg[i] = _cg[l]; _cb[i] = _cb[l];
          _a0[i] = _a0[l]; _drg[i] = _drg[l]; _grv[i] = _grv[l];
          _add[i] = _add[l];
        }
        continue;
      }
      const d = Math.exp(-_drg[i] * dt);
      _vx[i] *= d; _vz[i] *= d;
      _vy[i] = (_vy[i] - _grv[i] * dt) * d;
      _px[i] += _vx[i] * dt; _py[i] += _vy[i] * dt; _pz[i] += _vz[i] * dt;
      i++;
    }
  }

  function armPrime() { _prime = true; }
  function draw() {
    _draw();
    if (!_prime || !_gfx || !_gfx.drawParticles || !MAX) return;
    _prime = false;
    if (!_lastPa) { _vertA.fill(0, 0, 60); _gfx.drawParticles(_vertA, 60, false, true); }
    if (!_lastPb) { _vertB.fill(0, 0, 60); _gfx.drawParticles(_vertB, 60, true, true); }
  }
  function _draw() {
    const rainLive = _rainFed; _rainFed = false;
    const hasRain = !!(rainLive && _rainN && _rainOn);
    if (hasRain !== _lastRainLive) _dirty = true;
    _lastRainLive = hasRain;
    if (!_gfx || !_gfx.drawParticles) { _flN = 0; return; }
    if (!_n && !_flN && !(rainLive && _rainN && _rainOn)) {
      _lastPa = _lastPb = 0;
      return;
    }
    if (!_dirty && !_flareDirty && (_lastPa || _lastPb)) {
      _statSkip++;
      if (_lastPa) _gfx.drawParticles(_vertA, _lastPa, false, false);
      if (_lastPb) _gfx.drawParticles(_vertB, _lastPb, true, false);
      _flN = 0;
      return;
    }
    _statExpand++;
    const alphaDirty = _dirty;
    if (alphaDirty) _statAlphaExpand++;
    _statAddExpand++;
    let pa = alphaDirty ? 0 : _lastPa, pb = 0;
    const hadFlare = _flN > 0;
    for (let i = 0; i < _n; i++) {
      if (!alphaDirty && !_add[i]) continue;
      const t = _age[i] / _life[i];
      const fade = t < 0.12 ? t / 0.12 : 1 - (t - 0.12) / 0.88;
      const alpha = _a0[i] * fade;
      if (alpha <= 0.004) continue;
      const size = _sz[i] + _grw[i] * _age[i];
      const out = _add[i] ? _vertB : _vertA;
      let p = _add[i] ? pb : pa;
      const x = _px[i], y = _py[i], z = _pz[i], r = _cr[i], g = _cg[i], b = _cb[i];
      for (let v = 0; v < 12; v += 2) {
        out[p++] = _CORNERS[v]; out[p++] = _CORNERS[v + 1];
        out[p++] = x; out[p++] = y; out[p++] = z;
        out[p++] = r; out[p++] = g; out[p++] = b;
        out[p++] = size; out[p++] = alpha;
      }
      if (_add[i]) pb = p; else pa = p;
    }
    for (let f = 0; f < _flN; f++) {
      const o = f * 8;
      const x = _fl[o], y = _fl[o + 1], z = _fl[o + 2], size = _fl[o + 3];
      const r = _fl[o + 4], g = _fl[o + 5], b = _fl[o + 6], alpha = _fl[o + 7];
      for (let v = 0; v < 12; v += 2) {
        _vertB[pb++] = _CORNERS[v]; _vertB[pb++] = _CORNERS[v + 1];
        _vertB[pb++] = x; _vertB[pb++] = y; _vertB[pb++] = z;
        _vertB[pb++] = r; _vertB[pb++] = g; _vertB[pb++] = b;
        _vertB[pb++] = size; _vertB[pb++] = alpha;
      }
    }
    _flN = 0;
    if (rainLive && alphaDirty) pa = rainFill(_vertA, pa);
    _lastPa = pa; _lastPb = pb;
    _statUpload += (alphaDirty ? pa : 0) + pb;
    if (pa) _gfx.drawParticles(_vertA, pa, false, alphaDirty);
    if (pb) _gfx.drawParticles(_vertB, pb, true, true);
    _dirty = false;
    _flareDirty = hadFlare;
  }

  const RAIN_R = 9, RAIN_DOWN = 3, RAIN_UP = 5;
  const RAIN_H = RAIN_DOWN + RAIN_UP;
  const RAIN_EXPO = 0.022;
  const RAIN_COL = [0.69, 0.78, 0.91];
  let _rainOn = false, _rainN = 0, _rainLastShown = 0;
  let _rainFed = false;
  let _rox = null, _roy = null, _roz = null;
  let _rspd = null, _rlen = null, _ralpha = null;
  const _rainEye = [0, 0, 0];
  let _rainEyeOk = false;
  const _camVel = [0, 0, 0];
  let _windX = 0, _windZ = 0;

  const _clamp01 = (v) => Math.max(0, Math.min(1, v));
  function _lt() {
    return (typeof LightTune !== "undefined" && LightTune.LT) || {};
  }

  function rainShow(on) {
    const next = !!on;
    if (next !== _rainOn) _dirty = true;
    _rainOn = next;
    if (!on) _rainEyeOk = false;
  }
  function rainActive() { return _rainN > 0; }
  let _rainK = null;
  let _rainAmount = 1, _rainTone = 0, _rainBudget = 0;
  let _rainDrizzle = false, _rainSpeedScale = 1, _rainLenScale = 1;
  function rainIntensity(k) {
    _rainK = k && k.count > 0 && !(k.count === 1 && k.speed === 1 && k.len === 1 && k.alpha === 1) ? k : null;
    return _rainK ? _rainK.count : 1;
  }

  function _rainDirtyFromEye(eye) {
    const cx = Math.floor(eye[0] / RAIN_CELL_M);
    const cy = Math.floor(eye[1] / RAIN_CELL_M);
    const cz = Math.floor(eye[2] / RAIN_CELL_M);
    const spdQ = (Math.hypot(_camVel[0], _camVel[1], _camVel[2]) / 4) | 0;
    const LT = _lt();
    const tone = Math.round(_rainTone * 100);
    const shown = _rainShown();
    const wind = LT.rainWind != null ? LT.rainWind : 0;
    const rainSpeed = LT.rainSpeed != null ? LT.rainSpeed : 1;
    const opacity = LT.rainOpacity != null ? LT.rainOpacity : 1;
    const shearW = LT.rainShearWind != null ? LT.rainShearWind : 0.9;
    const shearL = LT.rainShearLen != null ? LT.rainShearLen : 2;
    const dir = LT.windDir != null ? LT.windDir : 35;
    if (cx !== _rainCellX || cy !== _rainCellY || cz !== _rainCellZ
        || tone !== _kTone || shown !== _kShown || spdQ !== _kSpdQ
        || _rainSpeedScale !== _kSpdS || _rainLenScale !== _kLenS
        || wind !== _kWind || rainSpeed !== _kRainSpd || opacity !== _kOp
        || shearW !== _kShW || shearL !== _kShL || dir !== _kDir) {
      _rainCellX = cx; _rainCellY = cy; _rainCellZ = cz;
      _kTone = tone; _kShown = shown; _kSpdQ = spdQ;
      _kSpdS = _rainSpeedScale; _kLenS = _rainLenScale;
      _kWind = wind; _kRainSpd = rainSpeed; _kOp = opacity;
      _kShW = shearW; _kShL = shearL; _kDir = dir;
      _dirty = true;
    }
  }

  function _rainScatter(i) {
    _rox[i] = rnd(RAIN_R);
    _roy[i] = -RAIN_DOWN + Math.random() * RAIN_H;
    _roz[i] = rnd(RAIN_R);
  }

  function rainSeed(drizzle) {
    const LT = _lt();
    const dzCount = LT.drizzleCount != null ? LT.drizzleCount : 0.3;
    const dzLen   = LT.drizzleLen   != null ? LT.drizzleLen   : 0.5;
    const dzSpeed = LT.drizzleSpeed != null ? LT.drizzleSpeed : 0.6;
    const wetCap = (_gfx && _gfx.mobileTier) ? 140 : 1000;
    const base = LT.rainCount != null ? LT.rainCount : 360;
    const hk = drizzle ? null : _rainK;
    _rainBudget = base * (hk ? hk.count : 1);
    const count = Math.max(0, Math.min(wetCap, Math.round(base * (drizzle ? dzCount : 1) * (hk ? hk.count : 1))));
    if (!_rox || _rox.length < wetCap) {
      _rox = new Float32Array(wetCap); _roy = new Float32Array(wetCap); _roz = new Float32Array(wetCap);
      _rspd = new Float32Array(wetCap); _rlen = new Float32Array(wetCap); _ralpha = new Float32Array(wetCap);
    }
    _rainN = count;
    _rainAmount = 1;
    _rainDrizzle = !!drizzle; _rainSpeedScale = drizzle ? dzSpeed : 1; _rainLenScale = drizzle ? dzLen : 1;
    for (let i = 0; i < count; i++) {
      _rainScatter(i);
      _rspd[i] = (6.5 + Math.random() * 3.0) * (LT.rainSpeed != null ? LT.rainSpeed : 1) * (hk ? hk.speed : 1);
      _rlen[i] = (0.75 + Math.random() * 0.5) * (LT.rainStreak != null ? LT.rainStreak : 1) * (hk ? hk.len : 1);
      _ralpha[i] = (0.16 + Math.random() * 0.34) * (hk ? hk.alpha : 1);
    }
    _rainLastShown = count;
    _rainEyeOk = false;
    _dirty = true;
    _rainCellX = _rainCellY = _rainCellZ = 0x7fffffff;
    _rainAcc = 0;
    _kTone = -1; _kShown = -1; _kSpdQ = -1;
    _kSpdS = NaN; _kLenS = NaN; _kWind = NaN; _kRainSpd = NaN; _kOp = NaN;
    _kShW = NaN; _kShL = NaN; _kDir = NaN;
    const need = (MAX + wetCap) * FLOATS_PER;
    if (!_vertA || _vertA.length < need) _vertA = new Float32Array(need);
  }

  function _rainShown() {
    const d = shedDiv();
    return Math.ceil(_rainN * _rainAmount / d);
  }

  function rainUpdate(dt, eye, raining) {
    if (!_rainN || !_rainOn || !eye) return;
    if (!(dt > 0)) dt = 0;
    if (dt > 0.1) dt = 0.1;
    const LT = _lt();
    const rate = typeof raining === "number" ? _clamp01(Number.isFinite(raining) ? raining : 0) : null;
    const dz = _clamp01(LT.drizzleCount != null ? LT.drizzleCount : 0.3);
    const density = rate == null ? 1 : rate <= 0.5 ? 2 * rate * dz : dz + 2 * (rate - 0.5) * (1 - dz);
    _rainTone = rate == null ? (raining ? 1 : 0) : _clamp01(2 * rate - 1);
    _rainAmount = rate == null ? 1 : _clamp01(density * _rainBudget / _rainN);
    const shape = rate == null ? (_rainDrizzle ? 0 : 1) : _rainTone;
    const dzSpeed = LT.drizzleSpeed != null ? LT.drizzleSpeed : 0.6, dzLen = LT.drizzleLen != null ? LT.drizzleLen : 0.5;
    _rainSpeedScale = dzSpeed + (1 - dzSpeed) * shape; _rainLenScale = dzLen + (1 - dzLen) * shape;
    _rainFed = true;
    if (_rainEyeOk && dt > 0) {
      const dx = eye[0] - _rainEye[0], dy = eye[1] - _rainEye[1], dz = eye[2] - _rainEye[2];
      if (dx * dx + dy * dy + dz * dz < 40 * 40) { _camVel[0] = dx / dt; _camVel[1] = dy / dt; _camVel[2] = dz / dt; }
      else { _camVel[0] = _camVel[1] = _camVel[2] = 0; }
    } else { _camVel[0] = _camVel[1] = _camVel[2] = 0; }
    _rainEye[0] = eye[0]; _rainEye[1] = eye[1]; _rainEye[2] = eye[2];
    _rainEyeOk = true;
    _rainAcc += dt;
    if (_rainAcc >= 1 / 30) { _rainAcc -= 1 / 30; if (_rainAcc > 1 / 30) _rainAcc = 0; _dirty = true; }
    const wd = (LT.windDir != null ? LT.windDir : 35) * (Math.PI / 180);
    const wk = LT.rainWind != null ? LT.rainWind : 0.18;
    _windX = Math.cos(wd) * wk; _windZ = Math.sin(wd) * wk;
    const wind = typeof Wind !== "undefined" && Wind.state ? Wind.state() : null;
    if (wind && wind.on) { _windX = wind.wx / 8 * wk / 0.18; _windZ = wind.wz / 8 * wk / 0.18; }
    const shown = _rainShown();
    for (let i = _rainLastShown; i < shown; i++) _rainScatter(i);
    _rainLastShown = shown;
    const mx = _camVel[0] * dt, my = _camVel[1] * dt, mz = _camVel[2] * dt;
    for (let i = 0; i < shown; i++) {
      const s = _rspd[i] * _rainSpeedScale * dt;
      let x = _rox[i] + s * _windX - mx, y = _roy[i] - s - my, z = _roz[i] + s * _windZ - mz;
      if (y < -RAIN_DOWN) { x = rnd(RAIN_R); z = rnd(RAIN_R); }
      y = ((y + RAIN_DOWN) % RAIN_H + RAIN_H) % RAIN_H - RAIN_DOWN;
      x = ((x + RAIN_R) % (2 * RAIN_R) + 2 * RAIN_R) % (2 * RAIN_R) - RAIN_R;
      z = ((z + RAIN_R) % (2 * RAIN_R) + 2 * RAIN_R) % (2 * RAIN_R) - RAIN_R;
      _rox[i] = x; _roy[i] = y; _roz[i] = z;
    }
    _rainDirtyFromEye(eye);
  }

  function rainFill(out, p) {
    if (!_rainN || !_rainOn || !_rainEyeOk) return p;
    const LT = _lt();
    const alphaMul = (0.16 + 0.09 * _rainTone) / 0.33 * (LT.rainOpacity != null ? LT.rainOpacity : 1);
    const shearW = (LT.rainShearWind != null ? LT.rainShearWind : 0.9) / 0.9;
    const shearL = (LT.rainShearLen != null ? LT.rainShearLen : 2.0) / 2.0;
    const cvx = _camVel[0] * shearW, cvy = _camVel[1] * shearW, cvz = _camVel[2] * shearW;
    const camSpeed = Math.hypot(_camVel[0], _camVel[1], _camVel[2]) * shearL;
    const ex = _rainEye[0], ey = _rainEye[1], ez = _rainEye[2];
    const cr = RAIN_COL[0], cg = RAIN_COL[1], cb = RAIN_COL[2];
    const shown = _rainLastShown;
    for (let i = 0; i < shown; i++) {
      const s = _rspd[i] * _rainSpeedScale;
      const tx = _rox[i], ty = _roy[i], tz = _roz[i];
      const dist = Math.hypot(tx, ty, tz);
      if (dist < 0.4) continue;
      const vx = s * _windX - cvx, vy = -s - cvy, vz = s * _windZ - cvz;
      const vm = Math.hypot(vx, vy, vz) || 1;
      const dx = vx / vm, dy = vy / vm, dz = vz / vm;
      let rx = dy * tz - dz * ty, ry = dz * tx - dx * tz, rz = dx * ty - dy * tx;
      const rl = Math.hypot(rx, ry, rz);
      if (rl < 1e-6) continue;
      rx /= rl; ry /= rl; rz /= rl;
      const halfLen = Math.min(3.0, 0.5 * RAIN_EXPO * _rlen[i] * _rainLenScale * (s + camSpeed));
      const halfW = 0.014 + dist * 0.0022;
      const a = _ralpha[i] * alphaMul * _clamp01((dist - 0.4) / 1.6);
      if (a <= 0.004) continue;
      if (p + FLOATS_PER > out.length) break;
      const cx = ex + tx, cy = ey + ty, cz = ez + tz;
      for (let v = 0; v < 12; v += 2) {
        const kx = _CORNERS[v], ky = _CORNERS[v + 1];
        out[p++] = kx; out[p++] = ky;
        out[p++] = cx + dx * halfLen * ky + rx * halfW * kx;
        out[p++] = cy + dy * halfLen * ky + ry * halfW * kx;
        out[p++] = cz + dz * halfLen * ky + rz * halfW * kx;
        out[p++] = cr; out[p++] = cg; out[p++] = cb;
        out[p++] = 0; out[p++] = a;
      }
    }
    return p;
  }

  return { init, clear, count, capacity, update, draw, armPrime, tyreSmoke, sparks, scrape, kickup, spray, sprayStr, sprayRate, sprayAdmit, sprayCars,
           flare, flareCount, rainShow, rainSeed, rainUpdate, rainActive, rainIntensity, stats, resetStats };
})();
Object.freeze(Particles);
