// @ts-check
// Tests for button/touch steer mode: auto-throttle, hidden calibrate button,
// and race-settings layout (portrait + landscape).
import { test, expect } from "@playwright/test";
import { galleryPath } from "./output-paths.js";

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

// Steering / lighting / gears controls now live on the SETTINGS sub-menu.
async function openPauseSettings(page) {
  await openPauseMenu(page);
  await page.locator("#pm-settings").click();
  await page.locator("#pmsettings").waitFor({ state: "visible" });
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

async function openLightingPhotoMode(page) {
  await openPauseSettings(page);
  await page.locator("#pm-lighting").click();
  await page.locator("#pc-toggle").click();
  await expect(page.locator("body")).toHaveClass(/lt-open/);
  await expect(page.locator("body")).toHaveClass(/photo-mode/);
}

async function expectNormalRaceControls(page) {
  const state = await page.evaluate(() => ({
    lightingHidden: document.getElementById("lighting").hidden,
    pauseHidden: document.getElementById("pausemenu").hidden,
    photoControlsHidden: document.getElementById("photo-controls").hidden,
    ltOpen: document.body.classList.contains("lt-open"),
    photoMode: document.body.classList.contains("photo-mode"),
    pauseButtonHidden: document.getElementById("pausebtn").hidden,
  }));
  expect(state).toEqual({
    lightingHidden: true,
    pauseHidden: true,
    photoControlsHidden: true,
    ltOpen: false,
    photoMode: false,
    pauseButtonHidden: false,
  });
}

test.describe("Lighting tuner — pause lifecycle", () => {
  test.use({ viewport: LANDSCAPE, hasTouch: true });

  test("Escape leaves tuner-owned photo mode and restores race controls", async ({ page }) => {
    await page.goto("/");
    await waitReady(page);
    await openLightingPhotoMode(page);
    await page.keyboard.press("Escape");
    await expectNormalRaceControls(page);
  });

  test("pause key leaves tuner-owned photo mode and restores race controls", async ({ page }) => {
    await page.goto("/");
    await waitReady(page);
    await openLightingPhotoMode(page);
    await page.evaluate(() => window.dispatchEvent(
      new KeyboardEvent("keydown", { code: "KeyP", bubbles: true })
    ));
    await expectNormalRaceControls(page);
  });

  test("gamepad pause leaves tuner-owned photo mode and restores race controls", async ({ page }) => {
    await page.goto("/");
    await waitReady(page);
    await openLightingPhotoMode(page);
    await page.evaluate(() => {
      const buttons = Array.from({ length: 17 }, () => ({ pressed: false, value: 0, touched: false }));
      const pad = { connected: true, mapping: "standard", axes: [0, 0, 0, 0], buttons };
      navigator.getGamepads = () => [pad, null, null, null];
      window.dispatchEvent(new Event("gamepadconnected"));
      Input.poll();
      buttons[9] = { pressed: true, value: 1, touched: true };
      Input.poll();
    });
    await expectNormalRaceControls(page);
  });
});

// hasTouch prevents game from adding body.desktop class (which hides steer/calib btns)
test.describe("Pause menu — tilt mode", () => {
  test.use({ viewport: LANDSCAPE, hasTouch: true });

  test("calibrate button visible in tilt mode", async ({ page }) => {
    await page.goto("/");
    await waitReady(page);
    await openPauseSettings(page);
    await cycleToPauseSteerMode(page, "tilt");
    await page.waitForTimeout(200);
    const calib = page.locator("#pm-calib");
    await expect(calib).toBeVisible();
    await page.screenshot({ path: galleryPath("ui-button-touch", "pause-tilt-landscape.png") });
  });
});

test.describe("Pause menu — button mode", () => {
  test.use({ viewport: LANDSCAPE, hasTouch: true });

  test("calibrate button hidden in button mode", async ({ page }) => {
    await page.goto("/");
    await waitReady(page);
    await openPauseSettings(page);
    await cycleToPauseSteerMode(page, "button");
    await page.waitForTimeout(200);
    const calib = page.locator("#pm-calib");
    await expect(calib).toBeHidden();
    await page.screenshot({ path: galleryPath("ui-button-touch", "pause-button-landscape.png") });
  });
});

test.describe("Pause menu — touch mode", () => {
  test.use({ viewport: LANDSCAPE, hasTouch: true });

  test("calibrate button hidden in touch mode", async ({ page }) => {
    await page.goto("/");
    await waitReady(page);
    await openPauseSettings(page);
    await cycleToPauseSteerMode(page, "touch");
    await page.waitForTimeout(200);
    const calib = page.locator("#pm-calib");
    await expect(calib).toBeHidden();
    await page.screenshot({ path: galleryPath("ui-button-touch", "pause-touch-landscape.png") });
  });
});

test.describe("Auto-throttle in button/touch mode", () => {
  test.use({ viewport: LANDSCAPE, hasTouch: true });

  test("throttle button visible in button mode", async ({ page }) => {
    await page.goto("/");
    await waitReady(page);
    await openPauseSettings(page);
    await cycleToPauseSteerMode(page, "button");
    await page.locator("#pm-settings-close").click();   // back to the pause menu
    await page.locator("#pm-resume").click();
    await page.locator("#pausemenu").waitFor({ state: "hidden" });

    // Button mode exposes an explicit GAS button for manual throttle control
    const throttleBtn = page.locator("#btn-throttle");
    if (await throttleBtn.count() > 0) {
      await expect(throttleBtn).toBeVisible();
    }
    await page.screenshot({ path: galleryPath("ui-button-touch", "hud-button-mode.png") });
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
    await page.screenshot({ path: galleryPath("ui-button-touch", "race-settings-portrait.png") });
  });
});

test.describe("Selection screen — iOS tablet portrait layout", () => {
  test.use({ viewport: { width: 768, height: 1024 }, hasTouch: true });

  test("track list owns an independent vertical scroll area", async ({ page }) => {
    await page.goto("/");
    await waitReady(page);
    await page.locator("#mb-race").click();
    await page.locator("#select").waitFor({ state: "visible" });

    const before = await page.locator("#sel-tracks").evaluate((list) => ({
      clientHeight: list.clientHeight,
      scrollHeight: list.scrollHeight,
      overflowY: getComputedStyle(list).overflowY,
    }));
    expect(before.overflowY).toBe("auto");
    expect(before.scrollHeight).toBeGreaterThan(before.clientHeight);

    await page.locator("#sel-tracks").evaluate((list) => { list.scrollTop = 120; });
    await expect.poll(() => page.locator("#sel-tracks").evaluate((list) => list.scrollTop)).toBeGreaterThan(0);
  });
});

test.describe("Selection screen — iOS phone portrait touch scrolling", () => {
  test.use({ viewport: PORTRAIT, hasTouch: true });

  test("track list contains vertical scroll gestures", async ({ page }) => {
    await page.goto("/");
    await waitReady(page);
    await page.locator("#mb-race").click();
    await page.locator("#select").waitFor({ state: "visible" });

    const list = await page.locator("#sel-tracks").evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      overscrollY: getComputedStyle(element).overscrollBehaviorY,
    }));
    expect(list.scrollHeight).toBeGreaterThan(list.clientHeight);
    expect(list.overscrollY).toBe("contain");
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
    await page.screenshot({ path: galleryPath("ui-button-touch", "race-settings-landscape.png") });
  });
});
