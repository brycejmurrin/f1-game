/* Apex 26 — Droplets: rain on the lens / visor for the ONBOARD cameras (cockpit, hood, visor, helmet, T-cam).
 * A renderer-agnostic 2D overlay: the static <canvas id="fx-droplets"> in index.html sits above #game and
 * #game-soft (z-index 2, css/tokens.css) and below the HUD, so GLX, TLX and WGX all get the same water and
 * no backend pays a pass for it. game.js calls tick() once per rendered frame; everything else is here.
 *
 * Water uses a cached atlas of three asymmetric, translucent menisci rather than bright rings.
 * This is illustrative water shading, not scene-sampled droplet refraction. The shield itself — its eye-port,
 * the light it adds and its rim bend — is js/fx/visor-optics.js, ticked from here. No per-drop gradients or
 * WebGL back-buffer reads.
 *
 * Helmet motion balances gravity, adhesion and speed-squared airflow: stationary beads fall straight
 * down; air flowing around the curved visor carries them sideways as speed rises. Large beads release
 * more readily. Helmet impacts spread on contact, settle, then release into runoff. Reduced motion keeps
 * fewer stationary beads with fading only. GRAPHICS LOW, non-onboard
 * cameras and photo mode disable water; collected helmet water drains after the rain stops.
 * Visual only — nothing here changes the racing simulation. */
const Droplets = (function () {
  "use strict";

  const CAP_PHONE = 40, CAP_DESK = 90;   // live drops
  const RAIN_MIN = 0.5;                  // frame.rain: 1 raining, 0.35 drizzle tier, 0 dry (game.js ramp)
  const RATE_RAIN = 18, RATE_STORM = 34; // drops/s at full rain (storm is the heavier tier)
  const STRETCH_MAX = 7;               // maximum length multiplier under strong airflow
  const DPR_MAX_DESK = 1.5, DPR_MAX_PHONE = 1;

  let _cv = null, _ctx = null, _sprite = null, _looked = false;
  let _w = 0, _h = 0, _dpr = 1, _shown = false, _mobile = null;
  let _n = 0, _acc = 0, _spriteReflection = 1, _spriteHelmet = false;
  // Struct-of-arrays, sized for the desktop cap once.
  const _x = new Float32Array(CAP_DESK), _y = new Float32Array(CAP_DESK);    // 0..1 of the viewport
  const _r = new Float32Array(CAP_DESK);                                       // radius, fraction of min(w, h)
  const _age = new Float32Array(CAP_DESK), _life = new Float32Array(CAP_DESK);
  const _hit = new Float32Array(CAP_DESK); // seconds since contact; independent of runoff / lifetime burn
  const _vx = new Float32Array(CAP_DESK), _vy = new Float32Array(CAP_DESK);    // viewport fractions / s
  const _a = new Float32Array(CAP_DESK), _variant = new Uint8Array(CAP_DESK);

  function _helmet() {
    return typeof CockpitOpts !== "undefined" && typeof document !== "undefined"
      && document.body && document.body.hasAttribute("data-helmet-cam") && CockpitOpts.visor() !== "off";
  }

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
    _sprite = _paintSprite(_spriteReflection);
    Log.info("game", "Droplets: lens overlay ready" + (_sprite ? "" : " (no sprite: arc fallback)"));
    return _cv;
  }

  // Three noncircular menisci. The interior stays transparent; only a thin,
  // incomplete edge catches light. The atlas is rebuilt only on a settings change.
  function _paintSprite(reflection = 1, helmet = false) {
    if (typeof document === "undefined" || !document.createElement) return null;
    const s = document.createElement("canvas");
    if (!s || !s.getContext) return null;
    s.width = 192; s.height = 64;
    const g = s.getContext("2d");
    if (!g || !g.createLinearGradient) return null;
    for (let v = 0; v < 3; v++) {
      g.save(); g.translate(v * 64, 0);
      const edge = g.createLinearGradient(10, 8, 48, 58);
      edge.addColorStop(0, "rgba(210,222,232," + (helmet ? 0.42 : 0.28) * reflection + ")");
      edge.addColorStop(0.28, "rgba(160,180,198,0)");
      edge.addColorStop(0.72, "rgba(8,15,23," + (helmet ? 0.7 : 0.32) + ")");
      edge.addColorStop(1, "rgba(196,211,224," + (helmet ? 0.28 : 0.16) * reflection + ")");
      g.beginPath(); g.moveTo(29, 9 + v * 2);
      g.bezierCurveTo(13 - v, 10, 12, 29, 16 + v, 42);
      g.bezierCurveTo(20, 58, 44, 59 - v, 48, 43);
      g.bezierCurveTo(55, 25, 44 - v * 2, 7, 29, 9 + v * 2);
      g.closePath();
      g.fillStyle = "rgba(10,18,26," + (helmet ? 0.09 : 0.045) + ")"; g.fill();
      g.strokeStyle = edge; g.lineWidth = helmet ? 7 : 3.5; g.stroke();
      // A narrow, soft crescent, not a white circular specular dot.
      g.beginPath(); g.moveTo(21, 16 + v);
      g.bezierCurveTo(17, 21, 16, 25, 17, 30);
      g.strokeStyle = "rgba(222,232,240," + (helmet ? 0.55 : 0.25) * reflection + ")";
      g.lineWidth = helmet ? 4.5 : 2.5; g.stroke(); g.restore();
    }
    return s;
  }

  function _resize() {
    if (typeof window === "undefined") return;
    const dpr = Math.min(window.devicePixelRatio || 1, _mob() ? DPR_MAX_PHONE : DPR_MAX_DESK);
    const w = Math.max(1, Math.round((window.innerWidth || 1) * dpr)), h = Math.max(1, Math.round((window.innerHeight || 1) * dpr));
    if (w === _w && h === _h && dpr === _dpr) return;
    _w = w; _h = h; _dpr = dpr;
    _cv.width = w; _cv.height = h;
    return true;
  }

  function _show(on) {
    if (on === _shown) return;
    _shown = on;
    if (_cv) _cv.hidden = !on;
    if (!on) { _n = 0; _acc = 0; if (_ctx && _w) _ctx.clearRect(0, 0, _w, _h); }
  }

  function _spawn(reduced, helmet) {
    const i = _n++;
    _x[i] = 0.04 + Math.random() * 0.92;
    _y[i] = 0.04 + Math.random() * 0.80;   // not the very bottom: the cockpit/HUD sits there
    _r[i] = (helmet ? 0.005 : 0.0025) + Math.random() * Math.random() * (helmet ? 0.018 : 0.009);
    _variant[i] = Math.floor(Math.random() * 3);
    _age[i] = _hit[i] = 0;
    _life[i] = reduced ? 1.8 + Math.random() * 1.6 : helmet ? 12 + Math.random() * 10 : 2.5 + Math.random() * 3.5;
    _vx[i] = _vy[i] = 0;
    _a[i] = 0.55 + Math.random() * 0.35;
  }

  function _kill(i) {
    const l = --_n;
    if (i === l) return;
    _x[i] = _x[l]; _y[i] = _y[l]; _r[i] = _r[l]; _age[i] = _age[l]; _life[i] = _life[l];
    _vx[i] = _vx[l]; _vy[i] = _vy[l]; _a[i] = _a[l]; _variant[i] = _variant[l];
    _hit[i] = _hit[l];
  }

  // Relative aerodynamic pressure at standard speed vs (m/s, vStd): proportional to v², capped at 75 m/s.
  function _air(vs) { const v = Math.max(0, Math.min(1, vs / 75)); return v * v; }

  function _step(dt, vs, reduced, runoff, helmet, rain) {
    const air = reduced ? 0 : _air(vs);
    for (let i = 0; i < _n; ) {
      _hit[i] += dt;
      _age[i] += dt * runoff;
      // Blown off faster at speed: a drop's life burns 1 + 2·air times as fast.
      if (!reduced) _age[i] += dt * 2 * air * runoff;
      if (_age[i] >= _life[i]) { _kill(i); continue; }
      if (!reduced) {
        // Surface tension pins small beads more strongly than large beads.
        // Gravity and aerodynamic pressure compete; pressure scales with v².
        const release = Math.min(1, _r[i] / 0.010);
        if (helmet && rain >= RAIN_MIN) _r[i] = Math.min(0.023, _r[i] + dt * rain * 0.00035);
        const push = air * (0.18 + 0.82 * release) * runoff;
        const tx = (_x[i] - 0.5) * 2.8 * push;
        const ty = helmet ? ((0.025 + 0.085 * release) * (1 - 0.8 * air) - 0.035 * air) * runoff
          : -0.9 * push + (1 - air) * 0.015 * release;
        // Exponential damping keeps the motion stable across frame rates.
        const contact = helmet ? Math.max(0, Math.min(1, (_hit[i] - 0.14) / 0.28)) : 1;
        const k = 1 - Math.exp(-dt * 7 * contact);
        _vx[i] += (tx - _vx[i]) * k; _vy[i] += (ty - _vy[i]) * k;
        _x[i] += _vx[i] * dt; _y[i] += _vy[i] * dt;
        if (_x[i] < -0.05 || _x[i] > 1.05 || _y[i] < -0.05 || _y[i] > 1.05) { _kill(i); continue; }
      }
      i++;
    }
  }

  function _draw(reduced, helmet) {
    const g = _ctx;
    g.clearRect(0, 0, _w, _h);
    const m = Math.min(_w, _h);
    for (let i = 0; i < _n; i++) {
      const t = _age[i] / _life[i];
      // Fade in fast, out slow (the reduced path's whole motion is this envelope).
      const env = reduced ? Math.min(1, t * 4) * Math.min(1, (1 - t) * 3)
        : (helmet ? Math.min(1, (_hit[i] + 0.025) / 0.04) : Math.min(1, _age[i] / 0.07)) * Math.min(1, (_life[i] - _age[i]) / 0.7);
      const a = _a[i] * env;
      if (a <= 0.01) continue;
      const impact = helmet && !reduced ? Math.max(0, 1 - _hit[i] / 0.18) : 0;
      const rad = _r[i] * m * (1 + 0.65 * Math.sin(Math.PI * (1 - impact))), cx = _x[i] * _w, cy = _y[i] * _h;
      const sp = Math.hypot(_vx[i], _vy[i]);
      const st = reduced ? 1 : Math.min(STRETCH_MAX, 1 + sp * 11);
      const narrow = rad / Math.sqrt(st);
      g.globalAlpha = a;
      if (_sprite) {
        // Short asymmetric satellite beads mark a strike ON the shield, not a white ring in the world.
        if (impact > 0.01) {
          const spread = rad * (1.2 + (1 - impact) * 2), bead = rad * 0.32;
          g.globalAlpha = a * impact * 0.65;
          for (let s = 0; s < 3; s++) {
            const angle = _variant[i] * 1.7 + s * 2.1;
            g.drawImage(_sprite, ((s + _variant[i]) % 3) * 64, 0, 64, 64,
              cx + Math.cos(angle) * spread - bead, cy + Math.sin(angle) * spread * 0.65 - bead, bead * 2, bead * 2);
          }
          g.globalAlpha = a;
        }
        if (st > 1.05) {
          g.save(); g.translate(cx, cy); g.rotate(Math.atan2(_vy[i] * _h, _vx[i] * _w) - Math.PI / 2);
          g.drawImage(_sprite, _variant[i] * 64, 0, 64, 64, -narrow, -rad * st, narrow * 2, rad * 2 * st);
          g.restore();
        } else g.drawImage(_sprite, _variant[i] * 64, 0, 64, 64, cx - rad, cy - rad, rad * 2, rad * 2);
      } else {
        g.fillStyle = "rgba(160,178,194,0.09)";
        g.beginPath(); g.arc(cx, cy, rad, 0, Math.PI * 2); g.fill();
      }
    }
    g.globalAlpha = 1;
  }

  /** Once per rendered frame. on: an onboard camera, racing, not photo mode. rain: frame.rain (0..1).
   *  storm: the heavier tier. vs: the viewed car's vStd speed (m/s). reduced: prefers-reduced-motion.
   *  dt 0 (paused) freezes the drops in place. */
  function tick(dt, on, rain, storm, vs, reduced) {
    // The shield's own optics ride this heartbeat: the eye-port, the added light and the rim bend (js/fx/visor-optics.js).
    if (typeof VisorOptics !== "undefined") VisorOptics.tick(dt, on, vs, reduced);
    const helmet = _helmet();
    const amount = helmet ? CockpitOpts.visorRain() : "normal";
    const runoff = helmet ? (CockpitOpts.visorRunoff() === "slow" ? 0.45 : CockpitOpts.visorRunoff() === "fast" ? 2.1 : 1) : 1;
    // Spawn only at RAIN_MIN+ (drizzle 0.35 wets the road, not the lens). Keep the
    // overlay while live drops remain so a stopping shower drains instead of wiping.
    if (!(on && !_low() && amount !== "off" && (rain >= RAIN_MIN || _n > 0))) { _show(false); return; }
    if (!_lookup()) return;
    _show(true);
    const resized = _resize();
    const reflection = helmet ? CockpitOpts.visorReflections() : "light";
    const strength = reflection === "off" ? 0 : reflection === "medium" ? 1.4 : reflection === "strong" ? 1.8 : 1;
    const changed = strength !== _spriteReflection || helmet !== _spriteHelmet;
    if (changed) { _spriteReflection = strength; _spriteHelmet = helmet; _sprite = _paintSprite(strength, helmet); }
    if (!(dt > 0)) { if (resized || changed) _draw(!!reduced, helmet); return; }   // paused: the last frame stays on the glass
    if (dt > 0.1) dt = 0.1;
    _step(dt, vs || 0, !!reduced, runoff, helmet, rain);
    const c = cap(_mob(), !!reduced);
    _acc += rate(rain, storm, !!reduced) * dt * (amount === "light" ? 0.4 : amount === "heavy" ? 1.8 : 1);
    while (_acc >= 1) { _acc -= 1; if (_n < c) _spawn(!!reduced, helmet); }
    _draw(!!reduced, helmet);
    if (!_n && rain < RAIN_MIN) _show(false);
  }

  // Race exit / results entry: the visor's light layer goes down with the water (render() stops ticking it off-race).
  function clear() { if (typeof VisorOptics !== "undefined") VisorOptics.clear(); _show(false); }
  function stats() { return { n: _n, shown: _shown, cap: cap(_mob(), false), w: _w, h: _h, first: _n ? { x: _x[0], y: _y[0], radius: _r[0], age: _age[0], hitAge: _hit[0], vx: _vx[0], vy: _vy[0] } : null }; }

  return { tick, clear, stats, rate, cap };
})();
Object.freeze(Droplets);
