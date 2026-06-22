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
      await page.evaluate(() => {
        window.__apex.park(0.1);
        // Show pause menu directly to avoid the #rotate-device overlay blocking
        // the pause button in portrait orientation.
        document.getElementById("pausemenu").hidden = false;
      });
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

    test("11 time trial select", async ({ page }) => {
      await page.goto("/");
      await waitReady(page);
      await page.locator("#mb-tt").click();
      await page.locator("#select").waitFor({ state: "visible" });
      await shot(page, `${orient}-11-time-trial`);
    });

    test("12 in-race hood camera", async ({ page }) => {
      await page.goto("/");
      await waitReady(page);
      await page.evaluate(() => window.__apex.race("bahrain"));
      await page.waitForFunction(() => window.__apex.info().track != null, { timeout: 10_000 });
      await page.evaluate(() => {
        window.__apex.camera("hood");
        window.__apex.park(0.1);
        window.__apex.jump(0.1, 50, 0);
        window.__apex.snapCam();
      });
      await page.waitForTimeout(600);
      await shot(page, `${orient}-12-hood-cam`);
    });

    test("13 track detail modal", async ({ page }) => {
      await page.goto("/");
      await waitReady(page);
      await page.locator("#mb-race").click();
      await page.locator("#select").waitFor({ state: "visible" });
      // open track detail by revealing it directly
      await page.evaluate(() => {
        const t = Tracks.LIST[0];
        document.getElementById("track-detail").hidden = false;
        document.getElementById("track-detail-name").textContent = t ? t.name : "Bahrain";
        document.getElementById("track-detail-meta").textContent = "Test";
      });
      await page.locator("#track-detail").waitFor({ state: "visible" });
      await page.waitForTimeout(300);
      await shot(page, `${orient}-13-track-detail`);
    });

    test("14 advanced steering", async ({ page }) => {
      await page.goto("/");
      await waitReady(page);
      await page.evaluate(() => { window.__apex.race("bahrain"); });
      await page.waitForFunction(() => window.__apex.info().track != null, { timeout: 10_000 });
      await page.evaluate(() => {
        // Hide the rotate-device overlay so it doesn't intercept clicks in portrait
        const rd = document.getElementById("rotate-device");
        if (rd) rd.hidden = true;
        document.getElementById("pausemenu").hidden = false;
      });
      await page.locator("#pm-advanced").click();
      await page.locator("#advanced").waitFor({ state: "visible" });
      await shot(page, `${orient}-14-advanced-steering`);
    });

    test("15 howtoplay", async ({ page }) => {
      await page.goto("/");
      await waitReady(page);
      await page.locator("#mb-help").click();
      await page.locator("#howtoplay").waitFor({ state: "visible" });
      await shot(page, `${orient}-15-howtoplay`);
    });

    test("16 standings", async ({ page }) => {
      await page.goto("/");
      await waitReady(page);
      // Start a season and go to standings
      await page.locator("#mb-season").click();
      await page.locator("#select").waitFor({ state: "visible" });
      await page.waitForTimeout(300);
      await shot(page, `${orient}-16-season-select`);
    });
  });
}
