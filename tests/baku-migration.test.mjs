import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadBaku() {
  const makeMesh = (geo) => ({
    verts: geo?.pos ? geo.pos.length / 3 : 0,
    idxCount: geo?.idx ? geo.idx.length : 0,
  });
  const sandbox = {
    Math, Array, Float32Array, Uint16Array, Uint32Array, Object, JSON, Map, Set,
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
    vm.runInContext(source, context, { filename: file });
  };
  for (const file of [
    "js/circuits.js",
    "js/track-geom.js",
    "js/track-scenery-data.js",
    "js/track-space.js",
    "js/track-surface.js",
    "js/track-models.js",
    "js/circuit-markings.js",
    "js/tracks/baku.js",
    "js/tracks.js",
  ]) run(file);
  return {
    raw: context.TrackDefs.find((definition) => definition.id === "baku"),
    def: context.Tracks.LIST.find((definition) => definition.id === "baku"),
    Tracks: context.Tracks,
  };
}

test("Baku owns its coordinate space and protected scenery sectors", () => {
  const { raw, def } = loadBaku();
  assert.equal(def.sceneryCoordinates, "racing");
  assert.deepEqual(
    Array.from(def.dressingExclusions, (rule) => ({
      kinds: Array.from(rule.kinds || [rule.kind]),
      s0: rule.s0,
      s1: rule.s1,
      side: rule.side,
    })),
    [
      { kinds: ["city"], s0: 0, s1: 1, side: undefined },
      { kinds: ["lamps", "foliage", "floodlights"], s0: 0.36, s1: 0.56, side: undefined },
      { kinds: ["lamps", "foliage", "floodlights"], s0: 0.58, s1: 0.97, side: -1 },
    ],
  );
  assert.deepEqual(
    Array.from(raw.elevations, ({ s, halfM, rise }) => ({ s, halfM, rise })),
    [{ s: 0.46, halfM: 500, rise: 14 }],
  );
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

    const tightFraction = (barriers) => {
      let tight = 0;
      for (let i = 0; i < track.n; i++)
        if (barriers[i] <= track.hw[i] + 5.5) tight++;
      return tight / track.n;
    };
    assert.ok(tightFraction(track.barL) > 0.97);
    assert.ok(tightFraction(track.barR) > 0.97);

    let crest = -Infinity, crestFrac = 0;
    for (let i = 0; i < track.n; i++) {
      if (track.py[i] > crest) {
        crest = track.py[i];
        crestFrac = i / track.n;
      }
    }
    assert.ok(crest >= 13.5);
    assert.ok(crestFrac >= 0.44 && crestFrac <= 0.48);

    const seafront = [];
    for (let i = Math.ceil(track.n * 0.58); i < Math.floor(track.n * 0.99); i++)
      seafront.push(track.py[i]);
    assert.ok(Math.max(...seafront) - Math.min(...seafront) < 0.05);
  }
});
