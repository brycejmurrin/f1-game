import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { VmPage } from '../helpers/vm-page.js';

const adapter = new URL('../helpers/vm-page.js', import.meta.url).href;

function pumpingPage({ timers = () => {}, frame = () => {} } = {}) {
  const page = new VmPage(), calls = { timers: 0, frames: 0 };
  page._handle = {
    record: { meshes: 0 },
    flushTimers() { calls.timers++; timers(); },
    pumpFrame() { calls.frames++; frame(); },
  };
  return { page, calls };
}

test('VM evaluate observes fulfilled promise chains without advancing timers or frames', async () => {
  const { page, calls } = pumpingPage();
  const ready = Promise.resolve(40).then(n => Promise.resolve(n + 2)).then(n => n);
  assert.equal(await page._awaitPumping(ready), 42);
  assert.deepEqual(calls, { timers: 0, frames: 0 });
});

test('VM evaluate preserves an already rejected promise without pumping a frame', async () => {
  const { page, calls } = pumpingPage(), error = new Error('page rejection');
  await assert.rejects(page._awaitPumping(Promise.reject(error)), actual => actual === error);
  assert.deepEqual(calls, { timers: 0, frames: 0 });
});

test('VM evaluate observes timer-resolved promise chains before pumping an unrelated frame', async () => {
  let resolve;
  const pending = new Promise(r => { resolve = r; }).then(n => Promise.resolve(n + 1));
  const { page, calls } = pumpingPage({ timers: () => resolve(6) });
  assert.equal(await page._awaitPumping(pending), 7);
  assert.deepEqual(calls, { timers: 1, frames: 0 });
});

test('VM evaluate continues to pump a pending animation-frame promise', async () => {
  let resolve;
  const pending = new Promise(r => { resolve = r; });
  const { page, calls } = pumpingPage({ frame: () => resolve('frame ready') });
  assert.equal(await page._awaitPumping(pending), 'frame ready');
  assert.deepEqual(calls, { timers: 1, frames: 1 });
});

test('VM evaluate rejects timer settlement after the unchanged 60-second deadline', async t => {
  let clock = 0, resolve;
  t.mock.method(Date, 'now', () => clock);
  const pending = new Promise(r => { resolve = r; });
  const { page, calls } = pumpingPage({ timers: () => { clock = 60_001; resolve('late'); } });
  await assert.rejects(page._awaitPumping(pending), /promise did not settle in 60000ms/);
  assert.deepEqual(calls, { timers: 1, frames: 0 });
});
function child(body) {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const root = new URL('../../scratch/', import.meta.url);
  mkdirSync(root, { recursive: true });
  const dir = mkdtempSync(path.join(root.pathname, 'vm-lifecycle-'));
  const file = path.join(dir, 'control.test.mjs');
  writeFileSync(file, `import { makeVmTest } from ${JSON.stringify(adapter)}; const test = makeVmTest(); ${body}`);
  let r;
  try {
    r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', file],
      { env, encoding: 'utf8', timeout: 10000 });
  } finally { rmSync(dir, { recursive: true, force: true }); }
  assert.ifError(r.error);
  return { status: r.status, out: r.stdout + r.stderr };
}

test('VM async afterEach rejection fails the test and remaining cleanup runs', () => {
  const r = child(`
    test.afterEach(async () => { await Promise.resolve(); throw new Error('cleanup-failure'); });
    test.afterEach(async () => { console.log('remaining-cleanup-ran'); });
    test('body-passes', async () => {});
  `);
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /cleanup-failure/);
  assert.match(r.out, /remaining-cleanup-ran/);
});

test('VM afterAll is awaited and its rejection fails the process', () => {
  const r = child(`
    test.afterAll(async () => { await Promise.resolve(); throw new Error('after-all-failure'); });
    test('body-passes', async () => {});
  `);
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /after-all-failure/);
});

test('VM nested suite hooks survive declaration and run in their own scope', () => {
  const r = child(`
    let n = 0;
    test.describe('nested', () => {
      test.beforeEach(async () => { n++; });
      test.afterEach(async () => { if (n !== 1) throw new Error('nested hook lost'); n = 0; });
      test('uses hook', async () => { if (n !== 1) throw new Error('before hook lost'); });
    });
    test('outside suite', async () => { if (n !== 0) throw new Error('hook leaked'); });
  `);
  assert.equal(r.status, 0, r.out);
});

test('VM preserves a body failure while reporting a teardown failure too', () => {
  const r = child(`
    test.afterEach(async () => { throw new Error('cleanup-failure'); });
    test('body-fails', async () => { throw new Error('body-failure'); });
  `);
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /VM test and cleanup failed/);
});


test('VM honors hooks declared after tests and cleans up inner scopes first', () => {
  const r = child(`
    const seen = [];
    test.describe('outer', () => {
      test.afterEach(() => { seen.push('outer'); if (seen.join(',') !== 'inner,outer') throw new Error('wrong cleanup order'); });
      test.describe('inner', () => {
        test('registered before hooks', async () => {});
        test.afterEach(async () => { seen.push('inner'); });
      });
    });
    test.afterAll(() => { if (seen.join(',') !== 'inner,outer') throw new Error('late hook lost'); });
  `);
  assert.equal(r.status, 0, r.out);
});

test('VM fixture setup failure still closes its page and runs cleanup', () => {
  const r = child(`
    const { VmPage } = await import(${JSON.stringify(adapter)});
    VmPage.prototype.close = async () => { console.log('partial-page-closed'); };
    test.afterEach(async () => { console.log('setup-cleanup-ran'); });
    test('bad fixture', async ({ page, nonexistentFixture }) => {});
  `);
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /no VM fixture named/);
  assert.match(r.out, /setup-cleanup-ran/);
  assert.match(r.out, /partial-page-closed/);
});

test('VM page close failure fails the test', () => {
  const r = child(`
    test('close rejects', async ({ page }) => { page.close = async () => { throw new Error('page-close-failure'); }; });
  `);
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /page-close-failure/);
});
