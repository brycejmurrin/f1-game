"use strict";
/* Apex 26 — CAR SHADE: rounded body sections and smooth shading for the
 * procedural car (js/car/car3d.js). ON by default (2026-10-02); Car3D.build calls in.
 *
 * WHY. Every body part was a trapezoid loft (car3d frame()/addBlock): four
 * flat faces, a 90 degree crease at each corner, and a flat normal on every
 * triangle. The nose, tub and deck read as boxes, and the many-station
 * sidepod and wing lofts read as facets. Two fixes, both here:
 *
 *   ROUNDED SECTIONS (loft): the same {z, y, w, h, t, x} station a span
 *   already takes, swept as a superellipse instead of a trapezoid. The
 *   ENVELOPE is the trapezoid's: the top and bottom centres and the flank at
 *   mid-height are exactly where the flat faces were, so a stripe, number or
 *   light placed on a panel centre still sits on the skin. Only the corners
 *   pull in.
 *
 *   SMOOTH SHADING (smooth): after the build, vertices at the same position
 *   and surface average the normals of the faces that meet there within a
 *   crease angle. A shallow facet (a loft station, a tube side, a ring step)
 *   shades round; a real edge (a box corner, a wing trailing edge) stays
 *   sharp. Normals only: no vertex moves, so every placement datum holds.
 *
 *   ROUNDED SIDEPODS (podLoft): the same seven pod stations, with the two
 *   OUTER corners rounded (top and underside); the flank stays flat where the
 *   sponsor decal and flank details sit.
 *
 *   SHADED TYRE SHOULDERS (vertexNormals): the tread's ring normals were
 *   purely radial, so its rounded shoulder never caught the light; they now
 *   come from the tread's real shape. No vertex moves.
 *
 *   SMALL PARTS (skin/pipe/strut/block/...): struts with a lens or ellipse
 *   section (wishbones, halo pillar, nose pylons, every beam), rounded blocks
 *   (bolsters, airbox, brake ducts, exhaust core), and shaped plates (floor,
 *   rear-wing endplates, diffuser tunnels, cockpit tub, headrest). Each keeps
 *   the envelope of the box it replaces where something is placed against it.
 *
 * THE SWITCH. `apex26.carSmooth` in storage, or `?carsmooth=` in the URL
 * (the URL wins for that page load): "1" / "all" for every car, a team id
 * ("mclaren") for that team's car only, "0" / "off" for none. Nothing chosen
 * is the DEFAULT, every car (it shipped opt-in first, A/B'd live, and turned
 * on 2026-10-02), so an opt-out is stored as "0" rather than removed. Read
 * once per page; set() saves it (the meshes rebuild on the next page load).
 */
const CarShade = (function () {
  const KEY = "apex26.carSmooth";
  const DEFAULT = "*";
  let _pref;   // undefined = not read yet; null = off; "*" = every car; else a team id

  function norm(v) {
    const s = v == null ? "" : String(v).trim().toLowerCase();
    if (!s) return DEFAULT;   // nothing chosen
    if (s === "1" || s === "all" || s === "on" || s === "true") return "*";
    if (s === "0" || s === "off" || s === "false") return null;
    return /^[a-z0-9_-]{1,40}$/.test(s) ? s : DEFAULT;
  }
  function pref() {
    if (_pref !== undefined) return _pref;
    let v = null;
    try {
      const q = typeof location !== "undefined" && location.search ? new URLSearchParams(location.search) : null;
      if (q && q.has("carsmooth")) v = q.get("carsmooth");
      else if (typeof localStorage !== "undefined") v = localStorage.getItem(KEY);
    } catch (_) { v = null; }
    _pref = norm(v);
    return _pref;
  }
  /** Set the switch ("1", a team id, "0" for off, or null/"" back to the
   *  default) and save it. Returns what took effect. */
  function set(v) {
    _pref = norm(v);
    const empty = v == null || !String(v).trim();
    try {
      if (typeof localStorage !== "undefined") {
        if (empty) localStorage.removeItem(KEY);
        else localStorage.setItem(KEY, _pref === "*" ? "1" : _pref || "0");
      }
    } catch (_) { /* storage refused: live for this page only */ }
    return _pref;
  }
  /** Is it on for this team's car? */
  function on(teamId) { const p = pref(); return p === "*" || (!!p && p === teamId); }
  /** On for ANY car: wheels are built and cached apart from teams, so they follow the switch whenever it is on. */
  function any() { return !!pref(); }

  // Points round a ROUNDED TRAPEZOID: |u|^p + |v|^p = 1, then the half-width
  // tapers from w/2 at the bottom to t*w/2 at the top exactly as frame() does.
  // Counter-clockwise seen from +Z, starting at the right flank (mid-height).
  const RING_N = 24, EXP = 3;
  // The UPPER half is squarer (EXP_TOP): a real nose and tub are flat-topped with
  // rounded shoulders, and one exponent everywhere read as a round "cigar" nose
  // (2026-10-02 review). The underside keeps EXP. Both halves meet at the flank
  // (u = ±1, v = 0), so the section stays closed and the envelope is unchanged;
  // the sharpest step at 24 points is ~29°, inside smooth()'s 55° crease.
  const EXP_TOP = 6;
  // One point of the section at angle `a` (0 = right flank, pi/2 = top centre).
  function ringAt(f, a, p, pt) {
    const x0 = f.x || 0, hw = f.w / 2, hh = f.h / 2, t = f.t !== undefined ? f.t : 1;
    const snap = (x) => (Math.abs(x) < 1e-9 ? 0 : x);   // cos(pi/2) is 6e-17, not 0
    const c = snap(Math.cos(a)), s = snap(Math.sin(a)), e = 2 / (s > 0 ? pt : p);
    const u = Math.sign(c) * Math.pow(Math.abs(c), e), v = Math.sign(s) * Math.pow(Math.abs(s), e);
    return [x0 + u * hw * (1 + (t - 1) * (v + 1) / 2), f.y + v * hh, f.z];
  }
  function ring(f, n, p, pt) {
    n = n || RING_N; p = p || EXP; pt = pt || EXP_TOP;
    const pts = [];
    for (let i = 0; i < n; i++) pts.push(ringAt(f, (i / n) * Math.PI * 2, p, pt));
    return pts;
  }
  /** How far the rounded top has fallen at half-width `halfW` of a car3d nose
   *  anchor ({top, bottom, topSide}): sink a flat plate this much and its edges
   *  sit on the skin instead of floating over the shoulder. */
  function sink(st, halfW) {
    const k = Math.min(1, Math.abs(halfW) / st.topSide), hh = (st.top - st.bottom) / 2;
    return hh * (1 - Math.pow(1 - Math.pow(k, EXP_TOP), 1 / EXP_TOP));
  }
  /** A livery cap over the rounded nose: the body section at each end, grown by
   *  the cap's own margin, so it wraps the nose instead of poking square corners
   *  past it. `front`/`rear` are the cap's span stations; `nf`/`nr` the nose
   *  anchors there (their topSide/side ratio is the nose's taper). */
  function capLoft(out, front, rear, nf, nr, col, tri) {
    loft(out, Object.assign({}, front, { t: nf.topSide / nf.side }), Object.assign({}, rear, { t: nr.topSide / nr.side }), col, tri);
  }
  /** Loft `front` to `rear` (car3d span stations) with rounded sections and
   *  both ends capped. `tri(out, a, b, c, col, surface)` is car3d's addTri;
   *  opts.frontCol paints the front (+Z) cap (an intake mouth), opts.surface
   *  overrides the surface id. */
  function loft(out, front, rear, col, tri, opts) {
    const n = (opts && opts.n) || RING_N, p = (opts && opts.p) || EXP, pt = (opts && opts.pt) || EXP_TOP;
    const sf = opts && opts.surface, fc = (opts && opts.frontCol) || col;
    const F = ring(front, n, p, pt), R = ring(rear, n, p, pt);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      tri(out, F[i], R[i], R[j], col, sf);
      tri(out, F[i], R[j], F[j], col, sf);
    }
    const cf = [front.x || 0, front.y, front.z], cr = [rear.x || 0, rear.y, rear.z];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      tri(out, cf, F[i], F[j], fc, sf);   // +Z
      tri(out, cr, R[j], R[i], col, sf);  // -Z
    }
  }

  // ---- SMALL PARTS (2026-10-02, batch 3): struts, rounded blocks, plates ----
  // The body sections above were rounded first; what still read as boxes were
  // the parts hung off them — wishbones, halo pillar, mirrors, airbox, floor,
  // endplates. Each helper below takes car3d's own datums (its corners, its
  // stations, its addTri) and keeps their ENVELOPE, so a decal, light or part
  // placed against the old box still lands on the new skin.
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const crs = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const len = (a) => Math.hypot(a[0], a[1], a[2]);
  const unit = (a) => { const l = len(a); return l > 1e-9 ? [a[0] / l, a[1] / l, a[2] / l] : null; };
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const mid = (r) => r.reduce((m, p) => [m[0] + p[0] / r.length, m[1] + p[1] / r.length, m[2] + p[2] / r.length], [0, 0, 0]);
  function newell(r) {   // polygon normal, length = twice its area
    const N = [0, 0, 0];
    for (let i = 0; i < r.length; i++) {
      const a = r[i], b = r[(i + 1) % r.length];
      N[0] += (a[1] - b[1]) * (a[2] + b[2]); N[1] += (a[2] - b[2]) * (a[0] + b[0]); N[2] += (a[0] - b[0]) * (a[1] + b[1]);
    }
    return N;
  }
  // A triangle with no area would carry a zero normal (and fail every
  // unit-normal check downstream), so it is never emitted.
  function face(out, a, b, c, col, tri, sf) {
    if (len(crs(sub(b, a), sub(c, a))) > 1e-12) tri(out, a, b, c, col, sf);
  }
  /** Ear-clip a simple planar polygon (convex or not: a C, an arch) into
   *  index triples wound like the polygon. */
  function earcut(r) {
    const N = newell(r), A = N.map(Math.abs);
    const ax = A[0] >= A[1] ? (A[0] >= A[2] ? 0 : 2) : (A[1] >= A[2] ? 1 : 2), sg = N[ax] >= 0 ? 1 : -1;
    const P = r.map((p) => [p[(ax + 1) % 3], p[(ax + 2) % 3] * sg]), idx = r.map((_, i) => i), tris = [];
    const cr = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const same = (a, b) => Math.abs(a[0] - b[0]) < 1e-12 && Math.abs(a[1] - b[1]) < 1e-12;
    while (idx.length > 3) {
      const n = idx.length;
      let cut = 0;
      for (let k = 0; k < n; k++) {
        const a = P[idx[(k + n - 1) % n]], b = P[idx[k]], c = P[idx[(k + 1) % n]];
        if (cr(a, b, c) <= 1e-14) continue;   // reflex (or flat): not an ear
        const blocked = idx.some((m) => { const q = P[m];
          return !same(q, a) && !same(q, b) && !same(q, c) && cr(a, b, q) > 1e-14 && cr(b, c, q) > 1e-14 && cr(c, a, q) > 1e-14; });
        if (!blocked) { cut = k; break; }
      }
      tris.push([idx[(cut + n - 1) % n], idx[cut], idx[(cut + 1) % n]]);
      idx.splice(cut, 1);
    }
    tris.push(idx);
    return tris;
  }
  /** Loft closed rings (equal counts, any one winding) into a skin that faces
   *  OUT, both ends capped by earcut. o: {frontCol (rings[0]'s cap),
   *  caps: false, segCol(i) (colour of the strip from ring point i to i+1)}. */
  function skin(out, rings, col, tri, sf, o) {
    o = o || {};
    const n = rings[0].length, last = rings.length - 1;
    // Directions are LOCAL (ring 0 -> 1, last-1 -> last): a path that bends
    // back on itself (the headrest's U) has its ends side by side.
    const d0 = sub(mid(rings[1]), mid(rings[0])), d1 = sub(mid(rings[last]), mid(rings[last - 1]));
    const flip = dot(newell(rings[0]), d0) > 0;   // the rings wind the other way round the loft
    for (let r = 0; r < last; r++) {
      const F = rings[r], R = rings[r + 1];
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n, c = o.segCol ? o.segCol(i) : col;
        if (flip) { face(out, F[i], R[j], R[i], c, tri, sf); face(out, F[i], F[j], R[j], c, tri, sf); }
        else { face(out, F[i], R[i], R[j], c, tri, sf); face(out, F[i], R[j], F[j], c, tri, sf); }
      }
    }
    if (o.caps === false) return;
    const cap = (ring, c, d) => {   // the cap faces along d
      const keep = dot(newell(ring), d) > 0;
      for (const [a, b, e] of earcut(ring)) face(out, ring[a], keep ? ring[b] : ring[e], keep ? ring[e] : ring[b], c, tri, sf);
    };
    cap(rings[0], o.frontCol || col, d0.map((v) => -v));
    cap(rings[last], col, d1);
  }
  /** Unit superellipse, n points CCW from (1, 0): exponent pPos where v > 0, pNeg below. */
  function sect(n, pPos, pNeg) {
    const pts = [];
    for (let i = 0; i < n; i++) {
      const p = ringAt({ y: 0, z: 0, w: 2, h: 2 }, (i / n) * Math.PI * 2, pNeg, pPos);
      pts.push([p[0], p[1]]);
    }
    return pts;
  }
  /** Sweep a superellipse section along a polyline, OUT-facing and capped.
   *  The CHORD lies along `up` (default +Z, the airstream) squared to the
   *  path and carried along it, the THICKNESS across; both may taper end to
   *  end. o: {chord, thick, chord1, thick1, n (8), p (2: an ellipse), pt
   *  (the +thick half; default p), up, frontCol, caps}. */
  function pipe(out, path, col, tri, sf, o) {
    const n = o.n || 8, S = sect(n, o.pt || o.p || 2, o.p || 2), L = [0];
    for (let i = 1; i < path.length; i++) L.push(L[i - 1] + len(sub(path[i], path[i - 1])));
    const tot = L[L.length - 1] || 1, c1 = o.chord1 != null ? o.chord1 : o.chord, t1 = o.thick1 != null ? o.thick1 : o.thick;
    const off = (U, T) => unit(sub(U, T.map((x) => x * dot(U, T))));
    let U = o.up || [0, 0, 1];
    const rings = path.map((p, i) => {
      const T = unit(sub(path[Math.min(path.length - 1, i + 1)], path[Math.max(0, i - 1)])) || [0, 0, 1];
      U = off(U, T) || off([0, 1, 0], T) || off([1, 0, 0], T);
      const V = crs(T, U), f = L[i] / tot;
      const ch = (o.chord + (c1 - o.chord) * f) / 2, th = (o.thick + (t1 - o.thick) * f) / 2;
      return S.map(([u, v]) => [0, 1, 2].map((k) => p[k] + U[k] * u * ch + V[k] * v * th));
    });
    skin(out, rings, col, tri, sf, o);
  }
  /** A STRUT from p0 to p1: pipe() on one segment, o.taper scaling the far end. */
  function strut(out, p0, p1, chord, thick, col, tri, sf, o) {
    o = o || {};
    const k = o.taper == null ? 1 : o.taper;
    pipe(out, [p0, p1], col, tri, sf, Object.assign({}, o, { chord, thick, chord1: chord * k, thick1: thick * k }));
  }
  /** Catmull-Rom through a polyline, k points per segment: original point i
   *  lands at index k * (i - from), so it still marks what it marked. `from`
   *  and `to` take a run of the points while the curve keeps bending with the
   *  neighbours outside it (a co-axial fairing over part of the halo). */
  function fine(path, k, from, to) {
    from = from || 0; to = to == null ? path.length : to;
    const last = path.length - 1;
    const P = (i) => (i < 0 ? mix(path[0], path[1], -1) : i > last ? mix(path[last], path[last - 1], -1) : path[i]);
    const pts = [];
    for (let i = from; i < to - 1; i++) {
      const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
      for (let j = 0; j < k; j++) {
        const t = j / k, t2 = t * t, t3 = t2 * t;
        pts.push([0, 1, 2].map((a) => 0.5 * (2 * p1[a] + (p2[a] - p0[a]) * t +
          (2 * p0[a] - 5 * p1[a] + 4 * p2[a] - p3[a]) * t2 + (3 * p1[a] - p0[a] - 3 * p2[a] + p3[a]) * t3)));
      }
    }
    pts.push(path[to - 1].slice());
    return pts;
  }
  // Corner radii as edge FRACTIONS [toward the previous corner, toward the
  // next] (<= 0.5), measured on one quad and reused on its partner so both
  // ends of a loft get the same point count. Infinity rounds all the way.
  function fracs(q, r) {
    const R = Array.isArray(r) ? r : [r, r, r, r];
    return q.map((B, k) => [Math.min(0.5, (R[k] || 0) / (len(sub(q[(k + 3) % 4], B)) || 1)),
                            Math.min(0.5, (R[k] || 0) / (len(sub(q[(k + 1) % 4], B)) || 1))]);
  }
  /** A quad with its corners rounded: a quadratic arc through each corner
   *  (seg steps); where two arcs meet mid-edge the point is emitted once. */
  function rquad(q, fr, seg) {
    const pts = [];
    for (let k = 0; k < 4; k++) {
      const A = q[(k + 3) % 4], B = q[k], C = q[(k + 1) % 4], [fa, fc] = fr[k];
      if (!(fa > 0) && !(fc > 0)) { pts.push(B.slice()); continue; }
      const p0 = mix(B, A, fa), p2 = mix(B, C, fc), meets = fc >= 0.5 - 1e-9 && fr[(k + 1) % 4][0] >= 0.5 - 1e-9;
      for (let j = 0; j <= seg - (meets ? 1 : 0); j++) { const t = j / seg; pts.push(mix(mix(p0, B, t), mix(B, p2, t), t)); }
    }
    return pts;
  }
  /** car3d's addBlock (8 corners, q[0..3] the +Z end) with the section's
   *  corners rounded: o.r metres, one number or one per corner, default
   *  Infinity — a smooth section through the four edge MIDPOINTS, so every
   *  flat face's centre line stays where it was. o.frontCol paints q[0..3]'s cap. */
  function block(out, q, col, tri, sf, o) {
    o = o || {};
    const a = q.slice(0, 4), b = q.slice(4, 8), fr = fracs(a, o.r == null ? Infinity : o.r), seg = o.seg || 3;
    skin(out, [rquad(a, fr, seg), rquad(b, fr, seg)], col, tri, sf, o);
  }
  /** addBox's numbers as a rounded block lofted along z (corners rounded in x-y). */
  function box(out, cx, cy, cz, sx, sy, sz, col, tri, sf, o) {
    const x0 = cx - sx / 2, x1 = cx + sx / 2, y0 = cy - sy / 2, y1 = cy + sy / 2, zf = cz + sz / 2, zr = cz - sz / 2;
    block(out, [[x0, y0, zf], [x1, y0, zf], [x1, y1, zf], [x0, y1, zf],
                [x0, y0, zr], [x1, y0, zr], [x1, y1, zr], [x0, y1, zr]], col, tri, sf, o);
  }
  /** addBox's own signature, rounded — a one-line swap at the call site:
   *  `(_round ? CarShade.boxFn(addTri, o) : addBox)(out, cx, ...)`. */
  function boxFn(tri, o) { return (out, cx, cy, cz, sx, sy, sz, col, sf) => box(out, cx, cy, cz, sx, sy, sz, col, tri, sf, o); }
  /** addBlock's signature, rounded (o as block()). */
  function blockFn(tri, o) { return (out, q, col, colFront, sf) => block(out, q, col, tri, sf, Object.assign({ frontCol: colFront }, o)); }

  /** A MIRROR HOUSING from car3d's addBlock corners (q[0], q[1]: the back
   *  face's inboard and outboard bottom, q[3] inboard top, q[4], q[5] the front
   *  face): lofted along x, a flat back for the glass and a rounded nose, the
   *  toe (outboard end swept forward) kept, both ends drawn in. The outboard
   *  end still sits at the old x across mid-height, where the mirror light
   *  anchors (car3d mirrorLightAnchors). */
  function housing(out, q, col, tri, sf) {
    const S = sect(12, 6, 2.6), y0 = q[0][1], y1 = q[3][1];
    skin(out, [[0, 0.80], [0.14, 1], [0.86, 1], [1, 0.90]].map(([f, k]) => {
      const x = q[0][0] + (q[1][0] - q[0][0]) * f;
      const zb = q[0][2] + (q[1][2] - q[0][2]) * f, zf = q[4][2] + (q[5][2] - q[4][2]) * f;
      const cy = (y0 + y1) / 2, hy = (y1 - y0) / 2 * k, cz = (zb + zf) / 2, hz = (zf - zb) / 2 * k;
      return S.map(([u, v]) => [x, cy + u * hy, cz - v * hz]);   // v > 0 is the flat back (-z)
    }), col, tri, sf);
  }
  /** The COCKPIT TUB beside and under the opening (car3d buildSharedChassis):
   *  per station the ring() of the rail trapezoid — bottom w/2, top at the RAIL
   *  top — with the opening (|x| < open above the seat floor) cut out of it, a
   *  C, lofted and capped. It replaces the tub-under-the-seat span and the two
   *  square rails, which stood 4-5 cm proud of the rounded monocoque where the
   *  opening starts. The top half is flatter (exponent 10) so the coaming sits
   *  on the rail. st: {z, y, w, h, t (at the rail top), open, rail}. */
  function cTub(out, stations, floorY, col, tri) {
    const M = 22, PT = 10;
    skin(out, stations.map((st) => {
      const bot = st.y - st.h / 2, f = { z: st.z, y: (bot + st.rail) / 2, w: st.w, h: st.rail - bot, t: st.t };
      let lo = 0, hi = Math.PI / 2;   // where the rail top meets the opening: x falls from flank to top centre
      for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (ringAt(f, m, EXP, PT)[0] > st.open) lo = m; else hi = m; }
      const pts = [];
      for (let i = 0; i < M; i++) pts.push(ringAt(f, Math.PI - lo + (i / (M - 1)) * (Math.PI + 2 * lo), EXP, PT));
      // The seat floor (car3d's dark floor loft) tops out AT floorY: 2 mm under it, or the two z-fight.
      return pts.concat([[st.open, floorY - 0.002, st.z], [-st.open, floorY - 0.002, st.z]]);
    }), col, tri);
  }
  /** The FLOOR as a plan shape instead of CHASSIS.floor's 1.5 x 3.2 m box,
   *  which ran ~20 cm past the edge rail at the rear and straight through the
   *  rear tyres: half-width edgeAt(z) (car3d floorEdgeAt, the rails' own line),
   *  rounded front corners, and held inboard of the rear tyre's inner face
   *  (x 0.57) over its length. Same datum: fl's front, rear, thickness. */
  function floor(out, fl, cy, edgeAt, col, tri, sf) {
    const zF = fl.cz + fl.sz / 2, zR = fl.cz - fl.sz / 2, y0 = cy - fl.sy / 2, y1 = cy + fl.sy / 2, R = 0.15, TYRE = 0.555;
    const cap = (z) => (z < -1.30 ? TYRE : z < -1.15 ? TYRE + (z + 1.30) / 0.15 * 0.15 : Infinity);
    const hw = (z) => Math.min(edgeAt(z), cap(z)) - (z > zF - R ? R - Math.sqrt(Math.max(0, R * R - (z - zF + R) ** 2)) : 0);
    const zs = [0, 1, 2, 3, 4].map((k) => zF - R * (1 - Math.cos(k * Math.PI / 8)))
      .concat([0.78, 0.40, 0, -0.40, -0.80, -1.15, -1.30, -1.60, zR]).filter((z) => z <= zF && z >= zR);
    const S = zs.sort((a, b) => b - a).map((z) => [z, hw(z)]);
    const q = (a, b, c, d, want) => {   // a quad facing `want`
      const k = dot(crs(sub(b, a), sub(c, a)), want) < 0;
      face(out, a, k ? c : b, k ? b : c, col, tri, sf); face(out, a, k ? d : c, k ? c : d, col, tri, sf);
    };
    for (let i = 0; i < S.length - 1; i++) {
      const [za, ha] = S[i], [zb, hb] = S[i + 1];
      q([-ha, y1, za], [ha, y1, za], [hb, y1, zb], [-hb, y1, zb], [0, 1, 0]);
      q([-ha, y0, za], [ha, y0, za], [hb, y0, zb], [-hb, y0, zb], [0, -1, 0]);
      for (const s of [-1, 1]) q([s * ha, y0, za], [s * ha, y1, za], [s * hb, y1, zb], [s * hb, y0, zb], [s * (za - zb), 0, hb - ha]);
    }
    const [zf0, hf] = S[0], [zr0, hr] = S[S.length - 1];
    q([-hf, y0, zf0], [hf, y0, zf0], [hf, y1, zf0], [-hf, y1, zf0], [0, 0, 1]);
    q([-hr, y0, zr0], [hr, y0, zr0], [hr, y1, zr0], [-hr, y1, zr0], [0, 0, -1]);
  }
  /** A REAR-WING ENDPLATE (car3d endplateGeom `ep`, side s): the plate as an
   *  outline with rounded corners — the big radii low, where the wing is not,
   *  so it stops reading as a slab down to the diffuser — 33 mm thick, and its
   *  accent crown swept over the top edge and round both top corners. Kept: the
   *  number board's footprint (z -2.27..-2.57, its bottom 5 cm up), the outer
   *  face the board sits on (x 0.521), the rear face across y 0.62 at every
   *  level (the endplate light), and the crown's height (the flap tips). */
  function endplate(out, ep, s, col, crownCol, crownSurf, tri) {
    const X0 = 0.488, X1 = 0.521, f = ep.front, r = ep.rear, seg = 4;
    const q = (x, e) => [[s * x, f.bottom, f.z - e], [s * x, f.top, f.z - e], [s * x, r.top, r.z + e], [s * x, r.bottom, r.z + e]];
    // Radii front-bottom, front-top, rear-top, rear-bottom: the last stays under 78 mm,
    // or at level 4 (plate bottom 0.525) the light's lower edge (0.603) falls off the rear face.
    const fr = fracs(q(X1, 0), [0.10, 0.07, 0.04, 0.07]), CT = 0.018;
    skin(out, [rquad(q(X1, 0), fr, seg), rquad(q(X0, 0), fr, seg)], col, tri);
    // The crown straddles the top edge as the flat strip did (y top +- 9 mm), its
    // ends inset half its thickness so they finish flush with the plate's edges.
    pipe(out, rquad(q((X0 + X1) / 2, CT / 2), fr, seg).slice(seg + 1, 3 * (seg + 1)), crownCol, tri, crownSurf,
         { chord: 0.046, thick: CT, n: 6, p: 4, up: [1, 0, 0] });
  }
  /** One DIFFUSER TUNNEL (side s): the ramped ceiling and the outer wall car3d
   *  drew as two flat slabs, as ONE curved shell — the roof turns down into
   *  the wall through a radius of 0.4 x the tunnel's smaller dimension —
   *  ramping from the throat (z -1.95) to the exit (z -2.52). Inner face in
   *  `inCol`, the outside in `col`; the strakes inside still clear the roof. */
  function tunnel(out, s, keel, thr, exitHalf, yFloor, yThroat, yExit, inCol, col, tri, sf) {
    const T = 0.03, seg = 5, m = seg + 3;
    const ring = (z, xo, yc) => {
      const A = [s * keel, yc], B = [s * xo, yc], C = [s * xo, yFloor], r = 0.4 * Math.min(xo - keel, yc - yFloor);
      const p0 = [B[0] - s * r, yc], p2 = [B[0], yc - r], P = [A];
      for (let j = 0; j <= seg; j++) { const t = j / seg, u = 1 - t; P.push([u * u * p0[0] + 2 * u * t * B[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * B[1] + t * t * p2[1]]); }
      P.push(C);
      const Q = P.map((p, i) => {   // the outer skin: T out along the profile's normal (up on the roof, outboard on the wall)
        const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
        return [p[0] - s * T * dy / l, p[1] + s * T * dx / l];
      });
      return P.concat(Q.reverse()).map(([x, y]) => [x, y, z]);
    };
    skin(out, [ring(-1.95, thr, yThroat), ring(-2.52, exitHalf, yExit)], col, tri, sf, { segCol: (i) => (i < m - 1 ? inCol : col) });
  }
  /** The HEADREST: a horseshoe pad round the back of the helmet (car3d draws
   *  the head at (0, 0.715, -0.075), r 0.145), sitting on the cockpit coaming
   *  — where a dark 0.60 m bar crossed the car at helmet height, 11 cm over the
   *  bolsters and through the back of the head. */
  function headrest(out, col, tri, sf) {
    const half = [[0.205, 0.640, 0.02], [0.208, 0.650, -0.08], [0.196, 0.660, -0.17], [0.150, 0.666, -0.245], [0.078, 0.669, -0.285]];
    const path = half.map(([x, y, z]) => [-x, y, z]).concat([[0, 0.670, -0.298]], half.slice().reverse());
    pipe(out, fine(path, 2), col, tri, sf, { chord: 0.075, thick: 0.055, n: 8, p: 2.5, up: [0, 1, 0] });
  }

  // A SIDEPOD section (car3d sidepodStations: inner/outer x, bottom/top y at
  // each edge) with its two OUTER corners rounded. The radii bite mostly into
  // the top and the underside and only the outer 12 % / 10 % of the flank, so
  // the flank decal (32-80 % of its height, js/car/car-mesh.js podDecal) and
  // every flank detail stay on flat skin; parts that sit on the pod top near
  // its edge (ERS intakes, chimneys, ducts: 8-18 mm proud) see the surface
  // drop by under 1 cm. CCW seen from +Z for either side.
  const POD_ARC = 4;
  function podRing(st, side) {
    const w = st.outer - st.inner, hO = st.outerTop - st.outerBottom;
    const rxT = Math.min(0.07, 0.25 * w), ryT = Math.min(0.05, 0.12 * hO);
    const rxB = Math.min(0.06, 0.22 * w), ryB = Math.min(0.035, 0.10 * hO);
    const pts = [[st.inner, st.innerBottom]];
    for (let k = 0; k <= POD_ARC; k++) {   // underside -> flank
      const a = -Math.PI / 2 + (k / POD_ARC) * Math.PI / 2;
      pts.push([st.outer - rxB + rxB * Math.cos(a), st.outerBottom + ryB + ryB * Math.sin(a)]);
    }
    for (let k = 0; k <= POD_ARC; k++) {   // flank -> top
      const a = (k / POD_ARC) * Math.PI / 2;
      pts.push([st.outer - rxT + rxT * Math.cos(a), st.outerTop - ryT + ryT * Math.sin(a)]);
    }
    pts.push([st.inner, st.innerTop]);
    const ring = pts.map(([x, y]) => [side * x, y, st.z]);
    return side < 0 ? ring.reverse() : ring;
  }
  /** Loft closed rings front -> rear (each CCW from +Z, same count), capped:
   *  the front cap in `frontCol`, the rear in `col`. */
  function loftRings(out, rings, col, frontCol, tri) {
    const n = rings[0].length;
    for (let r = 0; r < rings.length - 1; r++) {
      const F = rings[r], R = rings[r + 1];
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        tri(out, F[i], R[i], R[j], col);
        tri(out, F[i], R[j], F[j], col);
      }
    }
    const cap = (ring, c, flip) => {
      const m = [0, 0, 0];
      for (const p of ring) { m[0] += p[0] / n; m[1] += p[1] / n; m[2] += p[2] / n; }
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        if (flip) tri(out, m, ring[j], ring[i], c); else tri(out, m, ring[i], ring[j], c);
      }
    };
    cap(rings[0], frontCol || col, false);
    cap(rings[rings.length - 1], col, true);
  }
  /** Both sidepods from car3d's station list, rounded. */
  function podLoft(out, stations, col, frontCol, tri) {
    for (const side of [-1, 1]) loftRings(out, stations.map((st) => podRing(st, side)), col, frontCol, tri);
  }

  /** Smooth vertex normals from the faces of an INDEXED vertex range [from, to):
   *  the tyre tread, whose ring normals were purely radial, so its rounded
   *  shoulder never caught the light. Only triangles wholly inside the range. */
  function vertexNormals(out, from, to) {
    const P = out.pos, N = out.nrm, I = out.idx, acc = new Float64Array((to - from) * 3);
    for (let t = 0; t + 2 < I.length; t += 3) {
      const a = I[t], b = I[t + 1], c = I[t + 2];
      if (a < from || a >= to || b < from || b >= to || c < from || c >= to) continue;
      const ux = P[b * 3] - P[a * 3], uy = P[b * 3 + 1] - P[a * 3 + 1], uz = P[b * 3 + 2] - P[a * 3 + 2];
      const wx = P[c * 3] - P[a * 3], wy = P[c * 3 + 1] - P[a * 3 + 1], wz = P[c * 3 + 2] - P[a * 3 + 2];
      const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;   // area-weighted
      for (const v of [a, b, c]) { const k = (v - from) * 3; acc[k] += nx; acc[k + 1] += ny; acc[k + 2] += nz; }
    }
    for (let v = from; v < to; v++) {
      const k = (v - from) * 3, l = Math.hypot(acc[k], acc[k + 1], acc[k + 2]);
      if (l > 0) { N[v * 3] = acc[k] / l; N[v * 3 + 1] = acc[k + 1] / l; N[v * 3 + 2] = acc[k + 2] / l; }
    }
  }
  // ---- UPPER/LOWER TWO-TONE (livery `lower`, 2026-10-03) ----
  // A second body colour below a line along the sidepods and on forward
  // along the monocoque side:
  //   y(z) = podAt(z).bottom + 0.80 (top - bottom),  z -2.00 .. +1.05
  // straight between pod stations, held at the end stations beyond them (the
  // inlet height ahead of z +0.62, the tail's behind -1.48). It stops at z
  // +1.05, the monocoque/nose joint, so the nose stays primary.
  // No height knob. 0.80 is the TOP edge of the opaque sponsor board (PANEL,
  // pod fractions 0.32-0.80, 16 mm proud of the flank, car3d addPodFlankSpan):
  // along the board the seam hides behind its top edge, and fore and aft of
  // it the flank is dark to the same height. The c2 accent band (0.08-0.30)
  // and the strip decal on it sit inside the dark zone and keep their own
  // colour; the accent flash (lower edge >= 0.8195) and the ERS strip
  // (0.91-0.97) stay on primary. The first cut, 0.31, put the line under the
  // board, which hid all but ~8 % of it from the side; this is ~20 % of the
  // side-view body paint (body-split.test.mjs measures it).
  // No vertex row lies on the line — the pod flank is ONE segment of podRing,
  // the cover flank one quad — so recolouring vertices alone would smear a
  // gradient down the flank: a triangle across the line is CUT along it.
  const LOWER = Object.freeze({ frac: 0.80, front: 1.05, rear: -2.00 });
  /** Paint the body below the line in `lower`, in place, over triangles whose
   *  vertices all lie in [from, to): only those whose three vertices are
   *  `paint` in the body colour (c1, clamped as car3d addTri clamps paint) and
   *  used by no other triangle, so the accent band, panel, stripes, nose cap,
   *  pod/cover overrides and helmet keep theirs. Wholly below: recoloured.
   *  Across: cut where the line crosses its edges — its own slot rewritten,
   *  the other pieces appended, normals interpolated — so the colour edge is
   *  crisp, and smooth() still welds the shading across it: call it before
   *  smooth() and the finish remap. Returns the number of vertices appended. */
  function lowerZone(out, from, to, c1, lower, anchors, paint) {
    if (!Array.isArray(lower) || lower.length < 3) return 0;   // a garage file keeps a string in a colour slot (settings-export cleanLivery)
    const P = out.pos, N = out.nrm, C = out.col, M = out.mat, I = out.idx, nt = Math.floor(I.length / 3), EPS = 1e-7;
    const body = [0, 1, 2].map((k) => Math.min(c1[k], 1)), low = [0, 1, 2].map((k) => Math.min(lower[k], 1));
    // The line at its KNOTS (the range ends and the pod stations between them):
    // podAt is linear between stations, so interpolating these is exact.
    const knots = [LOWER.front].concat(anchors.podStations.map((s) => s.z).filter((z) => z < LOWER.front && z > LOWER.rear), [LOWER.rear])
      .map((z) => { const p = anchors.podAt(z); return [z, p.bottom + LOWER.frac * (p.top - p.bottom)]; });
    const line = (z) => {
      for (let i = 1; i < knots.length; i++) {
        const [za, ya] = knots[i - 1], [zb, yb] = knots[i];
        if (z >= zb) return z >= za ? ya : yb + (ya - yb) * (z - zb) / (za - zb);
      }
      return knots[knots.length - 1][1];
    };
    // < 0 below the line; linear between two knots. Outside the z range nothing is below.
    const inZ = (z) => z <= LOWER.front && z >= LOWER.rear, gLine = (x, y, z) => y - line(z);
    const f = (y, z) => (inZ(z) ? y - line(z) : 1);
    const uses = new Uint32Array(Math.max(0, to - from));
    for (let i = 0; i < nt * 3; i++) if (I[i] >= from && I[i] < to) uses[I[i] - from]++;
    const isBody = (v) => v >= from && v < to && uses[v - from] === 1 && M[v] === paint &&
      C[v * 3] === body[0] && C[v * 3 + 1] === body[1] && C[v * 3 + 2] === body[2];
    const tint = (v, c) => { C[v * 3] = c[0]; C[v * 3 + 1] = c[1]; C[v * 3 + 2] = c[2]; };
    const at = (u, w, t, k) => P[u * 3 + k] + (P[w * 3 + k] - P[u * 3 + k]) * t;
    const vert = (u, w, t) => {   // a new vertex at t along edge u -> w (coloured by the caller)
      const n = P.length / 3, nrm = [0, 1, 2].map((k) => N[u * 3 + k] + (N[w * 3 + k] - N[u * 3 + k]) * t), l = len(nrm) || 1;
      for (let k = 0; k < 3; k++) { P.push(at(u, w, t, k)); N.push(nrm[k] / l); C.push(body[k]); }
      M.push(M[u]);
      return n;
    };
    // Triangle q (indices, winding kept) cut where g(x, y, z) changes sign, as
    // [piece, side] pairs; a corner within EPS of zero is ON the cut. g is
    // linear over q (a knot plane, or the line inside one slab), so a crossing
    // is where it interpolates to zero. Pieces on one side share corners.
    function split(q, g) {
      const d = q.map((u) => g(P[u * 3], P[u * 3 + 1], P[u * 3 + 2])), s = d.map((x) => (x < -EPS ? -1 : x > EPS ? 1 : 0));
      if (s.every((x) => x >= 0)) return [[q, 1]];
      if (s.every((x) => x <= 0)) return [[q, -1]];
      // Rotate so `a` is the corner the cut runs through, or the one it cuts off.
      const on = s.indexOf(0), k = on >= 0 ? on : s[0] === s[1] ? 2 : s[0] === s[2] ? 1 : 0;
      const a = q[k], b = q[(k + 1) % 3], c = q[(k + 2) % 3], da = d[k], db = d[(k + 1) % 3], dc = d[(k + 2) % 3];
      if (on >= 0) { const t = db / (db - dc); return [[[a, b, vert(b, c, t)], s[(k + 1) % 3]], [[vert(a, a, 0), vert(b, c, t), c], s[(k + 2) % 3]]]; }
      const tb = da / (da - db), tc = da / (da - dc), ab = vert(a, b, tb);
      return [[[a, vert(a, b, tb), vert(a, c, tc)], s[k]], [[ab, b, c], -s[k]], [[ab, c, vert(a, c, tc)], -s[k]]];
    }
    const n0 = P.length / 3, yTop = Math.max(...knots.map(([, y]) => y));
    for (let t = 0; t < nt; t++) {
      const a = I[t * 3], b = I[t * 3 + 1], c = I[t * 3 + 2];
      if (!isBody(a) || !isBody(b) || !isBody(c)) continue;
      const z0 = Math.min(P[a * 3 + 2], P[b * 3 + 2], P[c * 3 + 2]), z1 = Math.max(P[a * 3 + 2], P[b * 3 + 2], P[c * 3 + 2]);
      if (Math.min(P[a * 3 + 1], P[b * 3 + 1], P[c * 3 + 1]) > yTop + EPS || z1 < LOWER.rear || z0 > LOWER.front) continue;   // clear of the line: most of the body
      const q = [a, b, c];
      // The line BENDS at a knot (and stops at the range ends), so a long
      // triangle (the monocoque runs z 1.05 -> 0.05) can dip under it with all
      // three corners above. Between knots it is straight: the corners and the
      // points where the knot planes cross the edges decide, and a crossing
      // triangle is cut on those planes first, then each piece on the line.
      const span = knots.map(([z]) => z).filter((z) => z > z0 + EPS && z < z1 - EPS);
      const probe = q.map((u) => f(P[u * 3 + 1], P[u * 3 + 2]));
      for (const z of span) for (let e = 0; e < 3; e++) {
        const u = q[e], w = q[(e + 1) % 3], zu = P[u * 3 + 2], zw = P[w * 3 + 2];
        if ((zu - z) * (zw - z) < 0) probe.push(f(at(u, w, (z - zu) / (zw - zu), 1), z));
      }
      if (probe.every((d) => d >= -EPS)) continue;                                // above (or on) the line
      if (probe.every((d) => d <= EPS)) { for (const u of q) tint(u, low); continue; }   // below it
      let pieces = [q];
      for (const z of span) pieces = pieces.flatMap((p) => split(p, (x, y, zz) => zz - z).map(([p2]) => p2));
      const seen = new Set();   // the line may colour two plane pieces apart: none shares a corner
      pieces = pieces.map((p) => p.map((u) => (seen.has(u) ? vert(u, u, 0) : (seen.add(u), u))));
      pieces.flatMap((p) => (inZ((P[p[0] * 3 + 2] + P[p[1] * 3 + 2] + P[p[2] * 3 + 2]) / 3) ? split(p, gLine) : [[p, 1]])).forEach(([p, sd], i) => {
        for (const u of p) tint(u, sd < 0 ? low : body);
        if (i) I.push(p[0], p[1], p[2]); else { I[t * 3] = p[0]; I[t * 3 + 1] = p[1]; I[t * 3 + 2] = p[2]; }
      });
    }
    return P.length / 3 - n0;
  }

  /** Crease-angle normal smoothing over a Car3D mesh, in place, read through
   *  `idx`: most of car3d emits three fresh vertices per triangle with a face
   *  normal, but tubes (halo, harness) share ring vertices that already carry
   *  smooth normals. Every vertex position+surface gathers the faces that touch
   *  it; a vertex takes the area-weighted mean of those within the crease of
   *  its own normal, and only when a face it is NOT part of joins in — so an
   *  already-smooth tube is left as built. `skip` lists surface ids left flat
   *  (emissive lights). Returns the number of vertices whose normal moved. */
  function smooth(out, opts) {
    const crease = Math.cos(((opts && opts.creaseDeg) || 55) * Math.PI / 180);
    const skip = new Set((opts && opts.skip) || []);
    const P = out.pos, N = out.nrm, M = out.mat, I = out.idx, nv = P.length / 3, nt = Math.floor(I.length / 3);
    if (!nv || N.length !== P.length || !nt) return 0;
    const fx = new Float64Array(nt), fy = new Float64Array(nt), fz = new Float64Array(nt), fa = new Float64Array(nt);
    // Triangles per vertex as a CSR table (counts, then offsets): no per-vertex arrays.
    const cnt = new Uint32Array(nv + 1);
    for (let t = 0; t < nt; t++) {
      const a = I[t * 3] * 3, b = I[t * 3 + 1] * 3, c = I[t * 3 + 2] * 3;
      const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
      const wx = P[c] - P[a], wy = P[c + 1] - P[a + 1], wz = P[c + 2] - P[a + 2];
      const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx, l = Math.hypot(nx, ny, nz);
      if (!(l > 0)) continue;
      fx[t] = nx / l; fy[t] = ny / l; fz[t] = nz / l; fa[t] = l / 2;
      cnt[I[t * 3] + 1]++; cnt[I[t * 3 + 1] + 1]++; cnt[I[t * 3 + 2] + 1]++;
    }
    for (let v = 0; v < nv; v++) cnt[v + 1] += cnt[v];
    const vt = new Uint32Array(cnt[nv]), fill = cnt.slice(0, nv);
    for (let t = 0; t < nt; t++) if (fa[t] > 0) for (let k = 0; k < 3; k++) vt[fill[I[t * 3 + k]]++] = t;
    // Vertices SORTED by quantised position + surface, so each weld group is a
    // contiguous run; a group's triangles are gathered once (stamped, no Set).
    const qx = new Int32Array(nv), qy = new Int32Array(nv), qz = new Int32Array(nv);
    const order = [];
    for (let v = 0; v < nv; v++) {
      if (skip.has(M[v]) || cnt[v + 1] === cnt[v]) continue;
      qx[v] = Math.round(P[v * 3] * 1e4); qy[v] = Math.round(P[v * 3 + 1] * 1e4); qz[v] = Math.round(P[v * 3 + 2] * 1e4);
      order.push(v);
    }
    order.sort((u, v) => (qx[u] - qx[v]) || (qy[u] - qy[v]) || (qz[u] - qz[v]) || (M[u] - M[v]));
    const stamp = new Int32Array(nt).fill(-1), tris = [];
    let moved = 0;
    for (let i = 0; i < order.length;) {
      const u0 = order[i];
      let j = i + 1;
      while (j < order.length) {
        const w = order[j];
        if (qx[w] !== qx[u0] || qy[w] !== qy[u0] || qz[w] !== qz[u0] || M[w] !== M[u0]) break;
        j++;
      }
      if (j - i > 1) {
        tris.length = 0;
        for (let r = i; r < j; r++) {
          const u = order[r];
          for (let k = cnt[u]; k < cnt[u + 1]; k++) if (stamp[vt[k]] !== i) { stamp[vt[k]] = i; tris.push(vt[k]); }
        }
        for (let r = i; r < j; r++) {
          const v = order[r], ax = N[v * 3], ay = N[v * 3 + 1], az = N[v * 3 + 2];
          let sx = 0, sy = 0, sz = 0, foreign = 0;
          for (const t of tris) {
            if (ax * fx[t] + ay * fy[t] + az * fz[t] < crease) continue;
            sx += fx[t] * fa[t]; sy += fy[t] * fa[t]; sz += fz[t] * fa[t];
            let mine = false;
            for (let k = cnt[v]; k < cnt[v + 1]; k++) if (vt[k] === t) { mine = true; break; }
            if (!mine) foreign++;
          }
          const l = Math.hypot(sx, sy, sz);
          if (!foreign || !(l > 0)) continue;   // nothing new within the crease: the normal stands
          sx /= l; sy /= l; sz /= l;
          if (Math.abs(sx - ax) + Math.abs(sy - ay) + Math.abs(sz - az) > 1e-6) moved++;
          N[v * 3] = sx; N[v * 3 + 1] = sy; N[v * 3 + 2] = sz;
        }
      }
      i = j;
    }
    return moved;
  }

  return { KEY, RING_N, EXP, EXP_TOP, LOWER, on, any, set, pref, ring, sink, loft, capLoft, podRing, loftRings, podLoft, vertexNormals, lowerZone, smooth,
           skin, earcut, sect, pipe, strut, fine, rquad, block, box, boxFn, blockFn, housing, cTub, floor, endplate, tunnel, headrest,
           _norm: norm };
})();
Object.freeze(CarShade);
