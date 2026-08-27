// @ts-check
// Tests for car setup UI catalog rendering:
// - All 12 categories appear as tabs in the setup panel
// - GEARBOX and FUEL options are visible and selectable via the active tab
// - Factory/supplier-exclusive parts only appear for the matching team engine
// - Part descriptions update when an option is selected
import { test, expect } from "@playwright/test";
import { galleryPath } from "../helpers/output-paths.js";

const LANDSCAPE = { width: 844, height: 390 };

async function waitReady(page) {
  await page.waitForFunction(() => window.__apex && window.__apex.race, null, { polling: 100, timeout: 10_000 });
}

async function openSetup(page) {
  await page.evaluate(() => {
    const team = Teams.LIST[parseInt(localStorage.getItem("apex26.team") ?? "2")];
    if (team) localStorage.removeItem("apex26.parts." + team.id);
    localStorage.removeItem("apex26.unlimitedBudget");
  });
  await page.locator("#mb-race").click();
  await page.locator("#select").waitFor({ state: "visible" });
  await page.locator("#sel-go").click();
  await page.locator("#carsetup").waitFor({ state: "visible" });
}

async function openCat(page, catId) {
  await page.locator(`#cs-tabs [data-cs-cat="${catId}"]`).click();
}

function opt(page, optId) {
  return page.locator(`#cs-options [data-cs-opt="${optId}"]`);
}

test.describe("Car setup catalog — all categories render", () => {
  test.use({ viewport: LANDSCAPE });

  test("all 12 category labels are visible", async ({ page }) => {
    await page.goto("/");
    await waitReady(page);
    await openSetup(page);

    for (const id of ["engine", "aero", "suspension", "brakes", "tyres", "ers",
                      "gearbox", "fuel", "exhaust", "floor", "cockpit", "wheels"]) {
      await expect(page.locator(`#cs-tabs [data-cs-cat="${id}"]`)).toBeVisible();
    }
    await page.screenshot({ path: galleryPath("parts-catalog", "catalog-all-categories.png") });
  });

  test("GEARBOX section contains Standard and F1 Spec options", async ({ page }) => {
    await page.goto("/");
    await waitReady(page);
    await openSetup(page);

    await openCat(page, "gearbox");
    await expect(opt(page, "standard")).toBeVisible();
    await expect(opt(page, "f1_spec")).toBeVisible();
  });

  test("FUEL section contains Standard and Qualifying Mix options", async ({ page }) => {
    await page.goto("/");
    await waitReady(page);
    await openSetup(page);

    await openCat(page, "fuel");
    await expect(opt(page, "standard")).toBeVisible();
    await expect(opt(page, "quali_mix")).toBeVisible();
  });

  test("ENGINE section has at least 6 options visible for non-factory team", async ({ page }) => {
    await page.goto("/");
    await waitReady(page);
    await openSetup(page);

    await openCat(page, "engine");
    const chipCount = await page.locator("#cs-options .cs-opt").count();
    expect(chipCount).toBeGreaterThanOrEqual(6);
  });
});

test.describe("Car setup catalog — option interaction", () => {
  test.use({ viewport: LANDSCAPE });

  test("GEARBOX Standard option is active by default", async ({ page }) => {
    await page.goto("/");
    await waitReady(page);
    await openSetup(page);

    await openCat(page, "gearbox");
    await expect(opt(page, "standard")).toHaveClass(/active/);
  });

  test("FUEL Standard option is active by default", async ({ page }) => {
    await page.goto("/");
    await waitReady(page);
    await openSetup(page);

    await openCat(page, "fuel");
    await expect(opt(page, "standard")).toHaveClass(/active/);
  });

  test("clicking Close Ratio gearbox makes it active", async ({ page }) => {
    await page.goto("/");
    await waitReady(page);
    await openSetup(page);

    await openCat(page, "gearbox");
    await opt(page, "close_ratio").click();
    await expect(opt(page, "close_ratio")).toHaveClass(/active/);
    await page.screenshot({ path: galleryPath("parts-catalog", "catalog-gearbox-close-ratio.png") });
  });

  test("clicking High Octane fuel makes it active", async ({ page }) => {
    await page.goto("/");
    await waitReady(page);
    await openSetup(page);

    await openCat(page, "fuel");
    await opt(page, "high_octane").click();
    await expect(opt(page, "high_octane")).toHaveClass(/active/);
    await page.screenshot({ path: galleryPath("parts-catalog", "catalog-fuel-high-octane.png") });
  });

  test("description updates when an option is selected", async ({ page }) => {
    await page.goto("/");
    await waitReady(page);
    await openSetup(page);

    await openCat(page, "fuel");
    await opt(page, "race_blend").click();
    const desc = await page.locator("#cs-options .cs-opt.active .cs-opt-desc").textContent();
    expect(desc).toContain("energy density");
  });

  test("GEARBOX Sequential Pro option has a cost badge", async ({ page }) => {
    await page.goto("/");
    await waitReady(page);
    await openSetup(page);

    await openCat(page, "gearbox");
    const seqPro = opt(page, "sequential_pro");
    await expect(seqPro.locator(".cs-opt-cost")).toBeVisible();
    const cost = await seqPro.locator(".cs-opt-cost").textContent();
    expect(cost).toMatch(/90/);
  });
});

test.describe("Car setup catalog — factory/supplier parts", () => {
  test.use({ viewport: LANDSCAPE });

  test("AMG HPP option visible when team is Mercedes", async ({ page }) => {
    await page.goto("/");
    await waitReady(page);
    await page.evaluate(() => {
      const idx = Teams.LIST.findIndex((t) => t.engine === "Mercedes" && t.id === "mercedes");
      if (idx >= 0) { localStorage.setItem("apex26.team", String(idx)); }
    });
    await page.reload();
    await waitReady(page);
    await openSetup(page);
    await openCat(page, "engine");
    await expect(opt(page, "manu_mercedes")).toBeVisible();
    await page.screenshot({ path: galleryPath("parts-catalog", "catalog-mercedes-factory.png") });
  });

  test("AMG HPP option NOT visible when team is not Mercedes", async ({ page }) => {
    await page.goto("/");
    await waitReady(page);
    await page.evaluate(() => {
      const idx = Teams.LIST.findIndex((t) => t.engine === "Red Bull Ford");
      if (idx >= 0) { localStorage.setItem("apex26.team", String(idx)); }
    });
    await page.reload();
    await waitReady(page);
    await openSetup(page);
    await openCat(page, "engine");
    await expect(opt(page, "manu_mercedes")).toHaveCount(0);
    await page.screenshot({ path: galleryPath("parts-catalog", "catalog-non-mercedes.png") });
  });

  test("factory option has FACTORY tag badge", async ({ page }) => {
    await page.goto("/");
    await waitReady(page);
    await page.evaluate(() => {
      const idx = Teams.LIST.findIndex((t) => t.engine === "Mercedes" && t.id === "mercedes");
      if (idx >= 0) { localStorage.setItem("apex26.team", String(idx)); }
    });
    await page.reload();
    await waitReady(page);
    await openSetup(page);
    await openCat(page, "engine");
    await expect(opt(page, "manu_mercedes").locator(".cs-opt-tag")).toContainText("FACTORY");
  });

  test("unrestricted options have UNIVERSAL badges", async ({ page }) => {
    await page.goto("/");
    await waitReady(page);
    await openSetup(page);
    await openCat(page, "engine");
    await expect(opt(page, "stock").locator(".cs-opt-tag")).toContainText("UNIVERSAL");
  });

  test("team signatures are visible only to their eligible team", async ({ page }) => {
    await page.goto("/");
    await waitReady(page);
    await page.evaluate(() => {
      const idx = Teams.LIST.findIndex((team) => team.id === "mclaren");
      localStorage.setItem("apex26.team", String(idx));
    });
    await page.reload();
    await waitReady(page);
    await openSetup(page);
    await openCat(page, "aero");
    await expect(opt(page, "sig_mclaren_flex").locator(".cs-opt-tag")).toContainText("SIGNATURE");

    await page.locator("#cs-done").click();
    await page.evaluate(() => {
      const idx = Teams.LIST.findIndex((team) => team.id === "mercedes");
      localStorage.setItem("apex26.team", String(idx));
    });
    await page.reload();
    await waitReady(page);
    await openSetup(page);
    await openCat(page, "aero");
    await expect(opt(page, "sig_mclaren_flex")).toHaveCount(0);
  });
});

test.describe("Car setup catalog — screenshots", () => {
  test.use({ viewport: { width: 390, height: 844 } }); // portrait

  test("portrait setup screenshot", async ({ page }) => {
    await page.goto("/");
    await waitReady(page);
    await openSetup(page);
    await page.screenshot({ path: galleryPath("parts-catalog", "catalog-portrait.png") });
  });
});
