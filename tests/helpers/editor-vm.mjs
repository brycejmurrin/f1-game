// editor-vm — the custom track designer's modules over the REAL track engine:
// verify-track's TRACK_VM context (every circuit, tracks.js, TrackDef) plus a
// stub GameStore, then hash32 → track-themes → custom-tracks → the LAZY_EDITOR
// files, each `const` → `var` so the globals land on the sandbox. One helper so
// the geometry, codec, fleet and fuzz tests boot the same way.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const { buildContext } = require(path.join(ROOT, "tools/track/verify-track.cjs"));
export const read = (f) => fs.readFileSync(path.join(ROOT, f), "utf8");
export const plain = (o) => JSON.parse(JSON.stringify(o));

export const BOOT_FILES = ["js/core/hash32.js", "js/editor/track-themes.js", "js/editor/custom-tracks.js"];
export const EDITOR_FILES = ["js/editor/shape.js", "js/editor/stamps.js", "js/editor/randomise.js", "js/editor/validate.js", "js/editor/insight.js", "js/editor/codec.js"];

/** The engine + registry + editor over a store seeded with `stored` (short keys). */
export function bootEditor(stored = {}) {
  const Tracks = buildContext(undefined, { quiet: true });
  const ctx = Tracks._vmContext;
  const data = Object.assign({}, stored);
  const store = {
    get: (k, d) => (k in data ? JSON.parse(JSON.stringify(data[k])) : d),
    set: (k, v) => { data[k] = v; },
    write: (k, v) => { data[k] = v; return { ok: true, durable: true }; },
    rawDel: (k) => { delete data[k]; },
  };
  ctx.GameStore = { store };
  // The codec's byte/stream globals, from this Node.
  for (const g of ["TextEncoder", "TextDecoder", "CompressionStream", "DecompressionStream", "Response", "Uint8Array", "Map", "Set"]) if (typeof globalThis[g] !== "undefined") ctx[g] = globalThis[g];
  for (const f of BOOT_FILES.concat(EDITOR_FILES)) vm.runInContext(read(f).replace(/^const\b/gm, "var"), ctx, { filename: f });
  // TrackMaps (FULL) is what bakeTurns prefers; it needs AeroZones/Log only at call time.
  vm.runInContext(read("js/ui/track-maps.js").replace(/^const\b/gm, "var"), ctx, { filename: "js/ui/track-maps.js" });
  return { Tracks, ctx, data, S: ctx.TrackShape, ST: ctx.TrackStamps, TR: ctx.TrackRandom, V: ctx.TrackValidate, CD: ctx.TrackCodec, C: ctx.CustomTracks, T: ctx.TrackThemes };
}

/** An a×b ellipse of n control points on the 0.25 m lattice (≈ 4.1 km at 800×500). */
export function ellipse(n = 36, a = 800, b = 500) {
  const pts = [], q = (v) => Math.round(v * 4) / 4;
  for (let i = 0; i < n; i++) { const t = (i / n) * Math.PI * 2; pts.push([q(a * Math.cos(t)), q(b * Math.sin(t))]); }
  return pts;
}
export const design = (extra) => Object.assign({ name: "Test Loop", seed: 7, theme: "parkland", baseHW: 7, pts: ellipse() }, extra);
