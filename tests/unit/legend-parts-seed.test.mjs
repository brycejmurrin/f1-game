/* legend-parts-seed.test.mjs — the PERIOD CAR has to reach the garage SHEET.
 *
 * A team's `factory` build renders an AI car, so a legend duel RIVAL already
 * arrived in the right machine. The player's own seat reads `parts.legends`
 * instead, and an empty sheet resolves to Parts DEFAULTS — so picking Fangio
 * in the garage handed you a 2026 chassis in Silver Arrow paint while
 * duelling him produced the 1954 car.
 *
 * Twelve legends share ONE `legends` id, so there is one sheet between them
 * and the write policy is the whole behaviour: seed an empty sheet, reseed on
 * a real switch, and never touch it on a boot or a re-sync of the same seat —
 * or a reload would wipe a build the player spent credits on.
 *
 * custom-team.js is loaded whole with stub hooks: create() only closes over
 * them, so syncLegendsTeam is callable without any DOM.
 *
 * Run: node --test tests/unit/legend-parts-seed.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { seedSaveMigrate } from "../helpers/seed-save-migrate.mjs";

function boot(sel = { teamIdx: 0, driverIdx: 0 }) {
  const ctx = vm.createContext({ console, Object, Math, Array, String, Number, JSON });
  ctx.globalThis = ctx;
  for (const f of ["js/core/mat4.js", "js/data/legends.js", "js/career/custom-team.js"]) {
    vm.runInContext(readFileSync(new URL(`../../${f}`, import.meta.url), "utf8"), ctx, { filename: f });
  }
  const Legends = vm.runInContext("Legends", ctx);
  const CustomTeam = vm.runInContext("CustomTeam", ctx);
  const saved = {};
  const store = {
    get: (k, d) => (k in saved ? saved[k] : d),
    set: (k, v) => { saved[k] = v; },
  };
  const Teams = { LIST: [{ id: "mclaren" }] };
  const ct = CustomTeam.create({
    $: () => null, store, Teams, DEFAULT_CUSTOM: { id: "custom" },
    invalidateDecalTextures() {}, invalidateCustomMeshCaches() {}, spMeshBust() {},
    getSoundOn: () => false, GameAudio: { uiTick() {} },
    getEls: () => ({}), getTeamIdx: () => sel.teamIdx, setTeamIdx() {},
    getDriverIdx: () => sel.driverIdx, setDriverIdx() {}, buildSelect() {}, buildSetup() {},
    isCarsetupVisible: () => false, hexToRgb: () => [0, 0, 0], rgbToHex: () => "#000",
    hexToArr: () => [0, 0, 0], clamp: (v) => v,
    getLivDraftOverride: () => null, setLivDraftOverride() {},
  });
  return { ct, Legends, store, saved, Teams };
}

test("an empty sheet is seeded with the picked legend's period car", () => {
  const { ct, Legends, store } = boot();
  ct.syncLegendsTeam(2);                       // roster index 2 — Fangio
  const want = Legends.parts(Legends.LIST[2].id);
  assert.deepEqual(store.get("parts.legends", null), want);
  // …and it really is the 1954 car, not Parts DEFAULTS.
  assert.equal(want.suspension, "torsion_bar");
  assert.equal(want.aero, "minimal");
});

test("switching legend reseeds — you asked for his car, not the last one's", () => {
  const { ct, Legends, store } = boot();
  ct.syncLegendsTeam(2);                       // Fangio
  ct.syncLegendsTeam(1);                       // Senna
  assert.deepEqual(store.get("parts.legends", null), Legends.parts(Legends.LIST[1].id));
  assert.notDeepEqual(Legends.parts(Legends.LIST[1].id), Legends.parts(Legends.LIST[2].id),
    "the two must differ, or this test proves nothing");
});

test("a re-sync of the SAME seat leaves the player's build alone", () => {
  const { ct, store } = boot();
  ct.syncLegendsTeam(0);
  const mine = Object.assign({}, store.get("parts.legends", {}), { brakes: "carbon" });
  store.set("parts.legends", mine);
  ct.syncLegendsTeam(0);                       // same legend again
  assert.equal(store.get("parts.legends", {}).brakes, "carbon", "a re-sync must not wipe a paid-for fit");
});

test("boot does not overwrite a sheet saved in an earlier session", () => {
  const { ct, store } = boot();
  // A sheet already on disk, and no legends entry in Teams.LIST yet — which is
  // exactly the boot path, where `prev` is null.
  store.set("parts.legends", { engine: "race", brakes: "carbon" });
  ct.syncLegendsTeam(0);
  assert.deepEqual(store.get("parts.legends", null), { engine: "race", brakes: "carbon" });
});

test("every legend's seeded sheet fits the garage budget", () => {
  const { ct, Legends, store } = boot();
  for (let i = 0; i < Legends.LIST.length; i++) {
    ct.syncLegendsTeam(i);
    const sheet = store.get("parts.legends", null);
    assert.ok(sheet, `${Legends.LIST[i].id}: a sheet must be written`);
    assert.deepEqual(sheet, Legends.parts(Legends.LIST[i].id));
  }
});

test("boot rebuilds the SAVED legend, not legend 0: no Fangio sheet in Schumacher's paint", () => {
  // The saved selection is Legends (the slot about to be appended after the one
  // real team here: index 1) and driver 2, Fangio. syncCustomTeam calls
  // syncLegendsTeam() with no seat, before the entry exists.
  const { ct, Legends, Teams } = boot({ teamIdx: 1, driverIdx: 2 });
  ct.syncLegendsTeam();
  const entry = Teams.LIST.find((t) => t.id === "legends");
  assert.equal(entry.legend, "fangio", "the saved legend comes back");
  assert.deepEqual(entry.color, Legends.byId("fangio").livery.c1, "in his own paint");
  assert.equal(entry.crest, "mercedes");
  // Legends not the saved team: a first boot builds legend 0, as before.
  const other = boot({ teamIdx: 0, driverIdx: 2 });
  other.ct.syncLegendsTeam();
  assert.equal(other.Teams.LIST.find((t) => t.id === "legends").legend, Legends.LIST[0].id);
});

// D2 — the FRESH-INSTALL case. js/data/garage-defaults.js ships `parts.legends`
// (a wing-68 build) and GameStore.get answers from it on a miss, so on a first
// boot the sheet is never "empty": seedLegendParts saw a non-empty sheet, left it,
// and the default seat 0 (Schumacher) raced in somebody else's car. PR #1289
// makes seedLegendParts read the RAW key (a miss is a miss), after which this
// passes; until that change is in the tree it is a known failure, hence `todo`.
test("a fresh install's Legends seat 0 builds the period car, not the shipped sheet", { todo: true }, () => {
  const disk = new Map();
  const localStorage = { getItem: (k) => (disk.has(k) ? disk.get(k) : null), setItem: (k, v) => disk.set(k, String(v)),
    removeItem: (k) => disk.delete(k), clear: () => disk.clear(), key: (i) => [...disk.keys()][i] ?? null, get length() { return disk.size; } };
  const ctx = vm.createContext({ console, Object, Math, Array, String, Number, JSON, Date, Map, Set, Error, localStorage,
    document: { querySelector: () => null } });
  ctx.window = ctx; ctx.globalThis = ctx;
  seedSaveMigrate(ctx);
  ctx.Log = { info() {}, warn() {}, error() {}, debug() {} };
  const read = (f) => readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");
  vm.runInContext(read("js/data/garage-defaults.js") + "\n;globalThis.GarageDefaults = GarageDefaults;", ctx);
  vm.runInContext(read("js/core/store.js") + "\n;globalThis.GameStore = GameStore;", ctx);
  for (const f of ["js/core/mat4.js", "js/data/legends.js", "js/career/custom-team.js"])
    vm.runInContext(read(f), ctx, { filename: f });
  const { store } = vm.runInContext("GameStore", ctx);
  const Legends = vm.runInContext("Legends", ctx), CustomTeam = vm.runInContext("CustomTeam", ctx);
  assert.ok(store.get("parts.legends", null), "precondition: the shipped sheet answers on a miss");
  assert.equal(localStorage.getItem("apex26.parts.legends"), null, "precondition: nothing is stored");
  const Teams = { LIST: [{ id: "mclaren" }] };
  const ct = CustomTeam.create({
    $: () => null, store, Teams, DEFAULT_CUSTOM: { id: "custom" },
    invalidateDecalTextures() {}, invalidateCustomMeshCaches() {}, spMeshBust() {},
    getSoundOn: () => false, GameAudio: { uiTick() {} }, getEls: () => ({}),
    getTeamIdx: () => 0, setTeamIdx() {}, getDriverIdx: () => 0, setDriverIdx() {}, buildSelect() {}, buildSetup() {},
    isCarsetupVisible: () => false, hexToRgb: () => [0, 0, 0], rgbToHex: () => "#000", hexToArr: () => [0, 0, 0],
    clamp: (v) => v, getLivDraftOverride: () => null, setLivDraftOverride() {},
  });
  ct.syncLegendsTeam(0);                       // Legends seat 0 on a fresh store
  assert.deepEqual(JSON.parse(JSON.stringify(store.get("parts.legends", null))), JSON.parse(JSON.stringify(Legends.parts("schumacher"))));
});
