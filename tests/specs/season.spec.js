// @ts-check
// Season mode: round progression, points accumulation, standings panel visibility.
import { test, expect } from "@playwright/test";
import { BOOT_MS } from "../helpers/fixtures.js";

const LANDSCAPE = { width: 844, height: 390 };

async function startSeasonRace(page, laps) {
  await page.goto("/");
  // BOOT_MS, not a hand-rolled 8 s: a SwiftShader boot here measures 11-33 s (2026-09-01).
  await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
  // Nothing below asserts a pixel — this spec is about round progression, points
  // and panel visibility — so stop drawing the 3D scene that sits behind every
  // menu. Under SwiftShader that is pure CPU: it halves the load average of a
  // two-worker run. headlessMode is a plain flag gating render(), settable from
  // the title screen; physics, DOM and every hook below behave identically.
  await page.evaluate(() => window.__apex.headless(true));
  await page.locator("#mb-season").click();
  // SELECT no longer leads straight to RACE SETTINGS: a season weekend goes
  // through the GARAGE first (team, parts, livery), and RACE! only exists on the
  // sheet after it. This helper missed that when the step was added — the
  // migration test lower down was updated and this was not — so every test using
  // it sat on #rs-go for 209 retries and died at the 120 s timeout, reporting
  // "element is not visible" about a button on a screen that had not opened yet.
  await page.locator("#sel-go").click();
  await page.locator("#carsetup").waitFor({ state: "visible" });
  await page.locator("#cs-done").click();
  await page.locator("#carsetup").waitFor({ state: "hidden" });
  await page.locator("#race-settings").waitFor({ state: "visible" });
  if (laps != null) {
    await page.locator("#rs-laps .sel-chip").filter({ hasText: new RegExp(`^${laps}(?: \\(FULL\\))?$`) }).click();
  }
  // Accept race settings. A championship weekend now opens with QUALIFYING —
  // SIMULATE takes the modelled time, TO THE GRID starts the race from it.
  await page.locator("#rs-go").click();
  await expect(page.locator("#quali")).toBeVisible({ timeout: 20_000 });
  await page.locator("#q-sim").click();
  await page.locator("#q-go").click();
  await page.waitForFunction(
    () => window.__apex && window.__apex.info().track != null,
    null, { polling: 100, timeout: BOOT_MS }
  );
}

// ── Mode flags ────────────────────────────────────────────────────────────────

test.describe("Season — mode flags", () => {
  test.use({ viewport: LANDSCAPE });

  test("info() reports seasonMode:true", async ({ page }) => {
    await startSeasonRace(page);
    const info = await page.evaluate(() => window.__apex.info());
    expect(info.seasonMode).toBe(true);
    expect(info.timeTrial).toBe(false);
  });

  for (const laps of [10, 25, 57]) {
    test(`does not end a ${laps}-lap race at 360 seconds`, async ({ page }) => {
      await startSeasonRace(page, laps);
      const state = await page.evaluate(() => {
        window.__apex.go();
        window.__apex.headless(true);
        window.__apex.step(1, 361);
        return window.__apex.info().state;
      });
      expect(state).toBe("race");
    });
  }

  test("leaving season restores the saved Grand Prix circuit", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("apex26.trackId", JSON.stringify("monza"));
      localStorage.setItem("apex26.track", JSON.stringify(0));
      localStorage.setItem("apex26.seasonCfg", JSON.stringify({ trackIds: ["monaco"] }));
    });
    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
    await page.evaluate(() => window.__apex.headless(true));
    await page.locator("#mb-season").click();
    // the canonical circuit name is "MONACO" (js/circuits/monaco.js)
    await expect(page.locator("#sel-preview-name")).toContainText("MONACO");
    await page.locator("#sel-back").click();
    await page.locator("#mb-race").click();
    await expect(page.locator('.track-row[aria-label="MONZA"]')).toHaveAttribute("aria-pressed", "true");
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("apex26.trackId")))).toBe("monza");
  });
});

// ── Points & standings ────────────────────────────────────────────────────────

test.describe("Season — standings panel", () => {
  test.use({ viewport: LANDSCAPE });

  test("standings button appears after round 1 completes", async ({ page }) => {
    await startSeasonRace(page);

    // Skip to after the race using finishRace
    await page.evaluate(() => window.__apex.park(0));
    await page.waitForTimeout(100);
    await page.evaluate(() => window.__apex.finishRace());
    await page.waitForTimeout(500);

    // Results screen should be visible
    await expect(page.locator("#results")).toBeVisible({ timeout: 5000 });

    // Return to menu (res-next starts next race; res-menu calls quitToMenu() which shows standings btn)
    await page.locator("#res-menu").click();
    await page.waitForTimeout(300);

    // The STANDINGS button should now be visible on the main menu
    await expect(page.locator("#mb-standings")).toBeVisible();
  });

  test("standings panel opens and shows drivers table", async ({ page }) => {
    await startSeasonRace(page);
    await page.evaluate(() => window.__apex.park(0));
    await page.waitForTimeout(100);
    await page.evaluate(() => window.__apex.finishRace());
    await page.waitForTimeout(500);
    await expect(page.locator("#results")).toBeVisible({ timeout: 5000 });
    await page.locator("#res-menu").click();
    await page.waitForTimeout(300);

    // Open standings
    await page.locator("#mb-standings").click();
    await expect(page.locator("#standings")).toBeVisible();
    // Should contain driver rows
    const rows = page.locator("#standings-body .res-row");
    await expect(rows.first()).toBeVisible();
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);
  });

  test("migrates legacy code points to a stable identity before a custom code edit", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("apex26.team", "11");
      localStorage.setItem("apex26.driver", "0");
      localStorage.setItem("apex26.customTeam", JSON.stringify({
        id: "custom",
        engine: "Custom",
        tier: 2,
        custom: true,
        name: "My Team",
        short: "YOU",
        color: [0.15, 0.45, 0.95],
        color2: [0.95, 0.15, 0.25],
        stats: { speed: 85, accel: 85, cornering: 85, braking: 85 },
        drivers: [{ name: "Your Name", code: "YOU", num: 99 }],
      }));
      localStorage.setItem("apex26.season", JSON.stringify({
        round: 1,
        pts: { YOU: 25 },
        teamPts: { custom: 25 },
      }));
    });
    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
    await page.evaluate(() => window.__apex.headless(true));   // see startSeasonRace
    await page.locator("#mb-season").click();
    await page.locator("#select").waitFor({ state: "visible" });
    // MY TEAM lives in the garage's TEAM tab now, so editing the custom team
    // mid-season is a trip through the garage and back.
    await page.locator("#sel-go").click();
    await page.locator("#carsetup").waitFor({ state: "visible" });
    await page.locator('#cs-tabs [data-cs-cat="team"]').click();
    await page.locator("#cs-customize").click();
    await page.locator("#cz-code").fill("NEW");
    await page.locator("#cz-save").click();
    await page.locator("#cs-done").click();
    await page.locator("#carsetup").waitFor({ state: "hidden" });
    await page.locator("#race-settings").waitFor({ state: "visible" });
    await page.locator("#rs-go").click();
    await expect(page.locator("#quali")).toBeVisible({ timeout: 20_000 });
    await page.locator("#q-sim").click();
    await page.locator("#q-go").click();
    await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: BOOT_MS });
    await page.evaluate(() => {
      window.__apex.park(0.9);
      window.__apex.finishRace();
    });

    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("apex26.season")));
    expect(saved.pts["custom:0"]).toBe(50);
    expect(saved.pts.NEW).toBeUndefined();
    expect(await page.locator("#results-table").innerText()).toContain("NEW");
  });
});
