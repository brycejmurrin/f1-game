/* Apex 26 — AI STRATEGY: tyre-wear pace and the stint planner.
 * Moved out of AiDrive as one pure seam. AiDrive re-exports the same names,
 * so game.js and pit-lane.js keep calling AiDrive.*. traits() stays on AiDrive
 * (reused scratch); bindTraits runs on the first AiDrive call, not at eval. */
const AiStrategy = (function () {
  "use strict";

  const clamp = M4.clamp;
  // Unbound fallback matches AiDrive.traits({}) so a missed bind cannot invent a third grid.
  let traitsOf = function (_c) {
    return {
      craft: 0.75, awareness: 0.75, experience: 0.75, skill: 0.97, consistency: 0.75,
      aggression: 0, optimism: 0,
    };
  };
  function bindTraits(fn) { traitsOf = fn; }

  // TYRES AS STRATEGY — the TYRE-WEAR-OFF pace curve (game.js: with wear on, the
  // tyre model and the pit plan below own pace). The compound IS the strategy,
  // so the field must not run one. Each AI car
  // starts a race on a class drawn for the distance (sprints on softs, long
  // races mixed): a soft is up on pace and fades, a hard is down and lasts,
  // so soft-starters and hard-starters cross over mid-race — real F1 2026 deg
  // is ~0.07 s a lap per lap of age (0.08 % of a 90 s lap) with the compounds
  // ~0.4 s apart on a fresh set; de Groote's overtaking study found strategy
  // diversity the largest lever a race controls. Zero-mean across a mixed field
  // by construction, so the AI's pace against the player is unchanged on
  // average; the player's own compound stays the static garage choice.
  // Fresh: soft +0.4 %, hard -0.4 %; deg 0.12 / 0.07 / 0.04 % a lap, capped at
  // 2.5 %. Soft and hard cross at lap 10 — inside the 10- and 25-lap races
  // hards are drawn for.
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

  // ── STRATEGY ───────────────────────────────────────────────────────────────
  // What the field does about a worn tyre once TYRE WEAR is on. With it OFF the
  // TYRE table above is the whole model and none of this runs.
  //
  // THE MODEL IS THE ONE STRATEGISTS ACTUALLY USE, shrunk to fit:
  //
  //   T = SUM over stints [ laps_i x (paceOffset(cls_i) + degCost(laps_i, life_i)) ]
  //       + stops x pitLossLaps
  //
  // — the formulation a 2026 MILP solves with 25 integers and 15 binaries
  // (docs/research/TYRE-STRATEGY-DESIGN.md §2.8). We do not need a solver: with
  // three compounds and at most two stops there are 39 candidate plans, and they
  // are enumerated once per car at the green light.
  //
  // EVERY COST IS IN LAP-TIME FRACTIONS so they add. `degCost` is the average
  // grip lost over a stint of `n` laps on a compound whose life is `life` laps:
  // linear wear makes that the area under the drop line, n/(2*life) of the full
  // drop, and anything past `life` is charged at the cliff rate — which is what
  // makes over-running a set the thing the planner avoids rather than a rounding
  // error. `pitLossLaps` is the stop's cost expressed the same way.
  // A FULL TANK EATS TYRES, and this is what makes strategies MIX. Without it
  // the cost is separable and the taste is constant, so the best compound for
  // the first stint is the best for the last one and every plan comes out
  // soft/soft/soft — which is not what anyone who watches the sport expects to
  // see. A heavy car works its tyres harder, so a stint's effective life falls
  // with the fuel still aboard, and the planner reaches for harder rubber early
  // and softer late. That is the real pattern, arrived at from the real cause.
  const FUEL_WEAR = 0.22;    // life lost at a full tank, as a fraction
  /* WHAT A STOP COSTS, when the caller has not measured it — ONE number, shared
     by stintPlan and wornPays() so "is it worth stopping" and "when should I
     stop" cannot answer the same question differently. js/race/pit-lane.js derives the real
     value (loss / lapRefS, clamped) and passes it; this is only for a caller
     that has none yet, and 0.18 is the planner's own long-standing figure. */
  const PIT_LOSS_FALLBACK = 0.18;
  const DEG_LIN = 0.05;      // lateral grip lost across a full stint (TyreModel.DROP_LIN)
  const DEG_CLIFF = 0.50;    // ...and per unit of wear past it (TyreModel.DROP_CLIFF)
  const GRIP_TO_LAP = 0.55;  // a fraction of grip is worth this much of a lap — sub-linear
  // THE STRATEGY TASTE (stintPlan): how far one driver's roll moves the plan.
  // At 0.66 / 0.006 a race split into two plans; the field needs a spread.
  const TASTE_BIAS = 0.8;      // x pitLossLaps: +/- 0.4 of a stop's cost (1.0 planned a lap-1 stop in a 5-lap race)
  const TASTE_SOFTEN = 0.010;  // grip-per-lap preference for softer rubber
  // A stop leaves at least MIN_STINT laps either side (a lap-1 stop is not a
  // strategy), and a race of ONE_SET_LAPS or fewer is run on one set: the
  // tyre model's MIN_LIFE_LAPS floor exists so that it can be.
  const MIN_STINT = 2;
  const ONE_SET_LAPS = 5;
  function degCost(n, life) {
    const L = Math.max(0.5, life);
    const over = Math.max(0, n - L);
    const inLife = Math.min(n, L);
    // The drop summed over the stint, as TyreModel.gripFor charges it: the
    // linear slope inside the life, then EVERY lap past it carries the full
    // DEG_LIN plus the cliff. Leaving out that DEG_LIN·over priced a 50 %
    // overrun ~29 % light, and the planner ran sets long for it.
    const mean = DEG_LIN * (inLife / (2 * L)) * inLife + DEG_LIN * over + DEG_CLIFF * (over * over) / (2 * L);
    return mean * GRIP_TO_LAP;
  }

  // Split `laps` into `k` stints in proportion to the compounds' lives, so the
  // marginal degradation at each stop is roughly equal — the classic result for
  // linear deg, and the reason real stint lengths come out similar.
  // `fuelWear`, when given, makes the split FUEL-AWARE. Without it the split
  // divided the race by the compounds' RAW lives while `degCost` priced every
  // stint against a fuel-ADJUSTED one — so the cost knew a full tank eats tyres
  // and the stint lengths could not answer. That is the mechanism the comment
  // above claims makes plans MIX ("harder rubber early and softer late"), and
  // it could not act: with the split fixed, a hard first stint could not take
  // the longer share its durability earns while the car is heavy.
  //
  // The dependency is circular — the fuel aboard a stint depends on where the
  // stint falls, which depends on the split — so it is solved by iterating. It
  // converges in two passes at these sizes; three is cheap and leaves margin.
  function splitStints(laps, lives, fuelWear) {
    const share = (v) => {
      const total = v.reduce((a, x) => a + x, 0) || 1;
      const out = v.map((x) => Math.max(1, Math.round(laps * x / total)));
      let drift = out.reduce((a, x) => a + x, 0) - laps;
      // Over-allocated: shave stints down to their 1-lap floor, last first.
      for (let i = out.length - 1; i >= 0 && drift > 0; i--) {
        const take = Math.min(drift, out[i] - 1);
        out[i] -= take; drift -= take;
      }
      // Under-allocated: the floor never limits a stint that GROWS, so the
      // last stint takes the shortfall (the 1-lap cap left [1,1,1] of 4 laps
      // summing to 3 and the plan finished a lap early).
      if (drift < 0) out[out.length - 1] -= drift;
      return out;
    };
    let out = share(lives);
    if (fuelWear > 0 && lives.length > 1) {
      for (let pass = 0; pass < 3; pass++) {
        let done = 0;
        const eff = lives.map((v, i) => {
          const fuel = 1 - (done + out[i] / 2) / laps;   // mean fuel across THIS stint
          done += out[i];
          // DIVIDED, matching stintPlan's cost below and the sim itself: fuel
          // multiplies tyre LOAD by (1 + FUEL_LOAD·fuel), so the life a set has
          // is v / (1 + fuelWear·fuel). This function only needs the RATIO
          // between stints, but the two forms weight that ratio differently,
          // so the form has to match or the lap numbers drift from the cost.
          return Math.max(0.5, v / (1 + fuelWear * fuel));
        });
        out = share(eff);
      }
    }
    return out;
  }

  // Enumerate 0-, 1- and 2-stop plans over the three classes and keep the best.
  // `roll` is the car's own deterministic draw and does two jobs: it breaks ties
  // so the field does not converge on one plan, and it biases the taste — real
  // strategy diversity is the largest lever a race controls over how much
  // overtaking happens, which is the same argument the TYRE table above makes.
  const MAX_STOPS = 2;
  const CLASSES = ["soft", "medium", "hard"];
  function stintPlan(ctx) {
    const laps = Math.max(1, Math.round(ctx.laps || 1));
    const lifeLaps = ctx.lifeLaps || ((cls) => (TYRE[cls] ? laps * 0.7 : laps));
    const pitLossLaps = ctx.pitLossLaps != null ? ctx.pitLossLaps : PIT_LOSS_FALLBACK;
    const roll = clamp(ctx.roll || 0, 0, 1);
    // TWO tastes, because one is not enough to spread a field. Biasing only the
    // STOP COUNT moves the stop/no-stop boundary and leaves every car choosing
    // the same rubber, which measured as a 20-car field on one plan — the
    // procession the TYRE table above exists to avoid.
    //
    //   `bias`   — a taste for stopping, +/- 0.4 of a stop's cost. A
    //              cautious driver stops early and often, an aggressive one
    //              runs the set long.
    //   `soften` — a taste for grip over durability, worth up to about half a
    //              compound step per lap. A low roll shops for hards, a high
    //              one for softs, and the field arrives at the first stop on
    //              different tyres.
    const bias = (roll - 0.5) * TASTE_BIAS * pitLossLaps;
    const soften = (roll - 0.5) * TASTE_SOFTEN;
    const taste = { soft: soften, medium: 0, hard: -soften };
    // THE PINS, for the PLAYER's reference plan (js/race/pit-lane.js): `stops`
    // holds the stop count the STRATEGY row chose, `start` the compound
    // already on the car when a plan is re-cut mid-race, and `firstLife` the
    // laps that set has left — the first stint is run on what is on the car,
    // not on a fresh set's life. An AI passes none of them.
    // …and never more stops than the race has laps to hold one on (laps - 1:
    // no stop on the last). The pin is stored per circuit, not per distance, so
    // a 2-stop pin met a 2-lap sprint leg and made a zero-length stint: "BOX L0".
    let pinStops = ctx.stops != null && ctx.stops >= 0 ? Math.min(MAX_STOPS, ctx.stops | 0, Math.max(0, laps - 1)) : null;
    let pinStart = ctx.start && TYRE[ctx.start] ? ctx.start : null;
    // TWO DRY SPECIFICATIONS (FIA Sporting Regulations B6.3.6): a dry race
    // must use at least two different compounds. `used` is what a mid-race
    // re-cut has already run; a plan that ends on one compound is refused.
    let twoCompound = !!ctx.twoCompound;
    const used = ctx.used || [];
    let best = null;
    const walk = (seq) => {
      const stops = seq.length - 1;
      if (pinStops != null && stops !== pinStops) return;
      if (twoCompound && new Set(used.concat(seq)).size < 2) return;
      if (pinStart && seq[0] !== pinStart) return;
      // No pin, no set already on the car: a sprint this short plans no stop
      // (measured: 2 low rolls of 21 planned hard-hard with a stop after lap 1).
      if (stops > 0 && laps <= ONE_SET_LAPS && pinStops == null && !pinStart && !(ctx.firstLife > 0)) return;
      const lives = seq.map((cls, i) => (i === 0 && ctx.firstLife > 0 ? ctx.firstLife : lifeLaps(cls)));
      const stints = splitStints(laps, lives, FUEL_WEAR);
      let cost = stops * pitLossLaps + stops * bias;
      let done = 0;
      for (let i = 0; i < seq.length; i++) {
        const t = TYRE[seq[i]] || TYRE.medium;
        // Mean fuel aboard across THIS stint, 1 on the grid to 0 at the flag.
        const fuel = 1 - (done + stints[i] / 2) / laps;
        cost += -(t.off + (taste[seq[i]] || 0)) * stints[i]
              // DIVIDED, NOT SUBTRACTED. The sim raises tyre LOAD by
              // (1 + FUEL_LOAD·fuel) — js/physics/tyre-model.js fuelLoadMul,
              // applied to the load that drives wear — so the life a set
              // actually has is life / (1 + 0.22·fuel). The first-order
              // life × (1 − 0.22·fuel) is short by 4.84% at a full tank (0.7800
              // against 0.8197), 2.72% at three-quarters, 1.21% at half.
              // Measured over 1620 plans against it (with the matching form in
              // splitStints above): 381 plans move, the first stint runs LONGER
              // in 326 and shorter in 46, and the stop COUNT is a wash.
              // Same constant on both sides; now the same FORM.
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
    // A start pinned to a compound the planner does not enumerate (a wet on a
    // drying track) matches no sequence: plan from the classes instead.
    if (!best && pinStart) { pinStart = null; for (const cls of CLASSES) rec([cls]); }
    // A pinned NO STOP cannot satisfy the rule, and a plan that drops it is a
    // DSQ at the flag (endRace, SportingRegs.applyCompoundRule): the rule wins
    // and the pin rises to the one stop it needs. Only a race too short to
    // hold a stop at all plans on one set.
    if (!best && twoCompound && pinStops === 0 && laps > 1) { pinStops = 1; for (const cls of CLASSES) rec([cls]); }
    if (!best && twoCompound) { twoCompound = false; for (const cls of CLASSES) rec([cls]); }
    // Stop laps are the running totals of the stint lengths — STAGGERED by the
    // roll, a lap either way in thirds of the field. Without it a field on one
    // plan stopped on ONE lap: 22 cars into a twelve-box lane at once (Bahrain,
    // measured — five cars over a minute in the lane, every exit crawling
    // behind the next box's stop). A lap off the optimum costs the planner's
    // own curve almost nothing; the stints are re-cut to match.
    const shift = clamp(Math.round((roll - 0.5) * 3), -1, 1);
    const lapsAt = [];
    const stints = best.stints.slice();
    let acc = 0, prev = 0;
    // …but never past a set's life IN EITHER DIRECTION. At a severe circuit the
    // lives are short and the optimum already sits on the cliff. A +1 shift ran
    // a third of the field a lap past it (Austria, 10 laps, measured: 8 of 21
    // cars over 100 % wear before their stop); and a -1 shift is not "always
    // safe" — it lengthens the NEXT stint, and the early third finished on
    // 1.17-1.25 wear. A shift stands only while the stint it lengthens fits.
    const effLife = (i, from, len) => best.lives[i] / (1 + FUEL_WEAR * (1 - (from + len / 2) / laps));
    const minStint = Math.max(1, Math.min(MIN_STINT, Math.floor(laps / Math.max(1, stints.length))));
    for (let i = 0; i < stints.length - 1; i++) {
      acc += best.stints[i];
      const to = acc + shift, last = i + 1 === stints.length - 1;
      const nextEnd = last ? laps : acc + best.stints[i + 1];   // unshifted: the longer, safer bound
      const over = (shift > 0 && to - prev > effLife(i, prev, to - prev))
        || (shift < 0 && nextEnd - to > effLife(i + 1, to, nextEnd - to));
      const at = clamp(over ? acc : to, prev + minStint, laps - minStint * (stints.length - 1 - i));
      lapsAt.push(at); stints[i] = at - prev; prev = at;
    }
    if (stints.length) stints[stints.length - 1] = laps - prev;
    return { start: best.seq[0], seq: best.seq, stints, stops: best.stops, lapsAt, cost: best.cost };
  }

  // The compound for an UNPLANNED stop — a spent set, or a track that has dried
  // out. The plan has nothing to say about these (a 0-stop plan has no next
  // compound at all, and a fixed "medium" ignores whether there are three
  // laps left or thirty), so pick the fastest rubber that can still cover
  // what remains: softest first, and the hardest as the fallback when nothing
  // comfortably lasts.
  function compoundFor(lapsLeft, lifeLaps) {
    const need = Math.max(1, lapsLeft);
    for (const cls of CLASSES) if (lifeLaps(cls) >= need) return cls;
    return CLASSES[CLASSES.length - 1];
  }

  // Should this car come in NOW, ahead of its plan? Three rules, in the order
  // their value was measured (docs/research/TYRE-STRATEGY-DESIGN.md §2.7, §2.9).
  //
  //   1. THE FREE STOP. Under a safety car or VSC the whole field is slowed, so
  //      a stop costs 40-60% less — 8-12 s, the single biggest lever in the
  //      sport. A car within reach of its planned stop takes it.
  //   2. THE WRONG TYRE. A dry->rain arc punishes a slick; pitting IS the
  //      recourse (docs/PHYSICS.md).
  //   3. THE SET IS GONE. Past its life the cliff costs more than the stop.
  //
  // Returns a REASON string (or "") rather than a boolean, so the caller can say
  // why on the radio and a test can assert which rule fired.
  const CAUTION_REACH = 6;    // laps of the plan a free stop is worth pulling forward
  // THE RIVAL RULES, a pit wall reading the cars around it. Both only pull a
  // stop the plan already wants forward (within UNDERCUT_REACH laps, on a set
  // that has done some work), so neither can add a stop the race cannot pay for.
  //   cover    — the car directly BEHIND, within COVER_GAP_S, has boxed: it
  //              will come out on fresh rubber and take the place (the
  //              undercut). An alert wall (TEMPER.react) boxes to cover it.
  //   undercut — stuck within STUCK_GAP_S of the car AHEAD that has not
  //              stopped, for STUCK_LAPS, with the stop due next lap: an
  //              aggressive wall (TEMPER.attack) stops first.
  const UNDERCUT_REACH = 2;   // the cover's reach; the undercut itself only on the stop's own lap-before
  const UNDERCUT_LAPS = 1;
  // …and only after STUCK_LAPS stuck: a car a second behind for a corner is racing, not stuck.
  const UNDERCUT_MIN_WEAR = 0.4;
  const STUCK_GAP_S = 1.0;
  // …and cover only the car DIRECTLY behind, in a real fight: a stop's worth
  // of gap (the engineer's measure) chained — one stop pulled the car ahead
  // in, which pulled the one ahead of it (10 of 20 stops "cover", measured).
  const COVER_GAP_S = 2.0;
  const STUCK_LAPS = 1;
  // An AI re-cuts at most once in REPLAN_GAP laps: the measured wear is noisy
  // over a lap or two and a plan sitting on a boundary flipped every lap
  // (up to 10 re-cuts in a 25-lap race, measured).
  const REPLAN_GAP = 4;
  // ONE rival call a race. With the field nose to tail (Austria, 10 laps) the
  // rules fired for 18 of 31 stops and half the grid two-stopped; an undercut
  // or a cover is a call a pit wall makes once, not a habit. And never one the
  // next set cannot carry to its own stop (ctx.fits): pulling a stop forward
  // onto a stint too long for its set bought the extra stop it was meant to save.
  // STRATEGIC TEMPER from the ratings — who reacts, who attacks, who gambles.
  // react = 0.6·experience + 0.4·awareness; attack = craft; gamble = 1 − experience.
  const TEMPER = { REACT_MIN: 0.75, ATTACK_MIN: 0.85, GAMBLE_W: 0.8 };
  function strategyTemper(c) {
    const t = traitsOf(c);
    return { react: 0.6 * t.experience + 0.4 * t.awareness, attack: t.craft, gamble: 1 - t.experience };
  }
  // The plan roll, widened by the gamble: a veteran runs close to the book,
  // a rookie's taste reaches the ends of the range (the extra stop, the
  // marathon first stint). Keeps 0.5 at 0.5, so a neutral roll stays neutral.
  function tasteRoll(roll, c) {
    return clamp(0.5 + (roll - 0.5) * (1 + TEMPER.GAMBLE_W * strategyTemper(c).gamble), 0, 1);
  }
  // A STOP YOU CANNOT RECOVER IS NOT WORTH MAKING. Rule 3 fired on wear alone,
  // with no regard for how much race was left, so a set that went over its life
  // near the flag sent the car down the lane to lose 15 s it had no laps to win
  // back: measured on an 8-lap Bahrain, TWELVE of 22 cars pitted on LAP 8 —
  // the last lap — every one of them for "worn".
  //
  // Fresh rubber pays back the drop it replaces, so the laps left have to
  // cover the stop: gain per lap is the whole drop of a set past its life
  // (DEG_LIN plus the cliff over how far past it is), and the stop costs `pitLossLaps`. Below the break-even the flag
  // comes first and the car drives it home, which is what a real team does.
  // The 0.1 floor keeps a set only just over its life from claiming an
  // enormous payback window and pitting on lap one past it.
  function wornPays(ctx) {
    if (ctx.lapsLeft == null) return true;            // caller has not said; behave as before
    const over = Math.max(0.1, (ctx.wear || 0) - 1);
    const gainPerLap = (DEG_LIN + DEG_CLIFF * over) * GRIP_TO_LAP;   // the drop a fresh set gives back
    const payback = (ctx.pitLossLaps > 0 ? ctx.pitLossLaps : PIT_LOSS_FALLBACK) / Math.max(1e-3, gainPerLap);
    return ctx.lapsLeft >= payback;
  }
  function pitNow(ctx) {
    if (!ctx) return "";
    // TWO RULES IGNORE THE PLAN'S STOP BUDGET, because both are about a tyre
    // that cannot do its job at all rather than about strategy. A car planning
    // no stops still has to come in for slicks in the rain, and still has to
    // change a set it has run off the cliff — gating these on `stopsLeft` left
    // every 0-stop car circulating on the wrong rubber, measured.
    if (ctx.wrongTread) return "weather";
    // A SCRIPTED plan (a real race replayed) stops on its real laps and nowhere
    // else: the caution reach would double-stop a car whose next real stop sat
    // inside a held safety car, and the worn rule would add one the real race never made.
    if (ctx.scripted) return ctx.stopsLeft > 0 && ctx.lapsToStop <= 0 ? "plan" : "";
    if (ctx.wear >= 1 && wornPays(ctx)) return "worn";
    if (ctx.stopsLeft <= 0) return "";
    // VSC and SC (2, 3) are the free stop; a red flag (4) is not a pit window.
    // …and only onto a set that can carry the stint it lengthens (ctx.fits,
    // as for the rival calls): an early SC pulled a one-stop's stop six laps
    // forward onto a set that could not reach the flag — a second stop.
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
