/* tlx-inst-cells — TLX's instanced-prop cull must reuse its pack by CELL SET.
 *
 * WHY THIS EXISTS. TLX's cullInstances memoised only on the exact six frustum
 * planes, which never repeat while the camera moves, so every prop batch
 * re-packed n x 16 floats and re-uploaded n x 64 bytes every frame. GLX and
 * WGX already key the resident pack on the SURVIVING CELL SET
 * (js/render/shared/inst-cells.js; docs/notes/PERF-FINDINGS.md §2c: -94.5 %
 * upload bytes on mobile). This lifts the REAL cullInstances/updateInstances
 * out of js/render/three/tlx.js (a re-implementation would test the test),
 * binds them to the real InstCells + Frustum and a counting stand-in for the
 * InstancedMesh write, and pins:
 *   - a moved camera with the same visible cells neither repacks nor uploads,
 *     and does NOT stamp _cullPlanes (it must keep naming the frustum that
 *     physically wrote imesh);
 *   - a changed cell set repacks and uploads;
 *   - the shadow cull (upload:false) never consults, records or disturbs it;
 *   - updateInstances invalidates it; apex26.instCellCache=0 turns it off.
 * No browser (~0.1 s). */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = rel => fs.readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8");
const TLX = read("js/render/three/tlx.js");

/** The source of `function <name>(` through its matching close brace. */
function lift(src, name) {
  const start = src.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} moved — update this test, do not delete it`);
  let depth = 0, i = src.indexOf("{", start);
  for (; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) break;
  }
  return src.slice(start, i + 1);
}

function load(storage = {}) {
  const localStorage = { getItem: k => (k in storage ? storage[k] : null) };
  // eslint-disable-next-line no-new-func
  const Frustum = new Function(read("js/render/shared/frustum.js") + ";return Frustum;")();
  // eslint-disable-next-line no-new-func
  const InstCells = new Function("localStorage",
    read("js/render/shared/inst-cells.js") + ";return InstCells;")(localStorage);
  const writes = [];
  const _writeInstanceMatrices = (imesh, m, c, n) => { writes.push(n); };
  const TLXShaders = { aabbInFrustum: Frustum.aabbInFrustum };
  // eslint-disable-next-line no-new-func
  const fns = new Function("TLXShaders", "InstCells", "_writeInstanceMatrices",
    `"use strict";${lift(TLX, "cullInstances")}\n${lift(TLX, "updateInstances")}\n` +
    "return { cullInstances, updateInstances };")(TLXShaders, InstCells, _writeInstanceMatrices);
  // Ten instances on a line, x = 5, 15, ... 95: one per 10 m cell.
  const n = 10, mats = new Float32Array(n * 16);
  for (let i = 0; i < n; i++) {
    const o = i * 16;
    mats[o] = mats[o + 5] = mats[o + 10] = mats[o + 15] = 1;
    mats[o + 12] = 5 + i * 10;
  }
  const batch = {
    instances: n, visible: n, imesh: {}, srcMatrices: mats, srcColors: null,
    packMatrices: new Float32Array(mats.length), packColors: null,
    cells: Frustum.bucketInstances(mats, n, [0.5, 0, 0], 10, 0.5),
  };
  return { ...fns, batch, writes };
}

/** Axis-aligned "frustum": xMin <= x <= xMax, everything else wide open. */
function slab(xMin, xMax) {
  return [
    [1, 0, 0, -xMin], [-1, 0, 0, xMax],
    [0, 1, 0, 1e4], [0, -1, 0, 1e4], [0, 0, 1, 1e4], [0, 0, -1, 1e4],
  ].map(p => Float32Array.from(p));
}

test("a moved camera over the same cells neither repacks nor uploads", () => {
  const { cullInstances, batch, writes } = load();
  assert.equal(cullInstances(batch, slab(0, 26)), 3);        // cells at x 5, 15, 25
  assert.deepEqual(writes, [3]);
  const snap = Float64Array.from(batch._cullPlanes);
  // The camera moved: every plane differs, the surviving cells do not.
  assert.equal(cullInstances(batch, slab(0.3, 26.7)), 3);
  assert.equal(cullInstances(batch, slab(-0.2, 27.4)), 3);
  assert.deepEqual(writes, [3], "same cell set must not re-upload");
  assert.equal(batch.visible, 3);
  assert.deepEqual(Array.from(batch._cullPlanes), Array.from(snap),
    "a cell-set hit must not stamp the plane snapshot");
});

test("a changed cell set repacks and uploads", () => {
  const { cullInstances, batch, writes } = load();
  cullInstances(batch, slab(0, 26));
  assert.equal(cullInstances(batch, slab(0, 36)), 4);
  assert.deepEqual(writes, [3, 4]);
  assert.equal(batch.packMatrices[3 * 16 + 12], 35, "the fourth packed instance is the new cell's");
  assert.equal(cullInstances(batch, slab(41, 61)), 2);
  assert.deepEqual(writes, [3, 4, 2]);
  assert.equal(batch.packMatrices[12], 45);
});

test("the shadow cull (upload:false) neither consults nor disturbs the key", () => {
  const { cullInstances, batch, writes } = load();
  cullInstances(batch, slab(0, 36));                          // camera: 4 cells
  // Shadow frustum over a DIFFERENT set: packs CPU-side, uploads nothing, and
  // leaves the camera count alone.
  assert.equal(cullInstances(batch, slab(50, 71), { upload: false }), 2);
  assert.equal(batch.visible, 4);
  // Shadow frustum over the SAME set as the camera: still packs (the shadow
  // path must never take the camera's hit — its pack lives in another mesh).
  assert.equal(cullInstances(batch, slab(0.1, 36.2), { upload: false }), 4);
  assert.equal(batch.packMatrices[12], 5, "shadow pack written");
  assert.deepEqual(writes, [4]);
  // The camera moves over its own set: still a hit — imesh holds its pack.
  assert.equal(cullInstances(batch, slab(-0.4, 35.6)), 4);
  assert.deepEqual(writes, [4]);
});

test("updateInstances invalidates the cell key", () => {
  const { cullInstances, updateInstances, batch, writes } = load();
  cullInstances(batch, slab(0, 26));
  updateInstances(batch, batch.srcMatrices, 7);               // caller-packed set
  assert.deepEqual(writes, [3, 7]);
  assert.equal(cullInstances(batch, slab(0.5, 26.5)), 3, "same cells as before the rewrite");
  assert.deepEqual(writes, [3, 7, 3], "a pack from no frustum must never be claimed");
});

test("apex26.instCellCache=0 turns the cell key off", () => {
  const { cullInstances, batch, writes } = load({ "apex26.instCellCache": "0" });
  cullInstances(batch, slab(0, 26));
  cullInstances(batch, slab(0.3, 26.7));
  assert.deepEqual(writes, [3, 3]);
  cullInstances(batch, slab(0.3, 26.7));                      // identical planes still hit
  assert.deepEqual(writes, [3, 3]);
});
