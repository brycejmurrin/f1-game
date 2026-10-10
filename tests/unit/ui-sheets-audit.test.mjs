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
import { readCssSource } from "../helpers/css-source.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { cssRules, decl } from "../helpers/css-rules.mjs";
import { makeDom } from "../helpers/mini-dom.mjs";
import { seedLog } from "../helpers/seed-log.mjs";
import { seedSaveMigrate } from "../helpers/seed-save-migrate.mjs";
import { seedDom } from "../helpers/seed-dom.mjs";
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
function bootResults({ state = "menu", season, cars, netPlay, seasonMode = true, globals = null }) {
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
    ...globals,
  };
  sb.window = sb;
  const ctx = vm.createContext(sb);
  seedLog(ctx);
  seedDom(ctx);
  seedSaveMigrate(ctx);   // season-cal delegates roundMap/finishMap to SaveMigrate
  vm.runInContext(src("js/career/season-cal.js"), ctx, { filename: "js/career/season-cal.js" });
  vm.runInContext(src("js/race/race-control.js"), ctx, { filename: "js/race/race-control.js" });   // shortRun: the sheet's points table
  vm.runInContext(src("js/ui/results-story.js"), ctx, { filename: "js/ui/results-story.js" });
  vm.runInContext(src("js/ui/results-sheet.js"), ctx, { filename: "js/ui/results-sheet.js" });
  const SeasonCal = vm.runInContext("SeasonCal", ctx);
  const els = { resultsTable: dom.byId("results-table"), resultsTitle: dom.byId("results-title"), resNext: dom.byId("res-next") };
  const G = {
    $: (id) => dom.byId(id), els, season, cars, state, seasonMode, track: { def: tracks[0] },
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

test("unscored practice results suppress points in every classification row while scored races retain them", () => {
  const { cars } = tiedSeason();
  const h = bootResults({ season: null, cars, seasonMode: false });
  h.G.practice = true;
  h.api.buildResults(cars.slice());
  const points = () => rowsOf(h.els.resultsTable).map(r => r.children.find(c => c.classList.contains("res-pts")).textContent);
  const story = h.els.resultsTable.children.find(c => c.getAttribute("data-results-part") === "story");
  assert.equal(story.children[0].children[1].textContent, "Unscored session · P1");
  assert.deepEqual(points(), ["Unscored", "Unscored"]);
  assert.deepEqual(rowsOf(h.els.resultsTable).map(r => r.children[0].textContent), [1, 2]);
  clear(h.els.resultsTable); h.G.practice = false;
  h.api.buildResults(cars.slice());
  assert.deepEqual(points(), ["25 pts", "18 pts"]);
  const { season } = tiedSeason(); season.lastFl = cars[0].driverId;
  const scored = bootResults({ season, cars });
  scored.api.buildResults(cars.slice());
  assert.equal(rowsOf(scored.els.resultsTable)[0].children.find(c => c.classList.contains("res-pts")).textContent, "26 pts +FL");
});

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

test("RESULTS and STANDINGS share the career constructor tie policy", () => {
  const { season, cars } = tiedSeason();
  const teams = [
    { id: "red", name: "RED", tier: 4, color: [1, 0, 0] },
    { id: "blue", name: "BLUE", tier: 2, color: [0, 0, 1] },
  ];
  const h = bootResults({ season, cars, globals: { Teams: { POINTS, LIST: teams } } });
  h.api.buildStandings();
  assert.deepEqual(rowsOf(h.dom.byId("standings-body")).slice(2).map(nameOf), ["BLUE", "RED"]);
  h.api.buildResults(cars.slice());
  assert.deepEqual(rowsOf(h.els.resultsTable).slice(4).map(nameOf), ["BLUE", "RED"]);
  // Equal tiers use stable IDs, never the order teams first scored in.
  teams[0].tier = 2;
  assert.ok(h.SeasonCal.rankTeams(season, "blue", "red") < 0);
  assert.equal(h.SeasonCal.rankTeams(season, "red", "red"), 0);
  season.teamPts.red++;
  assert.ok(h.SeasonCal.rankTeams(season, "red", "blue") < 0, "points remain decisive");
});

test("a WATCHED real race (REAL REPLAY / HIGHLIGHTS) awards no badge and draws no YOUR RACE card; a driven one does", () => {
  // RealReplay.finish() ends a watched race through G.endRace -> buildResults,
  // with the FOLLOWED car as G.player (G.followCar). Nobody drove it: the sheet
  // handed the viewer licence badges and a "YOUR RACE · P1" for the winner's drive.
  const one = (watch) => {
    const onRace = [];
    const cars = ["a", "b", "c"].map((id, i) => ({ driverId: id, code: id.toUpperCase().repeat(3), name: id, best: 80 + i,
      finished: true, team: { id: "red", name: "RED", color: [1, 0, 0] }, isPlayer: i === 0 }));
    const h = bootResults({ season: null, cars, seasonMode: false, globals: {
      Badges: { setNotifier() {}, onRace: (r) => { onRace.push(r); return ["podium"]; }, labelOf: (id) => id.toUpperCase() },
      RealRace: { status: () => (watch ? { active: true, watch: true } : { active: false }) },
    } });
    h.G.player = cars[0];
    h.api.buildResults(cars.slice());
    const cards = h.els.resultsTable.children.filter((e) => e.classList.contains("res-personal"))
      .map((e) => e.children.map((x) => x.textContent).join(" | "));
    return { onRace, cards };
  };
  const watched = one(true);
  assert.equal(watched.onRace.length, 0, "a watched finish must not reach Badges.onRace");
  assert.deepEqual(watched.cards, [], "a watched finish draws no YOUR RACE / BADGE card: " + JSON.stringify(watched.cards));
  const driven = one(false);
  assert.equal(driven.onRace.length, 1, "a driven finish still earns badges");
  assert.ok(driven.cards.some((t) => /^YOUR RACE · P1/.test(t)), "a driven finish keeps its YOUR RACE card: " + JSON.stringify(driven.cards));
  assert.ok(driven.cards.some((t) => /^BADGE UNLOCKED/.test(t)), "and its badge card: " + JSON.stringify(driven.cards));
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

test("race RESULTS shows host-corrected elapsed and same-lap gaps only when fields are present", () => {
  const team = (id, color) => ({ id, name: id.toUpperCase(), color });
  const cars = [
    { driverId: "w", code: "WIN", name: "Winner", team: team("red", [1, 0, 0]), lap: 5, finishT: 100, penalty: 0 },
    // The local finish is earlier, but the host penalty makes this car five
    // seconds behind. This catches stale guest penalty/timing fields.
    { driverId: "p", code: "PEN", name: "Penalized", team: team("blue", [0, 0, 1]), lap: 5, finishT: 95, penalty: 0 },
    { driverId: "t", code: "TIE", name: "Tied", team: team("red", [1, 0, 0]), lap: 5, finishT: 100, penalty: 0 },
    { driverId: "l", code: "LAP", name: "Lapped", team: team("blue", [0, 0, 1]), lap: 4, finishT: 130, penalty: 0 },
    { driverId: "d", code: "DNF", name: "Retired", team: team("red", [1, 0, 0]), lap: 2, retired: true, dnf: "engine" },
  ];
  const host = [
    { d: "w", t: 100, p: 0, lap: 5, r: 0 },
    { d: "p", t: 95, p: 10, lap: 5, r: 0 },
    { d: "t", t: 100, p: 0, lap: 5, r: 0 },
    { d: "l", t: 130, p: 0, lap: 4, r: 0 },
    { d: "d", t: 0, p: 0, lap: 2, r: "engine" },
  ];
  const netPlay = { active: () => true, ownsClassification: () => false, peerResult: () => host };
  const h = bootResults({ season: null, cars, netPlay, seasonMode: false });
  h.api.buildResults(cars.slice());
  const table = h.els.resultsTable;
  assert.match(table.children[0].textContent, /OFFICIAL WINNER ELAPSED.*WIN.*1:40\.00/);
  const rows = rowsOf(table);
  const gaps = (row) => row.children.flatMap((c) => c.children || [])
    .filter((c) => c.classList.contains("q-time")).map((c) => c.textContent);
  assert.deepEqual(gaps(rows[0]), []);
  assert.deepEqual(gaps(rows[1]), ["+5.000s"], "host penalty is included in the gap");
  assert.deepEqual(gaps(rows[2]), ["+0.000s"], "a timed tie is explicit instead of looking like missing data");
  assert.deepEqual(gaps(rows[3]), [], "lap-down finishers do not get same-lap timing");
  assert.match(nameOf(rows[4]), /\(engine\)/);

  // If the host did not send a winner elapsed time, suppress both the summary
  // and dependent gaps rather than falling back to this guest's stale fields.
  const missing = host.map((e) => e.d === "w" ? { d: e.d, t: null, p: e.p, lap: e.lap, r: e.r } : e);
  const noOfficial = bootResults({ season: null, cars, seasonMode: false,
    netPlay: { active: () => true, ownsClassification: () => false, peerResult: () => missing } });
  noOfficial.api.buildResults(cars.slice());
  assert.equal(noOfficial.els.resultsTable.children.some((e) => e.classList.contains("sel-label")), false);
  assert.equal(rowsOf(noOfficial.els.resultsTable).some((r) => r.children
    .flatMap((c) => c.children || []).some((c) => c.classList.contains("q-time"))), false);
  for (const partial of [host.slice(0, 1), host.slice().reverse()]) {
    const unclassified = bootResults({ season: null, cars, seasonMode: false,
      netPlay: { active: () => true, ownsClassification: () => false, peerResult: () => partial } });
    unclassified.api.buildResults(cars.slice());
    assert.equal(unclassified.els.resultsTable.children.some((e) => e.classList.contains("sel-label")), false,
      "partial or mismatched host classification cannot label a local order official");
  }
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
    // The picker only offers a stop whose files are in the tree. These tests
    // are about the two-tap race guard, not the spike-out, so state the
    // backends-present world they were written for.
    ApexRoster: { DEFERRED: { webgpu: ["w"], three: ["t"] } },
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
  assert.equal(h.sel.value, "three", "the picker snaps back to the unset default renderer");
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
  // Every volume slider the panel syncs, each inside its own .tune-row the way
  // index.html has them — the panel toggles "tune-off" on that ancestor.
  for (const id of ["as-mvol", "as-svol", "as-rvol", "as-rfx"]) {
    const row = dom.makeElement("label"); row.className = "tune-row";
    row.appendChild(dom.byId(id)); dom.body.appendChild(row);
  }
  const calls = [];
  // The ENGINE TONE section reads its state back from the engine on every
  // sync, so the catch-all arm (which returns undefined) is not enough for it:
  // `GameAudio.profiles().includes(...)` needs a real array. These mirror the
  // shapes js/audio/engine.js returns; tests/unit/audio-tune.test.mjs is what
  // holds the two in step.
  const TONE_STUB = {
    profiles: () => ["team", "broadcast", "trackside", "cockpit", "v10"],
    tune: () => ({ pitch: 1, detune: 1, revRange: 1, brightness: 1, whine: 1, sub: 1, limiter: 1 }),
    layers: () => ({ whine: true, harvest: true, ers: true, wind: true, limiter: true, screech: true }),
    setProfile: (v) => v,
    granular: () => ({ on: true, ready: true, active: true, period: 80 }),
    setGranular: (v) => v,
    profile: () => "team",
    grain: () => ({ on: true, ready: true, active: true, period: 80 }),
    setGrain: (v) => v,
    // RADIO FX reads its level back from the engine on every sync, like the
    // tone section above — the catch-all arm returns undefined and the panel
    // would print NaN into the slider.
    radioFxLevel: () => 1,
    setRadioFx: (v) => v,
  };
  const GameAudio = new Proxy({}, { get: (_, k) => (k === "trackName" ? () => "Song A" : k === "musicSource" ? () => "builtin"
    : k === "sourceCounts" ? () => ({ builtin: 4, user: 0 }) : k === "setMusicSource" ? (v) => v
    : TONE_STUB[k] ? TONE_STUB[k]
    : k === "setMusicVolume" || k === "setSfxVolume" ? (v) => v : (...a) => { calls.push([k, ...a]); }) });
  const sb = { Math, JSON, Object, Array, String, Number, console, document: dom.document, GameAudio };
  sb.window = sb;
  const ctx = vm.createContext(sb);
  seedLog(ctx);
  // The panel's picks are setting rows (js/ui/setting-row.js): load the real
  // module and stand the four rows up in the mini DOM, ids as the shell has them.
  vm.runInContext(src("js/ui/setting-row.js"), ctx, { filename: "js/ui/setting-row.js" });
  const SettingRow = vm.runInContext("SettingRow", ctx);
  for (const [id, label] of [["as-music", "MUSIC"], ["as-sound", "SOUND EFFECTS"], ["as-src", "SOURCE"], ["as-p", "PROFILE"]]) {
    dom.body.appendChild(SettingRow.build(id, label).row);
  }
  seedDom(ctx);   // the closed-fold summaries paint through Dom.paintFold
  vm.runInContext(src("js/audio/panel.js"), ctx, { filename: "js/audio/panel.js" });
  const store = stubStore();
  store.set("musicSource", "builtin");
  // isRaining — SOUND ON mid-race restarts rain from live weather (panel.js),
  // not raceWeather. The stub must expose the same hook game.js puts on G.
  const G = { $: (id) => dom.byId(id), els: { soundbtn: dom.byId("soundbtn") }, store, soundOn, musicEnabled, state: "race", trackIdx: 0, isRaining: () => false };
  const api = vm.runInContext("AudioPanel", ctx).create(G);
  return { dom, G, api, calls };
}

test("MUSIC & SOUND names the gate that is shut and captions DEFAULT as DEFAULT", () => {
  const h = bootAudio({ soundOn: false, musicEnabled: true });
  h.api.init();
  h.dom.dispatch(h.dom.byId("pm-audio"), { type: "click" });
  assert.equal(h.dom.byId("as-music-sel").value, "on", "the MUSIC row shows ON (its saved state)");
  assert.equal(h.dom.byId("as-mvol").disabled, true);
  assert.equal(h.dom.byId("as-now").textContent, "Sound off", "the readout blames the master SOUND gate, not music");
  assert.match(h.dom.byId("as-now-src").textContent, /^Master sound is off/, "and the caption says how to lift it");

  const on = bootAudio({ soundOn: true, musicEnabled: true });
  on.api.init();
  on.dom.dispatch(on.dom.byId("pm-audio"), { type: "click" });
  assert.equal(on.dom.byId("as-now").textContent, "Song A");
  assert.equal(on.dom.byId("as-now-src").textContent, "Default", "the caption uses the source button's own word");
  assert.equal(on.dom.byId("as-src-sel").value, "builtin");
  assert.equal(on.dom.byId("as-src-sel").children.find((o) => o.value === "user").disabled, true, "MY TRACKS is shown but unpickable with nothing uploaded");
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
  assert.equal(via("howtoplay"), "htp-close");
  assert.equal(via("lighting"), "lt-close");
  assert.equal(via("camtune"), "ct-close");
  assert.equal(via("standings"), "standings-close");
  assert.match(esc("results"), /data-esc="none"/, "RESULTS refuses Escape: nothing to go back to, NEXT is a decision");
  for (const id of ["pm-resume", "pm-settings-close", "htp-close", "lt-close", "ct-close", "standings-close"]) {
    assert.ok(html.includes(`id="${id}"`), `${id} exists for Escape to press`);
  }
  assert.doesNotMatch(html, /id="as-close"|id="adv-close"/,
    "STEERING and MUSIC pop via settings BACK, not their own dialogs");
  // Pause button order: RESUME first (autofocus), QUIT last, no destructive
  // control between the two primaries.
  const pause = html.slice(html.indexOf('id="pausemenu"'), html.indexOf("</dialog>", html.indexOf('id="pausemenu"')));
  // The NOW PLAYING card's transport (pm-prev / pm-play / pm-skip) sits after
  // QUIT and only while music is live; it is not a menu action.
  const ids = [...pause.matchAll(/<button id="([^"]+)"/g)].map((m) => m[1]).filter((id) => !/^pm-(prev|play|skip)$/.test(id));
  // Pause exposes specific race tasks; full preferences retain the Settings index.
  assert.deepEqual(ids, ["pm-resume", "pm-restart", "pm-settings", "pm-strategy", "pm-review", "pm-practice", "pm-photo", "pm-howto", "pm-checkpoint-save", "pm-checkpoint-retry", "pm-checkpoint-rewind", "pm-standings", "pm-quit"]);
  const settingsIndex = html.slice(html.indexOf('id="pm-settings-index"'), html.indexOf("</nav>", html.indexOf('id="pm-settings-index"')));
  const doors = [...settingsIndex.matchAll(/<button id="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(doors, ["pm-open-controls", "pm-open-driving", "pm-open-display", "pm-open-appearance", "pm-advanced", "pm-audio", "pm-open-files"],
    "SETTINGS has the seven top-level doors in task order");
  assert.match(settingsIndex, /id="pm-advanced"[^>]*>STEERING &amp; ASSISTS/);
  const driving = html.slice(html.indexOf('id="pm-panel-driving"'), html.indexOf("</section>", html.indexOf('id="pm-panel-driving"')));
  const practiceIds = ["pm-coach", "pm-practice-panel", "pm-practice-set", "pm-practice-retry", "pm-session-review"];
  for (const id of practiceIds) {
    assert.match(driving, new RegExp(`id="${id}"`), `${id} lives on the dedicated DRIVING sheet`);
    assert.doesNotMatch(pause, new RegExp(`id="${id}"`), `${id} is not a pause-menu action`);
  }
  assert.doesNotMatch(pause, /id="pm-driving"/, "pause opens SETTINGS; it has no DRIVING shortcut");
  const display = html.slice(html.indexOf('id="pm-panel-display"'), html.indexOf("</section>", html.indexOf('id="pm-panel-display"')));
  for (const id of ["pm-visual-tuners", "pm-lighting", "pm-camtune"])
    assert.match(display, new RegExp(`id="${id}"`), `${id} is nested under DISPLAY`);
  assert.match(pause, /<div id="pm-now-card" class="as-now-card" hidden>/, "the pause NOW PLAYING card starts hidden; panel.js shows it while music plays");
  assert.match(pause, /id="pm-resume" autofocus/);
});

test("pause, settings, results and standings all scroll inside the sheet on a short viewport", () => {
  const comp = cssRules(readCssSource("css/components.css"));
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
  assert.equal(decl(comp, "#pm-settings-index[hidden], .pm-groups > [role=\"region\"][hidden]", "display"), "none !important",
    "the door index and settings pages honour hidden against .pm-doors flex");
  // METRICS is two or three quiet rows — the sheet pane scrolls, so the
  // fold does not grow its own --svhz cage (that cage forced a nested
  // scroller under four plates).
  assert.equal(decl(comp, /#pm-metrics-details > \[role="group"\]/, "display"), "flex");
  assert.equal(decl(comp, /#pm-hud-details > \[role="group"\]/, "display"), "flex");
  assert.equal(decl(comp, /#pm-metrics-details > \[role="group"\]/, "max-height"), null,
    "METRICS body does not own a height cage");
});

test("a CLASSIFIED late retirement shows the points award() paid, with its reason in the name", () => {
  // Bug hunt 2026-09-29: endRace classifies a DNF past 90 % of the winner's
  // laps (c.classified) and SeasonCal.award / Career.settleRound pay it, but
  // the row read "DNF" with no points — the sheet and the standings disagreed.
  const { season, cars } = tiedSeason();
  cars[1].retired = true; cars[1].dnf = "engine"; cars[1].classified = true;
  const h = bootResults({ season, cars });
  h.api.buildResults([cars[0], cars[1]]);
  const rows = rowsOf(h.els.resultsTable).slice(0, 2);
  const pts = (row) => row.children.find((c) => c.classList.contains("res-pts")).textContent;
  assert.match(nameOf(rows[1]), /\(engine\)/, "the reason stays in the name");
  assert.match(pts(rows[1]), /^\d+ pts/, "and the points it was paid are shown: " + pts(rows[1]));
  cars[1].classified = false;
  const un = bootResults({ season, cars });
  un.api.buildResults([cars[0], cars[1]]);
  assert.equal(rowsOf(un.els.resultsTable)[1].children.find((c) => c.classList.contains("res-pts")).textContent, "DNF", "an unclassified retirement still reads DNF");
});

test("a flagged finisher below the distance floor reads NC with zero points and no podium or badge", () => {
  for (const mode of ["gp", "season", "sprint"]) {
    const { season, cars } = tiedSeason();
    const winner = cars[1], player = cars[0];
    Object.assign(winner, { classified: true, finished: true, lap: 11, finishT: 100, penalty: 0 });
    Object.assign(player, { classified: false, finished: true, lap: 9, finishT: 101, penalty: 0 });
    const runner = { ...winner, driverId: "runner", code: "RUN", name: "Running", finished: false, lap: 8, finishT: 0 };
    const order = [winner, player, runner], badgeCalls = [];
    season.lastFl = player.driverId; // Even a stale fastest-lap marker cannot pay an NC row.
    const h = bootResults({ season, cars: order, seasonMode: mode !== "gp", globals: {
      Badges: { setNotifier() {}, onRace: (r) => { badgeCalls.push(r); return []; }, labelOf: (id) => id },
    } });
    h.G.player = player;
    h.api.buildResults(order, { sprint: mode === "sprint" });
    const rows = rowsOf(h.els.resultsTable).slice(0, order.length);
    assert.equal(rows[1].children[0].textContent, "NC", mode);
    assert.equal(rows[1].children.find((c) => c.classList.contains("res-pts")).textContent, "0 pts", mode);
    assert.match(nameOf(rows[1]), /\(\+2 LAPS\)/, "completed distance remains visible");
    assert.equal(rows[1].classList.contains("p2"), false, "NC is not a podium finish");
    assert.deepEqual(badgeCalls, [], "NC cannot unlock a finish or podium badge");
    const personal = h.els.resultsTable.children.find((c) => c.classList.contains("res-personal"));
    assert.equal(personal.children[0].textContent, "YOUR RACE · NC");
    const story = h.els.resultsTable.children.find((c) => c.getAttribute("data-results-part") === "story");
    assert.equal(story.children[0].children[1].textContent, "NC · 0 points");
    const podium = story.children.find((c) => c.getAttribute("data-results-part") === "podium");
    assert.equal(podium.children.some((c) => c.children[1].textContent === player.code), false);
    const points = mode === "sprint" ? [8, 7, 6] : POINTS;
    assert.equal(rows[0].children.find((c) => c.classList.contains("res-pts")).textContent, `${points[0]} pts`);
    assert.equal(rows[2].children.find((c) => c.classList.contains("res-pts")).textContent, `${points[2]} pts`, "provisional running result keeps its points");
  }
});

test("an UNFINISHED car on the lead lap reads no \"+1 LAP\"; a genuinely lapped car still does", () => {
  // Bug hunt 2026-09-26 (16217f3c1): the results sheet read "+1 LAP" on every
  // lead-lap car still running. `lap` counts line crossings and a running car
  // is flagged at its NEXT crossing (RaceControl.flagOut), so one still on
  // its final lap sits one crossing behind the winner without being lapped.
  const team = (id, color) => ({ id, name: id.toUpperCase(), color });
  const cars = [
    { driverId: "w", code: "WIN", name: "Winner", team: team("red", [1, 0, 0]), lap: 5, finished: true, finishT: 100, penalty: 0 },
    { driverId: "r", code: "RUN", name: "Running", team: team("blue", [0, 0, 1]), lap: 4, finished: false, penalty: 0 },
    { driverId: "f", code: "FLG", name: "Flagged", team: team("red", [1, 0, 0]), lap: 4, finished: true, finishT: 104, penalty: 0 },
    { driverId: "l", code: "LAP", name: "Lapped", team: team("blue", [0, 0, 1]), lap: 3, finished: false, penalty: 0 },
    { driverId: "t", code: "TWO", name: "Twice", team: team("red", [1, 0, 0]), lap: 3, finished: true, finishT: 110, penalty: 0 },
  ];
  const h = bootResults({ season: null, cars, seasonMode: false });
  h.api.buildResults(cars.slice());
  const names = rowsOf(h.els.resultsTable).map(nameOf);
  assert.equal(names[0], "WIN  Winner");
  assert.equal(names[1], "RUN  Running", "a running car on the lead lap is not a lap down");
  assert.equal(names[2], "FLG  Flagged  (+1 LAP)", "a car flagged one crossing behind the winner is a lap down");
  assert.equal(names[3], "LAP  Lapped  (+1 LAP)", "a running car two crossings behind is still a lap down");
  assert.equal(names[4], "TWO  Twice  (+2 LAPS)", "and the plural holds");
});

test("a winner who never took the flag discounts BOTH sides alike (bug-hunt 5.4)", () => {
  // The running -1 was applied to the car only: with the winner still on its
  // final lap too, a genuinely lapped runner read one lap short. classify
  // applies lapsAt to both sides; so must the sheet.
  const team = (id, color) => ({ id, name: id.toUpperCase(), color });
  const cars = [
    { driverId: "w", code: "WIN", name: "Winner", team: team("red", [1, 0, 0]), lap: 4, finished: false, penalty: 0 },
    { driverId: "r", code: "RUN", name: "Running", team: team("blue", [0, 0, 1]), lap: 4, finished: false, penalty: 0 },
    { driverId: "l", code: "LAP", name: "Lapped", team: team("blue", [0, 0, 1]), lap: 3, finished: false, penalty: 0 },
    { driverId: "t", code: "TWO", name: "Twice", team: team("red", [1, 0, 0]), lap: 2, finished: false, penalty: 0 },
  ];
  const h = bootResults({ season: null, cars, seasonMode: false });
  h.api.buildResults(cars.slice());
  const names = rowsOf(h.els.resultsTable).map(nameOf);
  assert.equal(names[1], "RUN  Running", "same lap as the unflagged winner: not lapped");
  assert.equal(names[2], "LAP  Lapped  (+1 LAP)", "one crossing behind an unflagged winner is a lap down");
  assert.equal(names[3], "TWO  Twice  (+2 LAPS)");
});

test("RESULTS: your row keeps its lime ink and OPAQUE sticky ground on the podium", () => {
  // The bug (2026-09-30): .res-row.p1/.p2/.p3 sat AFTER .res-row.you at the
  // same specificity, so finishing P1-P3 repainted your row in the metal and
  // swapped its opaque sticky background for the metal's translucent wash —
  // the rows scrolling under a sticky row showed through it. A small cascade
  // over the sheet's own rules: compound class selectors (with :not), outside
  // any @media, ranked by specificity then source order, as the browser does.
  const rules = cssRules(readCssSource("css/overlays.css")).filter((r) => !r.context.some((c) => c.startsWith("@media")));
  const COMPOUND = /^((?:\.[\w-]+)+)((?::not\(\.[\w-]+\))*)$/;
  const winner = (classes, prop, descendant) => {
    let best = null;
    rules.forEach((r, order) => {
      if (!r.decls.has(prop)) return;
      for (const part of r.selector.split(",").map((p) => p.trim())) {
        const [rowSel, sub] = part.split(" ");
        if ((sub || null) !== (descendant || null)) continue;
        const m = COMPOUND.exec(rowSel);
        if (!m) continue;
        const need = m[1].split(".").filter(Boolean), not = [...m[2].matchAll(/\.([\w-]+)/g)].map((x) => x[1]);
        if (!need.every((c) => classes.includes(c)) || not.some((c) => classes.includes(c))) continue;
        const spec = need.length + not.length + (sub ? 1 : 0);
        if (!best || spec > best.spec || (spec === best.spec && order >= best.order)) best = { spec, order, value: r.decls.get(prop), selector: part };
      }
    });
    return best;
  };
  const METAL = { p1: "--gold", p2: "--silver", p3: "--bronze" };
  const youBg = winner(["res-row", "you"], "background").value;
  assert.match(youBg, /var\(--surf-1\)/, "the player row composites over the sheet's surface");
  for (const p of ["p1", "p2", "p3"]) {
    const row = ["res-row", "you", p];
    assert.equal(winner(row, "color").value, "var(--you)", `you at ${p.toUpperCase()}: the row is lime, not the metal`);
    const bg = winner(row, "background");
    assert.equal(bg.value, youBg, `you at ${p.toUpperCase()}: the sticky ground is the opaque .you mix (won by "${bg.selector}")`);
    assert.doesNotMatch(bg.value, /transparent/, "a sticky row must be opaque");
    assert.match(winner(row, "border-left").value, new RegExp(`var\\(${METAL[p]}\\)`), "the metal stays as the left rule");
    assert.equal(winner(row, "color", ".res-pos").value, `var(${METAL[p]})`, "…and on the position cell");
    // A podium row that is NOT you still wears its metal throughout.
    assert.equal(winner(["res-row", p], "color").value, `var(${METAL[p]})`);
    assert.equal(winner(["res-row", p], "color", ".res-pos").value, `var(${METAL[p]})`);
  }
  assert.match(winner(["res-row", "you"], "border-left").value, /var\(--you\)/, "off the podium, your row draws its own lime rule");
});

test("CONSTRUCTORS ties break like Career.teamStandings (points, then tier), not by insertion order", () => {
  const { season, cars } = tiedSeason();
  season.teamPts = { red: 10, blue: 10 };   // red first in insertion order
  const Teams = { POINTS, LIST: [{ id: "red", name: "RED", color: [1, 0, 0], tier: 3 }, { id: "blue", name: "BLUE", color: [0, 0, 1], tier: 1 }] };
  const h = bootResults({ season, cars, globals: { Teams } });
  h.api.buildStandings();
  const rows = rowsOf(h.dom.byId("standings-body")).map(nameOf);
  const teams = rows.filter((n) => n === "RED" || n === "BLUE");
  assert.deepEqual(teams, ["BLUE", "RED"], "equal points: the lower tier ranks first, as Career settles it");
});

// A CLASSIFICATION READS TO THE THOUSANDTH. The TIME TRIAL board and YOUR BEST
// used G.fmtTime, the two-decimal HUD clock, so two board entries 0.004 s apart
// printed as the same time. The sheets use Dom.fmtLap; the HUD keeps its clock.
test("the TIME TRIAL sheet prints YOUR BEST and the board to the thousandth", () => {
  const h = bootResults({ season: null, cars: [], seasonMode: false,
    globals: { GhostShare: { hasGuest: () => false }, Ghost: { hasGhost: () => false, bestTime: () => Infinity, clear() {}, snapshot: () => null } } });
  Object.assign(h.G, {
    player: { best: 81.1634 }, ttNewRecord: false, ttSessionTs: 10, fmtTime: (t) => t.toFixed(2),
    records: { board: () => [{ t: 81.1634, code: "AAA", name: "Alpha", teamId: "red", ts: 11 }, { t: 81.1674, code: "BBB", name: "Bravo", teamId: "blue", ts: 1 }] },
    teamById: () => null,
  });
  h.api.buildTTResults();
  const pts = h.els.resultsTable.children.flatMap((r) => r.children || []).filter((c) => c.classList.contains("res-pts")).map((c) => c.textContent);
  assert.deepEqual(pts, ["1:21.163", "1:21.163", "1:21.167"], "two laps 0.004 s apart must not print alike");
});

test("SettingRow wrap:false clamps the LAPS chevrons at the ends", () => {
  const dom = makeDom();
  const sb = { document: dom.document };
  sb.window = sb;
  const ctx = vm.createContext(sb);
  vm.runInContext(src("js/ui/setting-row.js"), ctx, { filename: "js/ui/setting-row.js" });
  const SettingRow = vm.runInContext("SettingRow", ctx);
  const built = SettingRow.build("rs-laps", "LAPS");
  dom.body.appendChild(built.row);
  let laps = 3;
  SettingRow.wire(built.row, {
    values: [[3, "3"], [5, "5"], [57, "57 (FULL)"]],
    read: () => laps,
    write: (v) => { laps = +v; },
    wrap: false,
  });
  assert.equal(built.prev.disabled, true, "down from 3 does not wrap to FULL");
  built.prev.click();
  assert.equal(laps, 3);
  built.next.click();
  assert.equal(laps, 5);
  built.next.click();
  assert.equal(laps, 57);
  assert.equal(built.next.disabled, true, "up from FULL does not wrap to 3");
  built.next.click();
  assert.equal(laps, 57);
  built.prev.click();
  assert.equal(laps, 5);
});
