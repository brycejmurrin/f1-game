"use strict";
// pack-assets.cjs — the baked asset pack, readable from node.
// @doc Node loader for assets/pack: `parseModel` (mirrors assets.js) and `packAssets()` (the `Assets.modelSync` surface).
// Full description: Node loader for assets/pack: `parseModel` (mirror of assets.js `_parseModel`) and `packAssets()`, the `Assets.modelSync` surface bakedModel() reads.
// @skill asset-pack
//
// tools/lib/track-build-vm.cjs installs `packAssets()` as the VM's `Assets` by
// default, so every node audit (float, clip, coplanar, props-over-road) sees the
// 36 baked models a browser build stamps; without it `bakedModel()` returned
// false at its first line and the whole pack was invisible to them.
// tests/unit/baked-model-road-guard.test.mjs pins `parseModel` against the
// manifest's own vertex and triangle counts.
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");
const PACK = path.join(ROOT, "assets", "pack");
let MANIFEST = null;
const manifest = () => (MANIFEST ||= JSON.parse(fs.readFileSync(path.join(PACK, "manifest.json"), "utf8")));

// Must match TrackGeom.SWAY_FRAC (js/track/core/geom.js). v3 stores the wind
// weight as a trailing u8 stream and rebuilds mat = id + (sway/255)*SWAY_FRAC.
const SWAY_FRAC = 0.45;

/** A node mirror of `_parseModel` in js/render/shared/assets.js — same magic,
 *  same versions (v1/v2/v3), same dequantisation. It is a mirror because that
 *  file is a browser IIFE whose parser is not exported; the first test below
 *  pins the mirror against the manifest's own vertex and triangle counts, so a
 *  format change cannot leave this decoding silently wrong. */
function parseModel(buf) {
  const dv = new DataView(buf);
  if (dv.byteLength < 20) return null;
  if (dv.getUint8(0) !== 0x41 || dv.getUint8(1) !== 0x58 ||
      dv.getUint8(2) !== 0x32 || dv.getUint8(3) !== 0x36) return null;   // "AX26"
  const ver = dv.getUint32(4, true);
  if (ver !== 1 && ver !== 2 && ver !== 3) return null;
  const nv = dv.getUint32(8, true), ni = dv.getUint32(12, true);
  if (!nv || !ni) return null;
  let o = 20;
  if (ver === 1) {
    const pos = new Float32Array(buf, o, nv * 3); o += nv * 12;
    const nrm = new Float32Array(buf, o, nv * 3); o += nv * 12;
    const col = new Float32Array(buf, o, nv * 3); o += nv * 12;
    const mat = new Float32Array(buf, o, nv);     o += nv * 4;
    return { pos, nrm, col, mat, idx: new Uint32Array(buf, o, ni) };
  }
  // v2 and v3 share the packed body; v3 appends a u8 sway stream after indices.
  const need = o + nv * 12 + nv * 6 + nv * 3 + nv + ni * 2 + (ver === 3 ? nv : 0);
  if (dv.byteLength < need) return null;
  const pos = new Float32Array(buf, o, nv * 3); o += nv * 12;
  const qn = new Int16Array(buf, o, nv * 3);    o += nv * 6;
  const qc = new Uint8Array(buf, o, nv * 3);    o += nv * 3;
  const qm = new Uint8Array(buf, o, nv);        o += nv;
  const idx = new Uint16Array(buf, o, ni);      o += ni * 2;
  const nrm = new Float32Array(nv * 3), col = new Float32Array(nv * 3), mat = new Float32Array(nv);
  for (let i = 0; i < nv * 3; i++) { nrm[i] = qn[i] / 32767; col[i] = qc[i] / 255; }
  if (ver === 3) {
    const sway = new Uint8Array(buf, o, nv);
    for (let i = 0; i < nv; i++) mat[i] = qm[i] + (sway[i] / 255) * SWAY_FRAC;
  } else {
    for (let i = 0; i < nv; i++) mat[i] = qm[i];
  }
  return { pos, nrm, col, mat, idx };
}

/**
 * Write AX26 v3: packed v2 body + trailing u8 sway (w×255).
 * `mesh.mat` may carry FOLIAGE + w×SWAY_FRAC, or `mesh.sway` may supply w in [0,1]
 * beside integer material ids. Colours must be in [0,1]; nv ≤ 65535.
 */
function writeAX26v3(mesh) {
  const nv = mesh.pos.length / 3, ni = mesh.idx.length;
  if (nv > 65535) throw new Error(`writeAX26v3: ${nv} verts exceeds u16 index`);
  const nrm = mesh.nrm && mesh.nrm.length === nv * 3 ? mesh.nrm : new Float32Array(nv * 3);
  const col = mesh.col && mesh.col.length === nv * 3 ? mesh.col : new Float32Array(nv * 3).fill(0.7);
  const matArr = mesh.mat && mesh.mat.length === nv ? mesh.mat : new Float32Array(nv).fill(1);
  for (let i = 0; i < col.length; i++) {
    if (col[i] < 0 || col[i] > 1) throw new Error("writeAX26v3: colour out of [0,1]");
  }
  const head = Buffer.alloc(20);
  head.write("AX26", 0, "ascii");
  head.writeUInt32LE(3, 4);
  head.writeUInt32LE(nv, 8);
  head.writeUInt32LE(ni, 12);
  head.writeUInt32LE(0, 16);
  const qn = new Int16Array(nv * 3), qc = new Uint8Array(nv * 3);
  const qm = new Uint8Array(nv), sway = new Uint8Array(nv);
  for (let i = 0; i < nv * 3; i++) {
    const q = Math.round(nrm[i] * 32767);
    qn[i] = q < -32767 ? -32767 : q > 32767 ? 32767 : q;
    qc[i] = Math.round(col[i] * 255);
  }
  for (let i = 0; i < nv; i++) {
    const m = matArr[i];
    const base = Math.floor(m + 1e-6);
    if (base < 0 || base > 255) throw new Error(`writeAX26v3: mat id ${base} out of byte`);
    qm[i] = base;
    let w;
    if (mesh.sway && mesh.sway.length === nv) w = mesh.sway[i];
    else w = (m - base) / SWAY_FRAC;
    if (!(w >= 0) || w > 1) w = w < 0 ? 0 : 1;
    sway[i] = Math.round(w * 255);
  }
  return Buffer.concat([
    head,
    Buffer.from(Float32Array.from(mesh.pos).buffer),
    Buffer.from(qn.buffer), Buffer.from(qc.buffer), Buffer.from(qm.buffer),
    Buffer.from(Uint16Array.from(mesh.idx).buffer),
    Buffer.from(sway.buffer),
  ]);
}

const readModel = (rec) => {
  const b = fs.readFileSync(path.join(PACK, rec.file));
  return parseModel(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
};

/** The `Assets` surface `bakedModel()` uses: `modelSync(id)` and nothing else. */
function packAssets() {
  const cache = {};
  return {
    modelSync(id) {
      if (id in cache) return cache[id];
      const rec = manifest().models && manifest().models[id];
      cache[id] = rec && rec.file ? readModel(rec) : null;
      return cache[id];
    },
  };
}

module.exports = { parseModel, writeAX26v3, packAssets, readModel, manifest, PACK, SWAY_FRAC };
