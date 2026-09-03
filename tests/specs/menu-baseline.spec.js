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
    await page.waitForFunction(() => !document.getElementById("carsetup").hidden);
    await page.evaluate(() => {
      const t = [...document.querySelectorAll("#cs-tabs .cs-tab")];
      (t.find((e) => /ENGINE/i.test(e.textContent || "")) || t[1] || t[0])?.click();
    });
  }],
];

for (const [shapeName, viewport] of SHAPES) {
  test.describe(`menu identity — ${shapeName}`, () => {
    test.use({ viewport });

    for (const [screenName, open] of SCREENS) {
      test(`${screenName} looks like itself`, async ({ page }) => {
        await page.goto("/");
        // BOOT_MS, not a hand-rolled 15 s: a SwiftShader boot here measures 11-33 s (2026-09-01).
        await page.waitForFunction(() => window.__apex && window.__apex.race,
          null, { polling: 100, timeout: BOOT_MS });
        // Stop the render loop: the 3D scene behind the menus is different every
        // frame, so a baseline that includes it can never match. It also unblocks
        // Playwright's actionability checks, which wait on animation frames this
        // app's render loop starves under SwiftShader.
        await page.evaluate(() => window.__apex.headless(true));
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
        await page.evaluate(() => { document.getElementById("game").style.visibility = "hidden"; });
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
