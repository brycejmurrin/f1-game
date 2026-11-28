/* Apex 26 — TLXAA: the desktop-tier anti-aliasing and output maths for TLX
 * (docs/notes/DESKTOP-GRAPHICS-TIERS-2026-11-20.md, features traa / superSample /
 * ss2x / hdrOut). Two halves:
 *   - PURE maths (no THREE, node-tested in tests/unit/tlx-aa.test.mjs): the
 *     Halton sub-pixel jitter, the projection jitter, the reprojection (the JS
 *     twin of the shader), the neighbourhood clamp, the camera-cut test, the
 *     supersample ceiling and the HDR peak decision.
 *   - taa(THREE, TSL, ctx): the TEMPORAL AA controller tlx-post.js runs in place
 *     of FXAA when ctx.traa is on. Camera reprojection from the scene depth, or,
 *     with ctx.velTex (the scene's per-object velocity attachment, VelocityNode:
 *     each mesh's previous model matrix), each drawn pixel's own motion vector,
 *     so a car moving with the camera keeps its history; a half-float history
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

  // PER-OBJECT VELOCITY (EXTREME, the "velocity" scene attachment): three's VelocityNode in JS. NDC of a local point
  // this frame minus where the same point was last frame, through each object's own previous model matrix and the
  // camera's previous view; projections are the UNJITTERED ones (tlx.js overrides the node's projection), so the
  // vector carries motion only. Column-major 4x4s.
  const _v4 = [0, 0, 0, 0], _w4 = [0, 0, 0, 0];
  function ndcOf(P, V, M, p, out) {
    mulV(M, p[0], p[1], p[2], 1, _v4);
    mulV(V, _v4[0], _v4[1], _v4[2], _v4[3], _w4);
    mulV(P, _w4[0], _w4[1], _w4[2], _w4[3], _v4);
    out[0] = _v4[0] / _v4[3]; out[1] = _v4[1] / _v4[3];
    return out;
  }
  const _n0 = [0, 0], _n1 = [0, 0];
  function velocity(P, V, M, prevP, prevV, prevM, p, out) {
    const o = out || [0, 0];
    ndcOf(P, V, M, p, _n0); ndcOf(prevP, prevV, prevM, p, _n1);
    o[0] = _n0[0] - _n1[0]; o[1] = _n0[1] - _n1[1];
    return o;
  }
  // The previous GL uv a pixel's velocity sends it to: the unjittered NDC of this pixel minus the velocity.
  function velReproject(uvx, uvy, vx, vy, jx, jy, out) {
    const o = out || [0, 0];
    o[0] = (uvx * 2 - 1 - jx - vx) * 0.5 + 0.5; o[1] = (uvy * 2 - 1 - jy - vy) * 0.5 + 0.5;
    return o;
  }
  // How far (px) a pixel's own velocity departs from the camera-only reprojection (cx, cy: NDC, the static answer).
  // Past VEL_MAX_PX it is a teleport or a pooled mesh slot that changed owner (tlx.js acquireMesh keys wrappers by
  // draw order), not motion: that pixel's history is rejected.
  const VEL_MAX_PX = 96;
  function objMotionPx(vx, vy, cx, cy, w, h) { return Math.hypot((vx - cx) * 0.5 * w, (vy - cy) * 0.5 * h); }
  function velRejected(vx, vy, cx, cy, w, h) { return !(objMotionPx(vx, vy, cx, cy, w, h) <= VEL_MAX_PX); }
  // The scene MRT with the velocity output (tlx.js _ssrMrtNode on a chain whose scene target has the attachment).
  // Targets without a "velocity" texture (mirror, env cube) skip the output: MRTNode.setup matches by name.
  function velocityMrt(THREE, TSL, projM) {
    if (!TSL.velocity || !TSL.mrt || !TSL.velocity.setProjectionMatrix) return null;
    TSL.velocity.setProjectionMatrix(projM);
    return TSL.mrt({ output: TSL.output, ssrTag: TSL.float(1), velocity: TSL.velocity });
  }

  // AgX (opt-in, apex26.tlxAgx=1 on EXTREME; tsl-post.js uses three's own agxToneMapping): the JS twin of three
  // r187's TSL function, for the tests. Linear sRGB in, linear sRGB out, 0..1.
  const AGX_IN = [[0.6274, 0.0691, 0.0164], [0.3293, 0.9195, 0.088], [0.0433, 0.0113, 0.8956]];   // columns
  const AGX_OUT = [[1.6605, -0.1246, -0.0182], [-0.5876, 1.1329, -0.1006], [-0.0728, -0.0083, 1.1187]];
  const AGX_INSET = [[0.856627153315983, 0.137318972929847, 0.11189821299995],
    [0.0951212405381588, 0.761241990602591, 0.0767994186031903], [0.0482516061458583, 0.101439036467562, 0.811302368396859]];
  const AGX_OUTSET = [[1.1271005818144368, -0.1413297634984383, -0.14132976349843826],
    [-0.11060664309660323, 1.157823702216272, -0.11060664309660294],
    [-0.016493938717834573, -0.016493938717834257, 1.2519364065950405]];
  const AGX_EV = [-12.47393, 4.026069];
  const m3 = (c, v) => [0, 1, 2].map((i) => c[0][i] * v[0] + c[1][i] * v[1] + c[2][i] * v[2]);
  const agxCurve = (x) => {
    const x2 = x * x, x4 = x2 * x2;
    return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232;
  };
  function agx(rgb, exposure) {
    let r = rgb.map((v) => v * (exposure == null ? 1 : exposure));
    r = m3(AGX_INSET, m3(AGX_IN, r)).map((v) => {
      const t = (Math.log2(Math.max(v, 1e-10)) - AGX_EV[0]) / (AGX_EV[1] - AGX_EV[0]);
      return agxCurve(Math.min(1, Math.max(0, t)));
    });
    r = m3(AGX_OUTSET, r).map((v) => Math.pow(Math.max(0, v), 2.2));
    return m3(AGX_OUT, r).map((v) => Math.min(1, Math.max(0, v)));
  }

  // SUPERSAMPLE CEILING (superSample / ss2x): the highest renderScale TLX may run. superSample: 1.5 on a display
  // of DPR <= 1.25 (a retina panel is already sampled ~2x by its DPR); ss2x (CINEMA): 2. Capped by the GPU's
  // texture limit on each axis and by MAX_PX render pixels (4K x 2: the scene + tag + depth + LDR + history at
  // 2x on a 2880x1800 laptop panel is already ~700 MB). Never below 1.
  // RETINA (#6486 F2): RESOLUTION MAX (maxRes: TLX's setDprBoost > 0, desktop only) lifts the DPR rule, so a 2x
  // panel supersamples above native too. Memory guard: a reported deviceMemory under 8 GB keeps the DPR rule
  // (Chrome reports at most 8). Unreported (Safari, Firefox) passes: every Apple-silicon Mac ships with >= 8 GB. The fps guard is the governor: it sheds the DPR boost first (§gov-39), then
  // superSample (SHED_ORDER), and either drops this ceiling back to 1 on TLX's next 32-frame re-read.
  const SS_MAX = 1.5, SS_CINE = 2, MAX_PX = 3840 * 2160 * 2, SS_RETINA_MEM_GB = 8;
  function ssRetina(o) {
    o = o || {};
    return !!o.maxRes && !(o.deviceMemory > 0 && o.deviceMemory < SS_RETINA_MEM_GB);
  }
  function ssCeil(o) {
    o = o || {};
    let s = 1;
    if (o.ss2x) s = SS_CINE;
    else if (o.superSample && ((o.dpr || 1) <= 1.25 || ssRetina(o))) s = SS_MAX;
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

  /* TAA CONTROLLER. ctx = { runPass(mat, target), ownRT(rt), rtSetSize(rt, w, h), trackMaterial, ldrTex, depthTex }.
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
    // ctx.velTex (EXTREME): the scene's per-object velocity attachment. Absent: camera reprojection only (the graph
    // below is then exactly the one without this feature).
    const velT = ctx.velTex ? texture(ctx.velTex) : null;
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
      let velRej = null;
      if (velT) {
        // A drawn pixel (not sky) follows its own motion vector: a car moving with the camera keeps its history
        // instead of being held by the clamp alone. A vector far from the camera's answer is not motion (velRejected).
        const vel = vec2(velT.sample(uv).xy).toVar();
        const nCur = uvGl.mul(2.0).sub(1.0).sub(U.jit).toVar();
        const camV = nCur.sub(pc.xy.div(pc.w));
        const objPx = length(vel.sub(camV).mul(0.5).div(U.texel));
        velRej = d.lessThan(float(SKY_D)).and(objPx.greaterThan(float(VEL_MAX_PX)));
        If(d.lessThan(float(SKY_D)), () => { pUvGl.assign(nCur.sub(vel).mul(0.5).add(0.5)); });
      }
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
      let occl = pc.w.lessThanEqual(0.0).or(abs(h.a.sub(wPrev)).div(max(wPrev, 1e-3)).greaterThan(U.depthTol));
      if (velRej) occl = occl.or(velRej);
      // Fast motion keeps less history (less smear); a rejected pixel takes the current frame alone.
      const velPx = length(uvGl.sub(pUvGl).div(U.texel));
      const a = clamp(U.alpha.add(velPx.mul(0.01)), U.alpha, float(0.3)).toVar();
      If(U.reset.greaterThan(0.5).or(off).or(occl), () => { a.assign(1.0); });
      // Karis: weight by 1 / (1 + luma) so one bright sample cannot dominate the blend (HDR highlights, flares).
      const wc = a.div(lum(c).add(1.0)), wh = a.oneMinus().div(lum(hc).add(1.0));
      const res = c.mul(wc).add(hc.mul(wh)).div(max(wc.add(wh), 1e-5));
      return vec4(select(a.greaterThanEqual(1.0), c, res), wCur);
    })(), "tlx-post-traa");
    const outMat = mk(Fn(() => {
      const uv = vec2(screenUV);
      return vec4(max(outT.sample(ctx.waterUV ? ctx.waterUV(uv) : uv).rgb, vec3(0.0)), 1.0);
    })(), "tlx-post-traa-out");

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
      } else if (ctx.rtSetSize) { ctx.rtSetSize(hist[0], w, h); ctx.rtSetSize(hist[1], w, h); }
      else { hist[0].setSize(w, h); hist[1].setSize(w, h); }
      W = w; H = h; reset = true;
    }
    function jitter(w, h) {
      jitterPx(_n++, _jpx);
      jitterNdc(_jpx[0], _jpx[1], w, h, _jndc);
      _jit[0] = _jndc[0]; _jit[1] = _jndc[1];
      return _jit;
    }
    // live = a real present (not a compile / draw warm): only then does the history advance.
    function resolve(F, w, h, dest, live, color = ctx.ldrTex) {
      ensure(w, h);
      const src = hist[cur], dst = hist[1 - cur];
      let cut = !havePrev || reset || !lastOk;
      if (!cut && F.eye && F.invVP) { forwardOf(F.invVP, _fwd); cut = camCut(_prevEye, F.eye, _prevFwd, _fwd); }
      U.texel.value.set(1 / w, 1 / h);
      U.invVP.value.fromArray(F.invVP);
      U.prevVP.value.fromArray(havePrev ? prevVP : F.viewProj);
      U.jit.value.set(_jit[0], _jit[1]);
      U.reset.value = cut ? 1 : 0;
      curT.value = color;
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
      copyLast(dest) {
        // Warm draws can rebind outT, but only a live resolve advances cur.
        if (!hist) return;
        outT.value = hist[cur].texture;
        ctx.runPass(outMat, dest);
      },
      // A frame presented without the TAA (viz, upscale, warm): the next TAA frame starts fresh.
      skipped() { curT.value = ctx.ldrTex; lastOk = false; },
      reset() { reset = true; },
      // TAA idle past the host's shed window: free the history pair (two post-size RGBA16F). The next
      // resolve() re-ensures and starts from reset, exactly as the first TAA frame of a session.
      release() {
        if (!hist) return;
        curT.value = ctx.ldrTex; histT.value = histInit; outT.value = outInit;
        for (const rt of hist) {
          if (ctx.dropRT) ctx.dropRT(rt);
          else try { rt.dispose(); } catch (_) { /* device dying */ }
        }
        hist = null; W = 0; H = 0; reset = true; lastOk = false;
      },
      state: () => ({ frames, resets, size: [W, H], jitter: [_jit[0], _jit[1]], held: !!hist, velocity: !!velT }),
      dispose() { try { histInit.dispose(); outInit.dispose(); } catch (_) { /* device dying */ } },
    };
  }

  window.TLXAA = Object.freeze({
    halton, jitterPx, jitterNdc, applyJitter, reproject, clampRGB, disoccluded, forwardOf, camCut, ssCeil, ssRetina, hdrPeak,
    velocity, velReproject, objMotionPx, velRejected, velocityMrt, agx,
    taa, PHASES, DEPTH_TOL, HDR_PEAK, SS_MAX, SS_CINE, VEL_MAX_PX,
  });
})();
