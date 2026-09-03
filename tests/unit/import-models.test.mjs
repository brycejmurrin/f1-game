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

test("import-models bakes gltf+bin+atlas into AX26 with sampled colours", () => {
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

    // Parse the .bin exactly as js/render/shared/assets.js _parseModel does.
    const b = fs.readFileSync(path.join(out, man.models.q_building.file));
    const buf = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
    const dv = new DataView(buf);
    assert.equal(String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3)), "AX26");
    const nv = dv.getUint32(8, true), ni = dv.getUint32(12, true);
    // Two primitives, each copying the 6-vertex POSITION accessor -> 12 verts,
    // 6 indices, 2 triangles. (Primitives do not share a vertex block.)
    assert.equal(nv, 12); assert.equal(ni, 6);
    let o = 20;
    const pos = new Float32Array(buf, o, nv * 3); o += nv * 12; o += nv * 12;
    const col = new Float32Array(buf, o, nv * 3); o += nv * 12;
    const mat = new Float32Array(buf, o, nv);

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

test("import-models samples indexed (colour-type 3) Kenney-style colormaps", () => {
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
    const b = fs.readFileSync(path.join(out, man.models.k_barrier.file));
    const nv = b.readUInt32LE(8);
    const col = new Float32Array(b.buffer, b.byteOffset + 20 + nv * 24, nv * 3);
    // UV 0.25 -> orange cell, UV 0.75 -> blue cell.
    assert.ok(col[0] > 0.7 && col[1] < 0.5, `orange cell, got ${[col[0], col[1], col[2]]}`);
    assert.ok(col[9] < 0.3 && col[11] > 0.6, `blue cell, got ${[col[9], col[10], col[11]]}`);
  } finally {
    process.on("exit", () => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {} });
  }
});
