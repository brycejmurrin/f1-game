// @ts-check
// Longitudinal + grip physics and full-lap progress. These exercise the parts of
// the model the steering/collision specs don't: throttle/coast/brake, top speed,
// off-track grass drag, speed-sensitive cornering (understeer), and that a car
// driven around the whole lap advances s correctly, wraps start/finish, and
// completes laps.
import { test, expect } from "@playwright/test";

async function startRace(page) {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex != null, { timeout: 8000 });
  await page.evaluate(() => window.__apex.race("monza", "day", "dry"));
  await page.waitForFunction(() => window.__apex.info().track != null, { timeout: 8000 });
  await page.evaluate(() => window.__apex.go());
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
    // Flat-out on the start/finish STRAIGHT (no steering needed) for ~7 s — long
    // enough to climb to a high speed before reaching the first chicane.
    const top = await page.evaluate(() => {
      window.__apex.jump(0.0, 0, 0);
      window.__apex.setInput({ steer: 0, throttle: true });
      for (let i = 0; i < 420; i++) window.__apex.step(1 / 60, 1);
      const v = window.__apex.probe().speed;
      window.__apex.clearInput();
      return v;
    });
    expect(top).toBeGreaterThan(40);     // climbing strongly toward VMAX (72)
    expect(top).toBeLessThan(100);       // never exceeds it
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
    await page.waitForFunction(() => window.__apex != null, { timeout: 8000 });
    await page.evaluate(() => { window.__apex.race("spa", "day", "dry"); window.__apex.go(); });
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
      // descent at top speed: gravity must not push past vmax
      window.__apex.jump(dnAt, 90, 0);
      window.__apex.setInput({ steer: 0, throttle: true });
      let maxV = 0;
      for (let i = 0; i < 120; i++) { window.__apex.step(1 / 60, 1); maxV = Math.max(maxV, window.__apex.physState().speed); }
      // climb from low speed: must still accelerate (gravity isn't a wall)
      window.__apex.jump(upAt, 10, 0);
      const v0 = window.__apex.physState().speed;
      for (let i = 0; i < 120; i++) window.__apex.step(1 / 60, 1);
      const v1 = window.__apex.physState().speed;
      window.__apex.clearInput();
      return { maxV, climbGain: v1 - v0 };
    });
    expect(r.maxV).toBeLessThan(98);        // no descent overspeed → no slide-off at the bottom
    expect(r.climbGain).toBeGreaterThan(5);  // climbs freely, never an invisible barrier
  });

  test("crossing the start/finish line advances s (wraps) and increments the lap", async ({ page }) => {
    await startRace(page);
    const r = await page.evaluate(() => {
      const total = window.__apex.info().total;
      // Start just before the line on the main straight, flat out, no steering.
      window.__apex.jump(0.97, 60, 0);
      window.__apex.setInput({ steer: 0, throttle: true });
      const startLap = window.__apex.cars().find((c) => c.p).lap;
      let prev = window.__apex.probe().s, wraps = 0, monotoneBreaks = 0;
      for (let i = 0; i < 240; i++) {        // ~4 s — enough to reach & cross s=0
        window.__apex.step(1 / 60, 1);
        const s = window.__apex.probe().s;
        let d = s - prev;
        if (d < -total / 2) { wraps++; d += total; }   // crossed start/finish
        if (d < -0.5) monotoneBreaks++;                // went backwards (shouldn't)
        prev = s;
      }
      const endLap = window.__apex.cars().find((c) => c.p).lap;
      window.__apex.clearInput();
      return { wraps, monotoneBreaks, startLap, endLap };
    });
    expect(r.wraps).toBe(1);                    // crossed the line exactly once
    expect(r.endLap).toBe(r.startLap + 1);      // lap counter advanced by one
    expect(r.monotoneBreaks).toBe(0);           // always moving forward
  });
});
