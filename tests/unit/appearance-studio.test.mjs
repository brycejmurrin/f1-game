import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../../js/ui/appearance-studio.js", import.meta.url), "utf8").replace(/^const AppearanceStudio/m, "var AppearanceStudio");
function load(initial = {}, durable = true, reduced = false, document) {
  const values = structuredClone(initial), writes = [], owners = [];
  const store = { get: (k, d) => k in values ? values[k] : d, set: (k, v) => { values[k] = v; writes.push(k); return durable; },
    write: (k, v) => { values[k] = v; return { ok: true, durable, reason: durable ? null : "QuotaExceededError" }; } };
  const context = vm.createContext({ GameStore: { store }, Log: { info() {}, warn() {} }, setTimeout, clearTimeout,
    AppearanceOpts: { restore: (v) => owners.push(v) }, ScreenLooks: { normalize: (_id, v) => ({ ...v }), apply() {}, refresh() {} },
    window: { matchMedia: () => ({ matches: reduced }) }, document });
  vm.runInContext(source, context); return { studio: context.AppearanceStudio, values, writes, owners };
}
const plain = (v) => JSON.parse(JSON.stringify(v));

test("Studio waits for deferred legacy Appearance controls before wrapping them", () => {
  for (const readyState of ["interactive", "complete", "loading"]) {
    const lookedUp = [], events = [];
    load({}, true, false, { readyState, getElementById(id) { lookedUp.push(id); return null; },
      addEventListener(name, callback) { events.push({ name, callback }); } });
    if (readyState !== "complete") {
      assert.equal(lookedUp.length, 0); assert.equal(events[0].name, "DOMContentLoaded");
      events[0].callback();
    } else assert.equal(events.length, 0);
    assert.deepEqual(lookedUp, ["pm-panel-appearance"]);
  }
});

test("visual profiles and coordinated presets preserve driving, career, confirmation and budgets", () => {
  const unrelated = { steering: "pro", pace: 7, driverCareer: { round: 8 }, unlimitedBudget: false, pauseConfirm: "off", raceSettings: { laps: 24 } };
  const { studio, values, writes } = load(unrelated);
  studio.applyPreset("broadcast");
  for (const [key, value] of Object.entries(unrelated)) assert.deepEqual(values[key], value);
  assert.equal(values.hudProfile, "broadcast"); assert.equal(values.menuAccent, "cyan"); assert.equal(values.homeScene, "night");
  assert.ok(writes.every((key) => studio.VISUAL_KEYS.includes(key)));
  studio.saveProfile("Race night"); values.steering = "rookie"; studio.loadProfile("profile-1");
  assert.equal(values.steering, "rookie"); assert.equal(values.pauseConfirm, "off");
});

test("hostile visual snapshots are clamped, normalized and stripped of unrelated keys", () => {
  const { studio } = load();
  const clean = studio.normalizeSnapshot({ uiTheme: {}, menuAccentHex: "javascript:alert(1)", hudScale: Infinity, uiScale: 999, hudBtnScale: -40,
    hudBtnOpacity: 0, motion: "wobble", steering: "pro", __proto__: { unlimitedBudget: true } });
  assert.equal(clean.uiTheme, "dark"); assert.equal(clean.menuAccentHex, "#e10600"); assert.equal(clean.uiScale, 200);
  assert.equal(clean.hudScale, null); assert.equal(clean.hudBtnScale, 40); assert.equal(clean.hudBtnOpacity, 20);
  assert.equal(clean.motion, "on"); assert.equal(clean.steering, undefined); assert.equal(clean.unlimitedBudget, undefined);
});

test("Undo restores the last visual batch; current-screen preset preserves other views", () => {
  const { studio, values } = load({ uiTheme: "light", hudProfile: "minimal", homeScene: "garage" });
  const before = plain(studio.snapshot()); studio.applyPreset("broadcast"); assert.equal(values.uiTheme, "dark");
  assert.equal(studio.undo(), true); assert.deepEqual(plain(studio.snapshot()), before); assert.equal(studio.undo(), false);
  studio.applyPreset("classic", "screen"); assert.equal(values.homeScene, "static");
  assert.equal(values.uiTheme, "light"); assert.equal(values.hudProfile, "minimal");
  studio.reset("screen"); assert.equal(values.homeScene, "garage"); assert.equal(values.uiTheme, "light");
});

test("Named profiles can be updated and deleted without changing the live visual state", () => {
  const { studio, values } = load(); studio.saveProfile("Desktop paddock"); studio.applyPreset("sunlight");
  studio.saveProfile("Sunlight desktop", "profile-1"); assert.equal(studio.profiles().length, 1);
  assert.equal(studio.profiles()[0].name, "Sunlight desktop"); assert.equal(studio.profiles()[0].values.uiTheme, "light");
  const before = plain(studio.snapshot()); assert.equal(studio.deleteProfile("profile-1"), true);
  assert.deepEqual(plain(studio.snapshot()), before); assert.equal(values.appearanceProfiles.length, 0);
  assert.equal(studio.saveProfile("   ").ok, false);
});

test("Storage durability failures remain explicit while current-session profiles work", () => {
  const { studio } = load({}, false); const result = studio.saveProfile("Private session");
  assert.equal(result.ok, true); assert.equal(result.durable, false); assert.equal(studio.profiles().length, 1);
  assert.equal(studio.applySnapshot({ uiTheme: "light" }).durable, false);
});

test("Profile boundary rejects duplicates and bad ids and enforces the saved-profile limit", () => {
  const { studio } = load({ appearanceProfiles: [{ id: "safe", name: " Safe ", values: { steering: "pro", uiTheme: "light" } },
    { id: "safe", name: "Duplicate" }, { id: "<script>", name: "Bad" }, { id: "empty", name: " " }] });
  assert.equal(studio.profiles().length, 1); assert.equal(studio.profiles()[0].name, "Safe"); assert.equal(studio.profiles()[0].values.steering, undefined);
  for (let i = 0; i < 11; i++) studio.saveProfile("Profile " + i);
  assert.equal(studio.profiles().length, 12); assert.equal(studio.saveProfile("Overflow").reason, "limit");
});

test("Scene events and independent background motion respect OS reduce and unsubscribe", () => {
  const { studio } = load({}, true, true); assert.deepEqual(plain(studio.scene()), { mode: "garage", motion: "still" });
  const changes = []; const stop = studio.onSceneChange((v) => changes.push(plain(v)));
  studio.setScene("night", "ambient"); assert.deepEqual(plain(studio.scene()), { mode: "night", motion: "ambient" });
  assert.equal(studio.effectiveSceneMotion(), "still"); assert.equal(changes.length, 1); stop(); studio.setScene("studio", "still"); assert.equal(changes.length, 1);
});

test("Apply calls the live owner hook with sanitized snapshots", () => {
  const { studio, owners } = load(); const received = []; studio.attach({ applyVisuals: (v) => received.push(plain(v)) }); studio.applyPreset("paddock");
  assert.equal(received.at(-1).menuAccent, "team"); assert.equal(received.at(-1).homeScene, "garage"); assert.ok(owners.length);
});

test("A failed preview owner cannot prevent persistence, undo or profile restoration", () => {
  const { studio, values } = load({ uiTheme: "light" });
  studio.attach({ applyVisuals() { throw new Error("renderer temporarily unavailable"); } });
  assert.equal(studio.applyPreset("broadcast"), true); assert.equal(values.uiTheme, "dark");
  assert.equal(studio.undo(), true); assert.equal(values.uiTheme, "light");
});

test("Unrelated visual edits do not restart the Home scene", () => {
  const { studio } = load(); const changes = []; studio.onSceneChange((v) => changes.push(plain(v)));
  studio.setScene("garage", "still"); assert.equal(changes.length, 1);
  const next = studio.snapshot(); next.uiTheme = "light"; studio.applySnapshot(next);
  assert.equal(changes.length, 1); studio.setScene("night", "still"); assert.equal(changes.length, 2);
});

test("Home camera defaults and hostile saved choices normalize without expanding scene payload", () => {
  const fresh = load().studio;
  assert.equal(fresh.homeCamera(), "auto"); assert.equal(fresh.snapshot().homeCamera, "auto");
  const { studio, values } = load({ homeScene: "unknown", homeCamera: "driver" });
  assert.equal(studio.homeCamera(), "auto"); assert.deepEqual(plain(studio.scene()), { mode: "garage", motion: "still" });
  const changes = []; studio.onSceneChange((value) => changes.push(plain(value)));
  studio.setScene("garage", "still"); studio.setHomeCamera("front");
  assert.equal(values.homeCamera, "front"); assert.equal(studio.homeCamera(), "front"); assert.equal(changes.length, 2);
  assert.deepEqual(changes.at(-1), { mode: "garage", motion: "still" });
  studio.setHomeCamera("front"); assert.equal(changes.length, 2);
  studio.setHomeCamera("bad"); assert.equal(values.homeCamera, "auto"); assert.equal(changes.length, 3);
});

test("Circuit, pit lane and mixed environments persist through named visual profiles", () => {
  const { studio, values } = load({ steering: "pro" });
  for (const mode of ["auto", "track", "pitlane"]) {
    studio.setScene(mode, "ambient"); studio.setHomeCamera("side");
    assert.deepEqual(plain(studio.scene()), { mode, motion: "ambient" });
    studio.saveProfile(mode);
  }
  studio.setScene("garage", "still"); studio.setHomeCamera("rear");
  for (let i = 0; i < 3; i++) {
    assert.equal(studio.loadProfile("profile-" + (i + 1)), true);
    assert.equal(studio.scene().mode, ["auto", "track", "pitlane"][i]); assert.equal(studio.homeCamera(), "side");
    assert.equal(values.steering, "pro");
  }
});

test("Home scoped reset includes camera and environment while undo preserves other screens", () => {
  const { studio, values } = load({ homeScene: "pitlane", homeCamera: "rear", backgroundMotion: "ambient", hudProfile: "broadcast", uiTheme: "light", raceSettings: { laps: 18 } });
  const before = plain(studio.snapshot()); studio.reset("screen");
  assert.equal(studio.homeCamera(), "auto"); assert.deepEqual(plain(studio.scene()), { mode: "garage", motion: "still" });
  assert.equal(values.hudProfile, "broadcast"); assert.equal(values.uiTheme, "light"); assert.deepEqual(values.raceSettings, { laps: 18 });
  assert.equal(studio.undo(), true); assert.deepEqual(plain(studio.snapshot()), before);
  studio.applyPreset("classic", "screen"); assert.equal(studio.scene().mode, "static"); assert.equal(studio.homeCamera(), "auto");
  assert.equal(values.hudProfile, "broadcast"); assert.equal(values.uiTheme, "light");
});
