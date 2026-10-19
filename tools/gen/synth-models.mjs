/*
 * @doc Procedural AX26 model catalog for `assets.mjs bake-synthetic-models` — buildings, grandstands, industrial; no network.
 * @skill asset-pack
 * Apex 26 — procedural AX26 model catalog.
 *
 * AUTHOR-TIME ONLY (imported by tools/gen/assets.mjs bake-synthetic-models).
 * Author-time MeshBuilder retained for future procedural AX26 recipes.
 * The shipped catalog is empty after #1617: circuits place the Racing Kit
 * (`k_*`) or a procedural `building()`, and `bake-synthetic-models` no
 * longer emits synthetic `kenney_*` bins.
 *
 * Models are authored facing +Z (toward the track after bakedModel yaw).
 * +Y is up. Origin sits on the ground plane at the footprint centre.
 *
 * Variation knobs live on building()/lowDetail() so two "warehouse" ids do not
 * share one silhouette — loading bays, balconies, roof plant, awnings, etc.
 */
export const MAT = {
  FLAT: 0, CONCRETE: 1, BRICK: 2, GLASS: 3, METAL: 4, WOOD: 5, FOLIAGE: 6,
  FABRIC: 7, SAND: 8, GRASS: 9, ROCK: 10, SNOW: 11, ROOF: 12, STONE: 13,
  RUST: 14, FLAG: 15, ASPHALT: 16,
};

const tint = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

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

// ── facade / detail helpers ──────────────────────────────────────────────────

/** Window panes + thin frames on one ±Z face. */
function facadeWindows(M, W, H, D, floors, cols, winCol, faceZ, opts = {}) {
  const frame = opts.frame || tint(winCol, 0.55);
  const fh = H / (floors + 0.85);
  const cw = W / (cols + 0.6);
  const z = faceZ * (D * 0.5 + 0.05);
  const skipDoor = opts.skipDoorCol; // 0-based col index left empty for a door
  for (let f = 0; f < floors; f++) {
    for (let c = 0; c < cols; c++) {
      if (f === 0 && skipDoor != null && c === skipDoor) continue;
      const x = -W * 0.5 + cw * (c + 0.8);
      const y = 1.1 + fh * (f + 0.45);
      const ww = cw * 0.58, wh = fh * 0.55;
      // Frame first (slightly larger), then inset glass.
      M.box(x, y, z, ww + 0.12, wh + 0.12, 0.1, frame, MAT.METAL);
      M.box(x, y, z + faceZ * 0.04, ww, wh, 0.08, winCol, MAT.GLASS);
      // Cross mullion on larger panes
      if (ww > 1.4) M.box(x, y, z + faceZ * 0.06, 0.06, wh, 0.06, frame, MAT.METAL);
      if (wh > 1.2) M.box(x, y, z + faceZ * 0.06, ww, 0.06, 0.06, frame, MAT.METAL);
    }
  }
}

/** Window band on ±X side faces (fewer columns). */
function sideWindows(M, W, H, D, floors, cols, winCol, faceX) {
  const frame = tint(winCol, 0.55);
  const fh = H / (floors + 0.85);
  const cd = D / (cols + 0.6);
  const x = faceX * (W * 0.5 + 0.05);
  for (let f = 0; f < floors; f++) {
    for (let c = 0; c < cols; c++) {
      const z = -D * 0.5 + cd * (c + 0.8);
      const y = 1.1 + fh * (f + 0.45);
      const ww = 0.1, wd = cd * 0.5, wh = fh * 0.5;
      M.box(x, y, z, ww + 0.08, wh + 0.1, wd + 0.1, frame, MAT.METAL);
      M.box(x + faceX * 0.04, y, z, ww, wh, wd, winCol, MAT.GLASS);
    }
  }
}

function door(M, W, D, opts = {}) {
  const w = opts.w || Math.min(2.4, W * 0.22);
  const h = opts.h || 2.6;
  const z = D * 0.5 + 0.1;
  const col = opts.col || [0.22, 0.22, 0.25];
  M.box(opts.x || 0, h * 0.5 + 0.05, z, w, h, 0.18, col, MAT.METAL);
  // Frame / lintel
  M.box(opts.x || 0, h + 0.15, z, w + 0.35, 0.22, 0.2, tint(col, 1.15), MAT.METAL);
  if (opts.awning) {
    M.box(opts.x || 0, h + 0.35, z + 0.45, w + 0.8, 0.12, 0.9,
          opts.awningCol || [0.55, 0.18, 0.14], MAT.FABRIC);
  }
}

function loadingBay(M, W, D, y, bayW, bayH) {
  const z = D * 0.5 + 0.08;
  // Recessed dark opening + roll-door stripes
  M.box(0, y + bayH * 0.5, z, bayW, bayH, 0.2, [0.18, 0.18, 0.20], MAT.METAL);
  const stripes = 5;
  for (let i = 0; i < stripes; i++) {
    const yy = y + (i + 0.5) * (bayH / stripes);
    M.box(0, yy, z + 0.06, bayW * 0.96, bayH / stripes * 0.7, 0.08,
          i % 2 ? [0.35, 0.35, 0.38] : [0.28, 0.28, 0.30], MAT.METAL);
  }
  // Ramp / dock lip
  M.box(0, 0.25, z + 0.7, bayW * 1.1, 0.5, 1.2, [0.45, 0.45, 0.47], MAT.CONCRETE);
}

function roofPlant(M, W, H, D, style) {
  const y = H + 0.55;
  if (style === "hvac" || style === "both") {
    M.box(-W * 0.22, y + 0.7, -D * 0.15, W * 0.18, 1.4, D * 0.22, [0.42, 0.42, 0.45], MAT.METAL);
    M.box(-W * 0.22, y + 1.5, -D * 0.15, W * 0.14, 0.35, D * 0.16, [0.38, 0.38, 0.40], MAT.METAL);
  }
  if (style === "vents" || style === "both") {
    for (const sx of [-0.15, 0.2]) {
      M.cyl(W * sx, y, D * 0.25, 0.35, 0.9, [0.48, 0.48, 0.50], MAT.METAL, 6);
    }
  }
  if (style === "tank") {
    M.cyl(W * 0.25, y, -D * 0.2, 0.9, 2.2, [0.55, 0.35, 0.28], MAT.RUST, 8);
  }
  if (style === "antenna") {
    M.cyl(0, y, 0, 0.08, 3.2, [0.5, 0.5, 0.52], MAT.METAL, 5);
    M.box(0, y + 3.2, 0, 0.5, 0.15, 0.15, [0.7, 0.2, 0.15], MAT.METAL);
  }
}

function balconies(M, W, H, D, floors, cols) {
  const fh = H / (floors + 0.85);
  const cw = W / (cols + 0.6);
  const z = D * 0.5 + 0.55;
  for (let f = 1; f < floors; f += 2) {
    for (let c = 0; c < cols; c += 2) {
      const x = -W * 0.5 + cw * (c + 0.8);
      const y = 1.1 + fh * (f + 0.05);
      M.box(x, y, z, cw * 0.7, 0.12, 0.9, [0.55, 0.55, 0.58], MAT.CONCRETE);
      M.box(x, y + 0.5, z + 0.35, cw * 0.65, 0.08, 0.08, [0.7, 0.7, 0.72], MAT.METAL);
      M.box(x - cw * 0.3, y + 0.25, z + 0.35, 0.06, 0.5, 0.06, [0.7, 0.7, 0.72], MAT.METAL);
      M.box(x + cw * 0.3, y + 0.25, z + 0.35, 0.06, 0.5, 0.06, [0.7, 0.7, 0.72], MAT.METAL);
    }
  }
}

function cornice(M, W, H, D, col) {
  M.box(0, H - 0.15, 0, W * 1.08, 0.35, D * 1.08, col || [0.5, 0.5, 0.52], MAT.CONCRETE);
}

function parapet(M, W, H, D, col) {
  const y = H + 0.55;
  const c = col || [0.48, 0.48, 0.50];
  M.box(0, y, D * 0.5, W * 1.04, 0.55, 0.22, c, MAT.CONCRETE);
  M.box(0, y, -D * 0.5, W * 1.04, 0.55, 0.22, c, MAT.CONCRETE);
  M.box(W * 0.5, y, 0, 0.22, 0.55, D * 1.0, c, MAT.CONCRETE);
  M.box(-W * 0.5, y, 0, 0.22, 0.55, D * 1.0, c, MAT.CONCRETE);
}

/**
 * Full building with style variation.
 * opts.style: "warehouse" | "office" | "shed" | "tower" | "house" | "slab"
 * opts: floors, cols, door, awning, loading, balconies, chimney, roofPlant,
 *       parapet, cornice, sideWins, wall, roof, win, mat
 */
function building(M, W, H, D, opts = {}) {
  const wallMat = opts.mat != null ? opts.mat : MAT.CONCRETE;
  const wall = opts.wall || [0.58, 0.58, 0.60];
  const roof = opts.roof || [0.38, 0.38, 0.40];
  const win = opts.win || [0.28, 0.32, 0.38];
  const style = opts.style || "office";
  const floors = opts.floors || Math.max(2, Math.round(H / 3.5));
  const cols = opts.cols || Math.max(2, Math.round(W / 3.5));

  // Mass
  M.box(0, H * 0.5, 0, W, H, D, wall, wallMat);
  // Plinth
  M.box(0, 0.4, 0, W * 1.05, 0.8, D * 1.05, tint(wall, 0.82), wallMat);

  // Roof slab / pitched house roof
  if (style === "house") {
    M.box(0, H + 0.15, 0, W * 1.12, 0.35, D * 1.12, roof, MAT.ROOF);
    // Simple pitched ridge (two slabs leaning via stepped boxes)
    M.box(0, H + 1.1, 0, W * 0.15, 1.6, D * 1.05, tint(roof, 0.95), MAT.ROOF);
    M.box(-W * 0.28, H + 0.7, 0, W * 0.45, 0.9, D * 1.02, roof, MAT.ROOF);
    M.box(W * 0.28, H + 0.7, 0, W * 0.45, 0.9, D * 1.02, roof, MAT.ROOF);
  } else if (style === "shed") {
    // Sawtooth / lean-to roof — higher at back
    M.box(0, H + 0.4, -D * 0.15, W * 1.08, 0.45, D * 0.75, roof, MAT.ROOF);
    M.box(0, H + 0.9, D * 0.25, W * 1.08, 0.35, D * 0.45, tint(roof, 1.05), MAT.METAL);
  } else {
    M.box(0, H + 0.28, 0, W * 1.08, 0.55, D * 1.08, roof, MAT.ROOF);
  }

  if (opts.cornice !== false && style !== "shed" && style !== "house")
    cornice(M, W, H, D, tint(wall, 1.08));
  if (opts.parapet || style === "tower" || style === "office")
    parapet(M, W, H + 0.28, D, tint(roof, 1.1));

  // Facades
  const doorCol = style === "warehouse" ? Math.floor(cols / 2) : 0;
  facadeWindows(M, W, H, D, floors, cols, win, +1, { skipDoorCol: opts.door ? doorCol : null });
  facadeWindows(M, W, H, D, floors, Math.max(1, cols - 1), win, -1);
  if (opts.sideWins !== false)
    sideWindows(M, W, H, D, floors, Math.max(1, Math.round(cols * 0.5)), win, +1);

  if (opts.door) {
    door(M, W, D, {
      x: -W * 0.5 + (W / (cols + 0.6)) * (doorCol + 0.8),
      awning: opts.awning || style === "office" || style === "house",
      awningCol: opts.awningCol,
    });
  }

  if (opts.loading || style === "warehouse") {
    const bayW = Math.min(W * 0.45, 6);
    loadingBay(M, W, D, 0.6, bayW, Math.min(4.5, H * 0.4));
  }

  if (opts.balconies || style === "office")
    balconies(M, W, H, D, floors, cols);

  if (opts.chimney || style === "house") {
    const r = Math.min(W, D) * 0.07;
    M.box(W * 0.28, H + 1.2, -D * 0.22, r * 2.2, H * 0.4, r * 2.2, [0.45, 0.45, 0.48], MAT.BRICK);
    M.box(W * 0.28, H + 1.2 + H * 0.22, -D * 0.22, r * 2.6, 0.25, r * 2.6, [0.35, 0.35, 0.38], MAT.CONCRETE);
  }

  const plant = opts.roofPlant || (style === "warehouse" ? "hvac"
    : style === "tower" ? "antenna"
    : style === "office" ? "both"
    : style === "shed" ? "vents"
    : null);
  if (plant) roofPlant(M, W, H + (style === "house" ? 1.5 : 0.28), D, plant);

  // Vertical corner piers for warehouse / slab massing
  if (style === "warehouse" || style === "slab") {
    const pier = tint(wall, 0.9);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      M.box(sx * W * 0.48, H * 0.5, sz * D * 0.48, 0.55, H * 0.98, 0.55, pier, wallMat);
    }
  }

  // Mid-floor string course (office / brick)
  if (style === "office" || wallMat === MAT.BRICK) {
    for (let f = 1; f < floors; f++) {
      const y = 1.1 + (H / (floors + 0.85)) * f;
      M.box(0, y, D * 0.5 + 0.04, W * 0.98, 0.18, 0.12, tint(wall, 0.75), wallMat);
    }
  }
}

function lowDetail(M, W, H, D, mat, wall, opts = {}) {
  M.box(0, H * 0.5, 0, W, H, D, wall, mat);
  M.box(0, H + 0.2, 0, W * 1.04, 0.4, D * 1.04, opts.roof || [0.35, 0.35, 0.37], MAT.ROOF);
  M.box(0, 0.3, 0, W * 1.03, 0.6, D * 1.03, tint(wall, 0.85), mat);
  // Two window slots so a "low detail" tower is not a blank crate
  const win = opts.win || [0.28, 0.32, 0.38];
  const floors = Math.max(2, Math.round(H / 4));
  for (let f = 0; f < floors; f++) {
    const y = 1.5 + (H - 2) * ((f + 0.5) / floors);
    M.box(0, y, D * 0.5 + 0.05, W * 0.55, H / floors * 0.45, 0.1, win, MAT.GLASS);
    M.box(0, y, -D * 0.5 - 0.05, W * 0.45, H / floors * 0.4, 0.1, win, MAT.GLASS);
  }
  if (opts.plant) roofPlant(M, W, H + 0.2, D, opts.plant);
}

/** Catalog: id → { mat, build(M) }. Empty after #1617 Slice C —
 * every circuit now places the real Kenney Racing Kit (`k_*`) or a procedural
 * `building()`; the synthetic `kenney_*` recipes and bins are gone.
 */
export const CATALOG = {
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
