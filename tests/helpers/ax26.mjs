/* ax26.mjs — read a baked model .bin with the GAME'S OWN reader.
 *
 * Two suites used to carry their own hand-rolled copy of the AX26 layout, each
 * introduced with the comment "parse it exactly the way _parseModel does". They
 * did, until the format gained its packed v2 — at which point both would have
 * kept passing against bytes the game could no longer read, because nothing tied
 * the copies to the original.
 *
 * So this runs js/render/shared/assets.js in a vm with a fetch that serves one
 * file from disk, and returns what Assets.model() returns. If the real reader
 * cannot read the file, the test fails — which is the only claim these suites
 * are actually trying to make.
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const ASSETS_SRC = new URL("../../js/render/shared/assets.js", import.meta.url);

// The on-disk format version, straight from the header. Tests pin this so a
// silent fall back to the fat v1 layout (writeAX26 does that for meshes the
// packed form cannot hold) shows up as a failure rather than a bigger file.
export function ax26Version(binPath) {
  const b = fs.readFileSync(binPath);
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
  if (magic !== "AX26") throw new Error(`${binPath} is not an AX26 file (magic ${JSON.stringify(magic)})`);
  return { magic, version: dv.getUint32(4, true), verts: dv.getUint32(8, true), indices: dv.getUint32(12, true) };
}

// Decode with the shipped reader. Returns {pos,nrm,col,mat,idx} as the game
// sees them — Float32Arrays whichever layout the file is in — or null if the
// reader rejected the file.
export async function readAX26(binPath) {
  const dir = path.dirname(binPath);
  const base = path.basename(binPath);
  const manifest = { version: 1, models: { _t: { file: base } } };

  const ctx = {
    console,
    Float32Array, Int16Array, Uint8Array, Uint16Array, Uint32Array,
    DataView, ArrayBuffer, Math, Object, JSON, Promise, Error, Array, Number,
    fetch: async (url) => {
      const rel = String(url).replace(/^assets\/pack\//, "");
      if (rel === "manifest.json") return { ok: true, json: async () => manifest };
      const abs = path.join(dir, rel);
      if (!fs.existsSync(abs)) return { ok: false };
      const b = fs.readFileSync(abs);
      return { ok: true, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) };
    },
  };
  ctx.window = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(ASSETS_SRC, "utf8") + "\n;globalThis.__A = Assets;", ctx);
  return ctx.__A.model("_t");
}
