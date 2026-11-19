const AiStrategy = (function () {
  "use strict";

  const clamp = M4.clamp;
  let traitsOf = function (_c) {
    return {
      craft: 0.75, awareness: 0.75, experience: 0.75, skill: 0.97, consistency: 0.75,
      aggression: 0, optimism: 0, composure: 0, ersBias: 0,
    };
  };
  function bindTraits(fn) { traitsOf = fn; }

  const TYRE = {
    soft:   { off: 0.004,  deg: 0.0012 },
    medium: { off: 0,      deg: 0.0007 },
    hard:   { off: -0.004, deg: 0.0004 },
  };
  function tyreClass(roll, laps) {
    const r = roll || 0;
    if (laps <= 5) return r < 0.7 ? "soft" : "medium";
    if (laps <= 15) return r < 0.4 ? "soft" : r < 0.8 ? "medium" : "hard";
    return r < 0.25 ? "soft" : r < 0.7 ? "medium" : "hard";
  }
  function tyrePace(cls, lapsDone) {
    const t = TYRE[cls] || TYRE.medium;
    return 1 + t.off - Math.min(t.deg * Math.max(lapsDone || 0, 0), 0.025);
  }

  const FUEL_WEAR = 0.22;
  const PIT_LOSS_FALLBACK = 0.18;
  const DEG_LIN = 0.05;
  const DEG_CLIFF = 0.50;
  const GRIP_TO_LAP = 0.55;
  const TASTE_BIAS = 0.8;
  const TASTE_SOFTEN = 0.010;
  const MIN_STINT = 2;
  const ONE_SET_LAPS = 5;
  function degCost(n, life) {
      const L = Math.max(0.5, Number.isFinite(life) ? life : 0.5);
      const nn = Number.isFinite(n) ? n : 0;
      const over = Math.max(0, nn - L);
      const inLife = Math.min(nn, L);
    const mean = DEG_LIN * (inLife / (2 * L)) * inLife + DEG_LIN * over + DEG_CLIFF * (over * over) / (2 * L);
    return mean * GRIP_TO_LAP;
  }

  function splitStints(laps, lives, fuelWear) {
    const share = (v) => {
      const total = v.reduce((a, x) => a + x, 0) || 1;
      const out = v.map((x) => Math.max(1, Math.round(laps * x / total)));
      let drift = out.reduce((a, x) => a + x, 0) - laps;
      for (let i = out.length - 1; i >= 0 && drift > 0; i--) {
        const take = Math.min(drift, out[i] - 1);
        out[i] -= take; drift -= take;
      }
      if (drift < 0) out[out.length - 1] -= drift;
      return out;
    };
    let out = share(lives);
    if (fuelWear > 0 && lives.length > 1) {
      for (let pass = 0; pass < 3; pass++) {
        let done = 0;
        const eff = lives.map((v, i) => {
          const fuel = 1 - (done + out[i] / 2) / laps;
          done += out[i];
          return Math.max(0.5, v / (1 + fuelWear * fuel));
        });
        out = share(eff);
      }
    }
    return out;
  }

  const MAX_STOPS = 2;
  const CLASSES = ["soft", "medium", "hard"];
  function stintPlan(ctx) {
    const laps = Math.max(1, Math.round(ctx.laps || 1));
    const lifeLaps = ctx.lifeLaps || ((cls) => (TYRE[cls] ? laps * 0.7 : laps));
    const pitLossLaps = ctx.pitLossLaps != null ? ctx.pitLossLaps : PIT_LOSS_FALLBACK;
    const roll = clamp(ctx.roll || 0, 0, 1);
    const bias = (roll - 0.5) * TASTE_BIAS * pitLossLaps;
    const soften = (roll - 0.5) * TASTE_SOFTEN;
    const taste = { soft: soften, medium: 0, hard: -soften };
    let pinStops = ctx.stops != null && ctx.stops >= 0 ? Math.min(MAX_STOPS, ctx.stops | 0, Math.max(0, laps - 1)) : null;
    let pinStart = ctx.start && TYRE[ctx.start] ? ctx.start : null;
    let twoCompound = !!ctx.twoCompound;
    const used = ctx.used || [];
    let best = null;
    const walk = (seq) => {
      const stops = seq.length - 1;
      if (pinStops != null && stops !== pinStops) return;
      if (twoCompound && new Set(used.concat(seq)).size < 2) return;
      if (pinStart && seq[0] !== pinStart) return;
      if (stops > 0 && laps <= ONE_SET_LAPS && pinStops == null && !pinStart && !(ctx.firstLife > 0)) return;
      const lives = seq.map((cls, i) => (i === 0 && ctx.firstLife > 0 ? ctx.firstLife : lifeLaps(cls)));
      const stints = splitStints(laps, lives, FUEL_WEAR);
      let cost = stops * pitLossLaps + stops * bias;
      let done = 0;
      for (let i = 0; i < seq.length; i++) {
        const t = TYRE[seq[i]] || TYRE.medium;
        const fuel = 1 - (done + stints[i] / 2) / laps;
        cost += -(t.off + (taste[seq[i]] || 0)) * stints[i]
              + degCost(stints[i], lives[i] / (1 + FUEL_WEAR * fuel));
        done += stints[i];
      }
      if (!best || cost < best.cost) best = { cost, seq: seq.slice(), stints: stints.slice(), stops, lives: lives.slice() };
    };
    const rec = (seq) => {
      walk(seq);
      if (seq.length > MAX_STOPS) return;
      for (const cls of CLASSES) rec(seq.concat(cls));
    };
    for (const cls of CLASSES) rec([cls]);
    if (!best && pinStart) { pinStart = null; for (const cls of CLASSES) rec([cls]); }
    if (!best && twoCompound && pinStops === 0 && laps > 1) { pinStops = 1; for (const cls of CLASSES) rec([cls]); }
    if (!best && twoCompound) { twoCompound = false; for (const cls of CLASSES) rec([cls]); }
    const shift = clamp(Math.round((roll - 0.5) * 3), -1, 1);
    const lapsAt = [];
    const stints = best.stints.slice();
    let acc = 0, prev = 0;
    const effLife = (i, from, len) => best.lives[i] / (1 + FUEL_WEAR * (1 - (from + len / 2) / laps));
    const minStint = Math.max(1, Math.min(MIN_STINT, Math.floor(laps / Math.max(1, stints.length))));
    for (let i = 0; i < stints.length - 1; i++) {
      acc += best.stints[i];
      const to = acc + shift, last = i + 1 === stints.length - 1;
      const nextEnd = last ? laps : acc + best.stints[i + 1];
      const over = (shift > 0 && to - prev > effLife(i, prev, to - prev))
        || (shift < 0 && nextEnd - to > effLife(i + 1, to, nextEnd - to));
      const at = clamp(over ? acc : to, prev + minStint, laps - minStint * (stints.length - 1 - i));
      lapsAt.push(at); stints[i] = at - prev; prev = at;
    }
    if (stints.length) stints[stints.length - 1] = laps - prev;
    return { start: best.seq[0], seq: best.seq, stints, stops: best.stops, lapsAt, cost: best.cost };
  }

  function compoundFor(lapsLeft, lifeLaps) {
    const need = Math.max(1, lapsLeft);
    for (const cls of CLASSES) if (lifeLaps(cls) >= need) return cls;
    return CLASSES[CLASSES.length - 1];
  }

  const CAUTION_REACH = 6;
  const UNDERCUT_REACH = 2;
  const UNDERCUT_LAPS = 1;
  const UNDERCUT_MIN_WEAR = 0.4;
  const STUCK_GAP_S = 1.0;
  const COVER_GAP_S = 2.0;
  const STUCK_LAPS = 1;
  const REPLAN_GAP = 4;
  const TEMPER = { REACT_MIN: 0.75, ATTACK_MIN: 0.85, GAMBLE_W: 0.8 };
  function strategyTemper(c) {
    const t = traitsOf(c);
    return { react: 0.6 * t.experience + 0.4 * t.awareness, attack: t.craft, gamble: 1 - t.experience };
  }
  function tasteRoll(roll, c) {
    return clamp(0.5 + (roll - 0.5) * (1 + TEMPER.GAMBLE_W * strategyTemper(c).gamble), 0, 1);
  }
  function wornPays(ctx) {
    if (ctx.lapsLeft == null) return true;
    const over = Math.max(0.1, (ctx.wear || 0) - 1);
    const gainPerLap = (DEG_LIN + DEG_CLIFF * over) * GRIP_TO_LAP;
    const payback = (ctx.pitLossLaps > 0 ? ctx.pitLossLaps : PIT_LOSS_FALLBACK) / Math.max(1e-3, gainPerLap);
    return ctx.lapsLeft >= payback;
  }
  function pitNow(ctx) {
    if (!ctx) return "";
    if (ctx.wrongTread) return "weather";
    if (ctx.scripted) return ctx.stopsLeft > 0 && ctx.lapsToStop <= 0 ? "plan" : "";
    if (ctx.wear >= 1 && wornPays(ctx)) return "worn";
    if (ctx.stopsLeft <= 0) return "";
    if (ctx.cautionLevel >= 2 && ctx.cautionLevel < 4 && ctx.fits !== false && ctx.lapsToStop <= CAUTION_REACH) return "caution";
    if (!ctx.rivalUsed && ctx.fits !== false && ctx.lapsToStop <= UNDERCUT_REACH && (ctx.wear || 0) >= UNDERCUT_MIN_WEAR) {
      if (ctx.rivalBehindBoxed && (ctx.react || 0) >= TEMPER.REACT_MIN) return "cover";
      if (ctx.stuckBehind && ctx.lapsToStop <= UNDERCUT_LAPS && (ctx.attack || 0) >= TEMPER.ATTACK_MIN) return "undercut";
    }
    if (ctx.lapsToStop <= 0) return "plan";
    return "";
  }
  return {
    bindTraits,
    tyreClass, tyrePace, degCost, splitStints, stintPlan, compoundFor, strategyTemper, tasteRoll, wornPays, pitNow,
    STRAT: { MAX_STOPS, CLASSES, CAUTION_REACH, UNDERCUT_REACH, UNDERCUT_LAPS, UNDERCUT_MIN_WEAR, STUCK_GAP_S, STUCK_LAPS, COVER_GAP_S, REPLAN_GAP, TEMPER, DEG_LIN, DEG_CLIFF, GRIP_TO_LAP, FUEL_WEAR, PIT_LOSS_FALLBACK, TASTE_BIAS, TASTE_SOFTEN, MIN_STINT, ONE_SET_LAPS },
  };
})();
Object.freeze(AiStrategy);
