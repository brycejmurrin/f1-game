// @ts-check
// UI SCALE — every main screen still fits at every size the player can pick.
//
// SETTINGS ▸ DISPLAY runs UI SIZE and HUD SIZE from 50 % to 150 %, which means
// "does this screen fit?" stopped being one question. A sheet that sits
// comfortably at the default can push its primary button off the edge two
// notches up, and nothing in the suite would have noticed: the six pixel
// baselines in menu-baseline.spec.js are desktop shapes at the default size, so
// the touch layouts have no golden images at all and the scale axis has none
// anywhere.
//
// This is the cheap standing guard. The exhaustive version is the scale axis on
// the three fit tools (`--scale=`, tools/ui-scale-axis.mjs) — a matrix of
// screen x viewport x scale that is far too slow to run per commit. What is
// asserted here is the part that must never regress:
//
//   1. no control in an open screen is painted outside the viewport
//   2. no control is clipped away by an ancestor that cannot be scrolled
//   3. the two scales are INDEPENDENT — moving one does not move the other
//
// Deliberately NOT asserted: absolute sizes. A threshold like "the title button
// is 399px at 130 %" goes stale the moment the type scale is retuned, which is
// exactly what the component restructure is about to do. Every check here is
// relative or a containment test.
import { test, expect, BOOT_MS } from "../helpers/fixtures.js";

const LANDSCAPE = { width: 852, height: 393 };   // iPhone 15 Pro — primary play shape
// 50 is SCALE_MIN; 100 is what ships; 115 stays because three defects confirmed
// on 2026-08-08 were invisible at 100% and present at 115% (garage overlapping
// the camera bar by 61px — measured -8 / +61 / +130 / +222 at 100/115/130/150).
// Players can still dial 115 via SETTINGS ▸ DISPLAY, so the guard must keep
// seeing it. Touch used to *ship* at 115; that default dropped after the type
// floor made phones read as "zoomed in".
const SCALES = [50, 100, 115, 130, 150, 200];

// The screens reachable from the title without starting a session. Each is
// [name, root selector, ids to click in order].
//
// YOUR CAR on #select opens #carsetup; NEXT opens #race-settings. There is
// no `sel-setup` any more. tools/menu-fit.mjs and tools/fit-audit.mjs both
// still carried the old route and had been quietly reporting "root
// missing/hidden" for those two screens; they are fixed alongside this.
const SCREENS = [
  ["title", "#overlay", []],
  ["select", "#select", ["mb-race"]],
  ["garage", "#carsetup", ["mb-race", "sel-car"]],
  ["race-settings", "#race-settings", ["mb-race", "sel-go"]],
  ["howtoplay", "#howtoplay", ["mb-help"]],
  ["settings", "#pmsettings", ["mb-settings"]],
];

// Every overlay that can be open, so a screen can be reached from whatever the
// last one left behind. Reloading between screens would be simpler and is what
// this spec did first — it also cost a full boot per screen, 24 per run, and
// timed out at two minutes. Geometry probing does not need the state machine to
// agree with itself, only the buttons to be hittable.
const OVERLAY_IDS = ["select", "carsetup", "career", "teampicker", "race-settings", "quali",
  "standings", "results", "customize", "howtoplay", "advanced", "pmsettings", "pausemenu",
  "datahub", "track-detail", "vsfriend", "audioset", "lighting", "camtune", "photomode"];

async function boot(page) {
  await page.goto("/");
  // BOOT_MS, not a hand-rolled 30 s: a SwiftShader boot here measures 11-33 s (2026-09-01).
  await page.waitForFunction(() => window.__apex && window.__apex.race, null, { polling: 100, timeout: BOOT_MS });
}

async function toTitle(page) {
  await page.evaluate((ids) => {
    for (const id of ids) { const el = document.getElementById(id); if (el) el.hidden = true; }
    const ov = document.getElementById("overlay");
    if (ov) { ov.hidden = false; ov.style.removeProperty("display"); }
    document.body.classList.remove("in-race");
  }, OVERLAY_IDS);
  await page.waitForTimeout(150);
}

// Clicks are dispatched in-page rather than through locators on purpose: the
// sheets open with a CSS animation that headless Chromium does not reliably
// tick, so a locator waiting for stability can sit there until it times out on
// a screen that is, as far as the DOM is concerned, already open.
async function open(page, ids) {
  for (const id of ids) {
    await page.evaluate((i) => document.getElementById(i)?.click(), id);
    await page.waitForTimeout(250);
  }
  await page.evaluate(() => {
    for (const a of document.getAnimations()) { try { a.finish(); } catch { /* infinite */ } }
  });
  await page.waitForTimeout(150);
}

// Every visible control in `rootSel`, with the box it actually PAINTS —
// intersected with each clipping ancestor. That distinction is the whole
// measurement: a row scrolled down a list paints a sliver and is perfectly
// fine, while the same sliver caused by a clipping ancestor is content the
// player can never reach.
const PROBE = (rootSel) => {
  const root = document.querySelector(rootSel);
  if (!root || root.hidden) return { error: "missing/hidden " + rootSel };
  const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
  const idOf = (el) => (el.id ? "#" + el.id : "") +
    (typeof el.className === "string" && el.className ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : "") ||
    el.tagName.toLowerCase();
  const vis = (el) => { const cs = getComputedStyle(el); return cs.display !== "none" && cs.visibility !== "hidden" && +cs.opacity > 0.05; };
  const out = { offscreen: [], clipped: [], n: 0 };
  for (const el of root.querySelectorAll("button, input, select, a[href], [role='option'], [role='tab']")) {
    if (!vis(el)) continue;
    const b = el.getBoundingClientRect();
    if (!b.width || !b.height) continue;
    out.n++;
    // Walk the clipping ancestors, recording whether each one can be SCROLLED
    // to bring the element back. Content behind a scrollable ancestor is
    // reachable by definition; behind `overflow: hidden` it is simply gone.
    let l = b.left, t = b.top, r = b.right, bo = b.bottom, scrollable = false;
    for (let p = el.parentElement; p; p = p.parentElement) {
      const cs = getComputedStyle(p);
      const clipsX = cs.overflowX !== "visible", clipsY = cs.overflowY !== "visible";
      if (!clipsX && !clipsY) continue;
      if (/auto|scroll/.test(cs.overflowX) || /auto|scroll/.test(cs.overflowY)) scrollable = true;
      const pr = p.getBoundingClientRect();
      l = Math.max(l, pr.left); t = Math.max(t, pr.top);
      r = Math.min(r, pr.right); bo = Math.min(bo, pr.bottom);
    }
    const shownFrac = Math.max(0, r - l) * Math.max(0, bo - t) / (b.width * b.height);
    if (!scrollable && shownFrac < 0.9) {
      out.clipped.push({ el: idOf(el), shown: +shownFrac.toFixed(2), box: [+b.width.toFixed(0), +b.height.toFixed(0)] });
    }
    // Painted outside the VIEWPORT, and not merely scrolled out of a list: only
    // count it when the element still has paint left after the ancestors.
    if (r - l > 1 && bo - t > 1 && (r > vw + 1 || l < -1 || bo > vh + 1 || t < -1)) {
      out.offscreen.push({
        el: idOf(el),
        out: [l < -1 ? `L${(-l).toFixed(0)}` : "", r > vw + 1 ? `R${(r - vw).toFixed(0)}` : "",
              t < -1 ? `T${(-t).toFixed(0)}` : "", bo > vh + 1 ? `B${(bo - vh).toFixed(0)}` : ""].filter(Boolean).join(" "),
      });
    }
  }
  return out;
};

// BOTH ORIENTATIONS. This spec shipped landscape-only and that gap cost a real
// bug within the hour: `min(78vw, 340px)` on the title button groups takes its
// vw branch only when 78vw < 340px, i.e. below a 436px-wide window — which is
// portrait and nothing else. Inside a zoomed subtree a viewport unit resolves
// against the UNZOOMED viewport and is then multiplied, so at 393x852 the
// column rendered 398.5px wide at UI SIZE 130 % (17.5px off the right edge) and
// 459.8px at 150 % (78.8px off), while its CSS width sat unchanged at 306.5px
// the whole time. A landscape-only matrix cannot see a portrait-only branch.
const SHAPES = [["landscape", LANDSCAPE], ["portrait", { width: 393, height: 852 }]];

test.describe("UI scale", () => {
  test.use({ hasTouch: true });

  for (const [shape, viewport] of SHAPES) {
    test.describe(shape, () => {
      test.use({ viewport });

      for (const pct of SCALES) {
        test(`every main screen fits at ${pct}%`, async ({ page }) => {
          await boot(page);
          const set = await page.evaluate((p) => window.__apex.uiScale(p), pct);
          expect(set.stored, "the slider stored what it was given").toBe(pct);

          for (const [name, root, ids] of SCREENS) {
            await toTitle(page);
            await open(page, ids);
            const r = await page.evaluate(PROBE, root);
            expect(r.error, `${name} did not open`).toBeUndefined();
            expect(r.n, `${name} has controls to measure`).toBeGreaterThan(0);
            expect(r.offscreen, `${name} ${shape} @${pct}% — controls painted off screen`).toEqual([]);
            expect(r.clipped, `${name} ${shape} @${pct}% — controls clipped with no way to scroll to them`).toEqual([]);

            // NOTHING may scroll SIDEWAYS. Vertical overflow is a legitimate
            // answer to "the type got bigger" and #overlay scrolls on purpose;
            // horizontal overflow never is, and it is the exact signature of a
            // viewport unit inside a zoomed subtree (see --vwz in tokens.css).
            const hx = await page.evaluate((sel) => {
              const el = document.querySelector(sel);
              const de = document.documentElement;
              return { root: el ? el.scrollWidth - el.clientWidth : 0, doc: de.scrollWidth - de.clientWidth };
            }, root);
            expect(hx.root, `${name} ${shape} @${pct}% — ${root} scrolls sideways`).toBeLessThanOrEqual(1);
            expect(hx.doc, `${name} ${shape} @${pct}% — the document scrolls sideways`).toBeLessThanOrEqual(1);
          }
        });
      }
    });
  }

  // The mechanism itself. If these two ever start moving together the sliders
  // are back to being one knob, and every fit result above becomes a statement
  // about a size nobody can actually select.
  test("the two scales are independent", async ({ page }) => {
    await boot(page);
    const read = () => page.evaluate(() => {
      const cs = getComputedStyle(document.documentElement);
      return { ui: cs.getPropertyValue("--ui-scale").trim(), hud: cs.getPropertyValue("--hud-scale").trim() };
    });

    await page.evaluate(() => { window.__apex.uiScale(100); window.__apex.hudScale(100); });
    expect(await read()).toEqual({ ui: "1", hud: "1" });

    await page.evaluate(() => window.__apex.uiScale(150));
    expect(await read(), "moving UI must not move the HUD").toEqual({ ui: "1.5", hud: "1" });

    await page.evaluate(() => window.__apex.hudScale(90));
    expect(await read(), "moving the HUD must not move the UI").toEqual({ ui: "1.5", hud: "0.9" });

    // Out of range clamps rather than throwing — a stored value from an older
    // build with a wider range must not be able to produce a 4x interface.
    const hi = await page.evaluate(() => window.__apex.uiScale(9999));
    expect(hi.pct).toBe(hi.max);

    // null is "forget it", not "set it to zero": the CSS default takes over and
    // nothing is left in the store to override it.
    const cleared = await page.evaluate(() => window.__apex.uiScale(null));
    expect(cleared.stored).toBeNull();
    expect(+(await read()).ui).toBeGreaterThan(0.5);
  });

  test("200% keeps title navigation reachable on phones and browser-zoom equivalents", async ({ page }) => {
    const shapes = [
      ["phone portrait", { width: 393, height: 659 }],
      ["phone landscape", { width: 734, height: 343 }],
      // 1920x937 content area at 200% browser zoom is approximately 960x469
      // CSS pixels. Browser zoom changes this viewport; DPR/render resolution do not.
      ["desktop at 200% browser zoom", { width: 960, height: 469 }],
    ];

    for (const [name, viewport] of shapes) {
      await page.setViewportSize(viewport);
      await page.goto("/");
      await page.waitForFunction(() => window.__apex && window.__apex.uiScale,
        null, { polling: 100, timeout: BOOT_MS });
      await page.evaluate(() => window.__apex.uiScale(200));
      await page.waitForFunction(() => document.body.dataset.density === "compact",
        null, { polling: 100, timeout: 5_000 });

      const scale = await page.evaluate(() => ({
        requested: getComputedStyle(document.documentElement).getPropertyValue("--ui-scale").trim(),
        brandGeometry: getComputedStyle(document.getElementById("menu-brand")).zoom,
        geometry: getComputedStyle(document.getElementById("menu-buttons")).zoom,
        raceFont: parseFloat(getComputedStyle(document.getElementById("mb-race")).fontSize),
      }));
      expect(scale.requested, `${name}: the preference remains honest`).toBe("2");
      expect(+scale.brandGeometry, `${name}: decorative brand geometry stays compact`).toBe(1);
      expect(+scale.geometry, `${name}: compact geometry is capped`).toBeCloseTo(1.25, 2);
      expect(scale.raceFont * +scale.geometry,
        `${name}: control text still paints at the requested 200%`).toBeGreaterThanOrEqual(33);

      // A real locator click asks Chromium to scroll the control into view. The
      // old nested 2x geometry timed out here in phone portrait even though the
      // DOM-only fit probe declared the screen clean.
      const target = await page.evaluate(async () => {
        const menu = document.getElementById("menu-buttons");
        const race = document.getElementById("mb-race");
        race.scrollIntoView({ block: "center" });
        await new Promise((resolve) => requestAnimationFrame(resolve));
        const r = race.getBoundingClientRect();
        const m = menu.getBoundingClientRect();
        return {
          scrollable: menu.scrollHeight > menu.clientHeight + 1,
          inside: r.top >= m.top - 1 && r.bottom <= m.bottom + 1,
          x: r.left + r.width / 2, y: r.top + r.height / 2,
        };
      });
      expect(target.inside, `${name}: RACE can be scrolled fully into view`).toBe(true);
      await page.mouse.click(target.x, target.y);
      await expect(page.locator("#select")).toBeVisible();
    }
  });

  // applyScale() (js/game.js) runs on every boot, reading straight from
  // localStorage — the slider's own oninput can't produce an out-of-range value
  // (the native <input type=range> clamps .value on assignment), but a value
  // outside [50,150] can still reach apex26.uiScale/hudScale from a direct edit
  // or an older build with a different range. The CSS custom property that
  // actually sets the on-screen size used to be read from that RAW number
  // instead of the already-clamped percentage the slider itself displays — the
  // slider would show a sane value while the real render used whatever was
  // stored, unbounded.
  test("an out-of-range stored scale clamps the applied CSS property, not just the slider label", async ({ page }) => {
    // This test referenced `read` from "the two scales are independent" above,
    // a `const` local to THAT test's own callback — plain JS lexical scoping
    // never made it visible here, in any run order, on any worker. Not a
    // flake: a ReferenceError on the one assertion that reaches it, every time
    // this test actually runs. Each `test()` gets its own `page`, so the fix is
    // to redeclare it here rather than hoist it to describe scope, which would
    // capture whichever page happened to be in scope when the describe body
    // itself ran (none — describe bodies run before any page exists).
    const read = () => page.evaluate(() => {
      const cs = getComputedStyle(document.documentElement);
      return { ui: cs.getPropertyValue("--ui-scale").trim(), hud: cs.getPropertyValue("--hud-scale").trim() };
    });
    await page.addInitScript(() => {
      localStorage.setItem("apex26.uiScale", "500");
      localStorage.setItem("apex26.hudScale", "-40");
    });
    await boot(page);
    // Bounds come from the LIVE API, not literals: this test was written when
    // SCALE_MAX was 150, a merge later moved the constants to 50..175 without
    // touching the expectations here, and the test sat silently broken (it is
    // not in the CI gate). Reading __apex.uiScale().min/max keeps it honest
    // through any future range change.
    const bounds = await page.evaluate(() => {
      const u = __apex.uiScale();
      return { min: u.min, max: u.max };
    });
    const cs = await page.evaluate(() => {
      const s = getComputedStyle(document.documentElement);
      return { ui: s.getPropertyValue("--ui-scale").trim(), hud: s.getPropertyValue("--hud-scale").trim() };
    });
    expect(cs.ui, `500 must clamp to SCALE_MAX (${bounds.max}%)`).toBe(String(bounds.max / 100));
    expect(cs.hud, `-40 must clamp to SCALE_MIN (${bounds.min}%)`).toBe(String(bounds.min / 100));

    // The slider's own displayed value/label must read the SAME clamped number,
    // not merely a different-but-also-safe one — this is the invariant that
    // broke: the readout was always correct even while the applied CSS was not.
    const shown = await page.evaluate(() => ({
      uiInput: document.getElementById("pm-uiscale").value,
      uiLabel: document.getElementById("pm-uiscale-v").textContent,
      hudInput: document.getElementById("pm-hudscale").value,
      hudLabel: document.getElementById("pm-hudscale-v").textContent,
    }));
    expect(shown).toEqual({
      uiInput: String(bounds.max), uiLabel: bounds.max + "%",
      hudInput: String(bounds.min), hudLabel: bounds.min + "%",
    });
  });

  test("SETTINGS categories adapt to sheet width and expose one panel", async ({ page }) => {
    await page.setViewportSize(LANDSCAPE);
    await boot(page);
    await page.locator("#mb-settings").click();
    await page.locator("#pm-tab-display").click();
    await expect(page.locator("#pm-tab-display")).toHaveAttribute("aria-selected", "true");
    await expect(page.locator("#pm-panel-display")).toBeVisible();
    await expect(page.locator("#pm-panel-controls")).toBeHidden();
    const wide = await page.evaluate(() => {
      const layout = getComputedStyle(document.getElementById("pm-settings-body"));
      const tabs = getComputedStyle(document.getElementById("pm-category-tabs"));
      return { layoutCols: layout.gridTemplateColumns.split(" ").length,
        tabCols: tabs.gridTemplateColumns.split(" ").length };
    });
    expect(wide.layoutCols).toBe(1);
    expect(wide.tabCols).toBe(1); // flex row reports grid-template-columns: none
    await page.locator("#pm-tab-display").focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.locator("#pm-tab-more")).toBeFocused();

    await page.setViewportSize({ width: 390, height: 844 });
    const narrow = await page.evaluate(() => {
      const layout = getComputedStyle(document.getElementById("pm-settings-body"));
      const tabs = getComputedStyle(document.getElementById("pm-category-tabs"));
      return { layoutCols: layout.gridTemplateColumns.split(" ").length,
        tabCols: tabs.gridTemplateColumns.split(" ").length };
    });
    expect(narrow.layoutCols).toBe(1);
    expect(narrow.tabCols).toBe(1);

    await page.locator("#pm-tab-display").focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.locator("#pm-tab-more")).toBeFocused();
    await expect(page.locator("#pm-panel-more")).toBeVisible();
  });

  // HUD SIZE is half the feature, so it gets the same containment test — one
  // race load, measured at each size, because building a circuit under
  // SwiftShader is by far the most expensive thing in this file.
  test("the HUD clusters stay on screen at every size", async ({ page }) => {
    test.slow();   // building a circuit under SwiftShader is the cost here
    await boot(page);
    await page.evaluate(() => window.__apex.race("bahrain"));
    // Wait for the TRACK, not for `state === "race"`. Measured: race() leaves the
    // state at "count", and the line that makes it "race" is the go() below — so
    // waiting for "race" here could never succeed and burned its whole timeout,
    // every run, before doing any of the work. waitForFunction polls on rAF and
    // this page's rAF rate collapses to ~2/s under SwiftShader (see the flag
    // comment in playwright.config.js), which is why a dead wait is expensive
    // rather than merely wrong. MEASURED, this test end to end: 12.1 min with
    // the dead wait and the GL draw running, 6.2 min with the draw skipped,
    // 16.4 s with both fixed. The wait was the dominant term by a long way —
    // far more than the 30 s it costs when driven outside the runner, because
    // Playwright's own polling is on the same starved rAF clock.
    await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: 60_000 });
    await page.evaluate(() => {
      // HEADLESS, because this test measures getBoundingClientRect on four DOM
      // clusters and never looks at a pixel. Leaving the GL draw on made it cost
      // 12.1 MINUTES alone on a quiet box — against a 360 s budget, so it failed
      // on the clock while every assertion in it passed. updateHud() is a SIBLING
      // of render() in the frame loop rather than a call inside it, so skipping
      // the draw leaves the HUD DOM updating exactly as before and nothing this
      // test asserts can move. The circuit build stays: the layout under test is
      // the in-race one, and there is no cheaper way to be in a race.
      window.__apex.headless(true);
      window.__apex.go(); window.__apex.jump(0.3, 50);
    });
    await page.waitForTimeout(600);

    const CLUSTERS = [".hud-top", ".hud-bottom", "#minimap", ".dock"];
    let dockSeen = false;
    for (const pct of SCALES) {
      await page.evaluate((p) => window.__apex.hudScale(p), pct);
      await page.waitForTimeout(200);
      const boxes = await page.evaluate((sels) => {
        const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
        return sels.map((s) => {
          const e = document.querySelector(s);
          if (!e) return { s, missing: true };
          const b = e.getBoundingClientRect();
          if (!b.width || !b.height) return { s, hidden: true };
          return { s, over: [b.left < -1 ? "L" : "", b.right > vw + 1 ? "R" : "",
                             b.top < -1 ? "T" : "", b.bottom > vh + 1 ? "B" : ""].filter(Boolean).join("") };
        });
      }, CLUSTERS);
      for (const b of boxes) {
        if (b.missing || b.hidden) continue;
        if (b.s === ".dock") dockSeen = true;
        expect(b.over, `${b.s} @${pct}% hangs off the ${b.over} edge`).toBe("");
      }
      // THE HUD AXIS HAS ITS OWN WCAG FLOOR. The dock zooms by the RAW
      // --hud-scale and its local --tap/--hold literals used to shadow the
      // floored global token — BOOST painted 21.6px at HUD SIZE 40% and the
      // matrix never saw it (the in-race audit cells were blind to a body-
      // class leak). getBoundingClientRect is PAINTED px under zoom, which is
      // exactly the space the 24px requirement lives in. Only asserted while
      // the dock is visible; the dockSeen guard below stops that from ever
      // becoming a silent skip of the whole feature.
      const taps = await page.evaluate(() => {
        const out = [];
        for (const id of ["btn-boost", "btn-ot", "btn-brake", "shift-up", "btn-steer-left"]) {
          const e = document.getElementById(id);
          if (!e) continue;
          const b = e.getBoundingClientRect();
          if (b.width && b.height) out.push({ id, min: Math.min(b.width, b.height) });
        }
        return out;
      });
      for (const t of taps) {
        expect(t.min, `#${t.id} @HUD ${pct}% paints ${t.min.toFixed(1)}px — under the 24px floor`)
          .toBeGreaterThanOrEqual(23.5);
      }
    }
    // A dock that never rendered means this touch context stopped being a
    // touch context and every tap assertion above was vacuous — the silent
    // skip this sweep used to allow. Fail loudly instead.
    expect(dockSeen, "the touch dock was never visible in a hasTouch context").toBe(true);
  });
});
