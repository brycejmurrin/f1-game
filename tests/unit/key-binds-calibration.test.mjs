// key-binds-calibration.test.mjs — deferred stick calibration, capture cancellation, profile-change reentry, wheel wizard.
// Split from key-binds.test.mjs (T3-16); the VM rig is tests/helpers/key-binds-rig.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fakePad, plain, bootUi, slotOf, rawPad, setBtn, delayedCalibration, withProfileStore, releaseWheelPedal } from "../helpers/key-binds-rig.mjs";

for (const reason of ["reset", "back", "close", "blur", "disconnect", "connect", "binding", "wheel"]) {
  test(`pending stick calibration is cancelled by ${reason}, and a fresh attempt works`, () => {
    const r = delayedCalibration();
    const { $, Input, pad, disk, timers, cleared } = r;
    $("pm-pad-calib").onclick();
    assert.equal(timers[0].ms, 450);
    if (reason === "reset") $("pm-pad-reset").onclick();
    if (reason === "back") r.leave("controls");
    if (reason === "close") r.kb.disarmAll();
    if (reason === "blur") r.fire("blur");
    if (reason === "disconnect") { pad.connected = false; r.fire("gamepaddisconnected", { gamepad: pad }); }
    if (reason === "connect") r.fire("gamepadconnected", { gamepad: pad });
    if (reason === "binding") slotOf($("pm-pad"), "boost", 0).onclick();
    if (reason === "wheel") $("pm-pad-wheel").onclick();
    assert.ok(cleared.includes(timers[0].id), "the pending timer is cleared");
    const saved = JSON.stringify(disk), offsets = JSON.stringify(Input.padRestStore());
    const note = $("pm-pad-calib-note").textContent;
    pad.axes[0] = 0.3;
    timers[0].fn();
    assert.equal(JSON.stringify(Input.padRestStore()), offsets, "late callback cannot sample a moved stick");
    assert.equal(JSON.stringify(disk), saved, "late callback cannot rewrite storage");
    assert.equal($("pm-pad-calib-note").textContent, note, "late callback cannot replace the current prompt");
    r.kb.disarmAll();
    pad.connected = true;
    r.fire("gamepadconnected", { gamepad: pad });
    pad.axes[0] = 0.12;
    $("pm-pad-calib").onclick();
    const fresh = timers.at(-1);
    timers[0].fn();
    fresh.fn();
    assert.equal(Input.padRest(), 0.12);
    assert.equal(disk.padRest[pad.id], 0.12, "fresh calibration persists normally");
  });
}

test("new calibration supersedes an earlier click; another settings page leaving does not cancel it", () => {
  const { $, Input, pad, timers, leave } = delayedCalibration();
  $("pm-pad-calib").onclick();
  $("pm-pad-calib").onclick();
  pad.axes[0] = 0.3;
  timers[0].fn();
  assert.equal(Input.padRest(), 0.08);
  leave("audio");
  pad.axes[0] = 0.15;
  timers[1].fn();
  assert.equal(Input.padRest(), 0.15);
});

test("calibration refuses a hidden page or a different active controller without connection events", () => {
  for (const change of ["hidden", "other-id", "other-index"]) {
    const { $, Input, pad, disk, timers, sb } = delayedCalibration();
    $("pm-pad-calib").onclick();
    const before = JSON.stringify(disk);
    if (change === "hidden") $("pm-pad-calib").closest = () => ({});
    else sb.navigator.getGamepads = () => [{ ...pad, id: change === "other-id" ? "Other pad" : pad.id,
      index: change === "other-index" ? 1 : pad.index, axes: [0.3, 0, 0, 0] }];
    timers[0].fn();
    assert.equal(JSON.stringify(disk), before, change);
    assert.equal(Input.padRestStore()[pad.id], 0.08, "the initiating pad's offset stays unchanged");
  }
});

test("controller reconnect and generic render cancel an armed slot instead of leaving invisible capture", () => {
  for (const change of ["reconnect", "render", "back"]) {
    const r = delayedCalibration();
    const { $, Input, pad, disk } = r;
    const before = JSON.stringify(Input.getPadMap());
    const old = slotOf($("pm-pad"), "boost", 0);
    old.onclick();
    assert.equal(old.dataset.armed, "1");
    if (change === "reconnect") {
      pad.connected = false;
      r.fire("gamepaddisconnected", { gamepad: pad });
      pad.connected = true;
      r.fire("gamepadconnected", { gamepad: pad });
    } else if (change === "render") r.kb.render();
    else r.leave("controls");
    assert.equal(old.dataset.armed, undefined);
    assert.equal(slotOf($("pm-pad"), "boost", 0).dataset.armed, undefined);
    r.press(0); Input.poll();
    assert.equal(JSON.stringify(Input.getPadMap()), before, "the next A press cannot steal throttle for Boost");
    assert.equal(disk.pad, undefined, "cancelled capture does not persist a binding");
    r.release(0); Input.poll();
    slotOf($("pm-pad"), "boost", 0).onclick();
    r.press(0); Input.poll();
    assert.equal(Input.getPadMap().boost[0], 0, "an explicitly rearmed slot still captures");
    assert.equal(disk.pad.boost[0], 0);
    assert.equal(Input.getPadMap().throttle[1], null, "normal explicit capture still resolves conflicts");
  }
});


test("calibration cannot move to a second already-connected pad when its activity wins selection", () => {
  const { $, Input, pad, disk, timers, sb, fire } = delayedCalibration();
  let time = 100;
  sb.performance.now = () => time;
  const other = rawPad({ id: "Other connected pad", index: 1, axes: [0.2, 0, 0, 0] });
  sb.navigator.getGamepads = () => [pad, other];
  fire("gamepadconnected", { gamepad: other });
  setBtn(pad, 0, true);
  Input.poll();
  setBtn(pad, 0, false);
  Input.poll();
  $("pm-pad-calib").onclick();
  const saved = JSON.stringify(disk);
  time += 100;
  setBtn(other, 0, true);
  Input.poll();
  assert.equal(Input.pickPad(sb.navigator.getGamepads(), null, false).id, other.id);
  timers[0].fn();
  assert.equal(JSON.stringify(disk), saved);
  assert.equal(Input.padRestStore()[other.id], undefined, "the second pad never receives the first pad's calibration");
  $("pm-pad-calib").onclick();
  timers.at(-1).fn();
  assert.equal(disk.padRest[other.id], 0.2, "an intentional fresh attempt calibrates the now-active pad");
});


test('CHECK CONTROLS cancels keyboard and pad binding capture without changing mappings', () => {
  for (const device of ['keys', 'pad']) {
    const r = bootUi(true, {}, {}, null, { deferTimers: true });
    const { Input, $, sb, fire, press } = r;
    const pad = fakePad(sb, fire);
    const beforeKeys = plain(Input.getKeyMap()), beforePad = plain(Input.getPadMap());
    slotOf($('pm-' + device), 'boost', 1).onclick();
    const preview = $('pm-pad-section').kids.find(n => n.id === 'pm-pad-preview');
    preview.onclick();
    assert.equal(preview.attrs['aria-expanded'], 'true');
    press('KeyQ'); pad.press(0); Input.poll(); pad.release(0); Input.poll();
    assert.deepEqual(plain(Input.getKeyMap()), beforeKeys);
    assert.deepEqual(plain(Input.getPadMap()), beforePad);
    preview.onclick();
    slotOf($('pm-' + device), 'boost', 1).onclick();
    if (device === 'keys') { press('KeyQ'); assert.equal(Input.getKeyMap().boost[1], 'KeyQ'); }
    else { pad.press(1); Input.poll(); assert.equal(Input.getPadMap().boost[1], 1); }
  }
});


test('profile-change reentry preserves replacement-slot focus after pad bind and clear', () => {
  for (const mode of ['bind', 'clear', 'keyboard']) {
    const h = bootUi(true, {}, null, withProfileStore);
    const controller = fakePad(h.sb, h.fire);
    h.Input.poll();
    let refreshes = 0;
    h.sb.addEventListener('apexcontrollerprofilechange', () => { refreshes++; h.kb.render(); });
    const host = h.$(mode === 'keyboard' ? 'pm-keys' : 'pm-pad');
    const old = slotOf(host, 'recover', 0);
    old.focus(); old.onclick();
    if (mode === 'clear') h.press('Backspace');
    else if (mode === 'keyboard') h.press('KeyF');
    else { controller.press(3); h.Input.poll(); }
    const replacement = slotOf(host, 'recover', 0);
    assert.notEqual(replacement, old);
    assert.equal(h.sb.document.activeElement, replacement, mode + ' focuses live replacement');
    assert.equal(refreshes, mode === 'keyboard' ? 0 : 1);
    const actual = mode === 'keyboard' ? h.Input.getKeyMap().recover[0] : h.Input.getPadMap().recover[0];
    assert.equal(actual, mode === 'keyboard' ? 'KeyF' : mode === 'clear' ? null : 3);
  }
});

test('wheel wizard pins the first device, ignores other axes and cancels only owner disconnect', () => {
  const h = bootUi(true, {}, null, withProfileStore), I = h.Input;
  const make = (id, index) => ({ id, index, connected: true, mapping: '', axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 20 }, () => ({ pressed: false, value: 0 })) });
  const a = make('Wheel A', 0), b = make('Wheel B', 1);
  h.sb.navigator.getGamepads = () => [a, b];
  h.fire('gamepadconnected', { gamepad: a }); I.poll();
  const beforeA = plain(I.getPadAxisMap());
  h.$('pm-pad-wheel').onclick();
  // Any connected device can provide the first answer, even while A was active.
  b.axes[3] = -.9; I.poll();
  a.axes[2] = .9; I.poll();
  assert.equal(h.$('pm-pad-wheel').textContent, 'CANCEL', 'other device cannot supply throttle');
  a.axes[1] = .9; I.poll();
  assert.equal(h.$('pm-pad-wheel').textContent, 'CANCEL', 'other device cannot finish');
  b.axes[2] = .9; I.poll();
  releaseWheelPedal(I, h.sb, b, 2, 0);
  a.connected = false; h.fire('gamepaddisconnected', { gamepad: a });
  assert.equal(h.$('pm-pad-wheel').textContent, 'CANCEL', 'spare disconnect keeps wizard');
  b.axes[1] = .9; I.poll();
  releaseWheelPedal(I, h.sb, b, 1, 0);
  assert.equal(h.$('pm-pad-wheel').textContent, 'SET UP A WHEEL');
  assert.equal(I.controllerProfile().id, 'Wheel B', 'commit belongs to first captured device');
  assert.equal(I.getPadAxisMap().steer, 3);
  assert.equal(I.getPadAxisMap().throttle, 2);
  assert.equal(I.getPadAxisMap().brake, 1);
  const profiles = plain(h.sb.GameStore.store.get('padProfiles'));
  assert.deepEqual(profiles.devices.find((p) => p.id === 'Wheel A').axes, beforeA);
  const beforeB = plain(I.getPadAxisMap());
  b.axes = [0, 0, 0, 0];
  h.$('pm-pad-wheel').onclick(); b.axes[3] = -.9; I.poll();
  b.connected = false; h.fire('gamepaddisconnected', { gamepad: b });
  assert.equal(h.$('pm-pad-wheel').textContent, 'SET UP A WHEEL', 'owner disconnect cancels');
  assert.deepEqual(plain(h.sb.GameStore.store.get('padProfiles')).devices.find((p) => p.id === 'Wheel B').axes, beforeB);
});

// Hunt #7320 A4/A5: the wizard's gaps — a pad gone mid-step, and the 600 ms between steps.
function wheelRig() {
  let pauses = 0;
  const h = bootUi(true, {}, null, withProfileStore, { deferTimers: true, initOpts: { onPause: () => { pauses++; } } });
  const w = { id: 'Solo Wheel', index: 0, connected: true, mapping: '', axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 20 }, () => ({ pressed: false, value: 0 })) };
  let t = 0; h.sb.performance.now = () => t;
  h.sb.navigator.getGamepads = () => [w];
  h.fire('gamepadconnected', { gamepad: w }); h.Input.poll();
  const start = (down) => { w.buttons[9] = { pressed: down, value: down ? 1 : 0 }; h.Input.poll(); };
  return { h, w, start, pauses: () => pauses, at: (ms) => { t = ms; } };
}
test('a pedal step whose wheel vanished aborts at its deadline, not on the wheel’s return (#7322 A4)', () => {
  const { h, w, at } = wheelRig(), I = h.Input;
  h.$('pm-pad-wheel').onclick();
  w.axes[0] = -.9; I.poll();                       // steering answered
  w.axes[0] = 0; at(700); h.flushTimers();         // the throttle step arms
  I.poll(); w.axes[2] = .9; at(720); I.poll();     // press: the pedal capture waits for release
  assert.equal(h.$('pm-pad-wheel').textContent, 'CANCEL');
  h.sb.navigator.getGamepads = () => [];           // the wheel drops out of getGamepads
  at(1000); I.poll();
  assert.equal(h.$('pm-pad-wheel').textContent, 'CANCEL', 'a brief hole is not an abort');
  at(720 + 8001); I.poll();
  assert.equal(h.$('pm-pad-wheel').textContent, 'SET UP A WHEEL', 'the deadline ran while the wheel was gone');
});
test('the only pad leaving during step 1 cancels the wizard; a spare pad keeps it (#7322 A4)', () => {
  const { h, w } = wheelRig();
  h.$('pm-pad-wheel').onclick();
  assert.equal(h.$('pm-pad-wheel').textContent, 'CANCEL');
  const spare = { ...w, id: 'Spare', index: 1, connected: true };
  h.sb.navigator.getGamepads = () => [w, spare];
  w.connected = false; h.fire('gamepaddisconnected', { gamepad: w });
  assert.equal(h.$('pm-pad-wheel').textContent, 'CANCEL', 'a spare pad is still there');
  spare.connected = false; h.fire('gamepaddisconnected', { gamepad: spare });
  assert.equal(h.$('pm-pad-wheel').textContent, 'SET UP A WHEEL', 'no pad left: the sheet does not sit on "running"');
});
test('Start inside the 600 ms step gap does not pause; after the hold it does (#7322 A5)', () => {
  const { h, w, start, pauses, at } = wheelRig(), I = h.Input;
  h.$('pm-pad-wheel').onclick();
  w.axes[0] = -.9; at(10); I.poll();              // step 1 completes: capture disarmed, re-arm in 600 ms
  assert.equal(h.pendingTimers() > 0, true, 'the step timer is pending');
  at(200); start(true); at(220); start(false);
  assert.equal(pauses(), 0, 'Start in the step gap is the wizard’s, not a pause');
  h.$('pm-pad-wheel').onclick();                   // cancel: the hold ends with the wizard
  at(300); start(true); at(320); start(false);
  assert.equal(pauses(), 1, 'anti-vacuity: with no wizard, Start pauses');
});
