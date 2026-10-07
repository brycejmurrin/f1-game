import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const context = vm.createContext({});
vm.runInContext(readFileSync(new URL('../../js/garage/arrival.js', import.meta.url), 'utf8'), context);
const Arrival = vm.runInContext('GarageArrival', context);
function harness(reduced = false) {
  const elements = new Map();
  const $ = id => {
    if (!elements.has(id)) elements.set(id, { hidden: true, inert: false, textContent: '',
      classList: { toggle() {} }, setAttribute(k, v) { this[k] = v; }, focus() { this.focused = true; } });
    return elements.get(id);
  };
  return { $, arrival: Arrival.create($, () => reduced) };
}
test('car waits outside until shutter is clear, backs monotonically into bay and parks', () => {
  let prior = Infinity;
  for (let t = 0; t <= 7; t += 0.02) {
    const p = Arrival.pose(t);
    assert.ok(p.z <= prior && p.z >= 0);
    if (t < 1.8) assert.equal(p.z, 11.4);
    if (p.z < 11.4) assert.equal(p.door, 1);
    assert.ok(p.eye[0] > -5.4 && p.eye[0] < 5.4 && p.eye[2] > -6.4 && p.eye[2] < 6.4);
    prior = p.z;
  }
  assert.equal(Arrival.pose(7).z, 0);
  assert.equal(Arrival.pose(7).active, false);
});
test('skip and natural completion unlock controls and preserve open shutter until exit', () => {
  for (const skip of [true, false]) {
    const { $, arrival } = harness(); arrival.start();
    assert.equal($('cs-inner').inert, true);
    assert.equal($('carsetup')['data-esc-close'], 'cs-arrival-skip');
    if (skip) $('cs-arrival-skip').onclick();
    else for (let i = 0; i < 70; i++) arrival.step(0.1);
    assert.equal(arrival.state.z, 0); assert.equal(arrival.state.door, 1);
    assert.equal($('cs-inner').inert, false); assert.equal($('cs-arrival').hidden, true);
    assert.equal($('carsetup')['data-esc-close'], 'cs-back');
    arrival.cancel(); assert.equal(arrival.state, null);
    arrival.start(); assert.equal(arrival.state.z, 11.4);
  }
});
test('reduced motion bypasses camera movement; tab gaps and invalid dt cannot skip sequence', () => {
  const reduced = harness(true); reduced.arrival.start();
  assert.equal(reduced.arrival.state.active, false);
  assert.equal(reduced.$('cs-inner').inert, false);
  const { arrival } = harness(); arrival.start();
  for (const dt of [NaN, -3, Infinity]) arrival.step(dt);
  assert.equal(arrival.state.door, 0);
  arrival.step(60); assert.equal(arrival.state.active, true); assert.equal(arrival.state.z, 11.4);
});
test('saved tuner settings control arrival speed, angle, lens and disabled playback', () => {
  const { $ } = harness();
  let saved = null;
  const read = Arrival.bindSettings($, { get: () => saved, set: (_, value) => { saved = value; } });
  $('ga-speed').value = '2'; $('ga-speed').onchange();
  $('ga-angle').value = 'right'; $('ga-angle').onchange();
  $('ga-fov').value = '70'; $('ga-fov').onchange();
  const arrival = Arrival.create($, () => false, read);
  arrival.start(); assert.ok(arrival.state.eye[0] > 0); assert.equal(arrival.state.fov, 70);
  for (let i = 0; i < 33; i++) arrival.step(0.1);
  assert.equal(arrival.state.active, false);
  $('ga-enabled').checked = false; $('ga-enabled').onchange();
  arrival.start(); assert.equal(arrival.state.active, false);
  $('ga-reset').onclick(); assert.equal(saved, null); assert.equal(read().speed, 1);
  arrival.start(); assert.equal(arrival.state.active, true);
  assert.equal(Arrival.settings({ speed: Infinity, fov: -100, angle: 'outside' }).fov, 40);
  assert.equal(Arrival.settings({ speed: Infinity }).speed, 1);
  assert.equal(Arrival.settings({ angle: 'outside' }).angle, 'cut');
});

// ── THE STUDIO DRIVE-OUT: every RACE! opens on it (js/game.js studioOpen) ──
test('studio drive-out (poseOut): shutter opens first, then parked beat, then nose first out', () => {
  for (const angle of ['cut', 'left', 'right']) {
    const cfg = Arrival.settings({ angle, fov: 58 });
    const p0 = Arrival.poseOut(0, cfg);
    assert.equal(p0.z, 0, 'parked where the arrival parks it');
    assert.equal(p0.door, 0, 'the shutter starts closed');
    assert.equal(p0.label, 'OPENING GARAGE');
    assert.equal(p0.fov, 58);
    assert.ok(Arrival.poseOut(0.9, cfg).door > 0 && Arrival.poseOut(0.9, cfg).door < 1, 'door easing mid-open');
    assert.equal(Arrival.poseOut(1.8, cfg).door, 1, 'shutter clear at DOOR_S');
    assert.equal(Arrival.poseOut(1.8, cfg).z, 0, 'still parked while the door finishes');
    assert.equal(Arrival.poseOut(2.5, cfg).z, 0, 'held beat after the door before it moves');
    assert.ok(Arrival.poseOut(3.0, cfg).z > 0, 'then rolls out');
    let prior = -1;
    for (let t = 0; t <= Arrival.OUT_DURATION + 0.5; t += 0.02) {
      const p = Arrival.poseOut(t, cfg);
      assert.ok(p.z >= prior, 'never backs in');
      assert.ok(p.eye[0] > -5.4 && p.eye[0] < 5.4 && p.eye[2] > -6.4 && p.eye[2] < 6.4, 'the camera stays in the room');
      assert.ok(p.aim[2] <= 9, 'the aim follows the car out, no further');
      prior = p.z;
    }
    assert.ok(Arrival.poseOut(Arrival.OUT_DURATION, cfg).z > 6.4 + 5, 'out of the door and clear of it');
    assert.equal(Arrival.poseOut(Arrival.OUT_DURATION, cfg).active, false);
  }
  assert.ok(Arrival.poseOut(0, Arrival.settings({ angle: 'right' })).eye[0] > 0 && Arrival.poseOut(0, Arrival.settings({})).eye[0] < 0, 'RIGHT stands on the other side');
});
test('once out of the door the car turns into the pit lane, away from the camera', () => {
  for (const [angle, side] of [['cut', 1], ['left', 1], ['right', -1]]) {
    const cfg = Arrival.settings({ angle });
    let px = 0, pyaw = 0;
    for (let t = 0; t <= Arrival.OUT_DURATION + 0.5; t += 0.02) {
      const p = Arrival.poseOut(t, cfg);
      if (p.z < 6.4) assert.ok(Math.abs(p.x) < 1e-9 && Math.abs(p.yaw) < 1e-9, 'straight out of the door: no turn inside the garage');
      assert.ok(side * p.x >= side * px - 1e-9 && side * p.yaw >= side * pyaw - 1e-9, 'the turn only ever tightens one way');
      px = p.x; pyaw = p.yaw;
    }
    const end = Arrival.poseOut(Arrival.OUT_DURATION, cfg);
    assert.ok(side * end.yaw > 1.0 && side * end.yaw < Math.PI / 2, 'turned roughly 60-90 degrees, never back on itself');
    assert.ok(side * end.x > 2, 'and off to the side, away from the camera (the eye stands at x ' + Math.sign(cfg.angle === 'right' ? 1 : -1) + ')');
    assert.ok(Math.sign(end.aim[0]) === side, 'the camera follows it round');
  }
  const cam = readFileSync(new URL('../../js/garage/setup-camera.js', import.meta.url), 'utf8');
  assert.match(cam, /arrivalCar\[0\] = -ac; arrivalCar\[2\] = as; arrivalCar\[8\] = as; arrivalCar\[10\] = ac;/, 'the car matrix carries the yaw, over the preview\'s X mirror');
  const scene = readFileSync(new URL('../../js/garage/scene.js', import.meta.url), 'utf8');
  assert.match(scene, /arrivalMirror\.set\(carMat\); arrivalMirror\[1\] = -carMat\[1\]; arrivalMirror\[5\] = -carMat\[5\]/, 'the floor reflection turns with it');
});
test('cold preparation settles before the drive-out; a warm world opens on the garage immediately', () => {
  const game = readFileSync(new URL('../../js/game.js', import.meta.url), 'utf8');
  const build = game.slice(game.indexOf('function introBuild(go)'), game.indexOf('function introWarm(go)'));
  assert.match(build, /introCover\(info0, n\);/, 'cold preparation is covered: by the race-settings sheet, else the skippable cinematic card');
  assert.match(game, /function introCover\(info, n\) \{ if \(!_introSheet\) loadingScreen\.building\(info, \(\) => studioSkip\(n\)\); \}/);
  assert.ok(build.indexOf('await introPrepare(') >= 0 && build.indexOf('await introPrepare(') < build.indexOf('studioOpen(n, info0)'), 'preparation finishes before outgoing motion');
  const warm = game.slice(game.indexOf('function introWarm(go)'), game.indexOf('function startRaceCovered()'));
  assert.match(warm, /if \(cold\) introCover\(info, n\); else studioOpen\(n, info\);/);
  assert.match(game, /if \(!built && !motionReduced\(\) && introGarage\(go\)\) return;/, 'a ready, warm world opens on it too');
  assert.ok(warm.indexOf('await introPrepare(') >= 0 && warm.indexOf('await introPrepare(') < warm.indexOf('if (cold && _introSkip !== n) { studioOpen'), 'cold motion starts only after compilation settles');
  assert.match(game, /if \(built && _introSkip === _introRun\) \{ _introSkip = 0; go\(\); return; \}/, 'a skip in the garage goes to the race, not the flyby');
  assert.match(game, /\|\| \(\(loadingScreen\.phase\(\) === "build" \|\| loadingScreen\.phase\(\) === "busy"\) && !setupPreviewOn\);/, 'the studio shows through the build card');
  const cam = readFileSync(new URL('../../js/garage/setup-camera.js', import.meta.url), 'utf8');
  assert.match(cam, /const arriving = home\.active \? null : driveOut \? stepDriveOut\(holdDriveOut\) : preview \? stepPreview\(dt\) : arrival\.step\(dt\);/, 'the wall clock, not the 1\/20 s capped render dt; the PREVIEW between the two');
  assert.match(cam, /if \(!cfg\.enabled \|\| reducedMotion\(\)\) return 0;/, 'the arrival tuner and reduced motion gate it');
  assert.match(game, /function studioClose\(n\) \{\n  if \(!_studio \|\| _studio\.n !== n\) return;/, 'only the intro run that opened it closes it');
});

test('the first presented garage frame takes over its preparation cover, then hands off after driving out', async () => {
  const game = readFileSync(new URL('../../js/game.js', import.meta.url), 'utf8');
  // The studio helpers and introGarage (the ready-world path), run for real.
  const src = game.slice(game.indexOf('let _studio = null'), game.indexOf('function introBuild(go)'));
  for (const mode of ['ready', 'quit', 'off', 'watched', 'skipper', 'hidden', 'skip', 'warming']) {
    let now = 0;
    const events = [];
    const c = { _atmo: { prebakeLamps: () => null }, awaitIntroWarm: async current => { while (current() && c.gfx.warming()) await c.menuSlice(); return current(); }, state: 'menu', trackIdx: 0, track: {}, _introRun: 0, _introKey: '', _introSkip: 0, _menuFly: null, flybyShots: null, setupPreviewOn: false, settings: 'one',
      reloadFlybyShots() {}, FlybySeq: { DEFAULT: [], setDuration() {}, vary: () => [], planSteps: () => () => true },
      entrySettings: () => c.settings, menuKey: () => 'world', performance: { now: () => now },
      loadingInfo: () => ({ track: {}, real: mode === 'watched' ? { watch: true } : null }),
      loadingScreen: { garage: (inf, onSkip) => { c._ph = 'garage'; c._skip = onSkip; events.push('garage'); }, building: (inf, onSkip) => { c._ph = 'build'; c._skip = onSkip; events.push('card'); },
        stop: () => { c._ph = ''; events.push('stop'); }, phase: () => c._ph || '', nextFlyMs: () => (mode === 'skipper' ? 12000 : 24000) },
      LoadingScreen: { SHORT_FLY_MS: 12000 }, headlessMode: false, document: { hidden: mode === 'hidden' },
      gfx: { warming: () => mode === 'warming' && now < 2000 },
      setupCam: { startDriveOut: () => mode === 'off' ? 0 : 5000, stopDriveOut() { events.push('out'); }, driveOutLeft: () => (mode === 'warming' ? 5000 : Math.max(0, 5000 - now)) },
      titleIfBare() {},
      menuSlice: async () => { now += 1000; if (!c.gfx.warming()) c.studioShown(); if (mode === 'quit' && now >= 2000) c.state = 'race'; if (mode === 'skip' && now === 2000) c._skip();  },
      raceIntro: () => events.push(c._introSkip === c._introRun ? 'skip:' + c._introKey : 'fly:' + c._introKey), go: () => events.push('go'), Log: { warn() {} } };
    vm.createContext(c); vm.runInContext(src, c);
    const took = c.introGarage(c.go);
    for (let i = 0; i < 400; i++) await Promise.resolve();
    if (mode === 'off' || mode === 'watched' || mode === 'hidden') {
      assert.equal(took, false, mode + ': no drive-out, so raceIntro flies at once');
      assert.equal(c.setupPreviewOn, false, mode);
      continue;
    }
    assert.equal(took, true, mode);
    if (mode === 'warming') {
      assert.deepEqual(events.slice(0, 2), ['card', 'garage'], 'a warm pending at RACE! draws nothing: the card covers it, then the garage replaces it');
      assert.ok(now >= 2000 + 3 * 5000, `a car whose clock never runs is capped at 3x its length from the garage's first frame, not from RACE! (${now})`);
      continue;
    }
    assert.deepEqual(events.slice(0, 2), ['card', 'garage'], mode + ': cover stays until the first presented garage frame');
    assert.equal(c.setupPreviewOn, false, mode + ': the garage preview is down afterwards');
    if (mode === 'ready' || mode === 'skipper') assert.deepEqual(events, ['card', 'garage', 'out', 'card', 'fly:world'], mode + ': the car out, then the card, then the flyby (a habitual skipper still gets the drive-out: the streak shortens the flyby only)');
    else if (mode === 'skip') assert.deepEqual(events, ['card', 'garage', 'out', 'card', 'skip:world'], 'a tap ends the drive-out at once and marks the run skipped');
    else assert.ok(!events.some((e) => e.startsWith('fly')) && events.includes('stop'), 'a quit mid-drive-out lowers the screen and flies nothing');
  }
});
test('GARAGE ARRIVAL TUNER is an ADVANCED VISUALS tool: opens over the settings page, DONE gives it back', () => {
  const { $ } = harness();
  $('pmsettings').hidden = false; $('pm-panel-display').hidden = false;
  Arrival.bindSettings($, { get: () => null, set() {} });
  $('pm-garrival').onclick();
  assert.equal($('garrival').hidden, false);
  assert.equal($('pmsettings').hidden, true, 'the settings page stands down');
  assert.equal($('pm-panel-display').hidden, true, 'and so does its DISPLAY page');
  assert.equal($('ga-close').focused, true);
  $('ga-close').onclick();
  assert.equal($('garrival').hidden, true);
  assert.equal($('pmsettings').hidden, false, 'back to the settings page');
  assert.equal($('pm-panel-display').hidden, false);
  assert.equal($('pm-garrival').focused, true, 'focus returns to the tool button');
  const shell = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  assert.match(shell, /<button id="pm-garrival"[^>]*>GARAGE ARRIVAL TUNER&hellip;<\/button>/);
  assert.match(shell, /id="garrival" role="region"[^>]*data-esc-close="ga-close"/);
  assert.ok(!shell.includes('id="ga-settings"'), 'no inline fold left in the tools list');
});

test('race settings pre-builds the garage, hidden, so the drive-out\'s first frame compiles nothing', () => {
  const game = readFileSync(new URL('../../js/game.js', import.meta.url), 'utf8');
  const pw = game.slice(game.indexOf('async function garagePrewarm(current)'), game.indexOf('function scheduleFlybyTrack('));
  assert.match(pw, /garagePre\.run\(current, \$\("race-settings"\)\.hidden \? "title" : "settings"\)/, 'race settings, or the idle title, through GaragePrebuild');
  // The sequence itself (gates, keying, the idle wait) is VM-run in garage-prebuild.test.mjs.
  const mod = readFileSync(new URL('../../js/garage/prebuild.js', import.meta.url), 'utf8');
  const run = mod.slice(mod.indexOf('async function run('), mod.indexOf('const titleCurrent'));
  assert.ok(run.indexOf('await d.menuIdle(current)') > 0 && run.indexOf('await d.menuIdle(current)') < run.indexOf('G.gfx.warm()'), 'only once the menu is idle');
  assert.ok(run.indexOf('G.gfx.warm()') > 0 && run.indexOf('G.gfx.warm()') < run.indexOf('gate.garageWarm = 2'), 'the program warm is requested before the hidden frames are armed');
  assert.match(game, /await menuFinish\(current, key\);\n\s*await garagePrewarm\(current\);/, 'after the circuit is done');
  const render = game.slice(game.indexOf('function render(dt) {'), game.indexOf('function render(dt) {') + 4000);
  const gate = render.indexOf('const vis = menuBlank'), hidden = render.indexOf('if (menuBlank && _menuGate.garageWarm > 0');
  assert.ok(gate > 0 && hidden > gate, 'drawn after the visibility gate: the canvas stays hidden under race settings');
});

// ── #garrival's PREVIEW IN / OUT (js/garage/setup-camera.js startArrivalPreview) ──
// The block runs for real in a VM: the room's own clock, never the WORK ON CAR
// chrome, and the settings page gets the canvas back when it ends.
function previewHarness({ saved = null, carsetupOpen = false, was = false } = {}) {
  const cam = readFileSync(new URL('../../js/garage/setup-camera.js', import.meta.url), 'utf8');
  const src = cam.slice(cam.indexOf('// THE ARRIVAL PREVIEW'), cam.indexOf('const arrivalCar'));
  const { $ } = harness();
  $('carsetup').hidden = !carsetupOpen; $('garrival-inner').hidden = false;
  const frames = [], keys = [];
  const G = { setupPreviewOn: was, store: { get: (k, d) => (k === 'garageArrival' ? saved : d) } };
  const c = vm.createContext({ $, G, GarageArrival: Arrival, driveOut: null, endHome() {}, Log: { info() {} },
    requestAnimationFrame: (fn) => frames.push(fn), render: (dt) => frames.push('render:' + dt),
    window: { addEventListener: (t, fn) => { if (t === 'keydown') keys.push(fn); } } });
  vm.runInContext(src, c);
  const fn = (n) => vm.runInContext(n, c);
  return { $, G, c, frames, keys, start: fn('startArrivalPreview'), step: fn('stepPreview'), playing: () => fn('preview') };
}
test('PREVIEW IN / OUT: plays the saved settings to the end, then hands the canvas back', () => {
  for (const dir of ['in', 'out']) {
    const h = previewHarness({ saved: { enabled: false, speed: 2, angle: 'right', fov: 66 } });
    const btn = { focus() { this.focused = true; } };
    assert.equal(h.start(dir, btn), true, dir + ': starts');
    assert.equal(h.G.setupPreviewOn, true, 'the garage renders meanwhile');
    assert.equal(h.$('garrival-inner').hidden, true, 'the panel stands aside for the playback');
    const first = h.step(0.05);
    assert.equal(first.active, true);
    assert.equal(first.fov, 66, 'the saved lens');
    assert.ok(first.eye[0] > 0, 'the saved angle (RIGHT)');
    assert.equal(h.$('cs-inner').inert, false, 'the WORK ON CAR sheet is never locked');
    assert.equal(h.$('cs-arrival').hidden, true, 'nor its arrival overlay shown');
    const dur = dir === 'in' ? Arrival.DURATION : Arrival.OUT_DURATION;
    let n = 0, last = first;
    while (h.playing() && n < 1000) { last = h.step(0.1); n++; }
    assert.ok(Math.abs(n - dur / 0.2) <= 2, `${dir}: SPEED 2 plays it in half the time (${n} steps)`);
    assert.equal(last.active, true, 'the last frame holds the final pose');
    if (dir === 'in') assert.equal(last.z, 0, 'parked');
    else assert.ok(last.z >= Arrival.poseOut(dur).z && last.z <= Arrival.poseOut(Arrival.OUT_SETTLE).z, 'out of the door, still coasting');
    assert.equal(h.G.setupPreviewOn, false, 'setupPreviewOn restored');
    assert.equal(h.$('garrival-inner').hidden, false, 'the panel is back');
    assert.equal(btn.focused, true, 'focus returns to the PREVIEW button');
    assert.equal(h.frames.length, 1, 'one more frame is asked for');
    h.frames[0]();
    assert.equal(h.frames[1], 'render:0', 'a paused race redraws its own frame over the garage');
  }
});
test('PREVIEW: Escape and DONE stop it; refused while the garage or the drive-out owns the room', () => {
  const h = previewHarness({ was: true });
  assert.equal(h.start('in'), true, 'plays with the enabled flag off and reduced motion ignored');
  assert.equal(h.start('out'), false, 'one at a time');
  const ev = { key: 'Escape', preventDefault() { this.dp = true; }, stopPropagation() { this.sp = true; } };
  for (const k of h.keys) k(ev);
  assert.equal(h.playing(), null, 'Escape stops it');
  assert.ok(ev.dp && ev.sp, 'and Escape goes no further');
  assert.equal(h.G.setupPreviewOn, true, 'a garage preview that was already on stays on');
  assert.equal(h.frames.length, 0, 'and needs no hand-back frame');
  assert.equal(h.start(null), false, 'stop with nothing playing is a no-op');
  assert.equal(previewHarness({ carsetupOpen: true }).start('in'), false, 'refused under the open GARAGE');
  const busy = previewHarness(); busy.c.driveOut = { t: 0 };
  assert.equal(busy.start('in'), false, 'refused during the RACE! drive-out');
  // DONE routes through bindSettings: mid-playback it stops the preview and keeps the panel.
  const { $ } = harness();
  let playing = true;
  const calls = [];
  Arrival.bindSettings($, { get: () => null, set() {} }, { preview: (dir, b) => { calls.push(dir); if (dir) return true; const was = playing; playing = false; return was; } });
  $('garrival').hidden = false;
  $('ga-preview-in').onclick(); $('ga-preview-out').onclick();
  assert.deepEqual(calls, ['in', 'out']);
  $('ga-close').onclick();
  assert.equal($('garrival').hidden, false, 'DONE mid-playback stops it, the panel stays');
  $('ga-close').onclick();
  assert.equal($('garrival').hidden, true, 'the next DONE closes the tool');
  const shell = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  assert.match(shell, /<button id="ga-preview-in" type="button">PREVIEW IN<\/button>\s*<button id="ga-preview-out" type="button">PREVIEW OUT<\/button>/);
});

test('a circuit already raced opens RACE! on the garage: its programs are not warmed a second time', () => {
  // On a phone, a repeat warm (which links nothing) held TLX's presents for seconds;
  // RACE! met it pending (studioOpen's cardUp), so the drive-out waited behind the card.
  const game = readFileSync(new URL('../../js/game.js', import.meta.url), 'utf8');
  const src = game.slice(game.indexOf('const _warmed = new Set();'), game.indexOf('async function menuFinish('));
  const calls = [];
  const ctx = { gfx: { warm: () => calls.push('warm') }, trackIdx: 3, menuKey: (i) => 'k' + i, _warmKey: '' };
  const run = new Function('ctx', 'with (ctx) {' + src + '; return { warmPrograms, key: () => ctx._warmKey }; }');
  const { warmPrograms, key } = run(ctx);
  warmPrograms(); warmPrograms();
  assert.deepEqual(calls, ['warm'], 'the second request for the same world asks nothing of the backend');
  assert.equal(key(), 'k3', 'and still names the world, so the lights skip their own request');
  warmPrograms('|lit');
  assert.deepEqual(calls, ['warm', 'warm'], 'a dark world\'s lamp-baked warm is its own');
  ctx.trackIdx = 4; warmPrograms();
  assert.equal(calls.length, 3, 'another world warms');
  ctx.gfx = {}; warmPrograms();
  assert.equal(calls.length, 3, 'a backend with no warm() is not asked');
});

test('the car out, the garage HOLDS until the flyby where the backend warms (TLX): no black card between them', async () => {
  const game = readFileSync(new URL('../../js/game.js', import.meta.url), 'utf8');
  const src = game.slice(game.indexOf('function studioClose(n) {'), game.indexOf('async function introPlan('));
  const run = async (gfx, extra = {}) => {
    const calls = [];
    const ctx = { _studio: { n: 1, skip: false, at: 0, ms: 5300, cardUp: false, info: {}, ...extra }, setupPreviewOn: true, gfx,
      setupCam: { driveOutLeft: () => 0, stopDriveOut: () => calls.push('stop') },
      loadingScreen: { phase: () => 'garage', building: () => calls.push('card') },
      menuSlice: async () => {}, performance: { now: () => 0 } };
    const { studioDone } = new Function('ctx', 'with (ctx) {' + src + '; return { studioDone }; }')(ctx);
    await studioDone(() => true, 1);
    return { ctx, calls };
  };
  const tlx = await run({ warm() {} });
  assert.equal(tlx.ctx._studio && tlx.ctx._studio.held, true, 'held, not closed');
  assert.equal(tlx.ctx.setupPreviewOn, true, 'the garage keeps drawing (its last pose)');
  assert.deepEqual(tlx.calls, [], 'no build card, the drive-out not stopped');
  const glx = await run({});
  assert.equal(glx.ctx._studio, null, 'GLX/WGX (no warm): closed as before');
  assert.equal(glx.ctx.setupPreviewOn, false);
  assert.deepEqual(glx.calls, ['stop', 'card'], 'the card covers the rest, as before');
  const skipped = await run({ warm() {} }, { skip: true });
  assert.equal(skipped.ctx._studio, null, 'a skip closes too');
  const render = game.slice(game.indexOf('function render(dt) {'), game.indexOf('function render(dt) {') + 5000);
  assert.match(render, /const heldWarm = !!\(_studio && _studio\.held && track && _menuGate\.warm > 0\);/, 'a held warm frame takes the world path with the canvas left visible (TLX paints nothing while it kicks the warm)');
  assert.match(game, /FlybySeq\.reset\(\); warmPrograms\(\); _menuGate\.warm = 2;/, 'cold world frames run under the preparation card before motion');
  assert.match(game, /studioClose\(n\);   \/\/ the held garage hands straight to the flyby\n\s*try \{ _introKey = key; raceIntro\(go\); \}/, 'introWarm closes the held garage at the handoff');
});
test('the drive-out coasts on past OUT_DURATION (the held garage), and settles without a jump', () => {
  const cfg = Arrival.DEFAULT, at = (t) => Arrival.poseOut(t, cfg);
  assert.ok(Arrival.OUT_SETTLE > Arrival.OUT_DURATION);
  assert.ok(at(Arrival.OUT_DURATION + 0.5).z > at(Arrival.OUT_DURATION).z, 'still rolling while RACE! loads');
  const end = at(Arrival.OUT_SETTLE);
  assert.deepEqual([at(Arrival.OUT_SETTLE + 30).x, at(Arrival.OUT_SETTLE + 30).z], [end.x, end.z], 'then it holds');
  const step = Math.hypot(end.x - at(Arrival.OUT_SETTLE - 0.02).x, end.z - at(Arrival.OUT_SETTLE - 0.02).z);
  assert.ok(step < 0.02, `the last 20 ms moves ${step.toFixed(4)} m: no stop jerk`);
});
test('START from race settings: the sheet covers preparation (PREPARING…), never the card over black, and gives way to the garage', async () => {
  const game = readFileSync(new URL('../../js/game.js', import.meta.url), 'utf8');
  const helpers = game.slice(game.indexOf('let _introSheet = null;'), game.indexOf('function studioOpen(n, info) {'));
  const wrapper = game.slice(game.indexOf('function raceIntroFromSheet('), game.indexOf('function raceIntro(go) {'));
  const awaitWarm = game.slice(game.indexOf('async function awaitIntroWarm('), game.indexOf('// THE STUDIO DRIVE-OUT:'));
  const run = async (mode) => {
    let warming = mode !== 'free' && mode !== 'throw', now = 0;
    const events = [];
    const btn = { textContent: 'START RACE', disabled: false }, back = { disabled: false }, sheet = { hidden: false };
    const snap = (tag) => [tag, sheet.hidden, btn.disabled, btn.textContent, back.disabled];
    const ctx = { _introRun: 0, state: 'menu', settings: 'one', flybyBuildTimer: 7, cleared: 0, _menuGate: { generation: 0 },
      $: (id) => (id === 'rs-cancel' ? back : null), clearTimeout(t) { if (t === 7) ctx.cleared++; },
      Log: { warn() {} }, announce() { events.push(['failed']); }, gfx: { warming: () => warming }, performance: { now: () => now },
      entrySettings: () => ctx.settings, loadingScreen: { building: () => events.push(['card']), stop() {} }, studioSkip() {},
      cancelIntro() { ctx._introRun++; ctx.sheetRelease(false); },
      // Model a successfully presented garage frame releasing the sheet.
      raceIntro: () => { events.push(snap('intro')); if (mode === 'throw') throw new Error('boom'); ctx.sheetRelease(true); },
      menuSlice: async () => {
        now += 500;
        if (now === 1000) events.push(snap('held'));
        if (mode === 'ends' && now >= 1500) warming = false;
        if (mode === 'quit' && now >= 1500) ctx.cancelIntro();
        if (mode === 'setting' && now >= 1500) ctx.settings = 'two';
        if (mode === 'again' && now === 1000) ctx.raceIntroFromSheet(() => events.push(['go']), sheet, btn);
        if (mode === 'again' && now >= 2500) warming = false;
      } };
    vm.createContext(ctx);
    vm.runInContext(helpers + awaitWarm + wrapper, ctx);
    ctx.raceIntroFromSheet(() => events.push(['go']), sheet, btn);
    events.push(snap('sync'));
    for (let i = 0; i < 400; i++) await Promise.resolve();
    return { events, ctx, btn, back, sheet };
  };
  const free = await run('free');
  assert.deepEqual(free.events[0], ['intro', false, true, 'PREPARING…', true], 'no warm: the intro starts at once, the sheet still up and busy (a cold world prepares under it)');
  assert.deepEqual(free.events[1], ['sync', true, false, 'START RACE', false], 'the car moving lowers the sheet and gives both buttons back');
  assert.equal(free.ctx._menuGate.generation, 1, 'the menu\'s own build and warms stand down, as when the sheet closed on the tap');
  assert.equal(free.ctx.cleared, 1);
  const ends = await run('ends');
  assert.deepEqual(ends.events[0], ['sync', false, true, 'PREPARING…', true], 'a warm compiling at the tap: the sheet stays up, START busy, BACK off (Escape presses BACK)');
  assert.deepEqual(ends.events[1], ['held', false, true, 'PREPARING…', true]);
  assert.deepEqual(ends.events[2], ['intro', false, true, 'PREPARING…', true], 'the warm over, the intro runs under the sheet');
  assert.equal(ends.events.some((e) => e[0] === 'card'), false, 'never the card before the garage leave');
  assert.deepEqual([ends.sheet.hidden, ends.btn.disabled, ends.btn.textContent, ends.back.disabled], [true, false, 'START RACE', false]);
  for (const mode of ['quit', 'setting']) {
    const r = await run(mode);
    assert.equal(r.events.some((e) => e[0] === 'intro'), false, mode + ': abandoned, no intro');
    assert.deepEqual([r.sheet.hidden, r.btn.disabled, r.btn.textContent, r.back.disabled], [false, false, 'START RACE', false], mode + ': the sheet stays, its buttons usable again');
  }
  const again = await run('again');
  assert.equal(again.events.filter((e) => e[0] === 'intro').length, 1, 'a second press while preparing is ignored: one intro');
  const stuck = await run('stuck');
  assert.equal(stuck.events.some(e => e[0] === 'intro'), false, 'a warm that never ends cannot hand off');
  assert.deepEqual([stuck.sheet.hidden, stuck.btn.disabled, stuck.back.disabled], [false, false, false], 'timed-out preparation releases the sheet for retry');
  const thrown = await run('throw');
  assert.deepEqual(thrown.events.slice(1), [['failed'], ['sync', false, false, 'START RACE', false]], 'a throwing intro keeps the sheet available for retry');
  // The cold paths' cover: the card only when the sheet is not already covering.
  const cover = {}; const cv = { _introSheet: null, loadingScreen: { building: () => { cover.card = (cover.card || 0) + 1; } }, studioSkip() {} };
  vm.createContext(cv); vm.runInContext(helpers + ';globalThis.setSheet = (v) => { _introSheet = v; };', cv);
  cv.introCover({}, 1); assert.equal(cover.card, 1, 'Data Hub JUMP IN and the rest: the card, as before');
  cv.setSheet({ sheet: {}, btn: {}, label: '' }); cv.introCover({}, 1); assert.equal(cover.card, 1, 'from race settings: no card, the sheet covers so the garage leave comes before the race card');
  // Wiring: every exit from preparation releases the sheet.
  assert.match(game, /if \(!built && !motionReduced\(\) && introGarage\(go\)\) return;\n  sheetRelease\(true\);/, 'so does the flyby (or a skipped garage) when there is no drive-out');
  assert.match(game, /function titleIfBare\(\) \{ sheetRelease\(false\);/, 'an abandoned intro gives the buttons back');
  assert.match(game, /function cancelIntro\(\) \{[^}]*sheetRelease\(false\); \}/, 'so does a quit');
  const build = game.slice(game.indexOf('function introBuild(go)'), game.indexOf('function introWarm(go)'));
  const warm = game.slice(game.indexOf('function introWarm(go)'), game.indexOf('function startRaceCovered()'));
  assert.match(build, /\n  introCover\(info0, n\);\n/, 'a cold build is covered by the sheet or the card');
  assert.match(warm, /if \(cold\) introCover\(info, n\); else studioOpen\(n, info\);/, 'so is a cold warm');
  const rs = readFileSync(new URL('../../js/race/race-settings.js', import.meta.url), 'utf8');
  const go = rs.slice(rs.indexOf('$("rs-go").onclick = () => {'), rs.indexOf('    }\n\n    return {'));
  assert.match(go, /raceIntro\(startRace, sheet, \$\("rs-go"\)\)/, 'race settings hands its sheet and button to the intro');
  assert.match(go, /const dismissSheet = \(\) => \{/, 'rs-go sync-dismisses the :modal dialog so #loading is not trapped under top layer');
  assert.ok(go.indexOf('dismissSheet();') > go.indexOf('if (netRoom) {'), 'and does not close the sheet before routing');
  assert.match(game, /buildStandings, raceIntro: raceIntroFromSheet,/, 'game.js wires the sheet-covering intro into race settings');
  assert.match(wrapper, /sheet\.close\(\)/, 'raceIntroFromSheet sync-closes the dialog (MutationObserver is too late)');
  assert.match(wrapper, /afterPaint|yieldPaint/, 'and yields so #loading paints before intro / warm work');
});

const introGameSource = readFileSync(new URL('../../js/game.js', import.meta.url), 'utf8');
const introCameraSource = readFileSync(new URL('../../js/garage/setup-camera.js', import.meta.url), 'utf8');
const introArrivalSource = readFileSync(new URL('../../js/garage/arrival.js', import.meta.url), 'utf8');

// Explicit scheduler: awaits remain suspended until the test advances the
// clock. No timers, browser, real shader work or CPU load are involved.
async function settleIntroMicrotasks() {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

function garageEntryRegressionHarness() {
  let now = 100, phase = '', warmQueued = true, warmUntil = 0;
  let successfulGaragePresents = 0;
  const slices = [], events = [];
  const sheet = { hidden: false };
  const btn = { disabled: true, textContent: 'PREPARING…' };
  const back = { disabled: true };
  const c = {
    _atmo: { prebakeLamps: () => null }, state: 'menu', trackIdx: 0, track: {}, setupPreviewOn: false,
    endHome() {}, uiExperience: { renderHome: () => false, trackActive: () => false },
    headlessMode: false, settings: 'same-entry', flybyShots: null,
    _menuFly: null, _menuGate: { warm: 0, garageWarm: 0, garageReady: false, generation: 0 },
    _warmKey: 'world', flybyBuildTimer: 0,
    canvas: { style: {} }, _softEl: { style: {} },
    document: { hidden: false, getElementById: () => null },
    performance: { now: () => now },
    menuKey: () => 'world', entrySettings: () => c.settings, menuWorld: () => true,
    loadingInfo: () => ({ track: {} }), reloadFlybyShots() {},
    menuSlice: () => new Promise(resolve => slices.push(resolve)),
    requestAnimationFrame: fn => { fn(now); }, setTimeout: fn => { fn(); }, clearTimeout() {},
    FlybySeq: { DEFAULT: [], setDuration() {}, vary: () => [], planSteps: () => () => true, reset() {} },
    loadingScreen: {
      garage() { phase = 'garage'; events.push('garage-cover'); },
      building() { phase = 'build'; events.push('build-cover'); },
      stop() { phase = ''; events.push('stop-cover'); },
      phase: () => phase, active: () => false, nextFlyMs: () => 24000,
    },
    gfx: {
      warm() { warmQueued = true; }, warming: () => now < warmUntil,
      resize() {},
      present() {
        if (warmQueued) { warmQueued = false; warmUntil = now + 10000; }
        if (now < warmUntil) return;
        successfulGaragePresents++;
      },
    },
    Log: { warn() {} },
    raceIntro() { events.push('handoff'); },
    ensureScenery: async () => {}, motionReduced: () => false,
    loadTrackStepped: async () => false,
    prepareMenuCarAssets: async () => {}, warmPrograms() {},
    titleIfBare() { vm.runInContext('sheetRelease(false)', c); },
    quitToMenu() { events.push('quit'); vm.runInContext('cancelIntro()', c); },
    announce() {},
    // The real clock/pose helpers below read these setup-camera dependencies.
    G: { store: { get: () => ({ enabled: true, speed: 2 }) } },
    reducedMotion: () => false,
  };
  vm.createContext(c);
  vm.runInContext(introArrivalSource, c);
  const clockStart = introCameraSource.indexOf('let driveOut = null;');
  const clockEnd = introCameraSource.indexOf('// THE ARRIVAL PREVIEW', clockStart);
  assert.ok(clockStart >= 0 && clockEnd > clockStart, 'production drive-out clock extraction');
  vm.runInContext(introCameraSource.slice(clockStart, clockEnd) + `
    globalThis.setupCam = { startDriveOut, driveOutLeft, stopDriveOut() { driveOut = null; } };
    globalThis.renderSetupPreview = function (dt, holdDriveOut = false) {
      stepDriveOut(holdDriveOut); gfx.present(); return !gfx.warming();
    };
  `, c);
  const helperStart = introGameSource.indexOf('let _introKey = "", _introRun = 0, _introSkip = 0;');
  const helperEnd = introGameSource.indexOf('function introWarm(go)', helperStart);
  assert.ok(helperStart >= 0 && helperEnd > helperStart, 'production intro extraction');
  vm.runInContext(introGameSource.slice(helperStart, helperEnd), c);
  // Run the real visibility, readiness and garage render routing. The world
  // draw is outside this test; it must never be reached while the garage owns it.
  // gfxContextLost lives just above render() — include it so the prefix extract
  // matches production after the context-loss fail-fast (PR hang fix).
  const renderStart = introGameSource.indexOf('function render(dt) {');
  const renderEnd = introGameSource.indexOf('  gfx.resize();\n  // No track yet', renderStart);
  assert.ok(renderStart >= 0 && renderEnd > renderStart, 'production render prefix extraction');
  const lostStart = introGameSource.lastIndexOf('function gfxContextLost()', renderStart);
  const lostFn = lostStart >= 0 && lostStart < renderStart
    ? introGameSource.slice(lostStart, renderStart)
    : 'function gfxContextLost() { return false; }\n';
  vm.runInContext(lostFn + introGameSource.slice(renderStart, renderEnd) + '\n}', c);
  c.sheetFixture = { sheet, btn, back, label: 'START RACE' };
  vm.runInContext('_introSheet = sheetFixture;', c);
  return {
    c, sheet, btn, back, events,
    presents: () => successfulGaragePresents,
    eval: code => vm.runInContext(code, c),
    disableQueuedWarm() { warmQueued = false; },
    async advance(ms, draw = true) {
      now += ms;
      if (draw) c.render(Math.min(ms / 1000, 0.05));
      for (const resolve of slices.splice(0)) resolve();
      await settleIntroMicrotasks();
    },
  };
}

test('a queued warm cannot spend the drive-out budget before a successful garage present', async () => {
  const h = garageEntryRegressionHarness();
  assert.equal(h.c.gfx.warming(), false, 'warm is queued, not yet compiling');
  assert.equal(h.c.introGarage(() => {}), true);
  await h.advance(16); // first garage submission starts the queued TLX warm
  assert.equal(h.c.gfx.warming(), true);
  for (let i = 0; i < 90; i++) await h.advance(100);
  assert.equal(h.presents(), 0, 'all garage submissions have been withheld by compilation');
  assert.equal(h.events.includes('handoff'), false,
    '9 seconds without a present must not exhaust the 8.7 second drive-out wall budget');
  assert.equal(h.sheet.hidden, false, 'PREPARING covers the first withheld frame');
  assert.equal(h.btn.disabled, true, 'preparation still owns START until a garage frame exists');
  assert.deepEqual([h.c.canvas.style.visibility, h.c._softEl.style.visibility], ['hidden', 'hidden'],
    'staging keeps both canvases hidden underneath the preparation sheet');
  for (let i = 0; i < 15 && h.presents() === 0; i++) await h.advance(100);
  assert.equal(h.presents(), 1, 'observe the first successful garage present directly');
  assert.deepEqual([h.c.canvas.style.visibility, h.c._softEl.style.visibility], ['', ''],
    'both canvases reveal in the first successful present turn');
  for (let i = 0; i < 55 && !h.events.includes('handoff'); i++) await h.advance(100);
  assert.ok(h.presents() >= 25, 'the outgoing animation actually plays after compilation');
  assert.equal(h.sheet.hidden, true, 'the first successful garage present releases the sheet');
  assert.equal(h.events.filter(e => e === 'handoff').length, 1);
});

test('a canceled intro cannot revoke a subsequently opened regular garage camera', async () => {
  const h = garageEntryRegressionHarness();
  h.disableQueuedWarm();
  assert.equal(h.c.introGarage(() => {}), true);
  h.eval('cancelIntro();');
  // The regular garage opens in the same event turn, before old menuSlice wakes.
  h.c.setupPreviewOn = true;
  await h.advance(32, false);
  assert.equal(h.c.setupPreviewOn, true, 'old intro cleanup cannot switch the new owner off');
  assert.equal(h.events.includes('handoff'), false);
  assert.equal(h.eval('_studio'), null, 'cancellation already retired its studio state');
});

test('an abandoned track build cannot be published as a completed intro while settings still match', async () => {
  const h = garageEntryRegressionHarness();
  h.disableQueuedWarm();
  let loadCalls = 0;
  h.c.loadTrackStepped = async () => { loadCalls++; return false; };
  assert.equal(h.c.introBuild(() => {}), true);
  await settleIntroMicrotasks();
  assert.equal(loadCalls, 1);
  assert.equal(h.c.state, 'menu');
  assert.equal(h.c.settings, 'same-entry', 'same selection, but another build won ownership');
  assert.equal(h.events.includes('handoff'), false, 'false from the loader is not prepared success');
  assert.equal(h.eval('_introKey'), '', 'no fake prepared-world token');
  assert.equal(h.btn.disabled, false, 'the player can retry after the canceled build');
});

test('preparation times out without handing off when no garage frame is ever presented', async () => {
  const h = garageEntryRegressionHarness();
  // Even an animation reporting completion cannot bypass first-present readiness.
  h.c.setupCam.driveOutLeft = () => 0;
  assert.equal(h.c.introGarage(() => {}), true);
  await settleIntroMicrotasks();
  await h.advance(29999, false);
  assert.equal(h.presents(), 0);
  assert.equal(h.events.includes('handoff'), false);
  assert.equal(h.btn.disabled, true, 'preparation remains bounded but still owns the sheet');
  await h.advance(1, false);
  assert.equal(h.events.includes('quit'), true, 'unpresentable garage takes the failure recovery path');
  assert.equal(h.events.includes('handoff'), false, 'timeout must not silently skip the garage');
  assert.equal(h.eval('_studio'), null);
  assert.equal(h.eval('_introKey'), '');
  assert.equal(h.c.setupPreviewOn, false);
  assert.deepEqual([h.sheet.hidden, h.btn.disabled, h.back.disabled], [false, false, false]);
});

test('hidden garage prewarming records readiness only after a successful present', async () => {
  const h = garageEntryRegressionHarness();
  h.c._menuGate.garageWarm = 2;
  h.c.renderSetupPreview = () => { h.c.gfx.present(); return !h.c.gfx.warming(); };
  await h.advance(16);
  assert.equal(h.c.canvas.style.visibility, 'hidden');
  assert.equal(h.c.gfx.warming(), true);
  assert.equal(h.c._menuGate.garageReady, false, 'queued compilation withheld the first hidden frame');
  await h.advance(10000);
  assert.equal(h.presents(), 1);
  assert.equal(h.c._menuGate.garageReady, true);
  assert.equal(h.c.canvas.style.visibility, 'hidden');
});

test('a refused garage begin returns false and cannot reveal the unpresented frame', async () => {
  // Execute the real begin/refusal boundary with its frame inputs; geometry
  // after this boundary must not run when the backend refuses the frame.
  const at = introCameraSource.indexOf('  if (gfx.begin({');
  const end = introCameraSource.indexOf('  const spMat = carPaintMat', at);
  assert.ok(at >= 0 && end > at);
  const h = garageEntryRegressionHarness();
  h.disableQueuedWarm();
  let beginCalls = 0, presents = 0;
  const refusal = vm.createContext({
    gfx: { begin() { beginCalls++; return false; }, present() { presents++; } },
    _spVP: [], _spView: [], _spProj: [], _spInvProj: [], eye: [],
    _spSun: [0, 0.86, 0.51], lightsRig: [],
    GarageScene: { live: () => [], SKYLIGHT: [], AMB_SKY: [], AMB_GROUND: [], BACKDROP: [] },
    _spLiv() {}, garageNow() {}, garageCtx() {}, sceneTime: 0, context: {},
  });
  vm.runInContext('function refusedFrame() {\n' + introCameraSource.slice(at, end) +
    '\n gfx.present(); return true; }', refusal);
  assert.equal(refusal.refusedFrame(), false);
  assert.equal(beginCalls, 1);
  assert.equal(presents, 0, 'refused begin never reaches present');
  h.c.renderSetupPreview = refusal.refusedFrame;
  h.c.introGarage(() => {});
  await h.advance(100);
  assert.equal(h.c.gfx.warming(), false, 'refusal must be respected independently of shader warming');
  assert.equal(h.c._menuGate.garageReady, false);
  assert.equal(h.eval('_studio.cardUp'), true);
  assert.equal(h.sheet.hidden, false);
  assert.equal(h.events.includes('handoff'), false);
  h.eval('cancelIntro()'); await h.advance(1, false);
});

function deferredGarageReadbacks(h) {
  const pending = [];
  h.c.gfx.softPresent = () => true;
  h.c.gfx.invalidateSoftPresent = () => h.events.push('invalidate-soft');
  h.c.gfx.awaitSoftPresent = timeout => {
    assert.equal(h.events.at(-1), 'invalidate-soft', 'old readbacks invalidated before registering the new wait');
    return new Promise((resolve, reject) => pending.push({ resolve, reject, timeout }));
  };
  return pending;
}

test('soft presentation keeps preparation covered and the drive-out clock held until a fresh blit', async () => {
  const h = garageEntryRegressionHarness();
  h.disableQueuedWarm();
  const readbacks = deferredGarageReadbacks(h);
  h.c.introGarage(() => {});
  const remaining = h.c.setupCam.driveOutLeft();
  assert.equal(readbacks[0].timeout, 30000);
  for (let i = 0; i < 20; i++) await h.advance(100);
  assert.equal(h.presents(), 20, 'GPU submissions alone do not mean the soft canvas displays the garage');
  assert.equal(h.sheet.hidden, false);
  assert.deepEqual([h.c.canvas.style.visibility, h.c._softEl.style.visibility], ['hidden', 'hidden'],
    'both canvases stay hidden while waiting for the fresh soft blit');
  assert.equal(h.eval('_studio.cardUp'), true);
  assert.equal(h.c.setupCam.driveOutLeft(), remaining, 'unseen drive-out motion consumes no time');
  readbacks[0].resolve(); await settleIntroMicrotasks();
  await h.advance(100);
  assert.equal(h.sheet.hidden, true);
  assert.deepEqual([h.c.canvas.style.visibility, h.c._softEl.style.visibility], ['', ''],
    'the fresh blit reveals both canvases in the same turn that lowers the sheet');
  assert.equal(h.eval('_studio.cardUp'), false);
  assert.equal(h.c.setupCam.driveOutLeft(), remaining, 'the reveal frame still holds the opening pose');
  await h.advance(100);
  assert.ok(h.c.setupCam.driveOutLeft() < remaining, 'motion begins once the garage is visible');
  h.eval('cancelIntro()'); await h.advance(1, false);
});

test('a failed fresh garage readback recovers without uncovering or handing off', async () => {
  const h = garageEntryRegressionHarness();
  h.disableQueuedWarm();
  const readbacks = deferredGarageReadbacks(h);
  h.c.introGarage(() => {});
  await h.advance(100);
  readbacks[0].reject(new Error('garage readback failed'));
  await settleIntroMicrotasks(); await h.advance(1, false);
  assert.equal(h.events.includes('quit'), true);
  assert.equal(h.events.includes('handoff'), false);
  assert.equal(h.events.includes('garage-cover'), false);
  assert.equal(h.eval('_studio'), null);
  assert.deepEqual([h.sheet.hidden, h.btn.disabled, h.back.disabled], [false, false, false]);
});

test('a readback from the previous scene cannot reveal the new garage or advance its clock', async () => {
  const h = garageEntryRegressionHarness();
  h.disableQueuedWarm();
  const state = { sceneGen: 2, shownGen: 1 };
  h.c.gfx.softPresentState = () => state;
  h.c.introGarage(() => {});
  const remaining = h.c.setupCam.driveOutLeft();
  for (let i = 0; i < 10; i++) await h.advance(100);
  assert.equal(h.presents(), 10);
  assert.equal(h.eval('_studio.cardUp'), true);
  assert.equal(h.sheet.hidden, false);
  assert.equal(h.c.setupCam.driveOutLeft(), remaining);
  state.shownGen = state.sceneGen;
  await h.advance(100);
  assert.equal(h.eval('_studio.cardUp'), false);
  assert.equal(h.sheet.hidden, true);
  assert.equal(h.c.setupCam.driveOutLeft(), remaining);
  h.eval('cancelIntro()'); await h.advance(1, false);
});

test('obsolete garage readback fulfillment or rejection cannot affect a newer studio owner', async () => {
  for (const settle of ['resolve', 'reject']) {
    const h = garageEntryRegressionHarness();
    h.disableQueuedWarm();
    const readbacks = deferredGarageReadbacks(h);
    h.c.introGarage(() => {});
    await h.advance(100);
    h.eval('cancelIntro()');
    h.c.introGarage(() => {});
    const owner = h.eval('_studio');
    readbacks[0][settle](new Error('obsolete readback'));
    await settleIntroMicrotasks(); await h.advance(100);
    assert.strictEqual(h.eval('_studio'), owner, settle);
    assert.equal(owner.softReady, false, 'old ' + settle + ' cannot satisfy the new readback');
    assert.equal(owner.error, undefined, 'old rejection cannot fail the new studio');
    assert.equal(owner.cardUp, true);
    assert.equal(h.events.includes('quit'), false);
    readbacks[1].resolve(); await settleIntroMicrotasks(); await h.advance(100);
    assert.equal(owner.softReady, true);
    assert.equal(owner.cardUp, false, 'only the current readback releases preparation');
    h.eval('cancelIntro()'); await h.advance(1, false);
  }
});


function sheetRecoveryDeferred() {
  let resolve, reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
}

function sheetRecoveryHarness({ manual = false, pollThrows = false, syncPollThrows = false, sliceRejects = false, deferredCold = false, introThrows = false } = {}) {
  const game = readFileSync(new URL('../../js/game.js', import.meta.url), 'utf8');
  const state = game.slice(game.indexOf('let _introKey ='), game.indexOf('async function awaitIntroWarm('));
  const warm = game.slice(game.indexOf('async function awaitIntroWarm('), game.indexOf('// THE STUDIO DRIVE-OUT:'));
  const helpers = game.slice(game.indexOf('let _introSheet = null;'), game.indexOf('function studioOpen(n, info) {'));
  const wrapper = game.slice(game.indexOf('function raceIntroFromSheet('), game.indexOf('function raceIntro(go) {'));
  let clock = 0, warming = true, polls = 0, activeBack;
  const waits = [], intros = [], announcements = [], warnings = [], views = [];
  const ctx = {
    _studio: null, studioClose() { assert.fail('no studio is open in the warm wait'); },
    state: 'menu', settings: 'one', flybyBuildTimer: 7, _menuGate: { generation: 0 },
    $: () => activeBack, clearTimeout() {}, entrySettings: () => ctx.settings,
    performance: { now: () => clock },
    gfx: { warming() {
      if (syncPollThrows || (pollThrows && ++polls > 1)) throw new Error('injected warm poll failure');
      return warming;
    } },
    Log: { warn(...args) { warnings.push(args); } },
    announce(...args) { announcements.push(args); },
    loadingInfo: () => ({ track: { id: "monza" } }),
    loadingScreen: { building() { assert.fail('the settings sheet must cover preparation'); }, stop() {} },
    studioSkip() {},
    menuSlice() {
      if (sliceRejects) return Promise.reject(new Error('injected warm slice failure'));
      if (manual) { const held = sheetRecoveryDeferred(); waits.push(held); return held.promise; }
      clock += 1000; return Promise.resolve();
    },
    raceIntro(go) {
      if (introThrows) throw new Error('injected synchronous intro failure');
      intros.push({ owner: ctx.sheetOwner(), stillWarming: warming, go });
      if (!deferredCold) ctx.sheetRelease(true);
    },
  };
  vm.createContext(ctx);
  vm.runInContext(state + warm + helpers + wrapper + ';globalThis.sheetOwner = () => _introSheet;', ctx);
  const drain = async () => { for (let i = 0; i < 400; i++) await Promise.resolve(); };
  function start() {
    const view = { sheet: { hidden: false }, btn: { textContent: 'START RACE', disabled: false },
      back: { disabled: false }, goes: 0 };
    activeBack = view.back; views.push(view);
    ctx.raceIntroFromSheet(() => view.goes++, view.sheet, view.btn);
    return view;
  }
  function assertBusy(view) {
    assert.equal(view.sheet.hidden, false, 'sheet stays up with PREPARING… — garage leave before the race card');
    assert.equal(view.btn.disabled, true);
    assert.equal(view.btn.textContent, 'PREPARING…');
    assert.equal(view.back.disabled, true);
  }
  function assertRetry(view) {
    assert.equal(view.sheet.hidden, false, 'failed preparation keeps settings available');
    assert.equal(view.btn.disabled, false, 'START can be retried');
    assert.equal(view.btn.textContent, 'START RACE');
    assert.equal(view.back.disabled, false, 'BACK works again');
    assert.equal(view.goes, 0, 'failure must not bypass preparation into the race');
  }
  return { ctx, waits, intros, announcements, warnings, start, drain, assertBusy, assertRetry,
    ready() { warming = false; }, garagePresent() { ctx.sheetRelease(true); } };
}

test('a race-settings warm timeout restores retry without starting an unready intro', async () => {
  const h = sheetRecoveryHarness(), view = h.start();
  h.assertBusy(view); await h.drain();
  assert.equal(h.intros.length, 0, '30 seconds is failure, not shader readiness');
  h.assertRetry(view); assert.equal(h.ctx.sheetOwner(), null);
  assert.ok(h.announcements.some(args => /retry/i.test(String(args[0]))), 'the player receives a retry message');
  h.ready(); const retry = h.start(); await h.drain();
  assert.equal(h.intros.length, 1, 'a later ready request can enter');
  assert.equal(retry.btn.disabled, false);
});

test('asynchronous race-settings warm failures restore buttons and retain the sheet', async () => {
  for (const options of [{ pollThrows: true }, { sliceRejects: true }]) {
    const h = sheetRecoveryHarness(options), view = h.start();
    await h.drain();
    assert.equal(h.intros.length, 0);
    h.assertRetry(view); assert.equal(h.ctx.sheetOwner(), null);
    assert.ok(h.announcements.some(args => /retry/i.test(String(args[0]))));
    // node:test also rejects an unhandled rejection escaping this recovery.
  }
});

test('duplicate race-settings presses share preparation and enter the intro once', async () => {
  const h = sheetRecoveryHarness({ manual: true }), view = h.start();
  const owner = h.ctx.sheetOwner();
  h.ctx.raceIntroFromSheet(() => view.goes++, view.sheet, view.btn);
  assert.strictEqual(h.ctx.sheetOwner(), owner);
  await h.drain(); // paint-yield microtask, then the warm wait is armed
  assert.equal(h.waits.length, 1, 'no second wait or preparation owner');
  h.assertBusy(view);
  h.ready(); h.waits[0].resolve(); await h.drain();
  assert.equal(h.intros.length, 1);
  assert.equal(view.goes, 0, 'the wrapper hands off to the intro, not directly to the race');
  assert.equal(view.btn.disabled, false);
});

test('settlement of an abandoned warm wait cannot unlock the newer sheet owner', async () => {
  const h = sheetRecoveryHarness({ manual: true }), old = h.start();
  await h.drain();
  const oldWait = h.waits[0]; h.ctx.cancelIntro(); h.assertRetry(old);
  const newer = h.start(); await h.drain();
  const owner = h.ctx.sheetOwner(), newWait = h.waits[1];
  oldWait.reject(new Error('old owner failed after cancellation')); await h.drain();
  assert.strictEqual(h.ctx.sheetOwner(), owner);
  h.assertBusy(newer);
  assert.equal(h.intros.length, 0);
  assert.equal(h.announcements.length, 0, 'an obsolete request must not show a failure over the new request');
  h.ready(); newWait.resolve(); await h.drain();
  assert.equal(h.intros.length, 1);
  assert.strictEqual(h.intros[0].owner, owner, 'only the current owner enters');
});

test('a successful warm handoff leaves cold preparation covered until the garage boundary', async () => {
  const h = sheetRecoveryHarness({ manual: true, deferredCold: true }), view = h.start();
  await h.drain();
  const owner = h.ctx.sheetOwner(); h.ready(); h.waits[0].resolve(); await h.drain();
  assert.equal(h.intros.length, 1);
  assert.equal(h.intros[0].stillWarming, false);
  assert.strictEqual(h.ctx.sheetOwner(), owner, 'wrapper cleanup cannot uncover the child intro build');
  h.assertBusy(view);
  assert.equal(view.goes, 0);
  // Model studioShown's real release boundary; actual pixels remain browser QA.
  h.garagePresent();
  assert.equal(view.sheet.hidden, true);
  assert.equal(view.btn.disabled, false);
  assert.equal(view.btn.textContent, 'START RACE');
  assert.equal(view.back.disabled, false);
  assert.equal(h.ctx.sheetOwner(), null);
});


test('a synchronous initial warm-poll exception restores the settings sheet', async () => {
  const h = sheetRecoveryHarness({ syncPollThrows: true });
  let view;
  assert.doesNotThrow(() => { view = h.start(); });
  await h.drain();
  h.assertRetry(view);
  assert.equal(h.ctx.sheetOwner(), null);
  assert.equal(h.intros.length, 0);
  assert.equal(h.warnings.length, 1);
  assert.ok(h.announcements.some(args => /retry/i.test(String(args[0]))));
});

test('a synchronous intro exception restores retry instead of starting the race', async () => {
  const h = sheetRecoveryHarness({ introThrows: true });
  h.ready();
  const view = h.start();
  await h.drain();
  h.assertRetry(view);
  assert.equal(h.ctx.sheetOwner(), null);
  assert.equal(h.warnings.length, 1);
  assert.ok(h.announcements.some(args => /retry/i.test(String(args[0]))));
});

test('a settings change abandons the warm wait and restores its owner', async () => {
  const h = sheetRecoveryHarness({ manual: true }), view = h.start();
  await h.drain();
  h.ctx.settings = 'two';
  h.waits[0].resolve();
  await h.drain();
  h.assertRetry(view);
  assert.equal(h.ctx.sheetOwner(), null);
  assert.equal(h.intros.length, 0);
  assert.equal(h.announcements.length, 0);
});
