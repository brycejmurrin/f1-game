"use strict";
/* Apex 26 — Parts catalog and stat helpers.
   Eight upgrade categories: engine, aero, suspension, brakes, tyres, ers, gearbox, fuel.
   Options marked with `supplier` are exclusive to teams using that power unit.
   getMods(setup, teamEngine) / getCost(setup, teamEngine) fall back to the
   category default when a supplier-locked option doesn't match the team.
   statMult() maps a 0-100 team stat to a 0.85-1.00 physics multiplier.
   visualTier (0=low/1=mid/2=high) drives Car3D's parts-driven geometry —
   purely cosmetic, no relation to the physics multipliers below. The
   category default is always tier 1 so an unmodified car's geometry is
   unchanged. */
const Parts = (function () {
  const BUDGET = 600;

  const CATALOG = [
    {
      id: "engine", label: "ENGINE",
      options: [
        { id: "stock",        label: "Stock",          cost:   0, desc: "Factory spec power unit",                                           speed: 1.00, accel: 1.00, visualTier: 1 },
        { id: "lean_burn",    label: "Lean Burn",      cost:  30, desc: "Efficiency-tuned mapping — fuel saving with surprising torque",     accel: 1.05, visualTier: 1 },
        { id: "performance",  label: "Performance",    cost:  60, desc: "Optimised mapping — peak acceleration gains",                       speed: 1.00, accel: 1.09, visualTier: 2 },
        { id: "v_power",      label: "V-Power Spec",   cost:  70, desc: "Premium fuel-optimised mapping — balanced speed and accel",        speed: 1.02, accel: 1.07, visualTier: 2 },
        { id: "turbo",        label: "Turbo",          cost:  80, desc: "Broader power band — balanced speed and accel",                    speed: 1.03, accel: 1.06, visualTier: 1 },
        { id: "highrev",      label: "High-Rev",       cost: 100, desc: "High-RPM spec — top speed focus, mild accel gain",                 speed: 1.05, accel: 1.04, visualTier: 1 },
        { id: "evo_kit",      label: "EVO Kit",        cost: 120, desc: "Engine evolution package — well-rounded gains across all metrics", speed: 1.04, accel: 1.07, cornering: 1.02, visualTier: 2 },
        { id: "sprint",       label: "Sprint",         cost: 140, desc: "Torque-focused unit — explosive accel, lower top speed",           speed: 0.97, accel: 1.14, visualTier: 2 },
        { id: "race",         label: "Race",           cost: 160, desc: "Maximum power output across the rev range",                        speed: 1.06, accel: 1.11, visualTier: 2 },
        // Manufacturer-exclusive power units — shown only when team.engine matches
        { id: "manu_mercedes", label: "AMG HPP",        cost: 200, supplier: "Mercedes",      tag: "FACTORY",
          desc: "Mercedes-AMG High Performance Powertrains — 2026 peak spec",                   speed: 1.08, accel: 1.14, visualTier: 2 },
        { id: "manu_ferrari",  label: "Ferrari 066/12", cost: 200, supplier: "Ferrari",       tag: "FACTORY",
          desc: "Scuderia Ferrari power unit — strong top speed and precision braking",          speed: 1.09, accel: 1.11, braking: 1.04, visualTier: 2 },
        { id: "manu_ford",     label: "Ford Powertrains", cost: 200, supplier: "Red Bull Ford", tag: "FACTORY",
          desc: "Ford/Red Bull 2026 unit — explosive torque delivery out of slow corners",       speed: 1.06, accel: 1.16, visualTier: 2 },
        { id: "manu_honda",    label: "Honda RA626H",   cost: 200, supplier: "Honda",         tag: "FACTORY",
          desc: "Honda RA626H — balanced power with exceptional traction assist",                speed: 1.07, accel: 1.12, cornering: 1.04, visualTier: 2 },
        { id: "manu_audi",     label: "Audi P.U.",      cost: 200, supplier: "Audi",          tag: "FACTORY",
          desc: "Audi 2026 power unit — strong braking recovery and mid-range punch",            speed: 1.07, accel: 1.12, braking: 1.06, visualTier: 2 },
        // Non-exclusive upgrades above factory level
        { id: "torque_curve",  label: "Torque Curve",  cost:  40, desc: "Rebalanced mapping — strong traction out of slow corners",        accel: 1.06, cornering: 1.03, visualTier: 1 },
        { id: "hybrid_max",    label: "Hybrid Max",    cost: 150, desc: "Full MGU-K/H synergy — broad power gains across all four metrics", speed: 1.05, accel: 1.08, cornering: 1.03, visualTier: 2 },
        { id: "quali_engine",  label: "Quali Mode",    cost: 220, desc: "Unrestricted qualifying spec — peak power, no thermal limits",    speed: 1.10, accel: 1.09, visualTier: 2 },
      ],
    },
    {
      id: "aero", label: "AERO",
      options: [
        { id: "minimal",       label: "Minimal",        cost:   0, desc: "+10% top speed — heavily reduced downforce",                     speed: 1.10, cornering: 0.78, visualTier: 0 },
        { id: "le_mans",       label: "Le Mans Trim",   cost:  80, desc: "Hypercar ultra-low drag — extreme top speed, severe grip penalty", speed: 1.14, cornering: 0.80, visualTier: 0 },
        { id: "low",           label: "Low DF",         cost:  40, desc: "+6% top speed — reduced cornering grip",                         speed: 1.06, cornering: 0.88, visualTier: 0 },
        { id: "s_duct",        label: "S-Duct",         cost:  60, desc: "Shaped duct package — front aero efficiency with grip trade-off", speed: 1.04, cornering: 0.93, visualTier: 0 },
        { id: "medium",        label: "Medium",         cost:   0, desc: "Balanced configuration for all circuit types",                   speed: 1.00, cornering: 1.00, visualTier: 1 },
        { id: "beam_wing",     label: "Beam Wing",      cost:  50, desc: "Rear beam wing — cornering and braking from low-drag base",      speed: 0.99, cornering: 1.07, braking: 1.04, visualTier: 2 },
        { id: "rake_setup",    label: "Rake Setup",     cost:  90, desc: "High-rear rake — improved cornering and braking",                speed: 0.97, cornering: 1.10, braking: 1.08, visualTier: 2 },
        { id: "diffuser",      label: "Diffuser Focus", cost: 100, desc: "Rear diffuser package — cornering and braking bias",             speed: 0.98, cornering: 1.18, braking: 1.06, visualTier: 2 },
        { id: "high",          label: "High DF",        cost:  80, desc: "−5% top speed, strong cornering grip",                          speed: 0.95, cornering: 1.15, visualTier: 2 },
        { id: "underfloor",    label: "Underfloor Kit", cost: 120, desc: "Enhanced tunnel floors — high grip with less drag penalty",      speed: 0.94, cornering: 1.22, visualTier: 2 },
        { id: "extreme",       label: "Extreme DF",     cost: 130, desc: "Maximum downforce — Monaco / Singapore spec",                   speed: 0.89, cornering: 1.26, visualTier: 2 },
        { id: "active_aero",   label: "Active Aero",    cost: 160, desc: "Adaptive aero surfaces — speed and cornering in one package",    speed: 1.03, cornering: 1.18, visualTier: 2 },
        { id: "ground_effect", label: "Ground Effect",  cost: 170, desc: "2026 tunnel floor package — peak grip and braking",              speed: 0.87, cornering: 1.32, braking: 1.10, visualTier: 2 },
      ],
    },
    {
      id: "suspension", label: "SUSPENSION",
      options: [
        { id: "comfort",         label: "Comfort",         cost:   0, desc: "Softer springs — forgiving over kerbs, less cornering bite",            cornering: 0.94, visualTier: 0 },
        { id: "standard",        label: "Standard",        cost:   0, desc: "Factory road setup",                                                    cornering: 1.00, visualTier: 1 },
        { id: "sport",           label: "Sport",           cost:  50, desc: "Stiffer setup — improved cornering response",                            cornering: 1.08, visualTier: 2 },
        { id: "carbon_pushrods", label: "Carbon Pushrods", cost:  60, desc: "Lightweight carbon arms — quick response and braking benefit",           cornering: 1.09, braking: 1.04, visualTier: 2 },
        { id: "kerb_spec",       label: "Kerb Spec",       cost:  70, desc: "Circuit-tuned stiffness — helps cornering and braking",                  cornering: 1.11, braking: 1.05, visualTier: 2 },
        { id: "low_ride",        label: "Low Ride Height", cost:  80, desc: "Reduced ride height — better aero efficiency and grip",                  cornering: 1.12, speed: 1.02, visualTier: 2 },
        { id: "racing",          label: "Racing",          cost:  90, desc: "Track-focused — high lateral grip",                                      cornering: 1.16, visualTier: 2 },
        { id: "triple_damper",   label: "Triple Damper",   cost: 100, desc: "Three-stage damper system — precise compliance across all corner phases", cornering: 1.17, speed: 1.01, visualTier: 2 },
        { id: "titanium_spring", label: "Titanium Spring", cost: 110, desc: "Ultra-light titanium coils — mass reduction with stiffer cornering",     cornering: 1.19, accel: 1.02, visualTier: 2 },
        { id: "inboard_dampers", label: "Inboard Dampers", cost: 110, desc: "Unsprung mass reduction — responsive handling and consistent braking",   cornering: 1.18, braking: 1.07, visualTier: 2 },
        { id: "track",           label: "Track",           cost: 130, desc: "Extreme stiffness — maximum cornering",                                  cornering: 1.24, visualTier: 2 },
        { id: "heave_spring",    label: "Heave Spring",    cost: 150, desc: "Aero-optimised springing — stable floor clearance under hard braking",   cornering: 1.21, speed: 1.03, visualTier: 2 },
        { id: "active",          label: "Active",          cost: 190, desc: "Active suspension system — peak cornering, slight top speed boost",       cornering: 1.28, speed: 1.02, visualTier: 2 },
      ],
    },
    {
      id: "brakes", label: "BRAKES",
      options: [
        { id: "standard",    label: "Standard",         cost:   0, desc: "Factory steel brake discs",                                                 braking: 1.00, visualTier: 1 },
        { id: "drilled",     label: "Drilled Steel",    cost:  30, desc: "Cross-drilled steel discs — improved heat management",                      braking: 1.05, visualTier: 1 },
        { id: "sport",       label: "Sport",            cost:  40, desc: "Improved pads and discs",                                                   braking: 1.08, visualTier: 2 },
        { id: "titanium",    label: "Titanium Caliper", cost:  50, desc: "Lighter alloy calipers — better weight distribution and exit speed",        braking: 1.06, accel: 1.04, visualTier: 1 },
        { id: "endurance",   label: "Endurance",        cost:  60, desc: "Consistent fade-free braking — aids corner exit",                           braking: 1.10, accel: 1.02, visualTier: 2 },
        { id: "dual_caliper",label: "Dual Caliper",     cost:  80, desc: "Twin-piston caliper setup — stronger bite with improved exit traction",     braking: 1.13, accel: 1.02, visualTier: 2 },
        { id: "carbon",      label: "Carbon",           cost:  90, desc: "F1-spec carbon composite brakes",                                           braking: 1.16, visualTier: 2 },
        { id: "ventilated",  label: "Ventilated Carbon",cost: 100, desc: "Internally vented discs — consistent fade-free stopping",                   braking: 1.18, visualTier: 2 },
        { id: "carbon_mag",  label: "Carbon-Mag",       cost: 120, desc: "Carbon-magnesium alloy — lighter, better mass dist",                        braking: 1.20, accel: 1.03, visualTier: 2 },
        { id: "regen_brakes",label: "Regen Brakes",     cost: 130, desc: "Brake-by-wire hybrid system — converts braking energy into acceleration",   braking: 1.12, accel: 1.06, visualTier: 2 },
        { id: "ceramic",     label: "Carbon Ceramic",   cost: 140, desc: "Maximum stopping power — zero fade",                                        braking: 1.24, visualTier: 2 },
        { id: "brembo_evo",  label: "Brembo Evo",       cost: 160, desc: "Next-gen racing brake package — ultimate stopping with mass benefit",        braking: 1.26, accel: 1.04, visualTier: 2 },
      ],
    },
    {
      id: "tyres", label: "TYRES",
      options: [
        { id: "intermediate", label: "Intermediate",  cost:   0, desc: "Wet-weather compound — lower grip in dry conditions",                         speed: 0.92, cornering: 0.94, accel: 0.93, visualTier: 0 },
        { id: "hard",         label: "Hard",          cost:   0, desc: "Durable compound — +2% top speed, lower grip",                               speed: 1.02, cornering: 0.92, accel: 0.97, visualTier: 0 },
        { id: "medium",       label: "Medium",        cost:   0, desc: "Balanced compound for all conditions",                                        speed: 1.00, cornering: 1.00, accel: 1.00, visualTier: 1 },
        { id: "slick_track",  label: "Slick Track",   cost:  40, desc: "Pure dry-weather slick — optimised compound structure",                       speed: 1.01, cornering: 1.04, accel: 1.01, visualTier: 1 },
        { id: "compound_c4",  label: "Compound C4",   cost:  60, desc: "Pirelli's track-ready soft — reliable grip upgrade over Hard/Medium",         speed: 0.98, cornering: 1.08, accel: 1.02, visualTier: 2 },
        { id: "soft",         label: "Soft",          cost:  80, desc: "+12% cornering, +4% accel — some top speed drag",                            speed: 0.97, cornering: 1.12, accel: 1.04, visualTier: 2 },
        { id: "compound_c5",  label: "Compound C5",   cost: 100, desc: "High-spec soft — aggressive grip over one stint, strong accel",               speed: 0.96, cornering: 1.15, accel: 1.05, visualTier: 2 },
        { id: "supersoft",    label: "Super Soft",    cost: 130, desc: "High grip compound — aggressive tyre load",                                   speed: 0.94, cornering: 1.20, accel: 1.06, visualTier: 2 },
        { id: "p_zero_red",   label: "P Zero Red",    cost: 160, desc: "Custom Pirelli high-performance compound — between Super Soft and Quali",     speed: 0.92, cornering: 1.24, accel: 1.07, visualTier: 2 },
        { id: "qualigum",     label: "Quali Spec",    cost: 180, desc: "One-lap ultra-soft — maximum short-run grip",                                 speed: 0.91, cornering: 1.28, accel: 1.09, visualTier: 2 },
        { id: "hypersoft",    label: "Hyper Soft",    cost: 200, desc: "Prototype extreme compound — maximum peak grip, very short lifespan",          speed: 0.88, cornering: 1.36, accel: 1.12, visualTier: 2 },
      ],
    },
    {
      id: "ers", label: "ERS",
      options: [
        { id: "standard",       label: "Standard",      cost:   0, desc: "Balanced energy recovery and deployment",                                    speed: 1.00, accel: 1.00, visualTier: 1 },
        { id: "regen_plus",     label: "Regen+",        cost:  70, desc: "Enhanced braking recovery — harvests extra energy under braking",            braking: 1.05, accel: 1.05, visualTier: 1 },
        { id: "harvest",        label: "Harvest",       cost:  60, desc: "Aggressive recovery: +2% top speed, −5% accel",                             speed: 1.02, accel: 0.95, visualTier: 0 },
        { id: "split_deploy",   label: "Split Deploy",  cost:  90, desc: "Per-axle deployment control — improved cornering traction and accel",        accel: 1.06, cornering: 1.04, visualTier: 1 },
        { id: "mgu_k_max",      label: "MGU-K Max",     cost:  80, desc: "Dedicated kinetic unit — strong deployment burst on straights",              accel: 1.08, speed: 0.98, visualTier: 2 },
        { id: "deploy",         label: "Deploy",        cost: 100, desc: "Full deployment: +10% accel, −3% top speed",                                speed: 0.97, accel: 1.10, visualTier: 2 },
        { id: "thermal_max",    label: "Thermal Max",   cost: 110, desc: "Heat energy recovery focus — speed gains with consistent braking",           speed: 1.04, braking: 1.03, visualTier: 1 },
        { id: "torque_fill",    label: "Torque Fill",   cost: 120, desc: "Hybrid torque-vectoring — cornering traction and exit speed",                accel: 1.08, cornering: 1.06, visualTier: 2 },
        { id: "overtake_focus", label: "OT Focus",      cost: 130, desc: "Traction-biased deploy: +12% accel, +4% cornering",                         speed: 0.96, accel: 1.12, cornering: 1.04, visualTier: 2 },
        { id: "race_mode",      label: "Race Mode",     cost: 150, desc: "High-output 2026 mode: +7% accel, +3% top speed",                           speed: 1.03, accel: 1.07, visualTier: 2 },
        { id: "full_attack",    label: "Full Attack",   cost: 200, desc: "Maximum ERS output — qualifying/sprint spec",                               speed: 1.06, accel: 1.14, visualTier: 2 },
        { id: "overcharge",     label: "Overcharge",    cost: 230, desc: "Experimental limit-push mode — maximum all-channel ERS output",              speed: 1.10, accel: 1.18, visualTier: 2 },
      ],
    },
    {
      id: "gearbox", label: "GEARBOX",
      options: [
        { id: "standard",      label: "Standard",       cost:   0, desc: "Factory sequential 8-speed — baseline shift performance",                    speed: 1.00, accel: 1.00, visualTier: 1 },
        { id: "close_ratio",   label: "Close Ratio",    cost:  50, desc: "Tighter gear spacing — stronger drive out of slow corners",                  accel: 1.06, speed: 0.98, visualTier: 1 },
        { id: "long_ratio",    label: "Long Ratio",     cost:  40, desc: "Wider gear spacing — improved top speed on power circuits",                  speed: 1.04, accel: 0.97, visualTier: 1 },
        { id: "short_stack",   label: "Short Stack",    cost:  70, desc: "Extra-short first gear — explosive launch and corner exit traction",         accel: 1.08, cornering: 1.03, visualTier: 2 },
        { id: "sequential_pro",label: "Sequential Pro", cost:  90, desc: "Faster shift times — reduced power interruption through the rev range",      accel: 1.07, speed: 1.02, visualTier: 2 },
        { id: "carbon_case",   label: "Carbon Case",    cost: 130, desc: "Lightweight carbon housing — mass reduction improves accel and handling",     accel: 1.08, speed: 1.02, cornering: 1.02, visualTier: 2 },
        { id: "f1_spec",       label: "F1 Spec",        cost: 180, desc: "Race-validated paddle-shift unit — peak response and powerflow efficiency",   speed: 1.04, accel: 1.10, cornering: 1.03, visualTier: 2 },
      ],
    },
    {
      id: "fuel", label: "FUEL",
      options: [
        { id: "standard",      label: "Standard",       cost:   0, desc: "Baseline pump-spec fuel — meets FIA minimum grade",                          speed: 1.00, accel: 1.00, visualTier: 1 },
        { id: "high_octane",   label: "High Octane",    cost:  40, desc: "Higher octane blend — cleaner combustion and accel improvement",             accel: 1.05, visualTier: 1 },
        { id: "biofuel",       label: "Biofuel 100",    cost:  50, desc: "FIA-sustainable 100% biofuel — consistent burn and slight braking gain",     braking: 1.04, accel: 1.03, visualTier: 1 },
        { id: "race_blend",    label: "Race Blend",     cost:  90, desc: "F1-regulation compound — refined energy density for speed and accel",        speed: 1.02, accel: 1.06, visualTier: 1 },
        { id: "quali_mix",     label: "Qualifying Mix", cost: 150, desc: "Maximum energy density — qualifying-spec fuel load for peak performance",    speed: 1.04, accel: 1.08, visualTier: 2 },
        { id: "custom_formula",label: "Custom Formula", cost: 200, desc: "Team-developed proprietary blend — marginal all-metric gains",               speed: 1.05, accel: 1.09, cornering: 1.02, braking: 1.02, visualTier: 2 },
      ],
    },
  ];

  const DEFAULTS = {
    engine: "stock", aero: "medium", suspension: "standard",
    brakes: "standard", tyres: "medium", ers: "standard",
    gearbox: "standard", fuel: "standard",
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

  // getVisualTiers(setup, teamEngine) -> { engine:0|1|2, aero:0|1|2, ... } —
  // the resolved cosmetic tier per category, consumed by Car3D.build(opts.parts)
  // to drive the parts-driven visual redesign. Mirrors getMods()'s resolution
  // loop exactly (same _resolve(), same supplier-lock fallback) so an option
  // that's invisible in the setup UI (locked out by engine supplier) can never
  // resolve to a visual tier either. Untagged options (shouldn't happen — every
  // CATALOG option above carries visualTier) fall back to 1, the neutral/default
  // tier, so a missing tag can never produce an unexpected geometry change.
  function getVisualTiers(setup, teamEngine) {
    const p = Object.assign({}, DEFAULTS, setup);
    const out = {};
    const ids = {};
    for (const cat of CATALOG) {
      const opt = _resolve(cat, p, teamEngine);
      out[cat.id] = opt.visualTier != null ? opt.visualTier : 1;
      ids[cat.id] = opt.id;
    }
    // Resolved option id per category — lets Car3D drive per-OPTION visuals
    // (e.g. Pirelli tyre-compound colours) beyond the coarse 0/1/2 tier. The
    // tier lookups above are unchanged; this rides along under a reserved key.
    out._ids = ids;
    return out;
  }

  return { CATALOG, DEFAULTS, BUDGET, getMods, getCost, getVisualTiers, statMult };
})();
