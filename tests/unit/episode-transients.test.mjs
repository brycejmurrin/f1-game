/* episode-transients.test.mjs — a per-car field must not survive reset().
 *
 * js/agent/apex.js's EPISODE_TRANSIENTS array (plus reset()'s own hand-written
 * clearing block) is a list a human maintains by re-deriving it from a diff:
 * its header comment says it is "every key that differed between consecutive
 * post-reset snapshots at the same seed", found by hand, after the fact, only
 * when tests/specs/agent-determinism.spec.js (a browser spec) happened to
 * notice a symptom. On 2026-09-15/16 that list fell behind twice in a row —
 * once for five fields (a STREET-only defect), once for sixteen (the tyre-force
 * model and the smoothed control-demand block) — each found by a live repro
 * that cost a day the first time.
 *
 * tools/check/episode-diff.mjs already does the mechanical half: replay one
 * seed for a few episodes in the no-browser VM (tools/lib/game-vm.cjs) and
 * diff the post-reset snapshot of episode 0 against episode 1, field by field.
 * This file is that same diff wired into the suite everyone runs after an
 * edit, so a NEW field written by js/game.js or js/physics/*.js and never
 * cleared fails here, at edit time, in seconds — instead of waiting for the
 * next person to run the determinism spec and re-derive the list by hand.
 *
 * Two tracks: one road circuit (monza) and one street circuit (singapore,
 * narrower, more traffic contact) — the 2026-09-15 five-field gap was
 * STREET-only and would not have shown up on monza alone.
 *
 * Run: node --test tests/unit/episode-transients.test.mjs   (~15 s, two boots)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { episodeLeaks } from "../../tools/check/episode-diff.mjs";

const TRACKS = ["monza", "singapore"];

for (const track of TRACKS) {
  test(`${track}: no per-car field survives reset() from one episode to the next`, async () => {
    const { rows } = await episodeLeaks({ track, seed: 42, episodes: 3, seconds: 4 });
    if (rows.length) {
      const detail = rows.map((r) => `${r.field} (${r.cars} car(s), e.g. ${r.example.cold} -> ${r.example.warm})`).join("; ");
      assert.fail(`${rows.length} field(s) leaked across reset() on ${track}: ${detail}\n`
        + "Add the field to EPISODE_TRANSIENTS in js/agent/apex.js (or its reset()"
        + " clearing block) if it should be gone on a cold car, matching a freshly"
        + " loaded page's undefined state.");
    }
  });
}

// ── RACE-END STATE (bug hunt 2026-09-27) ─────────────────────────────────────
// A 4 s rollout never retires or classifies a car, so the diff above cannot see
// this class: a car retired in episode 1 stayed PARKED (retired/dnf) through
// every later reset(), finPos/_coastHeld/lastLap survived, and reset() never
// re-armed reliability, so a seed's planned failure did not recur.
test("reset() clears retirements and classification and re-arms the same reliability plan", async () => {
  const { createRequire } = await import("node:module");
  const { createGame } = createRequire(import.meta.url)("../../tools/lib/game-vm.cjs");
  const g = await createGame({ track: "monza" });
  try {
    await g.race("monza");
    const A = g.apex, G = g.G;
    A.reliability("real");
    A.headless(true);
    A.reset(0.02, 55, 0, 42);
    const plan = JSON.stringify(A.retirements());
    assert.ok(A.retirements().length > 0, "seed 42 at 'real' plans at least one failure (else this proves nothing)");
    A.retire(3, "engine");
    Object.assign(G.cars[5], { finPos: 7, _coastHeld: true, lastLap: 91.2 });
    A.reset(0.02, 55, 0, 42);
    assert.equal(G.cars[3].retired, false, "a car retired last episode is back on the grid");
    assert.equal(G.cars[3].dnf, null);
    assert.equal(G.cars[5].finPos, 0, "finPos restored to makeCars' 0");
    assert.equal("_coastHeld" in G.cars[5], false, "absent on a cold car");
    assert.equal("lastLap" in G.cars[5], false, "absent on a cold car");
    assert.equal(JSON.stringify(A.retirements()), plan, "the same seed replans the same failures");
  } finally { g.close(); }
});
