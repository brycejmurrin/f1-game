// @ts-check
// Car-to-car collision tests. The collision model runs in Frenet space (prog +
// lateral x) and must: separate overlapping cars without exploding, keep them on
// the track, and let a jammed pack dig itself out and resume racing. These use
// the __apex.pair()/jam() staging hooks and the cars() telemetry.
import { test, expect } from "@playwright/test";

async function startRace(page) {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex != null, { timeout: 8000 });
  await page.evaluate(() => window.__apex.race("monza", "day", "dry"));
  await page.waitForFunction(() => window.__apex.info().track != null, { timeout: 8000 });
  await page.evaluate(() => window.__apex.go());
}
const step = (page, n) => page.evaluate((n) => { for (let i = 0; i < n; i++) window.__apex.step(1 / 60, 1); }, n);
const cars = (page) => page.evaluate(() => window.__apex.cars());

test.describe("Apex 26 — collisions", () => {
  test("two overlapping cars push apart and settle without exploding", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));
    await startRace(page);
    const ids = await page.evaluate(() => window.__apex.pair(0.3, 55));
    // Start clearly overlapped (pair() sets x = +0.6 / -0.6, ~1.2 m apart).
    const before = await cars(page);
    const gap0 = Math.abs(before[ids.a].x - before[ids.b].x);
    await step(page, 120);   // 2 s
    const after = await cars(page);
    const gap1 = Math.abs(after[ids.a].x - after[ids.b].x);

    expect(errors).toEqual([]);
    expect(gap1).toBeGreaterThan(gap0);                       // they separated
    expect(gap1).toBeGreaterThan(1.6);                        // to ~a car width+
    for (const id of [ids.a, ids.b]) {
      expect(Number.isFinite(after[id].x)).toBe(true);        // no NaN blow-up
      expect(Math.abs(after[id].x)).toBeLessThan(12);         // stayed on track
    }
  });

  test("a jammed pack digs out and resumes speed", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));
    await startRace(page);
    const ids = await page.evaluate(() => window.__apex.jam(5));
    await step(page, 240);   // ~4 s to recover
    const after = await cars(page);
    const jammed = after.filter((c) => ids.includes(c.id));

    expect(errors).toEqual([]);
    // Every previously-jammed car should be moving again...
    for (const c of jammed) {
      expect(c.speed).toBeGreaterThan(15);
      expect(Math.abs(c.x)).toBeLessThan(12);                 // and on track
    }
    // ...and no two should still be sitting on top of each other.
    for (let i = 0; i < jammed.length; i++)
      for (let j = i + 1; j < jammed.length; j++) {
        const dProg = Math.abs(jammed[i].prog - jammed[j].prog);
        const dX = Math.abs(jammed[i].x - jammed[j].x);
        expect(dProg > 3 || dX > 1.4).toBe(true);             // not overlapping
      }
  });

  test("a full pack racing for 10 s never piles off-track or NaNs", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));
    await startRace(page);
    await page.evaluate(() => window.__apex.setInput({ steer: 0, throttle: true }));
    await step(page, 600);
    await page.evaluate(() => window.__apex.clearInput());
    const all = await cars(page);
    expect(errors).toEqual([]);
    for (const c of all) {
      expect(Number.isFinite(c.x)).toBe(true);
      expect(Number.isFinite(c.prog)).toBe(true);
      expect(Math.abs(c.x)).toBeLessThan(18);
    }
  });
});
