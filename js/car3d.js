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
  function addWheel(out, cx, cy, cz, r, w) {
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
      addQuad(out, B0, B1, R1, R0, RIM); addTri(out, hub1, R0, R1, HUB);
      const L0=[x0,rya0,rza0], L1=[x0,rya1,rza1];
      addQuad(out, A1, A0, L0, L1, RIM); addTri(out, hub0, L1, L0, HUB);
    }
    // Pirelli-style compound band: a bright ring on both sidewalls just inside
    // the tread — the classic modern-F1 tyre read (and a colour accent on an
    // otherwise all-dark corner of the car).
    const BAND = [0.85, 0.10, 0.08];
    for (const bs of [[x0, -1], [x1, 1]]) {
      const xb = bs[0] + bs[1] * 0.004;
      for (let i = 0; i < SEG; i++) {
        const a0 = (i / SEG) * Math.PI * 2, a1 = ((i + 1) / SEG) * Math.PI * 2;
        const P = (rad, a) => [xb, cy + rad * Math.cos(a), cz + rad * Math.sin(a)];
        const A = P(r * 0.96, a0), B = P(r * 0.96, a1), C = P(r * 0.87, a1), D = P(r * 0.87, a0);
        addQuad(out, A, B, C, D, BAND); addQuad(out, A, D, C, B, BAND); // both windings
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
        addQuad(out, A, B, C, D, SPOKE); addQuad(out, A, D, C, B, SPOKE);
      }
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
  function buildWheel(w) {
    const out = { pos: [], nrm: [], col: [], idx: [] };
    addWheel(out, 0, 0, 0, 0.34, w || 0.34);
    return out;
  }

  function build(color, color2, opts) {
    const noWheels = opts && opts.noWheels;
    const out = { pos: [], nrm: [], col: [], idx: [] };
    const c1 = color  || [0.8, 0.05, 0.05];
    const c2 = color2 || [0.9, 0.9, 0.1];

    // --- Floor plank (flat) ---
    addBox(out, 0, 0.07, -0.3, 1.5, 0.06, 3.2, CARBON);

    // --- Nose: one crisp tapered wedge, tip to bulkhead ---
    const nF = { z: 2.65, y: 0.30, w: 0.14, h: 0.09, t: 0.75 };
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
    const hF = ckpt ? { z: 1.95, y: 0.42, w: 0.30, h: 0.12, t: 0.60 }
                    : { z: 1.00, y: 0.44, w: 0.34, h: 0.10, t: 0.62 };
    const hR = ckpt ? { z: 0.10, y: 0.72, w: 0.48, h: 0.22, t: 0.56 }
                    : { z: 0.10, y: 0.60, w: 0.42, h: 0.16, t: 0.58 };
    addSpan(out, hF, hR, c1, c1);
    addTopBevel(out, hF, hR, 0.026, c1);
    // Accent stripe down the vanity deck crown (team colour).
    addBox(out, 0, ckpt ? 0.73 : 0.665, ckpt ? 0.90 : 0.45, 0.10, 0.02, ckpt ? 1.75 : 0.80, c2);

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
          [s*0.30, 0.42, 0.12], [s*0.86, 0.30, 0.12], [s*0.84, 0.92, 0.06], [s*0.30, 0.86, 0.06],  // rear (right by the driver)
        ], c1);
        // Accent edge stripe along the shoulder crown.
        addBox(out, s*0.56, 0.70, 0.70, 0.03, 0.03, 1.5, c2);
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
      // Airbox: trapezoid block above the cockpit (dark intake front)
      addSpan(out, { z: -0.28, y: 0.76, w: 0.30, h: 0.20, t: 0.55 },
                   { z: -0.75, y: 0.74, w: 0.26, h: 0.18, t: 0.55 }, c1, INTAKE);
      // Engine cover: roof-ridge prism sloping to the tail
      addSpan(out, { z: -0.55, y: 0.52, w: 0.56, h: 0.62, t: 0.0 },
                   { z: -2.00, y: 0.42, w: 0.26, h: 0.34, t: 0.0 }, c1, c1);
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

    // --- Livery accents: nose stripe + airbox spine stripe (team colour 2) ---
    addLoft(out, 1.60, 0, 0.475, 0.09, 0.022, 2.66, 0, 0.352, 0.05, 0.016, c2);
    addBox(out, 0, 0.862, -0.42, 0.06, 0.04, 0.52, c2);

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

    // --- Side mirrors ---
    for (const s of [-1, 1]) {
      addBox(out, s*0.30, 0.72, 0.24, 0.05, 0.03, 0.07, DARK);
      addBox(out, s*0.34, 0.73, 0.24, 0.025, 0.13, 0.10, [0.13, 0.13, 0.14]);
    }

    // --- Driver helmet: smooth dome + visor + crown stripe ---
    // Skipped for the first-person cockpit body (opts.noDriver): the camera
    // sits where the driver's head is.
    if (!(opts && opts.noDriver)) {
      addDome(out, 0, 0.585, -0.08, 0.145, c1);
      addBox(out, 0, 0.64, 0.05, 0.20, 0.075, 0.045, VISOR);  // visor band
      addBox(out, 0, 0.715, -0.09, 0.10, 0.026, 0.17, c2);    // crown stripe
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
    }

    // --- Exhaust outlet poking from the tail cap ---
    addBox(out, 0, 0.40, -2.12, 0.07, 0.07, 0.16, [0.16, 0.16, 0.17]);

    // --- Shark fin + engine-cover accent (flat, team accent colour) ---
    // Behind the driver — skipped in the cockpit build.
    if (!ckpt) addBox(out, 0, 0.80, -1.20, 0.03, 0.34, 0.85, c2);

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
    // from the nose instead of floating. ---
    addSpan(out, { z: 2.64, y: 0.070, w: 1.80, h: 0.028 },
                 { z: 2.28, y: 0.105, w: 1.76, h: 0.048 }, c2);   // main plane
    addSpan(out, { z: 2.36, y: 0.135, w: 1.70, h: 0.024 },
                 { z: 2.12, y: 0.200, w: 1.66, h: 0.036 }, c2);   // flap 1
    addSpan(out, { z: 2.20, y: 0.220, w: 1.60, h: 0.022 },
                 { z: 2.00, y: 0.285, w: 1.56, h: 0.030 }, c2);   // flap 2
    for (const s of [-1, 1]) {
      addSpan(out, { z: 2.62, x: s*0.895, y: 0.155, w: 0.035, h: 0.22 },
                   { z: 2.02, x: s*0.925, y: 0.215, w: 0.035, h: 0.35 }, c2); // swept endplate
      addSpan(out, { z: 2.50, x: s*0.72, y: 0.145, w: 0.030, h: 0.16 },
                   { z: 2.16, x: s*0.74, y: 0.215, w: 0.030, h: 0.24 }, c2);  // dive plane
      addBox(out, s*0.10, 0.20, 2.44, 0.05, 0.17, 0.16, c1);                  // nose pylon
    }

    // --- Rear wing: tall endplates + 2-element plane + beam wing (flat) ---
    for (const s of [-1, 1]) {
      addBox(out, s*0.50, 0.82, -2.42, 0.05, 0.62, 0.52, DARK);
    }
    // Angled rear-wing elements (leading edge low/forward → trailing high/back)
    addSpan(out, { z: -2.38, y: 1.005, w: 1.02, h: 0.035 },
                 { z: -2.64, y: 1.075, w: 1.02, h: 0.050 }, c2);  // upper element
    addSpan(out, { z: -2.34, y: 0.900, w: 1.02, h: 0.030 },
                 { z: -2.56, y: 0.955, w: 1.02, h: 0.042 }, c2);  // mid element
    addSpan(out, { z: -2.30, y: 0.805, w: 1.02, h: 0.028 },
                 { z: -2.50, y: 0.850, w: 1.02, h: 0.038 }, c1);  // lower element
    addBox(out, 0, 1.085, -2.52, 0.10, 0.05, 0.18, DARK); // DRS actuator pod

    // --- FIA rain light: dark housing + HDR-red LED panel on the rear crash
    // structure. The >1 albedo glows through the night emissive path (and blooms),
    // so every car trails a visible red light after dark / in spray. ---
    addBox(out, 0, 0.50, -2.52, 0.13, 0.18, 0.10, DARK);
    addBox(out, 0, 0.50, -2.585, 0.10, 0.13, 0.03, [2.6, 0.08, 0.06]);

    // --- Rear diffuser ---
    addLoft(out, -2.7, 0, 0.24, 1.40, 0.36, -1.90, 0, 0.12, 1.05, 0.14,
            [0.06, 0.06, 0.07]);

    // --- Brake duct fairings (front + rear wheels) ---
    for (const s of [-1, 1]) {
      addBox(out, s*0.60, 0.28, 1.89, 0.06, 0.20, 0.13, DARK);
      addBox(out, s*0.58, 0.30, -1.80, 0.06, 0.18, 0.12, DARK);
    }

    // --- Suspension wishbones ---
    for (const s of [-1, 1]) {
      addBox(out, s*0.50, 0.24,  1.70, 0.36, 0.05, 0.06, DARK); // front lower
      addBox(out, s*0.50, 0.42,  1.63, 0.36, 0.05, 0.06, DARK); // front upper
      addBox(out, s*0.49, 0.26, -1.60, 0.34, 0.05, 0.06, DARK); // rear lower
      addBox(out, s*0.49, 0.44, -1.53, 0.34, 0.05, 0.06, DARK); // rear upper
    }

    // --- Wheels --- (skipped for the player car, which draws animated wheels)
    if (!noWheels) {
      for (const s of [-1, 1]) {
        addWheel(out, s*0.79, 0.34,  1.7, 0.34, 0.32);
        addWheel(out, s*0.76, 0.34, -1.6, 0.34, 0.38);
      }
    }

    return out;
  }

  return { build, buildWheel };
})();
