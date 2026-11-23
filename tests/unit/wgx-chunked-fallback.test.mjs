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

// Night drawChunked used to allocate and bind a draw slot before it knew
// which runs would draw, then bind again per run. Equal lamp masks share
// one slot; a culled gap with the same mask is one bind for two draws.
function aabbDist2(mn, mx, ex, ey, ez) {
  const dx = ex < mn[0] ? mn[0] - ex : ex > mx[0] ? ex - mx[0] : 0;
  const dy = ey < mn[1] ? mn[1] - ey : ey > mx[1] ? ey - mx[1] : 0;
  const dz = ez < mn[2] ? mn[2] - ez : ez > mx[2] ? ez - mx[2] : 0;
  return dx * dx + dy * dy + dz * dz;
}

function loadDraw(core, extra) {
  const ctx = vm.createContext({
    window: {}, Float32Array, Uint16Array, Uint32Array, ArrayBuffer, Math,
    WeakMap, Map, Array, Object, Number,
    Frustum: {
      extractPlanes() {},
      aabbInFrustum(planes, mn) { return !extra.hidden || !extra.hidden.has(mn[0]); },
      radialCulled() { return false; },
      aabbDist2,
    },
    LampChunks: extra.lamps || { resolve() { return extra.table; } },
    GPUBufferUsage: { VERTEX: 8, INDEX: 16, COPY_DST: 2, STORAGE: 4, UNIFORM: 1 },
  });
  seedLog(ctx);
  vm.runInContext(
    `${WGX_CHUNKED_SOURCE.replace(/^const\b/gm, "var")}\nthis.WGXChunked = WGXChunked;`,
    ctx,
    { filename: absSrc("js/render/webgpu/wgx-chunked.js") });
  return vm.runInContext("WGXChunked", ctx).init(core);
}

function drawCore(opts = {}) {
  const ring = new Float32Array(64 * 16);
  if (opts.stale35 != null) ring[64 + 35] = opts.stale35;
  const binds = [];
  const draws = [];
  const writes = [];
  let slotN = 0;
  const cap = opts.cap == null ? 16 : opts.cap;
  const core = {
    DRAW_STRIDE: 256,
    DRAW_F32_STRIDE: 64,
    CHUNK_IDX_CAP: 16384,
    LAMP_MASK_ALL: 16777215,
    litPass: { setBindGroup(i, bg, off) { if (i === 1) binds.push(off[0]); } },
    activeFrameBG: {},
    drawBindGroup: {},
    drawRing: ring,
    dynOff: [0],
    identInstanceBuf: {},
    roadLutBG: {},
    frameViewProj: opts.cull === false ? null : [1],
    frameEye: [0, 1, 0],
    frameCullDist: 0,
    frameCullFog: null,
    fcPlanes: [],
    fcPlanesIsFrame: true,
    frameNL: opts.nL == null ? 9 : opts.nL,
    frameLights: opts.lights || null,
    lampPass: 0,
    framePerChunk: opts.perChunk || 0,
    frameAllLights: opts.allLights || null,
    frameRoadChunkLamps: opts.roadChunk || 0,
    chunkIdxSBO: {},
    device: { queue: { writeBuffer() {} } },
    allocDrawSlot() { if (slotN >= cap) return -1; return slotN++; },
    writeDraw(slot) {
      writes.push(slot);
      const b = slot * 64;
      ring[b + 16] = 42;
      ring[b + 28] = 16777215;
      ring[b + 29] = 16777215;
      ring[b + 30] = 0;
      ring[b + 32] = 0; ring[b + 33] = 0; ring[b + 34] = 0;
      ring[b + 35] = 1;
    },
    setPipe() {},
    setBG0() {},
    litPipeline() { return {}; },
    litOpts(o) { return o || {}; },
    bindLitVerts() {},
    drawGeom(pass, mesh) { draws.push({ count: mesh.count, first: mesh.first | 0, firstIndex: mesh.firstIndex | 0 }); },
  };
  return { core, ring, binds, draws, writes, slots: () => slotN };
}

function lampBuf(x, rad) {
  const L = new Float32Array(9 * 15);
  L[0] = x; L[1] = 1; L[2] = 0; L[6] = rad;
  return L;
}

function roadMesh(spans) {
  const vbuf = { id: "v" }, attrBG = { id: "a" };
  let first = 0;
  const chunks = spans.map(([x0, x1]) => {
    const ch = {
      vbuf, ibuf: null, attrBG, first, count: 100,
      min: [x0, 0, -5], max: [x1, 4, 5],
    };
    first += 100;
    return ch;
  });
  return { vbuf, attrBG, chunks, indexFormat: "uint32" };
}

test("night road chunks with the same lamp mask are one draw and one bind", () => {
  const h = drawCore({ lights: lampBuf(5, 80) });
  const api = loadDraw(h.core, { hidden: new Set() });
  api.drawChunked(roadMesh([[0, 10], [10, 20]]), null, { surfaceId: 16 });
  assert.equal(h.draws.length, 1, "equal masks merge");
  assert.equal(h.draws[0].count, 200);
  assert.equal(h.binds.length, 1, "one setBindGroup for the merged run");
  assert.equal(h.slots(), 1, "no orphan base slot");
  assert.equal(h.ring[28], 1, "the lamp bit is the run mask");
  assert.equal(h.ring[35], 1, "packDraw comes from the draw, not a stale slot");
});

test("a culled gap with the same mask reuses the bound slot", () => {
  const h = drawCore({ lights: lampBuf(50, 200) });
  const api = loadDraw(h.core, { hidden: new Set([100]) });
  api.drawChunked(roadMesh([[0, 10], [100, 110], [200, 210]]), null, { surfaceId: 16 });
  assert.equal(h.draws.length, 2, "the culled chunk splits the draw");
  assert.equal(h.binds.length, 1, "the second run's mask matches, so group 1 stays");
  assert.equal(h.slots(), 1);
});

test("a wider night mask is its own draw and its own slot", () => {
  const h = drawCore({ lights: lampBuf(5, 12), stale35: 99 });
  h.ring[31] = 7;
  const api = loadDraw(h.core, { hidden: new Set() });
  api.drawChunked(roadMesh([[0, 10], [80, 90]]), null, { surfaceId: 16 });
  assert.equal(h.draws.length, 2);
  assert.equal(h.binds.length, 2);
  assert.equal(h.slots(), 2);
  assert.equal(h.ring[28] & 1, 1, "near chunk sees the lamp");
  assert.equal(h.ring[64 + 28], 0, "far chunk does not");
  assert.equal(h.ring[64 + 16], 42, "material lanes were copied, not left stale");
  assert.equal(h.ring[64 + 35], 1, "packDraw is the draw's 1, not the prefilled 99");
  assert.equal(h.ring[64 + 34], 0, "lampRange stays off on the mask path");
  assert.equal(h.ring[31], 0, "padding lane is cleared on the first night slot");
  assert.equal(h.ring[64 + 31], 0, "padding lane is not copied from the base slot");
});

test("day chunked draws still merge and bind once, and a fully culled mesh takes no slot", () => {
  const h = drawCore({ nL: 0, lights: null });
  const api = loadDraw(h.core, { hidden: new Set() });
  api.drawChunked(roadMesh([[0, 10], [10, 20]]), null, { surfaceId: 16 });
  assert.equal(h.draws.length, 1);
  assert.equal(h.binds.length, 1);
  assert.equal(h.slots(), 1);
  const culled = drawCore({ nL: 9, lights: lampBuf(5, 80) });
  const api2 = loadDraw(culled.core, { hidden: new Set([0, 10]) });
  api2.drawChunked(roadMesh([[0, 10], [10, 20]]), null, { surfaceId: 16 });
  assert.equal(culled.draws.length, 0);
  assert.equal(culled.slots(), 0, "nothing visible, nothing allocated");
  assert.equal(culled.binds.length, 0);
});

test("indexed night chunks still merge across different masks", () => {
  const h = drawCore({ lights: lampBuf(5, 12) });
  const api = loadDraw(h.core, { hidden: new Set() });
  const vbuf = { id: "v" }, ibuf = { id: "i" }, attrBG = { id: "a" };
  const mesh = {
    vbuf, ibuf, attrBG, indexFormat: "uint16",
    chunks: [
      { vbuf, ibuf, attrBG, firstIndex: 0, count: 30, indexFormat: "uint16", min: [0, 0, -5], max: [10, 4, 5] },
      { vbuf, ibuf, attrBG, firstIndex: 30, count: 30, indexFormat: "uint16", min: [80, 0, -5], max: [90, 4, 5] },
    ],
  };
  api.drawChunked(mesh, null, { surfaceId: 1 });
  assert.equal(h.draws.length, 1, "indexed runs still OR their masks into one draw");
  assert.equal(h.draws[0].count, 60);
  assert.equal(h.binds.length, 1);
  assert.equal(h.slots(), 1);
  assert.equal(h.ring[28] & 1, 1, "the union keeps the near lamp");
});

test("per-chunk draws copy the draw uniform and do not spend an orphan slot", () => {
  const table = {
    concat: new Uint32Array([1, 2, 3, 4, 5, 6]),
    offsets: [0, 2, 4],
    counts: [2, 2, 2],
  };
  const h = drawCore({ perChunk: 1, allLights: new Float32Array(15), nL: 0 });
  const api = loadDraw(h.core, { table, hidden: new Set() });
  const vbuf = { id: "v" };
  const mesh = {
    vbuf,
    chunks: [0, 1, 2].map((i) => ({
      vbuf, min: [i * 30, 0, 0], max: [i * 30 + 10, 2, 10], count: 12, first: i * 12,
    })),
  };
  api.drawChunked(mesh, null, { surfaceId: 1 });
  assert.equal(h.writes.length, 1, "one writeDraw, the rest are copies");
  assert.equal(h.draws.length, 3);
  assert.equal(h.binds.length, 3, "each chunk's dynamic offset still binds");
  assert.equal(h.slots(), 3, "no leading unused slot");
  assert.equal(h.ring[64 + 16], 42);
  assert.equal(h.ring[64 + 32], 2, "second chunk's lamp-table offset");
  assert.equal(h.ring[64 + 33], 2);
  assert.equal(h.ring[64 + 34], 1);
  assert.equal(h.ring[64 + 35], 1);
});

test("a full draw ring drops the extra night run instead of rewriting a drawn slot", () => {
  const h = drawCore({ lights: lampBuf(5, 12), cap: 1 });
  const api = loadDraw(h.core, { hidden: new Set() });
  api.drawChunked(roadMesh([[0, 10], [80, 90]]), null, { surfaceId: 16 });
  assert.equal(h.draws.length, 1);
  assert.equal(h.slots(), 1);
  assert.equal(h.ring[28] & 1, 1, "the drawn slot keeps the first run's mask");
});
