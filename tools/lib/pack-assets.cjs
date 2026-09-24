"use strict";
// pack-assets.cjs — the baked asset pack, readable from node.
// @doc Node loader for assets/pack: `parseModel` (mirror of assets.js `_parseModel`) and `packAssets()`, the `Assets.modelSync` surface bakedModel() reads.
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

/** A node mirror of `_parseModel` in js/render/shared/assets.js — same magic,
 *  same two versions, same dequantisation. It is a mirror because that file is
 *  a browser IIFE whose parser is not exported; the first test below pins the
 *  mirror against the manifest's own vertex and triangle counts, so a format
 *  change cannot leave this decoding silently wrong. */
function parseModel(buf) {
  const dv = new DataView(buf);
  if (dv.byteLength < 20) return null;
  if (dv.getUint8(0) !== 0x41 || dv.getUint8(1) !== 0x58 ||
      dv.getUint8(2) !== 0x32 || dv.getUint8(3) !== 0x36) return null;   // "AX26"
  const ver = dv.getUint32(4, true);
  if (ver !== 1 && ver !== 2) return null;
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
  const pos = new Float32Array(buf, o, nv * 3); o += nv * 12;
  const qn = new Int16Array(buf, o, nv * 3);    o += nv * 6;
  const qc = new Uint8Array(buf, o, nv * 3);    o += nv * 3;
  const qm = new Uint8Array(buf, o, nv);        o += nv;
  const idx = new Uint16Array(buf, o, ni);
  const nrm = new Float32Array(nv * 3), col = new Float32Array(nv * 3), mat = new Float32Array(nv);
  for (let i = 0; i < nv * 3; i++) { nrm[i] = qn[i] / 32767; col[i] = qc[i] / 255; }
  for (let i = 0; i < nv; i++) mat[i] = qm[i];
  return { pos, nrm, col, mat, idx };
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

module.exports = { parseModel, packAssets, readModel, manifest, PACK };
