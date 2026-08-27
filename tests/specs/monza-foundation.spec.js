// @ts-check
import { test, expect } from "@playwright/test";

test.describe("Monza track-owned foundation migration", () => {
  test("keeps terrain, landmarks, water, barriers, and overhead intent valid", async ({ page }) => {
    test.setTimeout(240_000);
    await page.goto("/");
    await page.waitForFunction(() => window.__apex?.race, null, { polling: 100, timeout: 15_000 });
    await page.evaluate(() => window.__apex.race("monza", "day", "dry"));
    await page.waitForFunction(() => window.__apex.info().track === "monza", null, { polling: 100, timeout: 15_000 });
    const result = await page.evaluate(() => {
      const def = window.TrackDefs.find((entry) => entry.id === "monza");
      const profile = window.__apex.trackProfile(240);
      // Centreline-only rebuild (spline + banking, no meshes) so the probes can
      // ask where the ROAD SURFACE is, not just where its centreline is. Same
      // handle tests/specs/terrain-over-road.spec.js uses; note it needs the built
      // Tracks.LIST entry (which carries `points`), not the authored TrackDefs
      // one. Verified bit-identical to the live track's px/py/hw and banking().
      const bankTrack = Tracks.buildCenterline(
        Tracks.LIST.find((entry) => entry.id === "monza"));
      const out = {
        coordinates: def.sceneryCoordinates,
        terrainOuter: def.terrainOuter,
        // 7a173519 moved the start line (startFrac 0.0125 -> 0.0), rotating
        // racing fractions by the arc shift (+0.0867); the dip and the crest
        // did not move physically. Re-pinned onto their measured new locations
        // (headless VM, extremum scan): the Roggia dip bottoms at frac 0.3869
        // (y -1.469) and the Lesmo crest peaks at 0.5646 (y +4.492).
        roggiaY: window.__apex.nodeAt(0.3875).y,
        lesmoY: window.__apex.nodeAt(0.565).y,
        minY: Math.min(...profile.map((entry) => entry.y)),
        maxY: Math.max(...profile.map((entry) => entry.y)),
        geometry: window.__apex.geometryDiagnostics(),
        models: window.__apex.modelDiagnostics(),
        walls: window.__apex.wallStats(),
        // Terrain-over-road probe, measured against the ROAD SURFACE — not
        // against the centreline. groundY().gap is `terrainY - centrelineY`,
        // and on a banked corner that is not where the tarmac is: frac 0.30 is
        // inside the Lesmo 1 bankZone (6 deg across a 16 m road), so the raised
        // edge stands 0.66 m proud of the centreline plane. Terrain correctly
        // tucked 0.366 m UNDER that edge therefore read gap = +0.294, "terrain
        // above road", and failed — a reference error, not a geometry defect.
        // All twelve probes sit at |lat| = 11 m, 3 m OUTSIDE the 8 m road edge,
        // where terrain rising with the banking is exactly what should happen.
        // (The identical trap was fixed once already inside eyeAt(); its header
        // has the story. groundY() itself still reports the raw centreline gap.)
        //
        // Tracks.banking(bankTrack, s, lat).dy is the road's own cross-slope at
        // that point — the same term buildRoad applies via bankOffsetAt() and
        // the in-race cameras apply to sit the car on the tarmac. Measured
        // (2026-08, headless VM build) `overRoad` lands in [-0.369, -0.343] for
        // all twelve: the verge sits a uniform ~0.36 m below the road edge
        // everywhere on the lap, banked corners included. Only the four probes
        // inside a bankZone move at all; the other eight still equal `gap`.
        edgeProbes: [0.04, 0.30, 0.48, 0.73, 0.78, 0.90].flatMap((frac) =>
          [-11, 11].map((lat) => {
            const ground = window.__apex.groundY(frac, lat);
            const bank = Tracks.banking(bankTrack, frac * bankTrack.total, lat);
            const roadSurfaceY = ground.roadY + (bank ? bank.dy : 0);
            return {
              frac, lat, ...ground,
              roadSurfaceY: +roadSurfaceY.toFixed(3),
              overRoad: ground.terrainY == null ? null : +(ground.terrainY - roadSurfaceY).toFixed(3),
            };
          })
        ),
      };
      return out;
    });

    expect(result.coordinates).toBe("racing");
    expect(result.terrainOuter).toBe(120);
    expect(result.roggiaY).toBeLessThan(-1);
    expect(result.lesmoY).toBeGreaterThan(4);
    expect(result.maxY - result.minY).toBeLessThan(7);
    expect(result.geometry.every((entry) => entry.ok)).toBe(true);
    expect(result.geometry.find((entry) => entry.name === "water")?.vertices).toBeGreaterThan(0);
    expect(result.models.invalid).toEqual([]);
    expect(result.models.unsafe).toEqual([]);

    const hard = [...result.models.invalid, ...result.models.suppressed, ...result.models.unsafe]
      .filter((entry) => entry.required);
    expect(hard).toEqual([]);

    const emitted = new Map(result.models.emitted.map((entry) => [entry.id, entry]));
    for (const id of [
      "monza-pit-canopy",
      "monza-villa-lake",
      "monza-west-park-lake",
      "monza-sopraelevata-flyover",
      "monza-sopraelevata-pier-left",
      "monza-sopraelevata-pier-right",
      "monza-banking-lower",
      "monza-banking-middle",
      "monza-banking-upper",
    ]) {
      expect(emitted.has(id), `${id} should be emitted`).toBe(true);
    }
    expect(emitted.get("monza-sopraelevata-flyover")?.clearance).toBeGreaterThanOrEqual(4.8);

    expect(result.walls.anyNaN).toBe(false);
    expect(result.walls.tightFrac).toBeGreaterThan(0.6);
    for (const probe of result.edgeProbes) {
      expect(probe.terrainY, `terrain missing at ${probe.frac}:${probe.lat}`).not.toBeNull();
      expect(probe.overRoad, `terrain above road at ${probe.frac}:${probe.lat}`).toBeLessThanOrEqual(0.18);
    }
  });
});
