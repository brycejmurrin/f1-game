// @ts-check
// Regression tests for the physics/collision robustness pass:
//  - projection continuity: a car running wide near a hairpin must not teleport
//    its lap distance onto the other leg of the corner.
//  - wall slide: a glancing scrape costs far less speed than burying the nose in.
import { test, expect } from "@playwright/test";

async function start(page, circuit) {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex != null, { timeout: 8000 });
  await page.evaluate((c) => window.__apex.race(c, "day", "dry"), circuit);
  await page.waitForFunction(() => window.__apex.info().track != null, { timeout: 8000 });
  await page.evaluate(() => window.__apex.go());
}

test.describe("Apex 26 — physics robustness", () => {
  // Monaco's hairpins put the inbound and outbound legs metres apart — the
  // geometry that could make the world→(s) projection flip onto the wrong leg
  // and teleport lap distance. This drives wide through the whole lap and
  // asserts lap distance never jumps backwards: a guard that the projection
  // stays continuous (and that future changes don't reintroduce a teleport).
  test("lap distance stays continuous driving wide through Monaco", async ({ page }) => {
    await start(page, "monaco");
    const r = await page.evaluate(() => {
      const L = window.__apex.info().total;
      let maxBackJump = 0, finite = true;
      for (const steer of [0.3, -0.3, 0.6]) {     // run wide both ways through every corner
        window.__apex.setPhysics({ drift: 0, roadFollow: 0.7 });
        window.__apex.jump(0.0, 50, 0);
        window.__apex.setInput({ steer, throttle: true });
        let prev = window.__apex.probe().s;
        for (let i = 0; i < 1500; i++) {           // ~25 s, several laps
          window.__apex.step(1 / 60, 1);
          const s = window.__apex.probe().s;
          if (!Number.isFinite(s)) { finite = false; break; }
          let d = s - prev;                        // unwrap across the start/finish seam
          if (d > L / 2) d -= L; else if (d < -L / 2) d += L;
          if (d < 0) maxBackJump = Math.max(maxBackJump, -d);
          prev = s;
        }
        window.__apex.clearInput();
      }
      return { maxBackJump: +maxBackJump.toFixed(2), finite, L: Math.round(L) };
    });
    expect(r.finite).toBe(true);
    expect(r.L).toBeGreaterThan(100);              // sanity: real length, not a null
    // A genuine wrong-leg teleport jumps tens of metres; normal motion + tiny
    // numerical wobble stays well under a couple of metres.
    expect(r.maxBackJump).toBeLessThan(5);
  });

  // Both cars start pinned against the same barrier for the same number of
  // frames; the ONLY difference is how hard they steer into it. The old flat
  // 38 m/s² scrub ignored that, so both lost the same speed. The angle-aware
  // wall now scrubs in proportion to how hard you drive into it, so a gentle
  // lean keeps far more speed than burying the wheel.
  test("wall scrub scales with how hard you steer into it (not a flat stop)", async ({ page }) => {
    await start(page, "monaco");
    const run = (steer) => page.evaluate((st) => {
      window.__apex.setPhysics({ drift: 0 });
      window.__apex.jump(0.2, 60, 4.5);   // already against the right barrier
      window.__apex.setInput({ steer: st, throttle: false });
      for (let i = 0; i < 50; i++) window.__apex.step(1 / 60, 1);
      const v = window.__apex.probe().speed;
      window.__apex.clearInput();
      return v;
    }, steer);
    const gentle = await run(0.1);   // barely leaning on the wall
    const hard = await run(1.0);     // full wheel into the wall
    expect(gentle).toBeGreaterThan(hard + 8);
  });
});
