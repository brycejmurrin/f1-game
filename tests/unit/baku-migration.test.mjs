import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { absSrc } from "../helpers/abs-src.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const MANIFEST = createRequire(import.meta.url)("../../tools/manifest.cjs");

function loadBaku() {
  const makeMesh = (geo) => ({
    verts: geo?.pos ? geo.pos.length / 3 : 0,
    idxCount: geo?.idx ? geo.idx.length : 0,
  });
  const sandbox = {
    Math, Array, Float32Array, Float64Array, Uint16Array, Uint32Array, Object, JSON, Map, Set,
    isNaN, isFinite, parseInt, parseFloat,
    GLX: { createMesh: makeMesh, createChunkedMesh: makeMesh },
    console: {
      log() {}, warn() {}, error() {}, info() {}, debug() {}, trace() {},
      assert() {}, group() {}, groupEnd() {}, table() {}, dir() {}, count() {},
      time() {}, timeEnd() {},
    },
  };
  sandbox.window = sandbox;
  const context = vm.createContext(sandbox);
  const run = (file) => {
    const source = fs.readFileSync(path.join(ROOT, file), "utf8").replace(/^const\b/gm, "var");
    vm.runInContext(source, context, { filename: absSrc(file) });
  };
  // TRACK_VM from tools/manifest.cjs, with "@circuits" narrowed to Baku only.
  for (const entry of MANIFEST.TRACK_VM) {
    // "@circuits" narrowed to Baku — and its split-out scenery closure, without
    // which the circuit builds bare and every landmark assertion below fails.
    if (entry === "@circuits") { run(MANIFEST.circuitPath("baku")); run(MANIFEST.sceneryPath("baku")); }
    else run(entry);
  }
  return {
    raw: context.TrackDefs.find((definition) => definition.id === "baku"),
    def: context.Tracks.LIST.find((definition) => definition.id === "baku"),
    Tracks: context.Tracks,
  };
}

test("Baku owns its coordinate space and protected scenery sectors", () => {
  const { def } = loadBaku();
  assert.equal(def.sceneryCoordinates, "racing");
  assert.deepEqual(
    Array.from(def.dressingExclusions, (rule) => ({
      kinds: Array.from(rule.kinds || [rule.kind]),
      s0: rule.s0,
      s1: rule.s1,
      side: rule.side,
    })),
    [
      // Curated zones only (eb0b6b3 narrowed the old full-lap city exclusion):
      // Old City / castle section, then the open Caspian side of Neftchilar Ave.
      { kinds: ["city", "foliage", "lighting"], s0: 0.36, s1: 0.56, side: undefined },
      { kinds: ["city", "foliage", "lighting"], s0: 0.58, s1: 0.97, side: -1 },
      // #3340: Neftchilar +1 — theme-dress neonTowers buried night_pass orbit;
      // authored cityFront/towers in scenery/baku.js own that skyline.
      { kinds: ["city"], s0: 0.58, s1: 0.97, side: 1 },
      // Day theme (2026-11-10): street_day's generic city boxes landed inside
      // the authored S/F neon towers (clip-audit 6 m); the S/F straight is the
      // authored skyline's, both sides, across the line.
      { kinds: ["city"], s0: 0.97, s1: 1, side: undefined },
      { kinds: ["city"], s0: 0, s1: 0.07, side: undefined },
    ],
  );
  // The 14 m castle rise is asserted by what it BUILDS (crest height and
  // fraction in the build test below), not by echoing def.elevations back.
});

test("Baku builds finite grounded landmarks, water, and full street boundaries", () => {
  const { def, Tracks } = loadBaku();
  for (const night of [false, true]) {
    const track = Tracks.build(def, { night });
    assert.ok(track.geometryDiagnostics.every((entry) => entry.ok));

    const requiredFailures = [
      ...track.modelDiagnostics.suppressed,
      ...track.modelDiagnostics.invalid,
      ...track.modelDiagnostics.unsafe,
    ].filter((entry) => entry.required);
    assert.deepEqual(requiredFailures, []);

    const emitted = new Set(track.modelDiagnostics.emitted.map((entry) => entry.id));
    assert.ok(emitted.has("baku-flame-towers"));
    assert.ok(emitted.has("baku-maiden-tower"));
    assert.ok(emitted.has("baku-maiden-forecourt"));
    assert.ok([...emitted].some((id) => id.startsWith("baku-caspian-")));

    // The pit complex (TrackPit, the STREET set on +1) opens the driving
    // boundary to its garages across its window — those nodes are the
    // lane's, not loose walls, and stay out of the fraction (as
    // __apex.wallStats' `pitSides` does).
    const pitOwned = (i, side) => !!(track.pit && track.pit.side === side && track.pit.keep[i] > 0);
    const tightFraction = (barriers, side) => {
      let tight = 0, n = 0;
      for (let i = 0; i < track.n; i++) {
        if (pitOwned(i, side)) continue;
        n++;
        if (barriers[i] <= track.hw[i] + 5.5) tight++;
      }
      return tight / n;
    };
    assert.ok(tightFraction(track.barL, -1) > 0.97);
    assert.ok(tightFraction(track.barR, 1) > 0.97);

    let crest = -Infinity, crestFrac = 0;
    for (let i = 0; i < track.n; i++) {
      if (track.py[i] > crest) {
        crest = track.py[i];
        crestFrac = i / track.n;
      }
    }
    assert.ok(crest >= 13.5);
    assert.ok(crestFrac >= 0.44 && crestFrac <= 0.48);

    // The authored castle climb ends before the harbour straight.
    const seafront = [];
    for (let i = Math.ceil(track.n * 0.58); i < Math.floor(track.n * 0.99); i++)
      seafront.push(track.py[i]);
    const range = Math.max(...seafront) - Math.min(...seafront);
    assert.ok(range < 0.05, `Baku seafront elevation varies by ${range.toFixed(3)} m`);
  }
});
