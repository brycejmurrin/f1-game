import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { absSrc } from '../helpers/abs-src.mjs';
import { makeDom } from '../helpers/mini-dom.mjs';
const context = vm.createContext({});
vm.runInContext(readFileSync(new URL('../../js/garage/crew-draw.js', import.meta.url), 'utf8'), context, { filename: absSrc('js/garage/crew-draw.js') });
vm.runInContext(readFileSync(new URL('../../js/garage/arrival.js', import.meta.url), 'utf8'), context);
const Arrival = vm.runInContext('GarageArrival', context);
vm.runInContext(readFileSync(new URL('../../js/track/core/pit.js', import.meta.url), 'utf8'), context);
const TrackPit = vm.runInContext('TrackPit', context);
function raceEntryProfileStub({ budgetMs = 30000, now = () => 0 } = {}) {
  let t0 = now();
  const noop = () => {};
  return {
    spanAsync: (_n, fn) => fn(),
    span: (_n, fn) => fn(),
    mark: noop,
    lap: noop,
    beginUi() { t0 = now(); },
    setProgressSink: noop,
    afterPaint: () => Promise.resolve(),
    introBudgetExpired: () => now() - t0 >= budgetMs,
    introBudgetLeft: () => Math.max(0, budgetMs - (now() - t0)),
  };
}
const PERF_GOV_STUB = { softwareRaster: () => false };
const UI_EXPERIENCE_STUB = { isPracticePick: () => false };
function harness(reduced = false) {
  const elements = new Map();
  const $ = id => {
    if (!elements.has(id)) elements.set(id, { hidden: true, inert: false, textContent: '',
      classList: { toggle() {} }, setAttribute(k, v) { this[k] = v; }, focus() { this.focused = true; } });
    return elements.get(id);
  };
  return { $, arrival: Arrival.create($, () => reduced) };
}
test('car waits out of sight until the shutter is clear, comes up the lane past the box, backs into the bay and parks', () => {
  for (const angle of ['cut', 'left', 'right']) {
    const cfg = Arrival.settings({ angle });
    let prior = Infinity, stopped = null;
    for (let t = 0; t <= Arrival.DURATION + 0.5; t += 0.02) {
      const p = Arrival.pose(t, cfg, true);
      assert.ok(p.z <= prior + 1e-9 && p.z >= 0, 'never drives back out: z only falls');
      if (t < 1.8) { assert.equal(p.z, 13); assert.ok(!seenThroughDoor(p), angle + ': out of sight while the shutter opens'); }
      if (p.z < 13) { assert.equal(p.door, 1); if (!stopped) stopped = Arrival.pose(t - 0.02, cfg, true); }
      assert.ok(p.eye[0] > -5.4 && p.eye[0] < 5.4 && p.eye[2] > -6.4 && p.eye[2] < 6.4);
      prior = p.z;
    }
    assert.ok(seenThroughDoor(stopped), angle + ': it stops past the box where the camera sees it, then backs in');
    const end = Arrival.pose(Arrival.DURATION + 0.5, cfg, true);
    assert.deepEqual([end.x + 0, end.z + 0, end.yaw + 0, end.active], [0, 0, 0, false], 'parked straight, nose to the lane');
    // The way in is the drive-out's own arc: the same points, run backwards.
    const side = angle === 'left' ? 1 : -1;
    for (let k = 0.05; k < 1; k += 0.05) {
      const p = Arrival.pose(1.8 + 2.6 + 0.4 + 3.6 * k, cfg, true);
      const onStraight = Math.abs(p.x) < 1e-9 && Math.abs(p.yaw) < 1e-9 && p.z <= 8 + 1e-9;
      const onArc = Math.abs(Math.hypot(p.x - side * 5, p.z - 8) - 5) < 1e-6 && Math.abs(p.yaw - side * Math.atan2(p.z - 8, side * (side * 5 - p.x))) < 1e-6;
      assert.ok(onStraight || onArc, `${angle} k ${k.toFixed(2)}: backing in on the drive-out's straight or arc (${p.x.toFixed(3)}, ${p.z.toFixed(3)})`);
    }
  }
});
test('skip and natural completion unlock controls and preserve open shutter until exit', () => {
  for (const skip of [true, false]) {
    const { $, arrival } = harness(); arrival.start();
    assert.equal($('cs-inner').inert, true);
    assert.equal($('carsetup')['data-esc-close'], 'cs-arrival-skip');
    if (skip) $('cs-arrival-skip').onclick();
    else for (let i = 0; i < Math.ceil(Arrival.DURATION / 0.1) + 2; i++) arrival.step(0.1);
    assert.equal(arrival.state.z, 0); assert.equal(arrival.state.door, 1);
    assert.equal($('cs-inner').inert, false); assert.equal($('cs-arrival').hidden, true);
    assert.equal($('carsetup')['data-esc-close'], 'cs-back');
    arrival.cancel(); assert.equal(arrival.state, null);
    arrival.start(); assert.equal(arrival.state.z, 13);
  }
});
test('reduced motion bypasses camera movement; tab gaps and invalid dt cannot skip sequence', () => {
  const reduced = harness(true); reduced.arrival.start();
  assert.equal(reduced.arrival.state.active, false);
  assert.equal(reduced.$('cs-inner').inert, false);
  const { arrival } = harness(); arrival.start();
  for (const dt of [NaN, -3, Infinity]) arrival.step(dt);
  assert.equal(arrival.state.door, 0);
  arrival.step(60); assert.equal(arrival.state.active, true); assert.equal(arrival.state.z, 13);
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
  for (let i = 0; i < Math.ceil(Arrival.DURATION / 0.2) + 1; i++) arrival.step(0.1);
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
test('reduce-motion Start Race plays the drive-out at the tuner\'s own pace: no short cut, never 0 for an enabled tuner', () => {
  assert.equal(Arrival.OUT_REDUCE_SPEED, undefined, 'the 4x reduce cut (~1.9 s) is gone: it read as a glitch, not a leave');
  assert.ok(Math.round(Arrival.OUT_DURATION * 1000) >= 7000, 'the leave at speed 1 is a real shot, not a flash');
  const cam = readFileSync(new URL('../../js/garage/setup-camera.js', import.meta.url), 'utf8');
  const out = cam.slice(cam.indexOf('function startDriveOut()'), cam.indexOf('function driveOutLeft()'));
  assert.ok(!/reducedMotion\(\)/.test(out), 'startDriveOut reads no motion flag: reduce plays the same drive-out');
  assert.match(out, /const play = Object\.assign\(\{\}, cfg, \{ enabled: true \}\);\s*driveOut = \{ t: 0, cfg: play \};\s*driveOutEngine\(true\);\s*return Math\.round\(GarageArrival\.wallSeconds\(play, "out"\) \* 1000 \/ play\.speed\);/, 'wall ms at cfg.speed, SLOW-MO included');
  assert.match(out, /if \(!cfg\.enabled\) return 0;/, 'only the tuner can turn it off for a player');
  // Player pace: speed 1 (the default) → OUT_DURATION, ~10.6 s, never trimmed.
  assert.ok(Math.abs(Arrival.OUT_DURATION * 1000 / Arrival.settings(null).speed - 10600) <= 400, 'the default drive-out is the tuned ~10.6 s');
  // Automation (the harness) skips it through the ONE shared gate, nothing else.
  assert.match(out, /if \(typeof LoadingScreen !== "undefined" && LoadingScreen\.isAutomation && LoadingScreen\.isAutomation\(\)\) return 0;/, 'harness launches skip the drive-out via LoadingScreen.isAutomation');
  assert.ok(!/webdriver/.test(out), 'no scattered navigator.webdriver check: the shared gate decides');
});

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
    assert.ok(side * end.yaw > 1.0 && side * end.yaw <= Math.PI / 2 + 1e-9, 'squared into the lane, never back on itself');
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
  assert.match(build, /introCover\(info0, n\);/, 'cold preparation is covered: by the race-settings sheet, else the prep scrim');
  assert.match(game, /function introCover\(info, n\) \{[\s\S]*?if \(!_introSheet \|\| sheetPrep\) loadingScreen\.prep\(info, \(\) => studioSkip\(n\)\);/);
  assert.match(game, /RaceEntryProfile\.softwareRaster && RaceEntryProfile\.softwareRaster\(\) && !forceSoftwareFlyby\) info\.hasWorld = false;/, 'software GL skips the loading flyby but keeps the race card (the no-world path; ?swFlyby=1 forces the flyby)');
  assert.doesNotMatch(game, /autoHarness|loadingScreen\.isAutomation/, 'the software-GL card is not gated on navigator.webdriver: players see the card the harness sees');
  assert.match(game, /DevFlags\.get\("swFlyby"\)/, 'flyby bench override is URL-only DevFlags, not storage');
  assert.ok(build.indexOf('await introPrepare(') >= 0 && build.indexOf('await introPrepare(') < build.indexOf('studioOpen(n, info0)'), 'preparation finishes before outgoing motion');
  const warm = game.slice(game.indexOf('function introWarm(go)'), game.indexOf('function startRaceCovered()'));
  assert.match(warm, /if \(cold\) introCover\(info, n\); else studioOpen\(n, info\);/);
  assert.match(game, /if \(!built && introGarage\(go\)\) return;/, 'a ready, warm world opens on it too (reduce-motion included)');
  assert.match(warm,
    /if \(cold\) \{\s*\/\/ Cold:[^\n]*\n\s*const ready = await introPrepare\(live, key, info, n, true\);[\s\S]*?studioOpen\(n, info\); await RaceEntryProfile\.spanAsync\("studioDone", \(\) => studioDone\(live, n\)\);/,
    'cold motion starts only after compilation settles');
  assert.match(warm, /const prepP = introPrepare\(live, key, info, n, false\); prepP\.catch\(\(\) => \{\}\);[^\n]*\n\s*await RaceEntryProfile\.spanAsync\("studioDone", \(\) => studioDone\(live, n\)\);/,
    'warm path: garage-out overlaps prepare, never blocked behind it');
  assert.match(game, /if \(built && _introSkip === _introRun\) _introSkip = 0;   \/\/ skipped in the garage: only the drive-out ends/, 'a skip in the garage ends the drive-out only: the card and the flyby still follow');
  assert.ok(!/_introSkip === _introRun\) \{ _introSkip = 0; go\(\); return; \}/.test(game), 'no garage skip jumps past the flyby to the race');
  assert.match(game, /\|\| \(\(loadingScreen\.phase\(\) === "build" \|\| loadingScreen\.phase\(\) === "busy"\) && !setupPreviewOn\);/, 'the studio shows through the build card');
  const cam = readFileSync(new URL('../../js/garage/setup-camera.js', import.meta.url), 'utf8');
  assert.match(cam, /const arriving = home\.active \? null : driveOut \? stepDriveOut\(holdDriveOut\) : preview \? stepPreview\(dt\) : arrival\.step\(dt\);/, 'the wall clock, not the 1\/20 s capped render dt; the PREVIEW between the two');
  assert.match(cam, /if \(!cfg\.enabled\) return 0;/, 'the arrival tuner can disable drive-out');
  assert.ok(!/OUT_REDUCE_SPEED/.test(cam), 'reduce-motion plays the drive-out at the tuned pace, never a sped-up cut');
  assert.match(game, /function studioClose\(n\) \{\n  if \(!_studio \|\| _studio\.n !== n\) return;/, 'only the intro run that opened it closes it');
  assert.match(game, /function afterGarageOut\(n, key, go, prepared, live, stage\)/, 'every intro path awaits garage-out then shows the card through one handoff');
});

test('a preparation that rejects during the drive-out is the PREPARATION FAILED banner, never an unhandled rejection (1a-F1)', async () => {
  // index.html's unhandledrejection listener raises the full-screen error overlay; prepP waits unawaited
  // for the whole drive-out (introGarage, and introWarm's warm branch), so it needs its handler at birth.
  const game = readFileSync(new URL('../../js/game.js', import.meta.url), 'utf8');
  const fnSrc = (name) => { const at = game.indexOf('function ' + name + '(go) {'); return game.slice(at, game.indexOf('\n}\n', at) + 3); };
  const unhandled = [];
  const onRej = (r) => unhandled.push(String(r && r.message || r));
  process.on('unhandledRejection', onRej);
  try {
    for (const name of ['introGarage', 'introWarm']) {
      const said = [];
      const c = { state: 'menu', trackIdx: 0, _introRun: 0, _introSkip: 0, _studio: null, _warmKey: 'k', _menuFly: null, _menuGate: {},
        menuKey: () => 'k', entrySettings: () => 's', loadingInfo: () => ({}), gfx: { warm() {}, warming: () => true },
        studioOpen: (n) => { c._studio = { n }; }, introCover() {}, loadingScreen: { stop() {} },
        introPrepare: async () => { await null; throw new Error('planner threw'); },
        studioDone: () => new Promise((r) => setTimeout(r, 30)),   // the drive-out: a macrotask, so the rejection check runs first
        afterGarageOut() {}, quitToMenu() { said.push('quit'); }, announce: (m) => said.push(m), Log: { warn() {} } };
      vm.createContext(c); vm.runInContext(fnSrc(name), c);
      assert.equal(c[name](() => {}), true, name + ' took the drive-out path');
      await new Promise((r) => setTimeout(r, 80));
      assert.deepEqual(said, ['quit', 'PREPARATION FAILED — please retry'], name + ': the catch still runs');
    }
    assert.deepEqual(unhandled, [], 'no unhandledRejection while the car drives out');
  } finally { process.off('unhandledRejection', onRej); }
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
      entrySettings: () => c.settings, menuKey: () => 'world', performance: { now: () => now }, introNow: () => now,
      loadingInfo: () => ({ track: {}, real: mode === 'watched' ? { watch: true } : null }),
      loadingScreen: { garage: (inf, onSkip) => { c._ph = 'garage'; c._skip = onSkip; events.push('garage'); },
        prep: (inf, onSkip) => { c._ph = 'prep'; c._skip = onSkip; events.push('prep'); },
        building: (inf, onSkip) => { c._ph = 'build'; c._skip = onSkip; events.push('card'); },
        stop: () => { c._ph = ''; events.push('stop'); }, phase: () => c._ph || '', nextFlyMs: () => (mode === 'skipper' ? 12000 : 24000) },
      LoadingScreen: { SHORT_FLY_MS: 12000 }, headlessMode: false, document: { hidden: mode === 'hidden' },
      gfx: { warming: () => mode === 'warming' && now < 2000 },
      setupCam: { startDriveOut: () => mode === 'off' ? 0 : 5000, stopDriveOut() { events.push('out'); }, driveOutLeft: () => (mode === 'warming' ? 5000 : Math.max(0, 5000 - now)) },
      titleIfBare() {},
      menuSlice: async () => { now += 1000; if (!c.gfx.warming()) c.studioShown(); if (mode === 'quit' && now >= 2000) c.state = 'race'; if (mode === 'skip' && now === 2000) c._skip();  },
      raceIntro: () => events.push(c._introSkip === c._introRun ? 'skip:' + c._introKey : 'fly:' + c._introKey), go: () => events.push('go'), Log: { warn() {} },
      RaceEntryProfile: raceEntryProfileStub({ budgetMs: 1e9, now: () => now }), PerfGov: PERF_GOV_STUB,
      UiExperience: UI_EXPERIENCE_STUB, isTimeTrial: () => false };
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
      assert.deepEqual(events.slice(0, 2), ['prep', 'garage'], 'a warm pending at RACE! draws nothing: prep scrim covers it, then the garage replaces it');
      assert.ok(now >= 2000 + 3 * 5000, `a car whose clock never runs is capped at 3x its length from the garage's first frame, not from RACE! (${now})`);
      continue;
    }
    assert.deepEqual(events.slice(0, 2), ['prep', 'garage'], mode + ': prep cover stays until the first presented garage frame');
    assert.equal(c.setupPreviewOn, false, mode + ': the garage preview is down afterwards');
    if (mode === 'ready' || mode === 'skipper') assert.deepEqual(events, ['prep', 'garage', 'out', 'card', 'fly:world'], mode + ': the car out, then the card, then the flyby (a habitual skipper still gets the drive-out: the streak shortens the flyby only)');
    else if (mode === 'skip') assert.deepEqual(events, ['prep', 'garage', 'out', 'card', 'skip:world'], 'a tap ends the drive-out at once and hands the built world to raceIntro (which flies it)');
    else assert.ok(!events.some((e) => e.startsWith('fly')) && events.includes('stop'), 'a quit mid-drive-out lowers the screen and flies nothing');
  }
});
test('GARAGE ENTER & LEAVE is an ADVANCED VISUALS tool: opens over the settings page, DONE gives it back', () => {
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
  assert.match(shell, /<button id="pm-garrival"[^>]*>GARAGE ENTER &amp; LEAVE&hellip;<\/button>/);
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
  $('carsetup').hidden = !carsetupOpen; $('garrival-inner').hidden = false; $('garrival').hidden = false;
  const frames = [], keys = [];
  const G = { setupPreviewOn: was, store: { get: (k, d) => (k === 'garageArrival' ? saved : d) } };
  const c = vm.createContext({ $, G, GarageArrival: Arrival, driveOut: null, endHome() {}, sequenceLook() {}, reducedMotion: () => false, Log: { info() {} },
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
    assert.equal(h.$('ga-preview-stop').hidden, false, 'the touch exit remains shown');
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
    else {
      const end = Arrival.poseOut(Arrival.OUT_SETTLE, Arrival.settings({ angle: 'right' }));
      assert.deepEqual([last.x, last.z], [end.x, end.z], 'gone down the lane, held out of frame');
    }
    assert.equal(h.G.setupPreviewOn, false, 'setupPreviewOn restored');
    assert.equal(h.$('garrival-inner').hidden, false, 'the panel is back');
    assert.equal(h.$('ga-preview-stop').hidden, true, 'the playback-only exit is reset');
    assert.equal(btn.focused, true, 'focus returns to the PREVIEW button');
    assert.equal(h.frames.length, 1, 'one more frame is asked for');
    h.frames[0]();
    assert.equal(h.frames[1], 'render:0', 'a paused race redraws its own frame over the garage');
  }
});
test('PREVIEW has a reachable touch exit outside the hidden sheet and releases the canvas before settings closes', () => {
  const h = previewHarness();
  const shell = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  const html = shell.slice(shell.indexOf('<div id="garrival"'), shell.indexOf('<!-- title layout editor:'));
  const nodes = new Map(), stack = [];
  // Follow the shipped ancestors, so an onclick on a hidden descendant cannot
  // masquerade as a reachable touch control (the original DONE regression).
  for (const tag of html.matchAll(/<\/?([a-z][a-z0-9-]*)\b[^>]*>/gi)) {
    if (tag[0].startsWith('</')) { stack.pop(); continue; }
    const id = /\bid="([^"]+)"/.exec(tag[0])?.[1];
    const node = { id, parent: stack.at(-1), hidden: /\bhidden\b/.test(tag[0]) };
    if (id) { nodes.set(id, node); h.$(id).hidden = node.hidden; }
    if (!['input', 'br', 'hr', 'img', 'meta', 'link'].includes(tag[1])) stack.push(node);
  }
  const reachable = (id) => {
    let node = nodes.get(id);
    if (!node) return false;
    for (; node; node = node.parent) if (node.id ? h.$(node.id).hidden : node.hidden) return false;
    return true;
  };
  h.$('garrival').hidden = false;
  Arrival.bindSettings(h.$, { get: () => null, set() {} }, { preview: h.start });
  const btn = h.$('ga-preview-in');
  assert.equal(reachable('ga-close'), true, 'DONE is reachable before playback');
  assert.equal(h.start('in', btn), true);
  assert.equal(reachable('ga-close'), false, 'DONE in the hidden sheet cannot be tapped');
  assert.equal(reachable('ga-preview-stop'), true, 'STOP has no hidden ancestor');
  assert.equal(h.$('ga-preview-stop').focused, true, 'keyboard focus moves out of the hidden sheet');
  h.$('ga-preview-stop').onclick();
  assert.equal(h.playing(), null);
  assert.equal(h.G.setupPreviewOn, false, 'touch stop releases preview ownership');
  assert.equal(h.$('garrival').hidden, false, 'stopping returns to the tuner');
  assert.equal(h.$('garrival-inner').hidden, false);
  assert.equal(reachable('ga-preview-stop'), false);
  assert.equal(btn.focused, true);
  h.$('ga-close').onclick();
  assert.equal(h.$('garrival').hidden, true, 'DONE now returns to settings');
  assert.equal(h.$('ga-preview-stop').hidden, true, 'closing settings leaves no playback control');
});
test('PREVIEW: Escape and DONE stop it; refused while the garage or the drive-out owns the room', () => {
  const h = previewHarness({ was: true });
  assert.equal(h.start('in'), true, 'plays with the enabled flag off and reduced motion ignored');
  assert.equal(h.start('out'), false, 'one at a time');
  const ev = { key: 'Escape', preventDefault() { this.dp = true; }, stopPropagation() { this.sp = true; } };
  for (const k of h.keys) k(ev);
  assert.equal(h.playing(), null, 'Escape stops it');
  assert.equal(h.$('ga-preview-stop').hidden, true, 'Escape hides the playback exit too');
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
  $('ga-preview-in').onclick(); $('ga-preview-out').onclick(); $('ga-preview-home').onclick();
  assert.deepEqual(calls, ['in', 'out', 'home']);
  $('ga-close').onclick();
  assert.equal($('garrival').hidden, false, 'DONE mid-playback stops it, the panel stays');
  $('ga-close').onclick();
  assert.equal($('garrival').hidden, true, 'the next DONE closes the tool');
  const shell = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
  assert.match(shell, /<button id="ga-preview-in" type="button">PREVIEW PIT STOP<\/button>\s*<button id="ga-preview-out" type="button">PREVIEW RACE START<\/button>/);
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
      menuSlice: async () => {}, performance: { now: () => 0 }, introNow: () => 0 };
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
  assert.match(game, /const heldWarm = !!\(_studio && _studio\.held && track && _menuGate\.warm > 0\); if \(heldWarm\) _menuGate\.warm--;[\s\S]{0,48}if \(setupPreviewOn && !heldWarm\)/,
    'a held warm frame takes the world path with the canvas left visible (TLX paints nothing while it kicks the warm)');
  assert.match(game, /FlybySeq\.reset\(\); warmPrograms\(\); _menuGate\.warm = 2;/, 'cold world frames run under the preparation card before motion');
  assert.match(game, /prepared = true;   \/\/ afterGarageOut closes the held garage, then the race\/session card/, 'introWarm hands off through afterGarageOut');
});
// Where a car corner's sight line from the eye crosses the door plane: inside the
// aperture (|x| < doorW / 2) it is seen through the door, outside it the front wall hides it.
function seenThroughDoor(p) {
  const [ex, , ez] = p.eye, DOOR_Z = TrackPit.BAY.depth / 2, HW = TrackPit.BAY.doorW / 2;
  const c = Math.cos(p.yaw), s = Math.sin(p.yaw);
  return [[2.8, 1], [2.8, -1], [-2.8, 1], [-2.8, -1]].some(([along, across]) => {
    const cx = p.x + along * s + across * c, cz = p.z + along * c - across * s;
    return Math.abs(ex + (cx - ex) * (DOOR_Z - ez) / (cz - ez)) < HW;
  });
}
test('the drive-out does not stop in view: it squares into the lane, leaves at the limiter, goes behind the front wall', () => {
  for (const angle of ['cut', 'left', 'right']) {
    const cfg = Arrival.settings({ angle }), at = (t) => Arrival.poseOut(t, cfg, true);
    assert.ok(Arrival.OUT_SETTLE < Arrival.OUT_DURATION, 'gone before the shot ends: a beat on the empty lane');
    let turned = 0;
    while (Math.abs(at(turned).yaw) < Math.PI / 2 - 1e-9) turned += 0.01;
    assert.ok(seenThroughDoor(at(turned)), angle + ': in the doorway as it squares into the lane');
    assert.ok(!seenThroughDoor(at(Arrival.OUT_SETTLE)), angle + ': behind the front wall when it settles, out of frame');
    let gone = turned;
    while (seenThroughDoor(at(gone))) gone += 0.01;
    assert.ok(gone - turned >= 1.2, `${angle}: seen leaving down the lane for ${(gone - turned).toFixed(2)} s, not a flash`);
    const v = (t) => Math.hypot(at(t + 0.05).x - at(t).x, at(t + 0.05).z - at(t).z) / 0.05;
    for (let t = turned; t + 0.05 <= Arrival.OUT_SETTLE + 1e-9; t += 0.05)
      assert.ok(Math.abs(v(t) - v(turned)) < 1e-6, 'one steady pit-limiter speed down the lane: no launch, no braking in view');
    const end = at(Arrival.OUT_SETTLE);
    assert.deepEqual([at(Arrival.OUT_SETTLE + 30).x, at(Arrival.OUT_SETTLE + 30).z], [end.x, end.z], 'then it holds, out of sight');
    assert.ok(Math.abs(end.aim[0]) <= 3.5 + 1e-9, 'the camera holds on the doorway, not on the wall it went behind');
  }
});
test('the empty-lane hold is a slow push toward the door, not a frozen frame; calm (reduce motion) holds still', () => {
  for (const angle of ['cut', 'right']) {
    const cfg = Arrival.settings({ angle }), S = Arrival.OUT_SETTLE;
    const a = Arrival.poseOut(S, cfg, true), b = Arrival.poseOut(S + 6, cfg, false), c = Arrival.poseOut(S + 60, cfg, false);
    assert.ok(b.eye[2] > a.eye[2] + 1 && c.eye[2] > b.eye[2], angle + ': the eye moves in toward the door while RACE! loads');
    assert.ok(c.eye[2] < 6.4 - 3 && Math.abs(c.eye[0]) < 5.4, 'and stops well inside the bay');
    const step = Math.hypot(...[0, 1, 2].map((i) => Arrival.poseOut(S + 0.02, cfg, true).eye[i] - a.eye[i]));
    assert.ok(step < 1e-9, 'calm: no push');
    assert.deepEqual(Arrival.poseOut(S + 60, cfg, true).eye, a.eye, 'calm: the hold is still');
  }
});
test('handheld sway: centimetres, both shots, and off when calm', () => {
  const cfg = Arrival.DEFAULT;
  for (const fn of [Arrival.pose, Arrival.poseOut]) {
    let max = 0;
    for (let t = 0; t < 8; t += 0.05) {
      const live = fn(t, cfg, false), calm = fn(t, cfg, true);
      max = Math.max(max, Math.hypot(live.eye[0] - calm.eye[0], live.eye[1] - calm.eye[1]));
      assert.equal(live.eye[2], calm.eye[2], 'never toward or away from the car');
      assert.ok(Math.abs(live.aim[0] - calm.aim[0]) < 0.05 && Math.abs(live.aim[1] - calm.aim[1]) < 0.05);
    }
    assert.ok(max > 0.01 && max < 0.05, `sway ${max.toFixed(3)} m: there, but small`);
  }
  const cam = readFileSync(new URL('../../js/garage/setup-camera.js', import.meta.url), 'utf8');
  assert.match(cam, /GarageArrival\.poseOut\(driveOut\.t, driveOut\.cfg, reducedMotion\(\)\)/, 'the RACE! drive-out is calm under reduce motion');
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
      Log: { warn() {} }, announce() { events.push(['failed']); }, gfx: { warming: () => warming }, performance: { now: () => now }, introNow: () => now,
      RaceEntryProfile: raceEntryProfileStub({ budgetMs: 30000, now: () => now }), PerfGov: PERF_GOV_STUB,
      UiExperience: UI_EXPERIENCE_STUB, isTimeTrial: () => false,
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
  // The cold paths' cover: prep scrim (card hidden) only when the sheet is not already covering.
  const cover = {}; const cv = { _introSheet: null, loadingScreen: { prep: () => { cover.card = (cover.card || 0) + 1; } }, studioSkip() {} };
  vm.createContext(cv); vm.runInContext(helpers + ';globalThis.setSheet = (v) => { _introSheet = v; };', cv);
  cv.introCover({}, 1); assert.equal(cover.card, 1, 'Data Hub JUMP IN and the rest: prep scrim, race card still hidden');
  cv.setSheet({ sheet: {}, btn: {}, label: '' }); cv.introCover({}, 1); assert.equal(cover.card, 1, 'from race settings: no prep plate, the sheet covers so the garage leave comes before the race card');
  // Wiring: every exit from preparation releases the sheet.
  assert.match(game, /if \(!built && introGarage\(go\)\) return;   \/\/ reduce-motion too: the garage-out at its tuned pace, then card \+ flyby \(never skip\)\n  \/\/ Strict: never raise the race\/session card while a garage-out is still live\./, 'so does the flyby (or a skipped garage) when there is no drive-out; live studio waits');
  assert.match(game, /function titleIfBare\(\) \{ sheetRelease\(false\);/, 'an abandoned intro gives the buttons back');
  assert.match(game, /function cancelIntro\(\) \{[^}]*sheetRelease\(false\); \}/, 'so does a quit');
  const build = game.slice(game.indexOf('function introBuild(go)'), game.indexOf('function introWarm(go)'));
  const warm = game.slice(game.indexOf('function introWarm(go)'), game.indexOf('function startRaceCovered()'));
  assert.match(build, /\n  introCover\(info0, n\);\n/, 'a cold build is covered by the sheet or prep scrim');
  assert.match(warm, /if \(cold\) introCover\(info, n\); else studioOpen\(n, info\);/, 'so is a cold warm');
  assert.match(game, /if \(!_introSheet \|\| sheetPrep\) loadingScreen\.prep\(info, \(\) => studioSkip\(n\)\);/, 'prep hides the race card until garage-out ends (software GL uses prep behind the race-settings sheet too)');
  const rs = readFileSync(new URL('../../js/race/race-settings.js', import.meta.url), 'utf8');
  const go = rs.slice(rs.indexOf('$("rs-go").onclick = () => {'), rs.indexOf('    }\n\n    return {'));
  assert.match(go, /raceIntro\(startRace, sheet, \$\("rs-go"\)\)/, 'race settings hands its sheet and button to the intro');
  assert.match(go, /const dismissSheet = \(\) => \{/, 'rs-go sync-dismisses the :modal dialog so #loading is not trapped under top layer');
  assert.ok(go.indexOf('dismissSheet();') > go.indexOf('if (netRoom) {'), 'and does not close the sheet before routing');
  assert.match(game, /buildStandings, raceIntro: raceIntroFromSheet,/, 'game.js wires the sheet-covering intro into race settings');
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
    _warmKey: 'world', flybyBuildTimer: 0, _carWarm: { busy: false },
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
      prep() { phase = 'prep'; events.push('prep-cover'); },
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
    RaceEntryProfile: raceEntryProfileStub({ budgetMs: 1e9, now: () => now }),
    PerfGov: PERF_GOV_STUB, UiExperience: UI_EXPERIENCE_STUB, isTimeTrial: () => false,
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
  vm.runInContext(readFileSync(new URL('../../js/garage/crew-draw.js', import.meta.url), 'utf8'), c, { filename: absSrc('js/garage/crew-draw.js') });
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
    RaceEntryProfile: raceEntryProfileStub({ budgetMs: 30000, now: () => clock }),
    PerfGov: PERF_GOV_STUB, UiExperience: UI_EXPERIENCE_STUB, isTimeTrial: () => false,
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

// Run the production rAF tick, RenderRate gate and garage dispatch into the
// actual arrival/preview clocks. Calling Arrival.step(0.1) alone misses the
// outer render clamp which used to halve playback speed at 10 FPS.
function arrivalTickHarness({ paused = false, preview = false, garage = true, rate = 'auto' } = {}) {
  const game = readFileSync(new URL('../../js/game.js', import.meta.url), 'utf8');
  const camera = readFileSync(new URL('../../js/garage/setup-camera.js', import.meta.url), 'utf8');
  const { $, arrival } = harness();
  const noop = () => {};
  const c = { $, arrival, GarageArrival: Arrival, Log: { info: noop },
    lastFrame: 0, paused, setupPreviewOn: garage && !preview, state: paused || !garage ? 'race' : 'menu',
    headlessMode: false, track: null, player: null, cars: [], soundOn: false, raceT: 0,
    _poseAt: null, _audioParamStep: true, _carWarm: { busy: false }, _studio: null,
    _menuGate: { warm: 0, garageWarm: 0 }, _softEl: null, canvas: { style: {} },
    loadingScreen: { phase: () => '', lowerWaitPlate: noop, active: () => false },
    gfx: { warming: () => false, resize: noop },
    uiExperience: { renderHome: () => false, trackActive: () => false },
    UiExperience: { resumeHolding: () => false }, PerfGov: { tick: noop }, PerfSpans: { begin: noop, end: noop },
    mirrorPass: { preparing: () => false, cancelPreparation: noop },
    Input: { poll: noop, clearEdges: noop, setTimeScale: noop }, BrakeCue: { tick: noop },
    onboard: { tick: noop }, netPlay: { tick: noop, active: () => false }, director: { tick: noop },
    replayBuf: { isScrubbing: () => false, tickScrub: noop, onTick: noop }, banner: { tick: noop },
    feel: { hitStop: 0 }, frozen: true, raceRestarting: false, physAcc: 0, PHYS_DT: 1 / 60, renderAlpha: 1,
    clamp: (v, lo, hi) => Math.max(lo, Math.min(hi, v)), photoMode: false,
    GameAudio: { feedReplayScrub: noop }, naturalGear: noop, rpmFor: noop, rivalAudio: null, isWetRoad: noop, vTop: noop,
    XrBoot: { comfort: () => false }, updateHud: noop,
    els: { overlay: { hidden: true }, lighting: { hidden: false }, camtune: { hidden: true }, flyby: { hidden: true }, pmsettings: { hidden: true } },
    home: { active: false }, driveOut: null, endHome: noop, sequenceLook: noop, reducedMotion: () => false,
    pinGarageRes: noop, endGarageRes: noop, setupCam: { endGarageRes: noop }, studioShown: noop,
    window: { addEventListener: noop }, requestAnimationFrame: noop,
    previewFrames: [], worldFrames: [],
  };
  c.G = { get setupPreviewOn() { return c.setupPreviewOn; }, set setupPreviewOn(v) { c.setupPreviewOn = v; }, store: { get: () => null } };
  vm.createContext(c);
  vm.runInContext(readFileSync(new URL('../../js/perf/render-rate.js', import.meta.url), 'utf8'), c);
  vm.runInContext(`RenderRate.init({ isMobile: true }); RenderRate.setMode(${JSON.stringify(rate)});`, c);
  const previewStart = camera.indexOf('// THE ARRIVAL PREVIEW'), previewEnd = camera.indexOf('const arrivalCar', previewStart);
  assert.ok(previewStart >= 0 && previewEnd > previewStart);
  vm.runInContext(camera.slice(previewStart, previewEnd), c);
  const dispatchStart = camera.indexOf('function renderSetupPreview(dt,'), dispatchEnd = camera.indexOf('\n  if (!home.active &&', dispatchStart);
  assert.ok(dispatchStart >= 0 && dispatchEnd > dispatchStart);
  vm.runInContext(camera.slice(dispatchStart, dispatchEnd) + '\n  previewFrames.push({ dt, pose: arriving }); return true;\n}', c);
  const renderStart = game.indexOf('function render(dt) {'), renderEnd = game.indexOf('  setupCam.endGarageRes();', renderStart);
  const lostStart = game.lastIndexOf('function gfxContextLost()', renderStart);
  assert.ok(lostStart >= 0 && renderStart > lostStart && renderEnd > renderStart);
  vm.runInContext(game.slice(lostStart, renderEnd) + '\n worldFrames.push(dt);\n}', c);
  const tickStart = game.indexOf('function tickBody(now) {'), tickEnd = game.indexOf('\n// ---------- car setup panel', tickStart);
  assert.ok(tickStart >= 0 && tickEnd > tickStart);
  vm.runInContext(game.slice(tickStart, tickEnd), c);
  if (preview) assert.equal(vm.runInContext("startArrivalPreview('in')", c), true);
  else if (garage) arrival.start();
  return { c, arrival, tick: (ms) => c.tickBody(ms),
    playing: () => preview ? !!vm.runInContext('preview', c) : arrival.state.active,
    pose: () => c.previewFrames.at(-1)?.pose };
}

test('the real menu tick keeps WORK ON CAR arrivals at their authored pace at 10 and 60 FPS', () => {
  for (const [rate, fps] of [['auto', 10], ['auto', 60], ['30', 10], ['30', 60], ['half', 60]]) {
    const h = arrivalTickHarness({ rate });
    for (let i = 1; i <= fps * 5; i++) h.tick(i * 1000 / fps);
    const expected = Arrival.pose(5, Arrival.DEFAULT);
    assert.ok(Math.abs(h.pose().z - expected.z) < 1e-8, `${rate}/${fps} FPS: five wall seconds reach the same authored position`);
    let frame = fps * 5;
    while (h.playing() && frame < fps * 20) h.tick(++frame * 1000 / fps);
    assert.ok(Math.abs(frame / fps - Arrival.DURATION) <= 0.21,
      `${rate}/${fps} FPS: finishes in ${frame / fps}s, rather than slow motion`);
    assert.equal(h.arrival.state.z, 0);
  }
});

test('the real paused tick keeps settings PREVIEW IN at wall pace on a slow phone', () => {
  for (const fps of [10, 60]) {
    const h = arrivalTickHarness({ paused: true, preview: true });
    for (let i = 1; i <= fps * 5; i++) h.tick(i * 1000 / fps);
    const expected = Arrival.pose(5, Arrival.DEFAULT);
    assert.ok(Math.abs(h.pose().z - expected.z) < 1e-8, `${fps} FPS: preview advances five authored seconds`);
    let frame = fps * 5;
    while (h.playing() && frame < fps * 20) h.tick(++frame * 1000 / fps);
    assert.ok(Math.abs(frame / fps - Arrival.DURATION) <= 0.11, `${fps} FPS: preview ends at the saved speed`);
    assert.equal(h.c.setupPreviewOn, false);
  }
});

test('garage ticks retain the 100 ms background-stall bound and other render paths retain 50 ms', () => {
  for (const paused of [false, true]) {
    const h = arrivalTickHarness({ paused });
    h.tick(60000);
    assert.equal(h.c.previewFrames.length, 1);
    assert.equal(h.c.previewFrames[0].dt, 0.1, 'a minute-long background gap is only one bounded garage step');
    assert.equal(h.arrival.state.door, Arrival.pose(0.1).door);
    assert.equal(h.arrival.state.active, true);
    const world = arrivalTickHarness({ paused, garage: false });
    world.tick(60000);
    assert.deepEqual(world.c.worldFrames, [0.05], 'world and paused-camera visual damping stay at 50 ms');
  }
});


test('garage aero keeps authored opening and closing rates at 10, 20 and 60 FPS', () => {
  const camera = readFileSync(new URL('../../js/garage/setup-camera.js', import.meta.url), 'utf8');
  const start = camera.indexOf('function stepSetupAero(dt) {');
  const end = camera.indexOf('function setSetupAero(on, opts)', start);
  assert.ok(start >= 0 && end > start, 'exercise the production garage aero step');
  const c = vm.createContext({ window: {}, setupPreviewXOn: true, setupPreviewAeroX: 0,
    clamp: (v, lo, hi) => Math.max(lo, Math.min(hi, v)) });
  vm.runInContext(readFileSync(new URL('../../js/physics/consts.js', import.meta.url), 'utf8'), c);
  vm.runInContext('const { X_OPEN_RATE, X_CLOSE_RATE } = window.PhysicsConsts;' + camera.slice(start, end), c);
  const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 1e-12,
    `${label}: ${actual} versus ${expected}`);
  for (const fps of [10, 20, 60]) {
    c.setupPreviewXOn = true; c.setupPreviewAeroX = 0;
    for (let i = 0; i < fps / 5; i++) c.stepSetupAero(1 / fps);
    near(c.setupPreviewAeroX, c.window.PhysicsConsts.X_OPEN_RATE * 0.2, `${fps} FPS opening`);
    for (let i = 0; i < fps; i++) c.stepSetupAero(1 / fps);
    assert.equal(c.setupPreviewAeroX, 1, 'opening reaches the endpoint without overshoot');
    c.setupPreviewXOn = false;
    for (let i = 0; i < fps / 10; i++) c.stepSetupAero(1 / fps);
    near(c.setupPreviewAeroX, 1 - c.window.PhysicsConsts.X_CLOSE_RATE * 0.1, `${fps} FPS closing`);
    for (let i = 0; i < fps; i++) c.stepSetupAero(1 / fps);
    assert.equal(c.setupPreviewAeroX, 0, 'closing reaches the endpoint without overshoot');
  }
  c.setupPreviewXOn = true; c.setupPreviewAeroX = 0;
  c.stepSetupAero(60);
  near(c.setupPreviewAeroX, c.window.PhysicsConsts.X_OPEN_RATE * 0.1, 'background gap bounds opening');
  c.setupPreviewXOn = false; c.setupPreviewAeroX = 1;
  c.stepSetupAero(60);
  near(c.setupPreviewAeroX, 1 - c.window.PhysicsConsts.X_CLOSE_RATE * 0.1, 'background gap bounds closing');
});

test('entry and departure crew choices save independently and fall back safely for old settings', () => {
  const { $ } = harness(); let saved = null;
  const read = Arrival.bindSettings($, { get: () => saved, set: (_, value) => { saved = value; } });
  // MIX (a new crew each visit) is the default since A·W49's Blender variants.
  assert.equal(read().enterCrew, 'mix'); assert.equal(read().leaveCrew, 'mix');
  $('ga-crew-in').value = 'welcome'; $('ga-crew-in').onchange();
  $('ga-crew-out').value = 'guides'; $('ga-crew-out').onchange();
  assert.equal(Arrival.pose(2, read(), true).crew, 'welcome');
  assert.equal(Arrival.poseOut(2, read(), true).crew, 'guides');
  $('ga-crew-out').value = 'none'; $('ga-crew-out').onchange();
  assert.equal(read().enterCrew, 'welcome'); assert.equal(Arrival.poseOut(2, read(), true).crew, 'none');
  assert.equal(Arrival.settings({ enterCrew: 'unknown', leaveCrew: 3 }).leaveCrew, 'mix');
  $('ga-reset').onclick(); assert.equal(saved, null); assert.equal(read().enterCrew, 'mix');
});


test('service entry completion uses the extended duration and skips to a finished parked state', () => {
  const { $ }=harness();const cfg=Arrival.settings({enterCrew:'service'}), arrival=Arrival.create($,()=>false,()=>cfg);
  arrival.start();for(let i=0;i<88;i++)arrival.step(.1);
  assert.equal(arrival.state.active,true);assert.equal(arrival.state.z,0);assert.equal($('cs-inner').inert,true);
  $('cs-arrival-skip').onclick();assert.equal(arrival.state.active,false);assert.equal(arrival.state.seconds,Arrival.duration(cfg));assert.equal($('cs-inner').inert,false);
});
// #3511: on a GPU drawing one frame every 2 s the render dt reaching step() is
// capped at 0.1 s, so the arrival — and the inert setup sheet — ran at 1/20 of
// wall time (≈ 3 min for the 8.7 s cinematic). It now ends on the wall clock;
// the 6 s and crew-service (14.7 s) cases follow Merlin's #3546 tests.
test('slow GPU: arrival and the inert sheet end on wall time, not frame count (#3511)', () => {
  const service = Arrival.settings({ enterCrew: 'service' });
  for (const [frameS, cfg] of [[6, Arrival.DEFAULT], [2, Arrival.DEFAULT], [1, Arrival.DEFAULT], [0.5, Arrival.DEFAULT], [0.25, Arrival.DEFAULT], [2, service]]) {
    const { $ } = harness(), clock = { t: 100 };
    const arrival = Arrival.create($, () => false, () => cfg, () => clock.t);
    arrival.start(); assert.equal($('cs-inner').inert, true);
    let frames = 0;
    while (arrival.state.active && frames < 10000) { clock.t += frameS; arrival.step(0.1); frames++; }
    const wall = frames * frameS, want = Arrival.duration(cfg);
    assert.equal($('cs-inner').inert, false, `inert released at ${frameS}s frames`);
    // one frame seeds the clock, and a frame credits at most 2.5 s (MAX_GAP_S)
    const bound = (Math.ceil(want / Math.min(frameS, 2.5)) + 1) * frameS;
    assert.ok(wall <= bound + 1e-9, `${frameS}s frames: sheet inert ${wall.toFixed(1)}s of wall time, authored ${want.toFixed(1)}s`);
  }
});
test('slow GPU clock: a suspended-tab gap still cannot swallow the arrival (#3511)', () => {
  const { $ } = harness(), clock = { t: 0 };
  const arrival = Arrival.create($, () => false, () => Arrival.DEFAULT, () => clock.t);
  arrival.start(); clock.t += 600; arrival.step(0.1);
  assert.equal(arrival.state.active, true); assert.equal($('cs-inner').inert, true);
  clock.t += 2; arrival.step(0.1); assert.equal(arrival.state.active, true);
});
test('a slow entry frame or a short hitch cannot skip the arrival (#3511 review)', () => {
  const { $ } = harness(), clock = { t: 0 };
  const arrival = Arrival.create($, () => false, () => Arrival.DEFAULT, () => clock.t);
  arrival.start(); clock.t += 6; arrival.step(0.1);   // the entry frame took 6 s (pack upload)
  assert.ok(arrival.state.seconds <= 0.1 + 1e-9, `entry frame credited ${arrival.state.seconds}s`);
  clock.t += 5; arrival.step(0.1);                     // a 5 s app switch mid-arrival
  assert.ok(arrival.state.seconds <= 0.1 + 2.5 + 1e-9, `hitch credited ${arrival.state.seconds}s`);
  assert.equal(arrival.state.active, true);
});

test('arrival-poses.mjs (the Blender previz feed) samples the same poses, parked at the end of the arrival', async () => {
  const { loadArrival, sample } = await import('../../tools/garage/arrival-poses.mjs');
  const { Arrival: A, bay } = loadArrival();
  assert.equal(bay.doorW, TrackPit.BAY.doorW);
  for (const dir of ['in', 'out']) {
    const clip = sample(A, { dir, angle: 'cut', fps: 12 });
    const cfg = Arrival.settings({ angle: 'cut' }), fn = dir === 'out' ? Arrival.poseOut : Arrival.pose;
    assert.equal(clip.frames.at(-1).t, Math.round(Arrival.duration(cfg, dir) * 1000) / 1000);
    for (const [i, f] of clip.frames.entries()) {
      if (i % 7 || i === clip.frames.length - 1) continue;
      const p = fn(i / 12, cfg, false);   // the exact sample time; f.t is rounded
      assert.ok(Math.abs(p.x - f.x) < 1e-3 && Math.abs(p.z - f.z) < 1e-3 && Math.abs(p.eye[0] - f.eye[0]) < 1e-3, `${dir} t=${f.t}`);
    }
  }
  const last = sample(A, { dir: 'in' }).frames.at(-1);
  assert.deepEqual([last.x, last.z, last.yaw], [0, 0, 0]);
});

test('a covered PREP menu with no owed warm frames still presents for a queued warm of the current menu world', () => {
  const body = introGameSource.slice(introGameSource.indexOf('function render(dt) {'));
  const q = body.indexOf('const warmQueuedHere = !!(track && menuWorld() && gfx.warmQueued && gfx.warmQueued());');
  const guard = body.indexOf('if (menuBlank && !(track && _menuGate.warm > 0) && !warmQueuedHere) return;');
  assert.ok(q > 0 && guard > q && body.indexOf('!(gfx.warmQueued && gfx.warmQueued()) && --_menuGate.warm === 0') > guard);
});

// ── CAMERAS, SHOT LENGTHS, AFTER THE RACE (#garrival's 2026-10-30 controls) ──
test('every camera, preset and sequence keeps the eye inside the bay and ends where the sequence ends', () => {
  const seqs = [['in', null], ['out', null]].concat(Object.keys(Arrival.RESULTS).map((r) => ['home', r]));
  for (const angle of Arrival.ANGLES) for (const [dir, result] of seqs) for (const calm of [true, false]) for (const [height, move] of [[-1, 'push'], [0, 'still'], [1.5, 'pull'], [0.5, 'drift']]) {
    const cfg = Object.assign(Arrival.settings({ angle, height, move, sway: 2, zoom: 20, shots: ['door', 'high', 'low'], enterCrew: 'none', leaveCrew: 'none', homeCrew: 'none', result }), { pos: 4 });
    const fn = Arrival.poseFor(dir), end = Arrival.duration(cfg, dir);
    for (let t = 0; t <= end + 0.5; t += 0.05) {
      const p = fn(t, cfg, calm), tag = `${angle} ${dir}${result ? ':' + result : ''} t${t.toFixed(2)}`;
      assert.ok(p.eye[0] > -5.4 && p.eye[0] < 5.4 && p.eye[2] > -6.4 && p.eye[2] < 6.4, tag + ': eye inside the walls');
      assert.ok(p.eye[1] > 0.25 && p.eye[1] < 3.65, tag + ': eye above the floor and under the overhead rig');
      assert.ok(p.aim.every(Number.isFinite) && [p.x, p.z, p.yaw].every(Number.isFinite), tag + ': finite');
      assert.ok(p.camera in Arrival.CAMS, tag + ': a known camera');
    }
    const last = fn(end + 0.5, cfg, true);
    assert.equal(last.active, false);
    if (dir !== 'out') assert.deepEqual([last.x + 0, last.z + 0, last.yaw + 0], [0, 0, 0], `${angle} ${dir}: parked`);
  }
});
test('presets cut on the shot boundaries; CUSTOM films each shot with its own camera', () => {
  const cfg = Arrival.settings({ angle: 'custom', shots: ['high', 'low', 'door'], enterCrew: 'none', leaveCrew: 'none' });
  const T = Arrival.timeline(cfg, 'in');
  assert.equal(Arrival.pose(T.door - 0.01, cfg).camera, 'high', 'shot 1: the shutter');
  assert.equal(Arrival.pose(T.door + 0.01, cfg).camera, 'low', 'shot 2: up the lane');
  assert.equal(Arrival.pose(T.door + T.lane + T.pause + 0.01, cfg).camera, 'door', 'shot 3: the back-in');
  const O = Arrival.timeline(cfg, 'out'), go = O.door + O.hold;
  assert.equal(Arrival.poseOut(go - 0.01, cfg).camera, 'high');
  assert.equal(Arrival.poseOut(go + 0.5, cfg).camera, 'low', 'shot 2: rolling to the doorway');
  assert.equal(Arrival.poseOut(O.settle, cfg).camera, 'door', 'shot 3: out of the door and away');
  assert.deepEqual([...Arrival.shotsFor(Arrival.settings({ angle: 'cut' }), 'in')], ['left', 'right', 'right'], 'the shipped cut (VM-realm arrays spread)');
  assert.deepEqual([...Arrival.shotsFor(Arrival.settings({ angle: 'high' }), 'out')], ['high', 'high', 'high']);
  assert.equal(new Set(Arrival.shotsFor(Arrival.settings({ angle: 'director' }), 'in')).size, 3, 'DIRECTOR uses three cameras');
  // The car turns away from the eye that watches it: a left-side last shot sends it right (+1).
  assert.equal(Arrival.pose(T.park - 0.5, Arrival.settings({ angle: 'high' })).side, 1);
  assert.equal(Arrival.pose(T.park - 0.5, Arrival.settings({ angle: 'low' })).side, -1);
  // The map lights one eye per camera used, numbered by the first shot it films.
  const lit = (svg) => svg.split('fill="#e10600"').length - 1;
  assert.equal(lit(Arrival.angleMap('director')), 3);
  assert.equal(lit(Arrival.angleMap('custom', ['low', 'low', 'low'])), 1);
  const nums = (svg) => [...svg.matchAll(/>(\d)<\/text>/g)].map((m) => m[1]).sort().join('');
  assert.equal(nums(Arrival.angleMap('custom', ['door', 'high', 'door'])), '12', 'two eyes, labelled by the first shot each films');
});
test('SHUTTER SHOT, HOLD BEAT, CAR SPEED and END BEAT set the shot lengths; defaults are the shipped timing', () => {
  const base = Arrival.settings(null), none = { enterCrew: 'none', leaveCrew: 'none' };
  assert.equal(Arrival.timeline(base, 'in').base, Arrival.DURATION, 'default in');
  assert.equal(Arrival.timeline(base, 'out').settle, Arrival.OUT_SETTLE, 'default out');
  assert.equal(Arrival.timeline(base, 'out').base, Arrival.OUT_DURATION);
  const slow = Arrival.settings(Object.assign({ door: 3.5, hold: 2, carSpeed: 0.5, endBeat: 3 }, none));
  const a = Arrival.timeline(base, 'in'), b = Arrival.timeline(slow, 'in');
  assert.equal(b.door, 3.5); assert.equal(b.pause, 2);
  assert.ok(Math.abs(b.lane - 2 * a.lane) < 1e-9 && Math.abs(b.back - 2 * a.back) < 1e-9, 'half the car speed, twice the drive');
  assert.ok(Math.abs(b.base - (b.park + 0.3 + 3)) < 1e-9, 'the end beat lingers on the last shot');
  assert.equal(Arrival.pose(3.5, slow).door, 1, 'the shutter is up exactly at the end of SHUTTER SHOT');
  assert.ok(Arrival.pose(3.4, slow).door < 1);
  const fast = Arrival.settings(Object.assign({ carSpeed: 2, hold: 0 }, none)), o1 = Arrival.timeline(base, 'out'), o2 = Arrival.timeline(fast, 'out');
  assert.equal(o2.hold, 0); assert.ok(Math.abs(o2.run - o1.run / 2) < 1e-9 && Math.abs(o2.v - 2 * o1.v) < 1e-9, 'twice as fast out');
  assert.ok(Arrival.duration(fast, 'out') < Arrival.duration(base, 'out'));
  // Every shot length is clamped; HOLD keeps null (AUTO) apart from 0 (NONE).
  const wild = Arrival.settings({ door: 99, hold: -4, carSpeed: 0, endBeat: 50, height: 9, shots: ['moon', 'high', 1] });
  assert.deepEqual([wild.door, wild.hold, wild.carSpeed, wild.endBeat, wild.height], [4, 0, 0.5, 3, 1.5]);
  assert.deepEqual([...wild.shots], ['left', 'high', 'right'], 'an unknown camera falls back to the shipped one for that shot');
  assert.equal(Arrival.settings({ hold: 'x' }).hold, null);
  assert.equal(Arrival.settings({ angle: 'director' }).angle, 'director');
});
test('AFTER THE RACE: the result sets the drive, the beats, the crew and the captions', () => {
  assert.deepEqual([[1, false], [2, false], [3, false], [7, false], [10, false], [11, false], [9, false, true], [8, false, true], [1, true]].map(([p, out, sprint]) => Arrival.resultKind(p, out, sprint)),
    ['win', 'podium', 'podium', 'points', 'points', 'finish', 'finish', 'points', 'dnf']);
  const cfg = (result, extra) => Object.assign(Arrival.settings({ result, homeCrew: 'none' }), extra);
  const d = (r) => Arrival.duration(cfg(r), 'home');
  assert.ok(d('win') > d('podium') && d('podium') > d('points') && d('points') > d('finish'), 'a better result lingers longer');
  assert.ok(Math.abs(d('finish') - Arrival.DURATION) < 1e-9, 'a plain finish is the pit-stop arrival\'s length');
  // A retired car is pushed: no engine, and it starts from rest (smoothstep, not the braking curve).
  const dnf = cfg('dnf'), T = Arrival.timeline(dnf, 'home');
  const p0 = Arrival.poseHome(T.door, dnf, true), p1 = Arrival.poseHome(T.door + 0.1, dnf, true);
  assert.equal(p1.engine, false);
  assert.ok(Math.abs(p1.x - p0.x) < 0.05, 'pushed from a standstill');
  const fin = cfg('finish'), F = Arrival.timeline(fin, 'home');
  assert.ok(Math.abs(Arrival.poseHome(F.door + 0.1, fin, true).x - Arrival.poseHome(F.door, fin, true).x) > 0.5, 'a running car arrives at the limiter');
  assert.equal(Arrival.poseHome(F.door + 0.1, fin).engine, true);
  const win = cfg('win', { pos: 1 }), W = Arrival.timeline(win, 'home');
  assert.equal(Arrival.poseHome(W.door + 0.2, win).label, 'RACE WINNER · COMING HOME');
  assert.equal(Arrival.poseHome(W.park + 0.5, win).label, 'P1 · RACE WINNER');
  assert.equal(Arrival.poseHome(T.park + 0.2, cfg('dnf', { pos: 18 })).label, 'RETIRED', 'no position on a retirement');
  assert.equal(Arrival.poseHome(1, win).sequence, 'home'); assert.equal(Arrival.poseHome(1, win).direction, 'in', 'the crew reads it as an arrival');
  // HOME CREW AUTO picks by result; an explicit crew wins.
  assert.equal(Arrival.crewFor(Arrival.settings({ result: 'win' }), 'home'), 'welcome');
  assert.equal(Arrival.crewFor(Arrival.settings({ result: 'dnf' }), 'home'), 'guides');
  assert.equal(Arrival.crewFor(Arrival.settings({ result: 'win', homeCrew: 'none' }), 'home'), 'none');
});
test('the WORK ON CAR player plays AFTER THE RACE when started with a result, with its own sheet lock and skip', () => {
  const { $, arrival } = harness();
  arrival.start({ home: { result: 'podium', pos: 3 } });
  assert.equal($('cs-inner').inert, true);
  assert.equal(arrival.state.sequence, 'home');
  const end = Arrival.duration(Object.assign(Arrival.settings(null), { result: 'podium' }), 'home');
  for (let i = 0; i < Math.ceil(end / 0.1) + 2; i++) arrival.step(0.1);
  assert.equal(arrival.state.active, false); assert.equal(arrival.state.label, 'P3 · PODIUM FINISH');
  assert.equal($('cs-inner').inert, false);
  arrival.start(); assert.equal(arrival.state.sequence, 'in', 'a plain start() is the pit stop again');
});
test('the tuner binds the camera, shot-length and after-race controls; CUSTOM reveals its shot pickers', () => {
  const { $ } = harness();
  let saved = null;
  const read = Arrival.bindSettings($, { get: () => saved, set: (_, value) => { saved = value; } });
  assert.equal($('ga-shots-row').hidden, true, 'per-shot pickers hide under a preset');
  $('ga-angle').value = 'custom'; $('ga-angle').onchange();
  assert.equal($('ga-shots-row').hidden, false);
  $('ga-shot2').value = 'high'; $('ga-shot2').onchange();
  for (const [id, v] of [['ga-height', '0.5'], ['ga-door', '2.5'], ['ga-hold', '1'], ['ga-carspeed', '0.75'], ['ga-endbeat', '2'], ['ga-crew-home', 'service'], ['ga-result', 'dnf']]) { $(id).value = v; $(id).onchange(); }
  $('ga-after').checked = false; $('ga-after').onchange();
  const v = read();
  assert.deepEqual([v.angle, v.shots[1], v.height, v.door, v.hold, v.carSpeed, v.endBeat, v.homeCrew, v.result, v.afterRace],
    ['custom', 'high', 0.5, 2.5, 1, 0.75, 2, 'service', 'dnf', false]);
  $('ga-hold').value = 'auto'; $('ga-hold').onchange();
  assert.equal(read().hold, null, 'AUTO is the sequence\'s own beat');
  assert.equal($('ga-hold').value, 'auto');
});
test('the extra tuner rows are built from tables, once, after GARAGE ANGLE and FIELD OF VIEW', () => {
  const dom = makeDom(), doc = dom.document;
  const ctx = vm.createContext({ document: doc, GarageScene: { MOODS: { shipped: {}, goldenhour: {}, night: {} } } });
  for (const f of ['js/garage/crew-draw.js', 'js/garage/arrival.js']) vm.runInContext(readFileSync(new URL('../../' + f, import.meta.url), 'utf8'), ctx, { filename: absSrc(f) });
  const A = vm.runInContext('GarageArrival', ctx), rows = doc.getElementById('ga-rows');
  const add = (parent, tag, id) => { const e = doc.createElement(tag); if (id) e.id = id; parent.appendChild(e); return e; };
  const row = (id, tag) => { const r = add(rows, 'div'); r.className = 'set-row'; const cell = add(r, 'div'); return add(cell, tag, id); };
  const angle = row('ga-angle', 'select');
  for (const v of ['cut', 'left', 'right']) add(angle, 'option').value = v;
  row('ga-crew-in', 'select'); row('ga-fov', 'input'); row('ga-crew-out', 'select');
  const foot = add(doc.getElementById('garrival-inner'), 'div');
  for (const id of ['ga-preview-in', 'ga-preview-out', 'ga-reset']) add(foot, 'button', id);
  const $ = (id) => doc.getElementById(id);
  A.bindSettings($, { get: () => null, set() {} });
  A.bindSettings($, { get: () => null, set() {} });
  assert.deepEqual(angle.children.map((o) => o.value), [...A.ANGLES], 'every preset offered, once');
  const order = rows.children.map((r) => r.id || (r.querySelector('select, input') || r).id || r.tagName);
  const at = (id) => order.indexOf(id);
  assert.ok(at('ga-angle') < at('ga-shots-row') && at('ga-shots-row') < at('ga-height') && at('ga-height') < at('ga-crew-in'), order.join(' '));
  assert.ok(at('ga-fov') < at('ga-door') && at('ga-door') < at('ga-result') && at('ga-result') < at('ga-crew-out'), 'shot lengths and AFTER THE RACE follow FIELD OF VIEW');
  const shots = $('ga-shots-row');
  assert.equal(shots.hidden, true, 'CUSTOM\'s pickers start hidden');
  assert.deepEqual(shots.querySelectorAll('select').map((e) => e.id), ['ga-shot1', 'ga-shot2', 'ga-shot3']);
  assert.deepEqual($('ga-shot2').children.map((o) => o.value), [...A.CAM_IDS]);
  assert.equal($('ga-after').type, 'checkbox');
  assert.deepEqual($('ga-light').children.map((o) => o.textContent), ['AS THE GARAGE', 'STANDARD', 'GOLDEN HOUR', 'NIGHT'], 'the garage\'s own moods');
  assert.deepEqual($('ga-light-home').children.map((o) => o.value).slice(0, 2), ['auto', 'asset']);
  for (const id of ['ga-move', 'ga-sway', 'ga-zoom', 'ga-swell']) assert.equal($(id).tagName, 'SELECT', id);
  for (const id of ['ga-captions', 'ga-bars']) assert.equal($(id).type, 'checkbox', id);
  assert.deepEqual(foot.children.map((b) => b.id), ['ga-preview-in', 'ga-preview-out', 'ga-preview-home', 'ga-reset'], 'PREVIEW AFTER RACE joins the other previews');
  assert.equal(rows.querySelector('label[for="ga-carspeed"]').textContent, 'CAR SPEED');
});
test('endRace notes the result; the next non-pit garage visit plays it once (gated, never for the harness)', () => {
  const cam = readFileSync(new URL('../../js/garage/setup-camera.js', import.meta.url), 'utf8');
  const src = cam.slice(cam.indexOf('// AFTER THE RACE: endRace notes'), cam.indexOf('const arrivalCar'));
  let now = 1000, saved = null, automation = false;
  const started = [], player = { retired: false };
  const c = vm.createContext({ GarageArrival: Arrival, G: { player, store: { get: () => saved } }, endHome() {}, performance: { now: () => now },
    RaceCeremony: { eligible: (_, m) => !m.duel }, LoadingScreen: { isAutomation: () => automation }, arrival: { start: (o) => started.push(o.home) } });
  vm.runInContext(src, c, { filename: absSrc('js/garage/setup-camera.js') });
  const note = vm.runInContext('noteResult', c), home = vm.runInContext('startHome', c);
  const order = [{}, player, {}];
  assert.deepEqual(note(order, {}).result, 'podium');
  assert.equal(home('pit'), false, 'a pit stop is not the way home');
  assert.equal(home('menu'), true);
  assert.deepEqual([started[0].result, started[0].pos], ['podium', 2]);
  assert.equal(home('menu'), false, 'once');
  assert.equal(note(order, { duel: true }), null, 'not after a session the ceremony skips');
  player.retired = true; note(order, {}); player.retired = false;
  saved = { afterRace: false }; assert.equal(home('career'), false, 'PLAY AFTER A RACE off'); saved = null;
  note(order, {}); now += 31 * 60e3; assert.equal(home('select'), false, 'stale after half an hour');
  note(order, {}); automation = true; assert.equal(home('select'), false, 'the harness never waits on it');
});

test('CAMERA MOVE, HANDHELD and FINAL SHOT ZOOM shape each shot; reduce motion and the defaults leave the shipped framing', () => {
  const base = { angle: 'high', enterCrew: 'none', leaveCrew: 'none' };
  const at = (extra, t, calm = false) => Arrival.pose(t, Arrival.settings(Object.assign({}, base, extra)), calm);
  const T = Arrival.timeline(Arrival.settings(base), 'in'), s2 = T.door + T.lane + T.pause;
  const dist = (p) => Math.hypot(p.aim[0] - p.eye[0], p.aim[1] - p.eye[1], p.aim[2] - p.eye[2]);
  const still = (t) => at({ move: 'still', sway: 0 }, t);
  assert.ok(dist(at({ move: 'push', sway: 0 }, T.door - 0.01)) < dist(still(T.door - 0.01)) - 1, 'PUSH IN ends shot 1 a metre-plus closer');
  assert.ok(Math.abs(dist(at({ move: 'push', sway: 0 }, 0.001)) - dist(still(0.001))) < 0.01, 'and starts where STILL does');
  assert.ok(dist(at({ move: 'pull', sway: 0 }, 0.001)) < dist(still(0.001)) - 1, 'PULL OUT starts close');
  const d0 = at({ move: 'drift', sway: 0 }, T.door + 0.01), d1 = at({ move: 'drift', sway: 0 }, s2 - 0.01);
  assert.ok(Math.hypot(d1.eye[0] - d0.eye[0], d1.eye[2] - d0.eye[2]) > 0.6, 'DRIFT crosses the shot');
  assert.deepEqual([...at({ move: 'push', sway: 0 }, T.door - 0.01, true).eye], [...Arrival.CAMS.high], 'reduce motion: no move');
  assert.deepEqual([...at({ sway: 0 }, 3.3).eye], [...Arrival.CAMS.high], 'HANDHELD OFF holds the eye still');
  const sway = (a) => at({ sway: a }, 3.3).eye[0] - Arrival.CAMS.high[0];
  assert.ok(Math.abs(sway(2) - 2 * sway(1)) < 1e-12 && sway(1) !== 0, 'HEAVY is twice NORMAL');
  const end = Arrival.duration(Arrival.settings(base), 'in');
  assert.equal(at({ zoom: 12 }, s2 - 0.1).fov, 54, 'no zoom before the last shot');
  assert.ok(Math.abs(at({ zoom: 12 }, end - 1e-6).fov - 42) < 1e-3, 'FINAL SHOT ZOOM closes the lens by its degrees');
  assert.equal(at({ zoom: 12 }, end - 0.01, true).fov, 54, 'not under reduce motion');
  const o = Arrival.settings({ move: 'warp', sway: 9, zoom: -3, swell: 7 });
  assert.deepEqual([o.move, o.sway, o.zoom, o.swell], ['still', 2, 0, 2]);
});
test('SEQUENCE LIGHTING, DOOR GLOW, CAPTIONS and CINEMA BARS ride the pose; after the race the light follows the result', () => {
  context.GarageScene = { MOODS: { shipped: {}, night: {}, showroom: {}, broadcast: {}, inspection: {} } };
  try {
    assert.equal(Arrival.settings({ light: 'night' }).light, 'night');
    assert.equal(Arrival.settings({ light: 'disco' }).light, 'asset', 'a mood the garage lacks falls back to its own');
    assert.equal(Arrival.pose(1, Arrival.settings({ light: 'night' })).mood, 'night');
    assert.equal(Arrival.poseOut(1, Arrival.settings({ light: 'night' })).mood, 'night', 'the race start too');
    assert.equal(Arrival.pose(1, Arrival.settings(null)).mood, null, 'AS THE GARAGE by default: no change');
    const home = (result, homeLight) => Arrival.poseHome(1, Arrival.settings({ result, homeLight })).mood;
    assert.deepEqual(['win', 'podium', 'points', 'dnf'].map((r) => home(r)), ['showroom', 'broadcast', null, 'inspection'], 'BY RESULT');
    assert.equal(home('win', 'asset'), null); assert.equal(home('dnf', 'night'), 'night');
  } finally { delete context.GarageScene; }
  const p = Arrival.pose(1, Arrival.settings({ swell: 2, bars: true, captions: false }));
  assert.deepEqual([p.swell, p.bars, p.captions], [2, true, false]);
  assert.deepEqual([Arrival.pose(1, Arrival.settings(null)).swell, Arrival.pose(1, Arrival.settings(null)).bars], [1, false], 'shipped glow, no bars');
  const { $, arrival } = harness();
  arrival.start(); assert.equal($('cs-arrival-label').hidden, false);
  const quiet = Arrival.create($, () => false, () => ({ captions: false })); quiet.start();
  assert.equal($('cs-arrival-label').hidden, true, 'CAPTIONS off hides the words, SKIP stays');
  assert.equal($('cs-arrival').hidden, false);
});
test('a sequence holds its mood and bars, and the garage gets its own back (never saved)', () => {
  const cam = readFileSync(new URL('../../js/garage/setup-camera.js', import.meta.url), 'utf8');
  const src = cam.slice(cam.indexOf('// SEQUENCE LIGHTING and CINEMA BARS'), cam.indexOf('function renderSetupPreview('));
  let cur = 'shipped', saved = 0;
  const cls = new Set();
  const engine = [], fed = [];
  const c = vm.createContext({ GarageScene: { mood: (id) => (id === undefined ? cur : (cur = id)), setMood() { saved++; } },
    document: { body: { toggleAttribute: (k, on) => (on ? cls.add(k) : cls.delete(k)) } },
    driveOut: null, preview: null, G: { state: 'menu' }, _outEngine: false, performance: { now: () => 1000 + fed.length * 50 },
    driveOutEngine(on) { engine.push(on); c._outEngine = on; }, driveOutSound(p, gap) { fed.push(gap); } });
  vm.runInContext(src, c, { filename: absSrc('js/garage/setup-camera.js') });
  const look = vm.runInContext('sequenceLook', c);
  look({ active: true, mood: 'night', bars: true });
  assert.equal(cur, 'night'); assert.equal(cls.has('data-ga-bars'), true);
  look({ active: true, mood: 'night', bars: true });
  look({ active: false, mood: 'night', bars: true });
  assert.equal(cur, 'shipped', 'the garage mood is back when the sequence ends');
  assert.equal(cls.has('data-ga-bars'), false);
  look({ active: true, mood: 'showroom' }); look(null);
  assert.equal(cur, 'shipped', 'a stop (null) restores too');
  assert.equal(saved, 0, 'nothing is written to the player\'s LIGHTING');
  // ENGINE SOUND ON ARRIVAL: on while a driven car arrives, fed each frame, off after.
  look({ active: true, sound: true, engine: true }); look({ active: true, sound: true, engine: true });
  assert.deepEqual(engine, [true]); assert.equal(fed.length, 2);
  look({ active: false, sound: true, engine: true });
  assert.deepEqual(engine, [true, false], 'stops with the sequence');
  look({ active: true, sound: true, engine: false });
  assert.deepEqual(engine, [true, false], 'a pushed (retired) car is silent');
  look({ active: true, sound: false, engine: true });
  assert.deepEqual(engine, [true, false], 'ENGINE SOUND off');
  c.preview = {}; c.G.state = 'race'; look({ active: true, sound: true, engine: true });
  assert.deepEqual(engine, [true, false], 'a preview over a race in progress leaves its engine alone');
  c.preview = null; c.G.state = 'menu'; c.driveOut = {}; look({ active: true, sound: true, engine: true });
  assert.deepEqual(engine, [true, false], 'the RACE! drive-out runs its own engine');
});

test('REAR LIGHT: AUTO keeps the night-or-wet rule; ON, OFF and FLASH override it', () => {
  const at = (rearLight, seconds = 1) => Arrival.pose(seconds, Arrival.settings({ rearLight }));
  assert.equal(Arrival.settings(null).rearLight, 'auto'); assert.equal(Arrival.settings({ rearLight: 'disco' }).rearLight, 'auto');
  assert.deepEqual([Arrival.rearLightOn(at('auto'), true), Arrival.rearLightOn(at('auto'), false)], [true, false], 'the shipped rule');
  assert.deepEqual([Arrival.rearLightOn(at('on'), false), Arrival.rearLightOn(at('off'), true)], [true, false]);
  const blink = [0, 0.125, 0.25, 0.375].map((s) => Arrival.rearLightOn(at('flash', s), false));
  assert.deepEqual(blink, [true, false, true, false], 'FLASH blinks at ~4 Hz');
  assert.equal(Arrival.poseOut(2, Arrival.settings({ rearLight: 'on' })).rearLight, 'on', 'the race start too');
  assert.equal(Arrival.poseHome(2, Arrival.settings({ rearLight: 'flash' })).rearLight, 'flash');
});

test('SLOW-MO AT THE DOOR slows the door crossing only; the wall clock and the RACE! wait account for it', () => {
  const none = { enterCrew: 'none', leaveCrew: 'none', homeCrew: 'none' };
  const off = Arrival.settings(none), half = Arrival.settings(Object.assign({ slowmo: 0.5 }, none));
  assert.equal(Arrival.slowWindow(off, 'in'), null);
  assert.equal(Arrival.wallSeconds(off, 'out'), Arrival.duration(off, 'out'), 'off: wall = show time');
  for (const dir of ['in', 'out', 'home']) {
    const w = Arrival.slowWindow(half, dir), d = Arrival.duration(half, dir);
    assert.ok(w && w[0] > 0 && w[1] < d, dir + ': inside the sequence');
    const z = Arrival.poseFor(dir)((w[0] + w[1]) / 2, half, true).z;
    assert.ok(z > 4.5 && z < 8.5, `${dir}: the window is at the door (z ${z.toFixed(2)})`);
    assert.equal(Arrival.rate(half, dir, w[0] - 0.01), 1); assert.equal(Arrival.rate(half, dir, (w[0] + w[1]) / 2), 0.5);
    assert.ok(Math.abs(Arrival.wallSeconds(half, dir) - (d + 1.2)) < 1e-9, dir + ': 1.2 s at half speed costs 1.2 s more');
    assert.ok(Math.abs(Arrival.wallLeft(half, dir, w[1]) - (d - w[1])) < 1e-9, 'past the window, wall = show time');
    assert.ok(Math.abs(Arrival.wallLeft(half, dir, (w[0] + w[1]) / 2) - (d - (w[0] + w[1]) / 2 + 0.6)) < 1e-9, 'half the window left');
  }
  // The WORK ON CAR player integrates the rate: a half-speed window takes 1.2 s longer to reach the end.
  let wall = 0;
  const { $ } = harness(), player = Arrival.create($, () => false, () => Object.assign({ slowmo: 0.5 }, none), () => wall);
  player.start(); let n = 0;
  while (player.state.active && n < 2000) { wall += 0.05; player.step(0.05); n++; }
  assert.ok(Math.abs(n * 0.05 - Arrival.wallSeconds(half, 'in')) < 0.11, `played in ${(n * 0.05).toFixed(2)} s`);
  assert.deepEqual([Arrival.settings({ slowmo: 0.25 }).slowmo, Arrival.settings({ slowmo: 1 }).slowmo, Arrival.settings({ slowmo: -1 }).slowmo], [0.25, 0, 0]);
});

test('LIGHT CUE: off by default; a pick rides the pose; after the race BY RESULT flashes a win and turns the beacon for a retirement', () => {
  context.GarageScene = { MOODS: {}, CUES: ['lightsup', 'flashes', 'beacon', 'pulse', 'lightsout'] };
  try {
    assert.equal(Arrival.pose(1, Arrival.settings(null)).cue, null, 'the shipped lighting: no cue');
    assert.equal(Arrival.settings({ cue: 'strobe' }).cue, 'none');
    assert.equal(Arrival.pose(1, Arrival.settings({ cue: 'lightsup' })).cue, 'lightsup');
    assert.equal(Arrival.poseOut(1, Arrival.settings({ cue: 'lightsout' })).cue, 'lightsout');
    const home = (result, homeCue) => Arrival.poseHome(1, Arrival.settings({ result, homeCue })).cue;
    assert.deepEqual(['win', 'podium', 'points', 'finish', 'dnf'].map((r) => home(r)), ['flashes', 'pulse', null, null, 'beacon']);
    assert.equal(home('win', 'none'), null); assert.equal(home('finish', 'lightsup'), 'lightsup');
  } finally { delete context.GarageScene; }
});
