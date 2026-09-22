/* start-race-latch.test.mjs — startRace() re-entrancy latch.
 *
 * startRace() has six fire-and-forget callers (js/game.js:8799, :8805, :9157,
 * :9209, js/race/daily-challenge.js:76, js/race/race-settings.js:393 — the
 * DEFECT-LEDGER un-awaited-startRace family) and no re-entry guard of its
 * own: a second trigger (double-click, a pm-restart while a start was still
 * building) could re-enter startRaceBody() mid-build. The fix renames the
 * body to startRaceBody() and wraps it in a startRace() that latches
 * concurrent callers onto the one in-flight promise (js/game.js ~2758).
 *
 * This boots the REAL game.js in the Node VM harness (tools/lib/game-vm.cjs)
 * — one boot, shared by both tests below (~15 s, the same cost as
 * ai-racecraft-vm.test.mjs) — and calls the actual G.startRace() twice
 * synchronously, so the assertion is on the real function, not a source pin.
 *
 * Run: node --test tests/unit/start-race-latch.test.mjs
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createGame } = require("../../tools/lib/game-vm.cjs");

let g = null;
before(async () => { g = await createGame({ track: "monza" }); });
after(() => { if (g) g.close(); });

test("a concurrent second startRace() call shares the in-flight promise", async () => {
  const G = g.G;
  assert.equal(typeof G.startRace, "function", "G.startRace must be exposed");
  const p1 = G.startRace();
  const p2 = G.startRace();
  assert.ok(p1 && typeof p1.then === "function", "startRace() must return a promise");
  assert.strictEqual(p2, p1, "a concurrent caller must share the in-flight start, not begin a second build");
  // Drain both without letting either's outcome fail the test — the latch
  // identity is what this test is about, not whether this particular
  // mid-test restart finishes cleanly.
  await Promise.allSettled([p1, p2]);
});

test("the latch releases once the in-flight start settles", async () => {
  const G = g.G;
  const p1 = G.startRace();
  await Promise.allSettled([p1]);
  const p2 = G.startRace();
  assert.notStrictEqual(p2, p1, "a call after the previous start settled must not reuse its stale promise");
  await Promise.allSettled([p2]);
});
