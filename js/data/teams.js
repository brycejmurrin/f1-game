/* Apex 26 — Teams: hardcoded, verified 2026 grid (11 teams, 22 drivers).
   Colors are [r,g,b] floats 0..1. tier: 0 fastest .. 4 slowest. */
const Teams = (function () {
  "use strict";

  // Every team's DEFAULT livery names its 2026 engine cover: Liveries.forTeam
  // folds `livery` into the synthesized "default" (new player + every AI car),
  // while the picker entries in js/car/liveries.js keep the plain cover.
  // Fields: LiveryTex.SPINE_LOGO_IDS / SPINE_SIDE_IDS (crown and flank
  // graphics), Car3D.SPINE_HEIGHT_IDS / FIN_SHAPE_IDS (shape). No real 2026
  // car carries a tail fin, so none of them do.
  //
  // ONE `livery:` key per team: two sessions each adding one merged without a
  // conflict, the later duplicate key silently won and the earlier design
  // vanished. tests/unit/team-livery.test.mjs is the guard.
  // `carbon` and `bigmark` are not defaults: on a near-black car (Haas, Audi)
  // both disappear from a race camera (tools/shot/shot.mjs --team).
  const LIST = [
    {
      id: "mercedes", name: "Mercedes-AMG Petronas", short: "MER",
      color: [0.045, 0.055, 0.065], color2: [0.0, 0.706, 0.671],   /* black #0B0E10 / Petronas teal #00B4AB (2026 black car) */
      /* The W17 is a BLACK car with a SILVER engine cover: the launch photos show
         the airbox, roll structure and cover crown in bare-metal silver over a
         black chassis, with the star flake on the tail. */
      livery: { cover: [0.76, 0.78, 0.82], finStyle: "stars", finShape: "none", spineHeight: "dorsal",
                spineLogo: "fade", spineSide: "starfield", coverBind: "spineOnly" },
      engine: "Mercedes", tier: 0,
      stats: { speed: 96, accel: 91, cornering: 93, braking: 90 },
      drivers: [
        { name: "George Russell", code: "RUS", num: 63 },
        { name: "Kimi Antonelli", code: "ANT", num: 12 }
      ]
    },
    {
      id: "ferrari", name: "Scuderia Ferrari HP", short: "FER",
      color: [0.863, 0.0, 0.0], color2: [1.0, 1.0, 1.0],           /* red #DC0000 / white */
      /* The SF-26's white engine-cover TOP is a SADDLE ZONE on the red body —
         cover stays body red; saddleTint + saddleWrap paint the white block
         (crown + flanks). Same split as the launch photos, expressed as zones. */
      livery: { cover: [0.863, 0.0, 0.0], finShape: "none", spineHeight: "dorsal",
                spineLogo: "cap", spineSide: "shoulder", coverBind: "saddleWrap", finHandoff: "contrast",
                saddleTint: [0.95, 0.95, 0.96], fin: [0.863, 0.0, 0.0] },
      engine: "Ferrari", tier: 1,
      stats: { speed: 97, accel: 88, cornering: 91, braking: 92 },
      drivers: [
        { name: "Charles Leclerc", code: "LEC", num: 16 },
        { name: "Lewis Hamilton", code: "HAM", num: 44 }
      ]
    },
    {
      id: "mclaren", name: "McLaren", short: "MCL",
      livery: { finShape: "none", spineHeight: "dorsal", spineLogo: "panel", spineSide: "wordmark" },
      color: [1.0, 0.502, 0.0], color2: [0.122, 0.122, 0.122],     /* papaya #FF8000 / anthracite #1F1F1F */
      engine: "Mercedes", tier: 1,
      stats: { speed: 93, accel: 94, cornering: 96, braking: 91 },
      drivers: [
        { name: "Lando Norris", code: "NOR", num: 1 },             /* 2025 world champion */
        { name: "Oscar Piastri", code: "PIA", num: 81 }
      ]
    },
    {
      id: "redbull", name: "Red Bull Racing", short: "RBR",
      livery: { finShape: "none", spineHeight: "dorsal", spineLogo: "wrap", spineSide: "duo" },
      color: [0.086, 0.137, 0.294], color2: [1.0, 0.843, 0.0],     /* navy #16234B / yellow #FFD700 */
      engine: "Red Bull Ford", tier: 2,
      stats: { speed: 90, accel: 88, cornering: 91, braking: 87 },
      drivers: [
        { name: "Max Verstappen", code: "VER", num: 33 },
        { name: "Isack Hadjar", code: "HAD", num: 6 }
      ]
    },
    {
      id: "alpine", name: "Alpine", short: "ALP",
      /* spineTint must clear the blue cover (≥2:1). Launch pink #FF87BC is only
         ~1.56:1 on #0093CC and made every crown band invisible to cover-legibility. */
      livery: { finShape: "none", spineHeight: "dorsal", spineLogo: "stripe", spineSide: "band",
                spineTint: [1.0, 1.0, 1.0] },
      color: [0.0, 0.576, 0.8], color2: [1.0, 0.529, 0.737],       /* blue #0093CC / pink #FF87BC */
      engine: "Mercedes", tier: 3,
      stats: { speed: 83, accel: 80, cornering: 82, braking: 80 },
      drivers: [
        { name: "Pierre Gasly", code: "GAS", num: 10 },
        { name: "Franco Colapinto", code: "COL", num: 43 }
      ]
    },
    {
      id: "racingbulls", name: "Racing Bulls", short: "RB",
      livery: { finShape: "none", spineHeight: "dorsal", spineLogo: "streaks", spineSide: "sash",
                spineTint: [0.086, 0.204, 0.796] },
      color: [0.957, 0.941, 0.925], color2: [0.086, 0.204, 0.796], /* white #F4F0EC / blue #1634CB */
      engine: "Red Bull Ford", tier: 3,
      stats: { speed: 82, accel: 82, cornering: 81, braking: 80 },
      drivers: [
        { name: "Liam Lawson", code: "LAW", num: 40 },
        { name: "Arvid Lindblad", code: "LIN", num: 41 }
      ]
    },
    {
      id: "haas", name: "Haas", short: "HAA",
      livery: { finShape: "none", spineHeight: "dorsal", spineLogo: "panel", spineSide: "number" },
      color: [0.075, 0.078, 0.086], color2: [0.855, 0.161, 0.11],  /* dark graphite #131416 / red #DA291C (2026 dark car, white+red accents) */
      engine: "Ferrari", tier: 3,
      stats: { speed: 80, accel: 79, cornering: 79, braking: 79 },
      drivers: [
        { name: "Esteban Ocon", code: "OCO", num: 31 },
        { name: "Oliver Bearman", code: "BEA", num: 87 }
      ]
    },
    {
      id: "williams", name: "Williams", short: "WIL",
      color: [0.059, 0.235, 0.788], color2: [1.0, 1.0, 1.0],       /* blue #0F3CC9 / white */
      /* The FW48's cover is BLACK (a secondary source claimed white; the launch
         photographs and the official release say otherwise — the white is the
         sidepod and wings). docs/notes/LIVERY-2026-REFERENCE.md. */
      livery: { cover: [0.055, 0.058, 0.070], finShape: "none", spineHeight: "dorsal",
                spineLogo: "ridge", spineSide: "rake", coverBind: "independent",
                spineTint: [0.0, 0.82, 0.95], sideTint: [0.059, 0.235, 0.788] },
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
      /* titanium silver #B3B8BD / Audi red-orange #FA470D body with a CARBON
         BLACK engine cover — silver body, black cover, red accents rearward
         (~24 launch-gallery photographs and the launch report agree;
         docs/notes/LIVERY-2026-REFERENCE.md carries the sources). */
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
      /* The AMR26 wears a DARK STRIPE down the spine of a body-green cover
         (launch gallery; docs/notes/LIVERY-2026-REFERENCE.md). `spineTint`,
         not `stripe`: the band otherwise takes the LIME accent, and a dark
         `stripe` would darken the NOSE, which the photographs contradict. */
      livery: { finShape: "none", spineHeight: "dorsal", spineLogo: "stripe", spineSide: "logo",
                spineTint: [0.008, 0.086, 0.078] },
      color: [0.0, 0.349, 0.31], color2: [0.718, 0.882, 0.106],    /* green #00594F / lime accents */
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
                bodySplit: "lr" },
      color: [0.039, 0.039, 0.039], color2: [0.961, 0.961, 0.961], /* black #0A0A0A / white #F5F5F5 */
      engine: "Ferrari", tier: 4,
      stats: { speed: 73, accel: 73, cornering: 73, braking: 72 },
      drivers: [
        { name: "Sergio Perez", code: "PER", num: 11 },
        { name: "Valtteri Bottas", code: "BOT", num: 77 }
      ]
    }
  ];

  /* Top 10 race points, 2026: no fastest-lap point. */
  const POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];

  /* The pace ladder the `tier` field above indexes: ground-speed scale per
     tier, 0 fastest .. 4 slowest. game.js folds it with the career development
     multiplier into each AI car's tierV.

     Calibrated to the FASTEST era (all twenty cars inside one second in 2023
     Brazilian qualifying, ~1.4% of a lap): ~0.26% a step, 1.05% across the
     field, ~1.5% with the driver span — the old [1.0 .. 0.942] ladder put the
     field 8.64% apart, five times any real season. Compressed about the
     MEASURED FIELD MEAN (0.9631), not the table mean, so average pace is
     unchanged to the digit and the DIFF ladder in js/physics/consts.js still
     means what it is calibrated to; the tier ladder stays ~2x the driver span.
     Evidence: docs/notes/AI-FIELD-RESEARCH.md. */
  const TIER_V = [0.9695, 0.9674, 0.9648, 0.9622, 0.9594];

  /* The MY TEAM custom entry — same record shape as LIST, the seed a fresh
     apex26.customTeam save starts from (game.js loadCustomTeam). */
  const DEFAULT_CUSTOM = {
    id: "custom", name: "My Team", short: "YOU", engine: "Custom", tier: 2, custom: true,
    livery: { finShape: "none", spineHeight: "dorsal", spineLogo: "number", spineSide: "number" },
    color: [0.13, 0.79, 0.85], color2: [0.96, 0.86, 0.0],
    stats: { speed: 84, accel: 82, cornering: 83, braking: 81 },
    drivers: [{ name: "Your Name", code: "YOU", num: 99 }],
  };

  return { LIST, POINTS, TIER_V, DEFAULT_CUSTOM };
})();
Object.freeze(Teams);
