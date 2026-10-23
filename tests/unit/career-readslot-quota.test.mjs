/**
 * #3559 — readSlot must not clobber a cache-only protected career when the
 * captured protected raw is null (localStorage write-back failed on quota;
 * value lives only in the store JSON cache / IndexedDB mirror).
 *
 * store.raw() reads localStorage only. adoptCalendar captures that raw into
 * protectedRaw; when it is null, `null === null` used to make readSlot
 * JSON.parse(null) over the good cache value from store.get.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const realIsReal = (() => {
  const c = vm.createContext({ console, Math, Object, Array, Number, String, JSON });
  vm.runInContext(readFileSync(join(ROOT, "js/data/teams.js"), "utf8"), c, { filename: absSrc("js/data/teams.js") });
  return vm.runInContext("Teams.isReal", c);
})();

function save(round, money) {
  return {
    v: 1, flavour: "driver", year: 2026, money, rep: 30, seat: 0,
    driver: { name: "A", code: "YOU", num: 99 }, seed: 1, team: "haas",
    season: { round, pts: {}, teamPts: {}, driverCodes: {} },
    owned: [], fitted: {}, results: [], history: [], dev: {}, tdev: {},
    seats: {}, offers: [], obj: null, budgetLvl: 0, facility: 0,
    moves: [], paidSponsors: [], deal: { salary: 0, bonusPt: 0 },
  };
}

function load(options = {}) {
  const disk = options.disk || new Map();
  const listeners = new Map();
  const team = {
    id: "haas", tier: 4, stats: {},
    drivers: [{ name: "A", code: "AAA", num: 1 }, { name: "B", code: "BBB", num: 2 }],
  };
  const ctx = vm.createContext({
    Math, JSON, Object, Array, String, Number, Date, Set, Map, Promise,
    isNaN, isFinite, parseInt, console, setTimeout, clearTimeout, queueMicrotask,
    localStorage: {
      getItem: (k) => disk.has(k) ? disk.get(k) : null,
      setItem: (k, v) => options.setItem
        ? options.setItem(k, String(v), disk)
        : disk.set(k, String(v)),
      removeItem: (k) => { disk.delete(k); },
    },
    window: { addEventListener: (name, fn) => listeners.set(name, fn) },
    Log: { warn() {}, info() {} },
    Teams: { POINTS: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1], LIST: [team], isReal: realIsReal },
    Tracks: options.tracks || { LIST: [{ id: "a" }], SEASON: [{ id: "a" }], seasonIndex: () => 0 },
    Parts: { CATALOG: [], getFactorySetup: () => ({}), getCost: () => 0 },
  });
  vm.runInContext(readFileSync(join(ROOT, "js/core/hash32.js"), "utf8"), ctx, { filename: absSrc("js/core/hash32.js") });
  vm.runInContext(readFileSync(join(ROOT, "js/core/mat4.js"), "utf8"), ctx, { filename: absSrc("js/core/mat4.js") });
  vm.runInContext(readFileSync(join(ROOT, "js/data/driver-ratings.js"), "utf8"), ctx, { filename: absSrc("js/data/driver-ratings.js") });
  vm.runInContext(readFileSync(join(ROOT, "js/career/save-migrate.js"), "utf8"), ctx, { filename: absSrc("js/career/save-migrate.js") });
  vm.runInContext(readFileSync(join(ROOT, "js/core/store.js"), "utf8"), ctx, { filename: absSrc("js/core/store.js") });
  vm.runInContext(readFileSync(join(ROOT, "js/career/career-planning.js"), "utf8"), ctx, { filename: absSrc("js/career/career-planning.js") });
  vm.runInContext(readFileSync(join(ROOT, "js/career/career.js"), "utf8"), ctx, { filename: absSrc("js/career/career.js") });
  vm.runInContext(readFileSync(join(ROOT, "js/career/season-cal.js"), "utf8"), ctx, { filename: absSrc("js/career/season-cal.js") });
  return {
    Career: vm.runInContext("Career", ctx), disk, ctx,
    store: vm.runInContext("GameStore.store", ctx),
  };
}

test("readSlot keeps a cache-only protected career when captured raw was null (#3559)", () => {
  const original = save(1, 250);
  original.season.calIds = ["a", "gone"]; // missing circuit → calendar protection
  // Slot pointer on disk; the career body is cache-only (quota refused the write-back).
  const disk = new Map([["apex26.careerSlot", JSON.stringify("driver:0")]]);
  const { Career, store } = load({
    disk,
    setItem(k, v, d) {
      if (k === "apex26.career.driver.0") {
        const err = new Error("full");
        err.name = "QuotaExceededError";
        throw err;
      }
      d.set(k, String(v));
    },
  });

  const wrote = store.write("career.driver.0", original);
  assert.equal(wrote.ok, true);
  assert.equal(wrote.durable, false, "quota must leave the value session-only");
  assert.equal(disk.has("apex26.career.driver.0"), false);
  assert.equal(store.raw("career.driver.0"), null, "raw lane is localStorage-only");
  assert.equal(store.get("career.driver.0").money, 250);

  Career.load();
  assert.ok(Career.active(), "first load must adopt the cache-only save");
  assert.equal(Career.data().money, 250);
  assert.ok(Career.planning().protection(), "missing calId must protect the calendar");
  assert.equal(Career.planning().protection().raw, null, "captured raw is null when disk has no copy");

  // In-session re-entry: load() → readSlot with protectedRaw holding null.
  Career.load({ persist: false });
  assert.ok(Career.active(), "must not unload the protected career for the session");
  assert.equal(Career.data().money, 250, "cache value must survive the null-raw protected branch");
  assert.equal(Career.data().season.calIds[1], "gone");

  // useSlot on the live index also routes through readSlot.
  Career.useSlot("driver", 0);
  assert.ok(Career.active());
  assert.equal(Career.data().money, 250);
});
