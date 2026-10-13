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
import { makeDom } from "../helpers/mini-dom.mjs";

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

// Parts + Teams in a VM (shared by the tripwire and the setup-sheet gate test).
function loadPartsVm() {
  const ctx = vm.createContext({ Math, console, Object, Array, Number, String, JSON, isFinite, Map, Set });
  seedLog(ctx);
  ctx.window = ctx;
  for (const f of ["js/core/mat4.js", "js/physics/consts.js", "js/data/teams.js", "js/car/parts.js"])
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx, { filename: f });
  return { ctx, ...vm.runInContext("({ Teams, Parts, M4 })", ctx) };
}
const overBudgetBuilds = (Teams, Parts, GarageDefaults) => {
  const over = [];
  let checked = 0;
  for (const k of GarageDefaults.keys()) {
    if (!k.startsWith("parts.")) continue;
    const team = Teams.LIST.find((t) => t.id === k.slice("parts.".length));
    if (!team) continue;
    checked++;
    const cost = Parts.getCost(GarageDefaults.get(k), team);
    if (cost > Parts.BUDGET) over.push({ team, key: k, cost });
  }
  return { over, checked };
};

// TRIPWIRE, not a guard: it passes whenever FREE BUILD ships on (the current
// default), so it only goes red if someone turns FREE BUILD off while the
// shipped builds are still over cap. The gate that makes an over-cap build
// usable (or not) is pinned by the setup-sheet test below.
test("tripwire: shipped parts builds over Parts.BUDGET are only tolerated while FREE BUILD ships on", () => {
  const { Teams, Parts } = loadPartsVm();
  const { GameStore, GarageDefaults } = load();
  const free = GameStore.store.get("unlimitedBudget", false) === true;
  const { over, checked } = overBudgetBuilds(Teams, Parts, GarageDefaults);
  assert.ok(checked >= 10, `expected a build per team, saw ${checked}`);
  assert.ok(over.length === 0 || free,
    "shipped builds over budget while FREE BUILD is off — no row would be clickable:\n"
    + over.map((o) => `${o.team.id}: ${o.cost} > ${Parts.BUDGET}`).join("\n"));
});

test("setup sheet: a swap on an over-cap shipped build is accepted only while G.unlimitedBudget", () => {
  // js/garage/setup-sheet.js rejects any swap whose total ends over cap —
  // downgrades included — unless unlimited. With the shipped builds over cap,
  // FREE BUILD is what makes a single row clickable.
  const { ctx, Teams, Parts } = loadPartsVm();
  const { GarageDefaults } = load();
  const { over } = overBudgetBuilds(Teams, Parts, GarageDefaults);
  assert.ok(over.length > 0, "the premise: at least one shipped build is over the cap");
  const { team, key } = over[0];
  const run = (unlimitedBudget) => {
    const dom = makeDom();
    const saved = [];
    const build = JSON.parse(JSON.stringify(GarageDefaults.get(key)));
    const catId = Parts.CATALOG.find((c) => c.options.length > 1
      && c.options.some((o) => o.id !== build[c.id] && Parts.isOptionAvailable(o, team))).id;
    const cat = Parts.CATALOG.find((c) => c.id === catId);
    const G = {
      $: (id) => dom.byId(id), els: { select: dom.byId("select"), overlay: dom.byId("overlay") },
      cssCol: () => "#fff", store: { get: (k, d) => (k === "garageTab" ? catId : d), set() {} },
      arrToHex: () => "#112233", hexToArr: () => [0.1, 0.2, 0.3],
      getTeamParts: () => build, saveTeamParts: (id, p) => saved.push([id, p[catId]]),
      getLiveryId: () => "default", saveLiveryId() {},
      getCustomLiveries: () => [], setCustomLiveries() {}, getLiveries: () => [], invalidateDecalTextures: null,
      teamIdx: Teams.LIST.indexOf(team), driverIdx: 0, soundOn: false, careerOwned: () => false, unlimitedBudget,
      peerSeats: () => [], teamSwatch: () => dom.document.createElement("span"),
      setTeamPicker() {}, openCustomize() {}, livDraftOverride: null, _spMeshKey: "", setupPreviewOn: false,
    };
    Object.assign(ctx, {
      document: Object.assign(Object.create(dom.document), { createTextNode: (t) => { const n = dom.document.createElement("span"); n.textContent = String(t); return n; } }),
      addEventListener() {}, removeEventListener() {}, setTimeout: () => 0, clearTimeout() {},
      MutationObserver: class { observe() {} },
      GameAudio: { uiTick() {}, uiSelect() {}, uiReject() {}, init() {} }, ScrollFade: { refresh() {} },
      Car3D: { FINISH_SURFACE: { satin: {}, chrome: {} } },
      GarageExperience: { partSummary: () => () => {}, statsOf: (t) => t.stats || { speed: 85, accel: 85, cornering: 85, braking: 85 } },
      SetupTune: { FIELDS: [], RANGE: {}, get: () => ({ rideR: 60, rideF: 25, brakeBias: 56 }), set() {}, reset() {}, isDefault: () => true, mods: () => null, rake: () => 0 },
      LiveryTex: { NUM_FONT_IDS: ["default", "block"], SPONSOR_PACK_IDS: ["default", "clean"] },
      PhysicsConsts: ctx.PhysicsConsts || { WET_GRIP: { rain: [1, 1.2, 1.4] } },
    });
    const SetupUI = vm.runInContext(fs.readFileSync(path.join(ROOT, "js/garage/setup-sheet.js"), "utf8").replace(/^const\b/gm, "var")
      + "\n;SetupUI", ctx, { filename: "js/garage/setup-sheet.js" });
    const ui = SetupUI.create(G);
    ui.openSetup();
    const rows = dom.byId("cs-options").querySelectorAll(".cs-opt")
      .filter((r) => r.getAttribute("aria-pressed") === "false");
    assert.ok(rows.length > 0, "the active category lists swappable options");
    const startLen = saved.length;
    for (const r of rows) r.onclick();
    return { clicked: rows.length, accepted: saved.length - startLen, cat };
  };
  const capped = run(false), free = run(true);
  // Every swap that ends under cap is legal when capped; on a build this far over, none is.
  assert.equal(capped.accepted, 0, "capped: an over-cap build accepts no swap, downgrade or not");
  assert.equal(free.accepted, free.clicked, "G.unlimitedBudget: every swap is accepted");
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

test("a shipped setup sheet is the team's WORKS sheet: a fresh install does not read TUNED", () => {
  // setup.mercedes shipped {arbF 6, arbR 5} against SetupTune.DEFAULTS {7, 7}, so
  // SetupTune.isDefault("mercedes") was false from the first boot: the SETUP tab
  // said TUNED and carried a small unasked-for handling offset.
  const { def } = readDefaults();
  const ctx = vm.createContext({
    Math, console, Object, Array, Number, JSON, isFinite,
    GameStore: { store: { get: (k, d) => (("setup." + k.replace(/^setup\./, "")) in def ? def["setup." + k.replace(/^setup\./, "")] : d), set() {} } },
    Log: { info() {}, warn() {}, debug() {}, error() {} },
  });
  ctx.window = ctx;
  for (const f of ["js/core/mat4.js", "js/physics/consts.js", "js/data/teams.js", "js/car/parts.js", "js/garage/setup-tune.js"])
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx, { filename: f });
  const S = vm.runInContext("SetupTune", ctx);
  const shipped = Object.keys(def).filter((k) => k.startsWith("setup."));
  assert.ok(shipped.length > 0);
  for (const k of shipped) {
    const id = k.slice("setup.".length);
    assert.equal(S.isDefault(id), true, `${k} must equal SetupTune.defaults("${id}")`);
  }
});

