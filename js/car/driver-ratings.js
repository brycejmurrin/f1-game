/* Apex 26 — DRIVER RATINGS: the five-axis skill table for the 2026 grid. Deliberately NOT in js/car/teams.js. That file is the verified real-world grid (names, nu… */
const DriverRatings = (function () {
  "use strict";

const AXES = ["pace", "craft", "awareness", "consistency", "experience"];

// [pace, craft, awareness, consistency, experience]. Compact on purpose — 22 rows
// of five numbers stay readable as a table, where 22 objects would not.
const BASE = {
  VER: [96, 96, 88, 94,  92],   // fastest on the grid, and knows it
  LEC: [94, 89, 84, 86,  84],
  NOR: [93, 90, 86, 90,  72],   // 2025 champion
  PIA: [91, 88, 88, 90,  62],
  RUS: [90, 88, 88, 90,  78],
  HAM: [89, 95, 92, 88, 100],   // pace has ebbed; racecraft has not
  SAI: [88, 88, 86, 88,  90],
  ALO: [86, 96, 88, 88, 100],   // the reason ratings cannot be derived from car tier
  GAS: [84, 84, 82, 82,  86],
  ALB: [84, 84, 84, 84,  78],
  ANT: [84, 78, 72, 74,  32],   // quick, raw
  HUL: [82, 84, 86, 86,  94],
  OCO: [82, 82, 76, 80,  84],
  HAD: [82, 78, 76, 78,  30],
  PER: [80, 82, 78, 74,  92],
  BEA: [80, 76, 74, 76,  34],
  LAW: [79, 76, 74, 74,  38],
  BOT: [79, 82, 84, 84,  96],
  COL: [78, 74, 68, 70,  30],
  BOR: [77, 72, 70, 72,  24],
  LIN: [76, 70, 66, 68,  12],   // rookie
  STR: [74, 72, 70, 72,  80],
};

// Deterministic 32-bit hash of a string. Used to give an UNKNOWN driver a stable
// personality instead of a random one — the custom team's driver, or a rookie the
// career market generates, must rate the same on every load of the same save.
function hash32(str) {
  let h = 0x811c9dc5;
  const s = String(str);   // hoisted: was re-converting twice per character
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const clamp = M4.clamp;                       // shared scalar helper (js/mat4.js)
const rClamp = (v, lo, hi) => Math.round(clamp(v, lo, hi));

// Fallback for a code not in BASE. Anchored on the car's tier (a tier-4 seat
// rarely holds a 90-pace driver) and spread by the code's hash so two unknown
// drivers are not clones of each other.
function fromTier(tier, code) {
  const t = clamp(tier | 0, 0, 4);
  const h = hash32(code || "???");
  const spread = (n) => ((h >>> (n * 5)) & 31) - 15;      // -15..+16, stable per code
  const anchor = 88 - t * 4;
  return {
    pace:        rClamp(anchor + spread(0) * 0.35, 60, 96),
    craft:       rClamp(anchor + spread(1) * 0.45, 55, 96),
    awareness:   rClamp(anchor + spread(2) * 0.50, 55, 94),
    consistency: rClamp(anchor + spread(3) * 0.45, 55, 94),
    experience:  rClamp(45 + spread(4) * 2.0, 5, 100),
  };
}

function get(code, tier, deltas) {
  const row = BASE[code];
  const r = row
    ? { pace: row[0], craft: row[1], awareness: row[2], consistency: row[3], experience: row[4] }
    : fromTier(tier, code);
  if (deltas) for (const k of AXES) if (deltas[k]) r[k] = clamp(r[k] + deltas[k], 1, 100);
  return r;
}

// A single headline number, weighted the way F1 25 weights it — mostly pace, with
// racecraft second. Display only; nothing in the sim reads it.
function overall(r) {
  if (!r) return 0;
  return Math.round(r.pace * 0.46 + r.craft * 0.26 + r.awareness * 0.12
                  + r.consistency * 0.12 + r.experience * 0.04);
}

// This replaces `Math.min(1.0, 0.92 + simRnd() * 0.1)` in makeCars(). That roll
// ran [0.92, 1.02] clamped at 1.0, so ~20% of draws landed exactly on the clamp
// and its true mean was ~0.968. SKILL_BASE/SKILL_SPAN are chosen to put the
// GRID-MEAN pace (84) back on that same 0.968 — otherwise handing every driver a
// rating would quietly make the whole field faster at every difficulty.
//
// The span is deliberately ~2.7% across the grid, against TIER_V's ~5.8% across
// the tiers: the car still dominates, as it does in the sport, but a great driver
// in a midfield car can take the fight to a poor one in a better car.
const SKILL_BASE = 0.856;
const SKILL_SPAN = 0.13333;   // × (pace/100)
const SKILL_JITTER = 0.03;

function skill(r, roll) {
  const jitter = (roll - 0.5) * SKILL_JITTER * (1 - r.consistency / 100);
  return clamp(SKILL_BASE + (r.pace / 100) * SKILL_SPAN + jitter, 0.90, 1.0);
}

return { AXES, BASE, get, overall, fromTier, hash32, skill,
         SKILL_BASE, SKILL_SPAN, SKILL_JITTER };
})();
