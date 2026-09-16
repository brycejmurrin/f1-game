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
