// @ts-check
// The DOM half of dev-tools.spec.js. The JSON contract moved to the VM twin
// (tests/unit/dev-tools-vm.test.mjs); these need a real results table or HUD
// node, plus the two gallery shots.
import { test, expect, BOOT_MS } from "../helpers/fixtures.js";
import { galleryPath } from "../helpers/output-paths.js";

const LANDSCAPE = { width: 844, height: 390 };

async function load(page, trackId = "monza") {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
  await page.evaluate((id) => window.__apex.race(id), trackId);
  await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: BOOT_MS });
}

async function loadParked(page, frac = 0.1, trackId = "monza", opts = {}) {
  await load(page, trackId);
  if (opts.headless) await page.evaluate(() => window.__apex.headless(true));
  await page.evaluate((f) => window.__apex.park(f), frac);
}

test.describe("dev-tools DOM", () => {
  test.use({ viewport: LANDSCAPE });

  test("finishRace shows the results panel", async ({ page }) => {
    await loadParked(page, 0.1, "monza", { headless: true });
    const r = await page.evaluate(() => window.__apex.finishRace());
    expect(r).not.toBe(false);
    await page.locator("#results").waitFor({ state: "visible" });
    expect(await page.evaluate(() => window.__apex.info().state)).toBe("results");
    await page.evaluate(() => window.__apex.headless(false));
    await page.screenshot({ path: galleryPath("dev-tools", "dev-tools-finish-race.png") });
  });

  test("results table is populated after finishRace()", async ({ page }) => {
    await loadParked(page, 0.1, "monza", { headless: true });
    await page.evaluate(() => window.__apex.finishRace());
    await page.locator("#results").waitFor({ state: "visible" });
    expect(await page.locator(".res-row").count()).toBeGreaterThan(0);
  });

  test("uses current field order for results classification", async ({ page }) => {
    await loadParked(page);
    const expected = await page.evaluate(() => {
      const field = window.__apex.fieldState();
      for (const car of field) {
        const frac = (car.id + 1) / (field.length + 1);
        if (car.isPlayer) window.__apex.jump(frac, 0, 0);
        else window.__apex.aiPlace(car.id, frac, 0, 0);
      }
      return window.__apex.fieldState().map((car) => car.code);
    });
    await page.evaluate(() => window.__apex.finishRace());
    await page.locator("#results").waitFor({ state: "visible" });
    const actual = await page.locator('#results-table > [data-results-part="ranking"][aria-label="Race classification"] > .res-row .res-name').allTextContents();
    expect(actual.map((name) => name.trim().split(/\s+/)[0])).toEqual(expected);
  });

  test("hud(false) hides the HUD element", async ({ page }) => {
    await load(page);
    await page.evaluate(() => window.__apex.go());
    await page.evaluate(() => window.__apex.hud(false));
    await expect(page.locator("#hud")).toBeHidden();
    await page.screenshot({ path: galleryPath("dev-tools", "dev-tools-hud-hidden.png") });
  });

  test("hud(true) restores the HUD element", async ({ page }) => {
    await load(page);
    await page.evaluate(() => window.__apex.go());
    await page.evaluate(() => window.__apex.hud(false));
    await page.evaluate(() => window.__apex.hud(true));
    await expect(page.locator("#hud")).toBeVisible();
  });
});
