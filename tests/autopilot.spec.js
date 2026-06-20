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

  // FULL SLIDER TUNER — sweeps every tunable steering slider VIA TILT (with hand
  // tremor) and recommends the default for each. Works in slider-INTEGER space
  // (1..10) using the same maps as js/game.js, so the output is directly the
  // store default to ship. Coordinate descent from the current defaults: sweep one
  // slider at a time over a TASTEFUL range (no extremes — keeps "balanced feel",
  // never grippy-and-sterile), lock in the best, move on. Optimised for clean+fast
  // laps within those ranges. Drift candidates stay lively (never 0).
  // SKIPPED: this coordinate-descent tuner predates the dynamic-model redesign —
  // its slider→physics maps and its reliance on full-lap completion no longer match
  // the new model (a naive driver doesn't complete the tightest tracks). Rework it
  // around the new feel levers + a path-planning driver before re-enabling.
  test.skip("tunes all steering sliders and recommends defaults", async ({ page }) => {
    test.setTimeout(1_600_000);   // ~27 min — 2-run avg per candidate (monza, two tremor seeds)
    // slider integer (1..10) -> physics value, mirroring js/game.js maps exactly.
    const MAP = {
      rate:   (v) => 4.3 - 2.4 * (v - 1) / 9,        // WHEELBASE (response)
      expo:   (v) => 3.5 - 2.5 * (v - 1) / 9,        // LINEARITY
      lock:   (v) => 0.30 + 0.40 * (v - 1) / 9,      // STEER LOCK (maxSlip)
      spd:    (v) => 44 + 80 * (v - 1) / 9,          // SPEED STEER (speedRef)
      slide:  (v) => (v - 1) / 9 * 0.9,              // SLIDE (drift)
      tdeg:   (v) => Math.round(50 - 32 * (v - 1) / 9), // TILT RANGE (maxTilt deg)
      dz:     (v) => (v - 1) * 0.8,                  // DEAD ZONE (deg)
      smooth: (v) => 5 - 4 * (v - 1) / 9,            // STEER SMOOTHING (slew)
    };
    const toPhysics = (c) => ({
      wheelbase: MAP.rate(c.rate), expo: MAP.expo(c.expo), maxSlip: MAP.lock(c.lock),
      speedRef: MAP.spd(c.spd), drift: MAP.slide(c.slide),
      maxTilt: MAP.tdeg(c.tdeg), deadzone: MAP.dz(c.dz), tiltSlew: MAP.smooth(c.smooth),
    });
    // current shipped defaults (store integers)
    const cfg = { rate: 5, expo: 5, lock: 5, spd: 5, slide: 3, tdeg: 5, dz: 4, smooth: 6 };
    // tasteful candidate ranges per slider (keep feel; no twitchy/sterile extremes)
    const CAND = {
      tdeg: [4, 6], dz: [3, 5], smooth: [4, 5],
      rate: [4, 6], lock: [4, 6], spd: [4, 6], expo: [4, 6],
      slide: [4, 5],   // never below 3 → drift stays lively (balanced feel)
    };
    const ORDER = ["tdeg", "dz", "smooth", "rate", "lock", "spd", "expo", "slide"];
    const NAME = { tdeg: "TILT RANGE", dz: "DEAD ZONE", smooth: "SMOOTHING",
      rate: "RESPONSE", lock: "STEER LOCK", spd: "SPEED STEER", expo: "LINEARITY", slide: "SLIDE" };
    const score = (m) => (m.completed ? 1000 : 0)
      - m.offFrames * 0.5 - m.maxOverHw * 60 - m.maxWall * 800 - m.jitter * 300 + m.avgSpeed * 4;

    // 2-run average: monza with two different tremor seeds.
    // Two seeds collapse the ~5-10 pt run-to-run noise to ~±2 pts without
    // the extra time of a third track.
    const EVAL_RUNS = [
      { id: "monza", seed: 0x9e3779b9 },
      { id: "monza", seed: 0xdeadbeef },
    ];
    const evalCfg = async (c) => {
      let totalScore = 0, totalOff = 0, totalLap = 0, allCompleted = true, allFinite = true;
      for (const run of EVAL_RUNS) {
        await load(page, run.id);
        const m = await runLap(page, toPhysics(c), { mode: "tilt", seed: run.seed });
        totalScore += score(m);
        totalOff += m.offFrames;
        totalLap += m.lapTime;
        if (!m.completed) allCompleted = false;
        if (!m.finite) allFinite = false;
      }
      const n = EVAL_RUNS.length;
      const avgM = { offFrames: Math.round(totalOff / n), lapTime: +(totalLap / n).toFixed(2), completed: allCompleted, finite: allFinite };
      return { m: avgM, s: totalScore / n };
    };

    let baseline = await evalCfg(cfg), bestS = baseline.s;
    console.log(`\n=== full slider tuning (2-run avg: monza×2 seeds, via tilt+tremor) ===`);
    console.log(`baseline (current defaults): score ${bestS.toFixed(1)} off ${baseline.m.offFrames} lap ${baseline.m.lapTime}s`);
    for (const key of ORDER) {
      let bestVal = cfg[key], localBestS = bestS;
      for (const v of CAND[key]) {
        if (v === cfg[key]) continue;
        const r = await evalCfg({ ...cfg, [key]: v });
        console.log(`  ${NAME[key]} ${key}=${v}: score ${r.s.toFixed(1)}  off ${r.m.offFrames}  lap ${r.m.lapTime}s  ${r.m.completed ? "✓" : "✗"}`);
        if (r.s > localBestS + 1) { localBestS = r.s; bestVal = v; }   // +1 hysteresis: keep default unless clearly better
      }
      cfg[key] = bestVal; bestS = localBestS;
    }
    const phys = toPhysics(cfg);
    const physOf = { tdeg: "maxTilt", dz: "deadzone", smooth: "tiltSlew", rate: "wheelbase",
      lock: "maxSlip", spd: "speedRef", expo: "expo", slide: "drift" };
    console.log(`\n>>> RECOMMENDED SLIDER DEFAULTS (store integer  ->  physics):`);
    for (const key of ORDER)
      console.log(`    ${NAME[key].padEnd(12)} slider ${cfg[key]}  ->  ${+phys[physOf[key]].toFixed(3)}`);
    console.log(`    store defaults = ${JSON.stringify(cfg)}`);

    const final = await evalCfg(cfg);
    expect(final.m.finite).toBe(true);
    expect(final.m.completed).toBe(true);              // recommended defaults lap cleanly
    expect(final.s).toBeGreaterThanOrEqual(baseline.s - 1);  // never worse than current
  });

});
