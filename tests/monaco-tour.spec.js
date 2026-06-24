// Monaco eye-level tour — 120 shots, one every 3° of track arc.
// Outputs to tests/monaco-tour/  (gitignored).
// Run: npx playwright test tests/monaco-tour.spec.js

import { test } from "@playwright/test";
import fs from "fs";

const OUT = "tests/monaco-tour";
fs.mkdirSync(OUT, { recursive: true });

const VIEWPORT = { width: 1280, height: 720 };

test("Monaco eye-level tour — every 3 degrees", async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await page.goto("/");
  await page.waitForFunction(() => window.__apex, { timeout: 15000 });
  await page.evaluate(async () => {
    __apex.race("monaco");
    await new Promise(r => setTimeout(r, 4000));
    __apex.go();
    await new Promise(r => setTimeout(r, 400));
    __apex.freeze(true);
    __apex.hud(false);
  });

  const N = 120;  // 360° / 3° = 120 positions
  for (let i = 0; i < N; i++) {
    const frac = i / N;
    // eyeAt: camera at centreline, 1.5 m above road, looking ahead
    await page.evaluate(f => __apex.eyeAt(f, 0, 1.5), frac);
    await page.waitForTimeout(80);
    const name = `${String(i).padStart(3, "0")}-deg${(i * 3).toString().padStart(3, "0")}`;
    await page.screenshot({ path: `${OUT}/${name}.png` });
    if (i % 10 === 0) console.log(`  ${i + 1}/${N}  frac=${frac.toFixed(3)}`);
  }
  console.log("  done — 120 shots");
});
