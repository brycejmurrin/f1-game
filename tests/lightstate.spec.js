// @ts-check
import { test, expect } from "@playwright/test";

const LANDSCAPE = { width: 844, height: 390 };

test.describe("lightState transitions", () => {
  test.use({ viewport: LANDSCAPE });

  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null, { timeout: 10_000 });
    await page.evaluate(() => window.__apex.race("monza"));
    await page.waitForFunction(() => window.__apex.info().track != null, { timeout: 15_000 });
  });

  test.afterEach(async ({ page }) => {
    // Always restore default lighting so state doesn't bleed between tests
    await page.evaluate(() => window.__apex?.setTimeOfDay("default")).catch(() => {});
  });

  test("day mode has zero floodlights", async ({ page }) => {
    await page.evaluate(() => window.__apex.setTimeOfDay("day"));
    await page.waitForFunction(() => window.__apex.lightState().numLights === 0, { timeout: 5000 });
    const ls = await page.evaluate(() => window.__apex.lightState());
    expect(ls.numLights).toBe(0);
  });

  test("night mode activates floodlights", async ({ page }) => {
    await page.evaluate(() => window.__apex.setTimeOfDay("night"));
    await page.waitForFunction(() => window.__apex.lightState().numLights > 0, { timeout: 8000 });
    const ls = await page.evaluate(() => window.__apex.lightState());
    expect(ls.numLights).toBeGreaterThan(0);
    expect(ls.ambientSky).toBeDefined();
  });

  test("reset to default mode works", async ({ page }) => {
    await page.evaluate(() => window.__apex.setTimeOfDay("default"));
    const ls = await page.evaluate(() => window.__apex.lightState());
    expect(ls).toBeDefined();
    expect(ls.sunColor).toBeDefined();
  });
});
