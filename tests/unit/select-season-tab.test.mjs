/* select-season-tab.test.mjs — the circuit picker's SEASON / CLASSICS chips
 * follow the calendar the player's season races, not the `classic` flag.
 *
 * Tracks.SEASON (every circuit not flagged classic) is the legacy 24-round
 * list; the real 2026 calendar (SeasonCal.REAL_2026) races Zandvoort,
 * Catalunya and Sepang, all three flagged classic, and skips Bahrain, Jeddah,
 * Istanbul and Portimao. The chips read SeasonCal.list() through the pure
 * Menus.calendarIdSet / Menus.calendarGroup (js/ui/select-screen.js), and fall
 * back to the flag when SeasonCal (or its list()) is absent.
 *
 * Real circuit roster (js/track/circuit-meta.js) and the real SeasonCal in a VM.
 * Run: node --test tests/unit/select-season-tab.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { seedLog } from "../helpers/seed-log.mjs";
import { absSrc } from "../helpers/abs-src.mjs";
import { seedSaveMigrate } from "../helpers/seed-save-migrate.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

function roster() {
  const ctx = vm.createContext({ window: {} });
  vm.runInContext(read("js/track/circuit-meta.js"), ctx, { filename: absSrc("js/track/circuit-meta.js") });
  const LIST = Array.from(ctx.window.TrackDefs, (t) => Object.assign({}, t));
  return { LIST, SEASON: LIST.filter((t) => !t.classic) };
}

function menus() {
  const ctx = vm.createContext({ Object, Set, Array });
  return vm.runInContext(read("js/ui/select-screen.js") + "\n;Menus", ctx, { filename: absSrc("js/ui/select-screen.js") });
}

function seasonCal(tracks, stored0) {
  const stored = new Map(Object.entries(stored0 || {}));
  const ctx = vm.createContext({
    Math, JSON, Object, Array, String, Number, Set, Map, isNaN, isFinite, parseInt, console,
    GameStore: {
      store: {
        get: (k, d) => (stored.has(k) ? stored.get(k) : d),
        set: (k, v) => { stored.set(k, v); return true; },
        write: (k, v) => { stored.set(k, v); return { ok: true, durable: true, reason: null }; },
        keyRevision: () => "0",
        subscribe: () => () => {},
      },
    },
    Tracks: tracks,
    Teams: { POINTS: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1] },
  });
  seedLog(ctx);
  seedSaveMigrate(ctx);
  vm.runInContext(read("js/career/season-cal.js"), ctx, { filename: absSrc("js/career/season-cal.js") });
  return vm.runInContext("SeasonCal", ctx);
}

const tab = (M, tracks, ids, g) => tracks.LIST.filter((t) => M.calendarGroup(t, ids) === g).map((t) => t.id);

test("with the 2026 REAL calendar the SEASON chip shows its 23 rounds, flagged classics included", () => {
  const M = menus();
  const tracks = roster();
  const cal = seasonCal(tracks);
  cal.setConfig(Object.assign({}, cal.config(), cal.preset("real2026")));
  const ids = M.calendarIdSet(cal);
  const real = Array.from(cal.REAL_2026, (r) => r.id);
  assert.equal(real.length, 23);
  const season = tab(M, tracks, ids, "season");
  assert.deepEqual(season.slice().sort(), real.slice().sort());
  for (const id of ["zandvoort", "catalunya", "sepang"]) {
    assert.ok(tracks.LIST.find((t) => t.id === id).classic, id + " is flagged classic");
    assert.notEqual(season.indexOf(id), -1, id + " is a 2026 round: SEASON");
  }
  const classic = tab(M, tracks, ids, "classic");
  for (const id of ["bahrain", "jeddah", "istanbul", "portimao"]) {
    assert.ok(!tracks.LIST.find((t) => t.id === id).classic, id + " is not flagged classic");
    assert.notEqual(classic.indexOf(id), -1, id + " is not a 2026 round: CLASSICS");
  }
  // Every built-in circuit is under exactly one of the two chips.
  assert.equal(season.length + classic.length, tracks.LIST.length);
});

test("the SEASON chip is whatever calendar SeasonCal resolves (the default included)", () => {
  const M = menus();
  const tracks = roster();
  const cal = seasonCal(tracks);
  const ids = M.calendarIdSet(cal);
  assert.deepEqual(tab(M, tracks, ids, "season").slice().sort(), Array.from(cal.list(), (t) => t.id).sort());
  const real = Array.from(cal.REAL_2026, (r) => r.id);
  const def = cal.config().trackIds;
  if (def.length === real.length && def.every((id, i) => id === real[i])) {
    // REAL_2026 is the default for a new season (#5269).
    assert.ok(ids.has("zandvoort") && ids.has("catalunya") && ids.has("sepang"));
  } else {
    // Before it: the legacy 24 (Tracks.SEASON), the split the flag always made.
    assert.deepEqual(tab(M, tracks, ids, "season"), tracks.SEASON.map((t) => t.id));
  }
});

test("a custom calendar moves only its own circuits", () => {
  const M = menus();
  const tracks = roster();
  const cal = seasonCal(tracks);
  cal.setConfig(Object.assign({}, cal.config(), { trackIds: ["monza", "imola", "spa"] }));
  const ids = M.calendarIdSet(cal);
  assert.deepEqual(tab(M, tracks, ids, "season"), tracks.LIST.filter((t) => ["monza", "imola", "spa"].includes(t.id)).map((t) => t.id));
  assert.equal(M.calendarGroup(tracks.LIST.find((t) => t.id === "bahrain"), ids), "classic");
});

test("custom circuits stay under MY CIRCUITS whatever the calendar", () => {
  const M = menus();
  const mine = { id: "custom_1", name: "MINE", custom: true };
  assert.equal(M.calendarGroup(mine, new Set(["custom_1"])), "custom");
  assert.equal(M.calendarGroup(mine, null), "custom");
  assert.equal(M.calendarGroup(null, null), null);
});

test("no SeasonCal, no list() or an empty calendar falls back to the classic flag", () => {
  const M = menus();
  const tracks = roster();
  assert.equal(M.calendarIdSet(undefined), null);
  assert.equal(M.calendarIdSet(null), null);
  assert.equal(M.calendarIdSet({ canRace: () => true, rounds: () => 0 }), null);   // the select-screen-fixes stub
  assert.equal(M.calendarIdSet({ list: () => [] }), null);
  assert.equal(M.calendarIdSet({ list: () => { throw new Error("not ready"); } }), null);
  const season = tab(M, tracks, null, "season");
  const classic = tab(M, tracks, null, "classic");
  assert.deepEqual(season, tracks.SEASON.map((t) => t.id));
  assert.deepEqual(classic, tracks.LIST.filter((t) => t.classic).map((t) => t.id));
  for (const id of ["zandvoort", "catalunya", "sepang"]) assert.notEqual(classic.indexOf(id), -1);
});
