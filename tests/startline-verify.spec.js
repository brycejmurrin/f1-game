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

    // Freeze then orbit top-down over whole circuit so car position is visible
    await page.evaluate(() => {
      __apex.freeze(true);
      // Top-down: el=85, orbit from the circuit's geographic centre so whole
      // track is in frame. dist scales to circuit size via trackBounds().
      const b = __apex.trackBounds();
      const span = Math.max(b.maxX - b.minX, b.maxZ - b.minZ);
      const dist = Math.max(200, span * 0.65);
      __apex.orbit(b.centerFrac, 0, 85, dist, 0, { fov: 55 });
      __apex.snapCam();
    });
    await page.waitForTimeout(300);

    await page.screenshot({ path: `${OUT}/${trackId}.png` });
    console.log(`  → ${trackId}.png`);
  });
}
