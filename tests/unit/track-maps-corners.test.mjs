// TrackMaps curated corners must carry real |curvature| in `v`.
//
// Regression: when CircuitMarkings turns were preferred over detectCorners,
// maps.js stamped v:0 on every apex. The track-detail TURNS list classifies
// on thresholds of v (menus.js → HAIRPIN/SLOW/MEDIUM/FAST), so every circuit
// with curated turns painted as all-FAST, and the select-screen "slowest"
// fact always named T1.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const MANIFEST = createRequire(import.meta.url)("../../tools/manifest.cjs");

function loadTrackMaps() {
  const sandbox = {
    Math, Array, Float32Array, Uint16Array, Uint32Array, Object, JSON, Map, Set,
    isNaN, isFinite, parseInt, parseFloat,
    console: { log() {}, warn() {}, error() {}, info() {}, debug() {} },
  };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  const runFile = (relPath) => {
    const src = fs.readFileSync(path.join(ROOT, relPath), "utf8")
      .replace(/^const\b/gm, "var");
    vm.runInContext(src, ctx, { filename: relPath });
  };
  for (const entry of MANIFEST.TRACK_VM) {
    if (entry === "@circuits") {
      for (const file of fs.readdirSync(path.join(ROOT, MANIFEST.CIRCUITS_DIR))
        .filter((name) => name.endsWith(".js")).sort()) {
        runFile(path.join(MANIFEST.CIRCUITS_DIR, file));
      }
    } else {
      runFile(entry);
    }
  }
  runFile("js/track/maps.js");
  return ctx;
}

function classify(v) {
  return v > 0.025 ? "HAIRPIN" : v > 0.013 ? "SLOW" : v > 0.008 ? "MEDIUM" : "FAST";
}

test("curated CircuitMarkings turns carry non-zero curvature for classification", () => {
  const { Tracks, TrackMaps } = loadTrackMaps();
  // Monza has curated turns and a clear mix of fast sweeps vs chicanes.
  const monza = Tracks.LIST.find((t) => t.id === "monza");
  assert.ok(monza && monza.turns && monza.turns.length, "monza must ship curated turns");
  const crns = TrackMaps.corners(monza);
  assert.equal(crns.length, monza.turns.length);
  assert.ok(crns.every((c) => typeof c.v === "number" && Number.isFinite(c.v)),
    "every corner needs a finite v");
  assert.ok(crns.some((c) => c.v > 0), "at least one curated apex must have |curvature| > 0");
  const labels = new Set(crns.map((c) => classify(c.v)));
  assert.ok(labels.size >= 2,
    "Monza turn classes must vary; got only [" + [...labels].join(", ") + "]");
});
