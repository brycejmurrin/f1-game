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

function boot(sel = { teamIdx: 0, driverIdx: 0 }, over = {}) {
  const ctx = vm.createContext({ console, Object, Math, Array, String, Number, JSON,
    document: { querySelectorAll: () => [] } });
  ctx.globalThis = ctx;
  for (const f of ["js/core/mat4.js", "js/data/legends.js", "js/career/custom-team.js"]) {
    vm.runInContext(readFileSync(new URL(`../../${f}`, import.meta.url), "utf8"), ctx, { filename: f });
  }
  const Legends = vm.runInContext("Legends", ctx);
  const CustomTeam = vm.runInContext("CustomTeam", ctx);
  const saved = {};
  const store = {
    get: (k, d) => (k in saved ? saved[k] : d),
    getStored: (k) => (Object.hasOwn(saved, k) ? saved[k] : undefined),
    set: (k, v) => { saved[k] = v; },
  };
  const Teams = { LIST: [{ id: "mclaren" }], sanitizeCustom: (t) => t };
  const invalidated = [];
  const ct = CustomTeam.create({
    $: () => null, store, Teams, DEFAULT_CUSTOM: { id: "custom" },
    invalidateDecalTextures: (id) => invalidated.push(id), invalidateCustomMeshCaches() {}, spMeshBust() {},
    getSoundOn: () => false, GameAudio: { uiTick() {} },
    getEls: () => ({}), getTeamIdx: () => sel.teamIdx, setTeamIdx() {},
    getDriverIdx: () => sel.driverIdx, setDriverIdx() {}, buildSelect() {}, buildSetup() {},
    isCarsetupVisible: () => false, hexToRgb: () => [0, 0, 0], rgbToHex: () => "#000",
    hexToArr: () => [0, 0, 0], clamp: (v) => v,
    getLivDraftOverride: () => null, setLivDraftOverride() {},
    ...over,
  });
  return { ct, Legends, store, saved, Teams, invalidated };
}

test("an empty sheet is seeded with the picked legend's period car", () => {
  const { ct, Legends, store } = boot();
  const fallback = { engine: "fallback" };
  assert.equal(store.get("parts.legends", fallback), fallback, "get can supply a fallback");
  assert.equal(store.getStored("parts.legends"), undefined, "a fallback is not a stored player sheet");
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

test("G1: syncing MY TEAM while MY TEAM is selected keeps the picked legend and its tuned build", () => {
  // Boot with Legends selected (it lands after custom: index 2), pick Senna and
  // tune the sheet; then the player selects MY TEAM and saves it (or another tab
  // writes customTeam) -> syncCustomTeam(). Mid-sync MY TEAM's old index equalled
  // the Legends slot, so legendSeat() read MY TEAM's driver seat (0) and flipped
  // the pick to Schumacher, replacing the build with the period car.
  const sel = { teamIdx: 2, driverIdx: 0 };
  const { ct, Legends, Teams, store } = boot(sel);
  ct.syncCustomTeam();                                   // boot: [mclaren, custom, legends]
  const idx = (id) => Teams.LIST.findIndex((t) => t.id === id);
  assert.equal(idx("legends"), 2);
  ct.syncLegendsTeam(1);                                 // Senna
  store.set("parts.legends", Object.assign({}, store.get("parts.legends", {}), { engine: "sprint" }));
  sel.teamIdx = idx("custom"); sel.driverIdx = 0;        // MY TEAM selected, seat 0
  ct.syncCustomTeam();
  assert.equal(Teams.LIST[idx("legends")].legend, Legends.LIST[1].id, "the legend pick survives the sync");
  assert.equal(store.get("parts.legends", {}).engine, "sprint", "and so does its tuned build");
  ct.syncCustomTeam();                                   // a second sync is still a no-op
  assert.equal(Teams.LIST[idx("legends")].legend, Legends.LIST[1].id);
  assert.equal(Teams.LIST.filter((t) => t.id === "custom").length, 1);
  assert.equal(Teams.LIST.filter((t) => t.id === "legends").length, 1);
});

test("G1: with LEGENDS selected the picker's seat still wins through a MY TEAM sync", () => {
  const sel = { teamIdx: 2, driverIdx: 0 };
  const { ct, Legends, Teams } = boot(sel);
  ct.syncCustomTeam();
  sel.driverIdx = 3;                                     // the driver picker moved the legend
  ct.syncCustomTeam();
  const t = Teams.LIST.find((x) => x.id === "legends");
  assert.equal(t.legend, Legends.LIST[3].id);
});

function fakeDialog() {
  const els = new Map();
  const el = (id) => {
    if (!els.has(id)) {
      const cls = new Set();
      els.set(id, {
        value: "#112233", textContent: "", style: {}, listeners: {},
        classList: { add: (c) => cls.add(c), remove: (c) => cls.delete(c), contains: (c) => cls.has(c) },
        addEventListener(t, f) { this.listeners[t] = f; },
      });
    }
    return els.get(id);
  };
  return { el, els };
}

test("MY TEAM preview invalidates the decal atlas as the livery changes, not only on SAVE", () => {
  const d = fakeDialog();
  let draft = null;
  const { ct, invalidated } = boot({ teamIdx: 0, driverIdx: 0 }, {
    $: d.el, hexToRgb: (h) => h, rgbToHex: (a) => a, hexToArr: (h) => h,
    DEFAULT_CUSTOM: { id: "custom", name: "My Team", short: "YOU", color: "#111111", color2: "#222222",
      drivers: [{ name: "N", code: "YOU", num: 7 }], livery: {} },
    getEls: () => ({ customize: {} }), setLivDraftOverride: (v) => { draft = v; },
  });
  ct.openCustomize();
  assert.ok(draft, "the draft override is live");
  const n0 = invalidated.filter((x) => x === "custom").length;
  assert.ok(n0 >= 1, "opening the dialog drops the atlas for the draft");
  ct.init();                                            // wireDialog + (inert here) store/LiveryTex hooks
  // LOGO TINT row: a colour is chosen -> the draft's livery changes -> atlas dropped.
  const tint = d.el("cz-logo");
  tint.value = "#ff0000";
  tint.listeners.input();
  assert.equal(draft.liv.logo, "#ff0000");
  assert.ok(invalidated.filter((x) => x === "custom").length > n0, "LOGO TINT change invalidates the atlas");
  // An identical event (a drag repeating the same value) does not thrash the atlas.
  const n1 = invalidated.filter((x) => x === "custom").length;
  tint.listeners.input();
  assert.equal(invalidated.filter((x) => x === "custom").length, n1, "an unchanged preview is deduped");
  // CANCEL drops the draft atlas so the saved look comes back.
  d.el("cz-cancel").onclick();
  assert.ok(invalidated.filter((x) => x === "custom").length > n1, "closing the preview restores the saved atlas");
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
