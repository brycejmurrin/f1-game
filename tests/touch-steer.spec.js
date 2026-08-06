// @ts-check
// Canvas touch steering and on-screen pedal travel — js/game/input.js.
//
// Touch steering is absolute from the viewport centre: press left of centre to
// turn left, further out for more lock. It used to be a binary half-screen
// (±1), then an anchored drag that steered ZERO on a stationary press — which
// on iOS read as "touch does nothing". These specs pin the absolute analog
// contract and the TILT-mode canvas fallback (stored tilt default must not
// leave the glass dead).
//
// Imports from ./fixtures.js, NOT from @playwright/test, so a failure attaches
// apex-state / apex-logs / page-console instead of a bare "expected 1, got 0".
import { test, expect } from "./fixtures.js";

const TOUCH = { hasTouch: true, viewport: { width: 844, height: 390 } };

test.use(TOUCH);

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => typeof Input !== "undefined" && !!Input.steer);
  await page.evaluate(() => { Input.reset(); Input.setSteerMode("touch"); });
});

// Dispatch a raw touch event at the canvas. The listeners read `changedTouches`
// and nothing else, so a plain Event carrying that property is enough and keeps
// the test independent of Touch-constructor availability.
const touchEvt = (page, type, points) =>
  page.evaluate(({ type, points }) => {
    const e = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(e, "changedTouches", { value: points });
    document.getElementById("game").dispatchEvent(e);
  }, { type, points });

const steer = (page) => page.evaluate(() => Input.steer());

// The ramps advance by rate x dt on each steer() call, and dt is CLAMPED to
// 100 ms so one call after a long pause cannot jump the wheel across. The game
// polls steer() once per physics step, so a test that wants a ramp to finish has
// to do the same rather than sleeping once and reading.
async function pump(page, ticks = 12, gapMs = 20) {
  let v = 0;
  for (let i = 0; i < ticks; i++) {
    v = await steer(page);
    if (i < ticks - 1) await page.waitForTimeout(gapMs);
  }
  return v;
}

test.describe("touch steering is absolute from screen centre", () => {
  test("a press left or right of centre steers immediately", async ({ page }) => {
    // The bug report: "I touch the screen and nothing happens." A stationary
    // finger on the right half MUST turn right — not wait for a drag.
    await touchEvt(page, "touchstart", [{ identifier: 1, clientX: 800, clientY: 200 }]);
    expect(await steer(page)).toBeGreaterThan(0.5);
    await touchEvt(page, "touchend", [{ identifier: 1, clientX: 800, clientY: 200 }]);
    await page.evaluate(() => Input.reset());
    await touchEvt(page, "touchstart", [{ identifier: 2, clientX: 80, clientY: 200 }]);
    expect(await steer(page)).toBeLessThan(-0.5);
  });

  test("a press on the exact midline steers nothing", async ({ page }) => {
    await touchEvt(page, "touchstart", [{ identifier: 1, clientX: 422, clientY: 200 }]);
    expect(await steer(page)).toBe(0);
  });

  test("steering is proportional to distance from centre", async ({ page }) => {
    const range = await page.evaluate(() => Input.debugState().touchRangePx);
    const mid = 422;
    await touchEvt(page, "touchstart", [{ identifier: 1, clientX: mid + range * 0.25, clientY: 200 }]);
    const quarter = await steer(page);
    await touchEvt(page, "touchend", [{ identifier: 1, clientX: mid + range * 0.25, clientY: 200 }]);
    await page.evaluate(() => Input.reset());
    await touchEvt(page, "touchstart", [{ identifier: 2, clientX: mid + range * 0.8, clientY: 200 }]);
    const most = await steer(page);
    expect(quarter).toBeGreaterThan(0);
    expect(most).toBeGreaterThan(quarter * 1.5);
    expect(most).toBeLessThanOrEqual(1);
  });

  test("equal distance left and right are equal magnitude, opposite sign", async ({ page }) => {
    const mid = 422;
    await touchEvt(page, "touchstart", [{ identifier: 1, clientX: mid - 100, clientY: 200 }]);
    const left = await steer(page);
    await touchEvt(page, "touchend", [{ identifier: 1, clientX: mid - 100, clientY: 200 }]);
    await page.evaluate(() => Input.reset());
    await touchEvt(page, "touchstart", [{ identifier: 2, clientX: mid + 100, clientY: 200 }]);
    const right = await steer(page);
    expect(left).toBeCloseTo(-right, 3);
  });

  test("full lock is reachable and clamped", async ({ page }) => {
    await touchEvt(page, "touchstart", [{ identifier: 1, clientX: 5000, clientY: 200 }]);
    expect(await steer(page)).toBe(1);
  });

  test("lifting off ramps back to centre instead of snapping", async ({ page }) => {
    await touchEvt(page, "touchstart", [{ identifier: 1, clientX: 5000, clientY: 200 }]);
    expect(await steer(page)).toBe(1);
    await touchEvt(page, "touchend", [{ identifier: 1, clientX: 5000, clientY: 200 }]);
    const justAfter = await steer(page);
    expect(justAfter).toBeGreaterThan(0.3);
    expect(justAfter).toBeLessThan(1);
    expect(await pump(page)).toBe(0);
  });

  test("the most recently MOVED finger steers, not the most recently placed", async ({ page }) => {
    await touchEvt(page, "touchstart", [{ identifier: 1, clientX: 400, clientY: 200 }]);
    await touchEvt(page, "touchstart", [{ identifier: 2, clientX: 422, clientY: 300 }]);
    // Finger 2 sits on the midline (steer 0). Finger 1 — placed FIRST — moves far right.
    await touchEvt(page, "touchmove", [{ identifier: 1, clientX: 5000, clientY: 200 }]);
    expect(await steer(page)).toBe(1);
  });

  test("TILT mode still steers from a canvas press (stored default must not be dead)", async ({ page }) => {
    await page.evaluate(() => { Input.reset(); Input.setSteerMode("tilt"); });
    await touchEvt(page, "touchstart", [{ identifier: 1, clientX: 800, clientY: 200 }]);
    expect(await steer(page)).toBeGreaterThan(0.5);
  });

  test("BUTTONS mode ignores canvas presses", async ({ page }) => {
    await page.evaluate(() => { Input.reset(); Input.setSteerMode("buttons"); });
    await touchEvt(page, "touchstart", [{ identifier: 1, clientX: 800, clientY: 200 }]);
    await touchEvt(page, "touchmove", [{ identifier: 1, clientX: 5000, clientY: 200 }]);
    expect(await steer(page)).toBe(0);
  });

  test("switching to buttons mid-press cannot leave lock latched", async ({ page }) => {
    await touchEvt(page, "touchstart", [{ identifier: 1, clientX: 5000, clientY: 200 }]);
    expect(await steer(page)).toBe(1);
    await page.evaluate(() => Input.setSteerMode("buttons"));
    expect(await steer(page)).toBe(0);
  });
});

test.describe("on-screen arrows ramp like a key, not a switch", () => {
  test("holding an arrow builds toward lock over time", async ({ page }) => {
    await page.evaluate(() => { Input.reset(); Input.setSteerMode("buttons"); });
    await page.evaluate(() => document.getElementById("btn-steer-right")
      .dispatchEvent(new PointerEvent("pointerdown", { pointerId: 11, bubbles: true })));
    const first = await steer(page);
    expect(first).toBeLessThan(1);
    const later = await pump(page);
    expect(later).toBeGreaterThan(first);
    expect(later).toBe(1);
  });

  test("releasing returns to centre", async ({ page }) => {
    await page.evaluate(() => { Input.reset(); Input.setSteerMode("buttons"); });
    await page.evaluate(() => document.getElementById("btn-steer-left")
      .dispatchEvent(new PointerEvent("pointerdown", { pointerId: 12, bubbles: true })));
    expect(await pump(page)).toBe(-1);
    await page.evaluate(() => window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 12 })));
    expect(await pump(page)).toBe(0);
  });
});

test.describe("on-screen pedals report travel, not just a press", () => {
  const press = (page, id, pointerId, y) => page.evaluate(({ id, pointerId, y }) =>
    document.getElementById(id).dispatchEvent(
      new PointerEvent("pointerdown", { pointerId, clientY: y, bubbles: true })),
    { id, pointerId, y });
  const slide = (page, id, pointerId, y) => page.evaluate(({ id, pointerId, y }) =>
    document.getElementById(id).dispatchEvent(
      new PointerEvent("pointermove", { pointerId, clientY: y, bubbles: true })),
    { id, pointerId, y });

  test("a plain press is still full travel", async ({ page }) => {
    await press(page, "btn-brake", 21, 300);
    expect(await page.evaluate(() => Input.brakeLevel())).toBe(1);
    expect(await page.evaluate(() => Input.braking())).toBe(true);
  });

  test("sliding up the screen eases the pedal off", async ({ page }) => {
    await press(page, "btn-brake", 22, 300);
    await slide(page, "btn-brake", 22, 260);
    const part = await page.evaluate(() => Input.brakeLevel());
    expect(part).toBeGreaterThan(0);
    expect(part).toBeLessThan(1);
    await slide(page, "btn-brake", 22, 150);
    expect(await page.evaluate(() => Input.brakeLevel())).toBeLessThan(part);
    expect(await page.evaluate(() => Input.braking())).toBe(true);
  });

  test("a small tremor does not modulate the pedal", async ({ page }) => {
    await press(page, "btn-throttle", 23, 300);
    await slide(page, "btn-throttle", 23, 292);
    expect(await page.evaluate(() => Input.throttleLevel())).toBe(1);
  });

  test("throttle travel survives to the physics", async ({ page }) => {
    await press(page, "btn-throttle", 24, 300);
    expect(await page.evaluate(() => Input.throttleLevel())).toBe(1);
    await slide(page, "btn-throttle", 24, 180);
    const eased = await page.evaluate(() => Input.throttleLevel());
    expect(eased).toBeLessThan(0.6);
    expect(eased).toBeGreaterThan(0);
  });

  test("releasing clears travel", async ({ page }) => {
    await press(page, "btn-brake", 25, 300);
    await page.evaluate(() => window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 25 })));
    expect(await page.evaluate(() => Input.brakeLevel())).toBe(0);
    expect(await page.evaluate(() => Input.braking())).toBe(false);
  });

  test("a keyboard press outranks a part-open pedal", async ({ page }) => {
    await press(page, "btn-throttle", 26, 300);
    await slide(page, "btn-throttle", 26, 150);
    await page.evaluate(() => window.dispatchEvent(
      new KeyboardEvent("keydown", { code: "ArrowUp", bubbles: true })));
    expect(await page.evaluate(() => Input.throttleLevel())).toBe(1);
  });
});
