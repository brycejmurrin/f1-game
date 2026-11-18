// @ts-check
// THE OWNER'S REAL PHONE PROFILE — the garage overlay bar.
//
// Bryce, 2026-11-09, on the iPhone Home Screen app (852x393, insets 59/59/21): at his UI SIZE 61 the garage's
// CAMERA / PHOTO / ACTIVE AERO bar stretched to 446 px over the car (CAMERA 234, PHOTO 206, ACTIVE AERO 446).
// css/carsetup.css caps it at 288 px on a landscape phone.
//
// Seeded with his CURRENT export (2026-11-10, UI SIZE 70). A phone's stored UI SIZE is floored at 70 on boot
// (UI_PHONE_MIN, js/ui/scale.js), so the 61 of the 2026-11-09 export can no longer reach a phone page. Measured
// 2026-11-11 on this window: without the cap the bar paints 395 px (CAMERA 210, PHOTO 179, ACTIVE AERO 395);
// with it 288 (156 / 126 / 288), all 44 tall.
//
// This file also held the touch-dock sizes for a 100 % default BUTTON SIZE. That change was dropped from the PR
// (#5297, 2026-11-10): his 2026-11-10 export stores BUTTON SIZE 143 %, and the default sizes are #5358's to choose.
//
// Seeds the export the way a boot reads it (title-fit.mjs exportStore's shape) with CDP safe-area
// insets. Not emulated: iOS itself (display-mode: standalone); nothing measured here reads it.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, BOOT_MS } from "../helpers/fixtures.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const GEO = { name: "852x393-standalone", w: 852, h: 393, insets: { top: 0, left: 59, bottom: 21, right: 59 } };

function liveStore() {
  const exp = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/data/settings-live-export-2026-11-10.json"), "utf8"));
  const spec = fs.readFileSync(path.join(ROOT, "js/ui/settings-export.js"), "utf8");
  const raw = new Set([...spec.matchAll(/k: "([^"]+)", lane: "raw"/g)].map((m) => m[1]));
  const out = { json: {}, raw: {} };
  for (const g of Object.values(exp.settings)) {
    for (const [k, v] of Object.entries(g)) { if (v === null) continue; (raw.has(k) ? out.raw : out.json)[k] = v; }
  }
  return out;
}

async function boot(page, geo, store) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: geo.insets });
  await page.addInitScript(({ json, raw }) => {
    try {
      for (const [k, v] of Object.entries(json)) localStorage.setItem("apex26." + k, JSON.stringify(v));
      for (const [k, v] of Object.entries(raw)) localStorage.setItem("apex26." + k, v);
    } catch (_) { /* storage off */ }
  }, store);
  await page.goto("/");
  await page.waitForFunction(() => window.__apex && window.__apex.race && document.documentElement.hasAttribute("data-booted"), null, { polling: 100, timeout: BOOT_MS });
}

test.describe(`owner's live profile ${GEO.name}, the garage`, () => {
  test.use({ viewport: { width: GEO.w, height: GEO.h }, hasTouch: true, isMobile: true });

  test("the garage overlay bar is no wider than the ACTIVE AERO chip needs", async ({ page }) => {
    test.setTimeout(240_000);
    await boot(page, GEO, liveStore());
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--ui-scale").trim()), "his UI SIZE 70 reached the page").toBe("0.7");
    await page.evaluate(() => document.getElementById("mb-garage").click());
    await expect(page.locator("#carsetup")).toBeVisible({ timeout: BOOT_MS });
    await page.waitForFunction(() => { const b = document.getElementById("cs-aero"); return b && b.getBoundingClientRect().width > 0; }, null, { polling: 100, timeout: BOOT_MS });
    const g = await page.evaluate(() => Object.fromEntries(["cs-stack", "cs-cam", "cs-photo", "cs-aero"].map((id) => { const r = document.getElementById(id).getBoundingClientRect(); return [id, { w: r.width, h: r.height, l: r.left }]; })));
    expect(g["cs-stack"].w, `the bar is ${g["cs-stack"].w.toFixed(0)} px wide (395 without the cap)`).toBeLessThanOrEqual(289);
    for (const id of ["cs-cam", "cs-photo", "cs-aero"]) expect(Math.abs(g[id].h - 44), `${id} is the fixed 44 px chrome (#5202)`).toBeLessThanOrEqual(0.5);
    expect(g["cs-stack"].l, "the bar clears the left inset").toBeGreaterThanOrEqual(GEO.insets.left - 1);
  });
});
