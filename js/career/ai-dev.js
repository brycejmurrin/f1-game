/* Apex 26 — AI constructor part development over career winters.
 *
 * Factory presets alone + decaying tdev leave the grid static while the player
 * climbs the catalog (docs/notes/CAREER-CEILING-FIX-2026-09-22.md §1). This
 * module gives each real team a sparse `career.aiParts[teamId]` bag of owned
 * option ids and a fitted setup, advanced ONE legal step per winter when the
 * dice and constructors' form allow it. Era legality is Parts.isOptionAvailable
 * — the same predicate regulations already install for factory resolution.
 *
 * Absent aiParts → callers keep using Parts.getFactorySetup (byte-identical
 * for saves that never rolled a winter under this code).
 */
const CareerAiDev = (function () {
  "use strict";

  const clamp = M4.clamp;

  function scoreMods(mods) {
    if (!mods) return 0;
    return (mods.speed || 1) + (mods.accel || 1) + (mods.cornering || 1) + (mods.braking || 1);
  }

  /** Soft fitted-cost ceiling for an AI team this winter (credits). */
  function teamCap(team, career) {
    const legal = typeof Parts !== "undefined" && Parts.legalityKey ? Parts.legalityKey() : "";
    let works = 0;
    try {
      works = Parts.getCost(Parts.getFactorySetup(team), team);
    } catch (_) { works = 0; }
    // Front-running works cars may spend up toward ~90% of the player budget
    // cap; backmarkers stay nearer their works baseline. Never above budgetCap.
    const playerCap = (typeof Career !== "undefined" && Career.budgetCap)
      ? Career.budgetCap() : (works + 500);
    const tier = team.tier != null ? team.tier : 3;
    const frac = clamp(0.45 + (4 - tier) * 0.11, 0.45, 0.90);
    return Math.max(works, Math.round(Math.min(playerCap, works + (playerCap - works) * frac)));
  }

  function bagOf(career, teamId) {
    if (!career.aiParts || typeof career.aiParts !== "object") career.aiParts = {};
    let bag = career.aiParts[teamId];
    if (!bag || typeof bag !== "object") {
      bag = { owned: [], fitted: null };
      career.aiParts[teamId] = bag;
    }
    if (!Array.isArray(bag.owned)) bag.owned = [];
    return bag;
  }

  /** Current fitted setup object for a team, or null → use factory. */
  function fittedOf(career, team) {
    if (!career || !team) return null;
    const bag = career.aiParts && career.aiParts[team.id];
    if (!bag || !bag.fitted || typeof bag.fitted !== "object") return null;
    return bag.fitted;
  }

  /** The team's WORKS build read outside any era, as acceptOffer() does for the
   *  player (career.js): under a ban getFactorySetup() resolves a banned works
   *  part to its fallback, and seeding that into the bag lost the engine or
   *  floor for good. The installed ruleset is put back exactly. */
  function worksSetup(team) {
    const key = Parts.legalityKey ? Parts.legalityKey() : "";
    if (!key || !Parts.legality) return Parts.getFactorySetup(team);
    const fn = Parts.legality();
    Parts.setLegality(null, "");
    try { return Parts.getFactorySetup(team); } finally { Parts.setLegality(fn, key); }
  }

  function ensureSeed(career, team) {
    const bag = bagOf(career, team.id);
    if (bag.fitted) return bag;
    const works = worksSetup(team);
    bag.fitted = Object.assign({}, works);
    for (const id of Object.values(works)) {
      if (bag.owned.indexOf(id) < 0) bag.owned.push(id);
    }
    return bag;
  }

  function optionOf(catId, id) {
    const cat = Parts.CATALOG.find((c) => c.id === catId);
    return cat ? cat.options.find((o) => o.id === id) || null : null;
  }

  /** One catalog step that raises summed mods and stays under `cap`. */
  function pickStep(team, fitted, cap) {
    const baseScore = scoreMods(Parts.getMods(fitted, team));
    let best = null;
    for (const cat of Parts.CATALOG) {
      for (const opt of cat.options) {
        if (!(opt.cost > 0)) continue;
        if (!Parts.isOptionAvailable(opt, team)) continue;
        if (fitted[cat.id] === opt.id) continue;
        const trial = Object.assign({}, fitted, { [cat.id]: opt.id });
        const cost = Parts.getCost(trial, team);
        if (cost > cap) continue;
        const gain = scoreMods(Parts.getMods(trial, team)) - baseScore;
        if (gain <= 1e-9) continue;
        if (!best || gain > best.gain + 1e-9
            || (Math.abs(gain - best.gain) <= 1e-9 && (opt.cost || 0) < best.optCost)) {
          best = { cat: cat.id, id: opt.id, trial, gain, optCost: opt.cost || 0 };
        }
      }
    }
    return best;
  }

  /**
   * Winter development pass. Mutates `career.aiParts`. `rnd(…parts)` is
   * Career.rnd. `tStand` is constructors' standings from rollover.
   * `expected` is Map teamId → expected position (Career.expectedConstructor).
   * `diceYear`, when passed, is the season that just ended — rollover
   * increments career.year before this runs, and the stream must not move.
   */
  function developWinter(career, tStand, expected, rnd, diceYear) {
    if (!career || typeof Parts === "undefined") return;
    const year = diceYear != null ? diceYear : career.year;
    const posOf = new Map((tStand || []).map((r) => [r.id, r.pos]));
    for (const team of Teams.LIST) {
      if (!Teams.isReal || !Teams.isReal(team)) continue;
      const pos = posOf.get(team.id) || 11;
      const exp = (expected && expected.get(team.id)) || 11;
      // Over-performance raises the chance; backmarkers still get a floor so
      // the field does not freeze on the factory shelf.
      const shove = exp - pos;
      const chance = clamp(0.30 + shove * 0.12, 0.12, 0.80);
      if (rnd(year, "aidev", team.id) > chance) continue;
      const bag = ensureSeed(career, team);
      const cap = teamCap(team, career);
      const step = pickStep(team, bag.fitted, cap);
      if (!step) continue;
      // A step that replaces a part the era outlaws SHELVES it: the bag still
      // owns it, and scrubFitted() puts it back once it is legal again.
      const prev = bag.fitted[step.cat];
      const prevOpt = prev != null ? optionOf(step.cat, prev) : null;
      if (prevOpt && !Parts.isOptionAvailable(prevOpt, team)) {
        if (!bag.shelved || typeof bag.shelved !== "object") bag.shelved = {};
        if (bag.shelved[step.cat] == null) bag.shelved[step.cat] = prev;
      }
      bag.fitted = step.trial;
      if (bag.owned.indexOf(step.id) < 0) bag.owned.push(step.id);
    }
  }

  /** Run after every applyRegs() at rollover. It never fits the ERA-RESOLVED
   *  factory row and never drops a part from `owned`: the old scrub did both,
   *  so a banned works engine or floor became the DEFAULT for the rest of the
   *  career. Race-time resolution (Career.aiSetup → fittedOf →
   *  Parts.resolveSetup → _resolve) already enforces the era every race, so a
   *  banned id may stay fitted. Per category it touches only three cases:
   *  the fitted id is banned, a banned id was shelved there, or a works id is
   *  missing from `owned` (a pre-fix save's scar; seeding owns every works id).
   *  Each fits the best-scoring LEGAL part the bag owns there when that beats
   *  what is fitted, shelving a banned id it displaces — so the works part
   *  returns the winter its era lapses. No ban, no shelf: a no-op. */
  function scrubFitted(career) {
    if (!career || !career.aiParts || typeof Parts === "undefined") return;
    for (const team of Teams.LIST) {
      if (!Teams.isReal || !Teams.isReal(team)) continue;
      const bag = career.aiParts[team.id];
      if (!bag || !bag.fitted || typeof bag.fitted !== "object") continue;
      if (!Array.isArray(bag.owned)) bag.owned = [];
      const shelf = bag.shelved && typeof bag.shelved === "object" ? bag.shelved : {};
      const works = worksSetup(team);
      const legal = (o) => !!o && Parts.isOptionAvailable(o, team);
      for (const cat of Parts.CATALOG) {
        const w = works[cat.id];
        const scar = w != null && bag.owned.indexOf(w) < 0;
        if (scar) bag.owned.push(w);
        const cur = bag.fitted[cat.id];
        const curLegal = cur == null || legal(optionOf(cat.id, cur));
        if (curLegal && shelf[cat.id] == null && !scar) continue;
        let best = null;
        let bestScore = scoreMods(Parts.getMods(bag.fitted, team)) + (curLegal ? 1e-9 : -1e-9);
        for (const opt of cat.options) {
          if (opt.id === cur || bag.owned.indexOf(opt.id) < 0 || !legal(opt)) continue;
          const trial = Object.assign({}, bag.fitted, { [cat.id]: opt.id });
          const sc = scoreMods(Parts.getMods(trial, team));
          if (sc > bestScore) { best = trial; bestScore = sc; }
        }
        if (best) {
          if (!curLegal && shelf[cat.id] == null) shelf[cat.id] = cur;
          bag.fitted = best;
        }
        if (shelf[cat.id] != null && legal(optionOf(cat.id, shelf[cat.id]))) delete shelf[cat.id];
      }
      if (Object.keys(shelf).length) bag.shelved = shelf; else delete bag.shelved;
    }
  }

  return { developWinter, fittedOf, teamCap, pickStep, scoreMods, scrubFitted, worksSetup };
})();
Object.freeze(CareerAiDev);
