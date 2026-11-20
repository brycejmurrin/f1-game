/* Apex 26 — GarageHiPrims: the EXTREME garage's dense primitives (GfxQuality
 * feature "garageHi" / "crewHi", desktop EXTREME only). LAZY (tools/manifest.cjs
 * LAZY_RACE: LazyBundles.ensureGarageData loads it with the garage's Blender
 * tables). It also holds every EXTREME-only branch of the eager garage files: their
 * hooks route block / cyl / tube / hose and the dense equipment details here only
 * inside this file's dense() scope, and only while it is resident; HIGH and below, every
 * phone and the trackside pit rows never reach it. Every triangle is oriented
 * against its intended normal and zero-area triangles are dropped, so a builder
 * here cannot ship a back-facing or degenerate face.
 *
 * References (generic and unbranded; searched 2026-11-20):
 * - Hard-surface bevels: give a chamfer a flat face of its own with flat
 *   neighbours ("harden normals") and keep the segment count low for low poly.
 *   Blender manual, Bevel modifier: https://docs.blender.org/manual/en/latest/modeling/modifiers/generate/bevel.html
 *   The 1.4 cm / 20 %-of-thinnest-half width used here is our choice, not a sourced figure.
 * - Garage kit: a modular overhead gantry carries the lighting, pneumatic air
 *   lines, extraction and power. The wheel guns run on about 20 bar air, front
 *   and rear jacks are manual, and the tyre blankets feed from overhead power.
 *   https://www.motorsport.com/f1/news/how-does-f1-garage-work/8229824/ ,
 *   https://flowracers.com/blog/how-f1-car-jacks-work/
 * - The tyre section (flat tread, rounded shoulder, low bulged sidewall down to
 *   the rim) and the drain, drawer-pull and bezel details come from generic shop
 *   and garage practice, not from any one team's garage.
 */
const GarageHiPrims = (function () {
  "use strict";
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const AREA2_MIN = 1e-14;   // twice the area, m^2 squared: below it a triangle is degenerate

  function vtx(out, p, n, col, mid) {
    out.pos.push(p[0], p[1], p[2]); out.nrm.push(n[0], n[1], n[2]); out.col.push(col[0], col[1], col[2]);
    if (out.mat) out.mat.push(mid || 0);
    return out.pos.length / 3 - 1;
  }
  const at = (out, i) => [out.pos[i * 3], out.pos[i * 3 + 1], out.pos[i * 3 + 2]];
  const nAt = (out, i) => [out.nrm[i * 3], out.nrm[i * 3 + 1], out.nrm[i * 3 + 2]];
  // One triangle, wound so cross(b - a, c - a) agrees with its vertex normals
  // (the block()/panelGrid() convention); a zero-area triangle is skipped.
  function tri(out, a, b, c) {
    const pa = at(out, a), f = cross(sub(at(out, b), pa), sub(at(out, c), pa));
    if (dot(f, f) < AREA2_MIN) return;
    const na = nAt(out, a), nb = nAt(out, b), nc = nAt(out, c);
    const s = [na[0] + nb[0] + nc[0], na[1] + nb[1] + nc[1], na[2] + nb[2] + nc[2]];
    if (dot(f, s) >= 0) out.idx.push(a, b, c); else out.idx.push(a, c, b);
  }
  // A flat convex polygon (points in cyclic order) with one normal.
  function poly(out, pts, n, col, mid) {
    const i0 = vtx(out, pts[0], n, col, mid);
    for (let k = 1; k < pts.length; k++) vtx(out, pts[k], n, col, mid);
    for (let k = 1; k < pts.length - 1; k++) tri(out, i0, i0 + k, i0 + k + 1);
  }

  /** A chamfered box: centre c, half extents h, chamfer b. 6 inset faces, 12 edge
   *  strips, 8 corner triangles (44 tris for block()'s 12). sideOnly(mid, ny) is
   *  GaragePrims' wall-keyed material rule, applied per face. */
  function bevelBox(out, c, h, b, col, mid, sideOnly) {
    const P = (ax) => [c[0] + ax[0], c[1] + ax[1], c[2] + ax[2]];
    const e = (a, s) => { const v = [0, 0, 0]; v[a] = s; return v; };
    for (let a = 0; a < 3; a++) for (const s of [-1, 1]) {
      const o1 = (a + 1) % 3, o2 = (a + 2) % 3, pts = [];
      for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const q = [0, 0, 0]; q[a] = s * h[a]; q[o1] = u * (h[o1] - b); q[o2] = v * (h[o2] - b); pts.push(P(q));
      }
      const n = e(a, s);
      poly(out, pts, n, col, sideOnly(mid, n[1]));
    }
    for (let a1 = 0; a1 < 3; a1++) for (let a2 = a1 + 1; a2 < 3; a2++) {
      const a3 = 3 - a1 - a2;
      for (const s1 of [-1, 1]) for (const s2 of [-1, 1]) {
        const q = (f1, f2, s3) => { const v = [0, 0, 0]; v[a1] = s1 * (h[a1] - f1); v[a2] = s2 * (h[a2] - f2); v[a3] = s3 * (h[a3] - b); return P(v); };
        const n = norm([0, 1, 2].map((k) => (k === a1 ? s1 : k === a2 ? s2 : 0)));
        poly(out, [q(0, b, -1), q(0, b, 1), q(b, 0, 1), q(b, 0, -1)], n, col, sideOnly(mid, n[1]));
      }
    }
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
      const S = [sx, sy, sz], pts = [];
      for (let a = 0; a < 3; a++) pts.push(P([0, 1, 2].map((k) => S[k] * (h[k] - (k === a ? 0 : b)))));
      const n = norm(S);
      poly(out, pts, n, col, sideOnly(mid, n[1]));
    }
  }

  /** Catmull-Rom through pts, `sub` samples per leg, endpoints kept, repeats dropped. */
  function spline(pts, sub) {
    const P = [];
    for (const p of pts) if (!P.length || Math.hypot(p[0] - P[P.length - 1][0], p[1] - P[P.length - 1][1], p[2] - P[P.length - 1][2]) > 1e-5) P.push(p);
    if (P.length < 3) return P;
    const out = [P[0]];
    for (let i = 0; i < P.length - 1; i++) {
      const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
      for (let k = 1; k <= sub; k++) {
        const t = k / sub, t2 = t * t, t3 = t2 * t;
        out.push([0, 1, 2].map((j) => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3)));
      }
    }
    return out;
  }

  /** One continuous tube through a polyline: rings carried along it by
   *  projection (parallel transport), so a curved hose has no gaps or overlaps
   *  at its joints, and closed at both ends. */
  function sweep(out, pts, rad, col, seg, mid) {
    const N = pts.length;
    if (N < 2) return;
    const T = pts.map((p, i) => norm(sub(pts[Math.min(N - 1, i + 1)], pts[Math.max(0, i - 1)])));
    let u = cross(Math.abs(T[0][1]) < 0.9 ? [0, 1, 0] : [1, 0, 0], T[0]);
    u = norm(u);
    const rings = [];
    for (let i = 0; i < N; i++) {
      const t = T[i], d = dot(u, t);
      let w = [u[0] - t[0] * d, u[1] - t[1] * d, u[2] - t[2] * d];
      if (dot(w, w) < 1e-10) w = norm(cross(Math.abs(t[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0], t));
      u = norm(w);
      const v = cross(t, u), row = [];
      for (let k = 0; k < seg; k++) {
        const a = (k / seg) * Math.PI * 2, r = [u[0] * Math.cos(a) + v[0] * Math.sin(a), u[1] * Math.cos(a) + v[1] * Math.sin(a), u[2] * Math.cos(a) + v[2] * Math.sin(a)];
        row.push(vtx(out, [pts[i][0] + r[0] * rad, pts[i][1] + r[1] * rad, pts[i][2] + r[2] * rad], r, col, mid));
      }
      rings.push(row);
    }
    for (let i = 0; i < N - 1; i++) for (let k = 0; k < seg; k++) {
      const a = rings[i][k], b = rings[i][(k + 1) % seg], c = rings[i + 1][(k + 1) % seg], d = rings[i + 1][k];
      tri(out, a, b, c); tri(out, a, c, d);
    }
    for (const [i, sg] of [[0, -1], [N - 1, 1]]) {
      const n = [T[i][0] * sg, T[i][1] * sg, T[i][2] * sg], cap = rings[i].map((j) => at(out, j));
      poly(out, cap, n, col, mid);
    }
  }

  // A slick's half-section, (axial fraction, radius fraction): sidewall from the
  // rim flange, a rounded shoulder, the tread with two circumferential grooves.
  const TYRE_PROFILE = [[0, 0.62], [0, 0.80], [0.03, 0.90], [0.08, 0.962], [0.16, 0.995], [0.30, 1.0], [0.32, 0.982], [0.36, 0.982], [0.38, 1.0],
    [0.62, 1.0], [0.64, 0.982], [0.68, 0.982], [0.70, 1.0], [0.84, 0.995], [0.92, 0.962], [0.97, 0.90], [1, 0.80], [1, 0.62]];
  /** A surface of revolution about a→b. profile: [[axial 0..1, radius m], ...];
   *  normals are smoothed across a profile joint under ~45 degrees and split
   *  above it, so a shoulder stays round and a groove's wall stays crisp.
   *  capA / capB close the ends with a flat disc at the end radius. */
  function lathe(out, a, b, profile, col, seg, mid, capA, capB) {
    const d = sub(b, a), L = Math.hypot(d[0], d[1], d[2]) || 1e-6, n = [d[0] / L, d[1] / L, d[2] / L];
    const u = norm(cross(Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0], n)), v = cross(n, u);
    const S = profile.map(([t, r]) => [t * L, r]);
    const segN = [];
    for (let k = 0; k < S.length - 1; k++) {
      const ds = S[k + 1][0] - S[k][0], dr = S[k + 1][1] - S[k][1], l = Math.hypot(ds, dr) || 1;
      segN.push([-dr / l, ds / l]);
    }
    const endN = (k, end) => {   // the 2-D normal segment k uses at its start (0) or end (1)
      const j = end ? k + 1 : k - 1, o = segN[j];
      if (!o || o[0] * segN[k][0] + o[1] * segN[k][1] < 0.7) return segN[k];
      const s = [o[0] + segN[k][0], o[1] + segN[k][1]], l = Math.hypot(s[0], s[1]) || 1;
      return [s[0] / l, s[1] / l];
    };
    const ring = (s, r, n2) => {
      const row = [];
      for (let k = 0; k < seg; k++) {
        const t = (k / seg) * Math.PI * 2, rh = [u[0] * Math.cos(t) + v[0] * Math.sin(t), u[1] * Math.cos(t) + v[1] * Math.sin(t), u[2] * Math.cos(t) + v[2] * Math.sin(t)];
        const p = [a[0] + n[0] * s + rh[0] * r, a[1] + n[1] * s + rh[1] * r, a[2] + n[2] * s + rh[2] * r];
        row.push(vtx(out, p, norm([n[0] * n2[0] + rh[0] * n2[1], n[1] * n2[0] + rh[1] * n2[1], n[2] * n2[0] + rh[2] * n2[1]]), col, mid));
      }
      return row;
    };
    for (let k = 0; k < S.length - 1; k++) {
      const r0 = ring(S[k][0], S[k][1], endN(k, 0)), r1 = ring(S[k + 1][0], S[k + 1][1], endN(k, 1));
      for (let j = 0; j < seg; j++) { const j1 = (j + 1) % seg; tri(out, r0[j], r0[j1], r1[j1]); tri(out, r0[j], r1[j1], r1[j]); }
    }
    const disc = (s, r, sg) => {
      const pts = [];
      for (let k = 0; k < seg; k++) {
        const t = (k / seg) * Math.PI * 2;
        pts.push([0, 1, 2].map((i) => a[i] + n[i] * s + (u[i] * Math.cos(t) + v[i] * Math.sin(t)) * r));
      }
      poly(out, pts, [n[0] * sg, n[1] * sg, n[2] * sg], col, mid);
    };
    if (capA && S[0][1] > 0) disc(S[0][0], S[0][1], -1);
    if (capB && S[S.length - 1][1] > 0) disc(S[S.length - 1][0], S[S.length - 1][1], 1);
  }
  /** A tyre on axle a→b of outer radius rad (GaragePrims.tyre at EXTREME). */
  function tyre(out, a, b, rad, col, seg, mid) {
    lathe(out, a, b, TYRE_PROFILE.map(([t, r]) => [t, r * rad]), col, seg, mid, true, true);
  }

  /** The EXTREME bay's extra pieces, in the setup room's frame (GaragePrims
   *  dims): a slotted drain channel across the door threshold and a lattice
   *  (upper chord + lacing) ON the default truss's cross beams, between the beam
   *  and the roof, clear of the LED housings hung below it. g is GarageScene's per-wall
   *  prop groups, truss the roof accumulator (null when the roof is cached). */
  function roomExtras(g, truss, L) {
    const GP = GaragePrims, { block, tube, STEEL, DARK, MAT, scale } = GP;
    const z = GP.Z_DOOR - 0.62, w = TrackPit.BAY.doorW / 2 - 0.2;
    block(g.door, 0, 0.004, z, w + 0.04, 0.004, 0.09, scale(STEEL, 0.55), MAT.METAL);   // channel frame
    for (let x = -w + 0.05; x <= w - 0.05; x += 0.1) block(g.door, x, 0.009, z, 0.012, 0.0045, 0.075, DARK);   // grate bars over the slot
    if (!truss || (L && L.truss && L.truss !== "stock")) return;
    for (let i = 0; i <= 4; i++) {
      const tz = GP.Z_BACK + (GP.Z_DOOR - GP.Z_BACK) * (i / 4), yBot = GP.CEIL_Y - 0.37, yTop = GP.CEIL_Y - 0.17;
      tube(truss, [-2.6, yTop, tz], [2.6, yTop, tz], 0.018, STEEL, 8, MAT.METAL);   // upper chord
      for (let k = 0; k < 8; k++) {
        const x0 = -2.6 + k * 0.65, x1 = x0 + 0.65;
        tube(truss, [x0, k % 2 ? yBot : yTop, tz], [x1, k % 2 ? yTop : yBot, tz], 0.011, STEEL, 6, MAT.METAL);   // lacing
      }
    }
  }

  /* The crew's dense parts (GarageCrewDraw.body.detail, "crewHi"): a copy of a
   * Blender loft spec with twice the sides and a ring between every authored
   * pair. The new ring takes the pair's mean station and offsets and a
   * four-point (Catmull-Rom midpoint) radius clamped near its neighbours, so a
   * limb's taper and a closed end come out rounder rather than reshaped. Part
   * frames, rest lengths and paint slots (panels remap ring r to 2r) are the
   * authored ones, so GarageCrewMotion's rig and every pose drive it unchanged. */
  function densifyLoft(spec) {
    const R = spec.rings, rings = [], shut = (r) => r[1] === 0 && r[2] === 0;
    const rad = (i, k) => {
      const a = R[i], b = R[i + 1];
      if (shut(a)) return b[k] * 0.72;   // a dome between a closed tip and its first ring
      if (shut(b)) return a[k] * 0.72;
      const p = R[i - 1] && !shut(R[i - 1]) ? R[i - 1][k] : a[k], q = R[i + 2] && !shut(R[i + 2]) ? R[i + 2][k] : b[k];
      const cr = (-p + 9 * a[k] + 9 * b[k] - q) / 16;
      return Math.max(Math.min(a[k], b[k]) * 0.9, Math.min(Math.max(a[k], b[k]) * 1.08, cr));
    };
    for (let i = 0; i < R.length; i++) {
      rings.push(R[i]);
      if (i === R.length - 1) break;
      const a = R[i], b = R[i + 1], m = (k) => (a[k] + b[k]) / 2;
      rings.push([m(0), rad(i, 1), rad(i, 2), m(3), m(4), a[5]]);
    }
    const panels = (spec.panels || []).map(([slot, r0, r1, a0, a1]) => [slot, r0 * 2, r1 * 2, a0, a1]);
    return Object.freeze({ axis: spec.axis, sides: spec.sides * 2, p: spec.p, rings, panels });
  }

  /* The EXTREME build scope. Everything EXTREME-only lives here so the eager
   * boot carries only small hooks (the boot wall's eagerCodeBytes): while
   * dense(true, fn) runs, GaragePrims.hi(api) points block / cyl / tube / hose
   * and the builders' GaragePrims.ex(name, ...) hooks at this file; while
   * detail(true, fn) runs, GarageCrewDraw.body.hi(denseSpec) does the same for
   * the crew lofts. Outside a scope both are unset and every primitive is
   * today's (HIGH, phones, pit rows, car-mesh.js). run / build open both scopes
   * for a room or crew build and fall back to today's build on a throw. */
  const segs = (s) => Math.min(48, s * 2);   // 2x ring segments
  let _prims = false, _crew = false;
  function dense(on, fn) {
    const was = _prims;
    _prims = !!on; GaragePrims.hi(_prims ? api : null);
    try { return fn(); } finally { _prims = was; GaragePrims.hi(was ? api : null); }
  }
  const DENSE = {};
  const denseSpec = (name) => DENSE[name] || (DENSE[name] = densifyLoft(GarageCrewDraw.body.PARTS[name]));
  function detail(on, fn) {
    const was = _crew;
    _crew = !!on; GarageCrewDraw.body.hi(_crew ? denseSpec : null);
    try { return fn(); } finally { _crew = was; GarageCrewDraw.body.hi(was ? denseSpec : null); }
  }
  // Feature reads, cached on first use (the file lands once, on a tier that already chose them).
  const _on = {};
  function hiOn(name) {
    if (!(name in _on)) {
      let v = false;
      try { v = typeof GfxQuality !== "undefined" && !!GfxQuality.feature(name); } catch (_) { v = false; }
      _on[name] = v;
    }
    return _on[name];
  }
  /** The api when feature `name` is on (this file being resident is the other half), else false. */
  const live = (name) => hiOn(name) && api;
  // GaragePrims.run: a room ("room", garageHi; lookKey carries the bit) or crew ("crew" / "pit", crewHi) build, dense when live.
  const run = (kind, fn, undo) => (live(kind === "room" ? "garageHi" : "crewHi") ? build(kind, fn, undo) : fn());
  function hiReset() { for (const k in _on) delete _on[k]; }
  // GaragePrims.lookKey: the room's geometry identity carries the EXTREME bit (strings made once, no per-frame garbage).
  const HI_LOOK = {};
  const key = (look) => live("garageHi") && (HI_LOOK[look] || (HI_LOOK[look] = look + "+hi"));
  const lookKey = () => key(GaragePrims.lookId()) || GaragePrims.lookId();
  // A dense build that throws builds today's instead (undo first frees what it half-made).
  const FAIL = { room: ["game", "GarageScene dense room failed, stock room"], crew: ["game", "GarageCrew dense crew failed, stock crew"],
    pit: ["race", "PitCrewAnim dense crew failed, stock crew"] };
  function build(kind, fn, undo) {
    try { return dense(true, kind === "room" ? fn : () => detail(true, fn)); }
    catch (e) { if (undo) undo(); Log.warn(FAIL[kind][0], `${FAIL[kind][1]}: ${e && e.message}`); return fn(); }
  }

  // The primitives' dense forms: GaragePrims.block / hose pass their arguments (block: and its sideOnly); true = handled here.
  function block([out, cx, cy, cz, hx, hy, hz, col, mid], sideOnly) {
    const m = Math.min(hx, hy, hz);
    if (m < 0.01) return false;
    bevelBox(out, [cx, cy, cz], [hx, hy, hz], Math.min(0.014, 0.2 * m), col, mid, sideOnly);
    return true;
  }
  function hose([out, pts, rad, col, seg, mid]) {
    if (pts.length < 3) return false;
    sweep(out, spline(pts, 6), rad, col, segs(seg || 8), mid);
    return true;
  }
  // A tyre at EXTREME: the lathed slick at 2x segments.
  const slick = (out, a, b, rad, col, seg, mid) => tyre(out, a, b, rad, col, segs(seg || 14), mid);
  // GarageScene's tyre stack: a lathed slick, its compound band laid on the flat upper sidewall.
  function stack(out, x, y, z, comp) {
    slick(out, [x, y, z], [x, y + 0.33, z], 0.36, [0.045, 0.045, 0.050], 14);
    GaragePrims.cyl(out, x, y + 0.33, z, 0.305, 0.006, comp, 14);
    return true;
  }
  // GarageEquipment's tyre trolley tyre at z = wz.
  function wheel(out, x, wz) {
    slick(out, [x - 0.17, 0.44, wz], [x + 0.17, 0.44, wz], 0.34, [0.045, 0.045, 0.050], 14);
    return true;
  }
  // GarageEquipment's tool chest drawer d: a round full-width pull on two stand-offs, and the drawer's shadow gap above it.
  function pull(out, x, z, s, d) {
    const { tube, block: blk, STEEL, DARK, MAT } = GaragePrims, py = 0.28 + d * 0.24;
    tube(out, [x + s * 0.41, py, z - 0.30], [x + s * 0.41, py, z + 0.30], 0.011, STEEL, 8, MAT.METAL);
    for (const pz of [-0.27, 0.27]) tube(out, [x + s * 0.382, py, z + pz], [x + s * 0.41, py, z + pz], 0.007, STEEL, 6, MAT.METAL);
    blk(out, x + s * 0.3825, 0.35 + d * 0.24, z, 0.0025, 0.004, 0.70, DARK);
    return true;
  }
  // GarageEquipment's monitor gantry screen at z + dz: a raised bezel lip round the panel and the mount box behind it.
  function bezel(out, x, z, s, dz) {
    const { block: blk, STEEL, DARK, MAT, scale } = GaragePrims;
    for (const sy of [-1, 1]) blk(out, x + s * 0.125, 1.92 + sy * 0.235, z + dz, 0.006, 0.012, 0.37, DARK);
    for (const sz of [-1, 1]) blk(out, x + s * 0.125, 1.92, z + dz + sz * 0.36, 0.006, 0.225, 0.012, DARK);
    blk(out, x + s * 0.045, 1.98, z + dz, 0.02, 0.06, 0.06, scale(STEEL, 0.6), MAT.METAL);
    return true;
  }

  const api = Object.freeze({ densifyLoft, bevelBox, spline, sweep, lathe, tyre, roomExtras, TYRE_PROFILE,
    segs, dense, isDense: () => _prims, detail, isDetail: () => _crew, denseSpec, hiOn, live, hiReset, key, build,
    block, hose, slick, wheel, stack, pull, bezel, run, lookKey });
  // Landing installs the EXTREME seams GaragePrims keeps as today's stubs (lookKey = lookId, run = call):
  // from here the room key and PitCrewAnim's rig key (crewHi) change, the bay crew is freed, and each rebuilds dense.
  if (typeof GaragePrims !== "undefined") Object.assign(GaragePrims, { lookKey, run });
  if (live("crewHi")) {
    if (typeof GaragePrims !== "undefined") GaragePrims.crewHi = true;
    if (typeof GarageCrew !== "undefined") GarageCrew.free();
  }
  return api;
})();
if (typeof window !== "undefined") window.GarageHiPrims = GarageHiPrims;
