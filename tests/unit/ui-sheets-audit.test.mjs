/* ui-sheets-audit.test.mjs — the PAUSE / SETTINGS / RESULTS sheet audit
 * (2026-09-02), pinned as BEHAVIOUR on tests/helpers/mini-dom.mjs.
 *
 * Every test here demonstrates a finding that was CONFIRMED without a
 * browser, and would have been red on the tree the audit started from:
 *   - RESULTS top-10 and the WORLD CHAMPION panel sorted by points alone,
 *     while STANDINGS used SeasonCal.rank (countback) — two screens, two
 *     orders, and on a points tie the wrong driver was crowned.
 *   - STANDINGS said "AFTER ROUND r" mid-weekend, when round r+1's sprint had
 *     already scored; from the pause menu its NEXT line named the race being
 *     driven as the next one.
 *   - The in-race two-tap reload confirm (RENDERER / THREE PATH / SCREENSHOTS
 *     / RESET RENDERER) never disarmed: an unconfirmed tap left "END THIS
 *     RACE & RELOAD?" on the row for the session and the flag outlived the
 *     race, so the NEXT race's first tap reloaded with no question. On the
 *     <select> the question was written as textContent, which replaces the
 *     options — the picker painted empty.
 *   - MUSIC & SOUND read "Music off" beside a MUSIC switch showing ON when the
 *     master SOUND gate was what was shut, and captioned the DEFAULT source
 *     "Built-in".
 * The Escape ladder and the short-viewport scroll rules are pinned from the
 * shell and the stylesheets so a regression there is a red test, not a
 * screenshot.
 *
 * Run: node --test tests/unit/ui-sheets-audit.test.mjs   (npm run test:tooling-fast)
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { cssRules, decl } from "../helpers/css-rules.mjs";
import { makeDom } from "../helpers/mini-dom.mjs";
import { seedLog } from "../helpers/seed-log.mjs";
import { seedStore } from "../helpers/seed-store.mjs";   // gfx-quality.js persists through GameStore.store's raw lane

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (name) => fs.readFileSync(path.join(ROOT, name), "utf8");
// Top-level `const X = (function(){…})()` lands in the VM's lexical scope, not
// on the sandbox object; `var` puts it where the sandbox can read it back.
const src = (p) => read(p).replace(/^const\b/gm, "var");
const POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];

function stubStore() {
  const m = new Map();
  return { get: (k, d) => (m.has(k) ? m.get(k) : d), set: (k, v) => m.set(k, v), subscribe: () => () => {}, _map: m };
}

/* ── RESULTS / STANDINGS on the real SeasonCal ─────────────────────────── */
function bootResults({ state = "menu", season, cars, netPlay }) {
  const dom = makeDom();
  const tracks = ["bahrain", "jeddah", "melbourne"].map((id) => ({ id, name: id.toUpperCase(), gp: id + " GP", classic: false }));
  const sb = {
    Math, JSON, Object, Array, String, Number, Set, Map, isNaN, isFinite, parseInt, parseFloat, console,
    document: dom.document,
    GameStore: { store: stubStore() },
    Tracks: { LIST: tracks, SEASON: tracks },
    Teams: { POINTS, LIST: [{ id: "red", name: "RED", color: [1, 0, 0] }, { id: "blue", name: "BLUE", color: [0, 0, 1] }] },
    Ghost: { hasGhost: () => false, bestTime: () => Infinity, clear() {} },
    Career: { objectiveLabel: () => "", OBJ_BONUS: 0 },
    GameAudio: { finish() {} },
  };
  sb.window = sb;
  const ctx = vm.createContext(sb);
  seedLog(ctx);
  vm.runInContext(src("js/career/season-cal.js"), ctx, { filename: "js/career/season-cal.js" });
  vm.runInContext(src("js/ui/results-sheet.js"), ctx, { filename: "js/ui/results-sheet.js" });
  const SeasonCal = vm.runInContext("SeasonCal", ctx);
  const els = { resultsTable: dom.byId("results-table"), resultsTitle: dom.byId("results-title"), resNext: dom.byId("res-next") };
  const G = {
    $: (id) => dom.byId(id), els, season, cars, state, seasonMode: true, track: { def: tracks[0] },
    cssCol: (c) => "rgb(" + c.join(",") + ")", announce() {}, soundOn: false, careerSettlement: null,
    netPlay,
  };
  const api = vm.runInContext("GameResults", ctx).create(G);
  return { dom, G, api, SeasonCal, els };
}

function tiedSeason() {
  // Two drivers on equal points. `a` is first in the field order and scored
  // first (so a points-only sort and Object.entries order both put a first);
  // `b` has the win, so countback ranks b above a. SeasonCal.award writes
  // finishes as a per-position histogram — this is that shape, hand-built.
  const season = { round: 2, pts: { a: 25, b: 25 }, teamPts: { red: 25, blue: 25 }, driverCodes: { a: "AAA", b: "BBB" }, finishes: { a: [0, 1], b: [1] } };
  const cars = [
    { driverId: "a", code: "AAA", name: "Alpha", team: { id: "red", name: "RED", color: [1, 0, 0] }, isPlayer: true },
    { driverId: "b", code: "BBB", name: "Bravo", team: { id: "blue", name: "BLUE", color: [0, 0, 1] } },
  ];
  return { season, cars };
}

// mini-dom's textContent setter does not drop children (it is not a DOM), so
// each build starts from an emptied container here, as the browser would.
const clear = (el) => { el.children.length = 0; };
const rowsOf = (el) => el.children.filter((c) => c.classList.contains("res-row"));
const nameOf = (row) => row.children.find((c) => c.classList.contains("res-name")).textContent;

test("RESULTS top-10 and the CHAMPION panel rank by countback, like STANDINGS", () => {
  const { season, cars } = tiedSeason();
  const h = bootResults({ season, cars });
  assert.equal(h.SeasonCal.rank(season, "a", "b") > 0, true, "precondition: SeasonCal.rank puts b (the win) above a");

  // The STANDINGS sheet — already on rank().
  h.api.buildStandings();
  const standings = rowsOf(h.dom.byId("standings-body")).slice(0, 2).map(nameOf);
  assert.equal(standings[0], "BBB  Bravo");

  // The RESULTS sheet's "DRIVERS — AFTER ROUND" list must agree with it.
  h.api.buildResults(cars.slice());
  const table = h.els.resultsTable;
  const drivers = rowsOf(table).slice(cars.length, cars.length + 2).map(nameOf);
  assert.deepEqual(drivers, ["BBB  Bravo", "AAA  Alpha"], "results-sheet top-10 uses countback");
  assert.equal(h.els.resNext.textContent, "NEXT ROUND");

  // The title goes to the countback winner, not to whoever is first in the field.
  clear(table);
  h.api.buildChampion();
  assert.equal(h.els.resultsTitle.textContent, "WORLD CHAMPION");
  const banner = table.children[0];
  assert.equal(banner.textContent, "BBB  Bravo", "champion is decided by SeasonCal.rank");
  assert.equal(rowsOf(table).map(nameOf)[0], "BBB", "final standings agree with the banner");
  assert.equal(h.els.resNext.textContent, "MAIN MENU");
});

test("a GUEST's RESULTS labels DNF from the host's verdict, not from its own reliability plan", () => {
  // Bug-hunt 2026-09-02 (UI, not landed in round 1): the order was the host's
  // (netOrder) but "(dnf)" / "DNF" came from this peer's own `retired`, drawn
  // off a different seed and race counter — so the two disagreed.
  const { season, cars } = tiedSeason();
  cars[1].retired = true; cars[1].dnf = "gearbox";      // Bravo parked HERE only
  const verdict = [{ d: "b", t: 95.2, p: 0, lap: 4 }, { d: "a", t: 0, p: 0, lap: 2, r: "engine" }];
  const netPlay = { active: () => true, ownsClassification: () => false, peerResult: () => verdict };
  const h = bootResults({ season, cars, netPlay });
  h.api.buildResults([cars[1], cars[0]]);                 // the host's order: Bravo won, Alpha retired
  const rows = rowsOf(h.els.resultsTable).slice(0, 2);
  const pts = (row) => row.children.find((c) => c.classList.contains("res-pts")).textContent;
  assert.equal(nameOf(rows[0]), "BBB  Bravo", "a car the host timed finished, whatever this peer saw");
  assert.equal(pts(rows[0]), "25 pts");
  assert.equal(nameOf(rows[1]), "AAA  Alpha  (engine)", "the host's reason, when it sends one");
  assert.equal(pts(rows[1]), "DNF");
  // The host alone (no verdict) keeps its own flags — the single-player path is untouched.
  const solo = bootResults({ season, cars });
  solo.api.buildResults([cars[0], cars[1]]);
  assert.equal(nameOf(rowsOf(solo.els.resultsTable)[1]), "BBB  Bravo  (gearbox)");
});

test("STANDINGS title says which half of a sprint weekend it stands on, and the pause menu's NEXT line is the race in progress", () => {
  const { season, cars } = tiedSeason();
  // Sprint format on, and the sprint of round 3 has scored: season-cal leaves
  // round at 2 with stage "race" until the Grand Prix closes the weekend.
  const h = bootResults({ season, cars, state: "menu" });
  h.SeasonCal.setConfig({ sprint: true });
  h.SeasonCal.engage("season");
  assert.equal(h.SeasonCal.sprintOn(), true, "precondition: sprint weekends are on in a season");
  assert.equal(h.SeasonCal.rounds(), 3);

  const body = h.dom.byId("standings-body");
  const build = () => { clear(body); h.api.buildStandings(); };
  build();
  const title = () => h.dom.byId("standings-title").textContent;
  const last = () => { const k = body.children; return k[k.length - 1].textContent; };
  assert.equal(title(), "CHAMPIONSHIP — AFTER ROUND 2 / 3");
  assert.match(last(), /^NEXT: ROUND 3 — MELBOURNE/);

  season.stage = "race";
  assert.equal(h.SeasonCal.midWeekend(season), true, "precondition: stage 'race' is mid-weekend");
  build();
  assert.equal(title(), "CHAMPIONSHIP — AFTER THE SPRINT, ROUND 3 / 3", "the sprint has scored: name round 3, not 'after round 2'");
  assert.match(last(), /^NEXT: GRAND PRIX, ROUND 3 — MELBOURNE/, "the next session is this round's Grand Prix");

  // From the pause menu the round is being driven.
  h.G.state = "race";
  delete season.stage;
  build();
  assert.equal(title(), "CHAMPIONSHIP — AFTER ROUND 2 / 3");
  assert.match(last(), /^IN PROGRESS: ROUND 3 — MELBOURNE/, "mid-race the line does not call this round the next one");

  season.round = 3;
  build();
  assert.equal(title(), "FINAL CHAMPIONSHIP");
  assert.doesNotMatch(last(), /^(NEXT|IN PROGRESS)/, "no next round after the last one");
});

/* ── RendererPicker's in-race reload confirm ──────────────────────────── */
function makeStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _map: m };
}

function bootGfx() {
  // readyState "loading" defers init() to DOMContentLoaded so the DOM can be
  // shaped first: a real <select> (options + a textContent setter that wipes
  // them, which is what the DOM does) and a replaceable #pm-renderer.
  const dom = makeDom({ readyState: "loading" });
  // Strict lookups: the module injects rows only when their ids are ABSENT,
  // and mini-dom's auto-creating getElementById would tell it they exist.
  const realGet = dom.document.getElementById;
  dom.document.getElementById = (id) => (dom.has(id) ? realGet(id) : null);
  realGet("pm-gfx"); realGet("game");
  const realCreate = dom.document.createElement;
  dom.document.createElement = (tag) => {
    const el = realCreate(tag);
    if (String(tag).toLowerCase() === "select") {
      Object.defineProperty(el, "options", { get: () => el.children });
      Object.defineProperty(el, "textContent", {
        get: () => el.children.map((c) => c.textContent).join(""),
        set: () => { el.children.length = 0; },   // a text node replaces every <option>
        configurable: true,
      });
    }
    return el;
  };
  const old = realGet("pm-renderer");
  old.replaceWith = (next) => { const host = old.parentNode; host.insertBefore(next, old); host.removeChild(old); };
  const timers = [];
  let reloads = 0;
  let clock = 1000;
  const sb = {
    Math, JSON, Object, Array, String, Number, console,
    Date: { now: () => clock },
    document: dom.document,
    localStorage: makeStorage(), sessionStorage: makeStorage(),
    location: { reload: () => { reloads++; } },
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimeout: (id) => { if (timers[id - 1]) timers[id - 1].fn = null; },
    addEventListener() {}, removeEventListener() {},
  };
  sb.window = sb;
  const ctx = vm.createContext(sb);
  seedLog(ctx);
  seedStore(ctx);
  // Both halves of the old gfx-quality.js, in shell order: the GRAPHICS preset
  // button (GfxQuality) and the RENDERER picker that owns the reload confirm.
  vm.runInContext(src("js/perf/quality-preset.js"), ctx, { filename: "js/perf/quality-preset.js" });
  vm.runInContext(src("js/perf/renderer-picker.js"), ctx, { filename: "js/perf/renderer-picker.js" });
  dom.document.dispatchEvent({ type: "DOMContentLoaded" });
  const Gfx = vm.runInContext("RendererPicker", ctx);
  const sel = dom.byId("pm-renderer");
  assert.equal(sel.tagName, "SELECT", "precondition: the picker mounted as a <select>");
  assert.equal(sel.options.length, 3);
  const fire = (ms) => { for (const t of timers) if (t.fn && t.ms === ms) { const f = t.fn; t.fn = null; f(); } };
  const pendingReload = () => timers.some((t) => t.fn && t.ms === 350);
  const optText = () => sel.options.map((o) => o.textContent);
  return { dom, sb, Gfx, sel, fire, pendingReload, optText, reloads: () => reloads, body: dom.document.body, tick: (ms) => { clock += ms; } };
}

test("an unconfirmed in-race RENDERER tap keeps the picker's options, and the question expires", () => {
  const h = bootGfx();
  h.body.dataset.race = "1";
  h.sel.value = "three";
  h.dom.dispatch(h.sel, { type: "change" });
  assert.equal(h.sel.dataset.armed, "1", "first tap arms");
  assert.equal(h.pendingReload(), false, "and does not reload");
  assert.equal(h.sb.localStorage.getItem("apex26.gfxBackend"), null, "and writes no preference");
  assert.equal(h.sel.options.length, 3, "the <select> keeps its three options while armed");
  assert.deepEqual(h.optText(), ["WEBGL2", "RENDERER: END THIS RACE & RELOAD?", "WEBGPU"], "the question sits on the option in view");

  h.fire(h.Gfx.ARM_MS);
  assert.equal(h.sel.dataset.armed, undefined, "the arm expires");
  assert.deepEqual(h.optText(), ["WEBGL2", "THREE.JS", "WEBGPU"], "and the labels come back");
  assert.equal(h.sel.value, "webgl2", "the picker snaps back to the saved renderer");
});

test("a stale arm never carries into the next race; out of a race it is cleared, not consumed", () => {
  const h = bootGfx();
  h.body.dataset.race = "1";
  h.sel.value = "three";
  h.dom.dispatch(h.sel, { type: "change" });
  assert.equal(h.sel.dataset.armed, "1");
  // Quit to the menu and start another race. The expiry timer never fired —
  // a background tab throttles it — but the arm is older than the window.
  delete h.body.dataset.race;
  h.tick(h.Gfx.ARM_MS + 1);
  h.body.dataset.race = "1";
  h.sel.value = "three";
  h.dom.dispatch(h.sel, { type: "change" });
  assert.equal(h.pendingReload(), false, "the new race's first tap must ASK, not reload");
  assert.equal(h.sel.dataset.armed, "1");
  // The deliberate second tap proceeds.
  h.dom.dispatch(h.sel, { type: "change" });
  assert.equal(h.pendingReload(), true, "second tap schedules the reload");
  assert.equal(h.sb.localStorage.getItem("apex26.gfxBackend"), "three");

  // RESET RENDERER: armed in a race, abandoned, then pressed from the title.
  const g2 = bootGfx();
  const reset = g2.dom.byId("pm-renderer-reset");
  g2.body.dataset.race = "1";
  g2.dom.dispatch(reset, { type: "click" });
  assert.equal(reset.textContent, "RESET RENDERER: END THIS RACE & RELOAD?");
  assert.equal(g2.pendingReload(), false);
  delete g2.body.dataset.race;
  g2.dom.dispatch(reset, { type: "click" });
  assert.equal(g2.pendingReload(), true, "no race: the tap proceeds");
  assert.equal(reset.textContent, "RESET RENDERER — RELOADING…", "the stale question was repainted before the reload label");
});

test("THREE PATH and SCREENSHOTS confirms expire back to their real labels", () => {
  const h = bootGfx();
  h.sb.localStorage.setItem("apex26.gfxBackend", "three");
  h.body.dataset.race = "1";
  const pathBtn = h.dom.byId("pm-three-path");
  h.dom.dispatch(pathBtn, { type: "click" });
  assert.equal(pathBtn.textContent, "THREE PATH: END THIS RACE & RELOAD?");
  assert.equal(h.pendingReload(), false);
  h.fire(h.Gfx.ARM_MS);
  assert.equal(pathBtn.textContent, "THREE PATH: AUTO", "expired: the label is the setting again");
  assert.equal(h.Gfx.readThreePath(), "auto", "nothing was written");

  h.sb.localStorage.setItem("apex26.gfxBackend", "webgpu");
  const shotBtn = h.dom.byId("pm-screenshots");
  h.dom.dispatch(shotBtn, { type: "click" });
  assert.equal(shotBtn.textContent, "SCREENSHOTS: END THIS RACE & RELOAD?");
  h.fire(h.Gfx.ARM_MS);
  assert.equal(shotBtn.textContent, "SCREENSHOTS: AUTO");
  assert.equal(h.Gfx.readShotMode(), "auto");
});

/* ── MUSIC & SOUND readout ────────────────────────────────────────────── */
function bootAudio({ soundOn, musicEnabled }) {
  const dom = makeDom();
  for (const id of ["as-mvol", "as-svol"]) {
    const row = dom.makeElement("label"); row.className = "tune-row";
    row.appendChild(dom.byId(id)); dom.body.appendChild(row);
  }
  const calls = [];
  const GameAudio = new Proxy({}, { get: (_, k) => (k === "trackName" ? () => "Song A" : k === "musicSource" ? () => "builtin"
    : k === "sourceCounts" ? () => ({ builtin: 4, user: 0 }) : k === "setMusicSource" ? (v) => v
    : k === "setMusicVolume" || k === "setSfxVolume" ? (v) => v : (...a) => { calls.push([k, ...a]); }) });
  const sb = { Math, JSON, Object, Array, String, Number, console, document: dom.document, GameAudio };
  sb.window = sb;
  const ctx = vm.createContext(sb);
  seedLog(ctx);
  vm.runInContext(src("js/audio/panel.js"), ctx, { filename: "js/audio/panel.js" });
  const store = stubStore();
  store.set("musicSource", "builtin");
  const G = { $: (id) => dom.byId(id), els: { soundbtn: dom.byId("soundbtn") }, store, soundOn, musicEnabled, state: "race", trackIdx: 0 };
  const api = vm.runInContext("AudioPanel", ctx).create(G);
  return { dom, G, api, calls };
}

test("MUSIC & SOUND names the gate that is shut and captions DEFAULT as DEFAULT", () => {
  const h = bootAudio({ soundOn: false, musicEnabled: true });
  h.api.init();
  h.dom.dispatch(h.dom.byId("pm-audio"), { type: "click" });
  assert.equal(h.dom.byId("as-music-on").classList.contains("active"), true, "the MUSIC switch shows ON (its saved state)");
  assert.equal(h.dom.byId("as-mvol").disabled, true);
  assert.equal(h.dom.byId("as-now").textContent, "Sound off", "the readout blames the master SOUND gate, not music");
  assert.match(h.dom.byId("as-now-src").textContent, /^Master sound is off/, "and the caption says how to lift it");

  const on = bootAudio({ soundOn: true, musicEnabled: true });
  on.api.init();
  on.dom.dispatch(on.dom.byId("pm-audio"), { type: "click" });
  assert.equal(on.dom.byId("as-now").textContent, "Song A");
  assert.equal(on.dom.byId("as-now-src").textContent, "Default", "the caption uses the source button's own word");
  assert.equal(on.dom.byId("as-src-builtin").classList.contains("active"), true);
  assert.equal(on.dom.byId("as-src-note").textContent, "Playing the 4 shipped tracks only.", "the note describes the SELECTED source, not the disabled MY TRACKS button");

  const off = bootAudio({ soundOn: true, musicEnabled: false });
  off.api.init();
  off.dom.dispatch(off.dom.byId("pm-audio"), { type: "click" });
  assert.equal(off.dom.byId("as-now").textContent, "Music off", "music itself off: the old word still applies");
});

/* ── Escape ladder and short-viewport scroll, pinned from the shell ───── */
test("the pause → settings → sub-sheet Escape ladder presses each sheet's own BACK", () => {
  const html = read("index.html");
  const esc = (id) => { const m = html.match(new RegExp(`<(?:dialog|div) id="${id}"[^>]*>`)); assert.ok(m, id); return m[0]; };
  const via = (id) => (esc(id).match(/data-esc-close="([^"]+)"/) || [])[1];
  assert.equal(via("pausemenu"), "pm-resume", "Escape on PAUSED resumes");
  assert.equal(via("pmsettings"), "pm-settings-close", "Escape on SETTINGS is BACK (to the pause menu when paused)");
  assert.equal(via("audioset"), "as-close");
  assert.equal(via("advanced"), "adv-close");
  assert.equal(via("howtoplay"), "htp-close");
  assert.equal(via("lighting"), "lt-close");
  assert.equal(via("camtune"), "ct-close");
  assert.equal(via("standings"), "standings-close");
  assert.match(esc("results"), /data-esc="none"/, "RESULTS refuses Escape: nothing to go back to, NEXT is a decision");
  for (const id of ["pm-resume", "pm-settings-close", "as-close", "adv-close", "htp-close", "lt-close", "ct-close", "standings-close"]) {
    assert.ok(html.includes(`id="${id}"`), `${id} exists for Escape to press`);
  }
  // Pause button order: RESUME first (autofocus), QUIT last, no destructive
  // control between the two primaries.
  const pause = html.slice(html.indexOf('id="pausemenu"'), html.indexOf("</dialog>", html.indexOf('id="pausemenu"')));
  const ids = [...pause.matchAll(/<button id="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(ids, ["pm-resume", "pm-restart", "pm-settings", "pm-standings", "pm-quit"]);
  assert.match(pause, /id="pm-resume" autofocus/);
});

test("pause, settings, results and standings all scroll inside the sheet on a short viewport", () => {
  const comp = cssRules(read("css/components.css"));
  assert.equal(decl(comp, ".sheet", "grid-template-rows"), "auto minmax(0, 1fr) auto", "the body row can shrink, so the sheet never grows past the screen");
  assert.equal(decl(comp, ".pane", "overflow-y"), "auto");
  assert.equal(decl(comp, ".pane", "overflow-x"), "hidden");
  assert.equal(decl(comp, ".sheet-body", "min-height"), "0");
  const html = read("index.html");
  for (const id of ["pm-settings-body", "results-table", "standings-body"]) {
    const m = html.match(new RegExp(`<div[^>]*id="${id}"[^>]*>`)) || html.match(new RegExp(`<div[^>]*class="[^"]*"[^>]*id="${id}"`));
    assert.ok(m && /class="[^"]*\bpane\b/.test(m[0]), `#${id} is a .pane scroll region`);
  }
  assert.ok(/<div class="sheet-body pane stack">/.test(html.slice(html.indexOf('id="pausemenu"'), html.indexOf('id="pmsettings"'))), "the pause stack is a pane");
  assert.equal(decl(comp, "#pm-category-tabs", "position"), "sticky", "the category tabs stay reachable while the body scrolls");
  // The METRICS submenu inside DISPLAY caps itself in zoom-compensated units.
  assert.match(read("js/perf/metrics-overlay.js"), /max-height: min\(280px, calc\(100 \* var\(--svhz, 1svh\) - 9rem\)\)/);
});
