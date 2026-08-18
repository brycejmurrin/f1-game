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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = fs.readFileSync(path.join(ROOT, "js/game/quali.js"), "utf8");
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
  };
  const ctx = {
    console,
    Math,
    Map,
    Float64Array,
    Quali: undefined,
    Teams: { LIST: [{ id: "rb", color: [1, 0, 0] }, { id: "me", color: [0, 0, 1] }] },
    GameTables: { DIFF: { normal: { ai: 1 } } },
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
    NetPlay: { isOn: () => !!opts.netOn },
  };
  vm.createContext(ctx);
  seedLog(ctx);
  vm.runInContext(SRC.replace(/^const\b/gm, "var"), ctx, { filename: "js/game/quali.js" });
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

test("a driven simulate persists; NetPlay.isOn() does not", () => {
  const solo = loadQuali({ season: { round: 0 } });
  solo.q.simulate(new Map([["p1", 68.5]]));
  assert.ok(solo.G.season.qualiOrder, "a human lap is what makes the order worth keeping");
  assert.equal(solo.G.season.qualiOrder[0].human || solo.G.season.qualiOrder.some((r) => r.human), true);

  const net = loadQuali({ season: { round: 0 }, netOn: true });
  net.q.simulate(new Map([["p1", 68.5]]));
  assert.equal(net.G.season.qualiOrder, undefined, "a friend race must not stamp Career/season");
});

test("openQuali restores via begin(); friend-race and quit-to-menu forget correctly", () => {
  assert.match(GAME, /function openQuali\(fresh\)/);
  assert.match(GAME, /if \(fresh\) quali\.simulate\(0\); else quali\.begin\(\)/);
  assert.match(GAME, /openQuali\(true\)/);
  assert.match(GAME, /quali\.clear\(true\)/);
  assert.match(SRC, /if \(!classification\.some\(\(r\) => r\.human\)\) return/);
});

test("friend-race BACK aborts to the lobby; a null quali grid does not P12-shuffle", () => {
  assert.match(GAME, /qualiNetDone \? \(qualiNetDone = null/);
  assert.match(GAME, /netLobby\.abortQuali\(\)/);
  assert.match(GAME, /if \(!isQuali\(\) && gridFromQuali\(\) && !quali\.order\(cars\)\) \{ openQuali\(\); return false; \}/);
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
