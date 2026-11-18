/* Apex 26 — WHEEL STATE: torque-balanced per-axle rim speed and slip ratio. Opt-in (#1628), default OFF:
 * OFF never enters PlayerForces' branch. ON, an axle whose brake or drive demand exceeds its tyre's
 * longitudinal capacity runs away into lock or spin, and the shortfall goes back to c.speed (a lock-up
 * stops LONGER, wheelspin accelerates SLOWER). Demand and capacity are accel units on the legacy
 * LONG_GRIP circle. docs/notes/WHEEL-STATE-2026-10-19.md, plan Tier2 §5.
 */
const WheelState = (function () {
  "use strict";

  const clamp = M4.clamp;

  const KAPPA_PEAK = 0.10;
  const KAPPA_MAX = 1;
  const KAPPA_VMIN = 3;       // m/s floor in κ = (vw−vx)/max(|vx|,…)
  const KAPPA_RELAX_M = 0.4;  // metres of travel to relax toward κ*
  const WHEEL_J = 0.10;       // effective I/m·R² — ~100 ms lock at 40 m/s
  // Lock / spin telemetry starts PAST the peak (|κ|/KAPPA_PEAK > 1); under it the tyre grips.
  const LOCK_KAPPA = 1;
  const SPIN_KAPPA = 1;
  const LOCK_SPAN = 1.5;
  // A speed change no tyre can make in one tick (> 8 g) is a placement — jump(),
  // a reset, a rescue — not dynamics: the rims re-sync to the new body speed.
  const RESYNC_A = 80;

  // ABS / TC levels (Tier2 §5, #3983): torque clamps with hysteresis. Latch when
  // |κ| passes the level's threshold, cut the demand by `cut`, hold ABS_HOLD s,
  // release above threshold + KAPPA_HYST (below it, in |κ| terms). Default "off"
  // = no clamp, so the opt-in wheel state behaves exactly as before.
  const KAPPA_HYST = 0.06;
  const ABS_HOLD = 0.05;
  const ASSIST = Object.freeze({
    medium: Object.freeze({ abs: 0.20, tc: 0.22, cut: 0.55 }),
    full: Object.freeze({ abs: 0.12, tc: 0.14, cut: 0.45 }),
  });
  let _level = "off", _levelResolved = false;
  /** "off" | "medium" | "full"; anything else reads as off. Stored as apex26.wheelAssist. */
  function assistLevel() {
    if (!_levelResolved) {
      _levelResolved = true;
      try { const r = localStorage.getItem("apex26.wheelAssist"); if (r === "medium" || r === "full") _level = r; } catch (_) { /* blocked storage */ }
    }
    return _level;
  }
  /** `persist` false = this session only. */
  function setAssistLevel(v, persist = true) {
    _levelResolved = true;
    _level = (v === "medium" || v === "full") ? v : "off";
    if (persist) { try { localStorage.setItem("apex26.wheelAssist", _level); } catch (_) { /* blocked storage */ } }
    return _level;
  }
  /** The settings row's one value: "off" (classic model) | "on" (wheel state) | "medium" | "full" (wheel state + ABS/TC). */
  function mode() { return !resolveEnabled() ? "off" : assistLevel() === "off" ? "on" : assistLevel(); }
  function setMode(m) {
    setEnabled(m !== "off");
    if (m !== "off") setAssistLevel(m === "medium" || m === "full" ? m : "off");
    return mode();
  }

  /** One clamp: returns the demand to use; `latch` is { on, t } mutated in place. */
  function clampDemand(latch, k, dirOk, aReq, thr, cut, dt, cap) {
    const kAbs = dirOk ? Math.abs(k) : 0;
    if (kAbs > thr) { latch.on = 1; latch.t = ABS_HOLD; }
    else if (latch.on) {
      latch.t -= dt;
      if (latch.t <= 0 && kAbs < Math.max(0, thr - KAPPA_HYST)) latch.on = 0;
    }
    // Cut, and never ask more than the tyre can give: a binary pedal's demand sits far above capacity.
    return latch.on ? Math.sign(aReq) * Math.min(Math.abs(aReq) * (1 - cut), cap * 0.95) : aReq;
  }

  let _enabled = false;
  let _resolved = false;

  // BRAKE THERMAL (#1577, default OFF, needs wheel state): disc heat from brake power, airflow cooling, pad fade past T_FADE0.
  const T_AMB = 100, T_FADE0 = 650, T_FADE1 = 950, FADE_MAX = 0.35, HEAT_K = 0.07, COOL_0 = 0.03, COOL_V = 0.0012;
  let _thermal = false, _thermalResolved = false;
  function thermalEnabled() {
    if (!_thermalResolved) {
      _thermalResolved = true;
      try { _thermal = localStorage.getItem("apex26.brakeThermal") === "1"; } catch (_) { /* blocked storage */ }
    }
    return _thermal;
  }
  function setThermal(v, persist = true) {
    _thermalResolved = true;
    _thermal = !!v;
    if (persist) { try { localStorage.setItem("apex26.brakeThermal", _thermal ? "1" : "0"); } catch (_) { /* blocked storage */ } }
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
    } catch (_) { /* private mode: stay at default OFF */ }
    return _enabled;
  }

  /** Live opt-in. Default OFF. Tests / __apex use setEnabled. */
  function enabled() { return resolveEnabled(); }

  /** `persist` false = this session only (__apex.setPhysics({wheelState})); default persists. */
  function setEnabled(v, persist = true) {
    _resolved = true;
    _enabled = !!v;
    if (!persist) return;
    try { localStorage.setItem("apex26.wheelState", _enabled ? "1" : "0"); } catch (_) { /* private mode / blocked storage */ }
  }

  /** Sync rim speeds to body speed when missing or non-finite (jump/reset stand-in). */
  function ensure(c) {
    if (!c) return;
    const u = Number.isFinite(c.speed) ? c.speed : 0;
    if (!Number.isFinite(c.vwF)) c.vwF = u;
    if (!Number.isFinite(c.vwR)) c.vwR = u;
    if (!Number.isFinite(c.kappaF)) c.kappaF = 0;
    if (!Number.isFinite(c.kappaR)) c.kappaR = 0;
    if (!Number.isFinite(c.wheelSpin)) c.wheelSpin = 0;
  }

  /** ensure() plus a re-sync when c.speed jumped since the last step (placement). */
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

  /**
   * One axle: demand aReq (accel units, +drive / −brake) vs tyre Fx; update vw.
   * Pure over numbers; writes into `out` { vw, kappa, fx, locked, spinning }.
   *
   * @param {{ vw: number, kappa?: number }} state
   * @param {{ dt: number, vx: number, aReq: number, muLong: number, alphaN?: number }} params
   * @param {object} [out]
   */
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

    // Combined-slip abscissa: ρ=1 at the lateralCurve peak on both axes.
    let kappa = clamp(kappaOf(vw, vx), -KAPPA_MAX, KAPPA_MAX);
    const kn = kappa / KAPPA_PEAK;
    const rho = Math.hypot(alphaN, kn);
    const peakX = (typeof TyreModel !== "undefined" && TyreModel.CURVE_PEAK_X) || (Math.PI / 2);
    const f = (typeof TyreModel !== "undefined" && TyreModel.lateralCurve)
      ? Math.abs(TyreModel.lateralCurve(rho * peakX))
      : Math.min(1, rho);
    const share = rho > 1e-9 ? f / rho : 0;
    // Sign: drive (+κ) pushes the car forward (+Fx); brake (−κ) resists.
    let fx = muLong * share * kn;
    // Capacity clamp — |Fx| cannot exceed the long ellipse share of muLong.
    const fxCap = muLong * Math.max(f, 1e-6);
    if (fx > fxCap) fx = fxCap;
    if (fx < -fxCap) fx = -fxCap;

    // Closed-form κ* for the torque-limited regime: Fx(κ*) ≈ aReq.
    // Linearised near peak: Fx ≈ muLong·(κ/KAPPA_PEAK) while |κ|≪peak and α≈0.
    const kStar = clamp((aReq / muLong) * KAPPA_PEAK, -KAPPA_MAX, KAPPA_MAX);
    // Longitudinal room left by the lateral slip: an axle at its cornering peak has almost none.
    const room = Math.sqrt(Math.max(0.0025, 1 - Math.min(1, alphaN * alphaN)));
    const demandOver = Math.abs(aReq) > muLong * room * 0.98;

    if (!demandOver) {
      // Relax the SLIP (not the rim speed: that read a phantom lock under full throttle) toward κ*.
      const travel = Math.max(Math.abs(vx), KAPPA_VMIN) * dt;
      const a = 1 - Math.exp(-travel / KAPPA_RELAX_M);
      const k0 = Number.isFinite(state.kappa) ? clamp(state.kappa, -KAPPA_MAX, KAPPA_MAX) : kappa;
      vw = vx + (k0 + (kStar - k0) * a) * Math.max(Math.abs(vx), KAPPA_VMIN);
      // Recompute Fx at the relaxed state for telemetry.
      kappa = clamp(kappaOf(vw, vx), -KAPPA_MAX, KAPPA_MAX);
      const kn2 = kappa / KAPPA_PEAK;
      const rho2 = Math.hypot(alphaN, kn2);
      const f2 = (typeof TyreModel !== "undefined" && TyreModel.lateralCurve)
        ? Math.abs(TyreModel.lateralCurve(rho2 * peakX))
        : Math.min(1, rho2);
      const share2 = rho2 > 1e-9 ? f2 / rho2 : 0;
      fx = clamp(muLong * share2 * kn2, -muLong, muLong);
    } else {
      // Runaway: integrate I·ω̇ = (aReq − Fx)·m·R², clamped so vw never crosses vx in one step.
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
    // What the tyre actually delivered toward the demand (accel units, ≥ 0):
    // all of it while torque-limited, the sliding force once it ran away.
    o.ach = demandOver ? Math.min(Math.abs(aReq), Math.abs(fx)) : Math.abs(aReq);
    const knAbs = Math.abs(kappa) / KAPPA_PEAK;
    // Lock/spin follow the travel direction: in reverse a rim slower than the body has κ > 0.
    const kDir = vx < 0 ? -kappa : kappa;
    o.locked = kDir < 0 ? clamp((knAbs - LOCK_KAPPA) / LOCK_SPAN, 0, 1) : 0;
    o.spinning = kDir > 0 ? clamp((knAbs - SPIN_KAPPA) / LOCK_SPAN, 0, 1) : 0;
    // Lateral share of the combined force: F(ρ)·|αN|/ρ against the pure-lateral F(|αN|). Free roll is 1.
    const aN = Math.abs(alphaN), rhoL = Math.hypot(aN, knAbs);
    const g = (x) => (typeof TyreModel !== "undefined" && TyreModel.lateralCurve)
      ? Math.abs(TyreModel.lateralCurve(x * peakX)) : Math.min(1, x);
    const per = (x) => (x > 1e-3 ? g(x) / x : g(1e-3) / 1e-3);   // F(x)/x, its slope at 0
    o.latScale = clamp(per(rhoL) / per(aN), 0.05, 1);
    return o;
  }

  // Scratch bags — one step, no alloc.
  const _fOut = {};
  const _rOut = {};
  // Pooled axleStep inputs (audit4 P2): axleStep reads them before it writes its out bag and keeps none.
  const _fState = { vw: 0.5, kappa: 0.5 };
  const _rState = { vw: 0.5, kappa: 0.5 };
  const _fIn = { dt: 0.5, vx: 0.5, aReq: 0.5, muLong: 0.5, alphaN: 0.5 };
  const _rIn = { dt: 0.5, vx: 0.5, aReq: 0.5, muLong: 0.5, alphaN: 0.5 };
  const _results = { latScaleF: 1, latScaleR: 1, fxF: 0, fxR: 0, shortfall: 0 };

  /** PlayerForces hook: mutates rim speeds, kappa, wheelLock, wheelSpin on `c`; returns lateral grip scales and `shortfall` ∈ [0, 1] (the demand the tyres did not deliver). opts: Vehicle.wheel. */
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
      // ABS: front brake demand while rolling forwards; TC: rear drive demand.
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
    // Keep axFrac* meaningful for coach / debris: |κn| capped at 1.
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

  // ensure/sync/kappaOf + the KAPPA_*/WHEEL_J/LOCK_*/SPIN_*/RESYNC_* knobs are
  // stepPlayer internals — tests drive axleStep / stepPlayer / enabled only.
  return Object.freeze({
    enabled, setEnabled, axleStep, stepPlayer, assistLevel, setAssistLevel, mode, setMode,
    thermalEnabled, setThermal, fadeOf, discStep,
  });
})();
