// @ts-check
// Time Trial mode: ghost recording, ghost delta HUD, sector-split announces,
// and the TT results panel. Uses __apex.tt() to enter TT mode programmatically.
import { test, expect } from "@playwright/test";

const LANDSCAPE = { width: 844, height: 390 };

async function enterTT(page, trackId = "monza") {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex != null, { timeout: 8000 });
  await page.evaluate((id) => window.__apex.tt(id), trackId);
  await page.waitForFunction(() => window.__apex.info().track != null, { timeout: 10_000 });
}

// ── Mode flags ────────────────────────────────────────────────────────────────

test.describe("Time Trial — mode flags", () => {
  test.use({ viewport: LANDSCAPE });

  test("info() reports timeTrial:true when started via __apex.tt()", async ({ page }) => {
    await enterTT(page);
    const info = await page.evaluate(() => window.__apex.info());
    expect(info.timeTrial).toBe(true);
    expect(info.seasonMode).toBe(false);
  });

  test("HUD shows TT position label", async ({ page }) => {
    await enterTT(page);
    await page.evaluate(() => window.__apex.park(0));
    await page.waitForTimeout(100);
    const posText = await page.locator("#hud-pos").innerText();
    expect(posText).toBe("TT");
  });
});

// ── Ghost delta HUD ───────────────────────────────────────────────────────────

test.describe("Time Trial — ghost delta HUD", () => {
  test.use({ viewport: LANDSCAPE });

  test("gap-behind shows REC placeholder when no record exists yet", async ({ page }) => {
    await enterTT(page);
    await page.evaluate(() => window.__apex.park(0));
    await page.waitForTimeout(100);
    const gapB = await page.locator("#hud-gap-behind").innerText();
    // Should show "REC —" when no time set yet
    expect(gapB).toMatch(/REC/);
  });
});

// ── Sector splits ─────────────────────────────────────────────────────────────

test.describe("Time Trial — sector splits", () => {
  test.use({ viewport: LANDSCAPE });

  test("sector announce fires when crossing S1→S2 boundary", async ({ page }) => {
    await enterTT(page);

    // Start just before the 33% sector boundary at low speed so the car
    // crosses cleanly without triggering auto-rescue (which would overwrite
    // the "S1" announce with "RECOVERED").
    await page.evaluate(async () => {
      window.__apex.headless(true);
      window.__apex.reset(0.327, 10);
      const total = window.__apex.info().total || 5000;
      for (let i = 0; i < 300; i++) {
        window.__apex.act({ steer: 0, throttle: true, brake: false }, 1 / 60, 3);
        if (window.__apex.physState().s / total > 0.34) break;
      }
      window.__apex.headless(false);
    });

    // Announce textContent is set at sector crossing and persists even after hiding
    const announced = await page.evaluate(
      () => (document.getElementById("announce") || {}).textContent || ""
    );
    expect(announced).toMatch(/S1/);
  });
});

// ── TT results panel ──────────────────────────────────────────────────────────

test.describe("Time Trial — results panel", () => {
  test.use({ viewport: LANDSCAPE });

  test("results panel appears after finishRace() in TT mode", async ({ page }) => {
    await enterTT(page);
    await page.evaluate(() => window.__apex.park(0));
    await page.waitForTimeout(200);
    await page.evaluate(() => window.__apex.finishRace());
    await page.waitForTimeout(300);

    await expect(page.locator("#results")).toBeVisible({ timeout: 5000 });
    const title = await page.locator("#results-title").innerText();
    expect(title).toContain("TIME TRIAL");
  });

  test("TRY AGAIN button shown in TT results", async ({ page }) => {
    await enterTT(page);
    await page.evaluate(() => window.__apex.park(0));
    await page.waitForTimeout(200);
    await page.evaluate(() => window.__apex.finishRace());
    await expect(page.locator("#results")).toBeVisible({ timeout: 5000 });
    const nextText = await page.locator("#res-next").innerText();
    expect(nextText).toBe("TRY AGAIN");
  });
});
