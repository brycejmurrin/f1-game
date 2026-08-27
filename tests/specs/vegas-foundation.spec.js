// @ts-check
import { test, expect } from "@playwright/test";

const LANDSCAPE = { width: 844, height: 390 };

async function loadVegas(page, time = "night") {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex?.race, null, { polling: 100, timeout: 15000 });
  await page.evaluate((tod) => window.__apex.race("vegas", tod, "dry"), time);
  await page.waitForFunction(() => window.__apex.info().track === "vegas", null, { polling: 100, timeout: 15000 });
}

test.describe("Las Vegas track foundation migration", () => {
  test.use({ viewport: LANDSCAPE });
  test.setTimeout(360_000);

  test("uses explicit racing coordinates and a shallow Sphere-sector dip", async ({ page }) => {
    await loadVegas(page);
    const result = await page.evaluate(() => {
      const def = Tracks.LIST.find((track) => track.id === "vegas");
      // 7a173519 moved the start line (startFrac 0.8575 -> 0.9899), rotating
      // racing fractions by the arc shift (+0.8433); the Sphere-sector dip did
      // not move physically. Measured in the new frame (headless VM, extremum
      // scan): the dip bottoms at frac 0.1927, y -1.274, with the shoulders
      // near 0 (y(0.15) -0.016, y(0.24) -0.007). Note vegas.js's own elevation
      // comment says "racing s≈0.218" — that figure is INDEX-fraction
      // arithmetic (0.2075 + (1 - 0.9899)); buildCenterline places the bump by
      // the ARC-length shift (def s 0.35 + 0.8433 -> 0.1933), which is where
      // the dip actually measures. Trust the measurement, not the comment.
      const samples = [0.15, 0.193, 0.24, 0.65].map((frac) => {
        const node = window.__apex.nodeAt(frac);
        return { frac, y: node.y };
      });
      return {
        coordinates: def.sceneryCoordinates,
        terrainOuter: def.terrainOuter,
        barrierGap: def.barrierGap,
        elevationFrac: def.elevations[0].s,
        exclusions: def.dressingExclusions,
        samples,
      };
    });

    expect(result.coordinates).toBe("racing");
    expect(result.terrainOuter).toBe(26);
    expect(result.barrierGap).toBe(1);
    expect(result.elevationFrac).toBeCloseTo(0.35, 3);
    expect(result.exclusions).toEqual(expect.arrayContaining([
      expect.objectContaining({ kinds: ["city", "foliage"], s0: 0.36, s1: 0.47 }),
    ]));
    const byFrac = Object.fromEntries(result.samples.map((sample) => [sample.frac, sample.y]));
    expect(byFrac[0.193]).toBeLessThan(byFrac[0.15] - 0.4);
    expect(byFrac[0.193]).toBeLessThan(byFrac[0.24] - 0.4);
    expect(Math.abs(byFrac[0.65])).toBeLessThan(0.15);
  });

  test("emits required landmarks, typed water, and safe overhead spans", async ({ page }) => {
    for (const time of ["day", "night"]) {
      await loadVegas(page, time);
      const result = await page.evaluate(() => ({
        geometry: window.__apex.geometryDiagnostics(),
        models: window.__apex.modelDiagnostics(),
      }));

      expect(result.geometry.every((entry) => entry.ok), `${time} geometry`).toBe(true);
      const hard = [
        ...result.models.suppressed,
        ...result.models.invalid,
        ...result.models.unsafe,
      ].filter((entry) => entry.required);
      expect(hard, `${time} required models`).toEqual([]);

      const emitted = new Map(result.models.emitted.map((entry) => [entry.id, entry]));
      // The Bellagio lake is TWO basins now, not one. js/circuits/vegas.js widened
      // the frontage to the real ~300 m and replaced the single 110x44 m patch with
      // overlapping east/west basins, because one box that long would risk clipping
      // the T13 apex the road carries through this stretch. Measured on the current
      // build at BOTH times of day: emitted = vegas-bellagio-lake-east (required,
      // water) + vegas-bellagio-lake-west (water), suppressed/invalid/unsafe all
      // empty. No model emits the old id "vegas-bellagio-lake" any more — this was
      // a rename, not a loss, which the `required` sweep above independently
      // confirms (the east basin is required, so a suppressed lake would fail there
      // first). Both ids are pinned so a future re-merge into one basin is caught.
      for (const id of [
        "vegas-sphere",
        "vegas-high-roller",
        "vegas-bellagio-lake-east",
        "vegas-bellagio-lake-west",
        "vegas-strip-gateway",
        "vegas-finish-halo",
      ]) {
        expect(emitted.has(id), `${time} ${id}`).toBe(true);
      }
      for (const id of ["vegas-bellagio-lake-east", "vegas-bellagio-lake-west"])
        expect(emitted.get(id).water, `${time} ${id} water`).toBe(true);
      for (const id of ["vegas-strip-gateway", "vegas-finish-halo"]) {
        expect(emitted.get(id).overhead).toBe(true);
        expect(emitted.get(id).clearance).toBeGreaterThanOrEqual(4.8);
      }
    }
  });

  test("keeps full-lap street walls tight and retains night lighting", async ({ page }) => {
    await loadVegas(page, "night");
    await page.waitForTimeout(300);
    const result = await page.evaluate(() => ({
      walls: window.__apex.wallStats(),
      lights: window.__apex.lightState(),
      edgeGaps: [-8, 8].map((lat) => window.__apex.groundY(0.35, lat).gap),
    }));

    expect(result.walls.anyNaN).toBe(false);
    expect(result.walls.street).toBe(true);
    expect(result.walls.tightFrac).toBeGreaterThan(0.98);
    expect(result.walls.minOverHw).toBeGreaterThan(-1.5);
    expect(result.walls.minOverHw).toBeLessThan(3);
    expect(result.lights.numLights).toBeGreaterThan(0);
    for (const gap of result.edgeGaps)
      expect(gap === null || gap <= 0.18).toBe(true);
  });
});
