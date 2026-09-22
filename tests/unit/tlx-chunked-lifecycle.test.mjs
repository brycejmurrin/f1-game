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
