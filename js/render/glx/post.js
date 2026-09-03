/*
 * Apex 26 — GLX post-processing subsystem (split out of js/render/glx/glx.js).
 * Owns the whole post chain: the HDR scene + MSAA targets, bright pass,
 * mip-chain bloom, SSAO, volumetric god rays, the composite (tone-map +
 * grade + SSR + flare + vignette), FXAA resolve, and the procedural lens-dirt
 * texture. Wired through the GLXCore ctx: glx.js calls GLXPost.init(core)
 * inside GLX.init() and delegates present() here.
 * Must load before js/render/glx/glx.js (glx.js calls GLXPost.init at init time).
 */
"use strict";

const GLXPost = (function () {

  function init(core) {
    const gl = core.gl;
    const { useProg, bindVAO, setBlend, setDepthMask, link, locs } = core;
    const MOBILE_TIER = core.MOBILE_TIER;
    const IS_MOBILE = core.IS_MOBILE;
    const { POST_VS, BRIGHT_FS, BLUR_FS, DOWN_FS, UP_FS, SSAO_FS, GODRAY_FS,
            COMPOSITE_FS, FXAA_FS } = GLXShaders;
    const F = core.frame;

    let ssaoProg = null, ssaoU = null, ssaoFBO = null, ssaoTex = null;
    let ssaoBlurFBO = null, ssaoBlurTex = null, whiteTex = null, blackTex = null, dirtTex = null;
    let godrayProg = null, godrayU = null, godrayFBO = null, godrayTex = null;
    let godrayBlurFBO = null, godrayBlurTex = null;
    let godrayW = 0, godrayH = 0;
    let ssaoW = 0, ssaoH = 0;   // SSAO runs at half res (upscaled in composite)
    let fxaaProg = null, fxaaU = null, ldrFBO = null, ldrTex = null;   // FXAA pass + its LDR input

    // Post-processing state. postEnabled stays false (and rendering goes straight
    // to the default framebuffer, exactly as before) if any target/program setup
    // fails, so the game always renders.
    let postEnabled = false;
    let brightProg = null, brightU = null;
    let blurProg = null, blurU = null;
    let downProg = null, downU = null, upProg = null, upU = null;
    let compProg = null, compU = null;
    let sceneFBO = null, sceneTex = null, sceneDepth = null;
    let colorType = null;        // HALF_FLOAT if renderable, else UNSIGNED_BYTE
    // Mip-chain bloom: progressive downsample levels (half res, /4, /8, …), then
    // additive tent upsample back to level 0 — wide multi-octave glow.
    const BLOOM_DIV = 2;         // level 0 at half resolution
    const BLOOM_LEVELS_MAX = 5;
    let bloomLv = [];            // [{fbo, tex, w, h}] — rebuilt on resize
    // MSAA scene target: the geometry passes render into multisampled renderbuffers,
    // resolved (blitFramebuffer) into sceneTex/sceneDepth before post — real edge AA
    // on the HDR path, with FXAA left to clean up what the resolve misses.
    let msaaSamples = 0;         // 0/1 = off (render straight into sceneFBO)
    let msFBO = null, msColorRB = null, msDepthRB = null;

    // God-ray lamp-selection scratch (present() only) — no per-frame allocation.
    // Sized for GR_MAX_LIGHTS = 6 (shaders/post.js GODRAY_FS). These are handed
    // straight to uniform3fv/1fv/2fv, so they must not exceed the declared array
    // length — WebGL2 rejects an over-long upload rather than truncating it.
    const _grPos = new Float32Array(18), _grCol = new Float32Array(18),
          _grRad = new Float32Array(6), _grDir = new Float32Array(18),
          _grCone = new Float32Array(12), _grVolW = new Float32Array(6), _grSel = [];
    const _sunUV = [-2, -2];
    const _ONE3 = [1, 1, 1];
    const _NEGZ = [0, 0, -1];
    const _SKY_HI = [0.05, 0.06, 0.09];
    const _SKY_LO = [0.02, 0.025, 0.05];
    // Tuner-knob upload cache (PERF-FINDINGS §3). Composite grade scalars do
    // not change mid-frame; skip equal re-uploads. Per-frame values (sunUV,
    // flare, exposure, grainTime, haze) still go up every present().
    const _compUf = Object.create(null);
    function uf1(loc, key, v) {
      if (!loc) return;
      if (_compUf[key] !== v) { gl.uniform1f(loc, v); _compUf[key] = v; }
    }
    function uf3(loc, key, x, y, z) {
      if (!loc) return;
      const k1 = key + ".y", k2 = key + ".z";
      if (_compUf[key] !== x || _compUf[k1] !== y || _compUf[k2] !== z) {
        gl.uniform3f(loc, x, y, z);
        _compUf[key] = x; _compUf[k1] = y; _compUf[k2] = z;
      }
    }
    function uf4(loc, key, a, b, c, d) {
      if (!loc) return;
      const k1 = key + ".1", k2 = key + ".2", k3 = key + ".3";
      if (_compUf[key] !== a || _compUf[k1] !== b || _compUf[k2] !== c || _compUf[k3] !== d) {
        gl.uniform4f(loc, a, b, c, d);
        _compUf[key] = a; _compUf[k1] = b; _compUf[k2] = c; _compUf[k3] = d;
      }
    }
    // Partial select nearest-K (match WGX): avoid sorting the full floodlight list.
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

    // Build the post-processing programs + pick a colour format. Returns true if
    // the whole chain is usable; on any failure the caller leaves post disabled.
    function setup() {
      // RGBA16F is the ideal HDR target (preserves sun/specular > 1 for bloom);
      // fall back to 8-bit if float colour buffers aren't renderable.
      const ext = gl.getExtension("EXT_color_buffer_float");
      colorType = ext ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;

      brightProg = link(POST_VS, BRIGHT_FS);
      blurProg = link(POST_VS, BLUR_FS);
      downProg = link(POST_VS, DOWN_FS);
      upProg = link(POST_VS, UP_FS);
      compProg = link(POST_VS, COMPOSITE_FS);
      ssaoProg = link(POST_VS, SSAO_FS);
      godrayProg = link(POST_VS, GODRAY_FS);
      fxaaProg = link(POST_VS, FXAA_FS);
      if (fxaaProg) fxaaU = locs(fxaaProg, ["uTex", "uTexel"]);
      if (!brightProg || !blurProg || !compProg || !downProg || !upProg) return false;
      for (const k in _compUf) delete _compUf[k];
      brightU = locs(brightProg, ["uScene", "uThreshold"]);
      blurU = locs(blurProg, ["uTex", "uDir"]);
      downU = locs(downProg, ["uTex", "uTexel", "uKaris"]);
      upU = locs(upProg, ["uTex", "uTexel", "uSpread"]);
      // MSAA: pick the sample count the HDR colour format actually supports (many
      // mobile GPUs render RGBA16F but not multisampled RGBA16F — query, don't assume).
      try {
        const fmt = colorType === gl.HALF_FLOAT ? gl.RGBA16F : gl.RGBA8;
        const cs = gl.getInternalformatParameter(gl.RENDERBUFFER, fmt, gl.SAMPLES);
        const ds = gl.getInternalformatParameter(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, gl.SAMPLES);
        const cMax = cs && cs.length ? cs[0] : 0;
        const dMax = ds && ds.length ? ds[0] : 0;
        // Desktop: 4× on GRAPHICS: ULTRA (apex26.gfxHigh=1); 2× on HIGH and
        // below when the format supports it — halves MSAA fill vs the old
        // always-4 path while FXAA still cleans specular shimmer.
        // Mobile: no MSAA — two extra full-res multisampled surfaces
        // (~20-30 MB) against a tight jetsam budget; FXAA alone carries the AA.
        // Phones used to inherit 2× when GRAPHICS: HIGH flipped the whole
        // memory tier; IS_MOBILE keeps that from coming back.
        msaaSamples = IS_MOBILE ? 0 : Math.min(4, cMax, dMax);
        if (!IS_MOBILE) {
  // THE SIGNAL WAS MOBILE-ONLY. `apex26.gfxHigh` is written by
  // GfxQuality.syncBootTier(), whose first line is `if (!_isMobile) return
  // false` — so on a DESKTOP the key is never written, this read never saw
  // "0", and the cap below never applied: every desktop preset shipped 4x,
  // which is exactly what this block exists to stop. The preset itself is
  // `apex26.gfxPreset` (GfxQuality's store key) on every device; ULTRA keeps
  // 4x, everything below caps. Unset = the desktop default HIGH, which caps.
          let _ultra = false;
          try {
            const _p = localStorage.getItem("apex26.gfxPreset");
            _ultra = _p === "ultra" || (_p == null && localStorage.getItem("apex26.gfxHigh") === "1");
          } catch (_) { /* blocked storage: cap, the cheaper of the two */ }
          if (!_ultra && msaaSamples > 2) msaaSamples = 2;
        }
        if (msaaSamples < 2) msaaSamples = 0;
      } catch (e) { msaaSamples = 0; }
      compU = locs(compProg, ["uScene", "uBloom", "uSSAO", "uAOTexel", "uGodray", "uHaveGodray", "uBloomAmt", "uBloomKnee", "uSunUV", "uFlareStr", "uExposure", "uSunShaft", "uGradeShadow", "uGradeHi", "uGradeStr", "uContrast", "uVibrance", "uSaturation", "uTint", "uVignette", "uVigSoft", "uTone0", "uTone1", "uLift", "uGamma", "uGain", "uHdrGradeOn", "uCarReflect", "uCarGloss", "uDepth", "uInvProj", "uProj", "uUpVS", "uReflTexel", "uReflect", "uSsrOk", "uReflSkyHi", "uReflSkyLo", "uSsrThick", "uSsrTopUV", "uSsrNear", "uChromAb", "uGrain", "uGrainTime", "uSharpen", "uBlackLift", "uWhitePoint", "uAcesA", "uAcesB", "uAcesC", "uAcesD", "uAcesE", "uSpeedBlur", "uDirt", "uLensDirt", "uHazeUV", "uHazeStr", "uHazeTime", "uShaftDecay", "uShaftSpread", "uFlareStreak", "uFlareStreak2"]);
      if (ssaoProg) ssaoU = locs(ssaoProg, ["uDepth", "uInvProj", "uProj", "uSunVS", "uTexel", "uStrength", "uContact", "uRadius"]);
      if (godrayProg) godrayU = locs(godrayProg, ["uDepth", "uShadowMap", "uInvVP", "uLightVP", "uEye", "uSunDir", "uSunColor", "uStr", "uTime", "uCloudCover", "uCloudSpeed", "uNumLights", "uLightPos[0]", "uLightCol[0]", "uLightRad[0]", "uLightDir[0]", "uLightCone[0]", "uLightVolW[0]", "uMist", "uLampStr", "uHgAniso", "uHgFloor", "uLampShadowMap", "uLampShadowVP", "uLampShadowIdx"]);
      // 1×1 white texture: the "AO off" fallback so the composite multiply is a no-op.
      whiteTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, whiteTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      // 1×1 black texture: the "god-ray off" fallback so the additive term is a no-op.
      blackTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, blackTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      makeDirtTex();
      return true;
    }

    // LENS DIRT smudge map: a small procedural greyscale texture generated on a
    // canvas at init (this repo ships no image assets). A low-frequency value-noise
    // base (random coarse grid upscaled with bilinear smoothing) plus soft grime
    // blobs, dust specks and faint wipe streaks. Deterministic LCG seed → every
    // load gets the same lens. Sampled by COMPOSITE_FS to scatter bloom energy
    // into a veil and to break the sun flare into a blotchy, smudged one.
    function makeDirtTex() {
      try {
        const S = 256;
        const cv = document.createElement("canvas");
        cv.width = cv.height = S;
        const c2 = cv.getContext("2d");
        if (!c2) return;
        let seed = 0x9e3779b9;
        const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
        c2.fillStyle = "#000"; c2.fillRect(0, 0, S, S);
        // value-noise base: coarse random luminance grid, bilinearly upscaled
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
        dirtTex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, dirtTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, cv);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      } catch (e) { dirtTex = null; }   // no canvas 2D → knob becomes a no-op (black fallback)
    }

    // Free every post target before disabling post. The textures/renderbuffers
    // hold the memory (FBO objects are pennies); deletion only auto-detaches
    // from the BOUND framebuffer (see the NOTE inside createTargets), so bind
    // each one first — the disable paths used to leave the just-allocated
    // scene/depth/MSAA surfaces resident for the context's whole life.
    function abandonTargets() {
      const drop = (fbo, a, b) => {
        if (fbo) gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        if (a) gl.deleteTexture(a);
        if (b) gl.deleteTexture(b);
      };
      drop(sceneFBO, sceneTex, sceneDepth); sceneTex = sceneDepth = null;
      if (msFBO) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, msFBO);
        if (msColorRB) gl.deleteRenderbuffer(msColorRB);
        if (msDepthRB) gl.deleteRenderbuffer(msDepthRB);
        msColorRB = msDepthRB = null;
      }
      msaaSamples = 0;   // no scene target = no resolve = no MSAA; msaa() must not report 4 on the direct path
      for (const lv of bloomLv) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, lv.fbo);
        if (lv.tex) gl.deleteTexture(lv.tex);
        gl.deleteFramebuffer(lv.fbo);
      }
      bloomLv = [];
      drop(ssaoFBO, ssaoTex); ssaoTex = null;
      drop(ssaoBlurFBO, ssaoBlurTex); ssaoBlurTex = null;
      drop(godrayFBO, godrayTex); godrayTex = null;
      drop(godrayBlurFBO, godrayBlurTex); godrayBlurTex = null;
      drop(ldrFBO, ldrTex); ldrTex = null;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    // (Re)allocate the scene + bloom render targets at the current size.
    function createTargets() {
      if (!postEnabled) return;
      const { width, height } = core.getSize();
      const internal = colorType === gl.HALF_FLOAT ? gl.RGBA16F : gl.RGBA8;
      // Slimmer formats where full RGBA16F is waste (bandwidth is the tiled-GPU
      // frame cost): SSAO stores one scalar (sampled .r) -> R8; bloom + godray
      // are alpha-less positive HDR colour -> R11F_G11F_B10F (half the bytes;
      // renderable under the same EXT_color_buffer_float the HDR path requires).
      // LDR fallback keeps RGBA8 everywhere.
      const hdrOk = colorType === gl.HALF_FLOAT;
      const mk = (w, h, fmt) => {
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        if (fmt === "r8") gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, w, h, 0, gl.RED, gl.UNSIGNED_BYTE, null);
        else if (fmt === "hdr3" && hdrOk) gl.texImage2D(gl.TEXTURE_2D, 0, gl.R11F_G11F_B10F, w, h, 0, gl.RGB, colorType, null);
        else gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, gl.RGBA, colorType, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        return tex;
      };
      // scene target (full res) + depth as a SAMPLEABLE texture (enables SSAO and
      // any depth-aware post; same pattern already used for the shadow map).
      // NOTE (every block below): bind the FBO BEFORE deleting its old attachments.
      // Deleting a texture only auto-detaches it from the CURRENTLY BOUND
      // framebuffer — deleted-while-attached-elsewhere keeps the storage resident,
      // so old + new full-size target sets were transiently alive together
      // (~tens of MB per setRenderScale call): a jetsam kill on mobile web apps.
      if (!sceneFBO) sceneFBO = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFBO);
      if (sceneTex) gl.deleteTexture(sceneTex);
      if (sceneDepth) gl.deleteTexture(sceneDepth);
      sceneTex = mk(width, height);
      sceneDepth = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, sceneDepth);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, width, height, 0,
        gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFBO);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, sceneTex, 0);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, sceneDepth, 0);
      // The CRITICAL target: every 3D pixel goes through it when post is on. On a
      // driver where RGBA16F + depth-texture isn't a renderable combo (possible
      // even with EXT_color_buffer_float present), skipping this check left
      // postEnabled true and the whole view black — the designed fallback is
      // direct-to-screen rendering, so take it. (Same pattern as msFBO below.)
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        abandonTargets();
        postEnabled = false;
        return;
      }
      // MSAA scene target: multisampled colour + depth renderbuffers, resolved into
      // sceneTex/sceneDepth at present(). Falls back silently (msaaSamples = 0) if
      // the combo doesn't yield a complete FBO on this driver.
      if (msaaSamples > 1) {
        const internalD = gl.DEPTH_COMPONENT24;
        if (!msFBO) msFBO = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, msFBO);   // bound → deletes auto-detach (frees NOW)
        if (msColorRB) gl.deleteRenderbuffer(msColorRB);
        if (msDepthRB) gl.deleteRenderbuffer(msDepthRB);
        msColorRB = gl.createRenderbuffer();
        gl.bindRenderbuffer(gl.RENDERBUFFER, msColorRB);
        gl.renderbufferStorageMultisample(gl.RENDERBUFFER, msaaSamples, internal, width, height);
        msDepthRB = gl.createRenderbuffer();
        gl.bindRenderbuffer(gl.RENDERBUFFER, msDepthRB);
        gl.renderbufferStorageMultisample(gl.RENDERBUFFER, msaaSamples, internalD, width, height);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, msColorRB);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, msDepthRB);
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
          // Bail cleanly: without this the two just-allocated multisampled
          // surfaces (~30 MB at full res) stayed attached to msFBO forever.
          gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, null);
          gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, null);
          gl.deleteRenderbuffer(msColorRB); gl.deleteRenderbuffer(msDepthRB);
          msColorRB = null; msDepthRB = null;
          msaaSamples = 0;
        }
      }
      // bloom mip chain (half res, /4, /8, … — stop once a level gets tiny)
      for (const lv of bloomLv) { if (lv.tex) gl.deleteTexture(lv.tex); if (lv.fbo) gl.deleteFramebuffer(lv.fbo); }
      bloomLv = [];
      let bw = Math.max(1, Math.floor(width / BLOOM_DIV));
      let bh = Math.max(1, Math.floor(height / BLOOM_DIV));
      for (let i = 0; i < BLOOM_LEVELS_MAX && bw >= 8 && bh >= 8; i++) {
        const tex = mk(bw, bh, "hdr3");
        const fbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
        // Level 0 proves the RGBA16F-colour-only combo renders on this driver;
        // deeper levels are the same format, so one check covers the chain.
        if (i === 0 && gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
          gl.deleteTexture(tex); gl.deleteFramebuffer(fbo);
          abandonTargets();   // the scene/MSAA targets above must not stay resident
          postEnabled = false;
          return;
        }
        bloomLv.push({ fbo, tex, w: bw, h: bh });
        bw = Math.max(1, bw >> 1); bh = Math.max(1, bh >> 1);
      }
      // SSAO targets (HALF res): raw AO + a blurred copy to denoise the 12-tap pass.
      // AO is low-frequency, so half-res + LINEAR upscale in the composite is ~75%
      // cheaper with no visible loss (depth is still sampled at full res per tap).
      if (ssaoProg) {
        ssaoW = Math.max(1, Math.floor(width / 2));
        ssaoH = Math.max(1, Math.floor(height / 2));
        if (!ssaoFBO) ssaoFBO = gl.createFramebuffer();
        if (!ssaoBlurFBO) ssaoBlurFBO = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, ssaoFBO);
        if (ssaoTex) gl.deleteTexture(ssaoTex);
        ssaoTex = mk(ssaoW, ssaoH, "r8");
        gl.bindFramebuffer(gl.FRAMEBUFFER, ssaoFBO);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, ssaoTex, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, ssaoBlurFBO);
        if (ssaoBlurTex) gl.deleteTexture(ssaoBlurTex);
        ssaoBlurTex = mk(ssaoW, ssaoH, "r8");
        gl.bindFramebuffer(gl.FRAMEBUFFER, ssaoBlurFBO);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, ssaoBlurTex, 0);
      }
      // God-ray targets (half res): raw shafts + a blurred copy to soften the march.
      if (godrayProg) {
        godrayW = Math.max(1, Math.floor(width / 2));
        godrayH = Math.max(1, Math.floor(height / 2));
        if (!godrayFBO) godrayFBO = gl.createFramebuffer();
        if (!godrayBlurFBO) godrayBlurFBO = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, godrayFBO);
        if (godrayTex) gl.deleteTexture(godrayTex);
        godrayTex = mk(godrayW, godrayH, "hdr3");
        gl.bindFramebuffer(gl.FRAMEBUFFER, godrayFBO);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, godrayTex, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, godrayBlurFBO);
        if (godrayBlurTex) gl.deleteTexture(godrayBlurTex);
        godrayBlurTex = mk(godrayW, godrayH, "hdr3");
        gl.bindFramebuffer(gl.FRAMEBUFFER, godrayBlurFBO);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, godrayBlurTex, 0);
      }
      // LDR target (full res, RGBA8): the composite renders here so the FXAA pass
      // can edge-detect on the final tonemapped image, then resolve to the screen.
      if (fxaaProg) {
        if (!ldrFBO) ldrFBO = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, ldrFBO);
        if (ldrTex) gl.deleteTexture(ldrTex);
        ldrTex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, ldrTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.bindFramebuffer(gl.FRAMEBUFFER, ldrFBO);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, ldrTex, 0);
      }
      // Checks whichever optional FBO was configured LAST (ldr if FXAA linked,
      // else godray blur, else ssao blur) — a completeness canary for the r8/
      // hdr3 combos mk() itself never verifies, not a check of one named target.
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
        abandonTargets();
        postEnabled = false;     // unsupported combo: fall back to direct rendering
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    // Tile GPUs (every phone; Apple desktop through ANGLE-Metal) open a render
    // pass by LOADING the attachment's previous contents into tile memory
    // unless told otherwise, and Apple's own guidance is that a load is
    // "significantly slower than dontCare or clear". ANGLE maps an
    // invalidateFramebuffer issued right after the bind — before any draw —
    // to loadAction DontCare for that pass. Every fullscreen post pass below
    // overwrites its whole target, so the load is pure tile traffic; bind
    // through this and the pass starts empty. The additive bloom upsample
    // levels MUST load (they accumulate) and keep the plain bind. The default
    // framebuffer takes gl.COLOR, an FBO gl.COLOR_ATTACHMENT0 (WebGL2 §5.14).
    const _INV_COLOR = [gl.COLOR_ATTACHMENT0], _INV_DEFAULT = [gl.COLOR], _INV_DEPTH = [gl.DEPTH_ATTACHMENT];
    const _canInvalidate = typeof gl.invalidateFramebuffer === "function";
    function bindOverwrite(fbo) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      if (_canInvalidate) gl.invalidateFramebuffer(gl.FRAMEBUFFER, fbo ? _INV_COLOR : _INV_DEFAULT);
    }

    // Bind the frame's scene render target (the MSAA or HDR offscreen target when
    // post is enabled, else the default framebuffer) and restore the full-size
    // viewport. Used by GLX.begin() and by the shadow passes' End rebind.
    function bindSceneTarget() {
      gl.bindFramebuffer(gl.FRAMEBUFFER, postEnabled ? (msaaSamples > 1 ? msFBO : sceneFBO) : null);
      const { width, height } = core.getSize();
      gl.viewport(0, 0, width, height);
    }

    // Resolve the HDR scene to the screen: extract bright areas, blur them into a
    // bloom buffer, then composite scene + bloom with tonemap + vignette. No-op when
    // post is disabled (the scene was drawn straight to the screen already).
    function present(opts) {
      const SH = core.shadow;
      // Car shadow map must be re-armed by a fresh carShadowBegin every frame —
      // when game.js stops running the pass (night, knob off, menu) the stale map
      // must not keep shadowing. Same contract for the lamp spot map, but its
      // armed state must survive until AFTER the godray pass below consumes it.
      SH.carArmed = false;
      const lampArmed = SH.lampArmed;
      SH.lampArmed = false;
      if (!postEnabled) { core.gpuTimerEnd(); return; }
      const { width, height } = core.getSize();
      const threshold = opts && opts.threshold !== undefined ? opts.threshold : 0.75;
      const bloomAmt = opts && opts.bloom !== undefined ? opts.bloom : 0.55;
      const aoStr = opts && opts.ssao !== undefined ? opts.ssao : 0;
      const contactStr = opts && opts.contact !== undefined ? opts.contact : 0;
      const haveAO = ssaoProg && (aoStr > 0 || contactStr > 0) && F.invProj && ssaoFBO;
      const grStrPre = opts && opts.godray !== undefined ? opts.godray : 0;
      // GODRAY_FS multiplies the whole lamp accumulation by uMist (the lamp
      // in-scatter needs particles to scatter off), so with GROUND MIST at 0
      // the march computes an exact 0 — zeroing lampVol here sheds the
      // half-res march + blurs + composite operand with bit-identical output.
      const lampVolPre = ((opts && opts.mist) || 0) > 0 ? ((opts && opts.lampVol) || 0) : 0;
      const haveGRPre = godrayProg && F.invVP && godrayFBO && ((SH.enabled && grStrPre > 0) || lampVolPre > 0);
      // Must match the composite upload: omitted carReflect means the 0.05
      // tuner default, so car-paint SSR still marches (and still reads depth).
      // `opts.carReflect > 0.001` is false for undefined and skipped the blit
      // on a dry night with AO/godray/flare already off.
      const _carReflPre = opts && opts.carReflect != null ? opts.carReflect
        : (opts && opts.tune && opts.tune.carReflect != null ? opts.tune.carReflect : 0.05);
      const ssrOn = ((opts && opts.reflect) > 0.001) || _carReflPre > 0.001;
      const _slPre = F.sunColor ? Math.max(F.sunColor[0], F.sunColor[1], F.sunColor[2]) : 1;
      const flareMaybe = !!(F.sunDir && F.sunDir[1] > -0.02 && _slPre > 0.35);
      const needDepth = haveAO || haveGRPre || ssrOn || flareMaybe;

      // MSAA resolve: average the multisampled scene into sceneTex (and copy depth
      // into sceneDepth for SSAO/god-rays/SSR/flare) before any post pass samples
      // them. Skip the depth blit when nothing will read sceneDepth — auto-tier
      // 4 night sheds AO, contact, godray, SSR and flare together.
      if (msaaSamples > 1) {
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, msFBO);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, sceneFBO);
        gl.blitFramebuffer(0, 0, width, height, 0, 0, width, height,
          needDepth ? (gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT) : gl.COLOR_BUFFER_BIT, gl.NEAREST);
        // The multisampled surfaces are consumed — discard them so a tiled (mobile)
        // GPU never writes them back to memory (MDN WebGL best-practice; big
        // bandwidth/tile-store win, esp. for the multisampled DEPTH).
        if (gl.invalidateFramebuffer) gl.invalidateFramebuffer(gl.READ_FRAMEBUFFER, [gl.COLOR_ATTACHMENT0, gl.DEPTH_ATTACHMENT]);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      } else if (!needDepth && _canInvalidate && sceneFBO) {
        // Direct path (no MSAA — every phone): nothing below samples sceneDepth
        // this frame (auto-tier 4 night sheds AO, contact, godray, SSR and
        // flare together), and the scene pass is still open on sceneFBO, so
        // tell the tiler to drop the depth tile instead of writing a full-res
        // depth surface back to memory that no pass will read.
        gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFBO);
        gl.invalidateFramebuffer(gl.FRAMEBUFFER, _INV_DEPTH);
      }

      // Fullscreen passes must overwrite (no blend) and write depth normally; draws
      // above leave state undeclared, so set what we need through the cache.
      setBlend(false);
      setDepthMask(true);
      gl.disable(gl.DEPTH_TEST);
      bindVAO(core.skyVAO);   // reuse the empty VAO for fullscreen triangles

      // 0) SSAO: raw AO from the depth texture, then a separable blur to denoise.
      // Runs when EITHER knob is live: contact shadows ride in this pass, and
      // gating on AO alone silently killed the independent-looking CONTACT
      // SHADOW slider whenever AMBIENT OCCLUSION was dialled to 0. uStrength=0
      // yields ao=1 in the shader, so an AO-off/contact-on pass darkens only
      // the sun-blocked contact pixels.
      if (haveAO) {
        gl.viewport(0, 0, ssaoW, ssaoH);
        bindOverwrite(ssaoFBO);
        useProg(ssaoProg);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, sceneDepth);
        gl.uniform1i(ssaoU.uDepth, 0);
        gl.uniformMatrix4fv(ssaoU.uInvProj, false, F.invProj);
        gl.uniform2f(ssaoU.uTexel, 1 / ssaoW, 1 / ssaoH);
        gl.uniform1f(ssaoU.uStrength, aoStr);
        // AO RADIUS knob: world-space sampling reach (def 0.6).
        gl.uniform1f(ssaoU.uRadius, opts && opts.tune && opts.tune.ssaoRadius != null ? opts.tune.ssaoRadius : 0.6);
        // Contact shadows ride along in the AO pass when proj + view-sun are present.
        const csOn = contactStr > 0 && F.proj && F.sunVS;
        gl.uniformMatrix4fv(ssaoU.uProj, false, F.proj || F.invProj);
        gl.uniform3fv(ssaoU.uSunVS, F.sunVS || _NEGZ);
        gl.uniform1f(ssaoU.uContact, csOn ? contactStr : 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        // Blur H (ssaoTex -> ssaoBlurFBO) then V (ssaoBlurTex -> ssaoFBO). Half res.
        useProg(blurProg);
        gl.uniform1i(blurU.uTex, 0);
        bindOverwrite(ssaoBlurFBO);
        gl.bindTexture(gl.TEXTURE_2D, ssaoTex);
        gl.uniform2f(blurU.uDir, 1 / ssaoW, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        bindOverwrite(ssaoFBO);
        gl.bindTexture(gl.TEXTURE_2D, ssaoBlurTex);
        gl.uniform2f(blurU.uDir, 0, 1 / ssaoH);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }

      // 0b) Volumetric sun shafts: world-space march of the sun shadow map (half-res)
      // then a separable blur. Gated on the sun being up (grStr > 0) + shadows on.
      const grStr = grStrPre;
      const lampVol = lampVolPre;
      const sunGR = SH.enabled && grStr > 0;
      const haveGR = haveGRPre;
      if (haveGR) {
        gl.viewport(0, 0, godrayW, godrayH);
        bindOverwrite(godrayFBO);
        useProg(godrayProg);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, sceneDepth);
        gl.uniform1i(godrayU.uDepth, 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, SH.mapTex);
        gl.uniform1i(godrayU.uShadowMap, 1);
        gl.uniformMatrix4fv(godrayU.uInvVP, false, F.invVP);
        gl.uniformMatrix4fv(godrayU.uLightVP, false, SH.lightVP);
        gl.uniform3fv(godrayU.uEye, F.eye);
        gl.uniform3fv(godrayU.uSunDir, F.sunDir);
        gl.uniform3fv(godrayU.uSunColor, F.sunColor || _ONE3);
        gl.uniform1f(godrayU.uStr, sunGR ? grStr : 0.0);
        gl.uniform1f(godrayU.uTime, F.time);
        gl.uniform1f(godrayU.uCloudCover, F.cloud);
        gl.uniform1f(godrayU.uCloudSpeed, F.cloudSpeed);
        // Lamp volumetrics: upload the nearest GR_MAX_LIGHTS (6) lamps to the eye
        // + the haze gate. This used to sort and upload 12 while the beam march
        // in GODRAY_FS read 6, which cost double the packing and uploads AND
        // broke the beam shadow: grLampIdx below is a position in THIS ordering,
        // so the mapped lamp sorting 7th-12th produced an index the march's
        // `li == uLampShadowIdx` test could never reach and the lamp's shadow
        // silently stopped being carved into its own beam.
        let grNL = 0, grLampIdx = -1;
        const frameLights = F.lights, frameEye = F.eye;
        if (lampVol > 0 && frameLights) {
          const L = frameLights, total = (L.length / 15) | 0;
          const ex = frameEye[0], ey = frameEye[1], ez = frameEye[2];
          for (let i = 0; i < total; i++) {
            const o = i * 15, dx = L[o] - ex, dy = L[o + 1] - ey, dz = L[o + 2] - ez;
            const d = dx * dx + dy * dy + dz * dz;
            const e = _grSel[i]; if (e) { e.d = d; e.o = o; } else _grSel[i] = { d: d, o: o };
          }
          _grSel.length = total;
          grNL = _grKeepNearest(total, 6);   // == GR_MAX_LIGHTS, the beam march's bound
          for (let i = 0; i < grNL; i++) {
            const o = _grSel[i].o;
            // Map the frame.lights record that has this frame's spot-shadow map
            // to its slot in THIS pass's nearest-N ordering (the two differ: the
            // lit pass indexes frame.lights directly, this pass re-sorts by eye).
            if (lampArmed && o === SH.lampIdx * 15) grLampIdx = i;
            _grPos[i*3]=L[o]; _grPos[i*3+1]=L[o+1]; _grPos[i*3+2]=L[o+2];
            _grCol[i*3]=L[o+3]; _grCol[i*3+1]=L[o+4]; _grCol[i*3+2]=L[o+5];
            _grRad[i]=L[o+6];
            _grDir[i*3]=L[o+7]; _grDir[i*3+1]=L[o+8]; _grDir[i*3+2]=L[o+9];
            _grCone[i*2]=L[o+10]; _grCone[i*2+1]=L[o+11];
            _grVolW[i]=L[o+13];
          }
          gl.uniform3fv(godrayU["uLightPos[0]"], _grPos);
          gl.uniform3fv(godrayU["uLightCol[0]"], _grCol);
          gl.uniform1fv(godrayU["uLightRad[0]"], _grRad);
          gl.uniform3fv(godrayU["uLightDir[0]"], _grDir);
          gl.uniform2fv(godrayU["uLightCone[0]"], _grCone);
          gl.uniform1fv(godrayU["uLightVolW[0]"], _grVolW);
        }
        gl.uniform1i(godrayU.uNumLights, grNL);
        gl.uniform1f(godrayU.uLampStr, lampVol);
        gl.uniform1f(godrayU.uMist, (opts && opts.mist) || 0);
        // Nearest-floodlight spot shadow: the sampler must ALWAYS point at a real
        // compare-mode depth texture on its own unit — left at the default unit 0
        // it would alias uDepth (a plain sampler2D), and two sampler TYPES on one
        // unit is a draw-time GL error even when the branch never samples. The
        // sun map is the type-compatible stand-in when the lamp map is absent.
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, SH.lampTex || SH.mapTex);
        gl.uniform1i(godrayU.uLampShadowMap, 2);
        gl.uniformMatrix4fv(godrayU.uLampShadowVP, false, SH.lampLightVP);
        gl.uniform1i(godrayU.uLampShadowIdx, grLampIdx);
        gl.activeTexture(gl.TEXTURE0);
        // GOD-RAY FOCUS / HAZE knobs (defaults reproduce the shipped shaft phase).
        const GT = opts && opts.tune || null;
        gl.uniform1f(godrayU.uHgAniso, GT && GT.godrayAniso != null ? GT.godrayAniso : 0.60);
        gl.uniform1f(godrayU.uHgFloor, GT && GT.godrayFloor != null ? GT.godrayFloor : 0.020);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        useProg(blurProg);
        gl.uniform1i(blurU.uTex, 0);
        gl.activeTexture(gl.TEXTURE0);
        // Double separable blur (H+V twice): the march + shadow slices otherwise
        // leave thin stripe artifacts that read as "random tiny rays" — two passes
        // turn the shafts into wide, soft volumes.
        for (let bp = 0; bp < 2; bp++) {
          bindOverwrite(godrayBlurFBO);
          gl.bindTexture(gl.TEXTURE_2D, godrayTex);
          gl.uniform2f(blurU.uDir, (1 + bp) / godrayW, 0);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
          bindOverwrite(godrayFBO);
          gl.bindTexture(gl.TEXTURE_2D, godrayBlurTex);
          gl.uniform2f(blurU.uDir, 0, (1 + bp) / godrayH);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
        }
      }

      // 1+2) bright-pass + mip-chain bloom. The whole ~10-14 fullscreen-pass chain
      //    only feeds the composite's bloom sampler, which is scaled by bloomAmt —
      //    so when bloom is off (bloomAmt <= 0) skip it all and let the composite
      //    read blackTex (bound below) for a zero contribution.
      // An EMPTY chain is legal: createTargets() only builds levels while the half-res
      // size is >= 8px, so a not-yet-laid-out (1x1-clamped) canvas leaves bloomLv = []
      // with postEnabled still true. Treat that exactly like bloom-off — without the
      // nLv gate present() dereferenced bloomLv[0] and threw every frame.
      const nLv = bloomLv.length;
      const doBloom = bloomAmt > 0 && nLv > 0;
      if (doBloom) {
        // 1) bright-pass scene -> bloom level 0 (half res)
        gl.viewport(0, 0, bloomLv[0].w, bloomLv[0].h);
        bindOverwrite(bloomLv[0].fbo);
        useProg(brightProg);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, sceneTex);
        gl.uniform1i(brightU.uScene, 0);
        gl.uniform1f(brightU.uThreshold, threshold);
        gl.drawArrays(gl.TRIANGLES, 0, 3);

        // 2) mip-chain bloom: progressive 13-tap downsample to the smallest level,
        //    then additive 9-tap tent upsample back up — each level contributes one
        //    octave of blur, so bright sources get a tight core AND a wide soft halo.
        useProg(downProg);
        gl.uniform1i(downU.uTex, 0);
        for (let i = 1; i < nLv; i++) {
          bindOverwrite(bloomLv[i].fbo);
          gl.viewport(0, 0, bloomLv[i].w, bloomLv[i].h);
          gl.bindTexture(gl.TEXTURE_2D, bloomLv[i - 1].tex);
          gl.uniform2f(downU.uTexel, 1 / bloomLv[i - 1].w, 1 / bloomLv[i - 1].h);
          // Karis partial luma weighting on the FIRST downsample only — that's
          // where sub-pixel HDR spikes (the bloom "fireflies") get averaged in;
          // later mips are already low-pass and keep the plain 13-tap kernel.
          gl.uniform1f(downU.uKaris, i === 1 ? 1 : 0);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
        }
        useProg(upProg);
        gl.uniform1i(upU.uTex, 0);
        // BLOOM SPREAD knob: widen/tighten every octave's tent radius uniformly.
        gl.uniform1f(upU.uSpread, opts && opts.tune && opts.tune.bloomSpread != null ? opts.tune.bloomSpread : 1);
        for (let i = nLv - 1; i >= 1; i--) {
          // Intermediate levels accumulate (ONE, ONE) so every octave sums; the FINAL
          // pass into level 0 OVERWRITES instead — level 0 still holds the sharp
          // unblurred bright-pass, and adding onto it would re-inject the scene's
          // bright areas at full sharpness (large lamp-lit surfaces wash out).
          const last = i === 1;
          setBlend(!last);
          if (!last) gl.blendFunc(gl.ONE, gl.ONE);
          // Accumulating levels load; the final overwrite into level 0 need not.
          if (last) bindOverwrite(bloomLv[i - 1].fbo); else gl.bindFramebuffer(gl.FRAMEBUFFER, bloomLv[i - 1].fbo);
          gl.viewport(0, 0, bloomLv[i - 1].w, bloomLv[i - 1].h);
          gl.bindTexture(gl.TEXTURE_2D, bloomLv[i].tex);
          gl.uniform2f(upU.uTexel, 1 / bloomLv[i].w, 1 / bloomLv[i].h);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
        }
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        setBlend(false);
      }

      // 3) composite — to the LDR target when FXAA is on (it resolves to screen),
      //    else straight to the screen.
      const useFxaa = fxaaProg && ldrFBO && ldrTex;
      bindOverwrite(useFxaa ? ldrFBO : null);
      gl.viewport(0, 0, width, height);
      useProg(compProg);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, sceneTex);
      gl.uniform1i(compU.uScene, 0);
      gl.activeTexture(gl.TEXTURE1);
      // When bloom is off the mip chain was skipped and bloomLv[0] holds a stale
      // frame — bind the 1×1 black source so the composite reads zero contribution.
      gl.bindTexture(gl.TEXTURE_2D, doBloom ? bloomLv[0].tex : blackTex);
      gl.uniform1i(compU.uBloom, 1);
      // Normalise the mip-chain accumulation (level 0 holds nLv-1 summed blur
      // octaves) so the hand-tuned per-time-of-day bloom amounts keep their overall
      // energy — same brightness budget, spread over a wider, smoother halo.
      gl.uniform1f(compU.uBloomAmt, bloomAmt * 1.25 / Math.max(nLv - 1, 1));
      // AO: post-blur result is in ssaoTex; when AO is off bind a white 1×1
      // so the unused sampler still has a complete texture (shader skips
      // the fetch via uAOTexel == 0; aoV stays 1.0).
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, haveAO ? ssaoTex : whiteTex);
      gl.uniform1i(compU.uSSAO, 2);
      // Half-res AO grid texel for the composite's depth-aware bilateral upsample;
      // zeroed when AO is off so the shader takes the plain (1×1 white) fetch.
      gl.uniform2f(compU.uAOTexel, haveAO ? 1 / ssaoW : 0, haveAO ? 1 / ssaoH : 0);
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, haveGR ? godrayTex : blackTex);
      gl.uniform1i(compU.uGodray, 3);
      uf1(compU.uHaveGodray, "haveGodray", haveGR ? 1 : 0);
      // Project sun direction to screen UV for lens flare
      let flareStr = 0, sunShaft = 0;
      _sunUV[0] = -2; _sunUV[1] = -2;
      if (F.sunDir && F.viewProj) {
        const s = F.sunDir;
        // Treat sun as infinitely distant: clip pos = VP * (sunDir, 0)
        const vp = F.viewProj;
        const cx = vp[0]*s[0] + vp[4]*s[1] + vp[8]*s[2];
        const cy = vp[1]*s[0] + vp[5]*s[1] + vp[9]*s[2];
        const cw = vp[3]*s[0] + vp[7]*s[1] + vp[11]*s[2];
        if (cw > 0) {
          _sunUV[0] = cx / cw * 0.5 + 0.5;
          _sunUV[1] = cy / cw * 0.5 + 0.5;
          // Lens flare peaks at GOLDEN HOUR (low sun), fading as the sun climbs —
          // the opposite of the old height-scaled version that vanished at sunset.
          // Gate flare + shafts by the sun's actual BRIGHTNESS, not just elevation:
          // at night the key light is dim moonlight kept above the horizon for sky
          // glow, and without this gate the radial pass streaked every bright lamp
          // head toward the moon — random "beams from the sky".
          const _sl = F.sunColor ? Math.max(F.sunColor[0], F.sunColor[1], F.sunColor[2]) : 1;
          const _sunGate = Math.min(1, Math.max(0, (_sl - 0.35) / 0.45));
          if (s[1] > -0.02) {
            const golden = 1.0 - Math.min(Math.max(s[1], 0) / 0.45, 1.0);
            // Lower floor + peak (was 0.30 + golden*0.55, peaking ~0.85): combined
            // with the streak shape above, that washed the whole frame during
            // ordinary dusk driving. The shader-side soft-clip already taming the
            // wash, so this just keeps typical dusk flare present but subtle.
            flareStr = (0.14 + golden * 0.30) * _sunGate;
          }
          if (s[1] > 0.05) sunShaft = s[1] * 0.8 * _sunGate;
        }
      }
      gl.uniform2fv(compU.uSunUV, _sunUV);
      // LENS FLARE knob scales the whole sun/lamp flare + ghost stack (def 1).
      gl.uniform1f(compU.uFlareStr, flareStr * (opts && opts.flareMul != null ? opts.flareMul : 1));
      const exposure = opts && opts.exposure !== undefined ? opts.exposure : 1.0;
      gl.uniform1f(compU.uExposure, exposure);
      // SCREEN SUN-SHAFT knob scales the radial crepuscular pass (def 1 = as-shipped).
      // GATED ON doBloom, because the shaft pass READS THE BLOOM CHAIN. Its loop's
      // only input is texture(uBloom, suv) (js/render/glx/shaders/glsl-post.js), and when
      // bloom is off we bind the 1x1 blackTex to uBloom 50 lines above — so the
      // 8 dependent full-res fetches, the ignoise and the 8 length()/clamp pairs
      // accumulated exactly vec3(0) and were then scaled by uSunShaft. The shader
      // gates only on `uSunShaft > 0.0`, so the producer has to say zero here.
      // Bites on a DAYTIME TIER-4 frame: js/game.js zeroes po.bloom at tier >= 4
      // while sunShaft needs the sun up and bright — i.e. the frame that has
      // already shed god-rays, SSAO and SSR still paid for this one.
      // Bit-identical: 0.0 * finite == 0.0. Same shape as the po.contact/lampVol
      // sheds in docs/PERF-FINDINGS.md §2 — another operand of an armed producer.
      gl.uniform1f(compU.uSunShaft, doBloom ? sunShaft * (opts && opts.tune && opts.tune.sunShaftMul != null ? opts.tune.sunShaftMul : 1) : 0);
      // Cinematic split-tone grade (neutral by default → existing look unchanged).
      const grade = opts && opts.grade;
      const gSh = grade && grade.shadow ? grade.shadow : _ONE3;
      const gHi = grade && grade.hi ? grade.hi : _ONE3;
      uf3(compU.uGradeShadow, "gradeShadow", gSh[0], gSh[1], gSh[2]);
      uf3(compU.uGradeHi, "gradeHi", gHi[0], gHi[1], gHi[2]);
      uf1(compU.uGradeStr, "gradeStr", grade && grade.str !== undefined ? grade.str : 0);
      // Live colour-grade tunables (IMAGE & COLOUR panel); defaults reproduce the
      // shipped grade so a missing tune object changes nothing.
      const CT = opts && opts.tune || null;
      uf4(compU.uTone0, "tone0",
        CT && CT.blacks != null ? CT.blacks : 0,
        CT && CT.shadows != null ? CT.shadows : 0,
        CT && CT.midtones != null ? CT.midtones : 0,
        CT && CT.highlights != null ? CT.highlights : 0);
      uf4(compU.uTone1, "tone1",
        CT && CT.whites != null ? CT.whites : 0,
        CT && CT.toe != null ? CT.toe : 0,
        CT && CT.shoulder != null ? CT.shoulder : 0, 0);
      uf3(compU.uLift, "lift",
        CT && CT.liftR != null ? CT.liftR : 0,
        CT && CT.liftG != null ? CT.liftG : 0,
        CT && CT.liftB != null ? CT.liftB : 0);
      uf3(compU.uGamma, "gamma",
        CT && CT.gammaR != null ? CT.gammaR : 1,
        CT && CT.gammaG != null ? CT.gammaG : 1,
        CT && CT.gammaB != null ? CT.gammaB : 1);
      uf3(compU.uGain, "gain",
        CT && CT.gainR != null ? CT.gainR : 1,
        CT && CT.gainG != null ? CT.gainG : 1,
        CT && CT.gainB != null ? CT.gainB : 1);
      uf1(compU.uContrast,   "contrast",   CT && CT.contrast   != null ? CT.contrast   : 1.12);
      uf1(compU.uVibrance,   "vibrance",   CT && CT.vibrance   != null ? CT.vibrance   : 0.20);
      uf1(compU.uSaturation, "saturation", CT && CT.saturation != null ? CT.saturation : 1.0);
      // Skip the whole HDR lift/gamma/gain/tone block when every knob sits at
      // neutral (the shipped default): applyHdrGrade is then a mathematical
      // no-op, but it still cost ~20 ALU incl. 4-5 transcendentals on every
      // full-screen pixel of every frame.
      const _hg = CT && (
        (CT.blacks || 0) !== 0 || (CT.shadows || 0) !== 0 || (CT.midtones || 0) !== 0 ||
        (CT.highlights || 0) !== 0 || (CT.whites || 0) !== 0 || (CT.toe || 0) !== 0 ||
        (CT.shoulder || 0) !== 0 || (CT.liftR || 0) !== 0 || (CT.liftG || 0) !== 0 ||
        (CT.liftB || 0) !== 0 || (CT.gammaR != null && CT.gammaR !== 1) ||
        (CT.gammaG != null && CT.gammaG !== 1) || (CT.gammaB != null && CT.gammaB !== 1) ||
        (CT.gainR != null && CT.gainR !== 1) || (CT.gainG != null && CT.gainG !== 1) ||
        (CT.gainB != null && CT.gainB !== 1));
      uf1(compU.uHdrGradeOn, "hdrGradeOn", _hg ? 1.0 : 0.0);
      uf1(compU.uTint,       "tint",       CT && CT.tint       != null ? CT.tint       : 0.0);
      uf1(compU.uVignette,   "vignette",   CT && CT.vignette   != null ? CT.vignette   : 0.80);
      uf1(compU.uVigSoft,    "vigSoft",    CT && CT.vignetteSoft != null ? CT.vignetteSoft : 0.35);
      uf1(compU.uBloomKnee,  "bloomKnee",  CT && CT.bloomKnee  != null ? CT.bloomKnee  : 0.5);
      // opts.carReflect is the governor shed (tier ≥ 2 → 0). Must win over the
      // tuner default: po.reflect = 0 is also the DRY-session value, so pairing
      // uCarReflect to po.reflect would kill car-paint SSR on every dry lap.
      // Leaving the 0.05 default up after the wet-road shed is the contact /
      // lampVol operand-pair bug — car pixels still enter the ~36-fetch march.
      gl.uniform1f(compU.uCarReflect, opts && opts.carReflect != null ? opts.carReflect
        : (CT && CT.carReflect != null ? CT.carReflect : 0.05));
      uf1(compU.uCarGloss, "carGloss", CT && CT.carGloss != null ? CT.carGloss : 1.0);
      // IMAGE & COLOUR extras (all default to a no-op reproducing the shipped look).
      uf1(compU.uChromAb,    "chromAb",    CT && CT.chromAb    != null ? CT.chromAb    : 0.0);
      uf1(compU.uGrain,      "grain",      CT && CT.grain      != null ? CT.grain      : 0.0);
      gl.uniform1f(compU.uGrainTime,  F.time);
      uf1(compU.uSharpen,    "sharpen",    CT && CT.sharpen    != null ? CT.sharpen    : 0.0);
      uf1(compU.uBlackLift,  "blackLift",  CT && CT.blackLift  != null ? CT.blackLift  : 0.005);
      uf1(compU.uWhitePoint, "whitePoint", CT && CT.whitePoint != null ? CT.whitePoint : 1.0);
      // ACES TONE CURVE knobs (defaults = the shipped Narkowicz coefficients).
      uf1(compU.uAcesA, "acesA", CT && CT.acesA != null ? CT.acesA : 2.51);
      uf1(compU.uAcesB, "acesB", CT && CT.acesB != null ? CT.acesB : 0.03);
      uf1(compU.uAcesC, "acesC", CT && CT.acesC != null ? CT.acesC : 2.43);
      uf1(compU.uAcesD, "acesD", CT && CT.acesD != null ? CT.acesD : 0.59);
      uf1(compU.uAcesE, "acesE", CT && CT.acesE != null ? CT.acesE : 0.14);
      gl.uniform1f(compU.uSpeedBlur,  opts && opts.speedBlur != null ? opts.speedBlur : 0.0);
      // SUN-SHAFT REACH / FLARE STREAK knobs (defaults reproduce the shipped look).
      uf1(compU.uShaftDecay, "shaftDecay", CT && CT.sunShaftDecay != null ? CT.sunShaftDecay : 0.82);
      // Reach scales with the SCREEN SUN-SHAFT knob, sub-linearly so the shipped
      // value (1) keeps the shipped radius and turning it up genuinely extends the
      // rays instead of only brightening a fixed disc. sqrt keeps 4x strength at a
      // 2x radius rather than blowing the pass across the whole frame.
      const _shaftMul = (opts && opts.tune && opts.tune.sunShaftMul != null) ? opts.tune.sunShaftMul : 1;
      uf1(compU.uShaftSpread, "shaftSpread", Math.sqrt(Math.max(0.05, _shaftMul)));
      uf1(compU.uFlareStreak, "flareStreak", CT && CT.flareStreak   != null ? CT.flareStreak   : 7.0);
      uf1(compU.uFlareStreak2, "flareStreak2", CT && CT.flareStreak2 != null ? CT.flareStreak2  : 0.5);
      // EXHAUST HEAT HAZE: screen-anchored shimmer plume (opts.haze = {u, v, str}
      // computed by the caller from the player tailpipe projection; absent = off).
      const hz = opts && opts.haze;
      gl.uniform2f(compU.uHazeUV, hz ? hz.u : -9, hz ? hz.v : -9);
      gl.uniform1f(compU.uHazeStr, hz ? hz.str : 0);
      gl.uniform1f(compU.uHazeTime, F.time);
      uf1(compU.uSsrThick,   "ssrThick",   CT && CT.ssrThick   != null ? CT.ssrThick   : 0.20);
      // LENS DIRT: bind the procedural smudge map (black fallback = veil term is
      // zero even if the knob is up, so a failed canvas init degrades silently).
      gl.activeTexture(gl.TEXTURE5);
      gl.bindTexture(gl.TEXTURE_2D, dirtTex || blackTex);
      gl.uniform1i(compU.uDirt, 5);
      uf1(compU.uLensDirt, "lensDirt", CT && CT.lensDirt != null ? CT.lensDirt : 0.15);
      // uReflTexel drives both SSR and SHARPEN, so upload it every frame (not only
      // inside the haveRefl block) — otherwise sharpen samples with a stale texel.
      gl.uniform2f(compU.uReflTexel, 1 / width, 1 / height);
      // Camera-aware SSR screen extent: a low onboard eye (cockpit/hood) sees the
      // wet road climb higher up the frame and start right at the nose, so game.js
      // raises the top cutoff + pulls the near-field fade in for those cams. Every
      // frame (defaults reproduce the shipped chase framing when opts omit them).
      gl.uniform1f(compU.uSsrTopUV, opts && opts.ssrTopUV != null ? opts.ssrTopUV : 0.62);
      gl.uniform1f(compU.uSsrNear,  opts && opts.ssrNear  != null ? opts.ssrNear  : -2.5);
      // Wet-road screen-space reflection: needs depth + view/proj + world-up-in-view.
      const reflStr = (opts && opts.reflect) || 0;
      // Depth is ALWAYS bound: the shader's car-paint branch fires on the carPx
      // tag alone, so on a probe-less path (setup preview never sets frame.proj)
      // it used to sample whatever texture unit 4 last held, against the
      // PREVIOUS race's stale matrices. uSsrOk gates the whole branch instead.
      gl.activeTexture(gl.TEXTURE4);
      gl.bindTexture(gl.TEXTURE_2D, sceneDepth);
      gl.uniform1i(compU.uDepth, 4);
      const haveRefl = F.invProj && F.proj && F.upVS;
      if (haveRefl) {
        gl.uniformMatrix4fv(compU.uInvProj, false, F.invProj);
        gl.uniformMatrix4fv(compU.uProj, false, F.proj);
        gl.uniform3fv(compU.uUpVS, F.upVS);
        gl.uniform3fv(compU.uReflSkyHi, F.skyHi || _SKY_HI);
        gl.uniform3fv(compU.uReflSkyLo, F.skyLo || _SKY_LO);
      }
      gl.uniform1f(compU.uSsrOk, haveRefl ? 1 : 0);
      gl.uniform1f(compU.uReflect, haveRefl ? reflStr : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      // 4) FXAA resolve: edge-AA the tonemapped LDR image straight to the screen.
      if (useFxaa) {
        bindOverwrite(null);
        gl.viewport(0, 0, width, height);
        useProg(fxaaProg);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, ldrTex);
        gl.uniform1i(fxaaU.uTex, 0);
        gl.uniform2f(fxaaU.uTexel, 1 / width, 1 / height);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }

      bindVAO(null);
      gl.activeTexture(gl.TEXTURE0);
      gl.enable(gl.DEPTH_TEST);

      // Discard depth buffers we never read across frames (regenerated every frame
      // by the geometry pass). On tiled mobile GPUs this frees the tiler from
      // storing depth back to memory each frame — pure bandwidth/tile-memory saving
      // with no visual effect. sceneDepth was already consumed by SSAO/SSR/god-ray
      // above; the default framebuffer's depth is unused (post is a fullscreen blit).
      if (gl.invalidateFramebuffer) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFBO);
        gl.invalidateFramebuffer(gl.FRAMEBUFFER, [gl.DEPTH_ATTACHMENT]);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.invalidateFramebuffer(gl.FRAMEBUFFER, [gl.DEPTH]);
      }

      core.gpuTimerEnd();
    }

    postEnabled = setup();   // best-effort; false -> render straight to screen
    Log.info("gfx", "GLX post init on=" + (postEnabled ? 1 : 0));

    return {
      enabled: () => postEnabled,
      // The gfx.js contract for this is "the scene buffer is float (HDR)" —
      // which is only true while the post chain is actually in use. When
      // setup()/createTargets() fall back to direct rendering the frame goes
      // to the 8-bit default framebuffer, whatever the extension said.
      hdrOk: () => postEnabled && colorType === gl.HALF_FLOAT,
      msaa: () => msaaSamples,
      createTargets,
      bindSceneTarget,
      present,
    };
  }

  return { init };
})();
