// @ts-check
// DETERMINISM STATUS — read before regenerating baselines.
//
// This suite had no committed baselines because it could not produce any: every
// circuit timed out at 15 s. Four separate causes were found and fixed here, and
// one remains, measured on Monza as the ratio of pixels differing between two
// runs of the SAME scene:
//
//   0.64  freeze() stops the PHYSICS, not the RENDER — uTime kept advancing, so
//         the canvas never held still and toHaveScreenshot, which retries until
//         two consecutive captures are IDENTICAL, could never converge.
//         -> headless(true) after the pose is set. Two grabs 800 ms apart went
//            from 264 604 differing bytes to byte-identical.
//   0.41  the settle was 120 ms while the loop runs at ~1 fps, so the frozen
//         frame was often one from BEFORE the teleport, and a different one each
//         run. -> wait for the new pose to actually present.
//   0.39  the render clock (sky drift, FLAG cloth) accumulates real frame dt.
//         -> __apex.renderClock(0) pins it.
//   0.12  the chase rig eases toward its target on every RENDERED frame, so an
//         early snapCam() is undone by however many frames follow. -> re-snap
//         AFTER the settle.
//   0.12  STILL UNEXPLAINED. The residual diff is a whole-scene offset of a few
//         metres, i.e. the camera still lands slightly differently. park()
//         instead of jump() is NOT the answer — it measures 0.55, because a
//         stationary car gives the chase rig no heading.
//
// So: 0.12 against a 0.10 threshold. Do NOT "fix" that by raising the ratio —
// 12% of pixels is far too coarse to catch a real regression, which is the whole
// point of the suite. Find the last source first.
// Shared helpers + data for the consolidated per-track visual regression suite
// (tests/manual/tracks-visual.spec.js) and the all-circuit audit specs. Previously each
// of the then-24 circuits had its own
// 5-line stub spec calling describeTrack(id) with 25 fractions each (600 golden
// PNGs) AND a parallel visual-regression-circuits-N set — the two were redundant
// pixel suites. Collapsed to ONE data-driven spec looping TRACKS at 6 fractions.
import { test, expect } from "@playwright/test";

// Every circuit, in Tracks.LIST order — DERIVED, not written down. This used to
// be a hand-maintained array whose comment still said "the 24 circuits" long
// after the roster reached 40, and nothing would have failed if a new circuit
// had been left out of it: the suite would simply have stopped covering it.
// tools/manifest.cjs's CIRCUITS list IS Tracks.LIST order (the load-order test
// asserts index.html against it), so read it there.
import { createRequire } from "module";
export const TRACKS = createRequire(import.meta.url)("../../tools/manifest.cjs").CIRCUITS;

/* The same roster for the all-circuit AUDIT specs, honouring TRACK=<id> (or a
   comma-separated TRACK=<id>,<id> subset) so one circuit — or a handful under
   investigation — can be measured on its own. Three specs had each pasted their
   own copy of the 40 ids; a new circuit added to js/circuits/ silently escaped
   all three. */
// Banked-road sample height (page.evaluate idiom):
//   const bank = Tracks.banking(bankTrack, frac * bankTrack.total, lat);
//   y = node.y + (bank ? bank.dy : 0);
// Centreline `node.y` is not the tarmac at |lat| > 0 inside a bankZone.
// Monza / Spa / Zandvoort foundation specs use this; `__apex.groundY` still
// reports the raw centreline gap (durable overRoad is open).
export function auditTracks() {
  if (!process.env.TRACK) return TRACKS;
  return process.env.TRACK.split(",").map((t) => t.trim()).filter(Boolean);
}

// 6 evenly spaced lap positions (~every 16.7%): 0, 17, 33, 50, 67, 83%. Enough
// to catch gross scenery/geometry/clipping regressions per circuit without the
// old 25-frac (×24 = 600-baseline) overkill. Bump if a regression slips through.
export const LAP_FRACTIONS = [0, 1 / 6, 2 / 6, 3 / 6, 4 / 6, 5 / 6];

async function waitForTrack(page, timeout = 10_000) {
  await page.waitForFunction(
    () => window.__apex && window.__apex.info().track != null,
    null, { polling: 100, timeout }
  );
}

async function goToRace(page, circuit) {
  await page.goto("/");
  await page.waitForFunction(() => window.__apex && window.__apex.race, null, { polling: 100, timeout: 10_000 });
  await page.evaluate((c) => window.__apex.race(c), circuit);
  await waitForTrack(page);
  // race() leaves the game in "count" (countdown) state; go() skips to "race"
  // so that jump() and freeze() operate in the right game phase.
  await page.evaluate(() => window.__apex.go());
}

// Place the car at `frac` with a forward-facing chase camera.
// jump(f, 40) gives the camera a heading; snapCam aligns it with no damping lag.
async function snapForward(page, frac) {
  await page.evaluate((f) => {
    window.__apex.camera("chase");
    // jump(), not park(): the chase rig needs a HEADING, and park() leaves the
    // car stationary, which measured markedly WORSE (0.55 of pixels differing
    // across runs vs 0.12) because the camera orientation is then ill-defined.
    window.__apex.jump(f, 40, 0);   // non-zero speed → camera has a heading
    window.__apex.snapCam();         // instantly align camera, no damping lag
    window.__apex.step(1 / 60, 5);  // advance a few ticks so GPU draws the frame
    window.__apex.freeze(true);      // hold the scene for the screenshot
    window.__apex.hud(false);        // hide HUD overlay for cleaner track shots
  }, frac);
  // A short settle ensures the compositor has flushed the latest frame.
  await page.waitForTimeout(150);
  // freeze() stops the PHYSICS, not the RENDER. uTime keeps advancing, so the
  // flag cloth wave and cloud drift repaint every frame and the canvas is never
  // pixel-stable — and toHaveScreenshot retries until two consecutive captures
  // are IDENTICAL. Measured on a frozen Monza: two grabs 800 ms apart differed
  // in 264 604 bytes, so the comparison could never converge and every circuit
  // timed out at 15 s. That is why this suite has no baselines. headless(true)
  // stops render() entirely; the compositor keeps the last drawn frame, and the
  // same measurement then reports the two grabs byte-identical.
  // The settle must outlast a real FRAME, not just a tick. Under SwiftShader the
  // loop runs at ~1 fps, so freezing 120 ms after the jump pinned whatever frame
  // happened to be on screen — often one from BEFORE the teleport, and a
  // different one each run. That is not instability, it is non-determinism: two
  // runs of the same scene differed in 64% of pixels. Wait for the renderer to
  // actually present the new pose, then stop it.
  await page.waitForTimeout(2500);
  // Re-snap the camera AFTER those frames, not before. The chase rig eases
  // toward its target every RENDERED frame, so an early snapCam() is undone by
  // however many frames happen to run next — and under SwiftShader that count
  // varies per run. The diff was the whole scene offset by a few metres, not
  // anything animating. Snapping here lands the camera exactly on the rig target
  // no matter what preceded it. Pin the render clock at the same moment so sky
  // drift and cloth land at a fixed phase too.
  await page.evaluate(() => { window.__apex.snapCam(); window.__apex.renderClock(0); });
  await page.waitForTimeout(1800);   // let that pose actually present
  await page.evaluate(() => window.__apex.headless(true));
  await page.waitForTimeout(120);
}

async function resetScene(page) {
  await page.evaluate(() => {
    window.__apex.headless(false);   // resume rendering for the next position
    window.__apex.freeze(false);
    window.__apex.hud(true);
    window.__apex.clearInput();
  });
}

// One test per circuit, not one test per fraction. Playwright can distribute
// circuits across workers while each worker pays the expensive page/track build
// cost only once, then captures all six positions from the same scene.
export function describeTrack(circuit) {
  test.describe(circuit, () => {
    test(`${circuit} - geometry/colors/clipping`, async ({ page }) => {
      await goToRace(page, circuit);

    for (const frac of LAP_FRACTIONS) {
        const label = (frac * 100).toFixed(0);
        await snapForward(page, frac);

        const info = await page.evaluate(() => window.__apex.info());
        expect.soft(info.state, `${circuit} @${label}% remains in race`).toBe("race");

        await expect.soft(page.locator("canvas#game")).toHaveScreenshot(
          `${circuit}-${label}.png`,
          // 15 s was not enough under SwiftShader: toHaveScreenshot needs at least
          // TWO captures to agree, and the first grab after a track build pays
          // shader compile + texture upload. The scene is pixel-stable by then
          // (see snapForward), so this waits on throughput, not on convergence.
          { maxDiffPixelRatio: 0.10, timeout: 60000 }
        );

        await resetScene(page);
      }
    });
  });
}
