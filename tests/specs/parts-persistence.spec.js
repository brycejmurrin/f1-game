// @ts-check
// Tests for car setup part selection persistence:
// - Selected parts are saved to localStorage under "apex26.parts.<teamId>"
// - Parts survive a full page reload
// - Different teams have independent setup storage
// - DONE button returns to the select screen
// - Selecting a new part updates localStorage immediately
import { test, expect } from "@playwright/test";
import { galleryPath } from "../helpers/output-paths.js";

const LANDSCAPE = { width: 844, height: 390 };

async function waitReady(page) {
  await page.waitForFunction(() => window.__apex && window.__apex.race, null, { polling: 100, timeout: 10_000 });
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
  await page.locator("#sel-go").click();
  await page.locator("#carsetup").waitFor({ state: "visible" });
}

async function pickOpt(page, catId, optId) {
  await page.locator(`#cs-tabs [data-cs-cat="${catId}"]`).click();
  await page.locator(`#cs-options [data-cs-opt="${optId}"]`).click();
}

async function reopenSetup(page) {
  await page.locator("#mb-race").click();
  await page.locator("#select").waitFor({ state: "visible" });
  await page.locator("#sel-go").click();
  await page.locator("#carsetup").waitFor({ state: "visible" });
}

test.describe("Parts persistence — localStorage writes", () => {
  test.use({ viewport: LANDSCAPE });

  test("selecting a gearbox part saves it to localStorage", async ({ page }) => {
    await page.goto("/");
    await waitReady(page);
    await openSetup(page);

    const teamId = await getTeamId(page);
    await pickOpt(page, "gearbox", "sequential_pro");

    const stored = await getStoredParts(page, teamId);
    expect(stored?.gearbox).toBe("sequential_pro");
  });

  test("selecting a fuel part saves it to localStorage", async ({ page }) => {
    await page.goto("/");
    await waitReady(page);
    await openSetup(page);

    const teamId = await getTeamId(page);
    await pickOpt(page, "fuel", "race_blend");

    const stored = await getStoredParts(page, teamId);
    expect(stored?.fuel).toBe("race_blend");
  });

  test("multiple categories save independently", async ({ page }) => {
    await page.goto("/");
    await waitReady(page);
    await openSetup(page);

    const teamId = await getTeamId(page);
    await pickOpt(page, "gearbox", "close_ratio");
    await pickOpt(page, "fuel", "high_octane");

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

    await pickOpt(page, "gearbox", "carbon_case");

    await page.reload();
    await waitReady(page);
    await reopenSetup(page);

    await page.locator('#cs-tabs [data-cs-cat="gearbox"]').click();
    await expect(page.locator('#cs-options [data-cs-opt="carbon_case"]')).toHaveClass(/active/);
    await page.screenshot({ path: galleryPath("parts-persistence", "persistence-gearbox-reload.png") });
  });

  test("selected fuel part active after reload", async ({ page }) => {
    await page.goto("/");
    await waitReady(page);
    await openSetup(page);

    await pickOpt(page, "fuel", "quali_mix");

    await page.reload();
    await waitReady(page);
    await reopenSetup(page);

    await page.locator('#cs-tabs [data-cs-cat="fuel"]').click();
    await expect(page.locator('#cs-options [data-cs-opt="quali_mix"]')).toHaveClass(/active/);
    await page.screenshot({ path: galleryPath("parts-persistence", "persistence-fuel-reload.png") });
  });

  test("budget reflects saved parts after reload", async ({ page }) => {
    await page.goto("/");
    await waitReady(page);
    await openSetup(page);

    await pickOpt(page, "engine", "race");

    await page.reload();
    await waitReady(page);
    await reopenSetup(page);

    // From the catalog, not a literal. This said "440" (780 - 160) and the
    // ladder re-space repriced `engine/race` to 145 — a spec that goes red
    // because a part got cheaper is measuring the price, not the persistence
    // it is named for.
    const left = await page.evaluate(() => Parts.BUDGET -
      Parts.CATALOG.find((c) => c.id === "engine").options.find((o) => o.id === "race").cost);
    const budgetText = await page.locator("#cs-budget").textContent();
    expect(budgetText).toContain(String(left));
  });
});

test.describe("Parts persistence — team isolation", () => {
  test.use({ viewport: LANDSCAPE });

  test("different teams have independent part storage", async ({ page }) => {
    await page.goto("/");
    await waitReady(page);

    await openSetup(page);
    await pickOpt(page, "gearbox", "f1_spec");
    await page.locator("#cs-done").click();
    // DONE carries on to the race settings — the garage is a step on the way
    // to a race now, not a side door off the circuit picker.
    await page.locator("#race-settings").waitFor({ state: "visible" });

    await page.evaluate(() => {
      const idx = Teams.LIST.findIndex((t) => t.id !== Teams.LIST[parseInt(localStorage.getItem("apex26.team") ?? "2")].id);
      if (idx >= 0) { localStorage.setItem("apex26.team", String(idx)); }
    });
    await page.reload();
    await waitReady(page);

    await reopenSetup(page);

    await page.locator('#cs-tabs [data-cs-cat="gearbox"]').click();
    await expect(page.locator('#cs-options [data-cs-opt="standard"]')).toHaveClass(/active/);
  });
});

test.describe("Parts persistence — navigation", () => {
  test.use({ viewport: LANDSCAPE });

  test("DONE button closes setup and returns to select screen", async ({ page }) => {
    await page.goto("/");
    await waitReady(page);
    await openSetup(page);

    await page.locator("#cs-done").click();
    // DONE carries on to the race settings — the garage is a step on the way
    // to a race now, not a side door off the circuit picker.
    await page.locator("#race-settings").waitFor({ state: "visible" });
    await expect(page.locator("#carsetup")).toBeHidden();
    await page.screenshot({ path: galleryPath("parts-persistence", "persistence-done-button.png") });
  });
});
