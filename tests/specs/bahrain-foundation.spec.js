// @ts-check
import { test, expect } from "@playwright/test";

test("Bahrain props stay clear of the racing surface", async ({ page }) => {
  test.setTimeout(300000);
  await page.goto("/");
  await page.waitForFunction(() => window.__apex?.race, null, { polling: 100, timeout: 15000 });
  await page.evaluate(() => window.__apex.trackGeometry(true));
  await page.evaluate(() => window.__apex.race("bahrain", "day", "dry"));
  await page.waitForFunction(() => window.__apex.info().track === "bahrain", null, { polling: 100, timeout: 15000 });
  await page.waitForTimeout(1200);

  const result = await page.evaluate(() => {
    const caps = window.__apex.trackGeometry();
    if (!caps?.road) return { err: "no road mesh", max: 0, top: [] };

    const M = 1200;
    const px = new Float64Array(M), pz = new Float64Array(M), py = new Float64Array(M);
    const rx = new Float64Array(M), rz = new Float64Array(M), hw = new Float64Array(M);
    const profile = window.__apex.trackProfile(M);
    for (let i = 0; i < M; i++) {
      const node = window.__apex.nodeAt(i / M);
      px[i] = node.x; pz[i] = node.z; py[i] = node.y;
      rx[i] = node.rx; rz[i] = node.rz;
      hw[i] = profile[Math.floor(i / M * profile.length)].hw;
    }

    const gridSize = 10;
    const sampleGrid = new Map();
    for (let i = 0; i < M; i++) {
      for (const lateral of [-0.75, -0.4, 0, 0.4, 0.75]) {
        const sample = {
          x: px[i] + rx[i] * lateral * hw[i],
          z: pz[i] + rz[i] * lateral * hw[i],
          y: py[i], frac: i / M,
        };
        const key = `${Math.floor(sample.x / gridSize)},${Math.floor(sample.z / gridSize)}`;
        if (!sampleGrid.has(key)) sampleGrid.set(key, []);
        sampleGrid.get(key).push(sample);
      }
    }

    const barycentric = (x, z, ax, az, bx, bz, cx, cz) => {
      const v0x = cx - ax, v0z = cz - az, v1x = bx - ax, v1z = bz - az;
      const v2x = x - ax, v2z = z - az;
      const d00 = v0x * v0x + v0z * v0z, d01 = v0x * v1x + v0z * v1z;
      const d11 = v1x * v1x + v1z * v1z, d20 = v2x * v0x + v2z * v0z;
      const d21 = v2x * v1x + v2z * v1z, denominator = d00 * d11 - d01 * d01;
      if (Math.abs(denominator) < 1e-9) return null;
      const u = (d11 * d20 - d01 * d21) / denominator;
      const v = (d00 * d21 - d01 * d20) / denominator;
      return u >= -0.02 && v >= -0.02 && u + v <= 1.02 ? { u, v } : null;
    };

    const byFraction = {};
    let max = 0, worst = null;
    for (const name of ["props", "glass"]) {
      const mesh = caps[name];
      if (!mesh?.pos || !mesh?.idx) continue;
      const { pos, idx } = mesh;
      for (let triangle = 0; triangle < idx.length; triangle += 3) {
        const a = idx[triangle] * 3, b = idx[triangle + 1] * 3, c = idx[triangle + 2] * 3;
        const ax = pos[a], ay = pos[a + 1], az = pos[a + 2];
        const bx = pos[b], by = pos[b + 1], bz = pos[b + 2];
        const cx = pos[c], cy = pos[c + 1], cz = pos[c + 2];
        if (Math.min(ay, by, cy) > 35) continue;
        const minX = Math.min(ax, bx, cx), maxX = Math.max(ax, bx, cx);
        const minZ = Math.min(az, bz, cz), maxZ = Math.max(az, bz, cz);
        const cellMinX = Math.floor((minX - 0.3) / gridSize);
        const cellMaxX = Math.floor((maxX + 0.3) / gridSize);
        const cellMinZ = Math.floor((minZ - 0.3) / gridSize);
        const cellMaxZ = Math.floor((maxZ + 0.3) / gridSize);
        for (let gx = cellMinX; gx <= cellMaxX; gx++) {
          for (let gz = cellMinZ; gz <= cellMaxZ; gz++) {
            for (const sample of sampleGrid.get(`${gx},${gz}`) || []) {
              if (sample.x < minX - 0.3 || sample.x > maxX + 0.3 ||
                  sample.z < minZ - 0.3 || sample.z > maxZ + 0.3) continue;
              const bc = barycentric(sample.x, sample.z, ax, az, bx, bz, cx, cz);
              if (!bc) continue;
              const surfaceY = ay + bc.u * (cy - ay) + bc.v * (by - ay);
              const overlap = surfaceY - sample.y;
              if (overlap > 0.2 && overlap < 5) {
                const fraction = Math.round(sample.frac * 200) / 2;
                byFraction[fraction] = Math.max(byFraction[fraction] || 0, overlap);
                if (overlap > max) {
                  max = overlap;
                  worst = {
                    name, fraction, overlap: +overlap.toFixed(2),
                    center: [
                      +((ax + bx + cx) / 3).toFixed(2),
                      +((ay + by + cy) / 3).toFixed(2),
                      +((az + bz + cz) / 3).toFixed(2),
                    ],
                    sample: [
                      +sample.x.toFixed(2), +sample.y.toFixed(2), +sample.z.toFixed(2),
                    ],
                    vertices: [
                      [+ax.toFixed(2), +ay.toFixed(2), +az.toFixed(2)],
                      [+bx.toFixed(2), +by.toFixed(2), +bz.toFixed(2)],
                      [+cx.toFixed(2), +cy.toFixed(2), +cz.toFixed(2)],
                    ],
                  };
                }
              }
            }
          }
        }
      }
    }

    const top = Object.entries(byFraction)
      .map(([fraction, overlap]) => ({ fraction: +fraction, overlap: +overlap.toFixed(2) }))
      .sort((a, b) => b.overlap - a.overlap)
      .slice(0, 8);
    return { err: null, max: +max.toFixed(2), top, worst };
  });

  expect(result.err).toBeNull();
  expect(result.max, JSON.stringify({ top: result.top, worst: result.worst })).toBeLessThanOrEqual(0.2);

  const audit = await page.evaluate(() => {
    const profile = window.__apex.trackProfile(400);
    const elevations = profile.map((point) => point.y);
    const models = window.__apex.modelDiagnostics();
    const definition = Tracks.LIST.find((track) => track.id === "bahrain");
    return {
      sceneryCoordinates: definition.sceneryCoordinates,
      exclusions: definition.dressingExclusions,
      relief: Math.max(...elevations) - Math.min(...elevations),
      t8: profile[Math.round(0.42 * profile.length)].y,
      t9: profile[Math.round(0.50 * profile.length)].y,
      walls: window.__apex.wallStats(),
      ground: [0.42, 0.50, 0.78, 0.82, 0.86].flatMap((frac) =>
        [-12, -8, 8, 12].map((lateral) => window.__apex.groundY(frac, lateral).gap)
      ),
      geometry: window.__apex.geometryDiagnostics(),
      models,
    };
  });

  expect(audit.sceneryCoordinates).toBe("racing");
  expect(audit.exclusions).toContainEqual({
    kinds: ["foliage", "lighting"], s0: 0, s1: 1,
  });
  expect(audit.relief).toBeGreaterThanOrEqual(4.5);
  expect(audit.relief).toBeLessThanOrEqual(5.5);
  expect(audit.t8).toBeLessThanOrEqual(-2.5);
  expect(audit.t9).toBeGreaterThanOrEqual(1.5);
  expect(audit.walls.anyNaN).toBe(false);
  expect(audit.walls.minOverHw).toBeGreaterThanOrEqual(0.8);
  expect(audit.walls.maxB).toBeLessThanOrEqual(20);
  expect(audit.ground.every((gap) => gap == null || gap <= 0.18)).toBe(true);
  expect(audit.geometry.every((entry) => entry.ok)).toBe(true);
  expect(audit.models.invalid).toEqual([]);
  expect(audit.models.suppressed).toEqual([]);
  expect(audit.models.unsafe).toEqual([]);
  // EXACT, not a subset — the point is that a required model silently vanishing
  // is caught, and a subset check cannot see that. The cost is that ADDING
  // required scenery lands here too; that is intended. Update the list and
  // satisfy yourself the new model is meant to be required, rather than
  // loosening the assertion.
  expect(audit.models.emitted.filter((entry) => entry.required).map((entry) => entry.id).sort())
    .toEqual([
      "bahrain-back-straight-gantry",
      "bahrain-start-gantry",
      "kit:bahrain:back-straight-recovery",
      "kit:bahrain:back-straight-service",
      "kit:bahrain:hospitality",
      "kit:bahrain:pit-operations",
      "kit:bahrain:service-compound",
    ]);

  const night = await page.evaluate(async () => {
    await window.__apex.race("bahrain", "night", "dry");
    return {
      geometry: window.__apex.geometryDiagnostics(),
      models: window.__apex.modelDiagnostics(),
    };
  });
  expect(night.geometry.every((entry) => entry.ok)).toBe(true);
  expect(night.models.invalid).toEqual([]);
  expect(night.models.suppressed).toEqual([]);
  expect(night.models.unsafe).toEqual([]);
});
