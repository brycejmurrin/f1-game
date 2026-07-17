// @ts-check
import { test, expect } from "@playwright/test";

async function loadSpa(page, time = "day") {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex?.race, { timeout: 15000 });
  await page.evaluate((tod) => window.__apex.race("spa", tod, "dry"), time);
  await page.waitForFunction(() => window.__apex.info().track === "spa", { timeout: 15000 });
}

test.describe("Spa track-owned foundation migration", () => {
  test("preserves Spa's 102 m relief and Raidillon climb", async ({ page }) => {
    await loadSpa(page);
    const elevation = await page.evaluate(() => {
      const profile = window.__apex.trackProfile(720);
      const ys = profile.map((p) => p.y);
      return {
        range: Math.max(...ys) - Math.min(...ys),
        eauRouge: window.__apex.nodeAt(0.075).y,
        kemmel: window.__apex.nodeAt(0.155).y,
        maxUp: Math.max(...profile.map((p) => p.slope)),
      };
    });

    expect(elevation.range).toBeGreaterThanOrEqual(100);
    expect(elevation.range).toBeLessThanOrEqual(104);
    expect(elevation.kemmel - elevation.eauRouge).toBeGreaterThan(75);
    expect(elevation.maxUp).toBeGreaterThan(0.17);
    expect(elevation.maxUp).toBeLessThan(0.23);
  });

  test("grounds key terrain feet without weakening road clearance", async ({ page }) => {
    await loadSpa(page);
    const probes = await page.evaluate(() => {
      const points = [
        [0.075, -16], [0.075, 16],       // Eau Rouge forest banks
        [0.125, -11], [0.125, 11],       // Kemmel footbridge supports
        [0.500, -11], [0.500, 11],       // mid-forest footbridge supports
        [0.775, 19.2], [0.790, 18.5],    // Stavelot ground patches
      ];
      return points.map(([frac, lat]) => ({
        frac, lat, sample: window.__apex.groundY(frac, lat),
      }));
    });

    for (const { frac, lat, sample } of probes) {
      expect(sample.terrainY, `missing terrain at ${frac}/${lat}`).not.toBeNull();
      expect(sample.gap, `terrain over road at ${frac}/${lat}`).toBeLessThanOrEqual(0.18);
    }
  });

  test("keeps terrain, shoulders, and props out of Spa's racing corridor", async ({ page }) => {
    test.setTimeout(180000);
    await loadSpa(page);
    const overlaps = await page.evaluate(() => {
      const caps = window.__apex.trackGeometry();
      const count = 900;
      const profile = window.__apex.trackProfile(count);
      const samples = [];
      for (let i = 0; i < count; i++) {
        const node = window.__apex.nodeAt(i / count);
        const halfWidth = profile[i].hw;
        for (const scale of [-0.6, -0.3, 0, 0.3, 0.6]) {
          samples.push({
            x: node.x + node.rx * halfWidth * scale,
            z: node.z + node.rz * halfWidth * scale,
            y: node.y,
          });
        }
      }

      const cellSize = 10;
      const cells = new Map();
      for (const sample of samples) {
        const key = `${Math.floor(sample.x / cellSize)},${Math.floor(sample.z / cellSize)}`;
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key).push(sample);
      }

      const scan = (name, bandOnly) => {
        const mesh = caps[name];
        if (!mesh?.pos || !mesh?.idx) return 0;
        let max = 0;
        const { pos, idx } = mesh;
        for (let t = 0; t < idx.length; t += 3) {
          const ai = idx[t] * 3, bi = idx[t + 1] * 3, ci = idx[t + 2] * 3;
          const ax = pos[ai], ay = pos[ai + 1], az = pos[ai + 2];
          const bx = pos[bi], by = pos[bi + 1], bz = pos[bi + 2];
          const cx = pos[ci], cy = pos[ci + 1], cz = pos[ci + 2];
          const minX = Math.floor(Math.min(ax, bx, cx) / cellSize);
          const maxX = Math.floor(Math.max(ax, bx, cx) / cellSize);
          const minZ = Math.floor(Math.min(az, bz, cz) / cellSize);
          const maxZ = Math.floor(Math.max(az, bz, cz) / cellSize);
          const v0x = cx - ax, v0z = cz - az, v1x = bx - ax, v1z = bz - az;
          const d00 = v0x * v0x + v0z * v0z, d01 = v0x * v1x + v0z * v1z;
          const d11 = v1x * v1x + v1z * v1z, denominator = d00 * d11 - d01 * d01;
          if (Math.abs(denominator) < 1e-9) continue;
          for (let gx = minX; gx <= maxX; gx++) {
            for (let gz = minZ; gz <= maxZ; gz++) {
              for (const sample of cells.get(`${gx},${gz}`) || []) {
                const v2x = sample.x - ax, v2z = sample.z - az;
                const d20 = v2x * v0x + v2z * v0z, d21 = v2x * v1x + v2z * v1z;
                const u = (d11 * d20 - d01 * d21) / denominator;
                const v = (d00 * d21 - d01 * d20) / denominator;
                if (u < -0.02 || v < -0.02 || u + v > 1.02) continue;
                const surfaceY = ay + u * (cy - ay) + v * (by - ay);
                const over = surfaceY - sample.y;
                if (bandOnly ? over > 0.2 && over < 5 : over > 0.1)
                  max = Math.max(max, over);
              }
            }
          }
        }
        return Number(max.toFixed(3));
      };

      return {
        road: scan("road", false),
        terrain: scan("terrain", false),
        props: Math.max(scan("props", true), scan("glass", true)),
      };
    });

    expect(overlaps.road).toBeLessThanOrEqual(0.18);
    expect(overlaps.terrain).toBeLessThanOrEqual(0.18);
    expect(overlaps.props).toBeLessThanOrEqual(0.20);
  });

  for (const time of ["day", "night"]) {
    test(`emits safe atomic landmarks and overheads by ${time}`, async ({ page }) => {
      await loadSpa(page, time);
      const result = await page.evaluate(() => ({
        geometry: window.__apex.geometryDiagnostics(),
        models: window.__apex.modelDiagnostics(),
        walls: window.__apex.wallStats(),
      }));

      expect(result.geometry.every((entry) => entry.ok)).toBe(true);
      expect(result.models.invalid).toEqual([]);
      expect(result.models.unsafe).toEqual([]);
      const requiredFailures = [...result.models.suppressed, ...result.models.invalid, ...result.models.unsafe]
        .filter((entry) => entry.required);
      expect(requiredFailures).toEqual([]);

      const emitted = new Map(result.models.emitted.map((entry) => [entry.id, entry]));
      expect(emitted.get("spa-timing-tower")?.required).toBe(true);
      for (const id of ["spa-footbridge-125", "spa-footbridge-500"]) {
        expect(emitted.get(id)?.overhead).toBe(true);
        expect(emitted.get(id)?.clearance).toBeGreaterThanOrEqual(6.5);
      }

      expect(result.walls.anyNaN).toBe(false);
      expect(result.walls.minOverHw).toBeGreaterThanOrEqual(1);
    });
  }
});
