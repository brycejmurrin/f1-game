// @ts-check
import { test, expect } from "./fixtures.js";

const HERO_MODELS = ["qatar-pit-slab", "qatar-t1-vvip-canopy"];

test("Qatar uses the shared track foundation contracts", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/");
  await page.waitForFunction(() => window.__apex?.race, { timeout: 15_000 });

  const metadata = await page.evaluate(() => {
    const def = window.TrackDefs.find((track) => track.id === "qatar");
    return {
      sceneryCoordinates: def.sceneryCoordinates,
      flatTerrain: def.flatTerrain,
      terrainOuter: def.terrainOuter,
      dressingExclusions: def.dressingExclusions,
    };
  });
  await page.evaluate(() => window.__apex.race("qatar", "night", "dry"));
  await page.waitForFunction(() => window.__apex.lightState().builtNight, { timeout: 15_000 });
  const session = await page.evaluate(() => {
    const profile = window.__apex.trackProfile(360);
    const heights = profile.map((point) => point.y);
    const ground = [0, 0.05, 0.18, 0.4, 0.62, 0.74, 0.95].flatMap((frac) =>
      [-18, 18].map((lat) => window.__apex.groundY(frac, lat).gap)
    );
    return {
      elevationRange: Math.max(...heights) - Math.min(...heights),
      geometry: window.__apex.geometryDiagnostics(),
      models: window.__apex.modelDiagnostics(),
      lights: window.__apex.lightState(),
      walls: window.__apex.wallStats(),
      ground,
    };
  });

  expect(metadata.sceneryCoordinates).toBe("racing");
  expect(metadata.flatTerrain).toBe(true);
  expect(metadata.terrainOuter).toBeGreaterThanOrEqual(100);
  expect(metadata.dressingExclusions).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ kind: "foliage", s0: 0, s1: 1 }),
    ])
  );

  expect(session.elevationRange, "Qatar remains effectively flat").toBeLessThan(0.25);
  expect(session.geometry.every((entry) => entry.ok), "geometry is finite").toBe(true);
  expect(session.geometry.find((entry) => entry.name === "props").vertices).toBeLessThan(265_000);
  const hard = [
    ...session.models.invalid,
    ...session.models.suppressed,
    ...session.models.unsafe,
  ].filter((entry) => entry.required);
  expect(hard, "required models build cleanly").toEqual([]);
  const emitted = session.models.emitted.map((entry) => entry.id);
  for (const id of HERO_MODELS) expect(emitted, `emits ${id}`).toContain(id);
  expect(session.walls.anyNaN).toBe(false);
  expect(session.walls.minB).toBeGreaterThan(1);
  expect(session.walls.maxB).toBeLessThan(60);
  expect(session.ground.every((gap) => gap === null || gap <= 0.18)).toBe(true);
  expect(session.lights.builtNight).toBe(true);
  expect(session.lights.numLights).toBeGreaterThan(0);
});
