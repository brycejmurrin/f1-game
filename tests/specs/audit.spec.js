// @ts-check
// Regression tests added from the codebase audit (collisions / physics / AI /
// boundaries). Each pins down an edge case the existing suites didn't cover.
import { test, expect } from "../helpers/fixtures.js";


test.describe("Apex 26 — audit regressions", () => {
  test.afterEach(async ({ page }) => {
    await page.evaluate(() => window.__apex?.setPhysics({})).catch(() => {});
  });

  test("race start (bunched grid) settles with no NaN or launched cars", async ({ page, loadTrack }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));
    await loadTrack();
    const r = await page.evaluate(() => {
      let finite = true, maxAbsX = 0;
      for (let i = 0; i < 90; i++) {
        window.__apex.step(1 / 60, 1);
        for (const c of window.__apex.cars()) {
          if (!Number.isFinite(c.x) || !Number.isFinite(c.prog)) finite = false;
          maxAbsX = Math.max(maxAbsX, Math.abs(c.x));
        }
      }
      return { finite, maxAbsX };
    });
    expect(errors).toEqual([]);
    expect(r.finite).toBe(true);
    expect(r.maxAbsX).toBeLessThan(20);   // nobody flung off the grid
  });

  test("hard cornering forward never false-triggers WRONG WAY", async ({ page, loadTrack }) => {
    await loadTrack();
    const wrong = await page.evaluate(() => {
      window.__apex.setPhysics({ drift: 0.6 });
      let flagged = false;
      // throw the car hard through several corners, forward, and watch wrongWay
      const corners = window.__apex.corners();
      for (const f of corners.slice(0, 10)) {
        window.__apex.jump(f, 40, 0);
        window.__apex.setInput({ steer: 1, throttle: true });
        for (let i = 0; i < 40; i++) {
          window.__apex.step(1 / 60, 1);
          if (window.__apex.physState().wrongWay) flagged = true;
        }
      }
      window.__apex.clearInput();
      return flagged;
    });
    expect(wrong).toBe(false);   // going forward (even sideways) is never "wrong way"
  });

  test("driving backwards across the line does NOT count a lap", async ({ page, loadTrack }) => {
    await loadTrack();
    const r = await page.evaluate(() => {
      const total = window.__apex.info().total;
      window.__apex.jump(0.01, 25, 0);          // just past the line
      window.__apex.aim(180);                    // face backwards
      const lap0 = window.__apex.physState().lap;
      window.__apex.setInput({ steer: 0, throttle: true });
      for (let i = 0; i < 90; i++) window.__apex.step(1 / 60, 1);  // reverse over the line
      const lap1 = window.__apex.physState().lap;
      window.__apex.clearInput();
      return { lap0, lap1 };
    });
    expect(r.lap1).toBeLessThanOrEqual(r.lap0);   // never gains a lap going backwards
  });

  // ONE stepping loop, shared by both lap tests below. It lives in the PAGE
  // because its predicate is a page-side closure over `__apex`, so it cannot be
  // passed across the evaluate boundary; installing it as a string is what lets
  // the two tests share a single definition instead of each carrying a private
  // copy. That duplication is the actual defect here — the fix was written once
  // and applied to one of the two, and the unfixed one shipped red.
  const INSTALL_UNTIL = `window.__lapUntil = (pred, budget) => {
    for (let i = 0; i < budget; i++) {
      window.__apex.step(1 / 60, 1);
      if (pred()) return true;
    }
    return false;
  };`;

  // The lap counter used to be one-way: `lap++` on a forward crossing and no
  // `lap--` anywhere in js/, while `c.prog` was symmetric. Crossing the line,
  // being pushed back over it (shiftLong moves a car several metres along the
  // road during contact) and crossing again therefore added a SECOND lap, and
  // `c.finished` could fire a full lap early. These two pin the symmetry.
  test("crossing the line, reversing back over it and re-crossing counts ONE lap", async ({ page, loadTrack }) => {
    await loadTrack();
    await page.evaluate(INSTALL_UNTIL);   // after loadTrack: navigation wipes window
    const r = await page.evaluate(() => {
      // STEP UNTIL THE COUNTER MOVES, never a fixed frame budget. How far the
      // car travels per step depends on the accel curve, so a fixed count
      // either stops short of the line or sails 100 m past it.
      //
      // This test shipped with step(90)/step(120)/step(150) and had never been
      // run. Its own commit (7e3bafd3) describes the until() form as applied to
      // BOTH lap tests and applied it to one — and this one then failed exactly
      // the way that commit message predicts, stopping 46 m short of the line.
      // The helper is shared with the sibling test below precisely so the two
      // cannot drift apart again.
      const until = window.__lapUntil;
      const lap = () => window.__apex.physState().lap;
      window.__apex.setPhysics({ drift: 0 });
      const total = window.__apex.info().total;

      // Approach the line from just before it and cross forward.
      window.__apex.jump(1 - 12 / total, 22, 0);
      window.__apex.setInput({ steer: 0, throttle: true });
      const start = lap();
      const crossed = until(() => lap() > start, 900);
      const afterFirst = lap();

      // Turn round, reverse back over the line, then come forward across it again.
      window.__apex.aim(180);
      const wentBack = until(() => lap() < afterFirst, 900);
      const afterBack = lap();
      window.__apex.aim(180);
      const reCrossed = until(() => lap() > afterBack, 1200);
      const afterSecond = lap();
      window.__apex.clearInput();
      return { crossed, wentBack, reCrossed, afterFirst, afterBack, afterSecond };
    });
    // Anti-vacuity: if any leg never reached the line the lap comparisons below
    // would compare two untouched numbers and pass for the wrong reason.
    expect(r.crossed && r.wentBack && r.reCrossed).toBe(true);
    // Going back over the line gives the lap back...
    expect(r.afterBack).toBe(r.afterFirst - 1);
    // ...so re-crossing lands on the same lap, not one beyond it.
    expect(r.afterSecond).toBe(r.afterFirst);
  });

  test("a lap given back and re-taken is re-timed, not recorded as a sliver", async ({ page, loadTrack }) => {
    await loadTrack();
    await page.evaluate(INSTALL_UNTIL);
    const r = await page.evaluate(async () => {
      // Shared with the test above — see INSTALL_UNTIL. This test carried the
      // only correct copy of this loop while its sibling used a fixed frame
      // budget; one definition now serves both.
      const until = window.__lapUntil;
      const lap = () => window.__apex.timing().lap;
      window.__apex.setPhysics({ drift: 0 });
      const total = window.__apex.info().total;

      // Be on lap 2, so the completion branch that stamps lastLap/best actually
      // runs. Driving there for real is ~4 minutes of sim; setLap is the hook
      // that exists for exactly this. Start far enough back that a REAL lap
      // time is on the clock by the time the line arrives.
      window.__apex.setLap(2);
      window.__apex.jump(1 - 130 / total, 22, 0);
      window.__apex.setInput({ steer: 0, throttle: true });
      const start = lap();
      const crossed = until(() => lap() > start, 900);
      const afterFirst = window.__apex.timing();

      window.__apex.aim(180);
      const wentBack = until(() => lap() < afterFirst.lap, 900);
      const afterBack = window.__apex.timing();

      window.__apex.aim(180);
      const reCrossed = until(() => lap() > afterBack.lap, 1200);
      const afterSecond = window.__apex.timing();
      window.__apex.clearInput();
      return { crossed, wentBack, reCrossed, afterFirst, afterBack, afterSecond };
    });
    expect(r.crossed && r.wentBack && r.reCrossed).toBe(true);
    // A real lap time was on the clock when the line was first crossed.
    expect(r.afterFirst.lastLap).toBeGreaterThan(1);
    // Going back over the line hands the lap back...
    expect(r.afterBack.lap).toBe(r.afterFirst.lap - 1);
    // ...and re-taking it re-times the SAME lap instead of stamping the few
    // tenths since the reset. That sliver would beat c.best and become the
    // stored ghost.
    expect(r.afterSecond.lap).toBe(r.afterFirst.lap);
    expect(r.afterSecond.lastLap).toBeGreaterThan(1);
  });

  test("rear-ending a car ahead never INCREASES the player's speed", async ({ page, loadTrack }) => {
    await loadTrack();
    const r = await page.evaluate(() => {
      window.__apex.setPhysics({ drift: 0 });
      window.__apex.jump(0.3, 50, 0);
      window.__apex.rivals([{ dProg: 3, dx: 0 }]);   // overlapping car right ahead
      window.__apex.setInput({ steer: 0, throttle: false });   // coast into it
      const v0 = window.__apex.probe().speed;
      let maxV = v0;
      for (let i = 0; i < 40; i++) { window.__apex.step(1 / 60, 1); maxV = Math.max(maxV, window.__apex.probe().speed); }
      window.__apex.clearInput();
      return { v0, maxV };
    });
    expect(r.maxV).toBeLessThanOrEqual(r.v0 + 0.5);   // contact only scrubs the rear car
  });

  test("no car ever clips through a barrier during a full race (Suzuka: ferris + bridge)", async ({ page, loadTrack }) => {
    await loadTrack("suzuka");
    const maxOver = await page.evaluate(() => {
      window.__apex.setInput({ steer: 0, throttle: true });
      let m = 0;
      for (let i = 0; i < 600; i++) {           // 10 s of the whole field racing
        window.__apex.step(1 / 60, 1);
        m = Math.max(m, window.__apex.maxWallOvershoot());
      }
      window.__apex.clearInput();
      return m;
    });
    expect(maxOver).toBeLessThan(0.5);   // everyone stays inside the recorded barriers
  });

  test("extreme tuning + abuse keeps the car finite (tan/grip guards)", async ({ page, loadTrack }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));
    await loadTrack();
    const finite = await page.evaluate(() => {
      window.__apex.setPhysics({ drift: 0.9, wheelbase: 1.9, expo: 1.0, maxSlip: 0.7, speedRef: 124 });
      window.__apex.jump(0.0, 90, 0);
      let ok = true;
      for (let i = 0; i < 300; i++) {
        window.__apex.setInput({ steer: i % 2 ? 1 : -1, brake: i % 3 === 0, throttle: true });
        window.__apex.step(1 / 60, 1);
        const p = window.__apex.physState();
        if (!Number.isFinite(p.x) || !Number.isFinite(p.s) || !Number.isFinite(p.vLat) || !Number.isFinite(p.head)) ok = false;
      }
      window.__apex.clearInput();
      return ok;
    });
    expect(errors).toEqual([]);
    expect(finite).toBe(true);
  });

  test("road-following: entering Bahrain T1 at speed with no steer stays within track limits", async ({ page, loadTrack }) => {
    // Regression for the Bahrain corner slide-off: without the assist the car goes
    // straight through every corner. The assist adds road-curvature yaw so the car
    // tracks most of the corner automatically. It is OPT-IN now (ships at 0), so
    // this enables it explicitly — the subject is that the assist still works, not
    // that it is on by default (see steering.spec.js for the default contract).
    await loadTrack("bahrain");
    const r = await page.evaluate(() => {
      // Approach Bahrain T1 (first right-hand corner, frac ~0.10) at a brisk speed
      // from just before the corner; no steering — the road-following must do the work.
      window.__apex.setPhysics({ roadFollow: 0.7 });
      window.__apex.jump(0.08, 55, 0);
      window.__apex.setInput({ steer: 0, throttle: false });
      const hw = window.__apex.probe().hw;
      let maxAbsX = 0;
      for (let i = 0; i < 90; i++) {
        window.__apex.step(1 / 60, 1);
        maxAbsX = Math.max(maxAbsX, Math.abs(window.__apex.probe().x));
      }
      window.__apex.clearInput();
      return { maxAbsX, hw };
    });
    // Car should stay well within the road surface (hw) — not 9 m past it.
    expect(r.maxAbsX).toBeLessThan(r.hw * 1.6);   // some runoff allowed, not wide open
  });

  test("road-following: ROAD_FOLLOW=0 reverts to straight-line in corners", async ({ page, loadTrack }) => {
    // Confirm that with road-following off — the SHIPPED default — the car holds a
    // pure world-space straight line and runs wide, vs tracking the curve when the
    // player opts the assist in.
    await loadTrack("bahrain");
    const r = await page.evaluate(() => {
      const runCorner = (rf) => {
        window.__apex.setPhysics({ roadFollow: rf });
        window.__apex.jump(0.08, 55, 0);
        window.__apex.setInput({ steer: 0, throttle: false });
        let maxX = 0;
        for (let i = 0; i < 90; i++) {
          window.__apex.step(1 / 60, 1);
          maxX = Math.max(maxX, Math.abs(window.__apex.probe().x));
        }
        window.__apex.clearInput();
        return maxX;
      };
      const withFollow = runCorner(0.7);
      const withoutFollow = runCorner(0.0);
      window.__apex.setPhysics({ roadFollow: 0 });     // restore the shipped default
      return { withFollow, withoutFollow };
    });
    // With road-following the car drifts far less wide through the corner.
    expect(r.withFollow).toBeLessThan(r.withoutFollow * 0.7);
  });
});
