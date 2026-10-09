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
import { seedLog } from "../helpers/seed-log.mjs";

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
  // Compared as data: get() hands out a COPY of an object default (see the
  // mutation test below), and the sandbox's JSON is the host's, so the copy's
  // prototype is not the VM literal's.
  const data = (v) => JSON.parse(JSON.stringify(v));
  assert.deepEqual(data(store.get("parts.mercedes", {})), data(GarageDefaults.get("parts.mercedes")));
  assert.equal(store.get("livery.haas", "default"), GarageDefaults.get("livery.haas"));
  assert.deepEqual(data(store.get("livery.custom.williams", [])), data(GarageDefaults.get("livery.custom.williams")));
  assert.deepEqual(data(store.get("setup.mercedes", {})), data(GarageDefaults.get("setup.mercedes")));
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

test("a caller that edits what get() returned cannot rewrite the shipped default", () => {
  const { GameStore, GarageDefaults } = load();
  const store = GameStore.store;
  const before = JSON.stringify(GarageDefaults.get("parts.ferrari"));
  const p = store.get("parts.ferrari");
  assert.notEqual(p, GarageDefaults.get("parts.ferrari"), "get() must hand out a copy");
  p.engine = "PLAYER_EDIT";   // setup-sheet.js mutates the build it read, in place
  assert.equal(JSON.stringify(GarageDefaults.get("parts.ferrari")), before);
  assert.equal(store.get("parts.ferrari").engine, GarageDefaults.get("parts.ferrari").engine,
    "the next miss still answers the shipped build");
  const fresh = JSON.parse(before);
  assert.deepEqual(JSON.parse(JSON.stringify(store.get("parts.ferrari"))), fresh);
});

test("getStored answers what the player wrote, never a shipped default", () => {
  const { GameStore, GarageDefaults } = load();
  const store = GameStore.store;
  assert.ok(GarageDefaults.has("parts.legends"));
  assert.ok(store.get("parts.legends", null), "get() sees the shipped build");
  assert.equal(store.getStored("parts.legends"), undefined, "…but nothing was ever stored");
  store.set("parts.legends", { engine: "mine" });
  assert.deepEqual(JSON.parse(JSON.stringify(store.getStored("parts.legends"))), { engine: "mine" });
});

test("the shipped garage is usable: every parts build fits Parts.BUDGET, or FREE BUILD ships on", () => {
  // The click gate in js/garage/setup-sheet.js rejects any swap whose total ends
  // over cap — downgrades included — so a shipped build over budget has zero
  // clickable rows. 8 of 11 teams shipped that way until unlimitedBudget did too.
  const ctx = vm.createContext({ Math, console, Object, Array, Number, String, JSON, isFinite, Map, Set });
  seedLog(ctx);
  ctx.window = ctx;
  for (const f of ["js/core/mat4.js", "js/physics/consts.js", "js/data/teams.js", "js/car/parts.js"])
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx, { filename: f });
  const { Teams, Parts } = vm.runInContext("({ Teams, Parts })", ctx);
  const { GameStore, GarageDefaults } = load();
  const free = GameStore.store.get("unlimitedBudget", false) === true;
  const over = [];
  let checked = 0;
  for (const k of GarageDefaults.keys()) {
    if (!k.startsWith("parts.")) continue;
    const team = Teams.LIST.find((t) => t.id === k.slice("parts.".length));
    if (!team) continue;
    checked++;
    const cost = Parts.getCost(GarageDefaults.get(k), team);
    if (cost > Parts.BUDGET) over.push(`${team.id}: ${cost} > ${Parts.BUDGET}`);
  }
  assert.ok(checked >= 10, `expected a build per team, saw ${checked}`);
  assert.ok(over.length === 0 || free,
    "shipped builds over budget while FREE BUILD is off — no row would be clickable:\n" + over.join("\n"));
});

test("a fresh install fields the first legend in his own period car, not the shipped build", async () => {
  const { createGame } = require("../../tools/lib/game-vm.cjs");
  const g = await createGame({});
  try {
    const { Legends } = g.ctx;
    const want = JSON.parse(JSON.stringify(Legends.parts(Legends.LIST[0].id)));
    assert.deepEqual(JSON.parse(JSON.stringify(g.G.getTeamParts("legends"))), want);
  } finally { g.close(); }
});
