/* Apex 26 — DAMAGE → HANDLING (#1578): the ONE setting-gated read of the
 * Damage readout (js/race/damage.js) that reaches the driving model.
 *
 * OFF (the shipped default) forCar() returns null and PlayerForces multiplies
 * nothing: the physics is byte-identical to a build without this file. ON, the
 * LOCAL human car's damage scales its handling:
 *   - a broken front wing (fwL/fwR, averaged) costs the FRONT axle up to
 *     FW_AERO of its share of the aero-load term (DOWNFORCE · aeroDf · q²);
 *   - a broken rear wing (rw) costs the REAR axle up to RW_AERO of its share;
 *   - floor damage costs both axles up to FLOOR_AERO;
 *   - a suspension knock costs both axles KNOCK_GRIP of their mechanical grip.
 * Aero load scales with speed², so a broken wing is felt in fast corners and
 * barely at a hairpin, which is how a real one feels. A completed pit stop
 * repairs it: Damage.observe resets the record on the pit-out edge, so the
 * factors are back to 1 the step after.
 *
 * Scope: the local car only. AI cars keep the readout-only contract, and in a
 * VS FRIEND race each screen applies its own setting to its own car (the
 * room's settings do not carry it; see the PR for #1578).
 * Never reads track curvature or the racing line: inputs are the damage record.
 */
var DamageHandling = (function () {
  "use strict";

  const KEY = "damageHandling";
  const FW_AERO = 0.6;      // fully broken front wing: −60 % of the front axle's aero load
  const RW_AERO = 0.6;      // fully broken rear wing: −60 % of the rear axle's aero load
  const FLOOR_AERO = 0.3;   // fully damaged floor: −30 % of both axles' aero load
  const KNOCK_GRIP = 0.05;  // a knocked suspension: −5 % mechanical grip on both axles

  // The session stub (js/race/session-stub.js) may already hold the stored choice: adopt it.
  let enabled = typeof DamageHandling !== "undefined" && !!DamageHandling && DamageHandling._stub === true && DamageHandling.isEnabled();
  // One pooled result: PlayerForces reads it synchronously inside step() and keeps nothing.
  const out = { aeroF: 1, aeroR: 1, grip: 1, axF: 1, axR: 1 };

  const clamp01 = (v) => (v > 0 ? (v < 1 ? v : 1) : 0);

  /** Pure: the handling factors for a damage record (Damage.get / Damage.state shape). */
  function factors(r, o) {
    o = o || { aeroF: 1, aeroR: 1, grip: 1 };
    const fw = (clamp01(r && r.fwL) + clamp01(r && r.fwR)) / 2, rw = clamp01(r && r.rw), floor = clamp01(r && r.floor);
    o.aeroF = Math.max(0, 1 - FW_AERO * fw - FLOOR_AERO * floor);
    o.aeroR = Math.max(0, 1 - RW_AERO * rw - FLOOR_AERO * floor);
    o.grip = r && r.knock ? 1 - KNOCK_GRIP : 1;
    return o;
  }

  /** The factors PlayerForces applies to car `c` this step, or null (= no effect). */
  function forCar(c) {
    if (!enabled || !c || !c.local || typeof Damage === "undefined") return null;
    return factors(Damage.get(c), out);
  }

  /** Applied per-axle grip ratios of the last step (physState telemetry); 1 with the option OFF. */
  const none = { f: 1, r: 1 }, applied = { f: 1, r: 1 };
  function axles() {
    if (!enabled) return none;
    applied.f = out.axF; applied.r = out.axR;
    return applied;
  }

  function setEnabled(on) { enabled = on === true; if (!enabled) { out.axF = 1; out.axR = 1; } }
  function isEnabled() { return enabled; }
  /** Boot / settings refresh: the stored choice (default OFF). */
  function fromStore(store) { setEnabled(!!store && store.get(KEY, false) === true); return enabled; }

  return Object.freeze({ KEY, FW_AERO, RW_AERO, FLOOR_AERO, KNOCK_GRIP, factors, forCar, axles, setEnabled, isEnabled, fromStore });
})();
Object.freeze(DamageHandling);
