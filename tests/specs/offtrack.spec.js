// @ts-check
// Off-track, reversing, wrong-way and auto-rescue handling, plus the prog↔s
// coupling fix (progress is derived from the actual signed change in s, so a
// spin/reverse can't cheat progress forward).
import { test, expect, BOOT_MS } from "../helpers/fixtures.js";

// PACE PINNED. The assertions here are in METRES (dProg > 50) and M/S (offSpeed
// bounds, the reverse crawl), and PACE is a ground-speed scale that moves both.
// The OVERALL SPEED default is 0.84 since the Phase C regrid, so a spec that
// inherits it is measuring a slower car than it was written against — and a red
// result would be ambiguous between "the physics broke" and "the car is slower
// now, by design". State the pace instead of inheriting one.
const pinPace = (page) => page.evaluate(() => window.__apex.setPhysics({ pace: 1 }));


test.describe("Apex 26 — off-track / reverse / wrong-way", () => {
  test("prog tracks s: forward driving advances prog ≈ s-progress", async ({ page, loadTrack }) => {
    await loadTrack();
    await pinPace(page);
    const r = await page.evaluate(() => {
      window.__apex.setPhysics({ drift: 0 });
      window.__apex.jump(0.0, 60, 0);
      const p0 = window.__apex.physState();
      for (let i = 0; i < 120; i++) { window.__apex.setInput({ steer: 0, throttle: true }); window.__apex.step(1 / 60, 1); }
      const p1 = window.__apex.physState();
      window.__apex.clearInput();
      const dProg = p1.prog - p0.prog, dS = p1.s - p0.s;
      return { dProg, dS };
    });
    expect(r.dProg).toBeGreaterThan(50);          // clearly progressed
    expect(Math.abs(r.dProg - r.dS)).toBeLessThan(2);   // prog == s advance
  });

  test("facing backwards and throttling DECREASES progress (no forward cheat)", async ({ page, loadTrack }) => {
    await loadTrack();
    await pinPace(page);
    const r = await page.evaluate(() => {
      window.__apex.setPhysics({ drift: 0 });
      window.__apex.jump(0.3, 30, 0);
      window.__apex.aim(180);                     // face backwards
      const p0 = window.__apex.physState();
      for (let i = 0; i < 30; i++) { window.__apex.setInput({ steer: 0, throttle: true }); window.__apex.step(1 / 60, 1); }
      const p1 = window.__apex.physState();
      window.__apex.clearInput();
      return { dProg: p1.prog - p0.prog };
    });
    expect(r.dProg).toBeLessThan(0);              // went backwards → prog dropped
  });

  test("wrong-way is flagged when driving against the track", async ({ page, loadTrack }) => {
    await loadTrack();
    await pinPace(page);
    const wrong = await page.evaluate(() => {
      window.__apex.setPhysics({ drift: 0 });
      window.__apex.jump(0.3, 30, 0);
      window.__apex.aim(180);
      let flagged = false;
      for (let i = 0; i < 60; i++) {
        window.__apex.setInput({ steer: 0, throttle: true });
        window.__apex.step(1 / 60, 1);
        if (window.__apex.physState().wrongWay) { flagged = true; break; }
      }
      window.__apex.clearInput();
      return flagged;
    });
    expect(wrong).toBe(true);
  });

  test("brake at a standstill crawls the car backwards (reverse), then throttle recovers", async ({ page, loadTrack }) => {
    await loadTrack();
    await pinPace(page);
    const r = await page.evaluate(() => {
      window.__apex.setPhysics({ drift: 0 });
      window.__apex.jump(0.0, 0, 0);
      // hold brake from a stop → reverse crawl
      for (let i = 0; i < 60; i++) { window.__apex.setInput({ steer: 0, brake: true }); window.__apex.step(1 / 60, 1); }
      const rev = window.__apex.physState().speed;
      // now throttle → back to forward motion
      for (let i = 0; i < 120; i++) { window.__apex.setInput({ steer: 0, throttle: true }); window.__apex.step(1 / 60, 1); }
      const fwd = window.__apex.physState().speed;
      window.__apex.clearInput();
      return { rev, fwd };
    });
    expect(r.rev).toBeLessThan(-2);     // genuinely reversing
    expect(r.rev).toBeGreaterThan(-9);  // but capped to a crawl
    expect(r.fwd).toBeGreaterThan(5);   // throttle pulls it back to forward motion
  });

  test("driving onto grass and back recovers (slowed off, speeds up on return)", async ({ page, loadTrack }) => {
    await loadTrack();
    await pinPace(page);
    // A CONTROLLED PAIR, not a chain — the same launch on each surface, only
    // the lateral differing, and the SURFACE judged by the speed DELTAS.
    //
    // The original chain (jump onto grass at 80, read; jump back onto tarmac
    // at that speed, read) hid two defects that both surfaced on the test's
    // FIRST ever run (2026-08-07):
    //   - `offSpeed < 45` was an absolute speed pinned across 175 commits of
    //     deliberate physics work; measured 55.56, the class AGENTS.md's PACE
    //     rule exists for.
    //   - `onSpeed > offSpeed + 2` had NEVER BEEN EVALUATED (the line above it
    //     always failed first), and it fails on its own: relaunching at 55.56
    //     on TARMAC ends at 46.96 after 1.5 s of full throttle. That is not
    //     surface physics — jump() lands the car at speed with reset
    //     drivetrain state, and speed sags while the box catches up. The
    //     artifact is identical on both surfaces, so a chained comparison
    //     inherits it and a paired one cancels it.
    const LAUNCH = 80;
    const leg = (lat) => page.evaluate(([LAUNCH, lat]) => {
      window.__apex.setPhysics({ drift: 0 });
      window.__apex.jump(0.0, LAUNCH, lat);
      for (let i = 0; i < 90; i++) { window.__apex.setInput({ steer: 0, throttle: true }); window.__apex.step(1 / 60, 1); }
      const speed = window.__apex.physState().speed;
      window.__apex.clearInput();
      return speed;
    }, [LAUNCH, lat]);
    const offSpeed = await leg(14);   // way off in the grass
    const onSpeed = await leg(0);     // same launch, on the tarmac
    // Grass held it slow: a net LOSS from the launch despite full throttle
    // (measured 55.56 = 69 % of 80; the bound is the claim plus margin).
    expect(offSpeed).toBeLessThan(0.75 * LAUNCH);
    // And clearly slower than the identical run on tarmac — the surface is the
    // only variable, so the jump-sag artifact subtracts out of the comparison.
    expect(onSpeed).toBeGreaterThan(offSpeed + 5);
  });

  test("auto-rescue: a wrong-way car is recovered to the racing line facing forward", async ({ page, loadTrack }) => {
    await loadTrack();
    await pinPace(page);
    const r = await page.evaluate(() => {
      window.__apex.setPhysics({ drift: 0 });
      window.__apex.jump(0.3, 30, 0);
      window.__apex.aim(180);
      let rescued = false, afterX = 99, afterWrong = true;
      for (let i = 0; i < 320; i++) {           // > 3 s of wrong-way
        window.__apex.setInput({ steer: 0, throttle: true });
        window.__apex.step(1 / 60, 1);
        const p = window.__apex.physState();
        if (p.rescueT === 0 && !p.wrongWay && Math.abs(p.x) < 1 && i > 60) { rescued = true; afterX = p.x; afterWrong = p.wrongWay; break; }
      }
      window.__apex.clearInput();
      return { rescued, afterX, afterWrong };
    });
    expect(r.rescued).toBe(true);
    expect(Math.abs(r.afterX)).toBeLessThan(1);   // back on the line
    expect(r.afterWrong).toBe(false);
  });

  test("auto-rescue: a car beached deep off-track is recovered", async ({ page, loadTrack }) => {
    await loadTrack();
    await pinPace(page);
    const r = await page.evaluate(() => {
      window.__apex.setPhysics({ drift: 0 });
      let onTrack = false;
      window.__apex.jump(0.0, 0, 16);            // beached in the grass, stopped
      for (let i = 0; i < 320; i++) {
        window.__apex.setInput({ steer: 0, throttle: false });
        window.__apex.step(1 / 60, 1);
        if (Math.abs(window.__apex.physState().x) < 1) { onTrack = true; break; }
      }
      window.__apex.clearInput();
      return { onTrack };
    });
    expect(r.onTrack).toBe(true);
  });

  // Regression: a car stopped ON the track (within the road, NOT off-track and not
  // wrong-way) must not sit at 0 forever — the case where you wedge against an
  // inside corner barrier on an incline. The catch-all rescue must dig it out.
  test("stopped on-track: throttle held is never stuck at 0; gas released is left parked", async ({ page, loadTrack }) => {
    await page.goto("/");
    // BOOT_MS, not a hand-rolled 8 s: a SwiftShader boot here measures 11-33 s (2026-09-01).
    await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
    await page.evaluate(() => window.__apex.race("bahrain", "day", "dry"));
    await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: BOOT_MS });
    await page.evaluate(() => window.__apex.go());
    const r = await page.evaluate(() => {
      // Current rescue contract: stoppedOnTrack only fires while the THROTTLE is
      // held (the wedged-against-a-wall case). A driver who lets off the gas is
      // intentionally left parked, never teleported. So:
      //  (a) throttle held from a standstill → the car always gets moving (driving
      //      off on a clear road, or rescued if genuinely wedged) — never stuck at 0.
      //  (b) no throttle → the car stays put (no surprise auto-rescue).
      window.__apex.jump(0.12, 0, 0);
      let movedWithThrottle = 0;
      for (let i = 0; i < 300; i++) { window.__apex.setInput({ steer: 0, throttle: true }); window.__apex.step(1 / 60, 1); movedWithThrottle = Math.max(movedWithThrottle, window.__apex.physState().speed); }
      window.__apex.jump(0.12, 0, 0);
      let movedNoThrottle = 0;
      for (let i = 0; i < 300; i++) { window.__apex.setInput({ steer: 0, throttle: false }); window.__apex.step(1 / 60, 1); movedNoThrottle = Math.max(movedNoThrottle, window.__apex.physState().speed); }
      window.__apex.clearInput();
      return { movedWithThrottle, movedNoThrottle };
    });
    expect(r.movedWithThrottle).toBeGreaterThan(10);   // throttle held → never stuck at 0
    expect(r.movedNoThrottle).toBeLessThan(2);          // gas released → left parked, not rescued
  });
});
