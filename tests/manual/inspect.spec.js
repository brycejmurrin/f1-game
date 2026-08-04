// @ts-check
/**
 * Per-circuit CONTACT SHEET for visual review — one test per circuit, all in one
 * file (this replaces the 40 identical three-line stubs under tests/inspect/).
 *
 * Captures a chase-cam frame every 4 % of the lap and composites the 25 frames
 * into a single 5×5 sheet, for the on-track intrusions the blank scan cannot
 * catch (a roof over the racing line renders a perfectly bright frame).
 *
 * Excluded from default discovery (testIgnore in playwright.config.js) — it
 * emits images for a human, it does not gate anything. Run it by path:
 *
 *   npm test -- tests/manual/inspect.spec.js --grep monza
 *   CIRCUITS=monza,spa npm test -- tests/manual/inspect.spec.js
 *
 * Output: artifacts/galleries-<port>/inspect/
 */
import { test } from "@playwright/test";
import fs from "fs";
import { galleryPath, galleryUrl } from "../output-paths.js";
import { circuits } from "./circuits.js";

async function loadTrack(page, circuit) {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex?.race, { timeout: 15_000 });
  await page.evaluate((c) => window.__apex.race(c), circuit);
  await page.waitForFunction(() => window.__apex?.info().track != null, { timeout: 15_000 });
}

for (const circuit of circuits()) {
  test(`inspect ${circuit}`, { timeout: 90_000 }, async ({ page }) => {
    await loadTrack(page, circuit);
    await page.evaluate(() => window.__apex.park(0));
    const box = await page.locator("canvas#game").boundingBox();

    const labels = [];
    for (let i = 0; i < 25; i++) {
      const frac = i / 25;
      const pct = Math.round(frac * 100).toString().padStart(2, "0");
      await page.evaluate(([f]) => { window.__apex.jump(f, 55, 0); window.__apex.snapCam(); }, [frac]);
      await page.waitForTimeout(230);
      const buf = await page.screenshot({ clip: box });
      fs.writeFileSync(galleryPath("inspect", circuit, `${circuit}-${pct}.png`), buf);
      labels.push(pct);
    }

    // Composite into a 5×5 contact sheet via a served-HTML grid + screenshot.
    const cells = labels.map((pct) => `
      <div class="cell">
        <img src="${galleryUrl("inspect", circuit, `${circuit}-${pct}.png`)}">
        <span>${pct}%</span>
      </div>`).join("");
    const html = `<!doctype html><html><head><style>
      *{margin:0;box-sizing:border-box}
      body{background:#111;font:14px monospace;color:#0f0}
      .grid{display:grid;grid-template-columns:repeat(5,256px);gap:2px;padding:2px}
      .cell{position:relative;width:256px;height:144px}
      .cell img{width:256px;height:144px;display:block;object-fit:cover}
      .cell span{position:absolute;top:1px;left:2px;background:#000a;padding:0 3px;color:#0ff}
    </style></head><body><div class="grid">${cells}</div></body></html>`;
    await page.setViewportSize({ width: 1290, height: 740 });
    await page.setContent(html);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(300);
    const sheet = await page.locator(".grid").screenshot();
    fs.writeFileSync(galleryPath("inspect", `${circuit}-sheet.png`), sheet);
    console.log(`${circuit}: sheet saved`);
  });
}
