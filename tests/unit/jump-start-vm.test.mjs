/* jump-start-vm.test.mjs — tests/specs/jump-start.spec.js replayed in the Node VM
 * (tools/lib/game-vm.cjs): false-start penalty at lights-out.
 *
 * Ported: all 2 tests.
 * Not portable: none — every assertion reads an `__apex` JSON hook.
 *
 * Run: node --test tests/unit/jump-start-vm.test.mjs   (~10 s, one boot)
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGame, settle } = require("../../tools/lib/game-vm.cjs");

let g = null;
before(async () => { g = await createGame({ track: "monza" }); });
after(() => { if (g) g.close(); });

async function onGrid() {
  const a = g.apex;
  const carsBefore = g.G.cars;
  const r = a.race("monza", "day", "dry");
  if (!r) throw new Error("race() failed");
  await settle(() => {
    const i = a.info();
    return i && i.track === r.track && g.G.cars !== carsBefore;
  }, 4000);
  await settle(() => a.info().state === "count", 30_000);
  // Do not call go() — the browser spec steps through the gantry to lights-out.
}

function penTime(a) {
  return a.world({ detail: "drive" }).ego.penalties.timePenaltyS;
}

async function stepToRace(a, max = 600) {
  for (let i = 0; i < max; i++) {
    if (a.info().state === "race") return;
    a.step(1 / 60, 1);
  }
}

test("throttle held at lights-out adds +5 s", async () => {
  await onGrid();
  const a = g.apex;
  a.setInput({ steer: 0, throttle: true });
  await stepToRace(a);
  a.clearInput();
  assert.equal(a.info().state, "race");
  assert.ok(penTime(a) >= 5);
});

test("waiting for green before throttle accrues no false-start penalty", async () => {
  await onGrid();
  const a = g.apex;
  a.setInput({ steer: 0, throttle: false });
  await stepToRace(a);
  for (let i = 0; i < 18; i++) a.step(1 / 60, 1);
  a.setInput({ steer: 0, throttle: true });
  for (let i = 0; i < 30; i++) a.step(1 / 60, 1);
  a.clearInput();
  assert.equal(a.info().state, "race");
  assert.equal(penTime(a), 0);
});
