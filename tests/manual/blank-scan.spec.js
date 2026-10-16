// @ts-check
/**
 * BLANK-FRAME detection across every circuit — one test per circuit, all in one
 * file (this replaces the 40 identical three-line stubs under tests/blank-scan/).
 *
 * A frame is "blank" when its PNG is suspiciously small — the symptom of the
 * camera being inside/behind scenery or staring into a void. The on-track
 * scenery guard in js/track/tracks.js should keep every frame well above the
 * floor.
 *
 * Excluded from default discovery (testIgnore in playwright.config.js) because
 * it renders 25 frames × 40 circuits under SwiftShader. Run it by path:
 *
 *   npm test -- tests/manual/blank-scan.spec.js                 # all circuits
 *   npm test -- tests/manual/blank-scan.spec.js --grep monza    # one
 *   CIRCUITS=monza,spa npm test -- tests/manual/blank-scan.spec.js
 */
import { test, expect } from "@playwright/test";
import { circuits } from "./circuits.js";

const POSITIONS = 25;       // every 4 % of the lap
const BLANK_BYTES = 80_000; // PNGs below this are near-empty

async function loadTrack(page, circuit) {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex?.race, null, { timeout: 15_000 });
  await page.evaluate((c) => window.__apex.race(c), circuit);
  await page.waitForFunction(() => window.__apex?.info().track != null, null, { timeout: 15_000 });
}

for (const circuit of circuits()) {
  // 180s per circuit: this suite renders 25 frames under SwiftShader (CPU
  // rasteriser, ~200× slower than a real GPU). The dense static scenery makes
  // the busiest circuits slow on software rendering alone; the test's job is
  // BLANK-FRAME detection, not perf benchmarking, so the cap is generous to
  // keep that detection working without false timeouts. (Real GPUs render these
  // frames in well under a millisecond.)
  test(`blank scan: ${circuit}`, { timeout: 180_000 }, async ({ page }) => {
    // The build reports its on-track culling through js/core/log.js at `info`, which
    // reaches the console only when the scenery namespace is turned up — so ask
    // the ring buffer instead of scraping console text.
    await loadTrack(page, circuit);
    const culled = await page.evaluate(() => {
      const recs = (window.Log && window.Log.records({ ns: "scenery" })) || [];
      const hit = recs.map((r) => /culled (\d+)/.exec(r.msg)).filter(Boolean).pop();
      return hit ? Number(hit[1]) : 0;
    });

    await page.evaluate(() => window.__apex.park(0));
    const box = await page.locator("canvas#game").boundingBox();

    const blanks = [];
    for (let i = 0; i < POSITIONS; i++) {
      const frac = i / POSITIONS;
      await page.evaluate(([f]) => { window.__apex.jump(f, 60, 0); window.__apex.snapCam(); }, [frac]);
      await page.waitForTimeout(220);
      const buf = await page.screenshot({ clip: box });
      if (buf.length < BLANK_BYTES) blanks.push(`${Math.round(frac * 100)}% (${buf.length}b)`);
    }

    console.log(`${circuit}: culled=${culled} blanks=${blanks.length ? blanks.join(", ") : "none"}`);
    expect(blanks, `blank frames on ${circuit}: ${blanks.join(", ")}`).toEqual([]);
  });
}
