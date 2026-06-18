// @ts-check
import { test, expect } from "@playwright/test";

const CIRCUITS = [
  "bahrain", "monaco", "silverstone", "spa", "monza", "suzuka",
  "singapore", "cota", "interlagos", "vegas", "madrid", "zandvoort"
];

async function waitForTrack(page, timeout = 10_000) {
  await page.waitForFunction(
    () => window.__apex && window.__apex.info().track != null,
    { timeout }
  );
}

async function goToRace(page, circuit) {
  await page.goto("/");
  await page.locator("#mb-race").click();
  const chips = await page.locator("#sel-tracks .sel-chip").all();
  for (const chip of chips) {
    const text = await chip.innerText();
    if (text.toLowerCase().includes(circuit)) {
      await chip.click();
      break;
    }
  }
  await page.locator("#sel-go").click();
  await waitForTrack(page);
}

async function park(page, frac = 0) {
  await page.evaluate((f) => window.__apex.park(f), frac);
  await page.waitForTimeout(1000);
}

test.describe("Comprehensive Visual Regression — All Tracks", () => {
  for (const circuit of CIRCUITS) {
    test.describe(circuit, () => {
      // Test 11 positions per lap: 0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95
      for (const frac of [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95]) {
        test(`${circuit} @${(frac * 100).toFixed(0)}% - geometry/colors/clipping`, async ({
          page,
        }) => {
          await goToRace(page, circuit);
          await park(page, frac);

          const info = await page.evaluate(() => window.__apex.info());
          expect(info.state).toBe("race");

          await expect(page.locator("canvas#game")).toHaveScreenshot(
            `${circuit}-${(frac * 100).toFixed(0)}-chromium-linux.png`,
            { maxDiffPixelRatio: 0.15, timeout: 15000 }
          );

          await expect(page.locator("#hud")).toBeVisible();
        });
      }
    });
  }
});
