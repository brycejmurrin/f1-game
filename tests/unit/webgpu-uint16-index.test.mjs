import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { absSrc } from '../helpers/abs-src.mjs';
import { vendorModule, bindImports } from '../helpers/vendor-class.mjs';
import * as THREE from '../../vendor/three-0.187.0/three.webgpu.min.js';
import * as CORE from '../../vendor/three-0.187.0/three.core.min.js';

// Execute the actual generated vendor utility, located by public methods (not terser's unstable class name),
// with the module-level writeBufferAligned it calls. The queue models WebGPU's byte-level contract.
// r187 (#34734) keeps every non-storage Uint16 index buffer narrow and aligns partial writes upstream; this
// suite pinned the local opt-in patch 20 on r186 and now pins the upstream contract TLX's merged chunk
// indices rely on (tlx-webgpu-perf W1: the GPU buffer stays fed from the array tlx-chunked writes).
const VENDOR = absSrc('vendor/three-0.187.0/three.webgpu.min.js');
const source = fs.readFileSync(VENDOR, 'utf8');
const vmod = vendorModule(source);
const ast = vmod.ast;
const node = vmod.classWith('createAttribute', 'updateAttribute', 'getVertexBufferLayout');
const { code, imports } = vmod.closure([node]);
const context = { Uint8Array, Uint16Array, Uint32Array, Int8Array, Int16Array, Int32Array, Float32Array,
  GPUBufferUsage: { INDEX: 16, VERTEX: 32, STORAGE: 128 }, ...bindImports(imports, THREE, CORE) };
const AttributeUtils = vm.runInNewContext(`${code};${node.id.name}`, context, { filename: absSrc('vendor/three-0.187.0/three.webgpu.min.js') });

function fixture(values = [0, 1, 2], options = {}) {
  const records = [], writes = [], data = new WeakMap();
  const backend = {
    get(a) { if (!data.has(a)) data.set(a, {}); return data.get(a); },
    delete(a) { data.delete(a); },
    has(a) { return data.has(a); },
    getBufferAttribute: (a) => (a.isInterleavedBufferAttribute ? a.data : a),
    device: {
      createBuffer(d) {
        const bytes = new Uint8Array(d.size);
        const buffer = { bytes, destroyed: false, getMappedRange: () => bytes.buffer, unmap() {}, destroy() { this.destroyed = true; } };
        records.push({ size: d.size, usage: d.usage, buffer }); return buffer;
      },
      queue: { writeBuffer(buffer, offset, array, start = 0, count = array.length - start) {
        const bytes = new Uint8Array(array.buffer, array.byteOffset + start * array.BYTES_PER_ELEMENT, count * array.BYTES_PER_ELEMENT);
        assert.equal(offset % 4, 0, 'destination offset aligned');
        assert.equal(bytes.byteLength % 4, 0, 'copy size aligned');
        assert.ok(offset + bytes.byteLength <= buffer.bytes.length, 'copy in bounds');
        assert.equal(buffer.destroyed, false);
        buffer.bytes.set(bytes, offset); writes.push({ offset, bytes: bytes.byteLength });
      } },
    },
  };
  const attribute = new THREE.BufferAttribute(new (options.Type || Uint16Array)(values), options.itemSize || 1);
  Object.assign(attribute, options.attribute);
  const utils = new AttributeUtils(backend);
  utils.createAttribute(attribute, options.usage ?? 16);
  return { attribute, utils, records, writes, backend,
    decoded() { return Array.from(new attribute.array.constructor(records.at(-1).buffer.bytes.buffer)).slice(0, values.length); },
    update() { attribute.needsUpdate = true; utils.updateAttribute(attribute); },
  };
}

test('odd Uint16 indices stay narrow, keep mapped values and pad the allocation to 4 bytes', () => {
  const f = fixture();
  assert.equal(f.attribute.array.constructor, Uint16Array);
  assert.equal(f.records[0].size, 8);
  assert.deepEqual(f.decoded(), [0, 1, 2]);
  assert.deepEqual(Array.from(f.records[0].buffer.bytes), [0, 0, 1, 0, 2, 0, 0, 0]);
  f.attribute.array.set([3, 4, 5]); f.update();
  assert.deepEqual(f.decoded(), [3, 4, 5]);
  // writeBufferAligned: the aligned words, then the odd tail as one padded word.
  assert.deepEqual(f.writes, [{ offset: 0, bytes: 4 }, { offset: 4, bytes: 4 }]);
});

test('partial ranges upload the aligned words around them from the CPU array, nothing outside', () => {
  const f = fixture([10, 11, 12, 13, 14, 15, 16, 17]);
  f.attribute.array.set([99, 21, 22, 88, 24, 25, 26, 77]);
  f.attribute.addUpdateRange(1, 2); f.attribute.addUpdateRange(4, 1); f.update();
  // Words [0,1] and [4] are written (the CPU values of their neighbours ride along); word [6,7] is not.
  assert.deepEqual(f.decoded(), [99, 21, 22, 88, 24, 25, 16, 17]);
  assert.deepEqual(f.writes, [{ offset: 0, bytes: 4 }, { offset: 4, bytes: 4 }, { offset: 8, bytes: 4 }]);
  assert.equal(f.attribute.updateRanges.length, 0);
});
test('same-sized subarray replacement respects source byteOffset', () => {
  const f = fixture();
  f.attribute.array = new Uint16Array([900, 7, 8, 9, 901]).subarray(1, 4);
  f.update(); assert.deepEqual(f.decoded(), [7, 8, 9]);
});

test('actual strip index format follows the narrow array, restart value included', () => {
  const owner = vmod.classWith('getStripIndexFormat', 'getSampleCount');
  const method = owner.body.body.find(m => m.key.name === 'getStripIndexFormat');
  // The method plus the module-level GPUIndexFormat table it reads.
  const { code: fmtCode, imports: fmtImports } = vmod.closure([method]);
  const decls = fmtCode.slice(0, fmtCode.lastIndexOf(source.slice(method.start, method.end)));
  const utils = vm.runInNewContext(`${decls};({${source.slice(method.start, method.end)}})`,
    { Uint16Array, ...bindImports(fmtImports, THREE, CORE) }, { filename: absSrc('vendor/three-0.187.0/three.webgpu.min.js') });
  // A non-storage index keeps 0xffff, the uint16 restart value, so both stay narrow (r186 widened the restart case).
  for (const f of [fixture(), fixture([0, 65535, 2])]) {
    assert.equal(f.attribute.array.constructor, Uint16Array);
    assert.equal(utils.getStripIndexFormat({ isLine: true }, { index: f.attribute }), 'uint16');
    assert.equal(utils.getStripIndexFormat({ isLine: true, isLineSegments: true }, { index: f.attribute }), undefined);
  }
});
test('a shared index attribute creates one buffer and release/recreation uses new source bytes', () => {
  const f = fixture([3, 4, 5]);
  f.utils.createAttribute(f.attribute, 16);
  assert.equal(f.records.length, 1, 'shared shadow/mirror geometry reuses allocation');
  f.utils.destroyAttribute(f.attribute);
  f.attribute.array = new Uint16Array([6, 7, 8, 9, 10]);
  f.utils.createAttribute(f.attribute, 16);
  assert.equal(f.records.length, 2); assert.equal(f.records[1].size, 12);
  assert.deepEqual(Array.from(new Uint16Array(f.records[1].buffer.bytes.buffer)), [6, 7, 8, 9, 10, 0]);
});

test('index buffers that are also storage widen to Uint32 and map the restart value; vertex Uint16 widens', () => {
  const storage = fixture([0, 65535, 2], { usage: 16 | 128 });
  assert.equal(storage.attribute.array.constructor, Uint32Array);
  assert.deepEqual(storage.decoded(), [0, 4294967295, 2]);
  const vertex = fixture([0, 1, 2], { usage: 32 });
  assert.equal(vertex.attribute.array.constructor, Uint32Array);
  assert.equal(vertex.records[0].size, 12);
  const narrow = fixture([0, 1, 2], { attribute: { usage: THREE.DynamicDrawUsage } });
  assert.equal(narrow.attribute.array.constructor, Uint16Array, 'usage hints do not widen an index');
});

