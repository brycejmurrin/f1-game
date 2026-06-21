"use strict";
/* Apex 26 — Parts catalog and stat helpers.
   Six upgrade categories: engine, aero, suspension, brakes, tyres, ers.
   Options marked with `supplier` are exclusive to teams using that power unit.
   getMods(setup, teamEngine) / getCost(setup, teamEngine) fall back to the
   category default when a supplier-locked option doesn't match the team.
   statMult() maps a 0-100 team stat to a 0.85-1.00 physics multiplier. */
const Parts = (function () {
  const BUDGET = 600;

  const CATALOG = [
    {
      id: "engine", label: "ENGINE",
      options: [
        { id: "stock",       label: "Stock",            cost:   0, desc: "Factory spec power unit",                             speed: 1.00, accel: 1.00 },
        { id: "performance", label: "Performance",      cost:  60, desc: "Optimised mapping — peak acceleration gains",         speed: 1.00, accel: 1.09 },
        { id: "turbo",       label: "Turbo",            cost:  80, desc: "Broader power band — balanced speed and accel",       speed: 1.03, accel: 1.06 },
        { id: "highrev",     label: "High-Rev",         cost: 100, desc: "High-RPM spec — top speed focus, mild accel gain",    speed: 1.05, accel: 1.04 },
        { id: "sprint",      label: "Sprint",           cost: 140, desc: "Torque-focused unit — explosive accel, lower top speed", speed: 0.97, accel: 1.14 },
        { id: "race",        label: "Race",             cost: 160, desc: "Maximum power output across the rev range",           speed: 1.06, accel: 1.11 },
        // Manufacturer-exclusive power units — shown only when team.engine matches
        { id: "manu_mercedes", label: "AMG HPP",        cost: 200, supplier: "Mercedes",      tag: "FACTORY",
          desc: "Mercedes-AMG High Performance Powertrains — 2026 peak spec",                  speed: 1.08, accel: 1.14 },
        { id: "manu_ferrari",  label: "Ferrari 066/12", cost: 200, supplier: "Ferrari",       tag: "FACTORY",
          desc: "Scuderia Ferrari power unit — strong top speed and precision braking",         speed: 1.09, accel: 1.11, braking: 1.04 },
        { id: "manu_ford",     label: "Ford Powertrains", cost: 200, supplier: "Red Bull Ford", tag: "FACTORY",
          desc: "Ford/Red Bull 2026 unit — explosive torque delivery out of slow corners",      speed: 1.06, accel: 1.16 },
        { id: "manu_honda",    label: "Honda RA626H",   cost: 200, supplier: "Honda",         tag: "FACTORY",
          desc: "Honda RA626H — balanced power with exceptional traction assist",               speed: 1.07, accel: 1.12, cornering: 1.04 },
        { id: "manu_audi",     label: "Audi P.U.",      cost: 200, supplier: "Audi",          tag: "FACTORY",
          desc: "Audi 2026 power unit — strong braking recovery and mid-range punch",           speed: 1.07, accel: 1.12, braking: 1.06 },
        // Non-exclusive upgrades above factory level
        { id: "torque_curve",  label: "Torque Curve",  cost:  40, desc: "Rebalanced mapping — strong traction out of slow corners",           accel: 1.06, cornering: 1.03 },
        { id: "hybrid_max",    label: "Hybrid Max",    cost: 150, desc: "Full MGU-K/H synergy — broad power gains across all four metrics",   speed: 1.05, accel: 1.08, cornering: 1.03 },
        { id: "quali_engine",  label: "Quali Mode",    cost: 220, desc: "Unrestricted qualifying spec — peak power, no thermal limits",       speed: 1.10, accel: 1.09 },
      ],
    },
    {
      id: "aero", label: "AERO",
      options: [
        { id: "minimal",          label: "Minimal",         cost:   0, desc: "+10% top speed — heavily reduced downforce",       speed: 1.10, cornering: 0.78 },
        { id: "low",              label: "Low DF",          cost:  40, desc: "+6% top speed — reduced cornering grip",           speed: 1.06, cornering: 0.88 },
        { id: "medium",           label: "Medium",          cost:   0, desc: "Balanced configuration for all circuit types",     speed: 1.00, cornering: 1.00 },
        { id: "rake_setup",       label: "Rake Setup",      cost:  90, desc: "High-rear rake — improved cornering and braking",  speed: 0.97, cornering: 1.10, braking: 1.08 },
        { id: "high",             label: "High DF",         cost:  80, desc: "−5% top speed, strong cornering grip",             speed: 0.95, cornering: 1.15 },
        { id: "extreme",          label: "Extreme DF",      cost: 130, desc: "Maximum downforce — Monaco / Singapore spec",      speed: 0.89, cornering: 1.26 },
        { id: "ground_effect",    label: "Ground Effect",   cost: 170, desc: "2026 tunnel floor package — peak grip and braking", speed: 0.87, cornering: 1.32, braking: 1.10 },
        { id: "le_mans",          label: "Le Mans Trim",    cost:  80, desc: "Hypercar ultra-low drag — extreme top speed, severe grip penalty",  speed: 1.14, cornering: 0.80 },
        { id: "underfloor",       label: "Underfloor Kit",  cost: 120, desc: "Enhanced tunnel floors — high grip with less drag penalty than High DF", speed: 0.94, cornering: 1.22 },
        { id: "active_aero",      label: "Active Aero",     cost: 160, desc: "Adaptive aero surfaces — speed and cornering in one package",   speed: 1.03, cornering: 1.18 },
        { id: "diffuser",         label: "Diffuser Focus",  cost: 100, desc: "Rear diffuser package — cornering and braking bias",            speed: 0.98, cornering: 1.18, braking: 1.06 },
      ],
    },
    {
      id: "suspension", label: "SUSPENSION",
      options: [
        { id: "comfort",  label: "Comfort",    cost:   0, desc: "Softer springs — forgiving over kerbs, less cornering bite",   cornering: 0.94 },
        { id: "standard", label: "Standard",   cost:   0, desc: "Factory road setup",                                          cornering: 1.00 },
        { id: "sport",    label: "Sport",      cost:  50, desc: "Stiffer setup — improved cornering response",                  cornering: 1.08 },
        { id: "kerb_spec",label: "Kerb Spec",  cost:  70, desc: "Circuit-tuned stiffness — helps cornering and braking",       cornering: 1.11, braking: 1.05 },
        { id: "racing",   label: "Racing",     cost:  90, desc: "Track-focused — high lateral grip",                           cornering: 1.16 },
        { id: "track",    label: "Track",      cost: 130, desc: "Extreme stiffness — maximum cornering",                       cornering: 1.24 },
        { id: "active",   label: "Active",     cost: 190, desc: "Active suspension system — peak cornering, slight top speed boost", cornering: 1.28, speed: 1.02 },
        { id: "carbon_pushrods", label: "Carbon Pushrods", cost:  60, desc: "Lightweight carbon arms — quick response and braking benefit",        cornering: 1.09, braking: 1.04 },
        { id: "low_ride",        label: "Low Ride Height", cost:  80, desc: "Reduced ride height — better aero efficiency and grip",               cornering: 1.12, speed: 1.02 },
        { id: "inboard_dampers", label: "Inboard Dampers", cost: 110, desc: "Unsprung mass reduction — responsive handling and consistent braking", cornering: 1.18, braking: 1.07 },
        { id: "heave_spring",    label: "Heave Spring",    cost: 150, desc: "Aero-optimised springing — stable floor clearance under hard braking", cornering: 1.21, speed: 1.03 },
      ],
    },
    {
      id: "brakes", label: "BRAKES",
      options: [
        { id: "standard",       label: "Standard",        cost:   0, desc: "Factory steel brake discs",                        braking: 1.00 },
        { id: "sport",          label: "Sport",           cost:  40, desc: "Improved pads and discs",                          braking: 1.08 },
        { id: "endurance",      label: "Endurance",       cost:  60, desc: "Consistent fade-free braking — aids corner exit",   braking: 1.10, accel: 1.02 },
        { id: "carbon",         label: "Carbon",          cost:  90, desc: "F1-spec carbon composite brakes",                   braking: 1.16 },
        { id: "carbon_mag",     label: "Carbon-Mag",      cost: 120, desc: "Carbon-magnesium alloy — lighter, better mass dist", braking: 1.20, accel: 1.03 },
        { id: "ceramic",        label: "Carbon Ceramic",  cost: 140, desc: "Maximum stopping power — zero fade",               braking: 1.24 },
        { id: "titanium",       label: "Titanium Caliper", cost:  50, desc: "Lighter alloy calipers — better weight distribution and exit speed", braking: 1.06, accel: 1.04 },
        { id: "ventilated",     label: "Ventilated Carbon", cost: 100, desc: "Internally vented discs — consistent fade-free stopping",           braking: 1.18 },
        { id: "regen_brakes",   label: "Regen Brakes",    cost: 130, desc: "Brake-by-wire hybrid system — converts braking energy into acceleration", braking: 1.12, accel: 1.06 },
        { id: "brembo_evo",     label: "Brembo Evo",      cost: 160, desc: "Next-gen racing brake package — ultimate stopping with mass benefit",  braking: 1.26, accel: 1.04 },
      ],
    },
    {
      id: "tyres", label: "TYRES",
      options: [
        { id: "intermediate", label: "Intermediate",  cost:   0, desc: "Wet-weather compound — lower grip in dry conditions",  speed: 0.92, cornering: 0.94, accel: 0.93 },
        { id: "hard",         label: "Hard",          cost:   0, desc: "Durable compound — +2% top speed, lower grip",        speed: 1.02, cornering: 0.92, accel: 0.97 },
        { id: "medium",       label: "Medium",        cost:   0, desc: "Balanced compound for all conditions",                speed: 1.00, cornering: 1.00, accel: 1.00 },
        { id: "soft",         label: "Soft",          cost:  80, desc: "+12% cornering, +4% accel — some top speed drag",     speed: 0.97, cornering: 1.12, accel: 1.04 },
        { id: "supersoft",    label: "Super Soft",    cost: 130, desc: "High grip compound — aggressive tyre load",           speed: 0.94, cornering: 1.20, accel: 1.06 },
        { id: "qualigum",     label: "Quali Spec",    cost: 180, desc: "One-lap ultra-soft — maximum short-run grip",         speed: 0.91, cornering: 1.28, accel: 1.09 },
        { id: "compound_c4",  label: "Compound C4",   cost:  60, desc: "Pirelli's track-ready soft — reliable grip upgrade over Hard/Medium", speed: 0.98, cornering: 1.08, accel: 1.02 },
        { id: "compound_c5",  label: "Compound C5",   cost: 100, desc: "High-spec soft — aggressive grip over one stint, strong accel",       speed: 0.96, cornering: 1.15, accel: 1.05 },
        { id: "hypersoft",    label: "Hyper Soft",    cost: 200, desc: "Prototype extreme compound — maximum peak grip, very short lifespan", speed: 0.88, cornering: 1.36, accel: 1.12 },
      ],
    },
    {
      id: "ers", label: "ERS",
      options: [
        { id: "standard",       label: "Standard",      cost:   0, desc: "Balanced energy recovery and deployment",            speed: 1.00, accel: 1.00 },
        { id: "harvest",        label: "Harvest",       cost:  60, desc: "Aggressive recovery: +2% top speed, −5% accel",      speed: 1.02, accel: 0.95 },
        { id: "deploy",         label: "Deploy",        cost: 100, desc: "Full deployment: +10% accel, −3% top speed",         speed: 0.97, accel: 1.10 },
        { id: "overtake_focus", label: "OT Focus",      cost: 130, desc: "Traction-biased deploy: +12% accel, +4% cornering",  speed: 0.96, accel: 1.12, cornering: 1.04 },
        { id: "race_mode",      label: "Race Mode",     cost: 150, desc: "High-output 2026 mode: +7% accel, +3% top speed",   speed: 1.03, accel: 1.07 },
        { id: "full_attack",    label: "Full Attack",   cost: 200, desc: "Maximum ERS output — qualifying/sprint spec",       speed: 1.06, accel: 1.14 },
        { id: "regen_plus",     label: "Regen+",        cost:  70, desc: "Enhanced braking recovery — harvests extra energy under braking",    braking: 1.05, accel: 1.05 },
        { id: "mgu_k_max",      label: "MGU-K Max",     cost:  80, desc: "Dedicated kinetic unit — strong deployment burst on straights",      accel: 1.08, speed: 0.98 },
        { id: "torque_fill",    label: "Torque Fill",   cost: 120, desc: "Hybrid torque-vectoring — cornering traction and exit speed",        accel: 1.08, cornering: 1.06 },
        { id: "overcharge",     label: "Overcharge",    cost: 230, desc: "Experimental limit-push mode — maximum all-channel ERS output",      speed: 1.10, accel: 1.18 },
      ],
    },
  ];

  const DEFAULTS = {
    engine: "stock", aero: "medium", suspension: "standard",
    brakes: "standard", tyres: "medium", ers: "standard",
  };

  function _resolve(cat, setup, teamEngine) {
    const selId = setup[cat.id] !== undefined ? setup[cat.id] : DEFAULTS[cat.id];
    let opt = cat.options.find((o) => o.id === selId);
    if (opt && opt.supplier && teamEngine && opt.supplier !== teamEngine) opt = null;
    return opt || cat.options.find((o) => o.id === DEFAULTS[cat.id]) || cat.options[0];
  }

  function getMods(setup, teamEngine) {
    const p = Object.assign({}, DEFAULTS, setup);
    const out = { speed: 1, accel: 1, cornering: 1, braking: 1 };
    for (const cat of CATALOG) {
      const opt = _resolve(cat, p, teamEngine);
      if (opt.speed     !== undefined) out.speed     *= opt.speed;
      if (opt.accel     !== undefined) out.accel     *= opt.accel;
      if (opt.cornering !== undefined) out.cornering *= opt.cornering;
      if (opt.braking   !== undefined) out.braking   *= opt.braking;
    }
    return out;
  }

  function getCost(setup, teamEngine) {
    const p = Object.assign({}, DEFAULTS, setup);
    let total = 0;
    for (const cat of CATALOG) {
      total += _resolve(cat, p, teamEngine).cost || 0;
    }
    return total;
  }

  function statMult(stat) {
    return 0.85 + (stat / 100) * 0.15;
  }

  return { CATALOG, DEFAULTS, BUDGET, getMods, getCost, statMult };
})();
