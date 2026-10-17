/* agent-determinism-vm.test.mjs — tests/specs/agent-determinism.spec.js without
 * the requestAnimationFrame test (that one stays in
 * tests/specs/agent-determinism-frame.spec.js). Same digests: one rollout of
 * four seconds, the field grid, seed() round-trip, and the per-car reset diff.
 * determinism-replay-vm.test.mjs watches a finer per-second checkpoint; this
 * file is the browser spec's own digest, so the two stay in step.
 *
 * Run: node --test tests/unit/agent-determinism-vm.test.mjs
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

let g = null;
before(async () => { g = await createGame({ track: "monza" }); await g.race("monza"); });
after(() => { if (g) g.close(); });

function episode(seed) {
  const A = g.apex;
  A.headless(true);
  A.reset(0.02, 55, 0, seed);
  const r = A.rollout({ seconds: 4, input: { steer: 0.05, throttle: true } });
  const f = A.field({ detail: "full" });
  A.headless(false);
  return {
    distanceM: r.distanceM,
    speed: r.speedKph,
    to: r.to,
    grid: f.positions.map((p) => p.code + ":" + p.pace).join(","),
  };
}

test("the same seed replays an episode exactly", () => {
  const r = [episode(42), episode(42), episode(42)];
  assert.equal(JSON.stringify(r[1]), JSON.stringify(r[0]));
  assert.equal(JSON.stringify(r[2]), JSON.stringify(r[0]));
  assert.ok(r[0].distanceM > 50);
});

test("a different seed deals a different grid", () => {
  const a = episode(42), b = episode(7);
  assert.notEqual(b.grid, a.grid);
});

test("seed() round-trips and reset({seed}) applies before the grid is built", () => {
  const A = g.apex;
  A.seed(1234);
  const got = A.seed();
  A.reset(0.02, 55, 0, 99);
  assert.equal(got, 1234);
  assert.equal(A.seed(), 99);
});

test("reset() leaves no episode state on the cars", () => {
  const A = g.apex;
  const snap = () => {
    A.headless(true);
    A.reset(0.02, 55, 0, 42);
    const before = A.carState();
    A.rollout({ seconds: 2, input: { steer: 0.05, throttle: true } });
    A.headless(false);
    return before;
  };
  const a = snap(), b = snap(), c = snap();
  const diff = (x, y) => {
    const out = [];
    x.forEach((ca, i) => {
      const cb = y[i];
      for (const k of new Set(Object.keys(ca).concat(Object.keys(cb)))) {
        if (ca[k] !== cb[k]) out.push(`car${i}.${k}: ${ca[k]} -> ${cb[k]}`);
      }
    });
    return out;
  };
  assert.ok(a.length > 1, "carState() returned no cars");
  assert.ok(Object.keys(a[0] || {}).length > 20, "carState() returned a car with almost no fields");
  assert.deepEqual(diff(a, b), []);
  assert.deepEqual(diff(b, c), []);
});
