// save-integrity-phase2.test.mjs — #6602 phase 2 (#6478 rows 1, 3, 11; row 8 is the flipped
// "save-side caps" golden in save-file-golden.test.mjs).
//
//   row 1   RESET GARAGE puts every cleared key back when a default write is refused.
//   row 3   LOAD GARAGE FILE is one unit: a refused write restores every prepared key, applied:0.
//   row 11  the career file carries CareerBackup's `records` extra both ways.
//
// Run: node --test tests/unit/save-integrity-phase2.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { seedSaveMigrate } from "../helpers/seed-save-migrate.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");
const plain = (v) => JSON.parse(JSON.stringify(v));

function makeDisk(seed = {}) {
  const m = new Map(Object.entries(seed));
  return {
    _m: m, refuse: () => false,
    getItem(k) { return m.has(k) ? m.get(k) : null; },
    setItem(k, v) {
      if (this.refuse(k, String(v))) throw Object.assign(new Error("quota"), { name: "QuotaExceededError" });
      m.set(k, String(v));
    },
    removeItem(k) { m.delete(k); },
    key(i) { return [...m.keys()][i] ?? null; },
    get length() { return m.size; },
  };
}

// The garage stack exactly as garage-defaults.test.mjs loads it.
function garageVm(seed) {
  const localStorage = makeDisk(seed);
  const ctx = { console, localStorage, document: { querySelector: () => null },
    Object, Array, String, Number, JSON, Math, Date, Map, Set, Error, Log: { info() {}, warn() {}, error() {} } };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  seedSaveMigrate(ctx);
  for (const [file, name] of [["js/data/settings-defaults.js", "SettingsDefaults"], ["js/data/garage-defaults.js", "GarageDefaults"],
    ["js/core/store.js", "GameStore"], ["js/data/teams.js", "Teams"], ["js/car/liveries.js", "Liveries"],
    ["js/car/custom-liveries.js", "CustomLiveries"], ["js/ui/settings-export.js", "SettingsExport"]]) {
    vm.runInContext(read(file) + "\n;globalThis." + name + " = " + name + ";", ctx, { filename: absSrc(file) });
  }
  vm.runInContext(read("js/ui/settings-export-body.js"), ctx, { filename: absSrc("js/ui/settings-export-body.js") });
  return ctx;
}

const CUSTOM_TEAM = { id: "custom", name: "Night Owls", drivers: [{ name: "You", code: "YOU", num: 99 }] };
const MY_PARTS = { engine: "player_build" };

test("row 1: a refused default write during RESET GARAGE restores every cleared garage key", async () => {
  const seed = {
    "apex26.team": "4",
    "apex26.parts.mercedes": JSON.stringify(MY_PARTS),
    "apex26.customTeam": JSON.stringify(CUSTOM_TEAM),
    "apex26.setup.extra": JSON.stringify({ arbF: 4 }),
  };
  const { SettingsExport, GameStore, localStorage } = garageVm(seed);
  // Quota refuses the SHIPPED mercedes sheet (the player's own sheet still fits).
  localStorage.refuse = (k, v) => k === "apex26.parts.mercedes" && v.includes("sig_mercedes_zero");
  const r = await SettingsExport.resetGarage();
  assert.equal(r.applied, 0, "nothing counts as applied");
  assert.ok(r.failed >= 1, "the refusal is reported");
  assert.equal(r.restored, true);
  for (const [k, v] of Object.entries(seed)) assert.equal(localStorage.getItem(k), v, k + " survives on disk");
  assert.deepEqual(plain(GameStore.store.get("customTeam", null)), CUSTOM_TEAM, "the session keeps the invented team");
  assert.deepEqual(plain(GameStore.store.get("parts.mercedes", {})), MY_PARTS);
});

test("row 1: a clean RESET GARAGE still clears extras and applies the shipped garage", async () => {
  const { SettingsExport, localStorage } = garageVm({ "apex26.customTeam": JSON.stringify(CUSTOM_TEAM) });
  const r = await SettingsExport.resetGarage();
  assert.equal(r.failed, 0);
  assert.equal(r.restored, undefined);
  assert.ok(r.applied >= 30);
  assert.equal(localStorage.getItem("apex26.customTeam"), null);
});

test("row 3: LOAD GARAGE FILE refused on the 3rd of 4 keys keeps every key's prior value", () => {
  const seed = {
    "apex26.team": "4",
    "apex26.driver": "1",
    "apex26.setup.mercedes": JSON.stringify({ arbF: 7 }),
  };
  const { SettingsExport, GameStore, localStorage } = garageVm(seed);
  localStorage.refuse = (k) => k === "apex26.parts.mercedes";
  const file = { format: "apex26-garage-v1", garage: {
    team: 2, driver: 0, "parts.mercedes": { engine: "sig_mercedes_zero" }, "setup.mercedes": { arbF: 3 } } };
  const r = plain(SettingsExport.applyGarage(file));
  assert.deepEqual({ ok: r.ok, applied: r.applied, failed: r.failed }, { ok: true, applied: 0, failed: 1 });
  for (const [k, v] of Object.entries(seed)) assert.equal(localStorage.getItem(k), v, k + " keeps its prior value");
  assert.equal(localStorage.getItem("apex26.parts.mercedes"), null);
  const s = GameStore.store;
  assert.deepEqual([s.get("team", -1), s.get("driver", -1), plain(s.get("setup.mercedes", {}))], [4, 1, { arbF: 7 }],
    "the session cache is rolled back too");
  assert.equal(s.getStored("parts.mercedes"), undefined, "the refused key is not left half-written in the cache");
});

// ── row 11: the career file stack (as save-file-golden.test.mjs boots it) ──
const CAREER_LOAD = ["js/data/teams.js", "js/career/save-migrate.js", "js/core/store.js",
  "js/career/career-backup.js", "js/ui/settings-export.js", "js/ui/settings-export-body.js"];
async function careerVm() {
  const disk = makeDisk();
  const sb = {
    Math, Object, Array, Number, JSON, Map, Set, Date, String, Blob, Promise, isNaN, isFinite, parseInt, parseFloat,
    RegExp, Error, TypeError, RangeError, Symbol, WeakMap, queueMicrotask, setTimeout: () => 0, clearTimeout() {},
    Log: { info() {}, warn() {}, debug() {}, error() {}, enabled: () => false },
    navigator: { userAgent: "node", maxTouchPoints: 0, locks: { request(n, o, cb) { return Promise.resolve(cb({ name: n })); } } },
    localStorage: disk, Tracks: { LIST: [] },
  };
  sb.window = sb;
  const ctx = vm.createContext(sb);
  for (const f of CAREER_LOAD) vm.runInContext(read(f).replace(/^const\b/gm, "var"), ctx, { filename: absSrc(f) });
  vm.runInContext("GameStore.migrateCareer = SaveMigrate.migrateCareer; GameStore.CAREER_V = SaveMigrate.CAREER_V;", ctx);
  await vm.runInContext("GameStore.store.careerWriter.ready", ctx);
  return { SE: vm.runInContext("SettingsExport", ctx), store: vm.runInContext("GameStore.store", ctx) };
}

test("row 11: collectCareer exports the records book and applyCareer restores it", async () => {
  const RECORDS = { lap: { monza: { t: 81.234, by: "YOU" } } };
  const a = await careerVm();
  a.store.set("records", RECORDS);
  const file = plain(a.SE.collectCareer());
  assert.deepEqual(file.records, RECORDS, "the career file carries `records`");
  const b = await careerVm();
  const r = plain(await b.SE.applyCareer(file));
  assert.equal(r.ok, true, r.reason);
  assert.deepEqual(plain(b.store.get("records", null)), RECORDS, "LOAD CAREER FILE restores it");
});
