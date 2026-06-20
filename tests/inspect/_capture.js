// @ts-check
// Capture a chase-cam frame every 4% of the lap for one circuit, then composite
// the 25 frames into a single 5×5 contact sheet for quick visual review of
// on-track intrusions (which the blank scan can't catch). One spec per circuit.
import { test } from "@playwright/test";
import fs from "fs";
import path from "path";

const OUTROOT = path.join(import.meta.dirname, "..", "ui-screenshots", "inspect");

async function loadTrack(page, circuit) {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex?.race, { timeout: 15_000 });
  await page.evaluate((c) => window.__apex.race(c), circuit);
  await page.waitForFunction(() => window.__apex?.info().track != null, { timeout: 15_000 });
}

export function captureCircuit(circuit) {
  test(`inspect ${circuit}`, { timeout: 90_000 }, async ({ page }) => {
    const dir = path.join(OUTROOT, circuit);
    fs.mkdirSync(dir, { recursive: true });

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
      fs.writeFileSync(path.join(dir, `${circuit}-${pct}.png`), buf);
      labels.push(pct);
    }

    // Composite into a 5×5 contact sheet via a served-HTML grid + screenshot.
    const cells = labels.map((pct) => `
      <div class="cell">
        <img src="/tests/ui-screenshots/inspect/${circuit}/${circuit}-${pct}.png">
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
    await page.setContent(html, { baseURL: "http://localhost:3456" });
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(300);
    const sheet = await page.locator(".grid").screenshot();
    fs.writeFileSync(path.join(OUTROOT, `${circuit}-sheet.png`), sheet);
    console.log(`${circuit}: sheet saved`);
  });
}
