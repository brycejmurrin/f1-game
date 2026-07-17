// @ts-check
import { test, expect } from "@playwright/test";

const TOL = 0.18;

test("Red Bull Ring owns a safe migrated alpine foundation", async ({ page }) => {
  test.setTimeout(180000);
  await page.goto("/");
  await page.waitForFunction(() => window.__apex?.race, { timeout: 15000 });

  const result = await page.evaluate(() => {
    const def = Tracks.LIST.find((track) => track.id === "redbull");
    window.__apex.race("redbull", "day", "dry");
    const profile = window.__apex.trackProfile(800);
    const peak = profile.reduce((best, point) => point.y > best.y ? point : best);
    const low = profile.reduce((best, point) => point.y < best.y ? point : best);
    const diagnostics = window.__apex.modelDiagnostics();
    const requiredFailures = [
      ...diagnostics.invalid,
      ...diagnostics.suppressed,
      ...diagnostics.unsafe,
    ].filter((entry) => entry.required);
    const clearanceProbes = [0.98, 0.335].flatMap((frac) =>
      [-24, -10, 10, 24].map((lat) => ({
        frac,
        lat,
        gap: window.__apex.groundY(frac, lat).gap,
      }))
    );

    return {
      coordinates: def?.sceneryCoordinates,
      terrainOuter: def?.terrainOuter,
      profile: {
        peak,
        low,
        swing: peak.y - low.y,
        maxSlope: Math.max(...profile.map((point) => Math.abs(point.slope))),
      },
      geometry: window.__apex.geometryDiagnostics(),
      diagnostics,
      requiredFailures,
      walls: window.__apex.wallStats(),
      clearanceProbes,
    };
  });

  expect(result.coordinates).toBe("racing");
  expect(result.terrainOuter).toBeGreaterThanOrEqual(28);
  expect(result.terrainOuter).toBeLessThanOrEqual(72);
  expect(result.profile.swing).toBeGreaterThanOrEqual(55);
  expect(result.profile.swing).toBeLessThanOrEqual(65);
  expect(result.profile.peak.frac).toBeGreaterThan(0.15);
  expect(result.profile.peak.frac).toBeLessThan(0.28);
  expect(result.profile.low.frac).toBeGreaterThan(0.34);
  expect(result.profile.low.frac).toBeLessThan(0.50);
  expect(result.profile.maxSlope).toBeLessThan(0.14);

  expect(result.geometry.every((entry) => entry.ok)).toBe(true);
  expect(result.diagnostics.invalid).toEqual([]);
  expect(result.diagnostics.unsafe).toEqual([]);
  expect(result.requiredFailures).toEqual([]);
  expect(result.diagnostics.emitted.map((entry) => entry.id)).toEqual(
    expect.arrayContaining(["redbull-wing", "redbull-bull-plaza"])
  );

  expect(result.walls.anyNaN).toBe(false);
  expect(result.walls.tightFrac).toBeGreaterThan(0.99);
  expect(result.walls.minOverHw).toBeGreaterThan(0);
  for (const probe of result.clearanceProbes) {
    expect(probe.gap === null || probe.gap <= TOL,
      `terrain at ${(probe.frac * 100).toFixed(1)}% lat ${probe.lat}m: ${probe.gap}`).toBe(true);
  }
});
