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
    // Positive control (R3-01): seed(undefined, true) reads the stream position
    // without drawing. It must see a real draw (an unseeded reset() regrids from
    // the stream, so it moves), and 20 rendered frames must leave it exactly
    // where seed(42) put it: a cosmetic draw now fails here directly, not only
    // where a later draw happens to feed the episode comparison below.
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
      A.seed(42);
      const pos0 = A.seed(undefined, true), pos0Again = A.seed(undefined, true);
      A.reset(0.02, 55, 0);
      const posAfterReset = A.seed(undefined, true);
      A.headless(false);
      A.seed(42); return frames(20).then(() => {
        const posAfterFrames = A.seed(undefined, true);
        A.headless(true);
        const afterFrames = episode();
        A.headless(false);
        return { baseline, afterFrames, pos0, pos0Again, posAfterReset, posAfterFrames };
      });
    });
    expect(r.pos0, "seed(42) starts the stream at the seed").toBe(42);
    expect(r.pos0Again, "reading the position draws nothing").toBe(42);
    expect(r.posAfterReset, "the read sees a real sim draw (positive control)").not.toBe(42);
    expect(r.posAfterFrames, "rendered frames draw nothing from the seeded stream").toBe(42);
    expect(r.afterFrames).toBe(r.baseline);
  });
});
