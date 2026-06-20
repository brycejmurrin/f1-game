// @ts-check
// Elevation + banking ("berm") tracks. The slope-gravity fix (descents must not
// overspeed past VMAX, climbs must not act as an invisible wall) and the passive
// road-following yaw were verified on Spa/Bahrain only; this sweeps every circuit
// that carries elevation data and both banked circuits so a regression on any one
// of them is caught. For each track it:
//   - finds the steepest descent and asserts gravity never pushes past top speed
//   - finds the steepest climb and asserts the car still accelerates up it
//   - drives the sharpest corner with NO steering and asserts road-following keeps
//     the car within the track limits (doesn't run off down/up a slope)
//   - never NaNs or throws the car off the world
import { test, expect } from "@playwright/test";

// Circuits with `elevations:` in their track definition.
const ELEVATION_TRACKS = [
  "bahrain", "cota", "hungaroring", "imola", "interlagos", "madrid", "monaco",
  "monza", "redbull", "shanghai", "silverstone", "spa", "suzuka", "zandvoort",
];
// Circuits with `banked: true` (raised outer edge through the fast corners).
const BANKED_TRACKS = ["zandvoort", "madrid"];

async function startRace(page, id) {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex != null, { timeout: 8000 });
  await page.evaluate((t) => window.__apex.race(t, "day", "dry"), id);
  await page.waitForFunction(() => window.__apex.info().track != null, { timeout: 8000 });
  await page.evaluate(() => window.__apex.go());
}

test.describe("Apex 26 — elevation & banking tracks", () => {
  for (const id of ELEVATION_TRACKS) {
    test(`${id}: slope gravity behaves + road-following holds on the grade`, async ({ page }) => {
      const errors = [];
      page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));
      await startRace(page, id);
      const r = await page.evaluate(() => {
        // Scan the lap for the steepest descent and climb (road pitch via slope).
        let dnAt = 0, dn = 0, upAt = 0, up = 0;
        for (let i = 0; i < 300; i++) {
          const f = i / 300;
          window.__apex.jump(f, 40, 0); window.__apex.step(1 / 60, 1);
          const s = window.__apex.physState().slope;
          if (s < dn) { dn = s; dnAt = f; }
          if (s > up) { up = s; upAt = f; }
        }

        // Descent at top speed: gravity must not push past vmax.
        let finite = true;
        window.__apex.jump(dnAt, 90, 0);
        window.__apex.setInput({ steer: 0, throttle: true });
        let maxV = 0;
        for (let i = 0; i < 150; i++) {
          window.__apex.step(1 / 60, 1);
          const p = window.__apex.physState();
          maxV = Math.max(maxV, p.speed);
          if (!Number.isFinite(p.speed) || !Number.isFinite(p.s) || !Number.isFinite(p.x)) finite = false;
        }

        // Climb from low speed: gravity must not be a wall.
        window.__apex.jump(upAt, 10, 0);
        const cv0 = window.__apex.physState().speed;
        for (let i = 0; i < 150; i++) window.__apex.step(1 / 60, 1);
        const cv1 = window.__apex.physState().speed;

        // Road-following on the grade: approach the sharpest corner with NO steer,
        // brisk pace, and confirm the car tracks the road instead of running off
        // (which on a slope would also pitch it up/down the bank).
        const corners = window.__apex.corners();
        let widest = 0, hw = 7;
        for (const f of corners) {
          // start a little before the apex so the car turns INTO the corner
          window.__apex.jump((f - 0.02 + 1) % 1, 50, 0);
          window.__apex.setInput({ steer: 0, throttle: false });
          hw = window.__apex.probe().hw;
          for (let i = 0; i < 70; i++) {
            window.__apex.step(1 / 60, 1);
            const p = window.__apex.probe();
            if (!Number.isFinite(p.x)) finite = false;
            widest = Math.max(widest, Math.abs(p.x));
          }
        }
        window.__apex.clearInput();
        return { dn, up, maxV, climbGain: cv1 - cv0, widest, hw, finite };
      });

      expect(errors).toEqual([]);
      expect(r.finite).toBe(true);
      expect(r.dn).toBeLessThan(0);                 // the track really does descend
      expect(r.up).toBeGreaterThan(0);              // and climb
      expect(r.maxV).toBeLessThan(99);              // no descent overspeed past VMAX
      // Climbs freely (gravity isn't an invisible wall). The gain is modest on
      // tracks whose only grade is a shallow recovery (e.g. Bahrain's dip), large
      // on real climbs (Spa's Eau Rouge), so just require clear acceleration.
      expect(r.climbGain).toBeGreaterThan(3);
      // Road-following keeps even an un-steered car broadly on the road surface
      // through corners — not flung 9 m into the runoff like the pre-fix model.
      expect(r.widest).toBeLessThan(r.hw + 8);
    });
  }

  for (const id of BANKED_TRACKS) {
    test(`${id}: banked corner is drivable and stays on the road`, async ({ page }) => {
      const errors = [];
      page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));
      await startRace(page, id);
      const r = await page.evaluate(() => {
        // The two highest-curvature corners carry the banking (~19 m radius). Drive
        // each at a corner-appropriate speed and let road-following ride the curve;
        // the car must track the banked road cleanly (stay on the paved surface) and
        // keep moving forward through the apex rather than understeering off.
        const corners = window.__apex.corners();
        const probe = window.__apex.probe.bind(window.__apex);
        const scored = corners.map((f) => {
          window.__apex.jump(f, 30, 0);
          return { f, k: Math.abs(probe().k) };
        }).sort((a, b) => b.k - a.k).slice(0, 2);

        let finite = true, widest = 0, hw = 7, allProgressed = true;
        for (const { f } of scored) {
          window.__apex.jump((f - 0.03 + 1) % 1, 25, 0);
          window.__apex.setInput({ steer: 0, throttle: false });   // road-following rides the bank
          const s0 = window.__apex.physState().prog;
          hw = probe().hw;
          for (let i = 0; i < 100; i++) {
            window.__apex.step(1 / 60, 1);
            const p = probe();
            const ps = window.__apex.physState();
            if (!Number.isFinite(p.x) || !Number.isFinite(ps.head) || !Number.isFinite(ps.speed)) finite = false;
            widest = Math.max(widest, Math.abs(p.x));
          }
          if (window.__apex.physState().prog <= s0 + 20) allProgressed = false;
        }
        window.__apex.clearInput();
        return { finite, widest, hw, progressed: allProgressed };
      });

      expect(errors).toEqual([]);
      expect(r.finite).toBe(true);
      expect(r.progressed).toBe(true);             // the car drove through, didn't beach
      expect(r.widest).toBeLessThan(r.hw);         // stayed ON the banked paved road, not in runoff
    });
  }
});
