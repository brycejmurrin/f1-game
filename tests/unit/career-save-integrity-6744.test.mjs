/* career-save-integrity-6744.test.mjs — #6744 (#6478 rows 5, 6, 10): three
 * career writes whose refusal was dropped.
 *
 * Row 5: a rollover whose write is refused rolls the year back but left
 * Parts.setLegality on the NEW era, and marked a full store as a revision
 * conflict, so every later save was refused as "conflict".
 * Row 6: useSlot ignored a refused departing save() and switched anyway.
 * Row 10: freeMoney() ignored a refused store write (no writer lock).
 *
 * Run: node --test tests/unit/career-save-integrity-6744.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { i18nStub } from "../helpers/i18n-stub.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function save(round, extra) {
  return {
    v: 1, flavour: "driver", year: 2026, year0: 2026, money: 100, rep: 30, seat: 0,
    driver: { name: "A", code: "YOU", num: 99 }, seed: 1, team: "haas",
    season: { round, pts: {}, teamPts: {}, driverCodes: {} },
    owned: [], fitted: {}, results: [], history: [], dev: {}, tdev: {},
    seats: {}, offers: [], obj: null, budgetLvl: 0, facility: 0,
    moves: [], paidSponsors: [], deal: { salary: 0, bonusPt: 0, left: 1, years: 1 }, ...extra,
  };
}

function boot(disk) {
  const state = { full: false, legality: [] };
  const ctx = vm.createContext({ I18n: i18nStub(),
    Math, JSON, Object, Array, String, Number, Date, Set, Map, Promise,
    isNaN, isFinite, parseInt, console, queueMicrotask, setTimeout, clearTimeout,
    localStorage: {
      getItem: (k) => (disk.has(k) ? disk.get(k) : null),
      removeItem: (k) => disk.delete(k),
      setItem: (k, v) => {
        if (state.full && k.startsWith("apex26.career.")) { const e = new Error("full"); e.name = "QuotaExceededError"; throw e; }
        disk.set(k, String(v));
      },
    },
    window: { addEventListener() {} },
    Log: { warn() {}, info() {} },
    Teams: { POINTS: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1], isReal: (t) => !!t && !t.custom,
      LIST: [{ id: "haas", tier: 4, stats: {}, drivers: [{ name: "A", code: "AAA", num: 1 }, { name: "B", code: "BBB", num: 2 }] }] },
    Tracks: { LIST: [{ id: "a" }], SEASON: [{ id: "a" }], seasonIndex: () => 0 },
    // Every season is its own era, so a year that moves is visible in the legality key.
    Regulations: { eraFor: (n) => ({ id: "era" + n }), seasonsLeft: () => 1, legalityFor: (id) => ({ id }),
      bannedIds: () => [], isLegal: () => true },
    Parts: { CATALOG: [], getFactorySetup: () => ({}), getCost: () => 0,
      setLegality: (_t, id) => state.legality.push(id) },
  });
  for (const f of ["js/core/hash32.js", "js/core/mat4.js", "js/data/driver-ratings.js", "js/career/save-migrate.js",
    "js/core/store.js", "js/career/career-planning.js", "js/career/career.js"])
    vm.runInContext(readFileSync(join(ROOT, f), "utf8"), ctx, { filename: absSrc(f) });
  return { Career: vm.runInContext("Career", ctx), store: vm.runInContext("GameStore.store", ctx), state };
}

function rig(slots) {
  const disk = new Map([["apex26.careerSlot", JSON.stringify("driver:0")]]);
  for (const [k, v] of Object.entries(slots)) disk.set("apex26.career." + k, JSON.stringify(v));
  const r = boot(disk);
  r.Career.load(); r.Career.engage(true);
  return { ...r, disk };
}

test("row 5: a rollover refused by a full store restores the old era's legality and is no conflict", () => {
  const { Career, state } = rig({ "driver.0": save(24) });
  const year = Career.data().year;
  const eraBefore = state.legality[state.legality.length - 1];
  assert.equal(eraBefore, "era0", "the harness must install the opening era");
  state.full = true;
  assert.equal(Career.rollover(), null);
  assert.equal(Career.data().year, year, "the year is rolled back");
  assert.equal(state.legality[state.legality.length - 1], eraBefore, "Parts legality follows the rolled-back year");
  assert.equal(Career.conflicted(), false, "a full store is not a revision conflict");
  assert.notEqual(Career.saveStatus().reason, "conflict");
  // Storage recovers: the same rollover now commits.
  state.full = false;
  assert.notEqual(Career.rollover(), null);
  assert.equal(Career.data().year, year + 1);
  assert.equal(state.legality[state.legality.length - 1], "era1");
});

test("row 6: useSlot keeps the live slot when the departing save is refused", () => {
  const { Career, store } = rig({ "driver.0": save(3), "driver.1": save(7) });
  const live = Career.data();
  store.careerWriteStatus = () => ({ ok: false, durable: false, reason: "writer-pending" });
  assert.equal(Career.useSlot("driver", 1), null, "the switch is refused");
  assert.deepEqual({ ...Career.slot() }, { flavour: "driver", i: 0 });
  assert.equal(Career.data(), live, "the live career object is kept");
  assert.equal(Career.saveStatus().reason, "writer-pending");
});

test("row 6 control: a conflicted (read-only) career may still leave its slot", () => {
  const { Career, store } = rig({ "driver.0": save(3), "driver.1": save(7) });
  store._keyRev.set("apex26.career.driver.0", (store._keyRev.get("apex26.career.driver.0") || 0) + 5);
  assert.notEqual(Career.useSlot("driver", 1), null);
  assert.equal(Career.data().season.round, 7);
});

test("row 10: freeMoney surfaces a refused write", () => {
  const { Career, store } = rig({ "driver.0": save(3) });
  const write = store.write.bind(store);
  store.write = (k, v, o) => (k === "career.freeMoney"
    ? { ok: false, durable: false, reason: "writer-pending" } : write(k, v, o));
  assert.equal(Career.freeMoney(true), false, "the toggle did not take");
  assert.equal(Career.saveStatus().ok, false);
  assert.equal(Career.saveStatus().reason, "writer-pending");
  store.write = write;
  assert.equal(Career.freeMoney(true), true, "a healthy store takes it");
});
