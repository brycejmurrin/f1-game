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

test("arc-bucket traffic scan matches full-field on a seeded 22-car pack", async ({ loadTrack, page }) => {
  test.setTimeout(300_000);
  await loadTrack("monza", "day", "dry", { headless: true });
  const r = await page.evaluate(() => {
    const C = window.Collide;
    if (!C || typeof C.fillArcBuckets !== "function" || typeof C.forArcNear !== "function") {
      return { ok: false, reason: "Collide.fillArcBuckets/forArcNear missing" };
    }
    const L = 6200, BACK = 72, MIN_GAP = 2.8, BW = 2.2, TW = 4, W = 34;
    function mulberry32(a) {
      return function () {
        a |= 0; a = a + 0x6D2B79F5 | 0;
        let t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
      };
    }
    const rnd = mulberry32(20261006);
    const ranked = [];
    for (let i = 0; i < 22; i++) {
      const prog = rnd() * L, x = (rnd() - 0.5) * 14;
      ranked.push({ id: i, prog, _snapProg: prog, x, _snapX: x, speed: 55, finished: false, retired: false, passFailOf: null, passFailT: 0 });
    }
    ranked[0].prog = ranked[0]._snapProg = 2; ranked[0].x = ranked[0]._snapX = 0;
    ranked[1].prog = ranked[1]._snapProg = L - 3; ranked[1].x = ranked[1]._snapX = 0.4;
    ranked[2].prog = ranked[2]._snapProg = 2 + L; ranked[2].x = ranked[2]._snapX = -1.1;
    ranked[3].prog = ranked[3]._snapProg = 2 - 70; ranked[3].x = ranked[3]._snapX = 0.15;
    ranked[4].finished = true;
    for (let i = 5; i < 22; i++) {
      const p = 400 + i * 200;
      ranked[i].prog = ranked[i]._snapProg = p;
      ranked[i].x = ranked[i]._snapX = (i % 3) - 1;
    }
    ranked[6].prog = ranked[6]._snapProg = ranked[5].prog + 20;
    function fullScan(c) {
      const REJ = Math.max(34.1, BACK + 0.1);
      let roomL = 12 + c.x, roomR = 12 - c.x, nearbyN = 0, sep = 0;
      let blocker = null, blockerGap = Infinity, towCar = null, towGap = Infinity, chaser = null, chaserGap = Infinity;
      for (let i = 0; i < ranked.length; i++) {
        const o = ranked[i];
        if (o === c || o.finished) continue;
        let dprog = o._snapProg - c.prog;
        if (!Number.isFinite(dprog)) continue;
        const ad = dprog < 0 ? -dprog : dprog;
        if (ad > REJ && ad < L - REJ) continue;
        dprog = ((dprog + L / 2) % L + L) % L - L / 2;
        if (dprog < -BACK || dprog > 34) continue;
        const dx = o._snapX - c.x, adp = dprog < 0 ? -dprog : dprog;
        if (adp < 5.5) {
          if (dx >= 0) roomR = Math.min(roomR, Math.abs(dx) - 1.0);
          else roomL = Math.min(roomL, Math.abs(dx) - 1.0);
        }
        if (adp < 6.5) {
          nearbyN++;
          const deficit = MIN_GAP - (dx < 0 ? -dx : dx);
          if (deficit > 0) sep += (dx <= 0 ? 1 : -1) * deficit * (1 - adp / 6.5);
        }
        if (dprog > 0.5 && dprog < blockerGap && Math.abs(dx) < BW) { blocker = o; blockerGap = dprog; }
        if (dprog > 0.5 && dprog < towGap && Math.abs(dx) < TW) { towCar = o; towGap = dprog; }
        if (dprog < -0.5 && -dprog < chaserGap && Math.abs(dx) < 3) { chaser = o; chaserGap = -dprog; }
      }
      return { roomL: Math.max(0, roomL), roomR: Math.max(0, roomR), nearbyN, sep, blocker, towCar, chaser };
    }
    function bucketScan(c) {
      const REJ = Math.max(34.1, BACK + 0.1);
      let roomL = 12 + c.x, roomR = 12 - c.x, nearbyN = 0, sep = 0;
      let blocker = null, blockerGap = Infinity, towCar = null, towGap = Infinity, chaser = null, chaserGap = Infinity;
      C.forArcNear(c, L, REJ, function (o) {
        if (o.finished) return;
        let dprog = o._snapProg - c.prog;
        if (!Number.isFinite(dprog)) return;
        const ad = dprog < 0 ? -dprog : dprog;
        if (ad > REJ && ad < L - REJ) return;
        dprog = ((dprog + L / 2) % L + L) % L - L / 2;
        if (dprog < -BACK || dprog > 34) return;
        const dx = o._snapX - c.x, adp = dprog < 0 ? -dprog : dprog;
        if (adp < 5.5) {
          if (dx >= 0) roomR = Math.min(roomR, Math.abs(dx) - 1.0);
          else roomL = Math.min(roomL, Math.abs(dx) - 1.0);
        }
        if (adp < 6.5) {
          nearbyN++;
          const deficit = MIN_GAP - (dx < 0 ? -dx : dx);
          if (deficit > 0) sep += (dx <= 0 ? 1 : -1) * deficit * (1 - adp / 6.5);
        }
        if (dprog > 0.5 && dprog < blockerGap && Math.abs(dx) < BW) { blocker = o; blockerGap = dprog; }
        if (dprog > 0.5 && dprog < towGap && Math.abs(dx) < TW) { towCar = o; towGap = dprog; }
        if (dprog < -0.5 && -dprog < chaserGap && Math.abs(dx) < 3) { chaser = o; chaserGap = -dprog; }
      }, function (car) { return car.prog; });
      return { roomL: Math.max(0, roomL), roomR: Math.max(0, roomR), nearbyN, sep, blocker, towCar, chaser };
    }
    C.fillArcBuckets(ranked, L, W, function (c) { return c._snapProg; });
    const mismatches = [];
    for (const c of ranked) {
      if (c.finished) continue;
      const a = fullScan(c), b = bucketScan(c);
      for (const k of ["roomL", "roomR", "nearbyN", "sep", "blocker", "towCar", "chaser"]) {
        if (a[k] !== b[k] && !(typeof a[k] === "number" && Math.abs(a[k] - b[k]) < 1e-9)) mismatches.push(c.id + "." + k);
      }
    }
    const ego = bucketScan(ranked[0]);
    return {
      ok: true, mismatches, nCars: ranked.length,
      wrapAlong: ego.nearbyN >= 2, wrapChaser: ego.chaser === ranked[1],
    };
  });
  expect(r.ok, r.reason || "eval failed").toBe(true);
  expect(r.mismatches).toEqual([]);
  expect(r.nCars).toBe(22);
  expect(r.wrapAlong).toBe(true);
  expect(r.wrapChaser).toBe(true);
});
