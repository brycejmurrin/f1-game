// material-shimmer.spec.js — does the baked tarmac CRAWL when the car moves?
//
// This is the one risk the whole baked-material feature carries, and the one a
// screenshot cannot answer. js/track/geom.js's MAT.ASPHALT note says it plainly:
// the road is the surface viewed at a grazing angle for the entire race, and
// "anything with real relief crawls". A photoscan carries far more
// high-frequency detail than the two-octave procedural noise it replaced, so it
// is strictly more prone to it — and the feature now ships ON.
//
// HOW IT MEASURES. Shimmer is a TEMPORAL artifact: pixels flickering between
// frames beyond what the motion itself justifies. So drive a fixed stretch of
// straight, capture consecutive frames, and compute the mean absolute
// frame-to-frame delta over the ROAD REGION only. Then repeat with the identical
// motion at matTex(0) and matTex(1). The car covers the same ground either way,
// so the legitimate motion component is common to both and the RATIO isolates
// what the textures added.
//
// WHAT IT CANNOT TELL YOU. CI renders through SwiftShader, whose texture
// filtering and anisotropy differ from real silicon, so the absolute numbers are
// not a phone or a desktop GPU. What survives the difference is the comparison:
// both runs share the renderer, so a large ratio still means the baked maps are
// adding temporal noise. Treat a failure as "investigate on real hardware", not
// as a precise measurement. __apex.diag() reports the GPU for exactly this
// reason.
//
// Run: npx playwright test tests/specs/material-shimmer.spec.js   (npm run test:shimmer)

import { test, expect } from "@playwright/test";

const FRAMES = 6;           // consecutive frames per condition
const STEP = 1 / 60;        // physics step between captures
const SPEED = 70;           // m/s — fast enough that minification bites
const START = 0.62;         // a straight on monza (no corner geometry in shot)

// Sample the ROAD only: the lower-middle band of the frame, where tarmac fills
// the view in the chase camera. Sampling the whole frame would drown the signal
// in sky, crowd and trackside motion.
async function roadFrames(page, mix) {
  return page.evaluate(async ({ mix, FRAMES, STEP, SPEED, START }) => {
    window.__apex.matTex(mix);
    window.__apex.jump(START, SPEED, 0);
    window.__apex.snapCam();
    // Let the camera settle and the texture upload land before sampling.
    await new Promise((r) => setTimeout(r, 600));

    const cv = document.querySelector("canvas");
    const W = 96, H = 48;                       // downsample target
    const off = document.createElement("canvas");
    off.width = W; off.height = H;
    const ctx = off.getContext("2d", { willReadFrequently: true });
    const shots = [];
    for (let f = 0; f < FRAMES; f++) {
      window.__apex.step(STEP, 1);
      // Two rAFs: one to submit the frame, one to be sure it composited.
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      // Crop the lower-middle band (the road) out of the live canvas. Drawing
      // the canvas into a 2D context works even without preserveDrawingBuffer,
      // because drawImage samples the composited surface.
      const sx = cv.width * 0.25, sw = cv.width * 0.5;
      const sy = cv.height * 0.62, sh = cv.height * 0.28;
      ctx.drawImage(cv, sx, sy, sw, sh, 0, 0, W, H);
      shots.push(Array.from(ctx.getImageData(0, 0, W, H).data));
    }
    // Mean absolute luminance delta between consecutive frames.
    let total = 0, n = 0;
    for (let f = 1; f < shots.length; f++) {
      const a = shots[f - 1], b = shots[f];
      for (let i = 0; i < a.length; i += 4) {
        const la = a[i] * 0.299 + a[i + 1] * 0.587 + a[i + 2] * 0.114;
        const lb = b[i] * 0.299 + b[i + 1] * 0.587 + b[i + 2] * 0.114;
        total += Math.abs(la - lb); n++;
      }
    }
    const blank = shots[0].every((v, i) => i % 4 === 3 || v === shots[0][i % 4]);
    return { delta: n ? total / n : 0, frames: shots.length, blank };
  }, { mix, FRAMES, STEP, SPEED, START });
}

test.describe("baked materials — temporal stability", () => {
  test.setTimeout(180_000);
  // OPT-IN: APEX_SHIMMER=1 npm run test:shimmer
  //
  // Off by default for two honest reasons. It has never been run to completion,
  // so it must not be able to redden a shared gate; and CI renders through
  // SwiftShader, whose texture filtering differs from real silicon, so the
  // numbers it produces are indicative rather than authoritative. Enable it
  // deliberately, on hardware you trust, and read a failure as "go look",
  // not as a measurement.
  test.skip(!process.env.APEX_SHIMMER, "opt-in: set APEX_SHIMMER=1 (unverified, SwiftShader-sensitive)");

  test("baked tarmac does not crawl relative to procedural", async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(() => !!window.__apex, null, { polling: 100, timeout: 30000 });
    await page.evaluate(() => window.Assets.load());
    await page.waitForFunction(() => window.__apex.assets().uploaded === true, null, { polling: 100, timeout: 30000 });
    await page.evaluate(() => window.__apex.race("monza"));
    await page.waitForTimeout(1500);

    const off = await roadFrames(page, 0);
    const on = await roadFrames(page, 1);
    await page.evaluate(() => window.__apex.matTex(1));

    console.log(`[shimmer] procedural Δ=${off.delta.toFixed(3)}  baked Δ=${on.delta.toFixed(3)}  ratio=${(on.delta / Math.max(off.delta, 0.001)).toFixed(2)}`);

    // A blank capture would make both deltas ~0 and the test vacuously green —
    // the same trap the service-worker request counting fell into earlier.
    expect(off.blank, "procedural capture was blank — the measurement is meaningless").toBe(false);
    expect(off.delta, "procedural frames show no motion at all; the car may not be moving").toBeGreaterThan(0.05);

    const ratio = on.delta / Math.max(off.delta, 0.001);
    // 2x is deliberately loose. Baked maps SHOULD add some frame-to-frame
    // difference — they add detail, and detail moves. The threshold is set to
    // catch "the road is boiling", not to demand the two be identical.
    expect(ratio, `baked materials add ${ratio.toFixed(2)}x the frame-to-frame change of procedural — investigate on real hardware, then pull matTexMix or the ASPHALT relief amount`).toBeLessThan(2.0);
  });
});
