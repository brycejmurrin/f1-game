// @ts-check
// Contract tests for __apex.dolly(), __apex.roadside(), __apex.tourShots()
import { test, expect } from "@playwright/test";

async function loadMonaco(page) {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto("/");
  await page.waitForFunction(() => window.__apex, { timeout: 15000 });
  await page.evaluate(async () => {
    __apex.race("monaco");
    await new Promise(r => setTimeout(r, 3000));
    __apex.go();
    await new Promise(r => setTimeout(r, 200));
    __apex.freeze(true);
    __apex.hud(false);
  });
}

test("dolly() places camera in local track frame", async ({ page }) => {
  await loadMonaco(page);
  const result = await page.evaluate(() => __apex.dolly(0.22, -25, 18, 4));
  expect(result).toBeTruthy();
  expect(result.eye).toHaveLength(3);
  expect(result.target).toHaveLength(3);
  // eye and target should be different points
  const d = result.eye.map((v, i) => v - result.target[i]);
  expect(Math.hypot(...d)).toBeGreaterThan(1);

  // camState should reflect the new position
  const cam = await page.evaluate(() => __apex.camState());
  expect(cam.debug).toBe(true);
  console.log("dolly eye:", result.eye.map(v => v.toFixed(1)));
});

test("roadside() look modes all return valid camera", async ({ page }) => {
  await loadMonaco(page);
  for (const look of ["fwd", "back", "in", "out"]) {
    const r = await page.evaluate(look => __apex.roadside(0.33, -1, 8, 3, { look }), look);
    expect(r).toBeTruthy();
    expect(r.look).toBe(look);
    expect(r.eye).toHaveLength(3);
    expect(r.target).toHaveLength(3);
    const d = r.eye.map((v, i) => v - r.target[i]);
    expect(Math.hypot(...d)).toBeGreaterThan(0.5);
    console.log(`roadside look="${look}" eye:`, r.eye.map(v => v.toFixed(1)));
  }
});

test("tourShots() returns n descriptors spanning the full circuit", async ({ page }) => {
  await loadMonaco(page);
  const shots = await page.evaluate(() => __apex.tourShots(16));
  expect(shots).toHaveLength(16);
  // fracs should be evenly spread 0..1
  expect(shots[0].frac).toBe(0);
  expect(shots[8].frac).toBeCloseTo(0.5, 2);
  // each shot should be usable with orbit()
  for (const s of shots) {
    expect(s.frac).toBeGreaterThanOrEqual(0);
    expect(s.frac).toBeLessThan(1);
    expect(typeof s.az).toBe("number");
    expect(typeof s.el).toBe("number");
    expect(typeof s.dist).toBe("number");
    expect(typeof s.label).toBe("string");
    const r = await page.evaluate(s => __apex.orbit(s.frac, s.az, s.el, s.dist), s);
    expect(r).toBeTruthy();
  }
  console.log("tourShots sample:", shots.slice(0, 3));
});
