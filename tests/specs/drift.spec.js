// @ts-check
// Dynamic single-track ("bicycle") tyre model: per-axle slip-angle forces capped
// by a friction limit. Uses setPhysics()/physState() to drive the model
// deterministically and assert the qualitative contract for a "balanced simcade"
// car:
//   - the default car is STABLE at the limit: full lock washes wide (understeer),
//     it never spins or NaNs
//   - SLIDE loosens the rear: more slip than planted (heading can be less —
//     a snappy planted car out-rotates a 0.7 tail-out that is already scrubbing)
//   - releasing the steering lets the slide self-align back toward straight
//   - cornering is GRIP-LIMITED: yaw rate doesn't run away with speed (the old
//     kinematic model's signature failure)
//   - SPEED STEER keeps more steering at high speed (at part-lock, below the grip
//     limit, where the lock taper is what's felt)
import { test, expect } from "../helpers/fixtures.js";

// PACE PINNED — same reason as tests/specs/offtrack.spec.js: these assertions are in
// m/s and degrees of slip, and the OVERALL SPEED default moved to 0.84 with the
// Phase C regrid. A spec that inherits it silently changes what it measures.
const pinPace = (page) => page.evaluate(() => window.__apex.setPhysics({ pace: 1 }));


// Hold a fixed steer from the main straight at a given SLIDE (drift); report how
// far the heading swings (turn-in), the peak slip angle, and the steady heading
// yaw rate (deg/s) averaged over the last few frames.
const corner = (page, drift, steer = 1, speed = 40, frames = 48) =>
  page.evaluate(({ d, steer, speed, frames }) => {
    window.__apex.setPhysics({ drift: d });
    window.__apex.jump(0.0, speed, 0);
    window.__apex.setInput({ steer, throttle: false });
    const a0 = window.__apex.probe().angle;
    let peakSlip = 0, prev = window.__apex.physState().head, yawSum = 0, yawN = 0;
    for (let i = 0; i < frames; i++) {
      window.__apex.step(1 / 60, 1);
      const ps = window.__apex.physState();
      peakSlip = Math.max(peakSlip, Math.abs(ps.slipDeg));
      let dh = ps.head - prev; prev = ps.head;
      while (dh > Math.PI) dh -= 2 * Math.PI;
      while (dh < -Math.PI) dh += 2 * Math.PI;
      if (i >= frames - 12) { yawSum += Math.abs(dh) * 60 * 180 / Math.PI; yawN++; }
    }
    const a1 = window.__apex.probe().angle;
    const x = window.__apex.probe().x;
    window.__apex.clearInput();
    return { turn: Math.abs(a1 - a0), peakSlip, steadyYaw: yawSum / yawN, x, finite: Number.isFinite(x) };
  }, { d: drift, steer, speed, frames });

test.describe("Apex 26 — dynamic bicycle model", () => {
  test("default car is stable at the limit: full lock washes wide, never spins", async ({ page, loadTrack }) => {
    await loadTrack();
    await pinPace(page);
    const r = await corner(page, 0.15, 1, 50, 90);   // shipped-ish SLIDE, full lock, 1.5 s
    expect(r.finite).toBe(true);
    expect(r.peakSlip).toBeLessThan(45);             // understeer wash, not a spin
    expect(Math.abs(r.x)).toBeLessThan(60);          // stayed in the track neighbourhood
  });

  test("SLIDE loosens the rear: more slip than planted", async ({ page, loadTrack }) => {
    await loadTrack();
    await pinPace(page);
    const planted = await corner(page, 0.0, 1, 40, 48);
    const loose = await corner(page, 0.7, 1, 40, 48);
    expect(loose.finite && planted.finite).toBe(true);
    expect(loose.peakSlip).toBeGreaterThan(planted.peakSlip + 2);  // a real, bigger slide
  });

  test("slide self-aligns: release the steering and the slip decays", async ({ page, loadTrack }) => {
    await loadTrack();
    await pinPace(page);
    const tail = await page.evaluate(() => {
      window.__apex.setPhysics({ drift: 0.7 });
      window.__apex.jump(0.0, 40, 0);
      window.__apex.setInput({ steer: 1, throttle: false });
      for (let i = 0; i < 24; i++) window.__apex.step(1 / 60, 1);   // throw it into a slide
      window.__apex.setInput({ steer: 0, throttle: false });
      for (let i = 0; i < 72; i++) window.__apex.step(1 / 60, 1);   // release, let it settle (1.2 s)
      const s = window.__apex.physState();
      window.__apex.clearInput();
      window.__apex.setPhysics({ drift: 0.15 });
      return Math.abs(s.vLat);
    });
    expect(tail).toBeLessThan(1.5);    // slip bled away — the car straightens itself
  });

  test("cornering is grip-limited: yaw rate doesn't run away with speed", async ({ page, loadTrack }) => {
    await loadTrack();
    await pinPace(page);
    // Kinematic models spin faster the faster you go (yaw ∝ speed). A grip-limited
    // tyre model caps the path: steady heading yaw at full lock should be roughly
    // flat — certainly not growing with speed.
    // 36 frames, not 60: at full lock the fast run reaches the right barrier
    // at ~frame 39 (measured per-frame via __apex.probe: x crosses the road
    // edge near frame 30 and pins at 16.9 by 39), so the old last-12 yaw
    // window measured WALL rotation, not cornering. It passed only while the
    // inverted noseIn gate silently skipped the straighten-to-tangent; with
    // that gate fixed, the wall-align (correct, documented) dominated the
    // window. At 36 frames the window (24-36) ends before any wall contact
    // for both speeds; the slow run never walls (x 8.2 max at frame 60).
    const slow = await corner(page, 0.0, 1, 25, 36);
    const fast = await corner(page, 0.0, 1, 65, 36);
    expect(fast.finite && slow.finite).toBe(true);
    expect(fast.steadyYaw).toBeLessThan(slow.steadyYaw * 1.3);
  });

  test("high drift + aggressive steering never NaNs or flies off", async ({ page, loadTrack }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));
    await loadTrack();
    await pinPace(page);
    const r = await page.evaluate(() => {
      window.__apex.setPhysics({ drift: 0.7 });
      window.__apex.jump(0.0, 70, 0);
      let maxAbsX = 0, finite = true;
      for (let i = 0; i < 400; i++) {
        window.__apex.setInput({ steer: Math.sin(i / 7), throttle: true });
        window.__apex.step(1 / 60, 1);
        const p = window.__apex.probe();
        if (!Number.isFinite(p.x) || !Number.isFinite(p.s)) finite = false;
        maxAbsX = Math.max(maxAbsX, Math.abs(p.x));
      }
      window.__apex.clearInput();
      window.__apex.setPhysics({ drift: 0.15 });   // restore default
      return { finite, maxAbsX };
    });
    expect(errors).toEqual([]);
    expect(r.finite).toBe(true);
    expect(r.maxAbsX).toBeLessThan(60);   // stayed in the track's neighbourhood
  });

  test("SPEED STEER: higher keeps more turn-in at high speed", async ({ page, loadTrack }) => {
    await loadTrack();
    await pinPace(page);
    // At part-lock (below the grip limit) the lock taper is what's felt: a higher
    // reference keeps more steer angle — and so more turn-in — at speed.
    const turnAtRef = (ref) => page.evaluate((r) => {
      window.__apex.setPhysics({ drift: 0, speedRef: r });
      window.__apex.jump(0.0, 58, 0);
      window.__apex.setInput({ steer: 0.5, throttle: false });
      const a0 = window.__apex.probe().angle;
      for (let i = 0; i < 16; i++) window.__apex.step(1 / 60, 1);
      const a1 = window.__apex.probe().angle;
      window.__apex.clearInput();
      return Math.abs(a1 - a0);
    }, ref);
    const calm = await turnAtRef(50);
    const sharp = await turnAtRef(120);
    expect(sharp).toBeGreaterThan(calm * 1.1);
  });
});
