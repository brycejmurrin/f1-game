#!/usr/bin/env node
/*
 * Apex 26 — asset bake CLI.  AUTHOR-TIME ONLY: never loaded by the game, never
 * run by a normal test pass.  Produces `assets/pack/`, which js/render/assets.js
 * loads at runtime.  See docs/research/ASSET-API-RESEARCH.md.
 *
 * The rule this tool exists to enforce: THE GAME NEVER TALKS TO AN ASSET CDN.
 * Poly Haven / ambientCG are cross-origin, unversioned and unavailable offline,
 * and the game is an offline-first PWA on static hosting.  So every byte is
 * pulled here, at author time, verified, credited and committed.
 *
 *   node tools/assets.mjs bake-synthetic [--size N]   generate a pack, no network
 *   node tools/assets.mjs bake-atlas [--preset generated]   slice 4x4 atlases → MAT layers
 *   node tools/assets.mjs search <textures|models|hdris> <query>
 *   node tools/assets.mjs fetch <mat> <source> [--res 1k]   download CC0 source maps
 *   node tools/assets.mjs bake-material <mat> <dir> [--size N]   sources -> layer
 *   node tools/assets.mjs bake-model <id> <file.glb>
 *   node tools/assets.mjs bake-env <track|tod> --sky r,g,b --ground r,g,b
 *   node tools/assets.mjs verify                     licences, hashes, budget
 *   node tools/assets.mjs credits                    regenerate CREDITS.md
 *
 * `bake-synthetic` has NO dependencies and needs NO network: it generates every
 * material layer from multi-octave noise, encoded to PNG with node's own zlib.
 * That is what makes the whole runtime path testable in CI and in a sandbox
 * with no egress.  The committed pack is a hybrid: the Poly Haven CC0
 * photoscan for ASPHALT (the racing surface), plus generated 4x4 atlas
 * tiles (`bake-atlas --preset generated`) for every other scenery slot.
 * `fetch`/`bake-material` are the offline re-bake path (network + sharp)
 * that mirrors webbake's mean-normalised Diffuse/nor_gl/arm packing.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

let _synthModels = null;
async function getSynthModels() {
  if (!_synthModels) {
    const m = await import("./synth-models.mjs").catch(() => null);
    _synthModels = m || { buildAll: null, CATALOG_IDS: [] };
  }
  return _synthModels;
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// APEX_PACK_DIR redirects every write, so tests can exercise a full bake in a
// temp dir instead of mutating the committed pack.
const PACK = process.env.APEX_PACK_DIR
  ? path.resolve(process.env.APEX_PACK_DIR)
  : path.join(ROOT, "assets", "pack");
const MANIFEST = path.join(PACK, "manifest.json");

// Total baked-asset budget.  This is not a soft target: the repo has been fast
// to clone and an asset pack is the classic way to quietly lose that.
const BUDGET_BYTES = 8 * 1024 * 1024;

// Licences we will ship.  CC0 needs no attribution and imposes no downstream
// obligation, which is the only thing that composes cleanly with a game that
// is itself redistributed.  Anything else is a deliberate, reviewed exception.
const ALLOWED_LICENCES = new Set(["CC0", "CC0-1.0", "Apex26-Procedural"]);

// MAT ids — MUST match TrackGeom.MAT (js/track/geom.js).  Asserted by
// tests/unit/assets-pack.test.mjs so the two cannot drift.
const MAT = {
  FLAT: 0, CONCRETE: 1, BRICK: 2, GLASS: 3, METAL: 4, WOOD: 5, FOLIAGE: 6,
  FABRIC: 7, SAND: 8, GRASS: 9, ROCK: 10, SNOW: 11, ROOF: 12, STONE: 13,
  RUST: 14, FLAG: 15, ASPHALT: 16,
};
const MAT_LAYERS = 17;

// World metres per texture tile, per material.  Chosen to match the spatial
// frequency the procedural version already uses, so turning the knob up reads
// as "more detail" rather than "different scale".
//
// GLASS and FLAG are deliberately absent: a baked map would blur glass's mirror
// reflection read, and FLAG's geometry is displaced in the vertex shader.
// FLAT (0) is absent by definition — it is the "no material" id.
const SCALES = {
  [MAT.CONCRETE]: 5.5, [MAT.BRICK]: 2.8, [MAT.METAL]: 2.8, [MAT.WOOD]: 2.8,
  // Sand/rock tiling was the clearest remaining tell after the 2k rebake —
  // larger world-metres/tile = fewer repetitions in the shoulder/runoff.
  [MAT.FOLIAGE]: 4.0, [MAT.FABRIC]: 1.8, [MAT.SAND]: 11.0, [MAT.GRASS]: 4.5,
  [MAT.ROCK]: 8.0, [MAT.SNOW]: 7.0, [MAT.ROOF]: 2.6, [MAT.STONE]: 3.5,
  [MAT.RUST]: 2.5, [MAT.ASPHALT]: 3.5,
};

const MAT_NAME = Object.fromEntries(Object.entries(MAT).map(([k, v]) => [v, k]));

// Roughness packed into albedo alpha when the source atlas has no ARM map.
const ROUGHNESS = {
  [MAT.CONCRETE]: 210, [MAT.BRICK]: 220, [MAT.METAL]: 80, [MAT.WOOD]: 190,
  [MAT.FOLIAGE]: 230, [MAT.FABRIC]: 240, [MAT.SAND]: 235, [MAT.GRASS]: 230,
  [MAT.ROCK]: 215, [MAT.SNOW]: 160, [MAT.ROOF]: 200, [MAT.STONE]: 220,
  [MAT.RUST]: 230, [MAT.ASPHALT]: 240,
};

// Author-time 4×4 atlases (not loaded by the game). Tile coords are 0-based
// (col, row) with row 0 at the TOP of the PNG — the same convention as the
// filmstrip (layer N at y = N*size).
const ATLAS_DIR = path.join(ROOT, "assets", "atlases");
const ATLAS_PRESETS = {
  generated: {
    grid: 4,
    inset: 4,
    files: {
      "arch-albedo": "atlas-arch-albedo.png",
      "arch-normal": "atlas-arch-normal.png",
      "nature-albedo": "atlas-nature-albedo.png",
      "organic-normal": "atlas-organic-normal.png",
      "variety-albedo": "atlas-variety-albedo.png",
      "variety-normal": "atlas-variety-normal.png",
    },
    // ASPHALT stays on the Poly Haven photoscan — do not replace the racing
    // surface. Every other scenery slot comes from the generated sheets.
    // Coords are 0-based (col, row); row 0 is the PNG top.
    layers: [
      { mat: "CONCRETE", albedo: ["arch-albedo", 2, 0], normal: ["arch-normal", 2, 0] },
      { mat: "BRICK",    albedo: ["arch-albedo", 1, 0], normal: ["arch-normal", 0, 0] },
      { mat: "METAL",    albedo: ["arch-albedo", 2, 2], normal: ["arch-normal", 2, 2] },
      { mat: "WOOD",     albedo: ["variety-albedo", 0, 0], normal: ["variety-normal", 0, 0] },
      { mat: "FOLIAGE",  albedo: ["nature-albedo", 1, 0], normal: ["organic-normal", 0, 0] },
      { mat: "FABRIC",   albedo: ["variety-albedo", 2, 0], normal: ["variety-normal", 2, 0] },
      { mat: "SAND",     albedo: ["nature-albedo", 1, 3], normal: null },
      { mat: "GRASS",    albedo: ["nature-albedo", 2, 1], normal: null },
      { mat: "ROCK",     albedo: ["nature-albedo", 1, 2], normal: null },
      { mat: "SNOW",     albedo: ["variety-albedo", 0, 1], normal: ["variety-normal", 0, 1] },
      { mat: "ROOF",     albedo: ["arch-albedo", 2, 1], normal: null },
      { mat: "STONE",    albedo: ["arch-albedo", 1, 1], normal: ["arch-normal", 1, 1] },
      { mat: "RUST",     albedo: ["arch-albedo", 3, 2], normal: ["arch-normal", 1, 2] },
    ],
  },
};

// ───────────────────────────── PNG encoder ───────────────────────────────────
// A dependency-free RGBA8 encoder.  PNG rather than WebP because node ships
// zlib but no lossy encoder, and because createImageBitmap decodes PNG
// everywhere.  A real-scan bake should re-encode to WebP or KTX2 (see the
// research doc) — the runtime reads whatever the manifest names.

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

export function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

export function encodePNG(w, h, rgba) {
  // ADAPTIVE per-scanline filtering: try all five and keep the one with the
  // smallest sum of absolute signed deviations — the standard heuristic, and
  // the one libpng uses. Sub-only (the original) is fine for synthetic noise
  // but poor on photographic scans, where Paeth usually wins by a wide margin;
  // on the 512² browser bake this is the difference between a pack that fits
  // the commit budget and one that does not.
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  const cand = [Buffer.alloc(stride), Buffer.alloc(stride), Buffer.alloc(stride),
                Buffer.alloc(stride), Buffer.alloc(stride)];
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const line = rgba.subarray(y * stride, (y + 1) * stride);
    let best = 0, bestScore = Infinity;
    for (let f = 0; f < 5; f++) {
      const c = cand[f];
      let score = 0;
      for (let i = 0; i < stride; i++) {
        const a = i >= 4 ? line[i - 4] : 0, b = prev[i], cc = i >= 4 ? prev[i - 4] : 0;
        let v;
        if (f === 0) v = line[i];
        else if (f === 1) v = line[i] - a;
        else if (f === 2) v = line[i] - b;
        else if (f === 3) v = line[i] - ((a + b) >> 1);
        else {
          const p = a + b - cc, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - cc);
          v = line[i] - ((pa <= pb && pa <= pc) ? a : (pb <= pc ? b : cc));
        }
        c[i] = v & 0xff;
        score += c[i] < 128 ? c[i] : 256 - c[i];
      }
      if (score < bestScore) { bestScore = score; best = f; }
    }
    const o = y * (stride + 1);
    raw[o] = best;
    cand[best].copy(raw, o + 1);
    prev = line;
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;   // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

// ───────────────────────────── PNG decoder ───────────────────────────────────
// Needed to re-encode what the BROWSER baker produces: canvas.toBlob writes a
// conservatively-filtered PNG, and a 512² 17-layer pair lands around 19 MB —
// well over the commit budget. This decodes it so `import-pack` can downsample
// and re-encode. Only what canvas emits: 8-bit RGB/RGBA, non-interlaced.

export function decodePNG(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("not a PNG");
  let off = 8, w = 0, h = 0, depth = 0, colour = 0;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("ascii", off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      depth = data[8]; colour = data[9];
      if (depth !== 8) throw new Error(`unsupported bit depth ${depth}`);
      if (colour !== 2 && colour !== 6) throw new Error(`unsupported colour type ${colour}`);
      if (data[12] !== 0) throw new Error("interlaced PNG unsupported");
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    off += 12 + len;
  }
  const ch = colour === 6 ? 4 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * ch;
  const out = Buffer.alloc(w * h * 4);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride));
    // Undo the per-scanline filter. a = left, b = up, c = up-left.
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? line[i - ch] : 0, b = prev[i], c = i >= ch ? prev[i - ch] : 0;
      let v = line[i];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      line[i] = v & 0xff;
    }
    for (let x = 0; x < w; x++) {
      const s = x * ch, d = (y * w + x) * 4;
      out[d] = line[s]; out[d + 1] = line[s + 1]; out[d + 2] = line[s + 2];
      out[d + 3] = ch === 4 ? line[s + 3] : 255;
    }
    prev = line;
  }
  return { w, h, rgba: out };
}

// Box-filter downsample by an integer factor. A box filter rather than anything
// fancier on purpose: these are tiling detail maps whose mip chain the GPU will
// build with a box filter anyway, so matching it keeps level 0 consistent with
// what the hardware derives from it.
function downsample(rgba, w, h, f) {
  const nw = Math.floor(w / f), nh = Math.floor(h / f);
  const out = Buffer.alloc(nw * nh * 4);
  for (let y = 0; y < nh; y++) {
    for (let x = 0; x < nw; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let j = 0; j < f; j++) {
        for (let i = 0; i < f; i++) {
          const s = ((y * f + j) * w + (x * f + i)) * 4;
          r += rgba[s]; g += rgba[s + 1]; b += rgba[s + 2]; a += rgba[s + 3];
        }
      }
      const n = f * f, d = (y * nw + x) * 4;
      out[d] = Math.round(r / n); out[d + 1] = Math.round(g / n);
      out[d + 2] = Math.round(b / n); out[d + 3] = Math.round(a / n);
    }
  }
  return { w: nw, h: nh, rgba: out };
}

// ───────────────────────── tiling value noise ────────────────────────────────
// Ports the shader's vnoise/hash21 (js/render/shaders/chunks.js) but TILING:
// a baked tile has to wrap seamlessly at the texture edge, which the shader's
// unbounded world-space noise never had to.  Lattice coordinates are taken
// modulo the period, so the left edge and the right edge sample the same row.

function hash21(x, y) {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

function vnoise(x, y, period) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const m = (n, p) => ((n % p) + p) % p;
  const a = hash21(m(xi, period), m(yi, period));
  const b = hash21(m(xi + 1, period), m(yi, period));
  const c = hash21(m(xi, period), m(yi + 1, period));
  const d = hash21(m(xi + 1, period), m(yi + 1, period));
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
}

// Multi-octave tiling FBM.  This is where a baked texture earns its place: the
// shader can afford two or three octaves per fragment, a texture gets six for
// the same runtime cost — the detail the procedural path cannot buy.
function fbm(x, y, baseFreq, octaves, gain = 0.5) {
  let sum = 0, amp = 1, norm = 0, f = baseFreq;
  for (let i = 0; i < octaves; i++) {
    sum += amp * vnoise(x * f, y * f, Math.max(1, Math.round(f)));
    norm += amp;
    amp *= gain; f *= 2;
  }
  return sum / norm;
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// Height field per material, in tile-normalised (0..1) coordinates.  Mirrors
// matBumpHeight()'s pattern vocabulary (js/render/shaders/lit.js) so a
// baked layer reads as the same material, just finer.  Returns 0..1.
function matHeight(mid, u, v) {
  switch (mid) {
    case MAT.CONCRETE: {
      const seam = Math.abs(((v * 4) % 1) - 0.5) < 0.03 ? 0.4 : 0;
      return clamp01(fbm(u, v, 8, 5) * 0.9 - seam);
    }
    case MAT.BRICK: {
      const rows = 10, cols = 5;
      const row = Math.floor(v * rows);
      const off = (row % 2) * 0.5;
      const bx = ((u + off / cols) * cols) % 1, by = (v * rows) % 1;
      const mort = 0.07;
      const joint = Math.min(bx, 1 - bx) < mort || Math.min(by, 1 - by) < mort;
      return joint ? 0.12 : 0.62 + hash21(row, Math.floor((u + off / cols) * cols)) * 0.28;
    }
    case MAT.METAL: return clamp01(0.45 + fbm(u * 26, v, 8, 3) * 0.35);
    case MAT.WOOD: {
      const planks = 4;
      const seam = Math.min((u * planks) % 1, 1 - ((u * planks) % 1)) < 0.02 ? 0.35 : 0;
      return clamp01(0.6 + fbm(u * 3, v * 26, 6, 4) * 0.38 - seam);
    }
    case MAT.FOLIAGE: return clamp01(fbm(u, v, 5, 5, 0.55));
    case MAT.FABRIC: {
      const w = (Math.sin(u * Math.PI * 2 * 16) + Math.sin(v * Math.PI * 2 * 16)) * 0.16;
      return clamp01(0.5 + w + fbm(u, v, 12, 3) * 0.16);
    }
    case MAT.SAND: {
      const ripple = Math.sin(u * Math.PI * 2 * 5 + fbm(u, v, 2, 3) * 6) * 0.26;
      return clamp01(0.5 + ripple + fbm(u, v, 14, 4) * 0.22);
    }
    case MAT.GRASS: return clamp01(fbm(u, v, 9, 5, 0.55) * 0.8 + fbm(u, v, 30, 2) * 0.3);
    case MAT.ROCK: return clamp01(fbm(u, v, 3, 6, 0.55));
    case MAT.SNOW: return clamp01(fbm(u, v, 3, 4) * 0.8 + fbm(u, v, 24, 2) * 0.2);
    case MAT.ROOF: {
      const courses = 6;
      const ty = (v * courses) % 1;
      return clamp01(Math.sin(ty * Math.PI) * 0.75 + fbm(u * 3, Math.floor(v * courses), 4, 2) * 0.2);
    }
    case MAT.STONE: {
      const cells = 4;
      const cx = Math.floor(u * cells), cy = Math.floor(v * cells);
      const jx = (hash21(cx, cy) - 0.5) * 0.16, jy = (hash21(cy, cx) - 0.5) * 0.16;
      const fx = (u * cells) % 1 - jx, fy = (v * cells) % 1 - jy;
      const d = Math.min(Math.min(fx, 1 - fx), Math.min(fy, 1 - fy));
      return clamp01((d < 0.07 ? 0.15 : 0.7) + fbm(u, v, 10, 3) * 0.25);
    }
    case MAT.RUST: {
      const corr = Math.sin(u * Math.PI * 2 * 4) * 0.35;
      return clamp01(0.5 + corr + fbm(u, v, 8, 4) * 0.24);
    }
    case MAT.ASPHALT:
      // Deliberately the flattest in the table — see the MAT.ASPHALT note in
      // js/track/geom.js.  Fine aggregate only: no macro term can crawl.
      return clamp01(0.42 + fbm(u, v, 22, 4) * 0.42 + fbm(u, v, 60, 2) * 0.16);
    default: return 0.5;
  }
}

// Albedo tint + roughness per material, given its height.  Reflectance is
// centred on 0.5 so the shader's `albedo * t.rgb * 2.0` is a NO-OP for a flat
// mid-grey — the texture modulates the vertex colour rather than replacing it,
// which is what keeps 24 circuits' palettes distinct.
function matSurface(mid, h, u, v) {
  const t = (lo, hi) => lo + (hi - lo) * h;
  let r, g, b, rough;
  switch (mid) {
    case MAT.BRICK:
      r = t(0.36, 0.62); g = t(0.34, 0.5); b = t(0.33, 0.46); rough = 0.88; break;
    case MAT.METAL:
      r = g = b = t(0.4, 0.62); rough = 0.35 + (1 - h) * 0.2; break;
    case MAT.WOOD:
      r = t(0.36, 0.6); g = t(0.32, 0.52); b = t(0.28, 0.44); rough = 0.75; break;
    case MAT.FOLIAGE:
      r = t(0.34, 0.52); g = t(0.42, 0.62); b = t(0.3, 0.44); rough = 0.9; break;
    case MAT.FABRIC:
      r = g = b = t(0.42, 0.58); rough = 0.95; break;
    case MAT.SAND:
      r = t(0.44, 0.6); g = t(0.41, 0.56); b = t(0.36, 0.48); rough = 0.96; break;
    case MAT.GRASS:
      r = t(0.36, 0.54); g = t(0.44, 0.62); b = t(0.32, 0.46); rough = 0.92; break;
    case MAT.ROCK:
      r = g = b = t(0.36, 0.62); rough = 0.9; break;
    case MAT.SNOW:
      r = g = t(0.6, 0.72); b = t(0.62, 0.74); rough = 0.6; break;
    case MAT.ROOF:
      r = t(0.4, 0.62); g = t(0.34, 0.5); b = t(0.3, 0.44); rough = 0.85; break;
    case MAT.STONE:
      r = t(0.38, 0.6); g = t(0.37, 0.58); b = t(0.35, 0.55); rough = 0.88; break;
    case MAT.RUST:
      r = t(0.4, 0.62); g = t(0.32, 0.48); b = t(0.26, 0.38); rough = 0.92; break;
    case MAT.ASPHALT: {
      // Sparse pale aggregate poking through the binder — the one feature that
      // reads as "tarmac" up close and that a 2-octave shader term cannot hold.
      const chip = hash21(Math.floor(u * 220), Math.floor(v * 220)) > 0.93 ? 0.1 : 0;
      r = g = b = t(0.42, 0.56) + chip; rough = 0.94; break;
    }
    default:
      r = g = b = t(0.42, 0.58); rough = 0.85; break;
  }
  return [r, g, b, rough];
}

// ───────────────────────── synthetic material bake ───────────────────────────

function bakeOneSize(size, ids) {
  const stripH = size * MAT_LAYERS;
  const albedo = Buffer.alloc(size * stripH * 4);
  const normal = Buffer.alloc(size * stripH * 4);
  // Layers with no material stay mid-grey / flat-normal rather than zero: a
  // zeroed layer would multiply albedo to black if it were ever sampled.
  albedo.fill(128); normal.fill(128);
  for (let i = 3; i < albedo.length; i += 4) { albedo[i] = 255; normal[i] = 255; }

  for (const mid of ids) {
    const y0 = mid * size;
    // Height field first, so the normal is a real gradient of the same field
    // the albedo is shaded from — exactly the relationship applyMaterialNormal
    // and applyMaterial maintain in the shader.
    const H = new Float32Array(size * size);
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++)
        H[y * size + x] = matHeight(mid, x / size, y / size);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const h = H[y * size + x];
        const [r, g, b, rough] = matSurface(mid, h, x / size, y / size);
        let o = ((y0 + y) * size + x) * 4;
        albedo[o] = Math.round(clamp01(r) * 255);
        albedo[o + 1] = Math.round(clamp01(g) * 255);
        albedo[o + 2] = Math.round(clamp01(b) * 255);
        albedo[o + 3] = Math.round(clamp01(rough) * 255);

        // Central-difference gradient, WRAPPED — the tile has to be seamless.
        const xm = (x - 1 + size) % size, xp = (x + 1) % size;
        const ym = (y - 1 + size) % size, yp = (y + 1) % size;
        const dx = (H[y * size + xp] - H[y * size + xm]) * 0.5;
        const dy = (H[yp * size + x] - H[ym * size + x]) * 0.5;
        // Strength is per-material: ASPHALT stays nearly flat by design.
        const k = mid === MAT.ASPHALT ? 3.0
                : mid === MAT.METAL ? 11.0
                : mid === MAT.CONCRETE || mid === MAT.BRICK ? 9.0
                : 8.0;
        const nx = -dx * k, ny = -dy * k, nz = 1;
        const len = Math.hypot(nx, ny, nz) || 1;
        normal[o] = Math.round(clamp01(nx / len * 0.5 + 0.5) * 255);
        normal[o + 1] = Math.round(clamp01(ny / len * 0.5 + 0.5) * 255);
        normal[o + 2] = Math.round(clamp01(h) * 255);      // B = AO/height, spare channel
        normal[o + 3] = 255;
      }
    }
  }

  fs.mkdirSync(PACK, { recursive: true });
  const aFile = `mat-albedo-${size}.png`, nFile = `mat-normal-${size}.png`;
  fs.writeFileSync(path.join(PACK, aFile), encodePNG(size, stripH, albedo));
  fs.writeFileSync(path.join(PACK, nFile), encodePNG(size, stripH, normal));
  return {
    size, albedo: aFile, normal: nFile,
    layers: ids.map((mid) => ({
      mat: mid, id: MAT_NAME[mid].toLowerCase(), scale: SCALES[mid],
      source: "procedural:tools/assets.mjs", licence: "Apex26-Procedural",
      author: "Apex 26",
    })),
  };
}

function bakeSynthetic(args) {
  // Default: bake BOTH tiers (256 high + 128 low) so phones get the small
  // strip without a second authoring pass. Pass --size N to bake only one.
  const only = intArg(args, "--size", 0);
  const sizes = only ? [only] : [256, 128];
  for (const s of sizes) {
    if (s < 8 || (s & (s - 1)) !== 0)
      fail(`--size must be a power of two >= 8 (got ${s})`);
  }

  const ids = Object.keys(SCALES).map(Number).sort((a, b) => a - b);
  console.log(`baking ${ids.length} material layers at ${sizes.join("+")}px (no network) …`);

  const baked = {};
  for (const s of sizes) baked[s] = bakeOneSize(s, ids);

  const high = baked[256] || baked[sizes[0]];
  const low = baked[128] && high.size !== 128 ? baked[128] : null;

  const m = readManifest();
  m.materials = {
    size: high.size,
    albedo: high.albedo,
    normal: high.normal,
    layers: high.layers,
  };
  if (low) m.materials.low = low;
  else delete m.materials.low;
  m.credits = buildCredits(m);
  writeManifest(m);
  credits();
  report(m);
  // Optional: also regenerate models in the same offline pass.
  if (args.includes("--models")) bakeSyntheticModels([]);
}

function writeAX26(mesh, matName) {
  const mid = MAT[matName] || MAT.CONCRETE;
  const nv = mesh.pos.length / 3;
  const nrm = mesh.nrm && mesh.nrm.length === nv * 3 ? mesh.nrm : new Float32Array(nv * 3);
  const col = mesh.col && mesh.col.length === nv * 3 ? mesh.col : new Float32Array(nv * 3).fill(0.7);
  const matArr = mesh.mat && mesh.mat.length === nv ? mesh.mat : new Float32Array(nv).fill(mid);
  const head = Buffer.alloc(20);
  head.write("AX26", 0, "ascii");
  head.writeUInt32LE(1, 4);
  head.writeUInt32LE(nv, 8);
  head.writeUInt32LE(mesh.idx.length, 12);
  head.writeUInt32LE(0, 16);
  return Buffer.concat([
    head,
    Buffer.from(Float32Array.from(mesh.pos).buffer),
    Buffer.from(Float32Array.from(nrm).buffer),
    Buffer.from(Float32Array.from(col).buffer),
    Buffer.from(Float32Array.from(matArr).buffer),
    Buffer.from(Uint32Array.from(mesh.idx).buffer),
  ]);
}

// ───────────────────────────── model bake ────────────────────────────────────

// Reuse the game's OWN glTF reader rather than a second implementation: if a
// model survives GLTF.toMesh here it will survive it at runtime, and the two
// can never disagree about what is supported.
async function loadGLTFModule() {
  const src = fs.readFileSync(path.join(ROOT, "js", "render", "gltf.js"), "utf8");
  const vm = await import("node:vm");
  const ctx = {
    Math, Array, Object, JSON, Uint8Array, Uint16Array, Uint32Array, Int16Array,
    Float32Array, DataView, ArrayBuffer, TextDecoder, Promise, Error, console, fetch,
  };
  ctx.window = ctx;
  ctx.Log = {
    info() {}, warn() {}, error() {}, debug() {},
    enabled() { return false; },
    time() { return function () {}; },
  };
  vm.createContext(ctx);
  // Top-level `const` is block-scoped inside a VM and never becomes a property
  // of the sandbox — the same rewrite tools/verify-track.cjs applies.
  vm.runInContext(src.replace(/^const\b/gm, "var"), ctx, { filename: "gltf.js" });
  return ctx.GLTF || (ctx.window && ctx.window.GLTF);
}

async function bakeModel(args) {
  const [id, file] = args.filter((a) => !a.startsWith("--"));
  if (!id || !file) fail("usage: bake-model <id> <file.glb> [--mat MATNAME] [--scale N]");
  const GLTF = await loadGLTFModule();
  if (!GLTF || typeof GLTF.toMesh !== "function") fail("could not load js/render/gltf.js");

  const buf = fs.readFileSync(path.resolve(file));
  const scale = floatArg(args, "--scale", 1);
  const mesh = GLTF.toMesh(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), { scale });
  if (!mesh || !mesh.pos || !mesh.idx) fail("glTF produced no geometry");

  // Every vertex gets a MAT id.  glTF materials carry no notion of our
  // procedural material table, so the mapping is an explicit author decision
  // (--mat) rather than a guess — a wrong guess would texture a grandstand roof
  // as foliage and nobody would know why.
  const matName = (strArg(args, "--mat", "CONCRETE") || "CONCRETE").toUpperCase();
  if (!(matName in MAT)) fail(`--mat must be one of ${Object.keys(MAT).join(", ")}`);
  const mid = MAT[matName];

  const nv = mesh.pos.length / 3;
  const nrm = mesh.nrm && mesh.nrm.length === nv * 3 ? mesh.nrm : new Float32Array(nv * 3).fill(0);
  const col = mesh.col && mesh.col.length === nv * 3 ? mesh.col : new Float32Array(nv * 3).fill(0.7);
  const matArr = new Float32Array(nv).fill(mid);

  const head = Buffer.alloc(20);
  head.write("AX26", 0, "ascii");
  head.writeUInt32LE(1, 4);
  head.writeUInt32LE(nv, 8);
  head.writeUInt32LE(mesh.idx.length, 12);
  head.writeUInt32LE(0, 16);
  const out = Buffer.concat([
    head,
    Buffer.from(Float32Array.from(mesh.pos).buffer),
    Buffer.from(Float32Array.from(nrm).buffer),
    Buffer.from(Float32Array.from(col).buffer),
    Buffer.from(matArr.buffer),
    Buffer.from(Uint32Array.from(mesh.idx).buffer),
  ]);

  const rel = path.join("models", `${id}.bin`);
  fs.mkdirSync(path.join(PACK, "models"), { recursive: true });
  fs.writeFileSync(path.join(PACK, rel), out);

  const m = readManifest();
  m.models = m.models || {};
  m.models[id] = {
    file: rel.split(path.sep).join("/"),
    verts: nv, tris: mesh.idx.length / 3, mat: matName,
    source: strArg(args, "--source", path.basename(file)),
    licence: strArg(args, "--licence", "CC0"),
    author: strArg(args, "--author", "unknown"),
    md5: crypto.createHash("md5").update(out).digest("hex"),
  };
  m.credits = buildCredits(m);
  writeManifest(m);
  console.log(`baked model "${id}": ${nv} verts, ${mesh.idx.length / 3} tris, MAT.${matName}`);
  report(m);
}

// ───────────────────── import a browser bake (webbake.js) ────────────────────

// Take the ZIP contents produced by assets/pack/webbake.js — real CC0 scans
// composited in a browser, because neither the authoring sandbox nor a
// shell-less setup can reach the CDNs — and install them as the committed pack,
// downsampling and re-encoding to fit the budget.
//
//   node tools/assets.mjs import-pack <dir> [--size 256]
//
// <dir> holds mat-albedo-N.png, mat-normal-N.png and manifest.json.
function importPack(args) {
  const [dir] = args.filter((a) => !a.startsWith("--"));
  if (!dir) fail("usage: import-pack <dir-with-the-unzipped-bake> [--size 256]");
  const src = path.resolve(dir);
  const inMan = JSON.parse(fs.readFileSync(path.join(src, "manifest.json"), "utf8"));
  const srcSize = inMan.materials.size | 0;
  const target = intArg(args, "--size", 256);
  // A second, smaller variant for the mobile tier. js/render/assets.js looks for
  // materials.low on a phone and SILENTLY falls back to the full-size strips
  // when it is absent — so without this, mobile pays the desktop download and
  // roughly 12 MB of VRAM across both arrays, which is the opposite of what the
  // tiering was for. 0 disables it.
  const lowTarget = intArg(args, "--low", 128);
  if (target > srcSize || srcSize % target !== 0)
    fail(`--size ${target} must divide the source size ${srcSize} and not exceed it`);
  if (lowTarget && (lowTarget >= target || srcSize % lowTarget !== 0))
    fail(`--low ${lowTarget} must divide ${srcSize} and be smaller than --size ${target}`);

  fs.mkdirSync(PACK, { recursive: true });
  // Start from the committed manifest and overwrite only the materials (and,
  // below, the rebuilt credits) — building a fresh `{ models: {}, env: {} }`
  // here used to silently erase every committed bake-model/bake-env entry
  // while their models/*.bin files stayed orphaned on disk.
  const out = readManifest();
  out.version = 1;
  out.materials = { size: target, layers: inMan.materials.layers };
  out.models = out.models || {};
  out.env = out.env || {};
  const keep = new Set();
  let bytes = 0;
  for (const which of ["albedo", "normal"]) {
    const inFile = inMan.materials[which];
    if (!inFile) continue;
    const png = decodePNG(fs.readFileSync(path.join(src, inFile)));
    if (png.h !== srcSize * MAT_LAYERS)
      fail(`${inFile}: height ${png.h} != size*${MAT_LAYERS} (${srcSize * MAT_LAYERS})`);
    for (const size of lowTarget ? [target, lowTarget] : [target]) {
      const f = srcSize / size;
      const small = f === 1 ? png : downsample(png.rgba, png.w, png.h, f);
      const name = `mat-${which}-${size}.png`;
      const buf = encodePNG(small.w, small.h, small.rgba);
      fs.writeFileSync(path.join(PACK, name), buf);
      keep.add(name);
      bytes += buf.length;
      if (size === target) out.materials[which] = name;
      else {
        out.materials.low = out.materials.low || { size: lowTarget, layers: inMan.materials.layers };
        out.materials.low[which] = name;
      }
      console.log(`${inFile} ${png.w}x${png.h} -> ${name} ${small.w}x${small.h}  ${(buf.length / 1024).toFixed(0)} KB`);
    }
  }
  // Drop any previous strips at a different size so the pack never carries two.
  for (const f of fs.readdirSync(PACK)) {
    if (/^mat-(albedo|normal)-\d+\.png$/.test(f) && !keep.has(f)) {
      fs.unlinkSync(path.join(PACK, f));
      console.log(`removed stale ${f}`);
    }
  }
  out.credits = buildCredits(out);
  writeManifest(out);
  console.log(`pack: ${(bytes / 1024).toFixed(0)} KB / ${(BUDGET_BYTES / 1048576).toFixed(0)} MB budget` +
              (bytes > BUDGET_BYTES ? "  ** OVER **" : "  (ok)"));
  if (bytes > BUDGET_BYTES) process.exitCode = 1;
}

// ─────────────────────────── environment bake ────────────────────────────────

// Hemisphere ambient for a (track, time-of-day) pair.  These feed the values
// applyRaceSettings already consumes (ambientSky / ambientGround), so an HDRI
// measurement needs NO shader change — it replaces hand-picked colours with
// ones derived from a real sky.  Use "*" as the track for a global default.
function bakeEnv(args) {
  const [key] = args.filter((a) => !a.startsWith("--"));
  if (!key || !key.includes("|")) fail('usage: bake-env "<track>|<tod>" --sky r,g,b --ground r,g,b');
  const sky = vecArg(args, "--sky"), ground = vecArg(args, "--ground");
  if (!sky || !ground) fail("--sky and --ground are both required (r,g,b in 0..1 linear)");
  const m = readManifest();
  m.env = m.env || {};
  const rec = {
    ambientSky: sky, ambientGround: ground,
    source: strArg(args, "--source", "manual"),
    licence: strArg(args, "--licence", "CC0"),
    author: strArg(args, "--author", "Apex 26"),
  };
  const zen = vecArg(args, "--zenith"), hor = vecArg(args, "--horizon");
  if (zen) rec.skyZenith = zen;
  if (hor) rec.skyHorizon = hor;
  m.env[key] = rec;
  m.credits = buildCredits(m);
  writeManifest(m);
  console.log(`env "${key}" -> sky ${sky} ground ${ground}` +
    (zen ? ` zenith ${zen}` : "") + (hor ? ` horizon ${hor}` : ""));
}

// Sample a Poly Haven 1k Radiance .hdr equirect into hemisphere ambients and
// write "*|<tod>" (or --track) env entries. Ambient only by default — zenith/
// horizon from a naive Reinhard crush read too dark against palette skies.
async function bakeEnvHdri(args) {
  const id = args.find((a) => !a.startsWith("--") && !a.includes("|"));
  const tod = strArg(args, "--tod", null);
  if (!id || !tod) fail('usage: bake-env-hdri <polyhavenId> --tod day|dusk|dawn|default [--track monza]');
  const track = strArg(args, "--track", "*");
  const key = `${track}|${tod}`;
  const res = strArg(args, "--res", "1k");
  const url = `https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/${res}/${id}_${res}.hdr`;
  console.log(`fetching ${url}`);
  const resp = await fetch(url);
  if (!resp.ok) fail(`HTTP ${resp.status} fetching HDRI`);
  const buf = Buffer.from(await resp.arrayBuffer());
  const sampled = sampleRadianceHdr(buf);
  // Mild Reinhard into the range applyRaceSettings already expects (~0.2–0.5 day).
  const tone = (v, s) => v.map((c) => Math.min(1, +(c * s / (1 + c * s)).toFixed(4)));
  const sky = tone(sampled.sky, 0.35);
  const ground = tone(sampled.ground, 0.45);
  console.log(`sampled sky=${sky} ground=${ground}`);
  bakeEnv([key, "--sky", sky.join(","), "--ground", ground.join(","),
           "--source", `polyhaven:${id}`, "--licence", "CC0",
           "--author", "Poly Haven contributors"]);
}

// Minimal Radiance RGBE (.hdr) equirect sampler → solid-angle-weighted
// upper/lower hemisphere means. No deps — sharp cannot decode HDR.
function sampleRadianceHdr(buf) {
  let off = 0;
  const readLine = () => {
    let s = "";
    while (off < buf.length) {
      const c = buf[off++]; if (c === 10) break; s += String.fromCharCode(c);
    }
    return s;
  };
  while (true) {
    const line = readLine();
    if (line === "") break;
    if (off >= buf.length) fail("bad HDR header");
  }
  const res = readLine().trim().split(/\s+/);
  // -Y height +X width
  const h = parseInt(res[1], 10), w = parseInt(res[3], 10);
  if (!(w > 0 && h > 0)) fail(`bad HDR resolution: ${res.join(" ")}`);
  const rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const info = buf.subarray(off, off + 4); off += 4;
    const scanW = (info[2] << 8) | info[3];
    if (info[0] === 2 && info[1] === 2 && scanW === w) {
      for (let ch = 0; ch < 4; ch++) {
        let x = 0;
        while (x < w) {
          const code = buf[off++];
          if (code > 128) {
            const run = code - 128, val = buf[off++];
            for (let i = 0; i < run; i++) rgba[(y * w + x++) * 4 + ch] = val;
          } else {
            for (let i = 0; i < code; i++) rgba[(y * w + x++) * 4 + ch] = buf[off++];
          }
        }
      }
    } else {
      rgba.set(info, y * w * 4);
      rgba.set(buf.subarray(off, off + w * 4 - 4), y * w * 4 + 4);
      off += w * 4 - 4;
    }
  }
  const sky = [0, 0, 0], ground = [0, 0, 0];
  let sn = 0, gn = 0;
  for (let y = 0; y < h; y++) {
    const t = (y + 0.5) / h;
    const lat = Math.PI / 2 - t * Math.PI;
    const wgt = Math.sin(t * Math.PI);
    for (let x = 0; x < w; x += 2) {
      const i = (y * w + x) * 4;
      const e = rgba[i + 3];
      let r = 0, g = 0, b = 0;
      if (e) {
        const f = Math.pow(2, e - 128) / 255;
        r = rgba[i] * f; g = rgba[i + 1] * f; b = rgba[i + 2] * f;
      }
      if (lat > 0.12) { sky[0] += r * wgt; sky[1] += g * wgt; sky[2] += b * wgt; sn += wgt; }
      else if (lat < -0.12) { ground[0] += r * wgt; ground[1] += g * wgt; ground[2] += b * wgt; gn += wgt; }
    }
  }
  const avg = (v, n) => v.map((c) => c / Math.max(n, 1e-9));
  return { sky: avg(sky, sn), ground: avg(ground, gn), width: w, height: h };
}

// ────────────────────────────── CC0 sources ──────────────────────────────────

// VERIFIED against the live APIs from a browser on 2026-08-01 (this sandbox has
// no egress to either host; the shapes below are from a real response, not the
// published docs).
//
//   Poly Haven  — CORS OPEN. /assets returns an object keyed by asset id;
//                 /files/{id} returns body[MAP][RES][FORMAT] = {size, md5, url}.
//   ambientCG   — CORS BLOCKED from a browser ("Load failed"). Still usable from
//                 node (no CORS there), but it cannot be reached from an
//                 in-browser importer, so Poly Haven is the primary source.
const SOURCES = {
  polyhaven: {
    api: "https://api.polyhaven.com",
    list: (type, q) => `https://api.polyhaven.com/assets?type=${encodeURIComponent(type)}`,
    files: (id) => `https://api.polyhaven.com/files/${encodeURIComponent(id)}`,
    licence: "CC0",
    cors: true,
    // The map names in a real /files response. `arm` is the prize: ambient
    // occlusion + roughness + metalness already packed into RGB, and at 1k JPG
    // it is ~296 KB against 544 KB for the standalone rough map.
    // `nor_gl` (NOT `nor_dx`) is the OpenGL green-channel convention, which is
    // what applyMaterialTexNormal expects — nor_dx would invert every bump.
    maps: { albedo: "Diffuse", normal: "nor_gl", arm: "arm", rough: "Rough", ao: "AO", disp: "Displacement" },
    // Assets are CC0 and need no attribution, but building on the LIVE API
    // asks for a "Powered by Poly Haven" credit.  That is why credits() emits
    // one whenever a polyhaven-sourced layer is in the pack.
    apiCredit: "Powered by Poly Haven",
  },
  ambientcg: {
    api: "https://ambientcg.com/api/v2",
    list: (type, q) => `https://ambientcg.com/api/v2/full_json?q=${encodeURIComponent(q || "")}&type=Material&limit=40`,
    files: (id) => `https://ambientcg.com/api/v2/full_json?id=${encodeURIComponent(id)}&include=downloadData`,
    licence: "CC0",
    cors: false,
  },
};

// Pick one file out of a Poly Haven /files/{id} body: pickFile(body, "Diffuse",
// "1k", "jpg") -> {size, md5, url}. Falls back through the resolution ladder so
// an asset that only publishes 2k+ still resolves.
function pickFile(body, map, res, fmt) {
  const m = body && body[map];
  if (!m) return null;
  for (const r of [res, "1k", "2k", "4k"]) {
    const slot = m[r];
    if (!slot) continue;
    for (const f of [fmt, "jpg", "png"]) {
      if (slot[f] && slot[f].url) return { ...slot[f], res: r, fmt: f, map };
    }
  }
  return null;
}

async function search(args) {
  const [type, ...q] = args.filter((a) => !a.startsWith("--"));
  if (!type) fail("usage: search <textures|models|hdris> <query>");
  const query = q.join(" ");
  for (const [name, S] of Object.entries(SOURCES)) {
    // ambientCG's catalogue is Materials only — skip model/hdri queries there.
    if (name === "ambientcg" && type !== "textures" && type !== "materials") continue;
    const url = S.list(type === "textures" && name === "ambientcg" ? "Material" : type, query);
    console.log(`\n── ${name} ── ${url}`);
    try {
      const res = await fetch(url);
      if (!res.ok) { console.log(`   HTTP ${res.status}`); continue; }
      const j = await res.json();
      let keys;
      if (name === "ambientcg") {
        // Shape: { foundAssets: [{ assetId, … }, …] } — not a flat id→meta map.
        keys = (j.foundAssets || []).map((a) => a.assetId).filter(Boolean);
      } else {
        keys = Object.keys(j).filter((k) => !query || k.toLowerCase().includes(query.toLowerCase()));
      }
      for (const k of keys.slice(0, 15)) console.log(`   ${k}`);
      if (!keys.length) console.log("   (no matches)");
    } catch (e) {
      console.log(`   unreachable: ${e.message}`);
      console.log("   (needs network access — run this on a dev machine or in CI)");
    }
  }
}

async function downloadFile(url, dest) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
  const buf = Buffer.from(await r.arrayBuffer());
  fs.writeFileSync(dest, buf);
  return buf.length;
}

async function fetchSource(args) {
  const [mat, source] = args.filter((a) => !a.startsWith("--"));
  if (!mat || !source || !source.includes(":"))
    fail("usage: fetch <MATNAME> <polyhaven|ambientcg>:<assetId> [--res 1k]");
  const [host, id] = source.split(":");
  const S = SOURCES[host];
  if (!S) fail(`unknown source "${host}" (expected polyhaven or ambientcg)`);
  const res = floatArg(args, "--res", 0) ? String(intArg(args, "--res", 1)) + "k" : strArg(args, "--res", "1k");
  const dir = path.join(PACK, "src", mat.toLowerCase());
  fs.mkdirSync(dir, { recursive: true });

  console.log(`fetching ${host}:${id} @ ${res} -> ${path.relative(ROOT, dir)}`);
  const r = await fetch(S.files(id));
  if (!r.ok) fail(`HTTP ${r.status} from ${host}`);
  const j = await r.json();
  fs.writeFileSync(path.join(dir, "_files.json"), JSON.stringify(j, null, 2));
  fs.writeFileSync(path.join(dir, "_meta.json"), JSON.stringify({
    host, id, res, licence: S.licence, source: `${host}:${id}`, fetchedAt: new Date().toISOString(),
  }, null, 2) + "\n");

  // Poly Haven: pull Diffuse + nor_gl + arm (the three maps bake-material needs).
  // ambientCG: leave _files.json for a human to pick — its download shape differs
  // and CORS-blocked browser path never uses it; node can grow later.
  if (host === "polyhaven") {
    // Prefer Diffuse; some fabrics only publish col_1/col_2 variants.
    const albedoMaps = ["Diffuse", "col_1", "col_01", "col_2"];
    let albedo = null, albedoName = null;
    for (const map of albedoMaps) {
      const f = pickFile(j, map, res, "jpg");
      if (f) { albedo = f; albedoName = map; break; }
    }
    const wanted = [
      [albedoName || "Diffuse", "diffuse", albedo],
      ["nor_gl", "normal", pickFile(j, "nor_gl", res, "jpg")],
      ["arm", "arm", pickFile(j, "arm", res, "jpg")],
    ];
    for (const [map, stem, f] of wanted) {
      if (!f) { console.log(`  skip ${map}: not published`); continue; }
      const ext = f.fmt || "jpg";
      const dest = path.join(dir, `${stem}.${ext}`);
      const n = await downloadFile(f.url, dest);
      console.log(`  ${map} -> ${path.relative(ROOT, dest)} (${(n / 1024).toFixed(0)} KB @ ${f.res}/${f.fmt})`);
    }
  } else {
    console.log("  wrote _files.json only — ambientCG downloads are not auto-pulled yet");
  }
  console.log(`next: bake-material ${mat} ${path.relative(ROOT, dir)}`);
  console.log(`licence: ${S.licence}${S.apiCredit ? ` (credit: ${S.apiCredit})` : ""}`);
}

// Mean-normalise albedo RGB so the shader's multiplicative blend
// (`albedo * tex.rgb * 2.0`) is a no-op on average — see webbake.js layer().
// Without this, a dark asphalt scan (~0.12) would multiply every surface by
// ~0.24 and crush the scene to black.
function meanNormaliseAlbedo(rgba, w, h) {
  const n = w * h;
  let mr = 0, mg = 0, mb = 0;
  for (let i = 0; i < rgba.length; i += 4) { mr += rgba[i]; mg += rgba[i + 1]; mb += rgba[i + 2]; }
  mr = Math.max(1, mr / n); mg = Math.max(1, mg / n); mb = Math.max(1, mb / n);
  const out = Buffer.alloc(rgba.length);
  for (let i = 0; i < rgba.length; i += 4) {
    out[i]     = Math.min(255, Math.round(rgba[i]     / mr * 128));
    out[i + 1] = Math.min(255, Math.round(rgba[i + 1] / mg * 128));
    out[i + 2] = Math.min(255, Math.round(rgba[i + 2] / mb * 128));
    out[i + 3] = rgba[i + 3];
  }
  return out;
}

function sliceAtlasTile(png, cols, rows, col, row, inset) {
  if (col < 0 || row < 0 || col >= cols || row >= rows)
    fail(`atlas tile (${col},${row}) is outside the ${cols}x${rows} grid`);
  const tw = Math.floor(png.w / cols), th = Math.floor(png.h / rows);
  if (tw < 4 || th < 4) fail(`atlas tile ${tw}x${th} is too small to slice`);
  const pad = Math.max(0, Math.min(inset, Math.floor(Math.min(tw, th) / 4)));
  const x0 = col * tw + pad, y0 = row * th + pad;
  const w = tw - pad * 2, h = th - pad * 2;
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    const src = ((y0 + y) * png.w + x0) * 4;
    png.rgba.copy(out, y * w * 4, src, src + w * 4);
  }
  return { w, h, rgba: out };
}

function resizeBilinear(src, sw, sh, dw, dh) {
  if (sw === dw && sh === dh) return Buffer.from(src);
  const out = Buffer.alloc(dw * dh * 4);
  for (let y = 0; y < dh; y++) {
    const fy = (y + 0.5) * sh / dh - 0.5;
    const y0 = Math.max(0, Math.min(sh - 1, Math.floor(fy)));
    const y1 = Math.min(sh - 1, y0 + 1);
    const ty = fy - y0;
    for (let x = 0; x < dw; x++) {
      const fx = (x + 0.5) * sw / dw - 0.5;
      const x0 = Math.max(0, Math.min(sw - 1, Math.floor(fx)));
      const x1 = Math.min(sw - 1, x0 + 1);
      const tx = fx - x0;
      const at = (xx, yy) => (yy * sw + xx) * 4;
      const d = (y * dw + x) * 4;
      for (let c = 0; c < 4; c++) {
        const a = src[at(x0, y0) + c] * (1 - tx) + src[at(x1, y0) + c] * tx;
        const b = src[at(x0, y1) + c] * (1 - tx) + src[at(x1, y1) + c] * tx;
        out[d + c] = Math.round(a * (1 - ty) + b * ty);
      }
    }
  }
  return out;
}

// Soft-match opposite edges so a sliced atlas tile repeats less obviously.
// The GPU will wrap these in world space; a hard crop from a 4x4 sheet
// almost never already tiles.
function healSeams(rgba, size, band) {
  const n = Math.max(0, Math.min(band, Math.floor(size / 4)));
  if (!n) return rgba;
  const out = Buffer.from(rgba);
  const pix = (x, y) => (y * size + x) * 4;
  for (let i = 0; i < n; i++) {
    const w = (1 - (i + 1) / (n + 1)) * 0.5;
    for (let y = 0; y < size; y++) {
      const L = pix(i, y), R = pix(size - 1 - i, y);
      for (let c = 0; c < 3; c++) {
        const avg = (out[L + c] + out[R + c]) * 0.5;
        out[L + c] = Math.round(out[L + c] * (1 - w) + avg * w);
        out[R + c] = Math.round(out[R + c] * (1 - w) + avg * w);
      }
    }
    for (let x = 0; x < size; x++) {
      const T = pix(x, i), B = pix(x, size - 1 - i);
      for (let c = 0; c < 3; c++) {
        const avg = (out[T + c] + out[B + c]) * 0.5;
        out[T + c] = Math.round(out[T + c] * (1 - w) + avg * w);
        out[B + c] = Math.round(out[B + c] * (1 - w) + avg * w);
      }
    }
  }
  return out;
}

function luminanceHeight(rgba, w, h) {
  const H = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    H[i] = (rgba[o] * 0.2126 + rgba[o + 1] * 0.7152 + rgba[o + 2] * 0.0722) / 255;
  }
  return H;
}

function normalsFromHeight(H, size, strength) {
  const out = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const xm = (x - 1 + size) % size, xp = (x + 1) % size;
      const ym = (y - 1 + size) % size, yp = (y + 1) % size;
      const dx = (H[y * size + xp] - H[y * size + xm]) * 0.5;
      const dy = (H[yp * size + x] - H[ym * size + x]) * 0.5;
      const nx = -dx * strength, ny = -dy * strength, nz = 1;
      const len = Math.hypot(nx, ny, nz) || 1;
      const o = (y * size + x) * 4;
      out[o] = Math.round(clamp01(nx / len * 0.5 + 0.5) * 255);
      out[o + 1] = Math.round(clamp01(ny / len * 0.5 + 0.5) * 255);
      out[o + 2] = Math.round(clamp01(H[y * size + x]) * 255);
      out[o + 3] = 255;
    }
  }
  return out;
}

function looksLikeNormalMap(rgba) {
  let n = 0, mr = 0, mg = 0, mb = 0;
  for (let i = 0; i < rgba.length; i += 16) {   // subsample
    mr += rgba[i]; mg += rgba[i + 1]; mb += rgba[i + 2]; n++;
  }
  mr /= n; mg /= n; mb /= n;
  return mr > 70 && mr < 190 && mg > 70 && mg < 190 && mb > 140;
}

function emptyStrips(size) {
  const stripH = size * MAT_LAYERS;
  const alb = Buffer.alloc(size * stripH * 4, 128);
  const nor = Buffer.alloc(size * stripH * 4, 128);
  for (let i = 3; i < alb.length; i += 4) alb[i] = 255;
  for (let i = 0; i < nor.length; i += 4) {
    nor[i] = 128; nor[i + 1] = 128; nor[i + 2] = 255; nor[i + 3] = 255;
  }
  return { alb, nor, stripH };
}

function loadStrips(size) {
  const albName = `mat-albedo-${size}.png`, norName = `mat-normal-${size}.png`;
  const albPath = path.join(PACK, albName), norPath = path.join(PACK, norName);
  const stripH = size * MAT_LAYERS;
  if (fs.existsSync(albPath) && fs.existsSync(norPath)) {
    const alb = decodePNG(fs.readFileSync(albPath));
    const nor = decodePNG(fs.readFileSync(norPath));
    if (alb.w !== size || alb.h !== stripH)
      fail(`${albName} is ${alb.w}x${alb.h}; expected ${size}x${stripH}`);
    if (nor.w !== size || nor.h !== stripH)
      fail(`${norName} is ${nor.w}x${nor.h}; expected ${size}x${stripH}`);
    return { alb: alb.rgba, nor: nor.rgba, stripH };
  }
  return emptyStrips(size);
}

function writeStrips(alb, nor, size, lowSize) {
  fs.mkdirSync(PACK, { recursive: true });
  const albName = `mat-albedo-${size}.png`, norName = `mat-normal-${size}.png`;
  fs.writeFileSync(path.join(PACK, albName), encodePNG(size, size * MAT_LAYERS, alb));
  fs.writeFileSync(path.join(PACK, norName), encodePNG(size, size * MAT_LAYERS, nor));
  if (lowSize && size % lowSize === 0 && lowSize < size) {
    const f = size / lowSize;
    const a = downsample(alb, size, size * MAT_LAYERS, f);
    const n = downsample(nor, size, size * MAT_LAYERS, f);
    fs.writeFileSync(path.join(PACK, `mat-albedo-${lowSize}.png`), encodePNG(a.w, a.h, a.rgba));
    fs.writeFileSync(path.join(PACK, `mat-normal-${lowSize}.png`), encodePNG(n.w, n.h, n.rgba));
  }
  return { albName, norName };
}

function blitLayer(strip, tile, mid, size) {
  const y0 = mid * size;
  for (let y = 0; y < size; y++) {
    tile.copy(strip, ((y0 + y) * size) * 4, y * size * 4, (y + 1) * size * 4);
  }
}

function findSourceMap(dir, stems) {
  for (const stem of stems) {
    for (const ext of ["jpg", "jpeg", "png", "webp"]) {
      const p = path.join(dir, `${stem}.${ext}`);
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}

async function bakeMaterial(args) {
  const [matName, dirArg] = args.filter((a) => !a.startsWith("--"));
  if (!matName || !dirArg) fail("usage: bake-material <MATNAME> <dir-of-source-maps> [--size N]");
  let sharp = null;
  try { sharp = (await import("sharp")).default; } catch (_) {}
  if (!sharp) {
    console.error("bake-material needs an image decoder for JPG/PNG source scans.");
    console.error("  npm i -D sharp     (dev-only; the game never loads it)");
    console.error("Meanwhile `bake-synthetic` produces a complete pack with no dependencies.");
    process.exit(2);
  }

  const matKey = matName.toUpperCase();
  const mid = MAT[matKey];
  if (mid == null) fail(`unknown MAT "${matName}" — expected one of ${Object.keys(MAT).join(", ")}`);
  if (mid === MAT.FLAT || mid === MAT.GLASS || mid === MAT.FLAG)
    fail(`${matKey} is never baked (FLAT=no-material; GLASS needs mirror read; FLAG is vertex-displaced)`);
  if (!(SCALES[mid] > 0)) fail(`${matKey} has no SCALES entry`);

  const srcDir = path.resolve(dirArg);
  if (!fs.existsSync(srcDir)) fail(`source dir not found: ${srcDir}`);

  // Prefer an existing pack size so we patch in place; --size overrides.
  const man = readManifest();
  const size = intArg(args, "--size", (man.materials && man.materials.size) || 256);
  const lowSize = (man.materials && man.materials.low && man.materials.low.size) || 128;

  const diffPath = findSourceMap(srcDir, ["diffuse", "albedo", "color", "diff"]);
  if (!diffPath) fail(`no diffuse/albedo map in ${srcDir} (expected diffuse.jpg etc — run fetch first)`);
  const normPath = findSourceMap(srcDir, ["normal", "nor_gl", "nor"]);
  const armPath = findSourceMap(srcDir, ["arm"]);
  const roughPath = findSourceMap(srcDir, ["roughness", "rough"]);
  const aoPath = findSourceMap(srcDir, ["ao", "ambient"]);

  const resize = async (p) => {
    if (!p) return null;
    const { data, info } = await sharp(p).ensureAlpha().resize(size, size, { fit: "fill" })
      .raw().toBuffer({ resolveWithObject: true });
    if (info.width !== size || info.height !== size)
      fail(`resize produced ${info.width}x${info.height}, expected ${size}x${size}`);
    return data;
  };

  const dif = await resize(diffPath);
  const nrm = await resize(normPath);
  const arm = await resize(armPath);
  const rough = arm ? null : await resize(roughPath);
  const ao = arm ? null : await resize(aoPath);

  // Pack: albedo RGB + A roughness; normal RG + B AO (+ A=255).
  const alb = meanNormaliseAlbedo(dif, size, size);
  const nor = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size * 4; i += 4) {
    alb[i + 3] = arm ? arm[i + 1] : (rough ? rough[i] : 220);
    nor[i]     = nrm ? nrm[i]     : 128;
    nor[i + 1] = nrm ? nrm[i + 1] : 128;
    nor[i + 2] = arm ? arm[i]     : (ao ? ao[i] : 255);
    nor[i + 3] = 255;
  }

  fs.mkdirSync(PACK, { recursive: true });
  const albName = `mat-albedo-${size}.png`;
  const norName = `mat-normal-${size}.png`;
  const albPath = path.join(PACK, albName);
  const norPath = path.join(PACK, norName);

  // Start from existing strips when present so we only replace this MAT layer.
  const stripH = size * MAT_LAYERS;
  let albStrip, norStrip;
  if (fs.existsSync(albPath) && fs.existsSync(norPath)) {
    albStrip = decodePNG(fs.readFileSync(albPath));
    norStrip = decodePNG(fs.readFileSync(norPath));
    if (albStrip.w !== size || albStrip.h !== stripH)
      fail(`${albName} is ${albStrip.w}x${albStrip.h}; expected ${size}x${stripH} — pass --size or re-import`);
  } else {
    albStrip = { w: size, h: stripH, rgba: Buffer.alloc(size * stripH * 4, 128) };
    norStrip = { w: size, h: stripH, rgba: Buffer.alloc(size * stripH * 4) };
    for (let i = 0; i < norStrip.rgba.length; i += 4) {
      norStrip.rgba[i] = 128; norStrip.rgba[i + 1] = 128;
      norStrip.rgba[i + 2] = 255; norStrip.rgba[i + 3] = 255;
    }
    // Clear alpha on neutral albedo fill (encodePNG cares about full RGBA).
    for (let i = 3; i < albStrip.rgba.length; i += 4) albStrip.rgba[i] = 255;
  }

  const y0 = mid * size;
  for (let y = 0; y < size; y++) {
    const srcOff = y * size * 4;
    const dstOff = ((y0 + y) * size) * 4;
    alb.copy(albStrip.rgba, dstOff, srcOff, srcOff + size * 4);
    nor.copy(norStrip.rgba, dstOff, srcOff, srcOff + size * 4);
  }

  fs.writeFileSync(albPath, encodePNG(size, stripH, albStrip.rgba));
  fs.writeFileSync(norPath, encodePNG(size, stripH, norStrip.rgba));

  // Refresh the low-tier downsample of just this layer by re-downsampling the
  // whole strip — cheap at 256→128 and keeps mobile in sync.
  if (lowSize && size % lowSize === 0 && lowSize < size) {
    const f = size / lowSize;
    for (const [which, strip] of [["albedo", albStrip], ["normal", norStrip]]) {
      const small = downsample(strip.rgba, strip.w, strip.h, f);
      const name = `mat-${which}-${lowSize}.png`;
      fs.writeFileSync(path.join(PACK, name), encodePNG(small.w, small.h, small.rgba));
    }
  }

  let meta = {};
  try { meta = JSON.parse(fs.readFileSync(path.join(srcDir, "_meta.json"), "utf8")); } catch (_) {}
  const source = meta.source || `local:${path.relative(ROOT, srcDir)}`;
  const licence = meta.licence || "CC0";
  const author = meta.host === "polyhaven" ? "Poly Haven contributors"
    : meta.host === "ambientcg" ? "ambientCG contributors" : "unknown";

  const out = readManifest();
  out.version = 1;
  out.materials = out.materials || { size, layers: [] };
  out.materials.size = size;
  out.materials.albedo = albName;
  out.materials.normal = norName;
  if (lowSize && lowSize < size) {
    out.materials.low = out.materials.low || { size: lowSize, layers: [] };
    out.materials.low.size = lowSize;
    out.materials.low.albedo = `mat-albedo-${lowSize}.png`;
    out.materials.low.normal = `mat-normal-${lowSize}.png`;
  }
  const layers = (out.materials.layers || []).filter((L) => L.mat !== mid);
  layers.push({
    mat: mid, id: MAT_NAME[mid].toLowerCase(), scale: SCALES[mid],
    source, licence, author,
  });
  layers.sort((a, b) => a.mat - b.mat);
  out.materials.layers = layers;
  if (out.materials.low) out.materials.low.layers = layers;
  out.models = out.models || {};
  out.env = out.env || {};
  out.credits = buildCredits(out);
  writeManifest(out);
  credits();
  report(out);
  console.log(`baked ${matKey} (mat ${mid}) from ${path.relative(ROOT, srcDir)} @ ${size}px`);
}

// ──────────────────────────── atlas bake ─────────────────────────────────────
// Slice a 4x4 (or NxN) albedo/normal atlas into MAT layers and patch them
// into the committed filmstrips. Unmapped slots (ASPHALT, WOOD, …) stay as
// they are. No sharp, no network — decodePNG + the helpers above.

function parseMapArg(s) {
  // BRICK=1,0  or  BRICK=1,0,arch-normal,0,0
  const m = /^([A-Z]+)=(\d+),(\d+)(?:,([A-Za-z0-9_-]+),(\d+),(\d+))?$/.exec(s);
  if (!m) fail(`bad --map "${s}" — expected MAT=col,row or MAT=col,row,normalId,ncol,nrow`);
  return {
    mat: m[1],
    albedo: [null, +m[2], +m[3]],
    normal: m[4] ? [m[4], +m[5], +m[6]] : null,
  };
}

function bakeAtlas(args) {
  const presetName = strArg(args, "--preset", null);
  const preset = presetName ? ATLAS_PRESETS[presetName] : null;
  if (presetName && !preset) fail(`unknown --preset ${presetName} (have ${Object.keys(ATLAS_PRESETS).join(", ")})`);

  const grid = intArg(args, "--grid", preset ? preset.grid : 4);
  const inset = intArg(args, "--inset", preset ? preset.inset : 4);
  const man = readManifest();
  const size = intArg(args, "--size", (man.materials && man.materials.size) || 256);
  const lowSize = intArg(args, "--low", (man.materials && man.materials.low && man.materials.low.size) || 128);
  if (size < 8 || (size & (size - 1)) !== 0)
    fail(`--size must be a power of two >= 8 (got ${size})`);

  const files = { ...(preset && preset.files) };
  const albedoPath = strArg(args, "--albedo", null);
  const normalPath = strArg(args, "--normal", null);
  if (albedoPath) files.albedo = path.resolve(albedoPath);
  if (normalPath) files.normal = path.resolve(normalPath);

  const layers = preset ? preset.layers.map((L) => ({ ...L })) : [];
  for (const raw of allArgs(args, "--map")) {
    const parsed = parseMapArg(raw);
    parsed.albedo[0] = parsed.albedo[0] || "albedo";
    layers.push(parsed);
  }
  if (!layers.length)
    fail("bake-atlas needs --preset generated and/or --map MAT=col,row");

  const cache = Object.create(null);
  const loadAtlas = (id) => {
    if (!id) return null;
    if (cache[id]) return cache[id];
    const spec = files[id];
    if (!spec) fail(`atlas id "${id}" has no file (pass --albedo / --normal or use a preset)`);
    const p = path.isAbsolute(spec) ? spec : path.join(preset ? ATLAS_DIR : process.cwd(), spec);
    if (!fs.existsSync(p)) fail(`atlas not found: ${p}`);
    cache[id] = decodePNG(fs.readFileSync(p));
    cache[id]._path = p;
    return cache[id];
  };

  const { alb: albStrip, nor: norStrip } = loadStrips(size);
  const baked = [];

  for (const L of layers) {
    const matKey = L.mat.toUpperCase();
    const mid = MAT[matKey];
    if (mid == null) fail(`unknown MAT "${L.mat}"`);
    if (mid === MAT.FLAT || mid === MAT.GLASS || mid === MAT.FLAG)
      fail(`${matKey} is never baked`);
    if (!(SCALES[mid] > 0)) fail(`${matKey} has no SCALES entry`);

    const [albId, ac, ar] = L.albedo;
    const albPng = loadAtlas(albId);
    const tile = sliceAtlasTile(albPng, grid, grid, ac, ar, inset);
    let alb = resizeBilinear(tile.rgba, tile.w, tile.h, size, size);
    alb = healSeams(alb, size, Math.max(2, Math.round(size / 32)));
    alb = meanNormaliseAlbedo(alb, size, size);
    const rough = ROUGHNESS[mid] != null ? ROUGHNESS[mid] : 220;
    for (let i = 3; i < alb.length; i += 4) alb[i] = rough;

    let nor;
    if (L.normal) {
      const [nid, nc, nr] = L.normal;
      const nPng = loadAtlas(nid);
      const nTile = sliceAtlasTile(nPng, grid, grid, nc, nr, inset);
      let nRgba = resizeBilinear(nTile.rgba, nTile.w, nTile.h, size, size);
      nRgba = healSeams(nRgba, size, Math.max(2, Math.round(size / 32)));
      if (looksLikeNormalMap(nRgba)) {
        nor = Buffer.alloc(size * size * 4);
        const H = luminanceHeight(alb, size, size);
        for (let i = 0; i < size * size; i++) {
          const o = i * 4;
          nor[o] = nRgba[o];
          nor[o + 1] = nRgba[o + 1];
          nor[o + 2] = Math.round(clamp01(H[i]) * 255);
          nor[o + 3] = 255;
        }
      } else {
        nor = normalsFromHeight(luminanceHeight(alb, size, size), size, 8);
      }
    } else {
      nor = normalsFromHeight(luminanceHeight(alb, size, size), size, 8);
    }

    blitLayer(albStrip, alb, mid, size);
    blitLayer(norStrip, nor, mid, size);
    const srcFile = path.relative(ROOT, albPng._path);
    baked.push({
      mid, id: MAT_NAME[mid].toLowerCase(),
      source: `generated:${srcFile}#${ac},${ar}`,
      licence: "Apex26-Procedural",
      author: "Apex 26",
    });
    console.log(`  ${matKey} ← ${srcFile} tile ${ac},${ar}`);
  }

  const { albName, norName } = writeStrips(albStrip, norStrip, size, lowSize || 0);
  const out = readManifest();
  out.version = 1;
  out.materials = out.materials || { size, layers: [] };
  out.materials.size = size;
  out.materials.albedo = albName;
  out.materials.normal = norName;
  if (lowSize && lowSize < size) {
    out.materials.low = out.materials.low || { size: lowSize, layers: [] };
    out.materials.low.size = lowSize;
    out.materials.low.albedo = `mat-albedo-${lowSize}.png`;
    out.materials.low.normal = `mat-normal-${lowSize}.png`;
  }
  const layersOut = out.materials.layers || [];
  for (const rec of baked) {
    const i = layersOut.findIndex((x) => x.mat === rec.mid);
    const row = {
      mat: rec.mid, id: rec.id, scale: SCALES[rec.mid],
      source: rec.source, licence: rec.licence, author: rec.author,
    };
    if (i >= 0) layersOut[i] = row; else layersOut.push(row);
  }
  layersOut.sort((a, b) => a.mat - b.mat);
  out.materials.layers = layersOut;
  if (out.materials.low) out.materials.low.layers = layersOut;
  out.models = out.models || {};
  out.env = out.env || {};
  out.credits = buildCredits(out);
  writeManifest(out);
  credits();
  report(out);
  console.log(`baked ${baked.length} atlas layer(s) @ ${size}px`);
}

// ────────────────────────────── verify / credits ─────────────────────────────

function verify() {
  const problems = [];
  if (!fs.existsSync(MANIFEST)) {
    console.log("no pack installed (assets/pack/manifest.json absent) — that is a valid state");
    return 0;
  }
  const m = readManifest();
  let bytes = 0;

  const checkEntry = (what, e) => {
    if (!e.licence || !ALLOWED_LICENCES.has(e.licence))
      problems.push(`${what}: licence "${e.licence || "(none)"}" is not in the allow-list (${[...ALLOWED_LICENCES].join(", ")})`);
    if (!e.source) problems.push(`${what}: no source recorded — every asset must be traceable`);
  };

  const mats = m.materials;
  if (mats) {
    for (const f of [mats.albedo, mats.normal, mats.low && mats.low.albedo, mats.low && mats.low.normal]) {
      if (!f) continue;
      const p = path.join(PACK, f);
      if (!fs.existsSync(p)) { problems.push(`materials: missing file ${f}`); continue; }
      bytes += fs.statSync(p).size;
    }
    const seen = new Set();
    for (const L of mats.layers || []) {
      checkEntry(`material ${L.id}`, L);
      if (!(L.mat >= 1 && L.mat < MAT_LAYERS))
        problems.push(`material ${L.id}: mat id ${L.mat} outside 1..${MAT_LAYERS - 1}`);
      if (seen.has(L.mat)) problems.push(`material ${L.id}: duplicate mat id ${L.mat}`);
      seen.add(L.mat);
      if (!(L.scale > 0)) problems.push(`material ${L.id}: scale must be > 0`);
    }
  }

  for (const [id, rec] of Object.entries(m.models || {})) {
    checkEntry(`model ${id}`, rec);
    const p = path.join(PACK, rec.file || "");
    if (!rec.file || !fs.existsSync(p)) { problems.push(`model ${id}: missing file ${rec.file}`); continue; }
    const buf = fs.readFileSync(p);
    bytes += buf.length;
    if (rec.md5) {
      const md5 = crypto.createHash("md5").update(buf).digest("hex");
      if (md5 !== rec.md5) problems.push(`model ${id}: md5 mismatch (file changed since bake)`);
    }
  }
  for (const [k, rec] of Object.entries(m.env || {})) checkEntry(`env ${k}`, rec);

  if (bytes > BUDGET_BYTES)
    problems.push(`pack is ${(bytes / 1048576).toFixed(2)} MB — over the ${(BUDGET_BYTES / 1048576).toFixed(0)} MB budget`);

  console.log(`pack: ${(bytes / 1024).toFixed(0)} KB / ${(BUDGET_BYTES / 1048576).toFixed(0)} MB budget`);
  if (!problems.length) { console.log("verify: OK"); return 0; }
  for (const p of problems) console.error(`  ✗ ${p}`);
  return 1;
}

function buildCredits(m) {
  const out = [];
  const push = (kind, id, e) => {
    if (!e) return;
    out.push({ kind, id, author: e.author || "unknown", licence: e.licence || "unknown", source: e.source || "" });
  };
  for (const L of (m.materials && m.materials.layers) || []) push("material", L.id, L);
  for (const [id, rec] of Object.entries(m.models || {})) push("model", id, rec);
  for (const [k, rec] of Object.entries(m.env || {})) push("env", k, rec);
  return out;
}

function credits() {
  const m = readManifest();
  m.credits = buildCredits(m);
  writeManifest(m);
  const usesPolyHaven = m.credits.some((c) => (c.source || "").includes("polyhaven"));
  const lines = [
    "# Asset credits",
    "",
    "Generated by `node tools/assets.mjs credits` — do not hand-edit.",
    "",
  ];
  if (usesPolyHaven) lines.push("Powered by Poly Haven.", "");
  lines.push("| kind | id | author | licence | source |", "|---|---|---|---|---|");
  for (const c of m.credits)
    lines.push(`| ${c.kind} | ${c.id} | ${c.author} | ${c.licence} | ${c.source} |`);
  lines.push("");
  fs.mkdirSync(PACK, { recursive: true });
  fs.writeFileSync(path.join(PACK, "CREDITS.md"), lines.join("\n"));
  console.log(`wrote assets/pack/CREDITS.md (${m.credits.length} entries)`);
}

// ────────────────────────────────── plumbing ─────────────────────────────────

function readManifest() {
  if (!fs.existsSync(MANIFEST)) return { version: 1, materials: null, models: {}, env: {}, credits: [] };
  try { return JSON.parse(fs.readFileSync(MANIFEST, "utf8")); }
  catch (e) { fail(`manifest.json is not valid JSON: ${e.message}`); }
}

function writeManifest(m) {
  fs.mkdirSync(PACK, { recursive: true });
  fs.writeFileSync(MANIFEST, JSON.stringify(m, null, 2) + "\n");
}

function report(m) {
  let bytes = 0;
  const add = (f) => { const p = f && path.join(PACK, f); if (p && fs.existsSync(p)) bytes += fs.statSync(p).size; };
  if (m.materials) { add(m.materials.albedo); add(m.materials.normal); }
  for (const r of Object.values(m.models || {})) add(r.file);
  console.log(`pack: ${(bytes / 1024).toFixed(0)} KB (budget ${(BUDGET_BYTES / 1048576).toFixed(0)} MB)`);
  if (bytes > BUDGET_BYTES) console.error("  ✗ OVER BUDGET — see tools/assets.mjs BUDGET_BYTES");
}

const strArg = (a, k, d) => { const i = a.indexOf(k); return i >= 0 && a[i + 1] ? a[i + 1] : d; };
const allArgs = (a, k) => {
  const out = [];
  for (let i = 0; i < a.length; i++) if (a[i] === k && a[i + 1]) out.push(a[i + 1]);
  return out;
};
const intArg = (a, k, d) => { const v = strArg(a, k, null); return v == null ? d : parseInt(v, 10); };
const floatArg = (a, k, d) => { const v = strArg(a, k, null); return v == null ? d : parseFloat(v); };
const vecArg = (a, k) => {
  const v = strArg(a, k, null);
  if (!v) return null;
  const p = v.split(",").map(Number);
  return p.length === 3 && p.every((n) => Number.isFinite(n)) ? p : null;
};

function fail(msg) { console.error(`error: ${msg}`); process.exit(1); }

async function bakeSyntheticModels(_args) {
  const { buildAll: buildSynthModels, CATALOG_IDS: SYNTH_MODEL_IDS } = await getSynthModels();
  if (!buildSynthModels) { console.error("synth-models.mjs not found"); process.exit(1); }
  console.log(`baking ${SYNTH_MODEL_IDS.length} procedural models (no network) …`);
  fs.mkdirSync(path.join(PACK, "models"), { recursive: true });
  const built = buildSynthModels();
  const m = readManifest();
  m.models = m.models || {};

  // Drop previous model bins that we are replacing (and orphans no longer in catalog).
  const keepFiles = new Set();
  let verts = 0;
  for (const id of SYNTH_MODEL_IDS) {
    const mesh = built[id];
    if (!mesh || mesh.verts < 3) fail(`synth model "${id}" produced no geometry`);
    const buf = writeAX26(mesh, mesh.matName);
    const rel = path.join("models", `${id}.bin`).split(path.sep).join("/");
    fs.writeFileSync(path.join(PACK, rel), buf);
    keepFiles.add(path.basename(rel));
    verts += mesh.verts;
    m.models[id] = {
      file: rel,
      verts: mesh.verts,
      tris: mesh.tris,
      mat: mesh.matName,
      sizeM: mesh.sizeM,
      source: "procedural:tools/synth-models.mjs",
      licence: "Apex26-Procedural",
      author: "Apex 26",
      md5: crypto.createHash("md5").update(buf).digest("hex"),
    };
  }
  // Remove Kenney (or other) bins that are no longer in the synthetic catalog,
  // and drop their manifest entries so verify cannot see a stale CC0 download.
  for (const id of Object.keys(m.models)) {
    if (!SYNTH_MODEL_IDS.includes(id)) {
      const f = m.models[id].file;
      const abs = path.join(PACK, f);
      if (fs.existsSync(abs)) fs.unlinkSync(abs);
      delete m.models[id];
      console.log(`removed non-catalog model ${id}`);
    }
  }
  for (const f of fs.readdirSync(path.join(PACK, "models"))) {
    if (f.endsWith(".bin") && !keepFiles.has(f)) {
      fs.unlinkSync(path.join(PACK, "models", f));
      console.log(`removed orphan ${f}`);
    }
  }

  m.credits = buildCredits(m);
  writeManifest(m);
  credits();
  console.log(`synthetic models: ${SYNTH_MODEL_IDS.length} ids, ${verts} verts total`);
  report(m);
}

const USAGE = `Apex 26 asset bake CLI

  bake-synthetic [--size N]        generate the full material pack (no network, no deps)
  bake-synthetic-models            generate AX26 scenery models (no network / glTF)
  bake-atlas [--preset generated]  slice 4x4 albedo/normal atlases into MAT layers
  search <type> <query>            list CC0 candidates on Poly Haven + ambientCG
  fetch <MAT> <host:id> [--res 1k] download CC0 source maps (Diffuse/nor_gl/arm)
  bake-material <MAT> <dir>        composite source maps into a layer (needs sharp)
  import-pack <dir> [--size N]     install a browser bake (assets/pack/webbake.js)
  bake-model <id> <file.glb>       bake glTF -> the game's own vertex format
  bake-env "<track>|<tod>" --sky r,g,b --ground r,g,b
  bake-env-hdri <id> --tod day        sample a Poly Haven 1k HDRI → env ambient
  verify                           licences, hashes, budget
  credits                          regenerate assets/pack/CREDITS.md
`;

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  switch (cmd) {
    case "bake-synthetic": bakeSynthetic(args); break;
    case "bake-synthetic-models": await bakeSyntheticModels(args); break;
    case "bake-atlas": bakeAtlas(args); break;
    case "search": await search(args); break;
    case "fetch": await fetchSource(args); break;
    case "bake-material": await bakeMaterial(args); break;
    case "import-pack": importPack(args); break;
    case "bake-model": await bakeModel(args); break;
    case "bake-env": bakeEnv(args); break;
    case "bake-env-hdri": await bakeEnvHdri(args); break;
    case "verify": process.exit(verify()); break;
    case "credits": credits(); break;
    default: console.log(USAGE); process.exit(cmd ? 1 : 0);
  }
}

// Only when RUN, not when imported. tools/trace-logo.mjs reuses decodePNG and
// tools/crest-sweep.mjs reuses encodePNG rather than adding a third copy of
// each to the tree (there is already a second decoder in import-models.mjs).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch((e) => fail(e && e.stack ? e.stack : String(e)));
