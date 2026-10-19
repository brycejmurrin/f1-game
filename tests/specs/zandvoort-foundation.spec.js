// @ts-check
import { test, expect } from "@playwright/test";
import { BOOT_MS } from "../helpers/fixtures.js";

async function loadZandvoort(page, timeOfDay = "day") {
  await page.goto("/");
  // BOOT_MS, not a hand-rolled 15 s: a SwiftShader boot here measures 11-33 s (2026-09-01).
  await page.waitForFunction(() => window.__apex?.race, null, { polling: 100, timeout: BOOT_MS });
  await page.evaluate(() => window.__apex.trackGeometry(true));
  await page.evaluate((tod) => window.__apex.race("zandvoort", tod, "dry"), timeOfDay);
  await page.waitForFunction(() => window.__apex.info().track === "zandvoort", null, { polling: 100, timeout: BOOT_MS });
  // Props, not a fixed settle: the model diagnostics below need the props mesh.
  await page.waitForFunction(() => {
    const g = window.__apex.trackGeometry();
    return !!(g && g.props && g.props.pos && g.props.pos.length > 1000);
  }, null, { polling: 100, timeout: BOOT_MS });
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
        "zandvoort-ferris-wheel",
        "zandvoort-lighthouse",
        "zandvoort-watertoren",
      ]);
    expect(result.walls.anyNaN).toBe(false);
    expect(result.walls.minOverHw).toBeGreaterThan(-1.5);
    expect(result.walls.tightFrac).toBeGreaterThan(0.55);

    // Prop and terrain clearance live in props-over-road.spec.js and
    // terrain-over-road.spec.js (both cover zandvoort); not re-scanned here.

    // AWAIT THE NIGHT BUILD. This called __apex.race() un-awaited and read the
    // diagnostics on the next line, so every assertion below measured the DAY
    // build that was already loaded — the night manifest was never checked.
    // Same defect, same circuit family: redbull-foundation.spec.js's AWAIT THE RACE note records
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
