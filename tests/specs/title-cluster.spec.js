/* title-cluster — the title screen's two independent layers (#5126, #5134; docs/notes/TITLE-LAYERS-2026-11-05.md,
 * docs/notes/TITLE-CLUSTER-SW-2026-11-06.md).
 *
 * Bryce's whole settings export, on touch, at the iPhone landscape geometries he plays — 852x393 and 852x283 (the
 * 15 Pro with a 59 / 67 px notch inset), 844x390 and 932x430 — at BOTH densities, with SETTINGS open and
 * APPEARANCE › TITLE LAYOUT's REAL sliders moved (input events on the range inputs the fold builds):
 *  - at every WIDTH from 20 to 100, LEFT/RIGHT reaches the overlay's left AND right content edges (the safe area is
 *    the overlay's padding) on SIDE AUTO and SWAPPED, and never passes them; X 0 is the anchored edge;
 *  - WIDTH resizes the box from the anchored edge only; LEFT/RIGHT only moves it;
 *  - the title art (#menu-brand, #title-car) keeps the same box through every WIDTH and LEFT/RIGHT change;
 *  - his saved layout, stored before the buttons' X became a screen % (no `xUnit`), lands where the old zoomed
 *    translate put it, and stays there once a write stores the marker (no visible jump).
 *
 * Engine-neutral on purpose: it runs in Chromium on CI and in WebKit through `npm run test:webkit`
 * (playwright.config.js DUAL_ENGINE_SPECS). Chromium also gets the notch: CDP safe-area insets per geometry.
 * One test() per viewport keeps each under the fixture timeout. */
import { test, expect, BOOT_MS } from "../helpers/fixtures.js";
import { uiTestOptions } from "../../tools/lib/ui-device-profile.mjs";

const SHAPES = [{ width: 844, height: 390 }, { width: 932, height: 430 }];
/** The four geometries and their notch inset (a side); 852x283 is the 15 Pro with Safari's toolbar showing. */
const CELLS = [
  { width: 852, height: 393, inset: 59 }, { width: 852, height: 283, inset: 67 },
  { width: 844, height: 390, inset: 59 }, { width: 932, height: 430, inset: 59 },
];
const WIDTHS = [20, 30, 40, 50, 60, 70, 80, 90, 100];
const DENSITIES = ["normal", "compact"];
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
    // Read only in a failure message: what the overlay grid and the cluster looked like at that cell.
    diag: { density: document.body.dataset.density, cols: cs.gridTemplateColumns, rows: cs.gridTemplateRows,
      scroll: [o.scrollLeft, o.scrollWidth, o.clientWidth], ms: getComputedStyle(document.getElementById("menu-buttons")).marginInlineStart },
  };
}, { id, value });

/** Pin body density: --compact-at is the own-height SheetShape compares against (js/ui/sheet-shape.js classifyDensity).
 *  1px, not 0px: `parseFloat(raw) || SHORT_DEFAULT` reads 0 as unset and falls back to 380 (CI 42175959386). */
async function forceDensity(page, want) {
  await page.evaluate((v) => { document.body.style.setProperty("--compact-at", v); SheetShape.reclassify(); },
    want === "compact" ? "9999px" : "1px");
  await page.waitForFunction((d) => document.body.dataset.density === d, want, { polling: 100, timeout: BOOT_MS });
}

/** The whole sweep at one geometry: both densities, both sides, every WIDTH, X at -100 / 100 / 0. */
async function sweep(page, cell) {
  await page.setViewportSize({ width: cell.width, height: cell.height });
  await page.waitForFunction((w) => innerWidth === w && document.body.dataset.shape === "wide", cell.width,
    { polling: 100, timeout: BOOT_MS });
  await openFold(page);
  for (const density of DENSITIES) {
    await forceDensity(page, density);
    for (const side of ["auto", "swap"]) {
      // SIDE is the one control that trades the two layers' sides (its documented meaning); within a side the art
      // box is the baseline every button change is held to.
      await page.evaluate((s) => { const l = TitleLayout.current(); l.side = s; TitleLayout.set(l); }, side);
      const art = await slide(page, "pm-tl-btns-width", 20);
      expect([art.min, art.max], "the WIDTH slider").toEqual([0, 100]);
      let prev = null;
      for (const width of WIDTHS) {
        const label = `${cell.width}x${cell.height} ${density} ${side} WIDTH ${width}`;
        const w = await slide(page, "pm-tl-btns-width", width);
        const left = await slide(page, "pm-tl-btns-x", -100);
        const right = await slide(page, "pm-tl-btns-x", 100);
        const mid = await slide(page, "pm-tl-btns-x", 0);
        expect([left.min, left.max], "LEFT/RIGHT spans ±100% of the screen").toEqual([-100, 100]);
        expect(w.inL, `${label}: the notch is padding`).toBeGreaterThan(50);
        expect(density, `${label}: density held`).toBe(w.diag.density);
        // FULL LEFT and FULL RIGHT: the cluster's edge on the overlay's content edge (the safe area).
        expect(Math.abs(left.btns.l - left.inL), `${label}: LEFT reaches the left safe edge`).toBeLessThanOrEqual(1);
        expect(Math.abs(right.btns.r - right.inR), `${label}: RIGHT reaches the right safe edge`).toBeLessThanOrEqual(1);
        for (const [name, row] of [["left", left], ["right", right], ["centre", mid]]) {
          expect(row.btns.l, `${label} ${name}: inside the left safe edge`).toBeGreaterThanOrEqual(row.inL - 1);
          expect(row.btns.r, `${label} ${name}: inside the right safe edge`).toBeLessThanOrEqual(row.inR + 1);
          // WIDTH resizes, LEFT/RIGHT only moves: the box keeps its width.
          expect(Math.abs(row.btns.w - w.btns.w), `${label} ${name}: LEFT/RIGHT keeps the width`).toBeLessThanOrEqual(0.5);
          // The art layer never moves when the buttons change.
          const why = `(baseline ${JSON.stringify(art.diag)}, now ${JSON.stringify(row.diag)})`;
          for (const k of ["l", "r", "t", "b"]) {
            expect(Math.abs(row.brand[k] - art.brand[k]), `${label} ${name}: title box ${k} ${why}`).toBeLessThanOrEqual(0.5);
            expect(Math.abs(row.car[k] - art.car[k]), `${label} ${name}: drawing box ${k} ${why}`).toBeLessThanOrEqual(0.5);
          }
        }
        // X 0 sits on the anchored edge: right on AUTO, left when SWAPPED — and WIDTH grows from THAT edge only:
        // the anchored edge does not move between WIDTH steps (#5134: on the phone every step moved the cluster).
        if (side === "auto") expect(Math.abs(mid.btns.r - mid.inR), `${label}: X 0 is the right edge`).toBeLessThanOrEqual(1);
        else expect(Math.abs(mid.btns.l - mid.inL), `${label}: X 0 is the left edge`).toBeLessThanOrEqual(1);
        if (prev) {
          const anchored = side === "auto" ? "r" : "l";
          expect(Math.abs(mid.btns[anchored] - prev.btns[anchored]), `${label}: WIDTH keeps the anchored edge`).toBeLessThanOrEqual(1);
          expect(mid.btns.w, `${label}: WIDTH grows the box (was ${prev.btns.w} at WIDTH ${prev.width})`).toBeGreaterThanOrEqual(prev.btns.w - 0.5);
        }
        prev = { btns: mid.btns, width };
      }
    }
  }
  await page.evaluate(() => { document.body.style.removeProperty("--compact-at"); SheetShape.reclassify(); });
  await page.evaluate(() => document.getElementById("pm-settings-close").click());
  await page.waitForFunction(() => document.getElementById("pmsettings").hidden, null, { polling: 100, timeout: BOOT_MS });
}

test.describe("Title layers: the button cluster reaches both safe-area edges at every WIDTH (#5126, #5134)", () => {
  test.use({ ...uiTestOptions({ touch: true, viewport: SHAPES[0], deviceScaleFactor: 1 }) });

  for (const cell of CELLS) {
    test(`Bryce's export, the real WIDTH and LEFT/RIGHT sliders, ${cell.width}x${cell.height} (inset ${cell.inset}), both densities, SIDE AUTO and SWAPPED`, async ({ page, browserName }) => {
      await loadExport(page);
      if (browserName === "chromium") {
        const cdp = await page.context().newCDPSession(page);
        await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: { top: 0, right: cell.inset, bottom: 21, left: cell.inset } });
      }
      await sweep(page, cell);
    });
  }

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
