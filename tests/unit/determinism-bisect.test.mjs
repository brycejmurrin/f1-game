/* determinism-bisect.test.mjs — opt-in step-hash trace + first-divergent-step
 * finder. Injects one Math.random() read that perturbs player.speed and checks
 * the tool localises it to that step and field (#2963).
 *
 * Run: node --test tests/unit/determinism-bisect.test.mjs
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  findFirstDivergence,
  hashState,
  flattenState,
  runStepTrace,
} from "../../tools/check/determinism-bisect.mjs";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

let g = null;
before(async () => {
  g = await createGame({ track: "monza", stepTrace: true });
  await g.race("monza");
});
after(() => { if (g) g.close(); });

test("findFirstDivergence is null on identical synthetic traces", () => {
  const row = {
    step: 0,
    player: { s: 1, x: 0, speed: 50, px: 0, pz: 0, head: 0 },
    field: [{ id: 0, code: "P", s: 1, x: 0, speed: 50, prog: 1 }],
    rng: { seed: 42, stream: 99 },
    timers: { pending: 0, rows: [] },
  };
  assert.equal(findFirstDivergence([row], [structuredClone(row)]), null);
  assert.equal(hashState(row).length, 40);
});

test("findFirstDivergence names the step and field on a planted diff", () => {
  const a = {
    step: 3,
    player: { s: 1, x: 0, speed: 50, px: 0, pz: 0, head: 0 },
    field: [],
    rng: { seed: 1, stream: 1 },
    timers: { pending: 0, rows: [] },
  };
  const b = structuredClone(a);
  b.player.speed = 51;
  const d = findFirstDivergence([a, a, a, a], [a, a, a, b]);
  assert.ok(d, "expected a divergence");
  assert.equal(d.step, 3);
  assert.ok(d.fields.includes("player.speed"), d.fields.join(","));
  assert.ok(Object.keys(flattenState(a)).some((k) => k.startsWith("player.")));
});

test("stepTrace is empty when opt-in is off (zero cost default)", async () => {
  const plain = await createGame({ track: "monza" });
  try {
    await plain.race("monza");
    plain.apex.headless(true);
    plain.apex.reset(0.02, 55, 0, 42);
    plain.step(5);
    assert.deepEqual(plain.stepTrace, []);
  } finally {
    plain.close();
  }
});

test("one Math.random() inject is localised to its step and player.speed", async () => {
  const steps = 24;
  const injectAt = 11;
  const baseline = await runStepTrace({ seed: 42, steps, game: g });
  const poisoned = await runStepTrace({
    seed: 42,
    steps,
    game: g,
    injectBefore: (i, handle) => {
      if (i !== injectAt) return;
      // One unseeded Math.random() read that reaches a hashed field — the
      // shape a cosmetic-vs-sim leak takes when Math.random touches physics.
      const delta = 0.25 + Math.random() * 0.5;
      const p = handle.G && handle.G.player;
      assert.ok(p, "player must exist for the inject");
      p.speed = (p.speed || 0) + delta;
    },
  });
  assert.equal(baseline.length, steps);
  assert.equal(poisoned.length, steps);
  assert.equal(findFirstDivergence(baseline, baseline), null, "same seed must match itself");
  const d = findFirstDivergence(baseline, poisoned);
  assert.ok(d, "inject must produce a divergence");
  assert.equal(d.step, injectAt, `expected step ${injectAt}, got ${d.step}`);
  assert.ok(
    d.fields.some((f) => f === "player.speed" || f.startsWith("player.speed")),
    `expected player.speed among fields, got: ${d.fields.slice(0, 20).join(", ")}`,
  );
});
