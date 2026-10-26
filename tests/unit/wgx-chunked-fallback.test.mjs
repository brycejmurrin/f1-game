/* wgx-chunked-fallback — #3569: when WGX createChunkedMesh fails a GPU
 * buffer alloc it must fall back to core.createMesh (chunks:null), not leave
 * props/glass as an empty chunks:[] handle that draws nothing for the session.
 * Road/terrain already retry at the Tracks.buildRibbon call site; props and
 * glass assign the handle unchecked, so the fallback has to live here.
 *
 * Pure VM against WGXChunked.init(core); no browser, no GPU. Forces mkBuffer
 * / createBuffer failures and asserts createMesh still uploads.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { seedLog } from "../helpers/seed-log.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = new URL("../../", import.meta.url);
const WGX_CHUNKED_SOURCE = fs.readFileSync(
  new URL("js/render/webgpu/wgx-chunked.js", ROOT), "utf8");

/** Props/glass-sized grid: >2000 tris so createChunkedMesh does not bail early. */
function fatGeo(cells = 50) {
  const vCount = (cells + 1) * (cells + 1);
  const pos = new Float32Array(vCount * 3);
  const nrm = new Float32Array(vCount * 3);
  const col = new Float32Array(vCount * 3);
  const mat = new Float32Array(vCount);
  for (let z = 0; z <= cells; z++) {
    for (let x = 0; x <= cells; x++) {
      const i = z * (cells + 1) + x;
      pos[i * 3] = x; pos[i * 3 + 1] = 0; pos[i * 3 + 2] = z;
      nrm[i * 3 + 1] = 1;
      col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = 0.5;
      mat[i] = 1;
    }
  }
  const idx = new Uint32Array(cells * cells * 6);
  let o = 0;
  for (let z = 0; z < cells; z++) {
    for (let x = 0; x < cells; x++) {
      const a = z * (cells + 1) + x;
      idx[o++] = a; idx[o++] = a + 1; idx[o++] = a + cells + 1;
      idx[o++] = a + 1; idx[o++] = a + cells + 2; idx[o++] = a + cells + 1;
    }
  }
  return { pos, nrm, col, idx, mat, _keepPositions: true };
}

function loadApi(core) {
  const ctx = vm.createContext({
    window: {}, Float32Array, Uint16Array, Uint32Array, ArrayBuffer, Math,
    WeakMap, Map, Array, Object, Number, GPUBufferUsage: {
      VERTEX: 8, INDEX: 16, COPY_DST: 2, STORAGE: 4, UNIFORM: 1,
    },
  });
  seedLog(ctx);
  vm.runInContext(
    `${WGX_CHUNKED_SOURCE.replace(/^const\b/gm, "var")}\nthis.WGXChunked = WGXChunked;`,
    ctx,
    { filename: absSrc("js/render/webgpu/wgx-chunked.js") });
  return vm.runInContext("WGXChunked", ctx).init(core);
}

function makeCore(opts = {}) {
  const fails = opts.fail || {};
  let mkN = 0;
  const created = [];
  const allocFails = [];
  const createMeshCalls = [];
  const core = {
    VERTEX_FLOATS: 9,
    VERTEX_STRIDE: 36,
    toF32: (a) => (a instanceof Float32Array ? a : new Float32Array(a)),
    interleave(data) {
      const vCount = data.pos.length / 3;
      const vert = new Float32Array(vCount * 9);
      for (let i = 0; i < vCount; i++) {
        vert[i * 9] = data.pos[i * 3];
        vert[i * 9 + 1] = data.pos[i * 3 + 1];
        vert[i * 9 + 2] = data.pos[i * 3 + 2];
      }
      const attr = new Float32Array(vCount * 4);
      const big = vCount > 65535;
      return {
        vert, attr, idx: data.idx,
        count: data.idx.length,
        indexFormat: big ? "uint32" : "uint16",
        hasTrk: false,
      };
    },
    expandPull() { throw new Error("props path must not expandPull"); },
    makeRoadLUT() { throw new Error("props path must not makeRoadLUT"); },
    rememberRoadLut() {},
    mkBuffer(src) {
      mkN++;
      if (fails.mkAt === mkN || fails.mkAll) {
        throw new Error("GPUBuffer allocation failed (test)");
      }
      const buf = { size: src.byteLength || src.length * 4, destroy() {} };
      created.push(buf);
      return buf;
    },
    attrOrZero() {
      if (fails.attr) throw new Error("attr buffer allocation failed (test)");
      const sbuf = { destroy() {} };
      created.push(sbuf);
      return { sbuf, attrBG: {} };
    },
    allocFail(where, e) { allocFails.push({ where, msg: String(e && e.message || e) }); },
    createMesh(data) {
      createMeshCalls.push(data);
      if (fails.createMesh) throw new Error("createMesh also failed (test)");
      // Mimic a successful unchunked props upload.
      return {
        _wgx: "mesh",
        vbuf: { id: "fallback-vbuf", destroy() {} },
        ibuf: { id: "fallback-ibuf", destroy() {} },
        sbuf: null, attrBG: null,
        count: data.idx.length, indexFormat: "uint32", chunks: null,
      };
    },
    device: {
      createBuffer() {
        if (fails.createBuffer) throw new Error("createBuffer failed (test)");
        const buf = { destroy() {} };
        created.push(buf);
        return buf;
      },
      queue: { writeBuffer() {} },
    },
  };
  return { core, created, allocFails, createMeshCalls };
}

test("WGX chunked props: vertex-buffer alloc failure falls back to createMesh (chunks:null)", () => {
  const { core, allocFails, createMeshCalls } = makeCore({ fail: { mkAt: 1 } });
  const api = loadApi(core);
  const geo = fatGeo(50); // 5000 tris
  assert.ok((geo.idx.length / 3) > 2000, "fixture must enter the chunk path");
  const mesh = api.createChunkedMesh(geo, 72);
  assert.equal(createMeshCalls.length, 1, "createMesh is the sync fallback");
  assert.equal(createMeshCalls[0], geo, "fallback sees intact source geometry");
  assert.equal(mesh.chunks, null, "chunks:null marks a live plain mesh (not chunks:[])");
  assert.ok(mesh.vbuf, "fallback mesh still has a vertex buffer");
  assert.ok(mesh.count > 0, "fallback mesh still has triangles");
  assert.ok(allocFails.some((a) => a.where === "createChunkedMesh"),
    "chunk failure still records allocFail");
  assert.ok(geo.pos && geo.idx, "source not nulled on the failure path");
});

test("WGX chunked props: index/attr alloc failure falls back to createMesh", () => {
  const { core, createMeshCalls } = makeCore({ fail: { attr: true } });
  const api = loadApi(core);
  const geo = fatGeo(50);
  const mesh = api.createChunkedMesh(geo, 72);
  assert.equal(createMeshCalls.length, 1);
  assert.equal(mesh.chunks, null);
  assert.ok(mesh.vbuf);
  assert.ok(mesh.count > 0);
});

test("WGX chunked props: if createMesh also fails, return empty chunks:[] (no throw)", () => {
  const { core, allocFails } = makeCore({ fail: { mkAt: 1, createMesh: true } });
  const api = loadApi(core);
  const mesh = api.createChunkedMesh(fatGeo(50), 72);
  assert.ok(Array.isArray(mesh.chunks) && mesh.chunks.length === 0);
  assert.equal(mesh.vbuf, null);
  assert.ok(allocFails.some((a) => a.where === "createChunkedMesh.fallback"));
});

test("WGX chunked road (trk) path: createBuffer failure falls back to createMesh", () => {
  const { core, createMeshCalls } = makeCore({ fail: { createBuffer: true } });
  // Road path needs interleave + expandPull + makeRoadLUT.
  core.interleave = (data) => ({
    vert: new Float32Array((data.pos.length / 3) * 9),
    attr: new Float32Array((data.pos.length / 3) * 4),
    idx: data.idx, count: data.idx.length, indexFormat: "uint32", hasTrk: true,
  });
  const vCount = fatGeo(50).pos.length / 3;
  // expandPull is called with (b.vert, b.attr, b.idx) — length from vert.
  core.expandPull = (vert) => {
    const n = (vert.length / core.VERTEX_FLOATS) | 0;
    return { vert, attr: new Float32Array(n * 4), count: n };
  };
  core.makeRoadLUT = () => ({ sbuf: { destroy() {} }, attrBG: {} });
  const api = loadApi(core);
  const geo = fatGeo(50);
  geo.trk = new Float32Array(vCount * 3);
  const mesh = api.createChunkedMesh(geo, 72);
  assert.equal(createMeshCalls.length, 1, "trk path also falls back");
  assert.equal(mesh.chunks, null);
  assert.ok(mesh.vbuf);
});
