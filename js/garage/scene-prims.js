/* Apex 26 — GaragePrims: the garage bay's mesh primitives and shared constants: the room's dimensions and wall
   colours, the block / cylinder / tube / hose / tile / panel-grid builders every part of the bay is made of, and the
   room LOOKS the setup sheet picks between. */
const GaragePrims = (function () {
  "use strict";

// Interior, metres. The car spans z -2.69..3.18 and x +/-0.95; its nose is +Z,
// so +Z is the pit-lane end and the deep end of the bay is behind it.
// js/track/core/pit.js owns the bay's dimensions (TrackPit.BAY, read at eval —
// a HARD_EDGES pair in the manifest) so the setup screen and the pit complex
// cannot disagree about the box you drive into.
const HALF_W = TrackPit.BAY.w / 2, Z_BACK = -TrackPit.BAY.depth / 2, Z_DOOR = TrackPit.BAY.depth / 2, CEIL_Y = TrackPit.BAY.h;

const PANEL  = [0.150, 0.156, 0.170];   // upper wall panels
const STEEL  = [0.230, 0.235, 0.250];
const DARK   = [0.055, 0.058, 0.066];

// The shared material ids, so the bay names the same surfaces the track does
// rather than keeping a second copy that can drift. Read at eval (HARD_EDGES
// pairs this file after TrackGeom in tools/manifest.cjs); the fallback object
// is only for a harness that loads the module alone.
const MAT = (typeof TrackGeom !== "undefined" && TrackGeom.MAT)
  ? TrackGeom.MAT : { FLAT: 0, CONCRETE: 1, METAL: 4, ASPHALT: 16 };

// ── small helpers ──────────────────────────────────────────────────────────
const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const scale = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const rgb = (c, dflt) => (c && c.length === 3 ? c : dflt);
const to255 = (v) => Math.round(Math.min(1, Math.max(0, v)) * 255);
const css = (c) => `rgb(${to255(c[0])},${to255(c[1])},${to255(c[2])})`;
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// Material ids ride in out.mat only when the caller asked for them.
function pushMat(out, n, mid) {
  if (!out.mat) return;
  for (let i = 0; i < n; i++) out.mat.push(mid || 0);
}

// ── mesh builders ──────────────────────────────────────────────────────────
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
  // (a,d,c)/(a,b,d) is the order that is CCW about uVec x vVec: in (u,v) the
  // quad is a(0,0) b(1,0) c(0,1) d(1,1), and a->d->c turns the same way as
  // u->v. So when that cross product already points along the wanted normal,
  // THAT is the order to emit; the other one faces the wall the wrong way and a
  // room built from it is a solid box that hides its own interior.
  const along = dot(cross(uVec, vVec), nrm) > 0;
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
// A WALL-KEYED material must never land on a horizontal face. matWallLike() in
// js/render/glx/shaders/glsl-lit.js makes CONCRETE/BRICK/METAL/WOOD/FABRIC/ROOF/
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
    if (dot(cross(e, g), n) > 0) out.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    else out.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
  }
}

// A vertical cylinder standing on (cx, cy, cz), open at the bottom.
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
  let u = cross(Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0], n);
  const ul = Math.hypot(u[0], u[1], u[2]) || 1;
  u = [u[0] / ul, u[1] / ul, u[2] / ul];
  const v = cross(u, n);
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
  for (const [pt, sg] of [[b, 1], [a, -1]]) {
    const top = out.pos.length / 3;
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

// One bay-floor rectangle at height y (default 0). The markings are REAL
// GEOMETRY in a gapless tiling, not decals: overlapping coplanar quads z-fight
// at grazing elevation, and a decal would miss the lamp pools entirely (the
// decal shader sees sun and ambient only, never the point lights).
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

// ── room LOOKS ──────────────────────────────────────────────────────────────
// The setup sheet's GARAGE row picks the SETUP-SCREEN bay's architecture:
// walls, floor, ceiling, back-wall branding. `stock` (null) is the shipped room; every other id is a
// data record GarageDress.look* reads. Trackside pit rows (buildStatic) never
// see a look. Pick one with ?garageLook=<id>, localStorage apex26.garageLook,
// or GaragePrims.setLook(id) (the geometry key carries lookId(), so the bay
// rebuilds on the next frame). Colours are functions of the livery (c1 body,
// c2 accent) so every team still reads as its own garage.
const GREY = (v) => [v, v * 1.01, v * 1.05];
const LOOKS = {
  stock: null,
  // Silver studio: light aluminium panelling on shadow-gap joints, a pale
  // epoxy floor, a white ceiling of flush LED panels, a team header band.
  studio: {
    label: "Silver studio",
    wall: { dado: () => GREY(0.42), stripe: (c1, c2) => c2, panel: () => GREY(0.62), skirt: GREY(0.07),
            seam: "joint", jointPitch: 1.35, back: null },
    ceil: GREY(0.58), truss: "rails", ceilLed: "grid",
    floor: { slab: GREY(0.34), inner: GREY(0.40), paint: GREY(0.92), walk: GREY(0.55), band: (c1) => c1, key: (c1) => c1,
             outline: GREY(0.92) },
    backWall: "header",
  },
  // Night carbon: graphite navy walls split by lit accent slats, a black
  // gloss floor with white markings, linear ceiling strips, a back wall that
  // is one framed team-colour field.
  carbon: {
    label: "Night carbon",
    wall: { dado: (c1) => mix(GREY(0.03), c1, 0.10), stripe: (c1, c2) => c2, panel: (c1) => mix([0.035, 0.040, 0.060], c1, 0.12),
            skirt: GREY(0.02), seam: "slat", back: (c1) => scale(c1, 0.55) },
    ceil: GREY(0.018), truss: "stock", ceilLed: "strips",
    floor: { slab: GREY(0.040), inner: GREY(0.055), paint: GREY(0.90), walk: (c1, c2) => scale(c2, 0.8), band: (c1, c2) => c2,
             key: (c1, c2) => c2, outline: GREY(0.88) },
    backWall: "frame",
  },
  // Team flood: white dado under a full-saturation team-colour upper wall,
  // black pinstripe, a mid-grey floor with a team-tinted box.
  flood: {
    label: "Team flood",
    wall: { dado: () => GREY(0.74), stripe: () => GREY(0.04), panel: (c1) => scale(c1, 0.92), skirt: GREY(0.05),
            seam: "none", back: null },
    ceil: GREY(0.24), truss: "stock", ceilLed: "none",
    floor: { slab: GREY(0.20), inner: (c1) => mix(GREY(0.20), c1, 0.38), paint: GREY(0.90), walk: GREY(0.85),
             band: (c1) => c1, key: GREY(0.90), outline: (c1, c2) => c2 },
    backWall: "header",
  },
  // Bare workshop: painted block-work, a hazard dado, raw concrete floor with
  // yellow safety lines, deep steel trusses and hanging industrial pendants.
  workshop: {
    label: "Bare workshop",
    wall: { dado: () => [0.16, 0.20, 0.17], stripe: () => [0.85, 0.66, 0.06], panel: () => [0.38, 0.36, 0.33], skirt: GREY(0.06),
            seam: "block", back: null },
    ceil: [0.12, 0.115, 0.11], truss: "heavy", ceilLed: "pendants",
    floor: { slab: [0.23, 0.22, 0.20], inner: [0.25, 0.24, 0.22], paint: [0.85, 0.66, 0.06], walk: [0.85, 0.66, 0.06],
             band: () => [0.85, 0.66, 0.06], key: () => [0.08, 0.08, 0.08], outline: null },
    backWall: "none",
  },
  // Clean assembly bay: pale ceramic panels, broad joints and a blue resin
  // working floor. Flush light panels leave the car's silhouette uncluttered.
  porcelain: {
    label: "Porcelain lab",
    wall: { dado: () => [0.48, 0.62, 0.65], stripe: (c1, c2) => mix([0.06, 0.38, 0.48], c2, 0.25),
            panel: () => [0.76, 0.80, 0.79], skirt: GREY(0.12), seam: "joint", jointPitch: 2.70, back: null },
    ceil: [0.70, 0.76, 0.77], truss: "rails", ceilLed: "grid",
    floor: { slab: [0.16, 0.25, 0.29], inner: [0.24, 0.40, 0.46], paint: GREY(0.92), walk: [0.49, 0.65, 0.66],
             band: (c1) => c1, key: GREY(0.90), outline: GREY(0.88) },
    backWall: "header",
  },
  // Historic works garage: warm brick courses, a cream protective dado and
  // ochre safety lanes beneath deep trusses and suspended enamel lamps.
  heritage: {
    label: "Heritage works",
    wall: { dado: () => [0.70, 0.62, 0.48], stripe: (c1) => scale(c1, 0.55),
            panel: () => [0.45, 0.24, 0.17], skirt: [0.12, 0.09, 0.07], seam: "block", back: null },
    ceil: [0.24, 0.19, 0.14], truss: "heavy", ceilLed: "pendants",
    floor: { slab: [0.27, 0.23, 0.18], inner: [0.38, 0.32, 0.24], paint: [0.88, 0.71, 0.28], walk: [0.72, 0.57, 0.24],
             band: (c1) => scale(c1, 0.70), key: [0.08, 0.07, 0.06], outline: null },
    backWall: "none",
  },
  // Endurance service bay: blue wall fields and slate flooring with amber
  // access markings; slim rails and continuous strips keep the ceiling open.
  endurance: {
    label: "Endurance blue",
    wall: { dado: () => [0.19, 0.27, 0.34], stripe: (c1, c2) => mix([0.92, 0.43, 0.07], c2, 0.20),
            panel: () => [0.07, 0.14, 0.24], skirt: GREY(0.04), seam: "none", back: null },
    ceil: [0.16, 0.23, 0.32], truss: "rails", ceilLed: "strips",
    floor: { slab: [0.07, 0.11, 0.16], inner: [0.10, 0.16, 0.22], paint: GREY(0.92), walk: [0.92, 0.47, 0.10],
             band: (c1) => c1, key: GREY(0.90), outline: [0.94, 0.55, 0.14] },
    backWall: "frame",
  },
  // Wet-race / rain-ready bay: cool overcast panelling, dark gloss resin with
  // pale safety lanes — pairs with the rain lighting mood for a Spa weekend.
  rainready: {
    label: "Rain ready",
    wall: { dado: () => [0.28, 0.32, 0.34], stripe: (c1, c2) => mix([0.55, 0.62, 0.70], c2, 0.35),
            panel: () => [0.42, 0.46, 0.50], skirt: GREY(0.06), seam: "joint", jointPitch: 1.80, back: null },
    ceil: [0.30, 0.34, 0.38], truss: "rails", ceilLed: "grid",
    floor: { slab: [0.08, 0.10, 0.12], inner: [0.12, 0.15, 0.18], paint: GREY(0.88), walk: [0.70, 0.74, 0.78],
             band: (c1) => mix(GREY(0.55), c1, 0.35), key: GREY(0.90), outline: [0.72, 0.78, 0.84], wetBands: true },
    backWall: "header",
  },
  // Qualifying night: deep charcoal walls, bright linear strips, white floor
  // box under a framed back wall — the Saturday-night parc-fermé read.
  qualify: {
    label: "Qualifying night",
    wall: { dado: () => [0.08, 0.09, 0.12], stripe: (c1, c2) => mix([0.85, 0.88, 0.95], c2, 0.25),
            panel: () => [0.04, 0.05, 0.08], skirt: GREY(0.02), seam: "slat", back: (c1) => scale(c1, 0.40) },
    ceil: GREY(0.012), truss: "stock", ceilLed: "strips", hotStrips: true,
    floor: { slab: GREY(0.035), inner: GREY(0.050), paint: GREY(0.94), walk: (c1, c2) => scale(c2, 0.75),
             band: (c1, c2) => c2, key: GREY(0.92), outline: GREY(0.90) },
    backWall: "frame",
  },
};
const LOOK_IDS = Object.keys(LOOKS);
const LOOK_KEY = "apex26.garageLook";

// ?garageLook=<id> wins over the saved pick; an unknown id keeps the stock room.
function initialLook() {
  try {
    const q = typeof location !== "undefined" && new URLSearchParams(location.search).get("garageLook");
    const s = typeof localStorage !== "undefined" && localStorage.getItem(LOOK_KEY);
    const v = q || s;
    if (v && LOOK_IDS.indexOf(v) >= 0) return v;
  } catch (_) { /* no storage */ }
  return "stock";
}
let _look = initialLook();
function setLook(id) {
  if (LOOK_IDS.indexOf(id) < 0) return false;
  _look = id;
  try { localStorage.setItem(LOOK_KEY, id); } catch (_) { /* private mode */ }
  return true;
}
const lookId = () => _look;
const look = () => LOOKS[_look] || null;
// Resolve a look colour slot: a fixed [r,g,b] or a function of the livery.
const lookCol = (v, c1, c2) => (typeof v === "function" ? v(c1, c2) : v);

  return { tile, pushMat, HALF_W, Z_BACK, Z_DOOR, CEIL_Y, PANEL, STEEL, DARK, panelGrid, block, cyl, tube, hose, MAT, smooth, scale, rgb, css,
    LOOKS, LOOK_IDS, setLook, lookId, look, lookCol };
})();
if (typeof window !== "undefined") window.GaragePrims = GaragePrims;
