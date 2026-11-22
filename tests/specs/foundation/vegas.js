// @ts-check
// vegas's foundation cases, moved verbatim from the former per-circuit vegas-foundation spec (TK2-17, #3039).
// Registered by tests/specs/circuit-foundation.spec.js, which narrows by APEX_CIRCUITS; this
// file's name IS the circuit id (tools/ci/select-specs.mjs routes an edit here to that circuit).
import { test, expect } from "@playwright/test";
import { BOOT_MS } from "../../helpers/fixtures.js";

const LANDSCAPE = { width: 844, height: 390 };

async function loadVegas(page, time = "night") {
  await page.goto("/");
  // BOOT_MS, not a hand-rolled 15 s: a SwiftShader boot here measures 11-33 s (2026-09-01).
  await page.waitForFunction(() => window.__apex?.race, null, { polling: 100, timeout: BOOT_MS });
  await page.evaluate((tod) => window.__apex.race("vegas", tod, "dry"), time);
  await page.waitForFunction(() => window.__apex.info().track === "vegas", null, { polling: 100, timeout: BOOT_MS });
}

export default function register() {
  test.describe("Las Vegas track foundation migration", () => {
    test.use({ viewport: LANDSCAPE });
    test.setTimeout(360_000);

    test("uses racing coordinates and climbs from the Sphere to the end of the Strip", async ({ page }) => {
      await loadVegas(page);
      const result = await page.evaluate(() => {
        const def = Tracks.LIST.find((track) => track.id === "vegas");
        const profile = window.__apex.trackProfile(500);
        const low = profile.reduce((a, b) => a.y < b.y ? a : b);
        const high = profile.reduce((a, b) => a.y > b.y ? a : b);
        return {
          coordinates: def.sceneryCoordinates,
          terrainOuter: def.terrainOuter,
          barrierGap: def.barrierGap,
          exclusions: def.dressingExclusions,
          relief: high.y - low.y,
          lowFrac: low.frac,
          highFrac: high.frac,
        };
      });

      expect(result.coordinates).toBe("racing");
      expect(result.terrainOuter).toBe(26);
      expect(result.barrierGap).toBe(1);
      expect(result.exclusions).toEqual(expect.arrayContaining([
        expect.objectContaining({ kinds: ["city", "foliage"], s0: 0.36, s1: 0.47 }),
      ]));
      // The 48 USGS samples span 16.28 m. Russell's 2024 pole lap spans 16.30 m.
      expect(result.relief).toBeGreaterThan(15.8);
      expect(result.relief).toBeLessThan(16.8);
      // The low point is at the Sphere sector; the high point is near T14 on the Strip.
      expect(result.lowFrac).toBeGreaterThan(0.32);
      expect(result.lowFrac).toBeLessThan(0.38);
      expect(result.highFrac).toBeGreaterThan(0.80);
      expect(result.highFrac).toBeLessThan(0.86);
    });

    test("emits required landmarks, typed water, and safe overhead spans", async ({ page }) => {
      for (const time of ["day", "night"]) {
        await loadVegas(page, time);
        const result = await page.evaluate(() => ({
          geometry: window.__apex.geometryDiagnostics(),
          models: window.__apex.modelDiagnostics(),
        }));

        expect(result.geometry.every((entry) => entry.ok), `${time} geometry`).toBe(true);
        const hard = [
          ...result.models.suppressed,
          ...result.models.invalid,
          ...result.models.unsafe,
        ].filter((entry) => entry.required);
        expect(hard, `${time} required models`).toEqual([]);

        const emitted = new Map(result.models.emitted.map((entry) => [entry.id, entry]));
        // The Bellagio lake is TWO basins now, not one. js/circuits/vegas.js widened
        // the frontage to the real ~300 m and replaced the single 110x44 m patch with
        // overlapping east/west basins, because one box that long would risk clipping
        // the T13 apex the road carries through this stretch. Measured on the current
        // build at BOTH times of day: emitted = vegas-bellagio-lake-east (required,
        // water) + vegas-bellagio-lake-west (water), suppressed/invalid/unsafe all
        // empty. No model emits the old id "vegas-bellagio-lake" any more — this was
        // a rename, not a loss, which the `required` sweep above independently
        // confirms (the east basin is required, so a suppressed lake would fail there
        // first). Both ids are pinned so a future re-merge into one basin is caught.
        for (const id of [
          "vegas-sphere",
          "vegas-high-roller",
          "vegas-bellagio-lake-east",
          "vegas-bellagio-lake-west",
          "vegas-strip-gateway",
          "vegas-finish-halo",
        ]) {
          expect(emitted.has(id), `${time} ${id}`).toBe(true);
        }
        for (const id of ["vegas-bellagio-lake-east", "vegas-bellagio-lake-west"])
          expect(emitted.get(id).water, `${time} ${id} water`).toBe(true);
        for (const id of ["vegas-strip-gateway", "vegas-finish-halo"]) {
          expect(emitted.get(id).overhead).toBe(true);
          expect(emitted.get(id).clearance).toBeGreaterThanOrEqual(4.8);
        }
      }
    });

    test("keeps full-lap street walls tight and retains night lighting", async ({ page }) => {
      await loadVegas(page, "night");
      await page.waitForFunction(() => {
        const w = window.__apex.wallStats();
        const l = window.__apex.lightState();
        return !!(w && w.street && l && l.numLights > 0);
      }, null, { polling: 100, timeout: BOOT_MS });
      const result = await page.evaluate(() => ({
        walls: window.__apex.wallStats(),
        lights: window.__apex.lightState(),
        // lat +-12 m, not +-8: +-8 sits inside the carved road, where gap is null,
        // so both probes passed the null-tolerant loop below having measured nothing.
        edgeGaps: [-12, 12].map((lat) => window.__apex.groundY(0.35, lat).gap),
      }));

      expect(result.walls.anyNaN).toBe(false);
      expect(result.walls.street).toBe(true);
      expect(result.walls.tightFrac).toBeGreaterThan(0.98);
      expect(result.walls.minOverHw).toBeGreaterThan(-1.5);
      expect(result.walls.minOverHw).toBeLessThan(3);
      expect(result.lights.numLights).toBeGreaterThan(0);
      // Both probes must read terrain: they do (headless VM, 2026-11-10), at -0.88 / -0.90 m.
      expect(result.edgeGaps.filter((gap) => gap !== null)).toHaveLength(2);
      for (const gap of result.edgeGaps)
        expect(gap === null || gap <= 0.18).toBe(true);
    });
  });
}
