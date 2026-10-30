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
import { fileURLToPath, pathToFileURL } from "node:url";
import { fnSource } from "../helpers/fn-source.mjs";
import { createRequire } from "node:module";
import cp from "node:child_process";
import vm from "node:vm";
import { seedLog } from "../helpers/seed-log.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PACK = path.join(ROOT, "assets", "pack");
const MANIFEST = path.join(PACK, "manifest.json");
const BUDGET_BYTES = 8 * 1024 * 1024;         // must match tools/gen/assets.mjs
const ALLOWED = new Set(["CC0", "CC0-1.0", "Apex26-Procedural"]);
// What every pack-strip createImageBitmap must ask for (see the P1 test below).
const STRAIGHT_BITMAP = { premultiplyAlpha: "none", colorSpaceConversion: "none" };

const TOOL_SRC = fs.readFileSync(path.join(ROOT, "tools", "gen", "assets.mjs"), "utf8");
// One source of truth for the MAT layer count: the runtime constant itself (R1-09).
const MAT_N = +/const MAT_LAYERS = (\d+);/.exec(fs.readFileSync(path.join(ROOT, "js", "render", "shared", "assets.js"), "utf8"))[1];
const hasPack = fs.existsSync(MANIFEST);
const manifest = hasPack ? JSON.parse(fs.readFileSync(MANIFEST, "utf8")) : null;

test("GLTF accessors stay inside their declared bufferView and reject invalid stride", () => {
  const ctx = vm.createContext({
    ArrayBuffer, DataView, Uint8Array, Float32Array, Uint16Array, Uint32Array,
    TextDecoder, Log: { enabled: () => false },
  });
  const gltf = vm.runInContext(fs.readFileSync(path.join(ROOT, "js/render/shared/gltf.js"), "utf8") + ";GLTF", ctx, { filename: absSrc("js/render/shared/gltf.js") });
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
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/render/shared/assets.js"), "utf8"), sandbox, { filename: absSrc("js/render/shared/assets.js") });
  return sandbox.Assets;
}

test("a remembered pack index starts the named model fetch before the manifest returns", async () => {
  const urls = [];
  let releaseManifest;
  const manifestGate = new Promise((resolve) => { releaseManifest = resolve; });
  const md5 = "a".repeat(32);
  const store = { "apex26.packIndex": JSON.stringify({ models: { box: { file: "models/box.bin", md5 } } }) };
  const assets = assetLoader({
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
    },
    fetch(url) {
      urls.push(String(url));
      if (String(url).endsWith("manifest.json")) {
        return manifestGate.then(() => ({ ok: true, json: async () => ({ models: { box: { file: "models/box.bin", md5 } } }) }));
      }
      return Promise.resolve({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
    },
  });
  const pending = assets.loadModelsFor('bakedModel("box")');
  await new Promise((r) => setImmediate(r));
  assert.ok(urls.some((u) => u.includes("models/box.bin?h=" + md5)), "model bytes are requested while the manifest is still in flight: " + urls.join(" "));
  releaseManifest();
  assert.equal(await pending, 0, "a body that is not an AX26 model resolves as a miss, not a throw");
  assert.equal(urls.filter((u) => u.includes("models/box.bin")).length, 1, "a matching md5 reuses the early body");
});

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
      assert.equal(layers, MAT_N);
      assert.equal(images.length, MAT_N);
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
  assert.equal(assets.state().bytes, 0, "unload releases the pack byte accounting");
});

test("unload retires BitmapDecode worker when the material pack is torn down", () => {
  let dropped = 0;
  const assets = assetLoader({
    BitmapDecode: { drop: () => { dropped++; } },
  });
  assets.init({ createTextureArray() {}, setMaterialMaps() {} });
  assets.unload();
  assert.equal(dropped, 1, "tier switch / assetLoad(false) must not leave a strip worker inflating");
});

test("unload drops cached models and rejects late manifest/model responses", async () => {
  const manifests = [deferredAssetDownload(), deferredAssetDownload()];
  const modelDownload = deferredAssetDownload();
  let manifestGets = 0;
  const assets = assetLoader({
    fetch(url) {
      if (url.endsWith("manifest.json")) return manifests[manifestGets++].promise;
      return modelDownload.promise;
    },
  });
  assets.init({ createTextureArray() {}, setMaterialMaps() {} });

  const oldManifest = assets.manifest();
  assets.unload();
  const nextManifest = assets.manifest();
  manifests[0].resolve({ ok: true, json: async () => ({ models: { old: { file: "old.ax26" } } }) });
  assert.equal(await oldManifest, false, "a response from before unload cannot become the active pack");
  manifests[1].resolve({ ok: true, json: async () => ({ models: { fresh: { file: "fresh.ax26" } } }) });
  assert.deepEqual(await nextManifest, { models: { fresh: { file: "fresh.ax26" } } });
  assert.equal(assets.models().length, 1);
  assert.equal(assets.models()[0], "fresh");

  const staleModel = assets.model("fresh");
  await new Promise(setImmediate);
  assets.unload();
  modelDownload.resolve({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) });
  assert.equal(await staleModel, null);
  assert.equal(assets.modelSync("fresh"), null, "a late model decode cannot repopulate the cache");
  assert.equal(assets.models().length, 0);
  assert.equal(assets.state().bytes, 0);
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

for (const failure of ["none", "upload", "read", "incomplete", "throw", "lost"]) {
  test(`synchronous layer readback validates GL flags and keeps valid siblings (${failure})`, () => {
    let current = null, error = 1282, lost = false;
    const uploaded = [];
    const gl = {
      UNPACK_FLIP_Y_WEBGL: 1, UNPACK_PREMULTIPLY_ALPHA_WEBGL: 2, UNPACK_COLORSPACE_CONVERSION_WEBGL: 3,
      NONE: 0, TEXTURE_2D: 10, FRAMEBUFFER: 11, COLOR_ATTACHMENT0: 12, FRAMEBUFFER_COMPLETE: 13, RGBA: 14, UNSIGNED_BYTE: 15,
      pixelStorei() {}, createTexture: () => ({}), createFramebuffer: () => ({}),
      bindTexture() {}, bindFramebuffer() {}, framebufferTexture2D() {},
      getError() { const e = error; error = 0; return e; }, isContextLost: () => lost,
      texImage2D(...args) {
        const image = args.at(-1); uploaded.push(image.id);
        if (image.id === 2 && failure === "upload") { error = 1282; return; }
        current = image;
        if (image.id === 2 && failure === "throw") { error = 1282; throw Error("upload refused"); }
      },
      checkFramebufferStatus() {
        if (current.id === 2 && failure === "incomplete") { error = 1282; return 0; }
        return 13;
      },
      readPixels(_x, _y, _w, _h, _f, _t, dst) {
        if (current.id === 2 && failure === "read") { error = 1282; return; }
        if (current.id === 2 && failure === "lost") { error = 37442; lost = true; return; }
        dst.fill(current.fill);
      },
    };
    const assets = assetLoader({ OffscreenCanvas: class { getContext() { return gl; } } });
    const page = 16, images = [new Uint8Array(page).fill(7), { id: 1, fill: 41 }, { id: 2, fill: 99 }, { id: 3, fill: 121 }];
    const data = new Uint8Array(page * images.length).fill(173);
    const done = [...assets.readLayerBytes(2, images, images.length, data)];
    assert.deepEqual(done, failure === "none" ? [0, 1, 2, 3] : failure === "lost" ? [0, 1] : [0, 1, 3]);
    assert.deepEqual([...data.subarray(0, page)], Array(page).fill(7), "raw bytes bypass GL flags");
    assert.deepEqual([...data.subarray(page, 2 * page)], Array(page).fill(41), "the completed prefix survives a failed suffix");
    if (failure !== "lost") assert.deepEqual([...data.subarray(3 * page)], Array(page).fill(121), "a bad layer cannot poison the next one");
    if (failure === "none") assert.deepEqual([...data.subarray(2 * page, 3 * page)], Array(page).fill(99));
    else assert.ok(!done.includes(2), "failed bytes must go through the caller's existing fallback");
    assert.deepEqual(uploaded, failure === "lost" ? [1, 2] : [1, 2, 3]);
    assert.equal(error, 0, "operation flags are drained, including throws and incomplete FBOs");
  });
}

// P4 (perf hunt 4, lane WGX): readLayerBytesAsync must hand back the SAME bytes readLayerBytes does, through a
// PIXEL_PACK_BUFFER + fenceSync readback instead of a blocking readPixels per layer (MDN's readPixelsAsync).
// One mock WebGL2 serves both paths from the same uploaded pixels — every pixel of every layer distinct, so a
// wrong PBO slot offset, a swapped layer or a short copy shows as a byte difference, not a lucky match.
function makeAsyncGl(opts = {}) {
  const GL = { UNPACK_FLIP_Y_WEBGL: 1, UNPACK_PREMULTIPLY_ALPHA_WEBGL: 2, UNPACK_COLORSPACE_CONVERSION_WEBGL: 3,
    NONE: 0, TEXTURE_2D: 10, FRAMEBUFFER: 11, COLOR_ATTACHMENT0: 12, FRAMEBUFFER_COMPLETE: 13, RGBA: 14, UNSIGNED_BYTE: 15,
    PIXEL_PACK_BUFFER: 20, STREAM_READ: 21, SYNC_GPU_COMMANDS_COMPLETE: 22, ALREADY_SIGNALED: 23, TIMEOUT_EXPIRED: 24,
    CONDITION_SATISFIED: 25, WAIT_FAILED: 26 };
  const ops = [];
  let current = null, pbo = null, polls = 0;
  const gl = { ...GL,
    pixelStorei() {}, createTexture() { return {}; }, createFramebuffer() { return {}; },
    bindTexture() {}, bindFramebuffer() {}, framebufferTexture2D() {},
    checkFramebufferStatus() { return current && current.refused ? 0 : GL.FRAMEBUFFER_COMPLETE; },
    texImage2D(...a) { current = a[a.length - 1]; ops.push(["tex", current.id]); },
    createBuffer() { return { data: null }; },
    bindBuffer(t, b) { assert.equal(t, GL.PIXEL_PACK_BUFFER); pbo = b; ops.push(["bind", !!b]); },
    bufferData(t, size, usage) { assert.equal(t, GL.PIXEL_PACK_BUFFER); assert.equal(usage, GL.STREAM_READ); pbo.data = new Uint8Array(size); ops.push(["alloc", size]); },
    // The one readPixels: a client-memory destination copies at once (the sync path); a byte OFFSET with a
    // PBO bound records the copy for the GPU (the async path) — nothing lands in client memory here.
    readPixels(x, y, w, h, f, t, dst) {
      const px = current.pixels(w, h);
      if (typeof dst === "number") { assert.ok(pbo, "an offset needs a bound PIXEL_PACK_BUFFER"); pbo.data.set(px, dst); ops.push(["readPBO", current.id, dst]); }
      else { dst.set(px); ops.push(["readSync", current.id]); }
    },
    fenceSync(cond, flags) { assert.equal(cond, GL.SYNC_GPU_COMMANDS_COMPLETE); assert.equal(flags, 0); ops.push(["fence"]); return opts.noSyncObject ? null : { signalled: 0 }; },
    flush() { ops.push(["flush"]); },
    // The GPU is "still busy" for opts.busyPolls polls, then signalled — the poll loop must come back on a timer.
    clientWaitSync(sync, flags, timeout) { assert.equal(timeout, 0, "never a blocking wait"); polls++; if (opts.waitFails) return GL.WAIT_FAILED;
      return polls <= (opts.busyPolls || 0) ? GL.TIMEOUT_EXPIRED : GL.CONDITION_SATISFIED; },
    deleteSync() { ops.push(["deleteSync"]); },
    getBufferSubData(t, srcOff, dst, dstOff, len) { assert.equal(t, GL.PIXEL_PACK_BUFFER); assert.ok(pbo, "bound for the copy");
      dst.set(pbo.data.subarray(srcOff, srcOff + len), dstOff); ops.push(["sub", srcOff, dstOff, len]); },
    deleteBuffer(b) { ops.push(["deleteBuffer"]); b.data = null; },
    isContextLost() { return false; },
    getExtension() { return null; },
  };
  return { gl, GL, ops, polls: () => polls };
}
const layerImage = (id, size, refused) => ({ id, refused,
  // pixel (x, y, c) of layer id = a distinct byte: no two layers, pixels or channels alike.
  pixels(w, h) { const p = new Uint8Array(w * h * 4); for (let i = 0; i < p.length; i++) p[i] = (id * 61 + i * 7 + 3) & 255; return p; } });

test("P4: readLayerBytesAsync returns byte-identical layers to readLayerBytes through a PIXEL_PACK_BUFFER + fenceSync", async () => {
  const size = 4, page = size * size * 4, n = MAT_N;
  const images = [];
  images[1] = layerImage(1, size); images[2] = new Uint8Array(page).fill(77);   // bytes: copied, never uploaded (both paths)
  images[5] = layerImage(5, size); images[9] = layerImage(9, size); images[16] = layerImage(16, size);
  const run = async (mock, viaAsync) => {
    const assets = assetLoader({ setTimeout, OffscreenCanvas: class { getContext(kind) { return kind === "webgl2" ? mock.gl : null; } } });
    const data = new Uint8Array(page * n);
    const landed = [];
    const done = viaAsync
      ? await assets.readLayerBytesAsync(size, images, n, data, (i, bytes) => landed.push([i, bytes ? bytes.length : null]))
      : assets.readLayerBytes(size, images, n, data);
    return { data, done: [...done], landed, ops: mock.ops };
  };
  const sync = await run(makeAsyncGl(), false);
  const busy = makeAsyncGl({ busyPolls: 3 });
  const async_ = await run(busy, true);
  assert.deepEqual(async_.done, sync.done, "the same layer list");
  assert.deepEqual(async_.done, [1, 2, 5, 9, 16]);
  assert.ok(Buffer.from(async_.data).equals(Buffer.from(sync.data)), "every byte of every layer identical");
  for (const i of [1, 5, 9, 16]) assert.equal(async_.data[i * page + 3], (i * 61 + 3 * 7 + 3) & 255, `layer ${i} holds ITS pixels at ITS page`);
  assert.equal(async_.data[2 * page], 77, "the byte layer copied straight");
  assert.equal(async_.data[0], 0, "an absent layer is left untouched");
  assert.deepEqual(async_.landed, [[2, page], [1, page], [5, page], [9, page], [16, page]], "onLayer per layer: the byte layer at once, the rest as the copy lands");
  // The mechanism: 4 uploads, each into ITS OWN PBO (Chromium's shadow copy is single-use per buffer: a shared
  // buffer read at slot offsets warned 12 times and copied 3× slower in-container), ONE fence + flush, a
  // non-blocking poll per tick, then one whole-buffer getBufferSubData per layer into the layer's page — and no
  // readPixels into client memory at all.
  const kinds = async_.ops.map((o) => o[0]);
  assert.equal(kinds.filter((k) => k === "readSync").length, 0, "the async path never blocks in readPixels");
  assert.deepEqual(async_.ops.filter((o) => o[0] === "readPBO"), [["readPBO", 1, 0], ["readPBO", 5, 0], ["readPBO", 9, 0], ["readPBO", 16, 0]], "each layer reads into its own buffer at offset 0");
  assert.deepEqual(async_.ops.filter((o) => o[0] === "alloc"), [["alloc", page], ["alloc", page], ["alloc", page], ["alloc", page]], "one page-sized PBO per pending layer");
  assert.equal(kinds.filter((k) => k === "fence").length, 1, "one fence for the whole pack"); assert.equal(kinds[kinds.indexOf("fence") + 1], "flush", "flushed right after the fence (MDN)");
  assert.equal(busy.polls(), 4, "polled until the fence signalled (3 busy ticks, then satisfied)");
  assert.deepEqual(async_.ops.filter((o) => o[0] === "sub"), [["sub", 0, page, page], ["sub", 0, 5 * page, page], ["sub", 0, 9 * page, page], ["sub", 0, 16 * page, page]], "each buffer lands whole at its layer's page");
  assert.equal(kinds.filter((k) => k === "deleteBuffer").length, 4, "every PBO is released"); assert.ok(kinds.includes("deleteSync"), "the fence is released");
  const firstSub = kinds.indexOf("sub"), lastFence = kinds.lastIndexOf("fence");
  assert.ok(firstSub > lastFence && kinds.slice(lastFence, firstSub).filter((k) => k === "readPBO").length === 0, "every readPixels precedes the fence; every copy follows it");
  assert.deepEqual(sync.ops.filter((o) => o[0] === "readSync").map((o) => o[1]), [1, 5, 9, 16], "the sync path still reads each layer in place");
});

test("P4: the clean 14-layer pack batches GL error checks before publishing callbacks", async () => {
  const mock = makeAsyncGl();
  let queries = 0;
  mock.gl.getError = () => { queries++; return 0; };
  const assets = assetLoader({ setTimeout, OffscreenCanvas: class { getContext() { return mock.gl; } } });
  const images = [], complete = [];
  for (const i of [1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16]) images[i] = layerImage(i, 2);
  const done = await assets.readLayerBytesAsync(2, images, MAT_N, new Uint8Array(MAT_N * 16), (i, bytes) => {
    assert.ok(bytes);
    assert.equal(queries, 4, "publish only after the whole copied batch passed its error check");
    complete.push(i);
  });
  assert.equal(queries, 4, "query budget stays constant instead of four round trips per image");
  assert.deepEqual([...done], complete);
  assert.equal(new Set(complete).size, 14, "every layer fires exactly once");
});

for (const refusal of ["successful-readback", "synchronous-fallback"]) {
  test(`P4: a throwing ${refusal} consumer cannot strand the job or duplicate callbacks`, { timeout: 1000 }, async () => {
    // Force the poll onto a timer: an escaped callback would reject neither
    // the pending promise nor release its PBOs, and surface as uncaught JS.
    const mock = makeAsyncGl({ busyPolls: 1 }), live = new Set(), callbacks = [];
    const create = mock.gl.createBuffer, remove = mock.gl.deleteBuffer;
    mock.gl.createBuffer = () => { const b = create(); live.add(b); return b; };
    mock.gl.deleteBuffer = b => { assert.ok(live.delete(b), "each buffer freed once"); return remove(b); };
    const assets = assetLoader({ setTimeout, OffscreenCanvas: class { getContext() { return mock.gl; } } });
    const images = [];
    for (const i of [1, 2, 3]) images[i] = layerImage(i, 2, refusal === "synchronous-fallback" && i === 2);
    const done = await assets.readLayerBytesAsync(2, images, 4, new Uint8Array(64), (i, bytes) => {
      callbacks.push([i, !!bytes]);
      if ((refusal === "successful-readback" && i === 1) || !bytes) throw Error("consumer refused layer");
    });
    assert.deepEqual([...done], refusal === "successful-readback" ? [1, 2, 3] : [1, 3]);
    assert.equal(callbacks.length, 3, "every available layer is notified once despite consumer failure");
    assert.equal(new Set(callbacks.map(([i]) => i)).size, 3, "a fallback exception does not trigger another fallback");
    assert.equal(live.size, 0, "the completed promise owns no PBOs");
    assert.equal(mock.ops.filter(([op]) => op === "deleteSync").length, 1, "the fence is released");
    assert.deepEqual(mock.ops.filter(([op]) => op === "bind").at(-1), ["bind", false]);
  });
}

for (const failure of ["createBuffer-null", "bufferData", "readPixels"]) {
  test(`P4: a ${failure} failure releases its buffer before fallback and preserves sibling layers`, async () => {
    const mock = makeAsyncGl(), gl = mock.gl;
    const live = new Set(), freed = new Set(), fallback = [];
    let layer = null, bound = null;
    const original = Object.fromEntries(["texImage2D", "createBuffer", "bindBuffer", "bufferData", "readPixels", "getBufferSubData", "deleteBuffer"].map(k => [k, gl[k]]));
    gl.texImage2D = (...args) => { layer = args[args.length - 1].id; return original.texImage2D(...args); };
    gl.createBuffer = () => {
      if (layer === 2 && failure === "createBuffer-null") return null;
      const b = original.createBuffer(); live.add(b); return b;
    };
    gl.bindBuffer = (target, b) => { bound = b; return original.bindBuffer(target, b); };
    gl.bufferData = (...args) => {
      if (layer === 2 && failure === "bufferData") throw Error("injected bufferData failure");
      // WebGL errors leave state untouched, rather than throwing, with no PBO bound.
      if (!bound) return;
      return original.bufferData(...args);
    };
    gl.readPixels = (...args) => {
      if (layer === 2 && failure === "readPixels") throw Error("injected readPixels failure");
      if (typeof args[args.length - 1] === "number" && !bound) return;
      return original.readPixels(...args);
    };
    gl.getBufferSubData = (...args) => { if (bound) return original.getBufferSubData(...args); };
    gl.deleteBuffer = (b) => {
      if (!b) return;
      assert.ok(!freed.has(b), "each allocated buffer is deleted once");
      freed.add(b); live.delete(b); return original.deleteBuffer(b);
    };
    const assets = assetLoader({ setTimeout, OffscreenCanvas: class { getContext() { return gl; } } });
    const images = []; for (const i of [1, 2, 3]) images[i] = layerImage(i, 2);
    const data = new Uint8Array(64);
    const done = await assets.readLayerBytesAsync(2, images, 4, data, (i, bytes) => {
      if (bytes) return;
      assert.equal(bound, null, "sync fallback cannot inherit a pixel-pack buffer binding");
      assert.equal(live.size, 1, "only the first successful sibling's pending buffer is still owned");
      fallback.push(i);
    });
    assert.deepEqual([...done], [1, 3], "the failed layer never gets polled or falsely reported as filled");
    assert.deepEqual(fallback, [2]);
    for (const i of [1, 3]) assert.deepEqual([...data.subarray(i * 16, (i + 1) * 16)], [...images[i].pixels(2, 2)]);
    assert.deepEqual([...data.subarray(32, 48)], Array(16).fill(0), "failed bytes stay untouched for fallback");
    assert.equal(live.size, 0, "all successful and failed allocations are released");
    assert.equal(bound, null);
  });
}

for (const failure of ["bufferData-OUT_OF_MEMORY", "readPixels-INVALID_OPERATION", "getBufferSubData-INVALID_OPERATION"]) {
  test(`P4: nonthrowing ${failure} cannot report zero bytes as a completed layer`, async () => {
    const mock = makeAsyncGl(), gl = mock.gl;
    const live = new Set(), errors = [], fallbacks = [], completed = [];
    let layer = null, bound = null;
    const original = Object.fromEntries(["texImage2D", "createBuffer", "bindBuffer", "bufferData", "readPixels", "getBufferSubData", "deleteBuffer"].map(k => [k, gl[k]]));
    gl.getError = () => errors.shift() || 0;
    gl.texImage2D = (...args) => { layer = args[args.length - 1].id; return original.texImage2D(...args); };
    gl.createBuffer = () => { const b = original.createBuffer(); b.layer = layer; live.add(b); return b; };
    gl.bindBuffer = (target, b) => { bound = b; return original.bindBuffer(target, b); };
    gl.bufferData = (...args) => {
      if (layer === 2 && failure.startsWith("bufferData")) { errors.push(0x0505); return; }
      return original.bufferData(...args);
    };
    gl.readPixels = (...args) => {
      if (!bound.data || (layer === 2 && failure.startsWith("readPixels"))) { errors.push(0x0502); return; }
      return original.readPixels(...args);
    };
    gl.getBufferSubData = (...args) => {
      if (bound.layer === 2 && failure.startsWith("getBufferSubData")) { errors.push(0x0502); return; }
      return original.getBufferSubData(...args);
    };
    gl.deleteBuffer = (b) => { assert.ok(live.delete(b), "delete each owned allocation once"); return original.deleteBuffer(b); };
    const assets = assetLoader({ setTimeout, OffscreenCanvas: class { getContext() { return gl; } } });
    const images = []; for (const i of [1, 2, 3]) images[i] = layerImage(i, 2);
    const data = new Uint8Array(64);
    const done = await assets.readLayerBytesAsync(2, images, 4, data, (i, bytes) => {
      if (bytes) completed.push(i);
      else { assert.equal(bound, null); fallbacks.push(i); }
    });
    assert.deepEqual([...done], [1, 3]);
    assert.deepEqual(completed, [1, 3], "no success callback for the failed zero-filled layer");
    assert.deepEqual(fallbacks, failure.startsWith("getBufferSubData") ? [] : [2], "queue errors fall back synchronously while images are alive");
    for (const i of [1, 3]) assert.deepEqual([...data.subarray(i * 16, (i + 1) * 16)], [...images[i].pixels(2, 2)]);
    assert.deepEqual([...data.subarray(32, 48)], Array(16).fill(0));
    assert.equal(live.size, 0);
    assert.equal(bound, null);
    assert.deepEqual(errors, [], "error flags from a failed layer cannot poison successful siblings");
  });
}

test("P4: readLayerBytesAsync degrades the way the sync path does — refused layers, a failed wait, no fence API", async () => {
  const size = 2, page = size * size * 4, n = 4;
  const ctx = (mock) => assetLoader({ setTimeout, OffscreenCanvas: class { getContext(kind) { return kind === "webgl2" ? mock.gl : null; } } });
  // A layer the scratch FBO refuses: onLayer(i, null) fires SYNCHRONOUSLY (the image is still alive) and it is not in `done`.
  // (busyPolls 1: a fence already signalled at the first poll lands the rest synchronously too, which is fine; the
  // point here is the refused layer's report comes first either way.)
  {
    const mock = makeAsyncGl({ busyPolls: 1 });
    const images = []; images[1] = layerImage(1, size); images[2] = layerImage(2, size, true); images[3] = layerImage(3, size);
    const landed = []; const data = new Uint8Array(page * n);
    const p = ctx(mock).readLayerBytesAsync(size, images, n, data, (i, b) => landed.push([i, b ? "bytes" : null]));
    assert.deepEqual(landed, [[2, null]], "the refused layer is reported before the promise settles");
    assert.deepEqual([...await p], [1, 3]);
    assert.deepEqual(landed, [[2, null], [1, "bytes"], [3, "bytes"]]);
  }
  // clientWaitSync WAIT_FAILED: resolves with what landed (nothing from the PBO), the PBO and fence released, no throw.
  {
    const mock = makeAsyncGl({ waitFails: true });
    const images = []; images[1] = layerImage(1, size); images[2] = new Uint8Array(page).fill(9);
    const data = new Uint8Array(page * n);
    assert.deepEqual([...await ctx(mock).readLayerBytesAsync(size, images, n, data)], [2], "only the byte layer landed");
    assert.equal(data[page], 0, "the unread layer's page is untouched");
    const kinds = mock.ops.map((o) => o[0]);
    assert.ok(kinds.includes("deleteSync") && kinds.includes("deleteBuffer"));
  }
  // No sync object (a lost context) or no fence API at all: null, synchronously — the caller takes the sync path now.
  {
    const images = []; images[1] = layerImage(1, size);
    assert.equal(ctx(makeAsyncGl({ noSyncObject: true })).readLayerBytesAsync(size, images, n, new Uint8Array(page * n)), null);
    const old = makeAsyncGl(); delete old.gl.fenceSync;
    assert.equal(ctx(old).readLayerBytesAsync(size, images, n, new Uint8Array(page * n)), null, "a WebGL2 without fences (none shipping, but the guard is cheap)");
    const none = assetLoader({ OffscreenCanvas: class { getContext() { return null; } } });
    assert.equal(none.readLayerBytesAsync(size, images, n, new Uint8Array(page * n)), null, "no WebGL2 at all");
  }
  // Bytes-only pack (the byte decoder's output): resolves at once and never CREATES the scratch context — creating it
  // was 0.16–0.79 s of main thread at race entry (B·H14) — even where no WebGL2 exists at all.
  {
    const mock = makeAsyncGl();
    const images = []; images[3] = new Uint8Array(page).fill(5);
    const data = new Uint8Array(page * n);
    let made = 0;
    const assets = assetLoader({ setTimeout, OffscreenCanvas: class { constructor() { made++; } getContext() { return mock.gl; } } });
    assert.deepEqual([...await assets.readLayerBytesAsync(size, images, n, data)], [3]);
    assert.equal(data[3 * page], 5); assert.equal(mock.ops.length, 0, "no upload, no PBO, no fence");
    assert.equal(made, 0, "no scratch canvas for a bytes-only pack");
    const noGl = assetLoader({ OffscreenCanvas: class { getContext() { return null; } } });
    assert.deepEqual([...await noGl.readLayerBytesAsync(size, images, n, new Uint8Array(page * n))], [3], "bytes need no WebGL2");
  }
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

// P4 for TLX (#2149): tlx.js createTextureArray / setMaterialMaps, lifted verbatim, against the real Assets
// loader on the async mock GL and three r186's real DataArrayTexture. Pins the token (pending + ready, no upload
// scheduled until every layer has landed), the bind held back while pending, byte parity with the sync path, and the
// fallback to readbackTextureLayers when the async call returns null (or apex26.tlxPackAsync=0).
async function tlxPackRig(mock, { nullAsync = false, ls = {} } = {}) {
  const THREE = await import(pathToFileURL(path.join(ROOT, "vendor/three-0.187.0/three.core.min.js")).href);
  const TLX = fs.readFileSync(path.join(ROOT, "js/render/three/tlx.js"), "utf8");
  const a = TLX.indexOf("      function readbackTextureLayers(size, images, n, data) {");
  const b = TLX.indexOf("      // CSS-box observation is shared", a);
  assert.ok(a > 0 && b > a, "tlx.js readback block moved — update this test");
  const assets = assetLoader({ setTimeout, OffscreenCanvas: class { getContext(kind) { return kind === "webgl2" ? mock.gl : null; } } });
  if (nullAsync) assets.readLayerBytesAsync = () => null;
  const calls = { async: 0, sync: 0, bound: [] };
  const A = { readLayerBytes: (...x) => { calls.sync++; return assets.readLayerBytes(...x); },
    readLayerBytesAsync: (...x) => { calls.async++; return assets.readLayerBytesAsync(...x); } };
  const lit = { setMaterialMaps: (m) => calls.bound.push(m) };
  const twoD = class { constructor(w, h) { this.w = w; this.h = h; }
    getContext() { const w = this.w, h = this.h; return { clearRect() {}, drawImage() {}, getImageData: () => ({ data: new Uint8Array(w * h * 4).fill(201) }) }; } };
  // eslint-disable-next-line no-new-func
  const gfx = new Function("THREE", "Assets", "localStorage", "lit", "OffscreenCanvas", `"use strict";
    let matPlaceAlbedo = null, matPlaceNormal = null, matOwnedAlbedo = null, matOwnedNormal = null;
    let materialArrayDetail = null; const renderer = {};   // materialArrayAnisotropy(): no renderer cap here -> 1
    ${TLX.slice(a, b)}
    ${fnSource(TLX, "function materialArrayAnisotropy() {")}
    return { ${fnSource(TLX, "createTextureArray(size, images, layers) {")}, ${fnSource(TLX, "setMaterialMaps(maps) {")} };`)(
    THREE, A, { getItem: (k) => (k in ls ? ls[k] : null) }, lit, twoD);
  return { gfx, calls };
}
const tlxImages = (size, refusedAt = -1) => {
  const im = []; for (const i of [1, 5, 9, 16]) im[i] = layerImage(i, size, i === refusedAt); im[2] = new Uint8Array(size * size * 4).fill(77); return im;
};

test("P4 (TLX #2149): createTextureArray returns a pending token, uploads only once every layer landed, bytes = the sync path", async () => {
  const size = 4, n = MAT_N;
  const sync = await tlxPackRig(makeAsyncGl(), { nullAsync: true });
  const st = sync.gfx.createTextureArray(size, tlxImages(size), n);
  assert.equal(st.pending, undefined, "the sync path returns a plain texture"); assert.equal(st.ready, undefined);
  assert.ok(st.version > 0, "sync: upload scheduled at once"); assert.equal(sync.calls.sync, 1);

  const mock = makeAsyncGl({ busyPolls: 3 });
  const r = await tlxPackRig(mock);
  const t = r.gfx.createTextureArray(size, tlxImages(size), n);
  assert.equal(r.calls.async, 1, "Assets.readLayerBytesAsync has a TLX caller"); assert.equal(r.calls.sync, 0);
  assert.equal(t.pending, true); assert.equal(typeof t.ready.then, "function");
  assert.equal(t.version, 0, "no upload scheduled while layers are in flight (a half-filled array never reaches the GPU)");
  assert.equal(mock.ops.filter((o) => o[0] === "readSync").length, 0, "no blocking readPixels");
  assert.equal(await t.ready, true);
  assert.equal(t.pending, false); assert.ok(t.version > 0, "needsUpdate once ready");
  assert.ok(Buffer.from(t.image.data).equals(Buffer.from(st.image.data)), "byte parity with the sync path, every layer");
});

test("P4 (TLX #2149): setMaterialMaps holds a pending token back, binds it when ready, and a newer call supersedes it", async () => {
  const size = 2, n = MAT_N;
  {
    const r = await tlxPackRig(makeAsyncGl({ busyPolls: 2 }));
    const al = r.gfx.createTextureArray(size, tlxImages(size), n), nm = r.gfx.createTextureArray(size, tlxImages(size), n);
    r.gfx.setMaterialMaps({ albedo: al, normal: nm, scales: [1] });
    assert.equal(r.calls.bound.length, 0, "nothing bound while pending: the procedural look stays");
    await Promise.all([al.ready, nm.ready]); await new Promise((res) => setTimeout(res, 0));
    assert.equal(r.calls.bound.length, 1);
    assert.equal(r.calls.bound[0].albedo, al); assert.equal(r.calls.bound[0].normal, nm); assert.deepEqual(r.calls.bound[0].scales, [1]);
  }
  {
    const r = await tlxPackRig(makeAsyncGl({ busyPolls: 2 }));
    const al = r.gfx.createTextureArray(size, tlxImages(size), n);
    let disposed = 0; al.addEventListener("dispose", () => disposed++);
    r.gfx.setMaterialMaps({ albedo: al, normal: null });
    r.gfx.setMaterialMaps(null);   // unload while the fill is in flight
    await al.ready; await new Promise((res) => setTimeout(res, 0));
    assert.deepEqual(r.calls.bound, [null], "only the unload bound; the superseded token never was");
    assert.equal(disposed, 1, "the superseded token is freed");
  }
  {
    // Freed in flight (a superseded Assets.load): ready resolves false and no upload is ever scheduled.
    const r = await tlxPackRig(makeAsyncGl({ busyPolls: 2 }));
    const al = r.gfx.createTextureArray(size, tlxImages(size), n);
    al.dispose();
    assert.equal(await al.ready, false); assert.equal(al.version, 0);
  }
});

test("TLX repeated pending material adoption keeps shared tokens alive for the latest request", async () => {
  for (const replacement of ["same", "partial", "different", "unload"]) {
    const r = await tlxPackRig(makeAsyncGl({ busyPolls: 2 }));
    const make = () => r.gfx.createTextureArray(2, tlxImages(2), MAT_N);
    const a = make(), n = make(), other = make();
    const disposed = new Map();
    for (const t of [a, n, other]) t.addEventListener("dispose", () => disposed.set(t, (disposed.get(t) || 0) + 1));
    r.gfx.setMaterialMaps({ albedo: a, normal: n, scales: [1] });
    const latest = replacement === "unload" ? null : { albedo: replacement === "different" ? other : a, normal: replacement === "same" ? n : other, scales: [2] };
    r.gfx.setMaterialMaps(latest);
    await Promise.all([a.ready, n.ready, other.ready]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const bound = r.calls.bound.at(-1);
    assert.equal(bound && bound.albedo, latest && latest.albedo, replacement);
    if (latest) {
      assert.equal(bound.normal, latest.normal, replacement);
      for (const t of new Set([latest.albedo, latest.normal])) assert.equal(disposed.get(t) || 0, 0, "latest tokens remain alive");
    }
    for (const t of new Set([a, n])) if (!latest || (t !== latest.albedo && t !== latest.normal)) assert.equal(disposed.get(t), 1, "old unshared token freed once");
    r.gfx.setMaterialMaps(null);
    for (const t of new Set([a, n])) assert.equal(disposed.get(t), 1, "unload frees every adopted token exactly once");
  }
});

test("P4 (TLX #2149): the fallbacks — async null and apex26.tlxPackAsync=0 take the sync path; a refused layer takes the 2d copy", async () => {
  const size = 2, n = MAT_N, page = size * size * 4;
  for (const [label, opts] of [["readLayerBytesAsync → null", { nullAsync: true }], ["apex26.tlxPackAsync=0", { ls: { "apex26.tlxPackAsync": "0" } }]]) {
    const r = await tlxPackRig(makeAsyncGl(), opts);
    const t = r.gfx.createTextureArray(size, tlxImages(size), n);
    assert.equal(t.pending, undefined, label); assert.ok(t.version > 0, label); assert.equal(r.calls.sync, 1, label);
  }
  const r = await tlxPackRig(makeAsyncGl());
  const t = r.gfx.createTextureArray(size, tlxImages(size, 5), n);
  assert.equal(await t.ready, true);
  assert.equal(t.image.data[5 * page], 201, "the layer the scratch FBO refused came from the 2d round-trip");
  assert.equal(t.image.data[0], 128, "an absent layer keeps the neutral grey");
  // Nothing landed at all: ready false and the token freed — assets.js reads that as an upload failure.
  const none = await tlxPackRig(makeAsyncGl({ waitFails: true }));
  const e = none.gfx.createTextureArray(size, [, layerImage(1, size)], n);
  let disposed = 0; e.addEventListener("dispose", () => disposed++);
  assert.equal(await e.ready, false); assert.equal(disposed, 1);
});

// #3110 F2: Save-Data (or a 2G link) takes the 128 px material tier at boot on
// a desktop; an explicit tier and a normal link are unchanged.
test("the material pack takes the low tier under Save-Data or 2G (#3110 F2)", async () => {
  const run = async (connection, opts) => {
    const urls = [];
    const assets = assetLoader({
      navigator: connection === undefined ? {} : { connection },
      async fetch(url) {
        urls.push(url);
        return url.endsWith("manifest.json")
          ? { ok: true, json: async () => ({ materials: {
              size: 4, albedo: "a256.png", normal: "n256.png", layers: [{ mat: 1, scale: 1 }],
              low: { size: 2, albedo: "a128.png", normal: "n128.png", layers: [{ mat: 1, scale: 1 }] },
            } }) }
          : { ok: true, blob: async () => ({ size: 16 }) };
      },
      async createImageBitmap() { return { close() {} }; },
    });
    assets.init({ createTextureArray() { return {}; }, setMaterialMaps() {} });
    await assets.load(opts);
    return { tier: assets.state().tier, strips: urls.filter((u) => /\.png$/.test(u)).map((u) => u.split("/").pop()) };
  };
  const normal = await run(undefined);
  assert.equal(normal.tier, "high", "no Network Information API: desktop keeps 256 px");
  assert.ok(normal.strips.every((u) => /256/.test(u)), "256 px strips: " + normal.strips);
  assert.equal((await run({ saveData: false, effectiveType: "4g" })).tier, "high", "a normal link keeps 256 px");
  const sd = await run({ saveData: true, effectiveType: "4g" });
  assert.equal(sd.tier, "low", "Save-Data takes the low tier");
  assert.ok(sd.strips.length && sd.strips.every((u) => /128/.test(u)), "only 128 px strips fetched: " + sd.strips);
  assert.equal((await run({ saveData: false, effectiveType: "2g" })).tier, "low", "2G takes the low tier");
  assert.equal((await run({ saveData: true }, { tier: "high" })).tier, "high", "an explicit tier still wins");
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
  vm.runInContext(src.replace(/^const\b/gm, "var"), sandbox, { filename: absSrc("js/track/core/geom.js") });
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
  assert.match(lit, new RegExp(`uniform float uMatTexScale\\[${MAT_N}\\];`),
    "lit.js uMatTexScale must be sized for all MAT ids (FLAT..ASPHALT)");
  const glx = fs.readFileSync(path.join(ROOT, "js", "render", "glx", "glx.js"), "utf8");
  assert.match(glx, new RegExp(`MAT_TEX_LAYERS = ${MAT_N}\\b`), "glx.js MAT_TEX_LAYERS must equal MAT_LAYERS");
  const tlx = fs.readFileSync(path.join(ROOT, "js/render/three/tsl-lit.js"), "utf8");
  assert.match(tlx, new RegExp(`U\\.matTexScale = uniformArray\\(Array\\(${MAT_N}\\)\\.fill\\(0\\)\\)`), "TLX material uniforms must cover all MAT ids");
  assert.match(tlx, new RegExp(`for \\(let i = 0; i < ${MAT_N}; i\\+\\+\\)`), "TLX must upload all material scales");
  const wgx = fs.readFileSync(path.join(ROOT, "js/render/webgpu/wgx.js"), "utf8");
  assert.match(wgx, new RegExp(`MAT_TEX_LAYERS = ${MAT_N}\\b`), "WGX material resources must cover all MAT ids");
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
    assert.equal(h, expect * MAT_N,
      `${f} height ${h} != size*${MAT_N} (${expect * MAT_N}) — the filmstrip must have one slot per MAT id`);
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

test("bake-synthetic-models drops retired procedural bins and keeps CC0 imports", () => {
  const os = require("node:os"), cp = require("node:child_process");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "apex-synth-mdl-"));
  try {
    fs.mkdirSync(path.join(dir, "models"), { recursive: true });
    // Retired procedural recipe (no longer in CATALOG) must be removed.
    fs.writeFileSync(path.join(dir, "models", "kenney_construction-cone.bin"), Buffer.from("OLD"));
    // Imported Racing Kit bin must survive an empty-catalog synth bake (#1617).
    fs.writeFileSync(path.join(dir, "models", "k_pylon.bin"), Buffer.from("KIT"));
    fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({
      version: 1, materials: null,
      models: {
        "kenney_construction-cone": {
          file: "models/kenney_construction-cone.bin", licence: "Apex26-Procedural",
          author: "Apex 26", source: "procedural:tools/gen/synth-models.mjs",
        },
        k_pylon: {
          file: "models/k_pylon.bin", licence: "CC0",
          author: "Kenney", source: "kenney:racing-kit",
        },
      },
      env: {}, credits: [],
    }));
    const r = cp.spawnSync(process.execPath,
      [path.join(ROOT, "tools", "gen", "assets.mjs"), "bake-synthetic-models"],
      { env: { ...process.env, APEX_PACK_DIR: dir }, encoding: "utf8" });
    assert.equal(r.status, 0, `bake-synthetic-models failed:\n${r.stdout}\n${r.stderr}`);
    const m = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
    assert.ok(!m.models["kenney_construction-cone"], "retired procedural id must be dropped");
    assert.ok(!fs.existsSync(path.join(dir, "models", "kenney_construction-cone.bin")));
    assert.ok(m.models.k_pylon, "CC0 Racing Kit import must be kept");
    assert.equal(m.models.k_pylon.licence, "CC0");
    assert.ok(fs.existsSync(path.join(dir, "models", "k_pylon.bin")));
    assert.equal(fs.readFileSync(path.join(dir, "models", "k_pylon.bin")).toString(), "KIT");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("bake-model round-trips glTF into the game's own vertex format", async () => {
  // Exercises the whole model path — the real js/render/shared/gltf.js reader in a VM,
  // the MAT stamping, the AX26 writer — against a hand-built single-triangle
  // .glb. Without this the bake-model command is untested code that would only
  // fail the first time somebody reached for it.
  const cp = require("node:child_process");
  fs.mkdirSync(path.join(ROOT, "artifacts"), { recursive: true });
  const dir = fs.mkdtempSync(path.join(ROOT, "artifacts", "apex-pack-"));
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

    // The same runtime parser supports a self-contained JSON data URI without
    // a BIN chunk. Its isolated authoring VM must supply the Node decoder too.
    json.buffers[0].uri = `data:application/octet-stream;base64,${bin.toString("base64")}`;
    jb = Buffer.from(JSON.stringify(json), "utf8");
    while (jb.length % 4) jb = Buffer.concat([jb, Buffer.from(" ")]);
    const dataChunk = chunk(0x4e4f534a, jb);
    head.writeUInt32LE(12 + dataChunk.length, 8);
    fs.writeFileSync(glb, Buffer.concat([head, dataChunk]));
    const dataResult = cp.spawnSync(process.execPath,
      [path.join(ROOT, "tools", "gen", "assets.mjs"), "bake-model", "data-tri", glb, "--mat", "CONCRETE"],
      { env: { ...process.env, APEX_PACK_DIR: dir }, encoding: "utf8", timeout: 10000 });
    assert.equal(dataResult.status, 0, `data-URI bake failed: ${dataResult.stderr || dataResult.stdout}`);
    assert.deepEqual(fs.readFileSync(path.join(dir, "models", "data-tri.bin")), fs.readFileSync(binPath),
      "data-URI and BIN inputs must emit identical geometry, colours, normals, MAT ids and indices");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("bake-atlas slices a 4x4 sheet onto the named MAT layer", async () => {
  const cp = require("node:child_process");
  const zlib = require("node:zlib");
  fs.mkdirSync(path.join(ROOT, "artifacts"), { recursive: true });
  const dir = fs.mkdtempSync(path.join(ROOT, "artifacts", "apex-atlas-"));
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

    const runBake = (low) => cp.spawnSync(process.execPath, [
      path.join(ROOT, "tools", "gen", "assets.mjs"), "bake-atlas",
      "--albedo", atlas, "--grid", "4", "--inset", "0",
      "--size", "8", "--low", String(low), "--map", "BRICK=1,0",
    ], { env: { ...process.env, APEX_PACK_DIR: dir }, encoding: "utf8", timeout: 10000 });
    const r = runBake(4);
    assert.equal(r.status, 0, `bake-atlas failed:\n${r.stdout}\n${r.stderr}`);

    const png = fs.readFileSync(path.join(dir, "mat-albedo-8.png"));
    assert.deepEqual([...png.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47]);
    const w = png.readUInt32BE(16), h = png.readUInt32BE(20);
    assert.equal(w, 8);
    assert.equal(h, 8 * MAT_N);
    const man = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
    const brick = man.materials.layers.find((L) => L.id === "brick");
    assert.ok(brick, "BRICK layer missing from manifest");
    assert.equal(brick.mat, 2);
    assert.equal(brick.licence, "Apex26-Procedural");
    assert.match(brick.source, /generated:.*#1,0/);

    const { encodePNG, decodePNG } = await import("../../tools/gen/assets.mjs");
    const readMobile = async () => {
      const uploads = [], requests = [];
      const assets = assetLoader({ Blob, DecompressionStream, Uint8Array, Float32Array, DataView, ArrayBuffer,
        async fetch(url) {
          // The base content-addresses pack URLs (`?h=<md5>`); key the file by its path.
          const bare = url.split("?")[0];
          requests.push(bare);
          const file = path.join(dir, bare.slice("assets/pack/".length));
          return { ok: true, json: async () => JSON.parse(fs.readFileSync(file, "utf8")),
            blob: async () => new Blob([fs.readFileSync(file)]) };
        } });
      assets.init({ isMobile: true, createTextureArray(size, images) {
        uploads.push({ size, brick: [...images[2]] }); return {};
      }, setMaterialMaps() {} });
      assert.equal(await assets.load(), true);
      return { state: assets.state(), uploads, requests };
    };
    const lowControl = await readMobile();
    assert.equal(lowControl.state.tier, "low");
    assert.equal(lowControl.uploads[0].size, 4);
    assert.deepEqual(lowControl.uploads[0].brick,
      [...decodePNG(fs.readFileSync(path.join(dir, man.materials.low.albedo))).rgba.subarray(2 * 4 * 4 * 4, 3 * 4 * 4 * 4)]);
    const oldLow = fs.readFileSync(path.join(dir, man.materials.low.albedo));

    // Retain another layer's provenance plus unrelated records during a patch.
    const other = { mat: 1, id: "concrete", scale: 1.25, source: "procedural:keep", licence: "CC0", author: "Fixture" };
    man.materials.layers.unshift(other);
    man.materials.low.layers = man.materials.layers;
    man.env.fixture = { source: "procedural:keep", licence: "CC0", author: "Fixture", sky: [1, 1, 1] };
    fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(man));
    const nextPixels = Buffer.alloc(size * size * 4);
    for (let i = 0; i < size * size; i++) {
      const x = i % tile;
      nextPixels.set([30 + x * 25, 210 - x * 20, 70, 255], i * 4);
    }
    fs.writeFileSync(atlas, encodePNG(size, size, nextPixels));
    const disabled = runBake(0);
    assert.equal(disabled.status, 0, disabled.stderr || disabled.stdout);
    const updated = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
    assert.equal(Object.hasOwn(updated.materials, "low"), false, "disabled tier must not advertise old pixels");
    assert.notDeepEqual(fs.readFileSync(path.join(dir, updated.materials.albedo)), png);
    assert.deepEqual(fs.readFileSync(path.join(dir, man.materials.low.albedo)), oldLow, "old files may remain unreferenced");
    assert.deepEqual(updated.materials.layers.find(L => L.mat === 1), other);
    assert.deepEqual(updated.env, man.env);
    assert.deepEqual(updated.models, man.models);
    const high = decodePNG(fs.readFileSync(path.join(dir, updated.materials.albedo)));
    const highMobile = await readMobile();
    assert.equal(highMobile.state.tier, "high");
    assert.equal(highMobile.uploads[0].size, 8);
    assert.deepEqual(highMobile.uploads[0].brick, [...high.rgba.subarray(2 * 8 * 8 * 4, 3 * 8 * 8 * 4)],
      "a mobile backend must upload the current high pixels after low is disabled");
    assert.equal(highMobile.requests.some(url => url.endsWith("-4.png")), false);
    const verified = cp.spawnSync(process.execPath, [path.join(ROOT, "tools", "gen", "assets.mjs"), "verify"],
      { env: { ...process.env, APEX_PACK_DIR: dir }, encoding: "utf8", timeout: 10000 });
    assert.equal(verified.status, 0, verified.stderr || verified.stdout);
    assert.match(verified.stdout, /verify: OK/);
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
    .replace(/^const\b/gm, "var"), sandbox, { filename: absSrc("js/track/core/geom.js") });
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
    vm.runInContext(src, sandbox, { filename: absSrc(rel) });
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
      .replace(/^const\b/gm, "var"), sandbox, { filename: absSrc("assets/pack/webbake.js") });

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

test("per-circuit model loads cannot restart pack fetches after unload", async () => {
  const fetched = [];
  const assets = assetLoader({ fetch(url) { fetched.push(url); return packFetch()(url); } });
  await assets.manifest();
  const pending = assets.loadModelsFor('"box"');
  assets.unload();
  assert.equal(await pending, 0, "the cached manifest continuation belongs to the unloaded generation");
  assert.equal(fetched.length, 1, "obsolete work must not refetch the manifest or start a model download");
  assert.equal(assets.state().pack, false);
  assert.equal(assets.modelSync("box"), null);
  assert.equal(await assets.loadModelsFor('"box"'), 1, "a new explicit load can populate the next generation");
  assert.ok(assets.modelSync("box"));
});

test("per-circuit model readiness does not count models unloaded during its wait", async () => {
  const assets = assetLoader({ fetch: packFetch() });
  await assets.model("box");
  const pending = assets.loadModelsFor('"box"');
  // Let the cached manifest resume and join the cached model's promise, then unload.
  await Promise.resolve();
  assets.unload();
  assert.equal(await pending, 0, "readiness cannot report a model from the discarded generation");
  assert.equal(assets.modelSync("box"), null);
});

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

// #3110 F5: a resident v2/v3 model must not pin the fetched buffer. pos and
// idx used to be views onto it, so every quantised byte stayed alive with them.
test("a parsed v2 model owns its arrays: none aliases the fetched buffer (#3110 F5)", async () => {
  const fetched = [];
  const assets = assetLoader({ setTimeout, clearTimeout, fetch: async (url) => {
    const res = await packFetch(null)(url);
    if (!res.arrayBuffer) return res;
    return { ok: true, arrayBuffer: async () => { const b = MODEL_V2(); fetched.push(b); return b; } };
  } });
  const m = await assets.model("box");
  assert.ok(m, "the model parses");
  assert.equal(fetched.length, 1);
  for (const k of ["pos", "nrm", "col", "mat", "idx"]) {
    assert.notEqual(m[k].buffer, fetched[0], k + " must not be a view onto the fetched buffer");
    assert.equal(m[k].buffer.byteLength, m[k].byteLength, k + " owns exactly its own bytes");
  }
  assert.equal(m.pos.length, 9); assert.equal(m.idx.length, 3);
});

test("modelsReady gives up at its cap when the pack hangs, and never rejects on a failing pack", async () => {
  const hung = assetLoader({ setTimeout, clearTimeout, fetch: packFetch(new Promise(() => {})) });
  assert.equal(await hung.modelsReady(20), -1, "a hanging model fetch resolves -1 at the cap");
  hung.unload();
  const broken = assetLoader({ setTimeout, clearTimeout, async fetch() { throw Error("offline"); } });
  assert.equal(await broken.modelsReady(1000), 0, "a failing manifest resolves 0 at once, not a rejection");
});

function assetRequestClock() {
  let next = 0;
  const timers = new Map();
  return {
    setTimeout(fn, ms) {
      const id = ++next;
      if (ms === 0) setImmediate(fn);  // decode admission still gets a real task
      else timers.set(id, { fn, ms });
      return id;
    },
    clearTimeout(id) { timers.delete(id); },
    fire(ms) {
      const due = [...timers].filter(([, value]) => value.ms === ms);
      assert.ok(due.length, `a ${ms}ms timer must be owned by this request/waiter`);
      for (const [id, value] of due) { timers.delete(id); value.fn(); }
    },
    pending() { return timers.size; },
  };
}

test("shared model fetch and body deadlines settle stalled work and permit both readiness routes to retry", async () => {
  for (const phase of ["fetch", "body"]) for (const source of [undefined, 'bakedModel("box")']) {
    const clock = assetRequestClock(), stalled = deferredAssetDownload();
    let transfers = 0, signal;
    const assets = assetLoader({ ...clock, AbortController,
      fetch: async (url, opts) => {
        if (url.endsWith("manifest.json")) return { ok: true, json: async () => ({ models: { box: { file: "box.bin" } } }) };
        transfers++;
        if (transfers > 1) return { ok: true, arrayBuffer: async () => MODEL_V2() };
        signal = opts.signal;
        return phase === "fetch" ? stalled.promise : { ok: true, arrayBuffer: () => stalled.promise };
      },
    });
    const first = assets.model("box");
    const short = assets.modelsReady(4000, source), patient = assets.modelsReady(20000, source);
    await new Promise(setImmediate);
    assert.equal(transfers, 1);
    clock.fire(4000); assert.equal(await short, -1);
    assert.equal(signal.aborted, false, "one caller's timeout cannot abort shared healthy work");
    clock.fire(15000);
    assert.equal(await first, null, `${phase} deadline settles even a transport that ignores abort`);
    assert.equal(await patient, 0);
    assert.equal(signal.aborted, true);
    assert.equal(await assets.modelsReady(4000, source), 1, "a later build starts a fresh transfer");
    assert.equal(transfers, 2);
    const resident = assets.modelSync("box");
    const late = MODEL_V2(); new DataView(late).setFloat32(20, 999, true);
    stalled.resolve(phase === "fetch" ? { ok: true, arrayBuffer: async () => late } : late);
    await new Promise(setImmediate);
    assert.strictEqual(assets.modelSync("box"), resident, "late timed-out bytes cannot replace the successful retry");
    assert.equal(resident.pos[0], 0);
    assert.equal(clock.pending(), 0, "every completed request/waiter releases its timer");
  }
});

test("a short model waiter leaves a shared healthy request alive for its remaining callers", async () => {
  const clock = assetRequestClock(), body = deferredAssetDownload();
  let signal, transfers = 0;
  const assets = assetLoader({ ...clock, AbortController, fetch: async (url, opts) => {
    if (url.endsWith("manifest.json")) return { ok: true, json: async () => ({ models: { box: { file: "box.bin" } } }) };
    transfers++; signal = opts.signal;
    return { ok: true, arrayBuffer: () => body.promise };
  } });
  const first = assets.model("box"), short = assets.modelsReady(4000, '"box"');
  await new Promise(setImmediate);
  clock.fire(4000); assert.equal(await short, -1);
  assert.strictEqual(assets.model("box"), first);
  body.resolve(MODEL_V2());
  assert.ok(await first);
  assert.equal(signal.aborted, false);
  assert.equal(transfers, 1);
  assert.equal(clock.pending(), 0);
});

test("a stalled manifest fetch or JSON body releases its memo and permits a fresh model request", async () => {
  for (const phase of ["fetch", "body"]) {
    const clock = assetRequestClock(), stalled = deferredAssetDownload();
    let manifests = 0;
    // No AbortController: the owned deadline must still settle the consumer.
    const assets = assetLoader({ ...clock, fetch: async (url) => {
      if (!url.endsWith("manifest.json")) return { ok: true, arrayBuffer: async () => MODEL_V2() };
      manifests++;
      if (manifests > 1) return { ok: true, json: async () => ({ models: { box: { file: "box.bin" } } }) };
      return phase === "fetch" ? stalled.promise : { ok: true, json: () => stalled.promise };
    } });
    const first = assets.model("box"); await new Promise(setImmediate);
    clock.fire(15000); assert.equal(await first, null);
    assert.equal(await assets.modelsReady(4000, '"box"'), 1);
    assert.equal(manifests, 2);
    const old = { models: { obsolete: { file: "obsolete.bin" } } };
    stalled.resolve(phase === "fetch" ? { ok: true, json: async () => old } : old);
    await new Promise(setImmediate);
    assert.deepEqual(Array.from(assets.models()), ["box"], "late expired JSON cannot repopulate the manifest");
    assert.equal(clock.pending(), 0);
  }
});

test("unload cancels request ownership without clearing a newer model memo or accepting late bytes", async () => {
  const clock = assetRequestClock(), old = deferredAssetDownload(), fresh = deferredAssetDownload();
  let transfers = 0, oldSignal;
  const assets = assetLoader({ ...clock, AbortController, fetch: async (url, opts) => {
    if (url.endsWith("manifest.json")) return { ok: true, json: async () => ({ models: { box: { file: "box.bin" } } }) };
    transfers++;
    if (transfers === 1) oldSignal = opts.signal;
    return { ok: true, arrayBuffer: () => transfers === 1 ? old.promise : fresh.promise };
  } });
  const prior = assets.model("box"); await new Promise(setImmediate);
  assets.unload();
  const next = assets.model("box"); await new Promise(setImmediate);
  assert.equal(await prior, null); assert.equal(oldSignal.aborted, true);
  old.resolve(MODEL_V2()); await new Promise(setImmediate);
  assert.strictEqual(assets.model("box"), next, "old cleanup never deletes the replacement memo");
  assert.equal(assets.modelSync("box"), null);
  fresh.resolve(MODEL_V2()); assert.ok(await next);
  assert.equal(transfers, 2); assert.equal(clock.pending(), 0);
});

test("a stalled optional normal fetch or body expires while the albedo pack still uploads", async () => {
  for (const phase of ["fetch", "body"]) {
    const clock = assetRequestClock(), stalled = deferredAssetDownload();
    let normalSignal, installed;
    const assets = assetLoader({ ...clock, AbortController,
      fetch: async (url, opts) => {
        if (url.endsWith("manifest.json")) return { ok: true, json: async () => ({ materials: {
          size: 1, albedo: "a.png", normal: "n.png", layers: [{ mat: 1, scale: 1 }],
        } }) };
        if (url.endsWith("a.png")) return { ok: true, blob: async () => ({ size: 10 }) };
        normalSignal = opts.signal;
        return phase === "fetch" ? stalled.promise : { ok: true, blob: () => stalled.promise };
      },
      createImageBitmap: async () => ({ close() {} }),
    });
    assets.init({ createTextureArray: () => ({}), setMaterialMaps(maps) { installed = maps; } });
    const load = assets.load(); await new Promise(setImmediate);
    clock.fire(15000);
    assert.equal(await load, true, phase);
    assert.ok(installed.albedo); assert.equal(installed.normal, null);
    assert.equal(normalSignal.aborted, true);
    assert.equal(assets.state().bytes, 10);
    stalled.resolve(phase === "fetch" ? { ok: true, blob: async () => ({ size: 20 }) } : { size: 20 });
    await new Promise(setImmediate);
    assert.equal(assets.state().bytes, 10, "late optional bytes cannot modify completed pack accounting");
    assert.equal(clock.pending(), 0);
  }
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
        LAZY_RACE: [], LAZY_RACE_SESSION: [], LAZY_TRACK_BUILD: [], LAZY_TRACK_BUILD_EDGES: [],
        LAZY_AUDIO: [], LAZY_DATA: [], LAZY_NET: [],
        SCENERY_DIR: "js/circuits/scenery" },
      Tracks: { LIST: [def], circuitPayloadResident: () => true },
      TrackScenery: mode === "resident" ? { monza: scenery } : {},
      TrackBuildProps: { build() {} }, TrackModels: {}, TrackHiddenFaces: {},
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

test("glTF supplied normals match transformed triangle normals for rotations, nonuniform scale and parents", () => {
  const ctx = vm.createContext({ ArrayBuffer, DataView, Uint8Array, Float32Array, Uint16Array, Uint32Array, TextDecoder, Log: { enabled: () => false } });
  const source = fs.readFileSync(path.join(ROOT, "js/render/shared/gltf.js"), "utf8");
  ctx.normalMatrixCalls = 0;
  const gltf = vm.runInContext(source.replace("function normalMatrix(m) {", "function normalMatrix(m) { normalMatrixCalls++;") + ";GLTF", ctx, { filename: absSrc("js/render/shared/gltf.js") });
  // Frozen pre-hoist arithmetic: compare complete Float32 output bit-for-bit,
  // including the old singular fallback and signed coefficients.
  function normalOracle(m, n) {
    const a = m[0], b = m[1], c = m[2], d = m[4], e = m[5], f = m[6], g = m[8], h = m[9], i = m[10];
    const det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
    if (Math.abs(det) < 1e-12) return [a * n[0] + d * n[1] + g * n[2], b * n[0] + e * n[1] + h * n[2], c * n[0] + f * n[1] + i * n[2]];
    const id = 1 / det;
    const c00 = (e * i - f * h) * id, c01 = (f * g - d * i) * id, c02 = (d * h - e * g) * id;
    const c10 = (c * h - b * i) * id, c11 = (a * i - c * g) * id, c12 = (b * g - a * h) * id;
    const c20 = (b * f - c * e) * id, c21 = (c * d - a * f) * id, c22 = (a * e - b * d) * id;
    return [c00 * n[0] + c10 * n[1] + c20 * n[2], c01 * n[0] + c11 * n[1] + c21 * n[2], c02 * n[0] + c12 * n[1] + c22 * n[2]];
  }
  const oracleSource = source.replace(/const nx = normals\[i \* 3\], ny = normals\[i \* 3 \+ 1\], nz = normals\[i \* 3 \+ 2\];[\s\S]*?nrm\[o\] = x \/ l; nrm\[o \+ 1\] = y \/ l; nrm\[o \+ 2\] = z \/ l;/, `
    const n = normalOracle(world, [normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2]]);
    const l = (Math.hypot(n[0], n[1], n[2]) || 1) * nSign;
    nrm[o] = n[0] / l; nrm[o + 1] = n[1] / l; nrm[o + 2] = n[2] / l;`);
  assert.notEqual(oracleSource, source, "oracle substitution must reach the supplied-normal emission");
  const oracle = vm.runInNewContext(oracleSource + ";GLTF", { ArrayBuffer, DataView, Uint8Array, Float32Array, Uint16Array, Uint32Array, TextDecoder, normalOracle, Log: { enabled: () => false } }, { filename: absSrc("js/render/shared/gltf.js") });
  const glb = (nodes, supplied) => {
    const bin = Buffer.from(new Float32Array([0,0,0, 1,0,0, 0,1,1, 0,-Math.SQRT1_2,Math.SQRT1_2, 0,-Math.SQRT1_2,Math.SQRT1_2, 0,-Math.SQRT1_2,Math.SQRT1_2]).buffer);
    const json = { asset: { version: "2.0" }, buffers: [{ byteLength: bin.length }],
      bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }, { buffer: 0, byteOffset: 36, byteLength: 36 }],
      accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3" }, { bufferView: 1, componentType: 5126, count: 3, type: "VEC3" }],
      meshes: [{ primitives: [{ attributes: supplied ? { POSITION: 0, NORMAL: 1 } : { POSITION: 0 } }] }], nodes, scenes: [{ nodes: [0] }], scene: 0 };
    const j = Buffer.from(JSON.stringify(json)), padded = Buffer.concat([j, Buffer.alloc((4 - j.length % 4) % 4, 32)]);
    const out = Buffer.alloc(28 + padded.length + bin.length);
    out.writeUInt32LE(0x46546c67, 0); out.writeUInt32LE(2, 4); out.writeUInt32LE(out.length, 8);
    out.writeUInt32LE(padded.length, 12); out.writeUInt32LE(0x4e4f534a, 16); padded.copy(out, 20);
    out.writeUInt32LE(bin.length, 20 + padded.length); out.writeUInt32LE(0x004e4942, 24 + padded.length); bin.copy(out, 28 + padded.length);
    return out.buffer.slice(out.byteOffset, out.byteOffset + out.length);
  };
  const cases = [
    [{ mesh: 0, rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] }],
    [{ mesh: 0, rotation: [0, Math.sin(.3), 0, Math.cos(.3)], scale: [2, .5, 3] }],
    [{ rotation: [0, 0, Math.sin(.35), Math.cos(.35)], scale: [1, 2, .7], children: [1] },
      { mesh: 0, rotation: [Math.sin(.2), 0, 0, Math.cos(.2)], scale: [2, .5, 3] }],
  ];
  for (const nodes of cases) {
    const before = ctx.normalMatrixCalls;
    const supplied = gltf.toMesh(glb(nodes, true));
    assert.equal(ctx.normalMatrixCalls - before, 1, "one coefficient calculation for the instance's three normals");
    const geometric = gltf.toMesh(glb(nodes, false));
    assert.equal(ctx.normalMatrixCalls - before, 1, "generated normals never compute an unused matrix");
    assert.deepEqual(Array.from(supplied.pos), Array.from(geometric.pos));
    for (let i = 0; i < supplied.nrm.length; i += 3) {
      const dot = supplied.nrm[i] * geometric.nrm[i] + supplied.nrm[i+1] * geometric.nrm[i+1] + supplied.nrm[i+2] * geometric.nrm[i+2];
      assert.ok(dot > .999999, "supplied normal must face the transformed triangle: " + dot);
    }
  }
  const equivalenceCases = cases.concat([
    [{ mesh: 0, rotation: [0, Math.sin(.3), 0, Math.cos(.3)], scale: [-2, .5, 3] }],
    [{ mesh: 0, scale: [0, 2, 3] }],
    [{ mesh: 0, scale: [1e-14, 1, 1] }],
    [{ mesh: 0, scale: [1e-10, 1, 1] }],
  ]);
  for (const nodes of equivalenceCases) for (const scale of [1, -2]) {
    const bytes = glb(nodes, true), actual = gltf.toMesh(bytes, { scale }), previous = oracle.toMesh(bytes, { scale });
    for (const field of ["pos", "nrm", "col", "idx"]) {
      assert.deepEqual(Buffer.from(actual[field].buffer), Buffer.from(previous[field].buffer),
        `${field} must exactly match pre-hoist arithmetic at scale ${scale}`);
    }
  }
});

test("asset decode fallback yields a task between layers and unload during the yield cannot upload", async () => {
  for (const cancel of [false, true]) {
    const tasks = [], events = [], closed = []; let uploads = 0, microtasks = 0;
    const assets = assetLoader({
      queueMicrotask(fn) { microtasks++; queueMicrotask(fn); },
      setTimeout(fn) { tasks.push(fn); return tasks.length; },
      fetch: async (url) => url.endsWith("manifest.json")
        ? { ok: true, json: async () => ({ materials: { size: 1, albedo: "albedo.png", layers: [{ mat: 1, scale: 1 }, { mat: 2, scale: 1 }] } }) }
        : { ok: true, blob: async () => ({ size: 2 }) },
      createImageBitmap: async (_, x, y) => { events.push("decode" + y); return { close() { closed.push(y); } }; },
    });
    assets.init({ createTextureArray() { uploads++; return {}; }, setMaterialMaps() {} });
    const pending = assets.load();
    await new Promise(setImmediate);
    assert.deepEqual(events, ["decode1"]);
    assert.equal(tasks.length, 1, "the next decode waits on a future task, even with queueMicrotask present");
    if (cancel) assets.unload();
    tasks.shift()();
    assert.equal(await pending, !cancel);
    assert.deepEqual(events, cancel ? ["decode1"] : ["decode1", "decode2"], "obsolete layers are not decoded");
    assert.equal(microtasks, 0, "microtasks cannot give rendering a turn");
    assert.equal(uploads, cancel ? 0 : 1);
    assert.deepEqual(closed.sort(), cancel ? [1] : [1, 2], "all decoded bitmap owners are released once");
  }
});


test("readback destination ownership is local across sync, overlapping async, failure and unload", async () => {
  for (const waitFails of [false, true]) {
    const tasks = [], mock = makeAsyncGl({ busyPolls: 2, waitFails });
    const sandbox = { setTimeout(fn) { tasks.push(fn); }, OffscreenCanvas: class { getContext() { return mock.gl; } } };
    sandbox.window = sandbox; vm.createContext(sandbox); seedLog(sandbox);
    // Inspect module roots without exporting a production diagnostic surface.
    const src = fs.readFileSync(path.join(ROOT,"js/render/shared/assets.js"),"utf8");
    vm.runInContext(src.replace("return { init, supported,", "return { scratchForTest: () => _scratchGl, init, supported,"),sandbox);
    const a = sandbox.Assets, n = MAT_N, size = 2, data = new Uint8Array(size*size*4*n);
    const images = []; images[1] = layerImage(1,size);
    assert.deepEqual([...a.readLayerBytes(size,images,n,data)],[1]);
    const owns = (buffer) => Object.values(a.scratchForTest()).some((v) => ArrayBuffer.isView(v) && v.buffer === buffer);
    assert.equal(owns(data.buffer),false,"session scratch context must not root a completed sync destination");
    const x = new Uint8Array(data.length), y = new Uint8Array(data.length);
    const first = a.readLayerBytesAsync(size,images,n,x);
    const images2 = []; images2[1] = layerImage(2,size);
    const second = a.readLayerBytesAsync(size,images2,n,y);
    a.unload();
    assert.equal(owns(x.buffer),false); assert.equal(owns(y.buffer),false,"in-flight local views are not session roots");
    while(tasks.length) tasks.shift()();
    assert.deepEqual([...await first],waitFails?[]:[1]); assert.deepEqual([...await second],waitFails?[]:[1]);
    if (!waitFails) {
      assert.deepEqual([...x.slice(size*size*4,size*size*8)],[...layerImage(1,size).pixels(size,size)]);
      assert.deepEqual([...y.slice(size*size*4,size*size*8)],[...layerImage(2,size).pixels(size,size)],"concurrent readback must not redirect earlier output");
    }
    assert.equal(owns(x.buffer),false);assert.equal(owns(y.buffer),false);
    assert.equal(mock.ops.filter(([op])=>op==="deleteBuffer").length,2);
    assert.equal(mock.ops.filter(([op])=>op==="deleteSync").length,2);
  }
});

test("obsolete Safari fallback stops at a layer task and closes both crop and full-strip owners", async () => {
  const tasks=[], bitmaps=[], calls=[]; const blob={size:1}; let maps=0, uploads=0;
  const assets=assetLoader({
    setTimeout(fn){tasks.push(fn);},
    fetch:async(url)=>url.endsWith("manifest.json")?{ok:true,json:async()=>({materials:{size:1,albedo:"a",layers:[{mat:1,scale:1},{mat:2,scale:1},{mat:3,scale:1}]}})}:{ok:true,blob:async()=>blob},
    async createImageBitmap(source,...args){
      calls.push(source===blob?(args.length>1?"blob-crop":"full"):"fallback-crop");
      if(source===blob&&args.length>1)throw Error("Safari crop unsupported");
      const b={closed:0,close(){this.closed++;}};bitmaps.push(b);return b;
    },
  });
  assets.init({createTextureArray(){uploads++;return{};},setMaterialMaps(v){if(v)maps++;}});
  const pending=assets.load();await new Promise(setImmediate);
  assert.deepEqual(calls,["blob-crop","full","fallback-crop"]);
  assets.unload();tasks.shift()();
  assert.equal(await pending,false);assert.equal(uploads,0);assert.equal(maps,0);
  assert.deepEqual(calls,["blob-crop","full","fallback-crop"],"cancellation neither decodes another layer nor retries the full strip");
  assert.deepEqual(bitmaps.map(b=>b.closed),[1,1]);
});


test("model decode lane paces ready bodies, shares duplicates, and survives failures and unload", async () => {
  const tasks = [], events = [], fetched = [];
  let assets;
  class ParseView extends DataView {
    constructor(buf) {
      super(buf); events.push("parse");
      if (buf.byteLength === 1) throw new RangeError("decode failed");
    }
  }
  assets = assetLoader({ DataView: ParseView,
    setTimeout(fn) { events.push("task"); tasks.push(fn); },
    fetch: async (url) => {
      if (/manifest\.json$/.test(url)) return { ok: true, json: async () => ({ models: {
        a: { file: "a.bin" }, b: { file: "b.bin" }, c: { file: "c.bin" },
      } }) };
      fetched.push(url);
      return { ok: true, arrayBuffer: async () => url.endsWith("a.bin") ? new ArrayBuffer(1) : MODEL_V2() };
    },
  });
  const a = assets.model("a"), b = assets.model("b"), c = assets.model("c");
  assert.strictEqual(assets.model("b"), b, "duplicate callers share one request and decode");
  await new Promise(setImmediate);
  assert.equal(fetched.length, 3, "all downloads start before parsing is admitted");
  assert.deepEqual(events, ["task"]);
  tasks.shift()(); await new Promise(setImmediate);
  assert.equal(await a, null, "malformed decode settles without blocking the lane");
  assert.deepEqual(events, ["task", "parse", "task"]);
  tasks.shift()(); await new Promise(setImmediate);
  assert.ok(await b);
  assert.deepEqual(events, ["task", "parse", "task", "parse", "task"]);
  assets.unload();
  tasks.shift()();
  assert.equal(await c, null, "unload during admission prevents obsolete parsing");
  assert.equal(events.filter(e => e === "parse").length, 2);
  assert.equal(assets.modelSync("b"), null);
  const fresh = assets.model("c");
  await new Promise(setImmediate);
  tasks.shift()();
  assert.ok(await fresh, "fresh generation runs after canceled jobs");
});


test("model admission tail drops decoded payloads across cache generations", async () => {
  // Expose the existing admission promise without changing its scheduling or
  // parser. Its fulfilled value would otherwise retain arrays after unload.
  const source = fs.readFileSync(path.join(ROOT, "js/render/shared/assets.js"), "utf8")
    .replace("return { init,", "return { decodeTail: () => _modelDecodeTail, init,");
  let downloads = 0;
  const assets = vm.runInNewContext(source + ";Assets", { fetch: async (url) => {
    if (/manifest\.json$/.test(url)) return { ok: true, json: async () => ({ models: { box: { file: "box.bin" } } }) };
    downloads++;
    return { ok: true, arrayBuffer: async () => MODEL_V2() };
  } });
  const first = await assets.model("box");
  assert.ok(first.pos.length, "first generation actually decoded a payload");
  assert.strictEqual(assets.modelSync("box"), first);
  assert.equal(await assets.decodeTail(), null, "fulfilled admission state owns no decoded payload");
  assets.unload();
  assert.equal(assets.modelSync("box"), null);
  assert.equal(await assets.decodeTail(), null, "unload leaves no payload in the queue tail");
  const second = await assets.model("box");
  assert.ok(second.pos.length); assert.notStrictEqual(second, first);
  assert.equal(downloads, 2, "next generation obtains its own model");
  assert.equal(await assets.decodeTail(), null);
});

// ---------------------------------------------------------------------------
// Pack hygiene (front half, adjacent to #4028 — does not touch the GPU load
// path). data/packs/model-index.json classifies every committed model key;
// js/assets/pack-index.mjs prunes a remembered apex26.packIndex-shaped object
// against a live manifest so dead keys / stale md5s cannot linger.
// ---------------------------------------------------------------------------
const ROLE_INDEX_PATH = path.join(ROOT, "data", "packs", "model-index.json");
const { pruneRememberedIndex, rememberPayload, diffRoleIndex } =
  await import(pathToFileURL(path.join(ROOT, "js/assets/pack-index.mjs")).href);

function sceneryPlacedModelIds() {
  const ids = new Set();
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".js")) {
        for (const line of fs.readFileSync(p, "utf8").split("\n")) {
          if (/^\s*\/\//.test(line) || /^\s*\*/.test(line)) continue;
          for (const m of line.matchAll(/bakedModel\(\s*["']([^"']+)["']/g)) ids.add(m[1]);
        }
      }
    }
  };
  walk(path.join(ROOT, "js", "circuits"));
  return ids;
}

test("pruneRememberedIndex drops dead keys, md5 mismatches, and junk fields", () => {
  const live = {
    models: {
      keep: { file: "models/keep.bin", md5: "a".repeat(32) },
      renamed: { file: "models/renamed.bin", md5: "b".repeat(32) },
    },
  };
  const remembered = {
    version: 99,
    extra: true,
    models: {
      keep: { file: "models/keep.bin", md5: "a".repeat(32) },
      gone: { file: "models/gone.bin", md5: "c".repeat(32) },
      renamed: { file: "models/old.bin", md5: "b".repeat(32) },
      staleHash: { file: "models/keep.bin", md5: "d".repeat(32) },
      bad: { file: "models/keep.bin", md5: "not-an-md5" },
    },
  };
  assert.deepEqual(pruneRememberedIndex(remembered, live), {
    models: { keep: { file: "models/keep.bin", md5: "a".repeat(32) } },
  });
  assert.deepEqual(pruneRememberedIndex(null, live), { models: {} });
  assert.deepEqual(pruneRememberedIndex(remembered, null), { models: {} });
});

test("rememberPayload keeps only content-addressed model rows", () => {
  const live = {
    models: {
      ok: { file: "models/ok.bin", md5: "e".repeat(32), verts: 3 },
      noMd5: { file: "models/x.bin" },
      badMd5: { file: "models/y.bin", md5: "zz" },
    },
  };
  assert.deepEqual(rememberPayload(live), {
    models: { ok: { file: "models/ok.bin", md5: "e".repeat(32) } },
  });
  assert.deepEqual(
    pruneRememberedIndex(rememberPayload(live), live).models.ok,
    live.models.ok && { file: live.models.ok.file, md5: live.models.ok.md5 },
  );
});

test("data/packs/model-index.json covers every committed model key once",
  { skip: !hasPack && "no pack installed" }, () => {
  assert.ok(fs.existsSync(ROLE_INDEX_PATH), "data/packs/model-index.json missing");
  const roleIndex = JSON.parse(fs.readFileSync(ROLE_INDEX_PATH, "utf8"));
  assert.equal(roleIndex.version, 1);
  assert.deepEqual(roleIndex.roles, ["placed", "kit_catalog", "nature_bake"]);
  const diff = diffRoleIndex(roleIndex, manifest, roleIndex.roles);
  assert.deepEqual(diff.indexOnly, [], "index lists keys the manifest dropped");
  assert.deepEqual(diff.liveOnly, [], "manifest grew keys the role index misses");
  assert.deepEqual(diff.badRole, [], "every index row needs a known role");
});

test("placed role keys are the scenery bakedModel literals; catalog keys are not placed",
  { skip: !hasPack && "no pack installed" }, () => {
  const roleIndex = JSON.parse(fs.readFileSync(ROLE_INDEX_PATH, "utf8"));
  const placed = sceneryPlacedModelIds();
  const indexedPlaced = Object.entries(roleIndex.models)
    .filter(([, rec]) => rec.role === "placed")
    .map(([id]) => id)
    .sort();
  assert.deepEqual(indexedPlaced, [...placed].filter((id) => manifest.models[id]).sort(),
    "placed role must match non-comment bakedModel(\"…\") ids that exist in the pack");
  for (const id of placed) {
    assert.ok(manifest.models[id], `scenery places unknown pack key "${id}"`);
    assert.equal(roleIndex.models[id].role, "placed", `${id} is placed in scenery`);
  }
  for (const [id, rec] of Object.entries(roleIndex.models)) {
    if (rec.role === "placed") continue;
    assert.equal(placed.has(id), false,
      `${id} is role ${rec.role} but scenery still calls bakedModel("${id}")`);
  }
});

test("pack models/ has no orphan bins outside the manifest index",
  { skip: !hasPack && "no pack installed" }, () => {
  const dir = path.join(PACK, "models");
  const keyed = new Set(Object.values(manifest.models || {}).map((rec) => path.basename(rec.file)));
  const orphans = fs.readdirSync(dir).filter((f) => f.endsWith(".bin") && !keyed.has(f));
  assert.deepEqual(orphans, [], "orphan bins are dead pack weight — drop or register them");
});
