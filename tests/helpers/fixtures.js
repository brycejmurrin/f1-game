// @ts-check
/**
 * Shared Playwright fixtures for Apex 26.
 *
 * Importing `test` from here instead of `@playwright/test` gives every
 * test in that file these extras at zero per-test cost:
 *
 *   1. `page.addInitScript` — injects `window.__TEST_MODE = true` before
 *      any game script runs (safe to read in game.js for guards).
 *
 *   2. `context.route` mocks — all Jolpica + OpenF1 API calls return
 *      minimal stub JSON so tests run offline and results are deterministic.
 *
 *   3. Browser-console capture on every page in the context, attached to the
 *      report on failure — so a red test shows what the PAGE said, not only
 *      what the assertion said.
 *
 *   4. The `Log` ring buffer (js/log.js) attached on failure too. Console
 *      capture only sees what was PRINTED; the ring holds everything retained
 *      (default down to `info`), which is the half that used to be lost.
 *
 * Usage:
 *   import { test, expect } from './fixtures.js';
 *   // then use test/expect exactly as normal
 *
 * Turning diagnostics up for one run — the spec needs no change, because the
 * level is read from localStorage before any game script evaluates:
 *
 *   APEX_LOG=scenery:debug npm test -- tests/specs/props-over-road.spec.js
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

// APEX_LOG is a js/log.js level spec ("debug", "scenery:debug", "buffer:trace").
// It is written to localStorage rather than passed as a query param because the
// specs navigate to "/" themselves and would drop a query string.
const LOG_SPEC = process.env.APEX_LOG || "";

async function installMocks(context) {
  await context.addInitScript((spec) => {
    window.__TEST_MODE = true;
    if (spec) { try { localStorage.setItem("apex26.logLevel", spec); } catch (_) {} }
  }, LOG_SPEC);
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

// Console lines captured per test, keyed by the page they came from. A module
// map rather than a fixture value so the `context` fixture can start capturing
// before any test body runs, and the afterEach hook can still read it.
const consoleByPage = new WeakMap();

function captureConsole(page) {
  const lines = [];
  consoleByPage.set(page, lines);
  page.on("console", (m) => {
    // Favicon 404s are a static-server artefact, not the game talking.
    const text = m.text();
    if (/favicon/i.test(text)) return;
    lines.push(`${m.type()}: ${text}`);
    if (lines.length > 400) lines.shift();
  });
  page.on("pageerror", (e) => lines.push(`pageerror: ${e.message}`));
}

export const test = base.extend({
  context: async ({ context }, use) => {
    await installMocks(context);
    context.on("page", captureConsole);
    for (const p of context.pages()) captureConsole(p);
    await use(context);
  },

  /**
   * `string[]` — every console line and page error the page produced, newest
   * last, prefixed with its console type. Attached automatically on failure;
   * take it as a fixture when a test wants to ASSERT on it:
   *
   *   test('...', async ({ racePage, consoleLines }) => {
   *     expect(consoleLines.filter((l) => l.startsWith('error:'))).toEqual([]);
   *   });
   *
   * Prefer this over a hand-rolled `page.on("console", …)` — the hand-rolled
   * ones drifted into a dozen slightly different favicon filters.
   */
  consoleLines: async ({ page }, use) => {
    await use(consoleByPage.get(page) || []);
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
    await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: 10000 });
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
      await page.waitForFunction(() => window.__apex && window.__apex.race, null, { polling: 100, timeout: 10000 });
      await page.evaluate(({ i, t, w }) => window.__apex.race(i, t, w), { i: id, t: tod, w: wx });
      await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: 15000 });
      await page.evaluate(() => window.__apex.go());
      return page;
    });
  },
});

// On any failure, attach everything that explains it and nothing that does not:
//   apex-state    — physState + timing + lightState, so a bare "expected X < Y"
//                   becomes an actionable dump (live-reporter.js echoes it inline)
//   apex-logs     — the js/log.js ring buffer: retained diagnostics down to
//                   `info`, INCLUDING the ones that were never printed
//   page-console  — what the page actually said, in order
// All three are free on a passing test — they are only collected when red.
test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status === testInfo.expectedStatus) return;
  const lines = consoleByPage.get(page);
  if (lines && lines.length) {
    await testInfo.attach("page-console", {
      body: lines.slice(-120).join("\n"),
      contentType: "text/plain",
    }).catch(() => {});
  }
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

    const logs = await page.evaluate(() => {
      try { return (window.Log && window.Log.records({ limit: 80 })) || []; }
      catch (_) { return []; }
    });
    if (logs.length) {
      await testInfo.attach("apex-logs", {
        body: logs.map((r) => `${r.t}ms [${r.ns}] ${r.level}: ${r.msg}`).join("\n"),
        contentType: "text/plain",
      });
    }
  } catch (_) { /* page may be closed / __apex absent — best-effort only */ }
});

/* ─────────────────────────────────────────────────────────────────────────────
   sharedTest — ONE booted page per worker, reused by every test in the file.

   WHY. Measured on the camera group: 45 tests, 1985 s of test time, and the
   FASTEST test took 21.7 s. That floor is not assertion work — it is
   `page.goto("/")` plus ~155 script tags plus WebGL context creation, paid
   again for every single test. Across the suite that is 294 `goto("/")` calls
   in 98 spec files, and not one of them used beforeAll. In agent-view.spec.js
   alone — 117 tests, measured at ~43 min — roughly 40 of those minutes are the
   same page booting 117 times.

   WHY IT IS SAFE TO REUSE. `__apex.race(id)` is re-entrant against a live page:
   tests/specs/tracks-walls.spec.js has always raced its way through many circuits in
   ONE page without reloading, and the all-circuit sweeps do the same. The
   reload was never required — it was just the default `page` fixture's scope.

   WHEN NOT TO USE IT. Anything asserting FIRST-LOAD behaviour: the boot
   sequence itself, the service worker, the shell version guard, PWA install,
   `localStorage` migrations. Those want a virgin page — keep importing `test`.
   The opt-in is deliberate: this is not a silent change of meaning for 54
   existing spec files.

   WHAT IT RESETS between tests is deliberately SHALLOW — held input, headless
   mode, the frozen flag, open dialogs, log level. It does NOT try to rewind
   settings or `localStorage`: GameStore caches those in memory, so a truthful
   reset there means a reload, which is the cost being removed. A spec that
   needs a specific setting must set it, which is what `load()`-style helpers
   already do.
   ───────────────────────────────────────────────────────────────────────── */
export const sharedTest = test.extend({
  // Worker-scoped: created once, reused until the worker exits.
  _bootedPage: [async ({ browser }, use) => {
    const context = await browser.newContext();
    await installMocks(context);
    context.on("page", captureConsole);
    const page = await context.newPage();
    captureConsole(page);
    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: 15000 });
    await use(page);
    await context.close();
  }, { scope: "worker" }],

  page: async ({ _bootedPage, viewport }, use) => {
    if (viewport) await _bootedPage.setViewportSize(viewport);
    await _bootedPage.evaluate(() => {
      const a = window.__apex;
      // Best-effort per hook: a missing one must not fail the RESET, or one
      // renamed debug hook silently turns every later test in the file red.
      if (a) {
        try { a.clearInput(); } catch (_) {}
        try { a.headless(false); } catch (_) {}
        try { a.logLevel("warn"); } catch (_) {}
        // CAMERA STATE IS THE ONE THAT BIT. A raster/screenshot test reads
        // whatever camera the PREVIOUS test left: park() sets G.frozen, and
        // view()/orbit()/cinematic() install a G.dbgCam free-cam that outranks
        // the game camera. Measured: "the road dominates the lower frame"
        // wanted >0.7 and got 0.5, because an earlier camera test's free-cam
        // was still installed. camera("chase") clears dbgCam (apex.js:179) and
        // restores the default mode in one call.
        try { a.freeze(false); } catch (_) {}
        try { a.camera("chase"); } catch (_) {}
      }
      try {
        document.querySelectorAll("dialog[open]").forEach((d) => d.close());
      } catch (_) {}
    });
    await use(_bootedPage);
  },

  // The two loader fixtures re-declared against the shared page. Without these
  // a spec that switches to sharedTest would still pay a goto("/") per test
  // through the INHERITED versions, which is the whole cost being removed —
  // and logging.spec.js and friends reach the app only through loadTrack, so
  // they could not opt in at all.
  racePage: async ({ page }, use) => {
    await ensureLive(page);
    await use(page);
  },

  loadTrack: async ({ page }, use) => {
    await use(async (id = "monza", tod = "day", wx = "dry") => {
      await ensureLive(page);
      await page.evaluate(({ i, t, w }) => window.__apex.race(i, t, w), { i: id, t: tod, w: wx });
      await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: 15000 });
      await page.evaluate(() => window.__apex.go());
    });
  },
});

/** Navigate only if the app is not already live on the shared page. */
async function ensureLive(page) {
  const live = await page.evaluate(() => window.__apex != null).catch(() => false);
  if (live) return;
  await page.goto("/");
  await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: 15000 });
}

export { expect };
