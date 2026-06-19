// @ts-check
// Tier-b physics: lateral-velocity "drift factor" + grip circle, and the
// speed-sensitive steer taper. Uses the setPhysics()/physState() hooks to drive
// the model deterministically and assert the qualitative contract:
//   - DRIFT=0 reproduces the on-rails kinematic model (no lateral slip)
//   - DRIFT>0 makes the car understeer (turn LESS than commanded = run wider)
//   - with no steering, slip decays back to zero (no spurious crabbing)
//   - the model never NaNs or throws the car off the world
//   - SPEED STEER keeps more steering at high speed
import { test, expect } from "@playwright/test";

async function startRace(page) {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex != null, { timeout: 8000 });
  await page.evaluate(() => window.__apex.race("monza", "day", "dry"));
  await page.waitForFunction(() => window.__apex.info().track != null, { timeout: 8000 });
  await page.evaluate(() => window.__apex.go());
}

// Hold full lock through a corner at a given DRIFT; report how far the heading
// swings (turn-in) and the peak slip angle.
const corner = (page, drift) => page.evaluate((d) => {
  window.__apex.setPhysics({ drift: d });
  window.__apex.jump(0.10, 30, 0);
  window.__apex.setInput({ steer: 1, throttle: false });
  const a0 = window.__apex.probe().angle;
  let peakSlip = 0;
  for (let i = 0; i < 36; i++) {
    window.__apex.step(1 / 60, 1);
    peakSlip = Math.max(peakSlip, Math.abs(window.__apex.physState().slipDeg));
  }
  const a1 = window.__apex.probe().angle;
  window.__apex.clearInput();
  return { turn: Math.abs(a1 - a0), peakSlip };
}, drift);

test.describe("Apex 26 — tier-b drift & grip", () => {
  test("DRIFT=0 is on-rails: no lateral slip", async ({ page }) => {
    await startRace(page);
    const r = await page.evaluate(() => {
      window.__apex.setPhysics({ drift: 0 });
      window.__apex.jump(0.10, 30, 0);
      window.__apex.setInput({ steer: 1, throttle: false });
      let maxSlip = 0;
      for (let i = 0; i < 36; i++) {
        window.__apex.step(1 / 60, 1);
        maxSlip = Math.max(maxSlip, Math.abs(window.__apex.physState().slipDeg));
      }
      window.__apex.clearInput();
      return { maxSlip };
    });
    expect(r.maxSlip).toBeLessThan(0.5);   // effectively zero slip
  });

  test("DRIFT>0 understeers: more slip and less turn-in than on-rails", async ({ page }) => {
    await startRace(page);
    const grip = await corner(page, 0);
    const slide = await corner(page, 0.6);
    expect(slide.peakSlip).toBeGreaterThan(4);          // a real slide angle
    expect(grip.peakSlip).toBeLessThan(1);
    // understeer: with slide the heading swings LESS for the same full lock
    expect(slide.turn).toBeLessThan(grip.turn);
  });

  test("slip decays to zero with no steering input", async ({ page }) => {
    await startRace(page);
    const tail = await page.evaluate(() => {
      window.__apex.setPhysics({ drift: 0.8 });
      window.__apex.jump(0.10, 40, 0);
      // throw it into a slide...
      window.__apex.setInput({ steer: 1, throttle: false });
      for (let i = 0; i < 20; i++) window.__apex.step(1 / 60, 1);
      // ...then release and let grip recover
      window.__apex.setInput({ steer: 0, throttle: false });
      for (let i = 0; i < 60; i++) window.__apex.step(1 / 60, 1);
      const s = window.__apex.physState();
      window.__apex.clearInput();
      return Math.abs(s.vLat);
    });
    expect(tail).toBeLessThan(0.5);    // slip bled away
  });

  test("high drift + aggressive steering never NaNs or flies off", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));
    await startRace(page);
    const r = await page.evaluate(() => {
      window.__apex.setPhysics({ drift: 0.9 });
      window.__apex.jump(0.0, 70, 0);
      let maxAbsX = 0, finite = true;
      for (let i = 0; i < 400; i++) {
        window.__apex.setInput({ steer: Math.sin(i / 7), throttle: true });
        window.__apex.step(1 / 60, 1);
        const p = window.__apex.probe();
        if (!Number.isFinite(p.x) || !Number.isFinite(p.s)) finite = false;
        maxAbsX = Math.max(maxAbsX, Math.abs(p.x));
      }
      window.__apex.clearInput();
      window.__apex.setPhysics({ drift: 0.2 });   // restore default
      return { finite, maxAbsX };
    });
    expect(errors).toEqual([]);
    expect(r.finite).toBe(true);
    expect(r.maxAbsX).toBeLessThan(40);   // stayed in the track's neighbourhood
  });

  test("SPEED STEER: higher keeps more turn-in at high speed", async ({ page }) => {
    await startRace(page);
    const turnAtSpeed = (ref) => page.evaluate((r) => {
      window.__apex.setPhysics({ drift: 0, speedRef: r });
      window.__apex.jump(0.0, 60, 0);          // high speed, on the straight
      window.__apex.setInput({ steer: 1, throttle: false });
      const a0 = window.__apex.probe().angle;
      for (let i = 0; i < 10; i++) window.__apex.step(1 / 60, 1);
      const a1 = window.__apex.probe().angle;
      window.__apex.clearInput();
      return Math.abs(a1 - a0);
    }, ref);
    const calm = await turnAtSpeed(50);    // taper steering hard at speed
    const sharp = await turnAtSpeed(120);  // keep steering at speed
    expect(sharp).toBeGreaterThan(calm * 1.2);
  });
});
