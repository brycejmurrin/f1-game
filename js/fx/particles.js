/* Apex 26 — shared transient-particle pool (tyre smoke, collision and plank sparks, gravel/grass kickup, rain spray) for js/game.js. A fixed CPU pool of camera-facing soft
 * billboards drawn in two batches a frame through gfx.drawParticles(), plus
 * one-frame FLARES (flare: a far car's brake glow, the start gantry's lamps,
 * the marshal panels) appended to the additive batch outside the pool, plus the
 * RAIN STREAK FIELD (rain*): falling drops in a box around the camera, each one a
 * pre-expanded world-space quad appended to the alpha batch — the same shader on
 * every backend draws it as a soft streak (see rainFill). */
const Particles = (function () {
  "use strict";

  let _gfx = null;      // renderer handle, set once by init()
  let MAX = 0;          // pool capacity (tier-gated at init)

  // Struct-of-arrays particle pool (allocated once in init).
  let _px, _py, _pz;          // position (world, m)
  let _vx, _vy, _vz;          // velocity (m/s)
  let _age, _life;            // seconds
  let _sz, _grw;              // half-size (m) + growth rate (m/s)
  let _cr, _cg, _cb;          // tint (HDR allowed for additive)
  let _a0;                    // base alpha
  let _drg, _grv;             // drag rate (1/s) + downward gravity (m/s²)
  let _add;                   // Uint8: 1 = additive (spark) group
  let _n = 0;                 // live count
  let _mobile = false;        // gfx.mobileTier at init — the spray plume shrinks with the pool

  // ONE-FRAME FLARES: additive discs drawn in THIS frame's additive batch and
  // dropped after it. Not pool particles — a pooled disc outlives its frame
  // (life > dt or it dies in update() before it is drawn), so one re-spawned
  // every frame stacks copies: on a MOVING car a trail behind it, on a fixed
  // lamp a brightness that scales with the display's refresh rate (the start
  // lights summed 1.1× at 30 Hz and 7× at 144 Hz until 2026-10-04, and the
  // marshal panels filled the whole mobile pool at 120 Hz).
  // LAMP_RESERVE is held back for the race's own lamps (start gantry 5 + marshal
  // panels 16, js/race/*): the cars' far brake flares are drawn first each frame
  // and stop at FLARE_MAX − LAMP_RESERVE, so they can never starve a lamp.
  const LAMP_RESERVE = 24;
  let FLARE_MAX = 0, _flN = 0;
  let _fl = null;             // [x, y, z, size, r, g, b, alpha] per flare

  const FLOATS_PER = 6 * 10;
  let _vertA = null;          // alpha-blended group (smoke / dust / spray)
  let _vertB = null;          // additive group (sparks)
  const _CORNERS = [-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1];
  // Dirty latch (audit 2026-10-05 #4): skip CPU expand + GPU upload when the
  // pool/flares/rain-cell are unchanged. Rain dirties on eye-cell / knob change
  // (not every falling step) so a parked wet session stops re-uploading.
  let _dirty = true, _lastPa = 0, _lastPb = 0;
  let _rainAcc = 0;   // seconds since the last forced re-expand (parked-eye staleness cap)
  let _rainCellX = 0x7fffffff, _rainCellY = 0x7fffffff, _rainCellZ = 0x7fffffff;
  let _rainKnobKey = "";
  const RAIN_CELL_M = 2;
  let _statUpload = 0, _statExpand = 0, _statSkip = 0;

  function markDirty() { _dirty = true; }

  function init(gfx) {
    Log.info("game", "Particles.init");
    _gfx = gfx;
    // Tight pool on the mobile memory tier: fewer live quads, same behaviour.
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
    // The alpha batch also carries the rain shower (rainFill): size for both.
    _vertA = new Float32Array((MAX + _rainN) * FLOATS_PER);
    _vertB = new Float32Array((MAX + FLARE_MAX) * FLOATS_PER);
    _n = 0;
    _dirty = true; _lastPa = _lastPb = 0;
  }

  function clear() { _n = 0; _flN = 0; _dirty = true; _lastPa = _lastPb = 0; }
  function count() { return _n; }
  function capacity() { return MAX; }
  function stats() { return { uploadFloats: _statUpload, expands: _statExpand, skips: _statSkip }; }
  function resetStats() { _statUpload = 0; _statExpand = 0; _statSkip = 0; }

  function mul() {
    if (typeof LightTune !== "undefined" && LightTune.LT && LightTune.LT.particleMul !== undefined)
      return LightTune.LT.particleMul;
    return 1;
  }

  // Governor evidence only (PerfGov.autoShed — crash floor + measured sheds,
  // never the GRAPHICS user floor). HIGH/ULTRA stay at full density until the
  // device is missing frames; spray/rain already use the same divisor.
  function shedDiv() {
    const shed = (typeof PerfGov !== "undefined" && PerfGov.autoShed) ? (PerfGov.autoShed() | 0) : 0;
    return 1 + shed;
  }

  function rnd(k) { return (Math.random() * 2 - 1) * k; }

  // A rate·dt request → a whole count, rounding the fraction stochastically. The
  // ceiling only stops a hitch flooding the pool: it sits above anything an
  // emitter asks within update()'s own 0.1 s step (plank sparks 110/s ×
  // particleMul 2 = 22), so emission is frame-rate independent down to 10 fps.
  // It was 4 until 2026-10-04, which cut plank embers below ~27.5 fps.
  const BURST_MAX = 24;
  function nOf(count) {
    if (!(count > 0)) return 0;
    if (count > BURST_MAX) count = BURST_MAX;
    let n = Math.floor(count);
    if (Math.random() < count - n) n++;
    return n;
  }

  // A full pool RECYCLES the particle nearest its end (largest age/life) rather
  // than dropping the new one: the newest emission is usually the nearest to the
  // camera, the oldest a fading far plume. A linear scan, paid only when full.
  function oldest() {
    let best = 0, bestK = -1;
    for (let i = 0; i < _n; i++) {
      const k = _age[i] / _life[i];
      if (k > bestK) { bestK = k; best = i; }
    }
    return best;
  }

  function spawn(x, y, z, vx, vy, vz, life, size, grow, r, g, b, alpha, drag, grav, additive) {
    if (!MAX) return;                   // never allocate
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
      const w = 0.52 + 0.3 * inten;                  // whiteness with intensity
      spawn(x + rnd(0.18), y + 0.06, z + rnd(0.18),
        bvx + rnd(0.9), 1.0 + Math.random() * 1.1, bvz + rnd(0.9),
        0.55 + Math.random() * 0.45,                 // life
        0.34 * s, 1.9 * s,                           // size + growth (m/s)
        w, w, w + 0.02,
        0.15 + 0.25 * inten,
        1.7, -1.1,                                   // drag; negative grav = buoyant rise
        0);
    }
  }

  function sparks(x, y, z, dirx, dirz, speed, count) {
    const m = mul(); if (m <= 0) return;
    let n = Math.round(count * Math.min(m, 2) / shedDiv());
    const baseA = Math.atan2(dirx, dirz);
    for (; n > 0; n--) {
      const a = baseA + rnd(1.15);
      const v = speed * (0.25 + Math.random() * 0.6);
      spawn(x + rnd(0.3), y + rnd(0.12), z + rnd(0.3),
        Math.sin(a) * v + rnd(2.0), 1.4 + Math.random() * 3.4, Math.cos(a) * v + rnd(2.0),
        0.25 + Math.random() * 0.30,
        0.07 + Math.random() * 0.09, 0.12,           // tiny, barely grows
        2.5, 1.2, 0.3,                               // HDR ember tint → blooms
        0.95, 0.5, 9.8, 1);
    }
  }

  // PLANK SPARKS: titanium skid-block embers torn off where the floor bottoms
  // out (js/fx/car-fx.js reads body-attitude's c.baScrape). (vx, vz) is the
  // CAR's ground velocity: an ember keeps 45-80 % of it, so from a car-following
  // camera the shower streams out behind the floor rather than fanning sideways
  // like a collision's. Hotter and whiter than collision embers, tinier, short
  // lived. They give way to everything else: none spawn past 60 % of the pool,
  // so a field of bottoming cars never starves the collision sparks and smoke.
  function scrape(x, y, z, vx, vz, count) {
    const m = mul(); if (m <= 0) return;
    for (let n = nOf(count * Math.min(m, 2) / shedDiv()); n > 0 && _n < MAX * 0.6; n--) {
      const k = 0.45 + Math.random() * 0.35;
      spawn(x + rnd(0.3), y + rnd(0.02), z + rnd(0.3),
        vx * k + rnd(1.8), 0.5 + Math.random() * 2.4, vz * k + rnd(1.8),
        0.16 + Math.random() * 0.22,
        0.05 + Math.random() * 0.06, 0.06,           // tiny, barely grows
        2.9, 1.7, 0.55,                              // white-hot yellow → blooms
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
      // roughly every other chunk drags a soft dust cloud out with it
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

  // One-frame additive disc (see FLARE_MAX): returns false when the frame's
  // flare budget is spent. A lamp, not an effect: it ignores particleMul.
  // `lamp` = a steady race lamp (start gantry, marshal panel) re-issued every
  // frame by its owner; only those may draw on LAMP_RESERVE.
  function flare(x, y, z, size, r, g, b, alpha, lamp) {
    if (_flN >= (lamp ? FLARE_MAX : FLARE_MAX - LAMP_RESERVE) || !(alpha > 0.004)) return false;
    const o = _flN++ * 8;
    _fl[o] = x; _fl[o + 1] = y; _fl[o + 2] = z; _fl[o + 3] = size;
    _fl[o + 4] = r; _fl[o + 5] = g; _fl[o + 6] = b; _fl[o + 7] = alpha;
    _dirty = true;
    return true;
  }
  function flareCount() { return _flN; }

  // RAIN SPRAY: a lingering plume, not a puff. Each drop-cloud lives 1.1-1.9 s
  // (was 0.50-0.85), starts bigger, keeps rising (buoyant, lighter drag), so
  // the wall of mist behind a car stretches tens of metres and partly hides
  // it from the car following — the wet-race look. The caller's emission rate
  // came DOWN to match (game.js), so the live count per car stays near what
  // the puffs cost. Pool discipline: spray never takes the pool's last quarter
  // (sparks and smoke keep room), sheds with the governor like the rain
  // streaks, and on the mobile tier the plume is shorter-lived and smaller —
  // it is the one alpha effect big enough to cost real overdraw.
  function spray(x, y, z, bvx, bvz, strength, count) {
    const m = mul(); if (m <= 0) return;
    const lifeK = _mobile ? 0.7 : 1, sizeK = _mobile ? 0.8 : 1;
    for (let n = nOf((count === undefined ? 1 : count) * Math.min(m, 2) / shedDiv()); n > 0 && _n < MAX * 0.75; n--) {
      spawn(x + rnd(0.4), y + rnd(0.12), z + rnd(0.4),
        bvx + rnd(1.4), 1.2 + Math.random() * 1.8, bvz + rnd(1.4),
        (1.1 + Math.random() * 0.8) * lifeK,
        (0.5 + Math.random() * 0.25) * sizeK, 1.9 * sizeK,   // ~3.5 m half-size by the end
        0.74, 0.77, 0.82,
        0.10 + 0.22 * strength,
        1.5, -0.9, 0);
    }
  }

  function update(dt) {
    if (!_n || !(dt > 0)) return;
    if (dt > 0.1) dt = 0.1;      // tab-back / hitch: don't teleport particles
    _dirty = true;
    for (let i = 0; i < _n; ) {
      _age[i] += dt;
      if (_age[i] >= _life[i]) {
        // swap-remove with the last live particle (order doesn't matter)
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

  function draw() {
    // The shower draws only on a frame its owner advanced it (rainUpdate, which
    // game.js calls only while the road is wet): a field nobody updates is a
    // frozen box of streaks at a stale eye — what a drying weather arc left
    // hanging for the rest of the race until 2026-10-04.
    const rainLive = _rainFed; _rainFed = false;
    if (!_gfx || !_gfx.drawParticles) { _flN = 0; return; }
    if (!_n && !_flN && !(rainLive && _rainN && _rainOn)) {
      _lastPa = _lastPb = 0;
      return;
    }
    // Clean: re-issue the last upload without expanding (rain-cell / idle pool).
    if (!_dirty && (_lastPa || _lastPb)) {
      _statSkip++;
      if (_lastPa) _gfx.drawParticles(_vertA, _lastPa, false, false);
      if (_lastPb) _gfx.drawParticles(_vertB, _lastPb, true, false);
      _flN = 0;
      return;
    }
    _statExpand++;
    let pa = 0, pb = 0;
    const hadFlare = _flN > 0;
    for (let i = 0; i < _n; i++) {
      const t = _age[i] / _life[i];
      // quick fade-in (kills the "pop"), long fade-out
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
    _flN = 0;                    // one frame: drawn once, then gone
    // The shower rides in the SAME alpha call: TLX keeps one vertex stream per
    // blend group and a second drawParticles() in a frame overwrites the first.
    if (rainLive) pa = rainFill(_vertA, pa);
    _lastPa = pa; _lastPb = pb;
    _statUpload += pa + pb;
    if (pa) _gfx.drawParticles(_vertA, pa, false, true);
    if (pb) _gfx.drawParticles(_vertB, pb, true, true);
    // Flares are one-frame: force a rebuild next draw so they do not stick.
    _dirty = hadFlare;
  }

  // ── RAIN: a falling-streak field around the camera ──────────────────────────
  // Until 2026-10-01 rain was a second full-screen Canvas2D stroked over #game:
  // no depth (streaks over the car and the walls alike), no fog, no bloom, not
  // in the rear-view mirror, invisible to every canvas screenshot, and a CPU
  // path + compositor layer that the governor had to shed. Now each drop is a
  // thin world-space quad in a box that travels with the eye, appended to the
  // alpha particle batch with fxSize 0 — the particle shaders then add nothing
  // to the pre-expanded corners and their soft-disc falloff over the quad's
  // (±1, ±1) corner UV draws a soft ELLIPSE inscribed in the rectangle: a rain
  // streak, depth-tested, on all three backends with no new program.
  //
  // The look is physical where the overlay faked it: the streak direction is
  // the APPARENT velocity (drop velocity − camera velocity), so a fast car sees
  // the rain rake toward it and stretch — the RAIN SPEED SLANT / STRETCH knobs
  // now scale that camera term (their shipped values are the physical 1:1) —
  // and RAIN WIND slants the fall along the shared WIND DIRECTION knob the
  // trees sway to. Drops are stored as OFFSETS from the eye and wrap in the
  // box, so the field is stationary in the world yet always fills the view.
  // Box: ±R around the eye, RAIN_DOWN below .. RAIN_UP above (m). Only about a
  // quarter of it is in view, so the on-screen count is rainCount / 4: at
  // 18 x 18 x 8 m the shipped 360 drops read like the overlay's density did
  // (measured on the montreal rain probe: 28 x 28 x 11 m looked sparse).
  const RAIN_R = 9, RAIN_DOWN = 3, RAIN_UP = 5;
  const RAIN_H = RAIN_DOWN + RAIN_UP;
  const RAIN_EXPO = 0.022;                             // s — the "shutter" that turns apparent velocity into streak length
  const RAIN_COL = [0.69, 0.78, 0.91];                 // the overlay's #afc8e8
  let _rainOn = false, _rainN = 0, _rainLastShown = 0, _rainRaining = false;
  let _rainFed = false;                                // rainUpdate ran since the last draw()
  let _rox = null, _roy = null, _roz = null;          // offset from the eye (m)
  let _rspd = null, _rlen = null, _ralpha = null;     // fall speed (m/s), streak-length scale, opacity
  const _rainEye = [0, 0, 0];
  let _rainEyeOk = false;                              // false until the first update after a seed/show (no finite difference)
  const _camVel = [0, 0, 0];
  let _windX = 0, _windZ = 0;

  const _clamp01 = (v) => Math.max(0, Math.min(1, v));
  function _lt() {
    return (typeof LightTune !== "undefined" && LightTune.LT) || {};
  }

  // Show/hide without dropping the seed (menus, results sheet, quit).
  function rainShow(on) {
    const next = !!on;
    if (next !== _rainOn) _dirty = true;
    _rainOn = next;
    if (!on) _rainEyeOk = false;
  }
  function rainActive() { return _rainN > 0; }

  function _rainDirtyFromEye(eye) {
    const cx = Math.floor(eye[0] / RAIN_CELL_M);
    const cy = Math.floor(eye[1] / RAIN_CELL_M);
    const cz = Math.floor(eye[2] / RAIN_CELL_M);
    // Cam-speed buckets keep streak rake/stretch fresh when the eye stays in
    // cell but velocity changes (parked→pullaway); 4 m/s ≈ one gear of slant.
    const spdQ = (Math.hypot(_camVel[0], _camVel[1], _camVel[2]) / 4) | 0;
    const LT = _lt();
    const key = ((_rainRaining ? 1 : 0) + "|" + _rainShown() + "|" + spdQ + "|" +
      (LT.rainWind != null ? LT.rainWind : 0) + "|" + (LT.rainSpeed != null ? LT.rainSpeed : 1) + "|" +
      (LT.rainOpacity != null ? LT.rainOpacity : 1) + "|" + (LT.rainShearWind != null ? LT.rainShearWind : 0.9) + "|" +
      (LT.rainShearLen != null ? LT.rainShearLen : 2) + "|" + (LT.windDir != null ? LT.windDir : 35));
    if (cx !== _rainCellX || cy !== _rainCellY || cz !== _rainCellZ || key !== _rainKnobKey) {
      _rainCellX = cx; _rainCellY = cy; _rainCellZ = cz; _rainKnobKey = key;
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
    // TIERED, like the pool (MAX 96 vs 256): every shown drop is six CPU-written
    // vertices a frame. LT.rainCount is 450-650 across the wet presets. The
    // mobileTier cap is the seed-time half of the gate; the governor half is
    // per frame in rainUpdate (_rainShown), because the shed level moves long
    // after a shower is seeded.
    const wetCap = (_gfx && _gfx.mobileTier) ? 140 : 1000;
    const base = LT.rainCount != null ? LT.rainCount : 360;
    const count = Math.max(0, Math.min(wetCap, Math.round(base * (drizzle ? dzCount : 1))));
    if (!_rox || _rox.length < count) {
      _rox = new Float32Array(count); _roy = new Float32Array(count); _roz = new Float32Array(count);
      _rspd = new Float32Array(count); _rlen = new Float32Array(count); _ralpha = new Float32Array(count);
    }
    _rainN = count;
    for (let i = 0; i < count; i++) {
      _rainScatter(i);
      // 6.5-9.5 m/s is terminal velocity for 1.5-4 mm drops; the knobs scale it.
      _rspd[i] = (6.5 + Math.random() * 3.0) * (drizzle ? dzSpeed : 1) * (LT.rainSpeed != null ? LT.rainSpeed : 1);
      _rlen[i] = (0.75 + Math.random() * 0.5) * (LT.rainStreak != null ? LT.rainStreak : 1) * (drizzle ? dzLen : 1);
      _ralpha[i] = 0.16 + Math.random() * 0.34;
    }
    _rainLastShown = count;
    _rainEyeOk = false;
    _dirty = true;
    _rainCellX = _rainCellY = _rainCellZ = 0x7fffffff;
    _rainAcc = 0;
    _rainKnobKey = "";
    // The alpha batch must hold the pool AND the shower in ONE call (see draw()).
    const need = (MAX + count) * FLOATS_PER;
    if (!_vertA || _vertA.length < need) _vertA = new Float32Array(need);
  }

  // How many of the seeded drops this frame may draw: the shower sheds WITH the
  // rest of the ladder rather than outliving it — one in (1 + autoShed) drops
  // once the governor has shed on its own measurements. Read per frame, so
  // density returns when it recovers.
  function _rainShown() {
    const d = shedDiv();
    return d > 1 ? Math.ceil(_rainN / d) : _rainN;
  }

  // Advance the field. `eye` = the camera position (world, m); the camera
  // velocity is its finite difference, and a cut (> 40 m in one frame) resets
  // it rather than painting one frame of 4 km/h streaks. Render-only: reads the
  // handed-in eye, never writes physics state.
  function rainUpdate(dt, eye, raining) {
    if (!_rainN || !_rainOn || !eye) return;
    if (!(dt > 0)) dt = 0;
    if (dt > 0.1) dt = 0.1;      // tab-back / hitch: don't teleport the field
    _rainRaining = !!raining;
    _rainFed = true;
    if (_rainEyeOk && dt > 0) {
      const dx = eye[0] - _rainEye[0], dy = eye[1] - _rainEye[1], dz = eye[2] - _rainEye[2];
      if (dx * dx + dy * dy + dz * dz < 40 * 40) { _camVel[0] = dx / dt; _camVel[1] = dy / dt; _camVel[2] = dz / dt; }
      else { _camVel[0] = _camVel[1] = _camVel[2] = 0; }
    } else { _camVel[0] = _camVel[1] = _camVel[2] = 0; }
    _rainEye[0] = eye[0]; _rainEye[1] = eye[1]; _rainEye[2] = eye[2];
    _rainEyeOk = true;
    // Drops fall every update, so a parked eye (red-flag stop, pit box, finished
    // car on the TV cam) must still re-expand: cap the staleness at ~30 Hz
    // instead of freezing the streaks until the eye leaves its 2 m cell.
    _rainAcc += dt;
    if (_rainAcc >= 1 / 30) { _rainAcc -= 1 / 30; if (_rainAcc > 1 / 30) _rainAcc = 0; _dirty = true; }
    const LT = _lt();
    // Horizontal drift along WIND DIRECTION, as a fraction of the fall speed
    // (RAIN WIND 0.18 = a ~10° slant); the trees lean the same way.
    const wd = (LT.windDir != null ? LT.windDir : 35) * (Math.PI / 180);
    const wk = LT.rainWind != null ? LT.rainWind : 0.18;
    _windX = Math.cos(wd) * wk; _windZ = Math.sin(wd) * wk;
    const shown = _rainShown();
    // Hidden drops do not advance while shedding; re-scatter only the returning
    // tail on a shed transition so stale offsets never pop into view.
    for (let i = _rainLastShown; i < shown; i++) _rainScatter(i);
    _rainLastShown = shown;
    // Offsets are eye-relative, so the camera's own motion moves every drop the
    // other way: the field stays put in the world and wraps back into the box.
    const mx = _camVel[0] * dt, my = _camVel[1] * dt, mz = _camVel[2] * dt;
    for (let i = 0; i < shown; i++) {
      const s = _rspd[i] * dt;
      let x = _rox[i] + s * _windX - mx, y = _roy[i] - s - my, z = _roz[i] + s * _windZ - mz;
      if (y < -RAIN_DOWN) { y += RAIN_H; x = rnd(RAIN_R); z = rnd(RAIN_R); }
      else if (y > RAIN_UP) y -= RAIN_H;
      if (x > RAIN_R) x -= 2 * RAIN_R; else if (x < -RAIN_R) x += 2 * RAIN_R;
      if (z > RAIN_R) z -= 2 * RAIN_R; else if (z < -RAIN_R) z += 2 * RAIN_R;
      _rox[i] = x; _roy[i] = y; _roz[i] = z;
    }
    _rainDirtyFromEye(eye);
  }

  // Append the shower's quads to the alpha batch at float cursor `p`; returns
  // the new cursor. One drop = 6 vertices of [cornerX, cornerY, x, y, z, r, g,
  // b, size 0, alpha]: the corners are expanded HERE, along the apparent
  // velocity (half-length) and across it (half-width, facing the eye).
  function rainFill(out, p) {
    if (!_rainN || !_rainOn || !_rainEyeOk) return p;
    const LT = _lt();
    // The overlay's per-drop range was 0.16..0.50 (mean 0.33) under a batch
    // alpha of 0.25 (storm) / 0.16 (drizzle); the same mean brightness here.
    const alphaMul = (_rainRaining ? 0.25 : 0.16) / 0.33 * (LT.rainOpacity != null ? LT.rainOpacity : 1);
    // RAIN SPEED SLANT / STRETCH: how much of the camera's velocity reaches the
    // streak's direction and its length. Shipped 0.9 / 2.0 = the physical 1:1.
    const shearW = (LT.rainShearWind != null ? LT.rainShearWind : 0.9) / 0.9;
    const shearL = (LT.rainShearLen != null ? LT.rainShearLen : 2.0) / 2.0;
    const cvx = _camVel[0] * shearW, cvy = _camVel[1] * shearW, cvz = _camVel[2] * shearW;
    const camSpeed = Math.hypot(_camVel[0], _camVel[1], _camVel[2]) * shearL;
    const ex = _rainEye[0], ey = _rainEye[1], ez = _rainEye[2];
    const cr = RAIN_COL[0], cg = RAIN_COL[1], cb = RAIN_COL[2];
    const shown = _rainLastShown;
    for (let i = 0; i < shown; i++) {
      const s = _rspd[i];
      const tx = _rox[i], ty = _roy[i], tz = _roz[i];           // eye → drop
      const dist = Math.hypot(tx, ty, tz);
      if (dist < 0.4) continue;                                 // inside the lens
      // apparent velocity = drop velocity − camera velocity
      const vx = s * _windX - cvx, vy = -s - cvy, vz = s * _windZ - cvz;
      const vm = Math.hypot(vx, vy, vz) || 1;
      const dx = vx / vm, dy = vy / vm, dz = vz / vm;
      // width axis: across the streak AND across the eye ray, so the quad faces the camera
      let rx = dy * tz - dz * ty, ry = dz * tx - dx * tz, rz = dx * ty - dy * tx;
      const rl = Math.hypot(rx, ry, rz);
      if (rl < 1e-6) continue;                                  // streak points at the eye
      rx /= rl; ry /= rl; rz /= rl;
      const halfLen = Math.min(3.0, 0.5 * RAIN_EXPO * _rlen[i] * (s + camSpeed));
      const halfW = 0.014 + dist * 0.0022;                      // ~1 px floor at distance (62° fov, 1080p: 1 px ≈ 0.0011 m per m)
      const a = _ralpha[i] * alphaMul * _clamp01((dist - 0.4) / 1.6);   // fade the drops right at the lens
      if (a <= 0.004) continue;
      const cx = ex + tx, cy = ey + ty, cz = ez + tz;
      for (let v = 0; v < 12; v += 2) {
        const kx = _CORNERS[v], ky = _CORNERS[v + 1];
        out[p++] = kx; out[p++] = ky;
        out[p++] = cx + dx * halfLen * ky + rx * halfW * kx;
        out[p++] = cy + dy * halfLen * ky + ry * halfW * kx;
        out[p++] = cz + dz * halfLen * ky + rz * halfW * kx;
        out[p++] = cr; out[p++] = cg; out[p++] = cb;
        out[p++] = 0; out[p++] = a;                            // size 0: the shader adds nothing to the expanded corner
      }
    }
    return p;
  }

  return { init, clear, count, capacity, update, draw, tyreSmoke, sparks, scrape, kickup, spray,
           flare, flareCount, rainShow, rainSeed, rainUpdate, rainActive, stats, resetStats, markDirty };
})();
Object.freeze(Particles);
