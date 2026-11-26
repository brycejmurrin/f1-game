/* tt-garage-door-flow-vm.test.mjs — #6443: the TT results GARAGE door (#res-garage and
 * data-esc-close on #results) is cleared by quitToMenu and startRace, so a normal race
 * after TT → garage → back → MAIN MENU does not inherit it.
 *
 * Run: node --test tests/unit/tt-garage-door-flow-vm.test.mjs
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

const ID = "bahrain";
let g = null;
before(async () => { g = await createGame({ track: ID }); });
after(() => { if (g) g.close(); });

const el = (id) => g.ctx.document.getElementById(id);
const back = () => el("cs-back").onclick();
const door = () => ({
  hidden: el("res-garage").hidden,
  esc: el("results").getAttribute("data-esc-close"),
});

test("TT results garage door does not outlive quitToMenu and startRace", async () => {
  const before0 = g.G.cars;
  assert.ok(g.apex.tt(ID, "day"), "tt() starts");
  assert.ok(await g.settle(() => g.G.cars !== before0 && g.G.timeTrial && g.G.player), "the time trial is built");
  g.G.openGarage("tt-results"); back();
  assert.deepEqual(door(), { hidden: false, esc: "res-garage" }, "precondition: garageBack opened the TT door");
  g.G.quitToMenu();
  assert.equal(door().hidden, true, "quitToMenu hides the TT garage door");
  assert.equal(door().esc, null, "quitToMenu drops data-esc-close from #results");
  g.G.openGarage("tt-results"); back();
  assert.equal(door().hidden, false, "precondition: the door is up again");
  g.G.startRace();
  assert.equal(door().hidden, true, "startRace hides a stale TT garage door");
  assert.equal(door().esc, null, "startRace drops a stale data-esc-close");
});
