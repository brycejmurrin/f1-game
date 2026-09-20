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
        elevations: raw.elevations.map(({ s, halfM, rise }) => ({ s, halfM, rise })),
        bridges: raw.bridges.map(({ s, halfM, rise }) => ({ s, halfM, rise })),
      },
      built: {
        elevations: built.elevations.map(({ s, halfM, rise }) => ({ s, halfM, rise })),
        bridges: built.bridges.map(({ s, halfM, rise }) => ({ s, halfM, rise })),
      },
      // The corrected figure-eight lifts the back straight at racing 0.845,
      // while the broad 26 m Esses elevation follows the terrain at 0.24.
      relief: {
        esses: at(0.240) - (at(0.130) + at(0.350)) / 2,
        degner: at(0.070) - (at(0.010) + at(0.130)) / 2,
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
  expect(audit.raw.elevations).toEqual([
    { s: 0.0625, halfM: 260, rise: -5 },
    { s: 0.24, halfM: 620, rise: 26 },
  ]);
  expect(audit.raw.bridges).toEqual([{ s: 0.845, halfM: 160, rise: 10 }]);
  expect(audit.built.elevations[0].s).toBeCloseTo(0.45, 6);
  expect(audit.built.elevations[1].s).toBeCloseTo(0.6275, 6);
  expect(audit.built.bridges[0].s).toBeCloseTo(0.2325, 6);

  expect(audit.relief.esses).toBeGreaterThan(4);
  expect(audit.relief.degner).toBeLessThan(-2);
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
