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
//   • a RELATIONAL policy that consumes ONLY world({detail:"drive"}) fields —
//     headingErrDeg to follow the road, nextCorner.moveToApexM for the racing
//     line, nextCorner.status to know when to brake.
//
// If the relational fields carry actionable signal, the second policy travels
// materially farther. This is the regression guard the redesign hangs on: if a
// refactor breaks the meaning of a field, the bench collapses even though every
// shape assertion still passes.
import { test, expect } from "./fixtures.js";

const LANDSCAPE = { width: 844, height: 390 };

async function boot(page, trackId) {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex != null, { timeout: 8000 });
  await page.evaluate((id) => window.__apex.race(id), trackId);
  await page.waitForFunction(() => window.__apex.info().track != null, { timeout: 15_000 });
}

// Run one episode headlessly with the named policy and return the forward
// distance covered before terminal (or the step cap). Everything runs inside the
// page so physics steps at full speed with no round-trip per tick.
async function episode(page, policy) {
  return page.evaluate((pol) => {
    const A = window.__apex;
    const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
    A.headless(true);
    A.reset(0.02, 55, 0);
    const total = A.world().track.lengthM;
    let dist = 0, steps = 0, prevS = A.world().ego.s;
    for (let i = 0; i < 500; i++) {
      let input;
      if (pol === "naive") {
        input = { steer: 0, throttle: true, brake: false };
      } else {
        const w = A.world({ detail: "drive" });
        const he = w.ego.headingErrDeg || 0;
        const nc = w.nextCorner;
        const toLine = nc ? (nc.moveToApexM || 0) : 0;
        // Correct heading back to the tangent, and bias toward the fast line.
        // + steer = right; + headingErrDeg = nose points right, so subtract it.
        const steer = clamp(-he / 12 + toLine / 12, -1, 1);
        const braking = !!(nc && /^BRAKE NOW/.test(nc.status));
        input = { steer, throttle: !braking, brake: braking };
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
      // The blind car leaves the road at the first corner; the one reading the
      // corner table and heading error stays on it far longer. A comfortable
      // margin so ordinary physics tuning noise never trips it.
      expect(relational.dist).toBeGreaterThan(naive.dist * 1.5);
      expect(relational.dist).toBeGreaterThan(300);
    });
  }
});

test.describe("agent drive bench — the ideal line is coherent", () => {
  test.use({ viewport: LANDSCAPE });

  test("apexOffsetM points to the inside of the corner", async ({ page }) => {
    await boot(page, "monza");
    const corners = await page.evaluate(() =>
      window.__apex.trackInfo({ what: "corners" }).corners);
    const turns = corners.filter((c) => c.dir === "L" || c.dir === "R");
    expect(turns.length).toBeGreaterThan(4);
    for (const c of turns) {
      // Right corners apex to the right (+), left corners to the left (−).
      if (c.dir === "R") expect(c.apexOffsetM).toBeGreaterThan(0);
      else expect(c.apexOffsetM).toBeLessThan(0);
      // and never asks the car past its own half of the road
      expect(Math.abs(c.apexOffsetM)).toBeLessThanOrEqual(c.widthM / 2);
    }
  });

  test("moveToApexM is the signed gap from the car to the fast line", async ({ page }) => {
    await boot(page, "monza");
    const r = await page.evaluate(() => {
      window.__apex.go();
      window.__apex.jump(0.05, 60, 3);            // sit 3 m right of centre
      const w = window.__apex.world({ detail: "drive" });
      return { nc: w.nextCorner, x: w.ego.lateralM };
    });
    expect(r.nc).toBeTruthy();
    // moveToApexM = apexOffsetM − lateralM, to within rounding
    expect(r.nc.moveToApexM).toBeCloseTo(r.nc.apexOffsetM - r.x, 0);
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
      expect(c).toHaveProperty("apexOffsetM");
    }
  });
});
