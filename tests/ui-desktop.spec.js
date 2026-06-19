// @ts-check
// Desktop / large-screen UI audit — iPad (1024×768) and 1080p desktop
import { test } from "@playwright/test";

const IPAD      = { width: 1024, height: 768 };
const DESKTOP   = { width: 1280, height: 800 };

async function waitReady(page) {
  await page.waitForFunction(() => window.__apex && window.__apex.race, { timeout: 10_000 });
}
async function shot(page, name) {
  await page.waitForTimeout(300);
  await page.screenshot({ path: `tests/ui-screenshots/${name}.png`, fullPage: false });
}

for (const [label, vp] of [["ipad", IPAD], ["desktop", DESKTOP]]) {
  test.describe(`UI — ${label}`, () => {
    test.use({ viewport: vp });

    test("main menu", async ({ page }) => {
      await page.goto("/");
      await waitReady(page);
      await shot(page, `${label}-01-main-menu`);
    });

    test("select screen", async ({ page }) => {
      await page.goto("/");
      await waitReady(page);
      await page.locator("#mb-race").click();
      await page.locator("#select").waitFor({ state: "visible" });
      await shot(page, `${label}-02-select`);
    });

    test("how to play", async ({ page }) => {
      await page.goto("/");
      await waitReady(page);
      await page.locator("#mb-help").click();
      await page.locator("#howtoplay").waitFor({ state: "visible" });
      await shot(page, `${label}-03-howtoplay`);
    });

    test("in-race HUD", async ({ page }) => {
      await page.goto("/");
      await waitReady(page);
      await page.evaluate(() => window.__apex.race("bahrain"));
      await page.waitForFunction(() => window.__apex.info().track != null, { timeout: 10_000 });
      await page.evaluate(() => window.__apex.park(0.1));
      await page.waitForTimeout(1000);
      await shot(page, `${label}-04-hud`);
    });

    test("pause menu", async ({ page }) => {
      await page.goto("/");
      await waitReady(page);
      await page.evaluate(() => window.__apex.race("bahrain"));
      await page.waitForFunction(() => window.__apex.info().track != null, { timeout: 10_000 });
      await page.evaluate(() => window.__apex.park(0.1));
      await page.waitForTimeout(800);
      await page.locator("#pausebtn").click();
      await page.locator("#pausemenu").waitFor({ state: "visible" });
      await shot(page, `${label}-05-pause`);
    });
  });
}
