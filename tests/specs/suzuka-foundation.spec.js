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
    // Same physical patches as before 7a173519 (which rotated racing fractions
    // by the arc shift, +0.6198 here): old probe fracs 0.45/0.811(-ish)/0.20/
    // 0.37 carried onto their new locations.
    const ground = [0.070, 0.438, 0.820, 0.990].flatMap((fraction) =>
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
      // 7a173519 moved the start line (startFrac 0.6125 -> 0.9942), rotating
      // racing fractions by the arc shift (+0.6198). The def anchors asserted
      // below (built elevations 0.20/0.45, bridge 0.8173) are UNCHANGED —
      // resolve() still evaluates them at the authoring origin — but the
      // physical bumps they build now sit at anchor + shift. Measured in the
      // new frame (headless VM): esses hump peaks at 0.8201 (relief +11.05),
      // Degner valley bottoms at 0.0698 (relief -5.02), crossover deck crests
      // at 0.4376 (relief +13.44). Same +-window widths as before, recentred.
      //
      // CONFLATION WARNING: the old crossover probe frac (0.811) sits in the
      // new frame almost exactly where the ESSES hump now lands (~0.82), so a
      // probe left there keeps returning a healthy-looking positive relief
      // (measured +7.4) that has nothing to do with the crossover deck — a
      // green assertion measuring the wrong hill. The deck itself is at
      // ~0.4376 now (bridge anchor 0.8173 + 0.6198 wrapped).
      relief: {
        esses: at(0.820) - (at(0.740) + at(0.900)) / 2,
        degner: at(0.070) - (at(0.010) + at(0.130)) / 2,
        crossover: at(0.438) - (at(0.402) + at(0.474)) / 2,
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
  // The figure-8 crossover was RETUNED after this spec pinned it; the old
  // { s: 0.4235, halfM: 150, rise: 7 } predates that and no longer describes a
  // bridge the rest of the circuit can live under. Measured on the current build:
  // source s 0.4298 maps through startFrac 0.6125 to racing s 0.8173
  // (raw + (1 − startFrac)), and the upper road there sits at y = 13.51 m while
  // the LOWER road it crosses (racing s 0.226) sits at y = 5.40 m — 8.1 m of
  // road-to-road daylight, matching the derivation in js/circuits/suzuka.js.
  // suzuka-crossover-deck is built from that budget (5.0 m clearance + 1.7 m
  // thickness = a 6.7 m top above the lower road), so the old rise 7 would leave
  // 7 − 5.4 = 1.6 m and put the deck straight through the upper ribbon. The bridge
  // moved 0.4235 → 0.4298 onto the MEASURED self-crossing and widened 150 → 160
  // with it. The elevations above are untouched, which is why only these two
  // lines move.
  expect(audit.raw.bridges).toEqual([{ s: 0.4298, halfM: 160, rise: 13.5 }]);
  expect(audit.built.elevations[0].s).toBeCloseTo(0.20, 6);
  expect(audit.built.elevations[1].s).toBeCloseTo(0.45, 6);
  expect(audit.built.bridges[0].s).toBeCloseTo(0.8173, 4);

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
