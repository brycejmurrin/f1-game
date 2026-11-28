/* Apex 26 — PACE / ERS math: vTop/vStd/aStd, X-mode aero gains, paceRef buffer,
 * ERS drain/regen/overtake duration, the deploy taper and regen fade (taperAt/regenSpeedAt), aeroDfMult, and gearHi/rpmFor. Extracted from
 * js/game.js so the first game.js breakup slice is a pure move (no tuning).
 *
 * PaceMath.create(deps) — deps supply live PACE / VMAX / cars / track / raceCtl
 * getters. Reads PhysicsConsts and M4 at eval. Behavior-identical to the
 * pre-extract inline functions.
 */
const PaceMath = (function () {
  "use strict";

  const clamp = M4.clamp;
  const lerp = M4.lerp;
  const PC = typeof PhysicsConsts !== "undefined" ? PhysicsConsts : {};
  const TAPER_LO = PC.TAPER_LO, TAPER_HI = PC.TAPER_HI, TAPER_FLOOR = PC.TAPER_FLOOR, REGEN_FULL_V = PC.REGEN_FULL_V;

  // ERS-PURE (#6550 addition 1, #6559 step 6): the deploy taper and the regen speed fade, on a STANDARD-pace speed
  // (vStd), so a LEARN drill, the HUD or a test reads the very curve the physics uses. Pure: no car, no PACE.
  // Deploy strength 0..1 holding BOOST (or running OVERTAKE, which bypasses it). The taper makes deploy strongest
  // out of slow corners, but it is FLOORED: it used to reach exactly 0 above TAPER_HI, which is only 191 km/h, so on
  // any straight BOOST produced no thrust, and because the drain was gated on `deploy > 0`, it also cost nothing.
  // Real ERS deploys all the way down the straight; so does this, at reduced strength.
  function taperAt(vs, otOn) {
    if (otOn) return 1;
    const t = clamp(1 - (vs - TAPER_LO) / (TAPER_HI - TAPER_LO), 0, 1);
    return TAPER_FLOOR + (1 - TAPER_FLOOR) * t;
  }
  // Recovery is kinetic: it needs the car moving. Full rate from REGEN_FULL_V (a standard-pace speed, so PACE does
  // not move it) down to nothing at a stop, so braking or coasting in the pit box cannot refill the battery (it took
  // ~10 s). Reversing (the brake-held crawl) recovers nothing either.
  function regenSpeedAt(vs) { return clamp(vs / REGEN_FULL_V, 0, 1); }

  // create(deps):
  //   getPACE()     live OVERALL SPEED scale (game.js `let PACE`)
  //   getVMAX()     bare envelope m/s (PhysicsConsts.VMAX, passed so the dep is explicit)
  //   getCars()     current field array (paceRef cache key)
  //   getTrack()    current track (paceRef length = track.n)
  //   getRaceCtl()  RaceControl handle or null (aeroWetK reads lowGrip())
  function create(deps) {
    const getPACE = deps.getPACE;
    const getVMAX = deps.getVMAX;
    const getCars = deps.getCars;
    const getTrack = deps.getTrack;
    const getRaceCtl = deps.getRaceCtl;

    const X_VMAX_GAIN_LO = PC.X_VMAX_GAIN_LO;
    const X_VMAX_GAIN_HI = PC.X_VMAX_GAIN_HI;
    const X_DF_LOSS_LO = PC.X_DF_LOSS_LO;
    const X_DF_LOSS_HI = PC.X_DF_LOSS_HI;
    const X_COAST_CUT_LO = PC.X_COAST_CUT_LO;
    const X_COAST_CUT_HI = PC.X_COAST_CUT_HI;
    const DRAIN_LO = PC.DRAIN_LO, DRAIN_HI = PC.DRAIN_HI;
    const REGEN_LO = PC.REGEN_LO, REGEN_HI = PC.REGEN_HI;
    const OT_TIME_LO = PC.OT_TIME_LO, OT_TIME_HI = PC.OT_TIME_HI;
    const GEAR_TOP = PC.GEAR_TOP;
    const IDLE_RPM = PC.IDLE_RPM, MAX_RPM = PC.MAX_RPM;

    // PACE is floored so a setPhysics({pace:0}) can't divide by zero.
    function vTop() { return getVMAX() * Math.max(getPACE(), 0.05); }
    function vStd(v) { return v * getVMAX() / vTop(); }
    // aStd() is vStd() for m/s^2, written as the divisor rather than the
    // VMAX/vTop() round trip so that at PACE === 1 (OVERALL SPEED notch 14) it
    // is the identity to the bit. ("pace 5" was the old piecewise-linear notch
    // that used to land on 1.0 — docs/PHYSICS.md §PACE.)
    function aStd(a) { return a / Math.max(getPACE(), 0.05); }
    // G.pace (#7129): the one façade member for the PACE conversions, so a consumer reads
    // these instead of re-spelling `G.vTop() / VMAX` or the 0.05 floor. vScale is the
    // vTop()/VMAX quotient itself (bit-identical to the old inline sites); k is the floor.
    const pace = Object.freeze({ vStd, aStd, get vScale() { return vTop() / getVMAX(); }, get k() { return Math.max(getPACE(), 0.05); } });

    function aeroLoadOf(c) { return c && c.aeroLoad != null ? c.aeroLoad : 0.5; }
    // An AI car's X-mode reads the neutral wing (docs/PHYSICS.md, #5791).
    function xLoadOf(c) { return c && c.human === false ? 0.5 : aeroLoadOf(c); }
    // LOW GRIP (FIA 2026 B7.1.2(b)): active aero is PARTIAL in the wet — half the
    // trade each way. Exactly 1 on a slick track, so the dry car is untouched.
    function aeroWetK() {
      const rc = getRaceCtl();
      return rc && rc.lowGrip() ? 0.5 : 1;
    }
    function xVmaxGain(c) { return aeroWetK() * lerp(X_VMAX_GAIN_LO, X_VMAX_GAIN_HI, xLoadOf(c)); }
    // The per-node AI speed/vmax profile paceSample learns, one per field
    // (kept on the function: no new top-level state).
    function paceRef() {
      const cars = getCars();
      const track = getTrack();
      let r = paceRef.r;
      if (!r || r.cars !== cars) {
        r = paceRef.r = new Float32Array(track.n);
        r.cars = cars;
      }
      return r;
    }
    function xDfLoss(c) { return aeroWetK() * lerp(X_DF_LOSS_LO, X_DF_LOSS_HI, xLoadOf(c)); }
    function xCoastCut(c) { return aeroWetK() * lerp(X_COAST_CUT_LO, X_COAST_CUT_HI, xLoadOf(c)); }

    function isErsDeploying(c) {
      if (!c) return false;
      // Live flag from the deploy block — covers human BOOST, AI wantBoost, and
      // free OVERTAKE. Do not re-derive from boostOn alone: AI never sets boostOn.
      return !!c.deploying;
    }
    function ersDeployOf(c) { return c && c.ersDeploy != null ? c.ersDeploy : 0.5; }
    function ersRegenOf(c) { return c && c.ersRegen != null ? c.ersRegen : 0.5; }
    // Better deployment DRAINS SLOWER — the same press lasts longer rather than
    // pushing harder, because the push itself is what BOOST already scales.
    function drainFor(c) { return lerp(DRAIN_HI, DRAIN_LO, ersDeployOf(c)); }
    function regenFor(c) { return lerp(REGEN_LO, REGEN_HI, ersRegenOf(c)); }
    function otTimeFor(c) { return lerp(OT_TIME_LO, OT_TIME_HI, ersDeployOf(c)); }
    // The car's own taper and regen fade (game.js's physics calls these): the pure curves at its vStd speed.
    function deployTaper(c) { return taperAt(vStd(c.speed), c.otT > 0); }
    function regenSpeedK(c) { return regenSpeedAt(vStd(c.speed)); }

    // Live downforce multiplier on the DOWNFORCE (aero-load) term. 1 in Z-mode,
    // 1 - X_DF_LOSS with the flaps fully open.
    function aeroDfMult(c) { return 1 - xDfLoss(c) * (c && c.aeroX || 0); }

    function gearHi(g) { return vTop() * GEAR_TOP[g - 1]; }
    function rpmFor(gear, speed) {
      // RPM is proportional to speed / this gear's top speed: a higher gear turns
      // the engine slower at a given speed. Floored at idle, capped just past
      // redline. (This also drives the engine pitch and the tach.)
      const hi = gearHi(gear);
      const rpm = MAX_RPM * (speed / Math.max(hi, 1));
      return clamp(rpm, IDLE_RPM, MAX_RPM * 1.04);
    }

    return {
      vTop, vStd, aStd, pace,
      xVmaxGain, paceRef, xCoastCut, xDfLoss,
      isErsDeploying, drainFor, regenFor, otTimeFor, deployTaper, regenSpeedK,
      aeroDfMult, gearHi, rpmFor,
    };
  }

  // The vTop() a module reads when its G has none (a bare unit VM): one value, not 80 at four sites and 90 at a
  // fifth (#7129, Bryce D3). The live façade always has vTop, so the game never reads it.
  return { create, taperAt, regenSpeedAt, V_FALLBACK: 80 };
})();
Object.freeze(PaceMath);
