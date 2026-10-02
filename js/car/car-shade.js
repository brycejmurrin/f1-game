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
  function ring(f, n, p, pt) {
    n = n || RING_N; p = p || EXP; pt = pt || EXP_TOP;
    const pts = [], x0 = f.x || 0, hw = f.w / 2, hh = f.h / 2, t = f.t !== undefined ? f.t : 1;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, snap = (x) => (Math.abs(x) < 1e-9 ? 0 : x);   // cos(pi/2) is 6e-17, not 0
      const c = snap(Math.cos(a)), s = snap(Math.sin(a)), e = 2 / (s > 0 ? pt : p);
      const u = Math.sign(c) * Math.pow(Math.abs(c), e), v = Math.sign(s) * Math.pow(Math.abs(s), e);
      pts.push([x0 + u * hw * (1 + (t - 1) * (v + 1) / 2), f.y + v * hh, f.z]);
    }
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
   *  both ends capped. `tri(out, a, b, c, col)` is car3d's addTri. */
  function loft(out, front, rear, col, tri, opts) {
    const n = (opts && opts.n) || RING_N, p = (opts && opts.p) || EXP, pt = (opts && opts.pt) || EXP_TOP;
    const F = ring(front, n, p, pt), R = ring(rear, n, p, pt);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      tri(out, F[i], R[i], R[j], col);
      tri(out, F[i], R[j], F[j], col);
    }
    const cf = [front.x || 0, front.y, front.z], cr = [rear.x || 0, rear.y, rear.z];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      tri(out, cf, F[i], F[j], col);   // +Z
      tri(out, cr, R[j], R[i], col);   // -Z
    }
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

  return { KEY, RING_N, EXP, EXP_TOP, on, any, set, pref, ring, sink, loft, capLoft, podRing, loftRings, podLoft, vertexNormals, smooth, _norm: norm };
})();
Object.freeze(CarShade);
