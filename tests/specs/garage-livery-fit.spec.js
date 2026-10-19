// @ts-check
// Issue #2950: on the garage LIVERY tab, is #cs-options clipped by #cs-body?
// Measured at the two phone shapes with the touch profile. "Fits" means the
// options box lies inside the body box and no visible descendant is painted
// past the options box's left/right edge (the vertical axis scrolls on purpose).
import fs from "node:fs";
import { test, expect, BOOT_MS } from "../helpers/fixtures.js";

const SHAPES = [
  { name: "portrait 390x844", width: 390, height: 844 },
  { name: "landscape 844x390", width: 844, height: 390 },
];

for (const shape of SHAPES) {
  test.describe(`garage LIVERY fit, ${shape.name}`, () => {
    test.use({ viewport: { width: shape.width, height: shape.height }, hasTouch: true, isMobile: true });

    test("#cs-options fits inside #cs-body", async ({ page }) => {
      await page.goto("/");
      await page.waitForFunction(() => !!window.__apex, null, { polling: 100, timeout: BOOT_MS });
      await page.evaluate(() => window.__apex.headless(true));
      await page.locator("#mb-garage").tap();
      await page.waitForFunction(() => document.querySelectorAll('#cs-tabs [role="tab"]').length > 0,
        null, { polling: 100, timeout: BOOT_MS });
      await page.locator("#cs-tab-livery").tap();
      await expect(page.locator("#cs-tab-livery")).toHaveAttribute("aria-selected", "true");
      const m = await page.evaluate(() => {
        const body = document.getElementById("cs-body"), opts = document.getElementById("cs-options");
        const b = body.getBoundingClientRect(), o = opts.getBoundingClientRect();
        const over = [];
        for (const el of opts.querySelectorAll("*")) {
          const r = el.getBoundingClientRect();
          if (!r.width || !r.height || getComputedStyle(el).visibility === "hidden") continue;
          if (r.left < o.left - 1 || r.right > o.right + 1) over.push(`${el.className || el.tagName}:${Math.round(r.left - o.left)}/${Math.round(r.right - o.right)}`);
        }
        const bs = getComputedStyle(body);
        return {
          body: [b.left, b.top, b.right, b.bottom].map(Math.round), opts: [o.left, o.top, o.right, o.bottom].map(Math.round),
          bodyDisplay: bs.display, bodyOverflow: bs.overflow, scrollX: opts.scrollWidth - opts.clientWidth,
          scrollY: opts.scrollHeight - opts.clientHeight, over: over.slice(0, 6),
        };
      });
      test.info().annotations.push({ type: "measure", description: JSON.stringify(m) });
      fs.mkdirSync("artifacts", { recursive: true });
      fs.appendFileSync("artifacts/livery-fit-measure.jsonl", JSON.stringify({ shape: shape.name, ...m }) + "\n");
      if (m.bodyDisplay !== "contents") {
        expect(m.opts[0]).toBeGreaterThanOrEqual(m.body[0] - 1);
        expect(m.opts[1]).toBeGreaterThanOrEqual(m.body[1] - 1);
        expect(m.opts[2]).toBeLessThanOrEqual(m.body[2] + 1);
        expect(m.opts[3]).toBeLessThanOrEqual(m.body[3] + 1);
      }
      expect(m.over).toEqual([]);
      expect(m.scrollX).toBeLessThanOrEqual(6);
    });
  });
}
