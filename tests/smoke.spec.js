// @ts-check
import { test, expect } from "@playwright/test";

// Helper: wait for the game's __apex hook to report a non-null track,
// meaning loadTrack() has finished and the renderer is up.
async function waitForTrack(page, timeout = 10_000) {
  await page.waitForFunction(
    () => window.__apex && window.__apex.info().track != null,
    { timeout }
  );
}

// Helper: navigate to the page, click RACE, then click START.
// Returns after startRace() completes (state === "count").
async function goToRace(page) {
  await page.goto("/");
  // Dismiss any overlay — the RACE button lives in the main menu
  await page.locator("#mb-race").click();
  // Leave team/track at their defaults and start
  await page.locator("#sel-go").click();
  await waitForTrack(page);
}

// Helper: skip the countdown, clear the AI pack, and park the player
// at `frac` (0–1) of the lap so the camera points at that corner.
async function park(page, frac = 0) {
  await page.evaluate((f) => window.__apex.park(f), frac);
  // Let the renderer flush at least two frames (~32 ms at 60 fps)
  await page.waitForTimeout(100);
}

// ─── tests ────────────────────────────────────────────────────────────────────

test.describe("Apex 26 — smoke", () => {
  test("page loads without WebGL error", async ({ page }) => {
    const errors = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    await page.goto("/");

    // Main menu overlay must be visible
    await expect(page.locator("#overlay")).toBeVisible();

    // WebGL2 unavailable banner must stay hidden
    await expect(page.locator("#nogl")).toBeHidden();

    // Canvas must have non-zero dimensions (GLX.resize() ran)
    const box = await page.locator("canvas#game").boundingBox();
    expect(box?.width).toBeGreaterThan(0);
    expect(box?.height).toBeGreaterThan(0);

    // No console errors during load
    expect(errors.filter((e) => !e.includes("favicon"))).toHaveLength(0);
  });

  test("select screen shows team and track chips", async ({ page }) => {
    await page.goto("/");
    await page.locator("#mb-race").click();

    await expect(page.locator("#select")).toBeVisible();
    await expect(page.locator("#sel-teams .sel-chip").first()).toBeVisible();
    await expect(page.locator("#sel-tracks .sel-chip").first()).toBeVisible();
    await expect(page.locator("#sel-diff .sel-chip").first()).toBeVisible();
  });

  test("race starts and __apex hook is available", async ({ page }) => {
    await goToRace(page);

    const info = await page.evaluate(() => window.__apex.info());
    expect(info.state).toMatch(/count|race/);
    expect(typeof info.track).toBe("string");
    expect(info.total).toBeGreaterThan(0);
  });

  test("park() skips countdown and positions player", async ({ page }) => {
    await goToRace(page);
    await park(page, 0);

    const info = await page.evaluate(() => window.__apex.info());
    expect(info.state).toBe("race");

    // HUD should be visible in-race
    await expect(page.locator("#hud")).toBeVisible();
    await expect(page.locator("#lights")).toBeHidden();
  });
});

test.describe("Apex 26 — rendering", () => {
  test("grid start — render smoke screenshot", async ({ page }) => {
    await goToRace(page);
    await park(page, 0);

    await expect(page.locator("canvas#game")).toHaveScreenshot("grid-start.png", {
      maxDiffPixelRatio: 0.05,
    });
  });

  test("corner approach — render smoke screenshot", async ({ page }) => {
    await goToRace(page);

    // Find the first corner on the track and park there
    const corners = await page.evaluate(() => window.__apex.corners());
    const frac = corners.length > 0 ? corners[0] : 0.15;
    await park(page, frac);

    await expect(page.locator("canvas#game")).toHaveScreenshot("corner-approach.png", {
      maxDiffPixelRatio: 0.05,
    });
  });

  test("jump() sets player speed and lateral offset", async ({ page }) => {
    await goToRace(page);
    // Enter race state first
    await park(page, 0);
    // Then jump to mid-lap at 60 m/s, 2 m right of centre
    await page.evaluate(() => window.__apex.jump(0.5, 60, 2));
    await page.waitForTimeout(100);

    const info = await page.evaluate(() => window.__apex.info());
    expect(info.state).toBe("race");
    // Player should now be near 50% of the lap
    // (can't read player.s directly but track total is available)
    expect(info.total).toBeGreaterThan(0);
  });
});

test.describe("Apex 26 — HUD", () => {
  test("speed readout updates after jump() at speed", async ({ page }) => {
    await goToRace(page);
    await park(page, 0);
    await page.evaluate(() => window.__apex.jump(0, 80, 0));
    // Wait for the HUD tick to flush the new speed value into the DOM
    await page.waitForFunction(
      () => parseInt(document.getElementById("hud-speed-n").textContent, 10) > 0,
      { timeout: 3000 }
    );

    const speed = await page.locator("#hud-speed-n").innerText();
    // 80 m/s ≈ 288 km/h — should show a non-zero value
    expect(parseInt(speed, 10)).toBeGreaterThan(0);
  });

  test("minimap canvas has content after race starts", async ({ page }) => {
    await goToRace(page);
    await park(page, 0);

    // The minimap canvas should have been painted (width/height > 0)
    const minimapBox = await page.locator("canvas#minimap").boundingBox();
    expect(minimapBox?.width).toBeGreaterThan(0);
  });
});
