// @ts-check
// AUTOPILOT — a closed-loop driver that actually plays the game through the
// __apex input hooks, so steering settings can be evaluated by how well the car
// drives a real lap (not just unit-level physics asserts).
//
// The controller, each physics tick:
//   - looks ahead a speed-scaled window and reads the signed curvature there
//     (__apex.scan), picking the sharpest point to brake for;
//   - sets a target speed from that curvature (v = sqrt(aLat / |k|));
//   - steers with pure-pursuit toward the centreline: it aims at the point the
//     centreline reaches L metres ahead (curvature offsets that point laterally),
//     and commands steer to null the bearing error and excess heading.
//
// runLap() drives until the car completes a lap (or stalls / times out) and
// returns metrics: completion, lap time, average speed, how far/often it ran past
// the road edge, and the worst barrier overshoot. Sweeping setPhysics() and
// comparing those metrics is how we test a steering setting end-to-end.
import { test, expect } from "@playwright/test";

async function load(page, id) {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex != null, { timeout: 8000 });
  await page.evaluate((t) => window.__apex.race(t, "day", "dry"), id);
  await page.waitForFunction(() => window.__apex.info().track != null, { timeout: 8000 });
  await page.evaluate(() => window.__apex.go());
}

// Drive one lap under the given physics settings; returns metrics. Runs entirely
// in-page (one evaluate) so the per-tick loop has no round-trip overhead.
function runLap(page, settings, opts = {}) {
  return page.evaluate(({ settings, opts }) => {
    const A = window.__apex;
    const VMAX = 94;
    const aLat = opts.aLat || 24;          // arcade lateral-grip target (m/s^2)
    const Kp = opts.Kp || 2.2;             // steering proportional gain
    const maxSeconds = opts.maxSeconds || 150;
    if (settings) A.setPhysics(settings);
    A.jump(0.0, 30, 0); A.aim(0);
    const total = A.info().total;
    const start = A.physState().prog;
    const dt = 1 / 60, maxFrames = maxSeconds * 60;
    let frames = 0, offFrames = 0, maxOverHw = 0, maxWall = 0;
    let sumSpeed = 0, minSpeed = 1e9, finite = true, lastProg = start, stalled = 0;
    while (frames < maxFrames) {
      const p = A.probe();
      if (!p) { finite = false; break; }
      // speed-scaled look-ahead (≈ braking distance); sample several points.
      const look = Math.min(130, 16 + p.speed * 1.5);
      const pts = A.scan([6, look * 0.35, look * 0.6, look]);
      let kMax = Math.abs(p.k), kMid = p.k;
      for (const sc of pts) kMax = Math.max(kMax, Math.abs(sc.k));
      kMid = pts[1].k;                       // signed curvature mid-window
      // target speed from the sharpest upcoming corner
      let vT = kMax > 1e-4 ? Math.sqrt(aLat / kMax) : VMAX;
      vT = Math.max(12, Math.min(VMAX, vT));
      // pure-pursuit toward the centreline: the centreline L ahead is displaced
      // laterally by ~k*L^2/2 (k>0 = right). Aim there, null bearing + heading.
      const L = Math.max(7, Math.min(40, p.speed * 0.6));
      const latTarget = kMid * L * L * 0.5;
      const bearing = Math.atan2(latTarget - p.x, L);   // + = target to the right
      let steer = Kp * (bearing - p.angle);
      steer = Math.max(-1, Math.min(1, steer));
      A.setInput({ steer, throttle: p.speed < vT, brake: p.speed > vT * 1.06 });
      A.step(dt, 1);
      const q = A.probe(), ps = A.physState();
      if (!q || !Number.isFinite(q.x) || !Number.isFinite(ps.speed)) { finite = false; break; }
      const over = Math.abs(q.x) - q.hw;
      if (over > 0.2) offFrames++;
      maxOverHw = Math.max(maxOverHw, over);
      maxWall = Math.max(maxWall, A.maxWallOvershoot() || 0);
      sumSpeed += ps.speed; minSpeed = Math.min(minSpeed, ps.speed);
      if (ps.prog - start >= total) { frames++; break; }   // lap done
      if (ps.prog - lastProg < 0.02) stalled++; else stalled = 0;
      lastProg = ps.prog;
      frames++;
      if (stalled > 60 * 8) break;            // 8 s of no progress = gave up
    }
    const ps = A.physState();
    A.clearInput();
    const dist = ps.prog - start;
    return {
      completed: dist >= total - 2,
      lapTime: +(frames / 60).toFixed(2),
      distPct: +(100 * dist / total).toFixed(1),
      avgSpeed: +(sumSpeed / Math.max(1, frames)).toFixed(1),
      minSpeed: +minSpeed.toFixed(1),
      offFrames, maxOverHw: +maxOverHw.toFixed(2), maxWall: +maxWall.toFixed(2),
      finite,
    };
  }, { settings, opts });
}

test.describe("Apex 26 — autopilot (programmatic driving)", () => {
  // Sanity: the autopilot completes a clean lap on flowing + technical tracks.
  for (const id of ["monza", "bahrain", "suzuka"]) {
    test(`autopilot completes a clean lap at ${id}`, async ({ page }) => {
      const errors = [];
      page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));
      await load(page, id);
      const r = await runLap(page, null);
      console.log(`[autopilot ${id}]`, JSON.stringify(r));
      expect(errors).toEqual([]);
      expect(r.finite).toBe(true);
      expect(r.completed).toBe(true);              // drove a full lap, never stuck
      expect(r.maxWall).toBeLessThan(1);           // never clipped a barrier
      expect(r.offFrames).toBeLessThan(r.lapTime * 60 * 0.25);  // mostly on-track
    });
  }

  // The harness as a steering-settings evaluator: sweep a setting and report how
  // each value drives. On-rails (drift 0 / strong road-follow) should hold the
  // line at least as well as a loose, slidey, no-road-follow setup.
  test("sweeps steering settings and the tidy setup holds the line best", async ({ page }) => {
    await load(page, "monza");
    const tidy   = await runLap(page, { drift: 0.0, roadFollow: 0.8, maxSlip: 0.55 });
    const loose  = await runLap(page, { drift: 0.7, roadFollow: 0.3, maxSlip: 0.7 });
    console.log("[sweep monza] tidy =", JSON.stringify(tidy));
    console.log("[sweep monza] loose =", JSON.stringify(loose));
    expect(tidy.finite && loose.finite).toBe(true);
    expect(tidy.completed).toBe(true);                       // a good setup laps cleanly
    expect(tidy.maxOverHw).toBeLessThanOrEqual(loose.maxOverHw + 0.5);  // tidier line
    expect(tidy.offFrames).toBeLessThanOrEqual(loose.offFrames + 30);
  });
});
