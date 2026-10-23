// @ts-check
// Grounded runtime contracts for car effects. The debug surface reports the
// actual draw decisions; tests drive real physics state rather than toggling
// renderer-only flags.
//
// ONE BOOT PER WORKER (sharedTest): nine boots became none. Both helpers walk
// the shared page back to the title and pin the default car (McLaren, nothing
// fitted) before racing — the ERS and exhaust contracts below are about THAT
// car, and the shared page carries whatever the previous test fitted.
import { sharedTest as test, test as freshTest, expect, BOOT_MS, awaitTrackBuild } from "../helpers/fixtures.js";
import { syncFactoryMcLarenSeat } from "../helpers/factory-seat.js";
import { toMenu, pinFreePlay } from "../helpers/shared-page.js";

async function startCar(page, speed = 30) {
  await toMenu(page);
  await pinFreePlay(page);
  await page.evaluate(() => window.__apex.race("monza"));
  // race() BUILDS THE WORLD ASYNCHRONOUSLY, and every call below needs
  // G.player. The whole setup used to sit in one evaluate with race(), so on
  // any boot where the build had not finished it ran against no car at all —
  // and __apex returns false/null there rather than throwing, so nothing said
  // so. carEffects() then reported null and five of the nine tests in this file
  // were red. The one that passed used expect.poll, which simply retried until
  // the world existed. Same wait every other race-level spec uses.
  await page.waitForFunction(() => window.__apex.info().track != null,
    null, { polling: 100, timeout: BOOT_MS });
  const ready = await page.evaluate((initialSpeed) => {
    // go() skips the countdown: in "count" state update() runs only the light
    // sequence and RETURNS — no car physics. Without it a short step() run
    // never computes deploy state (docs/DEBUG-HOOKS.md: race()+go() first);
    // only the long-stepping tests here survived, by outlasting the countdown.
    window.__apex.go();
    window.__apex.jump(0.1, initialSpeed, 0);
    window.__apex.freeze(true);
    const energy = window.__apex.setEnergy(1);
    window.__apex.setBoost(false);
    window.__apex.clearInput();
    // setEnergy returns FALSE with no player. Report it rather than leave every
    // assertion below measuring a car that is not there.
    return !!energy;
  }, speed);
  expect(ready, "race() never produced a player car — the setup below ran on nothing").toBe(true);
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

  test("ERS deployment lights the deploy lamp", async ({ page }) => {
    await startCar(page, 30);
    await page.evaluate(() => {
      // Deploy (and the ersDeploy lamp) follow onThrottle — same gate as the
      // drain. A coasting setBoost alone leaves ersDeploy false after the
      // bug-hunt throttle branch (selected packed-4 on #1289).
      window.__apex.setInput({ steer: 0, throttle: true, brake: false });
      window.__apex.setBoost(true);
      window.__apex.step(1 / 60, 2);
    });
    const state = await effects(page);
    // No boostFlame assertion: __apex.carEffects() hard-codes boostFlame:false
    // (js/agent/apex.js), so it could never fail. Tracked in the PR body (C2-03).
    expect(state).toEqual(expect.objectContaining({ ersDeploy: true }));
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
      window.__apex.setInput({ steer: 0, throttle: true, brake: false });
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
    await toMenu(page);
    // A dry daytime race, so nothing but the grid state can light the rear.
    await pinFreePlay(page, { race: ["monza", "day", "dry"] });
    // race() DOES NOT land in "count" synchronously any more: startRace() is
    // async since the lazy-scenery split (it awaits ensureScenery), and race()
    // does not await it. Reading carEffects() on return gets null, because
    // there is no player yet. Wait for the state the hook is documented to
    // reach instead of assuming the call was synchronous.
    await page.waitForFunction(() => window.__apex.info().state === "count",
      null, { polling: 100, timeout: 30_000 });
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

// D·DP3: lazy flap / wheel-extra meshes must warm during load/countdown, not after green.
async function bootTlxRace(page) {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex && window.__apex.race, null, { polling: 100, timeout: BOOT_MS });
  await syncFactoryMcLarenSeat(page);
  await page.evaluate(() => window.__apex.race("monza", "day", "dry"));
  await awaitTrackBuild(page);
  await page.evaluate(() => window.__apex.go());
  await page.waitForFunction(() => {
    const i = window.__apex.info && window.__apex.info();
    return i && i.state === "race";
  }, null, { polling: 100, timeout: 60_000 });
}

async function sampleGeo(page) {
  return page.evaluate(() => {
    const tlx = typeof GLX !== "undefined" && GLX.__tlx;
    if (!tlx || typeof tlx.memState !== "function") return null;
    const ms = tlx.memState();
    const flaps = (typeof CarMesh !== "undefined" && CarMesh.flapState) ? CarMesh.flapState() : null;
    const info = window.__apex.info ? window.__apex.info() : {};
    const ps = window.__apex.physState && window.__apex.physState();
    return {
      geoLive: ms.geoLive | 0,
      geoKinds: ms.geoKinds || {},
      flaps,
      state: info.state,
      raceT: ps && ps.raceT != null ? ps.raceT : 0,
      prog: ps && ps.prog != null ? ps.prog : 0,
    };
  });
}

// freshTest: bootTlxRace goto()s a TLX page. On sharedTest that would leave the
// worker on three.js and red later GLX-only specs in the same shard (parts-physics
// environment-surface gate → GLXShaders is not defined, selected-2 #3487).
freshTest.describe("race geometry stable after green", () => {
  freshTest.use({ viewport: { width: 844, height: 390 } });

  freshTest.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem("apex26.gfxBackend", "three");
        localStorage.setItem("apex26.tlxForceGL", "1");
        localStorage.setItem("apex26.gfxPreset", JSON.stringify("medium"));
      } catch (_) { /* */ }
    });
  });

  freshTest("geoLive does not grow over the first stretch of a race (TLX)", async ({ page }) => {
    freshTest.setTimeout(300_000);
    await bootTlxRace(page);
    await page.evaluate(() => window.__apex.headless(false));
    // Step the sim instead of waiting on TLX presents — SwiftShader can stall
    // rAF while the loading cover is down, so memState().presents may not move.
    await page.evaluate(() => {
      for (let i = 0; i < 90; i++) window.__apex.step(1 / 60, 1);
    });

    const t0 = await sampleGeo(page);
    expect(t0, "TLX memState available").toBeTruthy();
    expect(t0.flaps && t0.flaps.sets, `flap sets should be warm before green: ${JSON.stringify(t0)}`).toBeGreaterThan(0);

    await page.evaluate(() => {
      window.__apex.setInput({ throttle: 1, steer: 0, brake: 0 });
      for (let i = 0; i < 900; i++) window.__apex.step(1 / 60, 1);
      window.__apex.clearInput();
    });

    const t1 = await sampleGeo(page);
    expect(t1.prog - t0.prog, `sim advanced: prog ${t0.prog} -> ${t1.prog}`).toBeGreaterThan(50);
    expect(t1.geoLive, `geoLive grew after green: ${t0.geoLive} -> ${t1.geoLive} kinds0=${JSON.stringify(t0.geoKinds)} kinds1=${JSON.stringify(t1.geoKinds)} flaps0=${JSON.stringify(t0.flaps)} flaps1=${JSON.stringify(t1.flaps)}`)
      .toBeLessThanOrEqual(t0.geoLive + 2);
    expect(t1.flaps.sets, "flap set cache must not grow after green").toBeLessThanOrEqual(t0.flaps.sets);
    expect(t1.flaps.elements, "flap element cache must not grow after green").toBeLessThanOrEqual(t0.flaps.elements);
    await page.evaluate(() => window.__apex.headless(true));
  });
});
