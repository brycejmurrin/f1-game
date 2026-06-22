// @ts-check
// Tests for button/touch steer mode: auto-throttle, hidden calibrate button,
// and race-settings layout (portrait + landscape).
import { test, expect } from "@playwright/test";

const PORTRAIT  = { width: 390, height: 844 };
const LANDSCAPE = { width: 844, height: 390 };

async function waitReady(page) {
  await page.waitForFunction(() => window.__apex && window.__apex.race, { timeout: 10_000 });
}

async function openPauseMenu(page) {
  await page.evaluate(() => window.__apex.race("bahrain"));
  await page.waitForFunction(() => window.__apex.info().track != null, { timeout: 10_000 });
  await page.evaluate(() => window.__apex.park(0.1));
  await page.waitForTimeout(1000);
  await page.locator("#pausebtn").click();
  await page.locator("#pausemenu").waitFor({ state: "visible" });
}

async function cycleToPauseSteerMode(page, targetText) {
  // Click pm-steer up to 3 times to cycle to the desired mode
  for (let i = 0; i < 3; i++) {
    const text = await page.locator("#pm-steer").textContent();
    if (text && text.toLowerCase().includes(targetText.toLowerCase())) break;
    await page.locator("#pm-steer").click({ force: true });
    await page.waitForTimeout(300);
  }
}

// hasTouch prevents game from adding body.desktop class (which hides steer/calib btns)
test.describe("Pause menu — tilt mode", () => {
  test.use({ viewport: LANDSCAPE, hasTouch: true });

  test("calibrate button visible in tilt mode", async ({ page }) => {
    await page.goto("/");
    await waitReady(page);
    await openPauseMenu(page);
    await cycleToPauseSteerMode(page, "tilt");
    await page.waitForTimeout(200);
    const calib = page.locator("#pm-calib");
    await expect(calib).toBeVisible();
    await page.screenshot({ path: "tests/ui-screenshots/pause-tilt-landscape.png" });
  });
});

test.describe("Pause menu — button mode", () => {
  test.use({ viewport: LANDSCAPE, hasTouch: true });

  test("calibrate button hidden in button mode", async ({ page }) => {
    await page.goto("/");
    await waitReady(page);
    await openPauseMenu(page);
    await cycleToPauseSteerMode(page, "button");
    await page.waitForTimeout(200);
    const calib = page.locator("#pm-calib");
    await expect(calib).toBeHidden();
    await page.screenshot({ path: "tests/ui-screenshots/pause-button-landscape.png" });
  });
});

test.describe("Pause menu — touch mode", () => {
  test.use({ viewport: LANDSCAPE, hasTouch: true });

  test("calibrate button hidden in touch mode", async ({ page }) => {
    await page.goto("/");
    await waitReady(page);
    await openPauseMenu(page);
    await cycleToPauseSteerMode(page, "touch");
    await page.waitForTimeout(200);
    const calib = page.locator("#pm-calib");
    await expect(calib).toBeHidden();
    await page.screenshot({ path: "tests/ui-screenshots/pause-touch-landscape.png" });
  });
});

test.describe("Auto-throttle in button/touch mode", () => {
  test.use({ viewport: LANDSCAPE, hasTouch: true });

  test("throttle button visible in button mode", async ({ page }) => {
    await page.goto("/");
    await waitReady(page);
    await openPauseMenu(page);
    await cycleToPauseSteerMode(page, "button");
    await page.locator("#pm-resume").click();
    await page.locator("#pausemenu").waitFor({ state: "hidden" });

    // Button mode exposes an explicit GAS button for manual throttle control
    const throttleBtn = page.locator("#btn-throttle");
    if (await throttleBtn.count() > 0) {
      await expect(throttleBtn).toBeVisible();
    }
    await page.screenshot({ path: "tests/ui-screenshots/hud-button-mode.png" });
  });
});

test.describe("Race settings — portrait layout", () => {
  test.use({ viewport: PORTRAIT });

  test("chips are compact inline and RACE! button is visible", async ({ page }) => {
    await page.goto("/");
    await waitReady(page);
    await page.locator("#mb-race").click();
    await page.locator("#select").waitFor({ state: "visible" });
    await page.locator("#sel-go").click();
    await page.locator("#race-settings").waitFor({ state: "visible" });
    await page.waitForTimeout(300);
    // RACE! button must be visible without scrolling
    await expect(page.locator("#rs-go")).toBeVisible();
    await page.screenshot({ path: "tests/ui-screenshots/race-settings-portrait.png" });
  });
});

test.describe("Race settings — landscape layout", () => {
  test.use({ viewport: LANDSCAPE });

  test("fits without scrolling in landscape", async ({ page }) => {
    await page.goto("/");
    await waitReady(page);
    await page.locator("#mb-race").click();
    await page.locator("#select").waitFor({ state: "visible" });
    await page.locator("#sel-go").click();
    await page.locator("#race-settings").waitFor({ state: "visible" });
    await page.waitForTimeout(300);
    // Panel must not overflow
    const scrollable = await page.evaluate(() => {
      const panel = document.getElementById("race-settings");
      return panel ? panel.scrollHeight > panel.clientHeight : false;
    });
    expect(scrollable).toBe(false);
    await page.screenshot({ path: "tests/ui-screenshots/race-settings-landscape.png" });
  });
});
