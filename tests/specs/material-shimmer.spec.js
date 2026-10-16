// material-shimmer.spec.js — does the baked tarmac CRAWL when the car moves?
//
// This is the one risk the whole baked-material feature carries, and the one a
// screenshot cannot answer. js/track/core/geom.js's MAT.ASPHALT note says it plainly:
// the road is the surface viewed at a grazing angle for the entire race, and
// "anything with real relief crawls". A high-relief bake carries far more
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
import { BOOT_MS } from "../helpers/fixtures.js";
import { frameContent } from "../helpers/visual-oracle.js";
import { awaitSoftCapture } from "../helpers/soft-capture.js";

const FRAMES = 6;           // consecutive frames per condition
const STEP = 1 / 60;        // physics step between captures
const SPEED = 70;           // m/s — fast enough that minification bites
const START = 0.62;         // a straight on monza (no corner geometry in shot)

// Sample the ROAD only: the lower-middle band of the frame, where tarmac fills
// the view in the chase camera. Sampling the whole frame would drown the signal
// in sky, crowd and trackside motion.
async function roadFrames(page, mix) {
  await page.evaluate(async ({ mix, SPEED, START }) => {
    window.__apex.matTex(mix);
    window.__apex.jump(START, SPEED, 0);
    window.__apex.snapCam();
    // Let the camera settle and the texture upload land before sampling.
    await new Promise((r) => setTimeout(r, 600));
  }, { mix, SPEED, START });

  const shots = [];
  const startS = await page.evaluate(() => window.__apex.physState().s);
  const progress = [];
  for (let f = 0; f < FRAMES; f++) {
    progress.push(await page.evaluate((STEP) => {
      window.__apex.step(STEP, 1);
      window.__apex.snapCam();
      return window.__apex.physState().s;
    }, STEP));
    // Headless Chrome hides #game and presents ON DEMAND onto #game-soft, so
    // a frame exists to read only after a blit is armed and lands; drawing
    // #game read an uncomposited, blank buffer (remote shimmer group, run
    // 36752762251). awaitSoftCapture arms the blit and polls from Node; it is
    // a no-op where the canvas composites for real.
    await awaitSoftCapture(page, 60_000);
    shots.push(await page.evaluate(() => {
      const soft = document.getElementById("game-soft");
      const cv = soft && soft.width > 0 ? soft : document.getElementById("game");
      const W = 96, H = 48;                     // downsample target
      const off = document.createElement("canvas");
      off.width = W; off.height = H;
      const ctx = off.getContext("2d", { willReadFrequently: true });
      // Crop the lower-middle band (the road) out of the presented canvas.
      const sx = cv.width * 0.25, sw = cv.width * 0.5;
      const sy = cv.height * 0.62, sh = cv.height * 0.28;
      ctx.drawImage(cv, sx, sy, sw, sh, 0, 0, W, H);
      return Array.from(ctx.getImageData(0, 0, W, H).data);
    }));
  }
  // Mean absolute luminance delta between consecutive frames.
  let total = 0, n = 0;
  const transitions = [];
  for (let f = 1; f < shots.length; f++) {
    const a = shots[f - 1], b = shots[f];
    let transitionTotal = 0;
    for (let i = 0; i < a.length; i += 4) {
      const la = a[i] * 0.299 + a[i + 1] * 0.587 + a[i + 2] * 0.114;
      const lb = b[i] * 0.299 + b[i + 1] * 0.587 + b[i + 2] * 0.114;
      const change = Math.abs(la - lb);
      total += change; transitionTotal += change; n++;
    }
    transitions.push(transitionTotal / (a.length / 4));
  }
  const blank = shots.some((shot) => !frameContent(shot).nonblank);
  return { delta: n ? total / n : 0, frames: shots.length, blank, transitions, distance: progress.at(-1) - startS, progress };
}

test.describe("baked materials — temporal stability", () => {
  // Twelve on-demand soft blits; an llvmpipe readback can take seconds each.
  test.setTimeout(600_000);
  // OPT-IN: APEX_SHIMMER=1 npm run test:shimmer
  //
  // Filtering varies by GPU. Run this explicitly on the target renderer;
  // a failure requires investigation rather than silently widening the ratio.
  test.skip(!process.env.APEX_SHIMMER, "opt-in: set APEX_SHIMMER=1 (hardware-sensitive)");

  test("baked tarmac does not crawl relative to procedural", async ({ page }) => {
    // image-grade-visual's size, for the same reason: an llvmpipe readback of
    // a full-size lit frame takes tens of seconds (js/render/three/tlx.js
    // SOFT_READ_STALE_MS note), and this test needs twelve of them. The ratio
    // it asserts compares two runs at one size, so the size does not bias it.
    await page.setViewportSize({ width: 640, height: 360 });
    await page.goto("/");
    // BOOT_MS, not a hand-rolled 30 s: a SwiftShader boot here measures 11-33 s (2026-09-01).
    await page.waitForFunction(() => !!window.__apex, null, { polling: 100, timeout: BOOT_MS });
    await page.evaluate(() => window.Assets.load());
    await page.waitForFunction(() => window.__apex.assets().uploaded === true, null, { polling: 100, timeout: 30000 });
    await page.evaluate(() => window.__apex.race("monza"));
    await page.waitForFunction(() => window.__apex.info().track != null, null, { polling: 100, timeout: BOOT_MS });
    await page.evaluate(() => {
      window.__apex.go();
      window.__apex.freeze(true); // only explicit fixed steps move the scene
      window.__apex.setInput({ throttle: true, steer: 0 });
      window.__apex.camera("chase");
    });
    expect(await page.evaluate(() => window.__apex.info().state)).toBe("race");
    await page.waitForTimeout(1500);

    const off = await roadFrames(page, 0);
    const on = await roadFrames(page, 1);
    await page.evaluate(() => window.__apex.matTex(1));

    console.log(`[shimmer] procedural Δ=${off.delta.toFixed(3)}  baked Δ=${on.delta.toFixed(3)}  ratio=${(on.delta / Math.max(off.delta, 0.001)).toFixed(2)}`);

    // A blank capture would make both deltas ~0 and the test vacuously green —
    // the same trap the service-worker request counting fell into earlier.
    for (const { condition, run } of [{ condition: "procedural", run: off }, { condition: "baked", run: on }]) {
      expect(run.transitions.length, `${condition}: every capture pair was measured`).toBe(FRAMES - 1);
      for (const [i, delta] of run.transitions.entries()) {
        expect(delta, `${condition}: captures ${i}→${i + 1} must move; deltas=${JSON.stringify(run.transitions)}`).toBeGreaterThan(0.05);
      }
      expect(run.distance, "the road probe must actually drive the sampled stretch").toBeGreaterThan(FRAMES * STEP * SPEED * 0.8);
      expect(run.distance).toBeLessThan(FRAMES * STEP * SPEED * 1.2);
      expect(run.progress.every((s, i) => i === 0 || s > run.progress[i - 1])).toBe(true);
    }
    expect(on.distance, "both material conditions sample the same motion").toBeCloseTo(off.distance, 1);
    expect(off.blank, "procedural capture was blank — the measurement is meaningless").toBe(false);
    expect(on.blank, "every baked frame must contain visible road detail").toBe(false);
    expect(on.delta, "baked frames must show motion").toBeGreaterThan(0.05);
    expect(off.delta, "procedural frames show no motion at all; the car may not be moving").toBeGreaterThan(0.05);

    const ratio = on.delta / Math.max(off.delta, 0.001);
    // 2x is deliberately loose. Baked maps SHOULD add some frame-to-frame
    // difference — they add detail, and detail moves. The threshold is set to
    // catch "the road is boiling", not to demand the two be identical.
    expect(ratio, `baked materials add ${ratio.toFixed(2)}x the frame-to-frame change of procedural — investigate on real hardware, then pull matTexMix or the ASPHALT relief amount`).toBeLessThan(2.0);
  });
});
