"use strict";
/* Apex 26 — Parts catalog and stat helpers.
   Three upgrade categories: engine, aero, suspension.
   Each option carries multipliers for speed/accel/cornering/braking.
   getMods() collapses a {engine,aero,suspension} selection into a
   single multiplier object; statMult() maps a 0-100 team stat to a
   0.85-1.00 physics multiplier so team choice meaningfully affects pace. */
const Parts = (function () {
  const CATALOG = [
    {
      id: "engine", label: "ENGINE",
      options: [
        { id: "stock",       label: "Stock",       desc: "Factory spec power unit",           speed: 1.00, accel: 1.00 },
        { id: "performance", label: "Performance", desc: "Optimised for acceleration",        speed: 1.00, accel: 1.09 },
        { id: "highrev",     label: "High-Rev",    desc: "Higher top speed, mild accel gain", speed: 1.05, accel: 1.04 },
        { id: "race",        label: "Race",        desc: "Max power and top speed",           speed: 1.06, accel: 1.11 },
      ],
    },
    {
      id: "aero", label: "AERO",
      options: [
        { id: "low",    label: "Low DF",  desc: "+6% top speed, −12% cornering", speed: 1.06, cornering: 0.88 },
        { id: "medium", label: "Medium",  desc: "Balanced for all circuits",          speed: 1.00, cornering: 1.00 },
        { id: "high",   label: "High DF", desc: "−5% top speed, +15% cornering", speed: 0.95, cornering: 1.15 },
      ],
    },
    {
      id: "suspension", label: "SUSPENSION",
      options: [
        { id: "standard", label: "Standard", desc: "Factory setup",                cornering: 1.00, braking: 1.00 },
        { id: "sport",    label: "Sport",    desc: "+8% cornering, +7% braking",   cornering: 1.08, braking: 1.07 },
        { id: "racing",   label: "Racing",   desc: "+15% cornering, +14% braking", cornering: 1.15, braking: 1.14 },
      ],
    },
  ];

  const DEFAULTS = { engine: "stock", aero: "medium", suspension: "standard" };

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
