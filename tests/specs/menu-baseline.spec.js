// @ts-check
// SIX BLESSED PIXEL BASELINES — the half tools/ui/layout-audit.mjs cannot see.
//
// The audit grid measures GEOMETRY: what escapes its clipper, what no scroll can
// reach, what is under 24px or under the hardware. It needs no baseline, no
// approval step, and it scales to 380 cells. What it cannot see is IDENTITY —
// colour, type, weight, spacing, the red rule under the wordmark. A screen can
// be geometrically perfect and still ship with the wrong accent or a heading two
// sizes out, and the grid will call it green.
//
// So: a SMALL set of pixel baselines alongside it. Six, not 380 — one per
// (screen, shape) where the shapes are the two that matter most, a landscape
// phone (what the game is actually played on) and a desktop. Three screens: the
// title, and the two that carry the shared list-detail primitive.
//
// WHY SO FEW. Every baseline is a file somebody has to look at and bless when it
// changes, and a suite that asks for that 380 times gets rubber-stamped, which is
// worse than not having it. Six is a number a human will actually review.
//
// PLATFORM NOTE. These render under SwiftShader; a baseline captured on a GPU
// will not match. Regenerate with `npm run test:baseline -- --update-snapshots`
// on the same platform CI uses, and review the diff rather than accepting it.
import { test, expect, BOOT_MS } from "../helpers/fixtures.js";
import { waitGarageSheet } from "../helpers/garage-sheet.js";
import { waitMenuFonts } from "../helpers/menu-fonts.js";

const SHAPES = [
  ["phone-landscape", { width: 844, height: 390 }],
  ["desktop", { width: 1440, height: 900 }],
];

const SCREENS = [
  ["title", async (/** @type {any} */ page) => {
    // already there after boot
    await page.waitForSelector("#overlay:not([hidden])");
  }],
  ["select", async (/** @type {any} */ page) => {
    await page.evaluate(() => document.getElementById("mb-race").click());
    await page.waitForFunction(() => !document.getElementById("select").hidden);
    await page.waitForFunction(
      () => document.querySelectorAll("#sel-tracks .track-row").length > 5);
  }],
  ["garage", async (/** @type {any} */ page) => {
    await page.evaluate(() => document.getElementById("mb-garage").click());
    // #carsetup unhides before buildSetup paints tabs. ENGINE click before
    // aria-busy clears leaves TEAM selected (CI 37452342027, 0.03 ratio).
    await waitGarageSheet(page);
    await page.locator('#cs-tabs [data-cs-cat="engine"]').click();
    await page.waitForFunction(() => {
      const tab = document.querySelector('#cs-tabs [data-cs-cat="engine"]');
      if (!tab || tab.getAttribute("aria-selected") !== "true") return false;
      return [...document.querySelectorAll("#cs-options .cs-opt")]
        .some((o) => /torque curve/i.test(o.textContent || ""));
    }, null, { polling: 100, timeout: 15000 });
  }],
];

for (const [shapeName, viewport] of SHAPES) {
  test.describe(`menu identity — ${shapeName}`, () => {
    test.use({ viewport });

    for (const [screenName, open] of SCREENS) {
      test(`${screenName} looks like itself`, async ({ page }) => {
        // PIN THE CALENDAR DAY. The title's DAILY door names the day's seeded
        // venue and weather (js/race/daily-challenge.js dayKey), so an unpinned
        // clock changes the title golden every UTC midnight — BAKU · WET when
        // blessed, MEXICO CITY · RAIN a day later (2026-09-25). setFixedTime
        // fakes Date only; timers and rAF keep running, so boot is unchanged.
        // https://playwright.dev/docs/clock
        await page.clock.setFixedTime(new Date("2026-09-01T12:00:00Z"));
        await page.goto("/");
        // BOOT_MS, not a hand-rolled 15 s: a SwiftShader boot here measures 11-33 s (2026-09-01).
        await page.waitForFunction(() => window.__apex && window.__apex.race,
          null, { polling: 100, timeout: BOOT_MS });
        // Stop the render loop: the 3D scene behind the menus is different every
        // frame, so a baseline that includes it can never match. It also unblocks
        // Playwright's actionability checks, which wait on animation frames this
        // app's render loop starves under SwiftShader.
        await page.evaluate(() => {
          AppearanceStudio.setScene("static", "still");
          window.__apex.headless(true);
        });
        await page.emulateMedia({ reducedMotion: "reduce" });
        await open(page);
        // HIDE THE CANVAS, do not mask it. "A pixel or two of dither"
        // understated the backdrop problem: the 3D frame is rasterized by
        // SwiftShader, and a different SwiftShader build renders a uniformly
        // different frame — measured 2026-08-21, all six goldens diffed
        // 19-21% on an UNTOUCHED tree in a fresh container, entirely in
        // canvas pixels. And Playwright's `mask:` is no fix here: #game is
        // position:fixed inset:0, so masking its BOX paints magenta over the
        // whole viewport, menus included (reviewed goldens were solid
        // magenta). visibility:hidden on the canvas is the house pattern
        // (survey-ui-matrix setup) — the menus render over the body's own
        // deterministic background and the suite finally measures what its
        // header claims: IDENTITY — colour, type, weight, spacing.
        await page.evaluate(() => {
          for (const canvas of document.querySelectorAll("#game, #game-soft")) canvas.style.visibility = "hidden";
        });
        // css/fonts-hud.css is print→all deferred (#1101). Titillium 400/700
        // live there; a shot before onload uses system-ui and wraps the
        // desktop rooms row (CI 37458009585, title 0.09). Same wait as the
        // phone 0.08 wrap — do not bless system-ui actuals.
        await waitMenuFonts(page);
        await page.waitForTimeout(600);   // let the sheet settle and measure
        await expect(page).toHaveScreenshot(`${screenName}-${shapeName}.png`, {
          maxDiffPixelRatio: 0.01,
          animations: "disabled",
          // toHaveScreenshot's own expect timeout defaults to 5s, and a
          // 1440x900 capture under SwiftShader does not finish in that — the
          // three desktop baselines failed to generate on exactly this, while
          // the smaller phone ones came out fine.
          timeout: 60_000,
        });
      });
    }
  });
}
