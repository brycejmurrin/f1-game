// #4529 part 1, the device-safe check the issue asks for before landing: Bryce's phone (tools/lib/bryce-phone.mjs,
// standalone 852x393 + insets) seeded with his 2026-11-10 export. The reverted #4897 (#5143: "UI squished, zoom
// remapped") swapped sizes on a stale boot shape and was SEPARATE by default.
//   1. SHARED (shipped): a rotation, and a launch that reads the portrait pair before landscape, change no stored
//      key and no painted size (--ui-scale, --hud-btn-scale).
//   2. SEPARATE (opt-in): a settled portrait boot loads the lazy LayoutPresets and swaps in portrait's copy once.
// Chromium emulation: not WebKit, not his device (bryce-phone `limits`).
import { test, expect } from "@playwright/test";
import { openBrycePhone, brycePhone } from "../../tools/lib/bryce-phone.mjs";

const BOOT = 60000;
const PORTRAIT = { width: 393, height: 852 }, LANDSCAPE = { width: 852, height: 393 };

/** In-page: every apex26.* key, the painted size tokens and the ICB shape. */
function stateInPage() {
  const keys = {};
  for (const k of Object.keys(localStorage).sort()) if (k.startsWith("apex26.")) keys[k] = localStorage.getItem(k);
  const cs = getComputedStyle(document.documentElement);
  return { keys, ui: cs.getPropertyValue("--ui-scale").trim(), btn: cs.getPropertyValue("--hud-btn-scale").trim(), shape: document.body.dataset.shape || null };
}

/** Past AppearanceStudio's SHAPE_SETTLE_MS (2000) since the last shape answer, with margin. */
const settled = (page) => page.waitForFunction(() => performance.now() - window.__shapeAt > 2600, null, { polling: 100, timeout: 15000 });

async function boot(browser, baseURL, { extra = null, first = LANDSCAPE } = {}) {
  const { context, page } = await openBrycePhone(browser, { window: "standalone", dpr: 1 });
  await context.addInitScript((e) => {
    window.__TEST_MODE = true;
    try { localStorage.setItem("apex26.gfxBackend", "webgl2"); if (e) for (const [k, v] of Object.entries(e)) localStorage.setItem(k, v); } catch (_) { /* read-back fails loudly */ }
    // When body[data-shape] (SheetShape's ICB answer) last changed: settled() waits out AppearanceStudio's 2 s window.
    window.__shapeAt = performance.now();
    document.addEventListener("DOMContentLoaded", () => new MutationObserver(() => { window.__shapeAt = performance.now(); })
      .observe(document.body, { attributes: true, attributeFilter: ["data-shape"] }));
  }, extra);
  await page.setViewportSize(first);
  await page.goto(String(baseURL), { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForFunction(() => window.__apex && document.documentElement.hasAttribute("data-booted"), null, { polling: 100, timeout: BOOT });
  await page.evaluate(() => window.__apex.headless(true));
  return { context, page };
}

test.describe("PORTRAIT & LANDSCAPE on Bryce's phone (#4529)", () => {
  test.setTimeout(180000);

  test("SHARED: a rotation and a stale portrait launch change no stored key and no painted size", async ({ browser, baseURL }) => {
    let before;
    const { context, page } = await boot(browser, baseURL);
    try {
      await settled(page);
      before = await page.evaluate(stateInPage);
      expect(before.shape).toBe("wide");
      expect(before.keys["apex26.appearanceShapes"], "SHARED is the absent key").toBeUndefined();
      await page.setViewportSize(PORTRAIT);
      await page.waitForFunction(() => document.body.dataset.shape === "tall", null, { polling: 100, timeout: 10000 });
      await settled(page);
      const tall = await page.evaluate(stateInPage);
      expect(tall.keys).toEqual(before.keys);
      expect([tall.ui, tall.btn]).toEqual([before.ui, before.btn]);
      await page.setViewportSize(LANDSCAPE);
      await settled(page);
      expect(await page.evaluate(stateInPage)).toEqual(before);
    } finally { await context.close(); }

    // A Home-Screen launch that reports the portrait pair first, then lays out landscape.
    const stale = await boot(browser, baseURL, { first: PORTRAIT });
    try {
      await stale.page.setViewportSize(LANDSCAPE);
      await stale.page.waitForFunction(() => document.body.dataset.shape === "wide", null, { polling: 100, timeout: 10000 });
      await settled(stale.page);
      const after = await stale.page.evaluate(stateInPage);
      expect(after.shape).toBe("wide");
      expect([after.ui, after.btn]).toEqual([before.ui, before.btn]);
      expect(after.keys["apex26.appearanceShapes"]).toBeUndefined();
      expect(after.keys["apex26.uiScale"]).toBe(before.keys["apex26.uiScale"]);
    } finally { await stale.context.close(); }
  });

  test("SEPARATE: a settled portrait boot swaps in portrait's copy once, through the lazy bundle", async ({ browser, baseURL }) => {
    const shapes = { v: 2, mode: "separate", live: "wide", park: { uiScale: 85 } };
    const { context, page } = await boot(browser, baseURL, { first: PORTRAIT, extra: { "apex26.appearanceShapes": JSON.stringify(shapes) } });
    try {
      await page.waitForFunction(() => JSON.parse(localStorage.getItem("apex26.appearanceShapes") || "{}").live === "tall", null, { polling: 200, timeout: 15000 });
      const s = await page.evaluate(stateInPage);
      expect(s.shape).toBe("tall");
      expect(JSON.parse(s.keys["apex26.uiScale"])).toBe(85);
      const stored = JSON.parse(s.keys["apex26.appearanceShapes"]);
      // Landscape's live UI SIZE is the seeded profile's (bryce-phone `live`), now parked.
      expect(stored.park.uiScale, "landscape's profile UI SIZE is parked").toBe(brycePhone().uiScale);
      expect(await page.evaluate(() => typeof LayoutPresets)).toBe("object");
    } finally { await context.close(); }
  });
});
