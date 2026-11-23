// @ts-check
// BUTTON SIZE IN A PORTRAIT RACE (#5061). RACE IN PORTRAIT on the rotate gate is a shipped path, and
// every --hud-btn-scale rule sat inside the landscape media block: the portrait ladder painted
// 76 / 84 px at any setting. css/touch-controls.css now sizes the ladder from the slider relative to
// the touch default (1.25), and js/ui/hud.js (capPortrait) keeps the gear cluster and TYRES between
// the button columns as they grow.
//
// The sizes below are EXACT: a ladder px is 76 (pedals, taps) or 84 (steer arrows) times
// slider / 125, and neither phone here reaches the --btn-room cap at 143 % (the owner's setting,
// tests/data/settings-live-export-2026-11-10.json). Landscape is not measured here: nothing in the
// landscape block changed, and hud-layout.spec.js / touch-buttons.spec.js hold it.
//
// Keep this file under 10 tests (tests/helpers/touch-input.js says why).
import { test, expect } from "@playwright/test";
import { BOOT_MS } from "../helpers/fixtures.js";
import { analyzeOverlap, probeHudElements } from "../../tools/lib/hud-geometry.mjs";
import { HUD_TARGETS } from "../../tools/lib/hud-survey-matrix.mjs";

const PHONES = [
  { name: "phone-portrait-390", w: 390, h: 844, sal: 0, sar: 0, sat: 47, sab: 34 },
  { name: "phone-portrait-360", w: 360, h: 740, sal: 0, sar: 0, sat: 0, sab: 0 },
];
const HELD = ["btn-throttle", "btn-brake", "btn-steer-left", "btn-steer-right"];
const BASE = { "btn-throttle": 76, "btn-brake": 76, "btn-steer-left": 84, "btn-steer-right": 84 };
const LADDER_SCALE = 1.25;   // base units of the original portrait ladder

/** A portrait race the player chose (RACE IN PORTRAIT), steer BUTTONS, chase camera, HUD frozen. */
async function portraitRace(page, v, btnScale) {
  await page.addInitScript(([btn]) => {
    try {
      localStorage.setItem("apex26.portraitOk", "1");
      localStorage.setItem("apex26.steerMode", JSON.stringify("buttons"));
      localStorage.setItem("apex26.manual", "false");
      localStorage.setItem("apex26.textSize", '"normal"');
      localStorage.setItem("apex26.uiContrast", '"off"');
      localStorage.setItem("apex26.homeScene", '"garage"');
      localStorage.setItem("apex26.camMode", "3");
      localStorage.setItem("apex26.radioChat", JSON.stringify("off"));
      localStorage.setItem("apex26.commentary", JSON.stringify("off"));
      if (btn != null) localStorage.setItem("apex26.hudBtnScale", JSON.stringify(btn));
    } catch (_) { /* storage blocked */ }
  }, [btnScale]);
  await page.goto("/");
  await page.waitForFunction(() => window.__apex != null && window.__apex.race, null, { polling: 100, timeout: BOOT_MS });
  await page.addStyleTag({ content: `:root{--sal:${v.sal}px;--sar:${v.sar}px;--sat:${v.sat}px;--sab:${v.sab}px;}` });
  await page.evaluate(() => window.__apex.race("monza"));
  await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: BOOT_MS });
  await page.evaluate(() => {
    const a = window.__apex;
    a.go(); a.freeze(true); a.headless(true); a.camera("chase");
    document.body.classList.add("rotate-ok");
    if (a.tyres) a.tyres({ level: "real" });
  });
  await refit(page);
}

/** Force the HUD fit (updateHud returns early while frozen) and wait until every held control has a box. */
async function refit(page) {
  await page.waitForFunction((ids) => {
    const tyre = document.getElementById("hud-tyre");
    if (tyre) tyre.hidden = false;
    try { GameHud.invalidateFit(); window.__apex.jump(0.15, 60, 0); } catch (_) { return false; }
    return ids.every((id) => { const e = document.getElementById(id); return e && !e.hidden && e.getBoundingClientRect().width > 0; });
  }, HELD, { polling: 100, timeout: 30_000 });
  // Two more fits: the cap pass and the paint pass each read what the other published.
  for (let i = 0; i < 2; i++) await page.evaluate(() => { GameHud.invalidateFit(); window.__apex.jump(0.15, 60, 0); });
}

const sizes = (page) => page.evaluate((ids) => Object.fromEntries(ids.map((id) => {
  const r = document.getElementById(id).getBoundingClientRect();
  return [id, [r.width, r.height]];
})), HELD);

async function setButtonSize(page, pct) {
  await page.evaluate((p) => window.__apex.btnScale(p), pct);
  await refit(page);
}

for (const v of PHONES) {
  test.describe(`portrait race BUTTON SIZE (${v.name})`, () => {
    test.setTimeout(300_000);
    test.use({ viewport: { width: v.w, height: v.h }, hasTouch: true });

    test("the default matches the phone export and older explicit values retain their exact size", async ({ page }) => {
      await portraitRace(page, v, null);
      expect(await page.evaluate(() => document.body.classList.contains("steer-buttons"))).toBe(true);
      const unset = await sizes(page);
      await setButtonSize(page, 143.25);
      expect(await sizes(page), "the unset phone paints the exported 143.25% physical size").toEqual(unset);

      await setButtonSize(page, 100);
      const at100 = await sizes(page);
      await setButtonSize(page, 143);
      const at143 = await sizes(page);
      for (const id of HELD) {
        const want100 = BASE[id] * 1 / LADDER_SCALE, want143 = BASE[id] * 1.43 / LADDER_SCALE;
        // 1/64 px is Chromium's layout unit: the only slack an exact size can need.
        expect(Math.abs(at100[id][0] - want100), `${id} width at 100 %: ${at100[id][0]} vs ${want100}`).toBeLessThanOrEqual(1 / 64);
        expect(Math.abs(at143[id][0] - want143), `${id} width at 143 %: ${at143[id][0]} vs ${want143}`).toBeLessThanOrEqual(1 / 64);
        expect(at100[id][1], `${id} is round at 100 %`).toBe(at100[id][0]);
        expect(at143[id][1], `${id} is round at 143 %`).toBe(at143[id][0]);
        expect(at143[id][0]).toBeGreaterThan(at100[id][0]);
      }
    });

    for (const hud of [100, 150]) {
      test(`143 % at HUD ${hud} %: every control and readout on screen, none overlapping`, async ({ page }) => {
        await portraitRace(page, v, 143);
        await page.evaluate((h) => window.__apex.hudScale(h), hud);
        await refit(page);
        const recs = await page.evaluate(probeHudElements, { targets: HUD_TARGETS.map((t) => ({ ...t })) });
        const r = analyzeOverlap(recs, v.w, v.h, v);
        const boxes = recs.filter((e) => e.visible).map((e) => `${e.key} ${e.x.toFixed(1)},${e.y.toFixed(1)},${e.r.toFixed(1)},${e.b.toFixed(1)}`);
        expect(r.count, "the five-high column, both arrows, CAM and PAUSE are measured").toBeGreaterThanOrEqual(9);
        expect(r.overlaps, JSON.stringify(boxes)).toEqual([]);
        expect(r.hudClash, JSON.stringify(boxes)).toEqual([]);
        expect(r.unsafe, JSON.stringify(boxes)).toEqual([]);
      });
    }
  });
}
