const GripSteer = (function () {
  "use strict";

  const TARGET = 0.95;
  const CR = 0.3;
  const TAU = 0.04;
  const V_LO = 2, V_HI = 6;
  const VX_FLOOR = 4;
  const clamp = M4.clamp;
  const lerp = M4.lerp;

  let level = 1;
  let k = 0;

  const _st = {
    vLat: 0, yawRate: 0, speed: 0, muF: 0, csFront: 0, af: 0, ar: 0,
    braking: false, shaped: 0, capSm: 0, dt: 0,
  };
  const _out = { delta: 0, capSm: 0 };
  const _res = { delta: 0, capSm: 0 };
  function res(delta, capSm) { _res.delta = delta; _res.capSm = capSm; return _res; }

  function assistK(n) {
    const v = +n;
    if (!(v > 1)) return 0;
    return clamp((v - 1) / 9, 0, 1);
  }
  function setLevel(v) {
    if (typeof v === "number" && isFinite(v)) {
      level = clamp(v, 1, 10);
      k = assistK(level);
    }
  }
  function labelOf(v) { return v <= 1 ? "OFF" : "GRIP " + v; }

  function frontPeakX() {
    return (typeof TyreModel !== "undefined" && TyreModel.CURVE_PEAK_X_F) || Math.PI / 2;
  }

  function smoothstep(edge0, edge1, x) {
    const t = clamp((x - edge0) / Math.max(edge1 - edge0, 1e-9), 0, 1);
    return t * t * (3 - 2 * t);
  }

  function apply(driverDelta, state, kk) {
    const strength = kk == null ? k : +kk || 0;
    if (!(strength > 0) || !state) return res(driverDelta, state && state.capSm || 0);

    const speed = +state.speed || 0;
    if (!(speed > 0)) return res(driverDelta, state.capSm || 0);

    const blend = strength * smoothstep(V_LO, V_HI, speed);
    if (!(blend > 0)) return res(driverDelta, state.capSm || 0);

    const vx = Math.max(Math.abs(speed), VX_FLOOR);
    const r = +state.yawRate || 0;
    const vLat = +state.vLat || 0;
    const af = +state.af || 1.2;
    const ar = +state.ar || 1.2;
    const muF = Math.max(+state.muF || 1, 0.5);
    const cs = Math.max(+state.csFront || 130, 1);

    const betaF = Math.atan2(vLat + af * r, vx);
    const betaR = Math.atan2(vLat - ar * r, vx);
    const s = Math.sign(driverDelta) || Math.sign(state.shaped) || 1;
    const alphaPk = frontPeakX() * muF / cs * TARGET;

    let capIn = alphaPk + Math.max(s * betaF, -0.5 * alphaPk);
    if (state.braking) capIn *= 0.9;
    const capCtr = (0.1 + 0.6 * CR) * alphaPk + s * betaR;
    const w = smoothstep(0, 0.05, s * betaR);
    let cap = lerp(capIn, capCtr, w);
    if (cap < 0.25 * alphaPk) cap = 0.25 * alphaPk;

    const dt = Math.max(+state.dt || 1 / 60, 1e-4);
    const a = 1 - Math.exp(-dt / TAU);
    const prev = state.capSm > 0 ? state.capSm : cap;
    const capSm = prev + (cap - prev) * a;

    const deltaCap = s * Math.min(Math.abs(driverDelta), capSm);
    const shaped = Math.abs(+state.shaped || 0);
    let self = clamp(-betaR * 0.35, -0.5 * alphaPk, 0.5 * alphaPk) - r * 0.012;
    self *= (1 - 0.7 * Math.min(shaped, 1));

    return res(lerp(driverDelta, deltaCap + self, blend), capSm);
  }

  function forPlayer(driverDelta, c, opts) {
    if (!(k > 0) || !c || !opts) return driverDelta;
    _st.vLat = c.vLat || 0;
    _st.yawRate = c.yawRateCur || 0;
    _st.speed = c.speed;
    _st.muF = opts.muF;
    _st.csFront = opts.csFront;
    _st.af = opts.af;
    _st.ar = opts.ar;
    _st.braking = !!opts.braking;
    _st.shaped = opts.shaped;
    _st.capSm = c.gripSteerCapSm || 0;
    _st.dt = opts.dt;
    const out = apply(driverDelta, _st);
    c.gripSteerCapSm = out.capSm;
    _out.delta = out.delta;
    _out.capSm = out.capSm;
    return _out.delta;
  }

  return Object.freeze({
    assistK, setLevel, labelOf, apply, forPlayer,
    level: () => level, k: () => k,
    TARGET, VX_FLOOR,
  });
})();
