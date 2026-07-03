"use strict";
/* Apex 26 — custom paint jobs (liveries).
   Each livery: { id, name, c1:[r,g,b] primary bodywork, c2:[r,g,b] accent/stripe,
   stripe?:[r,g,b] optional bold centreline racing stripe,
   accent?:[r,g,b] optional TERTIARY paint colour — a distinct third colour used to
     pick out secondary accent parts (sidepod flash, halo trim, nose flash,
     engine-cover pinstripe) SEPARATELY from the main accent c2. When absent the
     car falls back to c2 for those parts, so it is fully optional and additive.
   nose?:[r,g,b] optional painted NOSE-TIP cap — a distinct-colour nose cone.
   pod?:[r,g,b]  optional bold SIDEPOD panel — the two-tone sidepod look.
   wing?:[r,g,b] optional FRONT+REAR WING flap colour (defaults to c2 = today's look).
   halo?:[r,g,b] optional cockpit-HALO hoop tint (defaults to brushed titanium).
     All four are additive and fully optional — a livery without them renders
     exactly as before. }.
   UNIVERSAL apply to every team; BY_TEAM are team-specific specials. A team's own
   colours are the synthesized "default" livery. Consumed by game.js
   (resolveLivery + the LIVERY tab in car setup). Colours are [r,g,b] 0..1. */
const Liveries = (function () {
  // Available to every team.
  const UNIVERSAL = [
    { id: "stealth",  name: "Stealth",    c1: [0.055, 0.055, 0.065], c2: [0.62, 0.64, 0.70], accent: [0.30, 0.52, 0.82] },
    { id: "chrome",   name: "Chrome",     c1: [0.82, 0.85, 0.90],    c2: [0.13, 0.13, 0.16] },
    { id: "gold",     name: "Gold Rush",  c1: [0.84, 0.65, 0.15],    c2: [0.06, 0.06, 0.07], accent: [0.96, 0.90, 0.62] },
    { id: "carbon",   name: "Carbon Red", c1: [0.10, 0.10, 0.12],    c2: [0.90, 0.10, 0.08], stripe: [0.95, 0.15, 0.10], accent: [0.92, 0.93, 0.96] },
    { id: "ice",      name: "Ice",        c1: [0.90, 0.93, 0.97],    c2: [0.05, 0.40, 0.90], accent: [0.60, 0.80, 0.95] },
    { id: "viper",    name: "Viper",      c1: [0.05, 0.06, 0.07],    c2: [0.30, 0.95, 0.25], stripe: [0.35, 1.0, 0.30], accent: [0.92, 0.94, 0.96] },
    { id: "sunset",   name: "Sunset",     c1: [0.98, 0.42, 0.06],    c2: [0.55, 0.10, 0.45], accent: [1.0, 0.82, 0.22] },
    { id: "military", name: "Military",   c1: [0.28, 0.30, 0.20],    c2: [0.95, 0.55, 0.10], accent: [0.80, 0.74, 0.52] },
    { id: "camo",     name: "Camo",       c1: [0.24, 0.28, 0.19],    c2: [0.46, 0.42, 0.30], accent: [0.86, 0.44, 0.12] },
    { id: "midnight", name: "Midnight",   c1: [0.04, 0.05, 0.12],    c2: [0.30, 0.45, 0.85], stripe: [0.55, 0.75, 1.0], accent: [0.80, 0.84, 0.92] },
    { id: "flame",    name: "Flame",      c1: [0.08, 0.07, 0.07],    c2: [0.98, 0.35, 0.03], stripe: [0.98, 0.72, 0.10], accent: [0.95, 0.96, 0.98] },
    // Stripe-forward graphic schemes — the bold centreline spine is the point.
    { id: "arrowhead", name: "Arrowhead", c1: [0.09, 0.09, 0.11],    c2: [1.0, 0.85, 0.0],   stripe: [1.0, 0.90, 0.06], accent: [0.94, 0.95, 0.98] },
    { id: "splitshot", name: "Split Shot", c1: [0.80, 0.08, 0.12],   c2: [0.05, 0.09, 0.26],  stripe: [0.95, 0.96, 0.98], accent: [0.96, 0.82, 0.14] },
    { id: "candyflip", name: "Candy Flip", c1: [0.86, 0.10, 0.55],   c2: [0.34, 0.09, 0.70],  stripe: [0.12, 0.86, 0.92], accent: [1.0, 0.90, 0.20] },
    { id: "lemans",    name: "Le Mans Hoops", c1: [0.05, 0.20, 0.72], c2: [0.95, 0.96, 0.98], stripe: [0.98, 0.55, 0.05], accent: [0.35, 0.60, 0.95] },
    { id: "twinbolt",  name: "Twin Bolt",  c1: [0.93, 0.94, 0.96],   c2: [0.05, 0.05, 0.07],  stripe: [0.90, 0.10, 0.12], accent: [0.10, 0.45, 0.85] },
    { id: "slipstream", name: "Slipstream", c1: [0.04, 0.20, 0.22],  c2: [1.0, 0.45, 0.0],    stripe: [1.0, 0.60, 0.05], accent: [0.90, 0.94, 0.95] },
    { id: "torch",     name: "Torch",      c1: [0.10, 0.04, 0.10],   c2: [0.98, 0.24, 0.42],  stripe: [1.0, 0.74, 0.16], accent: [0.95, 0.95, 0.97] },
    // Three-colour showcases — c1 body, c2 accent, bold stripe, distinct tertiary accent.
    { id: "tricircuit", name: "Tri-Circuit", c1: [0.06, 0.07, 0.10], c2: [0.0, 0.72, 0.86], stripe: [0.98, 0.96, 0.94], accent: [1.0, 0.42, 0.08] },
    { id: "prism",      name: "Prism",       c1: [0.10, 0.06, 0.20], c2: [0.95, 0.20, 0.55], stripe: [0.20, 0.80, 0.95], accent: [1.0, 0.86, 0.20] },
    { id: "tricolora",  name: "Tricolora",   c1: [0.95, 0.96, 0.98], c2: [0.90, 0.10, 0.14], stripe: [0.06, 0.55, 0.30], accent: [0.10, 0.30, 0.80] },
    // Detail showcases — exercise the optional nose / pod / wing / halo fields.
    { id: "apexworks", name: "Apex Works",  c1: [0.05, 0.06, 0.09], c2: [0.98, 0.62, 0.02], stripe: [1.0, 0.72, 0.10], accent: [0.0, 0.66, 0.90],
      nose: [0.98, 0.62, 0.02], pod: [0.0, 0.66, 0.90], wing: [0.98, 0.62, 0.02], halo: [0.90, 0.78, 0.30] },
    { id: "duotone",   name: "Duo-Tone",    c1: [0.90, 0.92, 0.95], c2: [0.06, 0.20, 0.55], stripe: [0.90, 0.14, 0.18], accent: [0.90, 0.14, 0.18],
      nose: [0.06, 0.20, 0.55], pod: [0.90, 0.14, 0.18], wing: [0.06, 0.20, 0.55] },
    { id: "neonpod",   name: "Neon Pod",    c1: [0.05, 0.05, 0.07], c2: [0.10, 0.90, 0.55], stripe: [0.12, 1.0, 0.60], accent: [0.95, 0.20, 0.60],
      pod: [0.95, 0.20, 0.60], wing: [0.10, 0.90, 0.55], halo: [0.10, 0.90, 0.55] },
    { id: "goldcrest", name: "Gold Crest",  c1: [0.04, 0.05, 0.08], c2: [0.85, 0.68, 0.28], stripe: [0.96, 0.86, 0.48], accent: [0.96, 0.86, 0.48],
      nose: [0.85, 0.68, 0.28], halo: [0.85, 0.68, 0.28], wing: [0.85, 0.68, 0.28] },
  ];
  // Per-team heritage / concept schemes.
  const BY_TEAM = {
    mercedes: [
      { id: "mer_black",  name: "Black Arrow",  c1: [0.03, 0.03, 0.04], c2: [0.0, 0.63, 0.61], stripe: [0.0, 0.78, 0.73], accent: [0.72, 0.74, 0.78] },
      { id: "mer_silver", name: "Silver Arrow", c1: [0.80, 0.83, 0.86], c2: [0.0, 0.63, 0.61], stripe: [0.04, 0.04, 0.05], accent: [0.0, 0.78, 0.73] },
      { id: "mer_petronas", name: "Petronas",   c1: [0.0, 0.28, 0.28], c2: [0.0, 0.63, 0.61], stripe: [0.78, 0.82, 0.85], accent: [0.0, 0.86, 0.78] },
      { id: "mer_star",   name: "Retro Star",   c1: [0.78, 0.81, 0.84], c2: [0.05, 0.06, 0.07], stripe: [0.0, 0.63, 0.61] },
      { id: "mer_amg",    name: "AMG Night",    c1: [0.07, 0.08, 0.10], c2: [0.0, 0.63, 0.61], stripe: [0.62, 0.64, 0.68], accent: [0.86, 0.14, 0.14] },
    ],
    ferrari: [
      { id: "fer_classic", name: "Classic 412T", c1: [0.86, 0.0, 0.0],   c2: [0.97, 0.83, 0.0], stripe: [0.98, 0.86, 0.0], accent: [0.06, 0.06, 0.08] },
      { id: "fer_white",   name: "Rosso Bianco", c1: [0.86, 0.0, 0.0],   c2: [0.97, 0.97, 0.97], stripe: [0.98, 0.98, 0.98], accent: [0.02, 0.16, 0.52] },
      { id: "fer_matte",   name: "Matte Nero",   c1: [0.06, 0.06, 0.07], c2: [0.86, 0.0, 0.0], accent: [0.90, 0.78, 0.10] },
      { id: "fer_giallo",  name: "Giallo Modena", c1: [0.97, 0.80, 0.0], c2: [0.86, 0.0, 0.0], stripe: [0.90, 0.0, 0.0], accent: [0.06, 0.06, 0.08] },
      { id: "fer_scud",    name: "Scuderia",     c1: [0.78, 0.0, 0.0],   c2: [0.05, 0.05, 0.06], stripe: [0.97, 0.83, 0.0], accent: [0.95, 0.95, 0.97] },
      { id: "fer_evo",     name: "Rosso Evo",    c1: [0.86, 0.0, 0.0],   c2: [0.05, 0.05, 0.06], accent: [0.97, 0.83, 0.0],
        nose: [0.05, 0.05, 0.06], pod: [0.97, 0.83, 0.0], wing: [0.05, 0.05, 0.06], halo: [0.86, 0.0, 0.0] },
    ],
    mclaren: [
      { id: "mcl_papaya",  name: "Papaya",        c1: [1.0, 0.50, 0.0],  c2: [0.10, 0.11, 0.13], stripe: [0.05, 0.05, 0.06], accent: [0.0, 0.62, 0.86] },
      { id: "mcl_stealth", name: "Stealth Papaya", c1: [0.09, 0.09, 0.10], c2: [1.0, 0.50, 0.0], stripe: [1.0, 0.55, 0.05], accent: [0.0, 0.62, 0.86] },
      { id: "mcl_chrome",  name: "Chrome Papaya", c1: [0.80, 0.82, 0.86], c2: [1.0, 0.50, 0.0], accent: [0.10, 0.11, 0.13] },
      { id: "mcl_rocket",  name: "Rocket Red",    c1: [0.90, 0.06, 0.05], c2: [1.0, 0.50, 0.0], stripe: [0.10, 0.10, 0.12], accent: [0.98, 0.90, 0.30] },
      { id: "mcl_gulf",    name: "Gulf",          c1: [0.42, 0.74, 0.88], c2: [0.98, 0.45, 0.02], stripe: [1.0, 0.50, 0.05], accent: [0.06, 0.16, 0.34] },
      { id: "mcl_works",   name: "Papaya Works",  c1: [1.0, 0.50, 0.0],   c2: [0.10, 0.11, 0.13], accent: [0.0, 0.62, 0.86],
        nose: [0.10, 0.11, 0.13], pod: [0.0, 0.62, 0.86], wing: [0.10, 0.11, 0.13], halo: [0.10, 0.11, 0.13] },
    ],
    redbull: [
      { id: "rb_matte",  name: "Matte Navy",  c1: [0.06, 0.10, 0.22], c2: [0.95, 0.78, 0.0], stripe: [0.82, 0.10, 0.14], accent: [0.90, 0.92, 0.95] },
      { id: "rb_holo",   name: "Holo",        c1: [0.086, 0.137, 0.294], c2: [0.90, 0.20, 0.55], stripe: [0.75, 0.30, 0.90], accent: [0.25, 0.85, 0.95] },
      { id: "rb_white",  name: "White Bull",  c1: [0.93, 0.94, 0.96], c2: [0.82, 0.10, 0.14], stripe: [0.086, 0.137, 0.294], accent: [0.95, 0.78, 0.0] },
      { id: "rb_red",    name: "Red Charge",  c1: [0.80, 0.09, 0.12], c2: [0.086, 0.137, 0.294], stripe: [0.95, 0.78, 0.0], accent: [0.94, 0.95, 0.97] },
      { id: "rb_energy", name: "Energy Blue", c1: [0.086, 0.137, 0.294], c2: [0.95, 0.78, 0.0], stripe: [0.90, 0.12, 0.16], accent: [0.20, 0.55, 0.95] },
    ],
    alpine: [
      { id: "alp_pink",  name: "BWT Pink",      c1: [1.0, 0.53, 0.74], c2: [0.0, 0.58, 0.80], stripe: [0.05, 0.06, 0.10], accent: [0.95, 0.96, 0.98] },
      { id: "alp_bleu",  name: "Bleu de France", c1: [0.0, 0.35, 0.85], c2: [0.95, 0.95, 0.95], stripe: [1.0, 0.53, 0.74], accent: [0.90, 0.14, 0.20] },
      { id: "alp_tricolore", name: "Tricolore", c1: [0.0, 0.22, 0.62], c2: [0.86, 0.10, 0.16], stripe: [0.96, 0.96, 0.98], accent: [0.12, 0.55, 0.95] },
      { id: "alp_neon",  name: "Neon Azur",     c1: [0.0, 0.58, 0.80], c2: [1.0, 0.53, 0.74], accent: [0.90, 0.96, 0.30] },
      { id: "alp_carbon", name: "Enstone Dark", c1: [0.07, 0.09, 0.13], c2: [0.0, 0.58, 0.80], stripe: [1.0, 0.53, 0.74], accent: [0.90, 0.92, 0.95] },
      { id: "alp_azur",  name: "Azur Rose",     c1: [0.0, 0.42, 0.85], c2: [1.0, 0.53, 0.74], stripe: [0.95, 0.96, 0.98], accent: [0.0, 0.72, 0.86] },
    ],
    racingbulls: [
      { id: "rbv_galaxy", name: "Galaxy",     c1: [0.06, 0.08, 0.22], c2: [0.086, 0.20, 0.80], stripe: [0.75, 0.45, 1.0], accent: [0.95, 0.40, 0.80] },
      { id: "rbv_snow",   name: "Snow",       c1: [0.95, 0.94, 0.92], c2: [0.086, 0.20, 0.80], stripe: [0.85, 0.14, 0.18], accent: [0.20, 0.55, 0.95] },
      { id: "rbv_purple", name: "Ultraviolet", c1: [0.10, 0.12, 0.42], c2: [0.086, 0.20, 0.80], stripe: [0.85, 0.14, 0.18], accent: [0.75, 0.45, 1.0] },
      { id: "rbv_navy",   name: "Navy Cadet", c1: [0.086, 0.20, 0.80], c2: [0.95, 0.94, 0.92], stripe: [0.85, 0.14, 0.18], accent: [0.40, 0.70, 1.0] },
      { id: "rbv_scarlet", name: "Scarlet Flash", c1: [0.95, 0.94, 0.92], c2: [0.85, 0.14, 0.18], stripe: [0.086, 0.20, 0.80] },
      { id: "rbv_hardline", name: "Hardline",   c1: [0.94, 0.95, 0.97], c2: [0.07, 0.13, 0.42], stripe: [0.88, 0.12, 0.16], accent: [0.20, 0.55, 0.95] },
    ],
    haas: [
      { id: "haas_black", name: "Blackout",  c1: [0.06, 0.06, 0.07], c2: [0.85, 0.16, 0.11], stripe: [0.90, 0.92, 0.94], accent: [0.70, 0.72, 0.76] },
      { id: "haas_steel", name: "Gunmetal",  c1: [0.34, 0.36, 0.40], c2: [0.85, 0.16, 0.11], stripe: [0.90, 0.92, 0.94] },
      { id: "haas_stars", name: "Stars & Stripes", c1: [0.90, 0.92, 0.94], c2: [0.85, 0.16, 0.11], stripe: [0.08, 0.16, 0.48], accent: [0.10, 0.28, 0.70] },
      { id: "haas_money", name: "Money Green", c1: [0.06, 0.32, 0.20], c2: [0.85, 0.80, 0.55], stripe: [0.85, 0.16, 0.11], accent: [0.90, 0.78, 0.30] },
      { id: "haas_red",   name: "Crimson",   c1: [0.85, 0.16, 0.11], c2: [0.08, 0.08, 0.10], stripe: [0.90, 0.92, 0.94], accent: [0.96, 0.80, 0.20] },
    ],
    williams: [
      { id: "wil_stripe",   name: "Racing Stripe", c1: [0.94, 0.95, 0.97], c2: [0.06, 0.24, 0.79], stripe: [0.06, 0.24, 0.79], accent: [0.90, 0.14, 0.20] },
      { id: "wil_heritage", name: "Heritage Blue", c1: [0.06, 0.24, 0.79], c2: [0.95, 0.80, 0.15], stripe: [0.94, 0.95, 0.97], accent: [0.90, 0.14, 0.20] },
      { id: "wil_martini",  name: "Martini",       c1: [0.94, 0.95, 0.97], c2: [0.06, 0.24, 0.79], stripe: [0.82, 0.10, 0.18], accent: [0.12, 0.40, 0.85] },
      { id: "wil_navy",     name: "Deep Navy",     c1: [0.04, 0.10, 0.30], c2: [0.06, 0.24, 0.79], stripe: [0.55, 0.70, 0.92], accent: [0.90, 0.78, 0.20] },
      { id: "wil_camo",     name: "Blue Camo",     c1: [0.06, 0.24, 0.79], c2: [0.55, 0.70, 0.92], accent: [0.90, 0.92, 0.96] },
      { id: "wil_azzurro",  name: "Azzurro",       c1: [0.03, 0.14, 0.52], c2: [0.95, 0.96, 0.98], stripe: [0.12, 0.55, 0.95], accent: [0.90, 0.78, 0.20] },
    ],
    audi: [
      { id: "audi_black", name: "Vorsprung", c1: [0.06, 0.06, 0.07], c2: [0.96, 0.02, 0.22], stripe: [0.70, 0.71, 0.74], accent: [0.92, 0.93, 0.96] },
      { id: "audi_titan", name: "Titanium",  c1: [0.70, 0.71, 0.74], c2: [0.96, 0.02, 0.22], stripe: [0.06, 0.06, 0.07] },
      { id: "audi_rings", name: "Four Rings", c1: [0.82, 0.83, 0.85], c2: [0.96, 0.02, 0.22], stripe: [0.06, 0.06, 0.07], accent: [0.50, 0.52, 0.56] },
      { id: "audi_carbon", name: "Carbon Ruby", c1: [0.09, 0.09, 0.11], c2: [0.96, 0.02, 0.22], stripe: [0.70, 0.71, 0.74], accent: [0.60, 0.02, 0.16] },
      { id: "audi_rubine", name: "Rubine",    c1: [0.96, 0.02, 0.22], c2: [0.70, 0.71, 0.74], stripe: [0.06, 0.06, 0.07], accent: [0.94, 0.94, 0.96] },
    ],
    astonmartin: [
      { id: "amr_green", name: "Racing Green", c1: [0.0, 0.35, 0.31], c2: [0.72, 0.88, 0.11], stripe: [0.05, 0.06, 0.06], accent: [0.90, 0.92, 0.90] },
      { id: "amr_pink",  name: "Racing Pink",  c1: [0.90, 0.30, 0.55], c2: [0.0, 0.35, 0.31], stripe: [0.72, 0.88, 0.11], accent: [0.95, 0.96, 0.96] },
      { id: "amr_brg",   name: "Deep BRG",     c1: [0.0, 0.24, 0.20],  c2: [0.72, 0.88, 0.11], accent: [0.82, 0.66, 0.28] },
      { id: "amr_gold",  name: "British Gold", c1: [0.0, 0.35, 0.31], c2: [0.82, 0.66, 0.28], stripe: [0.72, 0.88, 0.11], accent: [0.05, 0.06, 0.06] },
      { id: "amr_lime",  name: "Lime Night",   c1: [0.04, 0.08, 0.07], c2: [0.72, 0.88, 0.11], accent: [0.0, 0.55, 0.48] },
    ],
    cadillac: [
      { id: "cad_usa",   name: "Americana", c1: [0.05, 0.10, 0.35], c2: [0.86, 0.12, 0.16], stripe: [0.94, 0.94, 0.96], accent: [0.82, 0.68, 0.32] },
      { id: "cad_pearl", name: "Pearl",     c1: [0.93, 0.93, 0.95], c2: [0.80, 0.66, 0.30], stripe: [0.06, 0.06, 0.07], accent: [0.88, 0.78, 0.44] },
      { id: "cad_gold",  name: "Gold Luxe", c1: [0.05, 0.05, 0.06], c2: [0.80, 0.66, 0.30], stripe: [0.88, 0.78, 0.42], accent: [0.96, 0.90, 0.60] },
      { id: "cad_black", name: "Onyx",      c1: [0.03, 0.03, 0.04], c2: [0.80, 0.66, 0.30], stripe: [0.86, 0.88, 0.92] },
      { id: "cad_liberty", name: "Liberty", c1: [0.90, 0.92, 0.95], c2: [0.10, 0.18, 0.50], stripe: [0.86, 0.12, 0.16], accent: [0.82, 0.68, 0.32] },
      { id: "cad_champagne", name: "Champagne", c1: [0.04, 0.05, 0.08], c2: [0.83, 0.69, 0.34], stripe: [0.94, 0.94, 0.96], accent: [0.96, 0.90, 0.62] },
    ],
  };

  // Full option list for a team: its default first, then team specials, then the
  // universal set.
  function forTeam(team) {
    const def = { id: "default", name: "Team Livery", c1: team.color, c2: team.color2 };
    return [def].concat(BY_TEAM[team.id] || [], UNIVERSAL);
  }

  return { UNIVERSAL, BY_TEAM, forTeam };
})();
