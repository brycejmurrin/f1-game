// @ts-check
import { test, expect } from "@playwright/test";

test.describe("Monza track-owned foundation migration", () => {
  test("keeps terrain, landmarks, water, barriers, and overhead intent valid", async ({ page }) => {
    test.setTimeout(240_000);
    await page.goto("/");
    await page.waitForFunction(() => window.__apex?.race, { timeout: 15_000 });
    await page.evaluate(() => window.__apex.race("monza", "day", "dry"));
    await page.waitForFunction(() => window.__apex.info().track === "monza", { timeout: 15_000 });
    const result = await page.evaluate(() => {
      const def = window.TrackDefs.find((entry) => entry.id === "monza");
      const profile = window.__apex.trackProfile(240);
      // groundY()'s `gap` is measured against the CENTRELINE plane, which on a
      // banked corner is not the road. eyeAt(frac, lat, 0) returns the same
      // point ridden up the camber (it adds Tracks.banking's dy, clamped at the
      // road edge — the term its own comment says exists because "at Zandvoort
      // the outer edge stands 2.4 m proud of it"), so its eye height is the
      // road surface the terrain actually has to stay under.
      const edgeProbes = [0.04, 0.30, 0.48, 0.73, 0.78, 0.90].flatMap((frac) =>
        [-11, 11].map((lat) => ({
          frac, lat, ...window.__apex.groundY(frac, lat),
          bankedRoadY: window.__apex.eyeAt(frac, lat, 0).eye[1],
        }))
      );
      window.__apex.camera("chase");   // eyeAt parked the debug free-cam; put the real one back
      return {
        edgeProbes,
        coordinates: def.sceneryCoordinates,
        terrainOuter: def.terrainOuter,
        roggiaY: window.__apex.nodeAt(0.30).y,
        lesmoY: window.__apex.nodeAt(0.48).y,
        minY: Math.min(...profile.map((entry) => entry.y)),
        maxY: Math.max(...profile.map((entry) => entry.y)),
        geometry: window.__apex.geometryDiagnostics(),
        models: window.__apex.modelDiagnostics(),
        walls: window.__apex.wallStats(),
      };
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
    // Terrain must stay under the road — but under the BANKED road, not under
    // the centreline plane. `gap` (terrain − centreline) reads +0.294 at the
    // Roggia probe 0.30/-11 and that is camber, not an intrusion: Monza's
    // bankZones put a 6°, 140 m-wide zone at frac 0.2964 (js/circuits/monza.js:
    // "The Parabolica (Curva Alboreto) and both Lesmos are the properly
    // cambered corners"), and js/track/mesh.js states the consequence outright —
    // "buildRoad and buildTerrain both read this so the banked road edge and
    // the terrain that meets it rise together". The probes sit at ±11 m, i.e.
    // 4 m PAST the 7 m tarmac edge of that chicane, so they land on ground that
    // has ridden the outer edge up with it.
    //
    // A 40-circuit census (240 stations each, day) confirms ±11 is simply not a
    // flat-cross-section lateral: TWENTY circuits exceed 0.18 there — Zandvoort
    // 1.677, Madrid 1.004, Indianapolis 0.551, Istanbul 0.500, Silverstone
    // 0.473, Monza 0.466, Mexico 0.440, Shanghai 0.421 … fleet median peak
    // 0.196 — and every one of the worst offenders is a hand-authored banked
    // corner. At ±6 m (on the tarmac, where the plane is flat) ZERO of the 40
    // exceed 0.18. So the ceiling was right and the reference was wrong.
    //
    // Measured against the banked surface, all twelve Monza probes come back
    // between −0.37 and −0.34 m: a uniform ~0.35 m of terrain clearance under
    // the road edge the whole way round. 0.18 stays a hard ratchet.
    for (const probe of result.edgeProbes) {
      expect(probe.terrainY, `terrain missing at ${probe.frac}:${probe.lat}`).not.toBeNull();
      expect(probe.terrainY - probe.bankedRoadY,
        `terrain above road at ${probe.frac}:${probe.lat}`).toBeLessThanOrEqual(0.18);
    }
  });
});
