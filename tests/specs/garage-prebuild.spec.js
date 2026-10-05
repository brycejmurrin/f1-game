// @ts-check
// The GARAGE pre-built while the title idles (js/garage/prebuild.js). Tapping
// GARAGE from the title used to build the room, the car and their programs on
// the tap — 1.3-1.8 s of frozen screen under SwiftShader. The title now builds
// them behind the menu's idle gate; this asserts the live page reaches `ready`,
// keeps the six-slot preview LRU bounded, and that the next GARAGE visit is
// reported as prebuilt with its tap-to-first-frame time
// (__apex.garagePrebuild().firstFrame). The gate's logic is VM-tested in
// tests/unit/garage-prebuild.test.mjs. UNVERIFIED IN A BROWSER when written.
import { sharedTest as test, expect } from "../helpers/fixtures.js";
import { toMenu } from "../helpers/shared-page.js";

test.describe("garage prebuild on the title", () => {
  test.use({ viewport: { width: 844, height: 390 } });

  test("the idle title pre-builds the garage and GARAGE opens on it", async ({ page }) => {
    await toMenu(page);
    // HERMETIC on a shared page: an earlier spec (garage-aero) may have opened
    // the garage mid-prewarm, leaving a superseded run and a readiness that
    // predates this test. garagePrewarm(true) re-arms — readiness and `last`
    // are forgotten — so everything below is THIS test's own cycle.
    await page.evaluate(() => window.__apex.garagePrewarm(true));
    // Wall-clock polling: rAF polling never fires under SwiftShader (docs/TESTING.md).
    await page.waitForFunction(() => {
      const s = window.__apex.garagePrebuild();
      return !!(s && s.ready && s.last && s.last.result === "ready");
    }, null, { polling: 100, timeout: 90_000 });
    const before = await page.evaluate(() => window.__apex.garagePrebuild());
    expect(before.enabled).toBe(true);
    expect(before.previewMeshes, "the preview LRU never grows past its six slots").toBeLessThanOrEqual(6);
    // garageReady = the setup garage DREW (programs compiled); a circuit or garage
    // Home's frameless plan only preps the car/room, so race settings still draws.
    expect(before.garageReady, "marked drawn exactly when the plan drew frames").toBe(!!before.last.frames);
    expect(before.garageReady || before.prepped).toBe(true);
    expect(before.last.result).toBe("ready");
    const visit = before.firstFrame ? before.firstFrame.visit : 0;

    await page.evaluate(() => {
      const b = document.getElementById("mb-garage");
      if (!b) throw new Error("garage-prebuild: missing #mb-garage");
      b.click();
    });
    await page.waitForFunction((v) => {
      const s = window.__apex.garagePrebuild();
      return !!(s && s.firstFrame && s.firstFrame.visit > v);
    }, visit, { polling: 100, timeout: 60_000 });
    const ff = await page.evaluate(() => window.__apex.garagePrebuild().firstFrame);
    expect(ff.from).toBe("menu");
    expect(ff.prebuilt, "the tap found the garage built").toBe(true);
    expect(ff.tapMs).toBeGreaterThanOrEqual(0);
    await toMenu(page);
  });
});
