const GaragePrims = (function () {
  "use strict";

const HALF_W = TrackPit.BAY.w / 2, Z_BACK = -TrackPit.BAY.depth / 2, Z_DOOR = TrackPit.BAY.depth / 2, CEIL_Y = TrackPit.BAY.h;

const PANEL  = [0.150, 0.156, 0.170];
const STEEL  = [0.230, 0.235, 0.250];
const DARK   = [0.055, 0.058, 0.066];

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

const BOX_F = [[0, 0, 1], [0, 0, -1], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0]];
const WALL_KEYED = [1, 2, 4, 5, 7, 12, 13, 14];
const sideOnly = (mid, ny) => (ny !== 0 && WALL_KEYED.indexOf(mid) >= 0 ? 0 : mid);
function block(out, cx, cy, cz, hx, hy, hz, col, mid) {
  const c = [cx, cy, cz], h = [hx, hy, hz];
  for (let f = 0; f < 6; f++) {
    const n = BOX_F[f];
    const i0 = n[0] ? 1 : 0, i1 = n[2] ? 1 : 2;
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
  pushMat(out, seg, sideOnly(mid, 1));
  for (let i = 1; i < seg - 1; i++) out.idx.push(top, top + i, top + i + 1);
}

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
function hose(out, pts, rad, col, seg, mid) {
  for (let i = 1; i < pts.length; i++) tube(out, pts[i - 1], pts[i], rad, col, seg, mid);
}

const MAT = (typeof TrackGeom !== "undefined" && TrackGeom.MAT)
  ? TrackGeom.MAT : { FLAT: 0, CONCRETE: 1, METAL: 4, ASPHALT: 16 };

const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const scale = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const rgb = (c, dflt) => (c && c.length === 3 ? c : dflt);

const to255 = (v) => Math.round(Math.min(1, Math.max(0, v)) * 255);
const css = (c) => `rgb(${to255(c[0])},${to255(c[1])},${to255(c[2])})`;

const pushMat = (out, n, mid) => {
  if (!out.mat) return;
  for (let i = 0; i < n; i++) out.mat.push(mid || 0);
};

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

const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const GREY = (v) => [v, v * 1.01, v * 1.05];
const LOOKS = {
  stock: null,
  studio: {
    label: "Silver studio",
    wall: { dado: () => GREY(0.42), stripe: (c1, c2) => c2, panel: () => GREY(0.62), skirt: GREY(0.07),
            seam: "joint", jointPitch: 1.35, back: null },
    ceil: GREY(0.58), truss: "rails", ceilLed: "grid",
    floor: { slab: GREY(0.34), inner: GREY(0.40), paint: GREY(0.92), walk: GREY(0.55), band: (c1) => c1, key: (c1) => c1,
             outline: GREY(0.92) },
    backWall: "header",
  },
  carbon: {
    label: "Night carbon",
    wall: { dado: (c1) => mix(GREY(0.03), c1, 0.10), stripe: (c1, c2) => c2, panel: (c1) => mix([0.035, 0.040, 0.060], c1, 0.12),
            skirt: GREY(0.02), seam: "slat", back: (c1) => scale(c1, 0.55) },
    ceil: GREY(0.018), truss: "stock", ceilLed: "strips",
    floor: { slab: GREY(0.040), inner: GREY(0.055), paint: GREY(0.90), walk: (c1, c2) => scale(c2, 0.8), band: (c1, c2) => c2,
             key: (c1, c2) => c2, outline: GREY(0.88) },
    backWall: "frame",
  },
  flood: {
    label: "Team flood",
    wall: { dado: () => GREY(0.74), stripe: () => GREY(0.04), panel: (c1) => scale(c1, 0.92), skirt: GREY(0.05),
            seam: "none", back: null },
    ceil: GREY(0.24), truss: "stock", ceilLed: "none",
    floor: { slab: GREY(0.20), inner: (c1) => mix(GREY(0.20), c1, 0.38), paint: GREY(0.90), walk: GREY(0.85),
             band: (c1) => c1, key: GREY(0.90), outline: (c1, c2) => c2 },
    backWall: "header",
  },
  workshop: {
    label: "Bare workshop",
    wall: { dado: () => [0.16, 0.20, 0.17], stripe: () => [0.85, 0.66, 0.06], panel: () => [0.38, 0.36, 0.33], skirt: GREY(0.06),
            seam: "block", back: null },
    ceil: [0.12, 0.115, 0.11], truss: "heavy", ceilLed: "pendants",
    floor: { slab: [0.23, 0.22, 0.20], inner: [0.25, 0.24, 0.22], paint: [0.85, 0.66, 0.06], walk: [0.85, 0.66, 0.06],
             band: () => [0.85, 0.66, 0.06], key: () => [0.08, 0.08, 0.08], outline: null },
    backWall: "none",
  },
  porcelain: {
    label: "Porcelain lab",
    wall: { dado: () => [0.48, 0.62, 0.65], stripe: (c1, c2) => mix([0.06, 0.38, 0.48], c2, 0.25),
            panel: () => [0.76, 0.80, 0.79], skirt: GREY(0.12), seam: "joint", jointPitch: 2.70, back: null },
    ceil: [0.70, 0.76, 0.77], truss: "rails", ceilLed: "grid",
    floor: { slab: [0.16, 0.25, 0.29], inner: [0.24, 0.40, 0.46], paint: GREY(0.92), walk: [0.49, 0.65, 0.66],
             band: (c1) => c1, key: GREY(0.90), outline: GREY(0.88) },
    backWall: "header",
  },
  heritage: {
    label: "Heritage works",
    wall: { dado: () => [0.70, 0.62, 0.48], stripe: (c1) => scale(c1, 0.55),
            panel: () => [0.45, 0.24, 0.17], skirt: [0.12, 0.09, 0.07], seam: "block", back: null },
    ceil: [0.24, 0.19, 0.14], truss: "heavy", ceilLed: "pendants",
    floor: { slab: [0.27, 0.23, 0.18], inner: [0.38, 0.32, 0.24], paint: [0.88, 0.71, 0.28], walk: [0.72, 0.57, 0.24],
             band: (c1) => scale(c1, 0.70), key: [0.08, 0.07, 0.06], outline: null },
    backWall: "none",
  },
  endurance: {
    label: "Endurance blue",
    wall: { dado: () => [0.19, 0.27, 0.34], stripe: (c1, c2) => mix([0.92, 0.43, 0.07], c2, 0.20),
            panel: () => [0.07, 0.14, 0.24], skirt: GREY(0.04), seam: "none", back: null },
    ceil: [0.16, 0.23, 0.32], truss: "rails", ceilLed: "strips",
    floor: { slab: [0.07, 0.11, 0.16], inner: [0.10, 0.16, 0.22], paint: GREY(0.92), walk: [0.92, 0.47, 0.10],
             band: (c1) => c1, key: GREY(0.90), outline: [0.94, 0.55, 0.14] },
    backWall: "frame",
  },
  rainready: {
    label: "Rain ready",
    wall: { dado: () => [0.28, 0.32, 0.34], stripe: (c1, c2) => mix([0.55, 0.62, 0.70], c2, 0.35),
            panel: () => [0.42, 0.46, 0.50], skirt: GREY(0.06), seam: "joint", jointPitch: 1.80, back: null },
    ceil: [0.30, 0.34, 0.38], truss: "rails", ceilLed: "grid",
    floor: { slab: [0.08, 0.10, 0.12], inner: [0.12, 0.15, 0.18], paint: GREY(0.88), walk: [0.70, 0.74, 0.78],
             band: (c1) => mix(GREY(0.55), c1, 0.35), key: GREY(0.90), outline: [0.72, 0.78, 0.84], wetBands: true },
    backWall: "header",
  },
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
let _look = "stock";
try {
  const q = typeof location !== "undefined" && new URLSearchParams(location.search).get("garageLook");
  const s = typeof localStorage !== "undefined" && localStorage.getItem("apex26.garageLook");
  const v = q || s;
  if (v && LOOK_IDS.indexOf(v) >= 0) _look = v;
} catch (_) {  }
function setLook(id) {
  if (LOOK_IDS.indexOf(id) < 0) return false;
  _look = id;
  try { if (typeof GameStore !== "undefined" && GameStore.store) GameStore.store.rawSet("garageLook", id); else localStorage.setItem("apex26.garageLook", id); } catch (_) {  }
  return true;
}
const lookId = () => _look;
const look = () => LOOKS[_look] || null;
const lookCol = (v, c1, c2) => (typeof v === "function" ? v(c1, c2) : v);

  return { tile, pushMat, HALF_W, Z_BACK, Z_DOOR, CEIL_Y, PANEL, STEEL, DARK, panelGrid, block, cyl, tube, hose, MAT, smooth, scale, rgb, css,
    LOOKS, LOOK_IDS, setLook, lookId, look, lookCol };
})();
if (typeof window !== "undefined") window.GaragePrims = GaragePrims;
