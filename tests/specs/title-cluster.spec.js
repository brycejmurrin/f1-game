/* title-cluster — the title screen's two independent layers (#5126, docs/notes/TITLE-LAYERS-2026-11-05.md).
 *
 * Bryce's whole settings export, on touch, at the two iPhone landscape shapes he plays (844x390 and 932x430), with
 * SETTINGS open and APPEARANCE › TITLE LAYOUT's REAL sliders moved (input events on the range inputs the fold builds):
 *  - at every WIDTH from 20 to 100, LEFT/RIGHT reaches the overlay's left AND right content edges (the safe area is
 *    the overlay's padding) on SIDE AUTO and SWAPPED, and never passes them;
 *  - the title art (#menu-brand, #title-car) keeps the same box through every WIDTH and LEFT/RIGHT change;
 *  - his saved layout, stored before the buttons' X became a screen % (no `xUnit`), lands where the old zoomed
 *    translate put it, and stays there once a write stores the marker (no visible jump).
 *
 * Engine-neutral on purpose: it runs in Chromium on CI and in WebKit through `npm run test:webkit`
 * (playwright.config.js DUAL_ENGINE_SPECS). Chromium also gets a notch: CDP safe-area insets of 59 px a side. */
import { test, expect, BOOT_MS } from "../helpers/fixtures.js";
import { uiTestOptions } from "../../tools/lib/ui-device-profile.mjs";

const SHAPES = [{ width: 844, height: 390 }, { width: 932, height: 430 }];
const WIDTHS = [20, 30, 40, 50, 60, 70, 80, 90, 100];

async function loadExport(page) {
  await page.goto("/");
  await page.waitForFunction(() => typeof SettingsExport !== "undefined", null, { polling: 100, timeout: BOOT_MS });
  const applied = await page.evaluate(async () => {
    const file = await (await fetch("/tests/data/settings-defaults-export.json")).json();
    return SettingsExport.applySettings(file);
  });
  expect(applied.ok, "Bryce's export applies").toBe(true);
  await page.reload();
  await page.waitForFunction(() => typeof TitleLayout !== "undefined" && document.body.dataset.shape === "wide",
    null, { polling: 100, timeout: BOOT_MS });
}

/** Open SETTINGS from the title and unfold TITLE SCREEN › TITLE LAYOUT, as a player does. */
async function openFold(page) {
  await page.evaluate(() => document.getElementById("mb-settings").click());
  await page.waitForFunction(() => !document.getElementById("pmsettings").hidden, null, { polling: 100, timeout: BOOT_MS });
  await page.evaluate(() => {
    TitleLayout.build();
    for (const id of ["pm-titlescreen", "pm-titlelayout"]) { const d = document.getElementById(id); if (d) d.open = true; }
  });
}

/** Move one real slider and read the boxes. */
const slide = (page, id, value) => page.evaluate(({ id, value }) => {
  const inp = document.getElementById(id);
  inp.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
  inp.value = String(value);
  inp.dispatchEvent(new Event("input", { bubbles: true }));
  const box = (e) => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width }; };
  const o = document.getElementById("overlay"), cs = getComputedStyle(o), ob = o.getBoundingClientRect();
  return {
    min: Number(inp.min), max: Number(inp.max), value: Number(inp.value),
    btns: box(document.getElementById("menu-buttons")),
    brand: box(document.getElementById("menu-brand")), car: box(document.getElementById("title-car")),
    inL: ob.left + parseFloat(cs.paddingLeft), inR: ob.right - parseFloat(cs.paddingRight),
  };
}, { id, value });

test.describe("Title layers: the button cluster reaches both safe-area edges at every WIDTH (#5126)", () => {
  test.use({ ...uiTestOptions({ touch: true, viewport: SHAPES[0], deviceScaleFactor: 1 }) });

  test("Bryce's export, the real WIDTH and LEFT/RIGHT sliders, 844x390 and 932x430, SIDE AUTO and SWAPPED", async ({ page, browserName }) => {
    await loadExport(page);
    if (browserName === "chromium") {
      const cdp = await page.context().newCDPSession(page);
      await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: { top: 0, right: 59, bottom: 21, left: 59 } });
    }
    for (const viewport of SHAPES) {
      await page.setViewportSize(viewport);
      await page.waitForFunction(w => innerWidth === w && document.body.dataset.shape === "wide", viewport.width,
        { polling: 100, timeout: BOOT_MS });
      await openFold(page);
      for (const side of ["auto", "swap"]) {
        // SIDE is the one control that trades the two layers' sides (its documented meaning); within a side the art
        // box is the baseline every button change is held to.
        await page.evaluate(s => { const l = TitleLayout.current(); l.side = s; TitleLayout.set(l); }, side);
        const art = await slide(page, "pm-tl-btns-width", 20);
        expect([art.min, art.max], "the WIDTH slider").toEqual([0, 100]);
        for (const width of WIDTHS) {
          const label = `${viewport.width}x${viewport.height} ${side} WIDTH ${width}`;
          const w = await slide(page, "pm-tl-btns-width", width);
          const left = await slide(page, "pm-tl-btns-x", -100);
          const right = await slide(page, "pm-tl-btns-x", 100);
          const mid = await slide(page, "pm-tl-btns-x", 0);
          expect([left.min, left.max], "LEFT/RIGHT spans ±100% of the screen").toEqual([-100, 100]);
          expect(w.inL, `${label}: the notch is padding`).toBeGreaterThan(50);
          // FULL LEFT and FULL RIGHT: the cluster's edge on the overlay's content edge (the safe area).
          expect(Math.abs(left.btns.l - left.inL), `${label}: LEFT reaches the left safe edge`).toBeLessThanOrEqual(1);
          expect(Math.abs(right.btns.r - right.inR), `${label}: RIGHT reaches the right safe edge`).toBeLessThanOrEqual(1);
          for (const [name, row] of [["left", left], ["right", right], ["centre", mid]]) {
            expect(row.btns.l, `${label} ${name}: inside the left safe edge`).toBeGreaterThanOrEqual(row.inL - 1);
            expect(row.btns.r, `${label} ${name}: inside the right safe edge`).toBeLessThanOrEqual(row.inR + 1);
            // WIDTH resizes, LEFT/RIGHT only moves: the box keeps its width.
            expect(Math.abs(row.btns.w - w.btns.w), `${label} ${name}: LEFT/RIGHT keeps the width`).toBeLessThanOrEqual(0.5);
            // The art layer never moves when the buttons change.
            for (const k of ["l", "r", "t", "b"]) {
              expect(Math.abs(row.brand[k] - art.brand[k]), `${label} ${name}: title box ${k}`).toBeLessThanOrEqual(0.5);
              expect(Math.abs(row.car[k] - art.car[k]), `${label} ${name}: drawing box ${k}`).toBeLessThanOrEqual(0.5);
            }
          }
          // X 0 sits on the anchored edge: right on AUTO, left when SWAPPED.
          if (side === "auto") expect(Math.abs(mid.btns.r - mid.inR), `${label}: X 0 is the right edge`).toBeLessThanOrEqual(1);
          else expect(Math.abs(mid.btns.l - mid.inL), `${label}: X 0 is the left edge`).toBeLessThanOrEqual(1);
        }
      }
      await page.evaluate(() => document.getElementById("pm-settings-close").click());
      await page.waitForFunction(() => document.getElementById("pmsettings").hidden, null, { polling: 100, timeout: BOOT_MS });
    }
  });

  test("migration: his pre-#5126 save lands where the old zoomed translate put it, and stays there after a write", async ({ page }) => {
    await loadExport(page);
    for (const viewport of SHAPES) {
      await page.setViewportSize(viewport);
      await page.waitForFunction(w => innerWidth === w && document.body.dataset.shape === "wide", viewport.width,
        { polling: 100, timeout: BOOT_MS });
      const read = () => page.evaluate(() => {
        const raw = JSON.parse(localStorage.getItem("apex26.titleLayout"));
        const o = document.getElementById("overlay"), cs = getComputedStyle(o), ob = o.getBoundingClientRect();
        const r = document.getElementById("menu-buttons").getBoundingClientRect();
        return { raw: raw.wide, l: r.left, r: r.right, inR: ob.right - parseFloat(cs.paddingRight),
          ui: parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--ui-scale")) || 1, vw: innerWidth };
      });
      // Restore the export's own (unmarked) layout for each shape: the first case is a save from before the marker.
      await page.evaluate(async () => {
        const file = await (await fetch("/tests/data/settings-defaults-export.json")).json();
        localStorage.setItem("apex26.titleLayout", JSON.stringify(file.settings.appearance.titleLayout));
      });
      await page.reload();
      await page.waitForFunction(() => typeof TitleLayout !== "undefined" && document.body.dataset.shape === "wide",
        null, { polling: 100, timeout: BOOT_MS });
      const before = await read();
      const label = `${viewport.width}x${viewport.height}`;
      expect(before.raw.xUnit, `${label}: the stored layout is the old shape`).toBeUndefined();
      // The old rule: X -2 was a translate in a box zoomed by UI SIZE × SIZE 91%, from the pinned right edge.
      const oldShift = before.raw.btns.x * before.ui * before.raw.btns.size / 100 * before.vw / 100;
      expect(Math.abs(before.r - (before.inR + oldShift)), `${label}: where the old translate put it`).toBeLessThanOrEqual(1);
      // A write (any slider; here the same layout stored again) marks it, and nothing moves, then or after a reload.
      await page.evaluate(() => TitleLayout.set(TitleLayout.current()));
      const written = await read();
      expect(written.raw.xUnit, `${label}: the write stores the marker`).toBe("screen");
      expect(Math.abs(written.l - before.l), `${label}: no jump on write`).toBeLessThanOrEqual(1);
      await page.reload();
      await page.waitForFunction(() => typeof TitleLayout !== "undefined" && document.body.dataset.shape === "wide",
        null, { polling: 100, timeout: BOOT_MS });
      const after = await read();
      expect(Math.abs(after.l - before.l), `${label}: no jump after a reload`).toBeLessThanOrEqual(1);
      expect(Math.abs(after.r - before.r), `${label}: no jump after a reload (right)`).toBeLessThanOrEqual(1);
    }
  });
});
