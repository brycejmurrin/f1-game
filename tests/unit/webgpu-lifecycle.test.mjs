import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const ROOT = new URL("../..", import.meta.url);
const P = (await import("node:module")).createRequire(import.meta.url)("../../tools/manifest.cjs").PATHS;
const [CHUNKS_SOURCE, POST_SOURCE, FX_SOURCE, WGX_SOURCE] = await Promise.all([
  readFile(new URL(P.WGSL_CHUNKS, ROOT), "utf8"),
  readFile(new URL(P.WGSL_POST, ROOT), "utf8"),
  readFile(new URL("js/render/webgpu/wgsl-fx.js", ROOT), "utf8"),
  readFile(new URL(P.WGX, ROOT), "utf8"),
]);

// The light storage buffer's size, DERIVED from the same constants WGX derives
// it from rather than restated here. It was hardcoded as 2048, which stopped
// being true the moment MAX_LIGHTS went 32 -> 48 (64 B x 48 = 3072): the filter
// below matched no buffer and the god-ray test failed on the deploy branch. A
// test that names a number the source owns goes stale silently the next time
// that number moves, so read it from the source.
const LIGHT_SBO_BYTES =
  Number(/LIGHT_STRIDE_BYTES:\s*(\d+)/.exec(CHUNKS_SOURCE)[1]) *
  Number(/MAX_LIGHTS:\s*(\d+)/.exec(CHUNKS_SOURCE)[1]);

// opts lets a test pick a REAL WebGPU failure shape. Defaults keep the healthy
// device every existing test was written against, so these are new switches and
// never a changed baseline:
//   bornLost    — requestDevice resolves a device whose `lost` is ALREADY
//                 resolved. Per spec requestDevice ALWAYS returns a GPUDevice,
//                 even when it cannot give a valid one, so this — not a null
//                 return — is what a failed device acquisition looks like.
//   shaderError — createShaderModule reports an error through
//                 getCompilationInfo(), the way a WGSL module rejected by the
//                 driver does. Safari 26 is where this actually bites.
function makeGpuHarness(opts = {}) {
  const textures = [];
  const buffers = [];
  const writes = [];
  const pipelines = [];
  let textureCalls = 0;
  let viewCalls = 0;
  let bindGroupCalls = 0;
  let failTextureAt = Infinity;
  let failViewAt = Infinity;
  let failBindGroupAt = Infinity;
  let now = 10_000;

  const pass = new Proxy({}, { get: () => () => {} });
  const pipeline = { getBindGroupLayout: () => ({}) };
  const pipelineDescs = [];
  // Optional persistent/session storage backing (Maps) so the loss-escalation
  // ladder (apex26.gfxWgxLevel) and the session GLX skip can be asserted.
  const stored = opts.storage || null;
  const session = opts.session || null;
  // Optional feature negotiation. Default is the historical harness: a
  // timestamp-query-only device, which is also the tier that must DOWNGRADE
  // POST_HDR_FORMAT (rg11b10ufloat is renderable only behind its own feature).
  const adapterFeatures = opts.adapterFeatures || ["timestamp-query"];
  const deviceFeatures = opts.deviceFeatures || adapterFeatures;
  const deviceRequests = [];
  let loseDevice = null;
  let failEncoder = false;
  const device = {
    // Three distinct states, because they fail differently: a healthy device
    // whose `lost` never settles, one the test can lose LATER via loseDevice()
    // (the escalation ladder), and one that arrives ALREADY lost — which is what
    // a failed requestDevice actually looks like, since the spec has it always
    // resolve a GPUDevice.
    lost: opts.bornLost
      ? Promise.resolve({ reason: "unknown", message: "injected born-lost device" })
      : new Promise((resolve) => { loseDevice = resolve; }),
    queue: {
      writeBuffer(buffer, offset, data, dataOffset = 0, size) {
        const values = Array.from(data).slice(dataOffset, size == null ? undefined : dataOffset + size);
        writes.push({ buffer, offset, values });
      },
      writeTexture() {},
      copyExternalImageToTexture() {},
      submit() {},
    },
    createSampler: () => ({}),
    createBindGroupLayout: () => ({}),
    createPipelineLayout: () => ({}),
    // Real GPUShaderModules expose getCompilationInfo(). The old mock returned a
    // bare {}, so create()'s "check every shader module's compilation info" step
    // hit its own "a check that cannot be RUN is skipped, never fatal" rule and
    // was inert in every test — the guard that matters most on Safari.
    createShaderModule: () => ({
      getCompilationInfo: async () => ({
        messages: opts.shaderError
          ? [{ type: "error", message: "injected WGSL compile error", lineNum: 1, linePos: 1 }]
          : [],
      }),
    }),
    // The DESCRIPTOR is kept, not just the count: a target format or a
    // multisample count that WebGPU rejects is invisible to a harness that
    // throws the descriptor away, and both of those shipped. (The pipeline
    // half of the sampleCount guard was reading an undefined h.pipelines and
    // passing vacuously.) Two lineages grew two readers of this — the raw desc
    // for the depth-compare guards, the wrapped one for the format guards — so
    // it feeds both rather than renaming one and breaking its tests.
    createRenderPipeline: (desc) => {
      pipelineDescs.push(desc);
      pipelines.push({ desc });
      return pipeline;
    },
    createQuerySet: () => ({ count: 2 }),
    createCommandEncoder: () => {
      if (failEncoder) throw new Error("injected encoder failure");
      return {
        beginRenderPass: () => pass,
        resolveQuerySet() {},
        copyBufferToBuffer() {},
        finish: () => ({}),
      };
    },
    createTexture(desc) {
      textureCalls += 1;
      if (textureCalls === failTextureAt) throw new Error("injected texture failure");
      const texture = {
        desc,
        destroyed: false,
        destroy() { this.destroyed = true; },
        createView(viewDesc) {
          viewCalls += 1;
          if (viewCalls === failViewAt) throw new Error("injected view failure");
          return { texture, viewDesc };
        },
      };
      textures.push(texture);
      return texture;
    },
    createBuffer(desc) {
      const buffer = {
        desc,
        destroyed: false,
        destroy() { this.destroyed = true; },
        getMappedRange: () => new ArrayBuffer(desc.size),
        unmap() {},
        mapState: "unmapped",
        mapAsync: async () => {},
      };
      buffers.push(buffer);
      return buffer;
    },
    createBindGroup(desc) {
      bindGroupCalls += 1;
      if (bindGroupCalls === failBindGroupAt) throw new Error("injected bind-group failure");
      // VALIDATE, the way a real implementation does. This mock used to accept
      // any descriptor at all, so a group built from resources that did not
      // exist yet passed every test and then threw on a real device. That is
      // exactly how WGX shipped an init() that bound a null matScaleUBO and
      // aborted on an iPhone with "Member GPUBufferBinding.buffer is required
      // and must be an instance of GPUBuffer" — the message below is Safari's,
      // copied verbatim so a failure here reads like the one a player gets.
      for (const e of (desc && desc.entries) || []) {
        if (e.resource == null) {
          throw new Error("Member GPUBindGroupEntry.resource is required (binding " + e.binding + ")");
        }
        if (typeof e.resource === "object" && "buffer" in e.resource && !e.resource.buffer) {
          throw new Error("Member GPUBufferBinding.buffer is required and must be an instance of GPUBuffer");
        }
      }
      return {};
    },
  };
  const canvasTexture = { createView: () => ({ swapchain: true }) };
  // A canvas is bound to ONE context type for life: once getContext("webgpu")
  // succeeds, getContext("webgl2") returns null on that element forever. That is
  // the whole reason a WGX refusal costs a page reload, and the old mock — which
  // handed back a fresh context object for any argument and recorded nothing —
  // could not express it, so no test could ever see the cost.
  let claimedBy = null;
  const canvas = {
    clientWidth: 320,
    clientHeight: 180,
    width: 0,
    height: 0,
    getContext: (type) => {
      if (claimedBy && claimedBy !== type) return null;
      claimedBy = type;
      return { configure() {}, getCurrentTexture: () => canvasTexture };
    },
  };
  const context = vm.createContext({
    console,
    Float32Array,
    Uint16Array,
    Uint32Array,
    ArrayBuffer,
    Math,
    Proxy,
    Date: { now: () => now },
    // WGX arms a stall watchdog around its boot self-test (SELFTEST_BUDGET_MS)
    // and clears it on the way out. Without timers in the sandbox the module
    // throws `setTimeout is not defined` and every test here fails before it
    // asserts anything. `unref()` so a watchdog that somehow outlives its race
    // cannot hold the test runner open.
    setTimeout: (fn, ms) => { const t = setTimeout(fn, ms); if (t.unref) t.unref(); return t; },
    clearTimeout: (t) => clearTimeout(t),
    window: { devicePixelRatio: 1 },
    localStorage: stored ? {
      getItem: (k) => (stored.has(k) ? stored.get(k) : null),
      setItem: (k, v) => { stored.set(k, String(v)); },
      removeItem: (k) => { stored.delete(k); },
    } : { getItem: () => null, setItem() {} },
    ...(session ? { sessionStorage: {
      getItem: (k) => (session.has(k) ? session.get(k) : null),
      setItem: (k, v) => {
        if (opts.blockSession) throw new Error("blocked sessionStorage");
        session.set(k, String(v));
      },
      removeItem: (k) => { session.delete(k); },
    } } : {}),
    location: { reload() { if (opts.onReload) opts.onReload(); } },
    GLX: opts.glx || undefined,
    navigator: {
      userAgent: opts.ua || "",
      maxTouchPoints: 0,
      gpu: {
        requestAdapter: async () => ({
          features: { has: (name) => adapterFeatures.includes(name) },
          // Non-empty info = "hardware" for WGX's software-adapter gate.
          // Real Dawn SwiftShader often reports {}.
          info: opts.softAdapter
            ? {}
            : { vendor: "test", architecture: "test", device: "mock-gpu" },
          isFallbackAdapter: !!opts.softAdapter,
          requestDevice: async (desc) => {
            deviceRequests.push((desc && desc.requiredFeatures) || []);
            // The DEVICE answer is deliberately separate from the adapter's:
            // an adapter may advertise a feature and hand back a device without
            // it, and WGX has to re-derive from the device it actually holds.
            device.features = { has: (name) => deviceFeatures.includes(name) };
            return device;
          },
        }),
        getPreferredCanvasFormat: () => "bgra8unorm",
      },
    },
    GPUTextureUsage: { RENDER_ATTACHMENT: 1, TEXTURE_BINDING: 2, COPY_DST: 4, COPY_SRC: 8 },
    GPUBufferUsage: { UNIFORM: 1, COPY_DST: 2, STORAGE: 4, VERTEX: 8, INDEX: 16, QUERY_RESOLVE: 32, MAP_READ: 64, COPY_SRC: 128 },
    GPUShaderStage: { VERTEX: 1, FRAGMENT: 2 },
    GPUColorWrite: { RED: 1, GREEN: 2, BLUE: 4, ALL: 15 },
    GPUMapMode: { READ: 1 },
  });
  context.window.window = context.window;
  vm.runInContext(`${CHUNKS_SOURCE}\nwindow.WGSLChunks = WGSLChunks;`, context);
  vm.runInContext(`${POST_SOURCE}\nwindow.WGSLPost = WGSLPost;`, context);
  vm.runInContext(`${FX_SOURCE}\nwindow.WGSLFx = WGSLFx;`, context);
  vm.runInContext(`${WGX_SOURCE}\nwindow.WGX = WGX;`, context);

  return {
    canvas,
    device,
    textures,
    buffers,
    writes,
    pipelineDescs,
    WGX: context.window.WGX,
    pipelines,
    deviceRequests,
    create: () => context.window.WGX.create(canvas),
    // What the GLX fallback would find: null while the canvas is still free for
    // a webgl2 context, "webgpu" once WGX has claimed it.
    canvasClaimedBy: () => claimedBy,
    textureCount: () => textureCalls,
    failNextTexture(offset = 1) { failTextureAt = textureCalls + offset; },
    failNextView(offset = 1) { failViewAt = viewCalls + offset; },
    failNextBindGroup(offset = 1) { failBindGroupAt = bindGroupCalls + offset; },
    clearFailures() { failTextureAt = failViewAt = failBindGroupAt = Infinity; },
    advanceTime(ms) { now += ms; },
    loseDevice: (info) => loseDevice(info || { reason: "unknown" }),
    setEncoderFail(v) { failEncoder = !!v; },
  };
}

test("post resize keeps old resources valid and cleans partial texture allocation", async () => {
  const h = makeGpuHarness();
  const gfx = await h.create();
  gfx.resize();
  const targetTextureStart = h.textures.length;
  assert.equal(gfx.begin({}), true);
  const oldTextures = h.textures.slice(targetTextureStart);

  h.canvas.clientWidth = 640;
  gfx.resize();
  const beforeAttempt = h.textures.length;
  h.failNextTexture(3);
  assert.equal(gfx.begin({}), true);

  assert.ok(oldTextures.every((resource) => !resource.destroyed), "old targets must survive failed resize");
  assert.ok(
    h.textures.slice(beforeAttempt).every((resource) => resource.destroyed),
    "every partial replacement texture must be destroyed",
  );
});

test("bloom texture is cleaned when its createView allocation fails", async () => {
  const h = makeGpuHarness();
  const gfx = await h.create();
  gfx.resize();
  assert.equal(gfx.begin({}), true);

  h.canvas.clientWidth = 640;
  gfx.resize();
  const replacementStart = h.textures.length;
  h.failNextView(8);
  assert.equal(gfx.begin({}), true);

  assert.ok(
    h.textures.slice(replacementStart).every((resource) => resource.destroyed),
    "the bloom texture must be owned before createView can throw",
  );
});

test("post resize destroys replaced bloom buffers and cleans partial buffer allocation", async () => {
  const h = makeGpuHarness();
  const gfx = await h.create();
  gfx.resize();
  const targetTextureStart = h.textures.length;
  const targetBufferStart = h.buffers.length;
  assert.equal(gfx.begin({}), true);
  const oldTextures = h.textures.slice(targetTextureStart);
  const oldPostBuffers = h.buffers.slice(targetBufferStart);

  h.canvas.clientWidth = 480;
  gfx.resize();
  h.failNextBindGroup(4);
  const failedBufferStart = h.buffers.length;
  assert.equal(gfx.begin({}), true);
  assert.ok(oldPostBuffers.every((resource) => !resource.destroyed));
  assert.ok(h.buffers.slice(failedBufferStart).every((resource) => resource.destroyed));

  h.clearFailures();
  h.canvas.clientWidth = 481;
  gfx.resize();
  assert.equal(gfx.begin({}), true);
  assert.ok(oldTextures.every((resource) => resource.destroyed), "replaced textures must be destroyed");
  assert.ok(oldPostBuffers.every((resource) => resource.destroyed), "replaced bloom UBOs must be destroyed");
});

test("persistent resize allocation failures do not recreate the scene pair every frame", async () => {
  const h = makeGpuHarness();
  const gfx = await h.create();
  gfx.resize();
  assert.equal(gfx.begin({}), true);

  h.canvas.clientWidth = 512;
  gfx.resize();
  h.failNextTexture();
  assert.equal(gfx.begin({}), true);
  const callsAfterFailure = h.textureCount();

  assert.equal(gfx.begin({}), true);
  assert.equal(h.textureCount(), callsAfterFailure, "immediate retry must keep the old transactional fallback");
});

test("a different target size bypasses the allocation retry cooldown", async () => {
  const h = makeGpuHarness();
  const gfx = await h.create();
  gfx.resize();
  assert.equal(gfx.begin({}), true);

  h.canvas.clientWidth = 512;
  gfx.resize();
  h.failNextTexture();
  assert.equal(gfx.begin({}), true);
  const callsAfterFailure = h.textureCount();

  h.clearFailures();
  h.canvas.clientWidth = 513;
  gfx.resize();
  assert.equal(gfx.begin({}), true);
  assert.ok(h.textureCount() > callsAfterFailure, "new dimensions must retry immediately");
});

test("the same target size retries after the allocation cooldown", async () => {
  const h = makeGpuHarness();
  const gfx = await h.create();
  gfx.resize();
  assert.equal(gfx.begin({}), true);

  h.canvas.clientWidth = 512;
  gfx.resize();
  h.failNextTexture();
  assert.equal(gfx.begin({}), true);
  const callsAfterFailure = h.textureCount();

  h.clearFailures();
  h.advanceTime(1001);
  assert.equal(gfx.begin({}), true);
  assert.ok(h.textureCount() > callsAfterFailure, "same dimensions must recover after cooldown");
});

test("WebGPU packed uniforms expose tuner defaults, offsets, and extreme uploads", async () => {
  assert.match(CHUNKS_SOURCE, /params6\s*:\s*vec4<f32>.*wetDark/);
  assert.match(CHUNKS_SOURCE, /shadowCtr\s*:\s*vec4<f32>.*off 352/);
  assert.match(CHUNKS_SOURCE, /params6\s*:\s*vec4<f32>.*off 368/);
  assert.match(CHUNKS_SOURCE, /params7\s*:\s*vec4<f32>.*off 448/);
  assert.match(CHUNKS_SOURCE, /params9\s*:\s*vec4<f32>.*ambContactDark/);
  assert.match(CHUNKS_SOURCE, /FRAME_UNIFORM_BYTES:\s*560/);
  assert.match(POST_SOURCE, /COMPOSITE_UNIFORM_BYTES:\s*256/);
  assert.match(POST_SOURCE, /dirtFx\s*:\s*vec4<f32>.*off 240/);

  const h = makeGpuHarness();
  const gfx = await h.create();
  gfx.resize();
  assert.equal(gfx.begin({ tune: {}, shadowCtr: [11, 22, 33] }), true);
  gfx.present({ tune: {} });
  const frameBuffer = h.buffers.find((buffer) => buffer.desc.size === 560);
  const compositeBuffer = h.buffers.find((buffer) => buffer.desc.size === 256);
  let frame = h.writes.filter((write) => write.buffer === frameBuffer).at(-1).values;
  assert.deepEqual(frame.slice(88, 92), [11, 22, 33, 80], "shadowCtr must occupy floats 88..91");
  // params6 = (wetDark, carShadowOn, carSparkle, fogSunCore). Car shadow is
  // unarmed in this harness (float 93 = 0); the pure-look CAR SPARKLE (1.6) and
  // FOG SUN CORE (0.6) knobs occupy floats 94/95 and are always packed.
  // (f32 rounding: 1.6/0.6 aren't exactly representable, so compare with a tol.)
  assert.equal(frame[92], 1, "wetDark in params6.x (float 92)");
  assert.equal(frame[93], 0, "car-shadow unarmed in params6.y (float 93)");
  assert.ok(Math.abs(frame[94] - 1.6) < 1e-6, "carSparkle default in params6.z (float 94)");
  assert.ok(Math.abs(frame[95] - 0.6) < 1e-6, "fogSunCore default in params6.w (float 95)");
  // params7 = (fogClip, carSunGlint, neonBoost, lampNearClamp) — GLX-parity lit
  // knobs at off 448 = floats 112..115. Defaults reproduce the shipped GLX look.
  // (f32 rounding: 0.7/12.0/0.6 aren't exactly representable, so compare with a
  // tol; lampNearClamp's 4.0 IS exact.)
  assert.ok(Math.abs(frame[112] - 0.7) < 1e-6, "fogClip default in params7.x (float 112)");
  assert.ok(Math.abs(frame[113] - 12.0) < 1e-6, "carSunGlint default in params7.y (float 113)");
  assert.ok(Math.abs(frame[114] - 0.6) < 1e-6, "neonBoost default in params7.z (float 114)");
  assert.equal(frame[115], 4.0, "lampNearClamp default in params7.w (float 115)");
  // params9 = (ambContactDark, lampWallSpill, windowSunFlash, skyRimGlow) at
  // off 544 = floats 136..139. Defaults 1.0 = shipped GLX look.
  assert.equal(frame[136], 1, "ambContactDark default in params9.x (float 136)");
  assert.equal(frame[137], 1, "lampWallSpill default in params9.y (float 137)");
  assert.equal(frame[138], 1, "windowSunFlash default in params9.z (float 138)");
  assert.equal(frame[139], 1, "skyRimGlow default in params9.w (float 139)");
  let composite = h.writes.filter((write) => write.buffer === compositeBuffer).at(-1).values;
  assert.equal(composite[31], 0.5);
  assert.ok(Math.abs(composite[32] - 0.35) < 1e-6);
  // tuneFx.y/z/w = FLARE CORE STREAK (0.5) + ACES tone-curve e (0.14) + FLARE
  // STREAK width (7.0) defaults.
  assert.ok(Math.abs(composite[33] - 0.5) < 1e-6, "flareStreak2 default in tuneFx.y (float 33)");
  assert.ok(Math.abs(composite[34] - 0.14) < 1e-6, "acesE default in tuneFx.z (float 34)");
  assert.ok(Math.abs(composite[35] - 7.0) < 1e-6, "flareStreak default in tuneFx.w (float 35)");
  assert.deepEqual(composite.slice(36, 44), [0, 0, 0, 0, 0, 0, 0, 0]);
  assert.deepEqual(composite.slice(44, 48), [0, 0, 0, 0]);
  assert.deepEqual(composite.slice(48, 52), [1, 1, 1, 0]);
  assert.deepEqual(composite.slice(52, 56), [1, 1, 1, 0]);
  // aces vec4 (floats 56..59) = shipped Narkowicz coefficients a,b,c,d.
  // (f32 rounding: none of these are exactly representable, so compare with a tol.)
  const ACES_DEF = [2.51, 0.03, 2.43, 0.59];
  for (let i = 0; i < 4; i++) {
    assert.ok(Math.abs(composite[56 + i] - ACES_DEF[i]) < 1e-6, `ACES tone-curve default float ${56 + i}`);
  }
  // dirtFx = (lensDirt, hazeU, hazeV, hazeStr) at off 240 = floats 60..63.
  // Default 0.15 reproduces the shipped GLX lens-dirt strength; haze is off.
  assert.ok(Math.abs(composite[60] - 0.15) < 1e-6, "lensDirt default in dirtFx.x (float 60)");
  assert.deepEqual(composite.slice(61, 64), [0, 0, 0], "haze defaults must be 0 (floats 61..63)");

  // Extreme upload: powers-of-two fractions (0.25/0.75/3.5 …) are exactly f32-
  // representable, so these lanes can be compared exactly. carSparkle/fogSunCore
  // live in the FRAME uniform (params6, written at begin()); flareStreak2/aces*
  // and the HDR grade live in the COMPOSITE uniform (written at present()).
  assert.equal(gfx.begin({ tune: { wetDark: -7, carSparkle: 0.25, fogSunCore: 0.75,
    fogClip: 0.5, carSunGlint: 3.5, neonBoost: 0.75, lampNearClamp: 2.5,
    ambContactDark: 0.25, lampWallSpill: 0.75, windowSunFlash: 2.5, skyRimGlow: 3.5 },
    shadowCtr: [44, 55, 66] }), true);
  gfx.present({ tune: {
    bloomKnee: 4.25, vignetteSoft: -2.5,
    flareStreak2: 1.75, flareStreak: 3.5,
    acesA: 3, acesB: 0.25, acesC: 3.5, acesD: 0.75, acesE: 0.5,
    blacks: 1, shadows: 2, midtones: 3, highlights: 4, whites: 5,
    toe: 6, shoulder: 7,
    liftR: 8, liftG: 9, liftB: 10,
    gammaR: 11, gammaG: 12, gammaB: 13,
    gainR: 14, gainG: 15, gainB: 16,
    lensDirt: 0.75,
  }, haze: { u: 0.25, v: 0.75, str: 0.5 } });
  frame = h.writes.filter((write) => write.buffer === frameBuffer).at(-1).values;
  assert.deepEqual(frame.slice(88, 92), [44, 55, 66, 80], "wetDark must not overwrite shadowCtr");
  assert.equal(frame[92], -7);
  assert.equal(frame[94], 0.25, "carSparkle must occupy params6.z (float 94)");
  assert.equal(frame[95], 0.75, "fogSunCore must occupy params6.w (float 95)");
  assert.equal(frame[112], 0.5, "fogClip must occupy params7.x (float 112)");
  assert.equal(frame[113], 3.5, "carSunGlint must occupy params7.y (float 113)");
  assert.equal(frame[114], 0.75, "neonBoost must occupy params7.z (float 114)");
  assert.equal(frame[115], 2.5, "lampNearClamp must occupy params7.w (float 115)");
  assert.equal(frame[136], 0.25, "ambContactDark must occupy params9.x (float 136)");
  assert.equal(frame[137], 0.75, "lampWallSpill must occupy params9.y (float 137)");
  assert.equal(frame[138], 2.5, "windowSunFlash must occupy params9.z (float 138)");
  assert.equal(frame[139], 3.5, "skyRimGlow must occupy params9.w (float 139)");
  composite = h.writes.filter((write) => write.buffer === compositeBuffer).at(-1).values;
  assert.equal(composite[31], 4.25);
  assert.equal(composite[32], -2.5);
  assert.equal(composite[33], 1.75, "flareStreak2 must occupy tuneFx.y (float 33)");
  assert.equal(composite[34], 0.5, "acesE must occupy tuneFx.z (float 34)");
  assert.equal(composite[35], 3.5, "flareStreak must occupy tuneFx.w (float 35)");
  assert.deepEqual(composite.slice(56, 60), [3, 0.25, 3.5, 0.75], "aces a,b,c,d must occupy floats 56..59");
  assert.equal(composite[60], 0.75, "lensDirt must occupy dirtFx.x (float 60)");
  assert.equal(composite[61], 0.25, "haze.u must occupy dirtFx.y (float 61)");
  assert.equal(composite[62], 0.75, "haze.v must occupy dirtFx.z (float 62)");
  assert.equal(composite[63], 0.5, "haze.str must occupy dirtFx.w (float 63)");
  assert.deepEqual(composite.slice(36, 40), [1, 2, 3, 4], "tone0 must occupy floats 36..39");
  assert.deepEqual(composite.slice(40, 44), [5, 6, 7, 0], "tone1 must occupy floats 40..43");
  assert.deepEqual(composite.slice(44, 48), [8, 9, 10, 0], "lift must occupy floats 44..47");
  assert.deepEqual(composite.slice(48, 52), [11, 12, 13, 0], "gamma must occupy floats 48..51");
  assert.deepEqual(composite.slice(52, 56), [14, 15, 16, 0], "gain must occupy floats 52..55");
});

test("WebGPU SkyU packs GLX-parity sky knobs at the expected lanes", async () => {
  // SkyU grew from 224 → 240 (mat4 64 + 11 vec4 176) for the p5 cloudDef lane.
  assert.match(CHUNKS_SOURCE, /SKY_UNIFORM_BYTES:\s*240/);
  assert.match(CHUNKS_SOURCE, /p3\s*:\s*vec4<f32>.*starSize, starTwinkle, moonDiscSize/);
  assert.match(CHUNKS_SOURCE, /p4\s*:\s*vec4<f32>.*moonHalo, sunCorona, sunSquash, cityGlowReach/);
  assert.match(CHUNKS_SOURCE, /p5\s*:\s*vec4<f32>.*cloudDef/);

  const h = makeGpuHarness();
  const gfx = await h.create();
  gfx.resize();
  const skyBuffer = h.buffers.find((buffer) => buffer.desc.size === 240);
  assert.ok(skyBuffer, "a 240-byte SkyU buffer must be allocated");

  // Defaults: every parity knob resolves to 1.0 (= as-shipped GLX look). p3.x is
  // DAY SKY BLUE; p3.yzw + p4 are the seven size/halo knobs; p5.x is cloudDef.
  assert.equal(gfx.begin({}), true);
  gfx.drawSky({});
  let sky = h.writes.filter((write) => write.buffer === skyBuffer).at(-1).values;
  assert.equal(sky[48], 1, "daySkyBlue default in p3.x (float 48)");
  assert.equal(sky[49], 1, "starSize default in p3.y (float 49)");
  assert.equal(sky[50], 1, "starTwinkle default in p3.z (float 50)");
  assert.equal(sky[51], 1, "moonDiscSize default in p3.w (float 51)");
  assert.equal(sky[52], 1, "moonHalo default in p4.x (float 52)");
  assert.equal(sky[53], 1, "sunCorona default in p4.y (float 53)");
  assert.equal(sky[54], 1, "sunSquash default in p4.z (float 54)");
  assert.equal(sky[55], 1, "cityGlowReach default in p4.w (float 55)");
  assert.equal(sky[56], 1, "cloudDef default in p5.x (float 56)");

  // Extreme upload: exactly-f32-representable fractions so lanes compare exactly.
  gfx.drawSky({ starSize: 0.25, starTwinkle: 0.75, moonDiscSize: 3.5, moonHalo: 0.5,
    sunCorona: 2.5, sunSquash: 0.125, cityGlowReach: 4.25, cloudDef: 2.25 });
  sky = h.writes.filter((write) => write.buffer === skyBuffer).at(-1).values;
  assert.equal(sky[49], 0.25, "starSize must occupy p3.y (float 49)");
  assert.equal(sky[50], 0.75, "starTwinkle must occupy p3.z (float 50)");
  assert.equal(sky[51], 3.5, "moonDiscSize must occupy p3.w (float 51)");
  assert.equal(sky[52], 0.5, "moonHalo must occupy p4.x (float 52)");
  assert.equal(sky[53], 2.5, "sunCorona must occupy p4.y (float 53)");
  assert.equal(sky[54], 0.125, "sunSquash must occupy p4.z (float 54)");
  assert.equal(sky[55], 4.25, "cityGlowReach must occupy p4.w (float 55)");
  assert.equal(sky[56], 2.25, "cloudDef must occupy p5.x (float 56)");
});

test("WGSL sky consumes the GLX-parity knob lanes", () => {
  assert.match(CHUNKS_SOURCE, /pow\(sd, 300\.0\) \* 0\.95 \* sunCorona/, "SUN CORONA RING knob");
  assert.match(CHUNKS_SOURCE, /mix\(1\.0, mix\(1\.0, 1\.6, golden\), sunSquash\)/, "SUN HORIZON SQUASH knob");
  assert.match(CHUNKS_SOURCE, /0\.20 \* starTwinkle \* sin/, "STAR TWINKLE knob");
  assert.match(CHUNKS_SOURCE, /mix\(0\.0016, 0\.0028, giant\) \* starSize/, "STAR SIZE knob");
  assert.match(CHUNKS_SOURCE, /smoothstep\(0\.025 \* moonDiscSize, 0\.010 \* moonDiscSize/, "MOON DISC SIZE knob");
  assert.match(CHUNKS_SOURCE, /140\.0 \/ moonHaloK\)\) \* 0\.28 \* moonHaloK/, "MOON HALO knob");
  assert.match(CHUNKS_SOURCE, /3\.0 \* cityGlowReach/, "CITY GLOW REACH knob");
  assert.match(CHUNKS_SOURCE, /0\.85 \* cloudDef/, "CLOUD DEFINITION billow mix");
  assert.match(CHUNKS_SOURCE, /moonDisc \* 1\.10 \+ moonHalo\) \* \(1\.0 - covRay\)/, "moon sits behind the cloud deck");
});

test("WGSL consumes wet darkening, bloom knee, and vignette softness uniforms", () => {
  assert.match(
    CHUNKS_SOURCE,
    /clamp\(1\.0\s*-\s*0\.58\s*\*\s*F\.params6\.x,\s*0\.0,\s*1\.0\)/,
    "wetDark must mirror the GLSL clamp so high tuner values cannot make albedo negative",
  );
  assert.match(POST_SOURCE, /bloomKnee\s*=\s*U\.imgFx\.w/);
  assert.match(POST_SOURCE, /vignetteSoft\s*=\s*U\.tuneFx\.x/);
  assert.doesNotMatch(POST_SOURCE, /smoothstep\(0\.95,\s*0\.35,\s*vr\)/);
});

test("WGSL flake basis guards degenerate normals before normalization", () => {
  assert.match(CHUNKS_SOURCE, /var nN = vec3<f32>\(0\.0,\s*1\.0,\s*0\.0\);\s*if \(length\(Ngeo\) > 1e-4\) \{\s*nN = normalize\(Ngeo\);\s*\}/s);
  assert.match(CHUNKS_SOURCE, /cross\(nN,\s*vec3<f32>\(0\.0,\s*1\.0,\s*0\.001\)\)/);
  assert.match(CHUNKS_SOURCE, /normalize\(nN\s*\+/);
});

test("composite header describes implemented image effects", () => {
  assert.doesNotMatch(POST_SOURCE, /SSR \/ speed-blur \/ chromatic-aberration DEFERRED/);
});

test("WGX publishes the GLX-parity surface instead of undefined stubs", async () => {
  const h = makeGpuHarness();
  const gfx = await h.create();
  assert.equal(typeof gfx.gpuTimer, "function");
  assert.equal(typeof gfx.gpuMs, "function");
  assert.equal(typeof gfx.createTextureArray, "function");
  assert.equal(typeof gfx.setMaterialMaps, "function");
  assert.equal(typeof gfx.materialMapState, "function");
  assert.equal(typeof gfx.lampShadowBegin, "function");
  assert.equal(typeof gfx.lampShadowEnd, "function");
  assert.equal(typeof gfx.createInstancedBatch, "function");
  assert.equal(typeof gfx.cullInstances, "function");
  assert.equal(typeof gfx.drawInstanced, "function");
  assert.equal(typeof gfx.freeInstancedBatch, "function");
  assert.equal(typeof gfx.castShadowInstanced, "function");
  assert.equal(typeof gfx.drawParticles, "function");
  const timer = gfx.gpuTimer();
  assert.equal(timer.supported, true);
  assert.equal(timer.on, false);
  assert.equal(gfx.gpuMs(), -1);
  gfx.gpuTimer(true);
  assert.equal(gfx.gpuTimer().on, true);
  assert.equal(gfx.msaa(), 4);
  const maps = gfx.materialMapState();
  assert.equal(maps.albedo, false);
  assert.equal(maps.layers, 0);
});

test("lamp shadow arm does not leak into the next frame", async () => {
  const h = makeGpuHarness();
  const gfx = await h.create();
  gfx.resize();
  const frameBuffer = h.buffers.find((buffer) => buffer.desc.size === 560);
  gfx.lampShadowBegin(new Float32Array([
    1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
  ]), 2);
  gfx.lampShadowEnd();
  assert.equal(gfx.begin({}), true);
  let frame = h.writes.filter((write) => write.buffer === frameBuffer).at(-1).values;
  assert.equal(frame[133], 1, "params8.y armed after lampShadowEnd");
  assert.equal(frame[134], 2, "params8.z = lamp idx");
  gfx.present({});
  assert.equal(gfx.begin({}), true);
  frame = h.writes.filter((write) => write.buffer === frameBuffer).at(-1).values;
  assert.equal(frame[133], 0, "params8.y must clear after present");
});

test("god-ray uploads nearest lamps and remaps the shadowed index", async () => {
  const h = makeGpuHarness();
  const gfx = await h.create();
  gfx.resize();
  const lights = new Float32Array(45);
  lights[0] = 100; lights[6] = 10;
  lights[15] = 1; lights[21] = 10;
  lights[30] = 50; lights[36] = 10;
  const ident = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  gfx.lampShadowBegin(ident, 0);
  gfx.lampShadowEnd();
  assert.equal(gfx.begin({ eye: [0, 0, 0], lights, invViewProj: ident }), true);
  gfx.present({ lampVol: 1, mist: 1 });
  const lightBufs = h.buffers.filter((buffer) => buffer.desc.size === LIGHT_SBO_BYTES);
  const gr = h.writes.filter((write) => lightBufs.includes(write.buffer)).at(-1);
  assert.ok(gr, "god-ray must write a nearest-N light buffer");
  assert.equal(gr.values[0], 1, "nearest lamp (1,0,0) must be slot 0");
  assert.equal(gr.values[16], 50, "next-nearest lamp must be slot 1");
  const godrayBuf = h.buffers.find((buffer) => buffer.desc.size === 288);
  const gu = h.writes.filter((write) => write.buffer === godrayBuf).at(-1).values;
  assert.equal(gu[68], 3, "numLights is the nearest-N count");
  assert.equal(gu[69], 2, "lampShadowIdx remaps frame index 0 onto nearest-N slot 2");
});

test("WGX requests timestamp-query when the adapter exposes it", async () => {
  assert.match(WGX_SOURCE, /requiredFeatures/);
  assert.match(WGX_SOURCE, /timestamp-query/);
  assert.match(WGX_SOURCE, /timestampWrites/);
});

test("depth-testing pipelines never use compare 'always' (skyLate erased the world)", async () => {
  // PerfTry.skyLate ships ON, so game.js draws the sky AFTER the opaque world
  // on every backend. GLX's sky sits at depth 1.0 under LEQUAL and is rejected
  // where the world already wrote; WGX's sky pipeline declared
  // depthCompare:"always", so the late fullscreen sky triangle overwrote every
  // world pixel — WebGPU rendered with no road, terrain, or props (only
  // cars/FX drawn after the sky survived). The invariant that pins the fix:
  // any pipeline that reads depth without writing it (sky, glow, skid, decal,
  // particles) exists to be occluded by the world, so "always" is never right
  // there. (The MS depth-resolve pass legitimately uses "always" — it WRITES
  // depth via @builtin(frag_depth) — hence the depthWriteEnabled filter.)
  const h = makeGpuHarness();
  const gfx = await h.create();
  gfx.resize();
  assert.equal(gfx.begin({}), true);
  gfx.drawSky({});
  const readOnlyDepth = h.pipelineDescs.filter(
    (d) => d && d.depthStencil && !d.depthStencil.depthWriteEnabled);
  assert.ok(readOnlyDepth.length >= 1, "the sky pipeline must be among the recorded descriptors");
  for (const d of readOnlyDepth) {
    assert.notEqual(d.depthStencil.depthCompare, "always",
      "a depth-test-only pipeline must respect the world's depth (GLX LEQUAL parity)");
  }
});

test("WGX source keeps the proven parity fixes", () => {
  assert.match(WGX_SOURCE, /_lampShadowArmed = false/);
  assert.match(WGX_SOURCE, /mapState === "unmapped"/);
  assert.match(WGX_SOURCE, /pParticleAdd/);
  assert.match(WGX_SOURCE, /_grByD/);
  assert.doesNotMatch(WGX_SOURCE, /colors\[i \* 3\] \|\| 1/);
});

// PerfTry.skyLate (default ON) draws sky after the opaque world. Sky VS puts
// the FS-tri at depth 1.0; with less-equal + depthWrite off that only fills
// far-plane holes (GLX LEQUAL parity). depthCompare "always" was correct for
// sky-FIRST and catastrophic for skyLate: late sky overwrote the lit buffer
// (hall-of-mirrors / melted scenery; cars still visible because they draw after).

test("WGX ground mist matches GLX band/strength", () => {
  // lit.js: exp(-lowH * (0.09 / mh)), no *0.5, clamp 0.45 — not exp(-lowH/(mh*20)).
  assert.match(CHUNKS_SOURCE, /exp\(-lowH \* \(0\.09 \/ mh\)\)/);
  assert.doesNotMatch(CHUNKS_SOURCE, /mh \* 20\.0/);
  assert.match(CHUNKS_SOURCE, /clamp\(mistAmt, 0\.0, 0\.45\)/);
});


test("WGX full parity batch is wired", () => {
  assert.match(CHUNKS_SOURCE, /0\.90, 0\.96, 1\.12/);
  assert.match(CHUNKS_SOURCE, /biasTerm \* F\.params6\.y/);
  assert.match(CHUNKS_SOURCE, /baseRefl = mix\(0\.14, 0\.72/);
  assert.match(CHUNKS_SOURCE, /bankThresh/);
  assert.match(CHUNKS_SOURCE, /U\.p5\.y/);
  assert.match(POST_SOURCE, /loadCompDepth/);
  assert.match(POST_SOURCE, /shaftDecay/);
  assert.match(POST_SOURCE, /carReflect = U\.upVS\.w/);
  assert.match(WGX_SOURCE, /maxAnisotropy: 4/);
  assert.match(WGX_SOURCE, /depthStencil\.depthBias = dbC/);
  assert.match(WGX_SOURCE, /_carBoxScale/);
  assert.match(WGX_SOURCE, /binding: 7, resource: next\.depthSampleView/);
  assert.match(WGX_SOURCE, /sunShaftDecay/);
  assert.match(WGX_SOURCE, /f\.lightning/);
});

test("WGX LIT keeps high-severity GLX parity sites", () => {
  // Clearcoat sun lobe must take KEY LIGHT (lit.js uKeyMul).
  assert.match(CHUNKS_SOURCE, /shadow \* keyMul \* clearcoat/);
  // Static shadow bias tracks SHADOW DISTANCE (lit.js biasTerm * range/80).
  assert.match(CHUNKS_SOURCE, /biasTerm \* \(shRange \/ 80\.0\)/);
  // FOG TINT asymmetric warm/cool (not the linear ±0.16 shortcut).
  assert.match(CHUNKS_SOURCE, /max\(fTint, 0\.0\) \* 0\.25/);
  // Road micro-normal footprint fade (grazing crawl guard).
  assert.match(CHUNKS_SOURCE, /mnFpAbs/);
  // Detail grain before roadMarkings so paint stays crisp.
  const grain = CHUNKS_SOURCE.indexOf("patchM = vnoise(wp * 0.055");
  const marks = CHUNKS_SOURCE.indexOf("roadMarkings(&albedo");
  assert.ok(grain > 0 && marks > grain, "grain must precede roadMarkings");
});

test("WGX god-ray and env probe match GLX gates", () => {
  // Volumetric shafts must not require sun.onScreen (GLX post.js).
  assert.doesNotMatch(WGX_SOURCE, /grStr > 0 && sun && sun\.onScreen && sun\.shaft/);
  assert.match(WGX_SOURCE, /const sunGR = !!shadowView && grStr > 0/);
  assert.match(WGX_SOURCE, /!f\.noEnv/);
  // Env probe respects PerfTry.envCull (300 m cap).
  assert.match(WGX_SOURCE, /PerfTry\.on\("envCull"\)/);
  assert.match(WGX_SOURCE, /Math\.min\(svCull, 300\)/);
});

test("WGX sky pipelines use less-equal depth (skyLate-safe)", () => {
  assert.match(
    WGX_SOURCE,
    /skyPipeline = device\.createRenderPipeline\(\{[\s\S]{0,500}?depthCompare: "less-equal"/,
    "skyPipeline must depth-test less-equal",
  );
  assert.match(
    WGX_SOURCE,
    /skyPipelineMS = device\.createRenderPipeline\(\{[\s\S]{0,500}?depthCompare: "less-equal"/,
    "skyPipelineMS must depth-test less-equal",
  );
  assert.doesNotMatch(
    WGX_SOURCE,
    /skyPipeline(?:MS)? = device\.createRenderPipeline\(\{[\s\S]{0,500}?depthCompare: "always"/,
    "sky pipelines must not use always (breaks skyLate)",
  );
});

test("WGSL closes the documented GLX look gaps", () => {
  assert.match(CHUNKS_SOURCE, /texture_2d_array/);
  assert.match(CHUNKS_SOURCE, /fn applyMaterial\(/);
  assert.match(CHUNKS_SOURCE, /fn applyMaterialNormal\(/);
  assert.match(CHUNKS_SOURCE, /surfaceId <= 27/);
  assert.match(CHUNKS_SOURCE, /wetSheen/);
  assert.match(CHUNKS_SOURCE, /fn roadMarkings\(/);
  assert.match(CHUNKS_SOURCE, /-0\.94201624/);
  assert.match(CHUNKS_SOURCE, /lampShadowTex/);
  assert.match(CHUNKS_SOURCE, /aInst0/);
  assert.match(CHUNKS_SOURCE, /aTrk/);
  assert.match(CHUNKS_SOURCE, /0\.12 \* F\.params9\.x/, "AMBIENT CONTACT DARK");
  assert.match(CHUNKS_SOURCE, /0\.16, 0\.30, wetSheen\) \* F\.params9\.y/, "LAMP WALL SPILL");
  assert.match(CHUNKS_SOURCE, /0\.6 \* F\.params9\.z/, "WINDOW SUN FLASH");
  assert.match(CHUNKS_SOURCE, /0\.18 \* F\.params9\.w/, "SKY RIM GLOW");
  assert.doesNotMatch(CHUNKS_SOURCE, /STILL DEFERRED vs GLX: uAmbContactDark/);
  assert.doesNotMatch(WGX_SOURCE, /depthResolveTex/);
  assert.doesNotMatch(WGX_SOURCE, /shadowPipelineInst/);
  assert.match(POST_SOURCE, /li < 6/, "god-ray lamp loop matches GLX GODRAY_FS consumer cap");
  assert.match(WGX_SOURCE, /Math\.min\(6, total\)/);
  assert.match(POST_SOURCE, /texture_depth_2d/);
  assert.match(POST_SOURCE, /uLampStr|lampStr/);
  assert.match(POST_SOURCE, /hazeStr|uHazeStr/);
  assert.match(POST_SOURCE, /1\.3846153846/, "SSAO/god-ray separable blur kernel");
  assert.match(FX_SOURCE, /fn vs_main[\s\S]*aCorner/, "particle shader");
});

// ── Failure shapes the old harness could not express ─────────────────────────
// Every test above runs against a device that cannot fail. These three assert
// what happens when it does, which is the only thing that matters on Safari 26:
// WebGPU there is documented to lose the device mid-pipeline-setup
// (github.com/ocornut/imgui/issues/9103, open, macOS 26 + iOS 26) and to render
// black with nothing on the console. A refusal is FINE — WGX is opt-in and GLX
// is the floor. What is not fine is refusing in a way the fallback cannot use.

test("a device that arrives already lost is refused", async () => {
  const h = makeGpuHarness({ bornLost: true });
  const gfx = await h.create();
  // `if (!device)` can never catch this: requestDevice ALWAYS returns a
  // GPUDevice, and an invalid one is signalled by `lost` being pre-resolved.
  assert.equal(gfx, null, "a born-lost device must not be accepted as a backend");
});

test("a shader that fails to compile is refused", async () => {
  const h = makeGpuHarness({ shaderError: true });
  const gfx = await h.create();
  assert.equal(gfx, null,
    "WebGPU does not throw on a bad module — createShaderModule returns a " +
    "live-looking object and the draw is silently dropped. getCompilationInfo " +
    "is the only signal, so an error there must refuse.");
});

test("a refusal leaves the canvas free for the WebGL2 fallback", async () => {
  const h = makeGpuHarness({ bornLost: true });
  const gfx = await h.create();
  assert.equal(gfx, null, "precondition: this harness refuses");
  // The cost of getting this wrong is not cosmetic. game.js can only recover a
  // claimed canvas by clearing the opt-in and RELOADING the page, so every
  // refusal a player hits becomes a reload — on exactly the platform where
  // refusal is most likely.
  assert.equal(h.canvasClaimedBy(), null,
    "WGX must prove itself BEFORE calling getContext('webgpu') on the real " +
    "canvas — a canvas is bound to one context type for life, so claiming it " +
    "and then refusing forces a page reload instead of a seamless GLX fallback");
});

test("Safari/compat: depth is textureLoad, adapter retries, lite stack skips timestamp", () => {
  // texture_depth_2d + a non-comparison sampler is a pipeline-create reject on
  // Safari 26 / compatibility mode. That used to fail the whole WGX.create().
  assert.match(CHUNKS_SOURCE, /fn loadDepth[\s\S]{0,200}textureLoad\(depthTex/);
  assert.doesNotMatch(CHUNKS_SOURCE, /textureSampleLevel\(depthTex,\s*depthSamp/);
  assert.match(POST_SOURCE, /fn ssaoDepth[\s\S]{0,200}textureLoad\(depthTex/);
  assert.match(POST_SOURCE, /fn ssrDepth[\s\S]{0,200}textureLoad\(depthTex/);
  assert.doesNotMatch(POST_SOURCE, /textureSampleLevel\(depthTex,\s*depthSamp/);
  // Slim gate is WGX_LITE (phone OR WebKit OR a prior device.lost), not
  // IS_MOBILE alone. Safari Mac is not a phone; GLX still runs the desktop
  // stack there. WGX cannot: timestamp-query + multisampled rgba16float is what
  // painted one frame then lost the device. Phone ULTRA also matches GLX
  // here — js/render/glx/post.js keys MSAA on IS_MOBILE (never MOBILE_TIER).
  // sampleCount must be 1 or 4 in WebGPU (not GLX's 2×).
  assert.match(WGX_SOURCE, /WGX_LITE = !!\(IS_MOBILE \|\| IS_WEBKIT \|\| _litePref\)/);
  assert.match(WGX_SOURCE, /WGX_LITE \? "low-power" : "high-performance"/);
  assert.match(WGX_SOURCE, /if \(!adapter\) adapter = await navigator\.gpu\.requestAdapter\(\)/);
  // The adapter probe is shared with rg11b10ufloat-renderable now, so this
  // pins the GATE (lite skips the timer) rather than the probe's spelling.
  assert.match(WGX_SOURCE, /_canTimestamp = !WGX_LITE && _has\("timestamp-query"\)/);
  assert.match(WGX_SOURCE, /adapter\.features\.has\(name\)/);
  assert.match(WGX_SOURCE, /MSAA_COUNT = WGX_LITE \? 1 : 4/);
  assert.match(WGX_SOURCE, /apex26\.gfxWgxFail/);
});

test("desktop harness still takes the full WGX stack (GLX-parity)", async () => {
  const h = makeGpuHarness();
  const gfx = await h.create();
  assert.equal(gfx.msaa(), 4, "desktop keeps MSAA; 4 because WebGPU permits only 1 or 4");
  assert.equal(gfx.gpuTimer().supported, true, "timestamp-query stays on the non-lite path");
  assert.equal(gfx.carShadowState().enabled, true);
  assert.equal(gfx.lampShadowState().enabled, true);
});

test("software / empty-info adapter refuses create (white-canvas gate)", async () => {
  const h = makeGpuHarness({ softAdapter: true });
  const gfx = await h.create();
  assert.equal(gfx, null);
  const fail = h.WGX.lastFailure();
  assert.ok(fail && /software WebGPU adapter/i.test(fail.reason), fail && fail.reason);
});

test("software adapter allowed via apex26.gfxWgxAllowSoftware (MSAA 1)", async () => {
  const stored = new Map([["apex26.gfxWgxAllowSoftware", "1"]]);
  const h = makeGpuHarness({ softAdapter: true, storage: stored });
  const gfx = await h.create();
  assert.ok(gfx, "escape hatch must still boot WGX");
  assert.equal(gfx.msaa(), 1, "software path forces MSAA 1");
});

test("Safari UA takes the slim WGX stack (msaa 1, no timestamp)", async () => {
  const h = makeGpuHarness({
    ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15",
  });
  const gfx = await h.create();
  assert.equal(gfx.msaa(), 1);
  assert.equal(gfx.gpuTimer().supported, false);
  assert.equal(gfx.carShadowState().enabled, false);
  assert.equal(gfx.lampShadowState().enabled, false);
});

test("device.lost climbs the ladder: full -> lite (level 1 persisted, reload)", async () => {
  const storage = new Map();
  let reloads = 0;
  const h = makeGpuHarness({ storage, onReload: () => { reloads += 1; } });
  await h.create();
  h.loseDevice({ reason: "unknown" });
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(storage.get("apex26.gfxWgxLevel"), "1", "first desktop loss lands on the lite rung");
  assert.equal(storage.get("apex26.gfxWgxLite"), "1", "legacy flag kept in step");
  assert.equal(reloads, 1, "the rung retry is a reload, not a GLX surrender");
});

test("device.lost on the lite rung climbs to minimal (level 2), not GLX", async () => {
  const storage = new Map();
  const session = new Map();
  let reloads = 0;
  const h = makeGpuHarness({
    ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15",
    storage, session, onReload: () => { reloads += 1; },
  });
  await h.create();
  h.loseDevice({ reason: "unknown" });
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(storage.get("apex26.gfxWgxLevel"), "2", "a lite loss must retry minimal before surrendering");
  assert.equal(session.get("apex26.gfxClaimFail"), undefined, "no session skip while rungs remain");
  assert.equal(reloads, 1);
});

test("minimal rung: no post targets, no env probe, and a loss there exits to GLX", async () => {
  const storage = new Map([["apex26.gfxWgxLevel", "2"]]);
  const session = new Map();
  let reloads = 0;
  const h = makeGpuHarness({ storage, session, onReload: () => { reloads += 1; } });
  const gfx = await h.create();
  assert.equal(gfx.msaa(), 1, "minimal implies the lite MSAA 1");
  assert.equal(gfx.envFaceBegin(0, [0, 0, 0], {}), null, "env probe refused on minimal");
  gfx.resize();
  assert.equal(gfx.begin({}), true);
  // 320x180 canvas -> the post chain's half-res aux targets would be 160x90.
  // Minimal leaves pComposite unbuilt, so none may exist.
  const halfRes = h.textures.filter((t) => Array.isArray(t.desc.size) &&
    t.desc.size[0] === 160 && t.desc.size[1] === 90);
  assert.equal(halfRes.length, 0, "minimal must not allocate the half-res post targets");
  gfx.present({});   // blit path must not throw with post unbuilt
  assert.equal(storage.get("apex26.gfxWgxOk"), "1", "a presented frame counts one clean session");
  h.loseDevice({ reason: "unknown" });
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(storage.get("apex26.gfxWgxOk"), "0", "a loss zeroes the heal streak");
  assert.equal(storage.get("apex26.gfxWgxLevel"), "2", "no rung above minimal");
  assert.equal(session.get("apex26.gfxClaimFail"), "1", "minimal loss surrenders the tab to GLX");
  assert.equal(session.get("apex26.gfxBound"), "webgl2", "the RENDERER label must say (WEBGL2)");
  assert.equal(reloads, 1, "the surrender reload boots GLX in this tab");
});

test("a JS throw in begin() strikes out to GLX only at the cap, not on frame one", async () => {
  const storage = new Map();
  const session = new Map();
  let reloads = 0;
  const h = makeGpuHarness({ storage, session, onReload: () => { reloads += 1; } });
  const gfx = await h.create();
  gfx.resize();
  assert.equal(gfx.begin({}), true, "healthy begin");
  h.setEncoderFail(true);
  assert.equal(gfx.begin({}), false);   // strike 1
  assert.equal(gfx.begin({}), false);   // strike 2
  assert.equal(session.get("apex26.gfxClaimFail"), undefined, "two strikes must not surrender");
  assert.equal(reloads, 0);
  assert.equal(gfx.begin({}), false);   // strike 3 = cap
  assert.equal(session.get("apex26.gfxClaimFail"), "1", "the cap surrenders the tab to GLX");
  assert.equal(session.get("apex26.gfxBound"), "webgl2", "the RENDERER label must say (WEBGL2)");
  assert.match(storage.get("apex26.gfxWgxFail") || "", /begin threw/, "reason recorded");
  assert.equal(reloads, 1);
  h.setEncoderFail(false);
  assert.equal(gfx.begin({}), false, "after the cap the backend stays down for this tab");
});

test("a minimal loss with blocked sessionStorage re-arms the boot canary instead of freezing", async () => {
  const storage = new Map([["apex26.gfxWgxLevel", "2"]]);
  const session = new Map();
  let reloads = 0;
  const h = makeGpuHarness({ storage, session, blockSession: true, onReload: () => { reloads += 1; } });
  const gfx = await h.create();
  gfx.resize();
  gfx.begin({});
  gfx.present({});
  h.loseDevice({ reason: "unknown" });
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(session.get("apex26.gfxClaimFail"), undefined, "skip write must not stick");
  assert.equal(reloads, 0, "no reload when the skip cannot be armed");
  assert.equal(storage.get("apex26.gfxBackendProbe"), "webgpu",
    "next cold start must find the canary armed and revert to WebGL2");
});

test("clean sessions heal the ladder: minimal steps back to lite after a streak", async () => {
  const storage = new Map([["apex26.gfxWgxLevel", "2"]]);
  for (let boot = 1; boot <= 5; boot++) {
    const h = makeGpuHarness({ storage });
    const gfx = await h.create();
    gfx.resize();
    assert.equal(gfx.begin({}), true);
    gfx.present({});   // first presented frame of the boot = one clean session
    if (boot < 5) {
      assert.equal(storage.get("apex26.gfxWgxLevel"), "2", `rung must hold until the streak (boot ${boot})`);
      assert.equal(storage.get("apex26.gfxWgxOk"), String(boot));
    }
  }
  assert.equal(storage.get("apex26.gfxWgxLevel"), "1", "five clean sessions step minimal down to lite");
  assert.equal(storage.get("apex26.gfxWgxOk"), "0", "streak restarts for the next rung");
});

test("phone WGX matches GLX: no MSAA even when the memory tier is HIGH", async () => {
  // GLX: msaaSamples = IS_MOBILE ? 0 : 2 (js/render/glx/post.js). WGX used to
  // key MSAA on MOBILE_TIER, so GRAPHICS: ULTRA on a phone took multisampled
  // rgba16float and lost the device after one frame.
  const h = makeGpuHarness({ glx: { isMobile: true, mobileTier: false } });
  const gfx = await h.create();
  assert.equal(gfx.isMobile, true);
  assert.equal(gfx.mobileTier, false);
  assert.equal(gfx.msaa(), 1);
  assert.equal(gfx.gpuTimer().supported, false);
  assert.equal(gfx.carShadowState().enabled, false);
});

test("every sampleCount WGX requests is one WebGPU actually allows (1 or 4)", async () => {
  // The spec (w3.org/TR/webgpu) permits sampleCount 1 or 4 and nothing else.
  // WGX shipped 2 — mirroring GLX's 2× WebGL MSAA — and every real device
  // answered "Multisample count (2) is not supported" for each MS pipeline,
  // then cascaded Invalid RenderPipeline / Invalid BindGroupLayout off it.
  // The old assertions read msaa() === 2 and passed: they never asked a GPU.
  // This one checks the descriptors, so a future retune cannot pick 2 or 8.
  const LEGAL = new Set([1, 4]);
  const h = makeGpuHarness();
  const gfx = await h.create();
  gfx.resize();
  gfx.begin({});
  gfx.present({});
  assert.ok(LEGAL.has(gfx.msaa()), `msaa() must be 1 or 4, got ${gfx.msaa()}`);
  const texBad = h.textures.filter((t) => t.desc.sampleCount != null && !LEGAL.has(t.desc.sampleCount));
  assert.deepEqual(texBad.map((t) => t.desc.sampleCount), [], "illegal texture sampleCount");
  assert.ok(h.pipelines.length > 0, "harness must record pipeline descriptors");
  const pipeBad = h.pipelines.filter((p) =>
    p.desc && p.desc.multisample && p.desc.multisample.count != null
      && !LEGAL.has(p.desc.multisample.count));
  assert.deepEqual(pipeBad.map((p) => p.desc.multisample.count), [], "illegal pipeline multisample count");
  assert.ok(h.textures.some((t) => t.desc.sampleCount === 4), "desktop must still allocate MS targets");
  assert.match(CHUNKS_SOURCE, /textureLoad\(src,\s*c,\s*3\)/,
    "DEPTH_RESOLVE must min all four 4× samples, not just 0 and 1");
});

test("rg11b10ufloat is only rendered into when the device grants the feature", async () => {
  // Fourth defect of the same family, and the one that survived fixing the
  // other three: rg11b10ufloat carries TEXTURE_BINDING and the copy usages in
  // core WebGPU, but RENDER_ATTACHMENT needs the OPTIONAL
  // "rg11b10ufloat-renderable" feature. WGX allocated the bloom/godray targets
  // in it unconditionally to mirror GLX's R11F_G11F_B10F, and a live device
  // answered "Color format (TextureFormat::RG11B10Ufloat) is not color
  // renderable" per target, then "WGX unavailable" — a silent GLX fallback.
  const RENDERABLE = 1;  // GPUTextureUsage.RENDER_ATTACHMENT in this harness
  // WGX runs inside a vm context, so its arrays carry THAT realm's prototype
  // and deepStrictEqual rejects them on identity alone. Copy before comparing.
  const asked = (h) => h.deviceRequests.map((f) => Array.from(f));

  // WITHOUT the feature: nothing may be rendered into that format.
  const plain = makeGpuHarness();
  const gplain = await plain.create();
  gplain.resize(); gplain.begin({}); gplain.present({});
  assert.deepEqual(asked(plain), [["timestamp-query"]],
    "must not ask for a feature the adapter never advertised");
  const illegal = plain.textures.filter((t) =>
    t.desc.format === "rg11b10ufloat" && (t.desc.usage & RENDERABLE));
  assert.equal(illegal.length, 0, "rg11b10ufloat render target without the feature");
  const pipeIllegal = plain.pipelines.filter((p) =>
    (((p.desc || {}).fragment || {}).targets || []).some((t) => t && t.format === "rg11b10ufloat"));
  assert.equal(pipeIllegal.length, 0, "pipeline writes rg11b10ufloat without the feature");
  // The post chain must still EXIST — downgraded, not dropped.
  assert.ok(plain.textures.some((t) => t.desc.format === "rgba16float" && (t.desc.usage & RENDERABLE)),
    "bloom/godray must downgrade to the HDR scene format, not disappear");

  // WITH the feature: ask for it, and use it.
  const rich = makeGpuHarness({ adapterFeatures: ["timestamp-query", "rg11b10ufloat-renderable"] });
  const grich = await rich.create();
  grich.resize(); grich.begin({}); grich.present({});
  assert.deepEqual(asked(rich), [["timestamp-query", "rg11b10ufloat-renderable"]]);
  assert.ok(rich.textures.some((t) => t.desc.format === "rg11b10ufloat" && (t.desc.usage & RENDERABLE)),
    "the granted feature must actually be used (half the bytes per post pixel)");
  // Bloom pipelines must write the SAME format as those targets. Godray/blur
  // already did; bloom down/up shipped on SCENE_FORMAT (rgba16float) and
  // every bloom draw was a color-format mismatch once the feature was granted.
  assert.match(WGX_SOURCE, /pBloomDown = fsPipe\([^,]+,\s*POST_HDR_FORMAT/);
  assert.match(WGX_SOURCE, /pBloomUp\s*= fsPipe\([^,]+,\s*POST_HDR_FORMAT/);
  const bloomPipeWrong = rich.pipelines.filter((p) =>
    (((p.desc || {}).fragment || {}).targets || []).some((t) => t && t.format === "rgba16float")
    && /BLOOM/i.test(JSON.stringify(p.desc || {})));
  // Source invariant is the net; the harness may not label pipelines BLOOM.
  assert.ok(rich.pipelines.some((p) =>
    (((p.desc || {}).fragment || {}).targets || []).some((t) => t && t.format === "rg11b10ufloat")),
    "at least one post pipeline must target the granted rg11b10ufloat format");

  // Adapter advertises, device withholds — the case a device-side re-derive
  // exists for. Reading the adapter's answer here would allocate the illegal
  // format again.
  const liar = makeGpuHarness({
    adapterFeatures: ["timestamp-query", "rg11b10ufloat-renderable"],
    deviceFeatures: ["timestamp-query"],
  });
  const gliar = await liar.create();
  gliar.resize(); gliar.begin({}); gliar.present({});
  const liarBad = liar.textures.filter((t) =>
    t.desc.format === "rg11b10ufloat" && (t.desc.usage & RENDERABLE));
  assert.equal(liarBad.length, 0, "must re-derive the format from the DEVICE, not the adapter");
});

test("no WGSL derivative sits where control flow can be non-uniform", () => {
  // 'dpdx must only be called from uniform control flow' is a COMPILE error that
  // invalidates the whole lit pipeline; WGX then refuses and the game falls back
  // to WebGL2 with only a console warning. It shipped that way — the material
  // helpers took fwidth behind material-id branches and early returns, and a
  // callee that returns early non-uniformly poisons its CALLER too, so the fix
  // is structural: derivatives at the fs_main entry, footprint passed down.
  const DERIV = /\b(dpdx|dpdy|fwidth)\s*\(/g;
  // Structural, not an allow-list of spellings: two sessions fixed this in
  // parallel and picked different names, and a list of exact lines would have
  // called the other one's correct code a regression. The invariant is about
  // POSITION. Walk every `fn` in the module and require that any body taking a
  // derivative is an entry point — a helper that takes one is reachable from a
  // material branch by construction, and a wrapper is the worst case because
  // the call site then looks like ordinary arithmetic (that is exactly how the
  // original fw1 shipped, and how it survived the first fix as dead code).
  const stripped = CHUNKS_SOURCE.replace(/^[ \t]*\/\/.*$/gm, "");
  const fns = [];
  for (const m of stripped.matchAll(/\bfn\s+(\w+)\s*\(/g)) {
    let i = stripped.indexOf("{", m.index);
    if (i < 0) continue;
    let depth = 0;
    let end = i;
    for (; end < stripped.length; end++) {
      if (stripped[end] === "{") depth++;
      else if (stripped[end] === "}" && --depth === 0) break;
    }
    fns.push({ name: m[1], body: stripped.slice(i, end + 1) });
  }
  assert.ok(fns.length > 20, `expected the WGSL module's functions, found ${fns.length}`);
  const offenders = fns
    .filter((f) => DERIV.test(f.body) && !/^fs_main/.test(f.name))
    .map((f) => f.name);
  DERIV.lastIndex = 0;
  assert.deepEqual(offenders, [],
    "a derivative (or a wrapper around one) lives outside a fragment entry point");

  // Same walk on the post chain — SSAO already hoists; a helper-side dpdx
  // there would slip through a CHUNKS_SOURCE-only ratchet.
  const postStripped = POST_SOURCE.replace(/^[ \t]*\/\/.*$/gm, "");
  const postFns = [];
  for (const m of postStripped.matchAll(/\bfn\s+(\w+)\s*\(/g)) {
    let i = postStripped.indexOf("{", m.index);
    if (i < 0) continue;
    let depth = 0, end = i;
    for (; end < postStripped.length; end++) {
      if (postStripped[end] === "{") depth++;
      else if (postStripped[end] === "}" && --depth === 0) break;
    }
    postFns.push({ name: m[1], body: postStripped.slice(i, end + 1) });
  }
  const postOff = postFns
    .filter((f) => { DERIV.lastIndex = 0; return DERIV.test(f.body) && !/^fs_main/.test(f.name); })
    .map((f) => f.name);
  assert.deepEqual(postOff, [],
    "wgsl-post.js: a derivative lives outside a fragment entry point: " + postOff.join(","));

  // Uniform means before the FIRST branch, not merely inside fs_main: an early
  // `return` or an `if` above the derivative poisons everything after it.
  for (const f of fns.filter((f) => /^fs_main/.test(f.name) && DERIV.test(f.body))) {
    DERIV.lastIndex = 0;
    const firstBranch = f.body.search(/\b(if|for|while|loop|switch|return|discard)\b/);
    for (const d of f.body.matchAll(DERIV)) {
      assert.ok(firstBranch === -1 || d.index < firstBranch,
        `${f.name}: ${d[1]} at ${d.index} sits after the first branch at ${firstBranch}`);
    }
  }
  DERIV.lastIndex = 0;

  // …and the footprint must reach every consumer as a parameter.
  for (const re of [/let fwWpos = abs\(dpdx\(in\.wpos\)\) \+ abs\(dpdy\(in\.wpos\)\);/,
                    /let fwTrk = abs\(dpdx\(in\.trk\)\) \+ abs\(dpdy\(in\.trk\)\);/,
                    /applyMaterialNormal\(i32\(in\.matId \+ 0\.5\), &N, in\.dist, in\.wpos, fwWpos\);/,
                    /roadMarkings\(&albedo, &rough, in\.trk, fwTrk\);/,
                    // The one the first fix missed: this sits behind `if (detail
                    // > 0.001)`, so it must READ the hoisted footprint.
                    /let mnFpAbs = max\(fwWpos\.x, fwWpos\.z\);/]) {
    assert.match(CHUNKS_SOURCE, re, `footprint plumbing changed: ${re}`);
  }
});

test("the MAT array sampler asks for anisotropy, like GLX and TLX", () => {
  // GLX caps the MAT array at aniso 4 and TLX sets anisotropy = 4; WGX asked for
  // none, so tarmac went to mip mush at grazing angles on the WebGPU backend
  // alone. WebGPU only allows maxAnisotropy > 1 when all three filters are
  // "linear", and a rejecting driver must fall back rather than fail create().
  assert.match(WGX_SOURCE, /maxAnisotropy:\s*4/);
  const desc = /const _matSampDesc = \{[\s\S]*?\};/.exec(WGX_SOURCE);
  assert.ok(desc, "the MAT sampler descriptor moved");
  for (const f of ["magFilter", "minFilter", "mipmapFilter"]) {
    assert.match(desc[0], new RegExp(`${f}:\\s*"linear"`), `${f} must be linear for maxAnisotropy`);
  }
  assert.match(WGX_SOURCE, /catch \(_\) \{\s*matArraySamp = device\.createSampler\(_matSampDesc\);/);
});

test("setMaterialMaps owns pack textures and destroys them on unload/replace", async () => {
  // GLX deletes prior arrays in setMaterialMaps; WGX used to orphan GPUTexture
  // objects on unload/tier-swap and left materialMapState stale only via flags
  // (views still bound). Observe destruction the way the audit remediation asks.
  const h = makeGpuHarness();
  const gfx = await h.create();
  const placeholders = h.textures.filter((t) =>
    Array.isArray(t.desc.size) && t.desc.size[0] === 1 && t.desc.size[1] === 1
      && t.desc.size[2] === 17 && t.desc.mipLevelCount == null);
  assert.ok(placeholders.length >= 1, "init must allocate the 1×1×17 placeholder");

  const px = new Uint8Array([128, 128, 128, 255]);
  const images = [px];
  const albedo = gfx.createTextureArray(1, images, 17);
  const normal = gfx.createTextureArray(1, images, 17);
  assert.ok(albedo && albedo.texture && normal && normal.texture);
  const scales = new Float32Array(17);
  scales[1] = 4;
  gfx.setMaterialMaps({ albedo, normal, scales });
  let st = gfx.materialMapState();
  assert.equal(st.albedo, true);
  assert.equal(st.normal, true);
  assert.equal(st.layers, 1);
  assert.equal(albedo.texture.destroyed, false);

  gfx.setMaterialMaps(null);
  assert.equal(albedo.texture.destroyed, true, "unload must destroy owned albedo");
  assert.equal(normal.texture.destroyed, true, "unload must destroy owned normal");
  for (const p of placeholders) {
    assert.equal(p.destroyed, false, "placeholder must survive unload");
  }
  st = gfx.materialMapState();
  assert.equal(st.albedo, false);
  assert.equal(st.normal, false);
  assert.equal(st.layers, 0);

  const a2 = gfx.createTextureArray(1, images, 17);
  const n2 = gfx.createTextureArray(1, images, 17);
  gfx.setMaterialMaps({ albedo: a2, normal: n2, scales });
  const a3 = gfx.createTextureArray(1, images, 17);
  const n3 = gfx.createTextureArray(1, images, 17);
  gfx.setMaterialMaps({ albedo: a3, normal: n3, scales });
  assert.equal(a2.texture.destroyed, true, "replace must destroy previous albedo");
  assert.equal(n2.texture.destroyed, true, "replace must destroy previous normal");
  assert.equal(a3.texture.destroyed, false);
  gfx.setMaterialMaps(null);
  assert.equal(a3.texture.destroyed, true);
  assert.equal(n3.texture.destroyed, true);
});

test("WGSL derivative uniform control flow: fw1 is gone for good", () => {
  // Two sessions fixed this independently and picked different names — fwWpos/
  // fwTrk on the deploy lineage, fwW/fwT here (via the fw2/fw3 wrappers, so the
  // hoist is one call rather than four dpdx). The naming is arbitrary; what is
  // NOT arbitrary is that no scalar fw1 wrapper exists to be called from a
  // material branch. That was the original bug, and it survived the first fix as
  // dead code. The plumbing itself is asserted by "no WGSL derivative sits where
  // control flow can be non-uniform" above; this pins the deletion.
  assert.doesNotMatch(CHUNKS_SOURCE, /fn\s+fw1\s*\(/, "fn fw1 must not come back — a wrapper hides the derivative");
  assert.doesNotMatch(CHUNKS_SOURCE.replace(/^[ \t]*\/\/.*$/gm, ""), /\bfw1\s*\(/, "no calls to fw1 may remain");
});

test("derivatives stay OUT of the material helper bodies (the WGSL NaN-white road)", () => {
  // The mechanism the hoist above fixes, pinned per-helper: these functions
  // all early-return on per-fragment values (roadMarkings on trk.z > 0.5 — the
  // road surface itself), so a derivative INSIDE any of them either
  // invalidates the whole lit pipeline (enforcing Dawn: WGX silently fell back
  // to GLX) or executes UNDEFINED values exactly where the returns diverge
  // (warning-mode Dawn: the entire road + shoulders rendered NaN-white on
  // phones while grass, walls and cars — hw 0, early return before any
  // derivative — looked fine). Widths are computed at fs_main top and threaded
  // in; every pattern width is linear in them, so the chain-rule scaling is
  // exact. Verified against a real Dawn device by tools/wgx-validate.mjs.
  const helpers = ["matBumpHeight", "matTexUV", "applyMaterialTexNormal",
                   "applyMaterialNormal", "applyMaterial", "roadMarkings"];
  for (const name of helpers) {
    const m = CHUNKS_SOURCE.match(new RegExp("fn " + name + "\\([^)]*\\)[^{]*\\{[\\s\\S]*?\\n\\}", ""));
    assert.ok(m, "helper fn " + name + " exists in wgsl-chunks.js");
    assert.doesNotMatch(m[0], /dpdx|dpdy|fwidth|fw1\(/,
      "fn " + name + " must not take screen-space derivatives — hoist to fs_main top and pass widths in");
  }
});

test("_mkBuffer uses writeBuffer (not mappedAtCreation)", () => {
  // Dawn's mappable pool exhausts on the ~35 MB chunked scenery buffer and then
  // fails even 208-byte meshes (measured 2026-08-17; white world with HUD only).
  // Strip line comments first — the writeBuffer rationale still names the old flag.
  const code = WGX_SOURCE.replace(/^[ \t]*\/\/.*$/gm, "");
  assert.doesNotMatch(code, /mappedAtCreation\s*:\s*true/,
    "_mkBuffer must use queue.writeBuffer, not mappedAtCreation");
  assert.match(WGX_SOURCE, /queue\.writeBuffer\(buf/, "_mkBuffer must writeBuffer the payload");
});

test("WGX.gpuErrors and WGX.isSupported report clean error diagnostics", async () => {
  const h = makeGpuHarness();
  assert.equal(typeof h.WGX.isSupported, "function");
  assert.equal(typeof h.WGX.isSupported(), "boolean");
  assert.equal(typeof h.WGX.gpuErrors, "function");
  const initialErrors = h.WGX.gpuErrors();

  await h.create();
  assert.equal(typeof h.device.onuncapturederror, "function", "device.onuncapturederror must be wired");

  h.device.onuncapturederror({ error: { message: "synthetic validation error" } });
  assert.equal(h.WGX.gpuErrors(), initialErrors + 1, "WGX.gpuErrors() must increment on uncaptured error");
});

// ── auto-layout identity: pipelines that SHARE a bind group cannot use "auto" ──
//
// `layout: "auto"` mints a fresh GPUBindGroupLayout per pipeline, and WebGPU
// compares those by IDENTITY, not by shape. So a bind group built from pipeline
// A is rejected on pipeline B even when the entries are character-for-character
// the same — and the rejection is not a dropped draw. Dawn invalidates the whole
// command buffer ("[Invalid CommandBuffer] is invalid due to a previous error"
// at Queue.Submit), losing every other draw recorded in that pass.
//
// Measured on software adapters with tools/wgpu-flag-test.mjs before the fix:
// 176 (SwiftShader) and 192 (Lavapipe) GPU errors per run, from two twin pairs —
// sky/skyMS and particle/particleAdd, each a blend-or-MSAA variant sharing one
// cached bind group. Both now share an explicit pipeline layout; the run is 0/0.
//
// The rule this asserts is narrow on purpose: where setPipeline picks between
// SEVERAL pipelines, none of them may be auto-laid-out, because one bind group
// has to satisfy all of them.
function autoLayoutOffenders(src) {
  const auto = new Set();
  for (const m of src.matchAll(/(\w+)\s*=\s*device\.createRenderPipeline\(\{\s*(?:\/\/[^\n]*\n\s*)*layout:\s*"auto"/g)) {
    auto.add(m[1]);
  }
  const out = [];
  for (const m of src.matchAll(/\.setPipeline\(([^;]+)\);/g)) {
    const expr = m[1];
    if (!/\?/.test(expr)) continue;                       // a single pipeline can always own its group
    const named = [...new Set([...expr.matchAll(/\b([A-Za-z_]\w*)\b/g)].map((x) => x[1]))];
    const offending = named.filter((n) => auto.has(n));
    if (offending.length) out.push({ expr: expr.trim(), offending });
  }
  return out;
}

test("no pipeline chosen from several is auto-laid-out (one bind group must fit all)", () => {
  assert.deepEqual(autoLayoutOffenders(WGX_SOURCE), [],
    "a shared bind group on an auto-layout pipeline invalidates the whole command buffer");
});

test("the auto-layout guard actually catches the shape it is written for", () => {
  // A guard that cannot fail is decoration. Put the defect back in a copy: the
  // sky pair on its shared explicit layout, reverted to "auto".
  const broken = WGX_SOURCE.replace(/layout: skyLayout,/g, 'layout: "auto",');
  assert.notEqual(broken, WGX_SOURCE, "fixture must actually mutate the sky pipelines");
  const found = autoLayoutOffenders(broken);
  assert.ok(found.some((f) => /skyPipelineMS/.test(f.expr)),
    "reverting the sky pair to auto must be reported: " + JSON.stringify(found));
});
