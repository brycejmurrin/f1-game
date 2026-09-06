// @ts-check
// Contract tests for __apex.mapPts() and __apex.trackBounds()
// Imports from ../helpers/fixtures.js, not @playwright/test: a failure then
// attaches apex-state / apex-logs / page-console, and the pageErrors guard is on.
import { test, expect, BOOT_MS, awaitTrackBuild } from "../helpers/fixtures.js";

test("mapPts and trackBounds hooks", async ({ page }) => {
  // DECLARE THE BUDGET. This boots the default track and then a SECOND circuit
  // (Monaco) — two builds in one test. Silent about that cost it was billed at
  // the change-aware gate's 180 s rate and ran 185-190 s on a CI runner (Pages
  // #2048, both attempts), so tools/ci/select-specs.mjs kept selecting it into a
  // gate it could not fit. Declared above the gate it is excluded by name and
  // runs in its own group. Measured 55-63 s on the dev box.
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto("/");
  // BOOT_MS, not a hand-rolled 15 s: a SwiftShader boot here measures 11-33 s (2026-09-01).
  await page.waitForFunction(() => window.__apex, null, { polling: 100, timeout: BOOT_MS });
  // HEADLESS from here: every hook below reads geometry, none reads a pixel,
  // and each evaluate round trip otherwise waits on a SwiftShader frame that
  // holds the main thread for seconds (docs/TESTING.md, "A Playwright click
  // costs 80-113 s while the game renders"). Measured alone on this box:
  // 91 s rendering, 53 s headless. The budget above stays declared — two
  // builds are two builds — but the render was the half nobody was using.
  await page.evaluate(() => __apex.headless(true));

  // A default track pre-loads on startup, so mapPts() is already populated here
  // (it is NOT null before an explicit race() — the old comment claimed otherwise).
  const nullPts = await page.evaluate(() => __apex.mapPts());
  expect(nullPts).not.toBeNull(); // default track pre-loads on startup

  // Wait for the build, not a fixed 3 s: on a slow box the map is read half-built.
  await page.evaluate(() => { __apex.race("monaco"); });
  await awaitTrackBuild(page);

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
