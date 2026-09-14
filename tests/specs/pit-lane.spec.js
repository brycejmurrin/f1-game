// @ts-check
// PIT LANE — the stop, driven.
//
// tests/unit/pit-lane.test.mjs pins the geometry on all 42 circuits without a
// browser. This is the half that needs one: that calling a stop actually
// limits the car, that a stop fits fresh tyres and is held for the box time,
// that blowing through the box misses it, and that with TYRE WEAR off none of
// it exists.
//
// THE LANE IS A STATE, NOT A PLACE. js/race/pit-lane.js records why at length:
// a driveable lane out beyond the road edge was built and measured badly twice
// (a forced boundary went through Monaco's buildings; fitting to existing room
// found 2.4 m at Monza, because the scenery puts a pit WALL there). So there is
// no lateral lane to assert on — what is asserted is the limiter, the stop, and
// the fact that neither fires for a car that has not called one.
//
// It deliberately does NOT re-measure pit loss. That is a lap-time sample
// costing minutes of SwiftShader per run; it was measured while the lane was
// built and is recorded in docs/research/TYRE-STRATEGY-DESIGN.md. What this
// asserts is that every mechanism the number depends on is intact.
//
// COST: one track build, then ~20 s of stepping. headless(true) throughout —
// nothing here looks at a pixel.
import { test, expect, BOOT_MS, awaitTrackBuild } from "../helpers/fixtures.js";

async function armedAt(page, track = "monza") {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
  await page.evaluate((t) => window.__apex.race(t, "day", "dry", { laps: 25 }), track);
  await awaitTrackBuild(page);
  await page.evaluate(() => {
    window.__apex.headless(true);
    window.__apex.go();
    window.__apex.tyres({ level: "real" });
    window.__apex.rivals([]);
  });
}

test.describe("pit lane", () => {
  test("the limiter fires only for a car that called a stop", async ({ page }) => {
    await armedAt(page);

    const zone = await page.evaluate(() => window.__apex.pit());
    expect(zone, "the lane must resolve once TYRE WEAR is on").toBeTruthy();
    expect(zone.enabled).toBe(true);
    expect(zone.lenM).toBeGreaterThan(100);
    expect(zone.limitKph).toBeGreaterThan(20);

    // NOT ARMED: full throttle through the window must be free running. This is
    // the assertion that stops the pit limiter from quietly becoming a speed cap
    // on everybody's start/finish straight.
    const free = await page.evaluate(() => {
      const A = window.__apex;
      A.jump(0.93, 45, 0); A.aim(0);
      let peak = 0, everInLane = false;
      for (let i = 0; i < 420; i++) {
        A.setInput({ steer: 0, throttle: true, brake: false });
        A.step(1 / 60, 1);
        peak = Math.max(peak, A.physState().speed);
        if (A.pit().inLane) everInLane = true;
      }
      return { peak, everInLane, inWindow: A.pit().inWindow };
    });
    expect(free.everInLane, "a car that never called a stop must never be 'in the lane'").toBe(false);
    expect(free.peak, "no limiter may fire on an unarmed car").toBeGreaterThan(40);

    // ARMED: the same run, limited. The cap is read back from the model rather
    // than hard-coded, because it is a fraction of the speed envelope.
    const limited = await page.evaluate(() => {
      const A = window.__apex;
      A.jump(0.93, 45, 0); A.aim(0);
      A.pit({ arm: true });
      const cap = A.pit().limitKph / 3.6;
      let settled = 0, sawLane = false;
      for (let i = 0; i < 600; i++) {
        A.setInput({ steer: 0, throttle: true, brake: false });
        A.step(1 / 60, 1);
        const p = A.pit();
        if (p.inLane) { sawLane = true; settled = A.physState().speed; }
      }
      return { settled, cap, sawLane };
    });
    expect(limited.sawLane, "arming and entering the window must put the car in the lane").toBe(true);
    // Bled toward the cap, never teleported, so allow a little overshoot.
    expect(limited.settled).toBeLessThan(limited.cap * 1.2);
  });

  test("a stop fits fresh tyres and is held for the box time", async ({ page }) => {
    await armedAt(page);

    const out = await page.evaluate(() => {
      const A = window.__apex;
      A.jump(0.60, 30, 0); A.aim(0);
      // Wear the set in first, so "fresh" after the stop is a real change.
      for (let i = 0; i < 60 * 30; i++) { A.setInput({ steer: 0, throttle: true, brake: false }); A.step(1 / 60, 1); }
      const wornBefore = A.tyres().wear;

      A.jump(0.93, 30, 0); A.aim(0);
      A.pit({ arm: true });
      let sawBox = false, boxTicks = 0; const states = [];
      for (let i = 0; i < 60 * 60; i++) {
        const p = A.pit();
        if (states[states.length - 1] !== p.state) states.push(p.state);
        // Brake for the box on a stopping envelope, exactly as for a corner.
        const ps = A.physState();
        const togo = p.inWindow ? p.boxM - p.atM : 1e9;
        const want = togo > 0 ? Math.min(p.limitKph / 3.6, Math.sqrt(2 * 5 * togo)) : 0;
        A.setInput({ steer: 0, throttle: ps.speed < want, brake: ps.speed > want * 1.05 });
        A.step(1 / 60, 1);
        if (A.pit().state === "box") { sawBox = true; boxTicks++; }
        if (A.pit().state === "out") break;
      }
      return { wornBefore, sawBox, boxTicks, states, after: A.tyres(), pit: A.pit() };
    });

    expect(out.wornBefore, "the set must be worn before the stop for 'fresh' to mean anything").toBeGreaterThan(0);
    expect(out.sawBox, `the car never reached the box (states: ${out.states.join(" -> ")})`).toBe(true);
    expect(out.pit.stops).toBe(1);
    // Held for the box time, at 60 Hz, with a tick of slack either side.
    expect(out.boxTicks).toBeGreaterThan(out.pit.boxS * 60 * 0.9);
    expect(out.boxTicks).toBeLessThan(out.pit.boxS * 60 * 1.3);
    // ...and the whole point: a fresh set.
    expect(out.after.wear).toBeLessThan(out.wornBefore);
    expect(out.after.wear).toBeLessThan(0.02);
    expect(out.after.stints).toBe(2);
  });

  test("blowing through the box misses the stop", async ({ page }) => {
    // The stop is not a trigger volume you drive over — you have to actually
    // stop in it, which is what makes the pit lane a thing you do rather than a
    // thing that happens to you.
    await armedAt(page);
    const out = await page.evaluate(() => {
      const A = window.__apex;
      A.jump(0.93, 30, 0); A.aim(0);
      A.pit({ arm: true });
      for (let i = 0; i < 60 * 40; i++) {
        A.setInput({ steer: 0, throttle: true, brake: false });   // never slows
        A.step(1 / 60, 1);
        if (!A.pit().inWindow && A.pit().stops === 0 && i > 600) break;
      }
      return A.pit();
    });
    expect(out.stops, "a car that never stopped must not have been serviced").toBe(0);
  });

  test("with TYRE WEAR off there is no pit lane at all", async ({ page }) => {
    // The lane is a consequence of wear existing. With the setting off — the
    // shipped default — arming must do nothing and the limiter must not fire.
    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
    await page.evaluate(() => window.__apex.race("monza", "day", "dry"));
    await awaitTrackBuild(page);
    const out = await page.evaluate(() => {
      const A = window.__apex;
      A.headless(true); A.go(); A.rivals([]);
      A.jump(0.93, 45, 0); A.aim(0);
      A.pit({ arm: true });
      const armed = A.pit().armed;
      let peak = 0;
      for (let i = 0; i < 420; i++) {
        A.setInput({ steer: 0, throttle: true, brake: false });
        A.step(1 / 60, 1);
        peak = Math.max(peak, A.physState().speed);
      }
      return { enabled: A.pit().enabled, armed, peak, stops: A.pit().stops };
    });
    expect(out.enabled).toBe(false);
    expect(out.armed, "arming must be refused while there is nothing to stop for").toBe(false);
    expect(out.stops).toBe(0);
    expect(out.peak, "no limiter may fire on the start/finish straight").toBeGreaterThan(40);
  });
});
