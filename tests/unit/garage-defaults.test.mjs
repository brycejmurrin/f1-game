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

test("an empty written parts sheet is a HIT, not a GarageDefaults miss", () => {
  const { GameStore, GarageDefaults } = load({ "apex26.parts.mclaren": "{}" });
  assert.deepEqual(GameStore.store.get("parts.mclaren", { x: 1 }), {});
  assert.notDeepEqual(GameStore.store.get("parts.mclaren", {}), GarageDefaults.get("parts.mclaren"));
});

test("an empty written custom-livery list is a HIT, not a GarageDefaults miss", () => {
  const { GameStore, GarageDefaults } = load({ "apex26.livery.custom.mclaren": "[]" });
  assert.deepEqual(GameStore.store.get("livery.custom.mclaren", [{ x: 1 }]), []);
  assert.notDeepEqual(GameStore.store.get("livery.custom.mclaren", []),
    GarageDefaults.get("livery.custom.mclaren"));
  const spec = fs.readFileSync(path.join(ROOT, "tests/specs/parts-liveries.spec.js"), "utf8");
  assert.match(spec, /function pinEmptyCustoms/,
    "creator tests must write [] after forget so GarageDefaults cannot refill");
});

test("pinFreePlay writes an empty factory sheet instead of deleting the parts key", () => {
  const helpers = fs.readFileSync(path.join(ROOT, "tests/helpers/shared-page.js"), "utf8");
  const pin = helpers.slice(helpers.indexOf("export async function pinFreePlay"),
    helpers.indexOf("export async function garageTeam"));
  assert.match(pin, /S\.set\("parts\." \+ id, p \|\| \{\}\)/);
  assert.equal(pin.includes("removeItem"), false, "null parts must not miss into GarageDefaults");
  const budget = fs.readFileSync(path.join(ROOT, "tests/specs/parts-budget.spec.js"), "utf8");
  assert.match(budget, /pinFreePlay\(page, \{ team: "mclaren"/);
  for (const spec of ["understeer-cue", "ui-resize", "assets-api"]) {
    const src = fs.readFileSync(path.join(ROOT, `tests/specs/${spec}.spec.js`), "utf8");
    assert.ok(src.includes("pinFactorySeat"), spec + " must pin factory McLaren before goto");
  }
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
  // Compare to the literal shipped value, not GarageDefaults.get() (that read
  // is the same object the store returns when get() aliased, so it proved nothing).
  assert.equal(GameStore.store.get("parts.mercedes", {}).engine, "sig_mercedes_zero");
  assert.deepEqual(GameStore.store.get("parts.mercedes", {}), GarageDefaults.get("parts.mercedes"));
  assert.equal(localStorage.getItem("apex26.customTeam"), null, "extras not in the shipped file are cleared");
  assert.equal(JSON.parse(localStorage.getItem("apex26.difficulty")), "easy", "settings survive a garage reset");
});

test("RESET GARAGE restores the SHIPPED garage, not the player's edits (bug-hunt 1.1)", () => {
  // The garage mutates the object store.get returns in place (p[cat] = opt.id)
  // then store.set()s it. On a miss that object used to BE the shipped DEF
  // entry, so the edit rewrote the defaults and a reset restored the edit.
  const { SettingsExport, GarageDefaults, GameStore } = load();
  const snapParts = JSON.stringify(GarageDefaults.get("parts.mercedes"));
  const snapLiv = JSON.stringify(GarageDefaults.get("livery.custom.mercedes"));
  const snapFile = JSON.stringify(GarageDefaults.file().garage);
  const store = GameStore.store;

  const p = store.get("parts.mercedes", {});
  p.engine = "player_build";
  store.set("parts.mercedes", p);
  const liv = store.get("livery.custom.mercedes", []);
  liv[0].c1[0] = 0.123;
  liv[0].name = "Edited";
  store.set("livery.custom.mercedes", liv);

  assert.equal(JSON.stringify(GarageDefaults.get("parts.mercedes")), snapParts, "get() hands out a copy");
  assert.equal(JSON.stringify(GarageDefaults.get("livery.custom.mercedes")), snapLiv, "nested arrays are copied too");
  assert.equal(JSON.stringify(GarageDefaults.file().garage), snapFile, "file() is not the edited table");

  assert.equal(SettingsExport.resetGarage().ok, true);
  assert.equal(JSON.stringify(store.get("parts.mercedes", {})), snapParts, "reset restores the shipped parts");
  assert.deepEqual(JSON.parse(JSON.stringify(store.get("livery.custom.mercedes", []))), JSON.parse(snapLiv), "reset restores the shipped livery");

  // file() hands out a deep copy: scribbling on it cannot reach the table.
  const f = GarageDefaults.file();
  f.garage["parts.mercedes"].engine = "x";
  f.garage["livery.custom.mercedes"][0].c1[0] = 9;
  assert.equal(JSON.stringify(GarageDefaults.file().garage), snapFile);
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

test("game.js keeps the McLaren call-site; GarageDefaults still wins on a miss", () => {
  // store.get("team", 0) on js/game.js reroutes test:circuits+collisions and
  // dropped 21 selected specs (PR #1021 run 37472255445). The miss-path team
  // is GarageDefaults.team (0, Mercedes); the call-site stays 2 so a game.js
  // edit is not required to ship the garage.
  const game = fs.readFileSync(path.join(ROOT, "js/game.js"), "utf8");
  assert.match(game, /store\.get\("team", 2\)/);
  assert.doesNotMatch(game, /store\.get\("team", 0\)/);
  const { GameStore, GarageDefaults } = load();
  assert.equal(GameStore.store.get("team", 2), GarageDefaults.get("team"));
  assert.equal(GarageDefaults.get("team"), 0);
});

test("pinFactorySeat lives on factory-seat.js, not the fixtures re-export", () => {
  // Re-exporting from fixtures.js marked ~120 specs rank-2 imported and
  // bloated the selected plan. Specs that need the pin import the helper.
  const fixtures = fs.readFileSync(path.join(ROOT, "tests/helpers/fixtures.js"), "utf8");
  assert.doesNotMatch(fixtures, /pinFactorySeat/);
  const helper = fs.readFileSync(path.join(ROOT, "tests/helpers/factory-seat.js"), "utf8");
  assert.match(helper, /export async function pinFactorySeat/);
  for (const spec of ["physics-characterization", "pit-lane", "understeer-cue", "ui-resize"]) {
    const src = fs.readFileSync(path.join(ROOT, `tests/specs/${spec}.spec.js`), "utf8");
    assert.match(src, /from "\.\.\/helpers\/factory-seat\.js"/, spec);
  }
});
