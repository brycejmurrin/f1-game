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
  await page.waitForFunction(() => window.__apex && window.__apex.race, { timeout: 10_000 });
  await page.evaluate((c) => window.__apex.race(c), circuit);
  await waitForTrack(page);
  // race() leaves the game in "count" (countdown) state; go() skips to "race"
  // so that jump() and freeze() operate in the right game phase.
  await page.evaluate(() => window.__apex.go());
}

// Place the car at `frac` with a forward-facing chase camera.
// park() uses jump(f, 0) so the camera has no heading — snapCam after a
// non-zero speed jump gives a deterministic, forward-facing view every time.
async function snapForward(page, frac) {
  await page.evaluate((f) => {
    window.__apex.camera("chase");
    window.__apex.jump(f, 40, 0);   // non-zero speed → camera has a heading
    window.__apex.snapCam();         // instantly align camera, no damping lag
    window.__apex.step(1 / 60, 5);  // advance a few ticks so GPU draws the frame
    window.__apex.freeze(true);      // hold the scene for the screenshot
    window.__apex.hud(false);        // hide HUD overlay for cleaner track shots
  }, frac);
  // A short settle ensures the compositor has flushed the latest frame.
  await page.waitForTimeout(150);
}

async function resetScene(page) {
  await page.evaluate(() => {
    window.__apex.freeze(false);
    window.__apex.hud(true);
    window.__apex.clearInput();
  });
}

// Builds a 25-position visual regression suite for a single circuit.
// Each screenshot is a forward-facing chase-cam view taken at 0%, 4%, ..., 96%.
export function describeTrack(circuit) {
  test.describe(circuit, () => {
    for (const frac of LAP_FRACTIONS) {
      test(`${circuit} @${(frac * 100).toFixed(0)}% - geometry/colors/clipping`, async ({
        page,
      }) => {
        await goToRace(page, circuit);
        await snapForward(page, frac);

        const info = await page.evaluate(() => window.__apex.info());
        expect(info.state).toBe("race");

        await expect(page.locator("canvas#game")).toHaveScreenshot(
          `${circuit}-${(frac * 100).toFixed(0)}.png`,
          { maxDiffPixelRatio: 0.10, timeout: 15000 }
        );

        await resetScene(page);
      });
    }
  });
}
