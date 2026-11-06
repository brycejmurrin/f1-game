import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { makeDom } from "../helpers/mini-dom.mjs";
import { gameSource } from "../helpers/game-source.mjs";

const source = fs.readFileSync(new URL("../../js/ui/appearance-studio.js", import.meta.url), "utf8").replace(/^const AppearanceStudio/m, "var AppearanceStudio");
// Appearance adopts existing controls; mini-dom's default insertions omit
// detaching. These fixtures need the browser's single-parent DOM ownership.
function movingDom(document) {
  if (!document || !document.createElement) return;
  const wrapped = new WeakSet(), move = el => {
    if (!el || wrapped.has(el)) return el;
    wrapped.add(el);
    const append = el.appendChild, insert = el.insertBefore;
    el.appendChild = child => { if (child.parentNode) child.parentNode.removeChild(child); return append(child); };
    el.insertBefore = (child, before) => {
      if (child === before) return child;
      if (child.parentNode) child.parentNode.removeChild(child);
      return insert(child, before);
    };
    return el;
  };
  for (const el of [document.documentElement, document.body, document.head]) move(el);
  const get = document.getElementById, create = document.createElement;
  document.getElementById = id => move(get(id));
  document.createElement = tag => move(create(tag));
}
function load(initial = {}, durable = true, reduced = false, document, globals = {}) {
  movingDom(document);
  const values = structuredClone(initial), writes = [], owners = [];
  const store = { get: (k, d) => k in values ? values[k] : d, set: (k, v) => { values[k] = v; writes.push(k); return durable; },
    write: (k, v) => { values[k] = v; return { ok: true, durable, reason: durable ? null : "QuotaExceededError" }; } };
  const context = vm.createContext({ GameStore: { store }, Log: { info() {}, warn() {} }, setTimeout, clearTimeout,
    AppearanceOpts: { restore: (v) => owners.push(v) }, ScreenLooks: { normalize: (_id, v) => ({ ...v }), apply() {}, refresh() {} },
    window: { matchMedia: () => ({ matches: reduced }) }, document, ...globals });
  vm.runInContext(source, context); return { studio: context.AppearanceStudio, values, writes, owners };
}
const plain = (v) => JSON.parse(JSON.stringify(v));

test("game's Studio integration refreshes touch button size after profile apply, reset and Undo", () => {
  const dom = makeDom(), values = {};
  const input = dom.byId("pm-btnscale"), output = dom.byId("pm-btnscale-v");
  const store = { get: (key, fallback) => key in values ? values[key] : fallback,
    set: (key, value) => { values[key] = value; return true; }, raw: () => null, rawSet: () => true };
  // Run the real scale owner and the actual game attachment, rather than a
  // replacement hook that could accidentally fix the integration under test.
  const context = vm.createContext({ GameStore: { store }, document: { readyState: "loading", addEventListener() {},
    documentElement: dom.documentElement }, window: { matchMedia: () => ({ matches: false }) },
    Log: { info() {}, warn() {} }, setTimeout, clearTimeout, requestAnimationFrame: () => 1,
    SettingRow: { paint() {}, wire() {}, labels: values => values }, PerfGov: { setAutoRes() {} },
    G: {}, mirrorPass: { setMode() {} }, paintHudDetailsSummary() {}, syncMetricsOverlayCompact() {},
    uiExperience: { previewScene() {} }, scaleDeps: { $: id => id === "pm-btnscale" ? input : id === "pm-btnscale-v" ? output : null,
      els: {}, store, gfx: {} } });
  vm.runInContext(fs.readFileSync(new URL("../../js/ui/scale.js", import.meta.url), "utf8"), context);
  vm.runInContext("const uiScale = UiScale.create(scaleDeps);", context);
  vm.runInContext(source, context);
  const game = gameSource();
  const attachment = game.match(/AppearanceStudio\.attach\(\{[\s\S]*?\n\}\);/);
  assert.ok(attachment, "game must attach the Studio's live visual owners");
  vm.runInContext(attachment[0], context);
  const studio = context.AppearanceStudio;
  const setButtons = value => vm.runInContext(`uiScale.setScale("hudBtnScale", "--hud-btn-scale", ${value});`, context);
  const assertButtons = (stored, css, displayed) => {
    assert.equal(values.hudBtnScale, stored);
    assert.equal(dom.documentElement.style.getPropertyValue("--hud-btn-scale"), css);
    assert.equal(input.value, displayed);
  };
  setButtons(200); studio.saveProfile("Large pedals"); setButtons(100);
  studio.loadProfile("profile-1"); assertButtons(200, "2", "200");
  studio.reset(); assertButtons(null, "", "100");
  studio.undo(); assertButtons(200, "2", "200");
});

function loadWithControls(moving = false) {
  const dom = makeDom(), values = {};
  if (moving) movingDom(dom.document);
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
  return { studio: context.AppearanceStudio, appearance: context.AppearanceOpts, dom, values, title: context.TitleLayout };
}

test("Menu customization exposes the existing editor and retains persistence, focus and Home-only ownership", async () => {
  const { studio, title, dom, values } = loadWithControls(true);
  const panel = dom.byId("pm-panel-appearance"); panel.prepend = node => panel.insertBefore(node, panel.firstChild);
  for (const id of ["pmsettings", "tl-editor", "tl-done", "menu-buttons", "menu-brand"]) {
    const el = dom.document.createElement(id === "tl-done" ? "button" : "div"); el.id = id; dom.body.appendChild(el);
  }
  dom.byId("tl-editor").appendChild(dom.byId("tl-done"));
  const edit = dom.byId("pm-tl-edit"), fold = dom.byId("pm-titlescreen");
  studio.initUI();
  const menu = dom.byId("ap-menu-customization"), controls = menu.parentNode;
  assert.equal(edit.textContent, "EDIT MAIN MENU");
  assert.ok(edit.parentNode === menu, "reuse the original launcher, including its focus and disabled-state owner");
  assert.ok(fold.parentNode === menu, "menu controls are outside the Advanced fold");
  const profile = controls.children.find(child => child.children.some(node => node.textContent === "APPEARANCE PROFILE"));
  const order = Array.from(controls.children); const menuAt = order.indexOf(menu), profileAt = order.indexOf(profile);
  assert.ok(menuAt >= 0 && menuAt < profileAt, "menu tools precede profile management");
  assert.equal(dom.document.querySelectorAll("#pm-tl-edit").length, 1);
  edit.click();
  assert.equal(title.editing, true);
  assert.equal(panel.hidden, true);
  assert.equal(dom.byId("pmsettings").hidden, true);
  dom.byId("tl-size-up").click();
  assert.equal(values.titleLayout.wide.btns.size, 105, "real editor writes the existing landscape preference");
  dom.byId("tl-done").click();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(title.editing, false);
  assert.equal(panel.hidden, false);
  assert.equal(dom.byId("pmsettings").hidden, false);
  assert.ok(dom.document.activeElement === edit, "Done returns focus to the visible Menu customization launcher");
  studio.saveProfile("My menu"); studio.reset();
  assert.equal(title.current().btns.size, 100);
  studio.loadProfile("profile-1"); assert.equal(title.current().btns.size, 105);
  studio.undo(); assert.equal(title.current().btns.size, 100);
  const x = dom.byId("pm-tl-btns-x"); x.value = "11";
  dom.dispatch(x, { type: "input", bubbles: true });
  assert.equal(title.current().btns.x, 11);
  await new Promise(resolve => setTimeout(resolve, 360));
  assert.equal(studio.undo(), true, "the adopted fold still records owner input for Undo");
  assert.equal(title.current().btns.x, 0);
  dom.byId("overlay").hidden = true; title.build();
  assert.equal(edit.disabled, true, "main-menu editing is unavailable during a race");
  assert.equal(title.enter(), false);
  assert.equal(panel.hidden, false, "a rejected entry preserves Settings");
  studio.initUI(); assert.equal(dom.document.querySelectorAll("#pm-tl-edit").length, 1, "reopening does not duplicate controls");
});

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

test("HUD screen scope does not rewrite the global HUD profile", () => {
  assert.equal(studioForScope().includes("hudProfile"), false);
});

test("every ScreenLooks page has a screen scope and a preview entry", () => {
  const { studio } = load();
  const keys = id => Array.from(studio.SCREEN_KEYS[id]);
  assert.deepEqual(keys("pause"), ["lookPause"]);
  assert.deepEqual(keys("datahub"), ["lookDatahub"]);
  assert.deepEqual(keys("select"), ["lookSelect"]);
  assert.deepEqual(keys("race"), ["lookRace"]);
  assert.deepEqual(keys("career"), ["lookCareer"]);
  assert.deepEqual(keys("garage"), ["lookGarage"]);
  assert.deepEqual(keys("popups"), ["lookPopups"]);
  const sourceText = fs.readFileSync(new URL("../../js/ui/appearance-studio.js", import.meta.url), "utf8");
  for (const id of ["pause", "datahub", "select", "career", "race", "garage", "hud", "popups"]) {
    assert.match(sourceText, new RegExp('\\[\\"' + id + '\\",'), id + " preview button");
  }
});

function studioForScope() {
  return load({ hudProfile: "minimal" }).studio.SCREEN_KEYS.hud;
}

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

test("Studio previews independent HUD accent and contrast precedence", () => {
  const dom = makeDom(), panel = dom.byId("pm-panel-appearance"); panel.prepend = node => panel.insertBefore(node, panel.firstChild);
  // Pin uiContrast off so panel opacity is visible; shipped default is high (solid).
  const { studio } = load({ uiScale: 109.25, hudPanelOpacity: 20, uiContrast: "off" }, true, false, dom.document,
    { getComputedStyle: () => ({ getPropertyValue: key => key === "--accent" ? "#00a3e0" : "" }) });
  const descendants = node => [node, ...node.children.flatMap(descendants)];
  const nodes = descendants(dom.byId("appearance-studio"));
  const preview = nodes.find(node => node.dataset.as === "preview");
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
  studio.applySnapshot({ ...studio.snapshot(), motion: "reduce" }); assert.equal(values.motion, "reduce");
  studio.reset(); assert.equal(values.motion, undefined);
  studio.undo(); assert.equal(values.motion, "reduce");
});


test("one home (#2846): the Studio builds no second copy and jumps to HUD and motion homes", () => {
  const dom = makeDom(), panel = dom.byId("pm-panel-appearance"); panel.prepend = node => panel.insertBefore(node, panel.firstChild);
  load({}, true, true, dom.document);
  const descendants = el => [el, ...el.children.flatMap(descendants)];
  const all = descendants(dom.byId("appearance-studio"));
  assert.equal(all.filter(el => el.type === "range" || el.type === "color").length, 0, "no studio-owned size sliders or colour pickers");
  for (const key of ["uiTheme", "menuAccent", "textSize", "uiScale", "uiContrast", "motion", "hudProfile", "hudAccent", "hudScale", "hudMetricsLayout"])
    assert.ok(!all.some(el => el.id === "as-" + key), "no studio row for " + key);
  const jumps = all.filter(el => el.dataset.settingsJump).map(el => el.dataset.settingsJump + ">" + el.dataset.jumpTarget);
  assert.deepEqual(jumps, ["a11y>pm-motion-sel", "display>pm-hudprofile-sel", "display>pm-hudscale", "display>pm-hudmetrics-sel"]);
});

test("cosmetic presets retain accessibility and units without writing those preferences", () => {
  const preferences = { motion: "reduce", textSize: "larger", uiScale: 137.5, uiContrast: "high", cvdMode: "tritan", speedUnits: "mph", cbCues: "on" };
  for (const preset of ["classic", "paddock", "broadcast", "focus", "sunlight"]) {
    const { studio, values, writes } = load(preferences);
    const before = plain(studio.snapshot());
    studio.applyPreset(preset);
    for (const [key, value] of Object.entries(preferences)) {
      assert.equal(values[key], value, preset + " preserves " + key);
      assert.ok(!writes.includes(key), preset + " leaves storage untouched for " + key);
    }
    studio.undo(); assert.deepEqual(plain(studio.snapshot()), before);
  }
});

test("profile application obeys selected screen scope and undo restores the affected screen", () => {
  const dom = makeDom(), panel = dom.byId("pm-panel-appearance");
  panel.prepend = node => panel.insertBefore(node, panel.firstChild);
  const { studio, values } = load({ homeScene: "garage", uiTheme: "light", motion: "reduce" }, true, false, dom.document);
  studio.saveProfile("Garage light");
  studio.applySnapshot({ ...studio.snapshot(), homeScene: "night", uiTheme: "dark", motion: "off" });
  const before = plain(studio.snapshot());
  const descendants = el => [el, ...el.children.flatMap(descendants)];
  const buttons = descendants(panel).filter(el => el.tagName === "BUTTON");
  buttons.find(el => el.textContent === "THIS SCREEN").click();
  buttons.find(el => el.textContent === "APPLY PROFILE").click();
  assert.equal(values.homeScene, "garage");
  assert.equal(values.uiTheme, "dark"); assert.equal(values.motion, "off");
  studio.undo(); assert.deepEqual(plain(studio.snapshot()), before);
  studio.loadProfile("profile-1", "global");
  assert.equal(values.uiTheme, "light"); assert.equal(values.motion, "reduce");
});

function photoPickerHarness(album, setBackground = () => true) {
  const dom = makeDom(), panel = dom.byId("pm-panel-appearance");
  panel.prepend = node => panel.insertBefore(node, panel.firstChild);
  const observers = [];
  const result = load({}, true, false, dom.document, {
    PhotoStudio: { album, setBackground },
    ScreenLooks: { endPeek() {}, normalize: (_id, value) => value, apply() {}, refresh() {} },
    MutationObserver: class { constructor(cb) { observers.push(cb); } observe() {} },
  });
  const descendants = node => [node, ...node.children.flatMap(descendants)];
  const nodes = descendants(panel), find = text => nodes.find(node => node.textContent === text);
  return { ...result, dom, panel, observers, select: nodes.find(node => node.getAttribute("aria-label") === "Saved photo"),
    preview: nodes.find(node => node.dataset.as === "photo-preview"), box: nodes.find(node => node.dataset.as === "photo-picker"),
    note: nodes.find(node => node.dataset.as === "photo-picker").children.at(-1), choose: find("CHOOSE PHOTO"), refresh: find("REFRESH PHOTOS") };
}
const photoTick = () => new Promise(resolve => setImmediate(resolve));

test("saved photo picker previews only on selection and persists only on explicit Choose", async () => {
  const saved = [], rows = Array.from({ length: 8 }, (_, i) => ({ id: String(i), title: "Photo " + i, thumb: "data:image/jpeg;base64,AAAA" }));
  const h = photoPickerHarness(async () => rows, thumb => { saved.push(thumb); return true; });
  await photoTick();
  assert.equal(h.select.tagName, "SELECT"); assert.equal(h.select.children.length, 7, "six photos plus prompt");
  assert.equal(h.choose.disabled, true); assert.equal(h.preview.hidden, true); assert.deepEqual(saved, []);
  h.select.value = "2"; h.dom.dispatch(h.select, { type: "change" });
  assert.equal(h.preview.src, rows[2].thumb); assert.equal(h.preview.alt, "Preview: Photo 2");
  assert.equal(h.choose.disabled, false); assert.deepEqual(saved, []);
  h.choose.click(); assert.deepEqual(saved, [rows[2].thumb]); assert.equal(h.studio.scene().mode, "photo");
  assert.match(h.note.textContent, /Photo 2 chosen/);
  assert.ok(h.panel.querySelectorAll("button").some(button => button.textContent === "PHOTO STUDIO & MY BACKGROUND"), "import door retained");
  assert.ok(h.panel.querySelectorAll("button").some(button => button.textContent === "RESET SCOPE"), "reset retained");
});

test("saved photo empty, failed load and failed background writes are recoverable", async () => {
  let mode = "empty", writes = 0;
  const h = photoPickerHarness(async () => {
    if (mode === "failure") throw new Error("Unavailable");
    return mode === "empty" ? [] : [{ id: "safe", title: "Safe", thumb: "data:image/png;base64,AAAA" }, { id: "unsafe", thumb: "https://invalid.test/photo" }];
  }, () => { writes++; return false; });
  await photoTick(); assert.match(h.note.textContent, /No saved photos/); assert.equal(h.select.disabled, true);
  mode = "failure"; h.refresh.click(); await photoTick(); assert.match(h.note.textContent, /could not load.*Refresh/); assert.equal(h.choose.disabled, true);
  mode = "saved"; h.refresh.click(); await photoTick(); assert.equal(h.select.children.length, 2); assert.equal(h.select.disabled, false);
  h.select.value = "safe"; h.dom.dispatch(h.select, { type: "change" }); h.choose.click();
  assert.equal(writes, 1); assert.match(h.note.textContent, /could not be saved/); assert.equal(h.studio.scene().mode, "photo");
});

test("saved photo refresh ignores superseded responses and responses after Appearance closes", async () => {
  const pending = [], h = photoPickerHarness(() => new Promise(resolve => pending.push(resolve)));
  h.refresh.click();
  pending[1]([{ id: "new", title: "New", thumb: "data:image/jpeg;base64,BBBB" }]); await photoTick();
  pending[0]([{ id: "old", title: "Old", thumb: "data:image/jpeg;base64,AAAA" }]); await photoTick();
  assert.equal(h.select.children[1].value, "new");
  h.refresh.click(); h.panel.hidden = true; h.observers[0]();
  pending[2]([{ id: "closed", title: "Closed", thumb: "data:image/jpeg;base64,CCCC" }]); await photoTick();
  assert.equal(h.select.children[1].value, "new"); assert.equal(h.box.hasAttribute("aria-busy"), false);
});

// Count real Studio DOM rebuilds, while keeping timers deterministic and avoiding
// scene rendering. The assertions also check the state those renders must show.
function loadStudioRenderCounts() {
  const dom = makeDom(), panel = dom.byId("pm-panel-appearance");
  panel.prepend = node => panel.insertBefore(node, panel.firstChild);
  const advanced = dom.document.createElement("input"); panel.appendChild(advanced);
  const values = { homeScene: "static" }, subscribers = [], timers = new Map(), microtasks = [];
  let timerId = 0;
  const store = { get: (key, fallback) => key in values ? values[key] : fallback,
    set(key, value) { values[key] = value; for (const fn of subscribers) fn({ key }); return true; },
    subscribe: fn => subscribers.push(fn) };
  const { studio } = load({}, true, false, dom.document, {
    GameStore: { store }, setTimeout: fn => { const id = ++timerId; timers.set(id, fn); return id; },
    clearTimeout: id => timers.delete(id), queueMicrotask: fn => microtasks.push(fn),
  });
  const descendants = node => [node, ...node.children.flatMap(descendants)];
  const root = dom.byId("appearance-studio"), nodes = descendants(root);
  const preview = nodes.find(node => node.dataset.as === "preview");
  const profiles = nodes.find(node => node.getAttribute("aria-label") === "Saved appearance profiles");
  const counts = { preview: 0, profiles: 0 };
  for (const [key, node] of Object.entries({ preview, profiles })) {
    const replace = node.replaceChildren;
    node.replaceChildren = (...children) => { counts[key]++; return replace(...children); };
  }
  const flush = () => {
    while (microtasks.length) microtasks.shift()();
    for (const [id, fn] of timers) { timers.delete(id); fn(); }
  };
  function expectRenders(action, expected = 1) {
    counts.preview = counts.profiles = 0; action(); flush();
    assert.deepEqual(counts, { preview: expected, profiles: expected });
  }
  return { studio, dom, root, nodes, profiles, values, store, advanced, expectRenders };
}

test("Studio renders choices, presets, Undo, reset and profile application once with final state", () => {
  const h = loadStudioRenderCounts(), { studio, expectRenders } = h;
  const preset = h.nodes.find(node => node.dataset.preset === "broadcast");
  const camera = h.nodes.find(node => node.id === "as-homeCamera").children;
  const front = camera.find(node => node.textContent === "Front");
  front.focus();
  expectRenders(() => h.dom.dispatch(front, { type: "click", bubbles: true }));
  assert.equal(studio.homeCamera(), "front");
  assert.equal(front.getAttribute("aria-pressed"), "true");
  assert.equal(h.dom.document.activeElement, front);
  assert.equal(h.root.contains(front), true, "choice and focused node survive preview rendering");
  const beforePreset = plain(studio.snapshot());
  expectRenders(() => studio.applyPreset("broadcast"));
  assert.equal(preset.getAttribute("aria-pressed"), "true");
  expectRenders(() => assert.equal(studio.undo(), true));
  assert.deepEqual(plain(studio.snapshot()), beforePreset);
  assert.equal(preset.getAttribute("aria-pressed"), "false", "Undo paints the cleared preset immediately");
  studio.saveProfile("Front camera");
  expectRenders(() => studio.setHomeCamera("rear"));
  expectRenders(() => assert.equal(studio.loadProfile("profile-1"), true));
  assert.equal(studio.homeCamera(), "front");
  assert.equal(h.profiles.value, "profile-1", "profile selection is set before rendering");
  expectRenders(() => studio.reset());
  assert.equal(studio.homeCamera(), "side");
  assert.equal(h.profiles.value, "profile-1");
  expectRenders(() => assert.equal(studio.undo(), true));
  assert.equal(studio.homeCamera(), "front");
});

test("Studio renders external changes and advanced input/click history without losing updates", () => {
  const h = loadStudioRenderCounts(), { studio, expectRenders } = h;
  expectRenders(() => h.store.set("homeCamera", "rear"));
  assert.equal(studio.homeCamera(), "rear");
  // These advanced owners predate store subscriptions: exercise their event path
  // independently so removing rendering from remember() cannot drop the update.
  for (const [type, value] of [["input", "front"], ["click", "hero"]]) {
    const before = plain(studio.snapshot());
    expectRenders(() => {
      h.values.homeCamera = value;
      h.dom.dispatch(h.advanced, { type, bubbles: true });
    });
    const choices = h.nodes.find(node => node.id === "as-homeCamera").children;
    assert.equal(choices.find(node => node.textContent.toLowerCase() === value).getAttribute("aria-pressed"), "true");
    expectRenders(() => assert.equal(studio.undo(), true));
    assert.deepEqual(plain(studio.snapshot()), before);
  }
  expectRenders(() => h.dom.dispatch(h.advanced, { type: "click", bubbles: true }), 0);
});

test("Studio coalesces an advanced click and its store notification while preserving scene events and Undo", () => {
  const h = loadStudioRenderCounts(), { studio, expectRenders } = h;
  const before = plain(studio.snapshot()), scenes = [];
  studio.attach({}); // Establish the initial scene key before counting changes.
  studio.onSceneChange(() => scenes.push(studio.homeCamera()));
  h.advanced.addEventListener("click", () => h.store.set("homeCamera", "front"));
  expectRenders(() => h.dom.dispatch(h.advanced, { type: "click", bubbles: true }));
  assert.equal(studio.homeCamera(), "front");
  assert.deepEqual(scenes, ["front"], "the delayed subscription still notifies scene owners after the click rendered");
  const choices = h.nodes.find(node => node.id === "as-homeCamera").children;
  assert.equal(choices.find(node => node.textContent === "Front").getAttribute("aria-pressed"), "true");
  expectRenders(() => h.dom.dispatch(h.advanced, { type: "click", bubbles: true }), 0);
  assert.deepEqual(scenes, ["front"], "an unchanged click neither renders nor repeats scene notification");
  expectRenders(() => assert.equal(studio.undo(), true));
  assert.deepEqual(plain(studio.snapshot()), before);
  assert.deepEqual(scenes, ["front", "side"]);
  expectRenders(() => assert.equal(studio.undo(), false), 0);
});
