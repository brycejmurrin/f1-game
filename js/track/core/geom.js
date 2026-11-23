/* Apex 26 — pure 3D geometry emitters shared by the track/scenery builders (js/track/tracks.js). Each add*(out, ...) pushes positions/normals/colours/indices into… */
const TrackGeom = (function () {
  "use strict";

  const __M = Math, __isFinite = Number.isFinite;

  const MAT = { FLAT: 0, CONCRETE: 1, BRICK: 2, GLASS: 3, METAL: 4, WOOD: 5,
                FOLIAGE: 6, FABRIC: 7, SAND: 8, GRASS: 9, ROCK: 10, SNOW: 11,
                ROOF: 12, STONE: 13, RUST: 14,
                FLAG: 15,
                // ASPHALT (16): the racing surface. Must stay ABOVE the flag's
                // 15.0..16.0 fractional window (the vertex shader keys the cloth
                // wave off that range). Deliberately the most restrained material
                // in the table — tarmac is nearly flat, and the road is the one
                // surface viewed at a grazing angle at 80 m/s, so anything with
                // real relief crawls. See applyMaterial()/matBumpHeight() in
                // js/render/glx/shaders/glsl-lit.js.
                ASPHALT: 16 };
  // WIND-SWAY WEIGHT. A FOLIAGE vertex may carry a per-vertex weight in the
  // FRACTION of its material id — FOLIAGE + w * SWAY_FRAC, w in [0,1] — exactly
  // as a FLAG vertex carries its cloth-wave weight (structures.js). The lit
  // vertex shaders (GLX LIT_VS, TLX tsl-lit.js vertexMotionNode) read it back
  // as fract(mat) / SWAY_FRAC and bend the crown downwind by it; the trunk base
  // (w = 0) stays planted. SWAY_FRAC < 0.5 because every fragment-side material
  // test ROUNDS the id (int(mat + 0.5)), so 6.45 is still FOLIAGE. The half-float
  // `mat` attribute on TLX resolves 1/256 at this magnitude — 115 weight steps.
  // Emitters opt in through out._matAt (see emit()); a bare FOLIAGE (hedge,
  // bush, mountain tree-zone) has fraction 0 and never moves.
  const SWAY_FRAC = 0.45;
  // Per-vertex material callback for one emitter: base point + unit up vector
  // of the plant, and the heights (along up) where the weight is 0 and 1.
  function swayMatAt(id, base, up, y0, y1) {
    const inv = 1 / Math.max(1e-6, y1 - y0);
    return (x, y, z) => {
      const hv = (x - base[0]) * up[0] + (y - base[1]) * up[1] + (z - base[2]) * up[2];
      const w = (hv - y0) * inv;
      return id + (w <= 0 ? 0 : w >= 1 ? 1 : w) * SWAY_FRAC;
    };
  }

  // CROWN ROUNDING (2026-10-01). Every primitive carries flat per-face normals,
  // so a tree crown — a stack of 7-9-facet cones — lights as a faceted lantern.
  // This blends the normals of the vertices emitted since v0 toward the radial
  // direction from the crown's AXIS (base, up) at each vertex's own height, by
  // k (0 = untouched, 1 = fully radial); a cone's upward tilt survives the
  // blend, so tiers still read as tiers but the facets no longer do. Positions,
  // indices, colours and material ids are untouched (vertex and triangle counts
  // are pinned; hidden-faces reads mat and position only). Called by the
  // emitters' swayOff() and by the graph's replay/bake for a swaying op.
  const ROUND_K = 0.6;
  // KNOWN GAP (perf hunt 2 T2, 2026-10-13): the fused props are written into
  // TrackModels.scratch() accumulators, which have no index access (storage
  // is `._data`), so for every FUSED crown this never applied: pos[i] read
  // undefined and nrm[i] = NaN landed as integer-keyed own properties on the
  // accumulator object — a no-op that cost 13 % of monza's props phase. Only
  // plain-array stages and the graph's instanced bakes are rounded. The early
  // return keeps that geometry byte-for-byte; making the fused crowns round
  // too (read `_data`) is a LOOK change on ~40 circuits, decided separately.
  function roundNormals(out, v0, base, up, k) {
    const pos = out.pos, nrm = out.nrm;
    if (!Array.isArray(pos) && !ArrayBuffer.isView(pos)) return;
    const n = pos.length / 3;
    const kk = k == null ? ROUND_K : k;
    if (kk <= 0) return;
    for (let i = v0; i < n; i++) {
      const px = pos[i * 3] - base[0], py = pos[i * 3 + 1] - base[1], pz = pos[i * 3 + 2] - base[2];
      const h = px * up[0] + py * up[1] + pz * up[2];
      let rx = px - up[0] * h, ry = py - up[1] * h, rz = pz - up[2] * h;
      const rl = Math.hypot(rx, ry, rz);
      if (rl < 1e-4) continue;                   // on the axis (an apex): keep the face normal
      rx /= rl; ry /= rl; rz /= rl;
      let nx = nrm[i * 3] * (1 - kk) + rx * kk, ny = nrm[i * 3 + 1] * (1 - kk) + ry * kk, nz = nrm[i * 3 + 2] * (1 - kk) + rz * kk;
      const nl = Math.hypot(nx, ny, nz) || 1;
      nrm[i * 3] = nx / nl; nrm[i * 3 + 1] = ny / nl; nrm[i * 3 + 2] = nz / nl;
    }
  }

  function cross(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }
  function norm(a) {
    const l = __M.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  }

  /* The six faces as DATA, hoisted out of addBox. Each row is four corner
     sign-triples followed by (axis, sign) naming the outward normal:
     axis 0 = r, 1 = u, 2 = f. Same faces, same order, same winding as the
     literal table this replaces — it was rebuilt per call, ~33 fresh arrays
     every time, and addBox is the hottest emitter in the build (85,130 calls
     on vegas, 78% of its prop vertices). Int8Array because every entry is
     -1/0/1/2 and a typed read avoids the boxed-element check.

     MEASURED, whole build, min of 5, and verified bit-identical first — the
     props buffers of monza/vegas/monaco hash the same as the previous
     checkout, pos/nrm/col/idx/mat:
       vegas 4211 -> 4059 ms (3.6%)   monza 1911 -> 1874 (1.9%)
       silverstone 2378 -> 2349 (1.2%)
     Modest. Reported to be larger; it is not, at least in the VM harness.
     Kept because it is free at the call site and the table reads better as
     data than as a literal rebuilt 85,130 times, not because it is a big win. */
  const BOX_FACES = new Int8Array([
    -1, 1, 1,  -1, -1, 1,   1, -1, 1,   1, 1, 1,   2,  1,   // +f
     1, 1, -1,  1, -1, -1, -1, -1, -1, -1, 1, -1,  2, -1,   // -f
     1, 1, 1,   1, -1, 1,   1, -1, -1,  1, 1, -1,  0,  1,   // +r
    -1, 1, -1, -1, -1, -1, -1, -1, 1,  -1, 1, 1,   0, -1,   // -r
    -1, 1, -1, -1, 1, 1,    1, 1, 1,    1, 1, -1,  1,  1,   // +u
    -1, -1, 1, -1, -1, -1,  1, -1, -1,  1, -1, 1,  1, -1,   // -u
  ]);
  const BOX_STRIDE = 14;

  // oriented box; basis optional [right,up,fwd]
  function addBox(out, c, sz, col, basis) {
    const r = basis ? basis[0] : [1, 0, 0], u = basis ? basis[1] : [0, 1, 0], f = basis ? basis[2] : [0, 0, 1];
    const hx = sz[0] / 2, hy = sz[1] / 2, hz = sz[2] / 2;
    const rx = r[0] * hx, ry = r[1] * hx, rz = r[2] * hx;
    const ux = u[0] * hy, uy = u[1] * hy, uz = u[2] * hy;
    const fx = f[0] * hz, fy = f[1] * hz, fz = f[2] * hz;
    const c0 = c[0], c1 = c[1], c2 = c[2];
    // The face table above is wound CCW-outward for a RIGHT-handed [r,u,f] basis
    // (the default axes give r×u = +f). But callers on the track frame pass
    // r = cross(t,up), u = cross(r,t) — a LEFT-handed basis (r×u = -t) — so every
    // face there winds backward: GL back-face culling then drops the OUTWARD face
    // and keeps the interior one, and the whole box renders SEE-THROUGH (you see
    // the textured inside of the far wall — the "translucent buildings" bug on
    // Madrid/Monaco/every day-lit city facade, which are all addBox masses on the
    // track basis). Detect the basis handedness and reverse the triangle order
    // when it's left-handed so the outward face always survives culling. Face
    // NORMALS (nv) are the true outward world directions either way, so only the
    // winding flips. (addCyl/addCone/etc. avoid this via emit()'s ref-based
    // auto-orient; addBox is the only fixed-winding primitive.)
    const cr = cross(r, u);
    const flip = (cr[0] * f[0] + cr[1] * f[1] + cr[2] * f[2]) < 0;
    const m = out._mat || 0, mm = out.mat, mAt = out._matAt || null;
    const col0 = col[0], col1 = col[1], col2 = col[2];
    const pos = out.pos, nrm = out.nrm, cols = out.col, idx = out.idx;
    for (let fi = 0; fi < 6; fi++) {
      const o = fi * BOX_STRIDE;
      const base = pos.length / 3;
      const ax = BOX_FACES[o + 12], sg = BOX_FACES[o + 13];
      const bv = ax === 0 ? r : ax === 1 ? u : f;
      const nx = bv[0] * sg, ny = bv[1] * sg, nz = bv[2] * sg;
      for (let i = 0; i < 4; i++) {
        const s = o + i * 3;
        const sx = BOX_FACES[s], sy = BOX_FACES[s + 1], sz2 = BOX_FACES[s + 2];
        const px = c0 + rx * sx + ux * sy + fx * sz2,
              py = c1 + ry * sx + uy * sy + fy * sz2,
              pz = c2 + rz * sx + uz * sy + fz * sz2;
        pos.push(px, py, pz);
        nrm.push(nx, ny, nz);
        cols.push(col0, col1, col2);
        if (mm) mm.push(mAt ? mAt(px, py, pz) : m);
      }
      if (flip) idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
      else idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }

  // Emit one flat convex polygon (3+ coplanar verts in perimeter order), fan-
  // triangulated, auto-oriented so its face points AWAY from `ref` (an interior
  // point) — so callers never have to reason about CCW winding under backface
  // culling. Normal is the face normal (flat shading, matches the box look).
  function emit(out, verts, col, ref) {
    for (let i = 0; i < verts.length; i++) {
      const v = verts[i];
      if (!v || !__isFinite(v[0]) || !__isFinite(v[1]) || !__isFinite(v[2])) return false;
    }
    const a = verts[0], b = verts[1], c = verts[2];
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = __M.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    let reverse = false;
    if (ref) {
      let fx = 0, fy = 0, fz = 0;
      for (const v of verts) { fx += v[0]; fy += v[1]; fz += v[2]; }
      fx = fx / verts.length - ref[0]; fy = fy / verts.length - ref[1]; fz = fz / verts.length - ref[2];
      if (nx * fx + ny * fy + nz * fz < 0) { reverse = true; nx = -nx; ny = -ny; nz = -nz; }
    }
    const base = out.pos.length / 3;
    // out._matAt (optional): a per-vertex material callback (x, y, z) -> id,
    // the wind-sway weight path (swayMatAt). out._mat stays the primitive's id
    // for every CPU reader (float-audit / clip-audit record out._mat per op).
    const m = out._mat || 0, mm = out.mat, mAt = out._matAt || null;
    for (let i = 0; i < verts.length; i++) {
      const v = verts[reverse ? verts.length - 1 - i : i];
      out.pos.push(v[0], v[1], v[2]); out.nrm.push(nx, ny, nz); out.col.push(col[0], col[1], col[2]);
      if (mm) mm.push(mAt ? mAt(v[0], v[1], v[2]) : m);
    }
    for (let i = 1; i < verts.length - 1; i++) out.idx.push(base, base + i, base + i + 1);
  }
  const vadd = (p, v, s) => [p[0] + v[0] * s, p[1] + v[1] * s, p[2] + v[2] * s];

  function addPrism(out, c, sz, col, basis) {
    const r = basis ? basis[0] : [1, 0, 0], u = basis ? basis[1] : [0, 1, 0], f = basis ? basis[2] : [0, 0, 1];
    const hx = sz[0] / 2, hl = sz[2] / 2, h = sz[1], ref = vadd(c, u, h * 0.4);
    const b0 = vadd(vadd(c, r, -hx), f, -hl), b1 = vadd(vadd(c, r, hx), f, -hl);
    const b2 = vadd(vadd(c, r, hx), f, hl), b3 = vadd(vadd(c, r, -hx), f, hl);
    const p0 = vadd(vadd(c, u, h), f, -hl), p1 = vadd(vadd(c, u, h), f, hl);
    emit(out, [b0, b1, p0], col, ref); emit(out, [b3, b2, p1], col, ref);  // gables
    emit(out, [b1, b2, p1, p0], col, ref); emit(out, [b0, p0, p1, b3], col, ref);  // slopes
  }

  // Pyramid: base sz[0]×sz[2] up to a single apex at height sz[1]. Peaks, spires.
  function addPyramid(out, c, sz, col, basis) {
    const r = basis ? basis[0] : [1, 0, 0], u = basis ? basis[1] : [0, 1, 0], f = basis ? basis[2] : [0, 0, 1];
    const hx = sz[0] / 2, hl = sz[2] / 2, ref = vadd(c, u, sz[1] * 0.35);
    const b0 = vadd(vadd(c, r, -hx), f, -hl), b1 = vadd(vadd(c, r, hx), f, -hl);
    const b2 = vadd(vadd(c, r, hx), f, hl), b3 = vadd(vadd(c, r, -hx), f, hl);
    const ap = vadd(c, u, sz[1]);
    emit(out, [b0, b1, ap], col, ref); emit(out, [b1, b2, ap], col, ref);
    emit(out, [b2, b3, ap], col, ref); emit(out, [b3, b0, ap], col, ref);
  }

  // Cone: n-gon base radius `rad` up to an apex at `h`. Conifers, spires, towers.
  function addCone(out, c, rad, h, col, seg, basis) {
    seg = seg || 8;
    const r = basis ? basis[0] : [1, 0, 0], u = basis ? basis[1] : [0, 1, 0], f = basis ? basis[2] : [0, 0, 1];
    const ap = vadd(c, u, h), ref = vadd(c, u, h * 0.35);
    const ring = (a) => vadd(vadd(c, r, __M.cos(a) * rad), f, __M.sin(a) * rad);
    let p0 = ring(0);
    for (let i = 0; i < seg; i++) {
      const p1 = ring((i + 1) / seg * 6.2832);
      emit(out, [p0, p1, ap], col, ref);
      p0 = p1;
    }
  }

  // Cylinder: n-gon column radius `rad`, height `h` (+ top cap). Trunks, towers.
  function addCyl(out, c, rad, h, col, seg, basis) {
    seg = seg || 8;
    const r = basis ? basis[0] : [1, 0, 0], u = basis ? basis[1] : [0, 1, 0], f = basis ? basis[2] : [0, 0, 1];
    const ref = vadd(c, u, h * 0.5), top = vadd(c, u, h);
    const lo = (a) => vadd(vadd(c, r, __M.cos(a) * rad), f, __M.sin(a) * rad);
    let p0 = lo(0), q0 = vadd(p0, u, h);
    for (let i = 0; i < seg; i++) {
      const p1 = lo((i + 1) / seg * 6.2832), q1 = vadd(p1, u, h);
      emit(out, [p0, p1, q1, q0], col, ref);
      emit(out, [q0, q1, top], col, ref);
      p0 = p1; q0 = q1;
    }
  }

  function addFrustum(out, c, rBase, rTop, h, col, seg, basis) {
    seg = seg || 8;
    const r = basis ? basis[0] : [1, 0, 0], u = basis ? basis[1] : [0, 1, 0], f = basis ? basis[2] : [0, 0, 1];
    const ref = vadd(c, u, h * 0.5), top = vadd(c, u, h);
    const at = (base, radius, cos, sin) => vadd(vadd(base, r, cos * radius), f, sin * radius);
    let p0 = at(c, rBase, 1, 0), q0 = at(top, rTop, 1, 0);
    for (let i = 0; i < seg; i++) {
      const angle = (i + 1) / seg * 6.2832, cos = __M.cos(angle), sin = __M.sin(angle);
      const p1 = at(c, rBase, cos, sin), q1 = at(top, rTop, cos, sin);
      emit(out, [p0, p1, q1, q0], col, ref);
      p0 = p1; q0 = q1;
    }
  }

  function addMountain(out, c, baseR, h, opts) {
    opts = opts || {};
    const seg = opts.seg || 10, seed = opts.seed || 0, rough = opts.rough != null ? opts.rough : 0.34;
    const forest = opts.forest || [0.22, 0.38, 0.22];
    const rock = opts.rock || [0.40, 0.38, 0.36];
    const snow = opts.snow || [0.93, 0.95, 0.99];
    const snowline = opts.snowline != null ? opts.snowline : 0.62;
    const lowMat = opts.lowMat != null ? opts.lowMat : MAT.FOLIAGE;        // material of the lower 34%; pass MAT.SAND for dunes
    const rx = opts.right || [1, 0, 0], fz = opts.fwd || [0, 0, 1];
    const h2 = (a, b) => { const x = __M.sin(a * 12.9898 + b * 78.233 + seed * 0.137) * 43758.5453; return x - __M.floor(x); };
    const ridgeOff = [];
    for (let i = 0; i < seg; i++) ridgeOff.push(h2(i, 7) - 0.5);            // shared down each ridge
    // opts.profile (default "cone" = the original 3 rings, byte-identical): "massif" is a 5-ring
    // convex-then-concave shoulder (broad base, steep flanks, blunt crest) that reads as a hill, not
    // a cone. opts.stretch (default 1) elongates along `fwd` (ridge lines); opts.crest (0..1, default 0)
    // blunts the summit by lifting the last ring's radius.
    const PROFILES = {
      cone: [[0, 1], [0.38, 0.64], [0.70, 0.34]],
      massif: [[0, 1], [0.16, 0.86], [0.38, 0.68], [0.62, 0.46], [0.82, 0.27]]
    };
    const rings = PROFILES[opts.profile] || PROFILES.cone;                 // [heightFrac, radiusFrac]
    const stretch = opts.stretch != null && opts.stretch > 0 ? opts.stretch : 1;
    const crest = opts.crest != null ? Math.max(0, Math.min(1, opts.crest)) : 0;
    const pt = (hf, rf, i) => {
      const a = i / seg * 6.2832;
      const rad = baseR * rf * (1 + ridgeOff[i] * rough * 1.4) * (1 + (h2(i, hf * 97 + 3) - 0.5) * rough * 0.7);
      const y = h * (hf + (h2(i, hf * 97 + 9) - 0.5) * rough * 0.12);
      const rr = hf === rings[rings.length - 1][0] ? rad * (1 + crest * 0.8) : rad, co = __M.cos(a), si = __M.sin(a);   // float order kept: default output is byte-identical
      return [c[0] + rx[0] * co * rr + fz[0] * si * rr * stretch, c[1] + y, c[2] + rx[2] * co * rr + fz[2] * si * rr * stretch];
    };
    const ref = [c[0], c[1] + h * 0.4, c[2]];
    const zoneAt = (fy, i) => {
      const fr = fy / h + (h2(i, 99) - 0.5) * 0.07;
      if (fr > snowline + 0.04) return MAT.SNOW;
      if (fr > snowline - 0.16 || fr > 0.34) return MAT.ROCK;
      return lowMat;
    };
    const colAt = (fy, i) => {
      const fr = fy / h + (h2(i, 99) - 0.5) * 0.07;                        // ragged zone edges
      if (fr > snowline + 0.04) return snow;
      if (fr > snowline - 0.16) return [(rock[0] + snow[0]) / 2, (rock[1] + snow[1]) / 2, (rock[2] + snow[2]) / 2];
      if (fr > 0.34) return rock;
      const j = 0.88 + 0.24 * h2(i, 21);
      return [forest[0] * j, forest[1] * j, forest[2] * j];
    };
    const V = rings.map(([hf, rf]) => { const row = []; for (let i = 0; i < seg; i++) row.push(pt(hf, rf, i)); return row; });
    for (let r = 0; r < rings.length - 1; r++) {
      for (let i = 0; i < seg; i++) {
        const a = V[r][i], b = V[r][(i + 1) % seg], cc = V[r + 1][(i + 1) % seg], d = V[r + 1][i];
        const fy = (a[1] + b[1] + cc[1] + d[1]) / 4 - c[1];
        out._mat = zoneAt(fy, i + r);
        emit(out, [a, b, cc, d], colAt(fy, i + r), ref);
      }
    }
    const apex = [c[0] + (h2(1, 1) - 0.5) * baseR * 0.14, c[1] + h * (0.97 + h2(2, 2) * 0.06), c[2] + (h2(3, 3) - 0.5) * baseR * 0.14];
    const tr = rings.length - 1;
    for (let i = 0; i < seg; i++) {
      const a = V[tr][i], b = V[tr][(i + 1) % seg];
      const fy = (a[1] + b[1] + apex[1]) / 3 - c[1];
      out._mat = zoneAt(fy, i);
      emit(out, [a, b, apex], colAt(fy, i), ref);
    }
    out._mat = 0;
  }

  // Stamp a BAKED MODEL's geometry into the accumulator: uniform scale, a yaw
  // about world +Y, then a translation. `mesh` is the {pos,nrm,col,mat,idx}
  // shape js/render/shared/assets.js parses out of the pack — but this function never
  // touches Assets or any renderer, so geom.js keeps loading under the bare VM
  // sandbox (tools/track/verify-track.cjs) with no stubbing.
  //
  // Uniform scale only, deliberately: a non-uniform scale would need the
  // inverse-transpose for normals, and every prop here is a real-world object
  // that should not be squashed anyway.
  function addMesh(out, mesh, opts) {
    if (!mesh || !mesh.pos || !mesh.idx || !mesh.pos.length) return false;
    const o = opts || {};
    const bad = (v) => v != null && !isFinite(v);
    if (bad(o.x) || bad(o.y) || bad(o.z) || bad(o.scale) || bad(o.rotY)) return false;
    const s = o.scale != null ? o.scale : 1;
    const x = o.x || 0, y = o.y || 0, z = o.z || 0;
    const ry = o.rotY || 0, cs = Math.cos(ry), sn = Math.sin(ry);
    const tint = o.tint || null;              // [r,g,b] multiplier over the baked colour
    const nv = mesh.pos.length / 3;
    const base = out.pos.length / 3;
    const mm = out.mat;
    const forced = o.mat != null ? o.mat : null;
    const fallback = out._mat || 0;
    for (let i = 0; i < nv; i++) {
      const px = mesh.pos[i * 3] * s, py = mesh.pos[i * 3 + 1] * s, pz = mesh.pos[i * 3 + 2] * s;
      out.pos.push(px * cs + pz * sn + x, py + y, -px * sn + pz * cs + z);
      const nx = mesh.nrm ? mesh.nrm[i * 3] : 0;
      const ny = mesh.nrm ? mesh.nrm[i * 3 + 1] : 1;
      const nz = mesh.nrm ? mesh.nrm[i * 3 + 2] : 0;
      out.nrm.push(nx * cs + nz * sn, ny, -nx * sn + nz * cs);
      const cr = mesh.col ? mesh.col[i * 3] : 0.7;
      const cg = mesh.col ? mesh.col[i * 3 + 1] : 0.7;
      const cb = mesh.col ? mesh.col[i * 3 + 2] : 0.7;
      if (tint) out.col.push(cr * tint[0], cg * tint[1], cb * tint[2]);
      else out.col.push(cr, cg, cb);
      if (mm) mm.push(forced != null ? forced : (mesh.mat ? mesh.mat[i] : fallback));
    }
    for (let i = 0; i < mesh.idx.length; i++) out.idx.push(base + mesh.idx[i]);
    return true;
  }

  // MIN_SEP — the smallest plane separation between two same-facing faces that
  // does not fight within 388 m: 24-bit depth, near plane 0.3 (the cockpit/hood
  // worst case, js/game.js _nearM), far 900 — tools/track/coplanar-audit.cjs's
  // fightDist(0.03). Staggers, insets and layer nudges step by this, not by
  // "a few millimetres": 6 mm fights from 174 m, 10 mm from 224 m.
  const MIN_SEP = 0.03;
  // SEP_SLOTS — per-call nudges for emitters whose calls can land on the same
  // plane (tracks.js place(), structures.js crowdBand): each slot is >= MIN_SEP
  // from every other AND from every 0.1 m plane of the authored grid, so a
  // nudge never parks a face 1 cm off an authored one (a 13 mm base did:
  // madrid's retail boxes vs the guardrail). Index by a per-emitter sequence.
  const SEP_SLOTS = Object.freeze([0.035, 0.065, 0.135, 0.165]);

  // Exact architectural box primitives, not enclosing prop bounds: gaps and rotated corners stay open.
  // Records are built once, survive worker transfer, and avoid retaining the city triangle soup.
  const LIGHT_CELL = 64, LIGHT_STRIDE = 18;
  const lightCellKey = (x, z) => x * 65536 + z;
  function lightBox(records, out, c, size, basis) {
    const mat = Math.floor((out._mat || 0) + 0.5);
    if (out._dryRun || out._matAt || mat === MAT.GLASS || mat === MAT.FOLIAGE || mat === MAT.FLAG || mat === MAT.FABRIC) return;
    // Keep structural slabs/walls, not tiny fittings; omission cannot invent an opaque silhouette.
    if (Math.min(...size) < 0.08 || Math.max(size[0]*size[1], size[0]*size[2], size[1]*size[2]) < 4) return;
    const r = basis ? basis[0] : [1,0,0], u = basis ? basis[1] : [0,1,0], f = basis ? basis[2] : [0,0,1];
    const a=r[0]*size[0]/2,b=u[0]*size[1]/2,d=f[0]*size[2]/2,
      e=r[1]*size[0]/2,g=u[1]*size[1]/2,h=f[1]*size[2]/2,
      i=r[2]*size[0]/2,j=u[2]*size[1]/2,k=f[2]*size[2]/2;
    const det=a*(g*k-h*j)+b*(h*i-e*k)+d*(e*j-g*i);
    if (!Number.isFinite(det) || Math.abs(det)<1e-10) return;
    const s=1/det, x=Math.abs(a)+Math.abs(b)+Math.abs(d), y=Math.abs(e)+Math.abs(g)+Math.abs(h), z=Math.abs(i)+Math.abs(j)+Math.abs(k);
    records.push(c[0],c[1],c[2], (g*k-h*j)*s,(d*j-b*k)*s,(b*h-d*g)*s,
      (h*i-e*k)*s,(a*k-d*i)*s,(d*e-a*h)*s,(e*j-g*i)*s,(b*i-a*j)*s,(a*g-b*e)*s,
      c[0]-x,c[1]-y,c[2]-z,c[0]+x,c[1]+y,c[2]+z);
  }
  function lightIndex(records) {
    const boxes = new Float32Array(records), count=boxes.length/LIGHT_STRIDE, cells=new Map();
    const bounds=[Infinity,Infinity,Infinity,-Infinity,-Infinity,-Infinity];
    for(let id=0;id<count;id++) {
      const n=id*LIGHT_STRIDE;
      for(let a=0;a<3;a++){bounds[a]=Math.min(bounds[a],boxes[n+12+a]);bounds[a+3]=Math.max(bounds[a+3],boxes[n+15+a]);}
      for(let x=Math.floor(boxes[n+12]/LIGHT_CELL);x<=Math.floor(boxes[n+15]/LIGHT_CELL);x++)
        for(let z=Math.floor(boxes[n+14]/LIGHT_CELL);z<=Math.floor(boxes[n+17]/LIGHT_CELL);z++){
          const key=lightCellKey(x,z);let list=cells.get(key);if(!list)cells.set(key,list=[]);list.push(id);
        }
    }
    for(const [key,list] of cells)cells.set(key,new Uint32Array(list));
    return {boxes,cells,bounds,stamp:new Uint32Array(count),generation:0,queries:0,tests:0};
  }
  function lightBlocked(track, eye, dx, dy, dz, maxT) {
    const index=track && track._lightOccluders;
    if(!index || !index.boxes.length || !(maxT>0))return false;
    index.queries++;
    const bounds=index.bounds;let near=0,far=maxT;
    for(let axis=0;axis<3;axis++){
      const dir=axis===0?dx:axis===1?dy:dz;
      if(Math.abs(dir)<1e-12){if(eye[axis]<bounds[axis]||eye[axis]>bounds[axis+3])return false;}
      else {const a=(bounds[axis]-eye[axis])/dir,b=(bounds[axis+3]-eye[axis])/dir;near=Math.max(near,Math.min(a,b));far=Math.min(far,Math.max(a,b));if(near>far)return false;}
    }
    if(!Number.isFinite(far))return false;
    const start=near+Math.min(1e-6,(far-near)*0.5), sx=dx>=0?1:-1, sz=dz>=0?1:-1;
    let x=Math.floor((eye[0]+dx*start)/LIGHT_CELL), z=Math.floor((eye[2]+dz*start)/LIGHT_CELL);
    let tx=Math.abs(dx)>1e-12?((x+(sx>0?1:0))*LIGHT_CELL-eye[0])/dx:Infinity;
    let tz=Math.abs(dz)>1e-12?((z+(sz>0?1:0))*LIGHT_CELL-eye[2])/dz:Infinity;
    const stepX=Math.abs(LIGHT_CELL/dx),stepZ=Math.abs(LIGHT_CELL/dz),data=index.boxes;
    let gen=(index.generation+1)>>>0;if(!gen){index.stamp.fill(0);gen=1;}index.generation=gen;
    // Broad phase follows only crossed cells; a shared stamp visits a spanning box once per ray.
    for(let cells=0;cells<2048;cells++){
      const ids=index.cells.get(lightCellKey(x,z));
      if(ids)for(let q=0;q<ids.length;q++){
        const id=ids[q];if(index.stamp[id]===gen)continue;index.stamp[id]=gen;index.tests++;
        const n=id*LIGHT_STRIDE,ox=eye[0]-data[n],oy=eye[1]-data[n+1],oz=eye[2]-data[n+2];
        let lo=0,hi=maxT;
        for(let a=0;a<3;a++){
          const o=n+3+a*3,origin=data[o]*ox+data[o+1]*oy+data[o+2]*oz,dir=data[o]*dx+data[o+1]*dy+data[o+2]*dz;
          if(Math.abs(dir)<1e-12){if(origin< -1||origin>1){hi=-1;break;}}
          else{const t0=(-1-origin)/dir,t1=(1-origin)/dir;lo=Math.max(lo,Math.min(t0,t1));hi=Math.min(hi,Math.max(t0,t1));if(lo>hi)break;}
        }
        if(lo<=hi && hi>1e-6 && lo<maxT-1e-6)return true;
      }
      if(tx>far && tz>far)break;
      if(tx<tz){x+=sx;tx+=stepX;}else{z+=sz;tz+=stepZ;}
    }
    return false;
  }

  return { lightBox, lightIndex, lightBlocked, MAT, SWAY_FRAC, swayMatAt, ROUND_K, roundNormals, MIN_SEP, SEP_SLOTS, cross, norm, vadd, emit, addMesh,
           addBox, addPrism, addPyramid, addCone, addCyl, addFrustum, addMountain };
})();
