// @ts-check
// Canvas touch steering and on-screen pedal travel — js/game/input.js.
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

test.describe("on-screen arrows ramp like a key, not a switch", () => {
  test("holding an arrow builds toward lock over time", async ({ page }) => {
    await page.evaluate(() => { Input.reset(); Input.setSteerMode("buttons"); });
    await page.evaluate(() => document.getElementById("btn-steer-right")
      .dispatchEvent(new PointerEvent("pointerdown", { pointerId: 11, bubbles: true })));
    const first = await steer(page);
    expect(first).toBeLessThan(1);          // used to be a bare 1 on the first read
    const later = await pump(page);
    expect(later).toBeGreaterThan(first);   // KEY_RAMP_IN = 6/s → full lock in ~167 ms
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
    // The compatibility promise: a player who taps the pedal and never discovers
    // the ease-off gesture gets exactly what they got before.
    await press(page, "btn-brake", 21, 300);
    expect(await page.evaluate(() => Input.brakeLevel())).toBe(1);
    expect(await page.evaluate(() => Input.braking())).toBe(true);
  });

  test("sliding up the screen eases the pedal off", async ({ page }) => {
    await press(page, "btn-brake", 22, 300);
    await slide(page, "btn-brake", 22, 260);       // 40 px up
    const part = await page.evaluate(() => Input.brakeLevel());
    expect(part).toBeGreaterThan(0);
    expect(part).toBeLessThan(1);
    await slide(page, "btn-brake", 22, 150);       // far up
    expect(await page.evaluate(() => Input.brakeLevel())).toBeLessThan(part);
    // Still HELD, though — sliding is modulation, not release.
    expect(await page.evaluate(() => Input.braking())).toBe(true);
  });

  test("a small tremor does not modulate the pedal", async ({ page }) => {
    await press(page, "btn-throttle", 23, 300);
    await slide(page, "btn-throttle", 23, 292);    // inside PEDAL_DEAD_PX
    expect(await page.evaluate(() => Input.throttleLevel())).toBe(1);
  });

  test("throttle travel survives to the physics", async ({ page }) => {
    // throttleLevel() existed for a long time with NO consumer anywhere — the
    // pad's analog trigger was thresholded to a boolean and the travel thrown
    // away. This is the assertion that it now reaches the car.
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
    // A desktop player must never be modulated by something they aren't holding.
    await press(page, "btn-throttle", 26, 300);
    await slide(page, "btn-throttle", 26, 150);
    await page.evaluate(() => window.dispatchEvent(
      new KeyboardEvent("keydown", { code: "ArrowUp", bubbles: true })));
    expect(await page.evaluate(() => Input.throttleLevel())).toBe(1);
  });
});
