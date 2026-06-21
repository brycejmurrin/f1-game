// @ts-check
import { test, expect } from "@playwright/test";

const CIRCUITS = ["bahrain", "monaco", "silverstone"];

async function waitForTrack(page, timeout = 10_000) {
  await page.waitForFunction(
    () => window.__apex && window.__apex.info().track != null,
    { timeout }
  );
}

async function goToRace(page, circuit) {
  await page.goto("/");
  // Start the race directly via the debug hook — robust against menu/flow changes.
  await page.waitForFunction(() => window.__apex && window.__apex.race, { timeout: 10_000 });
  await page.evaluate((c) => window.__apex.race(c), circuit);
  await waitForTrack(page);
  // Use hood camera (forward-facing from the car) for consistent regression shots.
  await page.evaluate(() => window.__apex.camera("hood"));
}

async function park(page, frac = 0) {
  await page.evaluate((f) => {
    window.__apex.park(f);    // sets state="race", freezes scene
    window.__apex.jump(f, 50, 0);  // add speed so hood cam faces track ahead
    window.__apex.snapCam();
  }, frac);
  // Wait for at least one render frame after snapCam() settles the camera.
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(r)))));
  await page.waitForTimeout(200);
}

test.describe("Visual Regression — Circuits 1-3", () => {
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
