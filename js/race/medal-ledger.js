/* MedalLedger — one pure answer to "which tier is this result" (#6961, U4.3 of #6920).
 * Wraps Quali.medalFor / Quali.MEDAL_RANK, read at call time; no G, store or DOM; writes no key.
 * kind: 'tt' | 'daily' (Quali.medalFor) | 'drill' (reserved: null).
 * refs: { pole, target?, assisted? }. The fourth tier is faster than gold: it needs the caller's
 * AI hot-lap time (#6884 A2) as refs.target, value <= target <= pole and !refs.assisted (a non-empty
 * SessionPhys.assists() or a non-standard daily class; the caller derives it). No constant multiplier here. */
"use strict";
var MedalLedger = (function () {
  const FOURTH = "apex";   // PROVISIONAL id: the name belongs to #6884 A2 and Bryce.
  const TIERS = Object.freeze(["bronze", "silver", "gold", FOURTH]);
  function rank(tier) {
    if (tier === FOURTH) return Quali.MEDAL_RANK.gold + 1;
    return Quali.MEDAL_RANK[tier] || 0;
  }
  function tierFor(kind, value, refs) {
    if (kind !== "tt" && kind !== "daily") return null;
    const pole = refs && refs.pole;
    const base = Quali.medalFor(value, pole);
    if (base !== "gold") return base;
    const target = refs.target;
    if (target > 0 && target <= pole && !refs.assisted && value <= target) return FOURTH;
    return base;
  }
  // Keep-the-better (session-records.js finish): the held tier wins ties and wins when it ranks higher.
  function better(held, fresh) { return rank(held) > rank(fresh) ? held : fresh; }
  return Object.freeze({ tierFor, rank, better, TIERS });
})();
Object.freeze(MedalLedger);
