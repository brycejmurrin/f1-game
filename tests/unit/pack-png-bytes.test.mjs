// pack-png-bytes — the material strips decode to their stored bytes with no GPU (perf hunt 6, B·H6, 2026-10-20).
//
// TLX and WGX used to turn every ImageBitmap layer back into bytes through a scratch WebGL2 upload + readPixels,
// whose getError() round trips wait on the whole GPU process: the macOS census measured a 3726 ms rAF gap 9 s into
// a WGX race (vegas night, run 39451254370: 3657 ms of long task, getError 3505 ms) and 1113 ms on TLX-WebGPU at
// monaco (run 39449331814). Assets now inflates the strip's IDAT with DecompressionStream and undoes the PNG
// filters itself, handing every backend Uint8Array layers — the form GLX texSubImage3D, readLayerBytes(Async) and
// WGX writeTexture already take, so no scratch context is created at all.
//
// The bytes must be the ones the readback produced: straight (un-premultiplied), not colour-managed. sharp
// (libvips/libspng, an independent decoder) decodes the same shipped PNG here, and every layer must match it
// byte for byte, for both tiers and both strips. The fallbacks keep today's path: a missing
// DecompressionStream, a PNG this reader does not take (a colour tag, a palette).
//
// Run: node --test tests/unit/pack-png-bytes.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { seedLog } from "../helpers/seed-log.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

const require = createRequire(import.meta.url);
const sharp = require("sharp");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PACK = path.join(ROOT, "assets", "pack");
const SRC = fs.readFileSync(path.join(ROOT, "js/render/shared/assets.js"), "utf8");
const MAT_N = +/const MAT_LAYERS = (\d+);/.exec(SRC)[1];
const manifest = JSON.parse(fs.readFileSync(path.join(PACK, "manifest.json"), "utf8"));

// A loader over the real assets.js: fetch serves the shipped pack from disk, createImageBitmap counts calls
// (it must not be reached on the bytes path), and the backend records what createTextureArray was handed.
function loader({ ls = {}, decompress = true, files = {}, stream = DecompressionStream, byteArray = Uint8Array } = {}) {
  const calls = { bitmaps: 0, uploads: [] };
  const sandbox = {
    Blob, TextDecoder, DataView, Uint8Array: byteArray, ArrayBuffer, Promise, setTimeout,
    localStorage: { getItem: (k) => (k in ls ? ls[k] : null), setItem() {}, removeItem() {} },
    async fetch(url) {
      const name = url.split("?")[0].split("/").pop();   // pack URLs carry ?h=<md5> (L3)
      if (name === "manifest.json") return { ok: true, json: async () => manifest };
      const bytes = name in files ? files[name] : fs.readFileSync(path.join(PACK, name));
      return { ok: true, blob: async () => new Blob([bytes]) };
    },
    async createImageBitmap(_blob, ...crop) { calls.bitmaps++; return { crop, close() {} }; },
  };
  if (decompress) sandbox.DecompressionStream = stream;
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  seedLog(sandbox);
  vm.runInContext(SRC, sandbox, { filename: absSrc("js/render/shared/assets.js") });
  const A = sandbox.Assets;
  A.init({
    createTextureArray(size, images, layers) { calls.uploads.push({ size, images, layers }); return { size }; },
    setMaterialMaps() {}, freeTexture() {},
  });
  return { A, calls };
}
async function sharpLayers(file, size) {
  const { data, info } = await sharp(path.join(PACK, file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.channels, 4);
  assert.equal(info.width, size);
  const page = size * size * 4;
  return (i) => data.subarray(i * page, (i + 1) * page);
}

for (const tier of ["high", "low"]) {
  test(`the shipped ${tier} strips decode to sharp's bytes, layer for layer, without createImageBitmap or a GL readback`, async () => {
    const v = tier === "low" ? manifest.materials.low : manifest.materials;
    const { A, calls } = loader();
    assert.equal(await A.load({ tier }), true, "the pack loads");
    assert.equal(calls.bitmaps, 0, "no ImageBitmap decode on the bytes path");
    assert.equal(calls.uploads.length, v.normal ? 2 : 1);
    const files = [v.albedo, v.normal].filter(Boolean);
    const present = new Set((v.layers || []).filter((L) => L.scale > 0 && L.mat > 0 && L.mat < MAT_N).map((L) => L.mat));
    for (let k = 0; k < files.length; k++) {
      const ref = await sharpLayers(files[k], v.size), up = calls.uploads[k];
      assert.equal(up.size, v.size);
      assert.equal(up.layers, MAT_N);
      for (let i = 0; i < MAT_N; i++) {
        if (!present.has(i)) { assert.equal(up.images[i], undefined, `${files[k]} layer ${i}: absent stays absent`); continue; }
        const got = up.images[i];
        assert.ok(ArrayBuffer.isView(got) && got.BYTES_PER_ELEMENT === 1, `${files[k]} layer ${i}: a byte layer`);
        assert.equal(got.length, v.size * v.size * 4);
        assert.ok(Buffer.from(got.buffer, got.byteOffset, got.length).equals(ref(i)), `${files[k]} layer ${i}: byte-identical to sharp`);
      }
    }
    assert.equal(SRC.includes("_ensureScratchGl(size)"), true, "the readback path still exists for other layer forms");
  });
}

// A minimal 8-bit RGBA PNG strip (size x size*layers) with the given filter per row and optional extra chunks.
function makePng(size, layers, { filter = (r) => r % 5, extra = [], colorType = 6 } = {}) {
  const w = size, h = size * layers, stride = w * 4;
  const img = Buffer.alloc(h * stride);
  for (let i = 0; i < img.length; i++) img[i] = (i * 37 + (i >> 5) * 11) & 255;
  const raw = Buffer.alloc(h * (stride + 1));
  for (let r = 0; r < h; r++) {
    const ft = filter(r), o = r * stride, s = r * (stride + 1);
    raw[s] = ft;
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? img[o + x - 4] : 0, b = r ? img[o - stride + x] : 0, c = x >= 4 && r ? img[o - stride + x - 4] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const pred = ft === 0 ? 0 : ft === 1 ? a : ft === 2 ? b : ft === 3 ? (a + b) >> 1 : (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      raw[s + 1 + x] = (img[o + x] - pred) & 255;
    }
  }
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcT[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => {
    const t = Buffer.from(type, "latin1"), len = Buffer.alloc(4), cr = Buffer.alloc(4);
    len.writeUInt32BE(data.length); cr.writeUInt32BE(crc(Buffer.concat([t, data])));
    return Buffer.concat([len, t, data, cr]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = colorType;
  const z = zlib.deflateSync(raw);
  // Split the stream over two IDAT chunks, as encoders do for big images.
  const half = z.length >> 1;
  return { png: Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), ...extra.map(([t, d]) => chunk(t, d)),
    chunk("IDAT", z.subarray(0, half)), chunk("IDAT", z.subarray(half)), chunk("IEND", Buffer.alloc(0))]), img, raw };
}
function syntheticManifest(size) {
  return { materials: { size, albedo: "a.png", layers: [{ mat: 1, scale: 1 }, { mat: 3, scale: 2 }] } };
}

test("every PNG filter type (none/sub/up/average/paeth), split IDATs and an ancillary text chunk decode exactly", async () => {
  const size = 8;
  const { png, img } = makePng(size, MAT_N, { extra: [["tEXt", Buffer.from("Software\0bake")]] });
  const saved = manifest.materials;
  manifest.materials = syntheticManifest(size).materials;
  try {
    const { A, calls } = loader({ files: { "a.png": png } });
    assert.equal(await A.load(), true);
    assert.equal(calls.bitmaps, 0);
    const page = size * size * 4;
    for (const i of [1, 3]) {
      assert.ok(Buffer.from(calls.uploads[0].images[i]).equals(img.subarray(i * page, (i + 1) * page)), `layer ${i}`);
    }
    assert.equal(calls.uploads[0].images[2], undefined);
  } finally { manifest.materials = saved; }
});

// Streams may split between any filter/pixel bytes. Deliver offset views too:
// no chunk-size or fresh-buffer assumption is part of DecompressionStream.
function scriptedStream(raw, stats, { chunkSize = 31, tailError = false, onRead } = {}) {
  return class {
    constructor() {
      let offset = 0;
      this.writable = { getWriter: () => ({ write: async () => { stats.writes++; }, close: async () => { stats.closed = true; } }) };
      this.readable = { getReader: () => ({ read: async () => {
        stats.reads++;
        if (onRead) onRead(stats.reads);
        if (offset === raw.length) {
          if (tailError) throw Error("late deflate checksum failure");
          stats.drained = true; return { done: true };
        }
        const end = Math.min(raw.length, offset + chunkSize);
        const backing = Buffer.concat([Buffer.alloc(3), raw.subarray(offset, end), Buffer.alloc(5)]);
        offset = end;
        return { done: false, value: backing.subarray(3, -5) };
      } }) };
    }
  };
}

test("sparse PNG decode bounds its raw destination to needed rows and drains unused stream bytes", async () => {
  const size = 8, { png, img } = makePng(size, MAT_N), allocations = [];
  class ByteArray extends Uint8Array { constructor(value, ...args) { super(value, ...args); if (typeof value === "number") allocations.push(value); } }
  const saved = manifest.materials;
  manifest.materials = syntheticManifest(size).materials;
  try {
    const { A, calls } = loader({ files: { "a.png": png }, byteArray: ByteArray });
    assert.equal(await A.load(), true);
    assert.equal(calls.bitmaps, 0);
    const page = size * size * 4, neededRows = 4 * size;
    assert.ok(Math.max(...allocations) <= neededRows * (size * 4 + 1), "unused rows cannot require a full inflated image destination");
    for (const i of [1, 3]) assert.ok(Buffer.from(calls.uploads[0].images[i]).equals(img.subarray(i * page, (i + 1) * page)));
  } finally { manifest.materials = saved; }
});

test("fragmented PNG output keeps exact layer bytes and consumes the whole stream after its prefix fills", async () => {
  const size = 8, { png, img, raw } = makePng(size, MAT_N), saved = manifest.materials;
  manifest.materials = syntheticManifest(size).materials;
  try {
    for (const chunkSize of [1, 3, 31, 65]) {
      const stats = { writes: 0, reads: 0 }, { A, calls } = loader({ files: { "a.png": png }, stream: scriptedStream(raw, stats, { chunkSize }) });
      assert.equal(await A.load(), true);
      assert.equal(calls.bitmaps, 0);
      for (const i of [1, 3]) assert.ok(Buffer.from(calls.uploads[0].images[i]).equals(img.subarray(i * size * size * 4, (i + 1) * size * size * 4)));
      assert.equal(stats.reads, Math.ceil(raw.length / chunkSize) + 1, "the decoder drains even unused trailing rows");
      assert.equal(stats.drained, true); assert.equal(stats.closed, true); assert.equal(stats.writes, 2);
    }
  } finally { manifest.materials = saved; }
});

test("raw destination allocation failure falls back before starting a decompression stream", async () => {
  const size = 8, { png, raw } = makePng(size, MAT_N), saved = manifest.materials;
  const needed = 4 * size * (size * 4 + 1), stats = { constructed: 0, writes: 0, reads: 0 };
  class ByteArray extends Uint8Array {
    constructor(value, ...args) {
      if (value === needed) throw new RangeError("injected raw destination allocation failure");
      super(value, ...args);
    }
  }
  class Stream extends scriptedStream(raw, stats) {
    constructor() { super(); stats.constructed++; }
  }
  manifest.materials = syntheticManifest(size).materials;
  try {
    const { A, calls } = loader({ files: { "a.png": png }, stream: Stream, byteArray: ByteArray });
    assert.equal(await A.load(), true);
    assert.equal(calls.bitmaps, 2, "recoverable raw allocation failure keeps bitmap fallback");
    assert.ok(!ArrayBuffer.isView(calls.uploads[0].images[1]));
    assert.equal(stats.constructed, 0, "no stream can be left backpressured by allocation failure");
    assert.equal(stats.writes, 0);
  } finally { manifest.materials = saved; }
});

test("short or late-failing PNG streams keep the ImageBitmap fallback", async () => {
  const size = 8, { png, raw } = makePng(size, MAT_N), saved = manifest.materials;
  manifest.materials = syntheticManifest(size).materials;
  try {
    for (const tailError of [false, true]) {
      const stats = { writes: 0, reads: 0 }, input = tailError ? raw : raw.subarray(0, 4 * size * (size * 4 + 1) - 1);
      const { A, calls } = loader({ files: { "a.png": png }, stream: scriptedStream(input, stats, { tailError }) });
      assert.equal(await A.load(), true);
      assert.equal(calls.bitmaps, 2, "a short prefix or error beyond it cannot publish byte layers");
      assert.ok(!ArrayBuffer.isView(calls.uploads[0].images[1]));
    }
  } finally { manifest.materials = saved; }
});

test("unload during PNG inflation drains but never uploads or starts bitmap fallback", async () => {
  const size = 8, { png, raw } = makePng(size, MAT_N), saved = manifest.materials, stats = { writes: 0, reads: 0 };
  manifest.materials = syntheticManifest(size).materials;
  try {
    let A;
    const loaded = loader({ files: { "a.png": png }, stream: scriptedStream(raw, stats, { onRead: n => { if (n === 1) A.unload(); } }) });
    A = loaded.A;
    assert.equal(await A.load(), false);
    assert.equal(stats.drained, true);
    assert.equal(loaded.calls.uploads.length, 0); assert.equal(loaded.calls.bitmaps, 0);
    assert.equal(A.state().uploaded, false);
  } finally { manifest.materials = saved; }
});

for (const [why, opts, mkPng] of [
  ["no DecompressionStream", { decompress: false }, () => makePng(8, MAT_N).png],
  ["a colour-tagged strip (sRGB chunk: the browser would honour it)", {}, () => makePng(8, MAT_N, { extra: [["sRGB", Buffer.from([0])]] }).png],
  ["a non-RGBA strip (palette colour type)", {}, () => makePng(8, MAT_N, { colorType: 3 }).png],
  ["a corrupt IDAT stream", {}, () => { const b = makePng(8, MAT_N).png; b[60] ^= 0xff; b[61] ^= 0xff; return b; }],
]) {
  test(`falls back to the ImageBitmap decode: ${why}`, async () => {
    const saved = manifest.materials;
    manifest.materials = syntheticManifest(8).materials;
    try {
      const { A, calls } = loader({ ...opts, files: { "a.png": mkPng() } });
      assert.equal(await A.load(), true, "the pack still loads");
      assert.ok(calls.bitmaps > 0, "through createImageBitmap, as before");
      assert.ok(!ArrayBuffer.isView(calls.uploads[0].images[1]), "bitmap layers, not bytes");
    } finally { manifest.materials = saved; }
  });
}
