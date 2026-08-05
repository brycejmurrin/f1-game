/* perf-governor.test.mjs — the adaptive-resolution governor must not chase a
 * number it cannot move, and must not throw away a step that is genuinely
 * working.
 *
 * WHY THIS EXISTS. The governor used to compare every frame's EMA against a
 * hardcoded 19 ms, which silently assumed "frame interval" is a proxy for
 * "frame cost" — true only while the display is what you are competing
 * with. Under an externally imposed cap (iOS Low Power Mode throttles
 * requestAnimationFrame to 30 fps; so does a 30 Hz panel, or a browser
 * background throttle) every frame lands at ~33.3 ms no matter how cheap it
 * is to draw, and the old governor downscaled to the render-resolution floor
 * and shed every optional feature within ~27 s of race start — for nothing,
 * since the clock was capped externally and had nothing to do with render
 * cost. See docs/research/PLATFORM-INPUT-NOTES.md §9c for the full
 * derivation and the simulated timeline this fixes.
 *
 * Two fixes, tested here against the real tick() logic (not a re-implementation):
 *   A. `_floorMs` — the budget is DERIVED from the observed floor of frame
 *      intervals instead of hardcoded, so a capped device is judged against
 *      its own achievable rate, not against 60 fps it can never reach.
 *   B. `_pendingVerify` — every downscale/tier-shed step is provisional: if
 *      the NEXT evaluation shows no meaningful improvement, the step is
 *      reverted rather than repeated, which is what turned one bad guess
 *      into "runs to the bottom of the ladder and stays there".
 *
 * Run: node --test tests/perf-governor.test.mjs   (npm run test:tooling-fast)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = fs.readFileSync(path.join(ROOT, "js/game/perf.js"), "utf8");

// A fake renderer: setRenderScale clamps to [0.5, 1] and reports whether the
// scale actually changed (the real gfx contract PerfGov.tick() relies on to
// decide whether it spent a cooldown for nothing).
function makeGov() {
  globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  globalThis.window = { __APEX_BUILD: 1 };
  const PerfGov = eval(SRC + ";PerfGov");
  let scale = 1;
  const gfx = {
    isMobile: true,
    getRenderScale: () => scale,
    setRenderScale: (s) => {
      s = Math.max(0.5, Math.min(1, s));
      if (s === scale) return false;
      scale = s; return true;
    },
  };
  PerfGov.init(gfx);
  return { PerfGov, scale: () => scale };
}

function feed(PerfGov, dtFn, n) {
  for (let i = 0; i < n; i++) PerfGov.tick(dtFn(i));
}

test("a device capped at 30 fps (Low Power Mode) settles at full quality, not the floor", () => {
  // Every frame lands at exactly 33.3 ms no matter what the governor tries —
  // the signature of an EXTERNAL cap, as opposed to real GPU load. Old
  // behaviour: downscale to 0.5, shed all 4 feature tiers, stay there for the
  // session (see the simulated timeline in the research doc). Fixed
  // behaviour: the derived budget rises to meet the cap.
  const { PerfGov, scale } = makeGov();
  feed(PerfGov, () => 33.3, 1200);
  assert.equal(scale(), 1, "resolution must not be pinned down by a capped clock");
  assert.equal(PerfGov.tier(), 0, "no feature should be shed for a cost that was never real");
  // The derived budget converged on the cap, which is the mechanism, not
  // just the outcome — worth pinning directly.
  assert.ok(Math.abs(PerfGov.floorMs() - 33.3) < 0.5, `floorMs should converge near 33.3, got ${PerfGov.floorMs()}`);
});

test("a healthy 60 Hz device never enters the degrade branches", () => {
  const { PerfGov, scale } = makeGov();
  feed(PerfGov, (i) => 15 + (i % 3), 1200);   // small jitter around vsync, never a real miss
  assert.equal(scale(), 1);
  assert.equal(PerfGov.tier(), 0);
});

test("genuine GPU-bound slowness (scale actually helps) settles at a lower scale and stays there", () => {
  // dt is COUPLED to render scale here — cutting resolution really does cut
  // frame time, the opposite of the capped-clock case above. A light frame
  // every 20th tick (scene-complexity variance) is what distinguishes real
  // overload from a hard cap: a cap shows that same dt on EVERY frame, an
  // overloaded-but-real device still has cheap moments.
  const { PerfGov, scale } = makeGov();
  feed(PerfGov, (i) => (i % 20 === 0 ? 10 : 30 * scale()), 1200);
  assert.ok(scale() < 1, "a genuinely GPU-bound device must still be able to downscale");
  assert.equal(PerfGov.tier(), 0, "resolution alone accounts for the whole deficit here");
});

test("a reverted downscale does not repeat forever (the causal check actually halts)", () => {
  // Same inputs as the capped-30fps case, sampled at the FIRST decision point
  // instead of after 1200 ticks: at least one downscale attempt is expected
  // (the derived budget has not caught up yet at frame ~45) and it must be
  // reverted rather than compounding into a second cut before the budget
  // catches up.
  const { PerfGov, scale } = makeGov();
  let minScale = 1;
  for (let i = 0; i < 200; i++) {
    PerfGov.tick(33.3);
    minScale = Math.min(minScale, scale());
  }
  assert.ok(minScale < 1, "the derived budget has not converged yet at frame 200 — a first attempt is expected");
  assert.equal(scale(), 1, "but it must have been reverted well before frame 200, not left down");
});

// Resolution is pinned at the floor (setRenderScale always reports "no
// change") so every degrade decision falls straight through to the
// feature-shedding branch — isolating tier verification from scale
// verification, which the tests above already cover.
function makeGovAtFloor() {
  globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  globalThis.window = { __APEX_BUILD: 1 };
  const PerfGov = eval(SRC + ";PerfGov");
  const gfx = { isMobile: true, getRenderScale: () => 0.5, setRenderScale: () => false };
  PerfGov.init(gfx);
  return PerfGov;
}

test("feature tiers are shed only when they actually help, same as resolution", () => {
  const helped = makeGovAtFloor();
  feed(helped, (i) => (i % 20 === 0 ? 12 : 30 - helped.tier() * 4), 2000);
  assert.equal(helped.tier(), 4, "each tier genuinely cut cost here, so shedding should run to the floor");

  const useless = makeGovAtFloor();
  feed(useless, () => 33.3, 2000);   // capped clock — no tier can touch an externally fixed frame time
  assert.equal(useless.tier(), 0, "shedding features cannot fix a capped clock either");
});

test("floorMs is exposed for live inspection (__apex.renderScale())", () => {
  const { PerfGov } = makeGov();
  assert.equal(typeof PerfGov.floorMs, "function");
  assert.equal(PerfGov.floorMs(), 16.7, "starts at the same 60 fps default fpsEMA does");
});
