// @ts-check
import { test, expect } from "../helpers/fixtures.js";

test("Albert Park runtime build emits required fountains and safe water geometry", async ({
  racePage,
  pageErrors,
}) => {
  await racePage.evaluate(() => window.__apex.race("albert_park", "day", "dry"));
  await racePage.waitForFunction(() => window.__apex.info().track === "albert_park");

  const result = await racePage.evaluate(() => {
    const models = window.__apex.modelDiagnostics();
    const geometry = window.__apex.geometryDiagnostics();
    const requiredFailures = [
      ...models.invalid, ...models.suppressed, ...models.unsafe,
    ].filter((entry) => entry.required);
    return {
      requiredFailures,
      fountains: models.emitted
        .filter((entry) => entry.required && entry.id.startsWith("albert-lake-fountain-"))
        .map((entry) => ({ id: entry.id, vertices: entry.vertices })),
      lakeIds: models.emitted
        .filter((entry) => entry.water && entry.id.startsWith("albert-"))
        .map((entry) => entry.id),
      water: geometry.find((entry) => entry.name === "water"),
      badGeometry: geometry.filter((entry) => !entry.ok),
      spanClearances: models.emitted
        .filter((entry) => entry.overhead)
        .map((entry) => entry.clearance),
      ground: [0.04, 0.30, 0.62, 0.78, 0.97].flatMap((frac) =>
        [-12, 12].map((lat) => ({ frac, lat, gap: window.__apex.groundY(frac, lat).gap }))),
      walls: window.__apex.wallStats(),
    };
  });

  expect(result.requiredFailures).toEqual([]);
  expect(result.fountains).toHaveLength(2);
  expect(result.fountains.every((entry) => entry.vertices > 0)).toBe(true);
  expect(result.lakeIds).toContain("albert-lake-west");
  expect(result.lakeIds).toContain("albert-lake-east");
  expect(result.lakeIds.length).toBeGreaterThanOrEqual(8);
  expect(result.water?.ok).toBe(true);
  expect(result.water?.vertices).toBeGreaterThan(0);
  expect(result.water?.indices).toBeGreaterThan(0);
  expect(result.badGeometry).toEqual([]);
  expect(result.spanClearances.every((clearance) => clearance >= 4.8)).toBe(true);
  expect(result.ground.every(({ gap }) => gap === null || gap <= 0.18)).toBe(true);
  expect(result.walls.anyNaN).toBe(false);
  expect(result.walls.minOverHw).toBeGreaterThan(-1.5);
  expect(pageErrors).toEqual([]);
});
