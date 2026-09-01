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

const SRC = new URL("../../js/render/glx/chunked.js", import.meta.url);

// ── Stub GL: enough of WebGL2 for createChunkedMesh, and it REMEMBERS the
// element-array uploads so the assertions can read real bytes back.
function makeGL() {
  const gl = {
    ARRAY_BUFFER: 0x8892, ELEMENT_ARRAY_BUFFER: 0x8893, STATIC_DRAW: 0x88e4,
    FLOAT: 0x1406, TRIANGLES: 4, UNSIGNED_INT: 0x1405, UNSIGNED_SHORT: 0x1403,
    _elem: null,            // the bound element buffer's record
    _array: null,           // the bound ARRAY_BUFFER record (VBO)
    _attribs: [],
    _enabled: new Set(),
    _buffers: [],
    createVertexArray: () => ({}), bindVertexArray: () => {},
    createBuffer() { const b = { id: this._buffers.length, bytes: null, f32: null }; this._buffers.push(b); return b; },
    bindBuffer(target, buf) {
      if (target === this.ELEMENT_ARRAY_BUFFER) this._elem = buf;
      if (target === this.ARRAY_BUFFER) this._array = buf;
    },
    bufferData(target, src) {
      if (target === this.ARRAY_BUFFER && this._array && src && src.length != null) {
        this._array.f32 = Float32Array.from(src);
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
      this._attribs.push({ idx, size, stride, offset });
    },
    deleteBuffer: () => {}, deleteVertexArray: () => {},
  };
  return gl;
}

function loadChunked(gl) {
  const code = fs.readFileSync(SRC, "utf8");
  const ctx = { console };
  vm.createContext(ctx);
  seedLog(ctx);
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

test("createChunkedMesh without trk keeps the 9-float layout and leaves attrib 4 off", () => {
  const gl = makeGL();
  const C = loadChunked(gl);
  const mesh = C.createChunkedMesh(makeGrid(6, 6, 30), 72);
  assert.ok(mesh.chunks, "fixture must chunk so the interleaved path runs");
  assert.equal(gl._enabled.has(4), false, "no data.trk → attrib 4 stays generic (0,0,0)");
  assert.equal(gl._attribs.some((a) => a.idx === 4), false);
  const vbo = gl._buffers.find((b) => b.f32);
  assert.ok(vbo && vbo.f32, "VBO upload must be recorded");
  assert.equal(vbo.f32.length, 6 * 6 * 30 * 4 * 9, "pos+nrm+col only");
});

test("createChunkedMesh interleaves data.trk onto attrib 4 (road markings)", () => {
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
  assert.equal(a4.stride, 12 * 4, "pos+nrm+col+trk = 12 floats when there is no mat");
  assert.equal(a4.offset, 9 * 4);
  const vbo = gl._buffers.find((b) => b.f32);
  assert.ok(vbo && vbo.f32, "VBO upload must be recorded");
  assert.equal(vbo.f32.length, vCount * 12);
  assert.equal(vbo.f32[9], 10);
  assert.equal(vbo.f32[10], 0.5);
  assert.equal(vbo.f32[11], 6);
  assert.equal(vbo.f32[12 + 9], 11);
});

test("createChunkedMesh places trk after mat when both are present", () => {
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
  assert.equal(a4.stride, 13 * 4, "pos+nrm+col+mat+trk = 13 floats");
  assert.equal(a4.offset, 10 * 4, "trk follows the optional mat float");
  const vbo = gl._buffers.find((b) => b.f32);
  assert.equal(vbo.f32[9], 3, "mat occupies float 9");
  assert.equal(vbo.f32[10], 100);
  assert.equal(vbo.f32[11], -2);
  assert.equal(vbo.f32[12], 7.5);
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
  assert.match(loop, /_aabbDist2\([^)]*\) > cd2\)\) \{ flush\(\); continue; \}/,
    "an invisible chunk must FLUSH the open run — a bare continue would merge across it");
  // And _sameList must compare contents, not just identity: LampChunks is free
  // to hand back equal-but-distinct arrays, and an identity-only check would
  // silently stop merging (a perf regression nothing goes red for).
  const sl = src.slice(src.indexOf("function _sameList("));
  assert.match(sl, /a\[i\] !== b\[i\]/, "_sameList must compare elements, not only object identity");
});
