const Teams = (function () {
  "use strict";

  const LIST = [
    {
      id: "mercedes", name: "Mercedes-AMG", short: "MER",
      color: [0.045, 0.055, 0.065], color2: [0.0, 0.706, 0.671],
      livery: {
        logo3: [0.06, 0.06, 0.08], cover: [0.76, 0.78, 0.82], finStyle: "stars", finShape: "standard", spineHeight: "raised",
                spineLogo: "fade", spineSide: "starfield", coverBind: "spineOnly",
                noseStripe: [0.76, 0.78, 0.82], fin: [0.045, 0.055, 0.065],
                upper: [0.76, 0.78, 0.82] },
      engine: "Mercedes", tier: 0,
      stats: { speed: 96, accel: 91, cornering: 93, braking: 90 },
      drivers: [
        { name: "George Russell", code: "RUS", num: 63 },
        { name: "Kimi Antonelli", code: "ANT", num: 12 }
      ]
    },
    {
      id: "ferrari", name: "Scuderia Ferrari", short: "FER",
      color: [0.863, 0.0, 0.0], color2: [1.0, 1.0, 1.0],
      livery: { cover: [0.863, 0.0, 0.0], finShape: "stepped", spineHeight: "standard",
                wing: [0.06, 0.06, 0.07], rearWing: [0.06, 0.06, 0.07],
                spineLogo: "cap", spineSide: "shoulder", coverBind: "saddleWrap", finHandoff: "contrast",
                saddleTint: [0.95, 0.95, 0.96], fin: [0.863, 0.0, 0.0],
                logo3: [1.0, 0.925, 0.0] },
      engine: "Ferrari", tier: 1,
      stats: { speed: 97, accel: 88, cornering: 91, braking: 92 },
      drivers: [
        { name: "Charles Leclerc", code: "LEC", num: 16 },
        { name: "Lewis Hamilton", code: "HAM", num: 44 }
      ]
    },
    {
      id: "mclaren", name: "McLaren", short: "MCL",
      livery: {
        logo3: [0.06, 0.06, 0.08], finShape: "stepped", spineHeight: "raised", spineLogo: "panel", spineSide: "wordmark",
        lower: [0.122, 0.122, 0.122] },
      color: [1.0, 0.502, 0.0], color2: [0.122, 0.122, 0.122],
      engine: "Mercedes", tier: 1,
      stats: { speed: 93, accel: 94, cornering: 96, braking: 91 },
      drivers: [
        { name: "Lando Norris", code: "NOR", num: 1 },
        { name: "Oscar Piastri", code: "PIA", num: 81 }
      ]
    },
    {
      id: "redbull", name: "Red Bull Racing", short: "RBR",
      livery: { finShape: "standard", spineHeight: "standard", spineLogo: "wrap", spineSide: "duo",
                logo3: [1.0, 0.788, 0.024], nose: [1.0, 0.788, 0.024], fin: [0.145, 0.333, 0.710] },
      color: [0.145, 0.333, 0.710], color2: [1.0, 0.843, 0.0],
      engine: "Red Bull Ford", tier: 2,
      stats: { speed: 90, accel: 88, cornering: 91, braking: 87 },
      drivers: [
        { name: "Max Verstappen", code: "VER", num: 3 },
        { name: "Isack Hadjar", code: "HAD", num: 6 }
      ]
    },
    {
      id: "alpine", name: "Alpine", short: "ALP",
      livery: {
        logo3: [0.06, 0.06, 0.08], finShape: "none", spineHeight: "dorsal", spineLogo: "stripe", spineSide: "band",
                spineTint: [1.0, 0.702, 0.820], pod: [1.0, 0.529, 0.737], noseStripe: [1.0, 0.529, 0.737],
                halo: [1.0, 0.529, 0.737], wing: [0.0, 0.576, 0.8] },
      color: [0.0, 0.576, 0.8], color2: [1.0, 0.529, 0.737],
      engine: "Mercedes", tier: 3,
      stats: { speed: 83, accel: 80, cornering: 82, braking: 80 },
      drivers: [
        { name: "Pierre Gasly", code: "GAS", num: 10 },
        { name: "Franco Colapinto", code: "COL", num: 43 }
      ]
    },
    {
      id: "racingbulls", name: "Racing Bulls", short: "RB",
      livery: {
        logo3: [0.97, 0.97, 0.98], finShape: "none", spineHeight: "dorsal", spineLogo: "streaks", spineSide: "sash",
                spineTint: [0.086, 0.204, 0.796], wingCarbon: "carbon", finish: "matte" },
      color: [0.961, 0.961, 0.969], color2: [0.086, 0.204, 0.796],
      engine: "Red Bull Ford", tier: 3,
      stats: { speed: 82, accel: 82, cornering: 81, braking: 80 },
      drivers: [
        { name: "Liam Lawson", code: "LAW", num: 30 },
        { name: "Arvid Lindblad", code: "LIN", num: 41 }
      ]
    },
    {
      id: "haas", name: "Haas", short: "HAA",
      livery: { finShape: "none", spineHeight: "dorsal", spineLogo: "panel", spineSide: "number",
                logo3: [0.06, 0.06, 0.08], lower: [0.06, 0.06, 0.07] },
      color: [0.957, 0.957, 0.965], color2: [0.855, 0.161, 0.11],
      engine: "Ferrari", tier: 3,
      stats: { speed: 80, accel: 79, cornering: 79, braking: 79 },
      drivers: [
        { name: "Esteban Ocon", code: "OCO", num: 31 },
        { name: "Oliver Bearman", code: "BEA", num: 87 }
      ]
    },
    {
      id: "williams", name: "Williams", short: "WIL",
      color: [0.059, 0.235, 0.788], color2: [1.0, 1.0, 1.0],
      livery: { cover: [0.055, 0.058, 0.070], finShape: "none", spineHeight: "dorsal",
                spineLogo: "ridge", spineSide: "rake", coverBind: "independent",
                spineTint: [0.0, 0.82, 0.95], sideTint: [0.059, 0.235, 0.788], pod: [1.0, 1.0, 1.0] },
      engine: "Mercedes", tier: 3,
      stats: { speed: 82, accel: 78, cornering: 80, braking: 79 },
      drivers: [
        { name: "Carlos Sainz", code: "SAI", num: 55 },
        { name: "Alexander Albon", code: "ALB", num: 23 }
      ]
    },
    {
      id: "audi", name: "Audi", short: "AUD",
      color: [0.702, 0.722, 0.741], color2: [0.98, 0.28, 0.05],
      livery: { finShape: "none", spineHeight: "dorsal", spineLogo: "cap", spineSide: "rake",
                coverBind: "independent", cover: [0.075, 0.078, 0.085],
                saddleTint: [0.98, 0.28, 0.05], spineTint: [0.98, 0.28, 0.05] },
      engine: "Audi", tier: 4,
      stats: { speed: 76, accel: 74, cornering: 75, braking: 73 },
      drivers: [
        { name: "Nico Hülkenberg", code: "HUL", num: 27 },
        { name: "Gabriel Bortoleto", code: "BOR", num: 5 }
      ]
    },
    {
      id: "astonmartin", name: "Aston Martin", short: "AMR",
      livery: { finShape: "none", spineHeight: "dorsal", spineLogo: "stripe", spineSide: "logo",
                spineTint: [0.008, 0.086, 0.078], finish: "satin", coverVents: "gills",
                rearWing: [0.55, 0.72, 0.88] },
      color: [0.0, 0.349, 0.31], color2: [0.718, 0.882, 0.106],
      engine: "Honda", tier: 4,
      stats: { speed: 74, accel: 72, cornering: 76, braking: 74 },
      drivers: [
        { name: "Fernando Alonso", code: "ALO", num: 14 },
        { name: "Lance Stroll", code: "STR", num: 18 }
      ]
    },
    {
      id: "cadillac", name: "Cadillac", short: "CAD",
      livery: { finShape: "none", spineHeight: "dorsal", spineLogo: "saddle", spineSide: "plate",
                bodySplit: "lr", halo: [0.86, 0.88, 0.92], coverVents: "gills", logo3: [0.06, 0.06, 0.08] },
      color: [0.84, 0.85, 0.86], color2: [0.039, 0.039, 0.039],
      engine: "Ferrari", tier: 4,
      stats: { speed: 73, accel: 73, cornering: 73, braking: 72 },
      drivers: [
        { name: "Sergio Perez", code: "PER", num: 11 },
        { name: "Valtteri Bottas", code: "BOT", num: 77 }
      ]
    }
  ];

  const POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];

  const TIER_V = [0.9695, 0.9674, 0.9648, 0.9622, 0.9594];

  const isReal = (t) => !!t && !t.custom && !t.legends;

  const DEFAULT_CUSTOM = {
    id: "custom", name: "My Team", short: "YOU", engine: "Custom", tier: 2, custom: true,
    livery: { finShape: "none", spineHeight: "dorsal", spineLogo: "number", spineSide: "number" },
    color: [0.13, 0.79, 0.85], color2: [0.96, 0.86, 0.0],
    stats: { speed: 84, accel: 82, cornering: 83, braking: 81 },
    drivers: [{ name: "Your Name", code: "YOU", num: 99 }],
  };

  const CUSTOM_MAX_DRIVERS = 2;
  const CTRL = /[\u0000-\u001f\u007f-\u009f‎‏‪-‮⁦-⁩]/g;
  function cleanText(v, fb, n, upper) {
    if (typeof v !== "string") return fb;
    let s = v.replace(CTRL, "").trim();
    if (upper) s = s.toUpperCase();
    return Array.from(s).slice(0, n).join("").trim() || fb;
  }
  const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
  const fin = (v) => typeof v === "number" && Number.isFinite(v);
  function cleanRgb(v, fb) {
    if (!Array.isArray(v) || v.length < 3 || !v.slice(0, 3).every(fin)) return fb.slice();
    return v.slice(0, 3).map((x) => Math.min(1, Math.max(0, x)));
  }
  function cleanDriver(d, fb) {
    const num = isObj(d) && fin(d.num) ? Math.round(d.num) : fb.num;
    return {
      name: cleanText(isObj(d) ? d.name : null, fb.name, 22, false),
      code: cleanText(isObj(d) ? d.code : null, fb.code, 3, true),
      num: Math.min(99, Math.max(0, num)),
    };
  }
  function liveryEnumOk(k, v) {
    if (typeof v !== "string" || v in Object.prototype) return false;
    const category = typeof Car3D !== "undefined" && Car3D.PART_STYLE_FIELDS && Object.hasOwn(Car3D.PART_STYLE_FIELDS, k) && Car3D.PART_STYLE_FIELDS[k];
    if (category && typeof Parts !== "undefined") {
      const cat = Parts.CATALOG.find(c => c.id === category);
      return v === "fitted" || !!(cat && cat.options.some(o => o.tag === "STYLE" && o.id === v));
    }
    const ids = k === "finShape" ? (typeof Car3D !== "undefined" && Car3D.FIN_SHAPE_IDS)
      : k === "numFont" ? (typeof LiveryTex !== "undefined" && LiveryTex.NUM_FONT_IDS)
      : k === "finish" ? (typeof Car3D !== "undefined" && Car3D.FINISH_SURFACE && ["gloss"].concat(Object.keys(Car3D.FINISH_SURFACE)))
      : typeof k === "string" && k.endsWith("Finish") ? (typeof Car3D !== "undefined" && Car3D.FINISH_SURFACE && ["inherit", "gloss"].concat(Object.keys(Car3D.FINISH_SURFACE)))
      : null;
    return !ids || ids.indexOf(v) >= 0;
  }
  function sanitizeCustom(t) {
    const D = DEFAULT_CUSTOM;
    const src = isObj(t) ? t : {};
    const rows = Array.isArray(src.drivers) ? src.drivers.filter(isObj).slice(0, CUSTOM_MAX_DRIVERS) : [];
    const stats = {};
    for (const k of Object.keys(D.stats)) {
      stats[k] = isObj(src.stats) && fin(src.stats[k]) ? Math.min(100, Math.max(0, src.stats[k])) : D.stats[k];
    }
    const livery = {};
    for (const [k, v] of Object.entries(isObj(src.livery) ? src.livery : D.livery)) {
      if (k === "__proto__") continue;
      if (typeof v === "string") { const s = cleanText(v, "", 32, false); if (s && liveryEnumOk(k, s)) livery[k] = s; }
      else if (Array.isArray(v) && v.length === 3 && v.every(fin)) livery[k] = cleanRgb(v, [0, 0, 0]);
    }
    return {
      id: "custom", custom: true,
      name: cleanText(src.name, D.name, 22, false),
      short: cleanText(src.short, D.short, 4, true),
      engine: cleanText(src.engine, D.engine, 16, false),
      tier: Number.isInteger(src.tier) && src.tier >= 0 && src.tier <= 4 ? src.tier : D.tier,
      color: cleanRgb(src.color, D.color),
      color2: cleanRgb(src.color2, D.color2),
      stats,
      livery,
      drivers: rows.length ? rows.map((d) => cleanDriver(d, D.drivers[0])) : D.drivers.map((d) => cleanDriver(d, d)),
    };
  }

  return { LIST, POINTS, TIER_V, DEFAULT_CUSTOM, isReal, sanitizeCustom, liveryEnumOk };
})();
Object.freeze(Teams);
