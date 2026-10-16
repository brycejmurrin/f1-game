// @ts-check
import { test, expect } from "@playwright/test";
import { BOOT_MS } from "../helpers/fixtures.js";
import { galleryPath } from "../helpers/output-paths.js";

const LS = { width: 844, height: 390 };
const PT = { width: 390, height: 844 };

async function waitReady(page) {
  // BOOT_MS, not a hand-rolled 10 s: a SwiftShader boot here measures 11-33 s (2026-09-01).
  await page.waitForFunction(() => window.__apex && window.__apex.race, null, { polling: 100, timeout: BOOT_MS });
}
async function startParked(page) {
  await page.evaluate(() => window.__apex.race("bahrain"));
  await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: BOOT_MS });
  const rd = await page.evaluate(() => { const e = document.getElementById("rotate-device"); if(e) e.hidden=true; });
  await page.evaluate(() => window.__apex.park(0.25));
  await page.waitForTimeout(600);
}

// Set steer mode via localStorage then reload so game initialises properly
async function loadWithMode(page, steerMode, manual = false) {
  await page.evaluate(({ sm, m }) => {
    localStorage.setItem("apex26.steerMode", sm);
    localStorage.setItem("apex26.manual", m ? "true" : "false");
  }, { sm: steerMode, m: manual });
  await page.reload();
  await waitReady(page);
  await startParked(page);
}

async function shot(page, name) {
  await page.waitForTimeout(200);
  await page.screenshot({ path: galleryPath("hud-audit", `hud-audit-${name}.png`), fullPage: false });
}

// Assert the HUD actually rendered (not a blank/broken canvas that screenshots
// silently), and that button/touch modes show their on-screen controls. Without
// hasTouch:true (added to the describes below) the game applies body.desktop and
// HIDES the steer/gas buttons, so these shots used to capture the wrong thing.
async function assertHud(page, steerMode) {
  await expect(page.locator("#hud")).toBeVisible();
  if (steerMode === "buttons" || steerMode === "touch") {
    // In-race on-screen steering controls must be present in these modes.
    await expect(page.locator("#btn-steer-left, #btn-throttle").first()).toBeVisible();
  }
}

// ── LANDSCAPE ────────────────────────────────────────────
test.describe("HUD landscape", () => {
  test.use({ viewport: LS, hasTouch: true });

  test("tilt auto-gear", async ({ page }) => {
    await page.goto("/"); await loadWithMode(page, "tilt", false);
    await assertHud(page, "tilt"); await shot(page, "ls-tilt-auto");
  });
  test("tilt manual-gear", async ({ page }) => {
    await page.goto("/"); await loadWithMode(page, "tilt", true);
    await assertHud(page, "tilt"); await shot(page, "ls-tilt-manual");
  });
  test("buttons", async ({ page }) => {
    await page.goto("/"); await loadWithMode(page, "buttons", false);
    await assertHud(page, "buttons"); await shot(page, "ls-buttons");
  });
  test("touch", async ({ page }) => {
    await page.goto("/"); await loadWithMode(page, "touch", false);
    await assertHud(page, "touch"); await shot(page, "ls-touch");
  });
});

// ── PORTRAIT ─────────────────────────────────────────────
test.describe("HUD portrait", () => {
  test.use({ viewport: PT, hasTouch: true });

  test("tilt auto-gear", async ({ page }) => {
    await page.goto("/"); await loadWithMode(page, "tilt", false);
    await assertHud(page, "tilt"); await shot(page, "pt-tilt-auto");
  });
  test("tilt manual-gear", async ({ page }) => {
    await page.goto("/"); await loadWithMode(page, "tilt", true);
    await assertHud(page, "tilt"); await shot(page, "pt-tilt-manual");
  });
  test("buttons", async ({ page }) => {
    await page.goto("/"); await loadWithMode(page, "buttons", false);
    await assertHud(page, "buttons"); await shot(page, "pt-buttons");
  });
  test("touch", async ({ page }) => {
    await page.goto("/"); await loadWithMode(page, "touch", false);
    await assertHud(page, "touch"); await shot(page, "pt-touch");
  });
});
