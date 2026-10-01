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
test('studio drive-out (poseOut): shutter up, parked a beat, then nose first out of the door and clear of it', () => {
  for (const angle of ['cut', 'left', 'right']) {
    const cfg = Arrival.settings({ angle, fov: 58 });
    const p0 = Arrival.poseOut(0, cfg);
    assert.equal(p0.z, 0, 'parked where the arrival parks it');
    assert.equal(p0.door, 1, 'the shutter is already up');
    assert.equal(p0.fov, 58);
    assert.equal(Arrival.poseOut(1.0, cfg).z, 0, 'a held beat before it moves');
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
test('game.js plays the studio drive-out AT ONCE on every RACE!, with no card, and the warm waits for it', () => {
  const game = readFileSync(new URL('../../js/game.js', import.meta.url), 'utf8');
  const build = game.slice(game.indexOf('function introBuild(go)'), game.indexOf('function introWarm(go)'));
  assert.match(build, /  studioOpen\(n, info0\);/, 'the drive-out starts at once, before any build step');
  assert.match(build, /  studioOpen\(n, info0\);\n  const out = studioDone\(live, n\);/, 'the watcher starts with the car: a build that outlasts it gets the card when the car is out');
  assert.ok(build.indexOf('await out;') > 0 && build.indexOf('await out;') < build.indexOf('warmPrograms()'), 'the warm waits for the car to be out');
  const warm = game.slice(game.indexOf('function introWarm(go)'), game.indexOf('function startRaceCovered()'));
  assert.match(warm, /  studioOpen\(n, loadingInfo\(\)\);/);
  assert.match(game, /if \(!built && !motionReduced\(\) && introGarage\(go\)\) return;/, 'a ready, warm world opens on it too');
  assert.ok(warm.indexOf('await studioDone(live, n)') < warm.indexOf('warmPrograms()'));
  assert.match(game, /if \(built && _introSkip === _introRun\) \{ _introSkip = 0; go\(\); return; \}/, 'a skip in the garage goes to the race, not the flyby');
  assert.match(game, /if \(gfx\.warming && gfx\.warming\(\)\) return;\n  if \(_studio\) studioShown\(\);/, 'the garage replaces a pending warm\'s card on its first frame');
  assert.match(game, /\|\| \(loadingScreen\.phase\(\) === "build" && !setupPreviewOn\);/, 'the studio shows through the build card');
  const cam = readFileSync(new URL('../../js/garage/setup-camera.js', import.meta.url), 'utf8');
  assert.match(cam, /const arriving = driveOut \? stepDriveOut\(\) : preview \? stepPreview\(dt\) : arrival\.step\(dt\);/, 'the wall clock, not the 1\/20 s capped render dt; the PREVIEW between the two');
  assert.match(cam, /if \(!cfg\.enabled \|\| reducedMotion\(\)\) return 0;/, 'the arrival tuner and reduced motion gate it');
  assert.match(game, /!_studio\.skip && live\(\) && setupCam\.driveOutLeft\(\) > 0 && performance\.now\(\) - _studio\.at < \(_studio\.cardUp \? 30000 : _studio\.ms \* 3\)\)/, 'a build stall delays the car, never cuts it off in the doorway — and a card held for a pending warm does not spend its time');
  assert.match(game, /function studioClose\(n\) \{\n  if \(!_studio \|\| _studio\.n !== n\) return;/, 'only the intro run that opened it closes it');
});

test('the garage drive-out owns the screen with no card, and the card arrives only once the car is out', async () => {
  const game = readFileSync(new URL('../../js/game.js', import.meta.url), 'utf8');
  // The studio helpers and introGarage (the ready-world path), run for real.
  const src = game.slice(game.indexOf('let _studio = null'), game.indexOf('function introBuild(go)'));
  for (const mode of ['ready', 'quit', 'off', 'watched', 'skipper', 'hidden', 'skip', 'warming']) {
    let now = 0;
    const events = [];
    const c = { state: 'menu', trackIdx: 0, _introRun: 0, _introKey: '', setupPreviewOn: false, settings: 'one',
      entrySettings: () => c.settings, menuKey: () => 'world', performance: { now: () => now },
      loadingInfo: () => ({ track: {}, real: mode === 'watched' ? { watch: true } : null }),
      loadingScreen: { garage: (inf, onSkip) => { c._ph = 'garage'; c._skip = onSkip; events.push('garage'); }, building: () => { c._ph = 'build'; events.push('card'); },
        stop: () => { c._ph = ''; events.push('stop'); }, phase: () => c._ph || '', nextFlyMs: () => (mode === 'skipper' ? 12000 : 24000) },
      LoadingScreen: { SHORT_FLY_MS: 12000 }, headlessMode: false, document: { hidden: mode === 'hidden' },
      gfx: { warming: () => mode === 'warming' && now < 2000 },
      setupCam: { startDriveOut: () => mode === 'off' ? 0 : 5000, stopDriveOut() { events.push('out'); }, driveOutLeft: () => (mode === 'warming' ? 5000 : Math.max(0, 5000 - now)) },
      menuSlice: async () => { now += 1000; if (mode === 'quit' && now >= 2000) c.state = 'race'; if (mode === 'skip' && now === 2000) c._skip(); if (mode === 'warming' && now === 3000) c.studioShown(); },
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
      assert.ok(now >= 3000 + 3 * 5000, `a car whose clock never runs is capped at 3x its length from the garage's first frame, not from RACE! (${now})`);
      continue;
    }
    assert.equal(events[0], 'garage', mode + ': the drive-out owns the screen first, with no card');
    assert.equal(c.setupPreviewOn, false, mode + ': the garage preview is down afterwards');
    if (mode === 'ready' || mode === 'skipper') assert.deepEqual(events, ['garage', 'out', 'card', 'fly:world'], mode + ': the car out, then the card, then the flyby (a habitual skipper still gets the drive-out: the streak shortens the flyby only)');
    else if (mode === 'skip') assert.deepEqual(events, ['garage', 'out', 'card', 'skip:world'], 'a tap ends the drive-out at once and marks the run skipped');
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
  assert.match(pw, /_menuGate\.garageReady \|\| \$\("race-settings"\)\.hidden \|\| !\(await menuIdle\(current\)\)/, 'once, on race settings, when the sheet is idle');
  assert.ok(pw.indexOf('gfx.warm()') > 0 && pw.indexOf('gfx.warm()') < pw.indexOf('_menuGate.garageWarm = 2'), 'the program warm is requested before the hidden frames are armed');
  assert.match(game, /await menuFinish\(current, key\);\n\s*await garagePrewarm\(current\);/, 'after the circuit is done');
  const render = game.slice(game.indexOf('function render(dt) {'), game.indexOf('function render(dt) {') + 4000);
  const gate = render.indexOf('const vis = menuBlank'), hidden = render.indexOf('if (menuBlank && _menuGate.garageWarm > 0');
  assert.ok(gate > 0 && hidden > gate, 'drawn after the visibility gate: the canvas stays hidden under race settings');
  assert.match(render, /if \(setupPreviewOn && !heldWarm\) _menuGate\.garageReady = true;/, 'the real garage screen counts as pre-built');
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
  const c = vm.createContext({ $, G, GarageArrival: Arrival, driveOut: null, Log: { info() {} },
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
  const src = game.slice(game.indexOf('function studioClose(n) {'), game.indexOf('// A READY, WARM WORLD STILL OPENS ON THE GARAGE'));
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
  assert.match(game, /FlybySeq\.reset\(\); if \(warmPrograms\(\) \|\| !\(_studio && _studio\.held\)\) _menuGate\.warm = 2;/, 'held: world frames only when a warm was really requested, else the world would paint over the garage');
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
test('START during a pending shader warm keeps race settings up (PREPARING…), then opens on the garage: no black card first', async () => {
  const game = readFileSync(new URL('../../js/game.js', import.meta.url), 'utf8');
  const src = game.slice(game.indexOf('let _sheetHold = false;'), game.indexOf('function raceIntro(go) {'));
  const run = async (mode) => {
    let warming = mode !== 'free', now = 0;
    const events = [];
    const btn = { textContent: 'START RACE', disabled: false };
    const sheet = { hidden: false };
    const ctx = { _introRun: 0, state: 'menu', settings: 'one', Log: { warn() {} },
      gfx: { warming: () => warming }, performance: { now: () => now },
      entrySettings: () => ctx.settings,
      raceIntro: (go) => events.push(['intro', sheet.hidden, btn.disabled, btn.textContent]),
      menuSlice: async () => {
        now += 500;
        if (now === 1000) events.push(['held', sheet.hidden, btn.disabled, btn.textContent]);
        if (mode === 'ends' && now >= 1500) warming = false;
        if (mode === 'back' && now >= 1500) sheet.hidden = true;
        if (mode === 'quit' && now >= 1500) ctx._introRun++;
        if (mode === 'setting' && now >= 1500) ctx.settings = 'two';
        if (mode === 'again' && now === 1000) ctx.raceIntroFromSheet(() => events.push(['go']), sheet, btn);
        if (mode === 'again' && now === 2000) events.push(['still', btn.disabled, btn.textContent]);
        if (mode === 'again' && now >= 2500) warming = false;
      } };
    vm.createContext(ctx);
    vm.runInContext(src, ctx);
    ctx.raceIntroFromSheet(() => events.push(['go']), sheet, btn);
    if (mode !== 'free') events.push(['sync', sheet.hidden, btn.disabled]);
    for (let i = 0; i < 400; i++) await Promise.resolve();
    return { events, btn, sheet };
  };
  const free = await run('free');
  assert.deepEqual(free.events, [['intro', true, false, 'START RACE']], 'no warm: the sheet closes and the intro runs at once, as before');
  const ends = await run('ends');
  assert.deepEqual(ends.events[0], ['sync', false, true], 'a pending warm: the sheet stays up and START is busy — no card over a black canvas');
  assert.deepEqual(ends.events[1], ['held', false, true, 'PREPARING…']);
  assert.deepEqual(ends.events[2], ['intro', true, false, 'START RACE'], 'the warm over: the sheet closes, the button is given back, the intro opens on the garage');
  for (const mode of ['back', 'quit', 'setting']) {
    const r = await run(mode);
    assert.equal(r.events.some((e) => e[0] === 'intro'), false, mode + ': abandoned, no intro');
    assert.equal(r.btn.disabled, false, mode + ': START is usable again');
    assert.equal(r.btn.textContent, 'START RACE', mode);
  }
  const again = await run('again');
  assert.deepEqual(again.events.find((e) => e[0] === 'still'), ['still', true, 'PREPARING…'], 'a second press while it waits is ignored: the button stays busy');
  assert.equal(again.events.filter((e) => e[0] === 'intro').length, 1, 'and one intro, not two');
  assert.deepEqual(again.events.at(-1), ['intro', true, false, 'START RACE']);
  const stuck = await run('stuck');
  assert.deepEqual(stuck.events.at(-1), ['intro', true, false, 'START RACE'], 'a warm that never ends is bounded: the intro (and its card) after 30 s, never a dead button');
  const rs = readFileSync(new URL('../../js/race/race-settings.js', import.meta.url), 'utf8');
  const go = rs.slice(rs.indexOf('$("rs-go").onclick = () => {'), rs.indexOf('    }\n\n    return {'));
  assert.match(go, /raceIntro\(startRace, sheet, \$\("rs-go"\)\)/, 'race settings hands its sheet and button to the intro');
  assert.ok(go.indexOf('sheet.hidden = true') > go.indexOf('if (netRoom) {'), 'and does not close the sheet before routing');
  assert.match(game, /buildStandings, raceIntro: raceIntroFromSheet,/, 'game.js wires the sheet-holding intro into race settings');
});
