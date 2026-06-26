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

    await page.evaluate(() => { __apex.freeze(true); });
    await page.waitForTimeout(300);

    // Screenshot just the minimap canvas, zoomed up to 560×560
    const minimap = page.locator('#minimap');
    await minimap.screenshot({ path: `${OUT}/${trackId}.png`, scale: 'css' });
    console.log(`  → ${trackId}.png`);
  });
}
