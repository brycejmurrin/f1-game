// @ts-check
// Season mode: round progression, points accumulation, standings panel visibility.
import { test, expect } from "@playwright/test";

const LANDSCAPE = { width: 844, height: 390 };

async function startSeasonRace(page) {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex != null, { timeout: 8000 });
  await page.locator("#mb-season").click();
  // Accept defaults in select screen
  await page.locator("#sel-go").click();
  // Accept defaults in race-settings screen
  await page.locator("#rs-go").click();
  await page.waitForFunction(
    () => window.__apex && window.__apex.info().track != null,
    { timeout: 10_000 }
  );
}

// ── Mode flags ────────────────────────────────────────────────────────────────

test.describe("Season — mode flags", () => {
  test.use({ viewport: LANDSCAPE });

  test("info() reports seasonMode:true", async ({ page }) => {
    await startSeasonRace(page);
    const info = await page.evaluate(() => window.__apex.info());
    expect(info.seasonMode).toBe(true);
    expect(info.timeTrial).toBe(false);
  });
});

// ── Points & standings ────────────────────────────────────────────────────────

test.describe("Season — standings panel", () => {
  test.use({ viewport: LANDSCAPE });

  test("standings button appears after round 1 completes", async ({ page }) => {
    await startSeasonRace(page);

    // Skip to after the race using finishRace
    await page.evaluate(() => window.__apex.park(0));
    await page.waitForTimeout(100);
    await page.evaluate(() => window.__apex.finishRace());
    await page.waitForTimeout(500);

    // Results screen should be visible
    await expect(page.locator("#results")).toBeVisible({ timeout: 5000 });

    // Return to menu (res-next starts next race; res-menu calls quitToMenu() which shows standings btn)
    await page.locator("#res-menu").click();
    await page.waitForTimeout(300);

    // The STANDINGS button should now be visible on the main menu
    await expect(page.locator("#mb-standings")).toBeVisible();
  });

  test("standings panel opens and shows drivers table", async ({ page }) => {
    await startSeasonRace(page);
    await page.evaluate(() => window.__apex.park(0));
    await page.waitForTimeout(100);
    await page.evaluate(() => window.__apex.finishRace());
    await page.waitForTimeout(500);
    await expect(page.locator("#results")).toBeVisible({ timeout: 5000 });
    await page.locator("#res-menu").click();
    await page.waitForTimeout(300);

    // Open standings
    await page.locator("#mb-standings").click();
    await expect(page.locator("#standings")).toBeVisible();
    // Should contain driver rows
    const rows = page.locator("#standings-body .res-row");
    await expect(rows.first()).toBeVisible();
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);
  });
});
