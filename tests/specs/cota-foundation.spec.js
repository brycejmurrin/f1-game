// @ts-check
import { test, expect } from "../helpers/fixtures.js";

const REQUIRED_MODELS = [
  "cota-amphitheater",
  "cota-observation-tower",
  "cota-start-gantry",
  "cota-start-gantry-support-left",
  "cota-start-gantry-support-right",
  "cota-drs-gantry",
  "cota-drs-gantry-support-left",
  "cota-drs-gantry-support-right",
];

async function loadCota(page, timeOfDay = "day") {
  await page.evaluate((tod) => window.__apex.race("cota", tod, "dry"), timeOfDay);
  await page.waitForFunction(() => window.__apex.info().track === "cota", null, { polling: 100, timeout: 15000 });
}

test.describe("COTA shared-foundation migration", () => {
  test("keeps the back-straight crest in place and terrain below the road corridor", async ({ racePage, pageErrors }) => {
    test.setTimeout(300000);
    await racePage.evaluate(() => window.__apex.trackGeometry(true));
    await loadCota(racePage);
    const result = await racePage.evaluate(() => {
      const profile = window.__apex.trackProfile(400);
      const heights = profile.map((sample) => sample.y);
      const high = Math.max(...heights);
      const low = Math.min(...heights);
      const peakFrac = profile[heights.indexOf(high)].frac;
      const probes = [];
      for (const frac of [0, 0.05, 0.108, 0.18, 0.30, 0.50, 0.63, 0.78, 0.84, 0.95]) {
        for (const lat of [-48, -32, -16, 16, 32, 48]) {
          probes.push({ frac, lat, gap: window.__apex.groundY(frac, lat).gap });
        }
      }

      // Focused form of props-over-road.spec.js: scan only COTA's props/glass
      // against samples inside the racing corridor. Intentional overheads are
      // above CEIL and therefore checked through their clearance diagnostics.
      const caps = window.__apex.trackGeometry();
      const M = 900, CEIL = 5, TOL = 0.20;
      const px = new Float64Array(M), py = new Float64Array(M), pz = new Float64Array(M);
      const rx = new Float64Array(M), rz = new Float64Array(M), hw = new Float64Array(M);
      for (let i = 0; i < M; i++) {
        const node = window.__apex.nodeAt(i / M);
        px[i] = node.x; py[i] = node.y; pz[i] = node.z; rx[i] = node.rx; rz[i] = node.rz;
      }
      const near = (x, z) => {
        let best = Infinity, at = 0;
        for (let i = 0; i < M; i++) {
          const d = (x - px[i]) ** 2 + (z - pz[i]) ** 2;
          if (d < best) { best = d; at = i; }
        }
        return at;
      };
      const road = caps.road.pos;
      for (let v = 0; v < road.length; v += 3) {
        const k = near(road[v], road[v + 2]);
        const lat = Math.abs((road[v] - px[k]) * rx[k] + (road[v + 2] - pz[k]) * rz[k]);
        if (lat < 13 && lat > hw[k]) hw[k] = lat;
      }
      for (let i = 0; i < M; i++) if (hw[i] < 3) hw[i] = 6;
      const samples = [];
      for (let i = 0; i < M; i++)
        for (const scale of [-0.75, -0.4, 0, 0.4, 0.75])
          samples.push({ x: px[i] + rx[i] * scale * hw[i], y: py[i], z: pz[i] + rz[i] * scale * hw[i] });
      const inside = (x, z, ax, az, bx, bz, cx, cz) => {
        const v0x = cx - ax, v0z = cz - az, v1x = bx - ax, v1z = bz - az, v2x = x - ax, v2z = z - az;
        const d00 = v0x * v0x + v0z * v0z, d01 = v0x * v1x + v0z * v1z, d11 = v1x * v1x + v1z * v1z;
        const d20 = v2x * v0x + v2z * v0z, d21 = v2x * v1x + v2z * v1z, den = d00 * d11 - d01 * d01;
        if (Math.abs(den) < 1e-9) return null;
        const u = (d11 * d20 - d01 * d21) / den, v = (d00 * d21 - d01 * d20) / den;
        return u >= -0.02 && v >= -0.02 && u + v <= 1.02 ? { u, v } : null;
      };
      let propMax = 0;
      for (const name of ["props", "glass"]) {
        const mesh = caps[name];
        for (let t = 0; mesh && t < mesh.idx.length; t += 3) {
          const ia = mesh.idx[t] * 3, ib = mesh.idx[t + 1] * 3, ic = mesh.idx[t + 2] * 3;
          const ax = mesh.pos[ia], ay = mesh.pos[ia + 1], az = mesh.pos[ia + 2];
          const bx = mesh.pos[ib], by = mesh.pos[ib + 1], bz = mesh.pos[ib + 2];
          const cx = mesh.pos[ic], cy = mesh.pos[ic + 1], cz = mesh.pos[ic + 2];
          if (Math.min(ay, by, cy) > CEIL + 30) continue;
          for (const sample of samples) {
            if (sample.x < Math.min(ax, bx, cx) - 0.3 || sample.x > Math.max(ax, bx, cx) + 0.3 ||
                sample.z < Math.min(az, bz, cz) - 0.3 || sample.z > Math.max(az, bz, cz) + 0.3) continue;
            const bary = inside(sample.x, sample.z, ax, az, bx, bz, cx, cz);
            if (!bary) continue;
            const over = ay + bary.u * (cy - ay) + bary.v * (by - ay) - sample.y;
            if (over > TOL && over < CEIL) propMax = Math.max(propMax, over);
          }
        }
      }
      return { range: high - low, peakFrac, probes, propMax };
    });

    expect(pageErrors).toHaveLength(0);
    expect(result.range).toBeGreaterThan(15);
    expect(result.range).toBeLessThan(22);
    // 7a173519 moved the start line (startFrac 0.515 -> 0.0) and rotated racing
    // fractions by the arc shift (+0.416 here); the physical geometry is
    // unchanged. The lap's high point is the BACK-STRAIGHT crest (the rise-18
    // bump in cota.js elevations, not Big Red's rise-3), measured at frac
    // 0.5225 in the new frame (headless VM, trackProfile(400) grid).
    //
    // KNOWN RESIDUAL — do not "fix" this pin to 0.623. cota.js's elevation
    // comment claims the crest "reads directly as racing s 0.623", but the
    // engine anchors elevations at the AUTHORING origin (sceneryStartFrac
    // 0.515) and then rotates by _sceneryShift: 0.6233 - 0.515 + 0.416 =
    // 0.5225, which is what buildCenterline actually produces. The ~0.10-lap
    // gap is between the def's comment and the engine, not in this spec.
    expect(result.peakFrac).toBeGreaterThan(0.48);
    expect(result.peakFrac).toBeLessThan(0.57);
    expect(result.propMax).toBeLessThanOrEqual(0.20);
    for (const probe of result.probes) {
      expect(probe.gap == null || probe.gap <= 0.18,
        `terrain at ${(probe.frac * 100).toFixed(1)}% lat ${probe.lat}m: ${probe.gap}`).toBe(true);
    }
  });

  test("emits complete hero, overhead, barrier, and geometry contracts by day and night", async ({ racePage, pageErrors }) => {
    test.setTimeout(300000);
    for (const timeOfDay of ["day", "night"]) {
      await loadCota(racePage, timeOfDay);
      const result = await racePage.evaluate(() => ({
        models: window.__apex.modelDiagnostics(),
        geometry: window.__apex.geometryDiagnostics(),
        walls: window.__apex.wallStats(),
      }));

      expect(result.models.invalid).toEqual([]);
      expect(result.models.suppressed).toEqual([]);
      expect(result.models.unsafe).toEqual([]);
      const emitted = new Set(result.models.emitted.map((entry) => entry.id));
      for (const id of REQUIRED_MODELS) expect(emitted.has(id), `${timeOfDay}: ${id}`).toBe(true);
      for (const span of result.models.emitted.filter((entry) => entry.overhead))
        expect(span.clearance).toBeGreaterThanOrEqual(4.8);
      expect(result.geometry.every((entry) => entry.ok)).toBe(true);
      expect(result.walls.anyNaN).toBe(false);
      expect(result.walls.minOverHw).toBeGreaterThan(0.8);
    }
    expect(pageErrors).toHaveLength(0);
  });
});
