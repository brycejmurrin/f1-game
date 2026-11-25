/* phone-press-mode.test.mjs — #6365: the paired phone's BOOST / OVERTAKE / AERO PRESS MODE.
 * TOGGLE (default, = the race HUD's tap) keeps the button lit from the HOST's dash bit; HOLD is on
 * only while pressed. The latch, the dash bit, the stored setting and the editor row, with no browser.
 * Run: node --test tests/unit/phone-press-mode.test.mjs */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { makeDom } from "../helpers/mini-dom.mjs";
import { absSrc } from "../helpers/abs-src.mjs";
import { seedLogGlobal } from "../helpers/seed-log.mjs";

seedLogGlobal();
const run = (ctx, files) => { for (const f of files) vm.runInContext(fs.readFileSync(absSrc(f), "utf8"), ctx, { filename: absSrc(f) }); };
function page(globals = {}) {
  const ctx = vm.createContext({ ...globals });
  run(ctx, ["js/input/pedal-travel.js", "js/input/touch-button-actions.js", "js/input/phone-pad-codec.js", "js/input/phone-pad-page.js"]);
  return vm.runInContext("({ PedalTravel, PhonePadPage, TouchButtonActions })", ctx);
}
const { PhonePadPage } = page();
const D = PhonePadPage.DASH;
function latchOf(k, linked = true) {
  const clock = { t: 0 }, sent = [];
  const latch = PhonePadPage.pressLatch(k, key => linked && (sent.push(key), true), () => clock.t);
  return { latch, sent, clock };
}

test("TOGGLE: each press is one edge and the colour follows the host's state, not the finger", () => {
  const { latch, sent, clock } = latchOf("boost");
  latch.hud(0);
  latch.down(false); latch.up(false);
  assert.deepEqual(sent, ["boost"], "a lift sends nothing in TOGGLE");
  assert.equal(latch.active(), true, "lit at once: the asked-for state stands until the host answers");
  clock.t = 66; latch.hud(D.boost);
  clock.t = 5000; latch.hud(D.boost);
  assert.equal(latch.active(), true, "still lit long after the lift while the host reports BOOST on");
  latch.hud(0);
  assert.equal(latch.active(), false, "the host ending it (battery empty, pit, race end) returns the button to idle");
  latch.down(false);
  assert.deepEqual(sent, ["boost", "boost"]);
  clock.t = 5066; latch.hud(D.boost);
  latch.down(false);
  assert.equal(latch.active(), false, "a second press asks for off");
  assert.equal(sent.length, 3);
});

test("a press the host refuses (flat battery, OT not armed) falls back to idle after the confirm window", () => {
  const { latch, clock } = latchOf("overtake");
  latch.hud(0);
  latch.down(false);
  clock.t = 200; latch.hud(0);
  assert.equal(latch.active(), true, "unconfirmed inside the window");
  clock.t = 700; latch.hud(0);
  assert.equal(latch.active(), false, "refused: idle once the host has had its chance");
});

test("HOLD: the press switches it on, the lift switches it off, the colour is only the finger's", () => {
  const { latch, sent, clock } = latchOf("boost");
  latch.hud(0);
  latch.down(true);
  assert.deepEqual(sent, ["boost"]);
  clock.t = 30; latch.up(true);
  assert.deepEqual(sent, ["boost", "boost"], "a quick lift before the host's dash still switches it off");
  clock.t = 2000; latch.hud(0);
  latch.down(true); clock.t = 2100; latch.hud(D.boost);
  clock.t = 4000; latch.hud(D.boost); latch.up(true);
  assert.deepEqual(sent, ["boost", "boost", "boost", "boost"], "a long hold switches off on the lift");
  clock.t = 6000; latch.hud(D.boost);   // the host still on (e.g. the ERS sector plan): a press does not toggle it off
  latch.down(true);
  assert.equal(sent.length, 4, "HOLD never sends an edge that would switch it OFF on the press");
  latch.hud(0); clock.t = 7000; latch.up(true);
  assert.equal(sent.length, 4, "nothing to switch off when the host already ended it");
});

test("HOLD lifted where the host drops edges (Pause, a menu): the off edge waits for the wheel", () => {
  const { latch, sent, clock } = latchOf("overtake");
  latch.hud(0);
  latch.down(true);
  clock.t = 100; latch.hud(D.otOn);
  assert.deepEqual(sent, ["overtake"]);
  clock.t = 200; latch.up(true, true);
  assert.deepEqual(sent, ["overtake"], "no edge into the pause card, where the host would drop it and the next press invert");
  clock.t = 1000; latch.hud(D.otOn);
  latch.heard();
  assert.deepEqual(sent, ["overtake", "overtake"], "back on the drive surface, the owed lift switches it off");
  latch.heard();
  assert.equal(sent.length, 2, "once");
  clock.t = 2000; latch.hud(0);
  latch.down(true);
  assert.equal(sent.length, 3, "the next press switches it on, not off");
  const ended = latchOf("boost");
  ended.latch.hud(0); ended.latch.down(true);
  ended.clock.t = 100; ended.latch.hud(D.boost); ended.latch.up(true, true);
  ended.clock.t = 900; ended.latch.hud(0); ended.latch.heard();
  assert.deepEqual(ended.sent, ["boost"], "nothing owed once the host ended it itself");
  const fresh = latchOf("aero");
  fresh.latch.down(true); fresh.latch.up(true, true); fresh.latch.heard(true); fresh.latch.heard();
  assert.deepEqual(fresh.sent, ["aero"], "a new session forgets a lift owed to the old link");
  const t = latchOf("boost");
  t.latch.down(false); t.latch.up(false, true); t.latch.heard();
  assert.deepEqual(t.sent, ["boost"], "TOGGLE owes nothing on a lift");
  const re = latchOf("overtake");
  re.latch.hud(0); re.latch.down(true); re.clock.t = 100; re.latch.hud(D.otOn);
  re.latch.up(true, true); re.clock.t = 900; re.latch.hud(D.otOn);
  re.latch.down(true); re.latch.heard();
  assert.deepEqual(re.sent, ["overtake"], "a press while a lift is owed takes it over: on stays on, nothing sent");
  re.latch.up(true);
  assert.deepEqual(re.sent, ["overtake", "overtake"], "and its own lift switches it off");
});

test("no state from the host: the local latch; unlinked: nothing changes", () => {
  const { latch, sent } = latchOf("aero");
  latch.down(false);
  assert.equal(latch.active(), true, "before any dash the local latch paints");
  latch.down(true); latch.up(true);
  assert.deepEqual(sent, ["aero", "aero"], "HOLD on the local latch: on is already on, the lift turns it off");
  assert.equal(latch.active(), false);
  const cold = latchOf("aero", false);
  cold.latch.down(false);
  assert.equal(cold.latch.active(), false, "an unsent press is not a latched one");
});

test("OT reads the new otOn bit, and an older host's otActive alone", () => {
  for (const flags of [D.otOn, D.otActive, D.otOn | D.otActive]) {
    const { latch } = latchOf("overtake");
    latch.hud(flags);
    assert.equal(latch.active(), true, "flags " + flags);
  }
  const { latch } = latchOf("overtake");
  latch.hud(D.otArmed);
  assert.equal(latch.active(), false, "armed is not on");
  assert.ok(D.otOn <= 0xffff && !Object.entries(D).some(([k, v]) => k !== "otOn" && v === D.otOn),
    "a fresh bit inside the 16-bit flags an older phone's decoder clamps to");
});

test("the host's dash carries otOn while OT is on even when it is not deploying", () => {
  const ctx = vm.createContext({ PhonePad: { DASH: D, teamHex: () => "" }, PhysicsConsts: { MAX_RPM: 12000, IDLE_RPM: 4000 } });
  const ui = vm.runInContext(fs.readFileSync(absSrc("js/net/phone-pairing-ui.js"), "utf8") + ";PhonePairingUI", ctx);
  const base = { gear: 3, speed: 50, rpm: 6000, lap: 1, rank: 2, energy: 0.5, team: null, lastLap: 0 };
  const G = (player) => ({ player, recordControls: () => ({ gearsManual: true }), aeroZones: [1], dashKph: v => v, cars: [],
    cautionLevel: () => 0, lapsTarget: 5, state: "race" });
  const braking = ui.dash(G({ ...base, otOn: true, otT: 0 }));
  assert.ok(braking.flags & D.otOn); assert.ok(!(braking.flags & D.otActive));
  assert.ok(!(ui.dash(G({ ...base, otOn: false })).flags & D.otOn));
});

test("PRESS MODE is stored only as HOLD, only for the latching buttons, and HOLD bypasses the tap gesture", () => {
  const storage = new Map(), subs = new Set();
  const store = { get: (k, f) => storage.has(k) ? storage.get(k) : f, getStored: k => storage.get(k), subscribe: f => (subs.add(f), () => subs.delete(f)),
    set(k, v) { if (v === undefined) storage.delete(k); else storage.set(k, v); for (const f of subs) f({ key: k }); return true; } };
  const dom = makeDom();
  dom.document.documentElement.setAttribute("data-phone-controller", "");
  const { PedalTravel, TouchButtonActions } = page({ GameStore: { store }, document: dom.document });
  assert.deepEqual([...PhonePadPage.latchButtons], ["boost", "overtake", "aero"]);
  for (const k of PedalTravel.phoneButtons) {
    PedalTravel.setButtonProfile(k, { latch: "hold" });
    assert.equal(PedalTravel.buttonOverrides(k).latch, PhonePadPage.latchButtons.includes(k) ? "hold" : undefined, "the stored set is PhonePadPage.latchButtons: " + k);
    PedalTravel.resetButtonProfile(k);
  }
  for (const k of PhonePadPage.latchButtons) assert.equal(PedalTravel.buttonProfile(k).latch, undefined, k + " defaults to TOGGLE");
  PedalTravel.setButtonProfile("boost", { activation: "double" });
  PedalTravel.setButtonProfile("boost", { latch: "hold" });
  PedalTravel.setButtonProfile("camera", { latch: "hold" });
  assert.equal(PedalTravel.buttonProfile("boost").latch, "hold");
  assert.equal(PedalTravel.buttonOverrides("boost").activation, "double", "the gesture is kept for a return to TOGGLE");
  const events = {}, el = { style: {}, setAttribute() {}, removeAttribute() {}, addEventListener: (k, f) => { events[k] = f; } };
  TouchButtonActions.bindControl(el, "boost");
  let consumed = false;
  events.pointerdown({ pointerType: "touch", pointerId: 1, timeStamp: 0, preventDefault() {}, stopImmediatePropagation() { consumed = true; } });
  assert.equal(consumed, false, "HOLD answers the finger: the DOUBLE TAP gesture does not swallow the press");
  PedalTravel.setButtonProfile("boost", { latch: "toggle" });
  events.pointerdown({ pointerType: "touch", pointerId: 2, timeStamp: 0, preventDefault() {}, stopImmediatePropagation() { consumed = true; } });
  assert.equal(consumed, true, "back on TOGGLE the gesture applies again");
  PedalTravel.setButtonProfile("boost", { latch: "hold" });
  assert.equal(PedalTravel.buttonOverrides("camera").latch, undefined, "no press mode outside BOOST / OT / AERO");
  const saved = storage.get("phoneButtonProfiles");
  assert.deepEqual(JSON.parse(JSON.stringify(PedalTravel.normalizeProfiles(JSON.parse(JSON.stringify(saved)), true))), { v: 1, buttons: { boost: { activation: "double", latch: "hold" } } },
    "the settings-export SPEC row's normalize keeps it through backup/restore");
  PedalTravel.setButtonProfile("aero", { latch: "toggle" });
  assert.equal(storage.get("phoneButtonProfiles").buttons.aero, undefined, "TOGGLE is the default, never stored");
  PedalTravel.setButtonProfile("boost", { latch: "toggle" });
  assert.equal(PedalTravel.buttonProfile("boost").activation, "double");
  PedalTravel.setButtonProfile("aero", { latch: "hold" });
  PedalTravel.resetButtonProfile("aero");
  assert.equal(PedalTravel.buttonProfile("aero").latch, undefined, "the per-button RESET returns it to TOGGLE");
});

test("the phone's editor offers PRESS MODE for BOOST / OT / AERO only; HOLD hides ACTIVATION", () => {
  const dom = makeDom(), ctx = vm.createContext({ document: dom.document });
  run(ctx, ["js/input/pedal-travel.js", "js/input/controller-profiles.js", "js/input/touch-button-actions.js", "js/input/phone-pad-codec.js", "js/input/phone-pad-page.js", "js/ui/touch-button-settings.js"]);
  const [model, editor] = vm.runInContext("[PedalTravel, TouchButtonSettings]", ctx);
  const host = dom.document.createElement("div"); host.id = "pt"; dom.body.appendChild(host);
  editor.mount(host, model.phoneButtons, { standalone: true });
  const choose = (id, value) => { const c = dom.byId("pt-" + id); c.value = value; c.onchange(); };
  const rowHidden = id => dom.byId("pt-" + id).parentElement.parentElement.hidden;
  choose("button", "gas");
  assert.ok(rowHidden("latch"), "a pedal has no press mode");
  for (const k of ["boost", "overtake", "aero"]) {
    choose("button", k);
    assert.ok(!rowHidden("latch"), k);
    assert.equal(dom.byId("pt-latch").value, "toggle");
    assert.ok(!rowHidden("activation"));
  }
  choose("button", "boost"); choose("latch", "hold");
  assert.equal(model.buttonOverrides("boost").latch, "hold");
  assert.ok(rowHidden("activation"), "HOLD has no tap gesture");
  const holdHelp = dom.byId("pt-latch-help").textContent;
  choose("latch", "toggle");
  assert.notEqual(dom.byId("pt-latch-help").textContent, holdHelp, "the help follows the chosen mode");
  assert.ok(!rowHidden("activation"), "TOGGLE keeps its tap gesture");
  choose("button", "camera");
  assert.ok(rowHidden("latch") && !rowHidden("activation"));
  const race = dom.document.createElement("div"); race.id = "rt"; dom.body.appendChild(race);
  editor.mount(race);
  const sel = dom.byId("rt-button"); sel.value = "boost"; sel.onchange();
  assert.ok(dom.byId("rt-latch").parentElement.parentElement.hidden, "the race HUD's own editor keeps its tap toggle");
});
