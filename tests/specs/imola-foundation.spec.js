// @ts-check
import { test, expect } from "../helpers/fixtures.js";

async function loadImola(racePage, time = "day") {
  await racePage.evaluate((tod) => window.__apex.race("imola", tod, "dry"), time);
  await racePage.waitForFunction(() => window.__apex.info().track === "imola");
}

test.describe("Imola track-owned foundation", () => {
  test("validates terrain, models, barriers, elevation, and night rebuild", async ({ racePage, pageErrors }) => {
    test.setTimeout(420000);
    await loadImola(racePage);
    const result = await racePage.evaluate(() => {
      const profile = window.__apex.trackProfile(500);
      const at = (frac) => profile[Math.round(frac * (profile.length - 1))].y;
      const ys = profile.map((point) => point.y);
      const shoulderGaps = [];
      for (let i = 0; i < 240; i++) {
        const frac = i / 240;
        for (const lat of [-10, 10]) {
          const gap = window.__apex.groundY(frac, lat).gap;
          if (gap != null) shoulderGaps.push({ frac, lat, gap });
        }
      }
      return {
        def: window.TrackDefs.find((track) => track.id === "imola"),
        geometry: window.__apex.geometryDiagnostics(),
        models: window.__apex.modelDiagnostics(),
        walls: window.__apex.wallStats(),
        shoulderGaps,
        elevation: {
          flatApproach: at(0.15),
          piratella: at(0.34),
          acqueMinerali: at(0.48),
          varianteAlta: at(0.64),
          rivazza: at(0.80),
          range: Math.max(...ys) - Math.min(...ys),
        },
      };
    });

    expect(pageErrors).toEqual([]);
    expect(result.def.sceneryCoordinates).toBe("racing");
    expect(result.def.terrainOuter).toBe(120);
    expect(result.def.dressingExclusions).toEqual([
      { kinds: ["foliage", "lamps", "floodlights"], s0: 0, s1: 1 },
    ]);
    expect(result.geometry.every((entry) => entry.ok)).toBe(true);
    expect(result.geometry.find((entry) => entry.name === "water")?.vertices).toBeGreaterThan(0);
    expect(result.models.invalid).toEqual([]);
    expect(result.models.suppressed).toEqual([]);
    expect(result.models.unsafe).toEqual([]);
    const required = result.models.emitted.filter((entry) => entry.required).map((entry) => entry.id);
    expect(required).toEqual(expect.arrayContaining([
      "senna-memorial",
      "santerno-footbridge",
      ...Array.from({ length: 9 }, (_, i) => `santerno-water-${i}`),
    ]));
    expect(result.walls.anyNaN).toBe(false);
    expect(result.walls.minOverHw).toBeGreaterThan(0);
    expect(result.walls.tightFrac).toBeGreaterThan(0.3);
    expect(Math.abs(result.elevation.flatApproach)).toBeLessThan(0.5);
    expect(result.elevation.piratella).toBeGreaterThan(10);
    expect(result.elevation.acqueMinerali).toBeLessThan(-8);
    expect(result.elevation.varianteAlta).toBeGreaterThan(12);
    expect(result.elevation.rivazza).toBeLessThan(-10);
    expect(result.elevation.range).toBeGreaterThan(25);
    expect(result.shoulderGaps.filter((sample) => sample.gap > 0.18)).toEqual([]);

    await loadImola(racePage, "night");
    const night = await racePage.evaluate(() => ({
      geometry: window.__apex.geometryDiagnostics(),
      models: window.__apex.modelDiagnostics(),
    }));
    expect(night.geometry.every((entry) => entry.ok)).toBe(true);
    expect([...night.models.invalid, ...night.models.suppressed, ...night.models.unsafe]
      .filter((entry) => entry.required)).toEqual([]);
  });
});
