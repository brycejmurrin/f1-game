/*
 * Apex 26 — WebGPU renderer backend (WGX). Migration Phase 1 skeleton.
 *
 * A second implementer of the GLX draw-API contract (the ~35-method object
 * returned by js/glx.js:3693-3769). See docs/WEBGPU-PHASE0-NOTES.md and
 * js/gfx.js for the exact interface contract and the frame/opts object shapes.
 *
 * WHAT IS REAL (Phase 1):
 *   - adapter / device acquisition (async)
 *   - canvas WebGPU context configure() with getPreferredCanvasFormat()
 *   - DPR / render-scale resize mirroring GLX.resize() (same DPR cap logic)
 *   - device-lost handling (reload, mirroring GLX's context-loss policy)
 *   - a working begin()/present() that CLEARS the swapchain to frame.fogColor
 *     and runs ONE real fullscreen-triangle SKY pass (WGSLChunks.SKY) — proving
 *     device + context + pipeline + shader + uniform-buffer end-to-end.
 *
 * WHAT IS STUBBED (later phases) — every heavy GLX method is present so the
 * object satisfies the interface, but is a safe no-op (draw geometry / post /
 * shadow / env are simply skipped; the frame still clears + shows sky). Each
 * stub is tagged with the migration phase that must fill it in.
 *
 * NO build step, no ES modules: "use strict" IIFE assigning one global `WGX`.
 * WGSL lives as inline template strings (in js/webgpu/wgsl-chunks.js).
 *
 * Feature-detected & inert: WGX.create() returns null on any failure (no
 * navigator.gpu, no adapter, no device, context config throw) so the caller
 * falls back to GLX. Constructing on a supported browser never throws.
 */
"use strict";

const WGX = (function () {
  // Mirror GLX's mobile-tier detection (js/glx.js:2035-2044) so the DPR cap and
  // future memory downgrades match the WebGL2 path exactly.
  const IS_MOBILE = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.userAgent));
  let _gfxHigh = false;
  try { _gfxHigh = localStorage.getItem("apex26.gfxHigh") === "1"; } catch (_) {}
  const MOBILE_TIER = IS_MOBILE && !_gfxHigh;

  // Identity mat4 (column-major) fallback when a frame omits invViewProj.
  const IDENT = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

  /**
   * WGX.create(canvas, opts) -> Promise<backend | null>
   * Async because requestAdapter/requestDevice are promises (a real change from
   * GLX's synchronous getContext("webgl2")). Returns a ready backend object that
   * implements the GLX interface, or null on any failure/unsupported browser.
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
      return null;   // adapter/device unavailable -> caller falls back to GLX
    }

    try {
      ctx = canvas.getContext("webgpu");
      if (!ctx) return null;
      format = navigator.gpu.getPreferredCanvasFormat();   // usually bgra8unorm
      ctx.configure({ device, format, alphaMode: "opaque" });
    } catch (_) {
      return null;
    }

    // ── device-lost policy: mirror GLX's webglcontextrestored -> reload. A lost
    //    device invalidates every GPU resource; cleanest recovery is a reload
    //    that rebuilds them. (Ignore intentional destroy() teardown.) ──
    let _lost = false;
    device.lost.then(function (info) {
      if (info && info.reason === "destroyed") return;
      _lost = true;
      try { location.reload(); } catch (_) {}
    });

    // ── state ──
    let width = 0, height = 0, aspect = 1, renderScale = 1;
    let lastFrame = null;

    // ── SKY pipeline (the one real pass) ──
    let skyModule, skyPipeline, skyBindGroup, skyUBO;
    const skyData = new Float32Array(WGSLChunks.SKY_UNIFORM_BYTES / 4);   // 44 floats

    try {
      skyModule = device.createShaderModule({ code: WGSLChunks.SKY });
      skyUBO = device.createBuffer({
        size: WGSLChunks.SKY_UNIFORM_BYTES,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      });
      skyPipeline = device.createRenderPipeline({
        layout: "auto",
        vertex: { module: skyModule, entryPoint: "vs_main" },
        fragment: { module: skyModule, entryPoint: "fs_main", targets: [{ format }] },
        primitive: { topology: "triangle-list" },
        // No depth: the sky is a full-screen fill; geometry passes (Phase 2) add
        // their own depth attachment.
      });
      skyBindGroup = device.createBindGroup({
        layout: skyPipeline.getBindGroupLayout(0),
        entries: [{ binding: 0, resource: { buffer: skyUBO } }],
      });
    } catch (_) {
      return null;   // pipeline build failed -> fall back to GLX
    }

    // ── resize: mirror GLX.resize() (js/glx.js:2585-2603). Cap DPR at 1.5 on the
    //    mobile tier, else 2; multiply by renderScale. WebGPU sizes off
    //    canvas.width/height, so no explicit reconfigure is needed on resize (the
    //    context tracks the canvas backing store). ──
    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, MOBILE_TIER ? 1.5 : 2);
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr * renderScale));
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr * renderScale));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      width = w; height = h; aspect = w / h;
    }

    function setRenderScale(s) {
      s = Math.max(0.5, Math.min(1, s));
      if (Math.abs(s - renderScale) < 0.02) return false;
      renderScale = s;
      resize();
      return true;
    }

    // Pack the frame's sky-relevant fields into the SkyU uniform block. Layout
    // MUST match struct SkyU in WGSLChunks.SKY (vec3s padded to vec4).
    function _writeSky(frame) {
      const f = frame || {};
      const ivp = f.invViewProj || IDENT;
      skyData.set(ivp.length >= 16 ? ivp.subarray ? ivp.subarray(0, 16) : ivp : IDENT, 0);
      const z = f.skyZenith || [0.18, 0.40, 0.78];
      const h = f.skyHorizon || [0.62, 0.74, 0.88];
      const sd = f.sunDir || [0.3, 0.6, 0.5];
      const sc = f.sunColor || [1.0, 0.95, 0.9];
      const cg = f.cityGlow || [0, 0, 0];
      skyData[16] = z[0]; skyData[17] = z[1]; skyData[18] = z[2]; skyData[19] = 0;
      skyData[20] = h[0]; skyData[21] = h[1]; skyData[22] = h[2]; skyData[23] = 0;
      skyData[24] = sd[0]; skyData[25] = sd[1]; skyData[26] = sd[2]; skyData[27] = 0;
      skyData[28] = sc[0]; skyData[29] = sc[1]; skyData[30] = sc[2]; skyData[31] = 0;
      skyData[32] = cg[0]; skyData[33] = cg[1]; skyData[34] = cg[2]; skyData[35] = 0;
      skyData[36] = f.stars ? 1 : 0;
      skyData[37] = f.cloud != null ? f.cloud : 0;
      skyData[38] = f.time != null ? f.time : 0;
      skyData[39] = f.moon != null ? f.moon : 0;
      skyData[40] = f.starBright != null ? f.starBright : 1;
      skyData[41] = f.cloudSpeed != null ? f.cloudSpeed : 1;
      skyData[42] = 0; skyData[43] = 0;
      device.queue.writeBuffer(skyUBO, 0, skyData);
    }

    // ── begin(frame): open the frame. Acquire the swapchain texture, clear it to
    //    frame.fogColor, and draw the real SKY fullscreen triangle. In Phase 2
    //    the geometry passes are appended to this same encoder before present().
    //    NOTE: the public drawSky()/draw*() below are still stubs; begin() draws
    //    the sky itself as the pipeline proof until drawSky() is implemented. ──
    let encoder = null, currentView = null;
    function begin(frame) {
      if (_lost) return false;
      lastFrame = frame || null;
      let tex;
      try {
        tex = ctx.getCurrentTexture();
      } catch (_) {
        return false;
      }
      currentView = tex.createView();
      const fc = (frame && frame.fogColor) || [0.5, 0.6, 0.7];
      _writeSky(frame);
      encoder = device.createCommandEncoder();
      const pass = encoder.beginRenderPass({
        colorAttachments: [{
          view: currentView,
          clearValue: { r: fc[0], g: fc[1], b: fc[2], a: 1 },
          loadOp: "clear",
          storeOp: "store",
        }],
      });
      pass.setPipeline(skyPipeline);
      pass.setBindGroup(0, skyBindGroup);
      pass.draw(3, 1, 0, 0);
      pass.end();
      return true;
    }

    // ── present(opts): submit the frame. In Phase 4 this runs the post chain;
    //    for the skeleton it just submits the clear+sky encoder. ──
    function present(_opts) {
      if (_lost || !encoder) return;
      device.queue.submit([encoder.finish()]);
      encoder = null;
      currentView = null;
    }

    // ── STUBS — present for interface completeness, filled in by later phases.
    //    Geometry/shadow/env/post are skipped safely: the frame still clears and
    //    shows the sky, so the game boots and renders *something* on the WebGPU
    //    path without any of these implemented. ──
    const noop = function () {};

    // Phase 2 — meshes become GPUBuffers + vertex layouts (js/glx.js:2617-2692).
    // Return a token object so callers can hold/free a handle without throwing.
    function createMesh(_data) { return { _wgx: "mesh", _phase: 2 }; }
    function createTexMesh(_data) { return { _wgx: "texmesh", _phase: 2 }; }
    function createChunkedMesh(_data, _cell) { return { _wgx: "chunked", _phase: 2, chunks: [] }; }
    function createTexture(_src) { return { _wgx: "texture", _phase: 2 }; }

    return {
      // ── Lifecycle / targets ──
      // init() is a no-op here: WGX.create() already acquired the device
      // asynchronously. Present only so the object matches GLX's surface.
      init() { return true; },
      resize,
      setRenderScale,
      getRenderScale() { return renderScale; },
      get width() { return width; },
      get height() { return height; },
      get aspect() { return aspect; },
      // HDR is guaranteed (rgba16float is core-renderable in WebGPU); until the
      // Phase 2 scene target exists we report the swapchain reality (LDR).
      hdrMode: () => false,          // Phase 2: true once RGBA16F scene target lands
      msaa: () => 1,                 // Phase 4: pipeline.multisample resolveTarget
      pcss: () => false,             // Phase 3: comparison-sampler PCF / PCSS-lite
      isMobile: IS_MOBILE,
      mobileTier: MOBILE_TIER,

      // ── Resources (Phase 2) ──
      createMesh,
      createTexMesh,
      createChunkedMesh,
      createTexture,
      freeMesh: noop,                // Phase 2: buffer.destroy()
      freeChunkedMesh: noop,         // Phase 2
      freeTexture: noop,             // Phase 2

      // ── Frame ──
      begin,
      present,
      // Geometry draws — Phase 2 (Lit pipeline + FRAME UBO + light storage buffer
      // + per-draw model/material via dynamic offsets). No-op for now.
      draw: noop,                    // Phase 2
      drawChunked: noop,             // Phase 2
      // Sky — the WGSL SKY shader is REAL and already runs inside begin(); this
      // public entry point becomes the driver of it in Phase 2 (when begin() stops
      // auto-drawing the sky and game.js's drawSky(sky) supplies the sky object).
      drawSky: noop,                 // Phase 2 (shader itself is done)
      drawShadow: noop,              // Phase 2/3 (blob shadow quad)
      drawMark: noop,                // Phase 2 (skid-mark stamp)
      drawSkidBatch: noop,           // Phase 2 (batched skid marks)
      drawGlow: noop,                // Phase 2 (additive lamp-glare billboards)
      drawDecal: noop,               // Phase 2 (team/sponsor decal atlas)

      // ── Shadow pass (Phase 3) ──
      shadowBegin: noop,             // Phase 3: depth-only render pass
      castShadow: noop,              // Phase 3
      castShadowChunked: noop,       // Phase 3
      shadowEnd: noop,               // Phase 3

      // ── Env probe (Phase 3) ──
      envFaceBegin: noop,            // Phase 3: per-cube-face render pass
      envFaceEnd: noop,              // Phase 3
      envProbeReady() { return false; },   // Phase 3 (no probe yet)
      envProbeReset: noop,           // Phase 3

      // ── extension: lets a future __apex.gfxBackend() report the active path.
      //    Not part of the GLX surface; harmless additive property.
      backend: "webgpu",
    };
  }

  return { create };
})();

// No-build global export.
if (typeof window !== "undefined") window.WGX = WGX;
