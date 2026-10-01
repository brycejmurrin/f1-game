"use strict";
/* Apex 26 — CAR SHADE: rounded body sections and smooth shading for the
 * procedural car (js/car/car3d.js). OFF unless asked for; Car3D.build calls in.
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
 * THE SWITCH. `apex26.carSmooth` in storage, or `?carsmooth=` in the URL
 * (the URL wins for that page load): "1" / "all" for every car, a team id
 * ("mclaren") for that team's car only, anything else off. Read once per
 * page; set() changes it live (callers drop their mesh caches).
 */
const CarShade = (function () {
  const KEY = "apex26.carSmooth";
  let _pref;   // undefined = not read yet; null = off; "*" = every car; else a team id

  function norm(v) {
    if (v == null) return null;
    const s = String(v).trim().toLowerCase();
    if (s === "1" || s === "all" || s === "on" || s === "true") return "*";
    if (!s || s === "0" || s === "off" || s === "false") return null;
    return /^[a-z0-9_-]{1,40}$/.test(s) ? s : null;
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
  /** Set the switch ("1", a team id, or off) and save it. Returns what took effect. */
  function set(v) {
    _pref = norm(v);
    try { if (typeof localStorage !== "undefined") { if (_pref) localStorage.setItem(KEY, _pref === "*" ? "1" : _pref); else localStorage.removeItem(KEY); } }
    catch (_) { /* storage refused: live for this page only */ }
    return _pref;
  }
  /** Is it on for this team's car? */
  function on(teamId) { const p = pref(); return p === "*" || (!!p && p === teamId); }

  // Points round a ROUNDED TRAPEZOID: |u|^p + |v|^p = 1, then the half-width
  // tapers from w/2 at the bottom to t*w/2 at the top exactly as frame() does.
  // Counter-clockwise seen from +Z, starting at the right flank (mid-height).
  const RING_N = 24, EXP = 3;
  function ring(f, n, p) {
    n = n || RING_N; p = p || EXP;
    const pts = [], x0 = f.x || 0, hw = f.w / 2, hh = f.h / 2, t = f.t !== undefined ? f.t : 1, e = 2 / p;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      const u = Math.sign(c) * Math.pow(Math.abs(c), e), v = Math.sign(s) * Math.pow(Math.abs(s), e);
      pts.push([x0 + u * hw * (1 + (t - 1) * (v + 1) / 2), f.y + v * hh, f.z]);
    }
    return pts;
  }
  /** Loft `front` to `rear` (car3d span stations) with rounded sections and
   *  both ends capped. `tri(out, a, b, c, col)` is car3d's addTri. */
  function loft(out, front, rear, col, tri, opts) {
    const n = (opts && opts.n) || RING_N, p = (opts && opts.p) || EXP;
    const F = ring(front, n, p), R = ring(rear, n, p);
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

  return { KEY, RING_N, EXP, on, set, pref, ring, loft, smooth, _norm: norm };
})();
Object.freeze(CarShade);
