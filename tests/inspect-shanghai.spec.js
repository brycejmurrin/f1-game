// @ts-check
// Visual inspection capture for one circuit: saves a chase-cam frame at every
// 4% of the lap so on-track / intruding scenery can be eyeballed (the blank
// scan only flags fully-empty frames, not objects sitting on a rendered track).
import { test } from "@playwright/test";
import fs from "fs";
import path from "path";

const CIRCUIT = process.env.INSPECT_CIRCUIT || "shanghai";
const OUT = path.join(import.meta.dirname, "ui-screenshots", "inspect", CIRCUIT);

async function loadTrack(page, circuit) {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex?.race, { timeout: 15_000 });
  await page.evaluate((c) => window.__apex.race(c), circuit);
  await page.waitForFunction(() => window.__apex?.info().track != null, { timeout: 15_000 });
}

test(`inspect ${CIRCUIT}`, { timeout: 90_000 }, async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true });
  await loadTrack(page, CIRCUIT);
  await page.evaluate(() => window.__apex.park(0));
  const box = await page.locator("canvas#game").boundingBox();
  for (let i = 0; i < 25; i++) {
    const frac = i / 25;
    const pct = Math.round(frac * 100).toString().padStart(2, "0");
    await page.evaluate(([f]) => { window.__apex.jump(f, 55, 0); window.__apex.snapCam(); }, [frac]);
    await page.waitForTimeout(250);
    const buf = await page.screenshot({ clip: box });
    fs.writeFileSync(path.join(OUT, `${CIRCUIT}-${pct}.png`), buf);
  }
  console.log(`saved 25 frames → ${OUT}`);
});
