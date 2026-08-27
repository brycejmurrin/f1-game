// @ts-check
// Tests for car setup budget system:
// - Budget display at 600cr default
// - Budget decrements on part selection
// - Over-budget parts show visual warning and can't be selected (without unlimited)
// - Unlimited toggle removes cap and persists via localStorage
import { test, expect } from "@playwright/test";
import { galleryPath } from "../helpers/output-paths.js";

async function waitReady(page) {
  await page.waitForFunction(() => window.__apex && window.__apex.race, null, { polling: 100, timeout: 10_000 });
}

async function pickOpt(page, catId, optId) {
  await page.locator(`#cs-tabs [data-cs-cat="${catId}"]`).click();
  await page.locator(`#cs-options [data-cs-opt="${optId}"]`).click();
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
  await page.locator("#sel-go").click();
  await page.locator("#carsetup").waitFor({ state: "visible" });
}

test.describe("Budget system — display", () => {
  test("shows full 600 cr at all defaults", async ({ page }) => {
    await openSetup(page);
    const text = await page.locator("#cs-budget").textContent();
    expect(text).toContain("600");
    // Nothing is spent at defaults, so remaining equals the cap (setup-ui.js
    // renders "BUDGET: <remaining> / <cap> cr remaining").
    expect(text).toContain("600 / 600 cr remaining");
    await page.screenshot({ path: galleryPath("parts-budget", "budget-default.png") });
  });

  test("budget label has no 'over' class at defaults", async ({ page }) => {
    await openSetup(page);
    const cls = await page.locator("#cs-budget").getAttribute("class");
    expect(cls ?? "").not.toContain("over");
  });

  test("budget bar fill is zero at all defaults", async ({ page }) => {
    await openSetup(page);
    const transform = await page.locator("#cs-budget-fill").evaluate((el) =>
      el.style.transform
    );
    expect(transform).toContain("scaleX(0)");
  });
});

test.describe("Budget system — part selection", () => {
  test("selecting race engine (160cr) reduces budget to 440", async ({ page }) => {
    await openSetup(page);
    await pickOpt(page, "engine", "race");
    const text = await page.locator("#cs-budget").textContent();
    expect(text).toContain("440");
    await page.screenshot({ path: galleryPath("parts-budget", "budget-race-engine.png") });
  });

  test("budget fill bar increases after selecting a paid part", async ({ page }) => {
    await openSetup(page);
    await pickOpt(page, "engine", "race");
    const transform = await page.locator("#cs-budget-fill").evaluate((el) =>
      el.style.transform
    );
    // 160/600 ≈ 0.267 — must be a scaleX > 0
    expect(transform).toMatch(/scaleX\(0\.[1-9]/);
  });

  test("parts that exceed budget show over-budget class", async ({ page }) => {
    await openSetup(page);
    // Spend 450cr: Overcharge ERS (230) + F1 Spec gearbox (180) + High Octane fuel (40)
    // — with 150cr remaining, expensive options like Race engine (160cr) become over-budget
    await pickOpt(page, "ers", "overcharge");
    await pickOpt(page, "gearbox", "f1_spec");
    await pickOpt(page, "fuel", "high_octane");
    // Switch to engine so over-budget options are visible in #cs-options
    await page.locator('#cs-tabs [data-cs-cat="engine"]').click();
    const overBudgetCount = await page.locator("#cs-options .cs-opt.over-budget").count();
    expect(overBudgetCount).toBeGreaterThan(0);
    await page.screenshot({ path: galleryPath("parts-budget", "budget-over-budget.png") });
  });

  test("budget label gets 'over' class when spending exceeds 600", async ({ page }) => {
    await openSetup(page);
    // Use unlimited mode to select a combo totalling 610cr, then disable to reveal "over" state
    await page.locator("#cs-unlimited").click();
    await pickOpt(page, "ers", "overcharge");
    await pickOpt(page, "gearbox", "f1_spec");
    await pickOpt(page, "fuel", "custom_formula");
    // Disable unlimited — 610cr > 600 so budget label becomes "over"
    await page.locator("#cs-unlimited").click();
    const cls = await page.locator("#cs-budget").getAttribute("class");
    expect(cls).toContain("over");
    await page.screenshot({ path: galleryPath("parts-budget", "budget-exceeded.png") });
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
    const budgetText = await page.locator("#cs-budget").textContent();
    expect(budgetText).toContain("no budget limit");
    await page.screenshot({ path: galleryPath("parts-budget", "budget-unlimited-on.png") });
  });

  test("unlimited mode hides budget fill bar", async ({ page }) => {
    await openSetup(page);
    await page.locator("#cs-unlimited").click();
    const transform = await page.locator("#cs-budget-fill").evaluate((el) =>
      el.style.transform
    );
    expect(transform).toContain("scaleX(0)");
  });

  test("unlimited button gets 'on' class when active", async ({ page }) => {
    await openSetup(page);
    await page.locator("#cs-unlimited").click();
    const cls = await page.locator("#cs-unlimited").getAttribute("class");
    expect(cls).toContain("on");
  });

  test("unlimited mode removes over-budget option classes", async ({ page }) => {
    await openSetup(page);
    // First fill up the budget so something is over-budget
    await pickOpt(page, "ers", "overcharge");
    await pickOpt(page, "gearbox", "f1_spec");
    await pickOpt(page, "fuel", "custom_formula");
    // Now enable unlimited
    await page.locator("#cs-unlimited").click();
    await page.locator('#cs-tabs [data-cs-cat="engine"]').click();
    const overBudgetCount = await page.locator("#cs-options .cs-opt.over-budget").count();
    expect(overBudgetCount).toBe(0);
    await page.screenshot({ path: galleryPath("parts-budget", "budget-unlimited-no-over.png") });
  });

  test("unlimited state persists after page reload", async ({ page }) => {
    await openSetup(page);
    await page.locator("#cs-unlimited").click();
    // Reload page and re-open setup
    await page.reload();
    await waitReady(page);
    await page.locator("#mb-race").click();
    await page.locator("#select").waitFor({ state: "visible" });
    await page.locator("#sel-go").click();
    await page.locator("#carsetup").waitFor({ state: "visible" });
    const budgetText = await page.locator("#cs-budget").textContent();
    expect(budgetText).toContain("no budget limit");
    await page.screenshot({ path: galleryPath("parts-budget", "budget-unlimited-persisted.png") });
  });

  test("toggling unlimited OFF restores normal budget display", async ({ page }) => {
    await openSetup(page);
    await page.locator("#cs-unlimited").click(); // ON
    await page.locator("#cs-unlimited").click(); // OFF
    const budgetText = await page.locator("#cs-budget").textContent();
    expect(budgetText).toContain("600");
    const cls = await page.locator("#cs-unlimited").getAttribute("class");
    expect(cls).not.toContain(" on");
  });
});
