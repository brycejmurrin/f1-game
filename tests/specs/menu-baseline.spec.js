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
import { freeBuildOff } from "../helpers/shared-page.js";

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
    await page.waitForFunction(() => !document.getElementById("select").hidden,
      null, { polling: 100, timeout: BOOT_MS });
    await page.waitForFunction(
      () => document.querySelectorAll("#sel-tracks .track-row").length > 5,
      null, { polling: 100, timeout: BOOT_MS });
  }],
  ["garage", async (/** @type {any} */ page) => {
    await page.evaluate(() => document.getElementById("mb-garage").click());
    // #carsetup unhides before buildSetup fills tabs (openSetup two-rAF
    // yield, #1024). Click ENGINE after the identity settle — hiding
    // #game on desktop remounts the pair sheet back to TEAM.
    await waitGarageSheet(page);
    // GarageDefaults / unlimitedBudget can leave FREE BUILD ON; the golden
    // is the budgeted sheet (ci run 38049517942 phone-landscape flake).
    await freeBuildOff(page);
    await waitGarageSheet(page);
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
        // `ready` is not enough: it resolves when a worker is active for the
        // registration, before clients.claim(). CI 37466745467 logged
        // controllerchange at 9855ms during the 12.1s phone title shot —
        // the claim restyled CSS/fonts after ready, FOUT widened .bigbtn
        // min-content, and RACE A FRIEND wrapped onto its own row (GARAGE
        // clipped). Wait until this page is controlled, then two rAFs,
        // then fonts. Do NOT set serviceWorkers:"block": Playwright
        // resolves register() with undefined and the shell overlayed
        // r.scope (CI 37463034163).
        await page.waitForFunction(() => {
          if (!navigator.serviceWorker) return true;
          return !!navigator.serviceWorker.controller;
        }, null, { polling: 100, timeout: 15_000 }).catch(() => {});
        await page.evaluate(() => new Promise((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(resolve));
        }));
        // Wait for IDENTITY chrome + Titillium before shooting.
        // css/fonts-hud.css and select/carsetup are print→all (#1101).
        // .bigbtn is italic 800 (css/tokens.css); the title-critical sheet
        // already ships italic 700 (synth-bolds 800). A used-face gate on
        // NORMAL 700 can pass from fonts-hud while doors still paint
        // system-ui (wider min-content → 2×2 wrap, GARAGE clipped).
        // getComputedStyle().fontFamily is the specified stack, not the
        // used face. Flip print sheets to all, FontFace-load the three
        // title faces, then measure italic 800 vs Arial.
        await page.evaluate(() => {
          for (const link of document.querySelectorAll('link[rel="stylesheet"]')) {
            if (link.media === "print") link.media = "all";
          }
        });
        await page.waitForFunction(() => {
          const need = ["fonts-hud.css", "select.css", "carsetup.css"];
          const links = [...document.querySelectorAll('link[rel="stylesheet"]')];
          return need.every((frag) => {
            const l = links.find((x) => (x.getAttribute("href") || "").includes(frag));
            return !!(l && l.media === "all" && l.sheet);
          });
        }, null, { polling: 100, timeout: BOOT_MS });
        await page.evaluate(async () => {
          const specs = [
            ["normal", "600", "titillium-web-latin-600-normal.woff2"],
            ["italic", "700", "titillium-web-latin-700-italic.woff2"],
            ["normal", "700", "titillium-web-latin-700-normal.woff2"],
          ];
          for (const [style, weight, file] of specs) {
            const face = new FontFace(
              "Titillium Web",
              `url("assets/fonts/${file}")`,
              { style, weight, display: "swap" },
            );
            document.fonts.add(await face.load());
          }
        });
        await page.waitForFunction(() => {
          if (!document.fonts) return true;
          const faces = [...document.fonts];
          const loaded = (style, weight) => faces.some((f) => {
            const fam = String(f.family).replace(/["']/g, "");
            return fam === "Titillium Web"
              && String(f.weight) === String(weight)
              && f.style === style
              && f.status === "loaded";
          });
          if (!loaded("italic", 700) || !loaded("normal", 600) || !loaded("normal", 700)) {
            return false;
          }
          // Used-face gate: fontFamily is always the stack. Measure the
          // face .bigbtn actually requests (italic 800), not 700-normal.
          const ctx = document.createElement("canvas").getContext("2d");
          if (!ctx) return true;
          const sample = "HOW TO PLAY RACE";
          ctx.font = 'italic 800 48px "Titillium Web"';
          const tit = ctx.measureText(sample).width;
          ctx.font = "italic 800 48px Arial, sans-serif";
          const fb = ctx.measureText(sample).width;
          return Math.abs(tit - fb) > 2;
        }, null, { polling: 100, timeout: BOOT_MS });
        await page.waitForTimeout(600);   // let the sheet settle and measure
        if (screenName === "title") {
          // FOUT reflow is done when GARAGE sits fully on-screen. The
          // wrapped phone actual (227059, CI 37466745467) clipped it
          // under DATA HUB / TRACK DESIGNER — do not bless that frame.
          await page.waitForFunction(() => {
            const garage = document.getElementById("mb-garage");
            if (!garage || garage.hidden) return false;
            const g = garage.getBoundingClientRect();
            return g.height > 8 && g.width > 40
              && g.top >= -1 && g.bottom <= window.innerHeight + 1;
          }, null, { polling: 100, timeout: 15_000 });
        }
        if (screenName === "garage") {
          await page.evaluate(() => {
            const el = document.querySelector('#cs-tabs [data-cs-cat="engine"]');
            if (!el) throw new Error("menu-baseline: no ENGINE tab after settle");
            el.click();
          });
          await page.waitForFunction(() => {
            const tab = document.querySelector('#cs-tabs [data-cs-cat="engine"]');
            const opts = document.getElementById("cs-options");
            return !!(tab && tab.getAttribute("aria-selected") === "true"
              && opts && /INSPECT ENGINE/i.test(opts.textContent || ""));
          }, null, { polling: 100, timeout: 15_000 });
        }
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
