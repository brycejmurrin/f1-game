// @ts-check
import { test, expect } from "@playwright/test";

test("Montreal island foundation stays grounded, clear, and bounded", async ({ page }) => {
  test.setTimeout(300000);
  await page.goto("/");
  await page.waitForFunction(() => window.__apex?.race, { timeout: 15000 });
  await page.evaluate(() => window.__apex.race("montreal", "day", "dry"));
  await page.waitForFunction(() => window.__apex.info().track === "montreal", { timeout: 15000 });

  const result = await page.evaluate(() => {
    const def = Tracks.LIST.find((track) => track.id === "montreal");
    const geometry = window.__apex.geometryDiagnostics();
    const models = window.__apex.modelDiagnostics();
    const profile = window.__apex.trackProfile(240);
    const probes = [0, 0.55].flatMap((frac) =>
      [-70, 70].map((lat) => window.__apex.groundY(frac, lat).gap)
    );
    return {
      def: {
        flatTerrain: def.flatTerrain,
        terrainOuter: def.terrainOuter,
        sceneryCoordinates: def.sceneryCoordinates,
        dressingExclusions: def.dressingExclusions,
      },
      geometry,
      models,
      walls: window.__apex.wallStats(),
      elevation: {
        min: Math.min(...profile.map((point) => point.y)),
        max: Math.max(...profile.map((point) => point.y)),
      },
      probes,
    };
  });

  expect(result.def.flatTerrain).toBe(true);
  expect(result.def.terrainOuter).toBe(70);
  expect(result.def.sceneryCoordinates).toBe("racing");
  expect(result.def.dressingExclusions).toHaveLength(7);

  expect(result.geometry.every((entry) => entry.ok)).toBe(true);
  expect(result.geometry.find((entry) => entry.name === "water")?.vertices).toBeGreaterThan(500);
  expect(result.geometry.find((entry) => entry.name === "props")?.vertices).toBeLessThan(580000);

  expect(result.models.invalid).toEqual([]);
  expect(result.models.unsafe).toEqual([]);
  expect(result.models.suppressed).toEqual([]);
  const bridge = result.models.emitted.find((entry) => entry.id === "montreal-casino-footbridge");
  expect(bridge).toMatchObject({ required: true, overhead: true, clearance: 8 });
  expect(result.models.emitted.filter((entry) => entry.water).length).toBeGreaterThan(40);

  expect(result.walls.anyNaN).toBe(false);
  expect(result.walls.tightFrac).toBeGreaterThan(0.95);
  expect(result.walls.minOverHw).toBeGreaterThan(-1.5);
  expect(result.elevation.max - result.elevation.min).toBeLessThanOrEqual(1.3);
  for (const gap of result.probes)
    expect(gap === null || gap <= 0.18).toBe(true);
});
