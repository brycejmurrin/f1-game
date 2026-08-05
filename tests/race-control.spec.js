// @ts-check
/**
 * RACE CONTROL — the caution flag contract, pinned BEFORE the extraction moves it.
 *
 * The flag state machine (green / local yellow / VSC / safety car) had exactly
 * one assertion anywhere in the suite before this file: multiplayer-session.spec.js
 * checks that a guest adopts a host's flag. Everything else about it — that the
 * layer defaults ON, that switching it off DROPS a flag already flying, that the
 * setting survives a reload, that the level→label table is right — was prose in
 * a comment and nothing more.
 *
 * That is the wrong shape for code about to be moved into js/game/racecontrol.js.
 * This is a characterization test in the Feathers sense: written against the
 * behaviour as it is, so the extraction is verified rather than hoped for.
 *
 * Deliberately NOT tested here: the hysteresis thresholds themselves
 * (CAUTION_MIN_HOLD, the per-level time caps). Driving those needs real settled
 * DebrisWorld hazards on the racing surface, which is tests/debris.spec.js's
 * territory; asserting them from here would mean staging debris badly and
 * getting a flaky test that pins the staging rather than the rule.
 */
import { test, expect } from "./fixtures.js";

test.describe("race control", () => {
  test("the layer is ON by default and reports a coherent GREEN", async ({ loadTrack, page }) => {
    await loadTrack("monza");
    const c = await page.evaluate(() => window.__apex.caution());
    expect(c.enabled).toBe(true);
    expect(c.level).toBe(0);
    expect(c.label).toBe("GREEN");
    expect(c.sector).toBe(-1);
    expect(Array.isArray(c.sectors)).toBe(true);
    expect(c.sectors).toHaveLength(3);
  });

  test("a host's flag is adopted verbatim, label included", async ({ loadTrack, page }) => {
    await loadTrack("monza");
    const r = await page.evaluate(() => {
      window.__apex.netPeerEvent("caution",
        { level: 3, sector: 2, frac: 0.4, cause: "SAFETY CAR", total: 11, sectors: [1, 2, 8] }, 1000);
      return window.__apex.caution();
    });
    expect(r.level).toBe(3);
    expect(r.label).toBe("SAFETY CAR");
    expect(r.sector).toBe(2);
    expect(r.cause).toBe("SAFETY CAR");
    expect(r.total).toBe(11);
    expect(r.sectors).toEqual([1, 2, 8]);
  });

  test("switching the layer OFF drops a flag that is already flying", async ({ loadTrack, page }) => {
    // The rule with the most reason to break in a refactor: it is not "stop
    // computing", it is "stop computing AND clear". Without the clear, the HUD
    // keeps showing a safety car that nothing is maintaining any more — which
    // looks exactly like a stuck flag rather than a disabled feature.
    await loadTrack("monza");
    const r = await page.evaluate(() => {
      window.__apex.netPeerEvent("caution", { level: 2, sector: 1, frac: 0.4, cause: "VSC", total: 7 }, 1000);
      const flying = window.__apex.caution();
      const off = window.__apex.caution(false);
      return { flying, off };
    });
    expect(r.flying.level).toBe(2);
    expect(r.off.enabled).toBe(false);
    expect(r.off.level).toBe(0);
    expect(r.off.label).toBe("GREEN");
  });

  test("switching it back ON does not resurrect the old flag", async ({ loadTrack, page }) => {
    await loadTrack("monza");
    const back = await page.evaluate(() => {
      window.__apex.netPeerEvent("caution", { level: 2, sector: 1, frac: 0.4, cause: "VSC", total: 7 }, 1000);
      window.__apex.caution(false);
      return window.__apex.caution(true);
    });
    expect(back.enabled).toBe(true);
    expect(back.level).toBe(0);
  });

  test("the setting survives a reload", async ({ page }) => {
    // This is also the guard on the STORAGE FORMAT. The flag was written as the
    // raw strings "1"/"0" by a direct localStorage call; anything that routes it
    // through GameStore JSON-parses those to the NUMBERS 1 and 0, so a naive
    // `!== false` check reads a stored 0 as truthy and quietly switches cautions
    // back on for every player who had turned them off. A round trip catches
    // that; reading the accessor in one session does not.
    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null, { timeout: 10000 });
    await page.evaluate(() => window.__apex.caution(false));

    await page.reload();
    await page.waitForFunction(() => window.__apex != null, { timeout: 10000 });
    const after = await page.evaluate(() => window.__apex.caution());
    expect(after.enabled).toBe(false);

    // …and back, so the spec leaves no state behind for whatever runs next in
    // this worker's storage origin.
    await page.evaluate(() => window.__apex.caution(true));
    await page.reload();
    await page.waitForFunction(() => window.__apex != null, { timeout: 10000 });
    expect(await page.evaluate(() => window.__apex.caution().enabled)).toBe(true);
  });

  test("hazards are reported alongside the state on request", async ({ loadTrack, page }) => {
    await loadTrack("monza");
    const h = await page.evaluate(() => window.__apex.caution({ hazards: true }));
    expect(h).toHaveProperty("hazards");
    expect(h.hazards).toHaveProperty("total");
    expect(h.hazards).toHaveProperty("sectors");
    // The picture the state machine consumes must be per-sector — the local
    // YELLOW level is decided from the WORST single sector, not from the total.
    expect(h.hazards).toHaveProperty("worst");
  });
});
