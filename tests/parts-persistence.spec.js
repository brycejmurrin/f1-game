// @ts-check
// Tests for car setup part selection persistence:
// - Selected parts are saved to localStorage under "apex26.parts.<teamId>"
// - Parts survive a full page reload
// - Different teams have independent setup storage
// - DONE button returns to the select screen
// - Selecting a new part updates localStorage immediately
import { test, expect } from "@playwright/test";

const LANDSCAPE = { width: 844, height: 390 };

async function waitReady(page) {
  await page.waitForFunction(() => window.__apex && window.__apex.race, { timeout: 10_000 });
}

function getTeamId(page) {
  return page.evaluate(() => {
    const idx = parseInt(localStorage.getItem("apex26.team") ?? "2");
    return Teams.LIST[idx]?.id ?? null;
  });
}

function getStoredParts(page, teamId) {
  return page.evaluate(
    (id) => JSON.parse(localStorage.getItem("apex26.parts." + id) ?? "null"),
    teamId
  );
}

async function clearState(page) {
  await page.evaluate(() => {
    const idx = parseInt(localStorage.getItem("apex26.team") ?? "2");
    const team = Teams.LIST[idx];
    if (team) localStorage.removeItem("apex26.parts." + team.id);
    localStorage.removeItem("apex26.unlimitedBudget");
  });
}

async function openSetup(page) {
  await clearState(page);
  await page.locator("#mb-race").click();
  await page.locator("#select").waitFor({ state: "visible" });
  await page.locator("#sel-setup").click();
  await page.locator("#carsetup").waitFor({ state: "visible" });
  await page.waitForTimeout(200);
}

test.describe("Parts persistence — localStorage writes", () => {
  test.use({ viewport: LANDSCAPE });

  test("selecting a gearbox part saves it to localStorage", async ({ page }) => {
    await page.goto("/");
    await waitReady(page);
    await openSetup(page);

    const teamId = await getTeamId(page);
    const gearboxSection = page.locator(".cs-cat-section").filter({ has: page.locator(".cs-cat", { hasText: "GEARBOX" }) });
    await gearboxSection.locator(".cs-chip", { hasText: "Sequential Pro" }).click();
    await page.waitForTimeout(300);

    const stored = await getStoredParts(page, teamId);
    expect(stored?.gearbox).toBe("sequential_pro");
  });

  test("selecting a fuel part saves it to localStorage", async ({ page }) => {
    await page.goto("/");
    await waitReady(page);
    await openSetup(page);

    const teamId = await getTeamId(page);
    const fuelSection = page.locator(".cs-cat-section").filter({ has: page.locator(".cs-cat", { hasText: "FUEL" }) });
    await fuelSection.locator(".cs-chip", { hasText: "Race Blend" }).click();
    await page.waitForTimeout(300);

    const stored = await getStoredParts(page, teamId);
    expect(stored?.fuel).toBe("race_blend");
  });

  test("multiple categories save independently", async ({ page }) => {
    await page.goto("/");
    await waitReady(page);
    await openSetup(page);

    const teamId = await getTeamId(page);
    const gearboxSection = page.locator(".cs-cat-section").filter({ has: page.locator(".cs-cat", { hasText: "GEARBOX" }) });
    const fuelSection = page.locator(".cs-cat-section").filter({ has: page.locator(".cs-cat", { hasText: "FUEL" }) });

    await gearboxSection.locator(".cs-chip", { hasText: "Close Ratio" }).click();
    await page.waitForTimeout(100);
    await fuelSection.locator(".cs-chip", { hasText: "High Octane" }).click();
    await page.waitForTimeout(300);

    const stored = await getStoredParts(page, teamId);
    expect(stored?.gearbox).toBe("close_ratio");
    expect(stored?.fuel).toBe("high_octane");
  });
});

test.describe("Parts persistence — survives page reload", () => {
  test.use({ viewport: LANDSCAPE });

  test("selected gearbox part active after reload", async ({ page }) => {
    await page.goto("/");
    await waitReady(page);
    await openSetup(page);

    const gearboxSection = page.locator(".cs-cat-section").filter({ has: page.locator(".cs-cat", { hasText: "GEARBOX" }) });
    await gearboxSection.locator(".cs-chip", { hasText: "Carbon Case" }).click();
    await page.waitForTimeout(300);

    // Navigate away and back
    await page.reload();
    await waitReady(page);
    await page.locator("#mb-race").click();
    await page.locator("#select").waitFor({ state: "visible" });
    await page.locator("#sel-setup").click();
    await page.locator("#carsetup").waitFor({ state: "visible" });
    await page.waitForTimeout(200);

    const gearboxSection2 = page.locator(".cs-cat-section").filter({ has: page.locator(".cs-cat", { hasText: "GEARBOX" }) });
    await expect(gearboxSection2.locator(".cs-chip.active")).toHaveText(/Carbon Case/);
    await page.screenshot({ path: "tests/ui-screenshots/persistence-gearbox-reload.png" });
  });

  test("selected fuel part active after reload", async ({ page }) => {
    await page.goto("/");
    await waitReady(page);
    await openSetup(page);

    const fuelSection = page.locator(".cs-cat-section").filter({ has: page.locator(".cs-cat", { hasText: "FUEL" }) });
    await fuelSection.locator(".cs-chip", { hasText: "Qualifying Mix" }).click();
    await page.waitForTimeout(300);

    await page.reload();
    await waitReady(page);
    await page.locator("#mb-race").click();
    await page.locator("#select").waitFor({ state: "visible" });
    await page.locator("#sel-setup").click();
    await page.locator("#carsetup").waitFor({ state: "visible" });
    await page.waitForTimeout(200);

    const fuelSection2 = page.locator(".cs-cat-section").filter({ has: page.locator(".cs-cat", { hasText: "FUEL" }) });
    await expect(fuelSection2.locator(".cs-chip.active")).toHaveText(/Qualifying Mix/);
    await page.screenshot({ path: "tests/ui-screenshots/persistence-fuel-reload.png" });
  });

  test("budget reflects saved parts after reload", async ({ page }) => {
    await page.goto("/");
    await waitReady(page);
    await openSetup(page);

    // Select race engine (160cr)
    const engineSection = page.locator(".cs-cat-section").filter({ has: page.locator(".cs-cat", { hasText: "ENGINE" }) });
    await engineSection.locator(".cs-chip", { hasText: "Race" }).first().click();
    await page.waitForTimeout(300);

    await page.reload();
    await waitReady(page);
    await page.locator("#mb-race").click();
    await page.locator("#select").waitFor({ state: "visible" });
    await page.locator("#sel-setup").click();
    await page.locator("#carsetup").waitFor({ state: "visible" });
    await page.waitForTimeout(200);

    const budgetText = await page.locator("#cs-budget").textContent();
    expect(budgetText).toContain("440");
  });
});

test.describe("Parts persistence — team isolation", () => {
  test.use({ viewport: LANDSCAPE });

  test("different teams have independent part storage", async ({ page }) => {
    await page.goto("/");
    await waitReady(page);

    // Select McLaren (default, index 2) and pick a gearbox
    await openSetup(page);
    const gearboxSection = page.locator(".cs-cat-section").filter({ has: page.locator(".cs-cat", { hasText: "GEARBOX" }) });
    await gearboxSection.locator(".cs-chip", { hasText: "F1 Spec" }).click();
    await page.waitForTimeout(200);
    await page.locator("#cs-done").click();
    await page.locator("#select").waitFor({ state: "visible" });

    // Switch to a different team
    await page.evaluate(() => {
      const idx = Teams.LIST.findIndex((t) => t.id !== Teams.LIST[parseInt(localStorage.getItem("apex26.team") ?? "2")].id);
      if (idx >= 0) { localStorage.setItem("apex26.team", String(idx)); }
    });
    await page.reload();
    await waitReady(page);

    await page.locator("#mb-race").click();
    await page.locator("#select").waitFor({ state: "visible" });
    await page.locator("#sel-setup").click();
    await page.locator("#carsetup").waitFor({ state: "visible" });
    await page.waitForTimeout(200);

    const gearboxSection2 = page.locator(".cs-cat-section").filter({ has: page.locator(".cs-cat", { hasText: "GEARBOX" }) });
    // New team should show Standard as default, not the F1 Spec we picked for McLaren
    const activeText = await gearboxSection2.locator(".cs-chip.active").textContent();
    expect(activeText).toContain("Standard");
  });
});

test.describe("Parts persistence — navigation", () => {
  test.use({ viewport: LANDSCAPE });

  test("DONE button closes setup and returns to select screen", async ({ page }) => {
    await page.goto("/");
    await waitReady(page);
    await openSetup(page);

    await page.locator("#cs-done").click();
    await page.locator("#select").waitFor({ state: "visible" });
    await expect(page.locator("#carsetup")).toBeHidden();
    await page.screenshot({ path: "tests/ui-screenshots/persistence-done-button.png" });
  });
});
