// @ts-check
// Shared helpers for per-track visual regression specs.
import { test, expect } from "@playwright/test";

// 25 evenly spaced positions per lap (every 4%): 0, 4, 8, ... 96%.
export const LAP_FRACTIONS = Array.from({ length: 25 }, (_, i) => i * 0.04);

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

// Builds an 11-position visual regression suite for a single circuit.
export function describeTrack(circuit) {
  test.describe(circuit, () => {
    for (const frac of LAP_FRACTIONS) {
      test(`${circuit} @${(frac * 100).toFixed(0)}% - geometry/colors/clipping`, async ({
        page,
      }) => {
        await goToRace(page, circuit);
        await park(page, frac);

        const info = await page.evaluate(() => window.__apex.info());
        expect(info.state).toBe("race");

        await expect(page.locator("canvas#game")).toHaveScreenshot(
          `${circuit}-${(frac * 100).toFixed(0)}.png`,
          { maxDiffPixelRatio: 0.15, timeout: 15000 }
        );

        await expect(page.locator("#hud")).toBeVisible();
      });
    }
  });
}
