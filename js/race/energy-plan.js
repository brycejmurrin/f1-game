/* Apex 26 — ENERGY PLAN (#1580): a manual, per-sector ERS deployment policy
 * for the local player.
 *
 * One policy per timing sector (c._secIdx 0..2):
 *   manual — the player's own BOOST toggle, untouched (the default; a plan of
 *            three MANUALs is exactly today's game);
 *   deploy — BOOST is switched ON as the car enters the sector;
 *   save   — BOOST is switched OFF as the car enters the sector (it harvests).
 *
 * The plan acts ONLY on a sector-entry edge, and only by asking for the same
 * BOOST toggle a press makes (game.js reads `toggleFor` beside
 * Input.consumeBoostToggle). So the player can still press BOOST mid-sector
 * to override, the existing gates (battery, box, caution, pit limiter) still
 * decide whether a wish becomes deploy, and the input ghost records the flip
 * as an ordinary toggle, so a replay never needs the plan. Time trial ignores
 * the plan: a TT lap is the player's own run.
 * Reads no track curvature: the only track input is the timing-sector index.
 * #1629 (ERS forecast) builds on `plan()` / POLICIES.
 */
const EnergyPlan = (function () {
  "use strict";

  const KEY = "ersPlan";
  const POLICIES = Object.freeze(["manual", "deploy", "save"]);
  const NEUTRAL = Object.freeze(["manual", "manual", "manual"]);
  let current = NEUTRAL.slice();
  // Per car: the sector the plan last acted on, so it fires once per entry.
  const seen = new WeakMap();

  /** A clean 3-entry plan, or null when `p` is not one. */
  function clean(p) {
    if (!Array.isArray(p) || p.length !== 3) return null;
    return p.every((v) => POLICIES.includes(v)) ? p.slice() : null;
  }
  function plan() { return current.slice(); }
  function isNeutral(p) { return (p || current).every((v) => v === "manual"); }
  /** Set the plan; an invalid one is refused (returns false) and the old plan stands. */
  function setPlan(p) {
    const c = clean(p);
    if (!c) return false;
    current = c;
    return true;
  }
  function fromStore(store) { if (!store || !setPlan(store.get(KEY, null))) current = NEUTRAL.slice(); return plan(); }

  /** Pure: does policy `pol` want the BOOST toggle flipped on entering a sector? */
  function wantsFlip(pol, boostOn, energy) {
    if (pol === "deploy") return !boostOn && energy > 0;
    if (pol === "save") return !!boostOn;
    return false;
  }

  /** Per step for the local player car: true on the step the plan flips BOOST. */
  function toggleFor(c, tt) {
    if (!c || tt) return false;
    const sec = c._secIdx;
    if (sec == null) return false;
    if (seen.get(c) === sec) return false;
    seen.set(c, sec);
    return wantsFlip(current[sec], !!c.boostOn, c.energy || 0);
  }
  return Object.freeze({ KEY, POLICIES, NEUTRAL, clean, plan, setPlan, fromStore, isNeutral, wantsFlip, toggleFor });
})();
Object.freeze(EnergyPlan);
