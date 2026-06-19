// @ts-check
import { test, expect } from "@playwright/test";

// Navigate the menus and start a live race (physics running, not frozen).
async function startLiveRace(page) {
  await page.goto("/");
  await page.locator("#mb-race").click();
  await page.locator("#sel-go").click();
  await page.locator("#rs-go").click();
  await page.waitForFunction(
    () => window.__apex && window.__apex.info().track != null,
    { timeout: 10_000 }
  );
  // go() skips the countdown and sets state="race" without freezing physics.
  await page.evaluate(() => window.__apex.go());
}

function playerCar(carsArr) {
  return carsArr.find((c) => c.p);
}

// Pump N physics ticks of dt seconds each, with the given steer/throttle/brake.
// Using step() + setInput() bypasses the rAF timer so tests work at any GPU speed.
async function sim(page, ticks, { steer = 0, throttle = false, brake = false } = {}) {
  await page.evaluate(
    ([n, inp]) => {
      window.__apex.setInput(inp);
      window.__apex.step(1 / 60, n);
      window.__apex.clearInput();
    },
    [ticks, { steer, throttle, brake }]
  );
}

test.describe("Apex 26 — steering physics", () => {
  test("right steering (+1) moves car to the right (+x)", async ({ page }) => {
    await startLiveRace(page);
    // Centre the player at 30 m/s on an early straight. Let 5 ticks settle.
    await page.evaluate(() => { window.__apex.jump(0.05, 30, 0); });
    await sim(page, 5);

    const x0 = playerCar(await page.evaluate(() => window.__apex.cars())).x;

    // 120 ticks ≈ 2 s of simulated time at full right lock (steer = 1).
    await sim(page, 120, { steer: 1, throttle: true });

    const after = playerCar(await page.evaluate(() => window.__apex.cars()));

    // At 30 m/s with steer = 1 the car moves several metres to the right.
    // 0.5 m is a very conservative lower bound.
    expect(after.x).toBeGreaterThan(x0 + 0.5);
  });

  test("left steering (−1) moves car to the left (−x)", async ({ page }) => {
    await startLiveRace(page);
    await page.evaluate(() => { window.__apex.jump(0.05, 30, 0); });
    await sim(page, 5);

    const x0 = playerCar(await page.evaluate(() => window.__apex.cars())).x;

    await sim(page, 120, { steer: -1, throttle: true });

    const after = playerCar(await page.evaluate(() => window.__apex.cars()));
    expect(after.x).toBeLessThan(x0 - 0.5);
  });

  test("opposite steering directions produce symmetrical x changes", async ({ page }) => {
    await startLiveRace(page);

    // — right pass —
    await page.evaluate(() => { window.__apex.jump(0.05, 30, 0); });
    await sim(page, 5);
    await sim(page, 60, { steer: 1, throttle: true });
    const xRight = playerCar(await page.evaluate(() => window.__apex.cars())).x;

    // — left pass (reset) —
    await page.evaluate(() => { window.__apex.jump(0.05, 30, 0); });
    await sim(page, 5);
    await sim(page, 60, { steer: -1, throttle: true });
    const xLeft = playerCar(await page.evaluate(() => window.__apex.cars())).x;

    expect(xRight).toBeGreaterThan(0.4);
    expect(xLeft).toBeLessThan(-0.4);
    // Symmetric within 30 % of each other's magnitude.
    expect(Math.abs(xRight + xLeft)).toBeLessThan(Math.max(xRight, -xLeft) * 0.3);
  });

  test("car drifts outward at a corner with no steering — no auto-steer", async ({ page }) => {
    await startLiveRace(page);

    // corners() returns lap fractions where |curvature| > 0.006 m⁻¹.
    const corners = await page.evaluate(() => window.__apex.corners());
    expect(corners.length).toBeGreaterThan(0);

    // Jump to the first corner, centred, at 30 m/s.
    await page.evaluate((f) => { window.__apex.jump(f, 30, 0); }, corners[0]);
    await sim(page, 3);  // initialise angle to 0

    const x0 = playerCar(await page.evaluate(() => window.__apex.cars())).x;

    // 90 ticks ≈ 1.5 s with steer = 0. The Frenet curvature term rotates
    // the heading angle so the car drifts outward — no magic auto-steer.
    await sim(page, 90, { steer: 0, throttle: true });

    const x1 = playerCar(await page.evaluate(() => window.__apex.cars())).x;

    // Even at minimum qualifying curvature (0.006 m⁻¹) at 30 m/s the car
    // slides > 1 m in 1.5 s of simulated time.
    expect(Math.abs(x1 - x0)).toBeGreaterThan(0.5);
  });

  test("yaw telemetry shows positive yaw after right steering", async ({ page }) => {
    await startLiveRace(page);
    await page.evaluate(() => { window.__apex.jump(0.05, 30, 0); });
    await sim(page, 5);

    const yaw0 = playerCar(await page.evaluate(() => window.__apex.cars())).yaw;
    expect(Math.abs(yaw0)).toBeLessThan(0.05);  // near zero before any input

    // 60 ticks at full right lock, then 20 more ticks to let yawVis damp.
    await sim(page, 60, { steer: 1, throttle: true });
    await sim(page, 20);

    const yaw1 = playerCar(await page.evaluate(() => window.__apex.cars())).yaw;
    // steer = clamp(angle/0.52, -1,1) → 1 at full lock.
    // yawVis converges to steerVis * 0.35 ≈ 0.35 rad. Expect at least 0.15.
    expect(yaw1).toBeGreaterThan(0.15);
  });

  test("zero steer on a straight keeps the car roughly centred", async ({ page }) => {
    await startLiveRace(page);

    // Park at a low-curvature straight section (first 5 % of Bahrain is start/finish)
    await page.evaluate(() => { window.__apex.jump(0.0, 30, 0); });
    await sim(page, 5);

    const x0 = playerCar(await page.evaluate(() => window.__apex.cars())).x;

    // 120 ticks ≈ 2 s with no steer input and no curvature
    await sim(page, 120, { steer: 0, throttle: true });

    const x1 = playerCar(await page.evaluate(() => window.__apex.cars())).x;

    // On a straight, angle stays at 0 and x should barely move.
    // Allow up to 0.4 m of drift (straight isn't perfectly 0 curvature).
    expect(Math.abs(x1 - x0)).toBeLessThan(0.4);
  });
});
