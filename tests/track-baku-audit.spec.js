// @ts-check
// One-shot visual audit of Baku — 25 positions (every 4%), screenshots saved to
// tests/ui-screenshots/baku-audit/. Run with:
//   npx playwright test track-baku-audit --update-snapshots
import { test, expect } from "@playwright/test";
import path from "path";
import fs from "fs";

const OUT_DIR = path.join(import.meta.dirname, "ui-screenshots", "baku-audit");

test.beforeAll(() => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
});

async function goToRace(page, circuit) {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex && window.__apex.race, { timeout: 10_000 });
  await page.evaluate((c) => window.__apex.race(c), circuit);
  await page.waitForFunction(
    () => window.__apex && window.__apex.info().track != null,
    { timeout: 10_000 }
  );
}

test.describe("baku audit – 25 positions", () => {
  for (let i = 0; i < 25; i++) {
    const frac = i * 0.04;
    const pct  = (frac * 100).toFixed(0).padStart(2, "0");

    test(`baku @${pct}%`, async ({ page }) => {
      await goToRace(page, "baku");
      await page.evaluate((f) => window.__apex.park(f), frac);
      await page.waitForTimeout(800);

      const buf = await page.locator("canvas#game").screenshot();
      fs.writeFileSync(path.join(OUT_DIR, `baku-${pct}.png`), buf);

      // Basic sanity: HUD visible, no JS crash
      await expect(page.locator("#hud")).toBeVisible();
    });
  }
});
