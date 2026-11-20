/* Apex 26 — TLXAA: the desktop-tier anti-aliasing and output maths for TLX
 * (docs/notes/DESKTOP-GRAPHICS-TIERS-2026-11-20.md, features traa / superSample /
 * ss2x / hdrOut). Two halves:
 *   - PURE maths (no THREE, node-tested in tests/unit/tlx-aa.test.mjs): the
 *     Halton sub-pixel jitter, the projection jitter, the reprojection (the JS
 *     twin of the shader), the neighbourhood clamp, the camera-cut test, the
 *     supersample ceiling and the HDR peak decision.
 *   - taa(THREE, TSL, ctx): the TEMPORAL AA controller tlx-post.js runs in place
 *     of FXAA when ctx.traa is on. Camera reprojection from the scene depth (no
 *     per-object velocity yet: a car moving with the camera is held by the
 *     neighbourhood clamp, not by its own motion vector), a half-float history
 *     pair whose ALPHA carries the pixel's view depth (the disocclusion test),
 *     a 3x3 min/max clamp, a luma-weighted (Karis) blend, and a reset on a
 *     resize, a camera cut / teleport, or a frame that did not run the TAA.
 * NEVER touches THREE/TSL at script eval: three exists only inside TLX.create(). */
"use strict";

(function () {
  // Radical inverse in base b: the Halton sequence, i >= 1.
  function halton(i, b) {
    let f = 1, r = 0;
    i = Math.max(0, i | 0);
    while (i > 0) { f /= b; r += f * (i % b); i = Math.floor(i / b); }
    return r;
  }
  const PHASES = 8;
  // Frame n's sub-pixel offset in PIXELS, each axis in (-0.5, 0.5): Halton(2, 3), 8 phases (index 1..8, never 0,
  // whose (0, 0) would repeat the centre once per cycle).
  function jitterPx(n, out) {
    const o = out || [0, 0], k = ((n | 0) % PHASES + PHASES) % PHASES + 1;
    o[0] = halton(k, 2) - 0.5; o[1] = halton(k, 3) - 0.5;
    return o;
  }
  // Pixels -> the NDC shift for a w x h target (one pixel is 2/w of NDC).
  function jitterNdc(px, py, w, h, out) {
    const o = out || [0, 0];
    o[0] = (2 * px) / Math.max(1, w); o[1] = (2 * py) / Math.max(1, h);
    return o;
  }
  // Shift a column-major perspective projection so every point lands +jx, +jy in NDC. clip.x picks up e[8]*z_view
  // and w = -z_view, so subtracting from e[8] / e[9] ADDS to ndc. Z01 (WebGPU) only rewrites row 2: elements 8 / 9
  // keep their meaning on both backends.
  function applyJitter(e, jx, jy) { e[8] -= jx; e[9] -= jy; return e; }

  // 4x4 column-major times (x, y, z, w) into out[0..3].
  function mulV(m, x, y, z, w, out) {
    out[0] = m[0] * x + m[4] * y + m[8] * z + m[12] * w;
    out[1] = m[1] * x + m[5] * y + m[9] * z + m[13] * w;
    out[2] = m[2] * x + m[6] * y + m[10] * z + m[14] * w;
    out[3] = m[3] * x + m[7] * y + m[11] * z + m[15] * w;
    return out;
  }
  const SKY_D = 0.999999;   // depth clamp: an infinite-far projection's sky stays a finite point (rotation reprojects)
  const W_MAX = 60000;      // history alpha is half-float: view depth stored and compared under this cap
  const _r4 = [0, 0, 0, 0];
  // The shader's reprojection in JS (tests pin the maths). uvGl: GL bottom-left 0..1 of the CURRENT pixel; d: the
  // depth texture's 0..1 (0.5*z_gl+0.5 on both backends); jit: this frame's NDC jitter. Returns
  // { u, v } (previous GL uv), wPrev (the point's view depth in the previous frame), wCur.
  function reproject(invVP, prevVP, uvx, uvy, d, jx, jy, out) {
    const o = out || {};
    const z = Math.min(d, SKY_D) * 2 - 1;
    mulV(invVP, uvx * 2 - 1 - jx, uvy * 2 - 1 - jy, z, 1, _r4);
    const iw = _r4[3];
    o.wCur = Math.min(1 / iw, W_MAX);
    const x = _r4[0] / iw, y = _r4[1] / iw, zz = _r4[2] / iw;
    mulV(prevVP, x, y, zz, 1, _r4);
    o.u = (_r4[0] / _r4[3]) * 0.5 + 0.5; o.v = (_r4[1] / _r4[3]) * 0.5 + 0.5;
    o.wPrev = Math.min(_r4[3], W_MAX);
    return o;
  }
  // The neighbourhood clamp (per channel), as the shader does it.
  function clampRGB(c, lo, hi, out) {
    const o = out || [0, 0, 0];
    for (let i = 0; i < 3; i++) o[i] = Math.min(Math.max(c[i], lo[i]), hi[i]);
    return o;
  }
  // Disocclusion: the history's stored depth vs where this point was. Relative, so a far wall and a near kerb
  // get the same tolerance.
  const DEPTH_TOL = 0.08;
  function disoccluded(histW, wPrev) {
    if (!(wPrev > 0)) return true;
    return Math.abs(histW - wPrev) / Math.max(wPrev, 1e-3) > DEPTH_TOL;
  }
  // The world-space forward of a view-projection inverse: ndc (0, 0, -1) -> (0, 0, 1).
  function forwardOf(invVP, out) {
    const o = out || [0, 0, 1];
    mulV(invVP, 0, 0, -1, 1, _r4);
    const ax = _r4[0] / _r4[3], ay = _r4[1] / _r4[3], az = _r4[2] / _r4[3];
    mulV(invVP, 0, 0, 0.9, 1, _r4);
    let x = _r4[0] / _r4[3] - ax, y = _r4[1] / _r4[3] - ay, z = _r4[2] / _r4[3] - az;
    const l = Math.hypot(x, y, z) || 1;
    o[0] = x / l; o[1] = y / l; o[2] = z / l;
    return o;
  }
  // A camera cut or teleport: the eye jumped further than any car moves in a frame (350 km/h is ~1.6 m at 60 Hz,
  // ~5 m at 20 Hz), or the view turned more than CUT_DEG. Either way the history is another picture.
  const CUT_M = 12, CUT_DEG = 20;
  const CUT_COS = Math.cos(CUT_DEG * Math.PI / 180);
  function camCut(prevEye, eye, prevFwd, fwd) {
    if (!prevEye || !eye || !prevFwd || !fwd) return true;
    const dx = eye[0] - prevEye[0], dy = eye[1] - prevEye[1], dz = eye[2] - prevEye[2];
    if (dx * dx + dy * dy + dz * dz > CUT_M * CUT_M) return true;
    return prevFwd[0] * fwd[0] + prevFwd[1] * fwd[1] + prevFwd[2] * fwd[2] < CUT_COS;
  }

  // SUPERSAMPLE CEILING (superSample / ss2x): the highest renderScale TLX may run. superSample: 1.5 on a display
  // of DPR <= 1.25 (a retina panel is already sampled ~2x by its DPR); ss2x (CINEMA): 2. Capped by the GPU's
  // texture limit on each axis and by MAX_PX render pixels (4K x 2: the scene + tag + depth + LDR + history at
  // 2x on a 2880x1800 laptop panel is already ~700 MB). Never below 1.
  const SS_MAX = 1.5, SS_CINE = 2, MAX_PX = 3840 * 2160 * 2;
  function ssCeil(o) {
    o = o || {};
    let s = 1;
    if (o.ss2x) s = SS_CINE;
    else if (o.superSample && (o.dpr || 1) <= 1.25) s = SS_MAX;
    if (s <= 1) return 1;
    const pw = Math.max(1, o.presentW | 0), ph = Math.max(1, o.presentH | 0);
    if (o.maxDim > 0) s = Math.min(s, o.maxDim / pw, o.maxDim / ph);
    s = Math.min(s, Math.sqrt(MAX_PX / (pw * ph)));
    return Math.max(1, Math.floor(s * 100) / 100);
  }

  // HDR PEAK (hdrOut): how far above SDR white the composite may write. HDR only when the canvas was configured
  // rgba16float + toneMapping "extended" AND the browser reports that configuration back (getConfiguration; Chrome
  // 129+ honours it, Safari accepts and ignores it) AND the display says it is HDR. Anything else: 1, today's SDR.
  const HDR_PEAK = 2.5;
  function hdrPeak(o) {
    o = o || {};
    if (!o.want || !o.webgpu || o.soft) return 1;
    const cfg = o.config;
    const mode = cfg && cfg.toneMapping && cfg.toneMapping.mode;
    if (mode !== "extended" || (cfg.format && cfg.format !== "rgba16float")) return 1;
    return o.displayHdr ? HDR_PEAK : 1;
  }

  /* TAA CONTROLLER. ctx = { runPass(mat, target), ownRT(rt), trackMaterial, ldrTex, depthTex }.
   * jitter(w, h): this frame's NDC jitter (tlx.js applies it to the main camera's projection before the scene;
   *   the mirror camera and the DOM HUD never see it). resolve(F, w, h, live): history <- TAA(ldr, history),
   *   then the history -> dest copy runs through runPass; returns the history RT the copy read. */
  function taa(THREE, TSL, ctx) {
    const { Fn, If, uniform, texture, float, vec2, vec3, vec4, screenUV, clamp, max, min, abs, dot, length, select } = TSL;
    const onePx = (v) => {
      const t = new THREE.DataTexture(new Uint8Array([v, v, v, 255]), 1, 1);
      t.colorSpace = THREE.NoColorSpace; t.needsUpdate = true;
      return t;
    };
    // ONE TEXTURE PER NODE AT BUILD TIME (tsl-post.js composite note): three merges texture nodes that share a
    // texture into one sampler, so each slot starts on its own texture.
    const histInit = onePx(0), outInit = onePx(1);
    const curT = texture(ctx.ldrTex), histT = texture(histInit), depthT = texture(ctx.depthTex), outT = texture(outInit);
    const U = {
      texel: uniform(new THREE.Vector2(1, 1)),
      invVP: uniform(new THREE.Matrix4()), prevVP: uniform(new THREE.Matrix4()),
      jit: uniform(new THREE.Vector2(0, 0)),
      reset: uniform(1), alpha: uniform(0.08), depthTol: uniform(DEPTH_TOL),
    };
    const lum = (c) => dot(c, vec3(0.299, 0.587, 0.114));
    const mk = (node, key) => {
      const m = new THREE.NodeMaterial();
      if (ctx.trackMaterial) ctx.trackMaterial(m);
      m.fragmentNode = node; m.depthTest = false; m.depthWrite = false;
      m.blending = THREE.NoBlending; m.fog = false; m.lights = false;
      m.name = key;
      return m;
    };
    const resolveMat = mk(Fn(() => {
      const uv = vec2(screenUV).toVar();                   // top-left texture space
      const uvGl = vec2(uv.x, uv.y.oneMinus());
      const d = min(float(depthT.sample(uv)), float(SKY_D));
      const ndc = vec4(uvGl.mul(2.0).sub(1.0).sub(U.jit), d.mul(2.0).sub(1.0), 1.0);
      const wp = U.invVP.mul(ndc).toVar();
      const wCur = min(float(1.0).div(wp.w), float(W_MAX));
      const world = vec4(wp.xyz.div(wp.w), 1.0);
      const pc = U.prevVP.mul(world).toVar();
      const pUvGl = pc.xy.div(pc.w).mul(0.5).add(0.5).toVar();
      const pUv = vec2(pUvGl.x, pUvGl.y.oneMinus());
      // 3x3 neighbourhood of the current (jittered) frame: min / max for the clamp.
      const c = vec3(curT.sample(uv).rgb).toVar();
      const mn = vec3(c).toVar(), mx = vec3(c).toVar();
      for (let y = -1; y <= 1; y++) {
        for (let x = -1; x <= 1; x++) {
          if (!x && !y) continue;
          const s = curT.sample(uv.add(vec2(x, y).mul(U.texel))).rgb;
          mn.assign(min(mn, s)); mx.assign(max(mx, s));
        }
      }
      const h = histT.sample(pUv).toVar();
      const hc = clamp(h.rgb, mn, mx);
      const off = pUv.x.lessThan(0.0).or(pUv.x.greaterThan(1.0)).or(pUv.y.lessThan(0.0)).or(pUv.y.greaterThan(1.0));
      const wPrev = min(pc.w, float(W_MAX));
      const occl = pc.w.lessThanEqual(0.0).or(abs(h.a.sub(wPrev)).div(max(wPrev, 1e-3)).greaterThan(U.depthTol));
      // Fast motion keeps less history (less smear); a rejected pixel takes the current frame alone.
      const velPx = length(uvGl.sub(pUvGl).div(U.texel));
      const a = clamp(U.alpha.add(velPx.mul(0.01)), U.alpha, float(0.3)).toVar();
      If(U.reset.greaterThan(0.5).or(off).or(occl), () => { a.assign(1.0); });
      // Karis: weight by 1 / (1 + luma) so one bright sample cannot dominate the blend (HDR highlights, flares).
      const wc = a.div(lum(c).add(1.0)), wh = a.oneMinus().div(lum(hc).add(1.0));
      const res = c.mul(wc).add(hc.mul(wh)).div(max(wc.add(wh), 1e-5));
      return vec4(select(a.greaterThanEqual(1.0), c, res), wCur);
    })(), "tlx-post-traa");
    const outMat = mk(Fn(() => vec4(max(outT.sample(vec2(screenUV)).rgb, vec3(0.0)), 1.0))(), "tlx-post-traa-out");

    let hist = null, cur = 0, W = 0, H = 0, frames = 0, resets = 0, lastOk = false, reset = true;
    const _jpx = [0, 0], _jndc = [0, 0], _jit = [0, 0];
    let _n = 0;
    const prevVP = new Float32Array(16), _prevEye = [0, 0, 0], _prevFwd = [0, 0, 1], _fwd = [0, 0, 1];
    let havePrev = false;
    function ensure(w, h) {
      if (hist && W === w && H === h) return;
      if (!hist) {
        hist = [0, 1].map((i) => {
          const rt = ctx.ownRT(new THREE.RenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: false, format: THREE.RGBAFormat }));
          rt.texture.generateMipmaps = false; rt.texture.colorSpace = THREE.NoColorSpace;
          rt.texture.minFilter = rt.texture.magFilter = THREE.LinearFilter;
          rt.texture.name = "TLXTaaHist" + i;
          return rt;
        });
      } else { hist[0].setSize(w, h); hist[1].setSize(w, h); }
      W = w; H = h; reset = true;
    }
    function jitter(w, h) {
      jitterPx(_n++, _jpx);
      jitterNdc(_jpx[0], _jpx[1], w, h, _jndc);
      _jit[0] = _jndc[0]; _jit[1] = _jndc[1];
      return _jit;
    }
    // live = a real present (not a compile / draw warm): only then does the history advance.
    function resolve(F, w, h, dest, live) {
      ensure(w, h);
      const src = hist[cur], dst = hist[1 - cur];
      let cut = !havePrev || reset || !lastOk;
      if (!cut && F.eye && F.invVP) { forwardOf(F.invVP, _fwd); cut = camCut(_prevEye, F.eye, _prevFwd, _fwd); }
      U.texel.value.set(1 / w, 1 / h);
      U.invVP.value.fromArray(F.invVP);
      U.prevVP.value.fromArray(havePrev ? prevVP : F.viewProj);
      U.jit.value.set(_jit[0], _jit[1]);
      U.reset.value = cut ? 1 : 0;
      histT.value = src.texture;
      ctx.runPass(resolveMat, dst);
      outT.value = dst.texture;
      ctx.runPass(outMat, dest);
      if (live) {
        if (cut) resets++;
        frames++;
        prevVP.set(F.viewProj);
        if (F.eye) { _prevEye[0] = F.eye[0]; _prevEye[1] = F.eye[1]; _prevEye[2] = F.eye[2]; }
        forwardOf(F.invVP, _prevFwd);
        havePrev = true; reset = false; lastOk = true; cur = 1 - cur;
      }
      return dst;
    }
    return {
      jitter, resolve,
      // A frame presented without the TAA (viz, upscale, warm): the next TAA frame starts fresh.
      skipped() { lastOk = false; },
      reset() { reset = true; },
      state: () => ({ frames, resets, size: [W, H], jitter: [_jit[0], _jit[1]], held: !!hist }),
      dispose() { try { histInit.dispose(); outInit.dispose(); } catch (_) { /* device dying */ } },
    };
  }

  window.TLXAA = Object.freeze({
    halton, jitterPx, jitterNdc, applyJitter, reproject, clampRGB, disoccluded, forwardOf, camCut, ssCeil, hdrPeak,
    taa, PHASES, DEPTH_TOL, HDR_PEAK, SS_MAX, SS_CINE,
  });
})();
