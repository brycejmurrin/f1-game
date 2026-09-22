// @ts-check
// The setup the three touch specs share — extracted when touch-steer.spec.js
// was split, NOT invented here.
//
// WHY THE SPLIT HAPPENED, because it is the only reason this file exists: the
// change-aware gate (tools/ci/select-specs.mjs) has a capacity of 10 TESTS, and
// a spec declaring more than the whole cap is `unreachable` — no budget it
// could be handed would admit it. touch-steer.spec.js declared 25. It was NOT
// excluded by its timeout, which is 120 s against a 180 s cap; tools/ci/
// select-recall.mjs attributed it to the budget policy for a while and that was
// wrong, because it pointed the fix at a knob that cannot move the number.
// Only splitting the file could, so the file was split, and every part is now
// under the cap and selectable on a js/input/ diff.
//
// Keep each part under 10 tests. Adding an eleventh to any of them silently
// returns that part to `unreachable`, which reads exactly like "not affected
// by this change" in the plan — the failure mode the whole audit was about.
//
// It deliberately exports NO `test` and NO `expect`. Each part takes those from
// ../helpers/fixtures.js, as the undivided file did, so a failure attaches
// apex-state / apex-logs / page-console instead of a bare "expected 1, got 0".
// Re-exporting playwright's raw `expect` from here would have quietly undone
// that for all three parts at once.

/** An iPad-ish landscape viewport with touch on. The steering path under test
 *  is the one aimed squarely at a tablet, so the viewport is part of the
 *  fixture rather than a detail. */
export const TOUCH = { hasTouch: true, viewport: { width: 844, height: 390 } };

/** Install the viewport and the per-test reset on a spec's `test` object.
 *
 *  Called at module scope by each part. `Input.init()` wires the listeners at
 *  load, so no race has to start; what does have to happen is the reset, or a
 *  latched ramp from the previous test reads as this test's steering. */
export function useTouchCanvas(test) {
  test.use(TOUCH);
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => typeof Input !== "undefined" && !!Input.steer);
    await page.evaluate(() => { Input.reset(); Input.setSteerMode("touch"); });
  });
}

/** Dispatch a raw touch event at the canvas. The listeners read
 *  `changedTouches` and nothing else, so a plain Event carrying that property
 *  is enough and keeps the test independent of Touch-constructor availability. */
export const touchEvt = (page, type, points) =>
  page.evaluate(({ type, points }) => {
    const e = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(e, "changedTouches", { value: points });
    document.getElementById("game").dispatchEvent(e);
  }, { type, points });

export const steer = (page) => page.evaluate(() => Input.steer());

/** One poll gap, chosen so the ramp advances by a FIXED amount per tick.
 *
 *  js/input/input.js computes `dt = min(0.1, elapsed)` on every steer() read.
 *  Below 100 ms that min picks `elapsed`, so how far the wheel travels per tick
 *  is whatever the evaluate round-trip happened to cost — and the round-trip is
 *  a property of the machine, not of the game. Above 100 ms the min picks the
 *  clamp and every tick is exactly 0.1 s no matter how slow the box is.
 *
 *  MEASURED 2026-09-22 (adaptive on, speed 72, ref 42), reads 1..8:
 *      gap  20 ms  0.220 0.293 0.351 0.401 0.443 0.488 0.531 …   machine-dependent
 *      gap 120 ms  0.404 0.561 0.679 0.779 0.865 0.943 1.000     identical at 200 ms
 *  The 20 ms ladder is what put `at speed a tap is a correction` at 0.53 here and
 *  0.758 on a CI runner against a `< 0.75` bound — the assertion was encoding the
 *  box's speed. The bound did not move; the clock did. */
export const RAMP_GAP_MS = 120;

/** Advance a ramp the way the game does, by a KNOWN number of clamped steps.
 *
 *  The game polls steer() once per physics step, so a test that wants a ramp to
 *  finish has to do the same rather than sleeping once and reading. Four ticks
 *  is 0.4 s of ramp, which saturates every ±1 / 0 assertion in these specs (the
 *  release ramp homes in ~125 ms) with room to spare. */
export async function pump(page, ticks = 4, gapMs = RAMP_GAP_MS) {
  let v = 0;
  for (let i = 0; i < ticks; i++) {
    v = await steer(page);
    if (i < ticks - 1) await page.waitForTimeout(gapMs);
  }
  return v;
}
