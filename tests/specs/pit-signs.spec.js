// Pit bay signs, live: the atlas is painted, the texMesh uploaded, and ONE
// decal draw per frame puts every team's crest on its bay's fascia. The
// numbers are tests/unit/pit-signs.test.mjs's; this is the boot evidence that
// the painter, the upload and the draw run on the real renderer.
//
// COST: one track build on Albert Park (the corridor complex), a few frames.
import { test, expect, BOOT_MS, TRACK_MS, awaitTrackBuild } from "../helpers/fixtures.js";

test.describe("pit signs", () => {
  test("every bay wears its team's sign as one decal, and meshToggle hides it", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
    await page.evaluate(() => window.__apex.race("albert_park", "day", "dry", { laps: 3 }));
    await awaitTrackBuild(page);
    const s0 = await page.evaluate(() => window.__apex.pitSigns());
    expect(s0.cells).toBe(12);
    expect(s0.mesh).toBe(true);
    expect(s0.tex).toBe(true);
    // The grid is inside the row's 350 m gate: the decal draws every frame.
    await page.waitForFunction(() => window.__apex.pitSigns().drawn >= 2, null, { polling: 100, timeout: TRACK_MS });
    // Hidden, it stops: three more frames ASK for the draw and none lands.
    const h = await page.evaluate(() => { window.__apex.meshToggle({ pitSigns: true }); return window.__apex.pitSigns(); });
    await page.waitForFunction((c) => window.__apex.pitSigns().calls >= c + 3, h.calls, { polling: 100, timeout: TRACK_MS });
    const d2 = await page.evaluate(() => window.__apex.pitSigns().drawn);
    expect(d2).toBe(h.drawn);
    await page.evaluate(() => window.__apex.clearMeshes());
    await page.waitForFunction((d) => window.__apex.pitSigns().drawn > d, d2, { polling: 100, timeout: TRACK_MS });
  });
});
