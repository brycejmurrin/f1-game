/* Apex 26 — adaptive-performance governor + mobile crash sentinel for
   js/game.js. Two-stage: (1) scale the 3D render resolution to hold 60 fps;
   (2) when the scale floor is hit, shed features one tier at a time (render()
   gates on PerfGov.tier()). The crash sentinel detects a jetsam/OOM kill (the
   in-race flag persisted at race start still set at the NEXT boot) and
   pre-degrades the governor with "strikes" that cleanly finished races pay
   back down. Renderer handle injected once via PerfGov.init(gfx).
   Must load BEFORE js/game.js (see index.html). */
const PerfGov = (function () {
  "use strict";

let _gfx = null;

// Holds framerate by scaling the 3D render resolution (gfx.setRenderScale) when
// frames run slow, restoring sharpness when there's headroom. Conservative:
// only downscales when clearly missing THIS DEVICE'S OWN observed budget (see
// _floorMs below — ~19 ms EMA at the 60 fps default) so a healthy vsync-capped
// display never degrades; upscales slowly to avoid oscillation.
//
// SETTLE, don't HUNT: every scale change reallocates all HDR/bloom targets
// (setRenderScale -> resize -> createTargets) — a visible hitch. The old
// governor bounced around the budget edge (down at >19 ms, straight back up at
// <14 ms, with a coarse 0.1 down-step that easily overshot the up threshold),
// so a phone on GRAPHICS: HIGH — which sits right at that edge (DPR 2.0 + the
// haze/lamp-volumetric passes STANDARD keeps off) — oscillated ~once a second
// and each realloc read as a "jump". Now: snap down promptly, then HOLD the
// lower scale (_downHold) and only creep back up under clear, sustained
// headroom (<12.5 ms below the derived budget — see _floorMs). Desktop /
// STANDARD-tier sit at scale 1 and never enter these branches, so their
// (already smooth) behaviour is unchanged.
let _frameEMA = 16.7, _govT = 0, _govCool = 0, _autoRes = true, _downHold = 0;
// Consecutive frames over SPIKE_MS. Reset by any in-budget frame and by
// sentinelArm(), so a fresh race never inherits a previous session's run.
let _slowRun = 0;
// A COOLDOWN ONLY MEANS SOMETHING WHILE FRAMES ARE BEING MEASURED. Boot arms
// two of them before the first race tick — ui-scale.js applyResMode() ->
// setAutoRes(true) on every load, gfx-quality.js applyLive() -> setUserTier(2)
// on every phone — and tick() only counts them down in a race, so the first
// 300 race frames were spent inside a cooldown that protected nothing. That
// window is the ONLY one in which a device slow from frame 1 is catchable:
// `_frameEMA` (alpha 0.1) outruns `_floorMs` (0.02 upward) over roughly frames
// 10–95, then the floor arrives at the same number and the device reads as
// externally capped for the rest of the session. A phone steady at 33 ms from
// lights-out was never degraded at all. So: arm a cooldown only while live
// (menu-time changes are settled by the race-start reset in sentinelArm
// anyway), and re-open the window at every race start.
let _live = false;
const UP_BACKOFF_MIN = 600, UP_BACKOFF_MAX = 7200;   // frames: 10 s … 2 min
let _upBackoff = UP_BACKOFF_MIN;   // wait before the next restore attempt after a refused climb
// The scale lever is INEFFECTIVE on this device right now — set when a
// scale-down step was reverted for buying nothing, cleared once a tier has been
// shed (the next rung may change that) or once headroom returns.
//
// Without it the ladder cannot be reached on a CPU-bound frame. The degrade
// branch sheds a tier only in the `else` of "did setRenderScale move?", and
// setRenderScale only refuses at the 0.5 clamp or its 0.02 dead zone — so while
// the scale can still nominally step, `stepped` is true every time and the
// tier branch is never evaluated. On a frame whose cost is not fill-bound,
// every one of those steps is then reverted by the verify below for failing to
// improve the EMA, and the governor loops forever on the one lever that cannot
// help while shedding nothing. Measured on an iPhone at Bahrain/night, build
// 1284, 25 s per backend: WebGL2 sat at scale 0.80 / tier 0 / 23 fps, while
// WebGPU and three.js — where the scale lever did bite — reached tier 2 and ran
// at 60 and 40 fps. The slowest backend was shedding the least work.
//
// "Reverted for buying nothing" is the honest signal that the lever is wrong,
// and it is already computed; this just stops throwing it away.
let _scaleFutile = false;

// THE BUDGET IS DERIVED, NOT HARDCODED. "> 19 ms" only ever meant "slower than
// a 60 Hz display can go" — it silently assumed the frame INTERVAL is a proxy
// for frame COST, which is true only while the display is what you are
// competing with. Under an external cap (iOS Low Power Mode throttles rAF to
// 30 fps, a 30 Hz panel, a browser background throttle) the two decouple: every
// frame lands at ~33.3 ms no matter how cheap it is to draw, the old governor
// downscaled to the floor and shed every optional feature within ~27 s, and
// NONE of it could ever help — the clock was capped externally and had nothing
// to do with how long the frame took to draw. `_floorMs` tracks the FLOOR of
// observed frame intervals (a low percentile, not the mean — the fastest this
// display has actually gone) and the thresholds below are relative to it, so a
// 60 Hz panel keeps exactly today's numbers (floor settles near 16.7 ms) while
// a capped device is correctly judged to be MEETING its budget instead of
// chasing a number it cannot move. Pulled toward a faster observed frame
// quickly (that is direct evidence the device can go there); crept toward a
// slower one slowly, so a single stray heavy frame can't redefine the budget —
// only a SUSTAINED absence of fast frames (exactly what a hard rAF cap looks
// like) moves it.
let _floorMs = 16.7;
const FLOOR_DOWN_A = 0.3, FLOOR_UP_A = 0.02;
// DEGRADE_OVER sits ABOVE the floor; RESTORE_WITHIN also sits above it, just
// barely. That asymmetry is the fix for a governor that could only ever go one
// way. RESTORE_UNDER used to be 4.2 ms BELOW the floor, and `_frameEMA <
// _floorMs - 4.2` is UNSATISFIABLE: `_floorMs` chases dt down at alpha 0.3 and
// up at 0.02 while `_frameEMA` moves at 0.1 in both directions, so from their
// shared 16.7 start `_floorMs <= _frameEMA` is an invariant and the EMA can
// never get 4.2 ms below a floor that is already at or under it. Simulated
// over 60 million frames across constant 8.3/16.7/33.3, bimodal, uniform
// 1-96 ms and load-then-recover sequences: the predicate fired ZERO times and
// its closest approach was exactly 4.2000 ms — i.e. RESTORE_UNDER itself, at
// every steady state. So any device that degraded once stayed degraded for the
// whole session, and the crash sentinel's pre-drop at js/game.js could never
// climb back either.
//
// The reason no statistic over dt could have worked: the frame INTERVAL is
// clamped from below by vsync. A frame costing 4 ms and one costing 15 ms both
// report 16.7 ms on a 60 Hz panel, so headroom is invisible in the interval by
// construction. Degrade works because slowness genuinely stretches the
// interval; restore cannot be the mirror of it. What IS observable is the EMA
// settling back ONTO the floor — that means frames have stopped missing — so
// restore asks for exactly that, and the up-step is verified like the down-step.
// SPIKE_MS is the "this frame is not evidence" cap; SPIKE_RUN is how many
// consecutive over-cap frames stop being a spike and start being the device.
// 3 at <10 fps is ~0.3-0.6 s — long enough that a resume or a GC pause never
// reaches it, short enough that a genuinely slow device is seen almost at once.
// SLOW_CAP is the ceiling on a sample from inside such a run. It is NOT
// SPIKE_MS: clamping a run to 100 would make every sub-10-fps state read as
// exactly 100 ms, and `_pendingVerify` judges a step by whether the EMA MOVED —
// so the governor could see that it was slow but never whether a cut helped,
// and would revert every step it took. 1 s keeps real magnitude across the
// whole 10-fps-to-1-fps range while still bounding a pathological hitch; a tab
// resume never reaches it at all, because one frame is not a run.
const SPIKE_MS = 100, SPIKE_RUN = 3, SLOW_CAP = 1000;
const DEGRADE_OVER = 2.3, RESTORE_WITHIN = 0.6;   // degrade at floor+2.3; restore once the EMA is back within 0.6 of the floor

// MAKE THE DEGRADE CAUSAL. The derived budget above is the right model but
// takes a couple of seconds to settle; this is the net for while it does, and
// for any cause of capping the model does not anticipate. Every downscale/
// feature-shed step is provisional until the NEXT evaluation: if the EMA did
// not improve by a meaningful margin, the step bought nothing, so fill rate
// was not the bottleneck — revert it and hold off rather than immediately
// repeating the same failed step, which is what turned one bad guess into
// "runs to the bottom of the ladder and stays there for the session".
// VERIFY_MARGIN is deliberately SMALL, not "how much better should this look":
// a genuinely GPU-bound step (fill rate really was the cost) still shows a
// real, if partial, improvement — a 0.1 scale cut rarely halves the frame,
// because plenty of per-frame cost does not shrink with the render target —
// so a margin sized for "meaningfully better" discarded real, working steps
// and re-tried them every cycle, which is a slower version of the exact
// oscillation _downHold exists to prevent (measured while tuning this: at
// margin 2 a genuinely slow device cycled its scale down and back up every
// ~7 s forever instead of settling). A capped clock, by contrast, shows
// ~zero improvement — the frame time was never coupled to the render target
// at all — so even a small margin still tells the two apart.
let _pendingVerify = null;   // {kind:"scale"|"tier", prev, ema} for the last unverified step
const VERIFY_MARGIN = 0.5, VERIFY_COOL = 300;

// ── Feature-shedding tiers: the governor's SECOND stage ──────────────────────
// Resolution scaling can't rescue costs that don't shrink with the render
// target: the per-frame car/lamp shadow depth passes, the env-probe world
// re-render, SSAO's three passes, the god-ray march, the SSR march. When the
// scale has already bottomed out and frames are STILL slow, shed features one
// tier at a time — cheapest visual loss first — and restore them only under
// clear sustained headroom at FULL resolution, so the ladder can't oscillate:
//   1  env probe off        (car paint falls back to the analytic sky mirror)
//   2  lamp spot shadow + SSR march off (wet-road + car-paint)
//   3  car sun-shadow map off (the blob contact shadow remains)
//   4  SSAO + god rays + bloom off

// ── Crash sentinel ───────────────────────────────────────────────────────────
// A jetsam/OOM kill leaves NO signal — no pagehide, no contextlost, no error.
// The only detectable trace is the in-race flag persisted at race start still
// being set at the NEXT boot. Mobile tier only: desktop tabs don't get
// jetsam-killed, and the desktop test suite must never enter safe mode. The
// flag is disarmed whenever the tab is hidden (a background kill is normal iOS
// housekeeping, not our crash) and re-armed on return. Strikes pre-degrade the
// governor at boot so a phone that died mid-race last session starts
// conservative instead of dying the same way again; each cleanly FINISHED race
// pays one strike back down, so a recovered device climbs back to full quality.
const SENT_ACTIVE = "apex26.raceActive", SENT_STRIKES = "apex26.crashStrikes";
// The build those strikes were earned against. A strike is evidence that THIS
// CODE killed this device — and the moment the code is replaced that evidence
// expires. Without this the safe mode is a one-way door: a build that ran the
// phone out of memory leaves two strikes behind, the floor pins at tier 4 with
// the render scale pre-dropped to 0.7, and the ONLY way back is finishing whole
// races on a game that now looks broken enough that nobody wants to. Exactly
// that happened: shipping vendor/ switched a Rapier world on, phones started
// dying, and fixing it changed nothing on the devices already in safe mode.
const SENT_BUILD = "apex26.crashStrikesBuild";
let _crashStrikes = 0;
// Safe-mode floor the governor's restore path can't climb below (per session —
// only strikes paying off across boots lift it): one strike starts with
// lamp-shadow/SSR-class features shed (tier 2), two or more shed the whole
// heavy post stack too (tier 4).
let _perfTierFloor = 0;
let _perfTier = 0;
// How many rungs the GOVERNOR has shed on its own measurements, net of what it
// has restored. This is NOT _perfTier, and the difference is a bug that shipped:
// the degrade branch steps from `_floorTier()`, so on a device whose player had
// chosen GRAPHICS: MEDIUM (_userTier 2) the first measured shed wrote
// `_perfTier = 3` — the governor ADOPTED the preset as its own evidence — and
// the restore branch walks back down only as far as `_floorTier()`, i.e. 2. So
// `autoTier()`, which reads _perfTier, was pinned at >= 2 for the rest of the
// session however completely the device recovered, and every gate spelled
// `autoTier() >= 1` (PER-CHUNK LAMPS and the PER-CHUNK ROAD rider on it) stayed
// off for good. Reported from a MEDIUM preset as "chunk lights isn't working
// even with the slider", while the tuner's own note promised it "returns on its
// own when frames recover" — which below GRAPHICS: HIGH it could not.
//
// autoTier() cannot simply be redefined as floor + this count: the degrade
// branch stops once the EFFECTIVE tier reaches 4, so the count saturates at
// `4 - _userTier` and the tier-4 post consumers (bloom, SSAO, god rays) would
// become UNSHEDDABLE on exactly the low presets that most need them shed — the
// post-mortem recorded above autoTier(). So the two answers stay two accessors:
// autoTier() is WHERE THE LADDER STANDS (still _perfTier, still reaches 4), and
// autoShed() is HOW MUCH THE GOVERNOR SHED BY EVIDENCE, which is what a feature
// held off "because this device is missing frames" has to ask.
let _autoShed = 0;
// THE OPENING WINDOW, recorded so a player's own device can answer a question
// this repo's containers cannot. "WebGPU lags for the first few seconds and
// then runs fine" is a report about frames that have already gone by the time
// anyone can read `perf()`, and every EMA in this file is designed to forget
// them — `_frameEMA` at alpha 0.1 has lost a 400 ms frame within a second.
// R23 measured four candidate causes on SwiftShader and excluded all four
// (docs/PERF-FINDINGS.md §2x); what was missing was not another hypothesis but
// the ability to see the stall on the hardware that has it. So: over the first
// OPEN_FRAMES after a race starts, keep the single worst frame and a count of
// how many ran over twice the derived budget. Two numbers, no allocation, and
// they survive into `__apex.perf()` for as long as the race does.
const OPEN_FRAMES = 600;   // ~10 s at 60 fps, ~20 s at 30
let _openN = 0, _openMax = 0, _openSlow = 0;
// The USER's floor, from the GRAPHICS preset (js/perf/quality-preset.js). It is a
// third term in tier()'s max(), and that is the whole interaction rule:
//
//   a manual choice sets the FLOOR of degradation, never the ceiling.
//
// The player may always ask for LESS than the governor would run, and never for
// MORE than the device has measurably earned. `_perfTier` is evidence about
// THIS device THIS session (the derived _floorMs budget); `_userTier` is a
// prior, and a prior may narrow the search downward but may not assert the
// device is faster than it measured — GRAPHICS: ULTRA on a thermally throttled
// laptop must not re-enable the god-ray march the governor just proved
// unaffordable. Folding it in HERE rather than at the eight PerfGov.tier() call
// sites in js/game.js means the render path needs no edit at all, and it makes
// the crash-sentinel floor undefeatable by CONSTRUCTION — it is a term in the
// same max(), so no caller can forget to check it.
let _userTier = 0;
// The combined floor nothing may restore below. Both terms are "shed AT LEAST
// this much": one because the device has been crashing, one because the player
// asked for it.
function _floorTier() { return Math.max(_perfTierFloor, _userTier); }

function init(gfx) {
  Log.info("game", "PerfGov.init");
  _gfx = gfx;
  // Any phone (isMobile), NOT just the memory-safe STANDARD tier (mobileTier):
  // a device that opted into GRAPHICS: HIGH is the one MOST likely to get
  // jetsam-killed, so it needs the crash sentinel + conservative restart too.
  // Desktop stays isMobile=false, so the test suite never enters safe mode.
  if (gfx && gfx.isMobile) {
    const st = GameStore.store;   // raw lane: bare strings, read live, never throws
    const build = String((typeof window !== "undefined" && window.__APEX_BUILD) || 0);
    if (st.raw(SENT_BUILD) !== build) {
      // New code, clean slate. Also clears any in-flight race flag: a race
      // that was running when the update landed did not crash, it was
      // replaced.
      st.rawSet(SENT_BUILD, build);
      st.rawSet(SENT_STRIKES, "0");
      st.rawDel(SENT_ACTIVE);
    }
    _crashStrikes = Math.min(4, parseInt(st.raw(SENT_STRIKES), 10) || 0);
    if (st.raw(SENT_ACTIVE) === "1") {
      _crashStrikes = Math.min(4, _crashStrikes + 1);
      st.rawSet(SENT_STRIKES, String(_crashStrikes));
      st.rawDel(SENT_ACTIVE);
    }
  }
  _perfTierFloor = _floorFromStrikes(_crashStrikes);
  _perfTier = _perfTierFloor;
  _autoShed = 0;
}

// ONE owner for the strikes -> floor mapping. It used to be spelled out at init
// and simply missing from cleanRace(), so paying a strike down moved the counter
// and left the floor where boot had put it. See cleanRace() for what that cost.
function _floorFromStrikes(n) { return n >= 2 ? 4 : (n >= 1 ? 2 : 0); }

// RE-ARM WITHOUT THE RESET. The visibilitychange handler used sentinelArm(true)
// for a tab RETURN, which is not a race start: it dragged the boot-window reset
// along, snapping _frameEMA and _floorMs back to 16.7 on a device whose budget
// the governor had already derived. On a 30 Hz capped display (Low Power Mode)
// that re-armed the exact "degrade a capped clock" bug _floorMs exists to
// prevent — one scale step down, a revert 45 frames later, two visible target
// re-allocs per app switch — and it made __apex.perf().open describe the last
// un-hide instead of the race start. This only re-arms the sentinel.
function sentinelResume() {
  if (!_gfx || !_gfx.isMobile) return;
  GameStore.store.rawSet(SENT_ACTIVE, "1");
}
function sentinelArm(on) {
  // Race start / return to a live session: re-open the boot window described
  // at `_live` — both averages restart from their shared 16.7 so the EMA can
  // outrun the floor once more. Desktop too (above the mobile-only guard):
  // the governor runs everywhere, only the sentinel is mobile.
  if (on) { _frameEMA = _floorMs = 16.7; _slowRun = 0; _openN = 0; _openMax = 0; _openSlow = 0; } else _live = false;
  if (!_gfx || !_gfx.isMobile) return;
  if (on) GameStore.store.rawSet(SENT_ACTIVE, "1"); else GameStore.store.rawDel(SENT_ACTIVE);
}
function cleanRace() {
  sentinelArm(false);
  if (_crashStrikes > 0) {
    _crashStrikes--;
    GameStore.store.rawSet(SENT_STRIKES, String(_crashStrikes));
    // RECOMPUTE THE FLOOR. Paying a strike down used to move the counter and
    // nothing else, so _perfTierFloor stayed at whatever init() derived for the
    // WHOLE session. One strike floors the tier at 2, and tier() >= 2 is exactly
    // the gate that sheds SSR (WET MIRROR / the dry sheens) and lamp shadows,
    // while tier() >= 1 sheds PER-CHUNK LAMPS and the env probe. So a single
    // crash — or one sentinel trip that was never a crash — silently pinned
    // those features off until the page happened to reload, no matter what the
    // player set GRAPHICS to. On mobile the one preset switch that DOES force a
    // reload is ULTRA (it flips the mobileHigh bit, see js/perf/quality-preset.js
    // syncBootTier), which is why the symptom reads as "wet sheen and per-chunk
    // only work on ULTRA" rather than as a stuck floor.
    // clearStrikes() recomputes the floor the same way; both paths then release
    // `_perfTier` to the new floor so they cannot drift apart again.
    _perfTierFloor = _floorFromStrikes(_crashStrikes);
    // The floor just dropped. _perfTier may be sitting on the OLD one (the
    // degrade branch steps from _floorTier(), so it absorbs whatever floor was
    // live when it fired). Release it to the new floor and let the governor
    // re-earn any shed from its own measurements.
    if (_perfTier > _floorTier()) { _perfTier = _floorTier(); _autoShed = 0; }
  }
}

function tick(dtMs) {
  // `_autoRes` gates the RESOLUTION stage ONLY — it must not return early here.
  // It used to, and that made a user-facing control silently disable a safety
  // system: RESOLUTION: LOW/MED/HIGH (js/game.js, applyResMode) calls
  // setAutoRes(false) to stop the governor fighting the pinned scale, and this
  // early return then took stage 2 down with it. A player who pinned the
  // resolution — a control shown to EVERYONE, desktop included, not just the
  // phones this file's crash sentinel is written for — got no feature shedding
  // at all for the session: `_perfTier` froze at whatever init() left it, and
  // on a device with crash strikes the pre-degraded floor could never be paid
  // back down either, because cleanRace() alone does not move `_perfTier`.
  // Pinning the resolution is a statement about SHARPNESS, not a request to
  // stop adapting; it makes stage 2 MORE important, not less, because the
  // cheaper lever is now unavailable. So the EMA and the derived floor are
  // tracked unconditionally (stage 2 judges against the same budget and needs
  // the data), and `_autoRes` is consulted only at the two places that actually
  // move the scale.
  // Ignore huge spikes (tab resume, GC): they'd yank the scale. But a SPIKE is
  // one frame, and this used to be a bare `if (dtMs < SPIKE_MS)` that dropped
  // every sample above the cap — which made the governor BLIND ON EXACTLY THE
  // DEVICES IT EXISTS FOR. Below ~10 fps every frame is over the cap, nothing
  // ever reaches the EMA, and `_frameEMA` sits at the 16.7 that sentinelArm()
  // left it: the governor reads 59.9 fps, `degradeAt` is never crossed, and the
  // whole ladder stays parked at tier 0 while the player watches a slideshow.
  // Measured 2026-09-02 in a live browser (chrome-devtools MCP, bahrain, GLX):
  // 2 rAF frames in 17.5 s — 0.11 fps real — and `__apex.perf()` in that same
  // page reported `{fps: 59.9, floorMs: 16.7, tier: 0, scale: 1}`. Nothing had
  // stepped, because nothing had been seen.
  //
  // A backgrounded tab cannot fake a run: js/game.js hides -> setPaused(true),
  // and the tick call site is gated on `!paused`, so Chrome's ~1 Hz background
  // rAF throttle never reaches the governor at all. Checked, not assumed.
  // So: keep discarding an ISOLATED over-cap frame (tab resume, a GC pause),
  // and stop discarding a RUN of them. SPIKE_RUN consecutive slow frames is not
  // a spike, it is the device's actual speed, and from there the sample is fed
  // clamped to SLOW_CAP — enough for the EMA to outrun the floor and trip
  // `degradeAt`, and to still MOVE when a step helps, without letting a
  // pathological hitch enter at its full value.
  _live = true;
  // Before any smoothing: the opening window wants the raw frame, spikes and
  // all, because a spike in the first seconds IS the thing being reported.
  if (_openN < OPEN_FRAMES) {
    _openN++;
    if (dtMs > _openMax) _openMax = dtMs;
    if (dtMs > _floorMs * 2) _openSlow++;
  }
  if (dtMs < SPIKE_MS) {
    _slowRun = 0;
    _frameEMA += (dtMs - _frameEMA) * 0.1;
    _floorMs += (dtMs - _floorMs) * (dtMs < _floorMs ? FLOOR_DOWN_A : FLOOR_UP_A);
  } else if (++_slowRun >= SPIKE_RUN) {
    const s = Math.min(dtMs, SLOW_CAP);
    _frameEMA += (s - _frameEMA) * 0.1;
    _floorMs += (s - _floorMs) * (s < _floorMs ? FLOOR_DOWN_A : FLOOR_UP_A);
  }
  if (_downHold > 0) _downHold--;   // recovery hold ticks down every frame
  if (_govCool > 0) { _govCool--; return; }
  if (++_govT < 45) return;   // evaluate ~every 45 frames
  _govT = 0;

  // Verify the last step before taking a new one.
  if (_pendingVerify) {
    const v = _pendingVerify; _pendingVerify = null;
    // A DOWN step is a bet that frames get cheaper: revert unless the EMA fell
    // by at least VERIFY_MARGIN. An UP step is the opposite bet — that the
    // headroom was real — so it is judged the other way round: revert if the
    // EMA got WORSE by that margin. Same instrument, mirrored, because a step
    // that made things worse should be undone whichever direction it went.
    const failed = v.up ? (_frameEMA > v.ema + VERIFY_MARGIN)
                        : (_frameEMA > v.ema - VERIFY_MARGIN);
    if (failed) {
      if (v.kind === "scale") {
        _gfx.setRenderScale(v.prev);
        // A DOWN step that bought nothing means this frame is not fill-bound,
        // so stepping the scale again would revert again. Fall through to the
        // feature ladder on the next evaluation instead of re-testing a lever
        // this device has just answered for. (An UP step failing says the
        // opposite — there was no headroom — and implies nothing about fill.)
        if (!v.up) _scaleFutile = true;
      } else { _perfTier = v.prev; _autoShed = v.shed; }
      _govCool = VERIFY_COOL;
      // A failed UP step is the device saying "no headroom". Without a hold
      // the restore gate (EMA under the floor, _downHold 0) was true again
      // one cooldown later, so restore → verify-fail → revert cycled every
      // ~10 s for the whole race — with the scale lever that is a full
      // render-target reallocation each time. Back off: each refused climb
      // doubles the wait before the next try (10 s, 20 s, 40 s, … 2 min).
      if (v.up) { _downHold = _upBackoff; _upBackoff = Math.min(_upBackoff * 2, UP_BACKOFF_MAX); }
      return;
    }
    if (v.up) _upBackoff = UP_BACKOFF_MIN;   // a climb that held resets the backoff
  }

  const degradeAt = _floorMs + DEGRADE_OVER, restoreAt = _floorMs + RESTORE_WITHIN;
  const cur = _gfx.getRenderScale ? _gfx.getRenderScale() : 1;
  if (_frameEMA > degradeAt) {                 // meaningfully slower than THIS device's own floor: degrade PROMPTLY
    // With the scale PINNED (_autoRes false) the ladder is the only lever left,
    // so fall straight through to shedding instead of skipping the evaluation.
    // THE RENDERER'S BOOLEAN IS THE "SCALE LEVER EXHAUSTED" SIGNAL — ask it,
    // don't predict it from `cur > 0.5`. This was `if (_autoRes && cur > 0.5) {
    // if (setRenderScale(...)) {...} } else if (shed)`, and that structure made
    // the WHOLE LADDER DEAD CODE in the shipped default. Traced in floats:
    // stepping 1.0 by -0.1 gives 1 -> 0.9 -> 0.8 -> 0.7000000000000001 ->
    // 0.6000000000000001 -> 0.5000000000000001. That last value is one ULP
    // ABOVE 0.5, so `cur > 0.5` is true forever; setRenderScale then clamps the
    // request to 0.5 and rejects it as a 1.1e-16 change against its own
    // `Math.abs(s - renderScale) < 0.02` dead zone in GLX.setRenderScale; and
    // because the outer `if` was ENTERED, the `else if` that sheds a feature was
    // never evaluated. Net effect: with _autoRes on (the default) the governor
    // could scale down and then did nothing at all, forever — no tier was ever
    // shed by evidence. Only the GRAPHICS preset's _userTier still bit, because
    // that is a separate term in tier()'s max().
    // Using the return value removes the epsilon dependency entirely rather than
    // chasing the constant, and tests/unit/perf-governor.test.mjs:38 already
    // calls that boolean "the real gfx contract PerfGov.tick() relies on".
    let stepped = false;
    if (_autoRes && cur > 0.5 && !_scaleFutile) stepped = !!_gfx.setRenderScale(cur - 0.1);
    if (stepped) {
      _pendingVerify = { kind: "scale", prev: cur, ema: _frameEMA };
      _govCool = 30; _downHold = 600;
    } else if (_perfTier < 4) {   // scale lever exhausted — shed a feature
      // Step from the EFFECTIVE tier, not from _perfTier alone. A rung at or
      // below the floor (crash sentinel, or the player's GRAPHICS preset) is
      // already shed, so incrementing onto it changes nothing the EMA can see:
      // the causal check would read "this step bought nothing", revert it, and
      // re-try the same dead rung every cycle while frames keep missing —
      // _pendingVerify's own failure mode, reached from a direction it cannot
      // distinguish, because the step genuinely did not help and the reason
      // (redundant, not mis-targeted) is invisible to a frame-time delta.
      // Skipping to floor+1 guarantees every step is one that can be felt.
      //
      // THE GUARD READS _perfTier, NOT THE EFFECTIVE TIER, and that is the
      // whole point. Gating on `Math.max(_perfTier, _floorTier()) < 4` made
      // GRAPHICS: LOW (_userTier 4, so _floorTier() 4) false on its very first
      // evaluation: _perfTier and _autoShed could never leave 0, so autoTier()
      // and autoShed() — which exclude the user floor ON PURPOSE — returned 0
      // for the whole session and bloom, SSAO, god-rays, contact shadows and
      // per-chunk lamps were UNSHEDDABLE on the preset that exists to make the
      // game cheap. That is verbatim the failure the autoTier() comment below
      // says it fixed ("_perfTier is the effective tier and can always climb to
      // 4"); the accessor was corrected and the producer that feeds it was not.
      // Stepping still starts from the floor, so LOW takes one felt 0 -> 4 step
      // and every other preset behaves exactly as before.
      _pendingVerify = { kind: "tier", prev: _perfTier, shed: _autoShed, ema: _frameEMA };
      _perfTier = Math.min(4, Math.max(_perfTier, _floorTier()) + 1); _autoShed++; _govCool = 90; _downHold = 600;
      // A shed rung changes what the frame is bound BY, so let the scale lever
      // prove itself again from the new baseline rather than staying latched
      // off for the session on one old measurement.
      _scaleFutile = false;
    }
  } else if (_frameEMA < restoreAt && _downHold === 0) {   // clear, SETTLED headroom (~10 s since the last cut): restore slowly
    _scaleFutile = false;   // headroom is back — nothing about the old verdict still applies
    // The up-step is VERIFIED like the down-step. Restoring is a guess that the
    // headroom is real, and the same _pendingVerify machinery that reverts a
    // useless cut reverts a premature restore one evaluation later — without
    // it, a governor that can finally go up could climb straight back into the
    // frame misses it just escaped, which is the oscillation the header warns
    // about arriving from the other side.
    // SAME SHAPE AS THE DEGRADE BRANCH, and for the same reason. Climbing from
    // the floor at +0.06 reaches 0.9800000000000004, and the next request —
    // Math.min(1, cur + 0.06) === 1 — is a delta of 0.019999999999999574, just
    // under setRenderScale's 0.02 dead zone, so it is rejected and the scale
    // pins at 0.98 for the session. That is a 4% pixel deficit nobody asked for,
    // but the real damage was structural: `cur < 1` then stays true forever, so
    // the tier-restore `else if` below was unreachable and a shed feature could
    // never come back. That is the same one-way door the RESTORE_UNDER = 4.2
    // post-mortem in this header was written to close, reintroduced by a float
    // epsilon. Falling through on a rejected step lets the ladder restore.
    // THE SNAP HAS TO HAPPEN A STEP EARLY, not at the end. Going to 1 only once
    // cur + 0.06 exceeds 1 does not work: from 0.9800000000000004 the request IS
    // exactly 1, and |1 - 0.98000000000000043| = 0.019999999999999574, still
    // inside the 0.02 dead zone. The last 0.02 of the range is unreachable by
    // any step that starts inside it. So snap when the remaining gap is under
    // one and a half steps and take it in one 0.08 move, which clears the zone:
    // 0.5 -> ... -> 0.9200000000000004 -> 1. (Verified by float trace; the
    // recovery test in tests/unit/perf-governor.test.mjs asserts it lands on
    // exactly 1.)
    let stepped = false;
    if (_autoRes && cur < 1) {
      const next = (1 - cur) < 0.09 ? 1 : cur + 0.06;
      stepped = !!_gfx.setRenderScale(next);
      if (stepped) {
        _pendingVerify = { kind: "scale", prev: cur, ema: _frameEMA, up: true };
        _govCool = 240;
      }
    }
    // Features come back only at full res under the same sustained headroom,
    // one per ~4 s — and never below the crash-sentinel floor OR the user's
    // GRAPHICS preset floor (_floorTier folds both).
    if (!stepped && _perfTier > _floorTier()) {
      _pendingVerify = { kind: "tier", prev: _perfTier, shed: _autoShed, ema: _frameEMA, up: true };
      _perfTier--; if (_autoShed > 0) _autoShed--; _govCool = 240;
    }
  }
}

// Forget the crash history and lift the floor NOW, without waiting for whole
// finished races to pay it down one at a time. The escape hatch behind
// __apex.safeMode(false).
function clearStrikes() {
  _crashStrikes = 0;
  _perfTierFloor = _floorFromStrikes(_crashStrikes);
  // Same latch release as cleanRace(): lifting the floor alone left `_perfTier`
  // sitting on evidence earned under the old floor, so tier() stayed high after
  // __apex.safeMode(false) until a reload. Drop to the new floor so the device
  // can prove itself again (governor may re-shed if frames still miss).
  if (_perfTier > _floorTier()) { _perfTier = _floorTier(); _autoShed = 0; }
  GameStore.store.rawSet(SENT_STRIKES, "0"); GameStore.store.rawDel(SENT_ACTIVE);
}

return {
  init, tick, sentinelArm, sentinelResume, cleanRace, clearStrikes,
  tier: () => Math.max(_perfTierFloor, _userTier, _perfTier),
  // Crash + measured only — no GRAPHICS user floor. Look-defining post
  // (bloom / SSAO / god-rays / contact / lamp volumetrics) reads this so
  // GRAPHICS: LOW still sheds env/SSR/shadows via tier() but the lighting
  // tuner stays live unless the device proved it cannot afford the pass.
  // READS _perfTier ON PURPOSE, and a draft of the preset-release fix below got
  // this wrong in a way worth recording. That draft derived the governor tier as
  // (floor + its own shed count) so the two could be separated cleanly — but the
  // degrade branch stops once _floorTier() + sheds reaches 4, and _floorTier()
  // folds in _userTier while this accessor does not. The shed count was therefore
  // capped at 4 - _userTier, and this returned at most that: measured 2 on
  // GRAPHICS: MEDIUM (every phone's default) and 0 on LOW, so bloom, SSAO,
  // god-rays, contact shadows and lamp volumetrics became UNSHEDABLE however
  // badly the device was missing frames — the opposite of what a low preset is
  // for. _perfTier is the effective tier and can always climb to 4, so the
  // tier-4 consumers stay reachable on every preset.
  autoTier: () => Math.max(_perfTierFloor, _perfTier),
  // What the GOVERNOR shed on its own measurements, plus the crash floor, and
  // nothing the player asked for. The gate for anything held off "because this
  // device is actually missing frames" — see _autoShed for why this is a second
  // accessor rather than a redefinition of autoTier().
  autoShed: () => Math.max(_perfTierFloor, _autoShed),
  tierFloor: () => _perfTierFloor,
  userTier: () => _userTier,
  // Clamped to the ladder's own range so a bad preset id can't invent a tier 7
  // that every `tier() >= N` gate would satisfy. Drops a pending TIER verify for
  // the same reason setAutoRes drops a pending SCALE one: _pendingVerify
  // attributes the next EMA delta to the governor's own last provisional step,
  // so a user changing quality one evaluation later would make the governor
  // revert a step that was actually working.
  setUserTier: (n) => {
    const t = Math.max(0, Math.min(4, n | 0));
    if (t === _userTier) return;
    const prev = _userTier;
    _userTier = t;
    // RAISING QUALITY MUST RELEASE WHAT THE OLD PRESET CAUSED. The degrade
    // branch steps from _floorTier(), which folds in _userTier, so a shed taken
    // while the player sat on MEDIUM wrote _perfTier = 3 — the governor adopted
    // the preset as its own evidence, exactly what the note below forbids. On a
    // phone (default MEDIUM) that made GRAPHICS one-way: raising to HIGH left
    // tier() at 3, so SSR, per-chunk lamps and both shadow maps stayed off until
    // a reload, and ULTRA only appeared to fix it because it flips the mobileHigh
    // bit and forces one. Dropping to the new floor on a RAISE gives the device a
    // clean chance to prove itself; if it still cannot hold the budget the
    // governor re-sheds within a couple of evaluations, on its own measurements.
    if (t < prev && _perfTier > _floorTier()) { _perfTier = _floorTier(); _autoShed = 0; }
    // _perfTier is deliberately NOT touched here. It is the governor's OWN
    // evidence-based tier; the floors are applied at READ time in tier(). An
    // earlier draft pulled _perfTier up to the new floor, which conflated "shed
    // because the device struggled" with "shed because the player asked" — and
    // then lowering the preset could not release what the preset itself had
    // caused, because the governor had adopted it as its own finding. The
    // redundant-step problem that motivated the pull-up is solved where it
    // actually lives, in the degrade branch, which skips rungs the floor
    // already covers.
    if (_pendingVerify && _pendingVerify.kind === "tier") _pendingVerify = null;
    if (_live) _govCool = Math.max(_govCool, VERIFY_COOL);   // see _live: never before the first race tick
  },
  strikes: () => _crashStrikes,
  // {frames, maxMs, slow} for the first OPEN_FRAMES of the current race — the
  // instrument for a "laggy at first, fine afterwards" report. See _openN.
  openWindow: () => ({ frames: _openN, maxMs: +_openMax.toFixed(1), slow: _openSlow }),
  fpsEMA: () => _frameEMA,
  floorMs: () => _floorMs,
  autoRes: () => _autoRes,
  // Drop any unverified SCALE step on the way in or out of manual resolution.
  // _pendingVerify holds {kind:"scale", prev} and the next evaluation would
  // "revert" it by calling setRenderScale(prev) — writing over the scale the
  // user just pinned, one evaluation after they pinned it. The tier half of a
  // pending verify is still valid (the ladder keeps running either way), so
  // only the scale kind is dropped. The cooldown gives the EMA time to settle
  // at the new scale before stage 2 judges anything against it.
  setAutoRes: (on) => {
    _autoRes = !!on;
    if (_pendingVerify && _pendingVerify.kind === "scale") _pendingVerify = null;
    if (_live) _govCool = Math.max(_govCool, VERIFY_COOL);   // see _live: never before the first race tick
  },
};
})();
