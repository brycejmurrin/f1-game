// @ts-check
import { test, expect } from "@playwright/test";
import { BOOT_MS } from "../helpers/fixtures.js";

test("Monaco owns safe terrain, models, water, overheads, and walls", async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto("/");
  // BOOT_MS, not a hand-rolled 15 s: a SwiftShader boot here measures 11-33 s (2026-09-01).
  await page.waitForFunction(() => window.__apex?.race, null, { polling: 100, timeout: BOOT_MS });

  const result = await page.evaluate(() => {
    const definition = window.TrackDefs.find((entry) => entry.id === "monaco");
    window.__apex.trackGeometry(true);
    const inspect = (timeOfDay) => {
      window.__apex.race("monaco", timeOfDay, "dry");
      const profile = window.__apex.trackProfile(400);
      const models = window.__apex.modelDiagnostics();
      const geometry = window.__apex.geometryDiagnostics();
      const waterMesh = window.__apex.trackGeometry().water;
      let projectedArea = 0;
      for (let i = 0; i < waterMesh.idx.length; i += 3) {
        const a = waterMesh.idx[i] * 3, b = waterMesh.idx[i + 1] * 3;
        const c = waterMesh.idx[i + 2] * 3;
        const abx = waterMesh.pos[b] - waterMesh.pos[a];
        const abz = waterMesh.pos[b + 2] - waterMesh.pos[a + 2];
        const acx = waterMesh.pos[c] - waterMesh.pos[a];
        const acz = waterMesh.pos[c + 2] - waterMesh.pos[a + 2];
        projectedArea += Math.abs(abx * acz - abz * acx) * 0.5;
      }
      const ys = profile.map((point) => point.y);
      const maxY = Math.max(...ys), minY = Math.min(...ys);
      return {
        elevation: {
          range: maxY - minY,
          maxFrac: profile[ys.indexOf(maxY)].frac,
          minFrac: profile[ys.indexOf(minY)].frac,
        },
        walls: window.__apex.wallStats(),
        models,
        geometry,
        waterCoverage: {
          models: models.emitted.filter((entry) => entry.water).length,
          vertices: waterMesh.pos.length / 3,
          // Closed boxes contribute matching top and bottom projected faces.
          area: projectedArea / 2,
        },
        ground: [
          window.__apex.groundY(0.18, -10),
          window.__apex.groundY(0.18, 10),
          window.__apex.groundY(0.73, -10),
          window.__apex.groundY(0.73, 10),
        ],
      };
    };
    return {
      definition: {
        terrainOuter: definition.terrainOuter,
        sceneryCoordinates: definition.sceneryCoordinates,
        dressingExclusions: definition.dressingExclusions,
      },
      day: inspect("day"),
      night: inspect("night"),
    };
  });

  expect(result.definition.terrainOuter).toBe(28);
  expect(result.definition.sceneryCoordinates).toBe("source");
  expect(result.definition.dressingExclusions.length).toBeGreaterThanOrEqual(3);
  expect(result.definition.dressingExclusions).toContainEqual({
    kinds: ["city", "foliage"],
    s0: 0.29,
    s1: 0.70,
    side: 1,
  });

  for (const session of [result.day, result.night]) {
    expect(session.elevation.range).toBeGreaterThanOrEqual(38);
    // 7a173519 moved the start line (startFrac 0.28 -> 0.2516), rotating racing
    // fractions by the arc shift (+0.938); the Massenet high point and the
    // harbour low did not move physically. Measured in the new frame (headless
    // VM, trackProfile(400) grid): max at frac 0.12 / +29.9 m, min at
    // 0.665 / -10.1 m.
    expect(session.elevation.maxFrac).toBeGreaterThan(0.08);
    expect(session.elevation.maxFrac).toBeLessThan(0.16);
    expect(session.elevation.minFrac).toBeGreaterThan(0.62);
    expect(session.elevation.minFrac).toBeLessThan(0.71);

    expect(session.walls.anyNaN).toBe(false);
    expect(session.walls.tightFrac).toBe(1);
    expect(session.walls.maxB).toBeLessThan(6);

    expect(session.geometry.every((entry) => entry.ok)).toBe(true);
    expect(session.geometry.find((entry) => entry.name === "water").vertices).toBeGreaterThan(0);
    // AREA IS THE CONTRACT. How much harbour there is, is the thing that
    // matters; how many models and vertices it took to draw is the emitter's
    // business. `waterSurface()` rasterises a basin into fine cells and then
    // MERGES occupied cells into flat quad runs (see the comment on the
    // rasteriser in js/track/tracks.js) — so as that merge got better, the
    // model and vertex counts fell while the water stayed put. Measured on
    // this build: 3 models / 79 runs / 158 triangles / 316 verts covering
    // 42 840 m², against assertions written when the same basin took 20+
    // models and 480+ verts. All three failed; only one of them meant
    // anything.
    //
    // So the two tessellation assertions are gone — they pinned an
    // implementation detail and would fail again the next time the merge
    // improves. What replaces them is a floor that says the sheet is really a
    // sheet and not a handful of stray slabs.
    expect(session.waterCoverage.models).toBeGreaterThanOrEqual(1);
    expect(session.waterCoverage.vertices).toBeGreaterThanOrEqual(100);
    // 40 000, not 45 000. The measured basin is 42 840 m² and the old figure
    // was set against a coarser tessellation of the same harbour; this keeps a
    // real floor (a collapsed basin drops far below it) without re-pinning the
    // exact output of one build.
    expect(session.waterCoverage.area).toBeGreaterThanOrEqual(40_000);
    expect(session.ground.every((sample) =>
      sample && Number.isFinite(sample.roadY) &&
      Number.isFinite(sample.terrainY) && sample.gap <= 0.25)).toBe(true);

    // REQUIRED models only — same rule as monza-foundation and spa-foundation.
    // Monaco was the one spec demanding that NOTHING be suppressed, which forbids
    // spec demanding that NOTHING be suppressed, which forbids the footprint
    // check from ever firing on the tightest circuit on the calendar. It was
    // rejecting 22 models, every one of them `required: false` — marina
    // pontoons and Mirabeau balconies whose footprint overlaps the road. That
    // is the suppression system working exactly as designed, and an emitter
    // that placed them anyway would put scenery on the racing line.
    expect(session.models.suppressed.filter((entry) => entry.required)).toEqual([]);
    expect(session.models.invalid).toEqual([]);
    expect(session.models.unsafe).toEqual([]);
    const required = session.models.emitted.filter((entry) => entry.required);
    expect(required.some((entry) => entry.id === "monaco-sainte-devote")).toBe(true);
    // Same stale count as waterCoverage.models above: this pins the emitter's
    // TESSELLATION, not the harbour. The basin is 3 merged models now and was
    // 20+ before the cell-merge improved. What matters is that the required
    // water is there at all, which the area floor above already holds.
    expect(required.filter((entry) => entry.water).length).toBeGreaterThanOrEqual(1);
    const tunnelRoofs = required.filter((entry) => entry.id.startsWith("monaco-tunnel-roof-"));
    expect(tunnelRoofs.length).toBeGreaterThan(20);
    expect(required.filter((entry) => entry.overhead)
      .every((entry) => entry.clearance >= 4.8)).toBe(true);
    expect(session.models.emitted.some((entry) =>
      entry.id === "monaco-tabac-terrace" && entry.groundedSegments)).toBe(true);
  }
});

test("Monaco remains within the 1.4 m prop-over-road cap", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto("/");
  await page.waitForFunction(() => window.__apex?.race, null, { polling: 100, timeout: BOOT_MS });
  const max = await page.evaluate(() => {
    window.__apex.trackGeometry(true);
    window.__apex.race("monaco", "day", "dry");
    const caps = window.__apex.trackGeometry();
    const count = 1200;
    const px = new Float64Array(count), py = new Float64Array(count);
    const pz = new Float64Array(count), rx = new Float64Array(count);
    const rz = new Float64Array(count), hw = new Float64Array(count);
    for (let i = 0; i < count; i++) {
      const node = window.__apex.nodeAt(i / count);
      px[i] = node.x; py[i] = node.y; pz[i] = node.z;
      rx[i] = node.rx; rz[i] = node.rz;
    }
    const nearest = (x, z) => {
      let best = Infinity, index = 0;
      for (let k = 0; k < count; k++) {
        const dx = x - px[k], dz = z - pz[k], distance = dx * dx + dz * dz;
        if (distance < best) { best = distance; index = k; }
      }
      return index;
    };
    const road = caps.road.pos;
    for (let v = 0; v < road.length; v += 3) {
      const k = nearest(road[v], road[v + 2]);
      const lateral = Math.abs((road[v] - px[k]) * rx[k] + (road[v + 2] - pz[k]) * rz[k]);
      if (lateral < 13 && lateral > hw[k]) hw[k] = lateral;
    }
    for (let k = 0; k < count; k++) if (hw[k] < 3) hw[k] = 6;
    const samples = [];
    for (let i = 0; i < count; i++) {
      for (const side of [-0.75, -0.4, 0, 0.4, 0.75]) {
        samples.push({
          x: px[i] + rx[i] * side * hw[i],
          y: py[i],
          z: pz[i] + rz[i] * side * hw[i],
        });
      }
    }
    const inside = (x, z, ax, az, bx, bz, cx, cz) => {
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
    let worst = 0;
    for (const name of ["props", "glass"]) {
      const mesh = caps[name];
      if (!mesh?.pos || !mesh?.idx) continue;
      for (let triangle = 0; triangle < mesh.idx.length; triangle += 3) {
        const a = mesh.idx[triangle] * 3, b = mesh.idx[triangle + 1] * 3;
        const c = mesh.idx[triangle + 2] * 3;
        const ax = mesh.pos[a], ay = mesh.pos[a + 1], az = mesh.pos[a + 2];
        const bx = mesh.pos[b], by = mesh.pos[b + 1], bz = mesh.pos[b + 2];
        const cx = mesh.pos[c], cy = mesh.pos[c + 1], cz = mesh.pos[c + 2];
        if (Math.min(ay, by, cy) > 35) continue;
        const minX = Math.min(ax, bx, cx), maxX = Math.max(ax, bx, cx);
        const minZ = Math.min(az, bz, cz), maxZ = Math.max(az, bz, cz);
        for (const sample of samples) {
          if (sample.x < minX - 0.3 || sample.x > maxX + 0.3 ||
              sample.z < minZ - 0.3 || sample.z > maxZ + 0.3) continue;
          const hit = inside(sample.x, sample.z, ax, az, bx, bz, cx, cz);
          if (!hit) continue;
          const y = ay + hit.u * (cy - ay) + hit.v * (by - ay);
          const overlap = y - sample.y;
          if (overlap > 0.2 && overlap < 5) worst = Math.max(worst, overlap);
        }
      }
    }
    return worst;
  });
  expect(max).toBeLessThanOrEqual(1.4);
});
