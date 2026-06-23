import { test, expect } from "@playwright/test";
const TRACKS = (process.env.TC_TRACKS || "miami").split(",");
test.use({ viewport: { width: 1100, height: 800 } });
for (const trk of TRACKS) {
  test(`terrain ${trk}`, async ({ page }) => {
    test.setTimeout(90000);
    await page.goto("/");
    await page.waitForFunction(() => window.__apex?.race, { timeout: 15000 });
    await page.evaluate((t) => { __apex.race(t, "day", "dry"); __apex.hud(false); }, trk);
    await page.waitForTimeout(2000);
    const views = {
      topdown: { elevation: 84, azimuth: 25, zoom: 1.0 },
      oblique: { elevation: 20, azimuth: 60, zoom: 0.85 },
      oblique2: { elevation: 18, azimuth: 200, zoom: 0.85 },
    };
    for (const [name, v] of Object.entries(views)) {
      await page.evaluate((v) => __apex.view(v), v);
      await page.waitForTimeout(350);
      await page.screenshot({ path: `tests/scenery-shots/terr-${trk}-${name}.png` });
    }
    expect(true).toBe(true);
  });
}
