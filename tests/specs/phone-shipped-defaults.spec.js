// @ts-check
// THE SHIPPED PHONE LOOK IS THE OWNER'S PROFILE (#5358).
//
// Bryce, 2026-11-10, attaching his Home Screen app export: "these are the settings I need to set to make it look
// playable and not way too big like you have it". tests/data/settings-live-export-2026-11-10.json stores UI SIZE 70,
// BUTTON 143.25 (not shipped, see below) and per-screen looks (pause, select, race settings, garage, designer, title buttons). Those are now
// what a phone with NOTHING stored reads (js/ui/scale.js, js/ui/screen-looks.js `phone`, js/ui/title-layout.js
// PHONE_WIDE), so a clean profile and his export must paint the same boxes.
//
// Measured 2026-11-13 at 852x393 + insets 59/59/21, before -> after, against his export:
//   title    doors 192x44 -> 193x48 (his 193x48)          select   BACK 235x57 -> 239x44, card text 17.4 -> 11.2 px
//   race     sheet 734 -> 638 wide, GO 352x57 -> 309x40   garage   panel 447 -> 294 wide (his 323), DONE 44 tall (his 35)
//   pause    RESUME 254x57 -> 250x52                      HUD      pedals 85 both; steer pad 90 (his 103)
// Not compared: his own hudLayout positions, HUD elements he turned off, the sound label (personal choices).
// Not shipped: his garage BUTTON HEIGHT 80, which paints DONE 35 px tall, under the 44 px tap floor
// (tests/data/bryce-phone-paint.json holds that count at 0). A clean profile paints DONE 44 px; asserted below.
// Not shipped: his BUTTON 143.25. In tilt / drag steering it makes fitHud shrink the readouts (minimap 103 -> 90 px)
// and hud-layout.spec.js stops settling; in his BUTTONS steering it only grows the steer pad 90 -> 103 px.
// Not shipped: his garage PANEL WIDTH 110, which clips 13 % of UNLIMITED at UI SIZE 50 % (ui-scale.spec.js). A clean
// garage panel paints 294 px wide against his 323, so the garage compares the tab SIZES only (STAT BARS: HIDE ships).
//
// Two contexts on his phone (tools/lib/bryce-phone.mjs: descriptor + CDP env() insets): one clean, one seeded with
// the export the way a boot reads it. Rects are getBoundingClientRect; a box may differ by 1 px (zoom rounding).
import { rotateIPhone15 } from "../helpers/iphone15.mjs";
import { test, expect } from "@playwright/test";
import { OWNER_EXPORT, openBrycePhone, ownerStore, storeEntries } from "../../tools/lib/bryce-phone.mjs";
import { settleInPage } from "../helpers/title-fit.mjs";

const EXPORT_FILE = OWNER_EXPORT;   // his 2026-11-10 export: tools/lib/bryce-phone.mjs `live` (#5218)
const BOOT = 60000;
/** Per screen: how a player opens it from the title, and the boxes compared. */
const MENUS = [
  { id: "title", open: async () => {}, ids: ["menu-buttons", "menu-retention", "mb-career", "mb-race", "mb-garage", "mb-data", "mb-photo", "mb-settings", "mb-saves"] },
  { id: "select", open: async (p) => { await p.click("#mb-race"); await p.waitForSelector("#select:not([hidden])"); },
    ids: ["sel-inner", "select-title", "sel-track-search", "sel-map-btn", "sel-back", "sel-car", "sel-go"] },
  { id: "race settings", open: async (p) => { await p.click("#mb-race"); await p.waitForSelector("#select:not([hidden])"); await p.click("#sel-go"); await p.waitForSelector("#race-settings:not([hidden])"); },
    ids: ["dlg-racesettings", "rs-laps-prev", "rs-laps-sel", "rs-laps-next", "rs-weather-next", "rs-cancel", "rs-go"] },
  { id: "garage", open: async (p) => { await p.click("#mb-garage"); await p.waitForSelector("#carsetup:not([hidden])"); await p.waitForFunction(() => { const b = document.getElementById("cs-done"); return b && b.getBoundingClientRect().width > 0; }, null, { polling: 100 }); },
    ids: ["cs-tab-team", "cs-tab-engine"] },   // sizes only are compared for the garage (his PANEL WIDTH 110 is not shipped)
  { id: "designer", open: async (p) => { await p.click("#mb-designer"); await p.waitForSelector("#trackdesigner:not([hidden])"); await p.waitForFunction(() => typeof TrackDesigner !== "undefined" && TrackDesigner.isOpen() && !TrackDesigner.state().pending, null, { polling: 100 }); },
    ids: ["td-close", "td-title", "td-tab-design", "td-tab-library", "td-tab-howto"] },
];
const HUD_IDS = ["btn-throttle", "btn-brake", "btn-aero", "pausebtn"];   // not the steer pad: BUTTON 143.25 is his own
const PAUSE_IDS = ["pm-resume", "pm-restart", "pm-settings", "pm-strategy", "pm-recover", "pm-quit"];

/** In-page: painted box of each id as [left, top, width, height, font px], or null when it is not painted. */
function rectsInPage(ids) {
  const out = {};
  for (const id of ids) {
    const el = document.getElementById(id);
    const r = el && (!el.checkVisibility || el.checkVisibility()) ? el.getBoundingClientRect() : null;
    out[id] = r && r.width > 0 ? [r.left, r.top, r.width, r.height, parseFloat(getComputedStyle(el).fontSize) * (el.currentCSSZoom || 1)] : null;
  }
  return { rects: out, page: [document.documentElement.scrollWidth - innerWidth, document.documentElement.scrollHeight - innerHeight] };
}

/** In-page: resolve once the compared boxes and body density are unchanged for `frames` frames (cap 600). */
function quietInPage({ ids, frames }) {
  return new Promise((done) => {
    let last = "", stable = 0, n = 0;
    const tick = () => {
      n++;
      const key = document.body.dataset.density + "|" + ids.map((id) => {
        const el = document.getElementById(id), r = el && el.getBoundingClientRect();
        return r ? [r.left, r.top, r.width, r.height, getComputedStyle(el).fontSize, el.dataset.density].join(",") : "-";
      }).join(";");
      if (key === last) { if (++stable >= frames) return done(n); } else { stable = 0; last = key; }
      if (n > 600) return done(-n);
      requestAnimationFrame(tick);
    };
    tick();
  });
}

/** In-page (#5578): every title door whose label or icon does NOT follow the door's font-size in the same frame. The row
 *  tier measures labels the moment a size lands; a transition on an inherited font-size hands it the previous one. */
function labelLagInPage() {
  const late = [];
  for (const b of document.querySelectorAll("#menu-buttons .bigbtn")) {
    if (!(b.getBoundingClientRect().width > 0)) continue;
    b.style.fontSize = "30px";
    for (const e of b.querySelectorAll("span, .btn-ico")) if (getComputedStyle(e).fontSize !== "30px" && !e.closest(".mb-sub") && !e.style.fontSize) late.push(b.id + " " + (e.className.baseVal ?? e.className ?? e.tagName) + " " + getComputedStyle(e).fontSize);
    b.style.fontSize = "";
  }
  return { motion: document.documentElement.dataset.motion || null, late };
}

async function bootPhone(browser, baseURL, entries) {
  const { context, page, cdp, preset } = await openBrycePhone(browser, { window: "standalone", dpr: 1, profile: false });
  await context.addInitScript((e) => {
    window.__TEST_MODE = true;
    try {
      if (!localStorage.getItem("__5358-seeded")) { for (const [k, v] of Object.entries(e)) localStorage.setItem(k, v); localStorage.setItem("__5358-seeded", "1"); }
      localStorage.setItem("apex26.gfxBackend", "webgl2");
    } catch (_) { /* storage refused: the read-back below fails loudly */ }
  }, entries);
  page.setDefaultTimeout(20000);
  const load = async () => {
    await page.goto(String(baseURL), { waitUntil: "domcontentloaded", timeout: 90000 });
    await page.waitForFunction(() => window.__apex && window.__apex.race && document.documentElement.hasAttribute("data-booted"), null, { polling: 100, timeout: BOOT });
    await page.evaluate(() => window.__apex.headless(true));   // geometry, not frames
  };
  return { context, page, cdp, preset, load };
}

/** Every screen's boxes for one profile. */
async function measure(browser, baseURL, entries) {
  const { context, page, load } = await bootPhone(browser, baseURL, entries);
  const out = {};
  try {
    for (const s of MENUS) {
      await load();
      await s.open(page);
      // Paint gate: the first compared id has a real box (replaces a fixed 500 ms sleep).
      await page.waitForFunction((id) => {
        const el = document.getElementById(id);
        const r = el && el.getBoundingClientRect();
        return !!(r && r.width > 0 && r.height > 0);
      }, s.ids[0], { polling: 50, timeout: BOOT });
      // The title's row tier reads label widths, so it is only final once the web fonts are in and the fit is quiet.
      // The 5-row, 264 px title against 7 rows, 362 px (CI runs 43764591144, 43963990479) was not this wait: under
      // MOTION REDUCED a label lagged its door's font-size by a frame (#5578, css/responsive.css); `lag` holds that.
      if (s.id === "title") { await page.waitForFunction(() => document.fonts.status === "loaded", null, { polling: 100, timeout: BOOT }); await page.evaluate(settleInPage, 12); }
      // Every other sheet is only final once its fit is quiet too (Pages 44573978727: sheet-shape settles density after the
      // screen shows, and the paint gate alone sampled #dlg-racesettings mid-fit, in either direction).
      else await page.evaluate(quietInPage, { ids: s.ids, frames: 6 });
      out[s.id] = await page.evaluate(rectsInPage, s.ids);
      if (s.id === "title") out.lag = await page.evaluate(labelLagInPage);
      if (s.id === "garage") out.done = await page.evaluate(() => document.getElementById("cs-done").getBoundingClientRect().height);
    }
    await load();
    out.vars = await page.evaluate(() => { const cs = getComputedStyle(document.documentElement); return { ui: cs.getPropertyValue("--ui-scale").trim(), btn: cs.getPropertyValue("--hud-btn-scale").trim(), hud: cs.getPropertyValue("--hud-scale").trim() }; });
    out.stored = await page.evaluate(() => Object.keys(localStorage).filter((k) => /^apex26\.(uiScale|hudBtnScale|hudScale|titleLayout|look[A-Z]\w+)$/.test(k)).sort());
    await page.evaluate(async () => { await window.__apex.race("monza", null, null, { grid: "tier" }); });
    await page.waitForFunction(() => window.__apex.info().track === "monza", null, { polling: 100, timeout: 90000 });
    await page.evaluate(() => { window.__apex.go(); window.__apex.jump(0.2, 45); window.__apex.snapCam(); window.__apex.freeze(true); });
    await page.waitForSelector("#hud:not([hidden])");
    // Pedals painted (replaces a fixed 800 ms sleep after #hud).
    await page.waitForFunction((id) => {
      const el = document.getElementById(id);
      const r = el && el.getBoundingClientRect();
      return !!(r && r.width > 0);
    }, HUD_IDS[0], { polling: 50, timeout: BOOT });
    out.hud = await page.evaluate(rectsInPage, HUD_IDS);
    await page.evaluate(() => document.getElementById("pausebtn").click());
    await page.waitForSelector("#pausemenu:not([hidden])");
    // RESUME painted (replaces a fixed 500 ms sleep after #pausemenu).
    await page.waitForFunction((id) => {
      const el = document.getElementById(id);
      const r = el && el.getBoundingClientRect();
      return !!(r && r.width > 0);
    }, PAUSE_IDS[0], { polling: 50, timeout: BOOT });
    out.pause = await page.evaluate(rectsInPage, PAUSE_IDS);
  } finally { await context.close().catch(() => {}); }
  return out;
}

test.describe("a clean phone profile paints what the owner's 2026-11-10 export paints (852x393)", () => {
  test("title, select, race settings, garage, designer, HUD dock and pause: the same boxes", async ({ browser, baseURL }) => {
    test.setTimeout(600_000);
    const clean = await measure(browser, baseURL, {});
    const his = await measure(browser, baseURL, storeEntries(ownerStore({ file: EXPORT_FILE }).store));

    expect(his.vars, "his export reached the page").toEqual({ ui: "0.7", btn: "1.4325", hud: "1" });
    expect(clean.vars, "a clean phone ships his UI SIZE; BUTTON stays at the touch default").toEqual({ ui: "0.7", btn: "1.25", hud: "1" });
    expect(clean.stored, "and a clean profile stored none of them: they are defaults, not writes").toEqual([]);

    // #5578: the suite runs MOTION REDUCED (playwright.config.js reducedMotion), where the title's doors must still hand
    // the fit their CURRENT label size. Before the fix every door's label read its previous font-size for one frame.
    for (const [who, m] of [["clean", clean], ["his export", his]]) {
      const hero = m.title.rects["mb-career"], retention = m.title.rects["menu-retention"];
      expect(hero[2], who + ": Career spans the menu column").toBeGreaterThanOrEqual(retention[2] - 1);
      expect(retention[1], who + ": Continue and Daily follow Career").toBeGreaterThanOrEqual(hero[1] + hero[3] - 1);
      expect(m.lag.motion, `${who}: this spec boots with MOTION REDUCED (the state #5578 needs)`).toBe("reduce");
      expect(m.lag.late, `${who}: a title door's label and icon follow the door's font-size in the same frame`).toEqual([]);
    }

    const screens = [...MENUS.map((s) => [s.id, s.ids]), ["hud", HUD_IDS], ["pause", PAUSE_IDS]];
    for (const [id, ids] of screens) {
      for (const k of ids) {
        const a = clean[id].rects[k], b = his[id].rects[k];
        expect(b, `${id} #${k} is painted with his export`).not.toBeNull();
        expect(a, `${id} #${k} is painted on a clean profile`).not.toBeNull();
        const from = id === "garage" ? 2 : 0;   // garage: width, height, font (the panel is 29 px narrower than his)
        const worst = Math.max(...a.slice(from).map((n, i) => Math.abs(n - b[i + from])));
        expect(worst, `${id} #${k}: clean [${a.map((n) => n.toFixed(1))}] vs his [${b.map((n) => n.toFixed(1))}] (left, top, width, height, font px)`).toBeLessThanOrEqual(1);
      }
      expect(clean[id].page, `${id}: the page does not scroll on a clean profile`).toEqual([0, 0]);
    }
    expect(clean.done, "garage DONE keeps the 44 px tap floor on a clean profile (his BUTTON HEIGHT 80 paints 35)").toBeGreaterThanOrEqual(44);
  });
});

test("the title Button Style setting survives rotation and reload", async ({ browser, baseURL }) => {
  const { context, page, cdp, load } = await bootPhone(browser, baseURL, {});
  const rotate = async (orientation) => {
    await rotateIPhone15(page, cdp, orientation);
    await expect(page.locator("body")).toHaveAttribute("data-shape", orientation === "standalone" ? "wide" : "tall");
  };
  const paint = () => page.locator("#mb-career, #mb-race, #mb-settings").evaluateAll(buttons =>
    buttons.map(button => {
      const css = getComputedStyle(button);
      return { id: button.id, fill: css.backgroundColor, image: css.backgroundImage, ink: css.color, font: css.fontStyle, transform: css.transform };
    }));
  const choose = async (current, next) => {
    await page.locator("#mb-settings").tap();
    await page.locator("#pm-open-appearance").tap();
    const fold = page.locator("#pm-titlescreen");
    if (await fold.getAttribute("open") === null) await fold.locator("summary").first().tap();
    const selector = fold.getByRole("combobox", { name: "BUTTON STYLE", exact: true });
    await expect(selector).toHaveValue(current);
    await selector.selectOption(next);
    await page.locator("#pm-settings-close").tap();
    await page.locator("#pm-settings-close").tap();
    await expect(page.locator("#mb-race")).toBeVisible();
  };

  try {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await load();
    await rotate("standalone");
    await expect(page.locator("#mb-race")).toHaveCSS("font-style", "italic");
    const racing = await paint();
    await rotate("portrait");
    await expect(page.locator("#mb-race")).toHaveCSS("font-style", "normal");
    const flat = await paint();

    await choose("auto", "racing");
    await expect.poll(paint).toEqual(racing);
    await rotate("standalone");
    await expect.poll(paint).toEqual(racing);

    await choose("racing", "flat");
    await expect.poll(paint).toEqual(flat);
    await load();
    await expect.poll(paint).toEqual(flat);
    await rotate("portrait");
    await expect.poll(paint).toEqual(flat);

    await choose("flat", "auto");
    await expect.poll(paint).toEqual(flat);
    await rotate("standalone");
    await expect.poll(paint).toEqual(racing);
  } finally { await context.close(); }
});
