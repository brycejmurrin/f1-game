/* career-backup.test.mjs — CareerBackup (js/career/career-backup.js): the
 * deliberate six-slot export/import path SettingsExport excludes and the
 * broken-storage recovery banner only offers when storage is already failing.
 *
 *   (1) export → wipe → import round-trips byte-equal across all six slots
 *   (2) a v0 save exports and imports through the migration ladder
 *   (3) hostile payloads are rejected with a reason and change nothing
 *   (4) import over a newer live revision is refused
 *   (5) career-cross-tab.test.mjs still green (run beside this file)
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
  const labels = left.querySelectorAll(".cr-slot-del").map((n) => n.textContent);
  assert.ok(labels.includes("EXPORT"), "used slot must offer EXPORT");
  assert.ok(labels.includes("IMPORT"), "slot cards must offer IMPORT");
  assert.ok(labels.includes("DELETE"), "used slot still offers DELETE");

  const expBtn = left.querySelectorAll(".cr-slot-del").find((n) => n.textContent === "EXPORT");
  assert.ok(expBtn);
  expBtn.onclick({ stopPropagation() {} });
  assert.equal(exports.length, 1, "EXPORT calls CareerBackup.exportAll");

  // Empty slots still get IMPORT (restore into an empty card).
  const right = G.$("cr-right");
  const emptyLabels = right.querySelectorAll(".cr-slot-del").map((n) => n.textContent);
  assert.ok(emptyLabels.includes("IMPORT"));
  assert.ok(!emptyLabels.includes("EXPORT"), "empty slots do not EXPORT");
  assert.ok(!emptyLabels.includes("DELETE"));
});
