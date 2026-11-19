// capture-tools-pool.test.mjs — the capture pool and runtime (apex-capture.mjs, capture-runtime.mjs, harness.mjs): queues, budgets, deadlines, failure snapshots, provenance.
// One of five per-tool files split from capture-tools-regressions.test.mjs (T1-10, #3043); no browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { poolMap, startWorkerPool, openPage } from '../../tools/shot/apex-capture.mjs';
import { ROOT } from '../../tools/shot/capture-contract.mjs';
import { recordCapture, stageRace, runBoundedCapture, visibleScreen, waitNextGameRender, captureContextOptions, captureFailureSnapshot, captureOperationBudget, captureOperation, parseCaptureProvenance, capturePageProvenance } from '../../tools/shot/capture-runtime.mjs';
import { registerTeardownResource, shutdown } from '../../tools/lib/harness.mjs';

test('dynamic capture queue stays bounded, preserves job order and keeps going after failure', async () => {
  let active = 0, maxActive = 0;
  const visited = [];
  const results = await poolMap([{ id: 0 }, { id: 1 }], [0, 1, 2, 3, 4], async (_w, job) => {
    active++; maxActive = Math.max(maxActive, active); visited.push(job);
    await new Promise((resolve) => setImmediate(resolve));
    active--;
    if (job === 2) throw new Error('job failed');
    return job * 10;
  });
  assert.equal(maxActive, 2); assert.equal(active, 0);
  assert.deepEqual(visited.sort(), [0, 1, 2, 3, 4]);
  assert.deepEqual(results, [0, 10, { job: 2, err: 'job failed' }, 30, 40]);
});

test('partial capture pool boot closes both previously ready and failed browsers', async () => {
  let launches = 0; const closed = [];
  await assert.rejects(startWorkerPool(3, 'http://fixture/', { width: 96, height: 64 }, {
    launch: async () => { const id = launches++; return { id, on() {}, close: async () => { closed.push(id); } }; },
    open: async (browser) => { if (browser.id === 1) throw new Error('boot failed'); return { on() {} }; },
    pause: async () => {},
  }), /boot failed/);
  assert.equal(launches, 2); assert.deepEqual(closed.sort(), [0, 1]);
});

test('capture page keeps backend AUTO and closes failed context before a reused browser takes another job', async () => {
  let closed = 0, init;
  const page = { addInitScript: async (_fn, arg) => { init = arg; }, goto: async () => { throw new Error('navigation failed'); },
    context: () => ({ close: async () => { closed++; } }) };
  await assert.rejects(openPage({ newPage: async () => page }, 'http://fixture/'), /navigation failed/);
  assert.equal(closed, 1); assert.equal(init.be, 'three'); assert.equal(init.forceGl, false);
});

test('mode capture failures retain a printable job name', async () => {
  const results = await poolMap([{ id: 0 }], [{ name: 'race', fn() {} }], async () => { throw new Error('capture failed'); });
  assert.deepEqual(results, [{ job: 'race', err: 'capture failed' }]);
});

test('capture runtime obeys actual soft screenshot file and numeric present-wait exports', async () => {
  mkdirSync(resolve(ROOT, 'scratch'), { recursive: true });
  const dir = mkdtempSync(resolve(ROOT, 'scratch/capture-runtime-test-'));
  const path = resolve(dir, 'scene.png');
  const png = await sharp({ create: { width: 96, height: 64, channels: 3, background: '#678' } }).composite([{ input: await sharp({ create: { width: 40, height: 30, channels: 3, background: '#abc' } }).png().toBuffer(), top: 14, left: 28 }]).png().toBuffer();
  let waits = 0;
  const page = {
    waitForFunction: async () => true,
    evaluate: async (fn, arg) => {
      const body = String(fn);
      if (body.includes('const deadline = Date.now() + ms')) { assert.equal(arg.ms, 30000); waits++; return; }
      if (body.includes('const a = window.__apex')) return { diag: { env: { backend: 'three', backendState: { api: 'webgl2', gpuErrors: 0 } } }, frame: { camera: { eye: [0, 1, 2] } } };
      if (fn === visibleScreen) return { url: 'http://local/?seed=1', title: 'Apex', visibleRoots: [], errorOverlay: null };
      if (body.includes('const softLive')) return { b64: png.toString('base64'), id: 'game-soft' };
    },
  };
  try {
    await stageRace(page, 'monza');
    const evidence = await recordCapture(page, path, 'three');
    assert.deepEqual(readFileSync(path), png);
    assert.equal(evidence.image.bytes, png.length); assert.equal(evidence.image.via, 'game-soft');
    assert.equal(evidence.renderer.positive, true); assert.equal(waits, 2);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('capture operations cap the remaining whole-run budget without passing zero and clear owned timeout', async () => {
  const context = { deadline: { expiresEpochMs: 100000 } };
  assert.equal(captureOperationBudget(context, 60000, 1000), 60000);
  assert.equal(captureOperationBudget(context, 60000, 99989), 11);
  assert.throws(() => captureOperationBudget(context, 60000, 100000), /deadline exhausted/);
  assert.throws(() => captureOperationBudget(context, 0, 1000), /positive/);
  const originalSet = globalThis.setTimeout, originalClear = globalThis.clearTimeout;
  const handles = new Set();
  globalThis.setTimeout = (fn, ms) => { assert.ok(ms >= 1); const handle = originalSet(fn, ms); handles.add(handle); return handle; };
  globalThis.clearTimeout = (handle) => { handles.delete(handle); return originalClear(handle); };
  try {
    const receipt = { phase: 'follow:canvas-capture', deadline: { expiresEpochMs: Date.now() + 10 } };
    await assert.rejects(captureOperation(receipt, 'canvas-capture', 60000, () => new Promise(() => {})), /canvas-capture deadline exceeded/);
    assert.equal(handles.size, 0); assert.equal(receipt.operationTimings[0].status, 'failed');
    assert.ok(receipt.operationTimings[0].timeoutMs >= 1 && receipt.operationTimings[0].timeoutMs <= 10);
    assert.equal(receipt.operationTimings[0].capMs, 60000); assert.ok(receipt.operationTimings[0].elapsedMs >= 0);
  } finally { for (const handle of handles) originalClear(handle); globalThis.setTimeout = originalSet; globalThis.clearTimeout = originalClear; }
});

test('recordCapture passes the real CDP helper sixty-second cap or smaller remaining deadline', async () => {
  mkdirSync(resolve(ROOT, 'scratch'), { recursive: true });
  const dir = mkdtempSync(resolve(ROOT, 'scratch/capture-cdp-budget-'));
  const png = await sharp({ create: { width: 96, height: 64, channels: 3, background: '#678' } }).composite([{ input: await sharp({ create: { width: 40, height: 30, channels: 3, background: '#abc' } }).png().toBuffer(), top: 14, left: 28 }]).png().toBuffer();
  const originalSet = globalThis.setTimeout, originalClear = globalThis.clearTimeout;
  const handles = new Set(), budgets = []; let detached = 0, presents = 0;
  globalThis.setTimeout = (fn, ms) => { budgets.push(ms); const handle = originalSet(fn, ms); handles.add(handle); return handle; };
  globalThis.clearTimeout = (handle) => { handles.delete(handle); return originalClear(handle); };
  const page = { waitForFunction: async () => true, context: () => ({ newCDPSession: async () => ({ send: async () => ({ data: png.toString('base64') }), detach: async () => { detached++; } }) }),
    evaluate: async (fn, arg) => {
      const body = String(fn);
      if (body.includes('const deadline = Date.now() + ms')) { presents++; assert.ok(arg.ms > 0 && arg.ms <= 30000); return; }
      if (body.includes('const a = window.__apex')) return { diag: { env: { backend: 'three', backendState: { api: 'webgl2', gpuErrors: 0 } } }, frame: { camera: { eye: [0, 1, 2] } } };
      if (fn === visibleScreen) return { errorOverlay: null, visibleRoots: [] };
      if (body.includes('const softLive')) return null;
      if (body.includes('const soft = document')) return { x: 0, y: 0, width: 96, height: 64, id: 'game' };
    } };
  try {
    for (const remaining of [100000, 1000]) {
      const context = { phase: 'follow:0', deadline: { expiresEpochMs: Date.now() + remaining } };
      const before = budgets.length;
      const shot = await recordCapture(page, resolve(dir, remaining + '.png'), 'three', context);
      const capture = shot.operationTimings.find((operation) => operation.name === 'canvas-capture');
      assert.equal(shot.image.via, 'cdp'); assert.equal(shot.renderer.positive, true);
      assert.equal(capture.timeoutMs, remaining === 100000 ? 60000 : capture.wholeRemainingMsAtStart);
      const timers = budgets.slice(before);
      assert.ok(timers.filter((ms) => ms === capture.timeoutMs).length >= 2, 'operation watchdog and actual CDP timeout share requested cap');
      assert.ok(timers.every((ms) => ms > 0 && ms <= remaining)); assert.equal(handles.size, 0);
    }
    assert.equal(detached, 2); assert.equal(presents, 2, 'one existing presented-frame barrier per capture');
  } finally { for (const handle of handles) originalClear(handle); globalThis.setTimeout = originalSet; globalThis.clearTimeout = originalClear; rmSync(dir, { recursive: true, force: true }); }
});

test('whole-run deadline invokes harness cleanup without awaiting direct browser closes; failure context survives', async () => {
  const context = { identity: { requestedSeed: 1 }, consoleEvents: [{ type: 'pageerror', text: 'saved' }] };
  let cleaned = 0;
  const started = Date.now();
  await assert.rejects(runBoundedCapture(() => new Promise(() => {}), { timeoutMs: 10, cleanup: async () => { cleaned++; }, context }), (err) => {
    assert.match(err.message, /whole-run deadline/); assert.equal(err.captureContext, context); return true;
  });
  assert.equal(cleaned, 1); assert.ok(Date.now() - started < 1000);
  const failure = new Error('original capture failure');
  await assert.rejects(runBoundedCapture(async () => { throw failure; }, { timeoutMs: 10000, cleanup: async () => { throw new Error('cleanup rejected'); }, context }), (err) => err === failure && err.captureContext.teardownError === 'cleanup rejected');
});

test('replay compositor recording is scoped to output and actual game frame progression is polled', async () => {
  const opts = { out: resolve(ROOT, 'artifacts/replay-test'), viewport: { width: 1280, height: 720 } };
  assert.deepEqual(captureContextOptions(opts), { viewport: opts.viewport });
  assert.equal(captureContextOptions({ ...opts, compositorRecording: true }).recordVideo.dir, resolve(opts.out, 'compositor-video'));
  let frame = 7, waits = 0;
  const original = globalThis.window;
  globalThis.window = { __apex: { cameraState: () => ({ renderFrame: frame, renderTime: 4, simulationTime: 4 }) } };
  const page = { evaluate: async (fn) => fn(), waitForFunction: async (fn, before, opts) => { assert.equal(before, 7); assert.equal(fn(before), false); assert.equal(opts.polling, 100); assert.equal(opts.timeout, 30000); frame++; assert.equal(fn(before), true); waits++; } };
  try { assert.deepEqual(await waitNextGameRender(page), { before: 7, after: 8, renderTime: 4, simulationTime: 4 }); assert.equal(waits, 1); }
  finally { globalThis.window = original; }
});

test('failure snapshot is bounded while preserving exact phase-state data when page is live', async () => {
  const snapshot = await captureFailureSnapshot({ evaluate: async (fn) => fn === visibleScreen ? { errorOverlay: null, visibleRoots: ['pausemenu'] } : { info: { state: 'race' }, replay: { active: true }, cameraState: { renderFrame: 8 }, backend: 'webgl2' } });
  assert.equal(snapshot.info.state, 'race'); assert.equal(snapshot.cameraState.renderFrame, 8); assert.deepEqual(snapshot.screen.visibleRoots, ['pausemenu']);
  const failed = await captureFailureSnapshot({ evaluate: async () => new Promise(() => {}) }, 10);
  assert.match(failed.snapshotError, /deadline exceeded/);
});

test('failure snapshot preserves cheap state and screen when GPU diagnostics never resolve', async () => {
  const originals = { window: globalThis.window, RealRace: globalThis.RealRace, document: globalThis.document };
  let calls = 0;
  globalThis.window = { __apex: { info: () => ({ state: 'race' }), cameraState: () => ({ renderFrame: 17 }), headless: () => false, freeze: () => false,
    diag: () => { throw new Error('GPU diagnostics reached before cheap state'); } } };
  globalThis.RealRace = { status: () => ({ active: true, replay: { T: 120 } }) };
  globalThis.document = { hidden: false, visibilityState: 'visible' };
  const page = { evaluate: async (fn) => {
    calls++;
    if (calls === 1) return fn();
    if (calls === 2) { assert.equal(fn, visibleScreen); return { visibleRoots: ['pausemenu'], errorOverlay: null }; }
    assert.match(String(fn), /diag/); return new Promise(() => {});
  } };
  try {
    const state = await captureFailureSnapshot(page, 10);
    assert.equal(calls, 3); assert.equal(state.info.state, 'race'); assert.equal(state.cameraState.renderFrame, 17);
    assert.equal(state.replay.replay.T, 120); assert.deepEqual(state.screen.visibleRoots, ['pausemenu']);
    assert.equal(state.headless, false); assert.equal(state.visibilityState, 'visible');
    assert.equal(state.snapshotStage, 'gpu'); assert.match(state.snapshotError, /deadline exceeded/);
  } finally { Object.assign(globalThis, originals); }
});

test('actual harness registry drains resource acquired during pending shutdown', async () => {
  let release, closing = false; const closed = [], forced = [];
  registerTeardownResource({ close: () => { closing = true; closed.push('first'); return new Promise((resolve) => { release = resolve; }); }, force: () => forced.push('first') });
  const teardown = shutdown();
  assert.equal(closing, true);
  registerTeardownResource({ close: async () => { closed.push('late'); }, force: () => forced.push('late') });
  release(); await teardown;
  assert.deepEqual(closed, ['first', 'late']); assert.deepEqual(forced, ['first', 'late']);
  await shutdown(); assert.deepEqual(forced, ['first', 'late']);
});

test('capture provenance keeps source and deployed shell SHAs distinct', async () => {
  const source = 'ABCDEFabcdefABCDEFabcdefABCDEFabcdefABCD';
  const deployed = '0123456789abcdef0123456789abcdef01234567';
  const page = { evaluate: async () => ({ deployedSha: deployed, build: 2042, version: '2026.10.16' }) };
  const evidence = await capturePageProvenance(page, { sourceSha: source, dirty: true });
  assert.deepEqual(evidence, { sourceSha: source.toLowerCase(), deployedSha: deployed, deployedShaTrusted: true,
    matches: false, build: '2042', version: '2026.10.16', dirty: true });
  assert.equal(parseCaptureProvenance({ sourceSha: source, deployedSha: source }).matches, true);
  assert.equal(parseCaptureProvenance({ sourceSha: source, deployedSha: 'latest' }).deployedShaTrusted, false);
  assert.equal(parseCaptureProvenance({ sourceSha: source, deployedSha: null }).deployedSha, null);
});
