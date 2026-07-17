// @ts-check
/**
 * Shared Playwright fixtures for Apex 26.
 *
 * Importing `test` from here instead of `@playwright/test` gives every
 * test in that file two extras at zero per-test cost:
 *
 *   1. `page.addInitScript` — injects `window.__TEST_MODE = true` before
 *      any game script runs (safe to read in game.js for guards).
 *
 *   2. `context.route` mocks — all Jolpica + OpenF1 API calls return
 *      minimal stub JSON so tests run offline and results are deterministic.
 *
 * Usage:
 *   import { test, expect } from './fixtures.js';
 *   // then use test/expect exactly as normal
 */
import { test as base, expect } from "@playwright/test";

const JOLPICA_STUB = JSON.stringify({
  MRData: {
    RaceTable: { Races: [] },
    DriverTable: { Drivers: [] },
    ConstructorTable: { Constructors: [] },
    StandingsTable: { StandingsLists: [] },
  },
});
const OPENF1_STUB = JSON.stringify([]);

async function installMocks(context) {
  await context.addInitScript(() => {
    window.__TEST_MODE = true;
  });
  await context.route("https://api.jolpi.ca/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JOLPICA_STUB,
    })
  );
  await context.route("https://api.openf1.org/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: OPENF1_STUB,
    })
  );
}

export const test = base.extend({
  context: async ({ context }, use) => {
    await installMocks(context);
    await use(context);
  },

  /**
   * Collects all uncaught JS exceptions thrown by the page.
   * Tests can assert `expect(pageErrors).toHaveLength(0)` after exercising
   * game logic to confirm no silent JS errors occurred.
   *
   * @type {string[]}
   */
  pageErrors: async ({ page }, use) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await use(errors);
  },

  /**
   * Navigates to `/` and waits until `window.__apex` is available (up to
   * 10 s), then hands the loaded page to the test.  Saves the boilerplate
   * goto + waitForFunction block that every race-level test needs.
   */
  racePage: async ({ page }, use) => {
    await page.goto('/');
    await page.waitForFunction(() => window.__apex != null, { timeout: 10000 });
    await use(page);
  },

  /**
   * Returns `loadTrack(id, tod, wx)` — the race-setup block ~54 specs hand-roll:
   * goto → wait __apex → race(id,tod,wx) → wait track built → go(). Unifies the
   * drifted 8000/10000 ms timeouts and gives every caller the free pageErrors
   * guard + on-failure state dump. Call it once at the top of a test.
   *
   *   const { test, expect } = require('./fixtures.js');
   *   test('...', async ({ loadTrack, page }) => { await loadTrack('monza'); ... });
   */
  loadTrack: async ({ page }, use) => {
    await use(async (id = "monza", tod = "day", wx = "dry") => {
      await page.goto("/");
      await page.waitForFunction(() => window.__apex && window.__apex.race, { timeout: 10000 });
      await page.evaluate(({ i, t, w }) => window.__apex.race(i, t, w), { i: id, t: tod, w: wx });
      await page.waitForFunction(() => window.__apex.info().track != null, { timeout: 15000 });
      await page.evaluate(() => window.__apex.go());
      return page;
    });
  },
});

// On any failure, attach a compact __apex telemetry snapshot so live-reporter.js
// echoes WHY the car was where it was (physState + timing + lightState), turning a
// bare "expected X < Y" into an actionable dump. No cost on passing tests.
test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status === testInfo.expectedStatus) return;
  try {
    const snap = await page.evaluate(() => {
      const a = window.__apex; if (!a) return null;
      const pick = (fn) => { try { return fn(); } catch (_) { return undefined; } };
      return {
        phys: pick(() => a.physState && a.physState()),
        probe: pick(() => a.probe && a.probe()),
        timing: pick(() => a.timing && a.timing()),
        light: pick(() => a.lightState && a.lightState()),
        info: pick(() => a.info && a.info()),
      };
    });
    if (snap) await testInfo.attach("apex-state", { body: JSON.stringify(snap), contentType: "application/json" });
  } catch (_) { /* page may be closed / __apex absent — best-effort only */ }
});

export { expect };
