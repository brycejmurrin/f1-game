// @ts-check
/**
 * BOOT_MS / TRACK_MS — how long the page ACTUALLY takes on this class of box,
 * not a number chosen for a developer laptop.
 *
 * MEASURED on an idle container (loadavg 0.00), three cold boots,
 * scratch/perf/boot-budget.mjs:
 *
 *   window.__apex != null        12.3 / 23.6 / 24.6 s   worst 24.6
 *   info().track != null         15.1 / 16.2 / 16.9 s   worst 16.9
 *
 * The budgets scattered through these helpers were 8000, 10000 and 15000 —
 * every one of them BELOW the idle-box worst case, so the specs that boot
 * through them could not pass here at all, loaded or not. That is what 15 of
 * the 32 `webgl` group tests were failing on. 45 s is ~1.8x the worst idle
 * boot, which is the margin a loaded group run needs; the specs' own 120 s
 * test timeout is still the backstop, and a genuine hang still fails.
 *
 * These are BOOT budgets. Do not reach for them to paper over a slow
 * assertion — measure that one and give it its own number, as the room
 * screen-swap waits got.
 */
export const BOOT_MS = 45000;
// Still the budget for specs that wait for a track build THEMSELVES
// (webgl-probes, lighting-ab, lighting-tuner-grade, image-grade-visual). The
// loadTrack fixture no longer uses it — see awaitTrackBuild below, which those
// specs should move to whenever one of them next goes red on a slow box.
export const TRACK_MS = 45000;

import { TRACK_STALL_MS, awaitTrackBuild } from "./await-track-build.js";
export { TRACK_STALL_MS, awaitTrackBuild };

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
 *   4. The `Log` ring buffer (js/core/log.js) attached on failure too. Console
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

// APEX_LOG is a js/core/log.js level spec ("debug", "scenery:debug", "buffer:trace").
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
    await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
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
    await use(async (id = "monza", tod = "day", wx = "dry", opts = {}) => {
      await page.goto("/");
      await page.waitForFunction(() => window.__apex && window.__apex.race, null, { polling: 100, timeout: BOOT_MS });
      // `headless: true` stops render() BEFORE the build and the countdown. A
      // SwiftShader frame holds the main thread for seconds, and every
      // page.evaluate round trip below — awaitTrackBuild polls at 100 ms — waits
      // on that thread (docs/TESTING.md, "A Playwright click costs 80-113 s while
      // the game renders"). A spec that reads hooks and never a pixel has no use
      // for those frames; on a 2-core CI runner they were the whole 120 s budget
      // (physics-hotpath, run 2048, twice). Opt-in, because ~54 callers include
      // the ones whose subject IS the frame.
      if (opts.headless) await page.evaluate(() => window.__apex.headless(true));
      await page.evaluate(({ i, t, w }) => window.__apex.race(i, t, w), { i: id, t: tod, w: wx });
      await awaitTrackBuild(page);
      await page.evaluate(() => window.__apex.go());
      return page;
    });
  },
});

// On any failure, attach everything that explains it and nothing that does not:
//   apex-state    — physState + timing + lightState, so a bare "expected X < Y"
//                   becomes an actionable dump (live-reporter.js echoes it inline)
//   apex-logs     — the js/core/log.js ring buffer: retained diagnostics down to
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

// STOP RASTERISING BEFORE THE CONTEXT GOES AWAY. Registered AFTER the capture
// above on purpose: hooks run in registration order, so a failing test still
// snapshots a live page, and only then does the page go quiet.
//
// THE FAILURE THIS TARGETS. On the shared CI runner a worker runs one heavy
// browser test, and the NEXT test dies in `browser.newContext()` having never
// entered its body: "Test timeout of 180000ms exceeded while setting up
// context", at exactly the cap. A replacement worker — i.e. a new BROWSER —
// then runs the same kind of test in seconds. Seen on race-control,
// telemetry-compare and carview-parts, which share no fixture and no subject;
// two of them import raw @playwright/test, whose context fixture is nothing but
// browser.newContext(), so the stall is browser-side, not ours.
//
// WHY THIS SHOULD HELP, stated as the guess it is. LAUNCH sets
// --disable-renderer-backgrounding and --disable-background-timer-throttling
// (playwright.config.js), which switch OFF the throttling Chromium would
// otherwise apply to a page nobody is looking at. A game page rAFs forever, and
// SwiftShader rasterises on the CPU, so a renderer that outlives its test keeps
// a core busy at full rate while the next newContext() is trying to start one.
// __apex.headless(true) stops render(), so the page is idle before teardown.
// The config's own measured lesson is that CPU headroom is the lever, not the
// frame rate — this frees headroom rather than changing any clock.
//
// NOT PROVEN: the stall does not reproduce on a quiet box, so only CI can say.
// Best-effort by construction too — a closed page, a missing hook, or a spec
// with no __apex at all must never turn a green test red.
//
// WHAT MATTERS IS THE PREDECESSOR, NOT THE VICTIM, and that is worth writing
// down because the obvious follow-up is a dead end. Read the worker ordering of
// the run that motivated this (ci 3341, "Selected specs"):
//
//   w0  race-control #1  35.7 s pass  ->  race-control #2      180.0 s FAIL
//   w1  race-control #3  34.7 s pass  ->  telemetry-compare #1 180.1 s FAIL
//   w2  telemetry-compare #2  1.7 s   ->  telemetry-compare #3   0.3 s  pass
//
// Both failures follow a race-control test, which boots the game. The two
// telemetry-compare tests that follow each other with no game in front of them
// are fine. So the hanging test is not the problem — whatever ran BEFORE it is.
//
// Which means the two specs that import @playwright/test directly do NOT both
// want their import switched, and an earlier version of this comment was wrong
// to say so:
//   - telemetry-compare never boots the game at all. It goes to /version.json,
//     sets its own markup and injects log/mat4/js/data only, so it has no
//     __apex, no GL context and no rAF loop. It is only ever the victim, never
//     the predecessor; switching its import would buy exactly nothing.
//   - carview-parts DOES drive a WebGL viewer, so it is a real predecessor —
//     but tools/carview.html loads neither game.js nor agent/apex.js, so there
//     is no __apex to quiet and switching its import would not reach it either.
//     Its exposure is instead cut structurally: its three same-url tests share
//     one context, leaving a single inter-test transition in that file. Giving
//     CARVIEW (today: ready/set/angle) a stop is what would close the rest.
//
// Safe for sharedTest, which reuses one page: its per-test reset already calls
// headless(false) before each test, so the page wakes back up. Between tests it
// now idles instead of rasterising, which is the same win.
test.afterEach(async ({ page }) => {
  try {
    await page.evaluate(() => { try { window.__apex && window.__apex.headless(true); } catch (_) {} });
  } catch (_) { /* page already closed, or never had __apex — nothing to quiet */ }
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
  _bootedPage: [async ({ browser }, use, workerInfo) => {
    const context = await browser.newContext({
      reducedMotion: workerInfo.project.use.reducedMotion,
    });
    await installMocks(context);
    context.on("page", captureConsole);
    const page = await context.newPage();
    captureConsole(page);
    await page.goto("/");
    // 60 s, not 30. This is a WORKER-scoped boot paid once per file, so the
    // bound costs nothing when the page is quick and is the difference between
    // working and not when it is slow. smoke.spec.js already allows 60 s for the
    // same wait, with the measurement behind it: "CI has been measured taking
    // 94 s just to boot a race on a starved runner". At 30 s this fixture could
    // not be used by the heaviest specs at all — the two smoke HUD tests failed
    // their whole shard in fixture setup, before either assertion ran.
    // Raising a bound only ever PERMITS a slower boot; it cannot make a page
    // that boots quickly any slower, so the ten specs already on sharedTest are
    // unaffected.
    await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: 60_000 });
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
      await awaitTrackBuild(page);
      await page.evaluate(() => window.__apex.go());
    });
  },
});

/** Navigate only if the app is not already live on the shared page. */
async function ensureLive(page) {
  const live = await page.evaluate(() => window.__apex != null).catch(() => false);
  if (live) return;
  await page.goto("/");
  await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
}

export { expect };
