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
  // PR #1075 run 37451436383: under 2 llvmpipe workers, #carsetup was visible
  // (SetupUI.openSetup logged) but cs-tab-* had not been built yet. A one-shot
  // tab click no-op'd, then waitForFunction on `.cs-opt` sat until BOOT_MS on
  // the TEAM pane (no .cs-opt rows). Poll until the paid-category tab exists,
  // click it, and a part row lands — still one BOOT_MS budget.
  //
  // Parts is a script-scope `const` (js/car/parts.js), not window.Parts.
  // page.evaluate sees the global lexical binding; window.Parts is undefined
  // and a window.Parts property guard fails instantly (reproduced 2026-10-06).
  const hasPaid = await page.evaluate(() =>
    typeof Parts !== "undefined" && Parts.CATALOG.some((x) => x.options.some((o) => o.cost > 0)));
  expect(hasPaid, "no catalog category has a paid option — a part row can never be found").toBe(true);
  const handle = await page.waitForFunction(() => {
    if (typeof Parts === "undefined" || !Parts.CATALOG) return false;
    const c = Parts.CATALOG.find((x) => x.options.some((o) => o.cost > 0));
    if (!c) return false;
    const tab = document.getElementById("cs-tab-" + c.id);
    if (!tab) return false;
    if (!document.querySelector("#cs-options .cs-opt")) tab.click();
    return document.querySelector("#cs-options .cs-opt") ? c.id : false;
  }, null, { polling: 100, timeout: BOOT_MS });
  return handle.jsonValue();
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
