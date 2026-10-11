import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { seedLog } from "../helpers/seed-log.mjs";

const ROOT = new URL("../..", import.meta.url);
const MANIFEST = (await import("node:module")).createRequire(import.meta.url)("../../tools/manifest.cjs");
const P = MANIFEST.PATHS;
const CSS_SIZE_SOURCE = await readFile(new URL("js/render/shared/canvas-css-size.js", ROOT), "utf8");
const DEFERRED_WEBGPU = MANIFEST.DEFERRED.webgpu;
const deferredWebgpuSources = await Promise.all(
  DEFERRED_WEBGPU.map((rel) => readFile(new URL(rel, ROOT), "utf8")),
);
// Bundle every DEFERRED.webgpu file in roster order so source-text pins and the
 // VM eval still see _buildPost / shadowBegin after the GLX-seam peel.
const WGX_BUNDLE = deferredWebgpuSources.join("\n");
const WGX_POST_SOURCE = await readFile(new URL(P.WGX_POST, ROOT), "utf8");
const WGX_SHADOW_SOURCE = await readFile(new URL(P.WGX_SHADOW, ROOT), "utf8");
const WGX_CHUNKED_SOURCE = await readFile(new URL(P.WGX_CHUNKED, ROOT), "utf8");
const WGX_MAIN_SOURCE = await readFile(new URL(P.WGX, ROOT), "utf8");
const [CHUNKS_SOURCE, POST_SOURCE, FX_SOURCE, FRUSTUM_SOURCE, WGX_SOURCE,
       LIGHT_BUDGET_SOURCE, POST_COMMON_SOURCE, KNOBS_SOURCE,
       VERTEX_PACK_SOURCE, INST_CELLS_SOURCE] = await Promise.all([
  readFile(new URL(P.WGSL_CHUNKS, ROOT), "utf8"),
  readFile(new URL(P.WGSL_POST, ROOT), "utf8"),
  readFile(new URL("js/render/webgpu/wgsl-fx.js", ROOT), "utf8"),
  readFile(new URL(P.FRUSTUM, ROOT), "utf8"),
  Promise.resolve(WGX_BUNDLE),
  readFile(new URL("js/render/shared/light-budget.js", ROOT), "utf8"),
  readFile(new URL("js/render/shared/post-common.js", ROOT), "utf8"),
  readFile(new URL("js/lighting/knobs.js", ROOT), "utf8"),
  // WGX packs its vertex buffer through the shared quantisers. The REAL module,
  // not a stub: a scale that drifted between the three backends should fail
  // here, in three seconds, rather than on somebody's GPU.
  readFile(new URL("js/render/shared/vertex-pack.js", ROOT), "utf8"),
  readFile(new URL(P.INST_CELLS, ROOT), "utf8"),
]);


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
  let mapCalls = 0;
  const timers = [];

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
  const asyncDescs = [];
  const adapterFeatures = opts.adapterFeatures || ["timestamp-query"];
  const deviceFeatures = opts.deviceFeatures || adapterFeatures;
  const deviceRequests = [];
  let loseDevice = null;
  let failEncoder = false;
  // Optional error scopes (opts.errorScopes): a real stack. Pops resolve clean
  // at once (create() awaits its own boot scopes) until the test calls
  // holdPops(): then each verdict waits for settlePops — a GPUError is
  // reported asynchronously, never thrown, so it must be able to arrive late.
  const scopeStack = [], pendingPops = [];
  let holdPops = false;
  const device = {
    ...(opts.errorScopes ? {
      pushErrorScope(filter) { scopeStack.push(filter); },
      popErrorScope() {
        const filter = scopeStack.pop();
        if (!filter) return Promise.reject(new Error("OperationError: empty error scope stack"));
        if (!holdPops) return Promise.resolve(null);
        return new Promise((resolve) => pendingPops.push({ filter, resolve }));
      },
    } : {}),
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
    // Present only when a test asks: most of this file pins the sync path.
    ...(opts.asyncPipelines ? {
      createRenderPipelineAsync: async (desc) => { asyncDescs.push(desc); return { desc, async: true }; },
    } : {}),
    createQuerySet: () => ({ count: 2 }),
    createCommandEncoder: () => {
      if (failEncoder) throw new Error("injected encoder failure");
      return {
        beginRenderPass: () => pass,
        resolveQuerySet() {},
        copyBufferToBuffer() {},
        copyTextureToBuffer() {},
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
        // 255-filled so the boot smoke tests read a lit pixel, not black.
        getMappedRange: () => new Uint8Array(desc.size).fill(255).buffer,
        unmap() {},
        mapState: "unmapped",
        // opts.hangMapAt = N: the Nth mapAsync of the session never settles.
        mapAsync: () => (++mapCalls === opts.hangMapAt ? new Promise(() => {}) : Promise.resolve()),
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
  const configureCalls = [];
  let claimedBy = null;
  const canvas = {
    clientWidth: 320,
    clientHeight: 180,
    width: 0,
    height: 0,
    getContext: (type) => {
      if (claimedBy && claimedBy !== type) return null;
      claimedBy = type;
      return {
        configure(desc) { configureCalls.push(desc); },
        getCurrentTexture: () => canvasTexture,
      };
    },
  };
  const windowListeners = new Map();
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
    // opts.fakeTimers: timers are held until the test fires them (the swapchain
    // self-test's 4 s race arm must be firable without a 4 s wait).
    setTimeout: (fn, ms) => {
      if (opts.fakeTimers) { const t = { fn, ms, live: true }; timers.push(t); return t; }
      const t = setTimeout(fn, ms); if (t.unref) t.unref(); return t;
    },
    clearTimeout: (t) => { if (t && t.live) t.live = false; else clearTimeout(t); },
    window: {
      devicePixelRatio: 1,
      ...(opts.watchCss ? {
        addEventListener(type, fn) { windowListeners.set(type, fn); },
      } : {}),
    },
    localStorage: stored ? {
      getItem: (k) => (stored.has(k) ? stored.get(k) : null),
      setItem: (k, v) => { stored.set(k, String(v)); },
      removeItem: (k) => { stored.delete(k); },
    } : {
      // The storage-less harness is the DESKTOP ULTRA machine: WGX reads the
      // JSON-encoded GameStore preset at module scope (ULTRA → 4×, anything
      // else 1×, unset = HIGH = 1×), and the parity tests below want the full
      // 4× stack. Pass opts.storage (a Map) to test the other presets.
      getItem: (k) => (k === "apex26.gfxPreset" ? JSON.stringify("ultra") : null), setItem() {},
    },
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
          info: opts.softAdapterNonEnum
            ? (() => {
                const o = {};
                Object.defineProperty(o, "vendor", { value: "google", enumerable: false });
                Object.defineProperty(o, "architecture", { value: "swiftshader", enumerable: false });
                Object.defineProperty(o, "device", { value: "", enumerable: false });
                return o;
              })()
            : (opts.softAdapter
              ? {}
              : { vendor: "test", architecture: "test", device: "mock-gpu" }),
          isFallbackAdapter: !!(opts.softAdapter || opts.softAdapterNonEnum),
          requestDevice: async (desc) => {
            deviceRequests.push((desc && desc.requiredFeatures) || []);
            // The DEVICE answer is deliberately separate from the adapter's:
            // an adapter may advertise a feature and hand back a device without
            // it, and WGX has to re-derive from the device it actually holds.
            device.features = { has: (name) => deviceFeatures.includes(name) };
            return device;
          },
        }),
        getPreferredCanvasFormat: () => opts.preferredFormat || "bgra8unorm",
      },
    },
    GPUTextureUsage: { RENDER_ATTACHMENT: 1, TEXTURE_BINDING: 2, COPY_DST: 4, COPY_SRC: 8 },
    GPUBufferUsage: { UNIFORM: 1, COPY_DST: 2, STORAGE: 4, VERTEX: 8, INDEX: 16, QUERY_RESOLVE: 32, MAP_READ: 64, COPY_SRC: 128 },
    GPUShaderStage: { VERTEX: 1, FRAGMENT: 2 },
    GPUColorWrite: { RED: 1, GREEN: 2, BLUE: 4, ALL: 15 },
    GPUMapMode: { READ: 1 },
  });
  context.window.window = context.window;
  seedLog(context);
  vm.runInContext(`${CHUNKS_SOURCE}\nwindow.WGSLChunks = WGSLChunks;`, context);
  vm.runInContext(`${POST_SOURCE}\nwindow.WGSLPost = WGSLPost;`, context);
  vm.runInContext(`${FX_SOURCE}\nwindow.WGSLFx = WGSLFx;`, context);
  vm.runInContext(`${FRUSTUM_SOURCE.replace(/^const\b/gm, "var")}\nwindow.Frustum = Frustum;`, context);
  // Shared modules WGX reads at call time (manifest FULL entries): the light
  // slot budget, the post helpers, and the knob registry their defaults come from.
  vm.runInContext(`${LIGHT_BUDGET_SOURCE.replace(/^const\b/gm, "var")}\nwindow.LightBudget = LightBudget;`, context);
  vm.runInContext(`${KNOBS_SOURCE.replace(/^const\b/gm, "var")}\nwindow.LightKnobs = LightKnobs;`, context);
  vm.runInContext(`${POST_COMMON_SOURCE.replace(/^const\b/gm, "var")}\nwindow.PostCommon = PostCommon;`, context);
  vm.runInContext(`${VERTEX_PACK_SOURCE.replace(/^const\b/gm, "var")}\nwindow.VertexPack = VertexPack;`, context);
  vm.runInContext(`${INST_CELLS_SOURCE.replace(/^const\b/gm, "var")}\nwindow.InstCells = InstCells;`, context);
  vm.runInContext(`${CSS_SIZE_SOURCE.replace(/^const\b/gm, "var")}\nwindow.CanvasCssSize = CanvasCssSize;`, context);
  // GLX-seam modules (must precede wgx.js). Eval as separate scripts — the
  // WGX_BUNDLE used for source-text pins would redeclare WGSLChunks/Post/Fx.
  vm.runInContext(`${WGX_SHADOW_SOURCE}\nwindow.WGXShadow = WGXShadow;`, context);
  vm.runInContext(`${WGX_CHUNKED_SOURCE}\nwindow.WGXChunked = WGXChunked;`, context);
  vm.runInContext(`${WGX_POST_SOURCE}\nwindow.WGXPost = WGXPost;`, context);
  vm.runInContext(`${WGX_MAIN_SOURCE}\nwindow.WGX = WGX;`, context);

  return {
    canvas,
    device,
    textures,
    buffers,
    writes,
    pipelineDescs,
    asyncDescs,
    configureCalls,
    WGX: context.window.WGX,
    pipelines,
    deviceRequests,
    create: () => context.window.WGX.create(canvas),
    liveTimer: (ms) => timers.find((t) => t.live && t.ms === ms),
    fireTimer(ms) { const t = timers.find((x) => x.live && x.ms === ms); t.live = false; t.fn(); },
    mapCalls: () => mapCalls,
    // What the GLX fallback would find: null while the canvas is still free for
    // a webgl2 context, "webgpu" once WGX has claimed it.
    canvasClaimedBy: () => claimedBy,
    textureCount: () => textureCalls,
    failNextTexture(offset = 1) { failTextureAt = textureCalls + offset; },
    failNextView(offset = 1) { failViewAt = viewCalls + offset; },
    failNextBindGroup(offset = 1) { failBindGroupAt = bindGroupCalls + offset; },
    clearFailures() { failTextureAt = failViewAt = failBindGroupAt = Infinity; },
    advanceTime(ms) { now += ms; },
    fireWindow(type) { windowListeners.get(type)?.(); },
    loseDevice: (info) => loseDevice(info || { reason: "unknown" }),
    setEncoderFail(v) { failEncoder = !!v; },
    scopeDepth: () => scopeStack.length,
    holdPops() { holdPops = true; },
    pendingPops: () => pendingPops.map((p) => p.filter),
    // Resolve every queued pop with errFor(filter) (null = clean), then let the
    // promise callbacks run.
    async settlePops(errFor = () => null) {
      const q = pendingPops.splice(0);
      for (const p of q) p.resolve(errFor(p.filter));
      for (let i = 0; i < 5; i++) await Promise.resolve();
    },
    // This VM's Log ring (seedLog): what a phone's COPY DIAG would carry.
    logs: (filter) => context.Log.records(filter),
  };
}

const TRI = { pos: [0, 0, 0, 1, 0, 0, 0, 1, 0], nrm: [0, 1, 0, 0, 1, 0, 0, 1, 0], col: [1, 1, 1, 1, 1, 1, 1, 1, 1], idx: [0, 1, 2] };
const ID16 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const bufsOf = (m) => [m.vbuf, m.sbuf, m.ibuf].filter(Boolean);
const spin = async () => { for (let i = 0; i < 30; i++) await new Promise((r) => setImmediate(r)); };

// R2-GW-3. The swapchain present smoke test is raced against a 4 s timer and
// ABANDONED, not cancelled. A validation scope held across `await mapAsync`
// stays on top of the device stack once the timer wins and the frames start:
// it swallows their validation errors (uncapturederror never fires, so the
// runtime GPU-error ladder is deaf) and never pops if mapAsync never settles.
test("the swapchain self-test holds no error scope across its mapAsync", async () => {
  const h = makeGpuHarness({ errorScopes: true, fakeTimers: true, hangMapAt: 2 });
  const p = h.create();
  for (let i = 0; i < 400 && !h.liveTimer(4000); i++) await new Promise((r) => setImmediate(r));
  assert.ok(h.liveTimer(4000), "the present smoke test must have armed its 4 s race arm");
  assert.equal(h.mapCalls(), 2, "the readback is in flight (and, in this fixture, never settles)");
  assert.equal(h.scopeDepth(), 0,
    "no validation scope may stay open while the readback is pending: it would shadow every runtime GPU error");
  h.fireTimer(4000);
  const gfx = await p;
  assert.ok(gfx, "the timer arm accepts the backend");
  assert.equal(h.scopeDepth(), 0, "and the device error-scope stack is balanced afterwards");
});

test("the swapchain self-test still reports a validation error from its submit", async () => {
  const h = makeGpuHarness({ errorScopes: true });
  const orig = h.device.popErrorScope;
  let n = 0;
  // The present smoke test pops the LAST scope pair of boot; make that verdict a GPUError.
  h.device.popErrorScope = function () {
    const r = orig.call(this);
    return r.then((v) => (h.mapCalls() >= 2 && ++n === 1 ? { message: "injected validation" } : v));
  };
  const gfx = await h.create();
  assert.equal(n, 1, "the injected GPUError reached the swapchain smoke test's verdict");
  // A validation error on the swapchain smoke test with no other failure is
  // best-effort (swapchains often lack COPY_SRC): the backend must still boot.
  assert.ok(gfx, "validation-only verdict stays non-fatal, exactly as before");
  assert.equal(h.scopeDepth(), 0);
});

// R2-GW-4. freeMesh / freeChunkedMesh / freeInstancedBatch retire through
// _retiredBufs while a frame is recording, as freeTexture does.
test("freeMesh retires its buffers while a frame is recording and destroys them at the submit", async () => {
  const h = makeGpuHarness();
  const gfx = await h.create();
  const m = gfx.createMesh(TRI);
  const bufs = bufsOf(m);
  assert.ok(bufs.length >= 1);
  assert.equal(gfx.begin({}), true);
  gfx.freeMesh(m);
  assert.ok(bufs.every((b) => !b.destroyed), "in-frame free must not destroy a buffer the frame may reference");
  gfx.present({});
  assert.ok(bufs.every((b) => b.destroyed), "the frame's submit releases the retired buffers");
});

test("freeMesh outside a frame destroys at once", async () => {
  const h = makeGpuHarness();
  const gfx = await h.create();
  const m = gfx.createMesh(TRI);
  const bufs = bufsOf(m);
  gfx.freeMesh(m);
  assert.ok(bufs.every((b) => b.destroyed));
});

test("freeMesh retires while only the pending shadow encoder is live", async () => {
  const h = makeGpuHarness();
  const gfx = await h.create();
  const m = gfx.createMesh(TRI);
  const bufs = bufsOf(m);
  gfx.shadowBegin(null);
  gfx.castShadow(m, ID16);
  gfx.shadowEnd();
  gfx.freeMesh(m);
  assert.ok(bufs.every((b) => !b.destroyed), "a mesh cast into the pending shadow encoder must survive until its submit");
  assert.equal(gfx.begin({}), true);
  gfx.present({});
  assert.ok(bufs.every((b) => b.destroyed));
});

test("freeInstancedBatch retires the instance and shadow buffers in-frame", async () => {
  const h = makeGpuHarness();
  const gfx = await h.create();
  const mats = new Float32Array([...ID16, ...ID16]);
  const batch = gfx.createInstancedBatch(TRI, mats, null, { cellSize: 50 });
  const shadowInst = h.device.createBuffer({ size: 64, usage: 8 });
  batch.shadowInstBuf = shadowInst;
  const bufs = [...bufsOf(batch), batch.instBuf, shadowInst];
  assert.equal(gfx.begin({}), true);
  gfx.freeInstancedBatch(batch);
  assert.ok(bufs.every((b) => !b.destroyed), "no in-frame destroy");
  gfx.present({});
  assert.ok(bufs.every((b) => b.destroyed), "all released after the submit");
});

test("freeChunkedMesh retires its buffers in-frame (road ribbon and prop chunks)", async () => {
  const h = makeGpuHarness();
  const gfx = await h.create();
  const quads = 1001, pos = [], nrm = [], col = [], idx = [], mat = [], trk = [];
  for (let q = 0, v = 0; q < quads; q++, v += 4) {
    const x = q * 0.1;
    pos.push(x, 0, 0, x + 1, 0, 0, x + 1, 0, 1, x, 0, 1);
    idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
    for (let i = 0; i < 4; i++) { nrm.push(0, 1, 0); col.push(1, 1, 1); mat.push(1); trk.push(x, 0, 6); }
  }
  for (const road of [true, false]) {
    const m = gfx.createChunkedMesh({ pos, nrm, col, idx, mat, trk: road ? trk : undefined, _keepPositions: true }, 72);
    const bufs = new Set(bufsOf(m));
    for (const c of m.chunks) for (const b of [c.vbuf, c.ibuf, c.sbuf]) if (b) bufs.add(b);
    assert.ok(bufs.size >= 1);
    assert.equal(gfx.begin({}), true);
    gfx.freeChunkedMesh(m);
    assert.ok([...bufs].every((b) => !b.destroyed), (road ? "road" : "props") + ": in-frame free must retire");
    gfx.present({});
    assert.ok([...bufs].every((b) => b.destroyed), (road ? "road" : "props") + ": released after the submit");
  }
});
