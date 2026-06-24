// @ts-check
// Contract tests for __apex.mapPts() and __apex.trackBounds()
import { test, expect } from "@playwright/test";

test("mapPts and trackBounds hooks", async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto("/");
  await page.waitForFunction(() => window.__apex, { timeout: 15000 });

  // Before a track is loaded both return null
  const nullPts = await page.evaluate(() => __apex.mapPts());
  expect(nullPts).not.toBeNull(); // default track pre-loads on startup

  await page.evaluate(async () => {
    __apex.race("monaco");
    await new Promise(r => setTimeout(r, 3000));
  });

  const pts = await page.evaluate(() => __apex.mapPts());
  expect(pts).not.toBeNull();
  expect(pts.length).toBeGreaterThan(10);
  // All values should be in [0, 1]
  for (const p of pts) {
    expect(p[0]).toBeGreaterThanOrEqual(0);
    expect(p[0]).toBeLessThanOrEqual(1);
    expect(p[1]).toBeGreaterThanOrEqual(0);
    expect(p[1]).toBeLessThanOrEqual(1);
  }
  // North-up: Monaco Casino area (high elevation, frac ~0.2) should be near
  // the top of the map (low y). We just check the map has pts spanning > 0.5
  const ys = pts.map(p => p[1]);
  expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(0.5);

  const bounds = await page.evaluate(() => __apex.trackBounds());
  expect(bounds).not.toBeNull();
  expect(bounds.spanX).toBeGreaterThan(100);
  expect(bounds.spanZ).toBeGreaterThan(100);
  expect(bounds.centerFrac).toBeGreaterThanOrEqual(0);
  expect(bounds.centerFrac).toBeLessThanOrEqual(1);

  // centerFrac should be usable directly with orbit()
  await page.evaluate(b => __apex.orbit(b.centerFrac, 0, 85, 1400), bounds);

  console.log("Monaco mapPts:", pts.length, "pts");
  console.log("Monaco trackBounds:", JSON.stringify(bounds));
});
