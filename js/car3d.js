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
    emissive: 25, functionalEmissive: 25, panel: 26,
  });
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
  //   fin       0|1|2  engine-cover dorsal fin: none / low blade / shark fin
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
  // Wing element split into centre + outboard thirds so sweep, taper and tip
  // rise alter the actual planform rather than only stacking more rectangles.
  function addWingPlanform(out, spec, col, surface) {
    const half = spec.half, inner = half * 0.34;
    const sweep = spec.sweep || 0, taper = spec.taper == null ? 1 : spec.taper;
    const rise = spec.rise || 0, thick = spec.thick;
    const segments = [[-half, -inner], [-inner, inner], [inner, half]];
    for (const segment of segments) {
      const x0 = segment[0], x1 = segment[1];
      const shape = (x, rear) => {
        const edge = Math.max(0, (Math.abs(x) - inner) / Math.max(half - inner, 1e-6));
        const atTip = Math.abs(Math.abs(x) - half) < 1e-6;
        const attachedX = atTip && spec.attachHalf != null
          ? Math.sign(x || 1) * spec.attachHalf
          : null;
        return [
          attachedX != null ? attachedX : (rear ? x * taper : x),
          (rear ? spec.yTrail : spec.yLead) + rise * edge,
          (rear ? spec.zTrail : spec.zLead) - sweep * edge,
        ];
      };
      const f0 = shape(x0, false), f1 = shape(x1, false);
      const r0 = shape(x0, true), r1 = shape(x1, true);
      // Wings are thin aero skins, not six-faced bars. One double-sided surface
      // per planform section preserves sweep/taper while avoiding invisible
      // internal and underside faces in the always-double-sided car draw.
      const y = thick * 0.5;
      addQuad(out,
        [f0[0], f0[1] + y, f0[2]], [f1[0], f1[1] + y, f1[2]],
        [r1[0], r1[1] + y, r1[2]], [r0[0], r0[1] + y, r0[2]],
        col, surface);
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

  // Thin diagonal strut bar between two points (x0,y0)→(x1,y1) at depth z — a
  // slim hexahedron with `th` cross-section and `d` z-depth. Used for the
  // pushrod / pullrod suspension actuators (a diagonal rod, not an axis box).
  function addStrut(out, x0, y0, x1, y1, z, th, d, col, surface) {
    const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1;
    const px = -dy / L * th / 2, py = dx / L * th / 2;
    const zf = z + d / 2, zr = z - d / 2;
    addBlock(out, [
      [x0 - px, y0 - py, zf], [x0 + px, y0 + py, zf], [x1 + px, y1 + py, zf], [x1 - px, y1 - py, zf],
      [x0 - px, y0 - py, zr], [x0 + px, y0 + py, zr], [x1 + px, y1 + py, zr], [x1 - px, y1 - py, zr],
    ], col, null, surface);
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
                    grooved, tyreStyle, fixedOut, brakeStyle) {
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
      addBox(out, ss[0] + dir * 0.032, cy, cz, 0.026, hcR * 0.42, hcR * 0.42, NUT, SURFACES.metal);
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

  // 7-segment digit built from thin boxes, proud of a vertical x = const surface.
  // m = +1 renders for a viewer on the car's LEFT side (screen-right = +z there),
  // m = -1 for the RIGHT side — so the number reads correctly from both sides.
  const SEG7 = [
    [1,1,1,1,1,1,0],[0,1,1,0,0,0,0],[1,1,0,1,1,0,1],[1,1,1,1,0,0,1],[0,1,1,0,0,1,1],
    [1,0,1,1,0,1,1],[1,0,1,1,1,1,1],[1,1,1,0,0,0,0],[1,1,1,1,1,1,1],[1,1,1,1,0,1,1],
  ];
  function addDigit(out, xp, cy, cz, h, m, d, col) {
    const w = h * 0.55, t = h * 0.14, q = h / 4, z2 = (w / 2) * m;
    const L = [                       // [dy, dz, sy, sz] for segments A..G
      [ h/2,  0,  t,   w ], [ q,  z2, h/2, t ], [ -q,  z2, h/2, t ],
      [-h/2,  0,  t,   w ], [-q, -z2, h/2, t ], [  q, -z2, h/2, t ],
      [ 0,    0,  t,   w ],
    ];
    const s = SEG7[d] || SEG7[8];
    for (let i = 0; i < 7; i++) if (s[i])
      addBox(out, xp, cy + L[i][0], cz + L[i][1], 0.004, L[i][2], L[i][3], col);
  }

  // A single wheel centred on the origin, axle along X — so the render layer can
  // spin it about X (∝ speed) and steer the fronts about Y, then translate it to
  // each corner. Used only for the player car (AI keep the baked static wheels).
  function buildWheel(w, bandColor, caliperColor, rimColor, grooved, tyreStyle, brakeStyle) {
    const out = { pos: [], nrm: [], col: [], mat: [], idx: [] };
    addWheel(out, 0, 0, 0, 0.34, w || 0.34, bandColor, caliperColor, rimColor,
      grooved, tyreStyle, null, brakeStyle);
    return out;
  }
  function buildWheelLayers(w, bandColor, caliperColor, rimColor, grooved, tyreStyle, brakeStyle) {
    const rotating = { pos: [], nrm: [], col: [], mat: [], idx: [] };
    const fixed = { pos: [], nrm: [], col: [], mat: [], idx: [] };
    const width = w || 0.34;
    addWheel(rotating, 0, 0, 0, 0.34, width, bandColor, caliperColor, rimColor,
      grooved, tyreStyle, fixed, brakeStyle);
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
  // The driver-number board on the endplate: a fixed-height board anchored LOW,
  // its bottom a small gap above the plate base. The plate base barely moves with
  // DF (~0.46 → 0.51) while the top shoots up, so a low anchor reads grounded on
  // the short low-DF plate and low-on-a-tall-plate for max DF — never floating.
  function numberBoard(aLvl) {
    const ep = endplateGeom(aLvl), h = 0.20;
    return { cy: ep.cy - ep.sy * 0.5 + 0.05 + h * 0.5, h };
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
    }, recipe);
  }
  function buildAeroParts(recipe, tier) {
    const lvl = tier === 0 ? 0 : tier === 2 ? 4 : 2;
    return mergeRecipe({
      lvl, beam: tier === 2 ? 1 : 0, drs: 0,
      vane: lvl >= 4 ? 3 : lvl >= 3 ? 2 : lvl >= 1 ? 1 : 0,
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
    }, recipe);
  }
  function buildBrakeParts(recipe, tier) {
    return mergeRecipe({
      cal: BRAKE_CALIPER[tier], duct: tier === 0 ? 0.5 : tier === 2 ? 1.9 : 1,
      rim: null, caliperPos: 0, coverOpen: tier === 2 ? 1 : 0,
      rotor: tier === 2 ? 2 : 1, rotorScale: tier === 2 ? 1.12 : 1,
    }, recipe);
  }
  function buildTyreParts(recipe, tier) {
    return mergeRecipe({ band: TYRE_BAND[tier], grooved: false }, recipe);
  }
  function buildErsParts(recipe, tier, accent) {
    return mergeRecipe({ led: tier === 2 ? accent : null, pack: 1, cells: tier === 2 ? 6 : 3 }, recipe);
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
      line: 1,
    }, recipe);
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
    };
  }
  // Resolve the continuous 0..4 downforce level from a getVisualTiers() object.
  // Resolved recipes are authoritative; the coarse tier remains a stale-bundle
  // fallback for AI/no-parts builds.
  function aeroLevelOf(T) {
    T = T || {};
    return buildAeroParts(T._visual && T._visual.aero, T.aero != null ? T.aero : 1).lvl;
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

  function bodyAnchors(parts, teamId) {
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
    // Per-team chassis identity (opts.teamId): nose profile, airbox scale,
    // dorsal fin, mirror style, sidepod-inlet aspect. Absent → shared default
    // silhouette, byte-identical to before.
    const teamStyle = teamStyleOf(opts && opts.teamId);
    const anchors = bodyAnchors(T, opts && opts.teamId);

    // --- Shared chassis --- per-OPTION suspension shifts only ride height.
    const rideDY = suspStyle ? suspStyle.ride : (suspT === 0 ? 0.060 : suspT === 2 ? -0.048 : 0);
    buildSharedChassis(out, c1, rideDY, styledNoseStations(teamStyle));

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

    // --- Sidepods: four body stations create a deep inlet, undercut, downwash
    // shoulder and coke-bottle tail. Geometry datums returned here anchor all
    // paint, sponsor, ERS and cooling details below.
    const podGeom = buildSidepodBodywork(out, c1, engStyle, anchors);
    function addPodFlankSpan(zFront, zRear, yFrac, height, col, surface, proud) {
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
              w: 0.016, h: Math.min(height, (a.top - a.bottom) * 0.78) },
            { z: stops[i + 1], x: side * (b.x + (proud || 0.008)),
              y: b.bottom + (b.top - b.bottom) * yFrac,
              w: 0.016, h: Math.min(height, (b.top - b.bottom) * 0.78) },
            col, null, surface);
        }
      }
    }

    // Visible floor shoulder and edge wing. Aero recipes vary its exposure and
    // rear cut so underfloor choices remain legible from normal 3/4 cameras.
    const floorEdge = Math.max(0.72, Math.min(1.35, aeroStyle.floorEdge));
    const floorCut = Math.max(0, Math.min(0.24, aeroStyle.floorCut));
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
      // 2 = full shark fin. Body-colour plate with an accent crest line — a
      // strong per-team silhouette tell from chase and TV cameras. Starts
      // behind the snorkel zone (z −0.95) so the two never intersect.
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
      if (fuelStyle.line) {
        const lineRear = anchors.coverAt(-1.30);
        addSpan(out,
          { z: -0.56, x: 0.12, y: 0.80, w: 0.018 * fuelStyle.line, h: 0.018 },
          { z: -1.30, x: lineRear.x * 0.72, y: lineRear.top - 0.15,
            w: 0.015 * fuelStyle.line, h: 0.015 },
          fuelDisplay, null, fuelSurface);
      }
    }

    addPodFlankSpan(0.46, -0.34, 0.55, 0.18, PANEL);
    addPodFlankSpan(0.46, -0.34, 0.16, 0.08, c2);

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
    }

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
      for (const fz of [0.42, 0.06, -0.30, -0.66, -1.02]) {
        const fp = anchors.podAt(fz);
        addBox(out, s*(fp.x + 0.012), fp.bottom + 0.025, fz, 0.014, 0.05, 0.13, CARBON);
      }
    }

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
    if (stripeC) {
      const ns314 = anchors.noseAt(3.14), ns270 = anchors.noseAt(2.70);
      const ns155 = anchors.noseAt(1.55), ns105 = anchors.noseAt(1.05);
      addLoft(out, 2.70, 0, ns270.top + 0.012, 0.075, 0.014,
             3.14, 0, ns314.top + 0.012, 0.040, 0.012, stripeC);
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
      const ns155 = anchors.noseAt(1.55), ns270 = anchors.noseAt(2.70), ns314 = anchors.noseAt(3.14);
      addLoft(out, 1.55, 0, ns155.top + 0.016, 0.115, 0.014,
             2.70, 0, ns270.top + 0.016, 0.064, 0.012, noseStripeC);
      addLoft(out, 2.70, 0, ns270.top + 0.016, 0.064, 0.012,
             3.14, 0, ns314.top + 0.016, 0.036, 0.010, noseStripeC);
    }

    // --- Livery `nose` tip cap: a painted band wrapping the slim nose tip, sitting
    // fractionally proud of the nose wedge so it reads as a distinct-colour nose
    // cone (a staple real-F1 livery element). Only when the livery specifies it. ---
    if (noseC) {
      const nt = anchors.noseAt(3.18), nb = anchors.noseAt(2.80);
      addSpan(out, { z: 3.185, y: (nt.bottom + nt.top) * 0.5, w: nt.side*2 + 0.010,
                     h: nt.top - nt.bottom + 0.010, t: 0.70 },
                   { z: 2.80, y: (nb.bottom + nb.top) * 0.5, w: nb.side*2 + 0.010,
                     h: nb.top - nb.bottom + 0.010, t: 0.86 }, noseC);
    }
    // --- Livery `pod` panel: a bold contrasting block on each sidepod flank,
    // forward of the sponsor board, for the two-tone sidepod look many liveries
    // carry. Proud of the pod skin so it never z-fights. Only when specified. ---
    if (podC) addPodFlankSpan(0.45, 0.11, 0.60, 0.22, podC, SURFACES.paint, 0.016);

    // --- Nose number deck: a flat base-paint panel raised proud of the nose
    // crown, carrying the driver-number TEXTURE decal (see carDecalData). Base
    // colour so the decal's own backing/keyline defines it. + a camera pod. ---
    const deckF = anchors.noseAt(2.15), deckR = anchors.noseAt(1.69);
    addLoft(out, deckR.z, 0, deckR.top + 0.010, Math.min(0.28, deckR.topSide*1.75), 0.018,
           deckF.z, 0, deckF.top + 0.010, Math.min(0.28, deckF.topSide*1.75), 0.018, c1);
    const camPod = anchors.noseAt(1.55);
    addBox(out, 0, camPod.top + 0.045, 1.55, 0.06, 0.08, 0.15, DARK);

    // --- Cockpit opening (dark) + halo + front pillar ---
    addBox(out, 0, 0.60, 0.12, 0.40, 0.045, 0.78, [0.04, 0.04, 0.05], SURFACES.carbon);
    for (const s of [-1, 1]) {
      addLoft(out, -0.15, s*0.27, 0.74, 0.06, 0.06,
               0.62,     0,      0.70, 0.06, 0.06, DARK);
    }
    addBox(out, 0, 0.74, -0.18, 0.60, 0.06, 0.07, DARK); // rear hoop
    addBox(out, 0, 0.60,  0.62, 0.05, 0.20, 0.05, DARK); // front pillar

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

    // --- Exhaust outlet poking from the tail cap --- per ENGINE option: a lone
    // slim pipe at low spec, a fat central tailpipe flanked by two extra tips
    // for engine recipes with the `twin` flag.
    const exhTwin = engStyle ? !!engStyle.twin : tier("engine") === 2;
    const exhR = engStyle ? (engStyle.twin ? 0.09 : (engStyle.in < 0.9 ? 0.05 : 0.07))
                          : (tier("engine") === 0 ? 0.05 : tier("engine") === 2 ? 0.09 : 0.07);
    addBox(out, 0, 0.40, -2.12, exhR, exhR, 0.16, [0.16, 0.16, 0.17], SURFACES.metal);
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

    // --- Shark fin (team accent colour) --- a swept aero surface, not a flat
    // plank: long raked leading edge (base front z-0.65 → top front z-1.15, a
    // 0.50 m rake) tapering to a near-vertical trailing edge (only 0.05 m rake),
    // the real-F1 fin profile. The base hugs the engine-cover's ridge line (it
    // tapers from y0.83 at z-0.55 to y0.59 at z-2.00) so it reads as grown out
    // of the cover instead of resting flat on top of it. Behind the driver —
    // skipped in the cockpit build.
    if (!ckpt) {
      addBlock(out, [
        [-0.022, 0.7935, -0.65], [0.022, 0.7935, -0.65], [0.014, 0.97, -1.15], [-0.014, 0.97, -1.15],
        [-0.022, 0.6197, -1.70], [0.022, 0.6197, -1.70], [0.014, 0.97, -1.65], [-0.014, 0.97, -1.65],
      ], c2);
    }

    // --- Driver number: now a TEXTURE decal on the nose-top plate (see
    // carDecalData / the nose number plate below), not blocky 7-seg geometry —
    // so it reads sharply and shows from the chase, hood AND cockpit cameras. ---

    // --- Sponsor board on the sidepod flank + a base-paint NUMBER BOARD on each
    // Downforce level 0..4 — resolved up here (before the number board) so the
    // board tracks the rear-wing endplate for THIS aero setup. Per-option when
    // the aero id is known, else mapped from the coarse 0/1/2 tier (AI / no
    // parts → medium, lvl 2). See endplateGeom / numberBoard (single source of
    // truth, shared with the game.js number decal via Car3D.*).
    const aeroT = tier("aero");
    const aLvl = aeroStyle && aeroStyle.lvl != null
      ? aeroStyle.lvl : (aeroT === 0 ? 0 : aeroT === 2 ? 4 : 2);

    // rear-wing endplate driver-number BOARD — placed by numberBoard(aLvl) so it
    // sits low on the plate at every downforce level (the game.js number decal
    // reads the SAME function, so the digit lands exactly on this board). ---
    const nb = numberBoard(aLvl);
    for (const s of [-1, 1]) {
      const boardP = anchors.podAt(0);
      addBox(out, s*(boardP.x + 0.012), boardP.bottom + (boardP.top - boardP.bottom) * 0.55,
             0.0, 0.020, Math.min(0.11, (boardP.top - boardP.bottom) * 0.7), 0.46, PANEL);
      addBox(out, s*0.527, nb.cy, -2.42, 0.012, nb.h, 0.30, c1);
    }

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
    const fwSpan = aLvl <= 0 ? 0.74 : (aLvl === 1 ? 0.88 : 1.0);
    const fwHalf = 0.92 * fwSpan;                 // half-span (endplate sits just outside)
    // [zLead, yLead, zTrail, yTrail, chordWMul, thick, colour] — stacked front→back.
    const fwElems = [
      [2.72, 0.048, 2.40, 0.086, 1.00, 0.032, c1],   // main plane (wide, near-flat, team base)
      [2.50, 0.092, 2.24, 0.146, 0.98, 0.028, wingC], // flap 1 (livery `wing` colour, else c2)
    ];
    if (aLvl >= 1) fwElems.push([2.34, 0.148, 2.10, 0.212, 0.95, 0.026, wingC]); // flap 2
    if (aLvl >= 3) fwElems.push([2.20, 0.210, 1.98, 0.282, 0.92, 0.024, wingC]); // flap 3
    if (aLvl >= 4) fwElems.push([2.08, 0.286, 1.88, 0.358, 0.88, 0.022, wingC]); // flap 4 (max DF)
    for (let i = 0; i < fwElems.length; i++) {
      const e = fwElems[i], half = fwHalf * e[4];
      addWingPlanform(out, {
        zLead: e[0], yLead: e[1], zTrail: e[2], yTrail: e[3],
        half, thick: e[5], taper: frontTaper,
        sweep: frontSweep * (0.75 + i * 0.10),
        rise: frontRise * (0.65 + i * 0.12),
        attachHalf: fwHalf + 0.03,
      }, e[6], SURFACES.paint);
    }
    // Bold outboard upsweep: the top flap kicks sharply upward as it meets the
    // endplate — a much more pronounced flick than a flat trailing edge.
    const topE = fwElems[fwElems.length - 1];
    for (const s of [-1, 1]) {
      addSpan(out, { z: topE[2], x: s * (fwHalf * topE[4] - 0.05), y: topE[3], w: 0.16, h: topE[5] * 1.5 },
                   { z: topE[2] - 0.04, x: s * (fwHalf + 0.02),    y: topE[3] + 0.085, w: 0.09, h: topE[5] * 1.6 }, topE[6]);
    }
    for (const s of [-1, 1]) {
      const epW = aLvl >= 4 ? 0.060 : (aLvl <= 0 ? 0.028 : 0.044);
      const epX = s * (fwHalf + 0.03);
      // Main endplate: a swept plate rising up-and-outboard (the outwash flick) —
      // moderated in height so it reads as a real 3-D structure without towering
      // over the wing (it was ~1.5× too tall and looked detached from the plane).
      addSpan(out, { z: 2.66, x: epX,          y: 0.135, w: epW, h: 0.22 },
                   { z: 1.98, x: epX + s*0.06, y: 0.245, w: epW, h: 0.40 }, c2);
      // Footplate: the horizontal "foot" kicking outward along the endplate base
      // (the ground-effect seal that reads as a real front-wing foot).
      addBox(out, epX + s*0.03, 0.050, 2.30, 0.13, 0.016, 0.54, c1);
      // Canard / dive-plane cascade on the outer face of the endplate — more
      // planes at higher DF (aLvl 1 → one, 3 → two, 4 → three).
      const nCan = aLvl >= 4 ? 3 : (aLvl >= 3 ? 2 : (aLvl >= 1 ? 1 : 0));
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
        addWingPlanform(out, {
          zLead, yLead, zTrail, yTrail, half, thick,
          taper: rearTaper, sweep: rearSweep * (scale == null ? 1 : scale), rise: 0,
          attachHalf: 0.50,
        }, col, SURFACES.paint);
      rearWing(-2.30, upperTrailY - 0.270, -2.52, upperTrailY - 0.225,
        0.51, 0.032, c1, 0.8);
      if (aLvl >= 2) {
        rearWing(-2.34, upperTrailY - 0.170, -2.56, upperTrailY - 0.115,
          0.51, 0.030, wingC, 0.9);
      }
      rearWing(-2.38, upperTrailY - 0.075, -2.64, upperTrailY,
        0.51, 0.035, wingC, 1.0);
      // Swan-neck mount: slim pylons sweeping UP and BACK from the rear crash
      // structure to the underside of the main plane — this is what visually hangs
      // the wing off the car (previously the mount sat above the plane, so the
      // whole wing read as detached/floating). A central pylon reinforces it.
      for (const s of [-1, 1]) {
        addSpan(out, { z: -1.98, x: s*0.14, y: 0.46, w: 0.05, h: 0.13 },
                     { z: -2.34, x: s*0.14, y: epCY + 0.01, w: 0.042, h: 0.10 }, DARK);
      }
      addSpan(out, { z: -1.96, x: 0, y: 0.44, w: 0.09, h: 0.14 },
                   { z: -2.36, x: 0, y: epCY, w: 0.07, h: 0.10 }, DARK);   // central spine mount
      if (aLvl >= 4 && !aDrs) {
        // Extra proud top element + a T-wing ahead of it (max-DF look).
        rearWing(-2.42, crownY - 0.055, -2.66, crownY, 0.50, 0.030, c2, 1.1);
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

    // --- Brake duct fairings (front + rear wheels) --- per BRAKES option: duct
    // size + a big-brake winglet. Cockpit build keeps only the FRONT ducts.
    const brakesT = tier("brakes");
    const ductMul = brakeStyle ? brakeStyle.duct : (brakesT === 0 ? 0.5 : brakesT === 2 ? 1.9 : 1.0);
    // Brake packages alter duct and caliper hardware. Heat glow is emitted only
    // by the runtime brake-ring effect once live brake temperature crosses its
    // threshold; baking it into high-spec meshes made parked cars look overheated.
    for (const s of [-1, 1]) {
      addBox(out, s*0.60, 0.28, AXLES.frontZ + 0.19, 0.06, 0.20 * ductMul, 0.13 * ductMul, DARK);
      // Big-brake spec: a horizontal duct winglet scooping over each front wheel.
      if (ductMul >= 1.3) addBox(out, s*0.65, 0.42, AXLES.frontZ + 0.16, 0.11, 0.02, 0.15, CARBON);
      if (!ckpt) addBox(out, s*0.58, 0.30, AXLES.rearZ - 0.20, 0.06, 0.18 * ductMul, 0.12 * ductMul, DARK);
    }

    // --- Suspension wishbones --- SUSPENSION tier scales thickness + follows
    // the ride-height shift from the floor plank above. Cockpit build keeps
    // only the FRONT pair (rears sit behind the seat).
    const wbMul = suspStyle ? suspStyle.arm : (suspT === 0 ? 0.85 : suspT === 2 ? 1.3 : 1.0);
    const wbPush = suspStyle ? suspStyle.push : (suspT === 2 ? 1 : 0);
    // Pullrod actuator runs the opposite diagonal to a pushrod (top-outboard →
    // bottom-inboard vs bottom-outboard → top-inboard) — a clear layout tell.
    const wbPull = suspStyle && suspStyle.pull ? 1 : 0;
    const armTh = 0.026 * wbMul, suspC = [0.11, 0.11, 0.13];
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
          tyreBand, caliperColor, rimColor, grooved, tyreStyle, null, brakeStyle);
        addWheel(out, s*0.76, AXLES.wheelY, AXLES.rearZ, 0.34, 0.38,
          tyreBand, caliperColor, rimColor, grooved, tyreStyle, null, brakeStyle);
      }
    }

    return out;
  }

  return { build, buildWheel, buildWheelLayers, bodyAnchors, SURFACES, TYRE_BAND, BRAKE_CALIPER, AXLES, CHASSIS,
           TEAM_STYLE, teamStyleOf,
           endplate: endplateGeom, numberBoard, aeroLevelOf };
})();
