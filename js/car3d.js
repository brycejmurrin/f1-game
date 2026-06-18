/*
 * Apex 26 — procedural low-poly 2026 F1 car.
 * Car3D.build(color, color2) -> plain {pos,nrm,col,idx} for GLX.createMesh.
 * Local space: +Z forward, +Y up, origin on the ground under the car center.
 * ~1.9 m wide, ~5.4 m long, ~0.95 m tall. Flat shaded (duplicated verts).
 */
"use strict";

const Car3D = (function () {
  const DARK = [0.05, 0.05, 0.05];
  const CARBON = [0.07, 0.07, 0.08];
  const HELMET = [0.88, 0.88, 0.92];

  // Push one flat-shaded triangle (a,b,c CCW outward), duplicated verts.
  function addTri(out, a, b, c, col) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
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

  // Flat-shaded quad (a,b,c,d CCW outward).
  function addQuad(out, a, b, c, d, col) {
    addTri(out, a, b, c, col);
    addTri(out, a, c, d, col);
  }

  // Lofted box between two axis-aligned rects: rear rect at z0 centered
  // (x0,y0) sized w0*h0, front rect at z1 (> z0) centered (x1,y1) w1*h1.
  function addLoft(out, z0, x0, y0, w0, h0, z1, x1, y1, w1, h1, col) {
    const b00 = [x0 - w0 / 2, y0 - h0 / 2, z0];
    const b10 = [x0 + w0 / 2, y0 - h0 / 2, z0];
    const b11 = [x0 + w0 / 2, y0 + h0 / 2, z0];
    const b01 = [x0 - w0 / 2, y0 + h0 / 2, z0];
    const f00 = [x1 - w1 / 2, y1 - h1 / 2, z1];
    const f10 = [x1 + w1 / 2, y1 - h1 / 2, z1];
    const f11 = [x1 + w1 / 2, y1 + h1 / 2, z1];
    const f01 = [x1 - w1 / 2, y1 + h1 / 2, z1];
    addQuad(out, f00, f10, f11, f01, col); // front (+Z)
    addQuad(out, b10, b00, b01, b11, col); // back (-Z)
    addQuad(out, b01, f01, f11, b11, col); // top (+Y)
    addQuad(out, b00, b10, f10, f00, col); // bottom (-Y)
    addQuad(out, b10, b11, f11, f10, col); // right (+X)
    addQuad(out, b00, f00, f01, b01, col); // left (-X)
  }

  function addBox(out, cx, cy, cz, sx, sy, sz, col) {
    addLoft(out, cz - sz / 2, cx, cy, sx, sy, cz + sz / 2, cx, cy, sx, sy, col);
  }

  // Wheel along the X axis: dark tyre tread + a 2026-style smooth wheel COVER
  // disc (rim colour) with a bright hub on each face. center (cx,cy,cz), radius
  // r, width w.
  const TYRE = [0.06, 0.06, 0.07];
  const RIM = [0.11, 0.11, 0.13];   // dark cover, only a touch above the tyre
  const HUB = [0.28, 0.28, 0.31];   // small subtle hub, not a bright plate
  function addWheel(out, cx, cy, cz, r, w) {
    const SEG = 16;
    const x0 = cx - w / 2, x1 = cx + w / 2;
    const rimR = r * 0.42;                    // small cover disc, mostly black tyre face
    const hub0 = [x0 - 0.012, cy, cz], hub1 = [x1 + 0.012, cy, cz];
    for (let i = 0; i < SEG; i++) {
      const a0 = (i / SEG) * Math.PI * 2;
      const a1 = ((i + 1) / SEG) * Math.PI * 2;
      const y0 = cy + r * Math.cos(a0), z0 = cz + r * Math.sin(a0);
      const y1 = cy + r * Math.cos(a1), z1 = cz + r * Math.sin(a1);
      const ry0 = cy + rimR * Math.cos(a0), rz0 = cz + rimR * Math.sin(a0);
      const ry1 = cy + rimR * Math.cos(a1), rz1 = cz + rimR * Math.sin(a1);
      const A0 = [x0, y0, z0], A1 = [x0, y1, z1];
      const B0 = [x1, y0, z0], B1 = [x1, y1, z1];
      addQuad(out, A0, A1, B1, B0, TYRE);                 // tread
      // +X face: tyre rim -> cover ring -> hub
      const R0 = [x1, ry0, rz0], R1 = [x1, ry1, rz1];
      addQuad(out, B0, B1, R1, R0, RIM);
      addTri(out, hub1, R0, R1, HUB);
      // -X face
      const L0 = [x0, ry0, rz0], L1 = [x0, ry1, rz1];
      addQuad(out, A1, A0, L0, L1, RIM);
      addTri(out, hub0, L1, L0, HUB);
    }
  }

  function build(color, color2) {
    const out = { pos: [], nrm: [], col: [], idx: [] };
    const c1 = color || [0.8, 0.05, 0.05];
    const c2 = color2 || [0.9, 0.9, 0.1];

    // Floor plank.
    addBox(out, 0, 0.07, -0.3, 1.5, 0.06, 3.2, CARBON);

    // Central chassis / monocoque.
    addBox(out, 0, 0.36, 0, 0.62, 0.5, 1.4, c1);
    addLoft(out, 0.7, 0, 0.36, 0.62, 0.46, 1.5, 0, 0.33, 0.36, 0.30, c1);

    // Tapered nose to a slim tip.
    addLoft(out, 1.5, 0, 0.33, 0.36, 0.30, 2.7, 0, 0.30, 0.12, 0.10, c1);

    // Front wing: main plane + flap + endplates (accent color).
    addBox(out, 0, 0.10, 2.45, 1.76, 0.04, 0.5, c2);
    addBox(out, 0, 0.17, 2.35, 1.70, 0.03, 0.3, c2);
    for (const s of [-1, 1]) {
      addBox(out, s * 0.88, 0.18, 2.45, 0.04, 0.24, 0.55, c2);
    }

    // Sidepods (coke-bottle taper toward the rear).
    for (const s of [-1, 1]) {
      addLoft(out, -1.4, s * 0.38, 0.27, 0.30, 0.26,
              0.7, s * 0.52, 0.30, 0.48, 0.38, c1);
    }

    // Cockpit opening (dark) + halo (3 thin dark bars) + front pillar.
    addBox(out, 0, 0.62, 0.15, 0.42, 0.04, 0.9, [0.04, 0.04, 0.05]);
    for (const s of [-1, 1]) {
      addLoft(out, -0.15, s * 0.27, 0.74, 0.06, 0.06,
              0.62, 0, 0.70, 0.06, 0.06, DARK);
    }
    addBox(out, 0, 0.74, -0.18, 0.60, 0.06, 0.07, DARK); // rear hoop
    addBox(out, 0, 0.60, 0.62, 0.05, 0.20, 0.05, DARK);  // front pillar

    // Driver helmet.
    addBox(out, 0, 0.68, -0.1, 0.24, 0.22, 0.26, HELMET);

    // Engine cover spine + airbox, with a livery accent fin/stripe so the car
    // reads in team colour from behind too.
    addLoft(out, -1.9, 0, 0.40, 0.14, 0.16, -0.45, 0, 0.55, 0.34, 0.40, c1);
    addBox(out, 0, 0.82, -0.5, 0.30, 0.26, 0.55, c1);
    addBox(out, 0, 0.98, -0.55, 0.07, 0.18, 0.5, c2);    // shark-fin accent
    addBox(out, 0, 0.54, -1.2, 0.09, 0.05, 1.0, c2);     // spine stripe

    // Rear wing: tall dark endplates, a two-element main plane (accent) with a
    // DRS gap, and a body-colour beam wing under it.
    for (const s of [-1, 1]) {
      addBox(out, s * 0.50, 0.82, -2.42, 0.05, 0.62, 0.52, DARK);
    }
    addBox(out, 0, 1.04, -2.5, 1.02, 0.06, 0.34, c2);   // upper plane
    addBox(out, 0, 0.90, -2.46, 1.02, 0.05, 0.26, c2);  // lower element
    addBox(out, 0, 0.64, -2.34, 0.98, 0.04, 0.20, c1);  // beam wing

    // Rear diffuser (expands rearward).
    addLoft(out, -2.6, 0, 0.20, 1.25, 0.28, -1.95, 0, 0.12, 1.0, 0.14,
            [0.06, 0.06, 0.07]);

    // Wheels: fronts z=+1.7, rears z=-1.6 (slightly wider), outer edge ±0.95.
    for (const s of [-1, 1]) {
      addWheel(out, s * 0.79, 0.34, 1.7, 0.34, 0.32);
      addWheel(out, s * 0.76, 0.34, -1.6, 0.34, 0.38);
    }

    return out;
  }

  return { build };
})();
