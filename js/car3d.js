/*
 * Apex 26 — procedural low-poly 2026 F1 car.
 * Car3D.build(color, color2) -> plain {pos,nrm,col,idx} for GLX.createMesh.
 * Local space: +Z forward, +Y up, origin on the ground under the car center.
 * ~1.9 m wide, ~5.4 m long, ~0.95 m tall. Flat shaded (duplicated verts).
 */
"use strict";

const Car3D = (function () {
  const DARK   = [0.05, 0.05, 0.05];
  const CARBON = [0.07, 0.07, 0.08];
  const VISOR  = [0.08, 0.08, 0.09];          // tinted visor
  const PANEL  = [0.93, 0.93, 0.94];          // sponsor / number-plate background
  const TYRE   = [0.06, 0.06, 0.07];
  const RIM    = [0.11, 0.11, 0.13];
  const HUB    = [0.28, 0.28, 0.31];

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

  // Wheel: dark tyre tread + smooth 2026-style cover disc + hub.
  function addWheel(out, cx, cy, cz, r, w) {
    const SEG = 16;
    const x0 = cx - w/2, x1 = cx + w/2;
    const rimR = r * 0.42;
    const hub0 = [x0-0.012, cy, cz], hub1 = [x1+0.012, cy, cz];
    for (let i = 0; i < SEG; i++) {
      const a0 = (i / SEG) * Math.PI * 2, a1 = ((i+1) / SEG) * Math.PI * 2;
      const ya0 = cy + r*Math.cos(a0), za0 = cz + r*Math.sin(a0);
      const ya1 = cy + r*Math.cos(a1), za1 = cz + r*Math.sin(a1);
      const rya0 = cy + rimR*Math.cos(a0), rza0 = cz + rimR*Math.sin(a0);
      const rya1 = cy + rimR*Math.cos(a1), rza1 = cz + rimR*Math.sin(a1);
      const A0=[x0,ya0,za0], A1=[x0,ya1,za1], B0=[x1,ya0,za0], B1=[x1,ya1,za1];
      addQuad(out, A0, A1, B1, B0, TYRE);
      const R0=[x1,rya0,rza0], R1=[x1,rya1,rza1];
      addQuad(out, B0, B1, R1, R0, RIM); addTri(out, hub1, R0, R1, HUB);
      const L0=[x0,rya0,rza0], L1=[x0,rya1,rza1];
      addQuad(out, A1, A0, L0, L1, RIM); addTri(out, hub0, L1, L0, HUB);
    }
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

    // --- Floor plank ---
    addBox(out, 0, 0.07, -0.3, 1.5, 0.06, 3.2, CARBON);

    // --- Central chassis / monocoque ---
    addBox(out, 0, 0.36, 0, 0.62, 0.5, 1.4, c1);
    addLoft(out, 0.7, 0, 0.36, 0.62, 0.46, 1.5, 0, 0.33, 0.36, 0.30, c1);

    // --- Nose: sharper taper to a slim pointed tip ---
    addLoft(out, 1.5, 0, 0.33, 0.36, 0.30, 2.7, 0, 0.27, 0.10, 0.08, c1);
    // Number-plate panel on the nose top (white background for car #)
    addBox(out, 0, 0.46, 1.92, 0.20, 0.025, 0.42, PANEL);
    // Camera pod above the nose (as per 2026 regulations)
    addBox(out, 0, 0.53, 1.62, 0.06, 0.09, 0.16, DARK);

    // --- Front wing: main plane + 2 flaps + taller endplates + dive planes ---
    addBox(out, 0, 0.10, 2.46, 1.78, 0.040, 0.50, c2);   // main plane
    addBox(out, 0, 0.17, 2.36, 1.72, 0.030, 0.30, c2);   // flap 1
    addBox(out, 0, 0.23, 2.25, 1.65, 0.025, 0.22, c2);   // flap 2
    for (const s of [-1, 1]) {
      addBox(out, s*0.89, 0.19, 2.46, 0.04, 0.27, 0.56, c2); // endplate (taller)
      addBox(out, s*0.72, 0.19, 2.42, 0.04, 0.23, 0.44, c2); // inner dive plane
    }

    // --- Sidepods: coke-bottle taper + sponsor panel + floor edge fin ---
    for (const s of [-1, 1]) {
      addLoft(out, -1.4, s*0.38, 0.27, 0.30, 0.26,
                   0.7, s*0.52, 0.30, 0.48, 0.38, c1);
      // Sponsor panel on the sidepod outer face (near-white, slightly proud)
      addBox(out, s*0.70, 0.29, -0.18, 0.03, 0.21, 0.62, PANEL);
      // Floor edge fin (c2 accent strip along the floor edge)
      addBox(out, s*0.60, 0.10, -0.10, 0.02, 0.08, 0.72, c2);
    }

    // --- Cockpit opening (dark) + halo + front pillar ---
    addBox(out, 0, 0.62, 0.15, 0.42, 0.04, 0.90, [0.04, 0.04, 0.05]);
    for (const s of [-1, 1]) {
      addLoft(out, -0.15, s*0.27, 0.74, 0.06, 0.06,
               0.62,     0,      0.70, 0.06, 0.06, DARK);
    }
    addBox(out, 0, 0.74, -0.18, 0.60, 0.06, 0.07, DARK); // rear hoop
    addBox(out, 0, 0.60,  0.62, 0.05, 0.20, 0.05, DARK); // front pillar

    // --- Side mirrors: stalk + dark housing on each side of the cockpit ---
    for (const s of [-1, 1]) {
      addBox(out, s*0.30, 0.75, 0.24, 0.05, 0.03, 0.07, DARK);
      addBox(out, s*0.34, 0.76, 0.24, 0.025, 0.14, 0.10, [0.13, 0.13, 0.14]);
    }

    // --- Driver helmet: team-coloured base + dark visor + accent crown stripe ---
    addBox(out, 0, 0.68, -0.10, 0.24, 0.22, 0.26, c1);    // base in team colour
    addBox(out, 0, 0.67,  0.04, 0.22, 0.09, 0.03, VISOR); // visor strip
    addBox(out, 0, 0.79, -0.08, 0.12, 0.03, 0.20, c2);    // crown stripe

    // --- Engine cover spine + airbox + shark-fin + side sponsor panels ---
    addLoft(out, -1.9, 0, 0.40, 0.14, 0.16, -0.45, 0, 0.55, 0.34, 0.40, c1);
    addBox(out, 0, 0.82, -0.50, 0.30, 0.26, 0.55, c1);
    addBox(out, 0, 0.98, -0.55, 0.07, 0.18, 0.50, c2);   // shark-fin accent
    addBox(out, 0, 0.54, -1.20, 0.09, 0.05, 1.00, c2);   // spine stripe
    // Sponsor panels on the engine cover sides
    for (const s of [-1, 1]) {
      addBox(out, s*0.16, 0.82, -0.48, 0.025, 0.17, 0.36, PANEL);
    }

    // --- Rear wing: tall endplates + 2-element main plane + beam wing ---
    for (const s of [-1, 1]) {
      addBox(out, s*0.50, 0.82, -2.42, 0.05, 0.62, 0.52, DARK);
    }
    addBox(out, 0, 1.04, -2.50, 1.02, 0.06, 0.34, c2);  // upper plane
    addBox(out, 0, 0.90, -2.46, 1.02, 0.05, 0.26, c2);  // lower element
    addBox(out, 0, 0.64, -2.34, 0.98, 0.04, 0.20, c1);  // beam wing

    // --- FIA rain light: dark housing + HDR-red LED panel on the rear crash
    // structure. The >1 albedo glows through the night emissive path (and blooms),
    // so every car trails a visible red light after dark / in spray. ---
    addBox(out, 0, 0.50, -2.52, 0.13, 0.18, 0.10, DARK);
    addBox(out, 0, 0.50, -2.585, 0.10, 0.13, 0.03, [2.6, 0.08, 0.06]);

    // --- Rear diffuser ---
    addLoft(out, -2.6, 0, 0.20, 1.25, 0.28, -1.95, 0, 0.12, 1.0, 0.14,
            [0.06, 0.06, 0.07]);

    // --- Brake duct fairings (in front of each front wheel) ---
    for (const s of [-1, 1]) {
      addBox(out, s*0.60, 0.28, 1.89, 0.06, 0.20, 0.13, DARK);
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
