/* tlx-half-webgpu-guard — TLX3-05 (#5651). three r187's WebGPU createAttribute widens a non-normalized
 * Float16BufferAttribute's Uint16Array to Uint32 while naming the format float16xN, so the GPU reads garbage.
 * The REAL tlx-chunked packer must never hand a half to the WebGPU leg (fmt24 true): a would-be half keeps the
 * exact Float32 source, and a prepared half payload is decoded to its exact f32 value at build(). WebGL2 (fmt24
 * false) and the tools' raw pack (fmt24 undefined) keep their halves. No renderer or GPU is involved. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { seedLog } from "../helpers/seed-log.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

const SRC = fs.readFileSync(new URL("../../js/render/three/tlx-chunked.js", import.meta.url), "utf8");
const CHUNK_BINS = fs.readFileSync(new URL("../../js/render/shared/chunk-bins.js", import.meta.url), "utf8").replace(/^const\b/gm, "var");

class BufferAttribute {
  constructor(array, itemSize, normalized) {
    this.array = array; this.itemSize = itemSize; this.normalized = !!normalized;
    this.count = array ? array.length / itemSize : 0;
  }
}
class Float16BufferAttribute extends BufferAttribute { get isFloat16BufferAttribute() { return true; } }
class BufferGeometry {
  constructor() { this.attributes = {}; this.index = null; }
  setAttribute(name, value) { this.attributes[name] = value; }
  setIndex(value) { this.index = value; }
  dispose() {}
}
class Vector3 { constructor(x, y, z) { this.x = x; this.y = y; this.z = z; } }
class Sphere {}
class Box3 { constructor(min, max) { this.min = min; this.max = max; } getBoundingSphere() {} }
const THREE = { BufferAttribute, Float16BufferAttribute, BufferGeometry, Vector3, Sphere, Box3 };

function load() {
  const sb = { window: {}, localStorage: { getItem: () => null }, Frustum: {},
    Float32Array, Uint32Array, Uint16Array, Uint8Array, Int16Array, Int32Array, Array, Map, Math };
  vm.createContext(sb);
  seedLog(sb);
  vm.runInContext(CHUNK_BINS, sb, { filename: absSrc("js/render/shared/chunk-bins.js") });
  vm.runInContext(SRC, sb, { filename: absSrc("js/render/three/tlx-chunked.js") });
  return sb;
}

// A 4-wide id channel and a 2-wide out-of-range unorm channel: the widths fmt24 leaves packable, so the only
// shapes that could reach a half on the WebGPU leg. 15.4 is not a whole id; 2.6 is an HDR colour.
const ID4 = new Float32Array([0, 3, 7, 255, 1, 2, 4, 9]);
const HDR2 = new Float32Array([2.6, 1.05, 0.25, 15.4]);

test("fmt24 (WebGPU): a would-be half keeps the exact Float32 source", () => {
  const P = load().window.TLXShaders;
  for (const [src, k, kind] of [[ID4, 4, "id"], [HDR2, 2, "unorm"]]) {
    const before = P.packStats.half;
    const a = P.packAttr(THREE, src, src.length, k, kind, true);
    assert.ok(!(a instanceof Float16BufferAttribute), `${kind}x${k}: no Float16BufferAttribute on WebGPU`);
    assert.ok(a.array instanceof Float32Array, `${kind}x${k}: Float32 storage`);
    assert.equal(a.itemSize, k);
    assert.equal(a.normalized, false);
    assert.deepEqual(Array.from(a.array), Array.from(src), `${kind}x${k}: exact values`);
    assert.equal(P.packStats.half, before, `${kind}x${k}: half counter untouched`);
  }
});

test("fmt24 false / undefined: the same channels still pack to half (the guard is WebGPU-only)", () => {
  const P = load().window.TLXShaders;
  for (const fmt24 of [false, undefined]) {
    for (const [src, k, kind] of [[ID4, 4, "id"], [HDR2, 2, "unorm"]]) {
      const a = P.packAttr(THREE, src, src.length, k, kind, fmt24);
      assert.ok(a instanceof Float16BufferAttribute, `${kind}x${k} fmt24=${fmt24}: half`);
      assert.ok(a.array instanceof Uint16Array);
    }
  }
});

test("build() on WebGPU decodes a prepared half payload to its exact f32 value", () => {
  const sb = load(), P = sb.window.TLXShaders;
  const sys = P.chunked(THREE, { isWebGPU: () => true, releaseGeometry() {} });
  // 0x3C00 = 1.0, 0x4B80 = 15.0, 0x4D9A = 22.40625: each exact in both half and f32.
  const halves = new Uint16Array([0x3c00, 0x4b80, 0x4d9a]);
  const config = Object.assign(P.chunkPrepareConfig(true), { merge: P.chunkPrepareConfig(false).merge });
  const data = {
    pos: new Float32Array([0, 0, 0, 1, 0, 0, 0, 0, 1]), idx: new Uint16Array([0, 1, 2]),
    _tlxPrepared: { version: 1, config, cellSize: sb.ChunkBins.cellSize(72), chunks: null, count: 3,
      idx: new Uint16Array([0, 1, 2]),
      attributes: { position: { array: new Float32Array([0, 0, 0, 1, 0, 0, 0, 0, 1]), itemSize: 3 },
        mat: { array: halves, itemSize: 1, half: true } } },
  };
  const mesh = sys.build(data, 72);
  const mat = mesh.geo.attributes.mat;
  assert.ok(!(mat instanceof Float16BufferAttribute), "no Float16BufferAttribute reaches the WebGPU geometry");
  assert.ok(mat.array instanceof Float32Array);
  assert.deepEqual(Array.from(mat.array), [1, 15, 22.40625]);
});
