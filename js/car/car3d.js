/* Apex 26 — procedural 2026 F1 car. Car3D.build(color, color2) -> plain {pos,nrm,col,mat,idx} for gfx.createMesh. Local space: +Z forward, +Y up, origin on the gr… */
"use strict";

const Car3D = (function () {
  const SURFACES = Object.freeze({
    custom: 0, paint: 20, carbon: 21, rubber: 22,
    metal: 23, glass: 24,
    emissive: 25, functionalEmissive: 25, panel: 26, mirror: 27,
  });
  // A livery FINISH is a surface-id remap on painted vertices, not a material
  // uniform: the shaders classify car surfaces 20-30 and branch per id, so a new
  // finish costs an id in that chain (js/render/shaders/lit.js and its WGSL/TSL
  // mirrors) and one row here. `carbon` gets id 31 rather than reusing
  // SURFACES.carbon (21): 21 keeps the vertex colour, so pointing the finish at
  // it just rendered flatter TEAM-COLOURED paint. 31 darkens the albedo to bare
  // weave, and leaving 21 alone keeps genuinely carbon PARTS looking as they did.
  const FINISH_SURFACE = Object.freeze({
    satin: 26, chrome: 27, matte: 28, brushed: 29, pearl: 30, carbon: 31,
  });
  const DARK   = [0.05, 0.05, 0.05];
  const CARBON = [0.07, 0.07, 0.08];
  const VISOR  = [0.08, 0.08, 0.09];          // tinted visor
  const PANEL  = [0.82, 0.82, 0.86];          // matte sponsor / number plate
  const TYRE   = [0.06, 0.06, 0.07];
  const RIM    = [0.11, 0.11, 0.13];
  const HUB    = [0.28, 0.28, 0.31];
  // Wheel-cover profile. The three tones have to SEPARATE — the old cover and
  // hubcap were 0.28 and 0.15 of the same neutral under a studio key and washed
  // into one flat disc.
  // Value ORDER matters more than the values: a covered F1 wheel is a bright
  // machined rim around a DARK dish, and the first pass had it the other way up
  // — a pale face with a dark ring, which reads as a hubcap off a road car.
  const LIP      = [0.40, 0.41, 0.44];     // machined rim, the brightest ring
  const COVER    = [0.24, 0.245, 0.27];    // dish wall
  const COVER_IN = [0.14, 0.14, 0.16];     // its floor, deepest in shadow
  const LIP_R  = 0.90;    // rim lip runs rimR*0.90 .. rimR
  const DISH_R = 0.46;    // dish wall ends here, where the hubcap starts
  const DISH_D = 0.030;   // and is recessed this far INBOARD
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

  function addBlock(out, q, col, colFront, surface, frontSurface, capFront, capRear) {
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
  // Chordwise stations from leading to trailing edge. Packed at BOTH ends: the
  // first third still owns the nose radius, and 0.84 keeps the last sixth a
  // knife rather than a 40 % linear fade from mid-chord to the TE (the look
  // that read as a rounded plank, especially on GLX/WGX paint).
  const FOIL_T = [0, 0.08, 0.28, 0.60, 0.84, 1];
  const FOIL_PEAK = Math.pow(0.5 / 1.6, 0.5) * Math.pow(1 - 0.5 / 1.6, 1.1);
  const foilThick = (t) => Math.pow(t, 0.5) * Math.pow(1 - t, 1.1) / FOIL_PEAK;
  const FOIL_CAMBER = 0.05;
  function addWingFoil(out, spec, col, surface) {
    const half = spec.half, inner = half * 0.34, mid = half * 0.67;
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
    const segments = [[-half, -mid], [-mid, -inner], [-inner, inner], [inner, mid], [mid, half]];
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
      const ft = [fc[0] - side * b + proud, fc[1], fc[2]];
      const fs = [fc[0] + proud, fc[1] - b, fc[2]];
      const rt = [rc[0] - side * b + proud, rc[1], rc[2]];
      const rs = [rc[0] + proud, rc[1] - b, rc[2]];
      // Wind so the facet normal points up-and-out (toward +y, ±x).
      if (side > 0) addQuad(out, fs, rs, rt, ft, col, surface);
      else          addQuad(out, ft, rt, rs, fs, col, surface);
    }
  }
  function addBeveledSpan(out, front, rear, b, col, colFront, surface, frontSurface) {
    addSpan(out, front, rear, col, colFront, surface, frontSurface);
    if (b > 0) addTopBevel(out, front, rear, b, col, surface);
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

  function addFairedArm(out, p0, p1, th, col, surface) {
    let dx = p1[0] - p0[0], dy = p1[1] - p0[1], dz = p1[2] - p0[2];
    const len = Math.hypot(dx, dy, dz) || 1;
    dx /= len; dy /= len; dz /= len;
    const chord = th * 2.5, thick = th * 0.58;
    let ax = -dx * dz, ay = -dy * dz, az = 1 - dz * dz;
    let al = Math.hypot(ax, ay, az);
    if (al < 1e-5) { ax = 1; ay = 0; az = 0; al = 1; }
    ax = ax / al * chord * 0.5;
    ay = ay / al * chord * 0.5;
    az = az / al * chord * 0.5;
    let lx = dy * az - dz * ay, ly = dz * ax - dx * az, lz = dx * ay - dy * ax;
    const ll = Math.hypot(lx, ly, lz) || 1;
    lx = lx / ll * thick * 0.5;
    ly = ly / ll * thick * 0.5;
    lz = lz / ll * thick * 0.5;
    const station = (p) => [
      [p[0] - ax, p[1] - ay, p[2] - az],
      [p[0] - lx, p[1] - ly, p[2] - lz],
      [p[0] + ax, p[1] + ay, p[2] + az],
      [p[0] + lx, p[1] + ly, p[2] + lz],
    ];
    addBlock(out, station(p0).concat(station(p1)), col, null, surface);
  }

  // Carbon plate filling the V of a wishbone (leading + trailing legs → upright).
  function addWishboneWeb(out, inLead, inTrail, outer, col, surface) {
    const p = (a, b, t) => [
      a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t,
    ];
    const a = p(inLead, outer, 0.40), b = p(inTrail, outer, 0.40);
    const c = p(inTrail, outer, 0.70), d = p(inLead, outer, 0.70);
    addQuad(out, a, b, c, d, col, surface);
    addQuad(out, a, d, c, b, col, surface);
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

  // Smooth swept tube (the halo hoop): shared ring verts + radial normals — the
  // addDome pattern along an arbitrary polyline. The ring "up" vector carries
  // forward from ring to ring (parallel transport) so frames never flip where
  // the tangent crosses the hoop apex. No end caps: both halo ends bury in the
  // pillar / collar. Cost: path.length*sides verts, (path.length-1)*sides*2 tris.
  function addTube(out, path, r, sides, col, surface) {
    const i0 = out.pos.length / 3;
    const material = surfaceOf(col, surface);
    const rgb = material === SURFACES.paint
      ? [Math.min(col[0], 1), Math.min(col[1], 1), Math.min(col[2], 1)]
      : col;
    let ux = 0, uy = 1, uz = 0;
    for (let i = 0; i < path.length; i++) {
      const a = path[Math.max(0, i - 1)], b = path[Math.min(path.length - 1, i + 1)];
      let tx = b[0] - a[0], ty = b[1] - a[1], tz = b[2] - a[2];
      const tl = Math.hypot(tx, ty, tz) || 1; tx /= tl; ty /= tl; tz /= tl;
      const d = ux * tx + uy * ty + uz * tz;
      ux -= d * tx; uy -= d * ty; uz -= d * tz;
      let ul = Math.hypot(ux, uy, uz);
      if (ul < 1e-5) { ux = -tz; uy = 0; uz = tx; ul = Math.hypot(ux, uy, uz) || 1; }
      ux /= ul; uy /= ul; uz /= ul;
      const vx = ty * uz - tz * uy, vy = tz * ux - tx * uz, vz = tx * uy - ty * ux;
      const p = path[i];
      for (let s = 0; s < sides; s++) {
        const ang = (s / sides) * Math.PI * 2;
        const c = Math.cos(ang), sn = Math.sin(ang);
        const nx = ux * c + vx * sn, ny = uy * c + vy * sn, nz = uz * c + vz * sn;
        out.pos.push(p[0] + nx * r, p[1] + ny * r, p[2] + nz * r);
        out.nrm.push(nx, ny, nz);
        out.col.push(rgb[0], rgb[1], rgb[2]);
        out.mat.push(material);
      }
    }
    for (let i = 0; i < path.length - 1; i++) {
      for (let s = 0; s < sides; s++) {
        const s2 = (s + 1) % sides;
        const A = i0 + i * sides + s, B = i0 + i * sides + s2;
        const C = i0 + (i + 1) * sides + s2, D = i0 + (i + 1) * sides + s;
        out.idx.push(A, B, C, A, C, D);
      }
    }
  }

  // Halo hoop centreline, matched to the real halo's front view: the top bar
  // reads LEVEL but is gently ROUNDED — a shallow arch that rises RISE toward
  // the centre and blends into the legs through tangent shoulders — never a
  // peak or a dip toward the middle (the two failure modes this replaced).
  // Three sections: a rear leg easing up from each collar (quadratic, zero
  // slope where it meets the crown), and the crown bar swept as a
  // half-ellipse in x-z with the sin-shaped RISE on top.
  const HALO_RISE = 0.012;                   // shallow arch: ~1.2 cm at centre
  function haloHoopPath(rearX, rearY, rearZ, midX, midZ, crownY, apexZ) {
    const LEG = 4, BAR = 6, pts = [];
    for (let i = 0; i < LEG; i++) {          // left leg: collar -> crown
      const t = i / LEG;
      pts.push([-(rearX + (midX - rearX) * t),
                rearY + (crownY - rearY) * t * (2 - t),
                rearZ + (midZ - rearZ) * t]);
    }
    for (let i = 0; i <= BAR; i++) {         // crown bar: level, gently arched
      const a = Math.PI * (1 - i / BAR);
      pts.push([Math.cos(a) * midX,
                crownY + HALO_RISE * Math.sin(a),
                midZ + (apexZ - midZ) * Math.sin(a)]);
    }
    for (let i = 1; i <= LEG; i++) {         // right leg: crown -> collar
      const t = i / LEG;
      pts.push([midX + (rearX - midX) * t,
                crownY + (rearY - crownY) * t * t,
                midZ + (rearZ - midZ) * t]);
    }
    return pts;
  }

  function addWheel(out, cx, cy, cz, r, w, bandColor, caliperColor, rimColor,
                    grooved, tyreStyle, fixedOut, brakeStyle, wheelStyle) {
    // `rimColor` is the brakes recipe's `rim` key. It reached this line and then
    // DIED here: RC was computed and never read once, so the nine catalog
    // options that set a rim colour painted nothing. The clamp scan
    // (tools/parts-sweep.mjs --clamp-scan) measured brakes/rim at 0.0000 m2 of
    // colour over its entire range, which is what a key with no consumer looks
    // like. The rim faces below take RC now. RIM_DEF reproduces the hardcoded
    // value those faces used before, so a car with no `rim` set is byte-identical.
    const RIM_DEF = [0.31, 0.31, 0.34];
    const RC = rimColor || RIM_DEF;
    const RC_DEEP = [RC[0] * 0.39, RC[1] * 0.39, RC[2] * 0.41];   // dish floor, in shadow
    // 18 -> 24: an 18-gon tyre reads visibly polygonal in any close shot.
    // +29% wheel tris, same draw-call count; ceilings in parts-physics raised
    // with the measurement (480 per wheel).
    const SEG = 24;
    const x0 = cx - w/2, x1 = cx + w/2;
    const rimR = r * 0.68;
    const coverOpen = brakeStyle && brakeStyle.coverOpen || 0;
    const rotorScale = brakeStyle && brakeStyle.rotorScale || 1;
    const tyreShoulder = Math.max(0, Math.min(2, Math.round((tyreStyle && tyreStyle.shoulder) || 0)));
    const edgeRm = tyreShoulder === 2 ? 0.90 : tyreShoulder === 1 ? 0.945 : 1;
    const grooveCount = tyreStyle && tyreStyle.grooves != null
      // `grooved` is the legacy BOOLEAN ARGUMENT, kept for callers that build a
      // wheel with no recipe at all (Car3D.buildWheel(0.34, band)). It is no
      // longer a recipe key: every tyre recipe set BOTH `grooved` and `grooves`,
      // which meant `grooved` was always shadowed here, and --clamp-scan
      // measured it flat over its whole range. Registry, merge default and all
      // 27 recipes dropped it together.
      ? tyreStyle.grooves : grooved ? 3 : 0;
    const grooveDepth = tyreStyle && tyreStyle.grooveDepth || 0.045;
    const PROFILE = [];
    if (tyreShoulder === 1) {
      PROFILE.push([0, 0.945], [0.05, 1]);
    } else if (tyreShoulder === 2) {
      PROFILE.push([0, 0.90], [0.075, 1]);
    } else {
      PROFILE.push([0, 1]);
    }
    for (let g = 0; g < grooveCount; g++) {
      const mid = (g + 1) / (grooveCount + 1);
      PROFILE.push([mid - 0.025, 1], [mid, 1 - grooveDepth], [mid + 0.025, 1]);
    }
    if (tyreShoulder === 1) {
      PROFILE.push([0.95, 1], [1, 0.945]);
    } else if (tyreShoulder === 2) {
      PROFILE.push([0.925, 1], [1, 0.90]);
    } else {
      PROFILE.push([1, 1]);
    }
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
    const outerR = r * edgeRm;
    for (let i = 0; i < SEG; i++) {
      const a0 = (i / SEG) * Math.PI * 2, a1 = ((i+1) / SEG) * Math.PI * 2;
      const ya0 = cy + outerR*Math.cos(a0), za0 = cz + outerR*Math.sin(a0);
      const ya1 = cy + outerR*Math.cos(a1), za1 = cz + outerR*Math.sin(a1);
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
      const L0=[x0,rya0,rza0], L1=[x0,rya1,rza1];
      addQuad(out, A0, A1, L1, L0, TYRE, SURFACES.rubber);
      // The COVER, in three rings instead of one flat fan from the rim to a
      // point. The fan was geometrically fine and read as a plain grey disc at
      // every distance: it ran straight into the tyre with no edge, and its apex
      // sat 12 mm OUTBOARD, so it was a cone pointing at the camera — the one
      // shape a single light cannot shade. A 2022-on covered wheel is a dark rim
      // lip, a face dished INWARD behind it, and a raised hub boss; that is three
      // depth planes, and it is the depth that makes the wheel read, not the
      // number of triangles.
      if (!coverOpen || i % (coverOpen >= 2 ? 2 : 3) !== 0) {
        for (const sd of [[x1, 1], [x0, -1]]) {
          const xw = sd[0], dir = sd[1];
          const P = (rad, a, dx) => [xw + dir * dx,
            cy + rad * Math.cos(a), cz + rad * Math.sin(a)];
          // 1. rim lip: a dark annulus at the wall plane, framing the cover.
          addQuad(out, P(rimR, a0, 0), P(rimR, a1, 0),
                       P(rimR * LIP_R, a1, 0), P(rimR * LIP_R, a0, 0), LIP, SURFACES.metal);
          // 2. dish: falls INBOARD as it goes in, so the light gradient across it
          //    reads as a bowl rather than a disc.
          addQuad(out, P(rimR * LIP_R, a0, 0), P(rimR * LIP_R, a1, 0),
                       P(rimR * DISH_R, a1, DISH_D), P(rimR * DISH_R, a0, DISH_D),
                       COVER, SURFACES.carbon);
          // 3. floor of the dish, out to the hubcap that already sits on it.
          addTri(out, [xw + dir * DISH_D, cy, cz],
                       P(rimR * DISH_R, a0, DISH_D), P(rimR * DISH_R, a1, DISH_D),
                       COVER_IN, SURFACES.carbon);
        }
      }
    }
    // Five raised spoke ribs across each dish. Proud of the floor by a third of
    // the dish depth, so they catch the key and give the face something to
    // rotate against — a wheel with no angular feature looks stationary.
    for (const sd of [[x1, 1], [x0, -1]]) {
      const xw = sd[0], dir = sd[1];
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2 + 0.31, hw = 0.13;
        const P = (rad, aa, dx) => [xw + dir * dx,
          cy + rad * Math.cos(aa), cz + rad * Math.sin(aa)];
        addQuad(out, P(rimR * DISH_R, a - hw, DISH_D * 0.66), P(rimR * DISH_R, a + hw, DISH_D * 0.66),
                     P(rimR * 0.30, a + hw * 1.8, DISH_D * 0.66), P(rimR * 0.30, a - hw * 1.8, DISH_D * 0.66),
                     COVER, SURFACES.carbon);
      }
    }
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
        const HAT_SEG = 8;
        for (let i = 0; i < HAT_SEG; i++) {
          const a0 = i / HAT_SEG * Math.PI * 2, a1 = (i + 1) / HAT_SEG * Math.PI * 2;
          const P = (rad, a) => [face[0], cy + rad*Math.cos(a), cz + rad*Math.sin(a)];
          addQuad(out, P(hatOuter,a0), P(hatOuter,a1), P(hatInner,a1), P(hatInner,a0),
            [0.34, 0.34, 0.37], SURFACES.metal);
        }
      }
      if (discFaceRotor > 0) {
        const marks = discFaceRotor === 1 ? 6 : 4;
        const rad = (rotorInner + rotorOuter) * 0.55;
        const sz = discFaceRotor === 1 ? 0.012 : 0.022;
        const slot = discFaceRotor === 1 ? 1 : 0.40;
        for (let k = 0; k < marks; k++) {
          const a = (k / marks) * Math.PI * 2 + 0.14;
          const my = cy + rad * Math.cos(a), mz = cz + rad * Math.sin(a);
          const hy = sz * 0.5, hz = sz * slot * 0.5;
          addQuad(out,
            [face[0], my - hy, mz - hz], [face[0], my - hy, mz + hz],
            [face[0], my + hy, mz + hz], [face[0], my + hy, mz - hz],
            INTAKE, SURFACES.carbon);
        }
      }
    }
    const BAND = bandColor || [0.85, 0.10, 0.08];
    const bandWidth = tyreStyle && tyreStyle.bandWidth != null ? tyreStyle.bandWidth : 0.09;
    for (const bs of [[x0, -1], [x1, 1]]) {
      const xb = bs[0] + bs[1] * 0.004;
      for (let i = 0; i < SEG; i++) {
        const a0 = (i / SEG) * Math.PI * 2, a1 = ((i + 1) / SEG) * Math.PI * 2;
        const P = (rad, a) => [xb, cy + rad * Math.cos(a), cz + rad * Math.sin(a)];
        const outer = 0.96 * edgeRm, inner = Math.max(0.76 * edgeRm, outer - bandWidth);
        const A = P(r * outer, a0), B = P(r * outer, a1), C = P(r * inner, a1), D = P(r * inner, a0);
        addQuad(out, A, B, C, D, BAND, SURFACES.rubber);   // single face (wheel drawn cull-off → shows both sides, no z-fight)
      }
    }
    // Raised sidewall lettering ring(s): proud dark annulus inboard of the band
    // (0.006 out vs the band's 0.004, so the two faces never share a plane).
    const sidewall = Math.max(0, Math.min(2, Math.round((tyreStyle && tyreStyle.sidewall) || 0)));
    if (sidewall > 0) {
      const SW = [0.16, 0.16, 0.17];
      const rings = sidewall === 2 ? [[0.700, 0.740], [0.775, 0.805]] : [[0.700, 0.740]];
      for (const bs of [[x0, -1], [x1, 1]]) {
        const xb = bs[0] + bs[1] * 0.006;
        for (const ring of rings) for (let i = 0; i < SEG; i++) {
          const a0 = (i / SEG) * Math.PI * 2, a1 = ((i + 1) / SEG) * Math.PI * 2;
          const P = (rad, a) => [xb, cy + rad * Math.cos(a), cz + rad * Math.sin(a)];
          addQuad(out, P(r * ring[1], a0), P(r * ring[1], a1),
                       P(r * ring[0], a1), P(r * ring[0], a0), SW, SURFACES.rubber);
        }
      }
    }

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
    const HUBCAP = RC;                   // raised boss: lighter than the dish floor
    const NUT = caliperColor || bandColor || [0.85, 0.72, 0.10];
    for (const ss of [[x0, -1], [x1, 1]]) {
      const dir = ss[1], xc0 = ss[0] - dir * 0.014, hcR = rimR * 0.46, ctr = [xc0, cy, cz];
      for (let i = 0; i < SEG; i++) {
        const a0 = (i / SEG) * Math.PI * 2, a1 = ((i + 1) / SEG) * Math.PI * 2;
        addTri(out, ctr, [xc0, cy + hcR*Math.cos(a0), cz + hcR*Math.sin(a0)],
                         [xc0, cy + hcR*Math.cos(a1), cz + hcR*Math.sin(a1)], HUBCAP, SURFACES.metal);   // single face (cull-off → opaque both sides)
      }
      const nutCol = (wheelStyle && wheelStyle.nut) || NUT;
      const gunNut = wheelStyle && wheelStyle.gunNut ? 1 : 0;
      if (!gunNut) {
        addBox(out, ss[0] - dir * 0.002, cy, cz, 0.026, hcR * 0.42, hcR * 0.42, nutCol, SURFACES.metal);
      } else {
        const nx = ss[0] - dir * 0.001;
        const nR = hcR * 0.38;
        const nDeep = 0.018;
        const HEX = 6;
        for (let h = 0; h < HEX; h++) {
          const a0 = (h / HEX) * Math.PI * 2 + Math.PI / HEX;
          const a1 = ((h + 1) / HEX) * Math.PI * 2 + Math.PI / HEX;
          const y0 = cy + nR * Math.cos(a0), z0 = cz + nR * Math.sin(a0);
          const y1 = cy + nR * Math.cos(a1), z1 = cz + nR * Math.sin(a1);
          const xOut = nx + dir * nDeep * 0.5, xIn = nx - dir * nDeep * 0.5;
          addQuad(out,
            [xOut, y0, z0], [xOut, y1, z1], [xIn, y1, z1], [xIn, y0, z0],
            nutCol, SURFACES.metal);
          addTri(out, [xOut, cy, cz], [xOut, y0, z0], [xOut, y1, z1], nutCol, SURFACES.metal);
        }
        const cR0 = nR * 1.15, cR1 = nR * 1.55, cxCol = nx - dir * nDeep * 0.55;
        for (let h = 0; h < 12; h++) {
          const a0 = (h / 12) * Math.PI * 2, a1 = ((h + 1) / 12) * Math.PI * 2;
          const P = (rad, a) => [cxCol, cy + rad * Math.cos(a), cz + rad * Math.sin(a)];
          addQuad(out, P(cR0, a0), P(cR0, a1), P(cR1, a1), P(cR1, a0),
                  [nutCol[0] * 0.75, nutCol[1] * 0.75, nutCol[2] * 0.75], SURFACES.metal);
        }
      }
      // Rim SPOKES: extruded blades (front + back + long edges) from hub to rim.
      const spokeN = Math.max(0, Math.min(8, Math.round((wheelStyle && wheelStyle.spokes) || 0)));
      for (let k = 0; k < spokeN; k++) {
        const a = (k / spokeN) * Math.PI * 2 + 0.4;
        const uy = Math.cos(a), uz = Math.sin(a), py = -Math.sin(a), pz = Math.cos(a);
        const hw = 0.014, thick = 0.008;
        const ri = hcR * 1.08, ro = rimR * 0.90;
        const xsF = ss[0] + dir * 0.026, xsB = ss[0] + dir * (0.026 - dir * thick);
        const P = (xs, rad, sgn) => [xs, cy + uy * rad + py * hw * sgn, cz + uz * rad + pz * hw * sgn];
        addQuad(out, P(xsF, ri, 1), P(xsF, ro, 1), P(xsF, ro, -1), P(xsF, ri, -1), HUBCAP, SURFACES.metal);
        addQuad(out, P(xsB, ri, -1), P(xsB, ro, -1), P(xsB, ro, 1), P(xsB, ri, 1), HUBCAP, SURFACES.metal);
        addQuad(out, P(xsF, ri, 1), P(xsF, ro, 1), P(xsB, ro, 1), P(xsB, ri, 1), HUBCAP, SURFACES.metal);
        addQuad(out, P(xsF, ri, -1), P(xsB, ri, -1), P(xsB, ro, -1), P(xsF, ro, -1), HUBCAP, SURFACES.metal);
      }
      // Rim TAPE: face band + short OD bead so the set marks read from a ¾ view.
      if (wheelStyle && wheelStyle.tape) {
        const tr = rimR * 1.02, tc = (wheelStyle.nut) || bandColor;
        for (let k = 0; k < 20; k++) {
          const a0 = (k / 20) * Math.PI * 2, a1 = ((k + 1) / 20) * Math.PI * 2;
          const A = (rad, a) => [ss[0] + dir * 0.010, cy + rad * Math.cos(a), cz + rad * Math.sin(a)];
          addQuad(out, A(tr, a0), A(tr + 0.022, a0), A(tr + 0.022, a1), A(tr, a1), tc, SURFACES.metal);
        }
        const beadR = rimR * 1.01;
        const bx0 = ss[0] + dir * 0.002, bx1 = ss[0] + dir * 0.016;
        for (let k = 0; k < 16; k++) {
          const a0 = (k / 16) * Math.PI * 2, a1 = ((k + 1) / 16) * Math.PI * 2;
          const y0 = cy + beadR * Math.cos(a0), z0 = cz + beadR * Math.sin(a0);
          const y1 = cy + beadR * Math.cos(a1), z1 = cz + beadR * Math.sin(a1);
          addQuad(out, [bx0, y0, z0], [bx1, y0, z0], [bx1, y1, z1], [bx0, y1, z1], tc, SURFACES.metal);
        }
      }
      const dish = Math.max(0, Math.min(2, Math.round((wheelStyle && wheelStyle.dish) || 0)));
      if (dish > 0) {
        const dr = rimR * (dish === 2 ? 0.80 : 0.88);
        const dxOut = ss[0] + dir * 0.014;
        const dxIn = ss[0] + dir * (0.014 - 0.012 * dish);
        const DISH_SEG = 16;
        for (let k = 0; k < DISH_SEG; k++) {
          const a0 = (k / DISH_SEG) * Math.PI * 2, a1 = ((k + 1) / DISH_SEG) * Math.PI * 2;
          const oy0 = cy + rimR * 0.98 * Math.cos(a0), oz0 = cz + rimR * 0.98 * Math.sin(a0);
          const oy1 = cy + rimR * 0.98 * Math.cos(a1), oz1 = cz + rimR * 0.98 * Math.sin(a1);
          const iy0 = cy + dr * Math.cos(a0), iz0 = cz + dr * Math.sin(a0);
          const iy1 = cy + dr * Math.cos(a1), iz1 = cz + dr * Math.sin(a1);
          addQuad(out,
            [dxOut, oy0, oz0], [dxOut, oy1, oz1], [dxOut, iy1, iz1], [dxOut, iy0, iz0],
            HUBCAP, SURFACES.metal);
          addQuad(out,
            [dxOut, iy0, iz0], [dxOut, iy1, iz1], [dxIn, iy1, iz1], [dxIn, iy0, iz0],
            RC_DEEP, SURFACES.metal);
          addTri(out, [dxIn, cy, cz],
                 [dxIn, iy0, iz0],
                 [dxIn, iy1, iz1], HUBCAP, SURFACES.metal);
        }
      }
    }
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
                 w * 1.06, 0.052, 0.055, caliperColor, SURFACES.metal);
        }
        for (const sgn of [-1, 1])
          addBox(calOut, cx + sgn * (w * 0.52 + 0.006), cy + cr, cz, 0.02, 0.05, 0.11, padCol, SURFACES.metal);
        addBox(calOut, cx, cy + cr + 0.04, cz, w * 1.0, 0.02, 0.10, caliperColor, SURFACES.metal);
      } else {
        const cY = cy + Math.cos(calA) * cr, cZ = cz + Math.sin(calA) * cr;
        const pistons = calLvl === 2 ? 6 : 4;
        const bodyW = w * (calLvl === 2 ? 1.14 : 1.08);
        const bodyH = calLvl === 2 ? 0.078 : 0.068;
        const bodyD = calLvl === 2 ? 0.118 : 0.100;
        addBox(calOut, cx, cY, cZ, bodyW, bodyH, bodyD, caliperColor, SURFACES.metal);
        addBox(calOut, cx, cY, cZ, bodyW * 0.42, bodyH * 0.45, bodyD * 0.55,
               [0.04, 0.04, 0.05], SURFACES.metal);
        const ty = -Math.sin(calA), tz = Math.cos(calA);
        const span = bodyD * 0.62;
        for (const sgn of [-1, 1]) {
          for (let p = 0; p < pistons; p++) {
            const t = (p / (pistons - 1) - 0.5) * span;
            addBox(calOut, cx + sgn * (w * 0.50 + 0.012), cY + ty * t, cZ + tz * t,
                   0.018, 0.028, 0.028, padCol, SURFACES.metal);
          }
        }
        for (const sgn of [-1, 1])
          addBox(calOut, cx + sgn * (w * 0.52 + 0.006), cY, cZ, 0.016, 0.042, 0.090, padCol, SURFACES.metal);
        const earR = cr - 0.055;
        addBox(calOut, cx, cy + Math.cos(calA) * earR, cz + Math.sin(calA) * earR,
               w * 0.55, 0.024, 0.040, caliperColor, SURFACES.metal);
        addBox(calOut, cx, cY + 0.048, cZ, 0.014, 0.016, 0.016, [0.55, 0.55, 0.58], SURFACES.metal);
      }
    }
  }

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

  const TYRE_BAND     = { 0: [0.92, 0.92, 0.90], 1: [0.85, 0.10, 0.08], 2: [0.95, 0.15, 0.05] };
  const BRAKE_CALIPER = { 0: null, 1: null, 2: [0.75, 0.08, 0.05] };
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
  const FW_MOVEABLE = 2;
  const AERO_STYLE_DEF = { frontSweep: 0.04, frontTaper: 0.98, frontRise: 0.04,
                           rearSweep: 0.03, rearTaper: 0.98 };
  function frontCascade(aLvl) {
    const a = aLvl;
    const els = [
      [2.72, 0.048, 2.40, 0.086, 1.00, 0.024],   // main plane (structure, never moves)
      [2.50, 0.092, 2.24, 0.146, 0.98, 0.020],   // flap 1
    ];
    if (a >= 1) els.push([2.34, 0.148, 2.10, 0.212, 0.95, 0.018]);   // flap 2
    if (a >= 3) els.push([2.20, 0.200, 1.98, 0.272, 0.92, 0.016]);   // flap 3
    if (a >= 4) els.push([2.08, 0.256, 1.88, 0.328, 0.88, 0.014]);   // flap 4
    return els;
  }
  // How many of them the mesh still bakes. Never the main plane.
  function frontBakedCount(aLvl) {
    const n = frontCascade(aLvl).length;
    return n - Math.min(FW_MOVEABLE, n - 1);
  }
  function frontHalf(aLvl) {
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
        if (!isFinite(y0) || !isFinite(y1)) return Infinity;
        return y0 + (y1 - y0) * (z - z0) / (z1 - z0);
      }
    }
    return Infinity;
  }
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
  const _flapSig = new WeakMap();
  function flapSig(st0) {
    let sig = _flapSig.get(st0);
    if (sig === undefined) {
      sig = [st0.frontSweep, st0.frontTaper, st0.frontRise,
             st0.rearSweep, st0.rearTaper, st0.drs || 0]
        .map((v) => +v || 0).join(",");
      _flapSig.set(st0, sig);
    }
    return sig;
  }
  function aeroFlapsGeom(aLvl, style) {
    const st0 = (style && typeof style === "object") ? style : AERO_STYLE_DEF;
    const key = aLvl + "|" + flapSig(st0);
    let hit = _flapSpecs.get(key);
    if (!hit) {
      hit = solveFlapsGeom(aLvl, st0);
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
        upsweep: i === els.length - 1 ? { fwHalf, e } : null,
      }, prev));
    }
    const ep = endplateGeom(a), crownY = ep.rear.top - 0.018;
    const upperTrailY = crownY - ((a >= 4 || (st.drs || 0)) ? 0.075 : 0);
    const rearMain = Object.assign(
      elemRecord([-2.30, upperTrailY - 0.270], [-2.52, upperTrailY - 0.225], 0.024, 0),
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
      addRear("rearMid", [-2.34, upperTrailY - 0.170], [-2.56, upperTrailY - 0.115], 0.022, 0.9);
    }
    addRear("rear", [-2.38, upperTrailY - 0.075], [-2.64, upperTrailY], 0.026, 1);
    if (a >= 4 && !(st.drs || 0)) {
      addRear("rearTop", [-2.42, crownY - 0.055], [-2.66, crownY], 0.022, 1.1);
    }
    return out;
  }
  function buildFlapGeom(el, col, finish) {
    const out = { pos: [], nrm: [], col: [], mat: [], idx: [] };
    // The element exactly as the wing build emits it...
    addWingFoil(out, {
      zLead: el.le[0], yLead: el.le[1], zTrail: el.te[0], yTrail: el.te[1],
      half: el.half, thick: el.thick, taper: el.taper,
      sweep: el.sweep, rise: el.rise, attachHalf: el.attachHalf,
    }, col, SURFACES.paint);
    if (el.upsweep) {
      const { fwHalf, e } = el.upsweep;
      for (const sgn of [-1, 1]) {
        addSpan(out, { z: e[2], x: sgn * (fwHalf * e[4] - 0.05), y: e[3], w: 0.16, h: e[5] * 1.5 },
                     { z: e[2] - 0.04, x: sgn * (fwHalf + 0.02), y: e[3] + 0.085, w: 0.09, h: e[5] * 1.6 }, col);
      }
    }
    for (let i = 0; i < out.pos.length; i += 3) {
      out.pos[i + 1] -= el.y;
      out.pos[i + 2] -= el.z;
    }
    // Livery FINISH remap, exactly as build() does for the baked mesh: the flaps
    // are the wing's own paint, so a satin/chrome car must carry the finish here
    // too. A gloss / absent finish leaves the array byte-identical (no remap).
    const finishSurface = FINISH_SURFACE[finish];
    if (finishSurface) {
      for (let i = 0; i < out.mat.length; i++) {
        if (out.mat[i] === SURFACES.paint) out.mat[i] = finishSurface;
      }
    }
    return out;
  }
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
  const FIN = Object.freeze({
    baseLE: [-0.65, 0.7935], topLE: [-1.15, 0.97],
    topTE:  [-1.65, 0.97],   baseTE: [-1.70, 0.6197],
    halfBase: 0.022, halfTop: 0.014,
  });
  const finMix = (a, b, t) => a + (b - a) * t;
  function finXAt(z, y, proud) {
    const u = (z - FIN.baseLE[0]) / (FIN.baseTE[0] - FIN.baseLE[0]);   // along the base edge
    const yBase = finMix(FIN.baseLE[1], FIN.baseTE[1], Math.max(0, Math.min(1, u)));
    const v = Math.max(0, Math.min(1, (y - yBase) / (FIN.topLE[1] - yBase)));
    return finMix(FIN.halfBase, FIN.halfTop, v) + proud;
  }
  function sharkFinPanel(inset, proud) {
    const i = inset != null ? inset : 0.05;
    const p = proud != null ? proud : 0.002;
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
      // 2026 intake lip. 0 none (shipped) · 1 thin mouth ring · 2 ring + cheeks.
      scoopLip: 0,
    }, recipe);
  }
  function buildAeroParts(recipe, tier) {
    const lvl = tier === 0 ? 0 : tier === 2 ? 4 : 2;
    return mergeRecipe({
      lvl, beam: tier === 2 ? 1 : 0, drs: 0,
      vane: lvl >= 4 ? 3 : lvl >= 3 ? 2 : lvl >= 1 ? 1 : 0,
      plate: 1, casc: null, swan: 0, tvane: null,
      duct: 0, board: 0, slot: 0,
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
      // Visible inboard rocker fairing on the tub top: 0 none / 1 split blister / 2 full cover.
      rocker: 0,
      // Transverse third (heave) element: 0 none / 1 damper + spring pack + links.
      heave: 0,
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
      // Caliper hardware: 0 shipped 3-box peek / 1 Brembo monobloc / 2 six-piston radial.
      caliper: 0,
    }, recipe);
  }
  function buildTyreParts(recipe, tier) {
    // sidewall: raised lettering ring(s) on the tyre face. 0 flush / 1 ring / 2 double.
    return mergeRecipe({ band: TYRE_BAND[tier], shoulder: 0,
      sidewall: 0 }, recipe);
  }
  function buildErsParts(recipe, tier, accent) {
    // coolerIntake: pack cooling mouth on the pod shoulder. 0 none / 1 NACA lip / 2 lip + louvres.
    return mergeRecipe({ led: tier === 2 ? accent : null, pack: 1,
      cells: tier === 2 ? 6 : 3, conduit: 0, blister: 0, coolerIntake: 0 }, recipe);
  }
  function buildGearboxParts(recipe, tier) {
    return mergeRecipe({
      strakes: tier === 2 ? 5 : 0, fin: tier === 2 ? 1 : 0,
      strakeH: 0.13, finSY: 0.14, finSZ: 0.28,
      casing: tier === 2 ? 3 : 0, louvres: 0, heat: 0,
      caseWidth: 1,
      heatFins: 0, ribs: 0,
    }, recipe);
  }
  function buildFuelParts(recipe, tier) {
    return mergeRecipe({
      cap: tier === 2 ? [0.95, 0.28, 1.5] : [0.55, 0.52, 0.60],
      flame: [1.15, 0.42, 0.14],
      line: 1, filler: 0,
      hatch: 0, vent: 0,
      // breather: NACA duct beside the filler. 0 none / 1 duct / 2 duct + standpipe.
      breather: 0,
    }, recipe);
  }
  function buildExhaustParts(recipe) {
    return mergeRecipe({
      pipes: null, bore: 1, flare: 0, wastegate: 0, wrap: 0,
      lip: 0, shield: 0,
    }, recipe);
  }
  function buildFloorParts(recipe) {
    return mergeRecipe({ fences: 5, fenceH: 1, skid: 0, edgeLip: 0,
      plank: 0, gurney: 0, scroll: 0 }, recipe);
  }
  function buildWheelParts(recipe) {
    // deflector: 2026 over-wheel deflector above each FRONT wheel. 0 none / 1 plane / 2 biplane + endplate.
    return mergeRecipe({ spokes: 0, tape: 0, dish: 0, nut: null, gunNut: 0,
      deflector: 0 }, recipe);
  }
  function buildCockpitParts(recipe) {
    // halo: hoop profile. 0 regulation round tube / 1 slim low-profile / 2 fenced crown.
    // headrest: 0 flat rim / 1 raised horseshoe / 2 winged pad.
    return mergeRecipe({ haloBlade: 0, haloWing: 0, camPods: 0, screen: 0,
      halo: 0, headrest: 0 }, recipe);
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
  function aeroLevelOf(T) {
    T = T || {};
    return buildAeroParts(T._visual && T._visual.aero, T.aero != null ? T.aero : 1).lvl;
  }
  function aeroStyleOf(T) {
    T = T || {};
    return buildAeroParts(T._visual && T._visual.aero, T.aero != null ? T.aero : 1);
  }
  const HELMET_ACCENT = [
    [0.95, 0.20, 0.15], [0.15, 0.45, 0.95], [0.97, 0.82, 0.10], [0.90, 0.90, 0.95],
    [0.15, 0.75, 0.35], [0.85, 0.40, 0.90], [0.98, 0.50, 0.10], [0.10, 0.80, 0.80],
  ];

  // The monocoque span is a CLOSED block, so its rear face is a solid wall the
  // driver's eye (car-local z -0.18) looks straight into. BOTH its z and its
  // top edge are depth-raster measurements, not styling — the shared z 0.05 ate
  // the steering wheel, and a too-tall cap at z 0.45 then ate the nose. Numbers
  // and method: docs/OCCLUSION-PROBE.md §4. The cockpit span (z 0.05..-0.55) is
  // dropped: the tub around/behind the seat, already modelled by the bolsters.
  const CKPT_MONO_REAR = Object.freeze({ z: 0.45, y: 0.32, w: 0.552, h: 0.16, t: 0.752 });
  function buildSharedChassis(out, c1, rideDY, noseStations, ckpt) {
    const floor = CHASSIS.floor;
    addBox(out, floor.cx, Math.max(floor.cy + rideDY, 0.052), floor.cz,
           floor.sx, floor.sy, floor.sz, CARBON);
    const nose = noseStations || CHASSIS.nose;
    addSpan(out, nose[0], nose[1], c1);
    addTopBevel(out, nose[0], nose[1], 0.022, c1);
    addSpan(out, nose[1], nose[2], c1);
    addTopBevel(out, nose[1], nose[2], 0.028, c1);
    const monoR = ckpt ? CKPT_MONO_REAR : CHASSIS.monocoque[1];
    addSpan(out, CHASSIS.monocoque[0], monoR, c1);
    addTopBevel(out, CHASSIS.monocoque[0], monoR, 0.032, c1);
    if (ckpt) return;
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
    const inletBias = style ? (style.inlet || 0) : 0;
    return [
      { z: 0.62, inner: 0.30, outer: outerFront, innerBottom: inletFloor,
        outerBottom: 0.245 + 0.06 * (undercut - 1),
        innerTop: 0.45 + inletBias, outerTop: 0.46 + inletBias * 0.6 },
      { z: 0.50, inner: 0.298, outer: outerFront * 0.97 + outerShoulder * 0.03,
        innerBottom: 0.218 + 0.12 * (undercut - 1),
        outerBottom: 0.158 + 0.05 * (undercut - 1),
        innerTop: 0.448 + inletBias * 0.55,
        outerTop: 0.455 + inletBias * 0.35 },
      { z: 0.22, inner: 0.29, outer: outerShoulder,
        innerBottom: 0.20 + 0.13 * (undercut - 1), outerBottom: 0.12,
        innerTop: shoulderTop, outerTop: shoulderTop - 0.015 },
      { z: -0.38, inner: 0.28, outer: outerShoulder * 0.55 + outerWaist * 0.45,
        innerBottom: 0.162 + 0.10 * (undercut - 1), outerBottom: 0.112,
        innerTop: shoulderTop * 0.68 + (0.42 + 0.10 * (shoulder - 1)) * 0.32,
        outerTop: (shoulderTop - 0.015) * 0.62 + (0.38 + 0.08 * (shoulder - 1)) * 0.38 },
      { z: -0.62, inner: 0.27, outer: outerWaist,
        innerBottom: 0.14 + 0.08 * (undercut - 1), outerBottom: 0.105,
        innerTop: 0.42 + 0.10 * (shoulder - 1),
        outerTop: 0.38 + 0.08 * (shoulder - 1) },
      { z: -1.05, inner: 0.25, outer: outerWaist * 0.42 + outerTail * 0.58,
        innerBottom: 0.134, outerBottom: 0.112,
        innerTop: 0.355 + 0.07 * (shoulder - 1),
        outerTop: 0.318 + 0.04 * (shoulder - 1) },
      { z: -1.48, inner: 0.23, outer: outerTail, innerBottom: 0.13,
        outerBottom: 0.12, innerTop: 0.30 + 0.05 * (shoulder - 1), outerTop: 0.27 },
    ];
  }

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
    const teamId = opts && opts.teamId;
    Log.info("car", "build" + (teamId ? " " + teamId : ""));
    const out = { pos: [], nrm: [], col: [], mat: [], idx: [] };
    const sections = [];
    const part = (name) => {
      const at = out.pos.length / 3;
      if (sections.length) sections[sections.length - 1].to = at;
      sections.push({ name, from: at, to: at });
    };
    const c1 = color  || [0.8, 0.05, 0.05];
    // COCKPIT accent dimming — the wheel has always done this (getCockpitWheel
    // tints livery to 40-45%); the body trim needs it too. Accent elements sit
    // 0.8-2.9 m from the eye over a big solid angle, so a near-white accent
    // (ferrari's c2 IS [1,1,1]) stops reading as a stripe and becomes a flat
    // pale slab: 75 of 6095 view rays landed on pure white before this
    // (artifacts/pale-sweep.mjs). The darkest channel decides, so a SATURATED
    // accent keeps its identity and only white/silver comes down. External
    // cameras always get the full-strength livery.
    const _ckAcc = (c) => {
      if (!(opts && opts.cockpit) || !c) return c;
      const mn = Math.min(c[0], c[1], c[2]);
      if (mn < 0.45) return c;
      const k = 0.42 / mn;
      return [c[0] * k, c[1] * k, c[2] * k];
    };
    const c2 = _ckAcc(color2 || [0.9, 0.9, 0.1]);
    const liv = (opts && opts.livery) || {};
    const accentC = _ckAcc(liv.accent) || c2;
    const noseC = liv.nose || null;
    const podC  = liv.pod  || null;
    const wingC = _ckAcc(liv.wing) || c2;   // flap colour (front + rear) — c2 keeps today's look
    const finC  = _ckAcc(liv.fin) || c2;   // shark-fin plate — c2 keeps today's look
    const haloTint = liv.halo || null;
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
    out.flapInfo = null;   // filled in once wingC/aLvl are resolved, below
    const exhStyle = design.exhaust;
    const floorStyle = design.floor;
    const cockpitStyle = design.cockpit;
    const wheelStyle = design.wheels;
    const teamStyle = teamStyleOf(opts && opts.teamId);
    const anchors = bodyAnchors(T, opts && opts.teamId);
    const ckpt = opts && opts.cockpit;   // hoisted: buildSharedChassis needs it

    part("chassis");
    const rideDY = suspStyle ? suspStyle.ride : (suspT === 0 ? 0.060 : suspT === 2 ? -0.048 : 0);
    buildSharedChassis(out, c1, rideDY, styledNoseStations(teamStyle), ckpt);

    part("hood");
    // In cockpit view the hood is remodelled LONGER and TALLER so it reads
    // clearly ahead of the driver (a stubby deck disappears under the dash).
    // ERS tier tints the two flat accent-colour "livery tell" panels (hood
    // stripe + shark fin below) HDR at the top tier — same ">1 albedo glows
    // at night" convention PANEL already uses; plain team colour otherwise.
    // Cockpit view: the hood is the VANITY PANEL the driver looks along. It must
    // rise ABOVE the chassis deck (monocoque tops out at 0.545 at z 1.05) or it
    // is dead geometry: at top 0.48 it rasterised 2631 px and lost every one,
    // sandwiched between coaming and nose — ZERO visible pixels
    // (docs/OCCLUSION-PROBE.md §4). Narrow (w 0.36): a spine, not a wall.
    const hF = ckpt ? { z: 1.10, y: 0.50, w: 0.50, h: 0.10, t: 0.66 }
                    : { z: 1.15, y: 0.435, w: 0.30, h: 0.09, t: 0.64 };
    // Cockpit: the REAR station stops AHEAD of the wheel (game.js _rigT z 0.26)
    // — eye, wheel, cowl, nose is the order the real parts sit in. It must also
    // stay BELOW THE WHEEL'S TOP (rig 0.63 + half-height x 0.80 = 0.756): it is
    // further away, so equal height puts it HIGHER on screen and it draws over
    // the wheel — measured, that is why the wheel once vanished. Top 0.54 here.
    const hR = ckpt ? { z: 0.58, y: 0.42, w: 0.66, h: 0.12, t: 0.58 }
                    : { z: 0.08, y: 0.585, w: 0.44, h: 0.15, t: 0.58 };
    addSpan(out, hF, hR, c1, c1);
    addTopBevel(out, hF, hR, 0.026, c1);
    // Accent stripe down the vanity deck crown (team colour) — CHASE ONLY.
    // It was pushed ahead of the wheel once already (at centre 0.95 x length
    // 1.75 it began at z 0.075, behind the wheel, and drew across its face),
    // but ahead of the wheel is no better: in cockpit the bar starts 0.65 m
    // from the eye (0, 0.82, -0.20) and runs 1.30 m straight down the centre
    // of the view, so it foreshortens into a flat slab rather than reading as
    // a stripe. On a livery whose accent is white it is a bright grey box
    // sitting in front of the wheel — measured: the centre ray at the cockpit
    // tuner's -20.5 deg pitch hits it at 0.69 m, and ferrari's c2 is [1,1,1].
    // The driver of a real car does not see their own spine stripe; the chase
    // cameras still do, so only the cockpit build drops it.
    if (!ckpt) addBox(out, 0, 0.665, 0.45, 0.10, 0.02, 0.80, ersC2, SURFACES.paint);

    part("bolsters");
    if (ckpt) {
      for (const s of [-1, 1]) {
        // Survival-cell SIDE WALL: the tub edge the driver sits between, rising
        // beside the eye and tapering down/outward toward the nose. The rear
        // headrest portion sits behind the camera and never renders, so the
        // visible span is the dash side that wraps the wheel.
        // Crown heights beside the driver are REGULATION: the survival cell's
        // upper edge runs Z 610 (headrest fixing, C12.6) to Z 695 (halo rear
        // faces, C12.4.2) — docs/COCKPIT-DATUMS.md. 0.56/0.58 sat below that
        // band entirely; 0.66/0.68 sat high in it and swallowed the front wing
        // (0.62% -> 0.01% of frame). 0.62/0.64 is the band's lower end: still
        // compliant, still enclosing, wing tips back. Above ~0.70 eats mirrors.
        addBlock(out, [
          [s*0.30, 0.34, 1.50], [s*0.56, 0.26, 1.50], [s*0.54, 0.50, 1.46], [s*0.30, 0.54, 1.46],  // front (nose end, low)
          [s*0.32, 0.40, 0.40], [s*0.55, 0.32, 0.40], [s*0.53, 0.62, 0.34], [s*0.32, 0.64, 0.34],  // rear (beside the driver, SHOULDER height)
        ], c1);
        addBox(out, s*0.45, 0.59, 0.85, 0.03, 0.03, 1.0, c2);
        // Inner tub wall (dark carbon) facing the driver. Follows the crown up.
        addBox(out, s*0.315, 0.49, 0.52, 0.02, 0.28, 0.60, INTAKE);
      }
      // Dash coaming: the padded rim across the FRONT of the cockpit opening, just
      // under the wheel, tying the two side walls together into a tub.
      // Heights are set against the eye (0.72), and the binding constraint is
      // what lies BEYOND the coaming: the driver must look over it onto the deck
      // and nose running out ahead. At top 0.485 it was the tallest thing in the
      // lower-centre and took 1780 of the deck's 2631 px (OCCLUSION-PROBE.md);
      // 0.425 clears the eye-to-deck-crest sightline, which passes y 0.62 here.
      addBox(out, 0, 0.36, 0.60, 0.66, 0.13, 0.16, c1);
      addBox(out, 0, 0.427, 0.56, 0.60, 0.03, 0.05, c2);       // accent lip
      addBox(out, 0, 0.345, 0.54, 0.52, 0.10, 0.05, INTAKE);   // dark instrument shroud
    } else {
      for (const s of [-1, 1]) {
        addBlock(out, [
          [s*0.24, 0.42, 0.14], [s*0.40, 0.42, 0.14], [s*0.40, 0.60, 0.10], [s*0.24, 0.58, 0.10],
          [s*0.24, 0.44, -0.42], [s*0.40, 0.44, -0.42], [s*0.40, 0.62, -0.44], [s*0.24, 0.60, -0.44],
        ], c1);
      }
    }

    part("sidepods");
    const podGeom = buildSidepodBodywork(out, c1, engStyle, anchors);
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

    const floorEdge = Math.max(0.72, Math.min(1.35, aeroStyle.floorEdge));
    const floorCut = Math.max(0, Math.min(0.24, aeroStyle.floorCut));
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
    // 2026 floor leading-edge devices — up to five vortex teeth across the
    // width (motorsport.tech Issue-12). Chase only: they sit under the nose
    // and never enter the onboard frame.
    if (!ckpt) {
      for (const x of [-0.48, -0.24, 0, 0.24, 0.48]) {
        addBox(out, x, 0.078 + rideDY, 0.82, 0.058, 0.030, 0.11, CARBON, SURFACES.carbon);
      }
    }
    const aSlot = Math.max(0, Math.min(1, Math.round((aeroStyle && aeroStyle.slot) || 0)));
    if (aSlot && !ckpt) {
      for (const s of [-1, 1]) {
        const ex = floorEdgeAt(-1.42);
        addBox(out, s * (ex - 0.04), 0.095 + rideDY, -1.48, 0.10, 0.035, 0.16, INTAKE);
        addBox(out, s * (ex + 0.02), 0.088 + rideDY, -1.48, 0.055, 0.018, 0.12, CARBON);
      }
    }

    part("engineCover");
    let coverGeom = null;
    if (!ckpt) {
      const engT = tier("engine");
      const inScale = (engStyle ? engStyle.in : (engT === 0 ? 0.52 : engT === 2 ? 1.65 : 1.0)) * teamStyle.airbox;
      const engSnork = engStyle ? !!engStyle.snork : engT === 2;
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
        const sk = 0.78 + inScale * 0.32;
        const mouth = { z: -0.12, y: 0.96, w: 0.15 * sk, h: 0.10 * sk, t: 0.62 };
        const crest = { z: -0.38, y: 1.02, w: 0.12 * sk, h: 0.13 * sk, t: 0.55 };
        const merge = { z: -0.68, y: 0.88, w: 0.10 * sk, h: 0.09 * sk, t: 0.50 };
        addSpan(out, mouth, crest, c1, INTAKE);
        addBeveledSpan(out, crest, merge, 0.010, c1, null);
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
      const engOutlet = engStyle && engStyle.outlet != null ? engStyle.outlet
                      : (engT === 2 ? 2 : engT === 0 ? 0 : 1);
      if (engOutlet >= 1) {
        for (const s of [-1, 1]) {
          if (engOutlet === 3) {
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
      addBox(out, 0.12, 0.795, -0.50, 0.075, 0.05, 0.12, [0.10, 0.10, 0.12], SURFACES.carbon);   // housing
      const fuelSurface = SURFACES.metal;
      addBox(out, 0.12, 0.828, -0.50, 0.10,  0.02, 0.15, fuelDisplay, fuelSurface);            // collar ring (proud)
      addBox(out, 0.12, 0.85,  -0.50, 0.035, 0.03, 0.05, fuelDisplay, fuelSurface);            // cap dot
      const fuelFiller = Math.max(0, Math.min(2, Math.round(fuelStyle.filler || 0)));
      if (fuelFiller >= 1) {
        const fuelPorts = [{ x: 0.12, z: -0.50, s: 1 }];
        if (fuelFiller >= 2) fuelPorts.push({ x: 0.12, z: -0.66, s: 0.85 });
        for (const p of fuelPorts) {
          const s = p.s;
          addBeveledSpan(out,
            { z: p.z + 0.082 * s, x: p.x, y: 0.812, w: 0.108 * s, h: 0.036 * s, t: 0.88 },
            { z: p.z - 0.086 * s, x: p.x, y: 0.798, w: 0.060 * s, h: 0.022 * s, t: 0.70 },
            0.007 * s, [0.10, 0.10, 0.12], null, SURFACES.carbon);
          addBox(out, p.x, 0.868, p.z, 0.042 * s, 0.028 * s, 0.042 * s,
                 [0.22, 0.22, 0.24], fuelSurface);
          addBox(out, p.x, 0.886, p.z, 0.050 * s, 0.010 * s, 0.050 * s,
                 fuelDisplay, fuelSurface);
          const r = 0.016 * s, fy = 0.894, n = 6;
          const ctr = [p.x, fy, p.z];
          for (let i = 0; i < n; i++) {
            const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
            addTri(out, ctr,
              [p.x + Math.cos(a1) * r, fy, p.z + Math.sin(a1) * r],
              [p.x + Math.cos(a0) * r, fy, p.z + Math.sin(a0) * r],
              [0.06, 0.06, 0.07], SURFACES.carbon);
          }
        }
        if (fuelFiller >= 2) {
          addSpan(out,
            { z: -0.50, x: 0.02, y: 0.845, w: 0.018, h: 0.018 },
            { z: -0.50, x: 0.02, y: 0.945, w: 0.014, h: 0.014 },
            fuelDisplay, null, fuelSurface);
          addBox(out, 0.02, 0.956, -0.50, 0.016, 0.012, 0.016, fuelDisplay, fuelSurface);
        }
      }
      const fuelHatch = Math.max(0, Math.min(1, Math.round(fuelStyle.hatch || 0)));
      if (fuelHatch) {
        const lift = fuelFiller >= 1 ? 0.055 : 0.028;
        addSpan(out,
          { z: -0.40, x: 0.12, y: 0.872, w: 0.108, h: 0.012, t: 0.92 },
          { z: -0.58, x: 0.12, y: 0.872 + lift, w: 0.096, h: 0.010, t: 0.88 },
          [0.08, 0.08, 0.09], null, SURFACES.carbon);
        addBox(out, 0.12, 0.870, -0.405, 0.092, 0.010, 0.016,
               [0.24, 0.24, 0.26], SURFACES.metal);
      }
      const fuelVent = Math.max(0, Math.min(1, Math.round(fuelStyle.vent || 0)));
      if (fuelVent) {
        addSpan(out,
          { z: -0.50, x: 0.205, y: 0.845, w: 0.016, h: 0.016 },
          { z: -0.50, x: 0.205, y: 0.930, w: 0.012, h: 0.012 },
          fuelDisplay, null, fuelSurface);
        addBox(out, 0.205, 0.940, -0.50, 0.014, 0.012, 0.014,
               [0.10, 0.10, 0.12], SURFACES.carbon);
      }
      // Tank breather across the spine from the filler (filler x +0.12, vent
      // x +0.205 — the breather mirrors at -0.185 so nothing overlaps):
      // 0 none / 1 sunk NACA duct / 2 duct + overflow standpipe.
      const fuelBreather = Math.max(0, Math.min(2, Math.round(fuelStyle.breather || 0)));
      if (fuelBreather > 0) {
        const cb = anchors.coverAt(-0.56);
        addBox(out, -0.185, cb.top + 0.004, -0.56, 0.052, 0.012, 0.085, INTAKE);
        addBox(out, -0.185, cb.top + 0.012, -0.61, 0.058, 0.006, 0.020, CARBON, SURFACES.carbon);
        if (fuelBreather >= 2) {
          addSpan(out,
            { z: -0.62, x: -0.185, y: cb.top + 0.010, w: 0.014, h: 0.014 },
            { z: -0.62, x: -0.185, y: cb.top + 0.078, w: 0.011, h: 0.011 },
            fuelDisplay, null, fuelSurface);
          addBox(out, -0.185, cb.top + 0.088, -0.62, 0.016, 0.012, 0.016,
                 [0.10, 0.10, 0.12], SURFACES.carbon);
        }
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
    // PANEL is a fixed pale grey and in cockpit the board carries NO decal
    // (drawCarDecals swaps in the nose-number quad), so it is a bare light
    // panel on the near plane. Its sibling flash is !ckpt-gated; this was not.
    // External keeps it — it is the substrate titleA is inked on.
    if (!ckpt) addPodFlankSpan(0.46, -0.34, 0.56, 0.48, PANEL, null, 0.008, true);
    addPodFlankSpan(0.46, -0.34, 0.19, 0.22, c2, null, 0.008, true);

    // ERS: a color-coded ENERGY-CELL strip on the coke-bottle shoulder, plus a
    // recipe-gated 2026 hybrid tell: pack blister and/or HV conduit run.
    // Runs ABOVE the sponsor band (titleA y 0.19–0.45) so it never washes the wordmark.
    const ersLed = ersStyle ? ersStyle.led : (tier("ers") === 2 ? ersC2 : null);
    const ersPack = ersStyle ? ersStyle.pack : 1.0;
    const ersGlow = ersLed
      ? ersLed.map((value) => Math.min(value, 1))
      : [1.00, 0.42, 0.08];
    if (ersLed) {
      const half = 0.16 + (ersPack - 0.9) * 0.09;
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
    const ersBlister = Math.max(0, Math.min(2, Math.round((ersStyle && ersStyle.blister) || 0)));
    if (ersBlister > 0 && !ckpt) {
      const bS = 0.92 + 0.18 * Math.max(0, ersPack - 1);
      for (const side of [-1, 1]) {
        const z0 = ersBlister >= 2 ? -0.78 : -0.84;
        const z1 = ersBlister >= 2 ? -1.28 : -1.12;
        const pf = anchors.coverAt(z0), pr = anchors.coverAt(z1);
        addBeveledSpan(out,
          { z: z0, x: side * (pf.x * 0.52), y: pf.top + 0.010 * bS,
            w: 0.090 * bS, h: 0.032 * bS, t: 0.78 },
          { z: z1, x: side * (pr.x * 0.52), y: pr.top + 0.006 * bS,
            w: 0.068 * bS, h: 0.022 * bS, t: 0.70 },
          0.007, CARBON);
        const nSlot = ersBlister >= 2 ? 2 : 1;
        for (let i = 0; i < nSlot; i++) {
          const z = z0 - 0.06 - i * 0.14;
          const p = anchors.coverAt(z);
          addBox(out, side * (p.x * 0.52), p.top + 0.026 * bS, z,
            0.055 * bS, 0.010, 0.036, INTAKE);
        }
        if (ersBlister >= 2) {
          const p = anchors.coverAt(z1 + 0.04);
          addBox(out, side * (p.x * 0.50), p.top + 0.018 * bS, z1 + 0.02,
            0.040 * bS, 0.016, 0.028, INTAKE);
        }
      }
    }
    const ersConduit = Math.max(0, Math.min(2, Math.round((ersStyle && ersStyle.conduit) || 0)));
    if (ersConduit > 0 && !ckpt) {
      const cables = ersConduit >= 2 ? 2 : 1;
      for (const side of [-1, 1]) {
        const pod = anchors.podAt(-0.62);
        const c0 = anchors.coverAt(-0.82);
        const cMid = anchors.coverAt(-1.22);
        const c2e = anchors.coverAt(-1.68);
        for (let k = 0; k < cables; k++) {
          const yo = k * -0.028;
          const xo = k * 0.010 * side;
          const pPack = [side * (pod.x + 0.022 + xo), pod.top + 0.018 + yo, -0.62];
          const pEnter = [side * (c0.x + 0.016 + xo), c0.top - 0.055 + yo, c0.z];
          const pMid = [side * (cMid.x + 0.016 + xo), cMid.top - 0.048 + yo, cMid.z];
          const pK = [side * (c2e.x + 0.014 + xo), c2e.top - 0.040 + yo, c2e.z];
          addBeamBetween(out, pPack, pEnter, 0.022, ersGlow, SURFACES.metal);
          addBeamBetween(out, pEnter, pMid, 0.020, ersGlow, SURFACES.metal);
          addBeamBetween(out, pMid, pK, 0.018, ersGlow, SURFACES.metal);
        }
        addBox(out, side * (pod.x + 0.028), pod.top + 0.014, -0.62,
          0.030, 0.028, 0.038, [0.10, 0.10, 0.12], SURFACES.carbon);
        addBox(out, side * (c2e.x + 0.018), c2e.top - 0.038, c2e.z,
          0.026, 0.032, 0.040, [0.10, 0.10, 0.12], SURFACES.carbon);
        if (ersConduit >= 2) {
          for (let i = 0; i < 2; i++) {
            const z = -0.96 - i * 0.28;
            const p = anchors.coverAt(z);
            addBox(out, side * (p.x + 0.022), p.top - 0.050, z,
              0.028, 0.036, 0.044, [0.10, 0.10, 0.12], SURFACES.carbon);
          }
        }
      }
    }
    // Pack cooling mouth on the pod shoulder ahead of the energy-cell strip:
    // 0 none / 1 low NACA lip / 2 lip + louvre grille behind it.
    const ersIntake = Math.max(0, Math.min(2, Math.round((ersStyle && ersStyle.coolerIntake) || 0)));
    if (ersIntake > 0 && !ckpt) {
      for (const side of [-1, 1]) {
        const p = anchors.podAt(-0.30);
        addBox(out, side * (p.x - 0.02), p.top + 0.008, -0.30, 0.11, 0.016, 0.14, INTAKE);
        addBox(out, side * (p.x - 0.02), p.top + 0.020, -0.38, 0.12, 0.010, 0.030,
               CARBON, SURFACES.carbon);
        if (ersIntake >= 2) {
          for (let i = 0; i < 3; i++) {
            const z = -0.46 - i * 0.05, pl = anchors.podAt(z);
            addBox(out, side * (pl.x - 0.02), pl.top + 0.012, z, 0.10, 0.008, 0.028,
                   CARBON, SURFACES.carbon);
          }
        }
      }
    }

    part("bodyDetail");
    const engInlet = engStyle && engStyle.inlet != null ? engStyle.inlet
                   : (tier("engine") === 2 ? 2 : tier("engine") === 0 ? 0 : 1);
    for (const s of [-1, 1]) {
      const inlet = podGeom.inlet;
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
        // Reverse-P (2026 field majority): tall inboard stem, not a square scoop.
        addBox(out, s * (inlet.x - s * inlet.width * 0.12), inlet.y + inlet.height * 0.08,
               inlet.z, inlet.width * 0.48, inlet.height * 0.88, 0.05, INTAKE);
      }
      const fenceN = Math.max(0, Math.min(6, Math.round(floorStyle.fences)));
      const fenceH = Math.max(0.6, Math.min(1.6, floorStyle.fenceH));
      for (let i = 0; i < fenceN; i++) {
        const fz = 0.42 - i * 0.36;
        const ex = floorEdgeAt(fz);
        addSpan(out,
          { z: fz + 0.075, x: s * (ex + 0.012), y: 0.140 + rideDY + 0.048 * fenceH,
            w: 0.016, h: 0.095 * fenceH },
          { z: fz - 0.075, x: s * (ex + 0.034), y: 0.156 + rideDY + 0.052 * fenceH,
            w: 0.013, h: 0.105 * fenceH },
          CARBON);
      }
      const edgeLip = Math.max(0, Math.min(1, floorStyle.edgeLip || 0));
      if (edgeLip > 0) {
        const ef = floorEdgeAt(0.50), er = floorEdgeAt(-1.10);
        addSpan(out,
          { z: 0.50, x: s * (ef + 0.006), y: 0.080 + rideDY,
            w: 0.014, h: 0.038 + 0.022 * edgeLip },
          { z: -1.10, x: s * (er + 0.006), y: 0.094 + rideDY,
            w: 0.012, h: 0.034 + 0.020 * edgeLip },
          CARBON, null, SURFACES.carbon);
        addBeveledSpan(out,
          { z: 0.50, x: s * (ef + 0.030 + 0.048 * edgeLip), y: 0.118 + rideDY,
            w: 0.038 + 0.055 * edgeLip, h: 0.012 },
          { z: -1.10, x: s * (er + 0.028 + 0.042 * edgeLip), y: 0.138 + rideDY,
            w: 0.032 + 0.048 * edgeLip, h: 0.010 },
          0.004, accentC, null, SURFACES.paint);
      }
      if (Math.round(floorStyle.gurney || 0) > 0) {
        const er = floorEdgeAt(-1.10);
        addBox(out, s * (er + 0.028 + 0.042 * Math.max(0, edgeLip)), 0.154 + rideDY, -1.12,
               0.026, 0.024, 0.014, CARBON, SURFACES.carbon);
      }
      if (Math.round(floorStyle.scroll || 0) > 0) {
        const es = floorEdgeAt(-1.12), et = floorEdgeAt(-1.38);
        addSpan(out,
          { z: -1.08, x: s * (es + 0.010), y: 0.128 + rideDY, w: 0.022, h: 0.028 },
          { z: -1.38, x: s * (et + 0.016), y: 0.172 + rideDY, w: 0.018, h: 0.050 },
          CARBON, null, SURFACES.carbon);
      }
      const TI = [0.62, 0.60, 0.56];
      const skids = Math.max(0, Math.min(2, Math.round(floorStyle.skid || 0)));
      for (let i = 0; i < skids; i++) {
        const sz = 0.30 - i * 1.10;
        const z0 = sz + 0.16, z1 = sz - 0.16;
        addSpan(out,
          { z: z0, x: s * (floorEdgeAt(z0) - 0.09), y: 0.062 + rideDY, w: 0.20, h: 0.010 },
          { z: z1, x: s * (floorEdgeAt(z1) - 0.09), y: 0.062 + rideDY, w: 0.20, h: 0.010 },
          CARBON, null, SURFACES.carbon);
        addBox(out, s * (floorEdgeAt(sz) - 0.09), 0.050 + rideDY, sz, 0.145, 0.014, 0.22,
               TI, SURFACES.metal);
        for (const bz of [sz + 0.09, sz - 0.09]) {
          addBox(out, s * (floorEdgeAt(bz) - 0.012), 0.070 + rideDY, bz, 0.014, 0.008, 0.014,
                 [0.50, 0.48, 0.44], SURFACES.metal);
        }
      }
    }
    if (Math.round(floorStyle.plank || 0) > 0 && !ckpt) {
      const PLANK = [0.52, 0.40, 0.22];
      addSpan(out,
        { z: 0.58, x: 0, y: 0.038 + rideDY, w: 0.30, h: 0.012 },
        { z: -1.36, x: 0, y: 0.038 + rideDY, w: 0.28, h: 0.012 },
        PLANK, null, SURFACES.panel);
      addBox(out, 0, 0.036 + rideDY,  0.55, 0.30, 0.010, 0.08, [0.62, 0.60, 0.56], SURFACES.metal);
      addBox(out, 0, 0.036 + rideDY, -1.32, 0.28, 0.010, 0.08, [0.62, 0.60, 0.56], SURFACES.metal);
    }
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
    const aDuct = Math.max(0, Math.min(2, Math.round((aeroStyle && aeroStyle.duct) || 0)));
    if (aDuct > 0 && !ckpt) {
      for (const s of [-1, 1]) {
        const p = anchors.podAt(0.18);
        const x = s * Math.max(0.22, p.x - 0.04);
        if (aDuct === 1) {
          addBox(out, x, p.top + 0.018, 0.20, 0.11, 0.026, 0.20, INTAKE);
        } else {
          addBeveledSpan(out,
            { z: 0.38, x: x, y: p.top + 0.042, w: 0.10, h: 0.052, t: 0.55 },
            { z: -0.02, x: s * Math.max(0.20, p.x - 0.08), y: p.top + 0.022, w: 0.08, h: 0.038, t: 0.70 },
            0.008, CARBON);
          addBox(out, x, p.top + 0.052, 0.36, 0.068, 0.020, 0.075, INTAKE);
        }
      }
    }

    part("livery");
    const noseAccentRear = anchors.noseAt(1.60), noseAccentFront = anchors.noseAt(2.66);
    addLoft(out, 1.60, 0, noseAccentRear.top + 0.008, 0.09, 0.016,
           2.66, 0, noseAccentFront.top + 0.008, 0.05, 0.014, c2);
    addBox(out, 0, 0.862, -0.42, 0.06, 0.04, 0.52, c2);

    for (const s of [-1, 1]) {
      const nf = anchors.noseAt(2.575), nr = anchors.noseAt(2.025);
      addSpan(out,
        { z: nf.z, x: s*(nf.side + 0.006), y: (nf.bottom + nf.top) * 0.5, w: 0.012, h: 0.040 },
        { z: nr.z, x: s*(nr.side + 0.006), y: (nr.bottom + nr.top) * 0.5, w: 0.012, h: 0.040 },
        accentC);
    }
    if (!ckpt) addPodFlankSpan(0.425, -0.025, 0.88, 0.035, accentC, SURFACES.paint, 0.012);

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
      if (!ckpt) addBox(out, 0, 0.872, -0.42, 0.08, 0.02, 0.56, stripeC);  // airbox spine band (reaches z -0.14, past the driver's head)
      if (!ckpt) {
        addLoft(out, -0.94, 0, 0.775, 0.075, 0.02, -0.70, 0, 0.868, 0.08, 0.02, stripeC); // airbox → cover ridge drop
        addLoft(out, -1.95, 0, 0.600, 0.060, 0.02, -0.94, 0, 0.775, 0.075, 0.02, stripeC); // engine-cover ridge run to the tail
      }
    }
    const noseStripeC = liv.noseStripe || null;
    if (noseStripeC) {
      const ns155 = anchors.noseAt(1.55), ns270 = anchors.noseAt(2.70), ns314 = anchors.noseAt(stripeTipZ);
      addLoft(out, 1.55, 0, ns155.top + 0.016, 0.115, 0.014,
             2.70, 0, ns270.top + 0.016, 0.064, 0.012, noseStripeC);
      addLoft(out, 2.70, 0, ns270.top + 0.016, 0.064, 0.012,
             stripeTipZ, 0, ns314.top + 0.016, 0.036, 0.010, noseStripeC);
    }

    if (noseC) {
      const capRearZ = styledTipZ - 0.38;
      const nt = anchors.noseAt(styledTipZ), nb = anchors.noseAt(capRearZ);
      addSpan(out, { z: styledTipZ + 0.005, y: (nt.bottom + nt.top) * 0.5, w: nt.side*2 + 0.010,
                     h: nt.top - nt.bottom + 0.010, t: 0.70 },
                   { z: capRearZ, y: (nb.bottom + nb.top) * 0.5, w: nb.side*2 + 0.010,
                     h: nb.top - nb.bottom + 0.010, t: 0.86 }, noseC);
    }
    // Proud 0.006 keeps the pod panel UNDER the sponsor board (0.008): a board is
    // applied over the paint, not buried by it. At 0.016 the panel sat proud of
    // the board and covered it, so on every pod-set livery the sidepod wordmark
    // was actually sitting on the pod colour while being inked for the board.
    if (podC) addPodFlankSpan(0.45, 0.11, 0.60, 0.22, podC, SURFACES.paint, 0.006);

    const deckF = anchors.noseAt(2.15), deckR = anchors.noseAt(1.69);
    addLoft(out, deckR.z, 0, deckR.top + 0.010, Math.min(0.28, deckR.topSide*1.75), 0.018,
           deckF.z, 0, deckF.top + 0.010, Math.min(0.28, deckF.topSide*1.75), 0.018, c1);
    const camPod = anchors.noseAt(1.55);
    addBox(out, 0, camPod.top + 0.045, 1.55, 0.06, 0.08, 0.15, DARK);

    part("cockpit");
    // NONE OF THIS BELONGS IN THE FIRST-PERSON BUILD. The cockpit body is its
    // own model (opts.cockpit — see cockpitBodyMesh in game.js), drawn from
    // inside the car, and every piece here surrounds the driver's HEAD: the
    // opening rim is under the eye, the halo hoop passes through it, the rear
    // hoop is behind it and the front pillar lands square in the sightline.
    // Measured on Monza: the halo group projected 47.7 deg above the eye line —
    // a dark bar across the middle of the frame. The chase car keeps all of it.
    if (!ckpt) {
      addBox(out, 0, 0.60, 0.12, 0.40, 0.045, 0.78, [0.04, 0.04, 0.05], SURFACES.carbon);
      // The dark converging beams + front post that used to sit here were the
      // pre-tube inner halo frame. With the real titanium hoop and centre
      // pillar in part("halo"), they were duplicate structure reading as a
      // black chevron directly under the level crown bar — removed.
      addBox(out, 0, 0.74, -0.18, 0.60, 0.06, 0.07, DARK); // rear hoop
      // Recipe-gated HEADREST behind the helmet: 0 flat rim (shipped) / 1 raised
      // horseshoe pad / 2 winged pad. Front face z -0.25 sits just behind the
      // helmet dome (centre z -0.08, r 0.145 -> rear extent -0.225); pad tops
      // stay under the airbox intake underside (y 0.715).
      const headrest = Math.max(0, Math.min(2, Math.round(cockpitStyle.headrest || 0)));
      const PAD = [0.08, 0.08, 0.10];
      if (headrest === 1) {
        addBox(out, 0, 0.655, -0.30, 0.34, 0.075, 0.10, PAD, SURFACES.carbon);
        for (const s of [-1, 1])
          addBox(out, s * 0.20, 0.645, -0.16, 0.06, 0.065, 0.24, PAD, SURFACES.carbon);
      } else if (headrest === 2) {
        addBox(out, 0, 0.665, -0.31, 0.36, 0.095, 0.11, PAD, SURFACES.carbon);
        for (const s of [-1, 1]) {
          addBox(out, s * 0.21, 0.675, -0.22, 0.05, 0.075, 0.16, PAD, SURFACES.carbon);
          addBox(out, s * 0.215, 0.700, -0.13, 0.04, 0.028, 0.10, PAD, SURFACES.carbon);
        }
      }
    } else if (opts && opts.halo) {
      // First-person hoop: same round-tube, LEVEL-bar treatment as the
      // exterior halo — the driver sees a flat bar across the top of the
      // frame (crown constant at 0.96), not tubes converging at the centre.
      // Legs rise from the old loft endpoints (±0.30, 0.92, -0.15).
      addTube(out, haloHoopPath(0.30, 0.92, -0.15, 0.28, 0.18, 0.96, 0.62),
              0.025, 6, HALO, SURFACES.metal);
      addBox(out, 0, 0.79, 0.62, 0.045, 0.38, 0.045, HALO, SURFACES.metal); // front pillar
    }
    // The hoop centreline is computed HERE (shared by the blade fairing below
    // and part("halo") further down — the sections run in one function scope).
    const haloSty = Math.max(0, Math.min(2, Math.round(cockpitStyle.halo || 0)));
    const hr = haloSty === 1 ? 0.024 : 0.028;
    const crownY = 0.845 - (haloSty === 1 ? 0.008 : 0);
    const hoop = ckpt ? null : haloHoopPath(0.235, 0.505, -0.46, 0.30, 0.02, crownY, 0.49);
    const haloBlade = Math.max(0, Math.min(2, Math.round(ckpt ? 0 : cockpitStyle.haloBlade || 0)));
    if (haloBlade > 0) {
      const bladeC = haloTint || HALO;
      // The fairing is a CO-AXIAL TUBE over the hoop's own centreline — a
      // fairing thickens the hoop it wraps. The old four straight spans
      // chorded the curve and read as the pre-tube triangle laid over the
      // round halo. Radii sit 8-11 mm proud of the hoop: no coplanar faces.
      if (haloBlade === 1) {
        // Low fairing: shoulders + crown bar only (path pts 3..11 of 15).
        addTube(out, hoop.slice(3, 12), hr + 0.008, 6, bladeC, SURFACES.metal);
      } else {
        // Full shroud: the whole hoop, plus the centre spine riding clear of
        // the fatter tube.
        addTube(out, hoop, hr + 0.011, 6, bladeC, SURFACES.metal);
        addBeveledSpan(out,
          { z: 0.50, x: 0, y: 0.904, w: 0.083, h: 0.032, t: 0.50 },
          { z: 0.30, x: 0, y: 0.892, w: 0.050, h: 0.027, t: 0.55 },
          0.008, bladeC, null, SURFACES.metal);
      }
    }
    if (cockpitStyle.haloWing && !ckpt) {
      const wingC = haloTint || HALO;
      addBeveledSpan(out,
        { z: 0.18, x: 0, y: 0.875, w: 0.32, h: 0.016, t: 0.50 },
        { z: -0.02, x: 0, y: 0.868, w: 0.24, h: 0.012, t: 0.42 },
        0.005, wingC, null, SURFACES.metal);
      for (const s of [-1, 1]) {
        addBox(out, s * 0.155, 0.872, 0.08, 0.010, 0.028, 0.10, wingC, SURFACES.metal);
      }
    }
    const camPods = Math.max(0, Math.min(2, Math.round(ckpt ? 0 : cockpitStyle.camPods || 0)));
    for (let i = 0; i < camPods; i++) {
      const s = i === 0 ? -1 : 1;
      addBeamBetween(out,
        [s * 0.11, 0.760, -0.20],
        [s * 0.12, 0.812, -0.14],
        0.014, DARK);
      addBox(out, s * 0.12, 0.818, -0.118, 0.030, 0.026, 0.042, DARK);
      addBox(out, s * 0.12, 0.818, -0.094, 0.016, 0.014, 0.008, VISOR, SURFACES.glass);
    }
    if (cockpitStyle.screen && !ckpt) {
      addLoft(out, 0.48, 0, 0.655, 0.40, 0.028,
                   0.62, 0, 0.720, 0.20, 0.022, DARK);
      addLoft(out, 0.495, 0, 0.668, 0.34, 0.018,
                   0.605, 0, 0.710, 0.16, 0.014, VISOR, SURFACES.glass);
      for (const s of [-1, 1]) {
        addLoft(out, 0.50, s * 0.16, 0.690, 0.10, 0.020,
                     0.58, s * 0.06, 0.730, 0.06, 0.016, DARK);
      }
    }

    part("mirrors");
    const mSty = ckpt ? 0 : teamStyle.mirror;
    // Placement is REGULATION (docs/COCKPIT-DATUMS.md): the body must lie inside
    // RV-MIRROR-BODY, Y 470..680 x Z 640..720. At x 0.44 / y 0.735 ours sat
    // inboard of that volume AND above its ceiling — reported as "floating".
    const mz = ckpt ? 0.92 : 0.24;
    const mx = (ckpt ? 0.60 : 0.34) + (mSty === 1 ? 0.035 : 0);
    const msx = ckpt ? 0.54 : 0.30;
    const mY = (ckpt ? 0.678 : 0.735) + (mSty === 2 ? -0.032 : 0);
    const mW = mSty === 1 ? 0.235 : 0.215;   // swept style: wider housing
    const mH = mSty === 1 ? 0.065 : 0.075;
    for (const s of [-1, 1]) {
      // Tapered aero arm (wide at the tub, narrow at the housing) instead of a
      // flat box — real F1 mirror stalks are swept aero elements, not a plain post.
      // C3.7.5: the Inner Stay "must intersect Mirror Body and Mid Chassis". The
      // ckpt root is BURIED in the crown; it used to start at 0.68 — 17 cm above
      // it, attached to nothing. Move the crown and this must move with it.
      const xi = s * (msx - 0.04), xo = s * mx;
      const sB = ckpt ? 0.53 : 0.68;    // root, BURIED in the crown (0.558 at z 0.92)
      const sR = ckpt ? 0.10 : 0.04;    // rise: must span crown -> housing underside
      const aY = mY - (ckpt ? 0.678 : 0.735);   // style drop carries into the stalk too
      addBlock(out, [
        [xi, sB + aY, mz - 0.045], [xi, sB + aY, mz + 0.045], [xi, sB + sR + aY, mz + 0.045], [xi, sB + sR + aY, mz - 0.045],
        [xo, sB + sR*0.75 + aY, mz - 0.02],  [xo, sB + sR*0.75 + aY, mz + 0.02],  [xo, sB + sR*1.5 + aY, mz + 0.02],  [xo, sB + sR*1.5 + aY, mz - 0.02],
      ], DARK);
      // Glass goes on the face TOWARD the viewer (-z). It used to sit at
      // mz+0.066 — 8mm BEYOND the housing's own back face, so the driver AND
      // the chase camera both saw carbon and never the reflective surface.
      // Housing as an 8-corner block with the outboard face pulled BACK in z —
      // the C14.2.2 d i inboard toe (~25°): real mirrors angle at the driver,
      // and the cant is what stops the housing reading as a shoebox.
      const toe = ckpt ? 0 : 0.045;
      const hy0 = mY - mH / 2, hy1 = mY + mH / 2;
      const xIn = s * (mx - mW / 2), xOut = s * (mx + mW / 2);
      addBlock(out, [
        [xIn, hy0, mz - 0.03], [xOut, hy0, mz - 0.03 + toe], [xOut, hy1, mz - 0.03 + toe], [xIn, hy1, mz - 0.03],
        [xIn, hy0, mz + 0.03], [xOut, hy0, mz + 0.03 + toe], [xOut, hy1, mz + 0.03 + toe], [xIn, hy1, mz + 0.03],
      ], [0.09, 0.09, 0.11], null, SURFACES.carbon);
      addBox(out, s*mx, mY, mz - 0.032, mW * 0.97, mH * 0.80, 0.012, [0.10, 0.11, 0.14], SURFACES.glass); // bezel / surround
      // glass clamps roughness <=0.13 and adds an env lobe, so this colour is a
      // FLOOR the sky stacks on. From chase the periwinkle reads as a bright
      // mirror (wanted); from the cockpit the pair sits 1.2 m out at +-30 deg
      // and the same wash reads as two blank pale boxes flanking the wheel
      // (21 of 6095 view rays). Dark glass keeps the sheen, drops the slab.
      addBox(out, s*mx, mY, mz - 0.038, 0.200, 0.050, 0.008,
             ckpt ? [0.10, 0.12, 0.17] : [0.46, 0.56, 0.78], SURFACES.glass); // reflective surface, C14.2.2b
      if (!ckpt) {
        // Top winglet + the C3.7.5 OUTER stay down to the tub shoulder — the
        // two details every 2026 housing carries.
        addBox(out, s*mx, hy1 + 0.008, mz + 0.01, mW * 0.9, 0.008, 0.055, DARK, SURFACES.carbon);
        addBeamBetween(out, [s * (mx + mW * 0.38), hy0, mz + 0.02],
                            [s * (msx + 0.06), 0.60, mz + 0.10], 0.012, DARK, SURFACES.carbon);
      }
    }

    part("helmet");
    if (!(opts && opts.noDriver)) {
      const helmC = (opts && opts.num != null) ? HELMET_ACCENT[((opts.num % HELMET_ACCENT.length) + HELMET_ACCENT.length) % HELMET_ACCENT.length] : c2;
      addDome(out, 0, 0.585, -0.08, 0.145, c1);
      addBox(out, 0, 0.64, 0.05, 0.20, 0.075, 0.045, VISOR);  // visor band
      addBox(out, 0, 0.715, -0.09, 0.10, 0.026, 0.17, helmC); // crown stripe (driver accent)
      addBox(out, 0, 0.60, 0.11, 0.11, 0.05, 0.02, helmC);    // nose flash
    }

    // NOT in the first-person build: it spans z -0.305..-0.175 and y 0.715..
    // 0.805, so against a driver's eye at (0.72, -0.20) its front face is 2.5 cm
    // from the camera and it straddles the eye line. Measured via the engine's
    // own occlusion raster: `player` 20.4% of the frame at distM 0.2 — this box
    // was the dark mass across the view, and the thing "cutting" the wheel.
    if (!ckpt) addBox(out, 0, 0.76, -0.24, 0.15, 0.09, 0.13, INTAKE);

    if (!(opts && opts.noDriver)) {
      addBox(out, 0, 0.885, -0.30, 0.035, 0.09, 0.035, DARK);   // stalk
      addBox(out, 0, 0.955, -0.30, 0.30, 0.055, 0.06, DARK);    // T bar
      addBox(out, 0, 0.988, -0.30, 0.03, 0.02, 0.03, [0.12, 0.75, 0.28], SURFACES.paint);
    }

    part("halo");
    if (!ckpt) {
      const haloC = haloTint || HALO;   // livery-tinted hoop, else brushed titanium
      // Round titanium hoop with a LEVEL, gently arched top bar: one
      // continuous tube, collars (±0.235, 0.505, -0.46) rising to a crown
      // that holds y 0.845 (+HALO_RISE shallow arch) from mid to mid while
      // sweeping to the front apex (z 0.49) — round in plan, never peaking or
      // dipping toward the centre. r 0.028 keeps the old square section's
      // outer envelope, so the haloBlade/haloWing/camPods attachments above
      // still land on the hoop. haloSty/hr/crownY and the hoop path itself
      // (haloHoopPath(0.235, 0.505, -0.46, 0.30, 0.02, crownY, 0.49)) are
      // computed once beside the blade fairing above, which wraps the SAME
      // centreline as a co-axial tube.
      // Front centre pillar rises to y 0.83 — overlapping the flat bar's
      // underside (0.845 - 0.028 = 0.817) by ~1.3 cm, never stopping short.
      addBox(out, 0, 0.68, 0.47, 0.035, 0.30, 0.05, haloC, SURFACES.metal);
      addTube(out, hoop, hr, 6, haloC, SURFACES.metal);
      // The real strut SPLITS into a V at the top, meeting the ring at two
      // points either side of the apex — the wishbone silhouette head-on.
      for (const s of [-1, 1])
        addBeamBetween(out, [0, 0.775, 0.468], [s * 0.105, crownY - hr * 0.4, 0.474],
                       0.015, haloC, SURFACES.metal);
      if (haloSty === 2) {
        // Fenced hoop: three small crest vanes riding the crown bar (hoop
        // indices 5/7/9 = mid-left, apex, mid-right of the 7-point bar).
        for (const hi of [5, 7, 9]) {
          const p = hoop[hi];
          addBox(out, p[0], p[1] + hr + 0.012, p[2], 0.012, 0.026, 0.055,
                 haloC, SURFACES.metal);
        }
      }
    }

    part("exhaust");
    const exhTwin = exhStyle.pipes != null ? exhStyle.pipes >= 3
      : (engStyle ? !!engStyle.twin : tier("engine") === 2);
    const exhBore = Math.max(0.7, Math.min(1.5, exhStyle.bore));
    const exhR = (engStyle ? (engStyle.twin ? 0.09 : (engStyle.in < 0.9 ? 0.05 : 0.07))
                          : (tier("engine") === 0 ? 0.05 : tier("engine") === 2 ? 0.09 : 0.07)) * exhBore;
    const fuelFlame = fuelStyle && fuelStyle.flame || [1.15, 0.42, 0.14];
    const fTwin = [fuelFlame[0]*0.9, fuelFlame[1]*0.9, fuelFlame[2]*0.9];
    const exhMetal = [0.16, 0.16, 0.17];
    const exhFlareC = [0.18, 0.18, 0.19];
    const glazeOf = (rgb) => rgb.map((value) => Math.min(value * 0.45, 0.65));
    const exhDia = (cx, cy, z, r) => [
      [cx, cy - r, z], [cx + r, cy, z], [cx, cy + r, z], [cx - r, cy, z],
    ];
    addBox(out, 0, 0.40, -2.12, exhR, exhR, 0.16, exhMetal, SURFACES.metal);
    const exhFlare = Math.max(0, Math.min(1, exhStyle.flare || 0));
    if (exhFlare > 0) {
      const tip = exhR * (1 + 0.55 * exhFlare);
      addLoft(out, -2.16, 0, 0.40, exhR * 2, exhR * 2,
              -2.23, 0, 0.40, tip * 2, tip * 2,
              exhFlareC, SURFACES.metal);
      addStationLoft(out, [
        exhDia(0, 0.40, -2.16, exhR),
        exhDia(0, 0.40, -2.23, tip),
      ], exhFlareC, null, SURFACES.metal);
      addBox(out, 0, 0.40, -2.245, tip * 2.18, tip * 2.18, 0.018,
             [0.22, 0.22, 0.24], SURFACES.metal);
      addBox(out, 0, 0.40, -2.250, tip * 1.45, tip * 1.45, 0.016,
             [0.05, 0.04, 0.04], SURFACES.carbon);
    }
    if (exhStyle.wrap) {
      addBox(out, 0, 0.40, -2.04, exhR * 1.18, exhR * 1.18, 0.06,
             [0.72, 0.70, 0.66], SURFACES.panel);
      addBox(out, 0, 0.40, -2.00, exhR * 1.24, exhR * 1.12, 0.045,
             [0.68, 0.66, 0.62], SURFACES.panel);
      addBox(out, 0, 0.40, -1.96, exhR * 1.14, exhR * 1.22, 0.045,
             [0.74, 0.72, 0.67], SURFACES.panel);
      addBox(out, 0, 0.40, -2.02, exhR * 1.30, 0.012, 0.012,
             [0.22, 0.22, 0.24], SURFACES.metal);
    }
    const exhGates = Math.max(0, Math.min(2, Math.round(exhStyle.wastegate || 0)));
    for (let i = 0; i < exhGates; i++) {
      const s = i === 0 ? -1 : 1;
      addSpan(out, { z: -2.02, x: s * 0.075, y: 0.47, w: 0.036, h: 0.036 },
                   { z: -2.16, x: s * 0.095, y: 0.53, w: 0.030, h: 0.030 },
              [0.20, 0.20, 0.22], null, SURFACES.metal);
      addBox(out, s * 0.098, 0.535, -2.175, 0.034, 0.034, 0.028,
             [0.22, 0.22, 0.24], SURFACES.metal);
      addBox(out, s * 0.098, 0.535, -2.192, 0.020, 0.020, 0.012,
             glazeOf(fTwin), SURFACES.metal);
    }
    addBox(out, 0, 0.40, -2.185, exhR*0.72, exhR*0.72, 0.03, [0.05, 0.04, 0.04], SURFACES.carbon);
    addBox(out, 0, 0.40, -2.198, exhR*0.55, exhR*0.55, 0.012,
           glazeOf(fuelFlame), SURFACES.metal);
    // HEAT STAIN. Before this the `flame` recipe key reached only three ~2 cm
    // glaze pips deep in the pipe mouths — 0.0028 m2, which --clamp-scan reads
    // as a dead key, so the one place a fuel grade is supposed to show was too
    // small to see. A discoloured sleeve on the last stretch of every pipe
    // carries the same colour at a size a camera can resolve. Blended
    // half-and-half with the pipe metal so it reads as bluing, not as paint.
    const heatOf = (c) => {
      const g = glazeOf(c);
      return [exhMetal[0]*0.55 + g[0]*0.45, exhMetal[1]*0.55 + g[1]*0.45,
              exhMetal[2]*0.55 + g[2]*0.45];
    };
    addBox(out, 0, 0.40, -2.155, exhR*1.06, exhR*1.06, 0.075, heatOf(fuelFlame), SURFACES.metal);
    if (exhTwin) {
      for (const s of [-1, 1]) {
        addBox(out, s*0.15, 0.40, -2.10, 0.045, 0.045, 0.14, exhMetal, SURFACES.metal);
        addBox(out, s*0.15, 0.40, -2.172, 0.026, 0.026, 0.012,
               glazeOf(fTwin), SURFACES.metal);
        addBox(out, s*0.15, 0.40, -2.135, 0.049, 0.049, 0.070,
               heatOf(fTwin), SURFACES.metal);
        addStationLoft(out, [
          exhDia(s * 0.15, 0.40, -2.03, 0.045),
          exhDia(s * 0.15, 0.40, -2.17, 0.045),
        ], exhMetal, null, SURFACES.metal);
      }
      addBox(out, 0, 0.40, -2.05, 0.32, 0.018, 0.040, exhMetal, SURFACES.metal);
    }
    const exhLip = Math.max(0, Math.min(2, Math.round(exhStyle.lip || 0)));
    if (exhLip >= 1) {
      const colR = exhR * (1 + 0.22 * exhLip);
      addBox(out, 0, 0.40, -2.08, colR * 2.15, colR * 2.15, 0.09, CARBON, SURFACES.carbon);
      addBox(out, 0, 0.40, -2.125, colR * 1.95, colR * 1.95, 0.03,
             [0.20, 0.20, 0.22], SURFACES.metal);
    }
    if (exhLip >= 2) {
      const colR = exhR * 1.44;
      addBox(out, 0, 0.40, -2.02, colR * 2.35, colR * 2.35, 0.06, CARBON, SURFACES.carbon);
    }
    if (exhStyle.shield) {
      addBox(out, 0, 0.40 + exhR + 0.028, -2.05, Math.max(0.12, exhR * 2.6), 0.010, 0.16,
             [0.32, 0.30, 0.28], SURFACES.metal);
      for (const s of [-1, 1]) {
        addBox(out, s * (exhR + 0.022), 0.40 + exhR * 0.45, -2.05, 0.010, exhR * 1.05, 0.13,
               [0.28, 0.26, 0.24], SURFACES.metal);
      }
    }

    part("sharkFin");
    if (!ckpt) {
      const fb = FIN.halfBase, ft = FIN.halfTop;
      addBlock(out, [
        [-fb, FIN.baseLE[1], FIN.baseLE[0]], [fb, FIN.baseLE[1], FIN.baseLE[0]],
        [ft, FIN.topLE[1], FIN.topLE[0]],    [-ft, FIN.topLE[1], FIN.topLE[0]],
        [-fb, FIN.baseTE[1], FIN.baseTE[0]], [fb, FIN.baseTE[1], FIN.baseTE[0]],
        [ft, FIN.topTE[1], FIN.topTE[0]],    [-ft, FIN.topTE[1], FIN.topTE[0]],
      ], finC);
    }

    part("sponsorBoard");
    const aeroT = tier("aero");
    const aLvl = aeroStyle && aeroStyle.lvl != null
      ? aeroStyle.lvl : (aeroT === 0 ? 0 : aeroT === 2 ? 4 : 2);
    out.flapInfo = { aLvl, style: aeroStyle, col: wingC, finish: liv.finish };

    const nb = numberBoard(aLvl);
    for (const s of [-1, 1]) {
      addBox(out, s*0.527, nb.cy, -2.42, 0.012, nb.h, 0.30, c1);
    }

    part("frontWing");
    // COCKPIT-ONLY front wing. The real cascade below is correct and, from a
    // seated eye, invisible: MEASURED 12.9 deg below the sightline, which is
    // UNDER the hood crest (9.8), so it rasterised 0.01% of frame. The
    // first-person body is its own mesh, so it carries its own wing where the
    // driver can see it — 8.5 deg down, between nose deck (7.1) and hood
    // crest. View-only by design; the chase car's wing is untouched.
    // Rastered at canvas res it lands at x 228..615, y 226..313 of 844x390 —
    // on screen, below centre, and still hard to see: 20208 px alone, 6901
    // surviving (bolsters 9029, hood 2214, mirrors 1526), in the flap colour
    // against a dark surround. So the plane takes the PRIMARY livery colour
    // and rises to 0.47 (8.0 deg down, just under the nose deck's 7.1).
    if (ckpt) {
      addBox(out, 0, 0.47, 2.30, 1.62, 0.040, 0.44, c1, SURFACES.paint);
      for (const s of [-1, 1])
        addBox(out, s*0.84, 0.55, 2.30, 0.035, 0.20, 0.48, wingC, SURFACES.paint);
    }
    const aBeam = aeroStyle ? (aeroStyle.beam || 0) : (aeroT === 2 ? 1 : 0);
    const aDrs  = aeroStyle ? (aeroStyle.drs  || 0) : 0;
    const frontSweep = Math.max(-0.08, Math.min(0.22, aeroStyle.frontSweep));
    const frontTaper = Math.max(0.72, Math.min(1.08, aeroStyle.frontTaper));
    const frontRise = Math.max(-0.03, Math.min(0.16, aeroStyle.frontRise));

    const fwHalf = frontHalf(aLvl);               // half-span (endplate sits just outside)
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
    const aPlate = Math.max(0, Math.min(3, Math.round(
      aeroStyle.plate != null ? aeroStyle.plate : 1)));
    const PLATE = [
      { hF: 0.16, hR: 0.30, kick: 0.020, footW: 0.09, footZ: 0.46, arch: 0 },
      { hF: 0.22, hR: 0.40, kick: 0.060, footW: 0.13, footZ: 0.54, arch: 0 },
      { hF: 0.30, hR: 0.54, kick: 0.100, footW: 0.19, footZ: 0.62, arch: 1 },
      // 3: outwash spec — tall plate whose TOP EDGE ROLLS OUTBOARD (roll: 1
      // adds the curled lip below), the 2026 field's signature endplate.
      { hF: 0.28, hR: 0.50, kick: 0.120, footW: 0.16, footZ: 0.58, arch: 0, roll: 1 },
    ][aPlate];
    const aCasc = Math.max(0, Math.min(3, Math.round(aeroStyle.casc != null ? aeroStyle.casc
      : (aLvl >= 4 ? 3 : (aLvl >= 3 ? 2 : (aLvl >= 1 ? 1 : 0))))));
    for (const s of [-1, 1]) {
      const epW = aLvl >= 4 ? 0.060 : (aLvl <= 0 ? 0.028 : 0.044);
      const epX = s * (fwHalf + 0.03);
      addBeveledSpan(out,
        { z: 2.66, x: epX,                y: 0.135, w: epW, h: PLATE.hF, t: 0.62 },
        { z: 1.98, x: epX + s*PLATE.kick, y: 0.245, w: epW, h: PLATE.hR, t: 0.78 },
        Math.min(0.014, epW * 0.28), c2);
      addBox(out, epX + s*(PLATE.footW * 0.23), 0.050, 2.30, PLATE.footW, 0.016, PLATE.footZ, c1);
      addBeveledSpan(out,
        { z: 2.58, x: s * (fwHalf * 0.52), y: 0.058, w: 0.012, h: 0.050, t: 0.50 },
        { z: 2.20, x: s * (fwHalf * 0.70), y: 0.066, w: 0.010, h: 0.044, t: 0.68 },
        0.005, CARBON);
      if (PLATE.arch) {
        addBeveledSpan(out,
          { z: 2.60, x: epX + s*0.012, y: 0.135 + PLATE.hF * 0.5 + 0.010, w: 0.030, h: 0.018 },
          { z: 2.06, x: epX + s*(PLATE.kick + 0.012), y: 0.245 + PLATE.hR * 0.5 + 0.010, w: 0.026, h: 0.016 },
          0.008, c1);
      }
      if (aPlate >= 2) {
        // GILLS. The rear endplate has had its louvre stack for ages; the
        // front plate — the one a chase camera actually fills the frame with —
        // had a blank outboard face. Three recessed slots, proud of the plate
        // so they read as cuts rather than z-fighting decals.
        for (let i = 0; i < 3; i++) {
          const gz = 2.42 - i * 0.15;
          addBox(out, epX + s * 0.010, 0.185 + PLATE.hF * 0.30 + i * 0.026, gz,
                 0.014, 0.020, 0.11, INTAKE, SURFACES.carbon);
        }
        // FILLET at the plate-to-main-plane junction: the hard 90 deg corner
        // there is the last unfaired intersection on the front wing.
        addBeveledSpan(out,
          { z: 2.60, x: epX - s * 0.030, y: 0.150, w: 0.060, h: 0.030, t: 0.35 },
          { z: 2.26, x: epX - s * 0.026, y: 0.178, w: 0.050, h: 0.024, t: 0.30 },
          0.006, c1);
      }
      if (PLATE.roll) {
        // Rolled top edge: a lip leaning OUTBOARD off the plate crown, wider
        // and more canted at the rear — the outwash curl, not a straight rail.
        addBeveledSpan(out,
          { z: 2.58, x: epX + s * 0.020, y: 0.135 + PLATE.hF * 0.5 + 0.006, w: 0.040, h: 0.014, t: 0.45 },
          { z: 2.02, x: epX + s * (PLATE.kick + 0.048), y: 0.245 + PLATE.hR * 0.5 - 0.004, w: 0.062, h: 0.012, t: 0.40 },
          0.006, c2);
      }
      // Canard / dive-plane cascade on the outer face of the endplate.
      const nCan = aCasc;
      for (let i = 0; i < nCan; i++) {
        const cz = 2.52 - i * 0.18, cy = 0.170 + i * 0.058;
        addBeveledSpan(out,
          { z: cz,        x: s * (fwHalf - 0.03), y: cy,         w: 0.018, h: 0.12, t: 0.55 },
          { z: cz - 0.22, x: epX + s*0.05,        y: cy + 0.070, w: 0.018, h: 0.18, t: 0.70 },
          0.008, c1);
      }
      addBox(out, s*0.10, 0.19, 2.46, 0.055, 0.20, 0.17, c1);                 // nose pylon
    }

    const aVane = aeroStyle && aeroStyle.vane != null ? aeroStyle.vane
                : (aLvl >= 4 ? 3 : aLvl >= 3 ? 2 : aLvl >= 1 ? 1 : 0);
    if (!ckpt && aVane > 0) {
      for (const s of [-1, 1]) {
        // Primary vane — always present.
        addBeveledSpan(out,
          { z: 1.15, x: s*0.73, y: 0.30, w: 0.014, h: 0.22, t: 0.50 },
          { z: 0.81, x: s*0.73, y: 0.30, w: 0.014, h: 0.22, t: 0.50 },
          0.006, CARBON);
        if (aVane >= 2) addBeveledSpan(out,
          { z: 0.87, x: s*0.66, y: 0.26, w: 0.014, h: 0.17, t: 0.50 },
          { z: 0.57, x: s*0.66, y: 0.26, w: 0.014, h: 0.17, t: 0.50 },
          0.006, CARBON);
        if (aVane >= 3) {
          // Curved triple cascade: a swept forward vane + a canted footplate vane.
          addBeveledSpan(out,
            { z: 1.28, x: s*0.70, y: 0.28, w: 0.02, h: 0.20 },
            { z: 0.98, x: s*0.62, y: 0.24, w: 0.02, h: 0.26 },
            0.008, CARBON);
          addBox(out, s*0.60, 0.19, 0.86, 0.16, 0.014, 0.36, CARBON);   // horizontal turning vane
        }
      }
    }
    // 2026 in-wash WAKEBOARD (`board`) — the regulated floor-board / bargeboard
    // return, inboard of the turning-vane cluster so the two never occupy the
    // same volume. 0 none · 1 vertical fence · 2 fence + horizontal foot.
    const aBoard = Math.max(0, Math.min(2, Math.round((aeroStyle && aeroStyle.board) || 0)));
    if (aBoard > 0 && !ckpt) {
      for (const s of [-1, 1]) {
        addBeveledSpan(out,
          { z: 1.38, x: s * 0.48, y: 0.20, w: 0.014, h: aBoard === 2 ? 0.20 : 0.14, t: 0.45 },
          { z: 0.92, x: s * 0.58, y: 0.24, w: 0.012, h: aBoard === 2 ? 0.16 : 0.12, t: 0.60 },
          0.006, CARBON);
        if (aBoard >= 2) addBeveledSpan(out,
          { z: 1.22, x: s * 0.44, y: 0.145, w: 0.15, h: 0.016, t: 0.70 },
          { z: 0.86, x: s * 0.56, y: 0.165, w: 0.12, h: 0.014, t: 0.80 },
          0.005, CARBON);
      }
    }

    part("rearAssembly");
    if (!ckpt) {
      const aN     = aLvl / 4;                  // 0..1 normalized downforce level
      const rwLift = (aLvl - 2) * 0.045;        // gentler vertical shift (beam-wing ref)
      const _ep    = endplateGeom(aLvl);
      const epSY   = _ep.sy;   // lvl0 0.28 → lvl2 0.47 → lvl4 0.58 (capped)
      const epCY   = _ep.cy;   // lvl0 0.60 → lvl2 0.72 → lvl4 0.80 (slow rise)
      for (const s of [-1, 1]) {
        addBeveledSpan(out,
          { z: _ep.front.z, x: s*0.50, y: _ep.front.cy, w: 0.040, h: _ep.front.sy, t: 0.58 },
          { z: _ep.rear.z, x: s*0.50, y: _ep.rear.cy, w: 0.040, h: _ep.rear.sy, t: 0.72 },
          0.012, DARK);
        // Louvre detail: a stack of thin recessed slots near the top-rear corner.
        for (let i = 0; i < 4; i++)
          addBox(out, s*0.515, epCY + epSY*0.5 - 0.07 - i*0.06, -2.30, 0.018, 0.016, 0.18, INTAKE);
        addBeveledSpan(out,
          { z: _ep.front.z, x: s*0.50, y: _ep.front.top, w: 0.046, h: 0.018, t: 0.70 },
          { z: _ep.rear.z, x: s*0.50, y: _ep.rear.top, w: 0.046, h: 0.018, t: 0.85 },
          0.006, c2, null, SURFACES.paint);
      }
      const rearSweep = Math.max(-0.06, Math.min(0.20, aeroStyle.rearSweep));
      const rearTaper = Math.max(0.72, Math.min(1.08, aeroStyle.rearTaper));
      const crownY = _ep.rear.top - 0.018;
      const upperTrailY = crownY - (aLvl >= 4 || aDrs ? 0.075 : 0);
      const rearWing = (zLead, yLead, zTrail, yTrail, half, thick, col, scale) =>
        addWingFoil(out, {
          zLead, yLead, zTrail, yTrail, half, thick,
          taper: rearTaper, sweep: rearSweep * (scale == null ? 1 : scale), rise: 0,
          attachHalf: 0.50,
        }, col, SURFACES.paint);
      rearWing(-2.30, upperTrailY - 0.270, -2.52, upperTrailY - 0.225,
        0.51, 0.024, c1, 0.8);
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
      const aTvane = aeroStyle && aeroStyle.tvane != null
        ? (aeroStyle.tvane ? 1 : 0) : (aLvl >= 4 && !aDrs ? 1 : 0);
      if (aTvane) {
        addWingFoil(out, {
          zLead: -1.935, yLead: epCY + 0.188, zTrail: -2.025, yTrail: epCY + 0.212,
          half: 0.17, thick: 0.014, taper: 0.90, sweep: 0.018, rise: 0.006,
        }, c2, SURFACES.paint);
        addBox(out, 0, (0.56 + epCY + 0.19) / 2, -1.98, 0.03, epCY + 0.19 - 0.56, 0.025, DARK);
      }
      if (aBeam) {
        // Prominent beam wing slung low under the main plane, spanning the crash structure.
        rearWing(-2.36, 0.64 + rwLift * 0.4, -2.58, 0.68 + rwLift * 0.4,
          0.46, 0.022, c1, 0.65);
      }
      if (aDrs) {
        // Active-aero DRS: an extra open slot flap proud of the top flap.
        rearWing(-2.44, crownY - 0.050, -2.60, crownY, 0.49, 0.016, c2, 1.15);
      }
      const drsSX = aLvl >= 3 ? 0.13 : 0.10;
      addBox(out, 0, epCY + 0.265, -2.52, drsSX, 0.05, 0.18, DARK); // DRS actuator pod

      addBox(out, 0, 0.50, -2.52, 0.13, 0.18, 0.10, DARK);
      addBox(out, 0, 0.50, -2.585, 0.10, 0.13, 0.03,
             [2.6, 0.08, 0.06], SURFACES.emissive);
      addBox(out, 0, 0.50, -2.60, 0.04, 0.05, 0.02,
             [3.4, 0.12, 0.05], SURFACES.emissive);   // brake-light core

      const diffW  = (0.72 + aLvl * 0.145) * Math.max(0.78, Math.min(1.3, aeroStyle.floorEdge));
      const diffH1 = (0.40 + aLvl * 0.325) *
        Math.max(0.72, Math.min(1.4, aeroStyle.diffuserRise));
      // THE DIFFUSER. This was one closed loft, and from directly behind — the
      // view a chase camera holds for most of a lap — it read as a featureless
      // grey slab the full width of the car with the brake light floating on it
      // (scratch/renders/car/rb4-diffuser.png). The diffuser is the most
      // recognisable thing about the back of an F1 car and none of it was there.
      //
      // Built as two tunnels either side of the crash structure: a ramped
      // ceiling, an outer wall, strakes, and a gurney across the trailing edge.
      // Every piece is a thin CLOSED solid rather than an open quad, so the
      // winding cannot come out inside-out on a surface you only ever see from
      // one side. Both knobs still drive it — floorEdge the width, diffuserRise
      // the ceiling — so the sweep's amplitude for them goes up, not down.
      const dHalf = 0.56 * diffW;                    // half-width at the exit
      const dThr  = 0.46 * diffW;                    // half-width at the throat
      const dKeel = 0.12;                            // crash structure half-width
      const dFloor = 0.105;
      const dRise = 0.30 * Math.max(0.72, Math.min(1.4, aeroStyle.diffuserRise));
      const yCE = dFloor + dRise, yCT = dFloor + 0.055 * diffH1 / 0.4;
      const DIFF_IN = [0.045, 0.045, 0.055];
      for (const s of [-1, 1]) {
        const cxE = s * (dKeel + dHalf) / 2, cxT = s * (dKeel + dThr) / 2;
        const wE = dHalf - dKeel, wT = dThr - dKeel;
        addLoft(out, -2.52, cxE, yCE, wE, 0.035, -1.95, cxT, yCT, wT, 0.035,
                DIFF_IN, SURFACES.carbon);                              // ramped ceiling
        addLoft(out, -2.52, s * dHalf, (dFloor + yCE) / 2, 0.030, yCE - dFloor,
                     -1.95, s * dThr,  (dFloor + yCT) / 2, 0.030, yCT - dFloor,
                CARBON, SURFACES.carbon);                               // outer wall
        addBox(out, cxE, dFloor, -2.235, wE, 0.028, 0.57, CARBON, SURFACES.carbon);
        for (let k = 0; k < 2; k++) {
          const f = 0.36 + k * 0.34;
          addLoft(out, -2.50, s * (dKeel + wE * f), (dFloor + yCE) / 2, 0.016, (yCE - dFloor) * 0.86,
                       -2.02, s * (dKeel + wT * f), (dFloor + yCT) / 2, 0.014, (yCT - dFloor) * 0.86,
                  DIFF_IN, SURFACES.carbon);                            // strake
        }
      }
      addLoft(out, -2.58, 0, 0.195, 2 * dKeel * 0.82, 0.15,
                   -1.95, 0, 0.170, 2 * dKeel * 1.10, 0.13, DARK, SURFACES.carbon);
      addBox(out, 0, yCE + 0.030, -2.525, 2 * dHalf, 0.030, 0.020, c2, SURFACES.paint);

      const gbStrakes = gbStyle ? gbStyle.strakes : (tier("gearbox") === 2 ? 5 : 0);
      const gbFin = gbStyle ? gbStyle.fin : (tier("gearbox") === 2 ? 1 : 0);
      const gbStrakeH = gbStyle && gbStyle.strakeH ? gbStyle.strakeH : 0.13;
      const gbCasing  = gbStyle ? (gbStyle.casing  || 0) : (tier("gearbox") === 2 ? 3 : 0);
      const gbLouvres = gbStyle ? (gbStyle.louvres || 0) : 0;
      const gbHeat    = gbStyle ? (gbStyle.heat    || 0) : 0;
      const gbFinSY   = gbStyle && gbStyle.finSY ? gbStyle.finSY : 0.14;
      const gbFinSZ   = gbStyle && gbStyle.finSZ ? gbStyle.finSZ : 0.28;
      const gbHeatFins = gbStyle ? Math.max(0, Math.min(5, Math.round(gbStyle.heatFins || 0))) : 0;
      const gbRibs     = gbStyle ? Math.max(0, Math.min(3, Math.round(gbStyle.ribs || 0))) : 0;
      const gbCaseWmul = Math.max(0.75, Math.min(1.35, (gbStyle && gbStyle.caseWidth) || 1));
      if (gbStrakes > 0) {
        const half = (gbStrakes - 1) / 2;
        for (let i = 0; i < gbStrakes; i++) {
          addBox(out, (i - half) * 0.24, 0.13 + gbStrakeH / 2, -2.20, 0.015, gbStrakeH, 0.42, CARBON);
        }
      }
      let gbCw = 0, gbCh = 0;
      if (gbCasing > 0) {
        gbCw = (0.15 + gbCasing * 0.05) * gbCaseWmul;
        gbCh = 0.13 + gbCasing * 0.03;
        addBox(out, 0, 0.44, -1.92, gbCw * 1.08, gbCh * 1.12, 0.04, CARBON, SURFACES.carbon);
        addSpan(out,
          { z: -1.94, y: 0.44, w: gbCw * 1.02, h: gbCh, t: 0.90 },
          { z: -2.12, y: 0.435, w: gbCw, h: gbCh * 0.96, t: 0.88 },
          CARBON, null, SURFACES.carbon);
        if (gbCasing >= 2) {
          addSpan(out,
            { z: -2.12, y: 0.42, w: gbCw * 0.92, h: gbCh * 0.82, t: 0.88 },
            { z: -2.26, y: 0.40, w: gbCw * 0.58, h: gbCh * 0.62, t: 0.85 },
            DARK, null, SURFACES.carbon);
        }
        if (gbCasing >= 3) {
          for (const s of [-1, 1]) {
            addBox(out, s * (gbCw * 0.5 + 0.012), 0.44, -2.04, 0.02, gbCh * 0.9, 0.22,
                   [0.09, 0.09, 0.10], SURFACES.carbon);
            addBox(out, s * (gbCw * 0.42), 0.32, -2.00, 0.04, 0.05, 0.10, DARK);
          }
        }
      }
      if (gbRibs > 0) {
        const ribW = gbCasing > 0 ? gbCw * 0.48 : 0.16;
        const ribH = gbCasing > 0 ? gbCh * 0.72 : 0.10;
        for (const s of [-1, 1]) for (let i = 0; i < gbRibs; i++) {
          addBox(out, s * ribW, 0.44, -1.96 - i * 0.07,
                 0.012, ribH, 0.04, CARBON, SURFACES.carbon);
        }
      }
      if (gbLouvres > 0) {
        const hx = gbCasing > 0 ? (gbCw * 0.5 + 0.018) : 0.135;
        for (const s of [-1, 1]) for (let i = 0; i < gbLouvres; i++) {
          const y = 0.52 - i * 0.038;
          addBox(out, s * hx, y, -2.02, 0.028, 0.012, 0.18, INTAKE);
          addBox(out, s * (hx + 0.012), y + 0.008, -2.00, 0.012, 0.008, 0.16, CARBON);
        }
      }
      if (gbHeat) {
        const hw = gbCasing > 0 ? Math.max(0.16, gbCw * 0.88) : 0.19;
        addBox(out, 0, 0.55, -2.06, hw, 0.014, 0.28, [0.30, 0.30, 0.34], SURFACES.metal);
      }
      if (gbHeatFins > 0) {
        const half = (gbHeatFins - 1) / 2;
        const span = gbCasing > 0 ? Math.max(0.12, gbCw * 0.70) : 0.14;
        const step = gbHeatFins > 1 ? span / (gbHeatFins - 1) : 0;
        for (let i = 0; i < gbHeatFins; i++) {
          addBox(out, (i - half) * step, 0.575, -2.06, 0.010, 0.045, 0.22,
                 [0.30, 0.30, 0.34], SURFACES.metal);
        }
      }
      if (gbFin) addBox(out, 0, 0.27 + gbFinSY / 2, -2.30, 0.02, gbFinSY, gbFinSZ, CARBON);
    }

    part("brakeDucts");
    const brakesT = tier("brakes");
    const ductMul = brakeStyle ? brakeStyle.duct : (brakesT === 0 ? 0.5 : brakesT === 2 ? 1.9 : 1.0);
    const brakeScoop = Math.max(0, Math.min(2, Math.round(
      brakeStyle && brakeStyle.scoop != null ? brakeStyle.scoop : (ductMul >= 1.3 ? 1 : 0))));
    for (const s of [-1, 1]) {
      addBox(out, s*0.60, 0.28, AXLES.frontZ + 0.19, 0.06, 0.20 * ductMul, 0.13 * ductMul, DARK);
      // Big-brake spec: a horizontal duct winglet scooping over each front wheel.
      if (brakeScoop >= 1) addBox(out, s*0.65, 0.42, AXLES.frontZ + 0.16, 0.11, 0.02, 0.15, CARBON);
      if (brakeScoop >= 1) {
        addBox(out, s*0.65, 0.355, AXLES.frontZ + 0.22, 0.08, 0.055, 0.04, INTAKE);
        addBox(out, s*0.65, 0.395, AXLES.frontZ + 0.245, 0.09, 0.012, 0.03, CARBON);
        addBox(out, s*0.65, 0.315, AXLES.frontZ + 0.245, 0.09, 0.012, 0.03, CARBON);
      }
      if (brakeScoop >= 2) {
        addBox(out, s*0.705, 0.38, AXLES.frontZ + 0.15, 0.014, 0.12, 0.17, CARBON);
        addBox(out, s*0.655, 0.20, AXLES.frontZ + 0.11, 0.10, 0.016, 0.20, CARBON);
        addBox(out, s*0.595, 0.32, AXLES.frontZ + 0.14, 0.014, 0.10, 0.16, CARBON);
      }
      if (!ckpt) addBox(out, s*0.58, 0.30, AXLES.rearZ - 0.20, 0.06, 0.18 * ductMul, 0.12 * ductMul, DARK);
      if (brakeScoop >= 1 && !ckpt) {
        addBox(out, s*0.58, 0.355, AXLES.rearZ - 0.275, 0.07, 0.040, 0.045, INTAKE);
        addBox(out, s*0.58, 0.385, AXLES.rearZ - 0.295, 0.08, 0.010, 0.028, CARBON);
      }
    }

    part("suspension");
    const wbMul = suspStyle ? suspStyle.arm : (suspT === 0 ? 0.85 : suspT === 2 ? 1.3 : 1.0);
    const wbPush = suspStyle ? suspStyle.push : (suspT === 2 ? 1 : 0);
    const wbPull = suspStyle && suspStyle.pull ? 1 : 0;
    const armTh = 0.026 * wbMul, suspC = [0.11, 0.11, 0.13];
    const rockerLvl = Math.max(0, Math.min(2, Math.round(suspStyle.rocker || 0)));
    const heaveOn = Math.max(0, Math.min(1, Math.round(suspStyle.heave || 0)));
    const fairArms = !!(wbPush || wbPull || rockerLvl || heaveOn);
    const drawArm = fairArms ? addFairedArm : addBeamBetween;
    // Inboard damper barrel + rocker link, the mechanism a real tub carries
    // under its blister. Gated on the existing `rocker` knob, so the default
    // car (rocker 0) is untouched and only fitted suspension gains hardware.
    function suspHardware(y, px) {
      for (const sd of [-1, 1]) {
        addBox(out, sd * px, y + 0.020, 1.02, 0.030, 0.030, 0.115,
               [0.30, 0.30, 0.34], SURFACES.metal);            // damper barrel
        addBox(out, sd * px, y + 0.020, 0.955, 0.022, 0.022, 0.028,
               [0.55, 0.52, 0.20], SURFACES.metal);            // spring collar
        addBeamBetween(out, [sd * px, y + 0.020, 1.08], [sd * (px + 0.055), y - 0.012, 1.13],
                       0.013, suspC, SURFACES.carbon);          // rocker link
      }
    }
    if (rockerLvl === 1) {
      for (const s of [-1, 1]) {
        addLoft(out, 0.88, s * 0.11, 0.545 + rideDY, 0.10, 0.036,
                1.12, s * 0.09, 0.530 + rideDY, 0.08, 0.028, CARBON);
      }
      addBeamBetween(out, [-0.10, 0.545 + rideDY, 0.98],
        [0.10, 0.545 + rideDY, 0.98], 0.016, suspC, SURFACES.carbon);
      suspHardware(0.545 + rideDY, 0.11);
    } else if (rockerLvl === 2) {
      addLoft(out, 0.72, 0, 0.555 + rideDY, 0.28, 0.050,
              1.18, 0, 0.515 + rideDY, 0.22, 0.038, CARBON);
      for (const s of [-1, 1]) {
        addBox(out, s * 0.075, 0.590 + rideDY, 0.94, 0.028, 0.055, 0.055,
               [0.24, 0.24, 0.27], SURFACES.metal);
        addBox(out, s * 0.12, 0.568 + rideDY, 0.96, 0.055, 0.012, 0.08,
               CARBON, SURFACES.carbon);
      }
      suspHardware(0.575 + rideDY, 0.075);
      if (!ckpt) {
        addLoft(out, -1.38, 0, 0.520 + rideDY, 0.18, 0.042,
                -1.14, 0, 0.500 + rideDY, 0.14, 0.032, CARBON);
      }
    }
    if (heaveOn) {
      const hy = 0.562 + rideDY, hz = 0.99;
      addBox(out, 0, hy, hz, 0.20, 0.030, 0.030,
             [0.26, 0.26, 0.29], SURFACES.metal);
      addBox(out, 0, hy + 0.020, hz - 0.038, 0.09, 0.024, 0.050,
             CARBON, SURFACES.carbon);
      for (const s of [-1, 1]) {
        const px = rockerLvl === 2 ? 0.075 : rockerLvl === 1 ? 0.11 : 0.18;
        const py = (rockerLvl === 2 ? 0.575 : rockerLvl === 1 ? 0.545 : 0.505) + rideDY;
        const pz = rockerLvl === 2 ? 0.94 : 0.98;
        addBeamBetween(out, [s * 0.09, hy, hz], [s * px, py, pz],
                       armTh * 0.5, suspC, SURFACES.carbon);
      }
    }
    const wishboneSpread = 0.20 * Math.max(0.72, Math.min(1.3, suspStyle.wishbone));
    const toeScale = Math.max(0.7, Math.min(1.35, suspStyle.toe));
    for (const s of [-1, 1]) {
      const fLower = [s*0.69, 0.27 + rideDY, AXLES.frontZ];
      const fUpper = [s*0.69, 0.43 + rideDY, AXLES.frontZ];
      const fLowZ = [AXLES.frontZ - wishboneSpread, AXLES.frontZ + wishboneSpread];
      for (const z of fLowZ) {
        drawArm(out, [s*0.31, 0.23 + rideDY, z], fLower, armTh, suspC, SURFACES.carbon);
        drawArm(out, [s*0.32, 0.44 + rideDY, z], fUpper, armTh, suspC, SURFACES.carbon);
      }
      if (fairArms) {
        addWishboneWeb(out, [s*0.31, 0.23 + rideDY, fLowZ[0]],
          [s*0.31, 0.23 + rideDY, fLowZ[1]], fLower, suspC, SURFACES.carbon);
        addWishboneWeb(out, [s*0.32, 0.44 + rideDY, fLowZ[0]],
          [s*0.32, 0.44 + rideDY, fLowZ[1]], fUpper, suspC, SURFACES.carbon);
      }
      drawArm(out, [s*0.33, 0.34 + rideDY, AXLES.frontZ - 0.16],
        [s*0.69, 0.35 + rideDY, AXLES.frontZ - 0.04*toeScale],
        armTh*0.72*toeScale, suspC, SURFACES.carbon);
      addBox(out, s*0.69, 0.35 + rideDY, AXLES.frontZ, 0.055, 0.23, 0.10,
        [0.18,0.18,0.20], SURFACES.metal);
      if (wbPush) {
        const outer = wbPull ? fUpper : fLower;
        const inner = wbPull ? [s*0.30,0.20+rideDY,AXLES.frontZ-0.05]
          : [s*0.30,0.51+rideDY,AXLES.frontZ-0.05];
        drawArm(out, outer, inner, armTh*0.82, suspC, SURFACES.carbon);
      }
      if (!ckpt) {
        const rLower = [s*0.67, 0.28 + rideDY, AXLES.rearZ];
        const rUpper = [s*0.67, 0.45 + rideDY, AXLES.rearZ];
        const rLowZ = [AXLES.rearZ - wishboneSpread*0.9, AXLES.rearZ + wishboneSpread*0.9];
        for (const z of rLowZ) {
          drawArm(out, [s*0.31, 0.25 + rideDY, z], rLower, armTh, suspC, SURFACES.carbon);
          drawArm(out, [s*0.32, 0.46 + rideDY, z], rUpper, armTh, suspC, SURFACES.carbon);
        }
        if (fairArms) {
          addWishboneWeb(out, [s*0.31, 0.25 + rideDY, rLowZ[0]],
            [s*0.31, 0.25 + rideDY, rLowZ[1]], rLower, suspC, SURFACES.carbon);
          addWishboneWeb(out, [s*0.32, 0.46 + rideDY, rLowZ[0]],
            [s*0.32, 0.46 + rideDY, rLowZ[1]], rUpper, suspC, SURFACES.carbon);
        }
        drawArm(out, [s*0.31, 0.36 + rideDY, AXLES.rearZ + 0.16],
          [s*0.67, 0.36 + rideDY, AXLES.rearZ + 0.04*toeScale],
          armTh*0.72*toeScale, suspC, SURFACES.carbon);
        addBox(out, s*0.67, 0.36 + rideDY, AXLES.rearZ, 0.055, 0.23, 0.10,
          [0.18,0.18,0.20], SURFACES.metal);
        if (wbPush) {
          const outer = wbPull ? rUpper : rLower;
          const inner = wbPull ? [s*0.29,0.22+rideDY,AXLES.rearZ+0.04]
            : [s*0.29,0.53+rideDY,AXLES.rearZ+0.04];
          drawArm(out, outer, inner, armTh*0.82, suspC, SURFACES.carbon);
        }
      }
    }

    part("wheels");
    if (!noWheels) {
      const tyreBand = tyreStyle && tyreStyle.band || TYRE_BAND[tier("tyres")];
      // Per-option caliper accent peeking through the rim spokes, else tier.
      const caliperColor = brakeStyle ? brakeStyle.cal : BRAKE_CALIPER[brakesT];
      const rimColor = brakeStyle && brakeStyle.rim;   // premium alloy rims (else default dark)
      for (const s of [-1, 1]) {
        addWheel(out, s*0.79, AXLES.wheelY, AXLES.frontZ, 0.34, 0.32,
          tyreBand, caliperColor, rimColor, false, tyreStyle, null, brakeStyle, wheelStyle);
        addWheel(out, s*0.76, AXLES.wheelY, AXLES.rearZ, 0.34, 0.38,
          tyreBand, caliperColor, rimColor, false, tyreStyle, null, brakeStyle, wheelStyle);
      }
      // 2026 over-wheel deflector above each FRONT wheel (tyre crown y 0.68):
      // 0 none / 1 single plane on a stalk / 2 biplane + outboard endplate.
      const wDefl = Math.max(0, Math.min(2, Math.round((wheelStyle && wheelStyle.deflector) || 0)));
      if (wDefl > 0) {
        for (const s of [-1, 1]) {
          addBeveledSpan(out,
            { z: AXLES.frontZ + 0.20, x: s * 0.79, y: 0.745, w: 0.30, h: 0.012, t: 0.70 },
            { z: AXLES.frontZ - 0.16, x: s * 0.77, y: 0.775, w: 0.26, h: 0.010, t: 0.70 },
            0.004, CARBON, null, SURFACES.carbon);
          addBeamBetween(out, [s * 0.66, 0.46, AXLES.frontZ + 0.17],
                              [s * 0.72, 0.740, AXLES.frontZ + 0.16], 0.016,
                         [0.11, 0.11, 0.13], SURFACES.carbon);
          if (wDefl >= 2) {
            addBeveledSpan(out,
              { z: AXLES.frontZ + 0.14, x: s * 0.80, y: 0.805, w: 0.24, h: 0.010, t: 0.70 },
              { z: AXLES.frontZ - 0.12, x: s * 0.78, y: 0.828, w: 0.20, h: 0.009, t: 0.70 },
              0.004, CARBON, null, SURFACES.carbon);
            addBox(out, s * 0.935, 0.775, AXLES.frontZ + 0.02, 0.012, 0.085, 0.30,
                   CARBON, SURFACES.carbon);
          }
        }
      }
    }

    const finishSurface = FINISH_SURFACE[liv.finish];
    if (finishSurface) {
      for (let i = 0; i < out.mat.length; i++) {
        if (out.mat[i] === SURFACES.paint) out.mat[i] = finishSurface;
      }
    }

    // Close the last section and measure each from the vertices it emitted.
    if (sections.length) sections[sections.length - 1].to = out.pos.length / 3;
    if (opts && opts.measure) out.parts = sections.filter((sec) => sec.to > sec.from).map((sec) => {
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

  function buildComplete(color, color2, opts) {
    const out = build(color, color2, opts);
    const info = out.flapInfo;
    if (!info) return out;
    for (const el of aeroFlapsGeom(info.aLvl, info.style)) {
      // The livery finish rides flapInfo: build()'s own paint->finish remap
      // runs before these flaps are appended, so without it a satin/chrome
      // car got gloss top flaps from this path.
      const g = buildFlapGeom(el, info.col, info.finish);
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
