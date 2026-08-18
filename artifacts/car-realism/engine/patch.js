/**
 * Engine realism patch — drop-in for js/car/car3d.js
 *
 * Replace:
 *   1) buildEngineParts (~1163)
 *   2) engineCover draw block (~1743–1786) — airbox / snork / outlet
 *   3) sidepod chimney block (~1977–1988)
 *
 * Leave buildEngineCoverBodywork and buildSidepodBodywork untouched.
 * scoopLip defaults to 0 → byte-identical default body.
 *
 * Also add "scoopLip" to VISUAL_FIELD_REGISTRY.geometry.engine in parts.js
 * and ["engine","scoopLip",2] to parts-physics KNOBS when landing.
 */

// ─── 1) buildEngineParts ─────────────────────────────────────────────────────
function buildEngineParts(recipe, tier) {
  return mergeRecipe({
    in: tier === 0 ? 0.52 : tier === 2 ? 1.65 : 1,
    snork: tier === 2 ? 1 : 0, twin: tier === 2 ? 1 : 0,
    inlet: tier === 0 ? 0 : tier === 2 ? 2 : 1,
    outlet: tier === 0 ? 0 : tier === 2 ? 2 : 1,
    podWidth: 1, shoulderHeight: 1, undercut: 1,
    coke: 1, tailWidth: 1, coverHeight: 1,
    servicePanel: tier === 2 ? 3 : 1, heatShield: 1,
    chimney: 0,
    // 2026 intake lip. 0 none (shipped) · 1 thin mouth ring · 2 ring + cheeks.
    // Default 0 so every recipe written before this knob builds identical geometry.
    scoopLip: 0,
  }, recipe);
}

// ─── 2) engineCover draw (inside `if (!ckpt) { ... }` after inScale / engSnork) ─
//
// Context already in scope: out, c1, accentC, engStyle, anchors, teamStyle,
// engT, inScale, engSnork, INTAKE, CARBON, DARK, SURFACES, coverGeom (assigned).
//
// --- BEGIN REPLACEMENT from airbox addSpan through outlet block ---

      // Airbox: trapezoid block above the cockpit (dark intake front). The
      // resolved engine recipe controls intake scale, snorkel and cover louvres.
      // Stock / scoopLip:0 / !snork keeps this single span byte-identical.
      addSpan(out, { z: -0.28, y: 0.76, w: 0.30 * inScale, h: 0.20 * inScale, t: 0.55 },
                   { z: -0.75, y: 0.74, w: 0.26 * inScale, h: 0.18 * inScale, t: 0.55 }, c1, INTAKE);
      coverGeom = buildEngineCoverBodywork(out, c1, accentC, engStyle, anchors);

      // Optional scoop lip on the roll-hoop mouth (recipe-gated; default 0).
      const scoopLip = Math.max(0, Math.min(2, Math.round((engStyle && engStyle.scoopLip) || 0)));
      if (scoopLip >= 1) {
        addBox(out, 0, 0.855, -0.265,
               0.27 * inScale, 0.032, 0.030, INTAKE);
      }
      if (scoopLip >= 2) {
        for (const s of [-1, 1]) {
          addBox(out, s * (0.115 * inScale), 0.835, -0.295,
                 0.045, 0.055, 0.055, CARBON);
        }
      }

      if (engSnork) {
        // 2026 roll-hoop snorkel: lofted throat → crest → cover merge (was one
        // boxy span). Scale tracks intake size so a quali PU dwarfs a turbo.
        const sk = 0.78 + inScale * 0.32;
        const mouth = { z: -0.12, y: 0.96, w: 0.15 * sk, h: 0.10 * sk, t: 0.62 };
        const crest = { z: -0.38, y: 1.02, w: 0.12 * sk, h: 0.13 * sk, t: 0.55 };
        const merge = { z: -0.68, y: 0.88, w: 0.10 * sk, h: 0.09 * sk, t: 0.50 };
        addSpan(out, mouth, crest, c1, INTAKE);
        addBeveledSpan(out, crest, merge, 0.010, c1, null);
        // Dark intake void sitting in the mouth plane (reads as a real scoop).
        addBox(out, 0, mouth.y + 0.01, mouth.z + 0.01,
               mouth.w * 0.72, mouth.h * 0.55, 0.04, INTAKE);
        if (scoopLip >= 1) {
          addBox(out, 0, mouth.y + mouth.h * 0.35, mouth.z + 0.02,
                 mouth.w * 0.88, 0.022, 0.028, CARBON);
        }
        const lf = anchors.coverAt(-0.80), lr = anchors.coverAt(-1.40);
        for (const s of [-1, 1])
          addSpan(out,
            { z: lf.z, x: s*(lf.x*0.78), y: lf.top - 0.08, w: 0.015, h: 0.10 },
            { z: lr.z, x: s*(lr.x*0.78), y: lr.top - 0.08, w: 0.015, h: 0.10 }, CARBON);
      }
      // Engine-cover hot-air cooling exit — FORM varies per PU spec (ENGINE_STYLE
      // .outlet): 0 sealed low-drag deck, 1 slim gill pair, 2 broad shark-gill
      // louvre bank + a central tail vent, 3 twin chimney stacks. A clear extra
      // per-engine read on the cover flanks that a sealed deck (lean_burn) lacks.
      const engOutlet = engStyle && engStyle.outlet != null ? engStyle.outlet
                      : (engT === 2 ? 2 : engT === 0 ? 0 : 1);
      if (engOutlet >= 1) {
        for (const s of [-1, 1]) {
          if (engOutlet === 3) {
            // Twin cover chimneys: tapered loft (was two boxes).
            const cp = anchors.coverAt(-1.42);
            const cx = s * (cp.x * 0.78);
            addSpan(out,
              { z: -1.34, x: cx, y: cp.top - 0.02, w: 0.085, h: 0.040, t: 0.80 },
              { z: -1.50, x: cx, y: cp.top + 0.04, w: 0.055, h: 0.095, t: 0.65 },
              CARBON);
            addBox(out, cx, cp.top + 0.095, -1.44, 0.042, 0.016, 0.070, INTAKE);
          } else {
            const n = engOutlet === 2 ? 4 : 2;
            for (let i = 0; i < n; i++) {
              const gf = anchors.coverAt(-1.13), gr = anchors.coverAt(-1.47);
              addSpan(out,
                { z: gf.z, x: s*(gf.x*0.82), y: gf.top - 0.11 - i*0.040, w: 0.02, h: 0.018 },
                { z: gr.z, x: s*(gr.x*0.82), y: gr.top - 0.09 - i*0.040, w: 0.02, h: 0.018 },
                engOutlet === 2 ? DARK : CARBON);
            }
          }
        }
        // Central hot-air vent slot at the tail of the cover (broad-cooling specs).
        if (engOutlet >= 2) addBox(out, 0, coverGeom.tailVentY, -1.72, 0.13, 0.05, 0.18, INTAKE);
      }

// --- END REPLACEMENT (servicePanel / heatShield / fin / LEDs continue as today) ---


// ─── 3) sidepod cooling chimneys (~1977) ─────────────────────────────────────
//
// --- BEGIN REPLACEMENT ---

    // --- Sidepod cooling CHIMNEYS (engine recipe `chimney`, 0..3): lofted
    // tapered stacks on the pod shoulder, each capped by a dark exit slot.
    // Same triangle count as the old twin-box stacks (~24/side); silhouette
    // reads as open 2026 cooling instead of cubes. Anchored on podAt() so they
    // ride whatever bodywork the engine recipe lofted. ---
    const engChimney = Math.max(0, Math.min(3, Math.round(engStyle.chimney || 0)));
    for (const s of [-1, 1]) for (let i = 0; i < engChimney; i++) {
      const z = -0.16 - i * 0.30, p = anchors.podAt(z);
      const cx = s * Math.max(0.16, p.x - 0.055);
      addSpan(out,
        { z: z + 0.048, x: cx, y: p.top + 0.016, w: 0.078, h: 0.028, t: 0.85 },
        { z: z - 0.048, x: cx, y: p.top + 0.068, w: 0.050, h: 0.078, t: 0.70 },
        CARBON);
      addBox(out, cx, p.top + 0.112, z - 0.012, 0.040, 0.014, 0.060, INTAKE);
    }

// --- END REPLACEMENT ---


// ─── Optional (gated): inlet 2/3 beveled scoops ───────────────────────────────
// Stock uses inlet===1 — leave that branch alone. Only swap the engInlet===2
// and ===3 arms if you want prouder mouths without touching the default body.
//
// else if (engInlet === 2) {
//   addBeveledSpan(out,
//     { z: inlet.z + 0.04, x: s*inlet.x, y: inlet.y, w: inlet.width * 0.92, h: inlet.height * 0.82, t: 0.9 },
//     { z: inlet.z - 0.02, x: s*inlet.x, y: inlet.y, w: inlet.width * 0.78, h: inlet.height * 0.70, t: 0.85 },
//     0.006, INTAKE);
//   addBox(out, s*inlet.x, inlet.y, inlet.z + 0.023, inlet.width * 0.84, inlet.height * 0.62, 0.03, DARK);
// } else if (engInlet === 3) {
//   for (const dx of [-1, 1])
//     addBeveledSpan(out,
//       { z: inlet.z + 0.035, x: s*(inlet.x + dx*inlet.width*0.22), y: inlet.y,
//         w: inlet.width * 0.34, h: inlet.height * 0.88, t: 0.9 },
//       { z: inlet.z - 0.015, x: s*(inlet.x + dx*inlet.width*0.22), y: inlet.y,
//         w: inlet.width * 0.28, h: inlet.height * 0.72, t: 0.85 },
//       0.005, INTAKE);
// }
