// @ts-check
// LIVE RESIZE — the layout has to be right AFTER it changes, not only when it
// starts that way.
//
// Every other layout guard in this suite opens a screen at a fixed viewport:
// `test.use({ viewport })` sets the size before the page loads, so the first
// paint is also the only paint being judged. That misses a whole class of bug,
// because three of this app's layout answers are computed by JavaScript from a
// measurement rather than declared in CSS — `data-shape`, `data-pair` and
// `data-density`, all written by js/game/sheetshape.js off a ResizeObserver.
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
// Stubbing out the classifyDensity call in js/game/sheetshape.js fails case 3
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
import { test, expect } from "../helpers/fixtures.js";

const DESKTOP = { width: 1440, height: 900 };
const PHONE_LANDSCAPE = { width: 852, height: 393 };
const PHONE_PORTRAIT = { width: 393, height: 852 };
const SHORT_WIDE = { width: 1000, height: 462 };

const SIZES = [
  ["desktop", DESKTOP],
  ["phone-landscape", PHONE_LANDSCAPE],
  ["phone-portrait", PHONE_PORTRAIT],
  ["short-wide", SHORT_WIDE],
];

async function waitReady(page) {
  await page.waitForFunction(() => window.__apex && window.__apex.race,
    { polling: 100, timeout: 20_000 });
}

// Open the garage the way a player does. It is the densest screen in the app —
// the only docked one, the only one with a live 3D preview beside it, and the
// one carrying all three classification attributes at once.
async function openGarage(page) {
  await page.evaluate(() => document.getElementById("mb-garage").click());
  await page.waitForFunction(() => !document.getElementById("carsetup").hidden,
    { polling: 100, timeout: 10_000 });
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
      await page.waitForFunction((expected) => {
        const el = document.getElementById("cs-inner");
        return el.dataset.shape === expected.shape &&
          el.dataset.pair === expected.pair &&
          el.dataset.density === expected.density;
      }, fresh[name], { polling: 50, timeout: 5_000 }).catch(() => {});

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

    await page.evaluate(() => window.__apex.uiScale(100));
    await page.waitForTimeout(400);
    const at100 = await readState(page);

    await page.evaluate(() => window.__apex.uiScale(150));
    await page.waitForFunction(() => {
      const el = document.getElementById("cs-inner");
      return el.dataset.density === "compact";
    }, null, { polling: 50, timeout: 5_000 });
    const at150 = await readState(page);

    expect(at100.density, "not compact at UI SIZE 100% on this viewport").toBe("normal");
    expect(at150.density, "compact once the sheet is short in its own units").toBe("compact");
    expect(at150.hOverflow, "no horizontal overflow at 150%").toBe(false);
    expect(at150.doneOnScreen, "DONE reachable at 150%").toBe(true);

    // And back down again, because a one-way classifier would pass the above.
    await page.evaluate(() => window.__apex.uiScale(100));
    await page.waitForFunction(() => {
      const el = document.getElementById("cs-inner");
      return el.dataset.density === "normal";
    }, null, { polling: 50, timeout: 5_000 });
    expect((await readState(page)).density, "back to normal when the scale drops").toBe("normal");
  });
});
