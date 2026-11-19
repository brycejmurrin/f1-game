const DriverRatings = (function () {
  "use strict";

  const clamp = M4.clamp;

  const AXES = ["pace", "craft", "awareness", "consistency", "experience"];
  const STYLE_AXES = ["aggression", "optimism", "composure", "tyreCare", "qualiBias", "ersBias"];
  const STYLE_SCALE = 30;

  const BASE = {
    VER: [96, 96, 92, 94,  92,  30,  24, 20, 2, 18, 20],
    LEC: [94, 89, 84, 86,  84,  24,  18, -18, -8, 22, 14],
    NOR: [93, 78, 81, 90,  72, -18, -12, 6, 8, 16, 6],
    PIA: [91, 74, 71, 90,  62, -10,  -8, 16, 16, 14, -4],
    RUS: [90, 82, 70, 90,  78,  12,  30, 10, -2, 20, -2],
    HAM: [89, 95, 88, 88, 100, -30, -24, 22, 20, -18, -22],
    SAI: [88, 88, 85, 88,  90, -24, -18, 14, 14, -2, -6],
    ALO: [86, 96, 76, 88, 100,  18,  12, 24, 18, -20, -18],
    GAS: [84, 84, 82, 82,  86, -12, -30, -4, -4, 12, 2],
    ALB: [84, 84, 81, 84,  78,   8,   6, 8, 4, 6, -10],
    ANT: [84, 90, 86, 74,  32,  -8,  -6, -22, -20, 8, 22],
    HUL: [82, 84, 86, 86,  94,  10,   8, 6, 6, -8, -12],
    OCO: [82, 82, 73, 80,  84,  -6, -10, -6, 12, -12, -8],
    HAD: [82, 78, 66, 78,  30,   2,   4, -20, -18, 10, 18],
    PER: [80, 88, 88, 74,  92,   6,  10, -8, 22, -22, -20],
    BEA: [80, 76, 78, 76,  34,  -2,  -4, -2, -10, -10, 10],
    LAW: [79, 76, 74, 74,  38,   1,   1, -10, -14, 4, 16],
    BOT: [79, 82, 76, 84,  96,   4,   2, 12, 10, -14, -16],
    COL: [78, 88, 85, 70,  30,  -4,  -2, -14, -12, 2, 8],
    BOR: [77, 72, 70, 73,  24,   0,   0, -12, -16, -4, 12],
    LIN: [76, 70, 85, 68,  12,   0,   0, -16, -22, -6, 4],
    STR: [74, 72, 87, 72,  80,  -1,  -1, -6, -6, -16, -14],
  };

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

  const SKILL_BASE = 0.94843;
  const SKILL_SPAN = 0.0232;
  const SKILL_JITTER = 0.00522;

  const roundClamp = (v, lo, hi) => Math.round(clamp(v, lo, hi));

  function fromTier(tier, code) {
    const t = clamp(tier | 0, 0, 4);
    const h = Hash32.fnv1a(code || "???");
    const spread = (n) => ((h >>> (n * 5)) & 31) - 15;
    const h2 = Hash32.mix(h);
    const spread2 = (n) => ((h2 >>> (n * 5)) & 31) - 15, st = (n) => clamp(spread2(n), -STYLE_SCALE, STYLE_SCALE);
    const anchor = 88 - t * 4;
    return {
      pace:        roundClamp(anchor + spread(0) * 0.35, 60, 96),
      craft:       roundClamp(anchor + spread(1) * 0.45, 55, 96),
      awareness:   roundClamp(anchor + spread(2) * 0.50, 55, 94),
      consistency: roundClamp(anchor + spread(3) * 0.45, 55, 94),
      experience:  roundClamp(45 + spread(4) * 2.0, 5, 100),
      aggression: st(0), optimism: st(1), composure: st(2), tyreCare: st(3), qualiBias: st(4), ersBias: st(5),
    };
  }

  function get(code, tier, deltas) {
    const row = Object.hasOwn(BASE, code) ? BASE[code] : Object.hasOwn(HIRES, code) ? HIRES[code] : null;
    const r = row
      ? {
          pace: row[0], craft: row[1], awareness: row[2], consistency: row[3], experience: row[4],
          aggression: row[5] != null ? row[5] : 0,
          optimism: row[6] != null ? row[6] : 0,
          composure: row[7] != null ? row[7] : 0,
          tyreCare: row[8] || 0, qualiBias: row[9] || 0, ersBias: row[10] || 0,
        }
      : fromTier(tier, code);
    if (deltas) {
      const dv = (k) => (typeof deltas[k] === "number" && isFinite(deltas[k]) ? deltas[k] : 0);
      for (const k of AXES) if (dv(k)) r[k] = clamp(r[k] + dv(k), 1, 100);
      for (const k of STYLE_AXES) if (dv(k)) r[k] = clamp(r[k] + dv(k), -STYLE_SCALE, STYLE_SCALE);
    }
    return r;
  }

  function overall(r) {
    if (!r) return 0;
    return Math.round(r.pace * 0.46 + r.craft * 0.26 + r.awareness * 0.12
                    + r.consistency * 0.12 + r.experience * 0.04);
  }

  function skill(r, roll) {
    const jitter = (roll - 0.5) * SKILL_JITTER * (1 - r.consistency / 100);
    return clamp(SKILL_BASE + (r.pace / 100) * SKILL_SPAN + jitter, 0.90, 1.0);
  }

  function style01(v) {
    return clamp((v != null ? v : 0) / STYLE_SCALE, -1, 1);
  }

  function buildPace(built, works) {
    const b = built.mods, w = works.mods;
    let sum = 0;
    for (const k of ["speed", "accel", "cornering", "braking"]) sum += (b[k] || 1) / (w[k] || 1);
    return sum / 4;
  }
  function ladderPace(ratio, tier, ladder) {
    return clamp(ratio, ladder[ladder.length - 1] / ladder[tier], ladder[0] / ladder[tier]);
  }

  return { AXES, STYLE_AXES, BASE, HIRES, get, overall, fromTier, style01,
           buildPace, ladderPace, hash32: Hash32.fnv1a, skill };
})();
Object.freeze(DriverRatings);
