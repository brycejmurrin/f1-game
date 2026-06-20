// @ts-check
// Regression tests added from the codebase audit (collisions / physics / AI /
// boundaries). Each pins down an edge case the existing suites didn't cover.
import { test, expect } from "@playwright/test";

async function race(page, id = "monza") {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex != null, { timeout: 8000 });
  await page.evaluate((t) => window.__apex.race(t, "day", "dry"), id);
  await page.waitForFunction(() => window.__apex.info().track != null, { timeout: 8000 });
  await page.evaluate(() => window.__apex.go());
}

test.describe("Apex 26 — audit regressions", () => {
  test("race start (bunched grid) settles with no NaN or launched cars", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));
    await race(page);
    const r = await page.evaluate(() => {
      let finite = true, maxAbsX = 0;
      for (let i = 0; i < 90; i++) {
        window.__apex.step(1 / 60, 1);
        for (const c of window.__apex.cars()) {
          if (!Number.isFinite(c.x) || !Number.isFinite(c.prog)) finite = false;
          maxAbsX = Math.max(maxAbsX, Math.abs(c.x));
        }
      }
      return { finite, maxAbsX };
    });
    expect(errors).toEqual([]);
    expect(r.finite).toBe(true);
    expect(r.maxAbsX).toBeLessThan(20);   // nobody flung off the grid
  });

  test("hard cornering forward never false-triggers WRONG WAY", async ({ page }) => {
    await race(page);
    const wrong = await page.evaluate(() => {
      window.__apex.setPhysics({ drift: 0.6 });
      let flagged = false;
      // throw the car hard through several corners, forward, and watch wrongWay
      const corners = window.__apex.corners();
      for (const f of corners.slice(0, 10)) {
        window.__apex.jump(f, 40, 0);
        window.__apex.setInput({ steer: 1, throttle: true });
        for (let i = 0; i < 40; i++) {
          window.__apex.step(1 / 60, 1);
          if (window.__apex.physState().wrongWay) flagged = true;
        }
      }
      window.__apex.clearInput();
      return flagged;
    });
    expect(wrong).toBe(false);   // going forward (even sideways) is never "wrong way"
  });

  test("driving backwards across the line does NOT count a lap", async ({ page }) => {
    await race(page);
    const r = await page.evaluate(() => {
      const total = window.__apex.info().total;
      window.__apex.jump(0.01, 25, 0);          // just past the line
      window.__apex.aim(180);                    // face backwards
      const lap0 = window.__apex.physState().lap;
      window.__apex.setInput({ steer: 0, throttle: true });
      for (let i = 0; i < 90; i++) window.__apex.step(1 / 60, 1);  // reverse over the line
      const lap1 = window.__apex.physState().lap;
      window.__apex.clearInput();
      return { lap0, lap1 };
    });
    expect(r.lap1).toBeLessThanOrEqual(r.lap0);   // never gains a lap going backwards
  });

  test("rear-ending a car ahead never INCREASES the player's speed", async ({ page }) => {
    await race(page);
    const r = await page.evaluate(() => {
      window.__apex.setPhysics({ drift: 0 });
      window.__apex.jump(0.3, 50, 0);
      window.__apex.rivals([{ dProg: 3, dx: 0 }]);   // overlapping car right ahead
      window.__apex.setInput({ steer: 0, throttle: false });   // coast into it
      const v0 = window.__apex.probe().speed;
      let maxV = v0;
      for (let i = 0; i < 40; i++) { window.__apex.step(1 / 60, 1); maxV = Math.max(maxV, window.__apex.probe().speed); }
      window.__apex.clearInput();
      return { v0, maxV };
    });
    expect(r.maxV).toBeLessThanOrEqual(r.v0 + 0.5);   // contact only scrubs the rear car
  });

  test("no car ever clips through a barrier during a full race (Suzuka: ferris + bridge)", async ({ page }) => {
    await race(page, "suzuka");
    const maxOver = await page.evaluate(() => {
      window.__apex.setInput({ steer: 0, throttle: true });
      let m = 0;
      for (let i = 0; i < 600; i++) {           // 10 s of the whole field racing
        window.__apex.step(1 / 60, 1);
        m = Math.max(m, window.__apex.maxWallOvershoot());
      }
      window.__apex.clearInput();
      return m;
    });
    expect(maxOver).toBeLessThan(0.5);   // everyone stays inside the recorded barriers
  });

  test("extreme tuning + abuse keeps the car finite (tan/grip guards)", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));
    await race(page);
    const finite = await page.evaluate(() => {
      window.__apex.setPhysics({ drift: 0.9, wheelbase: 1.9, expo: 1.0, maxSlip: 0.7, speedRef: 124 });
      window.__apex.jump(0.0, 90, 0);
      let ok = true;
      for (let i = 0; i < 300; i++) {
        window.__apex.setInput({ steer: i % 2 ? 1 : -1, brake: i % 3 === 0, throttle: true });
        window.__apex.step(1 / 60, 1);
        const p = window.__apex.physState();
        if (!Number.isFinite(p.x) || !Number.isFinite(p.s) || !Number.isFinite(p.vLat) || !Number.isFinite(p.head)) ok = false;
      }
      window.__apex.clearInput();
      return ok;
    });
    expect(errors).toEqual([]);
    expect(finite).toBe(true);
  });
});
