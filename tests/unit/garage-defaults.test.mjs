/* garage-defaults — the shipped garage lives in ONE file, and the store /
 * reset / export loader must keep agreeing about it.
 *
 * js/data/garage-defaults.js holds the value (from an apex26-garage-v1
 * export via tools/gen/garage-defaults.mjs). GameStore.get answers from it
 * on a miss. SettingsExport.resetGarage clears garage-shaped keys then
 * applies GarageDefaults.file(). A value the player already stored still
 * wins — existing saves are never wiped by a boot.
 *
 * Run: node --test tests/unit/garage-defaults.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { check, readDefaults, isGarageKey } from "../../tools/gen/garage-defaults.mjs";
import { seedSaveMigrate } from "../helpers/seed-save-migrate.mjs";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const DEFAULTS_SRC = path.join(ROOT, "js/data/garage-defaults.js");
const SETTINGS_DEFAULTS_SRC = path.join(ROOT, "js/data/settings-defaults.js");
const STORE_SRC = path.join(ROOT, "js/core/store.js");
const EXPORT_SRC = path.join(ROOT, "js/ui/settings-export.js");
const MANIFEST = path.join(ROOT, "tools/manifest.cjs");

function makeDisk(seed = {}) {
  const m = new Map(Object.entries(seed));
  return {
    _m: m,
    getItem(k) { return m.has(k) ? m.get(k) : null; },
    setItem(k, v) { m.set(k, String(v)); },
    removeItem(k) { m.delete(k); },
    clear() { m.clear(); },
    key(i) { return [...m.keys()][i] ?? null; },
    get length() { return m.size; },
  };
}

function load(diskSeed) {
  const localStorage = makeDisk(diskSeed);
  const ctx = { console, localStorage, document: { querySelector: () => null },
    Object, Array, String, Number, JSON, Math, Date, Map, Set, Error };
  ctx.window = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  seedSaveMigrate(ctx);
  vm.runInContext(fs.readFileSync(SETTINGS_DEFAULTS_SRC, "utf8")
    + "\n;globalThis.SettingsDefaults = SettingsDefaults;", ctx);
  vm.runInContext(fs.readFileSync(DEFAULTS_SRC, "utf8")
    + "\n;globalThis.GarageDefaults = GarageDefaults;", ctx);
  vm.runInContext(fs.readFileSync(STORE_SRC, "utf8")
    + "\n;globalThis.GameStore = GameStore;", ctx);
  // SettingsExport needs Log + Teams.sanitizeCustom stubs for applyGarage.
  ctx.Log = { info() {}, warn() {}, error() {} };
  ctx.Teams = { sanitizeCustom: (v) => v };
  vm.runInContext(fs.readFileSync(EXPORT_SRC, "utf8")
    + "\n;globalThis.SettingsExport = SettingsExport;", ctx);
  return ctx;
}

test("every shipped garage key is garage-shaped and META matches", () => {
  const r = check();
  assert.ok(r.ok, r.problems.join("\n"));
  assert.ok(r.keys >= 30, `expected a full garage export, got ${r.keys} keys`);
});

test("the store answers from GarageDefaults on a miss, not the call-site literal", () => {
  const { GameStore, GarageDefaults } = load();
  const store = GameStore.store;
  assert.equal(store.get("team", 99), GarageDefaults.get("team"));
  assert.equal(store.get("driver", 99), GarageDefaults.get("driver"));
  assert.deepEqual(store.get("parts.mercedes", {}), GarageDefaults.get("parts.mercedes"));
  assert.equal(store.get("livery.haas", "default"), GarageDefaults.get("livery.haas"));
  assert.deepEqual(store.get("livery.custom.williams", []), GarageDefaults.get("livery.custom.williams"));
  assert.deepEqual(store.get("setup.mercedes", {}), GarageDefaults.get("setup.mercedes"));
});

test("a stored player value still outranks the shipped garage", () => {
  const { GameStore, GarageDefaults } = load({
    "apex26.team": "2",
    "apex26.parts.mercedes": JSON.stringify({ engine: "player_build" }),
  });
  const store = GameStore.store;
  assert.equal(store.get("team", 0), 2);
  assert.deepEqual(store.get("parts.mercedes", {}), { engine: "player_build" });
  assert.notEqual(store.get("team", 0), GarageDefaults.get("team"));
});

test("an unlisted garage key is untouched (call-site default wins)", () => {
  const { GameStore, GarageDefaults } = load();
  assert.equal(GarageDefaults.has("parts.notateam"), false);
  assert.deepEqual(GameStore.store.get("parts.notateam", { x: 1 }), { x: 1 });
});

test("GarageDefaults.file() is a valid apex26-garage-v1 the loader accepts", () => {
  const { SettingsExport, GarageDefaults } = load();
  const file = GarageDefaults.file();
  assert.equal(file.format, "apex26-garage-v1");
  assert.equal(file.count, GarageDefaults.keys().length);
  const r = SettingsExport.applyGarage(file);
  assert.equal(r.ok, true);
  assert.ok(r.applied >= 30, `applied ${r.applied}`);
  assert.equal(r.skipped, 0);
});

test("resetGarage clears extras then restores the shipped garage", () => {
  const { SettingsExport, GarageDefaults, GameStore, localStorage } = load({
    "apex26.team": "4",
    "apex26.parts.mercedes": JSON.stringify({ engine: "player_build" }),
    "apex26.customTeam": JSON.stringify({ id: "custom", name: "X", drivers: [{ name: "You", code: "YOU", num: 99 }] }),
    "apex26.difficulty": JSON.stringify("easy"), // not a garage key — must survive
  });
  const r = SettingsExport.resetGarage();
  assert.equal(r.ok, true);
  assert.ok(r.applied >= 30);
  assert.equal(GameStore.store.get("team", 99), GarageDefaults.get("team"));
  assert.deepEqual(GameStore.store.get("parts.mercedes", {}), GarageDefaults.get("parts.mercedes"));
  assert.equal(localStorage.getItem("apex26.customTeam"), null, "extras not in the shipped file are cleared");
  assert.equal(JSON.parse(localStorage.getItem("apex26.difficulty")), "easy", "settings survive a garage reset");
});

test("part and livery ids match the source export verbatim", () => {
  // Canonical export kept next to other fixtures so CI can re-check without
  // scratch/. Re-apply with: node tools/gen/garage-defaults.mjs tests/data/garage-defaults-export.json
  const srcPath = path.join(ROOT, "tests/data/garage-defaults-export.json");
  assert.ok(fs.existsSync(srcPath), "tests/data/garage-defaults-export.json missing");
  const exp = JSON.parse(fs.readFileSync(srcPath, "utf8"));
  const { def } = readDefaults();
  for (const k of Object.keys(exp.garage).sort()) {
    assert.ok(isGarageKey(k), k);
    assert.deepEqual(def[k], exp.garage[k], k);
  }
  assert.equal(Object.keys(def).length, Object.keys(exp.garage).length);
  // Spot-check the ids the player-facing brief called out.
  assert.equal(def.team, 0);
  assert.equal(def["livery.haas"], "custom_17893761682261");
  assert.equal(def["parts.mercedes"].engine, "sig_mercedes_zero");
  assert.equal(def["parts.racingbulls"].tyres, "sig_rb_street");
});

test("garage-defaults.js loads before the store in the manifest", () => {
  const manifest = require(MANIFEST);
  const full = manifest.FULL;
  const gi = full.indexOf("js/data/garage-defaults.js");
  const si = full.indexOf("js/core/store.js");
  assert.ok(gi >= 0, "garage-defaults.js missing from FULL");
  assert.ok(si > gi, "garage-defaults.js must precede store.js");
});
