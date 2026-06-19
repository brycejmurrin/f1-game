"use strict";
/* Apex 26 — Parts catalog and stat helpers.
   Six upgrade categories: engine, aero, suspension, brakes, tyres, ers.
   Each option carries stat multipliers and a credit cost.
   Total budget: BUDGET credits. Free options cost 0.
   getMods() collapses a setup object into a single multiplier object.
   getCost() returns total credits spent for a setup.
   statMult() maps a 0-100 team stat to a 0.85-1.00 physics multiplier. */
const Parts = (function () {
  const BUDGET = 500;

  const CATALOG = [
    {
      id: "engine", label: "ENGINE",
      options: [
        { id: "stock",       label: "Stock",       cost:   0, desc: "Factory spec power unit",                         speed: 1.00, accel: 1.00 },
        { id: "performance", label: "Performance", cost:  60, desc: "Optimised for peak acceleration",                 speed: 1.00, accel: 1.09 },
        { id: "turbo",       label: "Turbo",       cost:  80, desc: "Balanced power and top speed gains",              speed: 1.03, accel: 1.06 },
        { id: "highrev",     label: "High-Rev",    cost: 100, desc: "Higher top speed, mild accel gain",               speed: 1.05, accel: 1.04 },
        { id: "race",        label: "Race",        cost: 160, desc: "Maximum power output and top speed",              speed: 1.06, accel: 1.11 },
      ],
    },
    {
      id: "aero", label: "AERO",
      options: [
        { id: "minimal",  label: "Minimal",    cost:   0, desc: "+10% top speed, heavily reduced grip",              speed: 1.10, cornering: 0.78 },
        { id: "low",      label: "Low DF",     cost:  40, desc: "+6% top speed, reduced cornering",                  speed: 1.06, cornering: 0.88 },
        { id: "medium",   label: "Medium",     cost:   0, desc: "Balanced for all circuit types",                    speed: 1.00, cornering: 1.00 },
        { id: "high",     label: "High DF",    cost:  80, desc: "−5% top speed, strong cornering grip",              speed: 0.95, cornering: 1.15 },
        { id: "extreme",  label: "Extreme DF", cost: 130, desc: "Maximum downforce — Monaco spec",                   speed: 0.89, cornering: 1.26 },
      ],
    },
    {
      id: "suspension", label: "SUSPENSION",
      options: [
        { id: "standard", label: "Standard",  cost:   0, desc: "Factory road setup",                               cornering: 1.00 },
        { id: "comfort",  label: "Comfort",   cost:   0, desc: "Softer springs, forgiving on kerbs",               cornering: 0.94 },
        { id: "sport",    label: "Sport",     cost:  50, desc: "Stiffer setup, improved cornering",                cornering: 1.08 },
        { id: "racing",   label: "Racing",    cost:  90, desc: "Track-focused, high lateral grip",                 cornering: 1.16 },
        { id: "track",    label: "Track",     cost: 130, desc: "Extreme stiffness, maximum cornering",             cornering: 1.24 },
      ],
    },
    {
      id: "brakes", label: "BRAKES",
      options: [
        { id: "standard", label: "Standard",       cost:   0, desc: "Factory steel brake discs",                   braking: 1.00 },
        { id: "sport",    label: "Sport",           cost:  40, desc: "Improved pads and discs",                    braking: 1.08 },
        { id: "carbon",   label: "Carbon",          cost:  90, desc: "F1-spec carbon composite brakes",            braking: 1.16 },
        { id: "ceramic",  label: "Carbon Ceramic",  cost: 140, desc: "Maximum stopping power, zero fade",          braking: 1.24 },
      ],
    },
    {
      id: "tyres", label: "TYRES",
      options: [
        { id: "hard",      label: "Hard",       cost:   0, desc: "Durable compound — +2% top speed, lower grip",  speed: 1.02, cornering: 0.92, accel: 0.97 },
        { id: "medium",    label: "Medium",     cost:   0, desc: "Balanced compound for all conditions",           speed: 1.00, cornering: 1.00, accel: 1.00 },
        { id: "soft",      label: "Soft",       cost:  80, desc: "+12% cornering, +4% accel, −3% top speed",      speed: 0.97, cornering: 1.12, accel: 1.04 },
        { id: "supersoft", label: "Super Soft", cost: 130, desc: "Maximum grip — aggressive tyre load",           speed: 0.94, cornering: 1.20, accel: 1.06 },
      ],
    },
    {
      id: "ers", label: "ERS",
      options: [
        { id: "standard",  label: "Standard",   cost:   0, desc: "Balanced energy recovery and deployment",        speed: 1.00, accel: 1.00 },
        { id: "harvest",   label: "Harvest",    cost:  60, desc: "Aggressive harvest: +2% top speed, −5% accel",  speed: 1.02, accel: 0.95 },
        { id: "deploy",    label: "Deploy",     cost: 100, desc: "Full deployment: +10% accel, −3% top speed",    speed: 0.97, accel: 1.10 },
        { id: "race_mode", label: "Race Mode",  cost: 150, desc: "High-output 2026 mode: +7% accel, +3% speed",  speed: 1.03, accel: 1.07 },
      ],
    },
  ];

  const DEFAULTS = {
    engine: "stock", aero: "medium", suspension: "standard",
    brakes: "standard", tyres: "medium", ers: "standard",
  };

  function getMods(setup) {
    const p = Object.assign({}, DEFAULTS, setup);
    const out = { speed: 1, accel: 1, cornering: 1, braking: 1 };
    for (const cat of CATALOG) {
      const opt = cat.options.find((o) => o.id === p[cat.id]) || cat.options[0];
      if (opt.speed     !== undefined) out.speed     *= opt.speed;
      if (opt.accel     !== undefined) out.accel     *= opt.accel;
      if (opt.cornering !== undefined) out.cornering *= opt.cornering;
      if (opt.braking   !== undefined) out.braking   *= opt.braking;
    }
    return out;
  }

  function getCost(setup) {
    const p = Object.assign({}, DEFAULTS, setup);
    let total = 0;
    for (const cat of CATALOG) {
      const opt = cat.options.find((o) => o.id === p[cat.id]) || cat.options[0];
      total += opt.cost || 0;
    }
    return total;
  }

  function statMult(stat) {
    return 0.85 + (stat / 100) * 0.15;
  }

  return { CATALOG, DEFAULTS, BUDGET, getMods, getCost, statMult };
})();
