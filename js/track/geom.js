/* Apex 26 — pure 3D geometry emitters shared by the track/scenery builders
   (js/track/tracks.js). Each add*(out, ...) pushes positions/normals/colours/indices
   into the caller's `out` accumulator; emit() fan-triangulates one auto-
   oriented convex face; MAT is the per-vertex procedural-material id map
   (stamped via out._mat). Stateless and renderer-free: no GLX, no track state —
   loads under tools/verify-track.cjs's bare VM sandbox. Must load BEFORE
   js/track/tracks.js (see index.html). */
const TrackGeom = (function () {
  "use strict";

  // Contextified-global aliases — the mechanism and the honest scope are written
  // out once, in js/track/models.js above firstNonFinite. Short version: under
  // vm.createContext (verify-track, graph-parity, the headless audits, the VM
  // unit suites) a bare `Math.`/`Number.` read goes through the contextified
  // global's C++ interceptor at ~140-220 ns instead of ~3.3 ns; in a browser it
  // is already ~3.3 ns, so this buys developer iteration time, not framerate.
  // Used only in the per-vertex / per-primitive emitters below.
  const __M = Math, __isFinite = Number.isFinite;

  // Procedural surface-material ids — stamped per-vertex (out._mat) and textured
  // in the lit shader's applyMaterial() (js/render/glx.js). 0 = FLAT (untextured, the
  // original look). Exposed to per-track scenery() via api.MAT.
  const MAT = { FLAT: 0, CONCRETE: 1, BRICK: 2, GLASS: 3, METAL: 4, WOOD: 5,
                FOLIAGE: 6, FABRIC: 7, SAND: 8, GRASS: 9, ROCK: 10, SNOW: 11,
                ROOF: 12, STONE: 13, RUST: 14,
                // FLAG (15): waving cloth. The lit VERTEX shader displaces these
                // verts with a travelling sine; the FRACTIONAL part of the stamped
                // id (15.0..15.4) encodes the per-vertex wave weight (0 = hoist
                // edge pinned to the pole → 0.4 = free edge, weight 1). Emitted
                // per-vertex by tracks.js flagQuad, not via out._mat.
                FLAG: 15,
                // ASPHALT (16): the racing surface. Must stay ABOVE the flag's
                // 15.0..16.0 fractional window (the vertex shader keys the cloth
                // wave off that range). Deliberately the most restrained material
                // in the table — tarmac is nearly flat, and the road is the one
                // surface viewed at a grazing angle at 80 m/s, so anything with
                // real relief crawls. See applyMaterial()/matBumpHeight() in
                // js/render/shaders/lit.js.
                ASPHALT: 16 };

  // ---------- small vec math (self-contained; doesn't depend on M4/V3) ----------
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
    // Basis pre-scaled by the half-extents once, so a corner is three multiply-
    // adds off the sign triple instead of nine multiplies through a closure
    // that returned a fresh [x,y,z]. That closure ran 24x per box.
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
    const m = out._mat || 0, mm = out.mat;
    const col0 = col[0], col1 = col[1], col2 = col[2];
    const pos = out.pos, nrm = out.nrm, cols = out.col, idx = out.idx;
    for (let fi = 0; fi < 6; fi++) {
      const o = fi * BOX_STRIDE;
      const base = pos.length / 3;
      // Outward normal: the named basis vector, signed. Unscaled — the
      // half-extents belong to the corners, not the normal.
      const ax = BOX_FACES[o + 12], sg = BOX_FACES[o + 13];
      const bv = ax === 0 ? r : ax === 1 ? u : f;
      const nx = bv[0] * sg, ny = bv[1] * sg, nz = bv[2] * sg;
      for (let i = 0; i < 4; i++) {
        const s = o + i * 3;
        const sx = BOX_FACES[s], sy = BOX_FACES[s + 1], sz2 = BOX_FACES[s + 2];
        pos.push(c0 + rx * sx + ux * sy + fx * sz2,
                 c1 + ry * sx + uy * sy + fy * sz2,
                 c2 + rz * sx + uz * sy + fz * sz2);
        nrm.push(nx, ny, nz);
        cols.push(col0, col1, col2);
        if (mm) mm.push(m);
      }
      if (flip) idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
      else idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }

  // ---------- richer primitives (beyond the box) ----------
  // Emit one flat convex polygon (3+ coplanar verts in perimeter order), fan-
  // triangulated, auto-oriented so its face points AWAY from `ref` (an interior
  // point) — so callers never have to reason about CCW winding under backface
  // culling. Normal is the face normal (flat shading, matches the box look).
  function emit(out, verts, col, ref) {
    // Reject non-finite geometry at the door. The GUARDED wrappers in tracks.js
    // (addBox/addCyl/…) already finite-check their arguments, so for years a
    // NaN anchor merely dropped the affected prop. emit() is the raw path with
    // no such check, and the moment a helper started using it directly — the
    // tree() canopy underside — a single tree resolving to node -1 pushed NaN
    // into the shared props buffer. validateGeometry then rejects the WHOLE
    // mesh and safe() substitutes an empty one, so one bad vertex costs a
    // circuit every prop it has. Silverstone shipped with no scenery that way.
    // Dropping one triangle is always better than losing the buffer.
    for (let i = 0; i < verts.length; i++) {
      const v = verts[i];
      if (!v || !__isFinite(v[0]) || !__isFinite(v[1]) || !__isFinite(v[2])) return false;
    }
    let nv = norm(cross(
      [verts[1][0] - verts[0][0], verts[1][1] - verts[0][1], verts[1][2] - verts[0][2]],
      [verts[2][0] - verts[0][0], verts[2][1] - verts[0][1], verts[2][2] - verts[0][2]]));
    if (ref) {
      let fx = 0, fy = 0, fz = 0;
      for (const v of verts) { fx += v[0]; fy += v[1]; fz += v[2]; }
      fx = fx / verts.length - ref[0]; fy = fy / verts.length - ref[1]; fz = fz / verts.length - ref[2];
      if (nv[0] * fx + nv[1] * fy + nv[2] * fz < 0) { verts = verts.slice().reverse(); nv = [-nv[0], -nv[1], -nv[2]]; }
    }
    const base = out.pos.length / 3;
    const m = out._mat || 0, mm = out.mat;
    for (const v of verts) { out.pos.push(v[0], v[1], v[2]); out.nrm.push(nv[0], nv[1], nv[2]); out.col.push(col[0], col[1], col[2]); if (mm) mm.push(m); }
    for (let i = 1; i < verts.length - 1; i++) out.idx.push(base, base + i, base + i + 1);
  }
  const vadd = (p, v, s) => [p[0] + v[0] * s, p[1] + v[1] * s, p[2] + v[2] * s];

  // Triangular prism / ridge: base sz[0] wide × sz[2] long, rising to a ridge
  // line along the LENGTH at height sz[1]. A-frame roofs, mountain ridges.
  //
  // ⚠ `c` is the BASE CENTRE, not the centroid — the prism occupies c → c+u*sz[1].
  // addBox/addPyramid centre their `c` instead, so a roof written as
  //   addPrism(out, vadd(top, u, roofH / 2), …)   // WRONG — floats by roofH/2
  // hangs clear of whatever it is meant to cap. Seat it flush on the surface:
  //   addPrism(out, top, …)                        // right
  // This asymmetry produced seven separate floating-roof defects (neonTower
  // chevron/hall, interlagos + cota terraces, zandvoort huts, madrid bays,
  // imola village) — check it before adding a caller. addCyl/addCone/addFrustum
  // are base-anchored the same way.
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
    for (let i = 0; i < seg; i++) emit(out, [ring(i / seg * 6.2832), ring((i + 1) / seg * 6.2832), ap], col, ref);
  }

  // Cylinder: n-gon column radius `rad`, height `h` (+ top cap). Trunks, towers.
  function addCyl(out, c, rad, h, col, seg, basis) {
    seg = seg || 8;
    const r = basis ? basis[0] : [1, 0, 0], u = basis ? basis[1] : [0, 1, 0], f = basis ? basis[2] : [0, 0, 1];
    const ref = vadd(c, u, h * 0.5), top = vadd(c, u, h);
    const lo = (a) => vadd(vadd(c, r, __M.cos(a) * rad), f, __M.sin(a) * rad);
    for (let i = 0; i < seg; i++) {
      const a0 = i / seg * 6.2832, a1 = (i + 1) / seg * 6.2832;
      emit(out, [lo(a0), lo(a1), vadd(lo(a1), u, h), vadd(lo(a0), u, h)], col, ref);
      emit(out, [vadd(lo(a0), u, h), vadd(lo(a1), u, h), top], col, ref);
    }
  }

  // Frustum: n-gon truncated cone, base radius `rBase` → top radius `rTop` over
  // height `h`. Stack these for colour-banded mountains (forest → rock → snow).
  function addFrustum(out, c, rBase, rTop, h, col, seg, basis) {
    seg = seg || 8;
    const r = basis ? basis[0] : [1, 0, 0], u = basis ? basis[1] : [0, 1, 0], f = basis ? basis[2] : [0, 0, 1];
    const ref = vadd(c, u, h * 0.5);
    const lo = (a) => vadd(vadd(c, r, __M.cos(a) * rBase), f, __M.sin(a) * rBase);
    const hi = (a) => vadd(vadd(vadd(c, u, h), r, __M.cos(a) * rTop), f, __M.sin(a) * rTop);
    for (let i = 0; i < seg; i++) {
      const a0 = i / seg * 6.2832, a1 = (i + 1) / seg * 6.2832;
      emit(out, [lo(a0), lo(a1), hi(a1), hi(a0)], col, ref);
    }
  }

  // Organic mountain at world `c`, base radius `baseR`, height `h`. A radial mesh
  // of stacked rings whose per-angle radius is perturbed (vertical ridges/gullies)
  // and whose apex is jittered off-centre, so no two read as the same symmetric
  // cone. Faces are coloured by height — forested base → rock → ragged snow cap.
  // opts: { seg, seed, rough, forest, rock, snow, snowline, right, fwd }.
  function addMountain(out, c, baseR, h, opts) {
    opts = opts || {};
    const seg = opts.seg || 10, seed = opts.seed || 0, rough = opts.rough != null ? opts.rough : 0.34;
    const forest = opts.forest || [0.22, 0.38, 0.22];
    const rock = opts.rock || [0.40, 0.38, 0.36];
    const snow = opts.snow || [0.93, 0.95, 0.99];
    const snowline = opts.snowline != null ? opts.snowline : 0.62;
    const rx = opts.right || [1, 0, 0], fz = opts.fwd || [0, 0, 1];
    const h2 = (a, b) => { const x = __M.sin(a * 12.9898 + b * 78.233 + seed * 0.137) * 43758.5453; return x - __M.floor(x); };
    const ridgeOff = [];
    for (let i = 0; i < seg; i++) ridgeOff.push(h2(i, 7) - 0.5);            // shared down each ridge
    const rings = [[0, 1], [0.38, 0.64], [0.70, 0.34]];                    // [heightFrac, radiusFrac]
    const pt = (hf, rf, i) => {
      const a = i / seg * 6.2832;
      const rad = baseR * rf * (1 + ridgeOff[i] * rough * 1.4) * (1 + (h2(i, hf * 97 + 3) - 0.5) * rough * 0.7);
      const y = h * (hf + (h2(i, hf * 97 + 9) - 0.5) * rough * 0.12);
      return [c[0] + rx[0] * __M.cos(a) * rad + fz[0] * __M.sin(a) * rad, c[1] + y, c[2] + rx[2] * __M.cos(a) * rad + fz[2] * __M.sin(a) * rad];
    };
    const ref = [c[0], c[1] + h * 0.4, c[2]];
    // zoneAt(): the SAME height-fraction test as colAt, returning a procedural
    // MATERIAL id per zone (forest→FOLIAGE, rock/transition→ROCK, snow→SNOW) so
    // the mountain's craggy/snowy surface gets a real light-catching bump, not
    // just the flat colour-zone shading below.
    const zoneAt = (fy, i) => {
      const fr = fy / h + (h2(i, 99) - 0.5) * 0.07;
      if (fr > snowline + 0.04) return MAT.SNOW;
      if (fr > snowline - 0.16) return MAT.ROCK;
      if (fr > 0.34) return MAT.ROCK;
      return MAT.FOLIAGE;
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
  // shape js/render/assets.js parses out of the pack — but this function never
  // touches Assets or any renderer, so geom.js keeps loading under the bare VM
  // sandbox (tools/verify-track.cjs) with no stubbing.
  //
  // Uniform scale only, deliberately: a non-uniform scale would need the
  // inverse-transpose for normals, and every prop here is a real-world object
  // that should not be squashed anyway.
  function addMesh(out, mesh, opts) {
    if (!mesh || !mesh.pos || !mesh.idx || !mesh.pos.length) return false;
    const o = opts || {};
    // Validate the SUPPLIED values before defaulting. `o.x || 0` would coerce a
    // NaN to 0, silently relocating the model to the world origin instead of
    // rejecting the placement — the same class of failure as the NaN anchor that
    // once cost Silverstone every one of its 783 066 prop vertices, except this
    // one leaves a building sitting at (0,0,0) rather than dropping the buffer.
    const bad = (v) => v != null && !isFinite(v);
    if (bad(o.x) || bad(o.y) || bad(o.z) || bad(o.scale) || bad(o.rotY)) return false;
    const s = o.scale != null ? o.scale : 1;
    const x = o.x || 0, y = o.y || 0, z = o.z || 0;
    const ry = o.rotY || 0, cs = Math.cos(ry), sn = Math.sin(ry);
    const tint = o.tint || null;              // [r,g,b] multiplier over the baked colour
    const nv = mesh.pos.length / 3;
    const base = out.pos.length / 3;
    const mm = out.mat;
    // opts.mat overrides the baked per-vertex id — lets one model be dressed as
    // concrete on one circuit and rusted metal on another.
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

  return { MAT, cross, norm, vadd, emit, addMesh,
           addBox, addPrism, addPyramid, addCone, addCyl, addFrustum, addMountain };
})();
