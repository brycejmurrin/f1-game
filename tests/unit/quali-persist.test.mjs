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
import { fileURLToPath } from "node:url";
import { seedLog } from "../helpers/seed-log.mjs";
import { fnSource } from "../helpers/fn-source.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = fs.readFileSync(path.join(ROOT, "js/race/quali-model.js"), "utf8");
const GAME = fs.readFileSync(path.join(ROOT, "js/game.js"), "utf8");

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
    track: { n: 80, total: 4000 },
    gripMult: () => 1,
    simSeed: () => 1,
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
    DriverRatings: { get: () => ({ consistency: 90 }) },
    Career: {
      inCareer: () => !!opts.inCareer,
      conflicted: () => !!opts.conflicted,
      save() { saved.career = true; },
      data: () => ({ seed: 1 }),
      round: () => 0,
      hash: () => 0.5,
      devFor: () => 0,
    },
    Tracks: { curvature: () => 0.002 },
    ScrollFade: { refresh() {} },
    NetPlay: {},   // module global carries no instance state — the guard asks G.netPlay
  };
  vm.createContext(ctx);
  seedLog(ctx);
  vm.runInContext(SRC.replace(/^const\b/gm, "var"), ctx, { filename: "js/race/quali-model.js" });
  return { q: ctx.Quali.create(G), G, saved };
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
  assert.match(GAME, /function openQuali\(fresh\)/);
  assert.match(GAME, /if \(fresh\) quali\.simulate\(0\); else quali\.begin\(\)/);
  assert.match(GAME, /openQuali\(true\)/);
  assert.match(GAME, /quali\.clear\(\);   \/\/ memory only/);
  // NOT a blanket whole-file ban. The bug this suite exists for is a
  // clear(true) inside the SHEET'S OWN lifecycle (openQuali / quitToMenu),
  // which wiped the persist so simulate(0) re-stamped an all-AI grid. A
  // different and correct fix (cfab56e) calls clear(true) once at award time,
  // so a one-off GP's driven order does not grid the next weekend — and the
  // blanket ban failed that fix. It is half of what took pages.yml runs
  // 1888/1889 red on 2026-09-02 and stopped the live site updating. Ban it
  // where the bug lived; require the guard where it is legitimate.
  assert.doesNotMatch(fnSource(GAME, "async function openQuali(fresh)"), /quali\.clear\(true\)/,
    "openQuali must not wipe the persist — that is the bug this suite exists for");
  assert.doesNotMatch(fnSource(GAME, "function quitToMenu()"), /quali\.clear\(true\)/,
    "quit-to-menu keeps the persist so CONTINUE still has the driven grid");
  for (const line of GAME.matchAll(/^.*quali\.clear\(true\).*$/gm))
    assert.match(line[0], /!isChampionship\(\)/,
      "a clear(true) anywhere else is legitimate only for a one-off GP, and must say so");
  assert.match(GAME, /RIVAL LEFT — TO THE GRID/);
  assert.match(GAME, /qualiHadRivals/);
  assert.match(GAME, /if \(!p\) \{ closeLightTuner\(false\); closeCamTuner\(false\); exitPhotoMode\(\); \}/);
  assert.match(GAME, /closeCamTuner\(false\); exitPhotoMode\(\);/);
  assert.match(GAME, /isCareer\(\) && Career\.conflicted\(\)/);
  // The caution pace cap, now four levels deep: RED (4) stops the field at a
  // walking-pace floor rather than 0, so every "approaches vmax" fade stays
  // finite; SC (3) and VSC (2) are the delta paces they always were.
  assert.match(GAME, /vTop\(\) \* \(lvl >= 4 \? 0\.02 : lvl === 3 \? 0\.45 : 0\.6\)/);
  assert.match(GAME, /if \(netPlay\.active\(\)\) netPlay\.stop\("local"\)/);
  assert.match(GAME, /if \(netPlay\.active\(\) \|\| qualiNetDone\) return/);
  assert.match(SRC, /if \(!classification\.some\(\(r\) => r\.human\)\) return/);
});

test("friend-race BACK aborts to the lobby; a null quali grid does not P12-shuffle", () => {
  assert.match(GAME, /qualiNetDone \? \(qualiNetDone = null/);
  assert.match(GAME, /netLobby\.abortQuali\(\)/);
  assert.match(GAME, /if \(!isQuali\(\) && gridFromQuali\(\) && !quali\.order\(cars\)\) \{ openQuali\(\); return false; \}/);
});

test("friend-race title quit cancels the lobby instead of aborting back into it", () => {
  // NOT GAME.slice(i, i + 2200) — that window took the deploy branch red on
  // 2026-09-02: quitToMenu grew and netLobby.cancel() moved to +2605, so this
  // assertion failed for a call that was still there. See tests/helpers/fn-source.mjs.
  const quit = fnSource(GAME, "function quitToMenu()");
  assert.match(quit, /netLobby\.cancel\(\)/);
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

function loadSheet() {
  class El {
    constructor(tag) { this.tag = tag; this.className = ""; this.style = {}; this.children = []; this.hidden = true; this._t = ""; }
    get textContent() { return this._t; }
    set textContent(v) { this._t = v; this.children.length = 0; }
    appendChild(c) { this.children.push(c); return c; }
    append(...cs) { for (const c of cs) this.children.push(c); }
  }
  const els = new Map(["q-table", "q-title", "quali"].map((id) => [id, new El("div")]));
  let refreshed = 0;
  const G = { $: (id) => els.get(id) || null, cssCol: (c) => "rgb(" + c.join(",") + ")", fmtTime: (t) => "T" + t };
  const ctx = {
    Map, QualiSheet: undefined,
    Teams: { LIST: [{ id: "rb", color: [1, 0, 0] }, { id: "me", color: [0, 0, 1] }] },
    ScrollFade: { refresh() { refreshed++; } },
    document: { createElement: (tag) => new El(tag) },
  };
  vm.createContext(ctx);
  seedLog(ctx);
  vm.runInContext(SHEET_SRC.replace(/^const\b/gm, "var"), ctx, { filename: "js/ui/quali-sheet.js" });
  return { sheet: ctx.QualiSheet.create(G), els, refreshed: () => refreshed };
}

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
