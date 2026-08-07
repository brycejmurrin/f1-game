// @ts-check
// Edge-case tests for the headless control loop API:
// __apex.act(), __apex.reset(), __apex.obs().
// These test boundary conditions, wrap-around, and numeric stability.
import { test, expect } from "@playwright/test";

const LANDSCAPE = { width: 844, height: 390 };

async function loadRace(page, trackId = "monza") {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex != null, { timeout: 8000 });
  await page.evaluate((id) => window.__apex.race(id), trackId);
  await page.waitForFunction(() => window.__apex.info().track != null, { timeout: 10_000 });
  await page.evaluate(() => window.__apex.jump(0.1, 40, 0));
  await page.waitForTimeout(100);
}

// ── act() edge cases ──────────────────────────────────────────────────────────

test.describe("act() with n=0", () => {
  test.use({ viewport: LANDSCAPE });

  test("act(input, dt, 0) returns current obs without advancing s", async ({ page }) => {
    await loadRace(page);
    const result = await page.evaluate(() => {
      window.__apex.reset(0.2, 40, 0);
      const before = window.__apex.obs();
      const fromAct = window.__apex.act({ steer: 0, throttle: true }, 1 / 60, 0);
      return { beforeS: before.s, actS: fromAct.s };
    });
    // n=0 means zero physics steps — arc position unchanged
    expect(result.actS).toBeCloseTo(result.beforeS, 1);
  });

  test("act(null, dt, 0) with n=0 also does not advance physics", async ({ page }) => {
    await loadRace(page);
    const result = await page.evaluate(() => {
      window.__apex.reset(0.2, 40, 0);
      const before = window.__apex.obs();
      const fromAct = window.__apex.act(null, 1 / 60, 0);
      return { beforeS: before.s, actS: fromAct.s };
    });
    expect(result.actS).toBeCloseTo(result.beforeS, 1);
  });

  test("act with n=1 advances further than n=0", async ({ page }) => {
    await loadRace(page);
    const [s0, s1] = await page.evaluate(() => {
      window.__apex.reset(0.2, 40, 0);
      const a = window.__apex.act({ steer: 0, throttle: true }, 1 / 60, 0);
      window.__apex.reset(0.2, 40, 0);
      const b = window.__apex.act({ steer: 0, throttle: true }, 1 / 60, 1);
      return [a.s, b.s];
    });
    expect(s1).toBeGreaterThan(s0);
  });
});

// ── reset() near the lap seam ─────────────────────────────────────────────────

test.describe("reset() near lap seam (frac ≈ 1.0)", () => {
  test.use({ viewport: LANDSCAPE });

  test("reset(0.999) places player near end of lap without incrementing lap", async ({ page }) => {
    await loadRace(page);
    const result = await page.evaluate(() => {
      const info = window.__apex.info();
      const obs = window.__apex.reset(0.999, 0, 0);
      return { s: obs.s, expectedS: 0.999 * info.total, total: info.total, lap: obs.lap };
    });
    expect(result.s).toBeGreaterThan(result.expectedS - 50);
    expect(result.s).toBeLessThan(result.expectedS + 50);
    expect(result.lap).toBe(0);
  });

  test("driving past finish line from frac=0.999 increments lap counter", async ({ page }) => {
    await loadRace(page);
    const result = await page.evaluate(() => {
      window.__apex.headless(true);
      window.__apex.reset(0.999, 40, 0);   // near finish, at racing speed
      let obs;
      for (let i = 0; i < 120; i++) {      // 2 s max
        obs = window.__apex.act({ steer: 0, throttle: true, brake: false }, 1 / 60, 1);
        if (obs.lap > 0) break;
      }
      window.__apex.headless(false);
      return { lap: obs.lap, done: obs.done };
    });
    expect(result.lap).toBeGreaterThan(0);
  });

  test("scan returns finite values immediately after reset near seam", async ({ page }) => {
    await loadRace(page);
    const result = await page.evaluate(() => {
      const obs = window.__apex.reset(0.999, 30, 0);
      return obs.scan;
    });
    expect(Array.isArray(result)).toBe(true);
    for (const pt of result) {
      expect(isFinite(pt.k)).toBe(true);
      expect(isFinite(pt.hw)).toBe(true);
      expect(isFinite(pt.wallR)).toBe(true);
      expect(isFinite(pt.wallL)).toBe(true);
      expect(pt.width).toBeGreaterThan(0);
    }
  });
});

// ── scan() at track wrap-around ───────────────────────────────────────────────

test.describe("obs().scan stability at track wrap-around", () => {
  test.use({ viewport: LANDSCAPE });

  test("scan returns no NaN at 5 positions near s = track.total", async ({ page }) => {
    await loadRace(page);
    const hasNaN = await page.evaluate(() => {
      const fracs = [0.988, 0.991, 0.995, 0.998, 0.9995];
      for (const frac of fracs) {
        window.__apex.reset(frac, 30, 0);
        const obs = window.__apex.obs();
        if (!obs) return true;
        for (const pt of obs.scan || []) {
          if (!isFinite(pt.k) || !isFinite(pt.hw) ||
              !isFinite(pt.wallR) || !isFinite(pt.wallL) || !isFinite(pt.width)) {
            return true;
          }
        }
      }
      return false;
    });
    expect(hasNaN).toBe(false);
  });

  test("scan distances wrap correctly — each point is beyond the previous", async ({ page }) => {
    await loadRace(page);
    const scans = await page.evaluate(() => {
      // Near the end: 60 m ahead wraps around start/finish
      window.__apex.reset(0.997, 30, 0);
      return window.__apex.obs().scan;
    });
    expect(scans[0].d).toBe(10);
    expect(scans[1].d).toBe(30);
    expect(scans[2].d).toBe(60);
    // All scan points should have valid track widths
    for (const pt of scans) expect(pt.width).toBeGreaterThan(0);
  });

  test("clearR and clearL are positive for scan at wrap-around positions", async ({ page }) => {
    await loadRace(page);
    const result = await page.evaluate(() => {
      window.__apex.reset(0.997, 30, 0);
      const obs = window.__apex.obs();
      return { clearR: obs.clearR, clearL: obs.clearL, x: obs.x };
    });
    // Car is on centreline (x≈0) so both clearances should be positive
    expect(result.clearR).toBeGreaterThan(0);
    expect(result.clearL).toBeGreaterThan(0);
  });
});

// ── obs().done semantics ──────────────────────────────────────────────────────

test.describe("obs().done episode terminal flag", () => {
  test.use({ viewport: LANDSCAPE });

  test("done is false immediately after reset()", async ({ page }) => {
    await loadRace(page);
    const obs = await page.evaluate(() => window.__apex.reset(0.3, 40, 0));
    expect(obs.done).toBe(false);
  });

  test("done is false during normal forward driving", async ({ page }) => {
    await loadRace(page);
    const obs = await page.evaluate(() => {
      window.__apex.headless(true);
      window.__apex.reset(0.3, 40, 0);
      let o;
      for (let i = 0; i < 60; i++) {
        o = window.__apex.act({ steer: 0, throttle: true, brake: false }, 1 / 60, 1);
      }
      window.__apex.headless(false);
      return o;
    });
    expect(obs.done).toBe(false);
  });

  test("done becomes true when wrong-way is active", async ({ page }) => {
    await loadRace(page);
    const done = await page.evaluate(() => {
      window.__apex.headless(true);
      window.__apex.reset(0.3, 25, 0);
      window.__apex.aim(180);   // face backwards
      let obs;
      for (let i = 0; i < 80; i++) {
        obs = window.__apex.act({ steer: 0, throttle: true, brake: false }, 1 / 60, 1);
        if (obs.wrongWay) break;
      }
      window.__apex.headless(false);
      return obs.done;
    });
    expect(done).toBe(true);
  });

  test("done resets to false after reset() clears wrong-way", async ({ page }) => {
    await loadRace(page);
    const result = await page.evaluate(() => {
      window.__apex.headless(true);
      // Get into wrong-way
      window.__apex.reset(0.3, 25, 0);
      window.__apex.aim(180);
      for (let i = 0; i < 60; i++) {
        window.__apex.act({ steer: 0, throttle: true, brake: false }, 1 / 60, 1);
        if (window.__apex.obs().wrongWay) break;
      }
      const doneBefore = window.__apex.obs().done;
      // Reset clears all state
      const obsAfter = window.__apex.reset(0.3, 40, 0);
      window.__apex.headless(false);
      return { doneBefore, doneAfter: obsAfter.done };
    });
    expect(result.doneBefore).toBe(true);
    expect(result.doneAfter).toBe(false);
  });
});

// ── obs() numeric stability ───────────────────────────────────────────────────

test.describe("obs() numeric stability across all positions", () => {
  test.use({ viewport: LANDSCAPE });

  test("obs() returns no NaN or Infinity at 20 positions around full lap", async ({ page }) => {
    await loadRace(page);
    const badPositions = await page.evaluate(() => {
      const bad = [];
      for (let i = 0; i < 20; i++) {
        const frac = i / 20;
        window.__apex.reset(frac, 40, 0);
        const obs = window.__apex.obs();
        if (!obs) { bad.push(frac); continue; }
        const fields = [obs.s, obs.x, obs.speed, obs.k, obs.hw,
                        obs.wallR, obs.wallL, obs.clearR, obs.clearL,
                        obs.axFrac, obs.slipFactor];
        for (const pt of obs.scan || []) fields.push(pt.k, pt.hw, pt.wallR, pt.wallL, pt.width);
        if (fields.some((v) => !isFinite(v))) bad.push(frac);
      }
      return bad;
    });
    expect(badPositions).toEqual([]);
  });

  test("reward object fields are always finite numbers", async ({ page }) => {
    await loadRace(page);
    const result = await page.evaluate(() => {
      window.__apex.headless(true);
      window.__apex.reset(0.3, 40, 0);
      let bad = false;
      for (let i = 0; i < 60; i++) {
        const obs = window.__apex.act({ steer: 0, throttle: true, brake: false }, 1 / 60, 1);
        const r = obs.reward || {};
        if (!isFinite(r.speed) || !isFinite(r.offTrack) || !isFinite(r.wallDist)) {
          bad = true; break;
        }
      }
      window.__apex.headless(false);
      return bad;
    });
    expect(result).toBe(false);
  });
});

// ── multi-track scan robustness ───────────────────────────────────────────────

test.describe("scan() wrap-around on multiple tracks", () => {
  test.use({ viewport: LANDSCAPE });

  for (const trackId of ["monaco", "suzuka", "spa"]) {
    test(`scan near seam is finite on ${trackId}`, async ({ page }) => {
      await loadRace(page, trackId);
      const ok = await page.evaluate(() => {
        const fracs = [0.994, 0.997, 0.9995];
        for (const frac of fracs) {
          window.__apex.reset(frac, 30, 0);
          const obs = window.__apex.obs();
          if (!obs) return false;
          for (const pt of obs.scan || []) {
            if (!isFinite(pt.k) || !isFinite(pt.hw) || pt.width <= 0) return false;
          }
        }
        return true;
      });
      expect(ok).toBe(true);
    });
  }
});
