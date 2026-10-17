/* career-backup.test.mjs — CareerBackup (js/career/career-backup.js): the
 * deliberate six-slot export/import path SettingsExport excludes and the
 * broken-storage recovery banner only offers when storage is already failing.
 *
 *   (1) export → wipe → import round-trips byte-equal across all six slots
 *   (2) a v0 save exports and imports through the migration ladder
 *   (3) hostile payloads are rejected with a reason and change nothing
 *   (4) import over a newer live revision is refused
 *   (5) career-cross-tab.test.mjs still green (run beside this file)
 *   (6) a backup's empty rows never erase local slots; badges merge as a
 *       union; a further-along local standalone season is kept
 *   (7) malformed history / offers / moves / roster rows cannot crash career
 *   (8) a MY TEAM backup carries the team identity (customTeam, customLogo,
 *       livery.custom.custom, livery.custom) and restores it on an empty
 *       device; a driver-only or identity-less backup never erases a local
 *       identity; garbage identity values are dropped without throwing
 *
 * Plus one mini-dom UI pin: slot cards expose EXPORT / IMPORT buttons.
 *
 * Run: node --test tests/unit/career-backup.test.mjs
 *      (npm run test:tooling-fast / test:state-unit)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { makeDom } from "../helpers/mini-dom.mjs";
import { DOM_SOURCE } from "../helpers/seed-dom.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const src = (p) => readFileSync(join(ROOT, p), "utf8").replace(/^const\b/gm, "var");

function save(opts = {}) {
  return {
    v: opts.v != null ? opts.v : 1,
    flavour: opts.flavour || "driver",
    year: opts.year || 2026,
    money: opts.money != null ? opts.money : 100,
    rep: 30, seat: 0,
    driver: { name: "A", code: "YOU", num: 99 },
    seed: opts.seed || 1,
    team: opts.team || "haas",
    season: opts.season || { round: opts.round || 1, pts: {}, teamPts: {}, driverCodes: {} },
    owned: [], fitted: {}, results: [], history: [], dev: {}, tdev: {},
    seats: {}, offers: [], obj: null, budgetLvl: 0, facility: 0,
    moves: [], paidSponsors: [],
    deal: { salary: 0, bonusPt: 0, left: 1, years: 1 },
  };
}

function loadHarness(options = {}) {
  const disk = options.disk || new Map();
  const listeners = new Map();
  const team = {
    id: "haas", name: "Haas", tier: 4, stats: {},
    drivers: [{ name: "A", code: "AAA", num: 1 }, { name: "B", code: "BBB", num: 2 }],
  };
  const ctx = vm.createContext({
    Math, JSON, Object, Array, String, Number, Date, Set, Map, Promise, Blob,
    isNaN, isFinite, parseInt, console, setTimeout, clearTimeout, queueMicrotask,
    URL: { createObjectURL: () => "blob:test", revokeObjectURL() {} },
    localStorage: {
      getItem: (k) => disk.has(k) ? disk.get(k) : null,
      setItem: (k, v) => disk.set(k, String(v)),
      removeItem: (k) => disk.delete(k),
    },
    window: {
      addEventListener: (name, fn) => listeners.set(name, fn),
      __APEX_BUILD: "test-build",
    },
    document: {
      createElement: () => ({
        href: "", download: "", click() {}, remove() {},
        setAttribute() {}, style: {},
      }),
      body: { appendChild() {}, insertAdjacentHTML() {} },
      addEventListener() {},
    },
    Log: { warn() {}, info() {}, debug() {}, error() {}, enabled: () => false },
    Teams: {
      POINTS: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1],
      LIST: [team],
      isReal: (t) => !!t && !t.custom && !t.legends,
    },
    // SEASON needs enough rounds that a restored season.round (SEC2-1 / C8 use
    // 3–4) is still in range — SeasonCal.load() resume()s then save()s, and a
    // single-circuit calendar restarts any round > 1 back to 0.
    Tracks: {
      LIST: Array.from({ length: 24 }, (_, i) => ({ id: "t" + i })),
      SEASON: Array.from({ length: 24 }, (_, i) => ({ id: "t" + i })),
      seasonIndex: () => 0,
    },
    Parts: { CATALOG: [], getFactorySetup: () => ({}), getCost: () => 0, setLegality() {} },
    DriverRatings: {
      get: () => ({ pace: 50, craft: 50, awareness: 50, consistency: 50, experience: 50 }),
      overall: () => 50,
    },
    NativeDownload: { viable: () => false, saveBlob: async () => ({ ok: true }) },
    Hash32: { fnv1a: (s) => String(s).length },
  });
  vm.runInContext(src("js/core/hash32.js"), ctx);
  vm.runInContext(src("js/core/mat4.js"), ctx);
  vm.runInContext(src("js/career/save-migrate.js"), ctx);
  vm.runInContext(src("js/core/store.js"), ctx);
  vm.runInContext(src("js/career/career-backup.js"), ctx);
  // The MY TEAM identity is shape-gated by the GARAGE file's garageValue.
  if (options.settingsExport !== false) vm.runInContext(src("js/ui/settings-export.js"), ctx);
  vm.runInContext(src("js/career/team-identity.js"), ctx);
  vm.runInContext(src("js/career/career.js"), ctx);
  vm.runInContext(src("js/career/season-cal.js"), ctx);
  return {
    ctx,
    SettingsExport: options.settingsExport !== false ? vm.runInContext("SettingsExport", ctx) : null,
    SeasonCal: vm.runInContext("SeasonCal", ctx),
    CareerBackup: vm.runInContext("CareerBackup", ctx),
    Career: vm.runInContext("Career", ctx),
    SaveMigrate: vm.runInContext("SaveMigrate", ctx),
    store: vm.runInContext("GameStore.store", ctx),
    disk,
    foreign: (key) => {
      const fn = listeners.get("storage");
      if (fn) fn({ key, newValue: disk.get(key) });
    },
  };
}

function fillSix(h) {
  const specs = [
    ["driver", 0, 110], ["driver", 1, 120], ["driver", 2, 130],
    ["myteam", 0, 210], ["myteam", 1, 220], ["myteam", 2, 230],
  ];
  for (const [f, i, money] of specs) {
    const c = save({ flavour: f, money, team: f === "myteam" ? "custom" : "haas", seed: money });
    h.disk.set("apex26.career." + f + "." + i, JSON.stringify(c));
  }
  h.disk.set("apex26.careerSlot", JSON.stringify("driver:0"));
  h.Career.load();
  return specs;
}

function slotSnap(disk) {
  const out = {};
  for (const f of ["driver", "myteam"]) {
    for (let i = 0; i < 3; i++) {
      const k = "apex26.career." + f + "." + i;
      out[k] = disk.has(k) ? disk.get(k) : null;
    }
  }
  return out;
}

test("export → wipe → import round-trips byte-equal across all six slots", () => {
  const h = loadHarness();
  fillSix(h);
  // Canonicalise through one export/import so migrateCareer's fill-in of
  // optional fields is not mistaken for drift on the second pass.
  const first = h.CareerBackup.build();
  h.CareerBackup.wipeAllSlots();
  assert.equal(h.CareerBackup.apply(first, { otherFlavourConfirmed: true }).ok, true);
  const before = slotSnap(h.disk);
  const envelope = h.CareerBackup.build();
  assert.equal(envelope.format, "apex26-career-backup-v1");
  assert.equal(envelope.slots.length, 6);
  assert.equal(envelope.slots.filter((s) => s.data).length, 6);
  assert.equal(envelope.build, "test-build");

  h.CareerBackup.wipeAllSlots();
  for (const f of ["driver", "myteam"]) {
    for (let i = 0; i < 3; i++) {
      assert.equal(h.disk.get("apex26.career." + f + "." + i), "null");
    }
  }

  const applied = h.CareerBackup.apply(envelope, { otherFlavourConfirmed: true });
  assert.equal(applied.ok, true);
  assert.equal(applied.written.length, 6);
  const after = slotSnap(h.disk);
  for (const k of Object.keys(before)) {
    assert.equal(after[k], before[k], k + " drifted after round-trip");
  }
});

test("a v0 save exports and imports through the migration ladder", () => {
  const h = loadHarness();
  const v0 = {
    flavour: "driver", team: "haas", money: 77, seed: 9,
    driver: { name: "V0", code: "YOU", num: 99 },
    // predates `v` and `season` — SaveMigrate fills them
  };
  h.disk.set("apex26.career.driver.0", JSON.stringify(v0));
  h.disk.set("apex26.careerSlot", JSON.stringify("driver:0"));
  h.Career.load();
  assert.equal(h.Career.data().v, h.SaveMigrate.CAREER_V);
  assert.ok(h.Career.data().season);

  const envelope = h.CareerBackup.build();
  const row = envelope.slots.find((s) => s.flavour === "driver" && s.i === 0);
  assert.ok(row && row.data);
  assert.equal(row.data.v, h.SaveMigrate.CAREER_V);
  assert.equal(row.data.money, 77);

  h.CareerBackup.wipeAllSlots();
  const applied = h.CareerBackup.apply(envelope, { otherFlavourConfirmed: true });
  assert.equal(applied.ok, true);
  h.Career.load();
  assert.equal(h.Career.data().money, 77);
  assert.equal(h.Career.data().v, h.SaveMigrate.CAREER_V);
  assert.ok(h.Career.data().season);
});

test("hostile payloads are rejected with a reason and change nothing", () => {
  const h = loadHarness();
  fillSix(h);
  const before = slotSnap(h.disk);

  const cases = [
    [{ format: "nope", slots: [] }, "wrong-format"],
    [{ format: "apex26-career-backup-v1", slots: [{ flavour: "driver", i: 0, data: { money: NaN } }] }, "nan-money"],
    [{ format: "apex26-career-backup-v1", slots: [{ flavour: "driver", i: 0,
      data: Object.assign(save({}), { driver: { name: "A", code: { toString: null }, num: 99 } }) }] }, "driver-code"],
    [{ format: "apex26-career-backup-v1", slots: [{ flavour: "driver", i: 0,
      data: Object.assign(save({}), { driver: { name: {}, code: "YOU", num: 99 } }) }] }, "driver-name"],
    [{ format: "apex26-career-backup-v1", slots: [{ flavour: "driver", i: 0,
      data: Object.assign(save({}), { driver: { name: "A", code: "YOU", num: {} } }) }] }, "driver-num"],
    [{ format: "apex26-career-backup-v1", slots: [{ flavour: "driver", i: 0, data: [1, 2, 3] }] }, "slot-not-object"],
    // Interpolated into the import card: a hostile toString threw inside the picker callback.
    [{ format: "apex26-career-backup-v1", slots: [{ flavour: "driver", i: 0,
      data: Object.assign(save({}), { team: { toString: 1 } }) }] }, "team-not-string"],
    [{ format: "apex26-career-backup-v1", slots: [{ flavour: "driver", i: 0,
      data: Object.assign(save({}), { year: "2026" }) }] }, "year-not-number"],
    [{ format: "apex26-career-backup-v1", slots: [{ flavour: "driver", i: 0,
      data: Object.assign(save({}), { year: { toString: "oops" } }) }] }, "year-not-number"],
    [{ format: "apex26-career-backup-v1", slots: [{ flavour: "driver", i: 0,
      data: Object.assign(save({}), { year: Infinity }) }] }, "year-not-number"],
    [{ format: "apex26-career-backup-v1", slots: [], myTeam: { customTeam: { name: { toString: 1 } } } }, "custom-team-name"],
    // A driver career filed under a MY TEAM row (and the reverse) would load as
    // the wrong flavour in that slot set.
    [{ format: "apex26-career-backup-v1", slots: [{ flavour: "myteam", i: 2, data: save({ flavour: "driver" }) }] }, "flavour-mismatch"],
    [{ format: "apex26-career-backup-v1", slots: [{ flavour: "driver", i: 0, data: save({ flavour: "myteam", team: "haas" }) }] }, "flavour-mismatch"],
    [{ format: "apex26-career-backup-v1", slots: "nope" }, "slots-not-array"],
    [{ format: "apex26-career-backup-v1", slots: [], ghost: { x: 1 } }, "ghosts-forbidden"],
    // Two rows for one slot: apply() would write the first and then fail (or
    // silently overwrite it), so the file is refused before any write.
    [{ format: "apex26-career-backup-v1", slots: [
      { flavour: "driver", i: 1, data: save({ flavour: "driver", money: 1 }) },
      { flavour: "driver", i: 1, data: save({ flavour: "driver", money: 2 }) }] }, "duplicate-slot"],
    // A missing flavour/index is the driver set's slot 0, so it collides with it.
    [{ format: "apex26-career-backup-v1", slots: [
      { data: save({ flavour: "driver", money: 1 }) },
      { flavour: "driver", i: 0, data: save({ flavour: "driver", money: 2 }) }] }, "duplicate-slot"],
  ];
  for (const [payload, reason] of cases) {
    const r = h.CareerBackup.validate(payload);
    assert.equal(r.ok, false, reason);
    assert.equal(r.reason, reason);
    const applied = h.CareerBackup.apply(payload, { otherFlavourConfirmed: true });
    assert.equal(applied.ok, false);
    assert.deepEqual(slotSnap(h.disk), before, reason + " mutated disk");
  }

  const huge = "x".repeat(5 * 1024 * 1024 + 1);
  const tooBig = h.CareerBackup.validate({ format: "apex26-career-backup-v1", slots: [] }, huge);
  assert.equal(tooBig.ok, false);
  assert.equal(tooBig.reason, "too-large");
  assert.deepEqual(slotSnap(h.disk), before, "5 MB blob mutated disk");
});

test("import over a newer live revision is refused", () => {
  const h = loadHarness();
  fillSix(h);
  h.Career.engage(true);
  const envelope = h.CareerBackup.build();
  const liveKey = "apex26.career.driver.0";
  const expected = {};
  for (const f of ["driver", "myteam"]) {
    for (let i = 0; i < 3; i++) expected[f + ":" + i] = h.CareerBackup.revisionOf(f, i);
  }

  // Foreign tab writes a newer live save after we captured revisions.
  const newer = save({ flavour: "driver", money: 999, round: 9 });
  h.disk.set(liveKey, JSON.stringify(newer));
  h.foreign(liveKey);
  assert.equal(h.Career.conflicted(), true);

  const applied = h.CareerBackup.apply(envelope, {
    otherFlavourConfirmed: true,
    expectedRevisions: expected,
  });
  assert.equal(applied.ok, false);
  assert.equal(applied.reason, "conflict");
  assert.equal(JSON.parse(h.disk.get(liveKey)).money, 999, "live save must stay");
});

test("import from a driver card does not touch myteam without confirm", () => {
  const h = loadHarness();
  fillSix(h);
  const envelope = h.CareerBackup.build();
  h.CareerBackup.wipeAllSlots();
  // Seed a MY TEAM save that must survive an unconfirmed driver-focused import.
  const keep = save({ flavour: "myteam", money: 555, team: "custom" });
  h.disk.set("apex26.career.myteam.0", JSON.stringify(keep));
  h.store._cache.delete("apex26.career.myteam.0");

  const partial = h.CareerBackup.apply(envelope, { focusFlavour: "driver" });
  assert.equal(partial.ok, true);
  assert.equal(partial.needsConfirm, true);
  assert.ok(partial.written.every((id) => id.startsWith("driver:")));
  assert.equal(JSON.parse(h.disk.get("apex26.career.myteam.0")).money, 555);

  const full = h.CareerBackup.apply(envelope, {
    focusFlavour: "driver",
    otherFlavourConfirmed: true,
  });
  assert.equal(full.ok, true);
  assert.equal(JSON.parse(h.disk.get("apex26.career.myteam.0")).money, 210);
});

test("a sparse backup restores its own slots and never erases the ones it lacks", () => {
  // Device A only ever used driver slot 1; build() still exports all six rows.
  const a = loadHarness();
  a.disk.set("apex26.career.driver.0", JSON.stringify(save({ money: 111 })));
  a.disk.set("apex26.careerSlot", JSON.stringify("driver:0"));
  a.Career.load();
  const envelope = a.CareerBackup.build();
  assert.equal(envelope.slots.filter((s) => s.data == null).length, 5);

  // Device B holds saves in slots the backup has as empty rows.
  const b = loadHarness();
  b.disk.set("apex26.career.driver.2", JSON.stringify(save({ money: 999999, seed: 7 })));
  b.disk.set("apex26.career.myteam.1", JSON.stringify(save({ flavour: "myteam", money: 4242, team: "custom" })));
  b.disk.set("apex26.careerSlot", JSON.stringify("driver:2"));
  b.Career.load();

  const partial = b.CareerBackup.apply(JSON.parse(JSON.stringify(envelope)), { focusFlavour: "driver" });
  assert.equal(partial.ok, true);
  assert.deepEqual([...partial.written], ["driver:0"]);
  assert.equal(JSON.parse(b.disk.get("apex26.career.driver.0")).money, 111);
  assert.equal(JSON.parse(b.disk.get("apex26.career.driver.2")).money, 999999, "driver slot 3 erased");
  // "ALL MODES?" with no MY TEAM saves in the backup must not wipe MY TEAM.
  const all = b.CareerBackup.apply(JSON.parse(JSON.stringify(envelope)), {
    focusFlavour: "driver", otherFlavourConfirmed: true,
  });
  assert.equal(all.ok, true);
  assert.equal(JSON.parse(b.disk.get("apex26.career.myteam.1")).money, 4242, "MY TEAM slot 2 erased");
  assert.equal(JSON.parse(b.disk.get("apex26.career.driver.2")).money, 999999);
});

test("standalone qualifying survives backup serialization and restores its driven grid", () => {
  const a = loadHarness();
  const qualifying = {
    qualiOrder: [{ id: "haas:0", t: 71.2, human: true }, { id: "haas:1", t: 72.4, human: false, noTime: true }],
    qualiTrack: "t0", qualiMode: "season", qualiSeat: "haas:0|haas",
  };
  a.store.set("season", { round: 0, pts: {}, teamPts: {}, driverCodes: {}, ...qualifying });
  const text = a.CareerBackup.serialize(a.CareerBackup.build());
  const b = loadHarness();
  assert.equal(b.CareerBackup.apply(JSON.parse(text), { rawText: text }).ok, true);
  const restored = b.SeasonCal.load();
  for (const [key, value] of Object.entries(qualifying)) {
    assert.deepEqual(JSON.parse(JSON.stringify(restored[key])), value, key);
  }
  // The real reader must recover the same human lap and grid, not just retain
  // unused JSON. Its track/mode/seat checks are part of the restoration contract.
  vm.runInContext(src("js/race/quali-model.js"), b.ctx);
  const cars = [0, 1].map((i) => ({ driverId: "haas:" + i, team: { id: "haas" }, isPlayer: i === 0 }));
  const model = b.ctx.Quali.create({ season: restored, seasonMode: true, cars, track: { def: { id: "t0" } } });
  const results = model.results();
  assert.equal(results[0].t, 71.2);
  assert.equal(results[0].human, true);
  assert.equal(results[1].noTime, true);
  assert.deepEqual(Array.from(model.order(cars), (car) => car.driverId), ["haas:0", "haas:1"]);
});

test("legacy ID-only qualifying grids stay unstamped and retain their order", () => {
  const a = loadHarness(), b = loadHarness();
  a.store.set("season", { round: 0, pts: {}, qualiOrder: ["haas:1", "haas:0"] });
  const text = a.CareerBackup.serialize(a.CareerBackup.build());
  assert.equal(b.CareerBackup.apply(JSON.parse(text), { rawText: text }).ok, true);
  const restored = b.SeasonCal.load();
  assert.deepEqual(Array.from(restored.qualiOrder), ["haas:1", "haas:0"]);
  for (const key of ["qualiTrack", "qualiMode", "qualiSeat"]) assert.equal(Object.hasOwn(restored, key), false, key);
  vm.runInContext(src("js/race/quali-model.js"), b.ctx);
  const cars = [0, 1].map((i) => ({ driverId: "haas:" + i, team: { id: "haas" }, isPlayer: i === 0 }));
  const model = b.ctx.Quali.create({ season: restored, seasonMode: true, cars, track: { def: { id: "t0" } } });
  assert.deepEqual(Array.from(model.order(cars), (car) => car.driverId), ["haas:1", "haas:0"]);
});

function qualifyingWeekend() {
  return {
    round: 0, pts: {}, teamPts: {}, driverCodes: {},
    config: { trackIds: ["t0", "t1"], quali: true },
    qualiOrder: [{ id: "haas:1", t: 71.2, human: false }, { id: "haas:0", t: 72.4, human: true }],
    qualiTrack: "t0", qualiMode: "season", qualiSeat: "haas:0|haas",
  };
}
function beforeQualifying(season) {
  const copy = JSON.parse(JSON.stringify(season));
  for (const key of ["qualiOrder", "qualiTrack", "qualiMode", "qualiSeat"]) delete copy[key];
  return copy;
}

function scoredWeekend({ sprint = true, completedLaps = 1, seedBeforeExport = false, previousRound = false } = {}) {
  const h = loadHarness();
  vm.runInContext(src("js/race/race-control.js"), h.ctx);
  h.SeasonCal.engage("season");
  const season = h.SeasonCal.applyConfig({ trackIds: ["t0", "t1"], sprint, sprintIds: ["t0", "t1"], laps: 10 }).season;
  const cars = [
    { driverId: "haas:0", team: { id: "haas" }, code: "YOU", human: true, retired: true, lap: 1 },
    { driverId: "haas:1", team: { id: "haas" }, code: "BBB", retired: false, lap: completedLaps + 1 },
  ];
  if (previousRound) {
    const finishers = cars.map(car => ({ ...car, retired: false, finished: true }));
    if (sprint) assert.equal(h.SeasonCal.award(season, finishers, null), "sprint");
    assert.equal(h.SeasonCal.award(season, finishers, null), "race");
  }
  if (seedBeforeExport) h.SeasonCal.luckSeed(season, 77);
  const envelope = JSON.parse(h.CareerBackup.serialize(h.CareerBackup.build()));
  h.SeasonCal.luckSeed(season, 77);
  const run = h.ctx.RaceControl.shortRun(cars, 3);
  assert.equal(h.SeasonCal.award(season, cars, null, run), sprint ? "sprint" : "race");
  assert.equal(h.SeasonCal.save(season).ok, true);
  return { h, envelope, season };
}

test("older backup keeps the Grand Prix stage after a zero-point sprint", () => {
  for (const sprint of [true, "rounds"]) for (const seedBeforeExport of [false, true]) for (const previousRound of [false, true]) {
    const { h, envelope, season } = scoredWeekend({ sprint, seedBeforeExport, previousRound });
    const total = points => Object.values(points).reduce((sum, pts) => sum + pts, 0);
    assert.equal(total(season.pts), total(envelope.season.pts));
    assert.equal(season.round, previousRound ? 1 : 0);
    assert.equal(h.SeasonCal.stage(season), "race");
    const revision = h.store.keyRevision("season");
    assert.ok(h.CareerBackup.preview(envelope).extras.includes("Standalone season: keep newer local progress"));
    const result = h.CareerBackup.apply(envelope);
    assert.equal(result.ok, true);
    assert.equal(result.applied.includes("season"), false);
    assert.equal(h.store.keyRevision("season"), revision);
    assert.equal(h.SeasonCal.stage(h.SeasonCal.load()), "race");
  }
});

test("seasonAhead compares the cleaned round: round 250 is 0, so a local round-5 season stays", () => {
  const h = loadHarness();
  const local = { round: 5, pts: {}, teamPts: {}, driverCodes: {} };
  h.store.write("season", local);
  const envelope = { format: "apex26-career-backup-v1", slots: [], season: { round: 250, pts: {}, teamPts: {}, driverCodes: {} } };
  assert.ok(h.CareerBackup.preview(envelope).extras.includes("Standalone season: keep newer local progress"));
  assert.equal(h.CareerBackup.apply(envelope).applied.includes("season"), false);
  assert.equal(h.store.get("season", null).round, 5);
});

test("sprint-stage preservation keeps paid-sprint and zero-point Grand Prix protection", () => {
  for (const options of [{ completedLaps: 2 }, { sprint: false }]) {
    const { h, envelope } = scoredWeekend(options);
    assert.ok(h.CareerBackup.preview(envelope).extras.includes("Standalone season: keep newer local progress"));
    assert.equal(h.CareerBackup.apply(envelope).applied.includes("season"), false);
  }
});

test("sprint-stage protection does not retain an unrelated weekend or replace incoming progress", () => {
  const changes = [
    ["another championship seed", (local, incoming) => { incoming.seed = 99; }],
    ["missing local seed", local => { delete local.seed; }],
    ["invalid local seed", local => { local.seed = "77"; }],
    ["changed calendar", (local, incoming) => { incoming.config.trackIds = ["t0", "t2"]; }],
    ["changed rules", (local, incoming) => { incoming.config.laps = 5; }],
    ["different round", (local, incoming) => { incoming.round = 1; }],
    ["different driver points", (local, incoming) => { incoming.pts["haas:0"] = 1; }],
    ["different team points", (local, incoming) => { incoming.teamPts.haas = 1; }],
    ["different countback", (local, incoming) => { incoming.finishes["haas:0"] = [1]; }],
    ["different round ledger", (local, incoming) => { incoming.roundPts["haas:0"] = [1]; }],
    ["different driver identity", (local, incoming) => { incoming.driverCodes["haas:0"] = "OTHER"; }],
    ["incoming GP stage", (local, incoming) => { incoming.stage = "race"; }],
    ["non-sprint round", (local, incoming) => {
      local.config.sprint = incoming.config.sprint = "rounds";
      local.config.sprintIds = incoming.config.sprintIds = ["t1"];
    }],
  ];
  for (const [name, change] of changes) {
    const { h, envelope, season } = scoredWeekend({ seedBeforeExport: true });
    season.config = JSON.parse(JSON.stringify(season.config));
    change(season, envelope.season);
    h.SeasonCal.save(season);
    assert.ok(h.CareerBackup.preview(envelope).extras.includes("Standalone season: restore backup progress"), name);
    const result = h.CareerBackup.apply(envelope);
    assert.equal(result.ok, true, name);
    assert.equal(result.applied.includes("season"), true, name);
  }
});

test("older backup preserves completed local qualifying, including the first racing seed", () => {
  for (const seed of [undefined, 77]) {
    const h = loadHarness(), weekend = qualifyingWeekend();
    if (seed != null) weekend.seed = seed;
    h.store.set("season", beforeQualifying(weekend));
    const envelope = JSON.parse(h.CareerBackup.serialize(h.CareerBackup.build()));
    // The seed is first assigned when racing starts, possibly after export.
    h.store.set("season", { ...weekend, seed: 77 });
    const revision = h.store.keyRevision("season");
    assert.ok(h.CareerBackup.preview(envelope).extras.includes("Standalone season: keep newer local progress"));
    const result = h.CareerBackup.apply(envelope);
    assert.equal(result.ok, true);
    assert.equal(result.applied.includes("season"), false);
    assert.equal(h.store.keyRevision("season"), revision, "preservation must not rewrite the season");
    assert.equal(h.store.get("season").seed, 77);
    vm.runInContext(src("js/race/quali-model.js"), h.ctx);
    const cars = [0, 1].map((i) => ({ driverId: "haas:" + i, team: { id: "haas" }, isPlayer: i === 0 }));
    const model = h.ctx.Quali.create({ season: h.SeasonCal.load(), seasonMode: true, cars, track: { def: { id: "t0" } } });
    assert.deepEqual(Array.from(model.order(cars), (car) => car.driverId), ["haas:1", "haas:0"]);
    assert.equal(model.results()[1].t, 72.4);
    assert.equal(model.results()[1].human, true);
  }
});

test("qualifying preservation compares progress maps independently of insertion order", () => {
  const h = loadHarness(), weekend = qualifyingWeekend();
  weekend.pts = { "haas:0": 25, "haas:1": 18 };
  const backup = beforeQualifying(weekend);
  backup.pts = { "haas:1": 18, "haas:0": 25 };
  backup.qualiOrder = []; // An empty grid is also no qualifying progress.
  const envelope = envWith({ season: backup });
  h.store.set("season", weekend);
  assert.ok(h.CareerBackup.preview(envelope).extras.includes("Standalone season: keep newer local progress"));
  assert.equal(h.CareerBackup.apply(envelope).ok, true);
  assert.equal(h.store.get("season").qualiOrder[1].t, 72.4);
});

test("qualifying protection does not retain unrelated, stale, incomplete or corrupt grids", () => {
  const cases = [
    ["another championship seed", { seed: 22 }, { seed: 11 }],
    ["missing local championship seed", {}, { seed: 11 }],
    ["changed calendar", {}, { config: { trackIds: ["t0", "t2"], quali: true } }],
    ["changed rules", {}, { config: { trackIds: ["t0", "t1"], quali: true, laps: 5 } }],
    ["later weekend stage", {}, { stage: "race" }],
    ["same points but different driver", { pts: { "haas:0": 10 } }, { pts: { "haas:1": 10 } }],
    ["changed team standings", {}, { teamPts: { haas: 10 } }],
    ["changed driver identity", {}, { driverCodes: { "haas:0": "NEW" } }],
    ["another incoming seat", {}, { qualiSeat: "haas:1|haas" }],
    ["stale track", { qualiTrack: "t1" }, {}],
    ["one-off GP grid", { qualiMode: "gp" }, {}],
    ["career grid", { qualiMode: "career:driver:0" }, {}],
    ["unstamped legacy grid", { qualiTrack: null, qualiMode: null, qualiSeat: null }, {}],
    ["seat outside grid", { qualiSeat: "haas:9|haas" }, {}],
    ["seat stamped for another team", { qualiSeat: "haas:0|other" }, {}],
    ["no classification", { qualiOrder: [] }, {}],
    ["missing teammate", { qualiOrder: [{ id: "haas:0", t: 72.4, human: true }] }, {}],
    ["extra driver", { qualiOrder: [...qualifyingWeekend().qualiOrder, { id: "other:0", t: 75 }] }, {}],
    ["duplicate classification", { qualiOrder: ["haas:0", "haas:0"] }, {}],
    ["invalid time", { qualiOrder: [{ id: "haas:0", t: -1 }] }, {}],
    ["invalid human marker", { qualiOrder: [{ id: "haas:0", human: "yes" }] }, {}],
    ["invalid local seed", { seed: "77" }, {}],
  ];
  for (const [name, localChanges, incomingChanges] of cases) {
    const h = loadHarness(), weekend = qualifyingWeekend();
    h.store.set("season", { ...weekend, ...localChanges });
    const envelope = envWith({ season: { ...beforeQualifying(weekend), ...incomingChanges } });
    assert.ok(h.CareerBackup.preview(envelope).extras.includes("Standalone season: restore backup progress"), name);
    const result = h.CareerBackup.apply(envelope);
    assert.equal(result.ok, true, name);
    assert.ok(result.applied.includes("season"), name);
    assert.equal(h.store.get("season").qualiOrder, undefined, name);
  }
});

test("qualifying completeness follows standalone real/custom/Legends field rules", () => {
  for (const selected of ["haas", "custom", "legends"]) {
    const h = loadHarness(), weekend = qualifyingWeekend();
    h.ctx.Teams.LIST.push(
      { id: "custom", custom: true, drivers: [{ code: "YOU" }] },
      { id: "legends", legends: true, drivers: [{ code: "ONE" }, { code: "TWO" }, { code: "THREE" }] },
    );
    weekend.qualiSeat = selected + ":0|" + selected;
    if (selected !== "haas") weekend.qualiOrder.push({ id: selected + ":0", t: 70, human: true });
    h.store.set("season", weekend);
    const envelope = envWith({ season: beforeQualifying(weekend) });
    assert.ok(h.CareerBackup.preview(envelope).extras.includes("Standalone season: keep newer local progress"), selected);
    assert.equal(h.CareerBackup.apply(envelope).applied.includes("season"), false, selected);
    vm.runInContext(src("js/race/quali-model.js"), h.ctx);
    const cars = weekend.qualiOrder.map(row => ({ driverId: row.id, team: { id: row.id.split(":")[0] },
      isPlayer: row.id === selected + ":0" }));
    const model = h.ctx.Quali.create({ season: h.SeasonCal.load(), seasonMode: true, cars, track: { def: { id: "t0" } } });
    assert.equal(model.results().length, cars.length, selected);
    assert.equal(model.order(cars).length, cars.length, selected);
    // MY TEAM's career hire / another legend never belongs to this field.
    const extra = selected === "haas" ? "custom:0" : selected + ":1";
    h.store.set("season", { ...weekend, qualiOrder: [...weekend.qualiOrder, { id: extra, t: 80 }] });
    assert.ok(h.CareerBackup.preview(envelope).extras.includes("Standalone season: restore backup progress"), extra);
    assert.equal(h.CareerBackup.apply(envelope).applied.includes("season"), true, extra);
  }
});

test("incoming qualifying and later progress replace local qualifying", () => {
  for (const incoming of [
    { ...qualifyingWeekend(), qualiOrder: [{ id: "haas:0", t: 70, human: true }, { id: "haas:1", t: 72, human: false }] },
    { ...beforeQualifying(qualifyingWeekend()), round: 1 },
    { ...beforeQualifying(qualifyingWeekend()), pts: { "haas:0": 25 } },
  ]) {
    const h = loadHarness();
    h.store.set("season", qualifyingWeekend());
    const envelope = envWith({ season: incoming });
    assert.ok(h.CareerBackup.preview(envelope).extras.includes("Standalone season: restore backup progress"));
    assert.equal(h.CareerBackup.apply(envelope).ok, true);
    const restored = h.store.get("season");
    assert.equal(restored.round, incoming.round);
    assert.deepEqual(JSON.parse(JSON.stringify(restored.pts)), incoming.pts);
    assert.deepEqual(restored.qualiOrder && JSON.parse(JSON.stringify(restored.qualiOrder)), incoming.qualiOrder);
  }
});

test("malformed qualifying classifications refuse the whole backup before slot or season writes", () => {
  const valid = { round: 0, pts: {}, qualiOrder: [{ id: "haas:0", t: 71.2, human: true }],
    qualiTrack: "t0", qualiMode: "season", qualiSeat: "haas:0|haas" };
  const cases = [
    { qualiOrder: {} }, { qualiOrder: [null] }, { qualiOrder: [["haas:0"]] },
    { qualiOrder: ["haas:0", { id: "haas:0", t: 72 }] },
    { qualiOrder: Array.from({ length: 121 }, (_, i) => "driver:" + i) },
    { qualiOrder: [{ id: "bad id", t: 71 }] }, { qualiOrder: [{ id: "x".repeat(49), t: 71 }] },
    ...[-1, 1e6 + 1, Infinity, NaN, "71.2", null].map((t) => ({ qualiOrder: [{ id: "haas:0", t }] })),
    { qualiOrder: [{ id: "haas:0", human: "yes" }] }, { qualiOrder: [{ id: "haas:0", noTime: 1 }] },
    { qualiTrack: "x".repeat(49) }, { qualiMode: "career:driver:99" }, { qualiMode: {} },
    { qualiSeat: "haas:0" }, { qualiSeat: "haas:0|haas|other" },
  ];
  for (const bad of cases) {
    const h = loadHarness();
    h.Career.start({ teamId: "haas", seed: 1 });
    h.store.set("season", { round: 0, pts: { "haas:0": 10 } });
    const before = Array.from(h.disk.entries());
    const envelope = { format: h.CareerBackup.FORMAT,
      slots: [{ flavour: "driver", i: 1, data: save({ money: 987 }) }], season: { ...valid, ...bad } };
    const result = h.CareerBackup.apply(envelope);
    assert.equal(result.ok, false, JSON.stringify(bad));
    assert.equal(result.reason, "season-invalid");
    assert.deepEqual(Array.from(h.disk.entries()), before, "refusal cannot partially restore other saves");
  }
});

test("import unions badges and keeps a standalone season that is further along", () => {
  const a = loadHarness();
  a.disk.set("apex26.career.driver.0", JSON.stringify(save({ money: 111 })));
  a.disk.set("apex26.badges", JSON.stringify({ v: 1, got: { first_win: 50, pole: 10 } }));
  a.disk.set("apex26.season", JSON.stringify({ round: 1, pts: { "haas:0": 25 }, teamPts: {}, driverCodes: {} }));
  a.Career.load();
  const envelope = a.CareerBackup.build();

  const b = loadHarness();
  b.disk.set("apex26.badges", JSON.stringify({ v: 1, got: { first_win: 20, champion: 30 } }));
  b.disk.set("apex26.season", JSON.stringify({ round: 20, pts: { "haas:0": 400 }, teamPts: {}, driverCodes: {} }));
  b.Career.load();
  assert.equal(b.CareerBackup.apply(JSON.parse(JSON.stringify(envelope)), { focusFlavour: "driver" }).ok, true);
  assert.deepEqual(JSON.parse(b.disk.get("apex26.badges")).got,
    { first_win: 20, pole: 10, champion: 30 }, "badges must be a union, earliest unlock kept");
  assert.equal(JSON.parse(b.disk.get("apex26.season")).round, 20, "a later local season was replaced");

  // Same round, more local points: still the local one.
  const c = loadHarness();
  c.disk.set("apex26.season", JSON.stringify({ round: 1, pts: { "haas:0": 26 }, teamPts: {}, driverCodes: {} }));
  c.Career.load();
  c.CareerBackup.apply(JSON.parse(JSON.stringify(envelope)), { focusFlavour: "driver" });
  assert.equal(JSON.parse(c.disk.get("apex26.season")).pts["haas:0"], 26);

  // A local season BEHIND the backup's takes the backup's; no local badges take the backup's.
  const d = loadHarness();
  d.disk.set("apex26.season", JSON.stringify({ round: 0, pts: {}, teamPts: {}, driverCodes: {} }));
  d.Career.load();
  d.CareerBackup.apply(JSON.parse(JSON.stringify(envelope)), { focusFlavour: "driver" });
  assert.equal(JSON.parse(d.disk.get("apex26.season")).pts["haas:0"], 25);
  assert.deepEqual(JSON.parse(d.disk.get("apex26.badges")).got, { first_win: 50, pole: 10 });
});

// review-race-career-data #7: liveConflict compared Career.slotRevision() —
// the store's CURRENT revision of the same key — with itself, so a write to the
// live slot that did not raise conflicted() (here: a local, non-Career writer)
// was overwritten by the import. It now compares the revision Career ARMED.
test("import refuses the live slot once its revision moved past the one Career armed", () => {
  const h = loadHarness();
  fillSix(h);
  h.Career.engage(true);
  const envelope = h.CareerBackup.build();
  const liveKey = "apex26.career.driver.0";
  assert.equal(h.Career.armedRevision(), h.CareerBackup.revisionOf("driver", 0), "armed at load");
  h.store.write("career.driver.0", save({ flavour: "driver", money: 777, round: 7 }));
  assert.equal(h.Career.conflicted(), false, "a local write does not flag the career");
  assert.notEqual(h.Career.armedRevision(), h.CareerBackup.revisionOf("driver", 0));
  const applied = h.CareerBackup.apply(JSON.parse(JSON.stringify(envelope)), { otherFlavourConfirmed: true });
  assert.equal(applied.ok, false);
  assert.equal(applied.reason, "conflict");
  assert.equal(applied.slot, "driver:0");
  assert.equal(JSON.parse(h.disk.get(liveKey)).money, 777, "the newer live save must stay");
});

// review-race-career-data #8: daily.v1 and records were written wholesale, so
// importing last week's backup reset today's streak and per-day bests.
test("import merges the daily challenge per day and keeps the later streak; records only fill gaps", () => {
  const a = loadHarness();
  a.disk.set("apex26.career.driver.0", JSON.stringify(save({ money: 111 })));
  a.disk.set("apex26.daily.v1", JSON.stringify({
    days: { "2026-09-20": { best: 80.5, laps: 3 }, "2026-09-21": { best: 79.9, laps: 2, classes: { standard: { best: 79.9, laps: 2 } } } },
    streak: { count: 2, last: "2026-09-21" },
  }));
  a.disk.set("apex26.records", JSON.stringify({ bahrain: { t: 90 }, monza: { t: 80 } }));
  a.Career.load();
  const envelope = a.CareerBackup.build();

  const b = loadHarness();
  b.disk.set("apex26.daily.v1", JSON.stringify({
    days: { "2026-09-21": { best: 81.2, laps: 5, classes: { standard: { best: 81.2, laps: 4 }, open: { best: 78, laps: 1 } } },
      "2026-10-03": { best: 77.7, laps: 1 } },
    streak: { count: 9, last: "2026-10-03" },
  }));
  b.disk.set("apex26.records", JSON.stringify({ monza: { t: 85 } }));
  b.Career.load();
  assert.equal(b.CareerBackup.apply(JSON.parse(JSON.stringify(envelope)), { focusFlavour: "driver" }).ok, true);
  const daily = JSON.parse(b.disk.get("apex26.daily.v1"));
  assert.deepEqual(daily.streak, { count: 9, last: "2026-10-03" }, "the later streak survives an older backup");
  assert.deepEqual(daily.days["2026-10-03"], { best: 77.7, laps: 1 }, "a day the backup lacks stays");
  assert.deepEqual(daily.days["2026-09-20"], { best: 80.5, laps: 3 }, "a day only the backup has is restored");
  assert.equal(daily.days["2026-09-21"].best, 79.9, "the faster best of the two");
  assert.equal(daily.days["2026-09-21"].laps, 5, "the larger lap count");
  assert.deepEqual(daily.days["2026-09-21"].classes, {
    standard: { best: 79.9, laps: 4 }, open: { best: 78, laps: 1 },
  }, "per-class bests merge the same way");
  assert.deepEqual(JSON.parse(b.disk.get("apex26.records")), { bahrain: { t: 90 }, monza: { t: 85 } },
    "records: the backup fills what is missing, never replaces a local entry");

  // The backup's streak wins when it is the later one; no local daily takes the backup's.
  const c = loadHarness();
  c.disk.set("apex26.daily.v1", JSON.stringify({ days: {}, streak: { count: 1, last: "2026-09-01" } }));
  c.Career.load();
  c.CareerBackup.apply(JSON.parse(JSON.stringify(envelope)), { focusFlavour: "driver" });
  assert.deepEqual(JSON.parse(c.disk.get("apex26.daily.v1")).streak, { count: 2, last: "2026-09-21" });
  const d = loadHarness();
  d.Career.load();
  d.CareerBackup.apply(JSON.parse(JSON.stringify(envelope)), { focusFlavour: "driver" });
  assert.equal(JSON.parse(d.disk.get("apex26.daily.v1")).streak.count, 2);
});

test("malformed history / offers / moves / roster rows import without crashing career", () => {
  const h = loadHarness();
  const driver = Object.assign(save(), {
    history: [null, 3, "x", [1], { year: 2025, pos: 1, wins: 2 }],
    offers: [null, { team: "haas" }], moves: [7, { id: "m" }],
  });
  const team = Object.assign(save({ flavour: "myteam", team: "haas" }), { roster: {} });
  const envelope = { format: "apex26-career-backup-v1", slots: [
    { flavour: "driver", i: 0, data: driver }, { flavour: "myteam", i: 0, data: team },
  ] };
  const r = h.CareerBackup.apply(JSON.parse(JSON.stringify(envelope)), { otherFlavourConfirmed: true });
  assert.equal(r.ok, true);
  const d0 = JSON.parse(h.disk.get("apex26.career.driver.0"));
  assert.deepEqual(d0.history, [{ year: 2025, pos: 1, wins: 2 }]);
  assert.deepEqual(d0.offers, [{ team: "haas" }]);
  assert.deepEqual(d0.moves, [{ id: "m" }]);
  assert.equal(JSON.parse(h.disk.get("apex26.career.myteam.0")).roster, null);
  const rows = h.Career.slots();
  assert.equal(rows.find((s) => s.flavour === "driver" && s.i === 0).titles, 1);
  // MY TEAM: settleRound sums the roster's wages — `{}` threw there.
  h.disk.set("apex26.careerSlot", JSON.stringify("myteam:0"));
  h.Career.load();
  h.Career.engage(true);
  assert.doesNotThrow(() => h.Career.settleRound([{ team: { id: "haas" } }], { team: { id: "haas" } }));
});

test("career imports keep only catalog part IDs and fitted category options", () => {
  const h = loadHarness();
  h.ctx.Parts.CATALOG = [
    { id: "engine", options: [{ id: "engine-stock" }, { id: "engine-race" }] },
    { id: "tyres", options: [{ id: "tyres-soft" }] },
  ];
  const incoming = Object.assign(save(), {
    owned: ["engine-race", "engine-race", "future-part", 7, "tyres-soft"],
    fitted: { engine: "engine-race", tyres: "future-tyres", future: "engine-race", __proto__: { bad: true } },
  });
  const r = h.CareerBackup.apply({ format: "apex26-career-backup-v1", slots: [
    { flavour: "driver", i: 0, data: incoming },
  ] }, { otherFlavourConfirmed: true });
  assert.equal(r.ok, true);
  const stored = JSON.parse(h.disk.get("apex26.career.driver.0"));
  assert.deepEqual(stored.owned, ["engine-race", "tyres-soft"]);
  assert.deepEqual(stored.fitted, { engine: "engine-race" });
});

/* ── MY TEAM identity (global garage keys a myteam save only points at) ── */

const LOGO = "data:image/png;base64,iVBORw0KGgo=";
const MY_TEAM = {
  id: "custom", custom: true, name: "Murrin GP", short: "MGP",
  color: [0.1, 0.2, 0.9], color2: [1, 1, 1],
  drivers: [{ name: "Bryce", code: "BRY", num: 7 }, { name: "Alex", code: "ALX", num: 8 }],
};
const MY_LIVERIES = [{ id: "u1", name: "NIGHT", c1: [0, 0, 0], c2: [1, 0, 0] }];

function deviceA() {
  const a = loadHarness();
  a.disk.set("apex26.career.myteam.0", JSON.stringify(save({ flavour: "myteam", team: "custom", money: 5150 })));
  a.disk.set("apex26.customTeam", JSON.stringify(MY_TEAM));
  a.disk.set("apex26.customLogo", JSON.stringify(LOGO));
  a.disk.set("apex26.livery.custom.custom", JSON.stringify(MY_LIVERIES));
  a.disk.set("apex26.livery.custom", JSON.stringify("u1"));
  a.Career.load();
  return a;
}

test("MY TEAM backups carry per-slot identity and never replace the one-off GP identity", () => {
  const envelope = JSON.parse(JSON.stringify(deviceA().CareerBackup.build()));
  assert.equal(envelope.myTeam, undefined, "new exports do not carry global shared identity");
  const identity = envelope.slots.find((r) => r.flavour === "myteam" && r.i === 0).data.myTeamIdentity;
  assert.equal(identity.customTeam.name, "Murrin GP");
  assert.equal(identity.customLogo, LOGO);
  assert.deepEqual(identity["livery.custom.custom"], MY_LIVERIES);
  assert.equal(identity["livery.custom"], "u1");
  const b = loadHarness();
  b.store.set("customTeam", { name: "GP ONLY", drivers: [{ name: "G", code: "GPO" }] });
  const r = b.CareerBackup.apply(envelope, { focusFlavour: "myteam" });
  assert.equal(r.ok, true);
  assert.equal(b.store.get("career.myteam.0").myTeamIdentity.customTeam.name, "Murrin GP");
  assert.equal(b.store.get("customTeam").name, "GP ONLY");
  assert.deepEqual([...r.identity], [], "no global keys written");
  b.Career.engage(true);
  assert.equal(b.Career.identityValue("customTeam", null).name, "Murrin GP");
  b.Career.engage(false);
  assert.equal(b.Career.identityValue("customTeam", b.store.get("customTeam")).name, "GP ONLY");
});

test("a driver-only or identity-less backup never erases a local MY TEAM identity", () => {
  const local = { name: "Local Racing", drivers: [{ name: "L", code: "LOC", num: 3 }] };
  const seed = (h) => {
    h.disk.set("apex26.customTeam", JSON.stringify(local));
    h.disk.set("apex26.customLogo", JSON.stringify(LOGO));
    h.disk.set("apex26.livery.custom.custom", JSON.stringify(MY_LIVERIES));
    h.Career.load();
  };
  // Driver-only backup built on a device that HAS an identity: no myTeam block.
  const a = loadHarness();
  seed(a);
  a.disk.set("apex26.career.driver.0", JSON.stringify(save({ money: 1 })));
  a.Career.load();
  const driverOnly = a.CareerBackup.build();
  assert.equal(driverOnly.myTeam, undefined, "driver-only backup carries an identity");

  // An older backup with a MY TEAM slot but no myTeam block stays valid.
  const older = deviceA().CareerBackup.build();
  delete older.myTeam;
  for (const row of older.slots) if (row.data) delete row.data.myTeamIdentity;
  assert.equal(deviceA().CareerBackup.validate(JSON.parse(JSON.stringify(older))).ok, true);

  // A myTeam block riding a DRIVER-only import is not applied either.
  const smuggled = JSON.parse(JSON.stringify(driverOnly));
  smuggled.myTeam = { customTeam: MY_TEAM, customLogo: null };

  for (const env of [driverOnly, older, smuggled]) {
    const b = loadHarness();
    seed(b);
    const r = b.CareerBackup.apply(JSON.parse(JSON.stringify(env)), { otherFlavourConfirmed: true });
    assert.equal(r.ok, true);
    assert.equal(JSON.parse(b.disk.get("apex26.customTeam")).name, "Local Racing");
    assert.equal(JSON.parse(b.disk.get("apex26.customLogo")), LOGO);
    assert.deepEqual(JSON.parse(b.disk.get("apex26.livery.custom.custom")), MY_LIVERIES);
  }

  // A partial myTeam (team only) leaves the local logo / liveries alone.
  const partial = deviceA().CareerBackup.build();
  partial.myTeam = { customTeam: MY_TEAM };
  const p = loadHarness();
  seed(p);
  assert.equal(p.CareerBackup.apply(JSON.parse(JSON.stringify(partial)), { focusFlavour: "myteam" }).ok, true);
  assert.equal(JSON.parse(p.disk.get("apex26.customTeam")).name, "Local Racing");
  assert.equal(p.store.get("career.myteam.0").myTeamIdentity.customTeam.name, "Murrin GP");
  assert.equal(JSON.parse(p.disk.get("apex26.customLogo")), LOGO);
  assert.deepEqual(JSON.parse(p.disk.get("apex26.livery.custom.custom")), MY_LIVERIES);
});

test("garbage MY TEAM identity values are dropped without throwing", () => {
  const base = deviceA().CareerBackup.build();
  const notObj = JSON.parse(JSON.stringify(base));
  notObj.myTeam = [1, 2];
  assert.equal(loadHarness().CareerBackup.validate(notObj).reason, "myteam-not-object");
  notObj.myTeam = "x";
  assert.equal(loadHarness().CareerBackup.apply(notObj, { focusFlavour: "myteam" }).ok, false);

  const garbage = JSON.parse(JSON.stringify(base));
  garbage.myTeam = {
    customTeam: { name: "No Drivers" },            // no roster → rejected
    customLogo: "javascript:alert(1)",               // not a data:image → rejected
    "livery.custom.custom": [{ id: 5 }, null, "x"],  // no sound row → [] → skipped
    "livery.custom": { evil: true },                 // not an id string
    "career.driver.0": { money: 1e9 },               // not an identity key → ignored
  };
  const b = loadHarness();
  b.disk.set("apex26.customLogo", JSON.stringify(LOGO));
  b.disk.set("apex26.livery.custom.custom", JSON.stringify(MY_LIVERIES));
  b.Career.load();
  let r;
  assert.doesNotThrow(() => { r = b.CareerBackup.apply(garbage, { focusFlavour: "myteam" }); });
  assert.equal(r.ok, true);
  assert.deepEqual([...r.identity], []);
  assert.equal(b.disk.has("apex26.customTeam"), false);
  assert.equal(JSON.parse(b.disk.get("apex26.customLogo")), LOGO);
  assert.deepEqual(JSON.parse(b.disk.get("apex26.livery.custom.custom")), MY_LIVERIES);
  assert.equal(b.disk.has("apex26.livery.custom"), false);
  assert.equal(b.disk.has("apex26.career.driver.0"), false);

  // Without the GARAGE gate loaded nothing is written — never an unchecked value.
  const n = loadHarness({ settingsExport: false });
  assert.equal(n.CareerBackup.apply(JSON.parse(JSON.stringify(base)), { focusFlavour: "myteam" }).identity.length, 0);
  assert.equal(n.disk.has("apex26.customTeam"), false);
});

/* ── mini-dom UI: EXPORT / IMPORT on slot cards ─────────────────────────── */

function bootBackupUi(options = {}) {
  const dom = makeDom({
    tagFor: (id) => (/^(cr-back|cr-go|cr-garage|co-back|ch-back|cg-back)$/.test(id) ? "button" : "div"),
  });
  const used = (code, teamName) => ({
    used: true, code, teamName, year: 2026, round: 2, rounds: 24,
    money: 1234, seasons: 1, wins: 0, titles: 0,
  });
  const data = {
    driver: [used("YOU", "Haas"), { used: false }, { used: false }],
    myteam: [{ used: false }, { used: false }, { used: false }],
  };
  let ptr = { flavour: "driver", i: 0 };
  const Career = options.Career || {
    SLOTS: 3, FLAVOURS: ["driver", "myteam"],
    slots: (fl) => (fl ? [fl] : Career.FLAVOURS).flatMap((f) => data[f].map((s, i) =>
      ({ ...s, flavour: f, i, live: !!s.used && ptr.flavour === f && ptr.i === i }))),
    slot: () => ({ ...ptr }),
    useSlot: (f, i) => { ptr = { flavour: f, i }; },
    firstFree: (f) => data[f].findIndex((s) => !s.used),
    slotRevision: (f, i) => `${f}:${i}:1`,
    deleteSlot: () => ({ ok: true, durable: true, reason: null }),
    active: () => true, data: () => ({ flavour: "driver" }), load: () => null,
    conflicted: () => false, seasonDone: () => false,
  };
  const exports = [];
  const CareerBackup = options.CareerBackup || {
    MAX_BYTES: 5 * 1024 * 1024,
    exportAll: async () => { exports.push(1); return { ok: true }; },
    validate: () => ({ ok: true }),
    apply: () => ({ ok: true, written: [], needsConfirm: false }),
  };
  const notices = [];
  const G = {
    $: (id) => dom.byId(id), els: { overlay: dom.byId("overlay") },
    soundOn: false, flow: "gp", session: "race", season: null,
    store: { get: (k, d) => d, set() {} },
    cssCol: () => "#fff", openCareer() {}, openGarage() {}, openRaceSettings() {},
    refreshCareerButton() {}, qualiClear() {}, announce: (text) => notices.push(text),
    armConfirm: (btn, txt, act) => { act(); return true; },
  };
  const sb = {
    Math, console, Object, Array, Number, String, JSON, Map, Set, Date,
    parseFloat, parseInt, isFinite,
    Log: { info() {}, warn() {}, debug() {}, error() {}, enabled: () => false },
    document: dom.document, window: null,
    addEventListener() {}, removeEventListener() {},
    setTimeout: () => 0, clearTimeout() {},
    GameAudio: { uiTick() {}, uiSelect() {}, uiReject() {}, init() {} },
    ScrollFade: { refresh() {} },
    Career, CareerBackup,
    Teams: {
      LIST: [{ id: "haas", name: "Haas", short: "HAA", tier: 4, engine: "Ferrari",
        color: [1, 1, 1], color2: [0, 0, 0],
        stats: { speed: 78, accel: 80, cornering: 79, braking: 81 },
        drivers: [{ name: "A", code: "AAA", num: 1 }, { name: "B", code: "BBB", num: 2 }] }],
      POINTS: [25, 18, 15, 12, 10, 8, 6, 4, 2, 1],
      isReal: (t) => !!t && !t.custom && !t.legends,
    },
    DriverRatings: { get: () => ({ pace: 70, craft: 60 }), AXES: ["pace"] },
    Parts: { CATALOG: [], getCost: () => 0 },
    Tracks: { SEASON: [{ name: "Bahrain", country: "BHR" }] },
    GameStore: { seasonDriverId: (t, i) => t + ":" + i, store: options.store },
    SeasonCal: { hasProgress: () => false, rounds: () => 24, load: () => null },
    Reliability: { REASONS: ["engine"], TIER_RISK: [0.02] },
    PhysicsConsts: { DIFF: { EASY: 1 } },
  };
  sb.window = sb;
  vm.runInNewContext(DOM_SOURCE, sb, { filename: "js/ui/dom.js" });
  vm.runInNewContext(src("js/career/career-ui.js"), sb, { filename: "js/career/career-ui.js" });
  const ui = sb.CareerScreen.create(G);
  ui.openSlots();

  function clickImport(side = "left") {
    const button = G.$("cr-" + side).querySelector('[data-cr-act="import"]');
    assert.ok(button);
    // mini-dom does not clear children on textContent="", unlike the browser.
    G.$("cr-left").replaceChildren(); G.$("cr-right").replaceChildren();
    button.onclick({ stopPropagation() {} });
  }
  async function selectBackup(envelope, side = "left") {
    clickImport(side);
    const picker = dom.document.body.querySelector("input");
    const text = JSON.stringify(envelope);
    picker.files = [{ size: text.length, text: async () => text }];
    picker.onchange();
    await Promise.resolve();
    await Promise.resolve();
  }
  return { G, dom, ui, exports, notices, clickImport, selectBackup };
}

test("career slot cards expose EXPORT and IMPORT buttons", () => {
  const { G, exports } = bootBackupUi();
  const left = G.$("cr-left");
  const acts = left.querySelectorAll("[data-cr-act]").map((n) => n.textContent);
  assert.ok(acts.includes("EXPORT"), "used slot must offer EXPORT");
  assert.ok(acts.includes("IMPORT"), "slot cards must offer IMPORT");
  const dels = left.querySelectorAll(".cr-slot-del").map((n) => n.textContent);
  assert.deepEqual(dels, ["DELETE"], "cr-slot-del is DELETE-only (never EXPORT/IMPORT)");

  const expBtn = left.querySelector('[data-cr-act="export"]');
  assert.ok(expBtn);
  expBtn.onclick({ stopPropagation() {} });
  assert.equal(exports.length, 1, "EXPORT calls CareerBackup.exportAll");

  // Empty slots still get IMPORT (restore into an empty card).
  const right = G.$("cr-right");
  const emptyActs = right.querySelectorAll("[data-cr-act]").map((n) => n.textContent);
  assert.ok(emptyActs.includes("IMPORT"));
  assert.ok(!emptyActs.includes("EXPORT"), "empty slots do not EXPORT");
  assert.equal(right.querySelectorAll(".cr-slot-del").length, 0, "empty slots have no DELETE");
});


test("IMPORT confirmation keeps the reviewed revision and previews backup destinations", async () => {
  const h = loadHarness();
  h.Career.start({ teamId: "haas", seed: 1 });
  h.store.set("career.driver.1", save({ money: 100 }));
  const envelope = { format: h.CareerBackup.FORMAT,
    slots: [{ flavour: "driver", i: 1, data: save({ money: 50, year: 2027, round: 2 }) }] };
  const ui = bootBackupUi(h);
  await ui.selectBackup(envelope);
  assert.equal(ui.G.$("cr-left").querySelector('[data-cr-act="import"]').textContent, "IMPORT?");
  const preview = ui.G.$("cr-left").querySelectorAll(".cr-note").map((n) => n.textContent).join(" ");
  assert.match(preview, /Driver career · Destination slot 2/);
  assert.match(preview, /Current: 2026 · Haas · 1 rounds completed/);
  assert.match(preview, /Backup: 2027 · Haas · 2 rounds completed/);
  assert.equal(h.store.get("career.driver.1").money, 100, "review does not apply the backup");
  h.disk.set("apex26.career.driver.1", JSON.stringify(save({ money: 200 })));
  h.foreign("apex26.career.driver.1");
  ui.clickImport();
  assert.equal(ui.notices.at(-1), "SAVE CONFLICT — IMPORT REFUSED");
  assert.equal(JSON.parse(h.disk.get("apex26.career.driver.1")).money, 200);
});

test("backup preview follows mode/extras scope and explains shared identity without writing", () => {
  const h = deviceA();
  const envelope = JSON.parse(JSON.stringify(h.CareerBackup.build()));
  envelope.badges = { earned: ["a"] };
  envelope.daily = { days: {} };
  envelope.records = { laps: 1 };
  const before = JSON.stringify([...h.disk]);
  const first = h.CareerBackup.preview(envelope, { focusFlavour: "driver" });
  assert.equal(first.slots.length, 0);
  assert.ok(first.extras.some(s => s.includes("Licence badges")));
  assert.ok(!first.extras.some(s => s.includes("identity")));
  const second = h.CareerBackup.preview(envelope, { flavours: ["myteam"], includeProgressExtras: false });
  assert.equal(second.slots.length, 1);
  assert.equal(second.extras.length, 1);
  assert.match(second.extras[0], /MY TEAM identity: restore separately with each imported career/);
  assert.equal(h.CareerBackup.preview(envelope, { includeExtras: false }).extras.length, 1, "slot-owned identity still accompanies the slot");
  assert.equal(JSON.stringify([...h.disk]), before);
});

test("slot and extras quota failures preserve session success but never claim confirmed saving", async () => {
  for (const failedKey of ["career.driver.1", "badges", "daily.v1", "records", "season"]) {
    const h = loadHarness();
    const envelope = { format: h.CareerBackup.FORMAT,
      slots: [{ flavour: "driver", i: 1, data: save({ money: 50 }) }],
      badges: { earned: ["a"] }, daily: { days: {} }, records: { laps: 1 }, season: { round: 1 } };
    const put = h.ctx.localStorage.setItem;
    h.ctx.localStorage.setItem = (k, v) => {
      if (k === "apex26." + failedKey) throw Object.assign(new Error("full"), { name: "QuotaExceededError" });
      put(k, v);
    };
    const result = h.CareerBackup.apply(envelope, { focusFlavour: "driver" });
    assert.equal(result.ok, true, failedKey);
    assert.equal(result.durable, false, failedKey);
    assert.equal(result.failed, 1, failedKey);
    assert.equal(result.issues[0].key, failedKey);
    assert.equal(h.store.get("career.driver.1").money, 50);
    assert.equal(h.disk.has("apex26." + failedKey), false);
    const ui = bootBackupUi(h);
    await ui.selectBackup(envelope);
    ui.clickImport();
    assert.match(ui.notices.at(-1), /RESTORED FOR THIS SESSION — SAVE NOT CONFIRMED; KEEP YOUR BACKUP/);
  }
});

test("a rejected extra after slot restoration reports partial application", async () => {
  const h = loadHarness();
  const write = h.store.write;
  h.store.write = function (key, value, options) {
    return key === "badges" ? { ok: false, durable: false, reason: "refused" } : write.call(this, key, value, options);
  };
  const envelope = { format: h.CareerBackup.FORMAT,
    slots: [{ flavour: "driver", i: 1, data: save({ money: 75 }) }], badges: { earned: ["a"] } };
  const ui = bootBackupUi(h);
  await ui.selectBackup(envelope);
  ui.clickImport();
  assert.equal(h.store.get("career.driver.1").money, 75);
  assert.equal(h.store.get("badges", null), null);
  assert.equal(ui.notices.at(-1), "RESTORE INCOMPLETE — SOME DATA APPLIED; KEEP YOUR BACKUP");
});

test("slot-owned MY TEAM identity contributes to slot restore durability", () => {
  const envelope = JSON.parse(JSON.stringify(deviceA().CareerBackup.build()));
  const h = loadHarness(), put = h.ctx.localStorage.setItem;
  h.ctx.localStorage.setItem = (k, v) => {
    if (k === "apex26.career.myteam.0") throw Object.assign(new Error("full"), { name: "QuotaExceededError" });
    put(k, v);
  };
  const result = h.CareerBackup.apply(envelope, { focusFlavour: "myteam" });
  assert.equal(result.ok, true);
  assert.equal(result.durable, false);
  assert.equal(result.issues[0].key, "career.myteam.0");
  assert.equal(h.store.get("career.myteam.0").myTeamIdentity.customTeam.name, "Murrin GP");
  assert.equal(h.disk.has("apex26.career.myteam.0"), false);
  assert.equal(h.disk.has("apex26.customTeam"), false);
});

test("the other-mode preview names the incoming team and retains an earlier saving warning", async () => {
  const a = deviceA(); a.store.set("career.driver.1", save());
  const envelope = JSON.parse(JSON.stringify(a.CareerBackup.build()));
  const h = loadHarness(), put = h.ctx.localStorage.setItem;
  h.ctx.localStorage.setItem = (k, v) => {
    if (k === "apex26.career.driver.1") throw Object.assign(new Error("full"), { name: "QuotaExceededError" });
    put(k, v);
  };
  const ui = bootBackupUi(h);
  await ui.selectBackup(envelope);
  ui.clickImport();
  const notes = ui.G.$("cr-left").querySelectorAll(".cr-note").map(n => n.textContent).join(" ");
  assert.match(notes, /press ALL MODES\? to apply/);
  assert.match(notes, /Backup: 2026 · Murrin GP/);
  h.ctx.localStorage.setItem = put;
  ui.clickImport();
  assert.match(ui.notices.at(-1), /SAVE NOT CONFIRMED; KEEP YOUR BACKUP/);
  assert.equal(h.store.get("career.myteam.0").money, 5150);
});

for (const focus of ["driver", "myteam"]) {
  test(`ALL MODES after ${focus} imports only the remaining mode and preserves later progress`, async () => {
    const a = deviceA();
    a.store.set("career.driver.0", save({ money: 123 }));
    a.store.set("daily.v1", { best: 10 });
    a.store.set("records", { laps: 1 });
    const envelope = JSON.parse(JSON.stringify(a.CareerBackup.build()));
    const h = loadHarness();
    const ui = bootBackupUi(h);
    const side = focus === "driver" ? "left" : "right";
    await ui.selectBackup(envelope, side);
    ui.clickImport(side);
    assert.equal(ui.notices.at(-1), "CAREER RESTORED — CONFIRM OTHER MODE?");
    const other = focus === "driver" ? "myteam" : "driver";
    assert.equal(h.disk.has(`apex26.career.${other}.0`), false);
    const key = `career.${focus}.0`;
    const progressed = h.store.get(key);
    progressed.money = 9999;
    h.store.set(key, progressed);
    h.store.set("daily.v1", { best: 20 });
    h.store.set("records", { laps: 2 });
    ui.clickImport(side);
    assert.equal(ui.notices.at(-1), "CAREER RESTORED");
    assert.equal(h.store.get(key).money, 9999, "the first mode is never replayed");
    assert.equal(h.store.get(`career.${other}.0`).money, other === "myteam" ? 5150 : 123);
    assert.equal(h.store.get("daily.v1").best, 20, "shared progress is not replayed either");
    assert.equal(h.store.get("records").laps, 2);
    assert.equal(h.store.get("career.myteam.0").myTeamIdentity.customTeam.name, "Murrin GP", "identity accompanies only its career slot");
    assert.equal(h.store.get("customTeam", null), null, "one-off GP appearance is not repainted");
  });
}

test("ALL MODES refuses changes to the remaining mode since file selection", async () => {
  const envelope = JSON.parse(JSON.stringify(deviceA().CareerBackup.build()));
  envelope.slots.push({ flavour: "driver", i: 1, data: save({ money: 123 }) });
  // build() already includes empty rows; use its existing driver destination.
  envelope.slots = envelope.slots.filter((row) => row.data != null);
  const h = loadHarness();
  h.Career.start({ teamId: "haas", seed: 1 });
  const ui = bootBackupUi(h);
  await ui.selectBackup(envelope);
  ui.clickImport();
  h.disk.set("apex26.career.myteam.0", JSON.stringify(save({ flavour: "myteam", team: "custom", money: 8000 })));
  h.foreign("apex26.career.myteam.0");
  ui.clickImport();
  assert.equal(ui.notices.at(-1), "SAVE CONFLICT — IMPORT REFUSED");
  assert.equal(h.store.get("career.myteam.0").money, 8000);
  assert.equal(h.store.get("customTeam", null), null, "conflicted import cannot replace team identity");
});

test("the MY TEAM replacement market does not offer a departed driver", () => {
  const h = loadHarness();
  h.Career.start({ flavour: "myteam", teamId: "haas", seed: 2, hire: "DVL" });
  h.Career.engage(true);
  const departed = h.Career.data().roster[0];
  departed.pending = { kind: "left", ask: 0 };
  h.Career.save();
  h.Career.load();
  assert.equal(h.Career.hireDriver(departed.code, 1), false, "departure survives reload");
  const ui = bootBackupUi(h);
  ui.G.$("cr-left").replaceChildren(); ui.G.$("cr-right").replaceChildren();
  ui.ui.openHub();
  const names = ui.G.$("cr-right").querySelectorAll(".cr-seat-role").map((n) => n.textContent);
  assert.ok(names.length > 0, "other drivers remain available");
  assert.ok(!names.includes(departed.name), "the driver who has left cannot be picked again");
  const replacement = ui.G.$("cr-right").querySelector(".cr-seat");
  ui.G.$("cr-left").replaceChildren(); ui.G.$("cr-right").replaceChildren();
  replacement.onclick();
  assert.equal(h.Career.hirePending(), null);
  assert.notEqual(h.Career.data().roster[0].code, departed.code);
});


test("IMPORT leaves a changed empty backup destination alone while restoring populated slots", async () => {
  const a = loadHarness();
  a.store.set("career.driver.0", save({ money: 50 }));
  const envelope = JSON.parse(JSON.stringify(a.CareerBackup.build()));
  const h = loadHarness();
  const ui = bootBackupUi(h);
  await ui.selectBackup(envelope);
  h.disk.set("apex26.career.driver.1", JSON.stringify(save({ money: 200 })));
  h.foreign("apex26.career.driver.1");
  ui.clickImport();
  assert.equal(ui.notices.at(-1), "CAREER RESTORED");
  assert.equal(h.store.get("career.driver.0").money, 50);
  assert.equal(h.store.get("career.driver.1").money, 200, "a null row neither overwrites nor conflicts");
});


for (const focus of ["driver", "myteam"]) {
  for (const peerWrite of [false, true]) {
    test(`ALL MODES after ${focus} preserves an active other-mode revision${peerWrite ? " and refuses a peer edit" : " until confirmation"}`, async () => {
      const a = deviceA();
      a.store.set("career.driver.0", save({ money: 123 }));
      const envelope = JSON.parse(JSON.stringify(a.CareerBackup.build()));
      const h = loadHarness();
      const other = focus === "driver" ? "myteam" : "driver";
      h.Career.start({ flavour: other, teamId: "haas", seed: 1 });
      const otherKey = `career.${other}.0`;
      const before = h.disk.get("apex26." + otherKey);
      const revision = h.Career.slotRevision(other, 0);
      const ui = bootBackupUi(h);
      const side = focus === "driver" ? "left" : "right";
      await ui.selectBackup(envelope, side);
      ui.clickImport(side);
      assert.equal(ui.notices.at(-1), "CAREER RESTORED — CONFIRM OTHER MODE?");
      assert.equal(h.Career.slotRevision(other, 0), revision, "refresh must not re-save the unconfirmed live mode");
      assert.equal(h.disk.get("apex26." + otherKey), before);
      if (peerWrite) {
        const peer = JSON.parse(before);
        peer.money = 8000;
        h.disk.set("apex26." + otherKey, JSON.stringify(peer));
        h.foreign("apex26." + otherKey);
      }
      ui.clickImport(side);
      assert.equal(ui.notices.at(-1), peerWrite ? "SAVE CONFLICT — IMPORT REFUSED" : "CAREER RESTORED");
      assert.equal(h.store.get(otherKey).money, peerWrite ? 8000 : other === "driver" ? 123 : 5150);
    });
  }
}


// The older all-careers file UI must use the same revision authority as slot
// imports. Keep the REAL store and Career listener: a mock revision map alone
// would miss imports that clear or bypass the live conflict during refresh.
function legacyImportUI(h) {
  const dom = makeDom();
  h.ctx.document = dom.document;
  h.ctx.document.readyState = "loading";
  const timers = [];
  h.ctx.setTimeout = (fn, ms) => { timers.push({ fn, ms }); return timers.length; };
  h.ctx.clearTimeout = () => {};
  h.SettingsExport.create({ soundOn: false });
  dom.document.body.appendChild(h.SettingsExport.careerRow());
  const button = dom.document.body.querySelector("#cr-career-load");
  return { button, timers,
    choose(pending) {
      const picker = dom.document.body.querySelector("input");
      picker.files = [{ text: () => pending }];
      picker.onchange();
    },
  };
}
const legacyFile = (careers) => ({ format: "apex26-career-v1", careers });

for (const flavour of ["driver", "myteam"]) test(`legacy file picker refuses a peer's ${flavour} write before touching any slots`, async () => {
  const h = loadHarness();
  fillSix(h);
  h.Career.engage(true);
  const ui = legacyImportUI(h);
  ui.button.onclick(); ui.button.onclick();
  let resolve;
  ui.choose(new Promise((r) => { resolve = r; }));
  const key = "apex26.career." + flavour + ".0";
  h.disk.set(key, JSON.stringify(save({ flavour, money: 8000 })));
  h.foreign(key);
  const before = slotSnap(h.disk), pointer = h.disk.get("apex26.careerSlot");
  if (flavour === "driver") assert.equal(h.Career.conflicted(), true);
  resolve(JSON.stringify(legacyFile({ "career.driver.0": save({ money: 50 }),
    "career.myteam.0": save({ flavour: "myteam", money: 60 }), careerSlot: "myteam:0" })));
  await Promise.resolve(); await Promise.resolve();
  assert.match(ui.button.textContent, /CONFLICT/);
  assert.deepEqual(slotSnap(h.disk), before, "even the unchanged destination is not partly imported");
  assert.equal(h.disk.get("apex26.careerSlot"), pointer);
  assert.equal(ui.timers.some((t) => t.ms === 600), false, "a refused file never reloads");
});

test("legacy file confirmation captures revisions on the first tap, including the selected-slot pointer", async () => {
  const h = loadHarness(); fillSix(h);
  const ui = legacyImportUI(h);
  ui.button.onclick();
  h.disk.set("apex26.careerSlot", JSON.stringify("myteam:2")); h.foreign("apex26.careerSlot");
  const before = slotSnap(h.disk);
  ui.button.onclick();
  ui.choose(Promise.resolve(JSON.stringify(legacyFile({ "career.driver.0": save({ money: 50 }), careerSlot: "driver:0" }))));
  await Promise.resolve(); await Promise.resolve();
  assert.match(ui.button.textContent, /CONFLICT/);
  assert.deepEqual(slotSnap(h.disk), before);
  assert.equal(JSON.parse(h.disk.get("apex26.careerSlot")), "myteam:2");
});

test("legacy file imports both modes and refreshes the selected career through the shared authority", async () => {
  const h = loadHarness(); fillSix(h);
  const ui = legacyImportUI(h);
  ui.button.onclick(); ui.button.onclick();
  ui.choose(Promise.resolve(JSON.stringify(legacyFile({ "career.driver.0": save({ money: 50 }),
    "career.myteam.0": save({ flavour: "myteam", team: "custom", money: 60 }), careerSlot: "myteam:0" }))));
  await Promise.resolve(); await Promise.resolve();
  assert.match(ui.button.textContent, /3 APPLIED, RELOADING/);
  assert.equal(JSON.parse(h.disk.get("apex26.career.driver.0")).money, 50);
  assert.equal(h.Career.data().money, 60);
  assert.equal(h.Career.slot().flavour, "myteam");
  assert.equal(h.Career.conflicted(), false);
  assert.equal(ui.timers.filter((t) => t.ms === 600).length, 1);
});

test("empty and malformed legacy files preserve saves and do not reload", async () => {
  for (const file of [legacyFile({}), legacyFile([]), legacyFile(null), { format: "other" }, "broken JSON"]) {
    const h = loadHarness(); fillSix(h);
    const before = slotSnap(h.disk), pointer = h.disk.get("apex26.careerSlot");
    const ui = legacyImportUI(h);
    ui.button.onclick(); ui.button.onclick();
    ui.choose(Promise.resolve(typeof file === "string" ? file : JSON.stringify(file)));
    await Promise.resolve(); await Promise.resolve();
    assert.deepEqual(slotSnap(h.disk), before);
    assert.equal(h.disk.get("apex26.careerSlot"), pointer);
    assert.equal(ui.timers.some((t) => t.ms === 600), false);
    assert.doesNotMatch(ui.button.textContent, /APPLIED/);
  }
});

test("legacy imports report refused storage and stay on the page", async () => {
  const h = loadHarness(); fillSix(h);
  const ui = legacyImportUI(h);
  const pointer = h.disk.get("apex26.careerSlot"), original = h.disk.get("apex26.career.driver.1");
  h.ctx.localStorage.setItem = () => { const e = new Error("full"); e.name = "QuotaExceededError"; throw e; };
  ui.button.onclick(); ui.button.onclick();
  ui.choose(Promise.resolve(JSON.stringify(legacyFile({ "career.driver.1": save({ money: 50 }), careerSlot: "driver:1" }))));
  await Promise.resolve(); await Promise.resolve();
  assert.match(ui.button.textContent, /STORAGE FULL/);
  assert.equal(h.disk.get("apex26.career.driver.1"), original);
  assert.equal(h.disk.get("apex26.careerSlot"), pointer);
  assert.equal(ui.timers.some((t) => t.ms === 600), false);
});

test("real cached store preserves an unknown season through boot and menu loads", () => {
  const h = loadHarness();
  const raw = JSON.stringify({ round: 1, pts: { "haas:0": 25 }, config: { trackIds: ["a", "missing"] } });
  h.disk.set("apex26.season", raw);
  const boot = h.SeasonCal.load();
  h.SeasonCal.engage("season");
  const menu = h.SeasonCal.load();
  assert.equal(h.SeasonCal.lastLoadLossy(), true);
  assert.equal(h.SeasonCal.save(boot).ok, false);
  assert.equal(h.SeasonCal.save(menu).ok, false);
  assert.equal(h.disk.get("apex26.season"), raw);
  assert.deepEqual(Array.from(h.store.get("season").config.trackIds), ["a", "missing"]);
});

// SEC2-1 (round 2): season / badges / daily / records were written after only an
// isObj() check, so a legal file could carry a 4 MB junk key into the 5 MB quota.
function envWith(extras) {
  const h0 = loadHarness();
  h0.disk.set("apex26.career.driver.0", JSON.stringify(save({ money: 5 })));
  h0.Career.load();
  return Object.assign(h0.CareerBackup.build(), extras);
}
const bytesOf = (h, k) => (h.disk.has(k) ? h.disk.get(k).length : 0);

test("SEC2-1: an oversized extra is refused before anything is written", () => {
  const junk = "A".repeat(300 * 1024);
  for (const k of ["season", "badges", "daily", "records"]) {
    const h = loadHarness();
    const env = envWith({ [k]: k === "badges" ? { got: { a: 1 }, junk } : { round: 1, junk } });
    const r = h.CareerBackup.apply(env, {});
    assert.equal(r.ok, false, k);
    assert.equal(r.reason, k + "-too-large");
    assert.equal(h.disk.has("apex26." + (k === "daily" ? "daily.v1" : k)), false, k + " must not be written");
  }
});

test("SEC2-1: an extra with an own __proto__ key is refused", () => {
  for (const [k, text] of [
    ["season", '{"round":0,"pts":{"__proto__":{"p":1}}}'],
    ["badges", '{"got":{"__proto__":1}}'],
    ["daily", '{"days":{"2026-01-01":{"__proto__":{"best":1}}}}'],
    ["records", '{"a":{"__proto__":{"x":1}}}'],
    ["season", '{"__proto__":{"round":9}}'],
  ]) {
    const h = loadHarness();
    const env = envWith({ [k]: JSON.parse(text) });
    const r = h.CareerBackup.apply(env, {});
    assert.equal(r.ok, false, text);
    assert.equal(r.reason, k + "-hostile");
  }
});

test("SEC2-1: each extra is rebuilt from its allowlist — junk keys and bad values never reach the store", () => {
  const h = loadHarness();
  const env = envWith({
    season: { round: 3, pts: { "haas:0": 25, "x y": 9, bad: "NaN-ish", neg: -4 }, teamPts: { haas: 25 }, driverCodes: { "haas:0": "AAAAAAAAAAAAAAAA" },
      finishes: { "haas:0": [1, "x", null] }, roundPts: { "haas:0": [25, -1] }, junk: "zzz", stage: "evil", seed: "7" },
    badges: { v: 9, got: { first_win: 50, "bad id!": 5, pole: "soon", neg: -1 }, junk: [1] },
    daily: { days: { "2026-09-21": { best: "fast", laps: "many", junk: 1 }, "not-a-day": { best: 1 }, "2026-09-22": { best: 70.5, laps: 2 } },
      streak: { count: "9", last: 5 }, junk: 1 },
    records: { monza: { t: 80, deep: { a: { b: { c: { d: 1 } } } } }, bad: Infinity },
  });
  assert.equal(h.CareerBackup.apply(env, {}).ok, true);
  const season = JSON.parse(h.disk.get("apex26.season"));
  assert.equal(season.round, 3);
  assert.deepEqual(season.pts, { "haas:0": 25 });
  assert.equal("junk" in season, false);
  assert.equal("stage" in season, false, "only stage:'race' survives");
  assert.equal("seed" in season, false, "a non-integer seed is dropped");
  assert.equal(season.driverCodes["haas:0"].length, 12);
  assert.deepEqual(season.finishes["haas:0"], [1, 0, 0]);
  const badges = JSON.parse(h.disk.get("apex26.badges"));
  assert.deepEqual(badges.got, { first_win: 50 });
  assert.equal("junk" in badges, false);
  const daily = JSON.parse(h.disk.get("apex26.daily.v1"));
  assert.deepEqual(Object.keys(daily.days).sort(), ["2026-09-21", "2026-09-22"]);
  assert.deepEqual(daily.days["2026-09-21"], { best: null, laps: 0 });
  assert.equal("streak" in daily, false, "a streak with a non-integer count is dropped");
  assert.equal("junk" in daily, false);
  const rec = JSON.parse(h.disk.get("apex26.records"));
  assert.equal(rec.monza.t, 80);
  assert.equal("bad" in rec, false);
  assert.equal("b" in rec.monza.deep.a, false, "depth is bounded");
});

test("SEC2-1: a legitimate backup's extras stay under the per-extra cap", () => {
  const h = loadHarness();
  const days = {};
  for (let d = 1; d <= 28; d++) days["2026-09-" + String(d).padStart(2, "0")] = { best: 70 + d, laps: d, classes: { standard: { best: 70 + d, laps: d } } };
  const env = envWith({ daily: { days, streak: { count: 5, last: "2026-09-28" } } });
  assert.equal(h.CareerBackup.apply(env, {}).ok, true);
  assert.ok(bytesOf(h, "apex26.daily.v1") < 256 * 1024);
  assert.equal(Object.keys(JSON.parse(h.disk.get("apex26.daily.v1")).days).length, 28);
});

// C8 (round 2): the import bumps the season key under SeasonCal's armed revision.
test("C8: a restored standalone season re-arms SeasonCal, so its next save is not a conflict", () => {
  const h = loadHarness();
  h.disk.set("apex26.season", JSON.stringify({ round: 0, pts: {}, teamPts: {}, driverCodes: {} }));
  const stale = h.SeasonCal.load();
  const env = envWith({ season: { round: 4, pts: { "haas:0": 40 }, teamPts: {}, driverCodes: {} } });
  assert.equal(h.CareerBackup.apply(env, {}).ok, true);
  assert.equal(JSON.parse(h.disk.get("apex26.season")).round, 4);
  const res = h.SeasonCal.save(stale);
  assert.notEqual(res.reason, "conflict", "SeasonCal still holds the pre-import revision");
});

// Recovery exports deliberately restore only a reviewed destination, with the
// same revision/durability gates as ordinary backups; never adopt its slot.
test('portable recovery adapter reviews one chosen slot, restores offline, and leaves selection alone', () => {
  const h = loadHarness();
  const raw = { format: 'apex26-recovery-v1', career: save({money:123}), season: {round:2,pts:{'haas:0':25}}, persistence:{durable:false,reason:'quota'} };
  const before=Array.from(h.disk.entries()), original=JSON.stringify(raw);
  const adapted=h.CareerBackup.recoveryEnvelope(raw,{flavour:'driver',i:2});assert.equal(adapted.ok,true);
  const preview=h.CareerBackup.preview(adapted.envelope);assert.equal(preview.slots[0].i,2);
  assert.deepEqual(Array.from(h.disk.entries()),before);assert.equal(JSON.stringify(raw),original);
  const selected=h.store.get('careerSlot',null);
  const result=h.CareerBackup.apply(adapted.envelope,{recovery:true,expectedRevisions:{'driver:2':h.CareerBackup.revisionOf('driver',2)},expectedSeasonRevision:h.store.keyRevision('season')});
  assert.equal(result.ok,true);assert.equal(result.durable,true);assert.equal(h.store.get('career.driver.2').money,123);assert.equal(h.store.get('season').round,2);assert.equal(h.store.get('careerSlot',null),selected);
});
test('active-career recovery aliases restore the career without replacing the standalone season', () => {
  const source = loadHarness();
  source.Career.start({ teamId: 'haas', seed: 42 });
  const career = source.Career.data();
  career.season.round = 1;
  career.season.pts = { 'haas:0': 25 };
  career.season.driverCodes = { 'haas:0': 'YOU' };
  career.season.finishes = { 'haas:0': [1] };
  career.season.roundPts = { 'haas:0': [25] };
  career.season.startedRound = 1;
  career.season.qualiOrder = [{ id: 'haas:0', t: 71.2, human: true }];
  career.season.qualiTrack = 't1';
  career.season.qualiMode = 'career:driver:0';
  career.season.qualiSeat = 'haas:0|haas';
  career.results = [{ r: 0, p: 1, pts: 25 }];
  // select-screen's old exporter emitted the same live object in both fields.
  const raw = { format: 'apex26-recovery-v1', career, season: career.season };
  const original = JSON.stringify(raw);
  const target = loadHarness();
  target.store.set('season', { round: 0, pts: { 'haas:1': 18 } });
  const standalone = target.disk.get('apex26.season');
  const adapted = target.CareerBackup.recoveryEnvelope(JSON.stringify(raw), { flavour: 'driver', i: 2 });
  assert.equal(adapted.ok, true);
  assert.equal(Object.hasOwn(adapted.envelope, 'season'), false);
  assert.equal(target.CareerBackup.apply(adapted.envelope, { recovery: true }).durable, true);
  assert.equal(target.disk.get('apex26.season'), standalone);
  target.Career.useSlot('driver', 2);
  assert.deepEqual(JSON.parse(JSON.stringify(target.Career.data().season)), JSON.parse(JSON.stringify(career.season)));
  assert.deepEqual(JSON.parse(JSON.stringify(target.Career.data().results)), career.results);
  assert.equal(JSON.stringify(raw), original);
});

test('recovery rejects lossy career calIds before restoring any career or standalone data', () => {
  const h = loadHarness();
  h.Career.start({ teamId: 'haas', seed: 1 });
  h.store.set('season', { round: 1, pts: { 'haas:0': 18 } });
  for (const calIds of [['t0', 'removed', 't1'], ['t0', 't0'], [], 't0', [1], Array.from({ length: 65 }, (_, i) => 't' + i)]) {
    const career = save({ season: { round: 2, calIds, pts: { 'haas:0': 43 } } });
    career.results = [{ r: 0, p: 1, pts: 25 }, { r: 1, p: 2, pts: 18 }];
    for (const season of [career.season, { round: 2, pts: { 'haas:0': 43 } }]) {
      const raw = { format: 'apex26-recovery-v1', career, season };
      const original = JSON.stringify(raw), disk = Array.from(h.disk.entries());
      const result = h.CareerBackup.recoveryEnvelope(raw, { flavour: 'driver', i: 1 });
      assert.equal(result.ok, false);
      assert.equal(result.reason, 'unsupported-calendar');
      assert.equal(JSON.stringify(raw), original);
      assert.deepEqual(Array.from(h.disk.entries()), disk);
    }
  }
});

test('recovery future, unknown or lossy calendars and malformed files are refused without changing raw or disk',()=>{
  const h=loadHarness(),target={flavour:'driver',i:1};
  const cases=[{format:'apex26-recovery-v2',career:save()}, {format:'apex26-recovery-v1',career:save({v:999})}, {format:'apex26-recovery-v1',career:save({season:{round:1,config:{trackIds:['removed']}}})}, {format:'apex26-recovery-v1',season:{round:1,config:{trackIds:['t0','t0']}}}, {format:'apex26-recovery-v1',season:{round:-1}}, {format:'apex26-recovery-v1',season:{round:1,futureRules:{}}}, {format:'apex26-recovery-v1',career:save({flavour:'myteam'})}];
  for(const raw of cases){const before=JSON.stringify(raw),disk=Array.from(h.disk.entries());assert.equal(h.CareerBackup.recoveryEnvelope(raw,target).ok,false);assert.equal(JSON.stringify(raw),before);assert.deepEqual(Array.from(h.disk.entries()),disk)}
  assert.equal(h.CareerBackup.recoveryEnvelope('{',target).reason,'bad-json');assert.equal(h.CareerBackup.recoveryEnvelope('x'.repeat(h.CareerBackup.MAX_BYTES+1),target).reason,'too-large');
});
test('recovery checks standalone revision before any career write and preserves newer local season',()=>{
 const h=loadHarness(),raw={format:'apex26-recovery-v1',career:save({money:111}),season:{round:2,pts:{}}};
 const envelope=h.CareerBackup.recoveryEnvelope(raw,{flavour:'driver',i:1}).envelope;
 const reviewed=h.store.keyRevision('season');h.store.set('season',{round:4,pts:{}});const before=Array.from(h.disk.entries());
 const refused=h.CareerBackup.apply(envelope,{recovery:true,expectedSeasonRevision:reviewed});assert.equal(refused.reason,'conflict');assert.deepEqual(Array.from(h.disk.entries()),before);
 const result=h.CareerBackup.apply(envelope,{recovery:true,expectedSeasonRevision:h.store.keyRevision('season')});assert.equal(result.ok,true);assert.equal(h.store.get('season').round,4);
});
test('recovery qualifying uses the merged PR1517 validator without losing ownership stamps',()=>{
 const h=loadHarness(),season={round:0,pts:{},qualiOrder:[{id:'haas:0',t:71.2,human:true}],qualiTrack:'t0',qualiMode:'season',qualiSeat:'haas:0|haas'};
 const adapted=h.CareerBackup.recoveryEnvelope({format:'apex26-recovery-v1',season},{flavour:'driver',i:0});assert.equal(adapted.ok,true);assert.equal(h.CareerBackup.apply(adapted.envelope,{recovery:true}).ok,true);
 const restored=h.store.get('season');for(const key of ['qualiOrder','qualiTrack','qualiMode','qualiSeat'])assert.deepEqual(JSON.parse(JSON.stringify(restored[key])),season[key]);
});
async function chooseRecovery(ui, raw) {
 const button=ui.G.$('cr-left').querySelectorAll('[data-cr-act="import"]')[1];
 ui.G.$('cr-left').replaceChildren();ui.G.$('cr-right').replaceChildren();button.onclick({stopPropagation(){}});
 const picker=ui.dom.document.body.querySelector('input'),text=JSON.stringify(raw);
 picker.files=[{size:text.length,text:async()=>text}];picker.onchange();await Promise.resolve();await Promise.resolve();
}
test('recovery file UI previews its chosen destination and Cancel leaves every save untouched',async()=>{
 const h=loadHarness();h.Career.start({teamId:'haas',seed:1});
 const ui=bootBackupUi({Career:h.Career,CareerBackup:h.CareerBackup,store:h.store});const before=Array.from(h.disk.entries());
 await chooseRecovery(ui,{format:'apex26-recovery-v1',career:save({money:777,round:3}),season:{round:2,pts:{}}});
 const notes=ui.G.$('cr-left').querySelectorAll('.cr-note').map(n=>n.textContent).join(' ');assert.match(notes,/Destination slot 2/);assert.match(notes,/Standalone season: current 0 rounds completed; recovery 2/);assert.deepEqual(Array.from(h.disk.entries()),before);
 const cancel=ui.G.$('cr-left').querySelector('[data-cr-act="import-cancel"]');assert.ok(cancel);cancel.onclick({stopPropagation(){}});assert.deepEqual(Array.from(h.disk.entries()),before);
});
test('recovery file UI confirms only its reviewed card and reports durable completion',async()=>{
 const h=loadHarness();h.Career.start({teamId:'haas',seed:1});const ui=bootBackupUi({Career:h.Career,CareerBackup:h.CareerBackup,store:h.store});
 await chooseRecovery(ui,{format:'apex26-recovery-v1',career:save({money:777})});ui.G.$('cr-left').querySelectorAll('[data-cr-act="import"]')[1].onclick({stopPropagation(){}});
 assert.equal(h.store.get('career.driver.1').money,777);assert.notEqual(h.store.get('career.driver.0').money,777);assert.equal(ui.notices.at(-1),'CAREER RESTORED');
});

for (const flavour of ["driver", "myteam"]) for (let i = 0; i < 3; i++) {
  test(`import cannot replace future ${flavour}:${i} or partially write its bag`, () => {
    const source = loadHarness();
    fillSix(source);
    const envelope = source.CareerBackup.build();
    const target = loadHarness();
    fillSix(target);
    const key = `apex26.career.${flavour}.${i}`;
    target.disk.set(key, JSON.stringify({ v: 2 ** 32, flavour, future: { intact: true } }));
    target.foreign(key);
    const before = [...target.disk.entries()];
    const result = target.CareerBackup.apply(envelope, { otherFlavourConfirmed: true, liveSlot: "myteam:2" });
    assert.equal(result.ok, false);
    assert.equal(result.reason, "newer-version");
    assert.deepEqual([...target.disk.entries()], before);
  });
}

test("a future schema in the last incoming backup row rejects the whole bag before writes", () => {
  const source = loadHarness();
  fillSix(source);
  const envelope = source.CareerBackup.build();
  envelope.slots[5].data.v = 2 ** 32;
  const target = loadHarness();
  fillSix(target);
  const before = [...target.disk.entries()];
  const result = target.CareerBackup.apply(envelope, { otherFlavourConfirmed: true });
  assert.equal(result.reason, "newer-version");
  assert.deepEqual([...target.disk.entries()], before);
});

// #2165: a Daily class key is Ghost.contextKey() — JSON of the car/tune config,
// full of `{`, `"` and `,`. cleanDayEntry ran it through ID_RE and dropped every
// class on import, so a fresh-device restore's share line read "NO LAP".
test("import keeps the Daily per-class bests keyed by a JSON records context (#2165)", () => {
  const context = JSON.stringify({ car: ["mclaren"], tune: [0.84] });
  const a = loadHarness();
  a.disk.set("apex26.career.driver.0", JSON.stringify(save({ money: 111 })));
  a.disk.set("apex26.daily.v1", JSON.stringify({
    days: { "2026-10-15": { best: 80, laps: 1, classes: { [context]: { best: 80, laps: 1 } } } },
  }));
  a.Career.load();
  const envelope = JSON.parse(JSON.stringify(a.CareerBackup.build()));
  assert.equal(a.CareerBackup.validate(envelope).ok, true);

  const b = loadHarness();
  b.Career.load();
  assert.equal(b.CareerBackup.apply(envelope, { focusFlavour: "driver" }).ok, true);
  const daily = JSON.parse(b.disk.get("apex26.daily.v1"));
  assert.deepEqual(daily.days["2026-10-15"].classes, { [context]: { best: 80, laps: 1 } }, "the class entry survives import");

  vm.runInContext(src("js/race/daily-challenge.js"), b.ctx);
  const d = vm.runInContext("DailyChallenge", b.ctx).create({
    store: b.store, fmtTime: (t) => t.toFixed(3), startRace() {}, ttDistance: 3,
    records: { key: () => context, restoreDaily() {}, prepareDaily() {} },
  });
  d.open("2026-10-15");
  const line = d.shareText(null);
  assert.match(line, / · 80\.000/, "the share line shows the restored lap");
  assert.doesNotMatch(line, /NO LAP/);

  // Hostile or oversized class keys still drop; valid native classes survive.
  const classes = { constructor: { best: 1, laps: 1 }, prototype: { best: 1, laps: 1 }, ["x".repeat(4097)]: { best: 1, laps: 1 } };
  for (let i = 0; i < 12; i++) classes[JSON.stringify({ car: ["c" + i] })] = { best: 70 + i, laps: 1 };
  const c = loadHarness();
  c.Career.load();
  const env2 = JSON.parse(JSON.stringify(envelope));
  env2.daily = { days: { "2026-10-15": { best: 70, laps: 12, classes } } };
  assert.equal(c.CareerBackup.apply(env2, { focusFlavour: "driver" }).ok, true);
  const restoredClasses = JSON.parse(c.disk.get("apex26.daily.v1")).days["2026-10-15"].classes;
  assert.equal(Object.keys(restoredClasses).length, 12);
  assert.equal(Object.hasOwn(restoredClasses, "constructor"), false);
  assert.equal(Object.hasOwn(restoredClasses, "prototype"), false);
  assert.equal(Object.hasOwn(restoredClasses, "x".repeat(4097)), false);
});

test("native Daily backup round-trips 61 days of nine full records contexts", async () => {
  const a = loadHarness();
  a.disk.set("apex26.career.driver.0", JSON.stringify(save({ money: 111 })));
  a.Career.load();
  vm.runInContext(src("js/race/daily-challenge.js"), a.ctx);
  const daily = vm.runInContext("DailyChallenge", a.ctx).create({ store: a.store });
  // SessionRecords contexts include the complete physics and car config.
  const config = Object.fromEntries(Array.from({ length: 40 }, (_, i) => ["physics" + i, 0.84 + i]));
  for (let day = 0; day < 61; day++) {
    const date = new Date(Date.UTC(2026, 7, 17 + day)).toISOString().slice(0, 10);
    daily.select(date, "open");
    for (let bias = 0; bias < 9; bias++) {
      daily.record(90 + bias, JSON.stringify({ car: ["mclaren"], config, brakeBias: (52 + bias * 0.5) / 100 }));
    }
  }
  const exported = await a.CareerBackup.exportAll();
  assert.equal(exported.ok, true);
  const envelope = exported.envelope;
  assert.ok(JSON.stringify(envelope.daily).length > 256 * 1024);
  assert.equal(Object.keys(envelope.daily.days).length, 61);
  const text = a.CareerBackup.serialize(envelope);
  const b = loadHarness();
  assert.equal(b.CareerBackup.apply(JSON.parse(text), { rawText: text }).ok, true);
  assert.deepEqual(JSON.parse(b.disk.get("apex26.daily.v1")), envelope.daily);
  assert.equal(JSON.parse(b.disk.get("apex26.career.driver.0")).money, 111);
});

test("native histories beyond the former class/day counts export without truncation", async () => {
  for (const manyDays of [false, true]) {
    const h = loadHarness();
    const days = {};
    for (let day = 0; day < (manyDays ? 121 : 1); day++) {
      const date = new Date(Date.UTC(2026, 0, 1 + day)).toISOString().slice(0, 10);
      days[date] = { classes: Object.fromEntries(Array.from({ length: manyDays ? 1 : 9 }, (_, i) => [JSON.stringify({ bias: i }), { best: 90, laps: 1 }])) };
    }
    h.store.set("daily.v1", { days });
    const exported = await h.CareerBackup.exportAll();
    assert.equal(exported.ok, true);
    const target = loadHarness();
    assert.equal(target.CareerBackup.apply(exported.envelope).ok, true);
    assert.deepEqual(JSON.parse(target.disk.get("apex26.daily.v1")), { days });
  }
});

test("Daily merge preserves nine classes and remains exportable", async () => {
  const h = loadHarness();
  fillSix(h);
  const day = "2026-10-16", key = i => JSON.stringify({ bias: i });
  const classes = Object.fromEntries(Array.from({ length: 8 }, (_, i) => [key(i), { best: 90 + i, laps: 2 }]));
  h.store.set("daily.v1", { days: { [day]: { best: 90, laps: 16, classes } } });
  const envelope = h.CareerBackup.build();
  envelope.daily = { days: { [day]: { best: 80, laps: 1, classes: {
    [key(0)]: { best: 80, laps: 1 }, [key(8)]: { best: 100, laps: 1 },
  } } } };
  assert.equal(h.CareerBackup.validate(envelope).ok, true);
  assert.equal(h.CareerBackup.apply(envelope).ok, true);
  const merged = JSON.parse(h.disk.get("apex26.daily.v1"));
  assert.equal(Object.keys(merged.days[day].classes).length, 9);
  assert.deepEqual(merged.days[day].classes[key(0)], { best: 80, laps: 2 });
  assert.equal(merged.days[day].laps, 16);
  const exported = await h.CareerBackup.exportAll();
  assert.equal(exported.ok, true);
  const target = loadHarness();
  assert.equal(target.CareerBackup.apply(JSON.parse(h.CareerBackup.serialize(exported.envelope))).ok, true);
  assert.deepEqual(JSON.parse(target.disk.get("apex26.daily.v1")), merged);
});

test("merging valid Daily histories preserves their entire day union", async () => {
  const h = loadHarness();
  const days = offset => Object.fromEntries(Array.from({ length: 120 }, (_, i) => [
    new Date(Date.UTC(2026, 0, 1 + offset + i)).toISOString().slice(0, 10), { best: 80 + i, laps: 1 },
  ]));
  const mine = days(0), theirs = days(120);
  h.store.set("daily.v1", { days: mine });
  const envelope = h.CareerBackup.build();
  envelope.daily = { days: theirs };
  assert.equal(h.CareerBackup.apply(envelope).ok, true);
  assert.deepEqual(JSON.parse(h.disk.get("apex26.daily.v1")).days, { ...mine, ...theirs });
  assert.equal((await h.CareerBackup.exportAll()).ok, true);
});

test("over-budget Daily union rejects before career, selection or extra writes", () => {
  const h = loadHarness();
  fillSix(h);
  const daily = offset => ({ days: { "2026-10-16": { classes: Object.fromEntries(
    Array.from({ length: 900 }, (_, i) => [JSON.stringify({ id: i + offset, tune: "x".repeat(3000) }), { best: 90, laps: 1 }]),
  ) } } });
  h.store.set("daily.v1", daily(0));
  const envelope = h.CareerBackup.build();
  envelope.slots[0].data.money = 777;
  envelope.daily = daily(900);
  envelope.badges = { got: { pole: 100 } };
  assert.equal(h.CareerBackup.validate(envelope).ok, true, "each input fits the file budget");
  const before = [...h.disk.entries()];
  const result = h.CareerBackup.apply(envelope, { liveSlot: "myteam:2" });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "daily-too-large");
  assert.deepEqual([...h.disk.entries()], before, "failed preflight makes no partial restore");
  assert.equal(h.CareerBackup.apply(envelope, { includeProgressExtras: false }).ok, true);
  assert.deepEqual(JSON.parse(h.disk.get("apex26.daily.v1")), daily(0), "skipped Daily is not merged");
});

test("hostile local Daily is refused before a merge can disguise its keys", () => {
  const h = loadHarness();
  fillSix(h);
  const envelope = h.CareerBackup.build();
  envelope.daily = { days: { "2026-10-16": { best: 80, laps: 1 } } };
  h.store.set("daily.v1", JSON.parse('{"days":{"__proto__":{"best":1}}}'));
  const before = [...h.disk.entries()];
  assert.equal(h.CareerBackup.apply(envelope).reason, "daily-hostile");
  assert.deepEqual([...h.disk.entries()], before);
  assert.equal(h.CareerBackup.apply(envelope, { includeExtras: false }).ok, true);
});

test("valid Daily import repairs non-object local history", () => {
  for (const local of [1, "bad", []]) {
    const h = loadHarness();
    fillSix(h);
    h.store.set("daily.v1", local);
    const envelope = h.CareerBackup.build();
    envelope.daily = { days: { "2026-10-16": { best: 80, laps: 1 } } };
    assert.equal(h.CareerBackup.apply(envelope).ok, true);
    assert.deepEqual(JSON.parse(h.disk.get("apex26.daily.v1")), envelope.daily);
  }
});


test("backup byte cap applies to UTF-8 strings and object imports before writes", () => {
  const h = loadHarness();
  const envelope = envWith({ note: "é".repeat(3 * 1024 * 1024) });
  const text = JSON.stringify(envelope);
  assert.ok(text.length < h.CareerBackup.MAX_BYTES);
  for (const input of [envelope, text]) {
    assert.equal(h.CareerBackup.validate(input).reason, "too-large");
  }
  assert.equal(h.CareerBackup.apply(envelope).reason, "too-large");
  assert.equal(h.disk.size, 0);
});

test("in-memory unserialisable backups are refused before any write", () => {
  const h = loadHarness(), envelope = envWith({});
  envelope.cycle = envelope;
  assert.equal(h.CareerBackup.apply(envelope).reason, "bad-json");
  assert.equal(h.disk.size, 0);
});

for (const action of ["delete-arm", "delete-confirm", "close", "normal"]) test(`pending career backup read respects ${action} ownership`, async () => {
  const h = bootBackupUi({ CareerBackup: {
    MAX_BYTES: 10000, validate: () => ({ ok: true }), preview: () => ({ slots: [], extras: [] }),
  } });
  // Keep the existing card mounted while the file is reading: DELETE remains
  // actionable, as in the browser. clickImport's older helper clears it first.
  h.G.$("cr-left").querySelector('[data-cr-act="import"]').onclick({ stopPropagation() {} });
  let resolve;
  const pending = new Promise((done) => { resolve = done; });
  const picker = h.dom.document.body.querySelector("input");
  picker.files = [{ size: 100, name: "pending.json", text: () => pending }]; picker.onchange();
  const clear = () => { h.G.$("cr-left").replaceChildren(); h.G.$("cr-right").replaceChildren(); };
  const remove = () => {
    const button = h.G.$("cr-left").querySelector(".cr-slot-del"); assert.ok(button);
    clear(); button.onclick({ stopPropagation() {} });
  };
  if (action.startsWith("delete")) { remove(); if (action === "delete-confirm") remove(); }
  if (action === "close") h.ui.close();
  clear(); resolve(JSON.stringify({ format: "apex26-career-backup-v1" }));
  await Promise.resolve(); await Promise.resolve();
  const review = h.G.$("cr-left").querySelectorAll('[data-cr-act="import"]').some((button) => button.textContent === "IMPORT?");
  assert.equal(review, action === "normal", "abandoned file must not recreate an import review");
});

for (const failsWith of ["throw", "null"]) test(`late ${failsWith} migration failure refuses the whole import before persistence`, () => {
  const h = loadHarness();
  fillSix(h);
  const envelope = h.CareerBackup.build();
  envelope.slots[0].data.money = 777;
  envelope.slots[5].data.money = 888;
  envelope.badges = { got: { pole: 100 } };
  const original = JSON.stringify(envelope), before = [...h.disk.entries()];
  const beforeRevision = h.store.rev;
  vm.runInContext(`(() => {
    const migrate = SaveMigrate.migrateCareer;
    SaveMigrate = Object.assign({}, SaveMigrate, { migrateCareer(c) {
      if (c.money === 888) { ${failsWith === "throw" ? 'throw new TypeError("corrupt numeric leaf");' : 'return null;'} }
      return migrate(c);
    } });
  })()`, h.ctx);
  const result = h.CareerBackup.apply(envelope, { liveSlot: "myteam:2" });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "migrate-failed");
  assert.equal(result.slot, "myteam:2");
  assert.deepEqual([...h.disk.entries()], before, "slots, selection and extras remain unchanged");
  assert.equal(h.store.rev, beforeRevision, "no cache write or mirror queue was started");
  assert.equal(JSON.stringify(envelope), original, "preflight never mutates the imported envelope");
});

test("backup imports repair malformed JSON numeric leaves without mutating the envelope", () => {
  const h = loadHarness();
  const poisoned = JSON.parse('{"toString":"oops"}');
  const envelope = { format: h.CareerBackup.FORMAT, slots: [
    { flavour: "driver", i: 0, data: save({ money: 777 }) },
    { flavour: "driver", i: 1, data: Object.assign(save({ money: 888 }), {
      // Preview-visible year must stay a valid scalar; the importer rejects
      // malformed years before migration so the review card can render safely.
      rep: poisoned, deal: { salary: poisoned },
    }) },
  ] };
  const original = JSON.stringify(envelope);
  const result = h.CareerBackup.apply(envelope);
  assert.equal(result.ok, true, result.reason);
  assert.equal(result.durable, true);
  assert.equal(h.store.get("career.driver.0").money, 777);
  assert.equal(h.store.get("career.driver.1").money, 888);
  assert.equal(h.store.get("career.driver.1").deal.salary, 0);
  assert.equal(h.store.get("career.driver.1").rep, 0);
  assert.equal(h.store.get("career.driver.1").year, 2026);
  assert.equal(JSON.stringify(envelope), original);
});

test("object schema versions are refused before coercion or any import write", () => {
  for (const v of [{ toString: "oops" }, [], true]) {
    const h = loadHarness();
    fillSix(h);
    const envelope = h.CareerBackup.build();
    envelope.slots[5].data.v = v;
    const before = [...h.disk.entries()];
    assert.equal(h.CareerBackup.validate(envelope).reason, "invalid-version");
    assert.equal(h.CareerBackup.apply(envelope).reason, "invalid-version");
    assert.deepEqual([...h.disk.entries()], before);
  }
});

test("apply migrates each planned row exactly once before writing any destination", () => {
  const h = loadHarness(), calls = [];
  h.ctx.migrationCalls = calls;
  vm.runInContext(`(() => {
    const migrate = SaveMigrate.migrateCareer;
    SaveMigrate = Object.assign({}, SaveMigrate, { migrateCareer(c) {
      migrationCalls.push(c.money);
      // A later migration must still see every destination's original value.
      if (c.money === 888 && GameStore.store.get("career.driver.0", null) !== null) {
        throw new Error("a destination was written before migration finished");
      }
      return migrate(c);
    } });
  })()`, h.ctx);
  const envelope = { format: h.CareerBackup.FORMAT, slots: [
    { flavour: "driver", i: 0, data: save({ money: 777 }) },
    { flavour: "driver", i: 1, data: save({ money: 888 }) },
  ] };
  const result = h.CareerBackup.apply(envelope);
  assert.equal(result.ok, true);
  assert.equal(result.durable, true);
  assert.deepEqual(calls, [777, 888], "prepared rows are never migrated again during persistence");
  assert.equal(h.store.get("career.driver.0").money, 777);
  assert.equal(h.store.get("career.driver.1").money, 888);
  h.CareerBackup.writeSlot("driver", 2, save({ money: 999 }));
  assert.deepEqual(calls, [777, 888, 999], "the public single-slot writer still migrates its input");
});

test("a {toString:1} version marker does not throw out of validate/apply", () => {
  const h = loadHarness();
  const payload = { format: "apex26-career-backup-v1", slots: [{ flavour: "driver", i: 1,
    data: Object.assign(save({}), { v: JSON.parse('{"toString":1}'), tally: { pts: JSON.parse('{"toString":1}') } }) }] };
  assert.doesNotThrow(() => h.CareerBackup.validate(payload));
  assert.doesNotThrow(() => h.CareerBackup.apply(payload, { otherFlavourConfirmed: true }));
});
