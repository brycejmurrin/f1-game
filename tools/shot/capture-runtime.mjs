// @doc Serial browser capture lifecycle with identity, diagnostics and teardown on every path.
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { launchChromium, startStaticServer, shutdown, registerTeardownResource } from '../lib/harness.mjs';
import { chromiumArgsForBackend, installProbeInit, gotoGame, awaitPresentedFrame, screenshotGameCanvas } from './probe-page.mjs';
import { ROOT, pixelEvidence, rendererEvidence } from './capture-contract.mjs';
export function visibleScreen() {
  const shown = (element) => {
    if (!element || element.hidden) return false;
    const style = getComputedStyle(element), box = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0 && box.width > 0 && box.height > 0;
  };
  const roots = ['overlay', 'select', 'carsetup', 'pausemenu', 'datahub', 'pmsettings', 'results'];
  const error = document.getElementById('__err_overlay');
  return { url: location.href, title: document.title, visibleRoots: roots.filter((id) => shown(document.getElementById(id))),
    canvases: ['game', 'game-soft'].map((id) => { const canvas = document.getElementById(id); return canvas ? { id, visible: shown(canvas), width: canvas.width, height: canvas.height } : null; }).filter(Boolean),
    errorOverlay: shown(error) ? String(error.textContent || '').slice(0, 4000) : null };
}
export async function runBoundedCapture(work, { timeoutMs = 300000, cleanup = shutdown, context = {} } = {}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 900000) throw new Error('capture timeout must be finite, 1..900000ms');
  const startedEpochMs = Date.now();
  context.deadline = { budgetMs: timeoutMs, startedEpochMs, expiresEpochMs: startedEpochMs + timeoutMs };
  let timer, failure, expired = false;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => { expired = true; reject(new Error(`capture whole-run deadline exceeded (${timeoutMs}ms)`)); }, timeoutMs);
  });
  // Each awaited resource acquisition checks cancellation before continuing.
  const checkActive = async () => { if (expired) { await cleanup(); await cleanup(); throw new Error('capture cancelled after deadline'); } };
  try { return await Promise.race([Promise.resolve().then(() => work(checkActive)), deadline]); }
  catch (err) { failure = err; err.captureContext = context; throw err; }
  finally {
    clearTimeout(timer);
    // Harness shutdown owns a five-second force fallback. Calling browser.close
    // first would remove that browser from the registry before the fallback ran.
    try { await cleanup(); }
    catch (err) {
      context.teardownError = String(err.message || err);
      if (!failure) { const teardown = new Error('capture teardown failed: ' + context.teardownError); teardown.captureContext = context; throw teardown; }
    }
  }
}
export function captureOperationBudget(context, capMs, nowMs = Date.now()) {
  if (!Number.isFinite(capMs) || capMs < 1) throw new Error('capture operation cap must be positive');
  const remaining = context?.deadline ? Math.floor(context.deadline.expiresEpochMs - nowMs) : capMs;
  if (!Number.isFinite(remaining) || remaining < 1) throw new Error('capture whole-run deadline exhausted before operation');
  return Math.min(capMs, remaining);
}
export async function captureOperation(context, name, capMs, run) {
  const startedEpochMs = Date.now(), timeoutMs = captureOperationBudget(context, capMs, startedEpochMs);
  const timing = { phase: context?.phase || 'capture', name, capMs, timeoutMs, startedEpochMs,
    wholeRemainingMsAtStart: context?.deadline ? Math.max(0, context.deadline.expiresEpochMs - startedEpochMs) : null, status: 'running' };
  if (context) (context.operationTimings ||= []).push(timing);
  let timer;
  try {
    const value = await Promise.race([
      Promise.resolve().then(() => run(timeoutMs)),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`capture ${name} deadline exceeded (${timeoutMs}ms)`)), timeoutMs); }),
    ]);
    timing.status = 'complete'; return value;
  } catch (err) { timing.status = 'failed'; timing.error = err.message; throw err; }
  finally { clearTimeout(timer); timing.elapsedMs = Date.now() - startedEpochMs; }
}
export function captureContextOptions(opts) {
  if (!opts.compositorRecording) return { viewport: opts.viewport };
  return { viewport: opts.viewport, recordVideo: { dir: resolve(opts.out, 'compositor-video'), size: { width: 320, height: 180 } } };
}
export async function captureFailureSnapshot(page, budgetMs = 2000) {
  let timer, expired = false, stage = 'state';
  const partial = {};
  try {
    return await Promise.race([
      (async () => {
        const state = await page.evaluate(() => {
          const a = window.__apex;
          return { info: a?.info(), replay: typeof RealRace !== 'undefined' ? RealRace.status() : null, cameraState: a?.cameraState(),
            headless: a?.headless(), frozen: a?.freeze(), documentHidden: document.hidden,
            visibilityState: document.visibilityState };
        });
        if (expired) return;
        Object.assign(partial, state); stage = 'screen';
        const screen = await page.evaluate(visibleScreen);
        if (expired) return;
        partial.screen = screen; stage = 'gpu';
        // WebGL diagnostic queries can block on SwiftShader's command buffer.
        // Preserve cheap state before spending the remaining shared budget there.
        const gpu = await page.evaluate(() => {
          const diag = window.__apex?.diag({ download: false });
          return { backend: diag?.env?.backend, backendState: diag?.env?.backendState };
        });
        if (expired) return;
        return { ...partial, ...gpu };
      })(),
      new Promise((_, reject) => { timer = setTimeout(() => { expired = true; reject(new Error('failure snapshot deadline exceeded')); }, budgetMs); }),
    ]);
  } catch (err) { return { ...partial, snapshotError: err.message, snapshotStage: stage }; }
  finally { clearTimeout(timer); }
}
export async function waitNextGameRender(page, timeoutMs = 30000, context) {
  return captureOperation(context, 'render-frame', timeoutMs, async (budget) => {
    const before = await page.evaluate(() => window.__apex.cameraState().renderFrame);
    if (!Number.isInteger(before) || before < 0) throw new Error('cameraState renderFrame unavailable');
    await page.waitForFunction((frame) => window.__apex.cameraState().renderFrame > frame, before, { polling: 100, timeout: budget });
    const after = await page.evaluate(() => window.__apex.cameraState());
    return { before, after: after.renderFrame, renderTime: after.renderTime, simulationTime: after.simulationTime };
  });
}
export async function withCapturePage(opts, run) {
  const consoleEvents = [];
  const context = { identity: null, consoleEvents, phase: "server-start" };
  return runBoundedCapture(async (checkActive) => {
    const server = await startStaticServer(ROOT); await checkActive();
    context.phase = "browser-launch";
    const browser = await launchChromium({ args: chromiumArgsForBackend(opts.backend), timeout: 60000 }); await checkActive();
    context.phase = "browser-context";
    const contextOptions = captureContextOptions(opts);
    if (contextOptions.recordVideo) { mkdirSync(contextOptions.recordVideo.dir, { recursive: true }); context.compositorVideo = { ...contextOptions.recordVideo, purpose: 'headless compositor ticking; PNGs and game renderFrame are evidence', persistence: 'auxiliary video finalized by browser shutdown when possible' }; }
    const browserContext = await browser.newContext(contextOptions);
    if (contextOptions.recordVideo) registerTeardownResource({ close: () => browserContext.close(), force: () => {} });
    await checkActive();
    const page = await browserContext.newPage(); await checkActive();
    page.setDefaultTimeout(15000);
    page.on('console', (event) => { if (consoleEvents.length < 200) consoleEvents.push({ type: event.type(), text: event.text().slice(0, 2000) }); });
    page.on('pageerror', (event) => { if (consoleEvents.length < 200) consoleEvents.push({ type: 'pageerror', text: String(event).slice(0, 2000) }); });
    await installProbeInit(page, { backend: opts.backend }); await checkActive();
    context.phase = "game-boot";
    await gotoGame(page, server.url + '?seed=' + opts.seed, 90000); await checkActive();
    context.bootScreen = await page.evaluate(visibleScreen);
    context.identity = { url: page.url(), title: await page.title(), commit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(), dirty: execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' }).trim().split('\n').filter(Boolean), build: await page.evaluate(() => window.__APEX_BUILD || null), requestedSeed: opts.seed, seed: await page.evaluate(() => window.__apex.seed()), requestedBackend: opts.backend, viewport: opts.viewport };
    await checkActive();
    try { return await run(page, context); }
    catch (err) { context.failureSnapshot = await captureFailureSnapshot(page); throw err; }
  }, { timeoutMs: opts.timeoutMs ?? 300000, context });
}
export async function stageRace(page, track) {
  await page.evaluate((id) => window.__apex.race(id), track);
  await page.waitForFunction((id) => window.__apex.info().track === id, track, { polling: 100, timeout: 60000 });
  await page.evaluate(() => { window.__apex.go(); window.__apex.hud(false); window.__apex.headless(false); });
  await awaitPresentedFrame(page, 30000);
}
export async function recordCapture(page, path, requestedBackend, context) {
  const phase = context?.phase || "capture";
  const operationStart = context?.operationTimings?.length || 0;
  if (context) context.phase = phase + ":present";
  await captureOperation(context, 'present', 30000, (budget) => awaitPresentedFrame(page, budget));
  if (context) context.phase = phase + ":state-snapshot";
  const snapshot = await captureOperation(context, 'state-snapshot', 30000, () => page.evaluate(() => {
    const a = window.__apex, diag = a.diag({ download: false }), cameraState = a.cameraState();
    return { info: a.info(), camera: a.camera(), cameraState, dampingAnchors: { previous: cameraState.previousAnchor, next: cameraState.nextAnchor, eye: cameraState.eye, target: cameraState.target, fov: cameraState.fov }, frame: a.render({ what: 'view', cols: 24, rows: 12 }),
      clocks: { simulationTime: cameraState.simulationTime, renderTime: cameraState.renderTime, renderFrame: cameraState.renderFrame, simRaceSeconds: a.timing()?.raceT ?? null, replaySeconds: typeof RealRace !== 'undefined' ? RealRace.status()?.replay?.T ?? null : null,
        browserMonotonicMs: performance.now(), browserFrameTimestamp: window.__captureFrameClock ?? null, rendererPresents: diag.env?.backendState?.presents ?? null, softPresentGeneration: diag.env?.backendState?.softBlitGen ?? null },
      subject: a.probe(), diag };
  }));
  const screen = await captureOperation(context, 'visible-screen', 15000, () => page.evaluate(visibleScreen));
  if (context) context.phase = phase + ":canvas-capture";
  // The presented-frame barrier already ran above. Avoid a duplicate present
  // wait; retain the shared helper's 60s CDP cap, clipped to the run's remainder.
  const shot = await captureOperation(context, 'canvas-capture', 60000, (budget) => screenshotGameCanvas(page, path, { skipAwait: true, timeout: budget }));
  if (context) context.phase = phase + ":pixel-evidence";
  const pixels = await captureOperation(context, 'pixel-evidence', 30000, () => pixelEvidence(readFileSync(path)));
  return { ...snapshot, screen, operationTimings: context?.operationTimings?.slice(operationStart) || [], image: { path, bytes: shot.bytes, via: shot.via, pixels }, renderer: rendererEvidence(snapshot.diag, pixels, requestedBackend) };
}
