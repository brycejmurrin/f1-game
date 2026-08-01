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
 * with no egress — and it ships as the default pack.  `fetch`/`bake-material`
 * are the real-CC0-scan path and need network plus an image decoder (sharp).
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

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
// tests/assets-pack.test.mjs so the two cannot drift.
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
  [MAT.CONCRETE]: 4.0, [MAT.BRICK]: 2.4, [MAT.METAL]: 2.0, [MAT.WOOD]: 2.2,
  [MAT.FOLIAGE]: 3.0, [MAT.FABRIC]: 1.5, [MAT.SAND]: 6.0, [MAT.GRASS]: 3.0,
  [MAT.ROCK]: 5.0, [MAT.SNOW]: 6.0, [MAT.ROOF]: 2.0, [MAT.STONE]: 3.0,
  [MAT.RUST]: 2.0, [MAT.ASPHALT]: 4.0,
};

const MAT_NAME = Object.fromEntries(Object.entries(MAT).map(([k, v]) => [v, k]));

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

function crc32(buf) {
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

function encodePNG(w, h, rgba) {
  // Per-scanline filter 1 (Sub) — noise textures compress meaningfully better
  // under Sub than under None, and it costs one pass.
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    const o = y * (stride + 1);
    raw[o] = 1;
    for (let x = 0; x < stride; x++) {
      const cur = rgba[y * stride + x];
      const left = x >= 4 ? rgba[y * stride + x - 4] : 0;
      raw[o + 1 + x] = (cur - left) & 0xff;
    }
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
// matBumpHeight()'s pattern vocabulary (js/render/shaders/lit.js:196) so a
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

function bakeSynthetic(args) {
  const size = intArg(args, "--size", 128);
  if (size < 8 || (size & (size - 1)) !== 0)
    fail(`--size must be a power of two >= 8 (got ${size})`);

  const ids = Object.keys(SCALES).map(Number).sort((a, b) => a - b);
  console.log(`baking ${ids.length} material layers at ${size}px …`);

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
        const k = mid === MAT.ASPHALT ? 3.0 : 8.0;
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

  const m = readManifest();
  m.materials = {
    size,
    albedo: aFile,
    normal: nFile,
    layers: ids.map((mid) => ({
      mat: mid, id: MAT_NAME[mid].toLowerCase(), scale: SCALES[mid],
      source: "procedural:tools/assets.mjs", licence: "Apex26-Procedural",
      author: "Apex 26",
    })),
  };
  m.credits = buildCredits(m);
  writeManifest(m);
  report(m);
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
  m.env[key] = {
    ambientSky: sky, ambientGround: ground,
    source: strArg(args, "--source", "manual"),
    licence: strArg(args, "--licence", "CC0"),
    author: strArg(args, "--author", "Apex 26"),
  };
  m.credits = buildCredits(m);
  writeManifest(m);
  console.log(`env "${key}" -> sky ${sky} ground ${ground}`);
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
    const url = S.list(type, query);
    console.log(`\n── ${name} ── ${url}`);
    try {
      const res = await fetch(url);
      if (!res.ok) { console.log(`   HTTP ${res.status}`); continue; }
      const j = await res.json();
      const keys = Object.keys(j).filter((k) => !query || k.toLowerCase().includes(query.toLowerCase()));
      for (const k of keys.slice(0, 15)) console.log(`   ${k}`);
      if (!keys.length) console.log("   (no matches)");
    } catch (e) {
      // The sandbox this was written in has no egress to either host.  Say so
      // plainly instead of pretending the library is empty.
      console.log(`   unreachable: ${e.message}`);
      console.log("   (needs network access — run this on a dev machine or in CI)");
    }
  }
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
  console.log(`wrote _files.json — pick the maps you want, then: bake-material ${mat} ${path.relative(ROOT, dir)}`);
  console.log(`licence: ${S.licence}${S.apiCredit ? ` (credit: ${S.apiCredit})` : ""}`);
}

async function bakeMaterial(args) {
  const [mat, dir] = args.filter((a) => !a.startsWith("--"));
  if (!mat || !dir) fail("usage: bake-material <MATNAME> <dir-of-source-maps> [--size N]");
  let sharp = null;
  try { sharp = (await import("sharp")).default; } catch (_) {}
  if (!sharp) {
    console.error("bake-material needs an image decoder for JPG/PNG source scans.");
    console.error("  npm i -D sharp     (dev-only; the game never loads it)");
    console.error("Meanwhile `bake-synthetic` produces a complete pack with no dependencies.");
    process.exit(2);
  }
  // Composite <dir>/{color,normal,roughness}.* into the existing filmstrip at
  // this material's layer.  Left as an explicit follow-up: the sandbox this was
  // authored in has no egress, so this path is unexercised and must not be
  // presented as verified.  See docs/research/ASSET-API-RESEARCH.md §3.1.
  fail("bake-material is not implemented yet — see docs/research/ASSET-API-RESEARCH.md (needs a network-capable machine to develop against)");
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
const intArg = (a, k, d) => { const v = strArg(a, k, null); return v == null ? d : parseInt(v, 10); };
const floatArg = (a, k, d) => { const v = strArg(a, k, null); return v == null ? d : parseFloat(v); };
const vecArg = (a, k) => {
  const v = strArg(a, k, null);
  if (!v) return null;
  const p = v.split(",").map(Number);
  return p.length === 3 && p.every((n) => Number.isFinite(n)) ? p : null;
};

function fail(msg) { console.error(`error: ${msg}`); process.exit(1); }

const USAGE = `Apex 26 asset bake CLI

  bake-synthetic [--size N]        generate the full material pack (no network, no deps)
  search <type> <query>            list CC0 candidates on Poly Haven + ambientCG
  fetch <MAT> <host:id> [--res 1k] download a CC0 source material's file list
  bake-material <MAT> <dir>        composite source maps into a layer (needs sharp)
  bake-model <id> <file.glb>       bake glTF -> the game's own vertex format
  bake-env "<track>|<tod>" --sky r,g,b --ground r,g,b
  verify                           licences, hashes, budget
  credits                          regenerate assets/pack/CREDITS.md
`;

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  switch (cmd) {
    case "bake-synthetic": bakeSynthetic(args); break;
    case "search": await search(args); break;
    case "fetch": await fetchSource(args); break;
    case "bake-material": await bakeMaterial(args); break;
    case "bake-model": await bakeModel(args); break;
    case "bake-env": bakeEnv(args); break;
    case "verify": process.exit(verify()); break;
    case "credits": credits(); break;
    default: console.log(USAGE); process.exit(cmd ? 1 : 0);
  }
}

main().catch((e) => fail(e && e.stack ? e.stack : String(e)));
