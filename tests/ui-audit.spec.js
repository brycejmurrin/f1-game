// @ts-check
// UI audit — captures every screen/menu in portrait and landscape.
// Run with: npx playwright test ui-audit --update-snapshots
import { test, expect } from "@playwright/test";

const PORTRAIT  = { width: 390, height: 844 };   // iPhone 14
const LANDSCAPE = { width: 844, height: 390 };   // same rotated

async function waitReady(page) {
  await page.waitForFunction(() => window.__apex && window.__apex.race, { timeout: 10_000 });
}

async function waitTabLoaded(page) {
  // Wait until the data hub spinner is gone (API resolved or failed), cap at 8s
  await page.waitForFunction(() => !document.querySelector(".dh-spinner"), { timeout: 8_000 }).catch(() => {});
  await page.waitForTimeout(300);
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
      await waitTabLoaded(page);
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
      // Click the circuit preview map — triggers openTrackDetail() with real canvas/elevation
      await page.locator("#sel-preview-map").click();
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

    test("15 season standings panel", async ({ page }) => {
      await page.goto("/");
      await waitReady(page);
      // Start a season race, finish it, then open standings from main menu
      await page.locator("#mb-season").click();
      await page.locator("#select").waitFor({ state: "visible" });
      await page.locator("#sel-go").click();
      await page.locator("#race-settings").waitFor({ state: "visible" });
      await page.locator("#rs-go").click();
      await page.waitForFunction(() => window.__apex && window.__apex.info().track != null, { timeout: 10_000 });
      await page.evaluate(() => window.__apex.park(0));
      await page.waitForTimeout(200);
      await page.evaluate(() => window.__apex.finishRace());
      await page.locator("#results").waitFor({ state: "visible" });
      await page.locator("#res-menu").click();
      await page.waitForTimeout(300);
      await page.locator("#mb-standings").waitFor({ state: "visible" });
      await page.locator("#mb-standings").click();
      await page.locator("#standings").waitFor({ state: "visible" });
      await shot(page, `${orient}-15-standings`);
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

    test("17 wet weather HUD", async ({ page }) => {
      await page.goto("/");
      await waitReady(page);
      await page.evaluate(() => window.__apex.race("bahrain", "day", "wet"));
      await page.waitForFunction(() => window.__apex.info().track != null, { timeout: 10_000 });
      await page.evaluate(() => window.__apex.park(0.1));
      await page.waitForTimeout(1000);
      await shot(page, `${orient}-17-hud-wet`);
    });

    test("18 night race HUD", async ({ page }) => {
      await page.goto("/");
      await waitReady(page);
      await page.evaluate(() => window.__apex.race("singapore", "night", "dry"));
      await page.waitForFunction(() => window.__apex.info().track != null, { timeout: 10_000 });
      await page.evaluate(() => window.__apex.park(0.1));
      await page.waitForTimeout(1000);
      await shot(page, `${orient}-18-hud-night`);
    });

    test("19 cockpit camera", async ({ page }) => {
      await page.goto("/");
      await waitReady(page);
      await page.evaluate(() => window.__apex.race("bahrain"));
      await page.waitForFunction(() => window.__apex.info().track != null, { timeout: 10_000 });
      await page.evaluate(() => {
        window.__apex.camera("cockpit");
        window.__apex.park(0.1);
        window.__apex.jump(0.1, 50, 0);
        window.__apex.snapCam();
      });
      await page.waitForTimeout(600);
      await shot(page, `${orient}-19-cockpit-cam`);
    });

    test("20 TT results screen", async ({ page }) => {
      await page.goto("/");
      await waitReady(page);
      await page.evaluate(() => window.__apex.tt("monza"));
      await page.waitForFunction(() => window.__apex.info().track != null, { timeout: 10_000 });
      await page.evaluate(() => window.__apex.park(0));
      await page.waitForTimeout(200);
      await page.evaluate(() => window.__apex.finishRace());
      await page.locator("#results").waitFor({ state: "visible" });
      await page.waitForTimeout(200);
      await shot(page, `${orient}-20-results-tt`);
    });

    test("21 season results screen", async ({ page }) => {
      await page.goto("/");
      await waitReady(page);
      await page.locator("#mb-season").click();
      await page.locator("#select").waitFor({ state: "visible" });
      await page.locator("#sel-go").click();
      await page.locator("#race-settings").waitFor({ state: "visible" });
      await page.locator("#rs-go").click();
      await page.waitForFunction(() => window.__apex && window.__apex.info().track != null, { timeout: 10_000 });
      await page.evaluate(() => window.__apex.park(0));
      await page.waitForTimeout(200);
      await page.evaluate(() => window.__apex.finishRace());
      await page.locator("#results").waitFor({ state: "visible" });
      await page.waitForTimeout(200);
      await shot(page, `${orient}-21-results-season`);
    });

    test("22 advanced steering expanded", async ({ page }) => {
      await page.goto("/");
      await waitReady(page);
      await page.evaluate(() => window.__apex.race("bahrain"));
      await page.waitForFunction(() => window.__apex.info().track != null, { timeout: 10_000 });
      await page.evaluate(() => {
        const rd = document.getElementById("rotate-device");
        if (rd) rd.hidden = true;
        document.getElementById("pausemenu").hidden = false;
      });
      await page.locator("#pm-advanced").click();
      await page.locator("#advanced").waitFor({ state: "visible" });
      await page.locator("#adv-more").click();
      await page.locator("#adv-extra").waitFor({ state: "visible" });
      await page.waitForTimeout(300);
      await shot(page, `${orient}-22-advanced-expanded`);
    });

    test("23 portrait rotate-device overlay", async ({ page }) => {
      if (orient === "landscape") { test.skip(); return; }
      await page.goto("/");
      await waitReady(page);
      await page.evaluate(() => window.__apex.race("bahrain"));
      await page.waitForFunction(() => window.__apex.info().track != null, { timeout: 10_000 });
      // Do NOT hide rotate-device — that is the whole point of this test
      await page.evaluate(() => window.__apex.go());
      await page.waitForTimeout(500);
      await shot(page, `${orient}-23-rotate-device`);
    });

    test("24 data hub schedule tab", async ({ page }) => {
      await page.goto("/");
      await waitReady(page);
      await page.locator("#mb-data").click();
      await page.locator("#datahub").waitFor({ state: "visible" });
      await waitTabLoaded(page);
      await shot(page, `${orient}-24-datahub-schedule`);
    });

    test("25 data hub standings tab", async ({ page }) => {
      await page.goto("/");
      await waitReady(page);
      await page.locator("#mb-data").click();
      await page.locator("#datahub").waitFor({ state: "visible" });
      await page.locator(".dh-tab").filter({ hasText: "STANDINGS" }).click();
      await waitTabLoaded(page);
      await shot(page, `${orient}-25-datahub-standings`);
    });

    test("26 data hub last race tab", async ({ page }) => {
      await page.goto("/");
      await waitReady(page);
      await page.locator("#mb-data").click();
      await page.locator("#datahub").waitFor({ state: "visible" });
      await page.locator(".dh-tab").filter({ hasText: "LAST RACE" }).click();
      await waitTabLoaded(page);
      await shot(page, `${orient}-26-datahub-lastrace`);
    });
  });
}
