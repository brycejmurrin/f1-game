// @ts-check
// TITLE FIT — the landscape title screen never scrolls (#5150).
//
// Bryce, 2026-11-06, on the iPhone home-screen app at 852x393: "Things are
// still broken. Let's reconsider from scratch. The title page should not be
// scrollable." On the Tuesday-night tree his stored TITLE LAYOUT (WIDTH 20)
// made #menu-buttons a scroller — scrollHeight 569 in a 343px box, USE AS
// CONTROLLER below the fold — and the Nov 4–5 values (WIDTH 40, STACK) the
// same (the #5139 sweep: 563 in 343). The fix is by construction
// (js/ui/title-layout.js fit(): every size and offset is a request, the
// overlay's content box is the law); this spec is the matrix the issue pins:
// four phone geometries with CDP safe-area insets, three boot profiles, and
// every stored layout value applied in-page, each cell held to the five
// requirements in tests/helpers/title-fit.mjs judge(). Cells are never dropped
// and tolerances never widen: 1px on containment, 0 on scroll extents.
//
// Not emulated: iOS itself (display-mode: standalone and the visual-viewport
// quirk behind the ~58px band). What CAN be held is that #overlay and #game
// are exactly the viewport (`fixed; inset: 0`, no vh), which requirement 4
// does; the band's other candidate — the sticky utility-row scrim #menu-buttons
// paints only as a scroller (.sf-scroll) — cannot appear once nothing scrolls.
import { test, expect, BOOT_MS } from "../helpers/fixtures.js";
import { uiTestOptions } from "../../tools/lib/ui-device-profile.mjs";
import { GEOS, profiles, sweep, settleInPage, measureInPage, judge, judgeStored, staleLaunchInPage, firstFlagsInPage } from "../helpers/title-fit.mjs";

const SETTLE_FRAMES = 12;

/** @param {import("@playwright/test").Page} page @param {{ json: object, raw: object }} store */
async function seed(page, store) {
  await page.addInitScript(({ json, raw }) => {
    try {
      for (const [k, v] of Object.entries(json)) localStorage.setItem("apex26." + k, JSON.stringify(v));
      for (const [k, v] of Object.entries(raw)) localStorage.setItem("apex26." + k, v);
    } catch (_) { /* storage off */ }
  }, store);
}

/** @param {import("@playwright/test").Page} page @param {{ top: number, left: number, bottom: number, right: number }} insets */
async function insets(page, insets) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets });
}

/** @param {import("@playwright/test").Page} page */
async function bootTitle(page) {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex && window.SheetShape && typeof TitleLayout !== "undefined", null, { polling: 100, timeout: BOOT_MS });
  await page.evaluate(() => {
    window.__apex.headless(true);
    document.documentElement.dataset.titleIntro = "off";
    document.getElementById("overlay")?.removeAttribute("data-intro");
  });
  // Web fonts and the boot stamp land first (the brand's box moves with the
  // wordmark's font); measure() then waits for the fit itself to hold still.
  await page.waitForFunction(() => document.fonts.status === "loaded" && document.documentElement.hasAttribute("data-booted"),
    null, { polling: 100, timeout: BOOT_MS });
}

/** @param {import("@playwright/test").Page} page */
async function measure(page) {
  const frames = await page.evaluate(settleInPage, SETTLE_FRAMES);
  const m = await page.evaluate(measureInPage);
  return { frames, m };
}

for (const geo of GEOS) {
  test.describe(`title fit ${geo.name}`, () => {
    test.use({ viewport: { width: geo.w, height: geo.h }, hasTouch: true, isMobile: true });

    for (const prof of profiles()) {
      test(`boots ${prof.name} without a scroll${prof.sweep ? ", then every stored layout" : ""}`, async ({ page }) => {
        test.setTimeout(prof.sweep ? 420_000 : 150_000);
        await insets(page, geo.insets);
        await seed(page, prof.store);
        await bootTitle(page);
        const sal = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--sal").trim());
        expect(sal, "the CDP insets reached env(safe-area-inset-left)").toBe(`${geo.insets.left}px`);

        const boot = await measure(page);
        expect(boot.frames, "the fit settled").toBeGreaterThan(0);
        expect(judge(boot.m, { offsets: prof.offsets }), `${geo.name} boot ${prof.name}: ${JSON.stringify({ fit: boot.m.fit, mb: boot.m.mb, ov: boot.m.ov })}`).toEqual([]);
        if (prof.name === "export") {
          // The stored WIDTH 20 at Bryce's geometries (#5167 part F): the
          // cluster fills its track, two doors to a row, the small print back.
          expect(boot.m.tl, "the stored layout reached the page").toMatchObject({ layout: "on", btnw: "on" });
          expect(judgeStored(boot.m), `${geo.name} boot export (stored WIDTH 20): ${JSON.stringify({ track: boot.m.track, mbW: boot.m.mb.rect.w, raceFs: boot.m.raceFs, fit: boot.m.fit })}`).toEqual([]);
        }
        if (prof.name === "export-w40-stack") {
          // The repro cell: this is the layout that scrolled (563/343) before the fit.
          expect(boot.m.tl, "the stored layout reached the page").toMatchObject({ layout: "on", btns: "stack", btnw: "on" });
        }
        if (!prof.sweep) return;

        const failures = [];
        for (const cell of sweep()) {
          await page.evaluate(({ layout, ui }) => {
            if (ui !== undefined) window.__apex.uiScale(ui);
            TitleLayout.set(layout, "wide");
          }, { layout: cell.layout, ui: cell.ui });
          const { frames, m } = await measure(page);
          const bad = judge(m, { offsets: cell.offsets });
          if (frames <= 0) bad.push(`did not settle in ${-frames} frames`);
          if (bad.length) failures.push(`${cell.name} [fit ${m.fit.mb || 1}/${m.fit.br || 1}, ui ${m.uiScale}]: ${bad.join("; ")}`);
        }
        expect(failures, `${geo.name}: cells that scroll, clip or leave the box`).toEqual([]);
      });
    }
  });
}

// STALE LAUNCH — the iOS Home Screen app opened in landscape (#5167 part E). CSS lays out 852x393
// while innerWidth/innerHeight still hold 393x852 and no resize ever follows. Measured 2026-11-09
// (Chromium, DPR 3, insets 59/21/59, Bryce's export): the pre-paint boot and SheetShape classify
// body compact + wide from the ICB either way (#5152), but the keyboard band read
// `innerHeight − visualViewport.height` = 852 − 393 = 459 and wrote --kb: 459px — every .screen
// opened from the title carried 459 px of padding-bottom in a 393 px window. The band's minuend is
// the ICB now; this cell holds both: the flags the first paint got and no band, under both stale
// shapes (visualViewport right while inner* lies, and the strict iOS case where both lie).
test.describe("title fit stale landscape launch 852x393-standalone", () => {
  const geo = GEOS[0];
  test.use({ viewport: { width: geo.w, height: geo.h }, hasTouch: true, isMobile: true });

  for (const stale of [{ name: "inner* stale, visualViewport right", vv: false }, { name: "inner* and visualViewport stale", vv: true }]) {
    test(`boots the export with ${stale.name}: ICB flags, no keyboard band, no scroll`, async ({ page }) => {
      test.setTimeout(150_000);
      const prof = profiles().find((p) => p.name === "export");
      await insets(page, geo.insets);
      await seed(page, prof.store);
      await page.addInitScript(firstFlagsInPage);
      await page.addInitScript(staleLaunchInPage, { w: geo.h, h: geo.w, vv: stale.vv });
      await bootTitle(page);
      // The band latched at SheetShape.init's own first ask (the broken tree wrote --kb before
      // the title was interactive), so the boot wait above is the window; measure() then settles the fit.
      const { frames, m } = await measure(page);
      expect(frames, "the fit settled").toBeGreaterThan(0);
      const first = await page.evaluate(() => ({ ...window.__apexFirstFlags, inner: [innerWidth, innerHeight], icb: [document.documentElement.clientWidth, document.documentElement.clientHeight] }));
      expect(first.inner, "precondition: the stale pair held").toEqual([geo.h, geo.w]);
      expect(first.icb, "precondition: CSS laid out landscape").toEqual([geo.w, geo.h]);
      expect(first, "the FIRST paint classified from the ICB").toMatchObject({ density: "compact", shape: "wide" });
      expect({ density: m.density, shape: m.shape }, "and SheetShape kept it").toEqual({ density: "compact", shape: "wide" });
      expect(m.kb, "no phantom keyboard band from the stale innerHeight").toBeNull();
      expect(judge(m, { offsets: prof.offsets }), `${geo.name} stale launch: ${JSON.stringify({ fit: m.fit, mb: m.mb, ov: m.ov })}`).toEqual([]);
    });
  }
});

// THE PHONE CONTROLLER PAGE NEVER SCROLLS EITHER. ROW 9 (2026-11-10): it scrolled at 844x390 —
// document height 417 in a 390 window. html/body are overflow: hidden, which
// stops the gesture but not the extent, so the pairing column (taller than a
// lying-down phone) and the rotating rim both grew the document. Each screen
// now clips or scrolls its own box; the document is exactly the window on the
// pairing screen, the wheel (?demo) and the menu pad (?demo=menu), both ways up.
test.describe("Phone controller page — fits without a document scroll", () => {
  for (const [name, viewport] of [["landscape 844x390", { width: 844, height: 390 }], ["portrait 390x844", { width: 390, height: 844 }]]) {
    test.describe(name, () => {
      test.use({ viewport, hasTouch: true, isMobile: true });
      for (const [screen, url, linked] of [["pairing", "/controller.html", false], ["wheel", "/controller.html?demo", true], ["menu pad", "/controller.html?demo=menu", true]]) {
        test(`${screen} screen: scrollHeight <= innerHeight`, async ({ page }) => {
          await page.goto(url);
          await page.waitForFunction(() => !!window.__apexPad, null, { polling: 100, timeout: BOOT_MS });
          if (linked) await expect(page.locator("body")).toHaveClass(/\blinked\b/);
          // Two frames: the demo dash paints on rAF; fonts may re-wrap the copy.
          await page.evaluate(() => document.fonts.ready.then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))));
          const m = await page.evaluate(() => ({
            vh: innerHeight, vw: innerWidth,
            sh: document.documentElement.scrollHeight, sw: document.documentElement.scrollWidth,
            bodySh: document.body.scrollHeight,
          }));
          expect(m.sh, `${screen} ${name}: document height`).toBeLessThanOrEqual(m.vh);
          expect(m.bodySh, `${screen} ${name}: body height`).toBeLessThanOrEqual(m.vh);
          expect(m.sw, `${screen} ${name}: document width`).toBeLessThanOrEqual(m.vw);
          if (!linked) {
            // The pairing controls are on screen, not just clipped into a box.
            for (const sel of ["#code", "#connect"]) {
              const r = await page.locator(sel).boundingBox();
              expect(r, `${sel} has a box`).not.toBeNull();
              expect(r.y, `${sel} top`).toBeGreaterThanOrEqual(0);
              expect(r.y + r.height, `${sel} bottom`).toBeLessThanOrEqual(m.vh);
            }
          }
        });
      }
    });
  }
});

// W34 row 6 (audit 2026-11-10): a 120 ms double tap on a title door must end on
// the SAME screen a single tap does — the second tap may not reach whatever the
// new screen put under the finger (SETTINGS → BACK, SEASON → CIRCUIT DETAIL,
// TRACK DESIGNER → its RACE button). TopModal's shield exempts automation
// (navigator.webdriver), so this page reports a player's browser.
test.describe("Title doors — a fast double tap is one tap", () => {
  test.use({ ...uiTestOptions({ touch: true, viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 }) });
  const DOORS = ["mb-race", "mb-settings", "mb-vs", "mb-season", "mb-designer"];

  async function openLayers(page) {
    return page.evaluate(() => window.UiLayers.LAYER_IDS.filter((id) => {
      const el = document.getElementById(id);
      return !!el && !el.hidden && (el.tagName !== "DIALOG" || el.open);
    }).sort().join(","));
  }
  async function settle(page) {
    // Lazy doors (VS FRIEND's net bundle, the designer) swap in late: wait for
    // the title to give way, then let any second activation play out.
    await page.waitForFunction(() => { const t = window.UiLayers.top(); return !!t && t.id !== "overlay"; },
      null, { polling: 100, timeout: BOOT_MS }).catch(() => {});
    await page.evaluate(() => new Promise((r) => setTimeout(r, 700)));
  }
  async function tapDoor(page, id, twice) {
    await page.addInitScript(() => Object.defineProperty(Navigator.prototype, "webdriver", { get: () => false }));
    await page.goto("/");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.waitForFunction(() => window.__apex && window.__apex.race, null, { polling: 100, timeout: BOOT_MS });
    await page.evaluate(() => window.__apex.headless(true));
    const box = await page.locator("#" + id).boundingBox();
    if (!box) throw new Error("door not on screen: " + id);
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    // The taps go out over CDP with explicit input timestamps 120 ms apart and
    // without waiting between them: a page-side delay (or awaiting the first
    // tap's handling) only starts once the door's handler frees the main thread,
    // so on a slow runner the "second tap" really came after the window.
    const cdp = await page.context().newCDPSession(page);
    try {
      const t0 = Date.now() / 1000, pt = [{ x, y }];
      const send = (type, timestamp, touchPoints) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints, timestamp });
      const sent = [send("touchStart", t0, pt), send("touchEnd", t0 + 0.03, [])];
      if (twice) sent.push(send("touchStart", t0 + 0.12, pt), send("touchEnd", t0 + 0.15, []));
      await Promise.all(sent);
    } finally { await cdp.detach(); }
    await settle(page);
    return openLayers(page);
  }

  for (const id of DOORS) {
    test(`#${id}: a 120 ms double tap lands where a single tap does`, async ({ page }) => {
      const once = await tapDoor(page, id, false);
      expect(once, "the single tap opened a screen").not.toBe("overlay");
      const twice = await tapDoor(page, id, true);
      expect(twice).toBe(once);
    });
  }
});
