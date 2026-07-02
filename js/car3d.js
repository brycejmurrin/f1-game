/*
 * Apex 26 — procedural 2026 F1 car.
 * Car3D.build(color, color2) -> plain {pos,nrm,col,idx} for GLX.createMesh.
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
  const DARK   = [0.05, 0.05, 0.05];
  const CARBON = [0.07, 0.07, 0.08];
  const VISOR  = [0.08, 0.08, 0.09];          // tinted visor
  const PANEL  = [1.12, 1.12, 1.16];          // sponsor / number plate — slightly HDR so it glows at night
  const TYRE   = [0.06, 0.06, 0.07];
  const RIM    = [0.11, 0.11, 0.13];
  const HUB    = [0.28, 0.28, 0.31];
  const INTAKE = [0.03, 0.03, 0.04];          // radiator inlet void
  const HALO   = [0.17, 0.17, 0.19];          // brushed-titanium cockpit-protection hoop

  function addTri(out, a, b, c, col) {
    const ux = b[0]-a[0], uy = b[1]-a[1], uz = b[2]-a[2];
    const vx = c[0]-a[0], vy = c[1]-a[1], vz = c[2]-a[2];
    let nx = uy*vz - uz*vy, ny = uz*vx - ux*vz, nz = ux*vy - uy*vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    const base = out.pos.length / 3;
    for (const p of [a, b, c]) {
      out.pos.push(p[0], p[1], p[2]);
      out.nrm.push(nx, ny, nz);
      out.col.push(col[0], col[1], col[2]);
    }
    out.idx.push(base, base + 1, base + 2);
  }

  function addQuad(out, a, b, c, d, col) {
    addTri(out, a, b, c, col);
    addTri(out, a, c, d, col);
  }

  function addLoft(out, z0, x0, y0, w0, h0, z1, x1, y1, w1, h1, col) {
    const b00 = [x0-w0/2, y0-h0/2, z0], b10 = [x0+w0/2, y0-h0/2, z0];
    const b11 = [x0+w0/2, y0+h0/2, z0], b01 = [x0-w0/2, y0+h0/2, z0];
    const f00 = [x1-w1/2, y1-h1/2, z1], f10 = [x1+w1/2, y1-h1/2, z1];
    const f11 = [x1+w1/2, y1+h1/2, z1], f01 = [x1-w1/2, y1+h1/2, z1];
    addQuad(out, f00, f10, f11, f01, col); // front face (+Z)
    addQuad(out, b10, b00, b01, b11, col); // back face  (-Z)
    addQuad(out, b01, f01, f11, b11, col); // top        (+Y)
    addQuad(out, b00, b10, f10, f00, col); // bottom     (-Y)
    addQuad(out, b10, b11, f11, f10, col); // right      (+X)
    addQuad(out, b00, f00, f01, b01, col); // left       (-X)
  }

  function addBox(out, cx, cy, cz, sx, sy, sz, col) {
    addLoft(out, cz-sz/2, cx, cy, sx, sy, cz+sz/2, cx, cy, sx, sy, col);
  }

  // ── Hexahedron block ────────────────────────────────────────────────────────
  // The car is HAND-MODELLED from chiseled blocks: each functional mass (nose
  // wedge, monocoque slab, engine-cover prism, sidepod slab) is one 8-corner
  // hexahedron with arbitrary corner positions — tapered wedges, undercuts and
  // pinched ridges all come out of one primitive, every face flat-shaded.
  // Corners: [FBL, FBR, FTR, FTL, RBL, RBR, RTR, RTL]  (F = +Z front, B/T =
  // bottom/top, L/R = -x/+x). Degenerate corners (two at the same point) give
  // wedges and prisms.
  function addBlock(out, q, col, colFront) {
    addQuad(out, q[0], q[1], q[2], q[3], colFront || col);  // front (+Z)
    addQuad(out, q[5], q[4], q[7], q[6], col);              // rear  (−Z)
    addQuad(out, q[3], q[2], q[6], q[7], col);              // top   (+Y)
    addQuad(out, q[1], q[0], q[4], q[5], col);              // bottom(−Y)
    addQuad(out, q[1], q[5], q[6], q[2], col);              // right (+X)
    addQuad(out, q[0], q[3], q[7], q[4], col);              // left  (−X)
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
  function addSpan(out, front, rear, col, colFront) {
    const F = frame(front), R = frame(rear);
    addBlock(out, [F[0], F[1], F[2], F[3], R[0], R[1], R[2], R[3]], col, colFront);
  }
  // Chamfer the two TOP longitudinal edges of a span with proud 45° strips. A
  // sharp 90° edge either flashes a razor-thin aliased highlight or nothing; a
  // 45° facet between the top and side faces catches a clean running specular
  // line exactly when neither neighbour does — the "expensive-looking car" cue.
  // The strip sits fractionally proud along its own normal so it never z-fights
  // the flat faces behind it. b in metres (chamfer width).
  function addTopBevel(out, front, rear, b, col) {
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
      if (side > 0) addQuad(out, fs, rs, rt, ft, col);
      else          addQuad(out, ft, rt, rs, fs, col);
    }
  }

  // Thin diagonal strut bar between two points (x0,y0)→(x1,y1) at depth z — a
  // slim hexahedron with `th` cross-section and `d` z-depth. Used for the
  // pushrod / pullrod suspension actuators (a diagonal rod, not an axis box).
  function addStrut(out, x0, y0, x1, y1, z, th, d, col) {
    const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1;
    const px = -dy / L * th / 2, py = dx / L * th / 2;
    const zf = z + d / 2, zr = z - d / 2;
    addBlock(out, [
      [x0 - px, y0 - py, zf], [x0 + px, y0 + py, zf], [x1 + px, y1 + py, zf], [x1 - px, y1 - py, zf],
      [x0 - px, y0 - py, zr], [x0 + px, y0 + py, zr], [x1 + px, y1 + py, zr], [x1 - px, y1 - py, zr],
    ], col);
  }

  // Smooth dome (helmet): partial lat-long sphere, analytic normals.
  function addDome(out, cx, cy, cz, r, col) {
    const STACKS = 5, SLICES = 12;
    const i0 = out.pos.length / 3;
    for (let st = 0; st <= STACKS; st++) {
      const phi = (st / STACKS) * (Math.PI / 2);   // 0 = top, π/2 = equator
      const y = Math.cos(phi), rr = Math.sin(phi);
      for (let sl = 0; sl < SLICES; sl++) {
        const a = (sl / SLICES) * Math.PI * 2;
        const nx = rr * Math.cos(a), nz = rr * Math.sin(a);
        out.pos.push(cx + nx * r, cy + y * r, cz + nz * r);
        out.nrm.push(nx, y, nz);
        out.col.push(col[0], col[1], col[2]);
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
  function addWheel(out, cx, cy, cz, r, w, bandColor, caliperColor, rimColor) {
    const RC = rimColor || RIM;
    const SEG = 18;
    const x0 = cx - w/2, x1 = cx + w/2;
    const rimR = r * 0.42;
    // Tread: two shared rings with analytic radial normals — the highlight
    // wraps around the tyre instead of stepping facet to facet.
    const i0 = out.pos.length / 3;
    for (const x of [x0, x1]) {
      for (let i = 0; i < SEG; i++) {
        const a = (i / SEG) * Math.PI * 2;
        const c = Math.cos(a), s = Math.sin(a);
        out.pos.push(x, cy + r * c, cz + r * s);
        out.nrm.push(0, c, s);
        out.col.push(TYRE[0], TYRE[1], TYRE[2]);
      }
    }
    for (let i = 0; i < SEG; i++) {
      const i2 = (i + 1) % SEG;
      const A = i0 + i, B = i0 + i2, C = i0 + SEG + i2, D = i0 + SEG + i;
      out.idx.push(A, B, C, A, C, D);
    }
    // Sidewalls (flat): full face from tread radius to rim disc + hub fans.
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
      addQuad(out, B0, B1, R1, R0, RC); addTri(out, hub1, R0, R1, HUB);   // right (+X)
      const L0=[x0,rya0,rza0], L1=[x0,rya1,rza1];
      addQuad(out, A0, A1, L1, L0, RC); addTri(out, hub0, L0, L1, HUB);   // left (−X)
    }
    // Pirelli-style compound band: a bright ring on both sidewalls just inside
    // the tread — the classic modern-F1 tyre read (and a colour accent on an
    // otherwise all-dark corner of the car). TYRES visualTier recolours it.
    const BAND = bandColor || [0.85, 0.10, 0.08];
    for (const bs of [[x0, -1], [x1, 1]]) {
      const xb = bs[0] + bs[1] * 0.004;
      for (let i = 0; i < SEG; i++) {
        const a0 = (i / SEG) * Math.PI * 2, a1 = ((i + 1) / SEG) * Math.PI * 2;
        const P = (rad, a) => [xb, cy + rad * Math.cos(a), cz + rad * Math.sin(a)];
        const A = P(r * 0.96, a0), B = P(r * 0.96, a1), C = P(r * 0.87, a1), D = P(r * 0.87, a0);
        addQuad(out, A, B, C, D, BAND);   // single face (wheel drawn cull-off → shows both sides, no z-fight)
      }
    }
    // Rim spokes: five pale blades proud of the hub fans on each face. They make
    // wheel ROTATION actually visible (the tread/rim are rotationally uniform)
    // and read as a machined wheel instead of a flat disc.
    const SPOKE = [0.55, 0.55, 0.62];
    for (const ss of [[x0, -1], [x1, 1]]) {
      const xs = ss[0] + ss[1] * 0.020;
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2 + 0.3;
        const uy = Math.cos(a), uz = Math.sin(a), py = -Math.sin(a), pz = Math.cos(a);
        const hw = 0.013, ri = r * 0.10, ro = r * 0.40;
        const P = (rad, s) => [xs, cy + uy * rad + py * hw * s, cz + uz * rad + pz * hw * s];
        const A = P(ri, 1), B = P(ro, 1), C = P(ro, -1), D = P(ri, -1);
        addQuad(out, A, B, C, D, SPOKE);   // single face (cull-off shows both sides)
      }
    }
    // BRAKES tier 2: a caliper accent peeking through the rim spokes — pure
    // addition, absent (caliperColor null) at every other tier.
    if (caliperColor) {
      const ca = 0.35 * Math.PI, cr = r * 0.30;
      addBox(out, x0 - 0.02, cy + Math.cos(ca) * cr, cz + Math.sin(ca) * cr, 0.05, 0.09, 0.09, caliperColor);
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
  function buildWheel(w, bandColor, caliperColor, rimColor) {
    const out = { pos: [], nrm: [], col: [], idx: [] };
    addWheel(out, 0, 0, 0, 0.34, w || 0.34, bandColor, caliperColor, rimColor);
    return out;
  }

  // Cosmetic tint tables for the TYRES/BRAKES visual tells — tier 1 always
  // matches today's hardcoded literals so an unmodified car is byte-identical.
  const TYRE_BAND     = { 0: [0.92, 0.92, 0.90], 1: [0.85, 0.10, 0.08], 2: [0.95, 0.15, 0.05] };
  const BRAKE_CALIPER = { 0: null, 1: null, 2: [0.75, 0.08, 0.05] };
  // Per-COMPOUND sidewall band colour (real Pirelli-style read), keyed by the
  // resolved tyre option id — so each tyre choice reads distinctly on the car,
  // not just in three tiers. Falls back to TYRE_BAND[tier] for any unmapped id.
  const TYRE_PIRELLI = {
    intermediate: [0.10, 0.72, 0.24],   // green
    hard:         [0.90, 0.90, 0.93],   // white
    medium:       [0.96, 0.80, 0.10],   // yellow
    slick_track:  [0.80, 0.82, 0.88],   // silver slick
    compound_c4:  [0.95, 0.42, 0.10],   // orange-soft
    soft:         [0.92, 0.12, 0.10],   // red
    compound_c5:  [0.97, 0.16, 0.12],   // bright red
    supersoft:    [0.88, 0.10, 0.30],   // crimson
    p_zero_red:   [0.97, 0.07, 0.07],   // hot red
    qualigum:     [0.62, 0.12, 0.78],   // purple (quali)
    hypersoft:    [0.98, 0.38, 0.62],   // pink
  };
  // Per-OPTION aero package keyed by resolved aero id: `lvl` is a continuous
  // downforce level 0 (skinny low-drag) → 4 (towering high-DF) that drives wing
  // size/height/element-count, plus flags — `beam` (a prominent beam wing) and
  // `drs` (a slotted DRS gap in the top flap), and `vane` (bargeboard / turning-
  // vane cluster style ahead of the sidepods: 0 none, 1 single fence, 2 twin
  // fences, 3 curved triple cascade). Distinct silhouette per choice, not just
  // three tiers. Unmapped ids fall back to the 0/1/2 tier.
  const AERO_STYLE = {
    minimal:       { lvl: 0, vane: 0 },
    le_mans:       { lvl: 0, vane: 1 },   // low DF but Le Mans splitters
    low:           { lvl: 1, vane: 1 },
    s_duct:        { lvl: 1, vane: 2 },   // S-duct feeds twin turning vanes
    medium:        { lvl: 2, vane: 1 },
    beam_wing:     { lvl: 2, beam: 1, vane: 1 },
    rake_setup:    { lvl: 3, vane: 2 },
    diffuser:      { lvl: 3, beam: 1, vane: 2 },
    high:          { lvl: 3, vane: 2 },
    underfloor:    { lvl: 3, beam: 1, vane: 3 },  // full ground-effect vane cluster
    extreme:       { lvl: 4, vane: 3 },
    active_aero:   { lvl: 3, drs: 1, vane: 2 },
    ground_effect: { lvl: 4, beam: 1, vane: 3 },
  };
  // Per-OPTION engine airbox: `in` intake-mouth scale, `snork` raised snorkel,
  // `twin` twin exhaust tips, `inlet` sidepod radiator-inlet SHAPE (0 slim
  // low-drag letterbox, 1 stock rounded mouth, 2 wide high-flow scoop, 3 tall
  // twin-nostril). Keyed by resolved engine id (else the 0/1/2 tier).
  const ENGINE_STYLE = {
    stock:        { in: 0.85, inlet: 1 }, lean_burn:   { in: 0.72, inlet: 0 },
    performance:  { in: 1.15, twin: 1, inlet: 2 }, v_power: { in: 1.10, twin: 1, inlet: 2 },
    turbo:        { in: 1.35, snork: 1, inlet: 2 }, highrev: { in: 1.25, snork: 1, inlet: 3 },
    evo_kit:      { in: 1.20, twin: 1, inlet: 2 }, sprint:  { in: 1.15, twin: 1, inlet: 3 },
    race:         { in: 1.55, snork: 1, twin: 1, inlet: 3 },
    torque_curve: { in: 1.00, inlet: 1 }, hybrid_max: { in: 1.30, snork: 1, twin: 1, inlet: 2 },
    quali_engine: { in: 1.65, snork: 1, twin: 1, inlet: 3 },
    manu_mercedes:{ in: 1.55, snork: 1, twin: 1, inlet: 2 }, manu_ferrari: { in: 1.55, snork: 1, twin: 1, inlet: 3 },
    manu_ford:    { in: 1.50, snork: 1, twin: 1, inlet: 2 }, manu_honda:   { in: 1.50, snork: 1, twin: 1, inlet: 3 },
    manu_audi:    { in: 1.50, snork: 1, twin: 1, inlet: 2 },
  };
  // Per-OPTION brake package: `cal` caliper accent colour (peeks through the rim
  // spokes), `duct` brake-duct size. Keyed by resolved brake id (else tier).
  const BRAKE_STYLE = {
    standard:     { cal: null,               duct: 0.55 },
    drilled:      { cal: null,               duct: 0.72 },
    sport:        { cal: [0.95, 0.45, 0.05], duct: 0.95 },  // orange
    titanium:     { cal: [0.70, 0.72, 0.78], duct: 0.85 },  // silver
    endurance:    { cal: [0.95, 0.80, 0.10], duct: 1.05 },  // yellow
    dual_caliper: { cal: [0.95, 0.72, 0.08], duct: 1.15 },  // amber
    carbon:       { cal: [0.85, 0.12, 0.10], duct: 1.25 },  // red
    ventilated:   { cal: [0.90, 0.15, 0.12], duct: 1.35 },  // red
    carbon_mag:   { cal: [0.85, 0.66, 0.16], duct: 1.45 },  // gold
    regen_brakes: { cal: [0.15, 0.78, 0.38], duct: 1.25 },  // green (energy)
    ceramic:      { cal: [0.97, 0.10, 0.08], duct: 1.60, rim: [0.55, 0.56, 0.60] },  // bright red + pale rim
    brembo_evo:   { cal: [0.98, 0.62, 0.05], duct: 1.75, rim: [0.42, 0.34, 0.12] },  // Brembo gold + bronze rim
  };
  // Premium alloy brakes get gold/pale magnesium rims (peek between the spokes).
  BRAKE_STYLE.carbon_mag.rim = [0.48, 0.40, 0.16];   // magnesium bronze
  BRAKE_STYLE.dual_caliper.rim = [0.30, 0.30, 0.34];
  // Per-OPTION suspension: `ride` height offset (m), `arm` wishbone thickness
  // mult, `push` a visible actuating strut, `pull` render that strut as a
  // PULLROD (top-outboard → bottom-inboard diagonal) instead of a pushrod
  // (bottom-outboard → top-inboard). Keyed by resolved option id.
  const SUSP_STYLE = {
    comfort:         { ride:  0.055, arm: 0.80, push: 0 },   // tall + soft
    standard:        { ride:  0.000, arm: 1.00, push: 0 },
    sport:           { ride: -0.010, arm: 1.05, push: 0 },
    carbon_pushrods: { ride: -0.015, arm: 0.90, push: 1 },
    kerb_spec:       { ride:  0.010, arm: 1.10, push: 0 },
    low_ride:        { ride: -0.035, arm: 1.05, push: 0 },
    racing:          { ride: -0.025, arm: 1.15, push: 1 },
    triple_damper:   { ride: -0.020, arm: 1.20, push: 1 },
    titanium_spring: { ride: -0.020, arm: 0.85, push: 1, pull: 1 },   // thin Ti pullrods
    inboard_dampers: { ride: -0.020, arm: 1.10, push: 1, pull: 1 },   // pullrod, inboard dampers
    track:           { ride: -0.040, arm: 1.30, push: 1 },   // slammed + stiff
    heave_spring:    { ride: -0.030, arm: 1.20, push: 1, pull: 1 },
    active:          { ride: -0.045, arm: 1.25, push: 1 },   // fully slammed
  };
  // Per-OPTION gearbox: `strakes` diffuser strake count + `fin` a rear crash
  // structure fin. Keyed by resolved option id.
  const GBOX_STYLE = {
    standard:       { strakes: 0, fin: 0 },
    close_ratio:    { strakes: 2, fin: 0 },
    long_ratio:     { strakes: 2, fin: 0 },
    short_stack:    { strakes: 3, fin: 1 },
    sequential_pro: { strakes: 4, fin: 1 },
    carbon_case:    { strakes: 4, fin: 1 },
    f1_spec:        { strakes: 5, fin: 1 },
  };
  // Per-OPTION ERS: `led` HDR accent-strip colour (glows/blooms at night) + `pack`
  // battery-pack size mult. Keyed by resolved ers id (else a tier fallback). Every
  // ERS choice now reads distinctly — a coloured battery-pack light down the pods.
  const ERS_STYLE = {
    standard:       { led: [0.15, 0.55, 1.6],  pack: 1.00 },  // blue
    regen_plus:     { led: [0.12, 1.5,  0.55], pack: 1.05 },  // green
    harvest:        { led: [0.18, 1.35, 0.95], pack: 0.95 },  // teal
    split_deploy:   { led: [0.85, 0.55, 1.7],  pack: 1.10 },  // violet
    mgu_k_max:      { led: [1.7,  0.95, 0.15], pack: 1.15 },  // amber
    deploy:         { led: [1.9,  0.4,  0.15], pack: 1.20 },  // orange
    thermal_max:    { led: [1.95, 0.5,  0.08], pack: 1.05 },  // hot orange
    torque_fill:    { led: [0.8,  0.3,  1.85], pack: 1.15 },  // purple
    overtake_focus: { led: [2.05, 0.15, 0.55], pack: 1.20 },  // magenta
    race_mode:      { led: [0.25, 0.95, 2.05], pack: 1.20 },  // cyan
    full_attack:    { led: [2.25, 0.22, 0.16], pack: 1.30 },  // red
    overcharge:     { led: [2.4,  0.75, 0.06], pack: 1.35 },  // gold-hot
  };
  // Per-OPTION fuel: filler-cap `cap` colour (HDR on the hot blends → glows).
  const FUEL_STYLE = {
    standard:       { cap: [0.22, 0.20, 0.26] },
    high_octane:    { cap: [1.5,  1.15, 0.18] },   // yellow
    biofuel:        { cap: [0.18, 1.35, 0.5] },    // green (sustainable)
    race_blend:     { cap: [1.6,  0.6,  0.14] },   // orange
    quali_mix:      { cap: [0.95, 0.28, 1.5] },    // violet
    custom_formula: { cap: [1.9,  0.25, 1.25] },   // magenta
  };
  // Per-DRIVER helmet crown-stripe palette (indexed by car number) so team-mates
  // and the field carry distinct helmets.
  const HELMET_ACCENT = [
    [0.95, 0.20, 0.15], [0.15, 0.45, 0.95], [0.97, 0.82, 0.10], [0.90, 0.90, 0.95],
    [0.15, 0.75, 0.35], [0.85, 0.40, 0.90], [0.98, 0.50, 0.10], [0.10, 0.80, 0.80],
  ];

  function build(color, color2, opts) {
    const noWheels = opts && opts.noWheels;
    const out = { pos: [], nrm: [], col: [], idx: [] };
    const c1 = color  || [0.8, 0.05, 0.05];
    const c2 = color2 || [0.9, 0.9, 0.1];
    // Parts-driven visual identity: opts.parts is { categoryId: 0|1|2 } (see
    // Parts.getVisualTiers in parts.js). Every lookup defaults to 1 (neutral/
    // today's-baseline) when absent, so AI/no-parts builds are unaffected.
    const T = (opts && opts.parts) || {};
    const tier = (id) => T[id] != null ? T[id] : 1;
    const suspT = tier("suspension");
    const suspStyle = (T._ids && T._ids.suspension && SUSP_STYLE[T._ids.suspension]) || null;

    // --- Floor plank (flat) --- per-OPTION suspension shifts ride height.
    const rideDY = suspStyle ? suspStyle.ride : (suspT === 0 ? 0.060 : suspT === 2 ? -0.048 : 0);
    addBox(out, 0, 0.07 + rideDY, -0.3, 1.5, 0.06, 3.2, CARBON);

    // --- Nose: one crisp tapered wedge, tip to bulkhead (lengthened tip) ---
    const nF = { z: 2.95, y: 0.29, w: 0.13, h: 0.085, t: 0.75 };
    const nR = { z: 1.05, y: 0.34, w: 0.46, h: 0.36, t: 0.80 };
    addSpan(out, nF, nR, c1);
    addTopBevel(out, nF, nR, 0.030, c1);

    // --- Monocoque: slab from bulkhead to cockpit ---
    const mF = { z: 1.05, y: 0.36, w: 0.46, h: 0.40, t: 0.80 };
    const mR = { z: 0.05, y: 0.40, w: 0.62, h: 0.50, t: 0.78 };
    addSpan(out, mF, mR, c1);
    addTopBevel(out, mF, mR, 0.035, c1);

    // --- Cockpit surround: raised collar, narrowing rearward ---
    const kF = { z: 0.05, y: 0.42, w: 0.62, h: 0.46, t: 0.72 };
    const kR = { z: -0.55, y: 0.44, w: 0.58, h: 0.50, t: 0.60 };
    addSpan(out, kF, kR, c1);
    addTopBevel(out, kF, kR, 0.030, c1);

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
    const ersC2 = tier("ers") === 2 ? [c2[0]*1.8, c2[1]*1.8, c2[2]*1.8] : c2;
    const hF = ckpt ? { z: 2.35, y: 0.40, w: 0.26, h: 0.11, t: 0.60 }
                    : { z: 1.00, y: 0.44, w: 0.34, h: 0.10, t: 0.62 };
    const hR = ckpt ? { z: 0.10, y: 0.72, w: 0.48, h: 0.22, t: 0.56 }
                    : { z: 0.10, y: 0.60, w: 0.42, h: 0.16, t: 0.58 };
    addSpan(out, hF, hR, c1, c1);
    addTopBevel(out, hF, hR, 0.026, c1);
    // Accent stripe down the vanity deck crown (team colour).
    addBox(out, 0, ckpt ? 0.73 : 0.665, ckpt ? 0.90 : 0.45, 0.10, 0.02, ckpt ? 1.75 : 0.80, ersC2);

    // --- Cockpit-side head-protection bolsters: the raised survival-cell edges
    // flanking the cockpit opening. They frame the driver's view left/right in
    // the onboard cam and give the tub real shoulders in chase. In cockpit view
    // they're remodelled into WIDE, TALL sidepod shoulders that rise beside the
    // driver and slope down toward the nose — the big red bodywork "V" that
    // frames a real F1 onboard (see reference). ---
    if (ckpt) {
      for (const s of [-1, 1]) {
        // A long, wide, sloping shoulder fairing: tallest + widest just IN FRONT
        // of the driver's eye (z ~0.12, so it frames the lower-left/right of the
        // onboard view) sweeping down and tapering toward the nose. This is the
        // big red bodywork "V" of a real F1 onboard.
        addBlock(out, [
          [s*0.26, 0.40, 1.55], [s*0.56, 0.28, 1.55], [s*0.54, 0.44, 1.52], [s*0.26, 0.50, 1.52],  // front (nose end)
          [s*0.28, 0.40, 0.12], [s*0.62, 0.28, 0.12], [s*0.60, 0.62, 0.06], [s*0.28, 0.58, 0.06],  // rear (narrowed + lowered — was ballooning into the onboard FOV)
        ], c1);
        // Accent edge stripe along the shoulder crown.
        addBox(out, s*0.44, 0.54, 0.70, 0.025, 0.025, 1.5, c2);
      }
    } else {
      for (const s of [-1, 1]) {
        addBlock(out, [
          [s*0.24, 0.42, 0.14], [s*0.40, 0.42, 0.14], [s*0.40, 0.60, 0.10], [s*0.24, 0.58, 0.10],
          [s*0.24, 0.44, -0.42], [s*0.40, 0.44, -0.42], [s*0.40, 0.62, -0.44], [s*0.24, 0.60, -0.44],
        ], c1);
      }
    }

    // --- Airbox + engine cover: sit BEHIND the driver, so they're skipped in
    // the cockpit build (ckpt) — under brake pitch they'd otherwise swing up
    // into the top/back of the onboard frame ("the thing behind us cutting in").
    if (!ckpt) {
      // Airbox: trapezoid block above the cockpit (dark intake front). Per-OPTION
      // via ENGINE_STYLE: intake-mouth scale, a raised snorkel, cover louvres.
      const engT = tier("engine");
      const engId = T._ids && T._ids.engine;
      const engStyle = (engId && ENGINE_STYLE[engId]) || null;
      const inScale = engStyle ? engStyle.in : (engT === 0 ? 0.52 : engT === 2 ? 1.65 : 1.0);
      const engSnork = engStyle ? !!engStyle.snork : engT === 2;
      addSpan(out, { z: -0.28, y: 0.76, w: 0.30 * inScale, h: 0.20 * inScale, t: 0.55 },
                   { z: -0.75, y: 0.74, w: 0.26 * inScale, h: 0.18 * inScale, t: 0.55 }, c1, INTAKE);
      // Engine cover: roof-ridge prism sloping to the tail
      addSpan(out, { z: -0.55, y: 0.52, w: 0.56, h: 0.62, t: 0.0 },
                   { z: -2.00, y: 0.42, w: 0.26, h: 0.34, t: 0.0 }, c1, c1);
      if (engSnork) {
        // Big-spec power unit tells: a raised airbox snorkel cresting behind the
        // roll hoop + cooling-louvre strips on the engine-cover flanks.
        addSpan(out, { z: -0.18, y: 0.94, w: 0.13, h: 0.11, t: 0.5 },
                     { z: -0.62, y: 0.86, w: 0.11, h: 0.09, t: 0.5 }, c1, INTAKE);
        for (const s of [-1, 1]) addBox(out, s*0.20, 0.58, -1.10, 0.015, 0.10, 0.60, CARBON);
      }
      // Engine-mode indicator LEDs across the airbox intake lip (HDR → bloom at
      // night): green (economy) → amber (standard) → red (max-attack power unit).
      const engLed = engT === 2 ? [2.4, 0.28, 0.12] : engT === 0 ? [0.15, 1.8, 0.55] : [1.9, 1.2, 0.15];
      for (const lx of [-0.06, 0, 0.06]) addBox(out, lx, 0.885, -0.30, 0.02, 0.014, 0.02, engLed);
      // FUEL: per-OPTION filler cap colour (HDR blends glow at night).
      const fuelId = T._ids && T._ids.fuel;
      const fuelStyle = (fuelId && FUEL_STYLE[fuelId]) || null;
      const fuelColor = fuelStyle ? fuelStyle.cap : (tier("fuel") === 2 ? [0.95, 0.28, 1.5] : [0.22, 0.20, 0.26]);
      const fuelHi = Math.max(fuelColor[0], fuelColor[1], fuelColor[2]) > 1;
      addBox(out, 0.13, 0.80, -0.55, 0.07, 0.04, 0.15, fuelColor);
      if (fuelHi) addBox(out, 0.13, 0.86, -0.55, 0.04, 0.03, 0.05, fuelColor);
    }

    // --- Sidepods: rectangular slabs — angled inlet undercut, coke-bottle taper ---
    for (const s of [-1, 1]) {
      addBlock(out, [
        [s*0.30, 0.26, 0.55], [s*0.68, 0.26, 0.55], [s*0.68, 0.46, 0.62], [s*0.30, 0.46, 0.62],
        [s*0.30, 0.10, -0.55], [s*0.70, 0.10, -0.55], [s*0.70, 0.44, -0.55], [s*0.30, 0.44, -0.55],
      ], c1, INTAKE);
      addBlock(out, [
        [s*0.30, 0.10, -0.55], [s*0.70, 0.10, -0.55], [s*0.70, 0.44, -0.55], [s*0.30, 0.44, -0.55],
        [s*0.24, 0.12, -1.45], [s*0.42, 0.12, -1.45], [s*0.42, 0.30, -1.45], [s*0.24, 0.30, -1.45],
      ], c1);
      // Sponsor panel decal on the pod flank + floor edge accent strip
      addBox(out, s*0.665, 0.30, -0.12, 0.02, 0.18, 0.55, PANEL);
      addBox(out, s*0.60, 0.10, -0.10, 0.02, 0.08, 0.72, c2);
    }

    // ERS battery-pack LED strip along the sidepod flanks — per-OPTION colour
    // (HDR → glows and blooms at night), pack thickness grows with the spec, so
    // every ERS choice reads distinctly. Falls back to the old tier-2 tint.
    const ersId = T._ids && T._ids.ers;
    const ersStyle = (ersId && ERS_STYLE[ersId]) || null;
    const ersLed = ersStyle ? ersStyle.led : (tier("ers") === 2 ? ersC2 : null);
    const ersPack = ersStyle ? ersStyle.pack : 1.0;
    if (ersLed) {
      for (const s of [-1, 1]) addBox(out, s*0.688, 0.36, -0.12, 0.02, 0.055 * ersPack, 0.55, ersLed);
    }

    // --- 2026 bodywork detailing: a recessed radiator inlet mouth punched into
    // the sidepod front (SHAPE varies per ENGINE_STYLE.inlet), and a row of
    // little floor-edge fences — the fiddly ground-effect furniture that reads
    // as a modern car. Tiny HDR floor-edge LED accents bloom at night. ---
    const engStyleG = (T._ids && T._ids.engine && ENGINE_STYLE[T._ids.engine]) || null;
    const engInlet = engStyleG && engStyleG.inlet != null ? engStyleG.inlet
                   : (tier("engine") === 2 ? 2 : tier("engine") === 0 ? 0 : 1);
    const floorLed = [0.12, 0.9, 1.9];   // cool-cyan floor-edge marker (HDR → blooms)
    for (const s of [-1, 1]) {
      // Inlet mouth: 0 slim letterbox · 1 stock rounded · 2 wide high-flow scoop ·
      // 3 tall twin-nostril. All punched at the same pod-front location.
      if (engInlet === 0) {
        addBox(out, s*0.49, 0.29, 0.605, 0.17, 0.06, 0.05, INTAKE);
      } else if (engInlet === 2) {
        addBox(out, s*0.49, 0.30, 0.610, 0.21, 0.13, 0.06, INTAKE);
        addBox(out, s*0.49, 0.30, 0.628, 0.19, 0.10, 0.03, DARK);       // deep scoop lip
      } else if (engInlet === 3) {
        for (const dz of [-0.06, 0.06])
          addBox(out, s*0.49 + dz, 0.30, 0.608, 0.075, 0.15, 0.06, INTAKE); // twin nostrils
      } else {
        addBox(out, s*0.49, 0.30, 0.605, 0.15, 0.11, 0.05, INTAKE);     // stock rounded
      }
      for (const fz of [0.42, 0.06, -0.30, -0.66, -1.02]) {
        addBox(out, s*0.71, 0.135, fz, 0.014, 0.05, 0.13, CARBON);  // floor-edge fence
      }
      // Floor-edge LED accents between the fences.
      for (const lz of [0.24, -0.48]) addBox(out, s*0.712, 0.115, lz, 0.012, 0.016, 0.05, floorLed);
    }

    // --- Livery accents: nose stripe + airbox spine stripe (team colour 2) ---
    addLoft(out, 1.60, 0, 0.475, 0.09, 0.022, 2.66, 0, 0.352, 0.05, 0.016, c2);
    addBox(out, 0, 0.862, -0.42, 0.06, 0.04, 0.52, c2);

    // --- Paint-job racing stripe: a bold contrasting band down the car's spine
    // (nose → hood → airbox → engine cover), only when the chosen livery
    // specifies one (opts.livery.stripe). Follows the bodywork crown line. ---
    const stripeC = opts && opts.livery && opts.livery.stripe;
    if (stripeC) {
      addLoft(out, 1.55, 0, 0.485, 0.15, 0.022, 2.70, 0, 0.352, 0.085, 0.018, stripeC); // nose spine (wide)
      addBox(out, 0, 0.672, 0.45, 0.13, 0.02, 0.82, stripeC);   // hood crown band
      addBox(out, 0, 0.872, -0.42, 0.08, 0.02, 0.56, stripeC);  // airbox spine band
      if (!ckpt) addBox(out, 0, 0.55, -1.40, 0.07, 0.02, 0.92, stripeC); // engine-cover tail band
    }

    // --- Nose number plate + camera pod (sit on the curved nose top) ---
    addBox(out, 0, 0.437, 1.92, 0.18, 0.022, 0.40, PANEL);
    addBox(out, 0, 0.50, 1.55, 0.06, 0.08, 0.15, DARK);

    // --- Cockpit opening (dark) + halo + front pillar ---
    addBox(out, 0, 0.60, 0.12, 0.40, 0.045, 0.78, [0.04, 0.04, 0.05]);
    for (const s of [-1, 1]) {
      addLoft(out, -0.15, s*0.27, 0.74, 0.06, 0.06,
               0.62,     0,      0.70, 0.06, 0.06, DARK);
    }
    addBox(out, 0, 0.74, -0.18, 0.60, 0.06, 0.07, DARK); // rear hoop
    addBox(out, 0, 0.60,  0.62, 0.05, 0.20, 0.05, DARK); // front pillar

    // --- Side mirrors --- with an HDR marker light on the stalk (blooms at night).
    for (const s of [-1, 1]) {
      addBox(out, s*0.30, 0.72, 0.24, 0.05, 0.03, 0.07, DARK);
      addBox(out, s*0.34, 0.73, 0.24, 0.025, 0.13, 0.10, [0.13, 0.13, 0.14]);
      addBox(out, s*0.335, 0.695, 0.245, 0.02, 0.014, 0.02, [2.1, 1.2, 0.1]); // stalk marker
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
      // T-cam status beacon: small HDR green marker atop the mast (blooms at night).
      addBox(out, 0, 0.988, -0.30, 0.03, 0.02, 0.03, [0.2, 2.2, 0.5]);
    }

    // --- Halo: the titanium cockpit-protection hoop (defining modern-F1 read).
    // A central front pillar rising off the chassis, then two tubular arms
    // arcing up-and-out over the driver and sweeping back down to the collar.
    // Chase/AI only — the first-person cockpit body (ckpt) has its own framing. ---
    if (!ckpt) {
      addBox(out, 0, 0.63, 0.47, 0.035, 0.20, 0.05, HALO);   // front centre pillar
      for (const s of [-1, 1]) {
        addSpan(out, { z: 0.49, x: 0,       y: 0.815, w: 0.055, h: 0.055 },
                     { z: 0.02, x: s*0.30,  y: 0.845, w: 0.050, h: 0.050 }, HALO);  // front arc
        addSpan(out, { z: 0.02, x: s*0.30,  y: 0.845, w: 0.050, h: 0.050 },
                     { z: -0.46, x: s*0.235, y: 0.505, w: 0.050, h: 0.050 }, HALO); // rear arc to collar
      }
      // Halo LED strip: FIA-style row of tell-tale lights along the top of the
      // hoop (HDR team-accent → glows and blooms at night).
      const haloLed = [Math.min(2.4, c2[0]*1.8 + 0.3), Math.min(2.4, c2[1]*1.8 + 0.15), Math.min(2.4, c2[2]*1.8 + 0.1)];
      for (const lz of [0.44, 0.30, 0.16, 0.02])
        addBox(out, 0, 0.842 + (0.49 - lz) * 0.02, lz, 0.05, 0.012, 0.03, haloLed);
      // Wing mirrors on short stalks either side of the cockpit.
      for (const s of [-1, 1]) {
        addBox(out, s*0.37, 0.55, 0.30, 0.13, 0.02, 0.025, DARK);   // stalk
        addBox(out, s*0.47, 0.575, 0.30, 0.035, 0.055, 0.065, c1);  // mirror housing
      }
    }

    // --- Exhaust outlet poking from the tail cap --- per ENGINE option: a lone
    // slim pipe at low spec, a fat central tailpipe flanked by two extra tips
    // for the `twin` engines (see ENGINE_STYLE).
    const exhStyle = (T._ids && T._ids.engine && ENGINE_STYLE[T._ids.engine]) || null;
    const exhTwin = exhStyle ? !!exhStyle.twin : tier("engine") === 2;
    const exhR = exhStyle ? (exhStyle.twin ? 0.09 : (exhStyle.in < 0.9 ? 0.05 : 0.07))
                          : (tier("engine") === 0 ? 0.05 : tier("engine") === 2 ? 0.09 : 0.07);
    addBox(out, 0, 0.40, -2.12, exhR, exhR, 0.16, [0.16, 0.16, 0.17]);
    if (exhTwin) {
      for (const s of [-1, 1]) addBox(out, s*0.15, 0.40, -2.10, 0.045, 0.045, 0.14, [0.16, 0.16, 0.17]);
    }

    // --- Shark fin + engine-cover accent (flat, team accent colour) ---
    // Behind the driver — skipped in the cockpit build.
    if (!ckpt) addBox(out, 0, 0.80, -1.20, 0.03, 0.34, 0.85, ersC2);

    // --- Number board: white panel on the shark fin + the driver number in
    // blocky 7-seg digits, mirrored per side so it reads correctly from both ---
    const num = (opts && opts.num != null && !ckpt) ? opts.num : null;
    if (num != null) {
      addBox(out, 0, 0.82, -1.18, 0.036, 0.22, 0.46, PANEL);
      const ds = String(Math.abs(num | 0) % 100).split("").map(Number);
      const pitch = 0.115, dh = 0.15;
      // m=+1 → the +x (right) face, where a roadside viewer's screen-right is +z;
      // m=-1 → the -x (left) face (screen-right = -z). Digit layout uses m for
      // both the reading order and each digit's left/right segments.
      for (const m of [1, -1]) {
        const xp = m * 0.022;
        ds.forEach((d, i) =>
          addDigit(out, xp, 0.82, -1.18 + m * ((i - (ds.length - 1) / 2) * pitch), dh, m, d, DARK));
      }
    }

    // --- Sponsor boards: white panels on the sidepod flanks + rear-wing endplates ---
    for (const s of [-1, 1]) {
      addBox(out, s*0.700, 0.30, 0.0, 0.020, 0.11, 0.46, PANEL);
      addBox(out, s*0.528, 0.90, -2.42, 0.012, 0.18, 0.34, PANEL);
    }

    // --- Front wing: ANGLED wedge elements in the block language — thin
    // leading edges rising to thicker trailing edges (real attack angle),
    // swept endplates that grow rearward, and nose pylons so the wing hangs
    // from the nose instead of floating. AERO visualTier reshapes element
    // count / endplate size / dive-plane reach (tier 1 = today's baseline). ---
    const aeroT = tier("aero");
    const aeroId = T._ids && T._ids.aero;
    const aeroStyle = (aeroId && AERO_STYLE[aeroId]) || null;
    // Continuous downforce level 0..4 — per-option when the id is known, else
    // mapped from the coarse 0/1/2 tier (AI / no parts → medium, lvl 2).
    const aLvl  = aeroStyle ? aeroStyle.lvl : (aeroT === 0 ? 0 : aeroT === 2 ? 4 : 2);
    const aBeam = aeroStyle ? (aeroStyle.beam || 0) : (aeroT === 2 ? 1 : 0);
    const aDrs  = aeroStyle ? (aeroStyle.drs  || 0) : 0;

    // Front wing: a multi-element CASCADE — a structural main plane plus a stack
    // of progressively larger flap elements, each a thin wedge (low/forward
    // leading edge → higher/rearward trailing edge = attack angle) separated by
    // a visible slot gap. Element count + span + endplate/canard size grow with
    // aLvl. Half-span reaches the endplate at fwHalf.
    const fwSpan = aLvl <= 0 ? 0.70 : (aLvl === 1 ? 0.86 : 1.0);
    const fwHalf = 0.90 * fwSpan;                 // half-span (endplate sits just outside)
    // [zLead, yLead, zTrail, yTrail, chordWMul, thick, colour] — stacked front→back.
    const fwElems = [
      [2.66, 0.055, 2.42, 0.095, 1.00, 0.028, c1],   // main plane (structural, team base)
      [2.48, 0.100, 2.26, 0.150, 0.98, 0.026, c2],   // flap 1
    ];
    if (aLvl >= 1) fwElems.push([2.32, 0.150, 2.12, 0.215, 0.95, 0.024, c2]); // flap 2
    if (aLvl >= 3) fwElems.push([2.18, 0.215, 2.00, 0.285, 0.92, 0.022, c2]); // flap 3
    if (aLvl >= 4) fwElems.push([2.06, 0.290, 1.90, 0.360, 0.88, 0.020, c2]); // flap 4 (max DF)
    for (const e of fwElems) {
      addSpan(out, { z: e[0], y: e[1], w: 2.0 * fwHalf * e[4], h: e[5] },
                   { z: e[2], y: e[3], w: 1.96 * fwHalf * e[4], h: e[5] * 1.5 }, e[6]);
    }
    // Curved-up outer tips: the top flap kicks upward as it meets the endplate.
    const topE = fwElems[fwElems.length - 1];
    for (const s of [-1, 1]) {
      addSpan(out, { z: topE[2], x: s * (fwHalf * topE[4] - 0.02), y: topE[3], w: 0.10, h: topE[5] * 1.4 },
                   { z: topE[2] - 0.02, x: s * (fwHalf + 0.01), y: topE[3] + 0.075, w: 0.06, h: topE[5] * 1.6 }, topE[6]);
    }
    for (const s of [-1, 1]) {
      const epW = aLvl >= 4 ? 0.055 : (aLvl <= 0 ? 0.024 : 0.038);
      const epX = s * (fwHalf + 0.02);
      // Main endplate: tall swept plate that grows rearward.
      addSpan(out, { z: 2.62, x: epX,          y: 0.155, w: epW, h: 0.22 },
                   { z: 2.00, x: epX + s*0.03, y: 0.220, w: epW, h: 0.36 }, c2);
      // Footplate: the horizontal "foot" kicking outward along the endplate base
      // (the ground-effect seal that reads as a real front-wing foot).
      addBox(out, epX + s*0.025, 0.055, 2.30, 0.11, 0.014, 0.50, c1);
      // Canard / dive-plane cascade on the outer face of the endplate — more
      // planes at higher DF (aLvl 1 → one, 3 → two, 4 → three).
      const nCan = aLvl >= 4 ? 3 : (aLvl >= 3 ? 2 : (aLvl >= 1 ? 1 : 0));
      for (let i = 0; i < nCan; i++) {
        const cz = 2.50 - i * 0.17, cy = 0.150 + i * 0.052;
        addSpan(out, { z: cz,        x: s * (fwHalf - 0.03), y: cy,        w: 0.028, h: 0.11 },
                     { z: cz - 0.20, x: epX + s*0.035,       y: cy + 0.055, w: 0.028, h: 0.16 }, c1);
      }
      // Endplate-tip LED marker (HDR amber → glows and blooms at night).
      addBox(out, epX + s*0.03, 0.375, 2.02, 0.02, 0.02, 0.022, [2.4, 0.55, 0.06]);
      addBox(out, s*0.10, 0.20, 2.44, 0.05, 0.17, 0.16, c1);                  // nose pylon
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
      const rwLift = (aLvl - 2) * 0.085;       // lvl0 -0.17 → lvl4 +0.17
      const epSY   = 0.24 + aLvl * 0.20;        // lvl0 0.24 → lvl4 1.04
      const epCY   = 0.82 + rwLift;             // endplate vertical centre
      // Tall swept endplates with a louvre cut-out cluster near the rear edge and
      // a team-colour top-rail highlight strip.
      for (const s of [-1, 1]) {
        addBox(out, s*0.50, epCY, -2.42, 0.05, epSY, 0.52, DARK);
        // Louvre detail: a stack of thin recessed slots near the top-rear corner.
        for (let i = 0; i < 3; i++)
          addBox(out, s*0.513, epCY + epSY*0.5 - 0.06 - i*0.06, -2.30, 0.02, 0.016, 0.16, INTAKE);
        // Top-rail highlight strip (team accent) running the endplate crown.
        addBox(out, s*0.50, epCY + epSY*0.5, -2.44, 0.055, 0.02, 0.5, c2);
      }
      // Clean swept two/three-element rear wing (leading edge low/forward →
      // trailing edge high/back). Main plane sits on the endplate centreline.
      addSpan(out, { z: -2.30, y: epCY + 0.02, w: 1.02, h: 0.032 },
                   { z: -2.52, y: epCY + 0.065, w: 1.02, h: 0.044 }, c1);  // main plane
      if (aLvl >= 2) {
        addSpan(out, { z: -2.34, y: epCY + 0.115, w: 1.02, h: 0.030 },
                     { z: -2.56, y: epCY + 0.170, w: 1.02, h: 0.042 }, c2);  // mid element
      }
      addSpan(out, { z: -2.38, y: epCY + 0.215, w: 1.02, h: 0.035 },
                   { z: -2.64, y: epCY + 0.290, w: 1.02, h: 0.050 }, c2);  // top flap (swept)
      // Swan-neck mount: two slim pylons rising from the deck OVER the top of the
      // main plane (the clean modern over-mount, not a strut hanging beneath).
      for (const s of [-1, 1]) {
        addSpan(out, { z: -2.28, x: s*0.17, y: epCY + 0.02, w: 0.035, h: 0.06 },
                     { z: -2.42, x: s*0.17, y: epCY + 0.24, w: 0.030, h: 0.06 }, DARK);
      }
      if (aLvl >= 4) {
        // Extra proud top element + a T-wing ahead of it (max-DF look).
        addSpan(out, { z: -2.42, y: epCY + 0.350, w: 1.00, h: 0.030 },
                     { z: -2.66, y: epCY + 0.430, w: 1.00, h: 0.044 }, c2);
        addBox(out, 0, 1.02, -1.98, 0.34, 0.02, 0.09, c2);            // T-wing
      }
      if (aBeam) {
        // Prominent beam wing slung low under the main plane, spanning the crash structure.
        addSpan(out, { z: -2.36, y: 0.64 + rwLift * 0.4, w: 0.92, h: 0.032 },
                     { z: -2.58, y: 0.68 + rwLift * 0.4, w: 0.92, h: 0.044 }, c1);
      }
      if (aDrs) {
        // Active-aero DRS: an extra open slot flap proud of the top flap.
        addSpan(out, { z: -2.44, y: epCY + 0.310, w: 0.98, h: 0.022 },
                     { z: -2.60, y: epCY + 0.370, w: 0.98, h: 0.030 }, c2);
        // DRS-open indicator light on the actuator pod (HDR cyan → blooms).
        addBox(out, 0, epCY + 0.335, -2.50, 0.05, 0.022, 0.03, [0.2, 1.7, 2.3]);
      }
      const drsSX = aLvl >= 3 ? 0.13 : 0.10;
      addBox(out, 0, epCY + 0.265, -2.52, drsSX, 0.05, 0.18, DARK); // DRS actuator pod
      // Rear-wing endplate marker lights (HDR amber) — small blooming tell each side.
      for (const s of [-1, 1]) addBox(out, s*0.50, epCY + epSY * 0.42, -2.60, 0.03, 0.03, 0.025, [1.9, 0.95, 0.12]);

      // --- FIA rain light: dark housing + HDR-red LED panel on the rear crash
      // structure. The >1 albedo glows through the night emissive path (and blooms),
      // so every car trails a visible red light after dark / in spray. A brighter
      // central brake-light LED sits proud on the same housing. ---
      addBox(out, 0, 0.50, -2.52, 0.13, 0.18, 0.10, DARK);
      addBox(out, 0, 0.50, -2.585, 0.10, 0.13, 0.03, [2.6, 0.08, 0.06]);
      addBox(out, 0, 0.50, -2.60, 0.04, 0.05, 0.02, [3.4, 0.12, 0.05]);   // brake-light core

      // --- Rear diffuser --- AERO visualTier scales width + front kick-up height.
      // Tucked UP and pulled IN (vs. the old low, wide, overhanging slab) so it
      // reads as a diffuser ramp under the crash structure instead of a big flat
      // reflective "shelf" sticking out behind the tail — the underbody now
      // mirrors the sky/road, and a broad down-facing plane there caught it.
      const diffW  = 0.72 + aLvl * 0.145;   // lvl0 0.72 → lvl4 1.30
      const diffH1 = 0.40 + aLvl * 0.325;   // lvl0 0.40 → lvl4 1.70
      addLoft(out, -2.52, 0, 0.34, 1.12 * diffW, 0.30, -1.90, 0, 0.17, 0.92 * diffW, 0.14 * diffH1,
              [0.06, 0.06, 0.07]);

      // --- Gearbox visual tell: per-OPTION diffuser strake count + a rear crash
      // structure fin (GBOX_STYLE). More strakes = higher-spec 'box. ---
      const gbId = T._ids && T._ids.gearbox;
      const gbStyle = (gbId && GBOX_STYLE[gbId]) || null;
      const gbStrakes = gbStyle ? gbStyle.strakes : (tier("gearbox") === 2 ? 5 : 0);
      const gbFin = gbStyle ? gbStyle.fin : (tier("gearbox") === 2 ? 1 : 0);
      if (gbStrakes > 0) {
        const half = (gbStrakes - 1) / 2;
        for (let i = 0; i < gbStrakes; i++) {
          addBox(out, (i - half) * 0.24, 0.19, -2.20, 0.015, 0.13, 0.42, CARBON);
        }
      }
      if (gbFin) addBox(out, 0, 0.34, -2.30, 0.02, 0.14, 0.28, CARBON);   // crash-structure fin
    }

    // --- Brake duct fairings (front + rear wheels) --- per BRAKES option: duct
    // size + a big-brake winglet. Cockpit build keeps only the FRONT ducts.
    const brakesT = tier("brakes");
    const brakeId = T._ids && T._ids.brakes;
    const brakeStyle = (brakeId && BRAKE_STYLE[brakeId]) || null;
    const ductMul = brakeStyle ? brakeStyle.duct : (brakesT === 0 ? 0.5 : brakesT === 2 ? 1.9 : 1.0);
    // Hot-brake glow: high-spec carbon brakes run their discs cherry-red — an HDR
    // disc peeking through the wheel that intensifies with the brake package.
    const brakeGlow = ductMul > 1.15 ? [Math.min(2.6, 0.7 + ductMul * 0.9), 0.16 * ductMul, 0.05] : null;
    for (const s of [-1, 1]) {
      addBox(out, s*0.60, 0.28, 1.89, 0.06, 0.20 * ductMul, 0.13 * ductMul, DARK);
      // Big-brake spec: a horizontal duct winglet scooping over each front wheel.
      if (ductMul >= 1.3) addBox(out, s*0.65, 0.42, 1.86, 0.11, 0.02, 0.15, CARBON);
      if (!ckpt) addBox(out, s*0.58, 0.30, -1.80, 0.06, 0.18 * ductMul, 0.12 * ductMul, DARK);
      if (brakeGlow) {
        addBox(out, s*0.71, 0.34, 1.70, 0.02, 0.13, 0.13, brakeGlow);           // front disc
        if (!ckpt) addBox(out, s*0.69, 0.34, -1.60, 0.02, 0.15, 0.15, brakeGlow); // rear disc
      }
    }

    // --- Suspension wishbones --- SUSPENSION tier scales thickness + follows
    // the ride-height shift from the floor plank above. Cockpit build keeps
    // only the FRONT pair (rears sit behind the seat).
    const wbMul = suspStyle ? suspStyle.arm : (suspT === 0 ? 0.85 : suspT === 2 ? 1.3 : 1.0);
    const wbPush = suspStyle ? suspStyle.push : (suspT === 2 ? 1 : 0);
    // Pullrod actuator runs the opposite diagonal to a pushrod (top-outboard →
    // bottom-inboard vs bottom-outboard → top-inboard) — a clear layout tell.
    const wbPull = suspStyle && suspStyle.pull ? 1 : 0;
    for (const s of [-1, 1]) {
      addBox(out, s*0.50, 0.24 + rideDY,  1.70, 0.36, 0.05 * wbMul, 0.06 * wbMul, DARK); // front lower
      addBox(out, s*0.50, 0.42 + rideDY,  1.63, 0.36, 0.05 * wbMul, 0.06 * wbMul, DARK); // front upper
      if (wbPush) {
        if (wbPull) addStrut(out, s*0.60, 0.44 + rideDY, s*0.32, 0.20 + rideDY, 1.66, 0.032, 0.032, DARK); // front pullrod
        else        addStrut(out, s*0.60, 0.20 + rideDY, s*0.32, 0.44 + rideDY, 1.66, 0.032, 0.032, DARK); // front pushrod
      }
      if (!ckpt) {
        addBox(out, s*0.49, 0.26 + rideDY, -1.60, 0.34, 0.05 * wbMul, 0.06 * wbMul, DARK); // rear lower
        addBox(out, s*0.49, 0.44 + rideDY, -1.53, 0.34, 0.05 * wbMul, 0.06 * wbMul, DARK); // rear upper
        if (wbPush) {
          if (wbPull) addStrut(out, s*0.58, 0.46 + rideDY, s*0.30, 0.22 + rideDY, -1.56, 0.032, 0.032, DARK); // rear pullrod
          else        addStrut(out, s*0.58, 0.22 + rideDY, s*0.30, 0.46 + rideDY, -1.56, 0.032, 0.032, DARK); // rear pushrod
        }
      }
    }

    // --- Wheels --- (skipped for the player car, which draws animated wheels)
    // Per-compound Pirelli band colour when the resolved tyre id is known
    // (opts.parts._ids.tyres), else the coarse tier tint. BRAKES tier 2 adds
    // a caliper accent.
    if (!noWheels) {
      const tyreId = T._ids && T._ids.tyres;
      const tyreBand = (tyreId && TYRE_PIRELLI[tyreId]) || TYRE_BAND[tier("tyres")];
      // Per-option caliper accent peeking through the rim spokes, else tier.
      const caliperColor = brakeStyle ? brakeStyle.cal : BRAKE_CALIPER[brakesT];
      const rimColor = brakeStyle && brakeStyle.rim;   // premium alloy rims (else default dark)
      for (const s of [-1, 1]) {
        addWheel(out, s*0.79, 0.34,  1.7, 0.34, 0.32, tyreBand, caliperColor, rimColor);
        addWheel(out, s*0.76, 0.34, -1.6, 0.34, 0.38, tyreBand, caliperColor, rimColor);
      }
    }

    return out;
  }

  return { build, buildWheel, TYRE_BAND, BRAKE_CALIPER, TYRE_PIRELLI, BRAKE_STYLE };
})();
