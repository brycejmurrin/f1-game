import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, mkdtempSync, writeFileSync, existsSync, rmSync, symlinkSync, truncateSync, realpathSync, statSync } from 'node:fs';
import { resolve, join, relative, isAbsolute, basename, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';
import sharp from 'sharp';
import { screenshotPresentedCanvas } from '../../tools/shot/probe-page.mjs';
import { parseCssPlayArgs, screenClicks, SCREENS, swapStylesheet } from '../../tools/ui/css-play.mjs';
import { menuReady, previewMapSettled } from '../../tools/ui/menu-readiness.mjs';
import { parseSurveyTrackArgs } from '../../tools/track/survey-track.mjs';
import { parseCaptureArgs, pixelEvidence, rendererEvidence, ROOT } from '../../tools/shot/capture-contract.mjs';
import { pendingWatchCancellation } from '../../tools/check/lifecycle-census.mjs';
import { recordCapture, stageRace, runBoundedCapture, visibleScreen, waitNextGameRender, captureContextOptions, captureFailureSnapshot, captureOperationBudget, captureOperation } from '../../tools/shot/capture-runtime.mjs';
import { registerTeardownResource, shutdown } from '../../tools/lib/harness.mjs';
import { cameraDelta, loadFixture, exitReplayThroughUi, preflightReplayFixture, cameraOnlyFixture, controlClickGuard, verifiedControlClick } from '../../tools/shot/replay-camera-probe.mjs';

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

test('capture parsers reject nonfinite dimensions, scales and unknown flags; seed zero stays explicit', () => {
  for (const viewport of ['Infinityx720', '-2x720', '100.5x720', '0x720', '8193x720']) assert.throws(() => parseCssPlayArgs(['--viewport', viewport]), /viewport/);
  for (const scale of ['NaN', 'Infinity', '39', '201']) assert.throws(() => parseCssPlayArgs(['--scale', scale]), /scale/);
  assert.equal(parseCssPlayArgs(['--scale', '130']).scale, 130);
  assert.deepEqual(screenClicks({ clicks: ['#extra'] }, SCREENS.settings), [...SCREENS.settings.clicks, '#extra']);
  assert.deepEqual(screenClicks({ root: '#custom', clicks: ['#extra'] }, SCREENS.settings), ['#extra']);
  assert.equal(parseCaptureArgs(['--seed=0', '--plan'], 'capture-bundle').seed, 0);
  assert.throws(() => parseCaptureArgs(['--out', '/tmp/capture'], 'capture-bundle'), /out/);
  assert.throws(() => parseCaptureArgs(['--track', 'unknown-track'], 'capture-bundle'), /unknown track/);
  mkdirSync(resolve(ROOT, 'scratch'), { recursive: true });
  const dir = mkdtempSync(resolve(ROOT, 'scratch/capture-path-test-'));
  try { symlinkSync(resolve(ROOT, 'js'), resolve(dir, 'source-link')); assert.throws(() => parseCaptureArgs(['--out', resolve(dir, 'source-link', 'bad')], 'capture-bundle'), /out real/); }
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
      if (body.includes('GLX.awaitSoftPresent')) { assert.equal(arg, 30000); waits++; return; }
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
      if (body.includes('GLX.awaitSoftPresent')) { presents++; assert.ok(arg > 0 && arg <= 30000); return; }
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
