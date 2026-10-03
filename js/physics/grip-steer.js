/* Apex 26 — GripSteer: own-state steering cap at the front's peak slip.
   Assist-gated (slider notch 1 = OFF). Reads only the player's bicycle state
   (vLat, yawRate, speed, muF, steer) — never the road arc or its cache, and
   never raises ROAD_FOLLOW. Design: docs/notes/PLAYER-PHYSICS-PLAN-TIER2-2026-09.md §4.1. */
const GripSteer = (function () {
  "use strict";

  const TARGET = 0.95;          // peak slip fraction the cap aims for
  const CR = 0.3;               // countersteer room scale
  const TAU = 0.04;             // low-pass on the cap (s)
  const V_LO = 2, V_HI = 6;     // m/s: off below, full by
  const clamp = M4.clamp;
  const lerp = M4.lerp;

  let level = 1;                // slider notch; 1 = OFF
  let k = 0;                    // assistK(level)

  // Notch 1 = OFF (k = 0); notch 10 = full (k = 1).
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

  function smoothstep(edge0, edge1, x) {
    const t = clamp((x - edge0) / Math.max(edge1 - edge0, 1e-9), 0, 1);
    return t * t * (3 - 2 * t);
  }

  /**
   * Cap the driver's road-wheel demand so it cannot push the front past its
   * peak slip, with room to countersteer a rear slide. Pure over numbers;
   * `state.capSm` is the caller's smoothed cap (mutated / returned).
   *
   * @param {number} driverDelta  shaped lock before ROAD_FOLLOW / line assist
   * @param {object} state  { vLat, yawRate, speed, muF, csFront, af, ar, braking, shaped, capSm, dt }
   * @param {number} [kk]   assist strength; defaults to the live slider level
   * @returns {{ delta: number, capSm: number }}
   */
  function apply(driverDelta, state, kk) {
    const strength = kk == null ? k : +kk || 0;
    if (!(strength > 0) || !state) return { delta: driverDelta, capSm: state && state.capSm || 0 };

    const speed = +state.speed || 0;
    if (!(speed > 0)) return { delta: driverDelta, capSm: state.capSm || 0 };   // rest + reverse

    const blend = strength * smoothstep(V_LO, V_HI, speed);
    if (!(blend > 0)) return { delta: driverDelta, capSm: state.capSm || 0 };

    const vx = Math.max(Math.abs(speed), 0.5);
    const r = +state.yawRate || 0;
    const vLat = +state.vLat || 0;
    const af = +state.af || 1.2;
    const ar = +state.ar || 1.2;
    const muF = Math.max(+state.muF || 1, 0.5);
    const cs = Math.max(+state.csFront || 130, 1);

    const betaF = Math.atan2(vLat + af * r, vx);
    const betaR = Math.atan2(vLat - ar * r, vx);
    const s = Math.sign(driverDelta) || Math.sign(state.shaped) || 1;
    const alphaPk = (Math.PI / 2) * muF / cs * TARGET;

    let capIn = alphaPk + Math.max(s * betaF, -0.5 * alphaPk);
    if (state.braking) capIn *= 0.9;
    const capCtr = (0.1 + 0.6 * CR) * alphaPk - s * betaR;
    const w = smoothstep(0, 0.05, -s * betaR);
    let cap = lerp(capIn, capCtr, w);
    if (cap < 0.25 * alphaPk) cap = 0.25 * alphaPk;

    const dt = Math.max(+state.dt || 1 / 60, 1e-4);
    const a = 1 - Math.exp(-dt / TAU);
    const capSm = (state.capSm || 0) + (cap - (state.capSm || 0)) * a;

    const deltaCap = s * Math.min(Math.abs(driverDelta), capSm);
    const shaped = Math.abs(+state.shaped || 0);
    let self = clamp(-betaR * 0.35, -0.5 * alphaPk, 0.5 * alphaPk) - r * 0.012;
    self *= (1 - 0.7 * Math.min(shaped, 1));

    return { delta: lerp(driverDelta, deltaCap + self, blend), capSm };
  }

  /** Call-site helper for updateCar: identity when the slider is OFF. */
  function forPlayer(driverDelta, c, opts) {
    if (!(k > 0) || !c || !opts) return driverDelta;
    const out = apply(driverDelta, {
      vLat: c.vLat || 0, yawRate: c.yawRateCur || 0, speed: c.speed,
      muF: opts.muF, csFront: opts.csFront, af: opts.af, ar: opts.ar,
      braking: !!opts.braking, shaped: opts.shaped,
      capSm: c.gripSteerCapSm || 0, dt: opts.dt,
    });
    c.gripSteerCapSm = out.capSm;
    return out.delta;
  }

  return Object.freeze({
    assistK, setLevel, labelOf, apply, forPlayer,
    level: () => level, k: () => k,
    TARGET, CR, TAU, V_LO, V_HI,
  });
})();
