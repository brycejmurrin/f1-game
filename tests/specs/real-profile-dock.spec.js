// @ts-check
// THE OWNER'S REAL PHONE PROFILE — the default touch dock and the garage overlay bar.
//
// Bryce, 2026-11-09, on the iPhone Home Screen app (852x393, insets 59/59/21): the race HUD is "way too
// large", worst the touch buttons. His export (tests/data/settings-live-export-2026-11-09.json) has
// BUTTON SIZE unset, so what he saw was the DEFAULT: --hud-btn-mult 1.25, height-capped to 1.19, painted
// BOOST / OT / AERO / BRAKE / GAS at 85.4 px and the steer pad at 187x102, the 3-high column filling all the
// room under CAM / PAUSE. The default is 1 now (css/tokens.css, js/ui/scale.js): 72 px, pad 149x81.
// The garage's CAMERA / PHOTO / ACTIVE AERO bar stretched to 446 px at his UI SIZE 61 (css/carsetup.css).
//
// Seeds the export the way a boot reads it (title-fit.mjs exportStore's shape) with CDP safe-area insets.
// Not emulated: iOS itself (display-mode: standalone); nothing measured here reads it.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test, expect, BOOT_MS } from "../helpers/fixtures.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const GEOS = [
  { name: "852x393-standalone", w: 852, h: 393, insets: { top: 0, left: 59, bottom: 21, right: 59 }, btn: 72, pad: [149, 81] },
  { name: "852x368-safari", w: 852, h: 368, insets: { top: 0, left: 59, bottom: 21, right: 59 }, btn: 64, pad: [133, 73] },
  { name: "844x390", w: 844, h: 390, insets: { top: 0, left: 47, bottom: 21, right: 47 }, btn: 72, pad: [149, 81] },
];
const DOCK = ["btn-boost", "btn-ot", "btn-aero", "btn-brake", "btn-throttle", "btn-steer-left", "btn-steer-right"];
// What his hudLayout leaves on screen in HELMET at the start of a race, plus the fixed chrome.
const READOUTS = ["minimap", "hud-tyre", "hud-mirror", "hud-sectors", "hud-box-pos", "hud-box-lap", "hud-box-time", "hud-box-best", "btn-cam", "pausebtn"];

function liveStore(extra = {}) {
  const exp = JSON.parse(fs.readFileSync(path.join(ROOT, "tests/data/settings-live-export-2026-11-09.json"), "utf8"));
  const spec = fs.readFileSync(path.join(ROOT, "js/ui/settings-export.js"), "utf8");
  const raw = new Set([...spec.matchAll(/k: "([^"]+)", lane: "raw"/g)].map((m) => m[1]));
  const out = { json: {}, raw: {} };
  for (const g of Object.values(exp.settings)) {
    for (const [k, v] of Object.entries(g)) { if (v === null) continue; (raw.has(k) ? out.raw : out.json)[k] = v; }
  }
  Object.assign(out.json, extra);
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

// `shown`: a dock button the steering mode paints (drag steering hides GAS).
async function race(page, shown = "btn-throttle") {
  await page.evaluate(() => window.__apex.race("monza"));
  await page.waitForFunction((id) => { const b = document.getElementById(id); return window.__apex.info().state === "race" && b && !b.hidden && b.getBoundingClientRect().width > 0; },
    shown, { polling: 100, timeout: BOOT_MS });
  // Two equal reads 400 ms apart: fitHud publishes its caps on its own schedule.
  const read = () => page.evaluate((ids) => Object.fromEntries(ids.map((id) => {
    const el = document.getElementById(id), r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    const on = !el.hidden && cs.display !== "none" && cs.visibility !== "hidden" && r.width > 0;
    return [id, on ? { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height } : null];
  })), [...DOCK, ...READOUTS, "grp-steer", "grp-taps"]);
  let prev = await read();
  for (let i = 0; i < 20; i++) {
    await page.evaluate(() => new Promise((r) => setTimeout(r, 400)));
    const next = await read();
    if (JSON.stringify(next) === JSON.stringify(prev)) return next;
    prev = next;
  }
  return prev;
}

for (const geo of GEOS) {
  test.describe(`owner's live profile ${geo.name}`, () => {
    test.use({ viewport: { width: geo.w, height: geo.h }, hasTouch: true, isMobile: true });

    test("the default dock paints 72 px class buttons clear of his readouts", async ({ page }) => {
      test.setTimeout(240_000);
      await boot(page, geo, liveStore());
      expect(await page.evaluate(() => localStorage.getItem("apex26.hudBtnScale")), "BUTTON SIZE is unset in his export").toBeNull();
      expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--ui-scale").trim()), "his UI SIZE 61 reached the page").toBe("0.61");
      const m = await race(page);
      for (const id of DOCK) {
        expect(m[id], `${id} is on screen (BUTTONS steering)`).not.toBeNull();
        expect(Math.abs(m[id].w - geo.btn), `${id} paints ${m[id].w.toFixed(1)} px wide, want ${geo.btn} (it was 85.4 / 76.7 at the 1.25 default)`).toBeLessThanOrEqual(1);
        expect(Math.abs(m[id].h - geo.btn), `${id} paints ${m[id].h.toFixed(1)} px tall, want ${geo.btn}`).toBeLessThanOrEqual(1);
      }
      expect(Math.abs(m["grp-steer"].w - geo.pad[0]), `steer pad ${m["grp-steer"].w.toFixed(0)}x${m["grp-steer"].h.toFixed(0)}, want ${geo.pad.join("x")} (it was 187x102)`).toBeLessThanOrEqual(1.5);
      expect(Math.abs(m["grp-steer"].h - geo.pad[1])).toBeLessThanOrEqual(1.5);
      // The taps column leaves room above it: it reached y 82 of 393 at the old default.
      expect(m["grp-taps"].t, "the BOOST / OT / AERO column starts below the CAM / PAUSE band with air to spare").toBeGreaterThanOrEqual(geo.h * 0.3);
      // Nothing he placed, and no fixed chrome, is under a dock button, and the dock is inside the safe box.
      const clashes = [];
      for (const d of DOCK) for (const r of READOUTS) {
        const a = m[d], b = m[r];
        if (!a || !b) continue;
        const ox = Math.min(a.r, b.r) - Math.max(a.l, b.l), oy = Math.min(a.b, b.b) - Math.max(a.t, b.t);
        if (ox > 1 && oy > 1) clashes.push(`${d} x ${r} ${ox.toFixed(0)}x${oy.toFixed(0)}`);
      }
      expect(clashes).toEqual([]);
      for (const id of DOCK) {
        expect(m[id].l, `${id} clears the left inset`).toBeGreaterThanOrEqual(geo.insets.left - 1);
        expect(m[id].r, `${id} clears the right inset`).toBeLessThanOrEqual(geo.w - geo.insets.right + 1);
        expect(m[id].b, `${id} clears the home indicator`).toBeLessThanOrEqual(geo.h - geo.insets.bottom + 1);
      }
    });
  });
}

test.describe("owner's live profile 852x393-standalone, stored sizes and the garage", () => {
  const geo = GEOS[0];
  test.use({ viewport: { width: geo.w, height: geo.h }, hasTouch: true, isMobile: true });

  test("a stored BUTTON SIZE still wins over the new default", async ({ page }) => {
    test.setTimeout(240_000);
    await boot(page, geo, liveStore({ hudBtnScale: 125 }));
    const m = await race(page);
    // 125 % is height-capped by the 3-high column on this phone: the size the old default painted.
    expect(m["btn-throttle"].w, `GAS at a stored 125 % paints ${m["btn-throttle"].w.toFixed(1)} px`).toBeGreaterThan(80);
    expect(await page.evaluate(() => localStorage.getItem("apex26.hudBtnScale")), "the stored value is not migrated").toBe("125");
  });

  test("the garage overlay bar is no wider than the ACTIVE AERO chip needs", async ({ page }) => {
    test.setTimeout(240_000);
    await boot(page, geo, liveStore());
    await page.evaluate(() => document.getElementById("mb-garage").click());
    await expect(page.locator("#carsetup")).toBeVisible({ timeout: BOOT_MS });
    await page.waitForFunction(() => { const b = document.getElementById("cs-aero"); return b && b.getBoundingClientRect().width > 0; }, null, { polling: 100, timeout: BOOT_MS });
    const g = await page.evaluate(() => Object.fromEntries(["cs-stack", "cs-cam", "cs-photo", "cs-aero"].map((id) => { const r = document.getElementById(id).getBoundingClientRect(); return [id, { w: r.width, h: r.height, l: r.left }]; })));
    expect(g["cs-stack"].w, `the bar is ${g["cs-stack"].w.toFixed(0)} px wide (446 before the cap)`).toBeLessThanOrEqual(289);
    for (const id of ["cs-cam", "cs-photo", "cs-aero"]) expect(Math.abs(g[id].h - 44), `${id} is the fixed 44 px chrome (#5202)`).toBeLessThanOrEqual(0.5);
    expect(g["cs-stack"].l, "the bar clears the left inset").toBeGreaterThanOrEqual(geo.insets.left - 1);
  });
});

// DRAG STEERING PAINTS THE SMALL TAP RUNG (--tap, css/touch-controls.css), the one this PR raised 54 -> 58 so a tap
// clears the ~15 mm floor at the 100 % default. tests/unit/phone-touch-surface.test.mjs modelled three taps at
// 200 % fitting a 390 px phone raw; three 58 px taps at 200 % do not (369 px in 359), so the PAINTED result is held
// here instead: fitHud's cap keeps the column on screen. Measured 2026-11-10 (Chromium, software GPU), 844x390
// insets 47/47/21: default 58x58, column y 174..359; 200 % capped to 83.5x83.5, column y 93..359.
const MM_15 = 15 / (25.4 / 96);   // 56.7 CSS px
test.describe("owner's live profile 844x390, drag steering taps", () => {
  const geo = GEOS[2];
  const TAPS = ["btn-boost", "btn-ot", "btn-aero"];
  test.use({ viewport: { width: geo.w, height: geo.h }, hasTouch: true, isMobile: true });

  test("the default tap paints 58 px, over the 15 mm floor", async ({ page }) => {
    test.setTimeout(240_000);
    await boot(page, geo, liveStore({ steerMode: "touch" }));
    const m = await race(page, "btn-boost");
    for (const id of TAPS) {
      expect(m[id], `${id} is on screen (drag steering)`).not.toBeNull();
      expect(Math.abs(m[id].w - 58), `${id} paints ${m[id].w.toFixed(1)} px wide, want 58 (54 at the old --tap is 14.3 mm at 100 %)`).toBeLessThanOrEqual(1);
      expect(Math.abs(m[id].h - 58), `${id} paints ${m[id].h.toFixed(1)} px tall, want 58`).toBeLessThanOrEqual(1);
    }
  });

  test("BUTTON SIZE 200 %: fitHud's cap keeps the taps column on screen, every tap over 15 mm", async ({ page }) => {
    test.setTimeout(240_000);
    await boot(page, geo, liveStore({ steerMode: "touch", hudBtnScale: 200 }));
    const m = await race(page, "btn-boost");
    const col = m["grp-taps"];
    expect(col, "the BOOST / OT / AERO column is on screen").not.toBeNull();
    for (const id of TAPS) {
      expect(m[id], `${id} is on screen`).not.toBeNull();
      expect(m[id].w, `${id} paints ${m[id].w.toFixed(1)} px wide at 200 %, floor ${MM_15.toFixed(1)} (15 mm)`).toBeGreaterThanOrEqual(MM_15);
      expect(m[id].h, `${id} paints ${m[id].h.toFixed(1)} px tall at 200 %, floor ${MM_15.toFixed(1)} (15 mm)`).toBeGreaterThanOrEqual(MM_15);
      expect(m[id].w, `${id} is never larger than the 200 % the player asked for`).toBeLessThanOrEqual(2 * 58 + 1);
      expect(m[id].r, `${id} clears the right inset`).toBeLessThanOrEqual(geo.w - geo.insets.right + 1);
    }
    expect(col.b, `the column ends at y ${col.b.toFixed(0)}, inside the ${geo.h - geo.insets.bottom} px above the home indicator`).toBeLessThanOrEqual(geo.h - geo.insets.bottom + 1);
    for (const top of ["btn-cam", "pausebtn"]) {
      expect(m[top], `${top} is on screen`).not.toBeNull();
      expect(col.t, `the column starts at y ${col.t.toFixed(0)}, below ${top} (ends y ${m[top].b.toFixed(0)})`).toBeGreaterThanOrEqual(m[top].b);
    }
  });
});
