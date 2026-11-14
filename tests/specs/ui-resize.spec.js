// @ts-check
// LIVE RESIZE — the layout has to be right AFTER it changes, not only when it
// starts that way.
//
// Every other layout guard in this suite opens a screen at a fixed viewport:
// `test.use({ viewport })` sets the size before the page loads, so the first
// paint is also the only paint being judged. That misses a whole class of bug,
// because three of this app's layout answers are computed by JavaScript from a
// measurement rather than declared in CSS — `data-shape`, `data-pair` and
// `data-density`, all written by js/ui/sheet-shape.js off a ResizeObserver.
// Anything that leaves one of those stale is invisible to a static test and
// obvious to a player who rotates their phone.
//
// It is not a theoretical class. A `zoom` change does not fire ResizeObserver at
// all — the element's visual box does not move, only the units its own CSS is
// written in — so `data-density` sat on "normal" at UI SIZE 150% while the sheet
// was 297px tall. That is why SheetShape watches the node --ui-scale is written
// to as well, and this spec is what stops that watcher being deleted as
// redundant.
//
// WHAT IS ASSERTED, and deliberately not more:
//   1. the classification attributes converge on the value a fresh load at that
//      size would produce — no staleness, no order dependence
//   2. nothing overflows horizontally at any step or after any sequence
//   3. the primary action stays reachable throughout
//   4. rotating back and forth returns to where it started (no ratcheting from
//      the hysteresis in SheetShape's three classifiers)
//
// Relative, not absolute: the oracle is "same as a fresh load", so this does not
// bake in today's breakpoints and will not need editing when they move.
//
// WHAT THAT ORACLE CANNOT CATCH, established by mutation rather than assumed.
// Stubbing out the classifyDensity call in js/ui/sheet-shape.js fails case 3
// and leaves cases 1 and 2 GREEN — because a classifier that is broken
// everywhere is broken identically on both sides of a "same as fresh" compare.
// Those two cases are guards against STALENESS and RATCHETING specifically, and
// case 3 is the one that asserts a value. Read them that way; do not add a
// fourth case to case 1's pattern and expect it to catch a dead mechanism.
//
// Also established by mutation: disabling SheetShape's `watchScale` observer
// does NOT fail case 3 today. That observer was added because a `zoom` change
// left data-density stale, and it no longer can — `--cs-sheet-w` is now derived
// from `--ui-scale` (css/carsetup.css), so changing the scale really does resize
// the element and the ResizeObserver fires on its own. The observer is kept as
// the general answer, since a sheet whose box does not depend on the scale would
// still need it, but it is currently belt-and-braces and this spec does not
// prove it. Said plainly so nobody cites this file as its justification.
import fs from "node:fs";
import { test, expect, BOOT_MS } from "../helpers/fixtures.js";
import { uiTestOptions } from "../../tools/lib/ui-device-profile.mjs";
import { pinFactorySeat } from "../helpers/factory-seat.js";
import { waitGarageSheet } from "../helpers/garage-sheet.js";

const DESKTOP = { width: 1440, height: 900 };
const PHONE_LANDSCAPE = { width: 852, height: 393 };
const PHONE_PORTRAIT = { width: 393, height: 852 };
// 490, NOT 462. `--compact-at: 480` (css/carsetup.css) plus SHORT_HYST: 40 means
// the garage's density classifier RELEASES from compact back to normal only
// above 520 of its own units. At UI SIZE 50% a 490-tall viewport is ~980 own
// units (solidly normal); at 100% it is 490 (compact under 480). SCALE_MIN
// was briefly 90, then 80, then 50, and now sits at 40 (js/ui/scale.js);
// the round-trip (normal ↔ compact ↔ normal) has ample headroom either way.
const SHORT_WIDE = { width: 1000, height: 490 };

const SIZES = [
  ["desktop", DESKTOP],
  ["phone-landscape", PHONE_LANDSCAPE],
  ["phone-portrait", PHONE_PORTRAIT],
  ["short-wide", SHORT_WIDE],
];

async function waitReady(page) {
  // BOOT_MS, not a hand-rolled 20 s: a SwiftShader boot here measures 11-33 s (2026-09-01).
  await page.waitForFunction(() => window.__apex && window.__apex.race,
    null, { polling: 100, timeout: BOOT_MS });
  // STOP THE RENDER LOOP. This spec opens the garage, which runs a live 3D car
  // preview (renderSetupPreview in game.js) regardless of whether a race is
  // active — every subsequent wait in this file was competing with that for
  // main-thread time, which is the exact class of flakiness AGENTS.md documents
  // for a page that renders under SwiftShader ("a page running the game loop
  // starves that poll badly enough that the declared timeout never gets to
  // fire"). Every other layout tool in this repo (tools/ui/layout-audit.mjs, the
  // menu-survey specs) calls headless(true) before doing timing-sensitive DOM
  // waits for the same reason; this file was the one that did not.
  // MEASURED without it, on a genuinely idle box with nothing else running:
  // data-shape convergence after a resize varied from ~250ms to over 7s across
  // otherwise-identical runs — not because the classifier is wrong (the CSS box
  // itself, read via getBoundingClientRect, was ALWAYS correct within ~250ms),
  // but because the render loop's own per-frame cost under software rendering
  // can starve the JS event loop enough to delay when a ResizeObserver callback
  // — or even a plain setTimeout — actually GETS TO RUN. This is a testing
  // artifact of measuring from inside a rendering page, not a product bug: it
  // only leaves rendering (and the frustum-shift math that reads #cs-inner's
  // live rect while rendering) untested, which is not this spec's concern —
  // this file asserts CSS/DOM classification, not the 3D preview.
  await page.evaluate(() => window.__apex.headless(true));
}

// Factory McLaren empty sheet BEFORE navigation: GarageDefaults would otherwise
// open Mercedes + signature kit, which over-budget rows push #cs-done off
// short-wide. pinFactorySeat is addInitScript, so it applies to every later
// goto on this page.
async function loadAt(page) {
  await pinFactorySeat(page);
  await page.goto("/");
  await waitReady(page);
}

// Open the garage the way a player does. It is the densest screen in the app —
// the only docked one, the only one with a live 3D preview beside it, and the
// one carrying all three classification attributes at once.
async function openGarage(page) {
  await page.evaluate(() => document.getElementById("mb-garage").click());
  // #carsetup unhides before buildSetup fills tabs (#1024 two-rAF). A
  // 3-frame wait on an empty sheet reports DONE on-screen; after a
  // resize walk the filled sheet is the one that must keep it reachable.
  await waitGarageSheet(page);
  // WAIT OUT THE WARM-UP FRAMES, NOT A FIXED SLEEP. Under GLX on SwiftShader the
  // first animation frame after the garage opens took 4.1-4.8 s and the next two
  // ~1 s each; after that a frame is ~17 ms (measured 2026-10-03, headless(true)
  // on; the same on ff109fc1, so not a regression). SheetShape.watchScale
  // reclassifies in a rAF, so a uiScale() write inside that window waited behind
  // it: "a UI SIZE change re-classifies" missed its wait on CI (3960070 / PR 791)
  // and in 2 of 3 local runs, while the flip itself takes ~55 ms once the frames
  // settle. Three frames covers the expensive ones; the 400 ms sleep it replaces
  // covered none of them. (Port of a746d014e / claude/ui-resize-garage-warmup.)
  await page.evaluate(() => new Promise((resolve) => {
    let n = 0;
    const step = () => (++n >= 3 ? resolve() : requestAnimationFrame(step));
    requestAnimationFrame(step);
  }));
}

// The four numbers a resize has to get right, read together so they cannot be
// observed mid-update.
const readState = (page) => page.evaluate(() => {
  const el = document.getElementById("cs-inner");
  const r = el.getBoundingClientRect();
  const done = document.getElementById("cs-done");
  const db = done.getBoundingClientRect();
  return {
    shape: el.dataset.shape || null,
    pair: el.dataset.pair || null,
    density: el.dataset.density || null,
    // rounded: sub-pixel differences between a resize and a fresh load are not
    // a bug, and asserting on them would make this spec flaky for no truth.
    panelW: Math.round(r.width),
    zoom: Number(getComputedStyle(el).zoom),
    hOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
    doneOnScreen: db.width > 0 && db.height > 0 &&
      db.top >= 0 && db.bottom <= window.innerHeight + 1 &&
      db.left >= 0 && db.right <= window.innerWidth + 1,
  };
});

test.describe("Live resize — the garage re-answers its own layout questions", () => {
  test.beforeEach(async ({ page }) => {
    // Garage DONE-on-screen was written against the previous look. Shipped
    // TEXT SIZE is large, HIGH CONTRAST is on — pin the old look so this
    // spec stays a resize/staleness test, not a type-scale test.
    await page.addInitScript(() => {
      try {
        localStorage.setItem("apex26.textSize", '"normal"');
        localStorage.setItem("apex26.uiContrast", '"off"');
        localStorage.setItem("apex26.homeScene", '"garage"');
      } catch (_) {}
    });
  });
  test("resizing into a size matches loading fresh at that size", async ({ page }) => {
    // The oracle: what each size looks like when it is the FIRST size.
    /** @type {Record<string, any>} */
    const fresh = {};
    for (const [name, size] of SIZES) {
      await page.setViewportSize(size);
      await loadAt(page);
      await openGarage(page);
      fresh[name] = await readState(page);
      expect(fresh[name].hOverflow, `${name} fresh: no horizontal overflow`).toBe(false);
      expect(fresh[name].doneOnScreen, `${name} fresh: DONE reachable`).toBe(true);
    }

    // Now walk every size in one session, resizing rather than reloading, and
    // require the same answer. Load once, then never again.
    await page.setViewportSize(DESKTOP);
    await loadAt(page);
    await openGarage(page);

    for (const [name, size] of SIZES) {
      await page.setViewportSize(size);
      // ResizeObserver fires on the frame after the resize; SheetShape then
      // writes the attributes and CSS re-runs. Poll for convergence rather than
      // sleeping a guessed amount.
      // 15s, not 5s. MEASURED even with rendering stopped (see waitReady()):
      // convergence after this exact resize varied 250ms-7.1s across runs on an
      // otherwise-idle box, with no evidence it ever fails to converge at all —
      // only that WHEN it happens is not tightly bounded in this environment.
      // 5s left near-zero margin against a measured 7.1s outlier; this asserts
      // the same thing (convergence, not speed) with headroom.
      await page.waitForFunction((expected) => {
        const el = document.getElementById("cs-inner");
        const done = document.getElementById("cs-done");
        if (!el || !done) return false;
        if (el.dataset.shape !== expected.shape ||
            el.dataset.pair !== expected.pair ||
            el.dataset.density !== expected.density) return false;
        const zoom = Number(getComputedStyle(el).zoom);
        if (Number.isFinite(expected.zoom) && Math.abs(zoom - expected.zoom) > 0.001) {
          return false;
        }
        // classifyFit writes --sheet-scale on a later turn than
        // data-density. Waiting only on the attributes left DONE 1–2 px
        // past the short-wide viewport after a portrait→wide resize
        // (CI 37459850548 packed-5) while a screenshot still showed it.
        const db = done.getBoundingClientRect();
        return db.width > 0 && db.height > 0 &&
          db.top >= 0 && db.bottom <= window.innerHeight + 1 &&
          db.left >= 0 && db.right <= window.innerWidth + 1;
      }, fresh[name], { polling: 50, timeout: 15_000 }).catch(() => {});

      const after = await readState(page);
      expect(after.shape, `${name}: data-shape after resize`).toBe(fresh[name].shape);
      expect(after.pair, `${name}: data-pair after resize`).toBe(fresh[name].pair);
      expect(after.density, `${name}: data-density after resize`).toBe(fresh[name].density);
      expect(after.panelW, `${name}: panel width after resize`).toBe(fresh[name].panelW);
      expect(after.hOverflow, `${name}: no horizontal overflow after resize`).toBe(false);
      expect(after.doneOnScreen, `${name}: DONE reachable after resize`).toBe(true);
    }
  });

  test("rotating back and forth does not ratchet", async ({ page }) => {
    // SheetShape gives all three classifiers hysteresis, which is right — a
    // sheet sitting exactly on a threshold would otherwise flip on every
    // observer callback. Hysteresis with a bug in it shows up as a layout that
    // depends on which way you arrived, so: land on portrait twice, once from
    // each direction, and require the same answer.
    await page.setViewportSize(PHONE_PORTRAIT);
    await loadAt(page);
    await openGarage(page);
    const first = await readState(page);

    for (let i = 0; i < 3; i++) {
      await page.setViewportSize(PHONE_LANDSCAPE);
      await page.waitForTimeout(250);
      await page.setViewportSize(PHONE_PORTRAIT);
      await page.waitForTimeout(250);
    }
    const afterCycles = await readState(page);

    expect(afterCycles.shape, "shape after three rotations").toBe(first.shape);
    expect(afterCycles.pair, "pair after three rotations").toBe(first.pair);
    expect(afterCycles.density, "density after three rotations").toBe(first.density);
    expect(afterCycles.panelW, "panel width after three rotations").toBe(first.panelW);
    expect(afterCycles.hOverflow, "no horizontal overflow after rotations").toBe(false);
    expect(afterCycles.doneOnScreen, "DONE reachable after rotations").toBe(true);
  });

  test("a UI SIZE change re-classifies without a resize", async ({ page }) => {
    // The one a ResizeObserver cannot see. `zoom` leaves the element's visual
    // box alone and changes only the units its CSS is written in, so nothing
    // resizes and the observer never fires. Measured before the fix: the garage
    // held data-density="normal" at UI SIZE 150% with a 297px-tall sheet.
    await page.setViewportSize(SHORT_WIDE);
    await loadAt(page);
    await openGarage(page);

    // 50, NOT 100 — and that is a real behaviour change, not a nudge to make a
    // test pass. The garage's `--compact-at` was raised from the shared 380 to
    // 480 (css/carsetup.css) because this screen carries ~320 own units of
    // chrome before a part appears, so a sheet under 480 has under three option
    // rows. On SHORT_WIDE at UI SIZE 100% it is now COMPACT by design —
    // measured, that took the parts list from 1.5 cards to 3.1.
    // The case this test exists for is unchanged and still exercised: two scales
    // that classify differently, with no resize between them, proving the
    // classifier answers to `zoom` alone. 50 was SCALE_MIN when this was
    // written; the floor is now 40 (js/ui/scale.js), and 50 keeps the
    // same normal-vs-compact contrast, so the value stays.
    // Wait for the settled class — same pattern as the 150% step and the
    // return trip below. A fixed 400 ms sleep raced SheetShape: watchScale
    // reclassifies on --ui-scale, but roomOwn used to trust currentCSSZoom,
    // which can still read 1 on that turn, and ResizeObserver often skips
    // zoom-only box changes, so density stayed "compact" while panelW was
    // already the scaled width (CI scheduled Smoke shard 2 on ce3ec4db).
    await page.evaluate(() => window.__apex.uiScale(50));
    // 15s, not 5s. watchScale reclassifies on the next rAF, and this file's
    // header measured that callback taking over 7s when a SwiftShader frame
    // starves the event loop. The selected-specs shard hit the 5s cap twice
    // on PR 791; the density answer itself is covered by the unit twin.
    await page.waitForFunction(() => {
      const el = document.getElementById("cs-inner");
      return el && el.dataset.density === "normal";
    }, null, { polling: 50, timeout: 15_000 });
    const at50 = await readState(page);
    expect(at50.density, "not compact at UI SIZE 50% on this viewport").toBe("normal");

    await page.evaluate(() => window.__apex.uiScale(150));
    await page.waitForFunction(() => {
      const el = document.getElementById("cs-inner");
      return el && el.dataset.density === "compact";
    }, null, { polling: 50, timeout: 15_000 });
    const at150 = await readState(page);

    expect(at150.density, "compact once the sheet is short in its own units").toBe("compact");
    expect(at150.hOverflow, "no horizontal overflow at 150%").toBe(false);
    expect(at150.doneOnScreen, "DONE reachable at 150%").toBe(true);

    // And back down again, because a one-way classifier would pass the above.
    await page.evaluate(() => window.__apex.uiScale(50));
    await page.waitForFunction(() => {
      const el = document.getElementById("cs-inner");
      return el && el.dataset.density === "normal";
    }, null, { polling: 50, timeout: 15_000 });
    expect((await readState(page)).density, "back to normal when the scale drops").toBe("normal");
  });

  test("extreme UI size yields only enough to keep dense content functional", async ({ page }) => {
    await page.setViewportSize({ width: 734, height: 343 });
    await loadAt(page);
    await openGarage(page);
    await page.evaluate(() => window.__apex.uiScale(200));
    await page.waitForFunction(() => document.getElementById("cs-inner").dataset.fit === "on",
      null, { polling: 50, timeout: 5_000 });

    const state = await page.evaluate(() => {
      const sheet = document.getElementById("cs-inner");
      const options = document.getElementById("cs-options").getBoundingClientRect();
      const done = document.getElementById("cs-done").getBoundingClientRect();
      return {
        requested: getComputedStyle(document.documentElement).getPropertyValue("--ui-scale").trim(),
        effective: Number(getComputedStyle(sheet).zoom),
        fit: sheet.dataset.fit,
        optionsH: options.height,
        doneOnScreen: done.bottom <= window.innerHeight + 1 && done.top >= 0,
      };
    });
    expect(state.requested).toBe("2");
    expect(state.fit).toBe("on");
    expect(state.effective).toBeLessThan(2);
    expect(state.optionsH).toBeGreaterThanOrEqual(24);
    expect(state.doneOnScreen).toBe(true);
  });

  test("the software-keyboard inset pads the screen and tightens the fit cap", async ({ page }) => {
    // Playwright cannot raise a real software keyboard — headless Chromium's
    // visualViewport never shrinks — so this asserts the CONSUMPTION path
    // only: --kb written on documentElement (what SheetShape.watchKeyboard
    // writes) must become bottom padding on the UNZOOMED .screen, and a
    // --fit-at sheet must re-derive its --sheet-scale from the space that is
    // left, because classifyFit reads the host's padding. The listener's own
    // math (visualViewport deltas, the pinch/URL-bar guards) stays
    // review-by-eye plus a real-device pass; a green here does not vouch for
    // it, and this comment is what stops anyone citing it as if it did.
    await page.setViewportSize({ width: 734, height: 343 });
    await loadAt(page);
    await openGarage(page);
    await page.evaluate(() => window.__apex.uiScale(200));
    await page.waitForFunction(() => document.getElementById("cs-inner").dataset.fit === "on",
      null, { polling: 50, timeout: 5_000 });

    const read = () => page.evaluate(() => {
      const screen = document.getElementById("carsetup");
      const sheet = document.getElementById("cs-inner");
      return {
        padBottom: parseFloat(getComputedStyle(screen).paddingBottom),
        effective: Number(getComputedStyle(sheet).zoom),
        doneOnScreen: (() => {
          const db = document.getElementById("cs-done").getBoundingClientRect();
          return db.height > 0 && db.bottom <= window.innerHeight + 1;
        })(),
      };
    });

    // data-fit="on" can land a turn before the painted zoom matches the fit's
    // --sheet-scale. On a fast CI runner the baseline read caught zoom 1 while
    // the settled cap was 1.363, and "keyboard gone" then compared settled to
    // unsettled (ci run 36652043544). Wait until style and paint agree.
    // Short+compact MQ (css/menus.css) caps .sheet zoom at --ui-compact-scale
    // (= min(--ui-scale, 1.25) in tokens.css); paint may be below classifyFit's
    // --sheet-scale. getPropertyValue("--ui-compact-scale") returns the min()
    // expression string, so resolve the cap from --ui-scale here.
    await page.waitForFunction(() => {
      const sheet = document.getElementById("cs-inner");
      if (!sheet || sheet.dataset.fit !== "on") return false;
      const scale = parseFloat(sheet.style.getPropertyValue("--sheet-scale"));
      if (!Number.isFinite(scale) || scale <= 0) return false;
      const zoom = Number(getComputedStyle(sheet).zoom);
      const uiScale = parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue("--ui-scale"));
      const bodyCompact = document.body.dataset.density === "compact";
      const shortMq = window.matchMedia("(max-width: 899px), (max-height: 699px)").matches;
      const compactCap = Number.isFinite(uiScale) ? Math.min(uiScale, 1.25) : 1.25;
      const expected = (bodyCompact && shortMq) ? Math.min(scale, compactCap) : scale;
      return Math.abs(zoom - expected) < 0.001;
    }, null, { polling: 100, timeout: 5_000 });

    const before = await read();
    expect(before.padBottom, "no keyboard: the pad is just the safe-area gutter")
      .toBeLessThan(120);

    // Exactly what watchKeyboard's apply() does: write --kb, flush the
    // .screen padding cascade, reclassify. The flush is load-bearing — without
    // it classifyFit can still see the pre-keyboard pad on this turn.
    await page.evaluate(() => {
      document.documentElement.style.setProperty("--kb", "120px");
      void document.documentElement.offsetHeight;
      window.SheetShape.reclassify();
    });
    await page.waitForFunction((was) => {
      const screen = document.getElementById("carsetup");
      const sheet = document.getElementById("cs-inner");
      return parseFloat(getComputedStyle(screen).paddingBottom) === 120
        && Number(getComputedStyle(sheet).zoom) < was;
    }, before.effective, { polling: 100, timeout: 5_000 });
    const withKb = await read();
    expect(withKb.padBottom, "--kb reaches .screen as bottom padding").toBe(120);
    expect(withKb.effective, "the fit cap tightens for the space the keyboard took")
      .toBeLessThan(before.effective);
    expect(withKb.doneOnScreen, "the action bar stays above the keyboard").toBe(true);

    // And back, because a pad or cap that survives the keyboard closing is
    // the same ratchet bug the rotation case guards against.
    await page.evaluate(() => {
      document.documentElement.style.removeProperty("--kb");
      void document.documentElement.offsetHeight;
      window.SheetShape.reclassify();
    });
    await page.waitForFunction((was) => {
      const screen = document.getElementById("carsetup");
      const sheet = document.getElementById("cs-inner");
      return parseFloat(getComputedStyle(screen).paddingBottom) === was.pad
        && Math.abs(Number(getComputedStyle(sheet).zoom) - was.zoom) < 1e-3;
    }, { pad: before.padBottom, zoom: before.effective }, { polling: 100, timeout: 5_000 });
    const after = await read();
    expect(after.padBottom, "keyboard gone: pad returns").toBe(before.padBottom);
    expect(after.effective, "keyboard gone: fit cap returns").toBeCloseTo(before.effective, 3);
  });

  test("the density tier reaches the spacing tokens, where a media query cannot",
    async ({ page }) => {
      // css/tokens.css tightens --pad/--gap/--gut behind
      // `(orientation: landscape) and (max-height: 560px)`, which reads the
      // VIEWPORT while every .sheet is written in units divided by --ui-scale.
      // The gap between the two is widest for a sheet with a large
      // `--compact-at`: the lighting tuner declares 620 because its head carries
      // twelve tab chips before the first slider. On a 393x659 phone at UI SIZE
      // 115% its own height is ~573 — short by its own standard — while the
      // media query reads 659 and declines to tighten anything.
      await page.setViewportSize({ width: 393, height: 659 });
      await loadAt(page);
      await page.evaluate(() => window.__apex.uiScale(115));

      // Through the pause ladder, the way a player reaches it — opening the
      // panel by clearing `hidden` gives a real but desynced panel.
      await page.evaluate(() => window.__apex.race("monza"));
      await page.waitForFunction(() => {
        try { return window.__apex.info().track != null; } catch (_) { return false; }
      }, null, { polling: 100, timeout: BOOT_MS });
      await page.evaluate(() => {
        window.__apex.park(0.1);
        document.getElementById("pausemenu").hidden = false;
        document.getElementById("pm-settings").click();
      });
      await page.waitForFunction(() => !document.getElementById("pmsettings").hidden,
        null, { polling: 50, timeout: 8_000 });
      await page.evaluate(() => {
        document.getElementById("pm-open-visual").click();
        document.getElementById("pm-lighting").click();
      });
      await page.waitForFunction(() => !document.getElementById("lighting").hidden,
        null, { polling: 50, timeout: 8_000 });
      await page.waitForTimeout(500);

      const state = await page.evaluate(() => {
        const el = document.getElementById("lighting-inner");
        const cs = getComputedStyle(el);
        const tabs = el.querySelector(".lt-tabs");
        return {
          density: el.dataset.density || null,
          compactAt: cs.getPropertyValue("--compact-at").trim(),
          pad: cs.getPropertyValue("--pad").trim(),
          mediaWouldFire: window.matchMedia("(orientation: landscape) and (max-height: 560px)").matches,
          // The tuner's own compact head, which used to sit behind
          // `@media (max-height: 620px)` and so never fired here either. Its
          // headline effect is the category chips becoming ONE scrolling strip
          // instead of a wrapped block — worth ~110px of slider room.
          heightQueryWouldFire: window.matchMedia("(max-height: 620px)").matches,
          tabsNoWrap: tabs ? getComputedStyle(tabs).flexWrap : null,
          tabsScrollX: tabs ? tabs.scrollWidth > tabs.clientWidth + 1 : null,
          footReachable: (() => {
            const f = el.querySelector(".sheet-foot");
            return !!f && f.getBoundingClientRect().bottom <= window.innerHeight + 1;
          })(),
        };
      });

      expect(state.heightQueryWouldFire,
        "the max-height query this block used to live behind does NOT fire here").toBe(false);
      expect(state.tabsNoWrap, "yet the category chips are the single scrolling strip").toBe("nowrap");
      expect(state.tabsScrollX, "and that strip really does pan sideways").toBe(true);

      expect(state.compactAt, "the tuner declares its own threshold").toBe("620px");
      expect(state.mediaWouldFire, "the viewport query does NOT fire here — that is the point")
        .toBe(false);
      expect(state.density, "but the sheet is short in its own units").toBe("compact");
      expect(state.pad, "so the compact spacing applies anyway").toBe("13px");
      expect(state.footReachable, "and the action bar stays on screen").toBe(true);
    });
});

test.describe("Live resize — the renderer's cached canvas box", () => {
  // THE ONE THING THIS FILE DELIBERATELY DID NOT COVER. Every test above calls
  // headless(true) to stop the render loop, for good reasons written at
  // waitReady() — and the cost, named there, is that "it only leaves rendering
  // (and the frustum-shift math that reads #cs-inner's live rect while
  // rendering) untested". A defect lived in exactly that gap: GLX's CSS-size
  // cache is invalidated by an edge-triggered flag, and one resize() landing
  // before the canvas box reflowed cached the OLD box, cleared the flag, and
  // left GLX.aspect reporting the PREVIOUS viewport's ratio for the rest of the
  // session. Measured in a browser: a landscape 1.7778 survived a whole
  // portrait session in the garage (docs/PERF-FINDINGS.md §2u). aspect feeds
  // the main projection, the FOV cap and the frustum cull radius, so this
  // stretches the world and can pop geometry out of it.
  //
  // So this ONE test keeps the loop running. It asserts a relative invariant
  // against the live DOM — aspect equals the canvas's own box — never an
  // absolute number, and it tolerates a frame of lag by polling rather than
  // sampling once.
  test("GLX.aspect tracks the live canvas box across rotations", async ({ page }) => {
    // The render loop is the subject here, so headless(true) is off — and that
    // makes the boot cost this file's own notes measure (54-107 s under
    // SwiftShader; `AgentView.create` at 72.9 s in the first run of this test)
    // land INSIDE the test budget instead of beside it. 120 s is not enough for
    // a boot plus a rotation walk on a software renderer; this is a wall-clock
    // budget for the machine, not a widened tolerance on the assertion, which
    // stays exact (docs/TESTING.md: "a timeout on a busy box measures the
    // machine, not the code").
    test.setTimeout(300_000);
    await page.setViewportSize(DESKTOP);
    await pinFactorySeat(page);
    await page.goto("/");
    await page.waitForFunction(() => window.__apex && window.__apex.race,
      null, { polling: 100, timeout: BOOT_MS });
    // NO headless(true) here — the render loop is the subject, not the noise.
    await openGarage(page);

    // Three stops, not five: the measured repro alternated stale/correct on
    // every single orientation change, so landscape -> portrait -> landscape
    // already covers it, and each extra stop is another SwiftShader settle.
    for (const [label, size] of [
      ["desktop", DESKTOP], ["phone-portrait", PHONE_PORTRAIT],
      ["phone-landscape", PHONE_LANDSCAPE],
    ]) {
      await page.setViewportSize(size);
      // Poll: a busy SwiftShader box can take several frames to settle, and
      // this file's own notes measure that as up to seconds. Waiting on the
      // CONDITION rather than a fixed sleep is what AGENTS.md asks for.
      await page.waitForFunction(() => {
        const cv = document.getElementById("game");
        if (!cv || !cv.clientHeight || typeof GLX === "undefined") return false;
        return Math.abs(GLX.aspect - cv.clientWidth / cv.clientHeight) < 0.01;
      }, null, { polling: 100, timeout: 15_000 }).catch(() => {});

      const seen = await page.evaluate(() => {
        const cv = document.getElementById("game");
        return { aspect: GLX.aspect, box: cv.clientWidth / cv.clientHeight,
                 css: `${cv.clientWidth}x${cv.clientHeight}`, buf: `${GLX.width}x${GLX.height}` };
      });
      expect(Math.abs(seen.aspect - seen.box),
        `${label}: GLX.aspect ${seen.aspect.toFixed(4)} must match the live ${seen.css} box `
        + `(${seen.box.toFixed(4)}); backing store ${seen.buf}`).toBeLessThan(0.01);
    }
  });
});

// THE UI CONTRACT'S SETTINGS AND DIALOG CELLS (UI contract 2026-11-06 §4.2, §4.4, gaps 3/4/5/14 and
// §6; PR B of #5153). The exception to this file's "same as a fresh load" oracle, and deliberately so: the contract
// names the ONE phone-landscape layout, so these cells assert values — the owner's three windows, A the Home
// Screen app (852x393, insets 59/21/59), C the same phone as a Safari tab (852x283, 59/0/59), D the spec phone
// (844x390, no insets) — × TEXT SIZE normal/large × UI SIZE 100/130, seeded from Bryce's LOAD SETTINGS export (UI
// 109, HUD 155, HIGH CONTRAST, textSize large). `SheetShape.layoutProbe` is the assertion (the `__apex.sheetFit()`
// alias waits on #5155, which owns js/agent/apex.js); a screenshot is sign-off only. One boot per window; the four
// knob cells are applied live and reclassified. Measured before the assertions were written (2026-11-06, the probe
// in the PR body): the APPEARANCE page is a block, not a 2-column grid; the studio is one column with the preview on
// top; preset tiles are 4-up at UI 100 and 3-up at 130 with names at 14–20.8 painted px; `--kb: 180px` pads the
// <dialog> 180 px in every cell (it was 29 / 8); C at UI 130 caps the sheet at 1.214 and holds it across 277–289.
const OWNER_EXPORT = JSON.parse(fs.readFileSync(new URL("../data/settings-defaults-export.json", import.meta.url), "utf8"));
const CONTRACT_WINDOWS = [
  { name: "A-home-screen-852x393", w: 852, h: 393, sal: 59, sar: 59, sat: 0, sab: 21 },
  // C carries the fit-band cell: at UI 130 its 267 px safe box caps the 220-own settings sheet (1.214), the only
  // A/C/D cell that is capped at all.
  { name: "C-safari-852x283", w: 852, h: 283, sal: 59, sar: 59, sat: 0, sab: 0, band: true },
  { name: "D-spec-844x390", w: 844, h: 390, sal: 0, sar: 0, sat: 0, sab: 0 },
];
const twoFrames = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
// Exactly what a resize or a zoom change ends in: flush the cascade, reclassify every observed sheet.
const reclassify = (page) => page.evaluate(() => { void document.documentElement.offsetHeight; window.SheetShape.reclassify(); });
// The measured layout of the Settings sheet on its APPEARANCE page, read together so a cell is never seen mid-update.
const readSettingsCell = (page) => page.evaluate(() => {
  const sheet = document.getElementById("pmsettings-inner");
  const probe = window.SheetShape.layoutProbe(sheet);
  const panel = document.getElementById("pm-panel-appearance");
  const pcs = getComputedStyle(panel);
  const studio = document.getElementById("appearance-studio");
  const preview = studio.querySelector('[data-as="preview-side"]');
  const controls = [...studio.children].find((c) => c !== preview);
  const pr = preview.getBoundingClientRect(), cr = controls.getBoundingClientRect();
  const list = studio.querySelector('[data-as="preset-list"]');
  const tap = parseFloat(getComputedStyle(list).getPropertyValue("--tap")) || 0;
  const tiles = [...list.querySelectorAll("button")];
  const strong = tiles[0] && tiles[0].querySelector("strong");
  const fsOwn = strong ? parseFloat(getComputedStyle(strong).fontSize) : 0;
  const dialog = document.getElementById("pmsettings");
  // Exactly what SheetShape.watchKeyboard writes when the iOS keyboard opens; read the pad it produces and restore.
  const padNoKb = parseFloat(getComputedStyle(dialog).paddingBottom);
  document.documentElement.style.setProperty("--kb", "180px");
  const padKb = parseFloat(getComputedStyle(dialog).paddingBottom);
  document.documentElement.style.removeProperty("--kb");
  return {
    probe,
    uiScale: parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--ui-scale")) || 1,
    textSize: document.documentElement.dataset.textSize || "normal",
    page: { display: pcs.display, columns: pcs.gridTemplateColumns },
    studio: { columns: getComputedStyle(studio).gridTemplateColumns.split(" ").length,
      previewOnTop: pr.height > 0 && cr.height > 0 && pr.bottom <= cr.top + 1 && Math.abs(pr.left - cr.left) < 2 },
    presets: { columns: getComputedStyle(list).gridTemplateColumns.split(" ").length, tap, count: tiles.length,
      minW: Math.min(...tiles.map((b) => b.clientWidth)), fsPainted: fsOwn * probe.zoom,
      clipped: tiles.filter((b) => { const s = b.querySelector("strong"); return s && s.scrollWidth > s.clientWidth + 1; })
        .map((b) => (b.textContent || "").trim()) },
    kb: { padNoKb, padKb },
    hOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  };
});
// Reclassify until two consecutive reads agree (cap 6). Not a retry: a layout that never settles is the two-state
// loop the contract forbids, and is reported as one.
async function settledSettingsCell(page) {
  let m = await readSettingsCell(page), settled = false;
  for (let pass = 0; pass < 6 && !settled; pass++) {
    await reclassify(page); await twoFrames(page);
    const next = await readSettingsCell(page);
    settled = JSON.stringify(next) === JSON.stringify(m);
    m = next;
  }
  return { m, settled };
}
async function bootOnExport(page, v) {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
  const imp = await page.evaluate((data) => SettingsExport.applySettings(data, {}), OWNER_EXPORT);
  expect(imp.ok && !imp.failed, "the export seeds the store " + JSON.stringify(imp)).toBe(true);
  await page.reload();
  await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
  await page.addStyleTag({ content: `:root{--sal:${v.sal}px;--sar:${v.sar}px;--sat:${v.sat}px;--sab:${v.sab}px;}` });
  await page.evaluate(() => window.__apex.headless(true));
}
for (const v of CONTRACT_WINDOWS) {
  test.describe(`UI contract settings cells (${v.name})`, () => {
    test.setTimeout(300_000);
    test.use({ viewport: { width: v.w, height: v.h }, hasTouch: true });
    test("text normal/large x UI 100/130 on the export: one reading column, the studio preview on top, --kb reaches the dialog, the sheet never zooms under 100%", async ({ page }) => {
      await bootOnExport(page, v);
      // The way a player reaches it: SETTINGS on the title, then the APPEARANCE door.
      await page.evaluate(() => document.getElementById("mb-settings").click());
      await page.waitForFunction(() => !document.getElementById("pmsettings").hidden, null, { polling: 50, timeout: BOOT_MS });
      await page.evaluate(() => document.getElementById("pm-open-appearance").click());
      await page.locator('#appearance-studio [data-as="preset-list"] button strong').first().waitFor({ state: "attached", timeout: BOOT_MS });
      await page.evaluate(() => document.fonts.ready);
      const bad = [], cells = {};
      for (const textSize of ["normal", "large"]) for (const ui of [100, 130]) {
        const cell = `${v.name} text=${textSize} ui=${ui}`;
        await page.evaluate(([t, u]) => {
          if (t === "normal") delete document.documentElement.dataset.textSize; else document.documentElement.dataset.textSize = t;
          window.__apex.uiScale(u);
        }, [textSize, ui]);
        const { m, settled } = await settledSettingsCell(page);
        cells[cell] = m;
        if (!settled) bad.push(`${cell}: the layout never settled in six reclassify passes`);
        // Preconditions: the knobs landed, and every tier read the layout viewport (contract rule 1).
        if (Math.abs(m.uiScale - ui / 100) > 1e-6 || m.textSize !== textSize) bad.push(`${cell}: knobs did not land (ui ${m.uiScale}, text ${m.textSize})`);
        if (m.probe.viewport[0] !== v.w || m.probe.viewport[1] !== v.h) bad.push(`${cell}: the ICB is not the window ${JSON.stringify(m.probe.viewport)}`);
        if (m.probe.body.density !== "compact" || m.probe.body.shape !== "wide") bad.push(`${cell}: body tier ${JSON.stringify(m.probe.body)}, the contract's A/C/D row is compact / wide`);
        if (m.probe.density !== "compact" || m.probe.shape !== "wide") bad.push(`${cell}: settings sheet ${m.probe.density} / ${m.probe.shape}, not compact / wide`);
        // Gap 3: a phone page is ONE reading column — never the 2-column grid of half-width plates.
        if (m.page.display === "grid") bad.push(`${cell}: the APPEARANCE page is a grid (${m.page.columns})`);
        // Gap 4: one-column studio, preview first; tiles at least three taps wide with whole names at the micro floor.
        if (m.studio.columns !== 1) bad.push(`${cell}: the studio has ${m.studio.columns} columns`);
        if (!m.studio.previewOnTop) bad.push(`${cell}: the preview is not on top of the controls`);
        if (m.presets.columns < 3) bad.push(`${cell}: preset gallery ${m.presets.columns}-up`);
        if (m.presets.minW < m.presets.tap * 3 - 1) bad.push(`${cell}: a preset tile under three taps wide ${JSON.stringify(m.presets)}`);
        if (m.presets.fsPainted < 14 - 1e-6) bad.push(`${cell}: preset names paint at ${m.presets.fsPainted} px, under the 14 px floor`);
        if (m.presets.clipped.length) bad.push(`${cell}: clipped preset names ${m.presets.clipped.join(", ")}`);
        // Gap 5: the keyboard inset reaches the <dialog> (its padding shorthand used to swallow it: 29 / 8 px).
        if (m.kb.padKb !== 180) bad.push(`${cell}: --kb 180px pads the dialog ${m.kb.padKb} px`);
        if (!(m.kb.padNoKb < 180)) bad.push(`${cell}: the no-keyboard pad is already ${m.kb.padNoKb} px`);
        // Gap 14: the fit cap is floored at the shipped size; at UI 100 nothing is capped.
        if (m.probe.zoom < 1 - 1e-9) bad.push(`${cell}: the sheet zooms under 100% (${m.probe.sheetScale})`);
        if (ui === 100 && m.probe.fit === "on") bad.push(`${cell}: capped at UI 100 (${m.probe.sheetScale})`);
        if (m.hOverflow) bad.push(`${cell}: horizontal overflow`);
      }
      expect(bad, JSON.stringify(cells)).toEqual([]);
      if (!v.band) return;
      // THE FIT BAND (gap 14), from the last cell (large / 130, the capped one). A Safari toolbar show/hide moves the
      // host a few px: within ±0.03 the painted cap holds (283 -> 289 is +0.027), a release is never held back
      // (310 fits 130% outright) and the way back re-caps at the same value — no ratchet.
      const at = async (h) => {
        await page.setViewportSize({ width: v.w, height: h });
        await page.waitForFunction((hh) => document.getElementById("pmsettings").clientHeight === hh, h, { polling: 50, timeout: 10_000 });
        const { m, settled } = await settledSettingsCell(page);
        expect(settled, `the fit never settled at ${h} ` + JSON.stringify(m.probe)).toBe(true);
        return m.probe;
      };
      const base = await at(v.h);
      expect(base.fit, "C at UI 130 is the capped cell " + JSON.stringify(base)).toBe("on");
      expect(base.zoom).toBeGreaterThanOrEqual(1);
      expect(base.zoom).toBeLessThan(1.3);
      const taller = await at(v.h + 6);
      expect(taller.sheetScale, "6 px of toolbar keeps the painted cap " + JSON.stringify(taller)).toBe(base.sheetScale);
      const released = await at(310);
      expect(released.fit, "a release is never held back " + JSON.stringify(released)).not.toBe("on");
      const back = await at(v.h);
      expect(back.sheetScale, "the way back re-caps at the same value " + JSON.stringify(back)).toBe(base.sheetScale);
    });
  });
}

// THE STALE-PORTRAIT LAUNCH (contract §2 row Aₛ, §6): on a Home Screen landscape launch iOS can still report the
// PORTRAIT innerWidth/innerHeight while CSS already lays out landscape. Every tier read inner*, so the body booted
// tall + normal and every screen sat on the wrong tier until a resize that never came. The boot stamp (index.html)
// and SheetShape.classifyBody now read documentElement.clientWidth/Height; this cell fakes exactly that launch.
test.describe("UI contract boot cell — a stale portrait inner* at a landscape launch", () => {
  test.setTimeout(300_000);
  test.use({ viewport: { width: 852, height: 393 }, hasTouch: true });
  test("innerWidth/innerHeight 393x852 while the ICB is 852x393 on the export: body wide + compact, the probe shows the disagreement", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
    const imp = await page.evaluate((data) => SettingsExport.applySettings(data, {}), OWNER_EXPORT);
    expect(imp.ok && !imp.failed, "the export seeds the store " + JSON.stringify(imp)).toBe(true);
    await page.addInitScript(() => {
      Object.defineProperty(window, "innerWidth", { configurable: true, get() { return 393; } });
      Object.defineProperty(window, "innerHeight", { configurable: true, get() { return 852; } });
    });
    await page.reload();
    await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
    const s = await page.evaluate(() => {
      const probe = window.SheetShape.layoutProbe(document.getElementById("pmsettings-inner"));
      return { inner: probe.inner, viewport: probe.viewport, body: probe.body,
        uiScale: parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--ui-scale")) || 1 };
    });
    // Preconditions: the stale pair held through boot, and the ICB is the landscape window; the export's UI 109 makes
    // 393 / 1.09 = 360 own (compact under the body's 600) and 852 / 1.09 = 781 own (wide over 620) — the old inner*
    // reading gave 781 tall / 360 narrow, i.e. normal + narrow.
    expect(s.inner, "the stub held " + JSON.stringify(s)).toEqual([393, 852]);
    expect(s.viewport, "the layout viewport is the landscape window").toEqual([852, 393]);
    expect(s.body.shape, "body shape from the ICB " + JSON.stringify(s)).toBe("wide");
    expect(s.body.density, "body density from the ICB " + JSON.stringify(s)).toBe("compact");
  });
});

// UI contract cells (#5153 gap 10; PR D of #5153 — `OWNER_EXPORT` is PR B's constant above, the UI contract note of PR #5154, UI-CONTRACT-2026-11-06 §3 rule 8 and §4.3;
// measured in docs/notes/UI-PR-D-MEASURE-2026-11-06.md): the pause card in the owner's three
// windows — A the iOS Home Screen app (852x393, insets 59/21/59), C the Safari tab (852x283,
// insets 59/0/59), D the spec phone (844x390) — seeded from Bryce's own export (TEXT large,
// UI 109 %, PAUSE look btn 115 / w 130). ONE phone card for every stored layout: nothing in the
// card scrolls, every door is on screen, every tray label fits its tile. Before the fix each of
// LIST / COMPACT / WIDE / SIDEBAR swapped in the 420 card and put QUIT 221-420 own px past the sheet.
const PHONE_WINDOWS = [
  { name: "A home-screen 852x393", viewport: { width: 852, height: 393 }, insets: { l: 59, r: 59, b: 21 } },
  { name: "C safari 852x283", viewport: { width: 852, height: 283 }, insets: { l: 59, r: 59, b: 0 } },
  { name: "D spec phone 844x390", viewport: { width: 844, height: 390 }, insets: { l: 0, r: 0, b: 0 } },
];
for (const win of PHONE_WINDOWS) test.describe("UI contract pause cells — " + win.name, () => {
  test.use({ ...uiTestOptions({ touch: true, viewport: win.viewport, deviceScaleFactor: 1 }) });
  test("one phone card for every stored layout: no scroll, every door on screen, labels fit", async ({ page }) => {
    await page.goto("/?inspector=0");
    await waitReady(page);
    const imported = await page.evaluate((d) => SettingsExport.applySettings(d, {}), OWNER_EXPORT);
    expect(imported.ok, "the owner export imports: " + JSON.stringify(imported)).toBe(true);
    await page.reload();
    await waitReady(page);
    await page.addStyleTag({ content: `:root{--sal:${win.insets.l}px;--sar:${win.insets.r}px;--sat:0px;--sab:${win.insets.b}px;}` });
    await page.evaluate(() => window.__apex.race("monza", null, null, { grid: "tier" }));
    await page.waitForFunction(() => { try { return window.__apex.info().track === "monza"; } catch (_) { return false; } },
      null, { polling: 100, timeout: BOOT_MS });
    await page.evaluate(() => { window.__apex.park(0.1); document.getElementById("pausemenu").hidden = false; });
    await page.waitForFunction(() => !document.getElementById("pausemenu").hidden && document.querySelectorAll("#pm-quick-doors > *").length > 3,
      null, { polling: 50, timeout: 8_000 });
    const body = await page.evaluate(() => ({ density: document.body.dataset.density, shape: document.body.dataset.shape,
      ui: getComputedStyle(document.documentElement).getPropertyValue("--ui-scale").trim(), text: document.documentElement.dataset.textSize }));
    expect(body, "the owner's window is a compact wide body at the export's knobs").toMatchObject({ density: "compact", shape: "wide", ui: "1.09", text: "large" });
    const seen = {};
    for (const [layout, side] of [["grid", null], ["list", null], ["compact", null], ["wide", null], ["sidebar", null], ["grid", "right"], ["sidebar", "right"]]) {
      await page.evaluate(([l, s]) => {
        const de = document.documentElement.dataset;
        if (l === "grid") delete de.pauseLayout; else de.pauseLayout = l;
        if (s) de.pauseSide = s; else delete de.pauseSide;
        SheetShape.reclassify();
      }, [layout, side]);
      await page.waitForFunction(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true)))), null, { polling: 50, timeout: 2_000 });
      const cell = await page.evaluate(() => {
        const z = (el) => el.currentCSSZoom || 1;
        const pm = document.getElementById("pausemenu"), sheet = pm.querySelector(":scope > .sheet"), sb = sheet.querySelector(":scope > .sheet-body");
        const sr = sheet.getBoundingClientRect();
        const doors = {};
        for (const id of ["pm-resume", "pm-restart", "pm-settings", "pm-quit"]) {
          const r = document.getElementById(id).getBoundingClientRect();
          doors[id] = { pastSheet: +(r.bottom - sr.bottom).toFixed(1), onScreen: r.top >= 0 && r.bottom <= innerHeight + 0.5, paintedH: +r.height.toFixed(1) };
        }
        const tiles = [...document.querySelectorAll("#pm-quick-doors > *")].filter((c) => !c.hidden && getComputedStyle(c).display !== "none");
        const overflowing = tiles.map((t) => t.tagName === "DETAILS" ? t.querySelector("summary") : t).filter((el) => el.scrollWidth > el.clientWidth + 1).map((el) => el.textContent.trim());
        return { areas: getComputedStyle(sb).gridTemplateAreas, bodyScroll: sb.scrollHeight - sb.clientHeight, sheetOwnH: +(sr.height / z(sheet)).toFixed(1),
          sheetInScreen: sr.top >= 0 && sr.bottom <= innerHeight + 0.5, doors, tiles: tiles.length, overflowing, sheetHeight: getComputedStyle(sheet).height };
      });
      seen[layout + (side ? "/" + side : "")] = cell;
      const tag = `${win.name} ${layout}${side ? " side=" + side : ""}: `;
      expect(cell.bodyScroll, tag + "the card body never scrolls").toBeLessThanOrEqual(1);
      expect(cell.sheetInScreen, tag + "the sheet sits inside the window").toBe(true);
      expect(cell.areas, tag + "the phone card's grid (RESUME in a thumb column or along the bottom)").toMatch(/resume/);
      for (const [id, d] of Object.entries(cell.doors)) {
        expect(d.pastSheet, tag + id + " ends inside the sheet").toBeLessThanOrEqual(0.5);
        expect(d.onScreen, tag + id + " is on screen").toBe(true);
        expect(d.paintedH, tag + id + " paints at least the WCAG 44 (COMPACT is the chip-floor layout; the rest the 52 comfort floor)").toBeGreaterThanOrEqual(layout === "compact" ? 44 : 52);
      }
      expect(cell.tiles, tag + "the tool tray is populated").toBeGreaterThanOrEqual(6);
      expect(cell.overflowing, tag + "every tray label fits its tile").toEqual([]);
    }
    // WIDE puts the doors along the bottom edge; SIDE RIGHT mirrors the thumb column.
    expect(seen.wide.areas).toMatch(/"resume restart settings quit"/);
    expect(seen["grid/right"].areas).toMatch(/"tools tools resume"/);
    // The five layouts share ONE box: the card's own height is the same within a door's worth.
    const heights = Object.values(seen).map((c) => c.sheetOwnH);
    expect(Math.max(...heights) - Math.min(...heights), "every layout keeps the one phone card's box (" + heights.join("/") + ")").toBeLessThanOrEqual(40);
  });
  // #5200 (Bryce's iPhone, build 25617: "on pause menu there's no resume"). His screenshots are the 420 card at a UI
  // SIZE near 51 %: a landscape phone is a NORMAL body there (393 / 0.51 = 770 own px), the list scrolled 209 own px
  // and RESUME, an absolute bar under the scroller's fade mask, was not painted at all. The cells above only ever ran
  // the export's 109 %. Every mode x UI SIZE opens the card through the real pause button and asks the same things.
  test("RESUME is the first, focused, painted door in every mode and UI SIZE, and the card never scrolls", async ({ page }) => {
    await page.goto("/?inspector=0");
    await waitReady(page);
    const imported = await page.evaluate((d) => SettingsExport.applySettings(d, {}), OWNER_EXPORT);
    expect(imported.ok, "the owner export imports: " + JSON.stringify(imported)).toBe(true);
    // #5543: music is live in every cell, so the NOW PLAYING line is part of the card the questions below measure.
    await page.evaluate(() => { localStorage.setItem("apex26.sound", "true"); localStorage.setItem("apex26.music", "true"); });
    await page.reload();
    await waitReady(page);
    await page.addStyleTag({ content: `:root{--sal:${win.insets.l}px;--sar:${win.insets.r}px;--sat:0px;--sab:${win.insets.b}px;}` });
    const rows = [];
    for (const mode of ["race", "timeTrial"]) {
      await page.evaluate((m) => m === "race" ? window.__apex.race("bahrain", null, null, { grid: "tier" }) : window.__apex.tt("bahrain"), mode);
      await page.waitForFunction((m) => { try { const i = window.__apex.info(); return i.track === "bahrain" && !!i.timeTrial === (m === "timeTrial"); } catch (_) { return false; } },
        mode, { polling: 100, timeout: BOOT_MS });
      await page.evaluate(() => window.__apex.park(0.1));
      for (const ui of [null, 51, 40]) {   // null = the export's own (109 % on touch)
        await page.evaluate((u) => { window.__apex.uiScale(u == null ? 109 : u); SheetShape.reclassify(); }, ui);
        await page.evaluate(() => document.getElementById("pausebtn").click());
        await page.waitForFunction(() => { const pm = document.getElementById("pausemenu"); return pm.open && !pm.hidden && document.querySelectorAll("#pm-quick-doors > *").length > 3; },
          null, { polling: 50, timeout: 8_000 });
        await page.waitForFunction(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true)))), null, { polling: 50, timeout: 2_000 });
        const cell = await page.evaluate(() => {
          const pm = document.getElementById("pausemenu"), sheet = pm.querySelector(":scope > .sheet"), sb = sheet.querySelector(":scope > .sheet-body");
          const sr = sheet.getBoundingClientRect();
          const shown = (el) => !el.hidden && getComputedStyle(el).display !== "none" && el.getBoundingClientRect().width > 0;
          const doors = [...pm.querySelectorAll("button, summary")].filter((el) => shown(el) && !el.closest("details:not([open]) > :not(summary)"));
          const rect = (el) => { const r = el.getBoundingClientRect(); return { id: el.id || el.textContent.trim(), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), area: r.width * r.height, inSheet: r.top >= sr.top - 0.5 && r.bottom <= sr.bottom + 0.5 && r.left >= sr.left - 0.5 && r.right <= sr.right + 0.5 }; };
          const all = doors.map(rect);
          const resume = document.getElementById("pm-resume"), rr = resume.getBoundingClientRect();
          const hit = document.elementFromPoint(rr.x + rr.width / 2, rr.y + rr.height / 2);
          const card = document.getElementById("pm-now-card"), cr = card.getBoundingClientRect(), title = document.getElementById("pm-now").getBoundingClientRect();
          return { now: { shown: shown(card), inSheet: cr.top >= sr.top - 0.5 && cr.bottom <= sr.bottom + 0.5 && cr.left >= sr.left - 0.5 && cr.right <= sr.right + 0.5, titleW: Math.round(title.width),
              transport: ["pm-prev", "pm-play", "pm-skip"].filter((id) => { const el = document.getElementById(id), r = el.getBoundingClientRect(); return shown(el) && !el.disabled && document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === el; }) },
            short: document.body.hasAttribute("data-pause-short"), density: document.body.dataset.density, ui: getComputedStyle(document.documentElement).getPropertyValue("--ui-scale").trim(),
            bodyScroll: sb.scrollHeight - sb.clientHeight, sheetScroll: sheet.scrollHeight - sheet.clientHeight,
            sheet: { x: Math.round(sr.x), y: Math.round(sr.y), w: Math.round(sr.width), h: Math.round(sr.height), inScreen: sr.top >= 0 && sr.left >= 0 && sr.bottom <= document.documentElement.clientHeight + 0.5 && sr.right <= document.documentElement.clientWidth + 0.5 },
            firstDoor: all[0].id, focus: document.activeElement && document.activeElement.id, hit: hit && hit.id, resumePosition: getComputedStyle(resume).position,
            resume: rect(resume), maxOther: Math.max(...all.filter((d) => d.id !== "pm-resume").map((d) => d.area)), outside: all.filter((d) => !d.inSheet).map((d) => d.id), small: all.filter((d) => d.h < 43.5).map((d) => d.id + " " + d.h), doors: all.length };
        });
        const tag = `${win.name} ${mode} UI ${ui == null ? "export" : ui + " %"}: `;
        rows.push(tag + JSON.stringify(cell));
        expect(cell.short, tag + "the short landscape window is stamped").toBe(true);
        expect(cell.bodyScroll, tag + "the card body does not scroll").toBeLessThanOrEqual(1);
        expect(cell.sheetScroll, tag + "the sheet does not scroll").toBeLessThanOrEqual(1);
        expect(cell.sheet.inScreen, tag + "the sheet sits inside the window").toBe(true);
        expect(cell.firstDoor, tag + "RESUME is the first door in reading (DOM, Tab) order").toBe("pm-resume");
        expect(cell.focus, tag + "RESUME has the default focus").toBe("pm-resume");
        expect(cell.hit, tag + "RESUME is what a tap at its centre lands on (painted, not masked or covered)").toBe("pm-resume");
        expect(cell.resumePosition, tag + "RESUME is in flow").toBe("static");
        expect(cell.resume.h, tag + "RESUME paints at least 44 px").toBeGreaterThanOrEqual(44);
        expect(cell.resume.area, tag + "no door on the card is larger than RESUME (QUIT may tie it; RESUME alone carries the primary fill)").toBeGreaterThanOrEqual(cell.maxOther * 0.99);
        expect(cell.outside, tag + "every door ends inside the sheet").toEqual([]);
        expect(cell.small, tag + "every door paints the 44 px floor").toEqual([]);
        expect(cell.now, tag + "NOW PLAYING is on the card with its title and a tappable prev / play / next (#5543)").toMatchObject({ shown: true, inSheet: true, transport: ["pm-prev", "pm-play", "pm-skip"] });
        expect(cell.now.titleW, tag + "the song title is painted").toBeGreaterThan(0);
        expect(cell.sheet.w, tag + "the card uses the width (the 420 card was 214 px here)").toBeGreaterThanOrEqual(600);
        await page.evaluate(() => document.getElementById("pm-resume").click());
        await page.waitForFunction(() => document.getElementById("pausemenu").hidden, null, { polling: 50, timeout: 8_000 });
      }
    }
    test.info().annotations.push({ type: "pause-cells", description: rows.join("\n") });
  });
});

// UI contract cells for the circuit picker and race settings (#5153 gaps 13 and 16, UI contract 2026-11-06 §4.5;
// measured in docs/notes/UI-PR-D-MEASURE-2026-11-06.md): on the owner's three windows and export, the picker is
// ONE four-row card — the filter chips share the title row, the flag strip, the hero still (never a scroller, the
// two key numbers riding on it), the foot — and race settings are compact like their siblings with head and START
// RACE fixed around the one body scroller and two columns on both phones. Before: the hero section scrolled 58-155
// own px in every window; race settings were normal-density with ONE column at the export's 109 %, and in C the whole
// sheet scrolled with START RACE under the fold.
for (const win of PHONE_WINDOWS) test.describe("UI contract select + race cells — " + win.name, () => {
  test.use({ ...uiTestOptions({ touch: true, viewport: win.viewport, deviceScaleFactor: 1 }) });
  test("the picker's hero never scrolls and race settings keep START RACE fixed", async ({ page }) => {
    await page.goto("/?inspector=0");
    await waitReady(page);
    const imported = await page.evaluate((d) => SettingsExport.applySettings(d, {}), OWNER_EXPORT);
    expect(imported.ok, "the owner export imports: " + JSON.stringify(imported)).toBe(true);
    await page.reload();
    await waitReady(page);
    await page.addStyleTag({ content: `:root{--sal:${win.insets.l}px;--sar:${win.insets.r}px;--sat:0px;--sab:${win.insets.b}px;}` });
    await page.evaluate(() => window.__apex.headless(true));
    await page.evaluate(() => document.getElementById("mb-race").click());
    await page.waitForFunction(() => document.querySelectorAll("#sel-tracks .track-row").length > 20, null, { polling: 100, timeout: BOOT_MS });
    await page.evaluate(() => window.SheetShape?.reclassify());
    await twoFrames(page);
    const sel = await page.evaluate(() => {
      const $ = (id) => document.getElementById(id), z = (el) => el.currentCSSZoom || 1;
      const inner = $("sel-inner"), sec = $("sel-track-section"), hero = $("sel-hero"), head = inner.querySelector(":scope > .sheet-head"), filt = $("sel-track-filter"), go = $("sel-go");
      const hr = hero.getBoundingClientRect(), gr = go.getBoundingClientRect(), ir = inner.getBoundingClientRect();
      const scrollers = [...inner.querySelectorAll("*")].filter((el) => { const o = getComputedStyle(el).overflowY; return (o === "auto" || o === "scroll") && el.scrollHeight > el.clientHeight + 1; }).map((el) => el.id || el.className);
      return { density: inner.dataset.density, shape: inner.dataset.shape, ui: getComputedStyle(document.documentElement).getPropertyValue("--ui-scale").trim(),
        sectionScroll: sec.scrollHeight - sec.clientHeight, heroOwnH: +(hr.height / z(hero)).toFixed(1), verticalScrollers: scrollers,
        filterInTitleRow: !!filt && Math.abs(filt.getBoundingClientRect().top - head.getBoundingClientRect().top) < 12,
        headOverflow: head.scrollWidth - head.clientWidth,
        nameClipped: $("sel-preview-name").scrollWidth > $("sel-preview-name").clientWidth + 1,
        goOnScreen: gr.top >= 0 && gr.bottom <= innerHeight + 0.5, goPastSheet: +(gr.bottom - ir.bottom).toFixed(1), sheetInScreen: ir.top >= 0 && ir.bottom <= innerHeight + 0.5 };
    });
    const tag = win.name + " select: ";
    expect(sel, tag + "a compact wide picker at the export's UI SIZE").toMatchObject({ density: "compact", shape: "wide", ui: "1.09" });
    expect(sel.sectionScroll, tag + "the hero section never scrolls").toBeLessThanOrEqual(1);
    expect(sel.verticalScrollers, tag + "no vertical scroller anywhere in the picker").toEqual([]);
    expect(sel.heroOwnH, tag + "the still keeps a real slot (C gets what 283 px leave)").toBeGreaterThanOrEqual(60);
    expect(sel.filterInTitleRow, tag + "the filter chips share the title row").toBe(true);
    expect(sel.headOverflow, tag + "the title fits its column").toBeLessThanOrEqual(0);
    expect(sel.nameClipped, tag + "the circuit name reads whole").toBe(false);
    expect(sel.sheetInScreen, tag + "the sheet sits inside the window").toBe(true);
    expect(sel.goPastSheet, tag + "RACE SETUP ends inside the sheet").toBeLessThanOrEqual(0.5);
    expect(sel.goOnScreen, tag + "RACE SETUP is on screen").toBe(true);
    // RACE SETTINGS
    await page.evaluate(() => document.getElementById("sel-go").click());
    await page.waitForFunction(() => !document.getElementById("race-settings").hidden, null, { polling: 50, timeout: BOOT_MS });
    await page.evaluate(() => window.SheetShape?.reclassify());
    await twoFrames(page);
    const rs = await page.evaluate(() => {
      const sheet = document.querySelector("#race-settings > .sheet"), body = document.getElementById("rs-body"), go = document.getElementById("rs-go");
      const sr = sheet.getBoundingClientRect(), gr = go.getBoundingClientRect();
      const scrollers = [...sheet.querySelectorAll("*")].concat([sheet]).filter((el) => { const o = getComputedStyle(el).overflowY; return (o === "auto" || o === "scroll") && el.scrollHeight > el.clientHeight + 1; }).map((el) => el.id || el.className);
      return { density: sheet.dataset.density, shape: sheet.dataset.shape, compactAt: getComputedStyle(sheet).getPropertyValue("--compact-at").trim(), display: getComputedStyle(sheet).display,
        sheetScroll: sheet.scrollHeight - sheet.clientHeight, scrollers, columns: getComputedStyle(body).gridTemplateColumns.split(" ").length,
        goOnScreen: gr.top >= 0 && gr.bottom <= innerHeight + 0.5, goPastSheet: +(gr.bottom - sr.bottom).toFixed(1), goPaintedH: +gr.height.toFixed(1), sheetInScreen: sr.top >= 0 && sr.bottom <= innerHeight + 0.5 };
    });
    const rtag = win.name + " race settings: ";
    expect(rs, rtag + "compact like its siblings, the sheet grid kept").toMatchObject({ density: "compact", shape: "wide", compactAt: "480px", display: "grid" });
    expect(rs.sheetScroll, rtag + "the sheet itself never scrolls").toBeLessThanOrEqual(1);
    expect(rs.scrollers, rtag + "#rs-body is the ONE scroller").toEqual(["rs-body"]);
    expect(rs.columns, rtag + "two columns on a phone").toBe(2);
    expect(rs.sheetInScreen, rtag + "the sheet sits inside the window").toBe(true);
    expect(rs.goPastSheet, rtag + "START RACE ends inside the sheet").toBeLessThanOrEqual(0.5);
    expect(rs.goOnScreen, rtag + "START RACE is on screen").toBe(true);
    expect(rs.goPaintedH, rtag + "START RACE paints the WCAG floor").toBeGreaterThanOrEqual(44);
  });
});
