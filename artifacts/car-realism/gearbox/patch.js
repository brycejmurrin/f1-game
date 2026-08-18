// gearbox/patch.js — drop-in replacements for js/car/car3d.js
// Category: gearbox (gbStyle / design.gearbox)
// DO NOT apply from this file automatically; integrator copies into car3d.js
// + adds heatFins/ribs to VISUAL_FIELD_REGISTRY.geometry.gearbox in parts.js.
//
// Default-body delta MUST stay 0: heatFins/ribs default 0, and every enriched
// casing/louvre/heat face remains behind the existing >0 gates.

// ── 1) buildGearboxParts (~line 1225) ────────────────────────────────────────
function buildGearboxParts(recipe, tier) {
  return mergeRecipe({
    strakes: tier === 2 ? 5 : 0, fin: tier === 2 ? 1 : 0,
    strakeH: 0.13, finSY: 0.14, finSZ: 0.28,
    casing: tier === 2 ? 3 : 0, louvres: 0, heat: 0,
    caseWidth: 1,
    // NEW — default 0 keeps old recipes / shipped rear byte-identical.
    heatFins: 0,
    ribs: 0,
  }, recipe);
}

// ── 2) DRAW loop (~lines 2638–2672) ──────────────────────────────────────────
// Surrounding context (unchanged):
//   // --- Gearbox visual tell: per-OPTION diffuser strake count + a rear crash
//   // structure fin. More strakes = higher-spec 'box. ---
// Replace from `const gbStrakes = …` through `if (gbFin) addBox(…)` inclusive.

      const gbStrakes = gbStyle ? gbStyle.strakes : (tier("gearbox") === 2 ? 5 : 0);
      const gbFin = gbStyle ? gbStyle.fin : (tier("gearbox") === 2 ? 1 : 0);
      const gbStrakeH = gbStyle && gbStyle.strakeH ? gbStyle.strakeH : 0.13;
      const gbCasing  = gbStyle ? (gbStyle.casing  || 0) : (tier("gearbox") === 2 ? 3 : 0);
      const gbLouvres = gbStyle ? (gbStyle.louvres || 0) : 0;
      const gbHeat    = gbStyle ? (gbStyle.heat    || 0) : 0;
      const gbFinSY   = gbStyle && gbStyle.finSY ? gbStyle.finSY : 0.14;
      const gbFinSZ   = gbStyle && gbStyle.finSZ ? gbStyle.finSZ : 0.28;
      const gbHeatFins = gbStyle ? Math.max(0, Math.min(5, Math.round(gbStyle.heatFins || 0))) : 0;
      const gbRibs     = gbStyle ? Math.max(0, Math.min(3, Math.round(gbStyle.ribs || 0))) : 0;
      const gbCaseWmul = Math.max(0.75, Math.min(1.35, (gbStyle && gbStyle.caseWidth) || 1));
      if (gbStrakes > 0) {
        // Diffuser strakes — count AND height vary per spec (taller = higher-DF 'box).
        // UNCHANGED — gearbox visual tell, not an aero/floor restyle.
        const half = (gbStrakes - 1) / 2;
        for (let i = 0; i < gbStrakes; i++) {
          addBox(out, (i - half) * 0.24, 0.13 + gbStrakeH / 2, -2.20, 0.015, gbStrakeH, 0.42, CARBON);
        }
      }
      // Compact 2026 carbon gearbox casing behind the engine cover — bellhousing
      // flange → main case → rear taper into the crash structure. Width tracks
      // caseWidth; height/structure grow with casing tier (slim → ribbed →
      // side-plated with pick-up blisters).
      let gbCw = 0, gbCh = 0;
      if (gbCasing > 0) {
        gbCw = (0.15 + gbCasing * 0.05) * gbCaseWmul;
        gbCh = 0.13 + gbCasing * 0.03;
        // Bellhousing flange at the PU interface (thin, slightly proud).
        addBox(out, 0, 0.44, -1.92, gbCw * 1.08, gbCh * 1.12, 0.04, CARBON, SURFACES.carbon);
        // Main carbon case loft (roof pinched via t).
        addSpan(out,
          { z: -1.94, y: 0.44, w: gbCw * 1.02, h: gbCh, t: 0.90 },
          { z: -2.12, y: 0.435, w: gbCw, h: gbCh * 0.96, t: 0.88 },
          CARBON, null, SURFACES.carbon);
        if (gbCasing >= 2) {
          addSpan(out,
            { z: -2.12, y: 0.42, w: gbCw * 0.92, h: gbCh * 0.82, t: 0.88 },
            { z: -2.26, y: 0.40, w: gbCw * 0.58, h: gbCh * 0.62, t: 0.85 },
            DARK, null, SURFACES.carbon);
        }
        if (gbCasing >= 3) {
          for (const s of [-1, 1]) {
            addBox(out, s * (gbCw * 0.5 + 0.012), 0.44, -2.04, 0.02, gbCh * 0.9, 0.22,
                   [0.09, 0.09, 0.10], SURFACES.carbon);          // side plate
            addBox(out, s * (gbCw * 0.42), 0.32, -2.00, 0.04, 0.05, 0.10, DARK); // pick-up blister
          }
        }
        // Longitudinal carbon ribs on the flanks (SIGNATURE / tagged recipes).
        if (gbRibs > 0) {
          for (const s of [-1, 1]) for (let i = 0; i < gbRibs; i++) {
            addBox(out, s * (gbCw * 0.48), 0.44, -1.96 - i * 0.07,
                   0.012, gbCh * 0.72, 0.04, CARBON, SURFACES.carbon);
          }
        }
      }
      // Cooling-louvre bank on the casing flanks — count varies per spec; x
      // tracks the live half-width so wide/slim cases move the gill bank.
      if (gbLouvres > 0) {
        const hx = gbCasing > 0 ? (gbCw * 0.5 + 0.018) : 0.135;
        for (const s of [-1, 1]) for (let i = 0; i < gbLouvres; i++) {
          const y = 0.52 - i * 0.038;
          addBox(out, s * hx, y, -2.02, 0.028, 0.012, 0.18, INTAKE);                 // recess
          addBox(out, s * (hx + 0.012), y + 0.008, -2.00, 0.012, 0.008, 0.16, CARBON); // lip
        }
      }
      // Titanium heat-shield plate over the top of the 'box (higher specs).
      if (gbHeat) {
        const hw = gbCasing > 0 ? Math.max(0.16, gbCw * 0.88) : 0.19;
        addBox(out, 0, 0.55, -2.06, hw, 0.014, 0.28, [0.30, 0.30, 0.34], SURFACES.metal);
      }
      // Vertical titanium heat fins across the crown (recipe-gated; default 0).
      if (gbHeatFins > 0) {
        const half = (gbHeatFins - 1) / 2;
        const span = gbCasing > 0 ? Math.max(0.12, gbCw * 0.70) : 0.14;
        const step = gbHeatFins > 1 ? span / (gbHeatFins - 1) : 0;
        for (let i = 0; i < gbHeatFins; i++) {
          addBox(out, (i - half) * step, 0.575, -2.06, 0.010, 0.045, 0.22,
                 [0.30, 0.30, 0.34], SURFACES.metal);
        }
      }
      if (gbFin) addBox(out, 0, 0.27 + gbFinSY / 2, -2.30, 0.02, gbFinSY, gbFinSZ, CARBON);   // crash-structure fin

// ── 3) parts.js registry note (integrator) ───────────────────────────────────
// VISUAL_FIELD_REGISTRY.geometry.gearbox should become:
//   ["strakes", "fin", "strakeH", "finSY", "finSZ",
//    "casing", "louvres", "heat", "caseWidth", "heatFins", "ribs"]
