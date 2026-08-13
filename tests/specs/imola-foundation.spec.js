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
          // 7a173519 moved the start line (startFrac 0.495 -> 0.0), rotating
          // racing fractions by the arc shift (+0.5094); the corners themselves
          // did not move. Probes re-located onto the corners in the new frame
          // (headless VM, extremum scan around old frac + shift):
          //   flat approach 0.15 -> 0.66  (y 0.11)
          //   Piratella crest 0.34 -> 0.848 (local max 0.8474, y 14.04)
          //   Acque Minerali 0.48 -> 0.994 (local min 0.9934, y -9.96)
          //   Variante Alta 0.64 -> 0.148 (local max 0.1487, y 16.10)
          //   Rivazza 0.80 -> 0.310 (local min 0.3094, y -13.98)
          flatApproach: at(0.66),
          piratella: at(0.848),
          acqueMinerali: at(0.994),
          varianteAlta: at(0.148),
          rivazza: at(0.310),
          range: Math.max(...ys) - Math.min(...ys),
        },
      };
    });

    expect(pageErrors).toEqual([]);
    expect(result.def.sceneryCoordinates).toBe("racing");
    expect(result.def.terrainOuter).toBe(120);
    expect(result.def.dressingExclusions).toEqual([
      { kinds: ["foliage", "lighting"], s0: 0, s1: 1 },
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
