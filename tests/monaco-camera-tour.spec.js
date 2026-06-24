// @ts-check
import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";

const OUT = path.join(import.meta.dirname, "monaco-cam");

test("monaco full-circuit camera tour", async ({ page }) => {
  fs.mkdirSync(OUT, { recursive: true });

  await page.goto("/");
  await page.waitForFunction(() => window.__apex, { timeout: 15000 });

  await page.evaluate(async () => {
    __apex.race("monaco");
    await new Promise(r => setTimeout(r, 4000));
    __apex.go();
    await new Promise(r => setTimeout(r, 500));
    __apex.freeze(true);
    __apex.hud(false);
  });

  // 12 orbit shots around the circuit
  // Format: [label, frac, az_deg, el_deg, dist_m]
  const shots = [
    ["00-start-finish",       0.00,  20, 18, 80],
    ["01-sainte-devote",      0.06,  40, 22, 60],
    ["02-beau-rivage-climb",  0.12,   0, 25, 90],
    ["03-massenet",           0.19, -30, 20, 70],
    ["04-casino-square",      0.22, -20, 18, 65],
    ["05-mirabeau",           0.28,  30, 20, 70],
    ["06-hairpin",            0.33, 160, 22, 55],
    ["07-portier",            0.42,  10, 18, 65],
    ["08-tunnel-exit",        0.55, -40, 20, 90],
    ["09-nouvelle-chicane",   0.63,  20, 18, 70],
    ["10-tabac-piscine",      0.72,  10, 20, 80],
    ["11-rascasse",           0.82, -30, 22, 60],
    ["12-anthony-noghes",     0.90,  20, 18, 65],
    ["13-overview",           0.50,   0, 55, 600],
  ];

  for (const [label, frac, az, el, dist] of shots) {
    await page.evaluate(([frac, az, el, dist]) => {
      __apex.orbit(frac, az, el, dist);
    }, [frac, az, el, dist]);
    await page.waitForTimeout(400);
    const file = path.join(OUT, `${label}.png`);
    await page.screenshot({ path: file });
    console.log(`Shot: ${label} @ frac=${frac}`);
  }

  console.log(`\nScreenshots saved to: ${OUT}`);
  expect(true).toBe(true);
});
