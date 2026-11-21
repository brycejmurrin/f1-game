/* game-ctx-closed.test.mjs — the G façade is a closed, declared surface (#5982).
 *
 * 1. js/game.js closes G right after its literal (Object.preventExtensions): a
 *    typo'd write throws in strict code instead of growing a member nobody
 *    declared. Not Object.seal: js/ui/select-screen.js re-defines startRace and
 *    state in place, which needs them configurable.
 * 2. The `_`-prefixed members modules park on G are a SHRINK-ONLY baseline: a
 *    new `_x` is refused (give it a real name and a home in its module), and a
 *    member that goes away must leave the list, so the list only shrinks.
 * 3. tests/helpers/fake-g.mjs refuses a fake that invents a member G lacks.
 */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { scanGameCtx, scanDts } from "../../tools/check/check-gctx.mjs";
import { fakeG, netStubG, nonMembers } from "../helpers/fake-g.mjs";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

// SHRINK-ONLY. Delete a name when its member goes; never add one.
const PRIVATE_BASELINE = [
  "_testInput", "_lastFloodEmit", "_s8Stamp", "_spMeshKey", "_ltStore", "_cloudBase",
  "_ltBase", "_photoPrevScale", "_studioRig", "_ltFlash", "_ltNextT", "_nightAmbientBand",
];

/** The `_` members of a member map, sorted. */
const privates = (members) => [...members.keys()].filter((k) => k.startsWith("_")).sort();

test("no NEW `_`-prefixed member on G (shrink-only baseline)", () => {
  const base = new Set(PRIVATE_BASELINE);
  for (const [where, names] of [["js/game.js G literal", privates(scanGameCtx().members)],
    ["types/game-ctx.d.ts GameCtx", privates(scanDts().members)]]) {
    const added = names.filter((n) => !base.has(n));
    assert.deepEqual(added, [], `${where}: new private member(s) parked on G — give it a real name, or keep it in its module`);
  }
});

test("the private baseline only shrinks: a gone member leaves the list", () => {
  const live = new Set(privates(scanGameCtx().members));
  const stale = PRIVATE_BASELINE.filter((n) => !live.has(n));
  assert.deepEqual(stale, [], "delete these from PRIVATE_BASELINE — the member is gone, so the ceiling drops");
});

test("the baseline check refuses a new `_` member (positive control)", () => {
  const base = new Set(PRIVATE_BASELINE);
  const withNew = privates(new Map([...scanGameCtx().members, ["_newPark", {}]]));
  assert.deepEqual(withNew.filter((n) => !base.has(n)), ["_newPark"]);
});

let g = null;
before(async () => { g = await createGame({ storage: { trackId: "monza" } }); });

test("the booted G is closed: a write to an undeclared name throws, a declared one still writes", () => {
  const G = g.G;
  assert.ok(G, "game-vm exposes the real G");
  assert.equal(Object.isExtensible(G), false, "js/game.js closes G after its literal");
  assert.throws(() => { G.isRaining = () => true; }, TypeError, "G has no isRaining; the write must throw");
  assert.equal(Object.hasOwn(G, "isRaining"), false);
  // In-place updates of existing members are fine: a data member and an accessor.
  const wx = G.raceWeather;
  G.raceWeather = wx;
  assert.equal(G.raceWeather, wx);
  // Members stay configurable (not sealed): select-screen.js re-defines startRace in place.
  assert.equal(Object.getOwnPropertyDescriptor(G, "startRace").configurable, true);
});

test("fakeG refuses a member G lacks, and names it", () => {
  assert.throws(() => fakeG({ raceWeather: "dry", isRaining: () => false }), /not GameCtx members.*isRaining/);
  assert.throws(() => fakeG({ cars: [], announced: [] }), /announced/);
  assert.deepEqual(nonMembers({ cars: [], get groundY() { throw new Error("getter must not run"); } }), ["groundY"]);
});

test("fakeG accepts real members and closes the fake like the real G", () => {
  const G = fakeG({ raceWeather: "dry", isWetRoad: () => false, _cloudBase: undefined });
  G._cloudBase = 0.5;                                  // a declared member writes
  assert.equal(G._cloudBase, 0.5);
  assert.throws(() => { G.isRaining = () => true; }, TypeError);
  const open = fakeG({ raceWeather: "dry" }, { open: true });
  open.extra = 1;                                      // opt-out for a fake a test grows on purpose
  assert.equal(open.extra, 1);
});

test("netStubG seats the grid and is checked too", () => {
  const G = netStubG(3, 1);
  assert.equal(G.cars.length, 3);
  assert.equal(G.player, G.cars[1]);
  assert.equal(netStubG(2, -1).player, null, "local -1: a spectator");
  assert.throws(() => netStubG(2, 0, { groundY: () => 0 }), /groundY/);
});
