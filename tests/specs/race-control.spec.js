// @ts-check
/**
 * RACE CONTROL, in a real page — only the parts that need one.
 *
 * The state machine itself (thresholds, hysteresis, the time caps, the
 * drop-on-disable rule, the leader's-lap rule behind OVERTAKE, host-vs-guest)
 * is tested in tests/unit/race-control.test.mjs, which loads js/race/race-control.js
 * in a VM and hands it the hazard picture directly. That runs in milliseconds
 * and can assert things a browser cannot reach without staging debris badly.
 *
 * The first version of this file tried to do it all here and was WRONG about
 * the page: it injected a host flag with __apex.netPeerEvent into a
 * single-player session and expected it to stick. NetPlay.ownsRaceControl() is
 * `!active || role === "host"`, so a lone page OWNS race control and recomputes
 * the flag every frame, clearing anything injected. Only a real loopback
 * session exercises the guest path, and tests/specs/multiplayer-session.spec.js
 * already does. Kept in the header because the failure looked like a bug in the
 * feature and was a bug in the test.
 *
 * What is left here is what only an end-to-end page can answer: that the wiring
 * exists at all, and that the setting survives a reload.
 */
import { test, expect, BOOT_MS } from "../helpers/fixtures.js";

test.describe("race control in a page", () => {
  test("the layer is ON by default and reports a coherent GREEN", async ({ loadTrack, page }) => {
    // These assertions inspect state, never pixels. Stop software rendering
    // before building the race and before this worker creates its next context.
    await loadTrack("monza", "day", "dry", { headless: true });
    const c = await page.evaluate(() => window.__apex.caution());
    expect(c.enabled).toBe(true);
    expect(c.level).toBe(0);
    expect(c.label).toBe("GREEN");
    expect(c.sector).toBe(-1);
    expect(c.sectors).toHaveLength(3);
  });

  test("the setting survives a reload", async ({ page }) => {
    // This is the guard on the STORAGE FORMAT, and it is the reason it is here
    // rather than in the unit suite. The flag was written as the raw strings
    // "1"/"0" by a direct localStorage call; routing it through GameStore
    // JSON-parses those to the NUMBERS 1 and 0, so a naive `!== false` reads a
    // stored 0 as truthy and quietly switches cautions back on for every player
    // who had turned them off. Only a real round trip through a real
    // localStorage catches that.
    //
    // TWO BOOTS, NOT THREE. A boot costs 30-60 s here and this test spent all
    // three: it passed at 170.4 s and TIMED OUT on the very next run, which is
    // not a flake to re-run but a test living inside its own budget. The third
    // boot only re-checked the `true` direction — which is the loader's
    // DEFAULT (`!(saved === false || saved === 0 || saved === "0")`), so it
    // tested the fallback, not the format. The write side of both directions is
    // asserted at the store instead, where it costs nothing.
    await page.goto("/");
    // BOOT_MS, not a hand-rolled 10 s: a SwiftShader boot here measures 11-33 s (2026-09-01).
    await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
    // The WRITE, through the real setter, then the raw bytes the loader will
    // read: GameStore JSON-encodes, so the falsy triple has to be looking at
    // the string "false" and not at "0" or "".
    expect(await page.evaluate(() => {
      window.__apex.headless(true);
      window.__apex.caution(false);
      return localStorage.getItem("apex26.caution");
    })).toBe("false");

    // …and THE ROUND TRIP, on the direction the defect was in: a real boot
    // reading a real localStorage, which is why this test is here and not in
    // the unit suite.
    await page.reload();
    await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
    expect(await page.evaluate(() => {
      window.__apex.headless(true);
      return window.__apex.caution().enabled;
    })).toBe(false);

    // …and back, so the spec leaves no state behind for whatever runs next in
    // this worker's storage origin. Asserted at the store, not through a boot.
    expect(await page.evaluate(() => {
      window.__apex.caution(true);
      return localStorage.getItem("apex26.caution");
    })).toBe("true");
  });

  test("hazards are reported alongside the state on request", async ({ loadTrack, page }) => {
    // These assertions inspect state, never pixels. Stop software rendering
    // before building the race and before this worker creates its next context.
    await loadTrack("monza", "day", "dry", { headless: true });
    const h = await page.evaluate(() => window.__apex.caution({ hazards: true }));
    expect(h).toHaveProperty("hazards");
    expect(h.hazards).toHaveProperty("total");
    // The picture the machine consumes must be PER-SECTOR as well as total: the
    // local YELLOW level is decided from the worst single sector, and a machine
    // reading only the total would fly green through a sector full of debris.
    expect(h.hazards).toHaveProperty("worst");
    expect(h.hazards).toHaveProperty("sectors");
  });
});
