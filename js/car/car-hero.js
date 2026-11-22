/* Apex 26 — CarHero: the desktop EXTREME car detail (GfxQuality feature "heroCar" and the detail-2 tessellation).
 * LAZY_GFX_HI (tools/manifest.cjs): RendererBoot.start fetches it beside the backend only when
 * GfxQuality.detail() >= 2, so a phone and ULTRA and below never load it; CarGeometry / Car3D keep today's mesh
 * while it is absent. Everything here was moved out of the eager car files unchanged (docs/notes/
 * DESKTOP-GRAPHICS-TIERS-2026-11-20.md): each eager call site is a guarded hook, and without this file
 * CarGeometry.clampDetail caps a build at 1 (ULTRA) and no build is a hero build (CarGeometry.withDetail).
 * Builders that need a CarGeometry.create closure's primitives get its returned kit `G` (addTri, addQuad, addLoft,
 * addBox, addBlock, addTube, ...) as their first argument. */
const CarHero = (function () {
  "use strict";

  // ---- heroCar primitives (CarGeometry.create: addBox / addBeamBetween / addFairedArm / addWishboneWeb) ----
  // heroCar: a box with every edge chamfered by b (one 45 degree segment) and every corner cut: the face planes
  // and so the extents are the box's own; 6 inset faces + 12 edge strips + 8 corner triangles (44 triangles).
  const BEVEL = 0.004;
  function box(G, out, cx, cy, cz, sx, sy, sz, col, surface) {
    const b = Math.min(BEVEL, Math.min(sx, sy, sz) * 0.25);
    if (b >= 0.0008) return bevelBox(G, out, cx, cy, cz, sx, sy, sz, b, col, surface);
    G.addLoft(out, cz-sz/2, cx, cy, sx, sy, cz+sz/2, cx, cy, sx, sy, col, surface);
  }
  function bevelBox(G, out, cx, cy, cz, sx, sy, sz, b, col, surface) {
    const h = [sx / 2, sy / 2, sz / 2], c = [cx, cy, cz];
    // the point on face (axis k, sign s) at in-plane offsets (u, v) along the other two axes, inset by b
    const P = (k, sg, du, dv) => {
      const p = [0, 0, 0], u = (k + 1) % 3, v = (k + 2) % 3;
      p[k] = sg * h[k]; p[u] = du * (h[u] - b); p[v] = dv * (h[v] - b);
      return [c[0] + p[0], c[1] + p[1], c[2] + p[2]];
    };
    const face = (k, sg) => {
      const q = [P(k, sg, -1, -1), P(k, sg, 1, -1), P(k, sg, 1, 1), P(k, sg, -1, 1)];
      if (sg > 0) G.addQuad(out, q[0], q[1], q[2], q[3], col, surface); else G.addQuad(out, q[0], q[3], q[2], q[1], col, surface);
    };
    for (let k = 0; k < 3; k++) { face(k, 1); face(k, -1); }
    // the strip between face (k, sk) and face (u, su), u = k+1, running along axis v = k+2
    for (let k = 0; k < 3; k++) for (const sk of [-1, 1]) for (const su of [-1, 1]) {
      const u = (k + 1) % 3;
      // on face k: offset along u is su (to the edge), along v is -1..1; on face u: its own (u+1)%3 = v... map
      const a0 = P(k, sk, su, -1), a1 = P(k, sk, su, 1);
      // face u's in-plane axes are (u+1)%3 = v and (u+2)%3 = k
      const b0 = P(u, su, -1, sk), b1 = P(u, su, 1, sk);
      quadOut(G, out, a0, a1, b1, b0, c, col, surface);
    }
    for (const sx2 of [-1, 1]) for (const sy2 of [-1, 1]) for (const sz2 of [-1, 1]) {
      const s3 = [sx2, sy2, sz2];
      const corner = (k) => { const u = (k + 1) % 3, v = (k + 2) % 3; return P(k, s3[k], s3[u], s3[v]); };
      triOut(G, out, corner(0), corner(1), corner(2), c, col, surface);
    }
  }
  // A triangle / quad wound so its normal points away from `c` (the solid's centre).
  function triOut(G, out, a, b, d, c, col, surface) {
    const ux = b[0]-a[0], uy = b[1]-a[1], uz = b[2]-a[2], vx = d[0]-a[0], vy = d[1]-a[1], vz = d[2]-a[2];
    const n = [uy*vz - uz*vy, uz*vx - ux*vz, ux*vy - uy*vx];
    const o = (a[0]+b[0]+d[0])/3 - c[0], p = (a[1]+b[1]+d[1])/3 - c[1], q = (a[2]+b[2]+d[2])/3 - c[2];
    if (n[0]*o + n[1]*p + n[2]*q < 0) G.addTri(out, a, d, b, col, surface); else G.addTri(out, a, b, d, col, surface);
  }
  function quadOut(G, out, a, b, d, e, c, col, surface) {
    triOut(G, out, a, b, d, c, col, surface); triOut(G, out, a, d, e, c, col, surface);
  }
  // heroCar: a straight member between p0 and p1 with a closed section (an n-gon in the (A, B) frame, A and B
  // carrying the half-extents) and capped ends. Normals come from refine's crease-angle pass.
  function sectionBar(G, out, p0, p1, A, B, section, col, surface) {
    const ring = (p) => section.map(([a, b]) => [p[0] + A[0]*a + B[0]*b, p[1] + A[1]*a + B[1]*b, p[2] + A[2]*a + B[2]*b]);
    const R0 = ring(p0), R1 = ring(p1), n = section.length, mid = [(p0[0]+p1[0])/2, (p0[1]+p1[1])/2, (p0[2]+p1[2])/2];
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; quadOut(G, out, R0[i], R0[j], R1[j], R1[i], mid, col, surface); }
    for (const [R, p] of [[R0, p0], [R1, p1]]) {
      const dir = [p[0] - mid[0], p[1] - mid[1], p[2] - mid[2]], far = [mid[0] - dir[0], mid[1] - dir[1], mid[2] - dir[2]];
      for (let i = 0; i < n; i++) triOut(G, out, p, R[i], R[(i + 1) % n], far, col, surface);
    }
  }
  const ROUND12 = Array.from({ length: 12 }, (_, i) => [Math.cos(i / 12 * Math.PI * 2), Math.sin(i / 12 * Math.PI * 2)]);
  // symmetric aerofoil, chord along a (-1 leading .. +1 trailing), thickness along b: a 12-point NACA-like loop
  const FOIL12 = (() => {
    const xs = [1, 0.75, 0.45, 0.15, -0.3, -0.75], pts = [];
    const th = (x) => { const t = (x + 1) / 2; return (0.2969*Math.sqrt(t) - 0.1260*t - 0.3516*t*t + 0.2843*t**3 - 0.1015*t**4) / 0.1003; };
    pts.push([-1, 0]);
    for (const x of xs.slice().reverse()) pts.push([x, Math.min(1, th(x))]);
    pts.push([1, 0]);
    for (const x of xs) pts.push([x, -Math.min(1, th(x))]);
    return pts;
  })();
  // CarGeometry addBeamBetween at heroCar: a round rod (12-gon inscribed in its square section, the same frame,
  // computed here exactly as there) — mirror stalks, track rods, pushrods.
  function rod(G, out, p0, p1, th, col, surface) {
    let dx = p1[0]-p0[0], dy = p1[1]-p0[1], dz = p1[2]-p0[2];
    const len = Math.hypot(dx, dy, dz) || 1; dx /= len; dy /= len; dz /= len;
    let ux = -dz, uy = 0, uz = dx;
    let ul = Math.hypot(ux, uy, uz);
    if (ul < 1e-5) { ux = 1; uy = 0; uz = 0; ul = 1; }
    ux = ux / ul * th * 0.5; uy = uy / ul * th * 0.5; uz = uz / ul * th * 0.5;
    const vx = dy*uz-dz*uy;
    const vy = dz*ux-dx*uz;
    const vz = dx*uy-dy*ux;
    sectionBar(G, out, p0, p1, [ux, uy, uz], [vx, vy, vz], ROUND12, col, surface);
  }
  // CarGeometry addFairedArm at heroCar: the faired wishbone leg as a real symmetric aerofoil section (same chord
  // and thickness, the same frame computed exactly as there).
  function arm(G, out, p0, p1, th, col, surface) {
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
    sectionBar(G, out, p0, p1, [ax, ay, az], [lx, ly, lz], FOIL12, col, surface);
  }
  // heroCar: the wishbone web as a 4 mm carbon plate, not two coincident faces: both skins offset 2 mm along its
  // normal, closed. False (nothing emitted) for a degenerate plate: the caller emits today's two faces.
  function web(G, out, a, b, c, d, col, surface) {
    const ux = b[0]-a[0], uy = b[1]-a[1], uz = b[2]-a[2], vx = d[0]-a[0], vy = d[1]-a[1], vz = d[2]-a[2];
    let nx = uy*vz - uz*vy, ny = uz*vx - ux*vz, nz = ux*vy - uy*vx;
    const nl = Math.hypot(nx, ny, nz);
    if (!(nl > 1e-12)) return false;
    nx *= 0.002 / nl; ny *= 0.002 / nl; nz *= 0.002 / nl;
    const up = (q) => [q[0] + nx, q[1] + ny, q[2] + nz], dn = (q) => [q[0] - nx, q[1] - ny, q[2] - nz];
    G.addBlock(out, [up(a), up(b), up(c), up(d), dn(a), dn(b), dn(c), dn(d)], col, null, surface);
    return true;
  }

  // ---- LOFT UVS (heroCar with the TLX carSurf program) ----
  // A per-vertex body-surface coordinate in METRES, out.luv as (s, t, -1) per vertex, (0, 0, 0) where no loft wrote
  // one. s: the DEVELOPED station, the loft's first ring z plus the signed arc length of its ring centres (z itself
  // on a straight loft, stretched along a sloping one); t: the section arc length from the ring's top point,
  // positive toward +x, the wrap at the bottom (a triangle across it takes the unwrapped value). Car3D.build hands it
  // on as out.trk (the TLX lit program's spare vec3, zero-filled on every car until now; road effects key on
  // trk.z > 0.5, so -1 reads as "a car loft"). Called (CarGeometry.loftUv, only while a hero build records them)
  // right after a loft emitted vertices v0.. through addTri (three unshared vertices a triangle): each triangle
  // whose three corners are all ring points gets coordinates, any other (a cap) none.
  function luvPad(out, n) {
    const L = out.luv;
    if (L) while (L.length < n * 3) L.push(0);
  }
  function loftUv(out, v0, rings) {
    if (!rings || rings.length < 2) return;
    const n = out.pos.length / 3;
    if (!out.luv) out.luv = [];
    luvPad(out, v0);
    out.luv.length = v0 * 3;
    const key = (x, y, z) => Math.round(x * 1e6) + "," + Math.round(y * 1e6) + "," + Math.round(z * 1e6);
    const at = new Map();
    let s = 0, pc = null;
    for (const ring of rings) {
      const m = ring.length, c = [0, 0, 0];
      for (const p of ring) { c[0] += p[0] / m; c[1] += p[1] / m; c[2] += p[2] / m; }
      s = pc ? s + Math.sign(c[2] - pc[2] || 1) * Math.hypot(c[0] - pc[0], c[1] - pc[1], c[2] - pc[2]) : c[2];
      pc = c;
      let top = 0;
      for (let i = 1; i < m; i++) if (ring[i][1] > ring[top][1] + 1e-9 || (Math.abs(ring[i][1] - ring[top][1]) <= 1e-9 && Math.abs(ring[i][0]) < Math.abs(ring[top][0]))) top = i;
      const arc = new Float64Array(m + 1);
      for (let i = 0; i < m; i++) { const a = ring[i], b = ring[(i + 1) % m]; arc[i + 1] = arc[i] + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]); }
      const P = arc[m] || 1, dir = ring[(top + 1) % m][0] >= ring[top][0] ? 1 : -1;
      for (let i = 0; i < m; i++) {
        let t = dir * (arc[i] - arc[top]);
        t = ((t % P) + P) % P; if (t > P / 2) t -= P;
        const k = key(ring[i][0], ring[i][1], ring[i][2]);
        if (!at.has(k)) at.set(k, [s, t, P]);
      }
    }
    const L = out.luv, Q = out.pos;
    for (let v = v0; v < n; v += 3) {
      const r = v + 2 < n ? [0, 1, 2].map((k) => at.get(key(Q[(v + k) * 3], Q[(v + k) * 3 + 1], Q[(v + k) * 3 + 2]))) : null;
      if (!r || !r[0] || !r[1] || !r[2]) { for (let k = v; k < Math.min(n, v + 3); k++) L.push(0, 0, 0); continue; }
      const lo = Math.min(r[0][1], r[1][1], r[2][1]), hi = Math.max(r[0][1], r[1][1], r[2][1]);
      for (const e of r) L.push(e[0], hi - lo > e[2] / 2 && e[1] < 0 ? e[1] + e[2] : e[1], -1);
    }
  }
  // A vertex appended at t along edge u -> w (CarShade.heightZone's cut): its loft coordinate is the edge's lerp.
  function luvLerp(out, u, w, t) {
    const L = out.luv;
    if (!L) return;
    const n = out.pos.length / 3 - 1, g = (v, k) => (v * 3 + k < L.length ? L[v * 3 + k] : 0);
    const a = [0, 1, 2].map((k) => g(u, k) + (g(w, k) - g(u, k)) * t);
    luvPad(out, n);
    L.length = n * 3;
    L.push(a[0], a[1], a[2]);
  }

  // ---- heroCar BEVELS (CarGeometry.heroBevel during a hero build; MeshDetail.bevel, lazy) ----
  // A closed part of hard edges (the rounded floor plate, the endplate plates) is emitted into its own buffer, its
  // creases over 60 degrees rounded `width` metres wide in `segs` segments, with the wedge (face-weighted) normals
  // MeshDetail gives the flat faces, then appended to `out`. MeshDetail absent: the part exactly as today. Any
  // throw or bad number: the unbevelled part.
  function bevel(out, width, segs, emit) {
    if (typeof MeshDetail === "undefined" || !MeshDetail.bevel) return emit(out);
    const part = { pos: [], nrm: [], col: [], mat: [], idx: [] };
    emit(part);
    let g = part;
    try {
      const b = MeshDetail.toGeom(MeshDetail.bevel(MeshDetail.fromGeom(part), { creases: 60, width, segments: segs }));
      const n = b.pos.length / 3;
      if (n && b.nrm.length === n * 3 && b.col.length === n * 3 && b.mat && b.mat.length === n
          && b.pos.every(Number.isFinite) && b.nrm.every(Number.isFinite) && b.idx.every((v) => v < n)) g = b;
    } catch (e) { if (typeof Log !== "undefined") Log.warn("car", "hero bevel failed, the plain part: " + (e && e.message)); }
    const base = out.pos.length / 3;
    for (let i = 0; i < g.pos.length; i++) { out.pos.push(g.pos[i]); out.nrm.push(g.nrm[i]); out.col.push(g.col[i]); }
    for (let i = 0; i < g.mat.length; i++) out.mat.push(g.mat[i]);
    for (let i = 0; i < g.idx.length; i++) out.idx.push(base + g.idx[i]);
  }

  // ---- WELD with loft UVs (CarGeometry.weld hands an out carrying out.luv here) ----
  // out.luv joins the key, so the two sides of a loft's wrap never weld into one.
  const _f = new Float32Array(13), _u = new Uint32Array(_f.buffer);
  function weld(out) {
    const n = out.pos.length / 3;
    if (!n || out.nrm.length !== n * 3 || out.col.length !== n * 3 || (out.mat && out.mat.length !== n)) return out;
    if (out.luv) luvPad(out, n);
    const lu = out.luv && out.luv.length === n * 3 ? out.luv : null, K = lu ? 13 : 10;
    let cap = 1; while (cap < n * 2) cap <<= 1;
    const table = new Int32Array(cap).fill(-1), keys = new Uint32Array(n * K), remap = new Int32Array(n);
    const pos = [], nrm = [], col = [], mat = out.mat ? [] : null, luv = lu ? [] : null;
    let m = 0;
    for (let i = 0; i < n; i++) {
      _f[0] = out.pos[i*3]; _f[1] = out.pos[i*3+1]; _f[2] = out.pos[i*3+2];
      _f[3] = out.nrm[i*3]; _f[4] = out.nrm[i*3+1]; _f[5] = out.nrm[i*3+2];
      _f[6] = out.col[i*3]; _f[7] = out.col[i*3+1]; _f[8] = out.col[i*3+2]; _f[9] = mat ? out.mat[i] : 0;
      if (lu) { _f[10] = lu[i*3]; _f[11] = lu[i*3+1]; _f[12] = lu[i*3+2]; }
      let h = 2166136261;
      for (let k = 0; k < K; k++) h = Math.imul(h ^ _u[k], 16777619);
      let slot = (h >>> 0) & (cap - 1), hit = -1;
      for (;;) {
        const j = table[slot];
        if (j < 0) break;
        let same = true;
        for (let k = 0; k < K; k++) if (keys[j*K+k] !== _u[k]) { same = false; break; }
        if (same) { hit = j; break; }
        slot = (slot + 1) & (cap - 1);
      }
      if (hit < 0) {
        hit = m++; table[slot] = hit;
        for (let k = 0; k < K; k++) keys[hit*K+k] = _u[k];
        pos.push(out.pos[i*3], out.pos[i*3+1], out.pos[i*3+2]);
        nrm.push(out.nrm[i*3], out.nrm[i*3+1], out.nrm[i*3+2]);
        col.push(out.col[i*3], out.col[i*3+1], out.col[i*3+2]);
        if (mat) mat.push(out.mat[i]);
        if (luv) luv.push(lu[i*3], lu[i*3+1], lu[i*3+2]);
      }
      remap[i] = hit;
    }
    const idx = out.idx;
    for (let t = 0; t < idx.length; t++) idx[t] = remap[idx[t]];
    out.pos = pos; out.nrm = nrm; out.col = col; if (mat) out.mat = mat; if (luv) out.luv = luv;
    return out;
  }

  // ---- REFINE (feature heroCar, EXTREME player car) ----
  // `levels` rounds of 1-to-4 triangle subdivision over a WELDED mesh, in place. Interpolating, not approximating:
  // every existing vertex stays exactly where it is (no Loop-style shrink, so the bounding box and every decal
  // anchor hold) and each new edge point sits on the PN-triangle cubic through the edge's two positions and normals,
  // so a smooth panel bulges toward the curved surface its normals describe. First, once, CREASE-ANGLE NORMALS: a
  // flat-shaded vertex (its normal is its own faces' normal) takes the area-weighted mean of every face at its
  // position within CREASE_DEG of it, so a faceted loft reads round and a box corner or wing endplate (90 degrees)
  // stays sharp; authored smooth normals (CarShade) are kept. An edge is a CREASE, kept straight, when its position
  // pair is not shared by exactly two triangles or the two sides carry different normals at it (a hard edge, an open
  // rim, a floor or endplate edge). The bulge is clamped to MAX_BULGE: livery decals ride 4-8 mm proud of the panels
  // and must stay in front of them. New normals: the PN quadratic normal; colour, uv and surface interpolate along
  // the edge (surface: the first end's).
  const MAX_BULGE = 0.002, CREASE_DEG = 35, CREASE_COS = Math.cos(CREASE_DEG * Math.PI / 180);
  // `minEdge` (metres): an edge at or under it is not split, so the triangles go where the panels are big and
  // a 3 mm bolt head is left alone. The decision belongs to the POSITION edge, so both triangles on an edge agree
  // and no T-junction opens; a triangle with one, two or three split edges becomes two, three or four.
  function refine(out, levels, minEdge) {
    for (let l = 0; l < (levels | 0); l++) refineOnce(out, l === 0, minEdge > 0 ? minEdge : 0);
    return out;
  }
  function positionIds(P, n) {
    const pid = new Int32Array(n), byPos = new Map();
    for (let v = 0; v < n; v++) {
      const k = Math.round(P[v*3] * 1e5) + "," + Math.round(P[v*3+1] * 1e5) + "," + Math.round(P[v*3+2] * 1e5);
      let id = byPos.get(k);
      if (id === undefined) { id = byPos.size; byPos.set(k, id); }
      pid[v] = id;
    }
    return { pid, np: byPos.size };
  }
  function creaseNormals(P, N, I, pid, np) {
    const n = P.length / 3, tris = I.length / 3, fn = new Float64Array(tris * 3);
    const own = Array.from({ length: n }, () => []), at = Array.from({ length: np }, () => []);
    for (let t = 0; t < tris; t++) {
      const a = I[t*3], b = I[t*3+1], c = I[t*3+2];
      const ux = P[b*3]-P[a*3], uy = P[b*3+1]-P[a*3+1], uz = P[b*3+2]-P[a*3+2];
      const vx = P[c*3]-P[a*3], vy = P[c*3+1]-P[a*3+1], vz = P[c*3+2]-P[a*3+2];
      fn[t*3] = uy*vz - uz*vy; fn[t*3+1] = uz*vx - ux*vz; fn[t*3+2] = ux*vy - uy*vx;
      for (const v of [a, b, c]) own[v].push(t);
      for (const p of new Set([pid[a], pid[b], pid[c]])) at[p].push(t);
    }
    const unit = (t) => { const l = Math.hypot(fn[t*3], fn[t*3+1], fn[t*3+2]); return l > 1e-14 ? l : 0; };
    const next = N.slice();
    for (let v = 0; v < n; v++) {
      const nx = N[v*3], ny = N[v*3+1], nz = N[v*3+2];
      let flat = own[v].length > 0;
      for (const t of own[v]) { const l = unit(t); if (l && (fn[t*3]*nx + fn[t*3+1]*ny + fn[t*3+2]*nz) / l < 0.9999) { flat = false; break; } }
      if (!flat) continue;
      let sx = 0, sy = 0, sz = 0;
      for (const t of at[pid[v]]) {
        const l = unit(t);
        if (l && (fn[t*3]*nx + fn[t*3+1]*ny + fn[t*3+2]*nz) / l > CREASE_COS) { sx += fn[t*3]; sy += fn[t*3+1]; sz += fn[t*3+2]; }
      }
      const sl = Math.hypot(sx, sy, sz);
      if (sl > 1e-14) { next[v*3] = sx / sl; next[v*3+1] = sy / sl; next[v*3+2] = sz / sl; }
    }
    for (let i = 0; i < next.length; i++) N[i] = next[i];
  }
  function refineOnce(out, first, minEdge) {
    const P = out.pos, N = out.nrm, C = out.col, M = out.mat, U = out.uv && out.uv.length ? out.uv : null, I = out.idx;
    const n = P.length / 3, tris = I.length / 3;
    if (!n || !tris) return out;
    if (out.luv) luvPad(out, n);
    const LU = out.luv && out.luv.length === n * 3 ? out.luv : null;
    const { pid, np } = positionIds(P, n);
    if (first) creaseNormals(P, N, I, pid, np);
    // per position-edge: triangle count, and whether every use carries the same normals at both ends
    const sameN = (a, b) => Math.abs(N[a*3]-N[b*3]) + Math.abs(N[a*3+1]-N[b*3+1]) + Math.abs(N[a*3+2]-N[b*3+2]) < 1e-4;
    const pe = new Map();
    for (let t = 0; t < tris; t++) for (let e = 0; e < 3; e++) {
      let a = I[t*3+e], b = I[t*3+(e+1)%3];
      if (pid[a] > pid[b]) { const s = a; a = b; b = s; }
      const k = pid[a] * np + pid[b], r = pe.get(k);
      if (!r) pe.set(k, { c: 1, a, b, same: true,
        split: Math.hypot(P[b*3]-P[a*3], P[b*3+1]-P[a*3+1], P[b*3+2]-P[a*3+2]) > minEdge });
      else { r.c++; if (r.same && !(sameN(r.a, a) && sameN(r.b, b))) r.same = false; }
    }
    const mids = new Map(), L = n;
    const mid = (a, b) => {
      if (pid[a] > pid[b]) { const s = a; a = b; b = s; }
      const vk = a * L + b;
      let m = mids.get(vk);
      if (m !== undefined) return m;
      const r = pe.get(pid[a] * np + pid[b]);
      if (!r.split) { mids.set(vk, -1); return -1; }
      const ax = P[a*3], ay = P[a*3+1], az = P[a*3+2], bx = P[b*3], by = P[b*3+1], bz = P[b*3+2];
      const nax = N[a*3], nay = N[a*3+1], naz = N[a*3+2], nbx = N[b*3], nby = N[b*3+1], nbz = N[b*3+2];
      let mx = (ax + bx) / 2, my = (ay + by) / 2, mz = (az + bz) / 2;
      let qx = nax + nbx, qy = nay + nby, qz = naz + nbz;
      const ex = bx - ax, ey = by - ay, ez = bz - az, ee = ex*ex + ey*ey + ez*ez;
      if (r && r.c === 2 && r.same && ee > 1e-14 && nax*nbx + nay*nby + naz*nbz > CREASE_COS) {
        // PN cubic midpoint: (Pa+Pb)/2 - (wab Na + wba Nb)/8, wab = (Pb-Pa).Na, wba = (Pa-Pb).Nb
        const wab = ex*nax + ey*nay + ez*naz, wba = -(ex*nbx + ey*nby + ez*nbz);
        let dx = -(wab*nax + wba*nbx) / 8, dy = -(wab*nay + wba*nby) / 8, dz = -(wab*naz + wba*nbz) / 8;
        const dl = Math.hypot(dx, dy, dz), cap = Math.min(MAX_BULGE, Math.sqrt(ee) * 0.15);
        if (dl > cap) { const s = cap / dl; dx *= s; dy *= s; dz *= s; }
        mx += dx; my += dy; mz += dz;
        // PN quadratic normal: Na+Nb - v (Pb-Pa), v = 2 (Pb-Pa).(Na+Nb) / |Pb-Pa|^2
        const v = 2 * (ex*qx + ey*qy + ez*qz) / ee;
        qx -= v * ex; qy -= v * ey; qz -= v * ez;
      }
      let ql = Math.hypot(qx, qy, qz);
      if (!(ql > 1e-9)) { qx = nax; qy = nay; qz = naz; ql = Math.hypot(qx, qy, qz) || 1; }
      m = P.length / 3;
      P.push(mx, my, mz); N.push(qx / ql, qy / ql, qz / ql);
      C.push((C[a*3] + C[b*3]) / 2, (C[a*3+1] + C[b*3+1]) / 2, (C[a*3+2] + C[b*3+2]) / 2);
      if (M) M.push(M[a]);
      if (U) U.push((U[a*2] + U[b*2]) / 2, (U[a*2+1] + U[b*2+1]) / 2);
      if (LU) LU.push((LU[a*3] + LU[b*3]) / 2, (LU[a*3+1] + LU[b*3+1]) / 2, (LU[a*3+2] + LU[b*3+2]) / 2);
      mids.set(vk, m);
      return m;
    };
    const idx = [];
    for (let t = 0; t < tris; t++) {
      let a = I[t*3], b = I[t*3+1], c = I[t*3+2];
      let ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
      const k = (ab >= 0) + (bc >= 0) + (ca >= 0);
      if (k === 3) { idx.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca); continue; }
      if (k === 0) { idx.push(a, b, c); continue; }
      // rotate (a, b, c) so the split edges come first: one split -> ab; two -> ab and bc
      for (let r = 0; r < 3 && !(ab >= 0 && (k === 1 || bc >= 0)); r++) {
        const s = a; a = b; b = c; c = s;
        const sm = ab; ab = bc; bc = ca; ca = sm;
      }
      if (k === 1) idx.push(a, ab, c, ab, b, c);
      else idx.push(ab, b, bc, a, ab, bc, a, bc, c);
    }
    out.idx = idx;
    return out;
  }

  // ---- Car3D: the hero body pass, the garage hero copy, the modelled nose and duct parts ----
  // Two rounds, edges over 30 mm: ~85k triangles on the default body (tests/data/car-detail-tris.json).
  const HERO = Object.freeze({ levels: 2, minEdge: 0.03 });
  // LOFT UVS are recorded only for the TLX car-surface program (tsl-carsurf.js reads them from the trk attribute)
  // or when a test asks (opts.loftUv).
  function luvWanted(opts) {
    if (opts && opts.loftUv != null) return !!opts.loftUv;
    try { return typeof TLXCarSurf !== "undefined" && !!TLXCarSurf.enabled(); } catch (_) { return false; }
  }
  function loftTrk(out) {
    if (!out.luv) return out;
    luvPad(out, out.pos.length / 3);
    if (out.luv.length === out.pos.length) out.trk = out.luv;
    delete out.luv;
    return out;
  }
  // Car3D.build with opts.hero (b0: its build0): a field body, a silhouette or a seats build never takes the hero
  // pass (the plain detail build, as Car3D.build makes it); any throw falls back to today's detail-0 mesh.
  function build(b0, color, color2, opts) {
    const d = CarGeometry.clampDetail(opts.detail);
    const h = !(opts.field || opts.silhouette || opts.seats);
    if (!d && !h) return b0(color, color2, opts);
    try {
      return CarGeometry.withDetail(d, () => h ? body(b0(color, color2, opts), opts) : b0(color, color2, opts), h, h && luvWanted(opts));
    } catch (e) {
      Log.warn("car", "detail " + d + (h ? " hero" : "") + " build failed, detail 0: " + (e && e.message));
      return b0(color, color2, Object.assign({}, opts, { detail: 0, hero: false }));
    }
  }
  // The hero step, inside the withDetail span: the mark heroCopy keys on (refinish's copy keeps it; no renderer
  // reads it), then two refine rounds over the welded body unless the build is kept for refinish.
  function body(out, opts) {
    out._hero = true;
    if (!out._refinish && !out.parts && !opts.noWeld) { refine(out, HERO.levels, HERO.minEdge); loftTrk(out); }
    return out;
  }
  // THE GARAGE / CAR STUDIO HERO (js/garage/setup-camera.js): the turntable builds with refinish (a finish tap
  // re-finishes the kept arrays), which a refine would scramble, so the hero pass refines a welded COPY for the
  // upload and the kept build stays as it was. Car3D.heroCopy hands anything but a hero build back unchanged, and
  // this returns its argument on any throw.
  function copy(data) {
    if (!data || !data._hero || !data.pos || !data.idx) return data;
    try {
      const out = Object.assign({}, data, { pos: data.pos.slice(), nrm: data.nrm.slice(), col: data.col.slice(), mat: data.mat.slice(), idx: data.idx.slice() });
      if (data.luv) out.luv = data.luv.slice();
      delete out._refinish;
      CarGeometry.weld(out);
      CarGeometry.withDetail(2, () => refine(out, HERO.levels, HERO.minEdge), true);
      return loftTrk(out);
    } catch (e) {
      Log.warn("car", "garage hero copy failed, the plain build: " + (e && e.message));
      return data;
    }
  }
  // A pitot probe out of the nose tip and a telemetry antenna on the survival cell's deck, both rooted ON the nose
  // loft (anchors.noseAt) so they follow every team's nose. Generic, physics-free. K: Car3D's { G: its
  // CarGeometry kit, CARBON, DARK, mouth: addInletMouth } (K.S: Car3D.SURFACES, K.AXLES: Car3D.AXLES, filled here).
  function kit(K) { if (!K.S) { K.S = Car3D.SURFACES; K.AXLES = Car3D.AXLES; } }
  function nose(K, out, anchors, tipZ) {
    kit(K);
    const G = K.G, tip = anchors.noseAt(tipZ - 0.015), py = (tip.top + tip.bottom) / 2;
    G.addTube(out, [[0, py, tipZ - 0.03], [0, py, tipZ + 0.035]], 0.0045, 8, [0.30, 0.30, 0.33], K.S.metal);
    G.addTube(out, [[0, py, tipZ + 0.035], [0, py, tipZ + 0.06]], 0.0022, 6, [0.55, 0.55, 0.58], K.S.metal);
    const az = Math.min(1.35, tipZ - 0.35), deck = anchors.noseAt(az);
    G.addBox(out, 0, deck.top + 0.008, az, 0.016, 0.020, 0.030, K.CARBON, K.S.carbon);          // the antenna's foot
    G.addTube(out, [[0, deck.top + 0.012, az], [0, deck.top + 0.075, az - 0.012]], 0.0018, 6, K.DARK, K.S.carbon);
  }
  // The rear duct gets the front duct's throat too (its forward face, 0.06 x ductMul ahead).
  function duct(K, out, s, ductMul) {
    kit(K);
    K.mouth(out, s * 0.58, 0.30, K.AXLES.rearZ - 0.20 + 0.060 * ductMul, 0.05, 0.135 * ductMul, K.DARK, 0.040 * ductMul, 0);
  }

  // ---- CarWheels: the EXTREME (detail 2) centre-lock nut's hex crown, 6 mm proud of the block, six drive pegs ----
  function hub(G, S, out, hubX, dir, cy, cz, nS, nutCol) {
    const hx0 = hubX - dir * 0.002 + dir * 0.013, hx1 = hx0 + dir * 0.006, hR = nS * 0.46;
    for (let h = 0; h < 6; h++) {
      const a0 = (h / 6) * Math.PI * 2 + Math.PI / 6, a1 = ((h + 1) / 6) * Math.PI * 2 + Math.PI / 6;
      const P = (x, a) => [x, cy + hR * Math.cos(a), cz + hR * Math.sin(a)];
      G.addQuad(out, P(hx1, a0), P(hx1, a1), P(hx0, a1), P(hx0, a0), nutCol, S.metal);
      G.addTri(out, [hx1, cy, cz], P(hx1, a0), P(hx1, a1), nutCol, S.metal);
      const pa = (h / 6) * Math.PI * 2, pr = nS * 0.78;
      G.addBox(out, hx0 - dir * 0.004, cy + pr * Math.cos(pa), cz + pr * Math.sin(pa), 0.010, 0.008, 0.008,
               [nutCol[0] * 0.7, nutCol[1] * 0.7, nutCol[2] * 0.7], S.metal);
    }
  }

  // ---- CockpitRig: heroCar (boot-time) doubles the rig's round segments (its rigX), and the wheel and dash meshes
  // are welded and refined once (edges over 8 mm). ----
  function on() {
    try { return typeof CarGeometry !== "undefined" && !!CarGeometry.heroOn(); } catch (_) { return false; }
  }
  function rig(out) {
    try { CarGeometry.weld(out); refine(out, 1, 0.008); } catch (_) { /* keep the welded/plain rig */ }
    return out;
  }

  // ---- CarDraw: NEAR RIVAL FULL ATLASES (desktop EXTREME: liveryHi on, the player's detail 2, never a phone) ----
  // The nearest NEAR_FULL_MAX rivals inside NEAR_FULL_IN m of the eye have their OWN atlas (1024x1280, liveryHi)
  // upgraded in place to 2048x2560 through the player's deferred path (schedulePlayerHiRes: an idle-slot paint,
  // createImageBitmap, one upload, the 1024 freed after the next bind). A held rival past NEAR_FULL_OUT m
  // (hysteresis) or not drawn for NEAR_FULL_IDLE flushes is released: its atlas is dropped and its next draw
  // re-mints the 1024. Per frame: one release or one acquire, and no acquire while a rival upgrade is in flight,
  // so at most one rival atlas upload lands at a time. A full set yields its farthest only to a newcomer nearer
  // by 10 % in distance. Photo mode only releases (its rivals draw their ":P" previews).
  // MEMORY: 2048x2560 RGBA + mips = 27.96 MB against 6.99 MB at 1024x1280: +20.97 MB a held rival, +62.9 MB
  // for three, plus one 6.99 MB 1024 parked until the next bind during a swap. The LRU byte cap grows by the
  // same 62.9 MB while this is on (the planner's `b`), so the upgrade never evicts the field's own atlases.
  // K: CarDraw's { G, c: _decalTexCache, p: _hiResPending, s / k / t / n / m: the decal queue's _decalSetup /
  // _decalCockpit / _decalTeams / _decalNums / _decalMats, K: decalKeyFor, d: dropDecalTexture, h: schedulePlayerHiRes,
  // D: carDetail }.
  // Returns { m: the held map (dropDecalTexture deletes from it), b: the LRU allowance, plan(flushFrame, count) }.
  const NEAR_FULL_MAX = 3, NEAR_FULL_IN = 30, NEAR_FULL_OUT = 45, NEAR_FULL_IDLE = 120;
  const NEAR_FULL_EXTRA = Math.round(2048 * 2560 * 4 * 4 / 3) - Math.round(1024 * 1280 * 4 * 4 / 3);
  function nearAtlases(K) {
    const _nearFull = new Map();
    let _on = null;
    const self = { m: _nearFull, b: 0, plan };
    function nearFullOn() {
      if (_on === null) {
        try {
          _on = typeof LiveryTex !== "undefined" && !LiveryTex.IS_MOBILE && !LiveryTex.IS_PHONE && !!LiveryTex.liveryHi()
            && !!LiveryTex.playerHiResDeferred && LiveryTex.playerHiResDeferred(false) && K.D().player >= 2;
        } catch (_) { _on = false; }
        self.b = _on ? NEAR_FULL_MAX * NEAR_FULL_EXTRA : 0;
      }
      return _on;
    }
    function plan(_flushFrame, _decalCount) {
      if (!nearFullOn()) return;
      for (const [k, r] of _nearFull) {
        if (r.d2 > NEAR_FULL_OUT * NEAR_FULL_OUT || _flushFrame - r.f > NEAR_FULL_IDLE) { K.d(k); return; }
      }
      const eye = K.G.camEye;
      if (K.G.photoMode || !eye) return;
      let best = -1, bestD2 = NEAR_FULL_IN * NEAR_FULL_IN, bestKey = null;
      for (let i = 0; i < _decalCount; i++) {
        if (K.s[i] || K.k[i]) continue;   // the player's own car has its own 2048
        const key = K.K(K.t[i], K.n[i], false);
        const m = K.m[i], dx = m[12] - eye[0], dy = m[13] - eye[1], dz = m[14] - eye[2], d2 = dx * dx + dy * dy + dz * dz;
        const rec = _nearFull.get(key);
        if (rec) { rec.f = _flushFrame; rec.d2 = d2; continue; }
        if (d2 < bestD2 && K.c[key]) { best = i; bestD2 = d2; bestKey = key; }
      }
      if (best < 0) return;
      for (const k of _nearFull.keys()) if (K.p.has(k)) return;
      if (_nearFull.size >= NEAR_FULL_MAX) {
        let far = null, farD2 = -1;
        for (const [k, r] of _nearFull) if (r.d2 > farD2) { farD2 = r.d2; far = k; }
        if (far !== null && bestD2 < farD2 * 0.81) K.d(far);   // the newcomer takes the slot next frame
        return;
      }
      _nearFull.set(bestKey, { f: _flushFrame, d2: bestD2 });
      K.h(K.t[best], K.n[best], bestKey, true);
    }
    return self;
  }

  // The shared body is built once with red/green standing for its two paint colours.
  // Vertex clustering averages these weights along with the neutral carbon/metal shades.
  // Reuse its positions, normals and indices for every palette; no per-rival car build or decal.
  function rivalPalettes(gfx, putBoundedMesh) {
    const templates = [], meshes = [], orders = [], keys = new WeakMap();
    const grey = [0.72, 0.72, 0.72];
    function upload(geometry, primary, secondary) {
      const source = geometry.col, col = new Float32Array(source.length);
      for (let i = 0; i < col.length; i += 3) {
        const base = Math.min(source[i], source[i + 1], source[i + 2]);
        const p = source[i] - base, q = source[i + 1] - base;
        for (let k = 0; k < 3; k++) col[i + k] = base + p * primary[k] + q * secondary[k];
      }
      return gfx.createMesh({ ...geometry, col });
    }
    function neutral(geometry, far) {
      const mesh = upload(geometry, grey, grey);
      const level = far ? 1 : 0;
      templates[level] = geometry;
      meshes[level] = Object.create(null);
      orders[level] = [];
      return mesh;
    }
    function painted(far, livery) {
      const level = far ? 1 : 0, cache = meshes[level];
      let key = keys.get(livery);
      if (!key) { key = livery.c1.join(",") + ":" + livery.c2.join(","); keys.set(livery, key); }
      return putBoundedMesh(cache, orders[level], key, () => upload(templates[level], livery.c1, livery.c2), 32);
    }
    function clear() {
      for (const cache of meshes) {
        if (cache && gfx.freeMesh) for (const mesh of Object.values(cache)) gfx.freeMesh(mesh);
      }
    }
    return { neutral, painted, clear };
  }

  return Object.freeze({ box, rod, arm, web, loftUv, luvLerp, bevel, weld, refine, MAX_BULGE, HERO, build, copy,
                         nose, duct, hub, on, rig, nearAtlases, rivalPalettes });
})();
if (typeof window !== "undefined") window.CarHero = CarHero;
