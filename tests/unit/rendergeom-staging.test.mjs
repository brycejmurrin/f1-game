import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { absSrc } from "../helpers/abs-src.mjs";

const read = (p) => fs.readFileSync(new URL("../../" + p, import.meta.url), "utf8");
const chunkSource = read("js/render/webgpu/wgx-chunked.js");
const mainSource = read("js/render/webgpu/wgx.js");
const usage = { VERTEX: 1, INDEX: 2, COPY_DST: 4 };
function ledger() {
  const buffers = [];
  return { buffers, alloc(bytes) {
    const b = { bytes, destroys: 0, destroy() { this.destroys++; } };
    buffers.push(b); return b;
  } };
}

// Evaluate the shipped helper verbatim with its two device dependencies. No
// browser/GPU residency claim: this ledger measures explicit cleanup ownership.
function mkBufferHarness({ padFail = false, writeFail = false } = {}) {
  const failure = new RangeError("injected staging/upload failure");
  const l = ledger(), writes = [];
  const device = {
    createBuffer: ({ size }) => l.alloc(size),
    queue: { writeBuffer(b, offset, data) {
      if (writeFail) throw failure;
      writes.push({ b, offset, bytes: [...new Uint8Array(data.buffer, data.byteOffset, data.byteLength)] });
    } },
  };
  const ByteArray = new Proxy(Uint8Array, { construct(T, args) {
    if (padFail && typeof args[0] === "number") throw failure;
    return Reflect.construct(T, args);
  } });
  const start = mainSource.indexOf("    function _mkBuffer(data, usage) {");
  const end = mainSource.indexOf("    const _mipPipes", start);
  assert.ok(start >= 0 && end > start);
  const mkBuffer = new Function("device", "GPUBufferUsage", "Uint8Array",
    mainSource.slice(start, end) + ";return _mkBuffer;")(device, usage, ByteArray);
  return { ...l, writes, failure, mkBuffer };
}

test("WGX helper frees its unpublished buffer when odd-index padding fails", () => {
  const h = mkBufferHarness({ padFail: true });
  let owned = null;
  assert.throws(() => { owned = h.mkBuffer(new Uint16Array([0, 1, 2]), usage.INDEX); }, (e) => e === h.failure);
  assert.equal(owned, null);
  assert.equal(h.buffers.length, 1);
  assert.equal(h.buffers[0].destroys, 1);
  assert.equal(h.writes.length, 0);
});

for (const odd of [false, true]) {
  test(`WGX helper cleans failed ${odd ? "padded" : "aligned"} uploads exactly once`, () => {
    const h = mkBufferHarness({ writeFail: true });
    assert.throws(() => h.mkBuffer(new Uint16Array(odd ? [0, 1, 2] : [0, 1]), usage.INDEX), (e) => e === h.failure);
    assert.equal(h.buffers.length, 1);
    assert.equal(h.buffers[0].destroys, 1);
  });
}

test("WGX helper uploads just a typed subview and zero-pads its odd tail", () => {
  const h = mkBufferHarness();
  const data = new Uint16Array([99, 1, 2, 3, 99]).subarray(1, 4);
  const b = h.mkBuffer(data, usage.INDEX);
  assert.equal(b.bytes, 8);
  assert.deepEqual(h.writes[0].bytes, [...new Uint8Array(data.buffer, data.byteOffset, data.byteLength), 0, 0]);
  assert.equal(b.destroys, 0, "successful return transfers ownership to caller");
  b.destroy(); assert.equal(b.destroys, 1);
});

function chunkHarness({ big = false, stageFail = false, uploadFail = 0, sharedAttr = false } = {}) {
  const l = ledger(), failure = new RangeError("injected chunk preparation failure");
  const idx = new (big ? Uint32Array : Uint16Array)(2100 * 3);
  const pos = new Float32Array((big ? 65536 : 6) * 3);
  pos.set([0, 0, 0, 1, 0, 0, 0, 0, 1, 200, 0, 0, 201, 0, 0, 200, 0, 1]);
  for (let i = 0; i < idx.length; i += 3) { const off = i % 2 ? 3 : 0; idx.set([off, off + 1, off + 2], i); }
  const Index = new Proxy(big ? Uint32Array : Uint16Array, { construct(T, args) {
    if (stageFail && args[0] === idx.length) throw failure;
    return Reflect.construct(T, args);
  } });
  const sandbox = vm.createContext({
    Uint16Array: big ? Uint16Array : Index, Uint32Array: big ? Index : Uint32Array,
    GPUBufferUsage: usage, Log: { info() {} },
  });
  vm.runInContext(chunkSource + "\nthis.API = WGXChunked;", sandbox, { filename: absSrc("js/render/webgpu/wgx-chunked.js") });
  let uploads = 0;
  const core = {
    toF32: (a) => a,
    interleave: () => ({ vert: new Float32Array(42), attr: new Float32Array(24), idx }),
    mkBuffer(data) { if (++uploads === uploadFail) throw failure; return l.alloc(data.byteLength); },
    attrOrZero() {
      if (++uploads === uploadFail) throw failure;
      return { sbuf: sharedAttr ? null : l.alloc(96), attrBG: {} };
    },
    freeBuf(b) { if (b) b.destroy(); },
    // #3569 fallback after a failed chunk upload; null models a refused
    // single mesh, so the caller gets the empty chunked shell.
    createMesh() { return null; },
    allocFail(_label, e) { assert.equal(e, failure); },
  };
  return { ...l, api: sandbox.API.init(core), data: { pos, idx }, failure };
}

for (const big of [false, true]) {
  test(`WGX ${big ? "uint32" : "uint16"} chunk staging fails before owning GPU buffers`, () => {
    const h = chunkHarness({ big, stageFail: true });
    const pos = h.data.pos, idx = h.data.idx;
    assert.throws(() => h.api.createChunkedMesh(h.data, 72), (e) => e === h.failure);
    assert.equal(h.buffers.length, 0);
    assert.equal(h.data.pos, pos); assert.equal(h.data.idx, idx);
  });
}

for (const uploadFail of [1, 2, 3]) {
  test(`WGX chunk upload failure ${uploadFail} cleans every earlier owner`, () => {
    const h = chunkHarness({ uploadFail });
    const pos = h.data.pos, idx = h.data.idx;
    const mesh = h.api.createChunkedMesh(h.data, 72);
    assert.equal(mesh.count, 0); assert.equal(mesh.chunks.length, 0);
    assert.equal(h.buffers.length, uploadFail - 1);
    assert.ok(h.buffers.every((b) => b.destroys === 1));
    h.api.freeChunkedMesh(mesh);
    assert.ok(h.buffers.every((b) => b.destroys === 1));
    assert.equal(h.data.pos, pos); assert.equal(h.data.idx, idx);
  });
}

for (const sharedAttr of [false, true]) {
  test(`WGX healthy multi-chunk create/free keeps shared handles single-owned (${sharedAttr})`, () => {
    const h = chunkHarness({ sharedAttr });
    const mesh = h.api.createChunkedMesh(h.data, 72);
    assert.equal(mesh.chunks.length, 2);
    assert.ok(mesh.chunks.every((c) => c.ibuf === mesh.ibuf && c.sbuf === mesh.sbuf));
    assert.equal(h.buffers.length, sharedAttr ? 2 : 3);
    h.api.freeChunkedMesh(mesh);
    assert.ok(h.buffers.every((b) => b.destroys === 1));
  });
}
