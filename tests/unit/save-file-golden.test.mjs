// save-file-golden.test.mjs — #6602 phase 0: CHARACTERIZATION PINS for every save format × every fixture.
//
// Tests only: nothing in js/ changes. Each legacy file goes through the door the game uses today, in one
// node VM over a fake localStorage with the REAL GameStore, SaveMigrate, CareerBackup and SettingsExport:
//
//   settings-v1       SettingsExport.applySettings            (SAVES & DATA › LOAD SETTINGS FILE)
//   garage-v1         SettingsExport.applyGarage              (LOAD GARAGE FILE)
//   career-v1         SettingsExport.applyCareer              (SAVES & DATA › LOAD CAREER FILE)
//   career-backup-v1  CareerBackup.validate → applyWithUndo   (CAREER MODES › RESTORE … SAVES)
//   recovery-v1       CareerBackup.recoveryEnvelope → apply   (CAREER MODES › RECOVER SLOT)
//
// Fixtures: Bryce's three phone exports (tests/data/settings-live-export-*.json, byte-verbatim and never
// rewritten: #6602 P6, pinned by sha256 below) and the synthetic legacy files in tests/data/save-fixtures/
// (written once by today's writers from a seeded store, exportedAt/build frozen; see its README.md).
//
// OUTCOMES is the known list: what each corrupt variant does TODAY ("refused" = whole file refused,
// "skipped" = the bad row/slot skipped and the rest applied, "applied" = the doubtful part was accepted)
// beside the #6602 P4 target. A later phase that changes an outcome flips its row here on purpose, and
// KNOWN_DIVERGENT (today ≠ P4) must shrink with it.
//
// Run: node --test tests/unit/save-file-golden.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const plain = (v) => JSON.parse(JSON.stringify(v));
const fixture = (name) => JSON.parse(read("tests/data/save-fixtures/" + name));

// ── Bryce's real exports (P6: byte-verbatim) ────────────────────────────────
const BRYCE = {
  "2026-11-09": "992c072080f1d44d7b057d6b9a8a863a2afb9b11e12a87c77e72406d96ddffd5",
  "2026-11-10": "d56452c47e6b8ee5c8091325c1fe7f1c87d4d0a6f8122b458cfea0ebced55a56",
  "2026-11-25": "7c42bd22bcde12063765e31d72276ecd41149c96dfba7a1619d49aec7f9e9c5a",
};
const brycePath = (d) => "tests/data/settings-live-export-" + d + ".json";
const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.2 Mobile/15E148 Safari/604.1";
const MAC_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.2 Safari/605.1.15";

// Everything a settings row's normalize() reaches for, so a skip below is the importer's rule and not a
// missing module in the VM.
const LOAD = [
  "js/data/teams.js", "js/career/save-migrate.js", "js/core/store.js",
  "js/input/controller-profiles.js", "js/input/steer-tuning.js", "js/input/pedal-travel.js", "js/ui/dock-layout.js",
  "js/car/custom-liveries.js", "js/ui/title-layout.js", "js/ui/screen-looks.js", "js/ui/appearance-studio-ui.js",
  "js/ui/appearance-studio.js", "js/ui/progress-backup.js",
  "js/career/career-backup.js", "js/ui/settings-export.js", "js/ui/settings-export-body.js",
];

async function boot({ desktop = false } = {}) {
  const disk = new Map();
  const saved = [];
  const sb = {
    Math, Object, Array, Number, JSON, Map, Set, Date, String, Blob, Promise, isNaN, isFinite, parseInt, parseFloat,
    RegExp, Error, TypeError, RangeError, Symbol, WeakMap, queueMicrotask,
    setTimeout: () => 0, clearTimeout() {},
    Log: { info() {}, warn() {}, debug() {}, error() {}, enabled: () => false },
    // The device the file lands on: Bryce's iPhone, or a Mac. locks grants this tab the career writer.
    navigator: { userAgent: desktop ? MAC_UA : IPHONE_UA, maxTouchPoints: desktop ? 0 : 5,
      locks: { request(name, opts, cb) { return Promise.resolve(cb({ name })); } } },
    localStorage: {
      get length() { return disk.size; },
      key(i) { return Array.from(disk.keys())[i]; },
      getItem(k) { return disk.has(k) ? disk.get(k) : null; },
      setItem(k, v) { disk.set(k, String(v)); },
      removeItem(k) { disk.delete(k); },
    },
    NativeDownload: { viable: () => true, saveBlob: async (blob, name) => { saved.push({ name, size: blob.size }); } },
    // recoveryEnvelope checks calendars against Tracks.LIST.
    Tracks: { LIST: Array.from({ length: 24 }, (_, i) => ({ id: "t" + i })) },
  };
  sb.window = sb;
  const ctx = vm.createContext(sb);
  for (const f of LOAD) vm.runInContext(read(f).replace(/^const\b/gm, "var"), ctx, { filename: absSrc(f) });
  vm.runInContext("GameStore.migrateCareer = SaveMigrate.migrateCareer; GameStore.CAREER_V = SaveMigrate.CAREER_V;", ctx);
  await vm.runInContext("GameStore.store.careerWriter.ready", ctx);
  const SE = vm.runInContext("SettingsExport", ctx);
  const CB = vm.runInContext("CareerBackup", ctx);
  const store = vm.runInContext("GameStore.store", ctx);
  assert.equal(store.careerWriteStatus().ok, true, "the harness owns the career writer");
  const G = { gfx: { isMobile: !desktop }, soundOn: false };
  // download() is private to the LAZY_SAVES_DATA body: evaluate its real source against the façade's caps.
  const body = read("js/ui/settings-export-body.js");
  const at = body.indexOf("const RESTORE_LIMIT_MSG"), end = body.indexOf("async function download(");
  const download = vm.runInContext("(function () { const { FORMAT, SETTINGS_MAX_BYTES, GARAGE_FORMAT, GARAGE_MAX_BYTES, CAREER_FORMAT }"
    + " = SettingsExport._core; " + body.slice(at, body.indexOf("\n}\n", end) + 2) + "; return download; })()",
    ctx, { filename: absSrc("js/ui/settings-export-body.js") });
  const slot = (f, i) => { const s = disk.get("apex26.career." + f + "." + i); return s == null ? null : JSON.parse(s); };
  return {
    disk, saved, SE, CB, store, G, slot, download,
    core: vm.runInContext("SettingsExport._core", ctx),
    CAREER_V: vm.runInContext("SaveMigrate.CAREER_V", ctx),
    SPEC: vm.runInContext("SettingsExport.SPEC", ctx),
    // Each door, exactly as the UI calls it.
    settings: (file) => plain(SE.applySettings(file, G)),
    garage: (file) => plain(SE.applyGarage(file)),
    careerFile: async (file) => plain(await SE.applyCareer(file)),
    backup: async (file, text) => {
      const v = CB.validate(file, text);
      if (!v.ok) return plain(v);
      return plain(await CB.applyWithUndo(v.envelope, { otherFlavourConfirmed: true, rawText: text }));
    },
    recovery: async (file, target, text) => {
      const v = CB.recoveryEnvelope(file, target, text);
      if (!v.ok) return plain(v);
      return plain(await CB.applyWithUndo(v.envelope, { flavours: [target.flavour], otherFlavourConfirmed: true, rawText: text, recovery: true }));
    },
    seedCareers(file) {
      for (const [k, v] of Object.entries(file.careers)) store.set(k, v);
    },
  };
}

const sixSlots = (h) => Object.fromEntries(["driver", "myteam"].flatMap((f) => [0, 1, 2].map((i) => [f + ":" + i, h.slot(f, i)])));
const money = (h) => Object.fromEntries(Object.entries(sixSlots(h)).map(([k, v]) => [k, v && v.money]));
const OVERSIZE = (bytes) => "x".repeat(bytes + 1024);

// ── P6: the real fixtures are never rewritten ──────────────────────────────
test("Bryce's live exports are byte-verbatim (sha256 pinned; #6602 P6)", () => {
  for (const [d, sha] of Object.entries(BRYCE)) {
    const bytes = fs.readFileSync(path.join(ROOT, brycePath(d)));
    assert.equal(crypto.createHash("sha256").update(bytes).digest("hex"), sha, brycePath(d) + " was rewritten");
  }
});

// ── settings-v1 × Bryce's fixtures × {his phone, a Mac} ────────────────────
// applied/skipped are what the receipt reports today. deviceSkipped is the perDevice rows a file from the
// other kind of device leaves alone (#5005); the phone files land cleanly on the phone.
const SETTINGS_GOLDEN = {
  "2026-11-09": {
    phone: { applied: 194, skipped: 0, deviceSkipped: 0, preferences: { applied: 194, skipped: 0, failed: 0 }, ttlb: 0, progress: 0 },
    desktop: { applied: 184, skipped: 7, deviceSkipped: 7, preferences: { applied: 184, skipped: 7, failed: 0 }, ttlb: 0, progress: 0 },
  },
  "2026-11-10": {
    phone: { applied: 194, skipped: 0, deviceSkipped: 0, preferences: { applied: 194, skipped: 0, failed: 0 }, ttlb: 0, progress: 0 },
    desktop: { applied: 184, skipped: 7, deviceSkipped: 7, preferences: { applied: 184, skipped: 7, failed: 0 }, ttlb: 0, progress: 0 },
  },
  // 11-25 on the phone: one preference skip (the noImport METRICS switch, #5032) and one progress skip: his
  // MY CIRCUIT (progress.circuits) waits for the editor's CustomTracks, which this VM does not load.
  "2026-11-25": {
    phone: { applied: 330, skipped: 2, deviceSkipped: 0, preferences: { applied: 228, skipped: 1, failed: 0 }, ttlb: 100, progress: 2 },
    desktop: { applied: 315, skipped: 13, deviceSkipped: 11, preferences: { applied: 213, skipped: 12, failed: 0 }, ttlb: 100, progress: 2 },
  },
};
// Rows a settings import never writes, by design: migration-version context (row.info) and noImport rows.
const NEVER_WRITTEN = (row) => row.info || row.noImport;
// Headline values Bryce reads on his phone (UI SIZE, BUTTON), straight from each file.
const HEADLINE = {
  "2026-11-09": { uiScale: 61, hudBtnScale: null },
  "2026-11-10": { uiScale: 70, hudBtnScale: 143.25 },
  "2026-11-25": { uiScale: null, hudBtnScale: 130 },
};

for (const d of Object.keys(BRYCE)) {
  test(`settings-v1 ${d}: golden receipt on his phone and on a Mac`, async () => {
    const file = JSON.parse(read(brycePath(d)));
    for (const device of ["phone", "desktop"]) {
      const h = await boot({ desktop: device === "desktop" });
      const r = h.settings(file);
      const got = { applied: r.applied, skipped: r.skipped, deviceSkipped: r.deviceSkipped, preferences: r.sections.preferences,
        ttlb: r.sections.leaderboards.applied, progress: r.sections.progress.applied };
      assert.equal(r.ok, true);
      assert.equal(r.failed, 0);
      if (process.env.SAVE_GOLDEN_PRINT) console.log(d, device, JSON.stringify(got));
      else assert.deepEqual(got, SETTINGS_GOLDEN[d][device], `${d} on ${device}`);
    }
  });

  test(`settings-v1 ${d}: file → apply → collect("all") gives back every importable row on his phone`, async () => {
    const file = JSON.parse(read(brycePath(d)));
    const h = await boot();
    h.settings(file);
    const back = plain(h.SE.collect("all", h.G));
    const drift = [];
    for (const row of h.SPEC) {
      const g = file.settings[row.group];
      if (!g || !Object.hasOwn(g, row.k) || NEVER_WRITTEN(row)) continue;
      if (JSON.stringify(back.settings[row.group][row.k]) !== JSON.stringify(g[row.k])) drift.push(row.group + "." + row.k);
    }
    assert.deepEqual(drift, [], "rows that did not survive the round trip");
    for (const [k, v] of Object.entries(HEADLINE[d])) assert.deepEqual(back.settings.display[k], v, `${d} display.${k}`);
    if (file.settings.appearance && file.settings.appearance.appearanceShapes) {
      assert.deepEqual(back.settings.appearance.appearanceShapes, file.settings.appearance.appearanceShapes, "appearanceShapes portrait/landscape");
    }
  });

  test(`settings-v1 ${d}: write → read is a fixed point (collect, apply on a fresh phone, collect)`, async () => {
    const a = await boot();
    a.settings(JSON.parse(read(brycePath(d))));
    const first = plain(a.SE.collect("all", a.G));
    const b = await boot();
    assert.equal(b.settings(first).failed, 0);
    const second = plain(b.SE.collect("all", b.G));
    assert.deepEqual(second.settings, first.settings);
  });
}

// ── synthetic legacy files: clean round trips ──────────────────────────────
test("garage-v1 fixture: apply on an empty device, collectGarage gives the same garage", async () => {
  const file = fixture("garage-v1.json");
  const h = await boot();
  const r = h.garage(file);
  assert.deepEqual({ ok: r.ok, applied: r.applied, skipped: r.skipped, failed: r.failed }, { ok: true, applied: 7, skipped: 0, failed: 0 });
  assert.deepEqual(plain(h.SE.collectGarage()).garage, file.garage);
});

test("career-v1 fixture: six slots and the live pointer round-trip through LOAD CAREER FILE", async () => {
  const file = fixture("career-v1.json");
  const h = await boot();
  const r = await h.careerFile(file);
  assert.deepEqual({ ok: r.ok, applied: r.applied, skipped: r.skipped, failed: r.failed }, { ok: true, applied: 8, skipped: 0, failed: 0 });
  const back = plain(h.SE.collectCareer());
  assert.deepEqual(back.careers, file.careers);
  assert.deepEqual(back.badges, file.badges);
  assert.equal(JSON.parse(h.disk.get("apex26.careerSlot")), "driver:1");
});

test("career-backup-v1 fixture: six slots round-trip through RESTORE … SAVES", async () => {
  const file = fixture("career-backup-v1.json");
  const h = await boot();
  const r = await h.backup(file, JSON.stringify(file));
  assert.equal(r.ok, true, r.reason);
  assert.equal(r.written.length, 6);
  const back = plain(h.CB.build());
  assert.deepEqual(back.slots, file.slots);
  assert.deepEqual(back.badges, file.badges);
});

test("recovery-v1 fixture: the one live career lands in the chosen slot, migrated to CAREER_V", async () => {
  const file = fixture("recovery-v1.json");
  const h = await boot();
  const r = await h.recovery(file, { flavour: "driver", i: 2 }, JSON.stringify(file));
  assert.equal(r.ok, true, r.reason);
  const got = h.slot("driver", 2);
  assert.equal(got.v, h.CAREER_V);
  assert.equal(got.money, file.career.money);
  assert.deepEqual(got.driver, file.career.driver);
  assert.equal(h.slot("driver", 0), null, "only the chosen slot is written");
});

test("legacy fixtures cross the doors the way career-ui routes them", async () => {
  const h = await boot();
  // The CAREER MODES door refuses a career-v1 file (career-ui.js sends it to SAVES & DATA) because
  // CareerBackup does not read it; the SAVES & DATA door refuses a backup file.
  assert.equal(h.CB.validate(fixture("career-v1.json")).reason, "wrong-format");
  assert.equal((await h.careerFile(fixture("career-backup-v1.json"))).ok, false);
  assert.equal(h.CB.validate(fixture("recovery-v1.json")).reason, "wrong-format");
  assert.equal(h.CB.recoveryEnvelope(fixture("career-backup-v1.json"), { flavour: "driver", i: 0 }).reason, "wrong-format");
  assert.equal(h.settings(fixture("garage-v1.json")).ok, false);
  assert.equal(h.garage(JSON.parse(read(brycePath("2026-11-25")))).ok, false);
});

// ── the known list: corrupt variants, today vs #6602 P4 ────────────────────
// Each probe builds one corrupt file from a fixture, runs it through its door on a fresh device and
// classifies what happened. "skipped" also proves the rest of the file still applied.
const SETTINGS_BASE = () => JSON.parse(read(brycePath("2026-11-10")));
const slotMut = (file, key, fn) => { const f = plain(file); f.careers[key] = fn(f.careers[key]); return f; };
const rowMut = (file, i, fn) => { const f = plain(file); f.slots[i] = { ...f.slots[i], data: fn(f.slots[i].data) }; return f; };
const recMut = (fn) => { const f = fixture("recovery-v1.json"); f.career = fn(f.career); return f; };
const bad = (d) => ({ ...d, money: "abc" });
const newer = (d) => ({ ...d, v: 99 });
const prim = () => 5;
const big = (d) => ({ ...d, notes: OVERSIZE(5 * 1024 * 1024) });

async function careerOutcome(file) {
  const h = await boot();
  const r = await h.careerFile(file);
  if (!r.ok) return "refused";
  const m = money(h);
  const rest = ["driver:0", "driver:2", "myteam:0", "myteam:1", "myteam:2"].every((k) => m[k] != null);
  return m["driver:1"] == null && rest && r.skipped >= 1 ? "skipped" : m["driver:1"] != null ? "applied" : "?";
}
async function backupOutcome(file) {
  const h = await boot();
  const r = await h.backup(file, JSON.stringify(file));
  if (!r.ok) return "refused";
  const m = money(h);
  const rest = ["driver:0", "driver:2", "myteam:0", "myteam:1", "myteam:2"].every((k) => m[k] != null);
  return m["driver:1"] == null && rest ? "skipped" : m["driver:1"] != null ? "applied" : "?";
}
async function recoveryOutcome(file) {
  const h = await boot();
  const r = await h.recovery(file, { flavour: "driver", i: 1 }, JSON.stringify(file));
  return r.ok ? (h.slot("driver", 1) ? "applied" : "skipped") : "refused";
}

const OUTCOMES = [
  // settings-v1 (row policy)
  { id: "settings/wrong-format", today: "refused", p4: "refused",
    probe: async () => ((await boot()).settings({ ...SETTINGS_BASE(), format: "apex26-settings-v9" }).ok ? "applied" : "refused") },
  { id: "settings/bad-row", today: "skipped", p4: "skipped",
    probe: async () => { const f = SETTINGS_BASE(); f.settings.audio.commentary = "loud"; const h = await boot(); const r = h.settings(f);
      return r.ok && r.skipped === 1 && r.applied === 193 && !h.disk.has("apex26.commentary") ? "skipped" : "applied"; } },
  { id: "settings/primitive-group", today: "skipped", p4: "skipped",
    probe: async () => { const f = SETTINGS_BASE(); const n = Object.keys(f.settings.audio).length; f.settings.audio = 5; const r = (await boot()).settings(f);
      return r.ok && r.applied === 194 - n ? "skipped" : "applied"; } },
  { id: "settings/oversize-at-apply", today: "applied", p4: "refused",   // the 8 MiB cap lives in the picker, not applySettings
    probe: async () => { const f = SETTINGS_BASE(); f.padding = OVERSIZE(8 * 1024 * 1024); return (await boot()).settings(f).ok ? "applied" : "refused"; } },
  // garage-v1 (row policy, no version)
  { id: "garage/wrong-format", today: "refused", p4: "refused",
    probe: async () => ((await boot()).garage({ ...fixture("garage-v1.json"), format: "apex26-garage-v2" }).ok ? "applied" : "refused") },
  { id: "garage/bad-row", today: "skipped", p4: "skipped",
    probe: async () => { const f = fixture("garage-v1.json"); f.garage["livery.custom.haas"].push({ id: 7 }); const h = await boot(); const r = h.garage(f);
      return r.ok && r.droppedLiveries === 1 && r.applied === 7 ? "skipped" : "applied"; } },
  { id: "garage/primitive-row", today: "skipped", p4: "skipped",
    probe: async () => { const f = fixture("garage-v1.json"); f.garage["parts.haas"] = 5; const h = await boot(); const r = h.garage(f);
      return r.ok && r.skipped === 1 && r.applied === 6 && !h.disk.has("apex26.parts.haas") ? "skipped" : "applied"; } },
  { id: "garage/oversize-at-apply", today: "applied", p4: "refused",     // the 1 MiB cap lives in the picker
    probe: async () => { const f = fixture("garage-v1.json"); f.padding = OVERSIZE(1024 * 1024); return (await boot()).garage(f).ok ? "applied" : "refused"; } },
  // career-v1 (per-slot policy)
  { id: "career-file/bad-slot", today: "skipped", p4: "skipped", probe: () => careerOutcome(slotMut(fixture("career-v1.json"), "career.driver.1", bad)) },
  { id: "career-file/newer-version-slot", today: "skipped", p4: "skipped", probe: () => careerOutcome(slotMut(fixture("career-v1.json"), "career.driver.1", newer)) },
  { id: "career-file/primitive-slot", today: "skipped", p4: "skipped", probe: () => careerOutcome(slotMut(fixture("career-v1.json"), "career.driver.1", prim)) },
  // applyCareer has no byte cap of its own; CareerBackup.validate refuses the re-wrapped envelope (too-large).
  { id: "career-file/oversize", today: "refused", p4: "refused", probe: () => careerOutcome(slotMut(fixture("career-v1.json"), "career.driver.1", big)) },
  // career-backup-v1 (per-row policy since #6587)
  { id: "career-backup/bad-slot", today: "skipped", p4: "skipped", probe: () => backupOutcome(rowMut(fixture("career-backup-v1.json"), 1, bad)) },
  { id: "career-backup/newer-version-slot", today: "skipped", p4: "skipped", probe: () => backupOutcome(rowMut(fixture("career-backup-v1.json"), 1, newer)) },
  { id: "career-backup/primitive-slot", today: "skipped", p4: "skipped", probe: () => backupOutcome(rowMut(fixture("career-backup-v1.json"), 1, prim)) },
  { id: "career-backup/oversize", today: "refused", p4: "refused", probe: () => backupOutcome(rowMut(fixture("career-backup-v1.json"), 1, big)) },
  // recovery-v1 (one slot: a bad row refuses the file)
  { id: "recovery/bad-slot", today: "refused", p4: "skipped", probe: () => recoveryOutcome(recMut(bad)) },
  { id: "recovery/newer-version-slot", today: "refused", p4: "skipped", probe: () => recoveryOutcome(recMut(newer)) },
  { id: "recovery/primitive-slot", today: "refused", p4: "skipped", probe: () => recoveryOutcome(recMut(prim)) },
  { id: "recovery/oversize", today: "refused", p4: "refused", probe: () => recoveryOutcome(recMut(big)) },
];

// Today ≠ P4. A phase that fixes one removes it here and flips its OUTCOMES row in the same commit.
const KNOWN_DIVERGENT = [
  "settings/oversize-at-apply",       // SaveFile.read (phase 5) owns every cap; today only the file picker checks 8 MiB
  "garage/oversize-at-apply",         // same, 1 MiB
  "recovery/bad-slot",                // recovery restores ONE slot, so a bad row refuses the whole file (recoveryEnvelope)
  "recovery/newer-version-slot",      // "unsupported-version"; P4/D2(a): skipped and reported as "needs a newer game"
  "recovery/primitive-slot",          // "slot-not-object"
];

for (const o of OUTCOMES) {
  test(`known outcome ${o.id}: today ${o.today} (P4 target ${o.p4})`, async () => {
    const got = await o.probe();
    if (process.env.SAVE_GOLDEN_PRINT) console.log("OUTCOME", o.id, got);
    else assert.equal(got, o.today);
  });
}

test("KNOWN_DIVERGENT is exactly the OUTCOMES rows where today differs from the P4 target", () => {
  assert.deepEqual(OUTCOMES.filter((o) => o.today !== o.p4).map((o) => o.id), KNOWN_DIVERGENT);
});

// ── save side: export of a corrupt store, size caps on SAVE ────────────────
test("export side: a primitive stored career slot is left out and reported by both career writers", async () => {
  const h = await boot();
  h.seedCareers(fixture("career-v1.json"));
  h.store.set("career.driver.1", 5);
  const skipped = [];
  const env = plain(h.CB.build(skipped));
  assert.deepEqual(plain(skipped), [{ slot: "driver:1", reason: "slot-not-object" }], "#6587: the backup writer reports it");
  assert.equal(env.slots.find((s) => s.flavour === "driver" && s.i === 1).data, null);
  const file = plain(h.SE.collectCareer());
  assert.equal(Object.hasOwn(file.careers, "career.driver.1"), false, "the career file drops it silently (no skipped list)");
  assert.equal(Object.keys(file.careers).length, 6);
});

// #6602 phase 2 flipped this row: garage and career files now refuse on SAVE what LOAD would refuse.
test("save-side caps: every file format checks its load cap on SAVE (#6478-8)", async () => {
  const h = await boot();
  const SETTINGS_MAX = h.core.SETTINGS_MAX_BYTES, GARAGE_MAX = h.core.GARAGE_MAX_BYTES;
  assert.deepEqual([SETTINGS_MAX, GARAGE_MAX, h.CB.MAX_BYTES], [8 * 1024 * 1024, 1024 * 1024, 5 * 1024 * 1024], "load caps (#6602 §2)");
  await assert.rejects(h.download({ format: "apex26-settings-v1", padding: OVERSIZE(SETTINGS_MAX) }, "s.json"), RangeError);
  await assert.rejects(h.download({ format: "apex26-garage-v1", garage: {}, padding: OVERSIZE(GARAGE_MAX) }, "g.json"), RangeError);
  await assert.rejects(h.download({ format: "apex26-career-v1", careers: {}, padding: OVERSIZE(h.CB.MAX_BYTES) }, "c.json"), RangeError);
  await h.download({ format: "apex26-garage-v1", garage: {} }, "small.json");
  assert.deepEqual(h.saved.map((s) => s.name), ["small.json"], "only the file that fits its load cap saves");
  h.store.set("badges", { pad: OVERSIZE(h.CB.MAX_BYTES) });
  const r = plain(await h.CB.exportAll());
  assert.equal(r.ok, false, "CareerBackup.exportAll refuses a backup over its own load cap");
});
