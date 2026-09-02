/* speed-cap-vm.test.mjs — the speed cap is an ACCELERATION ceiling, not a
 * teleport; the dev physics knobs have floors. Bug hunt 2026-09-02, js/game.js
 * (`speedCap`) and js/game/apex.js (`setPhysics`), replayed in the Node VM.
 *
 * Run: node --test tests/unit/speed-cap-vm.test.mjs   (npm run test:game-vm)
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/game-vm.cjs");

let g = null, PHYS0 = null;
before(async () => { g = await createGame({ track: "monza" }); PHYS0 = { ...g.apex.tuning() }; });
after(() => { if (g) g.close(); });

const fresh = () => { g.apex.setPhysics(PHYS0); g.apex.headless(false); };

async function startRace() {
  fresh();
  await g.race("monza", "day", "dry");
}

test("a cap that drops under the car bleeds speed at a rate, never in one step", async () => {
  await startRace();
  const a = g.apex;
  a.setPhysics({ pace: 1 });
  a.jump(0.0, 50, 0);                       // on the Monza start straight, at speed
  a.setInput({ steer: 0, throttle: true });
  for (let i = 0; i < 5; i++) a.step(1 / 60, 1);
  const v0 = a.probe().speed;
  assert.ok(v0 > 40, `at speed before the cut (${v0})`);
  // Halve the pace scale: vmax and the ERS cap fall well under the car. The
  // old Math.min scrubbed the whole excess in 1/60 s (−25 m/s measured); a
  // bounded rate is at most a coast's worth per step.
  a.setPhysics({ pace: 0.5 });
  a.step(1 / 60, 1);
  const v1 = a.probe().speed;
  a.clearInput();
  assert.ok(v1 < v0, `the car does slow toward the new cap: ${v0} -> ${v1}`);
  assert.ok(v0 - v1 < 3, `one step may not scrub more than a coast's worth: ${v0} -> ${v1}`);
});

test("setPhysics floors its knobs: a negative pace or expo cannot poison the car", async () => {
  await startRace();
  const a = g.apex;
  const t = a.setPhysics({ pace: -1, expo: -1, speedRef: 0, yawInertia: -3, wheelbase: 0 });
  assert.ok(t.pace >= 0.05, `pace floored: ${t.pace}`);
  a.jump(0.0, 30, 0);
  a.setInput({ steer: 0, throttle: true });
  for (let i = 0; i < 30; i++) a.step(1 / 60, 1);
  const p = a.probe();
  a.clearInput();
  for (const k of ["s", "x", "speed"]) assert.ok(Number.isFinite(p[k]), `${k} finite: ${p[k]}`);
  assert.ok(p.speed >= 0, `speed never runs negative: ${p.speed}`);
  fresh();
});
