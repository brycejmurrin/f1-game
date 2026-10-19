// @ts-check
// The one agent-determinism test the VM cannot run: it pumps real animation
// frames between two seeded episodes. The JSON replays live in
// tests/unit/agent-determinism-vm.test.mjs (and the browser spec it twins).
import { test, expect, BOOT_MS } from "../helpers/fixtures.js";

const LANDSCAPE = { width: 844, height: 390 };

async function load(page, trackId = "monza") {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex != null, null, { polling: 100, timeout: BOOT_MS });
  await page.evaluate((id) => window.__apex.race(id), trackId);
  await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: BOOT_MS });
}

test.describe("simulation determinism — rendered frames", () => {
  test.use({ viewport: LANDSCAPE });

  test("cosmetic randomness does not draw from the seeded stream", async ({ page }) => {
    await load(page);
    // reset() WITHOUT a seed argument keeps the stream where seed(42) and the
    // frames since left it; reset(.., seed) re-seeds and would erase any advance
    // (the previous version could not fail — review R3-01).
    // LIMIT: no __apex hook reads the stream position, and reset()/a 1 s rollout
    // do not depend on it, so no in-page positive control exists; the
    // comparison below catches a cosmetic draw only where a later draw (the
    // frames themselves, reliability, start hold) feeds the episode. A real
    // control needs a stream-position read (sub-issue of #2952).
    const r = await page.evaluate(() => {
      const A = window.__apex;
      const episode = () => {
        const reset = A.reset(0.02, 55, 0);        // NO seed: keeps the stream position
        const ro = A.rollout({ seconds: 1, input: { steer: 0.05, throttle: true } });
        const f = A.field({ detail: "full" });
        return JSON.stringify({ reset: !!reset, d: ro.distanceM, s: ro.speedKph, to: ro.to,
          grid: f.positions.map((p) => p.code + ":" + p.pace).join(",") });
      };
      const frames = (n) => new Promise((res) => {
        let i = 0;
        const tick = () => (++i > n ? res() : requestAnimationFrame(tick));
        requestAnimationFrame(tick);
      });
      A.headless(true);
      A.seed(42); const baseline = episode();
      // Same seed, but real frames render between the rewind and the episode:
      // if particles / camera shake / sparks drew from the seeded stream, the
      // stream would have advanced and the grid + rollout would differ.
      A.headless(false);
      A.seed(42); return frames(20).then(() => {
        A.headless(true);
        const afterFrames = episode();
        A.headless(false);
        return { baseline, afterFrames };
      });
    });
    expect(r.afterFrames).toBe(r.baseline);
  });
});
