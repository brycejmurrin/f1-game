/* Apex 26 — DRIVER RATINGS: the five-axis skill table for the 2026 grid. Deliberately NOT in js/data/teams.js: that file is the verified real-world grid (names, numbers, colours); these numbers are the game's own opinion of each driver. */
const DriverRatings = (function () {
  "use strict";

  const clamp = M4.clamp;   // eval-time read: js/core/mat4.js loads before every data file

  const AXES = ["pace", "craft", "awareness", "consistency", "experience"];
  // Style axes: signed −30..+30, zero-mean across the authored grid, NEVER in
  // overall()/skill() or the top-speed product. Appended after the quality tuple.
  const STYLE_AXES = ["aggression", "optimism"];
  const STYLE_SCALE = 30;   // authored units → traits −1..+1 via / STYLE_SCALE

  // [pace, craft, awareness, consistency, experience, aggression, optimism].
  // Slice 2: craft/awareness/consistency pairwise |r|<0.5; pace frozen.
  // Slice 3: style columns interleaved by overall rank (sum 0 each).
  const BASE = {
    VER: [96, 96, 92, 94,  92,  30,  24], // still the pace king
    LEC: [94, 89, 84, 86,  84,  24,  18], // craft high; awareness soft spot kept
    NOR: [93, 78, 81, 90,  72, -18, -12], // 2025 champion — craft reshuffled for decorrelation
    PIA: [91, 74, 71, 90,  62, -10,  -8],
    RUS: [90, 82, 70, 90,  78,  12,  30], // metronome with optimistic brake markers
    HAM: [89, 95, 88, 88, 100, -30, -24], // pace has ebbed; racecraft has not
    SAI: [88, 88, 85, 88,  90, -24, -18],
    ALO: [86, 96, 76, 88, 100,  18,  12], // craft elite; OT product preserved vs tip
    GAS: [84, 84, 82, 82,  86, -12, -30],
    ALB: [84, 84, 81, 84,  78,   8,   6],
    ANT: [84, 90, 86, 74,  32,  -8,  -6], // quick, raw
    HUL: [82, 84, 86, 86,  94,  10,   8],
    OCO: [82, 82, 73, 80,  84,  -6, -10],
    HAD: [82, 78, 66, 78,  30,   2,   4],
    PER: [80, 88, 88, 74,  92,   6,  10],
    BEA: [80, 76, 78, 76,  34,  -2,  -4],
    LAW: [79, 76, 74, 74,  38,   1,   1],
    BOT: [79, 82, 76, 84,  96,   4,   2],
    COL: [78, 88, 85, 70,  30,  -4,  -2],
    BOR: [77, 72, 70, 73,  24,   0,   0],
    LIN: [76, 70, 85, 68,  12,   0,   0], // rookie
    STR: [74, 72, 87, 72,  80,  -1,  -1], // pay seat
  };

  // The MY TEAM free agents (Career.freeAgents(), js/career/career.js), keyed by
  // code and kept OUT of BASE so the grid's statistics (zero-mean style, field
  // mean pace, decorrelated columns) stay about the 22 real drivers. Without a row
  // here get() fell back to fromTier(), which depends on the CALLER's tier: the
  // hire tile asked with the agent's own tier and the race with the team's (a
  // custom team is tier 2), so six of eight tiles promised a different driver
  // than raced, and the cheapest hires raced like the dearest. An authored row
  // answers the same whatever tier is passed; overall() rises with the asking
  // price (pinned in tests/unit/career-hire-rating.test.mjs).
  const HIRES = Object.freeze({
    FER2: [87, 85, 80, 82, 70],
    LNQ:  [85, 82, 79, 80, 64],
    SLZ:  [82, 78, 76, 76, 58],
    ASH:  [80, 77, 74, 75, 66],
    NKM:  [78, 74, 72, 72, 48],
    DVL:  [76, 73, 71, 71, 60],
    CHD:  [75, 70, 70, 68, 40],
    OKO:  [73, 68, 68, 66, 36],
  });

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
    // The style axes read a SECOND hash. spread(6) shifts by 30, which leaves 2
    // bits of a 32-bit hash, so optimism was always -15..-12 and every unrated
    // driver was ~-0.45 optimistic. Re-deriving them changes the style traits
    // of unrated codes only (MY TEAM hires, user codes, rivals); BASE/HIRES rows
    // and the five quality axes keep their exact values.
    const h2 = Hash32.mix(h);
    const spread2 = (n) => ((h2 >>> (n * 5)) & 31) - 15;
    const anchor = 88 - t * 4;
    return {
      pace:        roundClamp(anchor + spread(0) * 0.35, 60, 96),
      craft:       roundClamp(anchor + spread(1) * 0.45, 55, 96),
      awareness:   roundClamp(anchor + spread(2) * 0.50, 55, 94),
      consistency: roundClamp(anchor + spread(3) * 0.45, 55, 94),
      experience:  roundClamp(45 + spread(4) * 2.0, 5, 100),
      // Style from the second hash — not zero-mean for unrated codes (only BASE is).
      aggression:  clamp(spread2(0), -STYLE_SCALE, STYLE_SCALE),
      optimism:    clamp(spread2(1), -STYLE_SCALE, STYLE_SCALE),
    };
  }

  function get(code, tier, deltas) {
    // Own keys only: a persisted code of "constructor" / "__proto__" resolved to
    // a function and the rating came out NaN.
    const row = Object.hasOwn(BASE, code) ? BASE[code] : Object.hasOwn(HIRES, code) ? HIRES[code] : null;
    const r = row
      ? {
          pace: row[0], craft: row[1], awareness: row[2], consistency: row[3], experience: row[4],
          aggression: row[5] != null ? row[5] : 0,
          optimism: row[6] != null ? row[6] : 0,
        }
      : fromTier(tier, code);
    if (deltas) {
      for (const k of AXES) if (deltas[k]) r[k] = clamp(r[k] + deltas[k], 1, 100);
      // Career may not author style deltas; ignore unknown keys.
      for (const k of STYLE_AXES) if (deltas[k]) r[k] = clamp(r[k] + deltas[k], -STYLE_SCALE, STYLE_SCALE);
    }
    return r;
  }

  // A single headline number, weighted the way F1 25 weights it — mostly pace,
  // with racecraft second. NOT display-only: career's silly season ranks the
  // grid with it (the seat-swap gate and weakerSeat() in js/career/career.js), so
  // a weighting change moves who changes teams in a saved career.
  // Style axes are excluded by construction.
  function overall(r) {
    if (!r) return 0;
    return Math.round(r.pace * 0.46 + r.craft * 0.26 + r.awareness * 0.12
                    + r.consistency * 0.12 + r.experience * 0.04);
  }

  function skill(r, roll) {
    const jitter = (roll - 0.5) * SKILL_JITTER * (1 - r.consistency / 100);
    return clamp(SKILL_BASE + (r.pace / 100) * SKILL_SPAN + jitter, 0.90, 1.0);
  }

  /** Authored style unit (−STYLE_SCALE..+STYLE_SCALE) → trait −1..+1. */
  function style01(v) {
    return clamp((v != null ? v : 0) / STYLE_SCALE, -1, 1);
  }

  // MY TEAM hire pace vs the works car — mean of the four mod axes. Pure; no RNG.
  function buildPace(built, works) {
    const b = built.mods, w = works.mods;
    let sum = 0;
    for (const k of ["speed", "accel", "cornering", "braking"]) sum += (b[k] || 1) / (w[k] || 1);
    return sum / 4;
  }

  return { AXES, STYLE_AXES, STYLE_SCALE, BASE, HIRES, get, overall, fromTier, style01,
           buildPace, hash32: Hash32.fnv1a, skill, SKILL_BASE, SKILL_SPAN, SKILL_JITTER };
})();
Object.freeze(DriverRatings);
