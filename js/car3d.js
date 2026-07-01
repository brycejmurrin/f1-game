/*
 * Apex 26 — procedural 2026 F1 car.
 * Car3D.build(color, color2) -> plain {pos,nrm,col,idx} for GLX.createMesh.
 * Local space: +Z forward, +Y up, origin on the ground under the car center.
 * ~1.9 m wide, ~5.4 m long, ~0.95 m tall.
 *
 * The BODYWORK is BOXY and FLAT-SHADED: chiseled octagonal cross-sections
 * lofted into independent flat panels (top deck / shoulder / flank / underside)
 * so each panel catches one clean reflection tone and flashes as a unit — the
 * per-facet glint of the game's low-poly world style. Only the helmet dome and
 * tyre treads stay smooth-shaded (they are genuinely round).
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

  // ── Chiseled facet loft ─────────────────────────────────────────────────────
  // BOXY, FLAT-SHADED bodywork: each cross-section is a chiseled octagon —
  // flat top deck, angled shoulder, vertical flank, angled underside — and
  // every face between stations is emitted as an independent flat-shaded quad
  // (addQuad). Each panel has ONE normal, so it catches ONE clean reflection /
  // specular tone and FLASHES as a unit when the camera or sun moves — the
  // per-facet glint that defines the low-poly look and matches the game world.
  // stations: FRONT (+Z) → REAR (−Z); each {z, x?, y, w, h, t?, b?} where t/b
  // are the top/bottom deck widths as fractions of w.
  function facetPts(st) {
    const sx = st.x || 0, w2 = st.w / 2, h2 = st.h / 2;
    const t = (st.t !== undefined ? st.t : 0.6) * w2, b = (st.b !== undefined ? st.b : 0.65) * w2;
    const yU = st.y + h2 * 0.36, yL = st.y - h2 * 0.36;
    return [
      [sx + t,  st.y + h2, st.z], [sx + w2, yU, st.z], [sx + w2, yL, st.z], [sx + b,  st.y - h2, st.z],
      [sx - b,  st.y - h2, st.z], [sx - w2, yL, st.z], [sx - w2, yU, st.z], [sx - t,  st.y + h2, st.z],
    ];
  }
  function addFacetLoft(out, stations, col, caps) {
    const NR = stations.length;
    let prev = facetPts(stations[0]);
    for (let r = 1; r < NR; r++) {
      const cur = facetPts(stations[r]);
      const cc = stations[r].col || stations[r - 1].col || col;
      for (let f = 0; f < 8; f++) {
        const g = (f + 1) % 8;
        // Outward winding for front(+Z)→rear station order, CCW ring seen from +Z.
        addQuad(out, prev[f], cur[f], cur[g], prev[g], cc);
      }
      prev = cur;
    }
    const cap = (st, colC, front) => {
      const P = facetPts(st), C = [st.x || 0, st.y, st.z];
      for (let f = 0; f < 8; f++) {
        const g = (f + 1) % 8;
        if (front) addTri(out, C, P[f], P[g], colC);
        else       addTri(out, C, P[g], P[f], colC);
      }
    };
    if (caps && caps.start) cap(stations[0], caps.start, true);
    if (caps && caps.end)   cap(stations[NR - 1], caps.end, false);
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

    // --- Fuselage: nose → monocoque → engine cover, ONE chiseled facet loft ---
    addFacetLoft(out, [
      { z:  2.75, y: 0.300, w: 0.07, h: 0.055, t: 0.55, b: 0.55 },  // nose tip
      { z:  2.20, y: 0.300, w: 0.18, h: 0.13,  t: 0.58, b: 0.55 },
      { z:  1.55, y: 0.320, w: 0.32, h: 0.24,  t: 0.60, b: 0.58 },
      { z:  0.90, y: 0.350, w: 0.52, h: 0.40,  t: 0.62, b: 0.60 },  // cockpit bulkhead
      { z:  0.30, y: 0.385, w: 0.62, h: 0.50,  t: 0.60, b: 0.62 },  // cockpit sides
      { z: -0.35, y: 0.500, w: 0.60, h: 0.70,  t: 0.42, b: 0.62 },  // airbox spine
      { z: -1.05, y: 0.460, w: 0.44, h: 0.52,  t: 0.40, b: 0.62 },
      { z: -1.65, y: 0.420, w: 0.26, h: 0.32,  t: 0.45, b: 0.62 },
      { z: -2.05, y: 0.380, w: 0.12, h: 0.16,  t: 0.50, b: 0.60 },  // tail
    ], c1, { start: c1, end: DARK });

    // --- Sidepods: boxy chiseled slabs, dark radiator inlet at the front ---
    for (const s of [-1, 1]) {
      addFacetLoft(out, [
        { z:  0.70, x: s*0.37, y: 0.30, w: 0.12, h: 0.14, t: 0.72, b: 0.72 },
        { z:  0.40, x: s*0.45, y: 0.31, w: 0.36, h: 0.32, t: 0.75, b: 0.80 },
        { z: -0.15, x: s*0.47, y: 0.30, w: 0.40, h: 0.34, t: 0.72, b: 0.80 },
        { z: -0.85, x: s*0.42, y: 0.27, w: 0.30, h: 0.26, t: 0.70, b: 0.80 },
        { z: -1.50, x: s*0.30, y: 0.22, w: 0.13, h: 0.13, t: 0.70, b: 0.70 },
      ], c1, { start: INTAKE, end: DARK });
      // Sponsor panel decal on the pod flank + floor edge accent strip
      addBox(out, s*0.665, 0.30, -0.12, 0.02, 0.18, 0.55, PANEL);
      addBox(out, s*0.60, 0.10, -0.10, 0.02, 0.08, 0.72, c2);
    }

    // --- Nose number plate + camera pod (sit on the curved nose top) ---
    addBox(out, 0, 0.383, 1.92, 0.18, 0.022, 0.40, PANEL);
    addBox(out, 0, 0.435, 1.60, 0.06, 0.08, 0.15, DARK);

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
    addDome(out, 0, 0.585, -0.08, 0.145, c1);
    addBox(out, 0, 0.64, 0.05, 0.20, 0.075, 0.045, VISOR);  // visor band
    addBox(out, 0, 0.715, -0.09, 0.10, 0.026, 0.17, c2);    // crown stripe

    // --- Airbox intake above the roll hoop (dark void) ---
    addBox(out, 0, 0.76, -0.24, 0.15, 0.09, 0.13, INTAKE);

    // --- T-cam mast above the airbox (the broadcast camera "T") ---
    addBox(out, 0, 0.885, -0.30, 0.035, 0.09, 0.035, DARK);   // stalk
    addBox(out, 0, 0.955, -0.30, 0.30, 0.055, 0.06, DARK);    // T bar

    // --- Exhaust outlet poking from the tail cap ---
    addBox(out, 0, 0.40, -2.12, 0.07, 0.07, 0.16, [0.16, 0.16, 0.17]);

    // --- Shark fin + engine-cover accent (flat, team accent colour) ---
    addBox(out, 0, 0.80, -1.20, 0.03, 0.34, 0.85, c2);

    // --- Front wing: main plane + 2 flaps + endplates + dive planes (flat) ---
    addBox(out, 0, 0.10, 2.46, 1.78, 0.040, 0.50, c2);   // main plane
    addBox(out, 0, 0.17, 2.36, 1.72, 0.030, 0.30, c2);   // flap 1
    addBox(out, 0, 0.23, 2.25, 1.65, 0.025, 0.22, c2);   // flap 2
    for (const s of [-1, 1]) {
      addBox(out, s*0.89, 0.19, 2.46, 0.04, 0.27, 0.56, c2); // endplate
      addBox(out, s*0.72, 0.19, 2.42, 0.04, 0.23, 0.44, c2); // inner dive plane
    }

    // --- Rear wing: tall endplates + 2-element plane + beam wing (flat) ---
    for (const s of [-1, 1]) {
      addBox(out, s*0.50, 0.82, -2.42, 0.05, 0.62, 0.52, DARK);
    }
    addBox(out, 0, 1.04, -2.52, 1.02, 0.055, 0.30, c2); // upper element
    addBox(out, 0, 0.93, -2.46, 1.02, 0.045, 0.24, c2); // mid element
    addBox(out, 0, 0.83, -2.40, 1.02, 0.040, 0.20, c1); // lower element
    addBox(out, 0, 1.085, -2.52, 0.10, 0.05, 0.18, DARK); // DRS actuator pod

    // --- FIA rain light: dark housing + HDR-red LED panel on the rear crash
    // structure. The >1 albedo glows through the night emissive path (and blooms),
    // so every car trails a visible red light after dark / in spray. ---
    addBox(out, 0, 0.50, -2.52, 0.13, 0.18, 0.10, DARK);
    addBox(out, 0, 0.50, -2.585, 0.10, 0.13, 0.03, [2.6, 0.08, 0.06]);

    // --- Rear diffuser ---
    addLoft(out, -2.7, 0, 0.24, 1.40, 0.36, -1.90, 0, 0.12, 1.05, 0.14,
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
