const CareerAiDev = (function () {
  "use strict";

  const clamp = M4.clamp;

  function scoreMods(mods) {
    if (!mods) return 0;
    return (mods.speed || 1) + (mods.accel || 1) + (mods.cornering || 1) + (mods.braking || 1);
  }

  const ATR_LEAD = 0.75, ATR_LAST = 1.15;
  function atrScale(pos, field) {
    const n = Math.max(2, field | 0);
    return ATR_LEAD + (ATR_LAST - ATR_LEAD) * (clamp(pos, 1, n) - 1) / (n - 1);
  }

  function teamCap(team, career) {
    let works = 0;
    try {
      works = Parts.getCost(Parts.getFactorySetup(team), team);
    } catch (_) { works = 0; }
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

  function fittedOf(career, team) {
    if (!career || !team) return null;
    const bag = career.aiParts && career.aiParts[team.id];
    if (!bag || !bag.fitted || typeof bag.fitted !== "object") return null;
    return bag.fitted;
  }

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
    for (const cat of Object.keys(works)) {
      const id = Parts.ownIdOf(cat, works[cat]);
      if (bag.owned.indexOf(id) < 0) bag.owned.push(id);
    }
    return bag;
  }

  function optionOf(catId, id) {
    const cat = Parts.CATALOG.find((c) => c.id === catId);
    return cat ? cat.options.find((o) => o.id === id) || null : null;
  }

  function pickStep(team, fitted, cap) {
    const baseScore = scoreMods(Parts.getMods(fitted, team));
    let best = null;
    for (const cat of Parts.CATALOG) {
      if (cat.id === "tyres") continue;
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

  function developWinter(career, tStand, expected, rnd, diceYear) {
    if (!career || typeof Parts === "undefined") return;
    const year = diceYear != null ? diceYear : career.year;
    const posOf = new Map((tStand || []).map((r) => [r.id, r.pos]));
    const field = Teams.LIST.filter((t) => Teams.isReal && Teams.isReal(t)).length;
    for (const team of Teams.LIST) {
      if (!Teams.isReal || !Teams.isReal(team)) continue;
      const pos = posOf.get(team.id) || 11;
      const exp = (expected && expected.get(team.id)) || 11;
      const shove = exp - pos;
      const chance = clamp(0.30 + shove * 0.12, 0.12, 0.80) * atrScale(pos, field);
      if (rnd(year, "aidev", team.id) > chance) continue;
      const bag = ensureSeed(career, team);
      const cap = teamCap(team, career);
      const step = pickStep(team, bag.fitted, cap);
      if (!step) continue;
      const prev = bag.fitted[step.cat];
      const prevOpt = prev != null ? optionOf(step.cat, prev) : null;
      if (prevOpt && !Parts.isOptionAvailable(prevOpt, team)) {
        if (!bag.shelved || typeof bag.shelved !== "object") bag.shelved = {};
        if (bag.shelved[step.cat] == null) bag.shelved[step.cat] = prev;
      }
      bag.fitted = step.trial;
      const key = Parts.ownIdOf(step.cat, step.id);
      if (bag.owned.indexOf(key) < 0) bag.owned.push(key);
    }
  }

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
        const wKey = w != null ? Parts.ownIdOf(cat.id, w) : null;
        const scar = wKey != null && bag.owned.indexOf(wKey) < 0;
        if (scar) bag.owned.push(wKey);
        const cur = bag.fitted[cat.id];
        const curLegal = cur == null || legal(optionOf(cat.id, cur));
        if (curLegal && shelf[cat.id] == null && !scar) continue;
        let best = null;
        let bestScore = scoreMods(Parts.getMods(bag.fitted, team)) + (curLegal ? 1e-9 : -1e-9);
        for (const opt of cat.options) {
          if (opt.id === cur || bag.owned.indexOf(Parts.ownId(opt)) < 0 || !legal(opt)) continue;
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

  return { developWinter, fittedOf, teamCap, pickStep, scrubFitted, worksSetup, atrScale, ATR_LEAD, ATR_LAST };
})();
Object.freeze(CareerAiDev);
