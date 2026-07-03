/*
 * Apex 26 — WebGPU renderer backend (WGX). Migration Phase 2.
 *
 * A second implementer of the GLX draw-API contract (the ~35-method object
 * returned by js/glx.js:3693-3769). See docs/WEBGPU-MIGRATION.md,
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
 * WHAT IS STUBBED (later phases) — shadow pass, env probe, decals, skid/glow FX,
 * and the full post chain (bloom/SSAO/godray/SSR/flare/FXAA + MSAA). Each stub is
 * a safe no-op tagged with its migration phase; the frame still renders lit
 * geometry + sky + tonemap without them.
 *
 * NO build step, no ES modules: "use strict" IIFE assigning one global `WGX`.
 * WGSL lives as inline template strings (js/webgpu/wgsl-chunks.js).
 *
 * Feature-detected & inert: WGX.create() returns null on any failure so the
 * caller falls back to GLX. Constructing on a supported browser never throws.
 */
"use strict";

const WGX = (function () {
  // Mirror GLX's mobile-tier detection (js/glx.js:2035-2044).
  const IS_MOBILE = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.userAgent));
  let _gfxHigh = false;
  try { _gfxHigh = localStorage.getItem("apex26.gfxHigh") === "1"; } catch (_) {}
  const MOBILE_TIER = IS_MOBILE && !_gfxHigh;

  // Identity mat4 (column-major) fallback.
  const IDENT = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

  // ── render-target formats ──
  const SCENE_FORMAT = "rgba16float";   // HDR scene (core-renderable/blendable)
  const DEPTH_FORMAT = "depth24plus";

  // ── uniform sizes / layout (must match WGSLChunks.LIT struct comments) ──
  const FRAME_BYTES = WGSLChunks.FRAME_UNIFORM_BYTES;   // 224
  const FRAME_FLOATS = FRAME_BYTES / 4;                 // 56
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

  function toF32(a) { return a instanceof Float32Array ? a : new Float32Array(a); }

  // ── Frustum cull helpers — ported verbatim from GLX (js/glx.js:3038-3071).
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

    // device-lost -> reload (mirror GLX's context-restore policy).
    let _lost = false;
    device.lost.then(function (info) {
      if (info && info.reason === "destroyed") return;
      _lost = true;
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
    const _dynOff = [0];   // single-element dynamic-offset scratch

    // Culling frame state.
    let frameViewProj = null, frameEye = null, frameCullDist = 0;

    // GPU objects assembled below (fail -> return null).
    let g0Layout, g1Layout, litLayout, litModule, skyModule, blitModule;
    let frameUBO, lightSBO, drawUBO, blitUBO, skyUBO;
    let frameBindGroup, drawBindGroup, skyBindGroup;
    let skyPipeline, blitPipeline, linearSampler;
    const _litPipelines = new Map();

    // Scene targets (allocated on resize / size change).
    let sceneTex = null, depthTex = null, sceneView = null, depthView = null,
        blitBindGroup = null, _texW = 0, _texH = 0;

    try {
      linearSampler = device.createSampler({ magFilter: "linear", minFilter: "linear" });

      // Explicit bind-group layouts (needed for the dynamic-offset draw UBO).
      g0Layout = device.createBindGroupLayout({
        entries: [
          { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
            buffer: { type: "uniform" } },
          { binding: 1, visibility: GPUShaderStage.FRAGMENT,
            buffer: { type: "read-only-storage" } },
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

      frameBindGroup = device.createBindGroup({
        layout: g0Layout,
        entries: [
          { binding: 0, resource: { buffer: frameUBO } },
          { binding: 1, resource: { buffer: lightSBO } },
        ],
      });
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
    } catch (_) {
      return null;   // any pipeline/buffer build failure -> fall back to GLX
    }

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
        // GLX default: CCW front, cull back; alpha draws still write depth
        // (GLX draw() sets depthMask(true) unconditionally).
        primitive: { topology: "triangle-list", cullMode: dbl ? "none" : "back", frontFace: "ccw" },
        depthStencil: { format: DEPTH_FORMAT, depthWriteEnabled: true, depthCompare: "less-equal" },
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
    function ensureTargets() {
      if (width < 1 || height < 1) return;
      if (sceneTex && _texW === width && _texH === height) return;
      if (sceneTex) sceneTex.destroy();
      if (depthTex) depthTex.destroy();
      sceneTex = device.createTexture({
        size: [width, height], format: SCENE_FORMAT,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      });
      depthTex = device.createTexture({
        size: [width, height], format: DEPTH_FORMAT,
        usage: GPUTextureUsage.RENDER_ATTACHMENT,
      });
      sceneView = sceneTex.createView();
      depthView = depthTex.createView();
      blitBindGroup = device.createBindGroup({
        layout: blitPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: sceneView },
          { binding: 1, resource: linearSampler },
          { binding: 2, resource: { buffer: blitUBO } },
        ],
      });
      _texW = width; _texH = height;
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
    // Textured decal mesh — Phase 4 (decal atlas pipeline). Return a mesh-shaped
    // token so freeMesh/drawDecal hold a handle without throwing.
    function createTexMesh(_data) { return { _wgx: "texmesh", _phase: 4 }; }

    // Chunked prop mesh: ONE shared vertex buffer + per spatial XZ cell index
    // buffer, each with an AABB (port of GLX createChunkedMesh, js/glx.js:3078).
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
    // 2D texture (decals) — Phase 4. Token only; drawDecal is stubbed.
    function createTexture(_src) { return { _wgx: "texture", _phase: 4 }; }

    function freeMesh(m) { if (!m) return; if (m.vbuf) m.vbuf.destroy(); if (m.ibuf) m.ibuf.destroy(); }
    function freeChunkedMesh(m) {
      if (!m) return;
      if (m.vbuf) m.vbuf.destroy();
      if (m.ibuf) m.ibuf.destroy();
      if (m.chunks) for (let i = 0; i < m.chunks.length; i++) m.chunks[i].ibuf.destroy();
    }
    function freeTexture(_t) { /* Phase 4 */ }

    // ── frame uniform + light storage upload (mirror GLX begin(), js/glx.js:2838) ──
    function _writeFrame(f) {
      const d = frameData;
      const vp = f.viewProj || IDENT;
      d.set(vp.length >= 16 ? (vp.subarray ? vp.subarray(0, 16) : vp) : IDENT, 0);
      const eye = f.eye || [0,0,0], sd = f.sunDir || [0.3,0.6,0.5], sc = f.sunColor || [1,0.95,0.9];
      const T = f.tune || null;
      const ambM = T && T.ambientMul != null ? T.ambientMul : 1;
      const as = f.ambientSky || [0.3,0.32,0.36], ag = f.ambientGround || [0.2,0.19,0.18];
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
      skyData[42]=0; skyData[43]=0;
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
      litPass.setBindGroup(0, frameBindGroup);
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
      litPass.setBindGroup(0, frameBindGroup);
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

    // ── present(opts): close the lit pass, tonemap-blit to the swapchain ──
    function present(opts) {
      if (_lost || !encoder) return;
      if (litPass) { litPass.end(); litPass = null; }
      const exposure = (opts && opts.exposure != null) ? opts.exposure : 1.0;
      blitData[0] = exposure; blitData[1] = 0; blitData[2] = 0; blitData[3] = 0;
      device.queue.writeBuffer(blitUBO, 0, blitData);
      const bp = encoder.beginRenderPass({
        colorAttachments: [{
          view: currentView, clearValue: { r: 0, g: 0, b: 0, a: 1 },
          loadOp: "clear", storeOp: "store",
        }],
      });
      bp.setPipeline(blitPipeline);
      bp.setBindGroup(0, blitBindGroup);
      bp.draw(3, 1, 0, 0);
      bp.end();
      device.queue.submit([encoder.finish()]);
      encoder = null; currentView = null;
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
      hdrMode: () => true,           // Phase 2: RGBA16F scene target is live
      msaa: () => 1,                 // Phase 4: pipeline.multisample resolveTarget
      pcss: () => false,             // Phase 3: comparison-sampler PCF / PCSS-lite
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
      drawShadow: noop,              // Phase 3 (blob shadow quad)
      drawMark: noop,                // Phase 4 (skid-mark stamp)
      drawSkidBatch: noop,           // Phase 4/5 (batched skid marks)
      drawGlow: noop,                // Phase 4/5 (additive lamp-glare billboards)
      drawDecal: noop,               // Phase 4 (team/sponsor decal atlas)

      // ── Shadow pass (Phase 3) ──
      shadowBegin: noop,
      castShadow: noop,
      castShadowChunked: noop,
      shadowEnd: noop,

      // ── Env probe (Phase 3) ──
      envFaceBegin: noop,
      envFaceEnd: noop,
      envProbeReady() { return false; },
      envProbeReset: noop,

      // extension: lets a future __apex.gfxBackend() report the active path.
      backend: "webgpu",
    };
  }

  return { create };
})();

// No-build global export.
if (typeof window !== "undefined") window.WGX = WGX;
