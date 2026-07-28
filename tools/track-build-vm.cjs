// track-build-vm.cjs — run the REAL Apex 26 track build headless, in a Node VM.
//
// Extracted from float-audit.cjs so the float audit and the clip audit share one
// harness instead of drifting apart. It reuses the verify-track.cjs trick — load
// every engine source into a sandbox with GLX stubbed — but KEEPS the vertex
// buffers, and wraps every TrackGeom emitter so each primitive is recorded with
// its bounds, material, emission order and vertex range.
//
// No browser, no GPU, ~2 s per circuit.

"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");

// Engine load order comes from tools/manifest.cjs (TRACK_VM) — the same source
// of truth the load-order test asserts index.html against, so a file added to
// the engine cannot silently go missing here. "@circuits" expands to every
// circuit definition; js/track/tracks.js runs LAST because it destructures
// TrackGeom at load time and the emitter wrappers must already be installed.
const MANIFEST = require("./manifest.cjs");
const TRACKS_ENTRY = "js/track/tracks.js";
const PRELUDE = MANIFEST.TRACK_VM.filter((e) => e !== "@circuits" && e !== TRACKS_ENTRY);

// Emitters that name a primitive but never the model that wanted one. The
// reporters walk outward past these to the first frame that names a real
// builder. `seat.*` and the LandmarkKit box/prism/cylinder adapters are here
// for the same reason the raw emitters are: they are generic plumbing, so a
// stack that stops at one of them attributes a defect to nothing.
const RAW_FRAME =
  /^(addBox|addCyl|addCone|addFrustum|addPrism|addPyramid|addMountain|addTube|addSphere|emit|box|prism|cylinder|seat\.[a-z]+)\b/;

function buildContext(opts) {
  opts = opts || {};
  const stackFor = opts.stackFor || null;
  const captures = [];
  // Buffers that actually reached a GPU mesh. TrackModels.modelGroup stages an
  // emission into a scratch buffer and can REJECT it afterwards (vertex budget,
  // invalid geometry), but the emitter wrappers below have already recorded its
  // primitives. Without reconciling against this set an audit can report defects
  // in geometry that never ships.
  const liveBufs = new Set();
  const capture = (buf) => {
    const verts = buf && buf.pos ? buf.pos.length / 3 : 0;
    const rec = { verts, pos: buf && buf.pos ? buf.pos : [],
                  nrm: buf && buf.nrm ? buf.nrm : null,
                  idx: buf && buf.idx ? buf.idx : null };
    captures.push(rec);
    if (buf) liveBufs.add(buf);
    return { verts, idxCount: buf && buf.idx ? buf.idx.length : 0, __cap: rec };
  };
  const GLX = {
    createMesh: capture,
    createChunkedMesh: (buf) => capture(buf),
  };

  const sandbox = {
    Math, Array, Float32Array, Uint16Array, Uint32Array, Object, JSON,
    isNaN, isFinite, parseInt, parseFloat,
    GLX,
    console: { log: () => {}, warn: () => {}, error: () => {}, info: () => {},
               debug: () => {}, trace: () => {}, assert: () => {}, group: () => {},
               groupEnd: () => {}, table: () => {}, dir: () => {}, count: () => {},
               time: () => {}, timeEnd: () => {} },
  };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);

  function runFile(relPath) {
    const src = fs.readFileSync(path.join(ROOT, relPath), "utf8");
    vm.runInContext(src.replace(/^const\b/gm, "var"), ctx, { filename: relPath });
  }

  for (const f of PRELUDE) runFile(f);

  // Instrument the geometry emitters. Emitters called from INSIDE track-geom.js
  // (addCyl -> emit) use module-scope references and are untouched, so nothing
  // is double-counted.
  const prims = [];
  let q = 0;                      // monotonic emission sequence
  const TG = ctx.TrackGeom;
  for (const name of Object.keys(TG)) {
    if (typeof TG[name] !== "function") continue;
    const orig = TG[name];
    TG[name] = function (out) {
      if (!out || !out.pos || typeof out.pos.length !== "number")
        return orig.apply(this, arguments);
      const start = out.pos.length;
      const r = orig.apply(this, arguments);
      const end = out.pos.length;
      if (end > start) {
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity,
            minZ = Infinity, maxZ = -Infinity;
        for (let i = start; i < end; i += 3) {
          const x = out.pos[i], y = out.pos[i + 1], z = out.pos[i + 2];
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
          if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
        }
        // `q` is the model-identity proxy: primitives emitted back-to-back are
        // one assembly (a bush's lobes, a tree's canopy tiers, a building's
        // sections, one along() step's members). Cheaper and more reliable than
        // call-site tagging, which cannot tell two adjacent treelines apart.
        // `buf` + [s,e) let a narrowphase read the primitive's REAL vertices
        // rather than re-deriving a shape from constructor arguments.
        const rec = { name, minX, maxX, minY, maxY, minZ, maxZ,
                      mat: out._mat || 0, q: q++, s: start, e: end, buf: out };
        if (stackFor) {
          const key = `${minX.toFixed(1)}|${minY.toFixed(1)}|${minZ.toFixed(1)}`;
          if (stackFor.has(key)) {
            // Keep a DEEP slice — tracks.js wraps every emitter in a culling
            // shim, so the innermost frames are always that shim.
            const st = new Error().stack.split("\n").slice(2, 14)
              .map((l) => l.trim().replace(/^at\s+/, ""))
              .filter((l) => !/track-geom/.test(l));
            rec.stack = st.slice(0, 6).join("  <-  ");
          }
        }
        prims.push(rec);
      }
      return r;
    };
  }
  ctx.__prims = prims;
  for (const f of fs.readdirSync(path.join(ROOT, MANIFEST.CIRCUITS_DIR))
                    .filter((f) => f.endsWith(".js")).sort()) {
    runFile(path.join(MANIFEST.CIRCUITS_DIR, f));
  }
  runFile(TRACKS_ENTRY);

  if (!ctx.Tracks || !ctx.Tracks.LIST) throw new Error("Tracks.LIST missing");
  return {
    Tracks: ctx.Tracks, TrackSurface: ctx.TrackSurface, TrackGeom: ctx.TrackGeom,
    prims, liveBufs,
    // Emission-order marker, so a caller reusing one context across circuits can
    // slice out just the primitives a given build produced.
    mark: () => prims.length,
  };
}

// Drop primitives whose buffer never reached a captured mesh — see liveBufs.
function shipped(prims, liveBufs) {
  if (!liveBufs || !liveBufs.size) return prims;
  return prims.filter((p) => liveBufs.has(p.buf));
}

// Resolve a captured stack to the call sites that actually name a builder.
// Two frames, not one: the species helper (tree/pine/…) is never the useful
// answer alone — what matters is who ASKED for a tree there.
function siteOf(stack) {
  const fr = (stack || "?").split("  <-  ").filter((f) => !RAW_FRAME.test(f));
  return (fr.length ? fr.slice(0, 2) : ["?"]).join(" < ")
    .replace(/Object\./g, "").replace(/ \(.*?\)/g, "");
}

// Position key used to match a primitive across the two deterministic passes.
const primKey = (p) =>
  `${p.minX.toFixed(1)}|${p.minY.toFixed(1)}|${p.minZ.toFixed(1)}`;

module.exports = { buildContext, shipped, siteOf, primKey, ROOT, RAW_FRAME };
