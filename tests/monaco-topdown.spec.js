import { test } from "@playwright/test";

test("monaco top-down", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex, { timeout: 15000 });

  await page.evaluate(async () => {
    __apex.race("monaco");
    await new Promise(r => setTimeout(r, 4000));
    __apex.go();
    await new Promise(r => setTimeout(r, 500));
    __apex.freeze(true);
    __apex.hud(false);
    const b = __apex.trackBounds();
    const span = Math.max(b.spanX, b.spanZ);
    __apex.orbit(b.centerFrac, 0, 82, span * 1.45);
  });

  await page.setViewportSize({ width: 1400, height: 1050 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: "tests/monaco-cam/topdown.png" });
});
