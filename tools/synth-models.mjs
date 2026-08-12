/*
 * Apex 26 — procedural AX26 model catalog.
 *
 * AUTHOR-TIME ONLY (imported by tools/assets.mjs bake-synthetic-models).
 * Generates the same model IDs the circuits already place via bakedModel(),
 * so a no-network rebuild replaces Kenney/glTF downloads without touching
 * js/circuits/*. Geometry is intentionally low-poly: the runtime still
 * samples baked MAT textures (triplanar) on these verts.
 *
 * Models are authored facing +Z (toward the track after bakedModel yaw).
 * +Y is up. Origin sits on the ground plane at the footprint centre.
 */
export const MAT = {
  FLAT: 0, CONCRETE: 1, BRICK: 2, GLASS: 3, METAL: 4, WOOD: 5, FOLIAGE: 6,
  FABRIC: 7, SAND: 8, GRASS: 9, ROCK: 10, SNOW: 11, ROOF: 12, STONE: 13,
  RUST: 14, FLAG: 15, ASPHALT: 16,
};

/** Mutable triangle soup → AX26 buffers. */
export function MeshBuilder() {
  const pos = [], nrm = [], col = [], mat = [], idx = [];

  function vert(x, y, z, nx, ny, nz, rgb, mid) {
    const i = pos.length / 3;
    pos.push(x, y, z);
    nrm.push(nx, ny, nz);
    col.push(rgb[0], rgb[1], rgb[2]);
    mat.push(mid);
    return i;
  }

  function tri(a, b, c) { idx.push(a, b, c); }

  /** Axis-aligned box centred at (cx,cy,cz). */
  function box(cx, cy, cz, w, h, d, rgb, mid) {
    const hx = w * 0.5, hy = h * 0.5, hz = d * 0.5;
    const faces = [
      // +Z, -Z, +X, -X, +Y, -Y
      [[0, 0, 1],  [[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]]],
      [[0, 0, -1], [[hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz]]],
      [[1, 0, 0],  [[hx, -hy, hz], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz]]],
      [[-1, 0, 0], [[-hx, -hy, -hz], [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz]]],
      [[0, 1, 0],  [[-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz], [-hx, hy, -hz]]],
      [[0, -1, 0], [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz]]],
    ];
    for (const [N, Q] of faces) {
      const v = Q.map(([x, y, z]) => vert(cx + x, cy + y, cz + z, N[0], N[1], N[2], rgb, mid));
      tri(v[0], v[1], v[2]); tri(v[0], v[2], v[3]);
    }
  }

  /** Vertical cylinder; base on y=cy, height h, radius r. */
  function cyl(cx, cy, cz, r, h, rgb, mid, segs = 8) {
    const top = [], bot = [];
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2;
      const a1 = ((i + 1) / segs) * Math.PI * 2;
      const x0 = Math.cos(a0) * r, z0 = Math.sin(a0) * r;
      const x1 = Math.cos(a1) * r, z1 = Math.sin(a1) * r;
      const nx = Math.cos((a0 + a1) * 0.5), nz = Math.sin((a0 + a1) * 0.5);
      const b0 = vert(cx + x0, cy, cz + z0, nx, 0, nz, rgb, mid);
      const b1 = vert(cx + x1, cy, cz + z1, nx, 0, nz, rgb, mid);
      const t0 = vert(cx + x0, cy + h, cz + z0, nx, 0, nz, rgb, mid);
      const t1 = vert(cx + x1, cy + h, cz + z1, nx, 0, nz, rgb, mid);
      tri(b0, b1, t1); tri(b0, t1, t0);
      bot.push(b0); top.push(t0);
    }
    const bc = vert(cx, cy, cz, 0, -1, 0, rgb, mid);
    const tc = vert(cx, cy + h, cz, 0, 1, 0, rgb, mid);
    for (let i = 0; i < segs; i++) {
      tri(bc, bot[(i + 1) % segs], bot[i]);
      tri(tc, top[i], top[(i + 1) % segs]);
    }
  }

  /** Cone (or frustum if rTop > 0); base at y=cy. */
  function cone(cx, cy, cz, rBase, rTop, h, rgb, mid, segs = 8) {
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2;
      const a1 = ((i + 1) / segs) * Math.PI * 2;
      const b0 = vert(cx + Math.cos(a0) * rBase, cy, cz + Math.sin(a0) * rBase, Math.cos(a0), 0.2, Math.sin(a0), rgb, mid);
      const b1 = vert(cx + Math.cos(a1) * rBase, cy, cz + Math.sin(a1) * rBase, Math.cos(a1), 0.2, Math.sin(a1), rgb, mid);
      const t0 = vert(cx + Math.cos(a0) * rTop, cy + h, cz + Math.sin(a0) * rTop, Math.cos(a0), 0.2, Math.sin(a0), rgb, mid);
      const t1 = vert(cx + Math.cos(a1) * rTop, cy + h, cz + Math.sin(a1) * rTop, Math.cos(a1), 0.2, Math.sin(a1), rgb, mid);
      tri(b0, b1, t1); tri(b0, t1, t0);
    }
    if (rBase > 0.01) {
      const bc = vert(cx, cy, cz, 0, -1, 0, rgb, mid);
      for (let i = 0; i < segs; i++) {
        const a0 = (i / segs) * Math.PI * 2, a1 = ((i + 1) / segs) * Math.PI * 2;
        const p0 = vert(cx + Math.cos(a0) * rBase, cy, cz + Math.sin(a0) * rBase, 0, -1, 0, rgb, mid);
        const p1 = vert(cx + Math.cos(a1) * rBase, cy, cz + Math.sin(a1) * rBase, 0, -1, 0, rgb, mid);
        tri(bc, p1, p0);
      }
    }
  }

  function sizeM() {
    let mnx = Infinity, mny = Infinity, mnz = Infinity;
    let mxx = -Infinity, mxy = -Infinity, mxz = -Infinity;
    for (let i = 0; i < pos.length; i += 3) {
      mnx = Math.min(mnx, pos[i]); mxx = Math.max(mxx, pos[i]);
      mny = Math.min(mny, pos[i + 1]); mxy = Math.max(mxy, pos[i + 1]);
      mnz = Math.min(mnz, pos[i + 2]); mxz = Math.max(mxz, pos[i + 2]);
    }
    return [
      +(mxx - mnx).toFixed(2),
      +(mxy - mny).toFixed(2),
      +(mxz - mnz).toFixed(2),
    ];
  }

  function toMesh(defaultMat) {
    const nv = pos.length / 3;
    return {
      pos: Float32Array.from(pos),
      nrm: Float32Array.from(nrm),
      col: Float32Array.from(col),
      mat: Float32Array.from(mat.length ? mat : new Array(nv).fill(defaultMat)),
      idx: Uint32Array.from(idx),
      sizeM: sizeM(),
      verts: nv,
      tris: idx.length / 3,
    };
  }

  return { box, cyl, cone, toMesh, sizeM, vertCount: () => pos.length / 3 };
}

// ── silhouette recipes (match Kenney footprint sizes approximately) ─────────

function windows(M, W, H, D, floors, cols, rgb, faceZ) {
  const fh = H / (floors + 0.6);
  const cw = W / (cols + 0.5);
  const z = faceZ * (D * 0.5 + 0.06);
  for (let f = 0; f < floors; f++) {
    for (let c = 0; c < cols; c++) {
      const x = -W * 0.5 + cw * (c + 0.75);
      const y = fh * (f + 0.85);
      M.box(x, y, z, cw * 0.55, fh * 0.55, 0.12, rgb, MAT.GLASS);
    }
  }
}

function building(M, W, H, D, opts = {}) {
  const wallMat = opts.mat != null ? opts.mat : MAT.CONCRETE;
  const wall = opts.wall || [0.58, 0.58, 0.60];
  const roof = opts.roof || [0.38, 0.38, 0.40];
  const win = opts.win || [0.28, 0.32, 0.38];
  const floors = opts.floors || Math.max(2, Math.round(H / 3.5));
  const cols = opts.cols || Math.max(2, Math.round(W / 3.5));
  M.box(0, H * 0.5, 0, W, H, D, wall, wallMat);
  M.box(0, H + 0.28, 0, W * 1.06, 0.55, D * 1.06, roof, MAT.ROOF);
  // Plinth
  M.box(0, 0.35, 0, W * 1.04, 0.7, D * 1.04, [wall[0] * 0.85, wall[1] * 0.85, wall[2] * 0.88], wallMat);
  windows(M, W, H, D, floors, cols, win, +1);
  windows(M, W, H, D, floors, Math.max(1, cols - 1), win, -1);
  if (opts.door) {
    M.box(0, 1.2, D * 0.5 + 0.08, Math.min(2.2, W * 0.25), 2.4, 0.16, [0.22, 0.22, 0.24], MAT.METAL);
  }
  if (opts.chimney) {
    const r = Math.min(W, D) * 0.08;
    M.cyl(W * 0.28, H + 0.5, -D * 0.2, r, H * 0.35, [0.45, 0.45, 0.48], MAT.CONCRETE, 6);
  }
}

function lowDetail(M, W, H, D, mat, wall) {
  M.box(0, H * 0.5, 0, W, H, D, wall, mat);
  M.box(0, H + 0.2, 0, W * 1.02, 0.4, D * 1.02, [0.35, 0.35, 0.37], MAT.ROOF);
}

/** Catalog: id → { mat, build(M) }. IDs match existing circuit bakedModel() calls. */
export const CATALOG = {
  "kenney_construction-barrier": {
    mat: "CONCRETE",
    build(M) {
      // Jersey barrier silhouette
      M.box(0, 0.35, 0, 0.55, 0.7, 1.85, [0.78, 0.78, 0.80], MAT.CONCRETE);
      M.box(0, 0.85, 0, 0.35, 0.5, 1.7, [0.72, 0.72, 0.74], MAT.CONCRETE);
      M.box(0, 0.15, 0, 0.88, 0.3, 1.89, [0.70, 0.70, 0.72], MAT.CONCRETE);
    },
  },
  "kenney_construction-cone": {
    mat: "CONCRETE",
    build(M) {
      M.box(0, 0.04, 0, 0.8, 0.08, 0.8, [0.85, 0.85, 0.88], MAT.CONCRETE);
      M.cone(0, 0.08, 0, 0.28, 0.04, 0.9, [1.0, 0.45, 0.12], MAT.FABRIC, 8);
    },
  },
  "kenney_construction-light": {
    mat: "METAL",
    build(M) {
      M.cyl(0, 0, 0, 0.06, 0.85, [0.45, 0.45, 0.48], MAT.METAL, 6);
      M.box(0, 0.92, 0.05, 0.22, 0.1, 0.28, [0.9, 0.9, 0.85], MAT.METAL);
    },
  },
  "kenney_ind_building-a": {
    mat: "CONCRETE",
    build(M) {
      building(M, 19.5, 14, 11.5, { floors: 3, cols: 5, door: true, chimney: true,
        wall: [0.62, 0.62, 0.64], roof: [0.42, 0.42, 0.44] });
    },
  },
  "kenney_ind_building-b": {
    mat: "CONCRETE",
    build(M) {
      building(M, 19.5, 14, 12, { floors: 3, cols: 5, door: true,
        wall: [0.60, 0.60, 0.62], roof: [0.40, 0.40, 0.42] });
      M.box(-6, 3, 6.2, 4, 6, 0.4, [0.55, 0.55, 0.58], MAT.CONCRETE); // lean-to
    },
  },
  "kenney_ind_building-c": {
    mat: "CONCRETE",
    build(M) {
      building(M, 20.5, 14, 23, { floors: 3, cols: 5, door: true,
        wall: [0.58, 0.58, 0.60] });
    },
  },
  "kenney_ind_building-d": {
    mat: "CONCRETE",
    build(M) {
      building(M, 8.5, 14, 14, { floors: 4, cols: 2, door: true,
        wall: [0.64, 0.64, 0.66] });
    },
  },
  "kenney_ind_building-e": {
    mat: "CONCRETE",
    build(M) {
      building(M, 14, 14, 10.5, { floors: 3, cols: 4, door: true,
        wall: [0.61, 0.61, 0.63] });
    },
  },
  "kenney_ind_building-g": {
    mat: "CONCRETE",
    build(M) {
      building(M, 18, 14, 14, { floors: 3, cols: 4, chimney: true,
        wall: [0.59, 0.59, 0.61] });
    },
  },
  "kenney_ind_building-h": {
    mat: "CONCRETE",
    build(M) {
      building(M, 24, 14, 24, { floors: 2, cols: 6, door: true,
        wall: [0.57, 0.57, 0.59] });
    },
  },
  "kenney_ind_building-l": {
    mat: "CONCRETE",
    build(M) {
      building(M, 15, 14, 13.5, { floors: 3, cols: 4, door: true,
        wall: [0.63, 0.62, 0.60] });
    },
  },
  "kenney_ind_building-o": {
    mat: "CONCRETE",
    build(M) {
      building(M, 13, 14, 18.5, { floors: 3, cols: 3, door: true,
        wall: [0.60, 0.60, 0.62] });
    },
  },
  "kenney_ind_building-q": {
    mat: "CONCRETE",
    build(M) {
      building(M, 33, 14, 27, { floors: 2, cols: 8, door: true,
        wall: [0.56, 0.56, 0.58] });
    },
  },
  "kenney_ind_chimney-medium": {
    mat: "CONCRETE",
    build(M) {
      M.cyl(0, 0, 0, 1.4, 14, [0.55, 0.55, 0.57], MAT.CONCRETE, 8);
      M.cyl(0, 13.2, 0, 1.55, 0.8, [0.48, 0.48, 0.50], MAT.CONCRETE, 8);
    },
  },
  "kenney_ind_chimney-large": {
    mat: "CONCRETE",
    build(M) {
      M.cyl(0, 0, 0, 3.5, 14, [0.52, 0.52, 0.54], MAT.CONCRETE, 10);
      M.cyl(0, 13, 0, 3.8, 1.0, [0.45, 0.45, 0.47], MAT.CONCRETE, 10);
    },
  },
  "kenney_ind_detail-tank": {
    mat: "METAL",
    build(M) {
      // Horizontal tank on stilts (~28×14×17 footprint at author scale).
      const L = 18, W = 7, H = 7, y0 = 5.5;
      M.box(0, y0, 0, W, H, L, [0.55, 0.58, 0.62], MAT.METAL);
      M.box(0, y0, L * 0.5 + 0.4, W * 0.9, H * 0.9, 0.8, [0.50, 0.52, 0.56], MAT.METAL);
      M.box(0, y0, -L * 0.5 - 0.4, W * 0.9, H * 0.9, 0.8, [0.50, 0.52, 0.56], MAT.METAL);
      for (const z of [-L * 0.35, -L * 0.12, L * 0.12, L * 0.35]) {
        for (const x of [-W * 0.35, W * 0.35]) {
          M.cyl(x, 0, z, 0.35, y0 - H * 0.45, [0.40, 0.40, 0.42], MAT.METAL, 5);
        }
      }
    },
  },
  "kenney_com_building-a": {
    mat: "BRICK",
    build(M) {
      building(M, 10.5, 16, 11.5, { mat: MAT.BRICK, floors: 4, cols: 3, door: true,
        wall: [0.62, 0.42, 0.36], roof: [0.40, 0.40, 0.42], win: [0.30, 0.36, 0.44] });
    },
  },
  "kenney_com_building-b": {
    mat: "BRICK",
    build(M) {
      building(M, 13, 18, 13, { mat: MAT.BRICK, floors: 5, cols: 3, door: true,
        wall: [0.58, 0.40, 0.34], roof: [0.38, 0.38, 0.40] });
    },
  },
  "kenney_com_building-e": {
    mat: "BRICK",
    build(M) {
      building(M, 28, 16, 17.5, { mat: MAT.BRICK, floors: 4, cols: 7, door: true,
        wall: [0.60, 0.44, 0.38] });
    },
  },
  "kenney_com_building-f": {
    mat: "BRICK",
    build(M) {
      building(M, 8.5, 18, 10.5, { mat: MAT.BRICK, floors: 5, cols: 2, door: true, chimney: true,
        wall: [0.55, 0.38, 0.32] });
    },
  },
  "kenney_com_building-skyscraper-b": {
    mat: "BRICK",
    build(M) {
      building(M, 5.2, 18, 5.2, { mat: MAT.BRICK, floors: 6, cols: 2,
        wall: [0.50, 0.50, 0.54], roof: [0.35, 0.35, 0.38], win: [0.35, 0.42, 0.52] });
      M.cyl(0, 18.5, 0, 0.15, 3.5, [0.45, 0.45, 0.48], MAT.METAL, 5);
    },
  },
  "kenney_com_low-detail-building-a": {
    mat: "BRICK",
    build(M) { lowDetail(M, 4, 16, 4, MAT.BRICK, [0.58, 0.42, 0.36]); },
  },
  "kenney_com_low-detail-building-c": {
    mat: "BRICK",
    build(M) { lowDetail(M, 4, 18, 4, MAT.BRICK, [0.55, 0.40, 0.34]); },
  },
  "kenney_com_low-detail-building-wide-a": {
    mat: "BRICK",
    build(M) { lowDetail(M, 14.5, 16, 7.2, MAT.BRICK, [0.60, 0.44, 0.38]); },
  },
  "kenney_com_low-detail-building-wide-b": {
    mat: "BRICK",
    build(M) { lowDetail(M, 15.5, 18, 7.8, MAT.BRICK, [0.57, 0.41, 0.35]); },
  },
  "kenney_twr_building-sample-house-b": {
    mat: "CONCRETE",
    build(M) {
      building(M, 9.5, 10, 12, { floors: 2, cols: 3, door: true, chimney: true,
        wall: [0.72, 0.70, 0.66], roof: [0.45, 0.35, 0.30], mat: MAT.CONCRETE });
      // Pitched roof suggestion
      M.box(0, 11.2, 0, 10.2, 0.35, 12.8, [0.42, 0.32, 0.28], MAT.ROOF);
    },
  },
  "kenney_twr_building-sample-tower-a": {
    mat: "CONCRETE",
    build(M) {
      building(M, 7.5, 18, 8.5, { floors: 5, cols: 2,
        wall: [0.68, 0.68, 0.70], win: [0.32, 0.38, 0.48] });
    },
  },
  "kenney_twr_building-sample-tower-c": {
    mat: "CONCRETE",
    build(M) {
      building(M, 6, 18, 7, { floors: 5, cols: 2,
        wall: [0.66, 0.66, 0.68] });
    },
  },
  "kenney_sub_building-type-a": {
    mat: "BRICK",
    build(M) {
      building(M, 15, 10, 12, { mat: MAT.BRICK, floors: 2, cols: 4, door: true,
        wall: [0.64, 0.46, 0.40] });
    },
  },
  "kenney_sub_building-type-c": {
    mat: "BRICK",
    build(M) {
      building(M, 12, 10, 9.5, { mat: MAT.BRICK, floors: 2, cols: 3, door: true,
        wall: [0.62, 0.44, 0.38] });
    },
  },
  "kenney_sub_building-type-h": {
    mat: "BRICK",
    build(M) {
      building(M, 17, 10, 12, { mat: MAT.BRICK, floors: 2, cols: 5, door: true,
        wall: [0.60, 0.48, 0.42] });
    },
  },
  "kenney_sub_building-type-k": {
    mat: "BRICK",
    build(M) {
      building(M, 8, 10, 8.5, { mat: MAT.BRICK, floors: 2, cols: 2, door: true, chimney: true,
        wall: [0.66, 0.48, 0.42] });
    },
  },
  "kenney_sub_building-type-r": {
    mat: "BRICK",
    build(M) {
      building(M, 9, 10, 8.5, { mat: MAT.BRICK, floors: 2, cols: 3, door: true,
        wall: [0.58, 0.42, 0.36] });
    },
  },
  "kenney_sub_fence": {
    mat: "WOOD",
    build(M) {
      M.box(-1.1, 0.7, 0, 0.12, 1.4, 0.12, [0.45, 0.36, 0.26], MAT.WOOD);
      M.box(1.1, 0.7, 0, 0.12, 1.4, 0.12, [0.45, 0.36, 0.26], MAT.WOOD);
      M.box(0, 0.45, 0, 2.4, 0.12, 0.08, [0.50, 0.40, 0.30], MAT.WOOD);
      M.box(0, 1.0, 0, 2.4, 0.12, 0.08, [0.50, 0.40, 0.30], MAT.WOOD);
    },
  },
  "kenney_sub_fence-low": {
    mat: "WOOD",
    build(M) {
      for (let i = 0; i < 5; i++) {
        const x = -4.5 + i * 2.25;
        M.box(x, 0.55, 0, 0.12, 1.1, 0.12, [0.45, 0.36, 0.26], MAT.WOOD);
      }
      M.box(0, 0.35, 0, 10.2, 0.1, 0.08, [0.50, 0.40, 0.30], MAT.WOOD);
      M.box(0, 0.85, 0, 10.2, 0.1, 0.08, [0.50, 0.40, 0.30], MAT.WOOD);
    },
  },
  "kenney_sub_planter": {
    mat: "WOOD",
    build(M) {
      M.box(0, 0.35, 0, 3.0, 0.7, 2.2, [0.42, 0.34, 0.26], MAT.WOOD);
      M.box(0, 0.85, 0, 2.6, 0.35, 1.8, [0.30, 0.48, 0.28], MAT.FOLIAGE);
    },
  },
};

export function buildOne(id) {
  const rec = CATALOG[id];
  if (!rec) return null;
  const M = MeshBuilder();
  rec.build(M);
  const mesh = M.toMesh(MAT[rec.mat] || MAT.CONCRETE);
  return { ...mesh, matName: rec.mat, id };
}

export function buildAll() {
  const out = {};
  for (const id of Object.keys(CATALOG)) out[id] = buildOne(id);
  return out;
}

export const CATALOG_IDS = Object.keys(CATALOG);
