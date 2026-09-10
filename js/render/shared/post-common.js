/* Apex 26 — PostCommon: backend-neutral post-chain helpers that were cloned
   verbatim into glx/post.js, wgx.js and tlx-post.js. One home so the three
   cannot drift: the LENS DIRT canvas generator, the god-ray nearest-K partial
   select, the neutral-HDR-grade test, the sun screen projection + flare/shaft
   gate, and the tune-knob default lookup (LightKnobs.TUNE_DEFS is the registry
   the sliders read — the backends used to restate every default literal).
   Loads before js/render/glx/post.js; the deferred backends call it at
   present()/init time only. */
"use strict";

const PostCommon = (function () {

  // Deterministic LENS DIRT grime map on a 2D canvas: value-noise base + soft
  // grime blobs + dust specks + wipe streaks, LCG-seeded so every load and every
  // backend gets the same lens. Returns the canvas (256x256) or null when there
  // is no document / 2D context (the caller keeps its black 1x1 fallback).
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
    // value-noise base: coarse random luminance grid, bilinearly upscaled
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
    // soft grime blobs (the "smudge" body)
    for (let i = 0; i < 130; i++) {
      const x = rnd() * S, y = rnd() * S, r = 3 + rnd() * rnd() * 30;
      const a = 0.03 + rnd() * rnd() * 0.12;
      const g = c2.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, "rgba(255,255,255," + a.toFixed(3) + ")");
      g.addColorStop(1, "rgba(255,255,255,0)");
      c2.fillStyle = g;
      c2.beginPath(); c2.arc(x, y, r, 0, 6.2832); c2.fill();
    }
    // bright dust specks
    for (let i = 0; i < 70; i++) {
      const x = rnd() * S, y = rnd() * S, r = 0.6 + rnd() * 1.7;
      c2.fillStyle = "rgba(255,255,255," + (0.10 + rnd() * 0.28).toFixed(3) + ")";
      c2.beginPath(); c2.arc(x, y, r, 0, 6.2832); c2.fill();
    }
    // faint diagonal wipe streaks
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

  // Partial select nearest-K over a pool of {d} records: O(n*k) insertion
  // instead of sorting the whole floodlight list every night frame. Evicts by
  // SWAP, never overwrite — the pool objects are reused by index every frame,
  // so an overwrite aliased one object at two slots (a beam uploaded twice,
  // another lamp permanently unselectable). Keeping `sel` a permutation of
  // itself is the whole contract (tests/unit/godray-keep-nearest.test.mjs).
  function keepNearest(sel, total, k) {
    const n = Math.min(k, total);
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

  // True when any IMAGE & COLOUR HDR knob is off its neutral value, i.e. the
  // shader's lift/gamma/gain/tone block would change a pixel. At neutral the
  // block is a mathematical no-op that still cost ~20 ALU per pixel.
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

  // Project the (infinitely distant) sun through a RAW GL view-proj to NDC and
  // derive the lens-flare / sun-shaft strengths. Writes `out`:
  //   visible  false when there is no sun/VP or the sun is behind the camera
  //   ndcx/y   GL NDC (y-up); GLX maps to uv = ndc*0.5+0.5, WGX flips y
  //   flare    peaks at GOLDEN HOUR (low sun) and fades as the sun climbs,
  //            gated by the sun's BRIGHTNESS so the dim night moon-key never
  //            streaks lamp heads skyward
  //   shaft    radial crepuscular strength, same gate
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

  // Tune-knob read with the registry default: T[id] when the tuner set it,
  // else TUNE_DEFS' def for that id. The literal defaults the backends used to
  // restate (contrast 1.12, vignette 0.80, ...) are exactly those defs
  // (tests/unit/light-grid.test.mjs pins the ids). Cached on first use with a
  // populated registry so a harness that loads a backend alone still runs.
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
      try { Log.warn("gfx", "PostCommon.knob: no TUNE_DEFS default for", id); } catch (_) { /* harness */ }
    }
    return d;
  }

  return { makeDirtCanvas, keepNearest, hdrGradeOn, sunScreen, knob };
})();
Object.freeze(PostCommon);
