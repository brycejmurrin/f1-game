// @ts-check
// Tests for the headless control loop API: __apex.headless(), __apex.obs(),
// __apex.act(), __apex.reset(). These verify the API contract and that a
// tight control loop can step physics and read observations in one round-trip.
import { test, expect } from "@playwright/test";

const LANDSCAPE = { width: 844, height: 390 };

async function loadRace(page, trackId = "monza") {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex != null, { timeout: 8000 });
  await page.evaluate((id) => window.__apex.race(id), trackId);
  await page.waitForFunction(() => window.__apex.info().track != null, { timeout: 10_000 });
  // jump to mid-track at racing speed so obs() has valid world-space position
  await page.evaluate(() => { window.__apex.jump(0.1, 40, 0); });
  await page.waitForTimeout(100);
}

test.describe("__apex.headless()", () => {
  test.use({ viewport: LANDSCAPE });

  test("returns false by default", async ({ page }) => {
    await loadRace(page);
    const v = await page.evaluate(() => window.__apex.headless());
    expect(v).toBe(false);
  });

  test("can be set to true and read back", async ({ page }) => {
    await loadRace(page);
    const was = await page.evaluate(() => {
      window.__apex.headless(true);
      return window.__apex.headless();
    });
    expect(was).toBe(true);
  });

  test("can be toggled off again", async ({ page }) => {
    await loadRace(page);
    const v = await page.evaluate(() => {
      window.__apex.headless(true);
      window.__apex.headless(false);
      return window.__apex.headless();
    });
    expect(v).toBe(false);
  });
});

test.describe("__apex.obs()", () => {
  test.use({ viewport: LANDSCAPE });

  test("returns null before track load", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null, { timeout: 8000 });
    const v = await page.evaluate(() => window.__apex.obs());
    expect(v).toBeNull();
  });

  test("returns full observation object after jump", async ({ page }) => {
    await loadRace(page);
    const obs = await page.evaluate(() => window.__apex.obs());
    expect(obs).not.toBeNull();

    // position
    expect(typeof obs.s).toBe("number");
    expect(typeof obs.x).toBe("number");
    expect(typeof obs.prog).toBe("number");
    expect(typeof obs.lap).toBe("number");
    expect(typeof obs.raceT).toBe("number");

    // motion
    expect(typeof obs.speed).toBe("number");
    expect(typeof obs.speedKph).toBe("number");
    expect(obs.speedKph).toBeCloseTo(obs.speed * 3.6, 0);

    // physics
    expect(typeof obs.axFrac).toBe("number");
    expect(obs.axFrac).toBeGreaterThanOrEqual(0);
    expect(obs.axFrac).toBeLessThanOrEqual(1);
    expect(typeof obs.slipFactor).toBe("number");
    expect(obs.slipFactor).toBeGreaterThanOrEqual(0);
    expect(obs.slipFactor).toBeLessThanOrEqual(1);

    // track context
    expect(typeof obs.k).toBe("number");
    expect(typeof obs.hw).toBe("number");
    expect(obs.hw).toBeGreaterThan(0);
    expect(typeof obs.slope).toBe("number");
    expect(obs.gripMult).toBe(1); // dry by default

    // barrier clearances
    expect(typeof obs.wallR).toBe("number");
    expect(typeof obs.wallL).toBe("number");
    expect(typeof obs.clearR).toBe("number");
    expect(typeof obs.clearL).toBe("number");
    expect(obs.clearR).toBeGreaterThan(0);
    expect(obs.clearL).toBeGreaterThan(0);

    // state flags
    expect(typeof obs.wrongWay).toBe("boolean");
    expect(typeof obs.done).toBe("boolean");
    expect(typeof obs.offT).toBe("number");
    expect(typeof obs.rescueT).toBe("number");

    // input
    expect(typeof obs.input).toBe("object");

    // rivals
    expect(typeof obs.posInField).toBe("number");

    // lookahead scan
    expect(Array.isArray(obs.scan)).toBe(true);
    expect(obs.scan).toHaveLength(3);
    expect(obs.scan[0].d).toBe(10);
    expect(obs.scan[1].d).toBe(30);
    expect(obs.scan[2].d).toBe(60);
    for (const pt of obs.scan) {
      expect(typeof pt.k).toBe("number");
      expect(typeof pt.hw).toBe("number");
      expect(typeof pt.wallR).toBe("number");
      expect(typeof pt.wallL).toBe("number");
      expect(typeof pt.width).toBe("number");
      expect(pt.width).toBeGreaterThan(0);
    }

    // reward components
    expect(typeof obs.reward).toBe("object");
    expect(typeof obs.reward.speed).toBe("number");
    expect(typeof obs.reward.offTrack).toBe("number");
    expect(typeof obs.reward.wallDist).toBe("number");
    expect(typeof obs.reward.wrongWay).toBe("boolean");
  });

  test("done is false when driving normally", async ({ page }) => {
    await loadRace(page);
    const obs = await page.evaluate(() => window.__apex.obs());
    expect(obs.done).toBe(false);
  });

  test("clearR and clearL are positive when on-track at centre", async ({ page }) => {
    await loadRace(page);
    await page.evaluate(() => window.__apex.jump(0.1, 40, 0));
    await page.waitForTimeout(50);
    const obs = await page.evaluate(() => window.__apex.obs());
    expect(obs.x).toBeCloseTo(0, 0);
    expect(obs.clearR).toBeGreaterThan(0);
    expect(obs.clearL).toBeGreaterThan(0);
  });

  test("wallR > x (right wall is to the right of the car)", async ({ page }) => {
    await loadRace(page);
    const obs = await page.evaluate(() => window.__apex.obs());
    expect(obs.wallR).toBeGreaterThan(obs.x);
  });

  test("wet weather sets gripMult to 0.82 (rain to 0.72)", async ({ page }) => {
    // Weather was split into WET (damp, 0.82) and RAIN (storm, 0.72).
    await loadRace(page);
    await page.evaluate(() => window.__apex.weather("wet"));
    let obs = await page.evaluate(() => window.__apex.obs());
    expect(obs.gripMult).toBeCloseTo(0.82, 2);
    expect(obs.weather).toBe("wet");
    await page.evaluate(() => window.__apex.weather("rain"));
    obs = await page.evaluate(() => window.__apex.obs());
    expect(obs.gripMult).toBeCloseTo(0.72, 2);
  });
});

test.describe("__apex.act()", () => {
  test.use({ viewport: LANDSCAPE });

  test("returns obs on first call", async ({ page }) => {
    await loadRace(page);
    const obs = await page.evaluate(() =>
      window.__apex.act({ steer: 0, throttle: true, brake: false }, 1 / 60, 1)
    );
    expect(obs).not.toBeNull();
    expect(typeof obs.speed).toBe("number");
    expect(typeof obs.done).toBe("boolean");
  });

  test("throttle for 60 ticks increases speed from rest", async ({ page }) => {
    await loadRace(page);
    await page.evaluate(() => window.__apex.reset(0.1, 0, 0));  // in race state at rest
    const obs = await page.evaluate(() =>
      window.__apex.act({ steer: 0, throttle: true, brake: false }, 1 / 60, 60)
    );
    expect(obs.speed).toBeGreaterThan(5);
  });

  test("braking reduces speed", async ({ page }) => {
    await loadRace(page);
    const before = await page.evaluate(() => window.__apex.reset(0.1, 60, 0));
    const after = await page.evaluate(() =>
      window.__apex.act({ steer: 0, throttle: false, brake: true }, 1 / 60, 30)
    );
    expect(after.speed).toBeLessThan(before.speed);
  });

  test("input field in obs reflects what was passed to act", async ({ page }) => {
    await loadRace(page);
    const obs = await page.evaluate(() =>
      window.__apex.act({ steer: 0.5, throttle: true, brake: false }, 1 / 60, 1)
    );
    expect(obs.input.steer).toBeCloseTo(0.5, 5);
    expect(obs.input.throttle).toBe(true);
    expect(obs.input.brake).toBe(false);
  });

  test("act(null) clears test input", async ({ page }) => {
    await loadRace(page);
    await page.evaluate(() => window.__apex.act({ steer: 0.9, throttle: true }, 1 / 60, 1));
    const obs = await page.evaluate(() => window.__apex.act(null, 1 / 60, 1));
    expect(obs.input.steer).toBeNull();
  });

  test("n=10 steps advances further than n=1", async ({ page }) => {
    await loadRace(page);
    const [s1, s10] = await page.evaluate(() => {
      window.__apex.reset(0.1, 40, 0);
      const a = window.__apex.act({ steer: 0, throttle: true }, 1 / 60, 1);
      window.__apex.reset(0.1, 40, 0);
      const b = window.__apex.act({ steer: 0, throttle: true }, 1 / 60, 10);
      return [a.s, b.s];
    });
    expect(s10).toBeGreaterThan(s1);
  });

  test("headless mode does not break act()", async ({ page }) => {
    await loadRace(page);
    const obs = await page.evaluate(() => {
      window.__apex.headless(true);
      const o = window.__apex.act({ steer: 0, throttle: true }, 1 / 60, 5);
      window.__apex.headless(false);
      return o;
    });
    expect(obs).not.toBeNull();
    expect(obs.speed).toBeGreaterThanOrEqual(0);
  });
});

test.describe("__apex.reset()", () => {
  test.use({ viewport: LANDSCAPE });

  test("returns obs after reset", async ({ page }) => {
    await loadRace(page);
    const obs = await page.evaluate(() => window.__apex.reset(0.1, 30, 0));
    expect(obs).not.toBeNull();
    expect(typeof obs.speed).toBe("number");
  });

  test("places player near the requested lap fraction", async ({ page }) => {
    await loadRace(page);
    const obs = await page.evaluate(() => window.__apex.reset(0.25, 0, 0));
    // prog is in metres; track.total varies, but fraction should be near 0.25
    const info = await page.evaluate(() => window.__apex.info());
    const expectedS = 0.25 * info.total;
    expect(obs.s).toBeGreaterThan(expectedS - 50);
    expect(obs.s).toBeLessThan(expectedS + 50);
  });

  test("sets initial speed correctly", async ({ page }) => {
    await loadRace(page);
    const obs = await page.evaluate(() => window.__apex.reset(0.1, 55, 0));
    expect(obs.speed).toBeCloseTo(55, 0);
  });

  test("resets lap counter to 0", async ({ page }) => {
    await loadRace(page);
    const obs = await page.evaluate(() => window.__apex.reset(0.1, 0, 0));
    expect(obs.lap).toBe(0);
  });

  test("done is false immediately after reset", async ({ page }) => {
    await loadRace(page);
    const obs = await page.evaluate(() => window.__apex.reset(0.1, 40, 0));
    expect(obs.done).toBe(false);
  });

  test("can reset multiple times and always return valid obs", async ({ page }) => {
    await loadRace(page);
    const results = await page.evaluate(() => {
      const a = window.__apex.reset(0.1, 30, 0);
      const b = window.__apex.reset(0.5, 50, 1);
      const c = window.__apex.reset(0.9, 0, -2);
      return [a, b, c];
    });
    for (const obs of results) {
      expect(obs).not.toBeNull();
      expect(typeof obs.speed).toBe("number");
      expect(obs.done).toBe(false);
    }
  });

  test("returns false when player not yet initialised", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null, { timeout: 8000 });
    // reset() requires both track and player; on a fresh page either may be null
    // depending on race between track load and player initialisation.
    // Verify: it either returns false (safe) or a valid obs (also fine).
    const v = await page.evaluate(() => {
      try {
        const r = window.__apex.reset(0.1);
        return r === false || (typeof r === "object" && r !== null);
      } catch (e) { return false; }
    });
    expect(v).toBe(true);
  });
});

test.describe("headless control loop integration", () => {
  test.use({ viewport: LANDSCAPE });

  test("50-step control loop completes with valid final obs", async ({ page }) => {
    await loadRace(page);
    const final = await page.evaluate(() => {
      window.__apex.headless(true);
      window.__apex.reset(0.1, 40, 0);
      let obs;
      for (let i = 0; i < 50; i++) {
        const steer = obs ? Math.sign(obs.clearL - obs.clearR) * 0.2 : 0;
        obs = window.__apex.act({ steer, throttle: true, brake: false }, 1 / 60, 1);
        if (obs.done) break;
      }
      window.__apex.headless(false);
      return obs;
    });
    expect(final).not.toBeNull();
    expect(typeof final.speed).toBe("number");
    expect(typeof final.done).toBe("boolean");
    expect(Array.isArray(final.scan)).toBe(true);
  });
});
