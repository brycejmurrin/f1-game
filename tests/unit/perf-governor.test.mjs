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
 * Run: node --test tests/unit/perf-governor.test.mjs   (npm run test:tooling-fast)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { seedLogGlobal } from "../helpers/seed-log.mjs";
import { seedStoreGlobal } from "../helpers/seed-store.mjs";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
seedLogGlobal();
seedStoreGlobal();   // perf.js persists the sentinel through GameStore.store's raw lane
const SRC = fs.readFileSync(path.join(ROOT, "js/perf/governor.js"), "utf8");

test("software GL UI readback deferral preserves the Document receiver", async (t) => {
  function readbackDeferred(visible, softwareGL = true) {
    const document = {
      getElementById(id) {
        assert.equal(this, document, "native Document methods require their receiver");
        return { hidden: id !== visible };
      },
    };
    const context = vm.createContext({
      document,
      Log: { info() {} },
      GameStore: { store: { raw: () => null } },
    });
    const governor = vm.runInContext(SRC + ";PerfGov", context, { filename: absSrc("js/perf/governor.js") });
    governor.init({ backendState: () => ({ softwareGL }) });
    return governor.softwareGlUiReadbackDefer();
  }
  for (const cover of ["loading", "carsetup", "race-settings"]) {
    await t.test(cover + " defers readback on software GL", () => {
      assert.equal(readbackDeferred(cover), true);
    });
    await t.test(cover + " does not defer readback on hardware GL", () => {
      assert.equal(readbackDeferred(cover, false), false);
    });
  }
  await t.test("hidden covers do not defer readback", () => {
    assert.equal(readbackDeferred(null), false);
  });
});

test("software GL readback defer covers countdown and race-entry handoff", () => {
  function defer(softwareGL, cover) {
    const document = {
      getElementById(id) {
        assert.equal(this, document, "native Document methods require their receiver");
        return { hidden: true };
      },
    };
    const context = vm.createContext({
      document,
      Log: { info() {} },
      GameStore: { store: { raw: () => null } },
      RaceEntryProfile: { stallHandoffCover: () => cover },
    });
    const governor = vm.runInContext(SRC + ";PerfGov", context, { filename: absSrc("js/perf/governor.js") });
    governor.init({ backendState: () => ({ softwareGL }) });
    return governor.softwareGlUiReadbackDefer();
  }
  assert.equal(defer(true, true), true, "stallHandoffCover defers pack readback on software GL");
  assert.equal(defer(true, false), false, "a closed handoff with hidden sheets does not defer");
  assert.equal(defer(false, true), false, "hardware keeps the readback");
});

function raceScaleGov({ softwareGL = true, shed = false, webdriver = false, scale0 = 1 } = {}) {
  const sets = [];
  let scale = scale0;
  const gfx = {
    backendState: () => ({ softwareGL, softAdapter: false }),
    getRenderScale: () => scale,
    setRenderScale: (s) => { sets.push(s); scale = s; return true; },
  };
  const context = vm.createContext({
    Log: { info() {} },
    GameStore: { store: { raw: () => null } },
    localStorage: { getItem: (k) => (k === "apex26.swRaceShed" ? (shed ? "1" : null) : null) },
    navigator: { webdriver, userAgent: webdriver ? "" : "player" },
    PostCommon: {
      softwareRaceShed: (gl, nav, knob) => {
        if (!gl) return false;
        if (knob === "1") return true;
        if (knob === "0") return false;
        if (nav && nav.webdriver) return false;
        return true;
      },
    },
  });
  const governor = vm.runInContext(SRC + ";PerfGov", context, { filename: absSrc("js/perf/governor.js") });
  return { governor, gfx, sets, scale: () => scale };
}

test("software race scale is chosen once and webdriver does not resize", () => {
  const { governor, gfx, sets } = raceScaleGov({ webdriver: true, shed: false });
  assert.equal(governor.chooseSoftwareRaceScale(gfx), 1);
  assert.deepEqual(sets, []);
  assert.equal(governor.chooseSoftwareRaceScale(gfx), 1);
  assert.deepEqual(sets, [], "the second choice keeps the scale");
  assert.equal(governor.softwareRaceScaleChosen(), 1);
  governor.init(gfx);
  governor.softwareGaragePreviewBegin(gfx);
  governor.softwareGaragePreviewEnd(gfx);
  assert.deepEqual(sets, [], "garage preview must not resize after the race scale is chosen");
});

test("a live software race picks 0.5 once before the canvas is resized again", () => {
  const { governor, gfx, sets, scale } = raceScaleGov({ shed: true, webdriver: true });
  assert.equal(governor.chooseSoftwareRaceScale(gfx), 0.5);
  assert.deepEqual(sets, [0.5]);
  assert.equal(scale(), 0.5);
  assert.equal(governor.chooseSoftwareRaceScale(gfx), 0.5);
  assert.deepEqual(sets, [0.5], "one setRenderScale for the race");
  governor.init(gfx);
  governor.softwareGaragePreviewBegin(gfx);
  governor.softwareGaragePreviewEnd(gfx);
  assert.deepEqual(sets, [0.5]);
});

test("hardware does not choose a software race scale", () => {
  const { governor, gfx, sets } = raceScaleGov({ softwareGL: false, shed: true });
  assert.equal(governor.chooseSoftwareRaceScale(gfx), null);
  assert.deepEqual(sets, []);
  assert.equal(governor.softwareRaceScaleChosen(), null);
});

// A fake renderer mirroring GLX.setRenderScale (js/render/glx/glx.js) EXACTLY,
// dead zone and all.
// It used to test `s === scale`, which is NOT the shipped contract: the real
// setRenderScale rejects any change smaller than 0.02. That gap hid two live
// defects for as long as this file has existed, because the governor's float
// step chain lands on 0.5000000000000001 going down and 0.9800000000000004
// coming back up — both inside the real dead zone, neither inside `s === scale`.
// With the exact contract in place these tests fail on the old code, which is
// how they should have caught it. Do not simplify this back.
const SCALE_EPS = 0.02;
function makeGov() {
  globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  globalThis.window = { __APEX_BUILD: 1 };
  const PerfGov = eval(SRC.replace("strikes: () =>", `
    testPending: () => _pendingVerify,
    testSetPending: (pending) => { _pendingVerify = pending; },
    strikes: () =>`) + ";PerfGov");
  let scale = 1;
  const gfx = {
    isMobile: true,
    getRenderScale: () => scale,
    setRenderScale: (s) => {
      s = Math.max(0.5, Math.min(1, s));
      if (Math.abs(s - scale) < SCALE_EPS) return false;   // GLX.setRenderScale, verbatim
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
  // 0.5000000000000001, NOT 0.5 — the value the real down-chain actually reaches
  // (1 -0.1-> ... -> 0.5000000000000001). Pinning an exact 0.5 here made the
  // "scale floor" case unreachable in the very test written to cover it.
  const gfx = { isMobile: true, getRenderScale: () => 0.5000000000000001, setRenderScale: () => false };
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

test("inactive early features do not prevent a later post reduction from helping", () => {
  for (const helpfulTier of [2, 3, 4]) {
    const gov = makeGovAtFloor();
    gov.setAutoRes(false);
    // No artificial fast frames to keep the floor gate open. Env/SSR/shadows
    // may already be off; only the named later rung changes this workload.
    feed(gov, (i) => (gov.autoTier() >= helpfulTier ? 18 : 26) + [0, 1, -1, 0][i % 4], 600);
    assert.equal(gov.autoTier(), helpfulTier);
    assert.equal(gov.autoShed(), helpfulTier);
    assert.equal(gov.tierFutile(), false);
    assert.equal(gov.phoneSlowLatch(), true, "a verified phone shed latches");
    // Headroom used to restore one rung; on phones the slow latch keeps the
    // verified shed (BrowserStack 2026-10-22: restore to autoTier 0 re-lit the
    // GPU-bound look-post stack).
    feed(gov, () => 16.7, 120);
    assert.equal(gov.autoTier(), helpfulTier, "phone slow latch blocks feature restore");
    assert.equal(gov.autoShed(), helpfulTier, "measured cuts stay while latched");
  }
});

test("an exhausted feature probe rolls back the entire trial on a capped clock", () => {
  const gov = makeGovAtFloor();
  gov.setAutoRes(false);
  const seen = new Set();
  feed(gov, () => { seen.add(gov.autoTier()); return 1000 / 30; }, 600);
  assert.deepEqual([...seen], [0, 1, 2, 3, 4]);
  assert.equal(gov.autoTier(), 0);
  assert.equal(gov.autoShed(), 0);
});

test("a futility verdict from the previous race does not carry into the next (sentinelArm)", () => {
  // A dry race on a capped clock latches _tierFutile; the next race may be WET, where tier 2 now
  // keeps the wet-road SSR march (game.js _ssrTier), so a carried latch would block that shed.
  const gov = makeGovAtFloor();
  gov.setAutoRes(false);
  feed(gov, () => 1000 / 30, 600);
  assert.equal(gov.tierFutile(), true, "precondition: the capped clock latched the ladder");
  gov.sentinelArm(true);
  assert.equal(gov.tierFutile(), false, "race start clears the tier verdict");
  assert.equal(gov.scaleFutile(), false, "race start clears the scale verdict");
  gov.sentinelArm(false);
});

test("the two futility latches are inspectable, and start clear", () => {
  // They can each park a lever for the rest of the session, and until
  // 2026-09-10 neither had an accessor — so answering "why did this device shed
  // nothing?" from a live diagnostic payload meant re-deriving governor state
  // from source by hand. __apex.renderScale() carries them now.
  const { PerfGov } = makeGov();
  assert.equal(typeof PerfGov.scaleFutile, "function");
  assert.equal(typeof PerfGov.tierFutile, "function");
  assert.equal(PerfGov.scaleFutile(), false);
  assert.equal(PerfGov.tierFutile(), false);
});

test("a sustained-slow device now sheds past the first rung (§2au discriminator)", () => {
  // docs/notes/PERF-FINDINGS.md §2au, from a live iPhone capture: Suzuka,
  // 32.2 fps, scale already at the 0.5 mobile floor, tier 0 — nothing optional
  // shed on a device missing half its frames.
  //
  // THIS TEST WAS DELIBERATELY REWRITTEN (2026-10-21, the §2au fix;
  // docs/notes/PERF-IPHONE-AUDIT-2026-10-21.md §3). It used to pin the defect
  // itself — "a sustained-slow device still stops after a successful first
  // rung", peak autoShed <= 1 — under a header that said IT PINS THE
  // BEHAVIOUR, IT DOES NOT BLESS IT, and named the discriminator to build:
  // an external cap is indifferent to render scale and a fill-bound frame is
  // not, which is exactly what _pendingVerify measures on every scale step.
  //
  // That discriminator is now implemented in js/perf/governor.js: a verified
  // step (a down-step the EMA felt, or an up-step it refused) latches
  // _computeBound, the derived floor rewinds to the race's observed minimum
  // and may then only creep at FLOOR_UP_A_BOUND, and a latched step must
  // clear the held threshold by DEGRADE_OVER twice — so the ladder keeps
  // shedding on a compute-bound device while a capped clock, which never
  // produces the evidence, is governed exactly as before (the Low Power Mode
  // pin at the top of this file). A frame below the race's best cadence (a
  // cheap moment) taints the episode and the latch cannot engage.
  //
  // What this pins now, over the same swept model as the old test: the SCALE
  // ladder completes (the pre-fix governor parked this device at scale 0.9,
  // EMA 100.6 ms — 10 fps — for the whole run: peak autoShed was 0, so the
  // old <= 1 assertion passed vacuously), the EMA reaches the captured
  // cadence, computeBound() is observed, and at least one tier rung is shed
  // at every rung worth — two at the small gains, where more rungs are
  // needed. Rungs 3-4 at the large gains land past this window's 4000 frames
  // (each tier step's verify + confirmation spans hundreds of 31 ms frames);
  // what is pinned is that the ladder is OPEN, not that it finishes here.
  const AT_HALF = 1000 / 32.2;   // 31.06 ms, the captured frame time
  for (const gain of [0.04, 0.08, 0.15, 0.25]) {
    const { PerfGov, scale } = makeGov();
    // Start where the phone starts — the 0.5 mobile scale — through the same
    // fake renderer, so the 0.02 dead zone and the 0.5 clamp both still apply.
    PerfGov.setUserTier(0);
    let peak = 0, minScale = 1, minEMA = Infinity, boundSeen = false;
    for (let i = 0; i < 4000; i++) {
      const cost = AT_HALF * Math.pow(scale() / 0.5, 2) * Math.pow(1 - gain, PerfGov.autoShed());
      PerfGov.tick(cost);
      peak = Math.max(peak, PerfGov.autoShed());
      minScale = Math.min(minScale, scale());
      minEMA = Math.min(minEMA, PerfGov.fpsEMA());
      boundSeen = boundSeen || PerfGov.computeBound();
    }
    assert.ok(boundSeen,
      `a rung worth ${(gain * 100).toFixed(0)}%: the scale-response evidence must latch computeBound`);
    assert.ok(minScale <= 0.5000000000000001,
      `a rung worth ${(gain * 100).toFixed(0)}%: the scale ladder must complete to the floor (pre-fix it parked at 0.9), got ${minScale}`);
    assert.ok(minEMA <= AT_HALF + 1,
      `a rung worth ${(gain * 100).toFixed(0)}%: the EMA must reach the captured cadence (pre-fix it sat at 100.6 ms), got ${minEMA}`);
    assert.ok(peak >= 1,
      `a rung worth ${(gain * 100).toFixed(0)}%: at least one tier rung must now be shed, got ${peak}`);
    if (gain <= 0.08) assert.ok(peak >= 2,
      `a rung worth ${(gain * 100).toFixed(0)}%: small rungs must buy a second ladder step, got ${peak}`);
  }
});

test("the adapted floor is what closes the ladder, not a latched-off lever", () => {
  // The distinction that the first diagnosis of §2au got wrong. _tierFutile does
  // latch on a shed that buys nothing, but it is CLEARED again by the restore
  // branch — so a latch is never the durable reason a device stops shedding.
  // The durable reason is floorMs having become the device's own frame time,
  // which makes degradeAt unreachable.
  const { PerfGov } = makeGov();
  const dt = 1000 / 32.2;
  for (let i = 0; i < 400; i++) PerfGov.tick(dt);
  assert.ok(Math.abs(PerfGov.floorMs() - dt) < 1,
    `floorMs should converge on the observed cost, got ${PerfGov.floorMs()}`);
  // floor + DEGRADE_OVER is now above the EMA, which is the whole finding.
  assert.ok(PerfGov.fpsEMA() < PerfGov.floorMs() + 2.3,
    "the EMA sits inside the degrade threshold, so the ladder can never step again");
});

// ── the restore path, which had no test and therefore had no floor under it ──

test("RESTORE IS REACHABLE AT ALL: the predicate is satisfiable for some input", () => {
  // This is the test whose absence let a dead branch ship. The old condition was
  // `_frameEMA < _floorMs - RESTORE_UNDER` with RESTORE_UNDER = 4.2, i.e. the
  // EMA had to get 4.2 ms BELOW the floor. But `_floorMs` chases dt down at
  // alpha 0.3 and up at 0.02 while `_frameEMA` moves at 0.1 both ways, so from
  // their shared 16.7 ms start `_floorMs <= _frameEMA` is an invariant — and the
  // branch could never be entered, on any device, for any frame sequence.
  // Simulated over 60 million frames before the fix: zero firings, closest
  // approach exactly 4.2000 ms.
  //
  // Asserted as a PROPERTY of the constants rather than by replaying frames, so
  // it keeps holding if the smoothing rates are retuned: restore must trigger
  // at or above the floor, because below it is unreachable by construction.
  const src = SRC;
  const degradeOver = Number(/DEGRADE_OVER\s*=\s*([\d.]+)/.exec(src)[1]);
  const restoreWithin = Number(/RESTORE_WITHIN\s*=\s*([\d.]+)/.exec(src)[1]);
  assert.ok(/const degradeAt = _floorMs \+ DEGRADE_OVER, restoreAt = _floorMs \+ RESTORE_WITHIN;/.test(src),
    "restore must be measured UPWARD from the floor — downward is unreachable");
  assert.ok(restoreWithin > 0, `RESTORE_WITHIN must be above the floor, got ${restoreWithin}`);
  assert.ok(restoreWithin < degradeOver,
    `restore (${restoreWithin}) must be tighter than degrade (${degradeOver}) or the two branches overlap and it will hunt`);
});

test("a device that degraded RECOVERS once the frames come good again", () => {
  // The behavioural half. A heavy stint drives the scale down; then perfect
  // 60 Hz frames must bring it back. Before the fix this ended at 0.9 forever:
  // one bad minute — a heavy circuit start, a rain squall, a thermal dip — cost
  // the player sharpness for the whole session, and the crash sentinel's
  // pre-drop could never climb back either.
  // dt is COUPLED to scale, exactly as in the GPU-bound test above — a cut has
  // to genuinely buy frame time or the causal check correctly reverts it and
  // there is nothing to restore FROM.
  const { PerfGov, scale } = makeGov();
  feed(PerfGov, (i) => (i % 20 === 0 ? 10 : 30 * scale()), 1200);
  const degraded = scale();
  assert.ok(degraded < 1, `the heavy stint must degrade something first, got ${degraded}`);

  // The load lifts: the device is now comfortably inside its budget at ANY
  // scale, so the coupling no longer bites and frames arrive at a clean 60 Hz.
  feed(PerfGov, () => 16.7, 9000);                  // 150 s of flawless frames
  assert.ok(scale() > degraded,
    `scale must climb back after sustained clean frames — degraded to ${degraded}, ended at ${scale()}`);
  assert.equal(scale(), 1, "sustained perfect frames should restore all the way to full resolution");
});

test("restore does NOT fire while frames are still missing", () => {
  // The other side of the same coin: a restore that triggers under load would
  // reintroduce the ~1 Hz oscillation the governor's header describes, from the
  // opposite direction. Frames stay bad, so the scale must never climb.
  const { PerfGov, scale } = makeGov();
  feed(PerfGov, (i) => (i % 20 === 0 ? 10 : 30 * scale()), 1200);
  const degraded = scale();
  feed(PerfGov, (i) => (i % 20 === 0 ? 10 : 30 * scale()), 6000);   // still heavy
  assert.ok(scale() <= degraded,
    `scale must not climb while frames are still missing — was ${degraded}, ended at ${scale()}`);
});

// ── Pinning the resolution must not disable the whole governor ───────────────
// REGRESSION. `RESOLUTION: LOW/MED/HIGH` (js/game.js, applyResMode) calls
// setAutoRes(false) so the governor stops fighting the pinned scale. tick()
// opened with `if (!_autoRes) return;`, which took stage 2 — feature shedding —
// down with it: a player who pinned the resolution got no adaptation at all for
// the session, on a control shown to EVERYONE, desktop included. The whole
// suite above passed throughout, because every case here runs with _autoRes
// left at its default true. That is what made the bug invisible.

// A device that is genuinely overloaded no matter what the scale is: dt is NOT
// coupled to scale (the user pinned it, so the governor cannot move it anyway),
// but IS coupled to tier — shedding features genuinely helps. The cheap frame
// every 20th tick keeps this distinguishable from an external cap, the same way
// the GPU-bound case above does.
function makeGovPinned(scaleAt) {
  globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  globalThis.window = { __APEX_BUILD: 1 };
  const PerfGov = eval(SRC + ";PerfGov");
  let scale = scaleAt;
  const gfx = {
    isMobile: true,
    getRenderScale: () => scale,
    setRenderScale: (s) => { s = Math.max(0.5, Math.min(1, s)); if (s === scale) return false; scale = s; return true; },
  };
  PerfGov.init(gfx);
  PerfGov.setAutoRes(false);          // what applyResMode() does for any pinned mode
  return { PerfGov, scale: () => scale };
}

// govHold(true) in js/agent/apex.js. A two-capture comparison spec needs the
// SAME tier at both captures; with the scale pinned the ladder is the only
// lever, so an overloaded runner sheds between them (Metal run 3469: 0 -> 2 -> 4
// inside one image-grade test). The hold must stop both directions and must
// not touch the scale lever or the accessors; releasing it hands the ladder
// straight back.
test("setTierHold(true) pins the ladder on an overloaded pinned box, and releases cleanly", () => {
  const { PerfGov } = makeGovPinned(1);
  PerfGov.setTierHold(true);
  assert.equal(PerfGov.tierHold(), true);
  feed(PerfGov, (i) => (i % 20 === 0 ? 12 : 30 - PerfGov.tier() * 4), 3000);
  assert.equal(PerfGov.tier(), 0, "held: an overloaded frame must not shed a rung");
  assert.equal(PerfGov.autoShed(), 0);
  PerfGov.setTierHold(false);
  feed(PerfGov, (i) => (i % 20 === 0 ? 12 : 30 - PerfGov.tier() * 4), 3000);
  assert.ok(PerfGov.tier() > 0, `released: the same load must shed again — tier ${PerfGov.tier()}`);
  // Held at a shed rung, headroom must not restore it either: the hold means
  // "whatever tier you are on, stay there", in both directions.
  const held = PerfGov.tier();
  PerfGov.setTierHold(true);
  feed(PerfGov, () => 12, 3000);
  assert.equal(PerfGov.tier(), held, "held: sustained headroom must not restore a rung");
});

test("a PINNED resolution still sheds features when the device is overloaded", () => {
  const { PerfGov } = makeGovPinned(1);
  feed(PerfGov, (i) => (i % 20 === 0 ? 12 : 30 - PerfGov.tier() * 4), 3000);
  assert.ok(PerfGov.tier() > 0,
    `stage 2 must keep working with the scale pinned — tier stayed at ${PerfGov.tier()}`);
});

test("a PINNED resolution never moves the scale the user chose", () => {
  // The other half of the contract: shedding is restored, but the governor must
  // still keep its hands off the pinned scale in BOTH directions — degrade and
  // restore. RESOLUTION: HIGH on a struggling device must stay at 1.0.
  const { PerfGov, scale } = makeGovPinned(1);
  feed(PerfGov, (i) => (i % 20 === 0 ? 12 : 30 - PerfGov.tier() * 4), 3000);
  assert.equal(scale(), 1, "a pinned scale must never be degraded by the governor");

  // ...and a pinned LOW scale must not be "restored" upward either.
  const low = makeGovPinned(0.5);
  feed(low.PerfGov, () => 16.7, 9000);              // 150 s of flawless frames
  assert.equal(low.scale(), 0.5, "a pinned scale must never be restored upward either");
});

test("pinning the resolution drops a pending SCALE verify, not a pending TIER one", () => {
  // setAutoRes() is called from a click handler, which can land one evaluation
  // after the governor took a provisional downscale. Without dropping that
  // pending {kind:"scale"} step, the next evaluation "reverts" it by calling
  // setRenderScale(prev) — writing over the scale the user just pinned.
  const { PerfGov, scale } = makeGov();
  feed(PerfGov, (i) => (i % 20 === 0 ? 10 : 30 * scale()), 400);   // provoke a real downscale
  assert.ok(scale() < 1, "precondition: the governor must have taken a scale step to leave pending");

  PerfGov.setAutoRes(false);
  const pinned = scale();
  feed(PerfGov, () => 16.7, 3000);
  assert.equal(scale(), pinned,
    `no revert may fire after the user pins — pinned at ${pinned}, ended at ${scale()}`);
});

test("the crash-sentinel floor still cannot be defeated by pinning the resolution", () => {
  // The floor is the one thing no user control may lift. Pinning must not
  // become a back door into it.
  globalThis.localStorage = {
    _s: { "apex26.crashStrikes": "2", "apex26.crashStrikesBuild": "1" },
    getItem(k) { return this._s[k] ?? null; }, setItem(k, v) { this._s[k] = String(v); },
    removeItem(k) { delete this._s[k]; },
  };
  globalThis.window = { __APEX_BUILD: 1 };
  const PerfGov = eval(SRC + ";PerfGov");
  let scale = 1;
  PerfGov.init({ isMobile: true, getRenderScale: () => scale, setRenderScale: (s) => { scale = s; return true; } });
  PerfGov.setAutoRes(false);
  assert.equal(PerfGov.tierFloor(), 4, "two strikes must pre-degrade to tier 4");
  feed(PerfGov, () => 16.7, 9000);            // flawless frames: maximum pressure to restore
  assert.equal(PerfGov.tier(), 4, "the sentinel floor must hold even with the resolution pinned");
});

test("two crash strikes cap the backend's DPR at 1 at init; one strike or a desktop leaves it alone (#1641)", () => {
  const boot = (strikes, isMobile) => {
    globalThis.localStorage = {
      _s: { "apex26.crashStrikes": String(strikes), "apex26.crashStrikesBuild": "1" },
      getItem(k) { return this._s[k] ?? null; }, setItem(k, v) { this._s[k] = String(v); },
      removeItem(k) { delete this._s[k]; },
    };
    globalThis.window = { __APEX_BUILD: 1 };
    const PerfGov = eval(SRC + ";PerfGov");
    const caps = [];
    PerfGov.init({ isMobile, getRenderScale: () => 1, setRenderScale: () => false, capDpr: (n) => { caps.push(n); return true; } });
    return caps;
  };
  assert.deepEqual(boot(2, true), [1], "two strikes on a phone cap DPR at 1");
  assert.deepEqual(boot(3, true), [1]);
  assert.deepEqual(boot(1, true), [], "one strike sheds features but keeps DPR");
  assert.deepEqual(boot(0, true), []);
  assert.deepEqual(boot(2, false), [], "a desktop never enters safe mode");
});

test("TLX capDpr only ever lowers the cap and re-sizes (#1641)", () => {
  const tlx = fs.readFileSync(path.join(ROOT, "js/render/three/tlx.js"), "utf8");
  assert.match(tlx, /let DPR_CAP = mobileTier \? 1\.5 : 2;/, "the cap is mutable");
  assert.match(tlx, /capDpr\(n\) \{\s*if \(!\(n >= 1\) \|\| n >= DPR_CAP\) return false;\s*DPR_CAP = n; resizeNow\(\); return true;/);
});

// ── The GRAPHICS preset's user tier (js/perf/quality-preset.js) ────────────────
// tier() folds three terms with max(): the crash-sentinel floor, the user's
// preset floor, and the governor's own live tier. That single expression IS the
// interaction rule — a manual choice sets the FLOOR of degradation, never the
// ceiling — so these tests pin the rule, not the plumbing.

test("a fresh phone defaults to GRAPHICS MEDIUM; legacy HIGH is phone-capped to HIGH", () => {
  const qsrc = fs.readFileSync(path.join(ROOT, "js/perf/quality-preset.js"), "utf8");
  const GfxQuality = eval(qsrc + ";GfxQuality");
  GameStore.store.rawSet("apex26.gfxHigh", null);
  assert.equal(GfxQuality.defaultId(true, { weak: false }), "medium",
    "a fresh capable phone must shed env probe + lamp shadow/SSR until the player opts up");
  assert.equal(GfxQuality.defaultId(true, { weak: true }), "low",
    "a weak phone (iPhone 13-class) defaults to LOW");
  GameStore.store.rawSet("apex26.gfxHigh", "1");
  assert.equal(GfxQuality.defaultId(true), "high",
    "the legacy high-memory opt-in is capped to HIGH on phones (ULTRA is unavailable)");
  GameStore.store.rawSet("apex26.gfxHigh", null);
  assert.equal(GfxQuality.defaultId(false), "high", "desktop default stays HIGH");
  assert.equal(GfxQuality.maxId(true), "high", "phone ceiling is HIGH");
  assert.equal(GfxQuality.capId("ultra", true), "high", "ULTRA clamps to HIGH on phones");
  assert.equal(GfxQuality.capId("ultra", false), "ultra", "desktop keeps ULTRA");
});

test("a user tier sheds at least that much, live, without touching the render path", () => {
  const { PerfGov } = makeGov();
  assert.equal(PerfGov.tier(), 0, "precondition: nothing shed on a fresh healthy device");
  PerfGov.setUserTier(2);
  assert.equal(PerfGov.tier(), 2, "GRAPHICS: MEDIUM must shed the env probe + lamp shadow/SSR immediately");
  PerfGov.setUserTier(0);
  assert.equal(PerfGov.tier(), 0, "and back, with no reload");
});

test("a user tier is a FLOOR, so the governor may still shed BELOW it but never above", () => {
  // The governor is free to go further than the user asked (the device is
  // struggling and that is measured evidence); it must never come back above
  // the user's floor just because it found headroom.
  const gov = makeGovAtFloor();
  gov.setUserTier(1);
  feed(gov, (i) => (i % 20 === 0 ? 12 : 30 - gov.tier() * 4), 2000);
  assert.ok(gov.tier() > 1, `the governor must be able to shed past the user's floor, got ${gov.tier()}`);

  const healthy = makeGovAtFloor();
  healthy.setUserTier(3);
  feed(healthy, () => 16.7, 9000);              // 150 s of flawless frames
  assert.equal(healthy.tier(), 3, "sustained headroom must NOT restore above the user's floor");
});

test("ULTRA cannot defeat the crash-sentinel floor", () => {
  // The one thing no user control may lift. A phone that died twice starts at
  // tier 4; asking for ULTRA (userTier 0) must change nothing.
  globalThis.localStorage = {
    _s: { "apex26.crashStrikes": "2", "apex26.crashStrikesBuild": "1" },
    getItem(k) { return this._s[k] ?? null; }, setItem(k, v) { this._s[k] = String(v); },
    removeItem(k) { delete this._s[k]; },
  };
  globalThis.window = { __APEX_BUILD: 1 };
  const PerfGov = eval(SRC + ";PerfGov");
  let scale = 1;
  PerfGov.init({ isMobile: true, getRenderScale: () => scale, setRenderScale: (s) => { scale = s; return true; } });
  assert.equal(PerfGov.tier(), 4, "precondition: two strikes pre-degrade to tier 4");
  PerfGov.setUserTier(0);
  assert.equal(PerfGov.tier(), 4, "a preset must not be a back door into the safe-mode floor");
  feed(PerfGov, () => 16.7, 9000);
  assert.equal(PerfGov.tier(), 4, "and it must still hold after sustained clean frames");
});

test("a bad preset cannot invent a tier above the ladder", () => {
  // Every gate in the render path is `tier() >= N`, so an unclamped value would
  // satisfy all of them at once and shed passes that have no tier.
  const { PerfGov } = makeGov();
  PerfGov.setUserTier(99);
  assert.equal(PerfGov.userTier(), 4, "clamped to the top of the ladder");
  PerfGov.setUserTier(-3);
  assert.equal(PerfGov.userTier(), 0, "clamped at the bottom");
});

test("autoTier ignores the GRAPHICS user floor; lookPostShed pins look post on LOW", () => {
  // GRAPHICS: LOW pins userTier at 4. That must still shed env/SSR/shadows via
  // tier(). autoTier() stays free of the user floor (wet-road SSR + tuner notes),
  // but lookPostShed() is true on LOW so bloom/SSAO/god-rays/contact/lampVol
  // actually go — otherwise a healthy LOW keeps the full post stack and loses
  // to MEDIUM on tile GPUs (iPhone WebGPU BrowserStack 2026-10-21).
  const { PerfGov } = makeGov();
  assert.equal(typeof PerfGov.autoTier, "function", "PerfGov.autoTier must exist");
  assert.equal(typeof PerfGov.lookPostShed, "function", "PerfGov.lookPostShed must exist");
  assert.equal(PerfGov.autoTier(), 0, "healthy device, no user floor: autoTier is 0");
  assert.equal(PerfGov.lookPostShed(), false, "healthy device: look post live");
  PerfGov.setUserTier(4);
  assert.equal(PerfGov.tier(), 4, "GRAPHICS: LOW still floors the cost ladder");
  assert.equal(PerfGov.autoTier(), 0, "GRAPHICS: LOW must not pin autoTier (wet SSR / tuner)");
  assert.equal(PerfGov.lookPostShed(), true, "GRAPHICS: LOW must shed look-defining post");
  PerfGov.setUserTier(2);
  assert.equal(PerfGov.tier(), 2);
  assert.equal(PerfGov.autoTier(), 0, "GRAPHICS: MEDIUM must not pin autoTier either");
  assert.equal(PerfGov.lookPostShed(), false, "GRAPHICS: MEDIUM leaves look post to the governor");
});

test("a phone that measured slow keeps its shed on GRAPHICS: MEDIUM (slow latch)", () => {
  // Pre-latch, restore walked autoShed back to 0 once EMA looked calm — and on
  // a fill-bound iPhone that re-lit the full look-post stack (BrowserStack
  // 2026-10-22). After a verified shed the phone slow latch must hold.
  // Raising GRAPHICS (setUserTier to a lower rung) clears the latch so the
  // player can opt back in; that path is covered below.
  const PerfGov = makeGovAtFloor();
  PerfGov.setUserTier(2);                    // GRAPHICS: MEDIUM
  assert.equal(PerfGov.autoShed(), 0, "a preset alone is not a measured shed");
  assert.equal(PerfGov.phoneSlowLatch(), false);

  feed(PerfGov, () => 34 - PerfGov.autoShed() * 6, 3000);
  assert.ok(PerfGov.autoShed() >= 1, "a device missing frames must still shed by evidence");
  assert.ok(PerfGov.autoTier() >= 3,
    `the ladder must still climb ABOVE the preset floor on a struggling device (got ${PerfGov.autoTier()})`);
  assert.equal(PerfGov.phoneSlowLatch(), true, "verified shed latches on a phone");
  // Settle the EMA under the restore gate before snapshotting — early headroom
  // ticks can still shed while the old EMA is high; the latch only blocks restore.
  feed(PerfGov, () => 8, 500);
  const latchedTier = PerfGov.autoTier();
  const latchedShed = PerfGov.autoShed();
  assert.ok(latchedShed >= 1, "shed still held after EMA settles");

  feed(PerfGov, () => 8, 40000);
  assert.equal(PerfGov.phoneSlowLatch(), true, "headroom does not clear the phone slow latch");
  assert.equal(PerfGov.autoShed(), latchedShed, "measured cuts are not restored while latched");
  assert.equal(PerfGov.autoTier(), latchedTier, "effects are not promoted back");
  assert.equal(PerfGov.tier(), Math.max(2, latchedTier), "MEDIUM floor still applies");

  // Player raises to HIGH: latch clears, device may prove itself again.
  PerfGov.setUserTier(1);
  assert.equal(PerfGov.phoneSlowLatch(), false, "raising GRAPHICS clears the phone slow latch");
});

test("GRAPHICS: LOW can still shed by evidence — the ladder is not short-circuited by its own floor", () => {
  // The degrade branch used to gate on `Math.max(_perfTier, _floorTier()) < 4`.
  // On LOW the preset sets _userTier = 4, so _floorTier() is 4 and that guard
  // was FALSE on the first evaluation: _perfTier and _autoShed could never
  // leave 0 for the whole session. autoTier() and autoShed() exclude the user
  // floor on purpose, so they returned 0 too — and bloom, SSAO, god-rays,
  // contact shadows and per-chunk lamps (their only consumers) became
  // unsheddable on the cheapest preset, however badly the device was missing
  // frames. The MEDIUM test above could not see it: at _userTier 2 the guard
  // is true and the ladder runs.
  const PerfGov = makeGovAtFloor();          // scale lever exhausted: the ladder is the only lever
  PerfGov.setUserTier(4);                    // GRAPHICS: LOW
  assert.equal(PerfGov.autoShed(), 0, "a preset alone is not a measured shed");
  assert.equal(PerfGov.autoTier(), 0, "…and LOW alone is not measured evidence either");

  // Genuinely too slow, and genuinely cheaper for each rung shed.
  feed(PerfGov, () => 34 - PerfGov.autoShed() * 6, 3000);
  assert.ok(PerfGov.autoShed() >= 1,
    `LOW must shed on evidence like every other preset (autoShed ${PerfGov.autoShed()})`);
  assert.equal(PerfGov.autoTier(), 4,
    `the step starts from the floor, so LOW reaches the tier-4 consumers in one felt move (got ${PerfGov.autoTier()})`);
  assert.ok(PerfGov.tier() <= 4, "the ladder never invents a rung above 4");
});

test("LOW keeps measured sheds under the phone slow latch (look post stays off)", () => {
  const gov = makeGovAtFloor();
  gov.setUserTier(4);
  feed(gov, () => 34 - gov.autoShed() * 6, 3000);
  assert.equal(gov.autoTier(), 4);
  assert.ok(gov.autoShed() > 0);
  assert.equal(gov.phoneSlowLatch(), true);
  feed(gov, () => 8, 40000);
  assert.equal(gov.tier(), 4, "LOW still disables its preset features");
  assert.ok(gov.autoShed() > 0, "phone slow latch blocks measured-shed recovery");
  assert.equal(gov.autoTier(), 4, "autoTier stays at the verified shed");
  assert.equal(gov.lookPostShed(), true, "look post stays shed on LOW");
});

test("phone slow latch blocks LOW restore; raising GRAPHICS clears it", () => {
  const gov = makeGovAtFloor();
  gov.setUserTier(4);
  feed(gov, () => 34 - gov.autoShed() * 6, 3000);
  assert.equal(gov.phoneSlowLatch(), true);
  const shed = gov.autoShed();
  for (let i = 0; i < 2000; i++) gov.tick(8);
  assert.equal(gov.autoShed(), shed, "headroom never clears a latched phone shed");
  // Raise to HIGH: latch clears so the device can prove the higher preset.
  gov.setUserTier(1);
  assert.equal(gov.phoneSlowLatch(), false, "raising GRAPHICS clears the latch");
});

test("switching to LOW after several measured cuts keeps the phone slow latch", () => {
  const gov = makeGovAtFloor();
  feed(gov, i => i % 20 === 0 ? 12 : 30 - gov.tier() * 4, 2000);
  assert.equal(gov.autoTier(), 4);
  const shed = gov.autoShed();
  assert.ok(shed > 1, "several measured cuts preceded the preset switch");
  assert.equal(gov.phoneSlowLatch(), true);
  gov.setUserTier(4);   // same or lower quality: latch stays
  assert.equal(gov.phoneSlowLatch(), true, "dropping to LOW does not clear the latch");
  for (let i = 0; i < 2000; i++) gov.tick(8);
  assert.equal(gov.autoShed(), shed, "latched cuts are not released by headroom");
  assert.equal(gov.autoTier(), 4);
  assert.equal(gov.tier(), 4, "the user's LOW floor remains");
});

test("the opening window keeps the frames every EMA in this file forgets", () => {
  // "It lags for the first few seconds and then runs fine" is a report about
  // frames that are gone before anyone can read perf(): _frameEMA at alpha 0.1
  // has absorbed a 400 ms frame within a second, and _floorMs is designed to
  // chase the FLOOR, so neither can ever show a player what they just felt.
  const { PerfGov } = makeGov();
  PerfGov.sentinelArm(true);
  PerfGov.tick(420);                          // the stall being reported
  feed(PerfGov, () => 16.7, 400);             // and then it runs fine
  const w = PerfGov.openWindow();
  assert.equal(w.maxMs, 420, "the worst opening frame must survive, spike cap and all");
  assert.ok(w.slow >= 1, "and be counted as over budget");
  assert.ok(PerfGov.fpsEMA() < 20,
    "meanwhile the EMA has forgotten it entirely — which is the whole point");
  // A new race starts a new window; last race's stall is not this race's.
  PerfGov.sentinelArm(true);
  assert.deepEqual(PerfGov.openWindow(), { frames: 0, maxMs: 0, slow: 0 });
});

test("autoTier still honours the crash-sentinel floor and a measured shed", () => {
  globalThis.localStorage = {
    _s: { "apex26.crashStrikes": "2", "apex26.crashStrikesBuild": "1" },
    getItem(k) { return this._s[k] ?? null; }, setItem(k, v) { this._s[k] = String(v); },
    removeItem(k) { delete this._s[k]; },
  };
  globalThis.window = { __APEX_BUILD: 1 };
  const PerfGov = eval(SRC + ";PerfGov");
  let scale = 1;
  PerfGov.init({ isMobile: true, getRenderScale: () => scale, setRenderScale: (s) => { scale = s; return true; } });
  assert.equal(PerfGov.autoTier(), 4, "two crash strikes must still shed look post");
  assert.equal(PerfGov.lookPostShed(), true, "crash floor sheds via lookPostShed too");
  PerfGov.setUserTier(0);
  assert.equal(PerfGov.autoTier(), 4, "ULTRA must not defeat the crash floor via autoTier either");
  assert.equal(PerfGov.lookPostShed(), true, "ULTRA must not defeat the crash floor via lookPostShed either");
});

test("wet-road reflections survive every user tier while overload and dry shedding remain independent", () => {
  const common = eval(fs.readFileSync(path.join(ROOT, "js/render/shared/post-common.js"), "utf8") + ";PostCommon");
  const opts = { unrelated: 42 };
  for (const [tier, quality] of [[0, 0], [1, 0], [2, 1], [3, 2], [4, 2]]) {
    common.roadReflection(opts, 1, 1.4, tier, 0);
    assert.equal(opts.reflect, 1.4, `wet user tier ${tier} retains scene reflections`);
    assert.equal(opts.ssrQuality, quality);
    assert.equal(opts.unrelated, 42, "existing per-frame options are preserved");
  }
  common.roadReflection(opts, 1, 1.4, 4, 4);
  assert.equal(opts.reflect, 0, "measured overload or crash floor can use the material fallback");
  common.roadReflection(opts, 1, 0, 4, 0);
  assert.equal(opts.reflect, 0, "WET MIRROR zero remains a true off switch");
  for (const tier of [0, 1, 2, 3, 4]) {
    common.roadReflection(opts, 0, 0.08, tier, 0);
    assert.equal(opts.reflect, tier >= 2 ? 0 : 0.08, `dry user tier ${tier} keeps its prior shedding`);
  }
  common.roadReflection(opts, 0.01, 0.08, 4, 0);
  assert.equal(opts.reflect, 0, "the dry/wet boundary remains unchanged");
  common.roadReflection(opts, 0.011, 0.08, 4, 0);
  assert.equal(opts.reflect, 0.08, "a damp road receives the reduced budget");
});

test("LOW wet-road reflection switches off and back on when a real governor cut is rolled back", (t) => {
  const gov = makeGovAtFloor();
  gov.setUserTier(4);
  const common = eval(fs.readFileSync(path.join(ROOT, "js/render/shared/post-common.js"), "utf8") + ";PostCommon");
  const opts = {}, transitions = [];
  let elapsedMs = 0;
  const capture = (frame) => {
    common.roadReflection(opts, 0.9, 0.9, gov.tier(), gov.autoTier());
    if (!transitions.length || transitions.at(-1).autoTier !== gov.autoTier()) {
      transitions.push({ frame, elapsedMs: Math.round(elapsedMs), tier: gov.tier(),
        autoTier: gov.autoTier(), autoShed: gov.autoShed(), reflect: opts.reflect,
        ssrQuality: opts.ssrQuality });
    }
  };
  capture(0);
  // A capped 30 Hz clock cannot improve when effects are shed. The genuine
  // tick/EMA/verify path must try the LOW cut, see no gain, then roll it back.
  // No private state setter forces either transition; dt drives the fake clock.
  for (let frame = 1; frame <= 600 && transitions.length < 3; frame++) {
    elapsedMs += 33.3;
    gov.tick(33.3);
    capture(frame);
  }
  t.diagnostic("LOW wet-road governor transitions: " + JSON.stringify(transitions));
  assert.deepEqual(transitions.map(s => s.autoTier), [0, 4, 0],
    "a measured LOW cut must actually be attempted and causally rolled back");
  assert.deepEqual(transitions.map(s => s.autoShed), [0, 1, 0]);
  assert.deepEqual(transitions.map(s => s.tier), [4, 4, 4], "the user never changes graphics quality");
  assert.deepEqual(transitions.map(s => s.ssrQuality), [2, 2, 2], "the LOW march budget stays selected");
  assert.deepEqual(transitions.map(s => s.reflect), [0.9, 0, 0.9],
    "current policy abruptly removes and restores SSR at fixed wetness and quality");
  assert.ok(transitions[2].elapsedMs > transitions[1].elapsedMs, "rollback follows a real verification window");
});

test("tier 2 sheds car-paint SSR independently of the wet-road quality policy", () => {
  // po.reflect = 0 is ALSO a dry session, so pairing uCarReflect to it would
  // kill car-paint SSR on every dry lap. The governor must pass a separate
  // opts.carReflect = 0 at tier ≥ 2, and both present() paths must honour it.
  const game = fs.readFileSync(path.join(ROOT, "js/game.js"), "utf8");
  const post = fs.readFileSync(path.join(ROOT, "js/render/glx/post.js"), "utf8");
  const tlx = fs.readFileSync(path.join(ROOT, "js/render/three/tlx-post.js"), "utf8");
  const wgx = fs.readFileSync(path.join(ROOT, "js/render/webgpu/wgx.js"), "utf8");
  assert.match(game, /PostCommon\.roadReflection\(po, frame\.wetness \|\| 0, _ssrPo, PerfGov\.tier\(\), PerfGov\.autoTier\(\),\s*_roadReflectionTransition,/);
  assert.match(game, /po\.carReflect = PerfGov\.tier\(\) >= 2 \? 0 : undefined/);
  assert.match(post, /opts && opts\.carReflect != null \? opts\.carReflect/);
  assert.match(tlx, /o\.carReflect != null \? o\.carReflect/);
  assert.match(wgx, /o\.carReflect != null \? o\.carReflect/);
  assert.match(SRC, /SSR march off \(dry sheens \+ car-paint; wet-road SSR survives\)/);
});

test("shadow box and shader fade share the same unset shadowRange fallback", () => {
  const game = fs.readFileSync(path.join(ROOT, "js/render/shared/shadow-pass.js"), "utf8");   // the sun box is sized in the shadow-pass seam
  const glx = fs.readFileSync(path.join(ROOT, "js/render/glx/glx.js"), "utf8");
  assert.match(game, /LT\.shadowRange != null \? LT\.shadowRange : 80/);
  assert.match(glx, /T && T\.shadowRange != null \? T\.shadowRange : 80\.0/);
  assert.doesNotMatch(game, /LT\.shadowRange \|\| 64/,
    "|| 64 disagreed with the shader's 80 fallback and treated a 0 knob as unset");
});

test("sun-shadow fade origin is yaw-invariant (eye XZ, look-target Y)", () => {
  // docs/PERF-FINDINGS.md 2026-08-15: fading from the look-biased box anchor
  // swept a 58% strength swing at 70 m on a pinned-eye yaw. The box stays
  // forward-biased (texel allocation); the fade must not.
  const lit = fs.readFileSync(path.join(ROOT, "js/render/glx/shaders/glsl-lit.js"), "utf8");
  const tsl = fs.readFileSync(path.join(ROOT, "js/render/three/tsl-lit.js"), "utf8");
  const wgsl = fs.readFileSync(path.join(ROOT, "js/render/webgpu/wgsl-chunks.js"), "utf8");
  assert.match(lit, /distance\(wpos,\s*vec3\(uEye\.x,\s*uShadowCtr\.y,\s*uEye\.z\)\)/);
  assert.match(tsl, /cameraPosition\.x[\s\S]{0,80}shadowCtr\.y[\s\S]{0,80}cameraPosition\.z/);
  assert.match(wgsl, /F\.eye\.x[\s\S]{0,60}F\.shadowCtr\.y[\s\S]{0,60}F\.eye\.z/);
});

test("TLX zeros sunShaft when bloom is shed, matching GLX doBloom gate", () => {
  const glx = fs.readFileSync(path.join(ROOT, "js/render/glx/post.js"), "utf8");
  const tlx = fs.readFileSync(path.join(ROOT, "js/render/three/tlx-post.js"), "utf8");
  assert.match(glx, /doBloom \? sunShaft \*/);
  assert.match(tlx, /haveBloom \? sunShaft \*/);
});

test("TLX wet analytic mirror and chrome MIRROR id 27 match GLX", () => {
  const lit = fs.readFileSync(path.join(ROOT, "js/render/glx/shaders/glsl-lit.js"), "utf8");
  const tsl = fs.readFileSync(path.join(ROOT, "js/render/three/tsl-lit.js"), "utf8");
  assert.match(lit, /wetSheen \* 0\.55/);
  assert.match(tsl, /wetSheen\.mul\(0\.55\)/);
  // The classification RANGE and every finish id in it must agree across the
  // backends, or a finish silently does nothing on two of the three renderers
  // and no other test would notice. Range grew to 31 with matte/brushed/pearl
  // and the carbon finish, 32 with the visor, 33 with the satin tyre sidewall;
  // 41-44: expanded finishes (holographic/velvet/hammered/anodized); mirror stays 27.
  assert.match(lit, /surfaceId <= 90/);   // 34-40: garage finishes (flake/candy/tinted/chameleon/forged/gunmetal/goldplate); 60/63/85: finishes (surface-id-parity counts their branches)
  assert.match(lit, /mirrorSurface = surfaceId == 27/);
  assert.match(tsl, /lessThanEqual\(90\.0\)/);
  assert.match(tsl, /surfaceId\.equal\(27\.0\)/);
  for (const id of [28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44]) {
    assert.match(lit, new RegExp("surfaceId == " + id), "GLX is missing surface " + id);
    assert.match(tsl, new RegExp("equal\\(" + id + "\\.0\\)"), "TLX is missing surface " + id);
  }
});

test("changing preset drops a pending TIER verify", () => {
  // Same class as the setAutoRes fix: _pendingVerify attributes the next EMA
  // delta to the governor's own last provisional step, so a user changing
  // quality one evaluation later would make it revert a step that was working.
  const gov = makeGovAtFloor();
  feed(gov, (i) => (i % 20 === 0 ? 12 : 30 - gov.tier() * 4), 200);   // provoke a tier step
  const before = gov.tier();
  gov.setUserTier(1);
  feed(gov, () => 16.7, 60);        // inside the cooldown: nothing may be reverted yet
  assert.ok(gov.tier() >= Math.max(before, 1),
    `no revert may fire across a user quality change — was ${before}, now ${gov.tier()}`);
});

test("a CPU-bound device sheds features instead of looping on a scale lever that cannot help", () => {
  // dt is genuinely slow and NOT coupled to render scale: the CPU-bound case,
  // where cutting resolution buys nothing. The cheap frame every 20th tick is
  // what separates this from the externally-capped case above (a cap shows the
  // SAME dt on every frame), so the governor is right to degrade here — the
  // question is WHICH lever it reaches for.
  //
  // Before the fix it reached for the only one that cannot help, forever: the
  // tier ladder lives in the `else` of "did setRenderScale move?", and
  // setRenderScale only refuses at the 0.5 clamp or its 0.02 dead zone, so
  // `stepped` was true on every attempt and the ladder was never evaluated —
  // while the causal check reverted each of those steps for buying nothing.
  // Net: a slow device that shed NOTHING. Measured on an iPhone at
  // Bahrain/night, build 1284: WebGL2 sat at scale 0.80 / tier 0 / 23 fps
  // while WebGPU and three.js, where the scale lever did bite, reached tier 2
  // and ran at 60 and 40 fps — the slowest backend shedding the least work.
  // dt responds to TIER but not to SCALE — the shape of a draw-call/CPU-bound
  // frame. Modelling a cost that responds to NEITHER would be the capped-clock
  // case above, where shedding nothing is the correct answer.
  // 1500 frames, not 1200: past 1200 the 10 ms sawtooth reads as ±1 ms at the
  // evaluation phase, and on the pre-floor-probe code a quantum probe kept on
  // that noise walked the scale 0.707 -> 0.607 -> 0.5 by frame 1329. The probe
  // must now buy back half the miss (A·W40), so the scale returns to 1.
  const { PerfGov, scale } = makeGov();
  feed(PerfGov, (i) => (i % 20 === 0 ? 10 : 43 - PerfGov.tier() * 7), 1500);
  assert.ok(PerfGov.tier() > 0,
    `the feature ladder must be reachable once the scale lever is proven useless, got tier ${PerfGov.tier()}`);
  // 1e-6: the 0.1-step chain ends at 0.5000000000000001, which `> 0.5` let pass.
  assert.ok(scale() > 0.5 + 1e-6,
    `and it must not have ground the resolution to the floor on the way there (${scale()})`);
});

test("raising the GRAPHICS preset releases a shed the preset itself caused", () => {
  // THE PHONE BUG. The degrade branch steps from _floorTier() so that every shed
  // is one the EMA can feel — a rung the floor already covers changes nothing.
  // But it used to STORE that result in _perfTier, which is exactly the
  // conflation setUserTier's own comment forbids: "shed because the device
  // struggled" became indistinguishable from "shed because the player asked".
  //
  // On a phone the default preset is MEDIUM (userTier 2), so the governor's
  // FIRST shed wrote _perfTier = max(0, 2) + 1 = 3. Raising to HIGH then set
  // userTier 0 and left _perfTier at 3, so tier() stayed 3 and SSR (WET MIRROR
  // + the dry sheens), PER-CHUNK LAMPS, lamp shadows and car shadows all stayed
  // off. Only a reload cleared it — and on mobile the one preset switch that
  // forces a reload is ULTRA, because it flips the mobileHigh bit. Hence the
  // report: "wet sheen and chunk lighting only work on ULTRA".
  const gov = makeGovAtFloor();
  gov.setUserTier(2);                       // GRAPHICS: MEDIUM, the mobile default
  assert.equal(gov.tier(), 2, "MEDIUM floors the ladder at 2");

  // Frames that genuinely get cheaper with each shed, so the causal check keeps
  // the steps rather than reverting them.
  feed(gov, (i) => (i % 20 === 0 ? 12 : 30 - gov.tier() * 4), 2000);
  assert.ok(gov.tier() > 2, "the governor should have shed at least one rung above the floor");
  const shedTier = gov.tier();

  gov.setUserTier(0);                       // the player raises to HIGH
  assert.ok(gov.tier() < shedTier,
    `raising the preset must release the part of the shed the preset caused (was ${shedTier}, now ${gov.tier()})`);
  assert.equal(gov.tier(), gov.autoTier(),
    "with no user floor left, tier() must equal the governor's own evidence");
  assert.ok(gov.tier() <= 2,
    `only the rungs the governor genuinely measured may survive, got ${gov.tier()}`);
});

test("clearStrikes / safeMode(false) releases a latched _perfTier", () => {
  // REGRESSION. clearStrikes used to zero the strike floor and leave `_perfTier`
  // where degrade had parked it — so __apex.safeMode(false) reported a lower
  // floor while tier() stayed high until reload. Mirror cleanRace()'s release.
  const { PerfGov } = makeGov();
  feed(PerfGov, (i) => (i % 20 === 0 ? 10 : 43 - PerfGov.tier() * 7), 1200);
  assert.ok(PerfGov.tier() > 0, "precondition: governor shed at least one feature rung");
  const before = PerfGov.tier();
  PerfGov.clearStrikes();
  assert.ok(PerfGov.tier() <= before,
    `clearStrikes must not leave tier() above the new floor (was ${before}, now ${PerfGov.tier()})`);
  assert.equal(PerfGov.tierFloor(), 0, "strikes cleared → floor 0");
});

test("a refused climb backs off: restore→verify-fail→revert must not cycle every cooldown", () => {
  // A device whose frame costs +2 ms ONLY at full scale (after a 5 s heavy
  // opening): the governor cuts once, the frames come good, it climbs back,
  // the climb fails verification and is reverted — and without a hold the
  // restore gate was true again one cooldown later, so the same refused climb
  // repeated every ~5 s for the whole race, each one a render-target
  // reallocation: 34 scale changes in 180 s on the old code, 10 with the
  // backoff (10 s, 20 s, 40 s, … 2 min between attempts).
  const { PerfGov, scale } = makeGov();
  let prev = scale(), changes = 0;
  for (let f = 0; f < 10800; f++) {
    PerfGov.tick(scale() >= 0.99 ? (f < 300 ? 22.7 : 18.7) : 16.7);
    if (scale() !== prev) changes++;
    prev = scale();
  }
  assert.ok(changes >= 2, `the harness must see at least one cut and one climb (${changes})`);
  assert.ok(changes <= 12, `refused climbs must back off, not repeat: ${changes} scale changes in 180 s`);
});

test("a device slow from frame 1 is degraded despite the cooldowns boot arms", () => {
  // 2026-09-02 bug hunt. setAutoRes/setUserTier each armed VERIFY_COOL (300
  // frames), and boot calls both before any race tick — ui-scale.js
  // applyResMode() on every load, gfx-quality.js applyLive() on every phone.
  // tick() only counts a cooldown down in a race, so the first 300 race frames
  // sat inside one. That is the ONLY window in which a fill-bound device that
  // is slow from lights-out is catchable: the EMA (alpha 0.1) outruns the
  // derived floor (0.02 upward) for roughly frames 10–95, then the floor
  // catches up and a steady 33 ms reads as an external cap for good. A phone
  // steady at 33 ms from frame 1 was therefore never degraded — not once, in
  // any race. Frame time is COUPLED to the scale here (a cut really helps),
  // so the first step is kept by the causal check, which is what separates
  // this from the capped-clock case at the top of the file.
  const { PerfGov, scale } = makeGov();
  PerfGov.setAutoRes(true);    // ui-scale.js applyResMode(), RESOLUTION: AUTO
  PerfGov.setUserTier(2);      // gfx-quality.js applyLive(), GRAPHICS: MEDIUM
  PerfGov.sentinelArm(true);   // race start (js/game.js startRace)
  feed(PerfGov, () => 33 * scale(), 180);
  assert.ok(scale() < 1, `must have shed within 3 s of lights-out, scale is ${scale()}`);
  feed(PerfGov, () => 33 * scale(), 1620);
  assert.ok(scale() < 1, `the cut must hold for the race (it bought real frame time), scale is ${scale()}`);
});

test("a GRAPHICS change made in the menu does not spend the next race's opening window", () => {
  // Same class as above, second door: between races `_live` is off, so a
  // menu-time preset change must not arm a cooldown that only the next race
  // can consume — and race start re-opens the window by resetting both
  // averages, so a race that begins slow after a healthy one is still caught.
  const { PerfGov, scale } = makeGov();
  PerfGov.sentinelArm(true);
  feed(PerfGov, () => 16.7, 900);            // a healthy first race
  PerfGov.sentinelArm(false);                // cleanRace / quitToMenu
  assert.equal(scale(), 1, "precondition: nothing shed in a healthy race");
  PerfGov.setUserTier(1);                    // the player changes GRAPHICS in the menu
  PerfGov.sentinelArm(true);                 // next race, slow from frame 1 on a heavier circuit
  feed(PerfGov, () => 33 * scale(), 180);
  assert.ok(scale() < 1, `the second race must shed within 3 s, scale is ${scale()}`);
});

test("a cooldown armed in the previous race cannot spend the next race's opening window", () => {
  // The menu-time case above starts clean. This is the other boundary: a
  // preset change while race one is live arms VERIFY_COOL, then the player
  // exits before tick() can count it down. sentinelArm(false) used to leave
  // that cooldown intact, so race two reset its averages but returned early
  // while the floor caught up with a slow-from-lights-out frame cost.
  const { PerfGov, scale } = makeGov();
  PerfGov.sentinelArm(true);
  feed(PerfGov, () => 16.7, 10);
  PerfGov.setUserTier(2);                    // live: arms the five-second cooldown
  PerfGov.sentinelArm(false);                // quit before it expires
  PerfGov.setUserTier(0);                    // next race asks for HIGH
  PerfGov.sentinelArm(true);
  feed(PerfGov, () => 16.7 + 10 * scale() * scale(), 180);
  assert.ok(scale() < 1,
    `race start must clear the old cooldown and degrade inside the opening window, scale is ${scale()}`);
});

test("a cooldown armed DURING a race still holds (only the pre-race arm is skipped)", () => {
  // The fix must not disarm the in-race meaning of the cooldown: a preset
  // change one evaluation into a race still buys the EMA time to settle
  // before stage 2 judges against it (the "changing preset drops a pending
  // TIER verify" contract above depends on that).
  const { PerfGov, scale } = makeGov();
  PerfGov.sentinelArm(true);
  feed(PerfGov, () => 16.7, 10);             // live: the first race tick has happened
  PerfGov.setUserTier(1);
  feed(PerfGov, () => 33 * scale(), 180);
  assert.equal(scale(), 1, "an in-race arm still cools the governor for VERIFY_COOL frames");
  // Once it has run out the steady-33 window is gone (the floor caught up — the
  // mechanism the first pin is about), so give the device the cheap moments a
  // genuinely overloaded one has and check the governor is merely late, not off.
  feed(PerfGov, (i) => (i % 20 === 0 ? 10 : 33 * scale()), 600);
  assert.ok(scale() < 1, "and it degrades once the in-race cooldown has run out");
});

/* ── THE BLIND SPOT BELOW 10 fps ────────────────────────────────────────────
 * `tick()` used to gate the EMA on a bare `if (dtMs < 100)`, to keep a tab
 * resume or a GC pause from yanking the scale. That is right for ONE frame and
 * catastrophic as a permanent filter: a device rendering slower than 10 fps
 * produces nothing BUT over-cap frames, so no sample ever reached `_frameEMA`,
 * which sat at the 16.7 ms sentinelArm() left it. The governor then read
 * 59.9 fps on a device managing 5, `degradeAt` was never crossed, and the
 * entire ladder — the thing that exists to rescue exactly this device — stayed
 * parked at tier 0 and scale 1 for the whole session.
 *
 * Measured in a live browser on 2026-09-02 (chrome-devtools MCP, bahrain, GLX,
 * software raster): 2 rAF frames in 17.5 s — 0.11 fps — while `__apex.perf()`
 * in that same page returned `{fps: 59.9, floorMs: 16.7, tier: 0, scale: 1}`.
 *
 * The fix keeps the spike filter for an ISOLATED over-cap frame and feeds a
 * CLAMPED sample once SPIKE_RUN of them arrive in a row. Both halves are
 * pinned here: without the run counter the first test fails, and without the
 * clamp the second one does. */

test("a device below 10 fps is SEEN by the governor, not filtered out of existence", () => {
  const { PerfGov } = makeGov();
  feed(PerfGov, () => 200, 1200);            // a steady 5 fps — every frame over the cap
  assert.ok(PerfGov.fpsEMA() > 150,
    `the EMA must reflect a device this slow, got ${PerfGov.fpsEMA()} ms — ` +
    `16.7 means every sample was discarded and the governor is blind`);
  // No ladder assertion HERE on purpose: a perfectly uniform interval is the
  // signature of an external cap, and refusing to degrade for one is the
  // deliberate behaviour the Low Power Mode test above pins. What this fix
  // changes is that the governor now has the data to make that judgement at
  // all, instead of judging a 5 fps device against a fabricated 59.9.
});

test("a GPU-bound device below 10 fps now steps the ladder (it could not be seen before)", () => {
  // dt COUPLED to scale, as in the genuine-overload test above, but in the
  // range the old `dtMs < 100` filter threw away wholesale. Cutting resolution
  // really does cut frame time here, so the verify step keeps the cut instead
  // of reverting it — and that is only reachable because the samples now
  // arrive AND carry magnitude (clamped at SLOW_CAP, not flattened to 100).
  const { PerfGov, scale } = makeGov();
  feed(PerfGov, (i) => (i % 20 === 0 ? 90 : 260 * scale()), 1500);
  assert.ok(scale() < 1 || PerfGov.tier() > 0,
    `a genuinely overloaded sub-10-fps device must shed something ` +
    `(scale ${scale()}, tier ${PerfGov.tier()}, ema ${PerfGov.fpsEMA().toFixed(1)})`);
});

test("one huge frame is still a spike, not evidence about the device", () => {
  // Tab resume / GC: a single 60 s gap surrounded by healthy frames. The EMA
  // must stay put, which is what the original cap was protecting and what a
  // naive Math.min(dtMs, cap) clamp would have broken.
  const { PerfGov, scale } = makeGov();
  feed(PerfGov, () => 16.7, 300);
  const before = PerfGov.fpsEMA();
  PerfGov.tick(60000);
  feed(PerfGov, () => 16.7, 5);
  assert.ok(Math.abs(PerfGov.fpsEMA() - before) < 1.0,
    `an isolated spike must not move the EMA (${before} -> ${PerfGov.fpsEMA()})`);
  assert.equal(scale(), 1, "and must not cost the player any quality");
  assert.equal(PerfGov.tier(), 0);
});

test("a run of slow frames feeds CLAMPED, so a 60 s gap can never enter as 60 000 ms", () => {
  const { PerfGov } = makeGov();
  feed(PerfGov, () => 8000, 600);            // absurdly slow, sustained
  assert.ok(PerfGov.fpsEMA() <= 1000 + 1e-6,
    `the clamp caps what a slow run can contribute, got ${PerfGov.fpsEMA()}`);
  assert.ok(PerfGov.fpsEMA() > 900,
    "and it should actually converge on the cap rather than hovering near 16.7");
});

/* THE BOOT TIER AND THE PRESET MUST AGREE ACROSS A RELOAD.
 *
 * `apex26.gfxHigh` is read at BOOT, before GfxQuality.init() runs: glx.js does
 * `MOBILE_TIER = IS_MOBILE && !_gfxHigh`, and post.js (MSAA) and the audio
 * engine read it too. It was written ONLY by set() — the player picking a
 * preset — so any path that lands a `gfxPreset` without going through set()
 * left the two disagreeing, and a phone whose UI reads MEDIUM booted on the
 * DESKTOP tier: full-size shadow maps and atlases, the desktop lamp budget,
 * 4x MSAA. Nothing re-synced it, so the frames never came back on their own.
 * A settings-file import is the reachable way in (settings-export writes the
 * allowlisted keys straight to the store). */
test("init() reconciles the boot tier with the resolved preset", () => {
  const qsrc = fs.readFileSync(path.join(ROOT, "js/perf/quality-preset.js"), "utf8");
  // init() reads the DEVICE CLASS off GLX.isMobile; without it _isMobile is
  // false and syncBootTier's first line returns, which is not the phone case
  // this test is about.
  globalThis.GLX = { isMobile: true };
  // The RAW lane is localStorage-backed and this harness has none, so without a
  // shim rawSet is a no-op and the reconciliation cannot be observed at all.
  const disk = new Map();
  globalThis.localStorage = {
    getItem: (k) => (disk.has(k) ? disk.get(k) : null),
    setItem: (k, v) => disk.set(k, String(v)),
    removeItem: (k) => disk.delete(k),
  };
  const GfxQuality = eval(qsrc + ";GfxQuality");

  // The divergent state: UI says MEDIUM, boot tier still says desktop.
  GameStore.store.set("gfxPreset", "medium");
  GameStore.store.rawSet("apex26.gfxHigh", "1");
  GfxQuality.init();
  assert.equal(GameStore.store.raw("apex26.gfxHigh"), "0",
    "a MEDIUM preset must not leave a phone booting on the desktop tier");

  // Phone ULTRA cap: a leftover gfxHigh=1 (legacy opt-in) with no stored
  // preset resolves to HIGH, which clears the boot bit rather than keeping
  // the desktop memory tier that ULTRA alone used to pin.
  GameStore.store.set("gfxPreset", null);
  GameStore.store.rawSet("apex26.gfxHigh", "1");
  GfxQuality.init();
  assert.equal(GfxQuality.current(), "high",
    "legacy gfxHigh on a phone lands on HIGH, not ULTRA");
  assert.equal(GameStore.store.raw("apex26.gfxHigh"), "0",
    "HIGH has mobileHigh false, so reconciliation clears the leftover boot bit");

  // A stored ULTRA preference is rewritten to HIGH on a phone.
  GameStore.store.set("gfxPreset", "ultra");
  GameStore.store.rawSet("apex26.gfxHigh", "1");
  GfxQuality.init();
  assert.equal(GfxQuality.current(), "high");
  assert.equal(GameStore.store.get("gfxPreset", null), "high",
    "the capped id must persist so ULTRA does not reappear next boot");
  assert.equal(GameStore.store.raw("apex26.gfxHigh"), "0");
  delete globalThis.GLX;
  delete globalThis.localStorage;
});

test("raw frame percentiles retain hitches and report discarded simulation time", () => {
  const { PerfGov: p } = makeGov();
  p.resetFrameStats();
  for (let i=0;i<100;i++) p.tick(i===99?180:16);
  p.recordSimulation(5,.12);
  const s=p.frameStats();
  assert.equal(s.frames,100);assert.equal(s.p50,16);assert.equal(s.p95,16);assert.equal(s.p99,180);
  assert.equal(s.physicsSteps,5);assert.equal(s.droppedSimS,.12);
  p.resetFrameStats();assert.equal(p.frameStats().frames,0);assert.equal(p.frameStats().droppedSimS,0);
});

test("the recovery hold is wall-clock: the same seconds at 60, 120 and 144 Hz", () => {
  // The holds, backoff and cooldowns were FRAME counts translated into seconds
  // at 60 fps: a 144 Hz display ran the 10 s recovery hold in ~4 s. A heavy
  // opening (frames cost 30 ms whatever the panel can show — a slow device is
  // slow) drives a cut; then clean frames at the panel's own rate must restore
  // full scale after the SAME wall time. (A 30 Hz panel is not in this list on
  // purpose: its clean 33 ms frames are indistinguishable from load, and the
  // externally-capped test above pins that it is never degraded in the first
  // place.)
  const restoreAfterS = (hz) => {
    const { PerfGov, scale } = makeGov();
    feed(PerfGov, (i) => (i % 20 === 0 ? 10 : 30 * scale()), 700);   // ~20 s of load
    assert.ok(scale() < 1, `${hz} Hz: the opening must cut something`);
    const dt = 1000 / hz;
    let frames = 0;
    while (scale() < 1 && frames < 60 * hz) { PerfGov.tick(dt); frames++; }
    assert.equal(scale(), 1, `${hz} Hz: clean frames must restore full scale`);
    return frames * dt / 1000;
  };
  const t60 = restoreAfterS(60), t120 = restoreAfterS(120), t144 = restoreAfterS(144);
  for (const [hz, t] of [[60, t60], [120, t120], [144, t144]])
    assert.ok(t >= 10, `${hz} Hz restored after ${t.toFixed(1)} s — the 10 s hold must run its course`);
  // What remains of the spread is the frame-counted part on purpose: the
  // 45-frame evaluation cadence and the 30/90-frame verify windows are EMA
  // settling spans (0.75 s / 1.5 s at 60 Hz, 0.3 s / 0.6 s at 144 Hz). The
  // frame-counted holds this replaced put 144 Hz at ~0.4x of 60 Hz here.
  const spread = Math.max(t60, t120, t144) - Math.min(t60, t120, t144);
  assert.ok(t144 > 0.8 * t60, `144 Hz must not recover in frames: ${t144.toFixed(1)} s vs ${t60.toFixed(1)} s at 60 Hz`);
  assert.ok(spread < 5, `restore times must agree in wall time: 60 Hz ${t60.toFixed(1)} s, 120 Hz ${t120.toFixed(1)} s, 144 Hz ${t144.toFixed(1)} s`);
});

test("a lap with one heavy section must not cost a render-target realloc every few seconds", () => {
  // THE REPORT THIS EXISTS FOR: "it lags every few seconds". Every circuit has
  // a stretch that costs more than the rest of the lap — a long straight with
  // the whole city in frame, a stadium section, the pit wall. The governor saw
  // that stretch as a device missing its budget and cut the render scale; it
  // saw the rest of the lap as headroom and climbed back, in several +0.06
  // steps; and the next lap did it again. EVERY ONE of those moves reallocates
  // the whole HDR/bloom/SSAO/god-ray target set (setRenderScale -> resize ->
  // createTargets), which this file's header already calls "a visible hitch".
  //
  // Measured against the real tick() with the code as it was: 30 reallocations
  // in a 300 s race, a median 8.1 s apart, clustering at 4.7 s — and the scale
  // ended back at 1.0, so every one of them bought exactly nothing. That is the
  // player's "every few seconds", generated by the component whose whole job is
  // to keep frames smooth.
  //
  // Two things fixed it and both are asserted here by their EFFECT, not their
  // internals: a cut that undoes a climb still on probation costs the same
  // doubling patience a refused climb does, and a cut REMEMBERS the scale that
  // missed, so the ladder stops climbing back into it.
  const { PerfGov, scale } = makeGov();
  let t = 0, reallocs = 0;
  const at = [];
  const mark = () => { at.push(t / 1000); reallocs++; };
  // Wrap the fake renderer's accept so an accepted change — the reallocation —
  // is what gets counted, not a request the 0.02 dead zone rejected.
  let last = scale();
  const step = () => {
    // 8 s of a 35 s lap costs 26 ms at full scale; the rest costs 13 ms. Both
    // are coupled to the scale, because resolution really does buy frame time
    // here — otherwise the causal check would (correctly) revert every cut and
    // there would be no cycle to measure.
    const dt = Math.max(16.7, ((t / 1000) % 35 < 8 ? 26 : 13) * scale());
    PerfGov.tick(dt);
    t += dt;
    if (scale() !== last) { last = scale(); mark(); }
  };
  while (t < 300000) step();

  assert.ok(reallocs <= 6,
    `a 300 s race on an ordinary circuit took ${reallocs} render-target reallocations (was 30): ${at.map((x) => x.toFixed(1)).join(", ")}`);
  // The SPACING is the symptom, not the count: six reallocations spread over
  // five minutes is invisible, six inside ten seconds is the complaint. Ignore
  // the opening pair — settling on a scale at the start of a race is the
  // governor doing its job — and require the rest to be minutes apart.
  const gaps = at.slice(1).map((x, i) => x - at[i]);
  const late = gaps.slice(1);
  assert.ok(late.every((g) => g > 20),
    `after the opening settle, no two reallocations may land within 20 s: gaps ${late.map((g) => g.toFixed(1)).join(", ")}`);
});

test("a genuine recovery still gets ALL its resolution back, ceiling or not", () => {
  // The other side of the ceiling. It is a measurement, so it has to expire:
  // a device that was slower for one stretch — a rain squall, a full field on
  // lap one, a thermal excursion that passed — must climb back to full, or the
  // fix above would just be the one-way door the RESTORE_UNDER post-mortem in
  // js/perf/governor.js's header was written to close. UNBROKEN headroom is the
  // discriminator: the quiet part of a lap is shorter than CLIMB_SURVIVE_MS,
  // a device that actually recovered stays quiet indefinitely.
  const { PerfGov, scale } = makeGov();
  feed(PerfGov, (i) => (i % 20 === 0 ? 10 : 30 * scale()), 1200);
  assert.ok(scale() < 1, "the heavy stint must cut something first");
  feed(PerfGov, () => 16.7, 6000);   // 100 s of flawless frames
  assert.equal(scale(), 1, "a device that genuinely recovered must reach full resolution again");
});

test("a device slow ONLY at full resolution settles, instead of re-probing it every few seconds", () => {
  // THE SHAPE THE FIRST ATTEMPT MISSED, and the commonest one there is: the
  // frame holds the budget at 0.9 and misses it at 1.0. This file's header
  // already names it — "a phone on GRAPHICS: HIGH ... sits right at that edge".
  //
  // The first version of the ceiling stored "nothing refused yet" as 1 and
  // tested it with `>= 1`, so a cut FROM full scale — which is where a first
  // cut almost always comes from — wrote a cap that was indistinguishable from
  // no cap at all. The ladder climbed straight back into the resolution that
  // had just missed, got cut, and repeated: byte-identical reallocation
  // timestamps to the unfixed governor. The sentinel is Infinity now, which no
  // cut and no refused climb can produce.
  //
  // Asserted on SPACING first, because that is the symptom. The unfixed
  // governor puts 7 reallocations in the opening minute (1.0, 11.3, 16.0,
  // 21.1, 31.3, 36.4, 56.4 s); a governor that keeps the measurement puts 3
  // (1.0, 31.6, 36.6 s) and then backs off to 30 s, 41 s, 81 s between probes.
  const { PerfGov, scale } = makeGov();
  let t = 0, last = scale();
  const at = [];
  while (t < 300000) {
    // 0.9 holds; 1.0 misses by 6 ms. Nothing else about the device changes.
    const dt = Math.max(16.7, scale() >= 0.99 ? 22.7 : 16.7);
    PerfGov.tick(dt); t += dt;
    if (scale() !== last) { last = scale(); at.push(t / 1000); }
  }
  const opening = at.filter((x) => x <= 60).length;
  assert.ok(opening <= 4,
    `the opening minute took ${opening} render-target reallocations (unfixed: 7) at ${at.filter((x) => x <= 60).map((x) => x.toFixed(1)).join(", ")} s`);
  assert.ok(at.length <= 10,
    `a 300 s race took ${at.length} reallocations (unfixed: 12): ${at.map((x) => x.toFixed(1)).join(", ")}`);
  // And the ceiling must actually bite: the scale that missed is never
  // re-entered until the probe window has run, so the first cut has to hold.
  assert.ok(at.length >= 2 && at[1] - at[0] > 25,
    `the cut must hold for the probe window before anything climbs again: first two at ${at.slice(0, 2).map((x) => x.toFixed(1)).join(", ")} s`);
});

test("a load that STEPS does not buy a reallocation every few seconds", () => {
  // THE "LAG SPIKE EVERY FEW SECONDS" CASE, measured 2026-09-22. Every scale
  // change reallocates all HDR/bloom targets, and on TLX tlx-post.js disposes
  // each texture and the depth texture first, so the node renderer rebuilds the
  // post chain's bind groups too — a visible hitch either way.
  //
  // Steady load never degrades, and neither does a smooth swing: _floorMs is
  // DERIVED, so it rises to meet sustained cost (simulated over ten minutes the
  // EMA came within 1.1 ms of the threshold and never crossed it). What the old
  // code could not handle was load that STEPS faster than the floor estimator
  // adapts — a restart with the field bunched, rain arriving, a pile-up
  // spawning debris. That produced 35-83 scale changes per ten minutes with
  // gaps of 1-5 s.
  //
  // The fix is a confirmation: a REPEAT cut needs the condition on two
  // consecutive evaluations. The first cut of a race stays prompt, because the
  // "slow from lights-out" window above is only about two evaluations wide.
  const { PerfGov, scale } = makeGov();
  PerfGov.sentinelArm(true);
  let prev = scale(), changes = 0;
  // Five heavy seconds in every thirty, for three minutes. The step is 6 ms:
  // real, but nothing like an overloaded device — exactly the case where the
  // governor should settle instead of hunting.
  for (let f = 0; f < 36000; f++) {
    const heavy = (f % 1800) < 300;
    PerfGov.tick(10 + 6 * scale() * scale() + (heavy ? 6 : 0));
    if (scale() !== prev) changes++;
    prev = scale();
  }
  // MEASURED BOTH SIDES over this exact window: 49 scale changes on the code
  // immediately before the fix, 15 after. The bound sits between them with room
  // either way — a three-minute window was tried first and rejected because the
  // pre-fix run scored 14 against a <= 14 bound, i.e. the test passed on the
  // broken code. A regression test that its own bug would not have failed is
  // worse than none.
  assert.ok(changes <= 25,
    `a 6 ms transient must not buy a reallocation every few seconds: ${changes} in 600 s`);
});

test("one short or negative frame sample (pause -> resume stamps) must not collapse the frame floor into a spurious step-down", () => {
  // bug-hunt 2026-10-09 4.1. setPaused(false) stamps lastFrame = performance.now() inside a
  // handler, so the NEXT rAF stamp can be earlier and tickBody feeds a raw dt <= 0. tick()
  // guarded only the history write: the sample still entered the EMA and the derived floor,
  // the floor dropped by (dt - floor) * FLOOR_DOWN_A, every healthy frame then read as
  // "over budget", and the governor cut the render scale (and then reverted it, leaving the
  // lever disabled for the session). Repro: scratchpad/gov-sim.cjs (setRenderScale(0.9) at frame 134).
  for (const bad of [-8, -5, -3, 0, NaN]) {
    const { PerfGov, scale } = makeGov();
    PerfGov.sentinelArm(true);
    let lowest = 1;
    for (let f = 0; f < 400; f++) {
      PerfGov.tick(f === 100 ? bad : 16.7);
      lowest = Math.min(lowest, scale());
    }
    assert.equal(lowest, 1, `a ${bad} ms sample must not trigger a render-scale step-down`);
    assert.ok(Math.abs(PerfGov.floorMs() - 16.7) < 0.5, `the floor stays on the healthy cadence (${PerfGov.floorMs()}) after a ${bad} ms sample`);
  }
});


test("preset changes expire scale attribution while keeping provisional resolution and no-op semantics", () => {
  for (const [from, to] of [[0, 4], [4, 0]]) {
    for (const prev of [1, 0.8]) {
      const { PerfGov, scale } = makeGov();
      PerfGov.setUserTier(from);
      feed(PerfGov, () => 33.3, 45);
      const chosen = scale();
      const pending = { kind: "scale", prev, ema: 33.3 };
      PerfGov.testSetPending(pending);
      PerfGov.setUserTier(from);
      assert.strictEqual(PerfGov.testPending(), pending, "same preset keeps pending attribution");
      PerfGov.setUserTier(to);
      assert.equal(PerfGov.testPending(), null, "both scale directions lose the old regime baseline");
      assert.equal(scale(), chosen, "preset invalidation does not write resolution");
      feed(PerfGov, () => 33.3, 60);
      assert.equal(scale(), chosen, "existing cooldown protects the provisional scale while evidence settles");
    }
  }
});

// ---------------------------------------------------------------------------
// REPLAYS: the real governor.js AND the real render-rate.js, driven the way
// js/game.js tickBody() drives them — PerfGov.tick(rafMs, RenderRate.drew())
// at the top of the rAF, RenderRate.observe() + gate() further down. `rafFn`
// returns the next rAF interval from (frame, scale, previousRafDrew), so a
// drawn frame's cost can decide the interval after it, as on a device.
const RR_SRC = fs.readFileSync(path.join(ROOT, "js/perf/render-rate.js"), "utf8");
function replay(rate, rafFn, n, { legacy = false } = {}) {
  const mem = { "apex26.renderRate": rate };
  globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };
  globalThis.window = { __APEX_BUILD: 1 };
  const PerfGov = eval(SRC + ";PerfGov");
  const RenderRate = eval(RR_SRC + ";RenderRate");
  RenderRate.init({ isMobile: true });
  let scale = 1, moves = 0, futileSeen = false, wall = 0, slowWall = 0;
  PerfGov.init({ isMobile: true, getRenderScale: () => scale,
    setRenderScale: (s) => { s = Math.max(0.5, Math.min(1, s)); if (Math.abs(s - scale) < SCALE_EPS) return false; scale = s; moves++; return true; } });
  PerfGov.sentinelArm(true);
  let drew = true;
  for (let i = 0; i < n; i++) {
    const ms = rafFn(i, scale, drew);
    wall += ms; if (wall > 10000 && ms > 25) slowWall += ms;
    if (legacy) PerfGov.tick(ms); else PerfGov.tick(ms, RenderRate.drew());
    RenderRate.observe(ms);
    drew = RenderRate.gate(ms / 1000, ms, false, true);
    futileSeen = futileSeen || PerfGov.scaleFutile();
  }
  return { scale, moves, tier: PerfGov.tier(), autoShed: PerfGov.autoShed(), floor: PerfGov.floorMs(), ema: PerfGov.fpsEMA(),
    futileSeen, slowShare: slowWall / Math.max(1, wall - 10000) };
}
// Vsync quantisation at 60 Hz: a frame costing c ms presents at the next 16.67 multiple.
const quantised = (cost) => (i, s) => Math.max(1, Math.ceil(cost(s) / 16.667 - 1e-9)) * 16.667;
const fill = (c) => (s) => c * (0.4 + 0.6 * s * s);   // 40 % fixed cost, 60 % scales with pixels

test("replay A: a 120 Hz phone drawing every second rAF is judged on drawn frames (was 4 moves, floor 8.9)", () => {
  // The interval after a DRAWN rAF overruns one 8.3 ms vsync (16.7), the one
  // after a skipped rAF is the bare 8.3. Judged together, the floor sank to the
  // fast cadence and a steady draw read as over budget.
  for (const raf of [(i) => (i & 1 ? 16.67 : 8.33), (i, s, drew) => (drew ? 16.67 : 8.33)]) {
    const r = replay("half", raf, 7200);
    assert.equal(r.moves, 0, `no reallocation for a steady draw cadence (${JSON.stringify(r)})`);
    assert.equal(r.scale, 1); assert.equal(r.tier, 0); assert.equal(r.autoShed, 0);
  }
  const old = replay("half", (i, s, drew) => (drew ? 16.67 : 8.33), 7200, { legacy: true });
  assert.ok(old.moves >= 2 && old.floor < 10, `the un-gated feed still shows the defect (${JSON.stringify(old)})`);
});

test("replay B: the opt-in \"30\" tier on a 60 Hz phone never sheds (was 10 moves, tier 4)", () => {
  // A drawn frame costing over 16.7 ms presents at 33.3; the credit pacing then
  // draws every rAF, so this is the Low Power Mode shape and gets exactly its
  // treatment: the race-start probe (one cut, one bigger cut, a revert), no shed.
  const r = replay("30", (i, s, drew) => (drew ? 33.33 : 16.67), 3600);
  assert.equal(r.scale, 1); assert.equal(r.tier, 0); assert.equal(r.autoShed, 0);
  assert.ok(r.moves <= 3, `bounded race-start probe only (${r.moves})`);
  assert.ok(Math.abs(r.floor - 33.3) < 0.5, `floor converges on the 30 fps cadence (${r.floor})`);
  // The cheap tiers at 60 and 120 Hz: credit pacing draws some rAFs back to
  // back, so a summed drawn-to-drawn interval would jitter by a vsync; judged
  // per drawn frame they read as healthy.
  for (const [rate, ms] of [["45", 16.67], ["30", 16.67], ["45", 8.33], ["30", 8.33]]) {
    const t = replay(rate, () => ms, 3600);
    assert.equal(t.moves, 0, `tier ${rate} at ${ms} ms: ${JSON.stringify(t)}`); assert.equal(t.autoShed, 0);
  }
});

test("no frame skipped: tick(ms) and tick(ms, true) take identical decisions", () => {
  const raf = (i, s) => (i < 600 ? 16.67 : Math.max(16.67, 22 * (0.4 + 0.6 * s * s)));   // replay D
  const a = replay("off", raf, 7200, { legacy: true }), b = replay("off", raf, 7200);
  assert.deepEqual(b, a);
  assert.equal(a.moves, 7); assert.ok(Math.abs(a.scale - 0.9) < 1e-9);   // today's D outcome, unchanged
  const c = replay("half", () => 8.33, 7200);                              // replay C: cheap half-rate
  assert.equal(c.moves, 0); assert.equal(c.scale, 1);
});

test("replay Eq/Eq2: a vsync-quantised fill-bound phone crosses to 60 fps (was scale 1, floor 33.3)", () => {
  // 22 / 20 ms at full res present at 33.3; a 0.1 cut still presents at 33.3,
  // so the small step read as futile. The one bigger probe crosses the quantum.
  for (const c of [22, 20]) {
    const r = replay("off", quantised(fill(c)), 7200);
    assert.ok(r.floor < 17.5 && r.ema < 18, `settles on the 16.7 ms quantum (c=${c}: ${JSON.stringify(r)})`);
    assert.ok(r.scale >= 0.6 && r.scale < 1, `at a scale that holds 60 (c=${c}: ${r.scale})`);
    assert.equal(r.tier, 0, "resolution alone accounts for it");
    // Bounded: settled within five moves, then the ceiling's designed
    // re-measure (30 s, then the doubling refused-climb patience). Was <= 10
    // while the probe stopped at half the pixels (9 moves); the probe now goes
    // to the 0.5 floor and the verified climb takes two more moves back up.
    assert.ok(r.moves <= 12, `bounded moves (c=${c}: ${r.moves})`);
    assert.ok(r.slowShare < 0.15, `after 10 s, under 15 % of wall time at 30 fps (c=${c}: ${r.slowShare.toFixed(3)})`);
  }
});

test("replay Eq4: a fill-bound phone that half the pixels cannot cross still reaches 60 fps (was scale 1, floor 33.3)", () => {
  // 40 % fixed cost: at c = 24-30 ms the half-pixel probe (0.707) still costs
  // over 16.7 ms and presents at 33.3, so the old probe declared the lever
  // futile and the phone sat at 30 fps where 0.5-0.7 holds 60. Each case must
  // settle at a scale within one climb step of the best one that holds 60.
  for (const c of [24, 26, 28, 30]) {
    const best = [1, 0.95, 0.9, 0.85, 0.8, 0.75, 0.7, 0.65, 0.6, 0.55, 0.5].find((s) => fill(c)(s) <= 16.667);
    const r = replay("off", quantised(fill(c)), 7200);
    assert.ok(r.floor < 17.5, `settles on the 16.7 ms quantum (c=${c}: ${JSON.stringify(r)})`);
    assert.ok(fill(c)(r.scale) <= 16.667 && r.scale >= best - 0.1, `holds 60 near the best scale ${best} (c=${c}: ${r.scale})`);
    assert.equal(r.tier, 0, "resolution alone accounts for it");
    assert.ok(r.moves <= 12, `bounded moves (c=${c}: ${r.moves})`);
    assert.ok(r.slowShare < 0.2, `after 10 s, under 20 % of wall time at 30 fps (c=${c}: ${r.slowShare.toFixed(3)})`);
  }
});

test("replay Eq3/LPM: when the bigger probe buys nothing too, the lever is futile and scale returns to 1", () => {
  for (const raf of [quantised(() => 18), () => 33.33]) {   // CPU-bound quantised; an external 30 fps cap
    const r = replay("off", raf, 7200);
    assert.ok(r.futileSeen, "the scale lever is declared futile");
    assert.equal(r.scale, 1, "sharpness is not traded for nothing");
    assert.equal(r.tier, 0); assert.equal(r.autoShed, 0);
    assert.ok(r.moves <= 3, `one cut, one bigger cut, one revert (${r.moves})`);
    assert.ok(Math.abs(r.floor - 33.3) < 0.5);
  }
});

// ---------------------------------------------------------------------------
// THERMAL DRIFT → RENDER RATE: the real governor.js + thermal-drift.js +
// render-rate.js, driven through tick(). ThermalDrift (opt-in via
// apex26.thermalDrift) only SAYS a step is due; the governor's response is
// what these pin: on a phone whose player never chose a render rate
// (mode "auto"), the first step caps the presented rate at 45 — a quarter
// less work per second, no quality traded — instead of a governor rung.
// An explicit player mode is never overridden, and without RenderRate the
// response is the governor rung exactly as before. Drift timing: 10 s
// windows of accumulated frame time, 1 warm + 6 baseline windows, then a
// windowed-p50 EMA that must clear baseline*1.12 (+1 ms) — so ~4300 ticks
// at 16.7 ms to baseline, then a sustained 20 ms until a step lands.
const TD_SRC = fs.readFileSync(path.join(ROOT, "js/perf/thermal-drift.js"), "utf8");
function makeThermalGov(rateMode, { withRate = true } = {}) {
  const mem = { "apex26.thermalDrift": "1" };
  if (rateMode) mem["apex26.renderRate"] = rateMode;
  globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };
  globalThis.window = { __APEX_BUILD: 1 };
  globalThis.ThermalDrift = eval(TD_SRC + ";ThermalDrift");
  // NOT a local named RenderRate: direct eval would hand the governor that
  // local (null on the withRate:false path) instead of the global binding a
  // classic script sees in production — the governor must resolve the real
  // globalThis.RenderRate, present or absent, exactly as shipped.
  let rr = null;
  if (withRate) {
    rr = eval(RR_SRC + ";RenderRate");
    globalThis.RenderRate = rr;
    rr.init({ isMobile: true });
  } else {
    delete globalThis.RenderRate;
  }
  const PerfGov = eval(SRC + ";PerfGov");
  let scale = 1;
  PerfGov.init({ isMobile: true, getRenderScale: () => scale,
    setRenderScale: (s) => { s = Math.max(0.5, Math.min(1, s)); if (Math.abs(s - scale) < SCALE_EPS) return false; scale = s; return true; } });
  return { PerfGov, RenderRate: rr, scale: () => scale, mem };
}
function feedUntilDriftStep(PerfGov, slowMs, maxTicks) {
  feed(PerfGov, () => 16.7, 4300);   // warm window + baseline windows
  let i = 0;
  while (i < maxTicks && !(PerfGov.thermalDrift() && PerfGov.thermalDrift().steps > 0)) { PerfGov.tick(slowMs); i++; }
  return i;
}

test("thermal drift on an undecided phone caps the presented rate at 45 before touching quality", () => {
  const { PerfGov, RenderRate, scale, mem } = makeThermalGov(null);
  const used = feedUntilDriftStep(PerfGov, 20, 6000);
  assert.ok(PerfGov.thermalDrift().steps > 0, `a drift step must land (ticks used: ${used})`);
  assert.equal(RenderRate.state().mode, "45", "the first response is the render-rate cap, not a quality rung");
  assert.equal(scale(), 1, "no resolution was traded for a thermal step the rate cap answers");
  assert.equal(PerfGov.tier(), 0, "no feature tier was shed either");
  assert.equal(mem["apex26.renderRate"], undefined, "the engagement is session-only: the stored preference is untouched");
  delete globalThis.RenderRate; delete globalThis.ThermalDrift;
});

test("an explicit render-rate choice is never overridden by thermal drift", () => {
  const { PerfGov, RenderRate, scale } = makeThermalGov("30");
  const used = feedUntilDriftStep(PerfGov, 20, 6000);
  assert.ok(PerfGov.thermalDrift().steps > 0, `a drift step must land (ticks used: ${used})`);
  assert.equal(RenderRate.state().mode, "30", "the player's explicit 30 stays exactly as chosen");
  assert.ok(scale() < 1 || PerfGov.autoShed() > 0, "the governor rung answers instead, as it did before the wiring");
  delete globalThis.RenderRate; delete globalThis.ThermalDrift;
});

test("without RenderRate the drift response is the governor rung, unchanged", () => {
  const { PerfGov, scale } = makeThermalGov(null, { withRate: false });
  const used = feedUntilDriftStep(PerfGov, 20, 6000);
  assert.ok(PerfGov.thermalDrift().steps > 0, `a drift step must land (ticks used: ${used})`);
  assert.ok(scale() < 1 || PerfGov.autoShed() > 0, "driftStep's rung moved, exactly the pre-wiring behaviour");
  delete globalThis.RenderRate; delete globalThis.ThermalDrift;
});

test("software garage preview sheds render scale on SwiftShader and restores", () => {
  assert.match(SRC, /softwareGaragePreviewBegin\(gfx\)/);
  assert.match(SRC, /softwareGaragePreviewEnd\(gfx\)/);
  assert.match(SRC, /if \(cur > 0\.55\) \{ _swGarageScaleSaved = cur; gfx\.setRenderScale\(0\.55\); \}/);
});
