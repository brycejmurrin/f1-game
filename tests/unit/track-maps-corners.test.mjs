// TrackMaps turn classes: radius + heading-sweep, not raw peak |k|.
//
// Regressions this guards:
//   1. curated apexes stamped v:0 → every turn read FAST
//   2. |k| thresholds alone → every chicane read HAIRPIN (Rettifilo, Bus Stop)
// Real hairpins need tight R AND a large heading change; fast sweeps sit at
// R ≳ 85 m. Monza's curated list must include Curva Grande (FIA T3).

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

test("classifyCorner: hairpin needs angle; chicanes stay SLOW; sweeps FAST", () => {
  const { TrackMaps } = loadTrackMaps();
  const C = TrackMaps.classifyCorner;
  assert.equal(C(12, 122), "HAIRPIN"); // La Source-like
  assert.equal(C(10, 194), "HAIRPIN"); // Loews-like
  assert.equal(C(33, 168), "SLOW");    // Pouhon-like — large angle, not a hairpin
  assert.equal(C(15, 100), "SLOW");    // Rettifilo-like chicane
  assert.equal(C(16, 86), "SLOW");     // Bus Stop-like
  assert.equal(C(174, 20), "FAST");    // Curva Grande-like
  assert.equal(C(109, 45), "FAST");    // Eau Rouge-like
  assert.equal(C(58, 95), "MEDIUM");   // Lesmo-like
});

test("Monza curated turns include Curva Grande and varied classes", () => {
  const { Tracks, TrackMaps } = loadTrackMaps();
  const monza = Tracks.LIST.find((t) => t.id === "monza");
  assert.equal(monza.turns.length, 11);
  // Curva Grande ~0.129 must be present (was missing; T3 was Roggia).
  assert.ok(monza.turns.some((f) => Math.abs(f - 0.1288) < 1e-4),
    "Curva Grande apex (~0.1288) missing from CircuitMarkings.monza.turns");
  const crns = TrackMaps.corners(monza);
  assert.equal(crns.length, 11);
  assert.ok(crns.every((c) => c.cls && c.r > 0 && Number.isFinite(c.v)));
  const labels = crns.map((c) => c.cls);
  assert.equal(crns[0].cls, "SLOW", "T1 Rettifilo must be SLOW, not HAIRPIN");
  assert.equal(crns[1].cls, "SLOW", "T2 Rettifilo must be SLOW, not HAIRPIN");
  assert.equal(crns[2].cls, "FAST", "T3 Curva Grande must be FAST");
  assert.ok(labels.includes("MEDIUM"), "Lesmo/Parabolica band should appear");
  assert.ok(new Set(labels).size >= 3, "Monza must show ≥3 classes, got " + labels.join(","));
});

test("Spa La Source is HAIRPIN; Eau Rouge complex includes FAST", () => {
  const { Tracks, TrackMaps } = loadTrackMaps();
  const spa = Tracks.LIST.find((t) => t.id === "spa");
  const crns = TrackMaps.corners(spa);
  assert.equal(crns[0].cls, "HAIRPIN", "T1 La Source");
  assert.ok(crns.slice(1, 4).some((c) => c.cls === "FAST"),
    "Eau Rouge / Raidillon should include a FAST class: " +
    crns.slice(0, 4).map((c) => "T" + c.n + "=" + c.cls).join(" "));
});
