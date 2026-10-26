// @ts-check
// render-lifecycle.spec.js — __apex.lifecycle() (js/agent/apex-lifecycle.js, #2572): resize / orientation,
// simulated hidden tab, bfcache pageshow and WebGL context loss, read and
// driven as JSON. GLX (the cheapest WebGL2 boot); the hook is backend-agnostic.
import { test, expect, BOOT_MS, TRACK_MS } from "../helpers/fixtures.js";

test.describe.configure({ timeout: 180_000 });

const LANDSCAPE = { width: 844, height: 390 };
const PORTRAIT = { width: 390, height: 844 };

async function boot(page) {
  await page.addInitScript(() => {
    try { localStorage.setItem("apex26.gfxBackend", "webgl2"); } catch (_) { /* private */ }
  });
  await page.goto("/");
  await page.waitForFunction(() => window.__apex != null && window.__apex.lifecycle != null, null, { polling: 100, timeout: BOOT_MS });
  return page.evaluate(() => window.__apex.lifecycle({ reset: true }));
}

const frames = (page, n) => page.evaluate((k) => new Promise((r) => {
  let i = 0; const tick = () => (++i >= k ? r(null) : requestAnimationFrame(tick)); requestAnimationFrame(tick);
}), n);

test.describe("render lifecycle hooks", () => {
  test.use({ viewport: LANDSCAPE });

  test("rotate 844x390 <-> 390x844: backing store follows the viewport", async ({ page }) => {
    const s0 = await boot(page);
    expect(s0.api).toBe("webgl2");
    expect(s0.orientation).toBe("landscape");
    for (const vp of [PORTRAIT, LANDSCAPE, PORTRAIT]) {
      await page.setViewportSize(vp);
      await frames(page, 3);
      const s = await page.evaluate(() => window.__apex.lifecycle());
      expect(s.viewport, JSON.stringify(s)).toEqual([vp.width, vp.height]);
      expect(s.sized, `backing ${s.backing} vs viewport ${s.viewport}`).toBe(true);
    }
    const end = await page.evaluate(() => window.__apex.lifecycle({ resize: true }));
    expect(end.resized).toBe(true);
    expect(end.events.resize).toBeGreaterThanOrEqual(3);
    expect(end.contextLost).toBe(false);
  });

  test("simulated hidden tab pauses the race; bfcache return is counted", async ({ page }) => {
    await boot(page);
    await page.evaluate((t) => window.__apex.race(t), "monza");
    await page.waitForFunction(() => window.__apex.info().state === "race" || window.__apex.info().state === "count", null, { polling: 100, timeout: TRACK_MS });
    await page.evaluate(() => window.__apex.go());
    const hid = await page.evaluate(() => window.__apex.lifecycle({ hidden: true }));
    expect(hid.hidden).toBe(true);
    expect(hid.simulatedHidden).toBe(true);
    expect(hid.paused, JSON.stringify(hid)).toBe(true);
    const back = await page.evaluate(() => window.__apex.lifecycle({ hidden: false, bfcache: true }));
    expect(back.hidden).toBe(false);
    expect(back.visibility).toBe("visible");
    expect(back.events.visibilitychange).toBe(2);
    expect(back.events.persistedShow).toBe(1);
    expect(back.contextLost).toBe(false);
  });

  test("context loss is observed, then the page reloads to a live context", async ({ page }) => {
    await boot(page);
    const nav = page.waitForEvent("framenavigated", { timeout: 30_000 });
    const lost = await page.evaluate(() => window.__apex.lifecycle({ loseContext: true }));
    expect(lost.error, JSON.stringify(lost)).toBeUndefined();
    expect(lost.lost).toBe(true);
    await expect.poll(() => page.evaluate(() => window.__apex && window.__apex.lifecycle().events.contextlost).catch(() => null),
      { timeout: 10_000 }).not.toBe(0);
    await nav;
    await page.waitForFunction(() => window.__apex != null && window.__apex.lifecycle != null, null, { polling: 100, timeout: BOOT_MS });
    await frames(page, 3);
    const after = await page.evaluate(() => window.__apex.lifecycle());
    expect(after.contextLost, JSON.stringify(after)).toBe(false);
    expect(after.api).toBe("webgl2");
  });
});
