// @ts-check
// Steering-physics tests for the player heading model (js/game.js, updateCar).
//
// These run the real simulation deterministically: __apex.setInput() overrides
// the player's steer/throttle/brake and __apex.step(dt, n) advances the physics
// at a fixed timestep, so results don't depend on the (very slow, ~2 fps under
// SwiftShader) render clock. __apex.probe() reports the player's lateral offset
// x, heading offset angle, local curvature k, half-width hw and speed.
//
// Sign conventions (see Tracks.curvature + the heading model):
//   x      metres, + = right of the centreline
//   k      rad/m,  + = right-hand corner
//   inside of a corner is the sign(k) side; outside is -sign(k).
import { test, expect } from "@playwright/test";

async function startLiveRace(page) {
  await page.goto("/");
  await page.locator("#mb-race").click();
  await page.locator("#sel-go").click();
  await page.locator("#rs-go").click();
  await page.waitForFunction(
    () => window.__apex && window.__apex.info().track != null,
    { timeout: 10_000 }
  );
  await page.evaluate(() => window.__apex.go());
}

const probe = (page) => page.evaluate(() => window.__apex.probe());

// Place the player, hold the given input for `ticks` physics frames, return the
// before/after probes. dt is fixed at 1/60 s. throttle defaults off so speed
// stays close to the value we jumped in at (no acceleration ramp).
async function run(page, { frac, speed = 30, steer = 0, throttle = false, brake = false, settle = 3, ticks = 90 }) {
  await page.evaluate((f) => { window.__apex.jump(f.frac, f.speed, 0); }, { frac, speed });
  await page.evaluate((inp) => {
    window.__apex.setInput(inp);
    window.__apex.step(1 / 60, inp.settle);
  }, { steer: 0, throttle, brake, settle });
  const before = await probe(page);
  await page.evaluate((inp) => {
    window.__apex.setInput(inp);
    window.__apex.step(1 / 60, inp.ticks);
    window.__apex.clearInput();
  }, { steer, throttle, brake, ticks });
  const after = await probe(page);
  return { before, after };
}

// A reasonably straight stretch: the lap fraction with the smallest |k|.
async function findStraight(page) {
  return page.evaluate(() => {
    let best = 0, bestK = Infinity;
    for (let i = 0; i < 50; i++) {
      const f = i / 50;
      window.__apex.jump(f, 20, 0);
      const k = Math.abs(window.__apex.probe().k);
      if (k < bestK) { bestK = k; best = f; }
    }
    return { frac: best, k: bestK };
  });
}

test.describe("Apex 26 — steering", () => {
  test("no auto-steer: with no input the car runs wide to the OUTSIDE at corners", async ({ page }) => {
    await startLiveRace(page);
    const corners = await page.evaluate(() => window.__apex.corners());
    expect(corners.length).toBeGreaterThan(0);

    // Sample several distinct corners across the lap.
    const sample = corners.filter((_, i) => i % 4 === 0).slice(0, 5);
    let checked = 0;
    for (const frac of sample) {
      const { before, after } = await run(page, { frac, speed: 28, throttle: true, ticks: 75 });
      if (Math.abs(before.k) < 0.012) continue; // skip near-straight false peaks
      checked++;
      const dx = after.x - before.x;
      // Outside is the -sign(k) direction. The car must move that way, not toward
      // the apex — proving there is no auto-steer onto the racing line.
      expect(Math.sign(dx)).toBe(-Math.sign(before.k));
      expect(Math.abs(dx)).toBeGreaterThan(1); // and it's a clear slide, not a wobble
    }
    expect(checked).toBeGreaterThan(0);
  });

  test("steering has authority to fight the curvature drift", async ({ page }) => {
    await startLiveRace(page);
    const corners = await page.evaluate(() => window.__apex.corners());
    // Pick a real corner.
    let frac = corners[0], k0 = 0;
    for (const f of corners) {
      const p = await page.evaluate((ff) => { window.__apex.jump(ff, 24, 0); return window.__apex.probe(); }, f);
      if (Math.abs(p.k) > 0.02) { frac = f; k0 = p.k; break; }
    }
    expect(Math.abs(k0)).toBeGreaterThan(0.02);

    // Inward steer is the sign(k) side. Hold it through the corner at a sane
    // corner speed and compare against doing nothing.
    const inward = Math.sign(k0);
    const zero = await run(page, { frac, speed: 22, steer: 0, throttle: false, ticks: 75 });
    const held = await run(page, { frac, speed: 22, steer: inward, throttle: false, ticks: 75 });

    const dxZero = zero.after.x - zero.before.x;   // drifts outward (−sign(k))
    const dxHeld = held.after.x - held.before.x;   // should be far more inward
    // Steering must move the car at least 2 m further toward the inside than
    // coasting does — i.e. the driver genuinely controls the line.
    expect((dxHeld - dxZero) * inward).toBeGreaterThan(2);
  });

  test("direction: +steer goes right, −steer goes left on a straight", async ({ page }) => {
    await startLiveRace(page);
    const { frac } = await findStraight(page);

    const right = await run(page, { frac, speed: 30, steer: 1, ticks: 60 });
    const left = await run(page, { frac, speed: 30, steer: -1, ticks: 60 });

    expect(right.after.x - right.before.x).toBeGreaterThan(0.5);
    expect(left.after.x - left.before.x).toBeLessThan(-0.5);
  });

  test("expo response: half input turns the car well under half as fast", async ({ page }) => {
    await startLiveRace(page);
    const { frac } = await findStraight(page);

    // Short burst (6 ticks ≈ 0.1 s) keeps the heading below the slip clamp, so
    // the change in angle reflects the raw input→turn-rate curve, not saturation.
    const full = await run(page, { frac, speed: 30, steer: 1, ticks: 6 });
    const half = await run(page, { frac, speed: 30, steer: 0.5, ticks: 6 });

    const aFull = Math.abs(full.after.angle - full.before.angle);
    const aHalf = Math.abs(half.after.angle - half.before.angle);
    expect(aFull).toBeGreaterThan(0.05);
    // STEER_EXPO = 2.4 → half stick ≈ 0.5^2.4 ≈ 0.19 of the turn rate: very
    // gentle near centre. Allow margin: between 8 % and 35 % of full.
    expect(aHalf).toBeLessThan(aFull * 0.35);
    expect(aHalf).toBeGreaterThan(aFull * 0.08);
  });

  test("straight tracking: no input keeps the car on its line", async ({ page }) => {
    await startLiveRace(page);
    const { frac } = await findStraight(page);
    const { before, after } = await run(page, { frac, speed: 30, steer: 0, throttle: true, ticks: 90 });
    // On a straight the heading stays put, so lateral position barely moves.
    expect(Math.abs(after.x - before.x)).toBeLessThan(0.5);
    expect(Math.abs(after.angle)).toBeLessThan(0.05);
  });

  test("symmetry: opposite inputs turn the heading by opposite, equal amounts", async ({ page }) => {
    await startLiveRace(page);
    const { frac } = await findStraight(page);

    // Compare heading change over a short burst (pre-saturation) so the result
    // isn't dominated by residual track curvature over a long slide.
    const right = await run(page, { frac, speed: 30, steer: 1, ticks: 6 });
    const left = await run(page, { frac, speed: 30, steer: -1, ticks: 6 });

    const aR = right.after.angle - right.before.angle;
    const aL = left.after.angle - left.before.angle;
    expect(aR).toBeGreaterThan(0);
    expect(aL).toBeLessThan(0);
    // Within 15 % of each other.
    expect(Math.abs(aR + aL)).toBeLessThan(Math.max(aR, -aL) * 0.15);
  });
});
