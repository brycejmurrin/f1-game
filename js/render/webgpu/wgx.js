/*
 * Apex 26 — WebGPU renderer backend (WGX). Migration Phase 2 + 3 + 4
 * (post chain + foreground FX).
 *
 * A second implementer of the GLX draw-API contract (the renderer object
 * returned by the GLX IIFE). See docs/archive/webgpu/WEBGPU-MIGRATION.md,
 * docs/archive/webgpu/WEBGPU-PHASE0-NOTES.md, docs/archive/webgpu/WEBGPU-PHASE2-NOTES.md and js/render/gfx.js for the
 * interface contract and the frame/opts object shapes.
 *
 * WHAT IS REAL (Phase 1 + Phase 2):
 *   - adapter / device acquisition (async); context configure(); DPR resize;
 *     device-lost reload — unchanged from Phase 1.
 *   - REAL mesh geometry: createMesh / createChunkedMesh build interleaved
 *     GPUBuffers (stride 40 = pos3/nrm3/col3/mat1) + index buffers; per-chunk
 *     AABBs kept for cull. free* call buffer.destroy().
 *   - A LIT render pass into an RGBA16F HDR scene texture (+ depth24plus depth):
 *       * FRAME uniform buffer (viewProj/eye/sun/ambient/sky/fog/tune scalars)
 *       * a 32-entry Light STORAGE buffer (the flat stride-15 array maps verbatim)
 *       * per-draw model+material via a dynamic-offset uniform buffer (stride 256)
 *       * base PBR fragment shader (WGSLChunks.LIT): ambient + sun diffuse/spec +
 *         32 point lights + emissive + fog. (Reduced — see the LIT header TODOs.)
 *       * opaque / alpha / double-sided / no-alpha-write pipeline variants (cached)
 *   - drawSky() renders the WGSL SKY into the same pass (background).
 *   - drawChunked() frustum-culls chunks against frame.viewProj + frame.cullDist
 *     (ported _extractPlanes / _aabbInFrustum / _aabbDist2).
 *   - present() tonemaps (ACES + exposure) the HDR scene target to the swapchain.
 *
 * PHASE 3 (this pass): sun shadow map. A depth-only caster pass (shadowBegin /
 * castShadow / castShadowChunked / shadowEnd) rasterises the scene from the sun
 * into a depth texture; the LIT shader 3×3-PCF-compares against it (comparison
 * sampler) and modulates the sun diffuse+spec. Also fixes a latent GL→WebGPU
 * clip-space z bug (Z01 remap) that would have half-clipped ALL geometry.
 *
 * PHASE 4 (this pass): the post-processing chain + foreground FX.
 *   - present() now runs the WGSLPost chain (js/render/webgpu/wgsl-post.js) in its
 *     documented PASS_ORDER: SSAO (half-res) -> GODRAY (half-res, screen-space
 *     radial) -> BLOOM down/up mip chain (rgba16f, additive up) -> COMPOSITE
 *     (scene * AO + godray, exposure, bloom, ACES, colour grade, lens flare,
 *     vignette, grain, dither) into an LDR target -> FXAA to the swapchain. Every
 *     uniform is driven from the present `opts` (exposure/bloom/threshold/ssao/
 *     contact/godray/grade/tune/flareMul), matching GLX present() field names.
 *     Aux targets are cleared (AO->white, godray/bloom->black) when a pass is
 *     skipped so the composite never samples a stale frame. If the post
 *     pipelines/targets are unavailable, present() FALLS BACK to the Phase-2
 *     tonemap blit (no crash).
 *   - FX (js/render/webgpu/wgsl-fx.js): drawShadow/drawMark (blob + skid stamps),
 *     drawSkidBatch (batched trail), drawGlow (additive HDR halos), drawDecal
 *     (textured atlas) — all recorded INTO the open lit pass so they interleave
 *     with draw()/drawSky() exactly as game.js expects. createTexMesh/createTexture
 *     are real (GPUTexture upload) so decals have an atlas.
 *
 * PARITY (2026-08): gpuTimer, createTextureArray/matTexMix, generateMips (env +
 *   2d + arrays), lamp shadows, instancing family, drawParticles, MSAA 2× with
 *   manual depth resolve, Poisson PCSS, world-space god-ray, applyMaterial*,
 *   road markings, heat haze, SSAO/god-ray separable blur. See
 *   docs/research/WEBGPU-PARITY.md.
 *
 * BOOT SELF-TEST (see _selfTest at the end of create()): WebGPU reports a bad
 * shader or pipeline ASYNCHRONOUSLY — createRenderPipeline() returns a
 * live-looking object and the draw is silently dropped — so a backend can
 * "initialise" perfectly and then render an all-black world. Before returning,
 * create() therefore checks every shader module's compilation info, forces the
 * base lit pipeline inside a validation error scope, and renders + READS BACK a
 * pixel through the real blit pipeline. Any proven failure returns null and the
 * caller falls back to GLX; a check that cannot be RUN is skipped, never fatal.
 *
 * NO build step, no ES modules: "use strict" IIFE assigning one global `WGX`.
 * WGSL lives as inline template strings (js/render/webgpu/wgsl-chunks.js).
 *
 * ON PHONES (added after the fact — WGX was written and FROZEN while boot
 * refused every alternate backend whenever GLX.isMobile). iOS 26+ Safari and
 * Android 12+ Chrome expose navigator.gpu, so the RENDERER button's WEBGPU stop
 * now lands here on real handsets. Nothing below claims that looks right; what
 * it does claim is that the phone pays no MORE than GLX would:
 *   - SHADOW_SIZE and the dynamic car shadow map key on IS_MOBILE (the device),
 *     matching js/render/glx/shadow.js, not MOBILE_TIER — GRAPHICS: HIGH buys
 *     quality on a desktop, never a per-frame extra depth pass on a phone GPU.
 *   - the full-res SSR target (8 B/px that GLX does not allocate at all) is
 *     skipped on the mobile tier; the 1×1 placeholder makes the LIT SSR block a
 *     documented no-op.
 * What is NOT covered: post-chain target FORMATS are still the fat ones
 * (SSAO rgba8 vs GLX r8; bloom/godray rgba16float vs GLX R11F_G11F_B10F), so a
 * phone frame still carries roughly 1.5x GLX's discretionary target bytes.
 * The last line of defence remains game.js's boot canary (apex26.gfxBackendProbe),
 * which reverts to WebGL2 when a backend never presents a world frame.
 *
 * Feature-detected & inert: WGX.create() returns null on any failure so the
 * caller falls back to GLX. Constructing on a supported browser never throws.
 */
"use strict";

const WGX = (function () {
  // READ GLX's mobile-tier detection rather than mirroring it. This block used
  // to be a hand-copy ("Mirror GLX's…"), which is how js/game.js's copy came to
  // omit forceMobileTier without anything noticing. WGX is DEFERRED — injected
  // at boot, long after glx.js's <script> tag — so GLX is always present here;
  // the typeof guard is belt-and-braces for a standalone harness.
  const IS_MOBILE = typeof GLX !== "undefined" && !!GLX.isMobile;
  const MOBILE_TIER = typeof GLX !== "undefined" && !!GLX.mobileTier;

  // Identity mat4 (column-major) fallback.
  const IDENT = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

  // GL→WebGPU clip-space depth remap. game.js builds GL-convention projections
  // (NDC z ∈ [-1,1]); WebGPU rasterises z ∈ [0,1]. Left-multiplying a view-proj by
  // Z01 maps clip_z' = 0.5*clip_z + 0.5*clip_w so the near half of the scene isn't
  // clipped. Column-major of row-basis diag(1,1,·)+row2=(0,0,.5,.5). Applied to the
  // uploaded viewProj (lit) and lightVP (shadow); NOT to invViewProj (sky rays).
  const Z01 = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,0.5,0, 0,0,0.5,1]);
  // Inverse of Z01 (column-major): maps a WebGPU clip (z 0..1) back to GL clip
  // (z -1..1). Needed to build the SSAO invProj: the depth buffer stores
  // Z01·viewProj z, so reconstructing view pos from it uses
  // invProjW = invProj_gl · Z01INV (see _writeFrame). Row2 inverse of
  // z'=0.5z+0.5w is z=2z'-w.
  const Z01INV = new Float32Array([1,0,0,0, 0,1,0,0, 0,0,2,0, 0,0,-1,1]);

  // Phase-4 post shader/FX registries (separate files; may be absent when the
  // backend is loaded standalone — post/FX then stay disabled and the frame
  // falls back to the tonemap blit rather than failing WGX.create()).
  const _Post = (typeof window !== "undefined" && window.WGSLPost) || null;
  const _Fx   = (typeof window !== "undefined" && window.WGSLFx)   || null;

  // ── render-target formats ──
  const SCENE_FORMAT = "rgba16float";   // HDR scene (core-renderable/blendable)
  const DEPTH_FORMAT = "depth24plus";
  const LDR_FORMAT   = "rgba8unorm";    // COMPOSITE output (FXAA reads it)
  const SSAO_FORMAT  = "rgba8unorm";    // AO half-res (composite samples .r)
  const BLOOM_MAX_LEVELS = 5;           // GLX bloom mip-chain depth cap

  // ── the WGSL source module (js/render/webgpu/wgsl-chunks.js) ──
  // Resolved defensively, because this file used to dereference WGSLChunks at
  // IIFE-EVAL time: a missing/failed wgsl-chunks.js threw HERE, which left the
  // `const WGX` binding permanently in its temporal dead zone — and a TDZ
  // binding makes even `typeof WGX` THROW in gfx.js rather than report
  // "undefined". That only stayed survivable because Gfx.create() wraps
  // everything in try/catch. A missing dependency is exactly the failure that
  // hit vendor/ in production, so it must degrade the documented way instead:
  // WGX still exists, and WGX.create() returns null so the caller uses GLX.
  const _Chunks = (function () {
    try { if (typeof WGSLChunks !== "undefined" && WGSLChunks) return WGSLChunks; } catch (_) {}
    try { if (typeof window !== "undefined" && window.WGSLChunks) return window.WGSLChunks; } catch (_) {}
    return null;
  })();
  const _CH = _Chunks || {};   // sizes below fall back to 0 when absent; create() refuses first

  // ── uniform sizes / layout (must match WGSLChunks.LIT struct comments) ──
  const FRAME_BYTES = _CH.FRAME_UNIFORM_BYTES | 0;      // 464
  const FRAME_FLOATS = FRAME_BYTES / 4;                 // 116
  const LIGHT_STRIDE = _CH.LIGHT_STRIDE_BYTES | 0;      // 64
  const MAX_LIGHTS = _CH.MAX_LIGHTS | 0;                // 48
  const LIGHT_BYTES = LIGHT_STRIDE * MAX_LIGHTS;        // 3072
  const LIGHT_FLOATS = LIGHT_BYTES / 4;                 // 512
  const DRAW_USED_BYTES = _CH.DRAW_UNIFORM_BYTES | 0;   // 112
  const DRAW_FLOATS = DRAW_USED_BYTES / 4;              // 28
  // Dynamic uniform-buffer offsets must be a multiple of
  // minUniformBufferOffsetAlignment (<=256 on all adapters); 256 is always a
  // valid multiple, so we stride slots at 256 B.
  const DRAW_STRIDE = 256;
  const MAX_DRAWS = 4096;                               // per-frame draw slots
  const BLIT_BYTES = _CH.BLIT_UNIFORM_BYTES | 0;        // 16

  // ── shadow map (Phase 3) ──
  // Keyed on the DEVICE (IS_MOBILE), not the memory tier — the same key
  // js/render/glx/shadow.js uses, and for its reason: GRAPHICS: HIGH on a phone
  // must not 4x the snap-cache redraw cost (terrain+road+whole city re-rasterised
  // into the map every ~10 m of travel). This read MOBILE_TIER, which handed a
  // HIGH-tier phone a 2048² map GLX would never give it — 12 MB of jetsam-counted
  // GPU memory plus the redraw stall, on the least-ready backend.
  const SHADOW_SIZE = IS_MOBILE ? 1024 : 2048;          // sun depth-map resolution
  const CAR_SHADOW_SIZE = 1024;                         // dynamic car-only shadow map (matches GLX)
  // The dynamic CAR shadow map is DESKTOP-ONLY in GLX (js/render/glx/shadow.js
  // creates carTex only `if (ok && !core.IS_MOBILE)` — "a per-frame pass is the
  // HIGH-tier lag, not a memory cap"). WGX allocated the full 1024² depth texture
  // on EVERY tier and only gated the PASS, and gated it on MOBILE_TIER — so a
  // phone paid 4 MB for a texture nothing ever rendered into, and a HIGH-tier
  // phone additionally ran a whole-car depth pass per frame that GLX refuses on
  // any phone. Shrink the texture to 1×1 on phones: binding 8 stays a valid
  // depth texture (the layout demands one), and the shader never samples it
  // because params6.y (_carShadowArmed) stays 0 with the pass gated off below.
  const CAR_SHADOW_ALLOC = IS_MOBILE ? 1 : CAR_SHADOW_SIZE;
  const SHADOW_SLOTS = 40;                              // caster draws per shadow pass (car pass casts one per car, up to ~22 + margin; ring is safe to reuse per pass because each pass submits before the next Begin rewrites slots)
  const SHADOW_MODEL_STRIDE = 256;                      // dynamic-offset alignment

  // ── vertex layout: interleaved [pos3, nrm3, col3, mat1], stride 40 ──
  // NB: unlike GLX (which keeps mat-less meshes at stride 36), WGX ALWAYS stores
  // the 10th float (mat, default 0) so a single pipeline vertex layout serves
  // every mesh — the shader declares @location(3) unconditionally.
  const VERTEX_STRIDE = 52;   // pos3 nrm3 col3 mat1 trk3
  const VERTEX_LAYOUT = {
    arrayStride: VERTEX_STRIDE,
    attributes: [
      { shaderLocation: 0, offset: 0,  format: "float32x3" },
      { shaderLocation: 1, offset: 12, format: "float32x3" },
      { shaderLocation: 2, offset: 24, format: "float32x3" },
      { shaderLocation: 3, offset: 36, format: "float32" },
      { shaderLocation: 4, offset: 40, format: "float32x3" },
    ],
  };
  const INSTANCE_STRIDE = 80;   // mat4 + color3 + pad
  const INSTANCE_LAYOUT = {
    arrayStride: INSTANCE_STRIDE,
    stepMode: "instance",
    attributes: [
      { shaderLocation: 5, offset: 0,  format: "float32x4" },
      { shaderLocation: 6, offset: 16, format: "float32x4" },
      { shaderLocation: 7, offset: 32, format: "float32x4" },
      { shaderLocation: 8, offset: 48, format: "float32x4" },
      { shaderLocation: 9, offset: 64, format: "float32x3" },
    ],
  };
  const SHADOW_VERTEX_LAYOUT = {
    arrayStride: VERTEX_STRIDE,
    attributes: [{ shaderLocation: 0, offset: 0, format: "float32x3" }],
  };
  const SHADOW_INSTANCE_LAYOUT = {
    arrayStride: INSTANCE_STRIDE,
    stepMode: "instance",
    attributes: [
      { shaderLocation: 1, offset: 0,  format: "float32x4" },
      { shaderLocation: 2, offset: 16, format: "float32x4" },
      { shaderLocation: 3, offset: 32, format: "float32x4" },
      { shaderLocation: 4, offset: 48, format: "float32x4" },
    ],
  };
  const MAT_TEX_LAYERS = 17;
  const LAMP_SHADOW_SIZE = 512;
  const MSAA_COUNT = MOBILE_TIER ? 1 : 2;

  // ── Refusal bookkeeping ─────────────────────────────────────────────────────
  // Every path that makes create() return null records WHY, both on the console
  // and on WGX.lastFailure, so "the RENDERER button says WEBGPU but the game is
  // running WebGL2" is a question with an answer instead of a mystery. (The
  // fallback itself is silent by design — the player never sees a broken frame.)
  let _lastFailure = null;
  // Lifetime count of UNCAPTURED GPU errors on the live device. Module-scope
  // rather than per-create because only one backend is ever live (the same
  // reason _lastFailure sits here), and because the useful read is post-mortem:
  // a backend that boots clean and then renders garbage leaves its evidence
  // ONLY here — the boot self-test is over and game.js's canary proves that
  // present() ran, not that anything reached the screen.
  let _gpuErrors = 0;
  function _fail(reason) {
    _lastFailure = { reason: String(reason), at: Date.now() };
    try { Log.warn("gfx", "WGX unavailable (" + _lastFailure.reason + ") — falling back to WebGL2"); } catch (_) {}
    return null;
  }

  function toF32(a) { return a instanceof Float32Array ? a : new Float32Array(a); }

  // Column-major 4×4 multiply: out = a · b (out must not alias a or b).
  function _mul4(out, a, b) {
    for (let c = 0; c < 4; c++) {
      const b0 = b[c*4], b1 = b[c*4+1], b2 = b[c*4+2], b3 = b[c*4+3];
      out[c*4]   = a[0]*b0 + a[4]*b1 + a[8]*b2  + a[12]*b3;
      out[c*4+1] = a[1]*b0 + a[5]*b1 + a[9]*b2  + a[13]*b3;
      out[c*4+2] = a[2]*b0 + a[6]*b1 + a[10]*b2 + a[14]*b3;
      out[c*4+3] = a[3]*b0 + a[7]*b1 + a[11]*b2 + a[15]*b3;
    }
    return out;
  }

  // ── Frustum cull helpers — ported verbatim from GLX's frustum helpers.
  //    Gribb–Hartmann from a COLUMN-MAJOR view-proj; inside = a*x+b*y+c*z+d >= 0.
  const _fcPlanes = [new Float32Array(4), new Float32Array(4), new Float32Array(4),
                     new Float32Array(4), new Float32Array(4), new Float32Array(4)];
  function _setPlane(p, a, b, c, d) {
    const inv = 1 / (Math.hypot(a, b, c) || 1);
    p[0] = a * inv; p[1] = b * inv; p[2] = c * inv; p[3] = d * inv;
  }
  function _extractPlanes(m, planes) {
    const m0=m[0],m4=m[4],m8=m[8],m12=m[12], m1=m[1],m5=m[5],m9=m[9],m13=m[13],
          m2=m[2],m6=m[6],m10=m[10],m14=m[14], m3=m[3],m7=m[7],m11=m[11],m15=m[15];
    _setPlane(planes[0], m3+m0, m7+m4, m11+m8,  m15+m12); // left
    _setPlane(planes[1], m3-m0, m7-m4, m11-m8,  m15-m12); // right
    _setPlane(planes[2], m3+m1, m7+m5, m11+m9,  m15+m13); // bottom
    _setPlane(planes[3], m3-m1, m7-m5, m11-m9,  m15-m13); // top
    _setPlane(planes[4], m3+m2, m7+m6, m11+m10, m15+m14); // near
    _setPlane(planes[5], m3-m2, m7-m6, m11-m10, m15-m14); // far
  }
  function _aabbInFrustum(planes, mn, mx) {
    for (let i = 0; i < 6; i++) {
      const p = planes[i];
      const px = p[0] >= 0 ? mx[0] : mn[0];
      const py = p[1] >= 0 ? mx[1] : mn[1];
      const pz = p[2] >= 0 ? mx[2] : mn[2];
      if (p[0]*px + p[1]*py + p[2]*pz + p[3] < 0) return false;
    }
    return true;
  }
  function _aabbDist2(mn, mx, ex, ey, ez) {
    const dx = ex < mn[0] ? mn[0] - ex : ex > mx[0] ? ex - mx[0] : 0;
    const dy = ey < mn[1] ? mn[1] - ey : ey > mx[1] ? ey - mx[1] : 0;
    const dz = ez < mn[2] ? mn[2] - ez : ez > mx[2] ? ez - mx[2] : 0;
    return dx * dx + dy * dy + dz * dz;
  }

  /**
   * WGX.create(canvas, opts) -> Promise<backend | null>
   */
  async function create(canvas, opts) {
    if (typeof navigator === "undefined" || !navigator.gpu) return null;
    // No WGSL sources -> no renderer. Refuse BEFORE touching the canvas, so the
    // GLX fallback can still attach a webgl2 context to it.
    if (!_Chunks || !_Chunks.LIT || !_Chunks.SKY || !_Chunks.BLIT || !_Chunks.SHADOW) {
      _fail("wgsl-chunks missing");
      return null;
    }

    let adapter, device, ctx, format;
    try {
      adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
      if (!adapter) return _fail("no adapter");
      const _canTimestamp = !!(adapter.features && adapter.features.has && adapter.features.has("timestamp-query"));
      device = await adapter.requestDevice(_canTimestamp ? { requiredFeatures: ["timestamp-query"] } : {});
      if (!device) return _fail("no device");
      var _timestampOk = _canTimestamp && !!(device.features && device.features.has && device.features.has("timestamp-query"));
    } catch (e) {
      return _fail("device request threw: " + ((e && e.message) || e));
    }

    try {
      ctx = canvas.getContext("webgpu");
      if (!ctx) return _fail("canvas has no webgpu context");
      format = navigator.gpu.getPreferredCanvasFormat();
      ctx.configure({ device, format, alphaMode: "opaque" });
    } catch (e) {
      return _fail("context configure threw: " + ((e && e.message) || e));
    }

    // Device-lost recovery. An unexpected loss (memory pressure, GPU reset) on
    // this opt-in/experimental path FALLS BACK to WebGL2 rather than reloading
    // straight back into WebGPU — otherwise a device that loses under the race
    // load would reload → lose → reload in a loop. Clearing the opt-in flag makes
    // the reload boot the stable WebGL2 backend; the user can re-enable via the
    // RENDERER toggle. ("destroyed" is our own teardown — ignore it.)
    //
    // RELOAD ONLY IF THE FALLBACK ACTUALLY PERSISTED. localStorage can be
    // READABLE but not WRITABLE — Safari private browsing, and any full quota.
    // The old unconditional reload then booted straight back into the preference
    // it had failed to clear, lost the device again, and reloaded forever: an
    // unrecoverable phone, from the one storage state most likely to occur on a
    // phone. game.js's boot canary cannot break that tie either — its arm/clear
    // writes fail for exactly the same reason, so the probe is never armed and
    // never reverts anything. So read the key BACK, and when the write did not
    // land, stay put and say so: every entry point below is _lost-guarded, the
    // menus are DOM layered over the canvas, and the RENDERER button is one tap
    // away. A frozen frame the player can navigate out of beats a reload loop.
    let _lost = false;
    device.lost.then(function (info) {
      if (info && info.reason === "destroyed") return;
      _lost = true;
      let persisted = false;
      try {
        localStorage.setItem("apex26.gfxBackend", "webgl2");
        persisted = localStorage.getItem("apex26.gfxBackend") === "webgl2";
      } catch (_) { /* a throwing setItem IS the read-only case: persisted stays false, which is the whole decision below */ }
      try {
        Log.warn("gfx", "WGX device lost (" + ((info && info.reason) || "unknown") + ") — " +
          (persisted ? "reverted to WebGL2, reloading"
                     : "could NOT persist the WebGL2 fallback (storage read-only?); not reloading, " +
                       "a reload would land back on WebGPU and loop. Use the RENDERER button."));
      } catch (_) { /* Log is absent in the node VM harness; a missing log line must never mask the recovery */ }
      // The boot probe is deliberately LEFT ARMED: if this loss happened before
      // the first presented world frame, the canary reporting it on the next boot
      // is the truth, and it is the only backstop left when the write above failed.
      if (persisted) { try { location.reload(); } catch (_) { /* no location (harness/worker): nothing to reload, and the flag is already flipped for the next real boot */ } }
    });

    // Uncaptured GPU errors. WebGPU does NOT throw on an invalid pipeline or
    // bind group — createRenderPipeline() returns a live-looking object and the
    // error surfaces here, asynchronously. That is precisely how this backend
    // could initialise "successfully" and then draw nothing, so the boot
    // self-test below treats anything caught here during init as fatal.
    //
    // AFTER boot the same handler is the only runtime signal this backend has —
    // and it is unbounded. An invalid pipeline or bind group errors once PER DRAW,
    // so a broken frame raises hundreds of these a second: at the `warn` console
    // threshold that is a per-frame console flood that costs more frame time than
    // the bug, and it evicts Log's 500-entry ring buffer, destroying the evidence
    // for everything else that went wrong. Log a bounded prefix and keep counting;
    // WGX.gpuErrors() carries the real total for a diagnosis.
    let _bootError = null;
    const GPU_ERR_LOG_CAP = 8;
    try {
      device.onuncapturederror = function (ev) {
        const msg = (ev && ev.error && ev.error.message) || "gpu error";
        if (!_bootError) _bootError = msg;
        _gpuErrors++;
        if (_gpuErrors <= GPU_ERR_LOG_CAP) {
          try { Log.warn("gfx", "WGX GPU error #" + _gpuErrors + ":", msg); } catch (_) { /* Log absent (node VM harness): _gpuErrors still counts, which is the load-bearing part */ }
          if (_gpuErrors === GPU_ERR_LOG_CAP) {
            try { Log.warn("gfx", "WGX: further GPU errors suppressed — read the count from WGX.gpuErrors()"); } catch (_) { /* same: the suppression itself does not depend on announcing it */ }
          }
        }
      };
    } catch (_) {}

    // ── state ──
    let width = 0, height = 0, aspect = 1, renderScale = 1;
    let lastFrame = null;

    // Per-frame scratch (reused; writeBuffer snapshots on call so reuse is safe).
    const frameData = new Float32Array(FRAME_FLOATS);
    const lightData = new Float32Array(LIGHT_FLOATS);
    const drawData  = new Float32Array(DRAW_FLOATS);
    const blitData  = new Float32Array(BLIT_BYTES / 4);
    const skyData   = new Float32Array(WGSLChunks.SKY_UNIFORM_BYTES / 4);
    const _vpGpu    = new Float32Array(16);   // Z01-remapped viewProj upload scratch
    const _dynOff = [0];   // single-element dynamic-offset scratch

    // Culling frame state.
    let frameViewProj = null, frameEye = null, frameCullDist = 0;
    // Phase-4 frame extras (post chain + FX). frameVPGpu is the Z01-remapped
    // view-proj the depth buffer was rasterised with — every FX embeds it so its
    // clip-z matches the scene depth; frameInvProjW is the WebGPU-convention
    // inverse projection for SSAO view-pos reconstruction.
    const frameVPGpu = new Float32Array(16);
    const frameInvProjW = new Float32Array(16);
    let frameSunDir = null, frameSunColor = null, frameProjRaw = null,
        frameSunVS = null, frameUpVS = null, frameHaveProj = false, frameTime = 0,
        frameAmbSky = null, frameAmbGround = null;

    // GPU objects assembled below (fail -> return null).
    let g0Layout, g1Layout, litLayout, litModule, skyModule, blitModule;
    let frameUBO, lightSBO, drawUBO, blitUBO, skyUBO;
    let frameBindGroup, drawBindGroup, skyBindGroup;
    let skyPipeline, blitPipeline, linearSampler;
    const _litPipelines = new Map();

    // Shadow-pass objects (Phase 3).
    let shadowTex = null, shadowView = null, shadowSampler = null;
    let envCubeView = null, ssrView = null;   // Phase-4b: env-probe cube + SSR result (placeholders until their passes run)
    let _ssrReady = false;   // SSR flips true once its pass runs (env reflection is analytic-sky — no probe gate needed)
    let _frameReflect = 0;   // wet-road SSR strength (== GLX present opts.reflect / game.js po.reflect); captured each present(), consumed by the NEXT begin()/_writeFrame to line up with the 1-frame ssrTex lag
    // ── Live env-cube probe (Phase-4b): a real RGBA16F cube captured one face/frame,
    //   so lacquered car paint mirrors the actual surroundings when the CAR ENV
    //   REFLECTION tuner is on. Off by default (carEnvCube=0 ⇒ analytic sky only). ──
    const ENV_SIZE = 64;
    const ENV_FACES = [
      [[ 1, 0, 0], [0, -1, 0]], [[-1, 0, 0], [0, -1, 0]],
      [[ 0, 1, 0], [0, 0,  1]], [[ 0, -1, 0], [0, 0, -1]],
      [[ 0, 0, 1], [0, -1, 0]], [[ 0, 0, -1], [0, -1, 0]],
    ];
    let _envPlaceView = null;                 // 1×1×6 placeholder cube view (feedback-safe during env render)
    let envCubeTex = null, envSampleView = null, envFaceViews = null;   // real probe cube + per-face render views
    let envDepthTex = null, envDepthView = null;
    let _envFrameBG = null;                    // frame group with binding4 = placeholder (used WHILE rendering the cube)
    let _activeFrameBG = null;                 // frame group draw()/drawChunked bind (main = real cube once live; env = placeholder)
    let _envProbeLive = false, _envFacesMask = 0, _envStr = 0;   // _envStr = carEnvCube once a full cycle is captured
    let _envEncoder = null;                    // the env face's own command encoder (submitted in envFaceEnd)
    const _envView = new Float32Array(16), _envProj = new Float32Array(16),
          _envVP = new Float32Array(16), _envVPGpu = new Float32Array(16), _envInvVP = new Float32Array(16);
    const _envTgt = [0, 0, 0];
    let shadowUBO, shadowModelUBO, shadowG0Layout, shadowG1Layout, shadowModule,
        shadowPipeline, shadowG0BindGroup, shadowModelBindGroup;
    let _shadowRendered = false, _shadowLightVP = null;
    const shadowLVPData = new Float32Array(16), shadowModelData = new Float32Array(16);
    let shadowEncoder = null, shadowPass = null, _shadowSlot = 0;
    // Dynamic per-frame CAR shadow map (GLX parity — see carShadowBegin).
    let carShadowTex = null, carShadowView = null, carShadowUBO = null, carShadowG0BindGroup = null;
    let _carShadowArmed = false, _carArms = 0;
    const carShadowLVPData = new Float32Array(16);
    let lampShadowTex = null, lampShadowView = null, lampShadowUBO = null, lampShadowG0BindGroup = null;
    let _lampShadowArmed = false, _lampArms = 0, _lampIdx = -1;
    const lampShadowLVPData = new Float32Array(16);
    let matAlbedoView = null, matNormalView = null, matArraySamp = null;
    let matScaleUBO = null, matScaleData = new Float32Array(20);
    let _matAlbedoOn = false, _matNormalOn = false;
    const _matScales = new Float32Array(MAT_TEX_LAYERS);
    let _msaaCount = MSAA_COUNT, _passSamples = 1;
    let sceneMSTex = null, sceneMSView = null, depthMSTex = null, depthMSView = null;
    let depthResolveTex = null, depthResolveView = null, pDepthResolve = null, depthResolveBG = null;
    let _gpuTimerOn = false, _gpuMs = -1, _gpuQuerySet = null, _gpuResolveBuf = null, _gpuReadBuf = null;
    let identInstanceBuf = null;
    let pParticle = null, particleUBO = null, particleVBO = null, _particleCap = 0;
    let skyPipelineMS = null, shadowPipelineInst = null;
    let _fxPipes = { 1: {}, 2: {} };

    // Blocker map objects.
    let blockerTex = null, blockerView = null, blockerSampler = null;
    let blockerUBO = null, blockerBG = null, blockerPipeline = null, blockerG0Layout = null;

    // LENS DIRT grime map: a deterministic 256×256 grime texture sampled by the
    // composite pass (GLX parity). Built once at init; the composite bind group's
    // binding 6 always references it (black 1×1 fallback when there's no canvas),
    // so the group stays valid and the knob simply no-ops.
    let _dirtView = null;

    // TAA Halton Jitter state.
    let _taaFrameIndex = 0;

    // Scene targets (allocated on resize / size change).
    let sceneTex = null, depthTex = null, sceneView = null, depthView = null,
        depthSampleView = null, blitBindGroup = null, _texW = 0, _texH = 0,
        _targetRetryAt = 0, _targetRetryW = 0, _targetRetryH = 0;

    // ── Phase-4 post targets/pipelines (size-independent pipelines built once in
    //    _buildPost; size-dependent targets + bind groups (re)built in
    //    ensureTargets). _postReady/_fxReady gate a safe fallback to the blit. ──
    let _postReady = false, _fxReady = false;
    let ssaoTex = null, ssaoView = null, godrayTex = null, godrayView = null,
        ssaoBlurTex = null, ssaoBlurView = null, godrayBlurTex = null, godrayBlurView = null,
        ldrTex = null, ldrView = null, ssrTex = null;
    let bloomLv = [];                 // [{tex, view, w, h}]
    let bloomDownUBO = [], bloomUpUBO = [], bloomDownBG = [], bloomUpBG = [];
    let ssaoUBO, godrayUBO, compositeUBO, fxaaUBO, ssrUBO, blurUBO;
    let ssaoBG = null, godrayBG = null, compositeBG = null, fxaaBG = null, ssrBG = null;
    let ssaoBlurSrcBG = null, ssaoBlurDstBG = null, godrayBlurSrcBG = null, godrayBlurDstBG = null;
    let pBloomDown, pBloomUp, pSSAO, pBlur, pBlurHDR, pGodray, pComposite, pFXAA, pointSampler, pSSR;
    // Per-pass CPU scratch for uniform writes (largest block is SSAO, 176 B/44 f).
    const postScratch = new Float32Array(80);

    // ── Phase-4 foreground FX (blob shadow / skid / glow / decal). ──
    let quadFxVBO = null, quadFxUBO = null, quadFxBG = null, fxQuadLayout = null;
    let pBlob = null, pMark = null;
    let pSkid = null, skidUBO = null, skidFxBG = null, skidVBO = null,
        _skidCap = 0, _skidScratch = null;
    let pGlow = null, glowUBO = null, glowFxBG = null, glowVBO = null,
        _glowCap = 0, _glowScratch = null;
    let pDecal = null, decalUBO = null, fxDecalLayout = null;
    let _fxQuadSlot = 0, _fxDecalSlot = 0;
    const FX_QUAD_SLOTS = 64, FX_DECAL_SLOTS = 128, FX_STRIDE = 256;
    const fxScratch = new Float32Array(56);   // >= DECAL 224 B / 4
    // Camera-facing glow billboard corner template (mirror GLX _glowCorners).
    const _glowCorners = [[-1, 0], [1, 0], [1, 1], [-1, 0], [1, 1], [-1, 1]];

    try {
      linearSampler = device.createSampler({ magFilter: "linear", minFilter: "linear" });

      // Sun shadow map: a depth texture rendered from the sun's POV, sampled by
      // the LIT shader through a comparison sampler (PCF). Fixed size, created
      // once so frameBindGroup can bind its view at init.
      shadowTex = device.createTexture({
        size: [SHADOW_SIZE, SHADOW_SIZE], format: DEPTH_FORMAT,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      });
      shadowView = shadowTex.createView();
      shadowSampler = device.createSampler({ compare: "less", magFilter: "linear", minFilter: "linear" });

      // Dynamic CAR shadow map (GLX parity): car meshes only, re-rendered every
      // frame — movers can't live in the snap-cached static map above. Always
      // created so binding 8 is a valid depth texture, but at CAR_SHADOW_ALLOC —
      // 1×1 on a phone, where GLX creates no car map at all and the pass below
      // is gated off (see the CAR_SHADOW_ALLOC comment).
      carShadowTex = device.createTexture({
        size: [CAR_SHADOW_ALLOC, CAR_SHADOW_ALLOC], format: DEPTH_FORMAT,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      });
      carShadowView = carShadowTex.createView();
      // Blocker map (PCSS-lite downsampled sun shadow map)
      blockerTex = device.createTexture({
        size: [512, 512], format: "r16float",
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      });
      blockerView = blockerTex.createView();
      blockerSampler = device.createSampler({
        magFilter: "nearest",
        minFilter: "nearest",
        addressModeU: "clamp-to-edge",
        addressModeV: "clamp-to-edge",
      });

      // Placeholder env-cube (1×1×6) + SSR (1×1) so the LIT frame bind group's new
      // bindings 4/5/6 are always valid; the env probe / SSR pass swap in real
      // views later. carReflect/ssrStrength stay 0 until then, so these are no-ops.
      const _envPlace = device.createTexture({ size: [1, 1, 6], dimension: "2d",
        format: SCENE_FORMAT, usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT });
      _envPlaceView = _envPlace.createView({ dimension: "cube" });
      envCubeView = _envPlaceView;
      const _ssrPlace = device.createTexture({ size: [1, 1], format: SCENE_FORMAT,
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT });
      ssrView = _ssrPlace.createView();

      // LENS DIRT grime map (mirror GLX.makeDirtTex): a deterministic 256×256 2D-
      // canvas grime texture the composite pass samples. Built once here so the
      // composite bind group's binding 6 is always valid. On any failure (no
      // document/canvas — e.g. the node test harness) fall back to a black 1×1 so
      // the sample reads 0 and the LENS DIRT knob becomes a clean no-op.
      _dirtView = _makeDirtView();

      // Explicit bind-group layouts (needed for the dynamic-offset draw UBO).
      g0Layout = device.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
            buffer: { type: "uniform" } },
          { binding: 1, visibility: GPUShaderStage.FRAGMENT,
            buffer: { type: "read-only-storage" } },
          { binding: 2, visibility: GPUShaderStage.FRAGMENT,
            texture: { sampleType: "depth" } },
          { binding: 3, visibility: GPUShaderStage.FRAGMENT,
            sampler: { type: "comparison" } },
          { binding: 4, visibility: GPUShaderStage.FRAGMENT,
            texture: { sampleType: "float", viewDimension: "cube" } },   // env probe
          { binding: 5, visibility: GPUShaderStage.FRAGMENT,
            sampler: { type: "filtering" } },                            // env/SSR sampler
          { binding: 6, visibility: GPUShaderStage.FRAGMENT,
            texture: { sampleType: "float" } },                          // SSR result
          { binding: 7, visibility: GPUShaderStage.FRAGMENT,
            texture: { sampleType: "float" } },                          // blocker map (PCSS-lite)
          { binding: 8, visibility: GPUShaderStage.FRAGMENT,
            texture: { sampleType: "depth" } },                          // per-frame car shadow map
          { binding: 9, visibility: GPUShaderStage.FRAGMENT,
            texture: { sampleType: "float", viewDimension: "2d-array" } },
          { binding: 10, visibility: GPUShaderStage.FRAGMENT,
            texture: { sampleType: "float", viewDimension: "2d-array" } },
          { binding: 11, visibility: GPUShaderStage.FRAGMENT,
            sampler: { type: "filtering" } },
          { binding: 12, visibility: GPUShaderStage.FRAGMENT,
            texture: { sampleType: "depth" } },
          { binding: 13, visibility: GPUShaderStage.FRAGMENT,
            buffer: { type: "uniform" } },
        ],
      });
      g1Layout = device.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
            buffer: { type: "uniform", hasDynamicOffset: true, minBindingSize: DRAW_USED_BYTES } },
        ],
      });
      litLayout = device.createPipelineLayout({ bindGroupLayouts: [g0Layout, g1Layout] });

      litModule  = device.createShaderModule({ code: WGSLChunks.LIT });
      skyModule  = device.createShaderModule({ code: WGSLChunks.SKY });
      blitModule = device.createShaderModule({ code: WGSLChunks.BLIT });

      frameUBO = device.createBuffer({ size: FRAME_BYTES, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
      lightSBO = device.createBuffer({ size: LIGHT_BYTES, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
      drawUBO  = device.createBuffer({ size: MAX_DRAWS * DRAW_STRIDE, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
      blitUBO  = device.createBuffer({ size: BLIT_BYTES, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
      skyUBO   = device.createBuffer({ size: WGSLChunks.SKY_UNIFORM_BYTES, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });

      _rebuildFrameBG();
      drawBindGroup = device.createBindGroup({
        layout: g1Layout,
        // size = the DrawU slice; the dynamic offset selects the slot at draw time.
        entries: [{ binding: 0, resource: { buffer: drawUBO, offset: 0, size: DRAW_USED_BYTES } }],
      });

      // Sky pipeline — renders into the LIT pass now, so target = SCENE_FORMAT and
      // it declares the pass's depth attachment (write off, compare always: the
      // sky fills the background without touching depth).
      skyPipeline = device.createRenderPipeline({
        layout: "auto",
        vertex: { module: skyModule, entryPoint: "vs_main" },
        fragment: { module: skyModule, entryPoint: "fs_main", targets: [{ format: SCENE_FORMAT }] },
        primitive: { topology: "triangle-list" },
        depthStencil: { format: DEPTH_FORMAT, depthWriteEnabled: false, depthCompare: "always" },
      });
      if (MSAA_COUNT > 1) {
        skyPipelineMS = device.createRenderPipeline({
          layout: "auto",
          vertex: { module: skyModule, entryPoint: "vs_main" },
          fragment: { module: skyModule, entryPoint: "fs_main", targets: [{ format: SCENE_FORMAT }] },
          primitive: { topology: "triangle-list" },
          depthStencil: { format: DEPTH_FORMAT, depthWriteEnabled: false, depthCompare: "always" },
          multisample: { count: MSAA_COUNT },
        });
      }
      skyBindGroup = device.createBindGroup({
        layout: skyPipeline.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: skyUBO } }],
      });

      // Blit/tonemap pipeline — HDR scene -> swapchain.
      blitPipeline = device.createRenderPipeline({
        layout: "auto",
        vertex: { module: blitModule, entryPoint: "vs_main" },
        fragment: { module: blitModule, entryPoint: "fs_main", targets: [{ format }] },
        primitive: { topology: "triangle-list" },
      });

      // ── Shadow pass pipeline (Phase 3): vertex-only depth render from the sun.
      shadowUBO = device.createBuffer({ size: WGSLChunks.SHADOW_LVP_BYTES, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
      shadowModelUBO = device.createBuffer({ size: SHADOW_SLOTS * SHADOW_MODEL_STRIDE, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
      shadowG0Layout = device.createBindGroupLayout({
        entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: "uniform" } }],
      });
      shadowG1Layout = device.createBindGroupLayout({
        entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX,
          buffer: { type: "uniform", hasDynamicOffset: true, minBindingSize: WGSLChunks.SHADOW_MODEL_BYTES } }],
      });
      shadowModule = device.createShaderModule({ code: WGSLChunks.SHADOW });
      shadowPipeline = device.createRenderPipeline({
        layout: device.createPipelineLayout({ bindGroupLayouts: [shadowG0Layout, shadowG1Layout] }),
        vertex: { module: shadowModule, entryPoint: "vs_main", buffers: [SHADOW_VERTEX_LAYOUT, SHADOW_INSTANCE_LAYOUT] },
        // No fragment stage — depth-only. Slope-scaled bias fights shadow acne.
        // GLX renders the shadow depth with CULLING OFF ("render back faces to avoid
        // peter-panning" — js/render/glx/shadow.js, the CULL_FACE disable), so match that with cullMode:"none" — winding is
        // then moot and both faces cast, exactly like GLX.
        primitive: { topology: "triangle-list", cullMode: "none" },
        depthStencil: { format: DEPTH_FORMAT, depthWriteEnabled: true, depthCompare: "less",
          depthBias: 2, depthBiasSlopeScale: 3, depthBiasClamp: 0 },
      });
      shadowG0BindGroup = device.createBindGroup({
        layout: shadowG0Layout, entries: [{ binding: 0, resource: { buffer: shadowUBO } }],
      });
      shadowModelBindGroup = device.createBindGroup({
        layout: shadowG1Layout,
        entries: [{ binding: 0, resource: { buffer: shadowModelUBO, offset: 0, size: WGSLChunks.SHADOW_MODEL_BYTES } }],
      });
      // Car shadow pass shares the depth pipeline + model ring; only the
      // lightVP uniform differs, via its own group-0 bind group.
      carShadowUBO = device.createBuffer({ size: WGSLChunks.SHADOW_LVP_BYTES, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
      carShadowG0BindGroup = device.createBindGroup({
        layout: shadowG0Layout, entries: [{ binding: 0, resource: { buffer: carShadowUBO } }],
      });
      lampShadowTex = device.createTexture({
        size: [LAMP_SHADOW_SIZE, LAMP_SHADOW_SIZE], format: DEPTH_FORMAT,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      });
      lampShadowView = lampShadowTex.createView();
      lampShadowUBO = device.createBuffer({ size: WGSLChunks.SHADOW_LVP_BYTES, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
      lampShadowG0BindGroup = device.createBindGroup({
        layout: shadowG0Layout, entries: [{ binding: 0, resource: { buffer: lampShadowUBO } }],
      });
      const _matPlace = device.createTexture({
        size: [1, 1, MAT_TEX_LAYERS], format: "rgba8unorm",
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
      });
      matAlbedoView = _matPlace.createView({ dimension: "2d-array" });
      matNormalView = matAlbedoView;
      matArraySamp = device.createSampler({
        magFilter: "linear", minFilter: "linear", mipmapFilter: "linear",
        addressModeU: "repeat", addressModeV: "repeat",
      });
      matScaleUBO = device.createBuffer({ size: 80, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
      device.queue.writeBuffer(matScaleUBO, 0, matScaleData);
      const _ident = new Float32Array(20);
      _ident[0] = _ident[5] = _ident[10] = _ident[15] = 1;
      _ident[16] = _ident[17] = _ident[18] = 1;
      identInstanceBuf = _mkBuffer(_ident, GPUBufferUsage.VERTEX);
      if (_timestampOk) {
        try {
          _gpuQuerySet = device.createQuerySet({ type: "timestamp", count: 2 });
          _gpuResolveBuf = device.createBuffer({ size: 16, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC });
          _gpuReadBuf = device.createBuffer({ size: 16, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
        } catch (_) { _timestampOk = false; }
      }

      // ── Blocker downsample pipeline ──
      blockerUBO = device.createBuffer({
        size: 16, // size of BlockerU
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
      });
      // srcTexel uniform data (1/SHADOW_SIZE, 1/SHADOW_SIZE, 0, 0)
      const blockerUBOData = new Float32Array([1.0 / SHADOW_SIZE, 1.0 / SHADOW_SIZE, 0.0, 0.0]);
      device.queue.writeBuffer(blockerUBO, 0, blockerUBOData);

      blockerG0Layout = device.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "depth" } },
          { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "non-filtering" } },
          { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
        ]
      });
      const blockerModule = device.createShaderModule({ code: WGSLChunks.BLOCKER });
      blockerPipeline = device.createRenderPipeline({
        layout: device.createPipelineLayout({ bindGroupLayouts: [blockerG0Layout] }),
        vertex: { module: blockerModule, entryPoint: "vs_main" },
        fragment: { module: blockerModule, entryPoint: "fs_main", targets: [{ format: "r16float" }] },
        primitive: { topology: "triangle-list" },
      });
      blockerBG = device.createBindGroup({
        layout: blockerG0Layout,
        entries: [
          { binding: 0, resource: shadowView },
          { binding: 1, resource: blockerSampler },
          { binding: 2, resource: { buffer: blockerUBO } },
        ]
      });
      if (MSAA_COUNT > 1 && _Chunks.DEPTH_RESOLVE) {
        const drG0 = device.createBindGroupLayout({ entries: [
          { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "depth", multisampled: true } },
        ] });
        const drMod = device.createShaderModule({ code: _Chunks.DEPTH_RESOLVE });
        pDepthResolve = device.createRenderPipeline({
          layout: device.createPipelineLayout({ bindGroupLayouts: [drG0] }),
          vertex: { module: drMod, entryPoint: "vs_main" },
          fragment: { module: drMod, entryPoint: "fs_main", targets: [] },
          primitive: { topology: "triangle-list" },
          depthStencil: { format: DEPTH_FORMAT, depthWriteEnabled: true, depthCompare: "always" },
        });
      }
    } catch (e) {
      // Fall back to GLX on any pipeline/buffer build failure — but never
      // SILENTLY: this catch once hid a real init bug, and by the time create()
      // returns null the canvas may already hold a webgpu context, which makes
      // the GLX fallback's getContext("webgl2") fail too (blank "needs WebGL2").
      return _fail("init threw: " + ((e && e.message) || e));
    }

    // ── Phase-4 post-processing pipelines (size-independent; targets/BGs are
    //    built per-size in ensureTargets). A failure here only disables the
    //    post chain (present falls back to the tonemap blit) — it does NOT fail
    //    WGX.create(), so lit+sky+shadow still render. ──
    const _UCD = GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST;
    const ALPHA_BLEND = {
      color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha", operation: "add" },
      alpha: { srcFactor: "one",       dstFactor: "one-minus-src-alpha", operation: "add" },
    };
    const ADD_BLEND = {
      color: { srcFactor: "one", dstFactor: "one", operation: "add" },
      alpha: { srcFactor: "one", dstFactor: "one", operation: "add" },
    };
    function _buildPost() {
      if (!_Post) return;
      try {
        pointSampler = device.createSampler({ addressModeU: "clamp-to-edge", addressModeV: "clamp-to-edge" });
        const fsPipe = (code, fmt, blend) => {
          const mod = device.createShaderModule({ code });
          const target = blend ? { format: fmt, blend } : { format: fmt };
          return device.createRenderPipeline({
            layout: "auto",
            vertex: { module: mod, entryPoint: "vs_main" },
            fragment: { module: mod, entryPoint: "fs_main", targets: [target] },
            primitive: { topology: "triangle-list" },
          });
        };
        pBloomDown = fsPipe(_Post.BLOOM_DOWN, SCENE_FORMAT, null);
        pBloomUp   = fsPipe(_Post.BLOOM_UP,   SCENE_FORMAT, ADD_BLEND);   // additive accumulate
        // SSAO samples a DEPTH texture — "auto" layout infers a *filtering*
        // sampler slot, which WebGPU rejects for depth. Build an explicit layout
        // with a non-filtering sampler (pointSampler is nearest = non-filtering).
        {
          const ssaoG0 = device.createBindGroupLayout({ entries: [
            { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "depth" } },
            { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "non-filtering" } },
            { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
          ] });
          const ssaoMod = device.createShaderModule({ code: _Post.SSAO });
          pSSAO = device.createRenderPipeline({
            layout: device.createPipelineLayout({ bindGroupLayouts: [ssaoG0] }),
            vertex: { module: ssaoMod, entryPoint: "vs_main" },
            fragment: { module: ssaoMod, entryPoint: "fs_main", targets: [{ format: SSAO_FORMAT }] },
            primitive: { topology: "triangle-list" },
          });
        }
        // SSR — reads scene colour + depth (depth via a NON-filtering sampler);
        // explicit layout like SSAO. Output rgba16float reflection buffer.
        {
          const ssrG0 = device.createBindGroupLayout({ entries: [
            { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
            { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "depth" } },
            { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
            { binding: 3, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "non-filtering" } },
            { binding: 4, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
          ] });
          const ssrMod = device.createShaderModule({ code: _Post.SSR });
          pSSR = device.createRenderPipeline({
            layout: device.createPipelineLayout({ bindGroupLayouts: [ssrG0] }),
            vertex: { module: ssrMod, entryPoint: "vs_main" },
            fragment: { module: ssrMod, entryPoint: "fs_main", targets: [{ format: SCENE_FORMAT }] },
            primitive: { topology: "triangle-list" },
          });
        }
        {
          const grG0 = device.createBindGroupLayout({ entries: [
            { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "depth" } },
            { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "non-filtering" } },
            { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "depth" } },
            { binding: 3, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "comparison" } },
            { binding: 4, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "depth" } },
            { binding: 5, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
            { binding: 6, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "read-only-storage" } },
          ] });
          const grMod = device.createShaderModule({ code: _Post.GODRAY });
          pGodray = device.createRenderPipeline({
            layout: device.createPipelineLayout({ bindGroupLayouts: [grG0] }),
            vertex: { module: grMod, entryPoint: "vs_main" },
            fragment: { module: grMod, entryPoint: "fs_main", targets: [{ format: SCENE_FORMAT }] },
            primitive: { topology: "triangle-list" },
          });
        }
        if (_Post.BLUR) {
          pBlur    = fsPipe(_Post.BLUR, SSAO_FORMAT,  null);
          pBlurHDR = fsPipe(_Post.BLUR, SCENE_FORMAT, null);
        }
        pComposite = fsPipe(_Post.COMPOSITE, LDR_FORMAT,    null);
        pFXAA      = fsPipe(_Post.FXAA,       format,        null);
        ssaoUBO      = device.createBuffer({ size: _Post.SSAO_UNIFORM_BYTES,      usage: _UCD });
        blurUBO      = device.createBuffer({ size: _Post.BLUR_UNIFORM_BYTES,      usage: _UCD });
        godrayUBO    = device.createBuffer({ size: _Post.GODRAY_UNIFORM_BYTES,    usage: _UCD });
        compositeUBO = device.createBuffer({ size: _Post.COMPOSITE_UNIFORM_BYTES, usage: _UCD });
        fxaaUBO      = device.createBuffer({ size: _Post.FXAA_UNIFORM_BYTES,      usage: _UCD });
        ssrUBO       = device.createBuffer({ size: _Post.SSR_UNIFORM_BYTES,       usage: _UCD });
      } catch (_) { pComposite = null; }   // disable post; ensureTargets stays inert
    }

    // ── Phase-4 foreground-FX pipelines (blob shadow / skid / glow / decal). A
    //    failure leaves _fxReady false and the FX methods no-op. ──
    function _buildFx() {
      if (!_Fx) return;
      try {
        // Shared unit quad (BLOB_SHADOW + MARK), aPos in -0.5..0.5 (x,z).
        const quad = new Float32Array([-0.5,-0.5, 0.5,-0.5, 0.5,0.5, -0.5,-0.5, 0.5,0.5, -0.5,0.5]);
        quadFxVBO = _mkBuffer(quad, GPUBufferUsage.VERTEX);
        const quadVL = { arrayStride: _Fx.QUAD_VERTEX_BYTES,
          attributes: [{ shaderLocation: 0, offset: 0, format: "float32x2" }] };
        // Blob + mark share a dynamic-offset uniform ring (both are 144 B).
        fxQuadLayout = device.createBindGroupLayout({
          entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
            buffer: { type: "uniform", hasDynamicOffset: true, minBindingSize: _Fx.BLOB_SHADOW_UNIFORM_BYTES } }],
        });
        quadFxUBO = device.createBuffer({ size: FX_QUAD_SLOTS * FX_STRIDE, usage: _UCD });
        quadFxBG = device.createBindGroup({ layout: fxQuadLayout,
          entries: [{ binding: 0, resource: { buffer: quadFxUBO, offset: 0, size: _Fx.BLOB_SHADOW_UNIFORM_BYTES } }] });
        const _fxMS = MSAA_COUNT > 1 ? { multisample: { count: MSAA_COUNT } } : {};
        const stampPipe = (code) => {
          const mod = device.createShaderModule({ code });
          return device.createRenderPipeline({
            layout: device.createPipelineLayout({ bindGroupLayouts: [fxQuadLayout] }),
            vertex: { module: mod, entryPoint: "vs_main", buffers: [quadVL] },
            fragment: { module: mod, entryPoint: "fs_main", targets: [{ format: SCENE_FORMAT, blend: ALPHA_BLEND }] },
            primitive: { topology: "triangle-list", cullMode: "none" },
            // Coplanar road decals: bias toward the camera (GL polygonOffset(-4,-8)).
            depthStencil: { format: DEPTH_FORMAT, depthWriteEnabled: false, depthCompare: "less-equal",
              depthBias: -2, depthBiasSlopeScale: -2, depthBiasClamp: 0 },
            ..._fxMS,
          });
        };
        pBlob = stampPipe(_Fx.BLOB_SHADOW);
        pMark = stampPipe(_Fx.MARK);

        // Skid: single batched draw, prebuilt world-space vertex buffer (stride 36).
        const skidMod = device.createShaderModule({ code: _Fx.SKID });
        pSkid = device.createRenderPipeline({
          layout: "auto",
          vertex: { module: skidMod, entryPoint: "vs_main", buffers: [{ arrayStride: _Fx.SKID_VERTEX_BYTES,
            attributes: [
              { shaderLocation: 0, offset: 0,  format: "float32x3" },
              { shaderLocation: 1, offset: 12, format: "float32x2" },
              { shaderLocation: 2, offset: 20, format: "float32x4" },
            ] }] },
          fragment: { module: skidMod, entryPoint: "fs_main", targets: [{ format: SCENE_FORMAT, blend: ALPHA_BLEND }] },
          primitive: { topology: "triangle-list", cullMode: "none" },
          depthStencil: { format: DEPTH_FORMAT, depthWriteEnabled: false, depthCompare: "less-equal",
            depthBias: -2, depthBiasSlopeScale: -2, depthBiasClamp: 0 },
          ..._fxMS,
        });
        skidUBO = device.createBuffer({ size: _Fx.SKID_UNIFORM_BYTES, usage: _UCD });
        skidFxBG = device.createBindGroup({ layout: pSkid.getBindGroupLayout(0),
          entries: [{ binding: 0, resource: { buffer: skidUBO } }] });

        // Glow: additive camera-facing halos, rebuilt each frame (stride 36).
        const glowMod = device.createShaderModule({ code: _Fx.GLOW });
        pGlow = device.createRenderPipeline({
          layout: "auto",
          vertex: { module: glowMod, entryPoint: "vs_main", buffers: [{ arrayStride: _Fx.GLOW_VERTEX_BYTES,
            attributes: [
              { shaderLocation: 0, offset: 0,  format: "float32x2" },
              { shaderLocation: 1, offset: 8,  format: "float32x3" },
              { shaderLocation: 2, offset: 20, format: "float32x3" },
              { shaderLocation: 3, offset: 32, format: "float32" },
            ] }] },
          fragment: { module: glowMod, entryPoint: "fs_main", targets: [{ format: SCENE_FORMAT, blend: ADD_BLEND }] },
          primitive: { topology: "triangle-list", cullMode: "none" },
          depthStencil: { format: DEPTH_FORMAT, depthWriteEnabled: false, depthCompare: "less-equal" },   // no bias
          ..._fxMS,
        });
        glowUBO = device.createBuffer({ size: _Fx.GLOW_UNIFORM_BYTES, usage: _UCD });
        glowFxBG = device.createBindGroup({ layout: pGlow.getBindGroupLayout(0),
          entries: [{ binding: 0, resource: { buffer: glowUBO } }] });

        // Decal: textured atlas quad; dynamic-offset uniform ring + per-texture BG.
        fxDecalLayout = device.createBindGroupLayout({
          entries: [
            { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
              buffer: { type: "uniform", hasDynamicOffset: true, minBindingSize: _Fx.DECAL_UNIFORM_BYTES } },
            { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
            { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
          ],
        });
        const decalMod = device.createShaderModule({ code: _Fx.DECAL });
        pDecal = device.createRenderPipeline({
          layout: device.createPipelineLayout({ bindGroupLayouts: [fxDecalLayout] }),
          vertex: { module: decalMod, entryPoint: "vs_main", buffers: [{ arrayStride: _Fx.DECAL_VERTEX_BYTES,
            attributes: [
              { shaderLocation: 0, offset: 0,  format: "float32x3" },
              { shaderLocation: 1, offset: 12, format: "float32x3" },
              { shaderLocation: 2, offset: 24, format: "float32x2" },
            ] }] },
          fragment: { module: decalMod, entryPoint: "fs_main", targets: [{ format: SCENE_FORMAT, blend: ALPHA_BLEND }] },
          primitive: { topology: "triangle-list", cullMode: "none" },
          depthStencil: { format: DEPTH_FORMAT, depthWriteEnabled: false, depthCompare: "less-equal" },
          ..._fxMS,
        });
        decalUBO = device.createBuffer({ size: FX_DECAL_SLOTS * FX_STRIDE, usage: _UCD });
        if (_Fx.PARTICLE) {
          const pMod = device.createShaderModule({ code: _Fx.PARTICLE });
          pParticle = device.createRenderPipeline({
            layout: "auto",
            vertex: { module: pMod, entryPoint: "vs_main", buffers: [{ arrayStride: _Fx.PARTICLE_VERTEX_BYTES,
              attributes: [
                { shaderLocation: 0, offset: 0,  format: "float32x2" },
                { shaderLocation: 1, offset: 8,  format: "float32x3" },
                { shaderLocation: 2, offset: 20, format: "float32x3" },
                { shaderLocation: 3, offset: 32, format: "float32" },
                { shaderLocation: 4, offset: 36, format: "float32" },
              ] }] },
            fragment: { module: pMod, entryPoint: "fs_main", targets: [{ format: SCENE_FORMAT, blend: ALPHA_BLEND }] },
            primitive: { topology: "triangle-list", cullMode: "none" },
            depthStencil: { format: DEPTH_FORMAT, depthWriteEnabled: false, depthCompare: "less-equal" },
            ..._fxMS,
          });
          particleUBO = device.createBuffer({ size: _Fx.PARTICLE_UNIFORM_BYTES, usage: _UCD });
        }
        _fxReady = true;
      } catch (_) { _fxReady = false; }
    }
    _buildPost();
    _buildFx();

    // ── Lit pipeline variants (blend / cull / alpha-write), built & cached lazily.
    function _litPipeline(opts) {
      const blend = !!(opts && opts.alpha !== undefined && opts.alpha < 1);
      const dbl   = !!(opts && opts.doubleSided);
      const noAW  = !!(opts && opts.noAlphaWrite);
      const samples = _passSamples | 0 || 1;
      const key = (blend ? 1 : 0) | (dbl ? 2 : 0) | (noAW ? 4 : 0) | (samples << 3);
      let p = _litPipelines.get(key);
      if (p) return p;
      const target = {
        format: SCENE_FORMAT,
        writeMask: noAW
          ? (GPUColorWrite.RED | GPUColorWrite.GREEN | GPUColorWrite.BLUE)
          : GPUColorWrite.ALL,
      };
      if (blend) target.blend = {
        color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha", operation: "add" },
        alpha: { srcFactor: "one",       dstFactor: "one-minus-src-alpha", operation: "add" },
      };
      p = device.createRenderPipeline({
        layout: litLayout,
        vertex: { module: litModule, entryPoint: "vs_main", buffers: [VERTEX_LAYOUT, INSTANCE_LAYOUT] },
        fragment: { module: litModule, entryPoint: "fs_main", targets: [target] },
        // GLX default: CCW front, cull back. But WebGPU flips NDC-Y → framebuffer-Y
        // relative to WebGL (framebuffer origin is top-left, y-down), which REVERSES
        // the apparent triangle winding vs GLX. The scene matrices carry no Y-flip
        // (Z01 only remaps z), so GLX's CCW-front meshes present as CW here — declaring
        // frontFace:"cw" restores GLX's exact face selection. Without it, cull:back
        // removes the faces you should see and keeps the interior back faces, so solid
        // boxes (buildings) render hollow — you see through the front wall to the inside.
        // It also fixes the fs_main @builtin(front_facing) two-sided normal flip, which
        // was inverted for the same reason. Translucent (blend) draws must NOT
        // write depth (GLX draw() parity): a 35%-alpha ghost car in the depth
        // buffer culls the cars/props drawn after it, and lands in the depth
        // texture as a solid wall for the SSAO/SSR post passes.
        primitive: { topology: "triangle-list", cullMode: dbl ? "none" : "back", frontFace: "cw" },
        depthStencil: { format: DEPTH_FORMAT, depthWriteEnabled: !blend, depthCompare: "less-equal" },
        multisample: { count: samples },
      });
      _litPipelines.set(key, p);
      return p;
    }

    // ── resize (mirror GLX.resize()) ──
    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, MOBILE_TIER ? 1.5 : 2);
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr * renderScale));
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr * renderScale));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      width = w; height = h; aspect = w / h;
    }
    function setRenderScale(s) {
      s = Math.max(0.5, Math.min(1, s));
      if (Math.abs(s - renderScale) < 0.02) return false;
      renderScale = s;
      resize();
      return true;
    }

    // (Re)allocate the HDR scene target + depth on size change.
    // Frame bind group (group 0 for the LIT pass) — rebuilt whenever a bound view
    // changes: the SSR result texture is resize-dependent, and the env cube swaps
    // from placeholder to real when the probe runs.
    function _makeFrameBGs(nextSsrView) {
      if (!g0Layout || !frameUBO) return;
      const base = (cubeView) => ({
        layout: g0Layout,
        entries: [
          { binding: 0, resource: { buffer: frameUBO } },
          { binding: 1, resource: { buffer: lightSBO } },
          { binding: 2, resource: shadowView },
          { binding: 3, resource: shadowSampler },
          { binding: 4, resource: cubeView },
          { binding: 5, resource: linearSampler },
          { binding: 6, resource: nextSsrView },
          { binding: 7, resource: blockerView },
          { binding: 8, resource: carShadowView },
          { binding: 9, resource: matAlbedoView },
          { binding: 10, resource: matNormalView },
          { binding: 11, resource: matArraySamp },
          { binding: 12, resource: lampShadowView },
          { binding: 13, resource: { buffer: matScaleUBO } },
        ],
      });
      // Main group binds the real cube once the probe is live; the env-render group
      // ALWAYS binds the placeholder so a face is never sampled while it is the render
      // target (read/write feedback — undefined behaviour). draw() picks via _activeFrameBG.
      return {
        main: device.createBindGroup(base(envCubeView)),
        env: device.createBindGroup(base(_envPlaceView || envCubeView)),
      };
    }
    function _rebuildFrameBG() {
      const groups = _makeFrameBGs(ssrView);
      if (!groups) return;
      frameBindGroup = groups.main;
      _envFrameBG = groups.env;
      if (!_activeFrameBG || _activeFrameBG !== _envFrameBG) _activeFrameBG = frameBindGroup;
    }

    function _destroyTargetSet(t) {
      if (!t) return;
      const textures = [t.sceneTex, t.depthTex, t.ssaoTex, t.godrayTex, t.ldrTex, t.ssrTex,
        t.ssaoBlurTex, t.godrayBlurTex, t.sceneMSTex, t.depthMSTex];
      for (let i = 0; i < textures.length; i++) if (textures[i]) textures[i].destroy();
      const levels = t.bloomLv || [];
      for (let i = 0; i < levels.length; i++) levels[i].tex.destroy();
      const buffers = (t.bloomDownUBO || []).concat(t.bloomUpUBO || []);
      for (let i = 0; i < buffers.length; i++) buffers[i].destroy();
    }

    function ensureTargets() {
      if (width < 1 || height < 1) return;
      if (sceneTex && _texW === width && _texH === height) return;
      // Keep rendering through the old transactional target set after a failed
      // resize, but avoid rebuilding and discarding a scene pair every frame.
      // A new size retries immediately; the same size retries after a short
      // cooldown so a transient memory-pressure failure can still recover.
      if (_targetRetryW === width && _targetRetryH === height && Date.now() < _targetRetryAt) return;
      const halfW = Math.max(1, width >> 1), halfH = Math.max(1, height >> 1);
      const next = { bloomLv: [], bloomDownUBO: [], bloomUpUBO: [],
        bloomDownBG: [], bloomUpBG: [], postReady: false, ssrReady: false };
      try {
        next.sceneTex = device.createTexture({
          size: [width, height], format: SCENE_FORMAT,
          usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
        next.depthTex = device.createTexture({
          size: [width, height], format: DEPTH_FORMAT,
          usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
        next.sceneView = next.sceneTex.createView();
        next.depthView = next.depthTex.createView();
        next.depthSampleView = next.depthTex.createView({ aspect: "depth-only" });
        if (_msaaCount > 1) {
          next.sceneMSTex = device.createTexture({
            size: [width, height], format: SCENE_FORMAT, sampleCount: _msaaCount,
            usage: GPUTextureUsage.RENDER_ATTACHMENT });
          next.depthMSTex = device.createTexture({
            size: [width, height], format: DEPTH_FORMAT, sampleCount: _msaaCount,
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
          next.sceneMSView = next.sceneMSTex.createView();
          next.depthMSView = next.depthMSTex.createView();
        }
        next.blitBindGroup = device.createBindGroup({
          layout: blitPipeline.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: next.sceneView },
            { binding: 1, resource: linearSampler },
            { binding: 2, resource: { buffer: blitUBO } },
          ],
        });

        // A missing post pipeline keeps the safe tonemap blit path. The scene
        // pair still swaps transactionally.
        if (!pComposite) {
          next.frameGroups = _makeFrameBGs(ssrView);
        } else {
          next.ssaoTex = device.createTexture({ size: [halfW, halfH], format: SSAO_FORMAT,
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
          next.ssaoBlurTex = device.createTexture({ size: [halfW, halfH], format: SSAO_FORMAT,
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
          next.godrayTex = device.createTexture({ size: [halfW, halfH], format: SCENE_FORMAT,
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
          next.godrayBlurTex = device.createTexture({ size: [halfW, halfH], format: SCENE_FORMAT,
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
          next.ldrTex = device.createTexture({ size: [width, height], format: LDR_FORMAT,
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
          next.ssaoView = next.ssaoTex.createView();
          next.ssaoBlurView = next.ssaoBlurTex.createView();
          next.godrayView = next.godrayTex.createView();
          next.godrayBlurView = next.godrayBlurTex.createView();
          next.ldrView = next.ldrTex.createView();
          // Wet-road SSR gets its own FULL-RES rgba16float target — 8 B/px that
          // GLX never allocates at all (its SSR is inline in the composite
          // shader). On the mobile tier that is the single largest discretionary
          // allocation here, so skip it: binding 6 keeps the 1×1 placeholder,
          // whose .a is 0, and the LIT SSR block documents that as the exact
          // no-op case ("masked-out texels, incl. the 1×1 placeholder"). Wet
          // road on a phone falls back to the analytic sky reflection.
          if (!MOBILE_TIER) {
            next.ssrTex = device.createTexture({ size: [width, height], format: SCENE_FORMAT,
              usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
            next.ssrView = next.ssrTex.createView();
          }

          let bw = halfW, bh = halfH;
          for (let i = 0; i < BLOOM_MAX_LEVELS; i++) {
            if (i > 0) { bw = Math.max(1, bw >> 1); bh = Math.max(1, bh >> 1); }
            if (i > 0 && (bw < 4 || bh < 4)) break;
            const tex = device.createTexture({ size: [bw, bh], format: SCENE_FORMAT,
              usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
            const level = { tex, view: null, w: bw, h: bh };
            next.bloomLv.push(level);   // take ownership before createView can throw
            level.view = tex.createView();
          }
          const nLv = next.bloomLv.length;
          for (let i = 0; i < nLv; i++) {
            const ubo = device.createBuffer({ size: _Post.BLOOM_DOWN_UNIFORM_BYTES,
              usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
            next.bloomDownUBO.push(ubo);
            next.bloomDownBG.push(device.createBindGroup({
              layout: pBloomDown.getBindGroupLayout(0),
              entries: [
                { binding: 0, resource: i === 0 ? next.sceneView : next.bloomLv[i - 1].view },
                { binding: 1, resource: linearSampler },
                { binding: 2, resource: { buffer: ubo } },
              ],
            }));
          }
          for (let i = 0; i < nLv - 1; i++) {
            const ubo = device.createBuffer({ size: _Post.BLOOM_UP_UNIFORM_BYTES,
              usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
            next.bloomUpUBO.push(ubo);
            next.bloomUpBG.push(device.createBindGroup({
              layout: pBloomUp.getBindGroupLayout(0),
              entries: [
                { binding: 0, resource: next.bloomLv[i + 1].view },
                { binding: 1, resource: linearSampler },
                { binding: 2, resource: { buffer: ubo } },
              ],
            }));
          }
          next.ssaoBG = device.createBindGroup({
            layout: pSSAO.getBindGroupLayout(0),
            entries: [
              { binding: 0, resource: next.depthSampleView },
              { binding: 1, resource: pointSampler },
              { binding: 2, resource: { buffer: ssaoUBO } },
            ],
          });
          next.ssaoBlurSrcBG = device.createBindGroup({
            layout: pBlur.getBindGroupLayout(0),
            entries: [
              { binding: 0, resource: next.ssaoView },
              { binding: 1, resource: linearSampler },
              { binding: 2, resource: { buffer: blurUBO } },
            ],
          });
          next.ssaoBlurDstBG = device.createBindGroup({
            layout: pBlur.getBindGroupLayout(0),
            entries: [
              { binding: 0, resource: next.ssaoBlurView },
              { binding: 1, resource: linearSampler },
              { binding: 2, resource: { buffer: blurUBO } },
            ],
          });
          next.godrayBlurSrcBG = device.createBindGroup({
            layout: pBlurHDR.getBindGroupLayout(0),
            entries: [
              { binding: 0, resource: next.godrayView },
              { binding: 1, resource: linearSampler },
              { binding: 2, resource: { buffer: blurUBO } },
            ],
          });
          next.godrayBlurDstBG = device.createBindGroup({
            layout: pBlurHDR.getBindGroupLayout(0),
            entries: [
              { binding: 0, resource: next.godrayBlurView },
              { binding: 1, resource: linearSampler },
              { binding: 2, resource: { buffer: blurUBO } },
            ],
          });
          next.godrayBG = device.createBindGroup({
            layout: pGodray.getBindGroupLayout(0),
            entries: [
              { binding: 0, resource: next.depthSampleView },
              { binding: 1, resource: pointSampler },
              { binding: 2, resource: shadowView },
              { binding: 3, resource: shadowSampler },
              { binding: 4, resource: lampShadowView },
              { binding: 5, resource: { buffer: godrayUBO } },
              { binding: 6, resource: { buffer: lightSBO } },
            ],
          });
          next.compositeBG = device.createBindGroup({
            layout: pComposite.getBindGroupLayout(0),
            entries: [
              { binding: 0, resource: next.sceneView },
              { binding: 1, resource: next.bloomLv[0].view },
              { binding: 2, resource: next.ssaoView },
              { binding: 3, resource: next.godrayView },
              { binding: 4, resource: linearSampler },
              { binding: 5, resource: { buffer: compositeUBO } },
              { binding: 6, resource: _dirtView },   // LENS DIRT grime map (built once at init)
            ],
          });
          next.fxaaBG = device.createBindGroup({
            layout: pFXAA.getBindGroupLayout(0),
            entries: [
              { binding: 0, resource: next.ldrView },
              { binding: 1, resource: linearSampler },
              { binding: 2, resource: { buffer: fxaaUBO } },
            ],
          });
          if (pSSR && next.ssrView) {
            next.ssrBG = device.createBindGroup({
              layout: pSSR.getBindGroupLayout(0),
              entries: [
                { binding: 0, resource: next.sceneView },
                { binding: 1, resource: next.depthSampleView },
                { binding: 2, resource: linearSampler },
                { binding: 3, resource: pointSampler },
                { binding: 4, resource: { buffer: ssrUBO } },
              ],
            });
            next.ssrReady = true;
          }
          // `|| ssrView` keeps the 1×1 placeholder bound when the target above
          // was skipped — binding 6 must always resolve to a real texture view.
          next.frameGroups = _makeFrameBGs(next.ssrView || ssrView);
          next.postReady = true;
        }
      } catch (_) {
        _destroyTargetSet(next);
        _targetRetryW = width; _targetRetryH = height;
        _targetRetryAt = Date.now() + 1000;
        return;
      }

      const old = { sceneTex, depthTex, ssaoTex, godrayTex, ldrTex, ssrTex,
        ssaoBlurTex, godrayBlurTex, bloomLv, bloomDownUBO, bloomUpUBO, sceneMSTex, depthMSTex };
      sceneTex = next.sceneTex; depthTex = next.depthTex;
      sceneMSTex = next.sceneMSTex || null; depthMSTex = next.depthMSTex || null;
      sceneMSView = next.sceneMSView || null; depthMSView = next.depthMSView || null;
      sceneView = next.sceneView; depthView = next.depthView;
      depthSampleView = next.depthSampleView; blitBindGroup = next.blitBindGroup;
      ssaoTex = next.ssaoTex || null; godrayTex = next.godrayTex || null;
      ssaoBlurTex = next.ssaoBlurTex || null; godrayBlurTex = next.godrayBlurTex || null;
      ldrTex = next.ldrTex || null; ssrTex = next.ssrTex || null;
      ssaoView = next.ssaoView || null; godrayView = next.godrayView || null;
      ssaoBlurView = next.ssaoBlurView || null; godrayBlurView = next.godrayBlurView || null;
      ldrView = next.ldrView || null; ssrView = next.ssrView || ssrView;
      bloomLv = next.bloomLv; bloomDownUBO = next.bloomDownUBO;
      bloomUpUBO = next.bloomUpUBO; bloomDownBG = next.bloomDownBG;
      bloomUpBG = next.bloomUpBG; ssaoBG = next.ssaoBG || null;
      ssaoBlurSrcBG = next.ssaoBlurSrcBG || null; ssaoBlurDstBG = next.ssaoBlurDstBG || null;
      godrayBlurSrcBG = next.godrayBlurSrcBG || null; godrayBlurDstBG = next.godrayBlurDstBG || null;
      godrayBG = next.godrayBG || null; compositeBG = next.compositeBG || null;
      fxaaBG = next.fxaaBG || null; ssrBG = next.ssrBG || null;
      if (next.frameGroups) {
        frameBindGroup = next.frameGroups.main;
        _envFrameBG = next.frameGroups.env;
        _activeFrameBG = frameBindGroup;
      }
      _postReady = next.postReady;
      _ssrReady = next.ssrReady;
      _texW = width; _texH = height;
      _targetRetryAt = 0;
      _destroyTargetSet(old);
    }

    // ── buffer helper: create a GPUBuffer initialised from a typed array ──
    function _mkBuffer(data, usage) {
      const size = (data.byteLength + 3) & ~3;   // pad to 4 (mappedAtCreation req.)
      const buf = device.createBuffer({ size, usage, mappedAtCreation: true });
      new data.constructor(buf.getMappedRange()).set(data);
      buf.unmap();
      return buf;
    }

    const _mipPipes = new Map();
    let _mipSamp = null;
    function _generateMips(tex, layers) {
      if (!tex || !device) return;
      const w0 = tex.width | 0, h0 = tex.height | 0;
      const levels = tex.mipLevelCount | 0;
      if (levels <= 1 || !w0) return;
      const nLay = layers || 1;
      try {
        let pipe = _mipPipes.get(tex.format);
        if (!pipe) {
          const code = `
@group(0) @binding(0) var src : texture_2d<f32>;
@group(0) @binding(1) var samp : sampler;
@vertex fn vs_main(@builtin(vertex_index) vi : u32) -> @builtin(position) vec4<f32> {
  var p = array<vec2<f32>, 3>(vec2<f32>(-1.0,-1.0), vec2<f32>(3.0,-1.0), vec2<f32>(-1.0,3.0));
  return vec4<f32>(p[vi], 0.0, 1.0);
}
@fragment fn fs_main(@builtin(position) pos : vec4<f32>) -> @location(0) vec4<f32> {
  let dim = vec2<f32>(textureDimensions(src));
  return textureSampleLevel(src, samp, pos.xy / dim, 0.0);
}`;
          const mod = device.createShaderModule({ code });
          pipe = device.createRenderPipeline({
            layout: "auto",
            vertex: { module: mod, entryPoint: "vs_main" },
            fragment: { module: mod, entryPoint: "fs_main", targets: [{ format: tex.format }] },
            primitive: { topology: "triangle-list" },
          });
          _mipPipes.set(tex.format, pipe);
          if (!_mipSamp) _mipSamp = device.createSampler({ magFilter: "linear", minFilter: "linear" });
        }
        const enc = device.createCommandEncoder();
        for (let layer = 0; layer < nLay; layer++) {
          let w = w0, h = h0;
          for (let level = 1; level < levels; level++) {
            w = Math.max(1, w >> 1); h = Math.max(1, h >> 1);
            const srcView = tex.createView({ dimension: "2d", baseArrayLayer: layer, arrayLayerCount: 1,
              baseMipLevel: level - 1, mipLevelCount: 1 });
            const dstView = tex.createView({ dimension: "2d", baseArrayLayer: layer, arrayLayerCount: 1,
              baseMipLevel: level, mipLevelCount: 1 });
            const bg = device.createBindGroup({
              layout: pipe.getBindGroupLayout(0),
              entries: [{ binding: 0, resource: srcView }, { binding: 1, resource: _mipSamp }],
            });
            const p = enc.beginRenderPass({ colorAttachments: [{ view: dstView, loadOp: "clear",
              clearValue: { r: 0, g: 0, b: 0, a: 1 }, storeOp: "store" }] });
            p.setPipeline(pipe); p.setBindGroup(0, bg); p.draw(3); p.end();
          }
        }
        device.queue.submit([enc.finish()]);
      } catch (_) { /* mip blit is best-effort; caller still has mip 0 */ }
    }

    // Interleave [pos3, nrm3, col3, mat1] -> stride-40 Float32Array + index array.
    function _interleave(data) {
      const pos = toF32(data.pos), nrm = toF32(data.nrm), col = toF32(data.col);
      const vCount = pos.length / 3;
      const big = vCount > 65535;
      let idx = data.idx;
      if (idx instanceof Uint16Array || idx instanceof Uint32Array) {
        if (big && idx instanceof Uint16Array) idx = new Uint32Array(idx);
      } else {
        idx = big ? new Uint32Array(idx) : new Uint16Array(idx);
      }
      const mat = data.mat && data.mat.length === vCount ? toF32(data.mat) : null;
      const trk = data.trk && data.trk.length === vCount * 3 ? toF32(data.trk) : null;
      const inter = new Float32Array(vCount * 13);
      for (let i = 0; i < vCount; i++) {
        const o = i * 13;
        inter[o]   = pos[i*3];   inter[o+1] = pos[i*3+1]; inter[o+2] = pos[i*3+2];
        inter[o+3] = nrm[i*3];   inter[o+4] = nrm[i*3+1]; inter[o+5] = nrm[i*3+2];
        inter[o+6] = col[i*3];   inter[o+7] = col[i*3+1]; inter[o+8] = col[i*3+2];
        inter[o+9] = mat ? mat[i] : 0;
        if (trk) { inter[o+10] = trk[i*3]; inter[o+11] = trk[i*3+1]; inter[o+12] = trk[i*3+2]; }
      }
      return { vert: inter, idx, indexFormat: idx instanceof Uint32Array ? "uint32" : "uint16", count: idx.length };
    }

    // ── Resources (Phase 2) ──
    function createMesh(data) {
      const b = _interleave(data);
      const vbuf = _mkBuffer(b.vert, GPUBufferUsage.VERTEX);
      const ibuf = _mkBuffer(b.idx,  GPUBufferUsage.INDEX);
      return { _wgx: "mesh", vbuf, ibuf, count: b.count, indexFormat: b.indexFormat, chunks: null };
    }
    // Textured decal mesh (Phase 4): interleave pos3+nrm3+uv2 -> stride-32 vbuf +
    // index buffer, matching the DECAL shader vertex layout (js/render/webgpu/wgsl-fx.js).
    function createTexMesh(data) {
      if (!data || !data.pos || !data.nrm || !data.uv) return { _wgx: "texmesh", _phase: 4 };
      const pos = toF32(data.pos), nrm = toF32(data.nrm), uv = toF32(data.uv);
      const vCount = pos.length / 3, big = vCount > 65535;
      let idx = data.idx;
      if (idx instanceof Uint16Array || idx instanceof Uint32Array) {
        if (big && idx instanceof Uint16Array) idx = new Uint32Array(idx);
      } else idx = big ? new Uint32Array(idx) : new Uint16Array(idx);
      const inter = new Float32Array(vCount * 8);
      for (let i = 0; i < vCount; i++) {
        const o = i * 8;
        inter[o]   = pos[i*3];   inter[o+1] = pos[i*3+1]; inter[o+2] = pos[i*3+2];
        inter[o+3] = nrm[i*3];   inter[o+4] = nrm[i*3+1]; inter[o+5] = nrm[i*3+2];
        inter[o+6] = uv[i*2];    inter[o+7] = uv[i*2+1];
      }
      const vbuf = _mkBuffer(inter, GPUBufferUsage.VERTEX);
      const ibuf = _mkBuffer(idx, GPUBufferUsage.INDEX);
      return { _wgx: "texmesh", vbuf, ibuf, count: idx.length, indexFormat: idx instanceof Uint32Array ? "uint32" : "uint16" };
    }

    // Chunked prop mesh: ONE shared vertex buffer + per spatial XZ cell index
    // buffer, each with an AABB (port of GLX.createChunkedMesh).
    function createChunkedMesh(data, cellSize) {
      const cell = cellSize > 0 ? cellSize : 72;
      const pos = toF32(data.pos);
      const vCount = pos.length / 3, big = vCount > 65535;
      const srcIdx = data.idx;
      const triCount = (srcIdx.length / 3) | 0;
      if (triCount < 2000) { const m = createMesh(data); m.chunks = null; return m; }
      const b = _interleave(data);
      const vbuf = _mkBuffer(b.vert, GPUBufferUsage.VERTEX);
      const IndexArray = big ? Uint32Array : Uint16Array;
      const indexFormat = big ? "uint32" : "uint16";
      const buckets = new Map();
      for (let t = 0; t < srcIdx.length; t += 3) {
        const a = srcIdx[t], bi = srcIdx[t+1], c = srcIdx[t+2];
        const ax=pos[a*3],ay=pos[a*3+1],az=pos[a*3+2], bx=pos[bi*3],by=pos[bi*3+1],bz=pos[bi*3+2],
              cx=pos[c*3],cy=pos[c*3+1],cz=pos[c*3+2];
        const gx = Math.floor(((ax+bx+cx)/3)/cell) + 1024;
        const gz = Math.floor(((az+bz+cz)/3)/cell) + 1024;
        const key = gx * 4096 + gz;
        let bk = buckets.get(key);
        if (!bk) { bk = { idx: [], mn: [Infinity,Infinity,Infinity], mx: [-Infinity,-Infinity,-Infinity] }; buckets.set(key, bk); }
        bk.idx.push(a, bi, c);
        const mn = bk.mn, mx = bk.mx;
        if (ax<mn[0])mn[0]=ax; if (ax>mx[0])mx[0]=ax; if (ay<mn[1])mn[1]=ay; if (ay>mx[1])mx[1]=ay; if (az<mn[2])mn[2]=az; if (az>mx[2])mx[2]=az;
        if (bx<mn[0])mn[0]=bx; if (bx>mx[0])mx[0]=bx; if (by<mn[1])mn[1]=by; if (by>mx[1])mx[1]=by; if (bz<mn[2])mn[2]=bz; if (bz>mx[2])mx[2]=bz;
        if (cx<mn[0])mn[0]=cx; if (cx>mx[0])mx[0]=cx; if (cy<mn[1])mn[1]=cy; if (cy>mx[1])mx[1]=cy; if (cz<mn[2])mn[2]=cz; if (cz>mx[2])mx[2]=cz;
      }
      const chunks = [];
      buckets.forEach((bk) => {
        const arr = new IndexArray(bk.idx);
        const ibuf = _mkBuffer(arr, GPUBufferUsage.INDEX);
        chunks.push({ ibuf, count: arr.length, indexFormat, min: bk.mn, max: bk.mx });
      });
      return { _wgx: "chunked", vbuf, chunks, count: chunks.length ? chunks[0].count : 0, indexFormat };
    }
    // Deterministic LENS DIRT grime map (mirror GLX.makeDirtTex, js/render/glx.js): a
    // 256×256 2D-canvas of value-noise + smudge blobs + dust specks + wipe
    // streaks, uploaded as an rgba8unorm texture the composite samples (.r). Same
    // seeded PRNG + draw ops as GLX, so the WebGPU grime matches the WebGL2 look.
    // Falls back to a black 1×1 (knob no-op) when there's no document/canvas.
    function _makeDirtView() {
      const _blackFallback = () => {
        try {
          const tex = device.createTexture({
            size: [1, 1], format: "rgba8unorm",
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
          });
          device.queue.writeTexture({ texture: tex }, new Uint8Array([0, 0, 0, 255]),
            { bytesPerRow: 4, rowsPerImage: 1 }, [1, 1]);
          return tex.createView();
        } catch (_) { return null; }
      };
      try {
        if (typeof document === "undefined" || !document.createElement) return _blackFallback();
        const S = 256;
        const cv = document.createElement("canvas");
        cv.width = cv.height = S;
        const c2 = cv.getContext("2d");
        if (!c2) return _blackFallback();
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
        const tex = device.createTexture({
          size: [S, S], format: "rgba8unorm",
          usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
        });
        device.queue.copyExternalImageToTexture({ source: cv, flipY: true }, { texture: tex }, [S, S]);
        return tex.createView();
      } catch (_) { return _blackFallback(); }
    }

    // 2D texture (decal atlas, Phase 4): upload an ImageBitmap/canvas/ImageData
    // (via copyExternalImageToTexture, flipY to match GLX's UNPACK_FLIP_Y) or raw
    // RGBA bytes (via writeTexture). Returns { texture, view } or an inert token.
    function createTexture(src) {
      try {
        const w = src ? (src.width | 0) : 0, h = src ? (src.height | 0) : 0;
        if (!w || !h) return { _wgx: "texture", _phase: 4 };
        const mips = Math.floor(Math.log2(Math.max(w, h))) + 1;
        const tex = device.createTexture({
          size: [w, h], format: "rgba8unorm", mipLevelCount: mips,
          usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
        });
        if (src instanceof Uint8Array || src instanceof Uint8ClampedArray) {
          device.queue.writeTexture({ texture: tex }, src, { bytesPerRow: w * 4, rowsPerImage: h }, [w, h]);
        } else {
          device.queue.copyExternalImageToTexture({ source: src, flipY: true }, { texture: tex }, [w, h]);
        }
        _generateMips(tex, 1);
        return { _wgx: "texture", texture: tex, view: tex.createView() };
      } catch (_) { return { _wgx: "texture", _phase: 4 }; }
    }

    function freeMesh(m) { if (!m) return; if (m.vbuf) m.vbuf.destroy(); if (m.ibuf) m.ibuf.destroy(); }
    function freeChunkedMesh(m) {
      if (!m) return;
      if (m.vbuf) m.vbuf.destroy();
      if (m.ibuf) m.ibuf.destroy();
      if (m.chunks) for (let i = 0; i < m.chunks.length; i++) m.chunks[i].ibuf.destroy();
    }
    function freeTexture(t) { if (t && t.texture) t.texture.destroy(); }

    // ── frame uniform + light storage upload (mirror GLX.begin) ──
    function _writeFrame(f) {
      const d = frameData;
      const vp = (f.viewProj && f.viewProj.length >= 16) ? f.viewProj : IDENT;
      _mul4(_vpGpu, Z01, vp);   // GL clip (z -1..1) -> WebGPU clip (z 0..1)

      // TAA Halton jitter scaffolding — GATED OFF until a temporal RESOLVE pass
      // exists. Jittering the projection each frame with nothing accumulating
      // the history is pure sub-pixel shimmer over the whole image (the exact
      // "flicker while driving" artifact class), so the offsets stay 0 for now.
      // When a resolve lands: flip _TAA_ENABLED, and feed the per-frame jitter
      // to the resolve pass so it can unjitter history lookups.
      const _TAA_ENABLED = false;
      if (_TAA_ENABLED) {
        const halton = [
          [0.5, 1/3], [0.25, 2/3], [0.75, 1/9], [0.125, 4/9],
          [0.625, 7/9], [0.375, 2/9], [0.875, 5/9], [0.0625, 8/9],
        ];
        _taaFrameIndex = (_taaFrameIndex + 1) % 8;
        const sample = halton[_taaFrameIndex];
        _vpGpu[8] += (sample[0] - 0.5) * 2.0 / width;
        _vpGpu[9] += (sample[1] - 0.5) * 2.0 / height;
      }

      d.set(_vpGpu, 0);
      frameVPGpu.set(_vpGpu);   // persistent copy for the FX passes (post/fx)
      const eye = f.eye || [0,0,0], sd = f.sunDir || [0.3,0.6,0.5], sc = f.sunColor || [1,0.95,0.9];
      // Phase-4 post/FX frame extras.
      frameSunDir = f.sunDir || null;
      frameSunColor = f.sunColor || null;
      frameProjRaw = f.proj || null;
      frameSunVS = f.sunViewDir || null;
      frameUpVS = f.upViewDir || null;
      frameTime = f.time != null ? f.time : 0;
      if (f.invProj && f.invProj.length >= 16) { _mul4(frameInvProjW, f.invProj, Z01INV); frameHaveProj = true; }
      else frameHaveProj = false;
      const T = f.tune || null;
      const ambM = T && T.ambientMul != null ? T.ambientMul : 1;
      const as = f.ambientSky || [0.3,0.32,0.36], ag = f.ambientGround || [0.2,0.19,0.18];
      frameAmbSky = as; frameAmbGround = ag;
      const skz = f.skyZenith || [0.18,0.40,0.78], skh = f.skyHorizon || [0.62,0.74,0.88];
      const fc = f.fogColor || [0.5,0.6,0.7];
      d[16]=eye[0]; d[17]=eye[1]; d[18]=eye[2]; d[19]=0;
      d[20]=sd[0];  d[21]=sd[1];  d[22]=sd[2];  d[23]=0;
      d[24]=sc[0];  d[25]=sc[1];  d[26]=sc[2];  d[27]=0;
      d[28]=as[0]*ambM; d[29]=as[1]*ambM; d[30]=as[2]*ambM; d[31]=0;
      d[32]=ag[0]*ambM; d[33]=ag[1]*ambM; d[34]=ag[2]*ambM; d[35]=0;
      d[36]=skz[0]; d[37]=skz[1]; d[38]=skz[2]; d[39]=0;
      d[40]=skh[0]; d[41]=skh[1]; d[42]=skh[2]; d[43]=0;
      d[44]=fc[0];  d[45]=fc[1];  d[46]=fc[2];  d[47]=0;
      const fogDensity = (f.fogDensity != null ? f.fogDensity : 0) * (T && T.fogDensityMul != null ? T.fogDensityMul : 1);
      const fogHeight = T && T.fogHeight != null ? T.fogHeight : (f.fogHeight != null ? f.fogHeight : 0);
      const L = f.lights;
      const nL = L ? Math.min(MAX_LIGHTS, (L.length / 15) | 0) : 0;
      d[48]=fogDensity; d[49]=fogHeight; d[50]=f.time != null ? f.time : 0; d[51]=nL;
      d[52]=T && T.keyMul != null ? T.keyMul : 1;
      d[53]=T && T.glowAmp != null ? T.glowAmp : 2.3;
      d[54]=f.wetness != null ? f.wetness : 0;
      d[55]=f.cloud != null ? f.cloud : 0;
      // lightVP (floats 56..71) — the Z01-remapped sun view-proj, identical to the
      // matrix the depth map was rasterised with in shadowBegin (so refD matches).
      d.set(_shadowRendered ? shadowLVPData : IDENT, 56);
      // params2 (floats 72..75): shadowOn, strength, texel, shadowBias. Sun below the
      // horizon (sunDir.y < -0.05) forces shadows off so a stale daytime depth
      // map can't leak shadows into a night scene.
      const sunUp = !sd || sd[1] > -0.05;
      d[72] = (_shadowRendered && sunUp) ? 1 : 0;
      // SHADOW STRENGTH knob × KEY-luminance fade (GLX parity, js/render/glx.js lit
      // begin): the night moon-key is deliberately held HIGH (sunDir.y ≈ 0.97
      // drives the sky glow), so the binary sunUp gate above never fires at
      // night — without this fade WebGPU kept full-strength terrain/road sun
      // shadows under moonlight, and prop shadows POPPED when the day↔night
      // key crossed the game.js cast gate instead of fading through dusk in
      // lockstep with it.
      const _kl = f.sunColor ? Math.max(f.sunColor[0], f.sunColor[1], f.sunColor[2]) : 1;
      let _hf = (_kl - 0.28) / 0.14;
      _hf = _hf < 0 ? 0 : _hf > 1 ? 1 : _hf;
      _hf = _hf * _hf * (3 - 2 * _hf);
      // Clear-night moon shadows (GLX parity): floor the key-dim fade with the
      // MOON SHADOWS knob scaled by the clear-night factor (game.js
      // frame.moonGate — clear-night moonK, or above 0.5 the knob itself
      // forcing the floor open regardless of weather).
      const _mSh = (T && T.moonShadow != null ? T.moonShadow : 0.25) * (f.moonGate || 0);
      if (_mSh > _hf) _hf = _mSh;
      d[73] = ((T && T.shadowStr != null) ? T.shadowStr : 1.15) * _hf;
      d[74] = 1 / SHADOW_SIZE;    // texel size for PCF
      d[75] = (T && T.shadowBias != null) ? T.shadowBias : 0.001;   // SHADOW BIAS knob (same 0.001 fallback as GLX)
      // params3 (floats 76..79): live tuner knobs the LIT material blocks consume.
      d[76] = (T && T.bounceK     != null) ? T.bounceK     : 0.04;  // BOUNCE (per-lamp bounce-fill strength, == GLX uBounceK; NOT ambient)
      d[77] = (T && T.fogTint     != null) ? T.fogTint     : 0.0;   // FOG TINT (-1..1)
      // GROUND MIST amount = frame.groundMist × mistDensity (matches GLX
      // uGroundMist = (frame.groundMist||0) * (T.mistDensity??1), in GLX.begin —
      // so mist is 0 unless the frame actually requests it, not an absolute knob.
      d[78] = (f.groundMist != null ? f.groundMist : 0) * (T && T.mistDensity != null ? T.mistDensity : 1);
      d[79] = (T && T.mistHeight  != null) ? T.mistHeight  : 0.30;  // MIST HEIGHT
      // params4 (floats 80..83): pcssPen, shadowTintAmt, carReflect, ssrStrength.
      // ssrStrength is GATED on the SSR pass having bound real resources
      // (_ssrReady below); until then the frame group holds a 1×1 placeholder
      // and it reads 0. carReflect needs no such gate — its reflection term is
      // analytic-sky (no probe resource to wait for).
      // pcssPen is a GLX PENUMBRA-RATE knob (default 80, range 10-300) that GLX
      // feeds into `clamp((z-zb)*pcssPen,0,1)` → a 1.5-6 texel radius. The WGSL
      // shadow shader instead uses it DIRECTLY as `pcfStep = texel*(1+params4.x)`,
      // which was authored around ~0.3 (see the 0.30 fallback). Feeding the raw 80
      // gave an ~81-texel (~10 m) box-blur that smeared every WebGPU shadow to a
      // wash. Remap to the shader's units so pcssPen=80 → the intended ~0.30 step
      // (≈1.3 texels), scaling with the knob and capped so it can't blow out again.
      d[80] = (T && T.pcssPen != null) ? T.pcssPen : 80;
      d[81] = (T && T.shadowTintAmt != null) ? T.shadowTintAmt : 0.0;
      d[82] = (T && T.carReflect != null) ? T.carReflect : 0.0;
      d[83] = _ssrReady ? _frameReflect : 0.0;   // wet-road SSR strength = present opts.reflect (GLX), 0 until the SSR pass is ready
      // params5 (floats 84..87): envProbeStr — the REAL cube probe's strength, live only
      // after a full 6-face capture (_envProbeLive) and driven by the CAR ENV REFLECTION
      // tuner (carEnvCube). 0 keeps Block 7 on the cheap analytic-sky reflection.
      d[84] = (_envProbeLive && T && T.carEnvCube != null) ? T.carEnvCube : 0.0;
      // params5.y: CLOUD SPEED (drives the LIT cloud-shadow dapple drift, same
      // 1.0 fallback as GLX uCloudSpeed).
      d[85] = f.cloudSpeed != null ? f.cloudSpeed : 1.0;
      // params5.z: CLOUD SHADOW DEPTH (how darkly clouds dim the sun; GLX parity).
      // Always pack the resolved value so 0 reads as a real "no cloud shade" and
      // is not confused with an unset slot (WGSL reads params5.z directly).
      d[86] = (T && T.cloudShadowDim != null) ? T.cloudShadowDim : 0.80;
      // params5.w: MIST GLOW SHARE (ground-mist share of the lamp-fog glow; GLX
      // uMistShare parity). Always pack the resolved value so 0 reads as a real
      // "no mist glow" and is not an unset slot (WGSL reads params5.w directly).
      d[87] = (T && T.mistShare != null) ? T.mistShare : 1.5;
      // shadowCtr (floats 88..91): xyz = the UNSNAPPED forward-biased ground anchor
      // the shadow box is snapped around (game.js shadow pass; glides with the
      // camera so the LIT distance fade never jumps on a box recentre), w =
      // shadowRange (SHADOW DISTANCE knob, box half-size in m — same 80 fallback
      // as GLX uShadowRange).
      const sctr = f.shadowCtr || f.eye || [0, 0, 0];
      d[88] = sctr[0]; d[89] = sctr[1]; d[90] = sctr[2];
      d[91] = (T && T.shadowRange != null) ? T.shadowRange : 80.0;   // same fallback as GLX uShadowRange
      // params6 (floats 92..95): wet-surface darkening parity with GLX (.x),
      // car-shadow arm flag (.y — set only on frames where the car caster pass
      // ran; reset each present so a stale map can't keep shadowing), then the
      // pure-look CAR SPARKLE (.z, def 1.6) + FOG SUN CORE (.w, def 0.6) knobs.
      d[92] = (T && T.wetDark != null) ? T.wetDark : 1.0;
      d[93] = _carShadowArmed ? 1.0 : 0.0;
      // params6.z/w: CAR SPARKLE + FOG SUN CORE pure-look knobs (GLX parity).
      // Always pack the resolved value — WGSL reads these lanes directly, so 0 is
      // a real "off", not an unset slot.
      d[94] = (T && T.carSparkle != null) ? T.carSparkle : 1.6;
      d[95] = (T && T.fogSunCore != null) ? T.fogSunCore : 0.6;
      // carLightVP (floats 96..111): the Z01-remapped matrix the car map was
      // rasterised with this frame (stale values are harmless — gated by d[93]).
      d.set(carShadowLVPData, 96);
      // params7 (floats 112..115): GLX-parity lit-shader knobs — FOG LAMP CLIP (.x,
      // uLampFogClip def 0.7), CAR SUN GLINT (.y, uCarSunGlint def 12.0), NEON BOOST
      // (.z, uBloomBoost def 0.6), LAMP NEAR CLAMP (.w, uLampNearClamp def 4.0).
      // Always pack the resolved value; WGSL reads these lanes directly, so 0 is a
      // real "off", not an unset slot.
      d[112] = (T && T.fogClip != null) ? T.fogClip : 0.7;
      d[113] = (T && T.carSunGlint != null) ? T.carSunGlint : 12.0;
      d[114] = (T && T.neonBoost != null) ? T.neonBoost : 0.6;
      d[115] = (T && T.lampNearClamp != null) ? T.lampNearClamp : 4.0;
      d.set(_lampShadowArmed ? lampShadowLVPData : IDENT, 116);
      d[132] = f.lampFog != null ? f.lampFog : 0;
      d[133] = _lampShadowArmed ? 1 : 0;
      d[134] = _lampIdx;
      d[135] = (T && T.matTexMix != null) ? T.matTexMix : 1;
      device.queue.writeBuffer(frameUBO, 0, frameData);

      // Lights: flat stride-15 -> 4×vec4 per light (verbatim field map).
      if (nL > 0) {
        const ld = lightData;
        for (let i = 0; i < nL; i++) {
          const o = i * 15, b = i * 16;
          ld[b]    = L[o];    ld[b+1]  = L[o+1];  ld[b+2]  = L[o+2];  ld[b+3]  = L[o+6];  // pos.xyz, rad
          ld[b+4]  = L[o+3];  ld[b+5]  = L[o+4];  ld[b+6]  = L[o+5];  ld[b+7]  = L[o+12]; // col.rgb, bleed
          ld[b+8]  = L[o+7];  ld[b+9]  = L[o+8];  ld[b+10] = L[o+9];  ld[b+11] = L[o+13]; // dir.xyz, volW
          ld[b+12] = L[o+10]; ld[b+13] = L[o+11]; ld[b+14] = L[o+14]; ld[b+15] = 0;       // cosIn, cosOut, glareW
        }
        device.queue.writeBuffer(lightSBO, 0, lightData, 0, nL * 16);
      }

      frameViewProj = f.viewProj || null;
      frameEye = f.eye || null;
      frameCullDist = f.cullDist || 0;
    }

    // Sky uniform upload (SkyU; consumed by drawSky). Accepts a frame or sky obj.
    function _writeSky(f) {
      const ivp = f.invViewProj || IDENT;
      skyData.set(ivp.length >= 16 ? (ivp.subarray ? ivp.subarray(0, 16) : ivp) : IDENT, 0);
      const z = f.zenith || f.skyZenith || [0.18, 0.40, 0.78];
      const h = f.horizon || f.skyHorizon || [0.62, 0.74, 0.88];
      const sd = f.sunDir || [0.3, 0.6, 0.5];
      const sc = f.sunColor || [1.0, 0.95, 0.9];
      const cg = f.cityGlow || [0, 0, 0];
      skyData[16]=z[0]; skyData[17]=z[1]; skyData[18]=z[2]; skyData[19]=0;
      skyData[20]=h[0]; skyData[21]=h[1]; skyData[22]=h[2]; skyData[23]=0;
      skyData[24]=sd[0]; skyData[25]=sd[1]; skyData[26]=sd[2]; skyData[27]=0;
      skyData[28]=sc[0]; skyData[29]=sc[1]; skyData[30]=sc[2]; skyData[31]=0;
      skyData[32]=cg[0]; skyData[33]=cg[1]; skyData[34]=cg[2]; skyData[35]=0;
      skyData[36]=f.stars ? 1 : 0;
      skyData[37]=f.cloud != null ? f.cloud : 0;
      skyData[38]=f.time != null ? f.time : 0;
      skyData[39]=f.moon != null ? f.moon : 0;
      skyData[40]=f.starBright != null ? f.starBright : 1;
      skyData[41]=f.cloudSpeed != null ? f.cloudSpeed : 1;
      // SKY GRADIENT / STAR DENSITY knobs (GLX parity); defaults reproduce shipped.
      skyData[42]=f.skyGrad     != null ? f.skyGrad     : 0.35;
      skyData[43]=f.starDensity != null ? f.starDensity : 1;
      // p2: MIE SCATTER / CLOUD SILVER / SUN AUREOLE / SUN DISC SIZE pure-look
      // knobs (GLX parity). Always pack the resolved value — WGSL reads these
      // lanes directly (0 is a valid "off" for the first three), so an unset
      // lane must carry the real 1.0 default, not be treated as "no knob".
      skyData[44]=f.mieScatter    != null ? f.mieScatter    : 1;
      skyData[45]=f.cloudSilver   != null ? f.cloudSilver   : 1;
      skyData[46]=f.coronaAureole != null ? f.coronaAureole : 1;
      skyData[47]=f.sunDiscSize   != null ? f.sunDiscSize   : 1;
      // p3.x: DAY SKY BLUE knob (GLX parity, def 1.0 = as-shipped). Always pack the
      // resolved value — WGSL reads the lane directly (0 is a valid "no band").
      skyData[48]=f.daySkyBlue    != null ? f.daySkyBlue    : 1;
      // p3.yzw + p4: STAR SIZE / STAR TWINKLE / MOON DISC SIZE / MOON HALO / SUN
      // CORONA RING / SUN HORIZON SQUASH / CITY GLOW REACH knobs (GLX parity).
      // WGSL reads these lanes directly, so every unset lane must carry the real
      // 1.0 default (= as-shipped), not 0.
      skyData[49]=f.starSize      != null ? f.starSize      : 1;
      skyData[50]=f.starTwinkle   != null ? f.starTwinkle   : 1;
      skyData[51]=f.moonDiscSize  != null ? f.moonDiscSize  : 1;
      skyData[52]=f.moonHalo      != null ? f.moonHalo      : 1;
      skyData[53]=f.sunCorona     != null ? f.sunCorona     : 1;
      skyData[54]=f.sunSquash     != null ? f.sunSquash     : 1;
      skyData[55]=f.cityGlowReach != null ? f.cityGlowReach : 1;
      device.queue.writeBuffer(skyUBO, 0, skyData);
    }

    // ── begin(frame): open the lit pass into the HDR scene target ──
    let encoder = null, litPass = null, currentView = null, _drawSlot = 0;
    function begin(frame) {
      if (_lost) return false;
      lastFrame = frame || null;
      if (width < 1) resize();
      ensureTargets();
      if (!sceneView) return false;
      let tex;
      try { tex = ctx.getCurrentTexture(); } catch (_) { return false; }
      currentView = tex.createView();
      _drawSlot = 0;
      _fxQuadSlot = 0; _fxDecalSlot = 0;
      _activeFrameBG = frameBindGroup;   // main pass samples the real probe cube once live
      _writeFrame(frame || {});
      const fc = (frame && frame.fogColor) || [0.5, 0.6, 0.7];
      encoder = device.createCommandEncoder();
      _passSamples = (_msaaCount > 1 && sceneMSView) ? _msaaCount : 1;
      const colorAtt = _passSamples > 1
        ? { view: sceneMSView, resolveTarget: sceneView, clearValue: { r: fc[0], g: fc[1], b: fc[2], a: 1 },
            loadOp: "clear", storeOp: "discard" }
        : { view: sceneView, clearValue: { r: fc[0], g: fc[1], b: fc[2], a: 1 },
            loadOp: "clear", storeOp: "store" };
      const rp = {
        colorAttachments: [colorAtt],
        depthStencilAttachment: {
          view: _passSamples > 1 ? depthMSView : depthView,
          depthClearValue: 1.0, depthLoadOp: "clear", depthStoreOp: "store",
        },
      };
      if (_gpuTimerOn && _gpuQuerySet) {
        rp.timestampWrites = { querySet: _gpuQuerySet, beginningOfPassWriteIndex: 0, endOfPassWriteIndex: 1 };
      }
      litPass = encoder.beginRenderPass(rp);
      return true;
    }

    function drawSky(sky) {
      if (!litPass) return;
      _writeSky(sky || lastFrame || {});
      litPass.setPipeline((_passSamples > 1 && skyPipelineMS) ? skyPipelineMS : skyPipeline);
      litPass.setBindGroup(0, skyBindGroup);
      litPass.draw(3, 1, 0, 0);
    }

    // Write model + material into the per-draw ring slot.
    function _writeDraw(slot, model, opts) {
      const d = drawData;
      d.set(model && model.length >= 16 ? (model.subarray ? model.subarray(0, 16) : model) : IDENT, 0);
      const o = opts || {};
      d[16] = o.emissive  != null ? o.emissive  : 0;
      d[17] = o.alpha     != null ? o.alpha     : 1;
      d[18] = o.roughness != null ? o.roughness : 0.7;
      d[19] = o.metalness != null ? o.metalness : 0;
      d[20] = o.specular  != null ? o.specular  : 0.5;
      d[21] = o.detail    != null ? o.detail    : 0;
      d[22] = o.clearcoat != null ? o.clearcoat : 0;
      d[23] = o.carPaint  != null ? o.carPaint  : 0;
      d[24] = o.sparkle   != null ? o.sparkle   : 1;
      d[25] = o._instanced ? 1 : 0; d[26] = 0; d[27] = 0;
      device.queue.writeBuffer(drawUBO, slot * DRAW_STRIDE, drawData, 0, DRAW_FLOATS);
    }

    function draw(mesh, model, opts) {
      if (!litPass || !mesh || !mesh.vbuf) return;
      const slot = _drawSlot++;
      if (slot >= MAX_DRAWS) return;
      _writeDraw(slot, model, opts);
      litPass.setPipeline(_litPipeline(opts));
      litPass.setBindGroup(0, _activeFrameBG);
      _dynOff[0] = slot * DRAW_STRIDE;
      litPass.setBindGroup(1, drawBindGroup, _dynOff);
      litPass.setVertexBuffer(0, mesh.vbuf);
      litPass.setVertexBuffer(1, identInstanceBuf);
      litPass.setIndexBuffer(mesh.ibuf, mesh.indexFormat);
      litPass.drawIndexed(mesh.count);
    }

    function drawChunked(mesh, model, opts) {
      if (!litPass || !mesh || !mesh.vbuf) return;
      const slot = _drawSlot++;
      if (slot >= MAX_DRAWS) return;
      _writeDraw(slot, model, opts);
      litPass.setPipeline(_litPipeline(opts));
      litPass.setBindGroup(0, _activeFrameBG);
      _dynOff[0] = slot * DRAW_STRIDE;
      litPass.setBindGroup(1, drawBindGroup, _dynOff);
      litPass.setVertexBuffer(0, mesh.vbuf);
      litPass.setVertexBuffer(1, identInstanceBuf);
      if (!mesh.chunks) {
        litPass.setIndexBuffer(mesh.ibuf, mesh.indexFormat);
        litPass.drawIndexed(mesh.count);
        return;
      }
      const cull = !!frameViewProj;
      if (cull) _extractPlanes(frameViewProj, _fcPlanes);
      const cd = frameCullDist, cd2 = cd * cd;
      const ex = frameEye ? frameEye[0] : 0, ey = frameEye ? frameEye[1] : 0, ez = frameEye ? frameEye[2] : 0;
      const chunks = mesh.chunks;
      for (let i = 0; i < chunks.length; i++) {
        const ch = chunks[i];
        if (cull && !_aabbInFrustum(_fcPlanes, ch.min, ch.max)) continue;
        if (cd > 0 && _aabbDist2(ch.min, ch.max, ex, ey, ez) > cd2) continue;
        litPass.setIndexBuffer(ch.ibuf, ch.indexFormat);
        litPass.drawIndexed(ch.count);
      }
    }

    // Fallback path: the Phase-2 tonemap blit (HDR scene -> swapchain). Used when
    // the post chain never built or a target is missing this frame.
    function _tonemapBlit(exposure) {
      blitData[0] = exposure; blitData[1] = 0; blitData[2] = 0; blitData[3] = 0;
      device.queue.writeBuffer(blitUBO, 0, blitData);
      const bp = encoder.beginRenderPass({
        colorAttachments: [{ view: currentView, clearValue: { r: 0, g: 0, b: 0, a: 1 },
          loadOp: "clear", storeOp: "store" }],
      });
      bp.setPipeline(blitPipeline);
      bp.setBindGroup(0, blitBindGroup);
      bp.draw(3, 1, 0, 0);
      bp.end();
    }

    // A clear-only render pass — used to reset an aux target (SSAO->white,
    // godray/bloom->black) so the composite never samples a stale frame when a
    // pass is skipped, mirroring GLX binding whiteTex/blackTex in those cases.
    function _clearTarget(view, r, g, b) {
      encoder.beginRenderPass({
        colorAttachments: [{ view, clearValue: { r, g, b, a: 1 }, loadOp: "clear", storeOp: "store" }],
      }).end();
    }

    // Separable 5-tap gaussian (GLX BLUR_FS). `times` = 1 for SSAO, 2 for god-ray.
    function _blurSep(pipe, srcView, tmpView, srcBG, tmpBG, texX, texY, times) {
      if (!pipe || !srcView || !tmpView || !srcBG || !tmpBG || !blurUBO) return;
      const n = times || 1;
      for (let i = 0; i < n; i++) {
        const sx = (1 + i) * texX, sy = (1 + i) * texY;
        const s = postScratch;
        s[0] = sx; s[1] = 0; s[2] = 0; s[3] = 0;
        device.queue.writeBuffer(blurUBO, 0, s, 0, _Post.BLUR_UNIFORM_BYTES / 4);
        let p = encoder.beginRenderPass({ colorAttachments: [{ view: tmpView, loadOp: "clear",
          clearValue: { r: 0, g: 0, b: 0, a: 1 }, storeOp: "store" }] });
        p.setPipeline(pipe); p.setBindGroup(0, srcBG); p.draw(3, 1, 0, 0); p.end();
        s[0] = 0; s[1] = sy;
        device.queue.writeBuffer(blurUBO, 0, s, 0, _Post.BLUR_UNIFORM_BYTES / 4);
        p = encoder.beginRenderPass({ colorAttachments: [{ view: srcView, loadOp: "clear",
          clearValue: { r: 0, g: 0, b: 0, a: 1 }, storeOp: "store" }] });
        p.setPipeline(pipe); p.setBindGroup(0, tmpBG); p.draw(3, 1, 0, 0); p.end();
      }
    }

    // ── Live env-cube probe ────────────────────────────────────────────────────
    // GLX parity (js/render/glx.js envFaceBegin/End): capture ONE cube face of the world
    // around the player car per frame into a real RGBA16F cube; after a full 6-face
    // cycle the LIT car-paint block samples it (Block 7, envProbeStr). game.js re-issues
    // the world draws (drawSky + track meshes, NO cars) between begin/end — they record
    // into the face's own pass via litPass, so every lighting uniform matches the frame.
    function envInit() {
      if (envCubeTex) return;
      const envMips = Math.floor(Math.log2(ENV_SIZE)) + 1;
      envCubeTex = device.createTexture({
        size: [ENV_SIZE, ENV_SIZE, 6], dimension: "2d", format: SCENE_FORMAT,
        mipLevelCount: envMips,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      });
      envSampleView = envCubeTex.createView({ dimension: "cube" });
      envFaceViews = [];
      for (let f = 0; f < 6; f++)
        envFaceViews.push(envCubeTex.createView({ dimension: "2d", baseArrayLayer: f, arrayLayerCount: 1, baseMipLevel: 0, mipLevelCount: 1 }));
      envDepthTex = device.createTexture({
        size: [ENV_SIZE, ENV_SIZE], format: DEPTH_FORMAT, usage: GPUTextureUsage.RENDER_ATTACHMENT,
      });
      envDepthView = envDepthTex.createView();
    }

    // Open the pass for one cube face: set the face camera, upload it as the frame
    // uniforms, and point litPass at the face target. Returns the face's RAW invViewProj
    // for drawSky. The env-render frame group binds the PLACEHOLDER cube so the face
    // being written is never simultaneously sampled (feedback). Runs BEFORE begin(), so
    // it uses its own encoder, submitted in envFaceEnd — fully isolated from the frame.
    function envFaceBegin(face, eye, frame) {
      if (_lost || !skyPipeline) return null;
      if (!envCubeTex) envInit();
      _passSamples = 1;
      const F = ENV_FACES[face];
      _envTgt[0] = eye[0] + F[0][0]; _envTgt[1] = eye[1] + F[0][1]; _envTgt[2] = eye[2] + F[0][2];
      M4.lookAtTo(_envView, eye, _envTgt, F[1]);
      M4.perspectiveTo(_envProj, Math.PI / 2, 1, 0.4, 900);
      M4.mulTo(_envVP, _envProj, _envView);   // raw GL view-proj
      M4.invertTo(_envInvVP, _envVP);          // for drawSky ray reconstruction (raw, pre-Z01)
      // Upload the face's frame (viewProj gets the Z01 remap inside _writeFrame). No
      // radial cull for the probe — it must capture the full surroundings.
      const svVP = frame.viewProj, svEye = frame.eye, svCull = frame.cullDist;
      frame.viewProj = _envVP; frame.eye = eye; frame.cullDist = 0;
      _writeFrame(frame);
      frame.viewProj = svVP; frame.eye = svEye; frame.cullDist = svCull;
      const fc = (frame && frame.fogColor) || [0.5, 0.6, 0.7];
      _envEncoder = device.createCommandEncoder();
      litPass = _envEncoder.beginRenderPass({
        colorAttachments: [{ view: envFaceViews[face], clearValue: { r: fc[0], g: fc[1], b: fc[2], a: 1 },
          loadOp: "clear", storeOp: "store" }],
        depthStencilAttachment: { view: envDepthView, depthClearValue: 1.0, depthLoadOp: "clear", depthStoreOp: "store" },
      });
      encoder = _envEncoder;
      _drawSlot = 0; _fxQuadSlot = 0; _fxDecalSlot = 0;
      _activeFrameBG = _envFrameBG;   // placeholder cube while rendering into the real one
      return _envInvVP;
    }

    // Close + submit the face pass. After all six faces the probe goes live: the main
    // frame group is rebuilt to sample the real cube (no mipmaps — Block 7 reads LOD 0,
    // a sharp reflection; WebGPU has no generateMipmap and the car's clearcoat is glossy).
    function envFaceEnd(face) {
      if (!envCubeTex || !litPass || !_envEncoder) return;
      litPass.end();
      device.queue.submit([_envEncoder.finish()]);
      litPass = null; encoder = null; _envEncoder = null;
      _activeFrameBG = frameBindGroup;
      _envFacesMask |= 1 << face;
      if (_envFacesMask === 63) {
        _envFacesMask = 0;
        if (!_envProbeLive) {
          _envProbeLive = true;
          _generateMips(envCubeTex, 6);
          envCubeView = envSampleView;   // main frame group now mirrors the real world
          _rebuildFrameBG();
        }
      }
    }

    // Reset the probe to the placeholder (track change / camera reset) so a stale cube
    // from another location never mirrors onto the paint until a fresh cycle completes.
    function envProbeReset() {
      _envFacesMask = 0; _envProbeLive = false;
      envCubeView = _envPlaceView || envCubeView;
      _rebuildFrameBG();
    }

    // Project the (infinitely distant) sun to a texture-space UV + derive the GLX
    // lens-flare / sun-shaft strengths. Returns null when the sun is behind the
    // camera. Uses the RAW GL view-proj (Z01 changes only clip z, not x/y/w).
    function _sunScreen() {
      const s = frameSunDir, vp = frameViewProj;
      if (!s || !vp) return null;
      const cx = vp[0]*s[0] + vp[4]*s[1] + vp[8]*s[2];
      const cy = vp[1]*s[0] + vp[5]*s[1] + vp[9]*s[2];
      const cw = vp[3]*s[0] + vp[7]*s[1] + vp[11]*s[2];
      if (!(cw > 0)) return null;
      const ndcx = cx / cw, ndcy = cy / cw;
      // GL NDC (y-up) -> texture-space uv (y-down), matching POST_VS.
      const ux = ndcx * 0.5 + 0.5, uy = 0.5 - ndcy * 0.5;
      const sl = frameSunColor ? Math.max(frameSunColor[0], frameSunColor[1], frameSunColor[2]) : 1;
      const gate = Math.min(1, Math.max(0, (sl - 0.35) / 0.45));
      let flare = 0, shaft = 0;
      if (s[1] > -0.02) { const golden = 1 - Math.min(Math.max(s[1], 0) / 0.45, 1); flare = (0.14 + golden * 0.30) * gate; }
      if (s[1] > 0.05) shaft = s[1] * 0.8 * gate;
      return { ux, uy, flare, shaft, onScreen: ux >= 0 && ux <= 1 && uy >= 0 && uy <= 1 };
    }

    // ── present(opts): close the lit pass, run the Phase-4 post chain
    //    (SSAO -> godray -> bloom -> composite -> FXAA), fall back to the blit. ──
    function present(opts) {
      // Car shadow map must be re-armed by a fresh carShadowBegin every frame
      // (GLX parity): the flag was consumed by this frame's _writeFrame already.
      _carShadowArmed = false;
      // A device lost MID-FRAME used to return here with litPass/encoder still
      // set, and begin() bails before it can clear them — so every later draw()
      // passed its `if (!litPass)` guard and recorded into a pass belonging to a
      // dead device. Harmless while the reload above lands, unbounded when it
      // cannot (see the device.lost handler). Drop the frame state instead.
      if (_lost || !encoder) { litPass = null; encoder = null; currentView = null; return; }
      if (litPass) { litPass.end(); litPass = null; }
      if (_passSamples > 1 && pDepthResolve && depthMSView && depthView) {
        try {
          depthResolveBG = device.createBindGroup({
            layout: pDepthResolve.getBindGroupLayout(0),
            entries: [{ binding: 0, resource: depthMSView }],
          });
          const dr = encoder.beginRenderPass({
            colorAttachments: [],
            depthStencilAttachment: { view: depthView, depthClearValue: 1.0, depthLoadOp: "clear", depthStoreOp: "store" },
          });
          dr.setPipeline(pDepthResolve);
          dr.setBindGroup(0, depthResolveBG);
          dr.draw(3);
          dr.end();
        } catch (_) { /* SSAO then samples uncleared resolved depth; AO stays white */ }
      }
      _passSamples = 1;
      const o = opts || {};
      // Capture the wet-road SSR strength GLX consumes as opts.reflect (game.js
      // po.reflect = _ssr). Stored for the NEXT frame's _writeFrame (params4.w),
      // matching the 1-frame lag: this present() writes ssrTex, the next lit pass
      // both samples it AND scales it by this same reflect value.
      _frameReflect = (o.reflect != null ? o.reflect : 0);
      const exposure = o.exposure != null ? o.exposure : 1.0;

      // Fallback: post disabled / targets absent -> tonemap blit, exactly as Phase 2.
      if (!_postReady || !pComposite || !ldrView || bloomLv.length === 0) {
        _tonemapBlit(exposure);
        device.queue.submit([encoder.finish()]);
        encoder = null; currentView = null;
        return;
      }

      const T = o.tune || null;
      const halfW = Math.max(1, width >> 1), halfH = Math.max(1, height >> 1);
      const sun = _sunScreen();
      const sunUVx = sun ? sun.ux : -2, sunUVy = sun ? sun.uy : -2;

      // ── SSR (full-res) — wet-road reflections into ssrTex, consumed by the LIT
      //    pass NEXT frame (frame binding 6, 1-frame lag). Skipped when dry; the
      //    LIT wet-gate (wet=0) no-ops any stale content, so no clear is needed.
      const _wet = (lastFrame && lastFrame.wetness) || 0;
      if (_ssrReady && ssrBG && frameHaveProj && _wet > 0.01) {
        const s = postScratch;
        s.set(frameInvProjW, 0);
        s.set(frameProjRaw && frameProjRaw.length >= 16 ? frameProjRaw : IDENT, 16);
        const up = frameUpVS || [0, 1, 0];
        s[32] = up[0]; s[33] = up[1]; s[34] = up[2]; s[35] = 0;
        const ssrThick = (T && T.ssrThick != null) ? T.ssrThick : 0.20;
        s[36] = 1 / width; s[37] = 1 / height; s[38] = ssrThick; s[39] = 1.0;   // texel, thick, strength
        const skz = (lastFrame && lastFrame.skyZenith) || [0.18, 0.40, 0.78];
        const skh = (lastFrame && lastFrame.skyHorizon) || [0.62, 0.74, 0.88];
        s[40] = skz[0]; s[41] = skz[1]; s[42] = skz[2]; s[43] = 0.62;   // reflSkyLo + upper-screen cutoff
        s[44] = skh[0]; s[45] = skh[1]; s[46] = skh[2]; s[47] = 0;      // reflSkyHi
        device.queue.writeBuffer(ssrUBO, 0, s, 0, _Post.SSR_UNIFORM_BYTES / 4);
        const p = encoder.beginRenderPass({ colorAttachments: [{ view: ssrView, loadOp: "clear",
          clearValue: { r: 0, g: 0, b: 0, a: 0 }, storeOp: "store" }] });
        p.setPipeline(pSSR); p.setBindGroup(0, ssrBG); p.draw(3, 1, 0, 0); p.end();
      }

      // ── 0) SSAO (half-res) into ssaoTex, or clear it to white when unavailable.
      const aoStr = o.ssao != null ? o.ssao : 0;
      const contact = (o.contact > 0 && frameSunVS) ? o.contact : 0;
      const haveAO = frameHaveProj && ssaoBG && (aoStr > 0 || contact > 0);
      if (haveAO) {
        const s = postScratch;
        s.set(frameInvProjW, 0);
        s.set(frameProjRaw && frameProjRaw.length >= 16 ? frameProjRaw : IDENT, 16);
        s[32] = frameSunVS ? frameSunVS[0] : 0; s[33] = frameSunVS ? frameSunVS[1] : 0;
        s[34] = frameSunVS ? frameSunVS[2] : -1; s[35] = 0;
        s[36] = 1 / halfW; s[37] = 1 / halfH; s[38] = aoStr; s[39] = contact;
        s[40] = (T && T.ssaoRadius != null) ? T.ssaoRadius : 0.6; s[41] = 0.4; s[42] = 900; s[43] = 0;
        device.queue.writeBuffer(ssaoUBO, 0, s, 0, _Post.SSAO_UNIFORM_BYTES / 4);
        const p = encoder.beginRenderPass({ colorAttachments: [{ view: ssaoView, loadOp: "clear",
          clearValue: { r: 1, g: 1, b: 1, a: 1 }, storeOp: "store" }] });
        p.setPipeline(pSSAO); p.setBindGroup(0, ssaoBG); p.draw(3, 1, 0, 0); p.end();
        if (pBlur && ssaoBlurView && ssaoBlurSrcBG && ssaoBlurDstBG) {
          _blurSep(pBlur, ssaoView, ssaoBlurView, ssaoBlurSrcBG, ssaoBlurDstBG, 1 / halfW, 1 / halfH, 1);
        }
      } else {
        _clearTarget(ssaoView, 1, 1, 1);
      }

      // ── 1) GODRAY (half-res) — screen-space radial shafts toward the sun,
      //    reading the scene HDR as the bright source; else clear to black.
      const grStr = o.godray != null ? o.godray : 0;
      const lampVol = o.lampVol != null ? o.lampVol : 0;
      const haveGR = godrayBG && ((grStr > 0 && sun && sun.onScreen && sun.shaft > 0) || lampVol > 0);
      if (haveGR) {
        const s = postScratch;
        const invVP = lastFrame && lastFrame.invViewProj;
        if (invVP && invVP.length >= 16) {
          const tmp = new Float32Array(16);
          tmp.set(invVP.length >= 16 ? (invVP.subarray ? invVP.subarray(0, 16) : invVP) : IDENT);
          _mul4(s.subarray(0, 16), tmp, Z01INV);
        } else s.set(IDENT, 0);
        s.set(_shadowRendered ? shadowLVPData : IDENT, 16);
        s.set(_lampShadowArmed ? lampShadowLVPData : IDENT, 32);
        const eye = frameEye || [0, 0, 0];
        s[48] = eye[0]; s[49] = eye[1]; s[50] = eye[2]; s[51] = 0;
        const sd = frameSunDir || [0.3, 0.6, 0.5];
        s[52] = sd[0]; s[53] = sd[1]; s[54] = sd[2]; s[55] = 0;
        const sc = frameSunColor || [1, 0.95, 0.85];
        s[56] = sc[0]; s[57] = sc[1]; s[58] = sc[2]; s[59] = 0;
        s[60] = (sun && sun.shaft > 0) ? grStr : 0;
        s[61] = lampVol;
        s[62] = o.mist != null ? o.mist : 0;
        s[63] = frameTime;
        s[64] = lastFrame && lastFrame.cloud != null ? lastFrame.cloud : 0;
        s[65] = lastFrame && lastFrame.cloudSpeed != null ? lastFrame.cloudSpeed : 1;
        s[66] = (T && T.hgAniso != null) ? T.hgAniso : 0.60;
        s[67] = (T && T.hgFloor != null) ? T.hgFloor : 0.020;
        const nL = lastFrame && lastFrame.lights ? Math.min(6, (lastFrame.lights.length / 15) | 0) : 0;
        s[68] = nL;
        s[69] = _lampShadowArmed ? _lampIdx : -1;
        s[70] = 0; s[71] = 0;
        device.queue.writeBuffer(godrayUBO, 0, s, 0, _Post.GODRAY_UNIFORM_BYTES / 4);
        const p = encoder.beginRenderPass({ colorAttachments: [{ view: godrayView, loadOp: "clear",
          clearValue: { r: 0, g: 0, b: 0, a: 1 }, storeOp: "store" }] });
        p.setPipeline(pGodray); p.setBindGroup(0, godrayBG); p.draw(3, 1, 0, 0); p.end();
        if (pBlurHDR && godrayBlurView && godrayBlurSrcBG && godrayBlurDstBG) {
          _blurSep(pBlurHDR, godrayView, godrayBlurView, godrayBlurSrcBG, godrayBlurDstBG,
            1 / halfW, 1 / halfH, 2);
        }
      } else {
        _clearTarget(godrayView, 0, 0, 0);
      }

      // ── 2+3) BLOOM mip chain (down bright-pass+blur, then additive up).
      const bloomAmt = o.bloom != null ? o.bloom : 0.55;
      const threshold = o.threshold != null ? o.threshold : 0.75;
      const spread = (T && T.bloomSpread != null) ? T.bloomSpread : 1;
      const nLv = bloomLv.length;
      if (bloomAmt > 0) {
        // Downsample: mip0 bright-pass gates the scene; mips 1..N plain downsample.
        for (let i = 0; i < nLv; i++) {
          const src = i === 0 ? { w: width, h: height } : bloomLv[i - 1];
          const s = postScratch;
          s[0] = 1 / src.w; s[1] = 1 / src.h; s[2] = i === 0 ? threshold : 0; s[3] = 0;
          device.queue.writeBuffer(bloomDownUBO[i], 0, s, 0, _Post.BLOOM_DOWN_UNIFORM_BYTES / 4);
          const p = encoder.beginRenderPass({ colorAttachments: [{ view: bloomLv[i].view,
            loadOp: "clear", clearValue: { r: 0, g: 0, b: 0, a: 1 }, storeOp: "store" }] });
          p.setPipeline(pBloomDown); p.setBindGroup(0, bloomDownBG[i]); p.draw(3, 1, 0, 0); p.end();
        }
        // Upsample: from the smallest level down to mip0, additive (load) blend.
        for (let i = nLv - 2; i >= 0; i--) {
          const s = postScratch;
          s[0] = 1 / bloomLv[i + 1].w; s[1] = 1 / bloomLv[i + 1].h; s[2] = spread; s[3] = 0;
          device.queue.writeBuffer(bloomUpUBO[i], 0, s, 0, _Post.BLOOM_UP_UNIFORM_BYTES / 4);
          const p = encoder.beginRenderPass({ colorAttachments: [{ view: bloomLv[i].view,
            loadOp: "load", storeOp: "store" }] });
          p.setPipeline(pBloomUp); p.setBindGroup(0, bloomUpBG[i]); p.draw(3, 1, 0, 0); p.end();
        }
      } else {
        _clearTarget(bloomLv[0].view, 0, 0, 0);   // composite reads zero bloom
      }

      // ── 4) COMPOSITE (full-res) -> LDR intermediate.
      {
        const s = postScratch;
        // Normalise mip-chain accumulation to keep the tuned bloom energy (GLX).
        const bloomNorm = bloomAmt > 0 ? bloomAmt * 1.25 / Math.max(nLv - 1, 1) : 0;
        const flareStr = sun ? sun.flare * (o.flareMul != null ? o.flareMul : 1) : 0;
        // SCREEN SUN-SHAFT knob scales the composite shaft gate (GLX folds
        // sunShaftMul into uSunShaft the same way). Default 1.0 = as-shipped.
        const shaftMul = (T && T.sunShaftMul != null) ? T.sunShaftMul : 1.0;
        s[0] = exposure; s[1] = bloomNorm; s[2] = haveGR ? shaftMul : 0.0; s[3] = flareStr;   // p0
        s[4] = sunUVx; s[5] = sunUVy;
        s[6] = (T && T.whitePoint != null) ? T.whitePoint : 1.0;
        s[7] = (T && T.blackLift != null) ? T.blackLift : 0.005;                          // sunUV
        s[8]  = (T && T.contrast   != null) ? T.contrast   : 1.12;
        s[9]  = (T && T.vibrance   != null) ? T.vibrance   : 0.20;
        s[10] = (T && T.saturation != null) ? T.saturation : 1.0;
        s[11] = (T && T.tint       != null) ? T.tint       : 0.0;                         // grade
        s[12] = (T && T.vignette   != null) ? T.vignette   : 0.80;
        s[13] = (T && T.grain      != null) ? T.grain      : 0.0;
        s[14] = frameTime; s[15] = 0;                                                     // fx
        const grade = o.grade || null;
        const gsh = grade && grade.shadow ? grade.shadow : [1, 1, 1];
        const ghi = grade && grade.hi ? grade.hi : [1, 1, 1];
        s[16] = gsh[0]; s[17] = gsh[1]; s[18] = gsh[2];
        s[19] = grade && grade.str != null ? grade.str : 0;                              // gradeShadow (w=str)
        s[20] = ghi[0]; s[21] = ghi[1]; s[22] = ghi[2]; s[23] = 0;                        // gradeHi
        s[24] = 1 / width; s[25] = 1 / height; s[26] = 0; s[27] = 0;                      // texel
        // imgFx (off 112): chromatic aberration, sharpen, speed-blur, bloom knee.
        s[28] = (T && T.chromAb != null) ? T.chromAb : 0.0;
        s[29] = (T && T.sharpen != null) ? T.sharpen : 0.0;
        s[30] = (o.speedBlur != null) ? o.speedBlur : ((T && T.speedBlur != null) ? T.speedBlur : 0.0);
        s[31] = (T && T.bloomKnee != null) ? T.bloomKnee : 0.5;
        // tuneFx (off 128): vignette reach + FLARE CORE STREAK (def 0.5; GLX
        // parity, read directly so 0 is a real "off") + ACES curve coeff e in .z
        // + FLARE STREAK width (def 7.0) in .w. Streak default matches the literal
        // the shader used before this lane, so the shipped look is byte-identical.
        s[32] = (T && T.vignetteSoft != null) ? T.vignetteSoft : 0.35;
        s[33] = (T && T.flareStreak2 != null) ? T.flareStreak2 : 0.5;
        s[34] = (T && T.acesE != null) ? T.acesE : 0.14;   // tuneFx.z = ACES e
        s[35] = (T && T.flareStreak != null) ? T.flareStreak : 7.0;   // tuneFx.w = FLARE STREAK width
        // HDR grade (off 144..223): five tonal zones, toe/shoulder, RGB lift/gamma/gain.
        s[36] = (T && T.blacks     != null) ? T.blacks     : 0;
        s[37] = (T && T.shadows    != null) ? T.shadows    : 0;
        s[38] = (T && T.midtones   != null) ? T.midtones   : 0;
        s[39] = (T && T.highlights != null) ? T.highlights : 0;                           // tone0
        s[40] = (T && T.whites     != null) ? T.whites     : 0;
        s[41] = (T && T.toe        != null) ? T.toe        : 0;
        s[42] = (T && T.shoulder   != null) ? T.shoulder   : 0; s[43] = 0;                 // tone1
        s[44] = (T && T.liftR      != null) ? T.liftR      : 0;
        s[45] = (T && T.liftG      != null) ? T.liftG      : 0;
        s[46] = (T && T.liftB      != null) ? T.liftB      : 0; s[47] = 0;                 // lift
        s[48] = (T && T.gammaR     != null) ? T.gammaR     : 1;
        s[49] = (T && T.gammaG     != null) ? T.gammaG     : 1;
        s[50] = (T && T.gammaB     != null) ? T.gammaB     : 1; s[51] = 0;                 // gamma
        s[52] = (T && T.gainR      != null) ? T.gainR      : 1;
        s[53] = (T && T.gainG      != null) ? T.gainG      : 1;
        s[54] = (T && T.gainB      != null) ? T.gainB      : 1; s[55] = 0;                 // gain
        // aces (off 224): TONE CURVE coeffs a,b,c,d (GLX parity). Always packed —
        // defaults reproduce the shipped Narkowicz curve byte-for-byte.
        s[56] = (T && T.acesA != null) ? T.acesA : 2.51;
        s[57] = (T && T.acesB != null) ? T.acesB : 0.03;
        s[58] = (T && T.acesC != null) ? T.acesC : 2.43;
        s[59] = (T && T.acesD != null) ? T.acesD : 0.59;
        // dirtFx (off 240): LENS DIRT (.x; GLX parity, def 0.15). Always packed —
        // the WGSL reads the lane directly (0 = clean lens is a real value).
        s[60] = (T && T.lensDirt != null) ? T.lensDirt : 0.15;
        const haze = o.haze || null;
        s[61] = haze && haze.u != null ? haze.u : 0;
        s[62] = haze && haze.v != null ? haze.v : 0;
        s[63] = haze && haze.str != null ? haze.str : 0;
        device.queue.writeBuffer(compositeUBO, 0, s, 0, _Post.COMPOSITE_UNIFORM_BYTES / 4);
        const p = encoder.beginRenderPass({ colorAttachments: [{ view: ldrView, loadOp: "clear",
          clearValue: { r: 0, g: 0, b: 0, a: 1 }, storeOp: "store" }] });
        p.setPipeline(pComposite); p.setBindGroup(0, compositeBG); p.draw(3, 1, 0, 0); p.end();
      }

      // ── 5) FXAA (full-res) -> swapchain.
      {
        const s = postScratch;
        s[0] = 1 / width; s[1] = 1 / height; s[2] = 0; s[3] = 0;
        device.queue.writeBuffer(fxaaUBO, 0, s, 0, _Post.FXAA_UNIFORM_BYTES / 4);
        const p = encoder.beginRenderPass({ colorAttachments: [{ view: currentView, loadOp: "clear",
          clearValue: { r: 0, g: 0, b: 0, a: 1 }, storeOp: "store" }] });
        p.setPipeline(pFXAA); p.setBindGroup(0, fxaaBG); p.draw(3, 1, 0, 0); p.end();
      }

      if (_gpuTimerOn && _gpuQuerySet && _gpuResolveBuf && _gpuReadBuf && _gpuReadBuf.mapState !== "pending") {
        try {
          encoder.resolveQuerySet(_gpuQuerySet, 0, 2, _gpuResolveBuf, 0);
          encoder.copyBufferToBuffer(_gpuResolveBuf, 0, _gpuReadBuf, 0, 16);
        } catch (_) { /* timer stays at last-good / -1 */ }
      }
      device.queue.submit([encoder.finish()]);
      if (_gpuTimerOn && _gpuReadBuf && typeof _gpuReadBuf.mapAsync === "function") {
        try {
          _gpuReadBuf.mapAsync(GPUMapMode.READ).then(function () {
            try {
              const t = new BigUint64Array(_gpuReadBuf.getMappedRange());
              _gpuMs = Number(t[1] - t[0]) / 1e6;
              _gpuReadBuf.unmap();
            } catch (_) { /* keep last-good gpuMs */ }
          });
        } catch (_) { /* mapAsync unsupported or already mapped */ }
      }
      encoder = null; currentView = null;
    }

    // ── Shadow pass (Phase 3): sun depth map ──────────────────────────────
    // Runs BEFORE begin() each frame (matches game.js render order): its own
    // command encoder, submitted in shadowEnd() so the depth map is ready for
    // the later lit pass that samples it. All current casters use MAT_IDENT, but
    // model is honoured via a dynamic-offset ring (one slot per castShadow* call).
    function _writeShadowModel(slot, model) {
      shadowModelData.set(model && model.length >= 16 ? (model.subarray ? model.subarray(0, 16) : model) : IDENT, 0);
      device.queue.writeBuffer(shadowModelUBO, slot * SHADOW_MODEL_STRIDE, shadowModelData, 0, 16);
    }
    function _shadowSetModel(model) {
      const slot = _shadowSlot++;
      if (slot >= SHADOW_SLOTS) return -1;
      _writeShadowModel(slot, model);
      shadowPass.setBindGroup(1, shadowModelBindGroup, [slot * SHADOW_MODEL_STRIDE]);
      return slot;
    }
    function shadowBegin(lightVP) {
      if (_lost || !shadowView) return;
      _shadowLightVP = (lightVP && lightVP.length >= 16) ? lightVP : IDENT;  // raw — CPU chunk cull
      _mul4(shadowLVPData, Z01, _shadowLightVP);   // Z01-remapped — depth store + LIT lookup
      device.queue.writeBuffer(shadowUBO, 0, shadowLVPData);
      _shadowSlot = 0;
      shadowEncoder = device.createCommandEncoder();
      shadowPass = shadowEncoder.beginRenderPass({
        colorAttachments: [],
        depthStencilAttachment: { view: shadowView, depthClearValue: 1.0, depthLoadOp: "clear", depthStoreOp: "store" },
      });
      shadowPass.setPipeline(shadowPipeline);
      shadowPass.setBindGroup(0, shadowG0BindGroup);
      if (lightVP) _extractPlanes(lightVP, _fcPlanes);   // light frustum for chunk cull
    }
    function castShadow(mesh, model) {
      if (!shadowPass || !mesh || !mesh.vbuf) return;
      if (_shadowSetModel(model) < 0) return;
      shadowPass.setVertexBuffer(0, mesh.vbuf);
      shadowPass.setVertexBuffer(1, identInstanceBuf);
      if (mesh.chunks) {   // a chunked mesh cast without cull — draw every chunk
        for (let i = 0; i < mesh.chunks.length; i++) {
          const ch = mesh.chunks[i];
          shadowPass.setIndexBuffer(ch.ibuf, ch.indexFormat);
          shadowPass.drawIndexed(ch.count);
        }
        return;
      }
      shadowPass.setIndexBuffer(mesh.ibuf, mesh.indexFormat);
      shadowPass.drawIndexed(mesh.count);
    }
    function castShadowChunked(mesh, model) {
      if (!shadowPass || !mesh || !mesh.vbuf) return;
      if (_shadowSetModel(model) < 0) return;
      shadowPass.setVertexBuffer(0, mesh.vbuf);
      shadowPass.setVertexBuffer(1, identInstanceBuf);
      if (!mesh.chunks) { shadowPass.setIndexBuffer(mesh.ibuf, mesh.indexFormat); shadowPass.drawIndexed(mesh.count); return; }
      const cull = !!_shadowLightVP;   // planes were extracted into _fcPlanes in shadowBegin
      for (let i = 0; i < mesh.chunks.length; i++) {
        const ch = mesh.chunks[i];
        if (cull && !_aabbInFrustum(_fcPlanes, ch.min, ch.max)) continue;
        shadowPass.setIndexBuffer(ch.ibuf, ch.indexFormat);
        shadowPass.drawIndexed(ch.count);
      }
    }
    function shadowEnd() {
      if (!shadowPass) return;
      shadowPass.end(); shadowPass = null;

      // Run blocker map min-reduction pass (WebGL2 parity uBlockerMap)
      if (blockerPipeline && blockerBG && blockerView) {
        const blockerPass = shadowEncoder.beginRenderPass({
          colorAttachments: [{
            view: blockerView,
            loadOp: "clear",
            clearValue: { r: 1.0, g: 0.0, b: 0.0, a: 1.0 },
            storeOp: "store"
          }]
        });
        blockerPass.setPipeline(blockerPipeline);
        blockerPass.setBindGroup(0, blockerBG);
        blockerPass.draw(3, 1, 0, 0);
        blockerPass.end();
      }

      device.queue.submit([shadowEncoder.finish()]);
      shadowEncoder = null;
      _shadowRendered = true;
    }

    // ── Dynamic CAR shadow pass (GLX parity): car meshes only, every frame ──
    // Shares the depth pipeline and the dynamic-offset model ring with the
    // static pass (safe: shadowEnd submits before this Begin rewrites slots).
    // PHONES keep blob-only shadows, matching GLX — which gates on IS_MOBILE, the
    // device, not MOBILE_TIER: GRAPHICS: HIGH buys quality, not a per-frame extra
    // depth pass on a phone GPU. The map itself is 1×1 there, so this gate is also
    // what keeps the pass from rasterising cars into a 1-pixel target.
    function carShadowBegin(lightVP) {
      if (_lost || !carShadowView || IS_MOBILE) return;
      _carArms++;   // lifetime arm count, mirroring GLX SHD.carArms (debug only)
      _shadowLightVP = null;   // castShadowChunked must NOT frustum-cull with stale static planes
      _mul4(carShadowLVPData, Z01, (lightVP && lightVP.length >= 16) ? lightVP : IDENT);
      device.queue.writeBuffer(carShadowUBO, 0, carShadowLVPData);
      _shadowSlot = 0;
      shadowEncoder = device.createCommandEncoder();
      shadowPass = shadowEncoder.beginRenderPass({
        colorAttachments: [],
        depthStencilAttachment: { view: carShadowView, depthClearValue: 1.0, depthLoadOp: "clear", depthStoreOp: "store" },
      });
      shadowPass.setPipeline(shadowPipeline);
      shadowPass.setBindGroup(0, carShadowG0BindGroup);
    }
    function carShadowEnd() {
      if (!shadowPass) return;
      shadowPass.end(); shadowPass = null;
      device.queue.submit([shadowEncoder.finish()]);
      shadowEncoder = null;
      _carShadowArmed = true;
    }

    function lampShadowBegin(lightVP, lightIdx) {
      if (_lost || !lampShadowView || MOBILE_TIER) return;
      _lampArms++;
      _lampIdx = lightIdx | 0;
      _shadowLightVP = null;
      _mul4(lampShadowLVPData, Z01, (lightVP && lightVP.length >= 16) ? lightVP : IDENT);
      device.queue.writeBuffer(lampShadowUBO, 0, lampShadowLVPData);
      _shadowSlot = 0;
      shadowEncoder = device.createCommandEncoder();
      shadowPass = shadowEncoder.beginRenderPass({
        colorAttachments: [],
        depthStencilAttachment: { view: lampShadowView, depthClearValue: 1.0, depthLoadOp: "clear", depthStoreOp: "store" },
      });
      shadowPass.setPipeline(shadowPipeline);
      shadowPass.setBindGroup(0, lampShadowG0BindGroup);
    }
    function lampShadowEnd() {
      if (!shadowPass) return;
      shadowPass.end(); shadowPass = null;
      device.queue.submit([shadowEncoder.finish()]);
      shadowEncoder = null;
      _lampShadowArmed = true;
    }

    function createTextureArray(size, images, layers) {
      if (!size || !images) return null;
      const n = layers || MAT_TEX_LAYERS;
      try {
        const mips = Math.floor(Math.log2(size)) + 1;
        const tex = device.createTexture({
          size: [size, size, n], format: "rgba8unorm", mipLevelCount: mips,
          usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
        });
        let filled = 0;
        for (let i = 0; i < n; i++) {
          const img = images[i];
          if (!img) continue;
          try {
            if (img instanceof Uint8Array || img instanceof Uint8ClampedArray) {
              device.queue.writeTexture({ texture: tex, origin: [0, 0, i] }, img,
                { bytesPerRow: size * 4, rowsPerImage: size }, [size, size, 1]);
            } else {
              device.queue.copyExternalImageToTexture(
                { source: img, flipY: false },
                { texture: tex, origin: [0, 0, i] },
                [size, size]);
            }
            filled++;
          } catch (_) { /* skip a missing/bad layer; pack still ships */ }
        }
        if (!filled) { try { tex.destroy(); } catch (_) { /* already invalid */ } return null; }
        _generateMips(tex, n);
        return { _wgx: "texarray", texture: tex, view: tex.createView({ dimension: "2d-array" }), layers: n };
      } catch (_) { return null; }
    }
    function setMaterialMaps(maps) {
      if (!maps) {
        _matAlbedoOn = false; _matNormalOn = false;
        _matScales.fill(0); matScaleData.fill(0);
        if (matScaleUBO) device.queue.writeBuffer(matScaleUBO, 0, matScaleData);
        return;
      }
      if (maps.albedo && maps.albedo.view) { matAlbedoView = maps.albedo.view; _matAlbedoOn = true; }
      if (maps.normal && maps.normal.view) { matNormalView = maps.normal.view; _matNormalOn = true; }
      const sc = maps.scales;
      _matScales.fill(0);
      if (sc) for (let i = 0; i < MAT_TEX_LAYERS; i++) _matScales[i] = +sc[i] > 0 ? +sc[i] : 0;
      if (!_matAlbedoOn) _matScales.fill(0);
      matScaleData.fill(0);
      matScaleData.set(_matScales);
      if (matScaleUBO) device.queue.writeBuffer(matScaleUBO, 0, matScaleData);
      _rebuildFrameBG();
    }
    function materialMapState() {
      let layers = 0;
      for (let i = 0; i < MAT_TEX_LAYERS; i++) if (_matScales[i] > 0) layers++;
      return { albedo: _matAlbedoOn, normal: _matNormalOn, layers, scales: Array.from(_matScales) };
    }

    function gpuTimer(on) {
      if (on !== undefined) {
        _gpuTimerOn = !!on && !!_timestampOk;
        if (!_gpuTimerOn) _gpuMs = -1;
      }
      return { supported: !!_timestampOk, on: _gpuTimerOn };
    }
    function gpuMs() { return _gpuMs; }

    function createInstancedBatch(data, matrices, colors, opts) {
      const mesh = createMesh(data);
      const n = (matrices && matrices.length) ? (matrices.length / 16) | 0 : 0;
      const packed = new Float32Array(n * 20);
      for (let i = 0; i < n; i++) {
        packed.set(matrices.subarray ? matrices.subarray(i * 16, i * 16 + 16) : matrices.slice(i * 16, i * 16 + 16), i * 20);
        if (colors && colors.length) {
          packed[i * 20 + 16] = colors[i * 3] || 1;
          packed[i * 20 + 17] = colors[i * 3 + 1] || 1;
          packed[i * 20 + 18] = colors[i * 3 + 2] || 1;
        } else {
          packed[i * 20 + 16] = packed[i * 20 + 17] = packed[i * 20 + 18] = 1;
        }
      }
      mesh.instBuf = n ? _mkBuffer(packed, GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST) : identInstanceBuf;
      mesh.instances = n;
      mesh.visible = n;
      mesh._instPacked = packed;
      if (opts && opts.cellSize > 0 && n) {
        const cell = opts.cellSize;
        let reach = opts.radius || 0;
        if (!reach) {
          const p0 = data.pos;
          for (let i = 0; i < p0.length; i++) { const a = Math.abs(p0[i]); if (a > reach) reach = a; }
        }
        const buckets = new Map();
        for (let i = 0; i < n; i++) {
          const b = i * 16, x = matrices[b + 12], y = matrices[b + 13], z = matrices[b + 14];
          const sx = Math.hypot(matrices[b], matrices[b + 1], matrices[b + 2]);
          const sy = Math.hypot(matrices[b + 4], matrices[b + 5], matrices[b + 6]);
          const sz = Math.hypot(matrices[b + 8], matrices[b + 9], matrices[b + 10]);
          const r = reach * Math.max(sx, sy, sz);
          const key = (Math.floor(x / cell) + 1024) * 4096 + (Math.floor(z / cell) + 1024);
          let bk = buckets.get(key);
          if (!bk) buckets.set(key, (bk = { idx: [], mn: [Infinity, Infinity, Infinity], mx: [-Infinity, -Infinity, -Infinity] }));
          bk.idx.push(i);
          const mn = bk.mn, mx = bk.mx;
          if (x - r < mn[0]) mn[0] = x - r; if (x + r > mx[0]) mx[0] = x + r;
          if (y - r < mn[1]) mn[1] = y - r; if (y + r > mx[1]) mx[1] = y + r;
          if (z - r < mn[2]) mn[2] = z - r; if (z + r > mx[2]) mx[2] = z + r;
        }
        mesh.cells = [...buckets.values()];
        mesh.srcMatrices = matrices;
        mesh.srcColors = colors && colors.length ? colors : null;
      }
      return mesh;
    }
    function cullInstances(batch, planes) {
      if (!batch || !batch.cells) return batch ? batch.instances : 0;
      const src = batch.srcMatrices, dst = batch._instPacked;
      const sc = batch.srcColors;
      let n = 0;
      for (const c of batch.cells) {
        if (!_aabbInFrustum(planes, c.mn, c.mx)) continue;
        for (const i of c.idx) {
          dst.set(src.subarray(i * 16, i * 16 + 16), n * 20);
          if (sc) {
            dst[n * 20 + 16] = sc[i * 3]; dst[n * 20 + 17] = sc[i * 3 + 1]; dst[n * 20 + 18] = sc[i * 3 + 2];
          }
          n++;
        }
      }
      batch.visible = n;
      if (n && batch.instBuf && batch.instBuf !== identInstanceBuf) {
        device.queue.writeBuffer(batch.instBuf, 0, dst, 0, n * 20);
      }
      return n;
    }
    function drawInstanced(batch, opts) {
      if (!litPass || !batch || !batch.vbuf || !batch.instances) return;
      const n = batch.visible === undefined ? batch.instances : batch.visible;
      if (n <= 0) return;
      const slot = _drawSlot++;
      if (slot >= MAX_DRAWS) return;
      const o = Object.assign({}, opts || {}, { _instanced: true });
      _writeDraw(slot, IDENT, o);
      litPass.setPipeline(_litPipeline(o));
      litPass.setBindGroup(0, _activeFrameBG);
      _dynOff[0] = slot * DRAW_STRIDE;
      litPass.setBindGroup(1, drawBindGroup, _dynOff);
      litPass.setVertexBuffer(0, batch.vbuf);
      litPass.setVertexBuffer(1, batch.instBuf || identInstanceBuf);
      litPass.setIndexBuffer(batch.ibuf, batch.indexFormat);
      litPass.drawIndexed(batch.count, n);
    }
    function freeInstancedBatch(batch) {
      if (!batch) return;
      if (batch.instBuf && batch.instBuf !== identInstanceBuf) try { batch.instBuf.destroy(); } catch (_) { /* already destroyed */ }
      freeMesh(batch);
    }
    function castShadowInstanced(batch, model) {
      if (!shadowPass || !batch || !batch.vbuf) return;
      const n = batch.visible === undefined ? batch.instances : batch.visible;
      if (n <= 0) return;
      const zero = new Float32Array(16);
      if (_shadowSetModel(zero) < 0) return;
      shadowPass.setVertexBuffer(0, batch.vbuf);
      shadowPass.setVertexBuffer(1, batch.instBuf || identInstanceBuf);
      shadowPass.setIndexBuffer(batch.ibuf, batch.indexFormat);
      shadowPass.drawIndexed(batch.count, n);
    }

    function drawParticles(data, floatCount, additive) {
      if (!litPass || !pParticle || !data || !(floatCount > 0)) return;
      const nVert = (floatCount / 10) | 0;
      if (nVert <= 0) return;
      if (!_particleCap || _particleCap < floatCount) {
        if (particleVBO) try { particleVBO.destroy(); } catch (_) { /* grow replaces it */ }
        _particleCap = Math.max(floatCount, 2560);
        particleVBO = device.createBuffer({
          size: _particleCap * 4,
          usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
      }
      device.queue.writeBuffer(particleVBO, 0, data, 0, floatCount);
      const s = fxScratch;
      s.set(frameVPGpu, 0);
      const eye = frameEye || [0, 0, 0];
      s[16] = eye[0]; s[17] = eye[1]; s[18] = eye[2]; s[19] = additive ? 1 : 0;
      device.queue.writeBuffer(particleUBO, 0, s, 0, 20);
      const bg = device.createBindGroup({
        layout: pParticle.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: particleUBO } }],
      });
      litPass.setPipeline(pParticle);
      litPass.setBindGroup(0, bg);
      litPass.setVertexBuffer(0, particleVBO);
      litPass.draw(nVert);
    }

    // ── Phase-4 foreground FX (recorded INTO the open lit pass, matching how
    //    game.js interleaves them with draw()/drawSky() before present()). ──

    // Blob shadow + skid stamp share the unit quad + dynamic-offset uniform ring.
    // size = (w, l, p2, p3): BLOB -> (w,l, softInner 0.25, peakAlpha 0.45);
    // MARK -> (w,l, peakAlpha 0.38, 0).
    function _writeQuadFx(slot, model, w, l, p2, p3) {
      const s = fxScratch;
      s.set(frameVPGpu, 0);
      s.set(model && model.length >= 16 ? (model.subarray ? model.subarray(0, 16) : model) : IDENT, 16);
      s[32] = w; s[33] = l; s[34] = p2; s[35] = p3;
      device.queue.writeBuffer(quadFxUBO, slot * FX_STRIDE, s, 0, 36);
    }
    function _drawQuadStamp(pipeline, model, w, l, p2, p3) {
      if (!_fxReady || !litPass || !pipeline) return;
      const slot = _fxQuadSlot++;
      if (slot >= FX_QUAD_SLOTS) return;
      _writeQuadFx(slot, model, w, l, p2, p3);
      litPass.setPipeline(pipeline);
      litPass.setBindGroup(0, quadFxBG, [slot * FX_STRIDE]);
      litPass.setVertexBuffer(0, quadFxVBO);
      litPass.draw(6, 1, 0, 0);
    }
    function drawShadow(model, w, l) { _drawQuadStamp(pBlob, model, w, l, 0.25, 0.45); }
    function drawMark(model, w, l)   { _drawQuadStamp(pMark, model, w, l, 0.38, 0.0); }

    // Batched skid trail: game.js supplies interleaved pos3+uv2 (stride 20, GL
    // layout); the SKID shader wants stride 36 (pos3+uv2+rgba), so expand with a
    // black opaque colour (0,0,0,1) to reproduce the exact GL look, then upload.
    function drawSkidBatch(verts, vertCount, dirty) {
      if (!_fxReady || !litPass || !pSkid) return false;
      if (!(vertCount > 0)) return true;
      const floats9 = vertCount * 9;
      if (!_skidScratch || _skidScratch.length < floats9) _skidScratch = new Float32Array(floats9);
      const dst = _skidScratch;
      for (let v = 0; v < vertCount; v++) {
        const si = v * 5, di = v * 9;
        dst[di] = verts[si]; dst[di+1] = verts[si+1]; dst[di+2] = verts[si+2];
        dst[di+3] = verts[si+3]; dst[di+4] = verts[si+4];
        dst[di+5] = 0; dst[di+6] = 0; dst[di+7] = 0; dst[di+8] = 1;
      }
      const bytes = floats9 * 4;
      if (!skidVBO || _skidCap < bytes) {
        if (skidVBO) skidVBO.destroy();
        _skidCap = Math.max(bytes, 4096);
        skidVBO = device.createBuffer({ size: (_skidCap + 3) & ~3, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
        dirty = true;
      }
      if (dirty) device.queue.writeBuffer(skidVBO, 0, dst, 0, floats9);
      device.queue.writeBuffer(skidUBO, 0, frameVPGpu);
      litPass.setPipeline(pSkid);
      litPass.setBindGroup(0, skidFxBG);
      litPass.setVertexBuffer(0, skidVBO);
      litPass.draw(vertCount, 1, 0, 0);
      return true;
    }

    // Additive lamp-glare halos — CPU billboard build ported verbatim from GLX
    // Mirror GLX.drawGlow, emitting stride-36 (corner2, center3, color3,
    // radius1) verts, then one additive draw into the HDR scene target.
    function drawGlow(lights, str) {
      if (!_fxReady || !litPass || !pGlow || !lights || !lights.length || !(str > 0)) return;
      const nL = (lights.length / 15) | 0, floatsPerLamp = 6 * 9;
      if (!_glowScratch || _glowScratch.length < nL * floatsPerLamp) _glowScratch = new Float32Array(nL * floatsPerLamp);
      const gd = _glowScratch;
      const ex = frameEye ? frameEye[0] : 0, ey = frameEye ? frameEye[1] : 0, ez = frameEye ? frameEye[2] : 0;
      let p = 0, nDraw = 0;
      for (let i = 0; i < nL; i++) {
        const o = i * 15, glareW = lights[o + 14];
        if (!(glareW > 0)) continue;
        const cx = lights[o], cy = lights[o + 1], cz = lights[o + 2];
        const dxE = cx - ex, dyE = cy - ey, dzE = cz - ez, dEye = Math.sqrt(dxE*dxE + dyE*dyE + dzE*dzE);
        const fade = Math.min(1, Math.max(0, (170 - dEye) / 110));
        if (fade <= 0) continue;
        let r = lights[o + 3], g = lights[o + 4], b = lights[o + 5];
        const rad = lights[o + 6], cm = Math.max(r, g, b) || 1;
        const csc = Math.min(1, 3.2 / cm) * (0.5 + 0.5 * Math.min(1, cm / 40)) * fade * glareW;
        r *= csc; g *= csc; b *= csc;
        const brad = Math.min(2.2, rad * 0.10) * (0.7 + 0.6 * Math.min(glareW, 2));
        for (let v = 0; v < 6; v++) {
          const c = _glowCorners[v];
          gd[p++] = c[0]; gd[p++] = c[1]; gd[p++] = cx; gd[p++] = cy; gd[p++] = cz;
          gd[p++] = r; gd[p++] = g; gd[p++] = b; gd[p++] = brad;
        }
        nDraw++;
      }
      if (!nDraw) return;
      const bytes = p * 4;
      if (!glowVBO || _glowCap < bytes) {
        if (glowVBO) glowVBO.destroy();
        _glowCap = Math.max(bytes, 4096);
        glowVBO = device.createBuffer({ size: (_glowCap + 3) & ~3, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
      }
      device.queue.writeBuffer(glowVBO, 0, gd, 0, p);
      const gu = fxScratch;
      gu.set(frameVPGpu, 0);
      gu[16] = ex; gu[17] = ey; gu[18] = ez; gu[19] = str;
      device.queue.writeBuffer(glowUBO, 0, gu, 0, 20);
      litPass.setPipeline(pGlow);
      litPass.setBindGroup(0, glowFxBG);
      litPass.setVertexBuffer(0, glowVBO);
      litPass.draw(nDraw * 6, 1, 0, 0);
    }

    // Textured team/sponsor decal over the car body (createTexMesh + createTexture).
    // opts: { glow, uvRect:[u0,v0,uScale,vScale], tint:[r,g,b] }.
    function drawDecal(mesh, model, tex, opts) {
      if (!_fxReady || !litPass || !pDecal || !mesh || !mesh.vbuf || !tex || !tex.view) return;
      const slot = _fxDecalSlot++;
      if (slot >= FX_DECAL_SLOTS) return;
      const s = fxScratch, o = opts || {};
      s.set(model && model.length >= 16 ? (model.subarray ? model.subarray(0, 16) : model) : IDENT, 0);
      s.set(frameVPGpu, 16);
      const sd = frameSunDir || [0.3,0.6,0.5], sc = frameSunColor || [1,0.95,0.9];
      const asky = frameAmbSky || [0.3,0.32,0.36], agr = frameAmbGround || [0.2,0.19,0.18];
      s[32] = sd[0]; s[33] = sd[1]; s[34] = sd[2]; s[35] = 0;
      s[36] = sc[0]; s[37] = sc[1]; s[38] = sc[2]; s[39] = 0;
      s[40] = asky[0]; s[41] = asky[1]; s[42] = asky[2]; s[43] = 0;
      s[44] = agr[0];  s[45] = agr[1];  s[46] = agr[2];  s[47] = 0;
      const uvr = o.uvRect || null;
      s[48] = uvr ? uvr[0] : 0; s[49] = uvr ? uvr[1] : 0; s[50] = uvr ? uvr[2] : 1; s[51] = uvr ? uvr[3] : 1;
      const tint = o.tint || null;
      s[52] = tint ? tint[0] : 1; s[53] = tint ? tint[1] : 1; s[54] = tint ? tint[2] : 1;
      s[55] = o.glow || 0;
      device.queue.writeBuffer(decalUBO, slot * FX_STRIDE, s, 0, 56);
      let bg = tex._wgxDecalBG;
      if (!bg) {
        bg = device.createBindGroup({ layout: fxDecalLayout, entries: [
          { binding: 0, resource: { buffer: decalUBO, offset: 0, size: _Fx.DECAL_UNIFORM_BYTES } },
          { binding: 1, resource: tex.view },
          { binding: 2, resource: linearSampler },
        ] });
        tex._wgxDecalBG = bg;
      }
      litPass.setPipeline(pDecal);
      litPass.setBindGroup(0, bg, [slot * FX_STRIDE]);
      litPass.setVertexBuffer(0, mesh.vbuf);
      litPass.setIndexBuffer(mesh.ibuf, mesh.indexFormat);
      litPass.drawIndexed(mesh.count);
    }

    // ── Boot self-test ─────────────────────────────────────────────────────────
    // The failure this closes: WebGPU reports almost nothing by throwing. A WGSL
    // error, a mismatched bind-group layout or an unsupported target format all
    // produce a live-LOOKING device and an INVALID pipeline whose draws are
    // silently dropped — so create() would hand game.js a backend that renders a
    // black frame forever, with the RENDERER button insisting WEBGPU is fine.
    // GLX cannot do this (compile/link failures are synchronous and checked), so
    // it needs no equivalent.
    //
    // Returns null when the backend is proven able to render, or a REASON string
    // when it is proven unable. It never refuses merely because a check could not
    // be run: an API that is absent (the node test harness, an exotic
    // implementation) is skipped, because inability to check is not evidence of
    // breakage. The bias everywhere else is to REFUSE — a false refusal costs the
    // opt-in renderer, a false acceptance costs the player their game.
    async function _selfTest() {
      // 1) Shader compilation. Errors arrive as compilation MESSAGES, not throws.
      const mods = [["lit", litModule], ["sky", skyModule], ["blit", blitModule],
                    ["shadow", shadowModule]];
      for (let i = 0; i < mods.length; i++) {
        const name = mods[i][0], mod = mods[i][1];
        if (!mod || typeof mod.getCompilationInfo !== "function") continue;
        let info = null;
        try { info = await mod.getCompilationInfo(); } catch (_) { continue; }
        const msgs = (info && info.messages) || [];
        for (let j = 0; j < msgs.length; j++) {
          const m = msgs[j];
          if (m && m.type === "error") {
            return name + " shader compile error: " + ((m.message || "").slice(0, 200));
          }
        }
      }

      const scoped = typeof device.pushErrorScope === "function" &&
                     typeof device.popErrorScope === "function";

      // 2) Force the BASE lit pipeline. It is normally built lazily on the first
      //    draw() — i.e. long after create() could still refuse — so the one
      //    pipeline every single frame depends on would otherwise never be
      //    validated while refusing was still possible.
      if (scoped) device.pushErrorScope("validation");
      let litErr = null;
      try { _litPipeline({}); } catch (e) { litErr = (e && e.message) || String(e); }
      if (scoped) {
        const gpuErr = await device.popErrorScope();
        if (!litErr && gpuErr) litErr = (gpuErr.message || "invalid lit pipeline");
      }
      if (litErr) return "lit pipeline: " + String(litErr).slice(0, 200);

      // 3) RENDER AND READ BACK. Clear a 1×1 HDR source to white, run the real
      //    blit/tonemap pipeline over a small target, copy it to a mappable
      //    buffer and look at the pixel. This exercises shader + pipeline + bind
      //    group + sampler + rasteriser + fragment output on the actual device;
      //    a dropped draw leaves the pass's black clear behind and is caught.
      const canRead = typeof GPUMapMode !== "undefined" &&
        typeof Uint8Array !== "undefined" &&
        ((GPUTextureUsage && GPUTextureUsage.COPY_SRC) | 0) > 0 &&
        ((GPUBufferUsage && GPUBufferUsage.MAP_READ) | 0) > 0 &&
        typeof device.createCommandEncoder === "function" &&
        blitPipeline && typeof blitPipeline.getBindGroupLayout === "function";
      if (!canRead) return _bootError ? ("gpu error during init: " + _bootError) : null;

      let src = null, dst = null, buf = null, reason = null;
      if (scoped) device.pushErrorScope("validation");
      try {
        src = device.createTexture({
          size: [1, 1], format: SCENE_FORMAT,
          usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        });
        // 4×4 keeps copyTextureToBuffer's 256-byte row alignment trivially legal.
        dst = device.createTexture({
          size: [4, 4], format: format,
          usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
        });
        buf = device.createBuffer({ size: 256 * 4, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
        const enc = device.createCommandEncoder();
        if (typeof enc.copyTextureToBuffer !== "function" || typeof buf.mapAsync !== "function" ||
            typeof buf.getMappedRange !== "function") {
          throw { _skip: true };   // implementation without readback — cannot check
        }
        device.queue.writeBuffer(blitUBO, 0, new Float32Array([1, 0, 0, 0]));   // exposure = 1
        const bg = device.createBindGroup({
          layout: blitPipeline.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: src.createView() },
            { binding: 1, resource: linearSampler },
            { binding: 2, resource: { buffer: blitUBO } },
          ],
        });
        const p0 = enc.beginRenderPass({ colorAttachments: [{ view: src.createView(),
          clearValue: { r: 1, g: 1, b: 1, a: 1 }, loadOp: "clear", storeOp: "store" }] });
        p0.end();
        const p1 = enc.beginRenderPass({ colorAttachments: [{ view: dst.createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: "clear", storeOp: "store" }] });
        p1.setPipeline(blitPipeline);
        p1.setBindGroup(0, bg);
        p1.draw(3);
        p1.end();
        enc.copyTextureToBuffer({ texture: dst }, { buffer: buf, bytesPerRow: 256, rowsPerImage: 4 }, [4, 4, 1]);
        device.queue.submit([enc.finish()]);
        await buf.mapAsync(GPUMapMode.READ);
        const px = new Uint8Array(buf.getMappedRange().slice(0, 4));
        buf.unmap();
        // ACES(1,1,1) ≈ 0.81 → ~200/255 in every 8-bit swapchain format, and the
        // >8 threshold is channel-order agnostic (bgra8unorm vs rgba8unorm).
        if (!(px[0] > 8 || px[1] > 8 || px[2] > 8)) reason = "smoke test rendered black";
      } catch (e) {
        if (!(e && e._skip)) reason = "smoke test threw: " + (((e && e.message) || String(e)).slice(0, 200));
      }
      if (scoped) {
        const gpuErr = await device.popErrorScope();
        if (!reason && gpuErr) reason = "smoke test validation: " + String(gpuErr.message || "error").slice(0, 200);
      }
      try { if (src) src.destroy(); if (dst) dst.destroy(); if (buf) buf.destroy(); } catch (_) {}
      if (reason) return reason;
      // Anything the device reported asynchronously while we were booting.
      if (_bootError) return "gpu error during init: " + _bootError;
      return null;
    }

    // BUDGET. The self-test is AWAITED and game.js awaits Gfx.create(), so every
    // millisecond it spends is a millisecond of blocked boot on a blank screen.
    // Two of its steps carry no bound of their own: forcing the lit pipeline (a
    // real shader compile) and buf.mapAsync (resolves only when the submitted
    // work completes). Measured on Chromium's bundled SwiftShader (CPU Vulkan),
    // those cost 9-56 s ON TOP of the 3-9 s create() already spends there.
    //
    // Two guards, because they catch different stalls:
    //   • the setTimeout arm ends an ASYNC stall (a mapAsync that never
    //     resolves) without waiting for it;
    //   • the ELAPSED check is what makes the outcome deterministic, because a
    //     timer cannot fire while a SYNCHRONOUS createRenderPipeline is blocking
    //     the main thread — without it the same machine accepts or refuses
    //     depending on load, which is the worst possible property for a
    //     renderer-selection decision.
    // Overrunning REFUSES rather than proceeds. A device that cannot compile one
    // pipeline and blit 16 pixels inside the budget will not hold a frame rate
    // either (the measured SwiftShader case goes on to lose the device outright,
    // see the device.lost handler above). The cost of a false refusal is the
    // opt-in backend — the game still runs, on GLX; the cost of a false
    // acceptance is the player's game. Abandoned promises settle harmlessly:
    // nothing else reads their result.
    const SELFTEST_BUDGET_MS = 8000;
    let _stTimer = null;
    const _stT0 = Date.now();
    let _stReason = await Promise.race([
      _selfTest().catch(function (e) {
        return "self-test threw: " + (((e && e.message) || String(e)).slice(0, 200));
      }),
      new Promise(function (res) {
        _stTimer = setTimeout(function () { res("self-test stalled past " + SELFTEST_BUDGET_MS + " ms"); },
                              SELFTEST_BUDGET_MS);
      }),
    ]);
    try { if (_stTimer !== null) clearTimeout(_stTimer); } catch (_) {}
    const _stMs = Date.now() - _stT0;
    if (!_stReason && _stMs > SELFTEST_BUDGET_MS) {
      _stReason = "self-test took " + _stMs + " ms (budget " + SELFTEST_BUDGET_MS + " ms)";
    }
    if (_stReason) {
      try { if (typeof device.destroy === "function") device.destroy(); } catch (_) {}
      return _fail(_stReason);
    }

    const noop = function () {};

    return {
      // ── Lifecycle / capability ──
      init() { return true; },
      resize,
      setRenderScale,
      getRenderScale() { return renderScale; },
      get width() { return width; },
      get height() { return height; },
      get aspect() { return aspect; },
      hdrMode: () => true,           // Phase 2: RGBA16F scene target + Phase 4 post chain
      msaa: () => _msaaCount,
      pcss: () => true,              // Poisson-8 + far 4-tap + blocker search (GLX parity)
      isMobile: IS_MOBILE,
      mobileTier: MOBILE_TIER,

      // ── Resources (Phase 2) ──
      createMesh,
      createTexMesh,                 // Phase 4 (textured decals)
      createChunkedMesh,
      createTexture,                 // Phase 4
      freeMesh,
      freeChunkedMesh,
      freeTexture,

      // ── Frame ──
      begin,
      present,
      draw,
      drawChunked,
      drawSky,
      drawShadow,                    // Phase 4 (blob shadow quad, in lit pass)
      drawMark,                      // Phase 4 (single skid-mark stamp)
      drawSkidBatch,                 // Phase 4 (batched skid trail, one draw)
      drawGlow,                      // Phase 4 (additive lamp-glare billboards, HDR)
      drawDecal,                     // Phase 4 (team/sponsor decal atlas)

      // ── Shadow pass (Phase 3) ──
      shadowBegin,
      castShadow,
      castShadowChunked,
      shadowEnd,
      carShadowBegin,
      carShadowEnd,

      // ── Env probe (Phase 4b) ──
      envFaceBegin,
      envFaceEnd,
      envProbeReady() { return _envProbeLive; },
      envProbeReset,

      // ── Cull-test helpers (GLX parity) ──
      // The agent world view calls GLX.makeFrustumPlanes/aabbInFrustum directly
      // so its "what is on screen" answer runs the SAME test the draw path runs.
      // These are the identical Gribb–Hartmann helpers already used above by
      // drawChunked, exported in GLX's shape (six fresh Float32Array(4) planes,
      // inside = a*x+b*y+c*z+d >= 0) — GLX allocates a fresh set for exactly
      // this caller rather than sharing the per-frame scratch, so do the same.
      makeFrustumPlanes(viewProj) {
        const p = [new Float32Array(4), new Float32Array(4), new Float32Array(4),
                   new Float32Array(4), new Float32Array(4), new Float32Array(4)];
        _extractPlanes(viewProj, p);
        return p;
      },
      aabbInFrustum: _aabbInFrustum,
      aabbDist2: _aabbDist2,

      // ── NOT IMPLEMENTED — declared, and declared ABSENT ────────────────────
      // These are the GLX methods WGX has no counterpart for. They are listed
      // here as explicit `undefined` because of HOW this backend is installed:
      // game.js does
      //     Object.defineProperties(GLX, Object.getOwnPropertyDescriptors(backend))
      // so every name the backend does NOT define keeps GLX's own function —
      // and GLX's functions run against `gl`/`SHD`/`CHK`, which stay null when
      // GLX.init() was never called. A caller's feature test
      // (`if (gfx.lampShadowBegin)`) then PASSES and the call dies inside GLX.
      // js/game.js is the live example: its comment says "WGX has no
      // lampShadowBegin", but before this list it inherited one, and every night
      // frame threw inside SHD (null) — aborting tickBody before present().
      // A descriptor whose value is undefined overwrites the inherited one, so
      // the feature test tells the truth again. Restoring any of these means
      // implementing it here and deleting the line.
      drawParticles,
      lampShadowBegin,
      lampShadowEnd,
      createTextureArray,
      setMaterialMaps,
      materialMapState,
      gpuTimer,
      gpuMs,
      createInstancedBatch,
      cullInstances,
      drawInstanced,
      freeInstancedBatch,
      castShadowInstanced,
      // Car shadows key on the DEVICE (IS_MOBILE), matching GLX — GRAPHICS: HIGH
      // must not buy a per-frame extra map on a phone.
      carShadowState: () => ({ enabled: !!carShadowView && !IS_MOBILE, arms: _carArms }),
      lampShadowState: () => ({ enabled: !!lampShadowView && !MOBILE_TIER, arms: _lampArms, idx: _lampIdx }),

      // extension: lets a future __apex.gfxBackend() report the active path.
      backend: "webgpu",
    };
  }

  // lastFailure(): why the most recent create() returned null ({reason, at}), or
  // null if it never refused. The RENDERER control reports the STORED preference,
  // not the live backend, so this is currently the only way to tell "WebGPU is
  // selected" from "WebGPU is running".
  // gpuErrors(): how many uncaptured GPU errors the live device has raised. Zero
  // is the only healthy value; a nonzero count on a backend that "initialised
  // fine" is the answer to "why is the screen black / wrong on my phone".
  return { create, lastFailure: () => _lastFailure, gpuErrors: () => _gpuErrors };
})();

// No-build global export.
if (typeof window !== "undefined") window.WGX = WGX;
