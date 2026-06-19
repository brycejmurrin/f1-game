"use strict";
/* Apex 26 — Parts catalog and stat helpers.
   Four upgrade categories: engine, aero, suspension, brakes.
   Each option carries multipliers for speed/accel/cornering/braking.
   getMods() collapses a setup object into a single multiplier object.
   statMult() maps a 0-100 team stat to a 0.85-1.00 physics multiplier. */
const Parts = (function () {
  const CATALOG = [
    {
      id: "engine", label: "ENGINE",
      options: [
        { id: "stock",       label: "Stock",        desc: "Factory spec power unit",              speed: 1.00, accel: 1.00 },
        { id: "performance", label: "Performance",  desc: "Optimised for peak acceleration",      speed: 1.00, accel: 1.09 },
        { id: "turbo",       label: "Turbo",        desc: "Balanced power and top speed gains",   speed: 1.03, accel: 1.06 },
        { id: "highrev",     label: "High-Rev",     desc: "Higher top speed, mild accel gain",    speed: 1.05, accel: 1.04 },
        { id: "race",        label: "Race",         desc: "Maximum power output and top speed",   speed: 1.06, accel: 1.11 },
      ],
    },
    {
      id: "aero", label: "AERO",
      options: [
        { id: "minimal",  label: "Minimal",     desc: "+10% top speed, heavily reduced grip",  speed: 1.10, cornering: 0.78 },
        { id: "low",      label: "Low DF",      desc: "+6% top speed, reduced cornering",      speed: 1.06, cornering: 0.88 },
        { id: "medium",   label: "Medium",      desc: "Balanced for all circuit types",        speed: 1.00, cornering: 1.00 },
        { id: "high",     label: "High DF",     desc: "−5% top speed, strong cornering grip",  speed: 0.95, cornering: 1.15 },
        { id: "extreme",  label: "Extreme DF",  desc: "Maximum downforce — Monaco spec",       speed: 0.89, cornering: 1.26 },
      ],
    },
    {
      id: "suspension", label: "SUSPENSION",
      options: [
        { id: "standard",  label: "Standard",   desc: "Factory road setup",                    cornering: 1.00 },
        { id: "comfort",   label: "Comfort",    desc: "Softer springs, forgiving on kerbs",    cornering: 0.94 },
        { id: "sport",     label: "Sport",      desc: "Stiffer setup, improved cornering",     cornering: 1.08 },
        { id: "racing",    label: "Racing",     desc: "Track-focused, high lateral grip",      cornering: 1.16 },
        { id: "track",     label: "Track",      desc: "Extreme stiffness, maximum cornering",  cornering: 1.24 },
      ],
    },
    {
      id: "brakes", label: "BRAKES",
      options: [
        { id: "standard",  label: "Standard",        desc: "Factory steel brake discs",               braking: 1.00 },
        { id: "sport",     label: "Sport",            desc: "Improved pads and discs",                 braking: 1.08 },
        { id: "carbon",    label: "Carbon",           desc: "F1-spec carbon composite brakes",         braking: 1.16 },
        { id: "ceramic",   label: "Carbon Ceramic",   desc: "Maximum stopping power, zero fade",       braking: 1.24 },
      ],
    },
  ];

  const DEFAULTS = { engine: "stock", aero: "medium", suspension: "standard", brakes: "standard" };

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

  function statMult(stat) {
    return 0.85 + (stat / 100) * 0.15;
  }

  return { CATALOG, DEFAULTS, getMods, statMult };
})();
