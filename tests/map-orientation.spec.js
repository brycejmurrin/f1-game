// @ts-check
import { test } from "@playwright/test";
import fs from "fs";
import path from "path";

const OUT = path.join(import.meta.dirname, "trackmap-shots");

test("map orientation - track selector preview", async ({ page }) => {
  test.setTimeout(45_000);
  fs.mkdirSync(OUT, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");
  await page.waitForFunction(() => typeof TrackMaps !== "undefined", { timeout: 15000 });

  await page.click("#mb-race");
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(OUT, "track-selector.png") });

  // Click Monaco row
  await page.evaluate(() => {
    const rows = document.querySelectorAll(".track-row");
    for (const r of rows) { if (r.textContent.includes("Monaco")) { r.click(); break; } }
  });
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, "track-selector-monaco.png") });
});
