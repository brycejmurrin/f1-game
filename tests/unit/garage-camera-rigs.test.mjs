// The Blender-authored garage camera rigs (tools/gen/blender/garage-camera-rigs.py → the
// @blender-rigs block of js/garage/arrival.js): every rig, every sequence, every u keeps
// the eye inside the bay and moving smoothly; side -1 mirrors x; the block is current.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { absSrc } from '../helpers/abs-src.mjs';

const read = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const context = vm.createContext({});
vm.runInContext(read('js/garage/crew-draw.js'), context, { filename: absSrc('js/garage/crew-draw.js') });
// rigSample is module-private: evaluate arrival.js with one accessor appended after the
// generated block (a closure, so the sampler's consts are read after the IIFE ran).
const END = '  // @blender-rigs:end\n';
vm.runInContext(read('js/garage/arrival.js').replace(END, END + '  globalThis.__rigs = () => ({ RIGS, RIG_IDS, RIG_LABEL, rigSample });\n'),
  context, { filename: absSrc('js/garage/arrival.js') });
const { RIGS, RIG_IDS, RIG_LABEL, rigSample } = vm.runInContext('__rigs()', context);
const DIRS = ['in', 'out', 'home'];
const us = Array.from({ length: 101 }, (_, i) => i / 100);

test('four rigs, each with an uppercase label and a table for every sequence', () => {
  assert.deepEqual([...RIG_IDS], ['crane', 'orbit', 'dolly', 'rear']);
  assert.ok(Object.isFrozen(RIG_IDS));
  for (const id of RIG_IDS) {
    assert.equal(RIG_LABEL[id], RIG_LABEL[id].toUpperCase());
    for (const d of DIRS) assert.equal(RIGS[id][d].length, RIGS[id].n * 7, `${id}.${d}`);
  }
  assert.equal(rigSample('nope', 'in', 0.5), null);
});

test('every eye stays inside the bay, short of the door plane, finite, and looks somewhere else', () => {
  for (const id of RIG_IDS) for (const d of DIRS) for (const u of us) {
    const { eye, aim, fov } = rigSample(id, d, u);
    const where = `${id}.${d} u=${u}`;
    assert.ok([...eye, ...aim, fov].every(Number.isFinite), where);
    assert.ok(eye[0] > -5.4 && eye[0] < 5.4, `${where} x ${eye[0]}`);
    assert.ok(eye[1] >= 0.3 && eye[1] <= 3.6, `${where} y ${eye[1]}`);
    assert.ok(eye[2] > -6.4 && eye[2] < 6.1, `${where} z ${eye[2]}`);
    assert.ok(fov >= 30 && fov <= 75, `${where} fov ${fov}`);
    assert.ok(Math.hypot(aim[0] - eye[0], aim[1] - eye[1], aim[2] - eye[2]) > 1, `${where} aim on the lens`);
  }
});

test('no snaps: adjacent u steps move the eye and aim a sane distance, the fov a little', () => {
  for (const id of RIG_IDS) for (const d of DIRS) {
    let prev = null;
    for (const u of us) {
      const s = rigSample(id, d, u);
      if (prev) {
        assert.ok(Math.hypot(...s.eye.map((v, i) => v - prev.eye[i])) < 0.6, `${id}.${d} eye snaps at u=${u}`);
        assert.ok(Math.hypot(...s.aim.map((v, i) => v - prev.aim[i])) < 1.0, `${id}.${d} aim snaps at u=${u}`);
        assert.ok(Math.abs(s.fov - prev.fov) < 2, `${id}.${d} fov snaps at u=${u}`);
      }
      prev = s;
    }
    // Clamped outside 0..1 and the curve passes through its own end samples.
    assert.deepEqual(rigSample(id, d, -1), rigSample(id, d, 0));
    assert.deepEqual(rigSample(id, d, 2), rigSample(id, d, 1));
    assert.equal(rigSample(id, d, 0).eye[0], RIGS[id][d][0] / 100);
  }
});

test('side -1 mirrors x of the eye and the aim, nothing else', () => {
  for (const id of RIG_IDS) for (const u of [0, 0.37, 0.8, 1]) {
    const a = rigSample(id, 'in', u, 1), b = rigSample(id, 'in', u, -1);
    assert.equal(b.eye[0], -a.eye[0]); assert.equal(b.aim[0], -a.aim[0]);
    assert.deepEqual([b.eye[1], b.eye[2], b.aim[1], b.aim[2], b.fov], [a.eye[1], a.eye[2], a.aim[1], a.aim[2], a.fov]);
  }
});

test('the generated block was written by the current generator (SHA256 of the .py)', () => {
  const want = createHash('sha256').update(readFileSync(new URL('../../tools/gen/blender/garage-camera-rigs.py', import.meta.url))).digest('hex');
  const block = read('js/garage/arrival.js').split('// @blender-rigs:start')[1].split('// @blender-rigs:end')[0];
  const got = (block.split('Source SHA256: ')[1] || '').slice(0, 64);
  assert.equal(got, want, 'rerun tools/gen/blender/garage-camera-rigs.py -- --output-dir artifacts/garage-camera-rigs --write-runtime');
});
