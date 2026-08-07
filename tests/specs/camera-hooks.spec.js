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

test("tourShots({atCorners}) frames each apex from the outside", async ({ page }) => {
  await loadMonaco(page);
  const shots = await page.evaluate(() => __apex.tourShots(8, { atCorners: true }));
  expect(shots.length).toBeGreaterThan(0);
  expect(shots.length).toBeLessThanOrEqual(8);
  // fracs must be in lap order, labelled as corners, az on the outside of the bend
  let prev = -1;
  for (const s of shots) {
    expect(s.frac).toBeGreaterThan(prev);     // strictly increasing = lap order
    prev = s.frac;
    expect(s.label).toMatch(/^corner-\d\d$/);
    expect(Math.abs(s.az)).toBeGreaterThan(40);  // a real corner-framing angle, not head-on
    const r = await page.evaluate(s => __apex.orbit(s.frac, s.az, s.el, s.dist), s);
    expect(r).toBeTruthy();
  }
  console.log("corner shots:", shots.map(s => `${(s.frac*100).toFixed(0)}%@${s.az}`).join(" "));
});

test("previewCam() frames any in-game mode without moving the car", async ({ page }) => {
  await loadMonaco(page);
  const before = await page.evaluate(() => { const p = __apex.probe(); return p && p.s; });
  for (const mode of ["chase", "drift", "heli", "tcam", "cinematic"]) {
    const r = await page.evaluate(m => __apex.previewCam(m, 0.2, 60, 0.5), mode);
    expect(r, `previewCam(${mode})`).toBeTruthy();
    expect(r.mode).toBe(mode);
    expect(r.eye).toHaveLength(3);
    expect(r.target).toHaveLength(3);
    expect(typeof r.fov).toBe("number");
    const d = r.eye.map((v, i) => v - r.target[i]);
    expect(Math.hypot(...d)).toBeGreaterThan(1);   // eye and target distinct
    // it's a debug override, and it must NOT have moved the car
    const cam = await page.evaluate(() => __apex.camState());
    expect(cam.debug).toBe(true);
  }
  const after = await page.evaluate(() => { const p = __apex.probe(); return p && p.s; });
  expect(after).toBeCloseTo(before, 1);
  // an unknown mode is rejected, not crashed
  expect(await page.evaluate(() => __apex.previewCam("banana", 0.2))).toBe(false);
});

test("view() with no args frames the whole track (not chase)", async ({ page }) => {
  await loadMonaco(page);
  const r = await page.evaluate(() => __apex.view());
  // documented whole-track aerial: returns a span, and engages the debug cam
  expect(r).toBeTruthy();
  expect(r.mode).not.toBe("chase");
  expect(r.span).toBeGreaterThan(100);
  const cam = await page.evaluate(() => __apex.camState());
  expect(cam.debug).toBe(true);
  // eye is high above the track (aerial)
  expect(cam.eye[1]).toBeGreaterThan(50);
  // explicit "chase" still restores the game cam
  const c = await page.evaluate(() => __apex.view("chase"));
  expect(c.mode).toBe("chase");
  expect((await page.evaluate(() => __apex.camState())).debug).toBe(false);
});

test("orbit() never sinks the eye underground at low/negative elevation", async ({ page }) => {
  await loadMonaco(page);
  for (const el of [-20, -10, 0, 5]) {
    const r = await page.evaluate(el => __apex.orbit(0.2, 90, el, 30), el);
    expect(r, `orbit el=${el}`).toBeTruthy();
    // road surface at that point
    const roadY = await page.evaluate(() => __apex.groundY(0.2, 0).roadY);
    expect(r.eye[1], `el=${el} eye above road`).toBeGreaterThan(roadY);
  }
});
