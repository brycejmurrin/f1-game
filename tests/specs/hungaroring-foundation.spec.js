// @ts-check
import { test, expect } from "@playwright/test";

async function loadHungaroring(page) {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex?.race, null, { polling: 100, timeout: 15_000 });
  await page.evaluate(() => window.__apex.race("hungaroring", "day", "dry"));
  await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: 15_000 });
}

test.describe("Hungaroring track foundation", () => {
  test("migrates terrain, models, dressing, and barriers onto track-owned contracts", async ({ page }) => {
    test.setTimeout(240_000);
    await loadHungaroring(page);
    const result = await page.evaluate(() => {
      const def = Tracks.LIST.find((track) => track.id === "hungaroring");
      const profile = window.__apex.trackProfile(100);
      const probes = [0.10, 0.12, 0.14, 0.163, 0.18].flatMap((frac) =>
        [-6, -3, 0, 3, 6].map((lat) => ({ frac, lat, gap: window.__apex.groundY(frac, lat).gap }))
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
      "hungaroring-lake",
      "hungaroring-start-gantry",
    ])
      expect(result.models.emitted.map((entry) => entry.id), `${id} emitted`).toContain(id);

    const low = result.profile.reduce((best, point) => point.y < best.y ? point : best);
    const high = result.profile.reduce((best, point) => point.y > best.y ? point : best);
    // 7a173519 moved the start line (startFrac 0.9825 -> 0.0), rotating racing
    // fractions by the arc shift (+0.9029); the valley and the ridge did not
    // move physically. Measured in the new frame (headless VM, this profile's
    // own 1/100 grid): low at frac 0.04 / -21.9 m, high at 0.44 / +16.2 m.
    expect(low.frac).toBeGreaterThan(0.01);
    expect(low.frac).toBeLessThan(0.09);
    expect(low.y).toBeLessThan(-20);
    expect(high.frac).toBeGreaterThan(0.40);
    expect(high.frac).toBeLessThan(0.49);
    expect(high.y).toBeGreaterThan(14);
    for (const probe of result.probes)
      expect(probe.gap === null || probe.gap <= 0.18,
        `terrain at ${(probe.frac * 100).toFixed(1)}% lat ${probe.lat}m: ${probe.gap}`).toBe(true);

    expect(result.walls.anyNaN).toBe(false);
    // Shared tyre stacks intentionally guard tight-corner exits at 2.2 m from
    // the road edge (1.1 m after car clearance); bespoke armco must not wall the
    // otherwise-open permanent circuit for the full lap.
    expect(result.walls.minOverHw).toBeGreaterThanOrEqual(1);
    expect(result.walls.tightFrac).toBeLessThan(0.6);
    expect(result.walls.maxB).toBeLessThan(20);
  });
});
