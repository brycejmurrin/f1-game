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
import { fileURLToPath } from "node:url";
import { seedLogGlobal } from "../helpers/seed-log.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
seedLogGlobal();
const SRC = fs.readFileSync(path.join(ROOT, "js/game/perf.js"), "utf8");

// A fake renderer mirroring GLX.setRenderScale (js/render/glx.js) EXACTLY,
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
  const PerfGov = eval(SRC + ";PerfGov");
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

// ── The GRAPHICS preset's user tier (js/game/gfx-quality.js) ────────────────
// tier() folds three terms with max(): the crash-sentinel floor, the user's
// preset floor, and the governor's own live tier. That single expression IS the
// interaction rule — a manual choice sets the FLOOR of degradation, never the
// ceiling — so these tests pin the rule, not the plumbing.

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

test("autoTier ignores the GRAPHICS user floor so look post stays live on LOW", () => {
  // GRAPHICS: LOW pins userTier at 4. That must still shed env/SSR/shadows via
  // tier(), but bloom/SSAO/god-rays/contact/lampVol read autoTier() so the
  // lighting tuner stays live unless the governor or crash floor measured it.
  const { PerfGov } = makeGov();
  assert.equal(typeof PerfGov.autoTier, "function", "PerfGov.autoTier must exist");
  assert.equal(PerfGov.autoTier(), 0, "healthy device, no user floor: autoTier is 0");
  PerfGov.setUserTier(4);
  assert.equal(PerfGov.tier(), 4, "GRAPHICS: LOW still floors the cost ladder");
  assert.equal(PerfGov.autoTier(), 0, "GRAPHICS: LOW must not pin look-defining post");
  PerfGov.setUserTier(2);
  assert.equal(PerfGov.tier(), 2);
  assert.equal(PerfGov.autoTier(), 0, "GRAPHICS: MEDIUM must not pin look post either");
});

test("a recovered device gets its per-chunk lamps back on GRAPHICS: MEDIUM", () => {
  // THE ONE-WAY DOOR THIS CLOSES. The degrade branch writes
  // `_perfTier = max(_perfTier, _floorTier()) + 1`, and _floorTier() folds in
  // the GRAPHICS preset — so on MEDIUM (_userTier 2, every phone's default) the
  // governor's first measured shed put _perfTier at 3, adopting the preset as
  // its own evidence. The restore branch walks back down only as far as
  // _floorTier(), i.e. 2. autoTier() reads _perfTier, so it stayed >= 2 for the
  // rest of the session however completely the device recovered — and PER-CHUNK
  // LAMPS, gated `>= 1`, went off and never came back. Reported from a MEDIUM
  // preset as "chunk lights isn't working even with the slider", against a
  // tuner note promising the feature "returns on its own when frames recover".
  //
  // autoShed() answers the question the gate actually asks: how many rungs has
  // the GOVERNOR shed on its own measurements, net of what it restored.
  const PerfGov = makeGovAtFloor();          // scale lever exhausted: the ladder is the only lever
  PerfGov.setUserTier(2);                    // GRAPHICS: MEDIUM
  assert.equal(PerfGov.autoShed(), 0, "a preset alone is not a measured shed");

  // Frames genuinely too slow, and genuinely cheaper for each rung shed — so
  // every step VERIFIES and sticks, which is what makes the door close.
  feed(PerfGov, () => 34 - PerfGov.autoShed() * 6, 3000);
  assert.ok(PerfGov.autoShed() >= 1, "a device missing frames must still shed by evidence");
  assert.ok(PerfGov.autoTier() >= 3,
    `the ladder must still climb ABOVE the preset floor on a struggling device (got ${PerfGov.autoTier()})`);

  // Now the device recovers completely and stays recovered.
  feed(PerfGov, () => 8, 40000);
  assert.equal(PerfGov.autoShed(), 0,
    "the governor has restored everything it shed, so per-chunk lamps must come back");
  assert.equal(PerfGov.tier(), 2, "the player's MEDIUM preset still floors the cost ladder");
  // The two accessors deliberately disagree here, and that disagreement IS the
  // fix: autoTier() cannot fall below the preset floor, which is why the gate
  // for a governor-shed feature must not read it.
  assert.equal(PerfGov.autoTier(), 2,
    "autoTier() still reports where the ladder stands — that is what it is for");
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
  PerfGov.setUserTier(0);
  assert.equal(PerfGov.autoTier(), 4, "ULTRA must not defeat the crash floor via autoTier either");
});

test("tier 2 sheds car-paint SSR with the wet-road march, not via po.reflect", () => {
  // po.reflect = 0 is ALSO a dry session, so pairing uCarReflect to it would
  // kill car-paint SSR on every dry lap. The governor must pass a separate
  // opts.carReflect = 0 at tier ≥ 2, and both present() paths must honour it.
  const game = fs.readFileSync(path.join(ROOT, "js/game.js"), "utf8");
  const post = fs.readFileSync(path.join(ROOT, "js/render/glx/post.js"), "utf8");
  const tlx = fs.readFileSync(path.join(ROOT, "js/render/three/tlx-post.js"), "utf8");
  const wgx = fs.readFileSync(path.join(ROOT, "js/render/webgpu/wgx.js"), "utf8");
  assert.match(game, /po\.reflect = PerfGov\.tier\(\) >= 2 \? 0 : _ssr/);
  assert.match(game, /po\.carReflect = PerfGov\.tier\(\) >= 2 \? 0 : undefined/);
  assert.match(post, /opts && opts\.carReflect != null \? opts\.carReflect/);
  assert.match(tlx, /o\.carReflect != null \? o\.carReflect/);
  assert.match(wgx, /o\.carReflect != null \? o\.carReflect/);
  assert.match(SRC, /SSR march off \(wet-road \+ car-paint\)/);
});

test("shadow box and shader fade share the same unset shadowRange fallback", () => {
  const game = fs.readFileSync(path.join(ROOT, "js/game.js"), "utf8");
  const glx = fs.readFileSync(path.join(ROOT, "js/render/glx.js"), "utf8");
  assert.match(game, /LT\.shadowRange != null \? LT\.shadowRange : 80/);
  assert.match(glx, /T && T\.shadowRange != null \? T\.shadowRange : 80\.0/);
  assert.doesNotMatch(game, /LT\.shadowRange \|\| 64/,
    "|| 64 disagreed with the shader's 80 fallback and treated a 0 knob as unset");
});

test("sun-shadow fade origin is yaw-invariant (eye XZ, look-target Y)", () => {
  // docs/PERF-FINDINGS.md 2026-08-15: fading from the look-biased box anchor
  // swept a 58% strength swing at 70 m on a pinned-eye yaw. The box stays
  // forward-biased (texel allocation); the fade must not.
  const lit = fs.readFileSync(path.join(ROOT, "js/render/shaders/lit.js"), "utf8");
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
  const lit = fs.readFileSync(path.join(ROOT, "js/render/shaders/lit.js"), "utf8");
  const tsl = fs.readFileSync(path.join(ROOT, "js/render/three/tsl-lit.js"), "utf8");
  assert.match(lit, /wetSheen \* 0\.55/);
  assert.match(tsl, /wetSheen\.mul\(0\.55\)/);
  // The classification RANGE and every finish id in it must agree across the
  // backends, or a finish silently does nothing on two of the three renderers
  // and no other test would notice. Range grew to 31 with matte/brushed/pearl
  // and the carbon finish; mirror stays 27.
  assert.match(lit, /surfaceId <= 31/);
  assert.match(lit, /mirrorSurface = surfaceId == 27/);
  assert.match(tsl, /lessThanEqual\(31\.0\)/);
  assert.match(tsl, /surfaceId\.equal\(27\.0\)/);
  for (const id of [28, 29, 30, 31]) {
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
  const { PerfGov, scale } = makeGov();
  feed(PerfGov, (i) => (i % 20 === 0 ? 10 : 43 - PerfGov.tier() * 7), 1200);
  assert.ok(PerfGov.tier() > 0,
    `the feature ladder must be reachable once the scale lever is proven useless, got tier ${PerfGov.tier()}`);
  assert.ok(scale() > 0.5,
    "and it must not have ground the resolution to the floor on the way there");
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
