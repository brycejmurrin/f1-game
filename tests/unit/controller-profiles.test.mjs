import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
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
  for (const f of ['js/core/mat4.js', 'js/input/tilt-roll.js', 'js/input/bindings.js', 'js/input/pad-menu.js', 'js/input/haptics.js', 'js/input/hold-buttons.js', 'js/input/controller-profiles.js', 'js/input/input.js']) vm.runInContext(read(f), ctx, { filename: f });
  const Input = vm.runInContext('Input', ctx), Profiles = vm.runInContext('ControllerProfiles', ctx);
  Input.init(el());
  const drive = (pad) => { state.pads = [pad]; (listeners.gamepadconnected || []).forEach((fn) => fn({ gamepad: pad })); clock.t += 17; Input.poll(); };
  return { Input, Profiles, drive, storage, clock };
}
const pad = (id, mapping = 'standard') => ({ id, index: 0, connected: true, mapping, axes: [0, 0, 0, 0], buttons: Array.from({ length: 20 }, () => ({ pressed: false, value: 0 })) });
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
