// import-models.test.mjs — guards tools/gen/import-models.mjs, the node glTF -> AX26
// batch importer that the "Import CC0 models" GitHub Action runs on the runner.
//
// The two things worth pinning: (1) the AX26 output is exactly what
// js/render/shared/assets.js _parseModel reads, and (2) palette-atlas colour is sampled
// into vertex colour — the step that makes a low-poly import look like the pack
// instead of arriving flat grey.
//
// Run: node --test tests/unit/import-models.test.mjs   (npm run test:tooling)

import { test } from "node:test";
import assert from "node:assert/strict";
import { readAX26, ax26Version } from "../helpers/ax26.mjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import cp from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

function pngRGBA(w, h, rgba) {
  const T = (() => { const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
  const crc = (b) => { let c = -1; for (let i = 0; i < b.length; i++) c = T[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  const chunk = (ty, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const body = Buffer.concat([Buffer.from(ty), d]);
    const cc = Buffer.alloc(4); cc.writeUInt32BE(crc(body)); return Buffer.concat([l, body, cc]); };
  const stride = w * 4, raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) rgba.subarray(y * stride, (y + 1) * stride).copy(raw, y * (stride + 1) + 1);
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10]),
    chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

function buildFixture(dir) {
  fs.mkdirSync(path.join(dir, "textures"), { recursive: true });
  // 2x1 palette: red | green.
  fs.writeFileSync(path.join(dir, "textures", "palette.png"),
    pngRGBA(2, 1, Buffer.from([200, 40, 40, 255, 40, 200, 60, 255])));
  const pos = new Float32Array([0, 0, 0, 2, 0, 0, 0, 4, 0, 3, 0, 0, 5, 0, 0, 3, 4, 0]);
  const nrm = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]);
  const uv = new Float32Array([0.25, 0.5, 0.25, 0.5, 0.25, 0.5, 0.75, 0.5, 0.75, 0.5, 0.75, 0.5]);
  const idxA = new Uint16Array([0, 1, 2]), idxB = new Uint16Array([3, 4, 5]);
  const bin = Buffer.concat([Buffer.from(pos.buffer), Buffer.from(nrm.buffer), Buffer.from(uv.buffer),
    Buffer.from(idxA.buffer), Buffer.from(idxB.buffer)]);
  fs.writeFileSync(path.join(dir, "model.bin"), bin);
  const P = pos.byteLength, N = nrm.byteLength, U = uv.byteLength;
  const gltf = {
    asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [
      { attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: 3, material: 0 },
      { attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: 4, material: 0 }] }],
    materials: [{ pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], baseColorTexture: { index: 0 } } }],
    textures: [{ source: 0 }], images: [{ uri: "textures/palette.png" }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 6, type: "VEC3", min: [0, 0, 0], max: [5, 4, 0] },
      { bufferView: 1, componentType: 5126, count: 6, type: "VEC3" },
      { bufferView: 2, componentType: 5126, count: 6, type: "VEC2" },
      { bufferView: 3, componentType: 5123, count: 3, type: "SCALAR" },
      { bufferView: 4, componentType: 5123, count: 3, type: "SCALAR" }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: P },
      { buffer: 0, byteOffset: P, byteLength: N },
      { buffer: 0, byteOffset: P + N, byteLength: U },
      { buffer: 0, byteOffset: P + N + U, byteLength: 6 },
      { buffer: 0, byteOffset: P + N + U + 6, byteLength: 6 }],
    buffers: [{ uri: "model.bin", byteLength: bin.length }],
  };
  fs.writeFileSync(path.join(dir, "building.gltf"), JSON.stringify(gltf));
}

test("import-models bakes gltf+bin+atlas into AX26 with sampled colours", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "apex-imp-"));
  const src = path.join(tmp, "pack"), out = path.join(tmp, "out");
  fs.mkdirSync(src, { recursive: true }); fs.mkdirSync(out, { recursive: true });
  try {
    buildFixture(src);
    const r = cp.spawnSync(process.execPath,
      [path.join(ROOT, "tools", "gen", "import-models.mjs"), src, "--mat", "CONCRETE", "--height", "12", "--prefix", "q_"],
      { env: { ...process.env, APEX_PACK_DIR: out }, encoding: "utf8" });
    assert.equal(r.status, 0, `importer failed:\n${r.stdout}${r.stderr}`);

    const man = JSON.parse(fs.readFileSync(path.join(out, "manifest.json"), "utf8"));
    assert.ok(man.models.q_building, "model not recorded in manifest");
    assert.equal(man.models.q_building.licence, "CC0");
    assert.ok(man.models.q_building.source, "no source recorded");

    // Read the .bin with the GAME'S reader, not a copy of it — tests/helpers/ax26.mjs.
    const binPath = path.join(out, man.models.q_building.file);
    const hdr = ax26Version(binPath);
    // Two primitives sharing one 6-vertex POSITION accessor, each indexing three
    // of its vertices -> 6 verts, 6 indices, 2 triangles. (Each primitive emits
    // only the vertices it references; copying the accessor whole per primitive
    // gave 12, and 3.4x on the Racing Kit's per-material primitives.)
    assert.equal(hdr.verts, 6); assert.equal(hdr.indices, 6);
    assert.equal(hdr.version, 2, "an imported low-poly mesh must take the packed layout");
    const geo = await readAX26(binPath);
    assert.ok(geo, "the shipped reader must accept what the importer produced");
    const pos = geo.pos, col = geo.col, mat = geo.mat;
    // Local indices in first-use order: primitive A's three, then B's three.
    assert.deepEqual([...geo.idx], [0, 1, 2, 3, 4, 5]);

    // Height normalised to 12 m, base sitting on y=0.
    let mny = 1e9, mxy = -1e9;
    for (let i = 1; i < pos.length; i += 3) { mny = Math.min(mny, pos[i]); mxy = Math.max(mxy, pos[i]); }
    assert.ok(Math.abs((mxy - mny) - 12) < 1e-3, `height ${mxy - mny} != 12`);
    assert.ok(Math.abs(mny) < 1e-3, `base y ${mny} should be 0 (sits on ground)`);

    // The atlas sample: first triangle red, second green. This is the whole
    // point — without it the model imports flat grey.
    assert.ok(col[0] > 0.7 && col[1] < 0.3, `tri A should be red, got ${[col[0], col[1], col[2]]}`);
    // Vertex 3 carries UV 0.75 -> the green palette cell.
    assert.ok(col[9] < 0.3 && col[10] > 0.7, `green cell should sample green, got ${[col[9], col[10], col[11]]}`);
    assert.ok([...mat].every((m) => m === 1), "every vertex must carry MAT.CONCRETE");
  } finally {
    process.on("exit", () => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {} });
  }
});

// Kenney City Kit Roads / Modular Buildings ship indexed (colour-type 3)
// colormaps. Without PLTE support the importer threw, materialColour caught it,
// and every vertex landed at the 0.75 grey factor — barriers looked blank.
function pngIndexed(w, h, indices, palette /* RGB triples */) {
  const T = (() => { const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
  const crc = (b) => { let c = -1; for (let i = 0; i < b.length; i++) c = T[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ -1) >>> 0; };
  const chunk = (ty, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const body = Buffer.concat([Buffer.from(ty), d]);
    const cc = Buffer.alloc(4); cc.writeUInt32BE(crc(body)); return Buffer.concat([l, body, cc]); };
  const stride = w, raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0; // filter None
    indices.subarray(y * w, (y + 1) * w).copy(raw, y * (stride + 1) + 1);
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 3;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10]),
    chunk("IHDR", ihdr), chunk("PLTE", Buffer.from(palette)),
    chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

test("import-models samples indexed (colour-type 3) Kenney-style colormaps", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "apex-imp-idx-"));
  const src = path.join(tmp, "pack"), out = path.join(tmp, "out");
  fs.mkdirSync(path.join(src, "textures"), { recursive: true });
  fs.mkdirSync(out, { recursive: true });
  try {
    // 2x1 indexed palette: idx0=orange, idx1=blue — mirrors Kenney roads atlases.
    fs.writeFileSync(path.join(src, "textures", "palette.png"),
      pngIndexed(2, 1, Buffer.from([0, 1]), [220, 90, 20, 40, 90, 200]));
    const pos = new Float32Array([0, 0, 0, 2, 0, 0, 0, 4, 0, 3, 0, 0, 5, 0, 0, 3, 4, 0]);
    const nrm = new Float32Array(18).fill(0); for (let i = 2; i < 18; i += 3) nrm[i] = 1;
    const uv = new Float32Array([0.25, 0.5, 0.25, 0.5, 0.25, 0.5, 0.75, 0.5, 0.75, 0.5, 0.75, 0.5]);
    const idxA = new Uint16Array([0, 1, 2]), idxB = new Uint16Array([3, 4, 5]);
    const bin = Buffer.concat([Buffer.from(pos.buffer), Buffer.from(nrm.buffer), Buffer.from(uv.buffer),
      Buffer.from(idxA.buffer), Buffer.from(idxB.buffer)]);
    fs.writeFileSync(path.join(src, "model.bin"), bin);
    const P = pos.byteLength, N = nrm.byteLength, U = uv.byteLength;
    const gltf = {
      asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
      meshes: [{ primitives: [
        { attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: 3, material: 0 },
        { attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: 4, material: 0 }] }],
      materials: [{ pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], baseColorTexture: { index: 0 } } }],
      textures: [{ source: 0 }], images: [{ uri: "textures/palette.png" }],
      accessors: [
        { bufferView: 0, componentType: 5126, count: 6, type: "VEC3", min: [0, 0, 0], max: [5, 4, 0] },
        { bufferView: 1, componentType: 5126, count: 6, type: "VEC3" },
        { bufferView: 2, componentType: 5126, count: 6, type: "VEC2" },
        { bufferView: 3, componentType: 5123, count: 3, type: "SCALAR" },
        { bufferView: 4, componentType: 5123, count: 3, type: "SCALAR" }],
      bufferViews: [
        { buffer: 0, byteOffset: 0, byteLength: P },
        { buffer: 0, byteOffset: P, byteLength: N },
        { buffer: 0, byteOffset: P + N, byteLength: U },
        { buffer: 0, byteOffset: P + N + U, byteLength: 6 },
        { buffer: 0, byteOffset: P + N + U + 6, byteLength: 6 }],
      buffers: [{ uri: "model.bin", byteLength: bin.length }],
    };
    fs.writeFileSync(path.join(src, "barrier.gltf"), JSON.stringify(gltf));

    const r = cp.spawnSync(process.execPath,
      [path.join(ROOT, "tools", "gen", "import-models.mjs"), src, "--mat", "CONCRETE", "--height", "1", "--prefix", "k_"],
      { env: { ...process.env, APEX_PACK_DIR: out }, encoding: "utf8" });
    assert.equal(r.status, 0, `importer failed:\n${r.stdout}${r.stderr}`);
    const man = JSON.parse(fs.readFileSync(path.join(out, "manifest.json"), "utf8"));
    const geo = await readAX26(path.join(out, man.models.k_barrier.file));
    assert.ok(geo, "the shipped reader must accept what the importer produced");
    const col = geo.col;
    // UV 0.25 -> orange cell, UV 0.75 -> blue cell.
    assert.ok(col[0] > 0.7 && col[1] < 0.5, `orange cell, got ${[col[0], col[1], col[2]]}`);
    assert.ok(col[9] < 0.3 && col[11] > 0.6, `blue cell, got ${[col[9], col[10], col[11]]}`);
  } finally {
    process.on("exit", () => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {} });
  }
});

test("--scale keeps a kit's relative sizes: a uniform metres-per-unit factor when --height is 0", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "apex-imp-"));
  const src = path.join(tmp, "pack"), out = path.join(tmp, "out");
  fs.mkdirSync(src, { recursive: true }); fs.mkdirSync(out, { recursive: true });
  try {
    buildFixture(src);
    const run = (args) => cp.spawnSync(process.execPath,
      [path.join(ROOT, "tools", "gen", "import-models.mjs"), src, "--mat", "CONCRETE", ...args, "--prefix", "s_"],
      { env: { ...process.env, APEX_PACK_DIR: out }, encoding: "utf8" });
    const height = async (r) => {
      assert.equal(r.status, 0, r.stderr);
      const man = JSON.parse(fs.readFileSync(path.join(out, "manifest.json"), "utf8"));
      const geo = await readAX26(path.join(out, man.models.s_building.file));
      let mny = 1e9, mxy = -1e9;
      for (let i = 1; i < geo.pos.length; i += 3) { mny = Math.min(mny, geo.pos[i]); mxy = Math.max(mxy, geo.pos[i]); }
      return mxy - mny;
    };
    const h1 = await height(run(["--height", "0", "--scale", "1"]));
    const h5 = await height(run(["--height", "0", "--scale", "5"]));
    assert.ok(h1 > 0 && Math.abs(h5 - h1 * 5) < 1e-3, `scale 5 should be five times scale 1: ${h5} vs ${h1}`);
    const hb = await height(run(["--height", "12", "--scale", "5"]));
    assert.ok(Math.abs(hb - 12) < 1e-3, `--height wins over --scale: ${hb}`);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

// PNG fixtures use a bit-at-a-time CRC and hand-filtered rows, independently
// of the production encoder/CRC table. Keep malformed chunks checksummed so
// they reach the intended dimension, palette and scanline guard.
function pngChunkFixture(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  let crc = 0xffffffff;
  for (const byte of body) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  const chunk = Buffer.alloc(data.length + 12);
  chunk.writeUInt32BE(data.length);
  body.copy(chunk, 4);
  chunk.writeUInt32BE((crc ^ 0xffffffff) >>> 0, data.length + 8);
  return chunk;
}

function pngFixture({ w = 2, h = 2, colour = 2, depth = 8, method = 0, raw, palette, alpha }) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = depth; ihdr[9] = colour; ihdr[12] = method;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pngChunkFixture("IHDR", ihdr),
    ...(palette ? [pngChunkFixture("PLTE", Buffer.from(palette))] : []),
    ...(alpha ? [pngChunkFixture("tRNS", Buffer.from(alpha))] : []),
    pngChunkFixture("IDAT", zlib.deflateSync(Buffer.from(raw))), pngChunkFixture("IEND", Buffer.alloc(0)),
  ]);
}

test("shared PNG profiles decode all five RGB filters and preserve encoder bytes", async () => {
  const { decodePNG, encodePNG } = await import("../../tools/lib/author-png.mjs");
  const forwarded = await import("../../tools/gen/assets.mjs");
  assert.equal(forwarded.decodePNG, decodePNG);
  assert.equal(forwarded.encodePNG, encodePNG);
  const rows = [
    [[10, 20, 30, 40, 50, 60], [70, 80, 90, 100, 110, 120]],
    [[10, 20, 30, 30, 30, 30], [70, 80, 90, 30, 30, 30]],
    [[10, 20, 30, 40, 50, 60], [60, 60, 60, 60, 60, 60]],
    [[10, 20, 30, 35, 40, 45], [65, 70, 75, 45, 45, 45]],
    [[10, 20, 30, 30, 30, 30], [60, 60, 60, 30, 30, 30]],
  ];
  const expected = Buffer.from([10, 20, 30, 255, 40, 50, 60, 255, 70, 80, 90, 255, 100, 110, 120, 255]);
  for (const [filter, [first, second]] of rows.entries()) {
    const png = pngFixture({ raw: [filter, ...first, filter, ...second] });
    for (const profile of ["validation", "model-import"]) {
      assert.deepEqual(decodePNG(png, { profile }), { w: 2, h: 2, rgba: expected }, `${profile}, filter ${filter}`);
    }
  }
  // Captured from the pre-extraction encoder; changing filter/deflate policy
  // would change committed author-time pack bytes.
  assert.equal(encodePNG(1, 1, Buffer.from([12, 34, 56, 78])).toString("hex"),
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63e051b2f00300015900b5999538170000000049454e44ae426082");
  assert.deepEqual(decodePNG(pngRGBA(1, 1, Buffer.from([12, 34, 56, 78]))).rgba, Buffer.from([12, 34, 56, 78]));
});

test("PNG model-import profile keeps PLTE/tRNS while material validation stays RGB/RGBA", async () => {
  const { decodePNG } = await import("../../tools/lib/author-png.mjs");
  const png = pngFixture({ colour: 3, raw: [0, 0, 1, 0, 1, 0], palette: [220, 90, 20, 40, 90, 200], alpha: [17] });
  assert.deepEqual(decodePNG(png, { profile: "model-import" }).rgba,
    Buffer.from([220, 90, 20, 17, 40, 90, 200, 255, 40, 90, 200, 255, 220, 90, 20, 17]));
  // Palette filtering uses a one-byte pixel stride, including wrapped
  // negative residuals. These rows all reconstruct indices [0,1;1,0].
  for (let filter = 0; filter < 5; filter++) {
    const raw = filter === 0 ? [0, 0, 1, 0, 1, 0] : [filter, 0, 1, filter, 1, 255];
    const filtered = pngFixture({ colour: 3, raw, palette: [220, 90, 20, 40, 90, 200], alpha: [17] });
    assert.deepEqual(decodePNG(filtered, { profile: "model-import" }).rgba,
      Buffer.from([220, 90, 20, 17, 40, 90, 200, 255, 40, 90, 200, 255, 220, 90, 20, 17]), `indexed filter ${filter}`);
  }
  assert.throws(() => decodePNG(png), /unsupported colour type 3/);
  assert.throws(() => decodePNG(png, { profile: "typo" }), /unknown PNG profile/);
  for (const [opts, error] of [
    [{}, /PLTE/], [{ palette: [1, 2] }, /PLTE/],
  ]) {
    assert.throws(() => decodePNG(pngFixture({ colour: 3, raw: [0, 0, 0, 0, 0, 0], ...opts }), { profile: "model-import" }), error);
  }
});

test("validation PNG profile retains CRC, dimensions, format and exact bounded scanlines", async () => {
  const { decodePNG } = await import("../../tools/lib/author-png.mjs");
  const valid = pngFixture({ w: 1, h: 1, raw: [0, 1, 2, 3] });
  const signature = Buffer.from(valid); signature[7] ^= 1;
  const crc = Buffer.from(valid); crc[29] ^= 1;
  assert.throws(() => decodePNG(signature), /signature/);
  assert.throws(() => decodePNG(crc), /CRC/);
  assert.throws(() => decodePNG(valid.subarray(0, valid.length - 1)), /truncated/);
  assert.throws(() => decodePNG(valid.subarray(0, valid.length - 12)), /IEND/);
  assert.throws(() => decodePNG(Buffer.concat([valid, Buffer.from([0])])), /IEND/);
  for (const [opts, error] of [
    [{ w: 0 }, /dimensions/], [{ w: 33554433, h: 1 }, /dimensions/],
    [{ depth: 16 }, /bit depth/], [{ method: 1 }, /compression\/filter\/interlace/],
    [{ raw: [5, 1, 2, 3] }, /scanline filter/], [{ raw: [0, 1] }, /scanline length/],
    [{ raw: [0, 1, 2, 3, 4] }, /larger than|size|length/i],
  ]) assert.throws(() => decodePNG(pngFixture({ w: 1, h: 1, raw: [0, 1, 2, 3], ...opts })), error);
});

// Literal byte streams AND outputs/errors were captured from the actual two
// d25d60ac decoders before correcting the extraction. No expected pixels or
// rejection decisions are calculated with the shared codec. PLTE includes
// deliberately partial/oversized tables; raw includes short/excess scanlines.
const BASE_PNG_PROFILES = [
  ["valid-rgb","iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgZGIGAAAOAAfXb+R4AAAAAElFTkSuQmCC",{"w":1,"h":1,"rgba":[1,2,3,255]},{"w":1,"h":1,"rgba":[1,2,3,255]}],
  ["valid-rgba","iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgZGJmAQAAGQAL51pGpAAAAABJRU5ErkJggg==",{"w":1,"h":1,"rgba":[1,2,3,4]},{"w":1,"h":1,"rgba":[1,2,3,4]}],
  ["signature-last-four","iVBORw0KGgsAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgZGIGAAAOAAfXb+R4AAAAAElFTkSuQmCC",{"w":1,"h":1,"rgba":[1,2,3,255]},{"error":{"name":"Error","message":"not a PNG (bad signature)"}}],
  ["signature-first-four","iFBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgZGIGAAAOAAfXb+R4AAAAAElFTkSuQmCC",{"error":{"name":"Error","message":"not a PNG"}},{"error":{"name":"Error","message":"not a PNG (bad signature)"}}],
  ["ihdr-crc","iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACRd1PeAAAADElEQVR4nGNgZGIGAAAOAAfXb+R4AAAAAElFTkSuQmCC",{"w":1,"h":1,"rgba":[1,2,3,255]},{"error":{"name":"Error","message":"PNG IHDR CRC mismatch"}}],
  ["iend-crc","iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgZGIGAAAOAAfXb+R4AAAAAElFTkSuQmCD",{"w":1,"h":1,"rgba":[1,2,3,255]},{"error":{"name":"Error","message":"PNG IEND CRC mismatch"}}],
  ["missing-iend","iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgZGIGAAAOAAfXb+R4",{"w":1,"h":1,"rgba":[1,2,3,255]},{"error":{"name":"Error","message":"PNG missing IEND"}}],
  ["truncated-iend-crc","iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgZGIGAAAOAAfXb+R4AAAAAElFTkSuQmA=",{"w":1,"h":1,"rgba":[1,2,3,255]},{"error":{"name":"Error","message":"truncated PNG chunk"}}],
  ["nonempty-iend","iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgZGIGAAAOAAfXb+R4AAAAAUlFTkQJqMb3RQ==",{"w":1,"h":1,"rgba":[1,2,3,255]},{"error":{"name":"Error","message":"invalid PNG IEND or missing image data"}}],
  ["trailing-after-iend","iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgZGIGAAAOAAfXb+R4AAAAAElFTkSuQmCCYw==",{"w":1,"h":1,"rgba":[1,2,3,255]},{"error":{"name":"Error","message":"invalid PNG IEND or missing image data"}}],
  ["leading-ancillary","iVBORw0KGgoAAAAHdEVYdGlnbm9yZWT3x75NAAAADUlIRFIAAAABAAAAAQgCAAAAkHdT3gAAAAxJREFUeJxjYGRiBgAADgAH12/keAAAAABJRU5ErkJggg==",{"w":1,"h":1,"rgba":[1,2,3,255]},{"error":{"name":"Error","message":"PNG must start with IHDR"}}],
  ["duplicate-ihdr","iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADUlIRFIAAAABAAAAAQgCAAAAkHdT3gAAAAxJREFUeJxjYGRiBgAADgAH12/keAAAAABJRU5ErkJggg==",{"w":1,"h":1,"rgba":[1,2,3,255]},{"error":{"name":"Error","message":"invalid PNG IHDR"}}],
  ["duplicate-ihdr-last-wins","iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADUlIRFIAAAACAAAAAQgCAAAAe0Do3QAAAAxJREFUeJxjYGRiBgAADgAH12/keAAAAABJRU5ErkJggg==",{"w":2,"h":1,"rgba":[1,2,3,255,0,0,0,255]},{"error":{"name":"Error","message":"invalid PNG IHDR"}}],
  ["ihdr-length-ten","iVBORw0KGgoAAAAKSUhEUgAAAAEAAAABCAJLD1F9AAAADElEQVR4nGNgZGIGAAAOAAfXb+R4AAAAAElFTkSuQmCC",{"w":1,"h":1,"rgba":[1,2,3,255]},{"error":{"name":"Error","message":"invalid PNG IHDR"}}],
  ["ihdr-length-fourteen","iVBORw0KGgoAAAAOSUhEUgAAAAEAAAABCAIAAABjZ0JX7wAAAAxJREFUeJxjYGRiBgAADgAH12/keAAAAABJRU5ErkJggg==",{"w":1,"h":1,"rgba":[1,2,3,255]},{"error":{"name":"Error","message":"invalid PNG IHDR"}}],
  ["truncated-declared-idat","iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAAcElEQVR4nGNgZGIGAAAOAAc=",{"w":1,"h":1,"rgba":[1,2,3,255]},{"error":{"name":"Error","message":"truncated PNG chunk data"}}],
  ["missing-ihdr","iVBORw0KGgoAAAAMSURBVHicY2BkYgYAAA4AB9dv5HgAAAAASUVORK5CYII=",{"w":0,"h":0,"rgba":[]},{"error":{"name":"Error","message":"PNG must start with IHDR"}}],
  ["zero-width","iVBORw0KGgoAAAANSUhEUgAAAAAAAAABCAIAAAB/tTjgAAAADElEQVR4nGNgZGIGAAAOAAfXb+R4AAAAAElFTkSuQmCC",{"w":0,"h":1,"rgba":[]},{"error":{"name":"Error","message":"invalid or oversized PNG dimensions"}}],
  ["zero-height","iVBORw0KGgoAAAANSUhEUgAAAAEAAAAACAIAAABbK4B7AAAADElEQVR4nGNgZGIGAAAOAAfXb+R4AAAAAElFTkSuQmCC",{"w":1,"h":0,"rgba":[]},{"error":{"name":"Error","message":"invalid or oversized PNG dimensions"}}],
  ["compression-flag","iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIBAACRtTnpAAAADElEQVR4nGNgZGIGAAAOAAfXb+R4AAAAAElFTkSuQmCC",{"w":1,"h":1,"rgba":[1,2,3,255]},{"error":{"name":"Error","message":"unsupported PNG compression/filter/interlace method"}}],
  ["filter-method-flag","iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAQCJbGKfAAAADElEQVR4nGNgZGIGAAAOAAfXb+R4AAAAAElFTkSuQmCC",{"w":1,"h":1,"rgba":[1,2,3,255]},{"error":{"name":"Error","message":"unsupported PNG compression/filter/interlace method"}}],
  ["interlace-flag","iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAAHncGNIAAAADElEQVR4nGNgZGIGAAAOAAfXb+R4AAAAAElFTkSuQmCC",{"w":1,"h":1,"rgba":[1,2,3,255]},{"error":{"name":"Error","message":"unsupported PNG compression/filter/interlace method"}}],
  ["unknown-scanline-filter","iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNlZGIGAAAiAAw7fcc7AAAAAElFTkSuQmCC",{"w":1,"h":1,"rgba":[1,2,3,255]},{"error":{"name":"Error","message":"Invalid PNG scanline filter 5"}}],
  ["short-scanline","iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAACklEQVR4nGNgBAAAAwACS/Xd6gAAAABJRU5ErkJggg==",{"w":1,"h":1,"rgba":[1,0,0,255]},{"error":{"name":"Error","message":"PNG scanline length mismatch"}}],
  ["extra-scanline-data","iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADUlEQVR4nGNgZGJmAQAAGQAL51pGpAAAAABJRU5ErkJggg==",{"w":1,"h":1,"rgba":[1,2,3,255]},{"error":{"name":"RangeError","message":"Cannot create a Buffer larger than 4 bytes"}}],
  ["short-rgba-scanline","iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGNgBAAAAwACS/Xd6gAAAABJRU5ErkJggg==",{"w":1,"h":1,"rgba":[1,0,0,0]},{"error":{"name":"Error","message":"PNG scanline length mismatch"}}],
  ["indexed-partial-triple","iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAMAAAAoyzS7AAAABFBMVEUKFB4oIcXSlwAAAApJREFUeJxjYAQAAAMAAkv13eoAAAAASUVORK5CYII=",{"w":1,"h":1,"rgba":[40,0,0,255]},{"error":{"name":"Error","message":"unsupported colour type 3"}}],
  ["indexed-oversized-palette","iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAMAAAAoyzS7AAADAVBMVEUBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBPa6r1gAAAApJREFUeJxjYAAAAAIAAUivpHEAAAAASUVORK5CYII=",{"w":1,"h":1,"rgba":[1,1,1,255]},{"error":{"name":"Error","message":"unsupported colour type 3"}}],
  ["indexed-excess-trns","iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAMAAAAoyzS7AAAAA1BMVEUKFB5+TFI6AAAAAnRSTlMRLBeSgssAAAAKSURBVHicY2AAAAACAAFIr6RxAAAAAElFTkSuQmCC",{"w":1,"h":1,"rgba":[10,20,30,17]},{"error":{"name":"Error","message":"unsupported colour type 3"}}],
  ["indexed-out-of-range","iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAMAAAAoyzS7AAAAA1BMVEUKFB5+TFI6AAAACklEQVR4nGNgBAAAAwACS/Xd6gAAAABJRU5ErkJggg==",{"w":1,"h":1,"rgba":[0,0,0,255]},{"error":{"name":"Error","message":"unsupported colour type 3"}}],
  ["indexed-out-of-range-with-trns","iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAMAAAAoyzS7AAAAA1BMVEUKFB5+TFI6AAAAAnRSTlMRLBeSgssAAAAKSURBVHicY2AEAAADAAJL9d3qAAAAAElFTkSuQmCC",{"w":1,"h":1,"rgba":[0,0,0,44]},{"error":{"name":"Error","message":"unsupported colour type 3"}}],
  ["unsupported-depth","iVBORw0KGgoAAAANSUhEUgAAAAEAAAABEAIAAADA54+dAAAADElEQVR4nGNgZGIGAAAOAAfXb+R4AAAAAElFTkSuQmCC",{"error":{"name":"Error","message":"bit depth"}},{"error":{"name":"Error","message":"unsupported bit depth 16"}}],
  ["unsupported-colour","iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAADElEQVR4nGNgZGIGAAAOAAfXb+R4AAAAAElFTkSuQmCC",{"error":{"name":"Error","message":"colour type"}},{"error":{"name":"Error","message":"unsupported colour type 0"}}],
  ["missing-palette","iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAMAAAAoyzS7AAAACklEQVR4nGNgAAAAAgABSK+kcQAAAABJRU5ErkJggg==",{"error":{"name":"Error","message":"indexed PNG missing PLTE"}},{"error":{"name":"Error","message":"unsupported colour type 3"}}],
  ["short-palette","iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAMAAAAoyzS7AAAAAlBMVEUBAuVkm68AAAAKSURBVHicY2AAAAACAAFIr6RxAAAAAElFTkSuQmCC",{"error":{"name":"Error","message":"indexed PNG missing PLTE"}},{"error":{"name":"Error","message":"unsupported colour type 3"}}],
  ["missing-idat","iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAAAElFTkSuQmCC",{"error":{"name":"Error","message":"unexpected end of file"}},{"error":{"name":"Error","message":"invalid PNG IEND or missing image data"}}],
  ["bad-zlib","iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAAA0lEQVQBAgNTNxetAAAAAElFTkSuQmCC",{"error":{"name":"Error","message":"incorrect header check"}},{"error":{"name":"Error","message":"incorrect header check"}}],
 ];

test("both PNG parser profiles preserve exact BASE accepted pixels and rejection boundaries", async () => {
  const { decodePNG } = await import("../../tools/lib/author-png.mjs");
  for (const [name, encoded, legacy, validation] of BASE_PNG_PROFILES) {
    const png = Buffer.from(encoded, "base64");
    for (const [profile, expected] of [["model-import", legacy], ["validation", validation]]) {
      const label = `${profile}: ${name}`;
      if (expected.error) assert.throws(() => decodePNG(png, { profile }), expected.error, label);
      else assert.deepEqual(decodePNG(png, { profile }),
        { w: expected.w, h: expected.h, rgba: Buffer.from(expected.rgba) }, label);
    }
  }
});

test("import-models preserves bad-signature fallback and legacy IEND-CRC-tolerant sampling", async (t) => {
  const parent = path.join(ROOT, "artifacts", "tmp"); fs.mkdirSync(parent, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(parent, "import-png-fallback-"));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const src = path.join(tmp, "pack"), out = path.join(tmp, "out");
  fs.mkdirSync(src); fs.mkdirSync(out); buildFixture(src);
  const texture = path.join(src, "textures", "palette.png");
  const original = fs.readFileSync(texture);
  const sample = async (bytes, prefix) => {
    fs.writeFileSync(texture, bytes);
    const r = cp.spawnSync(process.execPath, [path.join(ROOT, "tools/gen/import-models.mjs"), src, "--prefix", prefix],
      { env: { ...process.env, APEX_PACK_DIR: out }, encoding: "utf8", timeout: 10000 });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    const man = JSON.parse(fs.readFileSync(path.join(out, "manifest.json"), "utf8"));
    const geo = await readAX26(path.join(out, man.models[prefix + "building"].file));
    assert.ok(geo);
    return geo;
  };
  const badSignature = Buffer.from(original); badSignature[0] ^= 1;
  const fallback = await sample(badSignature, "fallback_");
  assert.ok([...fallback.col].every((c) => c === 1), "a bad first-four-byte signature keeps the authored factor fallback");
  const badIendCRC = Buffer.from(original); badIendCRC[badIendCRC.length - 1] ^= 1;
  const sampled = await sample(badIendCRC, "crc_");
  assert.deepEqual(Array.from(sampled.col, c => Math.round(c * 255)),
    [200, 40, 40, 200, 40, 40, 200, 40, 40, 40, 200, 60, 40, 200, 60, 40, 200, 60],
    "an ignored IEND CRC keeps the same red/green UV-cell colors as the original importer");
});
