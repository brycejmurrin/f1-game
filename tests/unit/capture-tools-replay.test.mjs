// capture-tools-replay.test.mjs — the replay camera probe and the lifecycle census (replay-camera-probe.mjs, lifecycle-census.mjs).
// One of five per-tool files split from capture-tools-regressions.test.mjs (T1-10, #3043); no browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, mkdtempSync, writeFileSync, existsSync, rmSync, truncateSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseCaptureArgs, ROOT } from '../../tools/shot/capture-contract.mjs';
import { lifecycleSoak, pendingWatchCancellation } from '../../tools/check/lifecycle-census.mjs';
import { loadFixture, exitReplayThroughUi, preflightReplayFixture, cameraOnlyFixture, controlClickGuard, verifiedControlClick } from '../../tools/shot/replay-camera-probe.mjs';

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
  // Real team radio is caption-only (docs/DECISIONS.md D-032): the replay has no audio player left
  // for any URL to reach, sanitized or not. real-replay-audio-focus.test.mjs owns that guard.
  const fixture = loadFixture({ fixture: 'default', track: 'baku' });
  assert.ok(fixture.offline.removedRadioUrls > 0); assert.ok(fixture.data.script.radio.every((radio) => !('url' in radio)));
});
