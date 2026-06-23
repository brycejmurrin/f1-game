// @ts-check
import { test } from "@playwright/test";

const LS = { width: 844, height: 390 };
const PT = { width: 390, height: 844 };

async function waitReady(page) {
  await page.waitForFunction(() => window.__apex && window.__apex.race, { timeout: 10_000 });
}
async function startParked(page) {
  await page.evaluate(() => window.__apex.race("bahrain"));
  await page.waitForFunction(() => window.__apex.info().track != null, { timeout: 10_000 });
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
  await page.screenshot({ path: `tests/ui-screenshots/hud-audit-${name}.png`, fullPage: false });
}

// ── LANDSCAPE ────────────────────────────────────────────
test.describe("HUD landscape", () => {
  test.use({ viewport: LS });

  test("tilt auto-gear", async ({ page }) => {
    await page.goto("/"); await loadWithMode(page, "tilt", false);
    await shot(page, "ls-tilt-auto");
  });
  test("tilt manual-gear", async ({ page }) => {
    await page.goto("/"); await loadWithMode(page, "tilt", true);
    await shot(page, "ls-tilt-manual");
  });
  test("buttons", async ({ page }) => {
    await page.goto("/"); await loadWithMode(page, "buttons", false);
    await shot(page, "ls-buttons");
  });
  test("touch", async ({ page }) => {
    await page.goto("/"); await loadWithMode(page, "touch", false);
    await shot(page, "ls-touch");
  });
});

// ── PORTRAIT ─────────────────────────────────────────────
test.describe("HUD portrait", () => {
  test.use({ viewport: PT });

  test("tilt auto-gear", async ({ page }) => {
    await page.goto("/"); await loadWithMode(page, "tilt", false);
    await shot(page, "pt-tilt-auto");
  });
  test("tilt manual-gear", async ({ page }) => {
    await page.goto("/"); await loadWithMode(page, "tilt", true);
    await shot(page, "pt-tilt-manual");
  });
  test("buttons", async ({ page }) => {
    await page.goto("/"); await loadWithMode(page, "buttons", false);
    await shot(page, "pt-buttons");
  });
  test("touch", async ({ page }) => {
    await page.goto("/"); await loadWithMode(page, "touch", false);
    await shot(page, "pt-touch");
  });
});
