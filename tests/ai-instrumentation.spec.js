// @ts-check
// AI INSTRUMENTATION — the observability surface added so AI quality is
// measurable at all:
//   1. per-car lap timing on cars() / carAt()  (no AI lap time existed before)
//   2. carAt(i).ai — the AI decision block, previously frame-locals destroyed
//      each tick, which made "braking too early" / "queued behind a phantom
//      blocker" / "rubber-banding" / "stuck in recovery" indistinguishable
//   3. __apex.difficulty() — the first programmatic path to DIFF
//
// This is PURE OBSERVABILITY: it must not move a single AI decision. The
// behaviour guard lives in world-physics / collision-ai-fixes / agent-determinism;
// what this file pins is that the numbers are present, plausible, and coherent
// with each other.
import { test, expect } from "@playwright/test";

const LANDSCAPE = { width: 844, height: 390 };

async function raceing(page, trackId = "monza") {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex != null, { timeout: 8000 });
  await page.evaluate((id) => window.__apex.race(id), trackId);
  await page.waitForFunction(() => window.__apex.info().track != null, { timeout: 10_000 });
  await page.evaluate(() => {
    window.__apex.headless(true);
    window.__apex.go();
    window.__apex.jump(0.1, 40, 0);
    // Hand the clock to step(): freeze() stops the rAF-driven fixed-step loop,
    // but step() calls update() directly — so every tick in this file is one we
    // asked for, and the world cannot move between two page.evaluate calls.
    window.__apex.freeze(true);
  });
}

// The first non-player car in cars[].
async function aiIndex(page) {
  return page.evaluate(() => window.__apex.cars().findIndex((c) => !c.p));
}

// ── 1. per-car lap timing ───────────────────────────────────────────────────

test.describe("per-car lap timing", () => {
  test.use({ viewport: LANDSCAPE });

  test("cars() carries best/last for every car, null before a lap is set", async ({ page }) => {
    await raceing(page);
    const list = await page.evaluate(() => window.__apex.cars());
    expect(list.length).toBeGreaterThan(1);
    for (const c of list) {
      expect(c).toHaveProperty("best");
      expect(c).toHaveProperty("last");
      // c.best starts at Infinity and c.lastLap undefined — both must surface as
      // null, not as a JSON-eaten Infinity or a missing key.
      expect(c.best).toBeNull();
      expect(c.last).toBeNull();
      expect(typeof c.lap).toBe("number");
    }
  });

  test("an AI car reports a lap time after crossing the line", async ({ page }) => {
    await raceing(page);
    const idx = await aiIndex(page);
    expect(idx).toBeGreaterThan(-1);

    // Put the AI car just before the line and pump physics until it crosses —
    // cheaper and far more deterministic than driving a whole 80 s lap. TWICE:
    // cars start on lap 0, and game.js only records a time once c.lap > 1 (the
    // first crossing merely starts the car's first timed lap).
    const out = await page.evaluate((i) => {
      const cross = () => {
        window.__apex.aiPlace(i, 0.99, 70, 0);
        const at = window.__apex.carAt(i).lap;
        for (let n = 0; n < 600 && window.__apex.carAt(i).lap === at; n++)
          window.__apex.step(1 / 60, 1);
        return window.__apex.carAt(i).lap;
      };
      const first = cross();
      const second = cross();
      return { car: window.__apex.carAt(i), row: window.__apex.cars().find((c) => c.id === i),
               first, second };
    }, idx);

    expect(out.first).toBe(1);
    expect(out.second).toBe(2);
    expect(out.car.lap).toBe(2);
    expect(typeof out.car.lastLap).toBe("number");
    expect(out.car.lastLap).toBeGreaterThan(0);
    expect(typeof out.car.best).toBe("number");
    // best is the fastest of the laps set so far, so it can never exceed lastLap.
    expect(out.car.best).toBeLessThanOrEqual(out.car.lastLap);
    // cars() and carAt() must agree — same underlying c.lastLap / c.best.
    expect(out.row.last).toBeCloseTo(out.car.lastLap, 3);
    expect(out.row.best).toBeCloseTo(out.car.best, 3);
  });

  test("carAt() reports the player's timing the same way lapHistory() does", async ({ page }) => {
    await raceing(page);
    const both = await page.evaluate(() => ({
      car: window.__apex.carAt(), hist: window.__apex.lapHistory(),
    }));
    expect(both.car.best).toEqual(both.hist.best);
    expect(both.car.lastLap).toEqual(both.hist.lastLap);
    expect(typeof both.car.lapTime).toBe("number");
  });
});

// ── 2. the AI decision block ────────────────────────────────────────────────

test.describe("carAt(i).ai — the AI decision block", () => {
  test.use({ viewport: LANDSCAPE });

  test("is null for the player and populated for an AI car", async ({ page }) => {
    await raceing(page);
    await page.evaluate(() => window.__apex.step(1 / 60, 30));
    const idx = await aiIndex(page);
    const { player, ai } = await page.evaluate((i) => ({
      player: window.__apex.carAt(), ai: window.__apex.carAt(i),
    }), idx);
    // A human car must not pay for this — it never writes the record at all.
    expect(player.ai).toBeNull();
    expect(ai.ai).not.toBeNull();
  });

  test("reports every decision field with a plausible value", async ({ page }) => {
    await raceing(page);
    const idx = await aiIndex(page);
    // Put the car in clean air at racing speed: on the grid the blocker cap
    // (vmax = blocker.speed + …) legitimately pins vmax near zero, which would
    // make "plausible" mean nothing.
    const c = await page.evaluate((i) => {
      window.__apex.aiPlace(i, 0.5, 60, 0);
      window.__apex.step(1 / 60, 30);
      return window.__apex.carAt(i);
    }, idx);
    const a = c.ai;

    // Speed target: a real m/s figure, in the F1 ballpark, never below the
    // corner target it is braking down to by construction of the model.
    expect(a.vmax).toBeGreaterThan(20);
    expect(a.vmax).toBeLessThan(200);
    expect(a.vCorner).toBeGreaterThan(0);
    expect(a.kMax).toBeGreaterThanOrEqual(0);
    expect(typeof a.braking).toBe("boolean");

    // Rubber band: a fraction, never negative (the band only ever boosts), and
    // capped by the difficulty preset's `band`.
    const band = (await page.evaluate(() => window.__apex.difficulty())).band;
    expect(a.bandFactor).toBeGreaterThanOrEqual(0);
    expect(a.bandFactor).toBeLessThanOrEqual(band + 1e-6);

    // Traffic: an index or -1, never a car object (carAt() is JSON-cloned).
    expect(Number.isInteger(a.blocker)).toBe(true);
    expect(a.blocker).toBeGreaterThanOrEqual(-1);
    if (a.blocker === -1) {
      expect(a.blockerCode).toBeNull();
      expect(a.blockerGap).toBeNull();
    } else {
      expect(typeof a.blockerCode).toBe("string");
      expect(a.blockerGap).toBeGreaterThan(0);
    }
    expect(a.roomL).toBeGreaterThanOrEqual(0);
    expect(a.roomR).toBeGreaterThanOrEqual(0);
    expect(typeof a.boxed).toBe("boolean");
    expect(typeof a.unstuckActive).toBe("boolean");

    // The line. desiredX is the clamped sum of targetX + overtake + separation
    // + unstuck, so it lands inside the road, not somewhere in the scenery.
    // (Asserted against a generous bound rather than the player's hw — the two
    // cars are at different points on the lap and so on different widths.)
    expect(Number.isFinite(a.desiredX)).toBe(true);
    expect(Math.abs(a.desiredX)).toBeLessThan(30);
    expect(Math.abs(a.targetX)).toBeLessThan(30);
    expect(typeof a.overtake).toBe("number");

    // stuckT is the already-persisted timer, now merely exposed. This car is at
    // racing speed in clean air, so recovery must not be armed.
    expect(c.stuckT).toBe(0);
    expect(a.unstuckActive).toBe(false);
  });

  test("blocker resolves to a real car that is actually ahead", async ({ page }) => {
    await raceing(page);
    const idx = await aiIndex(page);
    // Park a slower car right in front of the AI car in the same lane.
    const seen = await page.evaluate((i) => {
      const other = window.__apex.cars().find((c) => !c.p && c.id !== i);
      if (!other) return null;
      const total = window.__apex.info().total;
      window.__apex.aiPlace(i, 0.30, 55, 0);
      window.__apex.aiPlace(other.id, 0.30 + 8 / total, 30, 0);   // 8 m ahead, same lane
      window.__apex.step(1 / 60, 1);
      return { ai: window.__apex.carAt(i).ai, otherId: other.id,
               otherCode: window.__apex.carAt(other.id).code };
    }, idx);
    expect(seen).not.toBeNull();
    expect(seen.ai.blocker).toBe(seen.otherId);
    expect(seen.ai.blockerCode).toBe(seen.otherCode);
    expect(seen.ai.blockerGap).toBeGreaterThan(0);
    expect(seen.ai.blockerGap).toBeLessThan(20);
  });

  test("stays fresh tick to tick, and keeps one stable shape", async ({ page }) => {
    await raceing(page);
    const idx = await aiIndex(page);
    const r = await page.evaluate((i) => {
      window.__apex.aiPlace(i, 0.20, 50, 0);
      window.__apex.step(1 / 60, 5);
      const before = window.__apex.carAt(i).ai;
      window.__apex.step(1 / 60, 90);
      const after = window.__apex.carAt(i).ai;
      return { before, after };
    }, idx);
    // The record is written once per AI car per tick onto a reused object, so
    // the shape never varies even as every value moves.
    expect(Object.keys(r.after).sort()).toEqual(Object.keys(r.before).sort());
    expect(Number.isFinite(r.after.vmax)).toBe(true);
    // 1.5 s of driving on a real circuit must move the target line — a frozen
    // value would mean the record went stale (written once, never refreshed).
    expect(r.after.desiredX).not.toBe(r.before.desiredX);
  });
});

// ── 3. difficulty() ─────────────────────────────────────────────────────────

test.describe("__apex.difficulty()", () => {
  test.use({ viewport: LANDSCAPE });

  test("reads the current level plus its resolved preset", async ({ page }) => {
    await raceing(page);
    const d = await page.evaluate(() => window.__apex.difficulty());
    expect(d.levels).toEqual(["easy", "normal", "hard"]);
    expect(d.levels).toContain(d.level);
    expect(typeof d.ai).toBe("number");
    expect(typeof d.band).toBe("number");
  });

  test("round-trips, and hard's ai multiplier exceeds easy's", async ({ page }) => {
    await raceing(page);
    const r = await page.evaluate(() => {
      const easy = window.__apex.difficulty("easy");
      const readBackEasy = window.__apex.difficulty();
      const hard = window.__apex.difficulty("hard");
      const readBackHard = window.__apex.difficulty();
      return { easy, readBackEasy, hard, readBackHard };
    });
    expect(r.easy.level).toBe("easy");
    expect(r.readBackEasy.level).toBe("easy");
    expect(r.hard.level).toBe("hard");
    expect(r.readBackHard.level).toBe("hard");
    expect(r.hard.ai).toBeGreaterThan(r.easy.ai);
    // ...and a harder AI rubber-bands LESS, which is the other half of the preset.
    expect(r.hard.band).toBeLessThan(r.easy.band);
  });

  test("an unknown level is ignored, never stored", async ({ page }) => {
    await raceing(page);
    const r = await page.evaluate(() => {
      window.__apex.difficulty("normal");
      const bad = window.__apex.difficulty("insane");
      return { bad, after: window.__apex.difficulty() };
    });
    // DIFF[difficulty] is read every tick in updateCar — an unknown value would
    // leave it undefined and throw on the next frame.
    expect(r.bad.level).toBe("normal");
    expect(r.after.level).toBe("normal");
  });

  test("the level actually reaches the AI speed target", async ({ page }) => {
    await raceing(page);
    const idx = await aiIndex(page);
    const r = await page.evaluate((i) => {
      const read = (lvl) => {
        window.__apex.difficulty(lvl);
        window.__apex.aiPlace(i, 0.60, 60, 0);   // same place, same speed, clean air
        window.__apex.step(1 / 60, 2);
        return window.__apex.carAt(i).ai;
      };
      return { easy: read("easy"), hard: read("hard") };
    }, idx);
    // vmax = VMAX * PACE * tierV * skill * DIFF.ai — same car, same place, same
    // speed, so the only moving part is the difficulty multiplier. This is the
    // end-to-end proof that difficulty() reaches the driving model and that
    // carAt().ai.vmax reports what the model actually used.
    expect(r.easy.blocker).toBe(-1);   // clean air both times, or the cap confounds it
    expect(r.hard.blocker).toBe(-1);
    expect(r.hard.vmax).toBeGreaterThan(r.easy.vmax);
  });
});
