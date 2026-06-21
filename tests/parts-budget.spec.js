// @ts-check
// Tests for car setup budget system:
// - Budget display at 600cr default
// - Budget decrements on part selection
// - Over-budget parts show visual warning and can't be selected (without unlimited)
// - Unlimited toggle removes cap and persists via localStorage
import { test, expect } from "@playwright/test";

async function waitReady(page) {
  await page.waitForFunction(() => window.__apex && window.__apex.race, { timeout: 10_000 });
}

async function openSetup(page) {
  await page.goto("/");
  await waitReady(page);
  // Clear any stored parts / unlimited state to start fresh
  await page.evaluate(() => {
    const team = Teams.LIST[parseInt(localStorage.getItem("apex26.team") ?? "2")];
    if (team) localStorage.removeItem("apex26.parts." + team.id);
    localStorage.removeItem("apex26.unlimitedBudget");
  });
  await page.reload();
  await waitReady(page);
  await page.locator("#mb-race").click();
  await page.locator("#select").waitFor({ state: "visible" });
  await page.locator("#sel-setup").click();
  await page.locator("#carsetup").waitFor({ state: "visible" });
}

test.describe("Budget system — display", () => {
  test("shows full 600 cr at all defaults", async ({ page }) => {
    await openSetup(page);
    const text = await page.locator("#cs-budget").textContent();
    expect(text).toContain("600");
    expect(text).toContain("600");
    await page.screenshot({ path: "tests/ui-screenshots/budget-default.png" });
  });

  test("budget label has no 'over' class at defaults", async ({ page }) => {
    await openSetup(page);
    const cls = await page.locator("#cs-budget").getAttribute("class");
    expect(cls ?? "").not.toContain("over");
  });

  test("budget bar fill is zero at all defaults", async ({ page }) => {
    await openSetup(page);
    const transform = await page.locator("#cs-budget-fill").evaluate((el) =>
      (el as HTMLElement).style.transform
    );
    expect(transform).toContain("scaleX(0)");
  });
});

test.describe("Budget system — part selection", () => {
  test("selecting race engine (160cr) reduces budget to 440", async ({ page }) => {
    await openSetup(page);
    // Click the Race engine chip
    await page.locator(".cs-chip").filter({ hasText: /^Race$/ }).first().click();
    await page.waitForTimeout(200);
    const text = await page.locator("#cs-budget").textContent();
    expect(text).toContain("440");
    await page.screenshot({ path: "tests/ui-screenshots/budget-race-engine.png" });
  });

  test("budget fill bar increases after selecting a paid part", async ({ page }) => {
    await openSetup(page);
    await page.locator(".cs-chip").filter({ hasText: /^Race$/ }).first().click();
    await page.waitForTimeout(200);
    const transform = await page.locator("#cs-budget-fill").evaluate((el) =>
      (el as HTMLElement).style.transform
    );
    // 160/600 ≈ 0.267 — must be a scaleX > 0
    expect(transform).toMatch(/scaleX\(0\.[1-9]/);
  });

  test("parts that exceed budget show over-budget class", async ({ page }) => {
    await openSetup(page);
    // Select the most expensive ERS (overcharge = 230cr) first
    await page.locator(".cs-chip").filter({ hasText: /^Overcharge$/ }).first().click();
    await page.waitForTimeout(200);
    // Then active_aero (160cr) + hypersoft tyres (200cr) — some expensive option
    // should now be over-budget
    const overBudgetCount = await page.locator(".cs-chip.over-budget").count();
    expect(overBudgetCount).toBeGreaterThan(0);
    await page.screenshot({ path: "tests/ui-screenshots/budget-over-budget.png" });
  });

  test("budget label gets 'over' class when spending exceeds 600", async ({ page }) => {
    await openSetup(page);
    // Select overcharge ERS (230cr) + f1_spec gearbox (180cr) + custom_formula fuel (200cr) = 610
    await page.locator(".cs-chip").filter({ hasText: /^Overcharge$/ }).first().click();
    await page.waitForTimeout(100);
    await page.locator(".cs-chip").filter({ hasText: /^F1 Spec$/ }).first().click();
    await page.waitForTimeout(100);
    await page.locator(".cs-chip").filter({ hasText: /^Custom Formula$/ }).first().click();
    await page.waitForTimeout(200);
    const cls = await page.locator("#cs-budget").getAttribute("class");
    expect(cls).toContain("over");
    await page.screenshot({ path: "tests/ui-screenshots/budget-exceeded.png" });
  });
});

test.describe("Budget system — unlimited toggle", () => {
  test("unlimited button shows FREE BUILD text initially", async ({ page }) => {
    await openSetup(page);
    const text = await page.locator("#cs-unlimited").textContent();
    expect(text).toContain("FREE BUILD");
    expect(text).not.toContain("ON");
  });

  test("clicking unlimited button enables FREE BUILD mode", async ({ page }) => {
    await openSetup(page);
    await page.locator("#cs-unlimited").click();
    await page.waitForTimeout(200);
    const budgetText = await page.locator("#cs-budget").textContent();
    expect(budgetText).toContain("no budget limit");
    await page.screenshot({ path: "tests/ui-screenshots/budget-unlimited-on.png" });
  });

  test("unlimited mode hides budget fill bar", async ({ page }) => {
    await openSetup(page);
    await page.locator("#cs-unlimited").click();
    await page.waitForTimeout(200);
    const transform = await page.locator("#cs-budget-fill").evaluate((el) =>
      (el as HTMLElement).style.transform
    );
    expect(transform).toContain("scaleX(0)");
  });

  test("unlimited button gets 'on' class when active", async ({ page }) => {
    await openSetup(page);
    await page.locator("#cs-unlimited").click();
    await page.waitForTimeout(200);
    const cls = await page.locator("#cs-unlimited").getAttribute("class");
    expect(cls).toContain("on");
  });

  test("unlimited mode removes over-budget chip classes", async ({ page }) => {
    await openSetup(page);
    // First fill up the budget so something is over-budget
    await page.locator(".cs-chip").filter({ hasText: /^Overcharge$/ }).first().click();
    await page.locator(".cs-chip").filter({ hasText: /^F1 Spec$/ }).first().click();
    await page.locator(".cs-chip").filter({ hasText: /^Custom Formula$/ }).first().click();
    await page.waitForTimeout(100);
    // Now enable unlimited
    await page.locator("#cs-unlimited").click();
    await page.waitForTimeout(200);
    const overBudgetCount = await page.locator(".cs-chip.over-budget").count();
    expect(overBudgetCount).toBe(0);
    await page.screenshot({ path: "tests/ui-screenshots/budget-unlimited-no-over.png" });
  });

  test("unlimited state persists after page reload", async ({ page }) => {
    await openSetup(page);
    await page.locator("#cs-unlimited").click();
    await page.waitForTimeout(200);
    // Reload page and re-open setup
    await page.reload();
    await waitReady(page);
    await page.locator("#mb-race").click();
    await page.locator("#select").waitFor({ state: "visible" });
    await page.locator("#sel-setup").click();
    await page.locator("#carsetup").waitFor({ state: "visible" });
    const budgetText = await page.locator("#cs-budget").textContent();
    expect(budgetText).toContain("no budget limit");
    await page.screenshot({ path: "tests/ui-screenshots/budget-unlimited-persisted.png" });
  });

  test("toggling unlimited OFF restores normal budget display", async ({ page }) => {
    await openSetup(page);
    await page.locator("#cs-unlimited").click(); // ON
    await page.waitForTimeout(100);
    await page.locator("#cs-unlimited").click(); // OFF
    await page.waitForTimeout(200);
    const budgetText = await page.locator("#cs-budget").textContent();
    expect(budgetText).toContain("600");
    const cls = await page.locator("#cs-unlimited").getAttribute("class");
    expect(cls).not.toContain(" on");
  });
});
