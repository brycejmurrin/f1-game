/* race-setup-sheets.test.mjs — unit pins for Race Settings CUSTOM / weekend
 * header chrome and Season SETUP scroll + preset wrap (#1016/#1082 layer).
 *
 * Race Settings: when laps/weather/… match no named preset (e.g. 3 laps), the
 * preset row lights CUSTOM instead of nothing; FULL WEEKEND keeps
 * START QUALIFYING on the CTA and the H2 says WEEKEND · QUALIFYING FIRST.
 * Season SETUP: one themed scroll on narrow, paired themed thumbs without a
 * ScrollFade double bar at 1280, FULL…REVERSE chips wrap with no orphan.
 *
 * Owned sources: js/race/race-settings.js, css/race-setup.css,
 * js/career/season-ui.js (season chrome already on tip from #1082).
 *
 * Run: node --test tests/unit/race-setup-sheets.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { cssRules, decl, ruleFor } from "../helpers/css-rules.mjs";
import { readCssSource } from "../helpers/css-source.mjs";
import { makeDom } from "../helpers/mini-dom.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const raceCss = () => cssRules(fs.readFileSync(path.join(ROOT, "css/race-setup.css"), "utf8"));
const menusFamily = () => cssRules(readCssSource("css/menus.css"));
const seasonUi = () => fs.readFileSync(path.join(ROOT, "js/career/season-ui.js"), "utf8");

function RaceSettings() {
  const ctx = vm.createContext({});
  vm.runInContext(
    fs.readFileSync(path.join(ROOT, "js/race/race-settings.js"), "utf8")
      .replace(/^const RaceSettings\b/m, "var RaceSettings"),
    ctx,
  );
  return ctx.RaceSettings;
}

const RS = RaceSettings();

function sheet(o = {}) {
  const dom = makeDom();
  const ctx = vm.createContext({
    document: dom.document,
    Log: { info() {}, warn() {} },
    queueMicrotask,
  });
  vm.runInContext(
    fs.readFileSync(path.join(ROOT, "js/race/race-settings.js"), "utf8")
      .replace(/^const RaceSettings\b/m, "var RaceSettings"),
    ctx,
  );
  const disk = new Map();
  const store = {
    get: (k, d) => (disk.has(k) ? JSON.parse(disk.get(k)) : d),
    set: (k, v) => { disk.set(k, JSON.stringify(v)); return true; },
  };
  const LIST = [{ id: "spa", name: "Spa", gpLaps: 44 }, { id: "monaco", name: "Monaco", gpLaps: 79 }];
  // Seed the three named presets so paintPresetState can toggle them.
  const row = dom.byId("rs-presets");
  row.className = "preset-row balanced-row";
  for (const id of ["quick", "weekend", "endurance"]) {
    const b = dom.document.createElement("button");
    b.id = "rs-preset-" + id;
    b.type = "button";
    b.className = "preset-btn";
    b.setAttribute("data-rs-preset", id);
    b.textContent = id.toUpperCase();
    row.appendChild(b);
  }
  const G = {
    flow: "gp", session: "race", trackIdx: 0, season: null, daily: null,
    netLobby: { roomChanged() {} },
    raceLaps: 3, raceWeather: "dry", raceTimeOfDay: "default", raceChangeable: false,
    wxArcPlan: null, difficulty: "hard", raceGrid: "tier", champGrid: "champ",
    raceReliability: "off", raceTyreWear: "off", raceDirtyAir: "off",
    duel: false, duelLegend: "", soundOn: false, teamIdx: 0, pits: null, aiPace: "scripted",
    cautionInfo: () => ({ enabled: false }),
    $: (id) => dom.byId(id), store, GAME_LAPS: 3, TT_LAPS: 4,
    scheduleFlybyTrack() {}, setCautionEnabled() {}, startRace() {}, buildSelect() {},
    els: { selGo: dom.byId("sel-go") }, openGarage() {},
  };
  // Mirror game.js: raceQuali is a view of the grid rule (quali | rev10).
  Object.defineProperty(G, "raceQuali", {
    configurable: true,
    get() { return G.raceGrid === "quali" || G.raceGrid === "rev10"; },
    set(v) {
      const on = G.raceGrid === "quali" || G.raceGrid === "rev10";
      if (!!v !== on) G.raceGrid = v ? "quali" : "tier";
    },
  });
  Object.assign(G, o);
  const rs = ctx.RaceSettings.create(G, {
    GameAudio: {}, Tracks: { LIST },
    SettingRow: { paint() {}, disable() {}, wire() {} },
    DrivingLine: { mode: () => "off", setMode: (v) => v },
    SeasonCal: { formatLaps: (n) => n, quali: () => false, qualiNext: () => false },
    qualiResults: () => null, openQuali() {}, enableTilt() {},
    getSteerMode: () => "buttons", buildStandings() {}, raceIntro: (go) => go(),
  });
  rs.wireButtons();
  return { G, rs, dom, LIST };
}

// ── Race Settings: pure match + title ────────────────────────────────────────

test("matchPreset: 3-lap default draft is CUSTOM (null); weekend/quick/endurance match", () => {
  const full = 57;
  assert.equal(RS.matchPreset({
    laps: 3, weather: "dry", mixed: false, time: "default",
    difficulty: "hard", grid: "tier", reliability: "off", tyres: "off",
  }, full), null, "default 3 laps matches no named preset");

  assert.equal(RS.matchPreset(RS.presetValues("quick", full), full), "quick");
  assert.equal(RS.matchPreset(RS.presetValues("weekend", full), full), "weekend");
  assert.equal(RS.matchPreset(RS.presetValues("endurance", full), full), "endurance");

  const almost = Object.assign({}, RS.presetValues("weekend", full), { laps: 3 });
  assert.equal(RS.matchPreset(almost, full), null, "weekend with 3 laps is CUSTOM");
});

test("sheetTitle: WEEKEND · QUALIFYING FIRST when weekend matches and quali is next", () => {
  assert.equal(RS.sheetTitle({ matched: "weekend", qualifies: true }), "WEEKEND · QUALIFYING FIRST");
  assert.equal(RS.sheetTitle({ matched: "weekend", qualifies: false }), "RACE SETTINGS",
    "after quali the weekend header yields to RACE SETTINGS");
  assert.equal(RS.sheetTitle({ matched: null, qualifies: true }), "RACE SETTINGS",
    "manual quali grid alone does not rename the sheet");
  assert.equal(RS.sheetTitle({ practice: true, matched: "weekend", qualifies: true }), "PRACTICE SETTINGS");
  assert.equal(RS.sheetTitle({ timeTrial: true }), "TIME TRIAL SETTINGS");
  assert.equal(RS.sheetTitle({ netRoom: true, matched: "weekend", qualifies: true }), "RACE SETTINGS");
});

test("paintPresetState lights CUSTOM when no preset matches; weekend lights weekend", () => {
  const h = sheet();
  h.rs.openRaceSettings("select");
  const row = h.dom.byId("rs-presets");
  const custom = h.dom.byId("rs-preset-custom");
  assert.ok(custom, "CUSTOM chip is minted into #rs-presets");
  assert.equal(custom.getAttribute("data-rs-preset"), null, "CUSTOM is not a writable preset");
  assert.equal(custom.getAttribute("aria-disabled"), "true");
  assert.equal(custom.children[0] && custom.children[0].textContent, "change any setting",
    "CUSTOM hint tells the player how it lights, not a tap target (Pages recheck 2026-10-08)");
  assert.ok(custom.classList.contains("active"), "3-lap open lights CUSTOM");
  assert.equal(custom.getAttribute("aria-pressed"), "true");
  assert.equal(row.getAttribute("data-rs-match"), "custom");
  for (const id of ["quick", "weekend", "endurance"]) {
    assert.equal(h.dom.byId("rs-preset-" + id).classList.contains("active"), false);
  }

  assert.equal(h.rs.applyPreset("weekend"), true);
  h.rs.openRaceSettings("select");
  assert.equal(h.dom.byId("rs-preset-weekend").classList.contains("active"), true);
  assert.equal(h.dom.byId("rs-preset-custom").classList.contains("active"), false);
  assert.equal(row.getAttribute("data-rs-match"), "weekend");
  assert.equal(h.dom.byId("dlg-racesettings").textContent, "WEEKEND · QUALIFYING FIRST",
    "weekend + quali grid renames the H2; CTA stays START QUALIFYING");
  assert.equal(h.dom.byId("rs-go").textContent, "START QUALIFYING");
});

test("race-setup.css keeps a display-only rule for #rs-preset-custom", () => {
  const rules = raceCss();
  assert.equal(decl(rules, "#rs-preset-custom", "cursor"), "default");
});

// ── Season SETUP chrome (tip #1082; pin so this sheet suite owns both) ───────

test("season-setup uses dark color-scheme so native thumbs follow Apex chrome", () => {
  const rules = raceCss();
  assert.equal(decl(rules, "#season-setup", "color-scheme"), "dark");
  assert.equal(decl(rules, ':root[data-ui-theme="light"] #season-setup', "color-scheme"), "light");
});

test("paired panes theme thin scrollbars and suppress the ScrollFade double bar", () => {
  const rules = raceCss();
  const panes = '#ss-inner[data-pair="on"] :is(#ss-cal, #ss-pool)';
  assert.equal(decl(rules, panes, "scrollbar-width"), "thin");
  assert.equal(decl(rules, panes, "scrollbar-color"), "var(--plate-line) transparent");
  assert.match(decl(rules, panes, "padding-bottom") || "", /var\(--pad\)/);
  assert.equal(
    decl(rules, '#ss-inner[data-pair="on"] :is(#ss-cal, #ss-pool).sf-scroll::before', "display"),
    "none");
  assert.ok(ruleFor(rules, /#ss-inner\[data-pair="on"\] :is\(#ss-cal, #ss-pool\)::-webkit-scrollbar-thumb/));
});

test("stacked season setup keeps one themed scroll owner on #ss-body", () => {
  const rules = menusFamily();
  const body = '#ss-inner:not([data-pair="on"]) > #ss-body';
  assert.equal(decl(rules, body, "overflow-y"), "auto");
  assert.equal(decl(rules, body, "scrollbar-width"), "thin");
  assert.equal(decl(rules, body, "scrollbar-color"), "var(--plate-line) transparent");
  assert.match(decl(rules, body, "padding-bottom") || "", /var\(--pad\)/);
  assert.equal(decl(rules, '#ss-inner:not([data-pair="on"]) > #ss-body > .pane', "overflow"), "visible");
});

test("preset chips are a balanced-row with a quarter-row basis (no REVERSE orphan)", () => {
  assert.match(seasonUi(), /el\("div",\s*"chip-row balanced-row"\)/);
  const rules = raceCss();
  assert.equal(decl(rules, "#ss-presets", "--balance-basis"), "calc(25% - var(--gap) * 0.75)",
    "quarter-row basis packs eight chips as 4+4 (never a one-chip REVERSE orphan)");
  assert.equal(decl(rules, "#ss-presets", "--balance-min"), "3.75rem");
  assert.equal(decl(rules, "#ss-presets > .sel-chip", "max-width"), "calc(25% - var(--gap) * 0.75)",
    "long labels (2026 REAL) must not expand past a quarter-row");
});
