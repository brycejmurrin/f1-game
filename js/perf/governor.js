const PerfGov = (function () {
  "use strict";

let _gfx = null;

let _frameEMA = 16.7;
let _govT = 0;
let _govCool = 0;
let _govCoolMs = 0;
let _autoRes = true;
let _downHold = 0;
let _slowRun = 0;
let _live = false;
const UP_BACKOFF_MIN = 10000;
const UP_BACKOFF_MAX = 120000;
const COOL_STEP_MAX_MS = 100;
let _upBackoff = UP_BACKOFF_MIN;
const CLIMB_SURVIVE_MS = 30000;
let _scaleCap = Infinity;
let _resCeil = 1;
let _capProbeMs = CLIMB_SURVIVE_MS;
function _armCapProbe() { _capProbeMs = Math.max(CLIMB_SURVIVE_MS, _upBackoff); }
let _sinceUp = -1;
function _chargeCut() {
  if (_sinceUp < 0) return 10000;
  _sinceUp = -1;
  _upBackoff = Math.min(_upBackoff * 2, UP_BACKOFF_MAX);
  return _upBackoff;
}
const DEGRADE_CONFIRM = 2;
let _degradeArm = 0;
let _scaleMoves = 0;
let _scaleFutile = false;
let _tierFutile = false;

let _phoneSlowLatch = false;
let _computeBound = false;
let _floorMinMs = 16.7;
let _floorShadowMs = 16.7;
let _cheapSeen = false;

let _floorMs = 16.7;
const FLOOR_DOWN_A = 0.3;
const FLOOR_UP_A = 0.02;
const FLOOR_UP_A_BOUND = 0.002;
const SPIKE_MS = 100;
const SPIKE_RUN = 3;
const SLOW_CAP = 1000;
const DEGRADE_OVER = 2.3;
const RESTORE_WITHIN = 0.6;

let _pendingVerify = null;
const VERIFY_MARGIN = 0.5;
const VERIFY_COOL = 5000;
const STALL_TRIM = 2;
let _evEMA = 16.7;
let _stallsTrimmed = 0;


const SENT_ACTIVE = "apex26.raceActive";
const SENT_TICKED = "apex26.raceTicked";
const SENT_STRIKES = "apex26.crashStrikes";
const SENT_BUILD = "apex26.crashStrikesBuild";
const SENT_SEEN = "apex26.crashSeen";
const SENT_SEEN_BUILD = "apex26.crashSeenBuild";
let _crashStrikes = 0;
let _raceTicked = false;
let _perfTierFloor = 0;
let _perfTier = 0;
let _autoShed = 0;
let _tierHold = false;
let _swGarageScaleSaved = null;
let _swRaceScale = null;
const OPEN_FRAMES = 600;
let _openN = 0;
let _openMax = 0;
let _openSlow = 0;
let _userTier = 0;
function _floorTier() { return Math.max(_perfTierFloor, _userTier); }

function _floorStep(x) {
  _floorShadowMs += (x - _floorShadowMs) * (x < _floorShadowMs ? FLOOR_DOWN_A : FLOOR_UP_A);
  _floorMs += (x - _floorMs) * (x < _floorMs ? FLOOR_DOWN_A : (_computeBound ? FLOOR_UP_A_BOUND : FLOOR_UP_A));
  if (_floorMs < _floorMinMs) _floorMinMs = _floorMs;
}
function _latchBound() {
  if (_computeBound || _cheapSeen) return;
  _computeBound = true;
  if (_floorMinMs < _floorMs) _floorMs = _floorMinMs;
}

function init(gfx) {
  Log.info("game", "PerfGov.init");
  _gfx = gfx;
  try { setThermalDrift(GameStore.store.raw("apex26.thermalDrift") === "1"); } catch (_) {  }
  if (gfx && gfx.isMobile) {
    const st = GameStore.store;
    const build = String((typeof window !== "undefined" && window.__APEX_BUILD) || 0);
    if (st.raw(SENT_ACTIVE) === "1" && st.raw(SENT_TICKED) === "1") {
      st.rawSet(SENT_SEEN, String((parseInt(st.raw(SENT_SEEN), 10) || 0) + 1));
      st.rawSet(SENT_SEEN_BUILD, st.raw(SENT_BUILD) || "?");
    }
    if (st.raw(SENT_BUILD) !== build) {
      st.rawSet(SENT_BUILD, build);
      st.rawSet(SENT_STRIKES, "0");
      st.rawDel(SENT_ACTIVE);
      st.rawDel(SENT_TICKED);
    }
    _crashStrikes = Math.min(4, parseInt(st.raw(SENT_STRIKES), 10) || 0);
    if (st.raw(SENT_ACTIVE) === "1") {
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
  if (_crashStrikes >= 2 && gfx && gfx.isMobile && typeof gfx.capDpr === "function") gfx.capDpr(1);
}

function _floorFromStrikes(n) { return n >= 2 ? 4 : (n >= 1 ? 2 : 0); }

function sentinelResume() {
  _sinceUp = -1;
  if (!_gfx || !_gfx.isMobile) return;
  GameStore.store.rawSet(SENT_ACTIVE, "1");
}
function sentinelArm(on) {
  if (on) { _frameEMA = _floorMs = 16.7; _slowRun = 0; _openN = 0; _openMax = 0; _openSlow = 0;
            _govT = 0; _govCool = 0; _govCoolMs = 0; _pendingVerify = null; _evEMA = 16.7; _stallsTrimmed = 0;
            _sinceUp = -1; _scaleCap = Infinity; _capProbeMs = CLIMB_SURVIVE_MS;
            _scaleMoves = 0; _degradeArm = 0;
            _tierFutile = false; _scaleFutile = false;
            _computeBound = false; _cheapSeen = false; _floorMinMs = 16.7; _floorShadowMs = 16.7; } else _live = false;
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
    _setCrashFloor();
  }
}

function _setCrashFloor() {
  const prev = _perfTierFloor;
  _perfTierFloor = _floorFromStrikes(_crashStrikes);
  if (_perfTierFloor < prev && _perfTier > _perfTierFloor) { _perfTier = _perfTierFloor; _autoShed = 0; }
}

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

function _ageClocks(stepMs) {
  if (_downHold > 0) _downHold = Math.max(0, _downHold - stepMs);
  if (_sinceUp >= 0 && (_sinceUp += stepMs) >= CLIMB_SURVIVE_MS) { _sinceUp = -1; _upBackoff = UP_BACKOFF_MIN; }
  if (_scaleCap <= 1) {
    if (_frameEMA < Math.max(_floorMs, _floorShadowMs) + RESTORE_WITHIN) {
      if ((_capProbeMs -= stepMs) <= 0) { _scaleCap = Infinity; _armCapProbe(); }
    } else _armCapProbe();
  }
  if (_govCoolMs <= 0) return false;
  _govCoolMs = Math.max(0, _govCoolMs - stepMs);
  return true;
}

let _ticks = 0;
function tick(dtMs, drawn) {
  _ticks++;
  if (!_raceTicked && _gfx && _gfx.isMobile) {
    _raceTicked = true;
    try { GameStore.store.rawSet(SENT_TICKED, "1"); } catch (_) {  }
  }
  if (Number.isFinite(dtMs) && dtMs > 0) {
    frameHistory[frameCursor] = dtMs; frameCursor = (frameCursor + 1) % frameHistory.length;
    frameCount = Math.min(frameHistory.length, frameCount + 1);
  }
  _live = true;
  if (!(dtMs > 0)) return;
  const stepMs = Number.isFinite(dtMs) ? Math.min(dtMs, COOL_STEP_MAX_MS) : 16.7;
  const driftDue = _drift && _drift.feed(drawn !== false && dtMs < SPIKE_MS ? dtMs : 0, dtMs);
  if (drawn === false) { _ageClocks(stepMs); return; }
  if (driftDue && dtMs < SPIKE_MS && (driftRenderRate() || driftStep())) _drift.stepped();
  if (_openN < OPEN_FRAMES) {
    _openN++;
    if (dtMs > _openMax) _openMax = dtMs;
    if (dtMs > _floorMs * 2) _openSlow++;
  }
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
    const ev = fed > _floorMs * 2.5 && _stallsTrimmed < STALL_TRIM ? (_stallsTrimmed++, _floorMs * 2) : fed;
    _evEMA += (ev - _evEMA) * 0.1;
    _floorStep(fed);
  }
  if (_ageClocks(stepMs)) return;
  if (_govCool > 0) { _govCool--; return; }
  if (++_govT < 45) return;
  _govT = 0;
  const ev = _evEMA; _stallsTrimmed = 0;

  if (_pendingVerify) {
    const v = _pendingVerify; _pendingVerify = null;
    const failed = v.up ? (ev > v.ema + VERIFY_MARGIN)
                        : (ev > v.ema - (v.big ? Math.max(VERIFY_MARGIN, (v.ema - _floorMs) / 2) : VERIFY_MARGIN));
    if (failed) {
      if (v.kind === "tier" && !v.up && _perfTier < 4) {
        _perfTier++; _autoShed++; _pendingVerify = v; _govCool = 90;
        return;
      }
      if (v.kind === "scale") {
        const now = _gfx.getRenderScale ? _gfx.getRenderScale() : 1, big = 0.5;
        if (!v.up && !v.big && _autoRes && big < now - 0.05 && _gfx.setRenderScale(big)) {
          _scaleCap = Math.min(_scaleCap, now); _armCapProbe();
          _pendingVerify = { kind: "scale", prev: v.prev, ema: v.ema, big: true };
          _govCool = 30; _scaleMoves++;
          return;
        }
        _gfx.setRenderScale(v.prev);
        if (v.up && v.next) { _scaleCap = Math.min(_scaleCap, v.next); _armCapProbe(); }
        if (!v.up) _scaleFutile = true;
      } else { _perfTier = v.prev; _autoShed = v.shed; if (!v.up) _tierFutile = true; }
      _govCoolMs = VERIFY_COOL;
      if (v.up) { _sinceUp = -1; _downHold = _upBackoff; _upBackoff = Math.min(_upBackoff * 2, UP_BACKOFF_MAX); }
      if (v.up) _latchBound(); else _computeBound = false;
      return;
    }
    if (v.kind === "tier" && !v.up && _gfx && _gfx.isMobile) _phoneSlowLatch = true;
    if (v.up) _computeBound = false; else _latchBound();
  }

  const degradeAt = _floorMs + DEGRADE_OVER, restoreAt = _floorMs + RESTORE_WITHIN;
  const boundOver = _computeBound ? DEGRADE_OVER : 0;
  const cur = _gfx.getRenderScale ? _gfx.getRenderScale() : 1;
  if (ev <= degradeAt) _degradeArm = 0;
  else if (_scaleMoves > 0 && ++_degradeArm < DEGRADE_CONFIRM) return;
  if (ev > degradeAt + boundOver) {
    if (_shedDprBoost()) { _degradeArm = 0; return; }
    let stepped = false;
    if (_autoRes && cur > 0.5 && !_scaleFutile) stepped = !!_gfx.setRenderScale(cur - 0.1);
    if (stepped) {
      _pendingVerify = { kind: "scale", prev: cur, ema: ev };
      _scaleCap = cur; _armCapProbe();
      _govCool = 30; _downHold = _chargeCut(); _scaleMoves++; _degradeArm = 0;
    } else if (!_tierHold && _perfTier < 4 && _perfTierFloor < 4 && !_tierFutile) {
      _pendingVerify = { kind: "tier", prev: _perfTier, shed: _autoShed, ema: ev };
      _perfTier = Math.min(4, Math.max(_perfTier, _floorTier()) + 1); _autoShed++; _govCool = 90; _downHold = _chargeCut();
      _scaleFutile = false;
      _scaleCap = Infinity; _armCapProbe();
    }
  } else if (_frameEMA < restoreAt && _downHold === 0) {
    _scaleFutile = false;
    if (!_phoneSlowLatch) _tierFutile = false;
    _computeBound = false;
    _cheapSeen = false;
    let stepped = false;
    const ceil = _scaleCap > 1 ? _resCeil : Math.max(0.5, Math.min(_resCeil, _scaleCap - 0.1));
    if (_autoRes && cur < ceil - 1e-9) {
      const gap = ceil - cur;
      const next = gap < 0.12 ? ceil : Math.min(ceil, cur + Math.max(0.06, gap / 2));
      stepped = !!_gfx.setRenderScale(next);
      if (stepped) {
        _pendingVerify = { kind: "scale", prev: cur, next, ema: ev, up: true };
        _govCoolMs = 4000; _sinceUp = 0;
      }
    }
    if (!stepped && !_tierHold && !_phoneSlowLatch && (_perfTier > _floorTier() || (_autoShed > 0 && _perfTier > _perfTierFloor))) {
      _pendingVerify = { kind: "tier", prev: _perfTier, shed: _autoShed, ema: ev, up: true };
      if (_perfTier > _floorTier()) {
        _perfTier--; if (_autoShed > 0) _autoShed--;
      } else { _perfTier = _perfTierFloor; _autoShed = 0; }
      _govCoolMs = 4000; _sinceUp = 0;
    }
  }
}

let _drift = null;
function setThermalDrift(on) {
  _drift = on && typeof ThermalDrift !== "undefined" ? ThermalDrift.drift() : null;
}
function driftRenderRate() {
  if (typeof RenderRate === "undefined") return false;
  const st = RenderRate.state();
  if (!st.mobile || st.mode !== "auto") return false;
  return RenderRate.setMode("45");
}
function _shedDprBoost() {
  if (!_gfx || typeof _gfx.getDprBoost !== "function" || !(_gfx.getDprBoost() > 0)) return false;
  if (!_gfx.setDprBoost(0)) return false;
  _govCool = 30; _downHold = _chargeCut();
  Log.warn("gfx", "RESOLUTION MAX: frame budget missed, DPR boost off (back to the tier's cap)");
  return true;
}
function driftStep() {
  if (_pendingVerify || _govCoolMs > 0 || _govCool > 0) return false;
  if (_shedDprBoost()) return true;
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
  _setCrashFloor();
  _phoneSlowLatch = false;
  GameStore.store.rawSet(SENT_STRIKES, "0"); GameStore.store.rawDel(SENT_ACTIVE);
  GameStore.store.rawDel(SENT_TICKED);
}

return {
  init, tick, ticks: () => _ticks, setThermalDrift, thermalDrift: () => _drift && _drift.state(), frameStats, recordSimulation, resetFrameStats, sentinelArm, sentinelResume, cleanRace, clearStrikes,
  tier: () => Math.max(_perfTierFloor, _userTier, _perfTier),
  autoTier: () => Math.max(_perfTierFloor, _perfTier),
  lookPostShed: () => Math.max(_perfTierFloor, _perfTier) >= 4 || _userTier >= 4,
  phoneSlowLatch: () => _phoneSlowLatch,
  autoShed: () => Math.max(_perfTierFloor, _autoShed),
  tierFloor: () => _perfTierFloor,
  userTier: () => _userTier,
  setUserTier: (n) => {
    const t = Math.max(0, Math.min(4, n | 0));
    if (t === _userTier) return;
    const prev = _userTier;
    _userTier = t;
    _tierFutile = false;
    _scaleCap = Infinity; _armCapProbe();
    if (t < prev) {
      _phoneSlowLatch = false;
      if (_perfTier > _floorTier()) { _perfTier = _floorTier(); _autoShed = 0; }
    }
    _pendingVerify = null;
    if (_live) _govCoolMs = Math.max(_govCoolMs, VERIFY_COOL);
  },
  strikes: () => _crashStrikes,
  crashSeen: () => {
    try {
      const st = GameStore.store;
      return { seen: parseInt(st.raw(SENT_SEEN), 10) || 0, lastBuild: st.raw(SENT_SEEN_BUILD) || null };
    } catch (_) { return { seen: 0, lastBuild: null }; }
  },
  openWindow: () => ({ frames: _openN, maxMs: +_openMax.toFixed(1), slow: _openSlow }),
  fpsEMA: () => _frameEMA,
  floorMs: () => _floorMs,
  scaleFutile: () => _scaleFutile,
  tierFutile: () => _tierFutile,
  computeBound: () => _computeBound,
  autoRes: () => _autoRes,
  resCeil: () => _resCeil,
  setResCeil: (v) => { v = +v; _resCeil = v >= 0.5 && v <= 1 ? v : 1; return _resCeil; },
  setAutoRes: (on) => {
    _autoRes = !!on;
    if (_pendingVerify && _pendingVerify.kind === "scale") _pendingVerify = null;
    if (_live) _govCoolMs = Math.max(_govCoolMs, VERIFY_COOL);
  },
  tierHold: () => _tierHold,
  setTierHold: (on) => {
    _tierHold = !!on;
    if (_pendingVerify && _pendingVerify.kind === "tier") _pendingVerify = null;
    if (_live) _govCoolMs = Math.max(_govCoolMs, VERIFY_COOL);
  },
  softwareRaster() {
    try {
      const s = _gfx && _gfx.backendState && _gfx.backendState();
      return !!(s && (s.softwareGL || s.softAdapter));
    } catch (_) { return false; }
  },
  softwareGaragePreviewBegin(gfx) {
    if (!PerfGov.softwareRaster() || !gfx || !gfx.setRenderScale || !gfx.getRenderScale) return;
    if (_swRaceScale != null) {
      try { if (gfx.envProbeOptOut !== undefined) gfx.envProbeOptOut = true; } catch (_) {  }
      return;
    }
    if (_swGarageScaleSaved != null) return;
    const cur = gfx.getRenderScale();
    if (cur > 0.55) { _swGarageScaleSaved = cur; gfx.setRenderScale(0.55); }
    try { if (gfx.envProbeOptOut !== undefined) gfx.envProbeOptOut = true; } catch (_) {  }
  },
  softwareGaragePreviewEnd(gfx) {
    if (_swRaceScale != null) _swGarageScaleSaved = null;
    if (_swGarageScaleSaved == null) return;
    if (gfx && gfx.setRenderScale) gfx.setRenderScale(_swGarageScaleSaved);
    _swGarageScaleSaved = null;
    try { if (gfx && gfx.envProbeOptOut !== undefined) gfx.envProbeOptOut = false; } catch (_) {  }
  },
  chooseSoftwareRaceScale(gfx) {
    const g = gfx || _gfx;
    if (_swRaceScale != null) return _swRaceScale;
    let st = null;
    try { st = g && g.backendState && g.backendState(); } catch (_) { st = null; }
    if (!(st && (st.softwareGL || st.softAdapter))) return null;
    let cur = 1;
    try { cur = +g.getRenderScale(); } catch (_) {  }
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
    try { if (cur - want >= 0.02 && g.setRenderScale) g.setRenderScale(want); } catch (_) {  }
    return want;
  },
  softwareRaceScaleChosen() { return _swRaceScale; },
  softwareGlSoftPresentDefer() {
    if (!PerfGov.softwareRaster()) return false;
    try {
      if (typeof MenuTeardown !== "undefined" && MenuTeardown.quitReadbackDefer && MenuTeardown.quitReadbackDefer()) return true;
    } catch (_) {  }
    return false;
  },
  softwareGlUiReadbackDefer() {
    if (!PerfGov.softwareRaster()) return false;
    try {
      if (typeof RaceEntryProfile !== "undefined" && RaceEntryProfile.stallHandoffCover && RaceEntryProfile.stallHandoffCover()) return true;
    } catch (_) {  }
    try {
      if (typeof MenuTeardown !== "undefined" && MenuTeardown.quitReadbackDefer && MenuTeardown.quitReadbackDefer()) return true;
    } catch (_) {  }
    try {
      const g = typeof document !== "undefined" && document.getElementById;
      if (!g) return false;
      const ld = g.call(document, "loading");
      if (ld && !ld.hidden) return true;
      const cs = g.call(document, "carsetup");
      if (cs && !cs.hidden) return true;
      const rs = g.call(document, "race-settings");
      if (rs && !rs.hidden) return true;
    } catch (_) {  }
    return false;
  },
};
})();
Object.freeze(PerfGov);
