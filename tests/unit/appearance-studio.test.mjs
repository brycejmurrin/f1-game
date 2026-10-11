import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { makeDom } from "../helpers/mini-dom.mjs";

const source = fs.readFileSync(new URL("../../js/ui/appearance-studio.js", import.meta.url), "utf8").replace(/^const AppearanceStudio/m, "var AppearanceStudio");
function load(initial = {}, durable = true, reduced = false, document, globals = {}) {
  const values = structuredClone(initial), writes = [], owners = [];
  const store = { get: (k, d) => k in values ? values[k] : d, set: (k, v) => { values[k] = v; writes.push(k); return durable; },
    write: (k, v) => { values[k] = v; return { ok: true, durable, reason: durable ? null : "QuotaExceededError" }; } };
  const context = vm.createContext({ GameStore: { store }, Log: { info() {}, warn() {} }, setTimeout, clearTimeout,
    AppearanceOpts: { restore: (v) => owners.push(v) }, ScreenLooks: { normalize: (_id, v) => ({ ...v }), apply() {}, refresh() {} },
    window: { matchMedia: () => ({ matches: reduced }) }, document, ...globals });
  vm.runInContext(source, context); return { studio: context.AppearanceStudio, values, writes, owners };
}
const plain = (v) => JSON.parse(JSON.stringify(v));

function loadWithControls() {
  const dom = makeDom(), values = {};
  const panel = dom.byId("pm-panel-appearance"), titleFold = dom.byId("pm-titlescreen"), titleBody = dom.byId("pm-titlescreen-body");
  titleFold.appendChild(dom.byId("pm-titlescreen-sum")); titleFold.appendChild(titleBody); panel.appendChild(titleFold);
  titleBody.appendChild(dom.byId("pm-replay-intro"));
  panel.appendChild(dom.byId("pm-pausemenu-body")); dom.byId("pm-pausemenu-sum"); dom.byId("pausemenu"); dom.byId("overlay");
  panel.appendChild(dom.byId("pm-contrast"));
  dom.body.setAttribute("data-shape", "wide");
  const get = dom.document.getElementById;
  dom.document.getElementById = id => dom.has(id) ? get(id) : null;
  const store = { get: (k, d) => k in values ? values[k] : d, set: (k, v) => { values[k] = v; return true; } };
  const context = vm.createContext({ document: dom.document, GameStore: { store }, Log: { info() {}, warn() {} },
    setTimeout, clearTimeout, MutationObserver: class { observe() {} }, innerWidth: 1000, innerHeight: 500 });
  context.window = context;
  for (const file of ["setting-row", "appearance-opts", "title-layout", "pause-opts"]) {
    const code = fs.readFileSync(new URL("../../js/ui/" + file + ".js", import.meta.url), "utf8");
    vm.runInContext(code.replace(/^const\b/gm, "var"), context);
  }
  // Keep Studio's illustrative preview unmounted; the advanced controls above
  // use their real owners and real SettingRow selects.
  context.document = { readyState: "loading", addEventListener() {} };
  vm.runInContext(source, context); context.document = dom.document;
  return { studio: context.AppearanceStudio, appearance: context.AppearanceOpts, dom, values };
}

test("Colour Vision profiles, reset and Undo update the actual owner, palette and select; screen scope retains the global choice", () => {
  const { studio, appearance, dom, values } = loadWithControls();
  const assertMode = mode => {
    assert.equal(values.cvdMode, mode);
    assert.equal(studio.snapshot().cvdMode, mode);
    assert.equal(appearance.cvdMode(), mode);
    assert.equal(dom.byId("pm-cvd-sel").value, mode);
    assert.equal(dom.documentElement.dataset.cvd, mode === "off" ? undefined : mode);
  };
  for (const [mode] of appearance.CVD_MODES) {
    appearance.setCvdMode(mode); studio.saveProfile(mode);
  }
  assert.equal(studio.profiles().length, 4);
  appearance.setCvdMode("protan");
  studio.loadProfile("profile-2"); assertMode("deutan");
  studio.undo(); assertMode("protan");
  studio.loadProfile("profile-4"); assertMode("tritan");
  studio.reset("global"); assertMode("off");
  studio.undo(); assertMode("tritan");
  studio.applyPreset("classic", "screen"); assertMode("tritan");
  studio.reset("screen"); assertMode("tritan");
  for (const invalid of ["unknown", {}, 1, null]) assert.equal(studio.normalizeSnapshot({ cvdMode: invalid }).cvdMode, "off");
  studio.applySnapshot({ ...studio.snapshot(), cvdMode: "unknown" }); assertMode("off");
  studio.undo(); assertMode("tritan");
});

test("profile restore, Undo and reset repaint mounted title and pause controls without duplicating them", () => {
  const { studio, dom } = loadWithControls();
  const snapshot = studio.snapshot(); snapshot.titleLayout = { btns: { x: 18, size: 130 }, layout: "stack", side: "swap" };
  snapshot.pauseLayout = "sidebar"; snapshot.pauseSide = "right"; snapshot.pauseDim = "off";
  studio.applySnapshot(snapshot); studio.saveProfile("Custom layout");
  const titleCount = dom.byId("pm-titlescreen-body").children.length, pauseCount = dom.byId("pm-pausemenu-body").children.length;
  const assertControls = custom => {
    assert.equal(dom.byId("pm-tl-btns-x").value, custom ? "18" : "0");
    assert.equal(dom.byId("pm-tl-btns-size").value, custom ? "130" : "100");
    assert.equal(dom.byId("pm-tl-layout-sel").value, custom ? "stack" : "grid");
    assert.equal(dom.byId("pm-tl-side-sel").value, custom ? "swap" : "auto");
    assert.equal(dom.byId("pm-titlelayout-sum").textContent, "TITLE LAYOUT · " + (custom ? "CUSTOM" : "SHIPPED"));
    assert.equal(dom.byId("pm-titlescreen-sum").textContent, "TITLE SCREEN · " + (custom ? "CUSTOM" : "SHIPPED"));
    assert.equal(dom.byId("pm-pauselayout-sel").value, custom ? "sidebar" : "grid");
    assert.equal(dom.byId("pm-pauseside-sel").value, custom ? "right" : "centre");
    assert.equal(dom.byId("pm-pausedim-sel").value, custom ? "off" : "full");
    assert.equal(dom.documentElement.dataset.titleBtns, custom ? "stack" : undefined);
    assert.equal(dom.documentElement.dataset.pauseLayout, custom ? "sidebar" : undefined);
    assert.equal(dom.byId("pm-titlescreen-body").children.length, titleCount);
    assert.equal(dom.byId("pm-pausemenu-body").children.length, pauseCount);
  };
  assertControls(true);
  studio.reset("global"); assertControls(false);
  studio.loadProfile("profile-1"); assertControls(true);
  studio.undo(); assertControls(false);
  studio.undo(); assertControls(true);
  studio.applyPreset("classic"); assertControls(false);
});

test("Studio mounts once the document has passed loading (interactive included)", () => {
  for (const readyState of ["interactive", "complete", "loading"]) {
    const lookedUp = [], events = [];
    load({}, true, false, { readyState, getElementById(id) { lookedUp.push(id); return null; },
      addEventListener(name, callback) { events.push({ name, callback }); } });
    if (readyState === "loading") {
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
  assert.equal(clean.motion, null); assert.equal(clean.steering, undefined); assert.equal(clean.unlimitedBudget, undefined);
});

test("Undo restores the last visual batch; current-screen preset preserves other views", () => {
  const { studio, values } = load({ uiTheme: "light", hudProfile: "minimal", homeScene: "garage" });
  const before = plain(studio.snapshot()); studio.applyPreset("broadcast"); assert.equal(values.uiTheme, "dark");
  assert.equal(studio.undo(), true); assert.deepEqual(plain(studio.snapshot()), before); assert.equal(studio.undo(), false);
  studio.applyPreset("classic", "screen"); assert.equal(values.homeScene, "static");
  assert.equal(values.uiTheme, "light"); assert.equal(values.hudProfile, "minimal");
  // Screen-scope RESET restores the shipped home scene (photo), not the prior garage value.
  studio.reset("screen"); assert.equal(values.homeScene, "photo"); assert.equal(values.uiTheme, "light");
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
  const { studio } = load({}, true, true); assert.deepEqual(plain(studio.scene()), { mode: "photo", motion: "ambient" });
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
  assert.equal(fresh.homeCamera(), "side"); assert.equal(fresh.snapshot().homeCamera, "side");
  const { studio, values } = load({ homeScene: "unknown", homeCamera: "driver" });
  assert.equal(studio.homeCamera(), "side"); assert.deepEqual(plain(studio.scene()), { mode: "photo", motion: "ambient" });
  const changes = []; studio.onSceneChange((value) => changes.push(plain(value)));
  studio.setScene("garage", "still"); studio.setHomeCamera("front");
  assert.equal(values.homeCamera, "front"); assert.equal(studio.homeCamera(), "front"); assert.equal(changes.length, 2);
  assert.deepEqual(changes.at(-1), { mode: "garage", motion: "still" });
  studio.setHomeCamera("front"); assert.equal(changes.length, 2);
  studio.setHomeCamera("bad"); assert.equal(values.homeCamera, "side"); assert.equal(changes.length, 3);
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
  const { studio, values } = load({ homeScene: "pitlane", homeCamera: "rear", backgroundMotion: "still", hudProfile: "broadcast", uiTheme: "light", raceSettings: { laps: 18 } });
  const before = plain(studio.snapshot()); studio.reset("screen");
  assert.equal(studio.homeCamera(), "side"); assert.deepEqual(plain(studio.scene()), { mode: "photo", motion: "ambient" });
  assert.equal(values.hudProfile, "broadcast"); assert.equal(values.uiTheme, "light"); assert.deepEqual(values.raceSettings, { laps: 18 });
  assert.equal(studio.undo(), true); assert.deepEqual(plain(studio.snapshot()), before);
  studio.applyPreset("classic", "screen"); assert.equal(studio.scene().mode, "static"); assert.equal(studio.homeCamera(), "side");
  assert.equal(values.hudProfile, "broadcast"); assert.equal(values.uiTheme, "light");
});

test("profile apply, reset and Undo disclose session-only restoration when storage is unavailable", () => {
  const dom = makeDom(), panel = dom.byId("pm-panel-appearance"); panel.prepend = node => panel.insertBefore(node, panel.firstChild);
  const { studio } = load({}, false, false, dom.document);
  const descendants = node => [node, ...node.children.flatMap(descendants)];
  const status = descendants(dom.byId("appearance-studio")).find(node => node.dataset.as === "status");
  studio.saveProfile("Night"); studio.applyPreset("sunlight"); studio.loadProfile("profile-1");
  assert.match(status.textContent, /applied.*for this session; browser storage is unavailable/);
  studio.applyPreset("sunlight"); // reset needs something to change: unchanged keys are no longer rewritten
  studio.reset(); assert.match(status.textContent, /reset for this session; browser storage is unavailable/);
  studio.undo(); assert.match(status.textContent, /restored for this session; browser storage is unavailable/);
});

test("Studio retains quarter-percent scales and previews independent HUD accent and contrast precedence", () => {
  const dom = makeDom(), panel = dom.byId("pm-panel-appearance"); panel.prepend = node => panel.insertBefore(node, panel.firstChild);
  // Pin uiContrast off so panel opacity is visible; shipped default is high (solid).
  const { studio } = load({ uiScale: 109.25, hudPanelOpacity: 20, uiContrast: "off" }, true, false, dom.document,
    { getComputedStyle: () => ({ getPropertyValue: key => key === "--accent" ? "#00a3e0" : "" }) });
  const descendants = node => [node, ...node.children.flatMap(descendants)];
  const nodes = descendants(dom.byId("appearance-studio")), input = nodes.find(node => node.getAttribute("aria-label") === "UI size");
  const preview = nodes.find(node => node.dataset.as === "preview");
  assert.equal(input.step, .25); assert.equal(input.value, 109.25);
  assert.equal(preview.style.getPropertyValue("--preview-hud-accent"), "#00a3e0");
  assert.equal(preview.style.getPropertyValue("--preview-panel-opacity"), "0.2");
  studio.applySnapshot({ ...studio.snapshot(), uiContrast: "high" });
  assert.equal(preview.style.getPropertyValue("--preview-panel-opacity"), "1");
});

test("Opening Appearance marks the panel busy and defers scene preview off the click stack", () => {
  const dom = makeDom();
  const panel = dom.byId("pm-panel-appearance");
  const settings = dom.byId("pmsettings");
  panel.hidden = true; settings.hidden = false;
  panel.prepend = (node) => panel.insertBefore(node, panel.firstChild);
  const observers = [];
  const rafQueue = [];
  const sceneHits = [];
  const context = vm.createContext({
    document: dom.document, GameStore: { store: { get: (_k, d) => d, set: () => true } },
    Log: { info() {}, warn() {} }, setTimeout, clearTimeout,
    requestAnimationFrame: (fn) => { rafQueue.push(fn); return rafQueue.length; },
    MutationObserver: class {
      constructor(cb) { this.cb = cb; observers.push(this); }
      observe() {}
    },
    ScreenLooks: { endPeek() {}, normalize: (_id, v) => v, apply() {}, refresh() {} },
    matchMedia: () => ({ matches: false }),
    innerWidth: 1000, innerHeight: 500,
  });
  context.window = context;
  vm.runInContext(source, context);
  context.AppearanceStudio.attach({ previewScene: (s) => sceneHits.push(plain(s)) });
  sceneHits.length = 0; // attach() refreshes the live Home scene once; this test is about OPEN
  assert.equal(observers.length, 1, "studio watches the appearance panel");
  panel.hidden = false;
  observers[0].cb([{ attributeName: "hidden" }]);
  assert.equal(panel.getAttribute("aria-busy"), "true");
  assert.equal(sceneHits.length, 0, "preview must not run on the same turn as the open click");
  assert.ok(rafQueue.length >= 1);
  const first = rafQueue.splice(0, rafQueue.length);
  for (const fn of first) fn();
  assert.ok(rafQueue.length >= 1, "second frame schedules the real open work");
  const second = rafQueue.splice(0, rafQueue.length);
  for (const fn of second) fn();
  assert.equal(panel.getAttribute("aria-busy"), null);
  assert.ok(sceneHits.length >= 1, "garage preview runs after the sheet has a frame");
});

test("M2: Studio edits never pin motion:'on' and write only the keys that changed", () => {
  const { studio, values, writes } = load();
  studio.setScene("garage");
  assert.equal(studio.snapshot().motion, null);
  assert.ok(!("motion" in values), "an unset motion stays unset (touch auto comfort keeps working)");
  assert.deepEqual(writes, ["homeScene"], "unchanged keys are not frozen at today's value");
  writes.length = 0; studio.applyPreset("classic"); studio.reset();
  assert.ok(!writes.includes("motion"));
  // An explicit reduce is still honoured, and RESET/null removes the key rather than writing "on".
  studio.applyPreset("focus"); assert.equal(values.motion, "reduce");
  studio.reset(); assert.equal(values.motion, undefined);
  studio.undo(); assert.equal(values.motion, "reduce");
});
