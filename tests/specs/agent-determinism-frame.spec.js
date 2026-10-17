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

test.describe("simulation determinism — rendered frames", () => {
  test.use({ viewport: LANDSCAPE });

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
