"use strict";
/* Apex 26 — custom paint jobs (liveries).
   Each livery: { id, name, c1:[r,g,b] primary bodywork, c2:[r,g,b] accent/stripe }.
   UNIVERSAL apply to every team; BY_TEAM are team-specific specials. A team's own
   colours are the synthesized "default" livery. Consumed by game.js
   (resolveLivery + the LIVERY tab in car setup). Colours are [r,g,b] 0..1. */
const Liveries = (function () {
  // Available to every team.
  const UNIVERSAL = [
    { id: "stealth",  name: "Stealth",    c1: [0.055, 0.055, 0.065], c2: [0.62, 0.64, 0.70] },
    { id: "chrome",   name: "Chrome",     c1: [0.82, 0.85, 0.90],    c2: [0.13, 0.13, 0.16] },
    { id: "gold",     name: "Gold Rush",  c1: [0.84, 0.65, 0.15],    c2: [0.06, 0.06, 0.07] },
    { id: "carbon",   name: "Carbon Red", c1: [0.10, 0.10, 0.12],    c2: [0.90, 0.10, 0.08] },
    { id: "ice",      name: "Ice",        c1: [0.90, 0.93, 0.97],    c2: [0.05, 0.40, 0.90] },
    { id: "viper",    name: "Viper",      c1: [0.05, 0.06, 0.07],    c2: [0.30, 0.95, 0.25] },
    { id: "sunset",   name: "Sunset",     c1: [0.98, 0.42, 0.06],    c2: [0.55, 0.10, 0.45] },
    { id: "military", name: "Military",   c1: [0.28, 0.30, 0.20],    c2: [0.95, 0.55, 0.10] },
  ];
  // Per-team heritage / concept schemes.
  const BY_TEAM = {
    mercedes: [
      { id: "mer_black",  name: "Black Arrow",  c1: [0.04, 0.04, 0.05], c2: [0.0, 0.83, 0.78] },
      { id: "mer_silver", name: "Silver Arrow", c1: [0.86, 0.88, 0.90], c2: [0.0, 0.70, 0.66] },
    ],
    ferrari: [
      { id: "fer_classic", name: "Classic 412T", c1: [0.80, 0.0, 0.0],   c2: [0.96, 0.86, 0.0] },
      { id: "fer_white",   name: "Rosso Bianco", c1: [0.90, 0.03, 0.03], c2: [0.97, 0.97, 0.97] },
    ],
    mclaren: [
      { id: "mcl_stealth", name: "Stealth Papaya", c1: [0.09, 0.09, 0.10], c2: [1.0, 0.50, 0.0] },
      { id: "mcl_chrome",  name: "Chrome Papaya",  c1: [0.80, 0.82, 0.86], c2: [1.0, 0.50, 0.0] },
      { id: "mcl_rocket",  name: "Rocket Red",     c1: [0.90, 0.06, 0.05], c2: [0.10, 0.10, 0.12] },
    ],
    redbull: [
      { id: "rb_matte", name: "Matte Navy", c1: [0.05, 0.08, 0.18], c2: [0.95, 0.78, 0.0] },
      { id: "rb_holo",  name: "Holo",       c1: [0.10, 0.14, 0.42], c2: [0.90, 0.20, 0.55] },
    ],
    alpine: [
      { id: "alp_pink", name: "BWT Pink",      c1: [0.98, 0.50, 0.72], c2: [0.0, 0.55, 0.80] },
      { id: "alp_bleu", name: "Bleu de France", c1: [0.0, 0.35, 0.85], c2: [0.95, 0.95, 0.95] },
    ],
    racingbulls: [
      { id: "rbv_galaxy", name: "Galaxy", c1: [0.06, 0.07, 0.18], c2: [0.60, 0.30, 0.95] },
      { id: "rbv_snow",   name: "Snow",   c1: [0.92, 0.94, 0.97], c2: [0.10, 0.25, 0.85] },
    ],
    haas: [
      { id: "haas_black", name: "Blackout", c1: [0.06, 0.06, 0.07], c2: [0.90, 0.15, 0.10] },
      { id: "haas_steel", name: "Gunmetal", c1: [0.40, 0.42, 0.46], c2: [0.90, 0.15, 0.10] },
    ],
    williams: [
      { id: "wil_stripe",   name: "Racing Stripe", c1: [0.94, 0.95, 0.97], c2: [0.05, 0.25, 0.80] },
      { id: "wil_heritage", name: "Heritage Blue", c1: [0.07, 0.20, 0.70], c2: [0.95, 0.80, 0.15] },
    ],
    audi: [
      { id: "audi_black", name: "Vorsprung", c1: [0.06, 0.06, 0.07], c2: [0.96, 0.02, 0.22] },
      { id: "audi_titan", name: "Titanium",  c1: [0.70, 0.71, 0.74], c2: [0.96, 0.02, 0.22] },
    ],
    astonmartin: [
      { id: "amr_pink", name: "Racing Pink", c1: [0.90, 0.30, 0.55], c2: [0.05, 0.20, 0.16] },
      { id: "amr_brg",  name: "Deep BRG",    c1: [0.0, 0.24, 0.20],  c2: [0.72, 0.88, 0.11] },
    ],
    cadillac: [
      { id: "cad_usa",   name: "Americana", c1: [0.05, 0.10, 0.35], c2: [0.90, 0.10, 0.15] },
      { id: "cad_pearl", name: "Pearl",     c1: [0.93, 0.93, 0.95], c2: [0.72, 0.60, 0.20] },
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
