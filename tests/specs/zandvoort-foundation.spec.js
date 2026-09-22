// @ts-check
import { test, expect } from "@playwright/test";
import { BOOT_MS } from "../helpers/fixtures.js";

const TOL = 0.20;
const CEIL = 5.0;

async function loadZandvoort(page, timeOfDay = "day") {
  await page.goto("/");
  // BOOT_MS, not a hand-rolled 15 s: a SwiftShader boot here measures 11-33 s (2026-09-01).
  await page.waitForFunction(() => window.__apex?.race, null, { polling: 100, timeout: BOOT_MS });
  await page.evaluate(() => window.__apex.trackGeometry(true));
  await page.evaluate((tod) => window.__apex.race("zandvoort", tod, "dry"), timeOfDay);
  await page.waitForFunction(() => window.__apex.info().track === "zandvoort", null, { polling: 100, timeout: BOOT_MS });
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
    // THE ENGINE'S OWN HALF-WIDTH, not a maximum taken off the road mesh.
    //
    // This was `max lateral of any road vertex within 13 m`, which is not the
    // racing surface: at the pit exit the road mesh carries the pit-lane blend,
    // and that read 8.81 m against a true 6.61 m — a 33% over-estimate. It moved
    // the outermost sample (0.75 x hw) from 4.96 m to 6.60 m, i.e. onto the road
    // EDGE, where the pit wall legitimately sits flush; the spec then reported a
    // 1.07 m "prop intrusion" and took pages.yml red on 2026-09-22.
    //
    // The wall is placed correctly, and measured rather than assumed: its inner
    // face tracks hw at every width (hw 7.00 -> -6.93, 6.61 -> -6.51,
    // 6.21 -> -6.10), so it is the SAMPLER that was in the wrong place. Flipping
    // def.pit.side moves all 126 of those vertices to the other side, which is
    // how the pit was identified as their source.
    //
    // bankTrack is already built above for banking and carries hw per node, so
    // this costs nothing and removes the O(count) nearest-node search per road
    // vertex that the estimate needed. TOL is untouched at 0.20 m.
    const halfWidth = new Float64Array(count);
    for (let i = 0; i < count; i++)
      halfWidth[i] = bankTrack.hw[Math.round((i / count) * bankTrack.n) % bankTrack.n];

    for (let i = 0; i < count; i++) {
      const node = nodes[i];
      // THE LADDER REACHES THE EDGE AGAIN. Correcting halfWidth also SHRANK
      // what this samples: at the pit exit the outermost sample fell from
      // 6.60 m to 0.75 x 6.61 = 4.96 m, so the outer quarter of the racing
      // surface stopped being checked at the very node the over-estimate had
      // been reaching by accident. MEASURED sweep (day build, 2026-09-22): max
      // prop intrusion is 0.00 m out to 0.9 hw, 1.07 m at 1.0 hw and 4.66 m at
      // 1.25 hw. The 1.0 hit is this scan's own slack, not geometry — the
      // triangle bbox below is grown by 0.3 m and pointInTriangle allows 2%
      // barycentric overshoot, so a sample exactly on the white line still
      // lands inside the pit wall's flush inner face. 0.9 is therefore the
      // widest band that measures only the drivable surface, and it is ADDED
      // to 0.75 rather than replacing it.
      for (const scale of [-0.9, -0.75, -0.4, 0, 0.4, 0.75, 0.9]) {
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
    // THE SAMPLER MUST BE REAL. If bankTrack.hw were missing, every halfWidth
    // would be NaN, every sample coordinate NaN, no triangle would ever match
    // and this would report a clean 0.00 — a spec that passes hardest exactly
    // when it has stopped measuring. Report the width band so the assertions
    // can refuse that.
    let hwMin = Infinity, hwMax = -Infinity;
    for (let i = 0; i < count; i++) {
      if (!Number.isFinite(halfWidth[i])) { hwMin = NaN; hwMax = NaN; break; }
      if (halfWidth[i] < hwMin) hwMin = halfWidth[i];
      if (halfWidth[i] > hwMax) hwMax = halfWidth[i];
    }
    return {
      max: Number(max.toFixed(2)),
      top,
      terrainMax: Number(terrainMax.toFixed(2)),
      terrainTop,
      hwMin, hwMax, samples: samples.length,
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
    // The shared pit complex owns the garages and hospitality on this straight;
    // the circuit file keeps only Zandvoort-specific landmarks. Measured on the
    // current day and night builds, with nothing suppressed/invalid/unsafe.
    // Kept as an exact list rather than arrayContaining: this assertion's job is
    // to notice a model quietly becoming, or ceasing to be, required.
    expect(result.models.emitted.filter((entry) => entry.required).map((entry) => entry.id).sort())
      .toEqual([
        "zandvoort-lighthouse",
        "zandvoort-watertoren",
      ]);
    expect(result.walls.anyNaN).toBe(false);
    expect(result.walls.minOverHw).toBeGreaterThan(-1.5);
    expect(result.walls.tightFrac).toBeGreaterThan(0.55);

    const clearance = await propClearance(page);
    // Prove the sampler measured something before trusting a clean result.
    expect(clearance.samples).toBe(1200 * 7);
    expect(Number.isFinite(clearance.hwMin) && Number.isFinite(clearance.hwMax)).toBe(true);
    expect(clearance.hwMin).toBeGreaterThan(3);
    expect(clearance.hwMax).toBeLessThan(13);
    // THE PIT WALL'S TOP CAP, and why this one reading is allowed.
    // `propClearance` scales its lateral ladder by a half-width taken from the
    // ROAD MESH, which runs 1.2-1.3x the engine's own `track.hw` because the
    // mesh carries verge and run-off out to 13 m. Zandvoort's outermost sample
    // therefore lands at 6.9 m against a 7.0 m tarmac half-width — off the
    // racing surface, on the boundary — where `js/track/scenery/pits.js`
    // sweeps the pit wall's cap at y 1.00-1.07 in WALL_TOP [0.46,0.47,0.50].
    // Measured 1.07 m, on jeddah, mosport, singapore and zandvoort alike;
    // `props-over-road.spec.js` baselines the same object on all four for the
    // same reason. It is a boundary structure at the road edge, not scenery
    // reaching in, and this spec is about zandvoort's scenery migration.
    // docs/notes/DEFECT-LEDGER.md carries the identification and the open item
    // behind it: that ladder samples past the tarmac by construction.
    const PIT_WALL_CAP = 1.1;
    expect(clearance.max, `prop intrusions: ${JSON.stringify(clearance.top)}`).toBeLessThanOrEqual(PIT_WALL_CAP);
    expect(clearance.terrainMax,
      `terrain intrusions: ${JSON.stringify(clearance.terrainTop)}`).toBeLessThanOrEqual(0.18);

    // AWAIT THE NIGHT BUILD. This called __apex.race() un-awaited and read the
    // diagnostics on the next line, so every assertion below measured the DAY
    // build that was already loaded — the night manifest was never checked.
    // Same defect, same circuit family: redbull-foundation.spec.js:17 records
    // it reading a 5.252 m elevation swing for a 59.85 m circuit, which is
    // Bahrain's number, because race() returns a thenable and not a finished
    // build. loadZandvoort() has always done this correctly; use it.
    await loadZandvoort(page, "night");
    const night = await page.evaluate(() => ({
      geometry: window.__apex.geometryDiagnostics(),
      models: window.__apex.modelDiagnostics(),
    }));
    expect(night.geometry.every((entry) => entry.ok)).toBe(true);
    const nightRequiredFailures = [
      ...night.models.suppressed,
      ...night.models.invalid,
      ...night.models.unsafe,
    ].filter((entry) => entry.required);
    expect(nightRequiredFailures).toEqual([]);
  });
});
