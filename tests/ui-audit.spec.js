// @ts-check
// UI audit — captures every screen/menu in portrait and landscape.
// Run with: npx playwright test ui-audit --update-snapshots
import { test, expect } from "@playwright/test";

const PORTRAIT  = { width: 390, height: 844 };   // iPhone 14
const LANDSCAPE = { width: 844, height: 390 };   // same rotated

async function waitReady(page) {
  await page.waitForFunction(() => window.__apex && window.__apex.race, { timeout: 10_000 });
}

async function shot(page, name) {
  await page.waitForTimeout(300);
  await page.screenshot({ path: `tests/ui-screenshots/${name}.png`, fullPage: false });
}

for (const [orient, vp] of [["portrait", PORTRAIT], ["landscape", LANDSCAPE]]) {
  test.describe(`UI audit — ${orient}`, () => {
    test.use({ viewport: vp });

    test("01 main menu", async ({ page }) => {
      await page.goto("/");
      await waitReady(page);
      await shot(page, `${orient}-01-main-menu`);
    });

    test("02 select screen", async ({ page }) => {
      await page.goto("/");
      await waitReady(page);
      await page.locator("#mb-race").click();
      await page.locator("#select").waitFor({ state: "visible" });
      await shot(page, `${orient}-02-select`);
    });

    test("03 customize my team", async ({ page }) => {
      await page.goto("/");
      await waitReady(page);
      await page.locator("#mb-race").click();
      await page.locator("#select").waitFor({ state: "visible" });
      await page.locator("#sel-customize").click();
      await page.locator("#customize").waitFor({ state: "visible" });
      await shot(page, `${orient}-03-customize`);
    });

    test("04 car setup", async ({ page }) => {
      await page.goto("/");
      await waitReady(page);
      await page.locator("#mb-race").click();
      await page.locator("#select").waitFor({ state: "visible" });
      await page.locator("#sel-setup").click();
      await page.locator("#carsetup").waitFor({ state: "visible" });
      await shot(page, `${orient}-04-carsetup`);
    });

    test("05 race settings", async ({ page }) => {
      await page.goto("/");
      await waitReady(page);
      await page.locator("#mb-race").click();
      await page.locator("#select").waitFor({ state: "visible" });
      await page.locator("#sel-go").click();
      await page.locator("#race-settings").waitFor({ state: "visible" });
      await shot(page, `${orient}-05-race-settings`);
    });

    test("06 how to play", async ({ page }) => {
      await page.goto("/");
      await waitReady(page);
      await page.locator("#mb-help").click();
      await page.locator("#howtoplay").waitFor({ state: "visible" });
      await shot(page, `${orient}-06-howtoplay`);
    });

    test("07 in-race HUD", async ({ page }) => {
      await page.goto("/");
      await waitReady(page);
      await page.evaluate(() => window.__apex.race("bahrain"));
      await page.waitForFunction(() => window.__apex.info().track != null, { timeout: 10_000 });
      await page.evaluate(() => window.__apex.park(0.1));
      await page.waitForTimeout(1000);
      await shot(page, `${orient}-07-hud`);
    });

    test("08 pause menu", async ({ page }) => {
      await page.goto("/");
      await waitReady(page);
      await page.evaluate(() => window.__apex.race("bahrain"));
      await page.waitForFunction(() => window.__apex.info().track != null, { timeout: 10_000 });
      await page.evaluate(() => window.__apex.park(0.1));
      await page.waitForTimeout(800);
      await page.locator("#pausebtn").click();
      await page.locator("#pausemenu").waitFor({ state: "visible" });
      await shot(page, `${orient}-08-pause`);
    });

    test("09 results screen", async ({ page }) => {
      await page.goto("/");
      await waitReady(page);
      await page.evaluate(() => window.__apex.race("bahrain"));
      await page.waitForFunction(() => window.__apex.info().track != null, { timeout: 10_000 });
      await page.evaluate(() => window.__apex.park(0.1));
      await page.waitForTimeout(300);
      await page.evaluate(() => window.__apex.finishRace());
      await page.locator("#results").waitFor({ state: "visible" });
      await page.waitForTimeout(200);
      await shot(page, `${orient}-09-results`);
    });

    test("10 f1 data hub", async ({ page }) => {
      await page.goto("/");
      await waitReady(page);
      await page.locator("#mb-data").click();
      await page.locator("#datahub").waitFor({ state: "visible" });
      await page.waitForTimeout(500);
      await shot(page, `${orient}-10-datahub`);
    });
  });
}
