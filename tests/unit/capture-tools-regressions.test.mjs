import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, mkdtempSync, writeFileSync, existsSync, rmSync, symlinkSync, truncateSync, realpathSync, statSync } from 'node:fs';
import { resolve, join, relative, isAbsolute, basename, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';
import { EventEmitter } from 'node:events';
import sharp from 'sharp';
import { screenshotPresentedCanvas, awaitCaptureReady, mutateCaptureScene } from '../../tools/shot/probe-page.mjs';
import { poolMap, startWorkerPool, waitCaptureFrame, openPage } from '../../tools/shot/apex-capture.mjs';
import { parseCssPlayArgs, screenClicks, SCREENS, swapStylesheet } from '../../tools/ui/css-play.mjs';
import { menuReady, previewMapSettled } from '../../tools/ui/menu-readiness.mjs';
import { parseSurveyTrackArgs } from '../../tools/track/survey-track.mjs';
import { parseCaptureArgs, pixelEvidence, rendererEvidence, ROOT } from '../../tools/shot/capture-contract.mjs';
import { lifecycleSoak, pendingWatchCancellation } from '../../tools/check/lifecycle-census.mjs';
import { recordCapture, stageRace, runBoundedCapture, visibleScreen, waitNextGameRender, captureContextOptions, captureFailureSnapshot, captureOperationBudget, captureOperation, parseCaptureProvenance, capturePageProvenance } from '../../tools/shot/capture-runtime.mjs';
import { parseBenchmarkArgs, summarizeBenchmarkSamples, captureSample } from '../../tools/shot/capture-benchmark.mjs';
import { registerTeardownResource, shutdown } from '../../tools/lib/harness.mjs';
import { cameraDelta, loadFixture, exitReplayThroughUi, preflightReplayFixture, cameraOnlyFixture, controlClickGuard, verifiedControlClick } from '../../tools/shot/replay-camera-probe.mjs';
import { parseCaptureOptions, captureViewport, captureContextOptions as profileContextOptions, captureScreenshotOptions, captureExtension, captureLaunchOptions, applyCaptureProfile } from '../../tools/shot/capture-options.mjs';
import { captureBrowserDiagnostics, assertCaptureGpuCapability, startCaptureTrace } from '../../tools/shot/capture-diagnostics.mjs';

test('agent help boots once with the selected seed and measured startup budget', async () => {
  const source = readFileSync(resolve(ROOT, 'tools/shot/agent.mjs'), 'utf8')
    .replace(/^#!.*$/m, '').replace(/^import .*;$/gm, '')
    .replace(/^const ROOT = .*;$/m, 'const ROOT = "/fixture";');
  const calls = []; let cleaned = 0;
  const page = {
    goto: async (url) => calls.push(['goto', url]),
    waitForFunction: async (_fn, _args, options) => calls.push(['wait', options.timeout, options.polling]),
    evaluate: async () => ({ commands: ['help'] }),
  };
  const processStub = { argv: ['node', 'agent.mjs', 'help', '--seed', '0'], exitCode: 0,
    exit: (code) => { throw new Error(`unexpected exit ${code}`); } };
  await vm.runInNewContext(source, {
    process: processStub, console: { log() {}, error() {} },
    startStaticServer: async () => ({ url: 'http://fixture/' }),
    launchChromium: async () => ({ newPage: async () => page }),
    installProbeInit: async () => calls.push(['init']),
    chromiumArgsForBackend: () => [], sleep: async () => {},
    shutdown: async () => { cleaned++; },
  });
  assert.deepEqual(calls, [['init'], ['goto', 'http://fixture/?seed=0'], ['wait', 45000, 100]]);
  assert.equal(processStub.exitCode, 0);
  assert.equal(cleaned, 1);
});

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

test('capture page keeps backend AUTO and closes failed context before a reused browser takes another job', async () => {
  let closed = 0, init;
  const page = { addInitScript: async (_fn, arg) => { init = arg; }, goto: async () => { throw new Error('navigation failed'); },
    context: () => ({ close: async () => { closed++; } }) };
  await assert.rejects(openPage({ newPage: async () => page }, 'http://fixture/'), /navigation failed/);
  assert.equal(closed, 1); assert.equal(init.be, 'three'); assert.equal(init.forceGl, false);
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

test('mode capture failures retain a printable job name', async () => {
  const results = await poolMap([{ id: 0 }], [{ name: 'race', fn() {} }], async () => { throw new Error('capture failed'); });
  assert.deepEqual(results, [{ job: 'race', err: 'capture failed' }]);
});

test('capture parsers reject nonfinite dimensions, scales and unknown flags; seed zero stays explicit', () => {
  for (const viewport of ['Infinityx720', '-2x720', '100.5x720', '0x720', '8193x720']) assert.throws(() => parseCssPlayArgs(['--viewport', viewport]), /viewport/);
  for (const scale of ['NaN', 'Infinity', '39', '201']) assert.throws(() => parseCssPlayArgs(['--scale', scale]), /scale/);
  assert.equal(parseCssPlayArgs(['--scale', '130']).scale, 130);
  assert.deepEqual(screenClicks({ clicks: ['#extra'] }, SCREENS.settings), [...SCREENS.settings.clicks, '#extra']);
  assert.deepEqual(screenClicks({ root: '#custom', clicks: ['#extra'] }, SCREENS.settings), ['#extra']);
  assert.equal(parseCaptureArgs(['--seed=0', '--plan'], 'lifecycle-census').seed, 0);
  assert.throws(() => parseCaptureArgs(['--out', '/tmp/capture'], 'lifecycle-census'), /out/);
  assert.throws(() => parseCaptureArgs(['--track', 'unknown-track'], 'lifecycle-census'), /unknown track/);
  mkdirSync(resolve(ROOT, 'scratch'), { recursive: true });
  const dir = mkdtempSync(resolve(ROOT, 'scratch/capture-path-test-'));
  try { symlinkSync(resolve(ROOT, 'js'), resolve(dir, 'source-link')); assert.throws(() => parseCaptureArgs(['--out', resolve(dir, 'source-link', 'bad')], 'lifecycle-census'), /out real/); }
  finally { rmSync(dir, { recursive: true, force: true }); }
  for (const argv of [['monza', '--wat'], ['monza', 'before', 'NaN'], ['monza', 'before', '0,2'], ['monza', 'before', '0,,1']]) assert.throws(() => parseSurveyTrackArgs(argv));
});

test('infinite decorative animation does not block while a finite transition does', () => {
  const originalDoc = globalThis.document, originalStyle = globalThis.getComputedStyle;
  let animations = [{ playState: 'running', effect: { getComputedTiming: () => ({ endTime: Infinity, iterations: Infinity }) } }];
  globalThis.document = { querySelector: () => ({ getAnimations: () => animations }) };
  globalThis.getComputedStyle = () => ({ opacity: '1', visibility: 'visible', display: 'block' });
  try {
    assert.equal(menuReady('#menu'), true);
    animations.push({ playState: 'running', effect: { getComputedTiming: () => ({ endTime: 300, iterations: 1 }) } });
    assert.equal(menuReady('#menu'), false);
  } finally { globalThis.document = originalDoc; globalThis.getComputedStyle = originalStyle; }
});

// THE PREVIEW WAIT MUST NOT ACCEPT THE SHELL DEFAULT. The 2026-10-05 iPad
// audit read `map 520x300 BLANK` on both cells: the old predicate checked only
// buffer > 8 and buffer/box aspect, and an undrawn 520x300 canvas in its own
// 520x300 box passes both. Fake canvas: attributes, a buffer, a box, and the
// alpha channel getImageData would return.
test('preview-map wait holds on the undrawn 520x300 default, releases on a draw or ink', () => {
  const originalDoc = globalThis.document;
  const canvas = (o) => ({
    width: o.w, height: o.h, currentCSSZoom: 1,
    getContext: () => ({ getImageData: () => ({ data: o.alpha }) }),
    getBoundingClientRect: () => ({ width: o.bw, height: o.bh }),
    hasAttribute: (a) => a === 'data-drawn' && !!o.drawn,
  });
  const blank = new Uint8ClampedArray(520 * 300 * 4);
  const inked = new Uint8ClampedArray(520 * 300 * 4); inked[4 * 1000 + 3] = 255;
  const at = (cv) => { globalThis.document = { getElementById: () => cv }; return previewMapSettled(); };
  try {
    assert.equal(at(canvas({ w: 520, h: 300, bw: 520, bh: 300, alpha: blank })), false, 'shell default, no ink, aspect-matched: keep waiting');
    assert.equal(at(canvas({ w: 520, h: 300, bw: 0, bh: 0, alpha: blank })), false, 'hidden zero box (css/select.css) before the draw');
    assert.equal(at(canvas({ w: 520, h: 300, bw: 520, bh: 300, alpha: inked })), true, 'a 520x300 that carries ink was drawn');
    assert.equal(at(canvas({ w: 362, h: 534, bw: 181, bh: 267, alpha: blank, drawn: true })), true, 'fitted and stamped');
    assert.equal(at(canvas({ w: 362, h: 534, bw: 520, bh: 300, alpha: blank, drawn: true })), false, 'buffer refit, box not yet');
    assert.equal(at(canvas({ w: 1, h: 1, bw: 1, bh: 1, alpha: blank, drawn: true })), false, 'placeholder buffer');
    assert.equal(at(null), true, 'no canvas: nothing to wait for');
  } finally { globalThis.document = originalDoc; }
});

test('single-screen layout dispatch actually forwards 130 percent and rejects scale matrix', async () => {
  const source = readFileSync(resolve(ROOT, 'tools/ui/layout-audit.mjs'), 'utf8');
  const block = source.slice(source.indexOf('if (opts.screen) {'), source.indexOf('if (opts.gallery) {'));
  const dispatch = new (Object.getPrototypeOf(async function () {}).constructor)('opts', 'runMenuShot', 'console', 'process', block);
  let passed;
  await dispatch({ screen: 'settings', viewport: 'ios-iphone-landscape', scales: [130], force: false, outDir: 'artifacts/test' }, async (opts) => { passed = opts; return { ok: true }; }, { log() {} }, { exit() {} });
  assert.equal(passed.scale, 130);
  await assert.rejects(dispatch({ screen: 'settings', scales: [100, 130] }, async () => { throw new Error('should not run'); }, { log() {} }, { exit() {} }), /one --scale/);
});

test('garage reset plan preserves existing evidence and invalid part enum never creates output', () => {
  mkdirSync(resolve(ROOT, 'scratch'), { recursive: true });
  const dir = mkdtempSync(resolve(ROOT, 'scratch/capture-plan-test-'));
  try {
    writeFileSync(resolve(dir, 'preserved.txt'), 'evidence');
    const planned = spawnSync(process.execPath, ['tools/shot/garage-angles.mjs', '--plan', '--reset', '--out=' + dir], { cwd: ROOT, encoding: 'utf8', timeout: 10000 });
    assert.equal(planned.status, 0, planned.stderr); assert.equal(readFileSync(resolve(dir, 'preserved.txt'), 'utf8'), 'evidence');
    const child = resolve(dir, 'invalid');
    const invalid = spawnSync(process.execPath, ['tools/shot/garage-angles.mjs', '--plan', '--out=' + child, '--tcam=invalid'], { cwd: ROOT, encoding: 'utf8', timeout: 10000 });
    assert.notEqual(invalid.status, 0); assert.match(invalid.stderr, /invalid tcam/); assert.equal(existsSync(child), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('pixel evidence distinguishes black and edge-only HUD from presented scene; requested backend alone proves nothing', async () => {
  const black = await sharp({ create: { width: 96, height: 64, channels: 3, background: '#000' } }).png().toBuffer();
  const whiteTop = await sharp({ create: { width: 96, height: 5, channels: 3, background: '#fff' } }).png().toBuffer();
  const edge = await sharp(black).composite([{ input: whiteTop, top: 0, left: 0 }]).png().toBuffer();
  assert.equal((await pixelEvidence(black)).black, true);
  assert.equal((await pixelEvidence(edge)).blackHudOnly, true);
  const scene = await sharp(black).composite([{ input: await sharp({ create: { width: 40, height: 40, channels: 3, background: '#789' } }).png().toBuffer(), top: 12, left: 28 }]).png().toBuffer();
  const pixels = await pixelEvidence(scene); assert.equal(pixels.meaningful, true);
  assert.equal(rendererEvidence({ env: { backend: 'three' } }, pixels).positive, false);
  assert.equal(rendererEvidence({ env: { backend: 'three', backendState: { api: 'webgl2', gpuErrors: 0 } } }, pixels).positive, true);
  assert.equal(rendererEvidence({ env: { backendState: { api: 'webgl2', gpuErrors: 1 } } }, pixels).positive, false);
  assert.equal(rendererEvidence({ env: { backend: 'three', backendState: { api: 'webgl2', gpuErrors: 0 } } }, pixels, 'webgpu').positive, false);
  assert.equal(cameraDelta({ frame: { camera: { eye: [0, 0, 0] } } }, { frame: { camera: { eye: [3, 4, 0] } } }), 5);
});

test('lifecycle pending WATCH cancellation prevents stale trace completion launching replay', async () => {
  const cancellation = await pendingWatchCancellation();
  assert.equal(cancellation.ok, true);
  assert.equal(cancellation.before.pendingRequests, 1);
  assert.equal(cancellation.after.pendingRequests, 0);
  assert.equal(cancellation.after.launches, 0);
  assert.equal(cancellation.after.cachedTraces, false);
});

test('lifecycle soak closes every repeated headless mode cycle', async () => {
  const soak = await lifecycleSoak({ track: 'monza', seed: 7, cycles: 1 });
  assert.equal(soak.ok, true);
  assert.equal(soak.rows.length, 1);
  assert.equal(soak.rows[0].closed.resources.timers, 0);
  assert.equal(soak.rows[0].closed.resources.rafFrames, 0);
  assert.equal(soak.rows[0].closed.resources.rejectionListeners, 0);
});

test('lifecycle census accepts a bounded repeat count', () => {
  assert.equal(parseCaptureArgs(['--cycles=3', '--plan'], 'lifecycle-census', ['--cycles']).cycles, 3);
  assert.throws(() => parseCaptureArgs(['--cycles=13', '--plan'], 'lifecycle-census', ['--cycles']), /cycles bounds/);
});

test('replay fixture plan is offline and bounded', () => {
  const child = spawnSync(process.execPath, ['tools/shot/replay-camera-probe.mjs', '--fixture=default', '--frames=1', '--plan'], { cwd: ROOT, encoding: 'utf8', timeout: 10000 });
  assert.equal(child.status, 0, child.stderr);
  assert.deepEqual(JSON.parse(child.stdout).phases, ['entry', 'seek', 'follow', 'exit', 'reentry']);
  assert.throws(() => parseCaptureArgs(['--frames=121'], 'replay-camera-probe', ['--frames']), /frames/);
});

test('survey preserves both signed terrain profiles instead of inventing a cross-side step', () => {
  const source = readFileSync(resolve(ROOT, 'tools/track/survey-track.mjs'), 'utf8');
  const begin = source.indexOf('probeRows = await page.evaluate(') + 'probeRows = await page.evaluate('.length;
  const end = source.indexOf(', { fracs: FRACS, lats: LATS });', begin);
  const sample = new Function('window', 'return (' + source.slice(begin, end) + ');')({ __apex: { groundY: (frac, lat) => ({ roadY: 0, terrainY: lat > 0 ? (lat === 20 ? null : 2) : 8, gap: 0 }) } });
  const rows = sample({ fracs: [0.1], lats: [12, 20] });
  assert.deepEqual(rows.map((r) => r.side), ['R', 'L']);
  assert.deepEqual(rows[0].cells.map((c) => c.terrainY), [2, null]);
  assert.deepEqual(rows[1].cells.map((c) => c.terrainY), [8, 8]);
  assert.deepEqual(rows[1].cells.map((c) => c.lat), [-12, -20]);
});

test('stylesheet load, error and deadline all restore handlers and clear owned timer', async () => {
  const originalDoc = globalThis.document, originalSet = globalThis.setTimeout, originalClear = globalThis.clearTimeout;
  const css = 'css/carsetup.css';
  try {
    for (const mode of ['load', 'error', 'timeout']) {
      const beforeLoad = () => {}, beforeError = () => {}; let timer, cleared = false;
      const link = { onload: beforeLoad, onerror: beforeError, getAttribute: () => css, get href() { return css; }, set href(value) { assert.match(value, /\?play=/); queueMicrotask(() => { if (mode === 'timeout') timer(); else this['on' + mode](); }); } };
      globalThis.document = { querySelectorAll: () => [link] };
      globalThis.setTimeout = (fn) => { timer = fn; return 77; };
      globalThis.clearTimeout = (id) => { assert.equal(id, 77); cleared = true; };
      const page = { evaluate: (fn, arg) => fn(arg) };
      if (mode === 'load') await swapStylesheet(page, css);
      else await assert.rejects(swapStylesheet(page, css), mode === 'timeout' ? /timed out/ : /reload failed/);
      assert.equal(cleared, true); assert.equal(link.onload, beforeLoad); assert.equal(link.onerror, beforeError);
    }
  } finally { globalThis.document = originalDoc; globalThis.setTimeout = originalSet; globalThis.clearTimeout = originalClear; }
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

test('replay fixture rejects oversized regular files before parsing and rejects nonfiles', () => {
  mkdirSync(resolve(ROOT, 'scratch'), { recursive: true });
  const dir = mkdtempSync(resolve(ROOT, 'scratch/capture-fixture-test-'));
  const path = resolve(dir, 'large.json');
  try {
    writeFileSync(path, 'not valid JSON'); truncateSync(path, 9 * 1024 * 1024);
    assert.throws(() => loadFixture({ fixture: path, track: 'baku' }), /exceeds 8 MiB/);
    assert.throws(() => loadFixture({ fixture: dir, track: 'baku' }), /regular file/);
    writeFileSync(path, '{invalid secret-like payload');
    assert.throws(() => loadFixture({ fixture: path, track: 'baku' }), (err) => err.message === 'fixture must contain valid JSON');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('replay exit reveals actual HUD pause control before clicks and restores prior HUD state', async () => {
  const source = readFileSync(resolve(ROOT, 'js/agent/apex.js'), 'utf8');
  const start = source.indexOf('  hud(show) {');
  const end = source.indexOf('\n  },', start);
  const hudBody = source.slice(start + '  hud(show) {'.length, end);
  const originals = { window: globalThis.window, RealRace: globalThis.RealRace, localStorage: globalThis.localStorage };
  try {
    for (const confirm of [true, false]) {
      const els = { hud: { hidden: true }, pausebtn: { hidden: true } }, G = { state: 'race' };
      const hud = new Function('els', 'G', 'return function(show) {' + hudBody + '}')(els, G);
      const events = []; let quitVisible = false, quitClicks = 0;
      globalThis.window = { __apex: { hud, info: () => ({ state: G.state }), camera: () => ({ mode: 'chase' }) } };
      globalThis.RealRace = { status: () => ({ active: G.state !== 'menu' }) };
      globalThis.localStorage = { getItem: () => '2' };
      const page = {
        evaluate: async (fn, arg) => { const value = fn(arg); events.push('evaluate'); return value; },
        waitForSelector: async (selector) => { if (selector.startsWith('#pausebtn')) assert.equal(els.pausebtn.hidden, false); else assert.equal(quitVisible, true); events.push('ready:' + selector); },
        locator: (selector) => ({ isVisible: async () => quitVisible, evaluate: async () => { events.push('guard:' + selector); return { ready: true, center: { x: 40, y: 40 } }; }, click: async (options) => {
          assert.equal(options.force, true); assert.equal(options.timeout, 15000);
          events.push('click:' + selector);
          if (selector === '#pausebtn') { assert.equal(els.pausebtn.hidden, false); quitVisible = true; }
          else { assert.equal(quitVisible, true); quitClicks++; if (!confirm || quitClicks === 2) { G.state = 'menu'; quitVisible = false; } }
        } }),
        waitForFunction: async (fn, arg, opts) => { assert.equal(fn(), true); assert.equal(opts.polling, 100); },
      };
      const exit = await exitReplayThroughUi(page);
      assert.equal(exit.info.state, 'menu'); assert.equal(exit.replay.active, false);
      assert.deepEqual(exit.hud, { before: false, restored: false });
      assert.equal(els.pausebtn.hidden, true); assert.equal(quitClicks, confirm ? 2 : 1);
      assert.ok(events.indexOf('ready:#pausebtn') < events.indexOf('guard:#pausebtn'));
      assert.ok(events.indexOf('guard:#pausebtn') < events.indexOf('click:#pausebtn'));
      assert.equal(exit.interactions.length, confirm ? 3 : 2);
      assert.ok(exit.interactions.every((interaction) => interaction.method === 'pointer-click'));
    }
  } finally { globalThis.window = originals.window; globalThis.RealRace = originals.RealRace; globalThis.localStorage = originals.localStorage; }
});

test('verified replay pointer clicks require actual visible enabled center hit-target, without RAF stability', async () => {
  const originals = Object.fromEntries(['getComputedStyle', 'document', 'innerWidth', 'innerHeight'].map((key) => [key, globalThis[key]]));
  let disabled = false, hit, clicked = 0, top = 20, scrolls = 0, canScroll = true;
  const element = { isConnected: true, hidden: false, matches: () => disabled, getAttribute: () => null, contains: (child) => child === hit && hit?.parent === element,
    getBoundingClientRect: () => ({ left: 10, top, width: 100, height: 40 }),
    scrollIntoView: (options) => { assert.equal(options.behavior, 'instant'); scrolls++; if (canScroll) top = 20; } };
  globalThis.getComputedStyle = () => ({ display: 'block', visibility: 'visible', opacity: '1', pointerEvents: 'auto' });
  globalThis.innerWidth = 844; globalThis.innerHeight = 390;
  globalThis.document = { elementFromPoint: (x, y) => { assert.equal(x, 60); assert.equal(y, 40); return hit; } };
  const page = { waitForSelector: async (_, opts) => { assert.equal(opts.state, 'visible'); }, locator: () => ({ evaluate: async (fn) => fn(element), click: async (opts) => { assert.equal(opts.force, true); assert.equal(opts.timeout, 15000); clicked++; } }),
    waitForFunction: () => { throw new Error('RAF stability must not be requested'); } };
  try {
    hit = { id: 'blocking-overlay' };
    await assert.rejects(verifiedControlClick(page, '#pausebtn'), /center blocked/); assert.equal(clicked, 0);
    hit = element; disabled = true;
    await assert.rejects(verifiedControlClick(page, '#pausebtn'), /disabled/); assert.equal(clicked, 0);
    disabled = false; element.hidden = true;
    assert.equal(controlClickGuard(element).reason, 'hidden'); element.hidden = false;
    hit = { parent: element }; // Nested label receives the same real button pointer.
    const receipt = await verifiedControlClick(page, '#pausebtn');
    assert.equal(clicked, 1); assert.deepEqual(receipt.center, { x: 60, y: 40 });
    assert.match(receipt.stability, /hit-target verified/);
    assert.equal(scrolls, 0, 'visible, blocked and disabled controls do not trigger scrolling');
    top = 500;
    const scrolled = await verifiedControlClick(page, '#pm-quit');
    assert.equal(scrolled.scrollAttempted, true); assert.equal(scrolls, 1); assert.equal(clicked, 2);
    assert.deepEqual(scrolled.center, { x: 60, y: 40 }, 'the guard uses the actual post-scroll rectangle');
    top = 500; canScroll = false;
    await assert.rejects(verifiedControlClick(page, '#pm-quit'), /outside viewport/);
    assert.equal(scrolls, 2); assert.equal(clicked, 2, 'an unscrollable offscreen control is still rejected');
  } finally { for (const [key, value] of Object.entries(originals)) globalThis[key] = value; }
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

test('replay fixture plan rejects unrelated JSON and validates real builder columns, track and trace schema offline', () => {
  const out = resolve(ROOT, 'scratch/replay-invalid-plan-no-output');
  const child = spawnSync(process.execPath, ['tools/shot/replay-camera-probe.mjs', '--fixture=package.json', '--plan', '--out=' + out], { cwd: ROOT, encoding: 'utf8', timeout: 10000 });
  assert.equal(child.status, 2); assert.match(child.stderr, /compiled script or usable OpenF1 session/); assert.equal(existsSync(out), false);
  const fixture = loadFixture({ fixture: 'default', track: 'baku' });
  assert.equal(fixture.preflight.format, 'raw-openf1'); assert.equal(fixture.preflight.drivers, 22);
  const compiled = { script: structuredClone(fixture.data.script) };
  assert.equal(preflightReplayFixture(compiled, 'baku').preflight.format, 'compiled-script');
  assert.throws(() => preflightReplayFixture(compiled, 'monza'), /track does not match/);
  const malformed = structuredClone(compiled); malformed.script.drivers[0].laps = [Infinity];
  assert.throws(() => preflightReplayFixture(malformed, 'baku'), /columns invalid/);
  const raw = JSON.parse(readFileSync(resolve(ROOT, 'tests/fixtures/openf1-baku-2026-race.json'))); raw.laps[0].lap_number = 999999;
  assert.throws(() => preflightReplayFixture(raw, 'baku'), /laps require/);
  const traces = { frame: 'track', cars: {} };
  for (const driver of compiled.script.drivers.slice(0, 2)) traces.cars[driver.num] = { t: [0, 150], prog: [0, 100], x: [0, 0] };
  assert.equal(preflightReplayFixture({ ...compiled, traces }, 'baku').preflight.traces, 'validated-track-frame');
  traces.cars[compiled.script.drivers[0].num].prog = [0];
  assert.throws(() => preflightReplayFixture({ ...compiled, traces }, 'baku'), /equal-length/);
});

test('camera-only fixture strips remote radio audio without mutating source and actual replay audio guard prevents fetch', () => {
  const original = { radio: [{ t: 10, num: 63, lap: 1, url: 'https://remote.invalid/radio.mp3' }] };
  const sanitized = cameraOnlyFixture(original);
  assert.equal(original.radio[0].url, 'https://remote.invalid/radio.mp3');
  assert.equal(sanitized.script.radio[0].url, undefined); assert.equal(sanitized.script.radio[0].t, 10);
  assert.equal(sanitized.offline.removedRadioUrls, 1); assert.equal(sanitized.offline.captionsPreserved, true);
  const source = readFileSync(resolve(ROOT, 'js/race/real-replay.js'), 'utf8');
  const stopStart = source.indexOf('    function stopRadioClip() {');
  const stopEnd = source.indexOf('\n    function stop()', stopStart);
  const start = source.indexOf('    function playRadio(h) {');
  const end = source.indexOf('\n    function finish()', start);
  let audioCalls = 0;
  const play = new Function('Audio', 'GameAudioRadioFx', 'GameAudio', 'run', 'G', 'CAPTION_S', `${source.slice(stopStart, stopEnd)}\n${source.slice(start, end)}\nreturn playRadio;`)(
    function Audio() { audioCalls++; return { play: () => Promise.resolve(), pause() {}, volume: 1, onended: null, onerror: null }; },
    undefined,
    { setRadioDuck() {} },
    { audio: null },
    { soundOn: true, radio: { volume: () => 1 }, announce() {} },
    3,
  );
  play(original.radio[0]); assert.equal(audioCalls, 1, 'unsanitized URL reaches Audio when the FX bridge is absent');
  audioCalls = 0; play(sanitized.script.radio[0]); assert.equal(audioCalls, 0);
  const fixture = loadFixture({ fixture: 'default', track: 'baku' });
  assert.ok(fixture.offline.removedRadioUrls > 0); assert.ok(fixture.data.script.radio.every((radio) => !('url' in radio)));
});

// R3-HOSTILE-3: a diff side is a shot name or a PNG path. garage-angles took ANY existing path (apex_garage
// `{op:"diff", diff:["/home/…/x.png","a"]}` fed an out-of-tree file to sharp); track-session's containment was a bare
// startsWith(outDir), so a sibling `<outDir>-x/…` passed. Both closures are pulled from source (the CLIs boot Chromium).
const closureOf = (file, head) => {
  const src = readFileSync(resolve(ROOT, file), 'utf8');
  const at = src.indexOf(head); assert.ok(at >= 0, `${file}: ${head}`);
  const indent = src.slice(src.lastIndexOf('\n', at) + 1, at);
  return src.slice(at, src.indexOf('\n' + indent + '};', at) + indent.length + 3);
};
const PATH_DEPS = { existsSync, readFileSync, realpathSync, statSync, mkdirSync, join, resolve, relative, isAbsolute, basename, sep };

test('garage diff takes a shot name or a PNG under artifacts/ or scratch/ only, symlinks resolved', () => {
  mkdirSync(resolve(ROOT, 'scratch'), { recursive: true });
  const dir = mkdtempSync(resolve(ROOT, 'scratch/garage-diff-path-'));
  try {
    writeFileSync(resolve(dir, 'mine.png'), 'png');
    symlinkSync(resolve(ROOT, 'package.json'), resolve(dir, 'link.png'));
    const st = { shots: [{ png: resolve(dir, 'shot-a.png') }] };
    const deps = { ...PATH_DEPS, st, outDir: dir, safe: (s) => String(s).replace(/[^A-Za-z0-9_.-]+/g, '_'), repoRoot: ROOT };
    const pngOf = new Function(...Object.keys(deps), closureOf('tools/shot/garage-angles.mjs', 'const pngOf = (name) => {') + '\nreturn pngOf;')(...Object.values(deps));
    assert.equal(pngOf('shot-a'), resolve(dir, 'shot-a.png'), 'a shot name');
    assert.equal(pngOf('fresh'), join(dir, 'fresh.png'), 'an unknown name stays inside outDir');
    assert.equal(realpathSync(pngOf(resolve(dir, 'mine.png'))), realpathSync(resolve(dir, 'mine.png')), 'a scratch PNG');
    for (const bad of [resolve(ROOT, 'package.json'), '/etc/passwd', resolve(dir, 'link.png')].filter((p) => existsSync(p))) {
      assert.throws(() => pngOf(bad), /artifacts\/ or scratch\//, bad);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('track-session diff containment is outDir + separator, not a bare prefix', () => {
  mkdirSync(resolve(ROOT, 'scratch'), { recursive: true });
  const dir = mkdtempSync(resolve(ROOT, 'scratch/track-diff-path-'));
  try {
    const outDir = resolve(dir, 'out');
    mkdirSync(outDir); mkdirSync(outDir + '-x');
    writeFileSync(resolve(outDir, 'a.png'), 'png'); writeFileSync(resolve(outDir + '-x', 'evil.png'), 'png');
    const deps = { ...PATH_DEPS, shots: [{ name: 'n1', png: resolve(outDir, 'n1.png') }], outDir };
    const pngOf = new Function(...Object.keys(deps), closureOf('tools/shot/track-session.mjs', 'const pngOf = (ref) => {') + '\nreturn pngOf;')(...Object.values(deps));
    assert.equal(pngOf('n1'), resolve(outDir, 'n1.png'));
    assert.equal(pngOf('a.png'), resolve(outDir, 'a.png'));
    for (const bad of ['../out-x/evil.png', resolve(outDir + '-x', 'evil.png'), '../../../package.json', '.', 'missing.png']) {
      assert.throws(() => pngOf(bad), /unknown shot/, bad);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('capture profiles preserve command defaults and validate explicit dimensions/encoding', () => {
  const custom = parseCaptureOptions(['identity', 'output', '--seed', '0'], {});
  assert.deepEqual(custom.positionals, ['identity', 'output']);
  assert.equal(custom.seed, 0);
  assert.equal(custom.type, null);
  assert.equal(custom.viewport, null);
  assert.deepEqual(profileContextOptions(custom, { width: 844, height: 390 }), { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 });
  const preview = parseCaptureOptions(['--profile=preview', '--width', '800', '--scope', 'page', '--browser', 'unified', '--trace=trace.json'], {});
  assert.deepEqual(captureViewport(preview), { width: 800, height: 360 });
  assert.deepEqual(captureScreenshotOptions(preview), { type: 'jpeg', quality: 80, scope: 'page' });
  assert.equal(captureExtension(preview), 'jpg');
  assert.equal(preview.browser, 'chromium');
  assert.equal(preview.tracePath, 'trace.json');
  const comparison = parseCaptureOptions(['--profile', 'comparison', '--isolated'], {});
  assert.equal(comparison.reuse, false);
  assert.deepEqual(comparison.viewport, { width: 1280, height: 720 });
  for (const args of [['--width'], ['--height', '--scope', 'page'], ['--dpr', 'NaN'], ['--width', '3.5'], ['--height', '0'], ['--seed', '-1'], ['--quality', '101'], ['--type', 'png', '--quality', '80'], ['--profile', 'unknown'], ['--gpu', 'unknown'], ['--browser', 'firefox'], ['--scope', 'hud'], ['--reuse', '--isolated'], ['--reuse=false'], ['--width', '8192', '--height', '8192', '--dpr', '2']]) {
    assert.throws(() => parseCaptureOptions(args, {}), /capture:/, args.join(' '));
  }
});

test('comparison profile pins real render/governor hooks and previews leave them alone', async () => {
  const calls = [];
  const page = { evaluate: (fn) => vm.runInNewContext('(' + fn.toString() + ')()', { window: { __apex: {
    renderScale(value) { calls.push(['scale', value]); return { scale: value ?? 0.75 }; },
    govHold(value) { calls.push(['hold', value]); return { tierHold: value }; },
    renderClock(value, hold) { calls.push(['clock', value, hold]); return value; },
  } } }) };
  assert.equal(await applyCaptureProfile(page, { profile: 'preview' }), null);
  assert.deepEqual(calls, []);
  const result = await applyCaptureProfile(page, { profile: 'comparison' });
  assert.equal(result.scale.scale, 1);
  assert.equal(result.tier.tierHold, true);
  assert.deepEqual(calls, [['scale', undefined], ['scale', 1], ['hold', true], ['clock', 0, true]]);
  await assert.rejects(async () => applyCaptureProfile({ evaluate: (fn) => vm.runInNewContext('(' + fn.toString() + ')()', { window: {} }) }, { profile: 'comparison' }), /requires __apex/);
});

test('GPU diagnostics omit raw command lines and reject explicit fallback capabilities', async () => {
  let detached = 0;
  const session = { detach: async () => { detached++; }, send: async () => ({ commandLine: '--proxy-server=user:password@host', gpu: { auxAttributes: { glRenderer: 'ANGLE SwiftShader' }, devices: [], featureStatus: { webgl: 'enabled' } } }) };
  const diagnostics = await captureBrowserDiagnostics({ version: () => 'Chromium test', newBrowserCDPSession: async () => session }, { requested: { gpu: 'swiftshader' }, executable: { path: '/chrome', source: 'fixture' } });
  assert.equal(detached, 1);
  assert.equal(diagnostics.actual.software, true);
  assert.equal('commandLine' in diagnostics.actual, false);
  assert.doesNotThrow(() => assertCaptureGpuCapability(diagnostics, { gpu: 'swiftshader', gpuExplicit: true }));
  assert.throws(() => assertCaptureGpuCapability(diagnostics, { gpu: 'hardware', gpuExplicit: true }), /actual renderer/);
  assert.throws(() => assertCaptureGpuCapability({ actual: null, error: 'no info' }, { gpu: 'hardware', gpuExplicit: true }), /cannot verify/);
  assert.doesNotThrow(() => assertCaptureGpuCapability({ actual: null }, { gpuExplicit: false }));
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

test('GPU diagnostics clean up sessions created after a timeout without changing returned provenance', async () => {
  let resolveSession, detached = 0, sent = 0;
  const creation = new Promise((resolve) => { resolveSession = resolve; });
  const diagnostics = await captureBrowserDiagnostics({ version: () => 'test', newBrowserCDPSession: () => creation }, { timeoutMs: 5 });
  assert.match(diagnostics.error, /timed out/);
  let resolveDetached;
  const cleanup = new Promise((resolve) => { resolveDetached = resolve; });
  resolveSession({ detach: async () => { detached++; resolveDetached(); }, send: async () => { sent++; return {}; } });
  await cleanup;
  assert.equal(detached, 1);
  assert.equal(sent, 0);
  assert.equal(diagnostics.actual, null);
});

test('Chromium capture trace streams bounded data, closes IO, and stop is idempotent', async () => {
  const dir = mkdtempSync(resolve(ROOT, 'scratch/trace-stream-'));
  const session = new EventEmitter(), calls = []; let detached = 0;
  session.detach = async () => { detached++; };
  session.send = async (method, args) => {
    calls.push([method, args]);
    if (method === 'Tracing.end') queueMicrotask(() => session.emit('Tracing.tracingComplete', { stream: 'trace' }));
    if (method === 'IO.read') return { data: Buffer.from('{"traceEvents":[]}').toString('base64'), base64Encoded: true, eof: true };
    return {};
  };
  try {
    const tracePath = resolve(dir, 'trace.json');
    const trace = await startCaptureTrace({ newBrowserCDPSession: async () => session }, { path: tracePath });
    const result = await trace.stop();
    assert.deepEqual(await trace.stop(), result);
    assert.equal(readFileSync(tracePath, 'utf8'), '{"traceEvents":[]}');
    assert.equal(result.bytes, 18);
    assert.equal(detached, 1);
    assert.equal(calls[0][1].transferMode, 'ReturnAsStream');
    assert.ok(calls.some(([method]) => method === 'IO.close'));
    assert.equal(session.listenerCount('Tracing.tracingComplete'), 0);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('Chromium capture trace rejects oversized or absent streams and removes partial files', async () => {
  const dir = mkdtempSync(resolve(ROOT, 'scratch/trace-errors-'));
  try {
    for (const mode of ['oversized', 'no-stream', 'timeout']) {
      const session = new EventEmitter(); let detached = 0, closed = 0;
      session.detach = async () => { detached++; };
      session.send = async (method) => {
        if (method === 'Tracing.end' && mode !== 'timeout') queueMicrotask(() => session.emit('Tracing.tracingComplete', mode === 'no-stream' ? {} : { stream: 'trace' }));
        if (method === 'IO.read') return { data: 'too large', eof: true };
        if (method === 'IO.close') closed++;
        return {};
      };
      const output = resolve(dir, mode + '.json');
      // Only the timeout mode needs a tiny budget: the other modes run mkdir/open inside it, which a loaded runner can stretch past 10 ms.
      const trace = await startCaptureTrace({ newBrowserCDPSession: async () => session }, { path: output, maxBytes: 3, stopTimeoutMs: mode === 'timeout' ? 10 : 5000 });
      await assert.rejects(trace.stop(), mode === 'oversized' ? /exceeded 3 bytes/ : mode === 'no-stream' ? /without an IO stream/ : /timed out/);
      assert.equal(existsSync(output), false);
      assert.equal(detached, 1);
      assert.equal(closed, mode === 'oversized' ? 1 : 0);
      assert.equal(session.listenerCount('Tracing.tracingComplete'), 0);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});


test('benchmark validates unique capability cells offline and excludes failures from timing medians', () => {
  const opts = parseBenchmarkArgs(['--plan', '--samples=2', '--cases=swiftshader:auto:preview,hardware:chromium:comparison', '--seed=0']);
  assert.equal(opts.samples, 2); assert.equal(opts.seed, 0); assert.equal(opts.matrix.length, 2);
  for (const args of [['--samples=0'], ['--samples=NaN'], ['--cases=hardware:firefox:preview'], ['--cases=swiftshader:auto'], ['--cases=swiftshader:auto:preview,swiftshader:auto:preview']]) assert.throws(() => parseBenchmarkArgs(args));
  const samples = [10, 30, 20].map((ms) => ({ status: 'passed', manifest: { ms, shots: [{ bytes: ms * 100, timings: { presentMs: ms / 2 } }] } }));
  samples.push({ status: 'failed', manifest: { ms: 1, shots: [] } });
  assert.deepEqual(summarizeBenchmarkSamples(samples), { attempted: 4, passed: 3, medianMs: 20, medianPresentMs: 10, medianBytes: 2000 });
  assert.equal(summarizeBenchmarkSamples([{ status: 'failed' }]).medianMs, null);
});


test('benchmark deadline escalates only its IPC-owned browsers and child after graceful teardown stalls', async () => {
  const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
  const signals = [], reaped = [];
  child.kill = (signal) => { signals.push(signal); if (signal === 'SIGKILL') queueMicrotask(() => child.emit('close', null, 'SIGKILL')); };
  const operation = captureSample(['fixture'], 5, { graceMs: 5, kill: (pid, signal) => reaped.push([pid, signal]), spawnChild: () => child });
  child.emit('message', { type: 'unrelated', pid: 9999 });
  child.emit('message', { type: 'capture-browser-owned', pid: 12345 });
  const result = await operation;
  assert.equal(result.timedOut, true); assert.equal(result.signal, 'SIGKILL');
  assert.deepEqual(signals, ['SIGTERM', 'SIGKILL']);
  assert.deepEqual(reaped, [[-12345, 'SIGKILL']]);
});

test('benchmark success releases browser ownership and never force-kills a completed sample', async () => {
  const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
  child.kill = () => assert.fail('finished child must not be killed');
  const operation = captureSample(['fixture'], 1000, { kill: () => assert.fail('released browser must not be killed'), spawnChild: () => child });
  child.emit('message', { type: 'capture-browser-owned', pid: 12345 });
  child.emit('message', { type: 'capture-browser-closed', pid: 12345 });
  child.emit('close', 0, null);
  const result = await operation;
  assert.equal(result.code, 0); assert.equal(result.timedOut, false);
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

test('an env-chosen GPU stack is explicit, so a SwiftShader fallback fails fast', () => {
  assert.equal(parseCaptureOptions([], {}).gpuExplicit, false);
  assert.equal(parseCaptureOptions([], { APEX_GL: 'llvmpipe' }).gpuExplicit, true);
  assert.equal(parseCaptureOptions([], { APEX_GPU: 'hardware' }).gpuExplicit, true);
  assert.equal(parseCaptureOptions(['--gpu', 'swiftshader'], {}).gpuExplicit, true);
  const opts = parseCaptureOptions([], { APEX_GL: 'llvmpipe' });
  assert.throws(() => assertCaptureGpuCapability({ actual: { renderer: 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device))' } }, opts), /requested GPU profile llvmpipe, actual renderer is .*SwiftShader/);
});

test('WebGPU capture launch uses the verified software adapter pins and refuses WebGL-only llvmpipe', () => {
  const swift = parseCaptureOptions(['--gpu', 'swiftshader']);
  const launch = captureLaunchOptions(swift, { backend: 'webgpu' });
  assert.ok(launch.args.includes('--use-webgpu-adapter=swiftshader'));
  assert.ok(launch.args.includes('--use-vulkan=swiftshader'));
  assert.throws(() => captureLaunchOptions(parseCaptureOptions(['--gpu', 'llvmpipe']), { backend: 'webgpu' }), /WebGL-only/);
});
