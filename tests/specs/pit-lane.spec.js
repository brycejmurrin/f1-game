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

async function armedAt(page, { track = "monza", solo = false, rivals = false } = {}) {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
  await page.evaluate(({ track, solo }) => solo
    ? window.__apex.tt(track, "day")
    : window.__apex.race(track, "day", "dry", { laps: 25 }), { track, solo });
  await awaitTrackBuild(page);
  // Move rivals away for the player tests. This does not remove them; the
  // stationary refusal test uses solo mode so traffic cannot reach it again.
  // The AI test keeps the field in place.
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
      // ON THE LANE: the pit wall stands past the entry line (TrackPit), so an
      // armed car still on the racing surface there is not in the lane and
      // races on — it takes the entry road next time round. The fast lane's
      // centre is read from the model (driveX), not hard-coded: it moves with
      // the road's half-width across the calendar.
      // Found, not assumed: the window's start moves with the complex (it is
      // not at 0.93 on Monza any more), and driveX is null outside it.
      let f0 = null, dx = null;
      for (const f of [0.93, 0.94, 0.95, 0.96, 0.97, 0.98]) {
        A.jump(f, 45, 0); A.aim(0);
        const p = A.pit();
        if (p.inWindow && p.driveX != null) { f0 = f; dx = p.driveX; break; }
      }
      if (dx == null) return { settled: 0, cap: 1, sawLane: false, dx };
      A.jump(f0, 45, dx); A.aim(0);
      A.pit({ arm: true });
      const cap = A.pit().limitKph / 3.6;
      let settled = 0, sawLane = false;
      for (let i = 0; i < 600; i++) {
        const ps = A.physState();
        A.setInput({ steer: Math.max(-1, Math.min(1, (dx - ps.x) * 0.35)), throttle: true, brake: false });
        A.step(1 / 60, 1);
        const p = A.pit();
        if (p.inLane) { sawLane = true; settled = A.physState().speed; }
      }
      return { settled, cap, sawLane, dx };
    });
    expect(limited.dx, "the fast lane's centre is a number inside the window").not.toBeNull();
    expect(limited.sawLane, "arming ON the lane inside the window must put the car in the lane").toBe(true);
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
      // READ IT AT THE ARC POSITION THE CAR IS ACTUALLY AT. laneX is null
      // outside the window, and 0.93 of the lap is NOT inside it: the window
      // opens 320 m before the line, which at Monza is 0.945. So find the
      // first frac from 0.93 that IS inside, and take the lane centre THERE.
      //
      // It used to read laneX at 0.99 and drop the car at f0 with that number.
      // That assumed one lane centre for the whole window, and the lane does
      // not have one any more: it is narrow at the entry and flares out only
      // where the bays are, so at Monza the centre is 15.5 m at f0 = 0.96 and
      // 19.25 at 0.99. The car was placed 3.75 m outside the lane, dropped off
      // the surface, and crept 5 m in sixty seconds — "the car never reached
      // the box". The lane centre is a function of arc position, which is what
      // pit().laneX has always said it is.
      let f0 = 0.93;
      for (const f of [0.93, 0.94, 0.95, 0.96, 0.97]) { A.jump(f, 30, 0); if (A.pit().inWindow && A.pit().laneX != null) { f0 = f; break; } }
      A.jump(f0, 30, 0);
      const laneX = A.pit().laneX;
      A.jump(f0, 30, laneX); A.aim(0);
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
        // Steer to the lane centre HERE, not to the one we started on: the
        // flare moves it several metres between the entry and the bays.
        const aimX = p.laneX != null ? p.laneX : laneX;
        A.setInput({ steer: Math.max(-1, Math.min(1, (aimX - ps.x) * 0.35)),
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
    // rivals([]) only moves the field back; it does not remove it. In a GP
    // the AI catches this stationary car and can push it into the lane before
    // the final assertion. Time Trial exercises the same human pit model with
    // one car, so this test measures lane eligibility rather than traffic.
    await armedAt(page, { solo: true });
    expect(await page.evaluate(() => window.__apex.fieldState().length)).toBe(1);
    const out = await page.evaluate(() => {
      const A = window.__apex;
      A.jump(0.93, 30, 0); A.aim(0);
      A.pit({ arm: true });
      let stoppedOutsideTicks = 0;
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
        const after = A.pit(), speed = A.physState().speed;
        if (after.inWindow && Math.abs(after.atM - after.boxM) < 10
          && Math.abs(speed) < 1 && !after.inLaneLat) stoppedOutsideTicks++;
        if (A.pit().state === "out") break;
      }
      return { pit: A.pit(), x: A.physState().x, v: A.physState().speed, stoppedOutsideTicks };
    });
    // It arrived, and it stopped: without these the refusal proves nothing.
    expect(out.pit.inWindow, "the car never reached the pit window").toBe(true);
    expect(out.pit.atM, "the car never reached the box").toBeGreaterThan(out.pit.boxM - 10);
    expect(out.pit.atM, "the car overshot the box").toBeLessThan(out.pit.boxM + 10);
    expect(Math.abs(out.v), "the car never actually stopped at the box").toBeLessThan(1);
    expect(out.stoppedOutsideTicks, "the refusal must last at least a full service time").toBeGreaterThanOrEqual(out.pit.boxS * 60);
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
    await armedAt(page, { rivals: true });
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
