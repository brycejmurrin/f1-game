// @ts-check
// Longitudinal + grip physics and full-lap progress. These exercise the parts of
// the model the steering/collision specs don't: throttle/coast/brake, top speed,
// off-track grass drag, speed-sensitive cornering (understeer), and that a car
// driven around the whole lap advances s correctly, wraps start/finish, and
// completes laps.
// Imports from ./fixtures.js, NOT from @playwright/test, so a failure attaches
// apex-state / apex-logs / page-console — a bare "expected 43 to be greater than
// 50" arrives with the car's state and the retained log ring beside it.
import { test, expect, BOOT_MS } from "../helpers/fixtures.js";

// PACE pinned: the standing-start acceleration bounds below are in M/S (20 < acc <
// 150), and PACE is a ground-speed scale that moves them wholesale. Without this a
// red test is ambiguous between "the physics broke" and "the car is slower now, by
// design" — so the spec states the pace it was written against instead of
// inheriting an OVERALL SPEED default that can move.
const pinPace = (page) => page.evaluate(() => window.__apex.setPhysics({ pace: 1 }));

async function startRace(page) {
  await page.goto("/");
  // BOOT_MS, not a hand-rolled 8 s: a SwiftShader boot here measures 11-33 s (2026-09-01).
  await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
  await page.evaluate(() => window.__apex.race("monza", "day", "dry"));
  await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: BOOT_MS });
  await page.evaluate(() => window.__apex.go());
  await pinPace(page);
}
// Hold an input from a clean jump and report start/end speed.
const drive = (page, input, ticks) => page.evaluate(({ input, ticks }) => {
  window.__apex.jump(0.0, input.v0 ?? 0, 0);
  window.__apex.setInput({ steer: 0, throttle: !!input.throttle, brake: !!input.brake });
  const v0 = window.__apex.probe().speed;
  for (let i = 0; i < ticks; i++) window.__apex.step(1 / 60, 1);
  const v1 = window.__apex.probe().speed;
  window.__apex.clearInput();
  return { v0, v1 };
}, { input, ticks });

test.describe("Apex 26 — longitudinal & grip", () => {
  test("throttle accelerates from rest toward a high top speed", async ({ page }) => {
    await startRace(page);
    const r = await drive(page, { throttle: true, v0: 0 }, 60);   // 1 s
    expect(r.v1).toBeGreaterThan(r.v0 + 5);                        // clearly accelerating
    // PEAK speed while still ON the racing line. NOTE: Monza's first corner
    // (Rettifilo) is only ~56 m (frac 0.0097) past the line — there is NO long
    // straight from a standing start, so an un-steered car understeers off at the
    // chicane in ~4-5 s. The old test read the FINAL speed after 7 s (~11 m/s,
    // already flung into the runoff) and wrongly looked like "can't accelerate".
    // Sample the PEAK reached before leaving the track: that's the real
    // standing-start acceleration, independent of the un-steered corner exit.
    const acc = await page.evaluate(() => {
      window.__apex.jump(0.0, 0, 0);
      window.__apex.setInput({ steer: 0, throttle: true });
      let peak = 0;
      for (let i = 0; i < 420; i++) {
        window.__apex.step(1 / 60, 1);
        const pr = window.__apex.probe();
        if (Math.abs(pr.x) > 8) break;   // left the track at the chicane — stop measuring
        peak = Math.max(peak, pr.speed);
      }
      window.__apex.clearInput();
      return peak;
    });
    // From a standstill the car builds real speed on the short run to the first
    // corner. Relative/bounded — no VMAX magic number.
    expect(Number.isFinite(acc)).toBe(true);
    expect(acc).toBeGreaterThan(20);     // strong pull off the line (was 0 m/s at start)
    expect(acc).toBeLessThan(150);       // sane physical ceiling, not an exact VMAX pin
  });

  test("braking slows faster than coasting, both slower than throttle", async ({ page }) => {
    await startRace(page);
    const brake = await drive(page, { brake: true, v0: 70 }, 30);
    const coast = await drive(page, { v0: 70 }, 30);
    const gas   = await drive(page, { throttle: true, v0: 70 }, 30);
    const dBrake = brake.v1 - brake.v0;   // most negative
    const dCoast = coast.v1 - coast.v0;   // negative, gentler
    const dGas   = gas.v1 - gas.v0;       // ~flat or positive at 70
    expect(dBrake).toBeLessThan(dCoast);
    expect(dCoast).toBeLessThan(0);
    expect(dGas).toBeGreaterThan(dCoast);
  });

  test("driving onto the grass bleeds speed", async ({ page }) => {
    await startRace(page);
    const r = await page.evaluate(() => {
      // jump well off the track surface (hw ~7), full throttle, no steer
      window.__apex.jump(0.0, 80, 14);
      window.__apex.setInput({ steer: 0, throttle: true });
      const v0 = window.__apex.probe().speed;
      for (let i = 0; i < 60; i++) window.__apex.step(1 / 60, 1);
      const p = window.__apex.probe();
      window.__apex.clearInput();
      return { v0, v1: p.speed };
    });
    expect(r.v1).toBeLessThan(r.v0);     // grass drag dominates throttle
  });

  test("steering is speed-sensitive: a tighter line at low speed than high", async ({ page }) => {
    await startRace(page);
    // Heading swing per unit DISTANCE at full lock — lower at high speed (understeer).
    const turnPerMetre = (v) => page.evaluate((v) => {
      window.__apex.jump(0.0, v, 0);
      window.__apex.setInput({ steer: 1, throttle: false });
      const b = window.__apex.probe();
      for (let i = 0; i < 20; i++) window.__apex.step(1 / 60, 1);
      const a = window.__apex.probe();
      window.__apex.clearInput();
      const dHead = Math.abs(a.angle - b.angle);
      const ds = Math.max(1e-3, ((a.s - b.s) + 1e6) % 1e6);
      return dHead / ds;     // rad per metre of travel ≈ path curvature
    }, v);
    const slow = await turnPerMetre(18);
    const fast = await turnPerMetre(75);
    expect(slow).toBeGreaterThan(fast * 1.3);   // turns much tighter when slow
  });

  test("slope gravity: descents don't overspeed past top speed; climbs aren't a barrier", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
    await page.evaluate(() => { window.__apex.race("spa", "day", "dry"); window.__apex.go(); });
    await pinPace(page);   // climbGain is in m/s — see pinPace
    const r = await page.evaluate(() => {
      // locate the steepest descent and climb on the lap
      let dnAt = 0, dn = 0, upAt = 0, up = 0;
      for (let i = 0; i < 300; i++) {
        const f = i / 300;
        window.__apex.jump(f, 40, 0); window.__apex.step(1 / 60, 1);
        const s = window.__apex.physState().slope;
        if (s < dn) { dn = s; dnAt = f; }
        if (s > up) { up = s; upAt = f; }
      }
      // Reference top speed at the FLATTEST point on the lap under full throttle
      // (measured, not a hardcoded VMAX) — driven long enough to plateau. Using
      // the least-sloped node avoids letting the reference itself be gravity-aided.
      let flatAt = 0, flatSlope = Infinity;
      for (let i = 0; i < 300; i++) {
        const f = i / 300;
        window.__apex.jump(f, 40, 0); window.__apex.step(1 / 60, 1);
        const a = Math.abs(window.__apex.physState().slope);
        if (a < flatSlope) { flatSlope = a; flatAt = f; }
      }
      window.__apex.jump(flatAt, 40, 0);
      window.__apex.setInput({ steer: 0, throttle: true });
      let flatMax = 0;
      for (let i = 0; i < 420; i++) { window.__apex.step(1 / 60, 1); flatMax = Math.max(flatMax, window.__apex.physState().speed); }
      // Descent under power: gravity may add some speed downhill (that's correct,
      // not a bug), but it must not RUN AWAY — stay within a generous margin of the
      // flat top speed and, above all, stay finite. Start at flat top speed so we
      // measure overspeed, not deceleration.
      window.__apex.jump(dnAt, flatMax, 0);
      let maxV = 0, finite = true;
      for (let i = 0; i < 120; i++) {
        window.__apex.step(1 / 60, 1);
        const v = window.__apex.physState().speed;
        if (!Number.isFinite(v)) finite = false;
        maxV = Math.max(maxV, v);
      }
      // climb from low speed: must still accelerate (gravity isn't a wall)
      window.__apex.jump(upAt, 10, 0);
      const v0 = window.__apex.physState().speed;
      for (let i = 0; i < 120; i++) window.__apex.step(1 / 60, 1);
      const v1 = window.__apex.physState().speed;
      window.__apex.clearInput();
      return { maxV, flatMax, finite, climbGain: v1 - v0 };
    });
    // Relative bounds (survive a PACE/VMAX retune): descent stays finite and within
    // a generous margin of the measured flat top speed (gravity adds a little, but
    // doesn't run away), and climbing still gains speed (gravity isn't a wall).
    expect(r.finite).toBe(true);
    expect(r.maxV).toBeLessThan(r.flatMax * 1.35);   // no descent runaway → no slide-off at the bottom
    expect(r.climbGain).toBeGreaterThan(5);          // climbs freely, never an invisible barrier
  });

  test("crossing the start/finish line advances s (wraps) and increments the lap", async ({ page }) => {
    await startRace(page);
    const r = await page.evaluate(() => {
      const total = window.__apex.info().total;
      // Start just before the line on the main straight, flat out, no steering.
      // The DRIVING HELP assist ships at 0 now, so an un-steered car leaves the
      // road — this test is about the lap counter wrapping, not about the car
      // finding its own way round, so opt the assist in explicitly to carry it
      // there. (Previously it relied on the assist being on by default.)
      window.__apex.setPhysics({ roadFollow: 0.7 });
      // Start just BEFORE the line (0.995 ~ 29 m out), not at 0.97: frac 0.97 is
      // Parabolica, and an un-steered car runs wide there whatever the assist
      // does — measured 156 ticks off-road, which broke the monotonic-progress
      // check even once the wrap itself worked. From 0.995 the car crosses the
      // line within a second and spends the rest of the run on the main straight.
      window.__apex.jump(0.995, 40, 0);
      window.__apex.setInput({ steer: 0, throttle: true });
      const startLap = window.__apex.cars().find((c) => c.p).lap;
      let prev = window.__apex.probe().s, wraps = 0, monotoneBreaks = 0;
      for (let i = 0; i < 240; i++) {        // ~4 s — crosses s=0 then runs the straight
        window.__apex.step(1 / 60, 1);
        const s = window.__apex.probe().s;
        let d = s - prev;
        if (d < -total / 2) { wraps++; d += total; }   // crossed start/finish
        if (d < -0.5) monotoneBreaks++;                // went backwards (shouldn't)
        prev = s;
      }
      const endLap = window.__apex.cars().find((c) => c.p).lap;
      window.__apex.clearInput();
      window.__apex.setPhysics({ roadFollow: 0 });   // restore the shipped default
      return { wraps, monotoneBreaks, startLap, endLap };
    });
    expect(r.wraps).toBe(1);                    // crossed the line exactly once
    expect(r.endLap).toBe(r.startLap + 1);      // lap counter advanced by one
    expect(r.monotoneBreaks).toBe(0);           // always moving forward
  });
});
