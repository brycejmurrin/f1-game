/**
 * Career.load() persists migrated saves once; repeat boots must not rewrite the
 * live slot when the canonical JSON already matches localStorage.
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
    v: 2, flavour: "driver", year: 2026, money, rep: 30, seat: 0,
    driver: { name: "A", code: "YOU", num: 99 }, seed: 1, team: "haas",
    season: { round, calIds: ["monaco"], pts: { "haas:0": 25 }, teamPts: {}, driverCodes: { "haas:0": "YOU" } },
    owned: [], fitted: {}, results: [], history: [], dev: {}, tdev: {},
    seats: {}, offers: [], obj: null, budgetLvl: 0, facility: 0,
    moves: [], paidSponsors: [], deal: { salary: 0, bonusPt: 0, left: 0, years: 1 },
  };
}

function loadHarness() {
  const disk = new Map();
  let careerWrites = 0;
  const team = {
    id: "haas", tier: 4, stats: {},
    drivers: [{ name: "A", code: "AAA", num: 1 }, { name: "B", code: "BBB", num: 2 }],
  };
  const ctx = vm.createContext({
    Math, JSON, Object, Array, String, Number, Date, Set, Map, Promise,
    isNaN, isFinite, parseInt, console, setTimeout, clearTimeout, queueMicrotask,
    localStorage: {
      getItem: (k) => (disk.has(k) ? disk.get(k) : null),
      setItem: (k, v) => {
        if (k === "apex26.career.driver.0") careerWrites++;
        disk.set(k, String(v));
      },
      removeItem: (k) => { disk.delete(k); },
    },
    window: { addEventListener: () => {} },
    Log: { warn() {}, info() {} },
    Teams: {
      POINTS: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1],
      LIST: [team, { id: "monaco", drivers: [{ code: "X" }, { code: "Y" }] }],
      isReal: realIsReal,
    },
    Tracks: {
      LIST: [{ id: "monaco" }, { id: "spa" }],
      SEASON: [{ id: "monaco" }, { id: "spa" }],
      seasonIndex: (i) => i,
    },
    Parts: { CATALOG: [], getFactorySetup: () => ({}), getCost: () => 0, setLegality: () => {} },
    Regulations: null,
  });
  for (const f of [
    "js/core/hash32.js", "js/core/mat4.js", "js/data/driver-ratings.js",
    "js/career/save-migrate.js", "js/core/store.js", "js/career/career-planning.js",
    "js/career/career.js",
  ]) {
    vm.runInContext(readFileSync(join(ROOT, f), "utf8"), ctx, { filename: absSrc(f) });
  }
  return {
    Career: vm.runInContext("Career", ctx),
    disk,
    store: vm.runInContext("GameStore.store", ctx),
    careerWrites: () => careerWrites,
    resetWrites: () => { careerWrites = 0; },
  };
}

test("Career.load skips redundant migration writes when disk already matches", () => {
  const h = loadHarness();
  h.store.set("career.driver.0", save(1, 250));
  h.store.set("careerSlot", "driver:0");
  h.Career.load();
  const bytesAfterFirst = h.disk.get("apex26.career.driver.0");
  const revAfterFirst = h.store.keyRevision("career.driver.0");
  assert.ok(h.careerWrites() >= 1, "first boot must persist the normalized save");

  h.resetWrites();
  h.Career.load();
  assert.equal(h.careerWrites(), 0, "second boot must not rewrite an unchanged career");
  assert.equal(h.disk.get("apex26.career.driver.0"), bytesAfterFirst);
  assert.equal(h.store.keyRevision("career.driver.0"), revAfterFirst);
  assert.equal(h.Career.data().money, 250);
});

test("migration save still runs when the career body is cache-only on disk", () => {
  const disk = new Map([["apex26.careerSlot", JSON.stringify("driver:0")]]);
  let careerWrites = 0;
  const team = {
    id: "haas", tier: 4, stats: {},
    drivers: [{ name: "A", code: "AAA", num: 1 }, { name: "B", code: "BBB", num: 2 }],
  };
  const ctx = vm.createContext({
    Math, JSON, Object, Array, String, Number, Date, Set, Map, Promise,
    isNaN, isFinite, parseInt, console, setTimeout, clearTimeout, queueMicrotask,
    localStorage: {
      getItem: (k) => (disk.has(k) ? disk.get(k) : null),
      setItem: (k, v) => {
        if (k === "apex26.career.driver.0") {
          careerWrites++;
          const err = new Error("full");
          err.name = "QuotaExceededError";
          throw err;
        }
        disk.set(k, String(v));
      },
      removeItem: (k) => { disk.delete(k); },
    },
    window: { addEventListener: () => {} },
    Log: { warn() {}, info() {} },
    Teams: {
      POINTS: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1],
      LIST: [team, { id: "monaco", drivers: [{ code: "X" }, { code: "Y" }] }],
      isReal: realIsReal,
    },
    Tracks: {
      LIST: [{ id: "monaco" }, { id: "spa" }],
      SEASON: [{ id: "monaco" }, { id: "spa" }],
      seasonIndex: (i) => i,
    },
    Parts: { CATALOG: [], getFactorySetup: () => ({}), getCost: () => 0, setLegality: () => {} },
    Regulations: null,
  });
  for (const f of [
    "js/core/hash32.js", "js/core/mat4.js", "js/data/driver-ratings.js",
    "js/career/save-migrate.js", "js/core/store.js", "js/career/career-planning.js",
    "js/career/career.js",
  ]) {
    vm.runInContext(readFileSync(join(ROOT, f), "utf8"), ctx, { filename: absSrc(f) });
  }
  const store = vm.runInContext("GameStore.store", ctx);
  const Career = vm.runInContext("Career", ctx);
  const original = save(1, 400);
  const wrote = store.write("career.driver.0", original);
  assert.equal(wrote.durable, false);
  assert.equal(disk.has("apex26.career.driver.0"), false);

  careerWrites = 0;
  Career.load();
  assert.ok(careerWrites >= 1, "cache-only career must still attempt a durable migration write");
});
