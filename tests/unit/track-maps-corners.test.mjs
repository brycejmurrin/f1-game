// TrackMaps turn classes: radius + heading-sweep, with relative spread.
//
// Regressions this guards:
//   1. curated apexes stamped v:0 → every turn read FAST
//   2. |k| thresholds alone → every chicane read HAIRPIN
//   3. absolute R<50 alone → Indy/Jacarepagua (and other short-radius packs)
//      painted every chip SLOW — assignCornerClasses tertile-spreads when one
//      class dominates.

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
    Math, Array, Float32Array, Float64Array, Uint16Array, Uint32Array, Object, JSON, Map, Set,
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
  assert.ok(monza.turns.some((f) => Math.abs(f - 0.1288) < 1e-4),
    "Curva Grande apex (~0.1288) missing from CircuitMarkings.monza.turns");
  const crns = TrackMaps.corners(monza);
  assert.equal(crns.length, 11);
  assert.ok(crns.every((c) => c.cls && c.r > 0 && Number.isFinite(c.v)));
  const labels = crns.map((c) => c.cls);
  assert.equal(crns[0].cls, "SLOW", "T1 Rettifilo must be SLOW, not HAIRPIN");
  assert.equal(crns[1].cls, "SLOW", "T2 Rettifilo must be SLOW, not HAIRPIN");
  assert.equal(crns[2].cls, "FAST", "T3 Curva Grande must be FAST");
  assert.equal(crns[5].cls, "MEDIUM", "T6 Lesmo should be MEDIUM");
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

test("no circuit with ≥6 curated turns collapses to a single class", () => {
  const { Tracks, TrackMaps } = loadTrackMaps();
  const collapsed = [];
  for (const t of Tracks.LIST) {
    if (!t.turns || t.turns.length < 6) continue;
    const crns = TrackMaps.corners(t);
    const kinds = new Set(crns.map((c) => c.cls));
    if (kinds.size < 2) collapsed.push(t.id + ":" + [...kinds].join(","));
  }
  assert.deepEqual(collapsed, [],
    "single-class circuits (need assignCornerClasses spread):\n  " + collapsed.join("\n  "));
});

test("Indianapolis and Jacarepagua are no longer all-SLOW", () => {
  const { Tracks, TrackMaps } = loadTrackMaps();
  for (const id of ["indianapolis", "jacarepagua"]) {
    const t = Tracks.LIST.find((x) => x.id === id);
    const crns = TrackMaps.corners(t);
    const kinds = new Set(crns.map((c) => c.cls));
    assert.ok(kinds.size >= 2, id + " classes=" + [...kinds].join(","));
    assert.ok(!kinds.has("SLOW") || kinds.size >= 2);
  }
});

test("fitCanvas preserves circuit aspect inside a box (no stretch)", () => {
  const { Tracks, TrackMaps } = loadTrackMaps();
  const monza = Tracks.LIST.find((t) => t.id === "monza");
  const a = TrackMaps.aspect(monza);
  assert.ok(a >= 0.5 && a <= 2.5, "aspect clamped, got " + a);

  // Minimal canvas stand-in (node has no HTMLCanvasElement).
  const fake = { width: 0, height: 0, style: {} };
  const wide = TrackMaps.fitCanvas(fake, 400, 100, monza, true);
  assert.equal(wide.w, fake.width);
  assert.equal(wide.h, fake.height);
  assert.ok(Math.abs(wide.w / wide.h - a) < 0.05,
    "wide-box fit drifted: " + wide.w + "x" + wide.h + " aspect=" + (wide.w / wide.h));
  assert.ok(wide.h <= 100 && wide.w <= 400);
  assert.equal(fake.style.width, wide.w + "px");
  assert.equal(fake.style.height, wide.h + "px");
  // max-* stays UNPINNED: an inline max would replace the stylesheet caps
  // (#sel-preview-map's 50%, #track-detail-canvas's 100%) that are the
  // layout's defence when a plan is floored or stale — see fitCanvas.
  assert.equal(fake.style.maxWidth, "");
  assert.equal(fake.style.maxHeight, "");
  assert.equal(fake.style.aspectRatio, String(a));

  const tall = TrackMaps.fitCanvas(fake, 100, 400, monza, true);
  assert.ok(Math.abs(tall.w / tall.h - a) < 0.05,
    "tall-box fit drifted: " + tall.w + "x" + tall.h);
  assert.ok(tall.w <= 100 && tall.h <= 400);

  // A square box must still honour the circuit ratio (letterbox in one axis).
  const sq = TrackMaps.fitCanvas(fake, 300, 300, monza);
  assert.ok(Math.abs(sq.w / sq.h - a) < 0.05);
  assert.ok(sq.w === 300 || sq.h === 300, "should bind one edge of the box");
});

test("fitCanvas never commits a 1px transient during layout convergence", () => {
  const { Tracks, TrackMaps } = loadTrackMaps();
  const bahrain = Tracks.LIST.find((t) => t.id === "bahrain");
  const fake = { width: 0, height: 0, style: {} };
  const fit = TrackMaps.fitCanvas(fake, 0, 0, bahrain, true);
  assert.ok(fit.w > 8 && fit.h > 8, `${fit.w}x${fit.h} is not a useful preview`);
  assert.ok(Math.abs(fit.w / fit.h - TrackMaps.aspect(bahrain)) < 0.05);
});
