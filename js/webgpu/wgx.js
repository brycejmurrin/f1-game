/*
 * Apex 26 — WebGPU renderer backend (WGX). Migration Phase 2 + 3 + 4
 * (post chain + foreground FX).
 *
 * A second implementer of the GLX draw-API contract (the renderer object
 * returned by the GLX IIFE). See docs/WEBGPU-MIGRATION.md,
 * docs/WEBGPU-PHASE0-NOTES.md, docs/WEBGPU-PHASE2-NOTES.md and js/gfx.js for the
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
 *   - present() now runs the WGSLPost chain (js/webgpu/wgsl-post.js) in its
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
 *   - FX (js/webgpu/wgsl-fx.js): drawShadow/drawMark (blob + skid stamps),
 *     drawSkidBatch (batched trail), drawGlow (additive HDR halos), drawDecal
 *     (textured atlas) — all recorded INTO the open lit pass so they interleave
 *     with draw()/drawSky() exactly as game.js expects. createTexMesh/createTexture
 *     are real (GPUTexture upload) so decals have an atlas.
 *
 * WHAT IS STILL STUBBED/REDUCED (tagged inline):
 *   - MSAA: msaa() stays 1 (a multisampled scene + resolve needs a sampleable
 *     single-sample depth for SSAO — depth resolve is not in core WebGPU; see
 *     docs/WEBGPU-PHASE4-NOTES.md).
 *   - Env probe: FULLY WIRED (envFaceBegin/End render a real RGBA16F cube one face/
 *     frame; Block 7 samples it once a 6-face cycle completes). Default reflection is
 *     still the cheap ANALYTIC sky gradient (carReflect); the real cube only kicks in
 *     when the CAR ENV REFLECTION tuner (carEnvCube) is turned up. No mip chain — the
 *     probe is sampled at LOD 0 (WebGPU has no generateMipmap; the paint is glossy).
 *   - Instancing (Phase 5) needs game.js to supply instance data (out of scope).
 *
 * NO build step, no ES modules: "use strict" IIFE assigning one global `WGX`.
 * WGSL lives as inline template strings (js/webgpu/wgsl-chunks.js).
 *
 * Feature-detected & inert: WGX.create() returns null on any failure so the
 * caller falls back to GLX. Constructing on a supported browser never throws.
 */
"use strict";

const WGX = (function () {
  // Mirror GLX's mobile-tier detection (IS_MOBILE/MOBILE_TIER).
  const IS_MOBILE = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.userAgent));
  let _gfxHigh = false;
  try { _gfxHigh = localStorage.getItem("apex26.gfxHigh") === "1"; } catch (_) {}
  const MOBILE_TIER = IS_MOBILE && !_gfxHigh;

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

  // ── uniform sizes / layout (must match WGSLChunks.LIT struct comments) ──
  const FRAME_BYTES = WGSLChunks.FRAME_UNIFORM_BYTES;   // 384
  const FRAME_FLOATS = FRAME_BYTES / 4;                 // 96
  const LIGHT_STRIDE = WGSLChunks.LIGHT_STRIDE_BYTES;   // 64
  const MAX_LIGHTS = WGSLChunks.MAX_LIGHTS;             // 32
  const LIGHT_BYTES = LIGHT_STRIDE * MAX_LIGHTS;        // 2048
  const LIGHT_FLOATS = LIGHT_BYTES / 4;                 // 512
  const DRAW_USED_BYTES = WGSLChunks.DRAW_UNIFORM_BYTES; // 112
  const DRAW_FLOATS = DRAW_USED_BYTES / 4;              // 28
  // Dynamic uniform-buffer offsets must be a multiple of
  // minUniformBufferOffsetAlignment (<=256 on all adapters); 256 is always a
  // valid multiple, so we stride slots at 256 B.
  const DRAW_STRIDE = 256;
  const MAX_DRAWS = 4096;                               // per-frame draw slots
  const BLIT_BYTES = WGSLChunks.BLIT_UNIFORM_BYTES;     // 16

  // ── shadow map (Phase 3) ──
  const SHADOW_SIZE = MOBILE_TIER ? 1024 : 2048;        // sun depth-map resolution
  const SHADOW_SLOTS = 16;                              // caster draws per shadow pass
  const SHADOW_MODEL_STRIDE = 256;                      // dynamic-offset alignment

  // ── vertex layout: interleaved [pos3, nrm3, col3, mat1], stride 40 ──
  // NB: unlike GLX (which keeps mat-less meshes at stride 36), WGX ALWAYS stores
  // the 10th float (mat, default 0) so a single pipeline vertex layout serves
  // every mesh — the shader declares @location(3) unconditionally.
  const VERTEX_LAYOUT = {
    arrayStride: 40,
    attributes: [
      { shaderLocation: 0, offset: 0,  format: "float32x3" },
      { shaderLocation: 1, offset: 12, format: "float32x3" },
      { shaderLocation: 2, offset: 24, format: "float32x3" },
      { shaderLocation: 3, offset: 36, format: "float32" },
    ],
  };
  // Shadow pass consumes only position (location 0) from the same interleaved VBO.
  const SHADOW_VERTEX_LAYOUT = {
    arrayStride: 40,
    attributes: [{ shaderLocation: 0, offset: 0, format: "float32x3" }],
  };

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

    let adapter, device, ctx, format;
    try {
      adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
      if (!adapter) return null;
      device = await adapter.requestDevice();
      if (!device) return null;
    } catch (_) {
      return null;
    }

    try {
      ctx = canvas.getContext("webgpu");
      if (!ctx) return null;
      format = navigator.gpu.getPreferredCanvasFormat();
      ctx.configure({ device, format, alphaMode: "opaque" });
    } catch (_) {
      return null;
    }

    // Device-lost recovery. An unexpected loss (memory pressure, GPU reset) on
    // this opt-in/experimental path FALLS BACK to WebGL2 rather than reloading
    // straight back into WebGPU — otherwise a device that loses under the race
    // load would reload → lose → reload in a loop. Clearing the opt-in flag makes
    // the reload boot the stable WebGL2 backend; the user can re-enable via the
    // RENDERER toggle. ("destroyed" is our own teardown — ignore it.)
    let _lost = false;
    device.lost.then(function (info) {
      if (info && info.reason === "destroyed") return;
      _lost = true;
      try { localStorage.setItem("apex26.gfxBackend", "webgl2"); } catch (_) {}
      try { location.reload(); } catch (_) {}
    });

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
    let _envReady = true, _ssrReady = false;  // env reflection is analytic-sky (no probe needed); SSR flips true once its pass runs
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

    // Blocker map objects.
    let blockerTex = null, blockerView = null, blockerSampler = null;
    let blockerUBO = null, blockerBG = null, blockerPipeline = null, blockerG0Layout = null;

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
        ldrTex = null, ldrView = null, ssrTex = null;
    let bloomLv = [];                 // [{tex, view, w, h}]
    let bloomDownUBO = [], bloomUpUBO = [], bloomDownBG = [], bloomUpBG = [];
    let ssaoUBO, godrayUBO, compositeUBO, fxaaUBO, ssrUBO;
    let ssaoBG = null, godrayBG = null, compositeBG = null, fxaaBG = null, ssrBG = null;
    let pBloomDown, pBloomUp, pSSAO, pGodray, pComposite, pFXAA, pointSampler, pSSR;
    // Per-pass CPU scratch for uniform writes (largest block is SSAO, 176 B/44 f).
    const postScratch = new Float32Array(64);

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
            texture: { sampleType: "float" } },                          // blocker map
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
        vertex: { module: shadowModule, entryPoint: "vs_main", buffers: [SHADOW_VERTEX_LAYOUT] },
        // No fragment stage — depth-only. Slope-scaled bias fights shadow acne.
        // GLX renders the shadow depth with CULLING OFF ("render back faces to avoid
        // peter-panning", glx.js:3739), so match that with cullMode:"none" — winding is
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
    } catch (err) {
      console.error("WGX init failed:", err);
      return null;   // any pipeline/buffer build failure -> fall back to GLX
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
        pGodray    = fsPipe(_Post.GODRAY,     SCENE_FORMAT, null);
        pComposite = fsPipe(_Post.COMPOSITE, LDR_FORMAT,    null);
        pFXAA      = fsPipe(_Post.FXAA,       format,        null);
        ssaoUBO      = device.createBuffer({ size: _Post.SSAO_UNIFORM_BYTES,      usage: _UCD });
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
        });
        decalUBO = device.createBuffer({ size: FX_DECAL_SLOTS * FX_STRIDE, usage: _UCD });
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
      const key = (blend ? 1 : 0) | (dbl ? 2 : 0) | (noAW ? 4 : 0);
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
        vertex: { module: litModule, entryPoint: "vs_main", buffers: [VERTEX_LAYOUT] },
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
      const textures = [t.sceneTex, t.depthTex, t.ssaoTex, t.godrayTex, t.ldrTex, t.ssrTex];
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
          next.godrayTex = device.createTexture({ size: [halfW, halfH], format: SCENE_FORMAT,
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
          next.ldrTex = device.createTexture({ size: [width, height], format: LDR_FORMAT,
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
          next.ssaoView = next.ssaoTex.createView();
          next.godrayView = next.godrayTex.createView();
          next.ldrView = next.ldrTex.createView();
          next.ssrTex = device.createTexture({ size: [width, height], format: SCENE_FORMAT,
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
          next.ssrView = next.ssrTex.createView();

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
          next.godrayBG = device.createBindGroup({
            layout: pGodray.getBindGroupLayout(0),
            entries: [
              { binding: 0, resource: next.sceneView },
              { binding: 1, resource: linearSampler },
              { binding: 2, resource: { buffer: godrayUBO } },
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
          if (pSSR) {
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
          next.frameGroups = _makeFrameBGs(next.ssrView);
          next.postReady = true;
        }
      } catch (_) {
        _destroyTargetSet(next);
        _targetRetryW = width; _targetRetryH = height;
        _targetRetryAt = Date.now() + 1000;
        return;
      }

      const old = { sceneTex, depthTex, ssaoTex, godrayTex, ldrTex, ssrTex,
        bloomLv, bloomDownUBO, bloomUpUBO };
      sceneTex = next.sceneTex; depthTex = next.depthTex;
      sceneView = next.sceneView; depthView = next.depthView;
      depthSampleView = next.depthSampleView; blitBindGroup = next.blitBindGroup;
      ssaoTex = next.ssaoTex || null; godrayTex = next.godrayTex || null;
      ldrTex = next.ldrTex || null; ssrTex = next.ssrTex || null;
      ssaoView = next.ssaoView || null; godrayView = next.godrayView || null;
      ldrView = next.ldrView || null; ssrView = next.ssrView || ssrView;
      bloomLv = next.bloomLv; bloomDownUBO = next.bloomDownUBO;
      bloomUpUBO = next.bloomUpUBO; bloomDownBG = next.bloomDownBG;
      bloomUpBG = next.bloomUpBG; ssaoBG = next.ssaoBG || null;
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
      const inter = new Float32Array(vCount * 10);
      for (let i = 0; i < vCount; i++) {
        const o = i * 10;
        inter[o]   = pos[i*3];   inter[o+1] = pos[i*3+1]; inter[o+2] = pos[i*3+2];
        inter[o+3] = nrm[i*3];   inter[o+4] = nrm[i*3+1]; inter[o+5] = nrm[i*3+2];
        inter[o+6] = col[i*3];   inter[o+7] = col[i*3+1]; inter[o+8] = col[i*3+2];
        inter[o+9] = mat ? mat[i] : 0;
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
    // index buffer, matching the DECAL shader vertex layout (js/webgpu/wgsl-fx.js).
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
    // 2D texture (decal atlas, Phase 4): upload an ImageBitmap/canvas/ImageData
    // (via copyExternalImageToTexture, flipY to match GLX's UNPACK_FLIP_Y) or raw
    // RGBA bytes (via writeTexture). Returns { texture, view } or an inert token.
    function createTexture(src) {
      try {
        const w = src ? (src.width | 0) : 0, h = src ? (src.height | 0) : 0;
        if (!w || !h) return { _wgx: "texture", _phase: 4 };
        const tex = device.createTexture({
          size: [w, h], format: "rgba8unorm",
          usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
        });
        if (src instanceof Uint8Array || src instanceof Uint8ClampedArray) {
          device.queue.writeTexture({ texture: tex }, src, { bytesPerRow: w * 4, rowsPerImage: h }, [w, h]);
        } else {
          device.queue.copyExternalImageToTexture({ source: src, flipY: true }, { texture: tex }, [w, h]);
        }
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

      // TAA Halton Jitter Scaffolding
      const halton = [
        [0.5, 1/3],
        [0.25, 2/3],
        [0.75, 1/9],
        [0.125, 4/9],
        [0.625, 7/9],
        [0.375, 2/9],
        [0.875, 5/9],
        [0.0625, 8/9]
      ];
      _taaFrameIndex = (_taaFrameIndex + 1) % 8;
      const sample = halton[_taaFrameIndex];
      const jitterX = (sample[0] - 0.5) * 2.0 / width;
      const jitterY = (sample[1] - 0.5) * 2.0 / height;

      _vpGpu[8] += jitterX;
      _vpGpu[9] += jitterY;

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
      // params2 (floats 72..75): shadowOn, strength, texel, _. Sun below the
      // horizon (sunDir.y < -0.05) forces shadows off so a stale daytime depth
      // map can't leak shadows into a night scene.
      const sunUp = !sd || sd[1] > -0.05;
      d[72] = (_shadowRendered && sunUp) ? 1 : 0;
      // SHADOW STRENGTH knob × KEY-luminance fade (GLX parity, js/glx.js lit
      // begin): the night moon-key is deliberately held HIGH (sunDir.y ≈ 0.97
      // drives the sky glow), so the binary sunUp gate above never fires at
      // night — without this fade WebGPU kept full-strength terrain/road sun
      // shadows under moonlight, and prop shadows POPPED when the day↔night
      // key crossed the game.js cast gate (max(sunColor) > 0.35) instead of
      // fading through dusk in lockstep with it.
      const _kl = f.sunColor ? Math.max(f.sunColor[0], f.sunColor[1], f.sunColor[2]) : 1;
      let _hf = (_kl - 0.28) / 0.14;
      _hf = _hf < 0 ? 0 : _hf > 1 ? 1 : _hf;
      _hf = _hf * _hf * (3 - 2 * _hf);
      d[73] = ((T && T.shadowStr != null) ? T.shadowStr : 1.0) * _hf;
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
      // carReflect/ssrStrength are forced 0 until the env-probe / SSR passes bind
      // real resources (the frame group holds 1×1 placeholders for now).
      // pcssPen is a GLX PENUMBRA-RATE knob (default 80, range 10-300) that GLX
      // feeds into `clamp((z-zb)*pcssPen,0,1)` → a 1.5-6 texel radius. The WGSL
      // shadow shader instead uses it DIRECTLY as `pcfStep = texel*(1+params4.x)`,
      // which was authored around ~0.3 (see the 0.30 fallback). Feeding the raw 80
      // gave an ~81-texel (~10 m) box-blur that smeared every WebGPU shadow to a
      // wash. Remap to the shader's units so pcssPen=80 → the intended ~0.30 step
      // (≈1.3 texels), scaling with the knob and capped so it can't blow out again.
      d[80] = Math.min(2.0, ((T && T.pcssPen != null) ? T.pcssPen : 80) * 0.00375);
      d[81] = (T && T.shadowTintAmt != null) ? T.shadowTintAmt : 0.0;
      d[82] = _envReady ? ((T && T.carReflect != null) ? T.carReflect : 0.0) : 0.0;
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
      d[87] = jitterX; // Store jitterX, wait, no, jitterY is needed too. 
      // Since jitterY can't fit in d[87], let's pack both in d[87]? Wait, no. I'll put jitterY in d[93].
      // shadowCtr (floats 88..91): xyz = the UNSNAPPED forward-biased ground anchor
      // the shadow box is snapped around (game.js shadow pass; glides with the
      // camera so the LIT distance fade never jumps on a box recentre), w =
      // shadowRange (SHADOW DISTANCE knob, box half-size in m — same 64 fallback
      // as GLX uShadowRange).
      const sctr = f.shadowCtr || f.eye || [0, 0, 0];
      d[88] = sctr[0]; d[89] = sctr[1]; d[90] = sctr[2];
      d[91] = (T && T.shadowRange != null) ? T.shadowRange : 64.0;
      // params6 (floats 92..95): wet-surface darkening parity with GLX.
      d[92] = (T && T.wetDark != null) ? T.wetDark : 1.0;
      d[93] = jitterY; d[94] = 0; d[95] = 0;
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
      litPass = encoder.beginRenderPass({
        colorAttachments: [{
          view: sceneView,
          clearValue: { r: fc[0], g: fc[1], b: fc[2], a: 1 },
          loadOp: "clear", storeOp: "store",
        }],
        depthStencilAttachment: {
          view: depthView, depthClearValue: 1.0, depthLoadOp: "clear", depthStoreOp: "store",
        },
      });
      return true;
    }

    function drawSky(sky) {
      if (!litPass) return;
      _writeSky(sky || lastFrame || {});
      litPass.setPipeline(skyPipeline);
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
      d[25] = 0; d[26] = 0; d[27] = 0;
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

    // ── Live env-cube probe ────────────────────────────────────────────────────
    // GLX parity (js/glx.js envFaceBegin/End): capture ONE cube face of the world
    // around the player car per frame into a real RGBA16F cube; after a full 6-face
    // cycle the LIT car-paint block samples it (Block 7, envProbeStr). game.js re-issues
    // the world draws (drawSky + track meshes, NO cars) between begin/end — they record
    // into the face's own pass via litPass, so every lighting uniform matches the frame.
    function envInit() {
      if (envCubeTex) return;
      envCubeTex = device.createTexture({
        size: [ENV_SIZE, ENV_SIZE, 6], dimension: "2d", format: SCENE_FORMAT,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      });
      envSampleView = envCubeTex.createView({ dimension: "cube" });
      envFaceViews = [];
      for (let f = 0; f < 6; f++)
        envFaceViews.push(envCubeTex.createView({ dimension: "2d", baseArrayLayer: f, arrayLayerCount: 1 }));
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
      if (_lost || !encoder) return;
      if (litPass) { litPass.end(); litPass = null; }
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
      const haveAO = frameHaveProj && ssaoBG && aoStr > 0;
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
      } else {
        _clearTarget(ssaoView, 1, 1, 1);
      }

      // ── 1) GODRAY (half-res) — screen-space radial shafts toward the sun,
      //    reading the scene HDR as the bright source; else clear to black.
      const grStr = o.godray != null ? o.godray : 0;
      const haveGR = godrayBG && grStr > 0 && sun && sun.onScreen && sun.shaft > 0;
      if (haveGR) {
        const s = postScratch;
        s[0] = sunUVx; s[1] = sunUVy; s[2] = grStr; s[3] = 1.1;   // radialScale
        const sc = frameSunColor || [1, 0.95, 0.85];
        s[4] = sc[0]; s[5] = sc[1]; s[6] = sc[2]; s[7] = 0.85;    // per-step decay
        device.queue.writeBuffer(godrayUBO, 0, s, 0, _Post.GODRAY_UNIFORM_BYTES / 4);
        const p = encoder.beginRenderPass({ colorAttachments: [{ view: godrayView, loadOp: "clear",
          clearValue: { r: 0, g: 0, b: 0, a: 1 }, storeOp: "store" }] });
        p.setPipeline(pGodray); p.setBindGroup(0, godrayBG); p.draw(3, 1, 0, 0); p.end();
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
        s[0] = exposure; s[1] = bloomNorm; s[2] = haveGR ? 1.0 : 0.0; s[3] = flareStr;   // p0
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
        // tuneFx (off 128): vignette reach; remaining lanes reserved/aligned.
        s[32] = (T && T.vignetteSoft != null) ? T.vignetteSoft : 0.35;
        s[33] = 0; s[34] = 0; s[35] = 0;
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

      device.queue.submit([encoder.finish()]);
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
      msaa: () => 1,                 // Phase 4: still 1 — needs sampleable single-sample
                                     //   depth for SSAO (depth resolve absent in core WebGPU)
      pcss: () => true,              // Phase 3: comparison-sampler 3×3 PCF sun shadows
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

      // ── Env probe (Phase 4b) ──
      envFaceBegin,
      envFaceEnd,
      envProbeReady() { return _envProbeLive; },
      envProbeReset,

      // extension: lets a future __apex.gfxBackend() report the active path.
      backend: "webgpu",
    };
  }

  return { create };
})();

// No-build global export.
if (typeof window !== "undefined") window.WGX = WGX;
