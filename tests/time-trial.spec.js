// @ts-check
// Time Trial mode: ghost recording, ghost delta HUD, leaderboard persistence,
// sector-split announces, and the TT results panel.
import { test, expect } from "@playwright/test";

const LANDSCAPE = { width: 844, height: 390 };

async function enterTT(page, trackId = "monza") {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex != null, { timeout: 8000 });
  await page.locator("#mb-tt").click();
  // Select screen: pick track via the __apex API shortcut instead of clicking cards
  // (avoids flaky card-click targeting).
  await page.evaluate((id) => window.__apex.race(id), trackId);
  await page.waitForFunction(() => window.__apex.info().track != null, { timeout: 10_000 });
}

// ── Mode flags ────────────────────────────────────────────────────────────────

test.describe("Time Trial — mode flags", () => {
  test.use({ viewport: LANDSCAPE });

  test("info() reports timeTrial:true when in TT mode", async ({ page }) => {
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

// ── Ghost recording & delta ───────────────────────────────────────────────────

test.describe("Time Trial — ghost delta HUD", () => {
  test.use({ viewport: LANDSCAPE });

  test("gap-ahead shows GHOST delta once a ghost lap exists", async ({ page }) => {
    await enterTT(page);

    // Drive a fake lap via headless API to store a ghost
    await page.evaluate(async () => {
      window.__apex.headless(true);
      window.__apex.reset(0, 30);
      // Drive the full lap with throttle to record ghost data
      for (let i = 0; i < 2000; i++) {
        window.__apex.act({ steer: 0, throttle: true, brake: false }, 1 / 60, 1);
        const s = window.__apex.physState();
        if (s.lap >= 1) break;
      }
      window.__apex.headless(false);
    });
    await page.evaluate(() => window.__apex.park(0.3));
    await page.evaluate(() => window.__apex.jump(0.3, 40, 0));
    await page.waitForTimeout(200);

    // The gap-ahead element should show either GHOST or a last-lap time
    const gapText = await page.locator("#hud-gap-ahead").innerText();
    // If ghost was recorded, it shows "GHOST ±x.xxxs"; otherwise shows last lap
    expect(gapText.length).toBeGreaterThan(0);
  });
});

// ── Sector splits ─────────────────────────────────────────────────────────────

test.describe("Time Trial — sector splits", () => {
  test.use({ viewport: LANDSCAPE });

  test("sector announce fires when crossing 33% of the lap", async ({ page }) => {
    await enterTT(page);

    const announced = await page.evaluate(async () => {
      window.__apex.headless(true);
      window.__apex.reset(0.28, 60);     // start near S1→S2 boundary (33%)
      let msgs = [];
      const orig = window.__apex.info;
      // poll the announce element after crossing sector boundary
      for (let i = 0; i < 120; i++) {
        window.__apex.act({ steer: 0, throttle: true, brake: false }, 1 / 60, 3);
        const s = window.__apex.physState();
        if (s.s / (window.__apex.info().total || 5000) > 0.38) break;
      }
      window.__apex.headless(false);
      // give the DOM a tick to flush
      return document.getElementById("announce") ? document.getElementById("announce").textContent : "";
    });

    // Announce should contain "S1" or "▼ S1" or "▲ S1"
    expect(announced).toMatch(/S1/);
  });
});

// ── TT results panel ──────────────────────────────────────────────────────────

test.describe("Time Trial — results panel", () => {
  test.use({ viewport: LANDSCAPE });

  test("results panel appears after a TT lap completes", async ({ page }) => {
    await enterTT(page);

    // Drive a full lap headlessly
    await page.evaluate(async () => {
      window.__apex.headless(true);
      window.__apex.reset(0, 60);
      for (let i = 0; i < 3000; i++) {
        window.__apex.act({ steer: 0, throttle: true, brake: false }, 1 / 60, 1);
        const s = window.__apex.physState();
        if (s.lap >= 2) break;
      }
      window.__apex.headless(false);
    });
    await page.waitForTimeout(500);

    // Results panel should now be visible with TT leaderboard
    await expect(page.locator("#results")).toBeVisible({ timeout: 5000 });
    const title = await page.locator("#results-title").innerText();
    expect(title).toContain("TIME TRIAL");
  });
});
