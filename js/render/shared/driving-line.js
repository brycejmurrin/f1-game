"use strict";
window.DrivingLine = (function () {
  const STRIDE = 7;
  const STEP = 2.5;
  const LOOK = 60;
  const HALF_W = 0.75;
  const DEFAULTS = Object.freeze({ latMax: 22, brake: 22, brakeMul: 0.85, accel: 7, vTop: 72, grip: 1 });
  const LIFT = 0.03;
  const MODES = ["off", "corner", "full"];
  const KMIN = 1 / 400;
  const LEAD_OUT = 60;
  const FADE = 35;

  let mode = "full";
  const cache = { id: null, verts: null, count: 0, dirty: false, v: null, zone: null, n: 0, step: STEP };

  const clamp = M4.clamp;

  function setMode(m) { mode = MODES.includes(m) ? m : "off"; return mode; }
  function getMode() { return mode; }
  let photo = null;
  function setPhoto(v) { photo = v == null ? null : !!v; return photo; }
  function shown() { return photo === null ? mode !== "off" : photo; }
  function drawMode() { return photo === true && mode === "off" ? "full" : photo === false ? "off" : mode; }
  const AMBER = [1.00, 0.72, 0.10], RED = [1.00, 0.12, 0.10];
  const PALETTES = Object.freeze([
    ["f1", "F1 GREEN", [0.10, 0.95, 0.35], AMBER, RED],
    ["cyan", "CYAN", [0.10, 0.85, 1.00], AMBER, RED],
    ["blue", "BLUE", [0.25, 0.45, 1.00], AMBER, RED],
    ["white", "WHITE", [0.92, 0.95, 1.00], AMBER, RED],
    ["purple", "PURPLE", [0.62, 0.35, 1.00], AMBER, RED],
    ["pink", "PINK", [1.00, 0.35, 0.80], AMBER, RED],
    ["safe", "COLOUR-BLIND", [0.392, 0.561, 1.000], [0.996, 0.380, 0.000], [0.863, 0.149, 0.498]],
  ].map(([id, label, onPace, lift, brake]) => Object.freeze({ id, label,
    onPace: Object.freeze(onPace.slice()), lift: Object.freeze(lift.slice()), brake: Object.freeze(brake.slice()) })));
  let palette = "f1";
  const _cols = new Float32Array(9);
  function setPalette(p) {
    const e = PALETTES.find((r) => r.id === p) || PALETTES[0];
    palette = e.id;
    _cols.set(e.onPace, 0); _cols.set(e.lift, 3); _cols.set(e.brake, 6);
    return palette;
  }
  setPalette("f1");
  function getPalette() { return palette; }
  let opacity = "normal";
  const OPACITIES = [["subtle", 0.65], ["normal", 1], ["solid", 1.35]];
  let _opMul = 1;
  function setOpacity(o) {
    opacity = OPACITIES.some((r) => r[0] === o) ? o : "normal";
    _opMul = (OPACITIES.find((r) => r[0] === opacity) || OPACITIES[1])[1];
    return opacity;
  }
  function getOpacity() { return opacity; }
  function opacityMul() { return _opMul; }

  function nodeBank(bp, hw, k, o) {
    const lift = bp.lift[k];
    if (!(lift > 0)) return 0;
    const w = hw[k];
    const frac = clamp((bp.bsign[k] * o + w) / (2 * w), 0, 1);
    return lift * (frac - 0.5);
  }
  function bankOffset(track, s, o) {
    const bp = track && track.bankP;
    if (!bp) return 0;
    const n = track.n, L = track.total;
    s %= L; if (s < 0) s += L;
    const fi = s / L * n;
    const i = Math.floor(fi) % n, j = (i + 1) % n, f = fi - Math.floor(fi);
    const a = nodeBank(bp, track.hw, i, o), b = nodeBank(bp, track.hw, j, o);
    return a + (b - a) * f;
  }

  function lateral(api, s, hw) {
    if (api.lineAt) {
      const ln = api.lineAt(s);
      return ln ? clamp(ln.x, -(hw - 0.6), hw - 0.6) : 0;
    }
    const k = api.curvature(s);
    const kA = api.curvature(s + LOOK) - k, kB = api.curvature(s - LOOK * 0.7) - k;
    return clamp(-k * 170 + (kA + kB) * 85, -0.72, 0.72) * Math.max(0, hw - 0.6);
  }

  function build(api) {
    const L = api.total, n = Math.max(8, Math.round(L / STEP));
    const ds = L / n;
    const D = DEFAULTS;
    const latMax = api.latMax || D.latMax, brake = (api.brake || D.brake) * D.brakeMul, accel = api.accel || D.accel;
    const vTop = api.vTop || D.vTop, grip = api.grip || D.grip;
    const v = new Float32Array(n), zone = new Float32Array(n), x = new Float32Array(n);
    const smp = { p: [0, 0, 0], t: [0, 0, 0], r: [0, 0, 0], hw: 0 };
    for (let i = 0; i < n; i++) {
      const s = i * ds;
      api.sample(s, smp);
      const k = Math.max(Math.abs(api.curvature(s)), 1e-5);
      v[i] = Math.min(vTop, Math.sqrt(latMax * grip / k));
      x[i] = lateral(api, s, smp.hw);
    }
    for (let pass = 0; pass < 2; pass++) {
      for (let j = n - 1; j >= 0; j--) {
        const i = (j + n) % n, nx = (i + 1) % n;
        v[i] = Math.min(v[i], Math.sqrt(v[nx] * v[nx] + 2 * brake * ds));
      }
      for (let i = 0; i < n; i++) {
        const pv = (i - 1 + n) % n;
        v[i] = Math.min(v[i], Math.sqrt(v[pv] * v[pv] + 2 * accel * ds));
      }
    }
    const raw = new Float32Array(n), held = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const s = i * ds, nx = (i + 1) % n;
      raw[i] = (v[nx] < v[i] - 0.05 || Math.abs(api.curvature(s)) > KMIN) ? 1 : 0;
    }
    const hold = Math.max(1, Math.round(LEAD_OUT / ds));
    for (let i = 0; i < n; i++) if (raw[i]) for (let d = 0; d <= hold; d++) held[(i + d) % n] = 1;
    const R = Math.max(1, Math.round(FADE / ds));
    for (let i = 0; i < n; i++) {
      let acc = 0;
      for (let d = -R; d <= R; d++) acc += held[(i + d + n) % n];
      zone[i] = acc / (2 * R + 1);
    }
    const verts = new Float32Array((n + 1) * 2 * STRIDE);
    const node = nodeLine(api);
    const c = [0, 0];
    let o = 0;
    for (let q = 0; q <= n; q++) {
      const i = q % n, s = i * ds;
      api.sample(s, smp);
      const p = smp.p, r = smp.r, t = smp.t;
      const ux = r[1] * t[2] - r[2] * t[1], uy = r[2] * t[0] - r[0] * t[2], uz = r[0] * t[1] - r[1] * t[0];
      if (node) lineXZ(node, s, c); else { c[0] = p[0] + r[0] * x[i]; c[1] = p[2] + r[2] * x[i]; }
      for (let side = -1; side <= 1; side += 2) {
        const off = x[i] + side * HALF_W;
        const by = bankOffset(api.track, s, off) + LIFT;
        verts[o++] = c[0] + r[0] * side * HALF_W + ux * by;
        verts[o++] = p[1] + r[1] * off + uy * by;
        verts[o++] = c[1] + r[2] * side * HALF_W + uz * by;
        verts[o++] = side;
        verts[o++] = v[i];
        verts[o++] = zone[i];
        verts[o++] = q * ds;
      }
    }
    cache.id = api.id; cache.verts = verts; cache.count = (n + 1) * 2; cache.dirty = true;
    cache.v = v; cache.zone = zone; cache.n = n; cache.step = ds;
    return cache;
  }

  function nodeLine(api) {
    const tr = api.track;
    if (!tr || !tr.px || !tr.pz || !tr.rx || !tr.rz || !tr.hw || !(tr.n >= 4)) return null;
    const N = tr.n, L = api.total, qx = new Float32Array(N), qz = new Float32Array(N);
    for (let k = 0; k < N; k++) {
      const xk = lateral(api, k * L / N, tr.hw[k]);
      qx[k] = tr.px[k] + tr.rx[k] * xk; qz[k] = tr.pz[k] + tr.rz[k] * xk;
    }
    return { N, L, qx, qz };
  }
  function lineXZ(node, s, out) {
    const N = node.N, L = node.L, qx = node.qx, qz = node.qz;
    s %= L; if (s < 0) s += L;
    const fi = s / L * N, i = Math.floor(fi) % N, t = fi - Math.floor(fi);
    const a = (i - 1 + N) % N, b = (i + 1) % N, d = (i + 2) % N;
    const t2 = t * t, t3 = t2 * t;
    const w0 = -0.5 * t3 + t2 - 0.5 * t, w1 = 1.5 * t3 - 2.5 * t2 + 1, w2 = -1.5 * t3 + 2 * t2 + 0.5 * t, w3 = 0.5 * t3 - 0.5 * t2;
    out[0] = w0 * qx[a] + w1 * qx[i] + w2 * qx[b] + w3 * qx[d];
    out[1] = w0 * qz[a] + w1 * qz[i] + w2 * qz[b] + w3 * qz[d];
    return out;
  }

  function speedAt(s) {
    if (!cache.v) return null;
    const n = cache.n, f = ((s / cache.step) % n + n) % n;
    const i = Math.floor(f), j = (i + 1) % n, t = f - i;
    return cache.v[i] * (1 - t) + cache.v[j] * t;
  }
  function zoneAt(s) {
    if (!cache.zone) return null;
    const n = cache.n, i = Math.floor(((s / cache.step) % n + n) % n);
    return cache.zone[i];
  }

  const _drawOpts = { speed: 0, cornersOnly: false, cols: _cols, opacity: 1 };
  let _api = null;
  function ensure(api) {
    if (cache.id !== api.id || !cache.verts) build(api);
  }
  function draw(gfx, api, playerSpeed) {
    if (api) _api = api;
    const dm = drawMode();
    if (dm === "off" || !gfx || typeof gfx.drawDrivingLine !== "function") return false;
    ensure(api);
    _drawOpts.speed = playerSpeed || 0; _drawOpts.cornersOnly = dm === "corner";
    _drawOpts.opacity = _opMul;
    const drew = gfx.drawDrivingLine(cache.verts, cache.count, cache.dirty, _drawOpts);
    if (drew) cache.dirty = false;
    return !!drew;
  }

  function cue(playerSpeed, s) {
    if (_api && (cache.id !== _api.id || !cache.v)) ensure(_api);
    const v = speedAt(s);
    if (v == null) return null;
    const over = (playerSpeed || 0) / Math.max(v, 1);
    const t = clamp((over - 1) / (1.16 - 1), 0, 1);
    return t * t * (3 - 2 * t);
  }

  function reset() { _api = null; cache.id = null; cache.verts = null; cache.count = 0; cache.v = null; cache.zone = null; }

  return { PALETTES, OPACITIES, STRIDE, DEFAULTS, setMode, mode: getMode, setPhoto, shown,
           setPalette, palette: getPalette, setOpacity, opacity: getOpacity, opacityMul,
           build, draw, speedAt, zoneAt, cue, reset, bankOffset,
           _cache: () => cache };
})();
