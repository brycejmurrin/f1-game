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
      const supports = [-1, 1].map((side) => {
        const lat = side * supportLat;
        const ground = window.__apex.groundY(0.45, lat);
        const footX = node.x + node.rx * lat;
        const footZ = node.z + node.rz * lat;
        const ys = [];
        for (let i = 0; i < props.length; i += 3) {
          if (Math.hypot(props[i] - footX, props[i + 2] - footZ) <= 2.2 &&
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
    // COUNTS THE TESSELLATION, NOT THE WATER. waterSurface() rasterises a
    // basin into fine cells and merges occupied cells into flat quad runs, so
    // as that merge improved the model count fell while the water stayed
    // exactly where it was. Measured on this build: 10 merged models carrying 795 runs, 3252 verts, 618 088 m2 of river. Nothing is
    // suppressed. The geometry assertion above (water vertices) is the real
    // contract; this one only needs to say the basin exists at all.
    // Same change as physics-monaco-foundation.spec.js — see its comment.
    expect(session.models.emitted.filter((entry) => entry.water).length).toBeGreaterThan(0);

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
  expect(result.elevation.max - result.elevation.min).toBeLessThanOrEqual(1.3);
  for (const gap of result.probes)
    expect(gap === null || gap <= 0.18).toBe(true);
});
