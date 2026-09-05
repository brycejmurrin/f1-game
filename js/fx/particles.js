/* Apex 26 — shared transient-particle pool (tyre smoke, collision sparks, gravel/grass kickup, rain spray) for js/game.js. A fixed CPU pool of camera-facing soft … */
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

const FLOATS_PER = 6 * 10;
let _vertA = null;          // alpha-blended group (smoke / dust / spray)
let _vertB = null;          // additive group (sparks)
const _CORNERS = [-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1];

function init(gfx) {
  Log.info("game", "Particles.init");
  _gfx = gfx;
  // Tight pool on the mobile memory tier: fewer live quads, same behaviour.
  MAX = gfx && gfx.mobileTier ? 96 : 256;
  _px = new Float32Array(MAX); _py = new Float32Array(MAX); _pz = new Float32Array(MAX);
  _vx = new Float32Array(MAX); _vy = new Float32Array(MAX); _vz = new Float32Array(MAX);
  _age = new Float32Array(MAX); _life = new Float32Array(MAX);
  _sz = new Float32Array(MAX); _grw = new Float32Array(MAX);
  _cr = new Float32Array(MAX); _cg = new Float32Array(MAX); _cb = new Float32Array(MAX);
  _a0 = new Float32Array(MAX);
  _drg = new Float32Array(MAX); _grv = new Float32Array(MAX);
  _add = new Uint8Array(MAX);
  _vertA = new Float32Array(MAX * FLOATS_PER);
  _vertB = new Float32Array(MAX * FLOATS_PER);
  _n = 0;
}

function clear() { _n = 0; }
function count() { return _n; }

function mul() {
  if (typeof LightTune !== "undefined" && LightTune.LT && LightTune.LT.particleMul !== undefined)
    return LightTune.LT.particleMul;
  return 1;
}

function rnd(k) { return (Math.random() * 2 - 1) * k; }

function nOf(count) {
  if (!(count > 0)) return 0;
  if (count > 4) count = 4;
  let n = Math.floor(count);
  if (Math.random() < count - n) n++;
  return n;
}

function spawn(x, y, z, vx, vy, vz, life, size, grow, r, g, b, alpha, drag, grav, additive) {
  if (_n >= MAX || !MAX) return;      // pool full → drop (never allocate)
  const i = _n++;
  _px[i] = x; _py[i] = y; _pz[i] = z;
  _vx[i] = vx; _vy[i] = vy; _vz[i] = vz;
  _age[i] = 0; _life[i] = life;
  _sz[i] = size; _grw[i] = grow;
  _cr[i] = r; _cg[i] = g; _cb[i] = b;
  _a0[i] = alpha;
  _drg[i] = drag; _grv[i] = grav;
  _add[i] = additive ? 1 : 0;
}

function tyreSmoke(x, y, z, bvx, bvz, inten, count) {
  const m = mul(); if (m <= 0) return;
  for (let n = nOf((count === undefined ? 1 : count) * Math.min(m, 2)); n > 0; n--) {
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
  let n = Math.round(count * Math.min(m, 2));
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

function kickup(x, y, z, bvx, bvz, r, g, b, count) {
  const m = mul(); if (m <= 0) return;
  for (let n = nOf((count === undefined ? 1 : count) * Math.min(m, 2)); n > 0; n--) {
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

function spray(x, y, z, bvx, bvz, strength, count) {
  const m = mul(); if (m <= 0) return;
  for (let n = nOf((count === undefined ? 1 : count) * Math.min(m, 2)); n > 0; n--) {
    spawn(x + rnd(0.35), y + rnd(0.10), z + rnd(0.35),
      bvx + rnd(1.2), 0.9 + Math.random() * 1.5, bvz + rnd(1.2),
      0.50 + Math.random() * 0.35,
      0.35 + Math.random() * 0.15, 3.4,            // starts small, balloons fast
      0.74, 0.77, 0.82,
      0.12 + 0.24 * strength,
      2.1, -0.6, 0);
  }
}

function update(dt) {
  if (!_n || !(dt > 0)) return;
  if (dt > 0.1) dt = 0.1;      // tab-back / hitch: don't teleport particles
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
  if (!_gfx || !_gfx.drawParticles || !_n) return;
  let pa = 0, pb = 0;
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
  if (pa) _gfx.drawParticles(_vertA, pa, false);
  if (pb) _gfx.drawParticles(_vertB, pb, true);
}

let _rainCanvas = null, _rainCtx = null, _rainDrops = [];

const _clamp01 = (v) => Math.max(0, Math.min(1, v));
function _lt() {
  return (typeof LightTune !== "undefined" && LightTune.LT) || {};
}

function _rainEnsure() {
  if (_rainCanvas) return;
  _rainCanvas = document.createElement("canvas");
  _rainCanvas.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:4;display:none;";
  document.body.appendChild(_rainCanvas);
  _rainCtx = _rainCanvas.getContext("2d");
}

function rainShow(on) {
  _rainEnsure();
  if (!on && _rainCtx) {
    _rainCtx.clearRect(0, 0, _rainCanvas.width, _rainCanvas.height);
  }
  _rainCanvas.style.display = on ? "block" : "none";
}

function rainActive() { return _rainDrops.length > 0; }

function rainSeed(drizzle) {
  _rainEnsure();
  const LT = _lt();
  _rainCanvas.width = window.innerWidth;
  _rainCanvas.height = window.innerHeight;
  const dzCount = LT.drizzleCount != null ? LT.drizzleCount : 0.3;
  const dzLen   = LT.drizzleLen   != null ? LT.drizzleLen   : 0.5;
  const dzSpeed = LT.drizzleSpeed != null ? LT.drizzleSpeed : 0.6;
  // TIERED, like the 3D pool at the top of this file (MAX 96 vs 256) — and for
  // a stronger reason, because these drops are drawn by the CPU. Every frame
  // this clears a full-viewport 2D canvas, walks ~500 drops emitting a moveTo +
  // lineTo each, strokes them, and hands the compositor a second full-screen
  // surface to blend over #game. LT.rainCount is 450-650 across the wet presets.
  //
  // It also survives the ENTIRE governor ladder: no PerfGov.tier() gate, no
  // mobileTier gate, so it is still running at full count on a device that has
  // shed lamp shadows, SSR, god rays and the whole heavy post stack. That is the
  // wrong shape — the cheapest thing to keep should not be the last thing to go.
  const wetCap = (_gfx && _gfx.mobileTier) ? 140 : Infinity;
  const count = Math.min(wetCap, Math.round(LT.rainCount * (drizzle ? dzCount : 1)));
  _rainDrops = Array.from({ length: count }, () => ({
    x: Math.random() * _rainCanvas.width,
    y: Math.random() * _rainCanvas.height,
    len: (14 + Math.random() * 22) * LT.rainStreak * (drizzle ? dzLen : 1),
    speed: (380 + Math.random() * 360) * (drizzle ? dzSpeed : 1) * (LT.rainSpeed != null ? LT.rainSpeed : 1),
    opacity: 0.16 + Math.random() * 0.34,
  }));
}

function rainDraw(dt, speed, raining) {
  const LT = _lt();
  // The backing store was sized once at rainSeed and never again, while the
  // element is CSS 100%x100% — rotating a 393x852 phone mid-shower stretched
  // the stale bitmap 2.17x/0.46x and every streak smeared. A per-frame
  // integer compare is free; on mismatch resize (which clears) and remap the
  // live drops proportionally so the shower doesn't visibly restart.
  if (_rainCanvas.width !== window.innerWidth || _rainCanvas.height !== window.innerHeight) {
    const ow = _rainCanvas.width || 1, oh = _rainCanvas.height || 1;
    _rainCanvas.width = window.innerWidth;
    _rainCanvas.height = window.innerHeight;
    const sx = _rainCanvas.width / ow, sy = _rainCanvas.height / oh;
    for (const d of _rainDrops) { d.x *= sx; d.y *= sy; }
  }
  const w = _rainCanvas.width, h = _rainCanvas.height;
  _rainCtx.clearRect(0, 0, w, h);
  _rainCtx.lineWidth = 1;
  _rainCtx.strokeStyle = "#afc8e8";
  _rainCtx.globalAlpha = _clamp01((raining ? 0.25 : 0.16) * (LT.rainOpacity != null ? LT.rainOpacity : 1));   // ~mean of the 0.16..0.50 per-drop range
  // SPEED-REACTIVE streaks: at speed the rain shears toward the camera's motion
  // and stretches into driving streaks (apparent velocity = fall + car speed).
  // Render-only — reads the handed-in speed, never writes physics state.
  const vk = _clamp01((speed || 0) / 90);
  const wind = LT.rainWind + vk * (LT.rainShearWind != null ? LT.rainShearWind : 0.9);
  const lenMul = 1 + vk * (LT.rainShearLen != null ? LT.rainShearLen : 2);
  _rainCtx.beginPath();
  for (const d of _rainDrops) {
    d.y += d.speed * dt;
    d.x += d.speed * dt * wind;
    if (d.y - d.len > h || d.x > w || d.x < 0) { d.y = -d.len; d.x = Math.random() * w; }
    _rainCtx.moveTo(d.x, d.y);
    _rainCtx.lineTo(d.x + d.len * lenMul * wind, d.y + d.len * lenMul);
  }
  _rainCtx.stroke();
  _rainCtx.globalAlpha = 1;
}

// Lightning veil: drawn on top of rain drops so it bleaches the rain too.
function rainFlash(alpha) {
  _rainCtx.save();
  _rainCtx.globalAlpha = alpha;
  _rainCtx.fillStyle = "#dcecff";
  _rainCtx.fillRect(0, 0, _rainCanvas.width, _rainCanvas.height);
  _rainCtx.restore();
}

return { init, clear, count, update, draw, tyreSmoke, sparks, kickup, spray,
         rainShow, rainSeed, rainDraw, rainFlash, rainActive };
})();
