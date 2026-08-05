// @ts-check
import { test, expect } from "@playwright/test";

const LANDSCAPE = { width: 844, height: 390 };

async function loadVegas(page, time = "night") {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex?.race, { timeout: 15000 });
  await page.evaluate((tod) => window.__apex.race("vegas", tod, "dry"), time);
  await page.waitForFunction(() => window.__apex.info().track === "vegas", { timeout: 15000 });
}

test.describe("Las Vegas track foundation migration", () => {
  test.use({ viewport: LANDSCAPE });
  test.setTimeout(360_000);

  test("uses explicit racing coordinates and a shallow Sphere-sector dip", async ({ page }) => {
    await loadVegas(page);
    const result = await page.evaluate(() => {
      const def = Tracks.LIST.find((track) => track.id === "vegas");
      const samples = [0.30, 0.35, 0.40, 0.65].map((frac) => {
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
    expect(byFrac[0.35]).toBeLessThan(byFrac[0.30] - 0.4);
    expect(byFrac[0.35]).toBeLessThan(byFrac[0.40] - 0.4);
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
      for (const id of [
        "vegas-sphere",
        "vegas-high-roller",
        // The reservoir used to be ONE `vegas-bellagio-lake` box and this spec
        // still asked for that id (measured: it is never emitted, the two ids
        // below are). js/circuits/vegas.js widened the frontage to the real
        // ~300 m and split the water deliberately: "Two overlapping basins
        // follow the lakeshore across the widened frontage instead of one 44 m
        // patch — a long single box this size would risk clipping the T13 apex
        // the road carries through this stretch." Same class of change as
        // Montreal's St. Lawrence bands and the Interlagos Guarapiranga merge,
        // so follow the same rule: assert the basins EXIST and are TYPED water,
        // never a count and never one legacy id — the shoreline is free to be
        // re-cut again as long as it stays water.
        "vegas-bellagio-lake-east",
        "vegas-bellagio-lake-west",
        "vegas-strip-gateway",
        "vegas-finish-halo",
      ]) {
        expect(emitted.has(id), `${time} ${id}`).toBe(true);
      }
      for (const id of ["vegas-bellagio-lake-east", "vegas-bellagio-lake-west"])
        expect(emitted.get(id).water, `${time} ${id} typed water`).toBe(true);
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
