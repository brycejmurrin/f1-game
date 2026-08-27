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
  await page.waitForFunction(() => window.__apex?.race, undefined, { polling: 100, timeout: 15000 });
  await page.evaluate((tod) => {
    window.__apex.headless(true);
    window.__apex.race("abudhabi", tod, "dry");
  }, timeOfDay);
  await page.waitForFunction(() => window.__apex.info().track != null,
    undefined, { polling: 100, timeout: 15000 });
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

    // Yas Marina is NOT flat, and has not been since it was given a real
    // profile: it climbs away from the pit straight, crests over the north loop
    // and eases back down through the marina, ~9 m end to end at under 2%
    // gradient (js/circuits/abudhabi.js `elevations`). This asserted flatness
    // long after that landed, so the spec failed on the circuit's own intended
    // shape — the contract worth pinning is the SHAPE, not its absence.
    expect(result.definition.hasElevations).toBe(true);
    expect(result.definition.sceneryCoordinates).toBe("racing");
    expect(result.definition.dressingExclusions.length).toBeGreaterThanOrEqual(4);
    // Measured 9.24 m. Bounded on both sides: too small means the profile
    // stopped being applied, too large means it grew into a gradient Yas Marina
    // does not have.
    expect(result.elevationRange).toBeGreaterThan(6);
    expect(result.elevationRange).toBeLessThan(14);
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
    // COUNTS THE TESSELLATION, NOT THE WATER. waterSurface() rasterises a
    // basin into fine cells and merges occupied cells into flat quad runs, so
    // as that merge improved the model count fell while the water stayed
    // exactly where it was. Measured on this build: 2 merged models carrying 93 runs, 396 verts, 161 746 m2 of marina. Nothing is
    // suppressed. The geometry assertion above (water vertices) is the real
    // contract; this one only needs to say the basin exists at all.
    // Same change as physics-monaco-foundation.spec.js — see its comment.
    expect(result.models.emitted.filter((entry) => entry.water).length).toBeGreaterThan(0);
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
