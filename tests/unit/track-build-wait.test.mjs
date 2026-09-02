/* The loadTrack fixture waits for a track build on PROGRESS, not on a
 * wall-clock deadline (tests/helpers/fixtures.js, 2026-09-02). That trade is
 * only safe if the stall path actually fires: a detector that waits forever is
 * worse than the 45 s deadline it replaced, because a wedged build would hang
 * the worker until Playwright's test timeout instead of failing with a reason.
 *
 * So drive awaitTrackBuild against fake pages. No browser, no track, no clock
 * skew — just the three behaviours the fixture promises. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { awaitTrackBuild, TRACK_STALL_MS, TRACK_HARD_MS } from "../helpers/await-track-build.js";

/** A page whose evaluate() returns whatever the script asks for, on a script.
 *
 * BOUNDED on purpose. A fake that answers forever turns "the wait never ends"
 * into a hung worker rather than a red test — node marks the test timed out but
 * the dangling loop keeps the process alive, so the sabotage that matters most
 * (delete the stall check) reads as a hang instead of a failure. Exhausting the
 * fake makes every broken variant terminate with a message the assertions can
 * judge. */
function fakePage(steps, maxCalls = 5000) {
  let i = 0;
  return {
    async evaluate() {
      if (i >= maxCalls) throw new Error("fake page exhausted: the wait never ended");
      return steps[Math.min(i++, steps.length - 1)];
    },
    async waitForTimeout(ms) { await new Promise((r) => setTimeout(r, Math.min(ms, 1))); },
    get calls() { return i; },
  };
}

test("resolves as soon as the track is there", async () => {
  const page = fakePage([{ ready: false, n: 1 }, { ready: false, n: 2 }, { ready: true, n: 3 }]);
  await awaitTrackBuild(page, 50);
  assert.ok(page.calls >= 3, "returned before it saw the track");
});

test("keeps waiting while the build is still LOGGING, however slow", { timeout: 5000 }, async () => {
  // Never ready, but the ring buffer grows every poll: a slow box, not a stuck
  // build. This is the case the old fixed deadline got wrong.
  const steps = [];
  for (let k = 0; k < 400; k++) steps.push({ ready: false, n: k });
  steps.push({ ready: true, n: 400 });
  const page = fakePage(steps);
  await awaitTrackBuild(page, 30);          // 30 ms stall budget, 400 growing polls
  assert.ok(page.calls > 200, "gave up on a build that was visibly progressing");
});

test("FAILS on a stall, and says which of the two happened", { timeout: 5000 }, async () => {
  // Ready never comes AND the log count never moves: genuinely wedged.
  const page = fakePage([{ ready: false, n: 7 }]);
  await assert.rejects(
    () => awaitTrackBuild(page, 30, 4000),
    (e) => {
      assert.match(e.message, /STALLED/, "the stall error must name the stall");
      assert.match(e.message, /wedged build, not a slow box/, "the message must distinguish the two");
      assert.match(e.message, /7 records/, "the message must carry the observed record count");
      return true;
    },
    "a wedged build did not fail — the detector waits forever");
});

test("the hard cap ends the wait even if the stall check is broken", { timeout: 5000 }, async () => {
  // Progress forever, never ready: the stall branch cannot fire, so only the
  // hard cap can end this. Without it the helper loops until the worker dies.
  const steps = [];
  for (let k = 0; k < 4000; k++) steps.push({ ready: false, n: k });
  // The fake is exhausted well before the test's own timeout, so removing the
  // hard cap surfaces as a WRONG-MESSAGE failure rather than a slow hang.
  await assert.rejects(
    () => awaitTrackBuild(fakePage(steps, 400), 10_000, 60),
    /hard cap/,
    "the wait can loop forever — a broken stall check would hang the worker, not fail it");
});

test("the stall budget is a real number, and shorter than the old deadline", () => {
  assert.ok(Number.isFinite(TRACK_HARD_MS) && TRACK_HARD_MS > TRACK_STALL_MS,
    "the hard cap must exist and sit above the stall budget");
  // The point of the change is that a WEDGED build is reported sooner, not
  // later. If this ever exceeds the 45 s it replaced, the trade has inverted.
  assert.ok(Number.isFinite(TRACK_STALL_MS) && TRACK_STALL_MS > 0, "TRACK_STALL_MS is not a usable budget");
  assert.ok(TRACK_STALL_MS < 45000, "the stall budget is no longer faster than the deadline it replaced");
});
