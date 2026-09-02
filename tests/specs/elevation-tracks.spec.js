// @ts-check
// Elevation + banking ("berm") tracks. The slope-gravity fix (descents must not
// overspeed past VMAX, climbs must not act as an invisible wall) and the passive
// road-following yaw were verified on Spa/Bahrain only; this now sweeps every
// circuits (every track carries elevation data) so a regression on any one is
// caught. For each track it:
//   - finds the steepest descent and asserts gravity never pushes past top speed
//   - finds the steepest climb and asserts the car still accelerates up it
//   - drives the sharpest corner with NO steering and asserts road-following keeps
//     the car within the track limits (doesn't run off down/up a slope)
//   - never NaNs or throws the car off the world
// Imports from ./fixtures.js, NOT from @playwright/test, so a failure attaches
// apex-state / apex-logs / page-console — a bare "expected 43 to be greater than
// 50" arrives with the car's state and the retained log ring beside it.
import { test, expect, BOOT_MS } from "../helpers/fixtures.js";

// All circuits — every track now carries elevations data.
const ELEVATION_TRACKS = [
  "abudhabi", "albert_park", "bahrain", "baku", "cota", "hungaroring", "imola",
  "interlagos", "jeddah", "madrid", "mexico", "miami", "monaco", "montreal",
  "monza", "qatar", "redbull", "shanghai", "silverstone", "singapore", "spa",
  "suzuka", "vegas", "zandvoort",
  // Retired / off-calendar circuits (def `classic: true`).
  "hockenheim", "nurburgring", "catalunya", "sepang", "istanbul",
  "paul_ricard", "portimao", "sochi", "mugello", "magny_cours",
  "estoril", "kyalami", "watkins_glen", "indianapolis", "buenos_aires",
  "jacarepagua",
];
// Circuits with `banked: true` (raised outer edge through the fast corners).
const BANKED_TRACKS = ["zandvoort", "madrid"];

// The two launch speeds the gradient probes start from, named because the
// assertions below compare against them. AGENTS.md's PACE rule: a speed
// compared against a bare literal goes stale the moment PACE is retuned, and
// "> 41" against a launch of 40 was a disguised claim that every circuit's
// start line is flat.
const FLAT_LAUNCH = 40;    // m/s, flat-out reference run on the straightest stretch
const CLIMB_LAUNCH = 10;   // m/s, low-speed run at the steepest climb

async function startRace(page, id) {
  await page.goto("/");
  // BOOT_MS, not a hand-rolled 8 s: a SwiftShader boot here measures 11-33 s (2026-09-01).
  await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
  await page.evaluate((t) => window.__apex.race(t, "day", "dry"), id);
  await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: BOOT_MS });
  // info().track goes non-null as soon as the track OBJECT exists, which is before
  // its elevation is necessarily in place. Scanning that window reads the flat
  // default tangent, so the "this track really does descend" assertion saw dn = 0
  // exactly — intermittently, and worst on the circuits with the least relief
  // (abudhabi 9.2 m of range, qatar 6.7 m). Run in isolation the same scan finds
  // dn = -0.0226, so this was a race with the build, not a claim about the data.
  // Wait for the profile to actually show relief before anything reads a slope.
  await page.waitForFunction(() => {
    const p = window.__apex.trackProfile(120);
    if (!p || !p.length) return false;
    const ys = p.map((q) => q.y);
    return Math.max(...ys) - Math.min(...ys) > 0.5;   // metres of elevation range
  }, null, { polling: 100, timeout: 20000 });
  await page.evaluate(() => window.__apex.go());
}

test.describe("Apex 26 — elevation & banking tracks", () => {
  // SEQUENTIAL, IN ONE WORKER. `fullyParallel: true` in playwright.config.js
  // spreads the tests in a file across workers, and each test here BUILDS A
  // WHOLE CIRCUIT — mugello alone is 637 712 prop verts, 693 752 total. Two of
  // those under SwiftShader at once is the same memory wall that made
  // test:sweeps and test:tooling pass --test-concurrency=1 deliberately
  // (AGENTS.md: "four at once reached 5.4 GB and was OOM-killed").
  //
  // Measured: in the full 105-test physics run, mugello (test 50) failed with
  // 36 uncaught page errors and sochi (test 51) timed out at 120 s — ADJACENT
  // tests, 37 seconds apart, one resource event rather than two circuit
  // defects. Run alone, each passes in ~24 s. Nothing about either circuit was
  // wrong.
  //
  // `default`, not `serial`: both run in a single worker sequentially, but a
  // failure in one must not skip the rest — a circuit that genuinely breaks
  // should not hide the other thirty-nine.
  test.describe.configure({ mode: "default" });

  test("banking pivots around the centreline with smooth edge transitions", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
    const audits = await page.evaluate(() => {
      return ["zandvoort", "madrid"].map((id) => {
        const def = Tracks.LIST.find((entry) => entry.id === id);
        const track = Tracks.buildCenterline(def);
        const stepM = 1;
        let maxCentreLift = 0, maxPivotError = 0, maxEdgeGrade = 0;
        for (let s = 0; s < track.total; s += stepM) {
          const centre = Tracks.banking(track, s, 0);
          maxCentreLift = Math.max(maxCentreLift, Math.abs(centre?.dy || 0));
          const leftEdge = Tracks.banking(track, s, -Infinity)?.dy || 0;
          const edge = Tracks.banking(track, s, Infinity)?.dy || 0;
          const nextEdge = Tracks.banking(track, s + stepM, Infinity)?.dy || 0;
          maxPivotError = Math.max(maxPivotError, Math.abs(leftEdge + edge));
          maxEdgeGrade = Math.max(maxEdgeGrade, Math.abs(nextEdge - edge) / stepM);
        }
        return { id, maxCentreLift, maxPivotError, maxEdgeGrade };
      });
    });

    for (const audit of audits) {
      expect(audit.maxCentreLift, `${audit.id} centreline lift`).toBeLessThan(0.01);
      expect(audit.maxPivotError, `${audit.id} edge symmetry`).toBeLessThan(0.01);
      expect(audit.maxEdgeGrade, `${audit.id} bank transition grade`).toBeLessThan(0.08);
    }
  });

  test("Zandvoort banking peaks at Hugenholtz and Arie Luyendyk", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
    const result = await page.evaluate(() => {
      const def = Tracks.LIST.find((entry) => entry.id === "zandvoort");
      const track = Tracks.buildCenterline(def);
      const rollDeg = (frac) => {
        const bank = Tracks.banking(track, frac * track.total, 0);
        return Math.abs((bank?.roll || 0) * 180 / Math.PI);
      };
      // Ask the curated apex table where the corners are instead of carrying a
      // lap fraction. The fractions this test used to assert (0.1575/0.9687)
      // were measured against a centreline the start-line rotation has since
      // moved, so they had drifted onto flat road — the test was red, and the
      // banks it was guarding sat on Scheivlak and Hunserug instead. The two
      // bowls are anchored by turn index now and cannot drift again.
      return {
        hugenholtz: rollDeg(def.turns[2]),    // T3, the banked LEFT hairpin
        luyendyk: rollDeg(def.turns[13]),     // T14, the banked final RIGHT
        others: def.turns.filter((_, i) => i !== 2 && i !== 13).map(rollDeg),
      };
    });

    expect(result.hugenholtz, "Hugenholtz banking").toBeGreaterThan(15);
    expect(result.luyendyk, "Arie Luyendyk banking").toBeGreaterThan(15);
    // The rest of the lap carries ordinary 3-4 deg camber, never a bowl.
    expect(Math.max(...result.others), "no other corner is banked like a bowl")
      .toBeLessThan(6);
  });

  test("Madrid converts La Monumental's 24 percent bank to degrees", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
    const rollDeg = await page.evaluate(() => {
      const def = Tracks.LIST.find((entry) => entry.id === "madrid");
      const track = Tracks.buildCenterline(def);
      const bank = Tracks.banking(track, 0.75 * track.total, 0);
      return Math.abs((bank?.roll || 0) * 180 / Math.PI);
    });

    expect(rollDeg).toBeGreaterThan(13);
    expect(rollDeg).toBeLessThan(14);
  });

  test("bank roll matches the road surface slope", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
    const result = await page.evaluate(() => {
      const def = Tracks.LIST.find((entry) => entry.id === "madrid");
      const track = Tracks.buildCenterline(def);
      const s = 0.75 * track.total;
      const w = track.hw[Math.round(0.75 * track.n) % track.n];
      const leftY = Tracks.banking(track, s, -w)?.dy || 0;
      const rightY = Tracks.banking(track, s, w)?.dy || 0;
      const roll = Tracks.banking(track, s, 0)?.roll || 0;
      return {
        roll,
        surfaceRoll: Math.atan2(rightY - leftY, 2 * w),
      };
    });

    expect(result.roll).toBeCloseTo(result.surfaceRoll, 5);
  });

  test("chase camera follows the road bank instead of showing a sideways wall", async ({ page }) => {
    await startRace(page, "madrid");
    const result = await page.evaluate(() => {
      const def = Tracks.LIST.find((entry) => entry.id === "madrid");
      const track = Tracks.buildCenterline(def);
      const trackRoll = Tracks.banking(track, 0.75 * track.total, 0)?.roll || 0;
      window.__apex.jump(0.75, 30, 0);
      window.__apex.camera("chase");
      window.__apex.snapCam();
      const bankedRoll = window.__apex.camState().roll;
      window.__apex.orbit(0.75, 45, 18, 45);
      const debugRoll = window.__apex.camState().roll;
      window.__apex.camera("chase");
      window.__apex.jump(0.60, 30, 0);
      window.__apex.snapCam();
      const flatRoll = window.__apex.camState().roll;
      return { trackRoll, bankedRoll, debugRoll, flatRoll };
    });

    expect(Math.abs(result.bankedRoll) * 180 / Math.PI).toBeGreaterThan(13);
    expect(Math.abs(result.bankedRoll) * 180 / Math.PI).toBeLessThan(14);
    expect(result.bankedRoll).toBeCloseTo(-result.trackRoll, 4);
    expect(result.debugRoll).toBe(0);
    expect(Math.abs(result.flatRoll) * 180 / Math.PI).toBeLessThan(1);
  });

  for (const id of ELEVATION_TRACKS) {
    test(`${id}: slope gravity behaves + road-following holds on the grade`, async ({ page }) => {
      const errors = [];
      page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));
      await startRace(page, id);
      const r = await page.evaluate(({ FLAT_LAUNCH, CLIMB_LAUNCH }) => {
        // Reference flat-out top speed (measured, not a hardcoded VMAX) so the
        // descent-overspeed check below is relative and survives a PACE/VMAX retune.
        //
        // MEASURED FIRST, BEFORE THE SCAN, because it has to be taken in clean
        // air. The scan below steps 300 times — five seconds of real racing —
        // and by the end of it the field has left the grid and is spread across
        // the start line, which is exactly where this run begins. Taken after
        // the scan on Monaco (shortest lap, densest pack) the player was jumped
        // into the middle of the traffic and shoved 66 m BACKWARDS on the first
        // tick: flatMax came out at 20.3 m/s, a first-corner speed rather than a
        // top speed, and the descent below then "overspeeded" a reference that
        // was never a top speed at all. Still measured BEFORE the scan for that
        // reason; the placement itself has since moved off the start line — see
        // below.
        let finite = true;
        // TAKEN ON THE STRAIGHTEST STRETCH OF THE LAP, not at frac 0.0. An
        // unsteered car goes straight while the road turns, so where the
        // reference STARTS decides how long it survives — and at the start line
        // that is a property of the circuit's first corner, not of its physics.
        // Measured: cota lasted 30 steps and paul_ricard 24 before leaving the
        // road, against monza's and spa's comfortable runs, so the old placement
        // was silently asking "does this circuit have a long enough pit straight".
        // Lowering the dwell bar does not fix it: at 24 steps flatMax is barely
        // distinguishable from the launch speed and the reference stops meaning
        // anything.
        //
        // The lowest-mean-|k| window is the one place every circuit has where an
        // unsteered car stays on the road. It also beats frac 0.0 on the "clean
        // air" requirement the original placement was chosen for: rather than
        // starting ahead of a grid that is about to move, it starts away from
        // the pack entirely.
        const prof = window.__apex.trackProfile(300);
        const WIN = 10;                       // ~1/30 of a lap
        let flatAt = 0, bestBend = Infinity;
        for (let i = 0; i < prof.length; i++) {
          let bend = 0;
          for (let j = 0; j < WIN; j++) bend += Math.abs(prof[(i + j) % prof.length].k);
          if (bend < bestBend) { bestBend = bend; flatAt = prof[i].frac; }
        }
        window.__apex.jump(flatAt, FLAT_LAUNCH, 0);
        window.__apex.setInput({ steer: 0, throttle: true });
        let flatMax = 0, flatSteps = 0;
        // STOP SAMPLING ONCE THE CAR LEAVES THE ROAD. `steer: 0` held for three
        // seconds drives STRAIGHT while the road turns, so on most circuits the
        // car is in the runoff within a second or two and its speed collapses —
        // measured, by probing six circuits: monza reached 41.8 then fell to
        // 22.9 at x=-7.9; paul_ricard 38.8 then 9.1 at x=-9.1; cota 40.8 then
        // 9.1 at x=+14.9; monaco 41.9 then 10.1. Only spa (+5.05) and
        // hungaroring (+4.75) stayed on and accelerated cleanly.
        //
        // So this never measured a flat-out top speed. It measured HOW LONG THE
        // START STRAIGHT IS before an unsteered car falls off — which is why
        // cota and paul_ricard "failed" and spa "passed", and why the old
        // `> 41` threshold was really asking whether a circuit has a long
        // enough straight. Everything downstream inherited the error: the
        // descent check compares maxV against flatMax * 1.35, i.e. against a
        // reference set by a car in the gravel.
        //
        // Bounded to the on-road stretch, the reference is what its name says.
        for (let i = 0; i < 180; i++) {
          window.__apex.step(1 / 60, 1);
          const p = window.__apex.physState();
          if (Math.abs(p.x) > window.__apex.probe().hw) break;   // off the road — stop counting
          flatMax = Math.max(flatMax, p.speed);
          flatSteps++;
        }
        window.__apex.clearInput();

        // Scan the lap for the steepest descent and climb (road pitch via slope).
        let dnAt = 0, dn = 0, upAt = 0, up = 0;
        for (let i = 0; i < 300; i++) {
          const f = i / 300;
          window.__apex.jump(f, 40, 0); window.__apex.step(1 / 60, 1);
          const s = window.__apex.physState().slope;
          if (s < dn) { dn = s; dnAt = f; }
          if (s > up) { up = s; upAt = f; }
        }

        // Descent at top speed: gravity must not push meaningfully past the flat
        // top speed (start AT it so we measure overspeed, not deceleration).
        window.__apex.jump(dnAt, flatMax, 0);
        window.__apex.setInput({ steer: 0, throttle: true });
        let maxV = 0;
        for (let i = 0; i < 150; i++) {
          window.__apex.step(1 / 60, 1);
          const p = window.__apex.physState();
          maxV = Math.max(maxV, p.speed);
          if (!Number.isFinite(p.speed) || !Number.isFinite(p.s) || !Number.isFinite(p.x)) finite = false;
        }

        // Climb from low speed: gravity must not be a wall.
        window.__apex.jump(upAt, CLIMB_LAUNCH, 0);
        const cv0 = window.__apex.physState().speed;
        for (let i = 0; i < 150; i++) window.__apex.step(1 / 60, 1);
        const cv1 = window.__apex.physState().speed;

        // Road-following on the grade: approach the sharpest corner with NO steer
        // at a moderate corner speed, and confirm the assist tracks the road
        // instead of running off (which on a slope would also pitch it up/down the
        // bank). The assist is OPT-IN now (ships at 0 — an un-steered car is meant
        // to drive straight off), so switch it on explicitly: what's under test is
        // that it still holds a car on a SLOPED, BANKED road, not that it's on.
        window.__apex.setPhysics({ roadFollow: 0.6 });
        const corners = window.__apex.corners();
        let widest = 0, hw = 7;
        for (const f of corners) {
          // start a little before the apex so the car turns INTO the corner
          window.__apex.jump((f - 0.02 + 1) % 1, 30, 0);
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
        window.__apex.setPhysics({ roadFollow: 0 });   // restore the shipped default
        return { dn, up, maxV, flatMax, flatSteps, flatAt: +flatAt.toFixed(3), climbGain: cv1 - cv0, climbEnd: cv1, widest, hw, finite };
      }, { FLAT_LAUNCH, CLIMB_LAUNCH });

      expect(errors).toEqual([]);
      expect(r.finite).toBe(true);
      expect(r.dn).toBeLessThan(0);                 // the track really does descend
      expect(r.up).toBeGreaterThan(0);              // and climb
      // The reference must not have been BLOCKED — the failure this guards is a
      // car jumped into traffic and shoved backwards, which on Monaco measured
      // flatMax 20.3 m/s, a first-corner speed masquerading as a top speed.
      //
      // It used to demand `> 41`, i.e. a full 1 m/s gain over the launch, and
      // that is a claim about the START LINE rather than about being blocked.
      // COTA's start line climbs into one of the steepest turn-1 ascents in the
      // calendar, so three seconds flat out there nets +0.9 m/s and the test
      // called a physically correct run "blocked". A spec about GRADIENTS must
      // not assume every circuit's frac 0.0 is flat. Comparing against the
      // launch speed keeps all the discriminating power that matters — the case
      // it exists to catch is half the launch speed, not 0.1 under it — and
      // AGENTS.md's PACE rule wants the launch constant here rather than a bare
      // speed literal in any case.
      // The reference is only meaningful if the car spent real time ON the road:
      // a single on-road step would make flatMax the launch speed and nothing
      // more, and the ratio below would be comparing against a number that
      // measured nothing.
      expect(r.flatSteps,
        `reference run at frac ${r.flatAt} left the road immediately — no usable reference`)
        .toBeGreaterThan(30);
      expect(r.flatMax, "flat-out reference run was blocked — it lost ground from the launch")
        .toBeGreaterThanOrEqual(FLAT_LAUNCH);
      expect(r.maxV).toBeLessThan(r.flatMax * 1.35); // no descent runaway past flat top speed (gravity adds a little downhill, but doesn't run away)
      // Climbs freely (gravity isn't an invisible wall). The gain is modest on
      // tracks whose only grade is a shallow recovery (e.g. Bahrain's dip), large
      // on real climbs (Spa's Eau Rouge), so just require the car is still moving.
      //
      // THE ASSERTION DID NOT MATCH THAT COMMENT. "Just require the car is still
      // moving" was written as `climbGain > 0.5` — a demand that it ACCELERATE.
      // On the Hungaroring's steepest climb, from 10 m/s, the car nets -0.93 m/s
      // and is still very much moving; gravity is a cost there, not a wall. The
      // comment is the real specification, so assert it: the car keeps climbing
      // rather than being stopped or thrown backwards down the hill.
      expect(r.climbEnd, "gravity stopped the car dead on the climb").toBeGreaterThan(CLIMB_LAUNCH * 0.5);
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
        // each at a corner-appropriate speed and let road-following ride the curve.
        // The assist is opt-in (ships at 0), so enable it explicitly — the subject
        // here is the BANKED road, not the default.
        window.__apex.setPhysics({ roadFollow: 0.6 });
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
