#!/usr/bin/env node
// build-geometry.cjs — extract REAL track geometry for the Rapier spike without
// a browser. Replicates the tools/verify-track.cjs VM pattern: stub GLX, run
// the manifest's TRACK_VM file list (which includes js/circuits/singapore.js
// via "@circuits") in a Node VM, call Tracks.build(def, {night:false}), and
// export ONLY the road mesh {pos,nrm,idx} plus the centreline arrays
// (px/py/pz, tangents, hw) as JSON.
//
// Usage: node spike/physics/build-geometry.cjs [trackId]   (default: singapore)
// Output: spike/physics/geometry-<id>.json

"use strict";

const fs   = require("fs");
const path = require("path");
const vm   = require("vm");

const ROOT = path.resolve(__dirname, "..", "..");
const MANIFEST = require(path.join(ROOT, "tools", "manifest.cjs"));

const trackId = process.argv[2] || "singapore";

// GLX stub — keeps the RAW geometry buffer so we can export it (verify-track's
// stub only keeps vertex counts). mobileTier:false = full-detail build.
const GLX = {
  createMesh:        (buf) => ({ raw: buf }),
  createChunkedMesh: (buf) => ({ raw: buf }),
  mobileTier: false,
};

const sandbox = {
  Math, Array, Float32Array, Float64Array, Uint8Array, Uint16Array, Uint32Array,
  Int8Array, Int16Array, Int32Array, Object, JSON, Set, Map, Number, String,
  Boolean, RegExp, Error, Date,
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
  // Top-level `const` → `var` so declarations become sandbox properties.
  const patched = src.replace(/^const\b/gm, "var");
  vm.runInContext(patched, ctx, { filename: relPath });
}

for (const entry of MANIFEST.TRACK_VM) {
  if (entry === "@circuits") {
    for (const f of fs.readdirSync(path.join(ROOT, MANIFEST.CIRCUITS_DIR))
                      .filter((f) => f.endsWith(".js")).sort()) {
      runFile(path.join(MANIFEST.CIRCUITS_DIR, f));
    }
  } else {
    runFile(entry);
  }
}

const Tracks = ctx.Tracks;
if (!Tracks || !Tracks.LIST) throw new Error("Tracks.LIST not defined after VM load");

const def = Tracks.LIST.find((d) => d.id === trackId);
if (!def) throw new Error(`track "${trackId}" not found: ${Tracks.LIST.map((d) => d.id).join(", ")}`);

console.log(`building ${trackId} ...`);
const t0 = Date.now();
const track = Tracks.build(def, { night: false });
console.log(`built in ${Date.now() - t0} ms`);

// Road only — props/terrain are huge and irrelevant to the collision spike.
const road = track.roadGeo;
if (!road || !road.pos || !road.pos.length) throw new Error("road geometry is empty");
if (road.pos.some((v) => !Number.isFinite(v))) throw new Error("road has non-finite positions");

const out = {
  id: trackId,
  total: track.total,          // lap length, metres
  n: track.n,                  // centreline node count
  road: {
    pos: Array.from(road.pos), // xyz triplets, metres, +Y up
    nrm: Array.from(road.nrm),
    idx: Array.from(road.idx),
  },
  centre: {
    px: Array.from(track.px), py: Array.from(track.py), pz: Array.from(track.pz),
    tx: Array.from(track.tx), ty: Array.from(track.ty), tz: Array.from(track.tz),
    hw: Array.from(track.hw), // half-width per node, metres
  },
};

const outPath = path.join(__dirname, `geometry-${trackId}.json`);
fs.writeFileSync(outPath, JSON.stringify(out));
const mb = (fs.statSync(outPath).size / 1e6).toFixed(1);
console.log(`OK ${trackId}: road ${road.pos.length / 3} verts, ${road.idx.length / 3} tris, ` +
            `${track.n} centreline nodes, ${track.total.toFixed(0)} m lap -> ${outPath} (${mb} MB)`);
