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
// Per-circuit bake overrides (tools/gen/bake-elevation.mjs GRADE_OVERRIDE): cota's
// T1 climb is real (raw SRTM +25 m in ~330 m, published 30+ m) and the global
// 5.5 % cap flattened it to 10.5 m (#2208).
// The Red Bull Ring operator publishes a 12% maximum uphill gradient.
// Aston Martin published a 16% peak descent for the 2021 Portuguese GP.
// Fuji Speedway publishes 10.05% downhill and 8.88% uphill.
// EA 1 m lidar measures up to 8.38% over a 20 m window on the Donington descent.
// Dijon operator gives a 14% maximum on the Parabolique climb.
// Mosport's 1 m NRCan surface reaches a 13.7% descent.
const GRADE_CAP = { cota: 0.08, redbull: 0.12, portimao: 0.16, fuji: 0.1005, donington: 0.084, dijon: 0.14, mosport: 0.137 };
const capOf = (id) => GRADE_CAP[id] ?? MAX_GRADE;
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
      for (const id of manifest.CIRCUITS) runFile(manifest.circuitPath(id));
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

  it("Portimão T11 to T12 descends by the qualifying laps' measured height", () => {
    const def = ctx.Tracks.LIST.find((d) => d.id === "portimao");
    const track = ctx.Tracks.buildCenterline(def, { line: false });
    const heightAtTurn = (i) => track.py[Math.round(def.turns[i - 1] * track.n)];
    assert.ok(Math.abs(heightAtTurn(11) - heightAtTurn(12) - 14.65) < 0.6);
  });

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
        const grade = (py[(k + 1) % n] - py[k]) / ds;
        if (id === "brands_hatch" && k * ds < 790) {
          // Environment Agency lidar on the opening sector, sampled every 4 m.
          assert.ok(grade >= -0.195 && grade <= 0.125, `Brands Hatch grade ${grade} at ${k * ds} m`);
          continue;
        }
        const g = Math.abs(grade);
        // The reconstructed St-Jovite Hump adds the documented ~12 ft cut to
        // the 2018 lidar crest. Keep its steeper envelope local to that ridge.
        if (id === "mont_tremblant" && k / n >= 0.54 && k / n <= 0.65) {
          const signed = (py[(k + 1) % n] - py[k]) / ds;
          assert.ok(signed >= -0.08 && signed <= 0.10, `Hump grade ${signed}`);
          continue;
        }
        if (g > maxG) { maxG = g; atG = k / n; }
      }
      assert.ok(maxG <= capOf(id) + CR_SLOP,
        `${id}: max grade ${(maxG * 100).toFixed(2)}% at s=${atG.toFixed(4)} exceeds ${(capOf(id) + CR_SLOP) * 100}%`);
      if (id === "hungaroring") {
        // Both registered qualifying traces drop 14.6 m then climb 8.3–8.4 m.
        // The grade-capped fit recovers 12.55 m of the T2–T3 descent.
        const height = (frac) => py[Math.round(frac * n) % n];
        const [t2, t3, t4] = def.turns.slice(1, 4).map(height);
        assert.ok(Math.abs(t2 - t3 - 14.6) < 2.5, "T2–T3 descent");
        assert.ok(Math.abs(t4 - t3 - 8.4) < 1, "T3–T4 climb");
      }
      if (id === "dijon") {
        // Independent IGN RGE ALTI stations on the Parabolique exit gain 22.65 m.
        const heightAt = f => py[Math.round(n * f)];
        assert.ok(Math.abs(heightAt(0.6028) - heightAt(0.5274) - 22.65) < 1.5);
        // Nine modern sections at Pouas have positive right-minus-left rise.
        const distance = track.total * 0.853;
        const rise = ctx.Tracks.banking(track, distance, 4, {}).dy - ctx.Tracks.banking(track, distance, -4, {}).dy;
        assert.ok(rise > 0.6 && rise < 0.9, "Pouas crossfall across 8 m");
      }
      if (id === "mosport") {
        const h = f => py[Math.round(f * n)];
        // NRCan 1 m lidar on the two descents into Clayton and Moss.
        assert.ok(Math.abs(h(0.1495) - h(0.18) - 12.77) < 0.7, "Clayton drop");
        assert.ok(Math.abs(h(0.3856) - h(0.442) - 15.07) < 0.7, "Moss approach drop");
      }
      if (id === "brands_hatch") {
        const height = (station) => {
          const k = Math.floor(station / ds);
          return py[k] + (py[k + 1] - py[k]) * (station / ds - k);
        };
        const crest = height(138), trough = height(365), druids = height(598);
        assert.ok(Math.abs(crest - trough - 17.51) < 0.5, "Paddock Hill drop");
        assert.ok(Math.abs(druids - trough - 20.57) < 0.5, "Druids climb");
        // Independent stations between the bake postings, relative to the approach crest.
        const lidar = [-0.28, -1.82, -7.27, -16.34, -15.88, -9.26, -2.49, 2.71, 1.08];
        for (const [i, measured] of lidar.entries()) {
          const station = 154 + 61 * i;
          assert.ok(Math.abs(height(station) - crest - measured) < 1.5,
            `Brands Hatch elevation at ${station} m`);
        }
      }
      if (id === "magny_cours") {
        // Independent IGN queries at Adelaide and Château d’Eau rise 15.58
        // and 18.92 m above the timing line on the nearest OSM trace.
        for (const [fraction, rise] of [[0.413, 15.58], [0.817, 18.92]]) {
          const actual = py[Math.round(fraction * n)] - py[0];
          assert.ok(Math.abs(actual - rise) < 0.5, `Magny-Cours rise at ${fraction}: ${actual}`);
        }
      }
      if (id === "jerez") {
        // Spain IGN MDT05 gives 48 and 41 m at the Michelin and Turn 4 apices.
        const height = (turn) => py[Math.round(def.turns[turn - 1] * n)];
        assert.ok(Math.abs((height(2) - height(4)) - 7) < 1, "Michelin to Turn 4 descent");
      }
      if (id === "fuji") {
        // GSI laser DTM at the hairpin exit and on the approach to Dunlop.
        const measuredDrop = 18.2;
        const drop = py[Math.round(n * 585 / 1131)] - py[Math.round(n * 765 / 1131)];
        assert.ok(Math.abs(drop - measuredDrop) < 0.8, `Fuji descent to Dunlop: ${drop} m`);
        // Across an 8 m section at the hairpin, GSI measures +0.50 m.
        const station = def.turns[5] * total;  // T6, the ADVAN hairpin (#5652 WEC numbering)
        const right = ctx.Tracks.banking(track, station, 4, {}).dy;
        const left = ctx.Tracks.banking(track, station, -4, {}).dy;
        assert.ok(Math.abs(right - left - 0.50) < 0.12, "Fuji hairpin crossfall");
      }
      if (id === "donington") {
        // EA 1 m DTM, centreline rise and right-minus-left crossfalls over 8 m.
        const height = f => py[Math.round(f * n)];
        assert.ok(Math.abs(height(0.44) - height(0.2759) - 28.59) < 0.6, "Old Hairpin to McLeans");
        for (const [fraction, measured] of [[0.2149, 0.338], [0.44, -0.396]]) {
          const distance = fraction * total;
          const rise = ctx.Tracks.banking(track, distance, 4, {}).dy - ctx.Tracks.banking(track, distance, -4, {}).dy;
          assert.ok(Math.abs(rise - measured) < 0.04, `Donington crossfall at ${fraction}`);
        }
      }
      if (id === "buddh") {
        const height = (frac) => py[Math.round(frac * n) % n];
        const rise = height(def.turns[2]) - height(def.turns[0]);
        assert.ok(Math.abs(rise - 14) < 0.5, `Buddh T1–T3 climbs ${rise.toFixed(2)} m`);
        const hollow = height((def.turns[2] + def.turns[3]) / 2);
        assert.ok(hollow < height(def.turns[2]) && hollow < height(def.turns[3]),
          "the back straight descends from T3 and rises again to T4");
      }
      if (id === "cota") {
        // The T1 hill: crest within the first tenth of the lap stands >= 25 m over
        // the lap's low point (was 10.5 m + 11.7 m low = 22 m relief, crest ~10 m).
        const crest = Math.max(...Array.from({ length: Math.floor(0.1 * n) }, (_, k) => py[k]));
        const low = Math.min(...py);
        assert.ok(crest - low >= 25, `cota T1 crest ${(crest - low).toFixed(1)} m over the lap low must be >= 25 m`);
      }
      if (id === "redbull") {
        // Verstappen and Norris reached T3 about 62 m above the lap low in 2024 qualifying.
        const t3Rise = py[Math.round(def.turns[2] * n)] - Math.min(...py);
        assert.ok(Math.abs(t3Rise - 62) < 2, `Red Bull Ring T3 rises ${t3Rise.toFixed(1)} m`);
      }
      if (id === "mont_tremblant") {
        // NRCan lidar gives the Hump a rise of 12.7 m and a 5.0 m descent
        // to the next straight. Northlander (Oct 2005) records a ~3.6 m cut.
        const height = (f) => py[Math.round(f * n)];
        const crest = height(0.595);
        assert.ok(Math.abs(crest - height(0.50) - 16.3) < 0.8, "Hump approach");
        assert.ok(Math.abs(crest - height(0.676) - 8.6) < 0.8, "Hump descent");
      }
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
