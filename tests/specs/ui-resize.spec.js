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
import { test, expect, BOOT_MS } from "../helpers/fixtures.js";

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
  // fire"). Every other layout tool in this repo (tools/layout-audit.mjs, the
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

// Open the garage the way a player does. It is the densest screen in the app —
// the only docked one, the only one with a live 3D preview beside it, and the
// one carrying all three classification attributes at once.
async function openGarage(page) {
  await page.evaluate(() => document.getElementById("mb-garage").click());
  await page.waitForFunction(() => !document.getElementById("carsetup").hidden,
    null, { polling: 100, timeout: 10_000 });
  await page.waitForTimeout(400);
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
    hOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
    doneOnScreen: db.width > 0 && db.height > 0 &&
      db.top >= 0 && db.bottom <= window.innerHeight + 1 &&
      db.left >= 0 && db.right <= window.innerWidth + 1,
  };
});

test.describe("Live resize — the garage re-answers its own layout questions", () => {
  test("resizing into a size matches loading fresh at that size", async ({ page }) => {
    // The oracle: what each size looks like when it is the FIRST size.
    /** @type {Record<string, any>} */
    const fresh = {};
    for (const [name, size] of SIZES) {
      await page.setViewportSize(size);
      await page.goto("/");
      await waitReady(page);
      await openGarage(page);
      fresh[name] = await readState(page);
      expect(fresh[name].hOverflow, `${name} fresh: no horizontal overflow`).toBe(false);
      expect(fresh[name].doneOnScreen, `${name} fresh: DONE reachable`).toBe(true);
    }

    // Now walk every size in one session, resizing rather than reloading, and
    // require the same answer. Load once, then never again.
    await page.setViewportSize(DESKTOP);
    await page.goto("/");
    await waitReady(page);
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
        return el.dataset.shape === expected.shape &&
          el.dataset.pair === expected.pair &&
          el.dataset.density === expected.density;
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
    await page.goto("/");
    await waitReady(page);
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
    await page.goto("/");
    await waitReady(page);
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
    await page.evaluate(() => window.__apex.uiScale(50));
    await page.waitForTimeout(400);
    const at100 = await readState(page);

    await page.evaluate(() => window.__apex.uiScale(150));
    await page.waitForFunction(() => {
      const el = document.getElementById("cs-inner");
      return el.dataset.density === "compact";
    }, null, { polling: 50, timeout: 5_000 });
    const at150 = await readState(page);

    expect(at100.density, "not compact at UI SIZE 50% on this viewport").toBe("normal");
    expect(at150.density, "compact once the sheet is short in its own units").toBe("compact");
    expect(at150.hOverflow, "no horizontal overflow at 150%").toBe(false);
    expect(at150.doneOnScreen, "DONE reachable at 150%").toBe(true);

    // And back down again, because a one-way classifier would pass the above.
    await page.evaluate(() => window.__apex.uiScale(50));
    await page.waitForFunction(() => {
      const el = document.getElementById("cs-inner");
      return el.dataset.density === "normal";
    }, null, { polling: 50, timeout: 5_000 });
    expect((await readState(page)).density, "back to normal when the scale drops").toBe("normal");
  });

  test("extreme UI size yields only enough to keep dense content functional", async ({ page }) => {
    await page.setViewportSize({ width: 734, height: 343 });
    await page.goto("/");
    await waitReady(page);
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
    await page.goto("/");
    await waitReady(page);
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

    const before = await read();
    expect(before.padBottom, "no keyboard: the pad is just the safe-area gutter")
      .toBeLessThan(120);

    // Exactly the two things watchKeyboard does: write the property, reclassify.
    await page.evaluate(() => {
      document.documentElement.style.setProperty("--kb", "120px");
      window.SheetShape.reclassify();
    });
    await page.waitForTimeout(100);
    const withKb = await read();
    expect(withKb.padBottom, "--kb reaches .screen as bottom padding").toBe(120);
    expect(withKb.effective, "the fit cap tightens for the space the keyboard took")
      .toBeLessThan(before.effective);
    expect(withKb.doneOnScreen, "the action bar stays above the keyboard").toBe(true);

    // And back, because a pad or cap that survives the keyboard closing is
    // the same ratchet bug the rotation case guards against.
    await page.evaluate(() => {
      document.documentElement.style.removeProperty("--kb");
      window.SheetShape.reclassify();
    });
    await page.waitForTimeout(100);
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
      await page.goto("/");
      await waitReady(page);
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
      await page.evaluate(() => document.getElementById("pm-lighting").click());
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
