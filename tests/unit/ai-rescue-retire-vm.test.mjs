/* ai-rescue-retire-vm.test.mjs — AI rescue / retirement state in game.js (#6763, rows K4 K2 K8 of #6480).
 * One boot, the real game in the Node VM. Each test names the defect it pins. */
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import vm from "node:vm";

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

const halfWidth = (s) => { g.ctx.__t = G.track; return vm.runInContext("(() => { const o = { p: [0, 0, 0], t: [0, 0, 1], r: [1, 0, 0], hw: 7 }; Tracks.sample(__t, " + s + ", o); return o.hw; })()", g.ctx, { filename: "ai-rescue-retire-vm:halfWidth" }); };
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

// K2: a rescued AI car takes x from Collide.rescueX (clear of every car) and is not fired at a blocker within 8 m.
test("K2: the AI rescue lands clear of a parked car and keeps its speed beside it", () => {
  const idxA = G.cars.indexOf(ai());
  const idxB = G.cars.findIndex((c, i) => i !== idxA && !c.human && !c.retired && !c.finished);
  assert.ok(idxA >= 0 && idxB >= 0);
  const c = G.cars[idxA], blocker = G.cars[idxB];
  const L = G.track.total;
  A.aiPlace(idxB, 0.5, 0, null);
  A.aiPlace(idxA, 0.5 - 3 / L, 2, null);
  const edge = halfWidth(blocker.s) - 1.5;   // where the old clamp would drop the car
  blocker.x = edge; blocker.retired = true; blocker.speed = 0;
  c.x = edge + 5; c.rescueT = 99; c.speed = 2; c.contactT = 0;
  const pace = Math.max(G.PACE, 0.05);
  A.step(DT, 1);
  assert.ok(Math.abs(c.x - blocker.x) >= 2.4, `rescued into the parked car: x ${c.x} vs ${blocker.x}`);
  assert.ok(c.speed < 14 * pace * 0.9, `speed restored beside a blocker: ${c.speed}`);
  assert.equal(c.rescueT, 0, "the rescue fired");
});
