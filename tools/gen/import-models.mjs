#!/usr/bin/env node
/*
 * @doc Batch glTF → AX26 model importer for real CC0 model PACKS (directories of .gltf + .bin + textures).
 * @skill asset-pack
 * Apex 26 — batch glTF -> AX26 model importer.
 *
 * WHY THIS IS SEPARATE FROM assets.mjs bake-model. bake-model takes one local
 * .glb and leans on the game's OWN js/render/shared/gltf.js (GLB-only, no external
 * .bin). Real CC0 model PACKS are directories of .gltf + sidecar .bin + a
 * texture, dozens of files, and they arrive on a GitHub Actions runner rather
 * than a dev machine — because the runner has open network and CORS does not
 * exist server-side, which is the only thing that can reach itch.io / Kenney /
 * Quaternius when neither the browser (CORS) nor this sandbox (proxy 403) can.
 * So this reads glTF directly, in node, with no browser and no game globals.
 *
 * SCOPE, deliberately narrow: static meshes, POSITION / NORMAL / TEXCOORD_0 /
 * indices, one level of node transform, colour from baseColorFactor OR a
 * per-vertex sample of a palette texture (the low-poly convention — Quaternius
 * "Simple" packs use flat factors, the atlas ones a small gradient png). No
 * skins, animations, Draco, sparse accessors. Anything unsupported is skipped
 * with a reason, never a crash — a pack is dozens of models and one bad file
 * must not sink the rest.
 *
 *   node tools/gen/import-models.mjs <dir> [--mat CONCRETE] [--height 12] [--prefix q_]
 *
 * Writes assets/pack/models/<name>.bin (the format js/render/shared/assets.js parses)
 * and updates the manifest. --height normalises each model to that many metres
 * tall, because pack authors use wildly different unit scales.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PACK = process.env.APEX_PACK_DIR ? path.resolve(process.env.APEX_PACK_DIR)
                                       : path.join(ROOT, "assets", "pack");
const MAT = { FLAT: 0, CONCRETE: 1, BRICK: 2, GLASS: 3, METAL: 4, WOOD: 5, FOLIAGE: 6,
              FABRIC: 7, SAND: 8, GRASS: 9, ROCK: 10, SNOW: 11, ROOF: 12, STONE: 13,
              RUST: 14, FLAG: 15, ASPHALT: 16 };

const COMP = { 5120: [Int8Array, 1], 5121: [Uint8Array, 1], 5122: [Int16Array, 2],
               5123: [Uint16Array, 2], 5125: [Uint32Array, 4], 5126: [Float32Array, 4] };
const NUM = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

// ── minimal PNG decoder (palette textures are PNG; canvas-emitted, 8-bit) ─────
// Colour types: 2 = RGB, 6 = RGBA, 3 = indexed (PLTE). Kenney City Kit Roads /
// Modular Buildings ship indexed colormaps — without type-3 support those
// imports silently fall back to flat 0.75 grey (materialColour catches the
// throw) and barriers/cones arrive colourless.
function decodePNG(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("not a PNG");
  let off = 8, w = 0, h = 0, colour = 0; const idat = [];
  let plte = null, trns = null;
  while (off < buf.length) {
    const len = buf.readUInt32BE(off), type = buf.toString("ascii", off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") { w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      if (data[8] !== 8) throw new Error("bit depth"); colour = data[9];
      if (colour !== 2 && colour !== 6 && colour !== 3) throw new Error("colour type"); }
    else if (type === "PLTE") plte = Buffer.from(data);
    else if (type === "tRNS") trns = Buffer.from(data);
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    off += 12 + len;
  }
  if (colour === 3 && (!plte || plte.length < 3)) throw new Error("indexed PNG missing PLTE");
  const ch = colour === 6 ? 4 : colour === 3 ? 1 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * ch, out = Buffer.alloc(w * h * 4); let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride));
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? line[i - ch] : 0, b = prev[i], c = i >= ch ? prev[i - ch] : 0;
      let v = line[i];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c); }
      line[i] = v & 0xff;
    }
    for (let x = 0; x < w; x++) {
      const d = (y * w + x) * 4;
      if (colour === 3) {
        const idx = line[x], po = idx * 3;
        out[d] = plte[po]; out[d + 1] = plte[po + 1]; out[d + 2] = plte[po + 2];
        out[d + 3] = trns && idx < trns.length ? trns[idx] : 255;
      } else {
        const s = x * ch;
        out[d] = line[s]; out[d + 1] = line[s + 1]; out[d + 2] = line[s + 2];
        out[d + 3] = ch === 4 ? line[s + 3] : 255;
      }
    }
    prev = line;
  }
  return { w, h, rgba: out };
}

// ── glTF reader ───────────────────────────────────────────────────────────────
function parseGLTF(file) {
  const dir = path.dirname(file);
  let json, bins = [];
  if (file.toLowerCase().endsWith(".glb")) {
    const buf = fs.readFileSync(file);
    if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error("bad GLB magic");
    let o = 12, bin = null;
    while (o < buf.length) {
      const len = buf.readUInt32LE(o), type = buf.readUInt32LE(o + 4);
      const data = buf.subarray(o + 8, o + 8 + len);
      if (type === 0x4e4f534a) json = JSON.parse(data.toString("utf8"));
      else if (type === 0x004e4942) bin = data;
      o += 8 + len;
    }
    bins = [bin];
  } else {
    json = JSON.parse(fs.readFileSync(file, "utf8"));
    bins = (json.buffers || []).map((b) => {
      if (!b.uri) throw new Error("buffer with no uri in a .gltf");
      if (b.uri.startsWith("data:")) return Buffer.from(b.uri.split(",")[1], "base64");
      return fs.readFileSync(path.join(dir, decodeURIComponent(b.uri)));
    });
  }
  return { json, bins, dir };
}

function accessor(gltf, idx) {
  const { json, bins } = gltf;
  const a = json.accessors[idx];
  const bv = json.bufferViews[a.bufferView];
  const [Ctor, csz] = COMP[a.componentType];
  const n = NUM[a.type];
  const base = (bv.byteOffset || 0) + (a.byteOffset || 0);
  const bin = bins[bv.buffer];
  const out = new Float32Array(a.count * n);
  const stride = bv.byteStride || csz * n;
  for (let i = 0; i < a.count; i++) {
    const view = new Ctor(bin.buffer, bin.byteOffset + base + i * stride, n);
    for (let j = 0; j < n; j++) out[i * n + j] = view[j];
  }
  return { data: out, n, count: a.count };
}

// Compose the world transform of a node chain (translation/rotation/scale or a
// matrix). Quaternius rigs are shallow, but ignoring transforms would scatter
// parts, so this walks the scene graph properly.
function nodeMatrix(node) {
  if (node.matrix) return node.matrix.slice();
  const t = node.translation || [0, 0, 0], r = node.rotation || [0, 0, 0, 1], s = node.scale || [1, 1, 1];
  const [x, y, z, w] = r;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  return [
    (1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0,
    (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0,
    (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0,
    t[0], t[1], t[2], 1,
  ];
}
function mul(a, b) {
  const o = new Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  }
  return o;
}
function xform(m, p) {
  return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
          m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
          m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14]];
}
function xformDir(m, p) {   // rotation/scale only — for normals (good enough; no non-uniform inverse-transpose)
  return [m[0] * p[0] + m[4] * p[1] + m[8] * p[2],
          m[1] * p[0] + m[5] * p[1] + m[9] * p[2],
          m[2] * p[0] + m[6] * p[1] + m[10] * p[2]];
}

// Load a material's base colour, and — when it points at a texture — the decoded
// pixels so a vertex can be tinted by its UV (the low-poly palette convention).
function materialColour(gltf, matIdx) {
  const { json, dir } = gltf;
  const m = json.materials && json.materials[matIdx];
  const pbr = (m && m.pbrMetallicRoughness) || {};
  const factor = pbr.baseColorFactor || [0.75, 0.75, 0.75, 1];
  let tex = null;
  if (pbr.baseColorTexture && json.textures) {
    try {
      const t = json.textures[pbr.baseColorTexture.index];
      const img = json.images[t.source];
      if (img && img.uri && !img.uri.startsWith("data:") && /\.png$/i.test(img.uri))
        tex = decodePNG(fs.readFileSync(path.join(dir, decodeURIComponent(img.uri))));
      // JPG and embedded images are skipped — factor colour is used instead.
    } catch (_) { tex = null; }
  }
  return { factor, tex };
}

function importFile(file, opts) {
  const gltf = parseGLTF(file);
  const { json } = gltf;
  const pos = [], nrm = [], col = [], idx = [];

  const walk = (nodeIdx, parent) => {
    const node = json.nodes[nodeIdx];
    const world = mul(parent, nodeMatrix(node));
    if (node.mesh != null) {
      for (const prim of json.meshes[node.mesh].primitives) {
        if (prim.mode != null && prim.mode !== 4) continue;   // triangles only
        const P = accessor(gltf, prim.attributes.POSITION);
        const N = prim.attributes.NORMAL != null ? accessor(gltf, prim.attributes.NORMAL) : null;
        const UV = prim.attributes.TEXCOORD_0 != null ? accessor(gltf, prim.attributes.TEXCOORD_0) : null;
        const { factor, tex } = materialColour(gltf, prim.material);
        const base = pos.length / 3;
        for (let i = 0; i < P.count; i++) {
          const wp = xform(world, [P.data[i * 3], P.data[i * 3 + 1], P.data[i * 3 + 2]]);
          pos.push(wp[0], wp[1], wp[2]);
          if (N) { const wn = xformDir(world, [N.data[i * 3], N.data[i * 3 + 1], N.data[i * 3 + 2]]);
            const l = Math.hypot(wn[0], wn[1], wn[2]) || 1; nrm.push(wn[0] / l, wn[1] / l, wn[2] / l); }
          else nrm.push(0, 1, 0);
          if (tex && UV) {
            // Nearest-sample the palette; low-poly UVs point at solid regions so
            // nearest is exact and avoids bleeding between palette cells.
            const u = UV.data[i * 2] - Math.floor(UV.data[i * 2]);
            const v = UV.data[i * 2 + 1] - Math.floor(UV.data[i * 2 + 1]);
            const px = Math.min(tex.w - 1, Math.floor(u * tex.w));
            const py = Math.min(tex.h - 1, Math.floor(v * tex.h));
            const o = (py * tex.w + px) * 4;
            col.push(tex.rgba[o] / 255 * factor[0], tex.rgba[o + 1] / 255 * factor[1], tex.rgba[o + 2] / 255 * factor[2]);
          } else col.push(factor[0], factor[1], factor[2]);
        }
        const I = accessor(gltf, prim.indices);
        for (let i = 0; i < I.count; i++) idx.push(base + I.data[i]);
      }
    }
    for (const c of node.children || []) walk(c, world);
  };
  const scene = json.scenes[json.scene || 0];
  for (const n of scene.nodes) walk(n, [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

  if (!pos.length || !idx.length) throw new Error("no triangle geometry");

  // Normalise: centre on the ground footprint (x/z centred, y min at 0), then
  // scale so the model is --height metres tall. Pack authors use every unit
  // convention going, so an un-normalised import lands the wrong size or buried.
  let mnx = 1e9, mny = 1e9, mnz = 1e9, mxx = -1e9, mxy = -1e9, mxz = -1e9;
  for (let i = 0; i < pos.length; i += 3) {
    mnx = Math.min(mnx, pos[i]); mxx = Math.max(mxx, pos[i]);
    mny = Math.min(mny, pos[i + 1]); mxy = Math.max(mxy, pos[i + 1]);
    mnz = Math.min(mnz, pos[i + 2]); mxz = Math.max(mxz, pos[i + 2]);
  }
  const cx = (mnx + mxx) / 2, cz = (mnz + mxz) / 2;
  const rawH = Math.max(1e-4, mxy - mny);
  const s = opts.height ? opts.height / rawH : 1;
  for (let i = 0; i < pos.length; i += 3) {
    pos[i] = (pos[i] - cx) * s; pos[i + 1] = (pos[i + 1] - mny) * s; pos[i + 2] = (pos[i + 2] - cz) * s;
  }
  return { pos, nrm, col, idx,
           sizeM: [+((mxx - mnx) * s).toFixed(2), +(rawH * s).toFixed(2), +((mxz - mnz) * s).toFixed(2)] };
}

function writeAX26(mesh, matId) {
  const nv = mesh.pos.length / 3, ni = mesh.idx.length;
  const buf = Buffer.alloc(20 + nv * 36 + nv * 4 + ni * 4);
  buf.write("AX26", 0, "ascii");
  buf.writeUInt32LE(1, 4); buf.writeUInt32LE(nv, 8); buf.writeUInt32LE(ni, 12); buf.writeUInt32LE(0, 16);
  let o = 20;
  Buffer.from(Float32Array.from(mesh.pos).buffer).copy(buf, o); o += nv * 12;
  Buffer.from(Float32Array.from(mesh.nrm).buffer).copy(buf, o); o += nv * 12;
  Buffer.from(Float32Array.from(mesh.col).buffer).copy(buf, o); o += nv * 12;
  Buffer.from(new Float32Array(nv).fill(matId).buffer).copy(buf, o); o += nv * 4;
  Buffer.from(Uint32Array.from(mesh.idx).buffer).copy(buf, o);
  return buf;
}

function walkDir(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walkDir(p, out);
    else if (/\.(glb|gltf)$/i.test(e.name)) out.push(p);
  }
  return out;
}

const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };

function main() {
  const dir = process.argv[2];
  if (!dir || dir.startsWith("--")) {
    console.error("usage: node tools/gen/import-models.mjs <dir> [--mat CONCRETE] [--height 12] [--prefix q_] [--max-verts 40000]");
    process.exit(1);
  }
  const matName = (arg("--mat", "CONCRETE")).toUpperCase();
  if (!(matName in MAT)) { console.error(`--mat must be one of ${Object.keys(MAT)}`); process.exit(1); }
  const height = parseFloat(arg("--height", "0")) || 0;
  const prefix = arg("--prefix", "");
  const maxVerts = parseInt(arg("--max-verts", "40000"), 10);

  const files = walkDir(path.resolve(dir));
  if (!files.length) { console.error(`no .glb/.gltf under ${dir}`); process.exit(1); }
  console.log(`found ${files.length} model file(s)`);

  fs.mkdirSync(path.join(PACK, "models"), { recursive: true });
  const manFile = path.join(PACK, "manifest.json");
  const man = fs.existsSync(manFile) ? JSON.parse(fs.readFileSync(manFile, "utf8"))
                                     : { version: 1, materials: null, models: {}, env: {}, credits: [] };
  man.models = man.models || {};

  const rows = [];
  for (const f of files) {
    const id = prefix + path.basename(f).replace(/\.(glb|gltf)$/i, "").replace(/[^a-z0-9_-]/gi, "_").toLowerCase();
    try {
      const mesh = importFile(f, { height });
      const nv = mesh.pos.length / 3;
      if (nv > maxVerts) { rows.push({ id, verts: nv, skipped: `over --max-verts ${maxVerts}` }); continue; }
      const buf = writeAX26(mesh, MAT[matName]);
      const rel = path.join("models", `${id}.bin`).split(path.sep).join("/");
      fs.writeFileSync(path.join(PACK, rel), buf);
      man.models[id] = { file: rel, verts: nv, tris: mesh.idx.length / 3, mat: matName,
        sizeM: mesh.sizeM, source: arg("--source", "quaternius (CC0)"),
        licence: "CC0", author: arg("--author", "Quaternius"),
        md5: crypto.createHash("md5").update(buf).digest("hex") };
      rows.push({ id, verts: nv, tris: mesh.idx.length / 3, sizeM: mesh.sizeM.join("x"),
        placed20x: nv * 20, verdict: nv * 20 > 300000 ? "TOO HEAVY" : nv * 20 > 80000 ? "heavy" : "fine" });
    } catch (e) { rows.push({ id, skipped: e.message }); }
  }
  fs.writeFileSync(manFile, JSON.stringify(man, null, 2) + "\n");
  console.table(rows);
  const ok = rows.filter((r) => !r.skipped).length;
  console.log(`imported ${ok}/${files.length} -> assets/pack/models/`);
}

main();
