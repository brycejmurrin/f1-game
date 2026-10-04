// @ts-check
// PHYSICS BOOT — the blocking gate js/physics/ did not have on the selected job.
//
// A change under `js/physics/` (e.g. player-forces.js) routes to test:physics-core.
// Every other file in that group is either:
//   * covered by the fixed characterization gate,
//   * substituted by a VM twin / vmPage adapter on the node gate, or
//   * EXCLUDED because it declares >= the selected gate's 180 s per-test cap
//     (physics-hotpath 300 s, debris 540 s).
// So a physics-only PR emptied the change-aware plan, skipped `selected`, and
// failed Selected specs (verdict) with `dropped=2` — the same hole render-boot
// closed for js/render/ (PR #826 run 37165166486).
//
// This spec exists to be CHEAP ENOUGH TO BE SELECTED:
//
//   * no `test.slow()`, no `test.setTimeout`, no `test.describe.configure({
//     timeout })`. Those three are what `maxDeclaredTimeout()` walks for.
//   * few tests (two). Capacity is ~57 tests at the fallback; a fat file would
//     become `unreachable` the way touch-steer did at 25.
//   * `loadTrack(..., { headless: true })` so SwiftShader frames are not paid
//     for a hook-only probe (same adoption note as projection / hotpath).
//
// It is a PLAYER-FORCES / physState boot probe, not a characterization sweep.
// The baseline traces stay on physics-characterization; the allocation contract
// stays on physics-hotpath; Rapier debris stays on debris.spec.js.
import { test, expect } from "../helpers/fixtures.js";

test("player forces write finite combined-slip state after a short drive", async ({ loadTrack, page }) => {
  await loadTrack("monza", "day", "dry", { headless: true });
  const r = await page.evaluate(() => {
    const A = window.__apex;
    A.setPhysics({ pace: 1, drift: 0 });
    A.jump(0.0, 40, 0);
    A.setInput({ steer: 0.25, throttle: true, brake: false });
    for (let i = 0; i < 90; i++) A.step(1 / 60, 1);
    const p = A.physState();
    A.clearInput();
    return {
      speed: p.speed,
      axFrac: p.axFrac,
      slipFactor: p.slipFactor,
      vLat: p.vLat,
      yawRate: p.yawRate,
      slipDeg: p.slipDeg,
      finite: [p.speed, p.axFrac, p.slipFactor, p.vLat, p.yawRate, p.slipDeg]
        .every((x) => typeof x === "number" && Number.isFinite(x)),
    };
  });
  expect(r.finite, "physState fields from the bicycle must be finite").toBe(true);
  expect(r.speed).toBeGreaterThan(5);
  // Combined-slip budget: axFrac in [0,1], slipFactor = sqrt(1-axFrac²) in [0,1].
  expect(r.axFrac).toBeGreaterThanOrEqual(0);
  expect(r.axFrac).toBeLessThanOrEqual(1);
  expect(r.slipFactor).toBeGreaterThan(0);
  expect(r.slipFactor).toBeLessThanOrEqual(1);
  // Steered drive must produce some lateral / yaw response — otherwise the
  // player-forces path did not engage.
  expect(Math.abs(r.vLat) + Math.abs(r.yawRate) + Math.abs(r.slipDeg))
    .toBeGreaterThan(0.01);
});

test("brake-to-standstill keeps physState readable (no NaN through dirS blend)", async ({ loadTrack, page }) => {
  await loadTrack("monza", "day", "dry", { headless: true });
  const r = await page.evaluate(() => {
    const A = window.__apex;
    A.setPhysics({ pace: 1, drift: 0 });
    A.jump(0.0, 25, 0);
    A.setInput({ steer: 0.3, throttle: false, brake: true });
    let minSpeed = 25, bad = null;
    for (let i = 0; i < 240; i++) {
      A.step(1 / 60, 1);
      const p = A.physState();
      minSpeed = Math.min(minSpeed, p.speed);
      for (const k of ["speed", "axFrac", "slipFactor", "vLat", "yawRate", "slipDeg"]) {
        if (typeof p[k] !== "number" || !Number.isFinite(p[k])) {
          bad = { i, k, v: p[k], speed: p.speed };
          break;
        }
      }
      if (bad) break;
    }
    A.clearInput();
    return { minSpeed, bad, final: A.physState() };
  });
  expect(r.bad, r.bad ? `NaN/non-finite at step ${r.bad.i}: ${r.bad.k}=${r.bad.v}` : "")
    .toBeNull();
  expect(r.minSpeed).toBeLessThan(5);
  expect(r.final.axFrac).toBeGreaterThanOrEqual(0);
  expect(r.final.axFrac).toBeLessThanOrEqual(1);
});
