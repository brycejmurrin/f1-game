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

// Why: docs/GOVERNOR-RATIONALE.md §gov-1.
let _frameEMA = 16.7;
// Why: docs/GOVERNOR-RATIONALE.md §gov-2.
let _govT = 0;            // frames since the last evaluation
let _govCool = 0;         // frames left in a post-step verify window
let _govCoolMs = 0;       // ms left before the governor may act again (wall clock)
let _autoRes = true;
let _downHold = 0;        // ms left on the recovery hold after a cut / refused climb
// Consecutive frames over SPIKE_MS. Reset by any in-budget frame and by
// sentinelArm(), so a fresh race never inherits a previous session's run.
let _slowRun = 0;
// Why: docs/GOVERNOR-RATIONALE.md §gov-3.
let _live = false;
// ms: 10 s … 2 min
const UP_BACKOFF_MIN = 10000;
const UP_BACKOFF_MAX = 120000;
// The most one frame may pay into a wall-clock counter: a 400 ms stall or a
// 60 s tab resume is one slow FRAME, not a spent cooldown.
const COOL_STEP_MAX_MS = 100;
let _upBackoff = UP_BACKOFF_MIN;   // wait before the next restore attempt after a refused climb
// Why: docs/GOVERNOR-RATIONALE.md §gov-4.
const CLIMB_SURVIVE_MS = 30000;
// Why: docs/GOVERNOR-RATIONALE.md §gov-5.
let _scaleCap = Infinity;
// The CONFIGURED ceiling, separate from the measured one above: the highest scale the resolution
// stage may climb to. 1 everywhere except a phone on RESOLUTION AUTO, where js/ui/scale.js sets
// 0.75 (#5227): AUTO there means "MED's sharpness, and the governor may drop pixels when the
// frame rate needs it". It is a setting, not a measurement, so nothing here expires or resets it.
let _resCeil = 1;
// Why: docs/GOVERNOR-RATIONALE.md §gov-6.
let _capProbeMs = CLIMB_SURVIVE_MS;
// Re-measuring the same ceiling is itself a hitch, so the probe is never more
// frequent than the backoff those refusals have already bought.
function _armCapProbe() { _capProbeMs = Math.max(CLIMB_SURVIVE_MS, _upBackoff); }
let _sinceUp = -1;   // ms since the last accepted up-step; -1 when none is on probation
// The hold a cut earns. 10 s normally — enough for the EMA to settle before the
// restore gate can reopen. When the cut UNDOES a climb still on probation the
// two are one oscillation, not two independent readings, so it costs the same
// doubling patience a refused climb does (10 s, 20 s, 40 s … 2 min).
function _chargeCut() {
  if (_sinceUp < 0) return 10000;
  _sinceUp = -1;
  _upBackoff = Math.min(_upBackoff * 2, UP_BACKOFF_MAX);
  return _upBackoff;
}
// Why: docs/GOVERNOR-RATIONALE.md §gov-7.
const DEGRADE_CONFIRM = 2;
let _degradeArm = 0;
// Scale changes the governor has spent since race start — the first is prompt.
let _scaleMoves = 0;
// Why: docs/GOVERNOR-RATIONALE.md §gov-8.
let _scaleFutile = false;
// Same idea for the FEATURE ladder, after ALL remaining rungs were tested.
// A failed rung alone says nothing about later, independent features. Without
// a latch after exhaustion, the same ineffective ladder is retried forever —
// on LOW that step is the whole post stack (bloom, SSAO, god-rays, contact,
// lamp volumetrics), so a CPU-bound device saw them strobe on and off every
// ~8 s. Latched on a reverted DOWN step; released when headroom returns or the
// player changes preset (either changes what a step means).
let _tierFutile = false;

// PHONE SLOW LATCH (BrowserStack iPhone 15 deep profile 2026-10-22): JS was
// only 3.8–6.4 ms of 17–28 ms frames (GPU/fill-bound), yet the governor still
// restored to autoTier 0 once EMA looked calm at the shed quality — and the
// full look-post stack came back. A verified feature shed on a phone therefore
// latches for the rest of the session: the restore branch must not promote
// effects back. Cleared by clearStrikes / safeMode(false), or when the player
// RAISES GRAPHICS (setUserTier to a lower rung) to opt back in.
let _phoneSlowLatch = false;
// Why: docs/GOVERNOR-RATIONALE.md §gov-9.
let _computeBound = false;
let _floorMinMs = 16.7;
let _floorShadowMs = 16.7;
// Set by any frame below `_floorMinMs` (see tick): this episode has shown a
// cheap moment, so its steps' verify evidence is scene variance as much as
// device cost and the latch must not engage. Cleared when the episode ends —
// the restore branch, or race start. A §2au episode never sets it.
let _cheapSeen = false;

// Why: docs/GOVERNOR-RATIONALE.md §gov-10.
let _floorMs = 16.7;
const FLOOR_DOWN_A = 0.3;
const FLOOR_UP_A = 0.02;
const FLOOR_UP_A_BOUND = 0.002;   // §2au: the creep rate while _computeBound holds (see below)
// Why: docs/GOVERNOR-RATIONALE.md §gov-11.
const SPIKE_MS = 100;
const SPIKE_RUN = 3;
const SLOW_CAP = 1000;
const DEGRADE_OVER = 2.3;      // degrade at floor+2.3
const RESTORE_WITHIN = 0.6;    // restore once the EMA is back within 0.6 of the floor

// Why: docs/GOVERNOR-RATIONALE.md §gov-12.
let _pendingVerify = null;   // {kind:"scale"|"tier", prev, ema} for the last unverified step
const VERIFY_MARGIN = 0.5;
const VERIFY_COOL = 5000;   // ms: the wait after a step that made things worse
// Why: docs/GOVERNOR-RATIONALE.md §gov-13.
const STALL_TRIM = 2;
let _evEMA = 16.7;
let _stallsTrimmed = 0;   // this evaluation window

// Feature-shedding tiers: the governor's SECOND stage.
// Resolution scaling can't rescue costs that don't shrink with the render
// target: the per-frame car/lamp shadow depth passes, the env-probe world
// re-render, SSAO's three passes, the god-ray march, the SSR march. When the
// scale has already bottomed out and frames are STILL slow, shed features one
// tier at a time — cheapest visual loss first — and restore them only under
// clear sustained headroom at FULL resolution, so the ladder can't oscillate:
//   1  env probe off        (car paint falls back to the analytic sky mirror)
//   2  lamp spot shadow + SSR march off (dry sheens + car-paint; wet-road SSR survives)
//   3  car sun-shadow map off (the blob contact shadow remains) + reduced wet-road SSR
//   4  SSAO + god rays + bloom off

// Why: docs/GOVERNOR-RATIONALE.md §gov-14.
const SENT_ACTIVE = "apex26.raceActive";
// Set from tick(), which game.js only calls in race/count. loadTrackStepped
// arms SENT_ACTIVE for menu Home/flyby builds too (a reload during SCENE
// LOADING after Quali left the flag set). Without this, that reload counted
// as a jetsam kill and two of them pin tier 4 — shader warm then sits on the
// 30 s ceiling. A flag with no tick never entered a session.
const SENT_TICKED = "apex26.raceTicked";
const SENT_STRIKES = "apex26.crashStrikes";
// Why: docs/GOVERNOR-RATIONALE.md §gov-15.
const SENT_BUILD = "apex26.crashStrikesBuild";
// DIAGNOSTIC ONLY, and deliberately NOT build-keyed: a lifetime count of races
// that ended without a clean finish, plus the build the last one died on. The
// strike ledger above expires with the code because it drives the quality
// floor; this one has to outlive a deploy or it cannot answer "is this thing
// being killed at all", which is the first question any field report asks.
const SENT_SEEN = "apex26.crashSeen";
const SENT_SEEN_BUILD = "apex26.crashSeenBuild";
let _crashStrikes = 0;
let _raceTicked = false;   // this document already stamped SENT_TICKED
// Safe-mode floor the governor's restore path can't climb below (per session —
// only strikes paying off across boots lift it): one strike starts with
// lamp-shadow/SSR-class features shed (tier 2), two or more shed the whole
// heavy post stack too (tier 4).
let _perfTierFloor = 0;
let _perfTier = 0;
// Why: docs/GOVERNOR-RATIONALE.md §gov-16.
let _autoShed = 0;
// Why: docs/GOVERNOR-RATIONALE.md §gov-17.
let _tierHold = false;
let _swGarageScaleSaved = null;
let _swRaceScale = null;
// Why: docs/GOVERNOR-RATIONALE.md §gov-18.
const OPEN_FRAMES = 600;   // ~10 s at 60 fps, ~20 s at 30
let _openN = 0;
let _openMax = 0;
let _openSlow = 0;
// Why: docs/GOVERNOR-RATIONALE.md §gov-19.
let _userTier = 0;
// The combined floor nothing may restore below. Both terms are "shed AT LEAST
// this much": one because the device has been crashing, one because the player
// asked for it.
function _floorTier() { return Math.max(_perfTierFloor, _userTier); }

// One derived-floor adaptation, shared by the fast path and the slow-run path
// in tick(): pulled toward a faster sample at FLOOR_DOWN_A, crept toward a
// slower one at FLOOR_UP_A — or at FLOOR_UP_A_BOUND while §2au evidence holds,
// so a compute-bound device's budget cannot converge on its own slowness and
// close the ladder. `_floorMinMs` tracks the race's lowest observed floor.
function _floorStep(x) {
  _floorShadowMs += (x - _floorShadowMs) * (x < _floorShadowMs ? FLOOR_DOWN_A : FLOOR_UP_A);
  _floorMs += (x - _floorMs) * (x < _floorMs ? FLOOR_DOWN_A : (_computeBound ? FLOOR_UP_A_BOUND : FLOOR_UP_A));
  if (_floorMs < _floorMinMs) _floorMinMs = _floorMs;
}
// §2au evidence arrived: judge the rest of this episode against the budget the
// device had when it began, not the one its slowness has since negotiated.
function _latchBound() {
  if (_computeBound || _cheapSeen) return;
  _computeBound = true;
  if (_floorMinMs < _floorMs) _floorMs = _floorMinMs;
}

function init(gfx) {
  Log.info("game", "PerfGov.init");
  _gfx = gfx;
  try { setThermalDrift(GameStore.store.raw("apex26.thermalDrift") === "1"); } catch (_) { /* storage blocked: off */ }
  // Any phone (isMobile), NOT just the memory-safe STANDARD tier (mobileTier):
  // a device that opted into GRAPHICS: HIGH is the one MOST likely to get
  // jetsam-killed, so it needs the crash sentinel + conservative restart too.
  // Desktop stays isMobile=false, so the test suite never enters safe mode.
  if (gfx && gfx.isMobile) {
    const st = GameStore.store;   // raw lane: bare strings, read live, never throws
    const build = String((typeof window !== "undefined" && window.__APEX_BUILD) || 0);
    if (st.raw(SENT_ACTIVE) === "1" && st.raw(SENT_TICKED) === "1") {
      st.rawSet(SENT_SEEN, String((parseInt(st.raw(SENT_SEEN), 10) || 0) + 1));
      st.rawSet(SENT_SEEN_BUILD, st.raw(SENT_BUILD) || "?");
    }
    if (st.raw(SENT_BUILD) !== build) {
      // Why: docs/GOVERNOR-RATIONALE.md §gov-20.
      st.rawSet(SENT_BUILD, build);
      st.rawSet(SENT_STRIKES, "0");
      st.rawDel(SENT_ACTIVE);
      st.rawDel(SENT_TICKED);
    }
    _crashStrikes = Math.min(4, parseInt(st.raw(SENT_STRIKES), 10) || 0);
    if (st.raw(SENT_ACTIVE) === "1") {
      // Only a session that presented a race/count frame is a crash. A menu
      // world build (Home circuit after Quali, race-settings flyby) arms the
      // same flag and a reload mid-build must not spend a strike.
      if (st.raw(SENT_TICKED) === "1") {
        _crashStrikes = Math.min(4, _crashStrikes + 1);
        st.rawSet(SENT_STRIKES, String(_crashStrikes));
      }
      st.rawDel(SENT_ACTIVE);
    }
    st.rawDel(SENT_TICKED);
  }
  _perfTierFloor = _floorFromStrikes(_crashStrikes);
  _perfTier = _perfTierFloor;
  _autoShed = 0;
  _phoneSlowLatch = false;
  // Two strikes: the phone was killed twice, so boot with the smallest backing store too (TLX reads this after create; GLX has no capDpr).
  if (_crashStrikes >= 2 && gfx && gfx.isMobile && typeof gfx.capDpr === "function") gfx.capDpr(1);
}

// ONE owner for the strikes -> floor mapping, shared by init and cleanRace(), so
// paying a strike down moves the floor with the counter (see cleanRace()).
function _floorFromStrikes(n) { return n >= 2 ? 4 : (n >= 1 ? 2 : 0); }

// Why: docs/GOVERNOR-RATIONALE.md §gov-21.
function sentinelResume() {
  // A CLIMB CANNOT BE ON PROBATION ACROSS TIME NOBODY MEASURED. `_sinceUp`
  // ages only inside tick(), which never runs while the tab is hidden, so a
  // climb accepted before a ten-minute background stint came back reading as
  // seconds old — and the first cut after the resume then charged it the full
  // doubling penalty for load the climb was never tested against. That is the
  // same reasoning that keeps this function from resetting the EMAs: a tab
  // return is not evidence. Drop the probation instead of charging it.
  _sinceUp = -1;
  if (!_gfx || !_gfx.isMobile) return;
  GameStore.store.rawSet(SENT_ACTIVE, "1");
}
function sentinelArm(on) {
  // Why: docs/GOVERNOR-RATIONALE.md §gov-22.
  if (on) { _frameEMA = _floorMs = 16.7; _slowRun = 0; _openN = 0; _openMax = 0; _openSlow = 0;
            // Evaluation and verification state is race-local too. A quality
            // change late in the previous race can leave a five-second
            // cooldown behind; carrying it across the menu spends the next
            // race's only opening window while the derived floor catches the
            // slow frame cost. A provisional verdict from the previous circuit is
            // equally invalid against the new race's reset averages.
            _govT = 0; _govCool = 0; _govCoolMs = 0; _pendingVerify = null; _evEMA = 16.7; _stallsTrimmed = 0;
            _sinceUp = -1; _scaleCap = Infinity; _capProbeMs = CLIMB_SURVIVE_MS;
            _scaleMoves = 0; _degradeArm = 0;
            // A futile ladder measured in a DRY race must not block the next (wet) race's shed.
            _tierFutile = false; _scaleFutile = false;
            _computeBound = false; _cheapSeen = false; _floorMinMs = 16.7; _floorShadowMs = 16.7; } else _live = false;   // §2au verdicts are race-local too
  if (!_gfx || !_gfx.isMobile) return;
  if (on) {
    _raceTicked = false;
    GameStore.store.rawDel(SENT_TICKED);
    GameStore.store.rawSet(SENT_ACTIVE, "1");
  } else {
    _raceTicked = false;
    GameStore.store.rawDel(SENT_ACTIVE);
    GameStore.store.rawDel(SENT_TICKED);
  }
}
function cleanRace() {
  sentinelArm(false);
  if (_crashStrikes > 0) {
    _crashStrikes--;
    GameStore.store.rawSet(SENT_STRIKES, String(_crashStrikes));
    // Why: docs/GOVERNOR-RATIONALE.md §gov-23.
    _setCrashFloor();
  }
}

// Re-derive the crash floor from the strike counter. When it DROPS, _perfTier
// may be sitting on the OLD one (init() seeds it there, and the degrade branch
// steps from _floorTier(), so it absorbs whatever floor was live when it fired).
// Release it to the new CRASH floor and let the governor re-earn any shed from
// its own measurements. Not _floorTier(): that folds in the GRAPHICS preset, so
// one strike paid down on MEDIUM (2 > 2 is false) left autoTier() pinned at the
// old floor for the session (#3294). tier() still applies the preset at read time.
function _setCrashFloor() {
  const prev = _perfTierFloor;
  _perfTierFloor = _floorFromStrikes(_crashStrikes);
  if (_perfTierFloor < prev && _perfTier > _perfTierFloor) { _perfTier = _perfTierFloor; _autoShed = 0; }
}

// Bounded raw-frame history supplements the EMA: occasional hitches must not
// disappear from diagnostics just because the next second was smooth.
const frameHistory = new Float64Array(2048);
let frameCursor = 0, frameCount = 0, droppedSimS = 0, physicsSteps = 0;
function resetFrameStats() { if (_drift) _drift.reset(); frameCursor = 0; frameCount = 0; droppedSimS = 0; physicsSteps = 0; }
function recordSimulation(steps, dropped) {
  physicsSteps += Math.max(0, steps || 0); droppedSimS += Math.max(0, dropped || 0);
}
function frameStats() {
  const a = Array.from(frameHistory.subarray(0, frameCount)).sort((x, y) => x - y);
  const q = p => a.length ? a[Math.ceil((a.length - 1) * p)] : 0;
  return { frames: a.length, p50: q(0.5), p95: q(0.95), p99: q(0.99), maxMs: q(1),
    droppedSimS, physicsSteps, windowFrames: frameHistory.length };
}

// Why: docs/GOVERNOR-RATIONALE.md §gov-24.
function _ageClocks(stepMs) {
  // Clamped at 0: the restore gate below tests `_downHold === 0`, and a ms
  // decrement overshoots where a frame count landed exactly.
  if (_downHold > 0) _downHold = Math.max(0, _downHold - stepMs);   // recovery hold runs down in wall time
  // The survival clock runs on the same wall time as the holds, and for the
  // same reason: a promise made in seconds must not run twice as fast on a
  // 120 Hz display. Before the cooldown returns below, so a climb keeps ageing
  // while the governor is not evaluating. Reaching the window means the climb
  // was real — release the patience the refusals bought and stop watching it.
  if (_sinceUp >= 0 && (_sinceUp += stepMs) >= CLIMB_SURVIVE_MS) { _sinceUp = -1; _upBackoff = UP_BACKOFF_MIN; }
  // Headroom has to be UNBROKEN to age the ceiling: any frame back over the
  // restore threshold restarts the two minutes, so a device that is merely
  // between heavy sections never probes its way back up.
  if (_scaleCap <= 1) {
    // §2au: headroom is judged against the SUSTAINED floor (the shadow, which
    // never rewinds) — against the held floor a plateaued EMA would read as
    // "still missing" forever and the ceiling could never age out.
    if (_frameEMA < Math.max(_floorMs, _floorShadowMs) + RESTORE_WITHIN) {
      if ((_capProbeMs -= stepMs) <= 0) { _scaleCap = Infinity; _armCapProbe(); }
    } else _armCapProbe();
  }
  if (_govCoolMs <= 0) return false;
  _govCoolMs = Math.max(0, _govCoolMs - stepMs);
  return true;   // was cooling: no evaluation this frame
}

let _ticks = 0;
function tick(dtMs, drawn) {
  _ticks++;   // ticks(): game.js calls tick() only on race/count frames past every hold (paused, restart, mirror prep, program warm)
  // First race/count sample: the session existed. Menu loadTrackStepped arms
  // SENT_ACTIVE but never reaches here (game.js gates tick on race/count).
  if (!_raceTicked && _gfx && _gfx.isMobile) {
    _raceTicked = true;
    try { GameStore.store.rawSet(SENT_TICKED, "1"); } catch (_) { /* storage blocked: next boot will not count this session */ }
  }
  if (Number.isFinite(dtMs) && dtMs > 0) {
    frameHistory[frameCursor] = dtMs; frameCursor = (frameCursor + 1) % frameHistory.length;
    frameCount = Math.min(frameHistory.length, frameCount + 1);
  }
  // Why: docs/GOVERNOR-RATIONALE.md §gov-25.
  _live = true;
  // A zero / negative / NaN interval is a stamp artefact (pause -> resume: lastFrame is set in a handler, so the next rAF stamp can be earlier), not a frame: fed to the EMA and the derived floor it drags the floor under every healthy frame and trips a spurious step-down (then a revert). The history above already skips it.
  if (!(dtMs > 0)) return;
  const stepMs = Number.isFinite(dtMs) ? Math.min(dtMs, COOL_STEP_MAX_MS) : 16.7;
  // Thermal windows age on every active interval, but skipped rAFs are not cost evidence.
  const driftDue = _drift && _drift.feed(drawn !== false && dtMs < SPIKE_MS ? dtMs : 0, dtMs);
  if (drawn === false) { _ageClocks(stepMs); return; }   // see _ageClocks
  if (driftDue && dtMs < SPIKE_MS && (driftRenderRate() || driftStep())) _drift.stepped();
  // Before any smoothing: the opening window wants the raw frame, spikes and
  // all, because a spike in the first seconds IS the thing being reported.
  if (_openN < OPEN_FRAMES) {
    _openN++;
    if (dtMs > _openMax) _openMax = dtMs;
    if (dtMs > _floorMs * 2) _openSlow++;
  }
  // §2au release: a frame below the race's best cadence (`_floorMinMs`) is a
  // cheap moment — the device just demonstrated its budget is intact, so any
  // compute-bound verdict from earlier steps is spent. A §2au device never
  // shows one; a device whose slowness comes with scene-variance cheap
  // frames clears the latch with them and is governed exactly as before.
  if (dtMs < _floorMinMs) { _computeBound = false; _cheapSeen = true; }
  let fed = -1;
  if (dtMs < SPIKE_MS) {
    _slowRun = 0;
    fed = dtMs;
  } else if (++_slowRun >= SPIKE_RUN) {
    fed = Math.min(dtMs, SLOW_CAP);
  }
  if (fed >= 0) {
    _frameEMA += (fed - _frameEMA) * 0.1;
    // Against the floor BEFORE this sample moves it. See STALL_TRIM.
    const ev = fed > _floorMs * 2.5 && _stallsTrimmed < STALL_TRIM ? (_stallsTrimmed++, _floorMs * 2) : fed;
    _evEMA += (ev - _evEMA) * 0.1;
    _floorStep(fed);
  }
  if (_ageClocks(stepMs)) return;
  if (_govCool > 0) { _govCool--; return; }   // a verify window: frames, so the EMA has its samples
  if (++_govT < 45) return;   // evaluate ~every 45 frames (an EMA settling span, not a clock)
  _govT = 0;
  const ev = _evEMA; _stallsTrimmed = 0;   // see STALL_TRIM

  // Verify the last step before taking a new one.
  if (_pendingVerify) {
    const v = _pendingVerify; _pendingVerify = null;
    // Why: docs/GOVERNOR-RATIONALE.md §gov-26.
    const failed = v.up ? (ev > v.ema + VERIFY_MARGIN)
                        : (ev > v.ema - (v.big ? Math.max(VERIFY_MARGIN, (v.ema - _floorMs) / 2) : VERIFY_MARGIN));
    if (failed) {
      // Env may already be off while bloom is still expensive. Test the next
      // rung before declaring the whole ladder futile. Keep the original
      // baseline and rollback state: small cumulative gains must count, and
      // a capped clock must get ALL its quality back if no rung helps.
      // Continue this bounded probe even if the floor adapted during verify;
      // otherwise a slow steady frame closes the gate before later rungs run.
      if (v.kind === "tier" && !v.up && _perfTier < 4) {
        _perfTier++; _autoShed++; _pendingVerify = v; _govCool = 90;
        return;
      }
      if (v.kind === "scale") {
        // Why: docs/GOVERNOR-RATIONALE.md §gov-27.
        const now = _gfx.getRenderScale ? _gfx.getRenderScale() : 1, big = 0.5;
        if (!v.up && !v.big && _autoRes && big < now - 0.05 && _gfx.setRenderScale(big)) {
          _scaleCap = Math.min(_scaleCap, now); _armCapProbe();   // the small cut's scale missed too
          _pendingVerify = { kind: "scale", prev: v.prev, ema: v.ema, big: true };
          _govCool = 30; _scaleMoves++;
          return;
        }
        _gfx.setRenderScale(v.prev);
        // The rung it just refused is a measured ceiling, not only a reason to wait.
        if (v.up && v.next) { _scaleCap = Math.min(_scaleCap, v.next); _armCapProbe(); }
        // A DOWN step that bought nothing means this frame is not fill-bound,
        // so stepping the scale again would revert again. Fall through to the
        // feature ladder on the next evaluation instead of re-testing a lever
        // this device has just answered for. (An UP step failing says the
        // opposite — there was no headroom — and implies nothing about fill.)
        if (!v.up) _scaleFutile = true;
      } else { _perfTier = v.prev; _autoShed = v.shed; if (!v.up) _tierFutile = true; }
      _govCoolMs = VERIFY_COOL;
      // A failed UP step is the device saying "no headroom". Without a hold
      // the restore gate (EMA under the floor, _downHold 0) was true again
      // one cooldown later, so restore → verify-fail → revert cycled every
      // ~10 s for the whole race — with the scale lever that is a full
      // render-target reallocation each time. Back off: each refused climb
      // doubles the wait before the next try (10 s, 20 s, 40 s, … 2 min).
      if (v.up) { _sinceUp = -1; _downHold = _upBackoff; _upBackoff = Math.min(_upBackoff * 2, UP_BACKOFF_MAX); }
      // §2au, the failure half: a refused CLIMB is scale-response evidence too
      // (cost rose when resolution did), so it latches; a refused DOWN step
      // that reaches here is final — the continuations above returned — and
      // final indifference clears the latch. See _computeBound.
      if (v.up) _latchBound(); else _computeBound = false;
      return;
    }
    // Verified feature shed on a phone: latch so headroom cannot restore full
    // effects (tile-GPU fill cost comes back with autoTier 0). A futile probe
    // that rolls every rung back never reaches here.
    if (v.kind === "tier" && !v.up && _gfx && _gfx.isMobile) _phoneSlowLatch = true;
    // §2au, the success half: a DOWN step the EMA felt is the compute-bound
    // proof; an UP step it accepted means the headroom was real and the
    // episode, if any, is over.
    if (v.up) _computeBound = false; else _latchBound();
    // A climb that passed its verify is still ON PROBATION: the survival clock
    // above, not this one evaluation, is what restores the backoff.
  }

  const degradeAt = _floorMs + DEGRADE_OVER, restoreAt = _floorMs + RESTORE_WITHIN;
  // §2au guard (see _computeBound): a latched degrade step must clear the held
  // threshold by the margin twice.
  const boundOver = _computeBound ? DEGRADE_OVER : 0;
  const cur = _gfx.getRenderScale ? _gfx.getRenderScale() : 1;
  // Why: docs/GOVERNOR-RATIONALE.md §gov-28.
  if (ev <= degradeAt) _degradeArm = 0;
  else if (_scaleMoves > 0 && ++_degradeArm < DEGRADE_CONFIRM) return;
  if (ev > degradeAt + boundOver) {                 // meaningfully slower than THIS device's own floor: degrade PROMPTLY
    // Why: docs/GOVERNOR-RATIONALE.md §gov-29.
    let stepped = false;
    if (_autoRes && cur > 0.5 && !_scaleFutile) stepped = !!_gfx.setRenderScale(cur - 0.1);
    if (stepped) {
      _pendingVerify = { kind: "scale", prev: cur, ema: ev };
      _scaleCap = cur; _armCapProbe();   // this resolution missed the budget
      // _chargeCut() returns the plain 10 s hold unless this cut is undoing a
      // climb still on probation, so it subsumes the constant it replaces.
      _govCool = 30; _downHold = _chargeCut(); _scaleMoves++; _degradeArm = 0;
    } else if (!_tierHold && _perfTier < 4 && _perfTierFloor < 4 && !_tierFutile) {   // scale lever exhausted — shed a feature (a crash floor of 4 has already shed everything this ladder can)
      // Why: docs/GOVERNOR-RATIONALE.md §gov-30.
      _pendingVerify = { kind: "tier", prev: _perfTier, shed: _autoShed, ema: ev };
      _perfTier = Math.min(4, Math.max(_perfTier, _floorTier()) + 1); _autoShed++; _govCool = 90; _downHold = _chargeCut();
      // A shed rung changes what the frame is bound BY, so let the scale lever
      // prove itself again from the new baseline rather than staying latched
      // off for the session on one old measurement. The measured ceiling was
      // taken against the OLD feature set and stops meaning anything here too.
      _scaleFutile = false;
      _scaleCap = Infinity; _armCapProbe();
    }
  } else if (_frameEMA < restoreAt && _downHold === 0) {   // clear, SETTLED headroom (~10 s since the last cut): restore slowly
    _scaleFutile = false;   // headroom is back — nothing about the old verdict still applies
    // Futility may clear (a later wet race can use a rung that was useless dry),
    // but a phone that already measured a helpful shed stays latched — calm EMA
    // at the shed quality is not evidence the full stack fits again.
    if (!_phoneSlowLatch) _tierFutile = false;
    _computeBound = false;   // §2au: the EMA is back within RESTORE_WITHIN of the (rewound) floor — the episode is over
    _cheapSeen = false;
    // Why: docs/GOVERNOR-RATIONALE.md §gov-31.
    let stepped = false;
    // One down-step below the lowest scale MEASURED as missing: climbing into
    // that gap only hands the next heavy section something to take back. The
    // margin belongs to a measurement, never to the default — subtracting it
    // from an untouched ceiling would pin every healthy device at 0.9.
    const ceil = _scaleCap > 1 ? _resCeil : Math.max(0.5, Math.min(_resCeil, _scaleCap - 0.1));
    if (_autoRes && cur < ceil - 1e-9) {
      // Why: docs/GOVERNOR-RATIONALE.md §gov-32.
      const gap = ceil - cur;
      const next = gap < 0.12 ? ceil : Math.min(ceil, cur + Math.max(0.06, gap / 2));
      stepped = !!_gfx.setRenderScale(next);
      if (stepped) {
        _pendingVerify = { kind: "scale", prev: cur, next, ema: ev, up: true };
        _govCoolMs = 4000; _sinceUp = 0;
      }
    }
    // Features come back only at full res under the same sustained headroom,
    // one per ~4 s. tier() retains both floors even when a measured post cut
    // taken AT the user's floor is released; the crash floor is never lifted.
    // Phone slow latch: never promote effects back after a verified shed.
    if (!stepped && !_tierHold && !_phoneSlowLatch && (_perfTier > _floorTier() || (_autoShed > 0 && _perfTier > _perfTierFloor))) {
      _pendingVerify = { kind: "tier", prev: _perfTier, shed: _autoShed, ema: ev, up: true };
      // LOW starts at its preset floor: its measured post/lamp cut still
      // needs recovery. tier() keeps the preset and crash floors intact.
      if (_perfTier > _floorTier()) {
        _perfTier--; if (_autoShed > 0) _autoShed--;
      } else { _perfTier = _perfTierFloor; _autoShed = 0; }
      _govCoolMs = 4000; _sinceUp = 0;
    }
  }
}

// Why: docs/GOVERNOR-RATIONALE.md §gov-33.
let _drift = null;
function setThermalDrift(on) {
  _drift = on && typeof ThermalDrift !== "undefined" ? ThermalDrift.drift() : null;
}
// Why: docs/GOVERNOR-RATIONALE.md §gov-34.
function driftRenderRate() {
  if (typeof RenderRate === "undefined") return false;
  const st = RenderRate.state();
  if (!st.mobile || st.mode !== "auto") return false;
  return RenderRate.setMode("45");
}
function driftStep() {
  if (_pendingVerify || _govCoolMs > 0 || _govCool > 0) return false;   // mid-verify or cooling: ask again next window
  const cur = _gfx.getRenderScale ? _gfx.getRenderScale() : 1;
  if (_autoRes && cur > 0.5 && !_scaleFutile && _gfx.setRenderScale(cur - 0.1)) {
    _scaleCap = cur; _armCapProbe(); _govCool = 30; _downHold = _chargeCut(); _scaleMoves++;
    return true;
  }
  if (!_tierHold && _perfTier < 4 && _perfTierFloor < 4 && !_tierFutile) {
    _perfTier = Math.min(4, Math.max(_perfTier, _floorTier()) + 1); _autoShed++; _govCool = 90; _downHold = _chargeCut();
    _scaleCap = Infinity; _armCapProbe();
    return true;
  }
  return false;
}

function clearStrikes() {
  _crashStrikes = 0;
  // Same latch release as cleanRace(): lifting the floor alone leaves
  // `_perfTier` on evidence earned under the old floor, so tier() stays high
  // after __apex.safeMode(false) until a reload. Drop to the new floor so the device
  // can prove itself again (governor may re-shed if frames still miss).
  _setCrashFloor();
  _phoneSlowLatch = false;   // safeMode(false) / clearStrikes: prove the device again
  GameStore.store.rawSet(SENT_STRIKES, "0"); GameStore.store.rawDel(SENT_ACTIVE);
  GameStore.store.rawDel(SENT_TICKED);
}

return {
  init, tick, ticks: () => _ticks, setThermalDrift, thermalDrift: () => _drift && _drift.state(), frameStats, recordSimulation, resetFrameStats, sentinelArm, sentinelResume, cleanRace, clearStrikes,
  tier: () => Math.max(_perfTierFloor, _userTier, _perfTier),
  // Why: docs/GOVERNOR-RATIONALE.md §gov-35.
  autoTier: () => Math.max(_perfTierFloor, _perfTier),
  // Look-defining post (bloom / SSAO / god-rays / contact / lamp volumetrics).
  // True when the crash/measured ladder is at 4 OR the player chose GRAPHICS:
  // LOW (userTier 4). Keeps autoTier() free for wet-SSR / tuner notes while
  // making LOW actually cheaper than MEDIUM on tile GPUs.
  lookPostShed: () => Math.max(_perfTierFloor, _perfTier) >= 4 || _userTier >= 4,
  // True after a verified feature shed on a phone — restore must not promote
  // effects back (see _phoneSlowLatch). Exposed for __apex.renderScale() / tests.
  phoneSlowLatch: () => _phoneSlowLatch,
  // What the GOVERNOR shed on its own measurements, plus the crash floor, and
  // nothing the player asked for. The gate for anything held off "because this
  // device is actually missing frames" — see _autoShed for why this is a second
  // accessor rather than a redefinition of autoTier().
  autoShed: () => Math.max(_perfTierFloor, _autoShed),
  tierFloor: () => _perfTierFloor,
  userTier: () => _userTier,
  // Clamped to the ladder's own range so a bad preset id can't invent a tier 7
  // that every `tier() >= N` gate would satisfy. Drops any pending verify for
  // the same reason setAutoRes drops a pending SCALE one: _pendingVerify
  // attributes the next EMA delta to the governor's own last provisional step,
  // so a user changing quality one evaluation later would make the governor
  // revert a step that was actually working.
  setUserTier: (n) => {
    const t = Math.max(0, Math.min(4, n | 0));
    if (t === _userTier) return;
    const prev = _userTier;
    _userTier = t;
    _tierFutile = false;   // a new preset changes what a step means
    _scaleCap = Infinity; _armCapProbe();   // ...and what the frame costs, so the measured ceiling expires with it
    // Why: docs/GOVERNOR-RATIONALE.md §gov-36.
    if (t < prev) {
      _phoneSlowLatch = false;
      if (_perfTier > _floorTier()) { _perfTier = _floorTier(); _autoShed = 0; }
    }
    // Why: docs/GOVERNOR-RATIONALE.md §gov-37.
    _pendingVerify = null;
    if (_live) _govCoolMs = Math.max(_govCoolMs, VERIFY_COOL);   // see _live: never before the first race tick
  },
  strikes: () => _crashStrikes,
  // The lifetime, NOT build-keyed, kill count — see SENT_SEEN. `strikes` can be
  // 0 on a device that has been killed repeatedly, because a deploy resets it;
  // this cannot.
  crashSeen: () => {
    try {
      const st = GameStore.store;
      return { seen: parseInt(st.raw(SENT_SEEN), 10) || 0, lastBuild: st.raw(SENT_SEEN_BUILD) || null };
    } catch (_) { return { seen: 0, lastBuild: null }; }
  },
  // {frames, maxMs, slow} for the first OPEN_FRAMES of the current race — the
  // instrument for a "laggy at first, fine afterwards" report. See _openN.
  openWindow: () => ({ frames: _openN, maxMs: +_openMax.toFixed(1), slow: _openSlow }),
  fpsEMA: () => _frameEMA,
  floorMs: () => _floorMs,
  // Why: docs/GOVERNOR-RATIONALE.md §gov-38.
  scaleFutile: () => _scaleFutile,
  tierFutile: () => _tierFutile,
  // §2au's latch, inspectable for the same reason as the two above: true means
  // a step's verify proved this device compute-bound and the floor is being
  // held at the race's observed minimum while the ladder finishes its work.
  computeBound: () => _computeBound,
  autoRes: () => _autoRes,
  // The configured ceiling of the resolution stage (see _resCeil). Clamped to the stage's own
  // range; it never moves the scale by itself: the caller that lowers it also lowers the scale.
  resCeil: () => _resCeil,
  setResCeil: (v) => { v = +v; _resCeil = v >= 0.5 && v <= 1 ? v : 1; return _resCeil; },
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
    if (_live) _govCoolMs = Math.max(_govCoolMs, VERIFY_COOL);   // see _live: never before the first race tick
  },
  // The ladder pin described at _tierHold. Same pending-verify hygiene as
  // setAutoRes, for the TIER kind: a provisional step must not be "reverted"
  // by the evaluation after the hold lands, and releasing the hold must not
  // let a stale verdict from before it revert a rung either.
  tierHold: () => _tierHold,
  setTierHold: (on) => {
    _tierHold = !!on;
    if (_pendingVerify && _pendingVerify.kind === "tier") _pendingVerify = null;
    if (_live) _govCoolMs = Math.max(_govCoolMs, VERIFY_COOL);
  },
  // SwiftShader / llvmpipe / soft-blit paths: intro shortcuts and one shared
  // race-entry budget (RaceEntryProfile) read this instead of guessing from tier.
  softwareRaster() {
    try {
      const s = _gfx && _gfx.backendState && _gfx.backendState();
      return !!(s && (s.softwareGL || s.softAdapter));
    } catch (_) { return false; }
  },
  // Full-frame GLX soft readback + pack scratch readPixels stall SwiftShader for
  // seconds while these menu/race-entry sheets are up (#3589 garage; live
  // race-settings flyby + #loading entry on tip 775097e). Matches loop-health
  // slowPathCover plus the race-settings sheet (flyby stays live behind it).
  // Garage drive-out preview on SwiftShader: shed fill rate for the intro bay only.
  softwareGaragePreviewBegin(gfx) {
    if (!PerfGov.softwareRaster() || !gfx || !gfx.setRenderScale || !gfx.getRenderScale) return;
    // The race scale was chosen once, before the canvas was first sized.
    if (_swRaceScale != null) {
      try { if (gfx.envProbeOptOut !== undefined) gfx.envProbeOptOut = true; } catch (_) { /* harness */ }
      return;
    }
    if (_swGarageScaleSaved != null) return;
    const cur = gfx.getRenderScale();
    if (cur > 0.55) { _swGarageScaleSaved = cur; gfx.setRenderScale(0.55); }
    try { if (gfx.envProbeOptOut !== undefined) gfx.envProbeOptOut = true; } catch (_) { /* harness */ }
  },
  softwareGaragePreviewEnd(gfx) {
    if (_swRaceScale != null) _swGarageScaleSaved = null;
    if (_swGarageScaleSaved == null) return;
    if (gfx && gfx.setRenderScale) gfx.setRenderScale(_swGarageScaleSaved);
    _swGarageScaleSaved = null;
    try { if (gfx && gfx.envProbeOptOut !== undefined) gfx.envProbeOptOut = false; } catch (_) { /* harness */ }
  },
  // Live software GL presents the race at 0.5 (PostCommon.softwareRaceShed /
  // pinSoftwareRaceShed). Choose that before the first setSize so entry does
  // not resize. Webdriver and the game VM keep the current scale (full-res
  // specs). Idempotent: a second call does not setRenderScale.
  chooseSoftwareRaceScale(gfx) {
    const g = gfx || _gfx;
    if (_swRaceScale != null) return _swRaceScale;
    let st = null;
    try { st = g && g.backendState && g.backendState(); } catch (_) { st = null; }
    if (!(st && (st.softwareGL || st.softAdapter))) return null;
    let cur = 1;
    try { cur = +g.getRenderScale(); } catch (_) { /* 1 */ }
    if (!(cur > 0)) cur = 1;
    let shed = false;
    try {
      const knob = localStorage.getItem("apex26.swRaceShed");
      const nav = typeof navigator !== "undefined" ? navigator : null;
      shed = typeof PostCommon !== "undefined" && PostCommon.softwareRaceShed
        ? !!PostCommon.softwareRaceShed(!!st.softwareGL, nav, knob) : false;
    } catch (_) { shed = false; }
    const want = shed && cur > 0.52 ? 0.5 : cur;
    _swRaceScale = want;
    try { if (cur - want >= 0.02 && g.setRenderScale) g.setRenderScale(want); } catch (_) { /* harness */ }
    return want;
  },
  softwareRaceScaleChosen() { return _swRaceScale; },
  softwareGlSoftPresentDefer() {
    if (!PerfGov.softwareRaster()) return false;
    try {
      if (typeof MenuTeardown !== "undefined" && MenuTeardown.quitReadbackDefer && MenuTeardown.quitReadbackDefer()) return true;
    } catch (_) { /* harness */ }
    return false;
  },
  softwareGlUiReadbackDefer() {
    if (!PerfGov.softwareRaster()) return false;
    try {
      if (typeof RaceEntryProfile !== "undefined" && RaceEntryProfile.stallHandoffCover && RaceEntryProfile.stallHandoffCover()) return true;
    } catch (_) { /* harness */ }
    try {
      if (typeof MenuTeardown !== "undefined" && MenuTeardown.quitReadbackDefer && MenuTeardown.quitReadbackDefer()) return true;
    } catch (_) { /* harness */ }
    try {
      const g = typeof document !== "undefined" && document.getElementById;
      if (!g) return false;
      const ld = g.call(document, "loading");
      if (ld && !ld.hidden) return true;
      const cs = g.call(document, "carsetup");
      if (cs && !cs.hidden) return true;
      const rs = g.call(document, "race-settings");
      if (rs && !rs.hidden) return true;
    } catch (_) { /* harness */ }
    return false;
  },
};
})();
Object.freeze(PerfGov);
