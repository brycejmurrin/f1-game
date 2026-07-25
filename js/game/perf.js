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
// only downscales when clearly missing 60 fps (>19 ms EMA) so a healthy
// vsync-capped display never degrades; upscales slowly to avoid oscillation.
let _frameEMA = 16.7, _govT = 0, _govCool = 0, _autoRes = true;

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
let _crashStrikes = 0;
// Safe-mode floor the governor's restore path can't climb below (per session —
// only strikes paying off across boots lift it): one strike starts with
// lamp-shadow/SSR-class features shed (tier 2), two or more shed the whole
// heavy post stack too (tier 4).
let _perfTierFloor = 0;
let _perfTier = 0;

function init(gfx) {
  _gfx = gfx;
  if (gfx && gfx.mobileTier) {
    try {
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
  if (!_gfx || !_gfx.mobileTier) return;
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
  if (!_autoRes) return;
  // Ignore huge spikes (tab resume, GC): they'd yank the scale.
  if (dtMs < 100) _frameEMA += (dtMs - _frameEMA) * 0.1;
  if (_govCool > 0) { _govCool--; return; }
  if (++_govT < 45) return;   // evaluate ~every 45 frames
  _govT = 0;
  const cur = _gfx.getRenderScale ? _gfx.getRenderScale() : 1;
  if (_frameEMA > 19) {                        // <~53 fps: degrade
    if (cur > 0.5) { if (_gfx.setRenderScale(cur - 0.1)) _govCool = 30; }
    else if (_perfTier < 4) { _perfTier++; _govCool = 90; }   // scale floor hit — shed a feature
  } else if (_frameEMA < 14) {                 // >~71 fps headroom: restore
    if (cur < 1) { if (_gfx.setRenderScale(Math.min(1, cur + 0.06))) _govCool = 30; }
    // Features come back only at full res with strong headroom, one per ~3 s —
    // and never below the crash-sentinel floor.
    else if (_perfTier > _perfTierFloor && _frameEMA < 12.5) { _perfTier--; _govCool = 180; }
  }
}

return {
  init, tick, sentinelArm, cleanRace,
  tier: () => _perfTier,
  tierFloor: () => _perfTierFloor,
  strikes: () => _crashStrikes,
  fpsEMA: () => _frameEMA,
  autoRes: () => _autoRes,
  setAutoRes: (on) => { _autoRes = !!on; },
};
})();
