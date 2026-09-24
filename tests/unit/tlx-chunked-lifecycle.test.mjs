/* tlx-chunked-lifecycle — caller frees release TLX's pooled geometry owner
 * before disposing the THREE geometry. No renderer or GPU is involved. */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { seedLog } from "../helpers/seed-log.mjs";

const SRC = new URL("../../js/render/three/tlx-chunked.js", import.meta.url);

class BufferAttribute {
  constructor(array, itemSize, normalized) {
    this.array = array; this.itemSize = itemSize; this.normalized = !!normalized;
  }
}
class Float16BufferAttribute extends BufferAttribute {}
class BufferGeometry {
  constructor() { this.attributes = {}; this.index = null; this.disposals = 0; }
  setAttribute(name, value) { this.attributes[name] = value; }
  setIndex(value) { this.index = value; }
  dispose() { this.disposals++; }
}
class Vector3 { constructor(x, y, z) { this.x = x; this.y = y; this.z = z; } }
class Sphere {}
class Box3 {
  constructor(min, max) { this.min = min; this.max = max; }
  getBoundingSphere() {}
}
const THREE = { BufferAttribute, Float16BufferAttribute, BufferGeometry, Vector3, Sphere, Box3 };

function factory(released) {
  const sandbox = {
    window: {}, localStorage: { getItem: () => null },
    Float32Array, Uint32Array, Uint16Array, Uint8Array, Int16Array, Int32Array, Array, Map, Math,
    Frustum: {},
  };
  vm.createContext(sandbox);
  seedLog(sandbox);
  vm.runInContext(fs.readFileSync(SRC, "utf8"), sandbox, { filename: "tlx-chunked.js" });
  return sandbox.window.TLXShaders.chunked(THREE, {
    isWebGPU: () => false,
    releaseGeometry: geo => released.push(geo),
  });
}

test("free releases and disposes a plain geometry exactly once", () => {
  const released = [], sys = factory(released);
  const mesh = sys.build({
    pos: new Float32Array([0, 0, 0, 1, 0, 0, 0, 0, 1]),
    idx: new Uint16Array([0, 1, 2]),
  }, 72);
  const geo = mesh.geo;
  sys.free(mesh);
  assert.deepEqual(released, [geo]);
  assert.equal(geo.disposals, 1);
  assert.equal(mesh.geo, null);
});

test("free releases every chunk geometry before dropping the handle", () => {
  const released = [], sys = factory(released);
  const idx = new Uint16Array(2000 * 3);
  for (let t = 0; t < 2000; t++) {
    const base = t % 2 ? 3 : 0;
    idx[t * 3] = base; idx[t * 3 + 1] = base + 1; idx[t * 3 + 2] = base + 2;
  }
  const mesh = sys.build({
    pos: new Float32Array([
      0, 0, 0, 1, 0, 0, 0, 0, 1,
      400, 0, 0, 401, 0, 0, 400, 0, 1,
    ]),
    idx,
    _keepPositions: true,
  }, 72);
  // Copy out of the VM realm before deep comparison; the geometry identities
  // are host objects, but Array.prototype on mesh.chunks belongs to the VM.
  const geos = Array.from(mesh.chunks, ch => ch.geo);
  assert.equal(geos.length, 2, "fixture spans two spatial chunks");
  sys.free(mesh);
  assert.deepEqual(released, geos);
  assert.deepEqual(geos.map(g => g.disposals), [1, 1]);
  assert.equal(mesh.chunks, null);
  assert.equal(mesh.geo, null);
});

// DRAW MERGE (tlx-chunked.js build, PERF-FINDINGS §2ai): apex26.tlxChunkMerge
// folds k x k lamp cells into one draw chunk. The draw chunks must carry every
// triangle exactly once, and the lamp table must stay on the ORIGINAL cells —
// the lit shader looks lamps up by world cell, so a merge that widened the
// cells would squeeze more lamps under the same 24-lamp cap.
function mergeFactory(value) {
  const sandbox = {
    window: {}, localStorage: { getItem: (k) => (k === "apex26.tlxChunkMerge" ? value : null) },
    Float32Array, Uint32Array, Uint16Array, Uint8Array, Int16Array, Int32Array, Array, Map, Math,
    Frustum: {},
  };
  vm.createContext(sandbox);
  seedLog(sandbox);
  vm.runInContext(fs.readFileSync(SRC, "utf8"), sandbox, { filename: "tlx-chunked.js" });
  return sandbox.window.TLXShaders.chunked(THREE, { isWebGPU: () => false, releaseGeometry() {} });
}
function gridMesh() {
  // 6 x 6 cells of 72 m, 70 small triangles in each: 2520 tris, past the
  // 2000-tri threshold below which build() keeps one un-chunked geometry.
  const pos = [], idx = [];
  for (let cx = 0; cx < 6; cx++) for (let cz = 0; cz < 6; cz++) for (let t = 0; t < 70; t++) {
    const x = cx * 72 + 5 + (t % 10) * 6, z = cz * 72 + 5 + Math.floor(t / 10) * 8, v = pos.length / 3;
    pos.push(x, 0, z, x + 1, 0, z, x, 0, z + 1);
    idx.push(v, v + 1, v + 2);
  }
  return { pos: new Float32Array(pos), idx: new Uint32Array(idx) };
}
const triSet = (mesh) => {
  const all = [];
  for (const c of mesh.chunks) { const a = c.geo.index.array; for (let i = 0; i < a.length; i += 3) all.push(a[i] + "," + a[i + 1] + "," + a[i + 2]); }
  return all.sort();
};

test("merge 1 keeps one draw chunk per lamp cell and no separate lamp table", () => {
  const mesh = mergeFactory("1").build(gridMesh(), 72);
  assert.equal(mesh.chunks.length, 36);
  assert.equal(mesh.lampCells, null);
});

test("merge 2 folds 2x2 cells per draw, keeps every triangle once, and keeps the lamp cells", () => {
  const one = mergeFactory("1").build(gridMesh(), 72);
  const two = mergeFactory("2").build(gridMesh(), 72);
  assert.equal(two.chunks.length, 9, "6x6 cells -> 3x3 draw chunks");
  assert.deepEqual(triSet(two), triSet(one), "the merged draws cover exactly the same triangles");
  assert.equal(two.count, one.count);
  assert.equal(two.lampCells.length, 36, "the lamp table stays on the 72 m cells");
  const cellKeys = (cs) => Array.from(cs, (c) => c.gx + ":" + c.gz).sort();   // main-realm array: the build runs in a vm
  assert.deepEqual(cellKeys(two.lampCells), cellKeys(one.chunks), "same cell coordinates as the unmerged chunks");
  for (const c of two.chunks) for (let a = 0; a < 3; a++) assert.ok(c.min[a] <= c.max[a], "merged bounds are a real box");
});

test("the merge is ON by default (no stored value)", () => {
  const mesh = mergeFactory(null).build(gridMesh(), 72);
  assert.equal(mesh.chunks.length, 9);
});
