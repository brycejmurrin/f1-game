// capture-tools-present.test.mjs — presented-canvas capture (tools/shot/probe-page.mjs): CDP readback, render pause, frame generations, atomic mutations.
// One of five per-tool files split from capture-tools-regressions.test.mjs (T1-10, #3043); no browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { screenshotPresentedCanvas, awaitCaptureReady, mutateCaptureScene, withCaptureRendering, screenshotNativeCanvas } from '../../tools/shot/probe-page.mjs';
import { waitCaptureFrame } from '../../tools/shot/apex-capture.mjs';

test('successful and rejected CDP capture clear deadline and detach session', async () => {
  const originalSet = globalThis.setTimeout, originalClear = globalThis.clearTimeout;
  const handles = new Set(); let detached = 0;
  globalThis.setTimeout = (fn, ms) => { const t = originalSet(fn, ms); handles.add(t); return t; };
  globalThis.clearTimeout = (t) => { handles.delete(t); return originalClear(t); };
  try {
    for (const failed of [false, true]) {
      const page = { context: () => ({ newCDPSession: async () => ({ send: async () => { if (failed) throw new Error('capture rejected'); return { data: Buffer.from('png').toString('base64') }; }, detach: async () => { detached++; } }) }) };
      const operation = screenshotPresentedCanvas(page, { skipAwait: true, forceCdp: true, clip: { x: 0, y: 0, width: 10, height: 10 }, timeout: 30000 });
      if (failed) await assert.rejects(operation, /capture rejected/); else assert.equal((await operation).via, 'cdp');
      assert.equal(handles.size, 0);
    }
    assert.equal(detached, 2);
  } finally { for (const h of handles) originalClear(h); globalThis.setTimeout = originalSet; globalThis.clearTimeout = originalClear; }
});

test('CDP forwards fast PNG opt-out and explicit JPEG quality', async () => {
  const sent = [];
  const page = { context: () => ({ newCDPSession: async () => ({
    send: async (method, params) => { sent.push({ method, params }); return { data: Buffer.from('png').toString('base64') }; },
    detach: async () => {},
  }) }) };
  const opts = { skipAwait: true, forceCdp: true, clip: { x: 1, y: 2, width: 10, height: 20 } };
  await screenshotPresentedCanvas(page, opts);
  await screenshotPresentedCanvas(page, { ...opts, optimizeForSpeed: false });
  await screenshotPresentedCanvas(page, { ...opts, type: 'jpeg', quality: 72 });
  assert.equal(sent[0].method, 'Page.captureScreenshot');
  assert.equal(sent[0].params.optimizeForSpeed, true);
  assert.equal(sent[1].params.optimizeForSpeed, false);
  assert.equal(sent[2].params.optimizeForSpeed, undefined);
  assert.equal(sent[2].params.quality, 72);
  assert.deepEqual(sent[0].params.clip, { ...opts.clip, scale: 1 });
});

test('capture generation ignores the old readback and stops at the first matching displayed source', async () => {
  let submitted = 9, shown = 8, waits = 0;
  const gfx = { softPresent: () => true, softPresentState: () => ({ submittedGen: submitted, shownGen: shown }),
    awaitSoftPresent: async () => { waits++; if (waits === 1) shown = 9; else { submitted = 12; shown = 10; } return shown; } };
  const page = { evaluate: (fn, ms) => vm.runInNewContext('(' + fn.toString() + ')(timeout)',
    { GLX: gfx, timeout: ms, window: {}, setTimeout, clearTimeout, Date }) };
  const result = await waitCaptureFrame(page);
  assert.equal(result.mode, 'source-generation'); assert.equal(result.required, 10);
  assert.equal(result.shown, 10); assert.equal(waits, 2);
});

test('a matching next source needs only one present and a stalled source rejects capture', async () => {
  let shown = 4, waits = 0;
  const gfx = { softPresent: () => true, softPresentState: () => ({ submittedGen: shown, shownGen: shown }),
    awaitSoftPresent: async () => { waits++; shown = 5; return shown; } };
  const page = { evaluate: (fn, ms) => vm.runInNewContext('(' + fn.toString() + ')(timeout)',
    { GLX: gfx, timeout: ms, window: {}, setTimeout, clearTimeout, Date }) };
  assert.equal((await awaitCaptureReady(page)).shown, 5); assert.equal(waits, 1);
  gfx.awaitSoftPresent = () => new Promise(() => {});
  await assert.rejects(awaitCaptureReady(page, { timeoutMs: 10 }), /timed out/);
  await assert.rejects(screenshotPresentedCanvas(page, { awaitMs: 10 }), /timed out/);
});

test('native frame barrier checks real game render progress rather than a resolved soft promise', async () => {
  let frame = 17, presents = 0;
  const gfx = { softPresent: () => false, awaitSoftPresent: async () => { presents++; } };
  const page = { evaluate: (fn, ms) => vm.runInNewContext('(' + fn.toString() + ')(timeout)',
    { GLX: gfx, timeout: ms, window: { __apex: { cameraState: () => ({ renderFrame: frame++ }) } }, setTimeout, clearTimeout, Date }) };
  const result = await waitCaptureFrame(page);
  assert.equal(result.mode, 'native-frame'); assert.ok(result.shown >= result.before + 2);
  assert.equal(presents, 0);
});

test('CDP render pause restores the previous headless state on success and failure', async () => {
  const previous = globalThis.window;
  try {
    for (const before of [false, true]) for (const fail of [false, true]) {
      let headless = before;
      globalThis.window = { __apex: { headless: (value) => value === undefined ? headless : (headless = value) } };
      const page = { evaluate: async (fn, arg) => fn(arg), context: () => ({ newCDPSession: async () => ({
        send: async () => { assert.equal(headless, true); if (fail) throw new Error('failed'); return { data: Buffer.from('png').toString('base64') }; },
        detach: async () => {},
      }) }) };
      const capture = screenshotPresentedCanvas(page, { pauseRender: true, skipAwait: true, forceCdp: true, clip: { x: 0, y: 0, width: 10, height: 20 } });
      if (fail) await assert.rejects(capture, /failed/); else await capture;
      assert.equal(headless, before);
    }
  } finally { globalThis.window = previous; }
});

test('paused CDP deadline restores rendering and soft captures avoid the pause entirely', async () => {
  const previous = globalThis.window;
  let headless = false, detached = 0;
  globalThis.window = { __apex: { headless: (value) => value === undefined ? headless : (headless = value) } };
  try {
    const page = { evaluate: async (fn, arg) => fn(arg), context: () => ({ newCDPSession: async () => ({
      send: () => new Promise(() => {}), detach: async () => { detached++; },
    }) }) };
    await assert.rejects(screenshotPresentedCanvas(page, { pauseRender: true, skipAwait: true, forceCdp: true,
      clip: { x: 0, y: 0, width: 10, height: 20 }, timeout: 10 }), /timed out/);
    assert.equal(headless, false); assert.equal(detached, 1);
    let evaluations = 0;
    const shot = await screenshotPresentedCanvas({ evaluate: async () => {
      evaluations++; return { b64: Buffer.from('png').toString('base64'), id: 'game-soft' };
    }, context: () => { throw new Error('soft capture must not open CDP'); } }, { skipAwait: true, pauseRender: true });
    assert.equal(shot.via, 'game-soft'); assert.equal(evaluations, 1); assert.equal(headless, false);
  } finally { globalThis.window = previous; }
});

test('legacy presentation requires advancing generations and native unsupported clocks fail explicitly', async () => {
  const gfx = { softPresent: () => true, softPresentState: () => ({ gen: 4 }), awaitSoftPresent: async () => 4 };
  const page = { evaluate: (fn, ms) => vm.runInNewContext('(' + fn.toString() + ')(timeout)',
    { GLX: gfx, timeout: ms, window: {}, setTimeout, clearTimeout, Date }) };
  await assert.rejects(awaitCaptureReady(page, { timeoutMs: 20 }), /stale presentation generation/);
  let gen = 4; gfx.awaitSoftPresent = async () => ++gen;
  assert.equal((await awaitCaptureReady(page)).shown, 6);
  gfx.softPresent = () => false;
  await assert.rejects(awaitCaptureReady(page), /no usable presentation clock/);
});

test('WGX copy-generation readiness invalidates the previous scene and rejects its pending copy', async () => {
  const state = { seq: 4, shown: 3 }; let invalidated = 0, waits = 0;
  const gfx = { softPresent: () => true, softPresentState: () => state,
    invalidateSoftPresent: () => { invalidated++; },
    awaitSoftPresent: async () => { waits++; state.seq = 5; state.shown = waits === 1 ? 4 : 5; return state.shown; } };
  const page = { evaluate: (fn, ms) => vm.runInNewContext('(' + fn.toString() + ')(timeout)',
    { GLX: gfx, timeout: ms, window: {}, setTimeout, clearTimeout, Date }) };
  const result = await awaitCaptureReady(page);
  assert.equal(result.mode, 'copy-generation'); assert.equal(result.required, 5);
  assert.equal(result.shown, 5); assert.equal(waits, 2); assert.equal(invalidated, 1);
});

test('atomic capture mutation preserves callback result and accepts a frame already displayed after mutation', async () => {
  const state = { submittedGen: 4, shownGen: 3 };
  let waits = 0;
  const context = vm.createContext({ GLX: { softPresent: () => true, softPresentState: () => state,
    awaitSoftPresent: async () => { waits++; throw new Error('already displayed target must not wait'); } },
    window: { __apex: { camera: null } }, setTimeout, clearTimeout, Date });
  const page = { evaluate: (fn, arg) => { context.payload = arg; return vm.runInContext('(' + fn.toString() + ')(payload)', context); } };
  assert.equal(await mutateCaptureScene(page, async (value) => { window.__apex.camera = value; return 'changed-' + value; }, 'eye'), 'changed-eye');
  state.submittedGen = 8; state.shownGen = 5; // intervening frames after the atomic marker
  const result = await awaitCaptureReady(page);
  assert.equal(result.required, 5); assert.equal(result.shown, 5); assert.equal(waits, 0);
  assert.equal(context.window.__apex.camera, 'eye');
  await assert.rejects(mutateCaptureScene(page, 'not a callback'), /function callback/);
});

test('atomic WGX mutations invalidate exactly once and a renderer reset rebases stale markers', async () => {
  let invalidated = 0, waits = 0;
  const state = { seq: 4, shown: 3, epoch: 1, display: [640, 360] };
  const context = vm.createContext({ GLX: { softPresent: () => true, softPresentState: () => state,
    invalidateSoftPresent: () => { invalidated++; }, awaitSoftPresent: async () => { waits++; state.seq = state.shown = 2; return 2; } },
    window: {}, setTimeout, clearTimeout, Date });
  const page = { evaluate: (fn, arg) => { context.payload = arg; return vm.runInContext('(' + fn.toString() + ')(payload)', context); } };
  await mutateCaptureScene(page, () => 123);
  state.seq = state.shown = 5;
  assert.equal((await awaitCaptureReady(page)).required, 5); assert.equal(invalidated, 1); assert.equal(waits, 0);
  await mutateCaptureScene(page, () => null);
  state.seq = state.shown = 1; state.epoch = 2;
  assert.equal((await awaitCaptureReady(page)).required, 2); assert.equal(invalidated, 3); assert.equal(waits, 1);
});

test('garage capture uses actual native presents when the race camera clock is stationary', async () => {
  let presents = 0, paused = false;
  const window = { __apex: { garageCam: () => ({ on: true }), cameraState: () => ({ renderFrame: 0 }),
    headless: (value) => value == null ? paused : (paused = value) } };
  const GLX = { softPresent: () => false, awaitSoftPresent: async (_timeout, signal) => {
    assert.equal(signal, 'frame'); assert.equal(paused, false); presents++; return 'frame';
  } };
  const page = { evaluate: (fn, payload) => vm.runInNewContext('(' + fn.toString() + ')(payload)',
    { window, GLX, payload, setTimeout, clearTimeout, Date }) };
  const result = await awaitCaptureReady(page, { timeoutMs: 100, pauseRender: true });
  assert.equal(result.presents, 2); assert.equal(presents, 2); assert.equal(paused, true);
  paused = false; GLX.awaitSoftPresent = async () => 'stale';
  await assert.rejects(awaitCaptureReady(page, { timeoutMs: 100 }), /no usable presentation clock/);
});

test('isolated car capture uses the viewer draw clock instead of a race camera clock', async () => {
  let frame = 2;
  const window = { CARVIEW: { get frame() { return frame++; } }, __apex: { cameraState: () => ({ renderFrame: 0 }) } };
  const page = { evaluate: (fn, payload) => vm.runInNewContext('(' + fn.toString() + ')(payload)',
    { window, GLX: { softPresent: () => false }, payload, setTimeout, clearTimeout, Date }) };
  const result = await awaitCaptureReady(page, { timeoutMs: 100 });
  assert.equal(result.mode, 'native-frame'); assert.ok(result.shown >= result.before + 2);
});

test('capture rendering restores a live or paused owner after success or capture failure', async () => {
  for (const previous of [true, false]) for (const fail of [true, false]) {
    let paused = previous;
    const window = { __apex: { headless: (value) => value == null ? paused : (paused = value) } };
    const page = { evaluate: (fn, payload) => vm.runInNewContext('(' + fn.toString() + ')(payload)', { window, payload }) };
    const run = withCaptureRendering(page, async () => {
      assert.equal(paused, false);
      window.__apex.headless(true);
      if (fail) throw new Error('capture rejected');
      return 'captured';
    });
    if (fail) await assert.rejects(run, /capture rejected/); else assert.equal(await run, 'captured');
    assert.equal(paused, previous);
  }
});

test('native readback is submitted before pausing and restores its owner on failure', async () => {
  for (const before of [false, true]) {
    let paused = before, reads = 0;
    const window = { __apex: { headless: (value) => value == null ? paused : (paused = value) } };
    const GLX = { softPresent: () => false, awaitSoftPresent: async (_ms, signal) => {
      assert.equal(signal, 'frame'); assert.equal(paused, false); return 'frame';
    }, capturePixels: () => { reads++; assert.equal(paused, false); return Promise.reject(new Error('readback failed')); } };
    const page = { evaluate: (fn, payload) => vm.runInNewContext('(' + fn.toString() + ')(payload)',
      { window, GLX, payload, setTimeout, clearTimeout }) };
    await assert.rejects(screenshotNativeCanvas(page), /readback failed/);
    assert.equal(reads, 1); assert.equal(paused, before);
    GLX.awaitSoftPresent = async () => 'stale';
    await assert.rejects(screenshotNativeCanvas(page), /did not present/);
    assert.equal(reads, 1); assert.equal(paused, before);
    GLX.softPresent = () => true;
    assert.equal(await screenshotNativeCanvas(page), null);
    assert.equal(paused, before);
  }
});

test('timed-out native presentation cannot later start a readback or pause its owner', async () => {
  let paused = false, complete, reads = 0;
  const window = { __apex: { headless: (value) => value == null ? paused : (paused = value) } };
  const GLX = { softPresent: () => false, awaitSoftPresent: () => new Promise((resolve) => { complete = resolve; }),
    capturePixels: () => { reads++; throw new Error('late readback'); } };
  const page = { evaluate: (fn, payload) => vm.runInNewContext('(' + fn.toString() + ')(payload)',
    { window, GLX, payload, setTimeout, clearTimeout }) };
  await assert.rejects(screenshotNativeCanvas(page, { timeout: 5 }), /timed out/);
  assert.equal(paused, false); complete('frame');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(reads, 0); assert.equal(paused, false);
});
