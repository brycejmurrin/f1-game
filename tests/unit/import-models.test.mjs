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

test("importExitCode: a partial import exits 0, an import where every file was skipped exits 2", async () => {
  const { importExitCode } = await import("../../tools/gen/import-models.mjs");
  assert.equal(importExitCode([{ id: "a", verts: 6 }, { id: "b", skipped: "no triangle geometry" }]), 0,
    "one unsupported file in a pack must not sink the rest");
  assert.equal(importExitCode([{ id: "a", skipped: "no triangle geometry" }, { id: "b", skipped: "over --max-verts 40000" }]), 2);
  assert.equal(importExitCode([{ id: "a", verts: 6 }]), 0);
});

test("the importer CLI exits 2 when every model file fails, and 0 with the good file beside a bad one", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "apex-imp-"));
  const bad = path.join(tmp, "bad"), mixed = path.join(tmp, "mixed"), out = path.join(tmp, "out");
  for (const d of [bad, mixed, out]) fs.mkdirSync(d, { recursive: true });
  try {
    // A glTF with a scene and no meshes: importFile throws "no triangle geometry".
    const empty = JSON.stringify({ asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{}] });
    fs.writeFileSync(path.join(bad, "empty.gltf"), empty);
    buildFixture(mixed);
    fs.writeFileSync(path.join(mixed, "empty.gltf"), empty);
    const run = (src) => cp.spawnSync(process.execPath,
      [path.join(ROOT, "tools", "gen", "import-models.mjs"), src, "--mat", "CONCRETE", "--height", "12", "--prefix", "x_"],
      { env: { ...process.env, APEX_PACK_DIR: out }, encoding: "utf8" });
    const allBad = run(bad);
    assert.equal(allBad.status, 2, `every file skipped must fail the run:\n${allBad.stdout}${allBad.stderr}`);
    assert.match(allBad.stdout, /imported 0\/1/);
    assert.match(allBad.stderr, /none of the 1 model file\(s\) imported/);
    const partial = run(mixed);
    assert.equal(partial.status, 0, `a partial import keeps the good models:\n${partial.stdout}${partial.stderr}`);
    assert.match(partial.stdout, /imported 1\/2/);
    const man = JSON.parse(fs.readFileSync(path.join(out, "manifest.json"), "utf8"));
    assert.ok(man.models.x_building && !man.models.x_empty, "only the good model is recorded");
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
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

test("import-models reads each palette once per file without changing factors or traversal order", async () => {
  fs.mkdirSync(path.join(ROOT, "artifacts"), { recursive: true });
  const tmp = fs.mkdtempSync(path.join(ROOT, "artifacts", "apex-imp-cache-"));
  const src = path.join(tmp, "pack"), out = path.join(tmp, "out");
  fs.mkdirSync(src); fs.mkdirSync(out);
  try {
    buildFixture(src);
    const original = JSON.parse(fs.readFileSync(path.join(src, "building.gltf"), "utf8"));
    const [a, b] = original.meshes[0].primitives;
    original.meshes[0].primitives = [{ ...b, material: 1 }, a, { ...b, material: 1 },
      { ...a, material: 2 }, { ...b, material: 3 }];
    original.nodes.push({ mesh: 0, translation: [6, 0, 0] });
    original.scenes[0].nodes.push(1);
    original.materials.push(
      { pbrMetallicRoughness: { baseColorFactor: [0.5, 0.25, 1, 1], baseColorTexture: { index: 0 } } },
      { pbrMetallicRoughness: { baseColorFactor: [0.2, 0.4, 0.6, 1], baseColorTexture: { index: 1 } } },
      { pbrMetallicRoughness: { baseColorFactor: [0.7, 0.3, 0.1, 1], baseColorTexture: { index: 1 } } });
    original.textures.push({ source: 1 });
    original.images.push({ uri: "textures/missing.png" });
    // Nonsequential source indices pin the importer's first-use remap order.
    const binFile = path.join(src, "model.bin"), bin = fs.readFileSync(binFile);
    [5, 3, 4].forEach((index, i) => bin.writeUInt16LE(index, bin.length - 6 + i * 2));
    fs.writeFileSync(binFile, bin);
    const second = structuredClone(original);
    second.materials[0].pbrMetallicRoughness.baseColorFactor = [0.25, 0.5, 0.75, 1];
    second.materials[1].pbrMetallicRoughness.baseColorFactor = [1, 1, 1, 1];
    const inputs = { building: original, second };
    for (const [name, json] of Object.entries(inputs))
      fs.writeFileSync(path.join(src, `${name}.gltf`), JSON.stringify(json));

    // Count real CLI I/O and inflate work, without replacing the importer or
    // decoder. Two files sharing a URI must each own one decode, even when
    // multiple materials and nodes reference it. Failed images are memoized.
    const counterFile = path.join(tmp, "counts.json"), preload = path.join(tmp, "count.cjs");
    fs.writeFileSync(preload, `const fs = require("node:fs"), zlib = require("node:zlib");
const counts = { reads: {}, inflates: 0 }, read = fs.readFileSync, inflate = zlib.inflateSync;
fs.readFileSync = function(file, ...args) {
  if (String(file).endsWith(".png")) counts.reads[String(file)] = (counts.reads[String(file)] || 0) + 1;
  return read.call(this, file, ...args);
};
zlib.inflateSync = function(...args) { counts.inflates++; return inflate.apply(this, args); };
process.on("exit", () => fs.writeFileSync(${JSON.stringify(counterFile)}, JSON.stringify(counts)));
`);
    const envRecord = { source: "procedural:keep", licence: "CC0", author: "Fixture", sky: [1, 1, 1] };
    fs.writeFileSync(path.join(out, "manifest.json"), JSON.stringify({ version: 1, materials: null,
      models: {}, env: { fixture: envRecord }, credits: [] }));
    const r = cp.spawnSync(process.execPath, ["--require", preload,
      path.join(ROOT, "tools", "gen", "import-models.mjs"), src, "--mat", "BRICK", "--scale", "1",
      "--source", "fixture:palette", "--author", "Fixture Author"],
      { env: { ...process.env, APEX_PACK_DIR: out }, encoding: "utf8", timeout: 10000 });
    assert.equal(r.status, 0, r.stderr || r.stdout);
    const counts = JSON.parse(fs.readFileSync(counterFile, "utf8"));
    assert.deepEqual(counts, { reads: { [path.join(src, "textures", "palette.png")]: 2,
      [path.join(src, "textures", "missing.png")]: 2 }, inflates: 2 });

    const { writeAX26 } = await import("../../tools/gen/assets.mjs");
    const man = JSON.parse(fs.readFileSync(path.join(out, "manifest.json"), "utf8"));
    assert.deepEqual(man.env, { fixture: envRecord });
    for (const [name, json] of Object.entries(inputs)) {
      const mesh = { pos: [], nrm: [], col: [], idx: [] };
      const positions = [[0, 0, 0], [2, 0, 0], [0, 4, 0], [3, 0, 0], [5, 0, 0], [3, 4, 0]];
      for (const translation of [0, 6]) for (const [primitive, pi] of json.meshes[0].primitives.entries()) {
        const factor = json.materials[pi.material].pbrMetallicRoughness.baseColorFactor;
        const textured = pi.material < 2, green = primitive % 2 === 0;
        for (const index of (green ? [5, 3, 4] : [0, 1, 2])) {
          const p = positions[index];
          mesh.pos.push(p[0] + translation - 5.5, p[1], p[2]);
          mesh.nrm.push(0, 0, 1);
          const rgb = green ? [40, 200, 60] : [200, 40, 40];
          mesh.col.push(...factor.slice(0, 3).map((c, i) => textured ? c * rgb[i] / 255 : c));
          mesh.idx.push(mesh.idx.length);
        }
      }
      const rec = man.models[name], file = path.join(out, rec.file);
      assert.deepEqual(fs.readFileSync(file), writeAX26(mesh, "BRICK"),
        `${name}: cache must preserve complete packed geometry, normals, colours, MAT ids and first-use indices`);
      const geo = await readAX26(file);
      assert.ok(geo, "the production reader accepts the cached import");
      assert.deepEqual([...geo.idx], mesh.idx);
      assert.deepEqual([...geo.mat], new Array(30).fill(2));
      assert.equal(rec.licence, "CC0");
      assert.equal(rec.source, "fixture:palette");
      assert.equal(rec.author, "Fixture Author");
      assert.deepEqual(rec.sizeM, [11, 4, 0]);
      assert.deepEqual(JSON.parse(fs.readFileSync(path.join(src, `${name}.gltf`), "utf8")), json);
    }
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test("batch importer preserves flat and authored normals across reflected nonuniform nodes", async () => {
  fs.mkdirSync(path.join(ROOT, "artifacts"), { recursive: true });
  const tmp = fs.mkdtempSync(path.join(ROOT, "artifacts", "import-normals-"));
  const src = path.join(tmp, "src"), out = path.join(tmp, "out");
  fs.mkdirSync(src); fs.mkdirSync(out);
  try {
    const q = 1 / Math.sqrt(2);
    const p = new Float32Array([0,0,0, 1,0,1, 0,1,0, 0,0,1]);
    const n = new Float32Array([-q,0,q, -q,0,q, -q,0,q, -q,0,q]);
    const bin = Buffer.concat([Buffer.from(p.buffer), Buffer.from(n.buffer), Buffer.from(new Uint16Array([0,1,2,0,3,1]).buffer)]);
    fs.writeFileSync(path.join(src, "mesh.bin"), bin);
    const gltf = { asset:{version:"2.0"}, scenes:[{nodes:[0]}], nodes:[{scale:[-2,3,0.5],children:[1]},{mesh:0,rotation:[0,0,Math.sin(0.3),Math.cos(0.3)]}],
      buffers:[{uri:"mesh.bin",byteLength:bin.length}],
      bufferViews:[{buffer:0,byteLength:48},{buffer:0,byteOffset:48,byteLength:48},{buffer:0,byteOffset:96,byteLength:12}],
      accessors:[{bufferView:0,componentType:5126,count:4,type:"VEC3"},{bufferView:1,componentType:5126,count:4,type:"VEC3"},
        {bufferView:2,componentType:5123,count:6,type:"SCALAR"},{bufferView:2,componentType:5123,count:3,type:"SCALAR"}],
      meshes:[{primitives:[{attributes:{POSITION:0},indices:2},{attributes:{POSITION:0,NORMAL:1},indices:3}]}] };
    fs.writeFileSync(path.join(src, "normals.gltf"), JSON.stringify(gltf));
    const r = cp.spawnSync(process.execPath, [path.join(ROOT,"tools/gen/import-models.mjs"),src,"--scale","1"],
      {env:{...process.env,APEX_PACK_DIR:out},encoding:"utf8"});
    assert.equal(r.status,0,r.stderr);
    const mesh = await readAX26(path.join(out,"models/normals.bin"));
    assert.equal(mesh.pos.length,27,"six flat corners followed by three compact authored vertices");
    for (let t=0;t<mesh.idx.length;t+=3) {
      const ids = Array.from(mesh.idx.slice(t,t+3));
      const a=ids.map(i=>Array.from(mesh.pos.slice(i*3,i*3+3)));
      const u=a[1].map((v,k)=>v-a[0][k]), v=a[2].map((v,k)=>v-a[0][k]);
      const face=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
      const len=Math.hypot(...face);
      for (const i of ids) for (let k=0;k<3;k++)
        assert.ok(Math.abs(mesh.nrm[i*3+k]-face[k]/len)<1/32767+1e-6,"decoded normal agrees with geometric face within AX26 snorm16 quantization");
    }
    assert.ok(mesh.nrm[2]>0,"reflection preserves authored outward orientation");
    gltf.nodes[0].scale = [0,3,0.5];
    fs.writeFileSync(path.join(src,"singular.gltf"),JSON.stringify(gltf));
    const flattened = cp.spawnSync(process.execPath,[path.join(ROOT,"tools/gen/import-models.mjs"),src,"--scale","1"],
      {env:{...process.env,APEX_PACK_DIR:out},encoding:"utf8"});
    assert.equal(flattened.status,0,flattened.stderr);
    const manifest=JSON.parse(fs.readFileSync(path.join(out,"manifest.json"),"utf8"));
    assert.ok(manifest.models.singular,"zero scale still admits nondegenerate flattened faces");
    const flat = await readAX26(path.join(out,manifest.models.singular.file));
    for (const i of [0,1,2,6,7,8])
      assert.deepEqual(Array.from(flat.nrm.slice(i*3,i*3+3)),[-1,0,0],"flat and authored normals match the surviving YZ plane");
  } finally { fs.rmSync(tmp,{recursive:true,force:true}); }
});

// #2501: glTF `normalized` integer accessors map to [0, 1] / [-1, 1] (glTF 2.0
// §3.11); read raw, a quantized UV of 255 sampled the palette at u = 255.
test("accessor reads normalized UNSIGNED_BYTE/SHORT and signed BYTE/SHORT as unit floats", async () => {
  const { accessor } = await import("../../tools/gen/import-models.mjs");
  const cases = [
    [5121, Uint8Array, [0, 255, 51, 128], [0, 1, 0.2, 128 / 255]],
    [5123, Uint16Array, [0, 65535, 13107, 32768], [0, 1, 0.2, 32768 / 65535]],
    [5120, Int8Array, [-128, 127, -127, 0], [-1, 1, -1, 0]],
    [5122, Int16Array, [-32768, 32767, 16384, 0], [-1, 1, 16384 / 32767, 0]],
  ];
  for (const [componentType, Ctor, raw, want] of cases) {
    const bin = Buffer.from(new Ctor(raw).buffer);
    const gltf = { bins: [bin], json: { bufferViews: [{ buffer: 0, byteLength: bin.length }],
      accessors: [{ bufferView: 0, componentType, count: 2, type: "VEC2", normalized: true },
        { bufferView: 0, componentType, count: 2, type: "VEC2" }] } };
    const got = [...accessor(gltf, 0).data];
    want.forEach((w, i) => assert.ok(Math.abs(got[i] - w) < 1e-6, `${Ctor.name}[${i}]: ${got[i]} != ${w}`));
    assert.deepEqual([...accessor(gltf, 1).data], raw, `${Ctor.name} without normalized stays raw`);
  }
  const f32 = { bins: [Buffer.alloc(8)], json: { bufferViews: [{ buffer: 0, byteLength: 8 }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 1, type: "VEC2", normalized: true }] } };
  assert.throws(() => accessor(f32, 0), /normalized needs a byte or short/);
});

// #2501: normals take the inverse-transpose. Under a non-uniform node scale
// the plain matrix tilted a slanted face's normal toward the stretched axis.
test("xformDir keeps normals perpendicular under non-uniform and mirrored node scales", async () => {
  const { xformDir } = await import("../../tools/gen/import-models.mjs");
  const unit = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const xf = (m, p) => [m[0] * p[0] + m[4] * p[1] + m[8] * p[2], m[1] * p[0] + m[5] * p[1] + m[9] * p[2], m[2] * p[0] + m[6] * p[1] + m[10] * p[2]];
  // A 45° face: tangent (1, -1, 0), normal (1, 1, 0). Scale x by 4, rotate 30° about z.
  const c = Math.cos(Math.PI / 6), s = Math.sin(Math.PI / 6);
  for (const sx of [4, -4]) {
    const m = [c * sx, s * sx, 0, 0, -s, c, 0, 0, 0, 0, 2, 0, 7, 8, 9, 1];   // column-major R * S
    const t = xf(m, [1, -1, 0]), n = unit(xformDir(m, [1, 1, 0]));
    assert.ok(Math.abs(dot(unit(t), n)) < 1e-9, `sx=${sx}: normal ${n} must stay perpendicular to the tangent`);
    // Outward stays outward: the transformed normal points the same side as the transformed offset.
    assert.ok(dot(n, xf(m, [1, 1, 0])) > 0, `sx=${sx}: a mirrored node must not flip the normal inward`);
  }
  // Rotation with uniform scale: the old result, the matrix applied as-is.
  const r = [c * 3, s * 3, 0, 0, -s * 3, c * 3, 0, 0, 0, 0, 3, 0, 0, 0, 0, 1];
  const a = unit(xformDir(r, [0.3, 0.5, 0.8])), b = unit(xf(r, [0.3, 0.5, 0.8]));
  a.forEach((x, i) => assert.ok(Math.abs(x - b[i]) < 1e-12, "uniform scale direction unchanged"));
});
