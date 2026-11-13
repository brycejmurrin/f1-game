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
//   race     sheet 734 -> 638 wide, GO 352x57 -> 309x40   garage   panel 447 -> 323 wide, DONE 130x52 -> 307x44 (his 35)
//   pause    RESUME 254x57 -> 250x52                      HUD      pedals 85 both; steer pad 90 (his 103)
// Not compared: his own hudLayout positions, HUD elements he turned off, the sound label (personal choices).
// Not shipped: his garage BUTTON HEIGHT 80, which paints DONE 35 px tall, under the 44 px tap floor
// (tests/data/bryce-phone-paint.json holds that count at 0). A clean profile paints DONE 44 px; asserted below.
// Not shipped: his BUTTON 143.25. In tilt / drag steering it makes fitHud shrink the readouts (minimap 103 -> 90 px)
// and hud-layout.spec.js stops settling; in his BUTTONS steering it only grows the steer pad 90 -> 103 px.
//
// Two contexts on his phone (tools/lib/bryce-phone.mjs: descriptor + CDP env() insets): one clean, one seeded with
// the export the way a boot reads it. Rects are getBoundingClientRect; a box may differ by 1 px (zoom rounding).
import { test, expect } from "@playwright/test";
import { openBrycePhone, ownerStore, storeEntries } from "../../tools/lib/bryce-phone.mjs";

const EXPORT_FILE = "tests/data/settings-live-export-2026-11-10.json";
const BOOT = 60000;
/** Per screen: how a player opens it from the title, and the boxes compared. */
const MENUS = [
  { id: "title", open: async () => {}, ids: ["menu-buttons", "mb-career", "mb-race", "mb-garage", "mb-data", "mb-photo", "mb-settings", "mb-saves"] },
  { id: "select", open: async (p) => { await p.click("#mb-race"); await p.waitForSelector("#select:not([hidden])"); },
    ids: ["sel-inner", "select-title", "sel-track-search", "sel-map-btn", "sel-back", "sel-car", "sel-go"] },
  { id: "race settings", open: async (p) => { await p.click("#mb-race"); await p.waitForSelector("#select:not([hidden])"); await p.click("#sel-go"); await p.waitForSelector("#race-settings:not([hidden])"); },
    ids: ["dlg-racesettings", "rs-laps-prev", "rs-laps-sel", "rs-laps-next", "rs-weather-next", "rs-cancel", "rs-go"] },
  { id: "garage", open: async (p) => { await p.click("#mb-garage"); await p.waitForSelector("#carsetup:not([hidden])"); await p.waitForFunction(() => { const b = document.getElementById("cs-done"); return b && b.getBoundingClientRect().width > 0; }, null, { polling: 100 }); },
    ids: ["cs-inner", "cs-stack", "cs-unlimited", "cs-tab-team", "cs-tab-engine"] },
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

async function bootPhone(browser, baseURL, entries) {
  const { context, page, preset } = await openBrycePhone(browser, { window: "standalone", dpr: 1, profile: false });
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
  return { context, page, preset, load };
}

/** Every screen's boxes for one profile. */
async function measure(browser, baseURL, entries) {
  const { context, page, load } = await bootPhone(browser, baseURL, entries);
  const out = {};
  try {
    for (const s of MENUS) {
      await load();
      await s.open(page);
      await page.waitForTimeout(500);
      out[s.id] = await page.evaluate(rectsInPage, s.ids);
      if (s.id === "garage") out.done = await page.evaluate(() => document.getElementById("cs-done").getBoundingClientRect().height);
    }
    await load();
    out.vars = await page.evaluate(() => { const cs = getComputedStyle(document.documentElement); return { ui: cs.getPropertyValue("--ui-scale").trim(), btn: cs.getPropertyValue("--hud-btn-scale").trim(), hud: cs.getPropertyValue("--hud-scale").trim() }; });
    out.stored = await page.evaluate(() => Object.keys(localStorage).filter((k) => /^apex26\.(uiScale|hudBtnScale|hudScale|titleLayout|look[A-Z]\w+)$/.test(k)).sort());
    await page.evaluate(async () => { await window.__apex.race("monza", null, null, { grid: "tier" }); });
    await page.waitForFunction(() => window.__apex.info().track === "monza", null, { polling: 100, timeout: 90000 });
    await page.evaluate(() => { window.__apex.go(); window.__apex.jump(0.2, 45); window.__apex.snapCam(); window.__apex.freeze(true); });
    await page.waitForSelector("#hud:not([hidden])");
    await page.waitForTimeout(800);
    out.hud = await page.evaluate(rectsInPage, HUD_IDS);
    await page.evaluate(() => document.getElementById("pausebtn").click());
    await page.waitForSelector("#pausemenu:not([hidden])");
    await page.waitForTimeout(500);
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

    const screens = [...MENUS.map((s) => [s.id, s.ids]), ["hud", HUD_IDS], ["pause", PAUSE_IDS]];
    for (const [id, ids] of screens) {
      for (const k of ids) {
        const a = clean[id].rects[k], b = his[id].rects[k];
        expect(b, `${id} #${k} is painted with his export`).not.toBeNull();
        expect(a, `${id} #${k} is painted on a clean profile`).not.toBeNull();
        const worst = Math.max(...a.map((n, i) => Math.abs(n - b[i])));
        expect(worst, `${id} #${k}: clean [${a.map((n) => n.toFixed(1))}] vs his [${b.map((n) => n.toFixed(1))}] (left, top, width, height, font px)`).toBeLessThanOrEqual(1);
      }
      expect(clean[id].page, `${id}: the page does not scroll on a clean profile`).toEqual([0, 0]);
    }
    expect(clean.done, "garage DONE keeps the 44 px tap floor on a clean profile (his BUTTON HEIGHT 80 paints 35)").toBeGreaterThanOrEqual(44);
  });
});
