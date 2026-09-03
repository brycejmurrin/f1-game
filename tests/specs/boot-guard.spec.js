// @ts-check
// THE BOOT GUARD: a module that fails to load must not leave a dead game.
//
// WHY THIS EXISTS — a live incident, not a hypothetical. Build 1238 shipped
// js/career/season-cal.js, a brand-new URL that had existed in no prior deploy.
// GitHub Pages served the updated index.html from an edge that did not yet have
// the file, the browser cached that 404 against the VERSIONED url, and the game
// then died on every load with a bare "Can't find variable: SeasonCal" — the
// file that defines the global simply was not there, and js/game.js was fine.
// A plain reload re-read the cached 404, so it did not heal on its own.
//
// Every new js/ module has that same first-deploy window, so the shell now
// detects a failed script load (capture-phase `error`, which is the only way to
// see a resource failure) and repairs it once. These two cases are the whole
// contract, and they pull in opposite directions: repair aggressively enough to
// fix the transient, but bounded hard enough that a genuinely absent file
// cannot put the page in a reload loop.
import { test, expect } from "@playwright/test";

const MODULE = "**/js/career/season-cal.js*";

/** Count main-frame navigations — the reload budget is the thing under test. */
function trackNavs(page) {
  const state = { n: 0 };
  page.on("framenavigated", (f) => { if (f === page.mainFrame()) state.n++; });
  return state;
}

const overlayText = (page) => page.evaluate(() => {
  const d = document.getElementById("__err_overlay");
  return d && d.style.display !== "none" ? d.textContent.replace(/\s+/g, " ") : null;
});

test.describe("Boot guard — a module that failed to load", () => {
  test("a ONE-OFF 404 is repaired: one reload, then the game boots", async ({ page }) => {
    const navs = trackNavs(page);
    let served404 = 0;
    await page.route(MODULE, (route) => {
      if (served404 === 0) { served404++; return route.fulfill({ status: 404, body: "x" }); }
      return route.continue();
    });
    await page.goto("/", { waitUntil: "domcontentloaded" });

    // `const SeasonCal = …` is a LEXICAL global, so it is NOT a window property —
    // testing window.SeasonCal reads undefined even on a healthy load. Same realm
    // trap as tests/unit/season-cal.test.mjs.
    await page.waitForFunction(() => typeof SeasonCal !== "undefined",
      undefined, { timeout: 45_000, polling: 100 });

    expect(served404, "the module 404'd exactly once").toBe(1);
    expect(navs.n, "repaired with a single reload, not a storm").toBe(2);
    expect(await overlayText(page), "a repaired boot shows the player nothing").toBeNull();
  });

  test("a PERMANENT 404 names the file instead of looping", async ({ page }) => {
    const navs = trackNavs(page);
    await page.route(MODULE, (route) => route.fulfill({ status: 404, body: "x" }));
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect
      .poll(() => overlayText(page), { timeout: 45_000 })
      .toContain("Module failed to load");

    const text = await overlayText(page);
    // The CAUSE, not the symptom. Downstream ReferenceErrors fire in a cascade
    // and each would overwrite the overlay; the root-cause message is pinned so
    // the player is told which file never arrived rather than which global was
    // missing because of it.
    expect(text).toContain("season-cal.js");
    expect(text, "the pinned cause outranks the ReferenceError it causes")
      .not.toContain("is not defined");
    expect(navs.n, "exactly one repair attempt — never a reload loop").toBe(2);
  });
});
