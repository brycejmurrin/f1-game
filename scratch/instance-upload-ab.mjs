// Matched native WebGPU queue-write experiment; no shader stubs or product hooks.
// API units checked: https://developer.mozilla.org/en-US/docs/Web/API/GPUQueue/writeBuffer
// Range units checked: https://threejs.org/docs/pages/BufferAttribute.html
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { startStaticServer, launchChromium, shutdown, chromiumLaunchInfo } from '../tools/lib/harness.mjs';
import { installProbeInit, gotoGame } from '../tools/shot/probe-page.mjs';

const root = process.cwd(), base = '9bca9ed4f33da4628e93c149d3562cbec6d1142e', file = 'js/render/three/tlx.js';
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
try { git('cat-file', '-e', base + ':' + file); }
catch { execFileSync('git', ['fetch', '--depth=1', 'origin', base], { stdio: 'inherit' }); }
const bodies = { baseline: execFileSync('git', ['show', base + ':' + file], { encoding: 'utf8' }), candidate: readFileSync(file, 'utf8') };
const report = { schema: 'tlx-instance-upload-ab/v1', base, candidate: git('rev-parse', 'HEAD'),
  sourceDigests: Object.fromEntries(Object.entries(bodies).map(([k, v]) => [k, createHash('sha256').update(v).digest('hex')])),
  viewport: { width: 640, height: 360 }, framesPerMode: 60, modes: ['chase', 'helmet'], arms: [], started: new Date().toISOString() };
const save = () => writeFileSync('game-instance-upload-ab.json', JSON.stringify(report, null, 2));
const log = x => console.log(new Date().toISOString(), x);

function installMeter() {
  const sources = new WeakMap();
  let on = false, stats;
  const fresh = () => ({ matrix: { calls: 0, bytes: 0 }, tint: { calls: 0, bytes: 0 }, other: { calls: 0, bytes: 0 }, mainRenders: 0, mainCalls: 0, mainTriangles: 0, mainWallMs: [], bufferCreates: 0, pipelineCreates: 0, pipelineAsyncCreates: 0, shaderModules: 0 });
  for (const [method, key] of [['createBuffer', 'bufferCreates'], ['createRenderPipeline', 'pipelineCreates'], ['createRenderPipelineAsync', 'pipelineAsyncCreates'], ['createShaderModule', 'shaderModules']]) {
    const original = GPUDevice.prototype[method];
    GPUDevice.prototype[method] = function () { const result = original.apply(this, arguments); if (on) stats[key]++; return result; };
  }
  const nativeWrite = GPUQueue.prototype.writeBuffer;
  GPUQueue.prototype.writeBuffer = function (buffer, offset, data, dataOffset = 0, size) {
    const result = nativeWrite.apply(this, arguments);
    if (on) {
      const view = ArrayBuffer.isView(data), unit = view ? data.BYTES_PER_ELEMENT || 1 : 1;
      const bytes = size === undefined ? data.byteLength - dataOffset * unit : size * unit;
      const kind = sources.get(view ? data.buffer : data) || 'other';
      stats[kind].calls++; stats[kind].bytes += bytes;
    }
    return result;
  };
  window.__instanceUploadMeter = {
    start() { stats = fresh(); on = true; },
    stop() { on = false; return stats; },
    attach(R) {
      const original = R.render;
      R.render = function (scene) {
        // Physical main/mirror batch views both carry tlxInstCap. Source
        // ArrayBuffer identity labels native writes without retaining GPU objects.
        if (scene?.isScene) scene.traverse(o => {
          if (o.userData?.tlxInstCap === undefined) return;
          const m = o.instanceMatrix?.array, c = o.geometry?.getAttribute('instanceTint')?.array;
          if (m && !sources.has(m.buffer)) sources.set(m.buffer, 'matrix');
          if (c && !sources.has(c.buffer)) sources.set(c.buffer, 'tint');
        });
        const target = this.getRenderTarget(), main = target?.texture?.name === 'output' || !target && scene?.isScene === true;
        const info = this.info.render, c = info.drawCalls, t = info.triangles, start = performance.now();
        const result = original.apply(this, arguments);
        if (main) {
          if (on) { stats.mainRenders++; stats.mainCalls += info.drawCalls - c; stats.mainTriangles += info.triangles - t; stats.mainWallMs.push(performance.now() - start); }
          __apex.headless(true); window.__uploadFrameDone = true;
        }
        return result;
      };
    },
  };
}

try {
  const srv = await startStaticServer(root);
  const browser = await launchChromium({ executablePath: chromium.executablePath(), args: ['--enable-unsafe-webgpu', '--disable-background-timer-throttling'] });
  report.browser = chromiumLaunchInfo(browser); report.browserVersion = browser.version(); save();
  for (let pair = 1; pair <= 3; pair++) for (const arm of pair % 2 ? ['baseline', 'candidate'] : ['candidate', 'baseline']) {
    const row = { pair, arm, pageErrors: [], consoleErrors: [], modes: [] }; report.arms.push(row); save(); log(`start pair ${pair} ${arm}`);
    const ctx = await browser.newContext({ viewport: report.viewport, deviceScaleFactor: 1, reducedMotion: 'reduce' });
    try {
      await ctx.route('**/js/render/three/tlx.js*', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: bodies[arm] }));
      const page = await ctx.newPage();
      page.on('pageerror', e => row.pageErrors.push(String(e)));
      page.on('console', m => { if (m.type() === 'error') row.consoleErrors.push(m.text()); });
      await installProbeInit(page, { backend: 'three', team: 2, tlxForceGL: false });
      await page.addInitScript(() => { localStorage.setItem('apex26.tlxForceGL', '0'); localStorage.setItem('apex26.wgxCapture', '0'); sessionStorage.setItem('apex26.wgxCapture', '0'); localStorage.setItem('apex26.tlxForceHw', 'batches'); localStorage.setItem('apex26.gfxBootStepMs', '45000'); });
      await page.addInitScript(installMeter);
      await gotoGame(page, srv.url + '?three-devtools=1', 120000);
      row.adapter = await page.evaluate(async () => { const a = await navigator.gpu.requestAdapter(); return { vendor: a.info.vendor, architecture: a.info.architecture }; });
      if (row.adapter.vendor !== 'apple') throw Error('not Apple hardware');
      await page.evaluate(async () => {
        __apex.agentHelp(); __apex.govHold(true); __apex.renderScale(1); __apex.headless(true); await Assets.loadModels(); __apex.seed(42);
        await __apex.race('vegas', 'night', 'dry'); __apex.go(); __apex.freeze(true); __apex.renderClock(0, true); __apex.govHold(true); __apex.renderScale(1);
        __instanceUploadMeter.attach(renderer);
      });
      const frame = async f => {
        await page.evaluate(f => { __apex.jump(f, 0, 0); __apex.snapCam(); window.__uploadFrameDone = false; __apex.headless(false); }, f);
        await page.waitForFunction(() => __uploadFrameDone, null, { polling: 100, timeout: 45000 });
      };
      const state = () => page.evaluate(() => ({ view: __apex.viewState(), quality: __apex.govHold(), scale: __apex.renderScale().scale,
        clock: __apex.renderClock(), light: __apex.lightState(), backend: __apex.diag({ download: false }).env.backendState, gpuErrors: GLX.gpuErrors(), isWebGPUBackend: renderer.backend.isWebGPUBackend }));
      for (const mode of report.modes) {
        log(`pair ${pair} ${arm} ${mode} warm`);
        await page.evaluate(mode => __apex.camera(mode), mode);
        for (let i = 0; i < 60; i++) await frame(.1 + .02 * i / 59);
        await frame(.1); await frame(.1);
        const before = await state();
        await page.evaluate(() => __instanceUploadMeter.start());
        for (let i = 0; i < 60; i++) await frame(.1 + .02 * i / 59);
        const measured = await page.evaluate(async () => { await renderer.backend.device.queue.onSubmittedWorkDone(); return __instanceUploadMeter.stop(); });
        const after = await state();
        if (measured.mainRenders !== 60 || !measured.matrix.bytes || [before, after].some(s => !s.isWebGPUBackend || s.backend.api !== 'webgpu' || s.backend.softAdapter || s.backend.softBlit || s.gpuErrors || !s.view.frozen || s.view.state !== 'race' || s.view.camMode !== mode || s.scale !== 1 || !s.quality.tierHold || s.clock !== 0)) throw Error('invalid measurement state');
        row.modes.push({ mode, before, after, measured }); save();
        await page.evaluate(() => __apex.headless(false));
        await page.screenshot({ path: `game-instance-upload-${pair}-${arm}-${mode}.png`, timeout: 60000 });
        await page.evaluate(() => __apex.headless(true));
        log(`pair ${pair} ${arm} ${mode} bytes ${measured.matrix.bytes + measured.tint.bytes}`);
      }
      row.ok = !row.pageErrors.length && !row.consoleErrors.length;
      if (!row.ok) throw Error('page/console errors'); save();
    } finally { await ctx.close(); }
  }
  report.ok = report.arms.length === 6 && report.arms.every(r => r.ok); report.finished = new Date().toISOString(); save();
} catch (e) { report.ok = false; report.error = String(e.stack || e); save(); log(report.error); process.exitCode = 1; }
finally { await shutdown(); log('finished ok=' + report.ok); }
