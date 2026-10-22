/* tracks-preview-cache.test.mjs — {line:false} buildCenterline is cached by
 * circuit id so race-select / TrackMaps.compute do not rebuild on every pass.
 *
 * Run: node --test tests/unit/tracks-preview-cache.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MANIFEST = createRequire(import.meta.url)("../../tools/manifest.cjs");

function loadTracks() {
  const sandbox = {
    Math, Array, Float32Array, Float64Array, Uint16Array, Uint32Array, Object, JSON, Map, Set,
    isNaN, isFinite, parseInt, parseFloat,
    console: { log() {}, warn() {}, error() {}, info() {}, debug() {} },
    Log: { info() {}, warn() {}, debug() {}, error() {}, enabled: () => false },
  };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  const runFile = (relPath) => {
    const src = fs.readFileSync(path.join(ROOT, relPath), "utf8").replace(/^const\b/gm, "var");
    vm.runInContext(src, ctx, { filename: absSrc(relPath) });
  };
  for (const entry of MANIFEST.TRACK_VM) {
    if (entry === "@circuits") {
      for (const id of MANIFEST.CIRCUITS) runFile(MANIFEST.circuitPath(id));
      for (const file of MANIFEST.LAZY_SCENERY) runFile(file);
    } else {
      runFile(entry);
    }
  }
  return ctx;
}

test("buildCenterline({line:false}) reuses typed arrays across calls", () => {
  const { Tracks } = loadTracks();
  const def = Tracks.LIST.find((t) => t && t.id === "monza");
  assert.ok(def, "monza must be in LIST");
  if (Tracks.forgetPreviewCenterline) Tracks.forgetPreviewCenterline("monza");
  const a = Tracks.buildCenterline(def, { line: false });
  const b = Tracks.buildCenterline(def, { line: false });
  assert.notEqual(a, b, "shallow clone so callers can null bankP safely");
  assert.equal(a.px, b.px, "typed arrays stay shared (the cache win)");
  assert.equal(a.line, null);
  assert.ok(a.map && a.map.length > 2);
});

test("forgetPreviewCenterline drops the cache entry", () => {
  const { Tracks } = loadTracks();
  const def = Tracks.LIST.find((t) => t && t.id === "monza");
  const a = Tracks.buildCenterline(def, { line: false });
  Tracks.forgetPreviewCenterline("monza");
  const b = Tracks.buildCenterline(def, { line: false });
  assert.notEqual(a.px, b.px, "after forget, a fresh centreline is built");
});

test("adoptPreviewCenterline primes the cache without rebuilding", () => {
  const { Tracks } = loadTracks();
  const def = Tracks.LIST.find((t) => t && t.id === "spa");
  assert.ok(def, "spa must be in LIST");
  Tracks.forgetPreviewCenterline("spa");
  const donor = Tracks.buildCenterline(def, { line: false });
  Tracks.forgetPreviewCenterline("spa");
  const stub = {
    total: donor.total, n: donor.n, map: donor.map, street: donor.street, line: null,
    px: donor.px, py: donor.py, pz: donor.pz, tx: donor.tx, ty: donor.ty, tz: donor.tz,
    rx: donor.rx, ry: donor.ry, rz: donor.rz, hw: donor.hw, bank: donor.bank, curv: donor.curv,
    bankP: donor.bankP, meshes: {},
  };
  assert.equal(Tracks.adoptPreviewCenterline(def, stub), true);
  const hit = Tracks.buildCenterline(def, { line: false });
  assert.equal(hit.px, stub.px, "adopted preview typed arrays are what buildCenterline returns");
  assert.equal(hit.total, stub.total);
});
