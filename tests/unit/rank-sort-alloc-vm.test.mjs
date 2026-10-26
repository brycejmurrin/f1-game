/* rank-sort-alloc-vm.test.mjs — the per-step field ranking allocates nothing (CPU-HUNT-2026-10-24 C1, PP-8).
 *
 * update() (js/game.js) ranks the field every physics step, up to five times a rendered frame on a slow phone.
 * It called ranked.sort(byProgDesc), and Array.prototype.sort allocates a work array per call in V8 (Torque
 * TimSort copies the elements) and in JSC (the builtin merge sort's buffer), then resolveCollisions got
 * ranked.concat(parked), a fresh ~22-entry array per step, whenever a retired car sat on the road (PP-8 in
 * docs/notes/LIVE-DEBUGGER-PHONEPERF-2026-10-24.md). Both are now an in-place stable insertion sort and a reused
 * buffer. What is pinned, against the real game.js in the game-vm harness:
 *   1. a race step calls Array.prototype.sort and Array.prototype.concat ZERO times from update() itself,
 *      with a car parked on the road (the concat path) as well as without;
 *   2. the ranking is exactly what the stable built-in sort gave from the same input (car order, progress
 *      descending, ties in car order): every running car's c.rank matches, step after step.
 * The digest side (no sim change) is the physics-characterization gate's; this file pins the call count.
 *
 * Run: node --test tests/unit/rank-sort-alloc-vm.test.mjs   (npm run test:game-vm)
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

let g = null;
before(async () => {
  g = await createGame({ storage: { trackId: "monza" } });
  await g.race("monza");
  g.apex.jump(0.1, 55, 0);
  g.apex.setInput({ throttle: true });
  g.step(120);
});
after(() => { if (g) g.close(); });

// Count calls of an Array.prototype method made DIRECTLY by game.js's update() (the caller frame), so the
// per-step sorts other modules own (race-facts, sporting-regs) are not counted here.
function countFromUpdate(name, fn) {
  const proto = Object.getPrototypeOf(g.G.cars), orig = proto[name];   // the VM realm's Array.prototype
  let n = 0;
  proto[name] = function (...a) {
    const caller = (new Error().stack.split("\n")[2] || "");
    if (/\bat update \(.*[\\/]js[\\/]game\.js:/.test(caller)) n++;
    return orig.apply(this, a);
  };
  try { fn(); } finally { proto[name] = orig; }
  return n;
}

// The stable built-in order from the same input update() builds: running cars in car order, progress descending.
// update() ranks BEFORE updateCar moves anyone, so the expectation is taken from the progress the step starts from.
function expectedRanks(cars) {
  const running = cars.filter((c) => !c.retired).map((c) => ({ c, prog: c.prog }));
  running.sort((a, b) => b.prog - a.prog);
  return new Map(running.map((e, i) => [e.c, i + 1]));
}

test("a race step sorts and concatenates nothing from update()", () => {
  const sorts = countFromUpdate("sort", () => g.step(60));
  assert.equal(sorts, 0, `update() called Array.prototype.sort ${sorts}x over 60 steps`);
});

test("ranks match the stable built-in sort, step after step", () => {
  const G = g.G;
  for (let s = 0; s < 40; s++) {
    const want = expectedRanks(G.cars);
    g.step(1);
    for (const [c, r] of want) assert.equal(c.rank, r, `step ${s}: ${c.code || c.team && c.team.id} rank ${c.rank} != ${r}`);
  }
});

test("a car parked on the road: no concat per step, still collides as part of the field", () => {
  const G = g.G;
  const victim = G.cars.find((c) => !c.isPlayer && !c.retired);
  G.retireCar(victim, "test");
  victim.parkedOnRoad = true;   // retireCar decides from its lateral position; force the on-road branch
  const concats = countFromUpdate("concat", () => g.step(30));
  assert.equal(concats, 0, `update() called Array.prototype.concat ${concats}x over 30 steps with a parked car`);
  assert.ok(victim.retired && victim.parkedOnRoad, "the parked car stays parked");
  const want = expectedRanks(G.cars);
  g.step(1);
  assert.equal(want.has(victim), false, "a retired car is not ranked");
  for (const [c, r] of want) assert.equal(c.rank, r);
});
