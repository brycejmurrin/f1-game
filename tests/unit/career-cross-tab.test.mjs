import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { makeDom } from "../helpers/mini-dom.mjs";

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
      const transaction = { objectStore: () => ({
        // B5 flush reads prev via get() before put — refuse older lsOk:true.
        get(k) {
          const request = {};
          queueMicrotask(() => {
            const row = mirrorRows.find((r) => r && r.k === k);
            request.result = row;
            if (request.onsuccess) request.onsuccess();
          });
          return request;
        },
        put() {}, delete() {},
      }) };
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
    Tracks: options.tracks || { LIST: [{ id: "a" }], SEASON: [{ id: "a" }], seasonIndex: () => 0 },
    Parts: { CATALOG: [], getFactorySetup: () => ({}), getCost: () => 0 },
    DriverRatings: { get: () => ({ pace: 50, craft: 50, awareness: 50, consistency: 50, experience: 50 }),
                     overall: () => 50 },
  });
  vm.runInContext(readFileSync(join(ROOT, "js/core/hash32.js"), "utf8"), ctx);
  vm.runInContext(readFileSync(join(ROOT, "js/core/mat4.js"), "utf8"), ctx);
  vm.runInContext(readFileSync(join(ROOT, "js/career/save-migrate.js"), "utf8"), ctx);
  vm.runInContext(readFileSync(join(ROOT, "js/core/store.js"), "utf8"), ctx);
  vm.runInContext(readFileSync(join(ROOT, "js/career/career-planning.js"), "utf8"), ctx);
  vm.runInContext(readFileSync(join(ROOT, "js/career/career.js"), "utf8"), ctx);
  vm.runInContext(readFileSync(join(ROOT, "js/career/season-cal.js"), "utf8"), ctx);
  return {
    Career: vm.runInContext("Career", ctx), disk, ctx,
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
  assert.equal(SaveMigrate.migrateCareer({ v: 1, team: 7 }).team, "haas",
    "a non-string team takes Career.start's default instead of null (the title menu upper-cases it at boot)");
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
  // Classified finishers only (BUGS.md B4 / SeasonCal.award) — a still-running
  // car must not take table points. Mark finished so the P1 fixture earns 25.
  const player = { driverId: "haas:0", code: "YOU", team: { id: "haas" }, retired: false,
    finished: true, cuts: 0, penalty: 0, gridPos: 1 };
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

test("title-menu season hydrate skips when a session entry is already open", () => {
  const title = readFileSync(join(ROOT, "js/ui/title-menu.js"), "utf8");
  assert.match(title, /seasonBack[\s\S]{0,400}entering/,
    "IndexedDB season restore must not mutate G.season during select/race-settings/loading");
  assert.match(title, /getElementById\("race-settings"\)/);
  assert.match(title, /getElementById\("loading"\)/);
});

test("missing calendar preserves exact raw JSON through reads, save, mutation and slot switch", () => {
  const original = save(1, 250);
  original.season.calIds = ["a", "gone"];
  original.season.roundPts = { "haas:0": [10, 4] };
  original.results = [{ r: 0, p: 1, pts: 10 }, { r: 1, p: 4, pts: 4 }];
  const raw = JSON.stringify(original, null, 2);
  const disk = new Map([["apex26.career.driver.0", raw], ["apex26.careerSlot", JSON.stringify("driver:0")]]);
  const { Career } = load({ disk });
  Career.load(); Career.engage(true);
  assert.equal(Career.inCareer(), false);
  assert.equal(Career.conflicted(), true);
  assert.equal(Career.planning().protection().raw, raw);
  assert.equal(Career.grant(99), null);
  Career.save(); Career.state(); Career.useSlot("driver", 1); Career.useSlot("driver", 0);
  assert.equal(disk.get("apex26.career.driver.0"), raw);
  assert.equal(Career.planning().adopt(), true);
  assert.deepEqual(Array.from(Career.data().season.calIds), ["a"]);
  assert.equal(Career.data().results.length, 1);
  assert.equal(Career.conflicted(), false);
});

test("all missing and malformed calendar stamps are read-only; explicit adoption resets progress", () => {
  for (const ids of [["gone"], ["a", "a"], "broken"]) {
    const original = save(1, 250); original.season.calIds = ids;
    original.results = [{ r: 0, pts: 10, p: 1 }];
    const raw = JSON.stringify(original);
    const disk = new Map([["apex26.career.driver.0", raw]]);
    const { Career } = load({ disk }); Career.load();
    assert.equal(disk.get("apex26.career.driver.0"), raw);
    assert.equal(Career.planning().adopt(), true);
    assert.equal(Career.data().season.round, 0);
    assert.equal(Career.data().results.length, 0);
  }
});

test("calendar adoption refuses newer stored revision and compares local versus stored without writes", () => {
  const original = save(1, 250); original.season.calIds = ["a", "gone"];
  const disk = new Map([["apex26.career.driver.0", JSON.stringify(original)]]);
  const { Career, foreign } = load({ disk }); Career.load();
  const newer = save(0, 777); disk.set("apex26.career.driver.0", JSON.stringify(newer));
  // Protected career cannot engage, so invalidation reloads immediately; emulate a
  // stale revision without event to exercise the exact-write comparison contract.
  const cmp = Career.planning().comparison();
  assert.equal(cmp.localSummary.money, 250); assert.equal(cmp.storedSummary.money, 777);
  assert.equal(JSON.parse(cmp.rawLocal).money, 250);
  foreign("apex26.career.driver.0");
  assert.equal(Career.planning().adopt(), false);
  assert.equal(JSON.parse(disk.get("apex26.career.driver.0")).money, 777);
});

test("v1 migration defaults Standard and original sponsor; v2 validates choices and stake", () => {
  const { SaveMigrate } = load();
  const old = save(0, 100); old.briefStake = { committed: true }; old.sponsorPicks = { "2026:0": 1 };
  const legacy = SaveMigrate.migrateCareer(old);
  assert.equal(legacy.v, 2); assert.equal(legacy.briefStake, null);
  assert.equal(Object.keys(legacy.sponsorPicks).length, 0);
  const modern = save(0, 100); modern.v = 2;
  modern.briefStake = { year: 2026, round: 0, committed: true, escrow: 99999 };
  modern.sponsorPicks = { "2026:0": 1, bad: 1, "2026:1": 8 };
  const migrated = SaveMigrate.migrateCareer(modern);
  assert.equal(migrated.briefStake.escrow, 0);
  assert.deepEqual(Object.keys(migrated.sponsorPicks), ["2026:0"]);
});

test("quota-failed calendar adoption retains original through slot switching and unsupported future versions refuse adoption", () => {
  for (const future of [false, true]) {
    const original = save(1, 250); original.season.calIds = ["a", "gone"];
    if (future) original.v = 999;
    const raw = JSON.stringify(original);
    const disk = new Map([["apex26.career.driver.0", raw]]);
    const { Career } = load({ disk, setItem(k, v, d) {
      if (k === "apex26.career.driver.0") throw new DOMException("full", "QuotaExceededError");
      d.set(k, v);
    } });
    Career.load(); assert.equal(Career.planning().adopt(), false);
    assert.equal(disk.get("apex26.career.driver.0"), raw);
    Career.useSlot("driver", 1); Career.useSlot("driver", 0);
    assert.equal(Career.planning().protection().raw, raw);
    assert.equal(Career.data().season.calIds.length, 2);
    assert.equal(disk.get("apex26.career.driver.0"), raw);
  }
});

test("public start preserves protected live save, refuses all protected targets, and explicit deletion frees slot", () => {
  const original = save(1, 250); original.season.calIds = ["a", "gone"];
  const raw = JSON.stringify(original, null, 2);
  const disk = new Map([["apex26.career.driver.0", raw], ["apex26.careerSlot", JSON.stringify("driver:0")]]);
  const { Career } = load({ disk }); Career.load();
  const originalView = Career.data();
  assert.equal(Career.start({ flavour: "driver", slot: 0 }), null);
  assert.equal(Career.data(), originalView);
  assert.equal(disk.get("apex26.career.driver.0"), raw);
  assert.equal(disk.get("apex26.careerSlot"), JSON.stringify("driver:0"));
  assert.ok(Career.start({ flavour: "driver", slot: 1, teamId: "haas" }));
  assert.equal(disk.get("apex26.career.driver.0"), raw);
  assert.equal(Career.start({ flavour: "driver", slot: 0 }), null);
  assert.equal(Career.slot().i, 1);
  assert.equal(disk.get("apex26.career.driver.0"), raw);
  Career.useSlot("driver", 0);
  assert.equal(Career.deleteSlot("driver", 0).durable, true);
  assert.ok(Career.start({ flavour: "driver", slot: 0, teamId: "haas" }));
});

test("explicit null stamp and huge future version preserve raw and block public overwrite", () => {
  for (const props of [{ v: 2, calIds: null }, { v: 4294967298, calIds: ["a"] }]) {
    const original = save(1, 250); original.v = props.v; original.season.calIds = props.calIds;
    const raw = JSON.stringify(original);
    const disk = new Map([["apex26.career.driver.0", raw]]);
    const { Career } = load({ disk }); Career.load();
    assert.equal(Career.conflicted(), true);
    assert.equal(disk.get("apex26.career.driver.0"), raw);
    assert.equal(Career.start({ flavour: "driver", slot: 0 }), null);
    assert.equal(disk.get("apex26.career.driver.0"), raw);
    if (props.v > 2) assert.equal(Career.planning().adopt(), false);
  }
});

test("calendar adoption carries current paid escrow and weekend lock to the remapped round", () => {
  for (const ids of [["gone", "a"], ["gone", "alsoGone"], null]) {
    const original = save(1, 200); original.v = 2;
    original.season.calIds = ids; original.season.startedRound = 1;
    original.briefStake = { year: 2026, round: 1, committed: true, escrow: 50 };
    original.objPick = { round: 1, i: 2 };
    const disk = new Map([["apex26.career.driver.0", JSON.stringify(original)]]);
    const { Career } = load({ disk }); Career.load();
    assert.equal(Career.planning().adopt(), true);
    assert.equal(Career.data().money, 200);
    assert.equal(Career.data().briefStake.round, 0);
    assert.equal(Career.data().briefStake.escrow, 50);
    assert.equal(Career.planning().stake(0), 50);
    assert.equal(Career.objectiveLocked(), true);
    assert.equal(Career.planning().chooseStake(false), false);
    assert.equal(Career.data().objPick.round, 0);
  }
});

// Execute the actual planning UI with a small DOM; source-text references alone
// cannot prove that recovery actions download the right snapshot or require consent.
function planningUiFixture({ protectedSave = false, conflict = false, locked = false, emptyCatalog = false } = {}) {
  class Node {
    constructor(tag, cls = "", text = "") { this.tag = tag; this.className = cls; this.textContent = text; this.children = []; this.attrs = {}; }
    appendChild(n) { n.parentNode = this; this.children.push(n); return n; }
    append(...nodes) { nodes.forEach((n) => this.appendChild(n)); }
    setAttribute(k, v) { this.attrs[k] = v; }
    click() { if (!this.disabled && this.onclick) this.onclick(); if (this.tag === "a") downloads.push({ name: this.download, blob: blobs.get(this.href) }); }
    remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((n) => n !== this); }
  }
  const downloads = [], blobs = new Map(), revoked = [], calls = { reload: [], adopt: 0, rebuild: 0, stake: [], sponsor: [], cash: [] };
  let adoptSucceeds = false;
  const el = (tag, cls, text) => new Node(tag, cls, text);
  const localRaw = '{"money":250,"season":{"calIds":["gone"]}}';
  const storedRaw = '{"money":777,"season":{"calIds":["a"]}}';
  const p = {
    protection: () => protectedSave ? { missing: ["gone"], raw: localRaw } : null,
    comparison: () => ({ rawLocal: localRaw, rawStored: storedRaw,
      localSummary: { year: 2026, team: "haas", round: 1, money: 250, rep: 30, results: 1 },
      storedSummary: { year: 2026, team: "haas", round: 2, money: 777, rep: 40, results: 2 } }),
    adopt: () => { calls.adopt++; return adoptSucceeds; },
    transition: () => ({ name: "POWERTRAIN FREEZE", seasons: 1, changes: [{ category: "Engine", from: "Premium", to: "Stock" }] }),
    sponsorOffers: () => [{ i: 0, chosen: true, label: "Clean 4 rounds", pay: 400 }, { i: 1, chosen: false, label: "Score 3 points", pay: 450 }],
    chooseSponsor: (i) => { calls.sponsor.push(i); return true; },
    lastSponsor: () => ({ met: false, label: "Clean 4 rounds", done: 3, need: 4, pay: 400 }),
    stake: () => 0, chooseStake: (v) => { calls.stake.push(v); return true; },
    factory: () => ({ savings: emptyCatalog ? 0 : 21, count: emptyCatalog ? 0 : 2 }),
    cash: (price, wages) => { calls.cash.push([price, wages]); return { afterPurchase: 1000 - price, wages: wages ?? 95, low: Math.max(0, 905 - price), high: 2800 - price }; },
  };
  const Career = { planning: () => p, conflicted: () => conflict, load: (opts) => calls.reload.push(opts),
    sponsor: () => ({ possible: false, start: 0 }), objectiveLocked: () => locked, round: () => 0, facilityCost: () => 3000 };
  const ctx = vm.createContext({ Career, Dom: { el }, Blob,
    document: { body: new Node("body"), createElement: (tag) => new Node(tag) },
    URL: { createObjectURL: (blob) => { const id = "blob:" + blobs.size; blobs.set(id, blob); return id; }, revokeObjectURL: (id) => revoked.push(id) },
    setTimeout: (fn) => { fn(); return 0; },
  });
  vm.runInContext(readFileSync(join(ROOT, "js/career/career-planning-ui.js"), "utf8"), ctx);
  const UI = vm.runInContext("CareerPlanningUI", ctx);
  const left = new Node("div"), objective = new Node("div"), factory = new Node("button");
  const row = (label, value) => el("div", "", label + ": " + value);
  UI.append({ left, objective, factory, rebuild: () => calls.rebuild++, el, row });
  const walk = (n) => [n, ...n.children.flatMap(walk)];
  const button = (label, root = left) => walk(root).find((n) => n.tag === "button" && n.textContent === label);
  const text = (root) => walk(root).map((n) => n.textContent).join("\n");
  return { UI, left, objective, factory, calls, downloads, revoked, button, text, localRaw, storedRaw, permitAdoption: () => { adoptSucceeds = true; } };
}

test("actual planning recovery UI exports different local/stored JSON, reloads without automatic adoption", async () => {
  const f = planningUiFixture({ conflict: true });
  assert.match(f.text(f.left), /This tab:.*250 cr/); assert.match(f.text(f.left), /Stored save:.*777 cr/);
  assert.equal(f.calls.adopt, 0); assert.equal(f.calls.reload.length, 0);
  f.button("Download this tab's JSON").click(); f.button("Download stored JSON").click();
  assert.equal(await f.downloads[0].blob.text(), f.localRaw);
  assert.equal(await f.downloads[1].blob.text(), f.storedRaw);
  assert.deepEqual(f.downloads.map((x) => x.name), ["apex26-career-local.json", "apex26-career-stored.json"]);
  assert.equal(f.revoked.length, 2); assert.equal(f.calls.adopt, 0);
  f.button("Reload stored save").click();
  assert.equal(f.calls.reload[0].persist, false); assert.equal(f.calls.rebuild, 1);
  assert.equal(f.calls.adopt, 0);
});

test("actual protected UI requires two taps to adopt, reports failure and rebuilds only on success", async () => {
  const f = planningUiFixture({ protectedSave: true });
  assert.match(f.text(f.left), /read-only.*gone/);
  f.button("Download original saved JSON").click(); assert.equal(await f.downloads[0].blob.text(), f.localRaw);
  const adopt = f.button("Adopt available calendar…");
  assert.equal(f.calls.adopt, 0); adopt.click(); assert.equal(f.calls.adopt, 0);
  assert.equal(adopt.textContent, "Confirm adoption and removed-round data loss");
  assert.match(f.text(f.left), /locked stake stays locked/);
  adopt.click(); assert.equal(f.calls.adopt, 1); assert.equal(f.calls.rebuild, 0);
  assert.match(f.text(f.left), /Original remains protected/);
  f.permitAdoption(); adopt.click(); assert.equal(f.calls.adopt, 2); assert.equal(f.calls.rebuild, 1);
});

test("actual planning cards explain lost sponsors, lock style/stake controls, and quote factory/wages", () => {
  const locked = planningUiFixture({ locked: true, emptyCatalog: true });
  assert.match(locked.text(locked.left), /TARGET LOST/); assert.match(locked.text(locked.left), /SPONSOR TARGET MISSED/);
  const offer = locked.button("SELECTED · Clean 4 rounds · 400 cr");
  assert.equal(offer.disabled, true); assert.equal(offer.attrs["aria-pressed"], "true"); offer.click();
  const committed = locked.button("Committed · 50 cr stake", locked.objective);
  assert.equal(committed.disabled, true); committed.click();
  assert.equal(locked.calls.sponsor.length, 0); assert.equal(locked.calls.stake.length, 0);
  assert.match(locked.text(locked.factory), /0 cr estimated savings.*No remaining catalog savings/);
  assert.deepEqual(locked.calls.cash[0], [3000, undefined]);
  assert.match(locked.text(locked.factory), /95 cr upcoming wages/);
  assert.match(locked.text(locked.factory), /Sponsor income is not guaranteed/);
  const open = planningUiFixture();
  open.button("Score 3 points · 450 cr").click();
  open.button("Committed · 50 cr stake", open.objective).click();
  open.button("Standard", open.objective).click();
  assert.deepEqual(open.calls.sponsor, [1]); assert.deepEqual(open.calls.stake, [true, false]);
  assert.match(open.text(open.factory), /21 cr estimated savings across 2 legal unowned/);
  open.UI.cashNote(open.factory, 75, 38);
  assert.deepEqual(open.calls.cash.at(-1), [75, 38]);
  assert.match(open.text(open.factory), /925 cr after purchase · 38 cr \/ round wages/);
  assert.match(open.text(open.left), /Premium → Stock · free to fit/);
});

test("real CareerScreen creates and opens hub and slots with planning helper present and no leaked locals", () => {
  const original = save(0, 5000); original.flavour = "myteam";
  const disk = new Map([["apex26.career.myteam.0", JSON.stringify(original)], ["apex26.careerSlot", JSON.stringify("myteam:0")]]);
  const { Career, ctx } = load({ disk });
  const dom = makeDom();
  for (const id of ["cg-body", "ch-body"]) dom.document.body.appendChild(dom.byId(id));
  ctx.document = dom.document;
  ctx.Dom = { el: (tag, cls = "", text = "") => {
    const n = dom.document.createElement(tag); n.className = cls; n.textContent = text; return n;
  } };
  ctx.ScrollFade = { refresh() {} };
  vm.runInContext('Teams.LIST[0].name = "Haas"; Tracks.LIST[0].name = "Test Circuit"; Tracks.SEASON[0].name = "Test Circuit";', ctx);
  Career.load(); Career.engage(true);
  const G = { $: dom.byId, els: { overlay: dom.byId("overlay") }, cssCol: () => "#fff", soundOn: false };
  vm.runInContext(readFileSync(join(ROOT, "js/career/career-planning-ui.js"), "utf8"), ctx);
  vm.runInContext(readFileSync(join(ROOT, "js/career/career-ui.js"), "utf8"), ctx);
  const screen = vm.runInContext("CareerScreen", ctx).create(G);
  assert.doesNotThrow(() => screen.openHub());
  assert.equal(dom.byId("cr-title").textContent, "CAREER 2026");
  assert.equal(dom.byId("career").hidden, false);
  assert.ok(dom.byId("cr-left").querySelectorAll("h3").some((n) => n.textContent === "NEXT-ROUND CASH"));
  assert.equal(ctx.planningFactory, undefined); assert.equal(ctx.planningObjective, undefined);
  assert.doesNotThrow(() => screen.openSlots("hub"));
  assert.equal(dom.byId("cr-title").textContent, "CAREER MODES");
  assert.equal(dom.byId("cr-go").hidden, true);
});

// #2193: with the live slot's localStorage key missing (evicted / cleared) but the
// IndexedDB mirror still holding it, the synchronous boot load() fell through to
// another slot and DURABLY repointed careerSlot. The restore then skipped the
// present pointer and the player landed in a different career for good.
test("a missing live slot restored from the mirror stays the selected career (#2193)", async () => {
  const disk = new Map();
  const mine = save(6, 606), other = save(2, 202);
  disk.set("apex26.careerSlot", JSON.stringify("driver:0"));
  disk.set("apex26.career.driver.1", JSON.stringify(other));
  const { Career, store } = load({
    disk,
    mirrorRows: [{ k: "apex26.career.driver.0", v: JSON.stringify(mine) }],
  });
  assert.equal(Career.load().money, 202, "boot plays the fallback slot while IndexedDB opens");
  assert.equal(disk.get("apex26.careerSlot"), JSON.stringify("driver:0"), "the pointer is not rewritten before the restore");
  await store.mirror.ready;
  await new Promise((r) => setImmediate(r));
  assert.equal(Career.slot().flavour, "driver");
  assert.equal(Career.slot().i, 0, "the restored career is selected again");
  assert.equal(Career.data().money, 606);
  assert.equal(JSON.parse(disk.get("apex26.careerSlot")), "driver:0");
});

test("a fallback with nothing to restore persists the fallback pointer once the mirror settles (#2193)", async () => {
  const disk = new Map();
  disk.set("apex26.careerSlot", JSON.stringify("driver:0"));
  disk.set("apex26.career.driver.1", JSON.stringify(save(2, 202)));
  const { Career, store } = load({ disk, mirrorRows: [] });
  assert.equal(Career.load().money, 202);
  await store.mirror.ready;
  await new Promise((r) => setImmediate(r));
  assert.equal(JSON.parse(disk.get("apex26.careerSlot")), "driver:1", "no restore came: the fallback becomes the pointer");
  assert.equal(Career.slot().i, 1);
});
