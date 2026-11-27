// @ts-check
/* Apex 26 — AI PACE: the AI-only vmax stages of updateCar, as named pure stages (#7258; decision 7244-1 B on #7148).
 *
 * updateCar builds a car's top-speed target (vmax) as a chain of multipliers and caps. The stages a human never
 * takes live here; game.js calls them in its own order, and the shared ones (wind, pit and caution caps, fuel,
 * X-mode) stay in game.js beside the human branch. Each stage keeps the exact float operations and their order, so
 * tests/unit/ai-vmax-stage-trace-vm.test.mjs reads the same bytes as before the move.
 *
 * Order inside updateCar (an AI car):
 *   base     scripted pace: tier × skill × difficulty × the #5330 trim, under the band ceiling (× VMAX × PACE in game.js)
 *   [wind]   game.js, shared
 *   pre      lift for standing water, then the catch-up band (AiBand; writes c._bandNow)
 *   [pit, caution caps]  game.js, shared
 *   stint    the stint's pace phase × the trail push (AiDrive.pacePhase / trailStep)
 *   [pits.think]  game.js: the box decision sits between stint and post on purpose
 *   post     gathering it up after a mistake, then the tyre curve (AiDrive.tyrePace, or the wear model when on)
 *   [fuel, traffic, brake plan, X-mode]  game.js (phase 2 of #7244's plan moves the AI brake-plan caps)
 *
 * Pure: no game state, no G. It reads AiDrive and AiBand at call time. AI-only by contract: no human car reaches a
 * stage here, so nothing derived from curvature or the racing line reaches the player (docs/PHYSICS.md).
 */
const AiPace = (function () {
  "use strict";

  // AiBand catch-up scratch, reused for every car (Double fields: no objects per AI car per tick).
  const _bc = { leadProg: 0.5, carProg: 0.5, trackTotal: 0.5, raceT: 0.5, launchT0: 0.5, bandAuth: 0.5 };
  const _out = { vmax: 0.5, bandNow: 0.5 };

  /**
   * The scripted AI pace factor before VMAX × PACE: car tier × driver skill × difficulty × the #5330 trim, capped.
   * @param {number} tierV @param {number} skill @param {number} ddAi @param {number} tierRef TIER_V[c.tier]
   * @param {number} ceil BAND_CEIL
   */
  function base(tierV, skill, ddAi, tierRef, ceil) {
    return Math.min(ceil, tierV * skill * ddAi * AiDrive.paceTrim(tierRef * skill));
  }

  /**
   * Standing water, then the catch-up band. Writes c._bandNow (0 without a lead human).
   * @param {any} c @param {number} vmax
   * @param {{ safeV: number, vT: number, vmaxK: number, lead: any, total: number, raceT: number, launchT0: number,
   *           dd: { ai: number, band: number }, ceil: number }} P
   */
  function pre(c, vmax, P) {
    if (P.safeV < Infinity) vmax = Math.min(vmax, P.safeV * P.vT / P.vmaxK);   // an AI driver lifts in standing water
    if (P.lead) {
      const bc = _bc; bc.leadProg = P.lead.prog; bc.carProg = c.prog; bc.trackTotal = P.total; bc.raceT = P.raceT; bc.launchT0 = P.launchT0; bc.bandAuth = P.dd.band;
      const applied = AiBand.applyVmax(vmax, AiBand.factor(bc), c.tierV * c.skill * P.dd.ai, P.ceil, _out);
      vmax = applied.vmax; c._bandNow = applied.bandNow;
    } else c._bandNow = 0;
    return vmax;
  }

  /**
   * A stint drifts (pacePhase); lockstep never passes, so a car held behind a slower one pushes (trailStep).
   * @param {any} c @param {number} vmax @param {{ consistency: number }} aiT @param {number} raceT
   * @param {any} ahead the car one place up @param {boolean} open a green race session @param {boolean} street @param {number} dt
   */
  function stint(c, vmax, aiT, raceT, ahead, open, street, dt) {
    return vmax * (AiDrive.pacePhase(raceT, aiT.consistency, c.phaseRoll) * AiDrive.trailStep(c, ahead, open, street, dt));
  }

  /**
   * Gathering it up after a mistake, then the tyre. With TYRE WEAR off the tyre is the AiDrive.tyrePace curve; with
   * it on, the AI's pace comes off the SAME wear model the player drives (the compound offset rides c.tyre.off).
   * @param {any} c @param {number} vmax @param {boolean} wearOn tyres.on() @param {number} trMul the tread's long. share
   */
  function post(c, vmax, wearOn, trMul) {
    if (AiDrive.mistakePhase(c.errT) === 2) vmax *= AiDrive.mistakeGatherMul();
    if (c.tyreClass) {
      vmax *= wearOn ? (1 + (c.tyre ? c.tyre.off : 0)) * trMul
                     : AiDrive.tyrePace(c.tyreClass, Math.max(0, c.lap - 1));   // laps DONE: c.lap counts line crossings (TyreModel lapsDone)
    }
    return vmax;
  }

  return Object.freeze({ base, pre, stint, post });
})();
