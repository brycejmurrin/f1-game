/* Apex 26 — brakes mesh patch (2026 carbon disc / Brembo / scoop)
 *
 * DROP-IN replacements for js/car/car3d.js. Do not apply to tyres / rims except
 * the brake bits that already live inside addWheel.
 *
 * Integrator also:
 *   VISUAL_FIELD_REGISTRY.geometry.brakes — append "caliper"
 *   tests/specs/parts-physics.spec.js KNOBS — ["brakes", "caliper", 1]
 *   parts-delta.json — merge visual.caliper onto the listed catalog options
 *
 * Default body Car3D.build(c1,c2,{noWheels:true}) is byte-identical:
 *   caliper 0, scoop derived 0, rotor 1, discFace 0 → no extra faces.
 */

// ═══════════════════════════════════════════════════════════════════════════
// DROP-IN: buildBrakeParts  (js/car/car3d.js ~1205)
// ═══════════════════════════════════════════════════════════════════════════
function buildBrakeParts(recipe, tier) {
  return mergeRecipe({
    cal: BRAKE_CALIPER[tier], duct: tier === 0 ? 0.5 : tier === 2 ? 1.9 : 1,
    rim: null, caliperPos: 0, coverOpen: tier === 2 ? 1 : 0,
    rotor: tier === 2 ? 2 : 1, rotorScale: tier === 2 ? 1.12 : 1,
    // null = derive the duct fairing from `duct` (the shipped behaviour).
    scoop: null,
    // Disc face pattern seen through an open cover: 0 plain / 1 drilled / 2 slotted.
    discFace: 0,
    // Caliper hardware: 0 shipped 3-box peek / 1 Brembo monobloc / 2 six-piston radial.
    caliper: 0,
  }, recipe);
}

// ═══════════════════════════════════════════════════════════════════════════
// DROP-IN: addWheel  (js/car/car3d.js ~369)
// Brake edits: rotor tint + hat + rotor-face discFace; caliper 0|1|2.
// Tread, sidewalls, band, cover vanes, hub, spokes, tape, dish: UNCHANGED.
// ═══════════════════════════════════════════════════════════════════════════
function addWheel(out, cx, cy, cz, r, w, bandColor, caliperColor, rimColor,
                  grooved, tyreStyle, fixedOut, brakeStyle, wheelStyle) {
  const RC = rimColor || RIM;
  const SEG = 18;
  const x0 = cx - w/2, x1 = cx + w/2;
  const rimR = r * 0.68;
  const coverOpen = brakeStyle && brakeStyle.coverOpen || 0;
  const rotorScale = brakeStyle && brakeStyle.rotorScale || 1;
  // Tread: a lofted profile of shared rings with analytic radial normals — the
  // highlight wraps around the tyre instead of stepping facet to facet. Dry
  // compounds are a flat 2-ring cylinder (r constant); the wet-weather
  // `grooved` profile dips the radius at three bands to cut real circumferential
  // tread grooves (the actual construction difference a wet tyre has, not just
  // a different sidewall colour).
  const grooveCount = tyreStyle && tyreStyle.grooves != null
    ? tyreStyle.grooves : grooved ? 3 : 0;
  const grooveDepth = tyreStyle && tyreStyle.grooveDepth || 0.045;
  const PROFILE = [[0, 1]];
  for (let g = 0; g < grooveCount; g++) {
    const mid = (g + 1) / (grooveCount + 1);
    PROFILE.push([mid - 0.025, 1], [mid, 1 - grooveDepth], [mid + 0.025, 1]);
  }
  PROFILE.push([1, 1]);
  const i0 = out.pos.length / 3;
  for (const [xf, rm] of PROFILE) {
    const x = x0 + (x1 - x0) * xf, rr = r * rm;
    for (let i = 0; i < SEG; i++) {
      const a = (i / SEG) * Math.PI * 2;
      const c = Math.cos(a), s = Math.sin(a);
      out.pos.push(x, cy + rr * c, cz + rr * s);
      out.nrm.push(0, c, s);
      out.col.push(TYRE[0], TYRE[1], TYRE[2]);
      out.mat.push(SURFACES.rubber);
    }
  }
  for (let ri = 0; ri < PROFILE.length - 1; ri++) {
    for (let i = 0; i < SEG; i++) {
      const i2 = (i + 1) % SEG;
      const A = i0 + ri*SEG + i, B = i0 + ri*SEG + i2, C = i0 + (ri+1)*SEG + i2, D = i0 + (ri+1)*SEG + i;
      out.idx.push(A, B, C, A, C, D);
    }
  }
  // Sidewalls (flat): rubber shoulder from tread to the aero-cover edge, then
  // a distinct metal/carbon cover fan. Keeping the outer annulus rubber avoids
  // the old full-wheel silver dinner-plate look.
  const hub0 = [x0-0.012, cy, cz], hub1 = [x1+0.012, cy, cz];
  for (let i = 0; i < SEG; i++) {
    const a0 = (i / SEG) * Math.PI * 2, a1 = ((i+1) / SEG) * Math.PI * 2;
    const ya0 = cy + r*Math.cos(a0), za0 = cz + r*Math.sin(a0);
    const ya1 = cy + r*Math.cos(a1), za1 = cz + r*Math.sin(a1);
    const rya0 = cy + rimR*Math.cos(a0), rza0 = cz + rimR*Math.sin(a0);
    const rya1 = cy + rimR*Math.cos(a1), rza1 = cz + rimR*Math.sin(a1);
    const A0=[x0,ya0,za0], A1=[x0,ya1,za1], B0=[x1,ya0,za0], B1=[x1,ya1,za1];
    const R0=[x1,rya0,rza0], R1=[x1,rya1,rza1];
    // SINGLE face per wall (no coincident duplicate). The wheel is drawn
    // CULL-OFF (double-sided, see getPlayerWheelMeshes / the wheel draw opts), so
    // each single face shows from BOTH sides — opaque from outside, from behind,
    // and through the spoke gaps — with nothing to z-fight. That was the whole
    // "translucent tyre" bug: double-wound coincident faces flickering on real
    // mobile depth precision (SwiftShader tolerated it, so it looked solid headless).
    addQuad(out, B0, B1, R1, R0, TYRE, SURFACES.rubber);
    if (!coverOpen || i % (coverOpen >= 2 ? 2 : 3) !== 0)
      addTri(out, hub1, R0, R1, HUB, SURFACES.metal);   // right (+X)
    const L0=[x0,rya0,rza0], L1=[x0,rya1,rza1];
    addQuad(out, A0, A1, L1, L0, TYRE, SURFACES.rubber);
    if (!coverOpen || i % (coverOpen >= 2 ? 2 : 3) !== 0)
      addTri(out, hub0, L0, L1, HUB, SURFACES.metal);   // left (−X)
  }
  // Brake rotor sits behind the cover; open-cover recipes expose alternating
  // sectors while closed covers retain only a subtle metallic edge.
  // `rotor >= 2` or `discFace > 0` tints the ring carbon (2026 C-C disc) and
  // adds the aluminium bell + face drilling — rotor:1 / discFace:0 is the
  // shipped gunmetal ring + 3 vane boxes.
  const rotorOuter = r * Math.min(0.40, 0.32 * rotorScale);
  const rotorInner = r * 0.17;
  const rotorDetail = brakeStyle && brakeStyle.rotor || 0;
  const discFaceRotor = Math.max(0, Math.min(2, Math.round((brakeStyle && brakeStyle.discFace) || 0)));
  const carbonDisc = rotorDetail >= 2 || discFaceRotor > 0;
  const rotorCol = carbonDisc ? [0.12, 0.12, 0.13] : [0.24, 0.24, 0.26];
  const rotorSurf = carbonDisc ? SURFACES.carbon : SURFACES.metal;
  for (const face of [[x0 + 0.008, -1], [x1 - 0.008, 1]]) {
    for (let i = 0; i < SEG; i++) {
      const a0 = i / SEG * Math.PI * 2, a1 = (i + 1) / SEG * Math.PI * 2;
      const P = (rad, a) => [face[0], cy + rad*Math.cos(a), cz + rad*Math.sin(a)];
      addQuad(out, P(rotorOuter,a0), P(rotorOuter,a1), P(rotorInner,a1), P(rotorInner,a0),
        rotorCol, rotorSurf);
    }
    for (let i = 0; i < rotorDetail * 3; i++) {
      const a = i / (rotorDetail * 3) * Math.PI * 2, rr = (rotorInner + rotorOuter) * 0.5;
      addBox(out, face[0], cy + rr*Math.cos(a), cz + rr*Math.sin(a),
        0.012, 0.018, 0.018, [0.07,0.07,0.08], SURFACES.carbon);
    }
    if (rotorDetail >= 2) {
      const hatOuter = rotorInner * 1.08, hatInner = rotorInner * 0.52;
      for (let i = 0; i < SEG; i++) {
        const a0 = i / SEG * Math.PI * 2, a1 = (i + 1) / SEG * Math.PI * 2;
        const P = (rad, a) => [face[0], cy + rad*Math.cos(a), cz + rad*Math.sin(a)];
        addQuad(out, P(hatOuter,a0), P(hatOuter,a1), P(hatInner,a1), P(hatInner,a0),
          [0.34, 0.34, 0.37], SURFACES.metal);
      }
    }
    if (discFaceRotor > 0) {
      const marks = discFaceRotor === 1 ? 10 : 6;
      const rad = (rotorInner + rotorOuter) * 0.55;
      for (let k = 0; k < marks; k++) {
        const a = (k / marks) * Math.PI * 2 + 0.14;
        const sz = discFaceRotor === 1 ? 0.012 : 0.026;
        addBox(out, face[0], cy + rad * Math.cos(a), cz + rad * Math.sin(a),
          0.005, sz, sz * (discFaceRotor === 1 ? 1 : 0.40),
          INTAKE, SURFACES.carbon);
      }
    }
  }
  // Pirelli-style compound band: a bright ring on both sidewalls just inside
  // the tread — the classic modern-F1 tyre read (and a colour accent on an
  // otherwise all-dark corner of the car). TYRES visualTier recolours it.
  const BAND = bandColor || [0.85, 0.10, 0.08];
  const bandWidth = tyreStyle && tyreStyle.bandWidth != null ? tyreStyle.bandWidth : 0.09;
  for (const bs of [[x0, -1], [x1, 1]]) {
    const xb = bs[0] + bs[1] * 0.004;
    for (let i = 0; i < SEG; i++) {
      const a0 = (i / SEG) * Math.PI * 2, a1 = ((i + 1) / SEG) * Math.PI * 2;
      const P = (rad, a) => [xb, cy + rad * Math.cos(a), cz + rad * Math.sin(a)];
      const outer = 0.96, inner = Math.max(0.76, outer - bandWidth);
      const A = P(r * outer, a0), B = P(r * outer, a1), C = P(r * inner, a1), D = P(r * inner, a0);
      addQuad(out, A, B, C, D, BAND, SURFACES.rubber);   // single face (wheel drawn cull-off → shows both sides, no z-fight)
    }
  }
  // --- Modern covered-wheel FACE: the flat disc above IS the aero cover (solid,
  // opaque, single-face). On top of it, proud detail: machined cover vanes (so
  // rotation reads), a raised hub cap + a bright wheel-nut centre, and the brake
  // caliper clamped at the top edge where it actually peeks out past the cover.
  // Everything here is additive/proud, so the opaque tyre structure is untouched.

  // Cover vanes: six slim recessed-look blades sweeping out from the hub — subtle
  // but enough to read the wheel ROTATION (tread/cover are rotationally uniform).
  const VANE = [0.26, 0.26, 0.30];
  // Sidewall SHOULDER profile — a proud ring just inside the tread that changes
  // the tyre's outline: 1 rounds it off, 2 steps it in. Purely additive.
  const tyreShoulder = Math.max(0, Math.min(2, Math.round((tyreStyle && tyreStyle.shoulder) || 0)));
  if (tyreShoulder > 0) {
    const shR = r * (tyreShoulder === 2 ? 0.90 : 0.945);
    const shW = tyreShoulder === 2 ? 0.020 : 0.012;
    for (const ss of [[x0, -1], [x1, 1]]) {
      const xs = ss[0] + ss[1] * 0.004;
      for (let k = 0; k < 18; k++) {
        const a0 = (k / 18) * Math.PI * 2, a1 = ((k + 1) / 18) * Math.PI * 2;
        const A = (rad, a) => [xs, cy + rad * Math.cos(a), cz + rad * Math.sin(a)];
        addQuad(out, A(shR, a0), A(shR + shW, a0), A(shR + shW, a1), A(shR, a1),
                TYRE, SURFACES.rubber);
      }
    }
  }
  const coverVanes = tyreStyle && tyreStyle.coverVanes || 6;
  for (const ss of [[x0, -1], [x1, 1]]) {
    const xs = ss[0] + ss[1] * 0.014;
    for (let k = 0; k < coverVanes; k++) {
      const a = (k / coverVanes) * Math.PI * 2 + 0.25;
      const uy = Math.cos(a), uz = Math.sin(a), py = -Math.sin(a), pz = Math.cos(a);
      const hw = 0.010, ri = rimR * 0.46, ro = rimR * 0.98;
      const P = (rad, s) => [xs, cy + uy * rad + py * hw * s, cz + uz * rad + pz * hw * s];
      addQuad(out, P(ri, 1), P(ro, 1), P(ro, -1), P(ri, -1), VANE, SURFACES.metal);
    }
    // Disc FACE pattern, proud of the cover so it reads at a glance: a ring of
    // drilled holes (1) or a set of curved slots (2). Two brake packages with
    // the same duct size now look like different discs, not one resized disc.
    // Kept on the cover (closed-cover tell). The actual carbon disc also gets
    // matching marks when discFaceRotor > 0 — see rotor loop above.
    const discFace = Math.max(0, Math.min(2, Math.round((brakeStyle && brakeStyle.discFace) || 0)));
    if (discFace > 0) {
      const marks = discFace === 1 ? 10 : 6;
      for (let k = 0; k < marks; k++) {
        const a = (k / marks) * Math.PI * 2 + 0.14;
        const rad = rimR * 0.74;
        const my = cy + rad * Math.cos(a), mz2 = cz + rad * Math.sin(a);
        const sz = discFace === 1 ? 0.016 : 0.030;
        addBox(out, xs, my, mz2, 0.004, sz, sz * (discFace === 1 ? 1 : 0.45),
               [0.05, 0.05, 0.06], SURFACES.carbon);
      }
    }
  }
  // Raised hub cap: a proud gunmetal centre disc + a bright wheel-nut cap (the
  // brake package's accent colour, else the tyre band) — the modern F1 wheel
  // centre and the one bright focal point on an otherwise dark corner.
  const HUBCAP = [0.15, 0.15, 0.18];
  const NUT = caliperColor || bandColor || [0.85, 0.72, 0.10];
  for (const ss of [[x0, -1], [x1, 1]]) {
    const dir = ss[1], xc0 = ss[0] + dir * 0.020, hcR = rimR * 0.46, ctr = [xc0, cy, cz];
    for (let i = 0; i < SEG; i++) {
      const a0 = (i / SEG) * Math.PI * 2, a1 = ((i + 1) / SEG) * Math.PI * 2;
      addTri(out, ctr, [xc0, cy + hcR*Math.cos(a0), cz + hcR*Math.sin(a0)],
                       [xc0, cy + hcR*Math.cos(a1), cz + hcR*Math.sin(a1)], HUBCAP, SURFACES.metal);   // single face (cull-off → opaque both sides)
    }
    // rim of the hub cap (thin bright ring), then the proud wheel-nut cap.
    const nutCol = (wheelStyle && wheelStyle.nut) || NUT;
    addBox(out, ss[0] + dir * 0.032, cy, cz, 0.026, hcR * 0.42, hcR * 0.42, nutCol, SURFACES.metal);
    // Rim SPOKES: straight blades from the hub out to the rim, proud of the
    // cover so they read whether or not the cover is cut open.
    const spokeN = Math.max(0, Math.min(8, Math.round((wheelStyle && wheelStyle.spokes) || 0)));
    for (let k = 0; k < spokeN; k++) {
      const a = (k / spokeN) * Math.PI * 2 + 0.4;
      const uy = Math.cos(a), uz = Math.sin(a), py = -Math.sin(a), pz = Math.cos(a);
      const hw = 0.018, ri = hcR * 1.05, ro = rimR * 0.92, xs2 = ss[0] + dir * 0.024;
      const P = (rad, sgn) => [xs2, cy + uy * rad + py * hw * sgn, cz + uz * rad + pz * hw * sgn];
      addQuad(out, P(ri, 1), P(ro, 1), P(ro, -1), P(ri, -1), HUBCAP, SURFACES.metal);
    }
    // Rim TAPE: a coloured band around the rim shoulder — the cheapest way to
    // tell two otherwise identical wheels apart at racing speed.
    if (wheelStyle && wheelStyle.tape) {
      const tr = rimR * 1.02, tc = (wheelStyle.nut) || bandColor;
      for (let k = 0; k < 20; k++) {
        const a0 = (k / 20) * Math.PI * 2, a1 = ((k + 1) / 20) * Math.PI * 2;
        const A = (rad, a) => [ss[0] + dir * 0.010, cy + rad * Math.cos(a), cz + rad * Math.sin(a)];
        addQuad(out, A(tr, a0), A(tr + 0.022, a0), A(tr + 0.022, a1), A(tr, a1), tc, SURFACES.metal);
      }
    }
    // Cover DISH: a recessed inner face, so the wheel reads concave or flat
    // from the side rather than always being a flat disc.
    const dish = Math.max(0, Math.min(2, Math.round((wheelStyle && wheelStyle.dish) || 0)));
    if (dish > 0) {
      const dr = rimR * (dish === 2 ? 0.80 : 0.88), dx = ss[0] + dir * (0.012 * dish);
      for (let k = 0; k < 16; k++) {
        const a0 = (k / 16) * Math.PI * 2, a1 = ((k + 1) / 16) * Math.PI * 2;
        addTri(out, [dx, cy, cz],
               [dx, cy + dr * Math.cos(a0), cz + dr * Math.sin(a0)],
               [dx, cy + dr * Math.cos(a1), cz + dr * Math.sin(a1)], HUBCAP, SURFACES.metal);
      }
    }
  }
  // Brake caliper: a compact monobloc clamped at the TOP of the disc (12 o'clock)
  // where a covered-wheel caliper actually peeks out above the cover. Straddles
  // the wheel width and sits proud on both faces so it reads from the side/3-4,
  // in the brake package's accent colour with darker pad plates.
  // `caliper` 0 = shipped 3-box (byte-identical). 1 = Brembo four-piston monobloc.
  // 2 = six-piston radial. Pads/bridge in the shipped path stay at 12 o'clock.
  if (caliperColor) {
    const calOut = fixedOut || out;
    const cr = r * 0.78;                     // top edge, just inside the tread band
    const calA = brakeStyle && brakeStyle.caliperPos || 0;
    const padCol = [caliperColor[0]*0.30, caliperColor[1]*0.30, caliperColor[2]*0.30];
    const calLvl = Math.max(0, Math.min(2, Math.round((brakeStyle && brakeStyle.caliper) || 0)));
    if (calLvl === 0) {
      for (let i = 0; i < 3; i++) {
        const a = calA + (i - 1) * 0.17;       // ~±10° arc around selected clock position
        addBox(calOut, cx, cy + Math.cos(a) * cr, cz + Math.sin(a) * cr,
               w * 1.06, 0.052, 0.055, caliperColor, SURFACES.metal);   // spans the width, proud past both faces
      }
      // pad plates hugging each disc face + the machined bridge over the crown
      for (const sgn of [-1, 1])
        addBox(calOut, cx + sgn * (w * 0.52 + 0.006), cy + cr, cz, 0.02, 0.05, 0.11, padCol, SURFACES.metal);
      addBox(calOut, cx, cy + cr + 0.04, cz, w * 1.0, 0.02, 0.10, caliperColor, SURFACES.metal);   // bridge rib
    } else {
      const cY = cy + Math.cos(calA) * cr, cZ = cz + Math.sin(calA) * cr;
      const pistons = calLvl === 2 ? 6 : 4;
      const bodyW = w * (calLvl === 2 ? 1.14 : 1.08);
      const bodyH = calLvl === 2 ? 0.078 : 0.068;
      const bodyD = calLvl === 2 ? 0.118 : 0.100;
      addBox(calOut, cx, cY, cZ, bodyW, bodyH, bodyD, caliperColor, SURFACES.metal);   // monobloc casting
      addBox(calOut, cx, cY, cZ, bodyW * 0.42, bodyH * 0.45, bodyD * 0.55,
             [0.04, 0.04, 0.05], SURFACES.metal);   // weight-saving window
      const ty = -Math.sin(calA), tz = Math.cos(calA);
      const span = bodyD * 0.62;
      for (const sgn of [-1, 1]) {
        for (let p = 0; p < pistons; p++) {
          const t = (p / (pistons - 1) - 0.5) * span;
          addBox(calOut, cx + sgn * (w * 0.50 + 0.012), cY + ty * t, cZ + tz * t,
                 0.018, 0.028, 0.028, padCol, SURFACES.metal);   // piston boss
        }
      }
      for (const sgn of [-1, 1])
        addBox(calOut, cx + sgn * (w * 0.52 + 0.006), cY, cZ, 0.016, 0.042, 0.090, padCol, SURFACES.metal);
      const earR = cr - 0.055;
      addBox(calOut, cx, cy + Math.cos(calA) * earR, cz + Math.sin(calA) * earR,
             w * 0.55, 0.024, 0.040, caliperColor, SURFACES.metal);   // radial-mount ear
      addBox(calOut, cx, cY + 0.048, cZ, 0.014, 0.016, 0.016, [0.55, 0.55, 0.58], SURFACES.metal);   // bleed nipple
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// DROP-IN: brakeDucts draw  (js/car/car3d.js ~2675)
// Surrounding `part("brakeDucts")` / `const brakesT = …` kept for context.
// scoop === 0 (default derive from duct:1) is the four shipped DARK boxes.
// ═══════════════════════════════════════════════════════════════════════════
    part("brakeDucts");
    // --- Brake duct fairings (front + rear wheels) --- per BRAKES option: duct
    // size + a big-brake winglet. Cockpit build keeps only the FRONT ducts.
    const brakesT = tier("brakes");
    const ductMul = brakeStyle ? brakeStyle.duct : (brakesT === 0 ? 0.5 : brakesT === 2 ? 1.9 : 1.0);
    // Brake packages alter duct and caliper hardware. Heat glow is emitted only
    // by the runtime brake-ring effect once live brake temperature crosses its
    // threshold; baking it into high-spec meshes made parked cars look overheated.
    // Duct FAIRING form (`scoop`): 0 bare inlet · 1 the horizontal winglet that
    // shipped with big-brake specs · 2 a wrapped boomerang — winglet plus an
    // outboard fence and a lower deflector curling around the wheel face. Absent
    // from a recipe, it derives from duct size exactly as before.
    // scoop ≥ 1 also grows a forward INTAKE mouth (lips + void) so the winglet
    // reads as a duct, not a shelf. scoop ≥ 2 adds the inboard cheek.
    const brakeScoop = Math.max(0, Math.min(2, Math.round(
      brakeStyle && brakeStyle.scoop != null ? brakeStyle.scoop : (ductMul >= 1.3 ? 1 : 0))));
    for (const s of [-1, 1]) {
      addBox(out, s*0.60, 0.28, AXLES.frontZ + 0.19, 0.06, 0.20 * ductMul, 0.13 * ductMul, DARK);
      // Big-brake spec: a horizontal duct winglet scooping over each front wheel.
      if (brakeScoop >= 1) addBox(out, s*0.65, 0.42, AXLES.frontZ + 0.16, 0.11, 0.02, 0.15, CARBON);
      if (brakeScoop >= 1) {
        addBox(out, s*0.65, 0.355, AXLES.frontZ + 0.22, 0.08, 0.055, 0.04, INTAKE);   // hollow mouth
        addBox(out, s*0.65, 0.395, AXLES.frontZ + 0.245, 0.09, 0.012, 0.03, CARBON);  // upper lip
        addBox(out, s*0.65, 0.315, AXLES.frontZ + 0.245, 0.09, 0.012, 0.03, CARBON);  // lower lip
      }
      if (brakeScoop >= 2) {
        addBox(out, s*0.705, 0.38, AXLES.frontZ + 0.15, 0.014, 0.12, 0.17, CARBON);   // outboard fence
        addBox(out, s*0.655, 0.20, AXLES.frontZ + 0.11, 0.10, 0.016, 0.20, CARBON);   // lower deflector
        addBox(out, s*0.595, 0.32, AXLES.frontZ + 0.14, 0.014, 0.10, 0.16, CARBON);   // inboard cheek
      }
      if (!ckpt) addBox(out, s*0.58, 0.30, AXLES.rearZ - 0.20, 0.06, 0.18 * ductMul, 0.12 * ductMul, DARK);
      if (brakeScoop >= 1 && !ckpt) {
        addBox(out, s*0.58, 0.355, AXLES.rearZ - 0.275, 0.07, 0.040, 0.045, INTAKE);  // rear mouth void
        addBox(out, s*0.58, 0.385, AXLES.rearZ - 0.295, 0.08, 0.010, 0.028, CARBON);  // rear lip
      }
    }
