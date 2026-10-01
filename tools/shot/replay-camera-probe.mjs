#!/usr/bin/env node
// @doc Offline-fixture live-render camera discontinuity probe across replay entry, seek, follow, exit and reentry.
// @skill replay-camera
import { readFileSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const { CIRCUITS } = createRequire(import.meta.url)('../manifest.cjs');
import { ROOT, parseCaptureArgs, usage, invoked } from './capture-contract.mjs';
import { withCapturePage, recordCapture, waitNextGameRender } from './capture-runtime.mjs';
export function preflightReplayFixture(data, track) {
  if (!CIRCUITS.includes(track)) throw new Error('fixture requires a catalog track');
  const context = vm.createContext({ window: {}, console: { info() {}, warn() {}, error() {} } });
  for (const path of ['js/core/log.js', 'js/core/mat4.js', 'js/data/teams.js', ...CIRCUITS.map((id) => `js/circuits/${id}.js`), 'js/data/real-race-tab.js', 'js/race/real-race.js']) {
    vm.runInContext(readFileSync(resolve(ROOT, path), 'utf8'), context, { filename: path, timeout: 1000 });
  }
  const Data = vm.runInContext('DataRealRace', context), Teams = vm.runInContext('Teams.LIST', context);
  const integer = (n, max) => Number.isInteger(n) && n > 0 && n <= max;
  const finiteOrNull = (n) => n === null || Number.isFinite(n);
  let script, format;
  if (data.script) { script = data.script; format = 'compiled-script'; }
  else {
    format = 'raw-openf1';
    if (!data.session || !integer(data.session.session_key, 1000000000) || !Number.isFinite(Date.parse(data.session.date_start)) || typeof data.session.circuit_short_name !== 'string') throw new Error('fixture requires a compiled script or usable OpenF1 session');
    if (!Array.isArray(data.drivers) || data.drivers.length < 2 || data.drivers.length > 64 || !data.drivers.every((d) => integer(d?.driver_number, 999) && typeof d.name_acronym === 'string' && /^[A-Z0-9]{1,3}$/.test(d.name_acronym) && typeof d.team_name === 'string')) throw new Error('fixture OpenF1 drivers require driver_number/name_acronym/team_name columns');
    const numbers = new Set(data.drivers.map((d) => d.driver_number));
    if (!Array.isArray(data.laps) || !data.laps.length || data.laps.length > 100000 || !data.laps.every((l) => numbers.has(l?.driver_number) && integer(l.lap_number, 2000) && finiteOrNull(l.lap_duration) && (l.lap_duration == null || l.lap_duration > 0))) throw new Error('fixture OpenF1 laps require driver_number/lap_number/lap_duration columns');
    for (const key of ['stints', 'pits', 'raceControl', 'weather', 'result', 'positions', 'overtakes', 'teamRadio']) if (data[key] != null && !Array.isArray(data[key])) throw new Error(`fixture OpenF1 ${key} must be an array`);
    if (data.result?.some((r) => !Number.isInteger(r?.number_of_laps) || r.number_of_laps < 0 || r.number_of_laps > 2000)) throw new Error('fixture classification requires bounded number_of_laps');
    script = Data.build(data, (name) => Teams.find((t) => t.name === name) || null, context.window.TrackDefs);
  }
  if (script.trackId !== track || !CIRCUITS.includes(script.trackId)) throw new Error('fixture script track does not match requested catalog track');
  if (script.v !== Data.SCRIPT_V || !integer(script.laps, 2000) || !Array.isArray(script.drivers) || script.drivers.length < 2 || script.drivers.length > 64) throw new Error('fixture script requires current version, bounded laps and at least two drivers');
  const numbers = new Set(), codes = new Set();
  for (const driver of script.drivers) {
    if (!integer(driver?.num, 999) || !/^[A-Z0-9]{1,3}$/.test(driver.code || '') || numbers.has(driver.num) || codes.has(driver.code) || !Array.isArray(driver.laps) || driver.laps.length > script.laps || !driver.laps.every((n) => finiteOrNull(n) && (n == null || n > 0))) throw new Error('fixture script driver num/code/laps columns invalid');
    numbers.add(driver.num); codes.add(driver.code);
    if (driver.lapStart && (!Array.isArray(driver.lapStart) || driver.lapStart.length > script.laps || !driver.lapStart.every(finiteOrNull))) throw new Error('fixture script lapStart columns invalid');
  }
  const seats = vm.runInContext('RealRace', context).mapField(script, Teams);
  if (!script.drivers.slice(0, 2).every((driver) => seats.some((seat) => seat.num === driver.num))) throw new Error('fixture followed drivers have no current roster seats');
  if (data.traces) {
    if (data.traces.frame !== 'track' || !data.traces.cars || typeof data.traces.cars !== 'object' || Array.isArray(data.traces.cars)) throw new Error('fixture traces require track frame and cars map');
    for (const driver of script.drivers.slice(0, 2)) {
      const trace = data.traces.cars[driver.num];
      if (!trace || !Array.isArray(trace.t) || trace.t.length < 2 || trace.t.length > 100000 || !Array.isArray(trace.prog) || trace.prog.length !== trace.t.length || !trace.t.every((n, i) => Number.isFinite(n) && (!i || n > trace.t[i - 1])) || !trace.prog.every(Number.isFinite) || trace.t.at(-1) <= 120 || (trace.x && (!Array.isArray(trace.x) || trace.x.length !== trace.t.length || !trace.x.every(Number.isFinite)))) throw new Error('fixture traces require finite equal-length t/prog/x columns covering seek120 for followed drivers');
    }
  }
  return { script: JSON.parse(JSON.stringify(script)), preflight: { format, track: script.trackId, drivers: script.drivers.length, laps: script.laps, version: script.v, traces: data.traces ? 'validated-track-frame' : 'generated-track-frame' } };
}
export function cameraOnlyFixture(script) {
  const clone = JSON.parse(JSON.stringify(script));
  if (clone.radio != null && !Array.isArray(clone.radio)) throw new Error('fixture radio must be an array');
  let removedRadioUrls = 0;
  clone.radio = (clone.radio || []).map((radio) => {
    if (!radio || typeof radio !== 'object' || Array.isArray(radio)) throw new Error('fixture radio entries must be objects');
    if (radio.url) removedRadioUrls++;
    const { url, ...caption } = radio;
    return caption;
  });
  return { script: clone, offline: { mode: 'camera-only', removedRadioUrls, captionsPreserved: true,
    reason: 'Team-radio audio URLs omitted from the cloned probe script; camera validation does not fetch remote radio media.' } };
}
export function loadFixture(opts) {
  const file = opts.fixture === 'default' ? resolve(ROOT, 'tests/fixtures/openf1-baku-2026-race.json') : resolve(ROOT, opts.fixture);
  const info = statSync(file);
  if (!info.isFile()) throw new Error("fixture must be a regular file");
  if (info.size > 8 * 1024 * 1024) throw new Error("fixture exceeds 8 MiB");
  const bytes = readFileSync(file);
  if (bytes.length > 8 * 1024 * 1024) throw new Error("fixture exceeds 8 MiB");
  let data;
  try { data = JSON.parse(bytes); } catch { throw new Error("fixture must contain valid JSON"); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('fixture must be an object');
  if (opts.fixture === 'default' && opts.track !== 'baku') throw new Error('default fixture belongs to baku');
  const compiled = preflightReplayFixture(data, opts.track);
  const cameraFixture = cameraOnlyFixture(compiled.script);
  return { file, data: { ...data, script: cameraFixture.script }, preflight: compiled.preflight, offline: cameraFixture.offline };
}
export function cameraDelta(before, after) {
  const eyeA = before?.frame?.camera?.eye, eyeB = after?.frame?.camera?.eye;
  return eyeA?.length === 3 && eyeB?.length === 3 ? Math.hypot(...eyeA.map((x, i) => eyeB[i] - x)) : null;
}
export function controlClickGuard(element) {
  if (!element || !element.isConnected) return { ready: false, reason: 'detached' };
  const style = getComputedStyle(element), rect = element.getBoundingClientRect();
  if (element.hidden || style.display === 'none' || style.visibility !== 'visible' || Number(style.opacity) <= 0 || rect.width <= 0 || rect.height <= 0) return { ready: false, reason: 'hidden' };
  if (element.matches(':disabled') || element.getAttribute('aria-disabled') === 'true') return { ready: false, reason: 'disabled' };
  const center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  if (center.x < 0 || center.y < 0 || center.x >= innerWidth || center.y >= innerHeight) return { ready: false, reason: 'outside viewport', center };
  const hit = document.elementFromPoint(center.x, center.y);
  if (style.pointerEvents === 'none' || !hit || (hit !== element && !element.contains(hit))) return { ready: false, reason: 'center blocked', center, hit: hit?.id || hit?.tagName || null };
  return { ready: true, center };
}
export async function verifiedControlClick(page, selector) {
  await page.waitForSelector(selector, { state: 'visible', timeout: 15000 });
  const locator = page.locator(selector);
  const guard = await locator.evaluate(controlClickGuard);
  if (!guard.ready) throw new Error(`replay control ${selector} is not clickable: ${guard.reason}`);
  // A real pointer click, with visibility/enabled/center hit-target checked above.
  // Skip Playwright's two-RAF stability gate on slow software-rendered frames.
  await locator.click({ force: true, timeout: 15000 });
  return { selector, ...guard, method: 'pointer-click', stability: 'two-RAF gate omitted; visible enabled center hit-target verified' };
}
export async function exitReplayThroughUi(page) {
  const hudBefore = await page.evaluate(() => window.__apex.hud());
  let exit, failure;
  const interactions = [];
  try {
    // hud(false) also hides #pausebtn; reveal the real controls before clicking.
    await page.evaluate(() => window.__apex.hud(true));
    interactions.push(await verifiedControlClick(page, '#pausebtn'));
    interactions.push(await verifiedControlClick(page, '#pm-quit'));
    if (await page.locator('#pm-quit').isVisible()) interactions.push(await verifiedControlClick(page, '#pm-quit'));
    await page.waitForFunction(() => window.__apex.info().state === 'menu', null, { polling: 100, timeout: 15000 });
    exit = await page.evaluate(() => ({ info: window.__apex.info(), replay: RealRace.status(), camera: window.__apex.camera(), savedCamera: localStorage.getItem('apex26.camMode') }));
  } catch (err) { failure = err; throw err; }
  finally {
    try { await page.evaluate((visible) => window.__apex.hud(visible), hudBefore); }
    catch (err) { if (!failure) throw err; failure.hudRestoreError = err.message; }
  }
  return { ...exit, interactions, hud: { before: hudBefore, restored: await page.evaluate(() => window.__apex.hud()) } };
}
export async function replayCameraProbe(opts, fixture) {
  mkdirSync(opts.out, { recursive: true });
  let result;
  const samples = [];
  try {
    result = await withCapturePage({ ...opts, compositorRecording: true }, async (page, context) => {
      context.phase = "fixture-module-load";
      // Builder is a local lazy module; no OpenF1 or Jolpica request is made.
      await page.addScriptTag({ url: new URL('/js/data/real-race-tab.js', page.url()).href });
      context.phase = "fixture-build";
      await page.evaluate(({ data, track }) => {
        const script = data.script || DataRealRace.build(data, (name) => Teams.LIST.find((t) => t.name === name) || null, Tracks.LIST);
        if (!script?.drivers?.length || script.trackId !== track) throw new Error('fixture script has no drivers or mismatched track');
        const traces = data.traces?.frame === 'track' ? data.traces : { frame: 'track', cars: {} };
        if (!data.traces?.frame) {
          for (const [i, d] of script.drivers.slice(0, 2).entries()) {
            const t = [], prog = [], x = [];
            for (let sec = -5; sec <= 360; sec += 1) { t.push(sec); prog.push(-14 - 8 * i + 48 * Math.max(sec, 0)); x.push(i ? 1 : 0); }
            traces.cars[d.num] = { t, prog, x };
          }
        }
        window.__replayCameraFixture = { script, traces };
      }, { data: fixture.data, track: opts.track });
      const preferencesBefore = await page.evaluate(() => ({ camera: window.__apex.camera(), savedCamera: localStorage.getItem("apex26.camMode") }));
      async function launch(phase) {
        context.phase = phase + ":launch";
        await page.evaluate(() => { const f = window.__replayCameraFixture; const r = RealRace.launch(f.script, { seat: f.script.drivers[0].code, watch: true, camera: 'chase', traces: f.traces, startLap: 1 }); if (!r) throw new Error('replay launch refused'); });
        context.phase = phase + ":arm";
        await page.waitForFunction(() => RealRace.status().replay != null, null, { polling: 100, timeout: 60000 });
        context.phase = phase + ":go";
        await page.evaluate(() => { window.__apex.go(); window.__apex.hud(false); window.__apex.headless(false); });
      }
      async function record(phase) {
        for (let i = 0; i < opts.frames; i++) {
          // Compositor recording drives genuine game frames on headless SwiftShader.
          // The barrier observes the game's own counter; no synthetic RAF sentinel.
          context.phase = `${phase}:${i}:render-frame`;
          const rendered = await waitNextGameRender(page, 30000, context);
          context.phase = `${phase}:${i}:present-and-capture`;
          const evidence = await recordCapture(page, resolve(opts.out, `${phase}-${i}.png`), opts.backend, context);
          const replay = await page.evaluate(() => RealRace.status());
          const prior = samples.at(-1);
          samples.push({ phase, frameIndex: i, rendered, ...evidence, replay, eyeDeltaMetres: prior ? cameraDelta(prior, evidence) : null });
        }
      }
      await launch('entry'); await record('entry');
      context.phase = 'seek:control';
      await page.evaluate(() => RealRace.replay().seek(120)); await record('seek');
      context.phase = 'follow:control';
      await page.evaluate(() => { const ds = window.__replayCameraFixture.script.drivers; RealRace.replay().follow(ds[1]?.code || ds[0].code); }); await record('follow');
      // A menu has no race camera; preserve that explicit state as exit evidence.
      context.phase = "exit:ui";
      const exit = await exitReplayThroughUi(page);
      const preferencesRestored = exit.camera.mode === preferencesBefore.camera.mode && exit.savedCamera === preferencesBefore.savedCamera;
      await launch('reentry'); await record('reentry');
      context.phase = 'complete';
      return { schemaVersion: 1, ...context, fixture: fixture.file, offline: fixture.offline, traceSource: fixture.data.traces?.frame === 'track' ? 'fixture' : 'deterministic-track-frame-two-car-fixture', preferences: { before: preferencesBefore, afterExit: { camera: exit.camera, savedCamera: exit.savedCamera }, restored: preferencesRestored }, ok: preferencesRestored && !exit.replay.active && samples.every((s) => s.screen.errorOverlay == null && s.renderer.positive && s.frame?.camera && s.frame.camera.synthetic !== true) && !context.consoleEvents.some((e) => e.type === 'pageerror'), exit, samples, interpretation: 'Readonly cameraState records damped eye/target, previous/next anchors and independent game render/simulation clock. Private spring velocities are not exposed. Replay intentionally writes the simulation race clock; renderTime/renderFrame and backend presents report the independent rendered progression. Compositor recording ticks headless frames; it is not a manual simulation/camera reset. Recorded discontinuities are evidence; no fixed camera-distance threshold or manual camera reset masks failures.' };
    });
    result.teardown = { complete: true };
  } catch (err) { result = { schemaVersion: 1, ok: false, ...err.captureContext, samples, error: err.message, teardown: { complete: !err.captureContext?.teardownError && !err.message.startsWith('capture teardown failed:') } }; }
  writeFileSync(resolve(opts.out, 'replay-camera.json'), JSON.stringify(result, null, 2) + '\n');
  return result;
}
if (invoked(import.meta.url)) {
  try {
    const opts = parseCaptureArgs(process.argv.slice(2), 'replay-camera-probe', ['--timeout-ms', '--backend', '--viewport', '--frames', '--fixture']);
    if (opts.help) console.log(usage('replay-camera-probe', '--fixture FILE|default --backend three|webgl2|webgpu --viewport WxH --frames 1..120 --timeout-ms 1000..900000'));
    else { const fixture = loadFixture(opts); if (opts.plan) console.log(JSON.stringify({ ...opts, fixture: fixture.file, preflight: fixture.preflight, offline: fixture.offline, phases: ['entry', 'seek', 'follow', 'exit', 'reentry'] }, null, 2)); else { const result = await replayCameraProbe(opts, fixture); console.log(JSON.stringify(result, null, 2)); if (!result.ok) process.exitCode = 1; } }
  } catch (err) { console.error(err.message); process.exitCode = 2; }
}
