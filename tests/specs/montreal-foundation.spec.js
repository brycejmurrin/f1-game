// @ts-check
import { test, expect } from "@playwright/test";

test("Montreal island foundation stays grounded, clear, and bounded", async ({ page }) => {
  test.setTimeout(300000);
  await page.goto("/");
  await page.waitForFunction(() => window.__apex?.race, null, { polling: 100, timeout: 15000 });
  await page.evaluate(() => {
    window.__apex.trackGeometry(true);
    window.__apex.race("montreal", "day", "dry");
  });
  await page.waitForFunction(() => window.__apex.info().track === "montreal", null, { polling: 100, timeout: 15000 });

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
        // MEASURE THE CONTRACT foundation() ACTUALLY OFFERS. It fills from the
        // cap DOWN TO THE LOWEST terrain sample under the leg's own footprint
        // (js/circuits/montreal.js, the casino footbridge) — so the foot sits
        // at the minimum over that patch, which is by definition <= a single
        // centre-point reading. Comparing it against one point measures local
        // relief, not grounding, and Île Notre-Dame is not as level as
        // "flatTerrain" suggests: terrain at lat -12 is 0.114 and at +12 is
        // -0.302, 41.6 cm apart. When the curvature-sign fix put each pier on
        // the other side, the left one landed on the rougher patch and a 5 cm
        // point-tolerance failed at 6.3 cm — with the pier correctly founded.
        // Sample the same footprint the legs are built over instead: +-1.2 m
        // along (the two legs) and +-0.35 m across.
        const dFrac = 1.2 / window.__apex.info().total;
        let lowest = Infinity;
        for (const df of [-dFrac, 0, dFrac])
          for (const dl of [-0.35, 0, 0.35])
            lowest = Math.min(lowest, window.__apex.groundY(0.45 + df, lat + dl).terrainY);
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
          side, lat, groundY: ground.terrainY, footprintLowY: lowest, roadY: ground.roadY,
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
  // a43691c8 unified lamps/floodlights into the "lighting" fixture kind, which
  // collapsed montreal's seven pre-unification exclusion entries into three.
  // Assert the semantic content, not the count: the island-wide foliage span
  // plus the two lighting clearance windows (measured on the def: 0.19-0.23
  // and 0.69-0.73).
  expect(result.def.dressingExclusions).toHaveLength(3);
  expect(result.def.dressingExclusions).toContainEqual({ kind: "foliage", s0: 0, s1: 1 });
  const lightingSpans = result.def.dressingExclusions
    .filter((entry) => entry.kinds?.includes("lighting"))
    .map((entry) => [entry.s0, entry.s1]);
  expect(lightingSpans).toEqual([[0.19, 0.23], [0.69, 0.73]]);

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
      // NAME THE SIDE AND SHOW THE NUMBERS. These ran for a long time as bare
      // comparisons, and when one finally failed it said "expected <= 0.05,
      // received 0.0633" with no way to tell WHICH pier, at what height, above
      // what ground — so the first move was a probe that reproduced what the
      // test already knew. A footbridge has two piers and they do not stand on
      // the same patch of grass; the side is half the diagnosis.
      const where = `${support.side < 0 ? "left" : "right"} pier ` +
        `(lat ${support.lat}, minY ${support.minY?.toFixed?.(4)}, ` +
        `footprintLow ${support.footprintLowY?.toFixed?.(4)}, ` +
        `centreTerrain ${support.groundY?.toFixed?.(4)}, roadY ${support.roadY?.toFixed?.(4)})`;
      expect(support.finite, `${where} finite`).toBe(true);
      expect(support.count, `${where} vertex count`).toBeGreaterThanOrEqual(8);
      // Against the footprint minimum, not the centre point — see the sampling
      // note above. Still a real check: a floating pier reads POSITIVE here and
      // a pier buried below its own footprint reads negative, and both fail.
      expect(support.minY - support.footprintLowY, `${where} foot meets the ground`)
        .toBeGreaterThanOrEqual(-0.05);
      expect(support.minY - support.footprintLowY, `${where} foot is not floating`)
        .toBeLessThanOrEqual(0.05);
      expect(Math.abs(support.maxY - (support.roadY + 8)), `${where} deck height`)
        .toBeLessThanOrEqual(0.15);
      expect(Math.abs(support.lat), `${where} clears the road`).toBeGreaterThanOrEqual(12);
    }
  }

  expect(result.walls.anyNaN).toBe(false);
  expect(result.walls.tightFrac).toBeGreaterThan(0.95);
  expect(result.walls.minOverHw).toBeGreaterThan(-1.5);
  // js/circuits/montreal.js's own elevations array is three non-overlapping
  // cosine bumps (+1.25, +2.2, -1.0) — its comment already says "~3 m over the
  // lap". Measured 3.309 (peak +2.2 to trough -1.0, plus a little spline
  // overshoot), so 1.3 was stale from before that array was tuned. Bound at
  // the measured value + headroom, not silently renarrowed to fit.
  expect(result.elevation.max - result.elevation.min).toBeLessThanOrEqual(3.6);
  for (const gap of result.probes)
    expect(gap === null || gap <= 0.18).toBe(true);
});
