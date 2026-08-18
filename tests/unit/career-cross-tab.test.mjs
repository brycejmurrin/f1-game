import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

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

function load() {
  const disk = new Map([
    ["apex26.career.driver.0", JSON.stringify(save(1, 100))],
    ["apex26.careerSlot", JSON.stringify("driver:0")],
  ]);
  const listeners = new Map();
  const team = {
    id: "haas", tier: 4, stats: {},
    drivers: [{ name: "A", code: "AAA", num: 1 }, { name: "B", code: "BBB", num: 2 }],
  };
  const ctx = vm.createContext({
    Math, JSON, Object, Array, String, Number, Date, Set, Map, isNaN, isFinite, parseInt, console,
    localStorage: {
      getItem: (k) => disk.has(k) ? disk.get(k) : null,
      setItem: (k, v) => disk.set(k, String(v)),
    },
    window: { addEventListener: (name, fn) => listeners.set(name, fn) },
    Log: { warn() {}, info() {} },
    Teams: { POINTS: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1], LIST: [team] },
    Tracks: { LIST: [{ id: "a" }], SEASON: [{ id: "a" }], seasonIndex: () => 0 },
    Parts: { getFactorySetup: () => ({}) },
    DriverRatings: { get: () => ({ pace: 50, craft: 50, awareness: 50, consistency: 50, experience: 50 }) },
  });
  vm.runInContext(readFileSync(join(ROOT, "js/mat4.js"), "utf8"), ctx);
  vm.runInContext(readFileSync(join(ROOT, "js/game/store.js"), "utf8"), ctx);
  vm.runInContext(readFileSync(join(ROOT, "js/game/career.js"), "utf8"), ctx);
  return {
    Career: vm.runInContext("Career", ctx), disk,
    foreign: (key) => listeners.get("storage")({ key, newValue: disk.get(key) }),
  };
}

test("an active career refuses to overwrite a newer foreign save", () => {
  const { Career, disk, foreign } = load();
  Career.load();
  Career.engage(true);
  const key = "apex26.career.driver.0";
  disk.set(key, JSON.stringify(save(9, 900)));
  foreign(key);
  assert.equal(Career.conflicted(), true);
  Career.save();
  const winner = JSON.parse(disk.get(key));
  assert.equal(winner.season.round, 9);
  assert.equal(winner.money, 900);
});

test("a conflicted career refuses grant/research so RAM does not drift from disk", () => {
  const { Career, disk, foreign } = load();
  Career.load();
  Career.engage(true);
  const key = "apex26.career.driver.0";
  const money = Career.data().money;
  disk.set(key, JSON.stringify(save(9, 900)));
  foreign(key);
  assert.equal(Career.conflicted(), true);
  assert.equal(Career.grant(50), null);
  assert.equal(Career.research({ id: "wing", cost: 1 }), false);
  assert.equal(Career.data().money, money);
  assert.equal(Career.data().owned.indexOf("wing"), -1);
});

test("outside active play a foreign live-slot save refreshes Career's object", () => {
  const { Career, disk, foreign } = load();
  Career.load();
  const key = "apex26.career.driver.0";
  disk.set(key, JSON.stringify(save(7, 700)));
  foreign(key);
  assert.equal(Career.conflicted(), false);
  assert.equal(Career.data().season.round, 7);
  assert.equal(Career.data().money, 700);
});
