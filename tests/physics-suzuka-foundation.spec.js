// @ts-check
import { test, expect } from "./fixtures.js";

test("Suzuka keeps its elevation, crossover, and track-owned models aligned", async ({ page, pageErrors }) => {
  test.setTimeout(180_000);
  await page.goto("/");
  await page.waitForFunction(() => window.__apex?.race, { timeout: 15000 });
  await page.evaluate(() => window.__apex.race("suzuka", "day", "dry"));
  await page.waitForFunction(() => window.__apex.info().track === "suzuka", { timeout: 15000 });

  const audit = await page.evaluate(() => {
    const raw = window.TrackDefs.find((definition) => definition.id === "suzuka");
    const built = Tracks.LIST.find((definition) => definition.id === "suzuka");
    const at = (fraction) => window.__apex.nodeAt(fraction).y;
    const modelDiagnostics = window.__apex.modelDiagnostics();
    const geometryDiagnostics = window.__apex.geometryDiagnostics();
    const ground = [0.20, 0.37, 0.45, 0.811].flatMap((fraction) =>
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
      relief: {
        esses: at(0.20) - (at(0.12) + at(0.28)) / 2,
        degner: at(0.45) - (at(0.39) + at(0.51)) / 2,
        crossover: at(0.811) - (at(0.775) + at(0.847)) / 2,
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
    { s: 0.8125, halfM: 300, rise: 11 },
    { s: 0.0625, halfM: 260, rise: -5 },
  ]);
  expect(audit.raw.bridges).toEqual([{ s: 0.4235, halfM: 150, rise: 7 }]);
  expect(audit.built.elevations[0].s).toBeCloseTo(0.20, 6);
  expect(audit.built.elevations[1].s).toBeCloseTo(0.45, 6);
  expect(audit.built.bridges[0].s).toBeCloseTo(0.811, 6);

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
