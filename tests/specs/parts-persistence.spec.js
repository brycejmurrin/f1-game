// @ts-check
// Tests for car setup part selection persistence:
// - Selected parts are saved to localStorage under "apex26.parts.<teamId>"
// - Parts survive a full page reload
// - Different teams have independent setup storage
// - DONE button returns to the select screen
// - Selecting a new part updates localStorage immediately
//
// ONE BOOT PER WORKER (sharedTest): 13 boots (9 goto + 4 reloads) became 3.
// The three "survives page reload" tests KEEP their reload — the reload is the
// claim — and reload the shared page, which is still the live game afterwards.
// The team-isolation test's reload was only there to make a stored team the
// live one, which pinFreePlay + #mb-race now does in place. openSetup() walks
// back to the title first and starts from forgotten parts, as clearState on a
// fresh page did. UNVERIFIED IN A BROWSER at conversion time.
import { sharedTest as test, expect, BOOT_MS } from "../helpers/fixtures.js";
import { galleryPath } from "../helpers/output-paths.js";
import { toMenu, forgetStored, pinFreePlay, freeBuildOff } from "../helpers/shared-page.js";

const LANDSCAPE = { width: 844, height: 390 };

async function waitReady(page) {
  // BOOT_MS, not a hand-rolled 10 s: a SwiftShader boot here measures 11-33 s (2026-09-01).
  await page.waitForFunction(() => window.__apex && window.__apex.race, null, { polling: 100, timeout: BOOT_MS });
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

// The default car with nothing fitted, and FREE BUILD off — what a fresh page
// gave, re-established on the live one. `team` is an id or a Teams.LIST index.
async function openSetup(page, team = "mclaren") {
  await toMenu(page);
  await forgetStored(page, ["unlimitedBudget"]);
  await pinFreePlay(page, { team, click: false });   // #mb-race re-reads the store
  await page.locator("#mb-race").click();
  await page.locator("#select").waitFor({ state: "visible" });
  await page.locator("#sel-go").click();
  await page.locator("#carsetup").waitFor({ state: "visible" });
  await freeBuildOff(page);
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
    await openSetup(page);

    const teamId = await getTeamId(page);
    await pickOpt(page, "gearbox", "sequential_pro");

    const stored = await getStoredParts(page, teamId);
    expect(stored?.gearbox).toBe("sequential_pro");
  });

  test("selecting a fuel part saves it to localStorage", async ({ page }) => {
    await openSetup(page);

    const teamId = await getTeamId(page);
    await pickOpt(page, "fuel", "race_blend");

    const stored = await getStoredParts(page, teamId);
    expect(stored?.fuel).toBe("race_blend");
  });

  test("multiple categories save independently", async ({ page }) => {
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
    await openSetup(page);
    await pickOpt(page, "gearbox", "f1_spec");
    await page.locator("#cs-done").click();
    // DONE carries on to the race settings — the garage is a step on the way
    // to a race now, not a side door off the circuit picker.
    await page.locator("#race-settings").waitFor({ state: "visible" });

    // Any OTHER team, made the live one. The reload this replaced existed only
    // so the boot would read the new team index; pinFreePlay writes the store
    // and #mb-race (in reopenSetup) re-reads it. Its own parts are forgotten
    // with it — which is the isolation under test, on a page that may have
    // fitted that team's gearbox in an earlier test.
    const other = await page.evaluate(() =>
      Teams.LIST.findIndex((t) => t.id !== Teams.LIST[parseInt(localStorage.getItem("apex26.team") ?? "2")].id));
    await toMenu(page);
    await pinFreePlay(page, { team: other, click: false });

    await reopenSetup(page);

    await page.locator('#cs-tabs [data-cs-cat="gearbox"]').click();
    await expect(page.locator('#cs-options [data-cs-opt="standard"]')).toHaveClass(/active/);
  });
});

test.describe("Parts persistence — navigation", () => {
  test.use({ viewport: LANDSCAPE });

  test("DONE button closes setup and returns to select screen", async ({ page }) => {
    await openSetup(page);

    await page.locator("#cs-done").click();
    // DONE carries on to the race settings — the garage is a step on the way
    // to a race now, not a side door off the circuit picker.
    await page.locator("#race-settings").waitFor({ state: "visible" });
    await expect(page.locator("#carsetup")).toBeHidden();
    await page.screenshot({ path: galleryPath("parts-persistence", "persistence-done-button.png") });
  });
});
