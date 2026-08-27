"use strict";
/* Apex 26 — Parts catalog and stat helpers. Twelve upgrade categories; supplier-locked options fall back via getMods/getCost; statMult() maps 0–100 team stats to 0.85–1.00; visualTier drives Car3D geometry only; SIGNATURE options clone `equivalent` for mesh identity — see FACTORY_PRESETS. */
const Parts = (function () {
  const BUDGET = 600;

  const CATALOG = [
    {
      id: "engine", label: "ENGINE",
      options: [
        { id: "stock",        label: "Stock",          cost:   0, desc: "Factory spec power unit",                                           speed: 1.00, accel: 1.00, visual: { in: 0.85, inlet: 1, outlet: 1, podWidth: 1, shoulderHeight: 1, undercut: 1, coke: 1, tailWidth: 1, coverHeight: 1, servicePanel: 1, heatShield: 1 }, visualTier: 1 },
        { id: "lean_burn",    label: "Lean Burn",      cost:  30, desc: "Efficiency-tuned mapping — fuel saving with surprising torque",     accel: 1.05, visual: {"in": 0.72, "inlet": 0, "outlet": 0, podWidth: 0.88, shoulderHeight: 0.92, undercut: 1.18, coke: 1.15, tailWidth: 0.88, coverHeight: 0.90}, visualTier: 1 },
        { id: "performance",  label: "Performance",    cost:  60, desc: "Optimised mapping — peak acceleration gains",                       speed: 1.00, accel: 1.09, visual: {"in": 1.15, "twin": 1, "inlet": 2, "outlet": 1, podWidth: 1.08, shoulderHeight: 1.12, undercut: 0.90, coke: 0.94, tailWidth: 1.08, coverHeight: 1.07}, visualTier: 2 },
        { id: "v_power",      label: "V-Power Spec",   cost:  70, desc: "Premium fuel-optimised mapping — balanced speed and accel",        speed: 1.02, accel: 1.07, visual: {"in": 1.1, "twin": 1, "inlet": 2, "outlet": 1, podWidth: 1.04, shoulderHeight: 1.08, undercut: 0.96, coke: 1.02, tailWidth: 1.04, coverHeight: 1.03}, visualTier: 2 },
        { id: "turbo",        label: "Turbo",          cost:  80, desc: "Broader power band — balanced speed and accel",                    speed: 1.03, accel: 1.06, visual: {"in": 1.35, "snork": 1, "inlet": 2, "outlet": 2, podWidth: 1.13, shoulderHeight: 1.18, undercut: 0.86, coke: 0.92, tailWidth: 1.12, coverHeight: 1.12}, visualTier: 1 },
        { id: "highrev",      label: "High-Rev",       cost: 100, desc: "High-RPM spec — top speed focus, mild accel gain",                 speed: 1.05, accel: 1.04, visual: {"in": 1.25, "snork": 1, "inlet": 3, "outlet": 2, podWidth: 1.06, shoulderHeight: 1.14, undercut: 0.92, coke: 1.08, tailWidth: 0.96, coverHeight: 1.16}, visualTier: 1 },
        { id: "evo_kit",      label: "EVO Kit",        cost: 120, desc: "Engine evolution package — well-rounded gains across all metrics", speed: 1.04, accel: 1.07, cornering: 1.02, visual: {"in": 1.2, "twin": 1, "inlet": 2, "outlet": 1, podWidth: 1.10, shoulderHeight: 1.10, undercut: 0.88, coke: 0.98, tailWidth: 1.06, coverHeight: 1.09}, visualTier: 2 },
        { id: "sprint",       label: "Sprint",         cost: 140, desc: "Torque-focused unit — explosive accel, lower top speed",           speed: 0.97, accel: 1.14, visual: {"in": 1.15, "twin": 1, "inlet": 3, "outlet": 2, podWidth: 1.12, shoulderHeight: 1.16, undercut: 0.84, coke: 0.90, tailWidth: 1.10, coverHeight: 1.11}, visualTier: 2 },
        { id: "race",         label: "Race",           cost: 160, desc: "Maximum power output across the rev range",                        speed: 1.06, accel: 1.11, visual: {"in": 1.55, "snork": 1, "twin": 1, "inlet": 3, "outlet": 3, podWidth: 1.16, shoulderHeight: 1.20, undercut: 0.82, coke: 0.88, tailWidth: 1.14, coverHeight: 1.18}, visualTier: 2 },
        { id: "split_turbo",  label: "Split Turbo",    cost: 180, desc: "Separated compressor layout — sharp response with strong terminal speed",   speed: 1.06, accel: 1.12, visual: { in: 1.42, snork: 1, twin: 0, inlet: 3, outlet: 2, podWidth: 1.09, shoulderHeight: 1.13, undercut: 1.04, coke: 0.86, tailWidth: 1.02, coverHeight: 1.14 }, visualTier: 2 },
        // Manufacturer-exclusive power units — shown only when team.engine matches
        { id: "manu_mercedes", label: "AMG HPP",        cost: 200, supplier: "Mercedes",      tag: "FACTORY",
          desc: "Mercedes-AMG High Performance Powertrains — 2026 peak spec",                   speed: 1.08, accel: 1.14, visual: {"in": 1.55, "snork": 1, "twin": 1, "inlet": 2, "outlet": 2, podWidth: 0.78, shoulderHeight: 0.96, undercut: 1.28, coke: 1.28, tailWidth: 0.76, coverHeight: 0.94, scoopLip: 2}, visualTier: 2 },
        { id: "manu_ferrari",  label: "Ferrari 066/12", cost: 200, supplier: "Ferrari",       tag: "FACTORY",
          desc: "Scuderia Ferrari power unit — strong top speed and precision braking",          speed: 1.09, accel: 1.11, braking: 1.04, visual: {"in": 1.58, "snork": 1, "twin": 1, "inlet": 3, "outlet": 3, podWidth: 1.18, shoulderHeight: 1.22, undercut: 0.80, coke: 0.86, tailWidth: 1.16, coverHeight: 1.20, scoopLip: 1}, visualTier: 2 },
        { id: "manu_ford",     label: "Ford Powertrains", cost: 200, supplier: "Red Bull Ford", tag: "FACTORY",
          desc: "Ford/Red Bull 2026 unit — explosive torque delivery out of slow corners",       speed: 1.06, accel: 1.16, visual: {"in": 1.5, "snork": 1, "twin": 1, "inlet": 2, "outlet": 2, podWidth: 1.14, shoulderHeight: 1.19, undercut: 0.83, coke: 0.89, tailWidth: 1.12, coverHeight: 1.16, scoopLip: 1}, visualTier: 2 },
        { id: "manu_honda",    label: "Honda RA626H",   cost: 200, supplier: "Honda",         tag: "FACTORY",
          desc: "Honda RA626H — balanced power with exceptional traction assist",                speed: 1.07, accel: 1.12, cornering: 1.04, visual: {"in": 1.5, "snork": 1, "twin": 1, "inlet": 3, "outlet": 3, podWidth: 1.11, shoulderHeight: 1.17, undercut: 0.87, coke: 0.93, tailWidth: 1.08, coverHeight: 1.15, scoopLip: 1}, visualTier: 2 },
        { id: "manu_audi",     label: "Audi P.U.",      cost: 200, supplier: "Audi",          tag: "FACTORY",
          desc: "Audi 2026 power unit — strong braking recovery and mid-range punch",            speed: 1.07, accel: 1.12, braking: 1.06, visual: {"in": 1.48, "snork": 1, "twin": 1, "inlet": 2, "outlet": 2, podWidth: 1.07, shoulderHeight: 1.13, undercut: 0.94, coke: 1.00, tailWidth: 0.98, coverHeight: 1.12, scoopLip: 2}, visualTier: 2 },
        // Non-exclusive upgrades above factory level
        { id: "torque_curve",  label: "Torque Curve",  cost:  40, desc: "Rebalanced mapping — strong traction out of slow corners",        accel: 1.06, cornering: 1.03, visual: {"in": 1.0, "inlet": 1, "outlet": 1, podWidth: 0.98, shoulderHeight: 1.04, undercut: 1.02, coke: 1.06, tailWidth: 0.95, coverHeight: 1.00}, visualTier: 1 },
        { id: "hybrid_max",    label: "Hybrid Max",    cost: 150, desc: "Full MGU-K/H synergy — broad power gains across all four metrics", speed: 1.05, accel: 1.08, cornering: 1.03, visual: {"in": 1.3, "snork": 1, "twin": 1, "inlet": 2, "outlet": 2, podWidth: 1.08, shoulderHeight: 1.15, undercut: 0.89, coke: 0.95, tailWidth: 1.06, coverHeight: 1.13}, visualTier: 2 },
        { id: "sig_mercedes_zero", label: "Zero-Sidepod PU", cost: 150, teams: ["mercedes"], tag: "SIGNATURE", equivalent: "hybrid_max",
          desc: "Mercedes signature compact installation — Hybrid Max performance in a tighter cooling form", speed: 1.05, accel: 1.08, cornering: 1.03, visual: { in: 1.38, snork: 1, twin: 1, inlet: 2, outlet: 3, podWidth: 0.72, shoulderHeight: 0.90, undercut: 1.35, coke: 1.34, tailWidth: 0.70, coverHeight: 0.90 , scoopLip: 2}, visualTier: 2 },
        { id: "quali_engine",  label: "Quali Mode",    cost: 220, desc: "Unrestricted qualifying spec — peak power, no thermal limits",    speed: 1.10, accel: 1.09, visual: {"in": 1.65, "snork": 1, "twin": 1, "inlet": 3, "outlet": 3, podWidth: 1.20, shoulderHeight: 1.24, undercut: 0.78, coke: 0.84, tailWidth: 1.18, coverHeight: 1.22}, visualTier: 2 },
        // Cooling-layout units — the `chimney` stacks are the visual tell.
        { id: "chimney_spec",  label: "Chimney Spec",  cost:  90, desc: "Open-cooling installation — runs hot mappings safely for strong acceleration", accel: 1.08, speed: 1.01, visual: { in: 1.22, snork: 0, twin: 0, inlet: 2, outlet: 2, podWidth: 1.03, shoulderHeight: 1.05, undercut: 0.97, coke: 1.05, tailWidth: 1.01, coverHeight: 1.06, chimney: 3 }, visualTier: 1 },
        { id: "sealed_pod",    label: "Sealed Bodywork", cost: 110, desc: "Fully closed cooling — minimum drag from a tightly packaged installation", speed: 1.06, accel: 1.02, visual: { in: 0.96, snork: 0, twin: 0, inlet: 1, outlet: 1, podWidth: 0.84, shoulderHeight: 0.94, undercut: 1.22, coke: 1.20, tailWidth: 0.82, coverHeight: 0.96, chimney: 0 }, visualTier: 1 },
        { id: "plenum_max",    label: "Plenum Max",    cost: 170, desc: "Oversized airbox plenum — deep breathing across the whole rev range",   speed: 1.07, accel: 1.09, visual: { in: 1.72, snork: 1, twin: 1, inlet: 3, outlet: 2, podWidth: 1.11, shoulderHeight: 1.21, undercut: 0.85, coke: 0.96, tailWidth: 1.09, coverHeight: 1.19, chimney: 1 }, visualTier: 2 },
        { id: "sig_mclaren_pu", label: "Woking Hybrid", cost: 150, teams: ["mclaren"], tag: "SIGNATURE", equivalent: "hybrid_max",
          desc: "McLaren signature hybrid — Hybrid Max performance with 1 cooling chimney", speed: 1.05, accel: 1.08, cornering: 1.03, visual: { in: 1.3, snork: 1, twin: 1, inlet: 2, outlet: 2, podWidth: 1.037, shoulderHeight: 1.122, undercut: 0.908, coke: 0.988, tailWidth: 1.026, coverHeight: 1.107, chimney: 1 , scoopLip: 1}, visualTier: 2 },
        { id: "sig_alpine_pu", label: "Enstone Hybrid", cost: 60, teams: ["alpine"], tag: "SIGNATURE", equivalent: "performance",
          desc: "Alpine signature hybrid — Performance spec with 3 cooling chimneys", speed: 1.00, accel: 1.09, visual: { in: 1.15, twin: 1, inlet: 2, outlet: 1, podWidth: 1.102, shoulderHeight: 1.133, undercut: 0.927, coke: 0.996, tailWidth: 1.097, coverHeight: 1.081, chimney: 3 , scoopLip: 1}, visualTier: 2 },
        { id: "sig_racingbulls_pu", label: "Faenza Hybrid", cost: 40, teams: ["racingbulls"], tag: "SIGNATURE", equivalent: "torque_curve",
          desc: "Racing Bulls signature hybrid — Torque Curve performance with 1 cooling chimney", accel: 1.06, cornering: 1.03, visual: { in: 1, inlet: 1, outlet: 1, podWidth: 0.921, shoulderHeight: 1.003, undercut: 1.061, coke: 1.145, tailWidth: 0.904, coverHeight: 0.97, chimney: 1 , scoopLip: 1}, visualTier: 1 },
        { id: "sig_haas_pu", label: "Kannapolis Hybrid", cost: 70, teams: ["haas"], tag: "SIGNATURE", equivalent: "v_power",
          desc: "Haas signature hybrid — V-Power Spec performance with 2 cooling chimneys", speed: 1.02, accel: 1.07, visual: { in: 1.1, twin: 1, inlet: 2, outlet: 1, podWidth: 1.144, shoulderHeight: 1.145, undercut: 0.931, coke: 0.959, tailWidth: 1.123, coverHeight: 1.082, chimney: 2 , scoopLip: 1}, visualTier: 2 },
        { id: "sig_williams_pu", label: "Grove Hybrid", cost: 100, teams: ["williams"], tag: "SIGNATURE", equivalent: "highrev",
          desc: "Williams signature hybrid — High-Rev performance with fully sealed cooling bodywork", speed: 1.05, accel: 1.04, visual: { in: 1.25, snork: 1, inlet: 3, outlet: 2, podWidth: 0.912, shoulderHeight: 1.044, undercut: 0.994, coke: 1.253, tailWidth: 0.852, coverHeight: 1.079, chimney: 0 , scoopLip: 1}, visualTier: 1 },
        { id: "sig_cadillac_pu", label: "Detroit Hybrid", cost: 200, teams: ["cadillac"], tag: "SIGNATURE", equivalent: "manu_ferrari",
          desc: "Cadillac signature hybrid — Ferrari 066/12 performance with 3 cooling chimneys", speed: 1.09, accel: 1.11, braking: 1.04, visual: { in: 1.58, snork: 1, twin: 1, inlet: 3, outlet: 3, podWidth: 1.28, shoulderHeight: 1.28, undercut: 0.76, coke: 0.774, tailWidth: 1.271, coverHeight: 1.272, chimney: 3 , scoopLip: 2}, visualTier: 2 },
      ],
    },
    {
      id: "aero", label: "AERO",
      options: [
        { id: "minimal",       label: "Minimal",        cost:   0, desc: "+10% top speed — heavily reduced downforce",                     speed: 1.10, cornering: 0.78, visual: { lvl: 0, vane: 0, frontSweep: -0.03, frontTaper: 1.05, frontRise: 0, rearSweep: -0.02, rearTaper: 1.04, floorEdge: 0.78, floorCut: 0.02, diffuserRise: 0.72 }, visualTier: 0 },
        { id: "le_mans",       label: "Le Mans Trim",   cost:  80, desc: "Hypercar ultra-low drag — extreme top speed, severe grip penalty", speed: 1.14, cornering: 0.80, visual: { lvl: 0, vane: 1, frontSweep: 0.01, frontTaper: 0.94, frontRise: 0.01, rearSweep: 0.02, rearTaper: 0.90, floorEdge: 0.82, floorCut: 0.08, diffuserRise: 0.76 }, visualTier: 0 },
        { id: "low",           label: "Low DF",         cost:  40, desc: "+6% top speed — reduced cornering grip",                         speed: 1.06, cornering: 0.88, visual: { lvl: 1, vane: 1, frontSweep: 0.03, frontTaper: 0.96, frontRise: 0.02, rearSweep: 0.04, rearTaper: 0.94, floorEdge: 0.88, floorCut: 0.06, diffuserRise: 0.82 }, visualTier: 0 },
        { id: "s_duct",        label: "S-Duct",         cost:  60, desc: "Shaped duct package — front aero efficiency with grip trade-off", speed: 1.04, cornering: 0.93, visual: { lvl: 1, vane: 2, frontSweep: 0.08, frontTaper: 0.92, frontRise: 0.05, rearSweep: 0.03, rearTaper: 0.96, floorEdge: 0.90, floorCut: 0.10, diffuserRise: 0.84 }, visualTier: 0 },
        { id: "medium",        label: "Medium",         cost:   0, desc: "Balanced configuration for all circuit types",                   speed: 1.00, cornering: 1.00, visual: { lvl: 2, vane: 1, frontSweep: 0.04, frontTaper: 0.98, frontRise: 0.04, rearSweep: 0.03, rearTaper: 0.98, floorEdge: 1.00, floorCut: 0.04, diffuserRise: 1.00 }, visualTier: 1 },
        { id: "beam_wing",     label: "Beam Wing",      cost:  50, desc: "Rear beam wing — cornering and braking from low-drag base",      speed: 0.99, cornering: 1.07, braking: 1.04, visual: { lvl: 2, beam: 1, vane: 1, frontSweep: 0.04, frontTaper: 0.97, frontRise: 0.04, rearSweep: 0.07, rearTaper: 0.93, floorEdge: 0.98, floorCut: 0.05, diffuserRise: 1.06 }, visualTier: 2 },
        { id: "rake_setup",    label: "Rake Setup",     cost:  90, desc: "High-rear rake — improved cornering and braking",                speed: 0.97, cornering: 1.10, braking: 1.08, visual: { lvl: 3, vane: 2, frontSweep: 0.06, frontTaper: 0.94, frontRise: 0.07, rearSweep: 0.08, rearTaper: 0.94, floorEdge: 1.04, floorCut: 0.11, diffuserRise: 1.12 }, visualTier: 2 },
        { id: "diffuser",      label: "Diffuser Focus", cost: 100, desc: "Rear diffuser package — cornering and braking bias",             speed: 0.98, cornering: 1.18, braking: 1.06, visual: { lvl: 3, beam: 1, vane: 2, frontSweep: 0.05, frontTaper: 0.96, frontRise: 0.06, rearSweep: 0.07, rearTaper: 0.92, floorEdge: 1.10, floorCut: 0.14, diffuserRise: 1.28 }, visualTier: 2 },
        { id: "high",          label: "High DF",        cost:  80, desc: "−5% top speed, strong cornering grip",                          speed: 0.95, cornering: 1.15, visual: { lvl: 3.25, vane: 2, frontSweep: 0.08, frontTaper: 0.91, frontRise: 0.09, rearSweep: 0.09, rearTaper: 0.90, floorEdge: 1.08, floorCut: 0.10, diffuserRise: 1.16 }, visualTier: 2 },
        { id: "underfloor",    label: "Underfloor Kit", cost: 120, desc: "Enhanced tunnel floors — high grip with less drag penalty",      speed: 0.94, cornering: 1.22, visual: { lvl: 3, beam: 1, vane: 3, frontSweep: 0.07, frontTaper: 0.93, frontRise: 0.08, rearSweep: 0.06, rearTaper: 0.94, floorEdge: 1.24, floorCut: 0.18, diffuserRise: 1.26 }, visualTier: 2 },
        { id: "extreme",       label: "Extreme DF",     cost: 130, desc: "Maximum downforce — Monaco / Singapore spec",                   speed: 0.89, cornering: 1.26, visual: { lvl: 4, vane: 3, frontSweep: 0.12, frontTaper: 0.86, frontRise: 0.14, rearSweep: 0.12, rearTaper: 0.86, floorEdge: 1.18, floorCut: 0.16, diffuserRise: 1.30 }, visualTier: 2 },
        { id: "active_aero",   label: "Active Aero",    cost: 160, desc: "Adaptive aero surfaces — speed and cornering in one package",    speed: 1.03, cornering: 1.18, visual: { lvl: 3, drs: 1, vane: 2, frontSweep: 0.10, frontTaper: 0.90, frontRise: 0.10, rearSweep: 0.14, rearTaper: 0.88, floorEdge: 1.06, floorCut: 0.12, diffuserRise: 1.14 }, visualTier: 2 },
        { id: "ground_effect", label: "Ground Effect",  cost: 170, desc: "2026 tunnel floor package — peak grip and braking",              speed: 0.87, cornering: 1.32, braking: 1.10, visual: { lvl: 4, beam: 1, vane: 3, frontSweep: 0.09, frontTaper: 0.89, frontRise: 0.11, rearSweep: 0.10, rearTaper: 0.88, floorEdge: 1.30, floorCut: 0.22, diffuserRise: 1.36 }, visualTier: 2 },
        { id: "circuit_adaptive", label: "Circuit Adaptive", cost: 190, desc: "Linked flap and floor package — efficient grip across mixed-speed sectors", speed: 1.01, cornering: 1.22, braking: 1.06, visual: { lvl: 3.6, beam: 1, drs: 1, vane: 3, frontSweep: 0.11, frontTaper: 0.88, frontRise: 0.12, rearSweep: 0.13, rearTaper: 0.87, floorEdge: 1.16, floorCut: 0.15, diffuserRise: 1.22 }, visualTier: 2 },
        { id: "sig_mclaren_flex", label: "Papaya Flex Wing", cost: 190, teams: ["mclaren"], tag: "SIGNATURE", equivalent: "circuit_adaptive",
          desc: "McLaren signature compliant flap package — Circuit Adaptive performance with a twin-vane form and a slim upper duct", speed: 1.01, cornering: 1.22, braking: 1.06, visual: { lvl: 3.55, beam: 1, drs: 1, vane: 2, plate: 1, casc: 2, swan: 0, tvane: 0, duct: 1, board: 1, slot: 0, frontSweep: 0.15, frontTaper: 0.84, frontRise: 0.13, rearSweep: 0.16, rearTaper: 0.84, floorEdge: 1.14, floorCut: 0.17, diffuserRise: 1.20 }, visualTier: 2 },
        { id: "sig_williams_lowdrag", label: "Grove Low-Drag", cost: 40, teams: ["williams"], tag: "SIGNATURE", equivalent: "low",
          desc: "Williams signature straight-line package — Low DF performance with stripped turning vanes", speed: 1.06, cornering: 0.88, visual: { lvl: 1.15, vane: 0, beam: 0, drs: 0, frontSweep: -0.02, frontTaper: 1.02, frontRise: 0.01, rearSweep: 0.01, rearTaper: 0.92, floorEdge: 0.86, floorCut: 0.03, diffuserRise: 0.80 }, visualTier: 0 },
        { id: "sig_aston_tunnel", label: "Silverstone Tunnel", cost: 170, teams: ["astonmartin"], tag: "SIGNATURE", equivalent: "ground_effect",
          desc: "Aston Martin signature tunnel floor — Ground Effect performance with an active upper flap and floor-corner slots", speed: 0.87, cornering: 1.32, braking: 1.10, visual: { lvl: 4, beam: 1, vane: 2, drs: 1, plate: 1, casc: 2, swan: 0, tvane: 1, duct: 0, board: 2, slot: 1, frontSweep: 0.10, frontTaper: 0.87, frontRise: 0.12, rearSweep: 0.15, rearTaper: 0.82, floorEdge: 1.32, floorCut: 0.21, diffuserRise: 1.38 }, visualTier: 2 },
        { id: "sig_redbull_concept", label: "Newey Concept", cost: 170, teams: ["redbull"], tag: "SIGNATURE", equivalent: "ground_effect",
          desc: "Red Bull signature high-rake concept — Ground Effect performance with a wakeboard and floor-corner slots", speed: 0.87, cornering: 1.32, braking: 1.10, visual: { lvl: 4, beam: 1, vane: 3, plate: 2, casc: 2, swan: 1, tvane: 0, duct: 0, board: 2, slot: 1, frontSweep: 0.08, frontTaper: 0.90, frontRise: 0.14, rearSweep: 0.11, rearTaper: 0.87, floorEdge: 1.26, floorCut: 0.19, diffuserRise: 1.44 }, visualTier: 2 },
        { id: "swan_low",      label: "Swan-Neck Low Drag", cost: 70, desc: "Over-slung wing mount on a stripped front end — clean airflow, minimal downforce", speed: 1.07, cornering: 0.86, visual: { lvl: 1, vane: 1, plate: 0, casc: 0, swan: 1, tvane: 0, frontSweep: 0.02, frontTaper: 0.99, frontRise: 0.01, rearSweep: 0.05, rearTaper: 0.92, floorEdge: 0.90, floorCut: 0.05, diffuserRise: 0.86 }, visualTier: 0 },
        { id: "outwash_max",   label: "Max Outwash",   cost: 140, desc: "Tall arched endplates and a full canard cascade — front-end bite in slow corners", speed: 0.96, cornering: 1.20, braking: 1.04, visual: { lvl: 3, vane: 2, plate: 2, casc: 3, swan: 0, tvane: 0, frontSweep: 0.14, frontTaper: 0.85, frontRise: 0.13, rearSweep: 0.06, rearTaper: 0.95, floorEdge: 1.12, floorCut: 0.13, diffuserRise: 1.18 }, visualTier: 2 },
        { id: "twin_tier",     label: "Twin-Tier Wing", cost: 150, desc: "Swan-neck rear with a T-wing tier — stable rear platform through fast sequences", speed: 0.97, cornering: 1.22, braking: 1.03, visual: { lvl: 3, beam: 1, vane: 2, plate: 1, casc: 2, swan: 1, tvane: 1, frontSweep: 0.07, frontTaper: 0.92, frontRise: 0.07, rearSweep: 0.11, rearTaper: 0.89, floorEdge: 1.08, floorCut: 0.12, diffuserRise: 1.20 }, visualTier: 2 },
        { id: "sig_cadillac_lowline", label: "Detroit Lowline", cost: 80, teams: ["cadillac"], tag: "SIGNATURE", equivalent: "le_mans",
          desc: "Cadillac signature superspeedway trim — Le Mans Trim performance with a stretched flat-deck wing and a letterbox duct", speed: 1.14, cornering: 0.80, visual: { lvl: 0, vane: 0, beam: 0, plate: 0, casc: 0, swan: 0, tvane: 0, duct: 1, board: 0, slot: 0, frontSweep: -0.02, frontTaper: 1.04, frontRise: 0, rearSweep: 0.01, rearTaper: 0.94, floorEdge: 0.84, floorCut: 0.04, diffuserRise: 0.74 }, visualTier: 0 },
        { id: "wake_board", label: "Wakeboard Kit", cost: 110, desc: "In-wash floor board ahead of the sidepod — 2026 bargeboard return for mid-speed bite", speed: 0.98, cornering: 1.14, braking: 1.03, visual: { lvl: 2, vane: 2, plate: 1, casc: 1, swan: 0, tvane: 0, duct: 0, board: 2, slot: 0, frontSweep: 0.05, frontTaper: 0.96, frontRise: 0.05, rearSweep: 0.04, rearTaper: 0.96, floorEdge: 1.06, floorCut: 0.08, diffuserRise: 1.08 }, visualTier: 2 },
        { id: "pod_duct", label: "Upper Duct", cost: 95, desc: "Top-of-sidepod ram — the optional 2026 cooling duct, cleaner than a wide scoop", speed: 1.03, cornering: 1.06, visual: { lvl: 2, vane: 1, plate: 1, casc: 1, swan: 0, tvane: 0, duct: 2, board: 0, slot: 0, frontSweep: 0.03, frontTaper: 0.99, frontRise: 0.03, rearSweep: 0.02, rearTaper: 0.99, floorEdge: 0.96, floorCut: 0.05, diffuserRise: 0.94 }, visualTier: 1 },
        { id: "reg26_concept", label: "2026 Concept", cost: 185, desc: "Full 2026 body kit — scooped duct, wakeboard and floor-corner slots on a high-DF stack", speed: 0.93, cornering: 1.24, braking: 1.08, visual: { lvl: 3.4, beam: 1, vane: 2, plate: 2, casc: 2, swan: 1, tvane: 1, duct: 2, board: 2, slot: 1, frontSweep: 0.10, frontTaper: 0.88, frontRise: 0.11, rearSweep: 0.10, rearTaper: 0.88, floorEdge: 1.20, floorCut: 0.16, diffuserRise: 1.26 }, visualTier: 2 },
        { id: "sig_mercedes_wing", label: "Brackley Aero Kit", cost: 80, teams: ["mercedes"], tag: "SIGNATURE", equivalent: "high",
          desc: "Mercedes signature aero kit — High DF performance with a scooped upper duct on a swan-neck mount", speed: 0.95, cornering: 1.15, visual: { lvl: 3.25, vane: 2, frontSweep: 0.07, frontTaper: 0.928, frontRise: 0.09, rearSweep: 0.084, rearTaper: 0.918, floorEdge: 1.037, floorCut: 0.1, diffuserRise: 1.114, plate: 1, casc: 1, swan: 1, tvane: 0, duct: 2, board: 0, slot: 0 }, visualTier: 2 },
        { id: "sig_ferrari_wing", label: "Maranello Aero Kit", cost: 190, teams: ["ferrari"], tag: "SIGNATURE", equivalent: "circuit_adaptive",
          desc: "Ferrari signature aero kit — Circuit Adaptive performance with a full wakeboard and floor-corner slots", speed: 1.01, cornering: 1.22, braking: 1.06, visual: { lvl: 3.6, beam: 1, drs: 1, vane: 3, frontSweep: 0.124, frontTaper: 0.845, frontRise: 0.12, rearSweep: 0.138, rearTaper: 0.835, floorEdge: 1.206, floorCut: 0.15, diffuserRise: 1.293, plate: 2, casc: 3, swan: 0, tvane: 1, duct: 0, board: 2, slot: 1 }, visualTier: 2 },
        { id: "sig_alpine_wing", label: "Enstone Aero Kit", cost: 120, teams: ["alpine"], tag: "SIGNATURE", equivalent: "underfloor",
          desc: "Alpine signature aero kit — Underfloor Kit performance with a wakeboard and a T-wing tier", speed: 0.94, cornering: 1.22, visual: { lvl: 3, beam: 1, vane: 3, frontSweep: 0.078, frontTaper: 0.93, frontRise: 0.08, rearSweep: 0.065, rearTaper: 0.94, floorEdge: 1.265, floorCut: 0.18, diffuserRise: 1.31, plate: 1, casc: 1, swan: 0, tvane: 1, duct: 0, board: 2, slot: 0 }, visualTier: 2 },
        { id: "sig_racingbulls_wing", label: "Faenza Aero Kit", cost: 50, teams: ["racingbulls"], tag: "SIGNATURE", equivalent: "beam_wing",
          desc: "Racing Bulls signature aero kit — Beam Wing performance with a slim upper duct on a swan-neck mount", speed: 0.99, cornering: 1.07, braking: 1.04, visual: { lvl: 2, beam: 1, vane: 1, frontSweep: 0.044, frontTaper: 1.009, frontRise: 0.04, rearSweep: 0.072, rearTaper: 0.967, floorEdge: 0.921, floorCut: 0.05, diffuserRise: 0.996, plate: 0, casc: 1, swan: 1, tvane: 0, duct: 1, board: 0, slot: 0 }, visualTier: 2 },
        { id: "sig_haas_wing", label: "Kannapolis Aero Kit", cost: 40, teams: ["haas"], tag: "SIGNATURE", equivalent: "low",
          desc: "Haas signature aero kit — Low DF performance with stripped low-drag endplates", speed: 1.06, cornering: 0.88, visual: { lvl: 1, vane: 1, frontSweep: 0.016, frontTaper: 1.018, frontRise: 0.02, rearSweep: 0.032, rearTaper: 0.996, floorEdge: 0.95, floorCut: 0.06, diffuserRise: 0.804, plate: 0, casc: 0, swan: 0, tvane: 0, duct: 0, board: 0, slot: 0 }, visualTier: 0 },
        { id: "sig_audi_wing", label: "Neuburg Aero Kit", cost: 90, teams: ["audi"], tag: "SIGNATURE", equivalent: "rake_setup",
          desc: "Audi signature aero kit — Rake Setup performance with a letterbox duct and wakeboard", speed: 0.97, cornering: 1.1, braking: 1.08, visual: { lvl: 3, vane: 2, frontSweep: 0.07, frontTaper: 0.912, frontRise: 0.07, rearSweep: 0.086, rearTaper: 0.912, floorEdge: 1.092, floorCut: 0.11, diffuserRise: 1.21, plate: 2, casc: 2, swan: 0, tvane: 1, duct: 1, board: 1, slot: 0 }, visualTier: 2 },
      ],
    },
    {
      id: "suspension", label: "SUSPENSION",
      options: [
        { id: "comfort",         label: "Comfort",         cost:   0, desc: "Softer springs — forgiving over kerbs, less cornering bite",            cornering: 0.94, visual: {"ride": 0.055, "arm": 0.8, "push": 0}, visualTier: 0 },
        { id: "standard",        label: "Standard",        cost:   0, desc: "Factory road setup",                                                    cornering: 1.00, visual: { ride: 0, arm: 1, push: 0, wishbone: 1, toe: 1 }, visualTier: 1 },
        { id: "sport",           label: "Sport",           cost:  50, desc: "Stiffer setup — improved cornering response",                            cornering: 1.08, visual: {"ride": -0.01, "arm": 1.05, "push": 0}, visualTier: 2 },
        { id: "carbon_pushrods", label: "Carbon Pushrods", cost:  60, desc: "Lightweight carbon arms — quick response and braking benefit",           cornering: 1.09, braking: 1.04, visual: {"ride": -0.015, "arm": 0.9, "push": 1}, visualTier: 2 },
        { id: "kerb_spec",       label: "Kerb Spec",       cost:  70, desc: "Circuit-tuned stiffness — helps cornering and braking",                  cornering: 1.11, braking: 1.05, visual: {"ride": 0.01, "arm": 1.1, "push": 0}, visualTier: 2 },
        { id: "low_ride",        label: "Low Ride Height", cost:  80, desc: "Reduced ride height — better aero efficiency and grip",                  cornering: 1.12, speed: 1.02, visual: {"ride": -0.035, "arm": 1.05, "push": 0}, visualTier: 2 },
        { id: "racing",          label: "Racing",          cost:  90, desc: "Track-focused — high lateral grip",                                      cornering: 1.16, visual: {"ride": -0.025, "arm": 1.15, "push": 1, rocker: 1, heave: 1}, visualTier: 2 },
        { id: "triple_damper",   label: "Triple Damper",   cost: 100, desc: "Three-stage damper system — precise compliance across all corner phases", cornering: 1.17, speed: 1.01, visual: {"ride": -0.02, "arm": 1.2, "push": 1}, visualTier: 2 },
        { id: "titanium_spring", label: "Titanium Spring", cost: 110, desc: "Ultra-light titanium coils — mass reduction with stiffer cornering",     cornering: 1.19, accel: 1.02, visual: {"ride": -0.02, "arm": 0.85, "push": 1, "pull": 1, heave: 1}, visualTier: 2 },
        { id: "inboard_dampers", label: "Inboard Dampers", cost: 110, desc: "Unsprung mass reduction — responsive handling and consistent braking",   cornering: 1.18, braking: 1.07, visual: {"ride": -0.02, "arm": 1.1, "push": 1, "pull": 1}, visualTier: 2 },
        { id: "track",           label: "Track",           cost: 130, desc: "Extreme stiffness — maximum cornering",                                  cornering: 1.24, visual: {"ride": -0.04, "arm": 1.3, "push": 1, heave: 1}, visualTier: 2 },
        { id: "heave_spring",    label: "Heave Spring",    cost: 150, desc: "Aero-optimised springing — stable floor clearance under hard braking",   cornering: 1.21, speed: 1.03, visual: {"ride": -0.03, "arm": 1.2, "push": 1, "pull": 1, rocker: 2, heave: 1}, visualTier: 2 },
        { id: "active",          label: "Active",          cost: 190, desc: "Active suspension system — peak cornering, slight top speed boost",       cornering: 1.28, speed: 1.02, visual: {"ride": -0.045, "arm": 1.25, "push": 1, rocker: 2, heave: 1}, visualTier: 2 },
        { id: "interlinked",     label: "Interlinked",     cost: 170, desc: "Hydraulically linked heave control — stable platform with kerb compliance", cornering: 1.23, braking: 1.05, speed: 1.01, visual: { ride: -0.028, arm: 1.12, push: 1, pull: 1, rocker: 1 }, visualTier: 2 },
        { id: "torsion_bar",     label: "Torsion Bar",     cost:  60, desc: "Torsion-bar springing — compact, consistent response over a long stint",     cornering: 1.10, visual: { ride: -0.005, arm: 0.96, push: 0, wishbone: 1.12, toe: 1.08 }, visualTier: 2 },
        { id: "zero_keel",       label: "Zero Keel",       cost:  85, desc: "Keel-less front end — cleaner airflow under the nose with a stiffer platform", cornering: 1.13, braking: 1.03, visual: { ride: -0.022, arm: 1.02, push: 1, wishbone: 0.82, toe: 0.92, rocker: 1 , heave: 1}, visualTier: 2 },
        { id: "mono_damper",     label: "Monotube Damper", cost: 140, desc: "Monotube gas dampers — precise control with a useful mass saving",          cornering: 1.20, accel: 1.02, visual: { ride: -0.032, arm: 1.06, push: 1, pull: 1, wishbone: 1.24, toe: 1.16, rocker: 2 , heave: 1}, visualTier: 2 },
        { id: "sig_redbull_pullrod", label: "Milton Keynes Pullrod", cost: 190, teams: ["redbull"], tag: "SIGNATURE", equivalent: "active",
          desc: "Red Bull signature pullrod layout — Active performance with a distinct crossed actuator", cornering: 1.28, speed: 1.02, visual: { ride: -0.043, arm: 1.28, push: 1, pull: 1, rocker: 0 , heave: 1}, visualTier: 2 },
        { id: "sig_mclaren_active", label: "Woking Active", cost: 190, teams: ["mclaren"], tag: "SIGNATURE", equivalent: "active",
          desc: "McLaren signature adaptive platform — Active performance with slimline carbon arms", cornering: 1.28, speed: 1.02, visual: { ride: -0.047, arm: 0.92, push: 1, pull: 1, rocker: 2 , heave: 1}, visualTier: 2 },
        { id: "sig_audi_damper", label: "Neuburg Damper", cost: 100, teams: ["audi"], tag: "SIGNATURE", equivalent: "triple_damper",
          desc: "Audi signature three-stage damper — Triple Damper performance with a heavy-gauge arm set", cornering: 1.17, speed: 1.01, visual: { ride: -0.017, arm: 1.32, push: 1, rocker: 2 }, visualTier: 2 },
        { id: "sig_mercedes_susp", label: "Brackley Chassis", cost: 170, teams: ["mercedes"], tag: "SIGNATURE", equivalent: "interlinked",
          desc: "Mercedes signature chassis — Interlinked performance with a crossed pullrod actuator", speed: 1.01, cornering: 1.23, braking: 1.05, visual: { ride: -0.024, arm: 1.053, push: 1, pull: 1, wishbone: 1.06, toe: 0.94, rocker: 2 , heave: 1}, visualTier: 2 },
        { id: "sig_ferrari_susp", label: "Maranello Chassis", cost: 90, teams: ["ferrari"], tag: "SIGNATURE", equivalent: "racing",
          desc: "Ferrari signature chassis — Racing performance with pushrod actuation", cornering: 1.16, visual: { ride: -0.029, arm: 1.265, push: 1, wishbone: 0.9, toe: 1.1, rocker: 1 }, visualTier: 2 },
        { id: "sig_alpine_susp", label: "Enstone Chassis", cost: 70, teams: ["alpine"], tag: "SIGNATURE", equivalent: "kerb_spec",
          desc: "Alpine signature chassis — Kerb Spec performance with heavy-gauge arms", cornering: 1.11, braking: 1.05, visual: { ride: 0.012, arm: 1.144, push: 0, wishbone: 0.96, toe: 1.04, rocker: 1 }, visualTier: 2 },
        { id: "sig_racingbulls_susp", label: "Faenza Chassis", cost: 50, teams: ["racingbulls"], tag: "SIGNATURE", equivalent: "sport",
          desc: "Racing Bulls signature chassis — Sport performance with slimline carbon arms", cornering: 1.08, visual: { ride: -0.004, arm: 1.008, push: 0, wishbone: 1.04, toe: 0.96, rocker: 0 }, visualTier: 2 },
        { id: "sig_haas_susp", label: "Kannapolis Chassis", cost: 60, teams: ["haas"], tag: "SIGNATURE", equivalent: "carbon_pushrods",
          desc: "Haas signature chassis — Carbon Pushrods performance with pushrod actuation", cornering: 1.09, braking: 1.04, visual: { ride: -0.007, arm: 0.972, push: 1, wishbone: 0.92, toe: 1.08, rocker: 1 }, visualTier: 2 },
        { id: "sig_williams_susp", label: "Grove Chassis", cost: 80, teams: ["williams"], tag: "SIGNATURE", equivalent: "low_ride",
          desc: "Williams signature chassis — Low Ride Height performance with slimline carbon arms", speed: 1.02, cornering: 1.12, visual: { ride: -0.037, arm: 0.924, push: 0, wishbone: 1.12, toe: 0.88, rocker: 0 , heave: 1}, visualTier: 2 },
        { id: "sig_astonmartin_susp", label: "Silverstone Chassis", cost: 150, teams: ["astonmartin"], tag: "SIGNATURE", equivalent: "heave_spring",
          desc: "Aston Martin signature chassis — Heave Spring performance with a crossed pullrod actuator", speed: 1.03, cornering: 1.21, visual: { ride: -0.042, arm: 1.272, push: 1, pull: 1, wishbone: 0.94, toe: 1.06, rocker: 1 , heave: 1}, visualTier: 2 },
        { id: "sig_cadillac_susp", label: "Detroit Chassis", cost: 110, teams: ["cadillac"], tag: "SIGNATURE", equivalent: "inboard_dampers",
          desc: "Cadillac signature chassis — Inboard Dampers performance with a crossed pullrod actuator", cornering: 1.18, braking: 1.07, visual: { ride: -0.01, arm: 1.122, push: 1, pull: 1, wishbone: 0.98, toe: 1.02, rocker: 2 }, visualTier: 2 },
      ],
    },
    {
      id: "brakes", label: "BRAKES",
      options: [
        { id: "standard",    label: "Standard",         cost:   0, desc: "Factory steel brake discs",                                                 braking: 1.00, visual: { cal: null, duct: 0.55, caliperPos: 0, coverOpen: 0, rotor: 1, rotorScale: 1 }, visualTier: 1 },
        { id: "drilled",     label: "Drilled Steel",    cost:  30, desc: "Cross-drilled steel discs — improved heat management",                      braking: 1.05, visual: {"cal": null, "duct": 0.72}, visualTier: 1 },
        { id: "sport",       label: "Sport",            cost:  40, desc: "Improved pads and discs",                                                   braking: 1.08, visual: {"cal": [0.95, 0.45, 0.05], "duct": 0.95}, visualTier: 2 },
        { id: "titanium",    label: "Titanium Caliper", cost:  50, desc: "Lighter alloy calipers — better weight distribution and exit speed",        braking: 1.06, accel: 1.04, visual: {"cal": [0.7, 0.72, 0.78], "duct": 0.85}, visualTier: 1 },
        { id: "endurance",   label: "Endurance",        cost:  60, desc: "Consistent fade-free braking — aids corner exit",                           braking: 1.10, accel: 1.02, visual: {"cal": [0.95, 0.8, 0.1], "duct": 1.05, caliper: 1}, visualTier: 2 },
        { id: "dual_caliper",label: "Dual Caliper",     cost:  80, desc: "Twin-piston caliper setup — stronger bite with improved exit traction",     braking: 1.13, accel: 1.02, visual: {"cal": [0.95, 0.72, 0.08], "duct": 1.15, "rim": [0.3, 0.3, 0.34], caliper: 1}, visualTier: 2 },
        { id: "carbon",      label: "Carbon",           cost:  90, desc: "F1-spec carbon composite brakes",                                           braking: 1.16, visual: {"cal": [0.85, 0.12, 0.1], "duct": 1.25, discFace: 1, caliper: 1}, visualTier: 2 },
        { id: "ventilated",  label: "Ventilated Carbon",cost: 100, desc: "Internally vented discs — consistent fade-free stopping",                   braking: 1.18, visual: {"cal": [0.9, 0.15, 0.12], "duct": 1.35, discFace: 1, caliper: 1}, visualTier: 2 },
        { id: "carbon_mag",  label: "Carbon-Mag",       cost: 120, desc: "Carbon-magnesium alloy — lighter, better mass dist",                        braking: 1.20, accel: 1.03, visual: {"cal": [0.85, 0.66, 0.16], "duct": 1.45, "rim": [0.48, 0.4, 0.16], caliper: 1}, visualTier: 2 },
        { id: "regen_brakes",label: "Regen Brakes",     cost: 130, desc: "Brake-by-wire hybrid system — converts braking energy into acceleration",   braking: 1.12, accel: 1.06, visual: {"cal": [0.15, 0.78, 0.38], "duct": 1.25, caliper: 1}, visualTier: 2 },
        { id: "ceramic",     label: "Carbon Ceramic",   cost: 140, desc: "Maximum stopping power — zero fade",                                        braking: 1.24, visual: {"cal": [0.97, 0.1, 0.08], "duct": 1.6, "rim": [0.55, 0.56, 0.6], discFace: 2, caliper: 1}, visualTier: 2 },
        { id: "brembo_evo",  label: "Brembo Evo",       cost: 160, desc: "Next-gen racing brake package — ultimate stopping with mass benefit",        braking: 1.26, accel: 1.04, visual: {"cal": [0.98, 0.62, 0.05], "duct": 1.75, "rim": [0.42, 0.34, 0.12], caliper: 2}, visualTier: 2 },
        { id: "six_piston",   label: "Six Piston",       cost: 180, desc: "Large monobloc calipers — peak initial bite with stable trail braking",       braking: 1.27, cornering: 1.02, visual: { cal: [0.10, 0.65, 0.95], duct: 1.55, rim: [0.24, 0.28, 0.34], discFace: 2 }, visualTier: 2 },
        { id: "mono_steel",   label: "Monobloc Steel",   cost:  70, desc: "One-piece steel calipers — predictable bite with no exotic materials",        braking: 1.12, visual: { cal: [0.62, 0.64, 0.70], duct: 0.95, scoop: 0, rotor: 1, rotorScale: 1.02 , caliper: 1}, visualTier: 1 },
        { id: "scoop_wrap",   label: "Wrapped Ducts",    cost: 110, desc: "Boomerang duct fairings wrapping the wheel face — cooling that also turns air", braking: 1.19, cornering: 1.02, visual: { cal: [0.20, 0.55, 0.85], duct: 1.30, scoop: 2, rim: [0.26, 0.30, 0.36], discFace: 1 , caliper: 2}, visualTier: 2 },
        { id: "cryo_pack",    label: "Cryo Pack",        cost: 150, desc: "Cryogenically treated discs — deep, repeatable stopping power under load",     braking: 1.25, accel: 1.02, visual: { cal: [0.72, 0.86, 0.95], duct: 1.62, scoop: 2, rim: [0.50, 0.54, 0.60], discFace: 2 , caliper: 1}, visualTier: 2 },
        { id: "sig_ferrari_brembo", label: "Maranello Brembo", cost: 160, teams: ["ferrari"], tag: "SIGNATURE", equivalent: "brembo_evo",
          desc: "Ferrari signature brake package — Brembo Evo performance with red monobloc hardware", braking: 1.26, accel: 1.04, visual: { cal: [0.95, 0.05, 0.04], duct: 1.70, rim: [0.52, 0.45, 0.20], discFace: 2 , caliper: 1}, visualTier: 2 },
        { id: "sig_haas_carbonmag", label: "Kannapolis C-Mag", cost: 120, teams: ["haas"], tag: "SIGNATURE", equivalent: "carbon_mag",
          desc: "Haas signature lightweight brake — Carbon-Mag performance with pale alloy hardware", braking: 1.20, accel: 1.03, visual: { cal: [0.88, 0.88, 0.90], duct: 1.42, rim: [0.42, 0.18, 0.14], discFace: 0 , caliper: 1}, visualTier: 2 },
        { id: "sig_mercedes_discs", label: "Brackley Discs", cost: 140, teams: ["mercedes"], tag: "SIGNATURE", equivalent: "ceramic",
          desc: "Mercedes signature brake package — Carbon Ceramic performance with Petronas-teal hardware", braking: 1.24, visual: { cal: [0.0, 0.75, 0.70], duct: 1.55, rim: [0.60, 0.62, 0.66], discFace: 1 , caliper: 1}, visualTier: 2 },
        { id: "sig_aston_carbon", label: "Lagonda Carbon", cost: 100, teams: ["astonmartin"], tag: "SIGNATURE", equivalent: "ventilated",
          desc: "Aston Martin signature vented brake — Ventilated Carbon performance with racing-green monoblocs", braking: 1.18, visual: { cal: [0.0, 0.55, 0.38], duct: 1.40, rim: [0.50, 0.44, 0.20], discFace: 2 , caliper: 2}, visualTier: 2 },
        { id: "sig_mclaren_brakes", label: "Woking Brake Pack", cost: 180, teams: ["mclaren"], tag: "SIGNATURE", equivalent: "six_piston",
          desc: "McLaren signature brake pack — Six Piston performance with a duct winglet", cornering: 1.02, braking: 1.27, visual: { cal: [1, 0.5, 0], duct: 1.643, rim: [0.24, 0.28, 0.34], scoop: 1, discFace: 1 , caliper: 2}, visualTier: 2 },
        { id: "sig_redbull_brakes", label: "Milton Keynes Brake Pack", cost: 120, teams: ["redbull"], tag: "SIGNATURE", equivalent: "carbon_mag",
          desc: "Red Bull signature brake pack — Carbon-Mag performance with wrapped boomerang ducts", accel: 1.03, braking: 1.2, visual: { cal: [0.95, 0.78, 0], duct: 1.624, rim: [0.48, 0.4, 0.16], scoop: 2, discFace: 2 , caliper: 1}, visualTier: 2 },
        { id: "sig_alpine_brakes", label: "Enstone Brake Pack", cost: 100, teams: ["alpine"], tag: "SIGNATURE", equivalent: "ventilated",
          desc: "Alpine signature brake pack — Ventilated Carbon performance with a duct winglet", braking: 1.18, visual: { cal: [1, 0.53, 0.74], duct: 1.296, scoop: 1, discFace: 1 , caliper: 1}, visualTier: 2 },
        { id: "sig_racingbulls_brakes", label: "Faenza Brake Pack", cost: 40, teams: ["racingbulls"], tag: "SIGNATURE", equivalent: "sport",
          desc: "Racing Bulls signature brake pack — Sport performance with bare duct inlets", braking: 1.08, visual: { cal: [0.2, 0.3, 0.95], duct: 0.874, scoop: 0, discFace: 0 , caliper: 1}, visualTier: 2 },
        { id: "sig_williams_brakes", label: "Grove Brake Pack", cost: 50, teams: ["williams"], tag: "SIGNATURE", equivalent: "titanium",
          desc: "Williams signature brake pack — Titanium Caliper performance with a duct winglet", accel: 1.04, braking: 1.06, visual: { cal: [0.2, 0.55, 0.95], duct: 0.765, scoop: 1, discFace: 1 , caliper: 1}, visualTier: 1 },
        { id: "sig_audi_brakes", label: "Neuburg Brake Pack", cost: 130, teams: ["audi"], tag: "SIGNATURE", equivalent: "regen_brakes",
          desc: "Audi signature brake pack — Regen Brakes performance with wrapped boomerang ducts", accel: 1.06, braking: 1.12, visual: { cal: [0.98, 0.28, 0.05], duct: 1.425, scoop: 2, discFace: 2 }, visualTier: 2 },
        { id: "sig_cadillac_brakes", label: "Detroit Brake Pack", cost: 60, teams: ["cadillac"], tag: "SIGNATURE", equivalent: "endurance",
          desc: "Cadillac signature brake pack — Endurance performance with wrapped boomerang ducts", accel: 1.02, braking: 1.1, visual: { cal: [0.85, 0.7, 0.32], duct: 1.218, scoop: 2, discFace: 0 }, visualTier: 2 },
      ],
    },
    {
      id: "tyres", label: "TYRES",
      options: [
        { id: "intermediate", label: "Intermediate",  cost:   0, desc: "Wet-weather compound — lower grip in dry conditions",                         speed: 0.92, cornering: 0.94, accel: 0.93, visual: {"band": [0.1, 0.72, 0.24], "grooved": true, "grooves": 3, "grooveDepth": 0.055, "bandWidth": 0.08, "coverVanes": 5}, visualTier: 0 },
        { id: "hard",         label: "Hard",          cost:   0, desc: "Durable compound — +2% top speed, lower grip",                               speed: 1.02, cornering: 0.92, accel: 0.97, visual: {"band": [0.9, 0.9, 0.93], "grooved": false, "grooves": 0, "bandWidth": 0.05, "coverVanes": 8}, visualTier: 0 },
        { id: "medium",       label: "Medium",        cost:   0, desc: "Balanced compound for all conditions",                                        speed: 1.00, cornering: 1.00, accel: 1.00, visual: {"band": [0.96, 0.8, 0.1], "grooved": false, "grooves": 0, "bandWidth": 0.075, "coverVanes": 6}, visualTier: 1 },
        { id: "slick_track",  label: "Slick Track",   cost:  40, desc: "Pure dry-weather slick — optimised compound structure",                       speed: 1.01, cornering: 1.04, accel: 1.01, visual: {"band": [0.8, 0.82, 0.88], "grooved": false, "grooves": 0, "bandWidth": 0.045, "coverVanes": 10}, visualTier: 1 },
        { id: "compound_c4",  label: "Compound C4",   cost:  60, desc: "Pirelli's track-ready soft — reliable grip upgrade over Hard/Medium",         speed: 0.98, cornering: 1.08, accel: 1.02, visual: {"band": [0.95, 0.42, 0.1], "grooved": false, "grooves": 0, "bandWidth": 0.085, "coverVanes": 7}, visualTier: 2 },
        { id: "soft",         label: "Soft",          cost:  80, desc: "+12% cornering, +4% accel — some top speed drag",                            speed: 0.97, cornering: 1.12, accel: 1.04, visual: {"band": [0.92, 0.12, 0.1], "grooved": false, "grooves": 0, "bandWidth": 0.1, "coverVanes": 6, shoulder: 1}, visualTier: 2 },
        { id: "compound_c5",  label: "Compound C5",   cost: 100, desc: "High-spec soft — aggressive grip over one stint, strong accel",               speed: 0.96, cornering: 1.15, accel: 1.05, visual: {"band": [0.97, 0.16, 0.12], "grooved": false, "grooves": 0, "bandWidth": 0.115, "coverVanes": 5, shoulder: 1}, visualTier: 2 },
        { id: "supersoft",    label: "Super Soft",    cost: 130, desc: "High grip compound — aggressive tyre load",                                   speed: 0.94, cornering: 1.20, accel: 1.06, visual: {"band": [0.88, 0.1, 0.3], "grooved": false, "grooves": 0, "bandWidth": 0.12, "coverVanes": 8, shoulder: 2}, visualTier: 2 },
        { id: "p_zero_red",   label: "P Zero Red",    cost: 160, desc: "Custom Pirelli high-performance compound — between Super Soft and Quali",     speed: 0.92, cornering: 1.24, accel: 1.07, visual: { sidewall: 1,"band": [0.97, 0.07, 0.07], "grooved": false, "grooves": 0, "bandWidth": 0.13, "coverVanes": 9}, visualTier: 2 },
        { id: "qualigum",     label: "Quali Spec",    cost: 180, desc: "One-lap ultra-soft — maximum short-run grip",                                 speed: 0.91, cornering: 1.28, accel: 1.09, visual: { sidewall: 2,"band": [0.62, 0.12, 0.78], "grooved": false, "grooves": 0, "bandWidth": 0.14, "coverVanes": 11}, visualTier: 2 },
        { id: "hypersoft",    label: "Hyper Soft",    cost: 200, desc: "Prototype extreme compound — maximum peak grip, very short lifespan",          speed: 0.88, cornering: 1.36, accel: 1.12, visual: { sidewall: 2,"band": [0.98, 0.38, 0.62], "grooved": false, "grooves": 0, "bandWidth": 0.15, "coverVanes": 12, shoulder: 2}, visualTier: 2 },
        { id: "sprint_soft",  label: "Sprint Soft",   cost: 150, desc: "Short-race compound — rapid warm-up and strong launch traction",                 speed: 0.93, cornering: 1.22, accel: 1.08, visual: { band: [0.15, 0.55, 0.95], grooved: false, grooves: 0, bandWidth: 0.105, coverVanes: 9 }, visualTier: 2 },
        { id: "wet_full",     label: "Full Wet",      cost:   0, desc: "Deep-tread monsoon tyre — the only compound that clears standing water",         speed: 0.88, cornering: 0.90, accel: 0.90, visual: { band: [0.10, 0.40, 0.92], grooved: true, grooves: 5, grooveDepth: 0.075, bandWidth: 0.09, coverVanes: 4, shoulder: 2 }, visualTier: 0 },
        { id: "compound_c3",  label: "Compound C3",   cost:  50, desc: "Pirelli's workhorse medium-hard — a small, safe step up from the base compound", speed: 1.01, cornering: 1.05, accel: 1.01, visual: { band: [0.92, 0.92, 0.60], grooved: false, grooves: 0, bandWidth: 0.065, coverVanes: 9 , shoulder: 2}, visualTier: 1 },
        { id: "endurance_tyre", label: "Endurance Spec", cost: 70, desc: "Reinforced casing — holds its shape lap after lap without giving up top speed", speed: 1.02, cornering: 1.06, accel: 1.00, visual: { sidewall: 1, band: [0.55, 0.58, 0.64], grooved: false, grooves: 0, bandWidth: 0.055, coverVanes: 12, shoulder: 1 }, visualTier: 1 },
        { id: "sig_cadillac_sprint", label: "Cadillac Sprint", cost: 150, teams: ["cadillac"], tag: "SIGNATURE", equivalent: "sprint_soft",
          desc: "Cadillac signature sprint compound — Sprint Soft performance with a gold double-width band", speed: 0.93, cornering: 1.22, accel: 1.08, visual: { sidewall: 2, band: [0.92, 0.72, 0.18], grooved: false, grooves: 0, bandWidth: 0.125, coverVanes: 4, shoulder: 2 }, visualTier: 2 },
        { id: "sig_rb_street", label: "Faenza Street", cost: 130, teams: ["racingbulls"], tag: "SIGNATURE", equivalent: "supersoft",
          desc: "Racing Bulls signature street compound — Super Soft performance with a twin-blue sidewall band", speed: 0.94, cornering: 1.20, accel: 1.06, visual: { sidewall: 1, band: [0.20, 0.30, 0.95], grooved: false, grooves: 0, bandWidth: 0.135, coverVanes: 7, shoulder: 1 }, visualTier: 2 },
        { id: "sig_mercedes_tyre", label: "Brackley Compound", cost: 0, teams: ["mercedes"], tag: "SIGNATURE", equivalent: "medium",
          desc: "Mercedes signature compound — Medium performance with a 10-vane wheel cover", speed: 1.00, accel: 1.00, cornering: 1.00, visual: { sidewall: 1, band: [0.96, 0.8, 0.1], grooved: false, grooves: 0, bandWidth: 0.069, coverVanes: 10, shoulder: 1 }, visualTier: 1 },
        { id: "sig_ferrari_tyre", label: "Maranello Compound", cost: 80, teams: ["ferrari"], tag: "SIGNATURE", equivalent: "soft",
          desc: "Ferrari signature compound — Soft performance with a 6-vane wheel cover", speed: 0.97, accel: 1.04, cornering: 1.12, visual: { sidewall: 2, band: [0.92, 0.12, 0.1], grooved: false, grooves: 0, bandWidth: 0.11, coverVanes: 6, shoulder: 2 }, visualTier: 2 },
        { id: "sig_mclaren_tyre", label: "Woking Compound", cost: 150, teams: ["mclaren"], tag: "SIGNATURE", equivalent: "sprint_soft",
          desc: "McLaren signature compound — Sprint Soft performance with a 11-vane wheel cover", speed: 0.93, accel: 1.08, cornering: 1.22, visual: { sidewall: 1, band: [0.15, 0.55, 0.95], grooved: false, grooves: 0, bandWidth: 0.109, coverVanes: 11, shoulder: 2 }, visualTier: 2 },
        { id: "sig_redbull_tyre", label: "Milton Keynes Compound", cost: 80, teams: ["redbull"], tag: "SIGNATURE", equivalent: "soft",
          desc: "Red Bull signature compound — Soft performance with a 8-vane wheel cover", speed: 0.97, accel: 1.04, cornering: 1.12, visual: { sidewall: 1, band: [0.92, 0.12, 0.1], grooved: false, grooves: 0, bandWidth: 0.106, coverVanes: 8, shoulder: 1 }, visualTier: 2 },
        { id: "sig_alpine_tyre", label: "Enstone Compound", cost: 60, teams: ["alpine"], tag: "SIGNATURE", equivalent: "compound_c4",
          desc: "Alpine signature compound — Compound C4 performance with a 7-vane wheel cover", speed: 0.98, accel: 1.02, cornering: 1.08, visual: { sidewall: 0, band: [0.95, 0.42, 0.1], grooved: false, grooves: 0, bandWidth: 0.092, coverVanes: 7, shoulder: 0 }, visualTier: 2 },
        { id: "sig_haas_tyre", label: "Kannapolis Compound", cost: 0, teams: ["haas"], tag: "SIGNATURE", equivalent: "hard",
          desc: "Haas signature compound — Hard performance with a 5-vane wheel cover", speed: 1.02, accel: 0.97, cornering: 0.92, visual: { sidewall: 0, band: [0.9, 0.9, 0.93], grooved: false, grooves: 0, bandWidth: 0.051, coverVanes: 5, shoulder: 0 }, visualTier: 0 },
        { id: "sig_williams_tyre", label: "Grove Compound", cost: 0, teams: ["williams"], tag: "SIGNATURE", equivalent: "hard",
          desc: "Williams signature compound — Hard performance with a 12-vane wheel cover", speed: 1.02, accel: 0.97, cornering: 0.92, visual: { sidewall: 1, band: [0.9, 0.9, 0.93], grooved: false, grooves: 0, bandWidth: 0.045, coverVanes: 12, shoulder: 0 }, visualTier: 0 },
        { id: "sig_audi_tyre", label: "Neuburg Compound", cost: 60, teams: ["audi"], tag: "SIGNATURE", equivalent: "compound_c4",
          desc: "Audi signature compound — Compound C4 performance with a 4-vane wheel cover", speed: 0.98, accel: 1.02, cornering: 1.08, visual: { sidewall: 2, band: [0.95, 0.42, 0.1], grooved: false, grooves: 0, bandWidth: 0.095, coverVanes: 4, shoulder: 2 }, visualTier: 2 },
        { id: "sig_astonmartin_tyre", label: "Silverstone Compound", cost: 80, teams: ["astonmartin"], tag: "SIGNATURE", equivalent: "soft",
          desc: "Aston Martin signature compound — Soft performance with a 3-vane wheel cover", speed: 0.97, accel: 1.04, cornering: 1.12, visual: { sidewall: 1, band: [0.92, 0.12, 0.1], grooved: false, grooves: 0, bandWidth: 0.1, coverVanes: 3, shoulder: 1 }, visualTier: 2 },
      ],
    },
    {
      id: "ers", label: "ERS",
      options: [
        { id: "standard",       label: "Standard",      cost:   0, desc: "Balanced energy recovery and deployment",                                    speed: 1.00, accel: 1.00, visual: { led: [0.15, 0.55, 1.6], pack: 1.0, cells: 3 }, visualTier: 1 },
        { id: "regen_plus",     label: "Regen+",        cost:  70, desc: "Enhanced braking recovery — harvests extra energy under braking",            braking: 1.05, accel: 1.05, visual: {"led": [0.12, 1.5, 0.55], "pack": 1.05}, visualTier: 1 },
        { id: "harvest",        label: "Harvest",       cost:  60, desc: "Aggressive recovery: +2% top speed, −5% accel",                             speed: 1.02, accel: 0.95, visual: {"led": [0.18, 1.35, 0.95], "pack": 0.95}, visualTier: 0 },
        { id: "split_deploy",   label: "Split Deploy",  cost:  90, desc: "Per-axle deployment control — improved cornering traction and accel",        accel: 1.06, cornering: 1.04, visual: {"led": [0.85, 0.55, 1.7], "pack": 1.1}, visualTier: 1 },
        { id: "mgu_k_max",      label: "MGU-K Max",     cost:  80, desc: "Dedicated kinetic unit — strong deployment burst on straights",              accel: 1.08, speed: 0.98, visual: {"led": [1.7, 0.95, 0.15], "pack": 1.15}, visualTier: 2 },
        { id: "deploy",         label: "Deploy",        cost: 100, desc: "Full deployment: +10% accel, −3% top speed",                                speed: 0.97, accel: 1.10, visual: {"led": [1.9, 0.4, 0.15], "pack": 1.2}, visualTier: 2 },
        { id: "thermal_max",    label: "Thermal Max",   cost: 110, desc: "Heat energy recovery focus — speed gains with consistent braking",           speed: 1.04, braking: 1.03, visual: { coolerIntake: 1,"led": [1.95, 0.5, 0.08], "pack": 1.05}, visualTier: 1 },
        { id: "torque_fill",    label: "Torque Fill",   cost: 120, desc: "Hybrid torque-vectoring — cornering traction and exit speed",                accel: 1.08, cornering: 1.06, visual: {"led": [0.8, 0.3, 1.85], "pack": 1.15}, visualTier: 2 },
        { id: "overtake_focus", label: "OT Focus",      cost: 130, desc: "Traction-biased deploy: +12% accel, +4% cornering",                         speed: 0.96, accel: 1.12, cornering: 1.04, visual: {"led": [2.05, 0.15, 0.55], "pack": 1.2, blister: 2}, visualTier: 2 },
        { id: "race_mode",      label: "Race Mode",     cost: 150, desc: "High-output 2026 mode: +7% accel, +3% top speed",                           speed: 1.03, accel: 1.07, visual: {"led": [0.25, 0.95, 2.05], "pack": 1.2, blister: 2}, visualTier: 2 },
        { id: "full_attack",    label: "Full Attack",   cost: 200, desc: "Maximum ERS output — qualifying/sprint spec",                               speed: 1.06, accel: 1.14, visual: { coolerIntake: 1,"led": [2.25, 0.22, 0.16], "pack": 1.3, blister: 1}, visualTier: 2 },
        { id: "overcharge",     label: "Overcharge",    cost: 230, desc: "Experimental limit-push mode — maximum all-channel ERS output",              speed: 1.10, accel: 1.18, visual: { coolerIntake: 2,"led": [2.4, 0.75, 0.06], "pack": 1.35, blister: 1}, visualTier: 2 },
        { id: "supercapacitor", label: "Supercapacitor", cost: 180, desc: "High-discharge buffer — immediate deployment with improved recovery",        speed: 1.04, accel: 1.13, braking: 1.04, visual: { coolerIntake: 2, led: [0.30, 2.20, 2.20], pack: 1.10 , blister: 2}, visualTier: 2 },
        // External-conduit packages — visible high-voltage plumbing on the cover.
        { id: "harvest_max",    label: "Harvest Max",   cost:  95, desc: "Maximum recovery window — tops the pack up everywhere without hurting pace",   speed: 1.01, braking: 1.08, accel: 1.02, visual: { coolerIntake: 1, led: [0.20, 1.60, 0.85], pack: 1.05, cells: 4, conduit: 1 , blister: 2}, visualTier: 1 },
        { id: "conduit_twin",   label: "Twin Conduit",  cost: 140, desc: "Doubled deployment loom — steady high-current delivery out of every corner",   speed: 1.02, accel: 1.09, visual: { led: [0.35, 0.85, 2.05], pack: 1.18, cells: 6, conduit: 2 , blister: 1}, visualTier: 2 },
        { id: "burst_map",      label: "Burst Map",     cost: 165, desc: "Short, violent deployment bursts — overtaking punch with cornering traction",  speed: 0.98, accel: 1.13, cornering: 1.02, visual: { led: [2.15, 0.45, 0.12], pack: 1.26, cells: 7, conduit: 2 , blister: 1}, visualTier: 2 },
        { id: "sig_audi_quattro", label: "Quattro Hybrid", cost: 180, teams: ["audi"], tag: "SIGNATURE", equivalent: "supercapacitor",
          desc: "Audi signature deployment map — Supercapacitor performance with a red energy conduit", speed: 1.04, accel: 1.13, braking: 1.04, visual: { coolerIntake: 2, led: [2.35, 0.18, 0.08], pack: 1.12 , blister: 1}, visualTier: 2 },
        { id: "sig_alpine_boost", label: "Enstone Boost", cost: 150, teams: ["alpine"], tag: "SIGNATURE", equivalent: "race_mode",
          desc: "Alpine signature deployment map — Race Mode performance with a rose-glow energy cell", speed: 1.03, accel: 1.07, visual: { coolerIntake: 1, led: [1.90, 0.55, 1.20], pack: 1.18 , blister: 2}, visualTier: 2 },
        { id: "sig_mercedes_ers", label: "Brackley Deploy Map", cost: 150, teams: ["mercedes"], tag: "SIGNATURE", equivalent: "race_mode",
          desc: "Mercedes signature deploy map — Race Mode performance with an external conduit run", speed: 1.03, accel: 1.07, visual: { coolerIntake: 1, led: [0.1, 1.85, 1.7], pack: 1.14, cells: 5, conduit: 1 , blister: 2}, visualTier: 2 },
        { id: "sig_ferrari_ers", label: "Maranello Deploy Map", cost: 120, teams: ["ferrari"], tag: "SIGNATURE", equivalent: "torque_fill",
          desc: "Ferrari signature deploy map — Torque Fill performance with a twin external conduit", accel: 1.08, cornering: 1.06, visual: { coolerIntake: 2, led: [2.1, 0.2, 0.12], pack: 1.196, cells: 7, conduit: 2 , blister: 1}, visualTier: 2 },
        { id: "sig_mclaren_ers", label: "Woking Deploy Map", cost: 180, teams: ["mclaren"], tag: "SIGNATURE", equivalent: "supercapacitor",
          desc: "McLaren signature deploy map — Supercapacitor performance with a twin external conduit", speed: 1.04, accel: 1.13, braking: 1.04, visual: { coolerIntake: 1, led: [2.2, 1.05, 0.05], pack: 1.078, cells: 6, conduit: 2 , blister: 1}, visualTier: 2 },
        { id: "sig_redbull_ers", label: "Milton Keynes Deploy Map", cost: 130, teams: ["redbull"], tag: "SIGNATURE", equivalent: "overtake_focus",
          desc: "Red Bull signature deploy map — OT Focus performance with an external conduit run", speed: 0.96, accel: 1.12, cornering: 1.04, visual: { coolerIntake: 2, led: [2.15, 1.7, 0.1], pack: 1.224, cells: 4, conduit: 1 , blister: 1}, visualTier: 2 },
        { id: "sig_racingbulls_ers", label: "Faenza Deploy Map", cost: 90, teams: ["racingbulls"], tag: "SIGNATURE", equivalent: "split_deploy",
          desc: "Racing Bulls signature deploy map — Split Deploy performance with an external conduit run", accel: 1.06, cornering: 1.04, visual: { coolerIntake: 0, led: [0.35, 0.6, 2.25], pack: 1.067, cells: 5, conduit: 1 , blister: 1}, visualTier: 1 },
        { id: "sig_haas_ers", label: "Kannapolis Deploy Map", cost: 60, teams: ["haas"], tag: "SIGNATURE", equivalent: "harvest",
          desc: "Haas signature deploy map — Harvest performance with an external conduit run", speed: 1.02, accel: 0.95, visual: { coolerIntake: 0, led: [1.8, 1.8, 1.95], pack: 0.997, cells: 3, conduit: 1 , blister: 2}, visualTier: 0 },
        { id: "sig_williams_ers", label: "Grove Deploy Map", cost: 110, teams: ["williams"], tag: "SIGNATURE", equivalent: "thermal_max",
          desc: "Williams signature deploy map — Thermal Max performance with an external conduit run", speed: 1.04, braking: 1.03, visual: { coolerIntake: 1, led: [0.25, 1.15, 2.2], pack: 0.976, cells: 4, conduit: 1 , blister: 2}, visualTier: 1 },
        { id: "sig_astonmartin_ers", label: "Silverstone Deploy Map", cost: 200, teams: ["astonmartin"], tag: "SIGNATURE", equivalent: "full_attack",
          desc: "Aston Martin signature deploy map — Full Attack performance with an external conduit run", speed: 1.06, accel: 1.14, visual: { coolerIntake: 2, led: [1.35, 2.15, 0.25], pack: 1.287, cells: 6, conduit: 1 }, visualTier: 2 },
        { id: "sig_cadillac_ers", label: "Detroit Deploy Map", cost: 100, teams: ["cadillac"], tag: "SIGNATURE", equivalent: "deploy",
          desc: "Cadillac signature deploy map — Deploy performance with a twin external conduit", speed: 0.97, accel: 1.1, visual: { coolerIntake: 1, led: [2.05, 1.55, 0.6], pack: 1.272, cells: 8, conduit: 2 }, visualTier: 2 },
      ],
    },
    {
      id: "gearbox", label: "GEARBOX",
      options: [
        { id: "standard",      label: "Standard",       cost:   0, desc: "Factory sequential 8-speed — baseline shift performance",                    speed: 1.00, accel: 1.00, visual: { strakes: 0, fin: 0, strakeH: 0.13, casing: 0, louvres: 0, heat: 0, caseWidth: 1 }, visualTier: 1 },
        { id: "close_ratio",   label: "Close Ratio",    cost:  50, desc: "Tighter gear spacing — stronger drive out of slow corners",                  accel: 1.06, speed: 0.98, visual: {"strakes": 2, "fin": 0, "strakeH": 0.13, "casing": 1, "louvres": 2, "heat": 0}, visualTier: 1 },
        { id: "long_ratio",    label: "Long Ratio",     cost:  40, desc: "Wider gear spacing — improved top speed on power circuits",                  speed: 1.04, accel: 0.97, visual: {"strakes": 2, "fin": 0, "strakeH": 0.16, "casing": 1, "louvres": 0, "heat": 1}, visualTier: 1 },
        { id: "short_stack",   label: "Short Stack",    cost:  70, desc: "Extra-short first gear — explosive launch and corner exit traction",         accel: 1.08, cornering: 1.03, visual: {"strakes": 3, "fin": 1, "strakeH": 0.15, "finSY": 0.11, "finSZ": 0.22, "casing": 2, "louvres": 3, "heat": 0}, visualTier: 2 },
        { id: "sequential_pro",label: "Sequential Pro", cost:  90, desc: "Faster shift times — reduced power interruption through the rev range",      accel: 1.07, speed: 1.02, visual: {"strakes": 4, "fin": 1, "strakeH": 0.17, "finSY": 0.17, "finSZ": 0.32, "casing": 2, "louvres": 4, "heat": 1}, visualTier: 2 },
        { id: "carbon_case",   label: "Carbon Case",    cost: 130, desc: "Lightweight carbon housing — mass reduction improves accel and handling",     accel: 1.08, speed: 1.02, cornering: 1.02, visual: {"strakes": 4, "fin": 1, "strakeH": 0.19, "finSY": 0.15, "finSZ": 0.3, "casing": 3, "louvres": 0, "heat": 1}, visualTier: 2 },
        { id: "f1_spec",       label: "F1 Spec",        cost: 180, desc: "Race-validated paddle-shift unit — peak response and powerflow efficiency",   speed: 1.04, accel: 1.10, cornering: 1.03, visual: {"strakes": 5, "fin": 1, "strakeH": 0.22, "finSY": 0.22, "finSZ": 0.4, "casing": 3, "louvres": 5, "heat": 1}, visualTier: 2 },
        { id: "seamless_shift",label: "Seamless Shift", cost: 210, desc: "Continuous torque transfer — maximum shift response with minimal interruption", speed: 1.05, accel: 1.12, cornering: 1.02, visual: { strakes: 5, fin: 1, strakeH: 0.20, finSY: 0.18, finSZ: 0.36, casing: 2, louvres: 6, heat: 1 }, visualTier: 2 },
        { id: "wide_stack",    label: "Wide Stack",     cost:  60, desc: "Widely spaced upper gears — carries speed down the longest straights",         speed: 1.05, accel: 0.96, visual: { strakes: 2, fin: 0, strakeH: 0.18, casing: 1, louvres: 1, heat: 1, caseWidth: 1.14 }, visualTier: 1 },
        { id: "quickshift",    label: "Quickshift",     cost: 110, desc: "Reduced shift latency — less time off the throttle through the gears",        accel: 1.09, speed: 1.01, visual: { strakes: 4, fin: 1, strakeH: 0.16, finSY: 0.19, finSZ: 0.26, casing: 2, louvres: 3, heat: 0 , heatFins: 4, ribs: 1}, visualTier: 2 },
        { id: "titanium_case", label: "Titanium Case",  cost: 150, desc: "Titanium bellhousing — stiff, light, and kind to the rear suspension mounts", accel: 1.09, speed: 1.03, cornering: 1.02, visual: { strakes: 5, fin: 1, strakeH: 0.21, finSY: 0.20, finSZ: 0.34, casing: 3, louvres: 2, heat: 1, caseWidth: 0.86 , heatFins: 3, ribs: 2}, visualTier: 2 },
        { id: "sig_rb_shortcase", label: "Faenza Shortcase", cost: 210, teams: ["racingbulls"], tag: "SIGNATURE", equivalent: "seamless_shift",
          desc: "Racing Bulls signature compact casing — Seamless Shift performance with a taller crash fin", speed: 1.05, accel: 1.12, cornering: 1.02, visual: { strakes: 5, fin: 1, strakeH: 0.18, finSY: 0.24, finSZ: 0.30, casing: 2, louvres: 6, heat: 1 , heatFins: 2, ribs: 0}, visualTier: 2 },
        { id: "sig_ferrari_seamless", label: "Maranello Seamless", cost: 210, teams: ["ferrari"], tag: "SIGNATURE", equivalent: "seamless_shift",
          desc: "Ferrari signature shift package — Seamless Shift performance in a sculpted red-crackle casing", speed: 1.05, accel: 1.12, cornering: 1.02, visual: { strakes: 4, fin: 1, strakeH: 0.21, finSY: 0.16, finSZ: 0.38, casing: 3, louvres: 4, heat: 1 , heatFins: 3, ribs: 1}, visualTier: 2 },
        { id: "sig_williams_longshift", label: "Grove Longshift", cost: 40, teams: ["williams"], tag: "SIGNATURE", equivalent: "long_ratio",
          desc: "Williams signature top-speed stack — Long Ratio performance with a heat-wrapped slim case", speed: 1.04, accel: 0.97, visual: { strakes: 3, fin: 0, strakeH: 0.18, casing: 1, louvres: 0, heat: 1, caseWidth: 0.92 , heatFins: 4, ribs: 1}, visualTier: 1 },
        { id: "sig_mercedes_gbox", label: "Brackley Gearcase", cost: 90, teams: ["mercedes"], tag: "SIGNATURE", equivalent: "sequential_pro",
          desc: "Mercedes signature gearcase — Sequential Pro performance with a 4-strake diffuser", speed: 1.02, accel: 1.07, visual: { strakes: 4, fin: 1, strakeH: 0.163, finSY: 0.17, finSZ: 0.32, casing: 2, louvres: 3, heat: 1, caseWidth: 0.92 , heatFins: 0, ribs: 2}, visualTier: 2 },
        { id: "sig_mclaren_gbox", label: "Woking Gearcase", cost: 210, teams: ["mclaren"], tag: "SIGNATURE", equivalent: "seamless_shift",
          desc: "McLaren signature gearcase — Seamless Shift performance with a 5-strake diffuser", speed: 1.05, accel: 1.12, cornering: 1.02, visual: { strakes: 5, fin: 1, strakeH: 0.196, finSY: 0.18, finSZ: 0.36, casing: 2, louvres: 5, heat: 1, caseWidth: 0.96 , heatFins: 0, ribs: 1}, visualTier: 2 },
        { id: "sig_redbull_gbox", label: "Milton Keynes Gearcase", cost: 70, teams: ["redbull"], tag: "SIGNATURE", equivalent: "short_stack",
          desc: "Red Bull signature gearcase — Short Stack performance with a 4-strake diffuser", accel: 1.08, cornering: 1.03, visual: { strakes: 4, fin: 1, strakeH: 0.152, finSY: 0.11, finSZ: 0.22, casing: 2, louvres: 2, heat: 0, caseWidth: 1.02 , heatFins: 2, ribs: 2}, visualTier: 2 },
        { id: "sig_alpine_gbox", label: "Enstone Gearcase", cost: 50, teams: ["alpine"], tag: "SIGNATURE", equivalent: "close_ratio",
          desc: "Alpine signature gearcase — Close Ratio performance with a 2-strake diffuser", speed: 0.98, accel: 1.06, visual: { strakes: 2, fin: 0, strakeH: 0.135, casing: 1, louvres: 3, heat: 0, caseWidth: 1.08 , heatFins: 3, ribs: 1}, visualTier: 1 },
        { id: "sig_haas_gbox", label: "Kannapolis Gearcase", cost: 130, teams: ["haas"], tag: "SIGNATURE", equivalent: "carbon_case",
          desc: "Haas signature gearcase — Carbon Case performance with a 3-strake diffuser", speed: 1.02, accel: 1.08, cornering: 1.02, visual: { strakes: 3, fin: 1, strakeH: 0.2, finSY: 0.15, finSZ: 0.3, casing: 3, louvres: 1, heat: 1, caseWidth: 1.1 , heatFins: 4, ribs: 2}, visualTier: 2 },
        { id: "sig_audi_gbox", label: "Neuburg Gearcase", cost: 90, teams: ["audi"], tag: "SIGNATURE", equivalent: "sequential_pro",
          desc: "Audi signature gearcase — Sequential Pro performance with a 5-strake diffuser", speed: 1.02, accel: 1.07, visual: { strakes: 5, fin: 1, strakeH: 0.18, finSY: 0.17, finSZ: 0.32, casing: 2, louvres: 4, heat: 1, caseWidth: 1.12 , heatFins: 2, ribs: 2}, visualTier: 2 },
        { id: "sig_astonmartin_gbox", label: "Silverstone Gearcase", cost: 180, teams: ["astonmartin"], tag: "SIGNATURE", equivalent: "f1_spec",
          desc: "Aston Martin signature gearcase — F1 Spec performance with a 5-strake diffuser", speed: 1.04, accel: 1.1, cornering: 1.03, visual: { strakes: 5, fin: 1, strakeH: 0.224, finSY: 0.22, finSZ: 0.4, casing: 3, louvres: 5, heat: 1, caseWidth: 1.04 }, visualTier: 2 },
        { id: "sig_cadillac_gbox", label: "Detroit Gearcase", cost: 130, teams: ["cadillac"], tag: "SIGNATURE", equivalent: "carbon_case",
          desc: "Cadillac signature gearcase — Carbon Case performance with a 3-strake diffuser", speed: 1.02, accel: 1.08, cornering: 1.02, visual: { strakes: 3, fin: 1, strakeH: 0.205, finSY: 0.15, finSZ: 0.3, casing: 3, louvres: 2, heat: 1, caseWidth: 1.16 }, visualTier: 2 },
      ],
    },
    {
      id: "fuel", label: "FUEL",
      options: [
        { id: "standard",      label: "Standard",       cost:   0, desc: "Baseline pump-spec fuel — meets FIA minimum grade",                          speed: 1.00, accel: 1.00, visual: { cap: [0.55, 0.52, 0.6], flame: [1.15, 0.42, 0.14], fxFlame: [2.6, 1.05, 0.25], line: 1 }, visualTier: 1 },
        { id: "high_octane",   label: "High Octane",    cost:  40, desc: "Higher octane blend — cleaner combustion and accel improvement",             accel: 1.05, visual: {"cap": [1.5, 1.15, 0.18], "flame": [1.75, 1.4, 0.45], "fxFlame": [2.7, 2.1, 0.7]}, visualTier: 1 },
        { id: "biofuel",       label: "Biofuel 100",    cost:  50, desc: "FIA-sustainable 100% biofuel — consistent burn and slight braking gain",     braking: 1.04, accel: 1.03, visual: {"cap": [0.18, 1.35, 0.5], "flame": [0.35, 1.65, 0.42], "fxFlame": [1.7, 1.9, 0.55]}, visualTier: 1 },
        { id: "race_blend",    label: "Race Blend",     cost:  90, desc: "F1-regulation compound — refined energy density for speed and accel",        speed: 1.02, accel: 1.06, visual: {"cap": [1.6, 0.6, 0.14], "flame": [1.95, 0.72, 0.14], "fxFlame": [2.9, 1.1, 0.25]}, visualTier: 1 },
        { id: "quali_mix",     label: "Qualifying Mix", cost: 150, desc: "Maximum energy density — qualifying-spec fuel load for peak performance",    speed: 1.04, accel: 1.08, visual: { breather: 1,"cap": [0.95, 0.28, 1.5], "flame": [1.25, 0.35, 1.75], "fxFlame": [1.5, 1.7, 2.4], hatch: 1}, visualTier: 2 },
        { id: "custom_formula",label: "Custom Formula", cost: 200, desc: "Team-developed proprietary blend — marginal all-metric gains",               speed: 1.05, accel: 1.09, cornering: 1.02, braking: 1.02, visual: { breather: 2,"cap": [1.9, 0.25, 1.25], "flame": [1.85, 0.25, 1.4], "fxFlame": [2.6, 0.5, 2.1], vent: 1}, visualTier: 2 },
        { id: "efuel_dense",   label: "Dense E-Fuel",   cost: 175, desc: "Synthetic high-density blend — clean burn with balanced race performance",      speed: 1.045, accel: 1.085, braking: 1.01, visual: { cap: [0.12, 1.25, 1.65], flame: [0.25, 1.20, 1.95], fxFlame: [0.55, 1.75, 2.75] , hatch: 1}, visualTier: 2 },
        // Filler-hardware specs — the pit-lane coupling on the cover is the tell.
        { id: "quick_fill",    label: "Quick Fill",     cost:  60, desc: "Twin-coupling rig fitting — a cooler, denser fill for a stronger opening lap", accel: 1.04, braking: 1.02, visual: { cap: [0.85, 0.86, 0.90], flame: [1.30, 0.95, 0.35], fxFlame: [2.4, 1.6, 0.6], line: 1, filler: 2 , hatch: 1, vent: 1}, visualTier: 1 },
        { id: "cold_blend",    label: "Cold Blend",     cost: 120, desc: "Chilled high-density charge — cleaner combustion and a broader torque plateau", speed: 1.03, accel: 1.06, visual: { breather: 1, cap: [0.30, 0.80, 1.60], flame: [0.55, 0.95, 1.85], fxFlame: [1.1, 1.6, 2.7], line: 1, filler: 1 , hatch: 1}, visualTier: 1 },
        { id: "hydro_synth",   label: "Hydro-Synth",    cost: 190, desc: "Hydrogen-derived synthetic — near-custom performance with a clean cold burn",   speed: 1.05, accel: 1.08, braking: 1.03, visual: { breather: 2, cap: [1.75, 1.60, 0.30], flame: [1.90, 1.75, 0.40], fxFlame: [2.9, 2.5, 0.7], line: 2, filler: 2 }, visualTier: 2 },
        { id: "sig_alpine_efuel", label: "Viry E-Fuel", cost: 175, teams: ["alpine"], tag: "SIGNATURE", equivalent: "efuel_dense",
          desc: "Alpine signature synthetic blend — Dense E-Fuel performance with a blue-pink burn", speed: 1.045, accel: 1.085, braking: 1.01, visual: { breather: 1, cap: [0.10, 0.72, 1.85], flame: [0.65, 0.32, 1.95], fxFlame: [0.85, 0.65, 2.85], line: 2 , hatch: 1}, visualTier: 2 },
        { id: "sig_haas_blend", label: "Kannapolis Blend", cost: 90, teams: ["haas"], tag: "SIGNATURE", equivalent: "race_blend",
          desc: "Haas signature race fuel — Race Blend performance with a stars-and-stripes red burn", speed: 1.02, accel: 1.06, visual: { cap: [1.70, 0.20, 0.15], flame: [1.90, 0.30, 0.25], fxFlame: [2.90, 0.60, 0.40], line: 2 , hatch: 1}, visualTier: 1 },
        { id: "sig_mercedes_fuel", label: "Brackley Blend", cost: 175, teams: ["mercedes"], tag: "SIGNATURE", equivalent: "efuel_dense",
          desc: "Mercedes signature blend — Dense E-Fuel performance with a quick-fill coupling", speed: 1.045, accel: 1.085, braking: 1.01, visual: { breather: 1, cap: [0, 1.2, 1.12], flame: [0.35, 1.55, 1.45], fxFlame: [0.525, 2.325, 2.175], filler: 1, line: 1 , hatch: 1, vent: 1}, visualTier: 2 },
        { id: "sig_ferrari_fuel", label: "Maranello Blend", cost: 90, teams: ["ferrari"], tag: "SIGNATURE", equivalent: "race_blend",
          desc: "Ferrari signature blend — Race Blend performance with twin filler couplings", speed: 1.02, accel: 1.06, visual: { breather: 2, cap: [1.52, 0.08, 0.064], flame: [1.9, 0.3, 0.15], fxFlame: [2.85, 0.45, 0.225], filler: 2, line: 2 , vent: 1}, visualTier: 1 },
        { id: "sig_mclaren_fuel", label: "Woking Blend", cost: 175, teams: ["mclaren"], tag: "SIGNATURE", equivalent: "efuel_dense",
          desc: "McLaren signature blend — Dense E-Fuel performance with a quick-fill coupling", speed: 1.045, accel: 1.085, braking: 1.01, visual: { breather: 1, cap: [1.6, 0.8, 0], flame: [1.95, 0.95, 0.1], fxFlame: [2.925, 1.425, 0.15], filler: 1, line: 2 , hatch: 1}, visualTier: 2 },
        { id: "sig_redbull_fuel", label: "Milton Keynes Blend", cost: 90, teams: ["redbull"], tag: "SIGNATURE", equivalent: "race_blend",
          desc: "Red Bull signature blend — Race Blend performance with a single-point filler", speed: 1.02, accel: 1.06, visual: { cap: [1.52, 1.248, 0], flame: [1.85, 1.45, 0.2], fxFlame: [2.775, 2.175, 0.3], filler: 0, line: 1 , hatch: 1}, visualTier: 1 },
        { id: "sig_racingbulls_fuel", label: "Faenza Blend", cost: 40, teams: ["racingbulls"], tag: "SIGNATURE", equivalent: "high_octane",
          desc: "Racing Bulls signature blend — High Octane performance with a quick-fill coupling", accel: 1.05, visual: { breather: 1, cap: [0.32, 0.48, 1.52], flame: [0.45, 0.6, 1.95], fxFlame: [0.675, 0.9, 2.925], filler: 1, line: 1 , hatch: 1}, visualTier: 1 },
        { id: "sig_williams_fuel", label: "Grove Blend", cost: 40, teams: ["williams"], tag: "SIGNATURE", equivalent: "high_octane",
          desc: "Williams signature blend — High Octane performance with a single-point filler", accel: 1.05, visual: { cap: [0.32, 0.88, 1.52], flame: [0.55, 1.05, 1.9], fxFlame: [0.825, 1.575, 2.85], filler: 0, line: 1 , vent: 1}, visualTier: 1 },
        { id: "sig_audi_fuel", label: "Neuburg Blend", cost: 50, teams: ["audi"], tag: "SIGNATURE", equivalent: "biofuel",
          desc: "Audi signature blend — Biofuel 100 performance with a quick-fill coupling", accel: 1.03, braking: 1.04, visual: { breather: 2, cap: [1.568, 0.448, 0.08], flame: [2, 0.45, 0.15], fxFlame: [3, 0.675, 0.225], filler: 1, line: 2 }, visualTier: 1 },
        { id: "sig_astonmartin_fuel", label: "Silverstone Blend", cost: 200, teams: ["astonmartin"], tag: "SIGNATURE", equivalent: "custom_formula",
          desc: "Aston Martin signature blend — Custom Formula performance with twin filler couplings", speed: 1.05, accel: 1.09, cornering: 1.02, braking: 1.02, visual: { breather: 2, cap: [1.152, 1.408, 0.176], flame: [1.1, 1.9, 0.3], fxFlame: [1.65, 2.85, 0.45], filler: 2, line: 2 }, visualTier: 2 },
        { id: "sig_cadillac_fuel", label: "Detroit Blend", cost: 175, teams: ["cadillac"], tag: "SIGNATURE", equivalent: "efuel_dense",
          desc: "Cadillac signature blend — Dense E-Fuel performance with twin filler couplings", speed: 1.045, accel: 1.085, braking: 1.01, visual: { breather: 1, cap: [1.36, 1.12, 0.512], flame: [1.8, 1.35, 0.5], fxFlame: [2.7, 2.025, 0.75], filler: 2, line: 1 }, visualTier: 2 },
      ],
    },
    {
      id: "exhaust", label: "EXHAUST",
      options: [
        { id: "stock",      label: "Stock",          cost:   0, desc: "Factory tailpipe, sized to the power unit's own plumbing",                    visual: { pipes: null, bore: 1, flare: 0, wastegate: 0, wrap: 0 , shield: 1}, visualTier: 1 },
        { id: "sport_cat",  label: "Sport Cat",      cost:  30, desc: "Freer catalyst section — a little less back-pressure everywhere",             accel: 1.03, visual: { pipes: null, bore: 1.08, flare: 0, wastegate: 0, wrap: 0 , shield: 1}, visualTier: 1 },
        { id: "free_flow",  label: "Free Flow",      cost:  60, desc: "Straight-through primaries — cleaner scavenging high in the rev range",       speed: 1.03, accel: 1.03, visual: { pipes: null, bore: 1.18, flare: 0, wastegate: 0, wrap: 1 , lip: 1, shield: 1}, visualTier: 1 },
        { id: "megaphone",  label: "Megaphone",      cost:  90, desc: "Flared megaphone exit — strong mid-range for a little top end",               speed: 1.01, accel: 1.06, visual: { pipes: 1, bore: 1.22, flare: 1, wastegate: 0, wrap: 0 , lip: 2, shield: 1}, visualTier: 2 },
        { id: "twin_gate",  label: "Twin Wastegate", cost: 110, desc: "Twin wastegate stacks — sharper boost response out of slow corners",          speed: 1.01, accel: 1.07, visual: { pipes: null, bore: 1.10, flare: 0, wastegate: 2, wrap: 1 , lip: 1}, visualTier: 2 },
        { id: "inconel",    label: "Inconel Race",   cost: 140, desc: "Thin-wall Inconel system — mass saving with a broad power gain",              speed: 1.04, accel: 1.05, visual: { pipes: 3, bore: 1.05, flare: 0, wastegate: 0, wrap: 1 , lip: 2, shield: 1}, visualTier: 2 },
        { id: "tri_exit",   label: "Tri-Exit",       cost: 170, desc: "Three-pipe exit — the classic scavenging layout in race trim",                speed: 1.04, accel: 1.07, visual: { pipes: 3, bore: 1.16, flare: 0.5, wastegate: 2, wrap: 0 , lip: 1, shield: 1}, visualTier: 2 },
        { id: "hyper_scav", label: "Hyper Scavenge", cost: 200, desc: "Pulse-tuned scavenging — peak flow at every point in the rev range",          speed: 1.05, accel: 1.08, visual: { pipes: 3, bore: 1.30, flare: 1, wastegate: 2, wrap: 1 }, visualTier: 2 },
        { id: "sig_mercedes_exh", label: "Brackley Exhaust", cost: 60, teams: ["mercedes"], tag: "SIGNATURE", equivalent: "free_flow",
          desc: "Mercedes signature exhaust — Free Flow performance with a flared megaphone tip", speed: 1.03, accel: 1.03, visual: { pipes: 1, bore: 1.121, flare: 0.5, wastegate: 0, wrap: 0 , lip: 2, shield: 1}, visualTier: 1 },
        { id: "sig_ferrari_exh", label: "Maranello Exhaust", cost: 170, teams: ["ferrari"], tag: "SIGNATURE", equivalent: "tri_exit",
          desc: "Ferrari signature exhaust — Tri-Exit performance with a three-pipe exit", speed: 1.04, accel: 1.07, visual: { pipes: 3, bore: 1.206, flare: 1, wastegate: 2, wrap: 1 , lip: 1}, visualTier: 2 },
        { id: "sig_mclaren_exh", label: "Woking Exhaust", cost: 140, teams: ["mclaren"], tag: "SIGNATURE", equivalent: "inconel",
          desc: "McLaren signature exhaust — Inconel Race performance with a three-pipe exit", speed: 1.04, accel: 1.05, visual: { pipes: 3, bore: 1.029, flare: 0.5, wastegate: 2, wrap: 0 , shield: 1}, visualTier: 2 },
        { id: "sig_redbull_exh", label: "Milton Keynes Exhaust", cost: 110, teams: ["redbull"], tag: "SIGNATURE", equivalent: "twin_gate",
          desc: "Red Bull signature exhaust — Twin Wastegate performance with a three-pipe exit", speed: 1.01, accel: 1.07, visual: { pipes: 3, bore: 1.122, flare: 1, wastegate: 0, wrap: 0 , lip: 2}, visualTier: 2 },
        { id: "sig_alpine_exh", label: "Enstone Exhaust", cost: 30, teams: ["alpine"], tag: "SIGNATURE", equivalent: "sport_cat",
          desc: "Alpine signature exhaust — Sport Cat performance with a flared megaphone tip", accel: 1.03, visual: { pipes: 1, bore: 1.091, flare: 0.5, wastegate: 2, wrap: 1 , lip: 2, shield: 1}, visualTier: 1 },
        { id: "sig_racingbulls_exh", label: "Faenza Exhaust", cost: 60, teams: ["racingbulls"], tag: "SIGNATURE", equivalent: "free_flow",
          desc: "Racing Bulls signature exhaust — Free Flow performance with a single tuned pipe", speed: 1.03, accel: 1.03, visual: { pipes: 1, bore: 1.145, flare: 0, wastegate: 0, wrap: 0 , lip: 2}, visualTier: 1 },
        { id: "sig_haas_exh", label: "Kannapolis Exhaust", cost: 0, teams: ["haas"], tag: "SIGNATURE", equivalent: "stock",
          desc: "Haas signature exhaust — Stock performance with a single tuned pipe", visual: { pipes: 1, bore: 1.05, flare: 0, wastegate: 0, wrap: 1 , lip: 2, shield: 1}, visualTier: 1 },
        { id: "sig_williams_exh", label: "Grove Exhaust", cost: 90, teams: ["williams"], tag: "SIGNATURE", equivalent: "megaphone",
          desc: "Williams signature exhaust — Megaphone performance with a single tuned pipe", speed: 1.01, accel: 1.06, visual: { pipes: 1, bore: 1.135, flare: 0, wastegate: 0, wrap: 0 }, visualTier: 2 },
        { id: "sig_audi_exh", label: "Neuburg Exhaust", cost: 110, teams: ["audi"], tag: "SIGNATURE", equivalent: "twin_gate",
          desc: "Audi signature exhaust — Twin Wastegate performance with a three-pipe exit", speed: 1.01, accel: 1.07, visual: { pipes: 3, bore: 1.133, flare: 1, wastegate: 2, wrap: 1 }, visualTier: 2 },
        { id: "sig_astonmartin_exh", label: "Silverstone Exhaust", cost: 140, teams: ["astonmartin"], tag: "SIGNATURE", equivalent: "inconel",
          desc: "Aston Martin signature exhaust — Inconel Race performance with a three-pipe exit", speed: 1.04, accel: 1.05, visual: { pipes: 3, bore: 1.04, flare: 1, wastegate: 0, wrap: 0 }, visualTier: 2 },
        { id: "sig_cadillac_exh", label: "Detroit Exhaust", cost: 200, teams: ["cadillac"], tag: "SIGNATURE", equivalent: "hyper_scav",
          desc: "Cadillac signature exhaust — Hyper Scavenge performance with a flared megaphone tip", speed: 1.05, accel: 1.08, visual: { pipes: 1, bore: 1.378, flare: 0.5, wastegate: 2, wrap: 1 }, visualTier: 2 },
      ],
    },
    {
      id: "floor", label: "FLOOR",
      options: [
        { id: "standard",    label: "Standard",       cost:   0, desc: "Regulation floor with the stock fence array",                                 visual: { fences: 5, fenceH: 1, skid: 0, edgeLip: 0 }, visualTier: 1 },
        { id: "stripped",    label: "Stripped",       cost:   0, desc: "Fences removed for minimum drag — quick in a straight line, loose in a corner", speed: 1.04, cornering: 0.90, visual: { fences: 0, fenceH: 1, skid: 0, edgeLip: 0 }, visualTier: 0 },
        { id: "sealed_edge", label: "Sealed Edge",    cost:  50, desc: "Sealed floor edge — steadier underbody load through medium-speed corners",     speed: 0.99, cornering: 1.06, visual: { fences: 4, fenceH: 1.15, skid: 0, edgeLip: 0.5 , gurney: 1}, visualTier: 1 },
        { id: "ti_skids",    label: "Titanium Skids", cost:  60, desc: "Titanium skid blocks — run the plank lower without wearing it through",        cornering: 1.04, braking: 1.04, visual: { fences: 5, fenceH: 1, skid: 2, edgeLip: 0 }, visualTier: 1 },
        { id: "fence_array", label: "Fence Array",    cost:  90, desc: "Full fence array — keeps the floor sealed when the car is yawed",              speed: 0.98, cornering: 1.10, visual: { fences: 6, fenceH: 1.3, skid: 0, edgeLip: 0.3 , plank: 1, gurney: 1, scroll: 1}, visualTier: 2 },
        { id: "edge_wing",   label: "Edge Wing",      cost: 120, desc: "Floor-edge wing — extra load for a modest drag penalty",                       speed: 0.98, cornering: 1.13, braking: 1.02, visual: { fences: 5, fenceH: 1.2, skid: 1, edgeLip: 1 , gurney: 1}, visualTier: 2 },
        { id: "venturi",     label: "Venturi Floor",  cost: 190, desc: "Full venturi package — maximum underbody load at every speed",                 speed: 0.96, cornering: 1.16, braking: 1.04, visual: { fences: 6, fenceH: 1.45, skid: 2, edgeLip: 1 , plank: 1, scroll: 1}, visualTier: 2 },
        { id: "sig_mercedes_floor", label: "Brackley Floor", cost: 120, teams: ["mercedes"], tag: "SIGNATURE", equivalent: "edge_wing",
          desc: "Mercedes signature floor — Edge Wing performance with a 5-fence floor edge on titanium skids", speed: 0.98, cornering: 1.13, braking: 1.02, visual: { fences: 5, fenceH: 1.164, skid: 1, edgeLip: 1 , plank: 1}, visualTier: 2 },
        { id: "sig_ferrari_floor", label: "Maranello Floor", cost: 190, teams: ["ferrari"], tag: "SIGNATURE", equivalent: "venturi",
          desc: "Ferrari signature floor — Venturi Floor performance with a 6-fence floor edge on titanium skids", speed: 0.96, cornering: 1.16, braking: 1.04, visual: { fences: 6, fenceH: 1.523, skid: 2, edgeLip: 1 , plank: 1}, visualTier: 2 },
        { id: "sig_mclaren_floor", label: "Woking Floor", cost: 190, teams: ["mclaren"], tag: "SIGNATURE", equivalent: "venturi",
          desc: "McLaren signature floor — Venturi Floor performance with a 6-fence floor edge on titanium skids", speed: 0.96, cornering: 1.16, braking: 1.04, visual: { fences: 6, fenceH: 1.378, skid: 1, edgeLip: 1 , plank: 1}, visualTier: 2 },
        { id: "sig_redbull_floor", label: "Milton Keynes Floor", cost: 90, teams: ["redbull"], tag: "SIGNATURE", equivalent: "fence_array",
          desc: "Red Bull signature floor — Fence Array performance with a 6-fence floor edge on titanium skids", speed: 0.98, cornering: 1.1, visual: { fences: 6, fenceH: 1.391, skid: 2, edgeLip: 0.55 , plank: 1}, visualTier: 2 },
        { id: "sig_alpine_floor", label: "Enstone Floor", cost: 50, teams: ["alpine"], tag: "SIGNATURE", equivalent: "sealed_edge",
          desc: "Alpine signature floor — Sealed Edge performance with a 4-fence floor edge on titanium skids", speed: 0.99, cornering: 1.06, visual: { fences: 4, fenceH: 1.173, skid: 1, edgeLip: 0.5 , plank: 1, gurney: 1}, visualTier: 1 },
        { id: "sig_racingbulls_floor", label: "Faenza Floor", cost: 60, teams: ["racingbulls"], tag: "SIGNATURE", equivalent: "ti_skids",
          desc: "Racing Bulls signature floor — Titanium Skids performance with a 5-fence floor edge", cornering: 1.04, braking: 1.04, visual: { fences: 5, fenceH: 0.98, skid: 0, edgeLip: 0 , gurney: 1, scroll: 1}, visualTier: 1 },
        { id: "sig_haas_floor", label: "Kannapolis Floor", cost: 0, teams: ["haas"], tag: "SIGNATURE", equivalent: "stripped",
          desc: "Haas signature floor — Stripped performance with bare titanium skids and no fences", speed: 1.04, cornering: 0.9, visual: { fences: 0, fenceH: 1.04, skid: 2, edgeLip: 0 , plank: 1, gurney: 1}, visualTier: 0 },
        { id: "sig_williams_floor", label: "Grove Floor", cost: 0, teams: ["williams"], tag: "SIGNATURE", equivalent: "stripped",
          desc: "Williams signature floor — Stripped performance with a stripped floor edge", speed: 1.04, cornering: 0.9, visual: { fences: 0, fenceH: 0.94, skid: 1, edgeLip: 0 }, visualTier: 0 },
        { id: "sig_audi_floor", label: "Neuburg Floor", cost: 50, teams: ["audi"], tag: "SIGNATURE", equivalent: "sealed_edge",
          desc: "Audi signature floor — Sealed Edge performance with a 5-fence floor edge on titanium skids", speed: 0.99, cornering: 1.06, visual: { fences: 5, fenceH: 1.253, skid: 2, edgeLip: 0.75 }, visualTier: 1 },
        { id: "sig_astonmartin_floor", label: "Silverstone Floor", cost: 120, teams: ["astonmartin"], tag: "SIGNATURE", equivalent: "edge_wing",
          desc: "Aston Martin signature floor — Edge Wing performance with a 6-fence floor edge on titanium skids", speed: 0.98, cornering: 1.13, braking: 1.02, visual: { fences: 6, fenceH: 1.236, skid: 1, edgeLip: 1 }, visualTier: 2 },
        { id: "sig_cadillac_floor", label: "Detroit Floor", cost: 90, teams: ["cadillac"], tag: "SIGNATURE", equivalent: "fence_array",
          desc: "Cadillac signature floor — Fence Array performance with a 5-fence floor edge on titanium skids", speed: 0.98, cornering: 1.1, visual: { fences: 5, fenceH: 1.313, skid: 2, edgeLip: 0.3 }, visualTier: 2 },
      ],
    },
    {
      id: "cockpit", label: "COCKPIT",
      options: [
        { id: "standard",   label: "Standard",      cost:   0, desc: "Regulation halo and cockpit surround",                                       visual: { haloBlade: 0, haloWing: 0, camPods: 0, screen: 0 }, visualTier: 1 },
        { id: "faired_halo",label: "Faired Halo",   cost:  40, desc: "Aero fairing over the halo — cleans up the flow to the airbox",              speed: 1.02, visual: { halo: 1, haloBlade: 1, haloWing: 0, camPods: 0, screen: 0 }, visualTier: 1 },
        { id: "twin_cam",   label: "Twin T-Cam",    cost:  30, desc: "Second camera pod — broadcast spec, and a touch more roll-hoop drag",        speed: 0.99, cornering: 1.02, visual: { headrest: 1, haloBlade: 0, haloWing: 0, camPods: 2, screen: 0 }, visualTier: 1 },
        { id: "deflector",  label: "Deflector",     cost:  60, desc: "Cockpit deflector — steadier air over the driver at speed",                  speed: 1.03, braking: 1.02, visual: { headrest: 1, haloBlade: 1, haloWing: 0, camPods: 1, screen: 1 }, visualTier: 2 },
        { id: "halo_wing",  label: "Halo Wing",     cost: 110, desc: "Upper halo flap — real downforce from the cockpit structure itself",         speed: 0.99, cornering: 1.07, visual: { headrest: 2, haloBlade: 1, haloWing: 1, camPods: 1, screen: 0 }, visualTier: 2 },
        { id: "full_shroud",label: "Full Shroud",   cost: 160, desc: "Fully faired halo with flap and deflector — the complete cockpit package",   speed: 1.01, cornering: 1.08, braking: 1.02, visual: { halo: 2, headrest: 2, haloBlade: 2, haloWing: 1, camPods: 2, screen: 1 }, visualTier: 2 },
        { id: "sig_mercedes_cpit", label: "Brackley Cockpit", cost: 110, teams: ["mercedes"], tag: "SIGNATURE", equivalent: "halo_wing",
          desc: "Mercedes signature cockpit — Halo Wing performance with a bladed halo", speed: 0.99, cornering: 1.07, visual: { halo: 1, headrest: 1, haloBlade: 2, haloWing: 1, camPods: 1, screen: 0 }, visualTier: 2 },
        { id: "sig_ferrari_cpit", label: "Maranello Cockpit", cost: 160, teams: ["ferrari"], tag: "SIGNATURE", equivalent: "full_shroud",
          desc: "Ferrari signature cockpit — Full Shroud performance with a fully faired halo and an upper flap", speed: 1.01, cornering: 1.08, braking: 1.02, visual: { halo: 2, headrest: 2, haloBlade: 2, haloWing: 1, camPods: 0, screen: 1 }, visualTier: 2 },
        { id: "sig_mclaren_cpit", label: "Woking Cockpit", cost: 110, teams: ["mclaren"], tag: "SIGNATURE", equivalent: "halo_wing",
          desc: "McLaren signature cockpit — Halo Wing performance with a bladed halo and an upper flap", speed: 0.99, cornering: 1.07, visual: { halo: 0, headrest: 2, haloBlade: 1, haloWing: 1, camPods: 2, screen: 1 }, visualTier: 2 },
        { id: "sig_redbull_cpit", label: "Milton Keynes Cockpit", cost: 60, teams: ["redbull"], tag: "SIGNATURE", equivalent: "deflector",
          desc: "Red Bull signature cockpit — Deflector performance with an upper halo flap", speed: 1.03, braking: 1.02, visual: { halo: 1, headrest: 2, haloBlade: 0, haloWing: 1, camPods: 1, screen: 0 }, visualTier: 2 },
        { id: "sig_alpine_cpit", label: "Enstone Cockpit", cost: 40, teams: ["alpine"], tag: "SIGNATURE", equivalent: "faired_halo",
          desc: "Alpine signature cockpit — Faired Halo performance with a bladed halo and an upper flap", speed: 1.02, visual: { halo: 0, headrest: 1, haloBlade: 1, haloWing: 1, camPods: 0, screen: 0 }, visualTier: 1 },
        { id: "sig_racingbulls_cpit", label: "Faenza Cockpit", cost: 30, teams: ["racingbulls"], tag: "SIGNATURE", equivalent: "twin_cam",
          desc: "Racing Bulls signature cockpit — Twin T-Cam performance with a bare halo", speed: 0.99, cornering: 1.02, visual: { halo: 1, headrest: 0, haloBlade: 0, haloWing: 0, camPods: 1, screen: 1 }, visualTier: 1 },
        { id: "sig_haas_cpit", label: "Kannapolis Cockpit", cost: 0, teams: ["haas"], tag: "SIGNATURE", equivalent: "standard",
          desc: "Haas signature cockpit — Standard performance with an upper halo flap", visual: { halo: 0, headrest: 1, haloBlade: 0, haloWing: 1, camPods: 0, screen: 0 }, visualTier: 1 },
        { id: "sig_williams_cpit", label: "Grove Cockpit", cost: 40, teams: ["williams"], tag: "SIGNATURE", equivalent: "faired_halo",
          desc: "Williams signature cockpit — Faired Halo performance with a bladed halo", speed: 1.02, visual: { halo: 2, headrest: 0, haloBlade: 1, haloWing: 0, camPods: 2, screen: 1 }, visualTier: 1 },
        { id: "sig_audi_cpit", label: "Neuburg Cockpit", cost: 60, teams: ["audi"], tag: "SIGNATURE", equivalent: "deflector",
          desc: "Audi signature cockpit — Deflector performance with a fully faired halo", speed: 1.03, braking: 1.02, visual: { halo: 2, headrest: 1, haloBlade: 2, haloWing: 0, camPods: 1, screen: 1 }, visualTier: 2 },
        { id: "sig_astonmartin_cpit", label: "Silverstone Cockpit", cost: 160, teams: ["astonmartin"], tag: "SIGNATURE", equivalent: "full_shroud",
          desc: "Aston Martin signature cockpit — Full Shroud performance with a fully faired halo and an upper flap", speed: 1.01, cornering: 1.08, braking: 1.02, visual: { halo: 1, headrest: 1, haloBlade: 2, haloWing: 1, camPods: 1, screen: 1 }, visualTier: 2 },
        { id: "sig_cadillac_cpit", label: "Detroit Cockpit", cost: 30, teams: ["cadillac"], tag: "SIGNATURE", equivalent: "twin_cam",
          desc: "Cadillac signature cockpit — Twin T-Cam performance with a bladed halo", speed: 0.99, cornering: 1.02, visual: { halo: 0, headrest: 2, haloBlade: 1, haloWing: 0, camPods: 1, screen: 0 }, visualTier: 1 },
      ],
    },
    {
      id: "wheels", label: "WHEELS",
      options: [
        { id: "standard",  label: "Standard",     cost:   0, desc: "Regulation 18-inch rim with the stock aero cover",                          visual: { spokes: 0, tape: 0, dish: 0, nut: null }, visualTier: 1 },
        { id: "spoked",    label: "Spoked Rim",   cost:  40, desc: "Visible spoke blades — a little more brake cooling through the rim face",   braking: 1.04, visual: { spokes: 6, tape: 0, dish: 0, nut: [0.85, 0.72, 0.10] }, visualTier: 1 },
        { id: "dished",    label: "Dished Cover", cost:  60, desc: "Recessed cover face — cleaner flow off the wheel at speed",                 speed: 1.03, visual: { spokes: 0, tape: 0, dish: 1, nut: [0.70, 0.72, 0.78] , gunNut: 1}, visualTier: 1 },
        { id: "taped",     label: "Taped Rim",    cost:  50, desc: "Banded rim shoulder — seals the bead and marks the set at a glance",        cornering: 1.04, visual: { spokes: 0, tape: 1, dish: 0, nut: [0.95, 0.20, 0.15] , gunNut: 1}, visualTier: 1 },
        { id: "mag_forged",label: "Forged Mag",   cost: 110, desc: "Forged magnesium rim — real unsprung mass saved at every corner",           accel: 1.05, braking: 1.05, cornering: 1.03, visual: { deflector: 1, spokes: 8, tape: 0, dish: 1, nut: [0.60, 0.55, 0.30] }, visualTier: 2 },
        { id: "aero_disc", label: "Aero Disc",    cost: 130, desc: "Fully dished aero disc — top speed at the cost of brake cooling",           speed: 1.05, braking: 0.98, visual: { deflector: 1, spokes: 0, tape: 1, dish: 2, nut: [0.15, 0.60, 0.95] , gunNut: 1}, visualTier: 2 },
        { id: "works_rim", label: "Works Rim",    cost: 170, desc: "Works-spec rim package — the complete wheel, and it looks it",              speed: 1.03, accel: 1.04, cornering: 1.04, braking: 1.04, visual: { deflector: 2, spokes: 6, tape: 1, dish: 2, nut: [0.98, 0.62, 0.05] , gunNut: 1}, visualTier: 2 },
        { id: "sig_mercedes_rim", label: "Brackley Rim", cost: 110, teams: ["mercedes"], tag: "SIGNATURE", equivalent: "mag_forged",
          desc: "Mercedes signature rim — Forged Mag performance with a 7-spoke rim with a banded shoulder", accel: 1.05, cornering: 1.03, braking: 1.05, visual: { deflector: 1, spokes: 7, tape: 1, dish: 1, nut: [0, 0.75, 0.7] , gunNut: 1}, visualTier: 2 },
        { id: "sig_ferrari_rim", label: "Maranello Rim", cost: 170, teams: ["ferrari"], tag: "SIGNATURE", equivalent: "works_rim",
          desc: "Ferrari signature rim — Works Rim performance with a plain rim with a banded shoulder", speed: 1.03, accel: 1.04, cornering: 1.04, braking: 1.04, visual: { deflector: 2, spokes: 0, tape: 1, dish: 2, nut: [0.95, 0.05, 0.04] , gunNut: 1}, visualTier: 2 },
        { id: "sig_mclaren_rim", label: "Woking Rim", cost: 170, teams: ["mclaren"], tag: "SIGNATURE", equivalent: "works_rim",
          desc: "McLaren signature rim — Works Rim performance with a 8-spoke rim with a banded shoulder", speed: 1.03, accel: 1.04, cornering: 1.04, braking: 1.04, visual: { deflector: 2, spokes: 8, tape: 1, dish: 1, nut: [1, 0.5, 0] , gunNut: 1}, visualTier: 2 },
        { id: "sig_redbull_rim", label: "Milton Keynes Rim", cost: 40, teams: ["redbull"], tag: "SIGNATURE", equivalent: "spoked",
          desc: "Red Bull signature rim — Spoked Rim performance with a 5-spoke rim with a banded shoulder", braking: 1.04, visual: { deflector: 1, spokes: 5, tape: 1, dish: 2, nut: [0.95, 0.78, 0] , gunNut: 1}, visualTier: 1 },
        { id: "sig_alpine_rim", label: "Enstone Rim", cost: 50, teams: ["alpine"], tag: "SIGNATURE", equivalent: "taped",
          desc: "Alpine signature rim — Taped Rim performance with a 4-spoke rim with a banded shoulder", cornering: 1.04, visual: { deflector: 0, spokes: 4, tape: 1, dish: 1, nut: [1, 0.53, 0.74] , gunNut: 1}, visualTier: 1 },
        { id: "sig_racingbulls_rim", label: "Faenza Rim", cost: 60, teams: ["racingbulls"], tag: "SIGNATURE", equivalent: "dished",
          desc: "Racing Bulls signature rim — Dished Cover performance with a 6-spoke rim", speed: 1.03, visual: { deflector: 1, spokes: 6, tape: 0, dish: 0, nut: [0.2, 0.3, 0.95] , gunNut: 1}, visualTier: 1 },
        { id: "sig_haas_rim", label: "Kannapolis Rim", cost: 0, teams: ["haas"], tag: "SIGNATURE", equivalent: "standard",
          desc: "Haas signature rim — Standard performance with a 8-spoke rim", visual: { deflector: 0, spokes: 8, tape: 0, dish: 0, nut: [0.88, 0.88, 0.9] }, visualTier: 1 },
        { id: "sig_williams_rim", label: "Grove Rim", cost: 130, teams: ["williams"], tag: "SIGNATURE", equivalent: "aero_disc",
          desc: "Williams signature rim — Aero Disc performance with a plain rim", speed: 1.05, braking: 0.98, visual: { deflector: 2, spokes: 0, tape: 0, dish: 1, nut: [0.2, 0.55, 0.95] }, visualTier: 2 },
        { id: "sig_audi_rim", label: "Neuburg Rim", cost: 110, teams: ["audi"], tag: "SIGNATURE", equivalent: "mag_forged",
          desc: "Audi signature rim — Forged Mag performance with a 7-spoke rim with a banded shoulder", accel: 1.05, cornering: 1.03, braking: 1.05, visual: { deflector: 1, spokes: 7, tape: 1, dish: 2, nut: [0.98, 0.28, 0.05] }, visualTier: 2 },
        { id: "sig_astonmartin_rim", label: "Silverstone Rim", cost: 60, teams: ["astonmartin"], tag: "SIGNATURE", equivalent: "dished",
          desc: "Aston Martin signature rim — Dished Cover performance with a 6-spoke rim with a banded shoulder", speed: 1.03, visual: { deflector: 0, spokes: 6, tape: 1, dish: 1, nut: [0.72, 0.88, 0.11] }, visualTier: 1 },
        { id: "sig_cadillac_rim", label: "Detroit Rim", cost: 130, teams: ["cadillac"], tag: "SIGNATURE", equivalent: "aero_disc",
          desc: "Cadillac signature rim — Aero Disc performance with a 4-spoke rim with a banded shoulder", speed: 1.05, braking: 0.98, visual: { deflector: 2, spokes: 4, tape: 1, dish: 2, nut: [0.85, 0.7, 0.32] }, visualTier: 2 },
      ],
    },
  ];

  const DEFAULTS = {
    engine: "stock", aero: "medium", suspension: "standard",
    brakes: "standard", tyres: "medium", ers: "standard",
    gearbox: "standard", fuel: "standard",
    exhaust: "stock", floor: "standard", cockpit: "standard", wheels: "standard",
  };

  // Every option.visual field has one declared consumer. Keep this registry
  // beside the catalog so new recipe keys cannot silently become dead data.
  const VISUAL_FIELD_REGISTRY = Object.freeze({
    geometry: Object.freeze({
      engine: Object.freeze(["in", "snork", "twin", "inlet", "outlet",
        "podWidth", "shoulderHeight", "undercut", "coke", "tailWidth", "coverHeight",
        "servicePanel", "heatShield", "chimney", "scoopLip"]),
      aero: Object.freeze(["lvl", "beam", "drs", "vane", "plate", "casc", "swan", "tvane",
        "duct", "board", "slot",
        "frontSweep", "frontTaper", "frontRise", "rearSweep", "rearTaper",
        "floorEdge", "floorCut", "diffuserRise"]),
      suspension: Object.freeze(["ride", "arm", "push", "pull", "wishbone", "toe", "rocker", "heave"]),
      brakes: Object.freeze(["duct", "caliperPos", "coverOpen", "rotor", "rotorScale", "scoop", "discFace", "caliper"]),
      tyres: Object.freeze(["grooved", "grooves", "grooveDepth", "bandWidth", "coverVanes", "shoulder", "sidewall"]),
      ers: Object.freeze(["pack", "cells", "conduit", "blister", "coolerIntake"]),
      gearbox: Object.freeze(["strakes", "fin", "strakeH", "finSY", "finSZ",
        "casing", "louvres", "heat", "caseWidth", "heatFins", "ribs"]),
      fuel: Object.freeze(["filler", "hatch", "vent", "breather"]),
      exhaust: Object.freeze(["pipes", "bore", "flare", "wastegate", "wrap",
        "lip", "shield"]),
      floor: Object.freeze(["fences", "fenceH", "skid", "edgeLip", "plank", "gurney", "scroll"]),
      cockpit: Object.freeze(["haloBlade", "haloWing", "camPods", "screen", "halo", "headrest"]),
      wheels: Object.freeze(["spokes", "tape", "dish", "gunNut", "deflector"]),
    }),
    material: Object.freeze({
      wheels: Object.freeze(["nut"]),
      brakes: Object.freeze(["cal", "rim"]),
      tyres: Object.freeze(["band"]),
      ers: Object.freeze(["led"]),
      fuel: Object.freeze(["cap", "flame", "line"]),
    }),
    runtime: Object.freeze({
      fuel: Object.freeze(["fxFlame"]),
    }),
  });

  // Fixed visual identity for the 2026 grid. These are never read from player
  // saves and never alter AI physics; they only select deterministic car meshes.
  // Every team fields its own SIGNATURE part in EVERY category — each one cloned
  // from the universal option that team already ran, so cost and all four stat
  // multipliers are unchanged and this shapes the meshes, not the pecking order.
  // The four teams on a manufacturer-exclusive FACTORY power unit keep it: that
  // unit is already a team-unique model, so a signature engine would be
  // redundant. Cadillac is the exception — it is Ferrari-powered and would
  // otherwise render the exact same power unit as Ferrari.
  const FACTORY_PRESETS = {
    mercedes:    { engine: "sig_mercedes_zero", aero: "sig_mercedes_wing", suspension: "sig_mercedes_susp", brakes: "sig_mercedes_discs", tyres: "sig_mercedes_tyre", ers: "sig_mercedes_ers", gearbox: "sig_mercedes_gbox", fuel: "sig_mercedes_fuel", exhaust: "sig_mercedes_exh", floor: "sig_mercedes_floor", cockpit: "sig_mercedes_cpit", wheels: "sig_mercedes_rim" },
    ferrari:     { engine: "manu_ferrari", aero: "sig_ferrari_wing", suspension: "sig_ferrari_susp", brakes: "sig_ferrari_brembo", tyres: "sig_ferrari_tyre", ers: "sig_ferrari_ers", gearbox: "sig_ferrari_seamless", fuel: "sig_ferrari_fuel", exhaust: "sig_ferrari_exh", floor: "sig_ferrari_floor", cockpit: "sig_ferrari_cpit", wheels: "sig_ferrari_rim" },
    mclaren:     { engine: "sig_mclaren_pu", aero: "sig_mclaren_flex", suspension: "sig_mclaren_active", brakes: "sig_mclaren_brakes", tyres: "sig_mclaren_tyre", ers: "sig_mclaren_ers", gearbox: "sig_mclaren_gbox", fuel: "sig_mclaren_fuel", exhaust: "sig_mclaren_exh", floor: "sig_mclaren_floor", cockpit: "sig_mclaren_cpit", wheels: "sig_mclaren_rim" },
    redbull:     { engine: "manu_ford", aero: "sig_redbull_concept", suspension: "sig_redbull_pullrod", brakes: "sig_redbull_brakes", tyres: "sig_redbull_tyre", ers: "sig_redbull_ers", gearbox: "sig_redbull_gbox", fuel: "sig_redbull_fuel", exhaust: "sig_redbull_exh", floor: "sig_redbull_floor", cockpit: "sig_redbull_cpit", wheels: "sig_redbull_rim" },
    alpine:      { engine: "sig_alpine_pu", aero: "sig_alpine_wing", suspension: "sig_alpine_susp", brakes: "sig_alpine_brakes", tyres: "sig_alpine_tyre", ers: "sig_alpine_boost", gearbox: "sig_alpine_gbox", fuel: "sig_alpine_efuel", exhaust: "sig_alpine_exh", floor: "sig_alpine_floor", cockpit: "sig_alpine_cpit", wheels: "sig_alpine_rim" },
    racingbulls: { engine: "sig_racingbulls_pu", aero: "sig_racingbulls_wing", suspension: "sig_racingbulls_susp", brakes: "sig_racingbulls_brakes", tyres: "sig_rb_street", ers: "sig_racingbulls_ers", gearbox: "sig_rb_shortcase", fuel: "sig_racingbulls_fuel", exhaust: "sig_racingbulls_exh", floor: "sig_racingbulls_floor", cockpit: "sig_racingbulls_cpit", wheels: "sig_racingbulls_rim" },
    haas:        { engine: "sig_haas_pu", aero: "sig_haas_wing", suspension: "sig_haas_susp", brakes: "sig_haas_carbonmag", tyres: "sig_haas_tyre", ers: "sig_haas_ers", gearbox: "sig_haas_gbox", fuel: "sig_haas_blend", exhaust: "sig_haas_exh", floor: "sig_haas_floor", cockpit: "sig_haas_cpit", wheels: "sig_haas_rim" },
    williams:    { engine: "sig_williams_pu", aero: "sig_williams_lowdrag", suspension: "sig_williams_susp", brakes: "sig_williams_brakes", tyres: "sig_williams_tyre", ers: "sig_williams_ers", gearbox: "sig_williams_longshift", fuel: "sig_williams_fuel", exhaust: "sig_williams_exh", floor: "sig_williams_floor", cockpit: "sig_williams_cpit", wheels: "sig_williams_rim" },
    audi:        { engine: "manu_audi", aero: "sig_audi_wing", suspension: "sig_audi_damper", brakes: "sig_audi_brakes", tyres: "sig_audi_tyre", ers: "sig_audi_quattro", gearbox: "sig_audi_gbox", fuel: "sig_audi_fuel", exhaust: "sig_audi_exh", floor: "sig_audi_floor", cockpit: "sig_audi_cpit", wheels: "sig_audi_rim" },
    astonmartin: { engine: "manu_honda", aero: "sig_aston_tunnel", suspension: "sig_astonmartin_susp", brakes: "sig_aston_carbon", tyres: "sig_astonmartin_tyre", ers: "sig_astonmartin_ers", gearbox: "sig_astonmartin_gbox", fuel: "sig_astonmartin_fuel", exhaust: "sig_astonmartin_exh", floor: "sig_astonmartin_floor", cockpit: "sig_astonmartin_cpit", wheels: "sig_astonmartin_rim" },
    cadillac:    { engine: "sig_cadillac_pu", aero: "sig_cadillac_lowline", suspension: "sig_cadillac_susp", brakes: "sig_cadillac_brakes", tyres: "sig_cadillac_sprint", ers: "sig_cadillac_ers", gearbox: "sig_cadillac_gbox", fuel: "sig_cadillac_fuel", exhaust: "sig_cadillac_exh", floor: "sig_cadillac_floor", cockpit: "sig_cadillac_cpit", wheels: "sig_cadillac_rim" },
  };

  function teamContext(team) {
    if (typeof team === "string") return { id: null, engine: team };
    return {
      id: team && team.id || null,
      engine: team && team.engine || null,
    };
  }

  function isOptionAvailable(opt, team, owned) {
    const ctx = teamContext(team);
    const suppliers = opt.suppliers || (opt.supplier ? [opt.supplier] : null);
    const teams = opt.teams || (opt.team ? [opt.team] : null);
    if (suppliers && suppliers.indexOf(ctx.engine) < 0) return false;
    if (teams && teams.indexOf(ctx.id) < 0) return false;
    if (owned && !owned.has(opt.id)) return false;
    return true;
  }

  function _resolve(cat, setup, team) {
    const selId = setup[cat.id] !== undefined ? setup[cat.id] : DEFAULTS[cat.id];
    let opt = cat.options.find((o) => o.id === selId);
    if (opt && !isOptionAvailable(opt, team)) opt = null;
    return opt || cat.options.find((o) => o.id === DEFAULTS[cat.id]) || cat.options[0];
  }

  function resolveSetup(setup, team) {
    const requested = Object.assign({}, DEFAULTS, setup || {});
    const resolvedSetup = {};
    const mods = { speed: 1, accel: 1, cornering: 1, braking: 1 };
    const tiers = {};
    const visual = {};
    const options = {};
    let cost = 0;
    for (const cat of CATALOG) {
      const opt = _resolve(cat, requested, team);
      const tier = opt.visualTier != null ? opt.visualTier : 1;
      resolvedSetup[cat.id] = opt.id;
      tiers[cat.id] = tier;
      options[cat.id] = opt;
      visual[cat.id] = Object.assign({ id: opt.id, tier }, opt.visual || {});
      cost += opt.cost || 0;
      if (opt.speed     !== undefined) mods.speed     *= opt.speed;
      if (opt.accel     !== undefined) mods.accel     *= opt.accel;
      if (opt.cornering !== undefined) mods.cornering *= opt.cornering;
      if (opt.braking   !== undefined) mods.braking   *= opt.braking;
    }
    return { setup: resolvedSetup, mods, cost, ids: resolvedSetup, tiers, visual, options };
  }

  const factoryCache = new Map();
  function factoryResolved(team) {
    const id = team && team.id || "";
    const key = id + "|" + (team && team.engine || "");
    let resolved = factoryCache.get(key);
    if (!resolved) {
      resolved = resolveSetup(FACTORY_PRESETS[id] || DEFAULTS, team);
      factoryCache.set(key, resolved);
    }
    return resolved;
  }

  function getFactorySetup(team) {
    return factoryResolved(team).setup;
  }

  function factoryKey(team) {
    const resolved = factoryResolved(team);
    return CATALOG.map((cat) => resolved.ids[cat.id]).join("|");
  }

  function getMods(setup, team) {
    return resolveSetup(setup, team).mods;
  }

  function getCost(setup, team) {
    return resolveSetup(setup, team).cost;
  }

  function statMult(stat) {
    return 0.85 + (stat / 100) * 0.15;
  }

  const AERO_SPAN = (function () {
    const cat = CATALOG.find((c) => c.id === "aero");
    let lo = Infinity, hi = -Infinity;
    for (const o of cat.options) {
      const w = o.cornering !== undefined ? o.cornering : 1;
      if (w < lo) lo = w;
      if (w > hi) hi = w;
    }
    return { lo, hi };
  })();
  const ERS_SPAN = (function () {
    const cat = CATALOG.find((c) => c.id === "ers");
    const span = (k) => {
      let lo = Infinity, hi = -Infinity;
      for (const o of cat.options) {
        const v = o[k] !== undefined ? o[k] : 1;
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      return { lo, hi };
    };
    return { deploy: span("accel"), regen: span("speed") };
  })();
  function ersProfile(setup, team) {
    const opt = resolveSetup(setup, team).options.ers;
    const at = (k, span) => {
      const v = opt && opt[k] !== undefined ? opt[k] : 1;
      return span.hi > span.lo ? Math.max(0, Math.min(1, (v - span.lo) / (span.hi - span.lo))) : 0.5;
    };
    return { deploy: at("accel", ERS_SPAN.deploy), regen: at("speed", ERS_SPAN.regen) };
  }

  function aeroLoad(setup, team) {
    const opt = resolveSetup(setup, team).options.aero;
    const w = opt && opt.cornering !== undefined ? opt.cornering : 1;
    const { lo, hi } = AERO_SPAN;
    return hi > lo ? Math.max(0, Math.min(1, (w - lo) / (hi - lo))) : 0.5;
  }

  // getVisualTiers(setup, teamEngine) -> { engine:0|1|2, aero:0|1|2, ... } —
  // the resolved cosmetic tier per category, consumed by Car3D.build(opts.parts)
  // to drive the parts-driven visual redesign. Mirrors getMods()'s resolution
  // loop exactly (same _resolve(), same supplier-lock fallback) so an option
  // that's invisible in the setup UI (locked out by engine supplier) can never
  // resolve to a visual tier either. Untagged options (shouldn't happen — every
  // CATALOG option above carries visualTier) fall back to 1, the neutral/default
  // tier, so a missing tag can never produce an unexpected geometry change.
  function getVisualTiers(setup, team) {
    const resolved = resolveSetup(setup, team);
    const out = Object.assign({}, resolved.tiers);
    out._ids = resolved.ids;
    out._visual = resolved.visual;
    return out;
  }

  Log.info("car", "parts catalog n=" + CATALOG.length);
  return {
    CATALOG, DEFAULTS, FACTORY_PRESETS, VISUAL_FIELD_REGISTRY, BUDGET,
    resolveSetup, isOptionAvailable,
    getFactorySetup, factoryKey,
    getMods, getCost, getVisualTiers, statMult, aeroLoad, ersProfile,
  };
})();
