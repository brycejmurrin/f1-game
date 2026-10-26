// @ts-check
// Issue #2950: on the garage LIVERY tab, is #cs-options clipped by #cs-body?
// Issue #3332: at UI SIZE 75% the pair layout turns on in portrait (sheet own
// width grows under zoom); fit-audit used to flag a phantom ~padR*(1-zoom)
// x-overhang. Measure with zoom-aware padding so only real child overhang fails.
// Measured at the two phone shapes with the touch profile. "Fits" means the
// options box lies inside the body box and no visible descendant is painted
// past the options box's left/right edge (the vertical axis scrolls on purpose).
import fs from "node:fs";
import { test, expect, BOOT_MS } from "../helpers/fixtures.js";

/** @param {import("@playwright/test").Page} page */
/** @param {string} shapeName */
/** @param {{ scale?: number }} [opts] */
async function fits(page, shapeName, opts = {}) {
  await page.goto("/");
  await page.waitForFunction(() => !!window.__apex, null, { polling: 100, timeout: BOOT_MS });
  await page.evaluate(() => window.__apex.headless(true));
  if (opts.scale != null) {
    await page.evaluate((s) => window.__apex.uiScale(s), opts.scale);
  }
  await page.locator("#mb-garage").tap();
  await page.waitForFunction(() => document.querySelectorAll('#cs-tabs [role="tab"]').length > 0,
    null, { polling: 100, timeout: BOOT_MS });
  if (opts.scale != null) {
    // SheetShape / fit may rewrite scale on open; pin again before measuring.
    await page.evaluate((s) => window.__apex.uiScale(s), opts.scale);
  }
  await page.locator("#cs-tab-livery").tap();
  await expect(page.locator("#cs-tab-livery")).toHaveAttribute("aria-selected", "true");
  const m = await page.evaluate(() => {
    const body = document.getElementById("cs-body"), optsEl = document.getElementById("cs-options");
    const inner = document.getElementById("cs-inner");
    const b = body.getBoundingClientRect(), o = optsEl.getBoundingClientRect();
    const over = [];
    for (const el of optsEl.querySelectorAll("*")) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || getComputedStyle(el).visibility === "hidden") continue;
      if (r.left < o.left - 1 || r.right > o.right + 1) over.push(`${el.className || el.tagName}:${Math.round(r.left - o.left)}/${Math.round(r.right - o.right)}`);
    }
    const bs = getComputedStyle(body);
    const cs = getComputedStyle(optsEl);
    // Same zoom-aware content-edge math as tools/ui/fit-audit.mjs (#3332).
    const layoutW = optsEl.offsetWidth;
    const z = layoutW > 0 ? o.width / layoutW : 1;
    const contentRight = o.right - (parseFloat(cs.borderRightWidth) + parseFloat(cs.paddingRight)) * z;
    let childOverhang = 0;
    for (const c of optsEl.children) {
      const cr = c.getBoundingClientRect();
      if (cr.width) childOverhang = Math.max(childOverhang, cr.right - contentRight);
    }
    // Legacy mixed-unit formula — documents the false positive the audit used to ship.
    const phantomOverhang = (() => {
      const rightWrong = o.right - parseFloat(cs.borderRightWidth) - parseFloat(cs.paddingRight);
      let h = 0;
      for (const c of optsEl.children) {
        const cr = c.getBoundingClientRect();
        if (cr.width) h = Math.max(h, cr.right - rightWrong);
      }
      return h;
    })();
    return {
      body: [b.left, b.top, b.right, b.bottom].map(Math.round), opts: [o.left, o.top, o.right, o.bottom].map(Math.round),
      bodyDisplay: bs.display, bodyOverflow: bs.overflow, scrollX: optsEl.scrollWidth - optsEl.clientWidth,
      scrollY: optsEl.scrollHeight - optsEl.clientHeight, over: over.slice(0, 6),
      childOverhang: +childOverhang.toFixed(2),
      phantomOverhang: +phantomOverhang.toFixed(2),
      pair: inner?.dataset.pair || "",
      uiScale: getComputedStyle(document.documentElement).getPropertyValue("--ui-scale").trim(),
      padR: cs.paddingRight,
      z: +z.toFixed(3),
    };
  });
  test.info().annotations.push({ type: "measure", description: JSON.stringify(m) });
  fs.mkdirSync("artifacts", { recursive: true });
  fs.appendFileSync("artifacts/livery-fit-measure.jsonl", JSON.stringify({ shape: shapeName, ...m }) + "\n");
  if (m.bodyDisplay !== "contents") {
    expect(m.opts[0]).toBeGreaterThanOrEqual(m.body[0] - 1);
    expect(m.opts[1]).toBeGreaterThanOrEqual(m.body[1] - 1);
    expect(m.opts[2]).toBeLessThanOrEqual(m.body[2] + 1);
    expect(m.opts[3]).toBeLessThanOrEqual(m.body[3] + 1);
  }
  expect(m.over).toEqual([]);
  // Real child overhang past the zoom-aware content edge — not scrollWidth phantom.
  expect(m.childOverhang, JSON.stringify(m)).toBeLessThanOrEqual(2);
  // Keep the old scrollX soft bound only at default scale (pair off, padR 0);
  // at 75% pair-on the gutter phantom alone is ~14 and is not a clip.
  if (opts.scale == null) expect(m.scrollX).toBeLessThanOrEqual(6);
}

test.describe("garage LIVERY fit, portrait 390x844", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test("#cs-options fits inside #cs-body", async ({ page }) => { await fits(page, "portrait 390x844"); });
  test("#cs-options fits at UI SIZE 75%", async ({ page }) => {
    await fits(page, "portrait 390x844 @75%", { scale: 75 });
  });
});

test.describe("garage LIVERY fit, landscape 844x390", () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
  test("#cs-options fits inside #cs-body", async ({ page }) => { await fits(page, "landscape 844x390"); });
});

test.describe("garage TEAM fit, portrait 390x844 @75%", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test("#cs-options children stay inside content edge", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => !!window.__apex, null, { polling: 100, timeout: BOOT_MS });
    await page.evaluate(() => { window.__apex.headless(true); window.__apex.uiScale(75); });
    await page.locator("#mb-garage").tap();
    await page.waitForFunction(() => document.querySelectorAll('#cs-tabs [role="tab"]').length > 0,
      null, { polling: 100, timeout: BOOT_MS });
    await page.evaluate(() => window.__apex.uiScale(75));
    await page.locator("#cs-tab-team").tap();
    await expect(page.locator("#cs-tab-team")).toHaveAttribute("aria-selected", "true");
    const m = await page.evaluate(() => {
      const optsEl = document.getElementById("cs-options");
      const inner = document.getElementById("cs-inner");
      const o = optsEl.getBoundingClientRect();
      const cs = getComputedStyle(optsEl);
      const z = optsEl.offsetWidth > 0 ? o.width / optsEl.offsetWidth : 1;
      const contentRight = o.right - (parseFloat(cs.borderRightWidth) + parseFloat(cs.paddingRight)) * z;
      let childOverhang = 0;
      for (const c of optsEl.children) {
        const cr = c.getBoundingClientRect();
        if (cr.width) childOverhang = Math.max(childOverhang, cr.right - contentRight);
      }
      return {
        childOverhang: +childOverhang.toFixed(2),
        pair: inner?.dataset.pair || "",
        uiScale: getComputedStyle(document.documentElement).getPropertyValue("--ui-scale").trim(),
        padR: cs.paddingRight,
      };
    });
    expect(m.uiScale).toBe("0.75");
    expect(m.pair).toBe("on"); // 75% grows sheet own-width past --pair-at
    expect(m.childOverhang, JSON.stringify(m)).toBeLessThanOrEqual(2);
  });
});
