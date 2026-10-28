/* Apex 26 — WHEEL STATE: torque-balanced per-axle rim speed and slip ratio.
 * Opt-in (default OFF). When OFF, PlayerForces never calls in and tip handling
 * stays byte-identical. When ON, an axle whose brake or drive demand exceeds
 * its tyre's longitudinal capacity (wet, grass, kerb, light load, lateral slip
 * already spending the circle) runs away into lock or spin; the sliding tyre
 * then delivers less than was asked and PlayerForces hands that shortfall back
 * to c.speed, so a lock-up stops LONGER and wheelspin accelerates SLOWER.
 *
 * Demand and capacity come from the caller in accel units (PlayerForces bills
 * the same grip circle the legacy axFrac path does: LONG_GRIP x weather), so a
 * dry BB_REF stop (~0.64 of the circle) never locks. #1628;
 * docs/notes/WHEEL-STATE-2026-10-19.md, plan Tier2 §5.
 */
const WheelState = (function () {
  "use strict";

  const clamp = M4.clamp;

  const KAPPA_PEAK = 0.10;
  const KAPPA_MAX = 1;
  const KAPPA_VMIN = 3;       // m/s floor in κ = (vw−vx)/max(|vx|,…)
  const KAPPA_RELAX_M = 0.4;  // metres of travel to relax toward κ*
  const WHEEL_J = 0.10;       // effective I/m·R² — ~100 ms lock at 40 m/s
  // Lock / spin telemetry starts PAST the peak (|κ|/KAPPA_PEAK > 1): a tyre
  // still under its peak is gripping, however hard it is worked, and is full
  // at κ = 0.25. The first slice keyed this at 0.55 of peak, so every dry stop
  // read as a lock-up.
  const LOCK_KAPPA = 1;
  const SPIN_KAPPA = 1;
  const LOCK_SPAN = 1.5;
  // A speed change no tyre can make in one tick (> 8 g) is a placement — jump(),
  // a reset, a rescue — not dynamics: the rims re-sync to the new body speed.
  const RESYNC_A = 80;

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

  /** `persist` false = this session only (__apex.setPhysics({wheelState})); default persists. */
  function setEnabled(v, persist = true) {
    _resolved = true;
    _enabled = !!v;
    if (!persist) return;
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
    // Longitudinal room left by the lateral slip (ellipse): an axle already at
    // its cornering peak (|alphaN| ≥ 1) has almost none, so power on a corner
    // exit spins the rear and a trail-brake at the limit locks the front.
    const room = Math.sqrt(Math.max(0.0025, 1 - Math.min(1, alphaN * alphaN)));
    const demandOver = Math.abs(aReq) > muLong * room * 0.98;

    if (!demandOver) {
      // Relax the SLIP toward the κ* that matches demand (no runaway). Relaxing
      // the rim speed instead left vw trailing an accelerating body by ~1 m/s
      // at 3 m/s — a phantom lock under full throttle (measured κR −0.16).
      const travel = Math.max(Math.abs(vx), KAPPA_VMIN) * dt;
      const a = 1 - Math.exp(-travel / KAPPA_RELAX_M);
      // The slip carried in is the last tick's κ (state.kappa) when known: a
      // gripping wheel turns with the body, so the body's own acceleration
      // must not read as slip.
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
    // What the tyre actually delivered toward the demand (accel units, ≥ 0):
    // all of it while torque-limited, the sliding force once it ran away.
    o.ach = demandOver ? Math.min(Math.abs(aReq), Math.abs(fx)) : Math.abs(aReq);
    const knAbs = Math.abs(kappa) / KAPPA_PEAK;
    // Lock/spin follow the travel direction: in reverse a rim slower than the body has κ > 0.
    const kDir = vx < 0 ? -kappa : kappa;
    o.locked = kDir < 0 ? clamp((knAbs - LOCK_KAPPA) / LOCK_SPAN, 0, 1) : 0;
    o.spinning = kDir > 0 ? clamp((knAbs - SPIN_KAPPA) / LOCK_SPAN, 0, 1) : 0;
    // Lateral share of the combined force: the tyre makes F(ρ) along its slip
    // direction, so its lateral part is F(ρ)·|αN|/ρ, against the pure-lateral
    // F(|αN|) the Fy path already computes. Free roll is 1; a locked or
    // spinning tyre keeps only the sliding force's sideways share. The first
    // slice's √(1−κn²) hit its 0.05 floor the instant κ passed the peak.
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

  /**
   * PlayerForces hook. Mutates rim speeds, kappa, wheelLock, wheelSpin on `c`.
   * Returns lateral grip scales for the Fy path and `shortfall` ∈ [0, 1]: the
   * fraction of the longitudinal demand the tyres did NOT deliver this tick
   * (0 while every axle is torque-limited). No-op contract when !enabled().
   *
   * opts: { dt, braking, thrOn, aReqF, aReqR (accel, +drive / −brake),
   *         muLongF, muLongR (accel capacity), slipF, slipR, csFront, csRear,
   *         muLatF, muLatR }
   */
  function stepPlayer(c, opts) {
    if (!enabled() || !c || !opts) {
      _results.latScaleF = 1;
      _results.latScaleR = 1;
      _results.fxF = 0;
      _results.fxR = 0;
      _results.shortfall = 0;
      return _results;
    }
    const dt = opts.dt;
    sync(c, dt);
    const vx = c.speed || 0;
    const aReqF = +opts.aReqF || 0, aReqR = +opts.aReqR || 0;
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
    _results.latScaleF = clamp(_fOut.latScale != null ? _fOut.latScale : 1, 0.05, 1);
    _results.latScaleR = clamp(_rOut.latScale != null ? _rOut.latScale : 1, 0.05, 1);
    _results.fxF = _fOut.fx || 0;
    _results.fxR = _rOut.fx || 0;
    return _results;
  }

  return Object.freeze({
    enabled, setEnabled, ensure, sync, kappaOf, axleStep, stepPlayer,
    KAPPA_PEAK, KAPPA_MAX, KAPPA_VMIN,
    KAPPA_RELAX_M, WHEEL_J, LOCK_KAPPA, SPIN_KAPPA, LOCK_SPAN, RESYNC_A,
  });
})();
