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

// ── Adaptive-resolution governor ─────────────────────────────────────────────
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
//   2  lamp spot shadow + wet-road SSR off
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
// The USER's floor, from the GRAPHICS preset (js/game/gfx-quality.js). It is a
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
  _gfx = gfx;
  // Any phone (isMobile), NOT just the memory-safe STANDARD tier (mobileTier):
  // a device that opted into GRAPHICS: HIGH is the one MOST likely to get
  // jetsam-killed, so it needs the crash sentinel + conservative restart too.
  // Desktop stays isMobile=false, so the test suite never enters safe mode.
  if (gfx && gfx.isMobile) {
    try {
      const build = String((typeof window !== "undefined" && window.__APEX_BUILD) || 0);
      if (localStorage.getItem(SENT_BUILD) !== build) {
        // New code, clean slate. Also clears any in-flight race flag: a race
        // that was running when the update landed did not crash, it was
        // replaced.
        localStorage.setItem(SENT_BUILD, build);
        localStorage.setItem(SENT_STRIKES, "0");
        localStorage.removeItem(SENT_ACTIVE);
      }
      _crashStrikes = Math.min(4, parseInt(localStorage.getItem(SENT_STRIKES), 10) || 0);
      if (localStorage.getItem(SENT_ACTIVE) === "1") {
        _crashStrikes = Math.min(4, _crashStrikes + 1);
        localStorage.setItem(SENT_STRIKES, String(_crashStrikes));
        localStorage.removeItem(SENT_ACTIVE);
      }
    } catch (_) {}
  }
  _perfTierFloor = _crashStrikes >= 2 ? 4 : (_crashStrikes >= 1 ? 2 : 0);
  _perfTier = _perfTierFloor;
}

function sentinelArm(on) {
  if (!_gfx || !_gfx.isMobile) return;
  try { if (on) localStorage.setItem(SENT_ACTIVE, "1"); else localStorage.removeItem(SENT_ACTIVE); } catch (_) {}
}
function cleanRace() {
  sentinelArm(false);
  if (_crashStrikes > 0) {
    _crashStrikes--;
    try { localStorage.setItem(SENT_STRIKES, String(_crashStrikes)); } catch (_) {}
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
  // Ignore huge spikes (tab resume, GC): they'd yank the scale.
  if (dtMs < 100) {
    _frameEMA += (dtMs - _frameEMA) * 0.1;
    _floorMs += (dtMs - _floorMs) * (dtMs < _floorMs ? FLOOR_DOWN_A : FLOOR_UP_A);
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
      if (v.kind === "scale") _gfx.setRenderScale(v.prev);
      else _perfTier = v.prev;
      _govCool = VERIFY_COOL;
      return;
    }
  }

  const degradeAt = _floorMs + DEGRADE_OVER, restoreAt = _floorMs + RESTORE_WITHIN;
  const cur = _gfx.getRenderScale ? _gfx.getRenderScale() : 1;
  if (_frameEMA > degradeAt) {                 // meaningfully slower than THIS device's own floor: degrade PROMPTLY
    // With the scale PINNED (_autoRes false) the ladder is the only lever left,
    // so fall straight through to shedding instead of skipping the evaluation.
    if (_autoRes && cur > 0.5) {
      if (_gfx.setRenderScale(cur - 0.1)) {
        _pendingVerify = { kind: "scale", prev: cur, ema: _frameEMA };
        _govCool = 30; _downHold = 600;
      }
    } else if (Math.max(_perfTier, _floorTier()) < 4) {   // scale floor hit — shed a feature
      // Step from the EFFECTIVE tier, not from _perfTier alone. A rung at or
      // below the floor (crash sentinel, or the player's GRAPHICS preset) is
      // already shed, so incrementing onto it changes nothing the EMA can see:
      // the causal check would read "this step bought nothing", revert it, and
      // re-try the same dead rung every cycle while frames keep missing —
      // _pendingVerify's own failure mode, reached from a direction it cannot
      // distinguish, because the step genuinely did not help and the reason
      // (redundant, not mis-targeted) is invisible to a frame-time delta.
      // Skipping to floor+1 guarantees every step is one that can be felt.
      _pendingVerify = { kind: "tier", prev: _perfTier, ema: _frameEMA };
      _perfTier = Math.max(_perfTier, _floorTier()) + 1; _govCool = 90; _downHold = 600;
    }
  } else if (_frameEMA < restoreAt && _downHold === 0) {   // clear, SETTLED headroom (~10 s since the last cut): restore slowly
    // The up-step is VERIFIED like the down-step. Restoring is a guess that the
    // headroom is real, and the same _pendingVerify machinery that reverts a
    // useless cut reverts a premature restore one evaluation later — without
    // it, a governor that can finally go up could climb straight back into the
    // frame misses it just escaped, which is the oscillation the header warns
    // about arriving from the other side.
    if (_autoRes && cur < 1) {
      const next = Math.min(1, cur + 0.06);
      if (_gfx.setRenderScale(next)) {
        _pendingVerify = { kind: "scale", prev: cur, ema: _frameEMA, up: true };
        _govCool = 240;
      }
    }
    // Features come back only at full res under the same sustained headroom,
    // one per ~4 s — and never below the crash-sentinel floor OR the user's
    // GRAPHICS preset floor (_floorTier folds both).
    else if (_perfTier > _floorTier()) {
      _pendingVerify = { kind: "tier", prev: _perfTier, ema: _frameEMA, up: true };
      _perfTier--; _govCool = 240;
    }
  }
}

// Forget the crash history and lift the floor NOW, without waiting for whole
// finished races to pay it down one at a time. The escape hatch behind
// __apex.safeMode(false).
function clearStrikes() {
  _crashStrikes = 0;
  _perfTierFloor = 0;
  try { localStorage.setItem(SENT_STRIKES, "0"); localStorage.removeItem(SENT_ACTIVE); } catch (_) {}
}

return {
  init, tick, sentinelArm, cleanRace, clearStrikes,
  tier: () => Math.max(_perfTierFloor, _userTier, _perfTier),
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
    _userTier = t;
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
    _govCool = Math.max(_govCool, VERIFY_COOL);
  },
  strikes: () => _crashStrikes,
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
    _govCool = Math.max(_govCool, VERIFY_COOL);
  },
};
})();
