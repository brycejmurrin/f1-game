// One-off: screenshot every track at frac=0 (start/finish) zoomed in close.
// Run: npx playwright test tests/startline-verify.spec.js
// Output: tests/startline-shots/
import { test } from "@playwright/test";
import fs from "fs";

const OUT = "tests/startline-shots";
fs.mkdirSync(OUT, { recursive: true });

const TRACKS = [
  "abudhabi", "albert_park", "bahrain", "barcelona", "baku",
  "cota", "hungaroring", "imola", "interlagos", "jeddah",
  "madrid", "mexico", "miami", "monaco", "monza", "montreal",
  "qatar", "redbull", "shanghai", "silverstone", "singapore",
  "spa", "suzuka", "vegas", "zandvoort",
];

test.setTimeout(25000);

for (const trackId of TRACKS) {
  test(`start-line ${trackId}`, async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 675 });
    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null, { timeout: 12000 });

    // Load track, freeze, hide HUD
    await page.evaluate(async (t) => {
      __apex.race(t);
      await new Promise(r => setTimeout(r, 3000));
      __apex.freeze(true);
      __apex.hud(false);
    }, trackId);

    // Park at start (frac=0) then orbit close and slightly overhead from ahead
    // az=0 = camera placed in "forward" direction from target, looking back at the start
    // el=40 = 40° above road, dist=45 = 45 m away
    await page.evaluate(() => {
      __apex.park(0);
      __apex.orbit(0, 0, 40, 45, 1.5, { fov: 42 });
      __apex.snapCam();
    });
    await page.waitForTimeout(300);

    await page.screenshot({ path: `${OUT}/${trackId}.png` });
    console.log(`  → ${trackId}.png`);
  });
}
