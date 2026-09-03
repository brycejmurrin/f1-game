// @ts-check
// The TILT steering pipeline — js/input/input.js.
//
// Tilt is the DEFAULT steering mode on a phone (`steerMode` starts at "tilt"),
// and until this file nothing asserted any stage of it. `Input.simTilt` exists
// precisely so the whole chain can be driven with an explicit timestep, but its
// only consumer was tests/specs/autopilot.spec.js, which drives one lap and asserts a
// lap time — so the calibration offset, the dead zone, the MAX_TILT map, the
// slew asymmetry and the One-Euro filter were all covered only in the sense
// that a lap happened to complete.
//
// The pipeline, in order, and every stage below has a test:
//
//   deviceorientation -> gravity-vector roll (deg)   [live path only]
//     -> One-Euro adaptive low-pass  (SMOOTHING slider -> min cutoff)
//     -> minus the calibrated neutral (tiltZero)
//     -> dead zone SUBTRACTED (not clamped)
//     -> / (MAX_TILT - DEADZONE), clamped to +-1   (TILT RANGE slider)
//     -> asymmetric slew limiter (release 1.6x faster than tighten)
//
// WHY NOW: `tiltSteering()` (live, wall clock) and `simTilt()` (harness,
// explicit dt) used to restate that map and that slew twice, and the copies had
// already drifted — the hit-stop `timeScale` fix landed in one of them only.
// They now share `tiltTarget()` and `tiltSlew()`. Nothing but a spec stops the
// next person re-inlining one of them, so the last test here drives the LIVE
// path through real deviceorientation events and pins it to the same answer the
// harness gives.
//
// Numbers come from the API — Input.maxTilt / .deadzone / .tiltSlew /
// .minCutoff are read-only getters for exactly this reason — or are asserted as
// an ORDERING rather than a magnitude. The two literals that are deliberately
// hard-coded are the ones that ARE the contract: full lock is 1, and releasing
// is 1.6x tightening.
//
// Imports from ./fixtures.js, NOT from @playwright/test, so a failure attaches
// apex-state / apex-logs / page-console instead of a bare "expected 1, got 0".
import { test, expect } from "../helpers/fixtures.js";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => typeof Input !== "undefined" && !!Input.simTilt);
  await page.evaluate(() => {
    Input.reset();
    Input.setSteerMode("tilt");
    // The whole harness lives in the page, so a sweep of a few thousand
    // pipeline steps is ONE round trip rather than a few thousand. Every helper
    // drives the real Input.simTilt with an explicit dt — there is no wall
    // clock anywhere below except in the final live-path test.
    window.__tilt = {
      DT: 1 / 60,
      // Feed one constant angle for n steps; return the final steer command.
      // 240 steps at 60 Hz is 4 s of a perfectly still hand: long enough for
      // both the One-Euro filter and the slew limiter to converge.
      settle(deg, n = 240) {
        let v = 0;
        for (let i = 0; i < n; i++) v = Input.simTilt(deg, this.DT);
        return v;
      },
      // Same, but from a clean filter/slew/calibration state: what a phone
      // held dead still at `deg` eventually commands.
      hold(deg, n = 240) { Input.simTiltReset(); return this.settle(deg, n); },
      // The whole trajectory, for measuring lag rather than steady state.
      trace(deg, n) {
        const t = [];
        for (let i = 0; i < n; i++) t.push(Input.simTilt(deg, this.DT));
        return t;
      },
      // Note the order: setTiltDeadzone clamps itself against the CURRENT
      // MAX_TILT, so sensitivity has to be applied first.
      cfg(o) {
        if (o.maxTilt != null) Input.setTiltSensitivity(o.maxTilt);
        if (o.deadzone != null) Input.setTiltDeadzone(o.deadzone);
        if (o.cutoff != null) Input.setTiltSmoothing(o.cutoff);
        return window.__tilt.k;
      },
      get k() {
        return {
          maxTilt: Input.maxTilt, deadzone: Input.deadzone,
          slew: Input.tiltSlew, cutoff: Input.minCutoff,
        };
      },
    };
  });
});

/* ------------------------------------------------------------------ *
 * 1. DEAD ZONE
 * ------------------------------------------------------------------ */

test.describe("dead zone", () => {
  test("a tilt inside it commands exactly zero, and just outside it does not", async ({ page }) => {
    const r = await page.evaluate(() => {
      const T = window.__tilt, dz = Input.deadzone;
      return {
        dz,
        inside: [0, dz * 0.25, dz * 0.5, dz * 0.9, -dz * 0.5, -dz * 0.9].map((d) => T.hold(d)),
        outsideR: T.hold(dz * 2),
        outsideL: T.hold(-dz * 2),
      };
    });
    expect(r.dz).toBeGreaterThan(0);
    // Exactly zero, not "small": a phone resting in a hand must not creep.
    for (const v of r.inside) expect(v).toBe(0);
    expect(r.outsideR).toBeGreaterThan(0);
    expect(r.outsideL).toBeLessThan(0);
  });

  test("there is NO STEP at the dead-zone edge — the zone is subtracted, not clamped", async ({ page }) => {
    // The failure this pins: `if (|d| < DZ) return 0; else return d / MAX_TILT`.
    // That reads as a dead zone and passes the test above, but the first degree
    // past the edge hands the car DZ/(MAX-DZ) of lock in one go — the classic
    // "it does nothing, then it snaps" tilt complaint.
    const r = await page.evaluate(() => {
      const T = window.__tilt, dz = Input.deadzone;
      const out = [];
      for (let i = -6; i <= 6; i++) {
        const deg = dz + i * 0.1;
        out.push([deg, T.hold(deg)]);
      }
      return { out, naiveStep: dz / (Input.maxTilt - dz) };
    });

    let maxJump = 0;
    for (let i = 1; i < r.out.length; i++) {
      maxJump = Math.max(maxJump, Math.abs(r.out[i][1] - r.out[i - 1][1]));
    }
    // A clamping implementation would jump `naiveStep` in one 0.1 deg sample.
    expect(maxJump).toBeLessThan(r.naiveStep / 5);
    // …and the output leaves the edge from ~0 rather than from that step.
    const firstOutside = r.out.find(([deg]) => deg > r.out[6][0])[1];
    expect(Math.abs(firstOutside)).toBeLessThan(r.naiveStep / 5);
    expect(Math.abs(firstOutside)).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ *
 * 2. THE MAP
 * ------------------------------------------------------------------ */

test.describe("the MAX_TILT map", () => {
  test("full lock at MAX_TILT, clamped beyond, half-way in between", async ({ page }) => {
    const r = await page.evaluate(() => {
      const T = window.__tilt, m = Input.maxTilt;
      return {
        m,
        full: T.hold(m),
        beyond: T.hold(m * 3),
        way_beyond: T.hold(180),
        negFull: T.hold(-m),
        negBeyond: T.hold(-m * 3),
        half: T.hold(Input.steerToTilt(0.5)),
        quarter: T.hold(Input.steerToTilt(0.25)),
      };
    });
    expect(r.full).toBeCloseTo(1, 4);
    expect(r.negFull).toBeCloseTo(-1, 4);
    // Past full lock the map clamps — a phone turned upside down is still +1.
    expect(r.beyond).toBe(1);
    expect(r.way_beyond).toBe(1);
    expect(r.negBeyond).toBe(-1);
    expect(r.half).toBeCloseTo(0.5, 4);
    expect(r.quarter).toBeCloseTo(0.25, 4);
  });

  test("the RANGE moves with the TILT RANGE setting", async ({ page }) => {
    const r = await page.evaluate(() => {
      const T = window.__tilt;
      const PROBE = 18;   // one fixed physical angle, three settings
      const out = {};
      for (const deg of [20, 32, 50]) {
        T.cfg({ maxTilt: deg });
        out[deg] = { maxTilt: Input.maxTilt, atProbe: T.hold(PROBE), atOwnMax: T.hold(Input.maxTilt) };
      }
      return out;
    });
    // Every setting still reaches full lock — at its OWN angle.
    for (const k of ["20", "32", "50"]) expect(r[k].atOwnMax).toBeCloseTo(1, 4);
    // The same physical tilt is more steering the twitchier the setting is.
    expect(r["20"].atProbe).toBeGreaterThan(r["32"].atProbe);
    expect(r["32"].atProbe).toBeGreaterThan(r["50"].atProbe);
  });

  test("the setters clamp to their documented ranges and ignore nonsense", async ({ page }) => {
    const r = await page.evaluate(() => {
      const T = window.__tilt;
      const out = {};
      out.tiny = T.cfg({ maxTilt: 1 }).maxTilt;
      out.huge = T.cfg({ maxTilt: 999 }).maxTilt;
      out.cutLo = T.cfg({ cutoff: 0.01 }).cutoff;
      out.cutHi = T.cfg({ cutoff: 99 }).cutoff;
      // Nonsense is ignored outright, not coerced to 0 — a NaN reaching
      // MAX_TILT would make every steer command NaN.
      const before = T.k;
      Input.setTiltSensitivity(NaN);
      Input.setTiltSmoothing(undefined);
      Input.setTiltDeadzone("15");
      out.after = T.k;
      out.before = before;
      out.steerStillFinite = T.hold(Input.maxTilt);
      return out;
    });
    expect(r.tiny).toBe(8);
    expect(r.huge).toBe(60);
    expect(r.cutLo).toBe(0.3);
    expect(r.cutHi).toBe(4);
    expect(r.after).toEqual(r.before);
    expect(Number.isFinite(r.steerStillFinite)).toBe(true);
  });

  test("the dead zone is held below MAX_TILT so the map cannot invert", async ({ page }) => {
    // d / (MAX_TILT - DEADZONE) inverts sign if the dead zone ever exceeds the
    // range — tilt right, steer left. setTiltDeadzone guards that against the
    // range in force WHEN IT IS CALLED. See the note in the report: setting the
    // range afterwards is not re-checked, but no shipped UI path does that
    // (only __apex.setPhysics can, and only in that order).
    const r = await page.evaluate(() => {
      const T = window.__tilt;
      T.cfg({ maxTilt: 8 });            // the twitchiest the slider allows
      T.cfg({ deadzone: 15 });          // …and the widest dead zone
      return { k: T.k, atRight: T.hold(Input.maxTilt), atLeft: T.hold(-Input.maxTilt) };
    });
    expect(r.k.deadzone).toBeLessThan(r.k.maxTilt);
    expect(r.atRight).toBeGreaterThan(0);   // right is still right
    expect(r.atLeft).toBeLessThan(0);
  });
});

/* ------------------------------------------------------------------ *
 * 3. steerToTilt IS THE INVERSE OF THE MAP
 * ------------------------------------------------------------------ */

test.describe("steerToTilt", () => {
  test("round-trips through the pipeline at any sensitivity or dead zone", async ({ page }) => {
    // This is what makes autopilot's tilt lap meaningful: it converts a steer
    // command into an angle, feeds it through simTilt, and assumes it gets the
    // command back. If the dead-zone term ever drops out of one side, the whole
    // harness silently under-steers by DZ/(MAX-DZ) and the lap still "works".
    const r = await page.evaluate(() => {
      const T = window.__tilt;
      const CMDS = [-1, -0.75, -0.4, -0.15, 0.15, 0.4, 0.75, 1];
      const sweep = (cfg) => {
        const k = T.cfg(cfg);
        return { k, pairs: CMDS.map((c) => [c, Input.steerToTilt(c), T.hold(Input.steerToTilt(c))]) };
      };
      return {
        shipped: sweep({}),
        twitchy: sweep({ maxTilt: 18 }),
        wide: sweep({ maxTilt: 50, deadzone: 6 }),
        zeroIsZero: Input.steerToTilt(0),
        odd: [0.2, 0.6, 1].map((c) => Input.steerToTilt(c) + Input.steerToTilt(-c)),
      };
    });

    for (const name of ["shipped", "twitchy", "wide"]) {
      const s = r[name];
      for (const [cmd, deg, got] of s.pairs) {
        expect(Math.abs(deg), `${name}: |tilt| for ${cmd} is inside the range`)
          .toBeLessThanOrEqual(s.k.maxTilt + 1e-9);
        expect(got, `${name}: steer ${cmd} -> ${deg.toFixed(3)} deg -> back`).toBeCloseTo(cmd, 4);
      }
      // The dead zone is on the OUTBOUND side too: the smallest real command
      // must ask for more than the dead zone, or it would be swallowed.
      const smallest = s.pairs.find(([c]) => c > 0);
      expect(Math.abs(smallest[1])).toBeGreaterThan(s.k.deadzone);
    }
    expect(r.zeroIsZero).toBe(0);
    for (const sum of r.odd) expect(sum).toBeCloseTo(0, 10);   // odd function
  });
});

/* ------------------------------------------------------------------ *
 * 4. SLEW ASYMMETRY
 * ------------------------------------------------------------------ */

test.describe("slew limiter", () => {
  test("releasing is 1.6x faster than tightening", async ({ page }) => {
    const r = await page.evaluate(() => {
      const T = window.__tilt, DT = T.DT;
      const far = Input.maxTilt * 3;   // well past lock, so the TARGET saturates
                                       // on the first sample and what is left to
                                       // measure is the rate limiter alone
      // TIGHTENING: at rest, hand snaps to full lock.
      Input.simTiltReset(); T.settle(0, 60);
      const dTighten = Input.simTilt(far, DT) - 0;

      // RELEASING: settled at full lock, phone snaps back to neutral.
      Input.simTiltReset();
      const locked = T.settle(Input.maxTilt);
      const dRelease = locked - Input.simTilt(0, DT);

      // The same statement made behaviourally: how many 60 Hz steps each way.
      Input.simTiltReset(); T.settle(0, 60);
      let up = 1; while (Input.simTilt(far, DT) < 0.999 && up < 500) up++;
      Input.simTiltReset(); T.settle(Input.maxTilt);
      let down = 1; while (Math.abs(Input.simTilt(0, DT)) > 1e-9 && down < 500) down++;

      return { dTighten, dRelease, up, down, locked, slew: Input.tiltSlew, dt: DT };
    });

    expect(r.locked).toBeCloseTo(1, 4);
    // Tightening runs at exactly the documented fixed cap.
    expect(r.dTighten).toBeCloseTo(r.slew * r.dt, 6);
    expect(r.dRelease / r.dTighten).toBeGreaterThan(1.5);
    expect(r.dRelease / r.dTighten).toBeLessThan(1.7);
    // Ordering, which is the part a retune must not break: letting go is
    // answered faster than asking.
    expect(r.down).toBeLessThan(r.up);
    expect(r.up).toBe(Math.ceil(1 / (r.slew * r.dt)));
    // …and the release count is the rate cap plus at most a sample of filter lag.
    expect(r.down).toBeLessThanOrEqual(Math.ceil(1 / (1.6 * r.slew * r.dt)) + 1);
  });

  test("the cap is a rate, so a bigger dt covers proportionally more travel", async ({ page }) => {
    // The slew is units/SECOND, not units/call. A phone that delivers 30
    // samples a second must reach lock in the same wall-clock time as one
    // delivering 60, or tilt would feel different on different hardware.
    const r = await page.evaluate(() => {
      const far = Input.maxTilt * 3;
      const first = (dt) => { Input.simTiltReset(); Input.simTilt(0, dt); return Input.simTilt(far, dt); };
      return { fast: first(1 / 120), slow: first(1 / 30), slew: Input.tiltSlew };
    });
    expect(r.fast).toBeCloseTo(r.slew / 120, 6);
    expect(r.slow).toBeCloseTo(r.slew / 30, 6);
    expect(r.slow / r.fast).toBeCloseTo(4, 3);
  });
});

/* ------------------------------------------------------------------ *
 * 5. CALIBRATION
 * ------------------------------------------------------------------ */

test.describe("calibration", () => {
  test("a held offset pulls to one side until calibrate() makes it neutral", async ({ page }) => {
    // The "car pulls left the whole race" bug class. A landscape grip's neutral
    // is routinely 20 deg or more off flat, which without calibration is most
    // of a lock's worth of permanent steering.
    const r = await page.evaluate(() => {
      const T = window.__tilt;
      const GRIP = 20;
      Input.simTiltReset();
      const before = T.settle(GRIP);
      Input.calibrate();                       // "hold it how you hold it, then tap CALIBRATE"
      const after = T.settle(GRIP, 240);
      // The offset is a pure SHIFT of the map, not a rescale: half lock is
      // still steerToTilt(0.5) degrees away, now measured from the grip.
      const halfFromGrip = T.settle(GRIP + Input.steerToTilt(0.5), 240);
      const flatIsNowLeft = T.settle(0, 240);
      return {
        before, after, halfFromGrip, flatIsNowLeft,
        mapSays: (GRIP - Input.deadzone) / (Input.maxTilt - Input.deadzone),
      };
    });
    expect(Math.abs(r.before)).toBeGreaterThan(0.3);   // a real, race-long pull
    expect(r.before).toBeCloseTo(r.mapSays, 4);
    expect(r.after).toBe(0);                            // exactly zero, not "small"
    expect(r.halfFromGrip).toBeCloseTo(0.5, 4);
    expect(r.flatIsNowLeft).toBeCloseTo(-r.mapSays, 4);
  });

  test("calibrate() takes the RAW angle, so it is not fooled by filter lag", async ({ page }) => {
    // Calibrating from the SMOOTHED angle would bake in however much of the
    // move the One-Euro filter had not caught up with yet — i.e. tapping
    // CALIBRATE straight after settling into a grip would leave a residual.
    const r = await page.evaluate(() => {
      const T = window.__tilt, DT = T.DT;
      Input.simTiltReset();
      T.settle(0, 60);
      Input.simTilt(25, DT);        // ONE sample of a big move: the filter is
      Input.calibrate();            // still far behind the real angle here
      return { after: T.settle(25, 240), off: T.settle(25 + Input.steerToTilt(0.4), 240) };
    });
    expect(r.after).toBe(0);
    expect(r.off).toBeCloseTo(0.4, 4);
  });
});

/* ------------------------------------------------------------------ *
 * 6. SMOOTHING (the One-Euro min cutoff)
 * ------------------------------------------------------------------ */

test.describe("smoothing", () => {
  test("a lower min cutoff is visibly laggier — and changes lag, not gain", async ({ page }) => {
    // 0.4 / 1.2 / 2.2 Hz are the SMOOTHING slider's v10 / v6 / v1 (see
    // cutoffFromSmooth in js/input/steer-tuning.js). Ordering only: the absolute
    // response depends on the whole chain and moves the moment anything is
    // retuned.
    const r = await page.evaluate(() => {
      const T = window.__tilt;
      // A SMALL correction, just past the dead zone — the case smoothing is
      // for. (See the sibling test for why a big one says nothing.)
      const STEP = Input.deadzone + 1.5;
      const EARLY = 6;
      const run = (cutoff) => {
        T.cfg({ cutoff });
        Input.simTiltReset(); T.settle(0, 60);
        const traj = T.trace(STEP, 400);   // long enough for the SLOWEST cutoff
                                           // to converge, so `settled` is a fair
                                           // comparison and not a snapshot of lag
        return {
          cutoff: Input.minCutoff,
          early: traj.slice(0, EARLY).reduce((a, b) => a + b, 0),
          settled: traj[traj.length - 1],
        };
      };
      return { smooth: run(0.4), mid: run(1.2), snappy: run(2.2) };
    });

    // Laggier = less of the command delivered in the first tenth of a second.
    expect(r.snappy.early).toBeGreaterThan(r.mid.early);
    expect(r.mid.early).toBeGreaterThan(r.smooth.early);
    expect(r.snappy.early / r.smooth.early).toBeGreaterThan(1.1);
    // The knob is a filter, not an attenuator: a still hand ends up commanding
    // the same steer at every setting.
    expect(r.snappy.settled).toBeCloseTo(r.smooth.settled, 5);
    expect(r.mid.settled).toBeCloseTo(r.smooth.settled, 5);
    expect(r.smooth.settled).toBeGreaterThan(0);
  });

  test("on a full-lock snap the SLEW binds and smoothing barely shows", async ({ page }) => {
    // Worth pinning because it is counter-intuitive and it is what makes the
    // test above use a small step: the One-Euro cutoff RISES with the rate of
    // change (that is the point of it), so a violent input is passed almost
    // unfiltered and the fixed slew cap — not the SMOOTHING slider — decides
    // how fast the wheel moves. A player who turns SMOOTHING to maximum and
    // then snaps the phone to full lock feels no difference at all.
    const r = await page.evaluate(() => {
      const T = window.__tilt;
      const EARLY = 6;
      const area = (cutoff, deg) => {
        T.cfg({ cutoff });
        Input.simTiltReset(); T.settle(0, 60);
        return T.trace(deg, EARLY).reduce((a, b) => a + b, 0);
      };
      const smallSmooth = area(0.4, Input.deadzone + 1.5);
      const smallSnappy = area(2.2, Input.deadzone + 1.5);
      const bigSmooth = area(0.4, Input.maxTilt * 3);
      const bigSnappy = area(2.2, Input.maxTilt * 3);
      return {
        smallSpread: (smallSnappy - smallSmooth) / smallSmooth,
        bigSpread: Math.abs(bigSnappy - bigSmooth) / bigSmooth,
      };
    });
    expect(r.smallSpread).toBeGreaterThan(0.1);
    expect(r.bigSpread).toBeLessThan(r.smallSpread / 10);
  });
});

/* ------------------------------------------------------------------ *
 * 7. THE ANTI-DRIFT GUARD
 * ------------------------------------------------------------------ */

test.describe("live path vs harness", () => {
  test("a real deviceorientation stream settles on the command simTilt predicts", async ({ page }) => {
    // The ONE test here that uses the wall clock, because that is the
    // difference it exists to police: tiltSteering() takes its dt from
    // performance.now() and simTilt() is handed one. Everything else about
    // them — tiltTarget() and tiltSlew() — is now shared, and this fails if
    // anybody re-inlines either.
    const r = await page.evaluate(async () => {
      const T = window.__tilt;
      const DEG = 12;
      const sim = T.hold(DEG);                 // what the harness says

      Input.reset();                           // clears the slew + filter state
      Input.setSteerMode("tilt");
      // input.js steers off a GRAVITY-VECTOR roll and remaps it by
      // screen.orientation.angle, so which euler angle carries a left/right
      // tilt depends on the rotation. Same switch it uses.
      const angle = (typeof screen !== "undefined" && screen.orientation &&
                     typeof screen.orientation.angle === "number")
        ? ((screen.orientation.angle % 360) + 360) % 360 : 0;
      const euler = angle === 90 ? { beta: DEG, gamma: 0 }
        : angle === 270 ? { beta: -DEG, gamma: 0 }
          : angle === 180 ? { beta: 0, gamma: -DEG }
            : { beta: 0, gamma: DEG };

      let live = 0, stable = 0;
      const t0 = performance.now();
      await new Promise((res) => {
        const id = setInterval(() => {
          const e = new Event("deviceorientation");
          Object.assign(e, euler, { alpha: 0, absolute: false });
          window.dispatchEvent(e);
          const v = Input.steer();             // polled the way the loop polls it
          stable = Math.abs(v - live) < 1e-4 ? stable + 1 : 0;
          live = v;
          const ms = performance.now() - t0;
          if ((stable > 8 && ms > 250) || ms > 5000) { clearInterval(id); res(null); }
        }, 8);
      });
      return { sim, live, angle, gyroSeen: Input.gyroSeen, ms: performance.now() - t0 };
    });

    expect(r.gyroSeen).toBe(true);
    expect(Math.abs(r.sim)).toBeGreaterThan(0.1);        // the probe angle is a real command
    expect(Math.abs(r.live - r.sim)).toBeLessThan(0.02);
  });
});
