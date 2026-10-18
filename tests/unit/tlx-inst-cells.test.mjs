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
import { fnSource } from "../helpers/fn-source.mjs";

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
  const InstCells = new Function("localStorage", "Frustum",
    read("js/render/shared/inst-cells.js") + ";return InstCells;")(localStorage, Frustum);
  const writes = [];
  const _writeInstanceMatrices = (imesh, m, c, n) => { writes.push(n); };
  const TLXShaders = { aabbInFrustum: Frustum.aabbInFrustum };
  // eslint-disable-next-line no-new-func
  const fns = new Function("TLXShaders", "InstCells", "_writeInstanceMatrices", "Frustum",
    `"use strict"; const _mirActive = false, frameEye = null, frameCullDist = 0, frameCullFog = null,
      _mirEye = null, _mirCull = 0, _mirFog = null;
      ${lift(TLX, "cullInstances")}\n${lift(TLX, "updateInstances")}\n` +
    "return { cullInstances, updateInstances };")(TLXShaders, InstCells, _writeInstanceMatrices, Frustum);
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
  assert.equal(batch._shadowPack[12], 5, "shadow pack written");   // R3-RENDER-6: its own pack, not the camera's
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

// Exercise the production writer as well as the selector. CPU packs alias the
// attributes, while the simulated device arrays change ONLY when an update
// range is consumed. Checking CPU packs alone would miss a stale GPU suffix.
function loadGpuPack() {
  const localStorage = { getItem: () => null };
  // eslint-disable-next-line no-new-func
  const Frustum = new Function(read("js/render/shared/frustum.js") + ";return Frustum;")();
  // eslint-disable-next-line no-new-func
  const InstCells = new Function("localStorage", "Frustum",
    read("js/render/shared/inst-cells.js") + ";return InstCells;")(localStorage, Frustum);
  const TLXShaders = { aabbInFrustum: Frustum.aabbInFrustum };
  const declarations = ["setInstanceRange", "_writeInstanceMatrices", "cullInstances", "updateInstances"]
    .map(name => fnSource(TLX, `function ${name}(`)).join("\n");
  // Radial frame locals match load() — cullInstances reads frameEye/frameCullDist
  // (and _mir*) after the instance-suffix / radial cull work on this PR.
  // eslint-disable-next-line no-new-func
  const fns = new Function("TLXShaders", "InstCells", "_instColorAttr", "Frustum",
    `"use strict"; const _mirActive = false, frameEye = null, frameCullDist = 0, frameCullFog = null,
      _mirEye = null, _mirCull = 0, _mirFog = null;
      ${declarations}
      return { cullInstances, updateInstances, write: _writeInstanceMatrices };`)(TLXShaders, InstCells, mesh => mesh.tint, Frustum);

  function attribute(length) {
    let version = 0, sentVersion = 0;
    const attr = {
      array: new Float32Array(length), gpu: new Float32Array(length).fill(NaN),
      updateRanges: [],
      addUpdateRange(start, count) { this.updateRanges.push({ start, count }); },
      clearUpdateRanges() { this.updateRanges.length = 0; },
      get version() { return version; },
      set needsUpdate(value) { if (value) version++; },
      flush() {
        if (version === sentVersion) return [];
        const ranges = this.updateRanges.length ? this.updateRanges.map(r => ({ ...r })) : [{ start: 0, count: length }];
        for (const { start, count } of ranges) {
          assert.ok(start >= 0 && count > 0 && start + count <= length, "valid nonempty component range");
          this.gpu.set(this.array.subarray(start, start + count), start);
        }
        sentVersion = version;
        this.clearUpdateRanges();
        return ranges;
      },
    };
    return attr;
  }
  function batch() {
    const xs = [5, 6, 15, 25, 26, 27, 35, 36], matrices = new Float32Array(xs.length * 16), colors = new Float32Array(xs.length * 3);
    xs.forEach((x, i) => {
      const o = i * 16;
      matrices[o] = matrices[o + 5] = matrices[o + 10] = matrices[o + 15] = 1;
      matrices[o + 12] = x;
      colors.set([i + 0.25, i + 0.5, i + 0.75], i * 3);
    });
    const imesh = { userData: { tlxInstCap: xs.length }, instanceMatrix: attribute(matrices.length), tint: attribute(colors.length), count: 0 };
    return {
      instances: xs.length, visible: 0, imesh, srcMatrices: matrices, srcColors: colors,
      packMatrices: imesh.instanceMatrix.array, packColors: imesh.tint.array,
      cells: [[0, 1], [2], [3, 4, 5], [6, 7]].map((idx, i) => ({ idx,
        mn: [i * 10 + 4, -1, -1], mx: [i * 10 + 8, 1, 1] })),
    };
  }
  function flush(b, indices) {
    assert.equal(b.visible, indices.length);
    assert.equal(b.imesh.count, indices.length, "count changes even when a trailing suffix needs no upload");
    const matrix = b.imesh.instanceMatrix.flush(), tint = b.imesh.tint.flush();
    const expected = (src, stride) => indices.flatMap(i => Array.from(src.subarray(i * stride, (i + 1) * stride)));
    assert.deepEqual(Array.from(b.imesh.instanceMatrix.gpu.subarray(0, indices.length * 16)), expected(b.srcMatrices, 16), "device matrices match a full reference pack");
    assert.deepEqual(Array.from(b.imesh.tint.gpu.subarray(0, indices.length * 3)), expected(b.srcColors, 3), "device tint matches a full reference pack");
    return { matrix, tint };
  }
  return { ...fns, batch, flush };
}

test("instance suffix ranges preserve GPU matrices and tint across unequal-cell changes", () => {
  const { cullInstances, batch, flush } = loadGpuPack(), b = batch();
  cullInstances(b, slab(0, 20));
  assert.deepEqual(flush(b, [0, 1, 2]), { matrix: [{ start: 0, count: 48 }], tint: [{ start: 0, count: 9 }] });
  cullInstances(b, slab(0, 30));
  assert.deepEqual(flush(b, [0, 1, 2, 3, 4, 5]), { matrix: [{ start: 48, count: 48 }], tint: [{ start: 9, count: 9 }] });
  cullInstances(b, slab(0, 20));
  assert.deepEqual(flush(b, [0, 1, 2]), { matrix: [], tint: [] }, "pure suffix removal does not dirty buffers");
  cullInstances(b, slab(10, 30));
  assert.deepEqual(flush(b, [2, 3, 4, 5]), { matrix: [{ start: 0, count: 64 }], tint: [{ start: 0, count: 12 }] }, "prefix removal shifts every remaining row");
  cullInstances(b, slab(100, 110));
  assert.deepEqual(flush(b, []), { matrix: [], tint: [] });
  cullInstances(b, slab(0, 10));
  flush(b, [0, 1]);
});

test("an interior cell replacement preserves only the common prefix", () => {
  const { cullInstances, batch, flush } = loadGpuPack(), b = batch();
  cullInstances(b, slab(0, 30)); flush(b, [0, 1, 2, 3, 4, 5]);
  // Exclude B without changing cell identities or the immutable sources.
  const oldMin = b.cells[1].mn, oldMax = b.cells[1].mx;
  b.cells[1].mn = [100, -1, -1]; b.cells[1].mx = [101, 1, 1];
  cullInstances(b, slab(-0.1, 40));
  assert.deepEqual(flush(b, [0, 1, 3, 4, 5, 6, 7]), { matrix: [{ start: 32, count: 80 }], tint: [{ start: 6, count: 15 }] });
  b.cells[1].mn = oldMin; b.cells[1].mx = oldMax;
  cullInstances(b, slab(-0.2, 40));
  flush(b, [0, 1, 2, 3, 4, 5, 6, 7]);
});

test("pending initial and suffix writes are unioned until the renderer consumes them", () => {
  const { cullInstances, write, batch, flush } = loadGpuPack(), b = batch();
  write(b.imesh, b.srcMatrices, b.srcColors, b.instances);
  cullInstances(b, slab(0, 20));
  cullInstances(b, slab(0, 30));
  assert.deepEqual(flush(b, [0, 1, 2, 3, 4, 5]), { matrix: [{ start: 0, count: 96 }], tint: [{ start: 0, count: 18 }] }, "a full visible-prefix rewrite supersedes the initial capacity write");
  cullInstances(b, slab(0, 40));
  cullInstances(b, slab(0, 10));
  cullInstances(b, slab(0, 30));
  assert.deepEqual(flush(b, [0, 1, 2, 3, 4, 5]), { matrix: [{ start: 32, count: 96 }], tint: [{ start: 6, count: 18 }] }, "later writes keep an earlier pending tail");
  cullInstances(b, slab(0, 40));
  assert.deepEqual(flush(b, [0, 1, 2, 3, 4, 5, 6, 7]), { matrix: [{ start: 96, count: 32 }], tint: [{ start: 18, count: 6 }] }, "consumed ranges do not pollute the next render");
});

test("foreign instance writes invalidate prefix reuse and ignore a requested dirty suffix", () => {
  const { cullInstances, updateInstances, write, batch, flush } = loadGpuPack(), b = batch();
  cullInstances(b, slab(0, 20)); flush(b, [0, 1, 2]);
  const foreignMatrices = Float32Array.from(b.srcMatrices, x => x + 100), foreignColors = Float32Array.from(b.srcColors, x => x + 100);
  write(b.imesh, foreignMatrices, foreignColors, 3, 2);
  assert.deepEqual(b.imesh.instanceMatrix.updateRanges, [{ start: 0, count: 48 }]);
  assert.deepEqual(b.imesh.tint.updateRanges, [{ start: 0, count: 9 }]);
  b.imesh.instanceMatrix.flush(); b.imesh.tint.flush();
  updateInstances(b, foreignMatrices, 3, foreignColors);
  cullInstances(b, slab(0.1, 20.1));
  assert.deepEqual(flush(b, [0, 1, 2]), { matrix: [{ start: 0, count: 48 }], tint: [{ start: 0, count: 9 }] });
  // A tint-only external rewrite must likewise invalidate through the public API.
  updateInstances(b, b.srcMatrices, 3, foreignColors);
  cullInstances(b, slab(0.2, 20.2)); flush(b, [0, 1, 2]);
});

test("shadow culls and independent main/mirror packs cannot lend each other a prefix", () => {
  const { cullInstances, batch, flush } = loadGpuPack(), main = batch(), mirror = batch();
  cullInstances(main, slab(0, 20)); flush(main, [0, 1, 2]);
  cullInstances(mirror, slab(20, 40)); flush(mirror, [3, 4, 5, 6, 7]);
  cullInstances(main, slab(20, 40), { upload: false });
  assert.equal(main._shadowPack[12], 25);
  cullInstances(main, slab(0.1, 20.1));
  assert.deepEqual(flush(main, [0, 1, 2]), { matrix: [], tint: [] });
  cullInstances(main, slab(0, 30));
  assert.deepEqual(flush(main, [0, 1, 2, 3, 4, 5]), { matrix: [{ start: 48, count: 48 }], tint: [{ start: 9, count: 9 }] });
  cullInstances(mirror, slab(10, 40));
  assert.deepEqual(flush(mirror, [2, 3, 4, 5, 6, 7]), { matrix: [{ start: 0, count: 96 }], tint: [{ start: 0, count: 18 }] });
});

test("matrix-only external writes leave tint clean and offset views are foreign packs", () => {
  const { cullInstances, updateInstances, write, batch, flush } = loadGpuPack(), b = batch();
  cullInstances(b, slab(0, 30)); flush(b, [0, 1, 2, 3, 4, 5]);
  const tintVersion = b.imesh.tint.version, tintGpu = b.imesh.tint.gpu.slice();
  updateInstances(b, b.srcMatrices, 3, null);
  assert.equal(b.imesh.tint.version, tintVersion, "null colors do not dirty a resident tint attribute");
  assert.deepEqual(b.imesh.tint.gpu, tintGpu);
  b.imesh.instanceMatrix.flush();
  // Same ArrayBuffer is insufficient: this view starts one row later.
  const offsetView = b.imesh.instanceMatrix.array.subarray(16);
  const expected = offsetView.slice(0, 48);
  write(b.imesh, offsetView, null, 3, 2);
  assert.deepEqual(b.imesh.instanceMatrix.updateRanges, [{ start: 0, count: 48 }]);
  b.imesh.instanceMatrix.flush();
  assert.deepEqual(b.imesh.instanceMatrix.gpu.subarray(0, 48), expected);
  assert.equal(b.imesh.tint.version, tintVersion);
});
