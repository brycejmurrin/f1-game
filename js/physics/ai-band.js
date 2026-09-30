/* Apex 26 — AI rubber band (Melder / Game AI Pro ch.42): dead zone, forward+reverse
   via skill/corner authority — not inert vmax scaling. Pure helpers; game.js applies. */
const AiBand = (function () {
  "use strict";

  const clamp = M4.clamp;

  // Metres either side of the player where the band is inert (Slice 5).
  // Tuned to the ai-band.mjs reporting half-width so the instrument and the
  // runtime agree on "near".
  const DEAD_M = 40;
  const START_GUARD_S = 8;
  // Gap (m) at which |band| saturates to dd.band — same 700 m as the tip scale.
  const SPAN_M = 700;

  const _out = { band: 0, skillMul: 1, vmaxMul: 1 };

  /**
   * @param {object} ctx
   * @param {number} ctx.gap  human.prog − ai.prog (>0 ⇒ AI behind / reverse help)
   * @param {number} ctx.trackTotal
   * @param {number} ctx.raceT
   * @param {number} ctx.launchT0
   * @param {number} ctx.band  DIFF[d].band magnitude (authority; table frozen)
   * @param {number} ctx.tierV
   * @param {number} ctx.skill
   * @param {number} ctx.aiScale  DIFF[d].ai
   * @param {number} ctx.bandCeil  PhysicsConsts.BAND_CEIL
   * @returns {{band:number, skillMul:number, vmaxMul:number}}
   *   `band` is signed (−ahead / +behind), fed to diffCorner as (1+band).
   *   `vmaxMul` is always 1 — vmax scaling retired (Slice 5).
   */
  function apply(ctx) {
    _out.band = 0;
    _out.skillMul = 1;
    _out.vmaxMul = 1;
    if (!ctx) return _out;
    const gap = ctx.gap;
    const total = ctx.trackTotal || 0;
    const half = total * 0.5;
    if (!(half > 0) || !Number.isFinite(gap)) return _out;
    // Start + lapping guards — only ever REMOVE authority (tip contract).
    if ((ctx.raceT - (ctx.launchT0 || 0)) <= START_GUARD_S) return _out;
    if (Math.abs(gap) >= half) return _out;
    // Dead zone around the player.
    if (Math.abs(gap) < DEAD_M) return _out;

    const mag = Math.min(Math.abs(gap) / SPAN_M, 1) * (ctx.band > 0 ? ctx.band : 0);
    if (!(mag > 0)) return _out;

    const behind = gap > 0;
    const signed = behind ? mag : -mag;
    _out.band = signed;

    // Skill lever (primary). Help behind; ease ahead. Cap help at BAND_CEIL so
    // easy×band cannot beat hard's own scale (monotonicity).
    const raw = Math.max(1e-6, (ctx.tierV || 1) * (ctx.skill || 1) * (ctx.aiScale || 1));
    const helpCap = Math.max(0, (ctx.bandCeil || 1) / raw - 1);
    if (behind) {
      _out.skillMul = 1 + Math.min(mag, helpCap);
    } else {
      // Forward: peel a little pace off a car pulling away — never below 1−band.
      _out.skillMul = 1 - Math.min(mag, ctx.band > 0 ? ctx.band : mag);
    }
    _out.vmaxMul = 1;   // retired inert vmax scaling
    return _out;
  }

  function deadM() { return DEAD_M; }
  function startGuardS() { return START_GUARD_S; }
  function spanM() { return SPAN_M; }

  try { Log.info("game", "AiBand ready"); } catch (_) { /* isolated VM */ }
  return { apply, deadM, startGuardS, spanM, DEAD_M, START_GUARD_S, SPAN_M };
})();
Object.freeze(AiBand);
