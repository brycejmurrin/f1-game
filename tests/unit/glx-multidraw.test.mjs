/* glx-multidraw — multi-draw must submit EXACTLY the same geometry.
 *
 * WEBGL_multi_draw changes how many calls carry the chunk ranges, and must
 * change nothing else. That is an equivalence claim, so it is tested as one:
 * run the same fixture and the same camera through both paths, record every
 * (offset, count) range each one hands the driver, and require the two to
 * describe the identical set of indices.
 *
 * It matters more than it looks. The drawElements path can merge two chunks
 * only when they are CONTIGUOUS in the index buffer; multi-draw carries
 * explicit ranges and may leave a group open across a gap. That difference is
 * the entire saving and also the entire risk — leave the group open across a
 * chunk that was CULLED and the cull is undone, silently, in exactly the
 * situation (most chunks culled) where the feature is supposed to pay.
 *
 * Deliberately not a timing test. This container has no GPU, and run 141
 * measured the timing harness's own noise floor at 18-45 % — counting is exact
 * here and timing is not.
 *
 * Run: node --test tests/unit/glx-multidraw.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { seedLog } from "../helpers/seed-log.mjs";
import { seedFrustum } from "../helpers/seed-frustum.mjs";

const SRC = new URL("../../js/render/glx/chunked.js", import.meta.url);
const PACK_SRC = new URL("../../js/render/shared/vertex-pack.js", import.meta.url);
const WIDE_VP = new Float32Array([1e-4, 0, 0, 0, 0, 1e-4, 0, 0, 0, 0, 1e-4, 0, 0, 0, 0, 1]);

function makeGL(withExt) {
  const gl = {
    ARRAY_BUFFER: 0x8892, ELEMENT_ARRAY_BUFFER: 0x8893, STATIC_DRAW: 0x88e4,
    FLOAT: 0x1406, TRIANGLES: 4, UNSIGNED_INT: 0x1405, UNSIGNED_SHORT: 0x1403,
    _elem: null, _array: null, ranges: [], calls: 0, multiCalls: 0,
    createVertexArray: () => ({}), bindVertexArray: () => {},
    createBuffer() { return { bytes: null }; },
    bindBuffer(t, b) { if (t === this.ELEMENT_ARRAY_BUFFER) this._elem = b; else this._array = b; },
    bufferData(t, src) {
      if (t !== this.ELEMENT_ARRAY_BUFFER || !this._elem) return;
      this._elem.bytes = typeof src === "number" ? new Uint8Array(src) : new Uint8Array(src.buffer.slice(0));
    },
    bufferSubData(t, off, src) {
      if (t !== this.ELEMENT_ARRAY_BUFFER || !this._elem || !this._elem.bytes) return;
      this._elem.bytes.set(new Uint8Array(src.buffer, src.byteOffset, src.byteLength), off);
    },
    enableVertexAttribArray() {}, vertexAttribPointer() {}, deleteBuffer() {}, deleteVertexArray() {},
    drawElements(mode, count, type, offset) { this.calls++; this.ranges.push([offset, count]); },
    getExtension(name) {
      if (name !== "WEBGL_multi_draw" || !withExt) return null;
      const self = this;
      return {
        multiDrawElementsWEBGL(mode, counts, cOff, type, offsets, oOff, n) {
          self.multiCalls++;
          for (let i = 0; i < n; i++) self.ranges.push([offsets[oOff + i], counts[cOff + i]]);
        },
      };
    },
  };
  return gl;
}

function load(gl, frame) {
  const ctx = { console };
  vm.createContext(ctx);
  seedLog(ctx); seedFrustum(ctx);
  vm.runInContext(fs.readFileSync(PACK_SRC, "utf8") + "\n;globalThis.VertexPack = VertexPack;", ctx);
  vm.runInContext(fs.readFileSync(SRC, "utf8") + "\n;globalThis.__C = GLXChunked;", ctx);
  return ctx.__C.init({
    gl, frame, bindVAO: () => {}, setBlend: () => {}, setDepthMask: () => {}, setCull: () => {},
    setPolyOffset: () => {}, toF32: (a) => (a instanceof Float32Array ? a : new Float32Array(a)),
    createMesh: (d) => ({ plain: true, data: d }), litMaterial: () => 1,
    invalidateVAO: () => {}, unbindVAOIf: () => {}, ctxGone: () => false,
  });
}

// Cells spread far apart so each lands in its own 72 m bucket, over the
// 2000-triangle floor createChunkedMesh needs before it chunks at all.
function grid(cells, quadsPerCell) {
  const pos = [], nrm = [], col = [], idx = [];
  let v = 0;
  for (let c = 0; c < cells; c++) for (let q = 0; q < quadsPerCell; q++) {
    const ox = c * 400 + q * 0.5;
    pos.push(ox, 0, 0, ox + 1, 0, 0, ox + 1, 0, 1, ox, 0, 1);
    for (let k = 0; k < 4; k++) { nrm.push(0, 1, 0); col.push(1, 1, 1); }
    idx.push(v, v + 1, v + 2, v, v + 2, v + 3); v += 4;
  }
  return { pos: new Float32Array(pos), nrm: new Float32Array(nrm),
           col: new Float32Array(col), idx: new Uint32Array(idx), _keepPositions: true };
}

// Every index byte a set of ranges covers, as a flat sorted list. Two paths
// agree when these agree — merged or split, one call or many.
function covered(ranges, stride) {
  const out = [];
  for (const [off, count] of ranges) for (let i = 0; i < count; i++) out.push(off + i * stride);
  return out.sort((a, b) => a - b);
}

function run(withExt, mdOn) {
  const frame = { viewProj: WIDE_VP, eye: [0, 0, 0], cullDist: 0, perChunkLights: 0 };
  const gl = makeGL(withExt);
  const C = load(gl, frame);
  const mesh = C.createChunkedMesh(grid(8, 400), 72);
  assert.ok(mesh.chunks && mesh.chunks.length > 2, "fixture did not chunk");
  if (mdOn) C.multiDraw(true);
  C.drawChunked(mesh, null, {});
  const stride = mesh.indexType === gl.UNSIGNED_INT ? 4 : 2;
  return { gl, C, mesh, covered: covered(gl.ranges, stride), stats: C.multiDrawStats() };
}

test("multi-draw submits exactly the indices drawElements would", () => {
  const plain = run(false, false);
  const multi = run(true, true);
  assert.ok(multi.stats.on && multi.stats.supported, "multi-draw did not engage");
  assert.ok(multi.gl.multiCalls > 0, "no multiDrawElementsWEBGL call was made");
  assert.equal(multi.gl.calls, 0, "multi-draw must not also issue drawElements");
  assert.ok(plain.covered.length > 0, "the plain path submitted nothing");
  assert.deepEqual(multi.covered, plain.covered,
    "the two paths submit different indices — multi-draw is not equivalent");
});

test("without the extension it silently stays on drawElements", () => {
  // Firefox is at 1.4 % support, so this is a real browser, not a hypothetical.
  const r = run(false, true);
  assert.equal(r.stats.supported, false, "a missing extension must report unsupported");
  assert.equal(r.stats.on, false, "and must not leave the feature latched on");
  assert.ok(r.gl.calls > 0, "the drawElements fallback must still draw");
  assert.deepEqual(r.covered, run(false, false).covered, "the fallback must submit the same indices");
});

test("toggling it off returns the draw path to drawElements", () => {
  const frame = { viewProj: WIDE_VP, eye: [0, 0, 0], cullDist: 0, perChunkLights: 0 };
  const gl = makeGL(true);
  const C = load(gl, frame);
  const mesh = C.createChunkedMesh(grid(8, 400), 72);
  C.multiDraw(true); C.drawChunked(mesh, null, {});
  const mdCalls = gl.multiCalls;
  C.multiDraw(false);
  gl.multiCalls = 0; gl.calls = 0;
  C.drawChunked(mesh, null, {});
  assert.ok(mdCalls > 0, "precondition: it was using multi-draw");
  assert.equal(gl.multiCalls, 0, "off must issue no multi-draw calls");
  assert.ok(gl.calls > 0, "off must go back to drawElements");
});

/* ── THE PER-CHUNK LAMP BRANCH ────────────────────────────────────────────
 *
 * Everything above runs with perChunkLights 0, which is the PLAIN branch: one
 * light set for the whole mesh, chunks merged purely on contiguity. That is
 * not the branch that matters. perChunkLights ships at 0.3, so at night the
 * lamp branch is the live one, and it is where multi-draw has something to
 * win — a per-chunk light set is exactly what stops drawElements merging two
 * chunks that are not neighbours.
 *
 * It is also where the first cut of multi-draw failed: it grouped by NEIGHBOUR,
 * so it could only ever batch chunks adjacent in the array. Measured at vegas
 * with the clock held at 02:00, that scheme makes 24.5 calls a frame of 108.5
 * visible chunks where grouping by SET makes 15.0.
 *
 * The fixture below is the adversarial version of that, not a replica of it:
 * two lamp clusters and eight cells alternating between them, so NO two
 * neighbours share a set and every distant pair does. Eight chunks, eight
 * groups by neighbour, two by set — small enough to assert exactly, which a
 * real scene's 24.5-vs-15.0 is not.
 */
const LB_SRC = new URL("../../js/render/shared/light-budget.js", import.meta.url);
const LC_SRC = new URL("../../js/render/shared/lamp-chunks.js", import.meta.url);

function loadLit(gl, frame) {
  const ctx = { console };
  vm.createContext(ctx);
  seedLog(ctx); seedFrustum(ctx);
  vm.runInContext(fs.readFileSync(LB_SRC, "utf8") + "\n;globalThis.LightBudget = LightBudget;", ctx);
  vm.runInContext(fs.readFileSync(LC_SRC, "utf8") + "\n;globalThis.LampChunks = LampChunks;", ctx);
  vm.runInContext(fs.readFileSync(PACK_SRC, "utf8") + "\n;globalThis.VertexPack = VertexPack;", ctx);
  vm.runInContext(fs.readFileSync(SRC, "utf8") + "\n;globalThis.__C = GLXChunked;", ctx);
  const uploads = [];
  return {
    uploads,
    C: ctx.__C.init({
      gl, frame, bindVAO: () => {}, setBlend: () => {}, setDepthMask: () => {}, setCull: () => {},
      setPolyOffset: () => {}, toF32: (a) => (a instanceof Float32Array ? a : new Float32Array(a)),
      createMesh: (d) => ({ plain: true, data: d }), litMaterial: () => 1,
      invalidateVAO: () => {}, unbindVAOIf: () => {}, ctxGone: () => false,
      shadow: null,
      // idx null is the RESTORE call the branch makes on its way out (the
      // global set, back in the global slot) — not a per-group upload, so it
      // is not counted as one.
      uploadLightSet: (L, idx, n) => { if (idx) uploads.push(Array.prototype.slice.call(idx, 0, n).join(",")); },
      setLampShadowSlot: () => {},
    }),
  };
}

// Two clusters of eight lamps, far apart in X. A chunk's nearest-eight is
// whichever cluster it sits on the side of — and because buildTable sorts by
// DISTANCE, two chunks on the same side hold the same eight lamps in different
// orders. Both halves of the grouping fix are exercised: content over identity,
// and set over neighbour.
function lamps() {
  const L = [];
  for (const cx of [-2000, 2000]) for (let i = 0; i < 8; i++) {
    const o = L.length;
    for (let k = 0; k < 15; k++) L[o + k] = 0;
    L[o] = cx + i * 7; L[o + 1] = 6; L[o + 2] = i * 11;
    L[o + 6] = 40000;                       // radius: reaches every chunk
  }
  return new Float32Array(L);
}

// Cell c sits at x = -1000 (even) or +1000 (odd), so consecutive chunks always
// belong to opposite clusters. `far` pushes a cell out to x = +-9000, which the
// radial cull removes without changing which cluster is nearest — a hole in the
// MIDDLE of the array, which is the case that can undo a cull.
function altGrid(cells, quadsPerCell, far = []) {
  const pos = [], nrm = [], col = [], idx = [];
  let v = 0;
  for (let c = 0; c < cells; c++) {
    const side = c % 2 ? 1 : -1;
    // 1008 and 8928 are exact multiples of the 72 m cell, and the 400 quads
    // span 20 m from there, so a cell lands wholly inside ONE bucket — eight
    // cells, eight chunks, no accidental splits to reason about.
    const bx = side * (far.includes(c) ? 8928 : 1008), bz = c * 400;
    for (let q = 0; q < quadsPerCell; q++) {
      const ox = bx + q * 0.05;
      pos.push(ox, 0, bz, ox + 1, 0, bz, ox + 1, 0, bz + 1, ox, 0, bz + 1);
      for (let k = 0; k < 4; k++) { nrm.push(0, 1, 0); col.push(1, 1, 1); }
      idx.push(v, v + 1, v + 2, v, v + 2, v + 3); v += 4;
    }
  }
  return { pos: new Float32Array(pos), nrm: new Float32Array(nrm),
           col: new Float32Array(col), idx: new Uint32Array(idx), _keepPositions: true };
}

function runLit(withExt, mdOn, { far = [], cullDist = 0 } = {}) {
  const frame = { viewProj: WIDE_VP, eye: [0, 0, 1400], cullDist,
                  perChunkLights: 0.3, allLights: lamps(), lights: null,
                  tailStart: 0, tailCount: 0, roadChunkLamps: true };
  const gl = makeGL(withExt);
  const { C, uploads } = loadLit(gl, frame);
  const mesh = C.createChunkedMesh(altGrid(8, 400, far), 72);
  assert.ok(mesh.chunks && mesh.chunks.length === 8, `fixture chunked into ${mesh.chunks && mesh.chunks.length}, wanted 8`);
  if (mdOn) C.multiDraw(true);
  C.drawChunked(mesh, null, {});
  const stride = mesh.indexType === gl.UNSIGNED_INT ? 4 : 2;
  return { gl, C, mesh, uploads, covered: covered(gl.ranges, stride), stats: C.multiDrawStats() };
}

test("the lamp branch groups by light SET, not by neighbour", () => {
  // The counted oracle, both numbers from the same frame. Eight chunks that
  // alternate between two lamp sets: the neighbour scheme can only ever make
  // eight groups of them, the bucketing makes two.
  const r = runLit(false, false);
  assert.equal(r.stats.perChunkDraws, 8, "all eight chunks should be visible");
  assert.equal(r.stats.consecutiveGroups, 8,
    "precondition: alternating sets give the neighbour scheme one group per chunk");
  assert.equal(r.stats.setGroups, 2, "there are two distinct lamp sets, so two groups");
});

test("multi-draw issues one call per light set, not one per chunk", () => {
  const r = runLit(true, true);
  assert.ok(r.stats.on, "multi-draw did not engage on the lamp branch");
  assert.equal(r.gl.calls, 0, "multi-draw must not also issue drawElements");
  assert.equal(r.gl.multiCalls, 2, `expected one call per lamp set, got ${r.gl.multiCalls}`);
  assert.equal(r.stats.rangesSubmitted, 8, "all eight chunks must still be submitted");
  // The regression this whole change exists for: ranges per call above 1.
  assert.ok(r.stats.rangesSubmitted / r.stats.multiCalls >= 4,
    `${(r.stats.rangesSubmitted / r.stats.multiCalls).toFixed(2)} ranges a call — the grouping has collapsed again`);
  assert.equal(r.uploads.length, 2, "one light-set upload per group, not one per chunk");
});

test("the lamp branch submits exactly what drawElements would, holes included", () => {
  // eye is at (0, 0, 1400); cells 3 and 4 are pushed to x = +-8928, so the
  // radial cull drops them and leaves a gap in the MIDDLE of the array.
  const opts = { far: [3, 4], cullDist: 3000 };
  const plain = runLit(false, false, opts);
  const multi = runLit(true, true, opts);
  assert.equal(plain.stats.perChunkDraws, 6, "precondition: the two far cells must be culled");
  assert.deepEqual(multi.covered, plain.covered,
    "multi-draw submitted different indices across the culled gap — the cull was undone");
  assert.ok(plain.covered.length > 0, "the drawElements path submitted nothing");
  assert.equal(multi.gl.multiCalls, 2, "the six survivors still travel as two sets");
});
