/* race-settings-pitplan-key.test.mjs — RACE SETTINGS › STRATEGY sets up the
 * SELECTED circuit, not the world still built from the last race (hunt 3,
 * R3-SEAMS-2; probes scratch/hunt3-seams/pitplan-paint.cjs, pitplan-key.cjs).
 *
 * After a Monza race, QUIT, pick Spa: openRaceSettings() paints before the
 * flyby drops Monza, so the row read Monza's pin and the stint bar drew
 * Monza's plan for a Spa race; a tap filed the pin under the built world.
 * race-settings now names the selected circuit to the pin (pinnedStops(id) /
 * setPinnedStops(v, id) — PitLane's half keys the store by that id) and draws
 * the bar only once the selected circuit is the built one — repainted when the
 * menu flyby's build of it lands (no tap needed).
 *
 * Run: node --test tests/unit/race-settings-pitplan-key.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

test("STRATEGY after a pick: the pin is asked and written for the selected circuit, no plan from the built one", async () => {
  let planWire = null;
  const g = await createGame({ storage: { tyreWear: "real", "pitPlan.monza": 0, "pitPlan.spa": 2 }, onSandbox: (S) => {
    let real;
    Object.defineProperty(S, "SettingRow", { configurable: true, get: () => real, set: (v) => {
      real = Object.assign({}, v, { wire: (h, opts) => { if (h === "rs-plan") planWire = opts; return v.wire(h, opts); } });
    } });
  } });
  try {
    const doc = g.sandbox.document, G = g.G;
    await g.race("monza"); g.step(2);
    doc.getElementById("pm-quit").onclick();
    const spa = g.sandbox.Tracks.LIST.findIndex((d) => d.id === "spa");
    G.trackIdx = spa;   // the picker's write
    // The VM race shortcut retains session-stub; install the production model
    // so the integration checks storage rather than only forwarding arguments.
    vm.runInContext(readFileSync(new URL("../../js/race/pit-lane.js", import.meta.url), "utf8"), g.ctx);
    const pits = g.sandbox.PitLane.create(G), seen = [];
    assert.equal(pits._stub, undefined, "production PitLane loaded");
    Object.defineProperty(G, "pits", { configurable: true, get: () => pits });
    const trackDescriptor = Object.getOwnPropertyDescriptor(G, "track");
    const setBuilt = (track) => Object.defineProperty(G, "track", { configurable: true, get: () => track });
    const built = G.track;
    setBuilt(built); // hold the prior world while the settings menu schedules its rebuild
    for (const m of ["pinnedStops", "setPinnedStops", "planFor"]) {
      const f = pits[m];
      pits[m] = function (...a) { seen.push({ m, args: a, built: G.track && G.track.def && G.track.def.id }); return f.apply(this, a); };
    }
    assert.equal(G.track && G.track.def && G.track.def.id, "monza", "the last race's world is still built when the sheet paints");
    G.openRaceSettings("select");
    const asks = seen.filter((c) => c.m === "pinnedStops");
    assert.ok(asks.length > 0, "the STRATEGY row painted");
    for (const c of asks) assert.equal(c.args[0], "spa", "the pin is read for the selected circuit");
    assert.deepEqual(seen.filter((c) => c.m === "planFor" && c.built !== "spa"), [], "no stint plan from a circuit that is not the one being set up");
    assert.equal(doc.getElementById("rs-plan-bar").hidden, true, "the bar waits for the selected world");
    assert.ok(planWire, "rs-plan is wired");
    assert.ok(G.store, "production facade exposes storage");
    assert.equal(G.store.get("pitPlan.monza"), 0);
    assert.equal(planWire.read(), "2", "the real model reads Spa's pin while Monza is built");
    assert.equal(pits.pinnedStops(), 0, "no-argument race callers retain the built Monza pin");
    seen.length = 0;
    planWire.write("1");
    assert.deepEqual(seen.filter((c) => c.m === "setPinnedStops").map((c) => c.args), [[1, "spa"]], "the tap is filed under the selected circuit");
    assert.equal(G.store.get("pitPlan.spa"), 1, "the real model stores Spa's new pin");
    assert.equal(G.store.get("pitPlan.monza"), 0, "Monza's pin survives the Spa tap");
    setBuilt(null);
    assert.equal(planWire.read(), "1", "the selected circuit works before any world is built");
    planWire.write("auto");
    assert.equal(planWire.read(), "auto", "AUTO round-trips through the real settings row");
    assert.equal(G.store.get("pitPlan.spa"), "auto");
    planWire.write("2");
    assert.equal(G.store.get("pitPlan.spa"), 2, "no-world writes still target Spa");
    assert.equal(G.store.get("pitPlan.track", "missing"), "missing", "explicit IDs avoid the global fallback");
    setBuilt(built);
    for (const id of [null, {}, [], 42, "", "   "]) {
      assert.equal(pits.pinnedStops(id), 0, "invalid IDs use the built circuit");
      pits.setPinnedStops(0, id);
    }
    assert.equal(G.store.get("pitPlan.[object Object]", "missing"), "missing");
    pits.setPinnedStops(2, " Custom circuit ");
    assert.equal(pits.pinnedStops(" Custom circuit "), 2, "custom IDs preserve their spelling");
    assert.equal(G.store.get("pitPlan. Custom circuit "), 2);
    setBuilt({ id: "legacy" });
    pits.setPinnedStops(1);
    assert.equal(pits.pinnedStops(), 1, "legacy built track IDs remain supported");
    setBuilt(null);
    pits.setPinnedStops(null);
    assert.equal(pits.pinnedStops(), null, "no-world legacy AUTO uses the global fallback");
    assert.equal(G.store.get("pitPlan.track"), "auto");
    Object.defineProperty(G, "track", trackDescriptor);
    // ...and once the flyby has built Spa, the bar is drawn from Spa's own complex without a tap.
    seen.length = 0;
    for (let i = 0; i < 4000 && !(G.track && G.track.def && G.track.def.id === "spa" && seen.some((c) => c.m === "planFor")); i++) {
      g.flushTimers(); g.pumpFrame(); await new Promise((r) => setImmediate(r));
    }
    assert.equal(G.track && G.track.def && G.track.def.id, "spa", "the menu flyby built the selected circuit");
    const plans = seen.filter((c) => c.m === "planFor");
    assert.ok(plans.length > 0 && plans.every((c) => c.built === "spa"), "the sheet repainted the plan for Spa");
  } finally { g.close(); }
});


test("fresh STRATEGY pins persist through the lazy PitLane handoff", async () => {
  let planWire;
  const g = await createGame({ storage: { tyreWear: "real", "pitPlan.monza": 0, "pitPlan.spa": 2 }, onSandbox: (S) => {
    let real;
    Object.defineProperty(S, "SettingRow", { configurable: true, get: () => real, set: (v) => {
      real = Object.assign({}, v, { wire: (h, opts) => { if (h === "rs-plan") planWire = opts; return v.wire(h, opts); } });
    } });
  } });
  try {
    const G = g.G, stub = G.pits;
    assert.equal(stub._stub, true, "fresh menu uses the production session stub");
    assert.equal(G.track, null, "no race world has been built");
    G.trackIdx = g.sandbox.Tracks.LIST.findIndex((d) => d.id === "spa");
    G.openRaceSettings("select");
    assert.ok(planWire, "fresh settings wires the strategy row");
    assert.equal(planWire.read(), "2", "fresh settings reads the selected Spa pin");
    planWire.write("1");
    assert.equal(planWire.read(), "1", "a fresh-menu tap is retained");
    assert.equal(g.sandbox.localStorage.getItem("apex26.pitPlan.spa"), "1", "the stub uses the production store namespace");
    assert.equal(G.store.get("pitPlan.monza"), 0, "Spa's tap preserves Monza");
    planWire.write("auto");
    assert.equal(planWire.read(), "auto");
    assert.equal(G.store.get("pitPlan.spa"), "auto");
    planWire.write("1");

    // Contract parity also covers legacy callers and malformed/custom IDs.
    const ctx = { store: G.store, track: { def: { id: "monza" }, id: "unused" } };
    const pins = g.sandbox.PitLane.create(ctx);
    for (const id of [undefined, null, {}, [], 42, "", "   "]) {
      assert.equal(pins.pinnedStops(id), 0);
      pins.setPinnedStops(0, id);
    }
    assert.equal(G.store.get("pitPlan.[object Object]", "missing"), "missing");
    pins.setPinnedStops(2, " Custom circuit ");
    assert.equal(pins.pinnedStops(" Custom circuit "), 2);
    ctx.track = { id: "legacy" };
    pins.setPinnedStops(1);
    assert.equal(pins.pinnedStops(), 1);
    ctx.track = null;
    pins.setPinnedStops(null);
    assert.equal(pins.pinnedStops(), null);
    assert.equal(G.store.get("pitPlan.track"), "auto");

    // Recreate exactly the real model the lazy bundle installs, sharing store.
    vm.runInContext(readFileSync(new URL("../../js/race/pit-lane.js", import.meta.url), "utf8"), g.ctx);
    const real = g.sandbox.PitLane.create(G);
    Object.defineProperty(G, "pits", { configurable: true, get: () => real });
    assert.equal(real._stub, undefined);
    assert.equal(planWire.read(), "1", "the real model receives the fresh-menu selection");
    planWire.write("2");
    assert.equal(real.pinnedStops("spa"), 2, "the row keeps working after handoff");
  } finally { g.close(); }
});
