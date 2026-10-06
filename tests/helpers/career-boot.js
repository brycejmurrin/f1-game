// @ts-check
// Shared boot helpers for the career Playwright specs (virgin-page fixture).
import { expect } from "@playwright/test";
import { BOOT_MS } from "./fixtures.js";

export { BOOT_MS };
export const LANDSCAPE = { width: 844, height: 390 };

export async function boot(page) {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
  await page.evaluate(() => window.__apex.headless(true));
}

export async function armRace(page, setup, arg) {
  await page.evaluate(setup, arg);
  await page.waitForFunction(() => {
    try {
      const st = window.__apex.info().state;
      return (st === "race" || st === "count") && !!window.__apex.carAt(0);
    } catch (_) { return false; }
  }, null, { polling: 100, timeout: BOOT_MS });
}

export async function selectPartCategory(page) {
  const cat = await page.evaluate(() => {
    const c = Parts.CATALOG.find((x) => x.options.some((o) => o.cost > 0));
    if (!c) return null;
    const tab = document.getElementById(`cs-tab-${c.id}`);
    if (tab) tab.click();
    return c.id;
  });
  expect(cat, "no catalog category has a paid option — a part row can never be found").not.toBeNull();
  await page.waitForFunction(() => !!document.querySelector("#cs-options .cs-opt"),
    null, { polling: 100, timeout: BOOT_MS });
  return cat;
}

export async function startCareer(page, opts) {
  await page.evaluate((o) => window.__apex.career(o), opts || { teamId: "haas", seat: 1, seed: 4242 });
}

export async function goRacing(page) {
  await page.locator("#cr-go").click();
  await page.locator("#rs-go").click();
  await expect(page.locator("#quali")).toBeVisible({ timeout: 20_000 });
  await page.locator("#q-sim").click();
  await page.locator("#q-go").click();
  await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: BOOT_MS });
}
