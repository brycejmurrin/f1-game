#!/usr/bin/env node
/**
 * bake-trees.mjs — bake three species × two LODs to AX26 v3 under artifacts/trees/.
 * @doc Manual tool: `npm i --no-save @dgreenheck/ez-tree three` (never a package.json
 *   dependency; ez-tree is still required for the palm path). Seeded, deterministic.
 *   Pine/tree use a hand-authored crown (#6037) so foliage ≥ wood and crown width ≥ ~30 %
 *   of height under tools/gen/trees/caps.mjs. Fails if any LOD exceeds those caps.
 *   Does not write assets/pack/** or the asset manifest (`install-trees.mjs` does).
 * @skill scenery-dress
 *
 *   node tools/gen/trees/bake-trees.mjs
 */
import { exitIfHelp } from "../../lib/cli-args.mjs";
exitIfHelp(process.argv[1]?.endsWith("/bake-trees.mjs") ? process.argv.slice(2) : [], "Usage: node tools/gen/trees/bake-trees.mjs [options]\nManual tool: `npm i --no-save @dgreenheck/ez-tree three` (never a package.json\n--help prints this and exits 0.");
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { LOD_CAPS, SPECIES, SWAY_FRAC } from "./caps.mjs";

const require = createRequire(import.meta.url);
const { writeAX26v3 } = require("../../lib/pack-assets.cjs");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const OUT = path.join(ROOT, "artifacts", "trees");
const MAT_FOLIAGE = 6;
const MAT_WOOD = 5;

/** DOM / TextureLoader stubs so @dgreenheck/ez-tree can load under Node. */
function installNodeShims() {
  class FakeImage {
    addEventListener(type, fn) { if (type === "load") queueMicrotask(fn); }
    removeEventListener() {}
    set src(_v) { queueMicrotask(() => { if (this.onload) this.onload(); }); }
  }
  const fakeEl = () => ({
    style: {}, width: 4, height: 4,
    setAttribute() {}, addEventListener() {},
    getContext() {
      return {
        fillRect() {}, clearRect() {}, drawImage() {},
        getImageData() { return { data: new Uint8ClampedArray(64), width: 4, height: 4 }; },
        putImageData() {},
        createImageData(w, h) {
          return { data: new Uint8ClampedArray((w || 4) * (h || 4) * 4), width: w || 4, height: h || 4 };
        },
        canvas: { width: 4, height: 4 },
      };
    },
  });
  globalThis.document = {
    createElementNS: () => fakeEl(),
    createElement: (t) => (t === "img" ? new FakeImage() : fakeEl()),
  };
  globalThis.Image = FakeImage;
  globalThis.window = globalThis;
  globalThis.self = globalThis;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** ez-tree options that stay inside the cone / measured budget. */
function speciesOptions(species, lod, TreeType) {
  const evergreen = TreeType.Evergreen;
  const deciduous = TreeType.Deciduous;
  if (species === "pine") {
    if (lod === 0) {
      return {
        type: evergreen, seed: 101,
        leaves: { count: 6, size: 2.2, sizeVariance: 0.2, start: 0.35, angle: 25 },
        branch: {
          levels: 0,
          sections: { 0: 4, 1: 3, 2: 2, 3: 2 },
          segments: { 0: 4, 1: 3, 2: 2, 3: 2 },
          length: { 0: 10, 1: 4, 2: 2, 3: 1 },
          radius: { 0: 0.35, 1: 0.2, 2: 0.1, 3: 0.08 },
          children: { 0: 0, 1: 0, 2: 0 },
        },
      };
    }
    return {
      type: evergreen, seed: 101,
      leaves: { count: 3, size: 2.4, sizeVariance: 0.15, start: 0.4, angle: 20 },
      branch: {
        levels: 0,
        sections: { 0: 3, 1: 2, 2: 2, 3: 2 },
        segments: { 0: 3, 1: 2, 2: 2, 3: 2 },
        length: { 0: 9, 1: 3, 2: 2, 3: 1 },
        radius: { 0: 0.32, 1: 0.18, 2: 0.1, 3: 0.08 },
        children: { 0: 0, 1: 0, 2: 0 },
      },
    };
  }
  if (species === "tree") {
    if (lod === 0) {
      return {
        type: deciduous, seed: 202,
        leaves: { count: 8, size: 2.0, sizeVariance: 0.25, start: 0.3, angle: 15 },
        branch: {
          levels: 0,
          sections: { 0: 4, 1: 3, 2: 2, 3: 2 },
          segments: { 0: 4, 1: 3, 2: 2, 3: 2 },
          length: { 0: 12, 1: 5, 2: 2, 3: 1 },
          radius: { 0: 0.4, 1: 0.22, 2: 0.12, 3: 0.08 },
          children: { 0: 0, 1: 0, 2: 0 },
        },
      };
    }
    return {
      type: deciduous, seed: 202,
      leaves: { count: 4, size: 2.2, sizeVariance: 0.2, start: 0.35, angle: 12 },
      branch: {
        levels: 0,
        sections: { 0: 3, 1: 2, 2: 2, 3: 2 },
        segments: { 0: 3, 1: 2, 2: 2, 3: 2 },
        length: { 0: 11, 1: 4, 2: 2, 3: 1 },
        radius: { 0: 0.38, 1: 0.2, 2: 0.1, 3: 0.08 },
        children: { 0: 0, 1: 0, 2: 0 },
      },
    };
  }
  // palm — elongated trunk, few large frond cards (no native palm type)
  if (lod === 0) {
    return {
      type: deciduous, seed: 303,
      leaves: { count: 9, size: 3.5, sizeVariance: 0.15, start: 0.85, angle: 70 },
      branch: {
        levels: 0,
        sections: { 0: 5, 1: 2, 2: 2, 3: 2 },
        segments: { 0: 4, 1: 2, 2: 2, 3: 2 },
        length: { 0: 14, 1: 2, 2: 1, 3: 1 },
        radius: { 0: 0.28, 1: 0.12, 2: 0.08, 3: 0.06 },
        taper: { 0: 0.85, 1: 0.7, 2: 0.7, 3: 0.7 },
        children: { 0: 0, 1: 0, 2: 0 },
      },
    };
  }
  return {
    type: deciduous, seed: 303,
    leaves: { count: 5, size: 3.8, sizeVariance: 0.1, start: 0.88, angle: 65 },
    branch: {
      levels: 0,
      sections: { 0: 4, 1: 2, 2: 2, 3: 2 },
      segments: { 0: 3, 1: 2, 2: 2, 3: 2 },
      length: { 0: 13, 1: 2, 2: 1, 3: 1 },
      radius: { 0: 0.26, 1: 0.1, 2: 0.08, 3: 0.06 },
      children: { 0: 0, 1: 0, 2: 0 },
    },
  };
}

function applyOpts(tree, opts) {
  tree.options.seed = opts.seed;
  tree.options.type = opts.type;
  tree.options.bark.textured = false;
  tree.options.bark.flatShading = true;
  Object.assign(tree.options.leaves, opts.leaves);
  for (const [k, v] of Object.entries(opts.branch)) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      tree.options.branch[k] = Object.assign({}, tree.options.branch[k], v);
    } else {
      tree.options.branch[k] = v;
    }
  }
}

function geoToMesh(geometry, matId, y0, y1) {
  const posAttr = geometry.getAttribute("position");
  const nrmAttr = geometry.getAttribute("normal");
  const idxAttr = geometry.getIndex();
  const nv = posAttr.count;
  const pos = new Float32Array(nv * 3);
  const nrm = new Float32Array(nv * 3);
  const col = new Float32Array(nv * 3);
  const mat = new Float32Array(nv);
  const sway = new Float32Array(nv);
  const inv = 1 / Math.max(1e-6, y1 - y0);
  for (let i = 0; i < nv; i++) {
    const x = posAttr.getX(i), y = posAttr.getY(i), z = posAttr.getZ(i);
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    if (nrmAttr) {
      nrm[i * 3] = nrmAttr.getX(i);
      nrm[i * 3 + 1] = nrmAttr.getY(i);
      nrm[i * 3 + 2] = nrmAttr.getZ(i);
    } else {
      nrm[i * 3 + 1] = 1;
    }
    if (matId === MAT_FOLIAGE) {
      col[i * 3] = 0.18; col[i * 3 + 1] = 0.42; col[i * 3 + 2] = 0.16;
      const w = Math.max(0, Math.min(1, (y - y0) * inv));
      sway[i] = w;
      mat[i] = MAT_FOLIAGE + w * SWAY_FRAC;
    } else {
      col[i * 3] = 0.32; col[i * 3 + 1] = 0.22; col[i * 3 + 2] = 0.13;
      sway[i] = 0;
      mat[i] = MAT_WOOD;
    }
  }
  let idx;
  if (idxAttr) {
    idx = new Uint32Array(idxAttr.count);
    for (let i = 0; i < idxAttr.count; i++) idx[i] = idxAttr.getX(i);
  } else {
    idx = new Uint32Array(nv);
    for (let i = 0; i < nv; i++) idx[i] = i;
  }
  return { pos, nrm, col, mat, sway, idx };
}

function mergeMeshes(a, b) {
  const nv = a.pos.length / 3;
  const pos = new Float32Array(a.pos.length + b.pos.length);
  const nrm = new Float32Array(a.nrm.length + b.nrm.length);
  const col = new Float32Array(a.col.length + b.col.length);
  const mat = new Float32Array(a.mat.length + b.mat.length);
  const sway = new Float32Array(a.sway.length + b.sway.length);
  pos.set(a.pos); pos.set(b.pos, a.pos.length);
  nrm.set(a.nrm); nrm.set(b.nrm, a.nrm.length);
  col.set(a.col); col.set(b.col, a.col.length);
  mat.set(a.mat); mat.set(b.mat, a.mat.length);
  sway.set(a.sway); sway.set(b.sway, a.sway.length);
  const idx = new Uint32Array(a.idx.length + b.idx.length);
  idx.set(a.idx);
  for (let i = 0; i < b.idx.length; i++) idx[a.idx.length + i] = b.idx[i] + nv;
  return { pos, nrm, col, mat, sway, idx };
}

function trisOf(mesh) { return mesh.idx.length / 3; }

/**
 * Hand-authored crown under LOD caps (#6037 / #6035).
 * The 2026-10 ez-tree bake used branch.levels:0 + near-vertical leaf cards, so
 * pine_lod0 was a 0.64 m trunk with six slivers (wood ≫ foliage). This builder
 * keeps the frozen triangle caps in caps.mjs and guarantees:
 *   - foliage surface area ≥ wood surface area
 *   - crown width ≥ ~30 % of height
 * Pine: tapered trunk + stacked cone tiers. Tree: trunk + horizontal leaf discs.
 * Palm: top frond cards (already had a crown; kept for the budget path).
 */
function crownMesh(species, lod, cap, seed) {
  const rand = mulberry32(seed + lod * 17);
  const pos = [], nrm = [], col = [], mat = [], sway = [], idx = [];
  const H = species === "palm" ? 14 : species === "tree" ? 12 : 10;
  const trunkR = species === "palm" ? 0.22 : species === "tree" ? 0.28 : 0.22;
  const trunkH = species === "palm" ? H * 0.9 : H * 0.45;
  const y0 = H * (species === "palm" ? 0.85 : 0.35);
  const y1 = H * 1.05;
  function vert(x, y, z, nx, ny, nz, wood) {
    const i = pos.length / 3;
    pos.push(x, y, z); nrm.push(nx, ny, nz);
    if (wood) {
      col.push(0.32, 0.22, 0.13); mat.push(MAT_WOOD); sway.push(0);
    } else {
      const w = Math.max(0, Math.min(1, (y - y0) / Math.max(1e-6, y1 - y0)));
      col.push(0.18, 0.42, 0.16); mat.push(MAT_FOLIAGE + w * SWAY_FRAC); sway.push(w);
    }
    return i;
  }
  function addTrunk(sides, segs) {
    for (let s = 0; s < segs; s++) {
      const yA = (s / segs) * trunkH;
      const yB = ((s + 1) / segs) * trunkH;
      const rA = trunkR * (1 - 0.4 * s / segs);
      const rB = trunkR * (1 - 0.4 * (s + 1) / segs);
      for (let i = 0; i < sides; i++) {
        const a0 = (i / sides) * Math.PI * 2;
        const a1 = ((i + 1) / sides) * Math.PI * 2;
        const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
        const i0 = vert(c0 * rA, yA, s0 * rA, c0, 0, s0, true);
        const i1 = vert(c1 * rA, yA, s1 * rA, c1, 0, s1, true);
        const i2 = vert(c1 * rB, yB, s1 * rB, c1, 0, s1, true);
        const i3 = vert(c0 * rB, yB, s0 * rB, c0, 0, s0, true);
        idx.push(i0, i1, i2, i0, i2, i3);
      }
    }
  }
  /** Open cone shell (N tris): apex above a base ring — one pine tier. */
  function addConeTier(yBase, yApex, radius, sides) {
    const apex = vert(0, yApex, 0, 0, 1, 0, false);
    for (let i = 0; i < sides; i++) {
      const a0 = (i / sides) * Math.PI * 2;
      const a1 = ((i + 1) / sides) * Math.PI * 2;
      const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      // outward-ish normal from the face
      const mx = (c0 + c1) * 0.5, mz = (s0 + s1) * 0.5;
      const len = Math.hypot(mx, 0.35, mz) || 1;
      const i0 = vert(c0 * radius, yBase, s0 * radius, mx / len, 0.35 / len, mz / len, false);
      const i1 = vert(c1 * radius, yBase, s1 * radius, mx / len, 0.35 / len, mz / len, false);
      idx.push(apex, i0, i1);
    }
  }
  /** Horizontal leaf disc (2 tris) — broadleaf canopy card facing up. */
  function addLeafDisc(cx, cy, cz, hw, hd, yaw) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const corners = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([u, v]) => {
      const x = cx + c * u - s * v;
      const z = cz + s * u + c * v;
      return vert(x, cy, z, 0, 1, 0, false);
    });
    idx.push(corners[0], corners[1], corners[2], corners[0], corners[2], corners[3]);
  }
  /** Palm frond: large angled card near the top. */
  function addFrond(ang, lift, reach, hw, hh) {
    const cx = Math.cos(ang) * reach * 0.25;
    const cz = Math.sin(ang) * reach * 0.25;
    const rx = Math.cos(ang), rz = Math.sin(ang);
    const corners = [[-hw, 0], [hw, 0], [hw, hh], [-hw, hh]].map(([u, v]) => {
      const x = cx + rx * u + rx * v * 0.55;
      const y = lift - v * 0.85 - Math.abs(u) * 0.15;
      const z = cz + rz * u + rz * v * 0.55;
      return vert(x, y, z, rx * 0.15, 0.85, rz * 0.15, false);
    });
    idx.push(corners[0], corners[1], corners[2], corners[0], corners[2], corners[3]);
  }

  if (species === "pine") {
    // Cap-fit: lod0 ≤45 → trunk 3×2×2=12 + 5 tiers × 6 = 30 → 42; lod1 ≤22 → 6+3×5=21.
    const trunkSides = 3;
    const trunkSegs = lod === 0 ? 2 : 1;
    const tiers = lod === 0 ? 5 : 3;
    const sides = lod === 0 ? 6 : 5;
    addTrunk(trunkSides, trunkSegs);
    const crownBottom = trunkH * 0.55;
    const crownTop = H * 0.98;
    for (let t = 0; t < tiers; t++) {
      const f0 = t / tiers;
      const f1 = (t + 1) / tiers;
      const yBase = crownBottom + (crownTop - crownBottom) * f0;
      const yApex = crownBottom + (crownTop - crownBottom) * Math.min(1, f1 + 0.08);
      // Lower tiers wider: base radius ~2.4 m → crown width ≥ 48 % of H=10.
      const radius = (lod === 0 ? 2.4 : 2.0) * (1 - f0 * 0.72) * (0.92 + rand() * 0.08);
      addConeTier(yBase, yApex, radius, sides);
    }
  } else if (species === "tree") {
    // Cap-fit: lod0 ≤51 → trunk 3×2×2=12 + ≤18 discs×2=36 → 48; lod1 ≤25 → 6+9×2=24.
    const trunkSides = 3;
    const trunkSegs = lod === 0 ? 2 : 1;
    addTrunk(trunkSides, trunkSegs);
    const discs = lod === 0 ? 18 : 9;
    const crownY = trunkH * 0.85;
    for (let c = 0; c < discs; c++) {
      const ring = Math.floor(c / 6);
      const onRing = c % 6;
      const ang = (onRing / 6) * Math.PI * 2 + ring * 0.35 + rand() * 0.15;
      const reach = (1.1 + ring * 0.55) * (0.9 + rand() * 0.15);
      const lift = crownY + ring * 1.15 + (rand() - 0.5) * 0.35;
      const hw = (lod === 0 ? 1.55 : 1.35) * (0.9 + rand() * 0.2);
      const hd = hw * (0.85 + rand() * 0.2);
      addLeafDisc(Math.cos(ang) * reach, lift, Math.sin(ang) * reach, hw, hd, ang + rand());
    }
  } else {
    // Palm: tall trunk + top fronds (same look family as the prior bake; already crowned).
    const trunkSides = lod === 0 ? 5 : 4;
    const trunkSegs = lod === 0 ? 3 : 2;
    addTrunk(trunkSides, trunkSegs);
    const fronds = lod === 0 ? 9 : 5;
    for (let c = 0; c < fronds; c++) {
      const ang = (c / fronds) * Math.PI * 2 + rand() * 0.12;
      addFrond(ang, H * 0.92 + (rand() - 0.5) * 0.3, 3.4 * (0.9 + rand() * 0.2),
        0.55, 2.6 * (0.9 + rand() * 0.15));
    }
  }

  const mesh = {
    pos: Float32Array.from(pos),
    nrm: Float32Array.from(nrm),
    col: Float32Array.from(col),
    mat: Float32Array.from(mat),
    sway: Float32Array.from(sway),
    idx: Uint32Array.from(idx),
  };
  if (trisOf(mesh) > cap) {
    throw new Error(`crownMesh ${species} lod${lod} still ${trisOf(mesh)} > cap ${cap}`);
  }
  return mesh;
}

async function bakeOne(Tree, TreeType, species, lod) {
  const caps = LOD_CAPS[species];
  const cap = lod === 0 ? caps.lod0 : caps.lod1;
  // #6037: pine/tree always use the hand crown (ez-tree levels:0 had no canopy).
  // Palm still prefers ez-tree when it fits; crownMesh is the budget path.
  let mesh, source;
  if (species === "pine" || species === "tree") {
    mesh = crownMesh(species, lod, cap, species === "pine" ? 101 : 202);
    source = "hand-crown";
  } else {
    const opts = speciesOptions(species, lod, TreeType);
    const tree = new Tree();
    applyOpts(tree, opts);
    tree.generate();
    const bark = tree.branchesMesh.geometry;
    const leaves = tree.leavesMesh.geometry;
    const yMin = 0, yMax = opts.branch.length[0] || 12;
    mesh = mergeMeshes(
      geoToMesh(bark, MAT_WOOD, yMin, yMax),
      geoToMesh(leaves, MAT_FOLIAGE, yMax * 0.35, yMax * 1.05),
    );
    source = "ez-tree";
    if (trisOf(mesh) > cap) {
      mesh = crownMesh(species, lod, cap, opts.seed);
      source = "hand-crown";
    }
  }
  const tris = trisOf(mesh);
  if (tris > cap) throw new Error(`${species} lod${lod}: ${tris} tris > cap ${cap}`);
  const file = path.join(OUT, `${species}_lod${lod}.bin`);
  fs.writeFileSync(file, writeAX26v3(mesh));
  return { species, lod, tris, cap, source, file: path.relative(ROOT, file) };
}

async function main() {
  installNodeShims();
  const THREE = await import("three");
  THREE.TextureLoader.prototype.load = function (_url, onLoad) {
    const tex = new THREE.Texture();
    tex.image = { width: 4, height: 4 };
    if (onLoad) queueMicrotask(() => onLoad(tex));
    return tex;
  };
  let Tree, TreeType;
  try {
    ({ Tree, TreeType } = await import("@dgreenheck/ez-tree"));
  } catch (e) {
    console.error("Install bake deps first: npm i --no-save @dgreenheck/ez-tree three");
    console.error(e.message || e);
    process.exit(2);
  }

  fs.mkdirSync(OUT, { recursive: true });
  const rows = [];
  for (const species of SPECIES) {
    for (const lod of [0, 1]) {
      const row = await bakeOne(Tree, TreeType, species, lod);
      rows.push(row);
      console.log(`${row.species} lod${row.lod}: ${row.tris} tris (cap ${row.cap}) via ${row.source} -> ${row.file}`);
    }
  }
  const summary = path.join(OUT, "bake-summary.json");
  fs.writeFileSync(summary, JSON.stringify({ caps: LOD_CAPS, rows }, null, 2));
  console.log(`wrote ${summary}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
