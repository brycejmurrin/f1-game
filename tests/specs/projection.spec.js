// @ts-check
// Phase-1 of the physics redesign: verify the world<->track projection.
//
// The archived migration plan (physics-redesign) moves the car physics into
// Cartesian world space and DERIVES the arc-length s + lateral offset by
// projecting the world position onto the centreline spline. Before switching any
// physics over, this proves Tracks.project() is the faithful inverse of the
// renderer's (s, lateral) -> world mapping: take a known (s, lat), build the
// world point, project it back, and the recovered (s, lat) must match.
// Imports from ./fixtures.js, NOT from @playwright/test, so a failure attaches
// apex-state / apex-logs / page-console — a bare "expected 43 to be greater than
// 50" arrives with the car's state and the retained log ring beside it.
import { test, expect, BOOT_MS } from "../helpers/fixtures.js";

async function startLiveRace(page) {
  await page.goto("/");
  await page.locator("#mb-race").click();
  await page.locator("#sel-go").click();
  await page.locator("#rs-go").click();
  // BOOT_MS, not a hand-rolled 10 s: a SwiftShader boot here measures 11-33 s (2026-09-01).
  await page.waitForFunction(
    () => window.__apex && window.__apex.info().track != null,
    null, { polling: 100, timeout: BOOT_MS }
  );
  await page.evaluate(() => window.__apex.go());
}

test.describe("Apex 26 — world<->track projection", () => {
  // DECLARE THE BUDGET. All three tests start a LIVE race through the real menus
  // (RACE → GO → RACE!) and then evaluate hundreds of projections: 116-125 s
  // for the first test on a CI runner, and the next could not even get a
  // browser context inside the 180 s gate once the first had run (Pages #2048,
  // both attempts). Silent, this spec was billed at the change-aware gate's
  // 180 s rate; declared, tools/ci/select-specs.mjs excludes it by name and it
  // runs in the `driving` group.
  test.setTimeout(300_000);
  test("round-trips (s, lateral) all around the lap and across the width", async ({ page }) => {
    await startLiveRace(page);
    const fracs = [0, 0.07, 0.18, 0.26, 0.33, 0.41, 0.5, 0.62, 0.74, 0.83, 0.91, 0.97];
    const lats = [-6, -3, -1, 0, 1, 3, 6];
    let worstS = 0, worstLat = 0;
    for (const frac of fracs) {
      for (const lat of lats) {
        const r = await page.evaluate(
          (a) => window.__apex.projTest(a.frac, a.lat),
          { frac, lat }
        );
        expect(r).not.toBeNull();
        worstS = Math.max(worstS, Math.abs(r.err.s));
        worstLat = Math.max(worstLat, Math.abs(r.err.lat));
      }
    }
    // Centreline nodes are ~4 m apart; projecting onto the straight-segment
    // polyline of a curved spline introduces at most a small fraction of that.
    expect(worstS).toBeLessThan(2.0);     // metres of arc-length error
    expect(worstLat).toBeLessThan(0.5);   // metres of lateral error
  });

  test("a point on the centreline projects to lateral ~0", async ({ page }) => {
    await startLiveRace(page);
    for (const frac of [0.1, 0.35, 0.6, 0.85]) {
      const r = await page.evaluate((f) => window.__apex.projTest(f, 0), frac);
      expect(Math.abs(r.got.lat)).toBeLessThan(0.25);
      expect(r.got.dist).toBeLessThan(0.5);
    }
  });

  test("lateral sign matches the +right convention", async ({ page }) => {
    await startLiveRace(page);
    // +lateral is to the right of the centreline; project must recover a +lat.
    const right = await page.evaluate(() => window.__apex.projTest(0.3, 5));
    const left = await page.evaluate(() => window.__apex.projTest(0.3, -5));
    expect(right.got.lat).toBeGreaterThan(3.5);
    expect(left.got.lat).toBeLessThan(-3.5);
  });
});
