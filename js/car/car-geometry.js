/* Apex 26 — shared car mesh primitives and foil surfaces; create receives the owner’s surface and palette identities. */
"use strict";

const CarGeometry = (function () {
  function create(context) {
    const { SURFACES, CARBON, DARK, INTAKE, TYRE, RIM, HUB, HALO, VISOR, PANEL } = context;

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
      const paint = material === SURFACES.paint;
      const r = paint ? Math.min(col[0], 1) : col[0], g = paint ? Math.min(col[1], 1) : col[1],
            bl = paint ? Math.min(col[2], 1) : col[2];
      // Unrolled, no per-triangle arrays: a third of Car3D.build's time (33% self,
      // ~19k verts, paid on every garage part pick). Same numbers, same order.
      out.pos.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
      out.nrm.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
      out.col.push(r, g, bl, r, g, bl, r, g, bl);
      out.mat.push(material, material, material);
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

    // Any n-corner section (a chined pod has five), front to rear, capped: CarShade.loftRings'
    // faces and winding (CCW from +Z, fixed by signed area so either side's mirror lofts outward).
    function addSectionLoft(out, secs, col, frontCol, surface, frontSurface) {
      const area = (r) => r.reduce((a, p, i) => { const q = r[(i + 1) % r.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0);
      const rings = secs.map((r) => (area(r) < 0 ? r.slice().reverse() : r)), n = rings[0].length;
      for (let r = 0; r < rings.length - 1; r++) {
        const F = rings[r], R = rings[r + 1];
        for (let i = 0; i < n; i++) {
          const j = (i + 1) % n;
          addTri(out, F[i], R[i], R[j], col, surface);
          addTri(out, F[i], R[j], F[j], col, surface);
        }
      }
      const cap = (ring, c, sf, flip) => {
        const m = [0, 1, 2].map((k) => ring.reduce((a, p) => a + p[k], 0) / n);
        for (let i = 0; i < n; i++) { const j = (i + 1) % n; if (flip) addTri(out, m, ring[j], ring[i], c, sf); else addTri(out, m, ring[i], ring[j], c, sf); }
      };
      cap(rings[0], frontCol || col, frontSurface || surface, false);
      cap(rings[rings.length - 1], col, surface, true);
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
    // The foil SURFACE at spanwise x and chordwise t. Hoisted out of addWingFoil so
    // the sponsor band lands on the surface the mesh is built from; `edge` is why
    // it must: the tip's leading edge is `sweep` metres aft of the centre's, ~17 mm
    // of height across the span at the posed attitude.
    function foilAt(spec, x, t) {
      const half = spec.half, inner = half * 0.34;
      const sweep = spec.sweep || 0, taper = spec.taper == null ? 1 : spec.taper;
      const rise = spec.rise || 0, thick = spec.thick;
      const dz = spec.zLead - spec.zTrail, dy = spec.yTrail - spec.yLead;
      const chord = Math.hypot(dz, dy);
      const camber = (spec.camber == null ? FOIL_CAMBER : spec.camber) * chord;
      const edge = Math.max(0, (Math.abs(x) - inner) / Math.max(half - inner, 1e-6));
      const atTip = Math.abs(Math.abs(x) - half) < 1e-6;
      const attachedX = atTip && spec.attachHalf != null
        ? Math.sign(x || 1) * spec.attachHalf
        : null;
      const xF = attachedX != null ? attachedX : x;
      const xR = attachedX != null ? attachedX : x * taper;
      // rise2 / riseStep (opt-in aero shapes, absent = 0): a quadratic tip
      // curl and a step that completes by mid-span (edge 0.5).
      const lift = rise * edge + (spec.rise2 || 0) * edge * edge
        + (spec.riseStep || 0) * Math.min(1, edge * 2);
      let yF = spec.yLead + lift, yR = spec.yTrail + lift;
      let zF = spec.zLead - sweep * edge, zR = spec.zTrail - sweep * edge;
      // teCurve: pull the TE toward the LE at the tip (quadratic) so the
      // trailing edge is an arc, not a straight plank. chordTaper shortens
      // the tip chord. twist adds a few degrees of outboard incidence.
      if (spec.teCurve) zR += spec.teCurve * edge * edge;
      // B·D3c: a lifted tip moves forward whole, so the cascade's slots keep their shape.
      if (spec.tePull) { zF += spec.tePull * edge; zR += spec.tePull * edge; }
      const ct = 1 - Math.max(0, spec.chordTaper || 0) * edge;
      if (ct < 1) { zR = zF + (zR - zF) * ct; yR = yF + (yR - yF) * ct; }
      const tw = (spec.twist || 0) * edge;
      if (tw) {
        // +Z forward, TE aft (dzc < 0). Positive twist is more outboard
        // incidence: rotate the TE up (+Y), not down toward the main plane.
        const dzc = zR - zF, dyc = yR - yF, c = Math.cos(tw), s = Math.sin(tw);
        zR = zF + dzc * c + dyc * s;
        yR = yF - dzc * s + dyc * c;
      }
      const u = Math.min(1, Math.abs(x) / half);
      const contour = (spec.wave || 0) * Math.pow(Math.sin(Math.PI * u), 2)
        - (spec.bowl || 0) * (1 - u * u);
      return {
        x: xF + (xR - xF) * t,
        y: yF + (yR - yF) * t - camber * 4 * t * (1 - t) + contour,
        z: zF + (zR - zF) * t,
        h: thick * 0.5 * foilThick(t),
      };
    }
    function addWingFoil(out, spec, col, surface) {
      const half = spec.half, mid = half * 0.67, inner = half * 0.34;
      const at = (x, t) => foilAt(spec, x, t);
      const segments = spec.wave || spec.bowl ? Array.from({ length: 6 }, (_, i) =>
        [-half + 2 * half * i / 6, -half + 2 * half * (i + 1) / 6])
        : [[-half, -mid], [-mid, -inner], [-inner, inner], [inner, mid], [mid, half]];
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
      if (stations[0].length !== 4) return addSectionLoft(out, stations, col, frontCol, surface, frontSurface);
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
      // u already carries the half-thickness; crossing with unit d preserves it.
      const vx = dy*uz-dz*uy;
      const vy = dz*ux-dx*uz;
      const vz = dx*uy-dy*ux;
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

    // Smooth swept tube (the halo hoop): shared ring verts + radial normals — the
    // shared-ring pattern along an arbitrary polyline. The ring "up" vector carries
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

    return { addTri, addQuad, addLoft, addBox, addBlock, addSpan, foilThick, FOIL_CAMBER,
      foilAt, addWingFoil, addStationLoft, addTopBevel, addBeveledSpan, addBeamBetween,
      addFairedArm, addWishboneWeb, addTube };
  }

  // WELD: merge vertices that are identical in every attribute the GPU reads
  // (position, normal, colour, surface id, compared as the Float32 the upload
  // stores), remapping idx. addTri/addQuad emit unshared corners, so about half
  // of a car's vertices are exact repeats; welding them halves the vertex count
  // with a bit-identical picture. Vertex ranges (sections, zones) do not survive,
  // so callers that read them (measure, refinish) skip it. Returns out.
  const _f = new Float32Array(10), _u = new Uint32Array(_f.buffer);
  function weld(out) {
    const n = out.pos.length / 3;
    if (!n || out.nrm.length !== n * 3 || out.col.length !== n * 3 || (out.mat && out.mat.length !== n)) return out;
    let cap = 1; while (cap < n * 2) cap <<= 1;
    const table = new Int32Array(cap).fill(-1), keys = new Uint32Array(n * 10), remap = new Int32Array(n);
    const pos = [], nrm = [], col = [], mat = out.mat ? [] : null;
    let m = 0;
    for (let i = 0; i < n; i++) {
      _f[0] = out.pos[i*3]; _f[1] = out.pos[i*3+1]; _f[2] = out.pos[i*3+2];
      _f[3] = out.nrm[i*3]; _f[4] = out.nrm[i*3+1]; _f[5] = out.nrm[i*3+2];
      _f[6] = out.col[i*3]; _f[7] = out.col[i*3+1]; _f[8] = out.col[i*3+2]; _f[9] = mat ? out.mat[i] : 0;
      let h = 2166136261;
      for (let k = 0; k < 10; k++) h = Math.imul(h ^ _u[k], 16777619);
      let slot = (h >>> 0) & (cap - 1), hit = -1;
      for (;;) {
        const j = table[slot];
        if (j < 0) break;
        let same = true;
        for (let k = 0; k < 10; k++) if (keys[j*10+k] !== _u[k]) { same = false; break; }
        if (same) { hit = j; break; }
        slot = (slot + 1) & (cap - 1);
      }
      if (hit < 0) {
        hit = m++; table[slot] = hit;
        for (let k = 0; k < 10; k++) keys[hit*10+k] = _u[k];
        pos.push(out.pos[i*3], out.pos[i*3+1], out.pos[i*3+2]);
        nrm.push(out.nrm[i*3], out.nrm[i*3+1], out.nrm[i*3+2]);
        col.push(out.col[i*3], out.col[i*3+1], out.col[i*3+2]);
        if (mat) mat.push(out.mat[i]);
      }
      remap[i] = hit;
    }
    const idx = out.idx;
    for (let t = 0; t < idx.length; t++) idx[t] = remap[idx[t]];
    out.pos = pos; out.nrm = nrm; out.col = col; if (mat) out.mat = mat;
    return out;
  }

  // DECIMATE: vertex clustering for a body seen from far away (a rival past ~250 m is 1-3 px tall, so only its
  // silhouette reads). Vertices fall into the cells of a cubic grid; a cell becomes one vertex (mean position,
  // mean normal renormalised, mean colour, the first surface id); triangles that collapse onto <3 cells or repeat
  // another are dropped. The cell size is searched so the result lands at or under `target` triangles, taking the
  // finest grid that fits. Deterministic (no randomness, insertion-ordered cells). Returns a NEW out
  // ({pos, nrm, col, idx[, mat]}), leaving the input alone.
  function decimate(out, target) {
    const n = out.pos.length / 3, tris = out.idx.length / 3;
    if (!n || tris <= target) return out;
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (let i = 0; i < n; i++) {
      const x = out.pos[i*3], y = out.pos[i*3+1], z = out.pos[i*3+2];
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z;
    }
    const ext = Math.max(x1 - x0, y1 - y0, z1 - z0) || 1;
    const run = (cell) => {
      const cellOf = new Map(), remap = new Int32Array(n), acc = [];
      for (let i = 0; i < n; i++) {
        const cx = Math.floor((out.pos[i*3] - x0) / cell), cy = Math.floor((out.pos[i*3+1] - y0) / cell), cz = Math.floor((out.pos[i*3+2] - z0) / cell);
        const k = (cx * 4096 + cy) * 4096 + cz;
        let a = cellOf.get(k);
        if (a === undefined) { a = acc.length; cellOf.set(k, a); acc.push({ n: 0, p: [0, 0, 0], q: [0, 0, 0], c: [0, 0, 0], m: out.mat ? out.mat[i] : 0 }); }
        const s = acc[a]; s.n++;
        for (let d = 0; d < 3; d++) { s.p[d] += out.pos[i*3+d]; s.q[d] += out.nrm[i*3+d]; s.c[d] += out.col[i*3+d]; }
        remap[i] = a;
      }
      const seen = new Set(), idx = [];
      for (let t = 0; t < tris; t++) {
        const a = remap[out.idx[t*3]], b = remap[out.idx[t*3+1]], c = remap[out.idx[t*3+2]];
        if (a === b || b === c || a === c) continue;
        const lo = Math.min(a, b, c), hi = Math.max(a, b, c), key = lo + "," + (a + b + c - lo - hi) + "," + hi;
        if (seen.has(key)) continue;
        seen.add(key); idx.push(a, b, c);
      }
      return { acc, idx };
    };
    let lo = ext / 4096, hi = ext, best = run(hi);
    for (let it = 0; it < 14; it++) {
      const mid = (lo + hi) / 2, r = run(mid);
      if (r.idx.length / 3 <= target) { best = r; hi = mid; } else lo = mid;
    }
    const res = { pos: [], nrm: [], col: [], idx: best.idx };
    if (out.mat) res.mat = [];
    for (const s of best.acc) {
      res.pos.push(s.p[0] / s.n, s.p[1] / s.n, s.p[2] / s.n);
      const l = Math.hypot(s.q[0], s.q[1], s.q[2]);
      if (l > 1e-6) res.nrm.push(s.q[0] / l, s.q[1] / l, s.q[2] / l); else res.nrm.push(0, 1, 0);   // opposed normals cancelled: face up
      res.col.push(s.c[0] / s.n, s.c[1] / s.n, s.c[2] / s.n);
      if (out.mat) res.mat.push(s.m);
    }
    return res;
  }

  // SHARED RIVAL LOD. One mesh is instanced for every rival past FieldLod's
  // no-decal distance (car-draw sharedRivalBodyMesh; TLX coalesces it). On
  // Teams.LIST[0] factory parts with smooth off that mesh was 6148 tris,
  // 12857 verts and six surface ids, carbon the majority. Clustering to
  // SHARED_BODY_TRIS keeps the box within 3% and a 48 px silhouette (Jaccard
  // 0.987 side / 0.985 front / 0.996 top, measured 2026-10-27) and drops the
  // vertex buffer to about 2700. Paint only: at that range the carbon weave
  // and the metal env boost are past their fade, and one surface keeps the
  // instanced fragment on the paint path (three.js draws one material per
  // instanced batch). The 250 m step still decimates this result to 1500.
  // Collapses mats on `out` and replaces its arrays in place (callers keep
  // the same object, including the silhouette release flag). Returns `out`.
  const SHARED_BODY_TRIS = 4500;
  const SHARED_PAINT = 20;   // CarMaterials.SURFACES.paint — this file loads first
  function presentShared(out) {
    if (!out || !out.idx || !out.mat) return out;
    for (let i = 0; i < out.mat.length; i++) out.mat[i] = SHARED_PAINT;
    const d = decimate(out, SHARED_BODY_TRIS);
    if (d !== out) { out.pos = d.pos; out.nrm = d.nrm; out.col = d.col; out.idx = d.idx; out.mat = d.mat; }
    return out;
  }

  return { create, weld, decimate, presentShared, SHARED_BODY_TRIS, SHARED_PAINT };
})();
Object.freeze(CarGeometry);
