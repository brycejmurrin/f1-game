// @ts-check
// Hot-path contract for the leftover PERF-FINDINGS allocation:
// updateCar used to pass a fresh object literal to each of the eight
// AiDrive decision helpers every physics step (~8 × 20 cars × 60 Hz).
// Those call sites now fill reused scratches. This spec wraps the helpers
// and asserts the ctx object identity is stable across steps — the same
// proof pairContact/_ct already has as a source comment.
//
// AiDrive is a script-level `const` (not window.AiDrive). A later classic
// <script> can still bind it; page.evaluate cannot. The wrap is injected
// that way so we do not grow game.js with a test-only hook.
import { test, expect } from "../helpers/fixtures.js";

test("AiDrive ctx scratches stay reused across physics steps", async ({ loadTrack, page }) => {
  // DECLARE THE BUDGET, and declare it honestly. loadTrack boots a full race
  // (22 cars, a built circuit) before the 180 steps run: 33 s on an idle dev box
  // (llvmpipe), 126-132 s on the same box under load, 132-177 s on a CI runner
  // (Pages #2048, both attempts). The old 120_000 sat UNDER the change-aware
  // gate's 180 s per-test rate, so tools/ci/select-specs.mjs kept selecting this
  // spec into a gate where its own budget killed it: the deploy failed twice at
  // "Test timeout of 120000ms exceeded". Above the gate it is excluded by name
  // and runs in the `driving` group, which is where a race-fixture spec belongs.
  test.setTimeout(300_000);
  // ...and SPEND less of it: headless BEFORE the build, via the fixture. The
  // render loop was already off for the 180 steps below, but the build wait
  // and the countdown ran under a full-scale SwiftShader race, which is where
  // the 126-177 s above went. Measured alone on this box: 86 s -> 23 s.
  await loadTrack("monza", "day", "dry", { headless: true });
  await page.addScriptTag({
    content: "window.__AiDrive = AiDrive;",
  });

  const r = await page.evaluate(() => {
    const A = window.__AiDrive;
    if (!A) return { ok: false, reason: "AiDrive not bindable from classic script" };
    const names = [
      "wantBoost", "otShouldFire", "brakeDecision", "wantX",
      "adaptLane", "otPull", "defendPull", "isBoxed",
    ];
    const first = Object.create(null);
    const mismatch = Object.create(null);
    const calls = Object.create(null);
    const orig = Object.create(null);
    const wrapped = Object.create(null);
    for (const n of names) {
      orig[n] = A[n];
      A[n] = wrapped[n] = function () {
        const ctx = n === "otShouldFire" ? arguments[2]
          : n === "adaptLane" ? arguments[1]
          : arguments[0];
        calls[n] = (calls[n] || 0) + 1;
        if (ctx && typeof ctx === "object") {
          if (!first[n]) first[n] = ctx;
          else if (first[n] !== ctx) mismatch[n] = true;
        }
        return orig[n].apply(this, arguments);
      };
    }
    // SAME-RUN REFERENCE: 180 UNWRAPPED steps first, timed on this machine,
    // this load, this build. The wrapped block is then judged as a RATIO of
    // it rather than against a wall-clock literal — the old `< 15_000 ms`
    // measured SwiftShader and the runner's load as much as the code, and a
    // literal that must survive a loaded CI box is too loose to catch a real
    // per-step regression on an idle one.
    for (const n of names) A[n] = orig[n];
    const r0 = performance.now();
    for (let i = 0; i < 180; i++) window.__apex.step(1 / 60, 1);
    const refMs = performance.now() - r0;
    for (const n of names) A[n] = wrapped[n];
    const t0 = performance.now();
    for (let i = 0; i < 180; i++) window.__apex.step(1 / 60, 1);
    const ms = performance.now() - t0;
    for (const n of names) A[n] = orig[n];

    let nCars = 0, finite = true;
    for (let i = 0; i < 24; i++) {
      const c = window.__apex.carAt(i);
      if (!c) break;
      nCars++;
      if (![c.s, c.x, c.speed].every((v) => typeof v === "number" && Number.isFinite(v))) {
        finite = false;
      }
    }
    const always = ["isBoxed", "brakeDecision", "adaptLane"];
    const reused = always.filter((n) => (calls[n] || 0) >= 2 && !mismatch[n]);
    return {
      ok: true, calls, mismatch, ms, refMs, nCars, finite, reused,
      alwaysFired: always.every((n) => (calls[n] || 0) >= 2),
    };
  });

  console.log("[physics-hotpath] result:", JSON.stringify(r));
  console.log("[physics-hotpath] 180-step wall time:", r.ms?.toFixed(1), "ms  (unwrapped reference:", r.refMs?.toFixed(1), "ms)");
  console.log("[physics-hotpath] nCars:", r.nCars, "  allFinite:", r.finite);
  console.log("[physics-hotpath] calls:", JSON.stringify(r.calls));
  console.log("[physics-hotpath] mismatch:", JSON.stringify(r.mismatch));
  console.log("[physics-hotpath] reused:", JSON.stringify(r.reused));

  expect(r.ok, r.reason || "wrap failed").toBe(true);
  expect(r.finite).toBe(true);
  expect(r.nCars).toBeGreaterThan(8);
  expect(r.alwaysFired).toBe(true);
  expect(r.reused).toEqual(["isBoxed", "brakeDecision", "adaptLane"]);
  expect(r.mismatch).toEqual({});
  // 180 headless steps of the field — a hang is the failure, not SwiftShader ms.
  // Judged against the unwrapped 180 steps timed in the SAME evaluate: eight
  // wrapper frames per helper call is a small constant factor over the physics
  // itself, so 4x is generous headroom for the wrap and still an order of
  // magnitude under any real stall. The 250 ms term is timer noise, not a
  // machine budget: when the reference block is a few milliseconds a ratio
  // alone would fail on scheduling jitter.
  expect(r.refMs).toBeGreaterThan(0);
  expect(r.ms).toBeLessThan(4 * r.refMs + 250);
  // Situational helpers must not allocate if they fired more than once.
  for (const n of ["wantBoost", "otShouldFire", "wantX", "otPull", "defendPull"]) {
    if ((r.calls[n] || 0) >= 2) expect(r.mismatch[n], n).toBeUndefined();
  }
});
