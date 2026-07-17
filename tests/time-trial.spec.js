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

  test("records only one monotonic flying lap in the persisted ghost", async ({ page }) => {
    await enterTT(page);
    const result = await page.evaluate(() => {
      localStorage.removeItem("apex26.ghost.v1");

      // Run the real countdown from the grid, then cross once to begin the
      // flying lap. Sampling staged points makes the regression deterministic.
      window.__apex.step(1 / 60, 480);
      window.__apex.jump(0.999, 80, 0);
      window.__apex.step(1 / 60, 10);

      for (const frac of [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.999]) {
        window.__apex.jump(frac, 80, 0);
        window.__apex.step(1 / 60, frac === 0.999 ? 10 : 4);
      }

      const total = window.__apex.info().total;
      const store = JSON.parse(localStorage.getItem("apex26.ghost.v1") || "{}");
      return { ghost: store.monza, total };
    });

    expect(result.ghost.s.length).toBeGreaterThanOrEqual(8);
    expect(result.ghost.s[0]).toBeLessThan(result.total * 0.02);
    expect(result.ghost.s.every((s, i) => i === 0 || s >= result.ghost.s[i - 1])).toBe(true);
  });
});

// ── Sector splits ─────────────────────────────────────────────────────────────

test.describe("Time Trial — sector splits", () => {
  test.use({ viewport: LANDSCAPE });

  test("initializes sector timing from the player's grid sector", async ({ page }) => {
    await enterTT(page);
    const sector = await page.evaluate(() => window.__apex.sectorState());
    expect(sector.idx).toBe(2);
  });

  test("records S3 before resetting timing at the finish line", async ({ page }) => {
    await enterTT(page);
    const result = await page.evaluate(() => {
      window.__apex.go();
      window.__apex.jump(0.999, 80, 0);
      window.__apex.step(1 / 60, 10);
      return {
        timing: window.__apex.timing(),
        sectors: window.__apex.sectorState()
      };
    });
    expect(result.timing.lap).toBeGreaterThanOrEqual(1);
    expect(result.sectors.idx).toBe(0);
    expect(result.sectors.last[2]).not.toBeNull();
    expect(result.sectors.last[2]).toBeGreaterThan(0);
  });

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
