// @ts-check
// Determinism: same seed + same inputs => same result.
//
// Why this spec exists. Every A/B in this repo — a physics retune, an agent
// policy comparison, tests/agent-drive-bench — assumes two runs of the same
// scenario are comparable. They were not. Five sites fed the simulation from
// Math.random(), and one of them (the AI overtake roll, js/game.js) fired every
// tick for every AI car, so two identical runs diverged immediately. Seeding
// those five closed it; two further leaks showed up only once the seed was in
// place and a run could actually be repeated:
//
//   1. gridUp() clears the race-level fields but not the drivetrain, so gear /
//      rpm / smoothed steering leaked across episodes.
//   2. `prog` accumulates from `c._prevS`, which reset() never cleared — the
//      first tick of a fresh episode banked one delta measured against the
//      PREVIOUS episode's final position.
//
// Both were invisible until determinism made them visible, which is the point:
// this spec is the guard that keeps them closed.
//
// Cosmetic randomness (camera shake, lightning, particles, audio) deliberately
// stays on Math.random(). It must never draw from the seeded stream — doing so
// would let a spark decide where a car ends up.
import { test, expect } from "../helpers/fixtures.js";

const LANDSCAPE = { width: 844, height: 390 };

async function load(page, trackId = "monza") {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: 8000 });
  await page.evaluate((id) => window.__apex.race(id), trackId);
  await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: 15_000 });
}

// One scripted episode at a given seed. Returns a digest that covers both the
// grid the seed dealt and the driving that followed.
function episodeScript() {
  return (seed) => {
    const A = window.__apex;
    A.headless(true);
    A.reset(0.02, 55, 0, seed);
    const r = A.rollout({ seconds: 4, input: { steer: 0.05, throttle: true } });
    const f = A.field({ detail: "full" });
    A.headless(false);
    return {
      distanceM: r.distanceM,
      speed: r.speedKph,
      to: r.to,
      grid: f.positions.map((p) => p.code + ":" + p.pace).join(","),
    };
  };
}

test.describe("simulation determinism", () => {
  test.use({ viewport: LANDSCAPE });

  test("the same seed replays an episode exactly", async ({ page }) => {
    await load(page);
    const r = await page.evaluate((src) => {
      const run = eval("(" + src + ")");
      return [run(42), run(42), run(42)];
    }, episodeScript().toString());
    // byte-identical digests, not merely close
    expect(JSON.stringify(r[1])).toBe(JSON.stringify(r[0]));
    expect(JSON.stringify(r[2])).toBe(JSON.stringify(r[0]));
    // and it actually drove — a frozen car would trivially "replay"
    expect(r[0].distanceM).toBeGreaterThan(50);
  });

  test("a different seed deals a different grid", async ({ page }) => {
    await load(page);
    const r = await page.evaluate((src) => {
      const run = eval("(" + src + ")");
      return [run(42), run(7)];
    }, episodeScript().toString());
    // the seed must actually reach the simulation, or "determinism" is just a
    // constant and the test above would pass on a broken implementation
    expect(r[1].grid).not.toBe(r[0].grid);
  });

  test("seed() round-trips and reset({seed}) applies before the grid is built", async ({ page }) => {
    await load(page);
    const r = await page.evaluate(() => {
      const A = window.__apex;
      A.seed(1234);
      const got = A.seed();
      A.reset(0.02, 55, 0, 99);
      const viaReset = A.seed();
      return { got, viaReset };
    });
    expect(r.got).toBe(1234);
    expect(r.viaReset).toBe(99);
  });

  test("cosmetic randomness does not draw from the seeded stream", async ({ page }) => {
    await load(page);
    // Rendering frames between two identical episodes must not shift the sim.
    // If particles/camera-shake ever moved onto the seeded stream, drawing them
    // would advance it and this would fail.
    const r = await page.evaluate((src) => {
      const run = eval("(" + src + ")");
      const a = run(42);
      return new Promise((res) => {
        let i = 0;
        const tick = () => (++i > 20 ? res([a, run(42)]) : requestAnimationFrame(tick));
        requestAnimationFrame(tick);
      });
    }, episodeScript().toString());
    expect(JSON.stringify(r[1])).toBe(JSON.stringify(r[0]));
  });
});
