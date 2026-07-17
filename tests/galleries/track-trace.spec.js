// Track trace: drive the follow (chase) camera around an entire lap and capture
// forward-facing screenshots at evenly spaced lap fractions. Same camera mode is
// held for every frame so the sequence reads as one continuous on-board-style
// tour of the circuit.
//
//   TRACK=suzuka FRAMES=60 npx playwright test tests/track-trace.spec.js
//
// Output: tests/track-trace/<track>/<NN>-<pct>.png
import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";

const TRACK  = process.env.TRACK  || "suzuka";
const FRAMES = parseInt(process.env.FRAMES || "60", 10);

// In-race shots need a landscape viewport, else the #rotate-device overlay hides
// the canvas. 1280x720 matches the config default aspect for crisp frames.
test.use({ viewport: { width: 1280, height: 720 } });

test.describe(`track trace: ${TRACK}`, () => {
  test(`follow-cam sweep (${FRAMES} frames)`, async ({ page }) => {
    test.setTimeout(180_000);

    const outDir = path.join("tests", "track-trace", TRACK);
    fs.mkdirSync(outDir, { recursive: true });

    const errors = [];
    page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message));

    await page.goto("/");
    await page.waitForFunction(() => window.__apex != null, { timeout: 10_000 });

    // Load the circuit and hold the follow camera for the whole tour.
    const loaded = await page.evaluate((id) => {
      const r = window.__apex.race(id, "day", "dry");
      window.__apex.camera("chase");
      window.__apex.hud(false);   // clean frame, no HUD overlay
      return r;
    }, TRACK);
    expect(loaded, `track "${TRACK}" should load`).toBeTruthy();

    await page.waitForFunction(
      () => window.__apex.info().track != null,
      { timeout: 15_000 }
    );

    for (let i = 0; i < FRAMES; i++) {
      const frac = i / FRAMES;

      // Park (stationary + frozen) at this lap fraction, then snap the chase
      // camera behind the car so the very next frame faces forward cleanly.
      const ok = await page.evaluate((f) => {
        const r = window.__apex.park(f);
        window.__apex.snapCam();
        return r;
      }, frac);
      expect(ok, `park at ${frac}`).toBeTruthy();

      // Let a couple of render frames settle the damped camera onto the snap.
      await page.waitForTimeout(120);

      const pct = Math.round(frac * 1000) / 10;       // e.g. 33.3
      const name = `${String(i).padStart(3, "0")}-${pct}.png`;
      await page.locator("canvas#game").screenshot({
        path: path.join(outDir, name),
      });
    }

    expect(errors.filter((e) => !e.includes("favicon"))).toEqual([]);
  });
});
