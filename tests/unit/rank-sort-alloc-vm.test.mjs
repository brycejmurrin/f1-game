/* rank-sort-alloc-vm.test.mjs — the per-step field ranking allocates nothing (CPU-HUNT-2026-10-24 C1, PP-8).
 *
 * update() (js/game.js) ranks the field every physics step, up to five times a rendered frame on a slow phone.
 * It called ranked.sort(byProgDesc), and Array.prototype.sort allocates a work array per call in V8 (Torque
 * TimSort copies the elements) and in JSC (the builtin merge sort's buffer), then resolveCollisions got
 * ranked.concat(parked), a fresh ~22-entry array per step, whenever a retired car sat on the road (PP-8 in
 * docs/notes/LIVE-DEBUGGER-PHONEPERF-2026-10-24.md). Both are now an in-place stable insertion sort and a reused
 * buffer. What is pinned, against the real game.js in the game-vm harness:
 *   1. a race step calls Array.prototype.sort and Array.prototype.concat ZERO times from game.js code anywhere
 *      below update() (the whole stack is walked, helpers included), with a car parked on the road (the concat
 *      path) as well as without; two positive controls prove the walk sees sorts below update();
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

// Count calls of an Array.prototype method made ANYWHERE below game.js's update(): the whole stack is walked
// (stackTraceLimit lifted), so a sort moved into a helper (rankByProg, rankFinishers) is still seen. Each call is
// credited to the file of its direct caller frame, so `byFile["js/game.js"]` is game.js's own count and the
// per-step sorts other modules own (race-facts, sporting-regs) are reported separately, not hidden.
const UPDATE_FRAME = /\bat update \(.*[\\/]js[\\/]game\.js:/;
function callerFile(line) {
  const m = /[\\/](js[\\/][^:()]+\.js):\d+/.exec(line || "");
  return m ? m[1].replace(/\\/g, "/") : "?";
}
function countBelowUpdate(name, fn) {
  const proto = Object.getPrototypeOf(g.G.cars), orig = proto[name];   // the VM realm's Array.prototype
  const byFile = Object.create(null);
  const limit = Error.stackTraceLimit;
  Error.stackTraceLimit = Infinity;
  proto[name] = function (...a) {
    const frames = new Error().stack.split("\n").slice(2);   // [0] "Error", [1] this wrapper
    if (frames.some((f) => UPDATE_FRAME.test(f))) {
      const file = callerFile(frames[0]);
      byFile[file] = (byFile[file] || 0) + 1;
    }
    return orig.apply(this, a);
  };
  try { fn(); } finally { proto[name] = orig; Error.stackTraceLimit = limit; }
  return byFile;
}
const gameJs = (byFile) => byFile["js/game.js"] || 0;

// The stable built-in order from the same input update() builds: running cars in car order, progress descending.
// update() ranks BEFORE updateCar moves anyone, so the expectation is taken from the progress the step starts from.
function expectedRanks(cars) {
  const running = cars.filter((c) => !c.retired).map((c) => ({ c, prog: c.prog }));
  running.sort((a, b) => b.prog - a.prog);
  return new Map(running.map((e, i) => [e.c, i + 1]));
}

test("a race step sorts and concatenates nothing from update()", () => {
  const byFile = countBelowUpdate("sort", () => g.step(60));
  assert.equal(gameJs(byFile), 0,
    `game.js called Array.prototype.sort ${gameJs(byFile)}x below update() over 60 steps (${JSON.stringify(byFile)})`);
  // Positive control: the counter sees a sort that is NOT in update()'s own frame. race-facts ranks the order
  // board from a module update() calls; the old direct-caller counter credited it 0.
  assert.ok((byFile["js/race/race-facts.js"] || 0) > 0,
    `the stack walk must see race-facts' per-step sort below update(), got ${JSON.stringify(byFile)}`);
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
  const concats = gameJs(countBelowUpdate("concat", () => g.step(30)));
  assert.equal(concats, 0, `update() called Array.prototype.concat ${concats}x over 30 steps with a parked car`);
  assert.ok(victim.retired && victim.parkedOnRoad, "the parked car stays parked");
  const want = expectedRanks(G.cars);
  g.step(1);
  assert.equal(want.has(victim), false, "a retired car is not ranked");
  for (const [c, r] of want) assert.equal(c.rank, r);
});

// LAST: it marks cars finished. Positive control for game.js's own helpers: with two finishers update() calls
// rankFinishers(), which sorts _finRanked by RaceControl.finishOrder, one frame below update(). The counter must
// credit that to game.js, or a sort moved into rankByProg would pass unseen.
test("positive control: a game.js helper's sort below update() is counted", () => {
  const G = g.G;
  const two = G.cars.filter((c) => !c.retired).slice(0, 2);
  for (const c of two) c.finished = true;
  const byFile = countBelowUpdate("sort", () => g.step(3));
  assert.ok(gameJs(byFile) >= 3, `rankFinishers' sort must count once a step, got ${JSON.stringify(byFile)}`);
});
