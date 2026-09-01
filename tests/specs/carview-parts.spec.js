// @ts-check
// The isolated car viewer exposes every parts category for manual audits.
//
// STAYS ON THE PER-TEST FIXTURE. sharedTest boots "/" once per worker; these
// tests load a DIFFERENT document (tools/carview.html, with a query string per
// test), so a shared game page saves nothing here — every test would still
// navigate, and leave the shared page off the game for whoever ran next.
import { test, expect } from "@playwright/test";
import { BOOT_MS } from "../helpers/fixtures.js";

test("car viewer exposes controls for all twelve parts categories", async ({ page }) => {
  await page.goto("/tools/carview.html?team=mclaren");
  // BOOT_MS, not a hand-rolled 15 s: a SwiftShader boot here measures 11-33 s (2026-09-01).
  await page.waitForFunction(() => window.CARVIEW && window.CARVIEW.ready, null, { polling: 100, timeout: BOOT_MS });

  for (const id of ["engine", "aero", "suspension", "brakes", "tyres", "ers",
                    "gearbox", "fuel", "exhaust", "floor", "cockpit", "wheels"]) {
    const select = page.locator("#ui-" + id);
    await expect(select).toBeVisible();
    expect(await select.locator("option").count()).toBeGreaterThanOrEqual(3);
  }
});

test("car viewer exposes a frame sequence that advances after state changes", async ({ page }) => {
  await page.goto("/tools/carview.html?team=ferrari&brakes=sig_ferrari_brembo");
  await page.waitForFunction(() => window.CARVIEW && window.CARVIEW.ready, null, { polling: 100, timeout: BOOT_MS });

  const before = await page.evaluate(() => window.CARVIEW.frame);
  expect(typeof before).toBe("number");
  await page.evaluate(() => window.CARVIEW.set({ az: 104, el: 10, dist: 3.2, look: 1.7 }));
  await page.waitForFunction((frame) => window.CARVIEW.frame > frame, before);
});

test("car viewer exposes controls for grounded runtime effect states", async ({ page }) => {
  await page.goto("/tools/carview.html?team=mclaren");
  await page.waitForFunction(() => window.CARVIEW && window.CARVIEW.ready, null, { polling: 100, timeout: BOOT_MS });

  await expect(page.locator("#ui-exhaust-flame")).toBeVisible();
  await expect(page.locator("#ui-brake-glow")).toBeVisible();
  await expect(page.locator("#ui-ers-deploy")).toBeVisible();
});

test("car viewer effect API updates state on a synchronized frame", async ({ page }) => {
  await page.goto("/tools/carview.html?team=mclaren");
  await page.waitForFunction(() => window.CARVIEW && window.CARVIEW.ready, null, { polling: 100, timeout: BOOT_MS });

  const before = await page.evaluate(() => window.CARVIEW.frame);
  const accepted = await page.evaluate(() => window.CARVIEW.set({
    effects: { exhaustFlame: true, brakeGlow: true, ersDeploy: false },
  }));
  expect(accepted).toBe(true);
  await page.waitForFunction((frame) => window.CARVIEW.frame > frame, before);
  expect(await page.evaluate(() => window.CARVIEW.effects)).toEqual({
    exhaustFlame: true,
    brakeGlow: true,
    ersDeploy: false,
    boostFlame: false,
  });
});

