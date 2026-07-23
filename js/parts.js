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
          desc: "Mercedes-AMG High Performance Powertrains — 2026 peak spec",                   speed: 1.08, accel: 1.14, visual: {"in": 1.55, "snork": 1, "twin": 1, "inlet": 2, "outlet": 2, podWidth: 0.78, shoulderHeight: 0.96, undercut: 1.28, coke: 1.28, tailWidth: 0.76, coverHeight: 0.94}, visualTier: 2 },
        { id: "manu_ferrari",  label: "Ferrari 066/12", cost: 200, supplier: "Ferrari",       tag: "FACTORY",
          desc: "Scuderia Ferrari power unit — strong top speed and precision braking",          speed: 1.09, accel: 1.11, braking: 1.04, visual: {"in": 1.58, "snork": 1, "twin": 1, "inlet": 3, "outlet": 3, podWidth: 1.18, shoulderHeight: 1.22, undercut: 0.80, coke: 0.86, tailWidth: 1.16, coverHeight: 1.20}, visualTier: 2 },
        { id: "manu_ford",     label: "Ford Powertrains", cost: 200, supplier: "Red Bull Ford", tag: "FACTORY",
          desc: "Ford/Red Bull 2026 unit — explosive torque delivery out of slow corners",       speed: 1.06, accel: 1.16, visual: {"in": 1.5, "snork": 1, "twin": 1, "inlet": 2, "outlet": 2, podWidth: 1.14, shoulderHeight: 1.19, undercut: 0.83, coke: 0.89, tailWidth: 1.12, coverHeight: 1.16}, visualTier: 2 },
        { id: "manu_honda",    label: "Honda RA626H",   cost: 200, supplier: "Honda",         tag: "FACTORY",
          desc: "Honda RA626H — balanced power with exceptional traction assist",                speed: 1.07, accel: 1.12, cornering: 1.04, visual: {"in": 1.5, "snork": 1, "twin": 1, "inlet": 3, "outlet": 3, podWidth: 1.11, shoulderHeight: 1.17, undercut: 0.87, coke: 0.93, tailWidth: 1.08, coverHeight: 1.15}, visualTier: 2 },
        { id: "manu_audi",     label: "Audi P.U.",      cost: 200, supplier: "Audi",          tag: "FACTORY",
          desc: "Audi 2026 power unit — strong braking recovery and mid-range punch",            speed: 1.07, accel: 1.12, braking: 1.06, visual: {"in": 1.48, "snork": 1, "twin": 1, "inlet": 2, "outlet": 2, podWidth: 1.07, shoulderHeight: 1.13, undercut: 0.94, coke: 1.00, tailWidth: 0.98, coverHeight: 1.12}, visualTier: 2 },
        // Non-exclusive upgrades above factory level
        { id: "torque_curve",  label: "Torque Curve",  cost:  40, desc: "Rebalanced mapping — strong traction out of slow corners",        accel: 1.06, cornering: 1.03, visual: {"in": 1.0, "inlet": 1, "outlet": 1, podWidth: 0.98, shoulderHeight: 1.04, undercut: 1.02, coke: 1.06, tailWidth: 0.95, coverHeight: 1.00}, visualTier: 1 },
        { id: "hybrid_max",    label: "Hybrid Max",    cost: 150, desc: "Full MGU-K/H synergy — broad power gains across all four metrics", speed: 1.05, accel: 1.08, cornering: 1.03, visual: {"in": 1.3, "snork": 1, "twin": 1, "inlet": 2, "outlet": 2, podWidth: 1.08, shoulderHeight: 1.15, undercut: 0.89, coke: 0.95, tailWidth: 1.06, coverHeight: 1.13}, visualTier: 2 },
        { id: "sig_mercedes_zero", label: "Zero-Sidepod PU", cost: 150, teams: ["mercedes"], tag: "SIGNATURE", equivalent: "hybrid_max",
          desc: "Mercedes signature compact installation — Hybrid Max performance in a tighter cooling form", speed: 1.05, accel: 1.08, cornering: 1.03, visual: { in: 1.38, snork: 1, twin: 1, inlet: 2, outlet: 3, podWidth: 0.72, shoulderHeight: 0.90, undercut: 1.35, coke: 1.34, tailWidth: 0.70, coverHeight: 0.90 }, visualTier: 2 },
        { id: "quali_engine",  label: "Quali Mode",    cost: 220, desc: "Unrestricted qualifying spec — peak power, no thermal limits",    speed: 1.10, accel: 1.09, visual: {"in": 1.65, "snork": 1, "twin": 1, "inlet": 3, "outlet": 3, podWidth: 1.20, shoulderHeight: 1.24, undercut: 0.78, coke: 0.84, tailWidth: 1.18, coverHeight: 1.22}, visualTier: 2 },
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
          desc: "McLaren signature compliant flap package — Circuit Adaptive performance with a twin-vane form", speed: 1.01, cornering: 1.22, braking: 1.06, visual: { lvl: 3.55, beam: 1, drs: 1, vane: 2, frontSweep: 0.15, frontTaper: 0.84, frontRise: 0.13, rearSweep: 0.16, rearTaper: 0.84, floorEdge: 1.14, floorCut: 0.17, diffuserRise: 1.20 }, visualTier: 2 },
        { id: "sig_williams_lowdrag", label: "Grove Low-Drag", cost: 40, teams: ["williams"], tag: "SIGNATURE", equivalent: "low",
          desc: "Williams signature straight-line package — Low DF performance with stripped turning vanes", speed: 1.06, cornering: 0.88, visual: { lvl: 1.15, vane: 0, beam: 0, drs: 0, frontSweep: -0.02, frontTaper: 1.02, frontRise: 0.01, rearSweep: 0.01, rearTaper: 0.92, floorEdge: 0.86, floorCut: 0.03, diffuserRise: 0.80 }, visualTier: 0 },
        { id: "sig_aston_tunnel", label: "Silverstone Tunnel", cost: 170, teams: ["astonmartin"], tag: "SIGNATURE", equivalent: "ground_effect",
          desc: "Aston Martin signature tunnel floor — Ground Effect performance with an active upper flap", speed: 0.87, cornering: 1.32, braking: 1.10, visual: { lvl: 4, beam: 1, vane: 2, drs: 1, frontSweep: 0.10, frontTaper: 0.87, frontRise: 0.12, rearSweep: 0.15, rearTaper: 0.82, floorEdge: 1.32, floorCut: 0.21, diffuserRise: 1.38 }, visualTier: 2 },
        { id: "sig_redbull_concept", label: "Newey Concept", cost: 170, teams: ["redbull"], tag: "SIGNATURE", equivalent: "ground_effect",
          desc: "Red Bull signature high-rake concept — Ground Effect performance with an aggressive diffuser ramp", speed: 0.87, cornering: 1.32, braking: 1.10, visual: { lvl: 4, beam: 1, vane: 3, frontSweep: 0.08, frontTaper: 0.90, frontRise: 0.14, rearSweep: 0.11, rearTaper: 0.87, floorEdge: 1.26, floorCut: 0.19, diffuserRise: 1.44 }, visualTier: 2 },
        { id: "sig_cadillac_lowline", label: "Detroit Lowline", cost: 80, teams: ["cadillac"], tag: "SIGNATURE", equivalent: "le_mans",
          desc: "Cadillac signature superspeedway trim — Le Mans Trim performance with a stretched flat-deck wing", speed: 1.14, cornering: 0.80, visual: { lvl: 0, vane: 0, beam: 0, frontSweep: -0.02, frontTaper: 1.04, frontRise: 0, rearSweep: 0.01, rearTaper: 0.94, floorEdge: 0.84, floorCut: 0.04, diffuserRise: 0.74 }, visualTier: 0 },
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
        { id: "racing",          label: "Racing",          cost:  90, desc: "Track-focused — high lateral grip",                                      cornering: 1.16, visual: {"ride": -0.025, "arm": 1.15, "push": 1}, visualTier: 2 },
        { id: "triple_damper",   label: "Triple Damper",   cost: 100, desc: "Three-stage damper system — precise compliance across all corner phases", cornering: 1.17, speed: 1.01, visual: {"ride": -0.02, "arm": 1.2, "push": 1}, visualTier: 2 },
        { id: "titanium_spring", label: "Titanium Spring", cost: 110, desc: "Ultra-light titanium coils — mass reduction with stiffer cornering",     cornering: 1.19, accel: 1.02, visual: {"ride": -0.02, "arm": 0.85, "push": 1, "pull": 1}, visualTier: 2 },
        { id: "inboard_dampers", label: "Inboard Dampers", cost: 110, desc: "Unsprung mass reduction — responsive handling and consistent braking",   cornering: 1.18, braking: 1.07, visual: {"ride": -0.02, "arm": 1.1, "push": 1, "pull": 1}, visualTier: 2 },
        { id: "track",           label: "Track",           cost: 130, desc: "Extreme stiffness — maximum cornering",                                  cornering: 1.24, visual: {"ride": -0.04, "arm": 1.3, "push": 1}, visualTier: 2 },
        { id: "heave_spring",    label: "Heave Spring",    cost: 150, desc: "Aero-optimised springing — stable floor clearance under hard braking",   cornering: 1.21, speed: 1.03, visual: {"ride": -0.03, "arm": 1.2, "push": 1, "pull": 1}, visualTier: 2 },
        { id: "active",          label: "Active",          cost: 190, desc: "Active suspension system — peak cornering, slight top speed boost",       cornering: 1.28, speed: 1.02, visual: {"ride": -0.045, "arm": 1.25, "push": 1}, visualTier: 2 },
        { id: "interlinked",     label: "Interlinked",     cost: 170, desc: "Hydraulically linked heave control — stable platform with kerb compliance", cornering: 1.23, braking: 1.05, speed: 1.01, visual: { ride: -0.028, arm: 1.12, push: 1, pull: 1 }, visualTier: 2 },
        { id: "sig_redbull_pullrod", label: "Milton Keynes Pullrod", cost: 190, teams: ["redbull"], tag: "SIGNATURE", equivalent: "active",
          desc: "Red Bull signature pullrod layout — Active performance with a distinct crossed actuator", cornering: 1.28, speed: 1.02, visual: { ride: -0.043, arm: 1.28, push: 1, pull: 1 }, visualTier: 2 },
        { id: "sig_mclaren_active", label: "Woking Active", cost: 190, teams: ["mclaren"], tag: "SIGNATURE", equivalent: "active",
          desc: "McLaren signature adaptive platform — Active performance with slimline carbon arms", cornering: 1.28, speed: 1.02, visual: { ride: -0.047, arm: 0.92, push: 1, pull: 1 }, visualTier: 2 },
        { id: "sig_audi_damper", label: "Neuburg Damper", cost: 100, teams: ["audi"], tag: "SIGNATURE", equivalent: "triple_damper",
          desc: "Audi signature three-stage damper — Triple Damper performance with a heavy-gauge arm set", cornering: 1.17, speed: 1.01, visual: { ride: -0.017, arm: 1.32, push: 1 }, visualTier: 2 },
      ],
    },
    {
      id: "brakes", label: "BRAKES",
      options: [
        { id: "standard",    label: "Standard",         cost:   0, desc: "Factory steel brake discs",                                                 braking: 1.00, visual: { cal: null, duct: 0.55, caliperPos: 0, coverOpen: 0, rotor: 1, rotorScale: 1 }, visualTier: 1 },
        { id: "drilled",     label: "Drilled Steel",    cost:  30, desc: "Cross-drilled steel discs — improved heat management",                      braking: 1.05, visual: {"cal": null, "duct": 0.72}, visualTier: 1 },
        { id: "sport",       label: "Sport",            cost:  40, desc: "Improved pads and discs",                                                   braking: 1.08, visual: {"cal": [0.95, 0.45, 0.05], "duct": 0.95}, visualTier: 2 },
        { id: "titanium",    label: "Titanium Caliper", cost:  50, desc: "Lighter alloy calipers — better weight distribution and exit speed",        braking: 1.06, accel: 1.04, visual: {"cal": [0.7, 0.72, 0.78], "duct": 0.85}, visualTier: 1 },
        { id: "endurance",   label: "Endurance",        cost:  60, desc: "Consistent fade-free braking — aids corner exit",                           braking: 1.10, accel: 1.02, visual: {"cal": [0.95, 0.8, 0.1], "duct": 1.05}, visualTier: 2 },
        { id: "dual_caliper",label: "Dual Caliper",     cost:  80, desc: "Twin-piston caliper setup — stronger bite with improved exit traction",     braking: 1.13, accel: 1.02, visual: {"cal": [0.95, 0.72, 0.08], "duct": 1.15, "rim": [0.3, 0.3, 0.34]}, visualTier: 2 },
        { id: "carbon",      label: "Carbon",           cost:  90, desc: "F1-spec carbon composite brakes",                                           braking: 1.16, visual: {"cal": [0.85, 0.12, 0.1], "duct": 1.25}, visualTier: 2 },
        { id: "ventilated",  label: "Ventilated Carbon",cost: 100, desc: "Internally vented discs — consistent fade-free stopping",                   braking: 1.18, visual: {"cal": [0.9, 0.15, 0.12], "duct": 1.35}, visualTier: 2 },
        { id: "carbon_mag",  label: "Carbon-Mag",       cost: 120, desc: "Carbon-magnesium alloy — lighter, better mass dist",                        braking: 1.20, accel: 1.03, visual: {"cal": [0.85, 0.66, 0.16], "duct": 1.45, "rim": [0.48, 0.4, 0.16]}, visualTier: 2 },
        { id: "regen_brakes",label: "Regen Brakes",     cost: 130, desc: "Brake-by-wire hybrid system — converts braking energy into acceleration",   braking: 1.12, accel: 1.06, visual: {"cal": [0.15, 0.78, 0.38], "duct": 1.25}, visualTier: 2 },
        { id: "ceramic",     label: "Carbon Ceramic",   cost: 140, desc: "Maximum stopping power — zero fade",                                        braking: 1.24, visual: {"cal": [0.97, 0.1, 0.08], "duct": 1.6, "rim": [0.55, 0.56, 0.6]}, visualTier: 2 },
        { id: "brembo_evo",  label: "Brembo Evo",       cost: 160, desc: "Next-gen racing brake package — ultimate stopping with mass benefit",        braking: 1.26, accel: 1.04, visual: {"cal": [0.98, 0.62, 0.05], "duct": 1.75, "rim": [0.42, 0.34, 0.12]}, visualTier: 2 },
        { id: "six_piston",   label: "Six Piston",       cost: 180, desc: "Large monobloc calipers — peak initial bite with stable trail braking",       braking: 1.27, cornering: 1.02, visual: { cal: [0.10, 0.65, 0.95], duct: 1.55, rim: [0.24, 0.28, 0.34] }, visualTier: 2 },
        { id: "sig_ferrari_brembo", label: "Maranello Brembo", cost: 160, teams: ["ferrari"], tag: "SIGNATURE", equivalent: "brembo_evo",
          desc: "Ferrari signature brake package — Brembo Evo performance with red monobloc hardware", braking: 1.26, accel: 1.04, visual: { cal: [0.95, 0.05, 0.04], duct: 1.70, rim: [0.52, 0.45, 0.20] }, visualTier: 2 },
        { id: "sig_haas_carbonmag", label: "Kannapolis C-Mag", cost: 120, teams: ["haas"], tag: "SIGNATURE", equivalent: "carbon_mag",
          desc: "Haas signature lightweight brake — Carbon-Mag performance with pale alloy hardware", braking: 1.20, accel: 1.03, visual: { cal: [0.88, 0.88, 0.90], duct: 1.42, rim: [0.42, 0.18, 0.14] }, visualTier: 2 },
        { id: "sig_mercedes_discs", label: "Brackley Discs", cost: 140, teams: ["mercedes"], tag: "SIGNATURE", equivalent: "ceramic",
          desc: "Mercedes signature brake package — Carbon Ceramic performance with Petronas-teal hardware", braking: 1.24, visual: { cal: [0.0, 0.75, 0.70], duct: 1.55, rim: [0.60, 0.62, 0.66] }, visualTier: 2 },
        { id: "sig_aston_carbon", label: "Lagonda Carbon", cost: 100, teams: ["astonmartin"], tag: "SIGNATURE", equivalent: "ventilated",
          desc: "Aston Martin signature vented brake — Ventilated Carbon performance with racing-green monoblocs", braking: 1.18, visual: { cal: [0.0, 0.55, 0.38], duct: 1.40, rim: [0.50, 0.44, 0.20] }, visualTier: 2 },
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
        { id: "soft",         label: "Soft",          cost:  80, desc: "+12% cornering, +4% accel — some top speed drag",                            speed: 0.97, cornering: 1.12, accel: 1.04, visual: {"band": [0.92, 0.12, 0.1], "grooved": false, "grooves": 0, "bandWidth": 0.1, "coverVanes": 6}, visualTier: 2 },
        { id: "compound_c5",  label: "Compound C5",   cost: 100, desc: "High-spec soft — aggressive grip over one stint, strong accel",               speed: 0.96, cornering: 1.15, accel: 1.05, visual: {"band": [0.97, 0.16, 0.12], "grooved": false, "grooves": 0, "bandWidth": 0.115, "coverVanes": 5}, visualTier: 2 },
        { id: "supersoft",    label: "Super Soft",    cost: 130, desc: "High grip compound — aggressive tyre load",                                   speed: 0.94, cornering: 1.20, accel: 1.06, visual: {"band": [0.88, 0.1, 0.3], "grooved": false, "grooves": 0, "bandWidth": 0.12, "coverVanes": 8}, visualTier: 2 },
        { id: "p_zero_red",   label: "P Zero Red",    cost: 160, desc: "Custom Pirelli high-performance compound — between Super Soft and Quali",     speed: 0.92, cornering: 1.24, accel: 1.07, visual: {"band": [0.97, 0.07, 0.07], "grooved": false, "grooves": 0, "bandWidth": 0.13, "coverVanes": 9}, visualTier: 2 },
        { id: "qualigum",     label: "Quali Spec",    cost: 180, desc: "One-lap ultra-soft — maximum short-run grip",                                 speed: 0.91, cornering: 1.28, accel: 1.09, visual: {"band": [0.62, 0.12, 0.78], "grooved": false, "grooves": 0, "bandWidth": 0.14, "coverVanes": 11}, visualTier: 2 },
        { id: "hypersoft",    label: "Hyper Soft",    cost: 200, desc: "Prototype extreme compound — maximum peak grip, very short lifespan",          speed: 0.88, cornering: 1.36, accel: 1.12, visual: {"band": [0.98, 0.38, 0.62], "grooved": false, "grooves": 0, "bandWidth": 0.15, "coverVanes": 12}, visualTier: 2 },
        { id: "sprint_soft",  label: "Sprint Soft",   cost: 150, desc: "Short-race compound — rapid warm-up and strong launch traction",                 speed: 0.93, cornering: 1.22, accel: 1.08, visual: { band: [0.15, 0.55, 0.95], grooved: false, grooves: 0, bandWidth: 0.105, coverVanes: 9 }, visualTier: 2 },
        { id: "sig_cadillac_sprint", label: "Cadillac Sprint", cost: 150, teams: ["cadillac"], tag: "SIGNATURE", equivalent: "sprint_soft",
          desc: "Cadillac signature sprint compound — Sprint Soft performance with a gold double-width band", speed: 0.93, cornering: 1.22, accel: 1.08, visual: { band: [0.92, 0.72, 0.18], grooved: false, grooves: 0, bandWidth: 0.125, coverVanes: 4 }, visualTier: 2 },
        { id: "sig_rb_street", label: "Faenza Street", cost: 130, teams: ["racingbulls"], tag: "SIGNATURE", equivalent: "supersoft",
          desc: "Racing Bulls signature street compound — Super Soft performance with a twin-blue sidewall band", speed: 0.94, cornering: 1.20, accel: 1.06, visual: { band: [0.20, 0.30, 0.95], grooved: false, grooves: 0, bandWidth: 0.135, coverVanes: 7 }, visualTier: 2 },
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
        { id: "thermal_max",    label: "Thermal Max",   cost: 110, desc: "Heat energy recovery focus — speed gains with consistent braking",           speed: 1.04, braking: 1.03, visual: {"led": [1.95, 0.5, 0.08], "pack": 1.05}, visualTier: 1 },
        { id: "torque_fill",    label: "Torque Fill",   cost: 120, desc: "Hybrid torque-vectoring — cornering traction and exit speed",                accel: 1.08, cornering: 1.06, visual: {"led": [0.8, 0.3, 1.85], "pack": 1.15}, visualTier: 2 },
        { id: "overtake_focus", label: "OT Focus",      cost: 130, desc: "Traction-biased deploy: +12% accel, +4% cornering",                         speed: 0.96, accel: 1.12, cornering: 1.04, visual: {"led": [2.05, 0.15, 0.55], "pack": 1.2}, visualTier: 2 },
        { id: "race_mode",      label: "Race Mode",     cost: 150, desc: "High-output 2026 mode: +7% accel, +3% top speed",                           speed: 1.03, accel: 1.07, visual: {"led": [0.25, 0.95, 2.05], "pack": 1.2}, visualTier: 2 },
        { id: "full_attack",    label: "Full Attack",   cost: 200, desc: "Maximum ERS output — qualifying/sprint spec",                               speed: 1.06, accel: 1.14, visual: {"led": [2.25, 0.22, 0.16], "pack": 1.3}, visualTier: 2 },
        { id: "overcharge",     label: "Overcharge",    cost: 230, desc: "Experimental limit-push mode — maximum all-channel ERS output",              speed: 1.10, accel: 1.18, visual: {"led": [2.4, 0.75, 0.06], "pack": 1.35}, visualTier: 2 },
        { id: "supercapacitor", label: "Supercapacitor", cost: 180, desc: "High-discharge buffer — immediate deployment with improved recovery",        speed: 1.04, accel: 1.13, braking: 1.04, visual: { led: [0.30, 2.20, 2.20], pack: 1.10 }, visualTier: 2 },
        { id: "sig_audi_quattro", label: "Quattro Hybrid", cost: 180, teams: ["audi"], tag: "SIGNATURE", equivalent: "supercapacitor",
          desc: "Audi signature deployment map — Supercapacitor performance with a red energy conduit", speed: 1.04, accel: 1.13, braking: 1.04, visual: { led: [2.35, 0.18, 0.08], pack: 1.12 }, visualTier: 2 },
        { id: "sig_alpine_boost", label: "Enstone Boost", cost: 150, teams: ["alpine"], tag: "SIGNATURE", equivalent: "race_mode",
          desc: "Alpine signature deployment map — Race Mode performance with a rose-glow energy cell", speed: 1.03, accel: 1.07, visual: { led: [1.90, 0.55, 1.20], pack: 1.18 }, visualTier: 2 },
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
        { id: "sig_rb_shortcase", label: "Faenza Shortcase", cost: 210, teams: ["racingbulls"], tag: "SIGNATURE", equivalent: "seamless_shift",
          desc: "Racing Bulls signature compact casing — Seamless Shift performance with a taller crash fin", speed: 1.05, accel: 1.12, cornering: 1.02, visual: { strakes: 5, fin: 1, strakeH: 0.18, finSY: 0.24, finSZ: 0.30, casing: 2, louvres: 6, heat: 1 }, visualTier: 2 },
        { id: "sig_ferrari_seamless", label: "Maranello Seamless", cost: 210, teams: ["ferrari"], tag: "SIGNATURE", equivalent: "seamless_shift",
          desc: "Ferrari signature shift package — Seamless Shift performance in a sculpted red-crackle casing", speed: 1.05, accel: 1.12, cornering: 1.02, visual: { strakes: 4, fin: 1, strakeH: 0.21, finSY: 0.16, finSZ: 0.38, casing: 3, louvres: 4, heat: 1 }, visualTier: 2 },
        { id: "sig_williams_longshift", label: "Grove Longshift", cost: 40, teams: ["williams"], tag: "SIGNATURE", equivalent: "long_ratio",
          desc: "Williams signature top-speed stack — Long Ratio performance with a heat-wrapped slim case", speed: 1.04, accel: 0.97, visual: { strakes: 3, fin: 0, strakeH: 0.18, casing: 1, louvres: 0, heat: 1, caseWidth: 0.92 }, visualTier: 1 },
      ],
    },
    {
      id: "fuel", label: "FUEL",
      options: [
        { id: "standard",      label: "Standard",       cost:   0, desc: "Baseline pump-spec fuel — meets FIA minimum grade",                          speed: 1.00, accel: 1.00, visual: { cap: [0.55, 0.52, 0.6], flame: [1.15, 0.42, 0.14], fxFlame: [2.6, 1.05, 0.25], line: 1 }, visualTier: 1 },
        { id: "high_octane",   label: "High Octane",    cost:  40, desc: "Higher octane blend — cleaner combustion and accel improvement",             accel: 1.05, visual: {"cap": [1.5, 1.15, 0.18], "flame": [1.75, 1.4, 0.45], "fxFlame": [2.7, 2.1, 0.7]}, visualTier: 1 },
        { id: "biofuel",       label: "Biofuel 100",    cost:  50, desc: "FIA-sustainable 100% biofuel — consistent burn and slight braking gain",     braking: 1.04, accel: 1.03, visual: {"cap": [0.18, 1.35, 0.5], "flame": [0.35, 1.65, 0.42], "fxFlame": [1.7, 1.9, 0.55]}, visualTier: 1 },
        { id: "race_blend",    label: "Race Blend",     cost:  90, desc: "F1-regulation compound — refined energy density for speed and accel",        speed: 1.02, accel: 1.06, visual: {"cap": [1.6, 0.6, 0.14], "flame": [1.95, 0.72, 0.14], "fxFlame": [2.9, 1.1, 0.25]}, visualTier: 1 },
        { id: "quali_mix",     label: "Qualifying Mix", cost: 150, desc: "Maximum energy density — qualifying-spec fuel load for peak performance",    speed: 1.04, accel: 1.08, visual: {"cap": [0.95, 0.28, 1.5], "flame": [1.25, 0.35, 1.75], "fxFlame": [1.5, 1.7, 2.4]}, visualTier: 2 },
        { id: "custom_formula",label: "Custom Formula", cost: 200, desc: "Team-developed proprietary blend — marginal all-metric gains",               speed: 1.05, accel: 1.09, cornering: 1.02, braking: 1.02, visual: {"cap": [1.9, 0.25, 1.25], "flame": [1.85, 0.25, 1.4], "fxFlame": [2.6, 0.5, 2.1]}, visualTier: 2 },
        { id: "efuel_dense",   label: "Dense E-Fuel",   cost: 175, desc: "Synthetic high-density blend — clean burn with balanced race performance",      speed: 1.045, accel: 1.085, braking: 1.01, visual: { cap: [0.12, 1.25, 1.65], flame: [0.25, 1.20, 1.95], fxFlame: [0.55, 1.75, 2.75] }, visualTier: 2 },
        { id: "sig_alpine_efuel", label: "Viry E-Fuel", cost: 175, teams: ["alpine"], tag: "SIGNATURE", equivalent: "efuel_dense",
          desc: "Alpine signature synthetic blend — Dense E-Fuel performance with a blue-pink burn", speed: 1.045, accel: 1.085, braking: 1.01, visual: { cap: [0.10, 0.72, 1.85], flame: [0.65, 0.32, 1.95], fxFlame: [0.85, 0.65, 2.85] }, visualTier: 2 },
        { id: "sig_haas_blend", label: "Kannapolis Blend", cost: 90, teams: ["haas"], tag: "SIGNATURE", equivalent: "race_blend",
          desc: "Haas signature race fuel — Race Blend performance with a stars-and-stripes red burn", speed: 1.02, accel: 1.06, visual: { cap: [1.70, 0.20, 0.15], flame: [1.90, 0.30, 0.25], fxFlame: [2.90, 0.60, 0.40] }, visualTier: 1 },
      ],
    },
  ];

  const DEFAULTS = {
    engine: "stock", aero: "medium", suspension: "standard",
    brakes: "standard", tyres: "medium", ers: "standard",
    gearbox: "standard", fuel: "standard",
  };

  // Every option.visual field has one declared consumer. Keep this registry
  // beside the catalog so new recipe keys cannot silently become dead data.
  const VISUAL_FIELD_REGISTRY = Object.freeze({
    geometry: Object.freeze({
      engine: Object.freeze(["in", "snork", "twin", "inlet", "outlet",
        "podWidth", "shoulderHeight", "undercut", "coke", "tailWidth", "coverHeight",
        "servicePanel", "heatShield"]),
      aero: Object.freeze(["lvl", "beam", "drs", "vane",
        "frontSweep", "frontTaper", "frontRise", "rearSweep", "rearTaper",
        "floorEdge", "floorCut", "diffuserRise"]),
      suspension: Object.freeze(["ride", "arm", "push", "pull", "wishbone", "toe"]),
      brakes: Object.freeze(["duct", "caliperPos", "coverOpen", "rotor", "rotorScale"]),
      tyres: Object.freeze(["grooved", "grooves", "grooveDepth", "bandWidth", "coverVanes"]),
      ers: Object.freeze(["pack", "cells"]),
      gearbox: Object.freeze(["strakes", "fin", "strakeH", "finSY", "finSZ",
        "casing", "louvres", "heat", "caseWidth"]),
    }),
    material: Object.freeze({
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
  // Every team fields BOTH of its SIGNATURE parts (each stat-identical to a
  // universal equivalent, so this shapes the meshes, not the pecking order).
  const FACTORY_PRESETS = {
    mercedes:    { engine: "sig_mercedes_zero", aero: "high", suspension: "interlinked", brakes: "sig_mercedes_discs", tyres: "medium", ers: "race_mode", gearbox: "sequential_pro", fuel: "efuel_dense" },
    ferrari:     { engine: "manu_ferrari", aero: "circuit_adaptive", suspension: "racing", brakes: "sig_ferrari_brembo", tyres: "soft", ers: "torque_fill", gearbox: "sig_ferrari_seamless", fuel: "race_blend" },
    mclaren:     { engine: "hybrid_max", aero: "sig_mclaren_flex", suspension: "sig_mclaren_active", brakes: "six_piston", tyres: "sprint_soft", ers: "supercapacitor", gearbox: "seamless_shift", fuel: "efuel_dense" },
    redbull:     { engine: "manu_ford", aero: "sig_redbull_concept", suspension: "sig_redbull_pullrod", brakes: "carbon_mag", tyres: "soft", ers: "overtake_focus", gearbox: "short_stack", fuel: "race_blend" },
    alpine:      { engine: "performance", aero: "underfloor", suspension: "kerb_spec", brakes: "ventilated", tyres: "compound_c4", ers: "sig_alpine_boost", gearbox: "close_ratio", fuel: "sig_alpine_efuel" },
    racingbulls: { engine: "torque_curve", aero: "beam_wing", suspension: "sport", brakes: "sport", tyres: "sig_rb_street", ers: "split_deploy", gearbox: "sig_rb_shortcase", fuel: "high_octane" },
    haas:        { engine: "v_power", aero: "low", suspension: "carbon_pushrods", brakes: "sig_haas_carbonmag", tyres: "hard", ers: "harvest", gearbox: "carbon_case", fuel: "sig_haas_blend" },
    williams:    { engine: "highrev", aero: "sig_williams_lowdrag", suspension: "low_ride", brakes: "titanium", tyres: "hard", ers: "thermal_max", gearbox: "sig_williams_longshift", fuel: "high_octane" },
    audi:        { engine: "manu_audi", aero: "rake_setup", suspension: "sig_audi_damper", brakes: "regen_brakes", tyres: "compound_c4", ers: "sig_audi_quattro", gearbox: "sequential_pro", fuel: "biofuel" },
    astonmartin: { engine: "manu_honda", aero: "sig_aston_tunnel", suspension: "heave_spring", brakes: "sig_aston_carbon", tyres: "soft", ers: "full_attack", gearbox: "f1_spec", fuel: "custom_formula" },
    cadillac:    { engine: "manu_ferrari", aero: "sig_cadillac_lowline", suspension: "inboard_dampers", brakes: "endurance", tyres: "sig_cadillac_sprint", ers: "deploy", gearbox: "carbon_case", fuel: "efuel_dense" },
  };

  function teamContext(team) {
    if (typeof team === "string") return { id: null, engine: team };
    return {
      id: team && team.id || null,
      engine: team && team.engine || null,
    };
  }

  function isOptionAvailable(opt, team) {
    const ctx = teamContext(team);
    const suppliers = opt.suppliers || (opt.supplier ? [opt.supplier] : null);
    const teams = opt.teams || (opt.team ? [opt.team] : null);
    if (suppliers && suppliers.indexOf(ctx.engine) < 0) return false;
    if (teams && teams.indexOf(ctx.id) < 0) return false;
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
    const ids = {};
    const tiers = {};
    const visual = {};
    const options = {};
    let cost = 0;
    for (const cat of CATALOG) {
      const opt = _resolve(cat, requested, team);
      const tier = opt.visualTier != null ? opt.visualTier : 1;
      resolvedSetup[cat.id] = opt.id;
      ids[cat.id] = opt.id;
      tiers[cat.id] = tier;
      options[cat.id] = opt;
      visual[cat.id] = Object.assign({ id: opt.id, tier }, opt.visual || {});
      cost += opt.cost || 0;
      if (opt.speed     !== undefined) mods.speed     *= opt.speed;
      if (opt.accel     !== undefined) mods.accel     *= opt.accel;
      if (opt.cornering !== undefined) mods.cornering *= opt.cornering;
      if (opt.braking   !== undefined) mods.braking   *= opt.braking;
    }
    return { setup: resolvedSetup, mods, cost, ids, tiers, visual, options };
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
    // Resolved option id per category — lets Car3D drive per-OPTION visuals
    // (e.g. Pirelli tyre-compound colours) beyond the coarse 0/1/2 tier. The
    // tier lookups above are unchanged; this rides along under a reserved key.
    out._ids = resolved.ids;
    out._visual = resolved.visual;
    return out;
  }

  return {
    CATALOG, DEFAULTS, FACTORY_PRESETS, VISUAL_FIELD_REGISTRY, BUDGET,
    resolveSetup, isOptionAvailable,
    getFactorySetup, factoryKey,
    getMods, getCost, getVisualTiers, statMult,
  };
})();
