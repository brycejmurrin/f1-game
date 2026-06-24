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
    __apex.orbit(0.5, 0, 89, 900);
  });

  await page.setViewportSize({ width: 1200, height: 1200 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: "tests/monaco-cam/topdown.png" });
});
