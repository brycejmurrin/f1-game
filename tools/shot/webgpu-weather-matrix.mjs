#!/usr/bin/env node
// @doc Captures verified high-resolution Ultra WebGPU weather matrices on a hardware runner.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { launchChromium, startStaticServer, shutdown, chromiumLaunchInfo } from '../lib/harness.mjs';
import { chromiumArgsForBackend, installProbeInit, gotoGame, mutateCaptureScene, awaitCaptureReady, screenshotPresentedCanvas, requireHardwareWebGpu } from './probe-page.mjs';
import { pixelEvidence, rendererEvidence } from './capture-contract.mjs';

const ROOT = process.cwd();
const GAME_ROOT = path.resolve(process.env.APEX_GAME_ROOT ?? ROOT);
const OUT = path.join(ROOT, 'artifacts/webgpu-weather-matrix');
const COMMIT = '147dadd9eea4a0cc3f91e4160e64333cc8ed9d3a';
const TRACKS = ['albert_park', 'shanghai'];
const TIMES = ['dawn', 'day', 'dusk', 'night'];
const WEATHERS = ['dry', 'wet', 'rain', 'storm', 'overcast', 'fog'];
const LABELS = ['Dry', 'Wet/drizzle', 'Rain', 'Storm', 'Overcast', 'Fog'];
const CAMERAS = {
  albert_park: { eye: [584.2908615871668, 4.324500965256243, 605.9187823559876], target: [574.9887507629393, 3.068103076718747, 685.7975161437989], fov: 60, far: 6000, fog: 1 },
  shanghai: { eye: [216.4710490199445, 4.517765659662338, -3.7172763893130094], target: [155.2487611877439, 4.032310822820667, -64.02889744262707], fov: 60, far: 6000, fog: 1 },
};
const CAMERA_FRACS = { albert_park: 0.2701, shanghai: 0.2899 };
// Preserve the approved 844:390 composition while raising the pixel count to 4K-class.
const WIDTH = 4220, HEIGHT = 1950;
const MODE = process.argv.find(x => x.startsWith('--mode='))?.split('=')[1] ?? 'matrix';
if (!['pilot', 'matrix'].includes(MODE)) throw new Error('--mode must be pilot or matrix');
const startedAt = new Date().toISOString();
const failures = [];
const writeJson = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
const safe = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
fs.mkdirSync(OUT, { recursive: true });

let browser;
try {
  const { execFileSync } = await import('node:child_process');
  const actualSource = execFileSync('git', ['-C', GAME_ROOT, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  if (actualSource !== COMMIT) throw new Error(`capture requires pinned game source ${COMMIT}; got ${actualSource}`);
  const server = await startStaticServer(GAME_ROOT);
  browser = await launchChromium({ browserFlavor: 'full', args: chromiumArgsForBackend('three', { gpu: 'hardware' }) });
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1, hasTouch: true, reducedMotion: 'no-preference' });
  page.setDefaultTimeout(240000);
  const errors = [], messages = [];
  page.on('pageerror', error => errors.push({ type: 'page', message: error.message }));
  page.on('console', message => { messages.push({ type: message.type(), text: message.text() }); if (message.type() === 'error') errors.push({ type: 'console', message: message.text() }); });
  await installProbeInit(page, { backend: 'three', motion: true, tlxForceGL: false, ultra: true, hardware: true, tlxWebgpu: true });
  await page.addInitScript(() => {
    localStorage.setItem('apex26.tlxForceHw', 'sky');
    localStorage.setItem('apex26.tlxForceGL', '0');
    localStorage.setItem('apex26.gfxPreset', JSON.stringify('ultra'));
    localStorage.setItem('apex26.gfxHigh', '1');
    localStorage.setItem('apex26.gfxBootStepMs', '60000');
  });
  await gotoGame(page, `${server.url}?three-devtools=1`, 180000);
  const adapter = await requireHardwareWebGpu(page);
  await page.evaluate(() => window.__apex.agentHelp());
  const launch = chromiumLaunchInfo(browser);
  const registry = await page.evaluate(() => __apex.tracks().map(t => t.id));
  for (const track of TRACKS) if (!registry.includes(track)) throw new Error(`runtime track registry is missing ${track}`);

  for (const track of TRACKS) {
    const dir = path.join(OUT, track);
    fs.mkdirSync(dir, { recursive: true });
    const camera = CAMERAS[track];
    const jobs = MODE === 'pilot' ? [{ time: 'day', weather: 'dry', pilot: true }] : TIMES.flatMap(time => WEATHERS.map(weather => ({ time, weather })));
    let raceRow = null;
    for (const job of jobs) {
      const { time, weather } = job;
      const basename = job.pilot ? 'pilot-day-dry' : `${time}-${weather}`;
      const outPath = path.join(dir, `${basename}-4k.png`);
      if (!job.pilot && (!raceRow || raceRow.time !== time)) {
        raceRow = await mutateCaptureScene(page, async ({ track, time, camera, parkFrac }) => {
          const a = window.__apex;
          a.headless(false); a.govHold(true); a.renderScale(1); a.seed(42);
          const race = await a.race(track, time, 'dry');
          a.go();
          a.park(parkFrac); // Once per time row: repeated calls teleport every AI car.
          const rivals = a.rivals([
            { dProg: 8, dx: -1.4, speed: 31 },
            { dProg: 18, dx: 1.3, speed: 29 },
            { dProg: 30, dx: -0.3, speed: 30 },
          ]);
          a.step(1 / 60);
          a.drivingLine('off');
          a.freeze(true); a.hud(false); a.renderClock(0, true); a.view(camera);
          document.getElementById('btn-cam')?.style.setProperty('display', 'none', 'important');
          return { race, parkCalls: 1, clockHoldRequested: true, rivals, cars: a.cars(), line: a.drivingLine(), camera: a.camState(), beganAt: Date.now() };
        }, { track, time, camera, parkFrac: CAMERA_FRACS[track] });
        raceRow.time = time;
        raceRow.warmupStart = Date.now();
      } else if (job.pilot) {
        raceRow = await mutateCaptureScene(page, async ({ track, time, camera, parkFrac }) => {
          const a = window.__apex;
          a.headless(false); a.govHold(true); a.renderScale(1); a.seed(42);
          const race = await a.race(track, time, 'dry');
          a.go(); a.park(parkFrac);
          const rivals = a.rivals([{ dProg: 8, dx: -1.4, speed: 31 }, { dProg: 18, dx: 1.3, speed: 29 }, { dProg: 30, dx: -0.3, speed: 30 }]);
          a.step(1 / 60); a.drivingLine('off'); a.freeze(true); a.hud(false); a.renderClock(0, true); a.view(camera);
          document.getElementById('btn-cam')?.style.setProperty('display', 'none', 'important');
          return { race, parkCalls: 1, clockHoldRequested: true, rivals, cars: a.cars(), line: a.drivingLine(), camera: a.camState(), beganAt: Date.now() };
        }, { track, time, camera, parkFrac: CAMERA_FRACS[track] });
        raceRow.time = time; raceRow.warmupStart = Date.now();
      }

      const cut = await mutateCaptureScene(page, ({ weather, time, camera, pilot }) => {
        const a = window.__apex;
        a.headless(false);
        if (weather !== 'dry' || pilot) a.weather(weather);
        const previousGen = LampBake.gen();
        LampBake.reset();
        a.drivingLine('off'); a.view(camera); a.renderClock(0, true);
        const light = a.lightTune();
        return {
          actualWeather: a.weather(), previousGen, afterResetGen: LampBake.gen(), light,
          requiredBake: (time !== 'day' || light.floodDay > 0) && light.lampBake > 0 && !(light.tailLightEmit > 0),
          warmupMs: 8 * Math.max(0, light.lampWarmup ?? 1) * 1000,
          cutAt: Date.now(), line: a.drivingLine(), camera: a.camState(),
        };
      }, { weather, time, camera, pilot: !!job.pilot });
      if (cut.requiredBake) {
        await page.waitForFunction(previous => LampBake.gen() > 0 && LampBake.gen() > previous, cut.previousGen, { polling: 100, timeout: 240000 });
      }
      const bakeCompletedAt = Date.now();
      const settleAt = bakeCompletedAt;
      const warmWait = Math.max(0, settleAt + (time === 'day' && !cut.requiredBake ? 0 : cut.warmupMs) - Date.now());
      if (warmWait) await page.waitForTimeout(warmWait);
      // screenshotPresentedCanvas can pause RAF; resume before requesting this presented frame.
      await mutateCaptureScene(page, ({ camera }) => { __apex.headless(false); __apex.drivingLine('off'); __apex.view(camera); __apex.renderClock(0, true); return { bakeGen: LampBake.gen(), line: __apex.drivingLine() }; }, { camera });
      const ready = await awaitCaptureReady(page, { timeoutMs: 240000, pauseRender: true });
      const capture = await screenshotPresentedCanvas(page, { path: outPath, skipAwait: true, timeout: 240000, optimizeForSpeed: true });
      const pixels = await pixelEvidence(capture.buf);
      const width = capture.buf.readUInt32BE(16), height = capture.buf.readUInt32BE(20);
      const runtime = await page.evaluate(() => {
        const a = __apex, diag = a.diag({ download: false });
        return {
          viewport: { innerWidth, innerHeight, devicePixelRatio }, info: a.info(), time: a.setTimeOfDay(), weather: a.weather(),
          camera: a.camState(), view: a.viewState(), lighting: a.lightTune(), lightState: a.lightState(),
          scale: a.renderScale(), governor: a.govHold(), seed: a.seed(), renderClock: a.renderClock(), hud: a.hud(),
          drivingLine: a.drivingLine(), cars: a.cars(), diag,
          backend: diag.env?.backendState,
          sky: [...(window.scene?.children || [])].filter(x => x.renderOrder === 1000000).map(x => ({ visible: x.visible, program: x.material?.customProgramCacheKey?.() })),
          nativeCamera: { eye: window.camera.position.toArray(), projection: window.camera.projectionMatrix.toArray(), near: window.camera.near, far: window.camera.far },
          quality: { preset: localStorage.getItem('apex26.gfxPreset'), high: localStorage.getItem('apex26.gfxHigh'), current: GfxQuality.current() },
          bakeGen: LampBake.gen(),
        };
      });
      const image = { width, height, bytes: capture.bytes, sha256: crypto.createHash('sha256').update(capture.buf).digest('hex'), via: capture.via, timings: capture.timings };
      const renderer = rendererEvidence(runtime.diag, pixels, 'three');
      const cameraMatches = runtime.camera.fov === 60 && runtime.camera.lens.far === 6000 && runtime.camera.lens.fog === 1
        && camera.eye.every((v, i) => Math.abs(runtime.camera.eye[i] - v) < 1e-6)
        && camera.target.every((v, i) => Math.abs(runtime.camera.tgt[i] - v) < 1e-6)
        && Math.abs(2 * Math.atan(1 / runtime.nativeCamera.projection[5]) - Math.PI / 3) < 1e-6;
      const checks = {
        fullResolution: width === WIDTH && height === HEIGHT,
        viewportAndInput: runtime.viewport.innerWidth === WIDTH && runtime.viewport.innerHeight === HEIGHT
          && runtime.viewport.devicePixelRatio === 1 && await page.evaluate(() => navigator.maxTouchPoints > 0 && !matchMedia('(prefers-reduced-motion: reduce)').matches),
        stagedCars: (raceRow.rivals?.length ?? 0) === 3 && runtime.cars.filter(c => !c.p).length >= 3,
        meaningfulPixels: pixels.meaningful === true,
        webgpu: runtime.backend?.api === 'webgpu',
        hardwareAdapter: adapter.verdict === 'hardware' && runtime.backend?.softAdapter === false && runtime.backend?.liteGpu === false && runtime.backend?.softBlit === false,
        gpuErrorsZero: runtime.backend?.gpuErrors === 0,
        noPageOrConsoleErrors: errors.length === 0,
        rendererPositive: renderer.positive === true,
        fullProceduralSky: runtime.sky.some(s => s.visible && s.program === 'tlx-sky'),
        ultra: runtime.quality.current === 'ultra',
        renderScaleOne: runtime.scale.scale === 1 || runtime.scale === 1 || runtime.diag?.env?.renderScale === 1,
        governorHeld: runtime.governor?.tierHold === true,
        seed42: runtime.seed === 42,
        clockHeldAtZero: runtime.renderClock === 0 && raceRow.clockHoldRequested === true,
        physicsFrozen: runtime.view.frozen === true,
        hudHidden: runtime.hud === false,
        racingLineOff: runtime.drivingLine.mode === 'off' && runtime.backend?.line?.inScene === 0 && runtime.backend?.fx?.lineVerts === 0,
        fixedCameraAndLens: cameraMatches,
        resolvedTimeWeather: runtime.time === time && runtime.weather === weather,
        lampBakeCacheCleared: cut.afterResetGen === 0,
        darkBakeComplete: !cut.requiredBake || runtime.bakeGen > cut.previousGen,
        presentedCanvasReady: ready?.ready !== false,
      };
      const evidence = {
        schema: 1, commit: COMMIT, captureSourceCommit: process.env.GITHUB_SHA ?? null,
        branch: process.env.GITHUB_REF_NAME ?? null, track, time, weather, label: LABELS[WEATHERS.indexOf(weather)] ?? 'Dry',
        camera, settings: { width: WIDTH, height: HEIGHT, viewport: `${WIDTH}x${HEIGHT}`, dpr: 1, hasTouch: true, reducedMotion: 'no-preference', userAgentOverride: false, seed: 42, renderScale: 1, governor: 'held', physics: 'frozen', renderClock: 0, hud: 'hidden', graphics: 'Ultra' },
        raceRow: { parkCalls: raceRow.parkCalls, clockHoldRequested: raceRow.clockHoldRequested, parkFrac: CAMERA_FRACS[track], stagedRivals: raceRow.rivals, carCount: raceRow.cars?.length, cars: raceRow.cars?.slice(0, 5), beganAt: raceRow.beganAt },
        lighting: runtime.lighting, lampBake: { required: cut.requiredBake, generationBeforeReset: cut.previousGen, generationAfterReset: cut.afterResetGen, generationAtCapture: runtime.bakeGen, warmupMs: cut.warmupMs, bakeCompletedAt, elapsedMs: Date.now() - settleAt },
        renderer: { adapter, api: runtime.backend?.api, state: runtime.backend, result: renderer },
        readiness: ready, image, pixels, runtime, errors: [...errors], messages: [...messages], launch,
        checks, passed: Object.values(checks).every(Boolean),
      };
      fs.writeFileSync(outPath, capture.buf);
      writeJson(outPath.replace(/\.png$/, '.json'), evidence);
      if (job.pilot) {
        fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html><meta charset="utf-8"><title>${safe(track)} WebGPU pilot</title><style>body{background:#101724;color:#e9edf5;font:16px system-ui;margin:24px}img{width:min(100%,1688px);height:auto}a{color:#8dd2ff}</style><h1>${safe(track)} · fixed-view hardware WebGPU pilot</h1><p>4220×1950 · Ultra · racing line off · 3 staged rivals · <a href="pilot-day-dry-4k.json">evidence JSON</a></p><a href="pilot-day-dry-4k.png"><img src="pilot-day-dry-4k.png" alt="${safe(track)} day dry pilot"></a>`);
      }
      if (!evidence.passed) failures.push({ track, time, weather, checks });
      console.log(JSON.stringify({ track, time, weather, resolution: `${width}x${height}`, passed: evidence.passed, cars: raceRow.cars?.length, line: runtime.drivingLine.mode, api: runtime.backend?.api, hardware: adapter.verdict, gpuErrors: runtime.backend?.gpuErrors, errors: errors.length }));
      if (!evidence.passed) throw new Error(`${track}/${time}/${weather} failed capture checks: ${JSON.stringify(checks)}`);
    }
    if (MODE === 'matrix') await buildPanel(track, dir);
  }
  const manifest = { schema: 1, createdAt: startedAt, completedAt: new Date().toISOString(), sourceBaseline: COMMIT, captureSourceCommit: process.env.GITHUB_SHA ?? null, mode: MODE, tracks: TRACKS, resolution: `${WIDTH}x${HEIGHT}`, backend: 'Three.js WebGPU', gpu: adapter, graphics: 'Ultra', racingLine: 'off', times: TIMES, weathers: WEATHERS, failures, launch };
  writeJson(path.join(OUT, 'manifest.json'), manifest);
  writeGlobalGallery(manifest);
  if (failures.length) process.exitCode = 1;
} catch (error) {
  fs.mkdirSync(OUT, { recursive: true });
  writeJson(path.join(OUT, 'error.json'), { mode: MODE, failures, error: error.stack || String(error) });
  console.error(error);
  process.exitCode = 1;
} finally {
  await shutdown();
}

async function buildPanel(track, dir) {
  const tileW = 640, tileH = 296, left = 90, top = 116, footer = 48;
  const width = left + tileW * 6 + 90, height = top + tileH * 4 + footer;
  const composite = [{ input: Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#101724"/><text x="24" y="34" fill="#fff" font-family="sans-serif" font-size="24">APEX 26 · ${track.toUpperCase()} · STATIC WEATHER ENDPOINTS</text><text x="24" y="60" fill="#aebbd1" font-family="sans-serif" font-size="15">147dadd9 · 4220×1950 originals · Three.js WebGPU · full sky · Ultra · racing line off</text>${LABELS.map((l,i)=>`<text x="${left+tileW*i+tileW/2}" y="99" text-anchor="middle" fill="#fff" font-family="sans-serif" font-size="22">${l}</text>`).join('')}${TIMES.map((t,i)=>`<text x="44" y="${top+tileH*i+tileH/2}" transform="rotate(-90 44 ${top+tileH*i+tileH/2})" text-anchor="middle" fill="#fff" font-family="sans-serif" font-size="20">${t.toUpperCase()}</text>`).join('')}<text x="24" y="${height-18}" fill="#aebbd1" font-family="sans-serif" font-size="15">Fixed camera · FOV 60° · far 6000 · fog 1 · 3 staged rivals · racing line off</text></svg>`), left: 0, top: 0 }];
  for (let r = 0; r < TIMES.length; r++) for (let c = 0; c < WEATHERS.length; c++) {
    const name = `${TIMES[r]}-${WEATHERS[c]}`;
    const image = path.join(dir, `${name}-4k.png`), evidence = JSON.parse(fs.readFileSync(path.join(dir, `${name}-4k.json`), 'utf8'));
    if (!evidence.passed || !fs.existsSync(image)) throw new Error(`${track}/${name} missing valid original`);
    composite.push({ input: await sharp(image).resize(tileW, tileH).png().toBuffer(), left: left + c * tileW, top: top + r * tileH });
  }
  const panel = path.join(dir, 'panel.png');
  await sharp({ create: { width, height, channels: 4, background: '#101724' } }).composite(composite).png().toFile(panel);
  const areas = TIMES.flatMap((time, r) => WEATHERS.map((weather, c) => `<area shape="rect" alt="${safe(track)} ${safe(time)} ${safe(weather)}" coords="${left+c*tileW},${top+r*tileH},${left+(c+1)*tileW},${top+(r+1)*tileH}" href="${time}-${weather}-4k.png">`)).join('');
  const table = TIMES.map(time => `<tr><th>${safe(time)}</th>${WEATHERS.map((weather, i) => `<td><a href="${time}-${weather}-4k.png"><img loading="lazy" src="${time}-${weather}-4k.png" alt="${safe(track)} ${safe(time)} ${safe(LABELS[i])}"></a><br><a href="${time}-${weather}-4k.json">Evidence</a></td>`).join('')}</tr>`).join('');
  fs.writeFileSync(path.join(dir, 'index.html'), `<!doctype html><meta charset="utf-8"><title>${safe(track)} — 4K Ultra WebGPU weather matrix</title><style>body{margin:24px;background:#101724;color:#e9edf5;font:16px system-ui}a{color:#8dd2ff}img{width:320px;height:148px;object-fit:cover}table{border-collapse:collapse}th,td{padding:5px}td{text-align:center}img.panel{width:${width}px;height:${height}px;max-width:none}code{font-size:12px}</style><h1>${safe(track)} — 4K-class Ultra WebGPU weather matrix</h1><p>Source baseline ${COMMIT} · capture run ${safe(process.env.GITHUB_SHA ?? 'local')} · racing line off · WebGPU hardware adapter verified.</p><p><a href="panel.png">Download labelled panel</a> · <a href="verification.json">Verification</a> · <a href="../../index.html">Survey gallery</a></p><h2>Clickable panel</h2><img class="panel" src="panel.png" usemap="#cells"><map name="cells">${areas}</map><h2>Original 4220×1950 images and cell evidence</h2><table><thead><tr><th>Time</th>${LABELS.map(l => `<th>${safe(l)}</th>`).join('')}</tr></thead><tbody>${table}</tbody></table>`);
  const cells = TIMES.flatMap(time => WEATHERS.map(weather => JSON.parse(fs.readFileSync(path.join(dir, `${time}-${weather}-4k.json`), 'utf8'))));
  writeJson(path.join(dir, 'verification.json'), { track, cells: cells.length, uniquePermutations: new Set(cells.map(x => `${x.time}/${x.weather}`)).size, passed: cells.length === 24 && cells.every(x => x.passed), cameraAndLensConsistent: cells.every(x => JSON.stringify(x.camera) === JSON.stringify(CAMERAS[track]) && x.checks.fixedCameraAndLens), noRacingLine: cells.every(x => x.checks.racingLineOff), allOriginalsLinked: areas.includes('href="dawn-dry-4k.png"') && cells.every(x => fs.existsSync(path.join(dir, x.image?.file ?? `${x.time}-${x.weather}-4k.png`))), panel: { width, height, tileWidth: tileW, tileHeight: tileH, rowMargin: left, header: top, footer }, visualInspection: 'pending' });
}

function writeGlobalGallery(manifest) {
  const cards = TRACKS.map(track => manifest.mode === 'pilot'
    ? `<article><h2>${safe(track)}</h2><a href="${track}/pilot-day-dry-4k.png"><img src="${track}/pilot-day-dry-4k.png" alt="${safe(track)} pilot"></a><p><a href="${track}/index.html">Pilot image</a> · <a href="${track}/pilot-day-dry-4k.json">Evidence</a></p></article>`
    : `<article><h2>${safe(track)}</h2><a href="${track}/panel.png"><img src="${track}/panel.png" alt="${safe(track)} weather matrix"></a><p><a href="${track}/index.html">Clickable gallery</a> · <a href="${track}/verification.json">Verification</a></p></article>`).join('');
  fs.writeFileSync(path.join(OUT, 'index.html'), `<!doctype html><meta charset="utf-8"><title>Apex 26 — Ultra WebGPU weather matrix</title><style>body{margin:32px;background:#101724;color:#e9edf5;font:16px system-ui}a{color:#8dd2ff}main{display:grid;gap:28px}img{width:100%;max-width:1200px}article{padding:18px;background:#1a2330}</style><h1>Apex 26 — Ultra WebGPU ${manifest.mode === 'pilot' ? 'camera pilots' : 'weather matrix'}</h1><p>${safe(manifest.resolution)} originals · real hardware WebGPU · Ultra graphics · racing line off · 3 staged rivals.</p><p><a href="manifest.json">Capture manifest</a></p><main>${cards}</main>`);
}
