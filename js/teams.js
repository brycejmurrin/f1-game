/* Apex 26 — Teams: hardcoded, verified 2026 grid (11 teams, 22 drivers).
   Colors are [r,g,b] floats 0..1. tier: 0 fastest .. 4 slowest. */
const Teams = (function () {
  "use strict";

  const LIST = [
    {
      id: "mercedes", name: "Mercedes-AMG Petronas", short: "MER",
      color: [0.769, 0.769, 0.769], color2: [0.0, 0.631, 0.608],   /* silver #C4C4C4 / teal #00A19B */
      engine: "Mercedes", tier: 0,
      drivers: [
        { name: "George Russell", code: "RUS", num: 63 },
        { name: "Kimi Antonelli", code: "ANT", num: 12 }
      ]
    },
    {
      id: "ferrari", name: "Scuderia Ferrari HP", short: "FER",
      color: [0.863, 0.0, 0.0], color2: [1.0, 1.0, 1.0],           /* red #DC0000 / white */
      engine: "Ferrari", tier: 1,
      drivers: [
        { name: "Charles Leclerc", code: "LEC", num: 16 },
        { name: "Lewis Hamilton", code: "HAM", num: 44 }
      ]
    },
    {
      id: "mclaren", name: "McLaren", short: "MCL",
      color: [1.0, 0.502, 0.0], color2: [0.122, 0.122, 0.122],     /* papaya #FF8000 / anthracite #1F1F1F */
      engine: "Mercedes", tier: 1,
      drivers: [
        { name: "Lando Norris", code: "NOR", num: 1 },             /* 2025 world champion */
        { name: "Oscar Piastri", code: "PIA", num: 81 }
      ]
    },
    {
      id: "redbull", name: "Red Bull Racing", short: "RBR",
      color: [0.086, 0.137, 0.294], color2: [1.0, 0.843, 0.0],     /* navy #16234B / yellow #FFD700 */
      engine: "Red Bull Ford", tier: 2,
      drivers: [
        { name: "Max Verstappen", code: "VER", num: 3 },
        { name: "Isack Hadjar", code: "HAD", num: 6 }
      ]
    },
    {
      id: "alpine", name: "Alpine", short: "ALP",
      color: [0.0, 0.576, 0.8], color2: [1.0, 0.529, 0.737],       /* blue #0093CC / pink #FF87BC */
      engine: "Mercedes", tier: 3,
      drivers: [
        { name: "Pierre Gasly", code: "GAS", num: 10 },
        { name: "Franco Colapinto", code: "COL", num: 43 }
      ]
    },
    {
      id: "racingbulls", name: "Racing Bulls", short: "RB",
      color: [0.957, 0.941, 0.925], color2: [0.086, 0.204, 0.796], /* white #F4F0EC / blue #1634CB */
      engine: "Red Bull Ford", tier: 3,
      drivers: [
        { name: "Liam Lawson", code: "LAW", num: 30 },
        { name: "Arvid Lindblad", code: "LIN", num: 41 }
      ]
    },
    {
      id: "haas", name: "Haas", short: "HAA",
      color: [1.0, 1.0, 1.0], color2: [0.855, 0.161, 0.11],        /* white #FFFFFF / red #DA291C (TGR) */
      engine: "Ferrari", tier: 3,
      drivers: [
        { name: "Esteban Ocon", code: "OCO", num: 31 },
        { name: "Oliver Bearman", code: "BEA", num: 87 }
      ]
    },
    {
      id: "williams", name: "Williams", short: "WIL",
      color: [0.059, 0.235, 0.788], color2: [1.0, 1.0, 1.0],       /* blue #0F3CC9 / white */
      engine: "Mercedes", tier: 3,
      drivers: [
        { name: "Carlos Sainz", code: "SAI", num: 55 },
        { name: "Alexander Albon", code: "ALB", num: 23 }
      ]
    },
    {
      id: "audi", name: "Audi", short: "AUD",
      color: [0.851, 0.851, 0.851], color2: [0.961, 0.02, 0.216],  /* silver #D9D9D9 / red #F50537 */
      engine: "Audi", tier: 4,
      drivers: [
        { name: "Nico Hülkenberg", code: "HUL", num: 27 },
        { name: "Gabriel Bortoleto", code: "BOR", num: 5 }
      ]
    },
    {
      id: "astonmartin", name: "Aston Martin", short: "AMR",
      color: [0.0, 0.349, 0.31], color2: [0.718, 0.882, 0.106],    /* green #00594F / lime accents */
      engine: "Honda", tier: 4,
      drivers: [
        { name: "Fernando Alonso", code: "ALO", num: 14 },
        { name: "Lance Stroll", code: "STR", num: 18 }
      ]
    },
    {
      id: "cadillac", name: "Cadillac", short: "CAD",
      color: [0.039, 0.039, 0.039], color2: [0.961, 0.961, 0.961], /* black #0A0A0A / white #F5F5F5 */
      engine: "Ferrari", tier: 4,
      drivers: [
        { name: "Sergio Perez", code: "PER", num: 11 },
        { name: "Valtteri Bottas", code: "BOT", num: 77 }
      ]
    }
  ];

  /* Top 10 race points, 2026: no fastest-lap point. */
  const POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];

  return { LIST: LIST, POINTS: POINTS };
})();
