/* Apex 26 — GaragePrims: the garage bay's mesh primitives and shared constants. The room's dimensions and wall colours, and the block / cylinder / tube / hose / panel-grid builders every part of the bay is made of. Split out of scene.js on 2026-09-08; the bay reads TrackGeom.MAT at eval here. */
const GaragePrims = (function () {
  "use strict";

// Interior, metres. The car spans z -2.69..3.18 and x +/-0.95; its nose is +Z,
// so +Z is the pit-lane end and the deep end of the bay is behind it.
const HALF_W = 5.4, Z_BACK = -6.4, Z_DOOR = 6.4, CEIL_Y = 5.0;

const PANEL  = [0.150, 0.156, 0.170];   // upper wall panels
const STEEL  = [0.230, 0.235, 0.250];
const DARK   = [0.055, 0.058, 0.066];

// ── mesh helpers ───────────────────────────────────────────────────────────
// A flat rectangle spanned by uVec/vVec from origin, subdivided nu x nv and
// shaded per-vertex by colAt(u01, v01). Winding is derived from the requested
// normal rather than assumed, which is what lets the same helper build a wall
// seen from INSIDE and a prop face seen from outside.
function panelGrid(out, origin, uVec, vVec, nu, nv, nrm, colAt, mid) {
  const base = out.pos.length / 3;
  for (let j = 0; j <= nv; j++) {
    for (let i = 0; i <= nu; i++) {
      const u = i / nu, v = j / nv, c = colAt(u, v);
      out.pos.push(origin[0] + uVec[0] * u + vVec[0] * v,
                   origin[1] + uVec[1] * u + vVec[1] * v,
                   origin[2] + uVec[2] * u + vVec[2] * v);
      out.nrm.push(nrm[0], nrm[1], nrm[2]);
      out.col.push(c[0], c[1], c[2]);
    }
  }
  pushMat(out, (nu + 1) * (nv + 1), mid);
  const cr = [uVec[1] * vVec[2] - uVec[2] * vVec[1],
              uVec[2] * vVec[0] - uVec[0] * vVec[2],
              uVec[0] * vVec[1] - uVec[1] * vVec[0]];
  // (a,d,c)/(a,b,d) is the order that is CCW about +cr, where cr = uVec x vVec:
  // in (u,v) the quad is a(0,0) b(1,0) c(0,1) d(1,1), and a->d->c turns the same
  // way as u->v. So when cr already points along the wanted normal, THAT is the
  // order to emit; the other one faces the wall the wrong way and a room built
  // from it is a solid box that hides its own interior.
  const along = cr[0] * nrm[0] + cr[1] * nrm[1] + cr[2] * nrm[2] > 0;
  const row = nu + 1;
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const a = base + j * row + i, b = a + 1, c = a + row, d = c + 1;
      if (along) out.idx.push(a, d, c, a, b, d);
      else out.idx.push(a, c, d, a, d, b);
    }
  }
}

// Solid axis-aligned block, outward-wound, one flat colour. Props are SOLIDS,
// never planes: a camera that wanders inside one then sees only back faces and
// the prop silently vanishes instead of smearing across the frame.
const BOX_F = [[0, 0, 1], [0, 0, -1], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0]];
// A WALL-KEYED material must never land on a horizontal face. matWallLike()
// (matWallLike() in js/render/glx/shaders/glsl-lit.js) makes CONCRETE/BRICK/METAL/WOOD/FABRIC/ROOF/
// STONE/RUST key their triplanar UV off `(an.x > an.z ? worldZ : worldX,
// worldY)`; on a face whose normal is +-Y, worldY is constant, so the UV
// collapses to one axis and the material renders as streaks smeared down it.
// A box cannot know which of its faces a caller cared about, so it decides per
// face: the four sides take the id, the top and bottom drop to FLAT. That kills
// the whole class of bug at the primitive instead of at ~150 call sites.
const WALL_KEYED = [1, 2, 4, 5, 7, 12, 13, 14];
const sideOnly = (mid, ny) => (ny !== 0 && WALL_KEYED.indexOf(mid) >= 0 ? 0 : mid);
function block(out, cx, cy, cz, hx, hy, hz, col, mid) {
  const c = [cx, cy, cz], h = [hx, hy, hz];
  for (let f = 0; f < 6; f++) {
    const n = BOX_F[f];
    const i0 = n[0] ? 1 : 0, i1 = n[2] ? 1 : 2;   // the two in-plane axes
    const base = out.pos.length / 3;
    for (let s = 0; s < 4; s++) {
      const p = [c[0] + n[0] * h[0], c[1] + n[1] * h[1], c[2] + n[2] * h[2]];
      p[i0] += ((s === 1 || s === 2) ? 1 : -1) * h[i0];
      p[i1] += (s >= 2 ? 1 : -1) * h[i1];
      out.pos.push(p[0], p[1], p[2]);
      out.nrm.push(n[0], n[1], n[2]);
      out.col.push(col[0], col[1], col[2]);
    }
    pushMat(out, 4, sideOnly(mid, n[1]));
    const e = [0, 0, 0]; e[i0] = 1;
    const g = [0, 0, 0]; g[i1] = 1;
    const cr = [e[1] * g[2] - e[2] * g[1], e[2] * g[0] - e[0] * g[2], e[0] * g[1] - e[1] * g[0]];
    if (cr[0] * n[0] + cr[1] * n[1] + cr[2] * n[2] > 0)
      out.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    else out.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
  }
}

function cyl(out, cx, cy, cz, rad, h, col, seg, mid) {
  seg = seg || 10;
  const base = out.pos.length / 3;
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
    for (let k = 0; k < 2; k++) {
      out.pos.push(cx + ca * rad, cy + k * h, cz + sa * rad);
      out.nrm.push(ca, 0, sa); out.col.push(col[0], col[1], col[2]);
    }
  }
  pushMat(out, seg * 2, mid);
  for (let i = 0; i < seg; i++) {
    const a = base + i * 2, b = base + ((i + 1) % seg) * 2;
    out.idx.push(a, b, b + 1, a, b + 1, a + 1);
  }
  const top = out.pos.length / 3;
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    out.pos.push(cx + Math.cos(a) * rad, cy + h, cz + Math.sin(a) * rad);
    out.nrm.push(0, 1, 0); out.col.push(col[0], col[1], col[2]);
  }
  pushMat(out, seg, sideOnly(mid, 1));      // the cap is horizontal, same rule
  for (let i = 1; i < seg - 1; i++) out.idx.push(top, top + i, top + i + 1);
}

// An ORIENTED cylinder from a to b — cyl() is vertical only, and a garage is
// mostly things that are not: hoses, cables, booms, an upright tyre on a
// trolley, a jack handle. Basis: n along the axis, u perpendicular, and
// v = u x n, which gives (u, v, n) the SAME handedness as cyl's (X, Z, Y) so
// its index order (outward-wound) carries over unchanged; the b-end cap is
// cyl's top cap and the a-end reverses it. Caps take sideOnly on their axis so
// a horizontal cap of a wall-keyed material never streaks (see block()).
function tube(out, a, b, rad, col, seg, mid) {
  seg = seg || 8;
  const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const L = Math.hypot(d[0], d[1], d[2]) || 1e-6;
  const n = [d[0] / L, d[1] / L, d[2] / L];
  const h = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  let u = [h[1] * n[2] - h[2] * n[1], h[2] * n[0] - h[0] * n[2], h[0] * n[1] - h[1] * n[0]];
  const ul = Math.hypot(u[0], u[1], u[2]) || 1;
  u = [u[0] / ul, u[1] / ul, u[2] / ul];
  const v = [u[1] * n[2] - u[2] * n[1], u[2] * n[0] - u[0] * n[2], u[0] * n[1] - u[1] * n[0]];
  const ring = (i) => { const t = (i / seg) * Math.PI * 2, ca = Math.cos(t), sa = Math.sin(t);
    return [u[0] * ca + v[0] * sa, u[1] * ca + v[1] * sa, u[2] * ca + v[2] * sa]; };
  const base = out.pos.length / 3;
  for (let i = 0; i < seg; i++) {
    const r = ring(i);
    for (let k = 0; k < 2; k++) {
      const pt = k ? b : a;
      out.pos.push(pt[0] + r[0] * rad, pt[1] + r[1] * rad, pt[2] + r[2] * rad);
      out.nrm.push(r[0], r[1], r[2]); out.col.push(col[0], col[1], col[2]);
    }
  }
  pushMat(out, seg * 2, mid);
  for (let i = 0; i < seg; i++) {
    const p = base + i * 2, q = base + ((i + 1) % seg) * 2;
    out.idx.push(p, q, q + 1, p, q + 1, p + 1);
  }
  for (const end of [[b, 1], [a, -1]]) {
    const pt = end[0], sg = end[1], top = out.pos.length / 3;
    for (let i = 0; i < seg; i++) {
      const r = ring(i);
      out.pos.push(pt[0] + r[0] * rad, pt[1] + r[1] * rad, pt[2] + r[2] * rad);
      out.nrm.push(n[0] * sg, n[1] * sg, n[2] * sg); out.col.push(col[0], col[1], col[2]);
    }
    pushMat(out, seg, sideOnly(mid, n[1] * sg));
    for (let i = 1; i < seg - 1; i++)
      if (sg > 0) out.idx.push(top, top + i, top + i + 1); else out.idx.push(top, top + i + 1, top + i);
  }
}
// A hose or cable through a polyline of points: one tube per leg.
function hose(out, pts, rad, col, seg, mid) {
  for (let i = 1; i < pts.length; i++) tube(out, pts[i - 1], pts[i], rad, col, seg, mid);
}

// The shared material ids, so the bay names the same surfaces the track does
// rather than keeping a second copy that can drift. Read lazily: every use is
// inside a build function, so TrackGeom (manifest position 77, this file 121)
// is always up by then and this needs no HARD_EDGES pair.
const MAT = (typeof TrackGeom !== "undefined" && TrackGeom.MAT)
  ? TrackGeom.MAT : { FLAT: 0, CONCRETE: 1, METAL: 4, ASPHALT: 16 };

const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const scale = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const rgb = (c, dflt) => (c && c.length === 3 ? c : dflt);

const css = (c) => "rgb(" + Math.round(Math.min(1, Math.max(0, c[0])) * 255) + "," +
  Math.round(Math.min(1, Math.max(0, c[1])) * 255) + "," +
  Math.round(Math.min(1, Math.max(0, c[2])) * 255) + ")";

const pushMat = (out, n, mid) => {
  if (!out.mat) return;
  for (let i = 0; i < n; i++) out.mat.push(mid || 0);
};

// One bay-floor rectangle at y = 0. The markings are REAL GEOMETRY in a gapless
// tiling, not decals: overlapping coplanar quads z-fight at grazing elevation,
// and a decal would miss the lamp pools entirely (the decal shader sees sun and
// ambient only, never the point lights).
function tile(out, x0, x1, z0, z1, col, y, mid) {
  const base = out.pos.length / 3;
  const p = [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
  for (let k = 0; k < 4; k++) {
    out.pos.push(p[k][0], y || 0, p[k][1]); out.nrm.push(0, 1, 0);
    out.col.push(col[0], col[1], col[2]);
  }
  pushMat(out, 4, mid);
  out.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
}

  return { tile, pushMat, HALF_W, Z_BACK, Z_DOOR, CEIL_Y, PANEL, STEEL, DARK, panelGrid, BOX_F, WALL_KEYED, sideOnly, block, cyl, tube, hose, MAT, smooth, scale, rgb, css };
})();
if (typeof window !== "undefined") window.GaragePrims = GaragePrims;
