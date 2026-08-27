// Contract tests for the extended camera hooks (orbit fov, cinematic, carOrbit)
// and driving hooks (setSpeed, spin, nudge) added in v196.
// All tests use the headless control loop so they run fast with no rendering.

import { sharedTest as test, expect } from "../helpers/fixtures.js";

const VIEWPORT = { width: 844, height: 390 };

async function loadTrack(page, track = "monza") {
  // Shared page: booted once per worker by the fixture, so this is a no-op
  // in the common case. Tests that need a VIRGIN page (asserting
  // pre-track state) keep their own explicit page.goto("/") below —
  // that reloads the shared page and gives them exactly that.
  const live = await page.evaluate(() => window.__apex != null).catch(() => false);
  if (!live) {
    await page.goto("/");
    await page.waitForFunction(() => window.__apex, null, { polling: 100, timeout: 15000 });
  }
  // Wait for the BUILD, not for a stopwatch. This was `await new Promise(r =>
  // setTimeout(r, 3000))` inside the evaluate — wrong in both directions at
  // once: on a loaded box a 40-circuit build can exceed 3 s and the test then
  // races a half-built track, and on a quiet box it burns most of 3 s per call
  // for nothing. waitForFunction polls, so it costs what the build costs.
  await page.evaluate((t) => { __apex.race(t); }, track);
  await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: 20000 });
  await page.evaluate(() => {
    __apex.headless(true);
    __apex.reset(0.1, 30);
  });
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

test("cinematic camera outside left corner (k>0)", async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await loadTrack(page, "monaco");
  // Find a LEFT-hand corner: +k bends the road left (measured — see the
  // corner-table note in js/game/agentview.js; the old "+k = right" labels
  // were backwards, and this spec pinned the camera to the INSIDE with them).
  const res = await page.evaluate(() => {
    const profile = __apex.trackProfile(200);
    const leftCorner = profile.find(p => p.k > 0.02);
    if (!leftCorner) return null;
    return __apex.cinematic(leftCorner.frac);
  });
  // Monaco has left-hand corners — a null here means trackProfile/curvature
  // regressed, so assert non-null instead of silently passing (was `if (res)`).
  expect(res).not.toBeNull();
  // Outside of a left-hander (k>0) is the RIGHT side of the road; orbit()'s
  // az>0 is the right side → az positive.
  expect(res.az).toBeGreaterThan(0);
});

test("cinematic camera outside right corner (k<0)", async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await loadTrack(page, "monaco");
  const res = await page.evaluate(() => {
    const profile = __apex.trackProfile(200);
    const rightCorner = profile.find(p => p.k < -0.02);
    if (!rightCorner) return null;
    return __apex.cinematic(rightCorner.frac);
  });
  // Monaco has right-hand corners — assert non-null instead of silently passing.
  expect(res).not.toBeNull();
  // Outside of a right-hander (k<0) is the LEFT side → az negative.
  expect(res.az).toBeLessThan(0);
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
  // ONE evaluate, deliberately. headless(true) only skips RENDERING — see the
  // hook's own comment — headless() skips rendering, so the physics loop keeps
  // integrating between round-trips and the car coasts. Read across two
  // evaluates this measured 54.498 against a toBeCloseTo(55, 1) tolerance of
  // 0.05: a real race that only shows up when the box is loaded enough to
  // stretch the gap. Sampling both in one round-trip closes the window and
  // still asserts what the name promises.
  const r = await page.evaluate(() => {
    const res = __apex.setSpeed(55);
    return { res, probeSpeed: __apex.probe().speed };
  });
  expect(r.res).not.toBeFalsy();
  expect(r.res.speed).toBeCloseTo(55, 1);
  expect(r.probeSpeed).toBeCloseTo(55, 1);
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
  await page.waitForFunction(() => window.__apex, null, { polling: 100, timeout: 15000 });
  const res = await page.evaluate(() => __apex.setSpeed(40));
  expect(res).toBeFalsy();
});

// ── spin() ────────────────────────────────────────────────────────────────────

test("spin rotates heading by deg", async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await loadTrack(page);
  // ONE evaluate: physics keeps integrating between round-trips even under
  // headless(true) (that only skips RENDERING — js/game/apex.js headless()), so a
  // heading sampled in a separate call has drifted by an unknown amount.
  const r = await page.evaluate(() => {
    __apex.reset(0.1, 0);
    const angleBefore = __apex.probe().angle;
    const headBefore = __apex.physState().head;
    __apex.spin(90);
    return { angleBefore, headBefore,
             angleAfter: __apex.probe().angle, headAfter: __apex.physState().head };
  });
  // spin() adds exactly deg*PI/180 (js/game/apex.js spin()), so assert the SIGNED delta.
  // The old form took Math.abs() before the modulo, which passed just as
  // happily for spin(-90) — i.e. it could not tell the hook's direction from
  // its opposite, and direction is the whole contract.
  expect(r.headAfter - r.headBefore).toBeCloseTo(Math.PI / 2, 3);
  // probe().angle is track-relative and was computed twice and never asserted.
  // Turning the car 90° off the tangent must move it.
  expect(r.angleAfter).not.toBeCloseTo(r.angleBefore, 2);
});

test("spin zeroes vLat and yawRate", async ({ page }) => {
  await page.setViewportSize(VIEWPORT);
  await loadTrack(page);
  // The title names TWO quantities and only vLat used to be asserted, because
  // physState() did not report yawRate at all — the test could cover half its
  // own name and no more. yawRate is exposed now (js/game/apex.js), so both
  // halves are checked, in one evaluate so the physics loop cannot run between
  // the nudge and the read.
  const r = await page.evaluate(() => {
    __apex.nudge(15, 0);                       // give it lateral velocity first
    const before = __apex.physState();
    __apex.spin(45);
    const after = __apex.physState();
    return { beforeVLat: before.vLat, afterVLat: after.vLat, afterYaw: after.yawRate };
  });
  // Anti-vacuity: zero-after means nothing if it was already zero before.
  expect(Math.abs(r.beforeVLat)).toBeGreaterThan(0);
  expect(r.afterVLat).toBe(0);
  expect(r.afterYaw).toBe(0);
});

test("spin false without initialised player", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex, null, { polling: 100, timeout: 15000 });
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
  await page.waitForFunction(() => window.__apex, null, { polling: 100, timeout: 15000 });
  const res = await page.evaluate(() => __apex.nudge(5, 5));
  expect(res).toBeFalsy();
});
