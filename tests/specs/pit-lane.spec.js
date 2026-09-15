// @ts-check
// PIT LANE — the stop, driven.
//
// tests/unit/pit-lane.test.mjs pins the geometry on all 42 circuits without a
// browser. This is the half that needs one: that calling a stop actually
// limits the car, that a stop fits fresh tyres and is held for the box time,
// that blowing through the box misses it, and that with TYRE WEAR off none of
// it exists.
//
// THE LANE IS A STATE, AND NOW ALSO A PLACE TO STOP — but not the place the
// first two attempts went looking for. js/race/pit-lane.js records why at
// length: a driveable lane out BEYOND the road edge was built and measured
// badly twice (a forced boundary went through Monaco's buildings; fitting to
// existing room found 2.4 m at Monza, because the scenery puts a pit WALL
// there). The lane that exists is the outermost strip of the ROAD across the
// window, painted rather than built, so it moves no boundary and costs no
// geometry. What that buys is the thing this file could not assert before: the
// box is IN the lane, so a car that stops on the racing line has not stopped in
// its box. That rule is asserted below, in both directions.
//
// It deliberately does NOT re-measure pit loss. That is a lap-time sample
// costing minutes of SwiftShader per run; it was measured while the lane was
// built and is recorded in docs/research/TYRE-STRATEGY-DESIGN.md. What this
// asserts is that every mechanism the number depends on is intact.
//
// COST: one track build, then ~20 s of stepping. headless(true) throughout —
// nothing here looks at a pixel.
import { test, expect, BOOT_MS, awaitTrackBuild } from "../helpers/fixtures.js";

async function armedAt(page, track = "monza", { rivals = false } = {}) {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
  await page.evaluate((t) => window.__apex.race(t, "day", "dry", { laps: 25 }), track);
  await awaitTrackBuild(page);
  // The field is cleared for the PLAYER tests — a rival alongside changes the
  // line the car can take and none of them are about racecraft. The AI test
  // below needs the field, so it keeps it.
  await page.evaluate((keep) => {
    window.__apex.headless(true);
    window.__apex.go();
    window.__apex.tyres({ level: "real" });
    if (!keep) window.__apex.rivals([]);
  }, rivals);
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

      // INTO THE LANE, not onto the racing line: the box is a place now, and
      // info().laneX is where it is at this car's own arc position (the lane
      // centre moves three metres across the calendar, so a literal would be a
      // Monza-only test).
      //
      // READ IT FROM INSIDE THE WINDOW. laneX is null outside it — outside it
      // there is no lane to be in — and 0.93 of the lap is NOT inside it: the
      // window opens 320 m before the line, which at Monza is 0.945. 0.99 is
      // in the window on every circuit in the game (it would take a 32 km lap
      // for 1% of it to exceed 320 m), and it is the box's own end of the lane,
      // which is the position whose width actually matters.
      A.jump(0.99, 30, 0);
      const laneX = A.pit().laneX;
      A.jump(0.93, 30, laneX); A.aim(0);
      A.pit({ arm: true });
      let sawBox = false, boxTicks = 0; const states = [];
      for (let i = 0; i < 60 * 60; i++) {
        const p = A.pit();
        if (states[states.length - 1] !== p.state) states.push(p.state);
        // Brake for the box on a stopping envelope, exactly as for a corner.
        const ps = A.physState();
        const togo = p.inWindow ? p.boxM - p.atM : 1e9;
        const want = togo > 0 ? Math.min(p.limitKph / 3.6, Math.sqrt(2 * 5 * togo)) : 0;
        // AND HOLD THE LANE, which means STEERING — the entry at Monza opens in
        // Parabolica, and a car given no steering input does not hold a lateral
        // position through a corner any more than a real one would. Measured:
        // starting in the lane and steering zero for 40 s drifts 6.4 m -> 0.7 m
        // and misses the box. That is the car being right, not the lane being
        // wrong, so the test drives the gesture instead of teleporting into it.
        A.setInput({ steer: Math.max(-1, Math.min(1, (laneX - ps.x) * 0.35)),
                     throttle: ps.speed < want, brake: ps.speed > want * 1.05 });
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

  test("stopping on the racing line is not stopping in the box", async ({ page }) => {
    // The other half of "the box is a place": a car that does everything else
    // right — calls the stop, takes the limiter, brakes to a halt on the mark —
    // but halts on the racing line has not reached its box, because the crew is
    // not standing there. Before the lane was painted there was nowhere else to
    // be, and a stopped car sat in the middle of the road while the field went
    // around it.
    //
    // ONLY the refusal is asserted here. The positive case — the same drive,
    // held in the lane, serviced — is the test above, and running both in one
    // page left the second starting from a car parked stationary at the box:
    // it ended up off the road on the far side (x -8.0, rescue firing) and
    // failed for a reason that had nothing to do with the lane. A test that can
    // fail for the wrong reason is worse than one that covers less.
    //
    // So this pins the refusal AND that it was refused for the RIGHT reason:
    // the car really did arrive at the box, really did stop there, and really
    // was outside the lane. Without those three it would pass just as happily
    // for a car that never got to the pits at all.
    await armedAt(page);
    const out = await page.evaluate(() => {
      const A = window.__apex;
      A.jump(0.93, 30, 0); A.aim(0);
      A.pit({ arm: true });
      for (let i = 0; i < 60 * 40; i++) {
        const p = A.pit();
        const ps = A.physState();
        const togo = p.inWindow ? p.boxM - p.atM : 1e9;
        const want = togo > 0 ? Math.min(p.limitKph / 3.6, Math.sqrt(2 * 5 * togo)) : 0;
        // Hold the racing line, steering — see the note in the stop test: an
        // unsteered car does not hold ANY lateral position through Parabolica,
        // so "steer: 0" would not be a car on the racing line, just a loose one.
        A.setInput({ steer: Math.max(-1, Math.min(1, (0 - ps.x) * 0.35)),
                     throttle: ps.speed < want, brake: ps.speed > want * 1.05 });
        A.step(1 / 60, 1);
        if (A.pit().state === "out") break;
      }
      return { pit: A.pit(), x: A.physState().x, v: A.physState().speed };
    });
    // It arrived, and it stopped: without these the refusal proves nothing.
    expect(out.pit.inWindow, "the car never reached the pit window").toBe(true);
    expect(out.pit.atM, "the car never reached the box").toBeGreaterThan(out.pit.boxM - 10);
    expect(Math.abs(out.v), "the car never actually stopped at the box").toBeLessThan(1);
    // It was on the racing line, not in the lane…
    expect(out.pit.inLaneLat, "the car drifted into the lane — the refusal proves nothing").toBe(false);
    // …and so it was not serviced.
    expect(out.pit.stops, "a car stopped on the racing line was serviced").toBe(0);
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

  test("an AI car serving a stop drives the lane, not the racing line", async ({ page }) => {
    // THE OTHER HALF OF THE LANE, and the half every test above misses: they
    // clear the field and drive the player, because the player is never steered
    // (the lane is driven — the car is not taken off you). The AI IS steered:
    // PitLane.laneX replaces its racing-line target, and that hook lives in
    // game.js's lateral chain, where a unit test of the pure function cannot
    // reach it. Without this, the half that cost a ratchet raise had no
    // integration evidence at all.
    await armedAt(page, "monza", { rivals: true });
    const out = await page.evaluate(() => {
      const A = window.__apex;
      // Find a car that is NOT the player. field().id is the car's own id and
      // is not its index (measured: pos 3 carries id 5), and pit({car}) takes
      // an INDEX — so identify by effect instead: arm an index, and if the
      // PLAYER did not become armed, that index is somebody else.
      let idx = -1;
      for (let i = 0; i < A.field().of; i++) {
        A.pit({ car: i, arm: true });
        if (!A.pit().armed) { idx = i; break; }
        A.pit({ car: i, arm: false });
      }
      if (idx < 0) return { error: "no rival found" };
      const states = [];
      let laneIn = 0, laneOut = 0, boxTicks = 0, boxOutOfLane = 0, stops = 0;
      for (let k = 0; k < 60 * 240; k++) {
        A.step(1 / 60, 1);
        const q = A.pit({ car: idx });
        if (states[states.length - 1] !== q.state) states.push(q.state);
        if (q.state === "lane") { q.inLaneLat ? laneIn++ : laneOut++; }
        if (q.state === "box") { boxTicks++; if (!q.inLaneLat) boxOutOfLane++; }
        if (q.stops > stops) stops = q.stops;
        if (stops > 0 && q.state === "out") break;
      }
      return { idx, states, laneIn, laneOut, boxTicks, boxOutOfLane, stops,
               boxS: A.pit({ car: idx }).boxS };
    });
    expect(out.error, `${out.error}`).toBeUndefined();
    // It went through the whole sequence on its own — nothing here drives it.
    expect(out.states.join(" -> "), "the AI never served its stop").toContain("box -> out");
    expect(out.stops).toBe(1);
    // IN THE LANE WHILE STOPPED, every tick. This is not a tolerance: the box
    // cannot latch outside the lane, so a single tick of box-out-of-lane would
    // mean the latch and the lateral test disagree.
    expect(out.boxTicks, "the car was never held in the box").toBeGreaterThan(out.boxS * 60 * 0.9);
    expect(out.boxOutOfLane, "held in the box while outside the lane").toBe(0);
    // And in the lane for most of the run down it. Not all: it enters the
    // window on the racing line and has to cross, which is the point — it is
    // STEERED there, not teleported. Measured 1415 in / 163 out on a clean run.
    expect(out.laneIn + out.laneOut, "the car never entered the lane state").toBeGreaterThan(300);
    expect(out.laneIn / (out.laneIn + out.laneOut),
      `only ${out.laneIn}/${out.laneIn + out.laneOut} of the lane run was actually in the lane`)
      .toBeGreaterThan(0.7);
  });
});
