// @ts-check
import { test, expect } from "@playwright/test";
import { BOOT_MS } from "../helpers/fixtures.js";

async function loadHungaroring(page) {
  await page.goto("/");
  // BOOT_MS, not a hand-rolled 15 s: a SwiftShader boot here measures 11-33 s (2026-09-01).
  await page.waitForFunction(() => window.__apex?.race, null, { polling: 100, timeout: BOOT_MS });
  await page.evaluate(() => window.__apex.race("hungaroring", "day", "dry"));
  await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: BOOT_MS });
}

test.describe("Hungaroring track foundation", () => {
  test("migrates terrain, models, dressing, and barriers onto track-owned contracts", async ({ page }) => {
    test.setTimeout(240_000);
    await loadHungaroring(page);
    const result = await page.evaluate(() => {
      const def = Tracks.LIST.find((track) => track.id === "hungaroring");
      const profile = window.__apex.trackProfile(100);
      // lat +-10/+-18 m: outside the carved road, where groundY samples terrain.
      // The old -6..6 ladder sat inside the carve, where gap is null.
      const probes = [0.10, 0.12, 0.14, 0.163, 0.18].flatMap((frac) =>
        [-18, -10, 10, 18].map((lat) => {
          const g = window.__apex.groundY(frac, lat);
          return { frac, lat, gap: g.gap, overRoad: g.overRoad };
        })
      );
      return {
        coordinates: def.sceneryCoordinates,
        exclusions: def.dressingExclusions,
        models: window.__apex.modelDiagnostics(),
        geometry: window.__apex.geometryDiagnostics(),
        profile,
        probes,
        walls: window.__apex.wallStats(),
      };
    });

    expect(result.coordinates).toBe("racing");
    expect(result.exclusions).toEqual(expect.arrayContaining([
      expect.objectContaining({ kinds: expect.arrayContaining(["lighting"]) }),
    ]));
    expect(result.geometry.every((entry) => entry.ok)).toBe(true);
    expect(result.models.invalid).toEqual([]);
    expect(result.models.unsafe).toEqual([]);
    const requiredFailures = [...result.models.suppressed, ...result.models.invalid, ...result.models.unsafe]
      .filter((entry) => entry.required);
    expect(requiredFailures).toEqual([]);
    for (const id of [
      "hungaroring-pit-complex",
      "hungaroring-main-tribune",
      "hungaroring-pit-wall",
      "hungaroring-start-gantry",
    ])
      expect(result.models.emitted.map((entry) => entry.id), `${id} emitted`).toContain(id);

    const low = result.profile.reduce((best, point) => point.y < best.y ? point : best);
    const high = result.profile.reduce((best, point) => point.y > best.y ? point : best);
    // SRTM bake (~30 m basin). Authored cosines put the low just after SF and
    // a +16 m mid-sector crest; the survey low is mid-S1 and the high is near
    // the end of the lap (relative to SF = 0).
    expect(low.frac).toBeGreaterThan(0.22);
    expect(low.frac).toBeLessThan(0.34);
    expect(low.y).toBeLessThan(-22);
    expect(high.frac).toBeGreaterThan(0.85);
    expect(high.frac).toBeLessThan(0.96);
    expect(high.y - low.y).toBeGreaterThan(28);
    expect(high.y - low.y).toBeLessThan(34);
    expect(result.probes.length).toBe(20);
    for (const probe of result.probes) {
      const label = `terrain at ${(probe.frac * 100).toFixed(1)}% lat ${probe.lat}m: ${JSON.stringify(probe)}`;
      expect(Number.isFinite(probe.gap), `${label} sampled no terrain`).toBe(true);
      expect(probe.gap, label).toBeLessThanOrEqual(0.18);
    }

    expect(result.walls.anyNaN).toBe(false);
    // Shared tyre stacks intentionally guard tight-corner exits at 2.2 m from
    // the road edge (1.1 m after car clearance); bespoke armco must not wall the
    // otherwise-open permanent circuit for the full lap.
    expect(result.walls.minOverHw).toBeGreaterThanOrEqual(1);
    expect(result.walls.tightFrac).toBeLessThan(0.6);
    expect(result.walls.maxB).toBeLessThan(20);
  });
});
