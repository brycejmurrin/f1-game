#!/usr/bin/env node
/**
 * bake-trees.mjs — bake three species × two LODs to AX26 v3 under artifacts/trees/.
 * @doc Manual tool: `npm i --no-save @dgreenheck/ez-tree three` (never a package.json
 *   dependency). Seeded, deterministic. Fails if any LOD exceeds tools/gen/trees/caps.mjs.
 *   Does not write assets/pack/** or the asset manifest (placement slice owns that).
 * @skill scenery-dress
 *
 *   node tools/gen/trees/bake-trees.mjs
 */
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
 * If ez-tree overshoots the cap, rebuild a deterministic leaf-card + trunk
 * stand-in (plan: ~8 cards + short trunk) that stays under the cap.
 */
function budgetFallback(species, lod, cap, seed) {
  const rand = mulberry32(seed + lod * 17);
  // Plan shape: short trunk + leaf cards. Size so 2*sides*seg + 2*cards ≤ cap.
  const trunkSeg = lod === 0 ? 3 : 2;
  const trunkSides = lod === 0 ? 4 : 3;
  const trunkTris = trunkSeg * trunkSides * 2;
  const maxCards = Math.max(2, Math.floor((cap - trunkTris) / 2));
  const want = lod === 0
    ? (species === "palm" ? 9 : species === "tree" ? 8 : 6)
    : (species === "palm" ? 5 : species === "tree" ? 4 : 3);
  const cards = Math.min(want, maxCards);
  const pos = [], nrm = [], col = [], mat = [], sway = [], idx = [];
  const H = species === "palm" ? 14 : species === "tree" ? 12 : 10;
  const R = species === "palm" ? 0.22 : 0.32;
  const y0 = H * 0.35, y1 = H * 1.05;
  function vert(x, y, z, nx, ny, nz, wood) {
    const i = pos.length / 3;
    pos.push(x, y, z); nrm.push(nx, ny, nz);
    if (wood) {
      col.push(0.32, 0.22, 0.13); mat.push(MAT_WOOD); sway.push(0);
    } else {
      const w = Math.max(0, Math.min(1, (y - y0) / (y1 - y0)));
      col.push(0.18, 0.42, 0.16); mat.push(MAT_FOLIAGE + w * SWAY_FRAC); sway.push(w);
    }
    return i;
  }
  for (let s = 0; s < trunkSeg; s++) {
    const yA = (s / trunkSeg) * H * 0.55;
    const yB = ((s + 1) / trunkSeg) * H * 0.55;
    const rA = R * (1 - 0.35 * s / trunkSeg);
    const rB = R * (1 - 0.35 * (s + 1) / trunkSeg);
    for (let i = 0; i < trunkSides; i++) {
      const a0 = (i / trunkSides) * Math.PI * 2;
      const a1 = ((i + 1) / trunkSides) * Math.PI * 2;
      const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      const i0 = vert(c0 * rA, yA, s0 * rA, c0, 0, s0, true);
      const i1 = vert(c1 * rA, yA, s1 * rA, c1, 0, s1, true);
      const i2 = vert(c1 * rB, yB, s1 * rB, c1, 0, s1, true);
      const i3 = vert(c0 * rB, yB, s0 * rB, c0, 0, s0, true);
      idx.push(i0, i1, i2, i0, i2, i3);
    }
  }
  const crownY = H * (species === "palm" ? 0.92 : 0.55);
  for (let c = 0; c < cards; c++) {
    const ang = (c / cards) * Math.PI * 2 + rand() * 0.2;
    const lift = crownY + (rand() - 0.5) * H * 0.08;
    const reach = (species === "palm" ? 3.2 : 1.8) * (0.85 + rand() * 0.3);
    const hw = species === "palm" ? 0.55 : 0.9;
    const hh = species === "palm" ? 2.4 : 1.1;
    const cx = Math.cos(ang) * reach * 0.35;
    const cz = Math.sin(ang) * reach * 0.35;
    const rx = Math.cos(ang), rz = Math.sin(ang);
    const corners = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]];
    const vi = corners.map(([u, v]) => {
      const x = cx + rx * u * 0.15;
      const y = lift + v * 0.5 + (species === "palm" ? -Math.abs(u) * 0.4 : 0);
      const z = cz + rz * u * 0.15;
      return vert(x, y, z, rx * 0.2, 0.9, rz * 0.2, false);
    });
    idx.push(vi[0], vi[1], vi[2], vi[0], vi[2], vi[3]);
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
    throw new Error(`fallback ${species} lod${lod} still ${trisOf(mesh)} > cap ${cap}`);
  }
  return mesh;
}

async function bakeOne(Tree, TreeType, species, lod) {
  const caps = LOD_CAPS[species];
  const cap = lod === 0 ? caps.lod0 : caps.lod1;
  const opts = speciesOptions(species, lod, TreeType);
  const tree = new Tree();
  applyOpts(tree, opts);
  tree.generate();
  const bark = tree.branchesMesh.geometry;
  const leaves = tree.leavesMesh.geometry;
  const yMin = 0, yMax = opts.branch.length[0] || 12;
  let mesh = mergeMeshes(
    geoToMesh(bark, MAT_WOOD, yMin, yMax),
    geoToMesh(leaves, MAT_FOLIAGE, yMax * 0.35, yMax * 1.05),
  );
  let source = "ez-tree";
  if (trisOf(mesh) > cap) {
    mesh = budgetFallback(species, lod, cap, opts.seed);
    source = "leaf-card-fallback";
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
