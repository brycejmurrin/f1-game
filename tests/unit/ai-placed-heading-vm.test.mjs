/* ai-placed-heading-vm.test.mjs — an AI car whose speed is SET (a rescue
 * restore, a crash hand-back, a car dropped in at speed) starts facing the
 * road, not on the heading it last held at a crawl (#5338).
 *
 * The heading state (c.aiHead) is written at crawl speed as asin(vLat / v),
 * which saturates at AI_HEAD_MAX (0.45 rad) off the grid. Dropped at 80 m/s
 * with that heading, the car steered full lock (steerCommand 1 from the first
 * step) and reached monza's right wall in 40 steps, then scrubbed along it
 * 80 -> 31 m/s. Measured on the tip before the fix: max |x| 10.40 m.
 * Run: node --test tests/unit/ai-placed-heading-vm.test.mjs
 */
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");
let g = null;
after(() => { if (g) g.close(); });

test("an AI car placed at speed after a slow start holds its line instead of steering into the wall", async () => {
  g = await createGame({ track: "monza", carMeshes: false });
  const a = g.apex, G = g.G;
  a.headless(true);
  await a.race("monza", "default", "dry", { laps: 3 });
  a.go(); g.step(60);
  const L = G.track.total;
  const ai = G.cars.filter((c) => !c.human);
  const C = ai[0];
  for (const c of ai.slice(1)) a.retire(G.cars.indexOf(c));
  a.jump(0.5, 0, 0);
  // Precondition: the getaway left a crawl heading on the car (else this test proves nothing).
  assert.ok(Math.abs(C.aiHead) > 0.2, `a crawl heading off the grid (aiHead ${C.aiHead})`);
  const s = L - 440;
  C.lap = 3; C.s = s; C.prog = 3 * L - (L - s); C.speed = 80; C.x = 0;
  a.setInput({ throttle: true, steer: 0 });
  let maxX = 0, maxSteer = 0;
  for (let i = 0; i < 60; i++) {
    g.step(1);
    maxX = Math.max(maxX, Math.abs(C.x));
    maxSteer = Math.max(maxSteer, Math.abs(C.steerCommand || 0));
  }
  assert.ok(maxSteer < 0.5, `no full lock after the placement (max |steer| ${maxSteer.toFixed(2)})`);
  assert.ok(maxX < 3, `stays near the line, nowhere near the 10.4 m wall (max |x| ${maxX.toFixed(2)} m)`);
});
