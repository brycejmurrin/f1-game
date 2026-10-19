/* Apex 26 — WHEEL STATE: torque-balanced per-axle rim speed and slip ratio.
 * Opt-in (default OFF). When OFF, PlayerForces never calls in and tip handling
 * stays byte-identical. When ON, heavy brake locks and hard throttle at low
 * speed spins; combined slip scales lateral grip from κ.
 *
 * Scoped first slice of #1628: state + κ + telemetry live here. game.js still
 * integrates longitudinal speed from the legacy axFrac path — wiring Fx into
 * c.speed is follow-up (see docs/notes/WHEEL-STATE-2026-10-19.md).
 *
 * Design: docs/notes/PLAYER-PHYSICS-PLAN-TIER2-2026-09.md §5.
 */
const WheelState = (function () {
  "use strict";

  const clamp = M4.clamp;

  // Absolute long capacity (accel units), like LAT_MAX. Pedal torque sits above
  // capacity at low/mid speed so a stamp can lock; WHEEL_J sets lock time.
  const LONG_CAP = 26;
  const BRAKE_PEDAL = 40;
  const KAPPA_PEAK = 0.10;
  const KAPPA_MAX = 1;
  const KAPPA_VMIN = 3;       // m/s floor in κ = (vw−vx)/max(|vx|,…)
  const KAPPA_RELAX_M = 0.4;  // metres of travel to relax toward κ*
  const WHEEL_J = 0.10;       // effective I/m·R² — ~100 ms lock at 40 m/s
  const LOCK_KAPPA = 0.55;     // |κ|/KAPPA_PEAK above this → wheelLock telemetry
  const SPIN_KAPPA = 0.55;     // +κ_R normalised → wheelSpin telemetry

  let _enabled = false;
  let _resolved = false;

  function resolveEnabled() {
    if (_resolved) return _enabled;
    _resolved = true;
    try {
      if (typeof localStorage !== "undefined") {
        const raw = localStorage.getItem("apex26.wheelState");
        if (raw === "1" || raw === "on" || raw === "true") _enabled = true;
        else if (raw === "0" || raw === "off" || raw === "false") _enabled = false;
      }
    } catch (_) { /* private mode: stay at default OFF */ }
    return _enabled;
  }

  /** Live opt-in. Default OFF. Tests / __apex use setEnabled. */
  function enabled() { return resolveEnabled(); }

  function setEnabled(v) {
    _resolved = true;
    _enabled = !!v;
    // Writer for apex26.wheelState (store-registry ratchet). Persistence is
    // best-effort; private mode keeps the in-memory flag for the session.
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem("apex26.wheelState", _enabled ? "1" : "0");
      }
    } catch (_) { /* private mode / blocked storage */ }
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

  function kappaOf(vw, vx) {
    return (vw - vx) / Math.max(Math.abs(vx), KAPPA_VMIN);
  }

  /**
   * One axle: demand aReq (accel units, +drive / −brake) vs tyre Fx; update vw.
   * Pure over numbers; writes into `out` { vw, kappa, fx, locked, spinning }.
   *
   * @param {{ vw: number }} state
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
    const demandOver = Math.abs(aReq) > muLong * 0.98;

    if (!demandOver) {
      // Relax vw toward the κ* that matches demand (no runaway).
      const travel = Math.max(Math.abs(vx), KAPPA_VMIN) * dt;
      const a = 1 - Math.exp(-travel / KAPPA_RELAX_M);
      const vwStar = vx + kStar * Math.max(Math.abs(vx), KAPPA_VMIN);
      vw = vw + (vwStar - vw) * a;
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
      // Runaway: integrate I·ω̇ = (aReq − Fx)·m·R² with impulse clamp so a
      // step never carries vw back across vx (avoids κ sign chatter).
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
    const knAbs = Math.abs(kappa) / KAPPA_PEAK;
    o.locked = kappa < 0 ? clamp((knAbs - LOCK_KAPPA) / (1 - LOCK_KAPPA), 0, 1) : 0;
    o.spinning = kappa > 0 ? clamp((knAbs - SPIN_KAPPA) / (1 - SPIN_KAPPA), 0, 1) : 0;
    // Lateral share of the friction ellipse (1 at free roll, →0 as |κn|→1).
    o.latScale = Math.sqrt(Math.max(0, 1 - Math.min(1, knAbs * knAbs)));
    if (o.latScale < 0.05) o.latScale = 0.05;
    return o;
  }

  // Scratch bags — one step, no alloc.
  const _fOut = {};
  const _rOut = {};
  const _results = { latScaleF: 1, latScaleR: 1, fxF: 0, fxR: 0 };

  /**
   * PlayerForces hook. Mutates rim speeds, kappa, wheelLock, wheelSpin on `c`.
   * Returns lateral grip scales for the Fy path. No-op contract when !enabled().
   *
   * opts: { dt, loadF, loadR, braking, thrOn, throttleLvl, gearMult, deploy,
   *         weatherGrip, surfaceMu, kerbGrip, aeroGrip, tyreMu, tyreAx,
   *         slipF, slipR, csFront, csRear, muLatF, muLatR, brakeBias }
   */
  function stepPlayer(c, opts) {
    if (!enabled() || !c || !opts) {
      _results.latScaleF = 1;
      _results.latScaleR = 1;
      _results.fxF = 0;
      _results.fxR = 0;
      return _results;
    }
    ensure(c);
    const dt = opts.dt;
    const vx = c.speed || 0;
    const weatherGrip = opts.weatherGrip != null ? opts.weatherGrip : 1;
    const surfaceMu = opts.surfaceMu != null ? opts.surfaceMu : 1;
    const kerbGrip = opts.kerbGrip != null ? opts.kerbGrip : 1;
    const aeroGrip = opts.aeroGrip != null ? opts.aeroGrip : 1;
    const tyreMu = opts.tyreMu != null ? opts.tyreMu : 1;
    const tyreAx = opts.tyreAx || { f: 1, r: 1 };
    const loadF = Math.max(+opts.loadF || 0.5, 0.05);
    const loadR = Math.max(+opts.loadR || 0.5, 0.05);

    const grip = weatherGrip * surfaceMu * kerbGrip * aeroGrip * tyreMu;
    const muLongF = Math.max(1e-3, LONG_CAP * loadF * grip * tyreAx.f);
    const muLongR = Math.max(1e-3, LONG_CAP * loadR * grip * tyreAx.r);

    // Brake demand: full pedal above capacity so a stamp locks at low grip.
    let aBrakeF = 0, aBrakeR = 0;
    if (opts.braking) {
      const aBrake = -BRAKE_PEDAL;
      // Bias: more front by default (BB_REF-ish 0.56).
      const bb = (opts.brakeBias != null && Number.isFinite(opts.brakeBias))
        ? clamp(opts.brakeBias, 0.3, 0.8) : 0.56;
      aBrakeF = aBrake * bb;
      aBrakeR = aBrake * (1 - bb);
    }

    // Drive + ERS on the rear only.
    let aDriveR = 0;
    if (opts.thrOn && !opts.braking) {
      const thr = clamp(+opts.throttleLvl || 0, 0, 1.5);
      const gear = opts.gearMult != null ? +opts.gearMult : 1;
      const deploy = Math.max(0, +opts.deploy || 0);
      // Low-speed surplus: demand above muLong → wheelspin.
      aDriveR = (LONG_CAP * 1.35) * thr * gear + deploy;
    }

    const csF = Math.max(+opts.csFront || 130, 1);
    const csR = Math.max(+opts.csRear || 160, 1);
    const muLatF = Math.max(+opts.muLatF || 1, 0.5);
    const muLatR = Math.max(+opts.muLatR || 1, 0.5);
    const peakXF = (typeof TyreModel !== "undefined" && TyreModel.CURVE_PEAK_X_F) || (Math.PI / 2);
    const peakXR = (typeof TyreModel !== "undefined" && TyreModel.CURVE_PEAK_X) || (Math.PI / 2);
    const alphaNF = (opts.slipF || 0) * csF / muLatF / peakXF;
    const alphaNR = (opts.slipR || 0) * csR / muLatR / peakXR;

    axleStep({ vw: c.vwF }, {
      dt, vx, aReq: aBrakeF, muLong: muLongF, alphaN: alphaNF,
    }, _fOut);
    axleStep({ vw: c.vwR }, {
      dt, vx, aReq: aBrakeR + aDriveR, muLong: muLongR, alphaN: alphaNR,
    }, _rOut);

    c.vwF = _fOut.vw;
    c.vwR = _rOut.vw;
    c.kappaF = _fOut.kappa;
    c.kappaR = _rOut.kappa;
    c.wheelLock = opts.braking ? Math.max(_fOut.locked, _rOut.locked * 0.85) : 0;
    c.wheelSpin = (!opts.braking && opts.thrOn) ? _rOut.spinning : 0;
    // Keep axFrac* meaningful for coach / debris: |κn| capped at 1.
    c.axFracF = Math.min(1, Math.abs(c.kappaF) / KAPPA_PEAK);
    c.axFracR = Math.min(1, Math.abs(c.kappaR) / KAPPA_PEAK);
    c.axFrac = Math.max(c.axFracF, c.axFracR);
    c.slipFactor = Math.sqrt(Math.max(0, 1 - c.axFracR * c.axFracR));

    _results.latScaleF = clamp(_fOut.latScale != null ? _fOut.latScale : 1, 0.05, 1);
    _results.latScaleR = clamp(_rOut.latScale != null ? _rOut.latScale : 1, 0.05, 1);
    _results.fxF = _fOut.fx || 0;
    _results.fxR = _rOut.fx || 0;
    return _results;
  }

  return Object.freeze({
    enabled, setEnabled, ensure, kappaOf, axleStep, stepPlayer,
    LONG_CAP, BRAKE_PEDAL, KAPPA_PEAK, KAPPA_MAX, KAPPA_VMIN,
    KAPPA_RELAX_M, WHEEL_J, LOCK_KAPPA, SPIN_KAPPA,
  });
})();
