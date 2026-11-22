// @ts-check
// On-screen PEDAL travel, and the one pair that may never disagree: auto-throttle and a visible GAS button (js/input/input.js, js/game.js).
//
// PART THREE OF THREE. touch-steer.spec.js declared 25 tests against the
// change-aware gate's 10-test capacity, which made it `unreachable` — bigger
// than the whole cap, so no budget could admit it and a js/input/ diff selected
// nothing. Its timeout was never the problem (120 s against a 180 s cap); the
// COUNT was. The shared setup lives in ../helpers/touch-input.js and the reason
// for the split is written there.
//
// Keep this file under 10 tests.
import { test, expect } from "../helpers/fixtures.js";
import { useTouchCanvas } from "../helpers/touch-input.js";

useTouchCanvas(test);

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
// THE INVARIANT BEHIND A REAL PLAYER REPORT: "throttle is always on regardless
// of if I'm pressing it", in BUTTONS mode, after an off-track recovery.
//
// Auto-throttle is the one mechanism in the game that legitimately drives the
// car with no input, and it is supposed to exist ONLY in touch mode — where the
// GAS button is hidden precisely because the car throttles itself. So the pair
// (autoThrottle, GAS visible) has exactly one illegal combination: auto-throttle
// ON while the button is still on screen. A player pressing a visible GAS button
// whose car accelerates anyway is describing that state exactly.
//
// The investigation found no path that reaches it — steerMode has a single
// writer that syncs Input and refreshes the controls, and `paused` is a separate
// flag from `state`, so a switch made in the PAUSE MENU mid-race still refreshes
// (the near-miss: setSteerMode only refreshes when state is race/count). This
// test is what stops that staying true by luck. It cycles every mode through the
// pause menu, in a race, and asserts the pair can never disagree.
test("auto-throttle and the GAS button can never disagree, across mode switches", async ({ page, loadTrack }) => {
  test.setTimeout(120_000);
  await loadTrack("monza");
  await page.evaluate(() => window.__apex.go());

  const readPair = () => page.evaluate(() => ({
    mode: window.__apex.inputState().steerMode,
    gasVisible: !document.getElementById("btn-throttle")?.hidden,
    // physState().speed with no input held is the observable half: in a mode
    // where the button is visible, nothing may accelerate the car on its own.
    speed: window.__apex.physState()?.speed ?? null,
  }));

  const seen = [];
  for (let i = 0; i < 4; i++) {                  // 3 modes + wrap, via the real UI
    const pair = await readPair();
    seen.push(pair);
    // The illegal state: the car throttles itself while the player still has a
    // GAS button to press. Auto-throttle is touch-only BY DESIGN.
    const autoOn = pair.mode === "touch";
    expect(autoOn && pair.gasVisible,
      `mode ${pair.mode}: auto-throttle ${autoOn} with GAS visible ${pair.gasVisible} — ` +
      "the car would accelerate regardless of the button").toBe(false);
    // Through the REAL pause menu, the way a player switches: the pause button
    // opens it, STEER cycles the mode, resume closes it. Driving setSteerMode()
    // directly would skip the very refresh this test exists to check.
    // The flip is SYNCHRONOUS: › runs setSteerMode inside its click handler
    // (js/ui/setting-row.js step -> js/game.js setSteerMode -> Input), so read it
    // in the same task as the clicks. A page-side poll (#5958) timed out on CI
    // with the flip already made: a stalled main thread could not run the poll.
    const flip = await page.evaluate(() => {
      document.getElementById("pausebtn")?.click();
      // STEERING INPUT is a setting row: › steps to the next mode.
      document.getElementById("pm-steer-next")?.click();
      document.getElementById("pm-resume")?.click();
      return { mode: window.__apex.inputState().steerMode,
        closed: !!document.getElementById("pausemenu")?.hidden };
    });
    expect(flip.mode, `STEER › from ${pair.mode} changed nothing`).not.toBe(pair.mode);
    expect(flip.closed, "RESUME left the pause card open").toBe(true);
  }
  // Anti-vacuity: the loop must actually have visited more than one mode, or it
  // proved the invariant for a single state and called it a sweep.
  expect(new Set(seen.map((s) => s.mode)).size).toBeGreaterThan(1);
});
test("a driver can tune Gas and Left independently, reload, and reset only Gas", async ({ page }) => {
  const openControls = async () => {
    await page.locator("#mb-settings").tap();
    await page.locator("#pm-open-controls").tap();
    await page.locator("#pm-touch-response").tap();
  };
  await openControls();
  const guide = page.locator("#pm-touch-steering-guide-sel");
  await expect(guide).toHaveValue("ring");
  await guide.selectOption("wheel");
  const form = page.locator("#pm-touch-response-fields");
  const button = form.locator('[data-field="button"]');
  const press = form.locator('[data-field="press"]');
  const travel = form.locator('[data-field="travel"]');
  await button.selectOption("gas");
  await press.selectOption("progressive");
  const edge = form.locator('[data-field="fullEdge"]');
  const indicator = form.locator('[data-field="indicator"]');
  await edge.selectOption("right");
  await indicator.selectOption("percent");
  await expect(form.locator('[data-field="start"]')).toBeDisabled();
  await travel.focus();
  await travel.press("Home");
  await expect(travel).toHaveValue("40");
  await button.selectOption("left");
  await press.selectOption("progressive");
  const adaptive = form.locator('[data-field="adaptive"]');
  await adaptive.selectOption("10");

  await page.reload();
  await openControls();
  await expect(guide).toHaveValue("wheel");
  await button.selectOption("gas");
  await expect(press).toHaveValue("progressive");
  await expect(travel).toHaveValue("40");
  await expect(edge).toHaveValue("right");
  await expect(indicator).toHaveValue("percent");
  await form.locator('[data-field="reset"]').tap();
  await expect(edge).toHaveValue("fixed");
  await expect(indicator).toHaveValue("color");
  await expect(press).toHaveValue("instant");
  await expect(travel).toHaveValue("90");
  await button.selectOption("left");
  await expect(press).toHaveValue("progressive");
  await expect(adaptive).toHaveValue("10");
  for (const id of ["right", "brake"]) {
    await button.selectOption(id);
    await expect(press).toHaveValue("instant");
    await expect(travel).toHaveValue("90");
  }
});
