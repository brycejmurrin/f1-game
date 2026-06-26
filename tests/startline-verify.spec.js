// One-off: screenshot every track at frac=0 (start/finish) with HUD + minimap.
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
    // Landscape viewport so #rotate-device overlay doesn't obscure HUD
    await page.setViewportSize({ width: 1200, height: 675 });
    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null, { timeout: 12000 });

    // Load track, start race (places cars at grid / frac=0), then freeze
    await page.evaluate(async (t) => {
      __apex.race(t);
      await new Promise(r => setTimeout(r, 3000));
      __apex.go();
    }, trackId);
    await page.waitForTimeout(400);

    // Freeze with HUD on so minimap shows car position at start
    await page.evaluate(() => {
      __apex.freeze(true);
      // Tight orbit from slightly behind-and-above so the straight ahead is visible
      // az=180 = camera behind car, el=20 = low angle, dist=35 = close
      __apex.orbit(0, 180, 20, 35, 1.5, { fov: 52 });
      __apex.snapCam();
    });
    await page.waitForTimeout(300);

    await page.screenshot({ path: `${OUT}/${trackId}.png` });
    console.log(`  → ${trackId}.png`);
  });
}
