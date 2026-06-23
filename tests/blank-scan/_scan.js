// @ts-check
// Shared blank-detection routine used by the per-circuit specs in this folder.
// Each tests/blank-scan/<circuit>.spec.js calls scanCircuit(circuit).
//
// A frame is "blank" when its PNG is suspiciously small — the symptom of the
// camera being inside/behind scenery or staring into a void. The on-track
// scenery guard in js/tracks.js should keep every frame well above the floor.
import { test, expect } from "@playwright/test";

const POSITIONS = 25;       // every 4 % of the lap
const BLANK_BYTES = 80_000; // PNGs below this are near-empty

async function loadTrack(page, circuit) {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex?.race, { timeout: 15_000 });
  await page.evaluate((c) => window.__apex.race(c), circuit);
  await page.waitForFunction(() => window.__apex?.info().track != null, { timeout: 15_000 });
}

export function scanCircuit(circuit) {
  // 300s per circuit: this suite renders 25 frames under SwiftShader (CPU
  // rasteriser, ~200× slower than a real GPU). The dense static scenery makes
  // the busiest circuits slow on software rendering alone; the test's job is
  // BLANK-FRAME detection, not perf benchmarking, so the cap is generous to
  // keep that detection working without false timeouts. (Real GPUs render these
  // frames in well under a millisecond.)
  test(`blank scan: ${circuit}`, { timeout: 180_000 }, async ({ page }) => {
    let culled = 0;
    page.on("console", (m) => {
      const mm = m.text().match(new RegExp(`\\[scenery\\] ${circuit}: culled (\\d+)`));
      if (mm) culled = +mm[1];
    });

    await loadTrack(page, circuit);
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
