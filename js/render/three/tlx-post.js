/* Apex 26 — TLXShaders.postChain: the post-processing ORCHESTRATION for the
 * TLX backend (M8). The three.js sibling of js/render/glx/post.js: owns the
 * render targets (full-res HDR scene + sampleable depth, the 5-level bloom
 * mip chain, half-res SSAO + godray pairs, the full-res LDR FXAA input), the
 * pass order, target ping-pong, and the whole CPU side of present(opts) —
 * per-block gating, tune-knob defaults (TUNE_DEFS mirrors), the sun-UV /
 * _sunGate projection, and the godray nearest-12 lamp selection.
 *
 * PASS ORDER (glx/post.js present() 1:1):
 *   0.  SSAO (half res)  -> separable blur H+V          (aoStr|contact gated)
 *   0b. GODRAY (half res, world-space sun-map march) -> double blur H+V x2
 *   1.  BRIGHT pass  scene -> bloom level 0 (half res)  (bloomAmt gated)
 *   2.  DOWN x(n-1)  13-tap Jimenez mip chain; Karis on the first mip only
 *       UP   x(n-1)  9-tap tent, ADDITIVE into each larger level; the FINAL
 *                    pass into level 0 OVERWRITES (js/render/glx/shaders/glsl-post.js)
 *   3.  COMPOSITE    -> LDR target (all 58 uniforms; ACES/grade/SSR/flare)
 *   4.  FXAA         -> canvas
 *
 * PER-BLOCK BAIL: a disabled block allocates NOTHING — the SSAO pair, the
 *   godray pair and the bloom chain are created lazily on the first frame
 *   their gate opens (ensure*()); until then the composite reads the 1x1
 *   white/black no-op fallbacks, exactly like GLX's whiteTex/blackTex binds.
 *
 * LAMP-MAP SNAPSHOT: present() reads S.lampArmed for the godray lamp-index
 *   mapping BEFORE tlx.js clears the armed flags (clearArmed runs after this
 *   chain returns) — the GLX ordering where the godray pass consumes the
 *   armed state that present() then retires.
 *
 * DEVIATION vs GLX (documented, deliberate): no MSAA scene target — three's
 *   RenderTarget MSAA resolve doesn't expose the resolved DEPTH the SSAO/SSR/
 *   godray blocks need, so TLX runs the GLX mobile-tier recipe (no MSAA,
 *   FXAA carries the edge AA) on every tier. No invalidateFramebuffer either
 *   (three owns attachment lifecycle).
 *
 * SHAPE CONTRACT (see tlx.js header): publishes a FACTORY,
 *     TLXShaders.postChain = (THREE, TSL, ctx) => ({ enabled, hdrOk,
 *         sceneTarget, resize, present, state, viz }) | throws -> caller
 * disables post (tlx.js renders direct to canvas, the M7 look).
 * ctx = { renderer, isMobile, chunks, shadow, viz }. NEVER touches THREE/TSL
 * at script eval — three exists only inside TLX.create().
 */
"use strict";

(function () {
  const POST_VIZ = ["ssao", "bloom", "shafts", "godray", "composite-off", "scene"];

  function postChain(THREE, TSL, ctx) {
    const renderer = ctx.renderer;
    // Every resource created by this chain stays owned here, including lazy
    // targets. The renderer keeps GPU-side state after JS references disappear,
    // so runtime degradation and partial construction both need an explicit,
    // idempotent unwind.
    const ownedRTs = new Set();
    const ownedTextures = new Set();
    const ownedMaterials = new Set();
    let quad = null;
    let disposed = false;
    function ownRT(rt) { ownedRTs.add(rt); return rt; }
    function ownTexture(tex) { if (tex) ownedTextures.add(tex); return tex; }
    function trackMaterial(mat) { if (mat) ownedMaterials.add(mat); return mat; }
    function dispose() {
      if (disposed) return;
      disposed = true;
      if (quad) quad.material = null;
      for (const mat of ownedMaterials) {
        try { mat.dispose(); } catch (_) { /* device already dying */ }
      }
      // RenderTarget.dispose owns all MRT colour attachments and its depth
      // texture. Do not separately dispose those textures here.
      for (const rt of ownedRTs) {
        try { rt.dispose(); } catch (_) { /* device already dying */ }
      }
      for (const tex of ownedTextures) {
        try { tex.dispose(); } catch (_) { /* device already dying */ }
      }
      ownedMaterials.clear(); ownedRTs.clear(); ownedTextures.clear();
    }
    try {
    // ctx.isMobile is deliberately NOT read here, and that is a decision, not a
    // dropped gate: the MSAA deviation above means this chain already runs the
    // GLX mobile-tier recipe (no multisampled scene target, FXAA carries the
    // AA) on every tier, and every remaining block is gated by the caller —
    // present(opts) receives ssao/godray/bloom already zeroed by PerfGov.tier()
    // and the GRAPHICS preset, so a disabled block allocates nothing (the
    // per-block bail above). A second phone-only gate here would shadow the
    // governor's decision rather than add to it. The one place where a phone
    // still costs more than GLX is FORMAT, not gating: GLX uses R8 for the SSAO
    // pair and R11F_G11F_B10F for bloom/godray, while three exposes neither as
    // a render-target format — those targets are RGBA8/RGBA16F here (~4 MB more
    // at phone resolution). Documented, accepted, not silently unnoticed.
    const shadow = ctx.shadow || null;
    const viz = (ctx.viz && POST_VIZ.indexOf(ctx.viz) >= 0) ? ctx.viz : null;
    // The RT the viz branch last wrote — see presentedTarget().
    let _vizDest = null;

    // ── HDR capability. RGBA16F needs a *renderable* half-float colour
    // buffer. iOS Safari WebGL2 typically exposes EXT_color_buffer_half_float
    // and NOT EXT_color_buffer_float (the 32-bit one). Checking only the
    // latter forced UnsignedByteType + ACES on an 8-bit scene — the pale
    // washed ground. A query that throws must not keep hdr=true on a phone
    // (incomplete HalfFloat framebuffer = black / half-black frame).
    let hdr = !!(renderer.backend && renderer.backend.isWebGPUBackend);
    try {
      const gl = renderer.backend && renderer.backend.gl;
      if (gl) {
        hdr = !!(gl.getExtension("EXT_color_buffer_float")
              || gl.getExtension("EXT_color_buffer_half_float"));
      }
    } catch (_) { hdr = !!(renderer.backend && renderer.backend.isWebGPUBackend); }
    const hdrType = hdr ? THREE.HalfFloatType : THREE.UnsignedByteType;

    // ── 1x1 no-op fallbacks (glx/post.js whiteTex/blackTex) ─────────────────
    function onePx(v) {
      const t = ownTexture(new THREE.DataTexture(new Uint8Array([v, v, v, 255]), 1, 1));
      t.colorSpace = THREE.NoColorSpace;
      t.needsUpdate = true;
      return t;
    }
    const whiteTex = onePx(255);
    const blackTex = onePx(0);

    // ── LENS DIRT smudge map: the glx/post.js makeDirtTex canvas port —
    // deterministic LCG seed, value-noise base + grime blobs + dust specks +
    // wipe streaks. A failed canvas leaves the black fallback (knob no-ops).
    function makeDirtTex() {
      try {
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
        // Plain Texture over the canvas (CanvasTexture isn't exported by the
        // vendored webgpu bundle — same object, needsUpdate set by hand).
        const t = ownTexture(new THREE.Texture(cv));
        t.minFilter = THREE.LinearFilter;
        t.magFilter = THREE.LinearFilter;
        t.generateMipmaps = false;
        t.colorSpace = THREE.NoColorSpace;
        t.needsUpdate = true;
        return t;
      } catch (_) { return null; }   // no canvas 2D → knob becomes a no-op (black fallback)
    }
    const dirtTex = makeDirtTex();

    // ── render-target helpers ────────────────────────────────────────────────
    function makeRT(w, h, type, format) {
      const rt = ownRT(new THREE.RenderTarget(w, h, {
        type, depthBuffer: false,
        format: format || THREE.RGBAFormat,
      }));
      rt.texture.generateMipmaps = false;
      rt.texture.colorSpace = THREE.NoColorSpace;
      return rt;
    }

    // The CRITICAL target: every 3D pixel goes through it. Full-res HDR +
    // a SAMPLEABLE depth texture (NO compareFunction — raw reads for SSAO/
    // SSR/godray reconstruction; the shadow maps keep their own compare ones).
    let W = 1, H = 1;
    // Track depth independently until the RenderTarget adopts it, so a target
    // constructor throw still releases a partially-created depth texture.
    const sceneDepthTex = ownTexture(new THREE.DepthTexture(1, 1));
    sceneDepthTex.name = "TLXSceneDepth";
    const sceneRT = ownRT(new THREE.RenderTarget(1, 1, {
      type: hdrType, count: 2, depthBuffer: true, depthTexture: sceneDepthTex,
    }));
    ownedTextures.delete(sceneDepthTex); // sceneRT.dispose owns it from here
    sceneRT.texture.name = "output";
    sceneRT.texture.generateMipmaps = false;
    sceneRT.texture.colorSpace = THREE.NoColorSpace;
    // Attachment 1: SSR car-paint tag (0.35). r185 cannot store that in
    // scene alpha (NoBlending → isOpaque false → output.a is coverage).
    let sceneTagTex = sceneRT.texture;
    if (sceneRT.textures && sceneRT.textures[1]) {
      sceneRT.textures[1].name = "ssrTag";
      sceneRT.textures[1].generateMipmaps = false;
      sceneRT.textures[1].colorSpace = THREE.NoColorSpace;
      sceneTagTex = sceneRT.textures[1];
    }
    // LDR target: composite output, FXAA input (always allocated — FXAA is
    // the unconditional resolve, like GLX's ldrFBO).
    const ldrRT = makeRT(1, 1, THREE.UnsignedByteType);
    ldrRT.texture.name = "TLXPostLDR";

    // Lazily-created blocks (per-block bail: nothing until the gate opens).
    let ssaoRT = null, ssaoBlurRT = null, aoW = 1, aoH = 1;
    let godrayRT = null, godrayBlurRT = null, grW = 1, grH = 1;
    const BLOOM_DIV = 2, BLOOM_LEVELS_MAX = 5;
    let bloomLv = null;    // [{rt,w,h}] x5, sized by layoutBloom
    let nLv = 0;

    function ensureAO() {
      if (!ssaoRT) {
        // R8 would match GLX byte-for-byte but r8unorm isn't a guaranteed
        // renderable on every WebGPU adapter tier — RGBA8 (only .r consumed)
        // keeps both backends on the safe path.
        ssaoRT = makeRT(1, 1, THREE.UnsignedByteType);
        ssaoBlurRT = makeRT(1, 1, THREE.UnsignedByteType);
        layoutHalf();
      }
      return true;
    }
    function ensureGR() {
      if (!godrayRT) {
        godrayRT = makeRT(1, 1, hdrType);
        godrayBlurRT = makeRT(1, 1, hdrType);
        layoutHalf();
      }
      return true;
    }
    function ensureBloom() {
      if (!bloomLv) {
        bloomLv = [];
        for (let i = 0; i < BLOOM_LEVELS_MAX; i++) bloomLv.push({ rt: makeRT(1, 1, hdrType), w: 1, h: 1 });
        layoutBloom();
      }
      return nLv > 0;
    }
    // three r184 leaked RT textures on setSize(); r185 (#33511) disposes them.
    // Keep the explicit texture disposals so a stale vendor cannot regress the
    // "black frame after resize" report; double-dispose is safe.
    function rtSetSize(rt, w, h) {
      if (rt.width === w && rt.height === h) return;
      rt.setSize(w, h);
      try {
        const ts = rt.textures || (rt.texture ? [rt.texture] : []);
        for (let i = 0; i < ts.length; i++) ts[i].dispose();
        if (rt.depthTexture) rt.depthTexture.dispose();
      } catch (_) { /* best-effort; the worst case is r184's own leak */ }
    }
    function layoutHalf() {
      aoW = Math.max(1, Math.floor(W / 2));
      aoH = Math.max(1, Math.floor(H / 2));
      grW = aoW; grH = aoH;
      if (ssaoRT) { rtSetSize(ssaoRT, aoW, aoH); rtSetSize(ssaoBlurRT, aoW, aoH); }
      if (godrayRT) { rtSetSize(godrayRT, grW, grH); rtSetSize(godrayBlurRT, grW, grH); }
    }
    function layoutBloom() {
      if (!bloomLv) return;
      let bw = Math.max(1, Math.floor(W / BLOOM_DIV));
      let bh = Math.max(1, Math.floor(H / BLOOM_DIV));
      nLv = 0;
      for (let i = 0; i < bloomLv.length; i++) {
        if (bw >= 8 && bh >= 8) {
          rtSetSize(bloomLv[i].rt, bw, bh);
          bloomLv[i].w = bw; bloomLv[i].h = bh;
          nLv++;
        }
        bw = Math.max(1, bw >> 1); bh = Math.max(1, bh >> 1);
      }
    }

    // ── the TSL pass set (tsl-post.js) — needs the REAL scene textures ─────
    const P = TLXShaders.post(THREE, TSL, {
      chunks: ctx.chunks, shadow,
      sceneTex: sceneRT.texture, sceneTagTex, sceneDepthTex,
      dirtTex, whiteTex, blackTex,
      trackMaterial,
    });

    // ── fullscreen runner ───────────────────────────────────────────────────
    quad = new THREE.QuadMesh();
    function runPass(mat, target) {
      quad.material = mat;
      renderer.setRenderTarget(target);
      quad.render(renderer);
    }

    // God-ray lamp-selection scratch (present() only) — no per-frame allocs.
    const _grSel = [];
    // Partial select nearest-K (GLX glx/post.js / WGX) — avoid sorting the
    // full floodlight list every haveGR + lampVol frame.
    function _grKeepNearest(total, k) {
      const n = Math.min(k, total);
      for (let i = 1; i < n; i++) {
        const cur = _grSel[i];
        let j = i - 1;
        while (j >= 0 && _grSel[j].d > cur.d) { _grSel[j + 1] = _grSel[j]; j--; }
        _grSel[j + 1] = cur;
      }
      for (let i = n; i < total; i++) {
        const cur = _grSel[i];
        if (cur.d >= _grSel[n - 1].d) continue;
        let j = n - 2;
        while (j >= 0 && _grSel[j].d > cur.d) j--;
        const insertAt = j + 1;
        // Swap, not overwrite: the shift orphans the evicted top-k object and
        // left `cur` aliased at two indices — the next frame's by-index fill
        // then wrote one lamp's data into both slots (a beam uploaded twice,
        // another lamp permanently unselectable). Keeping the pool a
        // permutation is the whole contract.
        const evicted = _grSel[n - 1];
        for (let m = n - 1; m > insertAt; m--) _grSel[m] = _grSel[m - 1];
        _grSel[insertAt] = cur;
        _grSel[i] = evicted;
      }
      return n;
    }

    // Last-presented-frame block states (__tlx.postState()).
    const _last = { ssao: false, bloom: false, shafts: false, ssr: false, fxaa: false };

    function resize(w, h) {
      if (w === W && h === H) return;
      W = Math.max(1, w | 0); H = Math.max(1, h | 0);
      rtSetSize(sceneRT, W, H);
      rtSetSize(ldrRT, W, H);
      layoutHalf();
      layoutBloom();
    }

    /** Resolve the HDR scene to the canvas — the glx/post.js present() port.
     * F = tlx.js's latched frame state (proj/invProj/invVP/sunVS/upVS/skyHi/
     * skyLo/viewProj/sunDir/sunColor/eye/time/cloud/cloudSpeed/lights). */
    function present(opts, F) {
      const S = shadow ? shadow.S : null;
      // Lamp-map snapshot BEFORE tlx.js clears the armed flags (see header).
      const lampArmed = !!(S && S.lampArmed);
      const o = opts || {};
      const GT = o.tune || null;
      const gk = (id, def) => (GT && GT[id] != null ? GT[id] : def);
      const prevAutoClear = renderer.autoClear;
      renderer.autoClear = false;   // fullscreen passes overwrite; UP accumulates
      let dest = null;
      // try/finally, not a plain restore at the end: tlx.js catches around
      // post.present() and repaints direct-to-canvas — without the finally, a
      // throw mid-chain latches autoClear=false for every later classic-path
      // frame, which skips three's clear and smears the canvas until reload.
      try {

      const threshold = o.threshold !== undefined ? o.threshold : 0.75;
      const bloomAmt = o.bloom !== undefined ? o.bloom : 0.55;
      let aoStr = o.ssao !== undefined ? o.ssao : 0;
      const contactStr = o.contact !== undefined ? o.contact : 0;
      let grStr = o.godray !== undefined ? o.godray : 0;
      // The godray march multiplies lamp in-scatter by the mist uniform, so
      // with GROUND MIST at 0 it computes an exact 0 — skip arming it.
      const lampVol = (o.mist || 0) > 0 ? (o.lampVol || 0) : 0;
      // ?viz= bisect: force the inspected block live so there is something
      // to look at even on a frame whose gate would be closed.
      if (viz === "ssao") aoStr = Math.max(aoStr, 0.95);
      if (viz === "shafts" || viz === "godray") grStr = Math.max(grStr, 0.8);

      // ── 0) SSAO + separable blur (js/render/glx/shaders/glsl-post.js). Runs when EITHER
      // knob is live — contact shadows ride in this pass. ───────────────────
      const haveAO = !!((aoStr > 0 || contactStr > 0) && F.invProj) && ensureAO();
      if (haveAO) {
        const U = P.ssao.U;
        U.invProj.value.fromArray(F.invProj);
        U.proj.value.fromArray(F.proj || F.invProj);
        const sv = F.sunVS || [0, 0, -1];
        U.sunVS.value.set(sv[0], sv[1], sv[2]);
        U.texel.value.set(1 / aoW, 1 / aoH);
        U.strength.value = aoStr;
        U.radius.value = gk("ssaoRadius", 0.6);          // AO RADIUS knob
        const csOn = contactStr > 0 && F.proj && F.sunVS;
        U.contact.value = csOn ? contactStr : 0;
        runPass(P.ssao.mat, ssaoRT);
        // Blur H (ssao -> blur) then V (blur -> ssao). Half res.
        P.blurAO.tex.value = ssaoRT.texture;
        P.blurAO.U.dir.value.set(1 / aoW, 0);
        runPass(P.blurAO.mat, ssaoBlurRT);
        P.blurAO.tex.value = ssaoBlurRT.texture;
        P.blurAO.U.dir.value.set(0, 1 / aoH);
        runPass(P.blurAO.mat, ssaoRT);
      }

      // ── 0b) Volumetric sun shafts + lamp beams (js/render/glx/shaders/glsl-post.js) ─────
      const sunGR = !!(S && S.enabled) && grStr > 0;
      const haveGR = !!(P.godray && F.invVP && (sunGR || lampVol > 0)) && ensureGR();
      if (haveGR) {
        const U = P.godray.U;
        U.invVP.value.fromArray(F.invVP);
        U.lightVP.value.fromArray(S.lightVP);
        const e = F.eye || [0, 0, 0];
        U.eye.value.set(e[0], e[1], e[2]);
        const sd = F.sunDir || [0, 1, 0];
        U.sunDir.value.set(sd[0], sd[1], sd[2]);
        const scl = F.sunColor || [1, 1, 1];
        U.sunColor.value.set(scl[0], scl[1], scl[2]);
        U.str.value = sunGR ? grStr : 0.0;
        U.time.value = F.time || 0;
        U.cloudCover.value = F.cloud || 0;
        U.cloudSpeed.value = F.cloudSpeed != null ? F.cloudSpeed : 1;
        // Lamp volumetrics: nearest-12 to the eye + the mapped-lamp slot.
        let grNL = 0, grLampIdx = -1;
        const L = F.lights;
        if (lampVol > 0 && L) {
          const total = (L.length / 15) | 0;
          const ex = e[0], ey = e[1], ez = e[2];
          for (let i = 0; i < total; i++) {
            const oi = i * 15, dx = L[oi] - ex, dy = L[oi + 1] - ey, dz = L[oi + 2] - ez;
            const d = dx * dx + dy * dy + dz * dz;
            const s = _grSel[i]; if (s) { s.d = d; s.o = oi; } else _grSel[i] = { d, o: oi };
          }
          _grSel.length = total;
          // 6, not 12 — the TSL beam march is bounded at 6 (tsl-post.js Loop
          // end: int(6)). grLampIdx below is a position in THIS ordering, so a
          // mapped floodlight sorting 7th-12th produced a lampShadowIdx the
          // march can never equal: its beam glowed straight through cars and
          // walls instead of being carved by them, on any dense floodlit
          // section. Same defect GLX carried until glx/post.js was cut to 6.
          grNL = _grKeepNearest(total, 6);
          for (let i = 0; i < grNL; i++) {
            const oi = _grSel[i].o;
            // Map the record holding this frame's spot-shadow map to its slot
            // in THIS pass's nearest-N ordering (js/render/glx/shaders/glsl-post.js).
            if (lampArmed && oi === S.lampIdx * 15) grLampIdx = i;
            P.godray.lightPos[i].set(L[oi], L[oi + 1], L[oi + 2]);
            P.godray.lightCol[i].set(L[oi + 3], L[oi + 4], L[oi + 5]);
            P.godray.lightDir[i].set(L[oi + 7], L[oi + 8], L[oi + 9]);
            P.godray.lightGeo[i].set(L[oi + 6], L[oi + 10], L[oi + 11], L[oi + 13]);
          }
        }
        U.numLights.value = grNL;
        U.lampStr.value = lampVol;
        U.mist.value = o.mist || 0;
        U.lampShadowVP.value.fromArray(S.lampLightVP);
        U.lampShadowIdx.value = grLampIdx;
        U.hgAniso.value = gk("godrayAniso", 0.60);       // GOD-RAY FOCUS knob
        U.hgFloor.value = gk("godrayFloor", 0.020);      // GOD-RAY HAZE knob
        runPass(P.godray.mat, godrayRT);
        // Double separable blur (H+V twice) — soft wide volumes, no stripes.
        for (let bp = 0; bp < 2; bp++) {
          P.blurGR.tex.value = godrayRT.texture;
          P.blurGR.U.dir.value.set((1 + bp) / grW, 0);
          runPass(P.blurGR.mat, godrayBlurRT);
          P.blurGR.tex.value = godrayBlurRT.texture;
          P.blurGR.U.dir.value.set(0, (1 + bp) / grH);
          runPass(P.blurGR.mat, godrayRT);
        }
      }

      // ── 1+2) bright pass + mip-chain bloom (js/render/glx/shaders/glsl-post.js) ──────────
      const haveBloom = bloomAmt > 0 && ensureBloom();
      if (haveBloom) {
        P.bright.U.threshold.value = threshold;
        runPass(P.bright.mat, bloomLv[0].rt);
        for (let i = 1; i < nLv; i++) {
          P.down.tex.value = bloomLv[i - 1].rt.texture;
          P.down.U.texel.value.set(1 / bloomLv[i - 1].w, 1 / bloomLv[i - 1].h);
          P.down.U.karis.value = i === 1 ? 1 : 0;   // firefly fix on the first mip only
          runPass(P.down.mat, bloomLv[i].rt);
        }
        P.spread.value = gk("bloomSpread", 1);           // BLOOM SPREAD knob
        for (let i = nLv - 1; i >= 1; i--) {
          // Intermediates accumulate (ONE,ONE); the FINAL into level 0
          // OVERWRITES — level 0 still holds the sharp bright pass.
          const up = i === 1 ? P.upFinal : P.upAdd;
          up.tex.value = bloomLv[i].rt.texture;
          up.U.texel.value.set(1 / bloomLv[i].w, 1 / bloomLv[i].h);
          runPass(up.mat, bloomLv[i - 1].rt);
        }
      }

      // ── 3) composite (js/render/glx/shaders/glsl-post.js) ────────────────────────────────
      const C = P.composite.U;
      P.composite.tex.bloom.value = haveBloom ? bloomLv[0].rt.texture : blackTex;
      // Normalise the mip-chain accumulation (nLv-1 summed octaves).
      C.bloomAmt.value = bloomAmt * 1.25 / Math.max(nLv - 1, 1);
      P.composite.tex.ssao.value = haveAO ? ssaoRT.texture : whiteTex;
      C.aoTexel.value.set(haveAO ? 1 / aoW : 0, haveAO ? 1 / aoH : 0);
      P.composite.tex.godray.value = haveGR ? godrayRT.texture : blackTex;
      C.haveGodray.value = haveGR ? 1 : 0;
      // Sun screen-UV projection + the _sunGate brightness gate + golden-hour
      // flare curve (js/render/glx/shaders/glsl-post.js verbatim).
      let sunUVx = -2, sunUVy = -2, flareStr = 0, sunShaft = 0;
      if (F.sunDir && F.viewProj) {
        const s = F.sunDir, vp = F.viewProj;
        const cx = vp[0] * s[0] + vp[4] * s[1] + vp[8] * s[2];
        const cy = vp[1] * s[0] + vp[5] * s[1] + vp[9] * s[2];
        const cw = vp[3] * s[0] + vp[7] * s[1] + vp[11] * s[2];
        if (cw > 0) {
          sunUVx = cx / cw * 0.5 + 0.5;
          sunUVy = cy / cw * 0.5 + 0.5;
          // Gate flare + shafts by the sun's BRIGHTNESS, not just elevation —
          // the dim night moon-key must never streak lamp heads skyward.
          const _sl = F.sunColor ? Math.max(F.sunColor[0], F.sunColor[1], F.sunColor[2]) : 1;
          const _sunGate = Math.min(1, Math.max(0, (_sl - 0.35) / 0.45));
          if (s[1] > -0.02) {
            const golden = 1.0 - Math.min(Math.max(s[1], 0) / 0.45, 1.0);
            flareStr = (0.14 + golden * 0.30) * _sunGate;
          }
          if (s[1] > 0.05) sunShaft = s[1] * 0.8 * _sunGate;
        }
      }
      C.sunUV.value.set(sunUVx, sunUVy);
      C.flareStr.value = flareStr * (o.flareMul != null ? o.flareMul : 1);   // LENS FLARE knob
      C.exposure.value = o.exposure !== undefined ? o.exposure : 1.0;
      // GATED ON haveBloom: the shaft pass READS THE BLOOM CHAIN
      // (COMPOSITE_FS in js/render/glx/shaders/glsl-post.js). When bloom is off we
      // bind blackTex, so the 8 dependent fetches accumulated vec3(0).
      // GLX zeroes the uniform rather than paying the taps; same here.
      const _shaftMul = gk("sunShaftMul", 1);
      C.sunShaft.value = haveBloom ? sunShaft * _shaftMul : 0;
      const grade = o.grade;
      const gs = (grade && grade.shadow) || null, gh = (grade && grade.hi) || null;
      C.gradeShadow.value.set(gs ? gs[0] : 1, gs ? gs[1] : 1, gs ? gs[2] : 1);
      C.gradeHi.value.set(gh ? gh[0] : 1, gh ? gh[1] : 1, gh ? gh[2] : 1);
      C.gradeStr.value = grade && grade.str !== undefined ? grade.str : 0;
      // IMAGE & COLOUR knobs — every default reproduces the shipped grade.
      C.tone0.value.set(gk("blacks", 0), gk("shadows", 0), gk("midtones", 0), gk("highlights", 0));
      C.tone1.value.set(gk("whites", 0), gk("toe", 0), gk("shoulder", 0), 0);
      C.lift.value.set(gk("liftR", 0), gk("liftG", 0), gk("liftB", 0));
      C.gamma.value.set(gk("gammaR", 1), gk("gammaG", 1), gk("gammaB", 1));
      C.gain.value.set(gk("gainR", 1), gk("gainG", 1), gk("gainB", 1));
      C.contrast.value = gk("contrast", 1.12);
      C.vibrance.value = gk("vibrance", 0.20);
      C.saturation.value = gk("saturation", 1.0);
      // Skip the whole HDR block when every knob is neutral (js/render/glx/post.js).
      const _hg = GT && (
        (GT.blacks || 0) !== 0 || (GT.shadows || 0) !== 0 || (GT.midtones || 0) !== 0 ||
        (GT.highlights || 0) !== 0 || (GT.whites || 0) !== 0 || (GT.toe || 0) !== 0 ||
        (GT.shoulder || 0) !== 0 || (GT.liftR || 0) !== 0 || (GT.liftG || 0) !== 0 ||
        (GT.liftB || 0) !== 0 || (GT.gammaR != null && GT.gammaR !== 1) ||
        (GT.gammaG != null && GT.gammaG !== 1) || (GT.gammaB != null && GT.gammaB !== 1) ||
        (GT.gainR != null && GT.gainR !== 1) || (GT.gainG != null && GT.gainG !== 1) ||
        (GT.gainB != null && GT.gainB !== 1));
      C.hdrGradeOn.value = _hg ? 1 : 0;
      C.tint.value = gk("tint", 0.0);
      C.vignette.value = gk("vignette", 0.80);
      C.vigSoft.value = gk("vignetteSoft", 0.35);
      C.bloomKnee.value = gk("bloomKnee", 0.5);
      C.carReflect.value = o.carReflect != null ? o.carReflect : gk("carReflect", 0.05);
      C.carGloss.value = gk("carGloss", 1.0);
      C.chromAb.value = gk("chromAb", 0.0);
      C.grain.value = gk("grain", 0.0);
      C.grainTime.value = F.time || 0;
      C.sharpen.value = gk("sharpen", 0.0);
      C.blackLift.value = gk("blackLift", 0.005);
      C.whitePoint.value = gk("whitePoint", 1.0);
      // ACES TONE CURVE knobs (defaults = the shipped Narkowicz coefficients).
      C.acesA.value = gk("acesA", 2.51);
      C.acesB.value = gk("acesB", 0.03);
      C.acesC.value = gk("acesC", 2.43);
      C.acesD.value = gk("acesD", 0.59);
      C.acesE.value = gk("acesE", 0.14);
      C.speedBlur.value = o.speedBlur != null ? o.speedBlur : 0.0;
      C.shaftDecay.value = gk("sunShaftDecay", 0.82);
      // Reach scales with SCREEN SUN-SHAFT, sub-linearly so the shipped
      // value (1) keeps the shipped radius (js/render/glx/post.js).
      C.shaftSpread.value = Math.sqrt(Math.max(0.05, _shaftMul));
      C.flareStreak.value = gk("flareStreak", 7.0);
      C.flareStreak2.value = gk("flareStreak2", 0.5);
      // EXHAUST HEAT HAZE plume anchor (opts.haze = {u, v, str} | null).
      const hz = o.haze;
      C.hazeUV.value.set(hz ? hz.u : -9, hz ? hz.v : -9);
      C.hazeStr.value = hz ? hz.str : 0;
      C.hazeTime.value = F.time || 0;
      C.ssrThick.value = gk("ssrThick", 0.20);
      // Camera-aware SSR extent (game.js sets these per camera; onboard cams get
      // a raised top cutoff and a pulled-in near fade).
      C.ssrTopUV.value = o.ssrTopUV != null ? o.ssrTopUV : 0.62;
      C.ssrNear.value = o.ssrNear != null ? o.ssrNear : -2.5;
      C.lensDirt.value = dirtTex ? gk("lensDirt", 0.15) : 0;
      // uReflTexel drives SSR + SHARPEN + the vignette aspect — every frame.
      C.reflTexel.value.set(1 / W, 1 / H);
      // Wet-road/car SSR needs depth + view/proj + world-up-in-view; uSsrOk
      // gates the whole branch on probe-less paths (setup preview).
      const reflStr = o.reflect || 0;
      const haveRefl = !!(F.invProj && F.proj && F.upVS);
      if (haveRefl) {
        C.invProj.value.fromArray(F.invProj);
        C.proj.value.fromArray(F.proj);
        C.upVS.value.set(F.upVS[0], F.upVS[1], F.upVS[2]);
        const hi = F.skyHi || [0.05, 0.06, 0.09];
        const lo = F.skyLo || [0.02, 0.025, 0.05];
        C.reflSkyHi.value.set(hi[0], hi[1], hi[2]);
        C.reflSkyLo.value.set(lo[0], lo[1], lo[2]);
      }
      C.ssrOk.value = haveRefl ? 1 : 0;
      C.reflect.value = haveRefl ? reflStr : 0;

      // ── 3/4) composite -> LDR, FXAA -> canvas (or the ?viz= bisect blit) ──
      // softDest: software-WebGPU present target. Never setRenderTarget(null)
      // on that path — three's default framebuffer calls getCurrentTexture(),
      // which breaks mapAsync device-wide (WGX / Dawn software adapters).
      dest = (typeof ctx.softDest === "function" ? ctx.softDest() : null) || null;
      if (viz) {
        const B = P.blit;
        B.U.mono.value = viz === "ssao" ? 1 : 0;
        B.U.gain.value = 1;
        B.tex.value =
          viz === "ssao" ? (haveAO ? ssaoRT.texture : whiteTex)
          : viz === "bloom" ? (haveBloom ? bloomLv[0].rt.texture : blackTex)
          : (viz === "shafts" || viz === "godray") ? (haveGR ? godrayRT.texture : blackTex)
          : sceneRT.texture;   // composite-off | scene: the raw HDR world
        _vizDest = dest;   // the blit must read what this pass wrote, not ldrRT
        runPass(B.mat, dest);
      } else {
        runPass(P.composite.mat, ldrRT);
        P.fxaa.tex.value = ldrRT.texture;
        P.fxaa.U.texel.value.set(1 / W, 1 / H);
        runPass(P.fxaa.mat, dest);
      }
      _last.ssao = !!haveAO;
      _last.bloom = !!haveBloom;
      _last.shafts = !!haveGR;
      _last.ssr = !!(haveRefl && reflStr > 0.001);
      _last.fxaa = !viz;
      } finally {
        if (!dest) {
          try { renderer.setRenderTarget(null); } catch (_) { /* device dying: tlx.js's catch owns the fallback */ }
        }
        renderer.autoClear = prevAutoClear;
      }
    }

    try { Log.info("gfx", "TLX post init"); } catch (_) { /* harness */ }
    return {
      enabled: () => true,
      hdrOk: () => hdr,
      sceneTarget: () => sceneRT,
      // UnsignedByte composite (FXAA input) — the screenshot / soft-present
      // source. three's readRenderTargetPixelsAsync → backend.copyTextureToBuffer
      // + mapAsync (WebGPU Fundamentals / Explainer). Never getCurrentTexture.
      ldrTarget: () => ldrRT,
      // WHAT THE LAST FRAME ACTUALLY WROTE. The soft-present blit and
      // capturePixels used to read ldrTarget() unconditionally — but the ?viz=
      // branch below writes the bisect image to `dest` and never touches ldrRT,
      // so on the software-WebGPU path every viz mode showed a stale frame no
      // matter what the stage contained. That made the repo's own bisect tool
      // blind on the one backend that needs bisecting. Ask this instead.
      presentedTarget: () => (viz ? _vizDest : ldrRT),
      resize,
      present,
      dispose,
      viz,
      state: () => ({
        on: true,
        hdr,
        blocks: { ssao: _last.ssao, bloom: _last.bloom, shafts: _last.shafts,
                  ssr: _last.ssr, fxaa: _last.fxaa },
        targets: [W, H],
      }),
    };
    } catch (e) {
      dispose();
      throw e;
    }
  }

  window.TLXShaders = Object.assign(window.TLXShaders || {}, { postChain });
})();
