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

/** Actual simulation values, keyed by the stable car index used by carAt().
 * No rounding: a tiny AI controller divergence must change the digest too. */
function checkpoint(seconds) {
  const positions = new Map(g.apex.fieldState().map((c) => [c.id, c.pos]));
  const cars = g.G.cars.map((c, id) => ({
    id, code: c.code, isPlayer: !!c.isPlayer, pos: positions.get(id),
    prog: c.prog, x: c.x, speed: c.speed,
    retired: !!c.retired, finished: !!c.finished,
  }));
  assert.ok(cars.length > 1, "checkpoint must include AI cars");
  for (const c of cars) for (const key of ["prog", "x", "speed", "pos"]) {
    assert.ok(Number.isFinite(c[key]), `${c.code} ${key} must be live telemetry`);
  }
  return {seconds, cars};
}

/** Four seconds is a running-order check, not a finishing-order claim. */
function episode(seed) {
  const A = g.apex;
  A.headless(true);
  A.reset(0.02, 55, 0, seed);
  const checkpoints = [checkpoint(0)];
  let distanceM = 0;
  try {
    for (let seconds = 1; seconds <= 4; seconds++) {
      const r = A.rollout({ seconds: 1, input: { steer: 0.05, throttle: true } });
      distanceM += r.distanceM;
      checkpoints.push(checkpoint(seconds));
    }
    return JSON.stringify({distanceM, checkpoints});
  } finally { A.headless(false); }
}

test("one seed replays byte-identically, every car's motion and running order included", () => {
  const a = episode(42), b = episode(42), c = episode(42);
  assert.equal(b, a, "the second replay of seed 42 differs from the first");
  assert.equal(c, a, "the third replay of seed 42 differs from the first");
  const trace = JSON.parse(a);
  assert.ok(trace.distanceM > 50, `the episode barely drove (${trace.distanceM} m)`);
  const start = trace.checkpoints[0].cars;
  const end = trace.checkpoints.at(-1).cars;
  assert.deepEqual(end.map((c) => [c.id, c.code]), start.map((c) => [c.id, c.code]), "car identities must remain stable");
  assert.ok(end.some((c, i) => !c.isPlayer && c.prog !== start[i].prog), "at least one AI must actually move");
});

test("digest detects AI-only motion, retirement and running-order perturbations", () => {
  const baseline = episode(42);
  for (const key of ["prog", "x", "speed", "retired", "pos"]) {
    const altered = JSON.parse(baseline);
    const ai = altered.checkpoints[2].cars.find((c) => !c.isPlayer);
    assert.ok(ai);
    assert.ok(Object.hasOwn(ai, key), `digest must contain ${key}`);
    ai[key] = typeof ai[key] === "boolean" ? !ai[key] : ai[key] + 0.000001;
    assert.notEqual(JSON.stringify(altered), baseline, `digest missed AI ${key}`);
    assert.deepEqual(altered.checkpoints[2].cars.find((c) => c.isPlayer),
      JSON.parse(baseline).checkpoints[2].cars.find((c) => c.isPlayer), "player remains unchanged");
  }
});

test("checkpoint reads an AI-only simulation perturbation while the player stays identical", () => {
  const ai = g.G.cars.find((c) => !c.isPlayer);
  assert.ok(ai);
  const before = checkpoint(4);
  const original = ai.x;
  try {
    ai.x += 0.125;
    const after = checkpoint(4);
    assert.notEqual(JSON.stringify(after), JSON.stringify(before), "AI lateral telemetry must affect the digest");
    assert.deepEqual(after.cars.find((c) => c.isPlayer), before.cars.find((c) => c.isPlayer));
  } finally { ai.x = original; }
  assert.deepEqual(checkpoint(4), before, "control must restore the simulation state");
});

test("a different seed really does deal a different field", () => {
  // The guard above passes trivially if the seed is ignored altogether.
  assert.notEqual(episode(7), episode(42), "seeds 7 and 42 produced identical episodes");
});
