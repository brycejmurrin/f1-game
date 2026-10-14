/* Apex 26 — Droplets: rain on the lens / visor for the ONBOARD cameras (cockpit, hood, visor, helmet, T-cam).
 * A renderer-agnostic 2D overlay: the static <canvas id="fx-droplets"> in index.html sits above #game and
 * #game-soft (z-index 2, css/overlays.css) and below the HUD, so GLX, TLX and WGX all get the same water and
 * no backend pays a pass for it. game.js calls tick() once per rendered frame; everything else is here.
 *
 * Look, after the MotoGP lens drops (Shawn Hargreaves, "raindrops keep falling on my lens",
 * https://www.shawnhargreaves.com/blog/motogp-raindrops-keep-falling-on-my-lens.html): each drop is a
 * tiny lens that shows a flipped, blurred copy of the scene behind it. That game sampled a downscaled
 * copy of the frame; a 2D overlay cannot read a WebGL back buffer cheaply, so the refraction is FAKED
 * the way the SDF rain-on-glass shaders shade it (https://godotshaders.com/shader/rain-on-glass/): a
 * darker centre, a bright rim, a sky-bright lower half (the flipped sky) and one specular glint. One
 * sprite is painted once and stamped per drop with drawImage (no per-drop gradients: phones stay cheap).
 *
 * Motion: at speed the airflow pushes drops UP and OUT from the screen centre, bigger drops first
 * (they stick less), and stretches them into short streaks; parked, they sag slowly down. Under
 * REDUCED MOTION drops never move or stretch — fewer of them fade in and out where they landed.
 * Off: GRAPHICS LOW, any non-onboard camera, photo mode, and anything below falling rain (the
 * drizzle tier only wets the road). Visual only — Math.random is fine, nothing here touches the sim. */
const Droplets = (function () {
  "use strict";

  const CAP_PHONE = 40, CAP_DESK = 90;   // live drops
  const RAIN_MIN = 0.5;                  // frame.rain: 1 raining, 0.35 drizzle tier, 0 dry (game.js ramp)
  const RATE_RAIN = 18, RATE_STORM = 34; // drops/s at full rain (storm is the heavier tier)
  const STRETCH_MAX = 3.2;               // streak length / width at full airflow
  const DPR_MAX_DESK = 1.5, DPR_MAX_PHONE = 1;

  let _cv = null, _ctx = null, _sprite = null, _looked = false;
  let _w = 0, _h = 0, _dpr = 1, _shown = false, _mobile = null;
  let _n = 0, _acc = 0;
  // Struct-of-arrays, sized for the desktop cap once.
  const _x = new Float32Array(CAP_DESK), _y = new Float32Array(CAP_DESK);    // 0..1 of the viewport
  const _r = new Float32Array(CAP_DESK);                                       // radius, fraction of min(w, h)
  const _age = new Float32Array(CAP_DESK), _life = new Float32Array(CAP_DESK);
  const _vx = new Float32Array(CAP_DESK), _vy = new Float32Array(CAP_DESK);    // viewport fractions / s
  const _a = new Float32Array(CAP_DESK);

  function _mob() {
    if (_mobile === null) {
      _mobile = (typeof GLX !== "undefined" && !!GLX.isMobile)
        || (typeof matchMedia === "function" && !!matchMedia("(pointer: coarse)").matches);
    }
    return _mobile;
  }
  function _low() { return typeof GfxQuality !== "undefined" && GfxQuality.current && GfxQuality.current() === "low"; }

  /** Drops per second for a frame.rain value (0 below falling rain); storm is heavier. */
  function rate(rain, storm, reduced) {
    if (!(rain >= RAIN_MIN)) return 0;
    const k = Math.min(1, (rain - RAIN_MIN) / (1 - RAIN_MIN));
    return (storm ? RATE_STORM : RATE_RAIN) * (0.3 + 0.7 * k) * (reduced ? 0.4 : 1);
  }
  /** Live-drop ceiling: phones 40, desktop 90; halved under reduced motion. */
  function cap(mobile, reduced) {
    const c = mobile ? CAP_PHONE : CAP_DESK;
    return reduced ? (c >> 1) : c;
  }

  function _lookup() {
    if (_looked) return _cv;
    _looked = true;
    _cv = (typeof document !== "undefined" && document.getElementById) ? document.getElementById("fx-droplets") : null;
    if (!_cv && typeof document !== "undefined" && document.createElement) {
      // No static element in this shell: build it right after #game, the
      // #game-soft pattern (js/render/glx/glx.js ensureSoftDisplay); the
      // css/tokens.css #fx-droplets rule places it either way.
      const game = document.getElementById ? document.getElementById("game") : null;
      if (game && game.parentNode) {
        _cv = document.createElement("canvas");
        _cv.id = "fx-droplets";
        _cv.setAttribute("aria-hidden", "true");
        _cv.hidden = true;
        game.parentNode.insertBefore(_cv, game.nextSibling);
      }
    }
    _ctx = _cv && _cv.getContext ? _cv.getContext("2d") : null;
    if (!_ctx) { _cv = null; return null; }
    _sprite = _paintSprite();
    Log.info("game", "Droplets: lens overlay ready" + (_sprite ? "" : " (no sprite: arc fallback)"));
    return _cv;
  }

  // The one drop: 64 px, painted once. Dark core, bright rim, light lower half, glint up-left.
  function _paintSprite() {
    if (typeof document === "undefined" || !document.createElement) return null;
    const s = document.createElement("canvas");
    if (!s || !s.getContext) return null;
    s.width = s.height = 64;
    const g = s.getContext("2d");
    if (!g || !g.createRadialGradient) return null;
    const body = g.createRadialGradient(32, 30, 4, 32, 32, 31);
    body.addColorStop(0, "rgba(20,26,34,0.30)");      // the darker centre: the refracted road
    body.addColorStop(0.62, "rgba(70,82,96,0.22)");
    body.addColorStop(0.86, "rgba(235,242,250,0.55)"); // the bright rim
    body.addColorStop(1, "rgba(235,242,250,0)");       // soft edge
    g.fillStyle = body; g.beginPath(); g.arc(32, 32, 31, 0, Math.PI * 2); g.fill();
    const sky = g.createLinearGradient(0, 30, 0, 60);   // the flipped sky in the lower half
    sky.addColorStop(0, "rgba(200,215,230,0)"); sky.addColorStop(1, "rgba(200,215,230,0.28)");
    g.fillStyle = sky; g.beginPath(); g.arc(32, 32, 24, 0, Math.PI); g.fill();
    g.fillStyle = "rgba(255,255,255,0.75)";            // specular glint
    g.beginPath(); g.arc(24, 22, 4.5, 0, Math.PI * 2); g.fill();
    return s;
  }

  function _resize() {
    if (typeof window === "undefined") return;
    const dpr = Math.min(window.devicePixelRatio || 1, _mob() ? DPR_MAX_PHONE : DPR_MAX_DESK);
    const w = Math.max(1, Math.round((window.innerWidth || 1) * dpr)), h = Math.max(1, Math.round((window.innerHeight || 1) * dpr));
    if (w === _w && h === _h && dpr === _dpr) return;
    _w = w; _h = h; _dpr = dpr;
    _cv.width = w; _cv.height = h;
  }

  function _show(on) {
    if (on === _shown) return;
    _shown = on;
    if (_cv) _cv.hidden = !on;
    if (!on) { _n = 0; _acc = 0; if (_ctx && _w) _ctx.clearRect(0, 0, _w, _h); }
  }

  function _spawn(reduced) {
    const i = _n++;
    _x[i] = 0.04 + Math.random() * 0.92;
    _y[i] = 0.04 + Math.random() * 0.80;   // not the very bottom: the cockpit/HUD sits there
    _r[i] = 0.006 + Math.random() * Math.random() * 0.020;
    _age[i] = 0;
    _life[i] = reduced ? 1.8 + Math.random() * 1.6 : 2.5 + Math.random() * 3.5;
    _vx[i] = _vy[i] = 0;
    _a[i] = 0.55 + Math.random() * 0.45;
  }

  function _kill(i) {
    const l = --_n;
    if (i === l) return;
    _x[i] = _x[l]; _y[i] = _y[l]; _r[i] = _r[l]; _age[i] = _age[l]; _life[i] = _life[l];
    _vx[i] = _vx[l]; _vy[i] = _vy[l]; _a[i] = _a[l];
  }

  // Airflow at standard speed vs (m/s, vStd): 0 parked → 1 by ~70 m/s.
  function _air(vs) { return Math.max(0, Math.min(1, (vs - 8) / 62)); }

  function _step(dt, vs, reduced) {
    const air = reduced ? 0 : _air(vs);
    for (let i = 0; i < _n; ) {
      _age[i] += dt;
      // Blown off faster at speed: a drop's life burns 1 + 2·air times as fast.
      if (!reduced) _age[i] += dt * 2 * air;
      if (_age[i] >= _life[i]) { _kill(i); continue; }
      if (!reduced) {
        // Bigger drops break away first; the flow fans out from the screen centre, up and sideways.
        const stick = Math.min(1, _r[i] / 0.02);
        const push = air * (0.25 + 0.75 * stick);
        const tx = (_x[i] - 0.5) * 1.4 * push, ty = -0.9 * push + (1 - air) * 0.015 * stick;   // parked: a slow sag
        const k = Math.min(1, dt * 6);
        _vx[i] += (tx - _vx[i]) * k; _vy[i] += (ty - _vy[i]) * k;
        _x[i] += _vx[i] * dt; _y[i] += _vy[i] * dt;
        if (_x[i] < -0.05 || _x[i] > 1.05 || _y[i] < -0.05 || _y[i] > 1.05) { _kill(i); continue; }
      }
      i++;
    }
  }

  function _draw(reduced) {
    const g = _ctx;
    g.clearRect(0, 0, _w, _h);
    const m = Math.min(_w, _h);
    for (let i = 0; i < _n; i++) {
      const t = _age[i] / _life[i];
      // Fade in fast, out slow (the reduced path's whole motion is this envelope).
      const env = Math.min(1, t * (reduced ? 4 : 12)) * Math.min(1, (1 - t) * (reduced ? 3 : 4));
      const a = _a[i] * env;
      if (a <= 0.01) continue;
      const rad = _r[i] * m, cx = _x[i] * _w, cy = _y[i] * _h;
      const sp = Math.hypot(_vx[i], _vy[i]);
      const st = reduced ? 1 : Math.min(STRETCH_MAX, 1 + sp * 4);
      g.globalAlpha = a;
      if (_sprite) {
        if (st > 1.05) {
          g.save(); g.translate(cx, cy); g.rotate(Math.atan2(_vy[i], _vx[i]) + Math.PI / 2);
          g.drawImage(_sprite, -rad, -rad * st, rad * 2, rad * 2 * st);
          g.restore();
        } else g.drawImage(_sprite, cx - rad, cy - rad, rad * 2, rad * 2);
      } else {
        g.fillStyle = "rgba(220,230,240,0.35)";
        g.beginPath(); g.arc(cx, cy, rad, 0, Math.PI * 2); g.fill();
      }
    }
    g.globalAlpha = 1;
  }

  /** Once per rendered frame. on: an onboard camera, racing, not photo mode. rain: frame.rain (0..1).
   *  storm: the heavier tier. vs: the viewed car's vStd speed (m/s). reduced: prefers-reduced-motion.
   *  dt 0 (paused) freezes the drops in place. */
  function tick(dt, on, rain, storm, vs, reduced) {
    if (!(on && !_low() && rain >= RAIN_MIN * 0.5)) { _show(false); return; }   // a fading shower keeps its drops
    if (!_lookup()) return;
    _show(true);
    _resize();
    if (!(dt > 0)) return;   // paused: the last frame stays on the glass
    if (dt > 0.1) dt = 0.1;
    _step(dt, vs || 0, !!reduced);
    const c = cap(_mob(), !!reduced);
    _acc += rate(rain, storm, !!reduced) * dt;
    while (_acc >= 1) { _acc -= 1; if (_n < c) _spawn(!!reduced); }
    _draw(!!reduced);
  }

  function clear() { _show(false); }
  function stats() { return { n: _n, shown: _shown, cap: cap(_mob(), false), w: _w, h: _h }; }
  /** Tests: forget the cached canvas / device class (a new stub DOM). */
  function _reset() { _looked = false; _cv = _ctx = _sprite = null; _mobile = null; _n = 0; _acc = 0; _shown = false; _w = _h = 0; }

  return { tick, clear, stats, rate, cap, RAIN_MIN, _reset };
})();
Object.freeze(Droplets);
