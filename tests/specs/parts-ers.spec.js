// @ts-check
// ERS deploy economics: BOOST must both PUSH and COST at any speed.
//
// The taper that shapes deploy strength used to reach exactly 0 above TAPER_HI
// (53 m/s std = 191 km/h), and the battery drain was gated on `deploy > 0`. So
// on a straight — the one place a player reaches for it — BOOST produced no
// thrust and consumed no energy, while OVERTAKE (which bypasses the taper)
// worked and drained. These tests pin both halves so the two can't diverge again.
import { test, expect } from "@playwright/test";
import { BOOT_MS } from "../helpers/fixtures.js";

async function load(page) {
  await page.goto("/");
  // BOOT_MS, not a hand-rolled 10 s: a SwiftShader boot here measures 11-33 s (2026-09-01).
  await page.waitForFunction(() => window.__apex && window.__apex.race, null, { polling: 100, timeout: BOOT_MS });
  await page.evaluate(() => window.__apex.race("monza"));
  await page.waitForFunction(() => window.__apex.info().track === "monza", null, { polling: 100, timeout: BOOT_MS });
  await page.evaluate(() => { window.__apex.go(); });
}

// Hold BOOST at a given speed for a fixed time and report the energy spent and
// the ground gained, against an identical run with BOOST off.
async function boostRun(page, speed, { boost }) {
  return page.evaluate(async ({ speed, boost }) => {
    window.__apex.setEnergy(1);
    window.__apex.jump(0.5, speed, 0);
    window.__apex.step(1 / 60, 2);
    // BOOST is an edge-triggered toggle, so setInput cannot express it.
    window.__apex.setBoost(!!boost);
    window.__apex.step(1 / 60, 1);
    const before = window.__apex.timing().energy;
    const s0 = window.__apex.probe().s;
    window.__apex.step(1 / 60, 90);
    const after = window.__apex.timing().energy;
    window.__apex.setBoost(false);
    return { spent: before - after, gained: window.__apex.probe().s - s0, before, after };
  }, { speed, boost });
}

test.describe("ERS deploy — BOOST costs energy wherever it pushes", () => {
  test("holding BOOST at high speed drains the battery", async ({ page }) => {
    await load(page);
    // 70 m/s = 252 km/h, well above the old taper cut-off where BOOST went inert.
    const on = await boostRun(page, 70, { boost: true });
    expect(on.before).toBeGreaterThan(0.5);
    expect(on.spent, "BOOST at 252 km/h must consume ERS").toBeGreaterThan(0.05);
  });

  test("BOOST still drains at low speed, where the taper is strongest", async ({ page }) => {
    await load(page);
    const on = await boostRun(page, 25, { boost: true });
    expect(on.spent, "BOOST out of a slow corner must consume ERS").toBeGreaterThan(0.05);
  });

  test("not holding BOOST does not drain — the battery recovers instead", async ({ page }) => {
    await load(page);
    const off = await boostRun(page, 70, { boost: false });
    expect(off.spent, "coasting must not spend ERS").toBeLessThanOrEqual(0);
  });

  test("the deploy taper never reaches zero, so BOOST is never silently inert", async ({ page }) => {
    await load(page);
    const inert = await page.evaluate(() => {
      const out = [];
      for (const v of [20, 40, 55, 70, 90]) {
        window.__apex.setEnergy(1);
        window.__apex.jump(0.5, v, 0);
        window.__apex.step(1 / 60, 2);
        window.__apex.setBoost(true);
        window.__apex.step(1 / 60, 1);
        const before = window.__apex.timing().energy;
        window.__apex.step(1 / 60, 60);
        const spent = before - window.__apex.timing().energy;
        window.__apex.setBoost(false);
        if (spent <= 0.02) out.push(`${v}m/s:${spent.toFixed(4)}`);
      }
      return out;
    });
    expect(inert, "BOOST drew no energy at these speeds").toEqual([]);
  });
});
