/* ai-rescue-retire-vm.test.mjs — AI rescue / retirement state in game.js (#6763, rows K4 K2 K8 of #6480).
 * One boot, the real game in the Node VM. Each test names the defect it pins. */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const { createGame } = createRequire(import.meta.url)("../../tools/lib/game-vm.cjs");
const DT = 1 / 60;
let g, A, G;

before(async () => {
  g = await createGame({ track: "monza" });
  A = g.apex;
  await g.race("monza");
  A.headless(true);
  A.go();
  for (let i = 0; i < 300; i++) A.step(DT, 1);   // past raceT > 2, the field running
  G = g.G;
});

const ai = () => G.cars.find((c) => !c.human && !c.retired && !c.finished);

// K4: the AI stuck gate reads the PACE-normalised speed. rescueT climbs only while the car is "stopped for its own pace".
test("K4: the AI stuck gate compares vStd(speed), at a low and a high PACE", () => {
  const c = ai();
  const keep = G.PACE;
  try {
    // High PACE: 6 m/s raw is vStd 3 — crawling for this pace, so rescueT climbs (the raw gate read 6 ≥ 5: never).
    G.PACE = 2; c.rescueT = 0;
    for (let i = 0; i < 30; i++) { c.speed = 6; A.step(DT, 1); }
    assert.ok(c.rescueT > 0.3, `high PACE: rescueT ${c.rescueT}`);
    // Low PACE: 4 m/s raw is vStd 8 — a car at its own pace, never stuck (the raw gate read 4 < 5: stuck).
    G.PACE = 0.5; c.rescueT = 0;
    for (let i = 0; i < 30; i++) { c.speed = 4; A.step(DT, 1); }
    assert.equal(c.rescueT, 0, `low PACE: rescueT ${c.rescueT}`);
  } finally { G.PACE = keep; }
});
