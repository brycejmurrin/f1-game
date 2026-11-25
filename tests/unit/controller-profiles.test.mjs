import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { absSrc } from "../helpers/abs-src.mjs";
const root = new URL('../../', import.meta.url), read = (f) => fs.readFileSync(new URL(f, root), 'utf8');
const plain = (v) => JSON.parse(JSON.stringify(v));
function boot() {
  const listeners = {}, storage = new Map(), clock = { t: 100 }, state = { pads: [] };
  const el = () => ({ addEventListener() {}, removeEventListener() {}, style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, setAttribute() {}, getAttribute: () => null, removeAttribute() {}, children: [], getBoundingClientRect: () => ({ left: 0, top: 0, width: 300, height: 300 }), setPointerCapture() {}, releasePointerCapture() {}, hasPointerCapture: () => false });
  const sb = { Math, Object, Array, Number, isFinite, JSON, Map, Set, Date, Event,
    performance: { now: () => clock.t }, navigator: { getGamepads: () => state.pads }, screen: {},
    GameStore: { store: { get: (k, d) => storage.has(k) ? plain(storage.get(k)) : d, set(k, v) { storage.set(k, plain(v)); return true; } } },
    Log: { info() {}, warn() {}, debug() {}, error() {}, enabled: () => false },
    addEventListener: (t, f) => { (listeners[t] ||= []).push(f); }, removeEventListener() {}, dispatchEvent() {}, setTimeout: () => 0, clearTimeout() {},
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    document: { addEventListener(t, f) { (listeners[t] ||= []).push(f); }, removeEventListener() {}, getElementById: el, querySelector: el, querySelectorAll: () => [], hidden: false, body: el() } };
  sb.window = sb;
  const ctx = vm.createContext(sb);
  for (const f of ['js/core/mat4.js', 'js/input/tilt-roll.js', 'js/input/bindings.js', 'js/input/pad-menu.js', 'js/input/haptics.js', 'js/input/pedal-travel.js', 'js/input/hold-buttons.js', 'js/input/controller-profiles.js', 'js/input/input.js']) vm.runInContext(read(f), ctx, { filename: absSrc(f) });
  const Input = vm.runInContext('Input', ctx), Profiles = vm.runInContext('ControllerProfiles', ctx);
  Input.init(el());
  const drive = (pad) => { state.pads = [pad]; (listeners.gamepadconnected || []).forEach((fn) => fn({ gamepad: pad })); clock.t += 17; Input.poll(); };
  return { Input, Profiles, drive, storage, clock, state, disconnect(p) {
    state.pads = state.pads.filter((device) => device !== p);
    listeners.gamepaddisconnected.forEach((fn) => fn({ gamepad: p }));
  } };
}
const pad = (id, mapping = 'standard') => ({ id, index: 0, connected: true, mapping, axes: [0, 0, 0, 0], buttons: Array.from({ length: 20 }, () => ({ pressed: false, value: 0 })) });
test("named keyboard, gamepad, touch and phone profiles use separate slots and preserve the other modes", () => {
  const { Profiles, Input } = boot(), disk = new Map();
  const store = { get: (key, fallback) => disk.get(key) ?? fallback, set(key, value) { disk.set(key, value); return true; } };
  const state = Profiles.buttonPresets(store);
  for (const [mode, values] of [["keyboard", { throttle: ["KeyW", null] }], ["pad", { throttle: [7, null] }],
    ["touch", { v: 1, buttons: { gas: { start: 45 } } }], ["phone", { v: 1, buttons: { gas: { start: 30 } } }]]) {
    assert.equal(state.save(mode, "Race", values).id, "profile-1");
  }
  assert.equal(state.save("keyboard", "race", {}), null, "names are unique within each mode");
  assert.equal(state.save("pad", "Wet", { throttle: [5, null] }, "profile-1").id, "profile-1");
  Input.setKeyMap(state.list("keyboard")[0].values);
  Input.setPadMap(state.list("pad")[0].values);
  assert.equal(Input.getKeyMap().throttle[0], "KeyW");
  assert.equal(Input.getPadMap().throttle[0], 5);
  state.remove("touch", "profile-1");
  assert.equal(state.list("touch").length, 0);
  assert.equal(Profiles.buttonPresets(store).list("phone")[0].values.buttons.gas.start, 30, "phone profile survives when touch's saved profile is deleted");
});

test('empty snapshots neutralize axes without replaying held actions on recovery', () => {
  const { Input: I, drive, state } = boot(), p = pad('recovering pad');
  // RECOVER, not CAM: CAM's press waits for its release since #6271.
  for (const [action, index] of [['recover', 8], ['shiftUp', 5], ['boost', 0]]) I.setPadBinding(action, 0, index);
  const press = (down) => { for (const i of [8, 5, 0]) p.buttons[i] = { pressed: down, value: down ? 1 : 0 }; };
  const edges = () => [I.consumeRecover(), I.consumeShiftUp(), I.consumeBoostToggle()];
  press(true); p.axes[0] = .8; p.axes[2] = .7; drive(p);
  assert.deepEqual(edges(), [true, true, true], 'first connection retains its wake press');
  for (let cycle = 0; cycle < 2; cycle++) {
    state.pads = []; I.poll();
    assert.equal(I.lookStick().x, 0, 'missing snapshot neutralizes the held look axis');
    assert.equal(I.debugState().pad.steer, 0);
    state.pads = [p]; for (let i = 0; i < 60; i++) I.poll();
    assert.deepEqual(edges(), [false, false, false], 'a held button is not a second press');
    press(false); I.poll(); press(true); I.poll();
    assert.deepEqual(edges(), [true, true, true], 'release and repress work after every recovery');
  }
  press(false); I.poll(); state.pads = []; I.poll();
  press(true); state.pads = [p]; for (let i = 0; i < 60; i++) I.poll();
  assert.deepEqual(edges(), [false, false, false], 'presses hidden by the gap also require a release');
  const other = pad('replacement'); other.buttons[8] = { pressed: true, value: 1 }; drive(other);
  assert.equal(I.consumeRecover(), false, 'device changes still seed already-held buttons');
});
test('real Input wheel→pad→wheel restores both axes/buttons, and reset changes only current profile', () => {
  const { Input: I, drive, storage } = boot();
  I.setPadAxisMap({ steer: 3, throttle: 2, brake: 1 }); I.setPadBinding('camera', 0, 19);
  drive(pad('My wheel', '')); assert.equal(I.getPadAxisMap().steer, 3); assert.equal(I.getPadMap().camera[0], 19);
  drive(pad('Standard pad')); assert.equal(I.getPadAxisMap().steer, 0); assert.equal(I.getPadMap().camera[0], 8);
  I.setPadBinding('camera', 0, 18); drive(pad('My wheel', '')); assert.equal(I.getPadAxisMap().steer, 3); assert.equal(I.getPadMap().camera[0], 19);
  assert.equal(I.controllerProfile().label, 'My wheel'); assert.equal(storage.get('padProfiles').devices.length, 2);
  assert.equal(I.resetControllerProfile(), true); assert.equal(I.getPadAxisMap().steer, 0);
  drive(pad('Standard pad')); assert.equal(I.getPadMap().camera[0], 18);
});
test('default axis state follows the sanitized map, profile switches and resets', () => {
  const { Input: I, drive } = boot();
  const wheel = pad('Wheel', ''), standard = pad('Pad');
  drive(wheel);
  assert.equal(I.padAxesAreDefault(), true);
  I.setPadAxisMap({ steer: -0, throttle: Infinity, pedalInvert: 2 });
  assert.equal(I.padAxesAreDefault(), true);
  I.setPadAxisMap({ brakeFar: 0 });
  assert.equal(I.padAxesAreDefault(), false);
  drive(standard);
  assert.equal(I.padAxesAreDefault(), true);
  drive(wheel);
  assert.equal(I.padAxesAreDefault(), false);
  assert.equal(I.resetControllerProfile(), true);
  assert.equal(I.padAxesAreDefault(), true);
});
test('profile map survives fresh manager/boot and preserves unclaimed legacy for only first physical device', () => {
  const { Profiles: P } = boot(), data = new Map(); let current = { axes: { steer: 3 }, buttons: { camera: [19, null] } };
  const opts = { store: { get: (k, d) => data.get(k) || d, set(k, v) { data.set(k, plain(v)); } }, snapshot: () => current, apply: (v) => { current = plain(v); }, defaults: () => ({ axes: { steer: 0 }, buttons: { camera: [8, null] } }) };
  const first = P.create(opts); first.activate(pad('wheel')); first.activate(pad('pad'));
  assert.equal(current.axes.steer, 0); first.activate(pad('wheel')); assert.equal(current.axes.steer, 3);
  current = opts.defaults(); const reboot = P.create(opts); reboot.activate(pad('wheel')); assert.equal(current.axes.steer, 3);
  for (let i = 0; i < 30; i++) reboot.activate(pad('other' + i)); assert.equal(reboot.data().devices.length, 16);
});
test('profile sanitizer bounds hostile/oversized imported metadata', () => {
  const { Profiles: P } = boot();
  const row = { id: 'x'.repeat(500), axes: { steer: 1, junk: 'bad', throttleFar: Infinity }, buttons: { camera: [3, null, 99], bad_name: [8, 9] } };
  const clean = P.clean({ devices: Array.from({ length: 30 }, (_, i) => ({ ...row, id: row.id + i })) });
  assert.equal(clean.devices.length, 1); assert.equal(clean.devices[0].id.length, 120);
  assert.deepEqual(plain(clean.devices[0].buttons), { camera: [3, null] }); assert.deepEqual(plain(clean.devices[0].axes), { steer: 1 });
});
test('real Input guarded remoteLost cannot clear a different owner; omitted source retains clear-all', () => {
  const { Input: I } = boot();
  I.remoteSample({ source: 'phone', steer: .75, thr: 1, held: 1 }); assert.equal(I.remoteActive(), true);
  assert.equal(I.remoteLost('xr'), false); assert.equal(I.debugState().remote.owner, 'phone'); assert.equal(I.debugState().remote.stick, .75);
  I.remoteLost('phone'); assert.equal(I.remoteActive(), false);
  I.remoteSample({ source: 'xr', steer: -.5, brk: 1 }); I.remoteLost('phone'); assert.equal(I.debugState().remote.owner, 'xr');
  I.remoteLost(); assert.equal(I.remoteActive(), false); assert.equal(I.debugState().remote.owner, null);
});
test('stored legacy axes/buttons load before lazy Controls UI and profile imports apply current device immediately', () => {
  const { Input: I, drive, storage } = boot();
  storage.set('padAxes', { steer: 3, throttle: 2 }); storage.set('pad', { camera: [19, null] });
  drive(pad('wheel', '')); assert.equal(I.getPadAxisMap().steer, 3); assert.equal(I.getPadMap().camera[0], 19);
  I.setControllerProfiles({ v: 1, devices: [{ id: 'wheel', axes: { steer: 1 }, buttons: { camera: [18, null] } }] });
  assert.equal(I.getPadAxisMap().steer, 1); assert.equal(I.getPadMap().camera[0], 18);
  assert.equal(I.controllerProfile().id, 'wheel');
});
test('standard controller cannot consume a persisted legacy wheel map before the wheel is used', () => {
  const { Input: I, drive, storage } = boot(); storage.set('padAxes', { steer: 3, throttle: 2 });
  drive(pad('standard first')); assert.equal(I.getPadAxisMap().steer, 0); assert.equal(I.getControllerProfiles().legacyClaimed, false);
  drive(pad('wheel later', '')); assert.equal(I.getPadAxisMap().steer, 3); assert.equal(I.getControllerProfiles().legacyClaimed, true);
  drive(pad('another wheel', '')); assert.equal(I.getPadAxisMap().steer, 0);
});


test('current profile reset invalidates only old-axis/sign calibration and persists it', () => {
  for (const [steer, invert, rest] of [[3, 1, .2], [0, -1, .2], [0, 1, .2], [3, 1, 0]]) {
    const { Input: I, drive, storage } = boot();
    const wheel = pad('Calibrated wheel', '');
    drive(wheel); I.setPadAxisMap({ steer, steerInvert: invert });
    I.setPadRest({ 'Other pad': .1 });
    wheel.axes[steer] = rest * invert;
    assert.equal(I.calibratePad(), true);
    storage.set('padRest', plain(I.padRestStore()));
    const changed = steer !== 0 || invert !== 1;
    I.resetControllerProfile();
    wheel.axes[0] = changed ? 0 : rest;
    I.poll();
    assert.equal(I.debugState().pad.steer, 0, 'center remains neutral after reset');
    const saved = plain(I.padRestStore());
    assert.equal(saved['Other pad'], .1, 'another device keeps its calibration');
    assert.equal(saved['Calibrated wheel'] || 0, changed ? 0 : rest);
    if (changed) assert.deepEqual(storage.get('padRest'), saved, 'invalidation reaches durable save seam');
  }
});

test('owned wheel-map commit rejects disconnected owner and selects the captured device profile', () => {
  const { Input: I, drive } = boot();
  drive(pad('Unrelated pad'));
  const before = plain(I.getPadAxisMap());
  assert.equal(I.setPadAxisMap({ steer: 3 }, '0:Absent wheel'), null);
  assert.deepEqual(plain(I.getPadAxisMap()), before);
  const wheel = pad('Captured wheel', '');
  drive(wheel);
  assert.ok(I.setPadAxisMap({ steer: 3 }, '0:Captured wheel'));
  assert.equal(I.controllerProfile().id, 'Captured wheel');
  assert.equal(I.getPadAxisMap().steer, 3);
});

test('pedal initialization belongs to each connected controller and axis map', () => {
  const { Input: I, storage, state, clock } = boot();
  const a = pad('wheel A', ''), b = pad('wheel B', ''); b.index = 1;
  storage.set('padProfiles', { v: 1, legacyClaimed: true, devices: [a, b].map(p => ({
    id: p.id, axes: { steer: 0, throttle: 2, brake: 3 }, buttons: {},
  })) });
  state.pads = [a, b]; I.poll();
  a.axes[2] = a.axes[3] = -1; clock.t += 17; I.poll();
  b.buttons[8] = { pressed: true, value: 1 }; clock.t += 17; I.poll();
  assert.equal(I.controllerProfile().id, b.id);
  assert.equal(I.throttleLevel(), 0, 'another wheel cannot initialize untouched gas');
  assert.equal(I.brakeLevel(), 0, 'another wheel cannot initialize untouched brake');
  b.axes[2] = b.axes[3] = -1; clock.t += 17; I.poll();
  b.axes[2] = b.axes[3] = 0; clock.t += 17; I.poll();
  assert.ok(I.throttleLevel() > .4, 'zero is real half travel after this pedal initialized');
  assert.ok(I.brakeLevel() > .4);
  I.setPadAxisMap({ steer: 0, throttle: 1, brake: 3 }); I.poll();
  assert.equal(I.throttleLevel(), 0, 'a newly mapped axis starts uninitialized');
});

test('a reconnect in the same slot requires a release before repeating a held action', () => {
  const { Input: I, drive, disconnect } = boot(), p = pad('wireless');
  p.buttons[10] = { pressed: true, value: 1 };   // RECOVER: CAM waits for its release since #6271
  drive(p);
  assert.equal(I.consumeRecover(), true);
  disconnect(p);
  I.poll();
  drive(p);
  assert.equal(I.consumeRecover(), false);
  p.buttons[10] = { pressed: false, value: 0 }; I.poll();
  p.buttons[10] = { pressed: true, value: 1 }; I.poll();
  assert.equal(I.consumeRecover(), true);
});

test('profile replacement keeps an unclaimed legacy wheel map reserved for the wheel', () => {
  const { Input: I, drive, storage } = boot();
  storage.set('padAxes', { steer: 3 });
  drive(pad('standard first'));
  I.setControllerProfiles({ devices: [], legacyClaimed: false });
  assert.equal(I.getPadAxisMap().steer, 0, 'the standard controller keeps its standard axis');
  assert.equal(I.getControllerProfiles().legacyClaimed, false);
  drive(pad('wheel later', ''));
  assert.equal(I.getPadAxisMap().steer, 3);
});

test('polling reads each idle spare button once while still recognizing its first press', () => {
  const { Input: I, drive, state } = boot(), active = pad('driver'), spare = pad('spare');
  spare.index = 1;
  let reads = 0, down = false;
  spare.buttons[8] = { get pressed() { reads++; return down; }, value: 0 };
  drive(active); state.pads = [active, spare]; I.poll();
  reads = 0; I.poll();
  assert.equal(reads, 1, 'one button snapshot per poll for an idle spare');
  down = true; I.poll();
  assert.equal(I.controllerProfile().id, spare.id, 'a rising button still claims the active slot');
});

test('identical pads on different slots do not share latched gas or D-pad steering', () => {
  const { Input: I, drive, state, clock } = boot(), a = pad('Xbox'), b = pad('Xbox');
  b.index = 1; I.setHoldMode({ throttle: 'toggle' });
  drive(a); state.pads = [a, b];
  I.poll();
  a.buttons[0] = a.buttons[15] = { pressed: true, value: 1 };
  for (let i = 0; i < 30; i++) { clock.t += 17; I.poll(); I.steer(1 / 60); }
  assert.equal(I.throttleLevel(), 1);
  assert.ok(I.debugState().pad.steer > .5);
  b.buttons[8] = { pressed: true, value: 1 }; clock.t += 17; I.poll();
  assert.equal(I.throttleLevel(), 0, 'incoming device never toggled its throttle');
  assert.equal(I.debugState().pad.steer, 0, 'incoming pad has neutral D-pad');
});

test('an unavailable wheel pedal axis is neutral until fresh travel is observed', () => {
  const { Input: I, drive } = boot(), wheel = pad('wheel', '');
  I.setPadAxisMap({ steer: 0, throttle: 3 });
  wheel.axes[3] = -1; drive(wheel);
  wheel.axes[3] = 1; I.poll(); assert.equal(I.throttleLevel(), 1);
  for (const invalid of [undefined, NaN]) {
    wheel.axes[3] = invalid; I.poll(); assert.equal(I.throttleLevel(), 0);
    wheel.axes[3] = 0; I.poll(); assert.equal(I.throttleLevel(), 0);
    wheel.axes[3] = -1; I.poll(); wheel.axes[3] = 0; I.poll();
    assert.ok(I.throttleLevel() > .4, 'valid centred sample after calibration is half travel');
  }
});

test('square-gate stick diagonals stay within the radial free-look range', () => {
  const { Input: I, drive } = boot(), p = pad('square gate');
  p.axes[2] = 1; p.axes[3] = -1; drive(p);
  const { x, y } = I.lookStick();
  assert.ok(Math.abs(Math.hypot(x, y) - 1) < 1e-9);
  assert.equal(x, -y);
});

test('a truncated snapshot preserves steering calibration and produces neutral steering', () => {
  const { Input: I, drive } = boot(), wheel = pad('calibrated wheel', '');
  I.setPadAxisMap({ steer: 3 });
  drive(wheel);
  wheel.axes[3] = .2;
  assert.equal(I.calibratePad(), true);
  wheel.axes.length = 2;
  I.poll();
  assert.equal(I.debugState().pad.steer, 0);
  assert.equal(I.parkedPadPreview().steer, 0);
  assert.equal(I.calibratePad(), false, 'missing axis cannot overwrite calibration');
  assert.equal(I.padRestStore()[wheel.id], .2);
  wheel.axes[3] = .2; I.poll();
  assert.equal(I.debugState().pad.steer, 0, 'rest is still centred when the axis returns');
});

/* Pad-menu deadzone + hold-repeat timing (InputPadMenu via real Input.poll).
 * Pins PAD_NAV_DEADZONE / PAD_NAV_DELAY_MS / PAD_NAV_REPEAT_MS through behaviour —
 * a stick past ~0.22 navigates; held directions wait ~450 ms then repeat ~130 ms. */
function bootPadMenu() {
  const keys = [];
  const state = { now: 1000, anyOpen: false, top: null, pad: null };
  const listeners = {};
  const el = () => ({ addEventListener() {}, removeEventListener() {}, style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, setAttribute() {}, getAttribute: () => null, removeAttribute() {}, children: [], getBoundingClientRect: () => ({ left: 0, top: 0, width: 300, height: 300 }), setPointerCapture() {}, releasePointerCapture() {}, hasPointerCapture: () => false });
  const sb = {
    Math, Object, Array, Number, isFinite, JSON, Map, Set, Date, String,
    performance: { now: () => state.now },
    navigator: { getGamepads: () => (state.pad ? [state.pad] : []) },
    screen: {},
    GameStore: { store: { get: (_k, d) => d, set() { return true; } } },
    Log: { info() {}, warn() {}, debug() {}, error() {}, enabled: () => false },
    addEventListener: (t, f) => { (listeners[t] ||= []).push(f); },
    removeEventListener() {}, dispatchEvent() {}, setTimeout: () => 0, clearTimeout() {},
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    KeyboardEvent: class { constructor(type, init) { this.type = type; Object.assign(this, init || {}); } },
    Event: class { constructor(type, init) { this.type = type; Object.assign(this, init || {}); } },
    UiLayers: {
      anyOpen: () => state.anyOpen,
      navOpen: () => state.anyOpen,
      top: () => state.top,
    },
    MenuNav: { activeLayer: () => state.top, FOCUSABLE: "button,input,select" },
    document: {
      addEventListener(t, f) { (listeners[t] ||= []).push(f); },
      removeEventListener() {},
      getElementById: el, querySelector: el, querySelectorAll: () => [],
      hidden: false, body: el(), activeElement: null,
      dispatchEvent(e) { if (e && e.key) keys.push(e.key); return true; },
    },
  };
  sb.window = sb;
  const ctx = vm.createContext(sb);
  for (const f of ['js/core/mat4.js', 'js/input/tilt-roll.js', 'js/input/bindings.js', 'js/input/pad-menu.js', 'js/input/haptics.js', 'js/input/pedal-travel.js', 'js/input/hold-buttons.js', 'js/input/controller-profiles.js', 'js/input/input.js']) {
    vm.runInContext(read(f), ctx, { filename: absSrc(f) });
  }
  const Input = vm.runInContext('Input', ctx);
  Input.init(el());
  const mkPad = (ax = 0, ax2 = 0) => ({
    id: 'menu pad', index: 0, connected: true, mapping: 'standard',
    axes: [ax, 0, ax2, 0],
    buttons: Array.from({ length: 20 }, () => ({ pressed: false, value: 0 })),
  });
  state.pad = mkPad(0);
  (listeners.gamepadconnected || []).forEach((fn) => fn({ gamepad: state.pad }));
  Input.poll();
  const take = () => keys.splice(0);
  return { Input, state, mkPad, take };
}

test('menu stick deadzone: ~0.15 rests, ~0.3 navigates', () => {
  const { Input, state, mkPad, take } = bootPadMenu();
  state.anyOpen = true;
  state.top = { id: 'pause', contains: () => true };
  state.pad = mkPad(0);
  Input.poll();
  assert.deepEqual(take(), ['ArrowDown'], 'opening a menu seeds focus once');
  state.pad = mkPad(0.15);
  Input.poll();
  assert.deepEqual(take(), [], '0.15 stays inside the menu stick deadzone');
  state.pad = mkPad(0.30);
  Input.poll();
  assert.deepEqual(take(), ['ArrowRight'], '0.30 clears the deadzone and navigates');
});

test('held menu direction waits ~450 ms then repeats every ~130 ms', () => {
  const { Input, state, mkPad, take } = bootPadMenu();
  state.anyOpen = true;
  state.top = { id: 'pause', contains: () => true };
  state.pad = mkPad(0);
  Input.poll();
  take();
  state.pad = mkPad(0.30);
  Input.poll();
  assert.deepEqual(take(), ['ArrowRight'], 'first deflection moves once');
  state.now += 400;
  Input.poll();
  assert.deepEqual(take(), [], 'no repeat before the initial ~450 ms delay');
  state.now += 60;
  Input.poll();
  assert.deepEqual(take(), ['ArrowRight'], 'first repeat after ~450 ms');
  state.now += 100;
  Input.poll();
  assert.deepEqual(take(), [], 'repeat cadence is not every frame');
  state.now += 40;
  Input.poll();
  assert.deepEqual(take(), ['ArrowRight'], 'subsequent repeats land about every ~130 ms');
  state.pad = mkPad(0);
  Input.poll();
  assert.deepEqual(take(), [], 'releasing the stick stops repeats immediately');
});
