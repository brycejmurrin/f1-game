// @ts-check
import { test, expect } from "@playwright/test";
import { BOOT_MS } from "../helpers/fixtures.js";

const TOL = 0.18;

test("Red Bull Ring owns a safe migrated alpine foundation", async ({ page }) => {
  test.setTimeout(240000);
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/");
  // BOOT_MS, not a hand-rolled 15 s: a SwiftShader boot here measures 11-33 s (2026-09-01).
  await page.waitForFunction(() => window.__apex?.race, null, { polling: 100, timeout: BOOT_MS });

  const result = await page.evaluate(() => {
    const inspectSession = (time) => {
      window.__apex.race("redbull", time, "dry");
      const diagnostics = window.__apex.modelDiagnostics();
      return {
        geometry: window.__apex.geometryDiagnostics(),
        diagnostics,
        requiredFailures: [
          ...diagnostics.invalid,
          ...diagnostics.suppressed,
          ...diagnostics.unsafe,
        ].filter((entry) => entry.required),
        walls: window.__apex.wallStats(),
      };
    };

    const def = Tracks.LIST.find((track) => track.id === "redbull");
    const day = inspectSession("day");
    const night = inspectSession("night");
    const profile = window.__apex.trackProfile(800);
    const peak = profile.reduce((best, point) => point.y > best.y ? point : best);
    const low = profile.reduce((best, point) => point.y < best.y ? point : best);
    const clearanceProbes = [0.98, 0.335].flatMap((frac) =>
      [-24, -10, 10, 24].map((lat) => ({
        frac,
        lat,
        gap: window.__apex.groundY(frac, lat).gap,
      }))
    );

    return {
      coordinates: def?.sceneryCoordinates,
      terrainOuter: def?.terrainOuter,
      profile: {
        peak,
        low,
        swing: peak.y - low.y,
        maxSlope: Math.max(...profile.map((point) => Math.abs(point.slope))),
      },
      sessions: { day, night },
      clearanceProbes,
    };
  });
  await page.waitForTimeout(100);

  expect(result.coordinates).toBe("racing");
  expect(result.terrainOuter).toBeGreaterThanOrEqual(28);
  expect(result.terrainOuter).toBeLessThanOrEqual(72);
  expect(result.profile.swing).toBeGreaterThanOrEqual(55);
  expect(result.profile.swing).toBeLessThanOrEqual(65);
  // 7a173519 moved the start line (startFrac 0.1875 -> 0.0), rotating racing
  // fractions by the arc shift (+0.2952); the alpine peak and the valley did
  // not move physically. Measured in the new frame (headless VM,
  // trackProfile(800) grid): peak at frac 0.51 / +32.0 m, low at
  // 0.7113 / -27.9 m.
  expect(result.profile.peak.frac).toBeGreaterThan(0.45);
  expect(result.profile.peak.frac).toBeLessThan(0.57);
  expect(result.profile.low.frac).toBeGreaterThan(0.65);
  expect(result.profile.low.frac).toBeLessThan(0.77);
  expect(result.profile.maxSlope).toBeLessThan(0.14);

  for (const [time, session] of Object.entries(result.sessions)) {
    expect(session.geometry.every((entry) => entry.ok), `${time} geometry`).toBe(true);
    expect(session.diagnostics.invalid, `${time} invalid models`).toEqual([]);
    expect(session.diagnostics.unsafe, `${time} unsafe models`).toEqual([]);
    expect(session.requiredFailures, `${time} required model failures`).toEqual([]);
    expect(session.diagnostics.emitted.map((entry) => entry.id), `${time} hero models`).toEqual(
      expect.arrayContaining(["redbull-wing", "redbull-bull-plaza"])
    );
    expect(session.walls.anyNaN, `${time} finite barriers`).toBe(false);
    expect(session.walls.tightFrac, `${time} barrier coverage`).toBeGreaterThan(0.99);
    expect(session.walls.minOverHw, `${time} barrier clearance`).toBeGreaterThan(0);
  }

  for (const probe of result.clearanceProbes) {
    expect(probe.gap === null || probe.gap <= TOL,
      `terrain at ${(probe.frac * 100).toFixed(1)}% lat ${probe.lat}m: ${probe.gap}`).toBe(true);
  }
  expect(pageErrors).toEqual([]);
});
