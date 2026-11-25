/* grid-default-vm.test.mjs — the shipped one-off grid rule (#6564, Bryce 2026-11-25).
 *
 * A RANDOM default put fast cars behind slow ones, so a 3-lap race ran as one
 * train and read "bunched" against real F1. The default is now QUALIFYING:
 * a player's GO opens the qualifying sheet (drive, simulate, or TO THE GRID on
 * the provisional order), and a scripted start with no session (__apex.race
 * with no opts.grid) grids on team tier instead of stalling on #quali. An
 * explicit saved choice is kept: only the miss path changed.
 *
 * Every other VM/browser harness pins raceGrid "random" (tools/lib/game-vm.cjs,
 * tests/helpers/fixtures.js) so recorded traces hold; this file lifts the pin
 * with `storage: { raceGrid: null }` to boot the shipped default.
 *
 * Run: node --test tests/unit/grid-default-vm.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

test("the shipped one-off grid rule is QUALIFYING (an empty store boots it)", async () => {
  const g = await createGame({ storage: { raceGrid: null } });
  try {
    assert.equal(g.G.raceGrid, "quali");
    assert.equal(g.G.raceQuali, true);
  } finally { g.close(); }
});

test("an explicit saved RANDOM is kept: only the default moved", async () => {
  const g = await createGame({ storage: { raceGrid: "random" } });
  try { assert.equal(g.G.raceGrid, "random"); } finally { g.close(); }
});

test("a scripted start with no session grids on team tier, never stalls on #quali, and keeps the rule", async () => {
  const g = await createGame({ storage: { raceGrid: null } });
  try {
    await g.race("bahrain");
    const G = g.G;
    assert.equal(G.session, "race", "a race session, not the qualifying sheet");
    assert.ok(["count", "race"].includes(G.state), `the race armed (state ${G.state})`);
    const byGrid = G.cars.filter((c) => !c.isPlayer && !c.human).sort((a, b) => a.gridPos - b.gridPos);
    for (let i = 1; i < byGrid.length; i++) {
      assert.ok(byGrid[i].tier >= byGrid[i - 1].tier, `grid in tier order: P${byGrid[i].gridPos} ${byGrid[i].code} tier ${byGrid[i].tier} behind tier ${byGrid[i - 1].tier}`);
    }
    await g.settle(() => G.raceGrid === "quali", 2000);
    assert.equal(G.raceGrid, "quali", "the one-start tier fallback hands the rule back");
  } finally { g.close(); }
});

test("an explicit opts.grid still wins on a scripted start", async () => {
  const g = await createGame({ storage: { raceGrid: null } });
  try {
    await g.race("bahrain", null, null, { grid: "random" });
    assert.equal(g.G.raceGrid, "random");
    const tiers = g.G.cars.filter((c) => !c.isPlayer).sort((a, b) => a.gridPos - b.gridPos).map((c) => c.tier);
    assert.ok(tiers.some((t, i) => i > 0 && t < tiers[i - 1]), "a random grid is not in tier order");
  } finally { g.close(); }
});

test("the player's start on the shipped rule opens the qualifying sheet (game.js startRace, unchanged)", async () => {
  const g = await createGame({ storage: { raceGrid: null }, track: "monza" });
  try {
    const G = g.G;
    G.daily.stop(); G.timeTrial = false; G.practice = false;
    G.quitToMenu();
    G.startRace();   // no classification yet
    assert.ok(await g.settle(() => G.session === "quali", 4000), `qualifying opened (session ${G.session})`);
  } finally { g.close(); }
});
