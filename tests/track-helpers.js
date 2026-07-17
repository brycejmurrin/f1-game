// @ts-check
// Shared helpers + data for the consolidated per-track visual regression suite
// (tests/tracks-visual.spec.js). Previously each of the 24 circuits had its own
// 5-line stub spec calling describeTrack(id) with 25 fractions each (600 golden
// PNGs) AND a parallel visual-regression-circuits-N set — the two were redundant
// pixel suites. Collapsed to ONE data-driven spec looping TRACKS at 6 fractions.
import { test, expect } from "@playwright/test";

// The 24 circuits, in Tracks.LIST order. Keep in sync with js/tracks/*.js.
export const TRACKS = [
  "abudhabi", "albert_park", "bahrain", "baku", "cota", "hungaroring",
  "imola", "interlagos", "jeddah", "madrid", "mexico", "miami",
  "monaco", "montreal", "monza", "qatar", "redbull", "shanghai",
  "silverstone", "singapore", "spa", "suzuka", "vegas", "zandvoort",
];

// 6 evenly spaced lap positions (~every 16.7%): 0, 17, 33, 50, 67, 83%. Enough
// to catch gross scenery/geometry/clipping regressions per circuit without the
// old 25-frac (×24 = 600-baseline) overkill. Bump if a regression slips through.
export const LAP_FRACTIONS = [0, 1 / 6, 2 / 6, 3 / 6, 4 / 6, 5 / 6];

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
// jump(f, 40) gives the camera a heading; snapCam aligns it with no damping lag.
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

// Builds the LAP_FRACTIONS-position visual regression suite for one circuit:
// a forward-facing chase-cam view at each fraction, pixel-diffed against a golden.
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
