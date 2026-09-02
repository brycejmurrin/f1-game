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
// Imports from ./fixtures.js, NOT from @playwright/test, so a failure attaches
// apex-state / apex-logs / page-console — a bare "expected 43 to be greater than
// 50" arrives with the car's state and the retained log ring beside it.
import { test, expect, BOOT_MS, awaitTrackBuild } from "../helpers/fixtures.js";

async function load(page, id) {
  await page.goto("/");
  // BOOT_MS, not a hand-rolled 8 s: a SwiftShader boot here measures 11-33 s (2026-09-01).
  await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
  await page.evaluate((t) => window.__apex.race(t, "day", "dry"), id);
  // NOT a 45 s wall. suzuka is the heaviest scenery build in the suite, and on a
  // loaded 2-worker SwiftShader box it blew through BOOT_MS while the Log ring was
  // still emitting `[car] build ...` at 65.7 s — a slow box, not a wedge (pages runs
  // 1898/1899/1901, and reproduced here 2026-09-02). awaitTrackBuild is exactly what
  // fixtures.js says to move to when a hand-rolled track wait first goes red on a
  // slow box: it waits on PROGRESS and still fails fast on a genuinely stuck build.
  await awaitTrackBuild(page);
  await page.evaluate(() => window.__apex.go());
  // HEADLESS, because this test never looks at a pixel. runLap drives 9,000
  // physics ticks in ONE in-page evaluate, and the whole time the rAF loop is
  // rasterising suzuka on SwiftShader beside it, competing for the same cores —
  // which is why the lap costs ~185 s here alone and blows any budget the moment
  // a second worker exists. headless(true) makes game.js's render() return early
  // and every metric this file reads survives it: probe(), physState() and
  // maxWallOvershoot() are all computed from G.cars and Tracks.wallAt, never from
  // a frame. Nothing here calls render({what:...}), which is the one hook that
  // goes stale under headless.
  await page.evaluate(() => window.__apex.headless(true));
  // PACE pinned here, at the one place every test stages its lap. The autopilot's
  // controller is written in absolute units (VMAX 94 m/s, aLat 13 m/s², A_BRAKE 24
  // m/s²) and the assertion is a DISTANCE (distPct > 40 of the lap in a fixed 150 s
  // window) — PACE is a ground-speed scale, so moving the OVERALL SPEED default
  // moves how far the car gets. Without this a red test is ambiguous between "the
  // physics broke" and "the car is slower now, by design". runLap() applies its own
  // setPhysics AFTER this, so a sweep can still override anything it wants.
  await page.evaluate(() => window.__apex.setPhysics({ pace: 1 }));
}

// Drive one lap under the given physics settings; returns metrics. Runs entirely
// in-page (one evaluate) so the per-tick loop has no round-trip overhead.
// opts.mode: "direct" (default) feeds the steer straight in; "tilt" routes the
// steer command through the real tilt pipeline (One-Euro + dead zone + MAX_TILT +
// slew) via __apex.tiltSim, so a lap can be driven "as if tilting the phone".
function runLap(page, settings, opts = {}) {
  return page.evaluate(({ settings, opts }) => {
    const A = window.__apex;
    const VMAX = 94;
    const aLat = opts.aLat || 13;          // corner-speed grip target (m/s^2): a real
                                           // driver leaves margin under the grip the
                                           // grip-limited car can sustain (which falls
                                           // with speed), so it's never over-driving
    const Kp = opts.Kp || 2.4;             // steering proportional gain
    const maxSeconds = opts.maxSeconds || 150;
    const tilt = opts.mode === "tilt";
    // A human tilting the phone expresses their intended steer as a fixed physical
    // gesture: full intent ≈ this many degrees of roll. The game's sensitivity
    // (MAX_TILT) then converts that gesture to steering — so a sensitivity that's
    // mismatched to the gesture range genuinely under/over-steers (this is what
    // makes maxTilt tunable; inverting the map would just cancel it out).
    const HUMAN_TILT_DEG = opts.humanTiltDeg || 32;
    // Hand tremor: a real player's hand isn't steady — a low-frequency wobble plus
    // a little noise rides on the tilt gesture (degrees). WITHOUT this the "human"
    // is a perfect controller that always prefers zero smoothing; WITH it, smoothing
    // (slew + One-Euro) becomes a genuine trade-off (filter jitter vs add lag), so
    // the tuner's smoothing recommendation is meaningful for actual players.
    const tremDeg = opts.tremorDeg != null ? opts.tremorDeg : (tilt ? 2.5 : 0);
    let seed = (opts.seed != null ? opts.seed : 0x9e3779b9) >>> 0;
    const rng = () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = (t + Math.imul(t ^ t >>> 7, 61 | t)) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    if (settings) A.setPhysics(settings);
    if (tilt) A.tiltSim.reset();
    A.jump(0.0, 30, 0); A.aim(0);
    A.rivals([]);                 // clear the AI field — a clean solo benchmark lap
    const total = A.info().total;
    const start = A.physState().prog;
    const dt = 1 / 60, maxFrames = maxSeconds * 60;
    // dense look-ahead distances (5..160 m): sampling DENSELY is what stops the
    // controller skipping over a sharp corner between coarse samples (the old bug:
    // it arrived at the first chicane flat-out and ran wide).
    const DISTS = []; for (let d = 5; d <= 160; d += 6) DISTS.push(d);
    let frames = 0, offFrames = 0, maxOverHw = 0, maxWall = 0;
    let sumSpeed = 0, minSpeed = 1e9, finite = true, lastProg = start, stalled = 0;
    let jitter = 0, prevSteer = 0;   // total |Δsteer| — steering smoothness (tilt feel)
    let vThold = 30;                 // anti-surge target speed (drops fast, rises slow)
    while (frames < maxFrames) {
      const p = A.probe();
      if (!p) { finite = false; break; }
      // target speed = a proper BRAKING ENVELOPE. For every look-ahead point we
      // compute the corner speed it needs (v=sqrt(aLat/k)) AND the fastest we can
      // go NOW and still brake down to that by the time we reach it
      // (v_now² = v_corner² + 2·a_brake·dist). The min over all points guarantees
      // we slow in time for the whole upcoming road — the single biggest thing the
      // old "sharpest-corner-in-a-window" target got wrong, which let it over-drive
      // entries and wash wide on a grip-limited car.
      const A_BRAKE = 24;                    // m/s² assumed braking authority (margin)
      const pts = A.scan(DISTS);
      let kSteer = p.k;
      const steerLook = Math.max(9, p.speed * 0.4);
      let vT = Math.abs(p.k) > 1e-4 ? Math.sqrt(aLat / Math.abs(p.k)) : VMAX;
      for (let j = 0; j < pts.length; j++) {
        const d = DISTS[j], k = Math.abs(pts[j].k);
        if (d <= steerLook) kSteer = pts[j].k;            // signed curvature just ahead
        const vCorner = k > 1e-4 ? Math.sqrt(aLat / k) : VMAX;
        const vAllow = Math.sqrt(vCorner * vCorner + 2 * A_BRAKE * d);
        if (vAllow < vT) vT = vAllow;
      }
      vT = Math.max(11, Math.min(VMAX, vT));
      // The envelope already prevents lunging into the next corner, so the target
      // can rise quickly (it only rises when the road genuinely opens up).
      vThold = Math.min(vT, vThold + 30 * dt);
      vT = vThold;
      // ---- pure-pursuit toward the centreline. The centreline L ahead is
      // displaced laterally ~k*L^2/2 (k>0 = right); aim there, null bearing + heading.
      const L = Math.max(8, Math.min(38, p.speed * 0.6));
      const latTarget = kSteer * L * L * 0.5;
      let steer = Kp * (Math.atan2(latTarget - p.x, L) - p.angle);
      steer = Math.max(-1, Math.min(1, steer));
      // Tilt mode: the "human" rolls the phone proportional to intent (a fixed
      // gesture range) plus hand tremor; the game's tilt pipeline (sensitivity +
      // dead zone + filter + slew) turns that roll back into the actual steer.
      if (tilt) {
        const trem = tremDeg * (0.6 * Math.sin(2 * Math.PI * 3.2 * frames * dt) + 0.4 * (rng() * 2 - 1));
        steer = A.tiltSim.step(steer * HUMAN_TILT_DEG + trem, dt);
      }
      jitter += Math.abs(steer - prevSteer); prevSteer = steer;
      // Understeer / wedge / off-track recovery — the one thing a real driver does
      // that naive pure-pursuit doesn't. The grip-limited car won't rotate if you
      // just hold more lock into a corner (the front washes wide, or the nose
      // wedges and progress stops). So when we're running off the road OR have
      // stopped making progress while trying to drive, LIFT, brake, and EASE the
      // lock so the tyres regain grip and the car rotates/returns — then resume.
      const offRoad = Math.abs(p.x) - p.hw > 0.4;
      const wedged = stalled > 10;            // ~0.17 s of no progress while moving
      let throttle = p.speed < vT, brake = p.speed > vT * 1.04;
      if (wedged) {
        // A wedge is a STEERING problem (too much lock for the grip). EASE the lock so
        // the front bites — but KEEP THE CAR MOVING (throttle on, no brake): if it
        // slows to a crawl the model fades steering authority toward a standstill and
        // it can never turn out, deadlocking. A moving car with light lock slides free.
        steer = Math.max(-0.4, Math.min(0.4, steer));
        throttle = true; brake = false;
      } else if (offRoad) {
        // Running wide onto the runoff: just lift and keep FULL corrective lock toward
        // the road (capping it is what leaves the car skimming the edge). The normal
        // corner-speed braking handles speed; piling on more brake only makes it crawl.
        throttle = false;
      }
      A.setInput({ steer, throttle, brake });
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
      jitter: +(jitter / Math.max(1, frames)).toFixed(4),   // mean |Δsteer|/tick
      finite,
    };
  }, { settings, opts });
}

test.describe("Apex 26 — autopilot (programmatic driving)", () => {
  // The autopilot is a SAFETY + DRIVABILITY check and a tuning instrument — not a
  // race winner. Its simple braking-envelope + pure-pursuit driver proves the car
  // can be driven hard without ever NaN-ing or clipping a barrier, and makes real
  // progress around the lap. (It is NOT a perfect racing line: with the realistic
  // grip-limited tyre model the tightest technical circuits aren't fully completed
  // by a naive centreline follower — that needs a path-planning driver, which is a
  // separate effort. Full-lap completion is therefore not asserted here.)
  for (const id of ["monza", "suzuka"]) {
    test(`autopilot drives safely and makes progress at ${id}`, async ({ page }) => {
      // ITS OWN NUMBER, MEASURED — not the global 120 s. One boot plus a
      // 150-sim-second lap. With the rAF render left running this cost 185 s for
      // suzuka alone and 209.8 s under a second worker (a fail); headless, the
      // same test is 87.6 s with a second worker beside it (2026-09-02, this box).
      // 180 s is ~2x that, which is the margin a slower CI runner needs — the boot
      // is the variable half and a cold runner has measured 66 s just to build
      // suzuka's field. This covers a slow MACHINE, not a slow assertion, which is
      // what playwright.config's own note asks such a test to declare for itself.
      test.setTimeout(180_000);
      const errors = [];
      page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));
      await load(page, id);
      const r = await runLap(page, null);
      console.log(`[autopilot ${id}]`, JSON.stringify(r));
      expect(errors).toEqual([]);
      expect(r.finite).toBe(true);                 // never NaN-ed / threw the car off the world
      expect(r.maxWall).toBeLessThan(1);           // never clipped a barrier
      expect(r.distPct).toBeGreaterThan(40);       // genuinely drivable — real progress, not stuck
    });
  }

  // Emulated tilt: drive through the real tilt pipeline (One-Euro + dead zone +
  // slew). It's laggier than direct input, so the line is looser — but a sane tilt
  // setup must still drive safely (no barrier clip / NaN) and make progress. Each
  // lap reloads a fresh page so runs don't inherit one another's end state.
  test("can drive safely via emulated tilt input", async ({ page }) => {
    // TWO boots and TWO laps. Before the headless switch this measured 143 s and
    // had earlier PASSED at 112.4 s — 7.6 s under the global 120 s cap, which meant
    // that cap was going to fail it on any slower runner for reasons unrelated to
    // what it asserts. Headless it is 51.9 s under a second worker (2026-09-02).
    // Same 180 s as the tests above rather than a number of its own: it is no
    // longer the expensive one, and one budget for the file is easier to keep true.
    test.setTimeout(180_000);
    const errors = [];
    page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));
    await load(page, "monza");
    const direct = await runLap(page, null, { mode: "direct" });
    await load(page, "monza");
    const tilt   = await runLap(page, null, { mode: "tilt" });
    console.log("[tilt monza] direct =", JSON.stringify(direct));
    console.log("[tilt monza] tilt   =", JSON.stringify(tilt));
    expect(errors).toEqual([]);
    expect(tilt.finite).toBe(true);
    expect(tilt.maxWall).toBeLessThan(1);         // tilt drives without clipping a barrier
    expect(tilt.distPct).toBeGreaterThan(30);     // and gets meaningfully round the lap
  });

});
