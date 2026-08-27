// @ts-check
// Task-success benchmark for the agent world view (js/game/agentview.js).
//
// The research on machine-oriented observation is unanimous on one point: the
// only eval that matters is whether an agent DRIVES BETTER with the observation
// than without it. Byte counts and "looks like the track" prove nothing. So this
// spec holds the policy fixed and measures metres-of-progress-before-terminal:
//
//   • a NAIVE baseline (full throttle, no steering) — sees nothing, drives off
//     at the first corner;
//   • a RELATIONAL policy that consumes ONLY honest world({detail:"drive"})
//     geometry — headingErrDeg to follow the road, lateralM to stay centred,
//     nextCorner.status to know when to brake. No prescribed racing line.
//
// If the relational fields carry actionable signal, the second policy travels
// materially farther. This is the regression guard the redesign hangs on: if a
// refactor breaks the meaning of a field, the bench collapses even though every
// shape assertion still passes.
import { test, expect } from "../helpers/fixtures.js";

const LANDSCAPE = { width: 844, height: 390 };

async function boot(page, trackId) {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: 8000 });
  await page.evaluate((id) => window.__apex.race(id), trackId);
  await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: 15_000 });
}

// Run one episode headlessly with the named policy and return the forward
// distance covered before terminal (or the step cap). Everything runs inside the
// page so physics steps at full speed with no round-trip per tick.
async function episode(page, policy) {
  return page.evaluate((pol) => {
    const A = window.__apex;
    const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
    A.headless(true);
    // Fixed seed: the two policies must face the SAME grid and the same AI
    // overtake decisions, or the comparison measures the deal as much as the
    // driving. Before seeding existed this bench compared runs that were never
    // comparable — see tests/specs/agent-determinism.spec.js.
    //
    // Start at frac 0.4, NOT near the grid. reset() repositions only the
    // PLAYER; the AI pack launches from the grid boxes at s≈0, so a start of
    // frac 0.02 put the episode 86 m (Interlagos) / 116 m (Monza) ahead of 21
    // launching cars and both policies spent the 50 s episode in traffic — the
    // bench measured the deal as much as the driving, and a change to the
    // grid's seeded draw pattern re-dealt it. frac 0.4 is near-straight road
    // on both circuits (|k| < 0.0022 over the next 150 m) with ~1.7-2.3 km of
    // clear track behind the player: the leaders close at well under that over
    // 500 steps, so traffic never reaches either policy and the comparison is
    // purely observation-driven driving.
    A.reset(0.4, 55, 0, 1234);
    const total = A.world().track.lengthM;
    let dist = 0, steps = 0, prevS = A.world().ego.s;
    for (let i = 0; i < 500; i++) {
      let input;
      if (pol === "naive") {
        input = { steer: 0, throttle: true, brake: false };
      } else {
        const w = A.world({ detail: "drive", horizonS: 3, points: 6 });
        const he = w.ego.headingErrDeg || 0;
        const nc = w.nextCorner;
        const lat = w.ego.lateralM || 0;
        const sp = w.ego.speed || 0;
        // Honest geometry only — no prescribed line. Follow the road, using
        // what world() publishes about it. Pure feedback (-he/12 - lat/14 and
        // a flat speed cap) was the previous policy and it could not track
        // road curvature at speed: traced on Monza, the car cruised at 55 m/s
        // for 25 steps then drifted 13.9 m off the gentle curve with steer at
        // 0.04 — feedback only reacts AFTER the error exists, and at 198 kph
        // the lag is a road departure (rescued at step 77, dist 251). The old
        // 33 m/s cap was masking exactly this.
        //
        // So steer with FEEDFORWARD from the road's own curvature ~0.6 s
        // ahead (ahead.pts radiusM/dir — the published road, not a line):
        // required lateral accel is v^2/R, scaled onto the steer range.
        // + steer = right; dir "L" bends left, so its sign is negative.
        const pts = (w.ahead && w.ahead.pts) || [];
        const look = pts.find((p) => p.t >= 0.6) || pts[0];
        const R = (look && look.radiusM) || 1e9;
        const dirS = look ? (look.dir === "L" ? -1 : look.dir === "R" ? 1 : 0) : 0;
        const ff = dirS * clamp(sp * sp / (R * 30), -0.9, 0.9);
        const steer = clamp(ff - he / 12 - lat / 14, -1, 1);
        // Speed from the same geometry: hold v^2/R under ~11 m/s^2 across the
        // lookahead window, and respect the corner fields' apex target. All
        // still facts about the road, none of it a prescribed line.
        // Measured (seed 1234): monza 1543 m, interlagos 1119 m, both to the
        // step cap with no rescue — against floors of 327 and 300.
        let vCurve = 70;
        for (const p of pts) { const v = Math.sqrt(11 * Math.max(15, p.radiusM || 1e9)); if (v < vCurve) vCurve = v; }
        const tgt = Math.min(vCurve, nc ? nc.apexSpeedKph / 3.6 * 0.72 : 70);
        const braking = /^BRAKE NOW/.test((nc && nc.status) || "") || sp > tgt + 2;
        input = { steer, throttle: !braking, brake: braking && sp > 3 };
      }
      A.act(input, 1 / 60, 6);
      steps++;
      const s = A.world().ego.s;
      let ds = s - prevS;
      if (ds < -total / 2) ds += total;          // lap wrap
      if (ds < 0 || ds > total / 2) ds = 0;       // spin / teleport — don't count
      dist += ds;
      prevS = s;
      const t = A.terminal();
      if (t && t.done) break;
    }
    A.headless(false);
    return { dist: Math.round(dist), steps };
  }, policy);
}

test.describe("agent drive bench — the fields are actionable", () => {
  test.use({ viewport: LANDSCAPE });

  for (const track of ["monza", "interlagos"]) {
    test(`relational policy out-drives the blind baseline on ${track}`, async ({ page }) => {
      await boot(page, track);
      const naive = await episode(page, "naive");
      const relational = await episode(page, "relational");
      // The blind car leaves the road at the first corner ahead of the start
      // (~165 m on at Monza, ~215 m on at Interlagos); the one reading the
      // corner table and heading error stays on it far longer. A comfortable
      // margin so ordinary physics tuning noise never trips it.
      expect(relational.dist).toBeGreaterThan(naive.dist * 1.5);
      expect(relational.dist).toBeGreaterThan(300);
    });
  }
});

test.describe("agent drive bench — the geometry is honest, not a prescribed line", () => {
  test.use({ viewport: LANDSCAPE });

  test("no racing line is prescribed — apexOffsetM/moveToApexM are gone", async ({ page }) => {
    await boot(page, "monza");
    const r = await page.evaluate(() => {
      const corners = window.__apex.trackInfo({ what: "corners" }).corners;
      window.__apex.go();
      window.__apex.jump(0.05, 60, 0);
      const w = window.__apex.world({ detail: "drive" });
      return { corner: corners[0], nc: w.nextCorner };
    });
    // The confidently-wrong "apex = inside edge" hint must not be back.
    expect(r.corner).not.toHaveProperty("apexOffsetM");
    expect(r.nc).not.toHaveProperty("apexOffsetM");
    expect(r.nc).not.toHaveProperty("moveToApexM");
  });

  test("corners carry honest road facts: straightAfterM and exitsOntoStraight", async ({ page }) => {
    await boot(page, "monza");
    const corners = await page.evaluate(() =>
      window.__apex.trackInfo({ what: "corners" }).corners);
    let flaggedStraight = 0;
    for (const c of corners) {
      expect(typeof c.straightAfterM).toBe("number");
      expect(c.straightAfterM).toBeGreaterThanOrEqual(0);
      expect(typeof c.exitsOntoStraight).toBe("boolean");
      // the flag must agree with the metric it is derived from
      expect(c.exitsOntoStraight).toBe(c.straightAfterM >= 120);
      if (c.exitsOntoStraight) flaggedStraight++;
    }
    // Monza is straights-and-chicanes — several corners must open onto a straight
    expect(flaggedStraight).toBeGreaterThan(2);
  });

  test("nextCorners previews the sequence, ordered by distance", async ({ page }) => {
    await boot(page, "monza");
    const seq = await page.evaluate(() => {
      window.__apex.go();
      window.__apex.jump(0.02, 60, 0);
      return window.__apex.world({ detail: "drive" }).nextCorners;
    });
    expect(Array.isArray(seq)).toBe(true);
    expect(seq.length).toBeGreaterThan(1);
    for (let i = 1; i < seq.length; i++) {
      expect(seq[i].distM).toBeGreaterThanOrEqual(seq[i - 1].distM);
    }
    for (const c of seq) {
      expect(c).toHaveProperty("turn");
      expect(c).toHaveProperty("apexSpeedKph");
      expect(c).toHaveProperty("exitsOntoStraight");
      expect(c).not.toHaveProperty("apexOffsetM");
    }
  });
});
