// @ts-check
// The isolated car viewer exposes every parts category for manual audits.
import { test, expect } from "@playwright/test";

test("car viewer exposes controls for all eight parts categories", async ({ page }) => {
  await page.goto("/tools/carview.html?team=mclaren");
  await page.waitForFunction(() => window.CARVIEW && window.CARVIEW.ready, { timeout: 15_000 });

  for (const id of ["engine", "aero", "suspension", "brakes", "tyres", "ers", "gearbox", "fuel"]) {
    const select = page.locator("#ui-" + id);
    await expect(select).toBeVisible();
    expect(await select.locator("option").count()).toBeGreaterThanOrEqual(3);
  }
});

