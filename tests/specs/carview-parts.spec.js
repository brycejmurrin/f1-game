// @ts-check
// The isolated car viewer exposes every parts category for manual audits.
//
// NOT ON sharedTest. sharedTest boots "/" once per worker; these tests load a
// DIFFERENT document (tools/carview.html), so a shared game page saves nothing
// here — every test would still navigate, and it would leave the shared page
// off the game for whoever ran next.
//
// But three of the four tests below load the SAME url (?team=mclaren), and each
// paid its own browser context for it. They now share one.
//
// BE PRECISE ABOUT WHY, because the obvious reason is the wrong one. Sharing
// the boot does NOT make this file faster: measured here on a quiet box
// (2026-09-10, loadavg 0.17) the whole file went 110.0 s -> 107.1 s, and the two
// tests that stopped navigating went 17.0 -> 17.2 s and 8.0 -> 12.4 s. The boots
// were never the cost. What costs is the FIRST test of a worker (69.3 s before,
// 61.9 s after) — browser launch and first-page compile under SwiftShader, paid
// once either way.
//
// What the sharing actually removes is two of this file's four newContext()
// calls, and that is the failure being targeted, exactly: on the shared Pages
// runner this file failed twice in a row (ci runs 3331 and 3337, "Selected
// specs") with one test burning 166 s and the NEXT one dying at 180 s INSIDE
// browser.newContext(), before a line of its body ran — then passing in 6.1 s on
// the replacement worker. The expensive test was a DIFFERENT one in each run and
// the file passes green locally, so nothing is attached to any one test: state
// accumulates in the worker until a fresh one clears it. Fewer contexts, fewer
// chances to hang creating one.
//
// This is a narrowing of exposure, NOT a proven fix — the failure does not
// reproduce here, so only CI can settle it. Two prior attempts (dd060507f,
// 3181ec29b) went at the frame waiters and did not hold; the waiters already
// carry { polling: 100 } and were never what accumulated.
import { test, expect } from "@playwright/test";
import { BOOT_MS } from "../helpers/fixtures.js";

/** @param {import("@playwright/test").Page} p */
async function awaitViewer(p) {
  // BOOT_MS, not a hand-rolled 15 s: a SwiftShader boot here measures 11-33 s
  // (2026-09-01), and the first test of a worker measures 62-69 s because it
  // also pays browser launch and first-page compile (2026-09-10).
  // Timer polling — default raf starves under SwiftShader and burns the whole
  // test budget before the declared timeout can ever fire (AGENTS.md).
  await p.waitForFunction(() => window.CARVIEW && window.CARVIEW.ready, null,
    { polling: 100, timeout: BOOT_MS });
}

// ONE BOOT, THREE TESTS. serial so they share the worker and stop at the first
// failure — a viewer that did not boot has nothing to say about its controls.
// Separate test() calls rather than one merged body: the failure still names
// which contract broke. ORDER IS LOAD-BEARING, and only in one direction — the
// two readers come first and the only mutator (effects) is last, so nothing
// asserts against state a previous test set.
test.describe.serial("car viewer, booted once at ?team=mclaren", () => {
  /** @type {import("@playwright/test").Page} */
  let page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await page.goto("/tools/carview.html?team=mclaren");
    await awaitViewer(page);
  });

  // Close the page rather than leaving it to worker teardown. Whether a lingering
  // SwiftShader context is what wedged newContext() on the runner is UNPROVEN —
  // it did not reproduce here — but releasing it explicitly costs nothing and is
  // the one thing this file controls.
  test.afterAll(async () => { if (page) await page.close(); });

  test("car viewer exposes controls for all twelve parts categories", async () => {
    for (const id of ["engine", "aero", "suspension", "brakes", "tyres", "ers",
                      "gearbox", "fuel", "exhaust", "floor", "cockpit", "wheels"]) {
      const select = page.locator("#ui-" + id);
      await expect(select).toBeVisible();
      expect(await select.locator("option").count()).toBeGreaterThanOrEqual(3);
    }
  });

  test("car viewer exposes controls for grounded runtime effect states", async () => {
    await expect(page.locator("#ui-exhaust-flame")).toBeVisible();
    await expect(page.locator("#ui-brake-glow")).toBeVisible();
    await expect(page.locator("#ui-ers-deploy")).toBeVisible();
  });

  test("car viewer effect API updates state on a synchronized frame", async () => {
    const before = await page.evaluate(() => window.CARVIEW.frame);
    const accepted = await page.evaluate(() => window.CARVIEW.set({
      effects: { exhaustFlame: true, brakeGlow: true, ersDeploy: false },
    }));
    expect(accepted).toBe(true);
    await page.waitForFunction((frame) => window.CARVIEW.frame > frame, before, {
      polling: 100, timeout: BOOT_MS,
    });
    expect(await page.evaluate(() => window.CARVIEW.effects)).toEqual({
      exhaustFlame: true,
      brakeGlow: true,
      ersDeploy: false,
      boostFlame: false,
    });
  });
});

// Its own boot: a different team AND a signature brake part, which is the point
// of the test — the frame sequence has to advance on a car built from non-default
// parts, not just the default mclaren the block above shares.
test("car viewer exposes a frame sequence that advances after state changes", async ({ page }) => {
  await page.goto("/tools/carview.html?team=ferrari&brakes=sig_ferrari_brembo");
  await awaitViewer(page);

  const before = await page.evaluate(() => window.CARVIEW.frame);
  expect(typeof before).toBe("number");
  await page.evaluate(() => window.CARVIEW.set({ az: 104, el: 10, dist: 3.2, look: 1.7 }));
  await page.waitForFunction((frame) => window.CARVIEW.frame > frame, before, {
    polling: 100, timeout: BOOT_MS,
  });
});
