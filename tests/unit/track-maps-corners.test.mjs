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
      for (const id of MANIFEST.CIRCUITS) runFile(MANIFEST.circuitPath(id));
      // …and the split-out scenery closures (LAZY_SCENERY). The .js filter above
      // only sees the top level, so without this every circuit builds BARE —
      // road and terrain, no dressing — and the numbers look plausible enough
      // to trust. That is exactly how cota read 3,988 prop cells instead of
      // 32,897 when float-audit.cjs was missed.
      for (const file of MANIFEST.LAZY_SCENERY) runFile(file);
    } else {
      runFile(entry);
    }
  }
  runFile("js/ui/track-maps.js");
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
    "Curva Grande apex (~0.1288) missing from js/circuits/monza.js turns");
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

// THE ACTIVATION ZONE ACROSS THE LINE. AeroZones.zonesFor starts its straight
// scan at a corner, so the main-straight zone ends past the lap (end > total).
// drsZones clamped `b` to 1 and every drawer clamped its last index to n-1, so
// on 46 of 52 circuits the minimap, the picker map and the HUD strip cut that
// zone off at the start/finish line (Suzuka drew 80 of 704 m).
function withAeroZones() {
  const ctx = loadTrackMaps();
  const src = fs.readFileSync(path.join(ROOT, "js/physics/aero-zones.js"), "utf8").replace(/^const\b/gm, "var");
  vm.runInContext(src, ctx, { filename: "js/physics/aero-zones.js" });
  return ctx;
}

test("a zone across the start/finish line keeps its full length (b > 1)", () => {
  const { TrackMaps, Tracks, AeroZones } = withAeroZones();
  for (const id of ["suzuka", "silverstone", "monza"]) {
    const def = Tracks.LIST.find((d) => d.id === id);
    const tr = Tracks.buildCenterline(def, { line: false });
    const want = AeroZones.zonesFor(tr), got = TrackMaps.drsZones(def);
    assert.equal(got.length, want.length, `${id}: one map zone per race zone`);
    assert.ok(got.some((z) => z.b > 1), `${id}: the main-straight zone crosses the line`);
    got.forEach((z, i) => {
      const lenM = (z.b - z.a) * tr.total;
      assert.ok(Math.abs(lenM - want[i].len) < 1e-6, `${id} zone ${i + 1}: map ${lenM.toFixed(1)} m vs race ${want[i].len.toFixed(1)} m`);
    });
  }
});

test("TrackMaps.draw strokes a crossing zone past the line, wrapping to pts[0]", () => {
  const { TrackMaps, Tracks } = withAeroZones();
  const def = Tracks.LIST.find((d) => d.id === "suzuka");
  const strokes = [];
  let cur = null;
  const g = {
    clearRect() {}, beginPath() { cur = { style: g.strokeStyle, n: 0 }; }, closePath() {},
    moveTo() { cur.n++; }, lineTo() { cur.n++; }, stroke() { strokes.push(cur); },
    arc() {}, fill() {}, fillText() {}, measureText: () => ({ width: 10 }), save() {}, restore() {}, setLineDash() {},
  };
  TrackMaps.draw({ width: 400, height: 300, getContext: () => g }, def, { drs: true, start: false });
  const m = TrackMaps.outline(def).length;
  const zones = TrackMaps.drsZones(def);
  const drawn = strokes.filter((s) => s.style === "rgba(0,220,180,0.85)").map((s) => s.n);
  const want = Array.from(zones, (z) => Math.floor(z.b * m) - Math.floor(z.a * m) + 1);
  assert.deepEqual(drawn, want, "every zone is stroked over its whole index span, wrapping % m");
});

// A custom circuit's id is its content hash, so every saved revision the picker
// drew stayed in the outline cache for the page: it keeps only what Tracks.LIST
// still lists (CustomTracks.sync replaces the custom rows) plus the one drawn.
test("the outline cache drops custom revisions Tracks.LIST no longer lists", () => {
  const { TrackMaps, Tracks } = loadTrackMaps();
  const monza = Tracks.LIST.find((d) => d.id === "monza");
  assert.ok(TrackMaps.outline(monza), "a shipped circuit is cached");
  for (let rev = 0; rev < 20; rev++) {
    for (let i = Tracks.LIST.length - 1; i >= 0; i--) if (Tracks.LIST[i].custom) Tracks.LIST.splice(i, 1);   // CustomTracks.sync
    const def = Object.assign({}, monza, { id: "custom-rev" + rev, custom: true });
    Tracks.LIST.push(def);
    assert.ok(TrackMaps.outline(def), "revision " + rev + " draws");
  }
  assert.deepEqual([...TrackMaps.cachedIds()].sort(), ["custom-rev19", "monza"], "only the listed revision and the shipped circuit");
});
