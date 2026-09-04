// @ts-check
// Time Trial mode: ghost recording, ghost delta HUD, sector-split announces,
// and the TT results panel. Uses __apex.tt() to enter TT mode programmatically.
import { test, expect } from "@playwright/test";
import { BOOT_MS } from "../helpers/fixtures.js";

const LANDSCAPE = { width: 844, height: 390 };

async function enterTT(page, trackId = "monza") {
  await page.goto("/");
  // BOOT_MS, not a hand-rolled 8 s: a SwiftShader boot here measures 11-33 s (2026-09-01).
  await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
  await page.evaluate((id) => window.__apex.tt(id), trackId);
  await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: BOOT_MS });
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

  test("drops reverse-progress samples from ghost recording and delta lookup", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => typeof Ghost !== "undefined");
    const result = await page.evaluate(() => {
      Ghost.clear("monza");
      Ghost.setTrack("monza");
      Ghost.startLap();
      [0, 100, 200, 150, 300, 400, 500, 600, 700, 800].forEach((s, i) => {
        Ghost.record(i * 0.06, s, 0);
      });
      Ghost.finishLap(1);
      const saved = JSON.parse(localStorage.getItem("apex26.ghost.v1")).monza;
      return { distances: saved.s, timeAt250: Ghost.timeAt(250) };
    });

    expect(result.distances).not.toContain(150);
    expect(result.distances.every((s, i) => i === 0 || s >= result.distances[i - 1])).toBe(true);
    expect(result.timeAt250).toBeCloseTo(0.18, 2);
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

  test("does not record formation-lap S3 when first crossing the start line", async ({ page }) => {
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
    // Grid sits in S3; the first S/F crossing only starts the flying lap.
    expect(result.sectors.last[2]).toBeNull();
    expect(result.sectors.bests[2]).toBeNull();
  });

  test("records S3 before resetting timing at the finish line", async ({ page }) => {
    await enterTT(page);
    const result = await page.evaluate(() => {
      window.__apex.go();
      // Already on a flying lap — the S3→S1 wrap must stamp the split.
      window.__apex.setLap(1);
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

  test("sector strip updates when crossing S1→S2 boundary", async ({ page }) => {
    await enterTT(page);

    // Start just before this track's curated S1→S2 boundary at low speed so the
    // car crosses cleanly without triggering auto-rescue (which would overwrite
    // the "S1" announce with "RECOVERED").
    await page.evaluate(async () => {
      window.__apex.headless(true);
      window.__apex.go();
      const sec = window.__apex.info().sectors || [1 / 3, 2 / 3];
      const s1 = sec[0];
      window.__apex.reset(Math.max(0.01, s1 - 0.008), 10);
      window.__apex.setLap(1); // flying lap — sector splits only stamp after lap ≥ 1
      const total = window.__apex.info().total || 5000;
      for (let i = 0; i < 300; i++) {
        window.__apex.act({ steer: 0, throttle: true, brake: false }, 1 / 60, 3);
        if (window.__apex.physState().s / total > s1 + 0.005) break;
      }
      window.__apex.headless(false);
    });

    const split = await page.evaluate(() => {
      const last = window.__apex.sectorState().last;
      const flash = document.querySelector("#hud-sectors .sec-flash, #hud-sectors .sec-flash-pb");
      return { s1: last[0], flashed: !!flash };
    });
    expect(split.s1).not.toBeNull();
    expect(split.s1).toBeGreaterThan(0);
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

  test("clearing the ghost retains the persisted leaderboard record", async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("apex26.ttlb.monza", JSON.stringify([
        { t: 75, teamId: "mclaren", code: "NOR", name: "Lando Norris", ts: 1 },
      ]));
      localStorage.setItem("apex26.ghost.v1", JSON.stringify({
        monza: {
          time: 75,
          t: [0, 10, 20, 30, 40, 50, 60, 75],
          s: [0, 700, 1400, 2100, 2800, 3500, 4200, 5000],
          x: [0, 0, 0, 0, 0, 0, 0, 0],
        },
      }));
    });
    await enterTT(page);
    await page.evaluate(() => {
      window.__apex.park(0);
      window.__apex.finishRace();
    });
    await page.getByRole("button", { name: "✕ CLEAR GHOST" }).click();
    await page.locator("#res-next").click();
    await page.evaluate(() => window.__apex.park(0.1));
    await expect(page.locator("#hud-gap-behind")).toContainText("REC 1:15.00");
  });
});
