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
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

test("STRATEGY after a pick: the pin is asked and written for the selected circuit, no plan from the built one", async () => {
  let planWire = null;
  const g = await createGame({ storage: { tyreWear: "real", "pitPlan.monza": 2 }, onSandbox: (S) => {
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
    const pits = G.pits, seen = [];
    for (const m of ["pinnedStops", "setPinnedStops", "planFor"]) {
      const f = pits[m];
      pits[m] = function (...a) { seen.push({ m, args: a, built: G.track && G.track.def.id }); return f.apply(this, a); };
    }
    assert.equal(G.track && G.track.def.id, "monza", "the last race's world is still built when the sheet paints");
    G.openRaceSettings("select");
    const asks = seen.filter((c) => c.m === "pinnedStops");
    assert.ok(asks.length > 0, "the STRATEGY row painted");
    for (const c of asks) assert.equal(c.args[0], "spa", "the pin is read for the selected circuit");
    assert.deepEqual(seen.filter((c) => c.m === "planFor" && c.built !== "spa"), [], "no stint plan from a circuit that is not the one being set up");
    assert.equal(doc.getElementById("rs-plan-bar").hidden, true, "the bar waits for the selected world");
    assert.ok(planWire, "rs-plan is wired");
    seen.length = 0;
    planWire.write("1");
    assert.deepEqual(seen.filter((c) => c.m === "setPinnedStops").map((c) => c.args), [[1, "spa"]], "the tap is filed under the selected circuit");
    // ...and once the flyby has built Spa, the bar is drawn from Spa's own complex without a tap.
    seen.length = 0;
    for (let i = 0; i < 4000 && !(G.track && G.track.def.id === "spa" && seen.some((c) => c.m === "planFor")); i++) {
      g.flushTimers(); g.pumpFrame(); await new Promise((r) => setImmediate(r));
    }
    assert.equal(G.track && G.track.def.id, "spa", "the menu flyby built the selected circuit");
    const plans = seen.filter((c) => c.m === "planFor");
    assert.ok(plans.length > 0 && plans.every((c) => c.built === "spa"), "the sheet repainted the plan for Spa");
  } finally { g.close(); }
});
