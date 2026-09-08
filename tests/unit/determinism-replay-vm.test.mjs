/* determinism-replay-vm.test.mjs — replaying one seed must be byte-identical,
 * checked in the Node VM so the DEPLOY GATE catches it.
 *
 * tests/specs/agent-determinism.spec.js already asserts this in a browser, but
 * it lives in a spec group that a change to the AI may not select, and a
 * browser group costs 10-40 minutes here. On 2026-09-08 a new lateral
 * controller shipped with a determinism break and reached the deploy branch:
 * the player's own trace stayed byte-identical, so every check that watched the
 * player passed, while the AI cars finished in a different ORDER on the second
 * replay of the same seed. It was found only because another session's CI run
 * happened to select the browser spec. This suite is ~20 s and runs in
 * test:game-vm, which the deploy gate always runs.
 *
 * WHAT BREAKS IT, and why the field list in apex.js reset() matters: a car
 * reads some state OFF ANOTHER car during its own update (`_vmaxNow` is the
 * blocker's pace the overtake decision turns on, `accSm` its acceleration,
 * `towing` its slipstream). Those are written every frame but READ on the first
 * frame before their owner has been updated, so a fresh session sees undefined
 * and a replayed one sees the previous episode's value. Same for a controller's
 * own smoothing state (`steerSm`, and since 2026-09-08 `aiHead` / `aiBias` /
 * `aiFam`). Anything of that shape belongs in reset()'s clearing block.
 *
 * Run: node --test tests/unit/determinism-replay-vm.test.mjs   (~20 s, one boot)
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

let g = null;
before(async () => { g = await createGame({ track: "monza" }); await g.race("monza"); });
after(() => { if (g) g.close(); });

/** One seeded episode, digested the way the browser spec digests it: the
 *  player's own trace AND the finishing order of the whole field, because the
 *  2026-09-08 break moved only the latter. */
function episode(seed) {
  const A = g.apex;
  A.headless(true);
  A.reset(0.02, 55, 0, seed);
  const r = A.rollout({ seconds: 4, input: { steer: 0.05, throttle: true } });
  const f = A.field({ detail: "full" });
  A.headless(false);
  return JSON.stringify({
    distanceM: r.distanceM,
    speed: r.speedKph,
    to: r.to,
    grid: f.positions.map((p) => p.code + ":" + p.pace).join(","),
  });
}

test("one seed replays byte-identically, field order included", () => {
  const a = episode(42), b = episode(42), c = episode(42);
  assert.equal(b, a, "the second replay of seed 42 differs from the first");
  assert.equal(c, a, "the third replay of seed 42 differs from the first");
  // Anti-vacuity: a car that never moved would replay trivially.
  assert.ok(JSON.parse(a).distanceM > 50, `the episode barely drove (${JSON.parse(a).distanceM} m)`);
});

test("a different seed really does deal a different field", () => {
  // The guard above passes trivially if the seed is ignored altogether.
  assert.notEqual(episode(7), episode(42), "seeds 7 and 42 produced identical episodes");
});
