// @ts-check
// Live overlay feed (#1551): a race page publishes OverlayFeed frames over
// BroadcastChannel and overlay.html, opened as a second page of the SAME context
// (same origin and storage partition), paints the tower from them. The tower must
// follow __apex.field() within 0.5 s, and an #announce card must reach the
// overlay's caption.
import { test, expect, BOOT_MS } from "../helpers/fixtures.js";

const LANDSCAPE = { width: 844, height: 390 };

// The overlay's visible rows in tower order: "pos:code".
const towerOf = (overlay) => overlay.evaluate(() => Array.from(document.querySelectorAll(".ov-row:not([hidden])"))
  .map((r) => ({ pos: Number(r.querySelector(".ov-pos").textContent), code: r.querySelector(".ov-code").textContent }))
  .sort((a, b) => a.pos - b.pos).map((r) => r.pos + ":" + r.code).join(" "));
// The field in race order, clipped to the tower's 20 rows (OverlayRender.MAX_ROWS).
const fieldOf = (page) => page.evaluate(() => window.__apex.field().positions.slice(0, 20).map((r) => r.pos + ":" + r.code).join(" "));

test.describe("stream overlay — live same-browser feed", () => {
  test.use({ viewport: LANDSCAPE });

  test("overlay rows follow __apex.field() within 0.5 s and captions arrive", async ({ page, context }) => {
    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
    await page.evaluate(() => window.__apex.headless(true));   // nothing below reads a pixel
    await page.evaluate(() => window.__apex.race("monza"));
    await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: BOOT_MS });
    const sectors = await page.evaluate(() => window.__apex.sectorState());
    expect(Array.isArray(sectors.fieldBest) && sectors.fieldBest.length).toBe(3);

    const overlay = await context.newPage();
    await overlay.setViewportSize({ width: 1280, height: 720 });
    await overlay.goto("/overlay.html");
    // Connect: the overlay's hello starts the publisher; its first full frame paints the tower.
    await expect.poll(() => towerOf(overlay), { timeout: 10_000, intervals: [100] }).toBe(await fieldOf(page));
    await expect(overlay.locator(".ov-caption")).toBeHidden();   // the "waiting" card is gone

    // Move the last car to the front of the order: the tower follows within 0.5 s.
    const before = await fieldOf(page);
    await page.evaluate(() => {
      const A = window.__apex, rows = A.field().positions, last = rows[rows.length - 1];
      const idx = A.field({ detail: "full" }).positions.find((r) => r.code === last.code).id;
      const leadFrac = A.field({ detail: "full" }).positions[0].frac;
      // Halfway between the leader and the line: past the line at lap 0 would be a lap down.
      A.aiPlace(idx, leadFrac + (1 - leadFrac) / 2, 0);
    });
    const moved = await fieldOf(page);
    expect(moved.split(" ")[0]).not.toBe(before.split(" ")[0]);   // the order really changed
    await expect.poll(() => towerOf(overlay), { timeout: 500, intervals: [50] }).toBe(moved);

    // A radio card on #announce reaches the overlay caption (MutationObserver tap).
    await page.evaluate(() => {
      document.getElementById("announce-num").textContent = "16";
      document.getElementById("announce-who").textContent = "LEC";
      document.getElementById("announce-text").textContent = "Box, box";
      document.getElementById("announce").dataset.kind = "radio";
      document.getElementById("announce").hidden = false;
    });
    await expect(overlay.locator(".ov-caption")).toBeVisible({ timeout: 500 });
    await expect(overlay.locator(".ov-caption span")).toHaveText("Box, box");
    await expect(overlay.locator(".ov-caption strong")).toHaveText(/16\s+LEC/);
    await overlay.close();
  });
});
