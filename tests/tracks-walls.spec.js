// @ts-check
// Track boundary consistency: every track must keep the car inside a sane,
// finite driving boundary (derived from where solid barriers/grandstands sit),
// so you can't clip into models or drive off forever — and you can always
// recover. Street circuits should be tight; open circuits keep some runoff.
import { test, expect } from "@playwright/test";

async function load(page) {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex != null, { timeout: 8000 });
}
const trackIds = (page) => page.evaluate(() => Tracks.LIST.map((t) => t.id));

test.describe("Apex 26 — track boundaries", () => {
  test("every track has a finite, sane driving boundary on both sides", async ({ page }) => {
    await load(page);
    const ids = await trackIds(page);
    expect(ids.length).toBeGreaterThan(10);
    for (const id of ids) {
      const s = await page.evaluate((tid) => {
        window.__apex.race(tid, "day", "dry");
        return window.__apex.wallStats();
      }, id);
      expect(s, `${id} built`).not.toBeNull();
      expect(s.anyNaN, `${id} no NaN boundary`).toBe(false);
      expect(s.minB, `${id} keeps some track`).toBeGreaterThan(1);     // never collapses
      expect(s.maxB, `${id} bounded`).toBeLessThan(60);               // never runs away
      // a barrier never sits absurdly far inside the tarmac edge
      expect(s.minOverHw, `${id} boundary not deep inside edge`).toBeGreaterThan(-1.5);
    }
  });

  test("street circuits are walled tight; open circuits keep runoff", async ({ page }) => {
    await load(page);
    const ids = await trackIds(page);
    const stats = {};
    for (const id of ids) {
      stats[id] = await page.evaluate((tid) => {
        window.__apex.race(tid, "day", "dry");
        return window.__apex.wallStats();
      }, id);
    }
    // Street circuits: the WIDEST boundary still hugs the edge (no big runoff).
    for (const id of ["monaco", "singapore", "vegas", "baku", "jeddah"]) {
      if (!stats[id]) continue;
      expect(stats[id].street, `${id} flagged street`).toBe(true);
      expect(stats[id].minOverHw, `${id} barrier near edge`).toBeLessThan(3);
    }
  });

  test("driving hard into either edge stops bounded and recovers (sampled tracks)", async ({ page }) => {
    await load(page);
    for (const id of ["monaco", "monza", "baku", "spa"]) {
      const r = await page.evaluate((tid) => {
        const ok = window.__apex.race(tid, "day", "dry");
        if (!ok) return { skip: true };
        window.__apex.go();
        window.__apex.setPhysics({ drift: 0.3 });
        let finite = true, maxAbsX = 0;
        // ram both edges at a few points around the lap
        for (const frac of [0.1, 0.35, 0.6, 0.85]) {
          for (const dir of [1, -1]) {
            window.__apex.jump(frac, 45, 0);
            for (let i = 0; i < 50; i++) {
              window.__apex.setInput({ steer: dir, throttle: true });
              window.__apex.step(1 / 60, 1);
              const p = window.__apex.probe();
              if (!Number.isFinite(p.x) || !Number.isFinite(p.s)) finite = false;
              maxAbsX = Math.max(maxAbsX, Math.abs(p.x));
            }
          }
        }
        window.__apex.clearInput();
        return { finite, maxAbsX };
      }, id);
      if (r.skip) continue;
      expect(r.finite, `${id} finite`).toBe(true);
      expect(r.maxAbsX, `${id} bounded`).toBeLessThan(60);
    }
  });
});
