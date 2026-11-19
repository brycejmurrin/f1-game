"use strict";

const PostCommon = (function () {

  function makeDirtCanvas() {
    if (typeof document === "undefined" || !document.createElement) return null;
    const S = 256;
    const cv = document.createElement("canvas");
    cv.width = cv.height = S;
    const c2 = cv.getContext("2d");
    if (!c2) return null;
    let seed = 0x9e3779b9;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    c2.fillStyle = "#000"; c2.fillRect(0, 0, S, S);
    const N = 16;
    const nc = document.createElement("canvas");
    nc.width = nc.height = N;
    const n2 = nc.getContext("2d");
    if (!n2) return null;
    const img = n2.createImageData(N, N);
    for (let i = 0; i < N * N; i++) {
      const v = (rnd() * 42) | 0;
      img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
      img.data[i * 4 + 3] = 255;
    }
    n2.putImageData(img, 0, 0);
    c2.imageSmoothingEnabled = true;
    c2.globalCompositeOperation = "lighter";
    c2.drawImage(nc, 0, 0, N, N, 0, 0, S, S);
    for (let i = 0; i < 130; i++) {
      const x = rnd() * S, y = rnd() * S, r = 3 + rnd() * rnd() * 30;
      const a = 0.03 + rnd() * rnd() * 0.12;
      const g = c2.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, "rgba(255,255,255," + a.toFixed(3) + ")");
      g.addColorStop(1, "rgba(255,255,255,0)");
      c2.fillStyle = g;
      c2.beginPath(); c2.arc(x, y, r, 0, 6.2832); c2.fill();
    }
    for (let i = 0; i < 70; i++) {
      const x = rnd() * S, y = rnd() * S, r = 0.6 + rnd() * 1.7;
      c2.fillStyle = "rgba(255,255,255," + (0.10 + rnd() * 0.28).toFixed(3) + ")";
      c2.beginPath(); c2.arc(x, y, r, 0, 6.2832); c2.fill();
    }
    for (let i = 0; i < 9; i++) {
      const x = rnd() * S, y = rnd() * S, len = 30 + rnd() * 100, ang = rnd() * 6.2832;
      c2.strokeStyle = "rgba(255,255,255," + (0.02 + rnd() * 0.05).toFixed(3) + ")";
      c2.lineWidth = 1 + rnd() * 3;
      c2.beginPath(); c2.moveTo(x, y);
      c2.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
      c2.stroke();
    }
    return cv;
  }

  function keepNearest(sel, total, k) {
    const n = Math.min(k, total);
    if (!(n > 0)) return 0;
    for (let i = 1; i < n; i++) {
      const cur = sel[i];
      let j = i - 1;
      while (j >= 0 && sel[j].d > cur.d) { sel[j + 1] = sel[j]; j--; }
      sel[j + 1] = cur;
    }
    for (let i = n; i < total; i++) {
      const cur = sel[i];
      if (cur.d >= sel[n - 1].d) continue;
      let j = n - 2;
      while (j >= 0 && sel[j].d > cur.d) j--;
      const insertAt = j + 1;
      const evicted = sel[n - 1];
      for (let m = n - 1; m > insertAt; m--) sel[m] = sel[m - 1];
      sel[insertAt] = cur;
      sel[i] = evicted;
    }
    return n;
  }

  function hdrGradeOn(T) {
    return !!(T && (
      (T.blacks || 0) !== 0 || (T.shadows || 0) !== 0 || (T.midtones || 0) !== 0 ||
      (T.highlights || 0) !== 0 || (T.whites || 0) !== 0 || (T.toe || 0) !== 0 ||
      (T.shoulder || 0) !== 0 || (T.liftR || 0) !== 0 || (T.liftG || 0) !== 0 ||
      (T.liftB || 0) !== 0 || (T.gammaR != null && T.gammaR !== 1) ||
      (T.gammaG != null && T.gammaG !== 1) || (T.gammaB != null && T.gammaB !== 1) ||
      (T.gainR != null && T.gainR !== 1) || (T.gainG != null && T.gainG !== 1) ||
      (T.gainB != null && T.gainB !== 1)));
  }

  function sunScreen(s, vp, sunColor, out) {
    out.visible = false; out.ndcx = -5; out.ndcy = -5; out.flare = 0; out.shaft = 0;
    if (!s || !vp) return out;
    const cx = vp[0] * s[0] + vp[4] * s[1] + vp[8] * s[2];
    const cy = vp[1] * s[0] + vp[5] * s[1] + vp[9] * s[2];
    const cw = vp[3] * s[0] + vp[7] * s[1] + vp[11] * s[2];
    if (!(cw > 0)) return out;
    out.visible = true;
    out.ndcx = cx / cw; out.ndcy = cy / cw;
    const sl = sunColor ? Math.max(sunColor[0], sunColor[1], sunColor[2]) : 1;
    const gate = Math.min(1, Math.max(0, (sl - 0.35) / 0.45));
    if (s[1] > -0.02) {
      const golden = 1.0 - Math.min(Math.max(s[1], 0) / 0.45, 1.0);
      out.flare = (0.14 + golden * 0.30) * gate;
    }
    if (s[1] > 0.05) out.shaft = s[1] * 0.8 * gate;
    return out;
  }

  function flareTapsDepth(sun, flareMul) {
    if (!(sun && sun.visible && sun.flare * (flareMul != null ? flareMul : 1) > 0)) return false;
    const ux = Math.fround(sun.ndcx * 0.5 + 0.5), uy = Math.fround(sun.ndcy * 0.5 + 0.5);
    return ux >= 0 && ux <= 1 && uy >= 0 && uy <= 1;
  }

  let _defs = null;
  const _warned = Object.create(null);
  function defs() {
    if (_defs) return _defs;
    const reg = (typeof LightKnobs !== "undefined" && LightKnobs.TUNE_DEFS) || null;
    const d = Object.create(null);
    if (reg) { for (let i = 0; i < reg.length; i++) d[reg[i].id] = reg[i].def; _defs = d; }
    return d;
  }
  function knob(T, id) {
    const v = T ? T[id] : undefined;
    if (v != null) return v;
    const d = defs()[id];
    if (d === undefined && !_warned[id]) {
      _warned[id] = true;
      try { Log.warn("gfx", "PostCommon.knob: no TUNE_DEFS default for", id); } catch (_) {  }
    }
    return d;
  }

  function softwareGlowScale(str) {
    if (!(str > 0) || typeof PerfGov === "undefined" || !PerfGov.softwareRaster()) return str;
    return str * (PerfGov.lookPostShed && PerfGov.lookPostShed() ? 0.22 : 0.55);
  }

  function softwareRaceShed(softwareGL, nav, knob) {
    if (!softwareGL) return false;
    if (knob === "0") return false;
    if (knob === "1") return true;
    if (!nav || nav.webdriver) return false;
    if (/apex-game-vm/.test(nav.userAgent || "")) return false;
    return true;
  }

  function roadReflection(opts, wetness, strength, tier, autoTier, transition, nowMs, emergency) {
    const wet = wetness > 0.01, target = autoTier >= 4 ? 0 : 1;
    let available = target;
    if (transition) {
      const now = Number.isFinite(nowMs) ? nowMs : transition.time;
      const initial = !Number.isFinite(transition.value);
      const changed = transition.target !== target;
      const elapsed = !initial && !changed && Number.isFinite(now - transition.time)
        ? Math.max(0, now - transition.time) : 0;
      if (emergency) transition.value = 0;
      else if (initial || !wet || !(strength > 0)) transition.value = target;
      else if (target < transition.value) transition.value = transition.value - target <= elapsed / 180 + 1e-9
        ? target : transition.value - elapsed / 180;
      else transition.value = target - transition.value <= elapsed / 400 + 1e-9
        ? target : transition.value + elapsed / 400;
      transition.target = target;
      if (Number.isFinite(now)) transition.time = initial || !Number.isFinite(transition.time)
        ? now : Math.max(transition.time, now);
      available = transition.value;
    }
    opts.reflect = emergency ? 0 : wet ? strength * available : tier >= 2 ? 0 : strength;
    opts.ssrQuality = tier >= 3 ? 2 : (tier >= 2 ? 1 : 0);
  }

  function mipFootprintLod(pos, uv, idx, model, vp, W, H, tw, th) {
    const m = model, p = vp, n = idx ? idx.length : pos.length / 3, sx = [0, 0, 0], sy = [0, 0, 0], q = [0, 0, 0];
    const cx = [0, 0, 0], cy = [0, 0, 0], cw = [0, 0, 0];
    let worst = 0;
    for (let t = 0; t + 2 < n; t += 3) {
      for (let k = 0; k < 3; k++) {
        const i = idx ? idx[t + k] : t + k, x = pos[3 * i], y = pos[3 * i + 1], z = pos[3 * i + 2];
        const wx = m[0] * x + m[4] * y + m[8] * z + m[12], wy = m[1] * x + m[5] * y + m[9] * z + m[13];
        const wz = m[2] * x + m[6] * y + m[10] * z + m[14];
        cx[k] = p[0] * wx + p[4] * wy + p[8] * wz + p[12]; cy[k] = p[1] * wx + p[5] * wy + p[9] * wz + p[13];
        cw[k] = p[3] * wx + p[7] * wy + p[11] * wz + p[15];
      }
      const out = (f) => f(0) && f(1) && f(2);
      if (out((k) => !(cw[k] > 1e-6)) || out((k) => cx[k] > cw[k]) || out((k) => cx[k] < -cw[k])
          || out((k) => cy[k] > cw[k]) || out((k) => cy[k] < -cw[k])) continue;
      if (!(cw[0] > 1e-6 && cw[1] > 1e-6 && cw[2] > 1e-6)) return Infinity;
      for (let k = 0; k < 3; k++) { sx[k] = cx[k] / cw[k] * 0.5 * W; sy[k] = cy[k] / cw[k] * 0.5 * H; q[k] = 1 / cw[k]; }
      const e1x = sx[1] - sx[0], e1y = sy[1] - sy[0], e2x = sx[2] - sx[0], e2y = sy[2] - sy[0];
      const det = e1x * e2y - e1y * e2x;
      if (det === 0) continue;
      const g = [[(e1y - e2y) / det, (e2x - e1x) / det], [e2y / det, -e2x / det], [-e1y / det, e1x / det]];
      let dDx = 0, dDy = 0, dUx = 0, dUy = 0, dVx = 0, dVy = 0, wMax = 0;
      for (let k = 0; k < 3; k++) {
        const i = idx ? idx[t + k] : t + k, u = uv[2 * i] * tw, v = uv[2 * i + 1] * th;
        dDx += q[k] * g[k][0]; dDy += q[k] * g[k][1];
        dUx += q[k] * u * g[k][0]; dUy += q[k] * u * g[k][1]; dVx += q[k] * v * g[k][0]; dVy += q[k] * v * g[k][1];
        wMax = Math.max(wMax, 1 / q[k]);
      }
      for (let k = 0; k < 3; k++) {
        const i = idx ? idx[t + k] : t + k, u = uv[2 * i] * tw, v = uv[2 * i + 1] * th;
        const a = dUx - u * dDx, b = dUy - u * dDy, c = dVx - v * dDx, d = dVy - v * dDy;
        worst = Math.max(worst, Math.SQRT2 * Math.max(Math.abs(a) + Math.abs(c), Math.abs(b) + Math.abs(d)) * wMax);
      }
    }
    return worst > 0 ? Math.log2(worst) : -Infinity;
  }

  return { makeDirtCanvas, keepNearest, hdrGradeOn, sunScreen, flareTapsDepth, knob, roadReflection, softwareGlowScale, softwareRaceShed, mipFootprintLod };
})();
Object.freeze(PostCommon);
