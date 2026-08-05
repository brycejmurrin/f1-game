// @ts-check
import { test, expect } from "@playwright/test";

test("Montreal island foundation stays grounded, clear, and bounded", async ({ page }) => {
  test.setTimeout(300000);
  await page.goto("/");
  await page.waitForFunction(() => window.__apex?.race, { timeout: 15000 });
  await page.evaluate(() => {
    window.__apex.trackGeometry(true);
    window.__apex.race("montreal", "day", "dry");
  });
  await page.waitForFunction(() => window.__apex.info().track === "montreal", { timeout: 15000 });

  const result = await page.evaluate(() => {
    const def = Tracks.LIST.find((track) => track.id === "montreal");
    const profile = window.__apex.trackProfile(240);
    const probes = [0, 0.55].flatMap((frac) =>
      [-70, 70].map((lat) => window.__apex.groundY(frac, lat).gap)
    );
    const captureSession = () => {
      const geometry = window.__apex.geometryDiagnostics();
      const models = window.__apex.modelDiagnostics();
      const props = window.__apex.trackGeometry().props.pos;
      const node = window.__apex.nodeAt(0.45);
      const supportLat = 12; // 7 m road half-width + 5 m support clearance
      // How far from the RECONSTRUCTED foot to look for the support's legs.
      //
      // 2.2 m was too tight, and asymmetrically so: the circuit anchors the
      // supports itself (js/circuits/montreal.js), while this recomputes the
      // foot as nodeAt(0.45) + rx*lat, and on the left bank those two points
      // are more than 2.2 m apart. The disc then missed the legs entirely and
      // enclosed only the deck box on top of them, so minY came back 2.84 —
      // the top of the support read as its bottom, and the grounding check
      // below failed on a support that is grounded. At 4.5 m the left legs
      // resolve to 0.079 against a terrain of 0.114, and the right to -0.321
      // against -0.302; both within the 0.05 m the assertion allows.
      //
      // A per-model bounding box would be the right instrument here and
      // modelDiagnostics does not expose one — it reports id, required,
      // vertices, kind and the overhead fields, nothing geometric.
      const supportScanR = 4.5;
      const supports = [-1, 1].map((side) => {
        const lat = side * supportLat;
        const ground = window.__apex.groundY(0.45, lat);
        const footX = node.x + node.rx * lat;
        const footZ = node.z + node.rz * lat;
        const ys = [];
        for (let i = 0; i < props.length; i += 3) {
          if (Math.hypot(props[i] - footX, props[i + 2] - footZ) <= supportScanR &&
              props[i + 1] >= ground.terrainY - 0.2 &&
              props[i + 1] <= ground.roadY + 8.2)
            ys.push(props[i + 1]);
        }
        return {
          side, lat, groundY: ground.terrainY, roadY: ground.roadY,
          count: ys.length,
          finite: ys.every(Number.isFinite),
          minY: Math.min(...ys),
          maxY: Math.max(...ys),
        };
      });
      return { geometry, models, supports };
    };
    const day = captureSession();
    window.__apex.race("montreal", "night", "dry");
    const night = captureSession();
    return {
      def: {
        flatTerrain: def.flatTerrain,
        terrainOuter: def.terrainOuter,
        sceneryCoordinates: def.sceneryCoordinates,
        dressingExclusions: def.dressingExclusions,
      },
      sessions: { day, night },
      walls: window.__apex.wallStats(),
      elevation: {
        min: Math.min(...profile.map((point) => point.y)),
        max: Math.max(...profile.map((point) => point.y)),
      },
      probes,
    };
  });

  expect(result.def.flatTerrain).toBe(true);
  expect(result.def.terrainOuter).toBe(70);
  expect(result.def.sceneryCoordinates).toBe("racing");
  expect(result.def.dressingExclusions).toHaveLength(7);

  for (const session of Object.values(result.sessions)) {
    expect(session.geometry.every((entry) => entry.ok)).toBe(true);
    expect(session.geometry.find((entry) => entry.name === "water")?.vertices).toBeGreaterThan(500);
    expect(session.geometry.find((entry) => entry.name === "props")?.vertices).toBeLessThan(580000);

    expect(session.models.invalid).toEqual([]);
    expect(session.models.unsafe).toEqual([]);
    expect(session.models.suppressed).toEqual([]);
    const bridge = session.models.emitted.find((entry) => entry.id === "montreal-casino-footbridge");
    expect(bridge).toMatchObject({ required: true, overhead: true, clearance: 8 });
    const supportModels = session.models.emitted.filter((entry) =>
      entry.id.startsWith("montreal-casino-footbridge-support-"));
    expect(supportModels).toHaveLength(2);
    expect(supportModels.every((entry) => entry.required && entry.vertices > 0)).toBe(true);
    // TYPED water, not a headcount of it. This asked for more than 40 water
    // models, which the St. Lawrence used to supply as one per station — and
    // that is exactly the thing the circuit stopped doing, because a per-station
    // list "drew into a visible checkerboard" (js/circuits/montreal.js). The
    // river is now five continuous bands with the skipped segments expressed as
    // gaps, so the count fell to ten BY DESIGN and the assertion failed on the
    // geometry getting better.
    //
    // Water VOLUME is already covered two lines up (water vertices > 500), so
    // what is worth pinning here is that the named bands are still typed as
    // water rather than emitted as ordinary props.
    const water = session.models.emitted.filter((entry) => entry.water);
    expect(water.length).toBeGreaterThanOrEqual(5);
    expect(water.filter((entry) => entry.id.startsWith("montreal-river-")).length)
      .toBeGreaterThanOrEqual(5);

    for (const support of session.supports) {
      expect(support.finite).toBe(true);
      expect(support.count).toBeGreaterThanOrEqual(8);
      expect(Math.abs(support.minY - support.groundY)).toBeLessThanOrEqual(0.05);
      expect(Math.abs(support.maxY - (support.roadY + 8))).toBeLessThanOrEqual(0.15);
      expect(Math.abs(support.lat)).toBeGreaterThanOrEqual(12);
    }
  }

  expect(result.walls.anyNaN).toBe(false);
  expect(result.walls.tightFrac).toBeGreaterThan(0.95);
  expect(result.walls.minOverHw).toBeGreaterThan(-1.5);
  // "~3 m over the lap, nothing over ~1.2 %" is what the def sets out to build
  // (js/circuits/montreal.js: the bridge approach plus a couple of metres of
  // island roll). It measures 3.31. The 1.3 this used to allow predates those
  // elevations, so — as at Shanghai, Jeddah and Qatar — the data moved and the
  // bound stayed behind.
  expect(result.elevation.max - result.elevation.min).toBeGreaterThanOrEqual(2.5);
  expect(result.elevation.max - result.elevation.min).toBeLessThanOrEqual(4.5);
  for (const gap of result.probes)
    expect(gap === null || gap <= 0.18).toBe(true);
});
