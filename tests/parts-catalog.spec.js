// @ts-check
// Tests for car setup UI catalog rendering:
// - All 8 categories appear in the setup panel
// - New GEARBOX and FUEL categories are visible and selectable
// - Factory/supplier-exclusive parts only appear for the matching team engine
// - Part descriptions update when a chip is selected
// - Category labels match expected values
import { test, expect } from "@playwright/test";

const LANDSCAPE = { width: 844, height: 390 };

async function waitReady(page) {
  await page.waitForFunction(() => window.__apex && window.__apex.race, { timeout: 10_000 });
}

async function openSetup(page) {
  await page.evaluate(() => {
    const team = Teams.LIST[parseInt(localStorage.getItem("apex26.team") ?? "2")];
    if (team) localStorage.removeItem("apex26.parts." + team.id);
    localStorage.removeItem("apex26.unlimitedBudget");
  });
  await page.locator("#mb-race").click();
  await page.locator("#select").waitFor({ state: "visible" });
  await page.locator("#sel-setup").click();
  await page.locator("#carsetup").waitFor({ state: "visible" });
  await page.waitForTimeout(200);
}

test.describe("Car setup catalog — all categories render", () => {
  test.use({ viewport: LANDSCAPE });

  test("all 8 category labels are visible", async ({ page }) => {
    await page.goto("/");
    await waitReady(page);
    await openSetup(page);

    for (const label of ["ENGINE", "AERO", "SUSPENSION", "BRAKES", "TYRES", "ERS", "GEARBOX", "FUEL"]) {
      await expect(page.locator(".cs-cat").filter({ hasText: label })).toBeVisible();
    }
    await page.screenshot({ path: "tests/ui-screenshots/catalog-all-categories.png" });
  });

  test("GEARBOX section contains Standard and F1 Spec options", async ({ page }) => {
    await page.goto("/");
    await waitReady(page);
    await openSetup(page);

    // Find chips near the GEARBOX label
    const gearboxSection = page.locator(".cs-cat-section").filter({ has: page.locator(".cs-cat", { hasText: "GEARBOX" }) });
    await expect(gearboxSection.locator(".cs-chip", { hasText: "Standard" })).toBeVisible();
    await expect(gearboxSection.locator(".cs-chip", { hasText: "F1 Spec" })).toBeVisible();
  });

  test("FUEL section contains Standard and Qualifying Mix options", async ({ page }) => {
    await page.goto("/");
    await waitReady(page);
    await openSetup(page);

    const fuelSection = page.locator(".cs-cat-section").filter({ has: page.locator(".cs-cat", { hasText: "FUEL" }) });
    await expect(fuelSection.locator(".cs-chip", { hasText: "Standard" })).toBeVisible();
    await expect(fuelSection.locator(".cs-chip", { hasText: "Qualifying Mix" })).toBeVisible();
  });

  test("ENGINE section has at least 6 options visible for non-factory team", async ({ page }) => {
    await page.goto("/");
    await waitReady(page);
    // Make sure we're on a non-factory team (default McLaren has no factory engine)
    await openSetup(page);

    const engineSection = page.locator(".cs-cat-section").filter({ has: page.locator(".cs-cat", { hasText: "ENGINE" }) });
    const chipCount = await engineSection.locator(".cs-chip").count();
    expect(chipCount).toBeGreaterThanOrEqual(6);
  });
});

test.describe("Car setup catalog — chip interaction", () => {
  test.use({ viewport: LANDSCAPE });

  test("GEARBOX Standard chip is active by default", async ({ page }) => {
    await page.goto("/");
    await waitReady(page);
    await openSetup(page);

    const gearboxSection = page.locator(".cs-cat-section").filter({ has: page.locator(".cs-cat", { hasText: "GEARBOX" }) });
    const activeChip = gearboxSection.locator(".cs-chip.active");
    await expect(activeChip).toHaveText(/Standard/);
  });

  test("FUEL Standard chip is active by default", async ({ page }) => {
    await page.goto("/");
    await waitReady(page);
    await openSetup(page);

    const fuelSection = page.locator(".cs-cat-section").filter({ has: page.locator(".cs-cat", { hasText: "FUEL" }) });
    const activeChip = fuelSection.locator(".cs-chip.active");
    await expect(activeChip).toHaveText(/Standard/);
  });

  test("clicking Close Ratio gearbox makes it active", async ({ page }) => {
    await page.goto("/");
    await waitReady(page);
    await openSetup(page);

    const gearboxSection = page.locator(".cs-cat-section").filter({ has: page.locator(".cs-cat", { hasText: "GEARBOX" }) });
    await gearboxSection.locator(".cs-chip", { hasText: "Close Ratio" }).click();
    await page.waitForTimeout(200);
    await expect(gearboxSection.locator(".cs-chip.active")).toHaveText(/Close Ratio/);
    await page.screenshot({ path: "tests/ui-screenshots/catalog-gearbox-close-ratio.png" });
  });

  test("clicking High Octane fuel makes it active", async ({ page }) => {
    await page.goto("/");
    await waitReady(page);
    await openSetup(page);

    const fuelSection = page.locator(".cs-cat-section").filter({ has: page.locator(".cs-cat", { hasText: "FUEL" }) });
    await fuelSection.locator(".cs-chip", { hasText: "High Octane" }).click();
    await page.waitForTimeout(200);
    await expect(fuelSection.locator(".cs-chip.active")).toHaveText(/High Octane/);
    await page.screenshot({ path: "tests/ui-screenshots/catalog-fuel-high-octane.png" });
  });

  test("description updates when a chip is selected", async ({ page }) => {
    await page.goto("/");
    await waitReady(page);
    await openSetup(page);

    const fuelSection = page.locator(".cs-cat-section").filter({ has: page.locator(".cs-cat", { hasText: "FUEL" }) });
    await fuelSection.locator(".cs-chip", { hasText: "Race Blend" }).click();
    await page.waitForTimeout(200);
    const desc = await fuelSection.locator(".cs-desc").textContent();
    expect(desc).toContain("energy density");
  });

  test("GEARBOX Sequential Pro chip has a cost badge", async ({ page }) => {
    await page.goto("/");
    await waitReady(page);
    await openSetup(page);

    const gearboxSection = page.locator(".cs-cat-section").filter({ has: page.locator(".cs-cat", { hasText: "GEARBOX" }) });
    const seqPro = gearboxSection.locator(".cs-chip", { hasText: "Sequential Pro" });
    await expect(seqPro.locator(".cs-chip-cost")).toBeVisible();
    const cost = await seqPro.locator(".cs-chip-cost").textContent();
    expect(parseInt(cost ?? "0")).toBe(90);
  });
});

test.describe("Car setup catalog — factory/supplier parts", () => {
  test.use({ viewport: LANDSCAPE });

  test("AMG HPP chip visible when team is Mercedes", async ({ page }) => {
    await page.goto("/");
    await waitReady(page);
    // Switch to Mercedes team (index 0)
    await page.evaluate(() => {
      const idx = Teams.LIST.findIndex((t) => t.engine === "Mercedes" && t.id === "mercedes");
      if (idx >= 0) { localStorage.setItem("apex26.team", String(idx)); }
    });
    await page.reload();
    await waitReady(page);
    await openSetup(page);
    const engineSection = page.locator(".cs-cat-section").filter({ has: page.locator(".cs-cat", { hasText: "ENGINE" }) });
    await expect(engineSection.locator(".cs-chip", { hasText: "AMG HPP" })).toBeVisible();
    await page.screenshot({ path: "tests/ui-screenshots/catalog-mercedes-factory.png" });
  });

  test("AMG HPP chip NOT visible when team is not Mercedes", async ({ page }) => {
    await page.goto("/");
    await waitReady(page);
    // Switch to a non-Mercedes team (Red Bull is typically index with Ford engine)
    await page.evaluate(() => {
      const idx = Teams.LIST.findIndex((t) => t.engine === "Red Bull Ford");
      if (idx >= 0) { localStorage.setItem("apex26.team", String(idx)); }
    });
    await page.reload();
    await waitReady(page);
    await openSetup(page);
    const engineSection = page.locator(".cs-cat-section").filter({ has: page.locator(".cs-cat", { hasText: "ENGINE" }) });
    await expect(engineSection.locator(".cs-chip", { hasText: "AMG HPP" })).toHaveCount(0);
    await page.screenshot({ path: "tests/ui-screenshots/catalog-non-mercedes.png" });
  });

  test("factory chip has FACTORY tag badge", async ({ page }) => {
    await page.goto("/");
    await waitReady(page);
    await page.evaluate(() => {
      const idx = Teams.LIST.findIndex((t) => t.engine === "Mercedes" && t.id === "mercedes");
      if (idx >= 0) { localStorage.setItem("apex26.team", String(idx)); }
    });
    await page.reload();
    await waitReady(page);
    await openSetup(page);
    const engineSection = page.locator(".cs-cat-section").filter({ has: page.locator(".cs-cat", { hasText: "ENGINE" }) });
    const factoryChip = engineSection.locator(".cs-chip", { hasText: "AMG HPP" });
    await expect(factoryChip.locator(".cs-chip-tag")).toContainText("FACTORY");
  });
});

test.describe("Car setup catalog — screenshots", () => {
  test.use({ viewport: { width: 390, height: 844 } }); // portrait

  test("portrait setup screenshot", async ({ page }) => {
    await page.goto("/");
    await waitReady(page);
    await openSetup(page);
    await page.screenshot({ path: "tests/ui-screenshots/catalog-portrait.png" });
  });
});
