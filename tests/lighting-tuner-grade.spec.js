// @ts-check
import { test, expect } from "@playwright/test";

async function openImageTuner(page) {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex?.race, { timeout: 15_000 });
  await page.evaluate(() => window.__apex.race("bahrain"));
  await page.waitForFunction(() => window.__apex.info().track != null, { timeout: 20_000 });
  await page.evaluate(() => window.__apex.park(0.1));
  await page.locator("#pausebtn").click();
  await page.locator("#pm-lighting").click();
  await page.getByRole("tab", { name: "IMAGE & COLOUR" }).click();
}

async function reopenImageTuner(page) {
  await page.evaluate(() => window.__apex.park(0.1));
  await page.locator("#pausebtn").click();
  await page.locator("#pm-lighting").click();
  await page.getByRole("tab", { name: "IMAGE & COLOUR" }).click();
}

test("IMAGE & COLOUR exposes ordered professional grading sections", async ({ page }) => {
  await openImageTuner(page);
  const headings = await page.locator('.lt-group[data-group="IMAGE & COLOUR"] .lt-section').allTextContents();
  expect(headings).toEqual(["TONAL RANGE", "RGB LIFT / GAMMA / GAIN", "COLOUR", "LENS & FINISH"]);
  for (const id of [
    "blacks", "shadows", "midtones", "highlights", "whites", "toe", "shoulder",
    "liftR", "liftG", "liftB", "gammaR", "gammaG", "gammaB", "gainR", "gainG", "gainB",
  ]) await expect(page.locator("#lt-in-" + id)).toBeVisible();
});

test("new grading controls clamp, persist, reset, and export", async ({ page }) => {
  await openImageTuner(page);
  await page.evaluate(() => window.__apex.lightTune({ shadows: 9, gammaG: 0.1, gainB: 1.25 }));
  expect(await page.evaluate(() => window.__apex.lightTune().shadows)).toBe(1);
  expect(await page.evaluate(() => window.__apex.lightTune().gammaG)).toBe(0.5);
  await page.reload();
  await page.waitForFunction(() => window.__apex?.race);
  await page.evaluate(() => window.__apex.race("bahrain"));
  await page.waitForFunction(() => window.__apex.info().track != null);
  expect(await page.evaluate(() => window.__apex.lightTune().gainB)).toBeCloseTo(1.25);

  await reopenImageTuner(page);
  await page.locator("#lt-copy").click();
  await expect(page.locator("#lt-json")).toHaveValue(/"gainB": 1\.25/);
  await page.locator("#lt-reset").click();
  expect(await page.evaluate(() => {
    const tune = window.__apex.lightTune();
    return { shadows: tune.shadows, gammaG: tune.gammaG, gainB: tune.gainB };
  })).toEqual({ shadows: 0, gammaG: 1, gainB: 1 });
});
