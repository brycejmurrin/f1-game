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

function boot() {
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
    getEls: () => ({}), getTeamIdx: () => 0, setTeamIdx() {},
    getDriverIdx: () => 0, setDriverIdx() {}, buildSelect() {}, buildSetup() {},
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
