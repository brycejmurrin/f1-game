// @ts-check
// Screenshot the LIGHTING TUNER tabbed panel (one shot per category).
// Run: npx playwright test lt-tabs --update-snapshots  (writes tests/ui-screenshots/)
import { test } from "@playwright/test";

test.use({ viewport: { width: 900, height: 720 } });

test("lighting tuner tabs", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex && window.__apex.race, { timeout: 10_000 });
  await page.evaluate(() => window.__apex.race("vegas"));
  await page.waitForFunction(() => window.__apex.info().track != null, { timeout: 10_000 });
  // Frozen night scene + open the tuner exactly like the pause-menu button.
  await page.evaluate(() => {
    window.__apex.setTimeOfDay("night");
    window.__apex.park(0.12);
    document.getElementById("pm-lighting").onclick();
  });
  await page.waitForTimeout(500);

  const shot = async (name) => {
    // Drop the click's focus ring and wait past the .lt-tab colour transition
    // (0.12s) so the highlight is fully settled on the active tab.
    await page.evaluate(() => document.activeElement && document.activeElement.blur());
    await page.waitForTimeout(500);
    await page.screenshot({ path: `tests/ui-screenshots/lt-${name}.png`, fullPage: false });
  };
  const tab = async (g) => page.evaluate((g) => {
    document.querySelector("#lt-rows").scrollTop = 0;
    [...document.querySelectorAll("#lt-tabs .lt-tab")].find((t) => t.dataset.group === g).click();
  }, g);

  await shot("01-night-energy");
  await tab("LAMPS");            await shot("02-lamps");
  await tab("IMAGE & COLOUR");   await shot("03-image-colour");
  await tab("ATMOSPHERE");       await shot("04-atmosphere");
  await tab("RAIN");             await shot("05-rain");
});
