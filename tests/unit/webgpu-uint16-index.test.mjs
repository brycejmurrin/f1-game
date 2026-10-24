import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { parse } from 'acorn';
import * as THREE from '../../vendor/three-0.186.1/three.webgpu.min.js';

// Execute the actual generated vendor utility, locating it by public methods,
// not terser's unstable class name. The queue models WebGPU's byte-level contract.
const source = fs.readFileSync(new URL('../../vendor/three-0.186.1/three.webgpu.min.js', import.meta.url), 'utf8');
const ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module' });
const node = ast.body.find(n => n.type === 'ClassDeclaration' && n.body.body.some(m => m.key.name === 'createShaderVertexBuffers'));
assert.ok(node, 'actual WebGPUAttributeUtils class exists');
const code = source.slice(node.start, node.end);
const context = { Uint8Array, Uint16Array, Uint32Array, Int8Array, Int16Array, Int32Array, Float32Array,
  GPUBufferUsage: { INDEX: 16, VERTEX: 32, STORAGE: 128 } };
for (const n of ast.body) {
  if (n.type === 'ImportDeclaration') for (const s of n.specifiers) {
    if (s.imported && s.imported.name in THREE) context[s.local.name] = THREE[s.imported.name];
  }
}
const descriptor = /([\w$]+)\.mappedAtCreation=/.exec(code)?.[1];
assert.ok(descriptor, 'mapped descriptor located');
context[descriptor] = { reset() {} };
const AttributeUtils = vm.runInNewContext(`${code};${node.id.name}`, context);

function fixture(values = [0, 1, 2], options = {}) {
  const records = [], writes = [], data = new WeakMap();
  const backend = {
    get(a) { if (!data.has(a)) data.set(a, {}); return data.get(a); },
    delete(a) { data.delete(a); },
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
  attribute.__apexUint16Index = options.mark !== false;
  Object.assign(attribute, options.attribute);
  const utils = new AttributeUtils(backend);
  utils.createAttribute(attribute, options.usage ?? 16);
  return { attribute, utils, records, writes, backend,
    decoded() { return Array.from(new attribute.array.constructor(records.at(-1).buffer.bytes.buffer)).slice(0, values.length); },
    update() { attribute.needsUpdate = true; utils.updateAttribute(attribute); },
  };
}

test('opted-in odd Uint16 indices preserve mapped values and halve allocation with padding', () => {
  const f = fixture();
  assert.equal(f.attribute.array.constructor, Uint16Array);
  assert.equal(f.records[0].size, 8);
  assert.deepEqual(f.decoded(), [0, 1, 2]);
  assert.deepEqual(Array.from(f.records[0].buffer.bytes), [0, 0, 1, 0, 2, 0, 0, 0]);
  f.attribute.array.set([3, 4, 5]); f.update();
  assert.deepEqual(f.decoded(), [3, 4, 5]);
  assert.deepEqual(f.writes, [{ offset: 0, bytes: 8 }]);
});

test('partial odd offsets and odd tails preserve unrequested neighboring GPU values', () => {
  const f = fixture([10, 11, 12, 13, 14]);
  f.attribute.array.set([99, 21, 22, 88, 24]);
  f.attribute.addUpdateRange(1, 2); f.attribute.addUpdateRange(4, 1); f.update();
  assert.deepEqual(f.decoded(), [10, 21, 22, 13, 24]);
  assert.deepEqual(f.writes, [{ offset: 0, bytes: 8 }, { offset: 8, bytes: 4 }]);
  assert.equal(f.attribute.updateRanges.length, 0);
  f.attribute.array[3] = 33; f.attribute.addUpdateRange(3, 1); f.update();
  assert.deepEqual(f.decoded(), [10, 21, 22, 33, 24]);
});

test('same-sized subarray replacement respects source byteOffset', () => {
  const f = fixture();
  f.attribute.array = new Uint16Array([900, 7, 8, 9, 901]).subarray(1, 4);
  f.update(); assert.deepEqual(f.decoded(), [7, 8, 9]);
});

test('unsupported changes fail visibly before writes and preserve buffer lifecycle', () => {
  for (const replacement of [new Uint16Array([1, 2]), new Uint32Array([1, 2, 3]), new Uint16Array([1, 65535, 3])]) {
    const f = fixture(); f.attribute.array = replacement;
    assert.throws(() => f.update(), /replace the BufferAttribute/);
    assert.equal(f.writes.length, 0);
    assert.deepEqual(Array.from(new Uint16Array(f.records[0].buffer.bytes.buffer)), [0, 1, 2, 0]);
    f.utils.destroyAttribute(f.attribute);
    assert.equal(f.records[0].buffer.destroyed, true);
    f.attribute.array = new Uint16Array([4, 5, 6]);
    f.utils.createAttribute(f.attribute, 16);
    assert.equal(f.records.length, 2); assert.deepEqual(f.decoded(), [4, 5, 6]);
  }
});

test('invalid ranges are atomic and zero-count ranges perform no GPU write', () => {
  const f = fixture(); f.attribute.array[0] = 100;
  f.attribute.addUpdateRange(0, 1); f.attribute.addUpdateRange(2, 2);
  assert.throws(() => f.update(), /out of bounds/); assert.equal(f.writes.length, 0);
  f.attribute.clearUpdateRanges(); f.attribute.addUpdateRange(1, 0); f.update();
  assert.equal(f.writes.length, 0); assert.deepEqual(f.decoded(), [0, 1, 2]);
});

test('unmarked, dynamic, stream, vertex, storage, wide and restart controls retain upstream behavior', () => {
  for (const options of [
    { mark: false }, { usage: 32 }, { usage: 16 | 128 }, { usage: 16 | 32 },
    { attribute: { usage: THREE.DynamicDrawUsage } }, { attribute: { usage: THREE.StreamDrawUsage } },
    { attribute: { isStorageBufferAttribute: true } }, { attribute: { isStorageInstancedBufferAttribute: true } },
    { attribute: { isInstancedBufferAttribute: true } },
  ]) {
    const f = fixture([0, 1, 2], options);
    assert.equal(f.attribute.array.constructor, Uint32Array, JSON.stringify(options));
    assert.equal(f.records[0].size, 12); assert.deepEqual(f.decoded(), [0, 1, 2]);
  }
  const restart = fixture([0, 65535, 2]);
  assert.equal(restart.attribute.array.constructor, Uint32Array);
  assert.deepEqual(restart.decoded(), [0, 4294967295, 2]);
  const wide = fixture([0, 70000, 2], { Type: Uint32Array });
  assert.equal(wide.records[0].size, 12); assert.deepEqual(wide.decoded(), [0, 70000, 2]);
});

test('actual primitive state keeps narrow strip format and wide restart format consistent', () => {
  for (const n of ast.body) if (n.type === 'VariableDeclaration') {
    for (const d of n.declarations) if (d.id.type === 'Identifier' && d.init?.type === 'Literal') context[d.id.name] = d.init.value;
  }
  const owner = ast.body.find(n => n.type === 'ClassDeclaration' && n.body.body.some(m => m.key.name === '_getPrimitiveState'));
  const method = owner.body.body.find(m => m.key.name === '_getPrimitiveState');
  const pipeline = vm.runInNewContext(`({${source.slice(method.start, method.end)}})`, context);
  pipeline.backend = { utils: { getPrimitiveTopology: () => 'line-strip' } };
  const narrow = fixture(), restart = fixture([0, 65535, 2]);
  for (const [f, expected] of [[narrow, 'uint16'], [restart, 'uint32']]) {
    const state = pipeline._getPrimitiveState({ isLine: true }, { index: f.attribute }, { side: THREE.FrontSide });
    assert.equal(state.stripIndexFormat, expected);
    assert.equal(pipeline._getPrimitiveState({ isLine: true, isLineSegments: true }, { index: f.attribute }, {}).stripIndexFormat, undefined);
  }
});

test('shared marked attribute creates one buffer and release/recreation uses new source bytes', () => {
  const f = fixture([3, 4, 5]);
  f.utils.createAttribute(f.attribute, 16);
  assert.equal(f.records.length, 1, 'shared shadow/mirror geometry reuses allocation');
  f.utils.destroyAttribute(f.attribute);
  f.attribute.array = new Uint16Array([6, 7, 8, 9, 10]);
  f.utils.createAttribute(f.attribute, 16);
  assert.equal(f.records.length, 2); assert.equal(f.records[1].size, 12);
  assert.deepEqual(Array.from(new Uint16Array(f.records[1].buffer.bytes.buffer)), [6, 7, 8, 9, 10, 0]);
});
