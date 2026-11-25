// capture-tools-cli.test.mjs — capture CLIs' parsers and plans: css-play, menu readiness, survey-track, capture-contract evidence, diff containment, capture options, GPU diagnostics, traces, benchmark.
// One of five per-tool files split from capture-tools-regressions.test.mjs (T1-10, #3043); no browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync, existsSync, rmSync, symlinkSync, realpathSync, statSync } from 'node:fs';
import { resolve, join, relative, isAbsolute, basename, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import vm from 'node:vm';
import { EventEmitter } from 'node:events';
import sharp from 'sharp';
import { parseCssPlayArgs, screenClicks, SCREENS, swapStylesheet } from '../../tools/ui/css-play.mjs';
import { menuReady, previewMapSettled } from '../../tools/ui/menu-readiness.mjs';
import { parseSurveyTrackArgs } from '../../tools/track/survey-track.mjs';
import { parseCaptureArgs, pixelEvidence, rendererEvidence, ROOT } from '../../tools/shot/capture-contract.mjs';
import { parseBenchmarkArgs, summarizeBenchmarkSamples, captureSample } from '../../tools/shot/capture-benchmark.mjs';
import { cameraDelta } from '../../tools/shot/replay-camera-probe.mjs';
import { parseCaptureOptions, captureViewport, captureContextOptions as profileContextOptions, captureScreenshotOptions, captureExtension, captureLaunchOptions, applyCaptureProfile } from '../../tools/shot/capture-options.mjs';
import { captureBrowserDiagnostics, assertCaptureGpuCapability, startCaptureTrace } from '../../tools/shot/capture-diagnostics.mjs';
import { mkTmpDir } from "../helpers/tmp-dir.mjs";

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
  const dir = mkTmpDir("capture-path-test-");
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
  const dir = mkTmpDir("capture-plan-test-");
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
  const dir = mkTmpDir("garage-diff-path-");
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
  const dir = mkTmpDir("track-diff-path-");
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
  const dir = mkTmpDir("trace-stream-");
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
  const dir = mkTmpDir("trace-errors-");
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

test('hardware WebGPU capture selects full Chromium and never pins a software adapter', () => {
  const opts = parseCaptureOptions(['--gpu', 'hardware', '--ultra', '--backend', 'webgpu']);
  assert.equal(opts.ultra, true);
  const launch = captureLaunchOptions(opts, { backend: 'webgpu' });
  assert.equal(launch.browserFlavor, 'chromium');
  assert.ok(launch.args.includes('--enable-gpu'));
  assert.ok(launch.args.includes('--enable-unsafe-webgpu'));
  assert.ok(!launch.args.some((arg) => /swiftshader|lavapipe|llvmpipe/i.test(arg)));
  const tlx = parseCaptureOptions(['--gpu', 'hardware', '--tlx-webgpu']);
  assert.equal(tlx.tlxWebgpu, true);
  const tlxLaunch = captureLaunchOptions(tlx, { backend: 'three' });
  assert.equal(tlxLaunch.browserFlavor, 'chromium');
  assert.ok(tlxLaunch.args.includes('--enable-gpu'));
  assert.ok(!tlxLaunch.args.some((arg) => /swiftshader|lavapipe|llvmpipe/i.test(arg)));
});
