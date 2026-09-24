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

function load(options = {}) {
  const disk = options.disk || new Map([
    ["apex26.career.driver.0", JSON.stringify(save(1, 100))],
    ["apex26.careerSlot", JSON.stringify("driver:0")],
  ]);
  const listeners = new Map();
  const team = {
    id: "haas", tier: 4, stats: {},
    drivers: [{ name: "A", code: "AAA", num: 1 }, { name: "B", code: "BBB", num: 2 }],
  };
  const mirrorRows = options.mirrorRows || [];
  const mirrorDb = {
    objectStoreNames: { contains: () => true }, close() {},
    transaction(_name, mode) {
      if (mode === "readonly") return { objectStore: () => ({
        getAll() {
          const request = {};
          queueMicrotask(() => { request.result = mirrorRows; if (request.onsuccess) request.onsuccess(); });
          return request;
        },
      }) };
      const transaction = { objectStore: () => ({ put() {}, delete() {} }) };
      queueMicrotask(() => { if (transaction.oncomplete) transaction.oncomplete(); });
      return transaction;
    },
  };
  const indexedDB = options.mirrorRows ? { open() {
    const request = {};
    queueMicrotask(() => { request.result = mirrorDb; if (request.onsuccess) request.onsuccess(); });
    return request;
  } } : undefined;
  const ctx = vm.createContext({
    Math, JSON, Object, Array, String, Number, Date, Set, Map, Promise,
    isNaN, isFinite, parseInt, console, setTimeout, clearTimeout, queueMicrotask, indexedDB,
    localStorage: {
      getItem: (k) => disk.has(k) ? disk.get(k) : null,
      setItem: (k, v) => options.setItem
        ? options.setItem(k, String(v), disk)
        : disk.set(k, String(v)),
    },
    window: { addEventListener: (name, fn) => listeners.set(name, fn) },
    Log: { warn() {}, info() {} },
    // isReal mirrors js/data/teams.js; a beatRival goal walks the grid through it.
    Teams: { POINTS: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1], LIST: [team],
             isReal: (t) => !!t && !t.custom && !t.legends },
    Tracks: { LIST: [{ id: "a" }], SEASON: [{ id: "a" }], seasonIndex: () => 0 },
    Parts: { getFactorySetup: () => ({}) },
    DriverRatings: { get: () => ({ pace: 50, craft: 50, awareness: 50, consistency: 50, experience: 50 }),
                     overall: () => 50 },
  });
  vm.runInContext(readFileSync(join(ROOT, "js/core/hash32.js"), "utf8"), ctx);
  vm.runInContext(readFileSync(join(ROOT, "js/core/mat4.js"), "utf8"), ctx);
  vm.runInContext(readFileSync(join(ROOT, "js/career/save-migrate.js"), "utf8"), ctx);
  vm.runInContext(readFileSync(join(ROOT, "js/core/store.js"), "utf8"), ctx);
  vm.runInContext(readFileSync(join(ROOT, "js/career/career.js"), "utf8"), ctx);
  vm.runInContext(readFileSync(join(ROOT, "js/career/season-cal.js"), "utf8"), ctx);
  return {
    Career: vm.runInContext("Career", ctx), disk,
    SeasonCal: vm.runInContext("SeasonCal", ctx),
    store: vm.runInContext("GameStore.store", ctx),
    SaveMigrate: vm.runInContext("SaveMigrate", ctx),
    foreign: (key) => listeners.get("storage")({ key, newValue: disk.get(key) }),
  };
}

test("migrateCareer coerces a corrupt deal, budget level and results ledger", () => {
  // A hand-edited or truncated save: `salary: "x"` reached settleRound's
  // arithmetic as NaN, a negative budgetLvl indexed below the table, and a
  // null row in `results` threw on the history screen's first `r.round`.
  const { SaveMigrate } = load();
  const c = SaveMigrate.migrateCareer({
    v: 1, flavour: "driver", team: "haas",
    deal: { salary: "x", bonusPt: "12", left: null, years: "2" },
    budgetLvl: -3,
    results: [null, 4, { round: 1, pos: 3 }, [1, 2], "row"],
  });
  assert.equal(c.deal.salary, 0);
  assert.equal(c.deal.bonusPt, 12);
  assert.equal(c.deal.left, 0);
  assert.equal(c.deal.years, 2);
  assert.equal(c.budgetLvl, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(c.results)), [{ round: 1, pos: 3 }]);
  assert.equal(c.team, "haas");
  assert.equal(SaveMigrate.migrateCareer({ v: 1, deal: "gold", team: 7 }).deal, null,
    "a non-object deal is dropped rather than coerced field by field");
  assert.equal(SaveMigrate.migrateCareer({ v: 1, team: 7 }).team, null);
});

test("year falls back to the first season for a missing, zero or junk value, and truncates a float", () => {
  // `career.year | 0 || 2026`: seasonIndex() subtracts year0 from it, so a
  // NaN here would make every era-dependent rule (regulations, legends,
  // contract expiry) read as season 0 forever, silently.
  const { SaveMigrate } = load();
  const year = (v) => SaveMigrate.migrateCareer({ v: 1, year: v }).year;
  assert.equal(year(undefined), 2026);
  assert.equal(year(0), 2026);
  assert.equal(year("abc"), 2026);
  assert.equal(year(NaN), 2026);
  assert.equal(year(2027.9), 2027, "a float year truncates rather than rounds");
  assert.equal(year("2028"), 2028, "a numeric string is still a year");
  assert.equal(year(2031), 2031);
});

test("remapPoints sanitises the per-round and finish records, not only pts", () => {
  // netPts() summed season.roundPts[id] raw — a string round score became
  // "25" + 0 concatenation and a NaN standing. roundMap/finishMap already
  // guarded the standalone save's resume(); the nested career championship
  // went through remapPoints, which never applied them.
  const { SaveMigrate } = load();
  const c = SaveMigrate.migrateCareer({
    v: 1,
    season: { round: 2, pts: { "haas:0": 43 }, teamPts: {}, driverCodes: {},
      roundPts: { "haas:0": [25, "18", -4, null], bogus: "x" },
      finishes: { "haas:0": [1, "2", 0.5, -1] } },
  });
  assert.deepEqual(JSON.parse(JSON.stringify(c.season.roundPts)), { "haas:0": [25, 0, 0, 0] });
  assert.deepEqual(JSON.parse(JSON.stringify(c.season.finishes)), { "haas:0": [1, 0, 0, 0] });
  const bare = SaveMigrate.migrateCareer({ v: 1, season: { round: 0, pts: {}, teamPts: {}, driverCodes: {} } });
  assert.deepEqual(JSON.parse(JSON.stringify(bare.season.roundPts)), {});
  assert.deepEqual(JSON.parse(JSON.stringify(bare.season.finishes)), {});
});

test("legacy migration preserves its source when the destination write hits quota", () => {
  const legacy = save(3, 500);
  const disk = new Map([["apex26.career", JSON.stringify(legacy)]]);
  const { Career } = load({
    disk,
    setItem(key, value, target) {
      if (key === "apex26.career.driver.0") {
        const err = new Error("storage is full");
        err.name = "QuotaExceededError";
        throw err;
      }
      target.set(key, value);
    },
  });

  Career.load();
  assert.deepEqual(JSON.parse(disk.get("apex26.career")), legacy,
    "the only durable copy must remain under its legacy key");
  assert.equal(disk.has("apex26.career.driver.0"), false,
    "the session cache must not be mistaken for a durable migration");
});

test("legacy migration preserves a save when its destination set is full", () => {
  const legacy = save(8, 800);
  const disk = new Map([["apex26.career", JSON.stringify(legacy)]]);
  for (let i = 0; i < 3; i++) {
    disk.set("apex26.career.driver." + i, JSON.stringify(save(i + 1, 100 + i)));
  }
  const { Career } = load({ disk });

  Career.load();
  assert.deepEqual(JSON.parse(disk.get("apex26.career")), legacy,
    "no free slot means defer migration, not delete the overflow save");
});

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
  assert.equal(Career.acceptOffer(0), null);
  assert.equal(Career.rollover(), null);
  assert.equal(Career.renewHire(1), false);
  assert.equal(Career.hireDriver("VER", 1), false);
  assert.equal(Career.data().money, money);
  assert.equal(Career.data().owned.indexOf("wing"), -1);
});

test("settleRound refuses a conflicted save before mutating results", () => {
  const { Career, disk, foreign } = load();
  Career.load();
  Career.engage(true);
  const career = Career.data();
  career.season.round = 1;
  const before = career.results.length;
  const money = career.money;
  const key = "apex26.career.driver.0";
  disk.set(key, JSON.stringify(save(9, 900)));
  foreign(key);
  assert.equal(Career.conflicted(), true);
  const player = { team: { id: "haas" }, retired: false, cuts: 0, penalty: 0, gridPos: 3 };
  const order = [player];
  assert.equal(Career.settleRound(order, player), null);
  assert.equal(career.results.length, before, "RAM must not record a round the disk will not keep");
  assert.equal(career.money, money);
  assert.equal(JSON.parse(disk.get(key)).season.round, 9);
});

test("career scoring checks its slot before championship points mutate", () => {
  const { Career, disk, foreign } = load();
  Career.load(); Career.engage(true);
  const local = Career.data();
  const key = "apex26.career.driver.0";
  disk.set(key, JSON.stringify(save(9, 900))); foreign(key);
  const player = { driverId: "haas:0", code: "YOU", team: { id: "haas" }, retired: false };
  assert.equal(Career.scoreRound([player], player), null);
  assert.equal(local.season.round, 1);
  assert.deepEqual(JSON.parse(JSON.stringify(local.season.pts)), {});
  assert.equal(JSON.parse(disk.get(key)).money, 900);
});

test("career scoring commits points and settlement together on an unchanged slot", () => {
  const { Career, SeasonCal, disk } = load();
  Career.load(); Career.engage(true); SeasonCal.engage("career");
  const c = Career.data();
  c.season.round = 0;
  const player = { driverId: "haas:0", code: "YOU", team: { id: "haas" }, retired: false,
    cuts: 0, penalty: 0, gridPos: 1 };
  const result = Career.scoreRound([player], player);
  assert.ok(result && result.save.ok);
  assert.equal(c.season.round, 1);
  assert.equal(c.season.pts["haas:0"], 25);
  assert.equal(c.results.length, 1);
  const durable = JSON.parse(disk.get("apex26.career.driver.0"));
  assert.equal(durable.season.round, 1);
  assert.equal(durable.results.length, 1);
});

test("a revision changing after award staging leaves the live season alias untouched", () => {
  const { Career, SeasonCal, disk, store, foreign } = load();
  Career.load(); Career.engage(true); SeasonCal.engage("career");
  const career = Career.data();
  career.season.round = 0;
  const alias = career.season, before = JSON.stringify(career);
  const key = "apex26.career.driver.0";
  const originalRev = store.keyRevision.bind(store);
  let reads = 0;
  store.keyRevision = (k) => {
    if (k === "career.driver.0" && ++reads === 2) {
      disk.set(key, JSON.stringify(save(9, 900))); foreign(key);
    }
    return originalRev(k);
  };
  const player = { driverId: "haas:0", code: "YOU", team: { id: "haas" }, retired: false };
  assert.equal(Career.scoreRound([player], player), null);
  assert.equal(reads, 2);
  assert.equal(career.season, alias);
  assert.equal(JSON.stringify(career), before);
  assert.equal(JSON.parse(disk.get(key)).money, 900);
});

test("a rejected settlement rolls back staged points and economy in place", () => {
  const { Career, SeasonCal, disk, store, foreign } = load();
  Career.load(); Career.engage(true); SeasonCal.engage("career");
  const career = Career.data();
  career.season.round = 0;
  const alias = career.season, before = JSON.stringify(career);
  const key = "apex26.career.driver.0";
  const originalRev = store.keyRevision.bind(store);
  let reads = 0;
  store.keyRevision = (k) => {
    if (k === "career.driver.0" && ++reads === 3) {
      disk.set(key, JSON.stringify(save(9, 900))); foreign(key);
    }
    return originalRev(k);
  };
  const player = { driverId: "haas:0", code: "YOU", team: { id: "haas" }, retired: false,
    cuts: 0, penalty: 0, gridPos: 1 };
  assert.equal(Career.scoreRound([player], player), null);
  assert.ok(reads >= 3);
  assert.equal(career.season, alias);
  assert.equal(JSON.stringify(career), before);
  assert.equal(Career.conflicted(), true);
  assert.equal(JSON.parse(disk.get(key)).money, 900);
});

test("a conflicted career cannot be cleared or deleted, including from a stale slot card", () => {
  const { Career, disk, foreign } = load();
  Career.load(); Career.engage(true);
  const key = "apex26.career.driver.0";
  const seen = Career.slotRevision("driver", 0);
  disk.set(key, JSON.stringify(save(9, 900))); foreign(key);
  assert.equal(Career.clear().reason, "conflict");
  assert.equal(Career.deleteSlot("driver", 0, seen).reason, "conflict");
  assert.equal(JSON.parse(disk.get(key)).money, 900);
  const other = "apex26.career.driver.1";
  disk.set(other, JSON.stringify(save(2, 200)));
  const otherSeen = Career.slotRevision("driver", 1);
  disk.set(other, JSON.stringify(save(3, 300))); foreign(other);
  assert.equal(Career.deleteSlot("driver", 1, otherSeen).reason, "conflict");
  assert.equal(JSON.parse(disk.get(other)).money, 300);
});

test("quota-refused clear and deletion report session-only outcomes", () => {
  const opts = { setItem(key, value, target) {
    if (key.startsWith("apex26.career.driver.") && value === "null") {
      const err = new Error("full"); err.name = "QuotaExceededError"; throw err;
    }
    target.set(key, value);
  } };
  const a = load(opts);
  a.Career.load();
  const clear = a.Career.clear();
  assert.equal(clear.ok, true);
  assert.equal(clear.durable, false);
  assert.equal(a.Career.active(), false, "session cache still follows the requested deletion");
  assert.equal(JSON.parse(a.disk.get("apex26.career.driver.0")).money, 100, "disk still has the save");
  const b = load(opts);
  b.Career.load();
  const del = b.Career.deleteSlot("driver", 0, b.Career.slotRevision("driver", 0));
  assert.equal(del.ok, true);
  assert.equal(del.durable, false);
  assert.equal(JSON.parse(b.disk.get("apex26.career.driver.0")).money, 100);
});

test("career hub BACK hides the title STANDINGS chip from the standalone season", () => {
  const src = readFileSync(join(ROOT, "js/career/career-ui.js"), "utf8");
  assert.match(src, /mb-standings.*SeasonCal\.hasProgress\(G\.season\)/);
  assert.match(src, /\$\("cr-go"\)\.disabled = !!st\.hire \|\| Career\.conflicted\(\)/);
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

test("a restored non-default career and its pointer reconcile in the current boot", async () => {
  const disk = new Map();
  const recovered = { ...save(4, 444), flavour: "myteam" };
  const { Career, store } = load({
    disk,
    mirrorRows: [
      { k: "apex26.career.myteam.2", v: JSON.stringify(recovered) },
      { k: "apex26.careerSlot", v: JSON.stringify("myteam:2") },
    ],
  });

  assert.equal(Career.load(), null, "the synchronous boot read predates IndexedDB");
  await store.mirror.ready;
  assert.equal(Career.active(), true);
  assert.equal(Career.slot().flavour, "myteam");
  assert.equal(Career.slot().i, 2);
  assert.equal(Career.data().money, 444);
  assert.equal(Career.data().season.round, 4);
});

test("the title menu refreshes after a restored career batch selects its slot", () => {
  const title = readFileSync(join(ROOT, "js/ui/title-menu.js"), "utf8");
  assert.match(title, /restoredBatch[\s\S]{0,300}refresh\(\)/);
});
