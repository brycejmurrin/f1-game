// @ts-check
// Contract tests for __apex.mapPts() and __apex.trackBounds()
import { test, expect } from "@playwright/test";

test("mapPts and trackBounds hooks", async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto("/");
  await page.waitForFunction(() => window.__apex, null, { polling: 100, timeout: 15000 });

  // A default track pre-loads on startup, so mapPts() is already populated here
  // (it is NOT null before an explicit race() — the old comment claimed otherwise).
  const nullPts = await page.evaluate(() => __apex.mapPts());
  expect(nullPts).not.toBeNull(); // default track pre-loads on startup

  await page.evaluate(async () => {
    await __apex.race("monaco");   // awaited — no fixed sleep needed for the build
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
