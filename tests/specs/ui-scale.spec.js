// @ts-check
// UI SCALE — every main screen still fits at every size the player can pick.
//
// SETTINGS ▸ APPEARANCE (UI SIZE) and ▸ DISPLAY (HUD SIZE) run 50 % to 150 %, so
// "does this screen fit?" stopped being one question. A sheet that sits
// comfortably at the default can push its primary button off the edge two
// notches up, and nothing in the suite would have noticed: the six pixel
// baselines in menu-baseline.spec.js are desktop shapes at the default size, so
// the touch layouts have no golden images at all and the scale axis has none
// anywhere.
//
// This is the cheap standing guard. The exhaustive version is the scale axis on
// the three fit tools (`--scale=`, tools/ui/ui-scale-axis.mjs) — a matrix of
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

async function waitHudControlsStable(page) {
  await page.evaluate(async () => {
    const ids = ["btn-brake", "btn-throttle", "btn-boost", "btn-ot", "btn-aero", "pausebtn", "btn-cam", "minimap"];
    const snapshot = () => JSON.stringify(ids.map(id => {
      const r = document.getElementById(id).getBoundingClientRect();
      return [r.x, r.y, r.width, r.height];
    }));
    let previous = snapshot(), stable = 0;
    for (let frame = 0; frame < 60; frame++) {
      await new Promise(resolve => requestAnimationFrame(resolve));
      const current = snapshot();
      stable = current === previous ? stable + 1 : 0;
      if (stable >= 2) return;
      previous = current;
    }
    throw new Error("HUD controls did not settle across rendered frames");
  });
}

// The screens reachable from the title without starting a session. Each is
// [name, root selector, ids to click in order].
//
// YOUR CAR on #select opens #carsetup; NEXT opens #race-settings. There is
// no `sel-setup` any more. tools/ui/menu-fit.mjs and tools/ui/fit-audit.mjs both
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

// Title/garage fit was written against the previous look. Shipped TEXT SIZE
// is large, HIGH CONTRAST is on, HOME SCENE is photo — pin the old look so
// 200% UI SIZE is the only enlargement under test.
const PIN_PREVIOUS_LOOK = () => {
  try {
    localStorage.setItem("apex26.textSize", '"normal"');
    localStorage.setItem("apex26.uiContrast", '"off"');
    localStorage.setItem("apex26.homeScene", '"garage"');
  } catch (_) {}
};

async function boot(page) {
  await page.addInitScript(PIN_PREVIOUS_LOOK);
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
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(PIN_PREVIOUS_LOOK);
  });

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

  test("race events and HUD changes keep touch buttons the same size", async ({ page }) => {
    await page.setViewportSize({ width: 844, height: 390 });
    await boot(page);
    await page.evaluate(() => { __apex.headless(true); __apex.race("monza"); });
    await page.waitForFunction(() => __apex.info().track != null, null, { polling: 100, timeout: BOOT_MS });
    await page.evaluate(() => { __apex.go(); __apex.jump(0.18, 60, 0); });
    const sizes = () => page.evaluate(() => ["btn-brake", "btn-throttle", "btn-boost", "btn-ot", "btn-aero"].map(id => {
      const r = document.getElementById(id).getBoundingClientRect();
      return [id, r.width, r.height];
    }));
    await page.waitForFunction(() => document.getElementById("btn-brake").getBoundingClientRect().width > 0, null, { polling: 100 });
    const before = await sizes();
    for (const scale of [70, 150, 200, 100]) {
      await page.evaluate(pct => {
        __apex.hudScale(pct);
        for (const id of ["rel", "strat", "inputs"]) HudElements.set(id, true);
        if (__apex.damage) __apex.damage(null, { long: 1, lat: .6, sev: .9 });
        __apex.camera(pct === 150 ? "helmet" : "chase");
        for (let i = 0; i < 4; i++) { GameHud.invalidateFit(); __apex.jump(.18, 60, 0); }
        for (const id of ["hud-flag", "hud-limits", "announce"]) document.getElementById(id).hidden = false;
        GameHud.invalidateFit();
      }, scale);
      await page.waitForFunction(() => typeof HudLayout !== "undefined", null, { polling: 100 });
      const after = await sizes();
      for (let i = 0; i < after.length; i++) {
        expect(before[i][1], "control was visible at baseline").toBeGreaterThan(0);
        expect(Math.abs(after[i][1] - before[i][1]), after[i][0] + " width at HUD " + scale).toBeLessThan(.5);
        expect(Math.abs(after[i][2] - before[i][2]), after[i][0] + " height at HUD " + scale).toBeLessThan(.5);
      }
    }
    const positions = await page.evaluate(async () => {
      const snap = () => ["btn-brake", "btn-throttle", "btn-boost", "btn-ot", "btn-aero"].map(id => {
        const r = document.getElementById(id).getBoundingClientRect();
        return [r.x, r.y, r.width, r.height];
      });
      await new Promise(resolve => setTimeout(resolve, 180));
      const samples = [snap()];
      for (let i = 0; i < 3; i++) {
        HudLayout.fit(); GameHud.invalidateFit();
        await new Promise(resolve => setTimeout(resolve, 180));
        samples.push(snap());
      }
      return samples;
    });
    for (const sample of positions.slice(1)) for (let i = 0; i < sample.length; i++) {
      for (let axis = 0; axis < 4; axis++) expect(Math.abs(sample[i][axis] - positions[0][i][axis]),
        "repeated placement keeps button positions and dimensions stable").toBeLessThan(.5);
    }
    await page.evaluate(() => __apex.btnScale(80));
    const smaller = await sizes();
    expect(smaller[0][1]).toBeLessThan(before[0][1]);
  });

  test("larger BUTTON SIZE plateaus without shrinking pedals or covering CAM/PAUSE", async ({ page }) => {
    await page.setViewportSize({ width: 844, height: 390 });
    await page.addInitScript(() => localStorage.setItem("apex26.steerMode", JSON.stringify("buttons")));
    await boot(page);
    await page.evaluate(() => { __apex.headless(true); __apex.race("monza"); });
    await page.waitForFunction(() => __apex.info().track != null, null, { polling: 100, timeout: BOOT_MS });
    await page.evaluate(() => { __apex.go(); __apex.park(.18); __apex.hudScale(100); });
    let previous = null;
    for (const pct of [125, 150, 200, 300]) {
      await page.evaluate(pct => { __apex.btnScale(pct); __apex.jump(.18, 60, 0); GameHud.invalidateFit(); }, pct);
      await waitHudControlsStable(page);
      const sample = await page.evaluate(() => {
        GameHud.syncPhoneFit();
        const rect = id => { const e = document.getElementById(id), r = e.getBoundingClientRect();
          return { id, x: r.x, y: r.y, w: r.width, h: r.height }; };
        return { controls: ["btn-brake", "btn-throttle", "btn-boost", "btn-ot", "btn-aero"].map(rect),
          top: ["pausebtn", "btn-cam"].map(rect) };
      });
      if (pct === 125) expect(Math.abs(sample.controls[0].w - 90), "default-sized pedals retain their 90px painted footprint").toBeLessThan(.5);
      for (let i = 0; i < sample.controls.length; i++) {
        const r = sample.controls[i];
        expect(r.w, r.id + " remains visible").toBeGreaterThan(0);
        expect(r.x).toBeGreaterThanOrEqual(0); expect(r.y).toBeGreaterThanOrEqual(0);
        expect(r.x + r.w).toBeLessThanOrEqual(844); expect(r.y + r.h).toBeLessThanOrEqual(390);
        if (previous) {
          expect(r.w, r.id + " width at BUTTON " + pct).toBeGreaterThanOrEqual(previous.controls[i].w - .5);
          expect(r.h, r.id + " height at BUTTON " + pct).toBeGreaterThanOrEqual(previous.controls[i].h - .5);
        }
        for (const b of sample.top) {
          const overlap = Math.max(0, Math.min(r.x + r.w, b.x + b.w) - Math.max(r.x, b.x)) *
            Math.max(0, Math.min(r.y + r.h, b.y + b.h) - Math.max(r.y, b.y));
          expect(overlap, r.id + " clears " + b.id).toBe(0);
        }
      }
      previous = sample;
    }
  });

  // Reset restores the independent button default, even after HUD SIZE changes.
  test("BUTTON SIZE uses its own default and can be reset", async ({ page }) => {
    await boot(page);
    const state = () => page.evaluate(() => {
      const rev = document.getElementById("pm-btnscale-r");
      const row = document.getElementById("pm-btnscale").closest(".tune-row");
      return {
        over: !!(row && row.classList.contains("tune-over")),
        revertShown: !!(rev && !rev.hidden),
        // The RESOLVED axis, not the raw token: unset, --hud-btn-scale is a
        // calc() that a custom property never reduces, so it reads back as
        // "calc(0.9 * 1.25)". btnScale().pct is the number the slider and the
        // dock both act on.
        btn: window.__apex.btnScale().pct,
      };
    });

    // Touch defaults to 125%, independently of the readout scale.
    await page.evaluate(() => { window.__apex.hudScale(120); window.__apex.btnScale(null); });
    let st = await state();
    expect(st.over, "unset: no override marker").toBe(false);
    expect(st.revertShown, "unset: no revert button").toBe(false);
    expect(st.btn, "unset: independent touch default").toBe(125);

    await page.evaluate(() => window.__apex.btnScale(60));
    st = await state();
    expect(st.over, "set: the override marker appears").toBe(true);
    expect(st.revertShown, "set: the revert appears").toBe(true);
    expect(st.btn, "set: it is its own axis").toBe(60);

    // Dispatched IN-PAGE, for the reason the note above open() gives: the
    // settings sheet is not on screen in this test, so a locator click waits
    // 60 s for an actionable element that will never become visible. The
    // element's own .click() still runs the handler and still bubbles into the
    // <label> the button sits inside — which is the thing worth exercising,
    // since a handler that forgot preventDefault would hand the click to the
    // range input and move the very slider it was meant to reset.
    await page.evaluate(() => document.getElementById("pm-btnscale-r").click());
    st = await state();
    expect(st.btn, "revert restores the independent touch default").toBe(125);
    expect(st.over, "and clears its own marker").toBe(false);
    expect(st.revertShown, "and hides itself").toBe(false);

    // A later HUD change must leave the reset button size alone.
    await page.evaluate(() => window.__apex.hudScale(90));
    expect((await state()).btn, "HUD changes leave the button default unchanged").toBe(125);
  });

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

    // Buttons are a third independent axis, with a fixed 125% touch default.
    const btn = () => page.evaluate(() => window.__apex.btnScale().pct);
    await page.evaluate(() => window.__apex.btnScale(null));
    expect(await btn(), "unset, independent touch default").toBe(125);
    await page.evaluate(() => window.__apex.hudScale(120));
    expect(await btn(), "HUD changes leave default buttons unchanged").toBe(125);
    await page.evaluate(() => window.__apex.btnScale(60));
    expect(await btn(), "set, it is its own axis").toBe(60);
    expect(await read(), "and moving it must not move the HUD").toEqual({ ui: "1.5", hud: "1.2" });
    await page.evaluate(() => window.__apex.hudScale(90));
    expect(await btn(), "nor does the HUD move it back").toBe(60);
    await page.evaluate(() => window.__apex.btnScale(null));
    expect(await btn(), "null restores the button default").toBe(125);

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
      // DENSITY AND ZOOM SETTLE ARE FRAME CONTRACTS, NOT WALL-CLOCK ONES.
      //
      // Density: body[data-density] is written by SheetShape's --ui-scale
      // MutationObserver, which reclassifies in the NEXT animation frame
      // (js/ui/sheet-shape.js watchScale). Only the first shape ever waits on
      // it: that is the cold profile, where --ui-scale is still unset and the
      // body is "normal"; later shapes boot with the stored 200% and are
      // already compact.
      //
      // Zoom settle (#1256/#1270): every spec pins reduced motion, and
      // responsive.css answers it with a 0.01ms transition-duration on every
      // #overlay descendant, where transition-property is the initial `all` -
      // so zoom itself TRANSITIONS on #menu-brand and #menu-buttons. Until the
      // next frame services that transition, getComputedStyle().zoom returns
      // its START value, i.e. the zoom from before uiScale(200). On a coarse
      // pointer that is the 1.09 default (tokens.css): ship CI 37689983772 on
      // 76f1c6b93 read it twice ("brand geometry" 1.09 vs 1), and the buttons'
      // 1.25 cap asserted below races the same way.
      //
      // Both answers land within a frame or two of the write, but under load
      // the FRAMES are late, not the answers. Probed on this box (loadavg
      // 55-130): density flipped in the first frame after the write every time
      // (read as compact on frame 2 of the count below), yet that frame arrived
      // 13-39 s later - uiScale(200)'s own 200% relayout is a 3-12 s long
      // task, and the cold boot's tail adds a 9-26 s one behind it. The old
      // 5 s density wait and 10 s settle wait (their setTimeout polls starve the
      // same way) measured that backlog, not the code; with the first fixed,
      // the second timed out next, in the desktop shape.
      //
      // So write and count frames in ONE evaluate: compact, both elements
      // free of pending/running animations, and the brand at its compact zoom
      // within SETTLE_FRAMES rendered frames of the write is the contract,
      // with no wall clock in it. BOOT_MS caps only the wait for frames to
      // arrive at all (it is the cold-boot backlog being waited out), and that
      // case reports itself as starvation rather than as a wrong answer. The
      // cap is PER FRAME, measured from when that frame was requested: a
      // budget counted from before uiScale(200) let the synchronous relayout
      // spend it (157-335 s at loadavg 200-500), after which setTimeout(0)
      // beat every requestAnimationFrame and "starved" fired one frame in.
      const SETTLE_FRAMES = 6;
      const settle = await page.evaluate(async ({ frames, capMs }) => {
        const t0 = performance.now();
        window.__apex.uiScale(200);
        const snap = () => {
          const anims = ["menu-brand", "menu-buttons"].flatMap((id) => {
            const el = document.getElementById(id);
            if (!el) return [id + ":missing"];
            return el.getAnimations().filter((a) => a.pending || a.playState === "running")
              .map((a) => id + ":" + (a.transitionProperty || a.animationName || "?"));
          });
          const brand = document.getElementById("menu-brand");
          const brandZoom = brand ? +getComputedStyle(brand).zoom : NaN;
          const density = document.body.dataset.density;
          return { density, anims, brandZoom,
            ok: density === "compact" && anims.length === 0 && Math.abs(brandZoom - 1) < 0.001 };
        };
        let n = 0, starved = false, compactAt = -1, maxFrameMs = 0, s = snap();
        if (s.density === "compact") compactAt = 0;
        while (!s.ok && n < frames) {
          const asked = performance.now();
          let timer = 0;
          const framed = await Promise.race([
            new Promise((resolve) => requestAnimationFrame(() => resolve(true))),
            new Promise((resolve) => { timer = setTimeout(() => resolve(false), capMs); }),
          ]);
          clearTimeout(timer);
          maxFrameMs = Math.max(maxFrameMs, Math.round(performance.now() - asked));
          if (!framed) { starved = true; break; }
          n++;
          s = snap();
          if (compactAt < 0 && s.density === "compact") compactAt = n;
        }
        return { ...s, frames: n, compactAt, starved, maxFrameMs, ms: Math.round(performance.now() - t0),
          uiScale: document.documentElement.style.getPropertyValue("--ui-scale") };
      }, { frames: SETTLE_FRAMES, capMs: BOOT_MS });
      const settleDump = JSON.stringify(settle);
      expect(settle.starved, `${name}: no animation frame within ${BOOT_MS} ms of uiScale(200) `
        + "(main thread starved, not a layout answer) " + settleDump).toBe(false);
      expect(settle.density, `${name}: body is compact within ${SETTLE_FRAMES} frames of uiScale(200) `
        + settleDump).toBe("compact");
      expect(settle.anims, `${name}: brand/buttons zoom transitions retire within ${SETTLE_FRAMES} frames `
        + settleDump).toEqual([]);

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

  // DESKTOP-SIZED WINDOWS AT 200% NEVER HIT THE 1.25 CAP (that media query is
  // max-width 899 / max-height 699), so #menu-buttons zooms the full 2x - and
  // the compact-wide live Home used to zoom its door groups by --ui-scale AGAIN
  // on top (#1238's display:contents leftover): 4x geometry on 1280x742. CAREER's
  // save line and CONTINUE's ran past the viewport's right edge and RACE sat
  // ~950px down a 742px window. Contract here: one zoom, every door subtitle
  // inside its door and the viewport, RACE on screen without scrolling, and
  // the column scrolls (never clips) to its last door.
  test("200% home doors keep subtitles inside the door and RACE on screen on desktop windows", async ({ page }) => {
    const SETTLE_FRAMES = 6;
    for (const viewport of [{ width: 1280, height: 742 }, { width: 1920, height: 1080 }]) {
      const name = `${viewport.width}x${viewport.height}`;
      await page.setViewportSize(viewport);
      await page.goto("/");
      await page.waitForFunction(() => window.__apex && window.__apex.uiScale,
        null, { polling: 100, timeout: BOOT_MS });
      // Same frame contract as the phone test above: write, then count
      // rendered frames until compact + no zoom transition is pending.
      // Returning-player strings (refreshCareerButton writes the same nodes)
      // so the subtitles are long enough to need their ellipsis.
      const settle = await page.evaluate(async ({ frames, capMs }) => {
        const cont = document.getElementById("mb-continue");
        if (cont) cont.hidden = false;
        const cs = document.getElementById("mb-continue-sub");
        if (cs) cs.textContent = "2026 · ROUND 1 · BAHRAIN INTERNATIONAL CIRCUIT";
        const ks = document.getElementById("mb-career-sub");
        if (ks) ks.textContent = "YOU · ALPINE · 2026 R1 · SAKHIR";
        window.__apex.uiScale(200);
        const snap = () => {
          const anims = ["menu-brand", "menu-buttons"].flatMap((id) => {
            const el = document.getElementById(id);
            if (!el) return [id + ":missing"];
            return el.getAnimations().filter((a) => a.pending || a.playState === "running")
              .map((a) => id + ":" + (a.transitionProperty || a.animationName || "?"));
          });
          const zoom = +getComputedStyle(document.getElementById("menu-buttons")).zoom;
          const density = document.body.dataset.density;
          return { density, anims, zoom, ok: density === "compact" && anims.length === 0 && Math.abs(zoom - 2) < 0.001 };
        };
        let n = 0, starved = false, s = snap();
        while (!s.ok && n < frames) {
          let timer = 0;
          const framed = await Promise.race([
            new Promise((resolve) => requestAnimationFrame(() => resolve(true))),
            new Promise((resolve) => { timer = setTimeout(() => resolve(false), capMs); }),
          ]);
          clearTimeout(timer);
          if (!framed) { starved = true; break; }
          n++;
          s = snap();
        }
        // One more rendered frame so layout reflects the settled zoom.
        if (!starved) await new Promise((resolve) => requestAnimationFrame(() => resolve(true)));
        return { ...s, frames: n, starved };
      }, { frames: SETTLE_FRAMES, capMs: BOOT_MS });
      const dump = JSON.stringify(settle);
      expect(settle.starved, `${name}: no animation frame within ${BOOT_MS} ms (starved, not a layout answer) ${dump}`).toBe(false);
      expect(settle.density, `${name}: compact within ${SETTLE_FRAMES} frames ${dump}`).toBe("compact");
      expect(settle.anims, `${name}: zoom transitions retire within ${SETTLE_FRAMES} frames ${dump}`).toEqual([]);
      expect(settle.zoom, `${name}: uncapped desktop geometry is the requested 2x ${dump}`).toBeCloseTo(2, 2);

      const fit = await page.evaluate(() => {
        const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
        const menu = document.getElementById("menu-buttons");
        const mz = menu.currentCSSZoom;
        const doubled = ["menu-hero", "menu-retention", "menu-primary", "menu-explore", "menu-secondary"]
          .map((id) => document.getElementById(id))
          .filter((el) => el && typeof el.currentCSSZoom === "number" && Math.abs(el.currentCSSZoom - mz) > 0.001)
          .map((el) => `${el.id}:${el.currentCSSZoom}`);
        const over = [];
        let subs = 0;
        for (const btn of menu.querySelectorAll(".bigbtn")) {
          if (btn.hidden || !btn.getClientRects().length) continue;
          const b = btn.getBoundingClientRect();
          for (const sub of btn.querySelectorAll(".mb-sub")) {
            if (getComputedStyle(sub).display === "none" || !sub.getClientRects().length) continue;
            subs++;
            const r = sub.getBoundingClientRect();
            if (r.right > b.right + 1 || r.right > vw + 1) {
              over.push(`${btn.id} sub R${r.right.toFixed(1)} door R${b.right.toFixed(1)} vw ${vw}`);
            }
          }
        }
        const race = document.getElementById("mb-race").getBoundingClientRect();
        const m = menu.getBoundingClientRect();
        // The doors below RACE may run past the fold at 2x; the column must
        // then scroll (not clip) and its last door must come fully on screen.
        const doors = [...menu.querySelectorAll(".bigbtn")].filter((b) => !b.hidden && b.getClientRects().length);
        const last = doors.reduce((a, b) => (b.getBoundingClientRect().bottom > a.getBoundingClientRect().bottom ? b : a));
        const overflowY = getComputedStyle(menu).overflowY;
        const overflows = menu.scrollHeight > menu.clientHeight + 1;
        const top0 = menu.scrollTop;
        menu.scrollTop = menu.scrollHeight;
        const lr = last.getBoundingClientRect();
        menu.scrollTop = top0;
        const reach = {
          last: last.id, overflowY, overflows,
          lastAfterScroll: [lr.top, lr.bottom].map((v) => +v.toFixed(1)),
          ok: (!overflows || /^(auto|scroll)$/.test(overflowY)) && lr.bottom <= Math.min(vh, m.bottom) + 1 && lr.top >= -1,
        };
        return {
          doubled, over, subs, reach,
          race: [race.top, race.bottom, race.left, race.right].map((v) => +v.toFixed(1)),
          menu: [m.top, m.bottom, top0, menu.scrollHeight, menu.clientHeight].map((v) => +v.toFixed(1)),
          raceInView: race.top >= Math.max(0, m.top) - 1 && race.bottom <= Math.min(vh, m.bottom) + 1
            && race.left >= -1 && race.right <= vw + 1,
        };
      });
      const fitDump = JSON.stringify(fit);
      expect(fit.doubled, `${name}: door groups do not zoom on top of #menu-buttons ${fitDump}`).toEqual([]);
      expect(fit.subs, `${name}: the save-line subtitles are measured ${fitDump}`).toBeGreaterThan(0);
      expect(fit.over, `${name}: every door subtitle ends inside its door and the viewport ${fitDump}`).toEqual([]);
      expect(fit.raceInView, `${name}: RACE is on screen without scrolling ${fitDump}`).toBe(true);
      expect(fit.reach.ok, `${name}: the door column scrolls to its last door ${fitDump}`).toBe(true);
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
      const u = __apex.uiScale(), h = __apex.hudScale();
      return { min: h.min, max: u.max };   // HUD SIZE floors at its own 70 % text minimum
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

  test("SETTINGS is a door-index stack that pops BACK to home", async ({ page }) => {
    await page.setViewportSize(LANDSCAPE);
    await boot(page);
    await page.locator("#mb-settings").click();
    await expect(page.locator("#pm-settings-index")).toBeVisible();
    await page.locator("#pm-open-display").click();
    await expect(page.locator("#pm-panel-display")).toBeVisible();
    await expect(page.locator("#pm-settings-index")).toBeHidden();
    await expect(page.locator("#pm-panel-controls")).toBeHidden();
    const wide = await page.evaluate(() => {
      const layout = getComputedStyle(document.getElementById("pm-settings-body"));
      return { layoutCols: layout.gridTemplateColumns.split(" ").length };
    });
    expect(wide.layoutCols).toBe(1);
    await page.locator("#pm-settings-close").click();
    await expect(page.locator("#pm-settings-index")).toBeVisible();
    await expect(page.locator("#pm-panel-display")).toBeHidden();
    await expect(page.locator("#pmsettings")).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    const narrow = await page.evaluate(() => {
      const layout = getComputedStyle(document.getElementById("pm-settings-body"));
      return { layoutCols: layout.gridTemplateColumns.split(" ").length };
    });
    expect(narrow.layoutCols).toBe(1);
    await page.locator("#pm-open-controls").click();
    await expect(page.locator("#pm-panel-controls")).toBeVisible();
    await page.locator("#pm-settings-close").click();
    await expect(page.locator("#pm-settings-index")).toBeVisible();
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


test.describe("Broadcast map control clearance", () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true });
  test("unplaced map clears tall left pedals while custom placement and dimensions survive", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("apex26.steerMode", JSON.stringify("tilt"));
      localStorage.setItem("apex26.hudProfile", JSON.stringify("broadcast"));
      localStorage.removeItem("apex26.hudLayout");
    });
    await boot(page);
    await page.evaluate(() => { __apex.headless(true); __apex.race("bahrain"); });
    await page.waitForFunction(() => __apex.info().track != null, null, { polling: 100, timeout: BOOT_MS });
    await page.evaluate(() => {
      __apex.go(); __apex.park(.18);
      for (const [key,value] of [["--sal","47px"],["--sar","0px"],["--sab","21px"]]) document.documentElement.style.setProperty(key,value);
    });
    for (const hud of [70, 200]) for (const btn of [125, 150, 300]) {
      await page.evaluate(({hud,btn}) => { __apex.hudScale(hud); __apex.btnScale(btn); __apex.camera("chase"); __apex.jump(.18,60,0); }, {hud,btn});
      await waitHudControlsStable(page);
      const result = await page.evaluate(() => {
        const rect = e => { const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}; };
        const map=document.getElementById("minimap"), before=rect(map), stored=localStorage.getItem("apex26.hudLayout");
        const controls=Array.from(document.querySelectorAll(".touchbtn, #pausebtn, #btn-cam")).filter(e=>!e.hidden&&getComputedStyle(e).display!=="none"&&e.getBoundingClientRect().width);
        const original=controls.map(rect);HudLayout.clearReadouts();const after=rect(map), obstacles=controls.map(rect);
        const overlap=(a,b)=>Math.max(0,Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y));
        const collisions=obstacles.map((r,i)=>({id:controls[i].id,area:overlap(after,r)})).filter(r=>r.area>.5);
        const tower=rect(document.querySelector(".hud-top"));
        HudLayout.clearReadouts();const repeated=rect(map);
        return {before,after,repeated,original,obstacles,collisions,towerOverlap:overlap(after,tower),stored,storedAfter:localStorage.getItem("apex26.hudLayout")};
      });
      expect(result.collisions, `HUD${hud}/BTN${btn}`).toEqual([]);expect(result.towerOverlap).toBe(0);
      expect(result.after.w).toBe(result.before.w);expect(result.after.h).toBe(result.before.h);
      expect(result.after.x).toBeGreaterThanOrEqual(47);expect(result.after.y).toBeGreaterThanOrEqual(0);
      expect(result.after.x+result.after.w).toBeLessThanOrEqual(844);expect(result.after.y+result.after.h).toBeLessThanOrEqual(369);
      expect(result.repeated).toEqual(result.after);expect(result.obstacles).toEqual(result.original);expect(result.storedAfter).toBe(result.stored);
    }
    const custom=await page.evaluate(()=>{
      HudLayout.set("map",{x:20,y:0,s:110});const e=document.getElementById("minimap");
      const snap=()=>({x:e.style.getPropertyValue("--hl-x"),y:e.style.getPropertyValue("--hl-y"),s:e.style.getPropertyValue("--hl-s"),saved:localStorage.getItem("apex26.hudLayout")});
      const before=snap();HudLayout.clearReadouts();return {before,after:snap(),cx:e.style.getPropertyValue("--hud-clear-x"),cy:e.style.getPropertyValue("--hud-clear-y")};
    });
    expect(custom.after).toEqual(custom.before);expect(custom.cx).toBe("");expect(custom.cy).toBe("");
  });
});

test("UI inspector verifies real scale bindings, persistence and CSS provenance", async ({ page }, testInfo) => {
  const { installInspector, inspectPage, diffInspections } = await import("../../tools/ui/explorer/inspector.mjs");
  const { writeFileSync } = await import("node:fs");
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  await page.waitForFunction(() => !!window.__apex, null, { polling: 100, timeout: BOOT_MS });
  await page.evaluate(() => { __apex.agentHelp(); __apex.headless(true); });
  const open = async () => {
    await page.locator("#mb-settings").click(); await page.locator("#pm-open-appearance").click();
    await installInspector(page);
  };
  await open();
  const snapshot = () => page.evaluate(() => __apex.ui.inspect({ root: "#pmsettings" }));
  const before = await snapshot();
  const input = page.locator("#as-uiScale"); const old = Number(await input.inputValue());
  await input.focus(); await page.keyboard.press(old < 200 ? "ArrowRight" : "ArrowLeft");
  const value = Number(await input.inputValue()); expect(value).not.toBe(old);
  await expect.poll(async () => (await snapshot()).controls.find(c => c.selector === "#as-uiScale")?.binding.runtime).toBeCloseTo(value, 5);
  const after = await inspectPage(page, { root: "#pmsettings", styles: "#as-uiScale" });
  const control = after.controls.find(c => c.selector === "#as-uiScale");
  expect(control.role).toBe("slider"); expect(control.binding.status).toBe("matches");
  expect(control.binding.saved.value).toBe(value);
  expect(after.styles.rules.some(r => r.source?.includes("/css/") && r.line > 0)).toBe(true);
  expect(after.accessibility).toContain("UI size");
  expect(diffInspections(before, after).changed.some(c => c.selector === "#as-uiScale")).toBe(true);
  // A DOM-only mutation is deliberately NOT a working setting: the inspector must reject it.
  await input.evaluate(e => { e.value = Number(e.value) + (Number(e.value) < 200 ? 1 : -1); });
  expect((await snapshot()).issues.some(i => i.kind === "binding-mismatch" && i.selector === "#as-uiScale")).toBe(true);
  await page.reload(); await page.waitForFunction(() => !!window.__apex, null, { polling: 100, timeout: BOOT_MS });
  await page.evaluate(() => __apex.headless(true)); await open();
  expect((await snapshot()).controls.find(c => c.selector === "#as-uiScale").binding.saved.value).toBe(value);
  for (const viewport of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport); const report = await snapshot();
    expect(report.viewport.width).toBe(viewport.width); expect(report.controls.length).toBeGreaterThan(0);
    expect(report.controls.find(c => c.selector === "#as-uiScale").binding.status).toBe("matches");
  }
  writeFileSync(testInfo.outputPath("ui-inspection.json"), JSON.stringify(after, null, 2));
  expect(errors).toEqual([]);
});

test("UI inspector catches hit interception, inherited disability and axis-specific clipping", async ({ page }) => {
  const { inspectUI, installInspector } = await import("../../tools/ui/explorer/inspector.mjs");
  await page.setViewportSize({ width: 1000, height: 800 });
  await page.setContent(`<style>body{margin:0}#scroll{width:900px;height:80px;overflow-y:auto;overflow-x:hidden}#wide{margin-left:1100px}#cover{position:absolute;left:0;top:100px;width:180px;height:50px;background:red}</style>
    <span id="one">Camera</span><span id="two"> height</span><input id="range" type="range" aria-labelledby="one two">
    <fieldset disabled><button id="disabled">Disabled by fieldset</button></fieldset>
    <button id="blocked" style="position:absolute;left:0;top:100px;width:180px;height:50px">Blocked</button><div id="cover"></div>
    <div id="scroll"><button id="wide">Offscreen</button><div style="height:300px"></div></div>
    <div style="width:100px;overflow:hidden"><div style="width:300px;margin-left:200px;overflow-x:auto"><button id="unreachable">Unreachable</button><div style="width:600px;height:1px"></div></div></div>
    <button id="duplicate">First</button><button id="duplicate">Second</button>
    <div id="contents" style="display:contents;overflow:hidden"><button id="contents-action" style="width:160px;height:50px">Visible action</button></div>
    <div id="outer-clip" style="width:80px;overflow:hidden"><div style="display:contents;overflow:hidden"><button id="contents-clipped" style="width:200px">Really clipped</button></div></div>
    <button aria-pressed="false">Whine</button>`);
  await page.evaluate(() => { window.__apex = { info() { throw new Error("Inspector invoked a lazy game hook"); } }; });
  await installInspector(page);
  const before = await page.evaluate(inspectUI);
  expect(before.controls.find(c => c.selector === "#range").name).toBe("Camera height");
  expect(before.controls.find(c => c.selector === "#range").role).toBe("slider");
  expect(before.controls.find(c => c.selector === "#disabled").disabled).toBe(true);
  expect(before.issues.some(i => i.kind === "blocked" && i.selector === "#blocked")).toBe(true);
  expect(before.issues.some(i => i.kind === "offscreen" && i.selector === "#wide")).toBe(true);
  expect(before.issues.some(i => i.kind === "clipped" && i.selector === "#unreachable")).toBe(true);
  expect(before.controls.find(c => c.selector === "#contents-action").reachability.clippedBy).toEqual([]);
  expect(before.controls.find(c => c.selector === "#contents-action").reachability.hit).toBe("hits");
  expect(before.controls.find(c => c.selector === "#contents-clipped").reachability.clippedBy).toContainEqual({ selector: "#outer-clip", axis: "x" });
  await page.locator("#contents-action").evaluate(e => { e.addEventListener("click", () => { e.dataset.clicked = "yes"; }); });
  await page.locator("#contents-action").click();
  await expect(page.locator("#contents-action")).toHaveAttribute("data-clicked", "yes");
  for (const c of before.controls.filter(c => ["First", "Second"].includes(c.name))) expect(await page.locator(c.selector).count()).toBe(1);
  const toggle = before.controls.find(c => c.name === "Whine");
  expect(toggle.selector).toBeTruthy(); await page.locator(toggle.selector).click();
  await page.locator(toggle.selector).evaluate(e => e.setAttribute("aria-pressed", "true"));
  expect((await page.evaluate(inspectUI)).controls.find(c => c.selector === toggle.selector).pressed).toBe("true");
});

test("UI inspector explains adaptive CSS changes without confusing layout with setting changes", async ({ page }, testInfo) => {
  const { inspectResponsive } = await import("../../tools/ui/explorer/inspector.mjs");
  const { writeFileSync } = await import("node:fs");
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.setContent(`<style>
    :root{--ui-scale:1.25;--safe-l:47px;--safe-r:47px}body{margin:0;padding:10px}#sheet{box-sizing:border-box;width:100%;max-width:800px;overflow:auto}
    #row{display:flex;flex-wrap:nowrap;gap:12px}button{min-width:200px;height:50px}
    @media(max-width:500px){#row{flex-direction:column;flex-wrap:wrap}#sheet{max-height:140px}}
    </style><main id="sheet"><div id="row"><button id="first">First action</button><button>Second action</button><button>Third action</button></div></main>`);
  const report = await inspectResponsive(page, { root: "#sheet", styles: "#row", viewports: [{ width: 1280, height: 800 }, { width: 390, height: 844 }, { width: 844, height: 390 }] });
  expect(page.viewportSize()).toEqual({ width: 1280, height: 800 });
  expect(report.records.every(r => r.settlement.stable && !r.settlement.truncated)).toBe(true);
  const phone = report.records[1].inspection;
  expect(phone.viewport.width).toBe(390);
  expect(phone.adaptive.visualViewport.width).toBeCloseTo(390);
  expect(phone.adaptive.rootTokens["--safe-l"]).toBe("47px");
  expect(phone.adaptive.rootTokens["--ui-scale"]).toBe("1.25");
  const row = phone.layoutContexts.find(c => c.selector === "#row");
  expect(row.computed["flex-direction"]).toBe("column");
  expect(phone.layoutContexts.find(c => c.selector === "#sheet").scroll.height).toBeGreaterThan(140);
  expect(phone.controls.find(c => c.selector === "#first").reachability.scrollY).toBe(true);
  expect(phone.styles.rules.some(r => r.media?.some(m => m.active && m.text.includes("500px")))).toBe(true);
  expect(report.records[1].diff.changed).toEqual([]);
  expect(report.records[1].diff.layoutContexts).toContain("#row");
  expect(report.records[1].diff.environmentChanged).toBe(true);
  expect(report.records[2].inspection.layoutContexts.find(c => c.selector === "#row").computed["flex-direction"]).toBe("row");
  writeFileSync(testInfo.outputPath("adaptive-inspection.json"), JSON.stringify(report, null, 2));
});

test("UI inspector keeps flattened Garage tabs actionable through a viewport sweep", async ({ page }, testInfo) => {
  const { inspectResponsive } = await import("../../tools/ui/explorer/inspector.mjs");
  const { writeFileSync } = await import("node:fs");
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/"); await page.waitForFunction(() => !!window.__apex, null, { polling: 100, timeout: BOOT_MS });
  await page.evaluate(() => { __apex.agentHelp(); __apex.headless(true); });
  await page.locator("#mb-garage").click();
  await expect(page.locator('#carsetup:not([aria-busy="true"])')).toBeVisible();
  const report = await inspectResponsive(page, { root: "#carsetup", styles: "#cs-tab-team", viewports: [{ width: 1280, height: 800 }, { width: 390, height: 844 }, { width: 844, height: 390 }] });
  for (const r of report.records) {
    const tab = r.inspection.controls.find(c => c.selector === "#cs-tab-team");
    expect(tab).toBeTruthy();
    expect(r.settlement.stable).toBe(true);
    expect(tab.reachability.hit).toBe("hits");
    const boxless = r.inspection.layoutContexts.filter(c => !c.boxGenerated && c.computed.display === "contents");
    expect(boxless.length).toBeGreaterThan(0);
    expect(tab.reachability.clippedBy.filter(c => boxless.some(b => b.selector === c.selector))).toEqual([]);
    expect(r.inspection.errorOverlay).toEqual([]);
  }
  await page.locator("#cs-tab-team").click();
  await expect(page.locator("#cs-tab-team")).toHaveAttribute("aria-selected", "true");
  writeFileSync(testInfo.outputPath("garage-adaptive-inspection.json"), JSON.stringify(report, null, 2));
  expect(errors).toEqual([]);
});

test("UI inspector bounds settlement when animation frames do not arrive", async ({ page }) => {
  const { inspectResponsive } = await import("../../tools/ui/explorer/inspector.mjs");
  await page.setContent('<button id="action">Still inspectable</button>');
  const original = page.viewportSize();
  await page.evaluate(() => {
    window.__cancelledFrames = [];
    window.requestAnimationFrame = () => 1234;
    window.cancelAnimationFrame = id => window.__cancelledFrames.push(id);
  });
  const report = await inspectResponsive(page, { viewports: [{ width: 390, height: 844 }] });
  expect(report.records[0].settlement.stable).toBe(false);
  expect(report.records[0].settlement.frames).toBe(0);
  expect(report.records[0].inspection.controls.some(c => c.selector === "#action")).toBe(true);
  expect(await page.evaluate(() => window.__cancelledFrames)).toEqual([1234]);
  expect(page.viewportSize()).toEqual(original);
});

test("UI inspector maps camera and lighting tuner inputs without invoking game hooks", async ({ page }, testInfo) => {
  test.setTimeout(180000);
  const { SCREENS } = await import("../../tools/ui/menu-screens.mjs");
  const { installInspector, inspectUI } = await import("../../tools/ui/explorer/inspector.mjs");
  const { writeFileSync } = await import("node:fs");
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/"); await page.waitForFunction(() => !!window.__apex, null, { polling: 100, timeout: BOOT_MS });
  await page.evaluate(() => { __apex.agentHelp(); __apex.headless(true); });
  await SCREENS.find(s => s.id === "cameratuner").open(page);
  await installInspector(page);
  const camera = await page.evaluate(inspectUI, { root: "#camtune" });
  const knob = camera.controls.find(c => c.binding.kind === "camera-offset" && !c.disabled);
  expect(knob).toBeTruthy(); expect(knob.binding.status).toBe("matches");
  const input = page.locator(knob.selector); await input.focus();
  await page.keyboard.press(Number(knob.value) < Number(knob.max) ? "ArrowRight" : "ArrowLeft");
  const cameraAfter = await page.evaluate(inspectUI, { root: "#camtune" });
  const moved = cameraAfter.controls.find(c => c.selector === knob.selector);
  expect(moved.value).not.toBe(knob.value); expect(moved.binding.status).toBe("matches");
  expect(moved.binding.saved.value).toBe(Number(moved.value));
  await page.locator("#ct-close").click();
  await SCREENS.find(s => s.id === "lightingtuner").open(page);
  await expect(page.locator("#lt-in-keyMul")).toBeVisible();
  await page.locator("#lt-in-keyMul").focus(); await page.keyboard.press("ArrowLeft");
  const lighting = await page.evaluate(inspectUI, { root: "#lighting" });
  const light = lighting.controls.find(c => c.selector === "#lt-in-keyMul");
  expect(light.binding.status).toBe("matches"); expect(light.binding.runtime).toBe(Number(light.value));
  expect(light.binding.saved.status).toBe("unmapped");
  writeFileSync(testInfo.outputPath("tuner-inspection.json"), JSON.stringify({ camera: cameraAfter, lighting }, null, 2));
});

test("UI inspector observes intentional hysteresis on forward and reverse paths", async ({ page }, testInfo) => {
  const { inspectResponsive } = await import("../../tools/ui/explorer/inspector.mjs");
  const { writeFileSync } = await import("node:fs");
  await page.setViewportSize({ width: 380, height: 600 });
  await page.setContent('<main id="sheet" data-pair="off">Text-only classified sheet</main>');
  await page.evaluate(() => {
    const sheet = document.getElementById("sheet");
    const update = () => { if (innerWidth >= 400) sheet.dataset.pair = "on"; else if (innerWidth <= 390) sheet.dataset.pair = "off"; };
    window.addEventListener("resize", update); update();
  });
  const report = await inspectResponsive(page, { root: "#sheet", roundTrip: true, viewports: [380, 395, 405].map(width => ({ width, height: 600 })) });
  expect(report.records.map(r => r.phase)).toEqual(["forward", "forward", "forward", "reverse", "reverse"]);
  expect(report.records.every(r => r.settlement.stable)).toBe(true);
  expect(report.paths.differencesTotal).toBe(1);
  const difference = report.paths.comparisons.find(c => c.requestedViewport.width === 395).differences[0];
  expect(difference).toEqual({ selector: "#sheet", forward: { pair: "off" }, reverse: { pair: "on" } });
  expect(page.viewportSize()).toEqual({ width: 380, height: 600 });
  writeFileSync(testInfo.outputPath("hysteresis-inspection.json"), JSON.stringify(report, null, 2));
});

test("UI inspector records bounded alternating classification evidence", async ({ page }) => {
  const { settleLayout } = await import("../../tools/ui/explorer/transitions.mjs");
  await page.setContent('<main id="sheet" data-density="roomy"><button>Action</button></main>');
  await page.evaluate(() => {
    window.__stopAlternating = false;
    const toggle = () => { if (window.__stopAlternating) return; const e = document.getElementById("sheet"); e.dataset.density = e.dataset.density === "roomy" ? "compact" : "roomy"; requestAnimationFrame(toggle); };
    requestAnimationFrame(toggle);
  });
  let result;
  try { result = await page.evaluate(settleLayout, { root: "#sheet" }); }
  finally { await page.evaluate(() => { window.__stopAlternating = true; }); }
  expect(result.stable).toBe(false);
  expect(result.frames).toBeLessThanOrEqual(120);
  const context = result.history.contexts.find(c => c.selector === "#sheet");
  expect(context.alternating).toBeGreaterThan(0);
  expect(context.states.length).toBeLessThanOrEqual(result.history.limits.statesPerContext);
  expect(context.evidence.length).toBeLessThanOrEqual(result.history.limits.evidencePerContext);
});

test("UI inspector exposes named container and inherited candidate sources", async ({ page }, testInfo) => {
  const { inspectPage } = await import("../../tools/ui/explorer/inspector.mjs");
  const { writeFileSync } = await import("node:fs");
  await page.setContent(`<style>
    #panel{container:panel / inline-size;width:400px;--adaptive-gap:17px}
    #row{display:flex;gap:var(--adaptive-gap)}
    @container panel (min-width:300px){#row{flex-direction:column}}
    </style><main id="panel"><div id="row"><button>First</button><button>Second</button></div></main>`);
  const report = await inspectPage(page, { root: "#panel", styles: "#row" });
  expect(report.styles.computed.find(p => p.name === "flex-direction").value).toBe("column");
  const inherited = report.styles.inherited.find(a => a.ancestor.id === "panel");
  expect(inherited).toBeTruthy();
  expect(inherited.rules.some(r => r.declarations.some(d => d.name === "--adaptive-gap" && d.value === "17px"))).toBe(true);
  const query = report.styles.rules.flatMap(r => r.containerQueries || []).find(q => q.name === "panel");
  expect(query).toBeTruthy();
  expect(query.condition.status).toBe("unavailable");
  expect(query.container.status).toBe("available");
  expect(query.container.node.id).toBe("panel");
  expect(query.container.geometry.width).toBeCloseTo(400);
  writeFileSync(testInfo.outputPath("container-inherited-inspection.json"), JSON.stringify(report, null, 2));
});

test("UI inspector joins native findings only for matching rendered provenance", async ({ page }) => {
  const { inspectPage } = await import("../../tools/ui/explorer/inspector.mjs");
  const { captureAuditEnvironment, captureAuditSelectors } = await import("../../tools/ui/explorer/audit-evidence.mjs");
  await page.setContent(`<style>:root{--ui-scale:1;--hud-scale:1;--hud-btn-scale:1;--sat:0px;--sar:0px;--sab:0px;--sal:0px;--safe-t:0px;--safe-r:0px;--safe-b:0px;--safe-l:0px;--gut:0px}</style><main id="sheet"><button id="tiny" style="width:12px;height:12px">X</button></main>`);
  const source = { sha: "a".repeat(40), dirty: false, fingerprint: null };
  const environment = await page.evaluate(captureAuditEnvironment, { root: "#sheet", source });
  const selectorIndex = await page.evaluate(captureAuditSelectors, { root: "#sheet", selectors: ["#tiny"] });
  const box = await page.locator("#tiny").boundingBox();
  const row = { screen: "fixture", environment, selectorIndex, tap: [{ el: "#tiny", w: box.width, h: box.height, sev: "tiny" }], spacing: [], type: [], overflow: [], marker: [] };
  const audits = { producer: "fit-audit", rows: [row, { ...row, error: "setup failed" }, { ...row, environment: { ...environment, pointer: { ...environment.pointer, coarse: !environment.pointer.coarse } } }] };
  const report = await inspectPage(page, { root: "#sheet", source, audits });
  expect(report.auditEvidence.cells.map(c => c.status)).toEqual(["comparable", "skipped", "incomparable"]);
  expect(report.auditEvidence.findings).toHaveLength(1);
  expect(report.auditEvidence.findings[0].mapping.status).toBe("mapped");
  expect(report.auditEvidence.findings[0].mapping.selector).toBe("#tiny");
});
