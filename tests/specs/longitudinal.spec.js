// @ts-check
// Longitudinal + grip physics: ONE browser smoke. The driving-model claims this
// file used to make in the browser (throttle/coast/brake, grass drag, speed-
// sensitive steering, slope gravity at spa, the start/finish wrap) are all pure
// `__apex` JSON reads, and tests/unit/longitudinal-vm.test.mjs replays every one
// of them with the same thresholds, step counts and PACE pin on the fast gate
// (TWIN_SUBSET in tools/ci/twinned-specs.mjs). What stays here is the one thing
// the VM cannot see: the standing start driven with the real renderer up, so a
// NaN or a throw that only surfaces inside render() still reds a browser run.
// Porting recipe: docs/VERIFICATION.md §Porting a logic spec to the VM (#7261).
// Imports from ./fixtures.js, NOT from @playwright/test, so a failure attaches
// apex-state / apex-logs / page-console — a bare "expected 43 to be greater than
// 50" arrives with the car's state and the retained log ring beside it.
import { test, expect, BOOT_MS } from "../helpers/fixtures.js";
import { pinFactorySeat } from "../helpers/factory-seat.js";

// PACE pinned: the standing-start acceleration bounds below are in M/S (20 < acc <
// 150), and PACE is a ground-speed scale that moves them wholesale. Without this a
// red test is ambiguous between "the physics broke" and "the car is slower now, by
// design" — so the spec states the pace it was written against instead of
// inheriting an OVERALL SPEED default that can move.
const pinPace = (page) => page.evaluate(() => window.__apex.setPhysics({ pace: 1 }));

// FACTORY SEAT pinned too (the VM twin's seat): this spec characterizes the
// driving model, and the GarageDefaults Mercedes kit holds 80 m/s where the
// factory car cannot, and grids on pole (bug hunt 3 K2).
async function startRace(page) {
  await pinFactorySeat(page);
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
});
