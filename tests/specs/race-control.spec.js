// @ts-check
/**
 * RACE CONTROL, in a real page — only the parts that need one.
 *
 * The state machine itself (thresholds, hysteresis, the time caps, the
 * drop-on-disable rule, the leader's-lap rule behind OVERTAKE, host-vs-guest)
 * is tested in tests/unit/race-control.test.mjs, which loads js/game/racecontrol.js
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
import { test, expect } from "../helpers/fixtures.js";

test.describe("race control in a page", () => {
  test("the layer is ON by default and reports a coherent GREEN", async ({ loadTrack, page }) => {
    await loadTrack("monza");
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
    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: 10000 });
    await page.evaluate(() => window.__apex.caution(false));

    await page.reload();
    await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: 10000 });
    expect(await page.evaluate(() => window.__apex.caution().enabled)).toBe(false);

    // …and back, so the spec leaves no state behind for whatever runs next in
    // this worker's storage origin.
    await page.evaluate(() => window.__apex.caution(true));
    await page.reload();
    await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: 10000 });
    expect(await page.evaluate(() => window.__apex.caution().enabled)).toBe(true);
  });

  test("hazards are reported alongside the state on request", async ({ loadTrack, page }) => {
    await loadTrack("monza");
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
