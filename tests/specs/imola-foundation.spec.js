// @ts-check
import { test, expect } from "../helpers/fixtures.js";

async function loadImola(racePage, time = "day") {
  await racePage.evaluate((tod) => window.__apex.race("imola", tod, "dry"), time);
  await racePage.waitForFunction(() => window.__apex.info().track === "imola", null, { polling: 100 });
}

async function imolaDayDiag(racePage) {
  test.setTimeout(420000);
  await loadImola(racePage);
  return racePage.evaluate(() => {
    const profile = window.__apex.trackProfile(500);
    const at = (frac) => profile[Math.round(frac * profile.length)].y - profile[0].y;
    const ys = profile.map((point) => point.y);
    const shoulderGaps = [];
    for (let i = 0; i < 240; i++) {
      const frac = i / 240;
      for (const lat of [-10, 10]) {
        // Measure protrusion above the banked road edge at this shoulder.
        const gap = window.__apex.groundY(frac, lat).overRoad;
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
        // OpenF1 session 9983, timed laps of cars 1 and 81, relative to the line.
        approach: at(0.30),
        piratella: at(0.467),
        acqueMinerali: at(0.567),
        varianteAlta: at(0.683),
        rivazza: at(0.80),
        range: Math.max(...ys) - Math.min(...ys),
      },
    };
  });
}

test.describe("Imola track-owned foundation", () => {
  // Split 2026-09-30 so an ADAPTED mutant can redden required-models without
  // reddening every named catcher (twin-fidelity asymmetry).
  test("required models and pit supersedes", async ({ racePage, pageErrors }) => {
    const result = await imolaDayDiag(racePage);
    expect(pageErrors).toEqual([]);
    expect(result.models.invalid).toEqual([]);
    // A PIT SUPERSEDE IS BY DESIGN, AND IS STILL PINNED EXACTLY.
    // js/track/scenery/pits.js builds the garages from track.pit, so a circuit's
    // own hand-placed pit block is honoured as a no-op and reported with reason
    // "superseded by the pit complex" (required is downgraded to false on that
    // path, which is why a bare `.filter(e => e.required)` cannot see it either).
    // Listing the ids rather than excusing the reason keeps the assertion sharp:
    // the complex over-claiming and eating real scenery — it has reported a
    // Monaco fountain 308 m from the nearest pit node — shows up here as a new
    // id, not as a count that quietly grows.
    // Since the engine pit moved to Imola's real (left) side, the complex no
    // longer lands on the Acque Minerali mist emitters: nothing is superseded.
    expect(result.models.suppressed.map((entry) => entry.id).sort())
      .toEqual([]);
    expect(result.models.unsafe).toEqual([]);
    const required = result.models.emitted.filter((entry) => entry.required).map((entry) => entry.id);
    expect(required).toEqual(expect.arrayContaining([
      "senna-memorial",
      "santerno-footbridge",
      ...Array.from({ length: 9 }, (_, i) => `santerno-water-${i}`),
    ]));
  });

  test("terrain, elevation, walls and night rebuild", async ({ racePage, pageErrors }) => {
    const result = await imolaDayDiag(racePage);
    expect(pageErrors).toEqual([]);
    expect(result.def.sceneryCoordinates).toBe("racing");
    expect(result.def.terrainOuter).toBe(120);
    expect(result.def.dressingExclusions).toEqual([
      { kinds: ["foliage"], s0: 0, s1: 1 },
      { kinds: ["lighting"], s0: 0.3306, s1: 0.5406 },
      { kinds: ["lighting"], s0: 0.7906, s1: 0.1706 },
    ]);
    expect(result.geometry.every((entry) => entry.ok)).toBe(true);
    expect(result.geometry.find((entry) => entry.name === "water")?.vertices).toBeGreaterThan(0);
    expect(result.walls.anyNaN).toBe(false);
    expect(result.walls.minOverHw).toBeGreaterThan(0);
    expect(result.walls.tightFrac).toBeGreaterThan(0.3);
    for (const [station, metres] of Object.entries({
      approach: 5.35, piratella: 32.6, acqueMinerali: 11.4, varianteAlta: 29.5,
      rivazza: 18.3, range: 34.4,
    })) {
      expect(Math.abs(result.elevation[station] - metres), station).toBeLessThan(1.5);
    }
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
