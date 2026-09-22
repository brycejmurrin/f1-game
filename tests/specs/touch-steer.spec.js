// @ts-check
// Canvas touch steering and on-screen pedal travel — js/input/input.js.
//
// NOTHING COVERED ANY OF THIS BEFORE. The whole touch path — the one steering
// mode aimed squarely at an iPad — had no spec at all: the only canvas
// `touchstart` anywhere in tests/ was an incidental one in gamepad.spec.js's
// blur-release case. So the binary screen-half rule ("touch the left half, get
// full left lock, instantly, forever") survived as long as it did partly
// because no assertion ever looked at it.
//
// These drive the real listeners with synthetic Touch/Pointer events and read
// the public Input surface the game loop uses. No race needs to start — the
// module is wired by Input.init() at load.
//
// Imports from ./fixtures.js, NOT from @playwright/test, so a failure attaches
// apex-state / apex-logs / page-console instead of a bare "expected 1, got 0".
// Every neighbouring driving spec still takes the raw import and therefore gets
// none of that — this one is not following that example.
//
// SPLIT 2026-09-22 into three parts. This file declared 25 tests against the
// change-aware gate's 10-TEST capacity, which put it in `unreachable`: bigger
// than the whole cap, so no budget could admit it and a js/input/ diff selected
// nothing at all. Its 120 s timeout was never the cause (the cap is 180 s) —
// tools/ci/select-recall.mjs blamed the budget policy for a while and that was
// a wrong attribution, pointing the fix at a knob that cannot move the number.
// The other parts are touch-buttons.spec.js and touch-pedals.spec.js; the
// shared setup is ../helpers/touch-input.js. Keep each part under 10 tests.
import { test, expect } from "../helpers/fixtures.js";
import { useTouchCanvas, touchEvt, steer, pump } from "../helpers/touch-input.js";

useTouchCanvas(test);

test.describe("touch steering is an anchored drag, not a screen half", () => {
  test("a tap steers nothing — it only sets the anchor", async ({ page }) => {
    // The old rule made this full lock: clientX past the midpoint meant +1. A
    // stationary finger is not a steering request, and this is the single most
    // visible consequence of the change.
    await touchEvt(page, "touchstart", [{ identifier: 1, clientX: 800, clientY: 200 }]);
    expect(await steer(page)).toBe(0);
  });

  test("steering is proportional to how far the finger has travelled", async ({ page }) => {
    await touchEvt(page, "touchstart", [{ identifier: 1, clientX: 400, clientY: 200 }]);
    const range = await page.evaluate(() => Input.debugState().touchRangePx);
    // Quarter of the way to full lock, then most of the way. The exact values
    // depend on the dead zone, so assert ORDER and bounds rather than numbers —
    // a sensitivity retune must not rewrite this test.
    await touchEvt(page, "touchmove", [{ identifier: 1, clientX: 400 + range * 0.25, clientY: 200 }]);
    const quarter = await steer(page);
    await touchEvt(page, "touchmove", [{ identifier: 1, clientX: 400 + range * 0.8, clientY: 200 }]);
    const most = await steer(page);
    expect(quarter).toBeGreaterThan(0);
    expect(most).toBeGreaterThan(quarter * 1.5);
    expect(most).toBeLessThan(1);
  });

  test("the drag is relative, so the same gesture works anywhere on the glass", async ({ page }) => {
    // Same displacement, opposite sides of the screen. Under the old rule these
    // two gestures produced -1 and +1; the point of anchoring is that where the
    // thumb lands carries no meaning at all.
    await touchEvt(page, "touchstart", [{ identifier: 1, clientX: 120, clientY: 200 }]);
    await touchEvt(page, "touchmove", [{ identifier: 1, clientX: 190, clientY: 200 }]);
    const left = await steer(page);
    await touchEvt(page, "touchend", [{ identifier: 1, clientX: 190, clientY: 200 }]);
    await page.evaluate(() => Input.reset());

    await touchEvt(page, "touchstart", [{ identifier: 2, clientX: 700, clientY: 200 }]);
    await touchEvt(page, "touchmove", [{ identifier: 2, clientX: 770, clientY: 200 }]);
    const right = await steer(page);
    expect(left).toBeCloseTo(right, 3);
  });

  test("dragging left steers left", async ({ page }) => {
    await touchEvt(page, "touchstart", [{ identifier: 1, clientX: 500, clientY: 200 }]);
    await touchEvt(page, "touchmove", [{ identifier: 1, clientX: 380, clientY: 200 }]);
    expect(await steer(page)).toBeLessThan(0);
  });

  test("full lock is reachable and clamped", async ({ page }) => {
    await touchEvt(page, "touchstart", [{ identifier: 1, clientX: 200, clientY: 200 }]);
    await touchEvt(page, "touchmove", [{ identifier: 1, clientX: 5000, clientY: 200 }]);
    expect(await steer(page)).toBe(1);
  });

  test("lifting off ramps back to centre instead of snapping", async ({ page }) => {
    await touchEvt(page, "touchstart", [{ identifier: 1, clientX: 300, clientY: 200 }]);
    await touchEvt(page, "touchmove", [{ identifier: 1, clientX: 5000, clientY: 200 }]);
    expect(await steer(page)).toBe(1);
    await touchEvt(page, "touchend", [{ identifier: 1, clientX: 5000, clientY: 200 }]);
    // The first read after release is still near lock — the wheel travels, it
    // does not teleport. That IS the assertion; a snap would read 0 here.
    const justAfter = await steer(page);
    expect(justAfter).toBeGreaterThan(0.3);
    expect(justAfter).toBeLessThan(1);
    expect(await pump(page)).toBe(0);    // KEY_RAMP_OUT = 8/s → home in ~125 ms
  });

  test("the most recently MOVED finger steers, not the most recently placed", async ({ page }) => {
    // The regression this exists for: `touches` is keyed by identifier and
    // Map.set() on an existing key does NOT move it to the end, so reading the
    // last entry returned the most recently STARTED touch. A first finger that
    // then dragged could never take control back from a later, idle one.
    await touchEvt(page, "touchstart", [{ identifier: 1, clientX: 400, clientY: 200 }]);
    await touchEvt(page, "touchstart", [{ identifier: 2, clientX: 600, clientY: 300 }]);
    // Finger 2 is idle at its anchor (steer 0). Finger 1 — placed FIRST — drags.
    await touchEvt(page, "touchmove", [{ identifier: 1, clientX: 5000, clientY: 200 }]);
    expect(await steer(page)).toBe(1);
  });

  test("tilt and button modes ignore canvas drags entirely", async ({ page }) => {
    for (const mode of ["tilt", "buttons"]) {
      await page.evaluate((m) => { Input.reset(); Input.setSteerMode(m); }, mode);
      await touchEvt(page, "touchstart", [{ identifier: 1, clientX: 300, clientY: 200 }]);
      await touchEvt(page, "touchmove", [{ identifier: 1, clientX: 5000, clientY: 200 }]);
      expect(await steer(page), `${mode} mode must not steer from the canvas`).toBe(0);
    }
  });

  test("switching mode mid-drag cannot leave lock latched", async ({ page }) => {
    // Nothing in tilt/button mode calls touchSteering(), so a value left behind
    // by an interrupted drag would be held until something else overwrote it.
    await touchEvt(page, "touchstart", [{ identifier: 1, clientX: 300, clientY: 200 }]);
    await touchEvt(page, "touchmove", [{ identifier: 1, clientX: 5000, clientY: 200 }]);
    expect(await steer(page)).toBe(1);
    await page.evaluate(() => Input.setSteerMode("tilt"));
    expect(await steer(page)).toBe(0);
  });
});