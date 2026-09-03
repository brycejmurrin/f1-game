// @ts-check
// Tests for car setup UI catalog rendering:
// - All 12 categories appear as tabs in the setup panel
// - GEARBOX and FUEL options are visible and selectable via the active tab
// - Factory/supplier-exclusive parts only appear for the matching team engine
// - Part descriptions update when an option is selected
//
// ONE BOOT PER WORKER (sharedTest): 19 boots (14 goto + 5 team-switch reloads)
// became none. openSetup() walks back to the title, pins the team through the
// store AND the #mb-race handler that copies it into the game (the team-switch
// tests used to seed localStorage and reload for exactly that), forgets the
// fitted parts, and comes in through START. UNVERIFIED IN A BROWSER at
// conversion time — tests/helpers/shared-page.js has the mechanics.
import { sharedTest as test, expect } from "../helpers/fixtures.js";
import { galleryPath } from "../helpers/output-paths.js";
import { toMenu, forgetStored, pinFreePlay, freeBuildOff } from "../helpers/shared-page.js";

const LANDSCAPE = { width: 844, height: 390 };

// `team` is a Teams.LIST id or index; the default is the game's own (McLaren).
async function openSetup(page, team = "mclaren") {
  await toMenu(page);
  await forgetStored(page, ["unlimitedBudget"]);
  // The store write; #mb-race below re-reads it (restoreFreePlaySelection) and
  // the team's fitted parts are forgotten with it.
  await pinFreePlay(page, { team, click: false });
  await page.locator("#mb-race").click();
  await page.locator("#select").waitFor({ state: "visible" });
  await page.locator("#sel-car").click();
  await page.locator("#carsetup").waitFor({ state: "visible" });
  await freeBuildOff(page);              // the in-memory flag, not just the key
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
    await openSetup(page);

    for (const id of ["engine", "aero", "suspension", "brakes", "tyres", "ers",
                      "gearbox", "fuel", "exhaust", "floor", "cockpit", "wheels"]) {
      await expect(page.locator(`#cs-tabs [data-cs-cat="${id}"]`)).toBeVisible();
    }
    await page.screenshot({ path: galleryPath("parts-catalog", "catalog-all-categories.png") });
  });

  test("GEARBOX section contains Standard and F1 Spec options", async ({ page }) => {
    await openSetup(page);

    await openCat(page, "gearbox");
    await expect(opt(page, "standard")).toBeVisible();
    await expect(opt(page, "f1_spec")).toBeVisible();
  });

  test("FUEL section contains Standard and Qualifying Mix options", async ({ page }) => {
    await openSetup(page);

    await openCat(page, "fuel");
    await expect(opt(page, "standard")).toBeVisible();
    await expect(opt(page, "quali_mix")).toBeVisible();
  });

  test("ENGINE section has at least 6 options visible for non-factory team", async ({ page }) => {
    await openSetup(page);

    await openCat(page, "engine");
    const chipCount = await page.locator("#cs-options .cs-opt").count();
    expect(chipCount).toBeGreaterThanOrEqual(6);
  });
});

test.describe("Car setup catalog — option interaction", () => {
  test.use({ viewport: LANDSCAPE });

  test("GEARBOX Standard option is active by default", async ({ page }) => {
    await openSetup(page);

    await openCat(page, "gearbox");
    await expect(opt(page, "standard")).toHaveClass(/active/);
  });

  test("FUEL Standard option is active by default", async ({ page }) => {
    await openSetup(page);

    await openCat(page, "fuel");
    await expect(opt(page, "standard")).toHaveClass(/active/);
  });

  test("clicking Close Ratio gearbox makes it active", async ({ page }) => {
    await openSetup(page);

    await openCat(page, "gearbox");
    await opt(page, "close_ratio").click();
    await expect(opt(page, "close_ratio")).toHaveClass(/active/);
    await page.screenshot({ path: galleryPath("parts-catalog", "catalog-gearbox-close-ratio.png") });
  });

  test("clicking High Octane fuel makes it active", async ({ page }) => {
    await openSetup(page);

    await openCat(page, "fuel");
    await opt(page, "high_octane").click();
    await expect(opt(page, "high_octane")).toHaveClass(/active/);
    await page.screenshot({ path: galleryPath("parts-catalog", "catalog-fuel-high-octane.png") });
  });

  test("description updates when an option is selected", async ({ page }) => {
    await openSetup(page);

    await openCat(page, "fuel");
    await opt(page, "race_blend").click();
    const desc = await page.locator("#cs-options .cs-opt.active .cs-opt-desc").textContent();
    expect(desc).toContain("energy density");
  });

  test("GEARBOX Sequential Pro option has a cost badge", async ({ page }) => {
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
    await openSetup(page, "mercedes");
    await openCat(page, "engine");
    await expect(opt(page, "manu_mercedes")).toBeVisible();
    await page.screenshot({ path: galleryPath("parts-catalog", "catalog-mercedes-factory.png") });
  });

  test("AMG HPP option NOT visible when team is not Mercedes", async ({ page }) => {
    // The first team on the Red Bull Ford unit, as the old seed picked it.
    const idx = await page.evaluate(() => Teams.LIST.findIndex((t) => t.engine === "Red Bull Ford"));
    await openSetup(page, idx);
    await openCat(page, "engine");
    await expect(opt(page, "manu_mercedes")).toHaveCount(0);
    await page.screenshot({ path: galleryPath("parts-catalog", "catalog-non-mercedes.png") });
  });

  test("factory option has FACTORY tag badge", async ({ page }) => {
    await openSetup(page, "mercedes");
    await openCat(page, "engine");
    await expect(opt(page, "manu_mercedes").locator(".cs-opt-tag")).toContainText("FACTORY");
  });

  test("unrestricted options have UNIVERSAL badges", async ({ page }) => {
    await openSetup(page);
    await openCat(page, "engine");
    await expect(opt(page, "stock").locator(".cs-opt-tag")).toContainText("UNIVERSAL");
  });

  test("team signatures are visible only to their eligible team", async ({ page }) => {
    await openSetup(page, "mclaren");
    await openCat(page, "aero");
    await expect(opt(page, "sig_mclaren_flex").locator(".cs-opt-tag")).toContainText("SIGNATURE");

    // DONE goes on to race settings; openSetup walks back from there and
    // re-enters as Mercedes (the reload this replaced only existed to make the
    // stored team the live one).
    await page.locator("#cs-done").click();
    await openSetup(page, "mercedes");
    await openCat(page, "aero");
    await expect(opt(page, "sig_mclaren_flex")).toHaveCount(0);
  });
});

test.describe("Car setup catalog — screenshots", () => {
  test.use({ viewport: { width: 390, height: 844 } }); // portrait

  test("portrait setup screenshot", async ({ page }) => {
    await openSetup(page);
    await page.screenshot({ path: galleryPath("parts-catalog", "catalog-portrait.png") });
  });
});
