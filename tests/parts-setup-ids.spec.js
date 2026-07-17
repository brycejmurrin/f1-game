// @ts-check
// Stable setup DOM identifiers — category tabs and option rows expose
// data-cs-cat / data-cs-opt so tests do not depend on presentation text/classes.
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
}

test.describe("Car setup — stable DOM identifiers", () => {
  test.use({ viewport: LANDSCAPE });

  test("every parts category tab has data-cs-cat matching its catalog id", async ({ page }) => {
    await page.goto("/");
    await waitReady(page);
    await openSetup(page);

    const ids = await page.evaluate(() => Parts.CATALOG.map((c) => c.id));
    for (const id of ids) {
      await expect(page.locator(`#cs-tabs [data-cs-cat="${id}"]`)).toHaveCount(1);
    }
    await expect(page.locator('#cs-tabs [data-cs-cat="livery"]')).toHaveCount(1);
  });

  test("active category options expose data-cs-opt matching option ids", async ({ page }) => {
    await page.goto("/");
    await waitReady(page);
    await openSetup(page);

    await page.locator('#cs-tabs [data-cs-cat="gearbox"]').click();
    const optIds = await page.evaluate(() => {
      const cat = Parts.CATALOG.find((c) => c.id === "gearbox");
      const team = Teams.LIST[parseInt(localStorage.getItem("apex26.team") ?? "2")];
      return cat.options.filter((option) => Parts.isOptionAvailable(option, team)).map((option) => option.id);
    });
    for (const id of optIds) {
      await expect(page.locator(`#cs-options [data-cs-opt="${id}"]`)).toHaveCount(1);
    }
  });

  test("selecting by data-cs-opt activates that option", async ({ page }) => {
    await page.goto("/");
    await waitReady(page);
    await openSetup(page);

    await page.locator('#cs-tabs [data-cs-cat="fuel"]').click();
    await page.locator('#cs-options [data-cs-opt="high_octane"]').click();
    await expect(page.locator('#cs-options [data-cs-opt="high_octane"]')).toHaveClass(/active/);
  });
});
