// @ts-check
import { readFile } from "node:fs/promises";
import { uiTestOptions } from "../../tools/lib/ui-device-profile.mjs";
import { test, expect, BOOT_MS, clickLive } from "../helpers/fixtures.js";

async function boot(page) {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
}

async function openGraphics(page) {
  await page.locator("#mb-settings").click();
  await page.locator("#pm-open-graphics").click();
  await expect(page.getByText("Graphics details", { exact: true })).toBeVisible();
}

test("desktop frame rate changes immediately and the graphics check returns to Settings", async ({ page }) => {
  await boot(page);
  await openGraphics(page);
  const fps = page.getByRole("combobox", { name: "Race frame rate", exact: true });
  await expect(fps).toHaveValue("display");
  for (const value of ["60", "120"]) {
    await fps.selectOption(value);
    expect(await page.evaluate(() => RenderRate.desktopTarget())).toBe(value);
    expect(await page.evaluate(() => localStorage.getItem("apex26.desktopFpsTarget"))).toBe(value);
  }

  await page.getByRole("button", { name: /Test my graphics/i }).click();
  const bench = page.locator("#bench");
  await expect(bench.getByRole("button", { name: "GRAPHICS CHECK", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(bench.getByRole("button", { name: "RUN GRAPHICS CHECK", exact: true })).toBeEnabled();
  await bench.getByRole("button", { name: "BACK", exact: true }).click();
  await expect(bench).toBeHidden();
  await expect(fps).toBeVisible();
  await expect(fps).toHaveValue("120");
});

test.describe("phone graphics", () => {
  test.use(uiTestOptions({ touch: true, viewport: { width: 852, height: 393 } }));
  test("offers the graphics check without a desktop frame rate control", async ({ page }) => {
    await boot(page);
    await openGraphics(page);
    await expect(page.locator("#pm-desktop-fps")).toHaveCount(0);
    await page.getByRole("button", { name: /Test my graphics/i }).tap();
    await expect(page.locator("#bench").getByRole("button", { name: "RUN GRAPHICS CHECK", exact: true })).toBeVisible();
  });
});

test.describe("Photo Studio capture quality", () => {
  test.use({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
  test("captures eight samples and exports the reframed photo as a square PNG", async ({ page }) => {
    await boot(page);
    await clickLive(page, "mb-photo");
    const samples = page.locator("#ps-samples");
    await expect(samples).toHaveValue("1");
    await expect(samples.locator('option[value="32"]')).toHaveCount(1);
    await samples.selectOption("8");
    await page.evaluate(() => window.__apex.awaitPresent(20000));
    // Record the progress announcements so an instant capture cannot pass as eight samples.
    const progress = await page.locator("#ps-message").evaluateHandle((status) => {
      const seen = [];
      const observer = new MutationObserver(() => {
        const message = status.textContent || "";
        const match = message.match(/sample (\d+) of 8/i);
        if (match) seen.push(Number(match[1]));
        if (message.startsWith("Captured") || message.startsWith("Capture failed")) observer.disconnect();
      });
      observer.observe(status, { childList: true });
      return seen;
    });
    await clickLive(page, "ps-capture");
    await expect(page.locator("#ps-preview")).toBeVisible({ timeout: BOOT_MS });
    expect(await progress.jsonValue()).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    await progress.dispose();
    await page.locator("#ps-aspect").selectOption("square");
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      clickLive(page, "ps-export"),
    ]);
    const file = await download.path();
    if (!file) throw new Error("Photo Studio download is missing");
    const png = await readFile(file);
    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    const width = png.readUInt32BE(16);
    expect(width).toBeGreaterThan(1);
    expect(png.readUInt32BE(20)).toBe(width);
  });
});
