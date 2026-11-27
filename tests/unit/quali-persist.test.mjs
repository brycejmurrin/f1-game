/* quali-persist.test.mjs — openQuali must not wipe a driven grid.

 * clear() used to delete season.qualiOrder, then simulate(0) re-persisted an
 * all-AI sheet. Re-opening QUALIFYING after a real lap (or a reload) threw
 * the driven order away. restoreFromSeason also rebuilt rows with empty
 * names, so the sheet read as "  " / +0.000.
 *
 * Run: node --test tests/unit/quali-persist.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { withI18n } from "../helpers/i18n-ctx.mjs";
import { fileURLToPath } from "node:url";
import { seedLog } from "../helpers/seed-log.mjs";
import { fnSource } from "../helpers/fn-source.mjs";
import { gameSource, symbolSource } from "../helpers/game-source.mjs";
import { absSrc } from "../helpers/abs-src.mjs";
import { createRequire } from "node:module";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = fs.readFileSync(path.join(ROOT, "js/race/quali-model.js"), "utf8");
const GAME = gameSource();   // game.js + the modules carved from it (tests/helpers/game-source.mjs)
const QUALI_NET = fs.readFileSync(path.join(ROOT, "js/race/quali-net.js"), "utf8");
const CAREER_UI = fs.readFileSync(path.join(ROOT, "js/career/career-ui.js"), "utf8");

function car(id, code, name, team, isPlayer) {
  return {
    driverId: id, code, name, team: { id: team }, isPlayer: !!isPlayer,
    tierV: 1, skill: 1, tier: 1, seat: 0,
  };
}

function loadQuali(opts = {}) {
  const saved = {};
  const G = {
    $: () => null,
    season: opts.season || { round: 0 },
    seasonMode: true,
    seasonRound: 0,
    cars: opts.cars || [
      car("p1", "VER", "Verstappen", "rb", true),
      car("p2", "HAM", "Hamilton", "me", false),
    ],
    track: opts.track || { n: 80, total: 4000, def: { id: "monza" } },
    gripMult: () => 1,
    simSeed: () => (opts.seed == null ? 1 : opts.seed),
    vTop: () => 90,
    aTop: () => 12,
    LAT_MAX: 40,
    BRAKE: 30,
    difficulty: "normal",
    store: {
      set(k, v) { saved[k] = v; },
      get(k, d) { return saved[k] ?? d; },
    },
    cssCol: () => "#000",
    fmtTime: (t) => String(t),
    // The live instance: persistOrder's friend-race guard asks G.netPlay.active()
    // (NetPlay.isOn() never existed on the module or the instance — the old
    // guard was dead, and a VS FRIEND quali overwrote the stored grid).
    netPlay: { active: () => !!opts.netOn },
  };
  const ctx = {
    console,
    Math,
    Map,
    Float64Array,
    Quali: undefined,
    Teams: { LIST: [{ id: "rb", color: [1, 0, 0] }, { id: "me", color: [0, 0, 1] }] },
    PhysicsConsts: { DIFF: { normal: { ai: 1 } } },
    DriverRatings: opts.ratings || { get: () => ({ consistency: 90 }) },
    Career: {
      inCareer: () => !!opts.inCareer,
      conflicted: () => !!opts.conflicted,
      save() { saved.career = true; },
      data: () => ({ seed: 1 }),
      seasonSeed: () => 1,
      round: () => 0,
      hash: opts.hash || (() => 0.5),
      devFor: () => 0,
    },
    Tracks: { curvature: () => 0.002 },
    ScrollFade: { refresh() {} },
    NetPlay: {},   // module global carries no instance state — the guard asks G.netPlay
  };
  vm.createContext(ctx);
  seedLog(ctx);
  vm.runInContext(SRC.replace(/^const\b/gm, "var"), ctx, { filename: absSrc("js/race/quali-model.js") });
  return { q: ctx.Quali.create(G), G, saved, ctx };
}

test("clear() keeps a driven persist; clear(true) forgets it", () => {
  const order = [
    { id: "p1", t: 71.2, human: true },
    { id: "p2", t: 71.8, human: false },
  ];
  const { q, G } = loadQuali({ season: { qualiOrder: order.slice(), round: 0 } });
  q.clear();
  assert.ok(G.season.qualiOrder, "reopening the sheet must not delete qualiOrder");
  assert.equal(G.season.qualiOrder[0].t, 71.2);
  q.clear(true);
  assert.equal(G.season.qualiOrder, undefined);
});

test("a pending deletion is limited to its circuit, stage, season, seat and solo mode", () => {
  const { q, G, ctx } = loadQuali({ season: { round: 0, stage: "sprint", seed: 17 } });
  ctx.SeasonCal = { drawRound: (s) => s.round + (s.stage === "sprint" ? 1000 : 0) };
  const original = { ...G.cars[0], lap: 1 };
  q.markDeletedLap(original, false);
  const replacement = { ...original, qualiCut: false };

  assert.equal(q.hasDeletedLap(replacement, false), true, "a replacement car inherits the pending deletion");
  assert.equal(q.hasDeletedLap(replacement, true), false, "a friend room does not inherit a solo result");
  assert.equal(q.hasDeletedLap({ ...replacement, driverId: "p2" }, false), false);
  G.season.stage = "race";
  assert.equal(q.hasDeletedLap(replacement, false), false, "GP qualifying is a separate session from sprint qualifying");
  G.season.stage = "sprint";
  G.season.seed = 18;
  assert.equal(q.hasDeletedLap(replacement, false), false, "a new championship gets a fresh attempt");
  G.season.seed = 17;
  G.track = { def: { id: "spa" } };
  assert.equal(q.hasDeletedLap(replacement, false), false);
  G.track = { def: { id: "monza" } };
  G.seasonMode = false;
  assert.equal(q.hasDeletedLap(replacement, false), false);
  G.seasonMode = true;
  q.clearDeletedLap(replacement, false);
  assert.equal(q.hasDeletedLap(replacement, false), false);
});

test("restore fills names, gaps, and isPlayer from live cars", () => {
  const { q } = loadQuali({
    season: {
      qualiOrder: [
        { id: "p2", t: 70.1, human: true },
        { id: "p1", t: 71.4, human: true },
      ],
      round: 0,
    },
  });
  const rows = q.results();
  assert.ok(rows);
  assert.equal(rows[0].code, "HAM");
  assert.equal(rows[0].name, "Hamilton");
  assert.equal(rows[0].isPlayer, false);
  assert.equal(rows[1].code, "VER");
  assert.equal(rows[1].isPlayer, true);
  assert.equal(rows[1].gap, 1.3);
});

test("begin() restores a driven persist instead of resimming", () => {
  const { q, G } = loadQuali({
    season: {
      qualiOrder: [
        { id: "p1", t: 69.9, human: true },
        { id: "p2", t: 70.4, human: false },
      ],
      round: 0,
    },
  });
  const rows = q.begin();
  assert.equal(rows[0].t, 69.9);
  assert.equal(rows[0].code, "VER");
  assert.equal(G.season.qualiOrder[0].t, 69.9, "begin must not overwrite persist with a sim");
});

test("restoring a saved grid projects live metadata without modifying its inputs", () => {
  const raw = Object.freeze([
    Object.freeze({ id: "p2", t: 70.1, human: 1, code: "OLD", name: "Old name" }),
    Object.freeze({ id: "p1", t: "71.4", human: 0, noTime: 1 }),
  ]);
  const cars = [car("p1", "NEW", "Current driver", "new-team", true), car("p2", "HAM", "Hamilton", "me", false)];
  const beforeCars = structuredClone(cars), beforeRaw = structuredClone(raw);
  const { q } = loadQuali({ season: { qualiOrder: raw, round: 0 }, cars });
  const rows = q.results();
  assert.equal(rows[0].code, "HAM");
  assert.equal(rows[0].name, "Hamilton");
  assert.equal(rows[0].human, true);
  assert.equal(Object.hasOwn(rows[0], "noTime"), false);
  assert.equal(rows[1].code, "NEW");
  assert.equal(rows[1].name, "Current driver");
  assert.equal(rows[1].team, "new-team");
  assert.equal(rows[1].isPlayer, true);
  assert.equal(rows[1].human, false);
  assert.equal(rows[1].t, "71.4", "legacy positive strings retain their stored representation");
  assert.equal(rows[1].gap, 1.3, "gap arithmetic still coerces the legacy stored time");
  assert.equal(rows[1].noTime, true);
  assert.deepEqual(cars, beforeCars);
  assert.deepEqual(raw, beforeRaw);
  rows[1].name = "Changed sheet row";
  assert.equal(cars[0].name, "Current driver");
  assert.equal(q.results()[1].name, "Current driver", "public rows remain detached from cached classification");
});

test("simulate(0) does not persist an all-AI provisional", () => {
  const { q, G } = loadQuali({ season: { round: 0 } });
  const rows = q.simulate(0);
  assert.ok(rows && rows.length === 2);
  assert.equal(G.season.qualiOrder, undefined);
});

test("a driven simulate persists; an active netPlay session does not", () => {
  const solo = loadQuali({ season: { round: 0 } });
  solo.q.simulate(new Map([["p1", 68.5]]));
  assert.ok(solo.G.season.qualiOrder, "a human lap is what makes the order worth keeping");
  assert.equal(solo.G.season.qualiOrder[0].human || solo.G.season.qualiOrder.some((r) => r.human), true);

  const net = loadQuali({ season: { round: 0 }, netOn: true });
  net.q.simulate(new Map([["p1", 68.5]]));
  assert.equal(net.G.season.qualiOrder, undefined, "a friend race must not stamp Career/season");
});

test("openQuali restores via begin(); quit-to-menu keeps persist; friend-race uses fresh", () => {
  const open = symbolSource("function openQuali(fresh, netDone)");
  const commit = symbolSource("function openQualiBody(fresh, netDone)");
  assert.match(open, /sessionEntry\.begin\("quali", key, \(\) => \{ qualiNet\.clearPeers\(\); return ensureScenery\(idx\); \},\s*\(\) => openQualiBody\(fresh, netDone\)/,
    "scenery must finish before the synchronous qualifying commit; peer times clear in prepare");
  // Not after the load: a rival's one-shot QUALI that lands during the scenery
  // download was wiped there, and the guest's sheet waited for it forever.
  assert.doesNotMatch(commit, /clearPeers/, "the commit must not wipe a rival time that arrived mid-load");
  // The load is covered (a blank screen before), and the card comes down
  // before the sheet opens.
  assert.match(open, /if \(!loadingScreen\.phase\(\)\) loadingScreen\.building\(loadingInfo\(\)\);\s*(\/\/[^\n]*\s*)*return sessionEntry\.begin/);
  assert.ok(commit.indexOf("loadingScreen.stop();") >= 0 && commit.indexOf("loadingScreen.stop();") < commit.indexOf("qualiSheet.open("),
    "the loading card must come down before the qualifying sheet opens");
  // openQuali is the latched wrapper: nobody awaits it, so it must catch its own
  // failure and land on the menu rather than raise the global error overlay.
  // A friend-race gate (netDone) is armed before the quit so quitToMenu cancels
  // the lobby; otherwise friendQualifying would gate every later quali save.
  assert.match(open, /\(e\) => \{[^}]*qualiSheet\.close\(\); (?:if \(netDone\) qualiNet\.arm\(netDone\); )?quitToMenu\(\); \}\)/,
    "entry recovery must close the sheet and return to the menu");
  assert.match(open, /\.catch\(\(e\) => Log\.debug\("game", "openQuali rejected/,
    "menu callers fire and forget, so the wrapper must observe rejection");
  assert.match(commit, /if \(fresh\) quali\.simulate\(0\); else quali\.begin\(\)/);
  assert.match(QUALI_NET, /openQuali\(true, done \|\| null\)/);   // fresh sim, and the gate handed in
  // quitToMenu's clear is memory-only for every championship; the one persist it
  // may drop is a ONE-OFF GP weekend's own order (forgetGp), which no CONTINUE
  // ever re-grids from — a championship's flag stays false by construction.
  assert.match(GAME, /quali\.clear\(forgetGp\);   \/\/ memory only/);
  assert.match(GAME, /const forgetGp = !isChampionship\(\) && !!season && season\.qualiMode === "gp";/,
    "quitToMenu may forget only a one-off GP's order, never a season's or career's");
  // NOT a blanket whole-file ban. The bug this suite exists for is a
  // clear(true) inside the SHEET'S OWN lifecycle (openQuali / quitToMenu),
  // which wiped the persist so simulate(0) re-stamped an all-AI grid. A
  // different and correct fix (cfab56e) calls clear(true) once at award time,
  // so a one-off GP's driven order does not grid the next weekend — and the
  // blanket ban failed that fix. It is half of what took pages.yml runs
  // 1888/1889 red on 2026-09-02 and stopped the live site updating. Ban it
  // where the bug lived; require the guard where it is legitimate.
  assert.doesNotMatch(commit, /quali\.clear\(true\)/,
    "openQuali must not wipe the persist — that is the bug this suite exists for");
  assert.doesNotMatch(symbolSource("function quitToMenu()"), /quali\.clear\(true\)/,
    "quit-to-menu keeps the persist so CONTINUE still has the driven grid");
  // This used to be the whole guard, and it asserted NOTHING: `clear(true)`
  // has no call site anywhere in js/ (measured 2026-09-22 — `clear(forget)`
  // still takes the parameter, but every caller passes none). The behaviour
  // did not regress, it MOVED: SeasonCal.award() deletes season.qualiOrder
  // itself and game.js drops only the in-memory copy. So the lexical needle
  // rotted while the invariant held, and a reader saw a guarded line that
  // scanned an empty set. Keep the ban (it costs nothing if a clear(true)
  // ever returns) but assert the invariant that is actually load-bearing.
  for (const line of GAME.matchAll(/^.*quali\.clear\(true\).*$/gm))
    assert.match(line[0], /!isChampionship\(\)/,
      "a clear(true) anywhere else is legitimate only for a one-off GP, and must say so");
  assert.match(fs.readFileSync(path.join(ROOT, "js/career/season-cal.js"), "utf8"), /delete season\.qualiOrder/,
    "award() must forget the weekend's order — without it qualiResults() stays truthy for the rest of the championship and every later grid comes off round 1's times (pages.yml 1888/1889, 2026-09-02)");
  // `if (settles) quali.clear()` — the in-memory classification goes when the
  // round scores — is proven by behaviour in the VM test "award-time clear".
  // THE FRIEND-RACE GATE IS ARMED INSIDE openQuali, FROM ITS ARGUMENT. It used
  // to be armed by openQualiForNet AFTER calling it — but openQuali is async and
  // suspends on its first await, so its own reset ran a microtask later and wiped
  // the callback. netPlay.start() is reachable only through that callback, so a
  // friend race with grid-by-qualifying silently ran two disconnected solo races.
  assert.match(commit,
    /qualiNet\.arm\(netDone\)/,
    "openQuali must arm the gate from its own argument, after its own reset");
  assert.doesNotMatch(fnSource(QUALI_NET, "function openQualiForNet(done)"), /qualiNetDone\s*=/,
    "openQualiForNet must NOT assign qualiNetDone — the async reset would wipe it");
  assert.match(QUALI_NET, /RIVAL LEFT — TO THE GRID/);
  assert.match(QUALI_NET, /qualiHadRivals/);
  // RESUME AND QUIT TEAR DOWN EVERY LIVE PREVIEW. Resume also closeSettings()
  // so the wheel-wizard axis capture disarms (BUGS.md B1) — that call may sit
  // on its own line under the closers; the closers themselves must still all
  // fire together so a new panel is not forgotten here.
  // Scoped to the function each line is about: over all of game.js the lazy
  // match ran 244k characters into quitToMenu's copy, so deleting the closers
  // from setPaused(false) still passed (testing-gap audit 2026-09-29).
  assert.match(symbolSource("function setPaused(p, why)"), /if \(!p\) \{\s*closeLightTuner\(false\); closeCamTuner\(false\); flybyPanel\.closeFlyby\(false\); exitPhotoMode\(\);/);
  assert.match(symbolSource("function setPaused(p, why)"), /closeSettings\(\)/,
    "setPaused(false) must closeSettings so pad axis capture cannot survive resume");
  assert.match(symbolSource("function quitToMenu()"), /closeCamTuner\(false\); flybyPanel\.closeFlyby\(false\); exitPhotoMode\(\);/);
  assert.match(GAME, /isCareer\(\) && Career\.conflicted\(\)/);
  // The caution pace cap, now four levels deep: RED (4) stops the field at a
  // walking-pace floor rather than 0, so every "approaches vmax" fade stays
  // finite; VSC (2) is the flat 0.6× delta; SC (3) queues via
  // RaceControl.scQueueFrac (leader 0.45×, catch-up to 0.6× when > 1 s adrift)
  // so a stop under the SC can close the train (B5.13) instead of freezing gaps.
  // Nested vTop() inside scQueueFrac's args means a flat [^)]* needle cannot pin
  // the call — pin the three-way shape and that SC routes through the queue.
  assert.match(GAME, /vTop\(\) \* \(lvl >= 4 \? 0\.02[\s\S]*?lvl === 3 \? RaceControl\.scQueueFrac\([\s\S]*?\)\s*:\s*0\.6\)/);
  assert.match(GAME, /RaceControl\.scQueueFrac\(c, cars, track\.total, ranked\[0\], vTop\(\), pits\.inLane\)/);
  // RACE AGAIN / quit-to-menu end the session first. Unguarded since
  // 2026-09-28: stop() on an INACTIVE session forgets a stale disconnect
  // reason (a mid-race drop otherwise read "Disconnected" in every later solo
  // race's pause menu), so the `if (netPlay.active())` guard went.
  assert.match(GAME, /netPlay\.stop\("local"\);   \/\/ inactive after a mid-race drop/);
  assert.match(GAME, /if \(netPlay\.active\(\) \|\| qualiNet\.hasArmed\(\)\) return/);
  assert.match(SRC, /if \(!classification\.some\(\(r\) => r\.human\)\) return/);
});

test("friend-race BACK aborts to the lobby; a null quali grid does not P12-shuffle", () => {
  assert.match(GAME, /qualiNet\.hasArmed\(\) \? qualiNet\.resetOnBackWithAbort\(\)/);
  assert.match(QUALI_NET, /netLobby\.abortQuali\(\)/);
  // The guard, not its exact punctuation: the line has since grown a
  // loadingScreen.stop() before openQuali(), and an exact-line needle would
  // fail a change that keeps the behaviour it is here to pin. What matters is
  // that a null order routes to quali and BAILS OUT of the race start.
  assert.match(GAME, /if \(!isQuali\(\) && gridFromQuali\(\) && !quali\.order\(cars\)\) \{[^}]*openQuali\(\);[^}]*return false;[^}]*\}/);
});

test("friend-race title quit cancels the lobby instead of aborting back into it", () => {
  // NOT GAME.slice(i, i + 2200) — that window took the deploy branch red on
  // 2026-09-02: quitToMenu grew and netLobby.cancel() moved to +2605, so this
  // assertion failed for a call that was still there. See tests/helpers/fn-source.mjs.
  const quit = symbolSource("function quitToMenu()");
  assert.match(quit, /qualiNet\.resetOnQuitWithCancel\(isQuali\(\) && state === "race"\)/);
  assert.match(fnSource(QUALI_NET, "function resetOnQuitWithCancel(unfinished)"), /netLobby\.cancel\(\)/);
  assert.doesNotMatch(quit, /netLobby\.abortQuali\(\)/);
});

test("order() is null when a live car is missing from the persist", () => {
  const { q, G } = loadQuali({
    season: {
      qualiOrder: [{ id: "p1", t: 69.9, human: true }],
      round: 0,
    },
  });
  assert.equal(q.order(G.cars), null);
});

test("persistOrder skips a conflicted career save", () => {
  const { q, G, saved } = loadQuali({ season: { round: 0 }, inCareer: true, conflicted: true });
  q.simulate(new Map([["p1", 68.5]]));
  assert.equal(G.season.qualiOrder, undefined);
  assert.equal(saved.career, undefined);
});

// The SHEET (js/ui/quali-sheet.js) is a separate module that only ever sees
// `quali.rows()`: the model owns timing, ordering and the persist; the sheet
// owns #q-table, #q-title and #quali's hidden bit. A stub element is enough —
// what is pinned is the row shape the sheet consumes and what it draws from it.
const SHEET_SRC = fs.readFileSync(path.join(ROOT, "js/ui/quali-sheet.js"), "utf8");

function loadSheet({ dom = false, globals = {} } = {}) {
  class El {
    constructor(tag) { this.tag = tag; this.className = ""; this.style = {}; this.children = []; this.hidden = true; this._t = ""; }
    get textContent() { return this._t; }
    set textContent(v) { this._t = v; this.children.length = 0; }
    appendChild(c) { this.children.push(c); return c; }
    append(...cs) { for (const c of cs) this.children.push(c); }
    setAttribute(k, v) { (this.attrs ||= {})[k] = String(v); }
  }
  const els = new Map(["q-table", "q-title", "quali"].map((id) => [id, new El("div")]));
  let refreshed = 0;
  const G = { $: (id) => els.get(id) || null, cssCol: (c) => "rgb(" + c.join(",") + ")", fmtTime: (t) => "T" + t };
  const ctx = {
    Map, QualiSheet: undefined,
    Teams: { LIST: [{ id: "rb", color: [1, 0, 0] }, { id: "me", color: [0, 0, 1] }] },
    ScrollFade: { refresh() { refreshed++; } },
    document: { createElement: (tag) => new El(tag) },
    ...globals,
  };
  vm.createContext(ctx);
  seedLog(ctx);
  withI18n(ctx);
  if (dom) vm.runInContext(fs.readFileSync(path.join(ROOT, "js/ui/dom.js"), "utf8").replace(/^const\b/gm, "var"), ctx, { filename: absSrc("js/ui/dom.js") });
  vm.runInContext(fs.readFileSync(path.join(ROOT, "js/ui/results-sheet.js"), "utf8").replace(/^const\b/gm, "var"), ctx, { filename: absSrc("js/ui/results-sheet.js") });   // GameResultsSheet.row (#7052)
  vm.runInContext(SHEET_SRC.replace(/^const\b/gm, "var"), ctx, { filename: absSrc("js/ui/quali-sheet.js") });
  return { sheet: ctx.QualiSheet.create(G), els, refreshed: () => refreshed };
}

// UI hunt 3: the pole BADGE card is built already filled, which a screen
// reader does not announce; open() says it once the sheet is up.
test("a driven pole's badge is spoken when the sheet opens; no badge, no line", () => {
  const said = [], timers = [];
  const globals = { LiveRegion: { say: (t, k) => said.push([t, k]) }, setTimeout: (fn) => timers.push(fn),
    Badges: { onPole: () => ["pole"], labelOf: () => "POLE SITTER" } };
  const { sheet, els } = loadSheet({ globals });
  sheet.open([{ pos: 1, code: "VER", name: "Max", team: "me", isPlayer: true, human: true, t: 60, gap: 0 }]);
  assert.equal(els.get("q-table").children.at(-1).className, "res-personal", "the card is on the sheet");
  timers.splice(0).forEach((fn) => fn());
  assert.deepEqual(said, [["BADGE UNLOCKED POLE SITTER", "save"]]);
  const quiet = loadSheet({ globals: { ...globals, Badges: { onPole: () => [], labelOf: () => "" } } });
  quiet.sheet.open([{ pos: 2, code: "VER", name: "Max", team: "me", isPlayer: true, human: true, t: 61, gap: 1 }]);
  timers.splice(0).forEach((fn) => fn());
  assert.equal(said.length, 1);
});

// #6883 row 4: the YOU row is nameable (text + aria-current) and the grid is a list.
test("the quali sheet's YOU row carries a YOU tag and aria-current; rivals do not", () => {
  const { sheet, els } = loadSheet();
  sheet.build([
    { pos: 1, code: "RIV", name: "Rival", team: "rb", t: 60, gap: 0 },
    { pos: 2, code: "VER", name: "Max", team: "me", isPlayer: true, t: 61, gap: 1 },
  ]);
  const table = els.get("q-table");
  assert.equal(table.attrs.role, "list");
  const [rival, me] = table.children;
  assert.equal(me.attrs.role, "listitem");
  assert.equal(me.attrs["aria-current"], "true");
  assert.equal(rival.attrs["aria-current"], undefined);
  const nameOf = (row) => row.children.find((c) => c.className === "res-name");
  assert.ok(nameOf(me).children.some((c) => c._t.trim() === "YOU"), "a YOU tag inside the name");
  assert.equal(nameOf(rival).children.length, 0);
});

// hunt2 ui-menus: SIMULATE / peer rebuild while #quali stays open must drop the
// badge when the player is no longer on a driven pole (poleNew used to stick).
test("a rebuild off driven pole clears the BADGE UNLOCKED card while the sheet stays open", () => {
  let awarded = ["pole"];
  const globals = {
    Badges: { onPole: () => awarded, labelOf: () => "POLE SITTER" },
  };
  const { sheet, els } = loadSheet({ globals });
  const table = els.get("q-table");
  sheet.open([{ pos: 1, code: "VER", name: "Max", team: "me", isPlayer: true, human: true, t: 60, gap: 0 }]);
  assert.equal(table.children.at(-1).className, "res-personal");
  awarded = [];   // badge already granted; a same-grid rebuild must keep the card
  sheet.build([{ pos: 1, code: "VER", name: "Max", team: "me", isPlayer: true, human: true, t: 60, gap: 0 }]);
  assert.equal(table.children.at(-1).className, "res-personal", "driven pole rebuild keeps the unlock card");
  sheet.build([
    { pos: 1, code: "HAM", name: "Lewis", team: "rb", isPlayer: false, human: false, t: 59, gap: 0 },
    { pos: 2, code: "VER", name: "Max", team: "me", isPlayer: true, human: false, t: 61, gap: 2 },
  ]);
  assert.equal(table.children.some((c) => c.className === "res-personal"), false,
    "SIMULATE / peer rows off driven pole drop the card");
});

test("the sheet paints quali.rows(): a rival's DRIVEN lap is tagged, the title carries the player's P", () => {
  const { q } = loadQuali({ season: { round: 0 } });
  q.simulate(new Map([["p2", 65.0]]));          // HAM drove it; VER (the player) is modelled
  const rows = q.rows();
  assert.equal(rows.length, 2);
  assert.ok(rows.every((r) => !("car" in r)), "rows() must drop the live car ref the sheet has no use for");
  const { sheet, els, refreshed } = loadSheet();
  sheet.open(rows);
  const table = els.get("q-table");
  assert.equal(table.children.length, 2);
  const ham = table.children.find((r) => r.className.includes("q-real"));
  assert.ok(ham, "a rival's real lap gets the q-real class");
  assert.equal(ham.children[2].children[0].textContent, " DRIVEN");
  const you = table.children.find((r) => r.className.includes(" you"));
  assert.ok(you && !you.className.includes("q-real"), "the local player is `you`, never DRIVEN-tagged");
  assert.equal(table.children[0].children[3].textContent, "T" + rows[0].t, "P1 shows the lap, the rest show gaps");
  assert.match(table.children[1].children[3].textContent, /^\+\d+\.\d{3}$/);
  assert.match(els.get("q-title").textContent, /^QUALIFYING — P[12]$/);
  assert.equal(els.get("quali").hidden, false);
  assert.equal(refreshed(), 1, "open() refreshes the scroll fades once");
  sheet.close();
  assert.equal(els.get("quali").hidden, true);
  sheet.build(null);                              // nothing simulated: an empty table, no throw
  assert.equal(table.children.length, 0);
});

test("the model no longer owns any DOM — build/open/close live on the sheet", () => {
  const { q } = loadQuali({});
  for (const k of ["build", "open", "close"]) assert.equal(q[k], undefined, `Quali.${k} moved to QualiSheet`);
  assert.equal(typeof q.rows, "function");
  assert.equal(q.rows(), null, "nothing simulated yet");
  assert.doesNotMatch(SRC, /document\.createElement|ScrollFade/, "quali.js is the model: no DOM, no sheet chrome");
  assert.doesNotMatch(SHEET_SRC, /GameStore|G\.store|Career\.|simulate\(|persistOrder|localStorage/,
    "quali-sheet.js is the sheet: no timing, no persist (code tokens, not prose)");
});

/* ── THE WEEKEND MUST END WITH THE WEEKEND ────────────────────────────────────
 *
 * The persist carries a circuit stamp (qualiTrack) and restoreFromSeason
 * refuses a mismatch — but the IN-MEMORY classification short-circuited that
 * check on its first line, so it outlived the weekend that made it. award()
 * deletes season.qualiOrder when a round scores; the memory stayed, so
 * qualiResults() was still truthy at the next rs-go, race-settings.js's
 * `!qualiResults()` gate never opened the sheet, and startRace's
 * `quali.order(cars)` (driverIds are stable all season) gridded round N off
 * round 1's lap times. From round 2 to the end of a championship you were
 * never asked to qualify and every grid was the same.
 */

test("an in-memory classification does not follow the player to another circuit", () => {
  const { q, G } = loadQuali({
    season: {
      qualiOrder: [
        { id: "p1", t: 69.9, human: true },
        { id: "p2", t: 70.4, human: false },
      ],
      qualiTrack: "monza",
      round: 0,
    },
  });
  assert.ok(q.results(), "same circuit: the weekend's own order");
  // award() drops the persist when the round scores. Only the memory is left.
  delete G.season.qualiOrder;
  delete G.season.qualiTrack;
  assert.ok(q.results(), "still this circuit — the memory is legitimately the sheet");
  G.track = { n: 80, total: 4000, def: { id: "spa" } };
  assert.equal(q.results(), null, "round 2 at Spa must not read Monza's lap times");
  assert.equal(q.order(G.cars), null, "and must not grid off them either");
});

test("award-time clear: career's hand-rolled return to the title clears the memory too", () => {
  assert.match(CAREER_UI, /G\.qualiClear\(\);/,
    "career's hand-rolled return to the title must clear it too");
});

// The stamp above catches a CHANGE of circuit; this catches a calendar that
// visits one twice. Both are needed — neither subsumes the other. The REAL game
// in the VM: a season round qualifies (RACE SETTINGS → QUALIFYING sheet → TO
// THE GRID), races, and scores at the flag; the in-memory classification must
// go with it. qualiResults() is not on the façade, so it is read where the game
// reads it: RACE SETTINGS' GO button offers qualifying only while
// qualiResults() is null (js/race/race-settings.js buildRaceSettings).
test("award-time clear: game.js drops the memory when the round scores", async () => {
  const { createGame, settle } = createRequire(import.meta.url)("../../tools/lib/game-vm.cjs");
  const g = await createGame({ track: "monza", carMeshes: false });
  try {
    const a = g.apex, G = g.G, $ = (id) => g.sandbox.document.getElementById(id);
    a.headless(true);
    const S = vm.runInContext("SeasonCal", g.ctx);
    G.daily.stop(); G.timeTrial = false; G.practice = false;
    G.flow = "season"; G.session = "race";
    const r = S.applyConfig(Object.assign(S.fresh(), { quali: true, trackIds: ["monza", "spa"] }));
    G.season = r.season; G.trackIdx = S.trackIndex(0); G.raceLaps = 3;
    G.openRaceSettings("select");
    const qLabel = $("rs-go").textContent;
    assert.match(qLabel, /^START (?!RACE)/, `no classification yet: GO qualifies (${qLabel})`);
    $("rs-go").onclick();   // → openQuali(): the sheet simulates the session
    await settle(() => G.session === "quali" && !$("quali").hidden, 4000);
    G.openRaceSettings("select");
    assert.equal($("rs-go").textContent, "START RACE", "qualified: a classification is in memory, GO races");
    $("race-settings").hidden = true;   // only read for its GO label; the quali sheet is still the screen
    const before = G.cars;
    $("q-go").onclick();   // TO THE GRID
    await settle(() => G.cars !== before && (G.state === "count" || G.state === "race"), 4000);
    assert.equal(G.session, "race");
    const round0 = G.season.round;
    a.go(); g.step(60); a.finishRace();
    assert.equal(G.state, "results");
    assert.ok(G.season.round > round0, `the round scored (round ${round0} → ${G.season.round})`);
    assert.equal(G.track.def.id, "monza", "still on the circuit the classification is stamped for");
    G.openRaceSettings("results");
    assert.equal($("rs-go").textContent, qLabel, "a scored round dropped the in-memory classification: GO qualifies again");
  } finally { g.close(); }
});

// ── the grid is a pure function of (seed, round) ────────────────────────────
// In VS FRIEND each peer computes the whole classification itself — the AI
// times come from simLap(seed, round, car) — so two peers agree on the grid
// exactly when they hash on the same seed. The lobby now ships the host's seed
// with its settings (js/net/lobby.js publishSettings); this pins the other
// half of that contract: equal seeds give byte-identical rows, and the seed is
// not decorative (a different one moves at least one AI time).
test("equal seeds give identical AI qualifying rows; a different seed does not", () => {
  // The harness stubs Career.hash to a constant; give it a real one so the seed
  // reaches the draw (FNV-1a over the hash arguments, like js/core/hash32.js).
  const hash = (...a) => { let h = 2166136261; for (const ch of a.join("|")) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return (h % 100000) / 100000; };
  const pick = (rows) => rows.map((r) => [r.driverId, r.pos, r.t]);
  const a = pick(loadQuali({ seed: 4242, hash }).q.preview(null));
  const b = pick(loadQuali({ seed: 4242, hash }).q.preview(null));
  const c = pick(loadQuali({ seed: 4243, hash }).q.preview(null));
  assert.deepEqual(a, b, "the same seed on two peers must classify the field identically");
  assert.notDeepEqual(a, c, "a different seed must move at least one AI time");
});

test("a player whose every lap was deleted (driven = Infinity) is NO TIME, last — not handed the model's lap", () => {
  // Bug hunt 2026-09-26: a cut quali lap left myLap 0, so compute() gave the
  // player simLap() — a time that could be pole. Infinity means "drove, no time".
  const { q } = loadQuali({ cars: [
    car("p1", "VER", "Verstappen", "rb", true),
    car("p2", "HAM", "Hamilton", "me", false),
    car("p3", "LEC", "Leclerc", "rb", false),
  ] });
  q.simulate(new Map([["p1", Infinity]]));
  const rows = q.rows();
  const me = rows.find((r) => r.isPlayer);
  assert.equal(me.pos, rows.length, "NO TIME starts from the back");
  assert.equal(me.noTime, true);
  assert.ok(Number.isFinite(me.t) && Number.isFinite(me.gap), "the sheet still gets finite numbers");
  for (const r of rows) if (!r.isPlayer) assert.ok(r.t < me.t);
});

// Round 2 (R2-02 / S5): the NO TIME row's t is the synthetic slowest+1. Lost on
// reload, the sheet painted it as a real "+1.000" lap and DRIVEN.
test("NO TIME survives persist -> restore", () => {
  const season = { round: 0 };
  const a = loadQuali({ season });
  a.q.simulate(new Map([["p1", Infinity]]));
  assert.equal(season.qualiOrder.find((e) => e.id === "p1").noTime, true);
  assert.equal(season.qualiOrder.find((e) => e.id === "p2").noTime, undefined, "only the NO TIME row is flagged");
  const b = loadQuali({ season });
  b.q.begin();
  const me = b.q.rows().find((r) => r.isPlayer);
  assert.equal(me.noTime, true, "the restored row still reads NO TIME");
  assert.equal(b.q.rows().find((r) => !r.isPlayer).noTime, undefined);
});

// S1: the order is the player's own weekend.
test("a persisted order is refused once the player's team or driver changed", () => {
  const season = { round: 0 };
  const a = loadQuali({ season });
  a.G.seasonMode = false;
  a.q.simulate(new Map([["p1", 68.5]]));
  assert.equal(season.qualiSeat, "p1|rb");
  const same = loadQuali({ season });
  same.G.seasonMode = false;
  assert.ok(same.q.results(), "same seat: restored");
  const team = loadQuali({ season, cars: [car("p1", "VER", "Verstappen", "me", true), car("p2", "HAM", "Hamilton", "rb", false)] });
  team.G.seasonMode = false;
  assert.equal(team.q.results(), null, "another team under the same driver must not read it");
  assert.equal(team.q.order(team.G.cars), null);
  const drv = loadQuali({ season, cars: [car("p1", "VER", "Verstappen", "rb", false), car("p2", "HAM", "Hamilton", "me", true)] });
  drv.G.seasonMode = false;
  assert.equal(drv.q.results(), null, "another driver seat must not read it");
  delete season.qualiSeat;
  const old = loadQuali({ season, cars: [car("p1", "VER", "Verstappen", "me", true), car("p2", "HAM", "Hamilton", "rb", false)] });
  old.G.seasonMode = false;
  assert.ok(old.q.results(), "an unstamped (older) persist is still accepted");
});

test("clear(true) forgets the seat stamp with the rest", () => {
  const { q, G } = loadQuali({ season: { round: 0 } });
  q.simulate(new Map([["p1", 70]]));
  assert.ok(G.season.qualiSeat);
  q.clear(true);
  assert.equal(G.season.qualiSeat, undefined);
});

// ── THE ORDER BELONGS TO ITS MODE, not just its circuit ─────────────────────
// Bug hunt 2026-09-27: a one-off GP and the standalone championship share ONE
// season object, so a one-off GP's driven order at Monza passed the qualiTrack
// check and gridded season round 1 at Monza. The one-off contract above still
// holds — the order persists for THAT one-off GP — but it is stamped with its
// mode and refused by any other (championship, or another career slot).
test("a one-off GP's driven order persists for the one-off GP but not season round 1 at the same circuit", () => {
  const { q, G } = loadQuali({ season: { round: 0 } });
  G.seasonMode = false;                              // one-off Grand Prix
  q.simulate(new Map([["p1", 68.5]]));
  assert.equal(G.season.qualiMode, "gp", "the persist is stamped with its mode");
  q.clear();                                         // memory only (reopen / reload)
  assert.ok(q.results(), "same one-off GP: the driven order comes back");
  assert.equal(q.results().find((r) => r.human).t, 68.5);
  G.seasonMode = true;                               // season round 1, same circuit
  assert.equal(q.results(), null, "the championship must not read the one-off's order");
  assert.equal(q.order(G.cars), null, "and must not grid off it either");
  G.seasonMode = false;
  assert.ok(q.order(G.cars), "back in the one-off: still its own order");
});

test("a one-off GP's qualifying never overwrites the grid a season round is keeping", () => {
  // Hunt 2026-09-30: quit a season round after qualifying (the grid is kept for
  // CONTINUE), play a one-off GP and drive its qualifying: persistOrder wrote the
  // GP's order over the season's on the shared object, and the round had to be
  // qualified again.
  const { q, G } = loadQuali({ season: { round: 0 } });
  G.seasonMode = true;
  q.simulate(new Map([["p1", 70.25]]));
  assert.equal(G.season.qualiMode, "season");
  q.clear();
  G.seasonMode = false;                              // a one-off GP, driven
  q.simulate(new Map([["p1", 68.5]]));
  assert.equal(G.season.qualiMode, "season", "the season's stamp stands");
  assert.equal(G.season.qualiOrder.find((r) => r.human).t, 70.25, "and its driven order");
  q.clear();
  G.seasonMode = true;
  assert.equal(q.results().find((r) => r.human).t, 70.25, "CONTINUE still grids off the season's lap");
});

test("a career slot's order is refused by another slot, the championship and the one-off GP", () => {
  const { q, G, ctx } = loadQuali({ season: { round: 0 }, inCareer: true });
  ctx.Career.slot = () => ({ flavour: "driver", i: 0 });
  q.simulate(new Map([["p1", 68.5]]));
  assert.equal(G.season.qualiMode, "career:driver:0");
  q.clear();
  assert.ok(q.results(), "same slot: restored");
  ctx.Career.slot = () => ({ flavour: "driver", i: 1 });
  assert.equal(q.results(), null, "another career slot must not read it");
  ctx.Career.inCareer = () => false;
  assert.equal(q.results(), null, "nor the standalone championship");
  G.seasonMode = false;
  assert.equal(q.results(), null, "nor a one-off GP");
  delete G.season.qualiMode;
  assert.ok(q.results(), "an unstamped (older) persist is still accepted");
});

// POLE TO THE THOUSANDTH. The gaps under it are +0.123, so a pole painted with
// the two-decimal HUD clock (1:21.16) could not be told from a lap 0.004 s
// slower. With Dom loaded (as in the shell) the sheet uses Dom.fmtLap.
test("the quali sheet prints pole with three decimals, like its gaps", () => {
  const { sheet, els } = loadSheet({ dom: true });
  sheet.open([
    { pos: 1, t: 81.1634, gap: 0, code: "VER", name: "Verstappen", team: "rb", isPlayer: false },
    { pos: 2, t: 81.1674, gap: 0.004, code: "YOU", name: "You", team: "me", isPlayer: true },
  ]);
  const table = els.get("q-table");
  assert.equal(table.children[0].children[3].textContent, "1:21.163");
  assert.equal(table.children[1].children[3].textContent, "+0.004");
});

test("a duel's trimmed field restores the saved order of the field that qualified (W18 #7)", () => {
  // startRace trims a duel to [player, rival] AFTER qualifying, so the order
  // saved for CONTINUE names the whole field. A reload then refused it (id count
  // mismatch) and reopened QUALIFYING.
  const me = car("p1", "VER", "Verstappen", "rb", true);
  const rival = Object.assign(car("p3", "LEC", "Leclerc", "me", false), { duelRival: true });
  const { q } = loadQuali({
    cars: [me, rival],
    season: {
      round: 0,
      qualiOrder: [
        { id: "p3", t: 70.1, human: false },
        { id: "p2", t: 70.5, human: false },
        { id: "p1", t: 71.0, human: true },
      ],
    },
  });
  const grid = q.order([me, rival]);
  assert.ok(grid, "the saved order is accepted for the trimmed field");
  assert.deepEqual(JSON.parse(JSON.stringify(grid.map((c) => c.driverId))), ["p3", "p1"], "in the order they qualified");
});

test("outside a duel a saved order naming a car no longer in the field is still refused", () => {
  const me = car("p1", "VER", "Verstappen", "rb", true);
  const other = car("p3", "LEC", "Leclerc", "me", false);
  const { q } = loadQuali({
    cars: [me, other],
    season: { round: 0, qualiOrder: [{ id: "p3", t: 70.1 }, { id: "p2", t: 70.5 }, { id: "p1", t: 71.0, human: true }] },
  });
  assert.equal(q.order([me, other]), null);
});

// #4343: the |curvature| cache keyed on track.def.id alone, so two id-less tracks
// with the same sample count shared one cache and the second lap was the first's.
test("id-less tracks with the same sample count do not share the curvature cache (#4343)", () => {
  const { q, ctx } = loadQuali();
  ctx.Tracks.curvature = (t) => t.k;
  const c = car("p1", "VER", "Verstappen", "rb", true);
  const straight = { n: 80, total: 4000, k: 0 };
  const twisty = { n: 80, total: 4000, k: 0.02 };
  const tS = q.carLap(c, straight, 1);
  const tT = q.carLap(c, twisty, 1);
  assert.ok(tT > tS * 1.05, `the twisty track is slower: ${tT} vs ${tS}`);
  assert.equal(q.carLap(c, straight, 1), tS, "and the first track still reads its own cache");
  // Tracks with ids still key on the id (unchanged path).
  const a = { n: 80, total: 4000, k: 0, def: { id: "x" } };
  assert.equal(q.carLap(c, a, 1), tS);
});

test("quali bias (#1566): a one-lap specialist is quicker on Saturday, zero-mean, keyed by driver not by seat", () => {
  const ratings = (qb) => ({ get: (code) => ({ consistency: 90, qualiBias: code === "HAM" ? qb : 0 }), style01: (v) => Math.max(-1, Math.min(1, (v || 0) / 30)) });
  const lap = (qb, isPlayer = false) => {
    const { q } = loadQuali({ ratings: ratings(qb), cars: [car("p1", "VER", "Verstappen", "rb", true), car("p2", "HAM", "Hamilton", "me", isPlayer)] });
    return q.simulate(0).find((r) => r.driverId === "p2").t;
  };
  const flat = lap(0), quick = lap(30), slow = lap(-30);
  assert.ok(quick < flat && flat < slow, `${quick} < ${flat} < ${slow}`);
  assert.ok(Math.abs((flat - quick) - (slow - flat)) <= 0.002, "symmetric (times are rounded to the ms): a zero-mean column leaves the field mean where it was");
  assert.ok(Math.abs(quick / flat - 0.997) < 2e-5, `at most 0.3 % of the lap (${quick} / ${flat})`);
  assert.equal(lap(30, true), lap(30, false), "the same driver simulates the same lap whichever car is the player (career.spec grid isolation)");
});

// A MODEL REFIT DOES NOT REACH INTO A WEEKEND ALREADY QUALIFIED (#5783 Q1). A career
// save with qualifying DRIVEN and the race not yet run carries the whole sheet — the
// player's lap and the rivals' times as they were simulated THEN. Reloaded on a build
// whose model is quicker, it is restored as stored: the order and every time, even
// where today's model would now put the rival ahead. A qualifying that was only
// SIMULATED was never stored (see "simulate(0) does not persist"), so that one is
// redrawn from today's model on reload — the same grid seed, shorter times.
test("a mid-weekend career save keeps the qualifying it drove when the model changes; a simulated-only one is redrawn", () => {
  const stored = [
    { id: "p1", t: 131.2, human: true },    // the player's driven lap, pole on the old sheet
    { id: "p2", t: 132.4, human: false },   // the rival as the OLD model timed it
  ];
  const a = loadQuali({ inCareer: true, season: { round: 3, qualiOrder: stored.map((r) => ({ ...r })), qualiTrack: "monza", qualiMode: "career:driver:0" } });
  a.ctx.Career.slot = () => ({ flavour: "driver", i: 0 });
  const today = a.q.carLap(a.G.cars[1], a.G.track, 1);
  assert.ok(today < 131.2 * 0.9, `the precondition: today's model laps this circuit far quicker than the stored sheet (${today.toFixed(1)} s)`);
  const rows = a.q.begin();
  assert.deepEqual(rows.map((r) => [r.code, r.t]), [["VER", 131.2], ["HAM", 132.4]], "the stored order and times, not a re-simulation");
  assert.deepEqual(a.G.season.qualiOrder.map((r) => r.t), [131.2, 132.4], "and the save is not rewritten");
  assert.equal(a.q.order(a.G.cars).map((c) => c.code).join(" "), "VER HAM", "the race grids from it");

  const b = loadQuali({ inCareer: true, season: { round: 3 } });
  b.ctx.Career.slot = () => ({ flavour: "driver", i: 0 });
  b.q.simulate(0);
  assert.equal(b.G.season.qualiOrder, undefined, "a simulated-only sheet is not in the save");
  const redrawn = b.q.begin();
  assert.ok(redrawn.every((r) => Math.abs(r.t - today) < today * 0.05), "so a reload draws it from today's model: " + redrawn.map((r) => r.t.toFixed(1)).join(" "));
});

// The field's lap is the circuit's generated factor x the integrated lap (#5999). A circuit the
// calibration never measured (a TRACK DESIGNER layout, any id) takes the calendar median, never 1 and never a
// property of Object.prototype.
test("carLap: a calendar circuit reads its own factor, an unmeasured one the calendar median", async () => {
  const { factors } = await import("../../tools/gen/gen-quali-calib.mjs");
  const f = factors();
  const { q, G } = loadQuali();
  const c = G.cars[1];
  const mk = (id, extra) => ({ n: 80, total: 4000, def: Object.assign({ id }, extra) });
  const near = (a, b, m) => assert.ok(Math.abs(a / b - 1) < 1e-12, `${m}: ${a} vs ${b}`);
  const monza = mk("monza");
  near(q.carLap(c, monza, 1), +f.by.monza * q.carLap(c, monza, 1, true), "monza takes its row");
  for (const t of [mk("d7f3a1c2", { custom: true }), mk("constructor"), mk("__proto__"), { n: 80, total: 4000 }]) {
    const lap = q.carLap(c, t, 1);
    near(lap, +f.def * q.carLap(c, t, 1, true), "an unmeasured circuit takes the default");
    assert.ok(Number.isFinite(lap) && lap > 0);
  }
  G.track = mk("d7f3a1c2", { custom: true });
  const sheet = q.preview(0).map((r) => r.t);
  assert.ok(sheet.length === G.cars.length && sheet.every((t) => Number.isFinite(t) && t > 0), "a designer circuit's sheet is whole");
  const raw = q.carLap(c, G.track, 1, true);
  assert.ok(sheet.every((t) => t > raw * 0.85 && t < raw * 1.05), "and sits where a calendar circuit's would: " + sheet.map((t) => (t / raw).toFixed(3)));
});

// The wing term is the AI's (#5786): AiDrive.aeroGrip is what the driven AI's lateral grip carries. A human's
// simulated time must not move with their own wing level (they pay for wing on track; a free wing on the sheet
// would be a setup exploit, in VS FRIEND too), and the AI rows must not move with the human's setup.
test("carLap: an AI car reads its wing level, a human's car its seat's wing (neutral with no Parts)", () => {
  const { q, G, ctx } = loadQuali();
  ctx.AiDrive = { aeroGrip: (load) => 1 + ((load != null ? load : 0.5) - 0.5) * 0.16 };
  const me = G.cars[0], ai = G.cars[1];
  ctx.Tracks.curvature = () => 0.02;                     // tight enough that the corner cap, not vTop, sets the lap
  G.track = { n: 80, total: 4000, def: { id: "wing" } };
  me.human = true;
  const at = (c, load) => { c.aeroLoad = load; return q.carLap(c, G.track, 1); };
  const neutral = at(me, 0.5);
  assert.equal(at(me, 0), neutral, "minimum wing: the human's simulated lap does not move");
  assert.equal(at(me, 1), neutral, "maximum wing: nor here");
  delete me.aeroLoad;
  assert.equal(q.carLap(me, G.track, 1), neutral, "no wing level at all reads neutral");
  assert.ok(at(ai, 1) < at(ai, 0.5) && at(ai, 0.5) < at(ai, 0), "an AI car is quicker with more wing");
  assert.equal(at(ai, 0.5), neutral, "and at the neutral wing it is the same lap (same tier and skill here)");
  ai.aeroLoad = 0.8;
  const sheetAt = (load) => { me.aeroLoad = load; return q.preview(0).map((r) => r.t); };
  assert.deepEqual(sheetAt(0), sheetAt(1), "the whole sheet, AI rows included, is the same whatever the human's wing");
  me.human = false;
  assert.ok(at(me, 1) < neutral, "the same car driven by the AI (the calibration and the parity test) does read it");

  // With Parts: the human reads the wing the AI in that seat runs (its team's factory build), never its own
  // setup, so the sheet is the same whichever car is the player (career.spec grid isolation, #5786).
  const works = { me: 0.9, rb: 0.1 };
  ctx.Parts = { getFactorySetup: (t) => ({ team: t.id }), aeroLoad: (setup) => works[setup.team] };
  for (const c of G.cars) c.aeroLoad = works[c.team.id];
  const sheet = (humanIdx, setupWing) => {
    G.cars.forEach((c, i) => { c.human = c.isPlayer = i === humanIdx; if (i === humanIdx) c.aeroLoad = setupWing; });
    const rows = q.preview(0).map((r) => [r.code, r.t]);
    G.cars.forEach((c) => { c.aeroLoad = works[c.team.id]; });
    return rows;
  };
  const allAi = sheet(-1);
  assert.ok(allAi[0][1] < allAi[1][1] - 1, "precondition: the two seats' works wings give different laps " + JSON.stringify(allAi));
  for (const idx of [0, 1]) for (const w of [0, 1]) assert.deepEqual(sheet(idx, w), allAi, `car ${idx} as the player on wing ${w}: the all-AI sheet`);
});

// Reproduce the career.spec grid isolation check with different saved free-play seats as well.
// The same seed must produce the same grid whichever seat is human (#5786).
test("a one-off GP's simulated grid is the same whichever career is on the device (game VM)", async () => {
  const { createGame } = createRequire(import.meta.url)("../../tools/lib/game-vm.cjs");
  const g = await createGame({ track: "monza", carMeshes: false });
  try {
    const a = g.apex;
    const gridFor = async (opts, freeTeam, freeSeat) => {
      const teamIdx = g.sandbox.Teams.LIST.findIndex(t => t.id === freeTeam);
      g.G.store.set("team", teamIdx);
      g.G.store.set("driver", freeSeat);
      if (opts) a.career(opts); else a.careerReset();
      a.seed(1234);
      await a.race("monza");
      const rows = a.qualiSim();
      return { codes: rows.map((r) => r.code).join(","), me: rows.find((r) => r.isPlayer).code };
    };
    const none = await gridFor(null, "mclaren", 0);
    const haas = await gridFor({ teamId: "haas", seat: 1, seed: 4242 }, "williams", 0);
    const williams = await gridFor({ teamId: "williams", seat: 0, seed: 99 }, "haas", 1);
    assert.deepEqual([none.me, haas.me, williams.me], ["NOR", "SAI", "BEA"], "each GP uses its saved free-play seat");
    assert.equal(none.codes.split(",").length, 22);
    assert.equal(haas.codes, none.codes, "a Haas career on the device");
    assert.equal(williams.codes, none.codes, "a Williams career on the device");
  } finally { g.close(); }
});


// #7052: the row skeleton of the QUALIFYING sheet, recorded before the shared row builder
// (GameResultsSheet.row) took over the assembly. The a11y gap against the results rows (the
// swatch now carries aria-hidden, as the results rows do: #7198).
test("quali rows keep their DOM skeleton (pin for the shared row builder)", () => {
  const { sheet, els } = loadSheet();
  const skel = (e) => `${e.tag}.${e.className}${e.attrs ? JSON.stringify(e.attrs) : ""}${e.style && e.style.background ? "{bg=" + e.style.background + "}" : ""}` +
    (e.children.length ? "(" + e.children.map(skel).join(",") + ")" : `"${e._t}"`);
  sheet.open([
    { pos: 1, code: "VER", name: "Max", team: "me", isPlayer: true, human: true, t: 60, gap: 0 },
    { pos: 2, code: "NOR", name: "Lando", team: "rb", human: true, t: 61, gap: 1 },
    { pos: 3, code: "PIA", name: "Oscar", team: "rb", t: 62, gap: 2 },
    { pos: 4, code: "RUS", name: "George", team: "zz", noTime: true, t: 0, gap: 0 },
  ]);
  assert.deepEqual(els.get("q-table").children.map(skel), [
    'div.res-row p1 you{"role":"listitem","aria-current":"true"}(span.res-pos"1",span.res-swatch{"aria-hidden":"true"}{bg=rgb(0,0,1)}"",span.res-name(span.q-real-tag" YOU"),span.res-pts q-time"T60")',
    'div.res-row p2 q-real{"role":"listitem"}(span.res-pos"2",span.res-swatch{"aria-hidden":"true"}{bg=rgb(1,0,0)}"",span.res-name(span.q-real-tag" DRIVEN"),span.res-pts q-time"+1.000")',
    'div.res-row p3{"role":"listitem"}(span.res-pos"3",span.res-swatch{"aria-hidden":"true"}{bg=rgb(1,0,0)}"",span.res-name"PIA  Oscar",span.res-pts q-time"+2.000")',
    'div.res-row{"role":"listitem"}(span.res-pos"4",span.res-swatch{"aria-hidden":"true"}{bg=rgb(0.5,0.5,0.5)}"",span.res-name"RUS  George",span.res-pts q-time"NO TIME")',
  ]);
});
