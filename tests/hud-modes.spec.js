// @ts-check
// Playwright test to capture HUD screenshots for all steering modes
import { test, expect } from "@playwright/test";

const VP = { width: 844, height: 390 };  // landscape viewport

async function waitReady(page) {
  await page.waitForFunction(() => window.__apex && window.__apex.race, { timeout: 10_000 });
}

async function captureHudForMode(page, modeName) {
  // Start race at Bahrain
  await page.evaluate(() => window.__apex.race("bahrain"));

  // Wait for track to load
  await page.waitForFunction(() => window.__apex.info().track != null, { timeout: 10_000 });

  // Park car at 0.1 (ensures HUD is fully visible and car is stationary)
  await page.evaluate(() => window.__apex.park(0.1));
  
  // Wait for everything to settle
  await page.waitForTimeout(500);
  
  // Take screenshot
  const filename = `tests/ui-screenshots/hud-${modeName}-landscape.png`;
  await page.screenshot({ path: filename });
  console.log(`✓ Captured ${filename}`);
}

// Steering mode is persisted config (apex26.steerMode) read at boot — seed it
// before load instead of poking a (nonexistent) runtime API.
function setMode(page, mode) {
  return page.addInitScript((m) => {
    localStorage.setItem("apex26.steerMode", JSON.stringify(m));
  }, mode);
}

test.describe("HUD screenshots for all steering modes", () => {
  test.use({ viewport: VP, hasTouch: true });

  test("HUD in buttons mode (left/right arrows + brake/gas)", async ({ page }) => {
    await setMode(page, "buttons");
    await page.goto("/");
    await waitReady(page);
    await captureHudForMode(page, "buttons");
  });

  test("HUD in tilt mode (no steering buttons)", async ({ page }) => {
    await setMode(page, "tilt");
    await page.goto("/");
    await waitReady(page);
    await captureHudForMode(page, "tilt");
  });

  test("HUD in touch mode (tap screen halves)", async ({ page }) => {
    await setMode(page, "touch");
    await page.goto("/");
    await waitReady(page);
    await captureHudForMode(page, "touch");
  });
});
