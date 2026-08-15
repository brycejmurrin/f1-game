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

function makeGpuHarness(opts = {}) {
  const textures = [];
  const buffers = [];
  const writes = [];
  let textureCalls = 0;
  let viewCalls = 0;
  let bindGroupCalls = 0;
  let failTextureAt = Infinity;
  let failViewAt = Infinity;
  let failBindGroupAt = Infinity;
  let now = 10_000;

  const pass = new Proxy({}, { get: () => () => {} });
  const pipeline = { getBindGroupLayout: () => ({}) };
  const device = {
    lost: new Promise(() => {}),
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
    createShaderModule: () => ({}),
    createRenderPipeline: () => pipeline,
    createQuerySet: () => ({ count: 2 }),
    createCommandEncoder: () => ({
      beginRenderPass: () => pass,
      resolveQuerySet() {},
      copyBufferToBuffer() {},
      finish: () => ({}),
    }),
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
    createBindGroup() {
      bindGroupCalls += 1;
      if (bindGroupCalls === failBindGroupAt) throw new Error("injected bind-group failure");
      return {};
    },
  };
  const canvasTexture = { createView: () => ({ swapchain: true }) };
  const canvas = {
    clientWidth: 320,
    clientHeight: 180,
    width: 0,
    height: 0,
    getContext: () => ({
      configure() {},
      getCurrentTexture: () => canvasTexture,
    }),
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
    localStorage: { getItem: () => null, setItem() {} },
    location: { reload() {} },
    GLX: opts.glx || undefined,
    navigator: {
      userAgent: opts.ua || "",
      maxTouchPoints: 0,
      gpu: {
        requestAdapter: async () => ({
          features: { has: (name) => name === "timestamp-query" },
          requestDevice: async () => {
            device.features = { has: (name) => name === "timestamp-query" };
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
    create: () => context.window.WGX.create(canvas),
    textureCount: () => textureCalls,
    failNextTexture(offset = 1) { failTextureAt = textureCalls + offset; },
    failNextView(offset = 1) { failViewAt = viewCalls + offset; },
    failNextBindGroup(offset = 1) { failBindGroupAt = bindGroupCalls + offset; },
    clearFailures() { failTextureAt = failViewAt = failBindGroupAt = Infinity; },
    advanceTime(ms) { now += ms; },
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
  assert.equal(gfx.msaa(), 2);
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
  // LIGHT_BYTES = LIGHT_STRIDE_BYTES * MAX_LIGHTS (64 * 48 = 3072). Was 2048
  // at the old 32-slot cap; a hardcoded size silently matches nothing.
  const stride = +CHUNKS_SOURCE.match(/LIGHT_STRIDE_BYTES:\s*(\d+)/)[1];
  const maxL = +CHUNKS_SOURCE.match(/MAX_LIGHTS:\s*(\d+)/)[1];
  const lightBufs = h.buffers.filter((buffer) => buffer.desc.size === stride * maxL);
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

test("WGX source keeps the proven parity fixes", () => {
  assert.match(WGX_SOURCE, /_lampShadowArmed = false/);
  assert.match(WGX_SOURCE, /mapState === "unmapped"/);
  assert.match(WGX_SOURCE, /pParticleAdd/);
  assert.match(WGX_SOURCE, /_grByD/);
  assert.doesNotMatch(WGX_SOURCE, /colors\[i \* 3\] \|\| 1/);
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
  // stack there. WGX cannot: timestamp-query + MSAA 2× rgba16float is what
  // painted one frame then lost the device. Phone ULTRA also matches GLX
  // here — js/render/glx/post.js keys MSAA on IS_MOBILE (never MOBILE_TIER).
  assert.match(WGX_SOURCE, /WGX_LITE = !!\(IS_MOBILE \|\| IS_WEBKIT \|\| _litePref\)/);
  assert.match(WGX_SOURCE, /WGX_LITE \? "low-power" : "high-performance"/);
  assert.match(WGX_SOURCE, /if \(!adapter\) adapter = await navigator\.gpu\.requestAdapter\(\)/);
  assert.match(WGX_SOURCE, /_canTimestamp = !WGX_LITE && !!\(adapter\.features/);
  assert.match(WGX_SOURCE, /MSAA_COUNT = WGX_LITE \? 1 : 2/);
  assert.match(WGX_SOURCE, /apex26\.gfxWgxFail/);
});

test("desktop harness still takes the full WGX stack (GLX-parity)", async () => {
  const h = makeGpuHarness();
  const gfx = await h.create();
  assert.equal(gfx.msaa(), 2, "Chrome desktop keeps MSAA 2, same as GLX IS_MOBILE=false");
  assert.equal(gfx.gpuTimer().supported, true, "timestamp-query stays on the non-lite path");
  assert.equal(gfx.carShadowState().enabled, true);
  assert.equal(gfx.lampShadowState().enabled, true);
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

test("phone WGX matches GLX: no MSAA even when the memory tier is HIGH", async () => {
  // GLX: msaaSamples = IS_MOBILE ? 0 : 2 (js/render/glx/post.js). WGX used to
  // key MSAA on MOBILE_TIER, so GRAPHICS: ULTRA on a phone took MSAA 2×
  // rgba16float and lost the device after one frame.
  const h = makeGpuHarness({ glx: { isMobile: true, mobileTier: false } });
  const gfx = await h.create();
  assert.equal(gfx.isMobile, true);
  assert.equal(gfx.mobileTier, false);
  assert.equal(gfx.msaa(), 1);
  assert.equal(gfx.gpuTimer().supported, false);
  assert.equal(gfx.carShadowState().enabled, false);
});
