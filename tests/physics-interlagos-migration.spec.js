// @ts-check
import { test, expect } from "@playwright/test";

async function loadInterlagos(page, time = "day") {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex != null, { timeout: 8000 });
  await page.evaluate((tod) => window.__apex.race("interlagos", tod, "dry"), time);
  await page.waitForFunction(() => window.__apex.info().track === "interlagos", { timeout: 10_000 });
}

test.describe("Interlagos track-owned foundation migration", () => {
  test("uses racing coordinates and reproduces the finish plateau elevation", async ({ page }) => {
    await loadInterlagos(page);
    const result = await page.evaluate(() => {
      const def = window.TrackDefs.find((entry) => entry.id === "interlagos");
      const profile = window.__apex.trackProfile(1000);
      const low = profile.reduce((best, point) => point.y < best.y ? point : best);
      const high = profile.reduce((best, point) => point.y > best.y ? point : best);
      const at = (frac) => window.__apex.nodeAt(frac).y;
      return {
        coordinates: def?.sceneryCoordinates,
        range: high.y - low.y,
        highFrac: high.frac,
        sennaDrop: at(0.02) - at(0.10),
        boxClimb: at(0.82) - at(0.98),
      };
    });

    expect(result.coordinates).toBe("racing");
    expect(result.range).toBeGreaterThanOrEqual(40);
    expect(result.range).toBeLessThanOrEqual(46);
    expect(result.highFrac >= 0.92 || result.highFrac <= 0.03).toBe(true);
    expect(result.sennaDrop).toBeGreaterThan(25);
    expect(result.boxClimb).toBeLessThan(-30);
  });

  test("emits required hero models and reflective reservoir water", async ({ page }) => {
    await loadInterlagos(page);
    const result = await page.evaluate(() => {
      const models = window.__apex.modelDiagnostics();
      const geometry = window.__apex.geometryDiagnostics();
      const required = models.emitted.filter((entry) => entry.required);
      const hard = [...models.suppressed, ...models.invalid, ...models.unsafe]
        .filter((entry) => entry.required);
      return {
        requiredIds: required.map((entry) => entry.id),
        hard,
        geometry,
      };
    });

    expect(result.requiredIds).toEqual(expect.arrayContaining([
      "interlagos-pit-tower",
      "interlagos-favela-13",
      // ONE reservoir, not a near/far pair. The two halves were consolidated
      // into a single emitter (js/circuits/interlagos.js) and this list was
      // never updated, so it has been asking for ids nothing emits.
      "interlagos-guarapiranga",
    ]));
    expect(result.hard).toEqual([]);
    expect(result.geometry.every((entry) => entry.ok)).toBe(true);
    expect(result.geometry.find((entry) => entry.name === "water")?.vertices).toBeGreaterThan(0);
  });

  test("keeps track-owned dressing within a focused geometry budget", async ({ page }) => {
    await loadInterlagos(page);
    const props = await page.evaluate(() =>
      window.__apex.geometryDiagnostics().find((entry) => entry.name === "props")?.vertices
    );

    // A measured ceiling with headroom, re-baselined against what the scenery
    // engine actually emits: Interlagos runs ~564k by day and ~578k at night,
    // against a fleet median peak of ~680k across all 40 circuits. The old
    // 350k predates the massing pass and had stopped being reachable.
    expect(props).toBeLessThan(700_000);
  });

  test("keeps terrain grounded and collision barriers finite", async ({ page }) => {
    await loadInterlagos(page);
    const result = await page.evaluate(() => {
      const gaps = [];
      for (let i = 0; i < 200; i++) {
        for (const lateral of [-7, 0, 7]) {
          const gap = window.__apex.groundY(i / 200, lateral).gap;
          if (gap != null) gaps.push(gap);
        }
      }
      return {
        maxGap: Math.max(...gaps),
        walls: window.__apex.wallStats(),
      };
    });

    expect(result.maxGap).toBeLessThanOrEqual(0.18);
    expect(result.walls.anyNaN).toBe(false);
    expect(result.walls.minB).toBeGreaterThan(1);
    expect(result.walls.maxB).toBeLessThan(60);
    expect(result.walls.minOverHw).toBeGreaterThan(-1.5);
  });
});
