/* drill-aero-golden-vm.test.mjs — the Aero drill's launch and quit, bit-identical in the game VM (#6997, U4.1b of #6920).
 * The trace was captured on the tip BEFORE the drill moved into js/learn-drills/aero.js; the move must not change it.
 * Red on a perturbation: change a start gap, speed fraction or the dirty-air level in aero.js and a row moves.
 * To re-capture after a deliberate change: APEX_PRINT_GOLDEN=1 node --test tests/unit/drill-aero-golden-vm.test.mjs
 *
 * Run: node --test tests/unit/drill-aero-golden-vm.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const { createGame } = createRequire(import.meta.url)("../../tools/lib/game-vm.cjs");

// [tag, state, cars, player s, speed, rival s, speed, towing, wake, aeroX, practice goal]
// steps 36 → 37 on the #7199/#7181 tip (2026-11-27): the tip's own launch takes one more step to stage; re-captured
// on that tip with the drill still in learn-door.js, identical to the moved drill (PR #7177).
const GOLDEN = {
  steps: 37,
  rows: [
    ["start", "race", 2, 100, 56.825, 124, 48.362, 0, 0, 0, "slipstream"],
    ["t1", "race", 2, 114.006, 55.315, 136.16, 48.888, 0.38, 0.38, 0, "slipstream"],
    ["t2", "race", 2, 127.634, 53.805, 148.459, 49.463, 0.305, 0.305, 0, "slipstream"],
    ["t3", "race", 2, 140.886, 52.294, 160.902, 50.035, 0.136, 0.136, 0, "slipstream"],
    ["t4", "race", 2, 153.758, 50.782, 173.485, 50.592, 0.01, 0.01, 0, "slipstream"],
    ["t5", "race", 2, 166.253, 49.27, 186.206, 51.136, 0, 0, 0, "slipstream"],
    ["t6", "race", 2, 178.369, 47.757, 199.061, 51.668, 0.005, 0.005, 0, "slipstream"],
    ["t7", "race", 2, 190.106, 46.244, 212.048, 52.189, 0.057, 0.057, 0, "slipstream"],
    ["t8", "race", 2, 201.466, 44.732, 225.163, 52.698, 0.087, 0.087, 0, "slipstream"],
    ["quit", "menu", 2, 201.466, 44.732, 225.163, 52.698, 0.087, 0.087, 0, "free"],
  ],
  ended: {"ok": true, "id": "aero", "reason": "quit", "state": "menu"},
};

const r3 = (v) => Math.round(v * 1000) / 1000;
const plain = (v) => JSON.parse(JSON.stringify(v));

async function trace() {
  const g = await createGame({ carMeshes: false });
  try {
    const rows = [];
    const row = (tag) => {
      const G = g.G, p = G.player, rival = G.cars.find((c) => c !== p);
      rows.push([tag, G.state, G.cars.length, p && r3(p.s), p && r3(p.speed), rival && r3(rival.s), rival && r3(rival.speed),
        p && r3(p.towing || 0), p && r3(p.wake || 0), p && r3(p.aeroX || 0), G.coach.practiceGoal()]);
    };
    const launched = await g.apex.drillLaunch("aero");
    assert.equal(launched.ok, true, JSON.stringify(launched));
    const up = await g.stepUntil(() => g.G.state === "race" && g.apex.drillState().staging === false, { maxSteps: 600 });
    assert.ok(up.ok, "the drill race never started");
    row("start");
    for (let i = 1; i <= 8; i++) { g.step(15); row("t" + i); }
    const ended = plain(g.apex.drillEnd());
    row("quit");
    return { steps: up.steps, rows, ended };
  } finally { g.close(); }
}

test("Aero drill launch and quit: the VM trace is bit-identical to the pre-move tip", async () => {
  const t = await trace();
  if (process.env.APEX_PRINT_GOLDEN) console.log("GOLDEN " + JSON.stringify(t));
  assert.ok(GOLDEN, "no golden trace captured");
  assert.deepEqual(t, GOLDEN);
});
