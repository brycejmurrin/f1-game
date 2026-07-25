import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const ROOT = new URL("../", import.meta.url);
const P = (await import("node:module")).createRequire(import.meta.url)("../tools/manifest.cjs").PATHS;
const [CHUNKS_SOURCE, POST_SOURCE, WGX_SOURCE] = await Promise.all([
  readFile(new URL(P.WGSL_CHUNKS, ROOT), "utf8"),
  readFile(new URL(P.WGSL_POST, ROOT), "utf8"),
  readFile(new URL(P.WGX, ROOT), "utf8"),
]);

function makeGpuHarness() {
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
      submit() {},
    },
    createSampler: () => ({}),
    createBindGroupLayout: () => ({}),
    createPipelineLayout: () => ({}),
    createShaderModule: () => ({}),
    createRenderPipeline: () => pipeline,
    createCommandEncoder: () => ({
      beginRenderPass: () => pass,
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
    window: { devicePixelRatio: 1 },
    localStorage: { getItem: () => null, setItem() {} },
    location: { reload() {} },
    navigator: {
      userAgent: "",
      maxTouchPoints: 0,
      gpu: {
        requestAdapter: async () => ({ requestDevice: async () => device }),
        getPreferredCanvasFormat: () => "bgra8unorm",
      },
    },
    GPUTextureUsage: { RENDER_ATTACHMENT: 1, TEXTURE_BINDING: 2, COPY_DST: 4 },
    GPUBufferUsage: { UNIFORM: 1, COPY_DST: 2, STORAGE: 4, VERTEX: 8, INDEX: 16 },
    GPUShaderStage: { VERTEX: 1, FRAGMENT: 2 },
    GPUColorWrite: { RED: 1, GREEN: 2, BLUE: 4, ALL: 15 },
  });
  context.window.window = context.window;
  vm.runInContext(`${CHUNKS_SOURCE}\nwindow.WGSLChunks = WGSLChunks;`, context);
  vm.runInContext(`${POST_SOURCE}\nwindow.WGSLPost = WGSLPost;`, context);
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
  assert.equal(gfx.begin({}), true);
  const oldTextures = h.textures.slice();

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
  assert.match(CHUNKS_SOURCE, /FRAME_UNIFORM_BYTES:\s*464/);
  assert.match(POST_SOURCE, /COMPOSITE_UNIFORM_BYTES:\s*256/);
  assert.match(POST_SOURCE, /dirtFx\s*:\s*vec4<f32>.*off 240/);

  const h = makeGpuHarness();
  const gfx = await h.create();
  gfx.resize();
  assert.equal(gfx.begin({ tune: {}, shadowCtr: [11, 22, 33] }), true);
  gfx.present({ tune: {} });
  const frameBuffer = h.buffers.find((buffer) => buffer.desc.size === 464);
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
  // dirtFx = (lensDirt, _pad, _pad, _pad) at off 240 = floats 60..63. Default
  // 0.15 reproduces the shipped GLX lens-dirt strength. (f32 rounding: 0.15 isn't
  // exactly representable, so compare with a tol; the pads are exact zeros.)
  assert.ok(Math.abs(composite[60] - 0.15) < 1e-6, "lensDirt default in dirtFx.x (float 60)");
  assert.deepEqual(composite.slice(61, 64), [0, 0, 0], "dirtFx pads must be 0 (floats 61..63)");

  // Extreme upload: powers-of-two fractions (0.25/0.75/3.5 …) are exactly f32-
  // representable, so these lanes can be compared exactly. carSparkle/fogSunCore
  // live in the FRAME uniform (params6, written at begin()); flareStreak2/aces*
  // and the HDR grade live in the COMPOSITE uniform (written at present()).
  assert.equal(gfx.begin({ tune: { wetDark: -7, carSparkle: 0.25, fogSunCore: 0.75,
    fogClip: 0.5, carSunGlint: 3.5, neonBoost: 0.75, lampNearClamp: 2.5 }, shadowCtr: [44, 55, 66] }), true);
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
  } });
  frame = h.writes.filter((write) => write.buffer === frameBuffer).at(-1).values;
  assert.deepEqual(frame.slice(88, 92), [44, 55, 66, 80], "wetDark must not overwrite shadowCtr");
  assert.equal(frame[92], -7);
  assert.equal(frame[94], 0.25, "carSparkle must occupy params6.z (float 94)");
  assert.equal(frame[95], 0.75, "fogSunCore must occupy params6.w (float 95)");
  assert.equal(frame[112], 0.5, "fogClip must occupy params7.x (float 112)");
  assert.equal(frame[113], 3.5, "carSunGlint must occupy params7.y (float 113)");
  assert.equal(frame[114], 0.75, "neonBoost must occupy params7.z (float 114)");
  assert.equal(frame[115], 2.5, "lampNearClamp must occupy params7.w (float 115)");
  composite = h.writes.filter((write) => write.buffer === compositeBuffer).at(-1).values;
  assert.equal(composite[31], 4.25);
  assert.equal(composite[32], -2.5);
  assert.equal(composite[33], 1.75, "flareStreak2 must occupy tuneFx.y (float 33)");
  assert.equal(composite[34], 0.5, "acesE must occupy tuneFx.z (float 34)");
  assert.equal(composite[35], 3.5, "flareStreak must occupy tuneFx.w (float 35)");
  assert.deepEqual(composite.slice(56, 60), [3, 0.25, 3.5, 0.75], "aces a,b,c,d must occupy floats 56..59");
  assert.equal(composite[60], 0.75, "lensDirt must occupy dirtFx.x (float 60)");
  assert.deepEqual(composite.slice(61, 64), [0, 0, 0], "dirtFx pads must stay 0 (floats 61..63)");
  assert.deepEqual(composite.slice(36, 40), [1, 2, 3, 4], "tone0 must occupy floats 36..39");
  assert.deepEqual(composite.slice(40, 44), [5, 6, 7, 0], "tone1 must occupy floats 40..43");
  assert.deepEqual(composite.slice(44, 48), [8, 9, 10, 0], "lift must occupy floats 44..47");
  assert.deepEqual(composite.slice(48, 52), [11, 12, 13, 0], "gamma must occupy floats 48..51");
  assert.deepEqual(composite.slice(52, 56), [14, 15, 16, 0], "gain must occupy floats 52..55");
});

test("WebGPU SkyU packs GLX-parity sky knobs at the expected lanes", async () => {
  // SkyU grew from 208 → 224 (mat4 64 + 10 vec4 160) for the p4 knob lane.
  assert.match(CHUNKS_SOURCE, /SKY_UNIFORM_BYTES:\s*224/);
  assert.match(CHUNKS_SOURCE, /p3\s*:\s*vec4<f32>.*starSize, starTwinkle, moonDiscSize/);
  assert.match(CHUNKS_SOURCE, /p4\s*:\s*vec4<f32>.*moonHalo, sunCorona, sunSquash, cityGlowReach/);

  const h = makeGpuHarness();
  const gfx = await h.create();
  gfx.resize();
  const skyBuffer = h.buffers.find((buffer) => buffer.desc.size === 224);
  assert.ok(skyBuffer, "a 224-byte SkyU buffer must be allocated");

  // Defaults: every parity knob resolves to 1.0 (= as-shipped GLX look). p3.x is
  // DAY SKY BLUE; p3.yzw + p4 are the seven new knobs.
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

  // Extreme upload: exactly-f32-representable fractions so lanes compare exactly.
  gfx.drawSky({ starSize: 0.25, starTwinkle: 0.75, moonDiscSize: 3.5, moonHalo: 0.5,
    sunCorona: 2.5, sunSquash: 0.125, cityGlowReach: 4.25 });
  sky = h.writes.filter((write) => write.buffer === skyBuffer).at(-1).values;
  assert.equal(sky[49], 0.25, "starSize must occupy p3.y (float 49)");
  assert.equal(sky[50], 0.75, "starTwinkle must occupy p3.z (float 50)");
  assert.equal(sky[51], 3.5, "moonDiscSize must occupy p3.w (float 51)");
  assert.equal(sky[52], 0.5, "moonHalo must occupy p4.x (float 52)");
  assert.equal(sky[53], 2.5, "sunCorona must occupy p4.y (float 53)");
  assert.equal(sky[54], 0.125, "sunSquash must occupy p4.z (float 54)");
  assert.equal(sky[55], 4.25, "cityGlowReach must occupy p4.w (float 55)");
});

test("WGSL sky consumes the GLX-parity knob lanes", () => {
  assert.match(CHUNKS_SOURCE, /pow\(sd, 300\.0\) \* 0\.95 \* sunCorona/, "SUN CORONA RING knob");
  assert.match(CHUNKS_SOURCE, /mix\(1\.0, mix\(1\.0, 1\.6, golden\), sunSquash\)/, "SUN HORIZON SQUASH knob");
  assert.match(CHUNKS_SOURCE, /0\.20 \* starTwinkle \* sin/, "STAR TWINKLE knob");
  assert.match(CHUNKS_SOURCE, /mix\(0\.0016, 0\.0028, giant\) \* starSize/, "STAR SIZE knob");
  assert.match(CHUNKS_SOURCE, /smoothstep\(0\.025 \* moonDiscSize, 0\.010 \* moonDiscSize/, "MOON DISC SIZE knob");
  assert.match(CHUNKS_SOURCE, /140\.0 \/ moonHaloK\)\) \* 0\.28 \* moonHaloK/, "MOON HALO knob");
  assert.match(CHUNKS_SOURCE, /3\.0 \* cityGlowReach/, "CITY GLOW REACH knob");
});

test("WGSL consumes wet darkening, bloom knee, and vignette softness uniforms", () => {
  assert.match(
    CHUNKS_SOURCE,
    /mix\(1\.0,\s*clamp\(1\.0\s*-\s*0\.58\s*\*\s*F\.params6\.x,\s*0\.0,\s*1\.0\),\s*wet\)/,
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
