// key-binds-ui.test.mjs — the CONTROLS page and HOW TO PLAY slots: capture, unbind, calibrate, reset, disarm.
// Split from key-binds.test.mjs (T3-16); the VM rig is tests/helpers/key-binds-rig.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { read, boot, fakePad, plain, bootUi, slotOf } from "../helpers/key-binds-rig.mjs";

test("a phone hides both tables behind one hint until a key or a pad is seen", () => {
  const { $, press, fire, sb } = bootUi(false);
  assert.equal($("pm-keys-section").hidden, true, "no keyboard seen yet");
  assert.equal($("pm-pad-section").hidden, true, "no pad seen yet");
  assert.equal($("pm-ctl-hint").hidden, false, "the hint says what to press");
  press("KeyW");
  assert.equal($("pm-keys-section").hidden, false, "the first physical key reveals the KEYBOARD table");
  assert.equal($("pm-ctl-hint").hidden, true, "and the hint goes");
  assert.equal($("pm-pad-section").hidden, true, "the pad table still waits for a pad");
  fakePad(sb, fire);
  assert.equal($("pm-pad-section").hidden, false, "gamepadconnected reveals CONTROLLER");
});

test("an armed slot left behind (BACK / CLOSE / RESUME) never captures the next key in the race", () => {
  // Bug hunt 2026-09-22: nothing disarmed a slot when the page hid, so the
  // first key pressed in the race was swallowed and rebound.
  const { Input, kb, press, $ } = bootUi(true);
  const host = $("pm-keys");
  let hiddenPage = false;
  host.closest = (sel) => (sel === "[hidden]" && hiddenPage ? {} : null);
  const chip = (id, slot) => host.kids.flatMap((row) => row.kids || []).flatMap((c) => c.kids || [])
    .find((b) => b.dataset && b.dataset.action === id && b.dataset.slot === String(slot));
  chip("throttle", 0).onclick();                 // armed: waiting for a key
  hiddenPage = true;                              // the player left the page without pressing one
  press("ArrowLeft");
  const map = Object.fromEntries(Input.keyBindings().map((a) => [a.id, a.codes]));
  assert.equal(map.left[0], "ArrowLeft", "steer-left keeps its key");
  assert.equal(map.throttle[0], "ArrowUp", "throttle was not rebound");
  hiddenPage = false;
  chip("throttle", 0).onclick();
  kb.disarmAll();                                 // closeSettings()
  press("KeyQ");
  assert.equal(Object.fromEntries(Input.keyBindings().map((a) => [a.id, a.codes])).throttle[0], "ArrowUp",
    "disarmAll leaves nothing listening");
});

test("disarmAll aborts the wheel wizard so the pad drives again", () => {
  // Bug hunt 2026-09-24: disarmAll cleared key/pad button slots but not
  // beginAxisCapture, so SET UP A WHEEL + leave settings left the pad zeroed.
  const { Input, kb, $, fire, sb } = bootUi(true);
  const { press } = fakePad(sb, fire);
  $("pm-pad-wheel").onclick();
  assert.equal($("pm-pad-wheel").textContent, "CANCEL", "wizard armed");
  press(7, 1);
  Input.poll();
  assert.equal(Input.debugState().pad.throttle, false, "axis capture owns the frame");
  kb.disarmAll();
  assert.equal($("pm-pad-wheel").textContent, "SET UP A WHEEL", "button label restored");
  Input.poll();
  assert.equal(Input.debugState().pad.throttle, true, "disarmAll cleared axis capture");
});


test("Backspace on an armed KEY slot unbinds it, and the chip says so", () => {
  // Bug hunt 2026-09-30: Input.clearKeyBinding had no caller — a slot could be
  // moved but never emptied.
  const disk = {};
  const { Input, press, $ } = bootUi(true, {}, disk);
  slotOf($("pm-keys"), "boost", 0).onclick();
  press("Backspace");
  assert.deepEqual(plain(Input.getKeyMap().boost), [null, null], "BOOST has no key now");
  const chip = slotOf($("pm-keys"), "boost", 0);
  assert.equal(chip.textContent, "—");
  assert.match(chip.attrs["aria-label"], /unset/);
  assert.deepEqual(plain(disk.keys.boost), [null, null], "the cleared map was saved");
  assert.match($("pm-keys-note").textContent, /BOOST key cleared/);
  press("Space");
  assert.equal(Input.consumeBoostToggle(), false, "Space no longer boosts");
  // Delete clears the SECOND slot alone.
  slotOf($("pm-keys"), "left", 1).onclick();
  press("Delete");
  assert.deepEqual(plain(Input.getKeyMap().left), ["ArrowLeft", null]);
  // Nothing is left armed: the next key is not captured.
  press("KeyG");
  assert.deepEqual(plain(Input.getKeyMap().left), ["ArrowLeft", null]);
});

test("Backspace from the keyboard unbinds an armed CONTROLLER slot and disarms the capture", () => {
  const disk = {};
  const { Input, $, press, fire, sb } = bootUi(true, {}, disk);
  const pad = fakePad(sb, fire);
  slotOf($("pm-pad"), "throttle", 1).onclick();
  press("Backspace");
  assert.deepEqual(plain(Input.getPadMap().throttle), [7, null], "A no longer means gas");
  assert.deepEqual(plain(disk.pad.throttle), [7, null]);
  assert.equal(slotOf($("pm-pad"), "throttle", 1).textContent, "—");
  pad.press(0); Input.poll();
  assert.deepEqual(plain(Input.getPadMap().throttle), [7, null], "the capture was disarmed, A was not bound");
  assert.equal(Input.debugState().pad.throttle, false, "and A does not drive");
});

test("CALIBRATE STICK is stored and applied on the next boot; a garbage value is ignored", () => {
  // Bug hunt 2026-09-30: the hint promised the offset applies "from then on",
  // and it was lost on reload.
  const disk = {};
  const a = bootUi(true, {}, disk);
  const pa = fakePad(a.sb, a.fire);
  pa.pad.axes[0] = 0.08;
  a.$("pm-pad-calib").onclick();
  assert.ok(Math.abs(disk.padRest["Xbox Wireless Controller"] - 0.08) < 1e-9, "the offset was stored per pad id: " + JSON.stringify(disk.padRest));
  const b = bootUi(true, {}, { padRest: disk.padRest });
  const pb = fakePad(b.sb, b.fire);
  assert.ok(Math.abs(b.Input.padRest() - 0.08) < 1e-9, "a fresh boot loads it for that pad");
  pb.pad.axes[0] = 0.08; b.Input.poll();
  assert.equal(b.Input.debugState().pad.steer, 0, "a stick resting at 0.08 steers nothing");
  const c = bootUi(true, {}, {});
  const pc = fakePad(c.sb, c.fire);
  pc.pad.axes[0] = 0.08; c.Input.poll();
  assert.ok(c.Input.debugState().pad.steer > 0, "control: uncalibrated, the same rest steers");
  for (const junk of ["x", 0.9, -3, [0.1], { v: 0.1 }, Infinity, true]) {
    assert.equal(bootUi(true, {}, { padRest: junk }).Input.padRest(), 0, "ignored: " + JSON.stringify(junk));
  }
});

test("the wheel wizard drops a stored rest offset when the steering axis moves", () => {
  const disk = { padRest: 0.08 };
  const { Input, $, fire, sb } = bootUi(true, {}, disk);
  const { pad } = fakePad(sb, fire);
  pad.axes = [0.08, 0, 0, 0];
  $("pm-pad-wheel").onclick();
  pad.axes[1] = -0.9; Input.poll();     // steer -> axis 1
  pad.axes[2] = 0.9; Input.poll();      // throttle -> axis 2
  pad.axes[3] = 0.9; Input.poll();      // brake -> axis 3, finish
  assert.equal(disk.padAxes.steer, 1, "the wizard finished");
  assert.equal(Input.padRest(), 0, "the old axis's offset is not carried over");
  assert.equal(disk.padRest, 0, "…and not stored");
});

test("leaving the CONTROLS page aborts the wheel wizard via SettingsNav.onLeave (hunt3 1b-F1)", () => {
  // SettingsNav.onLeave shipped (#1309/#1320) with no subscriber: BACK from
  // CONTROLS left the wizard zeroing the pad and waiting to save padAxes.
  let leave = null;
  const { Input, $, fire, sb } = bootUi(true, {}, {}, (g) => { g.SettingsNav = { onLeave: (fn) => { leave = fn; } }; });
  assert.equal(typeof leave, "function", "key-binds subscribes to the page-leave hook");
  const { press } = fakePad(sb, fire);
  $("pm-pad-wheel").onclick();
  assert.equal($("pm-pad-wheel").textContent, "CANCEL");
  leave("display");
  assert.equal($("pm-pad-wheel").textContent, "CANCEL", "another page hiding is not the CONTROLS page");
  leave("controls");
  assert.equal($("pm-pad-wheel").textContent, "SET UP A WHEEL", "BACK from CONTROLS stops the wizard");
  press(7, 1);
  Input.poll();
  assert.equal(Input.debugState().pad.throttle, true, "the pad drives again");
});

test("without SettingsNav.onLeave KeyBinds.create still boots", () => {
  assert.doesNotThrow(() => bootUi(true, {}, {}, (g) => { g.SettingsNav = {}; }));
  assert.doesNotThrow(() => bootUi(true));
});

test("CONTROLLER RESET clears wheel axes and stick rest, not only the button map", () => {
  // Bug hunt 2026-10-06: RESET called Input.resetPad() alone. SET UP A WHEEL /
  // CALIBRATE STICK kept driving after "Controller reset to the defaults", and
  // with default buttons the RESET chip stayed disabled.
  const disk = {};
  const { Input, $, fire, sb } = bootUi(true, {}, disk);
  const { pad } = fakePad(sb, fire);
  pad.axes = [0, 0, 0, 0];
  $("pm-pad-wheel").onclick();
  pad.axes[1] = -0.9; Input.poll();
  pad.axes[2] = 0.9; Input.poll();
  pad.axes[3] = 0.9; Input.poll();
  assert.equal(Input.padAxesAreDefault(), false, "wizard left a custom axis map");
  assert.equal(Input.padsAreDefault(), true, "buttons stayed at shipped defaults");
  assert.equal($("pm-pad-reset").disabled, false, "RESET is live when only axes differ");

  // Calibrate on the wizard's steer axis (1), not axis 0.
  pad.axes = [0, 0.08, 0, 0];
  $("pm-pad-calib").onclick();
  assert.ok(Math.abs(disk.padRest["Xbox Wireless Controller"] - 0.08) < 1e-9, "rest offset stored: " + JSON.stringify(disk.padRest));
  assert.equal($("pm-pad-reset").disabled, false, "RESET stays live with a rest offset");

  Input.setPadBinding("boost", 0, 11);
  assert.equal(Input.padsAreDefault(), false);
  $("pm-pad-reset").onclick();
  assert.equal(Input.padsAreDefault(), true, "buttons reset");
  assert.equal(Input.padAxesAreDefault(), true, "wheel axes reset");
  assert.equal(Input.padRest(), 0, "stick rest cleared");
  assert.equal(Object.prototype.hasOwnProperty.call(disk, "padAxes"), false, "padAxes removed from store");
  assert.equal(Object.prototype.hasOwnProperty.call(disk, "padRest"), false, "padRest removed from store");
  assert.equal($("pm-pad-reset").disabled, true, "RESET disables once everything is shipped");
  assert.match($("pm-pad-note").textContent, /Controller reset/);
});

test("How to Play input disclosures stay on the article the player opened", () => {
  // Bug hunt 2026-10-06: after helpInputReady, every render forced the active
  // device <details> open and insertBefore'd it to the front.
  const mkDetails = (kind, open) => ({
    open: !!open,
    tagName: "DETAILS",
    getAttribute: (name) => (name === "data-input" ? kind : null),
  });
  const keyboard = mkDetails("keyboard", true);
  const pad = mkDetails("pad", false);
  const touch = mkDetails("touch", false);
  const kids = [keyboard, pad, touch];
  const { kb, $ } = bootUi(true, {}, {});
  const htp = $("htp-inputs");
  htp.dataset = { helpInputReady: "1" };
  htp.querySelectorAll = (sel) => (sel === "details[data-input]" ? kids.slice() : []);
  htp.insertBefore = (node) => {
    const i = kids.indexOf(node);
    if (i >= 0) kids.splice(i, 1);
    kids.unshift(node);
    htp.firstElementChild = kids[0];
    return node;
  };
  htp.firstElementChild = kids[0];
  $("howtoplay").hidden = false;
  kb.render();
  assert.equal(keyboard.open, true, "player-opened Keyboard stays open");
  assert.equal(pad.open, false, "pad was not forced open");
  assert.equal(kids[0], keyboard, "order was not rewritten to the active device");
  assert.equal(touch.open, false);
});

test("a desktop shows both tables and never the hint", () => {
  const { $ } = bootUi(true);
  assert.equal($("pm-keys-section").hidden, false);
  assert.equal($("pm-pad-section").hidden, false);
  assert.equal($("pm-ctl-hint").hidden, true);
});

test("How to Play binding slots are painted from the live key and pad tables", () => {
  const slot = (attr, action) => ({
    textContent: "stale",
    kids: [],
    getAttribute: (name) => name === attr ? action : null,
    append(...children) { this.kids.push(...children); },
  });
  const keySlot = slot("data-help-keys", "aero");
  const padSlot = slot("data-help-pad", "overtake");
  const { $, kb } = bootUi(true, {
    "[data-help-keys]": [keySlot],
    "[data-help-pad]": [padSlot],
  });
  kb.render();
  assert.equal(keySlot.textContent, "", "the stale key hint is replaced");
  assert.equal(keySlot.kids[0].textContent, "Z", "keyboard slot uses the live key label");
  assert.equal(padSlot.kids[0].textContent, "Y", "controller slot uses the live pad label");
  assert.equal($("htp-inputs").dataset.activeInput, "keyboard", "help records the current input kind");
});

test("#1903: a pad re-render (gamepadconnected) disarms capture so A does not rebind", () => {
  const { Input, $, fire, sb } = bootUi(true);
  const { pad, press: padPress } = fakePad(sb, fire);
  // BOOST's second slot is unset — a captured press would bind here; the default
  // throttle second slot is already A (0), so it cannot prove disarm.
  slotOf($("pm-pad"), "boost", 1).onclick();
  assert.equal(slotOf($("pm-pad"), "boost", 1).dataset.armed, "1");
  fire("gamepadconnected", { gamepad: pad });
  assert.equal(slotOf($("pm-pad"), "boost", 1).dataset.armed, undefined, "render dropped the armed chip");
  padPress(0);
  Input.poll();
  assert.deepEqual(plain(Input.getPadMap().boost), [2, null], "A was not bound onto the armed slot after reconnect");
});

test("#1903: KeyBinds.render disarms an armed pad slot", () => {
  const { Input, kb, $, fire, sb } = bootUi(true);
  const { press } = fakePad(sb, fire);
  slotOf($("pm-pad"), "boost", 0).onclick();
  kb.render();
  press(2);
  Input.poll();
  assert.deepEqual(plain(Input.getPadMap().boost), [2, null], "X still boosts — capture was cleared");
});

test("#1902: CALIBRATE STICK defers save until the timer; cancel on RESET", () => {
  const disk = {};
  const { $, fire, sb, flushTimers, pendingTimers } = bootUi(true, {}, disk, null, { deferTimers: true });
  const pa = fakePad(sb, fire);
  pa.pad.axes[0] = 0.08;
  $("pm-pad-calib").onclick();
  assert.equal(pendingTimers(), 1, "calibration waits 450 ms");
  assert.equal(disk.padRest, undefined);
  $("pm-pad-reset").onclick();
  flushTimers(500);
  assert.equal(disk.padRest, undefined, "RESET cancelled the pending save");
});

test("#1902: CALIBRATE STICK cancelled when leaving CONTROLS before save", () => {
  const leaveFns = [];
  const disk = {};
  const { $, fire, sb, flushTimers } = bootUi(true, {}, disk, (g) => {
    g.SettingsNav = { onLeave: (fn) => { leaveFns.push(fn); } };
  }, { deferTimers: true });
  const pa = fakePad(sb, fire);
  pa.pad.axes[0] = 0.08;
  $("pm-pad-calib").onclick();
  for (const fn of leaveFns) fn("controls");
  flushTimers(500);
  assert.equal(disk.padRest, undefined);
});

test("#1902: CALIBRATE STICK cancelled on disarmAll (settings close)", () => {
  const disk = {};
  const { kb, $, fire, sb, flushTimers } = bootUi(true, {}, disk, null, { deferTimers: true });
  const pa = fakePad(sb, fire);
  pa.pad.axes[0] = 0.08;
  $("pm-pad-calib").onclick();
  kb.disarmAll();
  flushTimers(500);
  assert.equal(disk.padRest, undefined);
});

test("#1902: CALIBRATE STICK cancelled on gamepad disconnect before save", () => {
  const disk = {};
  const { $, fire, sb, flushTimers } = bootUi(true, {}, disk, null, { deferTimers: true });
  const { pad } = fakePad(sb, fire);
  pad.axes[0] = 0.08;
  $("pm-pad-calib").onclick();
  fire("gamepaddisconnected", { gamepad: pad });
  flushTimers(500);
  assert.equal(disk.padRest, undefined);
});

test("#1902: a second CALIBRATE press cancels the first timer", () => {
  const disk = {};
  const { $, fire, sb, flushTimers, pendingTimers } = bootUi(true, {}, disk, null, { deferTimers: true });
  const pa = fakePad(sb, fire);
  pa.pad.axes[0] = 0.08;
  $("pm-pad-calib").onclick();
  const firstId = pendingTimers();
  assert.equal(firstId, 1);
  pa.pad.axes[0] = 0.12;
  $("pm-pad-calib").onclick();
  assert.equal(pendingTimers(), 1, "only the latest calibration is pending");
  flushTimers(500);
  assert.ok(Math.abs(disk.padRest["Xbox Wireless Controller"] - 0.12) < 1e-9, "saved offset matches the second sample");
});

test("#1902: CALIBRATE STICK does not save when CONTROLS is hidden before the timer", () => {
  const disk = {};
  const { $, fire, sb, flushTimers } = bootUi(true, {}, disk, null, { deferTimers: true });
  const pa = fakePad(sb, fire);
  pa.pad.axes[0] = 0.08;
  const panel = $("pm-panel-controls");
  panel.hidden = false;
  $("pm-pad-calib").onclick();
  panel.hidden = true;
  flushTimers(500);
  assert.equal(disk.padRest, undefined);
});

test("a successful key capture rebuilds once, restores the changed slot's focus, and reports through a status", () => {
  const { $, press, sb } = bootUi(true);
  const host = $("pm-keys");
  const find = (node, action, slot) => {
    if (node.dataset && node.dataset.action === action && node.dataset.slot === String(slot)) return node;
    for (const child of node.kids || []) { const hit = find(child, action, slot); if (hit) return hit; }
    return null;
  };
  const before = find(host, "recover", 0);
  assert.ok(before, "the RECOVER primary slot is rendered");
  before.focus(); before.onclick();
  const clears = host.clears;
  press("KeyF");
  const after = find(host, "recover", 0);
  assert.notEqual(after, before, "capture replaces the rendered button");
  assert.equal(host.clears, clears + 1, "successful capture performs one render, not disarm + render");
  assert.equal(sb.document.activeElement, after, "focus follows the same logical slot onto its replacement");
  assert.equal(after.textContent, "F");
  assert.match($("pm-keys-note").textContent, /Tap a key slot/);
  assert.match(read("index.html"), /id="pm-keys-note"[^>]*role="status"/,
    "the capture result is exposed as a polite status update");
});
