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
function loader({ ls = {}, decompress = true, files = {} } = {}) {
  const calls = { bitmaps: 0, uploads: [] };
  const sandbox = {
    Blob, TextDecoder, DataView, Uint8Array, ArrayBuffer, Promise, setTimeout,
    localStorage: { getItem: (k) => (k in ls ? ls[k] : null), setItem() {}, removeItem() {} },
    async fetch(url) {
      const name = url.split("/").pop();
      if (name === "manifest.json") return { ok: true, json: async () => manifest };
      const bytes = name in files ? files[name] : fs.readFileSync(path.join(PACK, name));
      return { ok: true, blob: async () => new Blob([bytes]) };
    },
    async createImageBitmap(_blob, ...crop) { calls.bitmaps++; return { crop, close() {} }; },
  };
  if (decompress) sandbox.DecompressionStream = DecompressionStream;
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
    chunk("IDAT", z.subarray(0, half)), chunk("IDAT", z.subarray(half)), chunk("IEND", Buffer.alloc(0))]), img };
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
