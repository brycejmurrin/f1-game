// @ts-check
// Grounded runtime contracts for car effects. The debug surface reports the
// actual draw decisions; tests drive real physics state rather than toggling
// renderer-only flags.
import { test, expect } from "@playwright/test";

async function startCar(page, speed = 30) {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex && window.__apex.race, null, { polling: 100, timeout: 10_000 });
  await page.evaluate((initialSpeed) => {
    window.__apex.race("monza");
    // go() skips the countdown: in "count" state update() runs only the light
    // sequence and RETURNS — no car physics. Without it a short step() run
    // never computes deploy state (docs/DEBUG-HOOKS.md: race()+go() first);
    // only the long-stepping tests here survived, by outlasting the countdown.
    window.__apex.go();
    window.__apex.jump(0.1, initialSpeed, 0);
    window.__apex.freeze(true);
    window.__apex.setEnergy(1);
    window.__apex.setBoost(false);
    window.__apex.clearInput();
  }, speed);
}

async function effects(page) {
  return page.evaluate(() =>
    typeof window.__apex.carEffects === "function" ? window.__apex.carEffects() : null
  );
}

test.describe("Car runtime effects", () => {
  test("exposes a minimal boolean effect-state contract", async ({ page }) => {
    await startCar(page);
    await expect.poll(() => effects(page)).toEqual(expect.objectContaining({
      exhaustFlame: expect.any(Boolean),
      brakeGlow: expect.any(Boolean),
      ersDeploy: expect.any(Boolean),
      boostFlame: expect.any(Boolean),
      brakeHeat: expect.any(Number),
      brakeGlowThreshold: expect.any(Number),
      gridLights: expect.any(Boolean),
      gridStrobe: expect.any(Boolean),
    }));
  });

  test("electric ERS deployment never creates an exhaust boost flame", async ({ page }) => {
    await startCar(page, 30);
    await page.evaluate(() => {
      window.__apex.setBoost(true);
      window.__apex.step(1 / 60, 2);
    });
    const state = await effects(page);
    expect(state).toEqual(expect.objectContaining({
      ersDeploy: true,
      boostFlame: false,
    }));
  });

  test("brake glow stays off until braking heat crosses its draw threshold", async ({ page }) => {
    await startCar(page, 40);
    const cold = await effects(page);
    expect(cold).toEqual(expect.objectContaining({ brakeGlow: false }));
    expect(cold.brakeHeat).toBeLessThanOrEqual(cold.brakeGlowThreshold);

    const hot = await page.evaluate(() => {
      window.__apex.setInput({ steer: 0, throttle: false, brake: true });
      if (typeof window.__apex.carEffects !== "function") return null;
      for (let i = 0; i < 600; i++) {
        window.__apex.step(1 / 60, 1);
        const state = window.__apex.carEffects();
        if (state.brakeHeat > state.brakeGlowThreshold) return state;
      }
      return window.__apex.carEffects();
    });
    expect(hot).not.toBeNull();
    expect(hot.brakeHeat).toBeGreaterThan(hot.brakeGlowThreshold);
    expect(hot.brakeGlow).toBe(true);
  });

  test("ERS indicator follows actual deployment rather than the boost toggle", async ({ page }) => {
    // The lamp must track DEPLOYMENT, so the case that matters is BOOST held
    // while nothing comes out. That used to be "too fast" — deploy tapered to
    // exactly 0 above 191 km/h — but the taper is floored now (TAPER_FLOOR),
    // because a BOOST that produced no thrust and cost no energy on every
    // straight was the bug, not the contract. A FLAT BATTERY is what still
    // separates the switch from the deployment, so hold the switch on that.
    await startCar(page, 60);
    await page.evaluate(() => {
      // HOLD THE THROTTLE. A coasting car regens (game.js integrate-speed
      // coast branch), so a battery zeroed here is worth >0 by the second
      // step and the held switch legitimately deploys again — the test was
      // measuring the regen loop, not the lamp. Only the on-throttle branch
      // adds no charge, which is also the scenario the lamp contract is
      // about: on the power, battery flat, switch held, nothing comes out.
      window.__apex.setInput({ steer: 0, throttle: true, brake: false });
      window.__apex.setEnergy(0);
      window.__apex.setBoost(true);
      window.__apex.step(1 / 60, 2);
    });
    expect(await effects(page)).toEqual(expect.objectContaining({ ersDeploy: false }));

    await page.evaluate(() => {
      window.__apex.jump(0.1, 30, 0);
      window.__apex.setEnergy(1);
      window.__apex.setBoost(true);
      window.__apex.step(1 / 60, 2);
    });
    expect(await effects(page)).toEqual(expect.objectContaining({ ersDeploy: true }));
  });

  test("steady throttle does not leave the exhaust continuously flaming", async ({ page }) => {
    await startCar(page, 30);
    await page.evaluate(() => {
      window.__apex.setInput({ steer: 0, throttle: true, brake: false });
      window.__apex.step(1 / 60, 180);
    });
    expect(await effects(page)).toEqual(expect.objectContaining({ exhaustFlame: false }));
  });

  test("a throttle-lift transient can activate the exhaust flame", async ({ page }) => {
    await startCar(page, 30);
    const observed = await page.evaluate(() => {
      if (typeof window.__apex.carEffects !== "function") return null;
      window.__apex.setInput({ steer: 0, throttle: true, brake: false });
      window.__apex.step(1 / 60, 180);
      const steady = window.__apex.carEffects();
      window.__apex.setInput({ steer: 0, throttle: false, brake: false });
      let transient = null;
      for (let i = 0; i < 60; i++) {
        window.__apex.step(1 / 60, 1);
        const state = window.__apex.carEffects();
        if (state.exhaustFlame) {
          transient = state;
          break;
        }
      }
      return { steady, transient };
    });
    expect(observed).not.toBeNull();
    expect(observed.steady.exhaustFlame).toBe(false);
    expect(observed.transient).toEqual(expect.objectContaining({ exhaustFlame: true }));
  });

  // The pre-race grid lights. Deliberately NOT via startCar(): that calls go(),
  // which skips the countdown, and the countdown is the whole subject here. Same
  // reason park()/jump() are avoided — every one of those hooks promotes the game
  // straight to "race".
  async function onGrid(page) {
    await page.goto("/");
    await page.waitForFunction(() => window.__apex && window.__apex.race, null, { polling: 100, timeout: 10_000 });
    // A dry daytime race, so nothing but the grid state can light the rear.
    await page.evaluate(() => window.__apex.race("monza", "day", "dry"));
  }

  test("the rear lights come on for the grid, dry and in daylight", async ({ page }) => {
    await onGrid(page);
    const state = await effects(page);
    expect(state).toEqual(expect.objectContaining({ gridLights: true }));
  });

  test("the grid strobe actually animates on the countdown clock", async ({ page }) => {
    // raceT is pinned at 0 until lights-out — update() returns before `raceT +=
    // dt` while the state is "count" — so anything keyed off raceT is FROZEN on
    // the grid. That is the regression this catches: lights that are on, but
    // solid. Sampled against the game's own running countdown rather than by
    // poking a clock, so it proves the real path animates.
    // Sampled by stepping the game's OWN clock inside one evaluate, not over
    // wall time: step() advances the countdown without promoting out of it, and
    // a round trip per sample on SwiftShader is slower than the 5 Hz flash, so
    // a wall-clock loop measures the box rather than the code.
    await onGrid(page);
    const seen = await page.evaluate(() => {
      const a = window.__apex, states = {};
      for (let i = 0; i < 90; i++) {          // 1.5 s of game time, ~7 flashes
        const e = a.carEffects();
        if (!e || !e.gridLights) return { bailed: a.info().state };
        states[String(e.gridStrobe)] = true;
        a.step(1 / 60, 1);
      }
      return { states: Object.keys(states).sort(), state: a.info().state };
    });
    expect(seen.bailed).toBeUndefined();
    expect(seen.state).toBe("count");
    expect(seen.states).toEqual(["false", "true"]);
  });

  test("the lights stop once the race goes green", async ({ page }) => {
    await onGrid(page);
    expect((await effects(page)).gridLights).toBe(true);
    await page.evaluate(() => window.__apex.go());
    const state = await effects(page);
    expect(state).toEqual(expect.objectContaining({ gridLights: false, gridStrobe: false }));
  });
});
