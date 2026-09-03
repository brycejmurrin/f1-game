/* Apex 26 — Teams: hardcoded, verified 2026 grid (11 teams, 22 drivers).
   Colors are [r,g,b] floats 0..1. tier: 0 fastest .. 4 slowest. */
const Teams = (function () {
  "use strict";

  const LIST = [
    {
      id: "mercedes", name: "Mercedes-AMG Petronas", short: "MER",
      color: [0.045, 0.055, 0.065], color2: [0.0, 0.706, 0.671],   /* black #0B0E10 / Petronas teal #00B4AB (2026 black car) */
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
      engine: "Ferrari", tier: 1,
      stats: { speed: 97, accel: 88, cornering: 91, braking: 92 },
      drivers: [
        { name: "Charles Leclerc", code: "LEC", num: 16 },
        { name: "Lewis Hamilton", code: "HAM", num: 44 }
      ]
    },
    {
      id: "mclaren", name: "McLaren", short: "MCL",
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
      engine: "Mercedes", tier: 3,
      stats: { speed: 82, accel: 78, cornering: 80, braking: 79 },
      drivers: [
        { name: "Carlos Sainz", code: "SAI", num: 55 },
        { name: "Alexander Albon", code: "ALB", num: 23 }
      ]
    },
    {
      id: "audi", name: "Audi", short: "AUD",
      /* black #0E0F10 / Audi red-orange #FA470D (2026 black car, red-orange +
         titanium). The hex used to read #FA4700 and did not describe the value:
         0.98 and 0.28 round to FA and 47 exactly, but 0.05 is 0D, not 00. The
         HEX is corrected rather than the float, because changing the float
         restyles a shipped livery on an inference about which of the two the
         author fat-fingered. */
      color: [0.055, 0.058, 0.065], color2: [0.98, 0.28, 0.05],
      engine: "Audi", tier: 4,
      stats: { speed: 76, accel: 74, cornering: 75, braking: 73 },
      drivers: [
        { name: "Nico Hülkenberg", code: "HUL", num: 27 },
        { name: "Gabriel Bortoleto", code: "BOR", num: 5 }
      ]
    },
    {
      id: "astonmartin", name: "Aston Martin", short: "AMR",
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
     tier, 0 fastest .. 4 slowest (~1.5% a step). game.js folds it with the
     career development multiplier into each AI car's tierV. */
  const TIER_V = [1.0, 0.988, 0.973, 0.958, 0.942];

  /* The MY TEAM custom entry — same record shape as LIST, the seed a fresh
     apex26.customTeam save starts from (game.js loadCustomTeam). */
  const DEFAULT_CUSTOM = {
    id: "custom", name: "My Team", short: "YOU", engine: "Custom", tier: 2, custom: true,
    color: [0.13, 0.79, 0.85], color2: [0.96, 0.86, 0.0],
    stats: { speed: 84, accel: 82, cornering: 83, braking: 81 },
    drivers: [{ name: "Your Name", code: "YOU", num: 99 }],
  };

  return { LIST: LIST, POINTS: POINTS, TIER_V: TIER_V, DEFAULT_CUSTOM: DEFAULT_CUSTOM };
})();
