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
});

export { expect };
