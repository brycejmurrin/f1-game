// @ts-check
// #6596: ARRANGE (js/ui/screen-placement.js) has no safe-area clamp. Bryce's saved screen placement (his
// 2026-11-25 export) moved, widened and heightened the garage, Photo Studio and lighting tuner into the iPhone 15
// insets: portrait garage CAMERA / PHOTO / ACTIVE AERO 26 px into the 34 px home-indicator band, landscape
// #cs-options 16 px into the right inset, Photo Studio CAPTURE / DONE 17 px into the bottom inset, lighting
// FREE CAMERA 15 px into the right inset. The applied sheet now caps sizes at the safe box and a measured
// shift pulls a moved region back inside; the stored values are never rewritten.
//
// Chromium emulation, not Safari on the device: real env() insets through CDP
// (Emulation.setSafeAreaInsetsOverride), iPhone 15 windows from tests/data/phone-windows.json, his export seeded
// the way a boot reads it (tools/lib/bryce-phone.mjs ownerStore). DPR 1: CSS geometry does not depend on it.
import { BRYCE_WINDOWS, ownerStore } from "../../tools/lib/bryce-phone.mjs";
import { test, expect, BOOT_MS, TRACK_MS } from "../helpers/fixtures.js";

const EXPORT = "tests/data/settings-live-export-2026-11-25.json";
const GARAGE = ["cs-cam", "cs-photo", "cs-aero", "cs-options", "cs-done"];
const STUDIO = ["ps-capture", "ps-close", "ps-panel", "ps-focus-camera"];
const TUNER = ["lt-close", "pc-toggle", "lt-rows"];

async function boot(page, geo) {
  const { store } = ownerStore({ file: EXPORT });
  const placement = store.json.screenPlacement;
  expect(placement?.screens?.carsetup, "his export carries the garage placement under test").toBeTruthy();
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: geo.insets });
  await page.addInitScript(({ json, raw }) => {
    try {
      for (const [k, v] of Object.entries(json)) localStorage.setItem("apex26." + k, JSON.stringify(v));
      for (const [k, v] of Object.entries(raw)) localStorage.setItem("apex26." + k, v);
      localStorage.setItem("apex26.portraitOk", "1");
    } catch (_) { /* storage off: the placement read-back below fails loudly */ }
  }, store);
  await page.goto("/");
  await page.waitForFunction(() => window.__apex && window.__apex.race && document.documentElement.hasAttribute("data-booted"), null, { polling: 100, timeout: BOOT_MS });
  return placement;
}

/** In-page: each id's rect and how far it sits inside each inset (0 = clear), in CSS px. */
function rectsInPage(ids) {
  const cs = getComputedStyle(document.documentElement);
  const inset = (n) => parseFloat(cs.getPropertyValue(n)) || 0;
  const box = { left: inset("--sal"), top: inset("--sat"), right: innerWidth - inset("--sar"), bottom: innerHeight - inset("--sab") };
  const out = {};
  for (const id of ids) {
    const el = document.getElementById(id);
    const r = el && el.getBoundingClientRect();
    if (!r || !r.width || !r.height) { out[id] = null; continue; }
    out[id] = {
      rect: [r.left, r.top, r.right, r.bottom].map((v) => Math.round(v)),
      into: Math.round(Math.max(box.left - r.left, r.right - box.right, box.top - r.top, r.bottom - box.bottom, 0)),
    };
  }
  return { box, out };
}

async function expectInside(page, ids, label) {
  // A placed region is clamped once it has a size (ResizeObserver), so poll until the layout settles.
  let last = null;
  await expect.poll(async () => {
    last = await page.evaluate(rectsInPage, ids);
    return ids.filter((id) => !last.out[id] || last.out[id].into > 1);
  }, { timeout: 20000, message: label }).toEqual([]);
  test.info().annotations.push({ type: "rects", description: `${label}: ${JSON.stringify(last)}` });
  console.log(`[arrange-safe-area] ${label} ${JSON.stringify(last)}`);
}

async function openGarage(page) {
  await page.evaluate(() => document.getElementById("mb-garage").click());
  await expect(page.locator("#carsetup")).toBeVisible({ timeout: BOOT_MS });
  await page.waitForFunction(() => { const b = document.getElementById("cs-aero"); return b && b.getBoundingClientRect().width > 0; }, null, { polling: 100, timeout: BOOT_MS });
}

const PORTRAIT = BRYCE_WINDOWS.portrait, LANDSCAPE = BRYCE_WINDOWS.standalone;
const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("apex26.screenPlacement") || "null"));

test.describe(`#6596 his placement, portrait ${PORTRAIT.width}x${PORTRAIT.height}`, () => {
  test.use({ viewport: { width: PORTRAIT.width, height: PORTRAIT.height }, hasTouch: true, isMobile: true });

  test("garage: CAMERA / PHOTO / ACTIVE AERO clear the home indicator", async ({ page }) => {
    test.setTimeout(240_000);
    const placement = await boot(page, PORTRAIT);
    await openGarage(page);
    await expectInside(page, ["cs-cam", "cs-photo", "cs-aero"], "garage portrait");
    expect(await stored(page), "the stored arrangement is unchanged").toEqual(placement);
  });
});

test.describe(`#6596 his placement, landscape ${LANDSCAPE.width}x${LANDSCAPE.height}`, () => {
  test.use({ viewport: { width: LANDSCAPE.width, height: LANDSCAPE.height }, hasTouch: true, isMobile: true });

  test("garage and its Photo Studio clear the side and bottom insets", async ({ page }) => {
    test.setTimeout(240_000);
    const placement = await boot(page, LANDSCAPE);
    await openGarage(page);
    await expectInside(page, GARAGE, "garage landscape");
    // A tab switch swaps the options panel after apply; the clamp follows it (#6596 lists every garage tab).
    await page.evaluate(() => document.getElementById("cs-tab-team")?.click());
    await expectInside(page, GARAGE, "garage landscape, TEAM tab");
    await page.evaluate(() => document.getElementById("cs-photo").click());
    await page.waitForFunction(() => { const s = document.getElementById("photo-studio"); const b = document.getElementById("ps-capture"); return s && !s.hidden && b && b.getBoundingClientRect().width > 0; }, null, { polling: 100, timeout: BOOT_MS });
    await expectInside(page, STUDIO, "photo studio landscape");
    expect(await stored(page), "the stored arrangement is unchanged").toEqual(placement);
  });

  test("lighting tuner: DONE, FREE CAMERA and its rows clear the right inset", async ({ page }) => {
    test.setTimeout(300_000);
    await boot(page, LANDSCAPE);
    await page.evaluate(() => { window.__apex.headless(true); window.__apex.race("bahrain"); });
    await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: TRACK_MS });
    // The walk tests/specs/lighting-tuner-grade.spec.js uses: #pm-lighting is enabled only in the race state.
    await page.evaluate(() => { window.__apex.go(); window.__apex.park(0.1); });
    await page.waitForFunction(() => { const b = document.getElementById("pausebtn"); return !!b && !b.hidden; }, null, { polling: 100, timeout: BOOT_MS });
    await page.evaluate(() => {
      document.getElementById("pausebtn").click();
      document.getElementById("pm-settings").click();
      document.getElementById("pm-open-visual").click();
      document.getElementById("pm-lighting").click();
    });
    await page.waitForFunction(() => !document.getElementById("lighting").hidden, null, { polling: 100, timeout: BOOT_MS });
    await expectInside(page, TUNER, "lighting tuner landscape");
  });
});
