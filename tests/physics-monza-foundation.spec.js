// @ts-check
import { test, expect } from "@playwright/test";

test.describe("Monza track-owned foundation migration", () => {
  test("keeps terrain, landmarks, water, barriers, and overhead intent valid", async ({ page }) => {
    test.setTimeout(240_000);
    await page.goto("/");
    await page.waitForFunction(() => window.__apex?.race, { timeout: 15_000 });
    await page.evaluate(() => window.__apex.race("monza", "day", "dry"));
    await page.waitForFunction(() => window.__apex.info().track === "monza", { timeout: 15_000 });
    const result = await page.evaluate(() => {
      const def = window.TrackDefs.find((entry) => entry.id === "monza");
      const profile = window.__apex.trackProfile(240);
      return {
        coordinates: def.sceneryCoordinates,
        terrainOuter: def.terrainOuter,
        roggiaY: window.__apex.nodeAt(0.30).y,
        lesmoY: window.__apex.nodeAt(0.48).y,
        minY: Math.min(...profile.map((entry) => entry.y)),
        maxY: Math.max(...profile.map((entry) => entry.y)),
        geometry: window.__apex.geometryDiagnostics(),
        models: window.__apex.modelDiagnostics(),
        walls: window.__apex.wallStats(),
        edgeProbes: [0.04, 0.30, 0.48, 0.73, 0.78, 0.90].flatMap((frac) =>
          [-11, 11].map((lat) => ({ frac, lat, ...window.__apex.groundY(frac, lat) }))
        ),
      };
    });

    expect(result.coordinates).toBe("racing");
    expect(result.terrainOuter).toBe(120);
    expect(result.roggiaY).toBeLessThan(-1);
    expect(result.lesmoY).toBeGreaterThan(4);
    expect(result.maxY - result.minY).toBeLessThan(7);
    expect(result.geometry.every((entry) => entry.ok)).toBe(true);
    expect(result.geometry.find((entry) => entry.name === "water")?.vertices).toBeGreaterThan(0);
    expect(result.models.invalid).toEqual([]);
    expect(result.models.unsafe).toEqual([]);

    const hard = [...result.models.invalid, ...result.models.suppressed, ...result.models.unsafe]
      .filter((entry) => entry.required);
    expect(hard).toEqual([]);

    const emitted = new Map(result.models.emitted.map((entry) => [entry.id, entry]));
    for (const id of [
      "monza-pit-canopy",
      "monza-villa-lake",
      "monza-west-park-lake",
      "monza-sopraelevata-flyover",
      "monza-sopraelevata-pier-left",
      "monza-sopraelevata-pier-right",
      "monza-banking-lower",
      "monza-banking-middle",
      "monza-banking-upper",
    ]) {
      expect(emitted.has(id), `${id} should be emitted`).toBe(true);
    }
    expect(emitted.get("monza-sopraelevata-flyover")?.clearance).toBeGreaterThanOrEqual(4.8);

    expect(result.walls.anyNaN).toBe(false);
    expect(result.walls.tightFrac).toBeGreaterThan(0.6);
    for (const probe of result.edgeProbes) {
      expect(probe.terrainY, `terrain missing at ${probe.frac}:${probe.lat}`).not.toBeNull();
      expect(probe.gap, `terrain above road at ${probe.frac}:${probe.lat}`).toBeLessThanOrEqual(0.18);
    }
  });
});
