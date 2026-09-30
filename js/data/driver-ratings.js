/* Apex 26 — DRIVER RATINGS: the five-axis skill table for the 2026 grid. Deliberately NOT in js/data/teams.js: that file is the verified real-world grid (names, numbers, colours); these numbers are the game's own opinion of each driver. */
const DriverRatings = (function () {
  "use strict";

  const clamp = M4.clamp;   // eval-time read: js/core/mat4.js loads before every data file

  const AXES = ["pace", "craft", "awareness", "consistency", "experience"];

  // [pace, craft, awareness, consistency, experience]. Compact on purpose — 22 rows
  // of five numbers stay readable as a table, where 22 objects would not.
  // Slice 2: craft/awareness/consistency pairwise |r|<0.5; pace frozen; OT fire
  // product (craftMul×awareMul) kept near tip so traffic pace stays honest.
  const BASE = {
    VER: [96, 96, 92, 94,  92], // still the pace king
    LEC: [94, 89, 84, 86,  84], // craft high; awareness soft spot kept
    NOR: [93, 78, 81, 90,  72], // 2025 champion — craft reshuffled for decorrelation
    PIA: [91, 74, 71, 90,  62],
    RUS: [90, 82, 70, 90,  78],
    HAM: [89, 95, 88, 88, 100], // pace has ebbed; racecraft has not
    SAI: [88, 88, 85, 88,  90],
    ALO: [86, 96, 76, 88, 100], // craft elite; OT product preserved vs tip
    GAS: [84, 84, 82, 82,  86],
    ALB: [84, 84, 81, 84,  78],
    ANT: [84, 90, 86, 74,  32], // quick, raw
    HUL: [82, 84, 86, 86,  94],
    OCO: [82, 82, 73, 80,  84],
    HAD: [82, 78, 66, 78,  30],
    PER: [80, 88, 88, 74,  92],
    BEA: [80, 76, 78, 76,  34],
    LAW: [79, 76, 74, 74,  38],
    BOT: [79, 82, 76, 84,  96],
    COL: [78, 88, 85, 70,  30],
    BOR: [77, 72, 70, 73,  24],
    LIN: [76, 70, 85, 68,  12], // rookie
    STR: [74, 72, 87, 72,  80], // pay seat
  };

  // The unrated roll, Math.min(1.0, 0.92 + simRnd() * 0.1), puts ~20% of draws
  // on the clamp for a true mean of ~0.968. SKILL_BASE/SKILL_SPAN put the
  // GRID-MEAN pace (84) back on that 0.968 — otherwise handing every driver a
  // rating would quietly make the whole field faster at every difficulty.
  // Compressed alongside TIER_V (js/data/teams.js) by the same factor (0.174)
  // about the measured field mean (0.9679): mean skill unchanged, spread
  // 3.19% -> ~0.6% across the field. The car still dominates, as in the sport.
  const SKILL_BASE = 0.94843;
  const SKILL_SPAN = 0.0232;    // × (pace/100)
  const SKILL_JITTER = 0.00522;

  const roundClamp = (v, lo, hi) => Math.round(clamp(v, lo, hi));

  // Fallback for a code not in BASE. Anchored on the car's tier (a tier-4 seat
  // rarely holds a 90-pace driver) and spread by the code's hash so two unknown
  // drivers are not clones of each other.
  function fromTier(tier, code) {
    const t = clamp(tier | 0, 0, 4);
    const h = Hash32.fnv1a(code || "???");
    const spread = (n) => ((h >>> (n * 5)) & 31) - 15;      // -15..+16, stable per code
    const anchor = 88 - t * 4;
    return {
      pace:        roundClamp(anchor + spread(0) * 0.35, 60, 96),
      craft:       roundClamp(anchor + spread(1) * 0.45, 55, 96),
      awareness:   roundClamp(anchor + spread(2) * 0.50, 55, 94),
      consistency: roundClamp(anchor + spread(3) * 0.45, 55, 94),
      experience:  roundClamp(45 + spread(4) * 2.0, 5, 100),
    };
  }

  function get(code, tier, deltas) {
    const row = BASE[code];
    const r = row
      ? { pace: row[0], craft: row[1], awareness: row[2], consistency: row[3], experience: row[4] }
      : fromTier(tier, code);
    if (deltas) {
      for (const k of AXES) if (deltas[k]) r[k] = clamp(r[k] + deltas[k], 1, 100);
    }
    return r;
  }

  // A single headline number, weighted the way F1 25 weights it — mostly pace,
  // with racecraft second. NOT display-only: career's silly season ranks the
  // grid with it (the seat-swap gate and weakerSeat() in js/career/career.js), so
  // a weighting change moves who changes teams in a saved career.
  function overall(r) {
    if (!r) return 0;
    return Math.round(r.pace * 0.46 + r.craft * 0.26 + r.awareness * 0.12
                    + r.consistency * 0.12 + r.experience * 0.04);
  }

  function skill(r, roll) {
    const jitter = (roll - 0.5) * SKILL_JITTER * (1 - r.consistency / 100);
    return clamp(SKILL_BASE + (r.pace / 100) * SKILL_SPAN + jitter, 0.90, 1.0);
  }

  return { AXES, BASE, get, overall, fromTier, hash32: Hash32.fnv1a, skill,
           SKILL_BASE, SKILL_SPAN, SKILL_JITTER };
})();
Object.freeze(DriverRatings);
