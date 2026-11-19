const WheelState = (function () {
  "use strict";

  const clamp = M4.clamp;

  const KAPPA_PEAK = 0.10;
  const KAPPA_MAX = 1;
  const KAPPA_VMIN = 3;
  const KAPPA_RELAX_M = 0.4;
  const WHEEL_J = 0.10;
  const LOCK_KAPPA = 1;
  const SPIN_KAPPA = 1;
  const LOCK_SPAN = 1.5;
  const RESYNC_A = 80;

  const KAPPA_HYST = 0.06;
  const ABS_HOLD = 0.05;
  const ASSIST = Object.freeze({
    medium: Object.freeze({ abs: 0.20, tc: 0.22, cut: 0.55 }),
    full: Object.freeze({ abs: 0.12, tc: 0.14, cut: 0.45 }),
  });
  let _level = "off", _levelResolved = false;
  function assistLevel() {
    if (!_levelResolved) {
      _levelResolved = true;
      try { const r = localStorage.getItem("apex26.wheelAssist"); if (r === "medium" || r === "full") _level = r; } catch (_) {  }
    }
    return _level;
  }
  function setAssistLevel(v, persist = true) {
    _levelResolved = true;
    _level = (v === "medium" || v === "full") ? v : "off";
    if (persist) { try { localStorage.setItem("apex26.wheelAssist", _level); } catch (_) {  } }
    return _level;
  }
  function mode() { return !resolveEnabled() ? "off" : assistLevel() === "off" ? "on" : assistLevel(); }
  function setMode(m) {
    setEnabled(m !== "off");
    if (m !== "off") setAssistLevel(m === "medium" || m === "full" ? m : "off");
    return mode();
  }

  function clampDemand(latch, k, dirOk, aReq, thr, cut, dt, cap) {
    const kAbs = dirOk ? Math.abs(k) : 0;
    if (kAbs > thr) { latch.on = 1; latch.t = ABS_HOLD; }
    else if (latch.on) {
      latch.t -= dt;
      if (latch.t <= 0 && kAbs < Math.max(0, thr - KAPPA_HYST)) latch.on = 0;
    }
    return latch.on ? Math.sign(aReq) * Math.min(Math.abs(aReq) * (1 - cut), cap * 0.95) : aReq;
  }

  let _enabled = false;
  let _resolved = false;

  const T_AMB = 100, T_FADE0 = 650, T_FADE1 = 950, FADE_MAX = 0.35, HEAT_K = 0.07, COOL_0 = 0.03, COOL_V = 0.0012;
  let _thermal = false, _thermalResolved = false;
  function thermalEnabled() {
    if (!_thermalResolved) {
      _thermalResolved = true;
      try { _thermal = localStorage.getItem("apex26.brakeThermal") === "1"; } catch (_) {  }
    }
    return _thermal;
  }
  function setThermal(v, persist = true) {
    _thermalResolved = true;
    _thermal = !!v;
    if (persist) { try { localStorage.setItem("apex26.brakeThermal", _thermal ? "1" : "0"); } catch (_) {  } }
    return _thermal;
  }
  function fadeOf(T) {
    const x = clamp((T - T_FADE0) / (T_FADE1 - T_FADE0), 0, 1);
    return 1 - FADE_MAX * x * x * (3 - 2 * x);
  }
  function discStep(T, w, v, dt) {
    const t = Number.isFinite(T) ? T : T_AMB;
    return clamp(t + (HEAT_K * w - (COOL_0 + COOL_V * Math.max(v, 0)) * (t - T_AMB)) * dt, T_AMB, 1200);
  }

  function resolveEnabled() {
    if (_resolved) return _enabled;
    _resolved = true;
    try {
      const raw = localStorage.getItem("apex26.wheelState");
      if (raw === "1" || raw === "on" || raw === "true") _enabled = true;
      else if (raw === "0" || raw === "off" || raw === "false") _enabled = false;
    } catch (_) {  }
    return _enabled;
  }

  function enabled() { return resolveEnabled(); }

  function setEnabled(v, persist = true) {
    _resolved = true;
    _enabled = !!v;
    if (!persist) return;
    try { localStorage.setItem("apex26.wheelState", _enabled ? "1" : "0"); } catch (_) {  }
  }

  function ensure(c) {
    if (!c) return;
    const u = Number.isFinite(c.speed) ? c.speed : 0;
    if (!Number.isFinite(c.vwF)) c.vwF = u;
    if (!Number.isFinite(c.vwR)) c.vwR = u;
    if (!Number.isFinite(c.kappaF)) c.kappaF = 0;
    if (!Number.isFinite(c.kappaR)) c.kappaR = 0;
    if (!Number.isFinite(c.wheelSpin)) c.wheelSpin = 0;
  }

  function sync(c, dt) {
    const u = Number.isFinite(c.speed) ? c.speed : 0;
    if (Number.isFinite(c._wsV) && Math.abs(u - c._wsV) > RESYNC_A * Math.max(dt, 1 / 240)) {
      c.vwF = c.vwR = u; c.kappaF = c.kappaR = 0;
    }
    ensure(c);
  }

  function kappaOf(vw, vx) {
    return (vw - vx) / Math.max(Math.abs(vx), KAPPA_VMIN);
  }

  function curveAt(rho, rear) {
    if (typeof TyreModel === "undefined" || !TyreModel.lateralCurve) return Math.min(1, rho);
    const TM = TyreModel;
    if (rear) {
      return Math.abs(TM.lateralCurve(rho * (TM.CURVE_PEAK_X || Math.PI / 2),
        TM.CURVE_FLOOR_R, TM.CURVE_FALL_W_R, TM.CURVE_HOLD_R));
    }
    return Math.abs(TM.lateralCurve(rho * (TM.CURVE_PEAK_X_F || Math.PI / 2)));
  }

  function axleStep(state, params, out) {
    const o = out || {};
    const dt = Math.max(+params.dt || 0, 0);
    const vx = +params.vx || 0;
    const aReq = +params.aReq || 0;
    const muLong = Math.max(+params.muLong || 0, 1e-6);
    const alphaN = +params.alphaN || 0;
    let vw = Number.isFinite(state.vw) ? state.vw : vx;

    if (!(dt > 0)) {
      o.vw = vw;
      o.kappa = kappaOf(vw, vx);
      o.fx = 0;
      o.locked = 0;
      o.spinning = 0;
      o.ach = 0;
      return o;
    }

    const rear = !!params.rear;
    let kappa = clamp(kappaOf(vw, vx), -KAPPA_MAX, KAPPA_MAX);
    const kn = kappa / KAPPA_PEAK;
    const rho = Math.hypot(alphaN, kn);
    const f = curveAt(rho, rear);
    const share = rho > 1e-9 ? f / rho : 0;
    let fx = muLong * share * kn;
    const fxCap = muLong * Math.max(f, 1e-6);
    if (fx > fxCap) fx = fxCap;
    if (fx < -fxCap) fx = -fxCap;

    const kStar = clamp((aReq / muLong) * KAPPA_PEAK, -KAPPA_MAX, KAPPA_MAX);
    const room = Math.sqrt(Math.max(0.0025, 1 - Math.min(1, alphaN * alphaN)));
    const demandOver = Math.abs(aReq) > muLong * room * 0.98;

    if (!demandOver) {
      const travel = Math.max(Math.abs(vx), KAPPA_VMIN) * dt;
      const a = 1 - Math.exp(-travel / KAPPA_RELAX_M);
      const k0 = Number.isFinite(state.kappa) ? clamp(state.kappa, -KAPPA_MAX, KAPPA_MAX) : kappa;
      vw = vx + (k0 + (kStar - k0) * a) * Math.max(Math.abs(vx), KAPPA_VMIN);
      kappa = clamp(kappaOf(vw, vx), -KAPPA_MAX, KAPPA_MAX);
      const kn2 = kappa / KAPPA_PEAK;
      const rho2 = Math.hypot(alphaN, kn2);
      const f2 = curveAt(rho2, rear);
      const share2 = rho2 > 1e-9 ? f2 / rho2 : 0;
      fx = clamp(muLong * share2 * kn2, -muLong, muLong);
    } else {
      const dv = ((aReq - fx) / WHEEL_J) * dt;
      let vw1 = vw + dv;
      if (vx >= 0 && vw > vx && vw1 < vx) vw1 = vx;
      if (vx >= 0 && vw < vx && vw1 > vx) vw1 = vx;
      if (vx < 0 && vw < vx && vw1 > vx) vw1 = vx;
      if (vx < 0 && vw > vx && vw1 < vx) vw1 = vx;
      vw = vw1;
      kappa = clamp(kappaOf(vw, vx), -KAPPA_MAX, KAPPA_MAX);
    }

    o.vw = vw;
    o.kappa = kappa;
    o.fx = fx;
    o.ach = demandOver ? Math.min(Math.abs(aReq), Math.abs(fx)) : Math.abs(aReq);
    const knAbs = Math.abs(kappa) / KAPPA_PEAK;
    const kDir = vx < 0 ? -kappa : kappa;
    o.locked = kDir < 0 ? clamp((knAbs - LOCK_KAPPA) / LOCK_SPAN, 0, 1) : 0;
    o.spinning = kDir > 0 ? clamp((knAbs - SPIN_KAPPA) / LOCK_SPAN, 0, 1) : 0;
    const aN = Math.abs(alphaN), rhoL = Math.hypot(aN, knAbs);
    const g = (x) => curveAt(x, rear);
    const per = (x) => (x > 1e-3 ? g(x) / x : g(1e-3) / 1e-3);
    o.latScale = clamp(per(rhoL) / per(aN), 0.05, 1);
    return o;
  }

  const _fOut = {};
  const _rOut = {};
  const _fState = { vw: 0.5, kappa: 0.5 };
  const _rState = { vw: 0.5, kappa: 0.5 };
  const _fIn = { dt: 0.5, vx: 0.5, aReq: 0.5, muLong: 0.5, alphaN: 0.5, rear: false };
  const _rIn = { dt: 0.5, vx: 0.5, aReq: 0.5, muLong: 0.5, alphaN: 0.5, rear: true };
  const _results = { latScaleF: 1, latScaleR: 1, fxF: 0, fxR: 0, shortfall: 0 };

  function stepPlayer(c, opts) {
    if (!enabled() || !c || !opts) {
      _results.latScaleF = _results.latScaleR = 1;
      _results.fxF = _results.fxR = _results.shortfall = 0;
      return _results;
    }
    const dt = opts.dt;
    sync(c, dt);
    const vx = c.speed || 0;
    let thermalKeep = 1;
    if (thermalEnabled()) {
      const b = opts.braking, wF = b ? Math.max(-opts.aReqF, 0) : 0, wR = b ? Math.max(-opts.aReqR, 0) : 0;
      c.brakeTF = discStep(c.brakeTF, wF * vx, vx, dt);
      c.brakeTR = discStep(c.brakeTR, wR * vx, vx, dt);
      const fF = fadeOf(c.brakeTF), fR = fadeOf(c.brakeTR);
      c.brakeFade = wF + wR > 1e-6 ? (fF * wF + fR * wR) / (wF + wR) : Math.min(fF, fR);
      if (b) thermalKeep = c.brakeFade;
    }
    let aReqF = +opts.aReqF || 0, aReqR = +opts.aReqR || 0;
    if (assistLevel() !== "off") {
      const A = ASSIST[_level];
      const lf = c._absF || (c._absF = { on: 0, t: 0 });
      const lr = c._tcR || (c._tcR = { on: 0, t: 0 });
      if (aReqF < 0 && vx > KAPPA_VMIN) aReqF = clampDemand(lf, c.kappaF, c.kappaF < 0, aReqF, A.abs, A.cut, dt, +opts.muLongF || 0);
      else lf.on = 0;
      if (aReqR > 0) aReqR = clampDemand(lr, c.kappaR, c.kappaR > 0, aReqR, A.tc, A.cut, dt, +opts.muLongR || 0);
      else lr.on = 0;
    }
    const muLongF = Math.max(1e-3, +opts.muLongF || 0);
    const muLongR = Math.max(1e-3, +opts.muLongR || 0);

    const csF = Math.max(+opts.csFront || 130, 1);
    const csR = Math.max(+opts.csRear || 160, 1);
    const muLatF = Math.max(+opts.muLatF || 1, 0.5);
    const muLatR = Math.max(+opts.muLatR || 1, 0.5);
    const peakXF = (typeof TyreModel !== "undefined" && TyreModel.CURVE_PEAK_X_F) || (Math.PI / 2);
    const peakXR = (typeof TyreModel !== "undefined" && TyreModel.CURVE_PEAK_X) || (Math.PI / 2);
    const alphaNF = (opts.slipF || 0) * csF / muLatF / peakXF;
    const alphaNR = (opts.slipR || 0) * csR / muLatR / peakXR;

    _fState.vw = c.vwF; _fState.kappa = c.kappaF;
    _fIn.dt = dt; _fIn.vx = vx; _fIn.aReq = aReqF; _fIn.muLong = muLongF; _fIn.alphaN = alphaNF;
    axleStep(_fState, _fIn, _fOut);
    _rState.vw = c.vwR; _rState.kappa = c.kappaR;
    _rIn.dt = dt; _rIn.vx = vx; _rIn.aReq = aReqR; _rIn.muLong = muLongR; _rIn.alphaN = alphaNR;
    axleStep(_rState, _rIn, _rOut);

    c.vwF = _fOut.vw;
    c.vwR = _rOut.vw;
    c.kappaF = _fOut.kappa;
    c.kappaR = _rOut.kappa;
    c._wsV = vx;
    c.wheelLock = opts.braking ? Math.max(_fOut.locked, _rOut.locked * 0.85) : 0;
    c.wheelSpin = (!opts.braking && opts.thrOn) ? _rOut.spinning : 0;
    c.axFracF = Math.min(1, Math.abs(c.kappaF) / KAPPA_PEAK);
    c.axFracR = Math.min(1, Math.abs(c.kappaR) / KAPPA_PEAK);
    c.axFrac = Math.max(c.axFracF, c.axFracR);
    c.slipFactor = Math.sqrt(Math.max(0, 1 - c.axFracR * c.axFracR));

    const want = Math.abs(aReqF) + Math.abs(aReqR);
    _results.shortfall = want > 1e-6 ? clamp(1 - (_fOut.ach + _rOut.ach) / want, 0, 1) : 0;
    if (thermalKeep < 1) _results.shortfall = 1 - (1 - _results.shortfall) * thermalKeep;
    _results.latScaleF = clamp(_fOut.latScale != null ? _fOut.latScale : 1, 0.05, 1);
    _results.latScaleR = clamp(_rOut.latScale != null ? _rOut.latScale : 1, 0.05, 1);
    _results.fxF = _fOut.fx || 0;
    _results.fxR = _rOut.fx || 0;
    return _results;
  }

  return Object.freeze({
    enabled, setEnabled, axleStep, stepPlayer, assistLevel, setAssistLevel, mode, setMode,
    thermalEnabled, setThermal, fadeOf, discStep,
  });
})();
