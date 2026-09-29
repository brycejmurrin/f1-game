/* elevation-smoothness.test.mjs — densified centreline grade must not invent
 * knife-edges the baker never shipped. surveyHeights once projected every 4 m
 * node onto the OSM path; a Catmull-Rom bow near a fold (Nürburgring s≈0.775)
 * skipped 7.6 m of path arc into one step and authored a 9.8% jolt on a
 * profile clamped at 5.5%. Monotonic arc mapping fixes that; this gate pins it.
 *
 * Cap is the baker's MAX_GRADE (0.055) plus a 0.005 allowance for Catmull-Rom
 * overshoot between the 64 samples — tighter than the 9.8% bug, never looser
 * than any prior assertion (there was none). Bridge ramps are excluded.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const manifest = require("../../tools/manifest.cjs");

const MAX_GRADE = 0.055;
const CR_SLOP = 0.005; // Catmull-Rom overshoot between 64-sample posts
// The fixed Nürburgring knife-edge was 12.8 /km; pin that window only.
const NURB_KNIFE_JERK = 3.0;

function buildTracks() {
  const GLX = {
    createMesh(buf) {
      return { verts: buf && buf.pos ? buf.pos.length / 3 : 0, idxCount: buf && buf.idx ? buf.idx.length : 0 };
    },
    createInstancedBatch() { return { verts: 0, instances: 0, idxCount: 0 }; },
    freeInstancedBatch() {},
  };
  const sandbox = {
    Math, Array, Float32Array, Float64Array, Uint16Array, Uint32Array, Object, JSON,
    isNaN, isFinite, parseInt, parseFloat, GLX,
    console: {
      log() {}, warn() {}, error() {}, info() {}, debug() {}, trace() {}, assert() {},
      group() {}, groupEnd() {}, table() {}, dir() {}, count() {}, time() {}, timeEnd() {},
    },
  };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  function runFile(rel) {
    vm.runInContext(
      fs.readFileSync(path.join(ROOT, rel), "utf8").replace(/^const\b/gm, "var"),
      ctx,
      { filename: path.join(ROOT, rel) },
    );
  }
  for (const entry of manifest.TRACK_VM) {
    if (entry === "@circuits") {
      for (const f of fs.readdirSync(path.join(ROOT, manifest.CIRCUITS_DIR))
        .filter((f) => f.endsWith(".js")).sort()) {
        runFile(path.join(manifest.CIRCUITS_DIR, f));
      }
      for (const f of manifest.LAZY_SCENERY) runFile(f);
    } else runFile(entry);
  }
  return ctx;
}

function onBridge(def, k, total, ds) {
  const bridges = def.bridges || [];
  if (!bridges.length) return false;
  const dress = def._sceneryShift || 0;
  for (const b of bridges) {
    const cs = ((b.s + dress) % 1) * total;
    let d = Math.abs(k * ds - cs);
    d = Math.min(d, total - d);
    if (d < b.halfM) return true;
  }
  return false;
}

describe("elevation smoothness (densified centreline)", () => {
  const ctx = buildTracks();
  const ids = Object.keys(ctx.CircuitElevations || {});

  for (const id of ids) {
    it(`${id}: densified grade ≤ bake cap (+CR slop)`, () => {
      const def = ctx.Tracks.LIST.find((d) => d.id === id);
      assert.ok(def, `missing def ${id}`);
      const track = ctx.Tracks.build(def);
      const { n, py, total } = track;
      const ds = total / n;
      let maxG = 0, atG = 0;
      for (let k = 0; k < n; k++) {
        if (onBridge(def, k, total, ds)) continue;
        const g = Math.abs(py[(k + 1) % n] - py[k]) / ds;
        if (g > maxG) { maxG = g; atG = k / n; }
      }
      assert.ok(maxG <= MAX_GRADE + CR_SLOP,
        `${id}: max grade ${(maxG * 100).toFixed(2)}% at s=${atG.toFixed(4)} exceeds ${(MAX_GRADE + CR_SLOP) * 100}%`);
      if (id === "nurburgring") {
        const relief = Math.max(...py) - Math.min(...py);
        assert.ok(relief >= 45, `nurburgring relief ${relief.toFixed(1)} m must stay ≥ 45 m`);
        let winMax = 0, winJerk = 0, prev = null;
        for (let k = Math.floor(0.77 * n); k <= Math.floor(0.80 * n); k++) {
          const g = (py[(k + 1) % n] - py[k]) / ds;
          const ag = Math.abs(g);
          if (ag > winMax) winMax = ag;
          if (prev != null) {
            const j = Math.abs(g - prev) / ds * 1000;
            if (j > winJerk) winJerk = j;
          }
          prev = g;
        }
        assert.ok(winMax <= MAX_GRADE + CR_SLOP,
          `nurburgring s≈0.77–0.80 max grade ${(winMax * 100).toFixed(2)}%`);
        assert.ok(winJerk <= NURB_KNIFE_JERK,
          `nurburgring s≈0.77–0.80 jerk ${winJerk.toFixed(2)}/km (was 12.8)`);
      }
    });
  }
});
