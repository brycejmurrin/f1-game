/*
 * Apex 26 — procedural 2026 F1 car.
 * Car3D.build(color, color2) -> plain {pos,nrm,col,mat,idx} for gfx.createMesh.
 * Local space: +Z forward, +Y up, origin on the ground under the car center.
 * ~1.9 m wide, ~5.4 m long, ~0.95 m tall.
 *
 * The car is HAND-MODELLED from chiseled hexahedron blocks — nose wedge,
 * monocoque slab, cockpit collar, airbox trapezoid, engine-cover roof prism,
 * undercut sidepod slabs — every face flat-shaded, so each panel catches one
 * clean reflection tone and flashes as a unit (the low-poly facet glint that
 * matches the game world). Only the helmet dome and tyre treads stay smooth.
 */
"use strict";

const Car3D = (function () {
  // Car-only surface ids deliberately live above TrackGeom.MAT's 0..15 range.
  // Material 0 remains the generic/imported/custom compatibility path.
  const SURFACES = Object.freeze({
    custom: 0, paint: 20, carbon: 21, rubber: 22,
    metal: 23, glass: 24,
    emissive: 25, functionalEmissive: 25, panel: 26, mirror: 27,
  });
  // Livery FINISH -> the surface id the body paint is emitted as. "gloss" (or an
  // absent finish) keeps SURFACES.paint, i.e. the clearcoat + metallic-flake car
  // paint the lit shader has always given bodywork. The two alternatives reuse
  // ids the shader already classifies, so no renderer needs a new branch:
  //   satin  -> panel   (roughness >= 0.72, specular 0.35 — a flat matte wrap)
  //   chrome -> mirror  (clearcoat + env lobe + near-zero roughness)
  // Chrome originally reused `metal`, which looked WORSE than gloss: metalness
  // kills the diffuse response while the shader's env lobe is gated on
  // clearcoat, which metal has none of — so the body went dark and flat with
  // nothing to reflect. `mirror` is its own id so no existing metal part (rims,
  // halo, heat shields) changes, and a backend that does not classify it simply
  // renders ordinary paint.
  const FINISH_SURFACE = Object.freeze({ satin: 26, chrome: 27 });
  const DARK   = [0.05, 0.05, 0.05];
  const CARBON = [0.07, 0.07, 0.08];
  const VISOR  = [0.08, 0.08, 0.09];          // tinted visor
  const PANEL  = [0.82, 0.82, 0.86];          // matte sponsor / number plate
  const TYRE   = [0.06, 0.06, 0.07];
  const RIM    = [0.11, 0.11, 0.13];
  const HUB    = [0.28, 0.28, 0.31];
  const INTAKE = [0.03, 0.03, 0.04];          // radiator inlet void
  const HALO   = [0.17, 0.17, 0.19];          // brushed-titanium cockpit-protection hoop
  // Category-neutral chassis datums. Parts may dress and reshape bodywork around
  // these, but the wheel/physics reference points never move.
  const AXLES = Object.freeze({ frontZ: 1.7, rearZ: -1.6, wheelY: 0.34 });
  const CHASSIS = Object.freeze({
    floor: Object.freeze({ cx: 0, cy: 0.07, cz: -0.3, sx: 1.5, sy: 0.06, sz: 3.2 }),
    nose: Object.freeze([
      Object.freeze({ z: 3.18, y: 0.245, w: 0.115, h: 0.072, t: 0.68 }),
      Object.freeze({ z: 2.00, y: 0.315, w: 0.36, h: 0.235, t: 0.86 }),
      Object.freeze({ z: 1.05, y: 0.350, w: 0.48, h: 0.36, t: 0.82 }),
    ]),
    monocoque: Object.freeze([
      Object.freeze({ z: 1.05, y: 0.355, w: 0.48, h: 0.38, t: 0.80 }),
      Object.freeze({ z: 0.05, y: 0.395, w: 0.60, h: 0.48, t: 0.72 }),
    ]),
    cockpit: Object.freeze([
      Object.freeze({ z: 0.05, y: 0.415, w: 0.58, h: 0.44, t: 0.68 }),
      Object.freeze({ z: -0.55, y: 0.435, w: 0.50, h: 0.48, t: 0.50 }),
    ]),
  });

  // ── Per-team chassis identity ────────────────────────────────────────────
  // Each team gets a distinct SILHOUETTE independent of parts and livery: nose
  // profile (length/width/droop), airbox intake scale, an optional engine-cover
  // dorsal fin, mirror housing style and sidepod-inlet aspect. All knobs are
  // bounded multipliers/offsets around the shared chassis datums so wheelbase,
  // physics reference points and decal anchoring stay untouched (bodyAnchors
  // consumes the SAME styled stations the bodywork lofts from).
  //   noseTipZ  m   +longer / −shorter nose tip           (±0.10)
  //   noseSlim  ×   tip width+height scale                (0.82..1.18)
  //   noseDroop m   tip vertical drop (classic droop nose) (−0.03..+0.01)
  //   airbox    ×   intake scale multiplier on the engine recipe
  //   fin       0|1|2  engine-cover dorsal fin: none / low blade / tall blade
  //                 (a SECONDARY ridge blade — the sharkFin tail plate itself
  //                  is a separate part every non-cockpit car carries)
  //   mirror    0|1|2  housing style: standard / swept-wide / low-slung
  //   inlet     m   sidepod inlet-top bias: +taller / −squashed (±0.035)
  const DEFAULT_STYLE = Object.freeze({ noseTipZ: 0, noseSlim: 1, noseDroop: 0,
    airbox: 1, fin: 0, mirror: 0, inlet: 0 });
  const TEAM_STYLE = Object.freeze({
    mercedes:    Object.freeze({ noseTipZ:  0.08, noseSlim: 0.86, noseDroop:  0,      airbox: 0.94, fin: 0, mirror: 1, inlet: -0.022 }),
    ferrari:     Object.freeze({ noseTipZ:  0,    noseSlim: 1.04, noseDroop: -0.024,  airbox: 1.00, fin: 1, mirror: 0, inlet:  0.018 }),
    mclaren:     Object.freeze({ noseTipZ: -0.06, noseSlim: 0.92, noseDroop:  0.008,  airbox: 0.92, fin: 0, mirror: 2, inlet: -0.028 }),
    redbull:     Object.freeze({ noseTipZ:  0.06, noseSlim: 0.88, noseDroop: -0.012,  airbox: 1.06, fin: 2, mirror: 0, inlet:  0 }),
    alpine:      Object.freeze({ noseTipZ:  0,    noseSlim: 1.10, noseDroop:  0,      airbox: 1.00, fin: 1, mirror: 1, inlet:  0.014 }),
    racingbulls: Object.freeze({ noseTipZ:  0.04, noseSlim: 0.95, noseDroop:  0,      airbox: 1.08, fin: 2, mirror: 0, inlet: -0.010 }),
    haas:        Object.freeze({ noseTipZ: -0.10, noseSlim: 1.14, noseDroop:  0.006,  airbox: 0.98, fin: 0, mirror: 0, inlet:  0.028 }),
    williams:    Object.freeze({ noseTipZ:  0.10, noseSlim: 0.82, noseDroop: -0.006,  airbox: 0.90, fin: 1, mirror: 1, inlet: -0.020 }),
    audi:        Object.freeze({ noseTipZ: -0.05, noseSlim: 1.08, noseDroop:  0,      airbox: 1.12, fin: 1, mirror: 2, inlet:  0.020 }),
    astonmartin: Object.freeze({ noseTipZ:  0.05, noseSlim: 0.96, noseDroop: -0.030,  airbox: 0.96, fin: 2, mirror: 1, inlet: -0.014 }),
    cadillac:    Object.freeze({ noseTipZ: -0.08, noseSlim: 1.18, noseDroop:  0.010,  airbox: 1.10, fin: 1, mirror: 2, inlet:  0.034 }),
  });
  function teamStyleOf(teamId) {
    return (teamId && TEAM_STYLE[teamId]) || DEFAULT_STYLE;
  }
  // Nose stations adjusted for a team style. The TIP takes the full effect; the
  // MID station blends 40% of the slim/droop so the taper stays continuous into
  // the fixed bulkhead station. Returns plain copies — CHASSIS stays frozen.
  function styledNoseStations(style) {
    const s = style || DEFAULT_STYLE;
    if (s === DEFAULT_STYLE || (!s.noseTipZ && s.noseSlim === 1 && !s.noseDroop)) return CHASSIS.nose;
    const tip = CHASSIS.nose[0], mid = CHASSIS.nose[1];
    return [
      { z: tip.z + s.noseTipZ, y: tip.y + s.noseDroop,
        w: tip.w * s.noseSlim, h: tip.h * s.noseSlim, t: tip.t },
      { z: mid.z, y: mid.y + s.noseDroop * 0.4,
        w: mid.w * (1 + (s.noseSlim - 1) * 0.4), h: mid.h, t: mid.t },
      CHASSIS.nose[2],
    ];
  }

  function surfaceOf(col, surface) {
    if (surface != null) return surface;
    if (col === CARBON || col === DARK || col === INTAKE) return SURFACES.carbon;
    if (col === TYRE) return SURFACES.rubber;
    if (col === RIM || col === HUB || col === HALO) return SURFACES.metal;
    if (col === VISOR) return SURFACES.glass;
    if (col === PANEL) return SURFACES.panel;
    return SURFACES.paint;
  }

  function addTri(out, a, b, c, col, surface) {
    const ux = b[0]-a[0], uy = b[1]-a[1], uz = b[2]-a[2];
    const vx = c[0]-a[0], vy = c[1]-a[1], vz = c[2]-a[2];
    let nx = uy*vz - uz*vy, ny = uz*vx - ux*vz, nz = ux*vy - uy*vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    const base = out.pos.length / 3;
    const material = surfaceOf(col, surface);
    // Paint is reflective, not a light source. Some team accent palettes are
    // intentionally HDR for LEDs; cap them when those colors dress bodywork so
    // wings and panels do not bloom like neon tubes.
    const rgb = material === SURFACES.paint
      ? [Math.min(col[0], 1), Math.min(col[1], 1), Math.min(col[2], 1)]
      : col;
    for (const p of [a, b, c]) {
      out.pos.push(p[0], p[1], p[2]);
      out.nrm.push(nx, ny, nz);
      out.col.push(rgb[0], rgb[1], rgb[2]);
      out.mat.push(material);
    }
    out.idx.push(base, base + 1, base + 2);
  }

  function addQuad(out, a, b, c, d, col, surface) {
    addTri(out, a, b, c, col, surface);
    addTri(out, a, c, d, col, surface);
  }

  function addLoft(out, z0, x0, y0, w0, h0, z1, x1, y1, w1, h1, col, surface) {
    const b00 = [x0-w0/2, y0-h0/2, z0], b10 = [x0+w0/2, y0-h0/2, z0];
    const b11 = [x0+w0/2, y0+h0/2, z0], b01 = [x0-w0/2, y0+h0/2, z0];
    const f00 = [x1-w1/2, y1-h1/2, z1], f10 = [x1+w1/2, y1-h1/2, z1];
    const f11 = [x1+w1/2, y1+h1/2, z1], f01 = [x1-w1/2, y1+h1/2, z1];
    addQuad(out, f00, f10, f11, f01, col, surface); // front face (+Z)
    addQuad(out, b10, b00, b01, b11, col, surface); // back face  (-Z)
    addQuad(out, b01, f01, f11, b11, col, surface); // top        (+Y)
    addQuad(out, b00, b10, f10, f00, col, surface); // bottom     (-Y)
    addQuad(out, b10, b11, f11, f10, col, surface); // right      (+X)
    addQuad(out, b00, f00, f01, b01, col, surface); // left       (-X)
  }

  function addBox(out, cx, cy, cz, sx, sy, sz, col, surface) {
    addLoft(out, cz-sz/2, cx, cy, sx, sy, cz+sz/2, cx, cy, sx, sy, col, surface);
  }

  // ── Hexahedron block ────────────────────────────────────────────────────────
  // The car is HAND-MODELLED from chiseled blocks: each functional mass (nose
  // wedge, monocoque slab, engine-cover prism, sidepod slab) is one 8-corner
  // hexahedron with arbitrary corner positions — tapered wedges, undercuts and
  // pinched ridges all come out of one primitive, every face flat-shaded.
  // Corners: [FBL, FBR, FTR, FTL, RBL, RBR, RTR, RTL]  (F = +Z front, B/T =
  // bottom/top, L/R = -x/+x). Degenerate corners (two at the same point) give
  // wedges and prisms.
  function addBlock(out, q, col, colFront, surface, frontSurface, capFront, capRear) {
    // Mirrored call sites (x → s*x for the left-hand copy of a part) reverse
    // the corner winding, which inverts every face normal: the part then lights
    // as an away-facing surface (flat grey, no sun) and back-face culling makes
    // it SEE-THROUGH in race. Detect the flipped handedness — front-face normal
    // pointing toward the rear frame — and re-wind so both sides shade alike.
    {
      const ax = q[1][0]-q[0][0], ay = q[1][1]-q[0][1], az = q[1][2]-q[0][2];
      const bx = q[3][0]-q[0][0], by = q[3][1]-q[0][1], bz = q[3][2]-q[0][2];
      const nx = ay*bz - az*by, ny = az*bx - ax*bz, nz = ax*by - ay*bx;
      const dx = q[4][0]-q[0][0], dy = q[4][1]-q[0][1], dz = q[4][2]-q[0][2];
      if (nx*dx + ny*dy + nz*dz > 0) q = [q[1], q[0], q[3], q[2], q[5], q[4], q[7], q[6]];
    }
    if (capFront !== false)
      addQuad(out, q[0], q[1], q[2], q[3], colFront || col, frontSurface != null ? frontSurface : surface);  // front (+Z)
    if (capRear !== false)
      addQuad(out, q[5], q[4], q[7], q[6], col, surface);              // rear  (−Z)
    addQuad(out, q[3], q[2], q[6], q[7], col, surface);              // top   (+Y)
    addQuad(out, q[1], q[0], q[4], q[5], col, surface);              // bottom(−Y)
    addQuad(out, q[1], q[5], q[6], q[2], col, surface);              // right (+X)
    addQuad(out, q[0], q[3], q[7], q[4], col, surface);              // left  (−X)
  }
  // Convenience: block from two rectangular end frames {z, x?, y, w, h, t?}
  // where t narrows the TOP edge (t=0 → roof ridge / wedge).
  function frame(f) {
    const w2 = f.w / 2, tw = (f.t !== undefined ? f.t : 1) * w2, x = f.x || 0;
    return [
      [x - w2, f.y - f.h / 2, f.z], [x + w2, f.y - f.h / 2, f.z],
      [x + tw, f.y + f.h / 2, f.z], [x - tw, f.y + f.h / 2, f.z],
    ];
  }
  function addSpan(out, front, rear, col, colFront, surface, frontSurface) {
    const F = frame(front), R = frame(rear);
    addBlock(out, [F[0], F[1], F[2], F[3], R[0], R[1], R[2], R[3]], col, colFront, surface, frontSurface);
  }
  // ── Wing element section ────────────────────────────────────────────────────
  // Chordwise stations from leading to trailing edge, PACKED TOWARD THE LEADING
  // EDGE: an aerofoil's whole shape happens in its first third, and evenly
  // spaced stations spend their budget on the flat rear half while leaving the
  // nose a visible chamfer instead of a curve.
  const FOIL_T = [0, 0.08, 0.28, 0.60, 1];
  // Half-thickness distribution, normalised to peak at 1. t^0.5 gives the
  // square-root nose growth that reads ROUND at four stations; (1-t)^1.1 runs
  // out to a genuinely sharp trailing edge. Thickness reaching zero at both ends
  // is also what closes the section without needing cap geometry.
  const FOIL_PEAK = Math.pow(0.5 / 1.6, 0.5) * Math.pow(1 - 0.5 / 1.6, 1.1);
  const foilThick = (t) => Math.pow(t, 0.5) * Math.pow(1 - t, 1.1) / FOIL_PEAK;
  // Camber as a fraction of chord. F1 wings are INVERTED, so the mean line bows
  // DOWN off the chord line and the suction side is the underside.
  const FOIL_CAMBER = 0.05;
  // Wing element split into centre + outboard thirds so sweep, taper and tip
  // rise alter the actual planform rather than only stacking more rectangles.
  //
  // Each element is a CLOSED, CAMBERED SECTION — blunt leading edge, real
  // underside, sharp trailing edge. It used to be a single double-sided quad per
  // third: six triangles for a whole wing element, with `thick` doing nothing but
  // offsetting that sheet upward. That is fine head-on and falls apart the moment
  // anything looks along the span or watches an element rotate, which is exactly
  // what ACTIVE AERO made it do — a plank pivoting in mid-air. The section costs
  // 48 triangles instead of 6 and the whole car is still ~2.2k against a 2.4k
  // ceiling, so it is bought with headroom that already existed.
  function addWingFoil(out, spec, col, surface) {
    const half = spec.half, inner = half * 0.34;
    const sweep = spec.sweep || 0, taper = spec.taper == null ? 1 : spec.taper;
    const rise = spec.rise || 0, thick = spec.thick;
    const dz = spec.zLead - spec.zTrail, dy = spec.yTrail - spec.yLead;
    const chord = Math.hypot(dz, dy);
    const camber = (spec.camber == null ? FOIL_CAMBER : spec.camber) * chord;
    // Position + half-thickness at spanwise x, chordwise fraction t.
    const at = (x, t) => {
      const edge = Math.max(0, (Math.abs(x) - inner) / Math.max(half - inner, 1e-6));
      const atTip = Math.abs(Math.abs(x) - half) < 1e-6;
      const attachedX = atTip && spec.attachHalf != null
        ? Math.sign(x || 1) * spec.attachHalf
        : null;
      const xF = attachedX != null ? attachedX : x;
      const xR = attachedX != null ? attachedX : x * taper;
      const yF = spec.yLead + rise * edge, yR = spec.yTrail + rise * edge;
      const zF = spec.zLead - sweep * edge, zR = spec.zTrail - sweep * edge;
      return {
        x: xF + (xR - xF) * t,
        y: yF + (yR - yF) * t - camber * 4 * t * (1 - t),
        z: zF + (zR - zF) * t,
        h: thick * 0.5 * foilThick(t),
      };
    };
    const segments = [[-half, -inner], [-inner, inner], [inner, half]];
    for (const [x0, x1] of segments) {
      for (let i = 0; i < FOIL_T.length - 1; i++) {
        const t0 = FOIL_T[i], t1 = FOIL_T[i + 1];
        const a0 = at(x0, t0), b0 = at(x1, t0), b1 = at(x1, t1), a1 = at(x0, t1);
        const up = (p) => [p.x, p.y + p.h, p.z], dn = (p) => [p.x, p.y - p.h, p.z];
        // Upper surface wound so the normal points +Y, lower reversed.
        addQuad(out, up(a0), up(b0), up(b1), up(a1), col, surface);
        addQuad(out, dn(a0), dn(a1), dn(b1), dn(b0), col, surface);
      }
    }
  }
  // Join a short chain of arbitrary four-corner stations. This keeps low-poly
  // bodywork readable while allowing the sidepod floor and shoulder to follow
  // different curves (a rectangular loft cannot express a real undercut).
  function addStationLoft(out, stations, col, frontCol, surface, frontSurface) {
    for (let i = 0; i < stations.length - 1; i++) {
      addBlock(out, stations[i].concat(stations[i + 1]), col,
               i === 0 ? frontCol : null, surface,
               i === 0 ? frontSurface : null,
               i === 0, i === stations.length - 2);
    }
  }
  // Chamfer the two TOP longitudinal edges of a span with proud 45° strips. A
  // sharp 90° edge either flashes a razor-thin aliased highlight or nothing; a
  // 45° facet between the top and side faces catches a clean running specular
  // line exactly when neither neighbour does — the "expensive-looking car" cue.
  // The strip sits fractionally proud along its own normal so it never z-fights
  // the flat faces behind it. b in metres (chamfer width).
  function addTopBevel(out, front, rear, b, col, surface) {
    const F = frame(front), R = frame(rear);
    // corners [2]=top-right (x+tw), [3]=top-left (x-tw); both at y+h/2.
    for (const side of [1, -1]) {
      // top corner index: right edge uses [2]/[2], left uses [3]/[3].
      const ti = side > 0 ? 2 : 3;
      const fc = F[ti], rc = R[ti];
      const proud = 0.0006 * side;   // nudge outward in x so the crease wins depth
      // top-face inset point (move inward in x by b) and side-face inset point
      // (move down in y by b), for both the front and rear frame.
      const ft = [fc[0] - side * b + proud, fc[1], fc[2]];
      const fs = [fc[0] + proud, fc[1] - b, fc[2]];
      const rt = [rc[0] - side * b + proud, rc[1], rc[2]];
      const rs = [rc[0] + proud, rc[1] - b, rc[2]];
      // Wind so the facet normal points up-and-out (toward +y, ±x).
      if (side > 0) addQuad(out, fs, rs, rt, ft, col, surface);
      else          addQuad(out, ft, rt, rs, fs, col, surface);
    }
  }

  function addBeamBetween(out, p0, p1, th, col, surface) {
    let dx = p1[0]-p0[0], dy = p1[1]-p0[1], dz = p1[2]-p0[2];
    const len = Math.hypot(dx, dy, dz) || 1; dx /= len; dy /= len; dz /= len;
    let ux = -dz, uy = 0, uz = dx;
    let ul = Math.hypot(ux, uy, uz);
    if (ul < 1e-5) { ux = 1; uy = 0; uz = 0; ul = 1; }
    ux = ux / ul * th * 0.5; uy = uy / ul * th * 0.5; uz = uz / ul * th * 0.5;
    const vx = (dy*uz-dz*uy) * th * 0.5;
    const vy = (dz*ux-dx*uz) * th * 0.5;
    const vz = (dx*uy-dy*ux) * th * 0.5;
    const station = (p) => [
      [p[0]-ux-vx,p[1]-uy-vy,p[2]-uz-vz], [p[0]+ux-vx,p[1]+uy-vy,p[2]+uz-vz],
      [p[0]+ux+vx,p[1]+uy+vy,p[2]+uz+vz], [p[0]-ux+vx,p[1]-uy+vy,p[2]-uz+vz],
    ];
    addBlock(out, station(p0).concat(station(p1)), col, null, surface);
  }

  // Smooth dome (helmet): partial lat-long sphere, analytic normals.
  function addDome(out, cx, cy, cz, r, col, surface) {
    const STACKS = 5, SLICES = 12;
    const i0 = out.pos.length / 3;
    const material = surfaceOf(col, surface);
    const rgb = material === SURFACES.paint
      ? [Math.min(col[0], 1), Math.min(col[1], 1), Math.min(col[2], 1)]
      : col;
    for (let st = 0; st <= STACKS; st++) {
      const phi = (st / STACKS) * (Math.PI / 2);   // 0 = top, π/2 = equator
      const y = Math.cos(phi), rr = Math.sin(phi);
      for (let sl = 0; sl < SLICES; sl++) {
        const a = (sl / SLICES) * Math.PI * 2;
        const nx = rr * Math.cos(a), nz = rr * Math.sin(a);
        out.pos.push(cx + nx * r, cy + y * r, cz + nz * r);
        out.nrm.push(nx, y, nz);
        out.col.push(rgb[0], rgb[1], rgb[2]);
        out.mat.push(material);
      }
    }
    for (let st = 0; st < STACKS; st++) {
      for (let sl = 0; sl < SLICES; sl++) {
        const sl2 = (sl + 1) % SLICES;
        const a = i0 + st * SLICES + sl,       b = i0 + st * SLICES + sl2;
        const c = i0 + (st + 1) * SLICES + sl2, d = i0 + (st + 1) * SLICES + sl;
        out.idx.push(a, b, c, a, c, d);
      }
    }
  }

  // Wheel: smooth-shaded tyre tread (shared ring verts, radial normals) + flat
  // 2026-style cover disc + hub on both faces.
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
    const rotorOuter = r * Math.min(0.40, 0.32 * rotorScale);
    const rotorInner = r * 0.17;
    for (const face of [[x0 + 0.008, -1], [x1 - 0.008, 1]]) {
      for (let i = 0; i < SEG; i++) {
        const a0 = i / SEG * Math.PI * 2, a1 = (i + 1) / SEG * Math.PI * 2;
        const P = (rad, a) => [face[0], cy + rad*Math.cos(a), cz + rad*Math.sin(a)];
        addQuad(out, P(rotorOuter,a0), P(rotorOuter,a1), P(rotorInner,a1), P(rotorInner,a0),
          [0.24,0.24,0.26], SURFACES.metal);
      }
      const rotorDetail = brakeStyle && brakeStyle.rotor || 0;
      for (let i = 0; i < rotorDetail * 3; i++) {
        const a = i / (rotorDetail * 3) * Math.PI * 2, rr = (rotorInner + rotorOuter) * 0.5;
        addBox(out, face[0], cy + rr*Math.cos(a), cz + rr*Math.sin(a),
          0.012, 0.018, 0.018, [0.07,0.07,0.08], SURFACES.carbon);
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
    if (caliperColor) {
      const calOut = fixedOut || out;
      const cr = r * 0.78;                     // top edge, just inside the tread band
      const calA = brakeStyle && brakeStyle.caliperPos || 0;
      const padCol = [caliperColor[0]*0.30, caliperColor[1]*0.30, caliperColor[2]*0.30];
      for (let i = 0; i < 3; i++) {
        const a = calA + (i - 1) * 0.17;       // ~±10° arc around selected clock position
        addBox(calOut, cx, cy + Math.cos(a) * cr, cz + Math.sin(a) * cr,
               w * 1.06, 0.052, 0.055, caliperColor, SURFACES.metal);   // spans the width, proud past both faces
      }
      // pad plates hugging each disc face + the machined bridge over the crown
      for (const sgn of [-1, 1])
        addBox(calOut, cx + sgn * (w * 0.52 + 0.006), cy + cr, cz, 0.02, 0.05, 0.11, padCol, SURFACES.metal);
      addBox(calOut, cx, cy + cr + 0.04, cz, w * 1.0, 0.02, 0.10, caliperColor, SURFACES.metal);   // bridge rib
    }
  }

  // A single wheel centred on the origin, axle along X — so the render layer can
  // spin it about X (∝ speed) and steer the fronts about Y, then translate it to
  // each corner. Used only for the player car (AI keep the baked static wheels).
  function buildWheel(w, bandColor, caliperColor, rimColor, grooved, tyreStyle, brakeStyle, wheelStyle) {
    const out = { pos: [], nrm: [], col: [], mat: [], idx: [] };
    addWheel(out, 0, 0, 0, 0.34, w || 0.34, bandColor, caliperColor, rimColor,
      grooved, tyreStyle, null, brakeStyle, wheelStyle);
    return out;
  }
  function buildWheelLayers(w, bandColor, caliperColor, rimColor, grooved, tyreStyle, brakeStyle, wheelStyle) {
    const rotating = { pos: [], nrm: [], col: [], mat: [], idx: [] };
    const fixed = { pos: [], nrm: [], col: [], mat: [], idx: [] };
    const width = w || 0.34;
    addWheel(rotating, 0, 0, 0, 0.34, width, bandColor, caliperColor, rimColor,
      grooved, tyreStyle, fixed, brakeStyle, wheelStyle);
    // Upright and hub carrier give the wishbones/caliper a visible termination.
    addBox(fixed, 0, 0, 0, width * 0.72, 0.12, 0.12, [0.18, 0.18, 0.20], SURFACES.metal);
    return { rotating, fixed };
  }

  // Cosmetic tint tables for the TYRES/BRAKES visual tells — tier 1 always
  // matches today's hardcoded literals so an unmodified car is byte-identical.
  const TYRE_BAND     = { 0: [0.92, 0.92, 0.90], 1: [0.85, 0.10, 0.08], 2: [0.95, 0.15, 0.05] };
  const BRAKE_CALIPER = { 0: null, 1: null, 2: [0.75, 0.08, 0.05] };
  // Rear-wing endplate geometry as a function of downforce level (0..4). SINGLE
  // SOURCE OF TRUTH — the wing build below AND the driver-number decal in game.js
  // (via Car3D.endplate / Car3D.numberBoard) both read this, so the endplate
  // number tracks the plate at every downforce setting instead of a fixed height
  // that only fits one wing. Concave (pow 0.7) growth: rises fast at low DF then
  // flattens so max-DF doesn't tower. cy = vertical centre, sy = full height.
  function endplateGeom(aLvl) {
    const aN = (aLvl || 0) / 4;
    const cy = 0.60 + 0.20 * Math.pow(aN, 0.7);
    const sy = 0.28 + 0.30 * Math.pow(aN, 0.7);
    const profile = (z, sectionCy, sectionSy) => ({
      z, cy: sectionCy, sy: sectionSy,
      bottom: sectionCy - sectionSy * 0.5,
      top: sectionCy + sectionSy * 0.5,
    });
    return {
      cy, sy, chord: 0.54,
      front: profile(-2.15, cy - 0.035, sy * 0.76),
      rear: profile(-2.69, cy + 0.015, sy),
    };
  }
  // ACTIVE AERO — the wing's OWN top elements, made moveable.
  //
  // These are NOT extra parts laid over the wing (the first cut of this was, and
  // it looked exactly like what it was: a bolt-on). The top FW_MOVEABLE flaps of
  // the front cascade and the top plane of the rear wing are LEFT OUT of the
  // baked car mesh entirely and drawn instead as separate meshes that rotate —
  // so the car at rest is geometrically identical to before, and X-mode rotates
  // the real elements flat.
  //
  // Each spec is canonical: hinge at the ORIGIN with the chord running back
  // along -z at zero incidence. `zAngle` is the element's own natural incidence
  // (so drawing at zAngle reproduces the baked pose exactly) and `xAngle` is 0 —
  // "open" means aligned with the airflow, not merely less steep.
  const FW_MOVEABLE = 2;
  const AERO_STYLE_DEF = { frontSweep: 0.04, frontTaper: 0.98, frontRise: 0.04,
                           rearSweep: 0.03, rearTaper: 0.98 };
  // The front cascade table — the SINGLE definition, consumed both by the build
  // (for the elements it still bakes) and by aeroFlapsGeom (for the ones it
  // does not). [zLead, yLead, zTrail, yTrail, chordWMul, thick].
  // NB aLvl is NOT an integer — several catalog options use fractional levels
  // (1.15, 3.25, 3.6 …) and the wing build compares them raw. Truncating here
  // silently gave those options a different endplate height and half-span than
  // the mesh they were merged into.
  function frontCascade(aLvl) {
    const a = aLvl;
    const els = [
      [2.72, 0.048, 2.40, 0.086, 1.00, 0.032],   // main plane (structure, never moves)
      [2.50, 0.092, 2.24, 0.146, 0.98, 0.028],   // flap 1
    ];
    if (a >= 1) els.push([2.34, 0.148, 2.10, 0.212, 0.95, 0.026]);   // flap 2
    // Flaps 3 and 4 sit 10 mm and 30 mm lower than they first shipped. The stack
    // was drawn climbing into the nose overhang: at maximum downforce the top
    // element passed ~21 mm THROUGH the nose underside, which no rotation can
    // undo because the intersection is at the element's own rest attitude. The
    // drop is the largest the slot gaps above them will take (flap 3 keeps 11 mm
    // of daylight to flap 2, which is a slot, not a coincidence).
    if (a >= 3) els.push([2.20, 0.200, 1.98, 0.272, 0.92, 0.024]);   // flap 3
    if (a >= 4) els.push([2.08, 0.256, 1.88, 0.328, 0.88, 0.022]);   // flap 4
    return els;
  }
  // How many of them the mesh still bakes. Never the main plane.
  function frontBakedCount(aLvl) {
    const n = frontCascade(aLvl).length;
    return n - Math.min(FW_MOVEABLE, n - 1);
  }
  function frontHalf(aLvl) {
    // Same comparisons the build uses, on the RAW level: `aLvl === 1` is false
    // for 1.15, which is exactly the distinction a truncation destroys.
    return 0.92 * (aLvl <= 0 ? 0.74 : (aLvl === 1 ? 0.88 : 1.0));
  }
  // Extra incidence the CLOSED (Z-mode) pose takes on top of the element's own
  // baked angle. Without it the travel is only the element's natural 12-16 deg,
  // which is accurate but barely reads; with it a downforce wing is visibly
  // steeper AND has real angle to give back when it opens.
  //
  // Per wing, because the two do not do the same job. A 2026 rear wing runs
  // 30-40 deg of flap in its downforce setting and gives essentially all of it
  // back in X-mode — that is where the lap time is. The front wing only trims
  // enough to keep the balance, and is boxed in by the nose above it besides.
  //
  // The front is ZERO, and that is a fix rather than a shrug. A front cascade is
  // designed to nest: each element's trailing edge passes ~12 mm under the
  // leading edge of the one above it. Adding bite rotates every element steeper
  // about a hinge near its nose, which swings that trailing edge UP — straight
  // through its neighbour. Measured at maximum downforce, the shipped 0.20
  // buried flap 2's trailing edge 15 mm inside flap 3. The cascade's own drawn
  // attitude already IS the downforce pose; the front's travel comes from
  // flattening it, not from over-rotating it first.
  const Z_BITE = { front: 0, rear: 0.34 };
  // Where each element pivots, as a fraction of its own chord: 0 = leading edge,
  // 1 = trailing edge.
  //
  // This is the thing that makes an opening wing read as opening. Rotating about
  // the LEADING edge (which is what this did) changes incidence but leaves the
  // hinge line — the point nearest the element ahead — exactly where it was, so
  // the SLOT never opens and the whole gesture reads as a plank tilting. A real
  // DRS/X-mode flap pivots near its TRAILING edge: the leading edge swings up and
  // away from the element in front of it and daylight appears through the wing,
  // which is both the mechanism and the visual.
  //
  // The rear goes almost fully trailing-edge-pivoted, as the real actuator does.
  // The front stays near its LEADING edge, which is both what the real hardware
  // does (a front flap pivots on the slot-gap brackets at its nose, not on an
  // endplate actuator) and what the packaging allows: the cascade elements are
  // stacked ~12 mm apart and live under the nose overhang, so a leading edge
  // that swings has nowhere to swing to — it clashes with the element in front
  // of it going one way and the bodywork going the other. The front's opening
  // therefore reads mostly as the trailing edge dropping, which is correct.
  const HINGE = { front: 0.80, rear: 0.86 };
  // How much of its own incidence each wing gives up in X-mode. The rear goes to
  // flat, which is what a 2026 rear wing does and where the straight-line gain
  // comes from. The front only TRIMS: a front wing that flattened would both
  // throw the balance to the rear and, at maximum downforce, have to swing its
  // top flap up through the nose overhang to get there. Trimming is the real
  // behaviour and it is also the one that fits in the space available.
  const OPEN_FRAC = { front: 1, rear: 1 };
  // Underside of the NOSE where it overhangs the front wing, as (z, y) samples
  // measured off the built body. This is a hard ceiling: at max downforce the
  // baked top flap already passes within ~12 mm of it, so an unconditional bite
  // swings that element straight through the nose. Outside this z band nothing
  // overhangs the wing, hence the Infinity guards.
  const NOSE_UNDER = [[1.96, Infinity], [2.00, 0.294], [2.10, 0.414], [2.16, Infinity]];
  const NOSE_GAP = 0.005;        // m of daylight to keep under it
  function noseUnderAt(z) {
    if (z <= NOSE_UNDER[0][0] || z >= NOSE_UNDER[NOSE_UNDER.length - 1][0]) return Infinity;
    for (let i = 1; i < NOSE_UNDER.length; i++) {
      const [z1, y1] = NOSE_UNDER[i], [z0, y0] = NOSE_UNDER[i - 1];
      if (z <= z1) {
        // An Infinity endpoint means "nothing overhangs the wing out here", so a
        // slice touching one is UNCONSTRAINED — not pinned to whatever its finite
        // neighbour happened to measure. Pinning it (which is what this did)
        // invents a 0.294 m ceiling across z 1.96-2.00, and that phantom ceiling
        // is low enough that the top cascade flap at maximum downforce has no
        // valid attitude at all: every pose the solver tries "fails", so it falls
        // back to an unclamped one and the flap ends up drawn through the nose.
        if (!isFinite(y0) || !isFinite(y1)) return Infinity;
        return y0 + (y1 - y0) * (z - z0) / (z1 - z0);
      }
    }
    return Infinity;
  }
  // A hinged wing element. The mesh is emitted by the SAME addWingFoil call
  // the baked wing used, merely translated so the PIVOT is at the origin — so
  // the angles here are DELTAS from the element's own baked
  // incidence, not absolute attitudes. That matters: at delta 0 the element is
  // byte-for-byte the one the mesh used to contain. Building it flat and
  // rotating instead (the first attempt) displaced every vertex by up to 172 mm,
  // because addWingFoil's rise/sweep/thickness terms are applied in the CAR
  // frame and a whole-element rotation drags them off-axis with it.
  //
  // zAngle is the extra bite the closed pose takes on, CLAMPED per element to
  // that element's own headroom under the nose, so a closed wing is as steep as
  // it can be without any part of it entering the bodywork. xAngle is -natural:
  // rotating back by exactly the baked incidence lands the element FLAT.
  // A point on a wing element's section at chordwise t and pose delta d, in
  // car-local (z, y). `e` is the compact record below, shared by baked and
  // moveable elements so the clearance maths does not care which is which.
  function elemPoint(e, d, t) {
    const ang = e.natural + d, c = Math.cos(ang), s = Math.sin(ang);
    const u = (t - e.hinge) * e.chord;
    const mid = e.py + u * s - FOIL_CAMBER * e.chord * 4 * t * (1 - t);
    const h = e.thick * 0.5 * foilThick(t);
    return { z: e.pz - u * c, top: mid + h, bot: mid - h };
  }
  function elemRecord(le, te, thick, hinge) {
    const chord = Math.hypot(le[0] - te[0], te[1] - le[1]);
    return {
      chord, thick, hinge,
      natural: Math.atan2(te[1] - le[1], le[0] - te[0]),
      pz: le[0] + (te[0] - le[0]) * hinge,
      py: le[1] + (te[1] - le[1]) * hinge,
    };
  }
  // Upper surface height of element `e` at car-local z when posed at delta `d`,
  // or null if it does not reach that far along the car.
  function elemTopAt(e, d, z) {
    const N = 32;
    let prev = elemPoint(e, d, 0);
    for (let k = 1; k <= N; k++) {
      const cur = elemPoint(e, d, k / N);
      if ((z <= prev.z && z >= cur.z) || (z >= prev.z && z <= cur.z)) {
        const f = (z - prev.z) / ((cur.z - prev.z) || 1e-9);
        return prev.top + (cur.top - prev.top) * f;
      }
      prev = cur;
    }
    return null;
  }
  const SLOT_MIN = 0.003;   // m of daylight to keep in a cascade slot
  function hinged(id, wing, zLead, yLead, zTrail, yTrail, planform, prev) {
    const dz = zLead - zTrail, dy = yTrail - yLead;
    const chord = Math.sqrt(dz * dz + dy * dy);
    const natural = Math.atan2(dy, dz);
    const thick = planform ? planform.thick : 0;
    const want = planform && planform.hinge != null ? planform.hinge : HINGE[wing];
    // The hinge is SEARCHED, not asserted. A pivot far back gives the most
    // leading-edge swing — the thing that actually opens a slot — but it also
    // drags the element's whole rear half up toward the nose when it flattens,
    // and on the top cascade flap at maximum downforce the pivot itself ends up
    // above the nose underside, so NO angle clears. Walking the pivot forward
    // trades swing for headroom. Trying the candidates and keeping whichever
    // yields the most usable travel beats picking one number and discovering per
    // downforce level which elements it happens to lock solid.
    let hinge = want, pz = 0, py = 0, best = -1;
    for (let h = want; h >= 0.14; h -= 0.02) {
      const r = solvePoses(h);
      if (!r) continue;
      const travel = r.bite - r.open;
      if (travel > best + 1e-6) { best = travel; hinge = h; pz = r.pz; py = r.py; }
    }
    if (best < 0) {   // nothing clears anywhere — keep the requested pivot
      pz = zLead + (zTrail - zLead) * want; py = yLead + (yTrail - yLead) * want;
      hinge = want;
    }
    const solved = solvePoses(hinge);
    return Object.assign({
      id, wing,
      z: pz, y: py,              // PIVOT, in car-local metres — what the draw hangs it at
      le: [zLead, yLead], te: [zTrail, yTrail],   // what buildFlapGeom emits
      chord, natural, hinge,
      zAngle: solved ? solved.bite : 0,
      xAngle: solved ? solved.open : -natural,
    }, planform);

    // Solve the two end poses for a candidate pivot, or null if either end
    // cannot be placed without entering the nose or the element below.
    function solvePoses(h) {
      const qz = zLead + (zTrail - zLead) * h, qy = yLead + (yTrail - yLead) * h;
      const self = { chord, thick, hinge: h, natural, pz: qz, py: qy };
      // Two things a front element must not enter: the nose overhang above it,
      // and the element it nests over. Sampled far more finely than the mesh's
      // own stations — the nose underside ramp and the element cross at a point
      // with no reason to coincide with a vertex, and testing only FOIL_T steps
      // straight over it, which is how a 21 mm intersection at maximum
      // downforce passed a check that was "already sampling the section".
      // The neighbour matters at the OPEN end: a cascade is stacked with ~12 mm
      // slots, and rotating one element flat drops its forward half through the
      // trailing edge of the one ahead. It is posed at ITS pose for the same end
      // of the travel, since every element is driven off the one blend.
      const CLEAR_N = 40;
      // Applies to BOTH wings. noseUnderAt() is Infinity everywhere behind the
      // nose, so the rear simply never trips that half of the test — there is no
      // need for the wing to exempt itself, and exempting it was what left the
      // rear stack unchecked.
      const clears = (d, prevDelta) => {
        for (let k = 0; k <= CLEAR_N; k++) {
          const p = elemPoint(self, d, k / CLEAR_N);
          const ceil = noseUnderAt(p.z);
          if (isFinite(ceil) && p.top > ceil - NOSE_GAP) return false;
          if (prev) {
            const below = elemTopAt(prev, prevDelta, p.z);
            if (below != null && p.bot < below + SLOT_MIN) return false;
          }
        }
        return true;
      };
      // Back each end off in small steps until it fits. The closed search runs
      // PAST zero: clamping there quietly asserts that the element's own baked
      // attitude must be safe, which at maximum downforce it is not. Returning
      // null when an end cannot be placed at all is what lets the hinge search
      // above reject this pivot instead of shipping an intersection.
      const relax = (from, dir, prevDelta) => {
        for (let i = 0; i <= 120; i++) {
          const a = from + dir * 0.01 * i;
          if (clears(a, prevDelta)) return a;
        }
        return null;
      };
      const bite = relax(Z_BITE[wing], -1, prev ? prev.zAngle : 0);
      if (bite == null) return null;
      const open = relax(-natural * OPEN_FRAC[wing], +1, prev ? prev.xAngle : 0);
      // An element with a placeable closed pose but no placeable open one is
      // PARKED, not forced open: it holds its downforce attitude. Better one
      // flap that does not move than one drawn through the bodywork, and the
      // packaging that causes it is real — the top cascade flap at maximum
      // downforce genuinely has the nose 20 mm above it.
      return { bite, open: open == null ? bite : open, pz: qz, py: qy };
    }
  }
  // SOLVED ONCE PER (level, recipe), NEVER PER FRAME.
  //
  // aeroFlapsGeom is not a table lookup — hinged() SEARCHES for each element's
  // pivot: up to 9 candidate hinges, each solving two end poses, each backing
  // off in up to 121 steps, each step sampling 41 points against the nose
  // underside and the element below. That is per element, and a wing has five
  // to eight of them.
  //
  // drawAeroFlaps (js/game.js) calls this for EVERY CAR, EVERY FRAME, because a
  // rival's wings opening is the point of the feature. At one car — a time
  // trial — the solver is merely expensive. At twenty-two it is the frame, and
  // that is exactly how it presented: time trial fine, a race slow enough that
  // the resolution governor bottomed out and started shedding features, which
  // read as a broken renderer rather than a slow one.
  //
  // Nothing in the result depends on the car or on the blend: the records carry
  // both end poses (zAngle/xAngle) and drawAeroFlaps interpolates between them
  // at draw time. So the whole search is a pure function of (aLvl, recipe), and
  // memoising it is not an optimisation so much as fixing a category error.
  // Bounded by five levels times the handful of aero recipes in the catalog.
  //
  // Callers MUST treat the records as immutable — they are shared now.
  const _flapSpecs = new Map();
  // The six-field signature depends ONLY on the recipe object, and callers hand
  // the same memoised recipe every frame (game.js's teamDecalState caches it), so
  // resolve it once per object rather than rebuilding an array, a map closure and
  // a join on every lookup. aeroFlapsGeom is called per car per frame by
  // drawAeroFlaps, so that key build was pure churn.
  const _flapSig = new WeakMap();
  function flapSig(st0) {
    let sig = _flapSig.get(st0);
    if (sig === undefined) {
      // The same six fields the flap MESH cache keys on — the only ones the
      // planform and the rear slot height read.
      sig = [st0.frontSweep, st0.frontTaper, st0.frontRise,
             st0.rearSweep, st0.rearTaper, st0.drs || 0]
        .map((v) => +v || 0).join(",");
      _flapSig.set(st0, sig);
    }
    return sig;
  }
  function aeroFlapsGeom(aLvl, style) {
    const st0 = (style && typeof style === "object") ? style : AERO_STYLE_DEF;
    // RAW aLvl, not (aLvl | 0). Several catalog options use FRACTIONAL levels
    // (see frontCascade) and solveFlapsGeom below reads the exact value, so
    // truncating here made 2.2 and 2.8 share one cache slot: whichever solved
    // first served both, and the other option silently wore the wrong flaps.
    const key = aLvl + "|" + flapSig(st0);
    let hit = _flapSpecs.get(key);
    if (!hit) {
      hit = solveFlapsGeom(aLvl, st0);
      // Stamp each element with its resolved identity. js/game/carmesh.js keys its
      // GPU mesh cache on exactly (level, recipe, element index) and used to
      // recompute that signature itself, per flap per car per frame — four more
      // array-map-join builds on top of this one. Now it just reads the stamp.
      for (let i = 0; i < hit.length; i++) hit[i].cacheKey = key + "|" + i;
      _flapSpecs.set(key, hit);
    }
    return hit;
  }
  function solveFlapsGeom(aLvl, style) {
    // A style must be a RECIPE OBJECT (see aeroStyleOf). Anything else — most
    // dangerously the truthy tier NUMBER getVisualTiers stores under .aero —
    // would have .frontSweep read off it as undefined and clamped into NaN,
    // NaN-ing every vertex downstream. Refuse to let that class of misuse make
    // the wing invisible again.
    const a = aLvl, st = (style && typeof style === "object") ? style : AERO_STYLE_DEF;
    const frontSweep = Math.max(-0.08, Math.min(0.22, st.frontSweep));
    const frontTaper = Math.max(0.72, Math.min(1.08, st.frontTaper));
    const frontRise = Math.max(-0.03, Math.min(0.16, st.frontRise));
    const rearSweep = Math.max(-0.06, Math.min(0.20, st.rearSweep));
    const rearTaper = Math.max(0.72, Math.min(1.08, st.rearTaper));
    const els = frontCascade(a), baked = frontBakedCount(a), fwHalf = frontHalf(a);
    const out = [];
    // Solved in cascade order, each element handed the one it nests over: the
    // neighbour's own solved poses are what bound this one's travel, so the
    // chain has to be built bottom-up. A baked neighbour never moves, hence the
    // zero poses on its record.
    for (let i = baked; i < els.length; i++) {
      const e = els[i], p = els[i - 1];
      const prev = p
        ? Object.assign(elemRecord([p[0], p[1]], [p[2], p[3]], p[5], i - 1 < baked ? 0 : HINGE.front),
                        i - 1 < baked ? { zAngle: 0, xAngle: 0 }
                                      : { zAngle: out[out.length - 1].zAngle,
                                          xAngle: out[out.length - 1].xAngle })
        : null;
      out.push(hinged("front" + i, "front", e[0], e[1], e[2], e[3], {
        half: fwHalf * e[4], thick: e[5], taper: frontTaper,
        sweep: frontSweep * (0.75 + i * 0.10),
        rise: frontRise * (0.65 + i * 0.12),
        attachHalf: fwHalf + 0.03,
        // The bold outboard upsweep hangs off the TOP element's trailing edge.
        // That element is always one of the moveable ones, so the kick has to
        // travel WITH it — anchoring it to the top still-baked element instead
        // (an earlier attempt) silently moved it 172 mm on the car at rest.
        upsweep: i === els.length - 1 ? { fwHalf, e } : null,
      }, prev));
    }
    // Rear: the 2026 rule is that every element EXCEPT the bottom mainplane
    // rotates, so on a three-plane wing the top two move and the mainplane is
    // structure. Below aLvl 2 the wing only has two planes, so only the top one
    // moves — still "all but the mainplane".
    // The slot height depends on `drs` as well as the level — the build reserves
    // it with (aLvl >= 4 || aDrs), so dropping drs here would leave the plane
    // floating 75 mm off its own slot on every DRS-option car.
    const ep = endplateGeom(a), crownY = ep.rear.top - 0.018;
    const upperTrailY = crownY - ((a >= 4 || (st.drs || 0)) ? 0.075 : 0);
    // Chained the same way the front cascade is, and for the same reason: rear
    // planes are stacked in slots too, and nothing was checking them. With the
    // elements now sweeping 35 deg instead of a flat sheet tilting, an unchecked
    // stack is one that quietly passes through itself at some blend nobody looked
    // at. The mainplane below is structure, so it enters the chain at zero.
    const rearMain = Object.assign(
      elemRecord([-2.30, upperTrailY - 0.270], [-2.52, upperTrailY - 0.225], 0.032, 0),
      { zAngle: 0, xAngle: 0 });
    let below = rearMain;
    const addRear = (id, le, te, thick, sweepMul) => {
      const el = hinged(id, "rear", le[0], le[1], te[0], te[1], {
        half: id === "rearTop" ? 0.50 : 0.51, thick, taper: rearTaper,
        sweep: rearSweep * sweepMul, attachHalf: 0.50, rise: 0,
      }, below);
      out.push(el);
      below = Object.assign(elemRecord(le, te, thick, el.hinge),
                            { zAngle: el.zAngle, xAngle: el.xAngle });
    };
    if (a >= 2) {
      addRear("rearMid", [-2.34, upperTrailY - 0.170], [-2.56, upperTrailY - 0.115], 0.030, 0.9);
    }
    addRear("rear", [-2.38, upperTrailY - 0.075], [-2.64, upperTrailY], 0.035, 1);
    // The proud max-downforce top plane. It used to be BAKED, which put the
    // topmost element of the tallest wing on the grid among the parts that do
    // not move — directly contradicting the rule the rest of this function
    // implements, and leaving the one plane a following car actually sees frozen
    // while the two beneath it swept. It is an element like any other.
    if (a >= 4 && !(st.drs || 0)) {
      addRear("rearTop", [-2.42, crownY - 0.055], [-2.66, crownY], 0.030, 1.1);
    }
    return out;
  }
  // Geometry for ONE moveable element, in its canonical hinge frame. Built by
  // the SAME planform emitter the baked wing uses, so a flap drawn at its zAngle
  // is the element the mesh would otherwise have contained.
  function buildFlapGeom(el, col) {
    const out = { pos: [], nrm: [], col: [], mat: [], idx: [] };
    // The element exactly as the wing build emits it...
    addWingFoil(out, {
      zLead: el.le[0], yLead: el.le[1], zTrail: el.te[0], yTrail: el.te[1],
      half: el.half, thick: el.thick, taper: el.taper,
      sweep: el.sweep, rise: el.rise, attachHalf: el.attachHalf,
    }, col, SURFACES.paint);
    // ...plus, on the top element, the outboard upsweep that flicks off its
    // trailing edge into the endplate — same two spans the wing build used to
    // emit, so the flick travels with the flap rather than being left behind.
    if (el.upsweep) {
      const { fwHalf, e } = el.upsweep;
      for (const sgn of [-1, 1]) {
        addSpan(out, { z: e[2], x: sgn * (fwHalf * e[4] - 0.05), y: e[3], w: 0.16, h: e[5] * 1.5 },
                     { z: e[2] - 0.04, x: sgn * (fwHalf + 0.02), y: e[3] + 0.085, w: 0.09, h: e[5] * 1.6 }, col);
      }
    }
    // ...then moved so its PIVOT sits at the origin, which is all the draw needs
    // to rotate it in place. Nothing about the element's own shape is rebuilt —
    // the pivot is a point on the chord line, not a re-anchoring of the mesh.
    for (let i = 0; i < out.pos.length; i += 3) {
      out.pos[i + 1] -= el.y;
      out.pos[i + 2] -= el.z;
    }
    return out;
  }
  // Mid-chord of a wing's moveable section, car-local metres — what the GARAGE
  // wing views aim at. For the multi-element front it is the group midpoint.
  // Off the LEADING/TRAILING edges, not off the pivot: the pivot sits at a
  // different fraction of the chord per wing, so aiming at it would frame the
  // rear wing off its own trailing edge.
  function aeroFlapAim(aLvl, wing, style) {
    const els = aeroFlapsGeom(aLvl, style).filter((e) => e.wing === wing);
    let y = 0, z = 0;
    for (const e of els) {
      y += (e.le[1] + e.te[1]) * 0.5;
      z += (e.le[0] + e.te[0]) * 0.5;
    }
    return [0, y / els.length, z / els.length];
  }
  // The driver-number board on the endplate: a fixed-height board anchored LOW,
  // its bottom a small gap above the plate base. The plate base barely moves with
  // DF (~0.46 → 0.51) while the top shoots up, so a low anchor reads grounded on
  // the short low-DF plate and low-on-a-tall-plate for max DF — never floating.
  function numberBoard(aLvl) {
    const ep = endplateGeom(aLvl), h = 0.20;
    return { cy: ep.cy - ep.sy * 0.5 + 0.05 + h * 0.5, h };
  }
  // Shark-fin PLANFORM — SINGLE SOURCE OF TRUTH, same deal as the endplate above:
  // the fin mesh (the sharkFin part below) AND the fin livery decal in
  // js/game/carmesh.js both read it, so the tail graphic lands on the fin at
  // every corner instead of on a rectangle that only roughly overlaps it.
  // The outline lives in the fin's own (z, y) plane — a raked leading edge and a
  // base that follows the engine-cover ridge down — plus the half-width at the
  // base and at the top (the fin TAPERS, so a decal at one flat x floats off the
  // top edge).
  const FIN = Object.freeze({
    baseLE: [-0.65, 0.7935], topLE: [-1.15, 0.97],
    topTE:  [-1.65, 0.97],   baseTE: [-1.70, 0.6197],
    halfBase: 0.022, halfTop: 0.014,
  });
  const finMix = (a, b, t) => a + (b - a) * t;
  // Half-width of the fin's flank at a point ON it, plus `proud`. The fin tapers
  // from halfBase at the engine-cover ridge to halfTop at the crown, so a decal
  // pinned at one flat x lies on the surface at the bottom and floats a whole
  // centimetre off it at the top.
  function finXAt(z, y, proud) {
    const u = (z - FIN.baseLE[0]) / (FIN.baseTE[0] - FIN.baseLE[0]);   // along the base edge
    const yBase = finMix(FIN.baseLE[1], FIN.baseTE[1], Math.max(0, Math.min(1, u)));
    const v = Math.max(0, Math.min(1, (y - yBase) / (FIN.topLE[1] - yBase)));
    return finMix(FIN.halfBase, FIN.halfTop, v) + proud;
  }
  // The livery-GRAPHIC panel on the fin's flank, as the four corners
  // [frontBottom, rearBottom, rearTop, frontTop] of the +x face ({x,y,z} each).
  // It follows the whole swept outline, so the painted tail covers the fin the
  // way a real one does. That means it is a sheared trapezoid — fine for an
  // abstract wash and motif strokes, WRONG for a badge, which is why the crest
  // gets its own upright patch below instead of riding on this one.
  // `inset` pulls it in from the outline (fraction of each edge) so the graphic
  // stops short of the fin's edges; `proud` lifts it off the surface.
  function sharkFinPanel(inset, proud) {
    const i = inset != null ? inset : 0.05;
    const p = proud != null ? proud : 0.002;
    // The BASE edge insets further than the other three. The fin grows straight
    // out of the engine-cover ridge and the accent pinstripe runs along that
    // spine, so a wash carried all the way down reads as painted onto the trim
    // rather than onto the fin. (This does not get the panel CLEAR of the
    // pinstripe — it runs the fin's whole length a few cm below it, so the
    // decal legitimately spans both paints, which is what
    // tests/parts-livery-contrast.spec.js records. It just stops the graphic
    // sitting ON it.)
    const vBase = Math.max(i, 0.18);
    const at = (u, v) => {
      // bilinear over the outline: u = 0 leading → 1 trailing, v = 0 base → 1 top.
      const bz = finMix(FIN.baseLE[0], FIN.baseTE[0], u), by = finMix(FIN.baseLE[1], FIN.baseTE[1], u);
      const tz = finMix(FIN.topLE[0],  FIN.topTE[0],  u), ty = finMix(FIN.topLE[1],  FIN.topTE[1],  u);
      return { x: finMix(FIN.halfBase, FIN.halfTop, v) + p,
               y: finMix(by, ty, v), z: finMix(bz, tz, v) };
    };
    return [at(i, vBase), at(1 - i, vBase), at(1 - i, 1 - i), at(i, 1 - i)];
  }
  // The CREST patch on the fin: an UPRIGHT, axis-aligned SQUARE in the fin's
  // (z, y) plane — not a slice of the planform. The fin's leading edge rakes back
  // half a metre over its height and its base drops away rearward, so a badge
  // mapped onto the outline leans and squashes with it; a logo has to stay
  // vertical and square whatever the surface under it is doing. Sized and placed
  // to sit inside the outline with clearance on all four sides (the fin is a full
  // 0.35 m tall through this z range, and the crown is flat from z −1.15 back).
  const FIN_BADGE = Object.freeze({ z0: -1.235, z1: -1.465, y0: 0.725, y1: 0.955 });
  function sharkFinBadge(proud) {
    const p = proud != null ? proud : 0.0022;   // just outside the graphic panel
    const B = FIN_BADGE, at = (z, y) => ({ x: finXAt(z, y, p), y, z });
    return [at(B.z0, B.y0), at(B.z1, B.y0), at(B.z1, B.y1), at(B.z0, B.y1)];
  }
  function mergeRecipe(defaults, recipe) {
    return Object.assign(defaults, recipe || {});
  }
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
    }, recipe);
  }
  function buildAeroParts(recipe, tier) {
    const lvl = tier === 0 ? 0 : tier === 2 ? 4 : 2;
    // plate/casc/swan/tvane are the newer front-/rear-wing STRUCTURE knobs.
    // `plate` defaults to 1 (the shipped outwash endplate); `casc` and `tvane`
    // default to null, meaning "derive from lvl exactly as before", so every
    // option written before these existed builds byte-identical geometry.
    return mergeRecipe({
      lvl, beam: tier === 2 ? 1 : 0, drs: 0,
      vane: lvl >= 4 ? 3 : lvl >= 3 ? 2 : lvl >= 1 ? 1 : 0,
      plate: 1, casc: null, swan: 0, tvane: null,
      frontSweep: 0.04, frontTaper: 0.98, frontRise: 0.04,
      rearSweep: 0.03, rearTaper: 0.98,
      floorEdge: 1, floorCut: 0.04, diffuserRise: 1,
    }, recipe);
  }
  function buildSuspensionParts(recipe, tier) {
    return mergeRecipe({
      ride: tier === 0 ? 0.060 : tier === 2 ? -0.048 : 0,
      arm: tier === 0 ? 0.85 : tier === 2 ? 1.3 : 1,
      push: tier === 2 ? 1 : 0, pull: 0,
      wishbone: 1, toe: 1,
      // Visible inboard rocker fairing on the tub top: 0 none / 1 blister / 2 full cover.
      rocker: 0,
    }, recipe);
  }
  function buildBrakeParts(recipe, tier) {
    return mergeRecipe({
      cal: BRAKE_CALIPER[tier], duct: tier === 0 ? 0.5 : tier === 2 ? 1.9 : 1,
      rim: null, caliperPos: 0, coverOpen: tier === 2 ? 1 : 0,
      rotor: tier === 2 ? 2 : 1, rotorScale: tier === 2 ? 1.12 : 1,
      // null = derive the duct fairing from `duct` (the shipped behaviour).
      scoop: null,
      // Disc face pattern seen through an open cover: 0 plain / 1 drilled / 2 slotted.
      discFace: 0,
    }, recipe);
  }
  function buildTyreParts(recipe, tier) {
    // `shoulder`: 0 the shipped square sidewall / 1 rounded / 2 stepped. It
    // changes the tyre's SILHOUETTE, which no amount of band-width tuning can.
    return mergeRecipe({ band: TYRE_BAND[tier], grooved: false, shoulder: 0 }, recipe);
  }
  function buildErsParts(recipe, tier, accent) {
    return mergeRecipe({ led: tier === 2 ? accent : null, pack: 1,
      cells: tier === 2 ? 6 : 3, conduit: 0 }, recipe);
  }
  function buildGearboxParts(recipe, tier) {
    return mergeRecipe({
      strakes: tier === 2 ? 5 : 0, fin: tier === 2 ? 1 : 0,
      strakeH: 0.13, finSY: 0.14, finSZ: 0.28,
      casing: tier === 2 ? 3 : 0, louvres: 0, heat: 0,
      caseWidth: 1,
    }, recipe);
  }
  function buildFuelParts(recipe, tier) {
    return mergeRecipe({
      cap: tier === 2 ? [0.95, 0.28, 1.5] : [0.55, 0.52, 0.60],
      flame: [1.15, 0.42, 0.14],
      line: 1, filler: 0,
    }, recipe);
  }
  // EXHAUST: `pipes` null = derive the tip count from the engine's own plumbing
  // (the shipped behaviour); a recipe may state it outright. bore/flare/wastegate/
  // wrap default to the values that reproduce today's tailpipe exactly.
  function buildExhaustParts(recipe) {
    return mergeRecipe({ pipes: null, bore: 1, flare: 0, wastegate: 0, wrap: 0 }, recipe);
  }
  // FLOOR: the five evenly-spaced edge fences that used to be hardcoded, plus
  // skid blocks and an edge lip. fences 5 / fenceH 1 is the shipped array.
  function buildFloorParts(recipe) {
    return mergeRecipe({ fences: 5, fenceH: 1, skid: 0, edgeLip: 0 }, recipe);
  }
  // COCKPIT: the halo and its furniture. haloBlade thickens the hoop into an
  // aero section, haloWing adds the upper flap many cars carry, camPods sets the
  // T-cam pod count. All default to the shipped cockpit.
  // WHEELS: rim furniture. spokes shows through an open cover, tape is a
  // coloured band around the rim, dish sets how far the cover face is recessed,
  // nut recolours the centre-lock. All default to the shipped wheel.
  function buildWheelParts(recipe) {
    return mergeRecipe({ spokes: 0, tape: 0, dish: 0, nut: null }, recipe);
  }
  function buildCockpitParts(recipe) {
    return mergeRecipe({ haloBlade: 0, haloWing: 0, camPods: 0, screen: 0 }, recipe);
  }
  function buildPartRecipes(T, accent) {
    const tier = (id) => T[id] != null ? T[id] : 1;
    const recipe = (id) => T._visual && T._visual[id] || null;
    return {
      engine: buildEngineParts(recipe("engine"), tier("engine")),
      aero: buildAeroParts(recipe("aero"), tier("aero")),
      suspension: buildSuspensionParts(recipe("suspension"), tier("suspension")),
      brakes: buildBrakeParts(recipe("brakes"), tier("brakes")),
      tyres: buildTyreParts(recipe("tyres"), tier("tyres")),
      ers: buildErsParts(recipe("ers"), tier("ers"), accent),
      gearbox: buildGearboxParts(recipe("gearbox"), tier("gearbox")),
      fuel: buildFuelParts(recipe("fuel"), tier("fuel")),
      exhaust: buildExhaustParts(recipe("exhaust")),
      floor: buildFloorParts(recipe("floor")),
      cockpit: buildCockpitParts(recipe("cockpit")),
      wheels: buildWheelParts(recipe("wheels")),
    };
  }
  // Resolve the continuous 0..4 downforce level from a getVisualTiers() object.
  // Resolved recipes are authoritative; the coarse tier remains a stale-bundle
  // fallback for AI/no-parts builds.
  function aeroLevelOf(T) {
    T = T || {};
    return buildAeroParts(T._visual && T._visual.aero, T.aero != null ? T.aero : 1).lvl;
  }
  // The resolved aero RECIPE for a getVisualTiers() bag — the companion of
  // aeroLevelOf, and the ONLY correct thing to hand aeroFlaps()/getAeroFlap().
  // Every flap call site used to pass `parts.aero`, which is the coarse TIER
  // NUMBER (0|1|2), not a recipe: a number is truthy, so aeroFlapsGeom took it
  // as the style, read .frontSweep off it, and clamped undefined into NaN —
  // silently NaN-ing every vertex of every moveable element. The wings were not
  // failing to move; they were not being DRAWN, on any car whose style came
  // through this path. buildAeroParts merges full defaults, so the recipe this
  // returns always carries every field.
  function aeroStyleOf(T) {
    T = T || {};
    return buildAeroParts(T._visual && T._visual.aero, T.aero != null ? T.aero : 1);
  }
  // Per-DRIVER helmet crown-stripe palette (indexed by car number) so team-mates
  // and the field carry distinct helmets.
  const HELMET_ACCENT = [
    [0.95, 0.20, 0.15], [0.15, 0.45, 0.95], [0.97, 0.82, 0.10], [0.90, 0.90, 0.95],
    [0.15, 0.75, 0.35], [0.85, 0.40, 0.90], [0.98, 0.50, 0.10], [0.10, 0.80, 0.80],
  ];

  function buildSharedChassis(out, c1, rideDY, noseStations) {
    const floor = CHASSIS.floor;
    addBox(out, floor.cx, Math.max(floor.cy + rideDY, 0.052), floor.cz,
           floor.sx, floor.sy, floor.sz, CARBON);
    const nose = noseStations || CHASSIS.nose;
    addSpan(out, nose[0], nose[1], c1);
    addTopBevel(out, nose[0], nose[1], 0.022, c1);
    addSpan(out, nose[1], nose[2], c1);
    addTopBevel(out, nose[1], nose[2], 0.028, c1);
    addSpan(out, CHASSIS.monocoque[0], CHASSIS.monocoque[1], c1);
    addTopBevel(out, CHASSIS.monocoque[0], CHASSIS.monocoque[1], 0.032, c1);
    addSpan(out, CHASSIS.cockpit[0], CHASSIS.cockpit[1], c1);
    addTopBevel(out, CHASSIS.cockpit[0], CHASSIS.cockpit[1], 0.028, c1);
  }

  function sidepodStation(side, z, inner, outer, innerBottom, outerBottom, innerTop, outerTop) {
    return [
      [side * inner, innerBottom, z], [side * outer, outerBottom, z],
      [side * outer, outerTop, z], [side * inner, innerTop, z],
    ];
  }

  function sampleStations(stations, z) {
    if (z >= stations[0].z) return Object.assign({}, stations[0], { z });
    if (z <= stations[stations.length - 1].z)
      return Object.assign({}, stations[stations.length - 1], { z });
    for (let i = 0; i < stations.length - 1; i++) {
      const a = stations[i], b = stations[i + 1];
      if (z <= a.z && z >= b.z) {
        const t = (a.z - z) / (a.z - b.z), out = { z };
        for (const key of Object.keys(a)) {
          if (key !== "z") out[key] = a[key] + (b[key] - a[key]) * t;
        }
        return out;
      }
    }
    return Object.assign({}, stations[0], { z });
  }

  function sidepodStations(eng, style) {
    const podWidth = Math.max(0.72, Math.min(1.28, eng.podWidth));
    const shoulder = Math.max(0.76, Math.min(1.28, eng.shoulderHeight));
    const undercut = Math.max(0.72, Math.min(1.38, eng.undercut));
    const coke = Math.max(0.72, Math.min(1.38, eng.coke));
    const tailWidth = Math.max(0.70, Math.min(1.30, eng.tailWidth));
    const outerFront = 0.66 * podWidth;
    const outerShoulder = 0.70 * podWidth;
    const outerWaist = (0.58 - 0.08 * (coke - 1)) * podWidth;
    const outerTail = (0.38 - 0.09 * (coke - 1)) * tailWidth;
    const inletFloor = 0.235 + 0.11 * (undercut - 1);
    const shoulderTop = 0.49 + 0.23 * (shoulder - 1);
    // Team-style inlet aspect: +bias = taller/prouder inlet mouth, − = squashed
    // letterbox. Only the front (inlet) station moves — the shoulder onward is
    // engine-recipe territory, so parts and team identity stay orthogonal.
    const inletBias = style ? (style.inlet || 0) : 0;
    return [
      { z: 0.62, inner: 0.30, outer: outerFront, innerBottom: inletFloor,
        outerBottom: 0.245 + 0.06 * (undercut - 1),
        innerTop: 0.45 + inletBias, outerTop: 0.46 + inletBias * 0.6 },
      { z: 0.22, inner: 0.29, outer: outerShoulder,
        innerBottom: 0.20 + 0.13 * (undercut - 1), outerBottom: 0.12,
        innerTop: shoulderTop, outerTop: shoulderTop - 0.015 },
      { z: -0.62, inner: 0.27, outer: outerWaist,
        innerBottom: 0.14 + 0.08 * (undercut - 1), outerBottom: 0.105,
        innerTop: 0.42 + 0.10 * (shoulder - 1),
        outerTop: 0.38 + 0.08 * (shoulder - 1) },
      { z: -1.48, inner: 0.23, outer: outerTail, innerBottom: 0.13,
        outerBottom: 0.12, innerTop: 0.30 + 0.05 * (shoulder - 1), outerTop: 0.27 },
    ];
  }

  // Memoised on (parts, teamId) OBJECT IDENTITY. The result is immutable — the
  // three sampler methods are pure and podStations is already frozen copies — so
  // handing the same object to every caller is safe, and `parts` here is the
  // stable cached recipe game.js's teamDecalState already memoises per store.rev.
  //
  // Worth doing because the uncached build is ~20 allocations plus four
  // Object.freeze calls (engine parts, three station arrays, a joined key string,
  // three fresh method closures) and getCarDecalMesh calls it once per DRAWN CAR
  // PER FRAME — purely to read anchors.key and discover the decal mesh it wanted
  // is already cached. A WeakMap keyed on parts means an entry dies with the
  // recipe that owns it; the inner Map is per teamId, which is a small fixed set.
  const _anchorCache = new WeakMap();
  const _anchorNullKey = {};   // stand-in for a null/undefined parts (legacy bodies)
  function bodyAnchors(parts, teamId) {
    const outer = parts || _anchorNullKey;
    let byTeam = _anchorCache.get(outer);
    if (!byTeam) { byTeam = new Map(); _anchorCache.set(outer, byTeam); }
    const tk = teamId || "";
    const hit = byTeam.get(tk);
    if (hit) return hit;
    const built = buildBodyAnchors(parts, teamId);
    byTeam.set(tk, built);
    return built;
  }

  function buildBodyAnchors(parts, teamId) {
    const T = parts || {};
    const tier = T.engine != null ? T.engine : 1;
    const eng = buildEngineParts(T._visual && T._visual.engine, tier);
    // Team style shapes the SAME stations the bodywork lofts from, so decal /
    // stripe / detail anchoring stays glued to the styled silhouette.
    const style = teamStyleOf(teamId);
    const podStations = sidepodStations(eng, style);
    const coverHeight = Math.max(0.78, Math.min(1.28, eng.coverHeight));
    const coverStations = [
      { z: -0.55, x: 0.28 * eng.tailWidth,
        bottom: 0.52 + 0.08 * (coverHeight - 1) - 0.31 * coverHeight,
        top: 0.52 + 0.08 * (coverHeight - 1) + 0.31 * coverHeight },
      { z: -2.00, x: 0.13 * eng.tailWidth,
        bottom: 0.42 - 0.17 * coverHeight, top: 0.42 + 0.17 * coverHeight },
    ];
    const noseStations = styledNoseStations(style).map((station) => ({
      z: station.z, side: station.w * 0.5, topSide: station.w * station.t * 0.5,
      bottom: station.y - station.h * 0.5, top: station.y + station.h * 0.5,
    }));
    return {
      key: [eng.podWidth, eng.shoulderHeight, eng.undercut, eng.coke,
            eng.tailWidth, eng.coverHeight,
            style === DEFAULT_STYLE ? "" : (teamId || "")].join(","),
      podAt(z) {
        const p = sampleStations(podStations, z);
        return { z, x: p.outer, inner: p.inner, bottom: p.outerBottom, top: p.outerTop,
                 innerBottom: p.innerBottom, innerTop: p.innerTop };
      },
      coverAt(z) { return sampleStations(coverStations, z); },
      noseAt(z) { return sampleStations(noseStations, z); },
      podStations: podStations.map((p) => Object.freeze(Object.assign({}, p))),
    };
  }

  function buildSidepodBodywork(out, c1, eng, anchors) {
    const data = anchors || bodyAnchors({ engine: 1, _visual: { engine: eng } });
    const stations = data.podStations;
    for (const side of [-1, 1]) {
      addStationLoft(out, stations.map((p) => sidepodStation(side, p.z, p.inner, p.outer,
        p.innerBottom, p.outerBottom, p.innerTop, p.outerTop)), c1, INTAKE);
    }
    const inletP = data.podAt(0.62);
    const shoulderP = data.podAt(0.18);
    const flankP = data.podAt(-0.10);
    const floorP = data.podAt(0.0);
    const conduitP = data.podAt(-0.65);
    const tailP = data.podAt(-1.48);
    return {
      inlet: { z: 0.625, x: (inletP.inner + inletP.x) * 0.5,
               y: (inletP.innerBottom + inletP.innerTop) * 0.5,
               width: inletP.x - inletP.inner, height: inletP.innerTop - inletP.innerBottom },
      shoulder: { x: shoulderP.x + 0.008, y: shoulderP.top - 0.012, z: 0.18 },
      flank: { x: flankP.x + 0.008, y: (flankP.bottom + flankP.top) * 0.5, z: -0.10 },
      floorEdge: { x: floorP.x + 0.012, y: floorP.bottom + 0.012 },
      conduit: { x: conduitP.x + 0.012, y: conduitP.top + 0.018, z: -0.65 },
      tail: { x: tailP.x, y: (tailP.bottom + tailP.top) * 0.5, z: -1.48 },
    };
  }

  function buildEngineCoverBodywork(out, c1, accentC, eng, anchors) {
    const coverHeight = Math.max(0.78, Math.min(1.28, eng.coverHeight));
    const front = { z: -0.55, y: 0.52 + 0.08 * (coverHeight - 1),
                    w: 0.56 * eng.tailWidth, h: 0.62 * coverHeight, t: 0.0 };
    const rear = { z: -2.00, y: 0.42, w: 0.26 * eng.tailWidth,
                   h: 0.34 * coverHeight, t: 0.0 };
    addSpan(out, front, rear, c1, c1);
    const stripeFront = anchors.coverAt(-0.825), stripeRear = anchors.coverAt(-1.675);
    for (const side of [-1, 1]) {
      addSpan(out,
        { z: stripeFront.z, x: side * (stripeFront.x * 0.78), y: stripeFront.top - 0.10,
          w: 0.010, h: 0.012 },
        { z: stripeRear.z, x: side * (stripeRear.x * 0.78), y: stripeRear.top - 0.07,
          w: 0.010, h: 0.012 }, accentC);
    }
    const mid = anchors.coverAt(-1.30);
    return {
      front, rear,
      coolingX: Math.max(0.08, mid.x * 0.78),
      coolingY: mid.top - 0.12,
      tailVentY: rear.y + rear.h * 0.20,
    };
  }

  function build(color, color2, opts) {
    const noWheels = opts && opts.noWheels;
    const out = { pos: [], nrm: [], col: [], mat: [], idx: [] };
    // Section bookkeeping for the agent world view (carView({detail:"parts"})).
    // Pure recording — no geometry changes, and the arrays are identical with or
    // without it. Answers "how big is the rear wing" without rendering the car.
    const sections = [];
    const part = (name) => {
      const at = out.pos.length / 3;
      if (sections.length) sections[sections.length - 1].to = at;
      sections.push({ name, from: at, to: at });
    };
    const c1 = color  || [0.8, 0.05, 0.05];
    const c2 = color2 || [0.9, 0.9, 0.1];
    // Optional separate livery ACCENT colour for the extra paint-detail flashes
    // (sidepod flash, nose flash, engine-cover pinstripe). Falls back to c2 so a
    // livery without an explicit accent still gets tasteful team-colour detailing.
    const liv = (opts && opts.livery) || {};
    const accentC = liv.accent || c2;
    // Further OPTIONAL livery colours, each additive and fully backward-compatible
    // (a livery without them is byte-identical to before): `nose` paints a nose-tip
    // cap, `pod` a bold sidepod panel, `wing` the front+rear wing flap elements,
    // `halo` the cockpit-protection hoop. All fall back to sensible existing colours.
    const noseC = liv.nose || null;
    const podC  = liv.pod  || null;
    const wingC = liv.wing || c2;   // flap colour (front + rear) — c2 keeps today's look
    const finC  = liv.fin  || c2;   // shark-fin plate — c2 keeps today's look
    const haloTint = liv.halo || null;
    // Parts-driven visual identity: `_visual` contains the resolved parametric
    // recipe for every category; coarse tiers remain neutral fallbacks.
    const T = (opts && opts.parts) || {};
    const tier = (id) => T[id] != null ? T[id] : 1;
    const ersC2 = tier("ers") === 2 ? [c2[0]*1.8, c2[1]*1.8, c2[2]*1.8] : c2;
    const design = buildPartRecipes(T, ersC2);
    const suspT = tier("suspension");
    const suspStyle = design.suspension;
    const engStyle = design.engine;
    const brakeStyle = design.brakes;
    const tyreStyle = design.tyres;
    const ersStyle = design.ers;
    const gbStyle = design.gearbox;
    const fuelStyle = design.fuel;
    const aeroStyle = design.aero;
    // ACTIVE AERO bookkeeping: the top wing elements are deliberately NOT baked
    // into this mesh (see aeroFlapsGeom). Record exactly what they need so no
    // consumer has to re-derive the level/style/colour and risk disagreeing with
    // the wing this build actually produced. buildComplete() below is the "whole
    // car" view for anything that wants the elements merged back in.
    out.flapInfo = null;   // filled in once wingC/aLvl are resolved, below
    const exhStyle = design.exhaust;
    const floorStyle = design.floor;
    const cockpitStyle = design.cockpit;
    const wheelStyle = design.wheels;
    // Per-team chassis identity (opts.teamId): nose profile, airbox scale,
    // dorsal fin, mirror style, sidepod-inlet aspect. Absent → shared default
    // silhouette, byte-identical to before.
    const teamStyle = teamStyleOf(opts && opts.teamId);
    const anchors = bodyAnchors(T, opts && opts.teamId);

    part("chassis");
    // --- Shared chassis --- per-OPTION suspension shifts only ride height.
    const rideDY = suspStyle ? suspStyle.ride : (suspT === 0 ? 0.060 : suspT === 2 ? -0.048 : 0);
    buildSharedChassis(out, c1, rideDY, styledNoseStations(teamStyle));

    part("hood");
    // --- Hood / vanity deck: a raised central panel over the monocoque, rising
    // to a hump right in front of the cockpit. This is the "hood" the driver
    // looks over in the onboard view (the modern F1 dash bulge / vanity panel);
    // it also adds a chiselled centre spine to the chase-view silhouette. Runs
    // from the nose bulkhead back to the dash, cresting at the cockpit. ---
    // In cockpit view the hood is remodelled LONGER and TALLER so it reads
    // clearly ahead of the driver (a stubby deck disappears under the dash).
    const ckpt = opts && opts.cockpit;
    // ERS tier tints the two flat accent-colour "livery tell" panels (hood
    // stripe + shark fin below) HDR at the top tier — same ">1 albedo glows
    // at night" convention PANEL already uses; plain team colour otherwise.
    // Cockpit view: the hood is a LOW dash cowl that stops BEHIND the nose
    // number deck (z~1.1) — so the driver looks over the cowl and sees the long
    // nose stretching out ahead past the steering wheel (with the number on it),
    // and the raised cockpit shoulders sit either side. A tall/long bulge would
    // bury the wheel and hide the nose; keep it low and short. Non-ckpt stays sleek.
    const hF = ckpt ? { z: 1.10, y: 0.44, w: 0.36, h: 0.10, t: 0.66 }
                    : { z: 1.15, y: 0.435, w: 0.30, h: 0.09, t: 0.64 };
    const hR = ckpt ? { z: 0.06, y: 0.60, w: 0.54, h: 0.19, t: 0.58 }
                    : { z: 0.08, y: 0.585, w: 0.44, h: 0.15, t: 0.58 };
    addSpan(out, hF, hR, c1, c1);
    addTopBevel(out, hF, hR, 0.026, c1);
    // Accent stripe down the vanity deck crown (team colour).
    addBox(out, 0, ckpt ? 0.73 : 0.665, ckpt ? 0.90 : 0.45, 0.10, 0.02, ckpt ? 1.75 : 0.80,
           ersC2, SURFACES.paint);

    part("bolsters");
    // --- Cockpit-side head-protection bolsters: the raised survival-cell edges
    // flanking the cockpit opening. They frame the driver's view left/right in
    // the onboard cam and give the tub real shoulders in chase. In cockpit view
    // they're remodelled into WIDE, TALL sidepod shoulders that rise beside the
    // driver and slope down toward the nose — the big red bodywork "V" that
    // frames a real F1 onboard (see reference). ---
    if (ckpt) {
      for (const s of [-1, 1]) {
        // Survival-cell SIDE WALL: the tall tub edge the driver sits between. It
        // rises tall right beside/ahead of the eye (z~0.42, framing the wheel
        // left+right so it reads as a real enclosed cockpit) and tapers DOWN and
        // outward toward the nose. The rear/headrest portion (z < eye 0.32) sits
        // behind the camera and never renders, so the visible span is the dash
        // side that wraps the wheel.
        addBlock(out, [
          [s*0.30, 0.34, 1.50], [s*0.56, 0.26, 1.50], [s*0.54, 0.50, 1.46], [s*0.30, 0.56, 1.46],  // front (nose end, low)
          [s*0.32, 0.44, 0.40], [s*0.55, 0.36, 0.40], [s*0.53, 0.84, 0.34], [s*0.32, 0.88, 0.34],  // rear (beside the wheel, TALL)
        ], c1);
        // Crown accent stripe running the top of the tub wall.
        addBox(out, s*0.45, 0.80, 0.75, 0.03, 0.03, 1.2, c2);
        // Inner tub wall (dark carbon) facing the driver — the cockpit interior
        // surface you see on the inside of each side wall.
        addBox(out, s*0.315, 0.64, 0.52, 0.02, 0.28, 0.60, INTAKE);
      }
      // Dash coaming: the padded rim across the FRONT of the cockpit opening, just
      // under the wheel, tying the two side walls together into a tub.
      addBox(out, 0, 0.62, 0.60, 0.66, 0.14, 0.16, c1);
      addBox(out, 0, 0.70, 0.56, 0.60, 0.03, 0.05, c2);        // accent lip
      addBox(out, 0, 0.60, 0.54, 0.52, 0.10, 0.05, INTAKE);    // dark instrument shroud
    } else {
      for (const s of [-1, 1]) {
        addBlock(out, [
          [s*0.24, 0.42, 0.14], [s*0.40, 0.42, 0.14], [s*0.40, 0.60, 0.10], [s*0.24, 0.58, 0.10],
          [s*0.24, 0.44, -0.42], [s*0.40, 0.44, -0.42], [s*0.40, 0.62, -0.44], [s*0.24, 0.60, -0.44],
        ], c1);
      }
    }

    part("sidepods");
    // --- Sidepods: four body stations create a deep inlet, undercut, downwash
    // shoulder and coke-bottle tail. Geometry datums returned here anchor all
    // paint, sponsor, ERS and cooling details below.
    const podGeom = buildSidepodBodywork(out, c1, engStyle, anchors);
    // `fracH` reads `height` as a FRACTION of the pod's height at each station
    // instead of metres. The pod tapers front-to-rear, so a fixed metre height
    // covers a different yFrac band at each station — which makes it impossible
    // to size a band to a decal (whose extent IS in yFrac) or to butt two bands
    // together without them overlapping and z-fighting somewhere along the pod.
    function addPodFlankSpan(zFront, zRear, yFrac, height, col, surface, proud, fracH) {
      // Never bridge a detail across a loft crease: each segment follows the
      // same station interval as the underlying sidepod surface.
      const stops = [zFront, ...anchors.podStations.map((p) => p.z)
        .filter((z) => z < zFront && z > zRear), zRear].sort((a, b) => b - a);
      for (const side of [-1, 1]) {
        for (let i = 0; i < stops.length - 1; i++) {
          const a = anchors.podAt(stops[i]), b = anchors.podAt(stops[i + 1]);
          addSpan(out,
            { z: stops[i], x: side * (a.x + (proud || 0.008)),
              y: a.bottom + (a.top - a.bottom) * yFrac,
              w: 0.016, h: fracH ? (a.top - a.bottom) * height
                                 : Math.min(height, (a.top - a.bottom) * 0.78) },
            { z: stops[i + 1], x: side * (b.x + (proud || 0.008)),
              y: b.bottom + (b.top - b.bottom) * yFrac,
              w: 0.016, h: fracH ? (b.top - b.bottom) * height
                                 : Math.min(height, (b.top - b.bottom) * 0.78) },
            col, null, surface);
        }
      }
    }

    // Visible floor shoulder and edge wing. Aero recipes vary its exposure and
    // rear cut so underfloor choices remain legible from normal 3/4 cameras.
    const floorEdge = Math.max(0.72, Math.min(1.35, aeroStyle.floorEdge));
    const floorCut = Math.max(0, Math.min(0.24, aeroStyle.floorCut));
    // Half-width of the VISIBLE floor edge at a given z — the line the two spans
    // below trace. The FLOOR recipe's furniture anchors to this, so it always
    // sits on the car's outline instead of hiding under the sidepod.
    const floorEdgeAt = (z) => {
      const t = Math.max(0, Math.min(1, (0.78 - z) / 2.36));
      return (0.70 - 0.16 * Math.max(0, t - 0.5) * 2) * floorEdge;
    };
    for (const side of [-1, 1]) {
      addSpan(out,
        { z: 0.78, x: side * 0.69 * floorEdge, y: 0.105 + rideDY, w: 0.045, h: 0.035 },
        { z: -0.42 - floorCut, x: side * 0.72 * floorEdge, y: 0.110 + rideDY, w: 0.038, h: 0.040 },
        CARBON, null, SURFACES.carbon);
      addSpan(out,
        { z: -0.48 + floorCut, x: side * 0.70 * floorEdge, y: 0.112 + rideDY, w: 0.036, h: 0.040 },
        { z: -1.58, x: side * (0.54 + floorCut * 0.35) * floorEdge,
          y: 0.145 + rideDY, w: 0.028, h: 0.055 },
        CARBON, null, SURFACES.carbon);
    }

    part("engineCover");
    // --- Airbox + engine cover: sit BEHIND the driver, so they're skipped in
    // the cockpit build (ckpt) — under brake pitch they'd otherwise swing up
    // into the top/back of the onboard frame ("the thing behind us cutting in").
    let coverGeom = null;
    if (!ckpt) {
      // Airbox: trapezoid block above the cockpit (dark intake front). The
      // resolved engine recipe controls intake scale, snorkel and cover louvres.
      const engT = tier("engine");
      // Team style scales the intake on top of the engine recipe (e.g. Audi's
      // oversized ram inlet vs Williams' slimline duct).
      const inScale = (engStyle ? engStyle.in : (engT === 0 ? 0.52 : engT === 2 ? 1.65 : 1.0)) * teamStyle.airbox;
      const engSnork = engStyle ? !!engStyle.snork : engT === 2;
      addSpan(out, { z: -0.28, y: 0.76, w: 0.30 * inScale, h: 0.20 * inScale, t: 0.55 },
                   { z: -0.75, y: 0.74, w: 0.26 * inScale, h: 0.18 * inScale, t: 0.55 }, c1, INTAKE);
      coverGeom = buildEngineCoverBodywork(out, c1, accentC, engStyle, anchors);
      if (engSnork) {
        // Big-spec power unit tells: a raised airbox snorkel cresting behind the
        // roll hoop + cooling-louvre strips on the engine-cover flanks. Snorkel
        // scale tracks the intake size so a quali PU snorkel dwarfs a turbo's.
        const sk = 0.78 + inScale * 0.32;
        addSpan(out, { z: -0.18, y: 0.94, w: 0.13 * sk, h: 0.11 * sk, t: 0.5 },
                     { z: -0.62, y: 0.86, w: 0.11 * sk, h: 0.09 * sk, t: 0.5 }, c1, INTAKE);
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
            const cp = anchors.coverAt(-1.42);
            addBox(out, s*(cp.x*0.78), cp.top - 0.04, -1.42, 0.07, 0.11, 0.15, INTAKE);
            addBox(out, s*(cp.x*0.78), cp.top + 0.025, -1.42, 0.05, 0.02, 0.11, CARBON);
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
      // Removable power-unit service panels expose the hidden-system story on
      // the cover flanks without cutting away the primary silhouette.
      const servicePanels = Math.max(0, Math.min(4, Math.round(engStyle.servicePanel || 0)));
      for (const s of [-1, 1]) for (let i = 0; i < servicePanels; i++) {
        const z = -0.82 - i * 0.19, p = anchors.coverAt(z);
        addBox(out, s*(p.x + 0.010), p.top - 0.18, z, 0.018, 0.10, 0.13,
          [0.24,0.24,0.27], SURFACES.metal);
      }
      if (engStyle.heatShield) {
        const p = anchors.coverAt(-1.58);
        addBox(out, 0, p.top + 0.010, -1.58, 0.18 * engStyle.heatShield,
          0.014, 0.30, [0.30,0.28,0.26], SURFACES.metal);
      }
      // Team-style DORSAL FIN along the engine-cover ridge: 1 = low blade,
      // 2 = tall blade. A SECONDARY ridge blade distinct from the sharkFin
      // tail plate below (which every non-cockpit car carries). Body-colour
      // plate with an accent crest line — a strong per-team silhouette tell
      // from chase and TV cameras. Starts behind the snorkel zone (z −0.95)
      // so the two never intersect.
      if (teamStyle.fin) {
        const finH = teamStyle.fin >= 2 ? 0.19 : 0.095;
        const ff = anchors.coverAt(-0.95), fr = anchors.coverAt(-1.85);
        addSpan(out,
          { z: ff.z, y: ff.top + finH * 0.5, w: 0.016, h: finH },
          { z: fr.z, y: fr.top + finH * 0.33, w: 0.014, h: finH * 0.66 }, c1);
        addSpan(out,
          { z: ff.z, y: ff.top + finH + 0.006, w: 0.020, h: 0.014 },
          { z: fr.z, y: fr.top + finH * 0.66 + 0.005, w: 0.018, h: 0.012 }, accentC);
      }
      // Engine-spec identification dots across the airbox intake lip.
      const engLed = engT === 2 ? [0.95, 0.22, 0.10] : engT === 0 ? [0.12, 0.82, 0.38] : [0.90, 0.62, 0.12];
      for (const lx of [-0.06, 0, 0.06])
        addBox(out, lx, 0.885, -0.30, 0.02, 0.014, 0.02, engLed, SURFACES.metal);
      // FUEL: per-option filler cap colour.
      const fuelColor = fuelStyle ? fuelStyle.cap : (tier("fuel") === 2 ? [0.95, 0.28, 1.5] : [0.55, 0.52, 0.60]);
      const fuelDisplay = fuelColor.map((value) => Math.min(value, 1));
      // Fuel filler on the airbox shoulder: a dark housing ringed by a bright
      // fuel-grade COLLAR in the blend colour + a cap dot — a clear grade placard.
      addBox(out, 0.12, 0.795, -0.50, 0.075, 0.05, 0.12, [0.10, 0.10, 0.12], SURFACES.carbon);   // housing
      const fuelSurface = SURFACES.metal;
      addBox(out, 0.12, 0.828, -0.50, 0.10,  0.02, 0.15, fuelDisplay, fuelSurface);            // collar ring (proud)
      addBox(out, 0.12, 0.85,  -0.50, 0.035, 0.03, 0.05, fuelDisplay, fuelSurface);            // cap dot
      // Filler HARDWARE (`filler`, 0..2): 1 adds a quick-fill coupling stub beside
      // the cap, 2 adds a second coupling and a breather standpipe — the pit-lane
      // rig fitting that tells a race blend apart from a qualifying brew from above.
      const fuelFiller = Math.max(0, Math.min(2, Math.round(fuelStyle.filler || 0)));
      if (fuelFiller >= 1) {
        addBox(out, -0.02, 0.815, -0.50, 0.055, 0.045, 0.09, [0.12, 0.12, 0.14], SURFACES.carbon);
        addBox(out, -0.02, 0.848, -0.50, 0.038, 0.024, 0.06, fuelDisplay, fuelSurface);
      }
      if (fuelFiller >= 2) {
        addBox(out, 0.12, 0.815, -0.66, 0.050, 0.042, 0.085, [0.12, 0.12, 0.14], SURFACES.carbon);
        addBox(out, 0.12, 0.845, -0.66, 0.034, 0.022, 0.055, fuelDisplay, fuelSurface);
        addBox(out, -0.02, 0.895, -0.50, 0.020, 0.075, 0.020, fuelDisplay, fuelSurface);   // breather standpipe
      }
      if (fuelStyle.line) {
        const lineRear = anchors.coverAt(-1.30);
        addSpan(out,
          { z: -0.56, x: 0.12, y: 0.80, w: 0.018 * fuelStyle.line, h: 0.018 },
          { z: -1.30, x: lineRear.x * 0.72, y: lineRear.top - 0.15,
            w: 0.015 * fuelStyle.line, h: 0.015 },
          fuelDisplay, null, fuelSurface);
      }
    }

    // SPONSOR BOARD. The titleA wordmark is podDecal(R.titleA, 0.32, 0.80), so
    // the board must cover yFrac 0.32..0.80 — centre 0.56, height 0.48 x pod
    // height (the fracH=true call below). A board shorter than its decal spills
    // the glyph tops and tails onto the body paint, forcing one ink to serve a
    // pale board and the paint at once — which is why 70% of liveries once fell
    // back to a halo; the fractional sizing keeps the mark WHOLLY on the board
    // at every station so liverytex can ink it for that one colour.
    // Sized in POD FRACTIONS so each band tracks the taper and nothing overlaps:
    // the accent band holds the strip (yFrac 0.08..0.30), the board holds titleA
    // (0.32..0.80), and the accentC flash below sits at 0.88 with its lower edge
    // no deeper than 0.8195 at any station. Clean gaps at every station.
    addPodFlankSpan(0.46, -0.34, 0.56, 0.48, PANEL, null, 0.008, true);
    // Lower accent band. The `strip` decal (yFrac 0.08..0.30) crosses this, so
    // liverytex counts c2 among that region's backgrounds.
    addPodFlankSpan(0.46, -0.34, 0.19, 0.22, c2, null, 0.008, true);

    // ERS: a color-coded ENERGY-CELL CONDUIT sweeping up from the sidepod shoulder
    // onto the engine-cover flank. The number of cells + a battery-pack bulge grow with the pack spec, so every
    // ERS choice reads distinctly at a glance (the old thin strip was too subtle).
    // Runs ABOVE the sponsor band (titleA y 0.19–0.45) so it never washes the wordmark.
    const ersLed = ersStyle ? ersStyle.led : (tier("ers") === 2 ? ersC2 : null);
    const ersPack = ersStyle ? ersStyle.pack : 1.0;
    if (ersLed) {
      // ERS conduit tucked into the coke-bottle shoulder at the sidepod rear.
      const half = 0.16 + (ersPack - 0.9) * 0.09;
      const ersGlow = ersLed.map((value) => Math.min(value, 1));
      addPodFlankSpan(podGeom.conduit.z + half + 0.025, podGeom.conduit.z - half - 0.025,
                      0.91, 0.06, [0.03, 0.03, 0.04], SURFACES.carbon, 0.018);
      addPodFlankSpan(podGeom.conduit.z + half, podGeom.conduit.z - half,
                      0.97, 0.03, ersGlow, SURFACES.metal, 0.025);
      const cells = Math.max(1, Math.min(8, Math.round(ersStyle.cells || 3)));
      for (const side of [-1, 1]) for (let i = 0; i < cells; i++) {
        const z = podGeom.conduit.z + half - (i + 0.5) * (half * 2 / cells);
        const p = anchors.podAt(z);
        addBox(out, side*(p.x + 0.032), p.top + 0.006, z,
          0.016, 0.032, Math.max(0.025, half * 1.5 / cells),
          ersGlow, SURFACES.metal);
      }
      // External high-voltage CONDUIT (`conduit`, 0..2): a glowing run carried on
      // the engine-cover flank from the pack back to the MGU-K, with junction
      // nodes at 2. Reads as visible hybrid plumbing from the chase camera and
      // glows through the night emissive path like the cell strip above.
      const ersConduit = Math.max(0, Math.min(2, Math.round(ersStyle.conduit || 0)));
      if (ersConduit > 0 && !ckpt) {
        const cf = anchors.coverAt(-0.72), cr = anchors.coverAt(-1.66);
        for (const side of [-1, 1]) {
          addSpan(out,
            { z: cf.z, x: side*(cf.x + 0.014), y: cf.top - 0.07, w: 0.016, h: 0.022 },
            { z: cr.z, x: side*(cr.x + 0.014), y: cr.top - 0.05, w: 0.014, h: 0.018 },
            ersGlow, null, SURFACES.metal);
          if (ersConduit >= 2) for (let i = 0; i < 3; i++) {
            const z = -0.86 - i * 0.30, p = anchors.coverAt(z);
            addBox(out, side*(p.x + 0.020), p.top - 0.062, z, 0.026, 0.038, 0.048,
              [0.10, 0.10, 0.12], SURFACES.carbon);
          }
        }
      }
    }

    part("bodyDetail");
    // --- 2026 bodywork detailing: a recessed radiator inlet mouth punched into
    // the sidepod front (SHAPE varies per ENGINE_STYLE.inlet), and a row of
    // little floor-edge fences — the fiddly ground-effect furniture that reads
    // as a modern car. ---
    const engInlet = engStyle && engStyle.inlet != null ? engStyle.inlet
                   : (tier("engine") === 2 ? 2 : tier("engine") === 0 ? 0 : 1);
    for (const s of [-1, 1]) {
      const inlet = podGeom.inlet;
      // Inlet mouth: 0 slim letterbox · 1 stock rounded · 2 wide high-flow scoop ·
      // 3 tall twin-nostril. All punched at the same pod-front location.
      if (engInlet === 0) {
        addBox(out, s*inlet.x, inlet.y, inlet.z, inlet.width * 0.75, inlet.height * 0.38, 0.05, INTAKE);
      } else if (engInlet === 2) {
        addBox(out, s*inlet.x, inlet.y, inlet.z + 0.005, inlet.width * 0.92, inlet.height * 0.82, 0.06, INTAKE);
        addBox(out, s*inlet.x, inlet.y, inlet.z + 0.023, inlet.width * 0.84, inlet.height * 0.62, 0.03, DARK);
      } else if (engInlet === 3) {
        for (const dx of [-1, 1])
          addBox(out, s*(inlet.x + dx*inlet.width*0.22), inlet.y, inlet.z + 0.003,
                 inlet.width * 0.34, inlet.height * 0.88, 0.06, INTAKE);
      } else {
        addBox(out, s*inlet.x, inlet.y, inlet.z, inlet.width * 0.70, inlet.height * 0.68, 0.05, INTAKE);
      }
      // FLOOR furniture hangs off the VISIBLE floor-edge line — the same span the
      // aero floorEdge draws above — NOT the sidepod bottom. Anchored to the pod
      // it sat under the bodywork overhang, so a floor package changed nothing a
      // player could ever see; every piece here now breaks the car's outline.
      const fenceN = Math.max(0, Math.min(6, Math.round(floorStyle.fences)));
      const fenceH = Math.max(0.6, Math.min(1.6, floorStyle.fenceH));
      for (let i = 0; i < fenceN; i++) {
        const fz = 0.42 - i * 0.36;
        const ex = floorEdgeAt(fz);
        // A swept blade standing up and OUTBOARD of the edge, tall enough that
        // its crown clears the edge span and reads from a 3/4 camera.
        addSpan(out,
          { z: fz + 0.075, x: s * (ex + 0.012), y: 0.140 + rideDY + 0.048 * fenceH,
            w: 0.016, h: 0.095 * fenceH },
          { z: fz - 0.075, x: s * (ex + 0.034), y: 0.156 + rideDY + 0.052 * fenceH,
            w: 0.013, h: 0.105 * fenceH },
          CARBON);
      }
      // Floor EDGE WING: a chord extending past the floor edge, so the package
      // changes the car's silhouette in plan view. Painted in the livery accent
      // — the shape only reads if it is not another black-on-black detail.
      const edgeLip = Math.max(0, Math.min(1, floorStyle.edgeLip || 0));
      if (edgeLip > 0) {
        const ef = floorEdgeAt(0.50), er = floorEdgeAt(-1.10);
        addSpan(out,
          { z: 0.50, x: s * (ef + 0.028 + 0.050 * edgeLip), y: 0.122 + rideDY,
            w: 0.050 + 0.070 * edgeLip, h: 0.016 },
          { z: -1.10, x: s * (er + 0.028 + 0.050 * edgeLip), y: 0.148 + rideDY,
            w: 0.040 + 0.060 * edgeLip, h: 0.014 },
          accentC, null, SURFACES.paint);
      }
      // Titanium skid blocks, moved OUTBOARD onto the floor edge underside: a
      // bright metal strip under the dark floor, which is what actually catches
      // the light (and the sparks) at a low camera angle.
      const skids = Math.max(0, Math.min(2, Math.round(floorStyle.skid || 0)));
      for (let i = 0; i < skids; i++) {
        const sz = 0.30 - i * 1.10;
        addBox(out, s * (floorEdgeAt(sz) - 0.11), 0.056 + rideDY, sz, 0.17, 0.018, 0.30,
               [0.62, 0.60, 0.56], SURFACES.metal);
      }
    }
    // --- Sidepod cooling CHIMNEYS (engine recipe `chimney`, 0..3): squat stacks
    // standing proud of the pod shoulder, each capped by a dark exit slot. The
    // classic "we are running hot" tell, and the clearest way to read a
    // cooling-led power unit apart from a sealed one at a glance. Anchored on
    // podAt() so they ride whatever bodywork the engine recipe lofted. ---
    const engChimney = Math.max(0, Math.min(3, Math.round(engStyle.chimney || 0)));
    for (const s of [-1, 1]) for (let i = 0; i < engChimney; i++) {
      const z = -0.16 - i * 0.30, p = anchors.podAt(z);
      const cx = s * Math.max(0.16, p.x - 0.055);
      addBox(out, cx, p.top + 0.040, z, 0.060, 0.080, 0.105, CARBON);            // stack
      addBox(out, cx, p.top + 0.084, z - 0.010, 0.048, 0.014, 0.078, INTAKE);    // exit slot
    }

    part("livery");
    // --- Livery accents: nose stripe + airbox spine stripe (team colour 2) ---
    const noseAccentRear = anchors.noseAt(1.60), noseAccentFront = anchors.noseAt(2.66);
    addLoft(out, 1.60, 0, noseAccentRear.top + 0.008, 0.09, 0.016,
           2.66, 0, noseAccentFront.top + 0.008, 0.05, 0.014, c2);
    addBox(out, 0, 0.862, -0.42, 0.06, 0.04, 0.52, c2);

    // --- Extra paint detail: thin livery-ACCENT flashes (accentC, falls back to
    // c2). Subtle strips of "paint" that catch the light without adding mass: a
    // flash along each nose flank and a slim flash along each sidepod shoulder. ---
    for (const s of [-1, 1]) {
      const nf = anchors.noseAt(2.575), nr = anchors.noseAt(2.025);
      addSpan(out,
        { z: nf.z, x: s*(nf.side + 0.006), y: (nf.bottom + nf.top) * 0.5, w: 0.012, h: 0.040 },
        { z: nr.z, x: s*(nr.side + 0.006), y: (nr.bottom + nr.top) * 0.5, w: 0.012, h: 0.040 },
        accentC);
    }
    addPodFlankSpan(0.425, -0.025, 0.88, 0.035, accentC, SURFACES.paint, 0.012);

    // --- BODY stripe (livery.stripe): a bold contrasting band down the car's
    // full spine — nose tip → nose → monocoque → hood crest, then (past the
    // open cockpit) airbox → engine-cover ridge to the tail. Previously four
    // DISCONNECTED segments (it stopped 0.45 m short of the tip, skipped the
    // monocoque entirely, and the flat hood band floated above the sloping
    // deck); now each piece is a crown-following loft that meets the next, so
    // the stripe reads continuous from every camera. Only the cockpit opening
    // legitimately interrupts it. ---
    const stripeC = liv.stripe || null;
    // Nose TIP z moves per team (TEAM_STYLE.noseTipZ, ±0.10): the cap and both
    // stripes must end at the STYLED tip, not the shared 3.18 datum, or the
    // paint floats past a short nose (haas) / stops short of a long one
    // (williams). anchors.noseAt clamps y/w beyond the tip station, so only
    // the z endpoints need deriving.
    const styledTipZ = styledNoseStations(teamStyle)[0].z;
    const stripeTipZ = styledTipZ - 0.04;
    if (stripeC) {
      const ns314 = anchors.noseAt(stripeTipZ), ns270 = anchors.noseAt(2.70);
      const ns155 = anchors.noseAt(1.55), ns105 = anchors.noseAt(1.05);
      addLoft(out, 2.70, 0, ns270.top + 0.012, 0.075, 0.014,
             stripeTipZ, 0, ns314.top + 0.012, 0.040, 0.012, stripeC);
      addLoft(out, 1.55, 0, ns155.top + 0.012, 0.13, 0.016,
             2.70, 0, ns270.top + 0.012, 0.075, 0.014, stripeC);
      addLoft(out, 1.05, 0, ns105.top + 0.012, 0.12, 0.016,
             1.55, 0, ns155.top + 0.012, 0.13, 0.016, stripeC);
      addLoft(out, 0.05, 0, 0.655, 0.12, 0.022, 1.05, 0, 0.545, 0.13, 0.022, stripeC);   // monocoque → hood crest
      addBox(out, 0, 0.872, -0.42, 0.08, 0.02, 0.56, stripeC);  // airbox spine band
      if (!ckpt) {
        addLoft(out, -0.94, 0, 0.775, 0.075, 0.02, -0.70, 0, 0.868, 0.08, 0.02, stripeC); // airbox → cover ridge drop
        addLoft(out, -1.95, 0, 0.600, 0.060, 0.02, -0.94, 0, 0.775, 0.075, 0.02, stripeC); // engine-cover ridge run to the tail
      }
    }
    // --- NOSE stripe (livery.noseStripe): a classic painted band running the
    // nose crown ONLY — very tip → bulkhead — independent of the full-length
    // body stripe. Sits a hair prouder (+0.004 y) and slightly narrower than
    // the body stripe's nose section, so specifying BOTH layers the nose band
    // crisply on top instead of z-fighting. ---
    const noseStripeC = liv.noseStripe || null;
    if (noseStripeC) {
      const ns155 = anchors.noseAt(1.55), ns270 = anchors.noseAt(2.70), ns314 = anchors.noseAt(stripeTipZ);
      addLoft(out, 1.55, 0, ns155.top + 0.016, 0.115, 0.014,
             2.70, 0, ns270.top + 0.016, 0.064, 0.012, noseStripeC);
      addLoft(out, 2.70, 0, ns270.top + 0.016, 0.064, 0.012,
             stripeTipZ, 0, ns314.top + 0.016, 0.036, 0.010, noseStripeC);
    }

    // --- Livery `nose` tip cap: a painted band wrapping the slim nose tip, sitting
    // fractionally proud of the nose wedge so it reads as a distinct-colour nose
    // cone (a staple real-F1 livery element). Only when the livery specifies it. ---
    if (noseC) {
      const capRearZ = styledTipZ - 0.38;
      const nt = anchors.noseAt(styledTipZ), nb = anchors.noseAt(capRearZ);
      addSpan(out, { z: styledTipZ + 0.005, y: (nt.bottom + nt.top) * 0.5, w: nt.side*2 + 0.010,
                     h: nt.top - nt.bottom + 0.010, t: 0.70 },
                   { z: capRearZ, y: (nb.bottom + nb.top) * 0.5, w: nb.side*2 + 0.010,
                     h: nb.top - nb.bottom + 0.010, t: 0.86 }, noseC);
    }
    // --- Livery `pod` panel: a bold contrasting block on each sidepod flank,
    // forward of the sponsor board, for the two-tone sidepod look many liveries
    // carry. Proud of the pod skin so it never z-fights. Only when specified. ---
    // Proud 0.006 keeps the pod panel UNDER the sponsor board (0.008): a board is
    // applied over the paint, not buried by it. At 0.016 the panel sat proud of
    // the board and covered it, so on every pod-set livery the sidepod wordmark
    // was actually sitting on the pod colour while being inked for the board.
    if (podC) addPodFlankSpan(0.45, 0.11, 0.60, 0.22, podC, SURFACES.paint, 0.006);

    // --- Nose number deck: a flat base-paint panel raised proud of the nose
    // crown, carrying the driver-number TEXTURE decal (see carDecalData). Base
    // colour so the decal's own backing/keyline defines it. + a camera pod. ---
    const deckF = anchors.noseAt(2.15), deckR = anchors.noseAt(1.69);
    addLoft(out, deckR.z, 0, deckR.top + 0.010, Math.min(0.28, deckR.topSide*1.75), 0.018,
           deckF.z, 0, deckF.top + 0.010, Math.min(0.28, deckF.topSide*1.75), 0.018, c1);
    const camPod = anchors.noseAt(1.55);
    addBox(out, 0, camPod.top + 0.045, 1.55, 0.06, 0.08, 0.15, DARK);

    part("cockpit");
    // --- Cockpit opening (dark) + halo + front pillar ---
    addBox(out, 0, 0.60, 0.12, 0.40, 0.045, 0.78, [0.04, 0.04, 0.05], SURFACES.carbon);
    for (const s of [-1, 1]) {
      addLoft(out, -0.15, s*0.27, 0.74, 0.06, 0.06,
               0.62,     0,      0.70, 0.06, 0.06, DARK);
    }
    addBox(out, 0, 0.74, -0.18, 0.60, 0.06, 0.07, DARK); // rear hoop
    addBox(out, 0, 0.60,  0.62, 0.05, 0.20, 0.05, DARK); // front pillar
    // COCKPIT recipe. haloBlade fairs the hoop into an aero section, haloWing
    // adds the upper flap, camPods sets the T-cam count, screen adds the
    // deflector ahead of the opening. All zero = the shipped cockpit.
    const haloBlade = Math.max(0, Math.min(2, Math.round(cockpitStyle.haloBlade || 0)));
    if (haloBlade > 0) {
      const bw = haloBlade === 2 ? 0.055 : 0.034;
      for (const s of [-1, 1]) {
        addLoft(out, -0.15, s * 0.27, 0.775, bw, 0.016,
                 0.62, 0, 0.735, bw * 0.7, 0.014, haloTint || HALO, SURFACES.metal);
      }
    }
    if (cockpitStyle.haloWing) {
      addBox(out, 0, 0.805, 0.10, 0.30, 0.014, 0.11, haloTint || HALO, SURFACES.metal);
    }
    const camPods = Math.max(0, Math.min(2, Math.round(cockpitStyle.camPods || 0)));
    for (let i = 0; i < camPods; i++) {
      const s = i === 0 ? -1 : 1;
      addBox(out, s * 0.13, 0.795, -0.16, 0.045, 0.038, 0.075, DARK);
      addBox(out, s * 0.13, 0.795, -0.125, 0.026, 0.022, 0.012, VISOR, SURFACES.glass);
    }
    if (cockpitStyle.screen) {
      addLoft(out, 0.50, 0, 0.665, 0.34, 0.030, 0.66, 0, 0.700, 0.24, 0.026, DARK);
    }

    part("mirrors");
    // --- Side mirrors ---. In cockpit view they're moved FORWARD (ahead of the eye at z0.32)
    // and out on longer stalks so they read at the sides of the onboard frame
    // like real F1 wing mirrors; the chase build keeps the tucked position.
    // Team mirror style: 1 = swept-wide (housing pushed outboard, wider and
    // shorter), 2 = low-slung (dropped toward the pod shoulder). The cockpit
    // build keeps the proven onboard framing regardless of style.
    const mSty = ckpt ? 0 : teamStyle.mirror;
    const mz = ckpt ? 0.62 : 0.24;
    const mx = (ckpt ? 0.44 : 0.34) + (mSty === 1 ? 0.035 : 0);
    const msx = ckpt ? 0.40 : 0.30;
    const mY = 0.735 + (mSty === 2 ? -0.032 : 0);
    const mH = mSty === 1 ? 0.125 : 0.155;   // swept style: wider, shorter housing
    const mW = mSty === 1 ? 0.042 : 0.032;
    for (const s of [-1, 1]) {
      // Tapered aero arm (wide at the tub, narrow at the housing) instead of a
      // flat box — real F1 mirror stalks are swept aero elements, not a plain post.
      const xi = s * (msx - 0.04), xo = s * mx;
      const aY = mY - 0.735;   // style drop carries into the stalk too
      addBlock(out, [
        [xi, 0.68 + aY, mz - 0.045], [xi, 0.68 + aY, mz + 0.045], [xi, 0.72 + aY, mz + 0.045], [xi, 0.72 + aY, mz - 0.045],
        [xo, 0.71 + aY, mz - 0.02],  [xo, 0.71 + aY, mz + 0.02],  [xo, 0.74 + aY, mz + 0.02],  [xo, 0.74 + aY, mz - 0.02],
      ], DARK);
      addBox(out, s*mx, mY, mz, mW, mH, 0.115, [0.09, 0.09, 0.11], SURFACES.carbon); // cleaner dark carbon housing
      addBox(out, s*mx, mY, mz + 0.062, 0.020, mH * 0.87, 0.024, [0.10, 0.11, 0.14], SURFACES.glass); // glass bezel / surround
      addBox(out, s*mx, mY, mz + 0.066, 0.024, mH * 0.70, 0.018, [0.46, 0.56, 0.78], SURFACES.glass); // brighter blue reflective glass
    }

    part("helmet");
    // --- Driver helmet: smooth dome + visor + crown stripe ---
    // Skipped for the first-person cockpit body (opts.noDriver): the camera
    // sits where the driver's head is.
    if (!(opts && opts.noDriver)) {
      // Per-driver helmet: dome carries a crown stripe + a nose flash in the
      // driver's own accent colour (indexed by car number), so team-mates and
      // the field look distinct rather than all wearing the team colour.
      const helmC = (opts && opts.num != null) ? HELMET_ACCENT[((opts.num % HELMET_ACCENT.length) + HELMET_ACCENT.length) % HELMET_ACCENT.length] : c2;
      addDome(out, 0, 0.585, -0.08, 0.145, c1);
      addBox(out, 0, 0.64, 0.05, 0.20, 0.075, 0.045, VISOR);  // visor band
      addBox(out, 0, 0.715, -0.09, 0.10, 0.026, 0.17, helmC); // crown stripe (driver accent)
      addBox(out, 0, 0.60, 0.11, 0.11, 0.05, 0.02, helmC);    // nose flash
    }

    // --- Airbox intake above the roll hoop (dark void) ---
    addBox(out, 0, 0.76, -0.24, 0.15, 0.09, 0.13, INTAKE);

    // --- T-cam mast above the airbox (the broadcast camera "T") ---
    // Skipped in the cockpit body: it sits right at the driver's eye height
    // 0.25 m behind the camera, and any camera transient turned it into a
    // giant black rectangle filling the frame.
    if (!(opts && opts.noDriver)) {
      addBox(out, 0, 0.885, -0.30, 0.035, 0.09, 0.035, DARK);   // stalk
      addBox(out, 0, 0.955, -0.30, 0.30, 0.055, 0.06, DARK);    // T bar
      addBox(out, 0, 0.988, -0.30, 0.03, 0.02, 0.03, [0.12, 0.75, 0.28], SURFACES.paint);
    }

    part("halo");
    // --- Halo: the titanium cockpit-protection hoop (defining modern-F1 read).
    // A central front pillar rising off the chassis, then two tubular arms
    // arcing up-and-out over the driver and sweeping back down to the collar.
    // Chase/AI only — the first-person cockpit body (ckpt) has its own framing. ---
    if (!ckpt) {
      const haloC = haloTint || HALO;   // livery-tinted hoop, else brushed titanium
      addBox(out, 0, 0.665, 0.47, 0.035, 0.27, 0.05, haloC, SURFACES.metal);   // front centre pillar — tall enough to meet the front arc's base (y 0.7875) instead of stopping 5.8cm short
      for (const s of [-1, 1]) {
        addSpan(out, { z: 0.49, x: 0,       y: 0.815, w: 0.055, h: 0.055 },
                     { z: 0.02, x: s*0.30,  y: 0.845, w: 0.050, h: 0.050 }, haloC, null, SURFACES.metal);  // front arc
        addSpan(out, { z: 0.02, x: s*0.30,  y: 0.845, w: 0.050, h: 0.050 },
                     { z: -0.46, x: s*0.235, y: 0.505, w: 0.050, h: 0.050 }, haloC, null, SURFACES.metal); // rear arc to collar
      }
    }

    part("exhaust");
    // --- Exhaust outlet poking from the tail cap --- per ENGINE option: a lone
    // slim pipe at low spec, a fat central tailpipe flanked by two extra tips
    // for engine recipes with the `twin` flag.
    // The EXHAUST recipe owns the tailpipe; `pipes` null defers to the engine's
    // own plumbing so a car with no exhaust part fitted is unchanged.
    const exhTwin = exhStyle.pipes != null ? exhStyle.pipes >= 3
      : (engStyle ? !!engStyle.twin : tier("engine") === 2);
    const exhBore = Math.max(0.7, Math.min(1.5, exhStyle.bore));
    const exhR = (engStyle ? (engStyle.twin ? 0.09 : (engStyle.in < 0.9 ? 0.05 : 0.07))
                          : (tier("engine") === 0 ? 0.05 : tier("engine") === 2 ? 0.09 : 0.07)) * exhBore;
    addBox(out, 0, 0.40, -2.12, exhR, exhR, 0.16, [0.16, 0.16, 0.17], SURFACES.metal);
    // Megaphone flare: the bore opens out over the last few centimetres.
    const exhFlare = Math.max(0, Math.min(1, exhStyle.flare || 0));
    if (exhFlare > 0) {
      addLoft(out, -2.16, 0, 0.40, exhR * 2, exhR * 2,
              -2.23, 0, 0.40, exhR * 2 * (1 + 0.55 * exhFlare), exhR * 2 * (1 + 0.55 * exhFlare),
              [0.18, 0.18, 0.19], SURFACES.metal);
    }
    // Heat wrap: a pale bandage band around the primary, just ahead of the tip.
    if (exhStyle.wrap) {
      addBox(out, 0, 0.40, -2.04, exhR * 1.18, exhR * 1.18, 0.06,
             [0.72, 0.70, 0.66], SURFACES.panel);
    }
    // Wastegate stacks: short pipes venting up and out above the primary.
    const exhGates = Math.max(0, Math.min(2, Math.round(exhStyle.wastegate || 0)));
    for (let i = 0; i < exhGates; i++) {
      const s = i === 0 ? -1 : 1;
      addSpan(out, { z: -2.02, x: s * 0.075, y: 0.47, w: 0.036, h: 0.036 },
                   { z: -2.16, x: s * 0.095, y: 0.53, w: 0.030, h: 0.030 },
              [0.20, 0.20, 0.22], null, SURFACES.metal);
    }
    // Heat-glazed tailpipe mouth: a dark bore tinted by the fuel blend; transient
    // after-fire is rendered separately from live throttle state.
    // signature colour (green biofuel, violet quali mix, …), read racing behind it.
    const fuelFlame = fuelStyle && fuelStyle.flame || [1.15, 0.42, 0.14];
    const fTwin = [fuelFlame[0]*0.9, fuelFlame[1]*0.9, fuelFlame[2]*0.9];
    addBox(out, 0, 0.40, -2.185, exhR*0.72, exhR*0.72, 0.03, [0.05, 0.04, 0.04], SURFACES.carbon);
    addBox(out, 0, 0.40, -2.198, exhR*0.55, exhR*0.55, 0.012,
           fuelFlame.map((value) => Math.min(value * 0.45, 0.65)), SURFACES.metal);
    if (exhTwin) {
      for (const s of [-1, 1]) {
        addBox(out, s*0.15, 0.40, -2.10, 0.045, 0.045, 0.14, [0.16, 0.16, 0.17], SURFACES.metal);
        addBox(out, s*0.15, 0.40, -2.172, 0.026, 0.026, 0.012,
               fTwin.map((value) => Math.min(value * 0.45, 0.65)), SURFACES.metal);
      }
    }

    part("sharkFin");
    // --- Shark fin (team accent colour) --- a swept aero surface, not a flat
    // plank: long raked leading edge (base front z-0.65 → top front z-1.15, a
    // 0.50 m rake) tapering to a near-vertical trailing edge (only 0.05 m rake),
    // the real-F1 fin profile. The base hugs the engine-cover's ridge line (it
    // tapers from y0.83 at z-0.55 to y0.59 at z-2.00) so it reads as grown out
    // of the cover instead of resting flat on top of it. Behind the driver —
    // skipped in the cockpit build.
    if (!ckpt) {
      const fb = FIN.halfBase, ft = FIN.halfTop;
      addBlock(out, [
        [-fb, FIN.baseLE[1], FIN.baseLE[0]], [fb, FIN.baseLE[1], FIN.baseLE[0]],
        [ft, FIN.topLE[1], FIN.topLE[0]],    [-ft, FIN.topLE[1], FIN.topLE[0]],
        [-fb, FIN.baseTE[1], FIN.baseTE[0]], [fb, FIN.baseTE[1], FIN.baseTE[0]],
        [ft, FIN.topTE[1], FIN.topTE[0]],    [-ft, FIN.topTE[1], FIN.topTE[0]],
      ], finC);
    }

    // --- Driver number: now a TEXTURE decal on the nose-top plate (see
    // carDecalData / the nose number plate below), not blocky 7-seg geometry —
    // so it reads sharply and shows from the chase, hood AND cockpit cameras. ---

    part("sponsorBoard");
    // --- Sponsor board on the sidepod flank + a base-paint NUMBER BOARD on each
    // Downforce level 0..4 — resolved up here (before the number board) so the
    // board tracks the rear-wing endplate for THIS aero setup. Per-option when
    // the aero id is known, else mapped from the coarse 0/1/2 tier (AI / no
    // parts → medium, lvl 2). See endplateGeom / numberBoard (single source of
    // truth, shared with the game.js number decal via Car3D.*).
    const aeroT = tier("aero");
    const aLvl = aeroStyle && aeroStyle.lvl != null
      ? aeroStyle.lvl : (aeroT === 0 ? 0 : aeroT === 2 ? 4 : 2);
    // Everything buildComplete() needs to merge the moveable elements back in,
    // taken from the values THIS build resolved rather than re-derived.
    out.flapInfo = { aLvl, style: aeroStyle, col: wingC };

    // rear-wing endplate driver-number BOARD — placed by numberBoard(aLvl) so it
    // sits low on the plate at every downforce level (the game.js number decal
    // reads the SAME function, so the digit lands exactly on this board). ---
    const nb = numberBoard(aLvl);
    for (const s of [-1, 1]) {
      // (The short PANEL box that used to sit here was a SECOND sponsor board,
      // overlapping the flank span above at a different height and z range — two
      // pale panels fighting for the same wordmark. The span is the board now.)
      addBox(out, s*0.527, nb.cy, -2.42, 0.012, nb.h, 0.30, c1);
    }

    part("frontWing");
    // --- Front wing: ANGLED wedge elements in the block language — thin
    // leading edges rising to thicker trailing edges (real attack angle),
    // swept endplates that grow rearward, and nose pylons so the wing hangs
    // from the nose instead of floating. AERO visualTier reshapes element
    // count / endplate size / dive-plane reach (tier 1 = today's baseline). ---
    const aBeam = aeroStyle ? (aeroStyle.beam || 0) : (aeroT === 2 ? 1 : 0);
    const aDrs  = aeroStyle ? (aeroStyle.drs  || 0) : 0;
    const frontSweep = Math.max(-0.08, Math.min(0.22, aeroStyle.frontSweep));
    const frontTaper = Math.max(0.72, Math.min(1.08, aeroStyle.frontTaper));
    const frontRise = Math.max(-0.03, Math.min(0.16, aeroStyle.frontRise));

    // Front wing: a multi-element CASCADE — a wide, near-flat structural main
    // plane plus a stack of progressively larger flap elements, each a thin wedge
    // (low/forward leading edge → higher/rearward trailing edge = attack angle)
    // separated by a visible slot gap. The outer thirds sweep UP boldly into tall
    // arched endplates that flick outboard (2026-style outwash). Element count +
    // span + endplate/canard size grow with aLvl. Half-span reaches fwHalf.
    const fwHalf = frontHalf(aLvl);               // half-span (endplate sits just outside)
    // Element table lives in frontCascade() so the ACTIVE-AERO code and this
    // build agree by construction. The top FW_MOVEABLE flaps are NOT baked —
    // drawAeroFlaps() draws them so they can rotate (see aeroFlapsGeom).
    const fwElems = frontCascade(aLvl);
    const fwBaked = frontBakedCount(aLvl);
    for (let i = 0; i < fwBaked; i++) {
      const e = fwElems[i], half = fwHalf * e[4];
      addWingFoil(out, {
        zLead: e[0], yLead: e[1], zTrail: e[2], yTrail: e[3],
        half, thick: e[5], taper: frontTaper,
        sweep: frontSweep * (0.75 + i * 0.10),
        rise: frontRise * (0.65 + i * 0.12),
        attachHalf: fwHalf + 0.03,
      }, i === 0 ? c1 : wingC, SURFACES.paint);
    }
    // The bold outboard upsweep is emitted with the TOP element instead (see
    // aeroFlapsGeom's `upsweep`), because that element is ACTIVE AERO: the kick
    // is part of the flap and has to rotate with it.
    // Endplate PROFILE (`plate`): 0 slim low-drag fence · 1 the shipped outwash
    // flick · 2 a tall arched footplate with a bridging spar over its crown. The
    // front wing is the first thing a chase camera sees, so this is the loudest
    // single-knob silhouette change in the aero package.
    const aPlate = Math.max(0, Math.min(2, Math.round(
      aeroStyle.plate != null ? aeroStyle.plate : 1)));
    const PLATE = [
      { hF: 0.16, hR: 0.30, kick: 0.020, footW: 0.09, footZ: 0.46, arch: 0 },
      { hF: 0.22, hR: 0.40, kick: 0.060, footW: 0.13, footZ: 0.54, arch: 0 },
      { hF: 0.30, hR: 0.54, kick: 0.100, footW: 0.19, footZ: 0.62, arch: 1 },
    ][aPlate];
    // Cascade winglet count on the endplate outer face. A recipe may set it
    // outright; otherwise it falls back to the downforce-level map that shipped.
    const aCasc = Math.max(0, Math.min(3, Math.round(aeroStyle.casc != null ? aeroStyle.casc
      : (aLvl >= 4 ? 3 : (aLvl >= 3 ? 2 : (aLvl >= 1 ? 1 : 0))))));
    for (const s of [-1, 1]) {
      const epW = aLvl >= 4 ? 0.060 : (aLvl <= 0 ? 0.028 : 0.044);
      const epX = s * (fwHalf + 0.03);
      // Main endplate: a swept plate rising up-and-outboard (the outwash flick) —
      // moderated in height so it reads as a real 3-D structure without towering
      // over the wing (it was ~1.5× too tall and looked detached from the plane).
      addSpan(out, { z: 2.66, x: epX,                 y: 0.135, w: epW, h: PLATE.hF },
                   { z: 1.98, x: epX + s*PLATE.kick,  y: 0.245, w: epW, h: PLATE.hR }, c2);
      // Footplate: the horizontal "foot" kicking outward along the endplate base
      // (the ground-effect seal that reads as a real front-wing foot).
      addBox(out, epX + s*(PLATE.footW * 0.23), 0.050, 2.30, PLATE.footW, 0.016, PLATE.footZ, c1);
      // Tall-plate variant carries a bridging spar across the crown, tying the
      // top of the arch back to the outer flap tip.
      if (PLATE.arch) {
        addSpan(out, { z: 2.60, x: epX + s*0.012, y: 0.135 + PLATE.hF * 0.5 + 0.010, w: 0.030, h: 0.018 },
                     { z: 2.06, x: epX + s*(PLATE.kick + 0.012), y: 0.245 + PLATE.hR * 0.5 + 0.010, w: 0.026, h: 0.016 }, c1);
      }
      // Canard / dive-plane cascade on the outer face of the endplate.
      const nCan = aCasc;
      for (let i = 0; i < nCan; i++) {
        const cz = 2.52 - i * 0.18, cy = 0.170 + i * 0.058;
        addSpan(out, { z: cz,        x: s * (fwHalf - 0.03), y: cy,         w: 0.030, h: 0.12 },
                     { z: cz - 0.22, x: epX + s*0.05,        y: cy + 0.070, w: 0.030, h: 0.18 }, c1);
      }
      addBox(out, s*0.10, 0.19, 2.46, 0.055, 0.20, 0.17, c1);                 // nose pylon
    }

    // Bargeboard / turning-vane cluster ahead of the sidepods — per-OPTION
    // silhouette via AERO_STYLE.vane (0 none · 1 single fence · 2 twin fences ·
    // 3 curved triple cascade). Chase view only. Falls back to a level-mapped
    // vane count when the aero id is unknown.
    const aVane = aeroStyle && aeroStyle.vane != null ? aeroStyle.vane
                : (aLvl >= 4 ? 3 : aLvl >= 3 ? 2 : aLvl >= 1 ? 1 : 0);
    if (!ckpt && aVane > 0) {
      for (const s of [-1, 1]) {
        // Primary vane — always present.
        addBox(out, s*0.73, 0.30, 0.98, 0.02, 0.22, 0.34, CARBON);
        if (aVane >= 2) addBox(out, s*0.66, 0.26, 0.72, 0.02, 0.17, 0.30, CARBON);  // inner fence
        if (aVane >= 3) {
          // Curved triple cascade: a swept forward vane + a canted footplate vane.
          addSpan(out, { z: 1.28, x: s*0.70, y: 0.28, w: 0.02, h: 0.20 },
                       { z: 0.98, x: s*0.62, y: 0.24, w: 0.02, h: 0.26 }, CARBON);
          addBox(out, s*0.60, 0.19, 0.86, 0.16, 0.014, 0.36, CARBON);   // horizontal turning vane
        }
      }
    }

    part("rearAssembly");
    // --- Rear assembly: wing, DRS pod, rain light, diffuser, gearbox strakes,
    // rear brake ducts. ALL of it sits well behind the driver, so the cockpit
    // build (ckpt) skips the lot — like the airbox/engine cover above, nothing
    // behind the seat should exist in the first-person body, so no transform
    // edge case can ever swing rear bodywork across the onboard camera. ---
    if (!ckpt) {
      // --- Rear wing: the single biggest aero tell. Lift + endplate height scale
      // continuously with aLvl (lvl 0 = flat low-drag, lvl 4 = towering high-DF),
      // element count grows, high levels add a swan-neck flap + T-wing, `beam`
      // options add a beam wing, and `drs` options open a slotted top gap. ---
      const aN     = aLvl / 4;                  // 0..1 normalized downforce level
      const rwLift = (aLvl - 2) * 0.045;        // gentler vertical shift (beam-wing ref)
      // Concave (square-rootish) growth so the wing DOESN'T tower at high DF: both
      // the endplate height (epSY) and its vertical centre (epCY) rise quickly at
      // low DF then flatten toward max — aLvl4 lands only ~0.07 above aLvl2 (roll-
      // hoop / airbox level) instead of spiking a third higher than the car.
      // Shared with the number board + game.js decal (endplateGeom, above).
      const _ep    = endplateGeom(aLvl);
      const epSY   = _ep.sy;   // lvl0 0.28 → lvl2 0.47 → lvl4 0.58 (capped)
      const epCY   = _ep.cy;   // lvl0 0.60 → lvl2 0.72 → lvl4 0.80 (slow rise)
      // Tall SLIM swept endplates with a louvre cut-out cluster near the rear edge
      // and a painted team-color top rail along the crown.
      for (const s of [-1, 1]) {
        addSpan(out,
          { z: _ep.front.z, x: s*0.50, y: _ep.front.cy, w: 0.045, h: _ep.front.sy },
          { z: _ep.rear.z, x: s*0.50, y: _ep.rear.cy, w: 0.045, h: _ep.rear.sy },
          DARK);
        // Louvre detail: a stack of thin recessed slots near the top-rear corner.
        for (let i = 0; i < 4; i++)
          addBox(out, s*0.515, epCY + epSY*0.5 - 0.07 - i*0.06, -2.30, 0.018, 0.016, 0.18, INTAKE);
        addSpan(out,
          { z: _ep.front.z, x: s*0.50, y: _ep.front.top, w: 0.050, h: 0.022 },
          { z: _ep.rear.z, x: s*0.50, y: _ep.rear.top, w: 0.050, h: 0.022 },
          c2, null, SURFACES.paint);
      }
      // Clean swept two/three-element rear wing (leading edge low/forward →
      // trailing edge high/back). Main plane sits on the endplate centreline.
      const rearSweep = Math.max(-0.06, Math.min(0.20, aeroStyle.rearSweep));
      const rearTaper = Math.max(0.72, Math.min(1.08, aeroStyle.rearTaper));
      const crownY = _ep.rear.top - 0.018;
      // Reserve the crown slot for the max-DF/DRS element. Lower packages place
      // their top plane directly under the rail; taller stacks shift the regular
      // three planes down so every tip remains captured by the endplate.
      const upperTrailY = crownY - (aLvl >= 4 || aDrs ? 0.075 : 0);
      const rearWing = (zLead, yLead, zTrail, yTrail, half, thick, col, scale) =>
        addWingFoil(out, {
          zLead, yLead, zTrail, yTrail, half, thick,
          taper: rearTaper, sweep: rearSweep * (scale == null ? 1 : scale), rise: 0,
          attachHalf: 0.50,
        }, col, SURFACES.paint);
      rearWing(-2.30, upperTrailY - 0.270, -2.52, upperTrailY - 0.225,
        0.51, 0.032, c1, 0.8);
      // The middle plane is ACTIVE AERO as well — see aeroFlapsGeom's "rearMid".
      // Only the mainplane above stays baked, which is exactly the 2026 rule:
      // every rear element except the bottom mainplane rotates.
      // The TOP rear plane is ACTIVE AERO and is drawn by drawAeroFlaps(), not
      // baked here — see aeroFlapsGeom's "rear" entry, which reproduces exactly
      // the rearWing(-2.38, upperTrailY - 0.075, -2.64, upperTrailY, …) element
      // this line used to emit.
      // Wing mount. Default: slim pylons sweeping UP and BACK from the rear crash
      // structure to the underside of the main plane — this is what visually hangs
      // the wing off the car (previously the mount sat above the plane, so the
      // whole wing read as detached/floating). A central pylon reinforces it.
      // `swan` swaps in a true swan-neck yoke instead: the necks climb PAST the
      // main plane and hook back DOWN onto its upper surface, leaving the
      // pressure side clean — the real reason teams run the layout, and an
      // unmistakable tell from behind.
      const aSwan = aeroStyle && aeroStyle.swan ? 1 : 0;
      if (aSwan) {
        const mainTopY = upperTrailY - 0.225 + 0.016;
        for (const s of [-1, 1]) {
          addSpan(out, { z: -1.98, x: s*0.16, y: 0.46, w: 0.048, h: 0.13 },
                       { z: -2.26, x: s*0.16, y: mainTopY + 0.075, w: 0.036, h: 0.095 }, DARK);
          addSpan(out, { z: -2.26, x: s*0.16, y: mainTopY + 0.075, w: 0.036, h: 0.060 },
                       { z: -2.44, x: s*0.16, y: mainTopY + 0.012, w: 0.030, h: 0.048 }, DARK);
        }
      } else {
        for (const s of [-1, 1]) {
          addSpan(out, { z: -1.98, x: s*0.14, y: 0.46, w: 0.05, h: 0.13 },
                       { z: -2.34, x: s*0.14, y: epCY + 0.01, w: 0.042, h: 0.10 }, DARK);
        }
      }
      addSpan(out, { z: -1.96, x: 0, y: 0.44, w: 0.09, h: 0.14 },
                   { z: -2.36, x: 0, y: epCY, w: 0.07, h: 0.10 }, DARK);   // central spine mount
      // T-wing: shipped behaviour is "max DF and not DRS"; a recipe may request or
      // suppress it outright via `tvane` so mid-downforce packages can carry one.
      const aTvane = aeroStyle && aeroStyle.tvane != null
        ? (aeroStyle.tvane ? 1 : 0) : (aLvl >= 4 && !aDrs ? 1 : 0);
      // The extra proud top element of the max-DF look is ACTIVE AERO, drawn by
      // drawAeroFlaps() — see aeroFlapsGeom's "rearTop". Baking it here left the
      // highest plane on the car as the only one that could not move.
      if (aTvane) {
        addBox(out, 0, epCY + 0.20, -1.98, 0.34, 0.02, 0.09, c2);     // T-wing (tracks the lowered wing)
        // T-wing mount: a slim central pylon down to the engine-cover ridge — without
        // it the T-wing is a plank floating ~0.4m above the bodywork with nothing
        // visibly holding it up.
        addBox(out, 0, (0.56 + epCY + 0.19) / 2, -1.98, 0.03, epCY + 0.19 - 0.56, 0.025, DARK);
      }
      if (aBeam) {
        // Prominent beam wing slung low under the main plane, spanning the crash structure.
        rearWing(-2.36, 0.64 + rwLift * 0.4, -2.58, 0.68 + rwLift * 0.4,
          0.46, 0.032, c1, 0.65);
      }
      if (aDrs) {
        // Active-aero DRS: an extra open slot flap proud of the top flap.
        rearWing(-2.44, crownY - 0.050, -2.60, crownY, 0.49, 0.022, c2, 1.15);
      }
      const drsSX = aLvl >= 3 ? 0.13 : 0.10;
      addBox(out, 0, epCY + 0.265, -2.52, drsSX, 0.05, 0.18, DARK); // DRS actuator pod

      // --- FIA rain light: dark housing + HDR-red LED panel on the rear crash
      // structure. The >1 albedo glows through the night emissive path (and blooms),
      // so every car trails a visible red light after dark / in spray. A brighter
      // central brake-light LED sits proud on the same housing. ---
      addBox(out, 0, 0.50, -2.52, 0.13, 0.18, 0.10, DARK);
      addBox(out, 0, 0.50, -2.585, 0.10, 0.13, 0.03,
             [2.6, 0.08, 0.06], SURFACES.emissive);
      addBox(out, 0, 0.50, -2.60, 0.04, 0.05, 0.02,
             [3.4, 0.12, 0.05], SURFACES.emissive);   // brake-light core

      // --- Rear diffuser --- AERO visualTier scales width + front kick-up height.
      // Tucked UP and pulled IN (vs. the old low, wide, overhanging slab) so it
      // reads as a diffuser ramp under the crash structure instead of a big flat
      // reflective "shelf" sticking out behind the tail — the underbody now
      // mirrors the sky/road, and a broad down-facing plane there caught it.
      const diffW  = (0.72 + aLvl * 0.145) * Math.max(0.78, Math.min(1.3, aeroStyle.floorEdge));
      const diffH1 = (0.40 + aLvl * 0.325) *
        Math.max(0.72, Math.min(1.4, aeroStyle.diffuserRise));
      addLoft(out, -2.52, 0, 0.34, 1.12 * diffW, 0.30, -1.90, 0, 0.17, 0.92 * diffW, 0.14 * diffH1,
              [0.06, 0.06, 0.07], SURFACES.carbon);

      // --- Gearbox visual tell: per-OPTION diffuser strake count + a rear crash
      // structure fin. More strakes = higher-spec 'box. ---
      const gbStrakes = gbStyle ? gbStyle.strakes : (tier("gearbox") === 2 ? 5 : 0);
      const gbFin = gbStyle ? gbStyle.fin : (tier("gearbox") === 2 ? 1 : 0);
      const gbStrakeH = gbStyle && gbStyle.strakeH ? gbStyle.strakeH : 0.13;
      const gbCasing  = gbStyle ? (gbStyle.casing  || 0) : (tier("gearbox") === 2 ? 3 : 0);
      const gbLouvres = gbStyle ? (gbStyle.louvres || 0) : 0;
      const gbHeat    = gbStyle ? (gbStyle.heat    || 0) : 0;
      const gbFinSY   = gbStyle && gbStyle.finSY ? gbStyle.finSY : 0.14;
      const gbFinSZ   = gbStyle && gbStyle.finSZ ? gbStyle.finSZ : 0.28;
      if (gbStrakes > 0) {
        // Diffuser strakes — count AND height vary per spec (taller = higher-DF 'box).
        const half = (gbStrakes - 1) / 2;
        for (let i = 0; i < gbStrakes; i++) {
          addBox(out, (i - half) * 0.24, 0.13 + gbStrakeH / 2, -2.20, 0.015, gbStrakeH, 0.42, CARBON);
        }
      }
      // Gearbox casing bulge behind the engine cover — a bellhousing form that
      // grows and gains structure with the spec (slim → ribbed tail case → broad
      // carbon case with side plates), so each 'box shows a distinct rear mass.
      if (gbCasing > 0) {
        const cw = (0.15 + gbCasing * 0.05) *
          Math.max(0.75, Math.min(1.35, gbStyle.caseWidth || 1));
        const ch = 0.13 + gbCasing * 0.03;
        addBox(out, 0, 0.44, -2.02, cw, ch, 0.26, CARBON);                    // bellhousing bulge
        if (gbCasing >= 2) addBox(out, 0, 0.42, -2.17, cw * 0.78, ch * 0.78, 0.11, DARK); // tapered tail case
        if (gbCasing >= 3) for (const s of [-1, 1])
          addBox(out, s * (cw * 0.5 + 0.012), 0.44, -2.02, 0.02, ch * 0.9, 0.24, [0.09, 0.09, 0.10], SURFACES.carbon); // carbon side plate
      }
      // Cooling-louvre bank on the casing flanks — count varies per spec.
      if (gbLouvres > 0) for (const s of [-1, 1]) for (let i = 0; i < gbLouvres; i++)
        addBox(out, s * 0.135, 0.50 - i * 0.042, -2.02, 0.03, 0.013, 0.20, INTAKE);
      // Titanium heat-shield plate over the top of the 'box (higher specs).
      if (gbHeat) addBox(out, 0, 0.55, -2.06, 0.19, 0.014, 0.28, [0.30, 0.30, 0.34], SURFACES.metal);
      if (gbFin) addBox(out, 0, 0.27 + gbFinSY / 2, -2.30, 0.02, gbFinSY, gbFinSZ, CARBON);   // crash-structure fin
    }

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
    const brakeScoop = Math.max(0, Math.min(2, Math.round(
      brakeStyle && brakeStyle.scoop != null ? brakeStyle.scoop : (ductMul >= 1.3 ? 1 : 0))));
    for (const s of [-1, 1]) {
      addBox(out, s*0.60, 0.28, AXLES.frontZ + 0.19, 0.06, 0.20 * ductMul, 0.13 * ductMul, DARK);
      // Big-brake spec: a horizontal duct winglet scooping over each front wheel.
      if (brakeScoop >= 1) addBox(out, s*0.65, 0.42, AXLES.frontZ + 0.16, 0.11, 0.02, 0.15, CARBON);
      if (brakeScoop >= 2) {
        addBox(out, s*0.705, 0.38, AXLES.frontZ + 0.15, 0.014, 0.12, 0.17, CARBON);   // outboard fence
        addBox(out, s*0.655, 0.20, AXLES.frontZ + 0.11, 0.10, 0.016, 0.20, CARBON);   // lower deflector
      }
      if (!ckpt) addBox(out, s*0.58, 0.30, AXLES.rearZ - 0.20, 0.06, 0.18 * ductMul, 0.12 * ductMul, DARK);
    }

    part("suspension");
    // --- Suspension wishbones --- SUSPENSION tier scales thickness + follows
    // the ride-height shift from the floor plank above. Cockpit build keeps
    // only the FRONT pair (rears sit behind the seat).
    const wbMul = suspStyle ? suspStyle.arm : (suspT === 0 ? 0.85 : suspT === 2 ? 1.3 : 1.0);
    const wbPush = suspStyle ? suspStyle.push : (suspT === 2 ? 1 : 0);
    // Pullrod actuator runs the opposite diagonal to a pushrod (top-outboard →
    // bottom-inboard vs bottom-outboard → top-inboard) — a clear layout tell.
    const wbPull = suspStyle && suspStyle.pull ? 1 : 0;
    const armTh = 0.026 * wbMul, suspC = [0.11, 0.11, 0.13];
    // Inboard ROCKER fairing on the tub top ahead of the dash — the blister that
    // covers the heave/rocker assembly. A silhouette tell no arm scaling gives.
    const rockerLvl = Math.max(0, Math.min(2, Math.round(suspStyle.rocker || 0)));
    if (rockerLvl > 0) {
      const rh = rockerLvl === 2 ? 0.055 : 0.032;
      addLoft(out, 0.78, 0, 0.545 + rideDY + rh * 0.5, 0.20, rh,
              1.16, 0, 0.500 + rideDY + rh * 0.4, 0.15, rh * 0.8, CARBON);
      if (rockerLvl === 2) {
        for (const s of [-1, 1]) {
          addBox(out, s * 0.085, 0.575 + rideDY, 0.95, 0.020, 0.030, 0.16,
                 [0.24, 0.24, 0.27], SURFACES.metal);
        }
      }
    }
    const wishboneSpread = 0.20 * Math.max(0.72, Math.min(1.3, suspStyle.wishbone));
    const toeScale = Math.max(0.7, Math.min(1.35, suspStyle.toe));
    for (const s of [-1, 1]) {
      const fLower = [s*0.69, 0.27 + rideDY, AXLES.frontZ];
      const fUpper = [s*0.69, 0.43 + rideDY, AXLES.frontZ];
      for (const z of [AXLES.frontZ - wishboneSpread, AXLES.frontZ + wishboneSpread]) {
        addBeamBetween(out, [s*0.31, 0.23 + rideDY, z], fLower, armTh, suspC, SURFACES.carbon);
        addBeamBetween(out, [s*0.32, 0.44 + rideDY, z], fUpper, armTh, suspC, SURFACES.carbon);
      }
      addBeamBetween(out, [s*0.33, 0.34 + rideDY, AXLES.frontZ - 0.16],
        [s*0.69, 0.35 + rideDY, AXLES.frontZ - 0.04*toeScale],
        armTh*0.72*toeScale, suspC, SURFACES.carbon);
      addBox(out, s*0.69, 0.35 + rideDY, AXLES.frontZ, 0.055, 0.23, 0.10,
        [0.18,0.18,0.20], SURFACES.metal);
      if (wbPush) {
        const outer = wbPull ? fUpper : fLower;
        const inner = wbPull ? [s*0.30,0.20+rideDY,AXLES.frontZ-0.05]
          : [s*0.30,0.51+rideDY,AXLES.frontZ-0.05];
        addBeamBetween(out, outer, inner, armTh*0.82, suspC, SURFACES.carbon);
      }
      if (!ckpt) {
        const rLower = [s*0.67, 0.28 + rideDY, AXLES.rearZ];
        const rUpper = [s*0.67, 0.45 + rideDY, AXLES.rearZ];
        for (const z of [AXLES.rearZ - wishboneSpread*0.9, AXLES.rearZ + wishboneSpread*0.9]) {
          addBeamBetween(out, [s*0.31, 0.25 + rideDY, z], rLower, armTh, suspC, SURFACES.carbon);
          addBeamBetween(out, [s*0.32, 0.46 + rideDY, z], rUpper, armTh, suspC, SURFACES.carbon);
        }
        addBeamBetween(out, [s*0.31, 0.36 + rideDY, AXLES.rearZ + 0.16],
          [s*0.67, 0.36 + rideDY, AXLES.rearZ + 0.04*toeScale],
          armTh*0.72*toeScale, suspC, SURFACES.carbon);
        addBox(out, s*0.67, 0.36 + rideDY, AXLES.rearZ, 0.055, 0.23, 0.10,
          [0.18,0.18,0.20], SURFACES.metal);
        if (wbPush) {
          const outer = wbPull ? rUpper : rLower;
          const inner = wbPull ? [s*0.29,0.22+rideDY,AXLES.rearZ+0.04]
            : [s*0.29,0.53+rideDY,AXLES.rearZ+0.04];
          addBeamBetween(out, outer, inner, armTh*0.82, suspC, SURFACES.carbon);
        }
      }
    }

    part("wheels");
    // --- Wheels --- (skipped for the player car, which draws animated wheels)
    // Per-compound band and tread treatment from the resolved tyre recipe.
    if (!noWheels) {
      const tyreBand = tyreStyle && tyreStyle.band || TYRE_BAND[tier("tyres")];
      // Per-option caliper accent peeking through the rim spokes, else tier.
      const caliperColor = brakeStyle ? brakeStyle.cal : BRAKE_CALIPER[brakesT];
      const rimColor = brakeStyle && brakeStyle.rim;   // premium alloy rims (else default dark)
      const grooved = !!(tyreStyle && tyreStyle.grooved);
      for (const s of [-1, 1]) {
        addWheel(out, s*0.79, AXLES.wheelY, AXLES.frontZ, 0.34, 0.32,
          tyreBand, caliperColor, rimColor, grooved, tyreStyle, null, brakeStyle, wheelStyle);
        addWheel(out, s*0.76, AXLES.wheelY, AXLES.rearZ, 0.34, 0.38,
          tyreBand, caliperColor, rimColor, grooved, tyreStyle, null, brakeStyle, wheelStyle);
      }
    }

    // --- Livery FINISH: the paint's MATERIAL, not its colour. Bodywork paint is
    // the only thing emitted as SURFACES.paint, so a non-gloss finish is a single
    // remap of those material ids (see FINISH_SURFACE). Carbon, rubber, glass,
    // emissive and the sponsor/number panels keep their own ids, and a livery
    // with no `finish` leaves the array byte-identical to before. ---
    const finishSurface = FINISH_SURFACE[liv.finish];
    if (finishSurface) {
      for (let i = 0; i < out.mat.length; i++) {
        if (out.mat[i] === SURFACES.paint) out.mat[i] = finishSurface;
      }
    }

    // Close the last section and measure each from the vertices it emitted.
    if (sections.length) sections[sections.length - 1].to = out.pos.length / 3;
    out.parts = sections.filter((sec) => sec.to > sec.from).map((sec) => {
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity,
          z0 = Infinity, z1 = -Infinity;
      for (let i = sec.from * 3; i < sec.to * 3; i += 3) {
        if (out.pos[i] < x0) x0 = out.pos[i]; if (out.pos[i] > x1) x1 = out.pos[i];
        if (out.pos[i + 1] < y0) y0 = out.pos[i + 1]; if (out.pos[i + 1] > y1) y1 = out.pos[i + 1];
        if (out.pos[i + 2] < z0) z0 = out.pos[i + 2]; if (out.pos[i + 2] > z1) z1 = out.pos[i + 2];
      }
      const r2 = (v) => Math.round(v * 100) / 100;
      return { name: sec.name, vertices: sec.to - sec.from,
               sizeM: [r2(x1 - x0), r2(y1 - y0), r2(z1 - z0)],
               centreM: [r2((x0 + x1) / 2), r2((y0 + y1) / 2), r2((z0 + z1) / 2)],
               boundsZ: [r2(z0), r2(z1)] };
    });
    return out;
  }

  // The WHOLE car in its REFERENCE pose: the baked mesh plus the moveable wing
  // elements merged in at delta 0 — each element exactly where the fixed wing
  // used to have it, vertex for vertex, at every downforce level. build() alone
  // is the RENDER mesh (the elements are drawn separately so they can rotate);
  // this is the geometric one, and it is what a question like "does the wing
  // reach its endplates" or "how many triangles is this car" is really asking.
  //
  // Deliberately NOT the runtime closed pose, which carries Z_BITE on top: that
  // is an attitude, and rotating an element about its own hinge cannot change
  // the span, taper or endplate attachment this view exists to check.
  function buildComplete(color, color2, opts) {
    const out = build(color, color2, opts);
    const info = out.flapInfo;
    if (!info) return out;
    for (const el of aeroFlapsGeom(info.aLvl, info.style)) {
      const g = buildFlapGeom(el, info.col);
      const base = out.pos.length / 3;
      for (let i = 0; i < g.pos.length; i += 3) {
        // delta 0: undo only the hinge translation buildFlapGeom applied.
        out.pos.push(g.pos[i], g.pos[i + 1] + el.y, g.pos[i + 2] + el.z);
        out.nrm.push(g.nrm[i], g.nrm[i + 1], g.nrm[i + 2]);
        out.col.push(g.col[i], g.col[i + 1], g.col[i + 2]);
      }
      if (g.mat) for (const m of g.mat) out.mat.push(m);
      for (const k of g.idx) out.idx.push(base + k);
    }
    return out;
  }

  return { build, buildComplete, buildWheel, buildWheelLayers, bodyAnchors, SURFACES, FINISH_SURFACE,
           PANEL_COL: PANEL,
           TYRE_BAND, BRAKE_CALIPER, AXLES, CHASSIS,
           TEAM_STYLE, teamStyleOf,
           endplate: endplateGeom, numberBoard,
           aeroFlaps: aeroFlapsGeom, aeroFlapAim, buildFlapGeom,
           sharkFin: FIN, sharkFinPanel, sharkFinBadge,
           aeroLevelOf, aeroStyleOf };
})();
