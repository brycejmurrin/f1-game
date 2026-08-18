// Cockpit halo furniture — drop-in for js/car/car3d.js
// REPLACE buildCockpitParts (~1260) and the COCKPIT recipe block (~2137–2162).
// Do NOT touch part("halo") beveled titanium hoop (~2243–2253).
// Do NOT restyle the vanity hood / bolsters (not cockpit-recipe gated).

  // COCKPIT: the halo and its furniture. haloBlade fairs the titanium hoop into
  // an aero section, haloWing adds the upper winglet, camPods sets the T-cam
  // count, screen adds the windscreen fairing. All default to the shipped cockpit.
  function buildCockpitParts(recipe) {
    return mergeRecipe({ haloBlade: 0, haloWing: 0, camPods: 0, screen: 0 }, recipe);
  }

  // ─── inside Car3D.build, after the chase/FP halo opening (~2136) ───────────
  //
  //    } else if (opts && opts.halo) {
  //      ... FP halo loft ...
  //    }
  //
  // COCKPIT recipe. haloBlade fairs the hoop into an aero section, haloWing
  // adds the upper winglet, camPods sets the T-cam count, screen adds the
  // windscreen fairing ahead of the opening. All zero = the shipped cockpit.
  // First-person build zeroes every knob (furniture lives around the head).
    const haloBlade = Math.max(0, Math.min(2, Math.round(ckpt ? 0 : cockpitStyle.haloBlade || 0)));
    if (haloBlade > 0) {
      // Aero-section sleeves on the SAME arcs as the beveled titanium halo
      // (part "halo" below). Sit proud of the tube so the metal bevel still
      // catches light; knob 2 thickens and adds a centre crown fairing.
      // FIA C3.13.3: fairings above Z=695 → y ≥ 0.695 (docs/COCKPIT-DATUMS.md).
      const bw = haloBlade === 2 ? 0.072 : 0.048;
      const bh = haloBlade === 2 ? 0.038 : 0.028;
      const bladeC = haloTint || HALO;
      for (const s of [-1, 1]) {
        addBeveledSpan(out,
          { z: 0.49, x: 0,       y: 0.828, w: bw,        h: bh,        t: 0.62 },
          { z: 0.02, x: s * 0.30, y: 0.858, w: bw * 0.92, h: bh * 0.92, t: 0.62 },
          0.010, bladeC, null, SURFACES.metal);
        addBeveledSpan(out,
          { z: 0.02,  x: s * 0.30,  y: 0.858, w: bw * 0.92, h: bh * 0.92, t: 0.62 },
          { z: -0.44, x: s * 0.235, y: 0.530, w: bw * 0.85, h: bh * 0.80, t: 0.55 },
          0.010, bladeC, null, SURFACES.metal);
      }
      if (haloBlade === 2) {
        addBeveledSpan(out,
          { z: 0.50, x: 0, y: 0.835, w: bw * 1.15, h: bh * 0.85, t: 0.50 },
          { z: 0.30, x: 0, y: 0.850, w: bw * 0.70, h: bh * 0.70, t: 0.55 },
          0.008, bladeC, null, SURFACES.metal);
      }
    }
    if (cockpitStyle.haloWing && !ckpt) {
      // Upper halo winglet — thin cambered plate + tiny end fences (not a box).
      const wingC = haloTint || HALO;
      addBeveledSpan(out,
        { z: 0.18, x: 0, y: 0.875, w: 0.32, h: 0.016, t: 0.50 },
        { z: -0.02, x: 0, y: 0.868, w: 0.24, h: 0.012, t: 0.42 },
        0.005, wingC, null, SURFACES.metal);
      for (const s of [-1, 1]) {
        addBox(out, s * 0.155, 0.872, 0.08, 0.010, 0.028, 0.10, wingC, SURFACES.metal);
      }
    }
    // Halo furniture, T-cam pods and the deflector all live around the driver's
    // head too — same reasoning as the hoop above, so the first-person build
    // carries none of them.
    const camPods = Math.max(0, Math.min(2, Math.round(ckpt ? 0 : cockpitStyle.camPods || 0)));
    for (let i = 0; i < camPods; i++) {
      const s = i === 0 ? -1 : 1;
      // Tiny T-cam: short stalk off the rear hoop + compact pod + glass lens.
      addBeamBetween(out,
        [s * 0.11, 0.760, -0.20],
        [s * 0.12, 0.812, -0.14],
        0.014, DARK);
      addBox(out, s * 0.12, 0.818, -0.118, 0.030, 0.026, 0.042, DARK);
      addBox(out, s * 0.12, 0.818, -0.094, 0.016, 0.014, 0.008, VISOR, SURFACES.glass);
    }
    if (cockpitStyle.screen && !ckpt) {
      // Windscreen fairing: carbon surround + inset visor + side returns that
      // meet the halo front-arc roots (tapers into the pillar, not a flat slab).
      addLoft(out, 0.48, 0, 0.655, 0.40, 0.028,
                   0.62, 0, 0.720, 0.20, 0.022, DARK);
      addLoft(out, 0.495, 0, 0.668, 0.34, 0.018,
                   0.605, 0, 0.710, 0.16, 0.014, VISOR, SURFACES.glass);
      for (const s of [-1, 1]) {
        addLoft(out, 0.50, s * 0.16, 0.690, 0.10, 0.020,
                     0.58, s * 0.06, 0.730, 0.06, 0.016, DARK);
      }
    }

  //    part("mirrors");
  //    ...
