// @ts-check
import { test, expect } from "@playwright/test";

const CIRCUITS = ["singapore", "cota", "interlagos"];

async function waitForTrack(page, timeout = 10_000) {
  await page.waitForFunction(
    () => window.__apex && window.__apex.info().track != null,
    { timeout }
  );
}

async function goToRace(page, circuit) {
  await page.goto("/");
  await page.locator("#mb-race").click();
  // Select the circuit
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
  await page.waitForTimeout(100);
}

test.describe("Visual Regression — Circuits 7-9", () => {
  for (const circuit of CIRCUITS) {
    test.describe(circuit, () => {
      for (const frac of [0, 0.25, 0.5, 0.75]) {
        test(`frac=${frac.toFixed(2)} - inspect geometry/colors/placement`, async ({
          page,
        }) => {
          await goToRace(page, circuit);
          await park(page, frac);

          const info = await page.evaluate(() => window.__apex.info());
          expect(info.state).toBe("race");

          // Capture screenshot for manual inspection
          await expect(page.locator("canvas#game")).toHaveScreenshot(
            `${circuit}-frac-${frac.toFixed(2)}.png`,
            { maxDiffPixelRatio: 0.1 }
          );

          // Basic sanity: HUD should be visible
          await expect(page.locator("#hud")).toBeVisible();
        });
      }
    });
  }
});
