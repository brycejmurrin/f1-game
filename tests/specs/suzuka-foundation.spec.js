// @ts-check
import { test, expect, BOOT_MS } from "../helpers/fixtures.js";

test("Suzuka keeps its elevation, crossover, and track-owned models aligned", async ({ page, pageErrors }) => {
  test.setTimeout(180_000);
  await page.goto("/");
  // BOOT_MS, not a hand-rolled 15 s: a SwiftShader boot here measures 11-33 s (2026-09-01).
  await page.waitForFunction(() => window.__apex?.race, null, { polling: 100, timeout: BOOT_MS });
  await page.evaluate(() => window.__apex.race("suzuka", "day", "dry"));
  await page.waitForFunction(() => window.__apex.info().track === "suzuka", null, { polling: 100, timeout: BOOT_MS });

  const audit = await page.evaluate(() => {
    const raw = window.TrackDefs.find((definition) => definition.id === "suzuka");
    const built = Tracks.LIST.find((definition) => definition.id === "suzuka");
    const at = (fraction) => window.__apex.nodeAt(fraction).y;
    const modelDiagnostics = window.__apex.modelDiagnostics();
    const geometryDiagnostics = window.__apex.geometryDiagnostics();
    const ground = [0.070, 0.240, 0.438, 0.845].flatMap((fraction) =>
      [-6, 0, 6].map((lat) => ({ fraction, lat, ...window.__apex.groundY(fraction, lat) }))
    );

    return {
      raw: {
        sceneryCoordinates: raw.sceneryCoordinates,
        terrainOuter: raw.terrainOuter,
        // Elevation is the SRTM bake in CircuitElevations (hasRealElevation);
        // authored cosine bumps were removed — they left ~71% of the lap flat.
        hasAuthoredElevations: Array.isArray(raw.elevations) && raw.elevations.length > 0,
        bridges: raw.bridges.map(({ s, halfM, rise }) => ({ s, halfM, rise })),
      },
      built: {
        hasAuthoredElevations: Array.isArray(built.elevations) && built.elevations.length > 0,
        bridges: built.bridges.map(({ s, halfM, rise }) => ({ s, halfM, rise })),
      },
      // SRTM undulation: Degner basin near 0.15, climb through the Esses to
      // ~0.30; figure-8 flyover stays a BRIDGE lift at racing 0.845.
      relief: {
        essesClimb: at(0.30) - at(0.15),
        degnerBasin: at(0.15) - (at(0.05) + at(0.25)) / 2,
        crossover: at(0.845) - (at(0.810) + at(0.880)) / 2,
      },
      ground,
      wallStats: window.__apex.wallStats(),
      modelDiagnostics,
      geometryDiagnostics,
    };
  });

  expect(audit.raw.sceneryCoordinates).toBe("racing");
  expect(audit.raw.terrainOuter).toBe(120);
  expect(audit.raw.hasAuthoredElevations).toBe(false);
  expect(audit.built.hasAuthoredElevations).toBe(false);
  expect(audit.raw.bridges).toEqual([{ s: 0.845, halfM: 160, rise: 10 }]);
  // Built bridge frac is the source frac mapped through startFrac 0.9942 alone
  // (s + 0.0058).
  expect(audit.built.bridges[0].s).toBeCloseTo(0.8508, 6);

  expect(audit.relief.essesClimb).toBeGreaterThan(18);
  expect(audit.relief.degnerBasin).toBeLessThan(-8);
  expect(audit.relief.crossover).toBeGreaterThan(2);
  for (const probe of audit.ground) {
    expect(probe.gap === null || probe.gap <= 0.18,
      `terrain at ${(probe.fraction * 100).toFixed(1)}% lat ${probe.lat}m: ${probe.gap}`).toBe(true);
  }

  expect(audit.wallStats.anyNaN).toBe(false);
  expect(audit.wallStats.minB).toBeGreaterThan(1);
  expect(audit.wallStats.maxB).toBeLessThan(60);

  const requiredIds = [
    "suzuka-start-gantry",
    "suzuka-esses-footbridge",
    "suzuka-esses-footbridge-left-tower",
    "suzuka-esses-footbridge-right-tower",
    "suzuka-hairpin-footbridge",
    "suzuka-hairpin-footbridge-left-tower",
    "suzuka-hairpin-footbridge-right-tower",
    "suzuka-degner-gantry",
    "suzuka-130r-gantry",
    "suzuka-crossover-deck",
    "suzuka-main-stand-crown",
  ];
  const emitted = new Set(audit.modelDiagnostics.emitted.map(({ id }) => id));
  for (const id of requiredIds) expect(emitted.has(id), `${id} emitted`).toBe(true);
  expect(audit.modelDiagnostics.invalid.filter(({ required }) => required)).toEqual([]);
  expect(audit.modelDiagnostics.unsafe.filter(({ required }) => required)).toEqual([]);
  expect(audit.modelDiagnostics.suppressed.filter(({ required }) => required)).toEqual([]);
  expect(audit.geometryDiagnostics.every(({ ok }) => ok)).toBe(true);
  expect(pageErrors).toEqual([]);
});
