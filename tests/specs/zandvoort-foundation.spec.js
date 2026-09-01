// @ts-check
import { test, expect } from "@playwright/test";

const TOL = 0.20;
const CEIL = 5.0;

async function loadZandvoort(page, timeOfDay = "day") {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex?.race, null, { polling: 100, timeout: 15000 });
  await page.evaluate(() => window.__apex.trackGeometry(true));
  await page.evaluate((tod) => window.__apex.race("zandvoort", tod, "dry"), timeOfDay);
  await page.waitForFunction(() => window.__apex.info().track === "zandvoort", null, { polling: 100, timeout: 15000 });
  await page.waitForTimeout(1200);
}

async function propClearance(page) {
  return page.evaluate(({ ceil, tol }) => {
    const caps = window.__apex.trackGeometry();
    const count = 1200;
    const samples = [];
    const grid = new Map();
    const cellSize = 12;
    const cellKey = (x, z) => `${Math.floor(x / cellSize)},${Math.floor(z / cellSize)}`;
    const nodes = Array.from({ length: count }, (_, i) => window.__apex.nodeAt(i / count));
    const bankTrack = Tracks.buildCenterline(Tracks.LIST.find((t) => t.id === "zandvoort"));
    const halfWidth = new Float64Array(count);
    const nearestNode = (x, z) => {
      let bestDistance = Infinity, best = 0;
      for (let i = 0; i < count; i++) {
        const dx = x - nodes[i].x, dz = z - nodes[i].z;
        const distance = dx * dx + dz * dz;
        if (distance < bestDistance) { bestDistance = distance; best = i; }
      }
      return best;
    };
    for (let v = 0; v < caps.road.pos.length; v += 3) {
      const x = caps.road.pos[v], z = caps.road.pos[v + 2];
      const i = nearestNode(x, z), node = nodes[i];
      const lateral = Math.abs((x - node.x) * node.rx + (z - node.z) * node.rz);
      if (lateral < 13 && lateral > halfWidth[i]) halfWidth[i] = lateral;
    }
    for (let i = 0; i < count; i++) if (halfWidth[i] < 3) halfWidth[i] = 6;

    for (let i = 0; i < count; i++) {
      const node = nodes[i];
      for (const scale of [-0.75, -0.4, 0, 0.4, 0.75]) {
        const lat = scale * halfWidth[i];
        const bank = Tracks.banking(bankTrack, node.frac != null ? node.frac * bankTrack.total : i / count * bankTrack.total, lat);
        const sample = {
          x: node.x + node.rx * lat,
          z: node.z + node.rz * lat,
          // Centreline node.y is not the tarmac at |lat| > 0 on a banked
          // corner. Same dy term buildRoad applies (see monza-foundation).
          y: node.y + (bank ? bank.dy : 0),
          frac: i / count,
        };
        const index = samples.push(sample) - 1;
        const key = cellKey(sample.x, sample.z);
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(index);
      }
    }

    const pointInTriangle = (x, z, ax, az, bx, bz, cx, cz) => {
      const v0x = cx - ax, v0z = cz - az;
      const v1x = bx - ax, v1z = bz - az;
      const v2x = x - ax, v2z = z - az;
      const d00 = v0x * v0x + v0z * v0z;
      const d01 = v0x * v1x + v0z * v1z;
      const d11 = v1x * v1x + v1z * v1z;
      const d20 = v2x * v0x + v2z * v0z;
      const d21 = v2x * v1x + v2z * v1z;
      const denominator = d00 * d11 - d01 * d01;
      if (Math.abs(denominator) < 1e-9) return null;
      const u = (d11 * d20 - d01 * d21) / denominator;
      const v = (d00 * d21 - d01 * d20) / denominator;
      return u >= -0.02 && v >= -0.02 && u + v <= 1.02 ? { u, v } : null;
    };

    let max = 0;
    const byFraction = {};
    for (const name of ["props", "glass"]) {
      const mesh = caps[name];
      if (!mesh?.pos || !mesh?.idx) continue;
      const { pos, idx } = mesh;
      for (let t = 0; t < idx.length; t += 3) {
        const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
        const ax = pos[a], ay = pos[a + 1], az = pos[a + 2];
        const bx = pos[b], by = pos[b + 1], bz = pos[b + 2];
        const cx = pos[c], cy = pos[c + 1], cz = pos[c + 2];
        if (Math.min(ay, by, cy) > ceil + 30) continue;
        const minX = Math.min(ax, bx, cx) - 0.3, maxX = Math.max(ax, bx, cx) + 0.3;
        const minZ = Math.min(az, bz, cz) - 0.3, maxZ = Math.max(az, bz, cz) + 0.3;
        const candidates = new Set();
        for (let gx = Math.floor(minX / cellSize); gx <= Math.floor(maxX / cellSize); gx++) {
          for (let gz = Math.floor(minZ / cellSize); gz <= Math.floor(maxZ / cellSize); gz++) {
            for (const index of grid.get(`${gx},${gz}`) || []) candidates.add(index);
          }
        }
        for (const index of candidates) {
          const sample = samples[index];
          if (sample.x < minX || sample.x > maxX || sample.z < minZ || sample.z > maxZ) continue;
          const bary = pointInTriangle(sample.x, sample.z, ax, az, bx, bz, cx, cz);
          if (!bary) continue;
          const faceY = ay + bary.u * (cy - ay) + bary.v * (by - ay);
          const over = faceY - sample.y;
          if (over > tol && over < ceil) {
            const frac = Math.round(sample.frac * 200) / 2;
            if (!byFraction[frac] || over > byFraction[frac].over) {
              byFraction[frac] = {
                over,
                x: (ax + bx + cx) / 3,
                z: (az + bz + cz) / 3,
                minY: Math.min(ay, by, cy),
                maxY: Math.max(ay, by, cy),
                mesh: name,
                color: mesh.col ? mesh.col.slice(a, a + 3) : null,
                edges: [
                  Math.hypot(ax - bx, ay - by, az - bz),
                  Math.hypot(bx - cx, by - cy, bz - cz),
                  Math.hypot(cx - ax, cy - ay, cz - az),
                ],
              };
            }
            max = Math.max(max, over);
          }
        }
      }
    }
    let terrainMax = 0;
    const terrainByFraction = {};
    const terrain = caps.terrain;
    if (terrain?.pos && terrain?.idx) {
      const { pos, idx } = terrain;
      for (let t = 0; t < idx.length; t += 3) {
        const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
        const ax = pos[a], ay = pos[a + 1], az = pos[a + 2];
        const bx = pos[b], by = pos[b + 1], bz = pos[b + 2];
        const cx = pos[c], cy = pos[c + 1], cz = pos[c + 2];
        const minX = Math.min(ax, bx, cx) - 0.3, maxX = Math.max(ax, bx, cx) + 0.3;
        const minZ = Math.min(az, bz, cz) - 0.3, maxZ = Math.max(az, bz, cz) + 0.3;
        const candidates = new Set();
        for (let gx = Math.floor(minX / cellSize); gx <= Math.floor(maxX / cellSize); gx++) {
          for (let gz = Math.floor(minZ / cellSize); gz <= Math.floor(maxZ / cellSize); gz++) {
            for (const index of grid.get(`${gx},${gz}`) || []) candidates.add(index);
          }
        }
        for (const index of candidates) {
          const sample = samples[index];
          if (sample.x < minX || sample.x > maxX || sample.z < minZ || sample.z > maxZ) continue;
          const bary = pointInTriangle(sample.x, sample.z, ax, az, bx, bz, cx, cz);
          if (!bary) continue;
          const faceY = ay + bary.u * (cy - ay) + bary.v * (by - ay);
          const over = faceY - sample.y;
          if (over > 0.1) {
            const frac = Math.round(sample.frac * 200) / 2;
            terrainByFraction[frac] = Math.max(terrainByFraction[frac] || 0, over);
            terrainMax = Math.max(terrainMax, over);
          }
        }
      }
    }
    const top = Object.entries(byFraction)
      .map(([frac, hit]) => ({
        frac: Number(frac),
        over: Number(hit.over.toFixed(2)),
        x: Number(hit.x.toFixed(1)),
        z: Number(hit.z.toFixed(1)),
        minY: Number(hit.minY.toFixed(2)),
        maxY: Number(hit.maxY.toFixed(2)),
        mesh: hit.mesh,
        color: hit.color?.map((value) => Number(value.toFixed(2))),
        edges: hit.edges.map((value) => Number(value.toFixed(2))),
      }))
      .sort((a, b) => b.over - a.over)
      .slice(0, 8);
    const terrainTop = Object.entries(terrainByFraction)
      .map(([frac, over]) => ({ frac: Number(frac), over: Number(over.toFixed(2)) }))
      .sort((a, b) => b.over - a.over)
      .slice(0, 8);
    return {
      max: Number(max.toFixed(2)),
      top,
      terrainMax: Number(terrainMax.toFixed(2)),
      terrainTop,
    };
  }, { ceil: CEIL, tol: TOL });
}

test.describe("Zandvoort shared-foundation migration", () => {
  test.describe.configure({ timeout: 360000 });

  test("has explicit coordinates, safe models, and clean road clearance", async ({ page }) => {
    await loadZandvoort(page);
    const result = await page.evaluate(() => {
      const def = Tracks.LIST.find((track) => track.id === "zandvoort");
      return {
        sceneryCoordinates: def?.sceneryCoordinates,
        terrainOuter: def?.terrainOuter,
        geometry: window.__apex.geometryDiagnostics(),
        models: window.__apex.modelDiagnostics(),
        walls: window.__apex.wallStats(),
      };
    });
    expect(result.sceneryCoordinates).toBe("racing");
    expect(result.terrainOuter).toBeGreaterThanOrEqual(100);
    expect(result.geometry.every((entry) => entry.ok)).toBe(true);
    const requiredFailures = [
      ...result.models.suppressed,
      ...result.models.invalid,
      ...result.models.unsafe,
    ].filter((entry) => entry.required);
    expect(requiredFailures).toEqual([]);
    // Zandvoort GAINED two required models after this list was pinned; neither of
    // the original two went missing. Measured on the current build (day and night
    // both emit the same four, nothing suppressed/invalid/unsafe):
    //   kit:zandvoort:paddock-club — the 2020-21 rebuild's hospitality block, added
    //     because the hand-built pit-building box alone was under-scaled
    //   zandvoort-watertoren — the genuine 1912 landmark, added ALONGSIDE the
    //     lighthouse (which is invented; the real one went in 1907) rather than
    //     replacing it
    // Kept as an exact list rather than arrayContaining: this assertion's job is
    // to notice a model quietly becoming, or ceasing to be, required.
    expect(result.models.emitted.filter((entry) => entry.required).map((entry) => entry.id).sort())
      .toEqual([
        "kit:zandvoort:paddock-club",
        "pit-building",
        "zandvoort-lighthouse",
        "zandvoort-watertoren",
      ]);
    expect(result.walls.anyNaN).toBe(false);
    expect(result.walls.minOverHw).toBeGreaterThan(-1.5);
    expect(result.walls.tightFrac).toBeGreaterThan(0.55);

    const clearance = await propClearance(page);
    expect(clearance.max, `prop intrusions: ${JSON.stringify(clearance.top)}`).toBeLessThanOrEqual(TOL);
    expect(clearance.terrainMax,
      `terrain intrusions: ${JSON.stringify(clearance.terrainTop)}`).toBeLessThanOrEqual(0.18);

    const night = await page.evaluate(async () => {
      await window.__apex.race("zandvoort", "night", "dry");
      return {
        geometry: window.__apex.geometryDiagnostics(),
        models: window.__apex.modelDiagnostics(),
      };
    });
    expect(night.geometry.every((entry) => entry.ok)).toBe(true);
    const nightRequiredFailures = [
      ...night.models.suppressed,
      ...night.models.invalid,
      ...night.models.unsafe,
    ].filter((entry) => entry.required);
    expect(nightRequiredFailures).toEqual([]);
  });
});
