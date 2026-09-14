/* chunked-index-ranges.test.mjs — the equivalence proof for the concatenated
 * chunk index buffer.
 *
 * js/render/glx/chunked.js used to give every spatial chunk its OWN index
 * buffer, so drawChunked issued one bindBuffer + one drawElements per visible
 * chunk (measured over 12 stations a lap against the real camera frustum:
 * 146.9 visible chunks on spa, 100.9 on vegas, 79.3 on monza, plus 36.8 for
 * vegas glass). Chunk indices are ABSOLUTE into the shared VBO and the index
 * type is uniform per mesh, so the buffers can be concatenated and each chunk
 * reduced to a (byteOffset, count) RANGE — which lets adjacent visible chunks
 * merge into a single drawElements.
 *
 * That is an equivalence claim: "the same triangles, in the same order, in
 * fewer calls". This suite tests it as one, against a stub GL context, with no
 * browser and no GPU:
 *
 *   1. the concatenated buffer IS the ordered concatenation of the per-chunk
 *      arrays — byte for byte;
 *   2. every chunk's (byteOffset, count) slices exactly its own indices, with
 *      the offset a whole multiple of the index size (drawElements rejects a
 *      misaligned offset);
 *   3. the ranges tile the buffer with no gap and no overlap;
 *   4. MERGING a run of adjacent chunks yields the identical index sequence to
 *      drawing them one at a time — the property the merge loop relies on.
 *
 * Note the test asserts against the array the code actually uploaded, not
 * against a re-derivation of what it should have uploaded: the stub records
 * bufferData/bufferSubData verbatim and the assertions read that recording.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { seedLog } from "../helpers/seed-log.mjs";
import { seedFrustum } from "../helpers/seed-frustum.mjs";

const SRC = new URL("../../js/render/glx/chunked.js", import.meta.url);
const PACK_SRC = new URL("../../js/render/shared/vertex-pack.js", import.meta.url);

// ── Stub GL: enough of WebGL2 for createChunkedMesh, and it REMEMBERS the
// element-array uploads so the assertions can read real bytes back.
function makeGL() {
  const gl = {
    ARRAY_BUFFER: 0x8892, ELEMENT_ARRAY_BUFFER: 0x8893, STATIC_DRAW: 0x88e4,
    FLOAT: 0x1406, TRIANGLES: 4, UNSIGNED_INT: 0x1405, UNSIGNED_SHORT: 0x1403,
    SHORT: 0x1402,
    _elem: null,            // the bound element buffer's record
    _array: null,           // the bound ARRAY_BUFFER record (VBO)
    _attribs: [],
    _enabled: new Set(),
    _buffers: [],
    createVertexArray: () => ({}), bindVertexArray: () => {},
    createBuffer() { const b = { id: this._buffers.length, bytes: null, vbo: null }; this._buffers.push(b); return b; },
    bindBuffer(target, buf) {
      if (target === this.ELEMENT_ARRAY_BUFFER) this._elem = buf;
      if (target === this.ARRAY_BUFFER) this._array = buf;
    },
    // The VBO upload is a PACKED ArrayBuffer (mixed float32/int16/uint16 —
    // js/render/shared/vertex-pack.js), so it is recorded as raw bytes and the
    // assertions build their own views over it, exactly as the GPU would.
    bufferData(target, src) {
      // `instanceof ArrayBuffer` is false across the vm realm boundary — the
      // packer allocates inside the sandbox. Brand-check instead, and copy the
      // bytes into a host buffer so the assertions can view them.
      if (target === this.ARRAY_BUFFER && this._array &&
          Object.prototype.toString.call(src) === "[object ArrayBuffer]") {
        this._array.vbo = Uint8Array.from(new Uint8Array(src)).buffer;
        return;
      }
      if (target !== this.ELEMENT_ARRAY_BUFFER) return;
      // Size-only allocation is the path createChunkedMesh takes.
      this._elem.bytes = typeof src === "number"
        ? new Uint8Array(src)
        : new Uint8Array(src.buffer.slice(0));
    },
    bufferSubData(target, byteOffset, src) {
      if (target !== this.ELEMENT_ARRAY_BUFFER) return;
      this._elem.bytes.set(new Uint8Array(src.buffer, src.byteOffset, src.byteLength), byteOffset);
    },
    enableVertexAttribArray(i) { this._enabled.add(i); },
    vertexAttribPointer(idx, size, type, norm, stride, offset) {
      this._attribs.push({ idx, size, type, norm, stride, offset });
    },
    deleteBuffer: () => {}, deleteVertexArray: () => {},
  };
  return gl;
}

// The packer's own constants, read from the module rather than copied here —
// a hardcoded 13107 would keep passing after someone changed the scale.
const VP = (() => {
  const ctx = { console };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(PACK_SRC, "utf8") +
                  "\n;globalThis.__P = VertexPack;", ctx);
  return ctx.__P;
})();

function loadChunked(gl) {
  const code = fs.readFileSync(SRC, "utf8");
  const ctx = { console };
  vm.createContext(ctx);
  seedLog(ctx);
  seedFrustum(ctx);
  // The REAL vertex packer, not a stand-in: these tests assert the bytes that
  // reach the GPU, so a reimplementation here would only prove itself.
  vm.runInContext(fs.readFileSync(PACK_SRC, "utf8") +
                  "\n;globalThis.VertexPack = VertexPack;", ctx);
  vm.runInContext(code + "\n;globalThis.__GLXChunked = GLXChunked;", ctx);
  return ctx.__GLXChunked.init({
    gl,
    frame: {},
    bindVAO: () => {}, setBlend: () => {}, setDepthMask: () => {},
    toF32: (a) => (a instanceof Float32Array ? a : new Float32Array(a)),
    createMesh: (d) => ({ plain: true, data: d }),
    litMaterial: () => 1,
    invalidateVAO: () => {},
  });
}

// A grid of separated unit quads. Each lands in its own 72 m cell, so the
// bucket count is predictable and > 1 — the case the merge loop exists for.
// triCount must exceed 2000 or createChunkedMesh returns a plain mesh.
function makeGrid(cellsX, cellsZ, quadsPerCell) {
  const pos = [], nrm = [], col = [], idx = [];
  let v = 0;
  for (let cx = 0; cx < cellsX; cx++) {
    for (let cz = 0; cz < cellsZ; cz++) {
      for (let q = 0; q < quadsPerCell; q++) {
        const ox = cx * 400 + q * 0.5, oz = cz * 400;   // 400 m apart => distinct cells
        pos.push(ox, 0, oz,  ox + 1, 0, oz,  ox + 1, 0, oz + 1,  ox, 0, oz + 1);
        for (let k = 0; k < 4; k++) { nrm.push(0, 1, 0); col.push(1, 1, 1); }
        idx.push(v, v + 1, v + 2,  v, v + 2, v + 3);
        v += 4;
      }
    }
  }
  return { pos: new Float32Array(pos), nrm: new Float32Array(nrm),
           col: new Float32Array(col), idx: new Uint32Array(idx), _keepPositions: true };
}

function readIndices(gl, mesh) {
  const big = mesh.indexType === gl.UNSIGNED_INT;
  const bytes = gl._buffers.find((b) => b.bytes && b.bytes.length === mesh.count * (big ? 4 : 2));
  assert.ok(bytes, "no element buffer of the whole-mesh size was uploaded");
  return big ? new Uint32Array(bytes.bytes.buffer) : new Uint16Array(bytes.bytes.buffer);
}

test("chunks are ranges into ONE index buffer, tiling it with no gap or overlap", () => {
  const gl = makeGL();
  const C = loadChunked(gl);
  const mesh = C.createChunkedMesh(makeGrid(6, 6, 30), 72);   // 36 cells, 2160 tris

  assert.ok(mesh.chunks && mesh.chunks.length > 1,
    `expected a multi-chunk mesh, got ${mesh.chunks ? mesh.chunks.length : "none"}`);
  const bpi = mesh.indexType === gl.UNSIGNED_INT ? 4 : 2;

  let expect = 0;
  for (const ch of mesh.chunks) {
    assert.equal(ch.byteOffset % bpi, 0,
      "a byteOffset not a whole multiple of the index size — drawElements rejects it");
    assert.equal(ch.byteOffset, expect * bpi, "chunk ranges must tile in order, with no gap");
    assert.ok(ch.count > 0, "an empty chunk range would be a silently dropped bucket");
    expect += ch.count;
  }
  assert.equal(expect, mesh.count,
    "the chunk ranges must cover the whole buffer — a short total is dropped geometry");
  // No chunk owns a buffer any more; freeChunkedMesh deletes mesh.ib alone.
  assert.equal(mesh.chunks.some((c) => c.ibo !== undefined), false,
    "chunks must not carry their own ibo — freeChunkedMesh no longer deletes per chunk");
});

test("the concatenated buffer IS the ordered concatenation of the chunk ranges", () => {
  const gl = makeGL();
  const C = loadChunked(gl);
  // 6x6x30 = 1080 quads = 2160 triangles, safely over the 2000-tri floor below
  // which createChunkedMesh returns a plain unchunked mesh.
  const src = makeGrid(6, 6, 30);
  const srcIdx = Uint32Array.from(src.idx);          // createChunkedMesh nulls data.idx
  const mesh = C.createChunkedMesh(src, 72);
  assert.ok(mesh.chunks, "fixture too small to chunk — the assertions below would be vacuous");
  const all = readIndices(gl, mesh);

  assert.equal(all.length, srcIdx.length,
    "every source index must survive the round trip into the shared buffer");

  // Each range holds whole triangles, and every index it holds is a real vertex.
  const vCount = 6 * 6 * 30 * 4;
  const bpi = mesh.indexType === gl.UNSIGNED_INT ? 4 : 2;
  const seen = new Map();
  for (const ch of mesh.chunks) {
    assert.equal(ch.count % 3, 0, "a range that splits a triangle would tear the mesh");
    const from = ch.byteOffset / bpi;
    for (let i = from; i < from + ch.count; i++) {
      assert.ok(all[i] < vCount, `index ${all[i]} out of range — chunk indices must stay ABSOLUTE`);
      seen.set(all[i], (seen.get(all[i]) || 0) + 1);
    }
  }
  // Same multiset of indices as the source: nothing added, nothing lost.
  const want = new Map();
  for (const i of srcIdx) want.set(i, (want.get(i) || 0) + 1);
  assert.deepEqual([...seen.entries()].sort((a, b) => a[0] - b[0]),
                   [...want.entries()].sort((a, b) => a[0] - b[0]),
                   "the buffer must hold exactly the source indices, with the same multiplicities");
});

test("merging a run of adjacent chunks draws the identical index sequence", () => {
  const gl = makeGL();
  const C = loadChunked(gl);
  const mesh = C.createChunkedMesh(makeGrid(6, 6, 30), 72);
  const all = readIndices(gl, mesh);
  const bpi = mesh.indexType === gl.UNSIGNED_INT ? 4 : 2;

  // This is the merge loop's core assumption, stated directly: for ANY run of
  // consecutive chunks, one draw over the summed count from the run's first
  // offset covers exactly what the per-chunk draws covered, in order.
  const chunks = mesh.chunks;
  let runsChecked = 0;
  for (let a = 0; a < chunks.length; a++) {
    for (let b = a; b < Math.min(a + 5, chunks.length); b++) {
      const perChunk = [];
      for (let i = a; i <= b; i++) {
        const from = chunks[i].byteOffset / bpi;
        for (let k = from; k < from + chunks[i].count; k++) perChunk.push(all[k]);
      }
      let sum = 0;
      for (let i = a; i <= b; i++) sum += chunks[i].count;
      const from = chunks[a].byteOffset / bpi;
      const merged = Array.from(all.subarray(from, from + sum));
      assert.deepEqual(merged, perChunk,
        `merging chunks ${a}..${b} changed the index sequence`);
      runsChecked++;
    }
  }
  // Anti-vacuity: a mesh with one chunk, or a loop that never ran, would pass
  // every assertion above while proving nothing.
  assert.ok(chunks.length > 4, `need several chunks to prove merging, got ${chunks.length}`);
  assert.ok(runsChecked > 20, `too few runs exercised (${runsChecked})`);
});

test("a mesh too small to chunk still comes back as a plain mesh", () => {
  const gl = makeGL();
  const C = loadChunked(gl);
  // Under the 2000-triangle floor: createChunkedMesh must bail to createMesh,
  // and the draw path's `!mesh.chunks` branch must stay reachable.
  const m = C.createChunkedMesh(makeGrid(2, 2, 20), 72);   // 320 tris
  assert.equal(m.chunks, null, "a sub-2000-triangle mesh must not be chunked");
});

test("createChunkedMesh packs to 28 bytes without trk and leaves attrib 4 off", () => {
  const gl = makeGL();
  const C = loadChunked(gl);
  const mesh = C.createChunkedMesh(makeGrid(6, 6, 30), 72);
  assert.ok(mesh.chunks, "fixture must chunk so the interleaved path runs");
  assert.equal(gl._enabled.has(4), false, "no data.trk → attrib 4 stays generic (0,0,0)");
  assert.equal(gl._attribs.some((a) => a.idx === 4), false);
  assert.equal(gl._enabled.has(3), false,
    "attrib 3 is gone for good — the material id rides in the alpha of attrib 2");
  const vbo = gl._buffers.find((b) => b.vbo);
  assert.ok(vbo && vbo.vbo, "VBO upload must be recorded");
  assert.equal(vbo.vbo.byteLength, 6 * 6 * 30 * 4 * 28,
    "28 bytes a vertex: pos f32x3 + nrm i16x4 + col/mat u16x4");
});

test("the packed attribute pointers match the format vertex-pack.js documents", () => {
  const gl = makeGL();
  const C = loadChunked(gl);
  C.createChunkedMesh(makeGrid(6, 6, 30), 72);
  const at = (i) => gl._attribs.find((a) => a.idx === i);
  // A wrong type or a dropped `normalized` here is invisible to every other
  // assertion in this file and draws a black or blown-out world on the GPU.
  assert.deepEqual(
    { size: at(0).size, type: at(0).type, norm: at(0).norm, stride: at(0).stride, offset: at(0).offset },
    { size: 3, type: gl.FLOAT, norm: false, stride: 28, offset: 0 }, "attrib 0 = position");
  assert.deepEqual(
    { size: at(1).size, type: at(1).type, norm: at(1).norm, stride: at(1).stride, offset: at(1).offset },
    { size: 4, type: gl.SHORT, norm: true, stride: 28, offset: 12 }, "attrib 1 = normal");
  assert.deepEqual(
    { size: at(2).size, type: at(2).type, norm: at(2).norm, stride: at(2).stride, offset: at(2).offset },
    { size: 4, type: gl.UNSIGNED_SHORT, norm: true, stride: 28, offset: 20 }, "attrib 2 = colour + material");
});

test("packed normals, colours and material ids survive the round trip", () => {
  const gl = makeGL();
  const C = loadChunked(gl);
  const src = makeGrid(6, 6, 30);
  const vCount = src.pos.length / 3;
  // makeGrid paints (0,1,0) normals and white; overwrite vertex 0 with values
  // that exercise the signs, the >1 emissive range and a whole material id.
  src.nrm[0] = -1; src.nrm[1] = 0; src.nrm[2] = 0;
  src.col[0] = 3.2; src.col[1] = 0.5; src.col[2] = 0;      // 3.2 = the fleet's brightest neon
  src.mat = new Float32Array(vCount);
  src.mat[0] = 16;                                          // MAT.ASPHALT, the top of the table
  src.mat[1] = 15.4;                                        // FLAG id + wave weight
  C.createChunkedMesh(src, 72);
  const raw = gl._buffers.find((b) => b.vbo).vbo;
  const f32 = new Float32Array(raw), i16 = new Int16Array(raw), u16 = new Uint16Array(raw);
  assert.equal(f32[0], src.pos[0], "position stays exact float32");
  assert.equal(i16[6] / 32767, -1, "normal x round-trips through the signed short");
  assert.ok(Math.abs(u16[10] / VP.COL_Q - 3.2) < 1e-3, "emissive colour survives past 1.0");
  assert.ok(Math.abs(u16[11] / VP.COL_Q - 0.5) < 1e-3);
  // The exactness the FLAG branch in LIT_VS depends on: a whole id must decode
  // to ITSELF, or int(aMat + 0.5) picks the wrong material.
  assert.equal(u16[13] / VP.MAT_Q, 16, "material 16 decodes bit-exactly, not 15.99998");
  assert.ok(Math.abs(u16[14 + 13] / VP.MAT_Q - 15.4) < 1e-3, "the FLAG wave weight survives");
});

test("createChunkedMesh widens the stride to 40 and enables attrib 4 for road trk", () => {
  const gl = makeGL();
  const C = loadChunked(gl);
  const src = makeGrid(6, 6, 30);
  const vCount = src.pos.length / 3;
  const trk = new Float32Array(vCount * 3);
  for (let i = 0; i < vCount; i++) {
    trk[i * 3] = 10 + i;
    trk[i * 3 + 1] = 0.5;
    trk[i * 3 + 2] = 6;
  }
  src.trk = trk;
  const mesh = C.createChunkedMesh(src, 72);
  assert.ok(mesh.chunks, "fixture must chunk");
  assert.ok(gl._enabled.has(4), "attrib 4 (vTrk) must be enabled when data.trk is present");
  const a4 = gl._attribs.find((a) => a.idx === 4);
  assert.ok(a4, "attrib 4 pointer must be set");
  assert.equal(a4.size, 3);
  assert.equal(a4.type, gl.FLOAT, "track coords stay float32 — s runs to ~7 km");
  assert.equal(a4.stride, 40, "28 packed bytes + trk f32x3");
  assert.equal(a4.offset, 28);
  const raw = gl._buffers.find((b) => b.vbo).vbo;
  assert.equal(raw.byteLength, vCount * 40);
  const f32 = new Float32Array(raw);
  assert.equal(f32[7], 10);
  assert.equal(f32[8], 0.5);
  assert.equal(f32[9], 6);
  assert.equal(f32[10 + 7], 11, "the next vertex starts one 40-byte stride on");
});

test("a material column costs no extra byte now that it rides in attrib 2", () => {
  const gl = makeGL();
  const C = loadChunked(gl);
  const src = makeGrid(6, 6, 30);
  const vCount = src.pos.length / 3;
  src.mat = new Float32Array(vCount);
  src.mat[0] = 3;
  const trk = new Float32Array(vCount * 3);
  trk[0] = 100; trk[1] = -2; trk[2] = 7.5;
  src.trk = trk;
  C.createChunkedMesh(src, 72);
  const a4 = gl._attribs.find((a) => a.idx === 4);
  assert.ok(a4);
  assert.equal(a4.stride, 40, "mat + trk is the same 40 bytes as trk alone");
  assert.equal(a4.offset, 28, "trk no longer shifts to make room for a mat float");
  const raw = gl._buffers.find((b) => b.vbo).vbo;
  const f32 = new Float32Array(raw), u16 = new Uint16Array(raw);
  assert.equal(u16[13] / VP.MAT_Q, 3, "material 3 in the alpha of attrib 2");
  assert.equal(f32[7], 100);
});

test("production chunking releases render-only source channels but keeps collision/probe positions", () => {
  const gl = makeGL();
  const C = loadChunked(gl);
  const src = makeGrid(6, 6, 30);
  src._keepFullGeometry = false;
  src.mat = new Float32Array(src.pos.length / 3);
  src.trk = new Float32Array(src.pos.length);
  C.createChunkedMesh(src, 72);
  assert.ok(src.pos && src.idx, "_keepPositions retains the road/terrain collision inputs");
  assert.equal(src.nrm, null);
  assert.equal(src.col, null);
  assert.equal(src.mat, null);
  assert.equal(src.trk, null);
});

test("trackGeometry debug retention preserves every source channel", () => {
  const gl = makeGL();
  const C = loadChunked(gl);
  const src = makeGrid(6, 6, 30);
  src.mat = new Float32Array(src.pos.length / 3);
  src.trk = new Float32Array(src.pos.length);
  src._keepFullGeometry = true;
  const refs = { pos: src.pos, nrm: src.nrm, col: src.col, mat: src.mat, trk: src.trk, idx: src.idx };
  C.createChunkedMesh(src, 72);
  for (const [key, value] of Object.entries(refs)) assert.equal(src[key], value, `${key} must survive debug retention`);
});

// The test above proves the GEOMETRIC half of the per-chunk run-merge: one draw
// over a run covers the same indices, in order, as the per-chunk draws. What it
// cannot see is the half that made the merge legal in the first place — the
// perChunk branch binds a DIFFERENT light set per chunk, so a run may only
// extend while four things all hold. MEASURED before the merge was written
// (scratch/r11/chunk-merge.mjs, vegas night, full field): 152.6 chunk draws a
// frame, 91.2 consecutive pairs contiguous, 114.8 sharing a light set, 74.2
// both — and drawElements duly fell 129.2 -> 74.5 per frame.
//
// Drop any one of the four and the picture changes while every call count keeps
// improving, which is the failure mode no perf number can catch:
//   visible   — a culled chunk between two visible ones must BREAK the run, or
//               the merge draws back what the cull removed.
//   same list — one uploadLightSet serves the whole run.
//   same slot — uLampShadowIdx indexes into that set.
//   contiguous + same index type — a run is one byte range.
test("the per-chunk merge only extends a run under all four guards", () => {
  const src = fs.readFileSync(SRC, "utf8");   // the same source the loader above reads
  const loop = src.slice(src.indexOf("const _tbl = LampChunks.resolve"),
                         src.indexOf("if (perChunk) {", src.indexOf("const _tbl = LampChunks.resolve")));
  assert.ok(loop.length > 200, "the perChunk draw loop moved — this guard is reading the wrong slice");
  assert.match(loop, /runType === ch\.indexType/, "a run must not span two index types");
  assert.match(loop, /runSlot === slot/, "a run must not span two lamp-shadow slots");
  assert.match(loop, /_sameList\(runLi, li\)/, "a run must not span two light sets");
  assert.match(loop, /runOff \+ runCount \* stride === ch\.byteOffset/,
    "a run must stay contiguous in the index buffer");
  // The cull path must flush, not `continue` past an invisible chunk.
  assert.match(loop, /Frustum\.aabbDist2\([^)]*\) > cd2\)\) \{ flush\(\); continue; \}/,
    "an invisible chunk must FLUSH the open run — a bare continue would merge across it");
  // And _sameList must compare contents, not just identity: LampChunks is free
  // to hand back equal-but-distinct arrays, and an identity-only check would
  // silently stop merging (a perf regression nothing goes red for).
  const sl = src.slice(src.indexOf("function _sameList("));
  assert.match(sl, /a\[i\] !== b\[i\]/, "_sameList must compare elements, not only object identity");
});
