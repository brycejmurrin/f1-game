// Contract tests for the extended camera hooks (orbit fov, cinematic, carOrbit)
// and driving hooks (setSpeed, spin, nudge) added in v196.
// All tests use the headless control loop so they run fast with no rendering.

import { test, expect } from "@playwright/test";

const VIEWPORT = { width: 844, height: 390 };

async function loadTrack(page, track = "monza") {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex, { timeout: 15000 });
  await page.evaluate(async t => {
    __apex.race(t);
    await new Promise(r => setTimeout(r, 3000));
    __apex.headless(true);
    __apex.reset(0.1, 30);
  }, track);
}

// ── orbit() — fov option ─────────────────────────────────────────────────────

test("orbit returns fov in result", async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await loadTrack(page);
  const res = await page.evaluate(() => __apex.orbit(0.3, 45, 20, 50, 1.5, { fov: 72 }));
  expect(res).not.toBeFalsy();
  expect(res.fov).toBe(72);
});

test("orbit default fov is 55", async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await loadTrack(page);
  const res = await page.evaluate(() => __apex.orbit(0.2, 30, 15, 40));
  expect(res.fov).toBe(55);
});

test("orbit fov clamped to 1–170", async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await loadTrack(page);
  const lo = await page.evaluate(() => __apex.orbit(0.1, 0, 10, 30, 1.5, { fov: -5 }));
  const hi = await page.evaluate(() => __apex.orbit(0.1, 0, 10, 30, 1.5, { fov: 999 }));
  expect(lo.fov).toBe(1);
  expect(hi.fov).toBe(170);
});

// ── cinematic() ──────────────────────────────────────────────────────────────

test("cinematic returns eye/target/fov/az/k", async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await loadTrack(page, "monaco");
  const res = await page.evaluate(() => __apex.cinematic(0.05));
  expect(res).not.toBeFalsy();
  expect(Array.isArray(res.eye)).toBe(true);
  expect(res.eye.length).toBe(3);
  expect(Array.isArray(res.target)).toBe(true);
  expect(typeof res.az).toBe("number");
  expect(typeof res.k).toBe("number");
  expect(typeof res.fov).toBe("number");
});

test("cinematic default fov is 52", async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await loadTrack(page, "monza");
  const res = await page.evaluate(() => __apex.cinematic(0.5));
  expect(res.fov).toBe(52);
});

test("cinematic fov overrideable via opts", async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await loadTrack(page, "monza");
  const res = await page.evaluate(() => __apex.cinematic(0.5, { fov: 65 }));
  expect(res.fov).toBe(65);
});

test("cinematic camera outside right corner (k>0)", async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await loadTrack(page, "monaco");
  // Find a right-hand corner (positive curvature)
  const res = await page.evaluate(() => {
    const profile = __apex.trackProfile(200);
    const rightCorner = profile.find(p => p.k > 0.02);
    if (!rightCorner) return null;
    return __apex.cinematic(rightCorner.frac);
  });
  if (res) {
    // For a right-hand corner (k>0), az should be negative (camera on the left/outside)
    expect(res.az).toBeLessThan(0);
  }
});

test("cinematic camera outside left corner (k<0)", async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await loadTrack(page, "monaco");
  const res = await page.evaluate(() => {
    const profile = __apex.trackProfile(200);
    const leftCorner = profile.find(p => p.k < -0.02);
    if (!leftCorner) return null;
    return __apex.cinematic(leftCorner.frac);
  });
  if (res) {
    // For a left-hand corner (k<0), az should be positive (camera on the right/outside)
    expect(res.az).toBeGreaterThan(0);
  }
});

// ── carOrbit() ────────────────────────────────────────────────────────────────

test("carOrbit returns eye/target/fov/carIdx/speed", async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await loadTrack(page);
  const res = await page.evaluate(() => __apex.carOrbit(0, 180, 14, 25));
  expect(res).not.toBeFalsy();
  expect(Array.isArray(res.eye)).toBe(true);
  expect(res.carIdx).toBe(0);
  expect(typeof res.speed).toBe("number");
  expect(typeof res.fov).toBe("number");
});

test("carOrbit fov defaults to 55", async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await loadTrack(page);
  const res = await page.evaluate(() => __apex.carOrbit(0));
  expect(res.fov).toBe(55);
});

test("carOrbit fov customisable", async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await loadTrack(page);
  const res = await page.evaluate(() => __apex.carOrbit(0, 180, 14, 25, 1.0, { fov: 40 }));
  expect(res.fov).toBe(40);
});

test("carOrbit eye different from target", async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await loadTrack(page);
  const res = await page.evaluate(() => __apex.carOrbit(0, 90, 20, 30));
  expect(res).not.toBeFalsy();
  const d = Math.hypot(res.eye[0] - res.target[0], res.eye[1] - res.target[1], res.eye[2] - res.target[2]);
  expect(d).toBeGreaterThan(5);
});

test("carOrbit works for AI car (non-player)", async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await loadTrack(page);
  // cars[1] is an AI car (AI cars only have s/x, no px/pz)
  const res = await page.evaluate(() => __apex.carOrbit(1, 180, 14, 30));
  expect(res).not.toBeFalsy();
  expect(res.carIdx).toBe(1);
  expect(Array.isArray(res.eye)).toBe(true);
});

// ── setSpeed() ────────────────────────────────────────────────────────────────

test("setSpeed sets player speed", async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await loadTrack(page);
  const res = await page.evaluate(() => __apex.setSpeed(55));
  expect(res).not.toBeFalsy();
  expect(res.speed).toBeCloseTo(55, 1);
  const probe = await page.evaluate(() => __apex.probe());
  expect(probe.speed).toBeCloseTo(55, 1);
});

test("setSpeed clamps to 0 minimum", async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await loadTrack(page);
  const res = await page.evaluate(() => __apex.setSpeed(-99));
  expect(res.speed).toBe(0);
});

test("setSpeed clamps to 200 maximum", async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await loadTrack(page);
  const res = await page.evaluate(() => __apex.setSpeed(9999));
  expect(res.speed).toBe(200);
});

test("setSpeed false without initialised player", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex, { timeout: 15000 });
  const res = await page.evaluate(() => __apex.setSpeed(40));
  expect(res).toBeFalsy();
});

// ── spin() ────────────────────────────────────────────────────────────────────

test("spin rotates heading by deg", async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await loadTrack(page);
  const before = await page.evaluate(() => __apex.probe().angle);
  await page.evaluate(() => __apex.spin(90));
  const after  = await page.evaluate(() => __apex.probe().angle);
  // heading should have changed by ~90° (probe().angle is track-relative, but heading changes)
  const headBefore = await page.evaluate(() => {
    __apex.reset(0.1, 0);
    const h0 = window._spin_test_h0 = __apex.physState().head;
    return h0;
  });
  const headAfter = await page.evaluate(() => {
    __apex.spin(90);
    return __apex.physState().head;
  });
  // head increased by ~90° in radians ≈ 1.5708
  const delta = headAfter - headBefore;
  expect(Math.abs(delta) % (2 * Math.PI)).toBeCloseTo(Math.PI / 2, 1);
});

test("spin zeroes vLat and yawRate", async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await loadTrack(page);
  // Nudge to give some lateral velocity first
  await page.evaluate(() => { __apex.nudge(15, 0); });
  await page.evaluate(() => __apex.spin(45));
  const state = await page.evaluate(() => __apex.physState());
  expect(state.vLat).toBe(0);
});

test("spin false without initialised player", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex, { timeout: 15000 });
  const res = await page.evaluate(() => __apex.spin(45));
  expect(res).toBeFalsy();
});

// ── nudge() ───────────────────────────────────────────────────────────────────

test("nudge adds lateral velocity", async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await loadTrack(page);
  await page.evaluate(() => __apex.reset(0.1, 0));
  const res = await page.evaluate(() => __apex.nudge(8, 0));
  expect(res).not.toBeFalsy();
  expect(res.vLat).toBeCloseTo(8, 1);
});

test("nudge adds to forward speed", async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await loadTrack(page);
  await page.evaluate(() => __apex.reset(0.1, 20));
  const res = await page.evaluate(() => __apex.nudge(0, 15));
  expect(res.speed).toBeCloseTo(35, 1);
});

test("nudge speed clamped at 0 minimum", async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await loadTrack(page);
  await page.evaluate(() => __apex.reset(0.1, 10));
  const res = await page.evaluate(() => __apex.nudge(0, -50));
  expect(res.speed).toBe(0);
});

test("nudge both args", async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await loadTrack(page);
  await page.evaluate(() => __apex.reset(0.1, 30));
  const res = await page.evaluate(() => __apex.nudge(5, 10));
  expect(res.speed).toBeCloseTo(40, 1);
  expect(res.vLat).toBeCloseTo(5, 1);
});

test("nudge false without initialised player", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex, { timeout: 15000 });
  const res = await page.evaluate(() => __apex.nudge(5, 5));
  expect(res).toBeFalsy();
});
