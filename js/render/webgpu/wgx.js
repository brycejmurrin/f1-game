/*
 * Apex 26 — WebGPU renderer backend (WGX). Second GLX draw-API implementer;
 * opt-in via apex26.gfxBackend=webgpu. WGSL in js/render/webgpu/wgsl-*.js.
 * create() returns null on any failure → GLX fallback. Boot self-test at end
 * of create(). Full parity matrix, traps, soft-present: docs/research/WEBGPU-PARITY.md.
 *
 * NO build step: "use strict" IIFE assigning global WGX.
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
  // Safari Mac is NOT IS_MOBILE. Its WebGPU still sheds the device on the
  // first full-size frame if we take the desktop stack (high-performance +
  // timestamp-query + MSAA 4× rgba16float + 2048 shadows). Same sniff as TLX.
  const _ua = (typeof navigator !== "undefined" && navigator.userAgent) || "";
  const IS_WEBKIT = /CriOS|FxiOS|EdgiOS/.test(_ua) ||
    (/Safari\//.test(_ua) && !/Chrome\/|Chromium\/|Edg\//.test(_ua));
  // Loss-escalation ladder, persisted per origin. One device.lost = one rung
  // up + one reload, so every retry is genuinely CHEAPER than the config that
  // just died — never the identical crash again:
  //   rung 0  full    — desktop stack (MSAA 4, timestamp, 2048 shadows, SSR)
  //   rung 1  lite    — phone-parity (MSAA 1, 1024 shadows, no SSR/timestamp)
  //   rung 2  minimal — lite + NO post chain (tonemap blit), no env probe,
  //                     DPR capped at 1 (scene+depth+swapchain only)
  // A loss ON rung 2 is the exit: session-skip this tab to GLX, keep the pick.
  // An explicit RENDERER re-pick clears the ladder (js/game/gfx-quality.js).
  let _wgxLevel = 0;
  try {
    _wgxLevel = parseInt(localStorage.getItem("apex26.gfxWgxLevel") || "0", 10) || 0;
    // Back-compat: the pre-ladder single flag mapped to rung 1.
    if (!_wgxLevel && localStorage.getItem("apex26.gfxWgxLite") === "1") _wgxLevel = 1;
  } catch (_) { /* blocked storage: sniff-only lite */ }
  const _litePref = _wgxLevel >= 1;
  // Slim stack: every phone, every WebKit, or a previous device.lost on this
  // origin. GRAPHICS: ULTRA must not 4× MSAA a phone WebGPU device — that is
  // the "worked for a second then crashed" path.
  const WGX_LITE = !!(IS_MOBILE || IS_WEBKIT || _litePref);
  // Minimal only ever comes from the ladder (a LITE device that still lost
  // its device) — never from sniffing alone. WebKit/phones start at rung 1.
  const WGX_MINIMAL = _wgxLevel >= 2;
  // The ladder HEALS: one transient loss must not degrade every future
  // session forever. Each boot that presents a real frame counts one clean
  // session (apex26.gfxWgxOk); a streak of HEAL_SESSIONS steps the rung down
  // one. Any loss or strike-cap zeroes the streak, so an actually-fragile
  // device pays one probe crash per ~HEAL_SESSIONS sessions, not per boot.
  const HEAL_SESSIONS = 5;
  function _healTick() {
    if (_wgxLevel <= 0) return;
    try {
      const n = (parseInt(localStorage.getItem("apex26.gfxWgxOk") || "0", 10) || 0) + 1;
      if (n >= HEAL_SESSIONS) {
        localStorage.setItem("apex26.gfxWgxLevel", String(_wgxLevel - 1));
        if (_wgxLevel - 1 < 1) localStorage.removeItem("apex26.gfxWgxLite");
        localStorage.setItem("apex26.gfxWgxOk", "0");
      } else {
        localStorage.setItem("apex26.gfxWgxOk", String(n));
      }
    } catch (_) { /* blocked storage: the rung just stays */ }
  }
  function _healReset() {
    try { localStorage.setItem("apex26.gfxWgxOk", "0"); } catch (_) { /* blocked storage */ }
  }

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

  // Post shader/FX registries (separate files; may be absent when the
  // backend is loaded standalone — post/FX then stay disabled and the frame
  // falls back to the tonemap blit rather than failing WGX.create()).
  const _Post = (typeof window !== "undefined" && window.WGSLPost) || null;
  const _Fx   = (typeof window !== "undefined" && window.WGSLFx)   || null;

  const SCENE_FORMAT = "rgba16float";   // HDR scene (core-renderable/blendable)
  const DEPTH_FORMAT = "depth24plus";
  const LDR_FORMAT   = "rgba8unorm";    // COMPOSITE output (FXAA reads it)
  const SSAO_FORMAT  = "r8unorm";       // AO half-res (composite samples .r; GLX r8)
  // bloom/godray (GLX R11F_G11F_B10F). NOT a const, and not renderable by
  // default: rg11b10ufloat carries TEXTURE_BINDING and the copy usages in core
  // WebGPU, but RENDER_ATTACHMENT only arrives with the OPTIONAL
  // "rg11b10ufloat-renderable" feature. Allocating a target in it without asking
  // for the feature is a validation error per target — measured on a live device
  // as "Color format (TextureFormat::RG11B10Ufloat) is not color renderable",
  // twice, then "WGX unavailable" and a silent fall back to GLX. create()
  // negotiates the feature and downgrades this to SCENE_FORMAT when the device
  // withholds it: 8 B/px instead of 4 on two half-res targets and the bloom
  // chain, which is the cost of having a post chain at all.
  let POST_HDR_FORMAT = "rg11b10ufloat";
  const BLOOM_MAX_LEVELS = 5;           // GLX bloom mip-chain depth cap

  // Resolved defensively, because this file used to dereference WGSLChunks at
  // IIFE-EVAL time: a missing/failed wgsl-chunks.js threw HERE, which left the
  // `const WGX` binding permanently in its temporal dead zone — and a TDZ
  // binding makes even `typeof WGX` THROW in gfx.js rather than report
  // "undefined". That only stayed survivable because Gfx.create() wraps
  // everything in try/catch. A missing dependency is exactly the failure that
  // hit vendor/ in production, so it must degrade the documented way instead:
  // WGX still exists, and WGX.create() returns null so the caller uses GLX.
  const _Chunks = (function () {
    try { if (typeof WGSLChunks !== "undefined" && WGSLChunks) return WGSLChunks; } catch (_) { /* TDZ / missing global: fall through to window, then null */ }
    try { if (typeof window !== "undefined" && window.WGSLChunks) return window.WGSLChunks; } catch (_) { /* no window (node harness): create() refuses via _Chunks null */ }
    return null;
  })();
  const _CH = _Chunks || {};   // sizes below fall back to 0 when absent; create() refuses first

  const FRAME_BYTES = _CH.FRAME_UNIFORM_BYTES | 0;      // 576
  const FRAME_FLOATS = FRAME_BYTES / 4;                 // 144
  const LIGHT_STRIDE = _CH.LIGHT_STRIDE_BYTES | 0;      // 64
  const MAX_LIGHTS = _CH.MAX_LIGHTS | 0;                // 48
  const LIGHT_BYTES = LIGHT_STRIDE * MAX_LIGHTS;        // 3072
  const LIGHT_FLOATS = LIGHT_BYTES / 4;                 // 768
  const DRAW_USED_BYTES = _CH.DRAW_UNIFORM_BYTES | 0;   // 144
  // DOCTRINE (F7, deferred): DRAW_USED_BYTES is what the DrawU struct actually
  // USES (144 B = 36 floats); DRAW_F32_STRIDE below is what a ring slot COSTS
  // (256 B = 64 floats), because dynamic offsets must be 256-aligned. Every
  // upload therefore writes whole 256 B slots and ships 112 B of padding per
  // draw. Packing the used bytes contiguously and binding with one offset per
  // batch would cut the per-frame upload by ~44%, but it means giving up
  // dynamic offsets for a per-batch bind-group carousel — a redesign of the
  // draw path, not a patch, so it is NOT attempted here. A `DRAW_FLOATS =
  // DRAW_USED_BYTES / 4` const used to sit on this line as the beginning of
  // that work; nothing ever read it (writeBuffer uses DRAW_F32_STRIDE), and a
  // dead const that LOOKS like the stride is a trap, so it is gone.
  const LAMP_MASK_ALL = 16777215;                       // 2^24-1: f32-exact all-ones lamp mask
  // Dynamic uniform-buffer offsets must be a multiple of
  // minUniformBufferOffsetAlignment (<=256 on all adapters); 256 is always a
  // valid multiple, so we stride slots at 256 B.
  const DRAW_STRIDE = 256;
  const MAX_DRAWS = 4096;                               // per-frame draw slots
  // Per-chunk lamps (bindings 15/16). TRACK_LIGHT_CAP sits above the ~800-lamp
  // bake ceiling in js/game/lighting.js; CHUNK_IDX_CAP bounds the concatenated
  // per-chunk index table across every chunked mesh in a bake generation
  // (measured visible-chunk counts are ~150 worst; whole-table sizes are far
  // smaller than 16384 at CAP 24 — overflow warns and falls back to global).
  const TRACK_LIGHT_CAP = 1024;                         // lights (64 B each -> 65536 B)
  const CHUNK_IDX_CAP = 16384;                          // u32 indices (65536 B)
  const BLIT_BYTES = _CH.BLIT_UNIFORM_BYTES | 0;        // 16

  // Keyed on the DEVICE (IS_MOBILE), not the memory tier — the same key
  // js/render/glx/shadow.js uses, and for its reason: GRAPHICS: HIGH on a phone
  // must not 4x the snap-cache redraw cost (terrain+road+whole city re-rasterised
  // into the map every ~10 m of travel). This read MOBILE_TIER, which handed a
  // HIGH-tier phone a 2048² map GLX would never give it — 12 MB of jetsam-counted
  // GPU memory plus the redraw stall, on the least-ready backend.
  const SHADOW_SIZE = WGX_LITE ? 1024 : 2048;          // sun depth-map resolution
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
  const CAR_SHADOW_ALLOC = WGX_LITE ? 1 : CAR_SHADOW_SIZE;
  // Static graph batches set the high-water mark; dense circuits exceed 40.
  const SHADOW_SLOTS = MAX_DRAWS;
  const SHADOW_MODEL_STRIDE = 256;                      // dynamic-offset alignment
  const SHADOW_MODEL_F32_STRIDE = SHADOW_MODEL_STRIDE >> 2; // 64 — pad to minUniformBufferOffsetAlignment

  // A 4th attr on the ribbon VBO zeroed (and broke pos fetch) on
  // SwiftShader-Dawn — including 4095-vert pieces. mat+trk live in the
  // group-2 world-XZ LUT; fs reconstructs (s, x, hw) from wpos.
  const VERTEX_STRIDE = 36;
  const VERTEX_FLOATS = 9;
  const VERTEX_POS_LAYOUT = {
    arrayStride: VERTEX_STRIDE,
    attributes: [
      { shaderLocation: 0, offset: 0,  format: "float32x3" },
      { shaderLocation: 1, offset: 12, format: "float32x3" },
      { shaderLocation: 2, offset: 24, format: "float32x3" },
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
  const LAMP_SHADOW_SIZE = WGX_LITE ? 1 : 512;
  // WebGPU allows sampleCount 1 or 4 — ONLY. (w3.org/TR/webgpu: "sampleCount
  // must be either 1 or 4"; Dawn agrees, 4 being the one portable MSAA level.)
  // Desktop GRAPHICS: ULTRA (apex26.gfxHigh=1) keeps 4×; HIGH (gfxHigh=0) uses 1×
  // — WebGPU cannot do 2×, so the savings mirror GLX capping HIGH at 2× MSAA.
  // Missing key defaults to 4× (fresh install / harness) until gfx-quality runs.
  // `let` (not const): soft-adapter escape hatch may drop desktop 4 → 1.
  let _wgxMsaa4 = true;
  try { if (localStorage.getItem("apex26.gfxHigh") === "0") _wgxMsaa4 = false; } catch (_) { /* blocked storage: default 4× MSAA */ }
  let MSAA_COUNT = WGX_LITE ? 1 : (_wgxMsaa4 ? 4 : 1);

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
  function _markGlxBound() {
    try { sessionStorage.setItem("apex26.gfxBound", "webgl2"); } catch (_) { /* label stays at the pick until the next paint */ }
    try { window.dispatchEvent(new Event("apex-gfx-live")); } catch (_) { /* no window (harness) */ }
  }
  function _clearGlxBound() {
    try { sessionStorage.removeItem("apex26.gfxBound"); } catch (_) { /* blocked storage */ }
    try { window.dispatchEvent(new Event("apex-gfx-live")); } catch (_) { /* no window (harness) */ }
  }
  function _fail(reason) {
    _lastFailure = { reason: String(reason), at: Date.now() };
    try { localStorage.setItem("apex26.gfxWgxFail", _lastFailure.reason); } catch (_) { /* blocked storage: lastFailure() still holds it */ }
    try { Log.warn("gfx", "WGX unavailable (" + _lastFailure.reason + ") — falling back to WebGL2"); } catch (_) { /* Log absent (node VM harness): lastFailure still records the reason */ }
    _markGlxBound();
    return null;
  }

  function toF32(a) { return a instanceof Float32Array ? a : new Float32Array(a); }

  // IEEE-754 half → float32 (runtime output probe reads rgba16float scene texels).
  function _f16to32(h) {
    const s = (h & 0x8000) >> 15, e = (h & 0x7C00) >> 10, f = h & 0x03FF;
    if (!e) return (s ? -1 : 1) * 0.00006103515625 * (f / 1024);
    if (e === 31) return f ? NaN : (s ? -Infinity : Infinity);
    return (s ? -1 : 1) * Math.pow(2, e - 15) * (1 + f / 1024);
  }

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

  //    Gribb–Hartmann from a COLUMN-MAJOR view-proj; inside = a*x+b*y+c*z+d >= 0.
  const _fcPlanes = [new Float32Array(4), new Float32Array(4), new Float32Array(4),
                     new Float32Array(4), new Float32Array(4), new Float32Array(4)];
  let _fcPlanesIsFrame = false;   // _fcPlanes currently holds this frame's camera planes
  function _setPlane(p, a, b, c, d) {
    const inv = 1 / (Math.hypot(a, b, c) || 1);
    p[0] = a * inv; p[1] = b * inv; p[2] = c * inv; p[3] = d * inv;
  }
  function _extractPlanes(m, planes) {
    const m0=m[0],m4=m[4],m8=m[8],m12=m[12], m1=m[1],m5=m[5],m9=m[9],m13=m[13],
          m2=m[2],m6=m[6],m10=m[10],m14=m[14], m3=m[3],m7=m[7],m11=m[11],m15=m[15];
    _setPlane(planes[0], m3+m0, m7+m4, m11+m8,  m15+m12); // left  (w + x >= 0)
    _setPlane(planes[1], m3-m0, m7-m4, m11-m8,  m15-m12); // right (w - x >= 0)
    _setPlane(planes[2], m3+m1, m7+m5, m11+m9,  m15+m13); // bottom (w + y >= 0)
    _setPlane(planes[3], m3-m1, m7-m5, m11-m9,  m15-m13); // top    (w - y >= 0)
    // frameViewProj is the RAW GL matrix (Z01 is applied only on GPU upload).
    // Near must be w+z>=0 like GLX/TLX — a WebGPU z>=0 extract on a GL VP
    // culls the near ribbon (chase/park) and leaves terrain covering the holes.
    _setPlane(planes[4], m3+m2, m7+m6, m11+m10, m15+m14); // near (GL clip w+z >= 0)
    _setPlane(planes[5], m3-m2, m7-m6, m11-m10, m15-m14); // far  (GL clip w-z >= 0)
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

    let adapter, device, ctx, format, _softAdapter = false;
    try {
      // Phones: low-power first. MDN: high-performance on a portable GPU
      // increases device.lost (iOS will shed the device under thermal). Desktop
      // still prefers discrete, then retries with no hint if that adapter is null
      // (Safari 26 sometimes returns null for high-performance only).
      const _pref = WGX_LITE ? "low-power" : "high-performance";
      adapter = await navigator.gpu.requestAdapter({ powerPreference: _pref });
      if (!adapter) adapter = await navigator.gpu.requestAdapter();
      if (!adapter) return _fail("no adapter");
      // Software / headless adapters: the native swapchain never composites
      // (black #game) but the 2D soft-present blit does. SETTINGS ▸ WEBGPU
      // must stay on WGX here — refusing used to silently bind GLX.
      // `apex26.gfxWgxAllowSoftware` is a legacy no-op (tools still set it).
      // Sync signals only — never await requestAdapterInfo() (has hung create()
      // with no timeout on Dawn/SwiftShader).
      let _softAdapterLocal = false;
      try {
        const ua = (typeof navigator !== "undefined" && navigator.userAgent) || "";
        const info = adapter.info || null;
        // GPUAdapterInfo fields are NOT JSON-enumerable — Chrome returns "{}" from
        // stringify while .vendor/.architecture hold "google"/"swiftshader" on
        // Lavapipe Xvfb (measured 2026-08-17). Read the properties directly.
        const dev = info && info.device;
        const ven = info && info.vendor;
        const arch = info && info.architecture;
        const desc = info && info.description;
        const infoBlob = [dev, ven, arch, desc].filter(Boolean).join(" ").toLowerCase();
        // NOT infoEmpty: browsers that withhold adapter.info fields (Firefox,
        // privacy-reduced UAs) were classified software on real hardware and
        // paid the full soft-present path — per-frame staging readback + CPU
        // blit — while the native swapchain worked. A true software adapter
        // that hides info AND lacks every marker below degrades through the
        // runtime output probe's loss ladder to GLX, which renders fine.
        // `soft(ware|pipe)` not bare `soft` — that substring matched any
        // "Microsoft" description.
        _softAdapterLocal = !!(adapter.isFallbackAdapter
            || /HeadlessChrome/i.test(ua)
            || /swiftshader|llvmpipe|lavapipe|microsoft basic render|soft(ware|pipe)/.test(infoBlob));
      } catch (_) { /* treat as hardware */ }
      _softAdapter = _softAdapterLocal;
      // sampleCount 4 resolveTarget frames come back blank on software —
      // force MSAA 1. Soft-present (not a GLX fallback) is the visible path.
      if (!WGX_LITE && _softAdapter) MSAA_COUNT = 1;
      // timestamp-query on WebKit/iOS has been advertised then lost the device
      // on the first real frame (the "worked for a second" crash). GLX already
      // treats the phone timer as absent; Safari Mac is the same GPU.
      const _has = function (name) {
        return !!(adapter.features && adapter.features.has && adapter.features.has(name));
      };
      const _canTimestamp = !WGX_LITE && _has("timestamp-query");
      // rg11b10ufloat is renderable ONLY with this feature (see POST_HDR_FORMAT).
      // Asked for on every tier, phones included: it makes the post targets
      // HALF the bytes, which matters most where memory is tightest.
      const _canPostHDR = _has("rg11b10ufloat-renderable");
      const _want = [];
      if (_canTimestamp) _want.push("timestamp-query");
      if (_canPostHDR) _want.push("rg11b10ufloat-renderable");
      device = await adapter.requestDevice(_want.length ? { requiredFeatures: _want } : {});
      // NOT `if (!device)`. requestDevice ALWAYS resolves a GPUDevice — the spec
      // says so — even when it cannot give a valid one; the failure is signalled
      // by handing back a device whose `lost` promise is ALREADY resolved. So a
      // truthiness test can never fire, and a dead device would sail through as
      // healthy.
      //
      // Detect it by MICROTASK ORDER, not a timer. An already-resolved promise
      // schedules its handler the moment .then() is called, so a couple of
      // `await`s here run strictly after it; a healthy device's `lost` never
      // settles and simply leaves the flag null. Deliberately NOT a
      // Promise.race against setTimeout: a timer is the wrong tool (it makes a
      // synchronous fact wait on the macrotask queue) and it deadlocks under
      // any harness that unref()s its timers to avoid holding the runner open —
      // tests/unit/webgpu-lifecycle.test.mjs does exactly that, and the race
      // hung there with "Promise resolution is still pending".
      let _bornLost = null;
      device.lost.then(function (info) { _bornLost = (info && info.reason) || "unknown"; });
      await null; await null;
      if (_bornLost) return _fail("device arrived lost (" + _bornLost + ")");
      const _devHas = function (name) {
        return !!(device.features && device.features.has && device.features.has(name));
      };
      var _timestampOk = _canTimestamp && _devHas("timestamp-query");
      // Re-derived from the DEVICE, not the adapter, and assigned on every
      // create — an adapter that advertises a feature can still hand back a
      // device without it, and a later create must not inherit an earlier
      // device's downgrade.
      POST_HDR_FORMAT = (_canPostHDR && _devHas("rg11b10ufloat-renderable"))
        ? "rg11b10ufloat" : SCENE_FORMAT;
    } catch (e) {
      return _fail("device request threw: " + ((e && e.message) || e));
    }

    // FORMAT ONLY — the canvas itself is claimed at the very END of create(),
    // after the self-test has proven this device can actually draw. A canvas is
    // bound to one context type for LIFE, so calling getContext("webgpu") here
    // and then refusing below would leave GLX unable to attach webgl2 to it, and
    // js/game.js can only recover that by clearing the opt-in and RELOADING the
    // page. Safari 26 is where refusal is most likely (it loses the device
    // mid-pipeline-setup, imgui#9103), i.e. exactly where the reload would be
    // paid. Pipelines need the format, not the context, so nothing below cares.
    try {
      format = navigator.gpu.getPreferredCanvasFormat();
    } catch (e) {
      return _fail("preferred canvas format threw: " + ((e && e.message) || e));
    }
    // WebKit (Safari Mac + every iOS browser) and phones: never configure the
    // VISIBLE swapchain as rgba16float. WebKit #269582 — IOSurface creation
    // crashed / painted black through iOS 26.x when the preferred format was
    // float; trunk fixes are not uniform across OS point releases. HDR stays
    // in offscreen rgba16float scene/post targets — only the canvas format
    // downgrades (MDN: extra copy vs a dead canvas).
    if (WGX_LITE && format === "rgba16float") format = "bgra8unorm";

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
    // JS-error strikes for begin()/present(). The old catch latched
    // `_lost = true` for ANY exception — a healthy-device data bug froze the
    // canvas forever, silently, with the label still claiming WEBGPU. Now a
    // JS throw drops the frame and retries; a real device loss resolves
    // device.lost long before the cap. Hitting the cap surrenders the tab to
    // GLX with the reason recorded (the device.lost minimal-rung idiom).
    let _jsStrikes = 0;
    let _okCounted = false;   // first presented frame of the boot = one clean session
    const JS_STRIKE_CAP = 3;
    // Runtime output probe: SwiftShader-Vulkan (and some phone GPUs) VALIDATE
    // WebGPU but never execute shader work — the boot blit self-test can pass on
    // a 1×1 offscreen target while every full-size frame stays black. Copy a
    // 4×4 patch from the HDR scene after the lit pass; three consecutive all-dark
    // readbacks climb the loss ladder (full→lite→minimal) then surrender to GLX.
    let _outProbeBuf = null, _outProbePending = false, _outProbeN = 0, _outBlack = 0;
    const OUT_PROBE_MAX = 12, OUT_BLACK_CAP = 3, OUT_BLACK_EPS = 0.02;
    let _outProbeOff = false;
    // SCREENSHOTS setting (SETTINGS ▸ SCREENSHOTS) + probe flag. Session wins
    // so gfx-probe can override a saved local pref for one tab; local persists
    // the player's tap. "1" = force 2D blit, "0" = force native swapchain.
    const _capPref = (function readCapturePref() {
      try {
        const s = sessionStorage.getItem("apex26.wgxCapture");
        if (s === "1" || s === "0") return s;
      } catch (_) { /* fall through */ }
      try {
        const s = localStorage.getItem("apex26.wgxCapture");
        if (s === "1" || s === "0") return s;
      } catch (_) { /* AUTO */ }
      return null;
    })();
    _outProbeOff = _capPref === "1" || _capPref === "0";
    // wgxCapture probes must soft-present even when adapter sniffing misses (headed
    // Lavapipe reports non-enumerable vendor/arch that stringify hid until 2026-08-17).
    // NATIVE ("0") keeps the swapchain so you can see why software screenshots
    // are black — and turns the output-probe ladder off so black is not a refuse.
    const _softGpu = _capPref === "0" ? false : (_softAdapter || _capPref === "1");
    if (_softGpu) _outProbeOff = true;
    // Software-present renders into an rgba8unorm texture, not the preferred
    // (usually bgra8unorm) swapchain. Every pipeline targeting currentView must
    // be compiled for the attachment it will actually receive.
    const _presentFormat = _softGpu ? LDR_FORMAT : format;
    // Runtime HDR readback probe (separate from _outProbeOff — that flag also
    // suppresses _wgxEscalate during wgxCapture, and must NOT block device.lost
    // on phones/WebKit). WebKit/iOS mapAsync/f16 copy timing false-triggers the
    // black-output ladder while the swapchain is fine.
    const _sceneProbeOn = !_outProbeOff && !WGX_LITE;
    // Software adapters: native swapchain never composites to #game (measured black
    // CDP/screenshot of hidden WebGPU canvas while agentview coverage is healthy).
    // Soft-present path: final pass → softPresentTex (COPY_SRC) → ephemeral staging
    // buffer readback (_softDisplayEncode/_softDisplayFinish) → putImageData on
    // visible #game 2D context. Never getCurrentTexture() on software — first call
    // breaks mapAsync device-wide. ONE mapAsync in flight (mirror capturePixels):
    // a later present() skips the 2D copy so SwiftShader cannot complete an older
    // readback after a newer one and leave #game on a pits/gantry frame.
    // snapCam()/invalidateSoftPresent() bumps _softSceneGen so an in-flight pits
    // readback cannot satisfy awaitSoftPresent(); the waiter accepts the first
    // non-blank blit encoded at that generation (not a second encode after it).
    // Never destroy a MAP_READ buffer to "skip" a blit — that hangs later maps.
    // WebGPU renders on a hidden canvas swapped in at boot.
    let _displayCanvas = null, _displayCtx = null, _gpuCanvas = null;
    let softPresentTex = null, softPresentView = null;
    let _softW = 0, _softH = 0;
    let _softImg = null; // pooled ImageData for soft-present CPU blit
    let _softBlitGen = 0;
    let _softBlitSeq = 0;
    let _softBlitShown = 0;
    let _softDisplayPending = false, _softDisplayEpoch = 0;
    let _softSceneGen = 0, _softShownGen = 0;
    let _softLastMaxPx = 0, _softLastSkip = "";
    // sessionStorage apex26.wgxHoldPresent=1 (set before reload) skips copy+map
    // until holdSoftPresent(false). The first SwiftShader mapAsync is the only
    // one that reliably completes; a menu/pits blit first leaves #game on that
    // frame and hangs the chase map (measured, Chrome MCP evaluate).
    let _softHold = false;
    try {
      _softHold = typeof sessionStorage !== "undefined" &&
        sessionStorage.getItem("apex26.wgxHoldPresent") === "1";
    } catch (_) { /* private mode */ }
    const _softPresentWaiters = [];
    if (_softGpu && typeof document !== "undefined") {
      _displayCanvas = canvas;
      _gpuCanvas = document.createElement("canvas");
      _gpuCanvas.setAttribute("aria-hidden", "true");
      if (_gpuCanvas.style) {
        _gpuCanvas.style.cssText = "position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0;pointer-events:none";
      }
      if (document.body) document.body.appendChild(_gpuCanvas);
      canvas = _gpuCanvas;
      try { Log.info("gfx", "WGX soft-present on"); } catch (_) { /* harness */ }
    }
    // CACHED CSS SIZE. resize() runs every frame, but clientWidth/clientHeight
    // are layout reads. Mirror GLX/TLX: invalidate only when the visible canvas
    // box or viewport changes, then reuse the last real size between events.
    const _layoutCanvas = (_softGpu && _displayCanvas) ? _displayCanvas : canvas;
    let _cssW = 0, _cssH = 0, _cssDirty = true;
    // Setting canvas.width fires ResizeObserver on this same node. Ignore
    // those callbacks or a 1px layout loop reconfigures the swapchain every
    // frame (white page / black clear flash — measured on the deploy tip).
    let _cssApplying = false;
    const _markCssDirty = function () { if (!_cssApplying) _cssDirty = true; };
    let _canWatchCss = false;
    if (typeof window !== "undefined" && window.addEventListener) {
      window.addEventListener("resize", _markCssDirty);
      window.addEventListener("orientationchange", _markCssDirty);
      _canWatchCss = true;
    }
    if (typeof ResizeObserver === "function" && _layoutCanvas) {
      try {
        new ResizeObserver(_markCssDirty).observe(_layoutCanvas);
        _canWatchCss = true;
      } catch (_) { /* optional */ }
    }
    function _cssSize() {
      // Zero means the canvas is not laid out yet; keep probing until real.
      if (!_canWatchCss) _cssDirty = true;
      if (_cssDirty || _cssW <= 0 || _cssH <= 0) {
        _cssW = _layoutCanvas.clientWidth;
        _cssH = _layoutCanvas.clientHeight;
        _cssDirty = false;
      }
    }
    function _wgxEscalate(why) {
      if (_outProbeOff) {
        try { Log.warn("gfx", "WGX capture mode — suppressed escalate:", why); } catch (_) { /* harness */ }
        return;
      }
      if (_lost) return;
      _lost = true;
      _healReset();
      try { localStorage.setItem("apex26.gfxWgxFail", why); } catch (_) { /* blocked storage */ }
      try { localStorage.removeItem("apex26.gfxBackendProbe"); } catch (_) { /* blocked storage */ }
      const _rung = WGX_MINIMAL ? 2 : (WGX_LITE ? 1 : 0);
      if (_rung < 2) {
        const nextRung = String(_rung + 1);
        try {
          localStorage.setItem("apex26.gfxWgxLevel", nextRung);
          localStorage.setItem("apex26.gfxWgxLite", "1");
        } catch (_) { /* cannot persist the rung; fall through to GLX skip */ }
        let armed = false;
        try { armed = localStorage.getItem("apex26.gfxWgxLevel") === nextRung; } catch (_) { /* blocked */ }
        if (armed) {
          try { Log.warn("gfx", "WGX " + why + " — retrying " + (nextRung === "1" ? "slim" : "minimal") + " WebGPU"); } catch (_) { /* harness */ }
          try { location.reload(); } catch (_) { /* no location */ }
          return;
        }
      }
      _markGlxBound();
      let skipped = false;
      try {
        sessionStorage.setItem("apex26.gfxClaimFail", "1");
        skipped = sessionStorage.getItem("apex26.gfxClaimFail") === "1";
      } catch (_) { /* no sessionStorage */ }
      try {
        Log.warn("gfx", "WGX " + why + " — keeping WEBGPU pick" +
          (skipped ? ", this tab falls back to WebGL2" : " (could not arm session skip; not reloading)"));
      } catch (_) { /* harness */ }
      if (skipped) { try { location.reload(); } catch (_) { /* no location */ } }
      else { try { localStorage.setItem("apex26.gfxBackendProbe", "webgpu"); } catch (_) { /* RESET door */ } }
    }
    function _outputBlackSurrender() {
      _wgxEscalate("runtime output black (GPU drew nothing)");
    }
    function _queueOutputProbe() {
      if (!_sceneProbeOn || _lost || _outProbePending || _outProbeN >= OUT_PROBE_MAX || _drawSlot < 1) return;
      if (!sceneTex || !encoder || typeof encoder.copyTextureToBuffer !== "function") return;
      try {
        if (!_outProbeBuf) {
          _outProbeBuf = device.createBuffer({
            size: 256 * 4, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
          });
        }
        const tw = _texW || width, th = _texH || height;
        const cx = Math.max(0, (tw >> 1) - 2), cy = Math.max(0, (th >> 1) - 2);
        encoder.copyTextureToBuffer(
          { texture: sceneTex, origin: [cx, cy, 0] },
          { buffer: _outProbeBuf, bytesPerRow: 256, rowsPerImage: 4 },
          [4, 4, 1]
        );
        _outProbePending = true;
        _outProbeN++;
      } catch (_) { /* copy unsupported on this device */ }
    }
    function _readOutputProbe() {
      if (!_outProbePending || !_outProbeBuf || _outProbeBuf.mapState !== "unmapped") return;
      _outProbePending = false;
      if (typeof _outProbeBuf.mapAsync !== "function") return;
      try {
        _outProbeBuf.mapAsync(GPUMapMode.READ).then(function () {
          try {
            const px = new Uint16Array(_outProbeBuf.getMappedRange().slice(0, 128));
            let max = 0;
            for (let i = 0; i < px.length; i++) {
              const f = _f16to32(px[i]);
              if (f > max) max = f;
            }
            if (max < OUT_BLACK_EPS) {
              _outBlack++;
              if (_outBlack >= OUT_BLACK_CAP) _outputBlackSurrender();
            } else _outBlack = 0;
          } catch (_) { /* probe read failed */ }
          try { _outProbeBuf.unmap(); } catch (_) { /* already unmapped */ }
        }).catch(function () { /* mapAsync rejected */ });
      } catch (_) { /* mapAsync threw */ }
    }
    function _jsStrike(where, e) {
      litPass = null; encoder = null; currentView = null;
      try { if (!_jsStrikes) Log.warn("gfx", "WGX " + where + " failed —", e); } catch (_) { /* harness */ }
      _jsStrikes++;
      if (_jsStrikes < JS_STRIKE_CAP) return;
      _lost = true;
      _healReset();
      try { localStorage.setItem("apex26.gfxWgxFail", where + " threw: " + ((e && e.message) || e)); } catch (_) { /* blocked storage */ }
      try { localStorage.removeItem("apex26.gfxBackendProbe"); } catch (_) { /* blocked storage */ }
      _markGlxBound();
      let skipped = false;
      try {
        sessionStorage.setItem("apex26.gfxClaimFail", "1");
        skipped = sessionStorage.getItem("apex26.gfxClaimFail") === "1";
      } catch (_) { /* no sessionStorage: re-arm the canary below */ }
      if (skipped) { try { location.reload(); } catch (_) { /* harness */ } }
      else {
        try { localStorage.setItem("apex26.gfxBackendProbe", "webgpu"); } catch (_) { /* next boot has no canary; RESET is the way back */ }
      }
    }
    device.lost.then(function (info) {
      if (info && info.reason === "destroyed") return;
      // Crash latches, mirroring GLX webglcontextlost / TLX onDeviceLost: a
      // real loss while visible disarms the expensive opt-ins so the next boot
      // does not repeat the configuration that killed the device. Same
      // visibility guard — a backgrounding-driven loss is benign and must not
      // disable a feature the player deliberately turned on.
      try {
        if (typeof document !== "undefined" && !document.hidden) {
          try { localStorage.setItem("apex26.perChunkOff", "1"); } catch (_) { /* no storage: the tier gate is the only defence left; nothing here may throw */ }
        }
      } catch (_) { /* no document (harness) */ }
      _wgxEscalate("device lost (" + ((info && info.reason) || "unknown") + ")");
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
    let _runtimeReady = false; // set after a successful create() return path
    const GPU_ERR_LOG_CAP = 8;
    const GPU_ERR_ESCALATE_CAP = 8;
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
        // After boot, a flood of uncaptured errors means the GPU is drawing
        // nothing while the UI still says WEBGPU. Climb the same ladder as
        // device.lost / JS-strike cap — do not keep presenting a dead backend.
        if (_runtimeReady && !_lost && _gpuErrors >= GPU_ERR_ESCALATE_CAP) {
          _wgxEscalate("runtime GPU errors (" + _gpuErrors + ")");
        }
      };
    } catch (_) { /* onuncapturederror is optional; _bootError/_gpuErrors stay 0 if we cannot hook it */ }

    let width = 0, height = 0, aspect = 1, renderScale = 1;
    let lastFrame = null;

    // Per-frame scratch (reused; writeBuffer snapshots on call so reuse is safe).
    const frameData = new Float32Array(FRAME_FLOATS);
    const lightData = new Float32Array(LIGHT_FLOATS);
    const grLightData = new Float32Array(LIGHT_FLOATS);
    const _grSel = [];
    // Partial select: keep the nearest GR_MAX (=6) without sorting the full
    // night light list. O(n·k) insertion vs O(n log n) Array.sort — Singapore /
    // Vegas floodlight counts make the full sort measurable on soft GPUs.
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
    // Per-slot CPU ring (stride = DRAW_STRIDE/4). Filled during the lit pass;
    // one writeBuffer before litPass.end() replaces hundreds of per-draw uploads.
    const DRAW_F32_STRIDE = DRAW_STRIDE >> 2;   // 64
    const drawRing = new Float32Array(MAX_DRAWS * DRAW_F32_STRIDE);
    const blitData  = new Float32Array(BLIT_BYTES / 4);
    const skyData   = new Float32Array(WGSLChunks.SKY_UNIFORM_BYTES / 4);
    const _vpGpu    = new Float32Array(16);   // Z01-remapped viewProj upload scratch
    const _grInvTmp = new Float32Array(16);   // godray invVP mul scratch (was per-frame new)
    const _instDrawOpts = { _instanced: true }; // reused; fields overwritten each draw
    const _dynOff = [0];   // single-element dynamic-offset scratch

    // Culling frame state.
    let frameViewProj = null, frameEye = null, frameCullDist = 0;
    // Per-chunk lamp state: knob + full baked set (frame fields, cleared by
    // day), the trackLightSBO generation, and the chunkIdxSBO segment
    // allocator (WeakMap chunks-array -> {base, table} + append cursor).
    let framePerChunk = 0, frameAllLights = null;
    let _tlSrc = null, _tlKnob = -1;
    let _ciCursor = 0, _ciSeg = new WeakMap();
    const _tlScratch = new Float32Array(TRACK_LIGHT_CAP * 16);
    let frameLights = null, frameNL = 0;   // this frame's stride-15 light array (lamp-mask cull)
    // Post-chain + FX frame extras.
    // frameVPGpu is the Z01-remapped
    // view-proj the depth buffer was rasterised with — every FX embeds it so its
    // clip-z matches the scene depth; frameInvProjW is the WebGPU-convention
    // inverse projection for SSAO view-pos reconstruction.
    const frameVPGpu = new Float32Array(16);
    const frameInvProjW = new Float32Array(16);
    let frameSunDir = null, frameSunColor = null, frameProjRaw = null,
      frameTune = null,
        frameSunVS = null, frameUpVS = null, frameHaveProj = false, frameTime = 0,
        frameAmbSky = null, frameAmbGround = null;

    // GPU objects assembled below (fail -> return null).
    let g0Layout, g1Layout, g2Layout, litLayout, litModule, skyModule, blitModule;
    let frameUBO, lightSBO, grLightSBO, drawUBO, blitUBO, skyUBO;
    let trackLightSBO, chunkIdxSBO;   // per-chunk lamps: full baked set + concat index table
    let frameBindGroup, drawBindGroup, skyBindGroup;
    let skyPipeline, blitPipeline, linearSampler, envCubeSamp;
    const _litPipelines = new Map();

    // Shadow-pass objects.
    let shadowTex = null, shadowView = null, shadowSampler = null;
    let envCubeView = null, ssrView = null;   // env-probe cube + SSR placeholders until their passes run
    let _ssrReady = false;   // SSR flips true once its pass runs (env reflection is analytic-sky — no probe gate needed)
    let _frameReflect = 0;   // wet-road SSR strength (== GLX present opts.reflect). Still packed into next begin() for debug; consume is same-frame in COMPOSITE.
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
    // Saved game-frame fields while a probe face is open (GLX envFaceBegin/End).
    let _envFrame = null, _envSvVP = null, _envSvEye = null, _envSvCull = 0;
    const _envView = new Float32Array(16), _envProj = new Float32Array(16),
          _envVP = new Float32Array(16), _envVPGpu = new Float32Array(16), _envInvVP = new Float32Array(16);
    const _envTgt = [0, 0, 0];
    let shadowUBO, shadowModelUBO, shadowG0Layout, shadowG1Layout, shadowModule,
        shadowPipeline, shadowG0BindGroup, shadowModelBindGroup;
    let _shadowRendered = false, _shadowLightVP = null;
    const shadowLVPData = new Float32Array(16);
    // Per-slot CPU ring (stride = SHADOW_MODEL_STRIDE/4). Filled during the
    // shadow pass; one writeBuffer in _flushShadowModelUBO() replaces N
    // per-cast uploads. Same shape as drawRing / _flushDrawUBO.
    const shadowModelRing = new Float32Array(SHADOW_SLOTS * SHADOW_MODEL_F32_STRIDE);
    const _shadowDynOff = [0];   // reused dynamic-offset scratch (was a fresh [slot*stride] per cast)
    let shadowEncoder = null, shadowPass = null, _shadowSlot = 0, _shadowOverflow = 0;
    // Deferred shadow submit: the (up to three) shadow passes of a frame record
    // into ONE encoder, stashed here by their End and submitted WITH the frame
    // (queue order within one submit keeps shadow-before-lit execution) — was
    // up to 3 extra queue.submits per frame. The model ring is shared across
    // the passes as REGIONS: slots keep counting across Begins and reset only
    // at the frame submit; _flushShadowModelUBO uploads each pass's new region.
    let _pendingShadowEnc = null, _shadowFlushed = 0;
    // Dynamic per-frame CAR shadow map (GLX parity — see carShadowBegin).
    let carShadowTex = null, carShadowView = null, carShadowUBO = null, carShadowG0BindGroup = null;
    let _carShadowArmed = false, _carArms = 0, _carBoxScale = 1;
    const carShadowLVPData = new Float32Array(16);
    let lampShadowTex = null, lampShadowView = null, lampShadowUBO = null, lampShadowG0BindGroup = null;
    let _lampShadowArmed = false, _lampArms = 0, _lampIdx = -1;
    const lampShadowLVPData = new Float32Array(16);
    let matAlbedoTex = null, matNormalTex = null;
    let matPlaceTex = null, matPlaceView = null;
    let matAlbedoView = null, matNormalView = null, matArraySamp = null;
    // Placeholder views stay alive for the device lifetime; pack tokens in
    // _matOwned* are destroyed on replace/unload (GLX deleteTexture parity).
    let matPlaceAlbedoView = null, matPlaceNormalView = null;
    let _matOwnedAlbedo = null, _matOwnedNormal = null;
    let matScaleUBO = null, matScaleData = new Float32Array(20);
    let _matAlbedoOn = false, _matNormalOn = false;
    const _matScales = new Float32Array(MAT_TEX_LAYERS);
    let _msaaCount = MSAA_COUNT, _passSamples = 1;
    let sceneMSTex = null, sceneMSView = null, depthMSTex = null, depthMSView = null;
    let pDepthResolve = null, depthResolveBG = null;
    let _gpuTimerOn = false, _gpuMs = -1, _gpuQuerySet = null, _gpuResolveBuf = null, _gpuReadBuf = null;
    let identInstanceBuf = null, zeroAttrBG = null, _roadLutBG = null, _roadLutReady = false;
    let pParticle = null, pParticleAdd = null, particleBGL = null;
    // Dual particle UBO/VBO/BG — smoke then sparks both writeBuffer before
    // submit; one shared buffer left both draws seeing sparks only.
    let particleUBO = [null, null], particleVBO = [null, null], _particleCap = [0, 0];
    let _particleBG = [null, null], _particleFlip = 0;
    const _retiredBufs = [];   // buffers replaced MID-FRAME; destroyed after the frame's submit
    let skyPipelineMS = null;
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

    //    _buildPost; size-dependent targets + bind groups (re)built in
    //    ensureTargets). _postReady/_fxReady gate a safe fallback to the blit. ──
    let _postReady = false, _fxReady = false, _cfgWarned = false;
    let ssaoTex = null, ssaoView = null, godrayTex = null, godrayView = null,
        ssaoBlurTex = null, ssaoBlurView = null, godrayBlurTex = null, godrayBlurView = null,
        ldrTex = null, ldrView = null, ssrTex = null;
    let bloomLv = [];                 // [{tex, view, w, h}]
    let bloomDownUBO = [], bloomUpUBO = [], bloomDownBG = [], bloomUpBG = [];
    let ssaoUBO, godrayUBO, compositeUBO, fxaaUBO, ssrUBO, blurUBO;
    let ssaoBG = null, godrayBG = null, compositeBG = null, fxaaBG = null, ssrBG = null;
    let ssaoBlurSrcBG = null, ssaoBlurDstBG = null, godrayBlurSrcBG = null, godrayBlurDstBG = null;
    let pBloomDown, pBloomUp, pSSAO, pBlur, pBlurHDR, pGodray, pComposite, pFXAA, pointSampler, pSSR;
    // Blur dynamic-offset ring (see _buildPost BLUR block). Reset each present().
    let _blurBGL = null, _blurStride = 256, _blurSlots = 16, _blurWriteSlot = 0;
    // Per-pass CPU scratch for uniform writes (largest block is SSAO, 176 B/44 f).
    const postScratch = new Float32Array(80);

    let quadFxVBO = null, quadFxUBO = null, quadFxBG = null, fxQuadLayout = null;
    let pBlob = null, pMark = null;
    let pSkid = null, skidUBO = null, skidFxBG = null, skidVBO = null,
        _skidCap = 0, _skidScratch = null;
    let pGlow = null, glowUBO = null, glowFxBG = null, glowVBO = null,
        _glowCap = 0, _glowScratch = null;
    let pDecal = null, decalUBO = null, fxDecalLayout = null;
    let _fxQuadSlot = 0, _fxDecalSlot = 0, _fxQuadOverflow = 0;
    const FX_QUAD_SLOTS = 64, FX_DECAL_SLOTS = 128, FX_STRIDE = 256;
    const FX_F32_STRIDE = FX_STRIDE >> 2; // 64 — pad to minUniformBufferOffsetAlignment
    // CPU rings for blob/mark + decal. Filled per stamp; one writeBuffer each
    // in _flushLitRings() before litPass.end() (same shape as drawRing).
    const quadFxRing = new Float32Array(FX_QUAD_SLOTS * FX_F32_STRIDE);
    const decalFxRing = new Float32Array(FX_DECAL_SLOTS * FX_F32_STRIDE);
    const _fxQuadDynOff = [0], _fxDecalDynOff = [0];
    const fxScratch = new Float32Array(56);   // >= DECAL 224 B / 4 — glow still uses this scratch
    // Camera-facing glow billboard corner template (mirror GLX _glowCorners).
    const _glowCorners = [[-1, 0], [1, 0], [1, 1], [-1, 0], [1, 1], [-1, 1]];

    try {
      linearSampler = device.createSampler({ magFilter: "linear", minFilter: "linear" });
      // Env-cube sampler is its own object: GLX puts 4× anisotropy on the cube
      // so grazing clearcoat rays do not over-blur. envSamp (binding 5) is
      // shared with SSR + the PCSS blocker — aniso there would smear those.
      try {
        envCubeSamp = device.createSampler({
          magFilter: "linear", minFilter: "linear", mipmapFilter: "linear",
          maxAnisotropy: 4,
        });
      } catch (_) {
        envCubeSamp = device.createSampler({
          magFilter: "linear", minFilter: "linear", mipmapFilter: "linear",
        });
      }

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
      // Blocker map (PCSS-lite downsampled sun shadow map). Isolated: Safari
      // may refuse r16float as a color target; LIT still needs a float view
      // at binding 7, so a 1×1 placeholder keeps the frame group valid.
      try {
        blockerTex = device.createTexture({
          size: [512, 512], format: "r16float",
          usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        });
        blockerView = blockerTex.createView();
      } catch (_) {
        blockerTex = device.createTexture({
          size: [1, 1], format: SCENE_FORMAT,
          usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
        });
        blockerView = blockerTex.createView();
      }
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
          { binding: 14, visibility: GPUShaderStage.FRAGMENT,
            sampler: { type: "filtering" } },                            // env cube 4× aniso (GLX)
          { binding: 15, visibility: GPUShaderStage.FRAGMENT,
            buffer: { type: "read-only-storage" } },                     // baked track lights (per-chunk)
          { binding: 16, visibility: GPUShaderStage.FRAGMENT,
            buffer: { type: "read-only-storage" } },                     // concat per-chunk lamp indices
        ],
      });
      g1Layout = device.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
            buffer: { type: "uniform", hasDynamicOffset: true, minBindingSize: DRAW_USED_BYTES } },
        ],
      });
      g2Layout = device.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
            buffer: { type: "read-only-storage", minBindingSize: 16 } },
        ],
      });
      litLayout = device.createPipelineLayout({ bindGroupLayouts: [g0Layout, g1Layout, g2Layout] });

      litModule  = device.createShaderModule({ code: WGSLChunks.LIT });
      skyModule  = device.createShaderModule({ code: WGSLChunks.SKY });
      blitModule = device.createShaderModule({ code: WGSLChunks.BLIT });

      frameUBO = device.createBuffer({ size: FRAME_BYTES, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
      lightSBO = device.createBuffer({ size: LIGHT_BYTES, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
      // God-ray march reads nearest-N lamps (GLX sorts by eye). Must NOT reuse
      // lightSBO — LIT consumes frame.lights in record order.
      grLightSBO = device.createBuffer({ size: LIGHT_BYTES, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
      // Per-chunk lamps: the WHOLE baked track set (uploaded once per bake with
      // the knob dimmer applied — per-chunk sets render raw records × knob, the
      // twilight ramp/flicker scale only the per-frame copy) + the LampChunks
      // concat index table. Static between bakes; zero per-frame upload.
      trackLightSBO = device.createBuffer({ size: TRACK_LIGHT_CAP * LIGHT_STRIDE, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
      chunkIdxSBO = device.createBuffer({ size: CHUNK_IDX_CAP * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
      drawUBO  = device.createBuffer({ size: MAX_DRAWS * DRAW_STRIDE, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
      blitUBO  = device.createBuffer({ size: BLIT_BYTES, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
      skyUBO   = device.createBuffer({ size: WGSLChunks.SKY_UNIFORM_BYTES, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });

      // NOT here — the frame group binds material, blocker and shadow resources
      // that are still null at this point. It is built at the END of init(),
      // once they all exist. (The guard in _makeFrameBGs makes this a no-op
      // rather than a throw, but calling it here at all is misleading.)
      drawBindGroup = device.createBindGroup({
        layout: g1Layout,
        // size = the DrawU slice; the dynamic offset selects the slot at draw time.
        entries: [{ binding: 0, resource: { buffer: drawUBO, offset: 0, size: DRAW_USED_BYTES } }],
      });

      // Sky pipeline — renders into the LIT pass (SCENE_FORMAT). Depth write OFF,
      // compare less-equal: SKY_VS puts the fullscreen tri at depth 1.0 (z=w), so
      // early sky paints the clear background, and late sky (opaque → sky →
      // glow) still only fills pixels the world left at the far plane — GLX
      // parity (js/render/shaders/sky.js + glx.js drawSky depthMask false /
      // LEQUAL). Was "always": correct only for sky-FIRST. After late sky
      // shipped, ALWAYS overwrote the entire lit colour buffer (hall-of-mirrors
      // / melted world; cars still visible because they draw after the sky).
      // EXPLICIT shared layout — skyBindGroup is set with BOTH pipelines
      // (drawSky picks the MS variant when the lit pass is multisampled), and
      // two `layout:"auto"` pipelines are NEVER bind-group compatible, even
      // when byte-identical. With auto layouts every MSAA sky draw raised
      // "created with a default layout, and is not compatible" and killed the
      // whole frame's command buffer — invisible in this container (software
      // adapters force MSAA 1 above), broken on every real GPU running MSAA 4.
      const skyBGL = device.createBindGroupLayout({ entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: "uniform" } },
      ] });
      const skyLayout = device.createPipelineLayout({ bindGroupLayouts: [skyBGL] });
      skyPipeline = device.createRenderPipeline({
        layout: skyLayout,
        vertex: { module: skyModule, entryPoint: "vs_main" },
        fragment: { module: skyModule, entryPoint: "fs_main", targets: [{ format: SCENE_FORMAT }] },
        primitive: { topology: "triangle-list" },
        depthStencil: { format: DEPTH_FORMAT, depthWriteEnabled: false, depthCompare: "less-equal" },
      });
      if (MSAA_COUNT > 1) {
        skyPipelineMS = device.createRenderPipeline({
          layout: skyLayout,
          vertex: { module: skyModule, entryPoint: "vs_main" },
          fragment: { module: skyModule, entryPoint: "fs_main", targets: [{ format: SCENE_FORMAT }] },
          primitive: { topology: "triangle-list" },
          depthStencil: { format: DEPTH_FORMAT, depthWriteEnabled: false, depthCompare: "less-equal" },
          multisample: { count: MSAA_COUNT },
        });
      }
      skyBindGroup = device.createBindGroup({
        layout: skyBGL,
        entries: [{ binding: 0, resource: { buffer: skyUBO } }],
      });

      // Blit/tonemap pipeline — HDR scene -> swapchain.
      blitPipeline = device.createRenderPipeline({
        layout: "auto",
        vertex: { module: blitModule, entryPoint: "vs_main" },
        fragment: { module: blitModule, entryPoint: "fs_main", targets: [{ format: _presentFormat }] },
        primitive: { topology: "triangle-list" },
      });

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
      matPlaceTex = device.createTexture({
        size: [1, 1, MAT_TEX_LAYERS], format: "rgba8unorm",
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
      });
      // GLX dummy is explicit 128-grey (identity under albedo*tex*2). An
      // uninitialized WebGPU texture is undefined — often 0, which crushes
      // every layer, or garbage that washes the road.
      {
        const bpr = 256;
        const placePx = new Uint8Array(bpr * MAT_TEX_LAYERS);
        for (let i = 0; i < MAT_TEX_LAYERS; i++) {
          placePx[i * bpr] = placePx[i * bpr + 1] = placePx[i * bpr + 2] = 128;
          placePx[i * bpr + 3] = 255;
        }
        device.queue.writeTexture(
          { texture: matPlaceTex }, placePx,
          { bytesPerRow: bpr, rowsPerImage: 1 }, [1, 1, MAT_TEX_LAYERS]);
      }
      matPlaceAlbedoView = matPlaceTex.createView({ dimension: "2d-array" });
      matPlaceNormalView = matPlaceAlbedoView; // shared 1×1×N dummy is enough
      matAlbedoView = matPlaceAlbedoView;
      matNormalView = matPlaceNormalView;
      // maxAnisotropy 4 matches GLX (js/render/glx.js applies the same cap to the
      // MAT array) and TLX (anisotropy = 4). The road is the grazing-angle
      // surface these exist for — trilinear alone smears tarmac aggregate into
      // mip mush ~20 m ahead of the car. WebGPU only allows it when all three
      // filters are "linear" (they are); a driver that still rejects the
      // descriptor falls back to the plain sampler rather than failing create().
      const _matSampDesc = {
        magFilter: "linear", minFilter: "linear", mipmapFilter: "linear",
        addressModeU: "repeat", addressModeV: "repeat",
      };
      try {
        matArraySamp = device.createSampler(Object.assign({ maxAnisotropy: 4 }, _matSampDesc));
      } catch (_) {
        matArraySamp = device.createSampler(_matSampDesc);
      }
      matScaleUBO = device.createBuffer({ size: 80, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
      device.queue.writeBuffer(matScaleUBO, 0, matScaleData);
      const _ident = new Float32Array(20);
      _ident[0] = _ident[5] = _ident[10] = _ident[15] = 1;
      _ident[16] = _ident[17] = _ident[18] = 1;
      identInstanceBuf = _mkBuffer(_ident, GPUBufferUsage.VERTEX);
      // 16 vec4s: fs_main's road LUT probe always indexes 0..15. Dawn also
      // rejects a 0-byte storage binding. 512 B (not 256) so the mock-GPU
      // harness does not confuse this with the 256 B composite UBO.
      zeroAttrBG = device.createBindGroup({
        layout: g2Layout,
        entries: [{ binding: 0, resource: { buffer: _mkBuffer(new Float32Array(128), GPUBufferUsage.STORAGE) } }],
      });
      if (_timestampOk) {
        try {
          _gpuQuerySet = device.createQuerySet({ type: "timestamp", count: 2 });
          _gpuResolveBuf = device.createBuffer({ size: 16, usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC });
          _gpuReadBuf = device.createBuffer({ size: 16, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
        } catch (_) { _timestampOk = false; /* timestamp-query feature advertised but createQuerySet failed */ }
      }

      blockerUBO = device.createBuffer({
        size: 16, // size of BlockerU
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
      });
      // srcTexel uniform data (1/SHADOW_SIZE, 1/SHADOW_SIZE, 0, 0)
      const blockerUBOData = new Float32Array([1.0 / SHADOW_SIZE, 1.0 / SHADOW_SIZE, 0.0, 0.0]);
      device.queue.writeBuffer(blockerUBO, 0, blockerUBOData);

      try {
        blockerG0Layout = device.createBindGroupLayout({
          entries: [
            { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "depth" } },
            { binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
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
            { binding: 1, resource: { buffer: blockerUBO } },
          ]
        });
      } catch (_) { blockerPipeline = null; blockerBG = null; /* PCSS downsample optional; LIT still binds the placeholder */ }

      // Frame bind group, built HERE: every resource it binds — the material
      // array + scale UBO, both shadow views, the blocker view — exists by now.
      // If this still cannot build, the guard inside leaves frameBindGroup null
      // and the self-test below refuses rather than shipping a renderer that
      // would draw nothing.
      _rebuildFrameBG();
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
        // Bloom mips are POST_HDR_FORMAT textures (ensureTargets) — the
        // pipelines MUST match. These were SCENE_FORMAT for months and no run
        // ever caught it, because the mismatch only exists when the device
        // grants rg11b10ufloat-renderable (POST_HDR != SCENE) AND the perf
        // tier lets bloom run — first hit by the real-pixel capture rig
        // (2026-08-17, both lineages independently): "Attachment state of
        // [RenderPipeline] is not compatible", one invalid submit per frame,
        // black screen. Godray/blur already used POST_HDR_FORMAT.
        pBloomDown = fsPipe(_Post.BLOOM_DOWN, POST_HDR_FORMAT, null);
        pBloomUp   = fsPipe(_Post.BLOOM_UP,   POST_HDR_FORMAT, ADD_BLEND);   // additive accumulate
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
            fragment: { module: grMod, entryPoint: "fs_main", targets: [{ format: POST_HDR_FORMAT }] },
            primitive: { topology: "triangle-list" },
          });
        }
        // BLUR uses an EXPLICIT layout with dynamic offsets: queue.writeBuffer is
        // queue-timeline while draw is encoder-timeline, so H then V (and
        // times>1) into one UBO region before submit would leave every pass
        // seeing only the LAST write (WebGPU Fundamentals uniforms lesson).
        // A 256 B-strided ring + setBindGroup(..., [offset]) gives each pass
        // its own slot. SSAO (2) + god-ray times=2 (4) need 6 slots/frame.
        const BLUR_STRIDE = 256;
        const BLUR_SLOTS = 16;
        let blurBGL = null;
        if (_Post.BLUR) {
          blurBGL = device.createBindGroupLayout({ entries: [
            { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
            { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
            { binding: 2, visibility: GPUShaderStage.FRAGMENT,
              buffer: { type: "uniform", hasDynamicOffset: true, minBindingSize: _Post.BLUR_UNIFORM_BYTES } },
          ] });
          const blurPL = device.createPipelineLayout({ bindGroupLayouts: [blurBGL] });
          const blurPipe = (fmt) => {
            const mod = device.createShaderModule({ code: _Post.BLUR });
            return device.createRenderPipeline({
              layout: blurPL,
              vertex: { module: mod, entryPoint: "vs_main" },
              fragment: { module: mod, entryPoint: "fs_main", targets: [{ format: fmt }] },
              primitive: { topology: "triangle-list" },
            });
          };
          pBlur = blurPipe(SSAO_FORMAT);
          pBlurHDR = blurPipe(POST_HDR_FORMAT);
          _blurBGL = blurBGL;
          _blurStride = BLUR_STRIDE;
          _blurSlots = BLUR_SLOTS;
        }
        pComposite = fsPipe(_Post.COMPOSITE, LDR_FORMAT,    null);
        pFXAA      = fsPipe(_Post.FXAA,       _presentFormat, null);
        ssaoUBO      = device.createBuffer({ size: _Post.SSAO_UNIFORM_BYTES,      usage: _UCD });
        blurUBO      = device.createBuffer({ size: BLUR_STRIDE * BLUR_SLOTS,       usage: _UCD });
        godrayUBO    = device.createBuffer({ size: _Post.GODRAY_UNIFORM_BYTES,    usage: _UCD });
        compositeUBO = device.createBuffer({ size: _Post.COMPOSITE_UNIFORM_BYTES, usage: _UCD });
        fxaaUBO      = device.createBuffer({ size: _Post.FXAA_UNIFORM_BYTES,      usage: _UCD });
        ssrUBO       = device.createBuffer({ size: _Post.SSR_UNIFORM_BYTES,       usage: _UCD });
      } catch (_) { pComposite = null; }   // disable post; ensureTargets stays inert
    }

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
          // Alpha masked (GLX drawGlow parity): additive halos writing a=1.0
          // saturated the scene-alpha SSR car-paint tag under lamp glow.
          fragment: { module: glowMod, entryPoint: "fs_main", targets: [{
            format: SCENE_FORMAT, blend: ADD_BLEND,
            writeMask: GPUColorWrite.RED | GPUColorWrite.GREEN | GPUColorWrite.BLUE,
          }] },
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
          fragment: { module: decalMod, entryPoint: "fs_main", targets: [{
            format: SCENE_FORMAT, blend: ALPHA_BLEND,
            writeMask: GPUColorWrite.RED | GPUColorWrite.GREEN | GPUColorWrite.BLUE,
          }] },
          primitive: { topology: "triangle-list", cullMode: "none" },
          depthStencil: { format: DEPTH_FORMAT, depthWriteEnabled: false, depthCompare: "less-equal" },
          ..._fxMS,
        });
        decalUBO = device.createBuffer({ size: FX_DECAL_SLOTS * FX_STRIDE, usage: _UCD });
        if (_Fx.PARTICLE) {
          const pMod = device.createShaderModule({ code: _Fx.PARTICLE });
          const pVert = { module: pMod, entryPoint: "vs_main", buffers: [{ arrayStride: _Fx.PARTICLE_VERTEX_BYTES,
            attributes: [
              { shaderLocation: 0, offset: 0,  format: "float32x2" },
              { shaderLocation: 1, offset: 8,  format: "float32x3" },
              { shaderLocation: 2, offset: 20, format: "float32x3" },
              { shaderLocation: 3, offset: 32, format: "float32" },
              { shaderLocation: 4, offset: 36, format: "float32" },
            ] }] };
          const pPrim = { topology: "triangle-list", cullMode: "none" };
          const pDepth = { format: DEPTH_FORMAT, depthWriteEnabled: false, depthCompare: "less-equal" };
          // EXPLICIT shared layout (same reason as the sky pair above):
          // drawParticles builds ONE bind group and sets pParticleAdd for
          // sparks — with auto layouts every additive spark draw raised
          // "default layout … not compatible" and invalidated the frame.
          particleBGL = device.createBindGroupLayout({ entries: [
            { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
              buffer: { type: "uniform" } },
          ] });
          const pLayout = device.createPipelineLayout({ bindGroupLayouts: [particleBGL] });
          // Both particle pipelines mask alpha — GLX brackets drawParticles in
          // setAlphaWrite(false)/(true) precisely so smoke/sparks over the car
          // can't drag the scene-alpha SSR paint tag off its value (pDecal
          // above carries the same mask).
          const pMask = GPUColorWrite.RED | GPUColorWrite.GREEN | GPUColorWrite.BLUE;
          pParticle = device.createRenderPipeline({
            layout: pLayout,
            vertex: pVert,
            fragment: { module: pMod, entryPoint: "fs_main", targets: [{ format: SCENE_FORMAT, blend: ALPHA_BLEND, writeMask: pMask }] },
            primitive: pPrim,
            depthStencil: pDepth,
            ..._fxMS,
          });
          // GLX drawParticles switches to ONE/ONE for sparks. The shader already
          // premultiplies when U.eyeAdd.w=1; alpha-blend + alpha=1 would REPLACE
          // the HDR scene instead of adding.
          pParticleAdd = device.createRenderPipeline({
            layout: pLayout,
            vertex: pVert,
            fragment: { module: pMod, entryPoint: "fs_main", targets: [{ format: SCENE_FORMAT, blend: ADD_BLEND, writeMask: pMask }] },
            primitive: pPrim,
            depthStencil: pDepth,
            ..._fxMS,
          });
          particleUBO[0] = device.createBuffer({ size: _Fx.PARTICLE_UNIFORM_BYTES, usage: _UCD });
          particleUBO[1] = device.createBuffer({ size: _Fx.PARTICLE_UNIFORM_BYTES, usage: _UCD });
          // Static layout — valid for BOTH pipelines (explicit shared layout).
          _particleBG[0] = device.createBindGroup({
            layout: particleBGL,
            entries: [{ binding: 0, resource: { buffer: particleUBO[0] } }],
          });
          _particleBG[1] = device.createBindGroup({
            layout: particleBGL,
            entries: [{ binding: 0, resource: { buffer: particleUBO[1] } }],
          });
        }
        _fxReady = true;
      } catch (_) { _fxReady = false; /* FX stay no-ops; lit/sky/shadow still run */ }
    }
    // Minimal rung: leave the post chain unbuilt. pComposite stays null, so
    // ensureTargets allocates ONLY scene+depth+blit (no ssao/godray/bloom/ldr
    // aux targets) and present() takes the tonemap blit — that is the
    // bulk of the discretionary target bytes the device that just died was
    // carrying. FX stay: they record into the lit pass and own no targets.
    if (!WGX_MINIMAL) _buildPost();
    _buildFx();

    function _litPipeline(opts) {
      const blend = !!(opts && opts.alpha !== undefined && opts.alpha < 1);
      const dbl   = !!(opts && opts.doubleSided);
      const noAW  = !!(opts && opts.noAlphaWrite);
      // Optional always-pass (opts.decal). The road must NOT use this —
      // stamping ribbon depth clips walls/tyres drawn later. Floor/terrain
      // punch a LUT hole; the road uses less-equal (no GL-sized bias)
      // and still writes depth so skyLate cannot erase it.
      const decal = !!(opts && (opts.decal || opts.depthCompare === "always"));
      const samples = _passSamples | 0 || 1;
      // GLX polygonOffset(factor, units) → WebGPU depthBias / depthBiasSlopeScale.
      // Start-line decals pass [-1, -2]; without this they shimmer at range.
      const db = (opts && opts.depthBias && opts.depthBias.length >= 2) ? opts.depthBias : null;
      const dbC = db ? (db[0] | 0) : 0;
      const dbS = db ? (db[1] | 0) : 0;
      // Bias offset +32 so road [-8,-16] stays unique (old +8 collided signs).
      const key = (blend ? 1 : 0) | (dbl ? 2 : 0) | (noAW ? 4 : 0) | (samples << 3)
                | ((dbC + 32) << 8) | ((dbS + 32) << 16)
                | (decal ? (1 << 24) : 0);
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
      const depthStencil = {
        format: DEPTH_FORMAT,
        depthWriteEnabled: !blend,
        depthCompare: decal ? "always" : "less-equal",
      };
      if (db) {
        depthStencil.depthBias = dbC;
        depthStencil.depthBiasSlopeScale = dbS;
        depthStencil.depthBiasClamp = 0;
      }
      p = device.createRenderPipeline({
        layout: litLayout,
        vertex: { module: litModule, entryPoint: "vs_main", buffers: [VERTEX_POS_LAYOUT, INSTANCE_LAYOUT] },
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
        depthStencil,
        multisample: { count: samples },
      });
      _litPipelines.set(key, p);
      return p;
    }

    function _configureCanvas() {
      if (!ctx || !device) return null;
      try {
        ctx.configure({
          device, format, alphaMode: "opaque",
          usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
        });
        return null;
      } catch (e) {
        return "canvas configure threw: " + ((e && e.message) || e);
      }
    }
    function _ensureSoftPresent() {
      if (!_softGpu || width < 1 || height < 1) return;
      if (softPresentTex && _softW === width && _softH === height) return;
      try {
        if (softPresentTex) softPresentTex.destroy();
        softPresentTex = device.createTexture({
          size: [width, height], format: LDR_FORMAT,
          usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC |
                 GPUTextureUsage.TEXTURE_BINDING,
        });
        softPresentView = softPresentTex.createView();
        _softW = width; _softH = height;
      } catch (e) {
        try { Log.warn("gfx", "WGX soft present target failed —", e); } catch (_) { /* harness */ }
        softPresentTex = null; softPresentView = null;
      }
    }
    function _acquirePresentView() {
      if (_softGpu) {
        _ensureSoftPresent();
        return softPresentView || null;
      }
      return ctx.getCurrentTexture().createView();
    }
    function _softDisplayEncode() {
      if (!_softGpu || !_displayCtx || !softPresentTex || !encoder) return null;
      // A software map can lag many frames. Never allocate another full-frame
      // staging buffer until the current one has mapped or failed; the next
      // rendered frame will naturally become the newest readback.
      if (_softHold || _softDisplayPending) return null;
      let buf = null;
      try {
        const w = _softW || width, h = _softH || height;
        if (w < 2 || h < 2) return null;
        const bpr = (w * 4 + 255) & ~255;
        buf = device.createBuffer({
          size: bpr * h, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        });
        encoder.copyTextureToBuffer(
          { texture: softPresentTex },
          { buffer: buf, bytesPerRow: bpr, rowsPerImage: h },
          [w, h, 1]
        );
        _softBlitSeq++;
        _softDisplayPending = true;
        return { buf, bpr, w, h, seq: _softBlitSeq, epoch: _softDisplayEpoch, sceneGen: _softSceneGen };
      } catch (_) {
        try { if (buf) buf.destroy(); } catch (_) { /* partial encode */ }
        return null;
      }
    }
    function _softDisplayFinish(cap) {
      if (!cap) return;
      const { buf, bpr, w, h, seq, epoch, sceneGen } = cap;
      const release = function () { _softDisplayPending = false; };
      if (!_displayCtx) {
        try { buf.destroy(); } catch (_) { /* device dying */ }
        release();
        return;
      }
      const finish = function () {
        try {
          buf.mapAsync(GPUMapMode.READ).then(function () {
            try {
              const src = new Uint8Array(buf.getMappedRange());
              // A resize can complete while mapAsync is pending. Drain/destroy
              // the old buffer, but never paint its stale dimensions.
              if (epoch === _softDisplayEpoch && seq === _softBlitSeq &&
                  _displayCanvas && _displayCanvas.width === w && _displayCanvas.height === h) {
                let maxPx = 0;
                if (!_softImg || _softImg.width !== w || _softImg.height !== h) {
                  _softImg = _displayCtx.createImageData(w, h);
                }
                const img = _softImg;
                for (let y = 0; y < h; y++) {
                  const s = y * bpr, d = y * w * 4;
                  for (let x = 0; x < w; x++) {
                    const si = s + x * 4, di = d + x * 4;
                    const r = src[si], g = src[si + 1], b = src[si + 2];
                    img.data[di] = r; img.data[di + 1] = g; img.data[di + 2] = b; img.data[di + 3] = 255;
                    if ((r + g + b) > maxPx) maxPx = r + g + b;
                  }
                }
                _softLastMaxPx = maxPx;
                if (maxPx >= 8) {
                  _displayCtx.putImageData(img, 0, 0);
                  _softShownGen = sceneGen;
                  _softLastSkip = "";
                  _softBlitNotify(seq);
                } else {
                  _softLastSkip = "dim";
                }
              } else {
                _softLastSkip = epoch !== _softDisplayEpoch ? "epoch"
                  : (seq !== _softBlitSeq ? "seq" : "size");
              }
            } catch (_) { /* 2D blit failed */ }
            try { buf.unmap(); buf.destroy(); } catch (_) { /* device dying */ }
            release();
          }, function () {
            try { buf.destroy(); } catch (_) { /* device dying */ }
            release();
          });
        } catch (_) {
          try { buf.destroy(); } catch (_) { /* device dying */ }
          release();
        }
      };
      try {
        device.queue.onSubmittedWorkDone().then(finish, finish);
      } catch (_) { finish(); }
    }
    function _softDisplayAbort(cap) {
      if (!cap) return;
      try { cap.buf.destroy(); } catch (_) { /* submit rejected / device dying */ }
      _softDisplayPending = false;
    }
    function _softBlitNotify(seq) {
      _softBlitShown = seq;
      _softBlitGen = seq;
      const keep = [];
      const ws = _softPresentWaiters.splice(0);
      for (let i = 0; i < ws.length; i++) {
        try {
          if (!ws[i](seq)) keep.push(ws[i]);
        } catch (_) { /* harness waiter */ }
      }
      for (let j = 0; j < keep.length; j++) _softPresentWaiters.push(keep[j]);
    }
    function holdSoftPresent(on) {
      if (on === undefined) return _softHold;
      _softHold = !!on;
      try {
        if (typeof sessionStorage === "undefined") return _softHold;
        if (_softHold) sessionStorage.setItem("apex26.wgxHoldPresent", "1");
        else sessionStorage.removeItem("apex26.wgxHoldPresent");
      } catch (_) { /* private mode */ }
      return _softHold;
    }
    function invalidateSoftPresent() {
      if (!_softGpu) return;
      // Bump generation only. Do NOT destroy the in-flight MAP_READ buffer —
      // that hangs the next mapAsync on SwiftShader (measured). Do NOT bump
      // epoch either: the in-flight copy must be allowed to land so pending
      // can clear; awaitSoftPresent ignores it when shownGen < needGen.
      _softSceneGen++;
    }
    function softPresentState() {
      return {
        seq: _softBlitSeq, shown: _softBlitShown, pending: _softDisplayPending,
        hold: _softHold,
        epoch: _softDisplayEpoch, sceneGen: _softSceneGen, shownGen: _softShownGen,
        lastMaxPx: _softLastMaxPx, lastSkip: _softLastSkip,
        display: _displayCanvas ? [_displayCanvas.width, _displayCanvas.height] : null,
        tex: [_softW, _softH],
      };
    }
    function awaitSoftPresent(timeoutMs) {
      if (!_softGpu || !_displayCtx) return Promise.resolve(_softBlitGen);
      // A waiter needs a blit encoded at/after the current scene generation
      // (bumped by snapCam), not a second encode after that blit. Requiring
      // seq > _softBlitSeq timed out when the chase map was already in flight.
      const needGen = _softSceneGen;
      const shown0 = _softBlitShown;
      if (shown0 > 0 && _softShownGen >= needGen) return Promise.resolve(shown0);
      const ms = timeoutMs != null ? timeoutMs : 15000;
      return new Promise(function (resolve, reject) {
        let waiter = null;
        const timer = setTimeout(function () {
          const i = _softPresentWaiters.indexOf(waiter);
          if (i >= 0) _softPresentWaiters.splice(i, 1);
          reject(new Error("awaitSoftPresent timeout after " + ms + " ms"));
        }, ms);
        waiter = function (seq) {
          if (_softShownGen >= needGen || (shown0 === 0 && seq > 0)) {
            try { clearTimeout(timer); } catch (_) { /* harness */ }
            resolve(seq);
            return true;
          }
          return false;
        };
        _softPresentWaiters.push(waiter);
      });
    }
    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, WGX_MINIMAL ? 1 : (WGX_LITE ? 1.5 : 2));
      // Clamp to the device's texture ceiling: a 5K/6K display at DPR 2 walks
      // past the 8192 default, and every ensureTargets() alloc (and the
      // swapchain itself) then fails into a silent per-frame retry loop.
      const maxDim = (device.limits && device.limits.maxTextureDimension2D) || 8192;
      _cssSize();
      let w = Math.min(maxDim, Math.max(1, Math.round(_cssW * dpr * renderScale)));
      let h = Math.min(maxDim, Math.max(1, Math.round(_cssH * dpr * renderScale)));
      // 1px CSS/DPR jitter must not rebuild the swapchain. Reconfigure wipes
      // to black and the 2D #game to transparent (white shell flashing through).
      if (width > 1 && height > 1 && Math.abs(w - width) <= 1 && Math.abs(h - height) <= 1) {
        w = width; h = height;
      }
      const sizeChanged = canvas.width !== w || canvas.height !== h ||
        (_displayCanvas && (_displayCanvas.width !== w || _displayCanvas.height !== h));
      if (sizeChanged) {
        _cssApplying = true;
        try {
          _softDisplayEpoch++;
          canvas.width = w; canvas.height = h;
          // WebGPU: changing the canvas drawing-buffer size INVALIDATES the
          // configured swapchain. Reconfigure on every buffer-size change.
          if (ctx) {
            const _cfgErr = _configureCanvas();
            if (_cfgErr) try { if (!_cfgWarned) { _cfgWarned = true; Log.warn("gfx", "WGX canvas configure failed —", _cfgErr); } } catch (_) { /* harness */ }
            else _cfgWarned = false;
          }
          if (_softGpu && _displayCanvas) {
            _displayCanvas.width = w;
            _displayCanvas.height = h;
          }
        } finally {
          _cssApplying = false;
        }
      }
      width = w; height = h; aspect = w / h;
      if (_softGpu) _ensureSoftPresent();
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
      // EVERY binding, not just frameUBO. WebGPU rejects a bind group whose
      // resource is null — Safari's message is "Member GPUBufferBinding.buffer
      // is required and must be an instance of GPUBuffer" — and the old guard
      // named only two of the sixteen. init() calls _rebuildFrameBG() straight
      // after the UBOs are made, ~90 lines BEFORE matScaleUBO, the material
      // views, the blocker view and both extra shadow views exist, so the
      // first call built a group full of nulls and threw out of init. That
      // aborted WGX entirely on a real device (measured: iPhone, Safari 26.6,
      // build 1281, `apex26.gfxWgxFail` = that exact string, RENDERER showing
      // "WEBGPU (WEBGL2)"). It survived every test because the WebGPU mock in
      // tests/unit/webgpu-lifecycle.test.mjs does not validate bind groups.
      //
      // Bailing is safe: this is a rebuild, and the callers that matter re-run
      // it once their resource lands (env probe, setMaterialMaps, and the
      // explicit call at the end of init).
      if (!g0Layout || !frameUBO || !lightSBO || !matScaleUBO) return;
      if (!shadowView || !shadowSampler || !linearSampler || !envCubeSamp || !nextSsrView) return;
      if (!blockerView || !carShadowView || !lampShadowView) return;
      if (!matAlbedoView || !matNormalView || !matArraySamp) return;
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
          { binding: 14, resource: envCubeSamp },
          { binding: 15, resource: { buffer: trackLightSBO } },
          { binding: 16, resource: { buffer: chunkIdxSBO } },
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
          next.godrayTex = device.createTexture({ size: [halfW, halfH], format: POST_HDR_FORMAT,
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
          next.godrayBlurTex = device.createTexture({ size: [halfW, halfH], format: POST_HDR_FORMAT,
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
          next.ldrTex = device.createTexture({ size: [width, height], format: LDR_FORMAT,
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
          next.ssaoView = next.ssaoTex.createView();
          next.ssaoBlurView = next.ssaoBlurTex.createView();
          next.godrayView = next.godrayTex.createView();
          next.godrayBlurView = next.godrayBlurTex.createView();
          next.ldrView = next.ldrTex.createView();
          // Wet-road SSR renders at HALF RES (the SSAO/godray pattern): the
          // 24-step march runs on 4× fewer pixels and the target costs a
          // quarter of the old full-res allocation — GLX never allocates one
          // at all (its SSR is inline in the composite shader), and COMPOSITE
          // reads binding 8 through linearSampler, so the upsample is the
          // same free bilinear the godray add already uses. The march reads
          // the FULL-res scene + depth (correct — half-res output, full-res
          // inputs). On the mobile tier skip it entirely: binding 6 keeps the
          // 1×1 placeholder, whose .a is 0, and the LIT SSR block documents
          // that as the exact no-op case. Wet road on a phone falls back to
          // the analytic sky reflection.
          if (!WGX_LITE) {
            next.ssrTex = device.createTexture({ size: [halfW, halfH], format: SCENE_FORMAT,
              usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING });
            next.ssrView = next.ssrTex.createView();
          }

          let bw = halfW, bh = halfH;
          for (let i = 0; i < BLOOM_MAX_LEVELS; i++) {
            if (i > 0) { bw = Math.max(1, bw >> 1); bh = Math.max(1, bh >> 1); }
            if (i > 0 && (bw < 4 || bh < 4)) break;
            const tex = device.createTexture({ size: [bw, bh], format: POST_HDR_FORMAT,
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
            layout: _blurBGL || pBlur.getBindGroupLayout(0),
            entries: [
              { binding: 0, resource: next.ssaoView },
              { binding: 1, resource: linearSampler },
              { binding: 2, resource: { buffer: blurUBO, offset: 0, size: _Post.BLUR_UNIFORM_BYTES } },
            ],
          });
          next.ssaoBlurDstBG = device.createBindGroup({
            layout: _blurBGL || pBlur.getBindGroupLayout(0),
            entries: [
              { binding: 0, resource: next.ssaoBlurView },
              { binding: 1, resource: linearSampler },
              { binding: 2, resource: { buffer: blurUBO, offset: 0, size: _Post.BLUR_UNIFORM_BYTES } },
            ],
          });
          next.godrayBlurSrcBG = device.createBindGroup({
            layout: _blurBGL || pBlurHDR.getBindGroupLayout(0),
            entries: [
              { binding: 0, resource: next.godrayView },
              { binding: 1, resource: linearSampler },
              { binding: 2, resource: { buffer: blurUBO, offset: 0, size: _Post.BLUR_UNIFORM_BYTES } },
            ],
          });
          next.godrayBlurDstBG = device.createBindGroup({
            layout: _blurBGL || pBlurHDR.getBindGroupLayout(0),
            entries: [
              { binding: 0, resource: next.godrayBlurView },
              { binding: 1, resource: linearSampler },
              { binding: 2, resource: { buffer: blurUBO, offset: 0, size: _Post.BLUR_UNIFORM_BYTES } },
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
              { binding: 6, resource: { buffer: grLightSBO } },
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
              // Scene depth for flare sunVis occlusion + SSAO bilateral upsample.
              { binding: 7, resource: next.depthSampleView },
              { binding: 8, resource: next.ssrView || ssrView },
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
        // Alloc/bind of the new size failed: keep the previous target set
        // and retry after a cooldown (same-size) or immediately (new size).
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
      depthResolveBG = null;   // depthMSView changed — recreate on next present
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

    // Geometry is uploaded with queue.writeBuffer, NOT createBuffer({
    // mappedAtCreation:true}). mappedAtCreation needs a client-visible mapping
    // as large as the WHOLE buffer, and Dawn throws when that allocation fails:
    // measured on a live device as "createBuffer failed, size (208) is too large
    // for the implementation when mappedAtCreation == true" for EVERY mesh in
    // the track — a 208-BYTE buffer failing is an exhausted mappable pool, not a
    // size limit, and the 35 MB chunked scenery buffer is what exhausted it.
    // (PlayCanvas #6676 and pixijs #10404 are the same failure on real GPUs
    // under memory pressure.) writeBuffer stages through Dawn's own ring buffer
    // in bounded chunks, so peak mappable demand no longer tracks mesh size.
    function _mkBuffer(data, usage) {
      const size = (data.byteLength + 3) & ~3;   // writeBuffer: size multiple of 4
      const buf = device.createBuffer({ size, usage: usage | GPUBufferUsage.COPY_DST });
      if (data.byteLength === size) {
        device.queue.writeBuffer(buf, 0, data);
      } else {
        // Odd tail (an index count that leaves a 2-byte remainder): writeBuffer
        // wants a 4-multiple, so pad through a scratch view rather than round
        // the count and read past the array.
        const pad = new Uint8Array(size);
        pad.set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
        device.queue.writeBuffer(buf, 0, pad);
      }
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
  // dest pixel → UV over the FULL source. pos is dest-framebuffer pixels;
  // textureDimensions(src) is the PARENT mip. Dividing by src size (the old
  // formula) only read the top-left quadrant, so every MAT/env mip was a
  // zoomed corner — tarmac went to a washed smear vs GLX generateMipmap.
  let srcSize = vec2<f32>(textureDimensions(src));
  let dstSize = max(floor(srcSize * 0.5), vec2<f32>(1.0));
  return textureSampleLevel(src, samp, pos.xy / dstSize, 0.0);
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
        // Views + bind groups on an immutable texture are stable. Rebuilding
        // the full ladder every call was 72 createView + 36 createBindGroup
        // per 6-face env cycle (~every 6 frames with CAR ENV REFLECTION on).
        // Cache the ladder on the texture — it dies with the texture.
        let ladder = tex.__wgxMipLadder;
        if (!ladder || ladder.length !== nLay * (levels - 1)) {
          ladder = [];
          for (let layer = 0; layer < nLay; layer++) {
            for (let level = 1; level < levels; level++) {
              const srcView = tex.createView({ dimension: "2d", baseArrayLayer: layer, arrayLayerCount: 1,
                baseMipLevel: level - 1, mipLevelCount: 1 });
              const dstView = tex.createView({ dimension: "2d", baseArrayLayer: layer, arrayLayerCount: 1,
                baseMipLevel: level, mipLevelCount: 1 });
              ladder.push({ dstView, bg: device.createBindGroup({
                layout: pipe.getBindGroupLayout(0),
                entries: [{ binding: 0, resource: srcView }, { binding: 1, resource: _mipSamp }],
              }) });
            }
          }
          tex.__wgxMipLadder = ladder;
        }
        const enc = device.createCommandEncoder();
        for (let i = 0; i < ladder.length; i++) {
          const st = ladder[i];
          const p = enc.beginRenderPass({ colorAttachments: [{ view: st.dstView, loadOp: "clear",
            clearValue: { r: 0, g: 0, b: 0, a: 1 }, storeOp: "store" }] });
          p.setPipeline(pipe); p.setBindGroup(0, st.bg); p.draw(3); p.end();
        }
        device.queue.submit([enc.finish()]);
      } catch (_) { /* mip blit is best-effort; caller still has mip 0 */ }
    }

    // Interleave [pos3, nrm3, col3] (stride 36) + a side array [mat, s, x, hw].
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
      const inter = new Float32Array(vCount * VERTEX_FLOATS);
      const attr = new Float32Array(vCount * 4);
      for (let i = 0; i < vCount; i++) {
        const o = i * VERTEX_FLOATS;
        inter[o]   = pos[i*3];   inter[o+1] = pos[i*3+1]; inter[o+2] = pos[i*3+2];
        inter[o+3] = nrm[i*3];   inter[o+4] = nrm[i*3+1]; inter[o+5] = nrm[i*3+2];
        // Raw RGB. Packing MAT into col.x interpolates 16→0 and sawtooths.
        // Dawn zeros a 4th attr (and pos) even on piece VBOs — asphalt vs
        // verge is classified from the LUT (abs(x) < hw - 0.45).
        inter[o + 6] = col[i * 3];
        inter[o + 7] = col[i * 3 + 1];
        inter[o + 8] = col[i * 3 + 2];
        attr[i * 4] = mat ? mat[i] : 0;
        if (trk) {
          attr[i * 4 + 1] = trk[i * 3];
          attr[i * 4 + 2] = trk[i * 3 + 1];
          attr[i * 4 + 3] = trk[i * 3 + 2];
        }
      }
      return {
        vert: inter, attr, idx, hasTrk: !!trk,
        indexFormat: idx instanceof Uint32Array ? "uint32" : "uint16",
        count: idx.length,
      };
    }

    // createBuffer may still throw a synchronous RangeError when the allocation
    // cannot be satisfied — writeBuffer removed the mappable-pool failure above,
    // not plain out-of-memory, which is the pressure that precedes a device
    // loss. The mesh family is called LAZILY
    // from the render path (gear digits, LED strips mid-race), so a throw here
    // would escape into tick() and paint the full-screen overlay. Every draw
    // path checks .vbuf, so an inert mesh keeps the frame alive instead —
    // the same contract createTexture already honours.
    function _allocFail(what, e) {
      try { Log.warn("gfx", "WGX " + what + " alloc failed —", e); } catch (_) { /* harness */ }
      const msg = (e && e.message) || String(e);
      if (/too large|out of memory|device lost|invalid device|destroyed/i.test(msg)) {
        if (_outProbeOff) {
          try { Log.warn("gfx", "WGX capture mode — suppressed alloc escalate:", msg.slice(0, 80)); } catch (_) { /* harness */ }
        } else _wgxEscalate(what + " alloc: " + msg.slice(0, 120));
      }
    }
    // Shared-index ribbons (the road) cannot use drawIndexed on this adapter:
    // vertex_index stays 0, so every fragment reads matTrkArr[0] (a grass
    // skirt). Expand to a non-indexed list so vertex_index is 0..N-1 and
    // matches the storage buffer 1:1.
    function _expandPull(vert, attr, idx) {
      const n = idx.length;
      const ev = new Float32Array(n * VERTEX_FLOATS);
      const ea = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) {
        // Swap each triangle's last two verts so the ribbon fills under
        // frontFace cw. Do NOT flip the copied normals — they stay
        // buildRoad's upOf (track-up). fs_main skips the two-sided N
        // negate on road draws so the tops do not light as the underside.
        const flip = (i % 3 === 1) ? 1 : (i % 3 === 2) ? -1 : 0;
        const v = idx[i + flip], so = v * VERTEX_FLOATS, sao = v * 4, o = i * VERTEX_FLOATS, ao = i * 4;
        for (let k = 0; k < VERTEX_FLOATS; k++) ev[o + k] = vert[so + k];
        ea[ao] = attr[sao]; ea[ao + 1] = attr[sao + 1];
        ea[ao + 2] = attr[sao + 2]; ea[ao + 3] = attr[sao + 3];
      }
      return { vert: ev, attr: ea, count: n };
    }
    function _makeAttrBG(attr) {
      // Dawn rejects a 0-byte storage binding ("Binding size … is zero").
      // Pad to 256 B (minStorageBufferOffsetAlignment) so a short mesh cannot
      // fail the bind. 64 floats = 16 vec4s covers the LUT's 16-slot probe.
      const src = attr && attr.byteLength >= 16 ? attr : new Float32Array(4);
      const padded = new Float32Array(Math.max(128, Math.ceil(src.length / 64) * 64));
      padded.set(src);
      const sbuf = _mkBuffer(padded, GPUBufferUsage.STORAGE);
      const attrBG = device.createBindGroup({
        layout: g2Layout,
        entries: [{ binding: 0, resource: { buffer: sbuf } }],
      });
      return { sbuf, attrBG };
    }
    // World-XZ spatial LUT (32×32×16). Group-2 used to be a per-vertex
    // mat+trk array — vertex_index stays 0 on this adapter, and a 4th
    // vertex attr zeros (and breaks pos) even on piece VBOs. Magic 12345
    // marks a LUT vs a dummy/attr buffer.
    function _makeRoadLUT(pos, trk, matArr) {
      const posA = toF32(pos), trkA = toF32(trk);
      const vCount = (posA.length / 3) | 0;
      if (!vCount || trkA.length < vCount * 3) {
        return _makeAttrBG(null);
      }
      const mat = matArr && matArr.length === vCount ? toF32(matArr) : null;
      const raw = [];
      let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
      let skipHw = 0, skipLat = 0, skipMat = 0;
      for (let i = 0; i < vCount; i++) {
        const hw = trkA[i * 3 + 2], lat = trkA[i * 3 + 1];
        if (hw <= 0.5) { skipHw++; continue; }
        if (Math.abs(lat) > 0.85) { skipLat++; continue; }
        if (mat && mat[i] !== 16) { skipMat++; continue; }
        const px = posA[i * 3], pz = posA[i * 3 + 2];
        raw.push({ px, pz, s: trkA[i * 3], hw });
        if (px < minX) minX = px; if (px > maxX) maxX = px;
        if (pz < minZ) minZ = pz; if (pz > maxZ) maxZ = pz;
      }
      if (!raw.length) {
        return _makeAttrBG(null);
      }
      raw.sort((a, b) => a.s - b.s);
      const MAX_S = 2000;
      const step = Math.max(1, Math.ceil(raw.length / MAX_S));
      const samples = [];
      for (let i = 0; i < raw.length; i += step) samples.push(raw[i]);
      const pad = 24;
      minX -= pad; maxX += pad; minZ -= pad; maxZ += pad;
      const extX = Math.max(maxX - minX, 1), extZ = Math.max(maxZ - minZ, 1);
      const GW = 32, GH = 32, SLOT = 16;
      const cells = new Array(GW * GH);
      for (let i = 0; i < cells.length; i++) cells[i] = [];
      const bin = (s, gx, gz) => {
        if (gx < 0 || gz < 0 || gx >= GW || gz >= GH) return;
        const list = cells[gx + gz * GW];
        if (list.length >= SLOT) return;
        for (let j = 0; j < list.length; j++) {
          if (list[j].px === s.px && list[j].pz === s.pz) return;
        }
        list.push(s);
      };
      for (let i = 0; i < samples.length; i++) {
        const s = samples[i];
        const gx = Math.max(0, Math.min(GW - 1, (s.px - minX) / extX * GW | 0));
        const gz = Math.max(0, Math.min(GH - 1, (s.pz - minZ) / extZ * GH | 0));
        bin(s, gx, gz);
        bin(s, gx - 1, gz); bin(s, gx + 1, gz);
        bin(s, gx, gz - 1); bin(s, gx, gz + 1);
      }
      for (let gz = 0; gz < GH; gz++) {
        for (let gx = 0; gx < GW; gx++) {
          const list = cells[gx + gz * GW];
          const cx = minX + (gx + 0.5) * extX / GW;
          const cz = minZ + (gz + 0.5) * extZ / GH;
          // Ensure every cell has ≥2 spatially distinct samples so the shader
          // can form a track tangent (a lone sample left best2 at the origin).
          while (list.length < 2) {
            let best = null, bestD = Infinity, avoid = list[0] || null;
            for (let i = 0; i < samples.length; i++) {
              const s = samples[i];
              if (avoid && (s.px - avoid.px) * (s.px - avoid.px) + (s.pz - avoid.pz) * (s.pz - avoid.pz) < 0.25) continue;
              const d = (s.px - cx) * (s.px - cx) + (s.pz - cz) * (s.pz - cz);
              if (d < bestD) { bestD = d; best = s; }
            }
            if (!best) break;
            list.push(best);
          }
        }
      }
      const out = new Float32Array(8 + GW * GH * SLOT * 4);
      out[0] = 12345; out[1] = minX; out[2] = minZ; out[3] = 0;
      out[4] = extX; out[5] = extZ; out[6] = GW; out[7] = GH;
      const FAR = { px: 1e6, pz: 1e6, s: 0, hw: 0 };
      let o = 8;
      for (let i = 0; i < GW * GH; i++) {
        const list = cells[i];
        for (let k = 0; k < SLOT; k++) {
          const s = list[k] || FAR;
          out[o] = s.px; out[o + 1] = s.pz; out[o + 2] = s.s; out[o + 3] = s.hw;
          o += 4;
        }
      }
      const bg = _makeAttrBG(out);
      bg.isRoadLut = true;
      return bg;
    }
    function _rememberRoadLut(lut) {
      if (lut && lut.isRoadLut && lut.attrBG) { _roadLutBG = lut.attrBG; _roadLutReady = true; }
    }
    // firstIndex is an ELEMENT offset (WebGPU drawIndexed), not a byte offset.
    // Chunks store both; convert byteOffset / bytesPerIndex when firstIndex is
    // absent so a GLX-style range still draws the correct run.
    function _chunkFirstIndex(ch) {
      if (!ch) return 0;
      if (ch.firstIndex != null) return ch.firstIndex | 0;
      if (ch.byteOffset) {
        const bpi = ch.indexFormat === "uint32" ? 4 : 2;
        return (ch.byteOffset / bpi) | 0;
      }
      return 0;
    }
    function _drawGeom(pass, mesh, instCount) {
      // A count-0 mesh (alloc-fail stub, empty piece head) is a dead draw —
      // Dawn warns "Draw with an index count of 0 is unusual" on every boot
      // it reaches the queue (measured via the live probe).
      if (!mesh || !mesh.count) return;
      if (mesh.ibuf) {
        pass.setIndexBuffer(mesh.ibuf, mesh.indexFormat);
        const firstIndex = _chunkFirstIndex(mesh);
        if (instCount) pass.drawIndexed(mesh.count, instCount, firstIndex);
        else pass.drawIndexed(mesh.count, 1, firstIndex);
      } else if (instCount) pass.draw(mesh.count, instCount);
      else pass.draw(mesh.count);
    }
    function _meshFromPull(vert, attr, count, indexFormat, shared) {
      const vbuf = _mkBuffer(vert, GPUBufferUsage.VERTEX);
      const a = shared || _makeAttrBG(attr);
      return { vbuf, ibuf: null, sbuf: a.sbuf, attrBG: a.attrBG, count, indexFormat, chunks: null };
    }
    function createMesh(data) {
      const b = _interleave(data);
      const pulled = b.hasTrk ? _expandPull(b.vert, b.attr, b.idx) : null;
      const lut = b.hasTrk ? _makeRoadLUT(data.pos, data.trk, data.mat) : null;
      if (lut) _rememberRoadLut(lut);
      let vbuf = null, ibuf = null, sbuf = null, attrBG = null;
      try {
        if (pulled) {
          // 4095 = 1365 tris. Large non-indexed draws still saw vertex_index=0
          // on this adapter; car-sized pieces do not.
          const PIECE = 4095;
          if (pulled.count > PIECE) {
            const pieces = [];
            for (let off = 0; off < pulled.count; off += PIECE) {
              let n = Math.min(PIECE, pulled.count - off);
              n -= n % 3;
              if (n <= 0) continue;
              const vert = pulled.vert.slice(off * VERTEX_FLOATS, (off + n) * VERTEX_FLOATS);
              const attr = pulled.attr.slice(off * 4, (off + n) * 4);
              // Own authored (mat,s,x,hw) — do not share the LUT bind group.
              // vertex_index is 0..n-1 on the expanded piece; dashes need
              // those values interpolated, not 32×32 nearest-bin.
              pieces.push(_meshFromPull(vert, attr, n, b.indexFormat));
            }
            const head = pieces[0] || { vbuf: null, sbuf: null, attrBG: null, count: 0 };
            return {
              _wgx: "mesh", vbuf: head.vbuf, ibuf: null, sbuf: head.sbuf, attrBG: head.attrBG,
              count: head.count, indexFormat: b.indexFormat, chunks: null, pieces,
              // Road-LUT ownership: on this path the LUT sbuf is referenced
              // only through the global bind group — without an owner it
              // leaked ~262 KB per track rebuild. freeMesh destroys it.
              lutSbuf: lut && lut.sbuf, lutAttrBG: lut && lut.attrBG,
            };
          }
          const m = _meshFromPull(pulled.vert, pulled.attr, pulled.count, b.indexFormat);
          return Object.assign({ _wgx: "mesh", lutSbuf: lut && lut.sbuf, lutAttrBG: lut && lut.attrBG }, m);
        }
        vbuf = _mkBuffer(b.vert, GPUBufferUsage.VERTEX);
        ibuf = _mkBuffer(b.idx, GPUBufferUsage.INDEX);
        const a = lut || _makeAttrBG(b.attr);
        sbuf = a.sbuf; attrBG = a.attrBG;
      } catch (e) {
        try { if (vbuf) vbuf.destroy(); } catch (_) { /* already invalid */ }
        try { if (sbuf) sbuf.destroy(); } catch (_) { /* already invalid */ }
        _allocFail("createMesh", e);
        return { _wgx: "mesh", vbuf: null, ibuf: null, sbuf: null, attrBG: null, count: 0, indexFormat: b.indexFormat, chunks: null };
      }
      return { _wgx: "mesh", vbuf, ibuf, sbuf, attrBG, count: b.count, indexFormat: b.indexFormat, chunks: null };
    }
    // Textured decal mesh: interleave pos3+nrm3+uv2 -> stride-32 vbuf +
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
      let vbuf = null, ibuf = null;
      try {
        vbuf = _mkBuffer(inter, GPUBufferUsage.VERTEX);
        ibuf = _mkBuffer(idx, GPUBufferUsage.INDEX);
      } catch (e) {
        try { if (vbuf) vbuf.destroy(); } catch (_) { /* already invalid */ }
        _allocFail("createTexMesh", e);
        return { _wgx: "texmesh", _phase: 4 };
      }
      return { _wgx: "texmesh", vbuf, ibuf, count: idx.length, indexFormat: idx instanceof Uint32Array ? "uint32" : "uint16" };
    }

    // Chunked mesh: spatial XZ cells with AABBs (port of GLX.createChunkedMesh).
    // Road (has trk) expands once, then bins the non-indexed triangle list.
    // Camera + env now frustum-cull those cells the same way as terrain
    // (near is GL clip w+z — the old WebGPU z>=0 extract is gone). Shadow
    // casts already cull AABBs in castShadowChunked.
    // Props/glass share one IBO; chunks are ranges (firstIndex + count).
    function createChunkedMesh(data, cellSize) {
      const cell = cellSize > 0 ? cellSize : 72;
      const pos = toF32(data.pos);
      const vCount = pos.length / 3, big = vCount > 65535;
      const srcIdx = data.idx;
      const triCount = (srcIdx.length / 3) | 0;
      if (triCount < 2000) { const m = createMesh(data); m.chunks = null; return m; }
      if (data.trk && data.trk.length >= vCount * 3) {
        const b = _interleave(data);
        const pulled = _expandPull(b.vert, b.attr, b.idx);
        const lut = _makeRoadLUT(data.pos, data.trk, data.mat);
        const buckets = new Map();
        const pv = pulled.vert, VF = VERTEX_FLOATS;
        for (let t = 0; t < pulled.count; t += 3) {
          const ao = t * VF, bo = (t + 1) * VF, co = (t + 2) * VF;
          const ax = pv[ao], ay = pv[ao + 1], az = pv[ao + 2];
          const bx = pv[bo], by = pv[bo + 1], bz = pv[bo + 2];
          const cx = pv[co], cy = pv[co + 1], cz = pv[co + 2];
          const gx = Math.floor(((ax + bx + cx) / 3) / cell) + 1024;
          const gz = Math.floor(((az + bz + cz) / 3) / cell) + 1024;
          const key = gx * 4096 + gz;
          let bk = buckets.get(key);
          if (!bk) { bk = { idx: [], mn: [Infinity, Infinity, Infinity], mx: [-Infinity, -Infinity, -Infinity] }; buckets.set(key, bk); }
          bk.idx.push(t, t + 1, t + 2);
          const mn = bk.mn, mx = bk.mx;
          if (ax<mn[0])mn[0]=ax; if (ax>mx[0])mx[0]=ax; if (ay<mn[1])mn[1]=ay; if (ay>mx[1])mx[1]=ay; if (az<mn[2])mn[2]=az; if (az>mx[2])mx[2]=az;
          if (bx<mn[0])mn[0]=bx; if (bx>mx[0])mx[0]=bx; if (by<mn[1])mn[1]=by; if (by>mx[1])mx[1]=by; if (bz<mn[2])mn[2]=bz; if (bz>mx[2])mx[2]=bz;
          if (cx<mn[0])mn[0]=cx; if (cx>mx[0])mx[0]=cx; if (cy<mn[1])mn[1]=cy; if (cy>mx[1])mx[1]=cy; if (cz<mn[2])mn[2]=cz; if (cz>mx[2])mx[2]=cz;
        }
        const PIECE = 4095;
        const chunks = [];
        try {
          buckets.forEach((bk) => {
            const nAll = bk.idx.length;
            for (let off = 0; off < nAll; off += PIECE) {
              let n = Math.min(PIECE, nAll - off);
              n -= n % 3;
              if (n <= 0) continue;
              const vert = new Float32Array(n * VF);
              for (let j = 0; j < n; j++) {
                const src = bk.idx[off + j] * VF;
                for (let k = 0; k < VF; k++) vert[j * VF + k] = pv[src + k];
              }
              const cv = _mkBuffer(vert, GPUBufferUsage.VERTEX);
              chunks.push({
                vbuf: cv, ibuf: null, count: n, min: bk.mn, max: bk.mx,
                sbuf: lut.sbuf, attrBG: lut.attrBG,
              });
            }
          });
        } catch (e) {
          for (const c of chunks) {
            try { if (c.vbuf) c.vbuf.destroy(); } catch (_) { /* already invalid */ }
          }
          try { if (lut && lut.sbuf) lut.sbuf.destroy(); } catch (_) { /* already invalid */ }
          _allocFail("createChunkedMesh", e);
          return { _wgx: "chunked", vbuf: null, ibuf: null, sbuf: null, attrBG: null, chunks: [], count: 0, indexFormat: b.indexFormat };
        }
        if (lut) _rememberRoadLut(lut);
        if (data._keepFullGeometry === false) data.nrm = data.col = data.mat = data.trk = null;
        if (!data._keepPositions) { data.pos = null; data.idx = null; }
        const head = chunks[0] || { vbuf: null, sbuf: null, attrBG: null, count: 0 };
        return {
          _wgx: "chunked", vbuf: head.vbuf, ibuf: null,
          sbuf: lut.sbuf, attrBG: lut.attrBG, chunks,
          count: head.count, indexFormat: b.indexFormat,
        };
      }
      const b = _interleave(data);
      const IndexArray = big ? Uint32Array : Uint16Array;
      const indexFormat = big ? "uint32" : "uint16";
      const BPI = big ? 4 : 2;
      let vbuf = null, sbuf = null, attrBG = null, ibuf = null;
      try {
        vbuf = _mkBuffer(b.vert, GPUBufferUsage.VERTEX);
      } catch (e) {
        try { if (vbuf) vbuf.destroy(); } catch (_) { /* already invalid */ }
        _allocFail("createChunkedMesh", e);
        return { _wgx: "chunked", vbuf: null, sbuf: null, attrBG: null, chunks: [], count: 0, indexFormat };
      }
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
      let total = 0;
      buckets.forEach((bk) => { total += bk.idx.length; });
      const packed = new IndexArray(total);
      const chunks = [];
      let off = 0;
      buckets.forEach((bk) => {
        const src = bk.idx;
        for (let i = 0; i < src.length; i++) packed[off + i] = src[i];
        chunks.push({
          firstIndex: off, byteOffset: off * BPI, count: src.length,
          indexFormat, min: bk.mn, max: bk.mx,
        });
        off += src.length;
        bk.idx = null;
      });
      try {
        ibuf = _mkBuffer(packed, GPUBufferUsage.INDEX);
        const a = _makeAttrBG(b.attr);
        sbuf = a.sbuf; attrBG = a.attrBG;
        for (let i = 0; i < chunks.length; i++) {
          chunks[i].ibuf = ibuf;
          chunks[i].sbuf = sbuf;
          chunks[i].attrBG = attrBG;
        }
      } catch (e) {
        // Partial chunk set under memory pressure: release everything — a
        // half-uploaded prop mesh must not pin buffers on a struggling device.
        try { vbuf.destroy(); } catch (_) { /* already invalid */ }
        try { if (ibuf) ibuf.destroy(); } catch (_) { /* already invalid */ }
        try { if (sbuf) sbuf.destroy(); } catch (_) { /* already invalid */ }
        _allocFail("createChunkedMesh", e);
        return { _wgx: "chunked", vbuf: null, sbuf: null, attrBG: null, chunks: [], count: 0, indexFormat };
      }
      // Release only after the complete chunk upload succeeds. A failed upload
      // can then fall back to createMesh without finding its source nulled.
      if (data._keepFullGeometry === false) data.nrm = data.col = data.mat = data.trk = null;
      if (!data._keepPositions) { data.pos = null; data.idx = null; }
      return { _wgx: "chunked", vbuf, ibuf, sbuf, attrBG, chunks, count: total, indexFormat };
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
        } catch (_) { return null; /* 1×1 fallback itself failed: composite dirt binding stays unset */ }
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
      } catch (_) { return _blackFallback(); /* dirt-map canvas/upload failed: composite samples black 1×1 */ }
    }

    // 2D texture (decal atlas): upload an ImageBitmap/canvas/ImageData
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
      } catch (_) { return { _wgx: "texture", _phase: 4 }; /* upload failed: caller treats as inert token */ }
    }

    function freeMesh(m) {
      if (!m) return;
      // Road-LUT owner (createMesh road path): destroy the LUT sbuf and, if
      // the global bind group still points at it, clear that too — binding a
      // destroyed buffer is a per-draw validation error.
      if (m.lutSbuf) {
        try { m.lutSbuf.destroy(); } catch (_) { /* already destroyed */ }
        if (m.lutAttrBG && m.lutAttrBG === _roadLutBG) { _roadLutBG = null; _roadLutReady = false; }
        m.lutSbuf = null;
      }
      if (m.pieces) {
        for (let i = 0; i < m.pieces.length; i++) freeMesh(m.pieces[i]);
        return;
      }
      if (m.vbuf) m.vbuf.destroy();
      if (m.sbuf) m.sbuf.destroy();
      if (m.ibuf) m.ibuf.destroy();
    }
    function freeChunkedMesh(m) {
      if (!m) return;
      // Drop the lamp-table segment (and any overflow sentinel) keyed on this
      // chunks array — a rebuilt mesh must re-resolve, not inherit stale state.
      if (m.chunks) _ciSeg.delete(m.chunks);
      if (m.vbuf) m.vbuf.destroy();
      if (m.ibuf) m.ibuf.destroy();
      if (m.sbuf) m.sbuf.destroy();
      if (m.chunks) {
        for (let i = 0; i < m.chunks.length; i++) {
          const c = m.chunks[i];
          try { if (c.ibuf && c.ibuf !== m.ibuf) c.ibuf.destroy(); } catch (_) { /* already destroyed */ }
          try { if (c.vbuf && c.vbuf !== m.vbuf) c.vbuf.destroy(); } catch (_) { /* already destroyed */ }
          try { if (c.sbuf && c.sbuf !== m.sbuf) c.sbuf.destroy(); } catch (_) { /* already destroyed */ }
        }
      }
    }
    function freeTexture(t) { if (t && t.texture) t.texture.destroy(); }

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
      // Post/FX frame extras.
      frameSunDir = f.sunDir || null;
      frameSunColor = f.sunColor || null;
      frameProjRaw = f.proj || null;
      frameSunVS = f.sunViewDir || null;
      frameUpVS = f.upViewDir || null;
      frameTime = f.time != null ? f.time : 0;
      if (f.invProj && f.invProj.length >= 16) { _mul4(frameInvProjW, f.invProj, Z01INV); frameHaveProj = true; }
      else frameHaveProj = false;
      const T = f.tune || null;
      frameTune = T;
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
      // lockstep with it. Packed into params2.y; wgsl-chunks early-outs all
      // PCF/blocker taps when this fades to <= 0 (GLX uShadowStr parity).
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
      // pcssPen is the GLX PENUMBRA-RATE knob (default 80). WGSL findBlocker
      // uses the same `clamp((refD-zb)*params4.x,0,1)` as GLX sampleShadow —
      // pack the raw knob, do not remap.
      d[80] = (T && T.pcssPen != null) ? T.pcssPen : 80;
      d[81] = (T && T.shadowTintAmt != null) ? T.shadowTintAmt : 0.0;
      d[82] = (T && T.carReflect != null) ? T.carReflect : 0.0;
      d[83] = _ssrReady ? _frameReflect : 0.0;   // wet-road SSR strength = present opts.reflect (GLX), 0 until the SSR pass is ready
      // params5 (floats 84..87): envProbeStr — the REAL cube probe's strength, live only
      // after a full 6-face capture (_envProbeLive) and driven by the CAR ENV REFLECTION
      // tuner (carEnvCube). 0 keeps Block 7 on the cheap analytic-sky reflection.
      d[84] = (_envProbeLive && !f.noEnv && T && T.carEnvCube != null) ? T.carEnvCube : 0.0;
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
      // shadowCtr (floats 88..91): xyz = the UNSNAPPED forward-biased box snap
      // (game.js); LIT/WGSL fade uses eye XZ + this Y so yaw does not sweep it.
      // w = shadowRange (SHADOW DISTANCE, box half-size m — same 80 fallback
      // as GLX uShadowRange).
      const sctr = f.shadowCtr || f.eye || [0, 0, 0];
      d[88] = sctr[0]; d[89] = sctr[1]; d[90] = sctr[2];
      d[91] = (T && T.shadowRange != null) ? T.shadowRange : 80.0;   // same fallback as GLX uShadowRange
      // params6 (floats 92..95): wet-surface darkening (.x), carBiasScale when
      // the car caster armed (.y — GLX uCarBiasScale = cBox/42 from game.js;
      // 0 when unarmed so the >0.5 gate still works), CAR SPARKLE (.z), FOG SUN
      // CORE (.w).
      d[92] = (T && T.wetDark != null) ? T.wetDark : 1.0;
      d[93] = _carShadowArmed ? (_carBoxScale || 1.0) : 0.0;
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
      // params9 (floats 136..139): LIT tuner knobs that used to have no FrameU
      // lane. Always pack the resolved value — WGSL reads them directly, so 0
      // is a real "off", not an unset slot. Defaults = shipped GLX look.
      d[136] = (T && T.ambContactDark != null) ? T.ambContactDark : 1.0;
      d[137] = (T && T.lampWallSpill  != null) ? T.lampWallSpill  : 1.0;
      d[138] = (T && T.windowSunFlash != null) ? T.windowSunFlash : 1.0;
      d[139] = (T && T.skyRimGlow     != null) ? T.skyRimGlow     : 1.0;
      // params10.x — the armed shadow lamp as an ABSOLUTE index into the baked
      // track set (frame.allLights), so the per-chunk loop's shadow gate is a
      // plain integer compare with no slot remap. Same baked-position match
      // GLX chunked does: setFrameLights copies positions verbatim (flicker
      // scales rgb only), and the appended tail range is excluded.
      let _absShadowIdx = -1;
      const _AL = f.allLights;
      if (_lampShadowArmed && _lampIdx >= 0 && L && _AL &&
          !(f.tailCount > 0 && _lampIdx >= f.tailStart)) {
        const so = _lampIdx * 15;
        const lx = L[so], ly = L[so + 1], lz = L[so + 2];
        for (let p = 0; p < _AL.length; p += 15) {
          if (_AL[p] === lx && _AL[p + 1] === ly && _AL[p + 2] === lz) { _absShadowIdx = p / 15; break; }
        }
      }
      d[140] = _absShadowIdx;
      device.queue.writeBuffer(frameUBO, 0, frameData);

      // Lights: flat stride-15 -> 4×vec4 per light (verbatim field map).
      // Piggyback the lamp-mask generation on this pack: the chunk masks
      // depend only on pos.xyz + radius per ranked slot (flicker scales rgb),
      // and those lanes are compared against last frame's pack right before
      // being overwritten — 4 compares × nL, vs the visibleChunks × nL AABB
      // tests the generation lets drawChunked's cache skip.
      let _lmMoved = nL !== frameNL;
      if (nL > 0) {
        const ld = lightData;
        for (let i = 0; i < nL; i++) {
          const o = i * 15, b = i * 16;
          if (!_lmMoved && (ld[b] !== L[o] || ld[b+1] !== L[o+1] || ld[b+2] !== L[o+2] || ld[b+3] !== L[o+6])) _lmMoved = true;
          ld[b]    = L[o];    ld[b+1]  = L[o+1];  ld[b+2]  = L[o+2];  ld[b+3]  = L[o+6];  // pos.xyz, rad
          ld[b+4]  = L[o+3];  ld[b+5]  = L[o+4];  ld[b+6]  = L[o+5];  ld[b+7]  = L[o+12]; // col.rgb, bleed
          ld[b+8]  = L[o+7];  ld[b+9]  = L[o+8];  ld[b+10] = L[o+9];  ld[b+11] = L[o+13]; // dir.xyz, volW
          ld[b+12] = L[o+10]; ld[b+13] = L[o+11]; ld[b+14] = L[o+14]; ld[b+15] = 0;       // cosIn, cosOut, glareW
        }
        device.queue.writeBuffer(lightSBO, 0, lightData, 0, nL * 16);
      }
      if (_lmMoved) _lmGen++;

      frameViewProj = f.viewProj || null;
      frameEye = f.eye || null;
      frameCullDist = f.cullDist || 0;
      framePerChunk = +f.perChunkLights || 0;
      frameAllLights = f.allLights || null;
      // (Re)upload the baked track set when the (lights identity, knob) pair
      // moves — rgb × knob applied here ONCE (per-chunk sets render raw baked
      // records × the knob dimmer; no twilight ramp/flicker, GLX parity), so
      // the buffer is static until the next bake. A moved pair also resets
      // the chunkIdx segment allocator: every mesh re-appends on next draw.
      if (framePerChunk > 0 && frameAllLights &&
          (_tlSrc !== frameAllLights || _tlKnob !== framePerChunk)) {
        const AL = frameAllLights, k = framePerChunk;
        const tn = Math.min(TRACK_LIGHT_CAP, (AL.length / 15) | 0), td = _tlScratch;
        for (let i = 0; i < tn; i++) {
          const o = i * 15, b = i * 16;
          td[b]    = AL[o];        td[b+1]  = AL[o+1];      td[b+2]  = AL[o+2];  td[b+3]  = AL[o+6];
          td[b+4]  = AL[o+3] * k;  td[b+5]  = AL[o+4] * k;  td[b+6]  = AL[o+5] * k;  td[b+7]  = AL[o+12];
          td[b+8]  = AL[o+7];      td[b+9]  = AL[o+8];      td[b+10] = AL[o+9];  td[b+11] = AL[o+13];
          td[b+12] = AL[o+10];     td[b+13] = AL[o+11];     td[b+14] = AL[o+14]; td[b+15] = 0;
        }
        if (tn > 0) device.queue.writeBuffer(trackLightSBO, 0, td, 0, tn * 16);
        _tlSrc = frameAllLights; _tlKnob = framePerChunk;
        _ciCursor = 0; _ciSeg = new WeakMap();
      }
      frameLights = nL > 0 ? L : null;
      frameNL = nL;
      _fcPlanesIsFrame = false;   // viewProj (re)written — the shared plane scratch is stale
    }

    // Sky uniform upload (SkyU; consumed by drawSky). Accepts a frame or sky obj.
    function _writeSky(f) {
      const ivp = f.invViewProj || IDENT;
      skyData.set(ivp.length === 16 ? ivp : (ivp.length > 16 && ivp.subarray ? ivp.subarray(0, 16) : IDENT), 0);
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
      // p5.x: CLOUD DEFINITION (GLX uCloudDef). 0 is a valid "soft smear".
      skyData[56]=f.cloudDef      != null ? f.cloudDef      : 1;
      // p5.y: storm lightning flash 1→0 (frameSky.lightning from game.js).
      skyData[57]=f.lightning    != null ? f.lightning    : 0;
      skyData[58]=0; skyData[59]=0;
      device.queue.writeBuffer(skyUBO, 0, skyData);
    }

    let encoder = null, litPass = null, currentView = null, _drawSlot = 0;
    function begin(frame) {
      if (_lost) return false;
      try {
        lastFrame = frame || null;
        if (width < 1) resize();
        ensureTargets();
        if (!sceneView) return false;
        _drawSlot = 0;
        _fxQuadSlot = 0; _fxDecalSlot = 0; _fxQuadOverflow = 0;
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
      } catch (e) {
        // Device dying mid-begin used to throw into tick() ("Caught @ tick")
        // and THEN device.lost reloaded onto GLX — the overlay crash.
        _jsStrike("begin", e);
        return false;
      }
    }

    function drawSky(sky) {
      if (!litPass) return;
      _writeSky(sky || lastFrame || {});
      _setPipe(litPass, (_passSamples > 1 && skyPipelineMS) ? skyPipelineMS : skyPipeline);
      _setBG0(litPass, skyBindGroup);
      litPass.draw(3, 1, 0, 0);
    }

    // Write model + material into the per-draw CPU ring slot (no GPU upload yet).
    function _writeDraw(slot, model, opts) {
      const base = slot * DRAW_F32_STRIDE;
      const d = drawRing;
      d.set(model && model.length === 16 ? model : (model && model.length > 16 && model.subarray ? model.subarray(0, 16) : IDENT), base);
      const o = opts || {};
      d[base + 16] = o.emissive  != null ? o.emissive  : 0;
      d[base + 17] = o.alpha     != null ? o.alpha     : 1;
      d[base + 18] = o.roughness != null ? o.roughness : 0.7;
      d[base + 19] = o.metalness != null ? o.metalness : 0;
      d[base + 20] = o.specular  != null ? o.specular  : 0.5;
      d[base + 21] = o.detail    != null ? o.detail    : 0;
      d[base + 22] = o.clearcoat != null ? o.clearcoat : 0;
      d[base + 23] = o.carPaint  != null ? o.carPaint  : 0;
      d[base + 24] = o.sparkle   != null ? o.sparkle   : 1;
      d[base + 25] = o._instanced ? 1 : 0;
      d[base + 26] = o.surfaceId != null ? o.surfaceId : 0;
      // Floor/terrain over the ribbon: WGX depth loses the road, so fs_main
      // discards the LUT footprint. Never set this on cars/props (mat2.w).
      d[base + 27] = o.buryRibbon ? 1 : 0;
      // Lamp masks (DrawU.mat3.xy, lanes 28-29): all-ones = no cull. Ring
      // slots are reused across frames, so every writer must set them — a
      // stale chunk mask on a car draw would silently unlight it. drawChunked
      // overwrites per run.
      d[base + 28] = LAMP_MASK_ALL; d[base + 29] = LAMP_MASK_ALL;
      // lampRange (DrawU lanes 32-34): zeroed for EVERY draw — a stale
      // per-chunk range from a prior chunked draw would silently rebind that
      // chunk's lamp slice. drawChunked overwrites when per-chunk is active.
      d[base + 32] = 0; d[base + 33] = 0; d[base + 34] = 0;
    }
    // One (or ranged) writeBuffer for every slot filled this pass — call before
    // litPass.end(). writeBuffer is queue-ordered before submit, so draws
    // recorded earlier still see the data.
    function _flushDrawUBO() {
      if (!drawUBO || _drawSlot <= 0) return;
      // Clamp: the slot counter keeps counting past the ring on overflow
      // frames (draws beyond the cap are skipped, not recorded), and an
      // unclamped length would write past drawRing's end — a synchronous
      // OperationError inside present() reads as a device strike.
      device.queue.writeBuffer(drawUBO, 0, drawRing, 0, Math.min(_drawSlot, MAX_DRAWS) * DRAW_F32_STRIDE);
    }
    function _flushQuadFxUBO() {
      if (!quadFxUBO || _fxQuadSlot <= 0) return;
      // Clamp: _fxQuadSlot keeps counting past the ring on overflow frames, and
      // an unclamped length would write past quadFxRing's end.
      const nQ = Math.min(_fxQuadSlot, FX_QUAD_SLOTS);
      device.queue.writeBuffer(quadFxUBO, 0, quadFxRing, 0, nQ * FX_F32_STRIDE);
      if (_fxQuadOverflow) Log.warn("gfx", "WGX fx-quad ring overflow: " + _fxQuadOverflow + " stamp(s) dropped");
    }
    function _flushDecalUBO() {
      if (!decalUBO || _fxDecalSlot <= 0) return;
      // Same clamp as the quad flush above — the counter outruns the ring.
      device.queue.writeBuffer(decalUBO, 0, decalFxRing, 0, Math.min(_fxDecalSlot, FX_DECAL_SLOTS) * FX_F32_STRIDE);
    }
    // All three lit-pass rings share one encoder. Flush together before end()
    // so a future End site cannot upload draws and forget FX (or the reverse).
    function _flushLitRings() {
      _flushDrawUBO();
      _flushQuadFxUBO();
      _flushDecalUBO();
    }
    // Redundant-state filter. Consecutive draws nearly always share the
    // pipeline, group 0, and vertex buffers, but every call was recorded and
    // Dawn-validated anyway — measured live (Monza race frame): 251
    // setPipeline / 720 setBindGroup / 568 setVertexBuffer for ~320 draws.
    // The cache lives as expandos on the ENCODER: a new pass is a new wrapper
    // object, so state resets itself and no per-pass bookkeeping can go
    // stale. Every state call on a cached pass MUST route through these
    // helpers — a raw pass.setPipeline beside them would silently desync.
    function _setPipe(pass, p) {
      if (pass.__pipe !== p) { pass.setPipeline(p); pass.__pipe = p; }
    }
    function _setBG0(pass, bg, dyn) {
      // A dynamic-offset group 0 (fx quad/decal rings) re-sets every call and
      // poisons the cache so the next plain group 0 always re-binds.
      if (dyn) { pass.setBindGroup(0, bg, dyn); pass.__bg0 = null; return; }
      if (pass.__bg0 !== bg) { pass.setBindGroup(0, bg); pass.__bg0 = bg; }
    }
    function _setVB0(pass, buf) {
      if (pass.__vb0 !== buf) { pass.setVertexBuffer(0, buf); pass.__vb0 = buf; }
    }
    function _setVB1(pass, buf) {
      if (pass.__vb1 !== buf) { pass.setVertexBuffer(1, buf); pass.__vb1 = buf; }
    }
    // Slot 0 = pos/nrm/col (stride 36), slot 1 = instance.
    // Group 2 = mat+trk storage (vertex_index). Road draws bind the piece's
    // authored buffer; bury/floor keep the world LUT (magic 12345).
    function _bindLitVerts(pass, vbuf, instBuf, attrBG, authored) {
      _setVB0(pass, vbuf);
      _setVB1(pass, instBuf || identInstanceBuf);
      // Always the world LUT when one exists. Authored storage[vid] + a
      // location-3 interpolator shards dashes on Dawn (measured). Floor
      // bury and road markings both read trkFromWorld(wpos). `authored`
      // stays in the signature so call sites do not drift.
      const bg2 = _roadLutBG || attrBG || zeroAttrBG;
      if (pass.__bg2 !== bg2) { pass.setBindGroup(2, bg2); pass.__bg2 = bg2; }
      void authored;
    }

    // Coplanar terrain wins depth on SwiftShader-Dawn even when the road ribbon
    // draws second with negative bias. Push detail-bearing ground draws away.
    // Pooled: the allocating branch fired on exactly the most common draws
    // (road forces doubleSided, every detail>0.2 mesh gets a bias), so a city
    // track paid 2-3 fresh objects × hundreds of draws × 60 fps — the same GC
    // class the instanced path's _instDrawOpts pooling already fixed. The bag
    // is consumed synchronously by _writeDraw/_litPipeline within the call.
    const _litOptsBag = {
      emissive: 0, alpha: 1, roughness: 0.7, metalness: 0, specular: 0.5,
      detail: 0, clearcoat: 0, carPaint: 0, sparkle: 1, _instanced: false,
      surfaceId: 0, buryRibbon: false, depthBias: null, doubleSided: false,
      noAlphaWrite: false, decal: false, depthCompare: undefined,
    };
    const _BIAS_BURY = [5, 10], _BIAS_DETAIL = [3, 6];
    function _litOpts(opts) {
      const o = opts || {};
      let bias = o.depthBias !== undefined ? o.depthBias : null;
      let dbl = !!o.doubleSided;
      if (o.buryRibbon) bias = _BIAS_BURY;
      else if (!o.depthBias && !o.surfaceId && (o.detail || 0) > 0.2) bias = _BIAS_DETAIL;
      if (o.surfaceId === 16) {
        // Winding is already swapped in _expandPull; doubleSided lets the
        // underside/skirts z-fight the top (chopped asphalt). Do NOT mark
        // decal/always-pass and do NOT keep GL [-8,-16] — those bury tyres.
        // No road bias: later car draws win the contact; buryRibbon terrain
        // sits behind so LUT misses cannot punch holes in the tarmac.
        dbl = true;
        bias = null;
      }
      if (bias === (o.depthBias !== undefined ? o.depthBias : null) && dbl === !!o.doubleSided) return o;
      const b = _litOptsBag;
      b.emissive = o.emissive; b.alpha = o.alpha; b.roughness = o.roughness;
      b.metalness = o.metalness; b.specular = o.specular; b.detail = o.detail;
      b.clearcoat = o.clearcoat; b.carPaint = o.carPaint; b.sparkle = o.sparkle;
      b._instanced = o._instanced; b.surfaceId = o.surfaceId;
      b.buryRibbon = o.buryRibbon; b.noAlphaWrite = o.noAlphaWrite;
      b.decal = o.decal; b.depthCompare = o.depthCompare;
      b.depthBias = bias; b.doubleSided = dbl;
      return b;
    }

    function draw(mesh, model, opts) {
      if (!litPass || !mesh || !mesh.vbuf) return;
      const o = _litOpts(opts);
      const slot = _drawSlot++;
      if (slot >= MAX_DRAWS) return;
      _writeDraw(slot, model, o);
      _setPipe(litPass, _litPipeline(o));
      _setBG0(litPass, _activeFrameBG);
      _dynOff[0] = slot * DRAW_STRIDE;
      litPass.setBindGroup(1, drawBindGroup, _dynOff);
      if (mesh.pieces) {
        for (let i = 0; i < mesh.pieces.length; i++) {
          const p = mesh.pieces[i];
          _bindLitVerts(litPass, p.vbuf, identInstanceBuf, p.attrBG, o.surfaceId === 16);
          _drawGeom(litPass, p);
        }
        return;
      }
      _bindLitVerts(litPass, mesh.vbuf, identInstanceBuf, mesh.attrBG, o.surfaceId === 16);
      _drawGeom(litPass, mesh);
    }

    function drawChunked(mesh, model, opts) {
      if (!litPass || !mesh || !mesh.vbuf) return;
      const o = _litOpts(opts);
      const slot = _drawSlot++;
      if (slot >= MAX_DRAWS) return;
      _writeDraw(slot, model, o);
      _setPipe(litPass, _litPipeline(o));
      _setBG0(litPass, _activeFrameBG);
      _dynOff[0] = slot * DRAW_STRIDE;
      litPass.setBindGroup(1, drawBindGroup, _dynOff);
      if (!mesh.chunks) {
        // hasTrk roads are createMesh pieces (chunks=null). Drawing only
        // mesh.vbuf here left 4095 verts — the rest of the ribbon vanished
        // and terrain showed through (chopped asphalt).
        if (mesh.pieces) {
          for (let i = 0; i < mesh.pieces.length; i++) {
            const p = mesh.pieces[i];
            _bindLitVerts(litPass, p.vbuf, identInstanceBuf, p.attrBG, o.surfaceId === 16);
            _drawGeom(litPass, p);
          }
          return;
        }
        _bindLitVerts(litPass, mesh.vbuf, identInstanceBuf, mesh.attrBG, o.surfaceId === 16);
        _drawGeom(litPass, mesh);
        return;
      }
      // Road (surfaceId 16) uses the same frustum + radial cull as terrain.
      // The skip existed because a WebGPU z>=0 extract on the raw GL VP hid
      // chase/park chunks; near is now GL clip w+z (see _extractPlanes) so
      // the exemption was leftover work — env-probe 300 m was thrown away.
      const cull = !!frameViewProj;
      // _fcPlanes is scratch shared with the shadow extracts below; the flag
      // says it currently holds THIS frame's camera planes. Terrain, road,
      // props, glass and water each re-derived the same six planes per frame.
      if (cull && !_fcPlanesIsFrame) { _extractPlanes(frameViewProj, _fcPlanes); _fcPlanesIsFrame = true; }
      const cd = frameCullDist, cd2 = cd * cd;
      const ex = frameEye ? frameEye[0] : 0, ey = frameEye ? frameEye[1] : 0, ez = frameEye ? frameEye[2] : 0;
      const chunks = mesh.chunks;
      // Per-chunk lamps: one DrawU slot per visible chunk carrying that chunk's
      // (offset, count) slice of the baked chunkIdxSBO table. The adjacent-run
      // merge is deliberately forfeited here — adjacent chunks almost never
      // share an index list, exactly as GLX gives up its merged drawElements
      // runs in this mode; MAX_DRAWS 4096 has ample headroom (~150 visible
      // chunks measured worst-case). Table segments append per chunks-array;
      // a bake-generation move (_writeFrame) resets the allocator.
      // This branch sits ABOVE the !cull fast path: a frame without a
      // viewProj (menu orbit, headless) must still light per-chunk when the
      // mode is on — it just draws every chunk instead of the visible ones.
      if (framePerChunk > 0 && frameAllLights && typeof LampChunks !== "undefined") {
        let seg = _ciSeg.get(chunks);
        const table = LampChunks.resolve(frameAllLights, chunks, framePerChunk);
        if (!seg || seg.table !== table) {
          const need = table.concat.length;
          if (_ciCursor + need > CHUNK_IDX_CAP) {
            // Overflow (extreme lampDensity): warn ONCE per table — the
            // sentinel (base -1) is remembered so the next frame neither
            // re-warns nor re-attempts the write; the mesh falls through to
            // the global-set merge path below until the bake regenerates.
            try { Log.warn("gfx", "WGX per-chunk lamp table overflow (" + (_ciCursor + need) + " > " + CHUNK_IDX_CAP + ") — mesh keeps the global set"); } catch (_) { /* harness */ }
            seg = { base: -1, table };
            _ciSeg.set(chunks, seg);
          } else {
            if (need > 0) device.queue.writeBuffer(chunkIdxSBO, _ciCursor * 4, table.concat);
            seg = { base: _ciCursor, table };
            _ciSeg.set(chunks, seg);
            _ciCursor += need;
          }
        }
        if (seg.base >= 0) {
          const tbl = seg.table;
          for (let i = 0; i < chunks.length; i++) {
            const ch = chunks[i];
            if (cull) {
              const dist2 = _aabbDist2(ch.min, ch.max, ex, ey, ez);
              if (!_aabbInFrustum(_fcPlanes, ch.min, ch.max) || (cd > 0 && dist2 > cd2)) continue;
            }
            const cslot = _drawSlot++;
            if (cslot >= MAX_DRAWS) break;
            _writeDraw(cslot, model, o);
            const cbase = cslot * DRAW_F32_STRIDE;
            // lampRange lives at lanes 32-34 (lanes 28-29 are the lamp masks).
            drawRing[cbase + 32] = seg.base + tbl.offsets[i];
            drawRing[cbase + 33] = tbl.counts[i];
            drawRing[cbase + 34] = 1;
            _dynOff[0] = cslot * DRAW_STRIDE;
            litPass.setBindGroup(1, drawBindGroup, _dynOff);
            _bindLitVerts(litPass, ch.vbuf || mesh.vbuf, identInstanceBuf, ch.attrBG || mesh.attrBG, o.surfaceId === 16);
            _drawGeom(litPass, ch);
          }
          return;
        }
      }
      if (!cull) {
        for (let i = 0; i < chunks.length; i++) {
          const ch = chunks[i];
          _bindLitVerts(litPass, ch.vbuf || mesh.vbuf, identInstanceBuf, ch.attrBG || mesh.attrBG, o.surfaceId === 16);
          _drawGeom(litPass, ch);
        }
        return;
      }
      // Merge runs of adjacent visible chunks that share vbuf/ibuf/attrBG.
      // Map insertion order is IBO order, so summing count from the run's
      // first firstIndex submits the same triangles as the per-chunk loop.
      //
      // Chunk-AABB lamp cull: with a night light set bound, each run gets its
      // OWN draw slot whose mask has a bit only for lights whose radius
      // reaches some chunk of the run — bit-exact vs the shader's radius
      // reject (see the WGSL lamp loop), it just skips the distance math for
      // lights that cannot touch this geometry. The set is re-ranked as the
      // player moves, so masks are computed per call (visible chunks × nL
      // cheap AABB tests); small sets skip the machinery — the reject is
      // already cheap. Run overflow rebinds the base slot (all-ones mask).
      const maskL = frameNL > 8 ? frameLights : null;
      _mrMaskL = maskL; _mrSlot = slot; _mrPass = litPass; _mrRoad = o.surfaceId === 16;
      for (let i = 0; i < chunks.length; i++) {
        const ch = chunks[i];
        const dist2 = _aabbDist2(ch.min, ch.max, ex, ey, ez);
        if (!_aabbInFrustum(_fcPlanes, ch.min, ch.max) || (cd > 0 && dist2 > cd2)) {
          _mrFlush();
          continue;
        }
        if (maskL) {
          // Generation-keyed cache (the LampChunks WeakMap shape): the ranked
          // set is stable for many frames at a time — while _lmGen holds, the
          // chunk's mask is a lookup, not nL AABB tests.
          let cm = _lmCache.get(ch);
          if (cm && cm.gen === _lmGen) {
            _lm0 = cm.m0; _lm1 = cm.m1;
          } else {
            _chunkLampMask(ch.min, ch.max, maskL, frameNL);
            if (cm) { cm.gen = _lmGen; cm.m0 = _lm0; cm.m1 = _lm1; }
            else _lmCache.set(ch, { gen: _lmGen, m0: _lm0, m1: _lm1 });
          }
        }
        const vbuf = ch.vbuf || mesh.vbuf;
        const ibuf = ch.ibuf || mesh.ibuf || null;
        const attrBG = ch.attrBG || mesh.attrBG;
        const run = _mrRun;
        if (run.active && run.vbuf === vbuf && run.ibuf === ibuf && run.attrBG === attrBG) {
          run.count += ch.count;
          if (maskL) { run.m0 |= _lm0; run.m1 |= _lm1; }
        } else {
          _mrFlush();
          run.active = true;
          run.vbuf = vbuf; run.ibuf = ibuf; run.attrBG = attrBG;
          run.count = ch.count;
          run.firstIndex = _chunkFirstIndex(ch);
          run.indexFormat = ch.indexFormat || mesh.indexFormat;
          run.m0 = maskL ? _lm0 : LAMP_MASK_ALL;
          run.m1 = maskL ? _lm1 : LAMP_MASK_ALL;
        }
      }
      _mrFlush();
      // Release the GPU-object refs — the bag survives between calls.
      _mrPass = null; _mrMaskL = null;
      _mrRun.vbuf = _mrRun.ibuf = _mrRun.attrBG = _mrRun.indexFormat = null;
    }
    // Merge-run state for drawChunked, hoisted to module scope and POOLED —
    // the per-call closure + a fresh run object per state change were the same
    // GC class the instanced path's _instDrawOpts pooling (and _litOptsBag)
    // already fixed: hundreds of allocations per frame on a city track. The
    // bag is consumed synchronously within one drawChunked call; refs are
    // nulled at the end of each call.
    const _mrRun = {
      active: false, vbuf: null, ibuf: null, attrBG: null,
      count: 0, firstIndex: 0, indexFormat: null, m0: 0, m1: 0,
    };
    let _mrMaskL = null, _mrSlot = 0, _mrPass = null, _mrRoad = false;
    function _mrFlush() {
      const run = _mrRun;
      if (!run.active) return;
      if (_mrMaskL) {
        const s2 = _drawSlot < MAX_DRAWS ? _drawSlot++ : -1;
        const use = s2 >= 0 ? s2 : _mrSlot;
        if (s2 >= 0) {
          const db = s2 * DRAW_F32_STRIDE, sb = _mrSlot * DRAW_F32_STRIDE;
          drawRing.copyWithin(db, sb, sb + 28);
          drawRing[db + 28] = run.m0;
          drawRing[db + 29] = run.m1;
          // The copy stops at lane 28, so clear the relocated lampRange
          // lanes explicitly — ring slots are reused and a stale
          // lampRange.z=1 from a per-chunk frame would reroute the shader.
          drawRing[db + 32] = 0; drawRing[db + 33] = 0; drawRing[db + 34] = 0;
        }
        _dynOff[0] = use * DRAW_STRIDE;
        _mrPass.setBindGroup(1, drawBindGroup, _dynOff);
      }
      _bindLitVerts(_mrPass, run.vbuf, identInstanceBuf, run.attrBG, _mrRoad);
      _drawGeom(_mrPass, run);
      run.active = false;
    }
    // Two 24-bit mask halves for the lights whose radius reaches an AABB.
    // Written to module scratch (_lm0/_lm1) — one caller, synchronous.
    // _lmGen advances in _writeFrame when any ranked slot's pos/radius moves;
    // _lmCache keys per-chunk masks on it (entries die with their chunk).
    let _lm0 = 0, _lm1 = 0, _lmGen = 0;
    const _lmCache = new WeakMap();
    function _chunkLampMask(mn, mx, L, n) {
      let m0 = 0, m1 = 0;
      for (let i = 0; i < n; i++) {
        const o = i * 15, rad = L[o + 6];
        if (rad > 0 && _aabbDist2(mn, mx, L[o], L[o + 1], L[o + 2]) <= rad * rad) {
          if (i < 24) m0 |= (1 << i); else m1 |= (1 << (i - 24));
        }
      }
      _lm0 = m0; _lm1 = m1;
    }

    // Fallback path: tonemap blit (HDR scene -> swapchain). Used when
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

    // Separable 5-tap gaussian (GLX BLUR_FS). `times` = 1 for SSAO, 2 for god-ray.
    // Each H/V pass gets its own dynamic-offset slot in blurUBO — see _buildPost.
    function _blurSep(pipe, srcView, tmpView, srcBG, tmpBG, texX, texY, times) {
      if (!pipe || !srcView || !tmpView || !srcBG || !tmpBG || !blurUBO) return;
      const n = times || 1;
      const stride = _blurStride || 256;
      const slots = _blurSlots || 16;
      for (let i = 0; i < n; i++) {
        const sx = (1 + i) * texX, sy = (1 + i) * texY;
        const s = postScratch;
        s[0] = sx; s[1] = 0; s[2] = 0; s[3] = 0;
        let off = ((_blurWriteSlot++) % slots) * stride;
        device.queue.writeBuffer(blurUBO, off, s, 0, _Post.BLUR_UNIFORM_BYTES / 4);
        let p = encoder.beginRenderPass({ colorAttachments: [{ view: tmpView, loadOp: "clear",
          clearValue: { r: 0, g: 0, b: 0, a: 1 }, storeOp: "store" }] });
        p.setPipeline(pipe); p.setBindGroup(0, srcBG, [off]); p.draw(3, 1, 0, 0); p.end();
        s[0] = 0; s[1] = sy;
        off = ((_blurWriteSlot++) % slots) * stride;
        device.queue.writeBuffer(blurUBO, off, s, 0, _Post.BLUR_UNIFORM_BYTES / 4);
        p = encoder.beginRenderPass({ colorAttachments: [{ view: srcView, loadOp: "clear",
          clearValue: { r: 0, g: 0, b: 0, a: 1 }, storeOp: "store" }] });
        p.setPipeline(pipe); p.setBindGroup(0, tmpBG, [off]); p.draw(3, 1, 0, 0); p.end();
      }
    }

    // GLX parity (js/render/glx.js envFaceBegin/End): capture ONE cube face of the world
    // around the player car per frame into a real RGBA16F cube; after a full 6-face
    // cycle the LIT car-paint block samples it (Block 7, envProbeStr). game.js re-issues
    // the world draws (track meshes then drawSky, NO cars) between begin/end — they record
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
      // Minimal rung sheds the probe entirely: 6 extra world passes + an
      // rgba16f mip cube is exactly the discretionary load a device that has
      // already died twice cannot carry. game.js checks the null return.
      if (_lost || WGX_MINIMAL || !skyPipeline) return null;
      if (!envCubeTex) envInit();
      _passSamples = 1;
      const F = ENV_FACES[face];
      _envTgt[0] = eye[0] + F[0][0]; _envTgt[1] = eye[1] + F[0][1]; _envTgt[2] = eye[2] + F[0][2];
      M4.lookAtTo(_envView, eye, _envTgt, F[1]);
      M4.perspectiveTo(_envProj, Math.PI / 2, 1, 0.4, 900);
      M4.mulTo(_envVP, _envProj, _envView);   // raw GL view-proj
      M4.invertTo(_envInvVP, _envVP);          // for drawSky ray reconstruction (raw, pre-Z01)
      // Keep probe VP on `frame` until envFaceEnd so drawWorldMeshes culls
      // propBatches against the face frustum (GLX envFaceBegin parity).
      const svVP = frame.viewProj, svEye = frame.eye, svCull = frame.cullDist;
      _envFrame = frame;
      _envSvVP = svVP; _envSvEye = svEye; _envSvCull = svCull;
      frame.viewProj = _envVP; frame.eye = eye;
      // Radial cull for the probe (GLX envFaceBegin): without this a 64²
      // reflection target re-draws the whole 900 m city. Cap at 300 m; keep
      // a tighter main-camera cull when present.
      frame.cullDist = svCull > 0 ? Math.min(svCull, 300) : 300;
      _writeFrame(frame);
      const fc = (frame && frame.fogColor) || [0.5, 0.6, 0.7];
      _envEncoder = device.createCommandEncoder();
      litPass = _envEncoder.beginRenderPass({
        colorAttachments: [{ view: envFaceViews[face], clearValue: { r: fc[0], g: fc[1], b: fc[2], a: 1 },
          loadOp: "clear", storeOp: "store" }],
        depthStencilAttachment: { view: envDepthView, depthClearValue: 1.0, depthLoadOp: "clear", depthStoreOp: "store" },
      });
      encoder = _envEncoder;
      _drawSlot = 0; _fxQuadSlot = 0; _fxDecalSlot = 0; _fxQuadOverflow = 0;
      _activeFrameBG = _envFrameBG;   // placeholder cube while rendering into the real one
      return _envInvVP;
    }

    // Close + submit the face pass. After all six faces the probe goes live: mips
    // are blitted and the main frame group samples the real cube (LIT LOD = rough * maxLod).
    function envFaceEnd(face) {
      if (_envFrame) {
        _envFrame.viewProj = _envSvVP;
        _envFrame.eye = _envSvEye;
        _envFrame.cullDist = _envSvCull;
        _envFrame = null;
      }
      if (!envCubeTex || !litPass || !_envEncoder) return;
      _flushLitRings();
      litPass.end();
      device.queue.submit([_envEncoder.finish()]);
      litPass = null; encoder = null; _envEncoder = null;
      _activeFrameBG = frameBindGroup;
      _envFacesMask |= 1 << face;
      if (_envFacesMask === 63) {
        _envFacesMask = 0;
        // Regenerate mips EVERY completed cube (GLX/TLX parity). Gating this on
        // !_envProbeLive left mip0 updating while higher LODs froze at the first
        // capture — lacquer roughness LOD stayed at the start-line reflection.
        _generateMips(envCubeTex, 6);
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

    // Source: softPresentTex on software adapters (COPY_SRC; swapchain never
    // touched — first getCurrentTexture() breaks mapAsync device-wide), else
    // the swapchain texture. present() encodes copyTextureToBuffer on the
    // frame encoder; _capFinish maps after onSubmittedWorkDone. Optional
    // readback oracle — visible #game is the soft-present 2D blit; prefer
    // gfx-probe.mjs for the primary visible-canvas gate. One request in flight.
    let _capReq = null;
    function capturePixels() {
      if (_lost) return Promise.reject(new Error("device lost"));
      if (_capReq) return Promise.reject(new Error("capture already pending"));
      return new Promise((resolve, reject) => { _capReq = { resolve, reject }; });
    }
    // Encode the readback copy into the FRAME'S OWN encoder (call just before
    // its finish/submit), then start the map after submit. Split in two
    // because present() has TWO exits — the tonemap-blit fallback (post off /
    // perf tier dropped) and the full post chain — and a capture hooked on
    // only one of them starves whenever PerfGov moves the frame to the other.
    function _capEncode() {
      if (!_capReq) return null;
      try {
        const capTex = _softGpu ? softPresentTex : ctx.getCurrentTexture();
        if (!capTex) throw new Error("no frame texture");
        const w = capTex.width, h = capTex.height;
        const bpr = (w * 4 + 255) & ~255;
        const buf = device.createBuffer({ size: bpr * h,
          usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
        encoder.copyTextureToBuffer({ texture: capTex },
          { buffer: buf, bytesPerRow: bpr }, [w, h]);
        // Soft-present renders into LDR_FORMAT (rgba8unorm); the swapchain is
        // `format` (usually bgra8unorm). Record which so the finish swizzles right.
        return { buf, bpr, w, h, bgra: !_softGpu && format === "bgra8unorm" };
      } catch (e) {
        const r = _capReq; _capReq = null; r.reject(e);
        return null;
      }
    }
    // Destroy buffers retired mid-frame (drawParticles VBO growth) now that the
    // frame's submit has consumed their last recorded reference.
    function _retireFlush() {
      for (let i = 0; i < _retiredBufs.length; i++) {
        try { _retiredBufs[i].destroy(); } catch (_) { /* already invalid */ }
      }
      _retiredBufs.length = 0;
    }
    function _capFinish(cap) {
      if (!cap) return;
      const req = _capReq; _capReq = null;
      const { buf, bpr, w, h } = cap;
      const finish = function () {
        buf.mapAsync(GPUMapMode.READ).then(function () {
          const src = new Uint8Array(buf.getMappedRange());
          const out = new Uint8ClampedArray(w * h * 4);
          const bgra = !!cap.bgra;
          for (let y = 0; y < h; y++) {
            const s = y * bpr, d = y * w * 4;
            for (let x = 0; x < w; x++) {
              const si = s + x * 4, di = d + x * 4;
              out[di]     = src[bgra ? si + 2 : si];
              out[di + 1] = src[si + 1];
              out[di + 2] = src[bgra ? si : si + 2];
              out[di + 3] = 255;   // alphaMode "opaque": ignore stored alpha
            }
          }
          try { buf.unmap(); buf.destroy(); } catch (_) { /* device dying */ }
          req.resolve({ width: w, height: h, data: out });
        }, function (e) {
          try { buf.destroy(); } catch (_) { /* device dying */ }
          req.reject(e);
        });
      };
      try {
        device.queue.onSubmittedWorkDone().then(finish, finish);
      } catch (_) { finish(); }
    }

    //    (SSAO -> godray -> bloom -> composite -> FXAA), fall back to the blit. ──
    function present(opts) {
      // Car / lamp shadow maps must be re-armed by a fresh *Begin every frame
      // (GLX parity: SH.lampArmed is snapshotted then cleared in glx/post.js
      // present). LIT already consumed the flags in this frame's _writeFrame;
      // the god-ray pass below still needs this frame's lamp-armed snapshot.
      const lampArmed = _lampShadowArmed;
      _carShadowArmed = false;
      _lampShadowArmed = false;
      _blurWriteSlot = 0;
      _particleFlip = 0;
      // A device lost MID-FRAME used to return here with litPass/encoder still
      // set, and begin() bails before it can clear them — so every later draw()
      // passed its `if (!litPass)` guard and recorded into a pass belonging to a
      // dead device. Harmless while the reload above lands, unbounded when it
      // cannot (see the device.lost handler). Drop the frame state instead.
      if (_lost || !encoder) { litPass = null; encoder = null; currentView = null; return; }
      try {
      if (litPass) { _flushLitRings(); litPass.end(); litPass = null; }
      // Acquire the present target at present time — swapchain on hardware, a
      // COPY_SRC rgba8 target on software (composited to #game via 2D blit).
      try {
        currentView = _acquirePresentView();
        if (!currentView) { litPass = null; encoder = null; currentView = null; return; }
      } catch (_) {
        litPass = null; encoder = null; currentView = null; return;
      }
      _queueOutputProbe();
      const o = opts || {};
      // Depth resolve is only needed when a later pass samples scene depth
      // (SSAO, godray, SSR, flare). Auto-tier 4 night sheds all four.
      const _aoStrEarly = o.ssao != null ? o.ssao : 0;
      const _contactEarly = (o.contact > 0 && frameSunVS) ? o.contact : 0;
      const _haveAOEarly = frameHaveProj && ssaoBG && (_aoStrEarly > 0 || _contactEarly > 0);
      const _grStrEarly = o.godray != null ? o.godray : 0;
      // The godray march multiplies lamp in-scatter by the mist uniform (the
      // in-scatter needs particles to scatter off), so with GROUND MIST at 0
      // it computes an exact 0 — zeroing lampVol sheds the half-res march +
      // blurs + composite operand with bit-identical output (GLX/TLX parity:
      // glx/post.js lampVolPre, tlx-post.js lampVol).
      const _lampVolEarly = ((o.mist || 0) > 0 && o.lampVol != null) ? o.lampVol : 0;
      const _haveGREarly = !!(godrayBG && lastFrame && lastFrame.invViewProj
        && ((!!shadowView && _grStrEarly > 0) || _lampVolEarly > 0));
      // Same operands as the SSR pass below: wet-road OR car lacquer. Omitted
      // carReflect is the 0.05 tuner default (game.js leaves it undefined on
      // HIGH). The first hoist used `o.carReflect ?? 0` and required wetness
      // for the road term, so a dry night skipped pDepthResolve while
      // COMPOSITE still marched car-paint SSR against uncleared MSAA depth.
      const _ssrStrEarly = o.reflect != null ? o.reflect : 0;
      const _carReflEarly = o.carReflect != null ? o.carReflect
        : ((o.tune && o.tune.carReflect != null) ? o.tune.carReflect : 0.05);
      const _wetEarly = (lastFrame && lastFrame.wetness) || 0;
      const _ssrEarly = !!(frameHaveProj && _ssrReady && (
        (_wetEarly > 0.01 && _ssrStrEarly > 0.001) || _carReflEarly > 0.001));
      const _slEarly = frameSunColor
        ? Math.max(frameSunColor[0], frameSunColor[1], frameSunColor[2]) : 1;
      const _flareEarly = !!(frameSunDir && frameSunDir[1] > -0.02 && _slEarly > 0.35);
      const _needDepth = _haveAOEarly || _haveGREarly || _ssrEarly || _flareEarly;
      if (_needDepth && _passSamples > 1 && pDepthResolve && depthMSView && depthView) {
        try {
          if (!depthResolveBG) {
            depthResolveBG = device.createBindGroup({
              layout: pDepthResolve.getBindGroupLayout(0),
              entries: [{ binding: 0, resource: depthMSView }],
            });
          }
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
      // Capture wet-road SSR strength (game.js po.reflect). COMPOSITE consumes
      // this frame's ssrTex in the same present(); _frameReflect still feeds
      // next begin() params4.w for anything that still reads the LIT lane.
      _frameReflect = (o.reflect != null ? o.reflect : 0);
      const exposure = o.exposure != null ? o.exposure : 1.0;

      // Fallback: post disabled / targets absent -> tonemap blit.
      if (!_postReady || !pComposite || !ldrView || bloomLv.length === 0) {
        _tonemapBlit(exposure);
        const disp = _softDisplayEncode();
        const cap = _capEncode();
        try { device.queue.submit(_frameSubmitList(encoder)); }
        catch (e) { _softDisplayAbort(disp); throw e; }
        _retireFlush();
        _capFinish(cap);
        _softDisplayFinish(disp);
        encoder = null; currentView = null;
        _readOutputProbe();
        _jsStrikes = 0;   // a presented frame clears the strike count
        if (!_okCounted) { _okCounted = true; _healTick(); }
        return;
      }

      try {
      const T = o.tune || null;
      // width/height are the size resize() last computed; _texW/_texH are the
      // size ensureTargets() last managed to ALLOCATE. They agree on every frame
      // that allocation succeeded — but its failure path deliberately keeps
      // rendering through the previous target set and retries after a 1 s
      // cooldown, so on a device under memory pressure (the only device that
      // reaches that path) they disagree for up to ~60 frames. Every texel below
      // then describes a texture that is not the one bound: the SSAO/god-ray
      // blur steps march the wrong distance, the bloom bright-pass reads mip 0 at
      // the wrong rate, the composite's sharpen taps land off-pixel, and FXAA
      // edge-detects against a stride that is not its source's. All of it is
      // silent — nothing errors, the frame just degrades exactly when the device
      // could least afford noise. The || fallback covers the pre-first-alloc
      // frame, where _texW is still 0.
      const tw = _texW || width, th = _texH || height;
      const halfW = Math.max(1, tw >> 1), halfH = Math.max(1, th >> 1);
      const sun = _sunScreen();
      const sunUVx = sun ? sun.ux : -2, sunUVy = sun ? sun.uy : -2;

      //    by COMPOSITE this same present() (binding 8). Skipped when dry.
      const _wet = (lastFrame && lastFrame.wetness) || 0;
      // opts.reflect is the governor's SSR shed (game.js: tier >= 2 -> 0). Gating
      // on wetness ALONE kept dispatching the 24-step march on a shed device for
      // every wet lap — the pass ran, the LIT block multiplied its result by a
      // params4.w of 0, and the whole cost was thrown away. That is the shed the
      // player asked for not actually being taken.
      const _ssrStr = o.reflect != null ? o.reflect : 0;
      const _carRefl = o.carReflect != null ? o.carReflect
        : ((T && T.carReflect != null) ? T.carReflect : 0.05);
      // Run when wet-road SSR is live OR car lacquer needs a mirror (GLX composite
      // gates on either path). Dry days still get car-paint SSR.
      // _ssrRan is REMEMBERED for the composite below: when this pass skips
      // (no viewProj this frame, bind group not built yet), ssrTex still holds
      // LAST frame's reflections — the consume lanes must read 0, not march
      // stale mirror data onto this frame's road and paint.
      const _ssrRan = !!(_ssrReady && ssrBG && frameHaveProj &&
          ((_wet > 0.01 && _ssrStr > 0.001) || _carRefl > 0.001));
      if (_ssrRan) {
        const s = postScratch;
        s.set(frameInvProjW, 0);
        s.set(frameProjRaw && frameProjRaw.length >= 16 ? frameProjRaw : IDENT, 16);
        const up = frameUpVS || [0, 1, 0];
        s[32] = up[0]; s[33] = up[1]; s[34] = up[2];
        s[35] = _carRefl;   // upVS.w = carReflect (SSR car-paint gate)
        const ssrThick = (T && T.ssrThick != null) ? T.ssrThick : 0.20;
        // texel = one OUTPUT (half-res) texel: it drives the UV-space march
        // steps AND the nT finite-difference normal stride / self-hit taps
        // against the still-full-res depth — one output texel is the correct
        // stride for both at half res.
        s[36] = 1 / halfW; s[37] = 1 / halfH; s[38] = ssrThick; s[39] = _ssrStr;   // texel, thick, strength
        const skz = (lastFrame && lastFrame.skyZenith) || [0.18, 0.40, 0.78];
        const skh = (lastFrame && lastFrame.skyHorizon) || [0.62, 0.74, 0.88];
        const topUV = (o.ssrTopUV != null) ? o.ssrTopUV : 0.62;
        const ssrNear = (o.ssrNear != null) ? o.ssrNear : -2.5;
        s[40] = skz[0]; s[41] = skz[1]; s[42] = skz[2]; s[43] = topUV;
        s[44] = skh[0]; s[45] = skh[1]; s[46] = skh[2]; s[47] = ssrNear;
        s[48] = (T && T.carGloss != null) ? T.carGloss : 1.0;   // gloss.x = uCarGloss
        // gloss.yz = FULL-res depth texel: the shader's finite-difference
        // normal strides read depthTex (full res); feeding them the half-res
        // OUTPUT texel doubled the stride the edge/self-hit thresholds were
        // tuned at. gloss.w zeroed — postScratch is shared and uploads as-is.
        s[49] = 1 / tw; s[50] = 1 / th; s[51] = 0;
        device.queue.writeBuffer(ssrUBO, 0, s, 0, _Post.SSR_UNIFORM_BYTES / 4);
        const p = encoder.beginRenderPass({ colorAttachments: [{ view: ssrView, loadOp: "clear",
          clearValue: { r: 0, g: 0, b: 0, a: 0 }, storeOp: "store" }] });
        p.setPipeline(pSSR); p.setBindGroup(0, ssrBG); p.draw(3, 1, 0, 0); p.end();
      }

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
      }
      // Composite else-path is now aoV = 1.0 with no fetch (wgsl-post.js), so a
      // skipped SSAO pass does not need a white clear. Stale contents are unread.

      // CPU gates like GLX: sun shaft strength (no on-screen requirement — shafts
      // still light the mist when the sun sits just off-frame) or lamp volumetric.
      const grStr = o.godray != null ? o.godray : 0;
      // mist gate: see _lampVolEarly above — zero mist makes the lamp march an
      // exact 0, so drop the operand and the passes it would arm.
      const lampVol = ((o.mist || 0) > 0 && o.lampVol != null) ? o.lampVol : 0;
      const sunGR = !!shadowView && grStr > 0;
      // GLX/TLX require invViewProj — without it the march uses IDENT and
      // paints garbage shafts on the first / odd present.
      const haveGR = godrayBG && lastFrame && lastFrame.invViewProj
        && (sunGR || lampVol > 0);
      if (haveGR) {
        const s = postScratch;
        const invVP = lastFrame && lastFrame.invViewProj;
        if (invVP && invVP.length >= 16) {
          _grInvTmp.set(invVP.length === 16 ? invVP : (invVP.length > 16 && invVP.subarray ? invVP.subarray(0, 16) : IDENT));
          _mul4(s.subarray(0, 16), _grInvTmp, Z01INV);
        } else s.set(IDENT, 0);
        s.set(_shadowRendered ? shadowLVPData : IDENT, 16);
        s.set(lampArmed ? lampShadowLVPData : IDENT, 32);
        const eye = frameEye || [0, 0, 0];
        s[48] = eye[0]; s[49] = eye[1]; s[50] = eye[2]; s[51] = 0;
        const sd = frameSunDir || [0.3, 0.6, 0.5];
        s[52] = sd[0]; s[53] = sd[1]; s[54] = sd[2]; s[55] = 0;
        const sc = frameSunColor || [1, 0.95, 0.85];
        s[56] = sc[0]; s[57] = sc[1]; s[58] = sc[2]; s[59] = 0;
        s[60] = sunGR ? grStr : 0;
        s[61] = lampVol;
        s[62] = o.mist != null ? o.mist : 0;
        s[63] = frameTime;
        s[64] = lastFrame && lastFrame.cloud != null ? lastFrame.cloud : 0;
        s[65] = lastFrame && lastFrame.cloudSpeed != null ? lastFrame.cloudSpeed : 1;
        s[66] = (T && T.godrayAniso != null) ? T.godrayAniso : 0.60;
        s[67] = (T && T.godrayFloor != null) ? T.godrayFloor : 0.020;
        // Nearest-N to the eye (GLX glx/post.js). GLX uploads AND marches
        // exactly GR_MAX_LIGHTS=6 — its old upload-12/march-6 split was
        // REMOVED (the removal note in glx/post.js: the mismatch broke the
        // beam shadow), so 6 here is upload parity, not a consumer-side
        // trim. Raising this loop alone would make WGX show more beams
        // than GLX. The shadowed floodlight is remapped into that nearest-N
        // order — using frame.lights[0..5] + the raw frame index missed
        // distant-but-first records and carved the wrong cone.
        let nL = 0, grLampIdx = -1;
        const L = lastFrame && lastFrame.lights;
        const total = L ? (L.length / 15) | 0 : 0;
        if (lampVol > 0 && total > 0) {
          const ex = eye[0], ey = eye[1], ez = eye[2];
          for (let i = 0; i < total; i++) {
            const off = i * 15;
            const dx = L[off] - ex, dy = L[off + 1] - ey, dz = L[off + 2] - ez;
            const e = _grSel[i];
            if (e) { e.d = dx * dx + dy * dy + dz * dz; e.o = off; e.i = i; }
            else _grSel[i] = { d: dx * dx + dy * dy + dz * dz, o: off, i: i };
          }
          _grSel.length = total;
          nL = _grKeepNearest(total, 6);
          const ld = grLightData;
          for (let i = 0; i < nL; i++) {
            const off = _grSel[i].o, b = i * 16;
            if (lampArmed && _grSel[i].i === _lampIdx) grLampIdx = i;
            ld[b]    = L[off];    ld[b+1]  = L[off+1];  ld[b+2]  = L[off+2];  ld[b+3]  = L[off+6];
            ld[b+4]  = L[off+3];  ld[b+5]  = L[off+4];  ld[b+6]  = L[off+5];  ld[b+7]  = L[off+12];
            ld[b+8]  = L[off+7];  ld[b+9]  = L[off+8];  ld[b+10] = L[off+9];  ld[b+11] = L[off+13];
            ld[b+12] = L[off+10]; ld[b+13] = L[off+11]; ld[b+14] = L[off+14]; ld[b+15] = 0;
          }
          if (grLightSBO) device.queue.writeBuffer(grLightSBO, 0, ld, 0, nL * 16);
        }
        s[68] = nL;
        s[69] = grLampIdx;
        s[70] = 0; s[71] = 0;
        device.queue.writeBuffer(godrayUBO, 0, s, 0, _Post.GODRAY_UNIFORM_BYTES / 4);
        const p = encoder.beginRenderPass({ colorAttachments: [{ view: godrayView, loadOp: "clear",
          clearValue: { r: 0, g: 0, b: 0, a: 1 }, storeOp: "store" }] });
        p.setPipeline(pGodray); p.setBindGroup(0, godrayBG); p.draw(3, 1, 0, 0); p.end();
        if (pBlurHDR && godrayBlurView && godrayBlurSrcBG && godrayBlurDstBG) {
          _blurSep(pBlurHDR, godrayView, godrayBlurView, godrayBlurSrcBG, godrayBlurDstBG,
            1 / halfW, 1 / halfH, 2);
        }
      }

      const bloomAmt = o.bloom != null ? o.bloom : 0.55;
      const threshold = o.threshold != null ? o.threshold : 0.75;
      const spread = (T && T.bloomSpread != null) ? T.bloomSpread : 1;
      const nLv = bloomLv.length;
      if (bloomAmt > 0) {
        // Downsample: mip0 bright-pass gates the scene; mips 1..N plain downsample.
        for (let i = 0; i < nLv; i++) {
          const src = i === 0 ? { w: tw, h: th } : bloomLv[i - 1];
          const s = postScratch;
          s[0] = 1 / src.w; s[1] = 1 / src.h; s[2] = i === 0 ? threshold : 0; s[3] = 0;
          device.queue.writeBuffer(bloomDownUBO[i], 0, s, 0, _Post.BLOOM_DOWN_UNIFORM_BYTES / 4);
          const p = encoder.beginRenderPass({ colorAttachments: [{ view: bloomLv[i].view,
            loadOp: "clear", clearValue: { r: 0, g: 0, b: 0, a: 1 }, storeOp: "store" }] });
          p.setPipeline(pBloomDown); p.setBindGroup(0, bloomDownBG[i]); p.draw(3, 1, 0, 0); p.end();
        }
        // Upsample: intermediate mips accumulate (load); the FINAL write into
        // mip0 OVERWRITES (clear) — mip0 still holds the sharp bright-pass,
        // and adding onto it re-injects lamp-lit surfaces at full sharpness
        // (GLX glx/post.js last===overwrite, TLX upFinal).
        for (let i = nLv - 2; i >= 0; i--) {
          const s = postScratch;
          s[0] = 1 / bloomLv[i + 1].w; s[1] = 1 / bloomLv[i + 1].h; s[2] = spread; s[3] = 0;
          device.queue.writeBuffer(bloomUpUBO[i], 0, s, 0, _Post.BLOOM_UP_UNIFORM_BYTES / 4);
          const last = i === 0;
          const p = encoder.beginRenderPass({ colorAttachments: [{ view: bloomLv[i].view,
            loadOp: last ? "clear" : "load",
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
            storeOp: "store" }] });
          p.setPipeline(pBloomUp); p.setBindGroup(0, bloomUpBG[i]); p.draw(3, 1, 0, 0); p.end();
        }
      }
      // Composite gates bloom on bloomAmt > 0, so a shed chain does not need
      // a black clear of mip0. Stale contents are unread.

      {
        const s = postScratch;
        // Normalise mip-chain accumulation to keep the tuned bloom energy (GLX).
        const bloomNorm = bloomAmt > 0 ? bloomAmt * 1.25 / Math.max(nLv - 1, 1) : 0;
        const flareStr = sun ? sun.flare * (o.flareMul != null ? o.flareMul : 1) : 0;
        // SCREEN SUN-SHAFT: p0.z scales ONLY the composite radial bloom shaft
        // (GLX uSunShaft). Volumetric god-ray is added unscaled in WGSL.
        // GATED ON bloomAmt: the shaft pass READS THE BLOOM CHAIN (GLX
        // uSunShaft / TLX C.sunShaft). When bloom is shed the composite
        // does not fetch mip0, so shaftMul must also be 0 — otherwise
        // 8 dependent taps would read stale mip0.
        const shaftMul = (bloomAmt > 0 && sun && sun.shaft > 0)
          ? ((T && T.sunShaftMul != null) ? T.sunShaftMul : 1.0) * sun.shaft
          : 0.0;
        s[0] = exposure; s[1] = bloomNorm; s[2] = shaftMul; s[3] = flareStr;   // p0
        s[4] = sunUVx; s[5] = sunUVy;
        s[6] = (T && T.whitePoint != null) ? T.whitePoint : 1.0;
        s[7] = (T && T.blackLift != null) ? T.blackLift : 0.005;                          // sunUV
        s[8]  = (T && T.contrast   != null) ? T.contrast   : 1.12;
        s[9]  = (T && T.vibrance   != null) ? T.vibrance   : 0.20;
        s[10] = (T && T.saturation != null) ? T.saturation : 1.0;
        s[11] = (T && T.tint       != null) ? T.tint       : 0.0;                         // grade
        s[12] = (T && T.vignette   != null) ? T.vignette   : 0.80;
        s[13] = (T && T.grain      != null) ? T.grain      : 0.0;
        s[14] = frameTime;
        s[15] = (T && T.sunShaftDecay != null) ? T.sunShaftDecay : 0.82;                  // fx.w = shaftDecay
        const grade = o.grade || null;
        const gsh = grade && grade.shadow ? grade.shadow : [1, 1, 1];
        const ghi = grade && grade.hi ? grade.hi : [1, 1, 1];
        s[16] = gsh[0]; s[17] = gsh[1]; s[18] = gsh[2];
        s[19] = grade && grade.str != null ? grade.str : 0;                              // gradeShadow (w=str)
        s[20] = ghi[0]; s[21] = ghi[1]; s[22] = ghi[2];
        // GLX: uShaftSpread = sqrt(max(0.05, sunShaftMul)) — not a separate knob.
        const _shaftSpreadMul = (T && T.sunShaftMul != null) ? T.sunShaftMul : 1.0;
        s[23] = Math.sqrt(Math.max(0.05, _shaftSpreadMul));                              // gradeHi.w = shaftSpread
        // texel.xy = full-res; zw = half-res AO texel (0 = skip bilateral upsample)
        s[24] = 1 / tw; s[25] = 1 / th;
        s[26] = haveAO ? (1 / halfW) : 0; s[27] = haveAO ? (1 / halfH) : 0;
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
        s[42] = (T && T.shoulder   != null) ? T.shoulder   : 0;
        // tone1.w = hdrGradeOn (GLX uHdrGradeOn / TLX C.hdrGradeOn). Skip the
        // lift/gamma/gain/tone ALU when every knob is the shipped neutral.
        const _hg = T && (
          (T.blacks || 0) !== 0 || (T.shadows || 0) !== 0 || (T.midtones || 0) !== 0 ||
          (T.highlights || 0) !== 0 || (T.whites || 0) !== 0 || (T.toe || 0) !== 0 ||
          (T.shoulder || 0) !== 0 || (T.liftR || 0) !== 0 || (T.liftG || 0) !== 0 ||
          (T.liftB || 0) !== 0 || (T.gammaR != null && T.gammaR !== 1) ||
          (T.gammaG != null && T.gammaG !== 1) || (T.gammaB != null && T.gammaB !== 1) ||
          (T.gainR != null && T.gainR !== 1) || (T.gainG != null && T.gainG !== 1) ||
          (T.gainB != null && T.gainB !== 1));
        s[43] = _hg ? 1 : 0;
        s[44] = (T && T.liftR      != null) ? T.liftR      : 0;
        s[45] = (T && T.liftG      != null) ? T.liftG      : 0;
        s[46] = (T && T.liftB      != null) ? T.liftB      : 0;
        s[47] = haveGR ? 1 : 0;                                                           // lift.w = haveGR (SSR wetness lives in .a)
        s[48] = (T && T.gammaR     != null) ? T.gammaR     : 1;
        s[49] = (T && T.gammaG     != null) ? T.gammaG     : 1;
        s[50] = (T && T.gammaB     != null) ? T.gammaB     : 1;
        s[51] = _ssrRan && o.reflect != null ? o.reflect : 0;                             // gamma.w = wet-road SSR (0 when the pass skipped — ssrTex is stale)
        s[52] = (T && T.gainR      != null) ? T.gainR      : 1;
        s[53] = (T && T.gainG      != null) ? T.gainG      : 1;
        s[54] = (T && T.gainB      != null) ? T.gainB      : 1;
        s[55] = _ssrRan ? (o.carReflect != null ? o.carReflect
          : ((T && T.carReflect != null) ? T.carReflect : 0.05)) : 0;                      // gain.w = carReflect (same stale-ssrTex gate)
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

      {
        const s = postScratch;
        s[0] = 1 / tw; s[1] = 1 / th; s[2] = 0; s[3] = 0;
        device.queue.writeBuffer(fxaaUBO, 0, s, 0, _Post.FXAA_UNIFORM_BYTES / 4);
        const p = encoder.beginRenderPass({ colorAttachments: [{ view: currentView, loadOp: "clear",
          clearValue: { r: 0, g: 0, b: 0, a: 1 }, storeOp: "store" }] });
        p.setPipeline(pFXAA); p.setBindGroup(0, fxaaBG); p.draw(3, 1, 0, 0); p.end();
      }

      } catch (postE) {
        if (_postReady) {
          try { Log.warn("gfx", "WGX post chain failed — tonemap blit fallback", postE); } catch (_) { /* harness */ }
          _postReady = false;
        }
        _tonemapBlit(exposure);
      }

      if (_gpuTimerOn && _gpuQuerySet && _gpuResolveBuf && _gpuReadBuf && _gpuReadBuf.mapState === "unmapped") {
        try {
          encoder.resolveQuerySet(_gpuQuerySet, 0, 2, _gpuResolveBuf, 0);
          encoder.copyBufferToBuffer(_gpuResolveBuf, 0, _gpuReadBuf, 0, 16);
        } catch (_) { /* timer stays at last-good / -1 */ }
      }
      const disp = _softDisplayEncode();
      const _cap = _capEncode();
      try { device.queue.submit(_frameSubmitList(encoder)); }
      catch (e) { _softDisplayAbort(disp); throw e; }
      _retireFlush();
      _capFinish(_cap);
      _softDisplayFinish(disp);
      _readOutputProbe();
      if (_gpuTimerOn && _gpuReadBuf && _gpuReadBuf.mapState === "unmapped" && typeof _gpuReadBuf.mapAsync === "function") {
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
      _jsStrikes = 0;   // a presented frame clears the strike count
      if (!_okCounted) { _okCounted = true; _healTick(); }
      } catch (e) {
        // Same as begin(): a dying device must not paint "Caught @ tick".
        _jsStrike("present", e);
        if (_capReq) { const r = _capReq; _capReq = null; r.reject(e); }
      }
    }

    // Runs BEFORE begin() each frame (matches game.js render order): one
    // shared shadow encoder for the frame's passes, submitted ahead of the
    // main encoder in the SAME queue.submit (see _frameSubmitList) — queue
    // order keeps the depth maps ready for the lit pass that samples them.
    // All current casters use MAT_IDENT, but model is honoured via a
    // dynamic-offset ring (one slot per castShadow* call, regioned per pass).
    function _writeShadowModel(slot, model) {
      const src = model && model.length === 16 ? model : (model && model.length > 16 && model.subarray ? model.subarray(0, 16) : IDENT);
      shadowModelRing.set(src, slot * SHADOW_MODEL_F32_STRIDE);
    }
    // One writeBuffer for every slot filled this pass — call before
    // shadowPass.end(). writeBuffer is queue-ordered before submit, so
    // draws recorded earlier still see the data (same rule as _flushDrawUBO).
    function _flushShadowModelUBO() {
      if (!shadowModelUBO || _shadowSlot <= _shadowFlushed) return;
      // Region flush: only this pass's new slots — earlier passes' slots are
      // already uploaded and must not be rewritten (their draws are recorded,
      // and writeBuffer is queue-ordered, so a rewrite would clobber them).
      device.queue.writeBuffer(shadowModelUBO,
        _shadowFlushed * SHADOW_MODEL_STRIDE, shadowModelRing,
        _shadowFlushed * SHADOW_MODEL_F32_STRIDE,
        (_shadowSlot - _shadowFlushed) * SHADOW_MODEL_F32_STRIDE);
      _shadowFlushed = _shadowSlot;
      if (_shadowOverflow) Log.warn("gfx", "WGX shadow caster ring overflow: " + _shadowOverflow + " draw(s) skipped");
    }
    // One encoder for all of a frame's shadow passes; a Begin resumes the
    // pending encoder. Spill guard: if the frame submit never ran (a capture
    // path bailed) the ring would keep growing — submit and reset instead.
    function _shadowEncoderBegin() {
      if (_pendingShadowEnc && _shadowSlot > SHADOW_SLOTS - 512) {
        try { device.queue.submit([_pendingShadowEnc.finish()]); } catch (_) { /* device error surfaces later */ }
        _pendingShadowEnc = null;
        _shadowSlot = 0; _shadowFlushed = 0; _shadowOverflow = 0;
      }
      shadowEncoder = _pendingShadowEnc || device.createCommandEncoder();
      _pendingShadowEnc = null;
    }
    // The frame submit: shadow encoder (when any pass recorded) rides in front
    // of the main encoder, then the ring resets for the next frame.
    function _frameSubmitList(mainEnc) {
      const sh = _pendingShadowEnc;
      _pendingShadowEnc = null;
      _shadowSlot = 0; _shadowFlushed = 0; _shadowOverflow = 0;
      return sh ? [sh.finish(), mainEnc.finish()] : [mainEnc.finish()];
    }
    function _shadowSetModel(model) {
      if (_shadowSlot >= SHADOW_SLOTS) { _shadowOverflow++; return -1; }
      const slot = _shadowSlot++;
      _writeShadowModel(slot, model);
      _shadowDynOff[0] = slot * SHADOW_MODEL_STRIDE;
      shadowPass.setBindGroup(1, shadowModelBindGroup, _shadowDynOff);
      return slot;
    }
    function shadowBegin(lightVP) {
      if (_lost || !shadowView) return;
      _shadowLightVP = (lightVP && lightVP.length >= 16) ? lightVP : IDENT;  // raw — CPU chunk cull
      _mul4(shadowLVPData, Z01, _shadowLightVP);   // Z01-remapped — depth store + LIT lookup
      device.queue.writeBuffer(shadowUBO, 0, shadowLVPData);
      _shadowEncoderBegin();
      shadowPass = shadowEncoder.beginRenderPass({
        colorAttachments: [],
        depthStencilAttachment: { view: shadowView, depthClearValue: 1.0, depthLoadOp: "clear", depthStoreOp: "store" },
      });
      shadowPass.setPipeline(shadowPipeline);
      shadowPass.setBindGroup(0, shadowG0BindGroup);
      if (lightVP) { _extractPlanes(lightVP, _fcPlanes); _fcPlanesIsFrame = false; }   // light frustum for chunk cull
    }
    function castShadow(mesh, model) {
      if (!shadowPass || !mesh || !mesh.vbuf) return;
      if (_shadowSetModel(model) < 0) return;
      _setVB1(shadowPass, identInstanceBuf);
      if (mesh.pieces) {
        for (let i = 0; i < mesh.pieces.length; i++) {
          const p = mesh.pieces[i];
          _setVB0(shadowPass, p.vbuf);
          _drawGeom(shadowPass, p);
        }
        return;
      }
      if (mesh.chunks) {   // a chunked mesh cast without cull — draw every chunk
        for (let i = 0; i < mesh.chunks.length; i++) {
          const ch = mesh.chunks[i];
          _setVB0(shadowPass, ch.vbuf || mesh.vbuf);
          _drawGeom(shadowPass, ch);
        }
        return;
      }
      _setVB0(shadowPass, mesh.vbuf);
      _drawGeom(shadowPass, mesh);
    }
    function castShadowChunked(mesh, model) {
      if (!shadowPass || !mesh || !mesh.vbuf) return;
      if (_shadowSetModel(model) < 0) return;
      _setVB1(shadowPass, identInstanceBuf);
      if (!mesh.chunks) {
        if (mesh.pieces) {
          for (let i = 0; i < mesh.pieces.length; i++) {
            const p = mesh.pieces[i];
            _setVB0(shadowPass, p.vbuf);
            _drawGeom(shadowPass, p);
          }
          return;
        }
        _setVB0(shadowPass, mesh.vbuf);
        _drawGeom(shadowPass, mesh);
        return;
      }
      const cull = !!_shadowLightVP;   // planes were extracted into _fcPlanes in shadowBegin
      // Same pooling as drawChunked's _mrRun/_mrFlush below: this ran the
      // identical per-call closure + per-state-change run object, once per
      // shadow-casting mesh per shadow pass per frame.
      const run = _srRun;
      for (let i = 0; i < mesh.chunks.length; i++) {
        const ch = mesh.chunks[i];
        if (cull && !_aabbInFrustum(_fcPlanes, ch.min, ch.max)) { _srFlush(); continue; }
        const vbuf = ch.vbuf || mesh.vbuf;
        const ibuf = ch.ibuf || mesh.ibuf || null;
        const attrBG = ch.attrBG || mesh.attrBG;
        if (run.active && run.vbuf === vbuf && run.ibuf === ibuf && run.attrBG === attrBG) {
          run.count += ch.count;
        } else {
          _srFlush();
          run.active = true;
          run.vbuf = vbuf; run.ibuf = ibuf; run.attrBG = attrBG;
          run.count = ch.count;
          run.firstIndex = _chunkFirstIndex(ch);
          run.indexFormat = ch.indexFormat || mesh.indexFormat;
        }
      }
      _srFlush();
      // Release the GPU-object refs — the bag survives between calls.
      run.vbuf = run.ibuf = run.attrBG = run.indexFormat = null;
    }
    // Pooled merge-run state for castShadowChunked (see _mrRun for the doctrine).
    const _srRun = {
      active: false, vbuf: null, ibuf: null, attrBG: null,
      count: 0, firstIndex: 0, indexFormat: null,
    };
    function _srFlush() {
      if (!_srRun.active) return;
      _setVB0(shadowPass, _srRun.vbuf);
      _drawGeom(shadowPass, _srRun);
      _srRun.active = false;
    }
    function shadowEnd() {
      if (!shadowPass) return;
      _flushShadowModelUBO();
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

      _pendingShadowEnc = shadowEncoder;   // rides the frame submit
      shadowEncoder = null;
      _shadowRendered = true;
    }

    // Shares the depth pipeline and the dynamic-offset model ring with the
    // static pass (safe: the ring is REGIONED per pass — slots keep counting
    // across Begins and reset only at the frame submit, so this Begin never
    // rewrites slots an earlier recorded pass still references).
    // PHONES keep blob-only shadows, matching GLX — which gates on IS_MOBILE, the
    // device, not MOBILE_TIER: GRAPHICS: HIGH buys quality, not a per-frame extra
    // depth pass on a phone GPU. The map itself is 1×1 there, so this gate is also
    // what keeps the pass from rasterising cars into a 1-pixel target.
    function carShadowBegin(lightVP, boxScale) {
      if (_lost || !carShadowView || IS_MOBILE || WGX_LITE) return;
      _carArms++;   // lifetime arm count, mirroring GLX SHD.carArms (debug only)
      _carBoxScale = boxScale || 1;
      _shadowLightVP = null;   // castShadowChunked must NOT frustum-cull with stale static planes
      _mul4(carShadowLVPData, Z01, (lightVP && lightVP.length >= 16) ? lightVP : IDENT);
      device.queue.writeBuffer(carShadowUBO, 0, carShadowLVPData);
      _shadowEncoderBegin();
      shadowPass = shadowEncoder.beginRenderPass({
        colorAttachments: [],
        depthStencilAttachment: { view: carShadowView, depthClearValue: 1.0, depthLoadOp: "clear", depthStoreOp: "store" },
      });
      shadowPass.setPipeline(shadowPipeline);
      shadowPass.setBindGroup(0, carShadowG0BindGroup);
    }
    function carShadowEnd() {
      if (!shadowPass) return;
      _flushShadowModelUBO();
      shadowPass.end(); shadowPass = null;
      _pendingShadowEnc = shadowEncoder;   // rides the frame submit
      shadowEncoder = null;
      _carShadowArmed = true;
    }

    function lampShadowBegin(lightVP, lightIdx) {
      if (_lost || !lampShadowView || MOBILE_TIER || WGX_LITE) return;
      _lampArms++;
      _lampIdx = lightIdx | 0;
      const raw = (lightVP && lightVP.length >= 16) ? lightVP : IDENT;
      // Point chunk cull at the lamp frustum (GLX S.castCullVP = lampLightVP).
      // Nulling this (to avoid stale sun planes) skipped the cull entirely and
      // rasterised every chunk into the 512² map.
      _shadowLightVP = raw;
      _mul4(lampShadowLVPData, Z01, raw);
      device.queue.writeBuffer(lampShadowUBO, 0, lampShadowLVPData);
      if (lightVP) { _extractPlanes(raw, _fcPlanes); _fcPlanesIsFrame = false; }
      _shadowEncoderBegin();
      shadowPass = shadowEncoder.beginRenderPass({
        colorAttachments: [],
        depthStencilAttachment: { view: lampShadowView, depthClearValue: 1.0, depthLoadOp: "clear", depthStoreOp: "store" },
      });
      shadowPass.setPipeline(shadowPipeline);
      shadowPass.setBindGroup(0, lampShadowG0BindGroup);
    }
    function lampShadowEnd() {
      if (!shadowPass) return;
      _flushShadowModelUBO();
      shadowPass.end(); shadowPass = null;
      _pendingShadowEnc = shadowEncoder;   // rides the frame submit
      shadowEncoder = null;
      _lampShadowArmed = true;
    }

    // Byte-exact layer upload (GLX texSubImage3D parity). copyExternalImageToTexture
    // into rgba8unorm converts sRGB → linear, so a mean-normalised 128-grey
    // asphalt scan lands at ~0.22 and `albedo * tex * 2.0` crushes or — on
    // implementations that encode the other way — washes the road vs WebGL2.
    function _matLayerBytes(img, size) {
      if (!img) return null;
      if (img instanceof Uint8Array || img instanceof Uint8ClampedArray) return img;
      if (typeof ImageData !== "undefined" && img instanceof ImageData) return img.data;
      try {
        const cv = (typeof OffscreenCanvas !== "undefined")
          ? new OffscreenCanvas(size, size)
          : Object.assign(document.createElement("canvas"), { width: size, height: size });
        const c2d = cv.getContext("2d", { alpha: true, colorSpace: "srgb" })
          || cv.getContext("2d", { alpha: true })
          || cv.getContext("2d");
        if (!c2d) return null;
        c2d.drawImage(img, 0, 0, size, size);
        return c2d.getImageData(0, 0, size, size).data;
      } catch (_) { return null; }
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
        const bpr = size * 4;
        for (let i = 0; i < n; i++) {
          const img = images[i];
          if (!img) continue;
          try {
            const bytes = _matLayerBytes(img, size);
            if (bytes && bytes.length >= bpr * size) {
              device.queue.writeTexture({ texture: tex, origin: [0, 0, i] }, bytes,
                { bytesPerRow: bpr, rowsPerImage: size }, [size, size, 1]);
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
      } catch (_) { return null; /* alloc/copy failed: pack stays procedural */ }
    }
    // `keep` is the incoming maps: a caller re-passing a token it already handed
    // over must not have it destroyed under the new binding (assets.js always
    // builds fresh arrays, but webbake/__apex/tests need not).
    function _releaseOwnedMatMaps(keep) {
      const kept = new Set();
      if (keep) {
        if (keep.albedo && keep.albedo.texture) kept.add(keep.albedo.texture);
        if (keep.normal && keep.normal.texture) kept.add(keep.normal.texture);
      }
      // Destroy each GPUTexture at most once (albedo/normal may alias).
      const seen = new Set();
      for (const tok of [_matOwnedAlbedo, _matOwnedNormal]) {
        if (!tok || !tok.texture || seen.has(tok.texture) || kept.has(tok.texture)) continue;
        seen.add(tok.texture);
        try { tok.texture.destroy(); } catch (_) { /* already invalid */ }
      }
      _matOwnedAlbedo = null;
      _matOwnedNormal = null;
    }
    // Adopt (or clear) baked material arrays. Frees any previously-owned pack
    // textures and restores the 1×1×N placeholders so bind groups never point
    // at destroyed views — GLX deleteTexture parity for WebGPU.
    function setMaterialMaps(maps) {
      _releaseOwnedMatMaps(maps);
      matAlbedoView = matPlaceAlbedoView;
      matNormalView = matPlaceNormalView;
      _matAlbedoOn = false;
      _matNormalOn = false;
      _matScales.fill(0);
      matScaleData.fill(0);
      if (!maps) {
        if (matScaleUBO) device.queue.writeBuffer(matScaleUBO, 0, matScaleData);
        _rebuildFrameBG();
        return;
      }
      if (maps.albedo && maps.albedo.view) {
        matAlbedoView = maps.albedo.view;
        _matAlbedoOn = true;
        _matOwnedAlbedo = maps.albedo;
      }
      if (maps.normal && maps.normal.view) {
        matNormalView = maps.normal.view;
        _matNormalOn = true;
        _matOwnedNormal = maps.normal;
      }
      const sc = maps.scales;
      if (sc) for (let i = 0; i < MAT_TEX_LAYERS; i++) _matScales[i] = +sc[i] > 0 ? +sc[i] : 0;
      if (!_matAlbedoOn) _matScales.fill(0);
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
          packed[i * 20 + 16] = colors[i * 3];
          packed[i * 20 + 17] = colors[i * 3 + 1];
          packed[i * 20 + 18] = colors[i * 3 + 2];
        } else {
          packed[i * 20 + 16] = packed[i * 20 + 17] = packed[i * 20 + 18] = 1;
        }
      }
      try {
        mesh.instBuf = n ? _mkBuffer(packed, GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST) : identInstanceBuf;
      } catch (e) {
        _allocFail("createInstancedBatch", e);
        mesh.instBuf = identInstanceBuf;
        mesh.instances = 0; mesh.visible = 0; mesh._instPacked = null;
        return mesh;   // drawInstanced checks .instances, so this batch is inert
      }
      mesh.instances = n;
      mesh.visible = n;
      mesh._instPacked = packed;
      // Always retain CPU copies — castShadowInstanced restores the full set
      // after the lit pass camera-repacks instBuf.
      mesh.srcMatrices = matrices;
      mesh.srcColors = colors && colors.length ? colors : null;
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
      }
      return mesh;
    }
    function cullInstances(batch, planes) {
      if (!batch || !batch.cells) return batch ? batch.instances : 0;
      let samePack = !!batch._cullPlanes;
      if (samePack) {
        let po = 0;
        for (let pi = 0; pi < 6 && samePack; pi++) {
          const p = planes[pi];
          for (let k = 0; k < 4; k++, po++) {
            if (batch._cullPlanes[po] !== p[k]) { samePack = false; break; }
          }
        }
      }
      if (samePack) { batch.visible = batch._cullN; return batch._cullN; }
      const src = batch.srcMatrices, dst = batch._instPacked;
      const sc = batch.srcColors;
      let n = 0;
      for (const c of batch.cells) {
        if (!_aabbInFrustum(planes, c.mn, c.mx)) continue;
        for (const i of c.idx) {
          // No src.subarray — per-instance views were GC on Vegas-scale batches.
          const so = i * 16, dOff = n * 20;
          for (let k = 0; k < 16; k++) dst[dOff + k] = src[so + k];
          if (sc) {
            dst[dOff + 16] = sc[i * 3]; dst[dOff + 17] = sc[i * 3 + 1]; dst[dOff + 18] = sc[i * 3 + 2];
          }
          n++;
        }
      }
      batch.visible = n;
      if (n && batch.instBuf && batch.instBuf !== identInstanceBuf) {
        device.queue.writeBuffer(batch.instBuf, 0, dst, 0, n * 20);
      }
      const snap = batch._cullPlanes || (batch._cullPlanes = new Float64Array(24));
      for (let pi = 0, po = 0; pi < 6; pi++) {
        const p = planes[pi];
        for (let k = 0; k < 4; k++, po++) snap[po] = p[k];
      }
      batch._cullN = n;
      return n;
    }
    function drawInstanced(batch, opts) {
      if (!litPass || !batch || !batch.vbuf || !batch.instances) return;
      const n = batch.visible === undefined ? batch.instances : batch.visible;
      if (n <= 0) return;
      const slot = _drawSlot++;
      if (slot >= MAX_DRAWS) return;
      // Reuse a single opts bag — Object.assign every batch was GC on city tracks.
      // undefined-assign, not delete: per-key delete pushed the bag into
      // dictionary mode, partially defeating the pooling. Consumers all test
      // != null / !== undefined, so a cleared key reads identically.
      const o = _instDrawOpts;
      for (const k in o) { if (k !== "_instanced") o[k] = undefined; }
      if (opts) { for (const k in opts) o[k] = opts[k]; }
      o._instanced = true;
      _writeDraw(slot, IDENT, o);
      _setPipe(litPass, _litPipeline(o));
      _setBG0(litPass, _activeFrameBG);
      _dynOff[0] = slot * DRAW_STRIDE;
      litPass.setBindGroup(1, drawBindGroup, _dynOff);
      _bindLitVerts(litPass, batch.vbuf, batch.instBuf || identInstanceBuf, batch.attrBG);
      _drawGeom(litPass, batch, n);
    }
    function freeInstancedBatch(batch) {
      if (!batch) return;
      if (batch.instBuf && batch.instBuf !== identInstanceBuf) try { batch.instBuf.destroy(); } catch (_) { /* already destroyed */ }
      freeMesh(batch);
    }
    const _shadowIdent = new Float32Array(16);   // pooled zero model for castShadowInstanced
    // Optional `count` matches GLX: default = all instances. Do NOT use
    // batch.visible — that is the MAIN-camera cull from the prior lit pass and
    // would drop casters behind the eye that still hit the light frustum.
    function castShadowInstanced(batch, count) {
      if (!shadowPass || !batch || !batch.vbuf) return;
      const n = count === undefined ? batch.instances : Math.min(count | 0, batch.instances);
      if (n <= 0) return;
      // Full-set cast: lit cull may have camera-repacked instBuf — restore from
      // srcMatrices so casters behind the eye still hit the light frustum.
      if (count === undefined && batch.srcMatrices && batch._instPacked &&
          batch.instBuf && batch.instBuf !== identInstanceBuf) {
        const src = batch.srcMatrices, dst = batch._instPacked, sc = batch.srcColors;
        for (let i = 0; i < n; i++) {
          const so = i * 16, dOff = i * 20;
          for (let k = 0; k < 16; k++) dst[dOff + k] = src[so + k];
          if (sc) {
            dst[dOff + 16] = sc[i * 3]; dst[dOff + 17] = sc[i * 3 + 1]; dst[dOff + 18] = sc[i * 3 + 2];
          } else {
            dst[dOff + 16] = dst[dOff + 17] = dst[dOff + 18] = 1;
          }
        }
        device.queue.writeBuffer(batch.instBuf, 0, dst, 0, n * 20);
        batch._cullPlanes = null;
        // Buffer holds the full set again — a stale repack count would draw the
        // wrong N until the next cullInstances (same contract as GLX shadow).
        batch.visible = batch.instances;
      }
      if (_shadowSetModel(_shadowIdent) < 0) return;
      _setVB0(shadowPass, batch.vbuf);
      _setVB1(shadowPass, batch.instBuf || identInstanceBuf);
      _drawGeom(shadowPass, batch, n);
    }

    function drawParticles(data, floatCount, additive) {
      if (!litPass || !pParticle || !data || !(floatCount > 0)) return;
      const nVert = (floatCount / 10) | 0;
      if (nVert <= 0) return;
      // Ping-pong slot so smoke + sparks each own a VBO/UBO before submit.
      const i = _particleFlip++ & 1;
      if (!_particleCap[i] || _particleCap[i] < floatCount) {
        // NEVER destroy the old VBO here: this frame's litPass may have already
        // recorded a setVertexBuffer on it. Retire; present() destroys after submit.
        if (particleVBO[i]) _retiredBufs.push(particleVBO[i]);
        _particleCap[i] = Math.max(floatCount, 2560);
        particleVBO[i] = device.createBuffer({
          size: _particleCap[i] * 4,
          usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        });
      }
      device.queue.writeBuffer(particleVBO[i], 0, data, 0, floatCount);
      const s = fxScratch;
      s.set(frameVPGpu, 0);
      const eye = frameEye || [0, 0, 0];
      s[16] = eye[0]; s[17] = eye[1]; s[18] = eye[2]; s[19] = additive ? 1 : 0;
      device.queue.writeBuffer(particleUBO[i], 0, s, 0, 20);
      _setPipe(litPass, additive && pParticleAdd ? pParticleAdd : pParticle);
      if (_particleBG[i]) _setBG0(litPass, _particleBG[i]);
      _setVB0(litPass, particleVBO[i]);
      litPass.draw(nVert);
    }

    //    game.js interleaves them with draw()/drawSky() before present()). ──

    // Blob shadow + skid stamp share the unit quad + dynamic-offset uniform ring.
    // size = (w, l, p2, p3): BLOB -> (w,l, softInner 0.25, peakAlpha 0.45);
    // MARK -> (w,l, peakAlpha 0.38, 0).
    function _writeQuadFx(slot, model, w, l, p2, p3) {
      const base = slot * FX_F32_STRIDE;
      const s = quadFxRing;
      s.set(frameVPGpu, base);
      s.set(model && model.length === 16 ? model : (model && model.length > 16 && model.subarray ? model.subarray(0, 16) : IDENT), base + 16);
      s[base + 32] = w; s[base + 33] = l; s[base + 34] = p2; s[base + 35] = p3;
    }
    function _drawQuadStamp(pipeline, model, w, l, p2, p3) {
      if (!_fxReady || !litPass || !pipeline) return;
      const slot = _fxQuadSlot++;
      // Count the drop (blob shadows/marks past the ring) — GLX has no cap, so
      // a silently thinner WGX frame was undiagnosable (same idiom as the
      // shadow caster ring's _shadowOverflow).
      if (slot >= FX_QUAD_SLOTS) { _fxQuadOverflow++; return; }
      _writeQuadFx(slot, model, w, l, p2, p3);
      _setPipe(litPass, pipeline);
      _fxQuadDynOff[0] = slot * FX_STRIDE;
      _setBG0(litPass, quadFxBG, _fxQuadDynOff);
      _setVB0(litPass, quadFxVBO);
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
      const bytes = floats9 * 4;
      if (!skidVBO || _skidCap < bytes) {
        if (skidVBO) _retiredBufs.push(skidVBO);
        _skidCap = Math.max(bytes, 4096);
        skidVBO = device.createBuffer({ size: (_skidCap + 3) & ~3, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
        dirty = true;
      }
      // Expand stride 5→9 only when the VBO is dirty. The trail is rebuilt
      // on add/evict; most frames the CPU walk was thrown away (GLX/TLX
      // keep stride 5 and never expand).
      if (dirty) {
        if (!_skidScratch || _skidScratch.length < floats9) _skidScratch = new Float32Array(floats9);
        const dst = _skidScratch;
        for (let v = 0; v < vertCount; v++) {
          const si = v * 5, di = v * 9;
          dst[di] = verts[si]; dst[di+1] = verts[si+1]; dst[di+2] = verts[si+2];
          dst[di+3] = verts[si+3]; dst[di+4] = verts[si+4];
          dst[di+5] = 0; dst[di+6] = 0; dst[di+7] = 0; dst[di+8] = 1;
        }
        device.queue.writeBuffer(skidVBO, 0, dst, 0, floats9);
      }
      device.queue.writeBuffer(skidUBO, 0, frameVPGpu);
      _setPipe(litPass, pSkid);
      _setBG0(litPass, skidFxBG);
      _setVB0(litPass, skidVBO);
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
        if (glowVBO) _retiredBufs.push(glowVBO);
        _glowCap = Math.max(bytes, 4096);
        glowVBO = device.createBuffer({ size: (_glowCap + 3) & ~3, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
      }
      device.queue.writeBuffer(glowVBO, 0, gd, 0, p);
      const gu = fxScratch;
      gu.set(frameVPGpu, 0);
      gu[16] = ex; gu[17] = ey; gu[18] = ez; gu[19] = str;
      device.queue.writeBuffer(glowUBO, 0, gu, 0, 20);
      _setPipe(litPass, pGlow);
      _setBG0(litPass, glowFxBG);
      _setVB0(litPass, glowVBO);
      litPass.draw(nDraw * 6, 1, 0, 0);
    }

    // Textured team/sponsor decal over the car body (createTexMesh + createTexture).
    // opts: { glow, uvRect:[u0,v0,uScale,vScale], tint:[r,g,b] }.
    function drawDecal(mesh, model, tex, opts) {
      if (!_fxReady || !litPass || !pDecal || !mesh || !mesh.count || !mesh.vbuf || !tex || !tex.view) return;
      const slot = _fxDecalSlot++;
      if (slot >= FX_DECAL_SLOTS) return;
      const base = slot * FX_F32_STRIDE;
      const s = decalFxRing, o = opts || {};
      s.set(model && model.length === 16 ? model : (model && model.length > 16 && model.subarray ? model.subarray(0, 16) : IDENT), base);
      s.set(frameVPGpu, base + 16);
      const sd = frameSunDir || [0.3,0.6,0.5];
      const Td = frameTune || null;
      const kM = Td && Td.keyMul != null ? Td.keyMul : 1;
      const scRaw = frameSunColor || [1,0.95,0.9];
      const sc = [scRaw[0] * kM, scRaw[1] * kM, scRaw[2] * kM];
      const ambM = Td && Td.ambientMul != null ? Td.ambientMul : 1;
      const askyRaw = frameAmbSky || [0.3,0.32,0.36], agrRaw = frameAmbGround || [0.2,0.19,0.18];
      const asky = [askyRaw[0] * ambM, askyRaw[1] * ambM, askyRaw[2] * ambM];
      const agr = [agrRaw[0] * ambM, agrRaw[1] * ambM, agrRaw[2] * ambM];
      s[base + 32] = sd[0]; s[base + 33] = sd[1]; s[base + 34] = sd[2]; s[base + 35] = 0;
      s[base + 36] = sc[0]; s[base + 37] = sc[1]; s[base + 38] = sc[2]; s[base + 39] = 0;
      s[base + 40] = asky[0]; s[base + 41] = asky[1]; s[base + 42] = asky[2]; s[base + 43] = 0;
      s[base + 44] = agr[0];  s[base + 45] = agr[1];  s[base + 46] = agr[2];  s[base + 47] = 0;
      const uvr = o.uvRect || null;
      s[base + 48] = uvr ? uvr[0] : 0; s[base + 49] = uvr ? uvr[1] : 0; s[base + 50] = uvr ? uvr[2] : 1; s[base + 51] = uvr ? uvr[3] : 1;
      const tint = o.tint || null;
      s[base + 52] = tint ? tint[0] : 1; s[base + 53] = tint ? tint[1] : 1; s[base + 54] = tint ? tint[2] : 1;
      s[base + 55] = o.glow || 0;
      let bg = tex._wgxDecalBG;
      if (!bg) {
        bg = device.createBindGroup({ layout: fxDecalLayout, entries: [
          { binding: 0, resource: { buffer: decalUBO, offset: 0, size: _Fx.DECAL_UNIFORM_BYTES } },
          { binding: 1, resource: tex.view },
          { binding: 2, resource: linearSampler },
        ] });
        tex._wgxDecalBG = bg;
      }
      _setPipe(litPass, pDecal);
      _fxDecalDynOff[0] = slot * FX_STRIDE;
      _setBG0(litPass, bg, _fxDecalDynOff);
      _setVB0(litPass, mesh.vbuf);
      litPass.setIndexBuffer(mesh.ibuf, mesh.indexFormat);
      litPass.drawIndexed(mesh.count);
    }

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
        try { info = await mod.getCompilationInfo(); } catch (_) { continue; /* compilation-info unsupported: skip this module, never fatal */ }
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

      // 2b) MSAA lit + sky pipelines (desktop stack). Sample count 2 is illegal
      // in WebGPU; MSAA 4 is the GLX-parity path and must validate at boot, not
      // on the first real frame when refusal is no longer possible.
      if (MSAA_COUNT > 1) {
        if (scoped) device.pushErrorScope("validation");
        let msErr = null;
        try {
          _passSamples = MSAA_COUNT;
          _litPipeline({});
          if (!skyPipelineMS) msErr = "sky MSAA pipeline missing";
        } catch (e) { msErr = (e && e.message) || String(e); }
        _passSamples = 1;
        if (scoped) {
          const gpuErr = await device.popErrorScope();
          if (!msErr && gpuErr) msErr = (gpuErr.message || "invalid MSAA pipeline");
        }
        if (msErr) return "msaa pipeline: " + String(msErr).slice(0, 200);
      }

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
          size: [4, 4], format: _presentFormat,
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
      try { if (src) src.destroy(); if (dst) dst.destroy(); if (buf) buf.destroy(); } catch (_) { /* smoke-test temps already invalid */ }
      if (reason) return reason;
      // Anything the device reported asynchronously while we were booting.
      if (_bootError) return "gpu error during init: " + _bootError;
      return null;
    }

    // 4) Swapchain present smoke — the 4×4 offscreen blit above can pass while
    //    full-size getCurrentTexture() stays black (SwiftShader-Vulkan validates
    //    but never composites; stale configure after resize does the same on
    //    real GPUs). Claim the canvas, resize to the live DPR, configure, blit
    //    one white frame to the swapchain, read back when COPY_SRC is allowed.
    async function _selfTestPresent() {
      if (!ctx || width < 1 || height < 1) return null;
      const canRead = typeof GPUMapMode !== "undefined" &&
        ((GPUTextureUsage && GPUTextureUsage.COPY_SRC) | 0) > 0 &&
        ((GPUBufferUsage && GPUBufferUsage.MAP_READ) | 0) > 0;
      if (!canRead || !blitPipeline) return null;
      let buf = null, reason = null;
      const scoped = typeof device.pushErrorScope === "function" &&
                     typeof device.popErrorScope === "function";
      if (scoped) device.pushErrorScope("validation");
      try {
        let tex;
        try { tex = ctx.getCurrentTexture(); } catch (_) { throw { _skip: true }; }
        const tw = Math.min(64, width), th = Math.min(64, height);
        const src = device.createTexture({
          size: [1, 1], format: SCENE_FORMAT,
          usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        });
        buf = device.createBuffer({ size: 256 * 4, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
        device.queue.writeBuffer(blitUBO, 0, new Float32Array([1, 0, 0, 0]));
        const bg = device.createBindGroup({
          layout: blitPipeline.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: src.createView() },
            { binding: 1, resource: linearSampler },
            { binding: 2, resource: { buffer: blitUBO } },
          ],
        });
        const enc = device.createCommandEncoder();
        if (typeof enc.copyTextureToBuffer !== "function" || typeof buf.mapAsync !== "function" ||
            typeof buf.getMappedRange !== "function") {
          throw { _skip: true };   // no readback path — runtime output probe handles it
        }
        enc.beginRenderPass({ colorAttachments: [{ view: src.createView(),
          clearValue: { r: 1, g: 1, b: 1, a: 1 }, loadOp: "clear", storeOp: "store" }] }).end();
        const pass = enc.beginRenderPass({ colorAttachments: [{ view: tex.createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 1 }, loadOp: "clear", storeOp: "store" }] });
        pass.setPipeline(blitPipeline);
        pass.setBindGroup(0, bg);
        pass.draw(3);
        pass.end();
        enc.copyTextureToBuffer(
          { texture: tex, origin: [Math.max(0, (width >> 1) - 2), Math.max(0, (height >> 1) - 2), 0] },
          { buffer: buf, bytesPerRow: 256, rowsPerImage: 4 },
          [4, 4, 1]);
        device.queue.submit([enc.finish()]);
        src.destroy();
        await buf.mapAsync(GPUMapMode.READ);
        const px = new Uint8Array(buf.getMappedRange().slice(0, 4));
        buf.unmap();
        if (!(px[0] > 8 || px[1] > 8 || px[2] > 8)) reason = "swapchain smoke test rendered black";
      } catch (e) {
        if (e && e._skip) return null;
        reason = "swapchain smoke test threw: " + (((e && e.message) || String(e)).slice(0, 200));
      }
      if (scoped) {
        const gpuErr = await device.popErrorScope();
        // Swapchain textures often lack COPY_SRC — readback is best-effort only.
        if (!reason && gpuErr) return null;
      }
      try { if (buf) buf.destroy(); } catch (_) { /* smoke-test temps already invalid */ }
      return reason;
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
    try { if (_stTimer !== null) clearTimeout(_stTimer); } catch (_) { /* timer already fired or missing in harness */ }
    const _stMs = Date.now() - _stT0;
    if (!_stReason && _stMs > SELFTEST_BUDGET_MS) {
      _stReason = "self-test took " + _stMs + " ms (budget " + SELFTEST_BUDGET_MS + " ms)";
    }
    if (_stReason) {
      try { if (typeof device.destroy === "function") device.destroy(); } catch (_) { /* device already lost; fallback still proceeds */ }
      return _fail(_stReason);
    }
    try { localStorage.removeItem("apex26.gfxWgxFail"); } catch (_) { /* blocked storage */ }
    _lastFailure = null;
    _clearGlxBound();

    // PROVEN — only now claim the canvas. Every refusal above returns with the
    // element untouched, so GLX attaches webgl2 to it on the same load and the
    // player never sees a reload. This is the last thing that can fail, and if
    // it does the canvas may be half-claimed, so it still reports through _fail
    // and game.js's reload path remains the backstop for that one case.
    try {
      ctx = canvas.getContext("webgpu");
      if (!ctx) return _fail("canvas has no webgpu context");
      if (_softGpu && _displayCanvas) {
        _displayCtx = _displayCanvas.getContext("2d", { alpha: false });
        if (!_displayCtx) return _fail("software WebGPU needs a 2D display canvas");
      }
      resize();
      const _bootCfgErr = _configureCanvas();
      if (_bootCfgErr) return _fail(_bootCfgErr);
    } catch (e) {
      return _fail("context configure threw: " + ((e && e.message) || e));
    }
    const PRESENT_TEST_MS = 4000;
    let _ptTimer = null;
    let _presentReason = null;
    if (!_outProbeOff && !_softGpu) {
      _presentReason = await Promise.race([
        _selfTestPresent().catch(function (e) {
          return "swapchain self-test threw: " + (((e && e.message) || String(e)).slice(0, 200));
        }),
        new Promise(function (res) {
          _ptTimer = setTimeout(function () { res(null); }, PRESENT_TEST_MS);
        }),
      ]);
      try { if (_ptTimer !== null) clearTimeout(_ptTimer); } catch (_) { /* timer already fired */ }
    }
    if (_presentReason) {
      try { if (typeof device.destroy === "function") device.destroy(); } catch (_) { /* device already lost */ }
      return _fail(_presentReason);
    }

    const noop = function () {};
    _runtimeReady = true;
    try { Log.info("gfx", "WGX bind ok"); } catch (_) { /* harness */ }
    // Warm the known-shipping lit-pipeline variants off the boot path. They
    // compiled synchronously on first use — the first ghost-car alpha draw,
    // first decal, first biased detail draw each landed a mid-race
    // createRenderPipeline hitch. The boot-gate pipelines above stay sync
    // (refusal detection depends on their errors surfacing); anything not in
    // this list still lazy-compiles exactly as before.
    try {
      setTimeout(function () {
        if (_lost || !_runtimeReady) return;
        const warm = [
          { alpha: 0.5 }, { alpha: 0.5, noAlphaWrite: true },
          { doubleSided: true }, { depthBias: [3, 6] }, { depthBias: [5, 10] },
          { depthBias: [-1, -2] }, { decal: true },
        ];
        const save = _passSamples;
        const counts = MSAA_COUNT > 1 ? [1, MSAA_COUNT] : [1];
        try {
          for (let c = 0; c < counts.length; c++) {
            _passSamples = counts[c];
            for (let i = 0; i < warm.length; i++) {
              try { _litPipeline(warm[i]); } catch (_) { /* lazy path still covers it */ }
            }
          }
        } finally { _passSamples = save; }
      }, 0);
    } catch (_) { /* harness without setTimeout */ }

    return {
      init() { return true; },
      resize,
      setRenderScale,
      getRenderScale() { return renderScale; },
      get width() { return width; },
      get height() { return height; },
      get aspect() { return aspect; },
      hdrMode: () => true,           // RGBA16F scene target + post chain
      msaa: () => _msaaCount,
      pcss: () => true,              // Poisson-8 + far 4-tap + blocker search (GLX parity)
      isMobile: IS_MOBILE,
      mobileTier: MOBILE_TIER,

      chunkedTrackCoords: true,
      hasPerChunkLights: true,       // consumes the LampChunks bake (trackLightSBO/chunkIdxSBO)
      createMesh,
      createTexMesh,                 // textured decals
      createChunkedMesh,
      createTexture,                 // decal atlas upload
      freeMesh,
      freeChunkedMesh,
      freeTexture,

      begin,
      present,
      draw,
      drawChunked,
      drawSky,
      drawShadow,                    // blob shadow quad, in lit pass
      drawMark,                      // single skid-mark stamp
      drawSkidBatch,                 // batched skid trail, one draw
      drawGlow,                      // additive lamp-glare billboards, HDR
      drawDecal,                     // team/sponsor decal atlas

      shadowBegin,
      castShadow,
      castShadowChunked,
      shadowEnd,
      carShadowBegin,
      carShadowEnd,

      envFaceBegin,
      envFaceEnd,
      envProbeReady() { return _envProbeLive; },
      envProbeReset,

      // Cull-test helpers (GLX parity). Optional `out` reuses a caller pool for
      // the race prop-batch path; omit it for agentview (fresh planes).
      makeFrustumPlanes(viewProj, out) {
        const p = out || [new Float32Array(4), new Float32Array(4), new Float32Array(4),
                          new Float32Array(4), new Float32Array(4), new Float32Array(4)];
        _extractPlanes(viewProj, p);
        return p;
      },
      aabbInFrustum: _aabbInFrustum,
      aabbDist2: _aabbDist2,

      // These were once absent / explicit `undefined`. They are real WGX
      // implementations now (2026-08 parity pass) and MUST remain listed here
      // because of HOW this backend is installed: game.js does
      //     Object.defineProperties(GLX, Object.getOwnPropertyDescriptors(backend))
      // so every name the backend does NOT define keeps GLX's own function —
      // and GLX's functions run against `gl`/`SHD`/`CHK`, which stay null when
      // GLX.init() was never called. A caller's feature test
      // (`if (gfx.someMissingApi)`) then PASSES and the call dies inside GLX.
      // That happened with lampShadowBegin before WGX grew a real one: game.js
      // inherited GLX's, and every night frame threw inside SHD (null) — aborting
      // tickBody before present().
      // Omitting a name (or leaving a stale "absent" comment that tempts a
      // delete) re-opens that hole. Gated by backend-surface-parity.test.mjs.
      // Honest remaining gap vs GLX: TAA scaffold (`_TAA_ENABLED`) is still off.
      drawParticles,
      lampShadowBegin,
      lampShadowEnd,
      // Active light VP for shadow-caster cull (GLX shadowCullVP parity).
      get shadowCullVP() { return _shadowLightVP; },
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
      // Car/lamp maps key on WGX_LITE (phone OR WebKit), matching GLX's
      // IS_MOBILE gate — GRAPHICS: HIGH must not buy a per-frame extra map.
      carShadowState: () => ({ enabled: !!carShadowView && !WGX_LITE, arms: _carArms }),
      lampShadowState: () => ({ enabled: !!lampShadowView && !WGX_LITE, arms: _lampArms, idx: _lampIdx }),

      // extension: reads the next presented frame back as RGBA pixels — the
      // container's pixel oracle (tools/wgx-capture.mjs); WGX-only, so the
      // backend-surface-parity test imposes nothing on GLX/TLX for it.
      capturePixels,
      awaitSoftPresent,
      invalidateSoftPresent,
      holdSoftPresent,
      softPresentState,
      roadLutReady: () => _roadLutReady,
      softPresent: () => !!_softGpu,

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
  // isSupported(): boolean feature detection for WebGPU availability.
  return {
    create,
    lastFailure: () => _lastFailure,
    gpuErrors: () => _gpuErrors,
    isSupported: () => typeof navigator !== "undefined" && !!navigator.gpu,
  };
})();

// No-build global export.
if (typeof window !== "undefined") window.WGX = WGX;
