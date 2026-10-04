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
    id: "haas", tier: 4, stats: {},
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
    Tracks: { LIST: [{ id: "a" }], SEASON: [{ id: "a" }], seasonIndex: () => 0 },
    Parts: { getFactorySetup: () => ({}), setLegality() {} },
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
  vm.runInContext(src("js/career/career.js"), ctx);
  vm.runInContext(src("js/career/season-cal.js"), ctx);
  return {
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
    [{ format: "apex26-career-backup-v1", slots: [{ flavour: "driver", i: 0, data: [1, 2, 3] }] }, "slot-not-object"],
    [{ format: "apex26-career-backup-v1", slots: "nope" }, "slots-not-array"],
    [{ format: "apex26-career-backup-v1", slots: [], ghost: { x: 1 } }, "ghosts-forbidden"],
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

test("a MY TEAM backup carries the team identity and restores it on an empty device", () => {
  const envelope = JSON.parse(JSON.stringify(deviceA().CareerBackup.build()));
  assert.ok(envelope.myTeam, "MY TEAM backup carries no identity");
  assert.equal(envelope.myTeam.customTeam.name, "Murrin GP");
  assert.equal(envelope.myTeam.customLogo, LOGO);
  assert.deepEqual(envelope.myTeam["livery.custom.custom"], MY_LIVERIES);
  assert.equal(envelope.myTeam["livery.custom"], "u1");
  assert.equal(envelope.format, "apex26-career-backup-v1", "format stays v1 (additive field)");

  const b = loadHarness();
  const seen = [];
  b.store.subscribe((c) => { if (c && c.foreign && c.restored) seen.push(c.key); });
  const r = b.CareerBackup.apply(envelope, { focusFlavour: "myteam" });
  assert.equal(r.ok, true);
  assert.equal(JSON.parse(b.disk.get("apex26.career.myteam.0")).money, 5150);
  const team = JSON.parse(b.disk.get("apex26.customTeam"));
  assert.equal(team.name, "Murrin GP");
  assert.deepEqual(team.drivers.map((d) => d.code), ["BRY", "ALX"]);
  assert.equal(JSON.parse(b.disk.get("apex26.customLogo")), LOGO);
  assert.deepEqual(JSON.parse(b.disk.get("apex26.livery.custom.custom")), MY_LIVERIES);
  assert.equal(JSON.parse(b.disk.get("apex26.livery.custom")), "u1");
  assert.deepEqual([...r.identity].sort(), ["customLogo", "customTeam", "livery.custom", "livery.custom.custom"]);
  assert.deepEqual([...seen].sort(), [...r.identity].sort(), "custom-team.js is not told to re-sync");

  // includeExtras:false restores the slot but not the identity.
  const c = loadHarness();
  c.CareerBackup.apply(JSON.parse(JSON.stringify(envelope)), { focusFlavour: "myteam", includeExtras: false });
  assert.equal(c.disk.has("apex26.customTeam"), false);
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
  assert.equal(JSON.parse(p.disk.get("apex26.customTeam")).name, "Murrin GP");
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

test("career slot cards expose EXPORT and IMPORT buttons", () => {
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
  const Career = {
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
  const CareerBackup = {
    MAX_BYTES: 5 * 1024 * 1024,
    exportAll: async () => { exports.push(1); return { ok: true }; },
    validate: () => ({ ok: true }),
    apply: () => ({ ok: true, written: [], needsConfirm: false }),
  };
  const G = {
    $: (id) => dom.byId(id), els: { overlay: dom.byId("overlay") },
    soundOn: false, flow: "gp", session: "race", season: null,
    store: { get: (k, d) => d, set() {} },
    cssCol: () => "#fff", openCareer() {}, openGarage() {}, openRaceSettings() {},
    refreshCareerButton() {}, qualiClear() {}, announce() {},
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
    GameStore: { seasonDriverId: (t, i) => t + ":" + i },
    SeasonCal: { hasProgress: () => false, rounds: () => 24, load: () => null },
    Reliability: { REASONS: ["engine"], TIER_RISK: [0.02] },
    PhysicsConsts: { DIFF: { EASY: 1 } },
  };
  sb.window = sb;
  vm.runInNewContext(DOM_SOURCE, sb, { filename: "js/ui/dom.js" });
  vm.runInNewContext(src("js/career/career-ui.js"), sb, { filename: "js/career/career-ui.js" });
  const ui = sb.CareerUI.create(G);
  ui.openSlots();

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
