/*
 * Self-test for js/gltf.js (the GLB loader) — Node ESM, no dependencies.
 *
 * Run:  node tools/gltf-selftest.mjs
 *
 * Strategy: js/gltf.js is a browser IIFE that assigns a global `GLTF`. We read
 * the file text and eval it in this Node context (providing a `globalThis`,
 * TextDecoder, and Buffer-based base64) so `GLTF` becomes available. Then we
 * build minimal valid .glb files in memory and assert toMesh()'s output.
 *
 * GLTF.load() uses fetch (browser only) and is NOT exercised here — we test
 * parseGLB / toMesh directly with ArrayBuffers.
 *
 * Exits non-zero on any failure.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");

// --- load js/gltf.js into this context ---
// TextDecoder is global in modern Node; atob exists too, but the module also
// supports Buffer, which we rely on for base64.
const src = readFileSync(join(repoRoot, "js", "gltf.js"), "utf8");
// The module does `const GLTF = (function(){...})();` at top level. Eval'd in a
// function scope that const stays local, so append an assignment to export it.
const factory = new Function("globalThis", "TextDecoder", "Buffer", "atob",
  src + "\nreturn GLTF;");
const GLTF = factory(globalThis, TextDecoder, Buffer, globalThis.atob);

// --- tiny GLB builder ---
const GLB_MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

function pad4(n) { return (n + 3) & ~3; }

// Build a .glb ArrayBuffer from a glTF json object + a binary Uint8Array.
function buildGLB(json, binBytes) {
  const enc = new TextEncoder();
  let jsonBytes = enc.encode(JSON.stringify(json));
  // pad JSON chunk with spaces, BIN chunk with zeros
  const jsonPad = pad4(jsonBytes.length) - jsonBytes.length;
  const jsonChunkLen = jsonBytes.length + jsonPad;
  const binPad = pad4(binBytes.length) - binBytes.length;
  const binChunkLen = binBytes.length + binPad;

  const total = 12 + 8 + jsonChunkLen + 8 + binChunkLen;
  const ab = new ArrayBuffer(total);
  const dv = new DataView(ab);
  const u8 = new Uint8Array(ab);
  let o = 0;
  dv.setUint32(o, GLB_MAGIC, true); o += 4;
  dv.setUint32(o, 2, true); o += 4;
  dv.setUint32(o, total, true); o += 4;
  // JSON chunk
  dv.setUint32(o, jsonChunkLen, true); o += 4;
  dv.setUint32(o, CHUNK_JSON, true); o += 4;
  u8.set(jsonBytes, o); o += jsonBytes.length;
  for (let i = 0; i < jsonPad; i++) u8[o++] = 0x20; // space
  // BIN chunk
  dv.setUint32(o, binChunkLen, true); o += 4;
  dv.setUint32(o, CHUNK_BIN, true); o += 4;
  u8.set(binBytes, o); o += binBytes.length;
  for (let i = 0; i < binPad; i++) u8[o++] = 0x00;
  return ab;
}

// Pack float positions + uint16 indices into one BIN blob, return {bin, json}.
function makeTriangleGLB(positions, indices, baseColorFactor, withNormals) {
  const posF = new Float32Array(positions);
  const idxU = new Uint16Array(indices);
  let normF = null;
  if (withNormals) {
    // simple per-vertex normal pointing +Z for all (flat-ish), just to exercise path
    const n = [];
    for (let i = 0; i < positions.length / 3; i++) n.push(0, 0, 1);
    normF = new Float32Array(n);
  }

  // layout: [pos][norm?][idx] each aligned to 4
  const posBytes = posF.byteLength;
  const normBytes = normF ? normF.byteLength : 0;
  const idxBytes = idxU.byteLength;
  const posOff = 0;
  const normOff = pad4(posOff + posBytes);
  const idxOff = pad4(normOff + normBytes);
  const totalBin = pad4(idxOff + idxBytes);

  const bin = new Uint8Array(totalBin);
  bin.set(new Uint8Array(posF.buffer), posOff);
  if (normF) bin.set(new Uint8Array(normF.buffer), normOff);
  bin.set(new Uint8Array(idxU.buffer), idxOff);

  const vCount = posF.length / 3;
  const bufferViews = [
    { buffer: 0, byteOffset: posOff, byteLength: posBytes },
  ];
  const accessors = [
    { bufferView: 0, componentType: 5126, count: vCount, type: "VEC3",
      min: [Math.min(...positions.filter((_, i) => i % 3 === 0))],
      max: [Math.max(...positions.filter((_, i) => i % 3 === 0))] },
  ];
  const attributes = { POSITION: 0 };
  let nextBV = 1, nextAcc = 1;
  if (normF) {
    bufferViews.push({ buffer: 0, byteOffset: normOff, byteLength: normBytes });
    accessors.push({ bufferView: nextBV, componentType: 5126, count: vCount, type: "VEC3" });
    attributes.NORMAL = nextAcc;
    nextBV++; nextAcc++;
  }
  bufferViews.push({ buffer: 0, byteOffset: idxOff, byteLength: idxBytes });
  accessors.push({ bufferView: nextBV, componentType: 5123, count: idxU.length, type: "SCALAR" });
  const idxAcc = nextAcc;

  const json = {
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes, indices: idxAcc, material: 0, mode: 4 }] }],
    materials: [{ pbrMetallicRoughness: { baseColorFactor: baseColorFactor.concat([1]) } }],
    buffers: [{ byteLength: totalBin }],
    bufferViews,
    accessors,
  };
  return buildGLB(json, bin);
}

// --- assertion helpers ---
let failures = 0;
function check(name, cond, detail) {
  if (cond) {
    console.log("  PASS  " + name);
  } else {
    failures++;
    console.log("  FAIL  " + name + (detail ? "  -> " + detail : ""));
  }
}
const approx = (a, b, e = 1e-5) => Math.abs(a - b) <= e;

// ===== TEST 1: single triangle, no normals (computed), known baseColor =====
console.log("TEST 1: single triangle (flat normals computed, baseColorFactor baked)");
{
  // CCW triangle in XY plane -> face normal +Z
  const pos = [0, 0, 0, 1, 0, 0, 0, 1, 0];
  const idx = [0, 1, 2];
  const base = [0.2, 0.4, 0.8];
  const ab = makeTriangleGLB(pos, idx, base, /*withNormals*/ false);

  const parsed = GLTF.parseGLB(ab);
  check("parseGLB returns json", parsed && parsed.json && parsed.json.meshes.length === 1);

  const m = GLTF.toMesh(ab);
  check("vertex count = 3", m.pos.length === 9, "pos.length=" + m.pos.length);
  check("col length = 9", m.col.length === 9);
  check("nrm length = 9", m.nrm.length === 9);
  check("idx is Uint16Array", m.idx instanceof Uint16Array, m.idx.constructor.name);
  check("idx = [0,1,2]", m.idx.length === 3 && m.idx[0] === 0 && m.idx[1] === 1 && m.idx[2] === 2);

  // positions match input exactly (scale 1, no transform)
  let posOk = true;
  for (let i = 0; i < 9; i++) if (!approx(m.pos[i], pos[i])) posOk = false;
  check("pos matches input", posOk, Array.from(m.pos).join(","));

  // computed face normal should be +Z (0,0,1) for all 3 verts, unit length
  let nrmOk = true;
  for (let v = 0; v < 3; v++) {
    if (!approx(m.nrm[v * 3], 0) || !approx(m.nrm[v * 3 + 1], 0) || !approx(m.nrm[v * 3 + 2], 1)) nrmOk = false;
  }
  check("computed flat normal = +Z", nrmOk, Array.from(m.nrm).join(","));

  // normals unit length
  let unit = true;
  for (let v = 0; v < 3; v++) {
    const l = Math.hypot(m.nrm[v * 3], m.nrm[v * 3 + 1], m.nrm[v * 3 + 2]);
    if (!approx(l, 1)) unit = false;
  }
  check("normals unit length", unit);

  // col equals baseColorFactor rgb for every vertex
  let colOk = true;
  for (let v = 0; v < 3; v++) {
    if (!approx(m.col[v * 3], base[0]) || !approx(m.col[v * 3 + 1], base[1]) || !approx(m.col[v * 3 + 2], base[2])) colOk = false;
  }
  check("col == baseColorFactor", colOk, Array.from(m.col).join(","));
}

// ===== TEST 2: two-triangle quad WITH supplied normals + scale + tint =====
console.log("TEST 2: 2-triangle quad (supplied normals, scale=2, tint applied)");
{
  const pos = [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0];
  const idx = [0, 1, 2, 0, 2, 3];
  const base = [1.0, 0.5, 0.25];
  const tint = [0.5, 1.0, 0.5];
  const ab = makeTriangleGLB(pos, idx, base, /*withNormals*/ true);

  const m = GLTF.toMesh(ab, { scale: 2, tint });
  check("vertex count = 4", m.pos.length === 12, "pos.length=" + m.pos.length);
  check("idx length = 6", m.idx.length === 6);
  check("idx is Uint16Array", m.idx instanceof Uint16Array);

  // scaled positions
  let scaleOk = true;
  for (let i = 0; i < 12; i++) if (!approx(m.pos[i], pos[i] * 2)) scaleOk = false;
  check("pos scaled by 2", scaleOk, Array.from(m.pos).join(","));

  // supplied normals +Z, unit
  let nrmOk = true;
  for (let v = 0; v < 4; v++) {
    if (!approx(m.nrm[v * 3 + 2], 1)) nrmOk = false;
    const l = Math.hypot(m.nrm[v * 3], m.nrm[v * 3 + 1], m.nrm[v * 3 + 2]);
    if (!approx(l, 1)) nrmOk = false;
  }
  check("supplied normals = +Z, unit", nrmOk, Array.from(m.nrm).join(","));

  // tinted color = base * tint
  const exp = [base[0] * tint[0], base[1] * tint[1], base[2] * tint[2]];
  let colOk = true;
  for (let v = 0; v < 4; v++) {
    if (!approx(m.col[v * 3], exp[0]) || !approx(m.col[v * 3 + 1], exp[1]) || !approx(m.col[v * 3 + 2], exp[2])) colOk = false;
  }
  check("col == base * tint", colOk, Array.from(m.col).join(",") + " expected " + exp.join(","));
}

// ===== TEST 3: malformed input rejected =====
console.log("TEST 3: malformed input handling");
{
  let threwBadMagic = false;
  try { GLTF.parseGLB(new ArrayBuffer(12)); } catch { threwBadMagic = true; }
  check("parseGLB throws on bad magic", threwBadMagic);

  let threwNotAB = false;
  try { GLTF.parseGLB("nope"); } catch { threwNotAB = true; }
  check("parseGLB throws on non-ArrayBuffer", threwNotAB);
}

// ===== TEST 4: node transform applied (translation) =====
console.log("TEST 4: node translation applied to positions");
{
  const pos = [0, 0, 0, 1, 0, 0, 0, 1, 0];
  const idx = [0, 1, 2];
  const ab0 = makeTriangleGLB(pos, idx, [1, 1, 1], false);
  // rebuild with a translated node by editing the json: easiest is to re-parse,
  // mutate, re-serialize via builder. Instead, build directly here.
  const parsed = GLTF.parseGLB(ab0);
  parsed.json.nodes[0].translation = [10, 20, 30];
  // re-serialize: we have json + bin already; rebuild a GLB.
  const ab = buildGLB(parsed.json, parsed.bin);
  const m = GLTF.toMesh(ab);
  const okX = approx(m.pos[0], 10) && approx(m.pos[3], 11) && approx(m.pos[6], 10);
  const okY = approx(m.pos[1], 20) && approx(m.pos[7], 21);
  const okZ = approx(m.pos[2], 30);
  check("translation [10,20,30] applied", okX && okY && okZ, Array.from(m.pos).join(","));
}

// --- summary ---
console.log("");
if (failures === 0) {
  console.log("ALL TESTS PASSED");
  process.exit(0);
} else {
  console.log(failures + " CHECK(S) FAILED");
  process.exit(1);
}
