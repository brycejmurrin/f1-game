// @ts-check
import { test, expect } from "@playwright/test";

const OVERHEAD_IDS = [
  "yas-hotel-gridshell-arch-1",
  "yas-hotel-gridshell-arch-2",
  "yas-hotel-gridshell-arch-3",
  "yas-hotel-gridshell-arch-4",
  "yas-hotel-gridshell-arch-5",
  "yas-hotel-gridshell-arch-6",
  "yas-hotel-gridshell-arch-7",
  "yas-hotel-bridge-main",
  "yas-hotel-bridge-forward",
];

const SUPPORT_IDS = [
  "yas-hotel-gridshell-front-left-support",
  "yas-hotel-gridshell-front-right-support",
  "yas-hotel-gridshell-rear-left-support",
  "yas-hotel-gridshell-rear-right-support",
  "yas-hotel-bridge-main-left-pier",
  "yas-hotel-bridge-main-right-pier",
  "yas-hotel-bridge-forward-left-pier",
  "yas-hotel-bridge-forward-right-pier",
];

async function loadAbuDhabi(page, timeOfDay) {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex?.race, undefined, { timeout: 15000 });
  await page.evaluate((tod) => {
    window.__apex.headless(true);
    window.__apex.race("abudhabi", tod, "dry");
  }, timeOfDay);
  await page.waitForFunction(() => window.__apex.info().track != null,
    undefined, { timeout: 15000 });
}

for (const timeOfDay of ["day", "night"]) {
  test(`Abu Dhabi foundation contracts hold at ${timeOfDay}`, async ({ page }) => {
    await loadAbuDhabi(page, timeOfDay);

    const result = await page.evaluate(() => {
      const definition = window.TrackDefs.find((entry) => entry.id === "abudhabi");
      const profile = window.__apex.trackProfile(360);
      const models = window.__apex.modelDiagnostics();
      const ground = [0.42, 0.55, 0.70, 0.88].flatMap((frac) =>
        [-6, 0, 6].map((lat) => ({ frac, lat, gap: window.__apex.groundY(frac, lat).gap }))
      );
      return {
        definition: {
          hasElevations: Array.isArray(definition.elevations) && definition.elevations.length > 0,
          sceneryCoordinates: definition.sceneryCoordinates,
          dressingExclusions: definition.dressingExclusions,
        },
        elevationRange: Math.max(...profile.map((point) => point.y)) -
          Math.min(...profile.map((point) => point.y)),
        geometry: window.__apex.geometryDiagnostics(),
        models,
        walls: window.__apex.wallStats(),
        ground,
      };
    });

    // Yas Marina DOES declare elevations now — "~9 m end to end, no gradient
    // over ~2 %" (js/circuits/abudhabi.js: it climbs away from the pit straight,
    // crests over the north loop, eases back down through the marina). This
    // asserted the opposite, from when the trace shipped dead level.
    expect(result.definition.hasElevations).toBe(true);
    expect(result.definition.sceneryCoordinates).toBe("racing");
    expect(result.definition.dressingExclusions.length).toBeGreaterThanOrEqual(4);
    // Measures 9.20 m. `< 0.1` was the dead-level trace these elevations
    // replaced; a band keeps this a real ratchet rather than a rubber stamp.
    expect(result.elevationRange).toBeGreaterThanOrEqual(7.5);
    expect(result.elevationRange).toBeLessThanOrEqual(11);
    expect(result.geometry.every((entry) => entry.ok)).toBe(true);

    const hardFailures = [
      ...result.models.invalid,
      ...result.models.suppressed,
      ...result.models.unsafe,
    ].filter((entry) => entry.required);
    expect(hardFailures).toEqual([]);
    expect(result.models.invalid).toEqual([]);
    expect(result.models.unsafe).toEqual([]);

    const emittedById = new Map(result.models.emitted.map((entry) => [entry.id, entry]));
    const emittedIds = new Set(emittedById.keys());
    expect(emittedIds.has("yas-hotel-left-tower")).toBe(true);
    expect(emittedIds.has("yas-hotel-right-tower")).toBe(true);
    // WATER IS NOW TWO BODIES, NOT NINE-PLUS SLABS — and that is more water, not
    // less. The marina used to be laid as two overlapping rows of waterSurface()
    // boxes, one diagnostics entry per station, which is what made `> 8` a count
    // of anything. js/circuits/abudhabi.js replaced them with a single rasterised
    // band ("Continuous overlapping reflective-water ribbon (basin, not land
    // boxes)… they interleaved into a patchwork and fought for the same pixels
    // wherever they overlapped at the shared water height"), so the basin reports
    // once and its unit of work is MERGED QUAD RUNS. Counting entries counts the
    // authoring style: measured 2 entries covering ~161.7k m² of projected water.
    // Name the two bodies and ratchet the COVERAGE, which is the thing that must
    // not silently shrink.
    const water = new Map(result.models.emitted.filter((entry) => entry.water)
      .map((entry) => [entry.id, entry]));
    expect([...water.keys()].sort())
      .toEqual(["marina-water", "yas-hotel-reflecting-pool"]);
    // Marina band measures 93 merged runs / 372 vertices, the hotel reflecting
    // pool a 24-vertex box: 396 total. Bands at ~±20 % keep this a real ratchet —
    // a band that stopped rasterising, or one that ate the road and got clipped
    // back to a handful of runs, still fails.
    expect(water.get("marina-water").runs).toBeGreaterThanOrEqual(75);
    expect(water.get("marina-water").runs).toBeLessThanOrEqual(112);
    const waterVertices = [...water.values()]
      .reduce((sum, entry) => sum + entry.vertices, 0);
    expect(waterVertices).toBeGreaterThanOrEqual(320);
    expect(waterVertices).toBeLessThanOrEqual(480);
    for (const id of OVERHEAD_IDS) {
      const span = emittedById.get(id);
      expect(span, `${id} did not emit`).toBeDefined();
      expect(span.required).toBe(true);
      expect(span.overhead).toBe(true);
      expect(span.clearance).toBeGreaterThanOrEqual(4.8);
    }
    for (const id of SUPPORT_IDS) {
      const support = emittedById.get(id);
      expect(support, `${id} did not emit`).toBeDefined();
      expect(support.required).toBe(true);
      expect(support.overhead).not.toBe(true);
      expect(support.vertices).toBeGreaterThan(0);
    }
    for (const span of result.models.emitted.filter((entry) => entry.overhead))
      expect(span.clearance).toBeGreaterThanOrEqual(4.8);

    expect(result.walls.anyNaN).toBe(false);
    expect(result.walls.tightFrac).toBeGreaterThan(0.2);
    for (const sample of result.ground)
      expect(sample.gap === null || sample.gap <= 0.18,
        `terrain over road at ${sample.frac} lat ${sample.lat}: ${sample.gap}`).toBe(true);
  });
}
