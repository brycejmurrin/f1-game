// assets-pack.test.mjs — guards the baked asset pack (assets/pack/) and the
// contract between it, the bake tool and the shader.
//
// The three things that can silently rot here:
//   1. The bake tool's MAT table drifting from TrackGeom.MAT, which would
//      texture the wrong surfaces with nobody noticing (a stone wall shaded as
//      foliage still *renders*).
//   2. A licence or an untraceable source sneaking into a committed pack.
//   3. The pack quietly growing past the clone-time budget.
//
// Run: node --test tests/unit/assets-pack.test.mjs   (npm run test:tooling)

import { test } from "node:test";
import assert from "node:assert/strict";
import { readAX26, ax26Version } from "../helpers/ax26.mjs";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import cp from "node:child_process";
import vm from "node:vm";
import { seedLog } from "../helpers/seed-log.mjs";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PACK = path.join(ROOT, "assets", "pack");
const MANIFEST = path.join(PACK, "manifest.json");
const BUDGET_BYTES = 8 * 1024 * 1024;         // must match tools/gen/assets.mjs
const ALLOWED = new Set(["CC0", "CC0-1.0", "Apex26-Procedural"]);
// What every pack-strip createImageBitmap must ask for (see the P1 test below).
const STRAIGHT_BITMAP = { premultiplyAlpha: "none", colorSpaceConversion: "none" };

const TOOL_SRC = fs.readFileSync(path.join(ROOT, "tools", "gen", "assets.mjs"), "utf8");
const hasPack = fs.existsSync(MANIFEST);
const manifest = hasPack ? JSON.parse(fs.readFileSync(MANIFEST, "utf8")) : null;

test("GLTF accessors stay inside their declared bufferView and reject invalid stride", () => {
  const ctx = vm.createContext({
    ArrayBuffer, DataView, Uint8Array, Float32Array, Uint16Array, Uint32Array,
    TextDecoder, Log: { enabled: () => false },
  });
  const gltf = vm.runInContext(fs.readFileSync(path.join(ROOT, "js/render/shared/gltf.js"), "utf8") + ";GLTF", ctx);
  const makeGlb = (viewLength, stride) => {
    const bin = Buffer.alloc(48);
    for (let i = 0; i < 9; i++) bin.writeFloatLE(i % 3 === 2 ? 0 : i, i * 4);
    const view = { buffer: 0, byteOffset: 0, byteLength: viewLength };
    if (stride !== undefined) view.byteStride = stride;
    const json = { asset: { version: "2.0" }, buffers: [{ byteLength: bin.length }],
      bufferViews: [view], accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3" }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
      nodes: [{ mesh: 0 }], scenes: [{ nodes: [0] }], scene: 0 };
    const j = Buffer.from(JSON.stringify(json));
    const padded = Buffer.concat([j, Buffer.alloc((4 - j.length % 4) % 4, 0x20)]);
    const glb = Buffer.alloc(12 + 8 + padded.length + 8 + bin.length);
    glb.writeUInt32LE(0x46546c67, 0); glb.writeUInt32LE(2, 4);
    glb.writeUInt32LE(glb.length, 8);
    glb.writeUInt32LE(padded.length, 12); glb.writeUInt32LE(0x4e4f534a, 16);
    padded.copy(glb, 20);
    glb.writeUInt32LE(bin.length, 20 + padded.length);
    glb.writeUInt32LE(0x004e4942, 24 + padded.length);
    bin.copy(glb, 28 + padded.length);
    return Uint8Array.from(glb).buffer;
  };
  assert.equal(gltf.toMesh(makeGlb(36)).pos.length, 9, "valid packed accessor must still parse");
  assert.throws(() => gltf.toMesh(makeGlb(24)), /GLTF: accessor exceeds bufferView bounds/);
  assert.throws(() => gltf.toMesh(makeGlb(36, 8)), /invalid stride/);
  assert.throws(() => gltf.toMesh(makeGlb(36, 16)), /GLTF: accessor exceeds bufferView bounds/);
  assert.throws(() => gltf.toMesh(makeGlb(100)), /GLTF: accessor exceeds bufferView bounds/);
});

function assetLoader(overrides = {}) {
  const vm = require("node:vm");
  const sandbox = { ...overrides };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  seedLog(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/render/shared/assets.js"), "utf8"), sandbox);
  return sandbox.Assets;
}

test("asset loader shares an in-flight manifest across boot consumers", async () => {
  let requests = 0, resolveFetch;
  const assets = assetLoader({ fetch() {
    requests++;
    return new Promise(resolve => { resolveFetch = resolve; });
  } });
  assets.init({ createTextureArray() {}, setMaterialMaps() {} });
  const material = assets.load(), models = assets.loadModels(), manifest = assets.manifest();
  const started = requests;
  resolveFetch({ ok: true, json: async () => ({ models: {} }) });
  assert.equal(started, 1, "materials, models and callers share one request");
  await Promise.all([material, models, manifest]);
  await assets.manifest();
  assert.equal(requests, 1, "settled manifest stays cached");
});

test("asset loader shares an in-flight manifest failure and retries a later request", async () => {
  let requests = 0;
  const assets = assetLoader({ async fetch() {
    requests++;
    if (requests === 1) throw Error("offline");
    return { ok: true, json: async () => ({ models: {} }) };
  } });
  const results = await Promise.all([assets.manifest(), assets.manifest()]);
  assert.deepEqual(results, [false, false]);
  assert.deepEqual(await assets.manifest(), { models: {} });
  assert.equal(requests, 2, "a transient manifest failure cannot poison this tab");
  await assets.manifest();
  assert.equal(requests, 2, "a successful manifest remains cached");
});

function deferredAssetDownload() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test("material strips download together, then preserve sequential decode and upload inputs", async () => {
  const requests = [], events = [], bitmaps = [], installed = [];
  const downloads = { "a.png": deferredAssetDownload(), "n.png": deferredAssetDownload() };
  const albedo = { size: 18, pixels: [10, 20, 30, 255] };
  const normal = { size: 24, pixels: [128, 128, 255, 255] };
  const assets = assetLoader({
    async fetch(url) {
      if (url.endsWith("manifest.json")) return { ok: true, json: async () => ({ materials: {
        size: 4, albedo: "a.png", normal: "n.png",
        layers: [{ mat: 1, scale: 2 }, { mat: 3, scale: 5 }],
      } }) };
      requests.push(url);
      return downloads[url.split("/").pop()].promise;
    },
    async createImageBitmap(blob, ...crop) {
      const kind = blob === albedo ? "albedo" : blob === normal ? "normal" : "unexpected";
      assert.notEqual(kind, "unexpected", "the downloaded blob reaches decoding unchanged");
      events.push(`decode:${kind}`);
      const b = { kind, crop, pixels: blob.pixels, closed: 0, close() { this.closed++; } };
      bitmaps.push(b);
      return b;
    },
  });
  assets.init({
    createTextureArray(size, images, layers) {
      const kind = images[1].kind;
      events.push(`upload:${kind}`);
      assert.equal(size, 4);
      assert.equal(layers, 17);
      assert.equal(images.length, 17);
      assert.deepEqual(Object.keys(images), ["1", "3"]);
      for (const id of [1, 3]) {
        assert.equal(images[id].closed, 0, "upload must precede bitmap release");
        assert.deepEqual(images[id].crop.slice(0, 4), [0, id * 4, 4, 4]);
        assert.deepEqual({ ...images[id].crop[4] }, STRAIGHT_BITMAP);
        assert.strictEqual(images[id].pixels, kind === "albedo" ? albedo.pixels : normal.pixels);
      }
      return { kind };
    },
    setMaterialMaps(v) { installed.push(v); },
  });
  const pending = assets.load();
  assert.strictEqual(assets.load(), pending, "concurrent loads still share all work");
  await new Promise(setImmediate);
  assert.deepEqual(requests, ["assets/pack/a.png", "assets/pack/n.png"], "both requests start before either response");
  downloads["n.png"].resolve({ ok: true, blob: async () => normal });
  await new Promise(setImmediate);
  assert.deepEqual(events, [], "normal download finishing first cannot reorder decode or upload");
  assert.equal(assets.state().bytes, normal.size, "bytes record completed compressed downloads");
  downloads["a.png"].resolve({ ok: true, blob: async () => albedo });
  assert.equal(await pending, true);
  assert.deepEqual(events, ["decode:albedo", "decode:albedo", "upload:albedo", "decode:normal", "decode:normal", "upload:normal"]);
  assert.deepEqual(bitmaps.map(b => b.closed), [1, 1, 1, 1]);
  assert.equal(installed.length, 1);
  assert.equal(installed[0].albedo.kind, "albedo");
  assert.equal(installed[0].normal.kind, "normal");
  assert.equal(installed[0].scales[1], 2);
  assert.equal(installed[0].scales[3], 5);
  assert.equal(assets.state().bytes, albedo.size + normal.size);
});

test("an albedo-only material variant never requests or decodes a normal strip", async () => {
  const requests = [], blob = { size: 12 };
  let decoded = 0, uploaded = 0, installed;
  const assets = assetLoader({
    async fetch(url) {
      requests.push(url);
      return url.endsWith("manifest.json")
        ? { ok: true, json: async () => ({ materials: { size: 2, albedo: "a.png", layers: [{ mat: 1, scale: 1 }] } }) }
        : { ok: true, blob: async () => blob };
    },
    async createImageBitmap(source, ...crop) {
      assert.strictEqual(source, blob);
      assert.deepEqual(crop.slice(0, 4), [0, 2, 2, 2]);
      assert.deepEqual({ ...crop[4] }, STRAIGHT_BITMAP, "the crop decodes straight, un-colour-managed");
      decoded++;
      return { close() {} };
    },
  });
  assets.init({ createTextureArray() { uploaded++; return {}; }, setMaterialMaps(v) { installed = v; } });
  assert.equal(await assets.load(), true);
  assert.deepEqual(requests, ["assets/pack/manifest.json", "assets/pack/a.png"]);
  assert.equal(decoded, 1);
  assert.equal(uploaded, 1);
  assert.equal(installed.normal, null);
  assert.equal(assets.state().bytes, blob.size);
});

test("a normal fetch failure is not the pack's failure: a later albedo rejection still decides", async () => {
  const downloads = { "a.png": deferredAssetDownload(), "n.png": deferredAssetDownload() };
  let decodes = 0, uploads = 0;
  const assets = assetLoader({
    async fetch(url) {
      return url.endsWith("manifest.json")
        ? { ok: true, json: async () => ({ materials: { size: 2, albedo: "a.png", normal: "n.png", layers: [{ mat: 1, scale: 1 }] } }) }
        : downloads[url.split("/").pop()].promise;
    },
    async createImageBitmap() { decodes++; return { close() {} }; },
  });
  assets.init({ createTextureArray() { uploads++; return {}; }, setMaterialMaps() {} });
  const pending = assets.load();
  await new Promise(setImmediate);
  downloads["n.png"].resolve({ ok: false });
  await new Promise(setImmediate); // node:test reports an unhandled rejection as a failure
  downloads["a.png"].reject(Error("albedo offline after normal failure"));
  assert.equal(await pending, false);
  assert.equal(assets.state().error, "albedo offline after normal failure");
  assert.equal(decodes, 0);
  assert.equal(uploads, 0);
  assert.equal(assets.state().uploaded, false);
  assert.equal(assets.state().bytes, 0);
});

test("a missing normal strip still ships the albedo pack (normal = null)", async () => {
  const maps = [];
  const assets = assetLoader({
    async fetch(url) {
      if (url.endsWith("manifest.json"))
        return { ok: true, json: async () => ({ materials: { size: 2, albedo: "a.png", normal: "n.png", layers: [{ mat: 1, scale: 1 }] } }) };
      return url.endsWith("n.png") ? { ok: false } : { ok: true, blob: async () => ({ size: 16 }) };
    },
    async createImageBitmap() { return { close() {} }; },
  });
  assets.init({ createTextureArray() { return { id: "albedo" }; }, setMaterialMaps(v) { maps.push(v); } });
  assert.equal(await assets.load(), true);
  assert.equal(maps.length, 1);
  assert.equal(maps[0].albedo.id, "albedo");
  assert.equal(maps[0].normal, null);
  assert.equal(assets.state().uploaded, true);
  assert.equal(assets.state().error, null);
});

test("a normal decode failure keeps the albedo upload and closes its bitmaps", async () => {
  const bitmaps = [], freed = [], maps = [];
  const assets = assetLoader({
    async fetch(url) {
      return url.endsWith("manifest.json")
        ? { ok: true, json: async () => ({ materials: { size: 2, albedo: "a.png", normal: "n.png", layers: [{ mat: 1, scale: 1 }] } }) }
        : { ok: true, blob: async () => ({ size: 16, normal: url.endsWith("n.png") }) };
    },
    async createImageBitmap(blob) {
      if (blob.normal) throw Error("normal decode failed"); // crop and full-strip fallback both reject
      const b = { closed: 0, close() { this.closed++; } };
      bitmaps.push(b);
      return b;
    },
  });
  assets.init({
    createTextureArray() { return { id: "albedo" }; },
    freeTexture(t) { freed.push(t.id); },
    setMaterialMaps(v) { maps.push(v); },
  });
  assert.equal(await assets.load(), true);
  assert.equal(assets.state().error, null);
  assert.equal(assets.state().bytes, 32);
  assert.deepEqual(freed, []);
  assert.deepEqual(bitmaps.map(b => b.closed), [1]);
  assert.equal(maps.length, 1);
  assert.equal(maps[0].albedo.id, "albedo");
  assert.equal(maps[0].normal, null);
});

test("unload during parallel downloads rejects the stale generation before any decode", async () => {
  const downloads = { "a.png": deferredAssetDownload(), "n.png": deferredAssetDownload() };
  let decodes = 0, uploads = 0;
  const maps = [];
  const assets = assetLoader({
    async fetch(url) {
      return url.endsWith("manifest.json")
        ? { ok: true, json: async () => ({ materials: { size: 2, albedo: "a.png", normal: "n.png", layers: [{ mat: 1, scale: 1 }] } }) }
        : downloads[url.split("/").pop()].promise;
    },
    async createImageBitmap() { decodes++; return { close() {} }; },
  });
  assets.init({ createTextureArray() { uploads++; return {}; }, setMaterialMaps(v) { maps.push(v); } });
  const pending = assets.load();
  await new Promise(setImmediate);
  assets.unload();
  for (const d of Object.values(downloads)) d.resolve({ ok: true, blob: async () => ({ size: 16 }) });
  assert.equal(await pending, false);
  assert.equal(decodes, 0);
  assert.equal(uploads, 0);
  assert.deepEqual(maps, [null]);
  assert.equal(assets.state().tier, "off");
  assert.equal(assets.state().uploaded, false);
  assert.equal(assets.state().bytes, 32, "finished downloads still count as fetched bytes");
});

test("material and model loads recover after a temporarily unavailable pack", async () => {
  let online = false, manifestGets = 0, modelGets = 0;
  const assets = assetLoader({
    async fetch(url) {
      if (url.endsWith("manifest.json")) {
        manifestGets++;
        return online ? { ok: true, json: async () => ({
          models: { sign: { file: "sign.ax26" } },
          materials: { size: 2, albedo: "a.png", layers: [{ mat: 1, scale: 1 }] },
        }) } : { ok: false };
      }
      if (url.endsWith("sign.ax26")) { modelGets++; return { ok: false }; }
      return { ok: true, blob: async () => ({ size: 1 }) };
    },
    async createImageBitmap() { return { close() {} }; },
  });
  assets.init({ createTextureArray: () => ({}), setMaterialMaps() {} });
  assert.equal(await assets.model("sign"), null);
  assert.equal(await assets.load(), false);
  online = true;
  assert.equal(await assets.load(), true, "a previously failed material load retries");
  assert.ok(manifestGets >= 2);
  assert.equal(await assets.model("sign"), null);
  assert.equal(await assets.model("sign"), null);
  assert.equal(modelGets, 2, "a failed model fetch does not permanently cache a miss");
});

// 3-F2 (round-3 hunt): boot asks for the material arrays ONCE (game.js kickPack,
// one idle slice, refused once tier is "off"), so one dropped strip request left
// every race of the session on procedural materials. startRace calls
// Assets.retry(): one more load per session, never for an unsupported backend,
// never after an explicit unload.
test("a failed pack load is retried once at race entry, and only once (3-F2)", async () => {
  let stripGets = 0, drop = 1;
  const pack = () => assetLoader({
    async fetch(url) {
      if (url.endsWith("manifest.json")) return { ok: true, json: async () => ({ materials: { size: 2, albedo: "a.png", layers: [{ mat: 1, scale: 1 }] } }) };
      stripGets++;
      if (drop > 0) { drop--; throw new TypeError("Failed to fetch"); }   // a flaky link drops the request
      return { ok: true, blob: async () => ({ size: 1 }) };
    },
    async createImageBitmap() { return { close() {} }; },
  });
  const assets = pack();
  assets.init({ createTextureArray: () => ({}), setMaterialMaps() {} });
  assert.equal(await assets.load(), false, "the boot load drops its strip");
  assert.equal(assets.state().tier, "off");
  assert.equal(typeof assets.retry, "function", "Assets.retry exists");
  assert.equal(assets.retry(), true, "race entry asks again");
  await assets.load();   // shares the retry's in-flight promise
  assert.equal(assets.state().uploaded, true, "the retry lands the pack");
  assert.equal(assets.retry(), false, "nothing to retry once uploaded");

  drop = 99; stripGets = 0;
  const flaky = pack();
  flaky.init({ createTextureArray: () => ({}), setMaterialMaps() {} });
  await flaky.load();
  assert.equal(flaky.retry(), true);
  await flaky.load();
  const after = stripGets;
  assert.equal(flaky.retry(), false, "ONE retry per session: no loop on a dead link");
  assert.equal(stripGets, after);

  const off = pack(); drop = 1;
  off.init({ createTextureArray: () => ({}), setMaterialMaps() {} });
  await off.load();
  off.unload();
  assert.equal(off.retry(), false, "an explicit unload is never undone by the retry");

  const nobackend = assetLoader({ async fetch() { throw new Error("must not fetch"); } });
  nobackend.init({});
  assert.equal(await nobackend.load(), false);
  assert.equal(nobackend.state().error, "backend");
  assert.equal(nobackend.retry(), false, "an unsupported backend is not retried");

  const game = fs.readFileSync(path.join(ROOT, "js/game.js"), "utf8");
  const startRace = game.slice(game.indexOf("function startRace() {"), game.indexOf("RaceEntryProfile.runSession(sessionEntry"));
  assert.match(startRace, /Assets\.retry\(\)/, "startRace asks Assets for its one retry");
  assert.doesNotMatch(startRace, /await[^;\n]*Assets\.retry/, "…and never waits on it");
});

for (const failFallback of [true, false]) {
  test(`asset loader closes every decoded bitmap when fallback ${failFallback ? "fails" : "succeeds"}`, async () => {
    const bitmaps = [];
    function bitmap() { const b = { closed: 0, close() { this.closed++; } }; bitmaps.push(b); return b; }
    let crops = 0, fallbackCrops = 0, uploads = 0;
    const blob = { size: 100 };
    const assets = assetLoader({
      async fetch(url) {
        return url.endsWith("manifest.json")
          ? { ok: true, json: async () => ({ materials: { size: 8, albedo: "a.png", layers: [{ mat: 1, scale: 1 }, { mat: 2, scale: 1 }] } }) }
          : { ok: true, blob: async () => blob };
      },
      async createImageBitmap(source, ...args) {
        const crop = args.length > 1;
        if (crop && source === blob && ++crops === 2) throw Error("crop unsupported");
        // The fallback crops the full-strip BITMAP, never a canvas.
        if (crop && source !== blob && ++fallbackCrops === 2 && failFallback) throw Error("fallback failed");
        return bitmap();
      },
    });
    assets.init({
      createTextureArray(size, images) {
        uploads++;
        for (const b of images) if (b) assert.equal(b.closed, 0, "upload happens before release");
        return {};
      },
      setMaterialMaps() {}
    });
    assert.equal(await assets.load(), !failFallback);
    assert.equal(uploads, failFallback ? 0 : 1);
    assert.ok(bitmaps.length >= 3);
    for (const b of bitmaps) assert.equal(b.closed, 1, "every bitmap is released exactly once");
  });
}

// P1 2026-10-04: the albedo strip's alpha is ROUGHNESS. createImageBitmap's
// default premultiplyAlpha is UA-chosen and Chromium premultiplies: the metal
// layer (mean alpha 104) uploaded at 40 % brightness (artifacts/probe/
// run-premul.mjs: meanR 152.6 straight vs 61.5 default). Every decode — the
// crop, the full-strip fallback and its crops — must ask for straight,
// un-colour-managed pixels, and no path may route through a 2D canvas (its
// backing store premultiplies in every engine).
for (const path of ["crop", "fallback"]) {
  test(`every material-strip createImageBitmap passes straight-alpha options (${path} path)`, async () => {
    const calls = [];
    const blob = { size: 64 };
    const touched = [];
    const assets = assetLoader({
      async fetch(url) {
        return url.endsWith("manifest.json")
          ? { ok: true, json: async () => ({ materials: { size: 4, albedo: "a.png", normal: "n.png", layers: [{ mat: 1, scale: 1 }, { mat: 16, scale: 2 }] } }) }
          : { ok: true, blob: async () => blob };
      },
      async createImageBitmap(source, ...args) {
        calls.push({ source, args });
        if (path === "fallback" && source === blob && args.length > 1) throw Error("crop unsupported");
        return { close() {} };
      },
      OffscreenCanvas: class { constructor() { touched.push("OffscreenCanvas"); } getContext(k) { touched.push(k); return null; } },
      document: { createElement(t) { touched.push(t); return { getContext() { return null; } }; } },
    });
    assets.init({ createTextureArray() { return {}; }, setMaterialMaps() {} });
    assert.equal(await assets.load(), true);
    assert.ok(calls.length >= (path === "crop" ? 4 : 6), `decoded ${calls.length}`);
    for (const c of calls) {
      const opts = c.args[c.args.length - 1];
      assert.equal(typeof opts, "object", "the options object is the last argument");
      assert.deepEqual({ ...opts }, STRAIGHT_BITMAP);
      assert.ok(c.args.length === 1 || c.args.length === 5, `full decode or 4-arg crop + options, got ${c.args.length}`);
    }
    if (path === "fallback") {
      const fullDecodes = calls.filter(c => c.source === blob && c.args.length === 1);
      assert.equal(fullDecodes.length, 2, "albedo and normal each fall back to one full-strip decode");
      assert.ok(calls.some(c => c.source !== blob && c.args.length === 5), "layers are cropped from the decoded bitmap");
    }
    assert.deepEqual(touched, [], "no canvas is created on either decode path");
  });
}

test("readLayerBytes reads layers straight through a scratch WebGL2 context, never a 2D canvas", () => {
  const pixelStore = new Map(), uploaded = [], contexts = [];
  let lost = 0;
  const GL = { UNPACK_FLIP_Y_WEBGL: 1, UNPACK_PREMULTIPLY_ALPHA_WEBGL: 2, UNPACK_COLORSPACE_CONVERSION_WEBGL: 3,
    NONE: 0, TEXTURE_2D: 10, FRAMEBUFFER: 11, COLOR_ATTACHMENT0: 12, FRAMEBUFFER_COMPLETE: 13, RGBA: 14, UNSIGNED_BYTE: 15 };
  const gl = { ...GL,
    pixelStorei(k, v) { pixelStore.set(k, v); },
    createTexture() { return {}; }, createFramebuffer() { return {}; },
    bindTexture() {}, bindFramebuffer() {}, framebufferTexture2D() {},
    checkFramebufferStatus() { return GL.FRAMEBUFFER_COMPLETE; },
    texImage2D(...a) { uploaded.push(a[a.length - 1]); },
    readPixels(x, y, w, h, f, t, dst) { dst.fill(uploaded[uploaded.length - 1].fill); },
    deleteFramebuffer() {}, deleteTexture() {},
    isContextLost() { return false; },
    getExtension(n) { return n === "WEBGL_lose_context" ? { loseContext() { lost++; } } : null; },
  };
  const assets = assetLoader({
    OffscreenCanvas: class { getContext(kind, attrs) { contexts.push({ kind, attrs }); return kind === "webgl2" ? gl : null; } },
  });
  const size = 2, page = size * size * 4, n = 4;
  const data = new Uint8Array(page * n);
  const direct = new Uint8Array(page).fill(7);
  const images = [];
  images[1] = { fill: 41 };            // an ImageBitmap stand-in
  images[2] = direct;                  // already bytes: copied, not uploaded
  images[3] = { fill: 99 };
  const done = assets.readLayerBytes(size, images, n, data);
  assert.deepEqual([...done], [1, 2, 3]);
  assert.equal(contexts.length, 1);
  assert.equal(contexts[0].kind, "webgl2");
  assert.deepEqual({ ...contexts[0].attrs }, { premultipliedAlpha: false, antialias: false });
  assert.equal(pixelStore.get(GL.UNPACK_PREMULTIPLY_ALPHA_WEBGL), false);
  assert.equal(pixelStore.get(GL.UNPACK_COLORSPACE_CONVERSION_WEBGL), GL.NONE);
  assert.equal(pixelStore.get(GL.UNPACK_FLIP_Y_WEBGL), false);
  assert.equal(uploaded.length, 2, "byte layers skip the GPU round trip");
  assert.equal(data[page], 41); assert.equal(data[2 * page], 7); assert.equal(data[3 * page], 99);
  assert.equal(data[0], 0, "an absent layer is left untouched");
  assert.equal(lost, 0, "the scratch context is retained for reuse (not loseContext'd)");
  // Second pack: same Assets instance must not spin up another WebGL2 context.
  const data2 = new Uint8Array(page * n);
  images[1] = { fill: 11 };
  images[3] = { fill: 22 };
  const done2 = assets.readLayerBytes(size, images, n, data2);
  assert.deepEqual([...done2], [1, 2, 3]);
  assert.equal(contexts.length, 1, "one scratch WebGL2 context for the session");
  assert.equal(data2[page], 11); assert.equal(data2[3 * page], 22);
});

test("WGX and TLX take pack bytes from Assets.readLayerBytes, not a 2D-canvas getImageData", () => {
  const wgx = fs.readFileSync(path.join(ROOT, "js/render/webgpu/wgx.js"), "utf8");
  const tlx = fs.readFileSync(path.join(ROOT, "js/render/three/tlx.js"), "utf8");
  const fnBody = (src, sig) => {
    const at = src.indexOf(sig);
    assert.ok(at >= 0, `missing ${sig}`);
    return src.slice(at, src.indexOf("\n    }\n", at));
  };
  const wgxBytes = fnBody(wgx, "function _matLayerBytes(");
  assert.match(wgxBytes, /Assets\.readLayerBytes\(/);
  assert.doesNotMatch(wgxBytes, /getImageData|getContext\("2d"/, "WGX layer bytes must not round-trip a premultiplied canvas");
  assert.match(wgx, /premultipliedAlpha: false \}/, "the no-WebGL2 copyExternalImageToTexture keeps straight alpha");
  assert.match(tlx, /Assets\.readLayerBytes\(size, images, n, data\)/);
});

test("unload invalidates an in-flight pack upload and frees its partial texture", async () => {
  let releaseNormal, normalStarted;
  const normalGate = new Promise(resolve => { releaseNormal = resolve; });
  const started = new Promise(resolve => { normalStarted = resolve; });
  const bitmaps = [];
  let decodes = 0, uploads = 0;
  const maps = [], freed = [];
  const assets = assetLoader({
    async fetch(url) {
      return url.endsWith("manifest.json")
        ? { ok: true, json: async () => ({ materials: {
            size: 4, albedo: "a.png", normal: "n.png", layers: [{ mat: 1, scale: 1 }]
          } }) }
        : { ok: true, blob: async () => ({ size: 16 }) };
    },
    async createImageBitmap() {
      const b = { closed: 0, close() { this.closed++; } };
      bitmaps.push(b);
      if (++decodes === 2) { normalStarted(); await normalGate; }
      return b;
    },
  });
  assets.init({
    createTextureArray() { return { id: ++uploads }; },
    freeTexture(t) { freed.push(t.id); },
    setMaterialMaps(v) { maps.push(v ? "maps" : "null"); },
  });

  const pending = assets.load({ tier: "high" });
  await started;                              // albedo uploaded; normal still decoding
  assets.unload();
  releaseNormal();

  assert.equal(await pending, false, "the invalidated generation cannot report live");
  assert.equal(assets.state().uploaded, false);
  assert.equal(assets.state().tier, "off");
  assert.deepEqual(maps, ["null"], "the stale generation must not reinstall maps after unload");
  assert.deepEqual(freed, [1], "the partial albedo upload is released exactly once");
  assert.deepEqual(bitmaps.map(b => b.closed), [1, 1], "both decoded strips are closed exactly once");
});

test("adopt owns the latest generation when an older pack decode finishes later", async () => {
  let releaseDecode, decodeStarted;
  const decodeGate = new Promise(resolve => { releaseDecode = resolve; });
  const started = new Promise(resolve => { decodeStarted = resolve; });
  const installed = [];
  let uploads = 0;
  const assets = assetLoader({
    async fetch(url) {
      return url.endsWith("manifest.json")
        ? { ok: true, json: async () => ({ materials: {
            size: 4, albedo: "a.png", layers: [{ mat: 1, scale: 1 }]
          } }) }
        : { ok: true, blob: async () => ({ size: 16 }) };
    },
    async createImageBitmap() {
      decodeStarted();
      await decodeGate;
      return { close() {} };
    },
  });
  assets.init({
    createTextureArray() { return { id: ++uploads }; },
    freeTexture() {},
    setMaterialMaps(v) { installed.push(v && v.albedo.id); },
  });

  const pending = assets.load({ tier: "high" });
  await started;
  const adopted = assets.adopt(4, [{}], null, []);
  assert.equal(adopted.tier, "browser-bake");
  releaseDecode();

  assert.equal(await pending, false);
  assert.equal(assets.state().tier, "browser-bake");
  assert.deepEqual(installed, [1], "the late pack load cannot replace the adopted maps");
  assert.equal(uploads, 1, "a stale decode is rejected before it allocates a texture");
});

// TrackGeom.MAT, read out of the REAL module rather than a copy. geom.js is
// documented as loading under a bare VM sandbox (it is stateless and
// renderer-free), so this is the actual shipping table, not a transcription.
function realMAT() {
  const vm = require("node:vm");
  const src = fs.readFileSync(path.join(ROOT, "js", "track", "core", "geom.js"), "utf8");
  const sandbox = { Math, Array, Float32Array, Object, JSON, console };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  seedLog(sandbox);
  // Top-level `const` is block-scoped inside a VM and never lands on the
  // sandbox — the same rewrite tools/track/verify-track.cjs uses.
  vm.runInContext(src.replace(/^const\b/gm, "var"), sandbox, { filename: "geom.js" });
  const G = sandbox.TrackGeom;
  assert.ok(G && G.MAT, "TrackGeom.MAT not reachable from the VM sandbox");
  // Copy into a THIS-realm object: a VM object carries the sandbox's
  // Object.prototype, which deepStrictEqual treats as a mismatch even when
  // every key and value is identical.
  return { ...G.MAT };
}

test("bake tool's MAT table matches TrackGeom.MAT exactly", () => {
  const real = realMAT();
  // The tool declares its own copy because it must run without the game's
  // load order; this is the assertion that keeps the copy honest.
  const block = TOOL_SRC.match(/const MAT = \{([\s\S]*?)\};/);
  assert.ok(block, "could not find the MAT table in tools/gen/assets.mjs");
  const tool = {};
  for (const m of block[1].matchAll(/(\w+):\s*(\d+)/g)) tool[m[1]] = Number(m[2]);
  assert.deepEqual(tool, real, "tools/gen/assets.mjs MAT has drifted from js/track/core/geom.js");
});

test("GLASS and FLAG are never given a baked layer", () => {
  const real = realMAT();
  const block = TOOL_SRC.match(/const SCALES = \{([\s\S]*?)\};/);
  assert.ok(block, "could not find the SCALES table in tools/gen/assets.mjs");
  const ids = [...block[1].matchAll(/MAT\.(\w+)\]/g)].map((m) => m[1]);
  // GLASS: a baked albedo would blur the mirror reflection read.
  // FLAG: geometry is displaced in the vertex shader off fract(aMat).
  // FLAT: the "no material" id by definition.
  for (const forbidden of ["GLASS", "FLAG", "FLAT"])
    assert.ok(!ids.includes(forbidden), `MAT.${forbidden} must not have a baked layer`);
  assert.ok(ids.includes("ASPHALT"), "ASPHALT must have a baked layer — it is the surface on screen all race");
  assert.ok(ids.length >= 10, `expected >= 10 baked materials, got ${ids.length}`);
  assert.ok(real.ASPHALT === 16, "ASPHALT must stay above the FLAG 15.0..16.0 fractional window");
});

test("the shader's layer count matches the MAT table size", () => {
  const lit = fs.readFileSync(path.join(ROOT, "js", "render", "glx", "shaders", "glsl-lit.js"), "utf8");
  assert.match(lit, /uniform float uMatTexScale\[17\];/,
    "lit.js uMatTexScale must be sized for all 17 MAT ids (FLAT..ASPHALT)");
  const glx = fs.readFileSync(path.join(ROOT, "js", "render", "glx", "glx.js"), "utf8");
  assert.match(glx, /MAT_TEX_LAYERS = 17/, "glx.js MAT_TEX_LAYERS must be 17");
  const assets = fs.readFileSync(path.join(ROOT, "js", "render", "shared", "assets.js"), "utf8");
  assert.match(assets, /MAT_LAYERS = 17/, "assets.js MAT_LAYERS must be 17");
  const tlx = fs.readFileSync(path.join(ROOT, "js/render/three/tsl-lit.js"), "utf8");
  assert.match(tlx, /U\.matTexScale = uniformArray\(Array\(17\)\.fill\(0\)\)/, "TLX material uniforms must cover all MAT ids");
  assert.match(tlx, /for \(let i = 0; i < 17; i\+\+\)/, "TLX must upload all material scales");
  const wgx = fs.readFileSync(path.join(ROOT, "js/render/webgpu/wgx.js"), "utf8");
  assert.match(wgx, /MAT_TEX_LAYERS = 17/, "WGX material resources must cover all MAT ids");
  assert.match(wgx, /size: \[1, 1, MAT_TEX_LAYERS\]/, "WGX fallback arrays must have the full material depth");
});

test("shader sources parse as JS (no stray backticks in GLSL comments)", () => {
  // The GLSL lives inside JS template literals, so a backtick anywhere in a
  // shader comment silently terminates the string. The failure mode is brutal
  // and completely non-obvious: the program fails to link, GLX.init() returns
  // false, the page shows "needs WebGL2", and every browser test dies on
  // `waitForFunction(() => !!window.__apex)` with a bare 30 s timeout that says
  // nothing about shaders. One cheap parse catches it in milliseconds.
  const cp = require("node:child_process");
  for (const f of ["js/render/glx/shaders/glsl-lit.js", "js/render/glx/shaders/glsl-chunks.js",
                   "js/render/glx/shaders/glsl-sky.js", "js/render/glx/shaders/glsl-fx.js",
                   "js/render/glx/shaders/glsl-post.js"]) {
    const r = cp.spawnSync(process.execPath, ["--check", path.join(ROOT, f)], { encoding: "utf8" });
    assert.equal(r.status, 0, `${f} does not parse as JS:\n${r.stderr}`);
  }
});

test("the baked-material knob is wired, and ON so the pack can contribute", () => {
  // Default is non-zero so a loaded pack actually reaches the shader. Safety
  // (no pack / bad pack / no createTextureArray → procedural look) lives in
  // js/render/shared/assets.js, not in the knob staying at 0.
  const lighting = fs.readFileSync(path.join(ROOT, "js", "lighting", "knobs.js"), "utf8");
  const def = lighting.match(/\{ id: "matTexMix",[^}]*\}/);
  assert.ok(def, "matTexMix must exist in TUNE_DEFS");
  assert.match(def[0], /u: "uMatTexMix"/, "matTexMix must be wired to the uMatTexMix uniform");
  const d = def[0].match(/def:\s*([\d.]+)/);
  assert.ok(d, "matTexMix must declare a default");
  const v = parseFloat(d[1]);
  assert.ok(v > 0 && v <= 1, `matTexMix default ${v} must be in (0, 1]`);
  assert.match(def[0], /min: 0,/, "0 must stay reachable — it is the revert path if tarmac crawls");
});

test("bake-synthetic produces a dual-tier Apex26-Procedural pack with no network", () => {
  // The no-download rebuild path. Must write BOTH tiers, stamp every layer
  // Apex26-Procedural, and leave models/env alone — otherwise a synthetic
  // rebake would orphan committed Kenney bins and HDRI ambients.
  const os = require("node:os"), cp = require("node:child_process");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apex-synth-"));
  try {
    // Seed a fake prior pack so we can prove models/env survive the rewrite.
    fs.mkdirSync(path.join(dir, "models"), { recursive: true });
    fs.writeFileSync(path.join(dir, "models", "keep.bin"), Buffer.from("AX26"));
    fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({
      version: 1,
      materials: null,
      models: { keep: { file: "models/keep.bin", licence: "CC0", author: "t", source: "t" } },
      env: { "*|day": { ambientSky: [0.3, 0.3, 0.4], ambientGround: [0.1, 0.1, 0.1],
                        licence: "CC0", author: "t", source: "t" } },
      credits: [],
    }));
    const r = cp.spawnSync(process.execPath,
      [path.join(ROOT, "tools", "gen", "assets.mjs"), "bake-synthetic"],
      { env: { ...process.env, APEX_PACK_DIR: dir }, encoding: "utf8" });
    assert.equal(r.status, 0, `bake-synthetic failed:\n${r.stdout}\n${r.stderr}`);
    const m = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
    assert.equal(m.materials.size, 256);
    assert.ok(m.materials.low && m.materials.low.size === 128, "default bake must include low 128");
    assert.ok(fs.existsSync(path.join(dir, m.materials.albedo)));
    assert.ok(fs.existsSync(path.join(dir, m.materials.low.albedo)));
    assert.ok(m.materials.layers.length >= 10, "expected the SCALES table layers");
    for (const L of m.materials.layers) {
      assert.equal(L.licence, "Apex26-Procedural", `${L.id} must be procedural`);
      assert.match(L.source, /^procedural:/);
    }
    assert.ok(m.models.keep, "bake-synthetic must preserve models");
    assert.ok(m.env["*|day"], "bake-synthetic must preserve env");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("pack manifest is well-formed", { skip: !hasPack && "no pack installed" }, () => {
  assert.equal(manifest.version, 1);
  const mats = manifest.materials;
  assert.ok(mats, "manifest has no materials block");
  assert.ok(mats.size >= 8 && (mats.size & (mats.size - 1)) === 0,
    `material size ${mats.size} must be a power of two >= 8`);
  assert.ok(mats.albedo, "materials.albedo is required");

  const seen = new Set();
  for (const L of mats.layers) {
    assert.ok(L.mat >= 1 && L.mat <= 16, `layer ${L.id}: mat ${L.mat} outside 1..16`);
    assert.ok(!seen.has(L.mat), `layer ${L.id}: duplicate mat id ${L.mat}`);
    seen.add(L.mat);
    assert.ok(L.scale > 0, `layer ${L.id}: scale must be > 0`);
    assert.ok(ALLOWED.has(L.licence), `layer ${L.id}: licence "${L.licence}" not allow-listed`);
    assert.ok(L.source, `layer ${L.id}: every asset must record a source`);
  }
});

test("the pack carries a mobile LOW variant", { skip: !hasPack && "no pack installed" }, () => {
  // js/render/shared/assets.js picks materials.low on a phone and SILENTLY falls back
  // to the full-size strips when it is absent — no error, no warning, mobile
  // just quietly pays the desktop cost. That failure is invisible from the
  // desktop the pack was baked on, so it needs a test rather than a comment.
  const mats = manifest.materials;
  assert.ok(mats.low, "materials.low missing — mobile would load the full-size pack");
  assert.ok(mats.low.size < mats.size,
    `low size ${mats.low.size} must be smaller than ${mats.size}`);
  assert.ok(mats.low.albedo && mats.low.albedo !== mats.albedo, "low.albedo must be its own file");
  assert.deepEqual(
    (mats.low.layers || []).map((l) => l.mat).sort((a, b) => a - b),
    mats.layers.map((l) => l.mat).sort((a, b) => a - b),
    "low variant must cover the same MAT slots as the full one");
  const big = fs.statSync(path.join(PACK, mats.albedo)).size;
  const small = fs.statSync(path.join(PACK, mats.low.albedo)).size;
  assert.ok(small < big, `low albedo (${small}) should be smaller than full (${big})`);
});

test("every referenced file exists and the strip is the right height",
  { skip: !hasPack && "no pack installed" }, () => {
  const mats = manifest.materials;
  for (const f of [mats.albedo, mats.normal,
                   mats.low && mats.low.albedo, mats.low && mats.low.normal].filter(Boolean)) {
    const p = path.join(PACK, f);
    assert.ok(fs.existsSync(p), `missing ${f}`);
    // PNG signature + IHDR width/height, so a truncated or wrong-shaped
    // filmstrip fails here rather than as a silently-black layer in game.
    const b = fs.readFileSync(p);
    assert.deepEqual([...b.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47], `${f} is not a PNG`);
    const w = b.readUInt32BE(16), h = b.readUInt32BE(20);
    // Each variant declares its own size; a strip must be square-per-layer and
    // exactly 17 layers tall whichever tier it belongs to.
    const expect = (mats.low && (f === mats.low.albedo || f === mats.low.normal)) ? mats.low.size : mats.size;
    assert.equal(w, expect, `${f} width ${w} != declared size ${expect}`);
    assert.equal(h, expect * 17,
      `${f} height ${h} != size*17 (${expect * 17}) — the filmstrip must have one slot per MAT id`);
  }
  for (const [id, rec] of Object.entries(manifest.models || {}))
    assert.ok(fs.existsSync(path.join(PACK, rec.file)), `model ${id}: missing ${rec.file}`);
});

test("pack stays inside the clone-time budget", { skip: !hasPack && "no pack installed" }, () => {
  let bytes = 0;
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      // `src/` is the author-time fetch cache (gitignored) — verify() already
      // ignores it; counting it here would fail every local bake-material run.
      if (e.name === "src") continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p); else bytes += fs.statSync(p).size;
    }
  };
  walk(PACK);
  assert.ok(bytes <= BUDGET_BYTES,
    `pack is ${(bytes / 1048576).toFixed(2)} MB, budget is ${(BUDGET_BYTES / 1048576).toFixed(0)} MB`);
});

test("bake-synthetic-models replaces Kenney bins with Apex26-Procedural AX26", () => {
  const os = require("node:os"), cp = require("node:child_process");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apex-synth-mdl-"));
  try {
    fs.mkdirSync(path.join(dir, "models"), { recursive: true });
    // Seed a fake Kenney bin that must be overwritten / removed if not in catalog.
    fs.writeFileSync(path.join(dir, "models", "kenney_construction-cone.bin"), Buffer.from("OLD"));
    fs.writeFileSync(path.join(dir, "models", "orphan_old.bin"), Buffer.from("ORPHAN"));
    fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({
      version: 1, materials: null,
      models: {
        "kenney_construction-cone": {
          file: "models/kenney_construction-cone.bin", licence: "CC0",
          author: "Kenney", source: "kenney:x",
        },
        orphan_old: { file: "models/orphan_old.bin", licence: "CC0", author: "x", source: "x" },
      },
      env: {}, credits: [],
    }));
    const r = cp.spawnSync(process.execPath,
      [path.join(ROOT, "tools", "gen", "assets.mjs"), "bake-synthetic-models"],
      { env: { ...process.env, APEX_PACK_DIR: dir }, encoding: "utf8" });
    assert.equal(r.status, 0, `bake-synthetic-models failed:\n${r.stdout}\n${r.stderr}`);
    const m = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
    assert.ok(!m.models.orphan_old, "non-catalog models must be dropped");
    const cone = m.models["kenney_construction-cone"];
    assert.ok(cone, "catalog id must be present");
    assert.equal(cone.licence, "Apex26-Procedural");
    assert.match(cone.source, /^procedural:/);
    assert.ok(cone.verts >= 8, "cone must have geometry");
    const bin = fs.readFileSync(path.join(dir, cone.file));
    assert.equal(bin.toString("ascii", 0, 4), "AX26");
    assert.ok(!fs.existsSync(path.join(dir, "models", "orphan_old.bin")));
    // Spot-check a building id circuits actually place.
    assert.ok(m.models["kenney_ind_building-a"].verts > 50);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("bake-model round-trips glTF into the game's own vertex format", async () => {
  // Exercises the whole model path — the real js/render/shared/gltf.js reader in a VM,
  // the MAT stamping, the AX26 writer — against a hand-built single-triangle
  // .glb. Without this the bake-model command is untested code that would only
  // fail the first time somebody reached for it.
  const os = require("node:os");
  const cp = require("node:child_process");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apex-pack-"));
  try {
    const pos = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const nrm = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]);
    const idx = new Uint16Array([0, 1, 2, 0]);           // padded to 4-byte alignment
    const bin = Buffer.concat([Buffer.from(pos.buffer), Buffer.from(nrm.buffer), Buffer.from(idx.buffer)]);
    const json = {
      asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 }] }],
      materials: [{ pbrMetallicRoughness: { baseColorFactor: [0.8, 0.3, 0.2, 1] } }],
      accessors: [
        { bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [1, 1, 0] },
        { bufferView: 1, componentType: 5126, count: 3, type: "VEC3" },
        { bufferView: 2, componentType: 5123, count: 3, type: "SCALAR" },
      ],
      bufferViews: [
        { buffer: 0, byteOffset: 0, byteLength: 36 },
        { buffer: 0, byteOffset: 36, byteLength: 36 },
        { buffer: 0, byteOffset: 72, byteLength: 6 },
      ],
      buffers: [{ byteLength: bin.length }],
    };
    let jb = Buffer.from(JSON.stringify(json), "utf8");
    while (jb.length % 4) jb = Buffer.concat([jb, Buffer.from(" ")]);
    const chunk = (type, data) => {
      const h = Buffer.alloc(8);
      h.writeUInt32LE(data.length, 0); h.writeUInt32LE(type, 4);
      return Buffer.concat([h, data]);
    };
    const jc = chunk(0x4e4f534a, jb), bc = chunk(0x004e4942, bin);
    const head = Buffer.alloc(12);
    head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4);
    head.writeUInt32LE(12 + jc.length + bc.length, 8);
    const glb = path.join(dir, "tri.glb");
    fs.writeFileSync(glb, Buffer.concat([head, jc, bc]));

    const r = cp.spawnSync(process.execPath,
      [path.join(ROOT, "tools", "gen", "assets.mjs"), "bake-model", "tri", glb, "--mat", "CONCRETE"],
      { env: { ...process.env, APEX_PACK_DIR: dir }, encoding: "utf8" });
    assert.equal(r.status, 0, `bake-model failed: ${r.stderr || r.stdout}`);

    // Read it with the GAME'S reader, not a copy of it — see tests/helpers/ax26.mjs.
    const binPath = path.join(dir, "models", "tri.bin");
    const hdr = ax26Version(binPath);
    assert.equal(hdr.version, 2, "a mesh this simple must take the packed layout");
    assert.equal(hdr.verts, 3); assert.equal(hdr.indices, 3);
    const got = await readAX26(binPath);
    assert.ok(got, "the shipped reader must accept what the writer produced");
    const outPos = got.pos, outCol = got.col, outMat = got.mat, outIdx = got.idx;
    assert.deepEqual([...outPos], [0, 0, 0, 1, 0, 0, 0, 1, 0]);
    assert.deepEqual([...outIdx], [0, 1, 2]);
    // Every vertex carries the MAT id the author asked for — that is what makes
    // the baked material array reach imported geometry at all.
    assert.deepEqual([...outMat], [1, 1, 1], "MAT.CONCRETE stamped per vertex");
    // glTF baseColorFactor became vertex colour, since the lit path has no UVs.
    assert.ok(Math.abs(outCol[0] - 0.8) < 0.01 && Math.abs(outCol[1] - 0.3) < 0.01,
      `baseColorFactor lost: got ${[...outCol].slice(0, 3)}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("bake-atlas slices a 4x4 sheet onto the named MAT layer", () => {
  const os = require("node:os");
  const cp = require("node:child_process");
  const zlib = require("node:zlib");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apex-atlas-"));
  try {
    const grid = 4, tile = 8, size = grid * tile;
    const rgba = Buffer.alloc(size * size * 4, 255);
    // Unique mid-grey-ish colour per cell so mean-normalise keeps the hue.
    for (let row = 0; row < grid; row++) {
      for (let col = 0; col < grid; col++) {
        const r = 80 + col * 24, g = 80 + row * 24, b = 140;
        for (let y = 0; y < tile; y++) {
          for (let x = 0; x < tile; x++) {
            const o = ((row * tile + y) * size + col * tile + x) * 4;
            rgba[o] = r; rgba[o + 1] = g; rgba[o + 2] = b; rgba[o + 3] = 255;
          }
        }
      }
    }
    const crcTable = (() => {
      const t = new Int32Array(256);
      for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        t[n] = c;
      }
      return t;
    })();
    const crc32 = (buf) => {
      let c = -1;
      for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
      return (c ^ -1) >>> 0;
    };
    const chunk = (type, data) => {
      const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
      const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
      const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0);
      return Buffer.concat([len, body, crc]);
    };
    const raw = Buffer.alloc((size * 4 + 1) * size);
    for (let y = 0; y < size; y++) {
      raw[y * (size * 4 + 1)] = 0;
      rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
    ihdr[8] = 8; ihdr[9] = 6;
    const atlas = path.join(dir, "atlas.png");
    fs.writeFileSync(atlas, Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", ihdr),
      chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
      chunk("IEND", Buffer.alloc(0)),
    ]));

    const r = cp.spawnSync(process.execPath, [
      path.join(ROOT, "tools", "gen", "assets.mjs"), "bake-atlas",
      "--albedo", atlas, "--grid", "4", "--inset", "0",
      "--size", "8", "--low", "0", "--map", "BRICK=1,0",
    ], { env: { ...process.env, APEX_PACK_DIR: dir }, encoding: "utf8" });
    assert.equal(r.status, 0, `bake-atlas failed:\n${r.stdout}\n${r.stderr}`);

    const png = fs.readFileSync(path.join(dir, "mat-albedo-8.png"));
    assert.deepEqual([...png.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47]);
    const w = png.readUInt32BE(16), h = png.readUInt32BE(20);
    assert.equal(w, 8);
    assert.equal(h, 8 * 17);
    const man = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
    const brick = man.materials.layers.find((L) => L.id === "brick");
    assert.ok(brick, "BRICK layer missing from manifest");
    assert.equal(brick.mat, 2);
    assert.equal(brick.licence, "Apex26-Procedural");
    assert.match(brick.source, /generated:.*#1,0/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("TrackGeom.addMesh transforms a baked model correctly", () => {
  // The placement maths for baked props. Getting the yaw sign or the normal
  // rotation wrong produces geometry that is *present and finite* — so
  // verify-track passes and nothing complains — while every model faces the
  // wrong way. Pin it with an exact 90 degree case.
  const vm = require("node:vm");
  const sandbox = { Math, Array, Float32Array, Object, JSON, console };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  seedLog(sandbox);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js", "track", "core", "geom.js"), "utf8")
    .replace(/^const\b/gm, "var"), sandbox, { filename: "geom.js" });
  const G = sandbox.TrackGeom;
  assert.equal(typeof G.addMesh, "function");

  const mesh = {
    pos: [1, 0, 0, 0, 0, 1, 0, 2, 0],
    nrm: [1, 0, 0, 0, 0, 1, 0, 1, 0],
    col: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
    mat: [16, 16, 16],
    idx: [0, 1, 2],
  };
  const out = { pos: [], nrm: [], col: [], mat: [], idx: [], _mat: 0 };
  // Seed one existing vertex so the index rebase is actually exercised.
  out.pos.push(0, 0, 0); out.nrm.push(0, 1, 0); out.col.push(1, 1, 1); out.mat.push(0);

  assert.equal(G.addMesh(out, mesh, { x: 10, y: 5, z: -2, rotY: Math.PI / 2, scale: 2 }), true);
  // rotY = +90 deg maps local +X to world -Z (x*cos + z*sin, -x*sin + z*cos).
  const p0 = out.pos.slice(3, 6);
  assert.ok(Math.abs(p0[0] - 10) < 1e-6, `x: ${p0[0]}`);
  assert.ok(Math.abs(p0[1] - 5) < 1e-6, `y: ${p0[1]}`);
  assert.ok(Math.abs(p0[2] - (-4)) < 1e-6, `z: ${p0[2]} (local +X*2 should land at -2 relative)`);
  // Normals rotate but must NOT pick up the scale or the translation.
  const n0 = out.nrm.slice(3, 6);
  assert.ok(Math.abs(Math.hypot(n0[0], n0[1], n0[2]) - 1) < 1e-6, "normal must stay unit length");
  // Indices rebased past the pre-existing vertex.
  assert.deepEqual(out.idx, [1, 2, 3]);
  // Baked per-vertex MAT ids survive.
  assert.deepEqual(out.mat.slice(1), [16, 16, 16]);

  // opts.mat overrides the baked ids; opts.tint multiplies the baked colour.
  const out2 = { pos: [], nrm: [], col: [], mat: [], idx: [], _mat: 0 };
  G.addMesh(out2, mesh, { mat: 1, tint: [2, 1, 0] });
  assert.deepEqual(out2.mat, [1, 1, 1]);
  assert.deepEqual(out2.col.slice(0, 3), [1, 0.5, 0]);

  // Junk in, nothing out — never a partially-written accumulator.
  const out3 = { pos: [], nrm: [], col: [], mat: [], idx: [], _mat: 0 };
  assert.equal(G.addMesh(out3, mesh, { x: NaN }), false);
  assert.equal(G.addMesh(out3, null, {}), false);
  assert.equal(out3.pos.length, 0, "a rejected placement must emit no vertices");
});

test("webbake toGLB re-packs .gltf + .bin into something gltf.js accepts", () => {
  // The browser baker's one genuinely novel piece. js/render/shared/gltf.js is GLB-only
  // and refuses external .bin URIs, while Poly Haven ships .gltf with a sidecar
  // .bin — so toGLB() bridges them. A bug here surfaces at runtime as an opaque
  // "malformed GLB", far from its cause, so it is pinned by round-tripping a
  // real pair through the game's OWN loader.
  const vm = require("node:vm");
  const load = (rel, sandbox) => {
    const src = fs.readFileSync(path.join(ROOT, rel), "utf8").replace(/^const\b/gm, "var");
    vm.runInContext(src, sandbox, { filename: rel });
  };
  const sandbox = {
    Math, Array, Object, JSON, Uint8Array, Uint16Array, Uint32Array, Int16Array,
    Float32Array, DataView, ArrayBuffer, TextEncoder, TextDecoder, Promise, Error, console,
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  seedLog(sandbox);
  load("js/render/shared/gltf.js", sandbox);
  load("assets/pack/webbake.js", sandbox);
  assert.equal(typeof sandbox.WebBake.toGLB, "function");

  // A .gltf + sidecar .bin in Poly Haven's shape: external buffer uri, a
  // texture reference that cannot survive, and a baseColorFactor that must.
  const pos = new Float32Array([0, 0, 0, 2, 0, 0, 0, 3, 0]);
  const idx = new Uint16Array([0, 1, 2, 0]);            // padded to 4 bytes
  const bin = Buffer.concat([Buffer.from(pos.buffer), Buffer.from(idx.buffer)]);
  const gltf = {
    asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }],
    images: [{ uri: "textures/diff.jpg" }],
    textures: [{ source: 0 }],
    materials: [{ pbrMetallicRoughness: {
      baseColorFactor: [0.25, 0.5, 0.75, 1], baseColorTexture: { index: 0 } } }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [2, 3, 0] },
      { bufferView: 1, componentType: 5123, count: 3, type: "SCALAR" },
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 36 },
      { buffer: 0, byteOffset: 36, byteLength: 6 },
    ],
    buffers: [{ uri: "model.bin", byteLength: bin.length }],
  };

  const glb = sandbox.WebBake.toGLB(gltf, bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength));
  const dv = new DataView(glb);
  assert.equal(dv.getUint32(0, true), 0x46546c67, "GLB magic");
  assert.equal(dv.getUint32(4, true), 2, "GLB version");
  assert.equal(dv.getUint32(8, true), glb.byteLength, "declared length matches actual");
  assert.equal(glb.byteLength % 4, 0, "GLB must stay 4-byte aligned");

  // The real proof: the game's own loader accepts it and produces usable geometry.
  const mesh = sandbox.GLTF.toMesh(glb, { scale: 1 });
  assert.equal(mesh.pos.length / 3, 3, "three vertices survived");
  assert.deepEqual([...mesh.idx], [0, 1, 2]);
  assert.deepEqual([...mesh.pos].slice(0, 6), [0, 0, 0, 2, 0, 0]);
  // baseColorFactor must survive the texture strip — it is all the colour an
  // imported model has once its textures are dropped.
  assert.ok(Math.abs(mesh.col[0] - 0.25) < 0.01 && Math.abs(mesh.col[1] - 0.5) < 0.01,
    `baseColorFactor lost: ${[...mesh.col].slice(0, 3)}`);
});

test("webbake writes a ZIP that real unzip accepts", () => {
  // The browser baker hands its output back as a single archive, written by a
  // ~40-line STORE-method ZIP encoder with no library behind it. A wrong CRC or
  // a bad central-directory offset produces a file that *looks* fine and fails
  // only when someone tries to open it — so this checks it against the system
  // unzip rather than against my own reader.
  const os = require("node:os"), cp = require("node:child_process"), vm = require("node:vm");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apex-zip-"));
  try {
    const sandbox = {
      Math, Array, Object, JSON, Uint8Array, Uint16Array, Uint32Array, Int32Array,
      Float32Array, DataView, ArrayBuffer, TextEncoder, TextDecoder, Promise, Error, console, Blob,
    };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    seedLog(sandbox);
    vm.runInContext(fs.readFileSync(path.join(ROOT, "assets", "pack", "webbake.js"), "utf8")
      .replace(/^const\b/gm, "var"), sandbox, { filename: "webbake.js" });

    const enc = new TextEncoder();
    const payload = '{"version":1,"materials":{"size":512}}\n';
    const blob = sandbox.WebBake.zip([
      { name: "manifest.json", data: enc.encode(payload) },
      { name: "CREDITS.md", data: enc.encode("# Asset credits\n\nPowered by Poly Haven.\n") },
      { name: "mat-albedo-512.png", data: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, 1, 2, 3]) },
    ]);
    const zipPath = path.join(dir, "pack.zip");
    return blob.arrayBuffer().then((ab) => {
      fs.writeFileSync(zipPath, Buffer.from(ab));
      const t = cp.spawnSync("unzip", ["-t", zipPath], { encoding: "utf8" });
      if (t.error && t.error.code === "ENOENT") return;          // no unzip on this box
      assert.equal(t.status, 0, `unzip -t rejected the archive:\n${t.stdout}${t.stderr}`);
      const got = cp.spawnSync("unzip", ["-p", zipPath, "manifest.json"], { encoding: "utf8" });
      assert.equal(got.status, 0, "could not extract manifest.json");
      assert.equal(got.stdout, payload, "extracted content does not match what went in");
    });
  } finally {
    // rmSync is safe to schedule now: the promise above only reads from `dir`
    // via a spawned process that has already exited by the time it resolves.
    process.on("exit", () => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_) {} });
  }
});

test("credits cover every asset in the pack", { skip: !hasPack && "no pack installed" }, () => {
  const credits = manifest.credits || [];
  const ids = new Set(credits.map((c) => `${c.kind}:${c.id}`));
  for (const L of manifest.materials.layers)
    assert.ok(ids.has(`material:${L.id}`), `no credit entry for material ${L.id}`);
  for (const id of Object.keys(manifest.models || {}))
    assert.ok(ids.has(`model:${id}`), `no credit entry for model ${id}`);
  for (const c of credits) {
    assert.ok(ALLOWED.has(c.licence), `credit ${c.id}: licence "${c.licence}" not allow-listed`);
    assert.ok(c.source, `credit ${c.id}: no source recorded`);
  }
  assert.ok(fs.existsSync(path.join(PACK, "CREDITS.md")),
    "assets/pack/CREDITS.md missing — run `node tools/gen/assets.mjs credits`");
});

// WHAT THE GAME TELLS THE PLAYER ABOUT PROVENANCE MUST MATCH THE MANIFEST.
//
// The BAKED MATERIALS slider help in js/lighting/knobs.js described the shipped
// pack as "real CC0 photoscans" while all 14 committed layers record
// `procedural:tools/gen/assets.mjs` / `Apex26-Procedural`. Nothing connected the
// two, so the string outlived the pack it described: assets/pack/webbake.js CAN
// composite Poly Haven CC0 scans, but it is a manual browser tool whose output
// has to be hand-imported (`assets.mjs import-pack`), and it was never run for
// the committed pack.
//
// That is a claim about ORIGIN and REUSE RIGHTS shown to players, so it gets a
// guard rather than a promise to remember. The rule is one-directional: the UI
// may not assert third-party/scan provenance while every shipped layer is the
// project's own procedural output. Re-bake with real scans and the manifest
// licences change to CC0 first — then the string is free to say so.
test("the UI never claims a provenance the pack contradicts", { skip: !hasPack && "no pack installed" }, () => {
  const help = fs.readFileSync(path.join(ROOT, "js", "lighting", "knobs.js"), "utf8");
  const matTex = help.split("\n").find((l) => l.includes('id: "matTexMix"')) || "";
  assert.ok(matTex, "the BAKED MATERIALS slider disappeared — update this guard");

  const licences = new Set(manifest.materials.layers.map((L) => L.licence));
  const allProcedural = [...licences].every((l) => l === "Apex26-Procedural");
  if (allProcedural) {
    assert.doesNotMatch(matTex, /photoscan|CC0/i,
      "every shipped material layer is Apex26-Procedural, so the BAKED MATERIALS help " +
      "must not describe the pack as a CC0 photoscan. Re-bake first (assets/pack/webbake.js " +
      "+ `assets.mjs import-pack`), which rewrites the manifest licences, and this guard relaxes.");
  }
});

// ── modelsReady: the build waits for the pack, bounded ─────────────────────────
// Prop placement is synchronous (bakedModel reads modelSync), so a build that
// ran before loadModels() settled kept the box fallback for the whole session
// (the second graphics-detail survey, 2026-10-01). ensureScenery now awaits
// Assets.modelsReady(): the same prefetch run, capped so an offline boot still
// builds, and never a rejection.
const MODEL_V2 = () => {
  // One-vertex, one-index v2 record: enough for _parseModel to accept it.
  const nv = 3, ni = 3, buf = new ArrayBuffer(20 + nv * 12 + nv * 6 + nv * 3 + nv + ni * 2);
  const dv = new DataView(buf);
  [0x41, 0x58, 0x32, 0x36].forEach((b, i) => dv.setUint8(i, b));
  dv.setUint32(4, 2, true); dv.setUint32(8, nv, true); dv.setUint32(12, ni, true);
  return buf;
};
const packFetch = (gate) => async (url) => {
  if (/manifest\.json$/.test(url)) return { ok: true, json: async () => ({ models: { box: { file: "models/box.ax26" } } }) };
  if (gate) await gate;
  return { ok: true, arrayBuffer: async () => MODEL_V2() };
};

test("modelsReady resolves once the prefetched models are resident, and loadModels is one run", async () => {
  let release; const gate = new Promise((r) => { release = r; });
  let fetches = 0;
  const assets = assetLoader({ setTimeout, clearTimeout, fetch: (u) => { fetches++; return packFetch(gate)(u); } });
  const boot = assets.loadModels();
  assert.equal(assets.loadModels(), boot, "a second loadModels joins the boot run");
  let settled = false;
  const ready = assets.modelsReady(60000).then((n) => { settled = true; return n; });
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(settled, false, "modelsReady must not resolve while the model fetch is in flight");
  assert.equal(assets.modelSync("box"), null);
  release();
  assert.equal(await ready, 1, "resolves to the resident count once the fetch lands");
  assert.ok(assets.modelSync("box"), "the model is resident when the build runs");
  assert.equal(fetches, 2, "manifest + one model, shared by loadModels and modelsReady");
});

test("modelsReady gives up at its cap when the pack hangs, and never rejects on a failing pack", async () => {
  const hung = assetLoader({ setTimeout, clearTimeout, fetch: packFetch(new Promise(() => {})) });
  assert.equal(await hung.modelsReady(20), -1, "a hanging model fetch resolves -1 at the cap");
  const broken = assetLoader({ setTimeout, clearTimeout, async fetch() { throw Error("offline"); } });
  assert.equal(await broken.modelsReady(1000), 0, "a failing manifest resolves 0 at once, not a rejection");
});

test("ensureScenery awaits THIS circuit's models (Assets.modelsReady with the closure source) before any build", { timeout: 5000 }, async () => {
  const src = fs.readFileSync(path.join(ROOT, "js/core/lazy-bundles.js"), "utf8");
  for (const mode of ["fetched", "resident", "inline"]) {
    const scenery = function (api) { api.bakedModel("test_model"); };
    let releaseModels, enterModelWait;
    const modelBarrier = new Promise((resolve) => { releaseModels = resolve; });
    const modelWaitEntered = new Promise((resolve) => { enterModelWait = resolve; });
    const calls = [], fetches = [];
    const def = { id: "monza", ...(mode === "inline" ? { scenery } : {}) };
    const ctx = vm.createContext({
      ApexRoster: { DEFERRED: {}, DEFERRED_EDGES: [], LAZY_AGENT: [], LAZY_EDGES: [],
        LAZY_RACE: [], LAZY_RACE_SESSION: [], LAZY_AUDIO: [], LAZY_DATA: [], LAZY_NET: [],
        SCENERY_DIR: "js/circuits/scenery" },
      Tracks: { LIST: [def], circuitPayloadResident: () => true },
      TrackScenery: mode === "resident" ? { monza: scenery } : {},
      Assets: { modelsReady(cap, source) {
        calls.push({ cap, source }); enterModelWait(); return modelBarrier;
      } },
      Log: { warn() {} },
    });
    ctx.window = ctx;
    const bundles = vm.runInContext(src + "; LazyBundles", ctx).create({
      els: {}, loadBackendScripts: async (files) => {
        fetches.push([...files]); ctx.TrackScenery.monza = scenery; return true;
      },
    });
    let built = false;
    const build = bundles.ensureScenery(0).then((ready) => {
      assert.equal(ready, true, mode + ": scenery is resident"); built = true;
    });
    await modelWaitEntered;
    await Promise.resolve(); await Promise.resolve();
    assert.equal(built, false, mode + ": a build cannot pass the pending model wait");
    assert.deepEqual(calls, [{ cap: 0, source: String(scenery) }], mode + ": wait for this closure's models");
    assert.deepEqual(fetches, mode === "fetched" ? [["js/circuits/scenery/monza.js"]] : [],
      mode + ": resident and inline closures need no script fetch");
    releaseModels();
    await build;
    assert.equal(built, true, mode + ": releasing the models permits the build");
  }
  const game = fs.readFileSync(path.join(ROOT, "js/game.js"), "utf8");
  assert.doesNotMatch(game, /Assets\.loadModels\(\)/, "boot must not prefetch the whole model pack again");
});

test("modelsReady(ms, src) fetches only the models a scenery closure names", async () => {
  const urls = [];
  const fetch = async (url) => {
    urls.push(url);
    if (/manifest\.json$/.test(url)) return { ok: true, json: async () => ({ models: {
      a_one: { file: "models/a_one.bin" }, b_two: { file: "models/b_two.bin" }, c_three: { file: "models/c_three.bin" } } }) };
    return { ok: true, arrayBuffer: async () => MODEL_V2() };
  };
  const assets = assetLoader({ setTimeout, clearTimeout, fetch });
  const scenery = function (api) { const { bakedModel } = api; for (const [id] of [["a_one"], ["c_three"]]) bakedModel(id); bakedModel('a_one'); bakedModel("not_in_pack"); };
  assert.equal(await assets.modelsReady(1000, String(scenery)), 2);
  assert.ok(assets.modelSync("a_one") && assets.modelSync("c_three"));
  assert.equal(assets.modelSync("b_two"), null, "a model no closure names is never fetched");
  assert.deepEqual(urls.filter((u) => /\.bin$/.test(u)).sort(), ["assets/pack/models/a_one.bin", "assets/pack/models/c_three.bin"]);
  const n = urls.length;
  assert.equal(await assets.modelsReady(1000, ""), 0, "a circuit that names no model resolves at once");
  assert.equal(await assets.modelsReady(1000, "function(){ building(); }"), 0);
  assert.equal(urls.length, n, "no model fetch for a closure without models (the manifest is cached)");
});

test("unknown bake flag is refused before rewriting the pack", () => {
  const r = cp.spawnSync(process.execPath, [path.join(ROOT, "tools", "gen", "assets.mjs"), "bake-synthetic", "--dry-run"],
    { encoding: "utf8" });
  assert.notEqual(r.status, 0, "bake-synthetic --dry-run must exit non-zero");
  assert.match(r.stderr, /unknown flag --dry-run/, `expected unknown-flag error, got:\n${r.stderr}`);
});

test("assets.mjs --help prints usage and exits 0", () => {
  const r = cp.spawnSync(process.execPath, [path.join(ROOT, "tools", "gen", "assets.mjs"), "--help"],
    { encoding: "utf8" });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /bake-synthetic/);
});

// ── verify against a BAD manifest (2026-10-04) ─────────────────────────────
// `verify` joined a model's file onto the pack with no confinement (materials
// already had one), accepted a model with no md5 at all, and never opened the
// AX26 body, so an index past the vertex count or a material id past the
// array's last layer shipped silently. Each case below is one defect in an
// otherwise-good pack; the good model alone must pass.
test("verify refuses model files outside the pack, unhashed, or with out-of-range indices/layers", async () => {
  const os = require("node:os");
  const crypto = require("node:crypto");
  const { writeAX26 } = await import("../../tools/gen/assets.mjs");
  const tri = { pos: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), idx: new Uint32Array([0, 1, 2]) };
  const md5 = (b) => crypto.createHash("md5").update(b).digest("hex");
  const meta = { licence: "CC0", author: "t", source: "t", mat: "CONCRETE" };
  const run = (models, files) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apex-verify-"));
    try {
      fs.mkdirSync(path.join(dir, "models"), { recursive: true });
      for (const [f, b] of Object.entries(files)) fs.writeFileSync(path.join(dir, f), b);
      fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({ version: 1, materials: null, models, env: {}, credits: [] }));
      const r = cp.spawnSync(process.execPath, [path.join(ROOT, "tools", "gen", "assets.mjs"), "verify"],
        { env: { ...process.env, APEX_PACK_DIR: dir }, encoding: "utf8" });
      return { status: r.status, out: r.stdout + r.stderr };
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  };
  const good = writeAX26(tri, "CONCRETE");
  assert.equal(good.readUInt32LE(4), 2, "precondition: the compact layout");
  const ok = run({ good: { ...meta, file: "models/good.bin", md5: md5(good), verts: 3, tris: 1 } }, { "models/good.bin": good });
  assert.equal(ok.status, 0, "the good pack passes:\n" + ok.out);

  // An index past nv: the last u16 is the last index of the v2 body.
  const badIdx = Buffer.from(good); badIdx.writeUInt16LE(7, badIdx.length - 2);
  // A material layer past the array: the v2 per-vertex material bytes sit at 20 + nv*21.
  const badMat = Buffer.from(good); badMat[20 + 3 * 21] = 40;
  // A v1 body (an emissive colour > 1 forces it) with an out-of-range index too.
  const v1 = writeAX26({ ...tri, col: new Float32Array(9).fill(2) }, "CONCRETE");
  assert.equal(v1.readUInt32LE(4), 1, "precondition: the wide layout");
  const v1Bad = Buffer.from(v1); v1Bad.writeUInt32LE(3, v1Bad.length - 4);
  const cases = [
    ["outside the pack", { ...meta, file: "../escape.bin", md5: md5(good) }, {}, /file outside pack/],
    ["no md5", { ...meta, file: "models/good.bin" }, { "models/good.bin": good }, /md5 missing/],
    ["index past nv (v2)", { ...meta, file: "models/b.bin", md5: md5(badIdx) }, { "models/b.bin": badIdx }, /indices reach past the 3 vertices/],
    ["index past nv (v1)", { ...meta, file: "models/b.bin", md5: md5(v1Bad) }, { "models/b.bin": v1Bad }, /indices reach past the 3 vertices/],
    ["material layer past the array", { ...meta, file: "models/b.bin", md5: md5(badMat) }, { "models/b.bin": badMat }, /material layer 40, outside 0\.\.16/],
    ["truncated body", { ...meta, file: "models/b.bin", md5: md5(good.subarray(0, good.length - 2)) }, { "models/b.bin": good.subarray(0, good.length - 2) }, /bytes, header says/],
    ["unknown material name", { ...meta, mat: "PLUTONIUM", file: "models/good.bin", md5: md5(good) }, { "models/good.bin": good }, /not a MAT id/],
    ["manifest counts drift", { ...meta, file: "models/good.bin", md5: md5(good), verts: 4, tris: 2 }, { "models/good.bin": good }, /manifest says 4 verts/],
  ];
  for (const [name, rec, files, want] of cases) {
    const r = run({ bad: rec }, files);
    assert.equal(r.status, 1, `${name}: verify must fail\n${r.out}`);
    assert.match(r.out, want, `${name}: names the defect`);
  }
});
